/**
 * NemoClawEmotes — Lazy-loaded emote sub-component for NemoClaw character.
 * Only mounts when the player first triggers an emote, deferring ~13MB of GLB downloads.
 */
import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import nemoDance1Url from '@/assets/nemodance1.glb?url';
import nemoDance2Url from '@/assets/nemodance2.glb?url';

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

export function NemoClawEmotes({ activeEmote, activeEmoteId, stateRef, onEmoteEnd, parentHideLocomotion, controllerHalfHeight, canonicalHeight, canonicalYawCorrection }: Props) {
  const d1Gltf = useGLTF(nemoDance1Url);
  const d2Gltf = useGLTF(nemoDance2Url);

  const d1Ref = useRef<THREE.Group>(null);
  const d2Ref = useRef<THREE.Group>(null);
  const lastIdRef = useRef(0);

  const d1Clips = useMemo(() => sanitizeClips(d1Gltf.animations), [d1Gltf.animations]);
  const d2Clips = useMemo(() => sanitizeClips(d2Gltf.animations), [d2Gltf.animations]);

  const d1Insp = useMemo(() => inspectScene(d1Gltf.scene), [d1Gltf.scene]);
  const d2Insp = useMemo(() => inspectScene(d2Gltf.scene), [d2Gltf.scene]);

  const d1Norm = useMemo(() => buildNorm(d1Insp, canonicalHeight, canonicalYawCorrection, controllerHalfHeight), [d1Insp, canonicalHeight, canonicalYawCorrection, controllerHalfHeight]);
  const d2Norm = useMemo(() => buildNorm(d2Insp, canonicalHeight, canonicalYawCorrection, controllerHalfHeight), [d2Insp, canonicalHeight, canonicalYawCorrection, controllerHalfHeight]);

  const { actions: d1Acts, clips: d1C } = useAnimations(d1Clips, d1Gltf.scene);
  const d1Name = useMemo(() => getClipName(d1C, /dance/i), [d1C]);

  const { actions: d2Acts, clips: d2C } = useAnimations(d2Clips, d2Gltf.scene);
  const d2Name = useMemo(() => getClipName(d2C, /dance/i), [d2C]);

  useEffect(() => {
    [d1Gltf.scene, d2Gltf.scene].forEach(s => s.traverse(c => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } }));
  }, [d1Gltf.scene, d2Gltf.scene]);

  useEffect(() => {
    if (d1Ref.current) d1Ref.current.visible = false;
    if (d2Ref.current) d2Ref.current.visible = false;
  }, []);

  const hideAll = useCallback(() => {
    if (d1Ref.current) d1Ref.current.visible = false;
    if (d2Ref.current) d2Ref.current.visible = false;
  }, []);

  useFrame(() => {
    const st = stateRef.current;
    if (!st.startsWith('emote_')) { hideAll(); return; }

    const eid = activeEmoteId ?? 0;

    if (activeEmote === 'nemodance1' && eid !== lastIdRef.current) {
      lastIdRef.current = eid;
      stateRef.current = 'emote_dance1';
      parentHideLocomotion();
      if (d1Ref.current) d1Ref.current.visible = true;
      if (d2Ref.current) d2Ref.current.visible = false;
      if (d1Name) { const a = d1Acts[d1Name]; if (a) { a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.enabled = true; a.play(); a.paused = false; } }
      return;
    }

    if (activeEmote === 'nemodance2' && eid !== lastIdRef.current) {
      lastIdRef.current = eid;
      stateRef.current = 'emote_dance2';
      parentHideLocomotion();
      if (d2Ref.current) d2Ref.current.visible = true;
      if (d1Ref.current) d1Ref.current.visible = false;
      if (d2Name) { const a = d2Acts[d2Name]; if (a) { a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.enabled = true; a.play(); a.paused = false; } }
      return;
    }

    if (st === 'emote_dance1' && d1Name) {
      const a = d1Acts[d1Name];
      if (a && a.time >= a.getClip().duration - 0.05) { a.paused = true; hideAll(); onEmoteEnd(); }
      return;
    }
    if (st === 'emote_dance2' && d2Name) {
      const a = d2Acts[d2Name];
      if (a && a.time >= a.getClip().duration - 0.05) { a.paused = true; hideAll(); onEmoteEnd(); }
      return;
    }
  });

  const rm = (ref: React.RefObject<THREE.Group | null>, n: ReturnType<typeof buildNorm>, scene: THREE.Object3D) => (
    <group ref={ref}>
      <group rotation={[0, n.yaw, 0]}>
        <group position={[0, n.ground, 0]}>
          <group scale={[n.scale, n.scale, n.scale]}>
            <group position={n.offset}>
              <primitive object={scene} />
            </group>
          </group>
        </group>
      </group>
    </group>
  );

  return (
    <group>
      {rm(d1Ref, d1Norm, d1Gltf.scene)}
      {rm(d2Ref, d2Norm, d2Gltf.scene)}
    </group>
  );
}
