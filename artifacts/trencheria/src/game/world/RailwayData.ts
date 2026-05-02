/**
 * RailwayData — Single source of truth for railway routes, stations, and bridges.
 * Phase 1: Two-line cross-hub through Ironhold.
 * Line A: Thornwall (SW) ↔ Ironhold ↔ Rivermoor (NE)
 * Line B: Goldenvale (W) ↔ Ironhold ↔ Darkhollow (SE)
 *
 * v7 — visual clarity pass.
 * Key v7 changes:
 * - Line B Ironhold bypass changed from WEST (U-turn) to EAST (through-route).
 *   Now Line A exits Ironhold ENE and Line B exits ESE — clean Y-junction.
 * - All 3 railway bridge waypoints repositioned to align with actual water crossings.
 *   Added tributary streams in WaterData.ts at each bridge location.
 * - Maintains ≥15u clearance from all collision structures (verified by audit).
 *
 * Previous v6 changes preserved:
 * - Thornwall departure outside fortified wall envelope.
 * - Blackthorn corridor outside fort perimeter.
 * - Darkhollow approach south of marsh bridge + Ashkeep ruin cluster.
 * - Rivermoor terminal away from village house footprints.
 */

export interface RailwayWaypoint {
  x: number;
  z: number;
  label?: string;
  type: 'track' | 'station' | 'bridge';
}

export interface RailwayStation {
  id: string;
  name: string;
  position: [number, number];
  side: string;
  stationType: 'capital' | 'large' | 'medium' | 'small';
  line: 'A' | 'B' | 'AB';
}

/**
 * Station platform dimensions, keyed by stationType.
 * Owned here (world data layer) so terrain flatten, the validator, and the
 * renderer all see one source of truth for footprint size.
 */
export interface StationDims {
  platW: number; platL: number;
  shelterW: number; shelterL: number;
  shelterH: number;
  numLamps: number;
}

export const STATION_DIMS: Record<string, StationDims> = {
  capital: { platW: 10, platL: 18, shelterW: 5.5, shelterL: 10, shelterH: 3.5, numLamps: 6 },
  large:   { platW: 7,  platL: 14, shelterW: 4.5, shelterL: 8,  shelterH: 3.2, numLamps: 4 },
  medium:  { platW: 6,  platL: 11, shelterW: 3.8, shelterL: 6.5, shelterH: 3,  numLamps: 3 },
  small:   { platW: 4,  platL: 8,  shelterW: 3,   shelterL: 5,  shelterH: 2.8, numLamps: 2 },
};

export interface RailwayBridge {
  id: string;
  position: [number, number, number];
  line: 'A' | 'B';
  crosses: string;
  length: number;
}

/** Rail × road grade crossings (planked deck + warning crosses). */
export interface LevelCrossing {
  id: string;
  position: [number, number]; // [x, z] in world space
  trackAngle: number;          // radians, atan2(dx, dz) along the track
  size: number;                // half-length of the planked deck along the track
  description: string;
}

