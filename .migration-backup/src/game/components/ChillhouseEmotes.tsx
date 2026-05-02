/**
 * ChillhouseEmotes — Lazy-loaded emote sub-component for Chillhouse character.
 * Only mounts when the player first triggers an emote, deferring ~13MB of GLB downloads.
 */
import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import hiphopUrl from '@/assets/hiphop.glb?url';
import gangnamUrl from '@/assets/gangnam.glb?url';

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

export function ChillhouseEmotes({ activeEmote, activeEmoteId, stateRef, onEmoteEnd, parentHideLocomotion, controllerHalfHeight, canonicalHeight, canonicalYawCorrection }: Props) {
  const hiphopGltf = useGLTF(hiphopUrl);
  const gangnamGltf = useGLTF(gangnamUrl);

  const hiphopRef = useRef<THREE.Group>(null);
  const gangnamRef = useRef<THREE.Group>(null);
  const lastIdRef = useRef(0);

  const hClips = useMemo(() => sanitizeClips(hiphopGltf.animations), [hiphopGltf.animations]);
  const gClips = useMemo(() => sanitizeClips(gangnamGltf.animations), [gangnamGltf.animations]);

  const hInsp = useMemo(() => inspectScene(hiphopGltf.scene), [hiphopGltf.scene]);
  const gInsp = useMemo(() => inspectScene(gangnamGltf.scene), [gangnamGltf.scene]);

  const hNorm = useMemo(() => buildNorm(hInsp, canonicalHeight, canonicalYawCorrection, controllerHalfHeight), [hInsp, canonicalHeight, canonicalYawCorrection, controllerHalfHeight]);
  const gNorm = useMemo(() => buildNorm(gInsp, canonicalHeight, canonicalYawCorrection, controllerHalfHeight), [gInsp, canonicalHeight, canonicalYawCorrection, controllerHalfHeight]);

  const { actions: hActs, clips: hC } = useAnimations(hClips, hiphopGltf.scene);
  const hName = useMemo(() => getClipName(hC, /hip|hop|dance/i), [hC]);

  const { actions: gActs, clips: gC } = useAnimations(gClips, gangnamGltf.scene);
  const gName = useMemo(() => getClipName(gC, /gangnam|dance/i), [gC]);

  useEffect(() => {
    [hiphopGltf.scene, gangnamGltf.scene].forEach(s => s.traverse(c => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } }));
  }, [hiphopGltf.scene, gangnamGltf.scene]);

  useEffect(() => {
    if (hiphopRef.current) hiphopRef.current.visible = false;
    if (gangnamRef.current) gangnamRef.current.visible = false;
  }, []);

  const hideAll = useCallback(() => {
    if (hiphopRef.current) hiphopRef.current.visible = false;
    if (gangnamRef.current) gangnamRef.current.visible = false;
  }, []);

  useFrame(() => {
    const st = stateRef.current;
    if (!st.startsWith('emote_')) { hideAll(); return; }

    const eid = activeEmoteId ?? 0;

    if (activeEmote === 'hiphop' && eid !== lastIdRef.current) {
      lastIdRef.current = eid;
      stateRef.current = 'emote_hiphop';
      parentHideLocomotion();
      if (hiphopRef.current) hiphopRef.current.visible = true;
      if (gangnamRef.current) gangnamRef.current.visible = false;
      if (hName) { const a = hActs[hName]; if (a) { a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.enabled = true; a.play(); a.paused = false; } }
      return;
    }

    if (activeEmote === 'gangnam' && eid !== lastIdRef.current) {
      lastIdRef.current = eid;
      stateRef.current = 'emote_gangnam';
      parentHideLocomotion();
      if (gangnamRef.current) gangnamRef.current.visible = true;
      if (hiphopRef.current) hiphopRef.current.visible = false;
      if (gName) { const a = gActs[gName]; if (a) { a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.enabled = true; a.play(); a.paused = false; } }
      return;
    }

    if (st === 'emote_hiphop' && hName) {
      const a = hActs[hName];
      if (a && a.time >= a.getClip().duration - 0.05) { a.paused = true; hideAll(); onEmoteEnd(); }
      return;
    }
    if (st === 'emote_gangnam' && gName) {
      const a = gActs[gName];
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
      {rm(hiphopRef, hNorm, hiphopGltf.scene)}
      {rm(gangnamRef, gNorm, gangnamGltf.scene)}
    </group>
  );
}
