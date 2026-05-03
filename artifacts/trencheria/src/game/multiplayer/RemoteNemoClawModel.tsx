import { devLog, devWarn } from '../utils/devLog';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import nemoStandingUrl from '@/assets/nemostanding.glb?url';
import nemoWalkingUrl from '@/assets/nemowalking.glb?url';
import nemoRunningUrl from '@/assets/nemorunning.glb?url';
import nemoGetHitUrl from '@/assets/nemogethit.glb?url';
import nemoFightUrl from '@/assets/nemofight.glb?url';
import nemoJumpUrl from '@/assets/nemojump.glb?url';
import nemoDance1Url from '@/assets/nemodance1.glb?url';
import nemoDance2Url from '@/assets/nemodance2.glb?url';
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

type RemoteState = 'idle' | 'walk' | 'run' | 'jump' | 'fight' | 'hit' | 'emote_dance1' | 'emote_dance2';

export function RemoteNemoClawModel({ moveSpeed, isRunning, isGrounded, attackAnim, health, emote }: Props) {
  const idleGltf = useGLTF(nemoStandingUrl);
  const walkGltf = useGLTF(nemoWalkingUrl);
  const runGltf = useGLTF(nemoRunningUrl);
  const hitGltf = useGLTF(nemoGetHitUrl);
  const fightGltf = useGLTF(nemoFightUrl);
  const jumpGltf = useGLTF(nemoJumpUrl);
  const dance1Gltf = useGLTF(nemoDance1Url);
  const dance2Gltf = useGLTF(nemoDance2Url);

  const idleScene = useMemo(() => cloneScene(idleGltf.scene), [idleGltf.scene]);
  const walkScene = useMemo(() => cloneScene(walkGltf.scene), [walkGltf.scene]);
  const runScene = useMemo(() => cloneScene(runGltf.scene), [runGltf.scene]);
  const hitScene = useMemo(() => cloneScene(hitGltf.scene), [hitGltf.scene]);
  const fightScene = useMemo(() => cloneScene(fightGltf.scene), [fightGltf.scene]);
  const jumpScene = useMemo(() => cloneScene(jumpGltf.scene), [jumpGltf.scene]);
  const dance1Scene = useMemo(() => cloneScene(dance1Gltf.scene), [dance1Gltf.scene]);
  const dance2Scene = useMemo(() => cloneScene(dance2Gltf.scene), [dance2Gltf.scene]);

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
  const jumpClips = useMemo(() => sanitizeClips(jumpGltf.animations), [jumpGltf.animations]);
  const dance1Clips = useMemo(() => sanitizeClips(dance1Gltf.animations), [dance1Gltf.animations]);
  const dance2Clips = useMemo(() => sanitizeClips(dance2Gltf.animations), [dance2Gltf.animations]);

  const { actions: idleActions } = useAnimations(idleClips, idleScene);
  const { actions: walkActions } = useAnimations(walkClips, walkScene);
  const { actions: runActions } = useAnimations(runClips, runScene);
  const { actions: hitActions } = useAnimations(hitClips, hitScene);
  const { actions: fightActions } = useAnimations(fightClips, fightScene);
  const { actions: jumpActions } = useAnimations(jumpClips, jumpScene);
  const { actions: dance1Actions } = useAnimations(dance1Clips, dance1Scene);
  const { actions: dance2Actions } = useAnimations(dance2Clips, dance2Scene);

  useEffect(() => {
    [idleScene, walkScene, runScene, hitScene, fightScene, jumpScene, dance1Scene, dance2Scene].forEach(enableMeshShadows);
  }, [idleScene, walkScene, runScene, hitScene, fightScene, jumpScene, dance1Scene, dance2Scene]);

  useEffect(() => {
    const playLoop = (actions: Record<string, THREE.AnimationAction | null>) => {
      const name = Object.keys(actions)[0];
      if (!name || !actions[name]) return;
      const action = actions[name]!;
      action.reset(); action.setLoop(THREE.LoopRepeat, Infinity); action.enabled = true; action.play();
      return () => { action.stop(); };
    };
    const cleanups = [playLoop(idleActions), playLoop(walkActions), playLoop(runActions), playLoop(jumpActions)];
    return () => cleanups.forEach((c) => c?.());
  }, [idleActions, walkActions, runActions, jumpActions]);

  const setRenderFromState = useCallback((state: RemoteState) => {
    setRenderState((prev) => (prev === state ? prev : state));
  }, []);

  useEffect(() => { setRenderFromState('idle'); }, [setRenderFromState]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);

    // Hit detection
    // Hit detection — only trigger on significant HP drops (combat hits, not float drift)
    const healthDrop = prevHealthRef.current - health;
    if (healthDrop >= 1 && stateRef.current !== 'hit' && stateRef.current !== 'fight') {
      stateRef.current = 'hit'; hitTimerRef.current = 0; setRenderFromState('hit');
      const name = Object.keys(hitActions)[0];
      if (name && hitActions[name]) { hitActions[name]!.reset(); hitActions[name]!.play(); }
    }
    prevHealthRef.current = health;

    if (stateRef.current === 'hit') {
      hitTimerRef.current += dt;
      if (hitTimerRef.current > 0.8) { stateRef.current = 'idle'; setRenderFromState('idle'); }
      return;
    }

    // Fight
    if (attackAnim > 0 && prevAttackRef.current === 0 && stateRef.current !== 'fight') {
      stateRef.current = 'fight'; fightTimerRef.current = 0; setRenderFromState('fight');
      const name = Object.keys(fightActions)[0];
      if (name && fightActions[name]) { fightActions[name]!.reset(); fightActions[name]!.play(); }
    }
    prevAttackRef.current = attackAnim;

    if (stateRef.current === 'fight') {
      fightTimerRef.current += dt;
      if (fightTimerRef.current > 0.6) { stateRef.current = 'idle'; setRenderFromState('idle'); }
      return;
    }

    // Emotes
    if (emote && emote !== prevEmoteRef.current) {
      if (emote === 'nemodance1') {
        stateRef.current = 'emote_dance1'; emoteTimerRef.current = 0; setRenderFromState('emote_dance1');
        const name = Object.keys(dance1Actions)[0];
        if (name && dance1Actions[name]) { dance1Actions[name]!.reset(); dance1Actions[name]!.setLoop(THREE.LoopOnce, 1); dance1Actions[name]!.clampWhenFinished = true; dance1Actions[name]!.play(); }
      } else if (emote === 'nemodance2') {
        stateRef.current = 'emote_dance2'; emoteTimerRef.current = 0; setRenderFromState('emote_dance2');
        const name = Object.keys(dance2Actions)[0];
        if (name && dance2Actions[name]) { dance2Actions[name]!.reset(); dance2Actions[name]!.setLoop(THREE.LoopOnce, 1); dance2Actions[name]!.clampWhenFinished = true; dance2Actions[name]!.play(); }
      }
    }
    prevEmoteRef.current = emote;

    if (stateRef.current === 'emote_dance1' || stateRef.current === 'emote_dance2') {
      emoteTimerRef.current += dt;
      if (!emote || emoteTimerRef.current > 8) { stateRef.current = 'idle'; setRenderFromState('idle'); }
      return;
    }

    // Jump
    if (!isGrounded && stateRef.current !== 'jump') {
      stateRef.current = 'jump'; setRenderFromState('jump'); return;
    }

    let target: RemoteState = 'idle';
    if (!isGrounded) { target = 'jump'; }
    else if (moveSpeed > 0.07) { target = isRunning || moveSpeed > 0.7 ? 'run' : 'walk'; }

    if (target !== stateRef.current) { stateRef.current = target; setRenderFromState(target); }
  });

  const targetHeight = useMemo(() => {
    const h = getSceneHeight(idleScene);
    devLog('[RemoteNemoClaw] targetHeight from idle scene:', h);
    return h;
  }, [idleScene]);

  const idleNorm = useMemo(() => buildModelNormalization(idleScene, targetHeight, 0), [idleScene, targetHeight]);
  const walkNorm = useMemo(() => buildModelNormalization(walkScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset), [walkScene, targetHeight, idleNorm]);
  const runNorm = useMemo(() => buildModelNormalization(runScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset), [runScene, targetHeight, idleNorm]);
  const hitNorm = useMemo(() => buildModelNormalization(hitScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset), [hitScene, targetHeight, idleNorm]);
  const fightNorm = useMemo(() => buildModelNormalization(fightScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset), [fightScene, targetHeight, idleNorm]);
  const jumpNorm = useMemo(() => buildModelNormalization(jumpScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset), [jumpScene, targetHeight, idleNorm]);
  const dance1Norm = useMemo(() => buildModelNormalization(dance1Scene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset), [dance1Scene, targetHeight, idleNorm]);
  const dance2Norm = useMemo(() => buildModelNormalization(dance2Scene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset), [dance2Scene, targetHeight, idleNorm]);

  const activeScene = useMemo(() => {
    switch (renderState) {
      case 'walk': return walkScene;
      case 'run': return runScene;
      case 'jump': return jumpScene;
      case 'fight': return fightScene;
      case 'hit': return hitScene;
      case 'emote_dance1': return dance1Scene;
      case 'emote_dance2': return dance2Scene;
      default: return idleScene;
    }
  }, [renderState, idleScene, walkScene, runScene, jumpScene, fightScene, hitScene, dance1Scene, dance2Scene]);

  const activeNorm: ModelNormalization = useMemo(() => {
    switch (renderState) {
      case 'walk': return walkNorm;
      case 'run': return runNorm;
      case 'jump': return jumpNorm;
      case 'fight': return fightNorm;
      case 'hit': return hitNorm;
      case 'emote_dance1': return dance1Norm;
      case 'emote_dance2': return dance2Norm;
      default: return idleNorm;
    }
  }, [renderState, idleNorm, walkNorm, runNorm, jumpNorm, fightNorm, hitNorm, dance1Norm, dance2Norm]);

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
