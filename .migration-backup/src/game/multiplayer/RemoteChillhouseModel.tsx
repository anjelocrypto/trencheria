import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import chillhouseStandingUrl from '@/assets/chillhousestanding.glb?url';
import chillhouseWalkingUrl from '@/assets/chillhousewalking.glb?url';
import chillhouseRunningUrl from '@/assets/chillhouserunning.glb?url';
import chillhouseGetHitUrl from '@/assets/chillhousegethit.glb?url';
import chillhouseFightUrl from '@/assets/chillhousefight.glb?url';
import chillhouseDeadUrl from '@/assets/chillhousedead.glb?url';
import chillhouseJumpUrl from '@/assets/chillhousejump.glb?url';
import hiphopUrl from '@/assets/hiphop.glb?url';
import gangnamUrl from '@/assets/gangnam.glb?url';
import {
  buildModelNormalization,
  cloneScene,
  enableMeshShadows,
  getSceneHeight,
  ModelNormalization,
  sanitizeClips,
} from './remoteModelUtils';

interface Props {
  moveSpeed: number;
  isRunning: boolean;
  isGrounded: boolean;
  attackAnim: number;
  health: number;
  emote: string | null;
}

type RemoteState = 'idle' | 'walk' | 'run' | 'jump' | 'fight' | 'hit' | 'dead' | 'emote_hiphop' | 'emote_gangnam';

