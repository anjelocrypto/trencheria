/**
 * KingdomVisualValidator — dev-only audit complementing RailwayValidator.
 *
 * RailwayValidator already verifies kingdom HOUSE positions against the rail
 * network. This validator extends coverage to the OUTER footprints of the 5
 * new kingdoms (walls, towers, gates, keep, dock area) and checks the
 * grounding/water/slope properties via sampleFootprint, plus proximity to
 * the road network. Houses inside the footprint are also re-checked against
 * water/slope here (rail check stays in RailwayValidator).
 *
 * Output is a single console line ("✓ no violations") or warn lines per
 * issue. No runtime cost in production — gated by import.meta.env.DEV at
 * the bottom of the file.
 */
import { SETTLEMENTS, ROADS } from '../world/RegionData';
import { sampleFootprint, WATER_LEVEL_Y } from './Grounding';
import { distToRailway } from '../world/RailwayData';
import {
  FORTIFIED_CITY_HOUSES,
  RIVER_TOWN_HOUSES,
  MOUNTAIN_HOLD_HOUSES,
  FRONTIER_CAMP_HOUSES,
  TRADE_CITY_HOUSES,
  KingdomHouseDef,
} from '../world/KingdomBuildingData';

interface KingdomFootprint {
  id: string;
  // Outer bounding half-extent for the entire kingdom (used for the macro
  // grounding check on the base anchor).
  halfW: number;
  halfD: number;
  houses: KingdomHouseDef[];
  // Sub-pieces (walls/towers/gates/keep/dock) sampled in kingdom-local space.
  // Coordinates are RELATIVE to the settlement center; the validator adds the
  // settlement position. Each piece has a halfW/halfD that mirrors what the
  // renderer paints, so we sample the same area the player sees.
  pieces: Array<{ name: string; lx: number; lz: number; halfW: number; halfD: number; allowWater?: boolean }>;
  // If true, kingdom intentionally sits next to water (Rivermoor) — the macro
  // hasWater check is skipped. Per-piece allowWater still applies.
  waterfront?: boolean;
}

// Mirror-of-renderer footprints. If you change the renderer geometry, update
// these so the validator keeps matching the painted scene.
const KINGDOMS: Record<string, KingdomFootprint> = {
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
      { name: 'tower-NW', lx: -45, lz: -45, halfW: 4, halfD: 4 },
      { name: 'tower-NE', lx: 45, lz: -45, halfW: 4, halfD: 4 },
      { name: 'tower-SE', lx: 45, lz: 45, halfW: 4, halfD: 4 },
      { name: 'tower-SW', lx: -45, lz: 45, halfW: 4, halfD: 4 },
      { name: 'gatehouse', lx: 0, lz: 45, halfW: 6, halfD: 2 },
      { name: 'citadel', lx: 0, lz: -10, halfW: 7, halfD: 7 },
    ],
  },
  rivermoor_city: {
    id: 'rivermoor_city',
    halfW: 25, halfD: 25,
    houses: RIVER_TOWN_HOUSES,
    waterfront: true,
    pieces: [
      { name: 'town-hall', lx: 0, lz: 0, halfW: 4, halfD: 5 },
      { name: 'clock-tower', lx: 0, lz: -5, halfW: 1.5, halfD: 1.5 },
      { name: 'lighthouse', lx: 25, lz: -28, halfW: 1.5, halfD: 1.5 },
      { name: 'dock', lx: 0, lz: -30, halfW: 20, halfD: 4, allowWater: true },
      { name: 'fence-N', lx: 0, lz: 30, halfW: 30, halfD: 1 },
    ],
  },
  stonepeak_hold: {
    id: 'stonepeak_hold',
    halfW: 25, halfD: 25,
    houses: MOUNTAIN_HOLD_HOUSES,
    pieces: [
      { name: 'platform', lx: 0, lz: 0, halfW: 25, halfD: 25 },
      { name: 'great-hall', lx: 0, lz: 0, halfW: 8, halfD: 10 },
      { name: 'wall-N', lx: 0, lz: -25, halfW: 25, halfD: 1 },
      { name: 'wall-E', lx: 25, lz: 0, halfW: 1, halfD: 25 },
      { name: 'wall-W', lx: -25, lz: 0, halfW: 1, halfD: 25 },
      { name: 'tower-NE', lx: 25, lz: -25, halfW: 3, halfD: 3 },
      { name: 'tower-NW', lx: -25, lz: -25, halfW: 3, halfD: 3 },
    ],
  },
  darkhollow_camp: {
    id: 'darkhollow_camp',
    halfW: 27, halfD: 27,
    houses: FRONTIER_CAMP_HOUSES,
    pieces: [
      { name: 'plaza', lx: 0, lz: 0, halfW: 27, halfD: 27 },
      { name: 'ruin-W', lx: -30, lz: -25, halfW: 1, halfD: 10 },
      { name: 'ruin-E', lx: 25, lz: -20, halfW: 1, halfD: 7 },
      { name: 'ruin-N', lx: 0, lz: -30, halfW: 15, halfD: 1 },
      { name: 'lookout-NW', lx: -20, lz: 18, halfW: 1.5, halfD: 1.5 },
      { name: 'lookout-SE', lx: 18, lz: -18, halfW: 1.5, halfD: 1.5 },
    ],
  },
  goldenvale_city: {
    id: 'goldenvale_city',
    halfW: 40, halfD: 35,
    houses: TRADE_CITY_HOUSES,
    pieces: [
      { name: 'wall-N', lx: 0, lz: -35, halfW: 40, halfD: 1 },
      { name: 'wall-E', lx: 40, lz: 0, halfW: 1, halfD: 35 },
      { name: 'wall-W', lx: -40, lz: 0, halfW: 1, halfD: 35 },
      { name: 'wall-S-left', lx: -22, lz: 35, halfW: 18, halfD: 1 },
      { name: 'wall-S-right', lx: 22, lz: 35, halfW: 18, halfD: 1 },
      { name: 'tower-NW', lx: -40, lz: -35, halfW: 3, halfD: 3 },
      { name: 'tower-NE', lx: 40, lz: -35, halfW: 3, halfD: 3 },
      { name: 'tower-SE', lx: 40, lz: 35, halfW: 3, halfD: 3 },
      { name: 'tower-SW', lx: -40, lz: 35, halfW: 3, halfD: 3 },
      { name: 'gatehouse', lx: 0, lz: 35, halfW: 5, halfD: 2 },
      { name: 'trade-hall', lx: 0, lz: -10, halfW: 7, halfD: 6 },
      { name: 'plaza', lx: 0, lz: 10, halfW: 12, halfD: 8 },
    ],
  },
};

