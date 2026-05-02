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
  const gauge = 1.2;
  const deckW = 3.2;
  const girderH = 1.8;
  const pierW = 2.0;

  return (
    <group position={[px, py, pz]} rotation={[0, rotation, 0]}>
      {/* Deck — timber planks on iron frame */}
      <mesh geometry={GEO.box} scale={[deckW, 0.25, len]}
        position={[0, 1.0, 0]} material={deckMat} castShadow receiveShadow />

      {/* Rails on deck */}
      <mesh geometry={GEO.box} scale={[0.12, 0.15, len]}
        position={[gauge / 2, 1.2, 0]} material={railMat} castShadow />
      <mesh geometry={GEO.box} scale={[0.12, 0.15, len]}
        position={[-gauge / 2, 1.2, 0]} material={railMat} castShadow />

      {/* Iron girders — left and right */}
      <mesh geometry={GEO.box} scale={[0.2, girderH, len]}
        position={[-deckW / 2, 1.0 + girderH / 2, 0]} material={ironMat} castShadow />
      <mesh geometry={GEO.box} scale={[0.2, girderH, len]}
        position={[deckW / 2, 1.0 + girderH / 2, 0]} material={ironMat} castShadow />

      {/* Top chord */}
      <mesh geometry={GEO.box} scale={[deckW + 0.2, 0.15, len]}
        position={[0, 1.0 + girderH, 0]} material={ironDarkMat} castShadow />

      {/* Cross bracing (X pattern) — simplified as diagonal bars */}
      {Array.from({ length: Math.floor(len / 4) }, (_, i) => {
        const zOff = -len / 2 + 2 + i * 4;
        return (
          <group key={i}>
            {/* Vertical strut */}
            <mesh geometry={GEO.box} scale={[0.1, girderH, 0.1]}
              position={[-deckW / 2 + 0.1, 1.0 + girderH / 2, zOff]} material={ironDarkMat} />
            <mesh geometry={GEO.box} scale={[0.1, girderH, 0.1]}
              position={[deckW / 2 - 0.1, 1.0 + girderH / 2, zOff]} material={ironDarkMat} />
            {/* Cross beam under deck */}
            <mesh geometry={GEO.box} scale={[deckW, 0.12, 0.12]}
              position={[0, 0.88, zOff]} material={ironMat} />
          </group>
        );
      })}

      {/* Stone piers — at each end and center */}
      {[-len / 2 + 1, 0, len / 2 - 1].map((zOff, i) => {
        const pierH = Math.max(3, py + 3);
        return (
          <mesh key={`pier-${i}`} geometry={GEO.box}
            scale={[pierW, pierH, pierW]}
            position={[0, -pierH / 2 + 1.0, zOff]}
            material={stonePierMat} castShadow />
        );
      })}

      {/* Pier caps */}
      {[-len / 2 + 1, 0, len / 2 - 1].map((zOff, i) => (
        <mesh key={`cap-${i}`} geometry={GEO.box}
          scale={[pierW + 0.4, 0.3, pierW + 0.4]}
          position={[0, 0.85, zOff]}
          material={stonePierMat} castShadow />
      ))}
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
