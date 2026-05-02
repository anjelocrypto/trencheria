/**
 * Enemies.tsx — P0 ref-driven enemy system.
 * 
 * Architecture:
 * - Enemy runtime state lives in a mutable Map ref (enemiesRef), NOT React state.
 * - Single useFrame updates all enemy AI, positions, and Three.js transforms.
 * - All alive-state submeshes (jaw, HP bar, aggro indicator) are mounted ONCE
 *   and controlled via .visible and transform mutations. Zero alive-state JSX branches.
 * - Distance culling uses group.visible toggle, NOT mount/unmount (return null).
 * - Dead state uses the same mounted group with ref-driven visual changes.
 * - React only re-renders on spawn/despawn (renderTick).
 * - Zero per-frame allocations: no .map(), no [...spread], no new objects.
 * 
 * This file is the SOLE OWNER of enemy runtime state after P0.
 * GameScene reads via enemiesRef for POI checks only.
 */

import { useRef, useEffect, useState, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EnemyData, ENEMY_ATTACK_COOLDOWN, ENEMY_DESPAWN_TIME, ENEMY_GROUND_OFFSET, generateEnemies } from '../systems/EnemyData';
import { getTerrainHeight } from './Terrain';
import { generateLootDrop } from '../systems/WorldResources';

// ─── Types ───

export interface EnemyRuntime extends EnemyData {
  deathTimer: number;
  animTimer: number;
  staggerX: number;
  staggerZ: number;
  staggerTimer: number;
  atkWindup: number;
}

export interface EnemiesHandle {
  /** Called by Player to damage an enemy. Returns true if enemy died. */
  hitEnemy: (id: string, damage: number) => boolean;
  /** Read-only access to runtime data for Player attack collision */
  getEnemies: () => Map<string, EnemyRuntime>;
}

interface EnemiesProps {
  playerPositionRef: React.RefObject<THREE.Vector3>;
  pendingPlayerDamageRef: React.MutableRefObject<number>;
  onEnemyKill: (enemy: EnemyRuntime) => void;
}

// ─── Shared materials (module-level, allocated once) ───

const banditBodyMat = new THREE.MeshLambertMaterial({ color: '#6b4030' });
const banditHeadMat = new THREE.MeshLambertMaterial({ color: '#c4a070' });
const banditLegMat = new THREE.MeshLambertMaterial({ color: '#3a3020' });
const banditBootMat = new THREE.MeshLambertMaterial({ color: '#2a1a0a' });
const banditWeaponMat = new THREE.MeshLambertMaterial({ color: '#999' });
const wolfBodyMat = new THREE.MeshLambertMaterial({ color: '#5a4a3a' });
const wolfLightMat = new THREE.MeshLambertMaterial({ color: '#7a6a5a' });
const wolfEyeMat = new THREE.MeshBasicMaterial({ color: '#ccaa00' });
const hitMat = new THREE.MeshLambertMaterial({ color: '#ff4444' });
// deadMat is NOT shared — each enemy gets its own instance via deadMatsMap
const deadMatTemplate = { color: '#4a2020' };
const hpBgMat = new THREE.MeshBasicMaterial({ color: '#222', transparent: true, opacity: 0.8 });
const hpGreenMat = new THREE.MeshBasicMaterial({ color: '#44aa44' });
const hpRedMat = new THREE.MeshBasicMaterial({ color: '#cc4444' });
const aggroMat = new THREE.MeshBasicMaterial({ color: '#ff2222' });

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const planeGeo = new THREE.PlaneGeometry(1, 1);

// ─── Per-enemy Three.js refs ───

