import { useRef, useMemo, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COLORS } from '../constants';
import { RIVERS, LAKES } from '../world/WaterData';

const riverMat = new THREE.MeshStandardMaterial({
  color: COLORS.water, transparent: true, opacity: 0.7, metalness: 0.4, roughness: 0.15,
});
const lakeMat = new THREE.MeshStandardMaterial({
  color: COLORS.waterDeep, transparent: true, opacity: 0.72, metalness: 0.35, roughness: 0.18,
});

function RiverSegment({ points, width }: { points: [number, number, number][]; width: number }) {
  const meshes: JSX.Element[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const ax = points[i][0], ay = points[i][1], az = points[i][2];
    const bx = points[i + 1][0], by = points[i + 1][1], bz = points[i + 1][2];
    const dx = bx - ax, dz = bz - az;
    const len = Math.sqrt(dx * dx + dz * dz);
    const angle = Math.atan2(dx, dz);
    const cx = (ax + bx) / 2, cy = (ay + by) / 2, cz = (az + bz) / 2;
    meshes.push(
      <mesh key={i} rotation={[-Math.PI / 2, 0, -angle]} position={[cx, cy, cz]} material={riverMat}>
        <planeGeometry args={[width, len + width * 0.5]} />
      </mesh>
    );
  }
  return <>{meshes}</>;
}

export const Water = memo(function Water() {
  const frameSkip = useRef(0);
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    frameSkip.current++;
    if (frameSkip.current % 3 !== 0) return;
    if (groupRef.current) {
      // Subtle bob for all water
      groupRef.current.position.y = Math.sin(clock.elapsedTime * 0.6) * 0.08;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Rivers */}
      {RIVERS.map(river => (
        <RiverSegment key={river.id} points={river.points} width={river.width} />
      ))}
      {/* Lakes */}
      {LAKES.map(lake => (
        <mesh key={lake.id} rotation={[-Math.PI / 2, lake.rotation, 0]}
          position={lake.position} material={lakeMat}>
          <planeGeometry args={[lake.radiusX * 2, lake.radiusZ * 2, 8, 8]} />
        </mesh>
      ))}
    </group>
  );
});
