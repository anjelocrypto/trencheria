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
  const timeRef = useRef(0);

  useFrame((_, delta) => {
    timeRef.current += delta;
  });

  const time = timeRef.current;

  return (
    <group>
      {pickups.map(p => {
        if (p.collected) return null;
        const mat = lootMats[p.type] || defaultMat;
        const bobY = 0.2 + Math.sin(time * 3 + p.position[0]) * 0.1;
        return (
          <group key={p.id} position={p.position}>
            <mesh geometry={boxGeo} position={[0, bobY, 0]} material={mat} castShadow />
            <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={ringGeo} material={ringMat} />
          </group>
        );
      })}
    </group>
  );
}
