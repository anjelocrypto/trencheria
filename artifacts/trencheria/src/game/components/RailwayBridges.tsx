/**
 * RailwayBridges — 3 iron girder rail bridges at approved locations.
 * Distinct visual from road/foot bridges (Bridges.tsx uses stone/wood).
 * These are iron/steel girder bridges on stone piers.
 */
import { memo, useMemo } from 'react';
import * as THREE from 'three';
import { RAILWAY_BRIDGES, RailwayBridge, LINE_A_WAYPOINTS, LINE_B_WAYPOINTS } from '../world/RailwayData';
import { GEO } from '../world/SettlementPieces';

// Railway bridge materials
const ironMat = new THREE.MeshLambertMaterial({ color: '#3a3a3a' });
const ironDarkMat = new THREE.MeshLambertMaterial({ color: '#2a2a2a' });
const stonePierMat = new THREE.MeshLambertMaterial({ color: '#6a6860' });
const deckMat = new THREE.MeshLambertMaterial({ color: '#4a3a1a' });
const railMat = new THREE.MeshLambertMaterial({ color: '#333333' });

function getTrackAngleAtBridge(bridge: RailwayBridge): number {
  const wps = bridge.line === 'A' ? LINE_A_WAYPOINTS : LINE_B_WAYPOINTS;
  let bestIdx = 0, bestD = Infinity;
  for (let i = 0; i < wps.length; i++) {
    const dx = wps[i].x - bridge.position[0];
    const dz = wps[i].z - bridge.position[2];
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; bestIdx = i; }
  }
  const prev = wps[Math.max(0, bestIdx - 1)];
  const next = wps[Math.min(wps.length - 1, bestIdx + 1)];
  return Math.atan2(next.x - prev.x, next.z - prev.z);
}

const RailBridgeRenderer = memo(function RailBridgeRenderer({ bridge }: { bridge: RailwayBridge }) {
  const { rotation, py } = useMemo(() => {
    return {
      rotation: getTrackAngleAtBridge(bridge),
      py: bridge.position[1],
    };
  }, [bridge]);

  const [px, , pz] = bridge.position;
  const len = bridge.length;
  // v8 visual slim pass (Codex follow-up): no more bulky girder boxes in front
  // of the kingdom. Slimmer deck/rails, low parapet rails instead of huge box
  // girders + top chord, two end piers only (no middle pier or chunky caps).
  const gauge = 1.1;
  const deckW = 2.2;     // was 3.2
  const deckH = 0.18;    // was 0.25
  const parapetH = 0.7;  // was a 1.8u-tall iron girder + top chord
  const pierW = 1.1;     // was 2.0

  return (
    <group position={[px, py, pz]} rotation={[0, rotation, 0]}>
      {/* Slim timber deck on slim iron frame */}
      <mesh geometry={GEO.box} scale={[deckW, deckH, len]}
        position={[0, 1.0, 0]} material={deckMat} castShadow receiveShadow />

      {/* Rails on deck — match RailwayTrack RAIL_W/RAIL_H */}
      <mesh geometry={GEO.box} scale={[0.08, 0.10, len]}
        position={[gauge / 2, 1.0 + deckH / 2 + 0.08, 0]} material={railMat} castShadow />
      <mesh geometry={GEO.box} scale={[0.08, 0.10, len]}
        position={[-gauge / 2, 1.0 + deckH / 2 + 0.08, 0]} material={railMat} castShadow />

      {/* Low iron parapet rails (handrail look — not a tall girder wall) */}
      <mesh geometry={GEO.box} scale={[0.06, 0.06, len]}
        position={[-deckW / 2 - 0.04, 1.0 + parapetH, 0]} material={ironMat} castShadow />
      <mesh geometry={GEO.box} scale={[0.06, 0.06, len]}
        position={[deckW / 2 + 0.04, 1.0 + parapetH, 0]} material={ironMat} castShadow />

      {/* Slim balusters every 2u (vertical posts under the parapet) */}
      {Array.from({ length: Math.max(2, Math.floor(len / 2)) }, (_, i) => {
        const count = Math.max(2, Math.floor(len / 2));
        const zOff = -len / 2 + (i + 0.5) * (len / count);
        return (
          <group key={`bal-${i}`}>
            <mesh geometry={GEO.box} scale={[0.05, parapetH, 0.05]}
              position={[-deckW / 2 - 0.04, 1.0 + parapetH / 2 + deckH / 2, zOff]} material={ironDarkMat} />
            <mesh geometry={GEO.box} scale={[0.05, parapetH, 0.05]}
              position={[deckW / 2 + 0.04, 1.0 + parapetH / 2 + deckH / 2, zOff]} material={ironDarkMat} />
          </group>
        );
      })}

      {/* End piers only — no chunky middle pier or oversize caps */}
      {[-len / 2 + 0.6, len / 2 - 0.6].map((zOff, i) => {
        const pierH = Math.max(2.5, py + 3);
        return (
          <mesh key={`pier-${i}`} geometry={GEO.box}
            scale={[pierW, pierH, pierW * 0.9]}
            position={[0, -pierH / 2 + 1.0, zOff]}
            material={stonePierMat} castShadow />
        );
      })}
    </group>
  );
});

interface Props {
  playerPositionRef: React.RefObject<THREE.Vector3>;
}

export const RailwayBridges = memo(function RailwayBridges({ playerPositionRef }: Props) {
  const playerPos = playerPositionRef.current;
  return (
    <group name="railway-bridges">
      {RAILWAY_BRIDGES.map(bridge => {
        if (playerPos) {
          const dx = playerPos.x - bridge.position[0];
          const dz = playerPos.z - bridge.position[2];
          if (dx * dx + dz * dz > 250 * 250) return null;
        }
        return <RailBridgeRenderer key={bridge.id} bridge={bridge} />;
      })}
    </group>
  );
});
