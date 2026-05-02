import { useRef, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COLORS } from '../constants';
import { WorldResource } from '../systems/WorldResources';

interface Props {
  resources: WorldResource[];
  playerPositionRef: React.RefObject<THREE.Vector3>;
  shakeResourceRef: React.MutableRefObject<string | null>;
  highlightedResourceRef: React.MutableRefObject<string | null>;
}

const trunkGeo = new THREE.CylinderGeometry(0.15, 0.25, 1, 5);
const coneGeo = new THREE.ConeGeometry(1, 1, 5);
const dodecGeo = new THREE.DodecahedronGeometry(1, 1);
const rockGeo = new THREE.DodecahedronGeometry(1, 0);
const sphereGeo = new THREE.SphereGeometry(1, 6, 6);
const boxGeo = new THREE.BoxGeometry(1, 1, 1);

const trunkMat = new THREE.MeshLambertMaterial({ color: COLORS.woodDark });
const leavesMat = new THREE.MeshLambertMaterial({ color: COLORS.leaves });
const leavesDarkMat = new THREE.MeshLambertMaterial({ color: COLORS.leavesDark });
const stoneMat = new THREE.MeshLambertMaterial({ color: COLORS.stone });
const stoneDarkMat = new THREE.MeshLambertMaterial({ color: COLORS.stoneDark });
const highlightMat = new THREE.MeshBasicMaterial({ color: '#ffcc44', transparent: true, opacity: 0.4 });
const highlightGeo = new THREE.RingGeometry(1.5, 1.8, 12);
const berryLeafMat = new THREE.MeshLambertMaterial({ color: '#2a6a20' });
const berryMat = new THREE.MeshLambertMaterial({ color: '#cc3344' });
const crateMat = new THREE.MeshLambertMaterial({ color: '#6b4f10' });
const crateBandMat = new THREE.MeshLambertMaterial({ color: '#4a3a20' });

export function WorldObjects({
  resources, playerPositionRef, shakeResourceRef, highlightedResourceRef,
}: Props) {
  const shakesRef = useRef<Map<string, { timer: number }>>(new Map());
  const groupRefs = useRef<Map<string, THREE.Group>>(new Map());

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);

    // Check for new shakes triggered by Player interaction
    const shakeId = shakeResourceRef.current;
    if (shakeId) {
      shakesRef.current.set(shakeId, { timer: 0.3 });
      shakeResourceRef.current = null;
    }

    // Update existing shakes
    shakesRef.current.forEach((state, id) => {
      state.timer -= dt;
      const group = groupRefs.current.get(id);
      if (group) {
        if (state.timer > 0) {
          group.rotation.z = Math.sin(Date.now() * 0.05) * 0.05 * state.timer * 10;
        } else {
          group.rotation.z = 0;
          shakesRef.current.delete(id);
        }
      }
    });
  });

  const setRef = useCallback((id: string, el: THREE.Group | null) => {
    if (el) groupRefs.current.set(id, el);
    else groupRefs.current.delete(id);
  }, []);

  const playerPos = playerPositionRef.current;

  return (
    <group>
      {resources.map(res => {
        if (res.depleted) return null;
        if (playerPos) {
          const dx = playerPos.x - res.position[0];
          const dz = playerPos.z - res.position[2];
          const distSq = dx * dx + dz * dz;
          // Tighter culling for performance with high tree count
          const cullDist = res.type === 'tree' ? (res.gatherable ? 120 : 80) : (res.gatherable ? 150 : 100);
          if (distSq > cullDist * cullDist) return null;
        }

        const isHighlighted = highlightedResourceRef.current === res.id;

        if (res.type === 'tree') {
          const tH = res.trunkHeight * res.scale;
          const cR = res.crownRadius * (res.gatherable ? (res.health / res.maxHealth * 0.4 + 0.6) : 1);
          return (
            <group key={res.id} ref={el => setRef(res.id, el)} position={res.position} scale={res.scale}>
              <mesh position={[0, tH / 2, 0]} castShadow geometry={trunkGeo} scale={[1, tH, 1]} material={trunkMat} />
              {res.variant === 1 ? (
                <>
                  <mesh position={[0, tH + 1.5, 0]} castShadow geometry={coneGeo} scale={[cR, 3, cR]} material={leavesDarkMat} />
                  <mesh position={[0, tH + 2.6, 0]} castShadow geometry={coneGeo} scale={[cR * 0.7, 2.2, cR * 0.7]} material={leavesMat} />
                </>
              ) : (
                <mesh position={[0, tH + cR * 0.6, 0]} castShadow geometry={dodecGeo} scale={[cR, cR, cR]} material={leavesMat} />
              )}
              {isHighlighted && (
                <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={highlightGeo} material={highlightMat} />
              )}
            </group>
          );
        }

        if (res.type === 'berry_bush') {
          return (
            <group key={res.id} ref={el => setRef(res.id, el)} position={res.position} scale={res.scale}>
              <mesh position={[0, 0.4, 0]} castShadow geometry={dodecGeo} scale={[0.8, 0.6, 0.8]} material={berryLeafMat} />
              {res.health > 0 && [[-0.3, 0.5, 0.2], [0.2, 0.45, -0.25], [0.1, 0.55, 0.3], [-0.15, 0.35, -0.2]].map(([bx, by, bz], i) => (
                <mesh key={i} position={[bx, by, bz]} geometry={sphereGeo} scale={[0.06, 0.06, 0.06]} material={berryMat} />
              ))}
              {isHighlighted && (
                <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={highlightGeo} material={highlightMat} />
              )}
            </group>
          );
        }

        if (res.type === 'crate') {
          return (
            <group key={res.id} ref={el => setRef(res.id, el)} position={res.position} scale={res.scale}>
              <mesh position={[0, 0.4, 0]} castShadow geometry={boxGeo} scale={[0.7, 0.7, 0.7]} material={crateMat} />
              <mesh position={[0, 0.4, 0]} castShadow geometry={boxGeo} scale={[0.75, 0.1, 0.75]} material={crateBandMat} />
              {isHighlighted && (
                <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={highlightGeo} material={highlightMat} />
              )}
            </group>
          );
        }

        // Rock
        const rockScale = res.scale * (res.gatherable ? (res.health / res.maxHealth * 0.4 + 0.6) : 1);
        return (
          <group key={res.id} ref={el => setRef(res.id, el)} position={res.position} scale={rockScale}>
            <mesh castShadow geometry={rockGeo} material={res.variant === 0 ? stoneMat : stoneDarkMat} />
            {isHighlighted && (
              <mesh position={[0, -0.3, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={highlightGeo} material={highlightMat} />
            )}
          </group>
        );
      })}
    </group>
  );
}
