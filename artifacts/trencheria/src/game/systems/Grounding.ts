/**
 * Grounding.ts — single source of truth for "what is the ground height here?"
 *
 * Combines getTerrainHeight (procedural terrain) with getBridgeHeight (deck override).
 * Provides footprint sampling so buildings, kingdom platforms, wilderness props,
 * and movement code can all share one definition of "is this spot buildable / walkable".
 *
 * Bridge override semantics: if a bridge covers (x,z), its deck height wins.
 * Otherwise we fall through to terrain noise + plateau flattening + railway flattening.
 */

import { getTerrainHeight } from '../components/Terrain';
import { getBridgeHeight } from '../world/BridgeData';
import { getLakeHeight, getRiverHeight } from '../world/WaterData';

/** Single source of truth for ground height at a world position. */
export function getGroundHeight(x: number, z: number): number {
  const bridgeY = getBridgeHeight(x, z);
  return bridgeY !== null ? bridgeY : getTerrainHeight(x, z);
}

export interface FootprintSample {
  x: number;
  z: number;
  y: number;
}

export interface FootprintReport {
  samples: FootprintSample[];
  minY: number;
  maxY: number;
  avgY: number;
  /** maxY - minY across all samples. */
  heightDelta: number;
  /** True if any sample sits at or below the water level threshold. */
  hasWater: boolean;
  /** Approx slope (radians) = atan(heightDelta / span). */
  slopeRad: number;
}

/** Anything at or below this Y is treated as water for placement purposes. */
export const WATER_LEVEL_Y = -0.3;

/**
 * Sample a rectangular footprint at center, four corners, and four edge midpoints.
 * `rotation` is in radians around the world Y axis.
 */
export function sampleFootprint(
  cx: number,
  cz: number,
  halfW: number,
  halfD: number,
  rotation: number = 0,
): FootprintReport {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  // 9 sample points in local space
  const local: Array<[number, number]> = [
    [0, 0],
    [-halfW, -halfD], [halfW, -halfD], [-halfW, halfD], [halfW, halfD],
    [0, -halfD], [0, halfD], [-halfW, 0], [halfW, 0],
  ];

  const samples: FootprintSample[] = [];
  let minY = Infinity;
  let maxY = -Infinity;
  let sumY = 0;
  let hasWater = false;

  for (const [lx, lz] of local) {
    const wx = cx + cos * lx - sin * lz;
    const wz = cz + sin * lx + cos * lz;
    const y = getGroundHeight(wx, wz);
    samples.push({ x: wx, z: wz, y });
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    sumY += y;
    // Water detection at this sample: terrain dip OR lake/river surface here.
    // BuildingSystem also checks the center against WaterData, but that misses
    // large buildings whose CORNERS straddle a lake/river.
    if (
      y < WATER_LEVEL_Y ||
      getLakeHeight(wx, wz) !== null ||
      getRiverHeight(wx, wz) !== null
    ) {
      hasWater = true;
    }
  }

  const avgY = sumY / samples.length;
  const heightDelta = maxY - minY;
  // Span = diagonal across footprint, used for slope estimate
  const span = Math.max(0.01, Math.sqrt(halfW * halfW + halfD * halfD) * 2);
  const slopeRad = Math.atan2(heightDelta, span);

  return { samples, minY, maxY, avgY, heightDelta, hasWater, slopeRad };
}

/**
 * Sample a circular footprint at center + 4 cardinal points at radius.
 * Use for buildables that don't have a clean rectangular box (campfires, towers).
 */
export function sampleCircleFootprint(
  cx: number,
  cz: number,
  radius: number,
): FootprintReport {
  const local: Array<[number, number]> = [
    [0, 0],
    [radius, 0], [-radius, 0], [0, radius], [0, -radius],
  ];

  const samples: FootprintSample[] = [];
  let minY = Infinity;
  let maxY = -Infinity;
  let sumY = 0;
  let hasWater = false;

  for (const [lx, lz] of local) {
    const wx = cx + lx;
    const wz = cz + lz;
    const y = getGroundHeight(wx, wz);
    samples.push({ x: wx, z: wz, y });
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    sumY += y;
    if (
      y < WATER_LEVEL_Y ||
      getLakeHeight(wx, wz) !== null ||
      getRiverHeight(wx, wz) !== null
    ) {
      hasWater = true;
    }
  }

  const avgY = sumY / samples.length;
  const heightDelta = maxY - minY;
  const span = Math.max(0.01, radius * 2);
  const slopeRad = Math.atan2(heightDelta, span);

  return { samples, minY, maxY, avgY, heightDelta, hasWater, slopeRad };
}

export interface BuildabilityResult {
  valid: boolean;
  reason: string | null;
  minY: number;
  maxY: number;
  avgY: number;
  heightDelta: number;
  slopeRad: number;
}

export interface BuildabilityOpts {
  /** Max permissible (maxY - minY) over the footprint. */
  maxHeightDelta?: number;
  /** Max permissible slope in radians. */
  maxSlopeRad?: number;
  /** If true, water samples don't fail the check. */
  allowWater?: boolean;
  /** If true, sample as a circle of radius=halfW. */
  isCircle?: boolean;
}

/**
 * Decide whether a building of the given footprint can be placed at (cx, cz).
 * Returns reason string when invalid for UI feedback.
 */
export function isBuildableGround(
  cx: number,
  cz: number,
  halfW: number,
  halfD: number,
  rotation: number = 0,
  opts: BuildabilityOpts = {},
): BuildabilityResult {
  const {
    maxHeightDelta = 1.2,
    maxSlopeRad = 0.6, // ~34°
    allowWater = false,
    isCircle = false,
  } = opts;

  const report = isCircle
    ? sampleCircleFootprint(cx, cz, Math.max(halfW, halfD))
    : sampleFootprint(cx, cz, halfW, halfD, rotation);

  let valid = true;
  let reason: string | null = null;

  if (!allowWater && report.hasWater) {
    valid = false;
    reason = 'water';
  } else if (report.heightDelta > maxHeightDelta) {
    valid = false;
    reason = 'uneven';
  } else if (report.slopeRad > maxSlopeRad) {
    valid = false;
    reason = 'steep';
  }

  return {
    valid,
    reason,
    minY: report.minY,
    maxY: report.maxY,
    avgY: report.avgY,
    heightDelta: report.heightDelta,
    slopeRad: report.slopeRad,
  };
}

/**
 * Returns true if a step from `fromY` to `toY` is walkable given a max upward step.
 * Downhill is always walkable here — falling/landing is handled by gravity.
 */
export function isWalkableStep(fromY: number, toY: number, maxStepUp: number): boolean {
  const dy = toY - fromY;
  if (dy <= 0) return true;
  return dy <= maxStepUp;
}

/**
 * Speed multiplier (0..1) based on slope angle. Anything below `softMax` returns 1.
 * Between `softMax` and `hardMax` we ramp linearly down to 0.15.
 * Above `hardMax` we return 0 (effectively impassable).
 */
export function getSlopeFactor(slopeRad: number, softMax: number, hardMax: number): number {
  const s = Math.abs(slopeRad);
  if (s <= softMax) return 1;
  if (s >= hardMax) return 0;
  const t = (s - softMax) / (hardMax - softMax);
  return 1 - t * 0.85; // ramps 1 -> 0.15
}
