/**
 * OctopusEmotes — Lazy-loaded emote sub-component for Octopus character.
 * Only mounts when the player first triggers an emote, deferring ~6.5MB of GLB downloads.
 */
import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import octopusDanceUrl from '@/assets/octopusdance.glb?url';

const ROOT_RE = /(hips|pelvis|root|armature)/i;

function sanitizeClips(anims: THREE.AnimationClip[]) {
  return anims.map(clip => {
    const c = clip.clone();
    c.tracks = c.tracks.filter(t => !t.name.endsWith('.position') || !ROOT_RE.test(t.name.slice(0, t.name.lastIndexOf('.'))));
    return c;
  });
}

function getClipName(clips: THREE.AnimationClip[], hint?: RegExp) {
  if (!clips.length) return null;
  if (hint) { const f = clips.find(c => hint.test(c.name)); if (f) return f.name; }
  return clips[0].name;
}

function inspectScene(scene: THREE.Object3D) {
  scene.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(scene);
  const s = new THREE.Vector3(); b.getSize(s);
  const c = new THREE.Vector3(); b.getCenter(c);
  return { anchor: new THREE.Vector3(c.x, 0, c.z), footY: b.min.y, height: s.y > 0.001 ? s.y : 1 };
}

function buildNorm(i: ReturnType<typeof inspectScene>, ch: number, yaw: number, chh: number) {
  const scale = i.height > 0.01 ? ch / i.height : 1;
  return { offset: [-i.anchor.x, -i.footY, -i.anchor.z] as [number, number, number], scale, yaw, ground: -chh };
}

interface Props {
  activeEmote: string | null;
  activeEmoteId?: number;
  stateRef: React.MutableRefObject<string>;
  onEmoteEnd: () => void;
  parentHideLocomotion: () => void;
  controllerHalfHeight: number;
  canonicalHeight: number;
  canonicalYawCorrection: number;
}

export function OctopusEmotes({ activeEmote, activeEmoteId, stateRef, onEmoteEnd, parentHideLocomotion, controllerHalfHeight, canonicalHeight, canonicalYawCorrection }: Props) {
  const danceGltf = useGLTF(octopusDanceUrl);
  const danceRef = useRef<THREE.Group>(null);
  const lastIdRef = useRef(0);

  const dClips = useMemo(() => sanitizeClips(danceGltf.animations), [danceGltf.animations]);
  const dInsp = useMemo(() => inspectScene(danceGltf.scene), [danceGltf.scene]);
  const dNorm = useMemo(() => buildNorm(dInsp, canonicalHeight, canonicalYawCorrection, controllerHalfHeight), [dInsp, canonicalHeight, canonicalYawCorrection, controllerHalfHeight]);

  const { actions: dActs, clips: dC } = useAnimations(dClips, danceGltf.scene);
  const dName = useMemo(() => getClipName(dC, /dance/i), [dC]);

  useEffect(() => {
    danceGltf.scene.traverse(c => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  }, [danceGltf.scene]);

  useEffect(() => { if (danceRef.current) danceRef.current.visible = false; }, []);

  useFrame(() => {
    const st = stateRef.current;
    if (!st.startsWith('emote_')) { if (danceRef.current) danceRef.current.visible = false; return; }

    const eid = activeEmoteId ?? 0;
    if (activeEmote === 'octopusdance' && eid !== lastIdRef.current) {
      lastIdRef.current = eid;
      stateRef.current = 'emote_dance';
      parentHideLocomotion();
      if (danceRef.current) danceRef.current.visible = true;
      if (dName) { const a = dActs[dName]; if (a) { a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.enabled = true; a.play(); a.paused = false; } }
      return;
    }

    if (st === 'emote_dance' && dName) {
      const a = dActs[dName];
      if (a && a.time >= a.getClip().duration - 0.05) { a.paused = true; if (danceRef.current) danceRef.current.visible = false; onEmoteEnd(); }
    }
  });

  const n = dNorm;
  return (
    <group ref={danceRef}>
      <group rotation={[0, n.yaw, 0]}>
        <group position={[0, n.ground, 0]}>
          <group scale={[n.scale, n.scale, n.scale]}>
            <group position={n.offset}>
              <primitive object={danceGltf.scene} />
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
