/**
 * NightLighting — Medieval lamp/torch props placed at settlements, roads, bridges.
 * All lamps are emissive meshes (zero light cost). The nearest 3 lamps to the
 * player get real non-shadow-casting PointLights for local illumination.
 * Active only at night — zero cost during daytime.
 */
import { useRef, useMemo, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getNightFactor } from '../systems/TimeOfDay';
import { getTerrainHeight } from './Terrain';
import { SETTLEMENTS } from '../world/RegionData';
import { BRIDGES } from '../world/BridgeData';
import { ROADS } from '../world/RegionData';
import { GEO, MAT } from '../world/SettlementPieces';

// ========== CONFIGURATION ==========
const NUM_ACTIVE_LIGHTS = 3;
const LIGHT_INTENSITY = 14;
const LIGHT_DISTANCE = 35;
const LIGHT_DECAY = 1;
const LIGHT_COLOR = '#ff9930';

// ========== LAMP POSITION DATA ==========

interface LampDef {
  x: number;
  z: number;
  id: string;
}

function generateLampPositions(): LampDef[] {
  const lamps: LampDef[] = [];
  let id = 0;

  // --- Settlement lamps: 2-4 per settlement ---
  for (const s of SETTLEMENTS) {
    const [sx, sz] = s.position;
    const isLarge = s.size === 'large';
    const isMedium = s.size === 'medium';

    // Gate area (south side for most settlements)
    if (isLarge || isMedium) {
      const gateOffset = isLarge ? 45 : isMedium ? 25 : 15;
      lamps.push({ x: sx - 6, z: sz + gateOffset + 3, id: `lamp-${id++}` });
      lamps.push({ x: sx + 6, z: sz + gateOffset + 3, id: `lamp-${id++}` });
    }

    // Center area
    lamps.push({ x: sx + 5, z: sz + 3, id: `lamp-${id++}` });

    // Extra lamp for large settlements
    if (isLarge) {
      lamps.push({ x: sx - 8, z: sz - 10, id: `lamp-${id++}` });
    }
  }

  // --- Road junction lamps: selected key crossroads ---
  for (const road of ROADS) {
    const dx = road.to[0] - road.from[0];
    const dz = road.to[1] - road.from[1];
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len > 60) {
      lamps.push({
        x: (road.from[0] + road.to[0]) / 2,
        z: (road.from[1] + road.to[1]) / 2,
        id: `lamp-${id++}`,
      });
    }
    if (len > 150) {
      lamps.push({
        x: road.from[0] + dx * 0.25,
        z: road.from[1] + dz * 0.25,
        id: `lamp-${id++}`,
      });
      lamps.push({
        x: road.from[0] + dx * 0.75,
        z: road.from[1] + dz * 0.75,
        id: `lamp-${id++}`,
      });
    }
  }

  // --- Bridge lamps: one at each end ---
  for (const bridge of BRIDGES) {
    const cos = Math.cos(bridge.rotation);
    const sin = Math.sin(bridge.rotation);
    const halfLen = bridge.length / 2;
    lamps.push({
      x: bridge.position[0] + sin * halfLen,
      z: bridge.position[2] + cos * halfLen,
      id: `lamp-${id++}`,
    });
    lamps.push({
      x: bridge.position[0] - sin * halfLen,
      z: bridge.position[2] - cos * halfLen,
      id: `lamp-${id++}`,
    });
  }

  // --- SPAWN AREA & IRONHOLD APPROACH LAMPS ---
  // Spawn is at [0, 82]. Ironhold gate at [0, ~48]. Road runs [0,38]→[0,55].
  // Fill the gap from spawn down to Ironhold gate.
  lamps.push({ x: -4, z: 80, id: `lamp-${id++}` });  // Near spawn (left side)
  lamps.push({ x: 4,  z: 72, id: `lamp-${id++}` });  // Approach road (right)
  lamps.push({ x: -4, z: 63, id: `lamp-${id++}` });  // Midway to gate (left)
  lamps.push({ x: 4,  z: 55, id: `lamp-${id++}` });  // Gate approach (right)

  // Ironhold inner town area (near center [0,0])
  lamps.push({ x: -10, z: 15, id: `lamp-${id++}` }); // Town north road
  lamps.push({ x: 10,  z: 15, id: `lamp-${id++}` }); // Town north road
  lamps.push({ x: -12, z: -5, id: `lamp-${id++}` }); // Town center west
  lamps.push({ x: 12,  z: -5, id: `lamp-${id++}` }); // Town center east
  lamps.push({ x: 0,   z: 30, id: `lamp-${id++}` }); // Main road inside gate
  lamps.push({ x: 0,   z: 20, id: `lamp-${id++}` }); // Inner approach

  return lamps;
}