interface EnemyNodeRefs {
  root: THREE.Group;
  rotGroup: THREE.Group;
  bodyTilt: THREE.Group;
  // Bandit-specific
  leftArm?: THREE.Group;
  rightArm?: THREE.Group;
  leftLeg?: THREE.Group;
  rightLeg?: THREE.Group;
  leftBoot?: THREE.Mesh;
  rightBoot?: THREE.Mesh;
  // Wolf-specific
  wolfHead?: THREE.Group;
  wolfJaw?: THREE.Mesh;
  wolfTail?: THREE.Group;
  wolfFrontL?: THREE.Group;
  wolfFrontR?: THREE.Group;
  wolfBackL?: THREE.Group;
  wolfBackR?: THREE.Group;
  // Shared
  hpGroup: THREE.Group;
  hpFill: THREE.Mesh;
  aggroMesh: THREE.Mesh;
  bodyMeshes: THREE.Mesh[]; // all meshes that flash on hit
}

// ─── Main component ───

export const Enemies = forwardRef<EnemiesHandle, EnemiesProps>(function Enemies(
  { playerPositionRef, pendingPlayerDamageRef, onEnemyKill },
  ref
) {
  // Mutable runtime state — THE source of truth for all enemy data
  const runtimeRef = useRef<Map<string, EnemyRuntime>>(new Map());
  // Three.js node refs per enemy
  const nodeRefsMap = useRef<Map<string, EnemyNodeRefs>>(new Map());
  // Render tick — only increments on spawn/despawn
  const [renderTick, setRenderTick] = useState(0);
  // Per-enemy dead material instances (allocated on death, not per-frame)
  const deadMatsMap = useRef<Map<string, THREE.MeshLambertMaterial>>(new Map());
  // Track IDs to despawn
  const pendingDespawns = useRef<string[]>([]);

  // Initialize enemies
  useEffect(() => {
    const initial = generateEnemies();
    const map = new Map<string, EnemyRuntime>();
    for (const e of initial) {
      map.set(e.id, {
        ...e,
        deathTimer: 0,
        animTimer: 0,
        staggerX: 0,
        staggerZ: 0,
        staggerTimer: 0,
        atkWindup: 0,
      });
    }
    runtimeRef.current = map;
    setRenderTick(1); // trigger initial render
  }, []);

  // Expose handle for Player to call
  useImperativeHandle(ref, () => ({
    hitEnemy(id: string, damage: number): boolean {
      const e = runtimeRef.current.get(id);
      if (!e || e.state === 'dead') return false;
      e.health = Math.max(0, e.health - damage);
      e.hitFlash = 0.25;
      
      // Compute stagger direction (away from player)
      const pp = playerPositionRef.current;
      if (pp) {
        const dx = e.position[0] - pp.x;
        const dz = e.position[2] - pp.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 0.1) {
          e.staggerX = dx / dist;
          e.staggerZ = dz / dist;
          e.staggerTimer = 0.25;
        }
      }
      
      if (e.health <= 0) {
        e.state = 'dead';
        e.deathTimer = 0;
        onEnemyKill(e);
        return true;
      }
      return false;
    },
    getEnemies() {
      return runtimeRef.current;
    },
  }), [playerPositionRef, onEnemyKill]);

  // ─── Single useFrame: AI + transforms for ALL enemies ───
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const pp = playerPositionRef.current;
    if (!pp) return;
    const px = pp.x, pz = pp.z;
    let needsRenderTick = false;

    runtimeRef.current.forEach((e, id) => {
      const nodes = nodeRefsMap.current.get(id);
      if (!nodes) return;

      // ── Dead state (process BEFORE culling so timers advance even when invisible) ──
      if (e.state === 'dead') {
        e.deathTimer += dt;
        if (e.deathTimer >= ENEMY_DESPAWN_TIME) {
          pendingDespawns.current.push(id);
          needsRenderTick = true;
          // Clean up per-enemy dead material
          const dm = deadMatsMap.current.get(id);
          if (dm) { dm.dispose(); deadMatsMap.current.delete(id); }
          nodes.root.visible = false;
          return;
        }

        // Distance culling for dead enemies (still advance timer above)
        const cullDx = px - e.position[0];
        const cullDz = pz - e.position[2];
        const cullDistSq = cullDx * cullDx + cullDz * cullDz;
        if (cullDistSq > 120 * 120) {
          nodes.root.visible = false;
          return;
        }
        nodes.root.visible = true;

        // Get or create per-enemy dead material
        let deadMat = deadMatsMap.current.get(id);
        if (!deadMat) {
          deadMat = new THREE.MeshLambertMaterial({ color: deadMatTemplate.color, transparent: true });
          deadMatsMap.current.set(id, deadMat);
        }

        // Dead visual: fade, tumble, drop
        const fade = Math.max(0, 1 - e.deathTimer / ENEMY_DESPAWN_TIME);
        deadMat.opacity = fade;
        const deathRoll = Math.min(e.deathTimer * 4, Math.PI / 2);
        const deathDrop = e.type === 'wolf' ? 0.15 : 0.3;
        nodes.root.position.set(
          e.position[0],
          e.position[1] - deathDrop - Math.min(e.deathTimer * 2, 1) * 0.3,
          e.position[2]
        );
        nodes.rotGroup.rotation.set(0, 0, 0);
        nodes.bodyTilt.rotation.set(deathRoll, 0, deathRoll * 0.3);
        for (let i = 0; i < nodes.bodyMeshes.length; i++) {
          nodes.bodyMeshes[i].material = deadMat;
        }
        nodes.hpGroup.visible = false;
        nodes.aggroMesh.visible = false;
        if (e.type === 'bandit') {
          if (nodes.leftArm) nodes.leftArm.visible = false;
          if (nodes.rightArm) nodes.rightArm.visible = false;
          if (nodes.leftLeg) nodes.leftLeg.visible = false;
          if (nodes.rightLeg) nodes.rightLeg.visible = false;
        } else {
          if (nodes.wolfHead) nodes.wolfHead.visible = false;
          if (nodes.wolfTail) nodes.wolfTail.visible = false;
          if (nodes.wolfFrontL) nodes.wolfFrontL.visible = false;
          if (nodes.wolfFrontR) nodes.wolfFrontR.visible = false;
          if (nodes.wolfBackL) nodes.wolfBackL.visible = false;
          if (nodes.wolfBackR) nodes.wolfBackR.visible = false;
        }
        return;
      }

      // ── Distance culling for alive enemies ──
      const cullDx = px - e.position[0];
      const cullDz = pz - e.position[2];
      const cullDistSq = cullDx * cullDx + cullDz * cullDz;
      if (cullDistSq > 120 * 120) {
        nodes.root.visible = false;
        return;
      }
      nodes.root.visible = true;

      // ── Alive state: ensure limbs visible ──
      if (e.type === 'bandit') {
        if (nodes.leftArm) nodes.leftArm.visible = true;
        if (nodes.rightArm) nodes.rightArm.visible = true;
        if (nodes.leftLeg) nodes.leftLeg.visible = true;
        if (nodes.rightLeg) nodes.rightLeg.visible = true;
      } else {
        if (nodes.wolfHead) nodes.wolfHead.visible = true;
        if (nodes.wolfTail) nodes.wolfTail.visible = true;
        if (nodes.wolfFrontL) nodes.wolfFrontL.visible = true;
        if (nodes.wolfFrontR) nodes.wolfFrontR.visible = true;
        if (nodes.wolfBackL) nodes.wolfBackL.visible = true;
        if (nodes.wolfBackR) nodes.wolfBackR.visible = true;
      }

      // ── Stagger update ──
      if (e.staggerTimer > 0) {
        e.staggerTimer -= dt;
        e.position[0] += e.staggerX * 4 * dt * e.staggerTimer;
        e.position[2] += e.staggerZ * 4 * dt * e.staggerTimer;
        const gOff = ENEMY_GROUND_OFFSET[e.type] ?? 0.9;
        e.position[1] = getTerrainHeight(e.position[0], e.position[2]) + gOff;
      }

      // ── Hit flash decay ──
      e.hitFlash = Math.max(0, e.hitFlash - dt);

      // ── Animation timer ──
      const chaseAnimSpeed = e.type === 'wolf' ? 14 : 11;
      const patrolAnimSpeed = e.type === 'wolf' ? 7 : 5;
      e.animTimer += dt * (e.state === 'chase' ? chaseAnimSpeed : patrolAnimSpeed);

      // ── AI state transitions ──
      const dx = px - e.position[0];
      const dz = pz - e.position[2];
      const distSq = dx * dx + dz * dz;
      if (distSq > 10000) {
        // Far from player — skip detailed AI
        // Update position for root
        nodes.root.position.set(e.position[0], e.position[1], e.position[2]);
        return;
      }
      const distToPlayer = Math.sqrt(distSq);
      const dirX = distToPlayer > 0.1 ? dx / distToPlayer : 0;
      const dirZ = distToPlayer > 0.1 ? dz / distToPlayer : 0;

      const isStaggered = e.staggerTimer > 0;

      if (!isStaggered) {
        if (distToPlayer < e.attackRange) {
          e.state = 'attack';
        } else if (distToPlayer < e.detectRange) {
          e.state = 'chase';
        } else if (e.state === 'chase' || e.state === 'attack') {
          e.state = 'patrol';
        } else if (e.state === 'idle') {
          e.state = 'patrol';
        }
      }

      // ── Movement ──
      e.attackCooldown = Math.max(0, e.attackCooldown - dt);

      if (!isStaggered) {
        if (e.state === 'chase') {
          const strafeAngle = e.type === 'wolf' ? Math.sin(e.animTimer * 0.3) * 0.3 : 0;
          const cos = Math.cos(strafeAngle), sin = Math.sin(strafeAngle);
          const mx = dirX * cos - dirZ * sin;
          const mz = dirX * sin + dirZ * cos;
          e.position[0] += mx * e.speed * dt;
          e.position[2] += mz * e.speed * dt;
          e.position[1] = getTerrainHeight(e.position[0], e.position[2]) + (ENEMY_GROUND_OFFSET[e.type] ?? 0.9);
        } else if (e.state === 'patrol') {
          e.patrolAngle += dt * 0.3;
          const tx = e.patrolCenter[0] + Math.cos(e.patrolAngle) * e.patrolRadius;
          const tz = e.patrolCenter[2] + Math.sin(e.patrolAngle) * e.patrolRadius;
          const pdx = tx - e.position[0], pdz = tz - e.position[2];
          const pd = Math.sqrt(pdx * pdx + pdz * pdz);
          if (pd > 0.5) {
            e.position[0] += (pdx / pd) * e.speed * 0.4 * dt;
            e.position[2] += (pdz / pd) * e.speed * 0.4 * dt;
            e.position[1] = getTerrainHeight(e.position[0], e.position[2]) + (ENEMY_GROUND_OFFSET[e.type] ?? 0.9);
          }
        } else if (e.state === 'attack') {
          if (e.attackCooldown <= 0) {
            if (e.atkWindup < 0.3) {
              e.atkWindup += dt;
            } else {
              pendingPlayerDamageRef.current += e.damage;
              e.attackCooldown = ENEMY_ATTACK_COOLDOWN;
              e.atkWindup = 0;
            }
          }
        }
      }

      // ── Update Three.js transforms ──
      const isMoving = e.state === 'chase' || e.state === 'patrol';
      const isChasing = e.state === 'chase';
      const ms = isMoving ? (isChasing ? 1 : 0.4) : 0;
      const chaseIntensity = isChasing ? 1.2 : 1;
      const animT = e.animTimer;

      const legAnim = Math.sin(animT) * 0.7 * ms * chaseIntensity;
      const legAnimOff = Math.sin(animT + Math.PI) * 0.7 * ms * chaseIntensity;
      const armAnim = Math.sin(animT + 0.3) * 0.5 * ms * chaseIntensity;
      const armAnimOff = Math.sin(animT + Math.PI + 0.3) * 0.5 * ms * chaseIntensity;
      const bodyBob = Math.abs(Math.sin(animT * 2)) * 0.06 * ms * chaseIntensity;
      const bodyLean = isChasing ? 0.12 : ms * 0.05;
      const shoulderTwist = Math.sin(animT) * 0.05 * ms;
      const chaseSway = isChasing ? Math.sin(animT * 0.7) * 0.03 : 0;
      const staggerRecoil = e.staggerTimer > 0 ? e.staggerTimer * 0.5 : 0;

      const faceAngle = Math.atan2(px - e.position[0], pz - e.position[2]);

      // Attack animation
      const isWindingUp = e.state === 'attack' && e.attackCooldown <= 0 && e.atkWindup > 0;
      const windupPhase = Math.min(e.atkWindup / 0.3, 1);
      const atkStrikeAnim = e.state === 'attack' && e.attackCooldown > ENEMY_ATTACK_COOLDOWN * 0.7;
      const atkAnim = isWindingUp ? -1.5 * windupPhase : (atkStrikeAnim ? 1.8 : 0);
      const atkBodyTwist = isWindingUp ? -0.2 * windupPhase : (atkStrikeAnim ? 0.3 : 0);

      // Flash material
      const flash = e.hitFlash > 0;

      // Position root
      if (e.type === 'bandit') {
        nodes.root.position.set(e.position[0], e.position[1] + bodyBob, e.position[2]);
      } else {
        const wolfCrouch = e.state === 'attack' ? -0.08 : 0;
        nodes.root.position.set(e.position[0], e.position[1] + bodyBob + wolfCrouch, e.position[2]);
      }

      // Rotation
      nodes.rotGroup.rotation.y = faceAngle;

      // Body tilt
      if (e.type === 'bandit') {
        nodes.bodyTilt.rotation.set(bodyLean - staggerRecoil, atkBodyTwist + shoulderTwist, chaseSway);
      } else {
        const wolfLunge = e.state === 'chase' ? Math.sin(animT * 1.5) * 0.08 : 0;
        nodes.bodyTilt.rotation.set(bodyLean - staggerRecoil + wolfLunge, 0, 0);
      }

      // Material swap
      if (e.type === 'bandit') {
        const bodyMaterial = flash ? hitMat : banditBodyMat;
        const headMaterial = flash ? hitMat : banditHeadMat;
        const legMaterial = flash ? hitMat : banditLegMat;
        const bootMaterial = flash ? hitMat : banditBootMat;
        // bodyMeshes order: [torso, head, headband, leftArmMesh, rightArmMesh, weapon, leftLegMesh, leftBootMesh, rightLegMesh, rightBootMesh]
        // We set specific materials based on mesh identity via stored order
        for (let i = 0; i < nodes.bodyMeshes.length; i++) {
          const m = nodes.bodyMeshes[i];
          if (flash) {
            m.material = hitMat;
          } else {
            // Restore original based on index (set during mount)
            (m as any).__originalMat && (m.material = (m as any).__originalMat);
          }
        }
      } else {
        for (let i = 0; i < nodes.bodyMeshes.length; i++) {
          const m = nodes.bodyMeshes[i];
          if (flash) {
            m.material = hitMat;
          } else {
            (m as any).__originalMat && (m.material = (m as any).__originalMat);
          }
        }
      }

      // Limb animation — bandit
      if (e.type === 'bandit') {
        if (nodes.leftArm) nodes.leftArm.rotation.x = armAnim;
        if (nodes.rightArm) nodes.rightArm.rotation.x = armAnimOff + atkAnim;
        if (nodes.leftLeg) nodes.leftLeg.rotation.x = -legAnim;
        if (nodes.rightLeg) nodes.rightLeg.rotation.x = -legAnimOff;
      } else {
        // Wolf limbs
        const wolfSnarlHead = (e.state === 'attack' || isChasing) ? -0.15 : 0;
        if (nodes.wolfHead) nodes.wolfHead.rotation.x = wolfSnarlHead;
        // Jaw visibility — always mounted, toggle visible
        if (nodes.wolfJaw) nodes.wolfJaw.visible = (e.state === 'attack' || isWindingUp);
        // Legs
        if (nodes.wolfFrontL) nodes.wolfFrontL.rotation.x = -legAnim * 0.8;
        if (nodes.wolfFrontR) nodes.wolfFrontR.rotation.x = -legAnimOff * 0.8;
        if (nodes.wolfBackL) nodes.wolfBackL.rotation.x = -legAnimOff * 0.8;
        if (nodes.wolfBackR) nodes.wolfBackR.rotation.x = -legAnim * 0.8;
        // Tail
        const wolfTailAggro = (isChasing || e.state === 'attack')
          ? Math.sin(animT * 3) * 0.15 + 0.5
          : Math.sin(animT * 1.5) * 0.3;
        if (nodes.wolfTail) nodes.wolfTail.rotation.x = wolfTailAggro - 0.3;
      }

      // HP bar
      const hp = e.health / e.maxHealth;
      nodes.hpGroup.visible = hp < 1;
      if (hp < 1) {
        const barWidth = e.type === 'wolf' ? 0.6 : 0.8;
        nodes.hpFill.scale.x = barWidth * hp;
        nodes.hpFill.position.x = (hp - 1) * (barWidth / 2);
        nodes.hpFill.material = hp > 0.5 ? hpGreenMat : hpRedMat;
      }

      // Aggro indicator
      nodes.aggroMesh.visible = isChasing || e.state === 'attack';
    });

    // Process despawns
    if (pendingDespawns.current.length > 0) {
      for (const id of pendingDespawns.current) {
        runtimeRef.current.delete(id);
        nodeRefsMap.current.delete(id);
      }
      pendingDespawns.current.length = 0;
      setRenderTick(t => t + 1);
    }
  });

  // ─── Build enemy list for JSX (only changes on renderTick) ───
  const enemyList = useMemo(() => {
    return Array.from(runtimeRef.current.entries()).map(([id, e]) => ({
      id,
      type: e.type,
      initialPos: [e.position[0], e.position[1], e.position[2]] as [number, number, number],
    }));
  }, [renderTick]);

  // ─── Ref registration callback ───
  const registerNodeRefs = useCallback((id: string, refs: EnemyNodeRefs) => {
    nodeRefsMap.current.set(id, refs);
  }, []);

  return (
    <group>
      {enemyList.map(e => (
        <EnemyMesh
          key={e.id}
          id={e.id}
          type={e.type}
          initialPos={e.initialPos}
          onRegister={registerNodeRefs}
        />
      ))}
    </group>
  );
});

