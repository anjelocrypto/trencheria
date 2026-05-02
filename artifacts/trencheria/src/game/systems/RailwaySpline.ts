/**
 * RailwaySpline — lightweight spline utilities for train movement.
 * Uses linear interpolation between waypoints + terrain height.
 */
import * as THREE from 'three';
import { RailwayWaypoint } from '../world/RailwayData';
import { getRailGroundHeight } from './Grounding';

// Must match rail top: TRACK_HEIGHT_OFFSET(0.35) + BALLAST_H(0.15) + SLEEPER_H(0.12) + RAIL_H(0.15) = 0.77
const RAIL_HEIGHT_OFFSET = 0.77;

/**
 * Build a 3D path from waypoints with terrain-following height.
 * Returns packed Float32Array [x,y,z, x,y,z, ...] for zero-alloc sampling.
 */
export function buildRailwayPath(
  waypoints: RailwayWaypoint[],
  subdivPerSeg: number = 4,
): { points: Float32Array; count: number; totalLength: number } {
  const total = (waypoints.length - 1) * subdivPerSeg + 1;
  const pts = new Float32Array(total * 3);
  let idx = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    for (let s = 0; s < subdivPerSeg; s++) {
      const t = s / subdivPerSeg;
      const x = waypoints[i].x + (waypoints[i + 1].x - waypoints[i].x) * t;
      const z = waypoints[i].z + (waypoints[i + 1].z - waypoints[i].z) * t;
      pts[idx++] = x;
      pts[idx++] = getRailGroundHeight(x, z) + RAIL_HEIGHT_OFFSET;
      pts[idx++] = z;
    }
  }
  const last = waypoints[waypoints.length - 1];
  pts[idx++] = last.x;
  pts[idx++] = getRailGroundHeight(last.x, last.z) + RAIL_HEIGHT_OFFSET;
  pts[idx++] = last.z;

  // Compute total arc length
  let totalLength = 0;
  for (let i = 1; i < total; i++) {
    const i3 = i * 3, p3 = (i - 1) * 3;
    const dx = pts[i3] - pts[p3], dy = pts[i3 + 1] - pts[p3 + 1], dz = pts[i3 + 2] - pts[p3 + 2];
    totalLength += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  return { points: pts, count: total, totalLength };
}

/**
 * Sample position + tangent at arc-length distance. Zero allocation.
 */
export function samplePathAtDistance(
  pts: Float32Array,
  count: number,
  totalLen: number,
  distance: number,
  outPos: THREE.Vector3,
  outTan: THREE.Vector3,
): void {
  // Clamp to path length — this is a linear path, not circular
  const d = Math.max(0, Math.min(distance, totalLen - 0.01));
  let acc = 0;
  for (let i = 1; i < count; i++) {
    const i3 = i * 3, p3 = (i - 1) * 3;
    const dx = pts[i3] - pts[p3], dy = pts[i3 + 1] - pts[p3 + 1], dz = pts[i3 + 2] - pts[p3 + 2];
    const segLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (acc + segLen >= d && segLen > 0.001) {
      const t = (d - acc) / segLen;
      outPos.set(pts[p3] + dx * t, pts[p3 + 1] + dy * t, pts[p3 + 2] + dz * t);
      outTan.set(dx / segLen, dy / segLen, dz / segLen);
      return;
    }
    acc += segLen;
  }
  // Fallback: last point
  const l3 = (count - 1) * 3, p3 = (count - 2) * 3;
  outPos.set(pts[l3], pts[l3 + 1], pts[l3 + 2]);
  const dx = pts[l3] - pts[p3], dy = pts[l3 + 1] - pts[p3 + 1], dz = pts[l3 + 2] - pts[p3 + 2];
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  outTan.set(dx / (len || 1), dy / (len || 1), dz / (len || 1));
}

/**
 * Find arc-length distance to nearest point to a station position.
 */
export function findStationDistance(
  pts: Float32Array,
  count: number,
  stationX: number,
  stationZ: number,
): number {
  let bestIdx = 0, bestDist = Infinity;
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const dx = pts[i3] - stationX, dz = pts[i3 + 2] - stationZ;
    const d = dx * dx + dz * dz;
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  // Convert index to arc-length
  let dist = 0;
  for (let i = 1; i <= bestIdx; i++) {
    const i3 = i * 3, p3 = (i - 1) * 3;
    const dx = pts[i3] - pts[p3], dy = pts[i3 + 1] - pts[p3 + 1], dz = pts[i3 + 2] - pts[p3 + 2];
    dist += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return dist;
}
