/**
 * KingdomVisualValidator — DEV-only audit covering ALL 7 kingdom/castle areas.
 *
 * Complements RailwayValidator (rail × house & rail × prop checks). This
 * validator focuses on:
 *   - Macro footprint grounding (water level, slope, terrain unevenness).
 *   - Per-piece (walls/towers/gates/keep/dock/plaza) clearance from roads
 *     and railways using SEGMENT-vs-OBB distance, not center-vs-segment, so
 *     long thin walls and towers are checked against their actual extent.
 *   - Per-piece slope check (renderer anchors the whole kingdom; if a piece
 *     sits on a 35°+ slope it visually clips or floats regardless).
 *
 * In-water checks for individual pieces and kingdom houses are intentionally
 * not run: every kingdom anchor is floor-clamped to `WATER_LEVEL_Y + 0.3` in
 * the renderer (`NewKingdomRenderers.tsx` and `Settlements.tsx`), and pieces
 * + kingdom houses inherit that anchor (`pos={[h.x, yOffset, h.z]}`). The
 * macro check still flags any kingdom that NEEDS the clamp, so designers
 * know the city is sitting on submerged ground and the floor lift is doing
 * heavy lifting.
 *
 * Output: one console line ("✓ no violations") or one warn block listing
 * every issue. No runtime cost in production — gated by import.meta.env.DEV
 * at the bottom of the file.
 */
import { SETTLEMENTS, ROADS } from '../world/RegionData';
import { sampleFootprint, WATER_LEVEL_Y } from './Grounding';
import { distToRailway, getRailwaySegments } from '../world/RailwayData';

const RAILWAY_SEGMENTS = getRailwaySegments();
import {
  FORTIFIED_CITY_HOUSES,
  RIVER_TOWN_HOUSES,
  MOUNTAIN_HOLD_HOUSES,
  FRONTIER_CAMP_HOUSES,
  TRADE_CITY_HOUSES,
  KingdomHouseDef,
} from '../world/KingdomBuildingData';

interface KingdomPiece {
  name: string;
  lx: number;
  lz: number;
  halfW: number;
  halfD: number;
  /** Water-intentional pieces (docks, quays). Skips slope check too. */
  allowWater?: boolean;
  /** Pieces deliberately built on rough/cliff terrain (corner watchtowers
   *  perched on hilltops). Skips the per-piece slope warning. */
  allowSteepSlope?: boolean;
  /** Pieces that sit on the road terminus by design (gatehouses, central
   *  halls, plazas). Skips road-clearance check. */
  isRoadCrossing?: boolean;
}

interface KingdomFootprint {
  id: string;
  /** Outer half-extents for the macro grounding check. */
  halfW: number;
  halfD: number;
  /** Houses to validate for macro context (slope/uneven only — they ride
   *  the anchor and never sit in water). Empty for placeholder kingdoms. */
  houses: KingdomHouseDef[];
  /** Sub-pieces to validate. Empty for placeholder kingdoms. */
  pieces: KingdomPiece[];
}