// ─── EnemyMesh: mount-once component, never re-renders ───

interface EnemyMeshProps {
  id: string;
  type: 'bandit' | 'wolf';
  initialPos: [number, number, number];
  onRegister: (id: string, refs: EnemyNodeRefs) => void;
}

const EnemyMesh = function EnemyMeshInner({ id, type, initialPos, onRegister }: EnemyMeshProps) {
  const rootRef = useRef<THREE.Group>(null!);
  const rotRef = useRef<THREE.Group>(null!);
  const bodyTiltRef = useRef<THREE.Group>(null!);
  const leftArmRef = useRef<THREE.Group>(null!);
  const rightArmRef = useRef<THREE.Group>(null!);
  const leftLegRef = useRef<THREE.Group>(null!);
  const rightLegRef = useRef<THREE.Group>(null!);
  const wolfHeadRef = useRef<THREE.Group>(null!);
  const wolfJawRef = useRef<THREE.Mesh>(null!);
  const wolfTailRef = useRef<THREE.Group>(null!);
  const wolfFrontLRef = useRef<THREE.Group>(null!);
  const wolfFrontRRef = useRef<THREE.Group>(null!);
  const wolfBackLRef = useRef<THREE.Group>(null!);
  const wolfBackRRef = useRef<THREE.Group>(null!);
  const hpGroupRef = useRef<THREE.Group>(null!);
  const hpFillRef = useRef<THREE.Mesh>(null!);
  const aggroRef = useRef<THREE.Mesh>(null!);
  const registeredRef = useRef(false);

  // Register refs on mount (via useFrame to ensure refs are populated)
  useFrame(() => {
    if (registeredRef.current) return;
    if (!rootRef.current) return;
    registeredRef.current = true;

    // Collect body meshes for material swapping
    const bodyMeshes: THREE.Mesh[] = [];
    rootRef.current.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && child.userData.bodyMesh) {
        const mesh = child as THREE.Mesh;
        (mesh as any).__originalMat = mesh.material;
        bodyMeshes.push(mesh);
      }
    });

    const refs: EnemyNodeRefs = {
      root: rootRef.current,
      rotGroup: rotRef.current,
      bodyTilt: bodyTiltRef.current,
      hpGroup: hpGroupRef.current,
      hpFill: hpFillRef.current,
      aggroMesh: aggroRef.current,
      bodyMeshes,
    };

    if (type === 'bandit') {
      refs.leftArm = leftArmRef.current;
      refs.rightArm = rightArmRef.current;
      refs.leftLeg = leftLegRef.current;
      refs.rightLeg = rightLegRef.current;
    } else {
      refs.wolfHead = wolfHeadRef.current;
      refs.wolfJaw = wolfJawRef.current;
      refs.wolfTail = wolfTailRef.current;
      refs.wolfFrontL = wolfFrontLRef.current;
      refs.wolfFrontR = wolfFrontRRef.current;
      refs.wolfBackL = wolfBackLRef.current;
      refs.wolfBackR = wolfBackRRef.current;
    }

    onRegister(id, refs);
  });

  if (type === 'bandit') {
    return (
      <group ref={rootRef} position={initialPos}>
        <group ref={rotRef}>
          <group ref={bodyTiltRef}>
            {/* Torso */}
            <mesh geometry={boxGeo} scale={[0.65, 0.75, 0.35]} material={banditBodyMat} castShadow userData={{ bodyMesh: true }} />
            {/* Head */}
            <mesh position={[0, 0.55, 0]} geometry={boxGeo} scale={[0.35, 0.38, 0.35]} material={banditHeadMat} castShadow userData={{ bodyMesh: true }} />
            {/* Headband */}
            <mesh position={[0, 0.6, -0.02]} geometry={boxGeo} scale={[0.38, 0.25, 0.38]} material={banditBodyMat} castShadow userData={{ bodyMesh: true }} />
            {/* Left arm */}
            <group ref={leftArmRef} position={[-0.42, 0.05, 0]}>
              <mesh geometry={boxGeo} scale={[0.18, 0.55, 0.18]} material={banditBodyMat} castShadow userData={{ bodyMesh: true }} />
            </group>
            {/* Right arm + weapon */}
            <group ref={rightArmRef} position={[0.42, 0.05, 0]}>
              <mesh geometry={boxGeo} scale={[0.18, 0.55, 0.18]} material={banditBodyMat} castShadow userData={{ bodyMesh: true }} />
              <mesh position={[0, -0.45, 0.1]} geometry={boxGeo} scale={[0.05, 0.6, 0.03]} material={banditWeaponMat} castShadow />
            </group>
          </group>
          {/* Left leg */}
          <group ref={leftLegRef} position={[-0.16, -0.55, 0]}>
            <mesh geometry={boxGeo} scale={[0.22, 0.4, 0.22]} material={banditLegMat} castShadow userData={{ bodyMesh: true }} />
            <mesh position={[0, -0.25, 0]} geometry={boxGeo} scale={[0.2, 0.15, 0.24]} material={banditBootMat} castShadow userData={{ bodyMesh: true }} />
          </group>
          {/* Right leg */}
          <group ref={rightLegRef} position={[0.16, -0.55, 0]}>
            <mesh geometry={boxGeo} scale={[0.22, 0.4, 0.22]} material={banditLegMat} castShadow userData={{ bodyMesh: true }} />
            <mesh position={[0, -0.25, 0]} geometry={boxGeo} scale={[0.2, 0.15, 0.24]} material={banditBootMat} castShadow userData={{ bodyMesh: true }} />
          </group>
        </group>
        {/* HP bar — always mounted, visibility toggled */}
        <group ref={hpGroupRef} position={[0, 1.3, 0]} visible={false}>
          <mesh geometry={planeGeo} scale={[0.8, 0.1, 1]} material={hpBgMat} />
          <mesh ref={hpFillRef} position={[0, 0, 0.001]} geometry={planeGeo} scale={[0.8, 0.1, 1]} material={hpGreenMat} />
        </group>
        {/* Aggro indicator — always mounted, visibility toggled */}
        <mesh ref={aggroRef} position={[0, 1.55, 0]} geometry={planeGeo} scale={[0.12, 0.12, 1]} material={aggroMat} visible={false} />
      </group>
    );
  }

  // === WOLF ===
  return (
    <group ref={rootRef} position={initialPos}>
      <group ref={rotRef}>
        <group ref={bodyTiltRef}>
          {/* Body */}
          <mesh geometry={boxGeo} scale={[0.4, 0.35, 0.8]} material={wolfBodyMat} castShadow userData={{ bodyMesh: true }} />
          {/* Chest */}
          <mesh position={[0, 0.05, 0.2]} geometry={boxGeo} scale={[0.35, 0.3, 0.25]} material={wolfLightMat} castShadow userData={{ bodyMesh: true }} />
          {/* Head group */}
          <group ref={wolfHeadRef} position={[0, 0.15, 0.5]}>
            <mesh geometry={boxGeo} scale={[0.28, 0.25, 0.3]} material={wolfBodyMat} castShadow userData={{ bodyMesh: true }} />
            <mesh position={[0, -0.05, 0.18]} geometry={boxGeo} scale={[0.18, 0.12, 0.15]} material={wolfLightMat} castShadow userData={{ bodyMesh: true }} />
            {/* Jaw — always mounted, visibility toggled by ref */}
            <mesh ref={wolfJawRef} position={[0, -0.12, 0.14]} geometry={boxGeo} scale={[0.14, 0.05, 0.1]} material={wolfBodyMat} castShadow visible={false} userData={{ bodyMesh: true }} />
            {/* Eyes */}
            <mesh position={[-0.08, 0.07, 0.14]} geometry={boxGeo} scale={[0.04, 0.04, 0.02]} material={wolfEyeMat} />
            <mesh position={[0.08, 0.07, 0.14]} geometry={boxGeo} scale={[0.04, 0.04, 0.02]} material={wolfEyeMat} />
          </group>
        </group>
        {/* Legs */}
        <group ref={wolfFrontLRef} position={[-0.14, -0.25, 0.2]}>
          <mesh geometry={boxGeo} scale={[0.1, 0.35, 0.1]} material={wolfBodyMat} castShadow userData={{ bodyMesh: true }} />
        </group>
        <group ref={wolfFrontRRef} position={[0.14, -0.25, 0.2]}>
          <mesh geometry={boxGeo} scale={[0.1, 0.35, 0.1]} material={wolfBodyMat} castShadow userData={{ bodyMesh: true }} />
        </group>
        <group ref={wolfBackLRef} position={[-0.14, -0.25, -0.2]}>
          <mesh geometry={boxGeo} scale={[0.1, 0.35, 0.1]} material={wolfBodyMat} castShadow userData={{ bodyMesh: true }} />
        </group>
        <group ref={wolfBackRRef} position={[0.14, -0.25, -0.2]}>
          <mesh geometry={boxGeo} scale={[0.1, 0.35, 0.1]} material={wolfBodyMat} castShadow userData={{ bodyMesh: true }} />
        </group>
        {/* Tail */}
        <group ref={wolfTailRef} position={[0, 0.1, -0.45]}>
          <mesh geometry={boxGeo} scale={[0.06, 0.06, 0.3]} material={wolfBodyMat} castShadow userData={{ bodyMesh: true }} />
        </group>
      </group>
      {/* HP bar */}
      <group ref={hpGroupRef} position={[0, 0.7, 0]} visible={false}>
        <mesh geometry={planeGeo} scale={[0.6, 0.08, 1]} material={hpBgMat} />
        <mesh ref={hpFillRef} position={[0, 0, 0.001]} geometry={planeGeo} scale={[0.6, 0.08, 1]} material={hpGreenMat} />
      </group>
      {/* Aggro indicator */}
      <mesh ref={aggroRef} position={[0, 0.9, 0]} geometry={planeGeo} scale={[0.1, 0.1, 1]} material={aggroMat} visible={false} />
    </group>
  );
};