const ALL_LAMPS = generateLampPositions();

// ========== MATERIALS ==========

const emissiveMat = new THREE.MeshBasicMaterial({ color: '#ffaa44' });
const emissiveDimMat = new THREE.MeshBasicMaterial({ color: '#553310' });
const postMat = MAT.iron;
const bracketMat = MAT.iron;

// ========== LAMP MESH COMPONENT ==========

function LampPost({ x, z, y }: { x: number; z: number; y: number }) {
  return (
    <group position={[x, y, z]}>
      {/* Iron post */}
      <mesh position={[0, 1.5, 0]} geometry={GEO.box}
        scale={[0.1, 3, 0.1]} material={postMat} castShadow />
      {/* Bracket arm */}
      <mesh position={[0.25, 2.8, 0]} geometry={GEO.box}
        scale={[0.4, 0.07, 0.07]} material={bracketMat} />
      {/* Lantern housing */}
      <mesh position={[0.4, 2.55, 0]} geometry={GEO.box}
        scale={[0.25, 0.35, 0.25]} material={bracketMat} castShadow />
      {/* Glow core — enlarged for visibility */}
      <mesh position={[0.4, 2.55, 0]} geometry={GEO.box}
        scale={[0.22, 0.3, 0.22]}
        material={emissiveDimMat}
        userData={{ isGlow: true }} />
      {/* Lantern top cap */}
      <mesh position={[0.4, 2.78, 0]} geometry={GEO.cone4}
        scale={[0.16, 0.14, 0.16]} material={bracketMat} />
    </group>
  );
}

// ========== MAIN COMPONENT ==========

interface NightLightingProps {
  playerPositionRef: React.RefObject<THREE.Vector3>;
}

interface NearestLamp {
  x: number;
  y: number;
  z: number;
}