// ========== LINE A: Thornwall → Ironhold → Rivermoor (v6 — strict intrusion pass) ==========
export const LINE_A_WAYPOINTS: RailwayWaypoint[] = [
  // Thornwall perimeter bypass: keep route outside fortified city wall envelope.
  { x: -480, z: -520, label: 'Thornwall Station', type: 'station' },
  { x: -435, z: -520, type: 'track' },
  { x: -400, z: -470, type: 'track' },
  { x: -400, z: -400, type: 'track' },
  { x: -360, z: -370, type: 'track' },
  { x: -320, z: -330, type: 'track' },
  { x: -280, z: -280, label: 'Western Marches', type: 'track' },
  { x: -240, z: -240, type: 'track' },
  { x: -190, z: -200, type: 'track' },
  { x: -150, z: -170, label: 'Greenmeadow Station', type: 'station' },
  // Greenmeadow south bypass: avoid village interior house ring.
  { x: -130, z: -190, type: 'track' },
  { x: -100, z: -150, type: 'track' },
  { x: -80, z: -70, type: 'track' },
  // Ironhold west-wall bypass: keep x <= -55 through wall-adjacent corridor.
  { x: -72, z: -20, type: 'track' },
  { x: -60, z: 30, type: 'track' },
  { x: -55, z: 55, type: 'track' },
  // Bridge waypoint where Line A clips the relocated stream-ironhold-south
  // tributary — without this the (-55,55)→(-40,95) leg ran over open water.
  { x: -43, z: 88, label: 'Ironhold Tributary Bridge', type: 'bridge' },
  { x: -40, z: 95, type: 'track' },
  // Bridge waypoint at actual River Great crossing — fixes prior unbridged water cross.
  { x: -26, z: 100.6, label: 'River Great Bridge', type: 'bridge' },
  { x: -20, z: 103, label: 'Ironhold Central', type: 'station' },
  { x: 30, z: 108, type: 'track' },
  { x: 90, z: 105, type: 'track' },
  { x: 125, z: 15, label: 'Frostmere Bypass', type: 'track' },
  { x: 220, z: 45, type: 'track' },
  { x: 280, z: 100, type: 'track' },
  { x: 296, z: 133, type: 'track' },
  { x: 330, z: 200, type: 'track' },
  { x: 350, z: 250, type: 'track' },
  { x: 355, z: 260, label: 'Rivermoor River Bridge', type: 'bridge' },
  // Rivermoor terminal: shifted NE off the stream-rivermoor-crossing endpoint
  // (at (370,275)) and away from the Reed Village house cluster. Sits on the
  // dry rise between the stream and Lake Silvermere.
  { x: 370, z: 285, label: 'Rivermoor Station', type: 'station' },
];

// ========== LINE B: Goldenvale → Ironhold → Darkhollow (v7 — visual clarity pass) ==========
// v7 changes:
// - Eliminated U-turn at Ironhold. Line B now exits EAST, bypasses around Ironhold's
//   east wall, then curves north toward Blackthorn/Darkhollow. This creates a clean
//   Y-junction at Ironhold Central (Line A exits ENE, Line B exits ESE).
// - Bridge waypoint repositioned to align with new tributary stream crossing.
export const LINE_B_WAYPOINTS: RailwayWaypoint[] = [
  // Goldenvale outer approach: shifted away from Harvest Hill houses.
  { x: -470, z: 185, label: 'Goldenvale Station', type: 'station' },
  { x: -430, z: 160, type: 'track' },
  { x: -380, z: 100, type: 'track' },
  { x: -300, z: 90, type: 'track' },
  { x: -220, z: 75, type: 'track' },
  { x: -130, z: 82, type: 'track' },
  { x: -70, z: 84, type: 'track' },
  { x: -40, z: 83, type: 'track' },
  { x: -28, z: 83, label: 'Ironhold South Bridge', type: 'bridge' },
  { x: -20, z: 83, label: 'Ironhold Central', type: 'station' },
  // East bypass around Ironhold exterior (clean through-route, no U-turn).
  // Stays ≥18u from east wall (x=38) and corner towers (r=3.2).
  // Bridge waypoint repositioned from (25,81) to (2,82) — Codex audit found
  // Line B between Ironhold Central (-20,83) and (45,80) crosses river-great
  // for a 32u stretch x∈[-13.5, 19] (river center crosses z=82 at x=2). The
  // rail-bridge-river-great-ironhold deck (length 40) now spans the whole
  // crossing.
  { x: 2, z: 82, label: 'River Great (Ironhold) Bridge', type: 'bridge' },
  { x: 45, z: 80, type: 'track' },
  { x: 58, z: 55, type: 'track' },
  // Bridge waypoint over the eastern fork of River Great — Line B previously
  // dipped into the 16u-wide channel between (58,55) and (65,15) at (60,43).
  { x: 60, z: 43, label: 'River Great East Bridge', type: 'bridge' },
  { x: 65, z: 15, type: 'track' },
  { x: 60, z: -35, type: 'track' },
  { x: 45, z: -75, type: 'track' },
  { x: 30, z: -100, type: 'track' },
  { x: 80, z: -100, type: 'track' },
  { x: 110, z: -120, type: 'track' },
  // Blackthorn reroute: stay outside fort perimeter and tower buffer.
  { x: 130, z: -145, type: 'track' },
  { x: 140, z: -200, label: 'Blackthorn Halt', type: 'station' },
  { x: 210, z: -235, type: 'track' },
  { x: 290, z: -270, type: 'track' },
  { x: 360, z: -315, type: 'track' },
  // Darkhollow reroute: avoid marsh bridge approach and Ashkeep ruin interior.
  { x: 390, z: -360, label: 'Darkhollow Creek Bridge', type: 'bridge' },
  { x: 460, z: -420, type: 'track' },
  { x: 520, z: -455, label: 'Darkhollow Station', type: 'station' },
];

