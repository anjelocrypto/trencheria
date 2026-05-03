/**
 * TrencheriCoins — 3D coin renderer with floating/spinning animation.
 *
 * Perf:
 *  - All bob/spin happens via direct mutation of group.position/rotation
 *    refs in useFrame. No React state changes per frame.
 *  - The pre-existing per-coin `<pointLight>` was the heaviest cost in this
 *    renderer (each one adds a real-time light source). Removed in favor of
 *    the existing emissive material + ground glow ring, which look the same
 *    from the player camera.
 *  - Distance culled via display:none on the per-coin group instead of
 *    React conditional render so we don't re-mount as the player moves.
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
  emissive: '#ffaa00',
  emissiveIntensity: 0.55,
});
const coinEdgeMat = new THREE.MeshStandardMaterial({
  color: '#daa520',
  metalness: 0.8,
  roughness: 0.3,
});
const glowMat = new THREE.MeshBasicMaterial({
  color: '#ffd700',
  transparent: true,
  opacity: 0.18,
  side: THREE.DoubleSide,
});

const symbolGeo = new THREE.OctahedronGeometry(0.12, 0);
const symbolMat = new THREE.MeshBasicMaterial({ color: '#fff8dc' });

interface Props {
  coins: TrencheriCoin[];
  playerPositionRef: React.RefObject<THREE.Vector3>;
}

interface CoinHandle {
  group: THREE.Group | null;
  bob: THREE.Group | null;
  spin: THREE.Group | null;
  baseY: number;
  phaseBob: number;
  phaseSpin: number;
}

export function TrencheriCoins({ coins, playerPositionRef }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const handlesRef = useRef<Map<string, CoinHandle>>(new Map());
  const tmpVec = useRef(new THREE.Vector3());

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const playerPos = playerPositionRef.current;
    const handles = handlesRef.current;

    for (const coin of coins) {
      const h = handles.get(coin.id);
      if (!h || !h.group) continue;

      if (coin.collected) {
        h.group.visible = false;
        continue;
      }

      // Distance culling via visibility (no React re-mount)
      if (playerPos) {
        const dx = playerPos.x - coin.position[0];
        const dz = playerPos.z - coin.position[2];
        if (dx * dx + dz * dz > CULL_DIST_SQ) {
          h.group.visible = false;
          continue;
        }
      }
      h.group.visible = true;

      const bobY = Math.sin(t * 2.5 + h.phaseBob) * 0.15;
      if (h.bob) h.bob.position.y = h.baseY + bobY;
      if (h.spin) h.spin.rotation.y = t * 1.8 + h.phaseSpin;
    }
  });

  return (
    <group ref={groupRef}>
      {coins.map(coin => {
        const setHandle = (key: keyof CoinHandle) => (node: THREE.Group | null) => {
          let h = handlesRef.current.get(coin.id);
          if (!h) {
            h = {
              group: null, bob: null, spin: null,
              baseY: coin.position[1],
              phaseBob: coin.position[0] * 0.5,
              phaseSpin: coin.position[2] * 0.3,
            };
            handlesRef.current.set(coin.id, h);
          }
          (h[key] as THREE.Group | null) = node;
        };

        return (
          <group
            key={coin.id}
            ref={setHandle('group')}
            position={[coin.position[0], 0, coin.position[2]]}
          >
            <group ref={setHandle('bob')}>
              <group ref={setHandle('spin')} rotation={[Math.PI / 2, 0, 0]}>
                <mesh geometry={coinGeo} material={coinMat} />
                <mesh geometry={coinEdgeGeo} material={coinEdgeMat} rotation={[Math.PI / 2, 0, 0]} />
                <mesh geometry={symbolGeo} material={symbolMat} position={[0, 0.06, 0]} scale={[1, 0.5, 1]} />
              </group>
            </group>
            {/* Ground glow ring at coin base — replaces removed per-coin pointLight */}
            <mesh
              position={[0, 0.05, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              geometry={glowGeo}
              material={glowMat}
            />
          </group>
        );
      })}
    </group>
  );
}
