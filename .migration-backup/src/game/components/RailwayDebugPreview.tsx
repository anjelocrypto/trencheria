/**
 * Railway Debug Preview — renders route splines, station markers, and bridge markers
 * as colored wireframe/debug geometry for visual validation before final build.
 * Toggle with 'R' key.
 */
import { useMemo, useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import {
  LINE_A_WAYPOINTS,
  LINE_B_WAYPOINTS,
  RAILWAY_STATIONS,
  RAILWAY_BRIDGES,
  RailwayWaypoint,
} from '../world/RailwayData';
import { getTerrainHeight } from './Terrain';

// Materials
const matLineA = new THREE.LineBasicMaterial({ color: '#ff4444', linewidth: 2 });
const matLineB = new THREE.LineBasicMaterial({ color: '#4488ff', linewidth: 2 });
const matStation = new THREE.MeshBasicMaterial({ color: '#ffcc00', wireframe: true, transparent: true, opacity: 0.7 });
const matStationCapital = new THREE.MeshBasicMaterial({ color: '#ffaa00', wireframe: true, transparent: true, opacity: 0.8 });
const matBridge = new THREE.MeshBasicMaterial({ color: '#00ffcc', wireframe: true, transparent: true, opacity: 0.7 });
const matPlatform = new THREE.MeshBasicMaterial({ color: '#ccaa44', transparent: true, opacity: 0.4 });
const matWaypoint = new THREE.MeshBasicMaterial({ color: '#ff8888', wireframe: true, transparent: true, opacity: 0.5 });
const matWaypointB = new THREE.MeshBasicMaterial({ color: '#88aaff', wireframe: true, transparent: true, opacity: 0.5 });

// Shared geometry
const pillarGeo = new THREE.CylinderGeometry(0.4, 0.4, 8, 6);
const stationGeo = new THREE.CylinderGeometry(1.5, 1.5, 10, 8);
const capitalGeo = new THREE.CylinderGeometry(2.5, 2.5, 12, 8);
const bridgeGeo = new THREE.BoxGeometry(6, 1, 24);
const platformGeo = new THREE.BoxGeometry(12, 0.4, 6);
const waypointGeo = new THREE.CylinderGeometry(0.3, 0.3, 4, 6);

function buildLineGeometry(waypoints: RailwayWaypoint[]): THREE.BufferGeometry {
  // Create a smooth-ish polyline at terrain height + small offset
  const points: THREE.Vector3[] = [];
  for (const wp of waypoints) {
    const y = getTerrainHeight(wp.x, wp.z) + 1.5;
    points.push(new THREE.Vector3(wp.x, y, wp.z));
  }
  // Subdivide between waypoints for smoother terrain following
  const subdivided: THREE.Vector3[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dist = a.distanceTo(b);
    const steps = Math.max(1, Math.floor(dist / 8));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const y = getTerrainHeight(x, z) + 1.5;
      subdivided.push(new THREE.Vector3(x, y, z));
    }
  }
  const geo = new THREE.BufferGeometry().setFromPoints(subdivided);
  return geo;
}

function StationMarker({ station }: { station: typeof RAILWAY_STATIONS[0] }) {
  const [sx, sz] = station.position;
  const y = getTerrainHeight(sx, sz);
  const isCapital = station.stationType === 'capital';
  
  return (
    <group position={[sx, y, sz]}>
      {/* Pillar marker */}
      <mesh geometry={isCapital ? capitalGeo : stationGeo}
        material={isCapital ? matStationCapital : matStation}
        position={[0, isCapital ? 6 : 5, 0]} />
      {/* Platform placeholder */}
      <mesh geometry={platformGeo} material={matPlatform}
        position={[0, 0.2, 0]}
        scale={isCapital ? [1.5, 1, 1.5] : [1, 1, 1]} />
      {/* Label */}
      <Html position={[0, isCapital ? 14 : 12, 0]} center
        style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <div style={{
          background: 'rgba(0,0,0,0.85)',
          color: isCapital ? '#ffaa00' : '#ffcc00',
          padding: '3px 8px',
          borderRadius: 4,
          fontSize: 11,
          fontFamily: 'monospace',
          fontWeight: 'bold',
          whiteSpace: 'nowrap',
          border: `1px solid ${isCapital ? '#ffaa00' : '#ffcc0066'}`,
        }}>
          🚉 {station.name}
          <span style={{ color: '#999', fontSize: 9, marginLeft: 4 }}>
            [{sx}, {sz}] {station.side}
          </span>
        </div>
      </Html>
    </group>
  );
}

function BridgeMarker({ bridge }: { bridge: typeof RAILWAY_BRIDGES[0] }) {
  const [bx, by, bz] = bridge.position;
  const y = Math.max(by, getTerrainHeight(bx, bz)) + 0.5;

  return (
    <group position={[bx, y, bz]}>
      <mesh geometry={bridgeGeo} material={matBridge}
        scale={[bridge.length / 24, 1, 1]} />
      <Html position={[0, 6, 0]} center
        style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <div style={{
          background: 'rgba(0,0,0,0.85)',
          color: '#00ffcc',
          padding: '3px 8px',
          borderRadius: 4,
          fontSize: 11,
          fontFamily: 'monospace',
          fontWeight: 'bold',
          whiteSpace: 'nowrap',
          border: '1px solid #00ffcc66',
        }}>
          🌉 {bridge.crosses}
          <span style={{ color: '#999', fontSize: 9, marginLeft: 4 }}>
            Line {bridge.line} [{bx}, {bz}]
          </span>
        </div>
      </Html>
    </group>
  );
}

function WaypointMarkers({ waypoints, mat }: { waypoints: RailwayWaypoint[]; mat: THREE.Material }) {
  return (
    <>
      {waypoints.filter(wp => wp.type === 'track').map((wp, i) => {
        const y = getTerrainHeight(wp.x, wp.z) + 2;
        return (
          <mesh key={i} position={[wp.x, y, wp.z]} geometry={waypointGeo} material={mat} />
        );
      })}
    </>
  );
}

export function RailwayDebugPreview() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Don't toggle if typing in an input
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        setEnabled(v => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const lineAGeo = useMemo(() => enabled ? buildLineGeometry(LINE_A_WAYPOINTS) : null, [enabled]);
  const lineBGeo = useMemo(() => enabled ? buildLineGeometry(LINE_B_WAYPOINTS) : null, [enabled]);
  const lineAObj = useMemo(() => lineAGeo ? new THREE.Line(lineAGeo, matLineA) : null, [lineAGeo]);
  const lineBObj = useMemo(() => lineBGeo ? new THREE.Line(lineBGeo, matLineB) : null, [lineBGeo]);

  if (!enabled) return null;

  return (
    <group>
      {/* Route lines */}
      {lineAObj && <primitive object={lineAObj} />}
      {lineBObj && <primitive object={lineBObj} />}

      {/* Waypoint markers */}
      <WaypointMarkers waypoints={LINE_A_WAYPOINTS} mat={matWaypoint} />
      <WaypointMarkers waypoints={LINE_B_WAYPOINTS} mat={matWaypointB} />

      {/* Station markers */}
      {RAILWAY_STATIONS.map(s => <StationMarker key={s.id} station={s} />)}

      {/* Bridge markers */}
      {RAILWAY_BRIDGES.map(b => <BridgeMarker key={b.id} bridge={b} />)}
    </group>
  );
}
