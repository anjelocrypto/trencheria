/**
 * CoinSpawner — Generates terrain-safe random candidate positions for $TRENCHERI coins.
 * 
 * IMPORTANT: This only generates CANDIDATE positions. The actual coin IDs are
 * assigned by the server via issue_trencheri_coins RPC. Client cannot forge coin IDs.
 * 
 * Avoids: water, buildings, railway tracks, underground positions.
 * Uses the same terrain height system as SafeSpawn.
 */
import { getTerrainHeight } from '../components/Terrain';
import { getLakeHeight, getRiverHeight } from '../world/WaterData';
import { HALF_WORLD } from '../constants';

// Spawn radius around player — coins appear 40-150m away
const MIN_SPAWN_DIST = 40;
const MAX_SPAWN_DIST = 150;

// Terrain safety
const MIN_HEIGHT = 1.5; // above water level
const MAX_HEIGHT = 80; // below mountain peaks

// Settlement exclusion zones (approximate centers)
const EXCLUSION_ZONES = [
  { x: 0, z: 0, r: 50 },      // Capital / Town
  { x: 0, z: 82, r: 15 },     // Spawn area
];

/**
 * Generate a single terrain-safe candidate position near the player.
 * Returns {x, y, z} or null if no valid position found after attempts.
 */
export function generateCoinCandidatePosition(
  playerX: number,
  playerZ: number,
): { x: number; y: number; z: number } | null {
  for (let attempt = 0; attempt < 10; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = MIN_SPAWN_DIST + Math.random() * (MAX_SPAWN_DIST - MIN_SPAWN_DIST);
    const x = playerX + Math.cos(angle) * dist;
    const z = playerZ + Math.sin(angle) * dist;

    // Clamp to world bounds
    if (Math.abs(x) > HALF_WORLD - 20 || Math.abs(z) > HALF_WORLD - 20) continue;

    const y = getTerrainHeight(x, z);
    if (y < MIN_HEIGHT || y > MAX_HEIGHT) continue;

    // Check water
    const lakeH = getLakeHeight(x, z);
    if (lakeH !== null && y < lakeH + 0.5) continue;
    const riverH = getRiverHeight(x, z);
    if (riverH !== null && y < riverH + 0.5) continue;

    // Check exclusion zones
    let blocked = false;
    for (const zone of EXCLUSION_ZONES) {
      const dx = x - zone.x;
      const dz = z - zone.z;
      if (dx * dx + dz * dz < zone.r * zone.r) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    return { x, y: y + 0.5, z }; // Slightly above ground
  }
  return null;
}

/**
 * Generate up to `count` candidate positions for server issuance.
 */
export function generateCoinCandidates(
  playerX: number,
  playerZ: number,
  count: number = 2,
): Array<{ x: number; y: number; z: number }> {
  const positions: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i < count; i++) {
    const pos = generateCoinCandidatePosition(playerX, playerZ);
    if (pos) positions.push(pos);
  }
  return positions;
}
