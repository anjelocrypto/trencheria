import { devLog, devWarn } from '../utils/devLog';
/**
 * HorseGLBModel — CLEAN REBUILD
 * Uses exactly 2 GLBs: mainhorsestanding.glb + mainhorsewalking.glb
 * 
 * Architecture:
 * - Both GLBs are loaded, cloned, scaled to same height, and ALWAYS in the scene tree
 * - Visibility is toggled via group.visible (never unmount/remount)
 * - Animation mixers are created once per clone lifetime
 * - Hysteresis prevents flicker between stand/walk
 * - Debug logging on first render to verify assets loaded correctly
 */
import { useRef, useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

import horseStandUrl from '@/assets/mainhorsestanding.glb';
import horseWalkUrl from '@/assets/mainhorsewalking.glb';
import { auditHorseAssets } from './horseModelAudit';
import { clonePreparedHorseScene, stripScaleTracks } from './horseModelUtils';

interface Props {
  moveSpeed: number | React.RefObject<number>;
  scale?: number;
  renderPath?: string;
}

const TARGET_HORSE_HEIGHT = 2.0;
const WALK_START_THRESHOLD = 0.4;
const WALK_STOP_THRESHOLD = 0.15;
const WALK_SCALE_COMPENSATION = 1.12; // boost walk pose to match standing visual mass
const WALK_Y_LIFT = 0.15; // lift horse when walking to prevent feet clipping ground

export function HorseGLBModel({ moveSpeed, scale = 1, renderPath = 'unknown' }: Props) {
  const standGltf = useGLTF(horseStandUrl);
  const walkGltf = useGLTF(horseWalkUrl);
  const loggedRef = useRef(false);
  const horseScene = useMemo(() => clonePreparedHorseScene(standGltf.scene), [standGltf.scene]);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const idleActionRef = useRef<THREE.AnimationAction | null>(null);
  const walkActionRef = useRef<THREE.AnimationAction | null>(null);

  const [isWalking, setIsWalking] = useState(false);
  const isWalkingRef = useRef(false);
  const sceneRef = useRef<THREE.Group>(null);
  const finalScaleRef = useRef(1);

  const metrics = useMemo(() => {
    horseScene.updateMatrixWorld(true);

    const standBox = new THREE.Box3().setFromObject(horseScene);
    const standSize = new THREE.Vector3();
    standBox.getSize(standSize);

    const unifiedScale = standSize.y > 0.001 ? TARGET_HORSE_HEIGHT / standSize.y : 1;
    const audit = auditHorseAssets(
      standGltf.scene,
      walkGltf.scene,
      standGltf.animations,
      walkGltf.animations,
    );

    let standMeshCount = 0;
    let standSkinnedMeshCount = 0;
    horseScene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) standMeshCount += 1;
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) standSkinnedMeshCount += 1;
    });

    return {
      unifiedScale,
      yOffset: -standBox.min.y * unifiedScale,
      standSize: standSize.clone(),
      standMeshCount,
      standSkinnedMeshCount,
      audit,
    };
  }, [horseScene, standGltf.scene, walkGltf.scene, standGltf.animations, walkGltf.animations]);

  const finalScale = metrics.unifiedScale * scale;
  finalScaleRef.current = finalScale;

  useEffect(() => {
    const mixer = new THREE.AnimationMixer(horseScene);
    mixerRef.current = mixer;

    const idleClip = standGltf.animations[0] ? stripScaleTracks(standGltf.animations[0].clone()) : null;
    const walkClip = walkGltf.animations[0] ? stripScaleTracks(walkGltf.animations[0].clone()) : null;

    const idleAction = idleClip ? mixer.clipAction(idleClip) : null;
    const walkAction = walkClip ? mixer.clipAction(walkClip) : null;

    if (idleAction) {
      idleAction.enabled = true;
      idleAction.setLoop(THREE.LoopRepeat, Infinity);
      idleAction.clampWhenFinished = false;
      idleAction.setEffectiveWeight(1);
      idleAction.play();
    }

    if (walkAction) {
      walkAction.enabled = true;
      walkAction.setLoop(THREE.LoopRepeat, Infinity);
      walkAction.clampWhenFinished = false;
      walkAction.setEffectiveWeight(0);
      walkAction.play();
    }

    idleActionRef.current = idleAction;
    walkActionRef.current = walkAction;

    if (!loggedRef.current) {
      loggedRef.current = true;
      devLog(`[HorseGLBModel:${renderPath}] AUDIT`, {
        renderPath,
        strategy: 'single-rig-animation-system',
        standBounds: metrics.audit.stand.bounds,
        walkBounds: metrics.audit.walk.bounds,
        standRootScale: metrics.audit.stand.rootScale,
        walkRootScale: metrics.audit.walk.rootScale,
        standRootBoneScale: metrics.audit.stand.rootBoneScale,
        walkRootBoneScale: metrics.audit.walk.rootBoneScale,
        sameBoneHierarchy: metrics.audit.sameBoneHierarchy,
        walkHasScaleTracks: metrics.audit.walkHasScaleTracks,
        standHasScaleTracks: metrics.audit.standHasScaleTracks,
        standMeshCount: metrics.audit.stand.meshCount,
        walkMeshCount: metrics.audit.walk.meshCount,
        standSkinnedMeshCount: metrics.audit.stand.skinnedMeshCount,
        walkSkinnedMeshCount: metrics.audit.walk.skinnedMeshCount,
        negativeScaleNodes: {
          stand: metrics.audit.stand.negativeScaleNodes,
          walk: metrics.audit.walk.negativeScaleNodes,
        },
      });
    }

    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(horseScene);
      idleActionRef.current = null;
      walkActionRef.current = null;
      mixerRef.current = null;
    };
  }, [horseScene, renderPath, metrics, standGltf.animations, walkGltf.animations]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    mixerRef.current?.update(dt);

    const speed = typeof moveSpeed === 'number' ? moveSpeed : (moveSpeed?.current ?? 0);

    let wantWalk = isWalkingRef.current;
    if (isWalkingRef.current) {
      if (speed < WALK_STOP_THRESHOLD) wantWalk = false;
    } else if (speed > WALK_START_THRESHOLD) {
      wantWalk = true;
    }

    if (wantWalk !== isWalkingRef.current) {
      isWalkingRef.current = wantWalk;
      setIsWalking(wantWalk);
    }

    const idleWeight = wantWalk ? 0 : 1;
    const walkWeight = wantWalk ? 1 : 0;
    if (idleActionRef.current) idleActionRef.current.setEffectiveWeight(idleWeight);
    if (walkActionRef.current) walkActionRef.current.setEffectiveWeight(walkWeight);

    // Compensate for visual crouch in walk animation (wrapper group only)
    if (sceneRef.current) {
      const targetComp = wantWalk ? WALK_SCALE_COMPENSATION : 1;
      const cur = sceneRef.current.scale.x;
      const smoothed = THREE.MathUtils.lerp(cur, targetComp, 1 - Math.exp(-8 * dt));
      sceneRef.current.scale.set(smoothed, smoothed, smoothed);
    }
  });

  const walkLift = isWalking ? WALK_Y_LIFT : 0;

  return (
    <group position={[0, metrics.yOffset * scale + walkLift, 0]}>
      <group ref={sceneRef}>
        <primitive object={horseScene} scale={[finalScale, finalScale, finalScale]} />
      </group>
    </group>
  );
}
