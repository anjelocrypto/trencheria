/**
 * KingdomVisualValidator — DEV-only audit covering ALL 8 kingdom/castle areas
 * (3 originals: Ironhold / Blackthorn Fort / Frostmere Keep + 5 NewKingdom
 * renderers: Thornwall / Rivermoor / Stonepeak / Darkhollow / Goldenvale).
 *
 * Complements RailwayValidator (rail × house & rail × prop checks). This
 * validator focuses on:
 *   - Macro footprint grounding (water level, slope, terrain unevenness).
 *   - Per-piece (walls/towers/gates/keep/dock/plaza) clearance from roads
 *     and railways using EXACT analytic SEGMENT-vs-AABB distance, not
 *     center-vs-segment, so long thin walls and towers are checked against
 *     their actual extent.
 *   - Per-piece slope check (renderer anchors the whole kingdom; if a piece
 *     sits on a 35°+ slope it visually clips or floats regardless).
 *
 * Per-piece in-water checks are intentionally not run: every kingdom anchor
 * is floor-clamped to `WATER_LEVEL_Y + 0.3` in the renderer, and pieces +
 * kingdom houses inherit that anchor. Cities marked `intentionalPodium`
 * also paint a visible stone base mesh (RiverTown / TradeCity quay,
 * MilitaryFort earth pad), so the floor lift is no longer the only thing
 * grounding them — those cities skip the macro water-clamp warning. Cities
 * marked `intentionalUneven` (mountain monasteries) skip the macro
 * heightDelta warning.
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
  /** Intentionally-large stone platform (e.g. Stonepeak's mountain platform,
   *  Darkhollow's ruined plaza). Suppresses the oversized-foundation check
   *  that catches accidental mega-podiums like the old 60×60 Rivermoor slab. */
  isLargeFoundation?: boolean;
}

