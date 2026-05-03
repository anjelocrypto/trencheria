import { useRef, useCallback, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COLORS } from '../constants';
import { WorldResource } from '../systems/WorldResources';
import { buildResourceGrid, forEachNearbyResource } from '../world/ResourceSpatialGrid';

interface Props {
  resources: WorldResource[];
  playerPositionRef: React.RefObject<THREE.Vector3>;
  shakeResourceRef: React.MutableRefObject<string | null>;
  highlightedResourceRef: React.MutableRefObject<string | null>;
}

const trunkGeo = new THREE.CylinderGeometry(0.15, 0.25, 1, 5);
const coneGeo = new THREE.ConeGeometry(1, 1, 5);
const dodecGeo = new THREE.DodecahedronGeometry(1, 1);
const rockGeo = new THREE.DodecahedronGeometry(1, 0);
const sphereGeo = new THREE.SphereGeometry(1, 6, 6);
const boxGeo = new THREE.BoxGeometry(1, 1, 1);

const trunkMat = new THREE.MeshLambertMaterial({ color: COLORS.woodDark });
const leavesMat = new THREE.MeshLambertMaterial({ color: COLORS.leaves });
const leavesDarkMat = new THREE.MeshLambertMaterial({ color: COLORS.leavesDark });
const stoneMat = new THREE.MeshLambertMaterial({ color: COLORS.stone });
const stoneDarkMat = new THREE.MeshLambertMaterial({ color: COLORS.stoneDark });
const highlightMat = new THREE.MeshBasicMaterial({ color: '#ffcc44', transparent: true, opacity: 0.4 });
const highlightGeo = new THREE.RingGeometry(1.5, 1.8, 12);
const berryLeafMat = new THREE.MeshLambertMaterial({ color: '#2a6a20' });
const berryMat = new THREE.MeshLambertMaterial({ color: '#cc3344' });
const crateMat = new THREE.MeshLambertMaterial({ color: '#6b4f10' });
const crateBandMat = new THREE.MeshLambertMaterial({ color: '#4a3a20' });

// Worst-case render-cull radius (matches the original per-resource cullDist:
// 80 ungatherable trees, 100 ungatherable rocks/etc, 120 gatherable trees,
// 150 gatherable rocks/etc). The grid scan picks up everything within this
// radius; per-resource type-specific culling still happens in the render path.
const VISIBILITY_RADIUS = 150;

// Recompute the visible set when the player moves more than this OR when this
// many seconds elapse (whichever comes first). Keeps the React fiber tree
// proportional to nearby resources, not total resources, while avoiding a
// per-frame setState.
const RECOMPUTE_DISTANCE_SQ = 25; // 5 units
const RECOMPUTE_INTERVAL_S = 1.0;

