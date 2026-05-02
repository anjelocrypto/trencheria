/**
 * LevelCrossings — planked grade-crossings where roads cross railways.
 *
 * Renders a low timber deck across the track plus two St. Andrew's cross
 * warning signs facing the road approaches. The deck is oriented along the
 * track so its width spans the road. Visual only — collision and walking
 * heights are inherited from the underlying terrain via railway flattening.
 */
import { memo, useMemo } from 'react';
import * as THREE from 'three';
import { LEVEL_CROSSINGS } from '../world/RailwayData';
import { getRailGroundHeight } from '../systems/Grounding';

const plankMat = new THREE.MeshLambertMaterial({ color: '#6a4a2a' });
const postMat = new THREE.MeshLambertMaterial({ color: '#3a3530' });
const signMat = new THREE.MeshLambertMaterial({ color: '#e8e8e8' });
const signEdgeMat = new THREE.MeshLambertMaterial({ color: '#a02020' });

// Deck width spans the road; deck length along track is driven per-crossing
// by `lc.size` (half-length along track). Width 7 covers all current roads
// (≤3.5w). Geometries are cached per unique deck length to avoid leaking a
// new BoxGeometry on every render.
const DECK_WIDTH = 7;
const deckGeoCache = new Map<number, THREE.BoxGeometry>();
function getDeckGeo(deckLength: number): THREE.BoxGeometry {
  let g = deckGeoCache.get(deckLength);
  if (!g) {
    g = new THREE.BoxGeometry(DECK_WIDTH, 0.12, deckLength);
    deckGeoCache.set(deckLength, g);
  }
  return g;
}
// Slim warning post + diagonal sign beams forming an X cross.
const postGeo = new THREE.BoxGeometry(0.18, 2.4, 0.18);
const signBeamGeo = new THREE.BoxGeometry(1.6, 0.18, 0.04);
const signEdgeGeo = new THREE.BoxGeometry(1.7, 0.04, 0.06);

// Posts sit just outside the deck width so signs face the road approaches.
const POST_OFFSET = DECK_WIDTH / 2 + 0.5;

export const LevelCrossings = memo(function LevelCrossings() {
  const items = useMemo(() => {
    return LEVEL_CROSSINGS.map((lc) => {
      const [x, z] = lc.position;
      const y = getRailGroundHeight(x, z);
      const deckLength = Math.max(2, lc.size * 2);
      return { id: lc.id, x, y, z, angle: lc.trackAngle, deckGeo: getDeckGeo(deckLength) };
    });
  }, []);

  return (
    <group>
      {items.map((c) => (
        <group key={c.id} position={[c.x, c.y, c.z]} rotation={[0, c.angle, 0]}>
          {/* Planked deck — local X = perpendicular to track (≈ road direction) */}
          <mesh
            geometry={c.deckGeo}
            material={plankMat}
            position={[0, 0.08, 0]}
            castShadow={false}
            receiveShadow
          />
          {/* Two warning posts, one on each side of the track. The inner
              group is rotated 90° around Y so the X-sign faces the road. */}
          {[-1, 1].map((side) => (
            <group key={side} position={[side * POST_OFFSET, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
              <mesh geometry={postGeo} material={postMat} position={[0, 1.2, 0]} castShadow />
              <mesh
                geometry={signBeamGeo}
                material={signMat}
                position={[0, 2.0, 0]}
                rotation={[0, 0, Math.PI / 4]}
              />
              <mesh
                geometry={signBeamGeo}
                material={signMat}
                position={[0, 2.0, 0]}
                rotation={[0, 0, -Math.PI / 4]}
              />
              {/* Red edge highlights (St. Andrew's cross styling) */}
              <mesh
                geometry={signEdgeGeo}
                material={signEdgeMat}
                position={[0, 2.0, 0.03]}
                rotation={[0, 0, Math.PI / 4]}
              />
              <mesh
                geometry={signEdgeGeo}
                material={signEdgeMat}
                position={[0, 2.0, 0.03]}
                rotation={[0, 0, -Math.PI / 4]}
              />
            </group>
          ))}
        </group>
      ))}
    </group>
  );
});