// ========== STATIONS (v6 — positions match corrected waypoints) ==========
export const RAILWAY_STATIONS: RailwayStation[] = [
  { id: 'stn-thornwall', name: 'Thornwall', position: [-480, -520], side: 'north', stationType: 'large', line: 'A' },
  { id: 'stn-greenmeadow', name: 'Greenmeadow', position: [-150, -170], side: 'south', stationType: 'small', line: 'A' },
  { id: 'stn-ironhold', name: 'Ironhold Central', position: [-45, 89], side: 'south', stationType: 'capital', line: 'AB' },
  { id: 'stn-goldenvale', name: 'Goldenvale', position: [-470, 185], side: 'east', stationType: 'medium', line: 'B' },
  { id: 'stn-blackthorn', name: 'Blackthorn Halt', position: [140, -200], side: 'west', stationType: 'small', line: 'B' },
  { id: 'stn-rivermoor', name: 'Rivermoor', position: [370, 285], side: 'west', stationType: 'medium', line: 'A' },
  { id: 'stn-darkhollow', name: 'Darkhollow', position: [520, -455], side: 'south', stationType: 'small', line: 'B' },
];

// ========== RAILWAY BRIDGES (v7 — aligned to actual water crossings) ==========
export const RAILWAY_BRIDGES: RailwayBridge[] = [
  { id: 'rail-bridge-ironhold-south', position: [-28, 0.5, 83], line: 'B', crosses: 'Ironhold Stream', length: 20 },
  { id: 'rail-bridge-ironhold-east', position: [2, 0.3, 82], line: 'B', crosses: 'River Great (Ironhold reach)', length: 40 },
  { id: 'rail-bridge-ironhold-tributary', position: [-43, 0.4, 88], line: 'A', crosses: 'Ironhold Tributary (Line A)', length: 14 },
  { id: 'rail-bridge-river-great', position: [-26, 0.3, 100.6], line: 'A', crosses: 'River Great', length: 26 },
  { id: 'rail-bridge-river-great-east', position: [60, 0.4, 43], line: 'B', crosses: 'River Great (eastern fork)', length: 26 },
  { id: 'rail-bridge-rivermoor', position: [355, 0.8, 260], line: 'A', crosses: 'Rivermoor Tributary', length: 22 },
  { id: 'rail-bridge-darkhollow', position: [390, 0.3, -360], line: 'B', crosses: 'Darkhollow Ford', length: 18 },
];

