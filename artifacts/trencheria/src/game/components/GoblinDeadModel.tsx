import { useEffect, useMemo, useRef } from 'react';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import goblinDeadUrl from '@/assets/goblindead.glb?url';

const ROOT_TRANSLATION_NAME_RE = /(hips|pelvis|root|armature)/i;

function sanitizeClips(animations: THREE.AnimationClip[]): THREE.AnimationClip[] {
  return animations.map((clip) => {
    const clonedClip = clip.clone();
    clonedClip.tracks = clonedClip.tracks.filter((track) => {
      if (!track.name.endsWith('.position')) return true;
      const target = track.name.slice(0, track.name.lastIndexOf('.'));
      return !ROOT_TRANSLATION_NAME_RE.test(target);
    });
    return clonedClip;
  });
}

export function GoblinDeadModel() {
  const gltf = useGLTF(goblinDeadUrl);
  const groupRef = useRef<THREE.Group>(null);

  const sanitizedClips = useMemo(() => sanitizeClips(gltf.animations), [gltf.animations]);
  const { actions } = useAnimations(sanitizedClips, gltf.scene);

  useEffect(() => {
    gltf.scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [gltf.scene]);

  useEffect(() => {
    const clipNames = Object.keys(actions);
    if (clipNames.length === 0) return;
    const action = actions[clipNames[0]];
    if (!action) return;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.enabled = true;
    action.play();
    return () => { action.stop(); };
  }, [actions]);

  return (
    <group ref={groupRef} position={[0, -0.5, 0]}>
      <primitive object={gltf.scene} />
    </group>
  );
}


