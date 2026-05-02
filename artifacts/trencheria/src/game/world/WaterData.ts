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
  // Original river near Ironhold — Codex audit: trimmed northern endpoint
  // from (25,80) to (25,65). Old endpoint sat directly under Line B's east
  // bypass between Ironhold Central (-20,83) and (45,80), which produced an
  // ~13u unbridged rail-water clip from x≈19 to x≈32. The river now fades
  // into marshy ground 15u south of the rail line; rail bridge over
  // river-great (length 40 at (2,82)) cleanly handles the actual crossing.
  {
    id: 'river-ironhold',
    points: [[40, -0.75, -60], [35, -0.75, -20], [30, -0.75, 20], [25, -0.75, 65]],
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
  // Rivermoor River — feeds past the river town, then south. Codex audit:
  // moved the apex east from (450,350) to (480,350) so Rivermoor settlement
  // (anchored at (450,350)) is no longer literally inside the river. This
  // also clears the Rivermoor→Darkhollow and northern-waypoint→Rivermoor
  // roads which previously started/ended in the river endpoint.
  {
    id: 'river-rivermoor',
    points: [
      [380, -0.4, 450], [430, -0.5, 400], [480, -0.6, 350],
      [500, -0.5, 280], [510, -0.5, 200],
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
  // Small tributary south of Ironhold — crossed by Line B bridge.
  // Codex audit: shortened and centered under the rail-bridge-ironhold-south
  // OBB (length-20 span at (-28,83), so deck covers x∈[-38,-18]). Stream now
  // ends at x=-25 so Line B's Ironhold Central station at (-20,83) and the
  // segment east of it stay clear of water without needing extra coverage.
  // Codex follow-up: west endpoint pulled back from x=-35 to x=-32 because
  // the Ironhold Central platform's south-west footprint corner
  // (~(-35.4, 82.4) when sampleFootprint rotates the 12×20 platform along
  // the shared east-west corridor) was clipping into the stream's 5u-wide
  // channel. Both rail segments through the stream remain fully covered by
  // the rail-bridge-ironhold-south OBB.
  {
    id: 'stream-ironhold-south',
    points: [[-32, -0.35, 83], [-30, -0.4, 83], [-25, -0.35, 83]],
    width: 5,
  },
  // Rivermoor tributary — small stream crossed by Line A bridge
  {
    id: 'stream-rivermoor-crossing',
    points: [[340, -0.3, 245], [355, -0.35, 260], [370, -0.3, 275]],
    width: 5,
  },
  // Darkhollow ford — small creek crossed by Line B bridge.
  // Codex audit: shortened so it terminates inside the rail-bridge-darkhollow
  // OBB. Line B's (390,-360)→(460,-420) seg runs nearly parallel to this
  // stream's old (390,-360)→(405,-372) channel, so the track was clipping the
  // stream for ~7u past the bridge end. New endpoint at (393,-363) keeps the
  // ford fully under the deck (length-18 OBB at (390,-360) extends ±9 along
  // bridge axis ≈ to x≈397).
  {
    id: 'stream-darkhollow-ford',
    points: [[380, -0.2, -354], [387, -0.25, -358], [393, -0.2, -363]],
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
