import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { LINE_A_WAYPOINTS, LINE_B_WAYPOINTS, RAILWAY_STATIONS } from '@/game/world/RailwayData';
import { rebuildObstacles, getBoxObstacles, getCircleObstacles } from '@/game/systems/CollisionSystem';
import { BRIDGES } from '@/game/world/BridgeData';
import { SMALL_POIS } from '@/game/world/RegionData';

const CLEARANCE = 15;

interface Segment {
  line: 'A' | 'B';
  index: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

interface AuditViolation {
  line: 'A' | 'B';
  segmentIndex: number;
  segment: string;
  from: [number, number];
  to: [number, number];
  obstacleId: string;
  obstacleType: string;
  obstacleCenter: [number, number];
  obstacleShape: string;
  minDistance: number;
  failReason: string;
}

const poiTypeById = new Map(SMALL_POIS.map((p) => [p.id, p.type]));

function classifyObstacle(id: string): { type: string; failReason: string; severity: 'critical' | 'major' | 'minor' } {
  if (id.includes('-wall-') || id.includes('-tower-') || id.includes('-gate-') || id.includes('-pal-')) {
    return {
      type: 'wall/fortification',
      failReason: 'inside wall zone or too close to fortification',
      severity: 'critical',
    };
  }

  if (id.includes('-house-') || id.startsWith('town-') || id.startsWith('wild-')) {
    return {
      type: 'building/house footprint',
      failReason: 'inside house/building footprint or too close',
      severity: 'critical',
    };
  }

  if (
    id.includes('-hall') || id.includes('-keep') || id.includes('-citadel') || id.includes('-barracks') ||
    id.includes('-cmd') || id.includes('-mine') || id.includes('-nave') || id.includes('-wing') ||
    id.includes('-altar') || id.includes('-ruin-') || id.includes('-armory') || id.includes('-shed') || id.includes('-main')
  ) {
    return {
      type: 'major settlement structure',
      failReason: 'inside major settlement structure footprint or too close',
      severity: 'critical',
    };
  }

  if (id.startsWith('world-bridge-') || id.startsWith('bridge-')) {
    return {
      type: 'bridge deck/approach',
      failReason: 'too close to bridge structure/approach',
      severity: 'major',
    };
  }

  if (id.startsWith('poi-')) {
    const poiId = id.replace('poi-', '');
    const poiType = poiTypeById.get(poiId);

    if (poiType === 'inn' || poiType === 'supply_depot' || poiType === 'ruined_house' || poiType === 'wagon') {
      return {
        type: `poi-${poiType}`,
        failReason: 'inside or too close to POI structure footprint',
        severity: 'major',
      };
    }

    if (poiType === 'watchtower' || poiType === 'cave' || poiType === 'hunter_camp' || poiType === 'stone_circle') {
      return {
        type: `poi-${poiType}`,
        failReason: 'too close to large POI collision zone',
        severity: 'major',
      };
    }

    return {
      type: `poi-${poiType ?? 'unknown'}`,
      failReason: 'too close to minor POI marker',
      severity: 'minor',
    };
  }

  return {
    type: 'structure',
    failReason: 'too close to rendered/collision structure',
    severity: 'major',
  };
}

function pointToAabbDist(px: number, pz: number, minX: number, maxX: number, minZ: number, maxZ: number): number {
  const dx = px < minX ? minX - px : px > maxX ? px - maxX : 0;
  const dz = pz < minZ ? minZ - pz : pz > maxZ ? pz - maxZ : 0;
  return Math.hypot(dx, dz);
}

function pointToSegmentDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz;
  if (len2 < 1e-9) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / len2));
  const qx = ax + vx * t;
  const qz = az + vz * t;
  return Math.hypot(px - qx, pz - qz);
}

function segSegDist(
  ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number, dx: number, dz: number,
): number {
  const samples = [0, 0.25, 0.5, 0.75, 1];
  let best = Infinity;

  for (const t of samples) {
    const px = ax + (bx - ax) * t;
    const pz = az + (bz - az) * t;
    best = Math.min(best, pointToSegmentDist(px, pz, cx, cz, dx, dz));
  }
  for (const t of samples) {
    const px = cx + (dx - cx) * t;
    const pz = cz + (dz - cz) * t;
    best = Math.min(best, pointToSegmentDist(px, pz, ax, az, bx, bz));
  }

  return best;
}

function segmentIntersectsAabb(ax: number, az: number, bx: number, bz: number, minX: number, maxX: number, minZ: number, maxZ: number): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;

  const checks: [number, number][] = [
    [-dx, ax - minX],
    [dx, maxX - ax],
    [-dz, az - minZ],
    [dz, maxZ - az],
  ];

  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return true;
}

function segmentToRotBoxDist(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  halfW: number,
  halfD: number,
  rotation: number,
): number {
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);

  const lax = cos * (ax - cx) + sin * (az - cz);
  const laz = -sin * (ax - cx) + cos * (az - cz);
  const lbx = cos * (bx - cx) + sin * (bz - cz);
  const lbz = -sin * (bx - cx) + cos * (bz - cz);

  const minX = -halfW;
  const maxX = halfW;
  const minZ = -halfD;
  const maxZ = halfD;

  if (segmentIntersectsAabb(lax, laz, lbx, lbz, minX, maxX, minZ, maxZ)) return 0;

  let best = Infinity;
  best = Math.min(best, pointToAabbDist(lax, laz, minX, maxX, minZ, maxZ));
  best = Math.min(best, pointToAabbDist(lbx, lbz, minX, maxX, minZ, maxZ));

  const edges: Array<[number, number, number, number]> = [
    [minX, minZ, maxX, minZ],
    [maxX, minZ, maxX, maxZ],
    [maxX, maxZ, minX, maxZ],
    [minX, maxZ, minX, minZ],
  ];

  for (const [ex1, ez1, ex2, ez2] of edges) {
    best = Math.min(best, segSegDist(lax, laz, lbx, lbz, ex1, ez1, ex2, ez2));
  }

  return best;
}

