/**
 * ResourceSpatialGrid — bucketed lookup over WorldResources for hot per-frame queries.
 *
 * The Player interaction loop runs every frame and used to scan ALL resources to find
 * the nearest gatherable. With ~1k+ trees/rocks/etc that's the dominant cost in the
 * Player useFrame. This grid buckets resources by world cell so the per-frame scan
 * only visits resources within INTERACTION_RANGE of the player.
 *
 * Resources are stable in position — we only rebuild the grid when the resources
 * array reference changes (i.e. when the world is loaded or a new batch is pushed).
 * Depleted/gatherable flags are checked at query time on the live resource object.
 */

import { WorldResource } from '../systems/WorldResources';

const CELL_SIZE = 8;

export interface ResourceGrid {
  cells: Map<string, WorldResource[]>;
  cellSize: number;
}

function cellKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function buildResourceGrid(resources: WorldResource[]): ResourceGrid {
  const cells = new Map<string, WorldResource[]>();
  for (let i = 0; i < resources.length; i++) {
    const r = resources[i];
    const cx = Math.floor(r.position[0] / CELL_SIZE);
    const cz = Math.floor(r.position[2] / CELL_SIZE);
    const k = cellKey(cx, cz);
    let bucket = cells.get(k);
    if (!bucket) {
      bucket = [];
      cells.set(k, bucket);
    }
    bucket.push(r);
  }
  return { cells, cellSize: CELL_SIZE };
}

/**
 * Iterate all resources whose cell overlaps the (x, z) ± radius window.
 * Uses a callback to avoid per-frame array allocation.
 */
export function forEachNearbyResource(
  grid: ResourceGrid,
  x: number,
  z: number,
  radius: number,
  fn: (r: WorldResource) => void,
): void {
  const cellRange = Math.ceil(radius / grid.cellSize);
  const cx = Math.floor(x / grid.cellSize);
  const cz = Math.floor(z / grid.cellSize);
  for (let dx = -cellRange; dx <= cellRange; dx++) {
    for (let dz = -cellRange; dz <= cellRange; dz++) {
      const bucket = grid.cells.get(cellKey(cx + dx, cz + dz));
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) fn(bucket[i]);
    }
  }
}