export function WorldObjects({
  resources, playerPositionRef, shakeResourceRef, highlightedResourceRef,
}: Props) {
  const shakesRef = useRef<Map<string, { timer: number }>>(new Map());
  const groupRefs = useRef<Map<string, THREE.Group>>(new Map());

  // T011: bucketed resource grid. Rebuild only when the resources array
  // identity changes (world load or new batch), not every frame.
  const grid = useMemo(() => buildResourceGrid(resources), [resources]);

  // T011: only render resources within VISIBILITY_RADIUS of the player so
  // React fiber count is bounded by ~nearby resources rather than total
  // resources. The visible set updates when the player moves enough, never
  // every frame.
  //
  // PERF FIX: previously the initial visible set included EVERY non-depleted
  // resource (~900 trees/rocks/etc), which caused a multi-second startup
  // hitch as React mounted them all on the first frame before the first
  // useFrame tick narrowed it down. Now we initialise from
  // playerPositionRef if available, else start empty — the first useFrame
  // tick (~16ms later) will populate the nearby set.
  const [visible, setVisible] = useState<WorldResource[]>(() => {
    const pos = playerPositionRef.current;
    if (!pos) return [];
    const initialGrid = buildResourceGrid(resources);
    const out: WorldResource[] = [];
    forEachNearbyResource(initialGrid, pos.x, pos.z, VISIBILITY_RADIUS, (r) => {
      if (!r.depleted) out.push(r);
    });
    return out;
  });

  // Recompute the initial visible set whenever resources change identity.
  // Force refresh on next useFrame by invalidating the last sample point.
  const lastSampleRef = useRef<{ x: number; z: number; t: number; gridId: ResourceGrid | null }>({
    x: Number.NaN,
    z: Number.NaN,
    t: 0,
    gridId: null,
  });

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);

    // ---- shake update (existing behavior) ----
    const shakeId = shakeResourceRef.current;
    if (shakeId) {
      shakesRef.current.set(shakeId, { timer: 0.3 });
      shakeResourceRef.current = null;
    }
    shakesRef.current.forEach((state, id) => {
      state.timer -= dt;
      const group = groupRefs.current.get(id);
      if (group) {
        if (state.timer > 0) {
          group.rotation.z = Math.sin(Date.now() * 0.05) * 0.05 * state.timer * 10;
        } else {
          group.rotation.z = 0;
          shakesRef.current.delete(id);
        }
      }
    });

    // ---- T011: recompute visible set when player has moved enough ----
    const pos = playerPositionRef.current;
    if (!pos) return;

    const last = lastSampleRef.current;
    last.t += dt;

    const gridChanged = last.gridId !== grid;
    const movedSq = Number.isNaN(last.x)
      ? Infinity
      : (pos.x - last.x) * (pos.x - last.x) + (pos.z - last.z) * (pos.z - last.z);

    if (!gridChanged && movedSq < RECOMPUTE_DISTANCE_SQ && last.t < RECOMPUTE_INTERVAL_S) {
      return;
    }

    last.x = pos.x;
    last.z = pos.z;
    last.t = 0;
    last.gridId = grid;

    const next: WorldResource[] = [];
    forEachNearbyResource(grid, pos.x, pos.z, VISIBILITY_RADIUS, (r) => {
      if (!r.depleted) next.push(r);
    });
    setVisible(next);
  });

  const setRef = useCallback((id: string, el: THREE.Group | null) => {
    if (el) groupRefs.current.set(id, el);
    else groupRefs.current.delete(id);
  }, []);

  const playerPos = playerPositionRef.current;

  return (
    <group>
      {visible.map(res => {
        if (res.depleted) return null;
        if (playerPos) {
          const dx = playerPos.x - res.position[0];
          const dz = playerPos.z - res.position[2];
          const distSq = dx * dx + dz * dz;
          // Tighter type-specific culling within the broad visible set.
          const cullDist = res.type === 'tree' ? (res.gatherable ? 120 : 80) : (res.gatherable ? 150 : 100);
          if (distSq > cullDist * cullDist) return null;
        }

        const isHighlighted = highlightedResourceRef.current === res.id;

        if (res.type === 'tree') {
          const tH = res.trunkHeight * res.scale;
          const cR = res.crownRadius * (res.gatherable ? (res.health / res.maxHealth * 0.4 + 0.6) : 1);
          return (
            <group key={res.id} ref={el => setRef(res.id, el)} position={res.position} scale={res.scale}>
              <mesh position={[0, tH / 2, 0]} castShadow geometry={trunkGeo} scale={[1, tH, 1]} material={trunkMat} />
              {res.variant === 1 ? (
                <>
                  <mesh position={[0, tH + 1.5, 0]} castShadow geometry={coneGeo} scale={[cR, 3, cR]} material={leavesDarkMat} />
                  <mesh position={[0, tH + 2.6, 0]} castShadow geometry={coneGeo} scale={[cR * 0.7, 2.2, cR * 0.7]} material={leavesMat} />
                </>
              ) : (
                <mesh position={[0, tH + cR * 0.6, 0]} castShadow geometry={dodecGeo} scale={[cR, cR, cR]} material={leavesMat} />
              )}
              {isHighlighted && (
                <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={highlightGeo} material={highlightMat} />
              )}
            </group>
          );
        }

        if (res.type === 'berry_bush') {
          return (
            <group key={res.id} ref={el => setRef(res.id, el)} position={res.position} scale={res.scale}>
              <mesh position={[0, 0.4, 0]} castShadow geometry={dodecGeo} scale={[0.8, 0.6, 0.8]} material={berryLeafMat} />
              {res.health > 0 && [[-0.3, 0.5, 0.2], [0.2, 0.45, -0.25], [0.1, 0.55, 0.3], [-0.15, 0.35, -0.2]].map(([bx, by, bz], i) => (
                <mesh key={i} position={[bx, by, bz]} geometry={sphereGeo} scale={[0.06, 0.06, 0.06]} material={berryMat} />
              ))}
              {isHighlighted && (
                <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={highlightGeo} material={highlightMat} />
              )}
            </group>
          );
        }

        if (res.type === 'crate') {
          return (
            <group key={res.id} ref={el => setRef(res.id, el)} position={res.position} scale={res.scale}>
              <mesh position={[0, 0.4, 0]} castShadow geometry={boxGeo} scale={[0.7, 0.7, 0.7]} material={crateMat} />
              <mesh position={[0, 0.4, 0]} castShadow geometry={boxGeo} scale={[0.75, 0.1, 0.75]} material={crateBandMat} />
              {isHighlighted && (
                <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={highlightGeo} material={highlightMat} />
              )}
            </group>
          );
        }

        // Rock
        const rockScale = res.scale * (res.gatherable ? (res.health / res.maxHealth * 0.4 + 0.6) : 1);
        return (
          <group key={res.id} ref={el => setRef(res.id, el)} position={res.position} scale={rockScale}>
            <mesh castShadow geometry={rockGeo} material={res.variant === 0 ? stoneMat : stoneDarkMat} />
            {isHighlighted && (
              <mesh position={[0, -0.3, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={highlightGeo} material={highlightMat} />
            )}
          </group>
        );
      })}
    </group>
  );
}

type ResourceGrid = ReturnType<typeof buildResourceGrid>;
