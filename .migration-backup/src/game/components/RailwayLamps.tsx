/**
 * RailwayLamps — Continuous medieval guide lamps along both railway lines.
 * Uses InstancedMesh for all lamp posts and glow cores (two draw calls total).
 * Emissive glow swaps on/off with night cycle. Nearest 4 lamps to the player
 * get real non-shadow-casting PointLights for local illumination.
 *
 * Lamps are placed every ~24 world units along the track, offset 4u to one side.
 * Stations (within 12u) and bridge midpoints (within 10u) are skipped to avoid clutter.
 */
import { useRef, useMemo, memo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getNightFactor } from '../systems/TimeOfDay';
import { getTerrainHeight } from './Terrain';
import {
  LINE_A_WAYPOINTS,
  LINE_B_WAYPOINTS,
  RAILWAY_STATIONS,
  RAILWAY_BRIDGES,
  RailwayWaypoint,
} from '../world/RailwayData';

// ========== CONFIG ==========
const LAMP_SPACING = 24;        // World units between lamps
const TRACK_OFFSET = 4;         // Perpendicular offset from track center
const STATION_SKIP_RADIUS = 12; // Skip lamps near stations
const BRIDGE_SKIP_RADIUS = 10;  // Skip lamps near bridge midpoints
const NUM_REAL_LIGHTS = 4;      // Nearest lamps that get real PointLights
const LIGHT_INTENSITY = 12;
const LIGHT_DISTANCE = 30;
const LIGHT_COLOR = '#ff9930';

// Lamp dimensions
const POST_HEIGHT = 3.2;
const POST_RADIUS = 0.07;
const GLOW_SIZE = 0.2;
const LANTERN_Y = POST_HEIGHT - 0.3;

// ========== MATERIALS ==========
const postMat = new THREE.MeshLambertMaterial({ color: '#2a2a2a' });
const housingMat = new THREE.MeshLambertMaterial({ color: '#333333' });
const glowOnMat = new THREE.MeshBasicMaterial({ color: '#ffaa44' });
const glowOffMat = new THREE.MeshBasicMaterial({ color: '#553310' });

// ========== GEOMETRIES (shared, low-poly) ==========
const postGeo = new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, POST_HEIGHT, 6);
const glowGeo = new THREE.BoxGeometry(GLOW_SIZE, GLOW_SIZE * 1.4, GLOW_SIZE);
const housingGeo = new THREE.BoxGeometry(0.24, 0.34, 0.24);
const bracketGeo = new THREE.BoxGeometry(0.3, 0.05, 0.05);
const capGeo = new THREE.ConeGeometry(0.13, 0.11, 4);

// ========== LAMP POSITION GENERATION ==========

interface RailLampDef {
  x: number;
  z: number;
  y: number;
}

function isNearStation(x: number, z: number): boolean {
  for (const stn of RAILWAY_STATIONS) {
    const dx = x - stn.position[0];
    const dz = z - stn.position[1];
    if (dx * dx + dz * dz < STATION_SKIP_RADIUS * STATION_SKIP_RADIUS) return true;
  }
  return false;
}

function isNearBridge(x: number, z: number): boolean {
  for (const br of RAILWAY_BRIDGES) {
    const dx = x - br.position[0];
    const dz = z - br.position[2];
    if (dx * dx + dz * dz < BRIDGE_SKIP_RADIUS * BRIDGE_SKIP_RADIUS) return true;
  }
  return false;
}

