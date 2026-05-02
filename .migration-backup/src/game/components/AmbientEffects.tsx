import { useRef, useMemo, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Reduced dust particles
function DustParticles() {
  const COUNT = 120;
  const ref = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const arr = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 120;
      arr[i * 3 + 1] = 1 + Math.random() * 15;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 120;
    }
    return arr;
  }, []);

  const velocities = useMemo(() =>
    Array.from({ length: COUNT }, () => ({
      x: (Math.random() - 0.5) * 0.2,
      y: (Math.random() - 0.5) * 0.06,
      z: (Math.random() - 0.5) * 0.2,
    })), []);

  const frameSkip = useRef(0);

  useFrame((state, delta) => {
    if (!ref.current) return;
    // Update every other frame
    frameSkip.current++;
    if (frameSkip.current % 2 !== 0) return;

    const pos = ref.current.geometry.attributes.position;
    const dt = Math.min(delta, 0.05) * 2; // compensate for skip
    const time = state.clock.elapsedTime;

    for (let i = 0; i < COUNT; i++) {
      let x = pos.getX(i) + velocities[i].x * dt;
      let y = pos.getY(i) + velocities[i].y * dt;
      let z = pos.getZ(i) + velocities[i].z * dt;

      if (x > 60) x -= 120; if (x < -60) x += 120;
      if (z > 60) z -= 120; if (z < -60) z += 120;
      if (y > 18) y = 1; if (y < 0.5) y = 18;

      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={COUNT} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial color="#e0d8b0" size={0.1} transparent opacity={0.3} sizeAttenuation depthWrite={false} />
    </points>
  );
}

// Reduced fireflies
function Fireflies() {
  const COUNT = 20;
  const ref = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const arr = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const zone = i % 2;
      if (zone === 0) {
        arr[i * 3] = 30 + (Math.random() - 0.5) * 20;
        arr[i * 3 + 1] = 0.3 + Math.random() * 2.5;
        arr[i * 3 + 2] = 20 + (Math.random() - 0.5) * 20;
      } else {
        arr[i * 3] = 195 + (Math.random() - 0.5) * 18;
        arr[i * 3 + 1] = 0.5 + Math.random() * 3;
        arr[i * 3 + 2] = 95 + (Math.random() - 0.5) * 18;
      }
    }
    return arr;
  }, []);

  const frameSkip = useRef(0);

  useFrame((state) => {
    if (!ref.current) return;
    frameSkip.current++;
    if (frameSkip.current % 3 !== 0) return;

    const pos = ref.current.geometry.attributes.position;
    const time = state.clock.elapsedTime;

    for (let i = 0; i < COUNT; i++) {
      const baseY = 0.3 + ((i % 8) / 8) * 3;
      pos.setY(i, baseY + Math.sin(time * 0.6 + i * 2.5) * 0.5);
      pos.setX(i, pos.getX(i) + Math.sin(time * 0.2 + i) * 0.005);
      pos.setZ(i, pos.getZ(i) + Math.cos(time * 0.25 + i * 1.1) * 0.005);
    }
    pos.needsUpdate = true;

    const mat = ref.current.material as THREE.PointsMaterial;
    mat.opacity = 0.25 + Math.sin(time * 1.5) * 0.12;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={COUNT} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial color="#bbff44" size={0.2} transparent opacity={0.3} sizeAttenuation depthWrite={false} />
    </points>
  );
}

export const AmbientEffects = memo(function AmbientEffects() {
  return (
    <group>
      <DustParticles />
      <Fireflies />
    </group>
  );
});