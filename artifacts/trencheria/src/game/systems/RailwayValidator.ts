/**
 * RailwayValidator — DEV-only world consistency audit.
 *
 * Runs once at module load (gated on import.meta.env.DEV) and prints warnings
 * for railway/road/bridge inconsistencies that suggest the network was drawn
 * randomly rather than planned. Categories:
 *   1. rail-water-no-bridge       — rail crosses river/lake with no RAILWAY_BRIDGE
 *   2. road-water-no-bridge       — road crosses river/lake with no BridgeData bridge
 *   3. rail-near-settlement       — rail centerline cuts through a settlement
 *   4. rail-road-no-level-crossing — rail × road intersection lacks decoration
 *   5. station-footprint          — station platform sits on water, road, rail, or steep ground
 *   6. resource-on-rail           — generated tree/rock/bush/crate inside rail clearance
 *   7. wilderness-on-rail         — wilderness building inside rail clearance
 *
 * Each violation prints exact coordinates and IDs so they can be fixed
 * directly in RailwayData / BridgeData / RegionData / WorldResources.
 */

import {
  LINE_A_WAYPOINTS,
  LINE_B_WAYPOINTS,
  RAILWAY_BRIDGES,
  RAILWAY_STATIONS,
  RailwayBridge,
  RailwayStation,
  LEVEL_CROSSINGS,
  STATION_DIMS,
  getRailwaySegments,
  distToRailway,
} from '../world/RailwayData';
import { ROADS, SETTLEMENTS } from '../world/RegionData';
import { BRIDGES } from '../world/BridgeData';
import { getLakeHeight, getRiverHeight } from '../world/WaterData';
import { sampleFootprint } from './Grounding';
import { WILDERNESS_BUILDINGS } from '../components/WildernessStructures';
import { generateWorldResources } from './WorldResources';

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

