/**
 * CivilianNPCs — GLB-based townspeople (VillagerMan1, VillagerWoman1, GardenerWoman, ElderMan & Guardian).
 * Distance-culled by kingdom group for performance.
 */
import { Suspense } from 'react';
import * as THREE from 'three';
import { getTerrainHeight } from './Terrain';
import { VillagerMan1Model, VillagerMan1Def } from './VillagerMan1Model';
import { VillagerWoman1Model } from './VillagerWoman1Model';
import { GardenerWomanModel } from './GardenerWomanModel';
import { ElderManModel } from './ElderManModel';
import { GuardianModel } from './GuardianModel';

type GLBVillagerType = 'man1' | 'woman1' | 'gardener' | 'elder' | 'guardian';

interface GLBVillagerDef extends VillagerMan1Def {
  villagerType: GLBVillagerType;
}

// ========== SEEDED RNG ==========
function seededRng(seed: number) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

// ========== GLB VILLAGER NPC DEFINITIONS ==========
function generateGLBVillagers(): GLBVillagerDef[] {
  const rng = seededRng(77777);
  const defs: GLBVillagerDef[] = [];
  let id = 0;

  const pickType = (): GLBVillagerType => {
    const r = rng();
    if (r < 0.20) return 'man1';
    if (r < 0.40) return 'woman1';
    if (r < 0.60) return 'gardener';
    if (r < 0.80) return 'elder';
    return 'guardian';
  };

  const add = (x: number, z: number, opts?: Partial<GLBVillagerDef>) => {
    const y = getTerrainHeight(x, z);
    const villagerType = opts?.villagerType ?? pickType();
    defs.push({
      id: `glb-v-${id++}`,
      homePos: [x, y, z],
      patrolRadius: 4 + rng() * 5,
      patrolSpeed: 0.5 + rng() * 0.4,
      facingAngle: rng() * Math.PI * 2,
      standDuration: 5 + rng() * 10,
      walkDuration: 30 + rng() * 40,
      villagerType,
      ...opts,
    });
  };

  // Ironhold village — scattered around central town
  add(15, 50);
  add(-12, 55);
  add(25, 60);
  add(-8, 48);
  add(5, 65);
  add(30, 55);
  add(19, 53);
  add(22, 56);
  add(-19, 50);
  add(-22, 55);
  add(34, 52);
  add(-16, 68);
  add(0, 70);
  add(-5, 75);
  add(8, 18);

  // Thornwall
  add(-495, -445);
  add(-510, -440);
  add(-500, -435);
  add(-485, -450);
  add(-515, -455);
  add(-490, -430);

  // Rivermoor
  add(445, 355);
  add(455, 345);
  add(440, 360);
  add(460, 340);
  add(450, 355);

  // Stonepeak
  add(-395, 505);
  add(-405, 495);
  add(-390, 510);
  add(-410, 500);

  // Darkhollow
  add(545, -395);
  add(555, -405);
  add(540, -390);

  // Goldenvale
  add(-545, 105);
  add(-555, 95);
  add(-540, 110);
  add(-560, 100);
  add(-550, 115);

  return defs;
}

const GLB_VILLAGERS = generateGLBVillagers();

interface GLBVillagerGroup {
  cx: number; cz: number;
  cullRadius: number;
  villagers: GLBVillagerDef[];
}

function buildGLBVillagerGroups(): GLBVillagerGroup[] {
  const groups: GLBVillagerGroup[] = [
    { cx: 0, cz: 50, cullRadius: 120, villagers: [] },
    { cx: -500, cz: -450, cullRadius: 100, villagers: [] },
    { cx: 450, cz: 350, cullRadius: 100, villagers: [] },
    { cx: -400, cz: 500, cullRadius: 100, villagers: [] },
    { cx: 550, cz: -400, cullRadius: 100, villagers: [] },
    { cx: -550, cz: 100, cullRadius: 100, villagers: [] },
  ];

  for (const v of GLB_VILLAGERS) {
    let bestGroup = groups[0];
    let bestDist = Infinity;
    for (const g of groups) {
      const dx = v.homePos[0] - g.cx;
      const dz = v.homePos[2] - g.cz;
      const d = dx * dx + dz * dz;
      if (d < bestDist) { bestDist = d; bestGroup = g; }
    }
    bestGroup.villagers.push(v);
  }

  return groups;
}

const GLB_VILLAGER_GROUPS = buildGLBVillagerGroups();

// ========== MAIN COMPONENT ==========
interface CivilianNPCsProps {
  playerPositionRef: React.RefObject<THREE.Vector3>;
}

export function CivilianNPCs({ playerPositionRef }: CivilianNPCsProps) {
  const playerPos = playerPositionRef.current;

  return (
    <Suspense fallback={null}>
      {GLB_VILLAGER_GROUPS.map((group, gi) => {
        if (playerPos) {
          const dx = playerPos.x - group.cx;
          const dz = playerPos.z - group.cz;
          if (dx * dx + dz * dz > group.cullRadius * group.cullRadius) return null;
        }
        return (
          <group key={`glb-v-group-${gi}`}>
            {group.villagers.map(v => {
              if (v.villagerType === 'guardian')
                return <GuardianModel key={v.id} def={v} playerPos={playerPos} />;
              if (v.villagerType === 'elder')
                return <ElderManModel key={v.id} def={v} playerPos={playerPos} />;
              if (v.villagerType === 'gardener')
                return <GardenerWomanModel key={v.id} def={v} playerPos={playerPos} />;
              if (v.villagerType === 'woman1')
                return <VillagerWoman1Model key={v.id} def={v} playerPos={playerPos} />;
              return <VillagerMan1Model key={v.id} def={v} playerPos={playerPos} />;
            })}
          </group>
        );
      })}
    </Suspense>
  );
}
