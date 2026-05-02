import { useEffect, useMemo, useRef, useCallback, useState, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import chillhouseStandingUrl from '@/assets/chillhousestanding.glb?url';
import chillhouseWalkingUrl from '@/assets/chillhousewalking.glb?url';
import chillhouseRunningUrl from '@/assets/chillhouserunning.glb?url';
import chillhouseJumpUrl from '@/assets/chillhousejump.glb?url';
import chillhouseGetHitUrl from '@/assets/chillhousegethit.glb?url';
import chillhouseFightUrl from '@/assets/chillhousefight.glb?url';
import { ChillhouseEmotes } from './ChillhouseEmotes';

interface ChillhouseGLBModelProps {
  moveSpeedRef: React.MutableRefObject<number>;
  controllerHalfHeight: number;
  isGroundedRef: React.MutableRefObject<boolean>;
  activeEmote: string | null;
  activeEmoteId?: number;
  onEmoteComplete: () => void;
  damageFlash?: number;
  attackAnimRef?: React.MutableRefObject<number>;
  isFightingRef?: React.MutableRefObject<boolean>;
}

type ChillhouseState = 'idle' | 'walk' | 'run' | 'jump' | 'hit' | 'fight' | 'emote_hiphop' | 'emote_gangnam';

const HIT_ANIM_DURATION = 0.8;
const MOVE_START_THRESHOLD = 0.07;
const MOVE_STOP_THRESHOLD = 0.04;
const RUN_THRESHOLD = 0.7;
const ROOT_TRANSLATION_NAME_RE = /(hips|pelvis|root|armature)/i;
const BONE_HIPS_RE = /(hips|pelvis)/i;
const BONE_HEAD_RE = /(head|neck)/i;
const BONE_LEFT_RE = /(leftshoulder|left_shoulder|shoulder_l|leftarm|left_arm)/i;
const BONE_RIGHT_RE = /(rightshoulder|right_shoulder|shoulder_r|rightarm|right_arm)/i;

const _tmpVecA = new THREE.Vector3();
const _tmpVecB = new THREE.Vector3();
const _tmpVecC = new THREE.Vector3();
const _tmpVecD = new THREE.Vector3();
const _tmpUp = new THREE.Vector3();
const _tmpRight = new THREE.Vector3();
const _tmpForward = new THREE.Vector3();
const _tmpForwardAlt = new THREE.Vector3();
const _tmpCenter = new THREE.Vector3();
const _tmpSize = new THREE.Vector3();

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

function getFirstClipName(clips: THREE.AnimationClip[], hint?: RegExp): string | null {
  if (clips.length === 0) return null;
  if (hint) {
    const found = clips.find(c => hint.test(c.name));
    if (found) return found.name;
  }
  return clips[0].name;
}

interface ModelInspection {
  label: string;
  sceneRoot: THREE.Object3D;
  armature: THREE.Object3D | null;
  skinnedMesh: THREE.SkinnedMesh | null;
  hipsBone: THREE.Bone | null;
  bounds: THREE.Box3;
  size: THREE.Vector3;
  center: THREE.Vector3;
  anchor: THREE.Vector3;
  footY: number;
  height: number;
  facingYaw: number | null;
  facingYawCandidates: number[];
}

interface ModelNormalization {
  modelAnchorOffset: [number, number, number];
  scale: number;
  yawCorrection: number;
  controllerGroundOffset: number;
}

function inspectModel(label: string, scene: THREE.Object3D): ModelInspection {
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  const size = bounds.getSize(_tmpSize.clone());
  const center = bounds.getCenter(_tmpCenter.clone());

  const skinnedMeshes: THREE.SkinnedMesh[] = [];
  scene.traverse((child) => {
    if ((child as THREE.SkinnedMesh).isSkinnedMesh) skinnedMeshes.push(child as THREE.SkinnedMesh);
  });

  const primarySkinnedMesh = skinnedMeshes[0] ?? null;
  const skeleton = primarySkinnedMesh?.skeleton ?? null;
  const hipsBone = skeleton?.bones.find((bone) => BONE_HIPS_RE.test(bone.name)) ?? skeleton?.bones[0] ?? null;
  const armature = scene.getObjectByName('Armature') ?? findArmatureNode(scene);
  const facing = inferFacingYawFromSkeleton(skeleton);

  let anchorX = center.x, anchorZ = center.z;
  if (hipsBone) {
    hipsBone.getWorldPosition(_tmpVecA);
    anchorX = _tmpVecA.x;
    anchorZ = _tmpVecA.z;
  }

  return {
    label, sceneRoot: scene, armature, skinnedMesh: primarySkinnedMesh, hipsBone,
    bounds, size: size.clone(), center: center.clone(),
    anchor: new THREE.Vector3(anchorX, 0, anchorZ),
    footY: bounds.min.y, height: size.y,
    facingYaw: facing.yaw, facingYawCandidates: facing.candidates,
  };
}

function inferFacingYawFromSkeleton(skeleton: THREE.Skeleton | null): { yaw: number | null; candidates: number[] } {
  if (!skeleton || skeleton.bones.length === 0) return { yaw: null, candidates: [] };
  const hips = skeleton.bones.find((b) => BONE_HIPS_RE.test(b.name)) ?? null;
  const head = skeleton.bones.find((b) => BONE_HEAD_RE.test(b.name)) ?? null;
  const left = skeleton.bones.find((b) => BONE_LEFT_RE.test(b.name)) ?? null;
  const right = skeleton.bones.find((b) => BONE_RIGHT_RE.test(b.name)) ?? null;
  if (!hips || !head || !left || !right) return { yaw: null, candidates: [] };

  hips.getWorldPosition(_tmpVecA); head.getWorldPosition(_tmpVecB);
  left.getWorldPosition(_tmpVecC); right.getWorldPosition(_tmpVecD);
  _tmpUp.subVectors(_tmpVecB, _tmpVecA).normalize();
  _tmpRight.subVectors(_tmpVecD, _tmpVecC).normalize();
  _tmpForward.crossVectors(_tmpRight, _tmpUp).normalize();
  _tmpForwardAlt.crossVectors(_tmpUp, _tmpRight).normalize();
  if (_tmpForward.lengthSq() < 1e-6 || _tmpForwardAlt.lengthSq() < 1e-6) return { yaw: null, candidates: [] };

  const yawA = Math.atan2(_tmpForward.x, _tmpForward.z);
  const yawB = Math.atan2(_tmpForwardAlt.x, _tmpForwardAlt.z);
  const nA = normalizeAngle(yawA), nB = normalizeAngle(yawB);
  const preferred = Math.abs(nA) <= Math.abs(nB) ? nA : nB;
  return { yaw: preferred, candidates: [nA, nB] };
}

function normalizeAngle(v: number): number {
  let out = v;
  while (out > Math.PI) out -= Math.PI * 2;
  while (out < -Math.PI) out += Math.PI * 2;
  return out;
}

function enableMeshShadows(scene: THREE.Object3D) {
  scene.traverse((child) => { if ((child as THREE.Mesh).isMesh) { child.castShadow = true; child.receiveShadow = true; } });
}

function findArmatureNode(scene: THREE.Object3D): THREE.Object3D | null {
  let armature: THREE.Object3D | null = null;
  scene.traverse((child) => { if (armature) return; if (/armature/i.test(child.name)) armature = child; });
  return armature;
}

function buildNormalization(
  inspection: ModelInspection,
  canonicalHeight: number,
  fallbackYawCorrection: number,
  controllerHalfHeight: number,
): ModelNormalization {
  const scale = inspection.height > 0.01 ? canonicalHeight / inspection.height : 1;
  const yawCorrection = inspection.facingYaw !== null ? -inspection.facingYaw : fallbackYawCorrection;
  return {
    modelAnchorOffset: [-inspection.anchor.x, -inspection.footY, -inspection.anchor.z],
    scale,
    yawCorrection,
    controllerGroundOffset: -controllerHalfHeight,
  };
}

export function ChillhouseGLBModel({ moveSpeedRef, controllerHalfHeight, isGroundedRef, activeEmote, activeEmoteId, onEmoteComplete, damageFlash, attackAnimRef, isFightingRef }: ChillhouseGLBModelProps) {
  const idleGltf = useGLTF(chillhouseStandingUrl);
  const walkGltf = useGLTF(chillhouseWalkingUrl);
  const runGltf = useGLTF(chillhouseRunningUrl);
  const jumpGltf = useGLTF(chillhouseJumpUrl);
  const getHitGltf = useGLTF(chillhouseGetHitUrl);
  const fightGltf = useGLTF(chillhouseFightUrl);

  const [emoteEverUsed, setEmoteEverUsed] = useState(false);

  const idleVisibleRef = useRef<THREE.Group>(null);
  const walkVisibleRef = useRef<THREE.Group>(null);
  const runVisibleRef = useRef<THREE.Group>(null);
  const jumpVisibleRef = useRef<THREE.Group>(null);
  const hitVisibleRef = useRef<THREE.Group>(null);
  const fightVisibleRef = useRef<THREE.Group>(null);

  const lastEmoteIdRef = useRef<number>(0);
  const hitStartTimeRef = useRef(0);
  const prevDamageFlashRef = useRef(0);
  const prevAttackingRef = useRef(false);
  const fightStartTimeRef = useRef(0);
  const stateRef = useRef<ChillhouseState>('idle');

  const sanitizedIdleClips = useMemo(() => sanitizeClips(idleGltf.animations), [idleGltf.animations]);
  const sanitizedWalkClips = useMemo(() => sanitizeClips(walkGltf.animations), [walkGltf.animations]);
  const sanitizedRunClips = useMemo(() => sanitizeClips(runGltf.animations), [runGltf.animations]);
  const sanitizedJumpClips = useMemo(() => sanitizeClips(jumpGltf.animations), [jumpGltf.animations]);
  const sanitizedHitClips = useMemo(() => sanitizeClips(getHitGltf.animations), [getHitGltf.animations]);
  const sanitizedFightClips = useMemo(() => sanitizeClips(fightGltf.animations), [fightGltf.animations]);

  const idleInspection = useMemo(() => inspectModel('chillhouse_idle', idleGltf.scene), [idleGltf.scene]);
  const walkInspection = useMemo(() => inspectModel('chillhouse_walk', walkGltf.scene), [walkGltf.scene]);
  const runInspection = useMemo(() => inspectModel('chillhouse_run', runGltf.scene), [runGltf.scene]);
  const jumpInspection = useMemo(() => inspectModel('chillhouse_jump', jumpGltf.scene), [jumpGltf.scene]);
  const hitInspection = useMemo(() => inspectModel('chillhouse_hit', getHitGltf.scene), [getHitGltf.scene]);
  const fightInspection = useMemo(() => inspectModel('chillhouse_fight', fightGltf.scene), [fightGltf.scene]);

  const canonicalHeight = useMemo(() => {
    if (idleInspection.height > 0.01) return idleInspection.height;
    if (walkInspection.height > 0.01) return walkInspection.height;
    return 1.8;
  }, [idleInspection.height, walkInspection.height]);

  const canonicalYawCorrection = useMemo(() => {
    return walkInspection.facingYaw !== null ? -walkInspection.facingYaw : 0;
  }, [walkInspection.facingYaw]);

  const idleNorm = useMemo(() => buildNormalization(idleInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight), [idleInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight]);
  const walkNorm = useMemo(() => buildNormalization(walkInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight), [walkInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight]);
  const runNorm = useMemo(() => buildNormalization(runInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight), [runInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight]);
  const jumpNorm = useMemo(() => buildNormalization(jumpInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight), [jumpInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight]);
  const hitNorm = useMemo(() => buildNormalization(hitInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight), [hitInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight]);
  const fightNorm = useMemo(() => buildNormalization(fightInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight), [fightInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight]);

  const { actions: idleActions, clips: idleClips } = useAnimations(sanitizedIdleClips, idleGltf.scene);
  const idleClipName = useMemo(() => getFirstClipName(idleClips, /idle|stand/i), [idleClips]);

  const { actions: walkActions, clips: walkClips } = useAnimations(sanitizedWalkClips, walkGltf.scene);
  const walkClipName = useMemo(() => getFirstClipName(walkClips, /walk/i), [walkClips]);

  const { actions: runActions, clips: runClips } = useAnimations(sanitizedRunClips, runGltf.scene);
  const runClipName = useMemo(() => getFirstClipName(runClips, /run/i), [runClips]);

  const { actions: jumpActions, clips: jumpClips } = useAnimations(sanitizedJumpClips, jumpGltf.scene);
  const jumpClipName = useMemo(() => getFirstClipName(jumpClips, /jump/i), [jumpClips]);

  const { actions: hitActions, clips: hitClips } = useAnimations(sanitizedHitClips, getHitGltf.scene);
  const hitClipName = useMemo(() => getFirstClipName(hitClips, /hit|hurt|damage/i), [hitClips]);

  const { actions: fightActions, clips: fightClips } = useAnimations(sanitizedFightClips, fightGltf.scene);
  const fightClipName = useMemo(() => getFirstClipName(fightClips, /fight|attack|punch/i), [fightClips]);

  useEffect(() => {
    [idleGltf.scene, walkGltf.scene, runGltf.scene, jumpGltf.scene, getHitGltf.scene, fightGltf.scene].forEach(enableMeshShadows);
    console.log('[Chillhouse] Clip names — idle:', idleClipName, 'walk:', walkClipName, 'run:', runClipName, 'jump:', jumpClipName, 'hit:', hitClipName, 'fight:', fightClipName);
  }, [idleGltf.scene, walkGltf.scene, runGltf.scene, jumpGltf.scene, getHitGltf.scene, fightGltf.scene, idleClipName, walkClipName, runClipName, jumpClipName, hitClipName, fightClipName]);

  useEffect(() => {
    if (!idleClipName) return;
    const a = idleActions[idleClipName]; if (!a) return;
    a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; a.enabled = true; a.play();
    return () => { a.stop(); };
  }, [idleActions, idleClipName]);

  useEffect(() => {
    if (!walkClipName) return;
    const a = walkActions[walkClipName]; if (!a) return;
    a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; a.enabled = true; a.play(); a.paused = true;
    return () => { a.stop(); };
  }, [walkActions, walkClipName]);

  useEffect(() => {
    if (!runClipName) return;
    const a = runActions[runClipName]; if (!a) return;
    a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; a.enabled = true; a.play(); a.paused = true;
    return () => { a.stop(); };
  }, [runActions, runClipName]);

  useEffect(() => {
    if (!jumpClipName) return;
    const a = jumpActions[jumpClipName]; if (!a) return;
    a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; a.enabled = true; a.play(); a.paused = true;
    return () => { a.stop(); };
  }, [jumpActions, jumpClipName]);

  useEffect(() => {
    if (idleVisibleRef.current) idleVisibleRef.current.visible = true;
    if (walkVisibleRef.current) walkVisibleRef.current.visible = false;
    if (runVisibleRef.current) runVisibleRef.current.visible = false;
    if (jumpVisibleRef.current) jumpVisibleRef.current.visible = false;
    if (hitVisibleRef.current) hitVisibleRef.current.visible = false;
    if (fightVisibleRef.current) fightVisibleRef.current.visible = false;
  }, []);

  const setVisibleState = useCallback((state: ChillhouseState | string) => {
    if (idleVisibleRef.current) idleVisibleRef.current.visible = state === 'idle';
    if (walkVisibleRef.current) walkVisibleRef.current.visible = state === 'walk';
    if (runVisibleRef.current) runVisibleRef.current.visible = state === 'run';
    if (jumpVisibleRef.current) jumpVisibleRef.current.visible = state === 'jump';
    if (hitVisibleRef.current) hitVisibleRef.current.visible = state === 'hit';
    if (fightVisibleRef.current) fightVisibleRef.current.visible = state === 'fight';
  }, []);

  useEffect(() => {
    if (activeEmote && !emoteEverUsed) setEmoteEverUsed(true);
  }, [activeEmote, emoteEverUsed]);

  const parentHideLocomotion = useCallback(() => {
    if (idleVisibleRef.current) idleVisibleRef.current.visible = false;
    if (walkVisibleRef.current) walkVisibleRef.current.visible = false;
    if (runVisibleRef.current) runVisibleRef.current.visible = false;
    if (jumpVisibleRef.current) jumpVisibleRef.current.visible = false;
    if (hitVisibleRef.current) hitVisibleRef.current.visible = false;
    if (fightVisibleRef.current) fightVisibleRef.current.visible = false;
  }, []);

  const onEmoteEnd = useCallback(() => {
    stateRef.current = 'idle';
    setVisibleState('idle');
    onEmoteComplete();
  }, [setVisibleState, onEmoteComplete]);

  useFrame(() => {
    const state = stateRef.current;
    const speed = moveSpeedRef.current;
    const grounded = isGroundedRef.current;

    const currentFlash = damageFlash ?? 0;
    if (currentFlash > 0 && prevDamageFlashRef.current === 0 && stateRef.current !== 'hit') {
      stateRef.current = 'hit';
      hitStartTimeRef.current = performance.now();
      setVisibleState('hit');
      if (hitClipName) {
        const a = hitActions[hitClipName];
        if (a) { a.reset(); a.play(); a.paused = false; }
      }
    }
    prevDamageFlashRef.current = currentFlash;

    if (stateRef.current === 'hit') {
      const elapsed = (performance.now() - hitStartTimeRef.current) / 1000;
      if (hitClipName) {
        const a = hitActions[hitClipName];
        if (a && (elapsed >= HIT_ANIM_DURATION || a.time >= a.getClip().duration - 0.05)) {
          a.paused = true;
          stateRef.current = 'idle';
          setVisibleState('idle');
        }
      } else {
        if (elapsed >= HIT_ANIM_DURATION) {
          stateRef.current = 'idle';
          setVisibleState('idle');
        }
      }
      return;
    }

    const currentlyAttacking = (attackAnimRef?.current ?? 0) > 0;
    if (currentlyAttacking && !prevAttackingRef.current && (stateRef.current as ChillhouseState) !== 'fight' && (stateRef.current as ChillhouseState) !== 'hit') {
      stateRef.current = 'fight';
      fightStartTimeRef.current = performance.now();
      setVisibleState('fight');
      if (isFightingRef) isFightingRef.current = true;
      if (fightClipName) {
        const a = fightActions[fightClipName];
        if (a) { a.reset(); a.play(); a.paused = false; }
      }
    }
    prevAttackingRef.current = currentlyAttacking;

    if (stateRef.current === 'fight') {
      if (fightClipName) {
        const a = fightActions[fightClipName];
        if (a && a.time >= a.getClip().duration - 0.05) {
          a.paused = true;
          stateRef.current = 'idle';
          setVisibleState('idle');
          if (isFightingRef) isFightingRef.current = false;
        }
      } else {
        const elapsed = (performance.now() - fightStartTimeRef.current) / 1000;
        if (elapsed >= 0.5) {
          stateRef.current = 'idle';
          setVisibleState('idle');
          if (isFightingRef) isFightingRef.current = false;
        }
      }
      return;
    }

    // ===== EMOTE STATE — managed by lazy emote sub-component =====
    if (state.startsWith('emote_')) return;

    let newState: ChillhouseState;
    if (!grounded) {
      newState = 'jump';
    } else if (state === 'idle' ? speed > MOVE_START_THRESHOLD : speed > MOVE_STOP_THRESHOLD) {
      newState = speed > RUN_THRESHOLD ? 'run' : 'walk';
    } else {
      newState = 'idle';
    }

    if (newState !== state) {
      stateRef.current = newState;
      setVisibleState(newState);
    }

    if (idleClipName) {
      const ia = idleActions[idleClipName];
      if (ia) ia.paused = newState !== 'idle';
    }

    if (jumpClipName) {
      const ja = jumpActions[jumpClipName];
      if (ja) {
        if (newState === 'jump') {
          ja.paused = false;
          ja.setEffectiveTimeScale(1.0);
        } else {
          ja.paused = true;
        }
      }
    }

    if (walkClipName) {
      const wa = walkActions[walkClipName];
      if (wa) {
        if (newState === 'walk') {
          wa.paused = false;
          wa.setEffectiveTimeScale(Math.max(0.55, THREE.MathUtils.clamp(speed, 0, 1.4) * 1.35));
        } else {
          wa.paused = true;
        }
      }
    }

    if (runClipName) {
      const ra = runActions[runClipName];
      if (ra) {
        if (newState === 'run') {
          ra.paused = false;
          ra.setEffectiveTimeScale(1.0);
        } else {
          ra.paused = true;
        }
      }
    }
  });

  const renderModel = (ref: React.RefObject<THREE.Group | null>, norm: ModelNormalization, scene: THREE.Object3D) => (
    <group ref={ref}>
      <group rotation={[0, norm.yawCorrection, 0]}>
        <group position={[0, norm.controllerGroundOffset, 0]}>
          <group scale={[norm.scale, norm.scale, norm.scale]}>
            <group position={norm.modelAnchorOffset}>
              <primitive object={scene} />
            </group>
          </group>
        </group>
      </group>
    </group>
  );

  return (
    <group>
      {renderModel(idleVisibleRef, idleNorm, idleGltf.scene)}
      {renderModel(walkVisibleRef, walkNorm, walkGltf.scene)}
      {renderModel(runVisibleRef, runNorm, runGltf.scene)}
      {renderModel(jumpVisibleRef, jumpNorm, jumpGltf.scene)}
      {renderModel(hitVisibleRef, hitNorm, getHitGltf.scene)}
      {renderModel(fightVisibleRef, fightNorm, fightGltf.scene)}
      {emoteEverUsed && (
        <Suspense fallback={null}>
          <ChillhouseEmotes
            activeEmote={activeEmote}
            activeEmoteId={activeEmoteId}
            stateRef={stateRef as React.MutableRefObject<string>}
            onEmoteEnd={onEmoteEnd}
            parentHideLocomotion={parentHideLocomotion}
            controllerHalfHeight={controllerHalfHeight}
            canonicalHeight={canonicalHeight}
            canonicalYawCorrection={canonicalYawCorrection}
          />
        </Suspense>
      )}
    </group>
  );
}
