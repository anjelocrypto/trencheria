/**
 * Water bodies — rivers, lakes for the expanded world.
 * Shared between renderer, terrain, and collision.
 */

export interface RiverDef {
  id: string;
  points: [number, number, number][]; // path waypoints [x, y, z]
  width: number;
}

export interface LakeDef {
  id: string;
  position: [number, number, number];
  radiusX: number;
  radiusZ: number;
  rotation: number;
}

export const RIVERS: RiverDef[] = [
  // Original river near Ironhold
  {
    id: 'river-ironhold',
    points: [[40, -0.75, -60], [35, -0.75, -20], [30, -0.75, 20], [25, -0.75, 80]],
    width: 11,
  },
  // Great River — runs NW to SE through expanded world
  {
    id: 'river-great',
    points: [
      [-350, -0.5, 350], [-250, -0.5, 250], [-100, -0.6, 150],
      [50, -0.6, 50], [200, -0.5, -50], [350, -0.5, -200],
      [450, -0.5, -320],
    ],
    width: 16,
  },
  // Rivermoor River — feeds into the river town
  {
    id: 'river-rivermoor',
    points: [
      [350, -0.4, 450], [400, -0.5, 400], [450, -0.6, 350],
      [480, -0.5, 280], [500, -0.5, 200],
    ],
    width: 14,
  },
  // Darkhollow Creek — desolate marsh water
  {
    id: 'river-darkhollow',
    points: [
      [450, -0.3, -350], [500, -0.4, -380], [550, -0.3, -430],
      [600, -0.3, -500],
    ],
    width: 8,
  },
  // ===== Railway bridge water crossings (v7) =====
  // Small tributary south of Ironhold — crossed by Line B bridge
  {
    id: 'stream-ironhold-south',
    points: [[-45, -0.35, 88], [-25, -0.4, 90], [-5, -0.35, 92]],
    width: 5,
  },
  // Rivermoor tributary — small stream crossed by Line A bridge
  {
    id: 'stream-rivermoor-crossing',
    points: [[340, -0.3, 245], [355, -0.35, 260], [370, -0.3, 275]],
    width: 5,
  },
  // Darkhollow ford — small creek crossed by Line B bridge
  {
    id: 'stream-darkhollow-ford',
    points: [[375, -0.2, -348], [390, -0.25, -360], [405, -0.2, -372]],
    width: 4,
  },
];

export const LAKES: LakeDef[] = [
  // Original pond near Ironhold
  { id: 'lake-ironhold', position: [-50, -0.55, -40], radiusX: 13, radiusZ: 13, rotation: 0 },
  // Lake Silvermere — large lake near Rivermoor
  { id: 'lake-silvermere', position: [420, -0.6, 320], radiusX: 35, radiusZ: 25, rotation: 0.3 },
  // Stonepeak Tarn — mountain lake
  { id: 'lake-tarn', position: [-380, -0.4, 480], radiusX: 18, radiusZ: 15, rotation: -0.2 },
  // Goldenvale Reservoir
  { id: 'lake-reservoir', position: [-520, -0.5, 60], radiusX: 20, radiusZ: 14, rotation: 0.1 },
  // Darkhollow Marsh pool
  { id: 'lake-marsh', position: [530, -0.3, -420], radiusX: 16, radiusZ: 12, rotation: 0.4 },
];

/**
 * Check if position is in a lake. Returns water surface Y or null.
 */
export function getLakeHeight(x: number, z: number): number | null {
  for (const lake of LAKES) {
    const cos = Math.cos(-lake.rotation);
    const sin = Math.sin(-lake.rotation);
    const lx = cos * (x - lake.position[0]) + sin * (z - lake.position[2]);
    const lz = -sin * (x - lake.position[0]) + cos * (z - lake.position[2]);
    const nx = lx / lake.radiusX;
    const nz = lz / lake.radiusZ;
    if (nx * nx + nz * nz <= 1) {
      return lake.position[1];
    }
  }
  return null;
}

/**
 * Check if position is in a river. Returns water surface Y or null.
 */
export function getRiverHeight(x: number, z: number): number | null {
  for (const river of RIVERS) {
    const pts = river.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0], az = pts[i][2];
      const bx = pts[i + 1][0], bz = pts[i + 1][2];
      const dx = bx - ax, dz = bz - az;
      const len2 = dx * dx + dz * dz;
      if (len2 < 1) continue;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
      const px = ax + t * dx, pz = az + t * dz;
      const dist = Math.sqrt((x - px) ** 2 + (z - pz) ** 2);
      if (dist < river.width / 2) {
        const py = pts[i][1] + t * (pts[i + 1][1] - pts[i][1]);
        return py;
      }
    }
  }
  return null;
}
