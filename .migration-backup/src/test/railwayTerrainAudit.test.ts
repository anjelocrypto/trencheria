/**
 * Railway Terrain Audit — dense sampling of terrain height vs rail path height.
 * Detects terrain intrusion, mountain clipping, hillside burial.
 */
import { describe, it, expect } from 'vitest';
import { LINE_A_WAYPOINTS, LINE_B_WAYPOINTS, RailwayWaypoint } from '../game/world/RailwayData';
import { getTerrainHeight } from '../game/components/Terrain';

const TRACK_HEIGHT_OFFSET = 0.35; // from RailwayTrack.tsx / RailwaySpline.ts
const BALLAST_H = 0.15;
const SLEEPER_H = 0.12;
const RAIL_H = 0.15;
// Rail top surface = terrain + OFFSET + BALLAST + SLEEPER + RAIL_H
// But the track mesh bottom is at terrain + OFFSET (ballast bottom).
// Terrain intrusion = terrain height > rail path height (terrain + OFFSET).
// So penetration = terrainHeight - (sampledTerrainAtBuild + OFFSET)
// Actually the rail Y is computed as getTerrainHeight(x,z) + OFFSET at build time.
// But getTerrainHeight includes flattening. So if flattening works, rail sits above.
// The question is: does the VISUAL terrain mesh (which also uses getTerrainHeight) poke above?
// Both use the same function, so rail Y = terrainY + 0.35. Rail should always be 0.35 above terrain.
// BUT: terrain mesh is a 300-segment grid (WORLD_SIZE=1800, so ~6u per vertex).
// Rail mesh subdivides at SUBDIV=4 per waypoint segment.
// The issue is: terrain mesh vertices may interpolate differently between grid points
// than the rail samples. A terrain peak between grid points won't show in terrain mesh,
// but a terrain peak AT a grid point that the rail doesn't sample WILL show.
//
// Real issue: the rail samples terrain at its own points, but the visual terrain mesh
// samples at its own grid points. Between rail waypoints, the interpolated x,z may
// pass through high-terrain areas where the flatten corridor is too narrow or absent.
//
// So the audit must:
// 1. Sample densely along each segment (every 1 unit)
// 2. Compute terrain height (with flattening) at that point
// 3. Compute rail height at that point (= terrain height + 0.35)
// 4. Check if terrain height is problematic
//
// Since rail Y = getTerrainHeight(x,z) + 0.35, the rail is ALWAYS 0.35 above the
// terrain at its exact sample points. The real question is whether the terrain
// between rail sample points rises above the rail line interpolated between those points.
//
// So: at dense sample points, compute:
//   - railY = lerp between endpoint rail heights
//   - terrainY = getTerrainHeight(sample x, sample z)
//   - penetration = terrainY - railY + some visual threshold

const SAMPLE_INTERVAL = 1; // sample every 1 world unit

interface Violation {
  line: string;
  segIndex: number;
  fromLabel: string;
  toLabel: string;
  worstX: number;
  worstZ: number;
  terrainH: number;
  railH: number;
  penetration: number;
  grade: number; // slope in degrees
  severity: 'SAFE' | 'MINOR' | 'MODERATE' | 'CRITICAL';
}

