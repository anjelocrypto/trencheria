/**
 * Horse — companion horse with smooth ref-based approach simulation.
 * Position/rotation are ref-driven during approach. React state only for
 * high-level transitions (called→approaching→waiting→idle).
 * Animation is driven by actual velocity, not state labels.
 * 
 * LAZY LOADING: Horse GLB models (~10MB) are deferred until the player
 * is within 30u of the horse or calls it. Before that, a wireframe box is shown.
 */
import { useRef, useEffect, useState, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HorseData, HORSE_APPROACH_SPEED, HORSE_APPROACH_STOP_DIST } from '../systems/HorseData';
import { getTerrainHeight } from './Terrain';
import { getBridgeHeight } from '../world/BridgeData';
import { resolveCollision } from '../systems/CollisionSystem';
import { HorseGLBModel } from './HorseGLBModel';
import { getGroundHeight, getSlopeFactor } from '../systems/Grounding';

const HORSE_MODEL_LOAD_DIST = 30; // Only load full GLB model within this distance

interface Props {
  horse: HorseData;
  playerPositionRef: React.RefObject<THREE.Vector3>;
  onUpdateHorse: (updates: Partial<HorseData>) => void;
  isMounted: boolean;
}

export function Horse({ horse, playerPositionRef, onUpdateHorse, isMounted }: Props) {
  const groupRef = useRef<THREE.Group>(null!);
  const animTimeRef = useRef(0);
  const moveSpeedRef = useRef(0);
  const rotRef = useRef(horse.rotation);
  const posRef = useRef<[number, number, number]>([...horse.position]);
  const lastStateRef = useRef(horse.state);
  const smoothYRef = useRef(horse.position[1]);
  const [horseModelNeeded, setHorseModelNeeded] = useState(false);

  useEffect(() => {
    if (horse.state !== lastStateRef.current) {
      posRef.current = [...horse.position];
      rotRef.current = horse.rotation;
      smoothYRef.current = horse.position[1];
      lastStateRef.current = horse.state;
    }
  }, [horse.state, horse.position, horse.rotation]);

  // Trigger horse model load when called or player is close
  useEffect(() => {
    if (!horseModelNeeded && horse.state !== 'idle') {
      setHorseModelNeeded(true);
    }
  }, [horse.state, horseModelNeeded]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    animTimeRef.current += dt;

    if (horse.state === 'mounted' || isMounted) return;

    // Check proximity for lazy horse model loading
    if (!horseModelNeeded) {
      const pp = playerPositionRef.current;
      if (pp) {
        const pdx = pp.x - posRef.current[0];
        const pdz = pp.z - posRef.current[2];
        if (pdx * pdx + pdz * pdz < HORSE_MODEL_LOAD_DIST * HORSE_MODEL_LOAD_DIST) {
          setHorseModelNeeded(true);
        }
      }
    }

    const playerPos = playerPositionRef.current;
    if (!playerPos) return;

    const [hx, , hz] = posRef.current;
    const dx = playerPos.x - hx;
    const dz = playerPos.z - hz;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (horse.state === 'called' || horse.state === 'approaching') {
      if (dist > HORSE_APPROACH_STOP_DIST) {
        const wantAngle = Math.atan2(dx, dz);
        let rotDiff = wantAngle - rotRef.current;
        if (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
        if (rotDiff < -Math.PI) rotDiff += Math.PI * 2;

        const speedRatio = moveSpeedRef.current / HORSE_APPROACH_SPEED;
        const turnRate = THREE.MathUtils.lerp(6, 2.5, speedRatio);
        rotRef.current += rotDiff * (1 - Math.exp(-turnRate * dt));
        if (rotRef.current > Math.PI) rotRef.current -= Math.PI * 2;
        if (rotRef.current < -Math.PI) rotRef.current += Math.PI * 2;

        let targetSpeed: number;
        if (dist > 30) {
          targetSpeed = HORSE_APPROACH_SPEED;
        } else if (dist > 12) {
          const t = (dist - 12) / 18;
          targetSpeed = HORSE_APPROACH_SPEED * (0.6 + 0.4 * t);
        } else {
          const t = Math.max(0, (dist - HORSE_APPROACH_STOP_DIST) / (12 - HORSE_APPROACH_STOP_DIST));
          targetSpeed = HORSE_APPROACH_SPEED * 0.5 * t * t;
        }

        // Slope-aware speed: AI horses can't yo-yo into cliffs. Sample 1.4u ahead
        // and reduce target speed proportionally to the upcoming grade.
        const aheadX = hx + Math.sin(rotRef.current) * 1.4;
        const aheadZ = hz + Math.cos(rotRef.current) * 1.4;
        const aheadDy = getGroundHeight(aheadX, aheadZ) - getGroundHeight(hx, hz);
        const aheadSlope = Math.atan2(aheadDy, 1.4);
        const slopeFactor = getSlopeFactor(aheadSlope, 0.35, 0.7); // ramp 20°→40°
        targetSpeed *= slopeFactor;

        moveSpeedRef.current += (targetSpeed - moveSpeedRef.current) * (1 - Math.exp(-5 * dt));

        const spd = moveSpeedRef.current;
        let nx = hx + Math.sin(rotRef.current) * spd * dt;
        let nz = hz + Math.cos(rotRef.current) * spd * dt;

        // Step-up clamp: don't let AI horses warp up cliffs.
        const curGroundY = getGroundHeight(hx, hz);
        const nextGroundY = getGroundHeight(nx, nz);
        if (nextGroundY - curGroundY > 0.85) {
          nx = hx;
          nz = hz;
          moveSpeedRef.current *= 0.5;
        }

        const resolved = resolveCollision(nx, nz, 0.8);
        nx = resolved.x;
        nz = resolved.z;

        const bridgeY = getBridgeHeight(nx, nz);
        const rawY = getTerrainHeight(nx, nz);
        const targetY = bridgeY !== null ? bridgeY : rawY;

        smoothYRef.current += (targetY - smoothYRef.current) * (1 - Math.exp(-12 * dt));

        posRef.current = [nx, smoothYRef.current, nz];

        animTimeRef.current += dt * spd * 0.7;

        if (lastStateRef.current !== 'approaching') {
          lastStateRef.current = 'approaching';
          onUpdateHorse({ state: 'approaching' });
        }
      } else {
        moveSpeedRef.current *= Math.exp(-8 * dt);

        if (moveSpeedRef.current < 0.05) {
          moveSpeedRef.current = 0;
          if (lastStateRef.current !== 'waiting') {
            lastStateRef.current = 'waiting';
            onUpdateHorse({
              state: 'waiting',
              position: [...posRef.current],
              rotation: rotRef.current,
            });
          }
        }
      }
    } else if (horse.state === 'waiting') {
      moveSpeedRef.current *= Math.exp(-6 * dt);
      if (moveSpeedRef.current < 0.01) moveSpeedRef.current = 0;

      if (dist > 50 && lastStateRef.current !== 'idle') {
        lastStateRef.current = 'idle';
        onUpdateHorse({ state: 'idle', position: [...posRef.current], rotation: rotRef.current });
      }
    } else {
      moveSpeedRef.current *= Math.exp(-6 * dt);
      if (moveSpeedRef.current < 0.01) moveSpeedRef.current = 0;
    }

    if (groupRef.current) {
      groupRef.current.position.set(posRef.current[0], posRef.current[1], posRef.current[2]);
      groupRef.current.rotation.set(0, rotRef.current, 0);
    }
  });

  // Don't render if mounted — Player.tsx renders the horse inline
  if (horse.state === 'mounted' || isMounted) return null;

  // Cull if far from player — but never cull while horse is being called/approaching
  const playerPos = playerPositionRef.current;
  if (playerPos && horse.state !== 'called' && horse.state !== 'approaching' && horse.state !== 'waiting') {
    const dx = playerPos.x - posRef.current[0];
    const dz = playerPos.z - posRef.current[2];
    if (dx * dx + dz * dz > 200 * 200) return null;
  }

  const horsePlaceholder = (
    <mesh>
      <boxGeometry args={[1, 2, 2]} />
      <meshStandardMaterial color="brown" wireframe />
    </mesh>
  );

  return (
    <group ref={groupRef} position={[posRef.current[0], posRef.current[1], posRef.current[2]]}>
      {horseModelNeeded ? (
        <Suspense fallback={horsePlaceholder}>
          <HorseGLBModel moveSpeed={moveSpeedRef} renderPath="world-horse" />
        </Suspense>
      ) : horsePlaceholder}
    </group>
  );
}