// ========== LEVEL CROSSINGS (rail × road grade crossings) ==========
// Coordinates and trackAngles computed from the validator's segment-intersect
// output for the current LINE_A / LINE_B / ROADS data. If you change waypoints
// or roads, re-run the dev validator and update this table.
export const LEVEL_CROSSINGS: LevelCrossing[] = [
  // ----- Ironhold radial corridor (Line A + Line B cross all six radial roads) -----
  {
    id: 'lc-ironhold-west-corridor',
    position: [-74.2, -33.6],
    trackAngle: Math.atan2(8, 50),       // Line A: (-80,-70)→(-72,-20)
    size: 4,
    description: 'Line A × Ironhold–Greenmeadow + Millbrook–Ironhold radials',
  },
  {
    id: 'lc-blackthorn-radial',
    position: [62.6, -9.3],
    trackAngle: Math.atan2(-5, -50),     // Line B: (65,15)→(60,-35)
    size: 4,
    description: 'Line B × Ironhold–Blackthorn radial road',
  },
  {
    id: 'lc-ashwood-radial-a',
    position: [-47.3, 75.5],
    trackAngle: Math.atan2(12, 33),      // Line A: (-55,55)→(-43,88)
    size: 4,
    description: 'Line A × Ironhold–Ashwood radial road',
  },
  {
    id: 'lc-ashwood-radial-b',
    position: [-66.8, 83.9],
    trackAngle: Math.atan2(30, -1),      // Line B: (-70,84)→(-40,83)
    size: 4,
    description: 'Line B × Ironhold–Ashwood radial road',
  },
  {
    id: 'lc-old-veyra-radial-a',
    position: [101.4, 75.8],
    trackAngle: Math.atan2(35, -90),     // Line A: (90,105)→(125,15)
    size: 4,
    description: 'Line A × Ironhold–Old Veyra radial road',
  },
  {
    id: 'lc-old-veyra-radial-b',
    position: [52.4, 65.8],
    trackAngle: Math.atan2(13, -25),     // Line B: (45,80)→(58,55)
    size: 4,
    description: 'Line B × Ironhold–Old Veyra radial road',
  },
  {
    id: 'lc-blackthorn-old-veyra',
    position: [192.7, 36.4],
    trackAngle: Math.atan2(95, 30),      // Line A: (125,15)→(220,45)
    size: 4,
    description: 'Line A × Blackthorn–Old Veyra road',
  },
  // ----- Outer-ring road crossings -----
  {
    id: 'lc-blackthorn-ravenwatch',
    position: [134.4, -169.1],
    trackAngle: Math.atan2(10, -55),     // Line B: (130,-145)→(140,-200)
    size: 4,
    description: 'Line B × Ravenwatch–Blackthorn road',
  },
  {
    id: 'lc-greenmeadow-ravenwatch',
    position: [-101.4, -151.8],
    trackAngle: Math.atan2(30, 40),      // Line A: (-130,-190)→(-100,-150)
    size: 4,
    description: 'Line A × Greenmeadow–Ravenwatch road',
  },
  {
    id: 'lc-ashwood-greenmeadow',
    position: [-178.4, 78.2],
    trackAngle: Math.atan2(90, 7),       // Line B: (-220,75)→(-130,82)
    size: 4,
    description: 'Line B × Ashwood–Greenmeadow road',
  },
  {
    id: 'lc-goldenvale-trade',
    position: [-409.0, 134.8],
    trackAngle: Math.atan2(50, -60),     // Line B: (-430,160)→(-380,100)
    size: 4,
    description: 'Line B × Goldenvale trade road',
  },
];

// Rail bridge deck width (matches RailwayBridges.tsx deckW)
const RAIL_BRIDGE_DECK_W = 3.2;
// Deck top above bridge.position[1] (matches deck mesh y=1.0 + 0.25 thickness/2 ≈ 1.0 surface)
const RAIL_BRIDGE_DECK_OFFSET = 1.0;

const _railBridgeAngles: number[] = [];
let _railBridgeAnglesBuilt = false;

function buildRailBridgeAngles() {
  for (const b of RAILWAY_BRIDGES) {
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
    _railBridgeAngles.push(Math.atan2(next.x - prev.x, next.z - prev.z));
  }
  _railBridgeAnglesBuilt = true;
}

/**
 * Returns the deck height at (x,z) if it lies on a railway bridge, else null.
 * OBB check using each bridge's track-aligned rotation, length, and deck width.
 */
export function getRailBridgeHeight(x: number, z: number): number | null {
  if (!_railBridgeAnglesBuilt) buildRailBridgeAngles();
  for (let i = 0; i < RAILWAY_BRIDGES.length; i++) {
    const b = RAILWAY_BRIDGES[i];
    const angle = _railBridgeAngles[i];
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const dx = x - b.position[0];
    const dz = z - b.position[2];
    const lx = cos * dx + sin * dz;
    const lz = -sin * dx + cos * dz;
    if (Math.abs(lx) <= RAIL_BRIDGE_DECK_W / 2 + 0.5 && Math.abs(lz) <= b.length / 2) {
      return b.position[1] + RAIL_BRIDGE_DECK_OFFSET;
    }
  }
  return null;
}