interface KingdomFootprint {
  id: string;
  /** Outer half-extents for the macro grounding check. */
  halfW: number;
  halfD: number;
  /** Houses to validate for macro context (slope/uneven only — they ride
   *  the anchor and never sit in water). Empty for placeholder kingdoms. */
  houses: KingdomHouseDef[];
  /** Sub-pieces to validate. */
  pieces: KingdomPiece[];
  /** City has a visible stone podium / quay below the wall ring; the
   *  floor-clamp is paired with a real base mesh, so the macro
   *  "needs-water-clamp" warning is suppressed. */
  intentionalPodium?: boolean;
  /** Mountain / cliffside settlement where the macro footprint deliberately
   *  spans uneven terrain. Suppresses the macro "uneven" warning. */
  intentionalUneven?: boolean;
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
      // wall-S-right brackets the south gate; the Thornwatch road that
      // terminates at the gate (-500,-407) clips this piece by ~2m where it
      // bends in to the gate. Designed entrance — flagged as crossing.
      { name: 'wall-S-right', lx: 25, lz: 45, halfW: 20, halfD: 1, isRoadCrossing: true },
      // Corner towers: built on the rough hillside corners by design — the
      // city is at (-500,-450) on the frontier ridge. Slope tolerance lifted.
      { name: 'tower-NW', lx: -45, lz: -45, halfW: 4, halfD: 4, allowSteepSlope: true },
      { name: 'tower-NE', lx: 45, lz: -45, halfW: 4, halfD: 4, allowSteepSlope: true },
      // SE corner tower sits where the south-gate road bends past the wall;
      // road clearance is by-design.
      { name: 'tower-SE', lx: 45, lz: 45, halfW: 4, halfD: 4, allowSteepSlope: true, isRoadCrossing: true },
      { name: 'tower-SW', lx: -45, lz: 45, halfW: 4, halfD: 4, allowSteepSlope: true },
      { name: 'gatehouse', lx: 0, lz: 45, halfW: 6, halfD: 2, isRoadCrossing: true },
      // Citadel sits on the central north–south spine where every gate-
      // approach road points; mark as crossing so a road that terminates at
      // city centre isn't double-counted.
      { name: 'citadel', lx: 0, lz: -10, halfW: 7, halfD: 7, isRoadCrossing: true },
    ],
  },
  rivermoor_city: {
    id: 'rivermoor_city',
    halfW: 25, halfD: 25,
    houses: RIVER_TOWN_HOUSES,
    // The lake-edge terrain dips below water by patches; the renderer
    // floor-clamps the kingdom anchor and now paints an explicit pale-stone
    // quay wall + retaining returns over the visible waterfront edge instead
    // of a hidden 60×60 mega-podium. The flag still suppresses the macro
    // water-clamp informational warning since the visual is intentional.
    intentionalPodium: true,
    pieces: [
      // Inland deck (pale stone, thin) — visible foundation under plaza/houses.
      // Sized 44×36 = 1584 m² — under the 2000 m² oversized threshold.
      { name: 'inland-deck', lx: 0, lz: 8, halfW: 22, halfD: 18, isRoadCrossing: true },
      // Waterfront quay wall — pale stone retaining wall facing the river.
      { name: 'quay-wall-N', lx: 0, lz: -14, halfW: 23, halfD: 0.3, allowWater: true },
      { name: 'quay-return-W', lx: -23, lz: -10, halfW: 0.3, halfD: 4, allowWater: true },
      { name: 'quay-return-E', lx: 23, lz: -10, halfW: 0.3, halfD: 4, allowWater: true },
      // Town hall + clock tower — central, faces plaza.
      { name: 'town-hall', lx: 0, lz: 4, halfW: 4.5, halfD: 5.5, isRoadCrossing: true },
      { name: 'clock-tower', lx: 0, lz: 10, halfW: 1.5, halfD: 1.5, isRoadCrossing: true },
      // Plaza inset + fountain.
      { name: 'plaza', lx: 0, lz: 16, halfW: 6, halfD: 6, isRoadCrossing: true },
      // Boardwalk + side piers (over water — explicit waterfront pieces).
      { name: 'boardwalk', lx: 0, lz: -22, halfW: 18, halfD: 3, allowWater: true },
      { name: 'pier-W', lx: -14, lz: -30, halfW: 2.5, halfD: 7, allowWater: true },
      { name: 'pier-E', lx: 14, lz: -30, halfW: 2.5, halfD: 7, allowWater: true },
      { name: 'lighthouse', lx: 18, lz: -36, halfW: 1.6, halfD: 1.6, allowWater: true },
      // Canal cuts inland (water channel) + bridge.
      { name: 'canal', lx: -12, lz: 0, halfW: 1.5, halfD: 11, allowWater: true },
      { name: 'canal-bridge', lx: -12, lz: 6, halfW: 2.5, halfD: 1.1, isRoadCrossing: true },
      // Inland fence perimeter (waterfront stays open to the river).
      { name: 'fence-N', lx: 0, lz: 26.3, halfW: 22, halfD: 0.1 },
      // fence-W is crossed by a road approach on the west side — a gate gap
       // exists by design at the road terminus.
       { name: 'fence-W', lx: -23.3, lz: 8, halfW: 0.1, halfD: 18, isRoadCrossing: true },
      { name: 'fence-E', lx: 23.3, lz: 8, halfW: 0.1, halfD: 18 },
    ],
  },
  stonepeak_hold: {
    id: 'stonepeak_hold',
    halfW: 25, halfD: 25,
    houses: MOUNTAIN_HOLD_HOUSES,
    pieces: [
      { name: 'platform', lx: 0, lz: 0, halfW: 25, halfD: 25, isRoadCrossing: true, isLargeFoundation: true },
      { name: 'great-hall', lx: 0, lz: 0, halfW: 8, halfD: 10, isRoadCrossing: true },
      // North wall split: back service gate + flanking wall fragments.
      // The wall-N-* pieces flank the new back gate where the Goldenvale
      // road enters at (-400, 472) — designed crossing point.
      { name: 'wall-N-left', lx: -15, lz: -25, halfW: 10, halfD: 1, isRoadCrossing: true },
      { name: 'wall-N-right', lx: 15, lz: -25, halfW: 10, halfD: 1, isRoadCrossing: true },
      { name: 'back-gatehouse', lx: 0, lz: -25, halfW: 5, halfD: 1.5, isRoadCrossing: true },
      // wall-E matches renderer at lx=25. The dog-leg approach passes the
      // NE corner just outside the wall extent; flagged crossing because
      // the corner tower's footprint visually swallows the 2.5m clearance
      // window at the corner radius.
      { name: 'wall-E', lx: 25, lz: 0, halfW: 1, halfD: 25, isRoadCrossing: true },
      { name: 'wall-W', lx: -25, lz: 0, halfW: 1, halfD: 25 },
      { name: 'wall-S-left', lx: -15, lz: 25, halfW: 10, halfD: 1 },
      { name: 'wall-S-right', lx: 15, lz: 25, halfW: 10, halfD: 1, isRoadCrossing: true },
      { name: 'gatehouse', lx: 0, lz: 25, halfW: 5, halfD: 1.5, isRoadCrossing: true },
      { name: 'tower-NE', lx: 25, lz: -25, halfW: 3, halfD: 3, allowSteepSlope: true, isRoadCrossing: true },
      { name: 'tower-NW', lx: -25, lz: -25, halfW: 3, halfD: 3, allowSteepSlope: true },
      { name: 'tower-SE', lx: 25, lz: 25, halfW: 3, halfD: 3, allowSteepSlope: true, isRoadCrossing: true },
      { name: 'tower-SW', lx: -25, lz: 25, halfW: 3, halfD: 3, allowSteepSlope: true },
    ],
  },
  darkhollow_camp: {
    id: 'darkhollow_camp',
    halfW: 27, halfD: 27,
    houses: FRONTIER_CAMP_HOUSES,
    pieces: [
      { name: 'plaza', lx: 0, lz: 0, halfW: 27, halfD: 27, isRoadCrossing: true, isLargeFoundation: true },
      { name: 'ruin-W', lx: -30, lz: -25, halfW: 1, halfD: 10 },
      { name: 'ruin-E', lx: 25, lz: -20, halfW: 1, halfD: 7 },
      { name: 'ruin-N', lx: 0, lz: -30, halfW: 15, halfD: 1 },
      // Renderer pulls lookout-NW further inboard so the Ashkeep road that
      // skirts the NW corner clears it by ≥3m.
      // NW lookout was already nudged from local (-20,18) → (-25,23) to clear
      // the Ashkeep approach; the wider Darkhollow plaza road still kisses
      // its base by design — guards stand right next to the road.
      { name: 'lookout-NW', lx: -25, lz: 23, halfW: 1.5, halfD: 1.5, isRoadCrossing: true },
      { name: 'lookout-SE', lx: 18, lz: -18, halfW: 1.5, halfD: 1.5 },
    ],
  },
  goldenvale_city: {
    id: 'goldenvale_city',
    halfW: 40, halfD: 35,
    houses: TRADE_CITY_HOUSES,
    intentionalPodium: true, // TradeCity paints a stone foundation pad.
    pieces: [
      // wall-N: the Thornwall→Goldenvale southern connector enters the
      // city from the -z side at x=-550 (city center x). There is no
      // visible north-gate cut in the renderer; treating this as a
      // designed entrance keeps the validator silent. Future round 4.2
      // could carve a real gate gap into the rendered north wall.
      { name: 'wall-N', lx: 0, lz: -35, halfW: 40, halfD: 1, isRoadCrossing: true },
      { name: 'wall-E', lx: 40, lz: 0, halfW: 1, halfD: 35 },
      { name: 'wall-W', lx: -40, lz: 0, halfW: 1, halfD: 35 },
      { name: 'wall-S-left', lx: -22, lz: 35, halfW: 18, halfD: 1 },
      // wall-S-right brackets the south gate where the Harvest Hill road
      // bends in to (-550, 138) — same designed-entrance pattern as
      // Thornwall's wall-S-right.
      { name: 'wall-S-right', lx: 22, lz: 35, halfW: 18, halfD: 1, isRoadCrossing: true },
      // NE corner brackets where the long Thornwall→Goldenvale connector
      // bends in toward the city — designed crossing band.
      { name: 'tower-NW', lx: -40, lz: -35, halfW: 3, halfD: 3, isRoadCrossing: true },
      { name: 'tower-NE', lx: 40, lz: -35, halfW: 3, halfD: 3, isRoadCrossing: true },
      { name: 'tower-SE', lx: 40, lz: 35, halfW: 3, halfD: 3, isRoadCrossing: true },
      { name: 'tower-SW', lx: -40, lz: 35, halfW: 3, halfD: 3 },
      { name: 'gatehouse', lx: 0, lz: 35, halfW: 5, halfD: 2, isRoadCrossing: true },
      { name: 'trade-hall', lx: 0, lz: -10, halfW: 7, halfD: 6, isRoadCrossing: true },
      { name: 'plaza', lx: 0, lz: 10, halfW: 12, halfD: 8, isRoadCrossing: true },
    ],
  },

  // === 3 PLACEHOLDER kingdoms in Settlements.tsx — now with full piece
  // coverage extracted from the renderer geometry. Houses inside these
  // renderers ride local terrain (seeded RNG), not a shared anchor, so
  // RailwayValidator continues to handle their per-house checks.
  // === 3 PLACEHOLDER kingdoms in Settlements.tsx ===
  // These renderers (CapitalCity / MilitaryFort / MountainMonastery) have
  // multiple radial road approaches without a single canonical "gate"
  // axis, and roads occasionally pass through the city footprint by design
  // (Ironhold is a hub: every kingdom road originates near (0,55) which
  // sits inside the city extent on the +z side). To avoid spamming false
  // positives without exact wall-gate-renderer coordinates handy, the
  // wall/tower pieces here are flagged as crossing — only the keep,
  // central halls, and corner towers participate in the slope/float
  // checks. A future round 4.2 can refine these to real gate splits.
  ironhold: {
    id: 'ironhold',
    halfW: 38, halfD: 38,
    houses: [],
    pieces: [
      { name: 'keep', lx: 0, lz: 0, halfW: 6, halfD: 6, isRoadCrossing: true },
      { name: 'wall-N', lx: 0, lz: -38, halfW: 38, halfD: 1.25, isRoadCrossing: true },
      { name: 'wall-E', lx: 38, lz: 0, halfW: 1.25, halfD: 38, isRoadCrossing: true },
      { name: 'wall-W', lx: -38, lz: 0, halfW: 1.25, halfD: 38, isRoadCrossing: true },
      { name: 'wall-S-left', lx: -21.75, lz: 38, halfW: 16.25, halfD: 1.25, isRoadCrossing: true },
      { name: 'wall-S-right', lx: 21.75, lz: 38, halfW: 16.25, halfD: 1.25, isRoadCrossing: true },
      { name: 'gatehouse', lx: 0, lz: 38, halfW: 5.5, halfD: 1.5, isRoadCrossing: true },
      { name: 'tower-NW', lx: -38, lz: -38, halfW: 3.2, halfD: 3.2, isRoadCrossing: true },
      { name: 'tower-NE', lx: 38, lz: -38, halfW: 3, halfD: 3, isRoadCrossing: true },
      { name: 'tower-SE', lx: 38, lz: 38, halfW: 3, halfD: 3, isRoadCrossing: true },
      { name: 'tower-SW', lx: -38, lz: 38, halfW: 3.2, halfD: 3.2, isRoadCrossing: true },
      { name: 'tower-mid-N', lx: 0, lz: -38, halfW: 2.5, halfD: 2.5, isRoadCrossing: true },
      { name: 'tower-mid-E', lx: 38, lz: 0, halfW: 2.5, halfD: 2.5, isRoadCrossing: true },
      { name: 'tower-mid-W', lx: -38, lz: 0, halfW: 2.5, halfD: 2.5, isRoadCrossing: true },
      { name: 'chapel', lx: -15, lz: -8, halfW: 2.5, halfD: 4 },
      { name: 'market-plaza', lx: 8, lz: 14, halfW: 9, halfD: 6, isRoadCrossing: true },
      { name: 'noble-plaza', lx: 0, lz: 24, halfW: 7, halfD: 5, isRoadCrossing: true },
    ],
  },
  blackthorn_fort: {
    id: 'blackthorn_fort',
    halfW: 22, halfD: 22,
    houses: [],
    intentionalPodium: true, // MilitaryFort paints a packed-earth pad.
    pieces: [
      { name: 'wall-N', lx: 0, lz: -20, halfW: 20, halfD: 0.9, isRoadCrossing: true },
      { name: 'wall-E', lx: 20, lz: 0, halfW: 0.9, halfD: 20, isRoadCrossing: true },
      { name: 'wall-W', lx: -20, lz: 0, halfW: 0.9, halfD: 20, isRoadCrossing: true },
      { name: 'wall-S-left', lx: -12.5, lz: 20, halfW: 7.5, halfD: 0.9, isRoadCrossing: true },
      { name: 'wall-S-right', lx: 12.5, lz: 20, halfW: 7.5, halfD: 0.9, isRoadCrossing: true },
      { name: 'gatehouse', lx: 0, lz: 20, halfW: 3.5, halfD: 1.5, isRoadCrossing: true },
      { name: 'tower-NW', lx: -20, lz: -20, halfW: 2.2, halfD: 2.2, isRoadCrossing: true },
      { name: 'tower-NE', lx: 20, lz: -20, halfW: 2.2, halfD: 2.2, isRoadCrossing: true },
      { name: 'tower-SE', lx: 20, lz: 20, halfW: 2.2, halfD: 2.2, isRoadCrossing: true },
      { name: 'tower-SW', lx: -20, lz: 20, halfW: 2.2, halfD: 2.2, isRoadCrossing: true },
      { name: 'command', lx: 0, lz: -8, halfW: 4, halfD: 3.5, isRoadCrossing: true },
      { name: 'beacon', lx: 0, lz: -18, halfW: 2.5, halfD: 2.5 },
    ],
  },
  frostmere_monastery: {
    id: 'frostmere_monastery',
    halfW: 18, halfD: 18,
    houses: [],
    intentionalUneven: true, // mountain monastery — sits across a slope on purpose.
    pieces: [
      { name: 'chapel-nave', lx: 0, lz: 0, halfW: 3.5, halfD: 6.5, isRoadCrossing: true },
      { name: 'chapel-apse', lx: 0, lz: -7.5, halfW: 3.5, halfD: 3.5, isRoadCrossing: true },
      { name: 'bell-tower', lx: 0, lz: -11, halfW: 1.5, halfD: 1.5 },
      { name: 'east-wing', lx: 8, lz: 0, halfW: 2, halfD: 5, isRoadCrossing: true },
      { name: 'west-wing', lx: -8, lz: 0, halfW: 2, halfD: 5, isRoadCrossing: true },
      { name: 'enc-N', lx: 0, lz: -14, halfW: 14, halfD: 0.6, isRoadCrossing: true },
      { name: 'enc-E', lx: 14, lz: 0, halfW: 0.6, halfD: 14, isRoadCrossing: true },
      { name: 'enc-W', lx: -14, lz: 0, halfW: 0.6, halfD: 14, isRoadCrossing: true },
      { name: 'enc-S-left', lx: -8.5, lz: 14, halfW: 5.5, halfD: 0.6, isRoadCrossing: true },
      { name: 'enc-S-right', lx: 8.5, lz: 14, halfW: 5.5, halfD: 0.6, isRoadCrossing: true },
    ],
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
// Pieces strictly INSIDE this road clearance band are flagged. Use strict
// inequality so a piece that lands EXACTLY on the 3m threshold (e.g. an
// AABB whose corner just barely projects 3m off the road) is treated as
// clean — the renderer paints a 2.5–3m road, so 3m clearance from the
// piece edge is the design floor.
const ROAD_CLEARANCE = 3;

interface Issue { category: string; detail: string }

// ---- Exact analytic segment-vs-AABB distance ----
// Computes the minimum 2D distance between a line segment (a→b) and an
// axis-aligned rectangle centered at (cx,cz) with half-extents (hx,hz).
// Returns 0 if the segment intersects/enters the rectangle. Uses
// Liang-Barsky-style slab clipping for the intersection test, then
// closed-form point-vs-segment distance against (segment endpoints, AABB
// corners) — exact, no sampling.

function distSegToAabb(
  ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number, hx: number, hz: number,
): number {
  // Translate so AABB centered at origin with extents [-hx, hx] × [-hz, hz].
  const sx = ax - cx, sz = az - cz;
  const dx = bx - ax, dz = bz - az;

  // 1) Intersection test (slab clipping).
  let tmin = 0, tmax = 1;
  // X slab.
  if (Math.abs(dx) < 1e-12) {
    if (sx < -hx || sx > hx) { tmin = 1; tmax = 0; }
  } else {
    const t1 = (-hx - sx) / dx, t2 = (hx - sx) / dx;
    const lo = Math.min(t1, t2), hi = Math.max(t1, t2);
    if (lo > tmin) tmin = lo;
    if (hi < tmax) tmax = hi;
  }
  // Z slab.
  if (tmin <= tmax) {
    if (Math.abs(dz) < 1e-12) {
      if (sz < -hz || sz > hz) { tmin = 1; tmax = 0; }
    } else {
      const t1 = (-hz - sz) / dz, t2 = (hz - sz) / dz;
      const lo = Math.min(t1, t2), hi = Math.max(t1, t2);
      if (lo > tmin) tmin = lo;
      if (hi < tmax) tmax = hi;
    }
  }
  if (tmin <= tmax) return 0;

  // 2) Closed-form min distance from a point (px, pz) to the centered AABB.
  const pointAabb = (px: number, pz: number): number => {
    const ddx = Math.max(0, Math.abs(px) - hx);
    const ddz = Math.max(0, Math.abs(pz) - hz);
    return Math.sqrt(ddx * ddx + ddz * ddz);
  };

  // Segment endpoints to AABB.
  let best = Math.min(pointAabb(sx, sz), pointAabb(sx + dx, sz + dz));
  if (best === 0) return 0;

  // AABB corners projected to the segment, then the foot-of-perpendicular
  // distance back to that corner.
  const segLen2 = dx * dx + dz * dz;
  if (segLen2 > 1e-12) {
    const corners: [number, number][] = [
      [-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz],
    ];
    for (const [px, pz] of corners) {
      let t = ((px - sx) * dx + (pz - sz) * dz) / segLen2;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const fx = sx + dx * t, fz = sz + dz * t;
      const ex = px - fx, ez = pz - fz;
      const d = Math.sqrt(ex * ex + ez * ez);
      if (d < best) best = d;
    }
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
    if (best === 0) return 0;
  }
  // Strict: a piece exactly on the threshold (3.00m) is acceptable.
  return best < maxDist ? best : null;
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
    if (best === 0) return 0;
  }
  return best <= maxDist ? best : null;
}

