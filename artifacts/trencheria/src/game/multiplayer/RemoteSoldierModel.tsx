import { devLog, devWarn } from '../utils/devLog';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import standingUrl from '@/assets/standing.glb?url';
import soldierWalkUrl from '@/assets/soldierwalking.glb?url';
import runUrl from '@/assets/run.glb?url';
import gethitUrl from '@/assets/gethit.glb?url';
import fightUrl from '@/assets/fight.glb?url';
import jumpUrl from '@/assets/jump.glb?url';
import waveUrl from '@/assets/wave.glb?url';
import agreeUrl from '@/assets/agreegesture.glb?url';
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

type RemoteState = 'idle' | 'walk' | 'run' | 'jump' | 'fight' | 'hit' | 'dead' | 'emote_wave' | 'emote_agree';

// Target height derived from idle scene's native height — matches local soldier canonicalHeight

export function RemoteSoldierModel({ moveSpeed, isRunning, isGrounded, attackAnim, health, emote }: Props) {
  const idleGltf = useGLTF(standingUrl);
  const walkGltf = useGLTF(soldierWalkUrl);
  const runGltf = useGLTF(runUrl);
  const hitGltf = useGLTF(gethitUrl);
  const fightGltf = useGLTF(fightUrl);
  const jumpGltf = useGLTF(jumpUrl);
  const waveGltf = useGLTF(waveUrl);
  const agreeGltf = useGLTF(agreeUrl);

  const idleScene = useMemo(() => cloneScene(idleGltf.scene), [idleGltf.scene]);
  const walkScene = useMemo(() => cloneScene(walkGltf.scene), [walkGltf.scene]);
  const runScene = useMemo(() => cloneScene(runGltf.scene), [runGltf.scene]);
  const hitScene = useMemo(() => cloneScene(hitGltf.scene), [hitGltf.scene]);
  const fightScene = useMemo(() => cloneScene(fightGltf.scene), [fightGltf.scene]);
  const jumpScene = useMemo(() => cloneScene(jumpGltf.scene), [jumpGltf.scene]);
  const waveScene = useMemo(() => cloneScene(waveGltf.scene), [waveGltf.scene]);
  const agreeScene = useMemo(() => cloneScene(agreeGltf.scene), [agreeGltf.scene]);

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
  const waveClips = useMemo(() => sanitizeClips(waveGltf.animations), [waveGltf.animations]);
  const agreeClips = useMemo(() => sanitizeClips(agreeGltf.animations), [agreeGltf.animations]);

  const { actions: idleActions } = useAnimations(idleClips, idleScene);
  const { actions: walkActions } = useAnimations(walkClips, walkScene);
  const { actions: runActions } = useAnimations(runClips, runScene);
  const { actions: hitActions } = useAnimations(hitClips, hitScene);
  const { actions: fightActions } = useAnimations(fightClips, fightScene);
  const { actions: jumpActions } = useAnimations(jumpClips, jumpScene);
  const { actions: waveActions } = useAnimations(waveClips, waveScene);
  const { actions: agreeActions } = useAnimations(agreeClips, agreeScene);

  useEffect(() => {
    [idleScene, walkScene, runScene, hitScene, fightScene, jumpScene, waveScene, agreeScene].forEach(enableMeshShadows);
  }, [idleScene, walkScene, runScene, hitScene, fightScene, jumpScene, waveScene, agreeScene]);

  useEffect(() => {
    const playLoop = (actions: Record<string, THREE.AnimationAction | null>) => {
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
    };

    const cleanups = [playLoop(idleActions), playLoop(walkActions), playLoop(runActions), playLoop(jumpActions)];
    return () => cleanups.forEach((cleanup) => cleanup?.());
  }, [idleActions, walkActions, runActions, jumpActions]);

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
      if (hitTimerRef.current > 0.6) {
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
      if (emote === 'wave') {
        stateRef.current = 'emote_wave';
        emoteTimerRef.current = 0;
        setRenderFromState('emote_wave');
        const name = Object.keys(waveActions)[0];
        if (name && waveActions[name]) {
          waveActions[name]!.reset();
          waveActions[name]!.setLoop(THREE.LoopOnce, 1);
          waveActions[name]!.clampWhenFinished = true;
          waveActions[name]!.play();
        }
      } else if (emote === 'agree') {
        stateRef.current = 'emote_agree';
        emoteTimerRef.current = 0;
        setRenderFromState('emote_agree');
        const name = Object.keys(agreeActions)[0];
        if (name && agreeActions[name]) {
          agreeActions[name]!.reset();
          agreeActions[name]!.setLoop(THREE.LoopOnce, 1);
          agreeActions[name]!.clampWhenFinished = true;
          agreeActions[name]!.play();
        }
      }
    }
    prevEmoteRef.current = emote;

    if (stateRef.current === 'emote_wave' || stateRef.current === 'emote_agree') {
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
    devLog('[RemoteSoldier] targetHeight from idle scene:', h);
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
  const fightNorm = useMemo(
    () => buildModelNormalization(fightScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset),
    [fightScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset],
  );
  const jumpNorm = useMemo(
    () => buildModelNormalization(jumpScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset),
    [jumpScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset],
  );
  const waveNorm = useMemo(
    () => buildModelNormalization(waveScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset),
    [waveScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset],
  );
  const agreeNorm = useMemo(
    () => buildModelNormalization(agreeScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset),
    [agreeScene, targetHeight, idleNorm.yawCorrection, idleNorm.scale, idleNorm.modelAnchorOffset],
  );

  const activeScene = useMemo(() => {
    switch (renderState) {
      case 'walk': return walkScene;
      case 'run': return runScene;
      case 'jump': return jumpScene;
      case 'fight': return fightScene;
      case 'hit': return hitScene;
      case 'emote_wave': return waveScene;
      case 'emote_agree': return agreeScene;
      case 'dead':
      case 'idle':
      default:
        return idleScene;
    }
  }, [renderState, idleScene, walkScene, runScene, jumpScene, fightScene, hitScene, waveScene, agreeScene]);

  const activeNorm: ModelNormalization = useMemo(() => {
    switch (renderState) {
      case 'walk': return walkNorm;
      case 'run': return runNorm;
      case 'jump': return jumpNorm;
      case 'fight': return fightNorm;
      case 'hit': return hitNorm;
      case 'emote_wave': return waveNorm;
      case 'emote_agree': return agreeNorm;
      case 'dead':
      case 'idle':
      default:
        return idleNorm;
    }
  }, [renderState, idleNorm, walkNorm, runNorm, jumpNorm, fightNorm, hitNorm, waveNorm, agreeNorm]);

  return (
    <group>
      {renderState === 'dead' ? (
        <group>
          <mesh position={[0, 0.15, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <boxGeometry args={[0.5, 1.6, 0.3]} />
            <meshLambertMaterial color="#3a5a8a" />
          </mesh>
        </group>
      ) : (
        <group rotation={[0, activeNorm.yawCorrection, 0]}>
          <group scale={[activeNorm.scale, activeNorm.scale, activeNorm.scale]}>
            <group position={activeNorm.modelAnchorOffset}>
              <primitive key={renderState} object={activeScene} dispose={null} />
            </group>
          </group>
        </group>
      )}
    </group>
  );
}

