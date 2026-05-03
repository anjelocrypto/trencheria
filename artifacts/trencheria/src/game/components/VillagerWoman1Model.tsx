/**
 * VillagerWoman1Model — GLB-based female NPC villager with walking/standing animation cycling.
 * Same behavior pattern as VillagerMan1Model.
 */
import { useRef, useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinnedScene } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { getTerrainHeight } from './Terrain';
import { resolveCollision } from '../systems/CollisionSystem';

import walkingUrl from '@/assets/villagerwomen1walking.glb';
import standingUrl from '@/assets/villagerwomen1standing.glb';

export { type VillagerMan1Def as VillagerWoman1Def } from './VillagerMan1Model';

const CULL_DISTANCE_SQ = 80 * 80;
const TARGET_HEIGHT = 1.8;
const CROSSFADE_DURATION = 0.4;

function cloneAndNormalize(scene: THREE.Group): THREE.Group {
  const cloned = cloneSkinnedScene(scene) as THREE.Group;
  cloned.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const normMat = (mat: THREE.Material) => {
      const c = mat.clone();
      if (c instanceof THREE.MeshStandardMaterial || c instanceof THREE.MeshPhysicalMaterial) {
        c.emissive.set(0x000000);
        c.emissiveIntensity = 0;
        c.metalness = Math.min(c.metalness, 0.2);
        c.roughness = Math.max(c.roughness, 0.35);
      }
      return c;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(normMat) : normMat(mesh.material);
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
      (mesh as THREE.SkinnedMesh).frustumCulled = false;
    }
    mesh.castShadow = false;
    mesh.receiveShadow = true;
  });
  cloned.updateMatrixWorld(true);
  return cloned;
}

function getSceneHeight(scene: THREE.Object3D): number {
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  const size = bounds.getSize(new THREE.Vector3());
  return Number.isFinite(size.y) && size.y > 0.001 ? size.y : 1;
}

function getFootY(scene: THREE.Object3D): number {
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  return Number.isFinite(bounds.min.y) ? bounds.min.y : 0;
}

interface Props {
  def: { id: string; homePos: [number, number, number]; patrolRadius: number; patrolSpeed: number; facingAngle: number; standDuration?: number; walkDuration?: number };
  playerPos: THREE.Vector3 | null;
}