/**
 * Railway path segments for terrain flattening.
 * Pre-computed from waypoints for efficient distance queries.
 */
export interface RailSegment {
  ax: number; az: number;
  bx: number; bz: number;
  len2: number;
}

// Cache invalidation: these are lazily built from the waypoint arrays above.
// If waypoints change (e.g. v4 clearance fix), caches rebuild on next access.
let _cachedSegments: RailSegment[] | null = null;

export function getRailwaySegments(): RailSegment[] {
  if (_cachedSegments) return _cachedSegments;
  const segs: RailSegment[] = [];
  const addLine = (wps: RailwayWaypoint[]) => {
    for (let i = 0; i < wps.length - 1; i++) {
      const dx = wps[i + 1].x - wps[i].x;
      const dz = wps[i + 1].z - wps[i].z;
      segs.push({
        ax: wps[i].x, az: wps[i].z,
        bx: wps[i + 1].x, bz: wps[i + 1].z,
        len2: dx * dx + dz * dz,
      });
    }
  };
  addLine(LINE_A_WAYPOINTS);
  addLine(LINE_B_WAYPOINTS);
  _cachedSegments = segs;
  return segs;
}

/**
 * Get distance from point to nearest railway track segment.
 * Returns [distance, interpolatedFraction] or null if > maxDist.
 */
// Pre-computed unpadded bounding boxes for fast spatial rejection.
// maxDist is applied per query so different callers (e.g. distToRailway with
// the default 12u, getRailFlattenGrid with 11u, validator with up to 36u) all
// share a single cache. Earlier versions stored padded bounds keyed off the
// first caller's maxDist, which silently truncated wider queries.
let _segBounds: { minX: number; maxX: number; minZ: number; maxZ: number }[] | null = null;

function getSegBounds() {
  if (_segBounds) return _segBounds;
  const segs = getRailwaySegments();
  _segBounds = segs.map(seg => ({
    minX: Math.min(seg.ax, seg.bx),
    maxX: Math.max(seg.ax, seg.bx),
    minZ: Math.min(seg.az, seg.bz),
    maxZ: Math.max(seg.az, seg.bz),
  }));
  return _segBounds;
}

export function distToRailway(x: number, z: number, maxDist: number = 12): number | null {
  const segs = getRailwaySegments();
  const bounds = getSegBounds();
  let best = maxDist + 1;
  for (let i = 0; i < segs.length; i++) {
    const b = bounds[i];
    // Fast AABB rejection — pad the cached unpadded bounds by maxDist
    if (x < b.minX - maxDist || x > b.maxX + maxDist ||
        z < b.minZ - maxDist || z > b.maxZ + maxDist) continue;
    const seg = segs[i];
    if (seg.len2 < 1) continue;
    const dx = seg.bx - seg.ax, dz = seg.bz - seg.az;
    const t = Math.max(0, Math.min(1, ((x - seg.ax) * dx + (z - seg.az) * dz) / seg.len2));
    const px = seg.ax + t * dx, pz = seg.az + t * dz;
    const ex = x - px, ez = z - pz;
    const dist = Math.sqrt(ex * ex + ez * ez);
    if (dist < best) best = dist;
  }
  return best <= maxDist ? best : null;
}

/**
 * Precomputed railway flatten grid.
 * Built once on first access. Stores flatten intensity (0-1) on a coarse grid.
 * Terrain samples this via bilinear interpolation — zero per-vertex segment scans.
 */
const GRID_CELL = 6; // 6-unit cells
const RAIL_HALF_WIDTH = 7;
const GRID_MAX_DIST = RAIL_HALF_WIDTH + 4;

interface RailFlattenGrid {
  data: Float32Array;
  cols: number;
  rows: number;
  originX: number;
  originZ: number;
  cell: number;
  sample(x: number, z: number): number;
}

let _flattenGrid: RailFlattenGrid | null = null;

