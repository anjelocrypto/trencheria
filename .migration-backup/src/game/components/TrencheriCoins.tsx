/**
 * TrencheriCoins — 3D coin renderer with floating/spinning animation.
 * Culled by distance from player for performance.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TrencheriCoin } from '../hooks/useTrencheriCoins';

const CULL_DIST_SQ = 150 * 150;

// Shared geometry — flat cylinder (coin shape)
const coinGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.08, 12);
const coinEdgeGeo = new THREE.TorusGeometry(0.4, 0.04, 6, 12);
const glowGeo = new THREE.RingGeometry(0.5, 0.8, 12);

// Gold material
const coinMat = new THREE.MeshStandardMaterial({
  color: '#ffd700',
  metalness: 0.9,
  roughness: 0.2,
  emissive: '#aa8800',
  emissiveIntensity: 0.3,
});
const coinEdgeMat = new THREE.MeshStandardMaterial({
  color: '#daa520',
  metalness: 0.8,
  roughness: 0.3,
});
const glowMat = new THREE.MeshBasicMaterial({
  color: '#ffd700',
  transparent: true,
  opacity: 0.15,
  side: THREE.DoubleSide,
});

// "$T" text — we use a simple diamond shape instead for performance
const symbolGeo = new THREE.OctahedronGeometry(0.12, 0);
const symbolMat = new THREE.MeshBasicMaterial({ color: '#fff8dc' });

interface Props {
  coins: TrencheriCoin[];
  playerPositionRef: React.RefObject<THREE.Vector3>;
}

export function TrencheriCoins({ coins, playerPositionRef }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);

  useFrame((_, delta) => {
    timeRef.current += delta;
  });

  const time = timeRef.current;
  const playerPos = playerPositionRef.current;

  return (
    <group ref={groupRef}>
      {coins.map(coin => {
        if (coin.collected) return null;

        // Distance culling
        if (playerPos) {
          const dx = playerPos.x - coin.position[0];
          const dz = playerPos.z - coin.position[2];
          if (dx * dx + dz * dz > CULL_DIST_SQ) return null;
        }

        const bobY = Math.sin(time * 2.5 + coin.position[0] * 0.5) * 0.15;
        const spinY = time * 1.8 + coin.position[2] * 0.3;

        return (
          <group key={coin.id} position={[coin.position[0], coin.position[1] + bobY, coin.position[2]]}>
            {/* Coin body — spinning */}
            <group rotation={[Math.PI / 2, spinY, 0]}>
              <mesh geometry={coinGeo} material={coinMat} castShadow />
              <mesh geometry={coinEdgeGeo} material={coinEdgeMat} rotation={[Math.PI / 2, 0, 0]} />
              {/* Symbol on face */}
              <mesh geometry={symbolGeo} material={symbolMat} position={[0, 0.06, 0]} scale={[1, 0.5, 1]} />
            </group>
            
            {/* Ground glow ring */}
            <mesh
              position={[0, -coin.position[1] + 0.05 - bobY + (coin.position[1] - 0.5), 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              geometry={glowGeo}
              material={glowMat}
            />
            
            {/* Point light for nearby glow */}
            <pointLight
              color="#ffd700"
              intensity={0.5}
              distance={5}
              decay={2}
            />
          </group>
        );
      })}
    </group>
  );
}
