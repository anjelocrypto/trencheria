/**
 * LootPickups — Bobbing pickups on the ground.
 *
 * Perf: animation drives a per-id group ref directly inside useFrame.
 * No per-frame React state. castShadow removed — these are tiny props at
 * floor level where shadow contribution is invisible vs cost.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { LootPickup } from '../types';

const lootColors: Record<string, string> = {
  wood: '#8b6914',
  stone: '#7a7a7a',
  food: '#cc6644',
  loot_crate: '#6b4f10',
};

const boxGeo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
const ringGeo = new THREE.RingGeometry(0.2, 0.35, 8);
const ringMat = new THREE.MeshBasicMaterial({ color: '#ffcc44', transparent: true, opacity: 0.3, side: THREE.DoubleSide });

// Pre-create materials for each type
const lootMats: Record<string, THREE.MeshLambertMaterial> = {};
for (const [key, color] of Object.entries(lootColors)) {
  lootMats[key] = new THREE.MeshLambertMaterial({ color });
}
const defaultMat = new THREE.MeshLambertMaterial({ color: '#888' });

interface Props {
  pickups: LootPickup[];
}

export function LootPickups({ pickups }: Props) {
  const meshRefs = useRef<Map<string, THREE.Mesh | null>>(new Map());

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (const p of pickups) {
      if (p.collected) continue;
      const mesh = meshRefs.current.get(p.id);
      if (!mesh) continue;
      mesh.position.y = 0.2 + Math.sin(t * 3 + p.position[0]) * 0.1;
    }
  });

  return (
    <group>
      {pickups.map(p => {
        // Match original behavior: collected pickups render nothing at all
        // (both the box and the ring disappear together).
        if (p.collected) return null;
        const mat = lootMats[p.type] || defaultMat;
        return (
          <group key={p.id} position={p.position}>
            <mesh
              ref={(node) => { meshRefs.current.set(p.id, node); }}
              geometry={boxGeo}
              material={mat}
            />
            <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={ringGeo} material={ringMat} />
          </group>
        );
      })}
    </group>
  );
}
