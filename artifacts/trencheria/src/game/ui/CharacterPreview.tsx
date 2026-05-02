import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

import goblinStandingUrl from '@/assets/goblinstanding.glb?url';
import soldierStandingUrl from '@/assets/standing.glb?url';
import octopusStandingUrl from '@/assets/octopusstanding.glb?url';
import nemoStandingUrl from '@/assets/nemostanding.glb?url';
import chillhouseStandingUrl from '@/assets/chillhousestanding.glb?url';
import {
  buildModelNormalization,
  cloneScene,
  enableMeshShadows,
  sanitizeClips,
} from '../multiplayer/remoteModelUtils';

interface CharacterPreviewProps {
  characterType: string;
  selected: boolean;
}

const STANDING_URLS: Record<string, string> = {
  goblin: goblinStandingUrl,
  soldier: soldierStandingUrl,
  octopus: octopusStandingUrl,
  nemoclaw: nemoStandingUrl,
  chillhouse: chillhouseStandingUrl,
};

const PREVIEW_HEIGHT = 1.85;

function StandingModel({ url, selected }: { url: string; selected: boolean }) {
  const gltf = useGLTF(url);
  const rootRef = useRef<THREE.Group>(null);
  const spinRef = useRef<THREE.Group>(null);

  const scene = useMemo(() => cloneScene(gltf.scene), [gltf.scene]);
  const clips = useMemo(() => sanitizeClips(gltf.animations), [gltf.animations]);
  const { actions } = useAnimations(clips, rootRef);

  const norm = useMemo(() => {
    return buildModelNormalization(scene, PREVIEW_HEIGHT, 0, 1, [0, 0, 0]);
  }, [scene]);

  useEffect(() => {
    enableMeshShadows(scene);
  }, [scene]);

  useEffect(() => {
    const name = Object.keys(actions)[0];
    if (!name || !actions[name]) return;

    const action = actions[name]!;
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.enabled = true;
    action.play();

    return () => {
      action.stop();
    };
  }, [actions]);

  // No spinning — all characters face camera statically

  return (
    <group ref={spinRef}>
      <group ref={rootRef} rotation={[0, norm.yawCorrection, 0]}>
        <group scale={[norm.scale, norm.scale, norm.scale]}>
          <group position={norm.modelAnchorOffset}>
            <group position={[0, -0.02, 0]}>
              <primitive object={scene} dispose={null} />
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

export function CharacterPreview({ characterType, selected }: CharacterPreviewProps) {
  const url = STANDING_URLS[characterType];
  if (!url) return null;

  return (
    <div style={{ width: '100%', height: 170, position: 'relative' }}>
      <Canvas
        frameloop="demand"
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0.45, 3.8], fov: 30 }}
        style={{ background: 'transparent' }}
        dpr={[1, 1]}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[2.4, 4, 2]} intensity={1.1} />
        <directionalLight position={[-2, 2, -2]} intensity={0.35} />

        <group position={[0, -0.85, 0]}>
          <StandingModel url={url} selected={selected} />
        </group>
      </Canvas>
    </div>
  );
}