function generateLampsAlongLine(waypoints: RailwayWaypoint[]): RailLampDef[] {
  const lamps: RailLampDef[] = [];
  if (waypoints.length < 2) return lamps;

  // Build cumulative distance along the polyline
  const cumDist: number[] = [0];
  for (let i = 1; i < waypoints.length; i++) {
    const dx = waypoints[i].x - waypoints[i - 1].x;
    const dz = waypoints[i].z - waypoints[i - 1].z;
    cumDist.push(cumDist[i - 1] + Math.sqrt(dx * dx + dz * dz));
  }
  const totalLen = cumDist[cumDist.length - 1];

  // Walk along polyline at LAMP_SPACING intervals
  let dist = LAMP_SPACING / 2; // Start half-spacing in
  let segIdx = 0;

  while (dist < totalLen) {
    // Advance segIdx to the segment containing `dist`
    while (segIdx < cumDist.length - 2 && cumDist[segIdx + 1] < dist) segIdx++;

    const segStart = cumDist[segIdx];
    const segEnd = cumDist[segIdx + 1];
    const segLen = segEnd - segStart;
    if (segLen < 0.1) { dist += LAMP_SPACING; continue; }

    const t = (dist - segStart) / segLen;
    const px = waypoints[segIdx].x + t * (waypoints[segIdx + 1].x - waypoints[segIdx].x);
    const pz = waypoints[segIdx].z + t * (waypoints[segIdx + 1].z - waypoints[segIdx].z);

    // Skip if near station or bridge
    if (!isNearStation(px, pz) && !isNearBridge(px, pz)) {
      // Compute perpendicular direction for offset
      const dx = waypoints[segIdx + 1].x - waypoints[segIdx].x;
      const dz = waypoints[segIdx + 1].z - waypoints[segIdx].z;
      const len = Math.sqrt(dx * dx + dz * dz);
      // Perpendicular (right side of travel direction)
      const nx = -dz / len;
      const nz = dx / len;

      const lx = px + nx * TRACK_OFFSET;
      const lz = pz + nz * TRACK_OFFSET;
      const ly = getTerrainHeight(lx, lz);

      lamps.push({ x: lx, z: lz, y: ly });
    }

    dist += LAMP_SPACING;
  }

  return lamps;
}

// ========== COMPONENT ==========

interface RailwayLampsProps {
  playerPositionRef: React.RefObject<THREE.Vector3>;
}

