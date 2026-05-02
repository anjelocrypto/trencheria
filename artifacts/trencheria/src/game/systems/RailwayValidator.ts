/**
 * RailwayValidator — DEV-only world consistency audit.
 *
 * Runs once at module load (gated on import.meta.env.DEV) and prints warnings
 * for railway/road/bridge inconsistencies that suggest the network was drawn
 * randomly rather than planned. Categories:
 *   1. rail-water-no-bridge   — rail crosses river/lake with no RAILWAY_BRIDGE
 *   2. road-water-no-bridge   — road crosses river/lake with no BridgeData bridge
 *   3. rail-near-settlement   — rail centerline too close to a settlement
 *   4. resource-on-rail       — sampled grid finds resources placed on rails
 *   5. rail-road-intersect    — informational; lists every intersection so
 *                                level-crossing decorations can be added
 *
 * Each violation prints exact coordinates and IDs so they can be fixed
 * directly in RailwayData / BridgeData / RegionData.
 */

import {
  LINE_A_WAYPOINTS,
  LINE_B_WAYPOINTS,
  RAILWAY_BRIDGES,
  RailwayBridge,
  LEVEL_CROSSINGS,
  getRailwaySegments,
  distToRailway,
} from '../world/RailwayData';
import { ROADS, SETTLEMENTS } from '../world/RegionData';
import { BRIDGES } from '../world/BridgeData';
import { getLakeHeight, getRiverHeight } from '../world/WaterData';

// Track-aligned angle per rail bridge (matches RailwayBridges.tsx logic).
function getRailBridgeAngle(b: RailwayBridge): number {
  const wps = b.line === 'A' ? LINE_A_WAYPOINTS : LINE_B_WAYPOINTS;
  let bestIdx = 0, bestD = Infinity;
  for (let i = 0; i < wps.length; i++) {
    const dx = wps[i].x - b.position[0];
    const dz = wps[i].z - b.position[2];
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; bestIdx = i; }
  }
  const prev = wps[Math.max(0, bestIdx - 1)];
  const next = wps[Math.min(wps.length - 1, bestIdx + 1)];
  return Math.atan2(next.x - prev.x, next.z - prev.z);
}

const RAIL_BRIDGE_HALF_W = 1.6 + 0.5;

function inRailBridgeOBB(x: number, z: number): RailwayBridge | null {
  for (const b of RAILWAY_BRIDGES) {
    const angle = getRailBridgeAngle(b);
    const cos = Math.cos(-angle), sin = Math.sin(-angle);
    const dx = x - b.position[0], dz = z - b.position[2];
    const lx = cos * dx + sin * dz;
    const lz = -sin * dx + cos * dz;
    if (Math.abs(lx) <= RAIL_BRIDGE_HALF_W && Math.abs(lz) <= b.length / 2) {
      return b;
    }
  }
  return null;
}

function inRoadBridgeOBB(x: number, z: number): typeof BRIDGES[number] | null {
  for (const b of BRIDGES) {
    const cos = Math.cos(-b.rotation), sin = Math.sin(-b.rotation);
    const dx = x - b.position[0], dz = z - b.position[2];
    const lx = cos * dx + sin * dz;
    const lz = -sin * dx + cos * dz;
    if (Math.abs(lx) <= b.width / 2 + 1 && Math.abs(lz) <= b.length / 2 + 2) {
      return b;
    }
  }
  return null;
}

function isInWater(x: number, z: number): 'river' | 'lake' | null {
  if (getLakeHeight(x, z) !== null) return 'lake';
  if (getRiverHeight(x, z) !== null) return 'river';
  return null;
}

interface SegIntersect { x: number; z: number; }

function segSegIntersect(
  ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number, dx: number, dz: number,
): SegIntersect | null {
  const r1x = bx - ax, r1z = bz - az;
  const r2x = dx - cx, r2z = dz - cz;
  const denom = r1x * r2z - r1z * r2x;
  if (Math.abs(denom) < 1e-6) return null;
  const t = ((cx - ax) * r2z - (cz - az) * r2x) / denom;
  const u = ((cx - ax) * r1z - (cz - az) * r1x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: ax + t * r1x, z: az + t * r1z };
}

function fmt(n: number, p = 1): string {
  return n.toFixed(p);
}

interface Issue {
  category: string;
  detail: string;
}

