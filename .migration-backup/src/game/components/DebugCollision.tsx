/**
 * Debug collision visualization overlay.
 * Renders all active circle and box obstacles as wireframe shapes.
 * Toggle with backtick (`) key.
 * 
 * Shows: player collider, mounted collider, spawn marker, 
 * all circle/box obstacles, gate passage indicators.
 */
import { useState, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { getCircleObstacles, getBoxObstacles } from '../systems/CollisionSystem';
import { getTerrainHeight } from './Terrain';

const debugMat = new THREE.MeshBasicMaterial({ color: '#ff0000', wireframe: true, transparent: true, opacity: 0.5 });
const debugMatBox = new THREE.MeshBasicMaterial({ color: '#00ff00', wireframe: true, transparent: true, opacity: 0.5 });
const debugMatPlayer = new THREE.MeshBasicMaterial({ color: '#ffff00', wireframe: true, transparent: true, opacity: 0.6 });
const debugMatMounted = new THREE.MeshBasicMaterial({ color: '#ff8800', wireframe: true, transparent: true, opacity: 0.4 });
const debugMatSpawn = new THREE.MeshBasicMaterial({ color: '#00ffff', wireframe: true, transparent: true, opacity: 0.7 });
const debugMatGate = new THREE.MeshBasicMaterial({ color: '#ff00ff', wireframe: true, transparent: true, opacity: 0.5 });
const circleGeo = new THREE.CylinderGeometry(1, 1, 2, 12);
const boxGeo = new THREE.BoxGeometry(1, 2, 1);
const markerGeo = new THREE.CylinderGeometry(0.3, 0.3, 6, 6);

// Spawn and gate coordinates
const SPAWN_POS: [number, number] = [0, 82];
const GATE_MARKERS: [number, number][] = [
  [0, 38],     // Capital south gate (gatehouse w=8, towers at ±4)
  [185, -155 + 20],  // Fort south gate (gatehouse w=7, towers at ±3.5)
  [155, 195 + 14],   // Monastery south gate (wall gap ±3, no gatehouse)
];

export function DebugCollision({ playerPositionRef, isMounted = false, playerRadius = 0.4 }: {
  playerPositionRef: React.RefObject<THREE.Vector3>;
  isMounted?: boolean;
  playerRadius?: number;
}) {
  const [enabled, setEnabled] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Backquote') {
        setEnabled(v => !v);
        setTick(t => t + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Refresh obstacles snapshot periodically when debug is on
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [enabled]);

  const { circles, boxes } = useMemo(() => {
    if (!enabled) return { circles: [], boxes: [] };
    return { circles: [...getCircleObstacles()], boxes: [...getBoxObstacles()] };
  }, [enabled, tick]);

  if (!enabled) return null;

  const pp = playerPositionRef.current;
  const effectiveRadius = isMounted ? 1.0 : playerRadius;

  return (
    <group>
      {/* Player collision radius — yellow for foot, orange for mounted */}
      {pp && (
        <mesh position={[pp.x, pp.y, pp.z]} geometry={circleGeo}
          scale={[effectiveRadius, 1, effectiveRadius]}
          material={isMounted ? debugMatMounted : debugMatPlayer} />
      )}

      {/* Spawn marker — cyan pillar */}
      <mesh position={[SPAWN_POS[0], getTerrainHeight(SPAWN_POS[0], SPAWN_POS[1]) + 3, SPAWN_POS[1]]}
        geometry={markerGeo} material={debugMatSpawn} />

      {/* Gate passage markers — magenta pillars */}
      {GATE_MARKERS.map(([gx, gz], i) => (
        <mesh key={`gate${i}`}
          position={[gx, getTerrainHeight(gx, gz) + 3, gz]}
          geometry={markerGeo} material={debugMatGate} />
      ))}

      {/* Circle obstacles */}
      {circles.map((c, i) => (
        <mesh key={`c${i}`} position={[c.x, getTerrainHeight(c.x, c.z) + 1, c.z]}
          geometry={circleGeo}
          scale={[c.radius, 1, c.radius]} material={debugMat} />
      ))}

      {/* Box obstacles */}
      {boxes.map((b, i) => (
        <mesh key={`b${i}`} position={[b.cx, getTerrainHeight(b.cx, b.cz) + 1, b.cz]}
          rotation={[0, b.rotation, 0]}
          geometry={boxGeo} scale={[b.halfW * 2, 1, b.halfD * 2]} material={debugMatBox} />
      ))}
    </group>
  );
}