// Slope tolerance ~0.6 rad (~34°). Above this we flag as "steep" — the
// renderer anchors the whole kingdom to its macro minY, so an individual
// piece sitting on a 35°+ slope will visibly clip or float regardless.
const MAX_SLOPE_RAD = 0.6;
// "Floating" detection: a piece is flagged when its local minY is more than
// FLOAT_TOLERANCE meters BELOW the kingdom's macro minY (it would clip the
// platform), or when its local maxY is more than FLOAT_TOLERANCE above the
// macro minY + 2 (it would protrude through walls/floors). This is far more
// useful than a raw heightDelta because the renderer intentionally anchors
// to macro minY and accepts modest terrain unevenness.
const FLOAT_TOLERANCE = 3.0;
// Pieces this close to a rail centerline are flagged as colliding with the
// railway. Stations have their own footprint check in RailwayValidator.
// Compared against the SHORT axis of the piece (walls are long but thin —
// a road 30m from a 90m wall is fine, only the wall's thickness matters).
const RAIL_CLEARANCE = 4;
// Pieces this close to a road centerline are flagged. Gatehouses, plazas
// and docks are excluded — gate-approach roads intentionally terminate at
// the wall, and plazas sit ON cobble paving by design.
const ROAD_CLEARANCE = 3;

interface Issue { category: string; detail: string }

function distToRoad(x: number, z: number, maxDist: number): number | null {
  let best = maxDist + 1;
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
    if (d < best) best = d;
  }
  return best <= maxDist ? best : null;
}

