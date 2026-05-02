/**
 * Bridge definitions — shared between renderer, terrain, and collision.
 *
 * v2 — Codex audit alignment pass.
 * Each road bridge is positioned on the actual road centerline with rotation
 * matching the road's heading (atan2(dx, dz)). Bridges that span water sit
 * directly over the river/lake crossing point.
 */

export interface BridgeDef {
  id: string;
  position: [number, number, number]; // center of bridge deck
  rotation: number; // Y rotation in radians
  length: number;
  width: number;
  style: 'stone' | 'wood' | 'grand';
}

export const BRIDGES: BridgeDef[] = [
  // Ironhold → Blackthorn road [0,55]→[185,-135] crossing river-ironhold near (29.6, 24.6).
  // road dir = (185,-190); rotation = atan2(185,-190) ≈ 2.371 rad.
  {
    id: 'bridge-ironhold-river',
    position: [30, 0.5, 24],
    rotation: 2.371,
    length: 24,
    width: 5,
    style: 'stone',
  },
  // Reed Village → Rivermoor road [400,300]→[450,350] runs straight through
  // lake-silvermere at (420,320). Bridge is a long causeway across the lake.
  // road dir = (50,50); rotation = atan2(50,50) = π/4 ≈ 0.785 rad.
  // Codex follow-up: original 64u causeway centered at (420,320) extended to
  // (442.6, 342.6), which sat inside Rivermoor's house ring (centered at
  // (450,350)). Pulled centre west to (410,310) and shortened to length 40 so
  // the bridge sits over the deepest part of lake-silvermere instead of
  // marching into the kingdom. New extent ≈ (395.9,295.9)→(424.1,324.1) clears
  // RIVER_TOWN_HOUSES at (430..443, 327..342) by ≥6u.
  //
  // Known residual: validator still warns "road-water-no-bridge at ~(426,326)"
  // for the last ~16u of the road inside the lake on the kingdom-side shore.
  // Geometry constraint: any bridge length ≥48 reintroduces a kingdom-house
  // overlap (waterfront[0] corner at lz=25.17 vs halfL+2). The kingdom-clear
  // constraint is prioritised — visually the road approaches Rivermoor as a
  // shallow ford / quay rather than an engineered crossing past the deck.
  {
    id: 'bridge-rivermoor-approach',
    position: [410, 0.5, 310],
    rotation: 0.785,
    length: 40,
    width: 5,
    style: 'grand',
  },
  // Goldenvale trade road — placed on midpoint road [-320,120]→[-500,150]
  // for visual coherence (no specific water crossing here).
  // road dir = (-180,30); rotation = atan2(-180,30) ≈ -1.405 rad.
  {
    id: 'bridge-goldenvale-trade',
    position: [-410, 0.5, 135],
    rotation: -1.405,
    length: 22,
    width: 4.5,
    style: 'stone',
  },
  // Darkhollow marsh approach — relocated onto the actual river-great crossing
  // along road [340,-260]→[500,-350]. The road grazes river-great's seg
  // (350,-200)→(450,-320) (lines don't formally intersect, road just dips
  // within 8u for ~25u of length, t∈[0.587,0.72]). Bridge centered at the
  // midpoint of that traversal — exactly on the road centerline — with
  // rotation matching road dir = atan2(160,-90) ≈ 2.087 rad and length 36
  // to comfortably cover the 25u in-water section.
  {
    id: 'bridge-darkhollow-marsh',
    position: [444.5, 0.3, -318.8],
    rotation: 2.087,
    length: 36,
    width: 4,
    style: 'wood',
  },
  // ===== Codex audit additions: river-great road bridges =====
  // Ironhold → Old Veyra road [0,55]→[195,95] crosses river-great near (32.5,61.7).
  // road dir = (195,40); rotation = atan2(195,40) ≈ 1.367 rad.
  {
    id: 'bridge-old-veyra-river',
    position: [32.5, 0.4, 61.7],
    rotation: 1.367,
    length: 28,
    width: 5,
    style: 'stone',
  },
  // Blackthorn → Old Veyra road [185,-155]→[195,95] crosses river-great near (190,-45).
  // road dir = (10,250); rotation = atan2(10,250) ≈ 0.040 rad.
  {
    id: 'bridge-blackthorn-veyra-river',
    position: [190, 0.4, -45],
    rotation: 0.040,
    length: 28,
    width: 4,
    style: 'stone',
  },
  // Ashwood → Frostmere mountain trail [-185,135]→[155,195] crosses river-great near (-100,150).
  // road dir = (340,60); rotation = atan2(340,60) ≈ 1.396 rad.
  {
    id: 'bridge-ashwood-frostmere-river',
    position: [-100, 0.4, 150],
    rotation: 1.396,
    length: 28,
    width: 4,
    style: 'wood',
  },
  // Ironhold → Stonepeak (rerouted) crosses river-great perpendicular at (-220,230)
  // along the north leg [-220,200]→[-220,285]. road dir = (0,85); rotation = 0.
  // Perpendicular crossing keeps the deck short (24u) and visually coherent.
  {
    id: 'bridge-stonepeak-river',
    position: [-220, 0.5, 230],
    rotation: 0,
    length: 24,
    width: 4.5,
    style: 'stone',
  },
];