function buildSegments(): Segment[] {
  const segs: Segment[] = [];
  const add = (line: 'A' | 'B', wps: typeof LINE_A_WAYPOINTS) => {
    for (let i = 0; i < wps.length - 1; i++) {
      segs.push({
        line,
        index: i,
        ax: wps[i].x,
        az: wps[i].z,
        bx: wps[i + 1].x,
        bz: wps[i + 1].z,
      });
    }
  };
  add('A', LINE_A_WAYPOINTS);
  add('B', LINE_B_WAYPOINTS);
  return segs;
}

describe('railway strict route intrusion audit', () => {
  it('reports every segment under 15u clearance from rendered/collision structures', () => {
    rebuildObstacles([], [], [], null);

    const circles = getCircleObstacles().map((c) => ({ ...c }));
    const boxes = getBoxObstacles().map((b) => ({ ...b }));

    for (const b of BRIDGES) {
      boxes.push({
        cx: b.position[0],
        cz: b.position[2],
        halfW: b.width / 2,
        halfD: b.length / 2,
        rotation: b.rotation,
        id: `world-bridge-${b.id}`,
      });
    }

    const violations: AuditViolation[] = [];
    const segments = buildSegments();

    for (const seg of segments) {
      let worst: AuditViolation | null = null;

      for (const c of circles) {
        const centerDist = pointToSegmentDist(c.x, c.z, seg.ax, seg.az, seg.bx, seg.bz);
        const surfaceDist = centerDist - c.radius;
        if (surfaceDist < CLEARANCE) {
          const cls = classifyObstacle(c.id);
          const v: AuditViolation = {
            line: seg.line,
            segmentIndex: seg.index,
            segment: `${seg.index}: [${seg.ax}, ${seg.az}] -> [${seg.bx}, ${seg.bz}]`,
            from: [seg.ax, seg.az],
            to: [seg.bx, seg.bz],
            obstacleId: c.id,
            obstacleType: cls.type,
            obstacleCenter: [c.x, c.z],
            obstacleShape: `circle:r=${c.radius}`,
            minDistance: Number(surfaceDist.toFixed(2)),
            failReason: cls.failReason,
          };
          if (!worst || v.minDistance < worst.minDistance) worst = v;
        }
      }

      for (const b of boxes) {
        const surfaceDist = segmentToRotBoxDist(seg.ax, seg.az, seg.bx, seg.bz, b.cx, b.cz, b.halfW, b.halfD, b.rotation);
        if (surfaceDist < CLEARANCE) {
          const cls = classifyObstacle(b.id);
          const v: AuditViolation = {
            line: seg.line,
            segmentIndex: seg.index,
            segment: `${seg.index}: [${seg.ax}, ${seg.az}] -> [${seg.bx}, ${seg.bz}]`,
            from: [seg.ax, seg.az],
            to: [seg.bx, seg.bz],
            obstacleId: b.id,
            obstacleType: cls.type,
            obstacleCenter: [b.cx, b.cz],
            obstacleShape: `box:halfW=${b.halfW},halfD=${b.halfD},rot=${b.rotation}`,
            minDistance: Number(surfaceDist.toFixed(2)),
            failReason: cls.failReason,
          };
          if (!worst || v.minDistance < worst.minDistance) worst = v;
        }
      }

      if (worst) violations.push(worst);
    }

    const stationViolations = RAILWAY_STATIONS.flatMap((s) => {
      const [sx, sz] = s.position;
      const found: Array<{ station: string; obstacleId: string; obstacleType: string; minDistance: number }> = [];

      for (const c of circles) {
        const d = Math.hypot(sx - c.x, sz - c.z) - c.radius;
        if (d < CLEARANCE) {
          const cls = classifyObstacle(c.id);
          found.push({ station: s.name, obstacleId: c.id, obstacleType: cls.type, minDistance: Number(d.toFixed(2)) });
        }
      }
      for (const b of boxes) {
        const d = segmentToRotBoxDist(sx, sz, sx, sz, b.cx, b.cz, b.halfW, b.halfD, b.rotation);
        if (d < CLEARANCE) {
          const cls = classifyObstacle(b.id);
          found.push({ station: s.name, obstacleId: b.id, obstacleType: cls.type, minDistance: Number(d.toFixed(2)) });
        }
      }
      return found;
    });

    const sorted = [...violations].sort((a, b) => a.minDistance - b.minDistance || a.line.localeCompare(b.line));
    const criticalOrMajor = sorted.filter((v) => {
      const c = classifyObstacle(v.obstacleId);
      return c.severity !== 'minor';
    });

    const output = {
      clearance: CLEARANCE,
      totalViolations: sorted.length,
      criticalOrMajorCount: criticalOrMajor.length,
      violations: sorted,
      criticalOrMajorViolations: criticalOrMajor,
      stationViolations: stationViolations.sort((a, b) => a.minDistance - b.minDistance),
    };

    writeFileSync('railway-audit-output.json', JSON.stringify(output, null, 2));
    console.log(`\n[railway-audit] wrote railway-audit-output.json with ${sorted.length} violations (${criticalOrMajor.length} critical/major)`);

    expect(Array.isArray(violations)).toBe(true);
  });
});