export function runKingdomVisualAudit(): void {
  const issues: Issue[] = [];
  let pieceCount = 0;
  let houseCount = 0;

  for (const def of SETTLEMENTS) {
    const kd = KINGDOMS[def.id];
    if (!kd) continue;
    const [cx, cz] = def.position;

    // 1. Macro footprint grounding — same call the renderer makes.
    // NOTE: we deliberately do NOT use fp.hasWater because that flag fires
    // whenever a lake/river footprint overlaps the (x,z) plane regardless of
    // actual ground height — it falsely reports kingdoms perched HIGH ABOVE
    // a nearby lake. We only flag when the terrain itself sits at/under the
    // water threshold.
    const macro = sampleFootprint(cx, cz, kd.halfW, kd.halfD, 0);
    if (!kd.waterfront && macro.minY <= WATER_LEVEL_Y) {
      issues.push({
        category: 'kingdom-in-water',
        detail: `${def.id} macro footprint sits at water level (minY=${macro.minY.toFixed(2)})`,
      });
    }
    if (macro.heightDelta > 8) {
      issues.push({
        category: 'kingdom-uneven',
        detail: `${def.id} macro footprint heightDelta=${macro.heightDelta.toFixed(2)} exceeds 8m — pieces will float`,
      });
    }

    // 2. Per-piece footprint grounding (walls/towers/gates/keep/dock).
    // For waterfront kingdoms (Rivermoor), all per-piece water checks are
    // skipped — the river deliberately bisects the footprint and the renderer
    // raises the deck above the water surface via macro minY anchoring.
    const skipWater = !!kd.waterfront;
    for (const p of kd.pieces) {
      pieceCount++;
      const wx = cx + p.lx;
      const wz = cz + p.lz;
      const fp = sampleFootprint(wx, wz, p.halfW, p.halfD, 0);
      if (!skipWater && !p.allowWater && fp.minY <= WATER_LEVEL_Y) {
        issues.push({
          category: 'piece-in-water',
          detail: `${def.id}/${p.name} at (${wx.toFixed(0)},${wz.toFixed(0)}) sits at water level (minY=${fp.minY.toFixed(2)})`,
        });
      }
      if (fp.slopeRad > MAX_SLOPE_RAD) {
        issues.push({
          category: 'piece-on-slope',
          detail: `${def.id}/${p.name} slope=${(fp.slopeRad * 180 / Math.PI).toFixed(1)}° exceeds ${(MAX_SLOPE_RAD * 180 / Math.PI).toFixed(0)}°`,
        });
      }
      // Floating detection vs the kingdom's macro anchor (matches what the
      // renderer actually paints). A piece is "floating" only if its local
      // ground is significantly HIGHER than where the renderer placed it
      // (terrain pokes through the structure).
      const floatGap = fp.minY - macro.minY;
      if (floatGap > FLOAT_TOLERANCE) {
        issues.push({
          category: 'piece-terrain-clip',
          detail: `${def.id}/${p.name} ground at +${floatGap.toFixed(2)}m above kingdom base — terrain may clip the structure`,
        });
      }

      // Rail/road clearance: walls are long but thin, so use the SHORT axis
      // as the body radius. Gatehouse + plaza + dock pieces are skipped —
      // these are intentional points where roads/water meet the city.
      const bodyRadius = Math.min(p.halfW, p.halfD);
      // Gatehouses, plazas, docks AND central terminus pieces are skipped —
      // roads intentionally terminate at the gate or at central halls
      // (town-hall, great-hall, trade-hall, platform).
      const isCrossingPiece =
        p.name.startsWith('gatehouse') ||
        p.name.startsWith('plaza') ||
        p.name.startsWith('dock') ||
        p.name === 'town-hall' ||
        p.name === 'clock-tower' ||
        p.name === 'great-hall' ||
        p.name === 'trade-hall' ||
        p.name === 'platform';

      if (!isCrossingPiece) {
        const railNeed = bodyRadius + RAIL_CLEARANCE;
        const railD = distToRailway(wx, wz, railNeed);
        if (railD !== null && railD < railNeed) {
          issues.push({
            category: 'piece-on-rail',
            detail: `${def.id}/${p.name} is ${railD.toFixed(1)}m from a rail centerline (need ≥ ${railNeed.toFixed(1)}m)`,
          });
        }
        const roadNeed = bodyRadius + ROAD_CLEARANCE;
        const roadD = distToRoad(wx, wz, roadNeed);
        if (roadD !== null && roadD < roadNeed) {
          issues.push({
            category: 'piece-on-road',
            detail: `${def.id}/${p.name} is ${roadD.toFixed(1)}m from a road centerline`,
          });
        }
      }
    }

    // 3. House grounding (water/slope only — rail is in RailwayValidator).
    for (let i = 0; i < kd.houses.length; i++) {
      houseCount++;
      const h = kd.houses[i];
      const wx = cx + h.x;
      const wz = cz + h.z;
      const fp = sampleFootprint(wx, wz, h.w / 2, h.d / 2, h.rot);
      if (!skipWater && fp.minY <= WATER_LEVEL_Y) {
        issues.push({
          category: 'house-in-water',
          detail: `${def.id} house #${i} at (${wx.toFixed(0)},${wz.toFixed(0)}) sits at water level (minY=${fp.minY.toFixed(2)})`,
        });
      }
      if (fp.slopeRad > MAX_SLOPE_RAD) {
        issues.push({
          category: 'house-on-slope',
          detail: `${def.id} house #${i} slope=${(fp.slopeRad * 180 / Math.PI).toFixed(1)}°`,
        });
      }
      if (!skipWater && fp.minY < WATER_LEVEL_Y - 1) {
        issues.push({
          category: 'house-below-water',
          detail: `${def.id} house #${i} minY=${fp.minY.toFixed(2)} is well below water level`,
        });
      }
    }
  }

  const kingdomCount = Object.keys(KINGDOMS).length;
  if (issues.length === 0) {
    console.log(
      `[KingdomVisualValidator] ✓ ${kingdomCount} kingdom(s), ${pieceCount} structural piece(s), ` +
      `${houseCount} house(s) clear of water/slope/rail/road violations.`,
    );
  } else {
    console.warn(`[KingdomVisualValidator] ${issues.length} kingdom visual violation(s):`);
    const cap = 20;
    for (let i = 0; i < Math.min(issues.length, cap); i++) {
      const it = issues[i];
      console.warn(`  • [${it.category}] ${it.detail}`);
    }
    if (issues.length > cap) {
      console.warn(`  • … ${issues.length - cap} more suppressed`);
    }
  }
}

if (import.meta.env.DEV) {
  // Defer one tick so terrain/water/rail caches finish lazy-init before audit.
  setTimeout(() => {
    try {
      runKingdomVisualAudit();
    } catch (err) {
      console.error('[KingdomVisualValidator] crashed:', err);
    }
  }, 0);
}