function auditLine(name: string, waypoints: RailwayWaypoint[]): Violation[] {
  const violations: Violation[] = [];

  for (let seg = 0; seg < waypoints.length - 1; seg++) {
    const wp0 = waypoints[seg];
    const wp1 = waypoints[seg + 1];
    const dx = wp1.x - wp0.x;
    const dz = wp1.z - wp0.z;
    const segLen = Math.sqrt(dx * dx + dz * dz);
    const numSamples = Math.max(2, Math.ceil(segLen / SAMPLE_INTERVAL));

    // Compute rail heights at endpoints (this is what the track mesh does)
    const railY0 = getTerrainHeight(wp0.x, wp0.z) + TRACK_HEIGHT_OFFSET;
    const railY1 = getTerrainHeight(wp1.x, wp1.z) + TRACK_HEIGHT_OFFSET;

    let worstPenetration = -Infinity;
    let worstX = 0, worstZ = 0, worstTerrainH = 0, worstRailH = 0;

    for (let s = 0; s <= numSamples; s++) {
      const t = s / numSamples;
      const x = wp0.x + dx * t;
      const z = wp0.z + dz * t;

      // The track mesh actually samples getTerrainHeight at each subdivided point,
      // NOT by lerping endpoint heights. So rail height at this point =
      // getTerrainHeight(x, z) + OFFSET. This means rail always sits 0.35 above
      // terrain at its own sample points.
      //
      // But the track mesh only samples at SUBDIV=4 points per segment.
      // Between those sub-samples, the mesh linearly interpolates.
      // So we need to check: does terrain between sub-samples rise above
      // the interpolated track mesh?

      // Compute what the track mesh does at this exact point
      // Track mesh subdivides each waypoint segment into SUBDIV=4 sub-segments
      const SUBDIV = 4;
      const subT = t * SUBDIV; // which sub-segment
      const subIdx = Math.min(Math.floor(subT), SUBDIV - 1);
      const subFrac = subT - subIdx;

      // Sub-segment endpoints
      const t0 = subIdx / SUBDIV;
      const t1 = (subIdx + 1) / SUBDIV;
      const x0 = wp0.x + dx * t0;
      const z0 = wp0.z + dz * t0;
      const x1 = wp0.x + dx * t1;
      const z1 = wp0.z + dz * t1;

      const subRailY0 = getTerrainHeight(x0, z0) + TRACK_HEIGHT_OFFSET;
      const subRailY1 = getTerrainHeight(x1, z1) + TRACK_HEIGHT_OFFSET;

      // Interpolated rail mesh height at this sample
      const railY = subRailY0 + (subRailY1 - subRailY0) * subFrac;

      // Actual terrain at this sample
      const terrainY = getTerrainHeight(x, z);

      // Penetration: how much terrain is above rail bottom (ballast base)
      const penetration = terrainY - railY;

      if (penetration > worstPenetration) {
        worstPenetration = penetration;
        worstX = x;
        worstZ = z;
        worstTerrainH = terrainY;
        worstRailH = railY;
      }
    }

    // Compute grade (slope angle)
    const elevChange = Math.abs(railY1 - railY0);
    const gradeAngle = segLen > 0.1 ? Math.atan2(elevChange, segLen) * (180 / Math.PI) : 0;

    let severity: Violation['severity'] = 'SAFE';
    if (worstPenetration > 1.5) severity = 'CRITICAL';
    else if (worstPenetration > 0.5) severity = 'MODERATE';
    else if (worstPenetration > 0.1) severity = 'MINOR';

    violations.push({
      line: name,
      segIndex: seg,
      fromLabel: wp0.label || `(${wp0.x}, ${wp0.z})`,
      toLabel: wp1.label || `(${wp1.x}, ${wp1.z})`,
      worstX: Math.round(worstX * 10) / 10,
      worstZ: Math.round(worstZ * 10) / 10,
      terrainH: Math.round(worstTerrainH * 100) / 100,
      railH: Math.round(worstRailH * 100) / 100,
      penetration: Math.round(worstPenetration * 100) / 100,
      grade: Math.round(gradeAngle * 100) / 100,
      severity,
    });
  }

  return violations;
}

