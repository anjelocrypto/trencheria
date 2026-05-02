/**
 * SafeSpawn — Faction-based spawn system with collision validation.
 *
 * Players spawn at their faction's home kingdom.
 * Guests spawn at Ironhold (neutral capital).
 */

import { getTerrainHeight } from '../components/Terrain';
import { getBridgeHeight } from '../world/BridgeData';
import { getLakeHeight, getRiverHeight } from '../world/WaterData';
import {
  getCircleObstacles,
  getBoxObstacles,
} from './CollisionSystem';
import { getFactionSpawn, getFactionById } from './FactionData';
import { loadWalletSession } from '../hooks/usePlayerAccount';

// ===== Guest spawn point (Ironhold) =====
const GUEST_SPAWN_X = 0;
const GUEST_SPAWN_Z = 82;

const SPAWN_CHECK_RADIUS = 1.2;
const SPIRAL_STEP = 2.5;
const SPIRAL_MAX_RINGS = 12;
const SPAWN_SEPARATION_RADIUS = 3.0;
const SPAWN_RING_SLOTS = 8;
let spawnIndexCounter = 0;

// ===== Core validation =====

function isPointBlocked(x: number, z: number, radius: number): boolean {
  const circles = getCircleObstacles();
  const boxes = getBoxObstacles();
  for (const obs of circles) {
    const dx = x - obs.x;
    const dz = z - obs.z;
    const minDist = radius + obs.radius;
    if (dx * dx + dz * dz < minDist * minDist) return true;
  }
  for (const obs of boxes) {
    const cos = Math.cos(obs.rotation);
    const sin = Math.sin(obs.rotation);
    const lx = cos * (x - obs.cx) + sin * (z - obs.cz);
    const lz = -sin * (x - obs.cx) + cos * (z - obs.cz);
    const clampX = Math.max(-obs.halfW, Math.min(obs.halfW, lx));
    const clampZ = Math.max(-obs.halfD, Math.min(obs.halfD, lz));
    const dlx = lx - clampX;
    const dlz = lz - clampZ;
    if (dlx * dlx + dlz * dlz < radius * radius) return true;
  }
  return false;
}

function isTerrainValid(x: number, z: number): boolean {
  // Bridge takes priority over water/terrain checks: standing on a bridge
  // deck is valid even when water flows beneath it.
  if (getBridgeHeight(x, z) !== null) return true;
  const y = getTerrainHeight(x, z);
  if (y < -0.5) return false;
  if (getLakeHeight(x, z) !== null) return false;
  if (getRiverHeight(x, z) !== null) return false;
  return true;
}

function isSpawnValid(x: number, z: number): boolean {
  if (!isTerrainValid(x, z)) return false;
  if (isPointBlocked(x, z, SPAWN_CHECK_RADIUS)) return false;
  return true;
}

function spiralSearch(cx: number, cz: number): [number, number] | null {
  if (isSpawnValid(cx, cz)) return [cx, cz];
  for (let ring = 1; ring <= SPIRAL_MAX_RINGS; ring++) {
    const dist = ring * SPIRAL_STEP;
    const pointCount = 8 * ring;
    for (let i = 0; i < pointCount; i++) {
      const angle = (i / pointCount) * Math.PI * 2;
      const tx = cx + Math.cos(angle) * dist;
      const tz = cz + Math.sin(angle) * dist;
      if (isSpawnValid(tx, tz)) return [tx, tz];
    }
  }
  return null;
}

// ===== Public API =====

export interface SafeSpawnResult {
  x: number;
  y: number;
  z: number;
  fallbackUsed: boolean;
  rejectedReason: string | null;
}

/**
 * Get the canonical spawn center for the current player.
 * Uses faction home kingdom if wallet user has a faction, else Ironhold.
 */
function getSpawnCenter(factionId?: string): { x: number; z: number } {
  if (factionId) {
    return getFactionSpawn(factionId);
  }
  // Check stored session for faction
  const session = loadWalletSession();
  if (session && (session as any).faction_id) {
    return getFactionSpawn((session as any).faction_id);
  }
  // Guest spawn at Ironhold
  return { x: GUEST_SPAWN_X, z: GUEST_SPAWN_Z };
}