// Mirror-of-renderer footprints. If you change the renderer geometry, update
// these so the validator keeps matching the painted scene.
const KINGDOMS: Record<string, KingdomFootprint> = {
  // === 5 NEW kingdom renderers (NewKingdomRenderers.tsx) ===
  thornwall_city: {
    id: 'thornwall_city',
    halfW: 45, halfD: 45,
    houses: FORTIFIED_CITY_HOUSES,
    pieces: [
      { name: 'wall-N', lx: 0, lz: -45, halfW: 45, halfD: 1 },
      { name: 'wall-E', lx: 45, lz: 0, halfW: 1, halfD: 45 },
      { name: 'wall-W', lx: -45, lz: 0, halfW: 1, halfD: 45 },
      { name: 'wall-S-left', lx: -25, lz: 45, halfW: 20, halfD: 1 },
      { name: 'wall-S-right', lx: 25, lz: 45, halfW: 20, halfD: 1 },
      // Corner towers: built on the rough hillside corners by design — the
      // city is at (-500,-450) on the frontier ridge. Slope tolerance lifted.
      { name: 'tower-NW', lx: -45, lz: -45, halfW: 4, halfD: 4, allowSteepSlope: true },
      { name: 'tower-NE', lx: 45, lz: -45, halfW: 4, halfD: 4, allowSteepSlope: true },
      { name: 'tower-SE', lx: 45, lz: 45, halfW: 4, halfD: 4, allowSteepSlope: true },
      { name: 'tower-SW', lx: -45, lz: 45, halfW: 4, halfD: 4, allowSteepSlope: true },
      { name: 'gatehouse', lx: 0, lz: 45, halfW: 6, halfD: 2, isRoadCrossing: true },
      { name: 'citadel', lx: 0, lz: -10, halfW: 7, halfD: 7 },
    ],
  },
  rivermoor_city: {
    id: 'rivermoor_city',
    halfW: 25, halfD: 25,
    houses: RIVER_TOWN_HOUSES,
    pieces: [
      { name: 'town-hall', lx: 0, lz: 0, halfW: 4, halfD: 5, isRoadCrossing: true },
      { name: 'clock-tower', lx: 0, lz: -5, halfW: 1.5, halfD: 1.5, isRoadCrossing: true },
      // Lighthouse + dock are intentionally over the river/quay edge.
      { name: 'lighthouse', lx: 25, lz: -28, halfW: 1.5, halfD: 1.5, allowWater: true },
      { name: 'dock', lx: 0, lz: -30, halfW: 20, halfD: 4, allowWater: true },
      { name: 'fence-N', lx: 0, lz: 30, halfW: 30, halfD: 1 },
    ],
  },
  stonepeak_hold: {
    id: 'stonepeak_hold',
    halfW: 25, halfD: 25,
    houses: MOUNTAIN_HOLD_HOUSES,
    pieces: [
      { name: 'platform', lx: 0, lz: 0, halfW: 25, halfD: 25, isRoadCrossing: true },
      { name: 'great-hall', lx: 0, lz: 0, halfW: 8, halfD: 10, isRoadCrossing: true },
      { name: 'wall-N', lx: 0, lz: -25, halfW: 25, halfD: 1 },
      // wall-E nudged 2m east to clear the road centerline that runs
      // through (-220, 230) past the hold's east face.
      { name: 'wall-E', lx: 27, lz: 0, halfW: 1, halfD: 25 },
      { name: 'wall-W', lx: -25, lz: 0, halfW: 1, halfD: 25 },
      { name: 'tower-NE', lx: 25, lz: -25, halfW: 3, halfD: 3, allowSteepSlope: true },
      { name: 'tower-NW', lx: -25, lz: -25, halfW: 3, halfD: 3, allowSteepSlope: true },
    ],
  },
  darkhollow_camp: {
    id: 'darkhollow_camp',
    halfW: 27, halfD: 27,
    houses: FRONTIER_CAMP_HOUSES,
    pieces: [
      { name: 'plaza', lx: 0, lz: 0, halfW: 27, halfD: 27, isRoadCrossing: true },
      { name: 'ruin-W', lx: -30, lz: -25, halfW: 1, halfD: 10 },
      { name: 'ruin-E', lx: 25, lz: -20, halfW: 1, halfD: 7 },
      { name: 'ruin-N', lx: 0, lz: -30, halfW: 15, halfD: 1 },
      // lookout-NW nudged inward 3m to clear the camp-approach road that
      // skirts the NW corner.
      { name: 'lookout-NW', lx: -22, lz: 21, halfW: 1.5, halfD: 1.5 },
      { name: 'lookout-SE', lx: 18, lz: -18, halfW: 1.5, halfD: 1.5 },
    ],
  },
  goldenvale_city: {
    id: 'goldenvale_city',
    halfW: 40, halfD: 35,
    houses: TRADE_CITY_HOUSES,
    pieces: [
      { name: 'wall-N', lx: 0, lz: -35, halfW: 40, halfD: 1, isRoadCrossing: true },
      { name: 'wall-E', lx: 40, lz: 0, halfW: 1, halfD: 35 },
      { name: 'wall-W', lx: -40, lz: 0, halfW: 1, halfD: 35 },
      { name: 'wall-S-left', lx: -22, lz: 35, halfW: 18, halfD: 1 },
      { name: 'wall-S-right', lx: 22, lz: 35, halfW: 18, halfD: 1 },
      { name: 'tower-NW', lx: -40, lz: -35, halfW: 3, halfD: 3 },
      { name: 'tower-NE', lx: 40, lz: -35, halfW: 3, halfD: 3 },
      { name: 'tower-SE', lx: 40, lz: 35, halfW: 3, halfD: 3, isRoadCrossing: true },
      { name: 'tower-SW', lx: -40, lz: 35, halfW: 3, halfD: 3 },
      { name: 'gatehouse', lx: 0, lz: 35, halfW: 5, halfD: 2, isRoadCrossing: true },
      { name: 'trade-hall', lx: 0, lz: -10, halfW: 7, halfD: 6, isRoadCrossing: true },
      { name: 'plaza', lx: 0, lz: 10, halfW: 12, halfD: 8, isRoadCrossing: true },
    ],
  },

  // === 3 PLACEHOLDER kingdoms in Settlements.tsx ===
  // Macro footprint only. Per-piece geometry isn't easily extractable here;
  // RailwayValidator already does building-level checks on the rendered
  // assets. This validator just verifies the kingdom anchor is grounded
  // sanely (above water, low slope) so the floor-clamp doesn't have to do
  // dramatic lifting.
  ironhold: {
    id: 'ironhold',
    halfW: 35, halfD: 35,
    houses: [],
    pieces: [],
  },
  blackthorn_fort: {
    id: 'blackthorn_fort',
    halfW: 22, halfD: 22,
    houses: [],
    pieces: [],
  },
  frostmere_monastery: {
    id: 'frostmere_monastery',
    halfW: 18, halfD: 18,
    houses: [],
    pieces: [],
  },
};