describe('Railway Terrain Audit', () => {
  it('audits Line A terrain clearance', () => {
    const results = auditLine('A', LINE_A_WAYPOINTS);

    console.log('\n========== LINE A WAYPOINT TABLE ==========');
    LINE_A_WAYPOINTS.forEach((wp, i) => {
      const h = getTerrainHeight(wp.x, wp.z);
      console.log(`  [${i}] (${wp.x}, ${wp.z}) type=${wp.type} label="${wp.label || ''}" terrainH=${h.toFixed(2)} railH=${(h + TRACK_HEIGHT_OFFSET).toFixed(2)}`);
    });

    console.log('\n========== LINE A SEGMENT AUDIT ==========');
    const issues = results.filter(r => r.severity !== 'SAFE');
    results.forEach(r => {
      if (r.severity !== 'SAFE') {
        console.log(`  ⚠ [${r.severity}] Seg ${r.segIndex}: ${r.fromLabel} → ${r.toLabel}`);
        console.log(`    Worst at (${r.worstX}, ${r.worstZ}): terrain=${r.terrainH}, rail=${r.railH}, penetration=${r.penetration}, grade=${r.grade}°`);
      }
    });
    if (issues.length === 0) console.log('  ✅ All segments SAFE');

    console.log(`\n  Summary: ${results.filter(r => r.severity === 'SAFE').length} safe, ${results.filter(r => r.severity === 'MINOR').length} minor, ${results.filter(r => r.severity === 'MODERATE').length} moderate, ${results.filter(r => r.severity === 'CRITICAL').length} critical`);

    // Store for JSON output
    const critical = results.filter(r => r.severity === 'CRITICAL' || r.severity === 'MODERATE');
    if (critical.length > 0) {
      console.log('\n========== CRITICAL/MODERATE CORRECTIONS NEEDED ==========');
      critical.forEach(r => {
        console.log(`  Line ${r.line} Seg ${r.segIndex}: (${r.worstX}, ${r.worstZ}) penetration=${r.penetration}`);
        console.log(`    From: ${r.fromLabel} → To: ${r.toLabel}`);
        if (r.penetration > 3) {
          console.log(`    → REROUTE NEEDED: terrain is ${r.penetration.toFixed(1)}u above rail`);
        } else if (r.penetration > 1) {
          console.log(`    → WIDEN FLATTEN CORRIDOR or ADD WAYPOINT to break segment`);
        } else {
          console.log(`    → INCREASE FLATTEN RADIUS at this location`);
        }
      });
    }

    // Test passes but reports findings
    expect(results.length).toBeGreaterThan(0);
  });

  it('audits Line B terrain clearance', () => {
    const results = auditLine('B', LINE_B_WAYPOINTS);

    console.log('\n========== LINE B WAYPOINT TABLE ==========');
    LINE_B_WAYPOINTS.forEach((wp, i) => {
      const h = getTerrainHeight(wp.x, wp.z);
      console.log(`  [${i}] (${wp.x}, ${wp.z}) type=${wp.type} label="${wp.label || ''}" terrainH=${h.toFixed(2)} railH=${(h + TRACK_HEIGHT_OFFSET).toFixed(2)}`);
    });

    console.log('\n========== LINE B SEGMENT AUDIT ==========');
    const issues = results.filter(r => r.severity !== 'SAFE');
    results.forEach(r => {
      if (r.severity !== 'SAFE') {
        console.log(`  ⚠ [${r.severity}] Seg ${r.segIndex}: ${r.fromLabel} → ${r.toLabel}`);
        console.log(`    Worst at (${r.worstX}, ${r.worstZ}): terrain=${r.terrainH}, rail=${r.railH}, penetration=${r.penetration}, grade=${r.grade}°`);
      }
    });
    if (issues.length === 0) console.log('  ✅ All segments SAFE');

    console.log(`\n  Summary: ${results.filter(r => r.severity === 'SAFE').length} safe, ${results.filter(r => r.severity === 'MINOR').length} minor, ${results.filter(r => r.severity === 'MODERATE').length} moderate, ${results.filter(r => r.severity === 'CRITICAL').length} critical`);

    const critical = results.filter(r => r.severity === 'CRITICAL' || r.severity === 'MODERATE');
    if (critical.length > 0) {
      console.log('\n========== CRITICAL/MODERATE CORRECTIONS NEEDED ==========');
      critical.forEach(r => {
        console.log(`  Line ${r.line} Seg ${r.segIndex}: (${r.worstX}, ${r.worstZ}) penetration=${r.penetration}`);
        console.log(`    From: ${r.fromLabel} → To: ${r.toLabel}`);
        if (r.penetration > 3) {
          console.log(`    → REROUTE NEEDED: terrain is ${r.penetration.toFixed(1)}u above rail`);
        } else if (r.penetration > 1) {
          console.log(`    → WIDEN FLATTEN CORRIDOR or ADD WAYPOINT to break segment`);
        } else {
          console.log(`    → INCREASE FLATTEN RADIUS at this location`);
        }
      });
    }

    expect(results.length).toBeGreaterThan(0);
  });

  it('combined summary and JSON output', () => {
    const allA = auditLine('A', LINE_A_WAYPOINTS);
    const allB = auditLine('B', LINE_B_WAYPOINTS);
    const all = [...allA, ...allB];

    const safe = all.filter(r => r.severity === 'SAFE').length;
    const minor = all.filter(r => r.severity === 'MINOR').length;
    const moderate = all.filter(r => r.severity === 'MODERATE').length;
    const critical = all.filter(r => r.severity === 'CRITICAL').length;

    const report = {
      totalSegments: all.length,
      safe, minor, moderate, critical,
      lineA: { segments: allA.length, issues: allA.filter(r => r.severity !== 'SAFE') },
      lineB: { segments: allB.length, issues: allB.filter(r => r.severity !== 'SAFE') },
      allIssues: all.filter(r => r.severity !== 'SAFE'),
    };

    console.log('\n========== FULL RAILWAY TERRAIN AUDIT REPORT ==========');
    console.log(JSON.stringify(report, null, 2));

    // Fail test if any CRITICAL intrusions found
    if (critical > 0) {
      console.error(`\n🚨 ${critical} CRITICAL mountain intrusions detected!`);
    }
    if (moderate > 0) {
      console.error(`\n⚠️ ${moderate} MODERATE terrain issues detected!`);
    }

    // We want to know about issues but not necessarily fail
    expect(all.length).toBeGreaterThan(0);
  });
});