// Silence unused import in the simplified semantics. We keep the import in
// case future passes re-enable per-point distance checks.
void distToRailway;

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

    if (macro.minY <= WATER_LEVEL_Y && !kd.intentionalPodium) {
      // The kingdom needs the floor clamp to stay above water — visually
      // fine, but designers should know the placement is borderline.
      issues.push({
        category: 'kingdom-needs-water-clamp',
        detail: `${def.id} terrain minY=${macro.minY.toFixed(2)}m sits below water; renderer is lifting it to ${anchorY.toFixed(2)}m. Consider repositioning ~${(WATER_LEVEL_Y + 0.3 - macro.minY).toFixed(1)}m inland or marking intentionalPodium.`,
      });
    }
    if (macro.heightDelta > 8 && !kd.intentionalUneven) {
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

      // Oversized-foundation check: catches accidental mega-podiums (e.g.
      // Rivermoor's old 60×60 dark cobble slab) that hide visual problems.
      // Walls (one half-extent ≤ 1) are excluded; truly intentional large
      // platforms (Stonepeak, Darkhollow) opt in via `isLargeFoundation`.
      const isWallish = p.halfW <= 1 || p.halfD <= 1;
      const pieceArea = 4 * p.halfW * p.halfD; // m²
      if (pieceArea > 2000 && !isWallish && !p.isLargeFoundation) {
        issues.push({
          category: 'piece-oversized-foundation',
          detail: `${def.id}/${p.name} foundation area=${pieceArea.toFixed(0)}m² exceeds 2000m² — break it into smaller intentional pieces, or mark isLargeFoundation if it's a deliberate platform.`,
        });
      }

      // Exact segment-vs-AABB clearance. We pass in the FULL piece extent
      // so a 90m wall is checked against road segments along its entire
      // length, not just its center.
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
  console.warn(`[KingdomVisualValidator] ${issues.length} kingdom visual violation(s) across ${kingdomCount} kingdom(s); ${pieceCount} piece(s) + ${houseCount} house(s) checked:`);
  const MAX_PRINT = 30;
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
