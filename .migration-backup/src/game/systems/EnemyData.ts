import { getTerrainHeight } from '../components/Terrain';
import { REGIONS } from '../world/RegionData';

export interface EnemyData {
  id: string;
  type: 'bandit' | 'wolf';
  position: [number, number, number];
  health: number;
  maxHealth: number;
  state: 'idle' | 'patrol' | 'chase' | 'attack' | 'dead';
  patrolCenter: [number, number, number];
  patrolRadius: number;
  patrolAngle: number;
  attackCooldown: number;
  hitFlash: number;
  damage: number;
  speed: number;
  detectRange: number;
  attackRange: number;
}

export function generateEnemies(): EnemyData[] {
  const enemies: EnemyData[] = [];
  let id = 0;

  const spawn = (
    type: 'bandit' | 'wolf',
    cx: number, cz: number,
    count: number,
    spread: number,
  ) => {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const r = 3 + Math.random() * spread;
      const x = cx + Math.cos(angle) * r;
      const z = cz + Math.sin(angle) * r;
      // Exclude town center area (capital at [0,0] with town extending to r~80)
      if (x * x + z * z < 80 * 80) continue;
      // Exclude new kingdom interiors — all have walls at radius ~45 from center
      const KINGDOM_CENTERS: [number, number][] = [
        [-500, -450], [450, 350], [-400, 500], [550, -400], [-550, 100],
        [-440, -400], [400, 300], [-350, 450], [500, -350], [-500, 150],
      ];
      let inKingdom = false;
      for (const [kcx, kcz] of KINGDOM_CENTERS) {
        const kdx = x - kcx, kdz = z - kcz;
        if (kdx * kdx + kdz * kdz < 50 * 50) { inKingdom = true; break; }
      }
      if (inKingdom) continue;
      const y = getTerrainHeight(x, z);
      const groundOffset = type === 'wolf' ? 0.45 : 0.9;
      enemies.push({
        id: `enemy-${id++}`,
        type,
        position: [x, y + groundOffset, z],
        health: type === 'bandit' ? 30 : 20,
        maxHealth: type === 'bandit' ? 30 : 20,
        state: 'idle',
        patrolCenter: [x, y + 0.9, z],
        patrolRadius: 5 + Math.random() * 8,
        patrolAngle: Math.random() * Math.PI * 2,
        attackCooldown: 0,
        hitFlash: 0,
        damage: type === 'bandit' ? 6 : 8,
        speed: type === 'bandit' ? 4 : 6,
        detectRange: type === 'bandit' ? 15 : 12,
        attackRange: type === 'bandit' ? 2.5 : 2,
      });
    }
  };

  // Spawn enemies per region
  for (const region of REGIONS) {
    if (region.enemyCount === 0) continue;
    for (const etype of region.enemyTypes) {
      spawn(etype, region.center[0], region.center[1],
        Math.ceil(region.enemyCount / region.enemyTypes.length),
        region.enemySpread);
    }
  }

  // Roaming wolves in wilderness
  spawn('wolf', -30, 30, 2, 15);
  spawn('wolf', 80, -80, 2, 20);
  spawn('bandit', 100, -100, 2, 15);

  return enemies;
}

// Ground offset per enemy type — distance from terrain to mesh group origin
// Bandit: legs + boots extend to local y ≈ -0.875, so offset ≈ 0.9
// Wolf: legs extend to local y ≈ -0.425, so offset ≈ 0.45
export const ENEMY_GROUND_OFFSET: Record<string, number> = {
  bandit: 0.9,
  wolf: 0.45,
};

export const PLAYER_ATTACK_DAMAGE = 15;
export const PLAYER_ATTACK_RANGE = 3;
export const PLAYER_ATTACK_COOLDOWN = 0.5;
export const PLAYER_ATTACK_ARC = Math.PI * 0.6;
export const ENEMY_ATTACK_COOLDOWN = 1.5;
export const ENEMY_DESPAWN_TIME = 3;
