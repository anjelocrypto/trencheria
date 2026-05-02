/**
 * Train — Deterministic clock-based trains on Lines A and B.
 * Uses lightweight Float32Array path, zero per-frame allocations.
 */
import { useRef, useMemo, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { LINE_A_WAYPOINTS, LINE_B_WAYPOINTS, RAILWAY_STATIONS } from '../world/RailwayData';
import { buildRailwayPath, samplePathAtDistance, findStationDistance } from '../systems/RailwaySpline';
import { GEO } from '../world/SettlementPieces';

const TRAIN_SPEED = 20;
const STATION_STOP_TIME = 60;

const boilerMat = new THREE.MeshLambertMaterial({ color: '#3a3030' });
const cabMat = new THREE.MeshLambertMaterial({ color: '#4a3020' });
const chimneyMat = new THREE.MeshLambertMaterial({ color: '#1a1a1a' });
const wheelMat = new THREE.MeshLambertMaterial({ color: '#222222' });
const detailMat = new THREE.MeshLambertMaterial({ color: '#8a7a3a' });
const bodyMat = new THREE.MeshLambertMaterial({ color: '#2a2a2a' });
const carBodyMat = new THREE.MeshLambertMaterial({ color: '#3a2818' });
const carRoofMat = new THREE.MeshLambertMaterial({ color: '#2a1a0a' });
const windowMat = new THREE.MeshLambertMaterial({ color: '#aaccdd', emissive: '#334455', emissiveIntensity: 0.2 });

interface TrainConfig {
  points: Float32Array;
  count: number;
  totalLength: number;
  stationDistances: number[];
  cycleLength: number;
}

function buildConfig(wps: typeof LINE_A_WAYPOINTS, lineId: 'A' | 'B'): TrainConfig {
  const { points, count, totalLength } = buildRailwayPath(wps, 4);
  const lineStations = RAILWAY_STATIONS.filter(s => s.line === lineId || s.line === 'AB');
  const stationDistances = lineStations
    .map(s => findStationDistance(points, count, s.position[0], s.position[1]))
    .sort((a, b) => a - b);
  const travelTime = totalLength / TRAIN_SPEED;
  const stopsTime = stationDistances.length * STATION_STOP_TIME;
  const cycleLength = (travelTime + stopsTime) * 2;
  return { points, count, totalLength, stationDistances, cycleLength };
}

function getTrainDist(cfg: TrainConfig, time: number): { distance: number; direction: 1 | -1 } {
  const halfCycle = cfg.cycleLength / 2;
  const cycleTime = ((time % cfg.cycleLength) + cfg.cycleLength) % cfg.cycleLength;
  const isReverse = cycleTime >= halfCycle;
  let elapsed = isReverse ? cycleTime - halfCycle : cycleTime;
  let dist = 0;
  const stations = isReverse
    ? [...cfg.stationDistances].reverse().map(d => cfg.totalLength - d)
    : [...cfg.stationDistances];
  let si = 0;

  while (elapsed > 0 && dist < cfg.totalLength) {
    if (si < stations.length) {
      const toStn = stations[si] - dist;
      if (toStn <= 0) { si++; continue; }
      const travelT = toStn / TRAIN_SPEED;
      if (elapsed < travelT) { dist += elapsed * TRAIN_SPEED; elapsed = 0; }
      else { elapsed -= travelT; dist = stations[si]; if (elapsed < STATION_STOP_TIME) { elapsed = 0; } else { elapsed -= STATION_STOP_TIME; si++; } }
    } else { dist += elapsed * TRAIN_SPEED; elapsed = 0; }
  }
  dist = Math.min(dist, cfg.totalLength);
  const finalDist = isReverse ? cfg.totalLength - dist : dist;
  return { distance: Math.max(0, Math.min(finalDist, cfg.totalLength - 0.01)), direction: isReverse ? -1 : 1 };
}

function Locomotive() {
  return (
    <group>
      <mesh geometry={GEO.cyl8} scale={[0.7, 3.5, 0.7]} position={[0, 1.2, 1.0]} rotation={[Math.PI / 2, 0, 0]} material={boilerMat} castShadow />
      <mesh geometry={GEO.box} scale={[1.8, 1.8, 2.0]} position={[0, 1.4, -1.2]} material={cabMat} castShadow />
      <mesh geometry={GEO.box} scale={[2.0, 0.12, 2.2]} position={[0, 2.35, -1.2]} material={carRoofMat} castShadow />
      <mesh geometry={GEO.cyl8} scale={[0.3, 1.0, 0.3]} position={[0, 2.0, 2.2]} material={chimneyMat} castShadow />
      <mesh geometry={GEO.box} scale={[1.6, 0.3, 0.6]} position={[0, 0.3, 3.0]} material={bodyMat} castShadow />
      <mesh geometry={GEO.sphere8} scale={[0.35, 0.35, 0.35]} position={[0, 2.0, 0.5]} material={detailMat} />
      <mesh geometry={GEO.sphere8} scale={[0.15, 0.15, 0.15]} position={[0, 1.8, 3.0]} material={detailMat} />
      <mesh geometry={GEO.box} scale={[1.6, 0.15, 6.0]} position={[0, 0.15, 0.5]} material={bodyMat} />
    </group>
  );
}

function PassengerCar({ offset }: { offset: number }) {
  return (
    <group position={[0, 0, offset]}>
      <mesh geometry={GEO.box} scale={[1.8, 1.5, 5.0]} position={[0, 1.1, 0]} material={carBodyMat} castShadow />
      <mesh geometry={GEO.box} scale={[2.0, 0.15, 5.2]} position={[0, 1.9, 0]} material={carRoofMat} castShadow />
      {[-1.5, 0.5].map((zOff, i) => (
        <group key={i}>
          <mesh geometry={GEO.box} scale={[0.02, 0.5, 0.6]} position={[0.91, 1.3, zOff]} material={windowMat} />
          <mesh geometry={GEO.box} scale={[0.02, 0.5, 0.6]} position={[-0.91, 1.3, zOff]} material={windowMat} />
        </group>
      ))}
      <mesh geometry={GEO.box} scale={[1.4, 0.12, 5.0]} position={[0, 0.12, 0]} material={bodyMat} />
    </group>
  );
}

const _pos = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _look = new THREE.Vector3();

const TrainOnLine = memo(function TrainOnLine({ lineId, config }: { lineId: string; config: TrainConfig }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!groupRef.current) return;
    const { distance, direction } = getTrainDist(config, Date.now() / 1000);
    samplePathAtDistance(config.points, config.count, config.totalLength, distance, _pos, _tan);
    if (direction === -1) _tan.negate();
    groupRef.current.position.copy(_pos);
    _look.copy(_pos).add(_tan);
    groupRef.current.lookAt(_look);
  });

  return (
    <group ref={groupRef} name={`train-${lineId}`}>
      <Locomotive />
      <PassengerCar offset={-4.5} />
      <PassengerCar offset={-10} />
    </group>
  );
});

export const Train = memo(function Train() {
  const cfgA = useMemo(() => buildConfig(LINE_A_WAYPOINTS, 'A'), []);
  const cfgB = useMemo(() => buildConfig(LINE_B_WAYPOINTS, 'B'), []);
  return (
    <group name="trains">
      <TrainOnLine lineId="A" config={cfgA} />
      <TrainOnLine lineId="B" config={cfgB} />
    </group>
  );
});
