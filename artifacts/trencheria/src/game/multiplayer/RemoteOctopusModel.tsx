import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import octopusStandingUrl from '@/assets/octopusstanding.glb?url';
import octopusWalkingUrl from '@/assets/octopuswalking.glb?url';
import octopusRunningUrl from '@/assets/octopusrunning.glb?url';
import octopusJumpUrl from '@/assets/octopusjump.glb?url';
import octopusGetHitUrl from '@/assets/octopusgethit.glb?url';
import octopusDieUrl from '@/assets/octopusdie.glb?url';
import octopusDanceUrl from '@/assets/octopusdance.glb?url';
import octopusKickUrl from '@/assets/octopuskick.glb?url';
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

type RemoteState = 'idle' | 'walk' | 'run' | 'jump' | 'fight' | 'hit' | 'dead' | 'emote_dance';

export function RemoteOctopusModel({ moveSpeed, isRunning, isGrounded, attackAnim, health, emote }: Props) {
  const standGltf = useGLTF(octopusStandingUrl);
  const walkGltf = useGLTF(octopusWalkingUrl);
  const runGltf = useGLTF(octopusRunningUrl);
  const jumpGltf = useGLTF(octopusJumpUrl);
  const hitGltf = useGLTF(octopusGetHitUrl);
  const deadGltf = useGLTF(octopusDieUrl);
  const danceGltf = useGLTF(octopusDanceUrl);
  const fightGltf = useGLTF(octopusKickUrl);

  const idleScene = useMemo(() => cloneScene(standGltf.scene), [standGltf.scene]);
  const walkScene = useMemo(() => cloneScene(walkGltf.scene), [walkGltf.scene]);
  const runScene = useMemo(() => cloneScene(runGltf.scene), [runGltf.scene]);
  const jumpScene = useMemo(() => cloneScene(jumpGltf.scene), [jumpGltf.scene]);
  const hitScene = useMemo(() => cloneScene(hitGltf.scene), [hitGltf.scene]);
  const deadScene = useMemo(() => cloneScene(deadGltf.scene), [deadGltf.scene]);
  const danceScene = useMemo(() => cloneScene(danceGltf.scene), [danceGltf.scene]);
  const fightScene = useMemo(() => cloneScene(fightGltf.scene), [fightGltf.scene]);

  const stateRef = useRef<RemoteState>('idle');
  const [renderState, setRenderState] = useState<RemoteState>('idle');
  const prevHealthRef = useRef(health);
  const hitTimerRef = useRef(0);
  const fightTimerRef = useRef(0);
  const prevAttackRef = useRef(0);
  const emoteTimerRef = useRef(0);
  const prevEmoteRef = useRef<string | null>(null);

  const idleClips = useMemo(() => sanitizeClips(standGltf.animations), [standGltf.animations]);
  const walkClips = useMemo(() => sanitizeClips(walkGltf.animations), [walkGltf.animations]);
  const runClips = useMemo(() => sanitizeClips(runGltf.animations), [runGltf.animations]);
  const jumpClips = useMemo(() => sanitizeClips(jumpGltf.animations), [jumpGltf.animations]);
  const hitClips = useMemo(() => sanitizeClips(hitGltf.animations), [hitGltf.animations]);
  const deadClips = useMemo(() => sanitizeClips(deadGltf.animations), [deadGltf.animations]);
  const danceClips = useMemo(() => sanitizeClips(danceGltf.animations), [danceGltf.animations]);
  const fightClips = useMemo(() => sanitizeClips(fightGltf.animations), [fightGltf.animations]);

  const { actions: idleActions } = useAnimations(idleClips, idleScene);
  const { actions: walkActions } = useAnimations(walkClips, walkScene);
  const { actions: runActions } = useAnimations(runClips, runScene);
  const { actions: jumpActions } = useAnimations(jumpClips, jumpScene);
  const { actions: hitActions } = useAnimations(hitClips, hitScene);
  const { actions: deadActions } = useAnimations(deadClips, deadScene);
  const { actions: danceActions } = useAnimations(danceClips, danceScene);
  const { actions: fightActions } = useAnimations(fightClips, fightScene);

  useEffect(() => {
    [idleScene, walkScene, runScene, jumpScene, hitScene, fightScene, deadScene, danceScene].forEach(enableMeshShadows);
  }, [idleScene, walkScene, runScene, jumpScene, hitScene, fightScene, deadScene, danceScene]);

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

    // Hit detection — only trigger on significant HP drops (combat hits, not float drift)
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

    // ===== FIGHT =====
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
      if (emote === 'octopusdance') {
        stateRef.current = 'emote_dance';
        emoteTimerRef.current = 0;
        setRenderFromState('emote_dance');
        const name = Object.keys(danceActions)[0];
        if (name && danceActions[name]) {
          danceActions[name]!.reset();
          danceActions[name]!.setLoop(THREE.LoopOnce, 1);
          danceActions[name]!.clampWhenFinished = true;
          danceActions[name]!.play();
        }
      }
    }
    prevEmoteRef.current = emote;

    if (stateRef.current === 'emote_dance') {
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
    return h;
  }, [idleScene]);

  const idleNorm = useMemo(() => buildModelNormalization(idleScene, targetHeight, 0), [idleScene, targetHeight]);
  const walkNorm = useMemo(
    () => buildModelNormalization(walkScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset),
    [walkScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset],
  );
  const runNorm = useMemo(
    () => buildModelNormalization(runScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset),
    [runScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset],
  );
  const hitNorm = useMemo(
    () => buildModelNormalization(hitScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset),
    [hitScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset],
  );
  const deadNorm = useMemo(
    () => buildModelNormalization(deadScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset),
    [deadScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset],
  );
  const jumpNorm = useMemo(
    () => buildModelNormalization(jumpScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset),
    [jumpScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset],
  );
  const danceNorm = useMemo(
    () => buildModelNormalization(danceScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset),
    [danceScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset],
  );
  const fightNorm = useMemo(
    () => buildModelNormalization(fightScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset),
    [fightScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset],
  );

  const activeScene = useMemo(() => {
    switch (renderState) {
      case 'walk': return walkScene;
      case 'run': return runScene;
      case 'jump': return jumpScene;
      case 'fight': return fightScene;
      case 'hit': return hitScene;
      case 'dead': return deadScene;
      case 'emote_dance': return danceScene;
      case 'idle':
      default:
        return idleScene;
    }
  }, [renderState, idleScene, walkScene, runScene, jumpScene, fightScene, hitScene, deadScene, danceScene]);

  const activeNorm: ModelNormalization = useMemo(() => {
    switch (renderState) {
      case 'walk': return walkNorm;
      case 'run': return runNorm;
      case 'jump': return jumpNorm;
      case 'fight': return fightNorm;
      case 'hit': return hitNorm;
      case 'dead': return deadNorm;
      case 'emote_dance': return danceNorm;
      case 'idle':
      default:
        return idleNorm;
    }
  }, [renderState, idleNorm, walkNorm, runNorm, jumpNorm, fightNorm, hitNorm, deadNorm, danceNorm]);

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