/**
 * Find a safe spawn position. Uses faction home kingdom by default.
 * If preferredX/Z are provided (e.g. reconnect restore), validates them first.
 */
export function findSafeSpawn(
  preferredX?: number,
  preferredZ?: number,
  playerHeight: number = 1.8,
  factionId?: string,
): SafeSpawnResult {
  // 1. Try preferred position (reconnect restore)
  if (preferredX !== undefined && preferredZ !== undefined) {
    if (isSpawnValid(preferredX, preferredZ)) {
      const y = getGroundY(preferredX, preferredZ);
      return { x: preferredX, y: y + playerHeight / 2, z: preferredZ, fallbackUsed: false, rejectedReason: null };
    }
    const reason = getRejectReason(preferredX, preferredZ);
    const nearby = spiralSearch(preferredX, preferredZ);
    if (nearby) {
      const y = getGroundY(nearby[0], nearby[1]);
      return { x: nearby[0], y: y + playerHeight / 2, z: nearby[1], fallbackUsed: true, rejectedReason: reason };
    }
  }

  // 2. Faction home kingdom spawn with separation
  const center = getSpawnCenter(factionId);
  const spawnIdx = spawnIndexCounter++;
  const separated = getSeperatedSpawnPoint(center.x, center.z, spawnIdx);

  if (separated) {
    const y = getGroundY(separated[0], separated[1]);
    return { x: separated[0], y: y + playerHeight / 2, z: separated[1], fallbackUsed: spawnIdx > 0, rejectedReason: null };
  }

  // 3. Spiral from faction center
  const found = spiralSearch(center.x, center.z);
  if (found) {
    const y = getGroundY(found[0], found[1]);
    return { x: found[0], y: y + playerHeight / 2, z: found[1], fallbackUsed: true, rejectedReason: 'spawn zone blocked' };
  }

  // 4. Emergency fallback — Ironhold
  const y = getGroundY(GUEST_SPAWN_X, GUEST_SPAWN_Z + 40);
  return { x: GUEST_SPAWN_X, y: y + playerHeight / 2, z: GUEST_SPAWN_Z + 40, fallbackUsed: true, rejectedReason: 'all searches failed' };
}

// ===== Ring-based spawn separation =====

function getSeperatedSpawnPoint(cx: number, cz: number, index: number): [number, number] | null {
  if (index === 0) {
    if (isSpawnValid(cx, cz)) return [cx, cz];
    return spiralSearch(cx, cz);
  }
  const ring = Math.ceil(index / SPAWN_RING_SLOTS);
  const slotInRing = (index - 1) % SPAWN_RING_SLOTS;
  const dist = ring * SPAWN_SEPARATION_RADIUS;
  const angleOffset = ring * 0.4;
  const angle = angleOffset + (slotInRing / SPAWN_RING_SLOTS) * Math.PI * 2;
  const tx = cx + Math.cos(angle) * dist;
  const tz = cz + Math.sin(angle) * dist;
  if (isSpawnValid(tx, tz)) return [tx, tz];
  return spiralSearch(tx, tz);
}

function getRejectReason(x: number, z: number): string {
  // Bridge surface is always valid — water/terrain checks beneath are ignored.
  if (getBridgeHeight(x, z) !== null) {
    if (isPointBlocked(x, z, SPAWN_CHECK_RADIUS)) return 'collision with obstacle';
    return 'unknown';
  }
  const y = getTerrainHeight(x, z);
  if (y < -0.5) return 'terrain below water level';
  if (getLakeHeight(x, z) !== null) return 'inside lake';
  if (getRiverHeight(x, z) !== null) return 'inside river';
  if (isPointBlocked(x, z, SPAWN_CHECK_RADIUS)) return 'collision with obstacle';
  return 'unknown';
}

function getGroundY(x: number, z: number): number {
  const bridgeY = getBridgeHeight(x, z);
  if (bridgeY !== null) return bridgeY;
  return getTerrainHeight(x, z);
}

export function isPositionSafe(x: number, z: number): boolean {
  return isSpawnValid(x, z);
}

export function getCanonicalSpawn(): [number, number] {
  return [GUEST_SPAWN_X, GUEST_SPAWN_Z];
}

export function resetSpawnIndex(): void {
  spawnIndexCounter = 0;
}