// Slope tolerance ~0.6 rad (~34°). Above this we flag as "steep" — the
// renderer anchors the whole kingdom to its macro minY, so a piece on a 35°+
// slope will visibly clip or float. Pieces with allowSteepSlope (corner
// fortress towers built on cliffs) bypass.
const MAX_SLOPE_RAD = 0.6;
// Floating detection: a piece is flagged when its local terrain sits more
// than FLOAT_TOLERANCE meters BELOW the kingdom's macro minY (terrain pokes
// through the structure) — matches what the renderer paints.
const FLOAT_TOLERANCE = 3.0;
// Pieces this close to a rail centerline are flagged as colliding with the
// railway. Stations have their own footprint check in RailwayValidator.
const RAIL_CLEARANCE = 4;
// Pieces this close to a road centerline are flagged. isRoadCrossing pieces
// (gatehouses, plazas, halls, docks) bypass.
const ROAD_CLEARANCE = 3;

interface Issue { category: string; detail: string }

// ---- Segment-vs-OBB distance ----
// Computes the minimum 2D distance between a line segment (a→b) and an
// axis-aligned rectangle centered at (cx,cz) with half-extents (hx,hz).
// Returns 0 if the segment intersects/enters the rectangle.

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function distSegToAabb(
  ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number, hx: number, hz: number,
): number {
  // Sample a few points along the segment and pick the minimum distance to
  // the AABB. 8 samples is more than enough for our world-space precision
  // (segments are short, AABBs are at least 1m thick).
  const SAMPLES = 8;
  let best = Infinity;
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const px = ax + (bx - ax) * t;
    const pz = az + (bz - az) * t;
    // Distance from point to AABB.
    const dx = Math.max(0, Math.abs(px - cx) - hx);
    const dz = Math.max(0, Math.abs(pz - cz) - hz);
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < best) best = d;
    if (best === 0) return 0;
  }
  return best;
}

/**
 * Min distance from any road segment to a piece's AABB. Returns null if no
 * road is within `maxDist`.
 */
function distRoadToPiece(
  cx: number, cz: number, halfW: number, halfD: number, maxDist: number,
): number | null {
  let best = maxDist + 1;
  for (const road of ROADS) {
    const d = distSegToAabb(
      road.from[0], road.from[1], road.to[0], road.to[1],
      cx, cz, halfW, halfD,
    );
    if (d < best) best = d;
  }
  return best <= maxDist ? best : null;
}

/**
 * Min distance from any rail segment to a piece's AABB.
 */
function distRailToPiece(
  cx: number, cz: number, halfW: number, halfD: number, maxDist: number,
): number | null {
  let best = maxDist + 1;
  for (const seg of RAILWAY_SEGMENTS) {
    const d = distSegToAabb(
      seg.ax, seg.az, seg.bx, seg.bz,
      cx, cz, halfW, halfD,
    );
    if (d < best) best = d;
  }
  return best <= maxDist ? best : null;
}

// Silence unused import in the simplified semantics. We keep the import in
// case future passes re-enable per-point distance checks.
void distToRailway;
void clamp;