// Same nearest-pair lookup used for stations.
function getTrackAngleAt(line: 'A' | 'B' | 'AB', x: number, z: number): number {
  const wps = line === 'B' ? LINE_B_WAYPOINTS : LINE_A_WAYPOINTS;
  let bestIdx = 0, bestD = Infinity;
  for (let i = 0; i < wps.length; i++) {
    const dx = wps[i].x - x;
    const dz = wps[i].z - z;
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

// Distance from point (x,z) to nearest road centerline; returns null if > maxDist.
function distToRoad(x: number, z: number, maxDist: number): { dist: number; halfWidth: number } | null {
  let best = maxDist + 1;
  let halfWidth = 0;
  for (const road of ROADS) {
    const dx = road.to[0] - road.from[0];
    const dz = road.to[1] - road.from[1];
    const len2 = dx * dx + dz * dz;
    if (len2 < 1) continue;
    const t = Math.max(0, Math.min(1, ((x - road.from[0]) * dx + (z - road.from[1]) * dz) / len2));
    const px = road.from[0] + t * dx;
    const pz = road.from[1] + t * dz;
    const ex = x - px, ez = z - pz;
    const d = Math.sqrt(ex * ex + ez * ez);
    if (d < best) { best = d; halfWidth = road.width / 2; }
  }
  return best <= maxDist ? { dist: best, halfWidth } : null;
}

// Station-platform layout: matches RailwayStations.tsx render placement so
// the validator inspects the SAME footprint the renderer paints.
interface StationLayout {
  cx: number;
  cz: number;
  halfW: number;
  halfL: number;
  rotation: number;
}

function getStationLayout(station: RailwayStation): StationLayout {
  const [sx, sz] = station.position;
  if (station.line === 'AB') {
    // Ironhold Central — custom 12×20 platform along shared east-west corridor.
    const trackHeading = Math.atan2(
      (30 - (-40) + 45 - (-40)) / 2,
      (108 - 95 + 80 - 83) / 2,
    );
    return { cx: sx, cz: sz, halfW: 6, halfL: 10, rotation: trackHeading };
  }
  const dims = STATION_DIMS[station.stationType] || STATION_DIMS.small;
  const rotation = getTrackAngleAt(station.line, sx, sz);
  const sideAngle = rotation + Math.PI / 2;
  const sideDir = station.side === 'south' || station.side === 'west' ? -1 : 1;
  const offset = dims.platW / 2 + 2.5;
  const ox = Math.sin(sideAngle) * offset * sideDir;
  const oz = Math.cos(sideAngle) * offset * sideDir;
  return {
    cx: sx + ox,
    cz: sz + oz,
    halfW: dims.platW / 2,
    halfL: dims.platL / 2,
    rotation,
  };
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
  // 3. Rail too close to settlement (footprint clearance, not just center)
  // ============================================================
  // Earlier versions only measured rail distance from the settlement CENTER.
  // Now we also walk the footprint perimeter so a rail that grazes the side
  // of the disc is caught even when the center clearance is fine.
  const PERIMETER_SAMPLES = 12;
  const PERIMETER_MARGIN = 2; // rail must stay at least 2u outside footprint edge
  for (const s of SETTLEMENTS) {
    const footprintR = s.size === 'large' ? 32 : s.size === 'medium' ? 22 : 16;
    const dCenter = distToRailway(s.position[0], s.position[1], footprintR + 4);
    if (dCenter !== null && dCenter < footprintR) {
      issues.push({
        category: 'rail-near-settlement',
        detail: `${s.id} (${s.size}) at [${s.position[0]},${s.position[1]}] is ${fmt(dCenter)}u from rail (need ≥${footprintR}u)`,
      });
      continue; // primary failure already covers perimeter contact
    }
    let worst: { x: number; z: number; d: number } | null = null;
    for (let i = 0; i < PERIMETER_SAMPLES; i++) {
      const a = (i / PERIMETER_SAMPLES) * Math.PI * 2;
      const sx = s.position[0] + Math.cos(a) * footprintR;
      const sz = s.position[1] + Math.sin(a) * footprintR;
      const d = distToRailway(sx, sz, PERIMETER_MARGIN + 2);
      if (d !== null && d < PERIMETER_MARGIN) {
        if (!worst || d < worst.d) worst = { x: sx, z: sz, d };
      }
    }
    if (worst) {
      issues.push({
        category: 'rail-near-settlement-perimeter',
        detail: `${s.id} (${s.size}) footprint edge at (${fmt(worst.x)},${fmt(worst.z)}) is ${fmt(worst.d)}u from rail (need ≥${PERIMETER_MARGIN}u)`,
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
  // 6. Station platform footprint — water / road overlap / rail overlap / uneven
  // ============================================================
  const STATION_HEIGHT_DELTA_LIMIT = 1.6;
  for (const station of RAILWAY_STATIONS) {
    const layout = getStationLayout(station);
    const fp = sampleFootprint(layout.cx, layout.cz, layout.halfW, layout.halfL, layout.rotation);
    if (fp.hasWater) {
      issues.push({
        category: 'station-footprint-water',
        detail: `${station.id} platform at (${fmt(layout.cx)},${fmt(layout.cz)}) touches water`,
      });
    }
    if (fp.heightDelta > STATION_HEIGHT_DELTA_LIMIT) {
      issues.push({
        category: 'station-footprint-uneven',
        detail: `${station.id} platform at (${fmt(layout.cx)},${fmt(layout.cz)}) uneven (Δ=${fmt(fp.heightDelta, 2)}u, max=${STATION_HEIGHT_DELTA_LIMIT}u)`,
      });
    }
    // Rail overlap: skipped for line='AB' because AB platforms are CENTER
    // platforms that sit between two parallel tracks (rail near center is
    // expected). For side platforms, distToRailway from platform CENTER must
    // exceed halfW so the rail stays outside the platform's narrow axis.
    if (station.line !== 'AB') {
      const railD = distToRailway(layout.cx, layout.cz, layout.halfW + 1);
      if (railD !== null && railD < layout.halfW - 0.5) {
        issues.push({
          category: 'station-footprint-rail-overlap',
          detail: `${station.id} platform center is only ${fmt(railD)}u from rail (need >${fmt(layout.halfW - 0.5)}u, halfW=${fmt(layout.halfW)})`,
        });
      }
    }
    // Road overlap: a road centerline running through the platform footprint
    // would visually slice through the deck.
    const roadD = distToRoad(layout.cx, layout.cz, layout.halfW + layout.halfL + 4);
    if (roadD !== null && roadD.dist < Math.max(layout.halfW, layout.halfL) + roadD.halfWidth) {
      issues.push({
        category: 'station-footprint-road-overlap',
        detail: `${station.id} platform overlaps road (centerline ${fmt(roadD.dist)}u from platform center, halfMax=${fmt(Math.max(layout.halfW, layout.halfL))}u + roadHalf=${fmt(roadD.halfWidth)}u)`,
      });
    }
  }

  // ============================================================
  // 7. Wilderness buildings — must not sit inside rail clearance
  // ============================================================
  const WILDERNESS_RAIL_CLEARANCE = 8;
  let wildernessHits = 0;
  for (const b of WILDERNESS_BUILDINGS) {
    const r = Math.max(b.w, b.d) / 2;
    const need = r + WILDERNESS_RAIL_CLEARANCE;
    const d = distToRailway(b.x, b.z, need);
    if (d !== null && d < r + 2) {
      wildernessHits++;
      if (wildernessHits <= 5) {
        issues.push({
          category: 'wilderness-on-rail',
          detail: `${b.type} at (${fmt(b.x)},${fmt(b.z)}) is ${fmt(d)}u from rail (need ≥${fmt(r + 2)}u for footprint half ${fmt(r)})`,
        });
      }
    }
  }
  if (wildernessHits > 5) {
    issues.push({
      category: 'wilderness-on-rail',
      detail: `… ${wildernessHits - 5} more wilderness building violation(s) suppressed`,
    });
  }

  // ============================================================
  // 8. Generated resources — tree/rock/bush/crate must respect rail clearance
  // ============================================================
  // generateWorldResources is deterministic via seeded RNG so this snapshot
  // matches what the renderer streams in. We only sample the centers since
  // the gen filter already rejects close placements; this verifies the filter
  // is wired up.
  let resources: ReturnType<typeof generateWorldResources> = [];
  try {
    resources = generateWorldResources();
  } catch (err) {
    issues.push({
      category: 'resource-gen-error',
      detail: `generateWorldResources threw: ${(err as Error).message}`,
    });
  }
  const RES_MIN: Record<string, number> = {
    tree: 9,
    rock: 8,
    berry_bush: 6,
    crate: 6,
  };
  const resourceHits: Record<string, number> = { tree: 0, rock: 0, berry_bush: 0, crate: 0 };
  const resourceFirst: Record<string, { x: number; z: number; d: number; id: string } | null> = {
    tree: null, rock: null, berry_bush: null, crate: null,
  };
  for (const r of resources) {
    const min = RES_MIN[r.type];
    if (min === undefined) continue;
    const d = distToRailway(r.position[0], r.position[2], min);
    if (d !== null && d < min) {
      resourceHits[r.type]++;
      if (!resourceFirst[r.type] || d < (resourceFirst[r.type] as { d: number }).d) {
        resourceFirst[r.type] = { x: r.position[0], z: r.position[2], d, id: r.id };
      }
    }
  }
  for (const type of Object.keys(RES_MIN)) {
    const count = resourceHits[type];
    if (count > 0) {
      const first = resourceFirst[type];
      issues.push({
        category: 'resource-on-rail',
        detail: `${count} ${type}(s) inside rail clearance (need ≥${RES_MIN[type]}u). Worst: ${first?.id} at (${fmt(first?.x ?? 0)},${fmt(first?.z ?? 0)}) ${fmt(first?.d ?? 0)}u from rail`,
      });
    }
  }

  // ============================================================
  // Output
  // ============================================================
  if (issues.length === 0) {
    console.log(
      `[RailwayValidator] ✓ No rail/road/bridge violations. ` +
      `${intersections.length} intersection(s) decorated; ` +
      `${RAILWAY_STATIONS.length} station footprint(s) clean; ` +
      `${WILDERNESS_BUILDINGS.length} wilderness building(s) clear; ` +
      `${resources.length} resource(s) clear of rail clearance.`,
    );
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
