import { devLog, devWarn } from '../utils/devLog';
import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import soldierWalkUrl from '@/assets/soldierwalking.glb?url';
import standingUrl from '@/assets/standing.glb?url';
import jumpUrl from '@/assets/jump.glb?url';
import runUrl from '@/assets/run.glb?url';
import gethitUrl from '@/assets/gethit.glb?url';
import fightUrl from '@/assets/fight.glb?url';
import idleToPushupUrl from '@/assets/idletopushup.glb?url';
import pushupUrl from '@/assets/pushup.glb?url';
import pushupToIdleUrl from '@/assets/pushuptoidle.glb?url';
import agreeUrl from '@/assets/agreegesture.glb?url';
import waveUrl from '@/assets/wave.glb?url';

interface PlayerGLBModelProps {
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

type CharState = 'idle' | 'walk' | 'run' | 'jump' | 'hit' | 'fight' | 'emote_pushup_enter' | 'emote_pushup_loop' | 'emote_pushup_exit' | 'emote_agree' | 'emote_wave';
const MOVE_START_THRESHOLD = 0.07;
const MOVE_STOP_THRESHOLD = 0.04;
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



const RUN_THRESHOLD = 0.7; // moveSpeedRef above this = running

const PUSHUP_DURATION_SEC = 6; // seconds of pushups before getting up
const HIT_ANIM_DURATION = 0.6; // seconds to play hit animation before returning to locomotion

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

export function PlayerGLBModel({ moveSpeedRef, controllerHalfHeight, isGroundedRef, activeEmote, activeEmoteId, onEmoteComplete, damageFlash, attackAnimRef, isFightingRef }: PlayerGLBModelProps) {
  const walkGltf = useGLTF(soldierWalkUrl);
  const idleGltf = useGLTF(standingUrl);
  const jumpGltf = useGLTF(jumpUrl);
  const runGltf = useGLTF(runUrl);
  const hitGltf = useGLTF(gethitUrl);
  const fightGltf = useGLTF(fightUrl);
  const idleToPushupGltf = useGLTF(idleToPushupUrl);
  const pushupGltf = useGLTF(pushupUrl);
  const pushupToIdleGltf = useGLTF(pushupToIdleUrl);
  const agreeGltf = useGLTF(agreeUrl);
  const waveGltf = useGLTF(waveUrl);

  const idleVisibleRef = useRef<THREE.Group>(null);
  const walkVisibleRef = useRef<THREE.Group>(null);
  const jumpVisibleRef = useRef<THREE.Group>(null);
  const runVisibleRef = useRef<THREE.Group>(null);
  const hitVisibleRef = useRef<THREE.Group>(null);
  const fightVisibleRef = useRef<THREE.Group>(null);
  const pushupEnterVisibleRef = useRef<THREE.Group>(null);
  const pushupLoopVisibleRef = useRef<THREE.Group>(null);
  const pushupExitVisibleRef = useRef<THREE.Group>(null);
  const agreeVisibleRef = useRef<THREE.Group>(null);
  const waveVisibleRef = useRef<THREE.Group>(null);

  const stateRef = useRef<CharState>('idle');
  const pushupStartTimeRef = useRef(0);
  const hitStartTimeRef = useRef(0);
  const prevDamageFlashRef = useRef(0);
  const prevAttackingRef = useRef(false);
  const fightStartTimeRef = useRef(0);
  const auditLoggedRef = useRef(false);

  // Sanitize clips
  const sanitizedIdleClips = useMemo(() => sanitizeClips(idleGltf.animations), [idleGltf.animations]);
  const sanitizedWalkClips = useMemo(() => sanitizeClips(walkGltf.animations), [walkGltf.animations]);
  const sanitizedJumpClips = useMemo(() => sanitizeClips(jumpGltf.animations), [jumpGltf.animations]);
  const sanitizedRunClips = useMemo(() => sanitizeClips(runGltf.animations), [runGltf.animations]);
  const sanitizedHitClips = useMemo(() => sanitizeClips(hitGltf.animations), [hitGltf.animations]);
  const sanitizedFightClips = useMemo(() => sanitizeClips(fightGltf.animations), [fightGltf.animations]);
  const sanitizedPushupEnterClips = useMemo(() => sanitizeClips(idleToPushupGltf.animations), [idleToPushupGltf.animations]);
  const sanitizedPushupLoopClips = useMemo(() => sanitizeClips(pushupGltf.animations), [pushupGltf.animations]);
  const sanitizedPushupExitClips = useMemo(() => sanitizeClips(pushupToIdleGltf.animations), [pushupToIdleGltf.animations]);
  const sanitizedAgreeClips = useMemo(() => sanitizeClips(agreeGltf.animations), [agreeGltf.animations]);
  const sanitizedWaveClips = useMemo(() => sanitizeClips(waveGltf.animations), [waveGltf.animations]);

  // Inspections
  const walkInspection = useMemo(() => inspectModel('walk', walkGltf.scene), [walkGltf.scene]);
  const idleInspection = useMemo(() => inspectModel('idle', idleGltf.scene), [idleGltf.scene]);
  const jumpInspection = useMemo(() => inspectModel('jump', jumpGltf.scene), [jumpGltf.scene]);
  const runInspection = useMemo(() => inspectModel('run', runGltf.scene), [runGltf.scene]);
  const hitInspection = useMemo(() => inspectModel('hit', hitGltf.scene), [hitGltf.scene]);
  const fightInspection = useMemo(() => inspectModel('fight', fightGltf.scene), [fightGltf.scene]);
  const pushupEnterInspection = useMemo(() => inspectModel('pushupEnter', idleToPushupGltf.scene), [idleToPushupGltf.scene]);
  const pushupLoopInspection = useMemo(() => inspectModel('pushupLoop', pushupGltf.scene), [pushupGltf.scene]);
  const pushupExitInspection = useMemo(() => inspectModel('pushupExit', pushupToIdleGltf.scene), [pushupToIdleGltf.scene]);
  const agreeInspection = useMemo(() => inspectModel('agree', agreeGltf.scene), [agreeGltf.scene]);
  const waveInspection = useMemo(() => inspectModel('wave', waveGltf.scene), [waveGltf.scene]);

  const canonicalHeight = useMemo(() => {
    if (idleInspection.height > 0.01) return idleInspection.height;
    if (walkInspection.height > 0.01) return walkInspection.height;
    return 1.8;
  }, [idleInspection.height, walkInspection.height]);

  const canonicalYawCorrection = useMemo(() => {
    return walkInspection.facingYaw !== null ? -walkInspection.facingYaw : 0;
  }, [walkInspection.facingYaw]);

  // Normalizations
  const idleNorm = useMemo(() => buildNormalization(idleInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight), [idleInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight]);
  const walkNorm = useMemo(() => buildNormalization(walkInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight), [walkInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight]);
  const jumpNorm = useMemo(() => buildNormalization(jumpInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight), [jumpInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight]);
  const runNorm = useMemo(() => buildNormalization(runInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight), [runInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight]);
  const hitNorm = useMemo(() => buildNormalization(hitInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight), [hitInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight]);
  const fightNorm = useMemo(() => buildNormalization(fightInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight), [fightInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight]);
  const pushupEnterNorm = useMemo(() => buildEmoteNormalization(pushupEnterInspection, idleNorm.scale, canonicalYawCorrection, controllerHalfHeight), [pushupEnterInspection, idleNorm.scale, canonicalYawCorrection, controllerHalfHeight]);
  const pushupLoopNorm = useMemo(() => buildEmoteNormalization(pushupLoopInspection, idleNorm.scale, canonicalYawCorrection, controllerHalfHeight), [pushupLoopInspection, idleNorm.scale, canonicalYawCorrection, controllerHalfHeight]);
  const pushupExitNorm = useMemo(() => buildEmoteNormalization(pushupExitInspection, idleNorm.scale, canonicalYawCorrection, controllerHalfHeight), [pushupExitInspection, idleNorm.scale, canonicalYawCorrection, controllerHalfHeight]);
  const agreeNorm = useMemo(() => buildNormalization(agreeInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight), [agreeInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight]);
  const waveNorm = useMemo(() => buildNormalization(waveInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight), [waveInspection, canonicalHeight, canonicalYawCorrection, controllerHalfHeight]);

  // Animation setups
  const { actions: idleActions, clips: idleClips } = useAnimations(sanitizedIdleClips, idleGltf.scene);
  const idleClipName = useMemo(() => getFirstClipName(idleClips, /idle|stand/i), [idleClips]);

  const { actions: walkActions, clips: walkClips } = useAnimations(sanitizedWalkClips, walkGltf.scene);
  const walkClipName = useMemo(() => getFirstClipName(walkClips, /walk/i), [walkClips]);

  const { actions: jumpActions, clips: jumpClips } = useAnimations(sanitizedJumpClips, jumpGltf.scene);
  const jumpClipName = useMemo(() => getFirstClipName(jumpClips, /jump/i), [jumpClips]);

  const { actions: runActions, clips: runClips } = useAnimations(sanitizedRunClips, runGltf.scene);
  const runClipName = useMemo(() => getFirstClipName(runClips, /run/i), [runClips]);

  const { actions: hitActions, clips: hitClips } = useAnimations(sanitizedHitClips, hitGltf.scene);
  const hitClipName = useMemo(() => getFirstClipName(hitClips, /hit|hurt|damage|react/i), [hitClips]);

  const { actions: fightActions, clips: fightClips } = useAnimations(sanitizedFightClips, fightGltf.scene);
  const fightClipName = useMemo(() => getFirstClipName(fightClips, /fight|attack|punch|strike/i), [fightClips]);

  const { actions: pushupEnterActions, clips: pushupEnterClips } = useAnimations(sanitizedPushupEnterClips, idleToPushupGltf.scene);
  const pushupEnterClipName = useMemo(() => getFirstClipName(pushupEnterClips), [pushupEnterClips]);

  const { actions: pushupLoopActions, clips: pushupLoopClips } = useAnimations(sanitizedPushupLoopClips, pushupGltf.scene);
  const pushupLoopClipName = useMemo(() => getFirstClipName(pushupLoopClips), [pushupLoopClips]);

  const { actions: pushupExitActions, clips: pushupExitClips } = useAnimations(sanitizedPushupExitClips, pushupToIdleGltf.scene);
  const pushupExitClipName = useMemo(() => getFirstClipName(pushupExitClips), [pushupExitClips]);

  const { actions: agreeActions, clips: agreeClips } = useAnimations(sanitizedAgreeClips, agreeGltf.scene);
  const agreeClipName = useMemo(() => getFirstClipName(agreeClips, /agree|nod|yes/i), [agreeClips]);

  const { actions: waveActions, clips: waveClips } = useAnimations(sanitizedWaveClips, waveGltf.scene);
  const waveClipName = useMemo(() => getFirstClipName(waveClips, /wave|greet|hello/i), [waveClips]);

  // Enable shadows on all models
  useEffect(() => {
    [idleGltf.scene, walkGltf.scene, jumpGltf.scene, runGltf.scene, hitGltf.scene, fightGltf.scene, idleToPushupGltf.scene, pushupGltf.scene, pushupToIdleGltf.scene, agreeGltf.scene, waveGltf.scene].forEach(enableMeshShadows);
  }, [idleGltf.scene, walkGltf.scene, jumpGltf.scene, runGltf.scene, hitGltf.scene, fightGltf.scene, idleToPushupGltf.scene, pushupGltf.scene, pushupToIdleGltf.scene, agreeGltf.scene, waveGltf.scene]);

  // Initialize idle/standing (looping)
  useEffect(() => {
    if (!idleClipName) return;
    const a = idleActions[idleClipName]; if (!a) return;
    a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; a.enabled = true; a.play();
    return () => { a.stop(); };
  }, [idleActions, idleClipName]);

  // Initialize walk (paused looping)
  useEffect(() => {
    if (!walkClipName) return;
    const a = walkActions[walkClipName]; if (!a) return;
    a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; a.enabled = true; a.play(); a.paused = true;
    return () => { a.stop(); };
  }, [walkActions, walkClipName]);

  // Initialize jump (paused, play once)
  useEffect(() => {
    if (!jumpClipName) return;
    const a = jumpActions[jumpClipName]; if (!a) return;
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.enabled = true; a.play(); a.paused = true;
    return () => { a.stop(); };
  }, [jumpActions, jumpClipName]);

  // Initialize run (paused looping)
  useEffect(() => {
    if (!runClipName) return;
    const a = runActions[runClipName]; if (!a) return;
    a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; a.enabled = true; a.play(); a.paused = true;
    return () => { a.stop(); };
  }, [runActions, runClipName]);

  // Initialize hit (paused, play once)
  useEffect(() => {
    if (!hitClipName) return;
    const a = hitActions[hitClipName]; if (!a) return;
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.enabled = true; a.play(); a.paused = true;
    return () => { a.stop(); };
  }, [hitActions, hitClipName]);

  // Initialize fight (paused, play once)
  useEffect(() => {
    if (!fightClipName) return;
    const a = fightActions[fightClipName]; if (!a) return;
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.enabled = true; a.play(); a.paused = true;
    return () => { a.stop(); };
  }, [fightActions, fightClipName]);

  // Initialize pushup enter (paused, play once)
  useEffect(() => {
    if (!pushupEnterClipName) return;
    const a = pushupEnterActions[pushupEnterClipName]; if (!a) return;
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.enabled = true; a.play(); a.paused = true;
    return () => { a.stop(); };
  }, [pushupEnterActions, pushupEnterClipName]);

  // Initialize pushup loop (paused, looping but we'll count reps manually)
  useEffect(() => {
    if (!pushupLoopClipName) return;
    const a = pushupLoopActions[pushupLoopClipName]; if (!a) return;
    a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; a.enabled = true; a.play(); a.paused = true;
    return () => { a.stop(); };
  }, [pushupLoopActions, pushupLoopClipName]);

  // Initialize pushup exit (paused, play once)
  useEffect(() => {
    if (!pushupExitClipName) return;
    const a = pushupExitActions[pushupExitClipName]; if (!a) return;
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.enabled = true; a.play(); a.paused = true;
    return () => { a.stop(); };
  }, [pushupExitActions, pushupExitClipName]);

  // Initialize agree (paused, play once)
  useEffect(() => {
    if (!agreeClipName) return;
    const a = agreeActions[agreeClipName]; if (!a) return;
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.enabled = true; a.play(); a.paused = true;
    return () => { a.stop(); };
  }, [agreeActions, agreeClipName]);

  // Initialize wave (paused, play once)
  useEffect(() => {
    if (!waveClipName) return;
    const a = waveActions[waveClipName]; if (!a) return;
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.enabled = true; a.play(); a.paused = true;
    return () => { a.stop(); };
  }, [waveActions, waveClipName]);

  // Audit log
  useEffect(() => {
    if (auditLoggedRef.current) return;
    auditLoggedRef.current = true;
    console.groupCollapsed('[Character Audit] GLB integration');
    devLog('Idle:', idleNorm, 'Walk:', walkNorm, 'Jump:', jumpNorm);
    devLog('PushupEnter:', pushupEnterNorm, 'PushupLoop:', pushupLoopNorm, 'PushupExit:', pushupExitNorm);
    devLog('Clips - walk:', walkClipName, 'jump:', jumpClipName, 'pushupEnter:', pushupEnterClipName, 'pushupLoop:', pushupLoopClipName, 'pushupExit:', pushupExitClipName);
    console.groupEnd();
  }, [idleNorm, walkNorm, jumpNorm, pushupEnterNorm, pushupLoopNorm, pushupExitNorm, walkClipName, jumpClipName, pushupEnterClipName, pushupLoopClipName, pushupExitClipName]);

  // Initial visibility
  useEffect(() => {
    if (idleVisibleRef.current) idleVisibleRef.current.visible = true;
    if (walkVisibleRef.current) walkVisibleRef.current.visible = false;
    if (jumpVisibleRef.current) jumpVisibleRef.current.visible = false;
    if (runVisibleRef.current) runVisibleRef.current.visible = false;
    if (hitVisibleRef.current) hitVisibleRef.current.visible = false;
    if (fightVisibleRef.current) fightVisibleRef.current.visible = false;
    if (pushupEnterVisibleRef.current) pushupEnterVisibleRef.current.visible = false;
    if (pushupLoopVisibleRef.current) pushupLoopVisibleRef.current.visible = false;
    if (pushupExitVisibleRef.current) pushupExitVisibleRef.current.visible = false;
    if (agreeVisibleRef.current) agreeVisibleRef.current.visible = false;
    if (waveVisibleRef.current) waveVisibleRef.current.visible = false;
  }, []);

  const setVisibleState = useCallback((state: CharState) => {
    const map: Record<CharState, React.RefObject<THREE.Group | null>> = {
      idle: idleVisibleRef,
      walk: walkVisibleRef,
      run: runVisibleRef,
      jump: jumpVisibleRef,
      hit: hitVisibleRef,
      fight: fightVisibleRef,
      emote_pushup_enter: pushupEnterVisibleRef,
      emote_pushup_loop: pushupLoopVisibleRef,
      emote_pushup_exit: pushupExitVisibleRef,
      emote_agree: agreeVisibleRef,
      emote_wave: waveVisibleRef,
    };
    for (const [key, ref] of Object.entries(map)) {
      if (ref.current) ref.current.visible = key === state;
    }
  }, []);

  // Handle emote trigger — use activeEmoteId to detect re-triggers of the same emote
  const prevEmoteIdRef = useRef(0);
  useEffect(() => {
    const id = activeEmoteId ?? 0;
    if (id === prevEmoteIdRef.current || !activeEmote) {
      prevEmoteIdRef.current = id;
      return;
    }
    prevEmoteIdRef.current = id;

    if (activeEmote === 'pushups') {
      stateRef.current = 'emote_pushup_enter';
      pushupStartTimeRef.current = 0;
      setVisibleState('emote_pushup_enter');
      if (pushupEnterClipName) {
        const a = pushupEnterActions[pushupEnterClipName];
        if (a) { a.reset(); a.play(); a.paused = false; }
      }
    } else if (activeEmote === 'agree') {
      stateRef.current = 'emote_agree';
      setVisibleState('emote_agree');
      if (agreeClipName) {
        const a = agreeActions[agreeClipName];
        if (a) { a.reset(); a.play(); a.paused = false; }
      }
    } else if (activeEmote === 'wave') {
      stateRef.current = 'emote_wave';
      setVisibleState('emote_wave');
      if (waveClipName) {
        const a = waveActions[waveClipName];
        if (a) { a.reset(); a.play(); a.paused = false; }
      }
    }
  }, [activeEmoteId, activeEmote, pushupEnterActions, pushupEnterClipName, agreeActions, agreeClipName, waveActions, waveClipName, setVisibleState]);

  useFrame(() => {
    const state = stateRef.current;

    // ===== DAMAGE HIT TRIGGER =====
    const currentFlash = damageFlash ?? 0;
    if (currentFlash > 0 && prevDamageFlashRef.current === 0 && state !== 'hit') {
      // Player just got hit — trigger hit animation
      stateRef.current = 'hit';
      hitStartTimeRef.current = performance.now();
      setVisibleState('hit');
      if (hitClipName) {
        const a = hitActions[hitClipName];
        if (a) { a.reset(); a.play(); a.paused = false; }
      }
    }
    prevDamageFlashRef.current = currentFlash;

    // ===== HIT STATE =====
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
        // No hit clip — fallback to idle after duration
        if (elapsed >= HIT_ANIM_DURATION) {
          stateRef.current = 'idle';
          setVisibleState('idle');
        }
      }
      return;
    }

    // ===== FIGHT ATTACK TRIGGER =====
    const currentlyAttacking = (attackAnimRef?.current ?? 0) > 0;
    if (currentlyAttacking && !prevAttackingRef.current && (stateRef.current as CharState) !== 'fight' && (stateRef.current as CharState) !== 'hit') {
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

    // ===== FIGHT STATE =====
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

    // ===== EMOTE STATES =====
    if (state === 'emote_pushup_enter') {
      if (pushupEnterClipName) {
        const a = pushupEnterActions[pushupEnterClipName];
        if (a && a.time >= a.getClip().duration - 0.05) {
          // Transition to pushup loop
          a.paused = true;
          stateRef.current = 'emote_pushup_loop';
          pushupStartTimeRef.current = performance.now();
          setVisibleState('emote_pushup_loop');
          if (pushupLoopClipName) {
            const la = pushupLoopActions[pushupLoopClipName];
            if (la) { la.reset(); la.play(); la.paused = false; }
          }
        }
      }
      return;
    }

    if (state === 'emote_pushup_loop') {
      const elapsed = (performance.now() - pushupStartTimeRef.current) / 1000;
      if (elapsed >= PUSHUP_DURATION_SEC) {
        // Done — transition to exit
        if (pushupLoopClipName) {
          const a = pushupLoopActions[pushupLoopClipName];
          if (a) a.paused = true;
        }
        stateRef.current = 'emote_pushup_exit';
        setVisibleState('emote_pushup_exit');
        if (pushupExitClipName) {
          const ea = pushupExitActions[pushupExitClipName];
          if (ea) { ea.reset(); ea.play(); ea.paused = false; }
        }
      }
      return;
    }

    if (state === 'emote_pushup_exit') {
      if (pushupExitClipName) {
        const a = pushupExitActions[pushupExitClipName];
        if (a && a.time >= a.getClip().duration - 0.05) {
          // Done — return to idle
          a.paused = true;
          stateRef.current = 'idle';
          setVisibleState('idle');
          onEmoteComplete();
        }
      }
      return;
    }

    // ===== AGREE EMOTE STATE =====
    if (state === 'emote_agree') {
      if (agreeClipName) {
        const a = agreeActions[agreeClipName];
        if (a && a.time >= a.getClip().duration - 0.05) {
          a.paused = true;
          stateRef.current = 'idle';
          setVisibleState('idle');
          onEmoteComplete();
        }
      } else {
        stateRef.current = 'idle';
        setVisibleState('idle');
        onEmoteComplete();
      }
      return;
    }

    // ===== WAVE EMOTE STATE =====
    if (state === 'emote_wave') {
      if (waveClipName) {
        const a = waveActions[waveClipName];
        if (a && a.time >= a.getClip().duration - 0.05) {
          a.paused = true;
          stateRef.current = 'idle';
          setVisibleState('idle');
          onEmoteComplete();
        }
      } else {
        stateRef.current = 'idle';
        setVisibleState('idle');
        onEmoteComplete();
      }
      return;
    }

    // ===== NORMAL LOCOMOTION STATES =====
    const speed = moveSpeedRef.current;
    const grounded = isGroundedRef.current;

    let newState: CharState;
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

      if (newState === 'jump' && jumpClipName) {
        const a = jumpActions[jumpClipName];
        if (a) { a.reset(); a.play(); a.paused = false; }
      }
    }

    // Idle/standing animation
    if (idleClipName) {
      const ia = idleActions[idleClipName];
      if (ia) {
        if (newState === 'idle') {
          ia.paused = false;
        } else {
          ia.paused = true;
        }
      }
    }

    // Walk animation speed
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

    // Run animation speed
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
      {renderModel(hitVisibleRef, hitNorm, hitGltf.scene)}
      {renderModel(fightVisibleRef, fightNorm, fightGltf.scene)}
      {renderModel(pushupEnterVisibleRef, pushupEnterNorm, idleToPushupGltf.scene)}
      {renderModel(pushupLoopVisibleRef, pushupLoopNorm, pushupGltf.scene)}
      {renderModel(pushupExitVisibleRef, pushupExitNorm, pushupToIdleGltf.scene)}
      {renderModel(agreeVisibleRef, agreeNorm, agreeGltf.scene)}
      {renderModel(waveVisibleRef, waveNorm, waveGltf.scene)}
    </group>
  );
}

// ===== Utility functions =====

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

/**
 * For emote/prone animations: use the idle model's scale (not height-derived)
 * and ground the model by its bounding box min Y so it sits on the terrain.
 */
function buildEmoteNormalization(
  inspection: ModelInspection,
  idleScale: number,
  fallbackYawCorrection: number,
  controllerHalfHeight: number,
): ModelNormalization {
  const yawCorrection = inspection.facingYaw !== null ? -inspection.facingYaw : fallbackYawCorrection;
  return {
    modelAnchorOffset: [-inspection.anchor.x, -inspection.footY, -inspection.anchor.z],
    scale: idleScale,
    yawCorrection,
    controllerGroundOffset: -controllerHalfHeight,
  };
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