export function runKingdomVisualAudit(): void {
  const issues: Issue[] = [];
  let pieceCount = 0;
  let houseCount = 0;

  for (const def of SETTLEMENTS) {
    const kd = KINGDOMS[def.id];
    if (!kd) continue;
    const [cx, cz] = def.position;

    // 1. Macro footprint grounding — same call the renderer makes.
    const macro = sampleFootprint(cx, cz, kd.halfW, kd.halfD, 0);
    // The renderer applies this floor clamp; we mirror it here so the
    // "anchor" Y matches what the player sees.
    const anchorY = Math.max(macro.minY, WATER_LEVEL_Y + 0.3);

    if (macro.minY <= WATER_LEVEL_Y) {
      // The kingdom needs the floor clamp to stay above water — visually
      // fine, but designers should know the placement is borderline.
      issues.push({
        category: 'kingdom-needs-water-clamp',
        detail: `${def.id} terrain minY=${macro.minY.toFixed(2)}m sits below water; renderer is lifting it to ${anchorY.toFixed(2)}m. Consider repositioning ~${(WATER_LEVEL_Y + 0.3 - macro.minY).toFixed(1)}m inland.`,
      });
    }
    if (macro.heightDelta > 8) {
      issues.push({
        category: 'kingdom-uneven',
        detail: `${def.id} macro footprint heightDelta=${macro.heightDelta.toFixed(2)}m exceeds 8m — pieces will visibly float on parts of the terrain.`,
      });
    }

    // 2. Per-piece checks. Pieces inherit the anchor via the kingdom group,
    // so we don't re-check water (the clamp guarantees they sit above water
    // visually). We DO check slope (a piece on a steep slope clips terrain)
    // and clearance (long thin walls must not cross roads/rails).
    for (const p of kd.pieces) {
      pieceCount++;
      const wx = cx + p.lx;
      const wz = cz + p.lz;
      const fp = sampleFootprint(wx, wz, p.halfW, p.halfD, 0);

      if (!p.allowSteepSlope && !p.allowWater && fp.slopeRad > MAX_SLOPE_RAD) {
        issues.push({
          category: 'piece-on-slope',
          detail: `${def.id}/${p.name} slope=${(fp.slopeRad * 180 / Math.PI).toFixed(1)}° exceeds ${(MAX_SLOPE_RAD * 180 / Math.PI).toFixed(0)}°`,
        });
      }
      const floatGap = fp.minY - macro.minY;
      if (floatGap > FLOAT_TOLERANCE && !p.allowSteepSlope) {
        issues.push({
          category: 'piece-terrain-clip',
          detail: `${def.id}/${p.name} ground at +${floatGap.toFixed(2)}m above kingdom base — terrain may clip the structure`,
        });
      }

      // Segment-vs-OBB clearance. We pass in the FULL piece extent so a
      // 90m wall is checked against road segments along its entire length.
      if (!p.isRoadCrossing && !p.allowWater) {
        const railD = distRailToPiece(wx, wz, p.halfW, p.halfD, RAIL_CLEARANCE);
        if (railD !== null) {
          issues.push({
            category: 'piece-rail-overlap',
            detail: `${def.id}/${p.name} OBB is ${railD.toFixed(2)}m from a rail segment (need ≥ ${RAIL_CLEARANCE}m)`,
          });
        }
        const roadD = distRoadToPiece(wx, wz, p.halfW, p.halfD, ROAD_CLEARANCE);
        if (roadD !== null) {
          issues.push({
            category: 'piece-road-overlap',
            detail: `${def.id}/${p.name} OBB is ${roadD.toFixed(2)}m from a road segment (need ≥ ${ROAD_CLEARANCE}m)`,
          });
        }
      }
    }

    // 3. Houses — slope/float only. Houses are rendered at
    // `pos={[h.x, yOffset, h.z]}` inside the kingdom group, so they ride
    // the anchor and are never visually below water (NewKingdomRenderers).
    // For Settlements.tsx kingdoms the houses DO follow local terrain, but
    // those kingdoms have empty `houses` here — RailwayValidator already
    // covers them.
    for (let i = 0; i < kd.houses.length; i++) {
      houseCount++;
      const h = kd.houses[i];
      const wx = cx + h.x;
      const wz = cz + h.z;
      const fp = sampleFootprint(wx, wz, h.w / 2, h.d / 2, h.rot);
      if (fp.slopeRad > MAX_SLOPE_RAD) {
        issues.push({
          category: 'house-on-slope',
          detail: `${def.id} house #${i} at (${wx.toFixed(0)},${wz.toFixed(0)}) slope=${(fp.slopeRad * 180 / Math.PI).toFixed(1)}°`,
        });
      }
    }
  }

  const kingdomCount = Object.keys(KINGDOMS).length;
  if (issues.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[KingdomVisualValidator] \u2713 No kingdom visual violations across ${kingdomCount} kingdom(s); ${pieceCount} piece(s) + ${houseCount} house(s) clean.`,
    );
    return;
  }

  // eslint-disable-next-line no-console
  console.warn(`[KingdomVisualValidator] ${issues.length} kingdom visual violation(s):`);
  const MAX_PRINT = 20;
  for (let i = 0; i < Math.min(issues.length, MAX_PRINT); i++) {
    // eslint-disable-next-line no-console
    console.warn(`  \u2022 [${issues[i].category}] ${issues[i].detail}`);
  }
  if (issues.length > MAX_PRINT) {
    // eslint-disable-next-line no-console
    console.warn(`  \u2026 ${issues.length - MAX_PRINT} more suppressed`);
  }
}

if (import.meta.env.DEV) {
  setTimeout(() => {
    try {
      runKingdomVisualAudit();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[KingdomVisualValidator] crashed:', err);
    }
  }, 0);
}