/**
 * Station platform pads — extra circular flat zones merged into the rail
 * flatten grid. Stations sit OFFSET (platW/2 + 2.5) from the rail centerline,
 * which puts platform corners outside RAIL_HALF_WIDTH=7 where raw terrain
 * noise pokes through. Each pad fully flattens (target = railTarget =
 * regional * 0.3 in Terrain.tsx) over the rotated platform footprint plus a
 * one-cell buffer so bilinear samples at footprint corners always read 1.0.
 */
interface StationPad {
  cx: number;
  cz: number;
  innerR: number;
  outerR: number;
}

let _stationPads: StationPad[] | null = null;

function getStationPads(): StationPad[] {
  if (_stationPads) return _stationPads;
  const pads: StationPad[] = [];
  for (const station of RAILWAY_STATIONS) {
    const [sx, sz] = station.position;
    const dims = STATION_DIMS[station.stationType] || STATION_DIMS.small;

    let cx: number, cz: number;
    let halfW: number, halfL: number;

    if (station.line === 'AB') {
      // Ironhold Central — custom 12×20 island platform centered on station
      // position (matches IronholdCentralStation in RailwayStations.tsx).
      cx = sx;
      cz = sz;
      halfW = 6;
      halfL = 10;
    } else {
      // Generic side-platform: offset platW/2 + 2.5 from the rail centerline
      // along the side normal at the station's nearest waypoint pair. Same
      // formula used by the renderer (StationRenderer) and the validator.
      const wps = station.line === 'B' ? LINE_B_WAYPOINTS : LINE_A_WAYPOINTS;
      let bestIdx = 0, bestD = Infinity;
      for (let i = 0; i < wps.length; i++) {
        const dx = wps[i].x - sx;
        const dz = wps[i].z - sz;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; bestIdx = i; }
      }
      const prev = wps[Math.max(0, bestIdx - 1)];
      const next = wps[Math.min(wps.length - 1, bestIdx + 1)];
      const trackAngle = Math.atan2(next.x - prev.x, next.z - prev.z);
      const sideAngle = trackAngle + Math.PI / 2;
      const sideDir = station.side === 'south' || station.side === 'west' ? -1 : 1;
      const offset = dims.platW / 2 + 2.5;
      cx = sx + Math.sin(sideAngle) * offset * sideDir;
      cz = sz + Math.cos(sideAngle) * offset * sideDir;
      halfW = dims.platW / 2;
      halfL = dims.platL / 2;
    }

    // Inner radius covers the rotated footprint corners plus one grid cell
    // so bilinear interpolation at any footprint sample reads 1.0 from four
    // fully-flat neighbours. Outer adds a 4u cosine falloff.
    const corner = Math.sqrt(halfW * halfW + halfL * halfL);
    const innerR = corner + GRID_CELL + 1;
    const outerR = innerR + 4;
    pads.push({ cx, cz, innerR, outerR });
  }
  _stationPads = pads;
  return pads;
}