export function VillagerWoman1Model({ def, playerPos }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Group>(null);

  const walkGltf = useGLTF(walkingUrl);
  const standGltf = useGLTF(standingUrl);

  const patrolAngleRef = useRef(def.facingAngle);
  const facingRef = useRef(def.facingAngle);
  const phaseTimeRef = useRef(0);
  const [phase, setPhase] = useState<'standing' | 'walking'>('standing');

  const standDuration = def.standDuration ?? 45 + Math.random() * 30;
  const walkDuration = def.walkDuration ?? 30 + Math.random() * 30;

  const { walkScene, standScene, scale, walkFootY, standFootY } = useMemo(() => {
    const ws = cloneAndNormalize(walkGltf.scene as THREE.Group);
    const ss = cloneAndNormalize(standGltf.scene as THREE.Group);
    const wh = getSceneHeight(ws);
    const sh = getSceneHeight(ss);
    const avgH = (wh + sh) / 2;
    const s = avgH > 0.01 ? TARGET_HEIGHT / avgH : 1;
    return {
      walkScene: ws, standScene: ss,
      scale: THREE.MathUtils.clamp(s, 0.1, 3),
      walkFootY: getFootY(ws), standFootY: getFootY(ss),
    };
  }, [walkGltf.scene, standGltf.scene]);

  const walkMixer = useMemo(() => new THREE.AnimationMixer(walkScene), [walkScene]);
  const standMixer = useMemo(() => new THREE.AnimationMixer(standScene), [standScene]);

  const walkAction = useMemo(() => {
    if (walkGltf.animations.length === 0) return null;
    const filtered = walkGltf.animations[0].clone();
    filtered.tracks = filtered.tracks.filter(t => {
      if (!t.name.endsWith('.position')) return true;
      const target = t.name.slice(0, t.name.lastIndexOf('.'));
      return !/(hips|pelvis|root|armature)/i.test(target);
    });
    return walkMixer.clipAction(filtered);
  }, [walkGltf.animations, walkMixer]);

  const standAction = useMemo(() => {
    if (standGltf.animations.length === 0) return null;
    const filtered = standGltf.animations[0].clone();
    filtered.tracks = filtered.tracks.filter(t => {
      if (!t.name.endsWith('.position')) return true;
      const target = t.name.slice(0, t.name.lastIndexOf('.'));
      return !/(hips|pelvis|root|armature)/i.test(target);
    });
    return standMixer.clipAction(filtered);
  }, [standGltf.animations, standMixer]);

  useEffect(() => {
    if (standAction) standAction.reset().setLoop(THREE.LoopRepeat, Infinity).play();
    if (walkAction) { walkAction.reset().setLoop(THREE.LoopRepeat, Infinity).play(); walkAction.setEffectiveWeight(0); }
  }, [standAction, walkAction]);

  const prevPosRef = useRef<[number, number]>([
    def.homePos[0] + Math.cos(def.facingAngle) * def.patrolRadius,
    def.homePos[2] + Math.sin(def.facingAngle) * def.patrolRadius,
  ]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const dt = Math.min(delta, 0.05);

    if (playerPos) {
      const dx = playerPos.x - groupRef.current.position.x;
      const dz = playerPos.z - groupRef.current.position.z;
      if (dx * dx + dz * dz > CULL_DISTANCE_SQ) { groupRef.current.visible = false; return; }
      groupRef.current.visible = true;
    }

    phaseTimeRef.current += dt;
    const currentPhaseDuration = phase === 'standing' ? standDuration : walkDuration;
    if (phaseTimeRef.current >= currentPhaseDuration) {
      phaseTimeRef.current = 0;
      const newPhase = phase === 'standing' ? 'walking' : 'standing';
      setPhase(newPhase);
      if (newPhase === 'walking') {
        walkAction?.reset().setEffectiveWeight(1).fadeIn(CROSSFADE_DURATION).play();
        standAction?.fadeOut(CROSSFADE_DURATION);
      } else {
        standAction?.reset().setEffectiveWeight(1).fadeIn(CROSSFADE_DURATION).play();
        walkAction?.fadeOut(CROSSFADE_DURATION);
      }
    }

    let tx: number, tz: number;
    if (phase === 'walking') {
      patrolAngleRef.current += dt * def.patrolSpeed * 0.3;
      tx = def.homePos[0] + Math.cos(patrolAngleRef.current) * def.patrolRadius;
      tz = def.homePos[2] + Math.sin(patrolAngleRef.current) * def.patrolRadius;
      const dx = tx - prevPosRef.current[0];
      const dz = tz - prevPosRef.current[1];
      if (dx * dx + dz * dz > 1e-8) {
        const targetAngle = Math.atan2(dx, dz);
        let angleDiff = targetAngle - facingRef.current;
        angleDiff = angleDiff - Math.PI * 2 * Math.round(angleDiff / (Math.PI * 2));
        facingRef.current += angleDiff * Math.min(1, dt * 5);
      }
      prevPosRef.current[0] = tx;
      prevPosRef.current[1] = tz;
    } else {
      const pa = patrolAngleRef.current;
      tx = def.homePos[0] + Math.cos(pa) * def.patrolRadius;
      tz = def.homePos[2] + Math.sin(pa) * def.patrolRadius;
    }

    // Resolve collision with buildings
    const resolved = resolveCollision(tx, tz, 0.5);
    tx = resolved.x;
    tz = resolved.z;

    const ty = getTerrainHeight(tx, tz);
    groupRef.current.position.set(tx, ty, tz);
    groupRef.current.rotation.y = facingRef.current;

    walkMixer.update(dt);
    standMixer.update(dt);
    walkScene.visible = phase === 'walking';
    standScene.visible = phase === 'standing';
  });

  const footY = (walkFootY + standFootY) / 2;

  return (
    <group ref={groupRef} position={def.homePos} rotation={[0, def.facingAngle, 0]}>
      <group ref={innerRef} scale={[scale, scale, scale]} position={[0, -footY * scale, 0]}>
        <primitive object={walkScene} />
        <primitive object={standScene} />
      </group>
    </group>
  );
}
