/**
 * SkyCreatures — Ambient birds and dragons flying in the sky.
 * Covers the full 1800x1800 world. Distance-culled. Shared geometry.
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const birdBodyGeo = new THREE.BoxGeometry(0.15, 0.08, 0.3);
const birdWingGeo = new THREE.BoxGeometry(0.5, 0.02, 0.2);
const birdMat = new THREE.MeshLambertMaterial({ color: '#1a1a1a' });

const dragonBodyGeo = new THREE.BoxGeometry(0.8, 0.5, 2.5);
const dragonHeadGeo = new THREE.BoxGeometry(0.4, 0.35, 0.6);
const dragonWingGeo = new THREE.BoxGeometry(3, 0.05, 1.5);
const dragonTailGeo = new THREE.BoxGeometry(0.25, 0.2, 2);
const dragonMat = new THREE.MeshLambertMaterial({ color: '#2a2018' });
const dragonWingMat = new THREE.MeshLambertMaterial({ color: '#3a2a1a' });
const dragonAccent = new THREE.MeshLambertMaterial({ color: '#5a1a10' });
const _spineGeo = new THREE.BoxGeometry(0.15, 0.15, 0.1);

interface BirdFlock {
  cx: number; cz: number;
  altitude: number;
  radius: number;
  speed: number;
  count: number;
  phase: number;
}

interface DragonDef {
  cx: number; cz: number;
  altitude: number;
  radius: number;
  speed: number;
  phase: number;
}

const FLOCKS: BirdFlock[] = [
  // Central area
  { cx: 0, cz: 20, altitude: 45, radius: 30, speed: 0.3, count: 5, phase: 0 },
  { cx: -120, cz: -80, altitude: 55, radius: 40, speed: 0.25, count: 4, phase: 1.5 },
  { cx: 180, cz: 60, altitude: 50, radius: 35, speed: 0.28, count: 6, phase: 3 },
  { cx: -180, cz: 140, altitude: 60, radius: 45, speed: 0.2, count: 3, phase: 0.8 },
  { cx: 100, cz: -150, altitude: 48, radius: 30, speed: 0.3, count: 4, phase: 2.2 },
  { cx: -50, cz: 200, altitude: 52, radius: 35, speed: 0.22, count: 5, phase: 4.1 },
  { cx: 200, cz: 200, altitude: 65, radius: 50, speed: 0.18, count: 3, phase: 5 },
  { cx: -200, cz: -180, altitude: 58, radius: 38, speed: 0.24, count: 4, phase: 1.1 },
  { cx: 60, cz: 100, altitude: 42, radius: 25, speed: 0.32, count: 3, phase: 3.5 },
  { cx: -100, cz: 50, altitude: 47, radius: 28, speed: 0.27, count: 4, phase: 2.7 },
  // Over new kingdoms
  { cx: -500, cz: -450, altitude: 55, radius: 40, speed: 0.25, count: 4, phase: 6.0 }, // Thornwall
  { cx: -520, cz: -420, altitude: 60, radius: 35, speed: 0.2, count: 3, phase: 0.3 },
  { cx: 450, cz: 350, altitude: 50, radius: 45, speed: 0.22, count: 5, phase: 1.8 },   // Rivermoor
  { cx: 430, cz: 380, altitude: 42, radius: 30, speed: 0.3, count: 3, phase: 4.5 },
  { cx: -400, cz: 500, altitude: 85, radius: 50, speed: 0.18, count: 4, phase: 2.5 },   // Stonepeak — higher for mountain terrain
  { cx: -380, cz: 530, altitude: 90, radius: 40, speed: 0.15, count: 3, phase: 5.3 },
  { cx: 550, cz: -400, altitude: 48, radius: 35, speed: 0.28, count: 4, phase: 3.2 },   // Darkhollow
  { cx: -550, cz: 100, altitude: 52, radius: 40, speed: 0.24, count: 5, phase: 0.7 },    // Goldenvale
  // Travel corridors
  { cx: -300, cz: -250, altitude: 55, radius: 45, speed: 0.2, count: 3, phase: 7.1 },    // Western Marches
  { cx: 300, cz: -200, altitude: 50, radius: 40, speed: 0.22, count: 3, phase: 1.4 },    // Eastern approach
  { cx: 0, cz: 500, altitude: 60, radius: 50, speed: 0.18, count: 3, phase: 4.8 },       // Northern reach
  { cx: -300, cz: 300, altitude: 55, radius: 35, speed: 0.24, count: 4, phase: 2.1 },    // NW corridor
  { cx: 300, cz: 100, altitude: 48, radius: 30, speed: 0.28, count: 3, phase: 5.6 },     // East mid
];

const DRAGONS: DragonDef[] = [
  // Central world
  { cx: -220, cz: 180, altitude: 80, radius: 60, speed: 0.08, phase: 0 },
  { cx: 230, cz: -200, altitude: 90, radius: 70, speed: 0.06, phase: 2 },
  { cx: 180, cz: 220, altitude: 85, radius: 55, speed: 0.07, phase: 4 },
  // Over new kingdoms — rare sightings
  { cx: -500, cz: -400, altitude: 95, radius: 80, speed: 0.05, phase: 1 },  // Thornwall frontier
  { cx: -400, cz: 520, altitude: 110, radius: 70, speed: 0.04, phase: 3 },  // Stonepeak mountains — extra altitude for terrain
  { cx: 500, cz: -350, altitude: 85, radius: 65, speed: 0.06, phase: 5 },   // Darkhollow wastes
];

function BirdFlockRenderer({ flock, playerPos }: { flock: BirdFlock; playerPos: THREE.Vector3 | null }) {
  const groupRef = useRef<THREE.Group>(null);

  const birds = useMemo(() =>
    Array.from({ length: flock.count }, (_, i) => ({
      offset: (i / flock.count) * Math.PI * 2,
      lateralOffset: (Math.sin(i * 7.3) * 0.4) * flock.radius,
      flapSpeed: 6 + Math.sin(i * 3.1) * 2,
      altOff: Math.sin(i * 2.7) * 3,
    })),
  [flock]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime;

    if (playerPos) {
      const baseAngle = t * flock.speed + flock.phase;
      const bx = flock.cx + Math.cos(baseAngle) * flock.radius;
      const bz = flock.cz + Math.sin(baseAngle) * flock.radius;
      const dx = playerPos.x - bx;
      const dz = playerPos.z - bz;
      if (dx * dx + dz * dz > 250 * 250) {
        groupRef.current.visible = false;
        return;
      }
    }
    groupRef.current.visible = true;

    groupRef.current.children.forEach((bird, i) => {
      const b = birds[i];
      if (!b) return;
      const angle = t * flock.speed + flock.phase + b.offset * 0.15;
      const x = flock.cx + Math.cos(angle) * (flock.radius + b.lateralOffset * 0.3);
      const z = flock.cz + Math.sin(angle) * (flock.radius + b.lateralOffset * 0.3);
      const y = flock.altitude + b.altOff + Math.sin(t * 0.5 + i) * 2;

      bird.position.set(x, y, z);
      const nextAngle = angle + 0.01;
      const nx = flock.cx + Math.cos(nextAngle) * flock.radius;
      const nz = flock.cz + Math.sin(nextAngle) * flock.radius;
      bird.rotation.y = Math.atan2(nx - x, nz - z);

      const flapAngle = Math.sin(t * b.flapSpeed) * 0.6;
      const glide = Math.sin(t * 0.3 + i * 2);
      const effectiveFlap = glide > 0.5 ? flapAngle * 0.1 : flapAngle;

      const wings = bird.children;
      if (wings[1]) (wings[1] as THREE.Mesh).rotation.z = effectiveFlap;
      if (wings[2]) (wings[2] as THREE.Mesh).rotation.z = -effectiveFlap;
    });
  });

  return (
    <group ref={groupRef}>
      {birds.map((_, i) => (
        <group key={i}>
          <mesh geometry={birdBodyGeo} material={birdMat} />
          <mesh position={[-0.3, 0, 0]} geometry={birdWingGeo} material={birdMat} />
          <mesh position={[0.3, 0, 0]} geometry={birdWingGeo} material={birdMat} />
        </group>
      ))}
    </group>
  );
}

function DragonRenderer({ dragon, playerPos }: { dragon: DragonDef; playerPos: THREE.Vector3 | null }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime;

    const angle = t * dragon.speed + dragon.phase;
    const x = dragon.cx + Math.cos(angle) * dragon.radius;
    const z = dragon.cz + Math.sin(angle) * dragon.radius;

    if (playerPos) {
      const dx = playerPos.x - x;
      const dz = playerPos.z - z;
      if (dx * dx + dz * dz > 300 * 300) {
        groupRef.current.visible = false;
        return;
      }
    }
    groupRef.current.visible = true;

    const flapCycle = Math.sin(t * 1.5);
    const isGliding = Math.sin(t * 0.2 + dragon.phase) > 0.3;
    const flapAngle = isGliding ? flapCycle * 0.05 : flapCycle * 0.4;
    const altBob = isGliding ? Math.sin(t * 0.3) * 1.5 : Math.abs(flapCycle) * 2;
    const y = dragon.altitude + altBob;

    groupRef.current.position.set(x, y, z);

    const nextA = angle + 0.01;
    const nx = dragon.cx + Math.cos(nextA) * dragon.radius;
    const nz = dragon.cz + Math.sin(nextA) * dragon.radius;
    groupRef.current.rotation.y = Math.atan2(nx - x, nz - z);
    groupRef.current.rotation.z = Math.sin(angle) * 0.1;
    groupRef.current.rotation.x = isGliding ? -0.05 : flapCycle * 0.05;

    const parts = groupRef.current.children;
    if (parts[1]) parts[1].rotation.z = flapAngle;
    if (parts[2]) parts[2].rotation.z = -flapAngle;
    if (parts[3]) {
      parts[3].rotation.y = Math.sin(t * 0.8 + dragon.phase) * 0.15;
      parts[3].rotation.x = Math.sin(t * 0.5) * 0.05;
    }
    if (parts[4]) {
      parts[4].rotation.y = Math.sin(t * 0.6 + dragon.phase * 2) * 0.1;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={dragonBodyGeo} material={dragonMat} castShadow />
      <mesh position={[-2, 0.1, 0]} geometry={dragonWingGeo} material={dragonWingMat} />
      <mesh position={[2, 0.1, 0]} geometry={dragonWingGeo} material={dragonWingMat} />
      <mesh position={[0, 0, 1.8]} geometry={dragonTailGeo} material={dragonAccent} />
      <mesh position={[0, 0.1, -1.4]} geometry={dragonHeadGeo} material={dragonMat} />
      {[0, 0.4, 0.8, -0.4].map((zOff, i) => (
        <mesh key={i} position={[0, 0.35, zOff]} rotation={[0, 0, Math.PI / 4]}
          geometry={_spineGeo} material={dragonAccent} />
      ))}
    </group>
  );
}

interface Props {
  playerPositionRef: React.RefObject<THREE.Vector3>;
}

export function SkyCreatures({ playerPositionRef }: Props) {
  const playerPos = playerPositionRef.current;

  return (
    <group>
      {FLOCKS.map((flock, i) => (
        <BirdFlockRenderer key={`flock-${i}`} flock={flock} playerPos={playerPos} />
      ))}
      {DRAGONS.map((dragon, i) => (
        <DragonRenderer key={`dragon-${i}`} dragon={dragon} playerPos={playerPos} />
      ))}
    </group>
  );
}