/**
 * Intentional fords / shallow quays — places where a road legitimately enters
 * the water as a wadeable crossing rather than an engineered bridge. The
 * RailwayValidator suppresses "road-water-no-bridge" warnings for points
 * inside any ford radius. Render these as visible shoreline causeways /
 * shallows in-world (handled by the kingdom renderer where applicable).
 */
export interface FordDef {
  id: string;
  position: [number, number]; // (x, z) center on the road
  radius: number;             // suppression radius in world units
  /** Y-rotation in radians of the road heading at the ford, used by the
   *  visible mesh so plank decks/posts align with the actual road direction
   *  rather than world axes. atan2(dx, dz) along the road segment. */
  heading: number;
  note: string;
}

export const INTENTIONAL_FORDS: FordDef[] = [
  // Rivermoor approach — the road [400,300]→[450,350] enters lake-silvermere's
  // shallow NE shore right next to the kingdom's waterfront houses. A bridge
  // long enough to cover the full submerged stretch would re-overlap those
  // houses, so the last ~16u read as a quayside causeway / wadeable approach
  // (rendered by the lakeside in NewKingdomRenderers' river_town variant).
  {
    id: 'ford-rivermoor-quay',
    position: [432, 332],
    radius: 14,
    // Road heads NE on a 45° diagonal: atan2(450-400, 350-300) = π/4.
    heading: Math.PI / 4,
    note: 'shallow shoreline approach to Rivermoor (lake-silvermere NE quay)',
  },
];

export function inIntentionalFord(x: number, z: number): FordDef | null {
  for (const f of INTENTIONAL_FORDS) {
    const dx = x - f.position[0], dz = z - f.position[1];
    if (dx * dx + dz * dz <= f.radius * f.radius) return f;
  }
  return null;
}

/**
 * Check if a world position is on a bridge. Returns bridge deck height or null.
 */
export function getBridgeHeight(x: number, z: number): number | null {
  for (const bridge of BRIDGES) {
    const cos = Math.cos(-bridge.rotation);
    const sin = Math.sin(-bridge.rotation);
    const lx = cos * (x - bridge.position[0]) + sin * (z - bridge.position[2]);
    const lz = -sin * (x - bridge.position[0]) + cos * (z - bridge.position[2]);

    if (Math.abs(lx) <= bridge.width / 2 + 0.5 && Math.abs(lz) <= bridge.length / 2) {
      // Deck visual at py+0.8, thickness 0.4 → surface = py+0.8+0.2 = py+1.0
      return bridge.position[1] + 1.0;
    }
  }
  return null;
}