export function RemoteChillhouseModel({ moveSpeed, isRunning, isGrounded, attackAnim, health, emote }: Props) {
  const idleGltf = useGLTF(chillhouseStandingUrl);
  const walkGltf = useGLTF(chillhouseWalkingUrl);
  const runGltf = useGLTF(chillhouseRunningUrl);
  const hitGltf = useGLTF(chillhouseGetHitUrl);
  const fightGltf = useGLTF(chillhouseFightUrl);
  const deadGltf = useGLTF(chillhouseDeadUrl);
  const jumpGltf = useGLTF(chillhouseJumpUrl);
  const hiphopGltf = useGLTF(hiphopUrl);
  const gangnamGltf = useGLTF(gangnamUrl);

  const idleScene = useMemo(() => cloneScene(idleGltf.scene), [idleGltf.scene]);
  const walkScene = useMemo(() => cloneScene(walkGltf.scene), [walkGltf.scene]);
  const runScene = useMemo(() => cloneScene(runGltf.scene), [runGltf.scene]);
  const hitScene = useMemo(() => cloneScene(hitGltf.scene), [hitGltf.scene]);
  const fightScene = useMemo(() => cloneScene(fightGltf.scene), [fightGltf.scene]);
  const deadScene = useMemo(() => cloneScene(deadGltf.scene), [deadGltf.scene]);
  const jumpScene = useMemo(() => cloneScene(jumpGltf.scene), [jumpGltf.scene]);
  const hiphopScene = useMemo(() => cloneScene(hiphopGltf.scene), [hiphopGltf.scene]);
  const gangnamScene = useMemo(() => cloneScene(gangnamGltf.scene), [gangnamGltf.scene]);

  const stateRef = useRef<RemoteState>('idle');
  const [renderState, setRenderState] = useState<RemoteState>('idle');
  const prevAttackRef = useRef(0);
  const prevHealthRef = useRef(health);
  const hitTimerRef = useRef(0);
  const fightTimerRef = useRef(0);
  const emoteTimerRef = useRef(0);
  const prevEmoteRef = useRef<string | null>(null);

  const idleClips = useMemo(() => sanitizeClips(idleGltf.animations), [idleGltf.animations]);
  const walkClips = useMemo(() => sanitizeClips(walkGltf.animations), [walkGltf.animations]);
  const runClips = useMemo(() => sanitizeClips(runGltf.animations), [runGltf.animations]);
  const hitClips = useMemo(() => sanitizeClips(hitGltf.animations), [hitGltf.animations]);
  const fightClips = useMemo(() => sanitizeClips(fightGltf.animations), [fightGltf.animations]);
  const deadClips = useMemo(() => sanitizeClips(deadGltf.animations), [deadGltf.animations]);
  const jumpClips = useMemo(() => sanitizeClips(jumpGltf.animations), [jumpGltf.animations]);
  const hiphopClips = useMemo(() => sanitizeClips(hiphopGltf.animations), [hiphopGltf.animations]);
  const gangnamClips = useMemo(() => sanitizeClips(gangnamGltf.animations), [gangnamGltf.animations]);

  const { actions: idleActions } = useAnimations(idleClips, idleScene);
  const { actions: walkActions } = useAnimations(walkClips, walkScene);
  const { actions: runActions } = useAnimations(runClips, runScene);
  const { actions: hitActions } = useAnimations(hitClips, hitScene);
  const { actions: fightActions } = useAnimations(fightClips, fightScene);
  const { actions: deadActions } = useAnimations(deadClips, deadScene);
  const { actions: jumpActions } = useAnimations(jumpClips, jumpScene);
  const { actions: hiphopActions } = useAnimations(hiphopClips, hiphopScene);
  const { actions: gangnamActions } = useAnimations(gangnamClips, gangnamScene);

  useEffect(() => {
    [idleScene, walkScene, runScene, hitScene, fightScene, deadScene, jumpScene, hiphopScene, gangnamScene].forEach(enableMeshShadows);
  }, [idleScene, walkScene, runScene, hitScene, fightScene, deadScene, jumpScene, hiphopScene, gangnamScene]);

  useEffect(() => {
    const playLoop = (actions: Record<string, THREE.AnimationAction | null>) => {
      const name = Object.keys(actions)[0];
      if (!name || !actions[name]) return;
      const action = actions[name]!;
      action.reset();
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.enabled = true;
      action.play();
      return () => { action.stop(); };
    };
    const cleanups = [playLoop(idleActions), playLoop(walkActions), playLoop(runActions), playLoop(jumpActions)];
    return () => cleanups.forEach((cleanup) => cleanup?.());
  }, [idleActions, walkActions, runActions, jumpActions]);

  useEffect(() => {
    const name = Object.keys(deadActions)[0];
    if (!name || !deadActions[name]) return;
    const action = deadActions[name]!;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.enabled = true;
    action.play();
    action.paused = true;
    return () => { action.stop(); };
  }, [deadActions]);

  const setRenderFromState = useCallback((state: RemoteState) => {
    setRenderState((prev) => (prev === state ? prev : state));
  }, []);

  useEffect(() => {
    setRenderFromState('idle');
  }, [setRenderFromState]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const isDead = health <= 0;

    if (isDead && stateRef.current !== 'dead') {
      stateRef.current = 'dead';
      setRenderFromState('dead');
      const name = Object.keys(deadActions)[0];
      if (name && deadActions[name]) {
        deadActions[name]!.reset();
        deadActions[name]!.paused = false;
        deadActions[name]!.play();
      }
      prevHealthRef.current = health;
      return;
    }
    if (isDead) return;

    const healthDrop = prevHealthRef.current - health;
    if (healthDrop >= 1 && stateRef.current !== 'hit' && stateRef.current !== 'fight' && stateRef.current !== 'dead') {
      stateRef.current = 'hit';
      hitTimerRef.current = 0;
      setRenderFromState('hit');
      const name = Object.keys(hitActions)[0];
      if (name && hitActions[name]) {
        hitActions[name]!.reset();
        hitActions[name]!.play();
      }
    }
    prevHealthRef.current = health;

    if (stateRef.current === 'hit') {
      hitTimerRef.current += dt;
      if (hitTimerRef.current > 0.8) {
        stateRef.current = 'idle';
        setRenderFromState('idle');
      }
      return;
    }

    if (attackAnim > 0 && prevAttackRef.current === 0 && stateRef.current !== 'fight') {
      stateRef.current = 'fight';
      fightTimerRef.current = 0;
      setRenderFromState('fight');
      const name = Object.keys(fightActions)[0];
      if (name && fightActions[name]) {
        fightActions[name]!.reset();
        fightActions[name]!.play();
      }
    }
    prevAttackRef.current = attackAnim;

    if (stateRef.current === 'fight') {
      fightTimerRef.current += dt;
      if (fightTimerRef.current > 0.6) {
        stateRef.current = 'idle';
        setRenderFromState('idle');
      }
      return;
    }

    if (emote && emote !== prevEmoteRef.current) {
      if (emote === 'hiphop') {
        stateRef.current = 'emote_hiphop';
        emoteTimerRef.current = 0;
        setRenderFromState('emote_hiphop');
        const name = Object.keys(hiphopActions)[0];
        if (name && hiphopActions[name]) {
          hiphopActions[name]!.reset();
          hiphopActions[name]!.setLoop(THREE.LoopOnce, 1);
          hiphopActions[name]!.clampWhenFinished = true;
          hiphopActions[name]!.play();
        }
      } else if (emote === 'gangnam') {
        stateRef.current = 'emote_gangnam';
        emoteTimerRef.current = 0;
        setRenderFromState('emote_gangnam');
        const name = Object.keys(gangnamActions)[0];
        if (name && gangnamActions[name]) {
          gangnamActions[name]!.reset();
          gangnamActions[name]!.setLoop(THREE.LoopOnce, 1);
          gangnamActions[name]!.clampWhenFinished = true;
          gangnamActions[name]!.play();
        }
      }
    }
    prevEmoteRef.current = emote;

    if (stateRef.current === 'emote_hiphop' || stateRef.current === 'emote_gangnam') {
      emoteTimerRef.current += dt;
      if (!emote || emoteTimerRef.current > 8) {
        stateRef.current = 'idle';
        setRenderFromState('idle');
      }
      return;
    }

    if (!isGrounded && stateRef.current !== 'jump') {
      stateRef.current = 'jump';
      setRenderFromState('jump');
      return;
    }

    let target: RemoteState = 'idle';
    if (!isGrounded) {
      target = 'jump';
    } else if (moveSpeed > 0.07) {
      target = isRunning || moveSpeed > 0.7 ? 'run' : 'walk';
    }

    if (target !== stateRef.current) {
      stateRef.current = target;
      setRenderFromState(target);
    }
  });

  const targetHeight = useMemo(() => {
    const h = getSceneHeight(idleScene);
    console.log('[RemoteChillhouse] targetHeight from idle scene:', h);
    return h;
  }, [idleScene]);

  const idleNorm = useMemo(() => {
    const norm = buildModelNormalization(idleScene, targetHeight, 0);
    return norm;
  }, [idleScene, targetHeight]);
  const walkNorm = useMemo(() => buildModelNormalization(walkScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset), [walkScene, targetHeight, idleNorm]);
  const runNorm = useMemo(() => buildModelNormalization(runScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset), [runScene, targetHeight, idleNorm]);
  const hitNorm = useMemo(() => buildModelNormalization(hitScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset), [hitScene, targetHeight, idleNorm]);
  const fightNorm = useMemo(() => buildModelNormalization(fightScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset), [fightScene, targetHeight, idleNorm]);
  const deadNorm = useMemo(() => buildModelNormalization(deadScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset), [deadScene, targetHeight, idleNorm]);
  const jumpNorm = useMemo(() => buildModelNormalization(jumpScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset), [jumpScene, targetHeight, idleNorm]);
  const hiphopNorm = useMemo(() => buildModelNormalization(hiphopScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset), [hiphopScene, targetHeight, idleNorm]);
  const gangnamNorm = useMemo(() => buildModelNormalization(gangnamScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset), [gangnamScene, targetHeight, idleNorm]);

  const activeScene = useMemo(() => {
    switch (renderState) {
      case 'walk': return walkScene;
      case 'run': return runScene;
      case 'jump': return jumpScene;
      case 'fight': return fightScene;
      case 'hit': return hitScene;
      case 'dead': return deadScene;
      case 'emote_hiphop': return hiphopScene;
      case 'emote_gangnam': return gangnamScene;
      default: return idleScene;
    }
  }, [renderState, idleScene, walkScene, runScene, jumpScene, fightScene, hitScene, deadScene, hiphopScene, gangnamScene]);

  const activeNorm: ModelNormalization = useMemo(() => {
    switch (renderState) {
      case 'walk': return walkNorm;
      case 'run': return runNorm;
      case 'jump': return jumpNorm;
      case 'fight': return fightNorm;
      case 'hit': return hitNorm;
      case 'dead': return deadNorm;
      case 'emote_hiphop': return hiphopNorm;
      case 'emote_gangnam': return gangnamNorm;
      default: return idleNorm;
    }
  }, [renderState, idleNorm, walkNorm, runNorm, jumpNorm, fightNorm, hitNorm, deadNorm, hiphopNorm, gangnamNorm]);

  return (
    <group>
      <group rotation={[0, activeNorm.yawCorrection, 0]}>
        <group scale={[activeNorm.scale, activeNorm.scale, activeNorm.scale]}>
          <group position={activeNorm.modelAnchorOffset}>
            <primitive key={renderState} object={activeScene} dispose={null} />
          </group>
        </group>
      </group>
    </group>
  );
}