export const NightLighting = memo(function NightLighting({ playerPositionRef }: NightLightingProps) {
  const lightRefs = useRef<(THREE.PointLight | null)[]>([]);
  const frameSkip = useRef(0);
  const nearestLamps = useRef<NearestLamp[]>(
    Array.from({ length: NUM_ACTIVE_LIGHTS }, () => ({ x: 0, y: 0, z: 0 }))
  );
  const glowMeshesRef = useRef<THREE.Mesh[]>([]);
  const wasNight = useRef(false);
  const groupRef = useRef<THREE.Group>(null);
  const glowCollected = useRef(false);
  const auditLogged = useRef(false);

  // Pre-compute terrain heights for all lamps
  const lampData = useMemo(() => {
    const data = ALL_LAMPS.map(lamp => ({
      ...lamp,
      y: getTerrainHeight(lamp.x, lamp.z),
    }));
    // One-time audit log
    console.log(`[NightLamp] Total lamps generated: ${data.length}`);
    return data;
  }, []);

  const setLightRef = (index: number) => (el: THREE.PointLight | null) => {
    lightRefs.current[index] = el;
  };

  useFrame(({ clock }) => {
    const nightFactor = getNightFactor();
    const isNight = nightFactor > 0.05;

    // Collect glow meshes once
    if (!glowCollected.current && groupRef.current) {
      const meshes: THREE.Mesh[] = [];
      groupRef.current.traverse((obj) => {
        if ((obj as any).userData?.isGlow) {
          meshes.push(obj as THREE.Mesh);
        }
      });
      if (meshes.length > 0) {
        glowMeshesRef.current = meshes;
        glowCollected.current = true;
        console.log(`[NightLamp] Collected ${meshes.length} glow meshes`);
      }
    }

    // Toggle emissive materials when night state changes
    if (isNight !== wasNight.current) {
      wasNight.current = isNight;
      const mat = isNight ? emissiveMat : emissiveDimMat;
      for (const mesh of glowMeshesRef.current) {
        mesh.material = mat;
      }
      console.log(`[NightLamp] Glow ${isNight ? 'ON' : 'OFF'}, nightFactor=${nightFactor.toFixed(3)}`);
    }

    // Update point lights
    const lights = lightRefs.current;
    
    if (!isNight) {
      for (let i = 0; i < NUM_ACTIVE_LIGHTS; i++) {
        if (lights[i]) lights[i]!.intensity = 0;
      }
      return;
    }

    // Find nearest N lamps every 15 frames (~0.25s)
    frameSkip.current++;
    if (frameSkip.current % 15 === 0) {
      const pp = playerPositionRef.current;
      if (pp) {
        // Compute distances for all lamps
        const scored = lampData.map(lamp => {
          const dx = pp.x - lamp.x;
          const dz = pp.z - lamp.z;
          return { lamp, dist2: dx * dx + dz * dz };
        });

        // Partial sort: find top N nearest
        scored.sort((a, b) => a.dist2 - b.dist2);

        for (let i = 0; i < NUM_ACTIVE_LIGHTS; i++) {
          const s = scored[i];
          if (s) {
            nearestLamps.current[i] = {
              x: s.lamp.x + 0.4,
              y: s.lamp.y + 2.55,
              z: s.lamp.z,
            };
          }
        }

        // Rate-limited audit log
        if (!auditLogged.current) {
          auditLogged.current = true;
          console.log(`[NightLamp] Player at [${pp.x.toFixed(1)}, ${pp.z.toFixed(1)}]`);
          for (let i = 0; i < NUM_ACTIVE_LIGHTS; i++) {
            const s = scored[i];
            if (s) {
              console.log(`[NightLamp] Light ${i}: lamp ${s.lamp.id} at [${s.lamp.x}, ${s.lamp.z}], dist=${Math.sqrt(s.dist2).toFixed(1)}`);
            }
          }
          // Reset after 60s for next check
          setTimeout(() => { auditLogged.current = false; }, 60000);
        }
      }
    }

    // Position and intensity for each light
    for (let i = 0; i < NUM_ACTIVE_LIGHTS; i++) {
      const light = lights[i];
      if (!light) continue;
      const nearest = nearestLamps.current[i];

      light.position.set(nearest.x, nearest.y, nearest.z);

      // Subtle per-light flicker variation
      const flicker = 0.92 + Math.sin(clock.elapsedTime * (7.5 + i * 2.3)) * 0.04
        + Math.sin(clock.elapsedTime * (12.1 + i * 3.7)) * 0.04;
      light.intensity = nightFactor * LIGHT_INTENSITY * flicker;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Lamp props */}
      {lampData.map(lamp => (
        <LampPost key={lamp.id} x={lamp.x} z={lamp.z} y={lamp.y} />
      ))}

      {/* 3 real PointLights — nearest to player */}
      {Array.from({ length: NUM_ACTIVE_LIGHTS }, (_, i) => (
        <pointLight
          key={`lamp-light-${i}`}
          ref={setLightRef(i)}
          color={LIGHT_COLOR}
          intensity={0}
          distance={LIGHT_DISTANCE}
          decay={LIGHT_DECAY}
          castShadow={false}
        />
      ))}
    </group>
  );
});