export const RailwayLamps = memo(function RailwayLamps({ playerPositionRef }: RailwayLampsProps) {
  // Generate all lamp positions once
  const allLamps = useMemo(() => {
    const lampsA = generateLampsAlongLine(LINE_A_WAYPOINTS);
    const lampsB = generateLampsAlongLine(LINE_B_WAYPOINTS);
    const all = [...lampsA, ...lampsB];
    console.log(`[RailwayLamps] Generated ${all.length} lamps (A:${lampsA.length} B:${lampsB.length})`);
    return all;
  }, []);

  const count = allLamps.length;

  // Refs for instanced meshes
  const postInstanceRef = useRef<THREE.InstancedMesh>(null);
  const glowInstanceRef = useRef<THREE.InstancedMesh>(null);
  const housingInstanceRef = useRef<THREE.InstancedMesh>(null);
  const bracketInstanceRef = useRef<THREE.InstancedMesh>(null);
  const capInstanceRef = useRef<THREE.InstancedMesh>(null);

  // Real lights refs
  const lightRefs = useRef<(THREE.PointLight | null)[]>([]);
  const frameSkip = useRef(0);
  const nearestIndices = useRef<number[]>(Array(NUM_REAL_LIGHTS).fill(0));
  const wasNight = useRef(false);

  // Set up instance matrices once
  useEffect(() => {
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const { x, y, z } = allLamps[i];

      // Post
      if (postInstanceRef.current) {
        dummy.position.set(x, y + POST_HEIGHT / 2, z);
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        postInstanceRef.current.setMatrixAt(i, dummy.matrix);
      }

      // Bracket
      if (bracketInstanceRef.current) {
        dummy.position.set(x + 0.18, y + LANTERN_Y + 0.15, z);
        dummy.updateMatrix();
        bracketInstanceRef.current.setMatrixAt(i, dummy.matrix);
      }

      // Housing
      if (housingInstanceRef.current) {
        dummy.position.set(x + 0.32, y + LANTERN_Y, z);
        dummy.updateMatrix();
        housingInstanceRef.current.setMatrixAt(i, dummy.matrix);
      }

      // Glow core
      if (glowInstanceRef.current) {
        dummy.position.set(x + 0.32, y + LANTERN_Y, z);
        dummy.updateMatrix();
        glowInstanceRef.current.setMatrixAt(i, dummy.matrix);
      }

      // Cap
      if (capInstanceRef.current) {
        dummy.position.set(x + 0.32, y + LANTERN_Y + 0.22, z);
        dummy.updateMatrix();
        capInstanceRef.current.setMatrixAt(i, dummy.matrix);
      }
    }

    // Flag all for GPU upload
    [postInstanceRef, glowInstanceRef, housingInstanceRef, bracketInstanceRef, capInstanceRef].forEach(ref => {
      if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
    });
  }, [allLamps, count]);

  // Per-frame: night glow swap + nearest real lights
  useFrame(({ clock }) => {
    const nightFactor = getNightFactor();
    const isNight = nightFactor > 0.05;

    // Swap glow material when night state changes
    if (isNight !== wasNight.current) {
      wasNight.current = isNight;
      if (glowInstanceRef.current) {
        (glowInstanceRef.current as any).material = isNight ? glowOnMat : glowOffMat;
      }
    }

    // Update real lights
    const lights = lightRefs.current;
    if (!isNight) {
      for (let i = 0; i < NUM_REAL_LIGHTS; i++) {
        if (lights[i]) lights[i]!.intensity = 0;
      }
      return;
    }

    // Find nearest lamps every 20 frames
    frameSkip.current++;
    if (frameSkip.current % 20 === 0) {
      const pp = playerPositionRef.current;
      if (!pp) return;

      // Simple distance sort for nearest N
      const scored: { idx: number; dist2: number }[] = [];
      for (let i = 0; i < count; i++) {
        const lamp = allLamps[i];
        const dx = pp.x - lamp.x;
        const dz = pp.z - lamp.z;
        scored.push({ idx: i, dist2: dx * dx + dz * dz });
      }
      scored.sort((a, b) => a.dist2 - b.dist2);

      for (let i = 0; i < NUM_REAL_LIGHTS; i++) {
        nearestIndices.current[i] = scored[i]?.idx ?? 0;
      }
    }

    // Position and flicker real lights
    for (let i = 0; i < NUM_REAL_LIGHTS; i++) {
      const light = lights[i];
      if (!light) continue;
      const lamp = allLamps[nearestIndices.current[i]];
      if (!lamp) continue;

      light.position.set(lamp.x + 0.32, lamp.y + LANTERN_Y, lamp.z);
      const flicker = 0.93 + Math.sin(clock.elapsedTime * (8 + i * 2.1)) * 0.04
        + Math.sin(clock.elapsedTime * (13 + i * 3.3)) * 0.03;
      light.intensity = nightFactor * LIGHT_INTENSITY * flicker;
    }
  });

  const setLightRef = (i: number) => (el: THREE.PointLight | null) => {
    lightRefs.current[i] = el;
  };

  if (count === 0) return null;

  return (
    <group>
      {/* Instanced posts */}
      <instancedMesh ref={postInstanceRef} args={[postGeo, postMat, count]}
        frustumCulled castShadow={false} />
      {/* Instanced brackets */}
      <instancedMesh ref={bracketInstanceRef} args={[bracketGeo, housingMat, count]}
        frustumCulled castShadow={false} />
      {/* Instanced housings */}
      <instancedMesh ref={housingInstanceRef} args={[housingGeo, housingMat, count]}
        frustumCulled castShadow={false} />
      {/* Instanced glow cores */}
      <instancedMesh ref={glowInstanceRef} args={[glowGeo, glowOffMat, count]}
        frustumCulled castShadow={false} />
      {/* Instanced caps */}
      <instancedMesh ref={capInstanceRef} args={[capGeo, housingMat, count]}
        frustumCulled castShadow={false} />

      {/* Real PointLights for nearest lamps */}
      {Array.from({ length: NUM_REAL_LIGHTS }, (_, i) => (
        <pointLight
          key={`rail-lamp-light-${i}`}
          ref={setLightRef(i)}
          color={LIGHT_COLOR}
          intensity={0}
          distance={LIGHT_DISTANCE}
          decay={1}
          castShadow={false}
        />
      ))}
    </group>
  );
});