export function getRailFlattenGrid(): RailFlattenGrid {
  if (_flattenGrid) return _flattenGrid;

  // Compute grid bounds from railway segments with padding
  const segs = getRailwaySegments();
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const seg of segs) {
    minX = Math.min(minX, seg.ax, seg.bx);
    maxX = Math.max(maxX, seg.ax, seg.bx);
    minZ = Math.min(minZ, seg.az, seg.bz);
    maxZ = Math.max(maxZ, seg.az, seg.bz);
  }
  // Pad by max influence distance
  const pad = GRID_MAX_DIST + GRID_CELL;
  minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;

  // Extend grid to fully cover any station pad that sticks out past the
  // rail-centerline bounding box (offset platforms can reach ~20u sideways).
  const stationPads = getStationPads();
  for (const p of stationPads) {
    const ext = p.outerR + GRID_CELL;
    if (p.cx - ext < minX) minX = p.cx - ext;
    if (p.cx + ext > maxX) maxX = p.cx + ext;
    if (p.cz - ext < minZ) minZ = p.cz - ext;
    if (p.cz + ext > maxZ) maxZ = p.cz + ext;
  }

  const cols = Math.ceil((maxX - minX) / GRID_CELL) + 1;
  const rows = Math.ceil((maxZ - minZ) / GRID_CELL) + 1;
  const data = new Float32Array(cols * rows);

  // Pre-compute flatten value at each grid point
  const bounds = getSegBounds();
  for (let row = 0; row < rows; row++) {
    const gz = minZ + row * GRID_CELL;
    for (let col = 0; col < cols; col++) {
      const gx = minX + col * GRID_CELL;
      
      // Find nearest railway distance (inlined for speed)
      let best = GRID_MAX_DIST + 1;
      for (let i = 0; i < segs.length; i++) {
        const b = bounds[i];
        if (gx < b.minX - GRID_MAX_DIST || gx > b.maxX + GRID_MAX_DIST ||
            gz < b.minZ - GRID_MAX_DIST || gz > b.maxZ + GRID_MAX_DIST) continue;
        const seg = segs[i];
        if (seg.len2 < 1) continue;
        const dx = seg.bx - seg.ax, dz = seg.bz - seg.az;
        const t = Math.max(0, Math.min(1, ((gx - seg.ax) * dx + (gz - seg.az) * dz) / seg.len2));
        const px = seg.ax + t * dx, pz = seg.az + t * dz;
        const ex = gx - px, ez = gz - pz;
        const dist = Math.sqrt(ex * ex + ez * ez);
        if (dist < best) best = dist;
      }

      // Compute flatten intensity
      let flatten = 0;
      if (best <= RAIL_HALF_WIDTH) {
        const t = best / RAIL_HALF_WIDTH;
        flatten = t < 0.6 ? 1.0 : 0.5 + 0.5 * Math.cos((t - 0.6) / 0.4 * Math.PI);
        flatten *= 0.85;
      }

      // Station pad flatten — fully levels the platform footprint to the
      // same target the rail uses (railTarget = regional*0.3 in Terrain).
      // Inner zone f=1.0; falloff zone uses cosine to 0.
      let stationFlatten = 0;
      for (let p = 0; p < stationPads.length; p++) {
        const pd = stationPads[p];
        const dxp = gx - pd.cx, dzp = gz - pd.cz;
        const distP = Math.sqrt(dxp * dxp + dzp * dzp);
        if (distP >= pd.outerR) continue;
        let f: number;
        if (distP <= pd.innerR) {
          f = 1.0;
        } else {
          const t = (distP - pd.innerR) / (pd.outerR - pd.innerR);
          f = 0.5 + 0.5 * Math.cos(t * Math.PI);
        }
        if (f > stationFlatten) stationFlatten = f;
      }

      if (stationFlatten > flatten) flatten = stationFlatten;
      data[row * cols + col] = flatten;
    }
  }

  _flattenGrid = {
    data, cols, rows,
    originX: minX,
    originZ: minZ,
    cell: GRID_CELL,
    sample(x: number, z: number): number {
      // Bilinear interpolation from precomputed grid
      const fx = (x - this.originX) / this.cell;
      const fz = (z - this.originZ) / this.cell;
      
      // Fast bounds check — return 0 if outside grid
      if (fx < 0 || fz < 0 || fx >= this.cols - 1 || fz >= this.rows - 1) return 0;
      
      const ix = fx | 0; // floor
      const iz = fz | 0;
      const tx = fx - ix;
      const tz = fz - iz;
      
      const i00 = iz * this.cols + ix;
      const v00 = this.data[i00];
      const v10 = this.data[i00 + 1];
      const v01 = this.data[i00 + this.cols];
      const v11 = this.data[i00 + this.cols + 1];
      
      // Bilinear
      return (v00 * (1 - tx) * (1 - tz) +
              v10 * tx * (1 - tz) +
              v01 * (1 - tx) * tz +
              v11 * tx * tz);
    },
  };

  console.log(`[Railway] Flatten grid built: ${cols}x${rows} = ${cols * rows} cells (${(data.byteLength / 1024).toFixed(1)} KB)`);
  return _flattenGrid;
}
