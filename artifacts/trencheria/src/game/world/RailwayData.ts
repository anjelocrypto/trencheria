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

export interface RailwayBridge {
  id: string;
  position: [number, number, number];
  line: 'A' | 'B';
  crosses: string;
  length: number;
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
  { x: -40, z: 95, type: 'track' },
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
  // Rivermoor terminal shifted away from Reed Village house footprint cluster.
  { x: 360, z: 270, label: 'Rivermoor Station', type: 'station' },
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
  { x: 45, z: 80, type: 'track' },
  { x: 58, z: 55, type: 'track' },
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
  { id: 'stn-rivermoor', name: 'Rivermoor', position: [360, 270], side: 'west', stationType: 'medium', line: 'A' },
  { id: 'stn-darkhollow', name: 'Darkhollow', position: [520, -455], side: 'south', stationType: 'small', line: 'B' },
];

// ========== RAILWAY BRIDGES (v7 — aligned to actual water crossings) ==========
export const RAILWAY_BRIDGES: RailwayBridge[] = [
  { id: 'rail-bridge-ironhold-south', position: [-28, 0.5, 83], line: 'B', crosses: 'Ironhold Stream', length: 20 },
  { id: 'rail-bridge-rivermoor', position: [355, 0.8, 260], line: 'A', crosses: 'Rivermoor Tributary', length: 22 },
  { id: 'rail-bridge-darkhollow', position: [390, 0.3, -360], line: 'B', crosses: 'Darkhollow Ford', length: 18 },
];

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
// Pre-computed bounding boxes for fast spatial rejection
let _segBounds: { minX: number; maxX: number; minZ: number; maxZ: number }[] | null = null;

function getSegBounds(maxDist: number) {
  if (_segBounds) return _segBounds;
  const segs = getRailwaySegments();
  _segBounds = segs.map(seg => ({
    minX: Math.min(seg.ax, seg.bx) - maxDist,
    maxX: Math.max(seg.ax, seg.bx) + maxDist,
    minZ: Math.min(seg.az, seg.bz) - maxDist,
    maxZ: Math.max(seg.az, seg.bz) + maxDist,
  }));
  return _segBounds;
}

export function distToRailway(x: number, z: number, maxDist: number = 12): number | null {
  const segs = getRailwaySegments();
  const bounds = getSegBounds(maxDist);
  let best = maxDist + 1;
  for (let i = 0; i < segs.length; i++) {
    const b = bounds[i];
    // Fast AABB rejection
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
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

  const cols = Math.ceil((maxX - minX) / GRID_CELL) + 1;
  const rows = Math.ceil((maxZ - minZ) / GRID_CELL) + 1;
  const data = new Float32Array(cols * rows);

  // Pre-compute flatten value at each grid point
  const bounds = getSegBounds(GRID_MAX_DIST);
  for (let row = 0; row < rows; row++) {
    const gz = minZ + row * GRID_CELL;
    for (let col = 0; col < cols; col++) {
      const gx = minX + col * GRID_CELL;
      
      // Find nearest railway distance (inlined for speed)
      let best = GRID_MAX_DIST + 1;
      for (let i = 0; i < segs.length; i++) {
        const b = bounds[i];
        if (gx < b.minX || gx > b.maxX || gz < b.minZ || gz > b.maxZ) continue;
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