export function runRailwayWorldAudit(): void {
  const issues: Issue[] = [];

  // ============================================================
  // 1. Rail crossing water without rail bridge
  // ============================================================
  const segs = getRailwaySegments();
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const len = Math.sqrt(seg.len2);
    const steps = Math.max(2, Math.ceil(len / 1.5));
    // Codex audit fix: scan FULL segment and report any water sample not
    // covered by a bridge OBB. Old "break on first bridged" logic produced
    // false negatives when a segment re-entered water after exiting a bridge.
    let firstUnbridged: { x: number; z: number; kind: 'river' | 'lake' } | null = null;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = seg.ax + (seg.bx - seg.ax) * t;
      const z = seg.az + (seg.bz - seg.az) * t;
      const w = isInWater(x, z);
      if (w && !inRailBridgeOBB(x, z)) {
        if (!firstUnbridged) firstUnbridged = { x, z, kind: w };
      }
    }
    if (firstUnbridged) {
      issues.push({
        category: 'rail-water-no-bridge',
        detail: `seg [${fmt(seg.ax, 0)},${fmt(seg.az, 0)}]→[${fmt(seg.bx, 0)},${fmt(seg.bz, 0)}] crosses ${firstUnbridged.kind} at (${fmt(firstUnbridged.x)},${fmt(firstUnbridged.z)})`,
      });
    }
  }

  // ============================================================
  // 2. Road crossing water without road bridge
  // ============================================================
  for (const road of ROADS) {
    const dx = road.to[0] - road.from[0];
    const dz = road.to[1] - road.from[1];
    const len = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.max(2, Math.ceil(len / 2));
    // Same full-segment scan as rail check (no break on first bridged sample).
    let firstUnbridged: { x: number; z: number; kind: 'river' | 'lake' } | null = null;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = road.from[0] + dx * t;
      const z = road.from[1] + dz * t;
      const w = isInWater(x, z);
      if (w && !inRoadBridgeOBB(x, z)) {
        if (!firstUnbridged) firstUnbridged = { x, z, kind: w };
      }
    }
    if (firstUnbridged) {
      issues.push({
        category: 'road-water-no-bridge',
        detail: `road [${road.from[0]},${road.from[1]}]→[${road.to[0]},${road.to[1]}] crosses ${firstUnbridged.kind} at (${fmt(firstUnbridged.x)},${fmt(firstUnbridged.z)})`,
      });
    }
  }

  // ============================================================
  // 3. Rail too close to settlement
  // ============================================================
  for (const s of SETTLEMENTS) {
    const buf = s.size === 'large' ? 32 : s.size === 'medium' ? 22 : 16;
    const d = distToRailway(s.position[0], s.position[1], buf + 4);
    if (d !== null && d < buf) {
      issues.push({
        category: 'rail-near-settlement',
        detail: `${s.id} (${s.size}) at [${s.position[0]},${s.position[1]}] is ${fmt(d)}u from rail (need ≥${buf}u)`,
      });
    }
  }

  // ============================================================
  // 4. Rail/road intersections — informational, list for level-crossing decoration
  // ============================================================
  const intersections: Array<{ x: number; z: number; road: string; railIdx: number }> = [];
  for (let r = 0; r < ROADS.length; r++) {
    const road = ROADS[r];
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const p = segSegIntersect(
        seg.ax, seg.az, seg.bx, seg.bz,
        road.from[0], road.from[1], road.to[0], road.to[1],
      );
      if (p) {
        intersections.push({
          x: p.x, z: p.z,
          road: `[${road.from[0]},${road.from[1]}]→[${road.to[0]},${road.to[1]}]`,
          railIdx: i,
        });
      }
    }
  }

  // ============================================================
  // 5. Every rail × road intersection should have a LEVEL_CROSSING entry
  // ============================================================
  const missingCrossings: typeof intersections = [];
  for (const ix of intersections) {
    const matched = LEVEL_CROSSINGS.find(
      (lc) => Math.hypot(lc.position[0] - ix.x, lc.position[1] - ix.z) < 6,
    );
    if (!matched) missingCrossings.push(ix);
  }
  for (const m of missingCrossings) {
    issues.push({
      category: 'rail-road-no-level-crossing',
      detail: `intersection (${fmt(m.x)},${fmt(m.z)}) seg #${m.railIdx} × road ${m.road} has no LEVEL_CROSSING`,
    });
  }

  // ============================================================
  // Output
  // ============================================================
  if (issues.length === 0) {
    console.log(`[RailwayValidator] ✓ No rail/road/bridge violations. ${intersections.length} rail/road intersection(s), all decorated.`);
  } else {
    console.warn(`[RailwayValidator] ${issues.length} world-map violation(s):`);
    for (const it of issues) {
      console.warn(`  • [${it.category}] ${it.detail}`);
    }
  }
  if (intersections.length > 0) {
    console.log(`[RailwayValidator] Rail × Road intersections (${intersections.length}):`);
    for (const x of intersections) {
      console.log(`  • (${fmt(x.x)},${fmt(x.z)})  rail seg #${x.railIdx}  ×  road ${x.road}`);
    }
  }
}

if (import.meta.env.DEV) {
  // Defer one tick so the railway data caches finish lazy-init before audit.
  setTimeout(runRailwayWorldAudit, 0);
}
