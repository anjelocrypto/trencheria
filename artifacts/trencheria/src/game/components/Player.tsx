import { useRef, useEffect, useMemo, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PlayerGLBModel } from './PlayerCharacterModel';
import { GoblinGLBModel } from './GoblinCharacterModel';
import { GoblinDeadModel } from './GoblinDeadModel';
import { OctopusGLBModel } from './OctopusCharacterModel';
import { OctopusDeadModel } from './OctopusDeadModel';
import { NemoClawGLBModel } from './NemoClawCharacterModel';
import { ChillhouseGLBModel } from './ChillhouseCharacterModel';
import { PlaceholderLocalModel } from './PlaceholderCharacterModel';
import { useCharacter } from '../context/CharacterContext';
import { getFactionByCharacter, getFactionById } from '../systems/FactionData';
import { getTerrainHeight } from './Terrain';
import { getBridgeHeight } from '../world/BridgeData';
import { devLog } from '../utils/devLog';
import { getMovementInput } from '../systems/InputSystem';
import {
  PLAYER_SPEED, PLAYER_RUN_SPEED, PLAYER_JUMP_FORCE,
  PLAYER_HEIGHT, GRAVITY, STAMINA_DRAIN, STAMINA_REGEN, HUNGER_DRAIN,
  TEMPERATURE_DRAIN, CAMPFIRE_WARMTH_RANGE, CAMPFIRE_WARMTH_RATE,
  SHELTER_EFFECT_RANGE, SHELTER_HUNGER_REDUCTION, SHELTER_STAMINA_BONUS,
  LOW_HUNGER_THRESHOLD,
  POIS, POI_ZONE_RADIUS,
} from '../constants';
import { PLAYER_ATTACK_COOLDOWN, PLAYER_ATTACK_RANGE, PLAYER_ATTACK_DAMAGE, PLAYER_ATTACK_ARC } from '../systems/EnemyData';
import { PVP_DAMAGE, PVP_COMBO_DAMAGE } from '../multiplayer/types';
import type { InterpolatedPlayer } from '../multiplayer/types';
import { SurvivalState, LootPickup, ResourceInventory } from '../types';
import { findSafeSpawn } from '../systems/SafeSpawn';
import { loadWalletSession } from '../hooks/usePlayerAccount';

import { PlacedStructure } from '../systems/BuildingData';
import { HorseData, HORSE_SPEED, HORSE_RUN_SPEED, MOUNT_RANGE, DISMOUNT_OFFSET } from '../systems/HorseData';
import { getGroundHeight } from '../systems/Grounding';
import { resolveCollision, rebuildObstacles } from '../systems/CollisionSystem';
import { WorldResource, INTERACTION_RANGE, GATHER_COOLDOWN, TREE_WOOD_REWARD, ROCK_STONE_REWARD, BERRY_FOOD_REWARD, CRATE_REWARDS } from '../systems/WorldResources';
import { buildResourceGrid, forEachNearbyResource } from '../world/ResourceSpatialGrid';
import { HorseGLBModel } from './HorseGLBModel';

export interface MountedDebugData {
  terrainY: number;
  horseY: number;
  riderY: number;
  delta: number;
  pitch: number;
  pushX: number;
  pushZ: number;
}

interface PlayerProps {
  onSurvivalUpdate: (updates: Partial<SurvivalState>) => void;
  survival: SurvivalState;
  playerPositionRef: React.MutableRefObject<THREE.Vector3>;
  playerRotationRef: React.MutableRefObject<number>;
  cameraAzimuthRef: React.MutableRefObject<number>;
  enemiesHandleRef: React.RefObject<import('./Enemies').EnemiesHandle | null>;
  onRespawn: () => void;
  buildMode: boolean;
  structures: PlacedStructure[];
  lootPickups: LootPickup[];
  onCollectLoot: (id: string) => void;
  onEatFood: () => void;
  onTryCollectCoin?: () => void;
  horse: HorseData;
  isMounted: boolean;
  onMountHorse: () => void;
  onDismountHorse: () => void;
  onCallHorse: () => void;
  onSetInteractionText: (text: string | null) => void;
  onAddResource: (type: keyof ResourceInventory, amount: number) => void;
  onDepleteResource: (id: string) => void;
  onHitResource: (id: string) => void;
  inventory: ResourceInventory;
  shakeResourceRef: React.MutableRefObject<string | null>;
  highlightedResourceRef: React.MutableRefObject<string | null>;
  resources: WorldResource[];
  mountedDebugRef?: React.MutableRefObject<MountedDebugData>;
  // Multiplayer: external refs for broadcasting live animation state
  externalMoveSpeedRef?: React.MutableRefObject<number>;
  externalIsRunningRef?: React.MutableRefObject<boolean>;
  externalIsGroundedRef?: React.MutableRefObject<boolean>;
  externalAttackAnimRef?: React.MutableRefObject<number>;
  // Emote
  activeEmote: string | null;
  activeEmoteId?: number;
  onEmoteComplete: () => void;
  damageFlash?: number;
  // PvP
  remotePlayersRef?: React.RefObject<Map<string, InterpolatedPlayer>>;
  localClanId?: string | null;
  /**
   * Active wars where the local player's faction is engaged. Keyed by the
   * OPPONENT faction color (1:1 with faction in the fixed-faction system).
   * Value is the contested territory's center + radius. PvP damage may
   * only be dealt to a remote player whose color is in this map AND when
   * BOTH players are inside the radius.
   */
  activeWarsRef?: React.RefObject<Map<string, { centerX: number; centerZ: number; radius: number }>>;
  onPvpHit?: (victimId: string, damage: number, isCombo: boolean) => void;
}

const _camForward = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _forward = new THREE.Vector3();
const _toEnemy = new THREE.Vector3();

// Movement feel constants — tuned for game-quality responsiveness
const ACCEL_GROUND = 45;           // snappy walk start
const ACCEL_GROUND_RUN = 50;       // quick sprint transition
const DECEL_GROUND = 28;           // firm stop (less floaty)
const ACCEL_MOUNTED = 12;          // heavy horse acceleration
const DECEL_MOUNTED = 5;           // momentum-heavy braking
const TURN_SPEED_FOOT = 14;        // responsive turning
const TURN_SPEED_MOUNTED = 3.0;    // wide gallop arcs
const HORSE_TURN_SPEED_STANDING = 6; // tight turns at low speed
const PLAYER_RADIUS = 0.4;
const MOUNTED_RADIUS = 1.0;
const JUMP_SQUAT_TIME = 0.06;      // brief anticipation before jump
const LAND_RECOVERY_TIME = 0.15;   // landing stiffness duration

export function Player({
  onSurvivalUpdate, survival, playerPositionRef, playerRotationRef,
  cameraAzimuthRef, enemiesHandleRef, onRespawn, buildMode,
  structures, lootPickups, onCollectLoot, onEatFood, onTryCollectCoin,
  horse, isMounted, onMountHorse, onDismountHorse, onCallHorse, onSetInteractionText,
  onAddResource, onDepleteResource, onHitResource, inventory,
  shakeResourceRef, highlightedResourceRef,
  resources, mountedDebugRef,
  externalMoveSpeedRef, externalIsRunningRef, externalIsGroundedRef, externalAttackAnimRef,
  activeEmote, activeEmoteId, onEmoteComplete, damageFlash,
  remotePlayersRef, localClanId, activeWarsRef, onPvpHit,
}: PlayerProps) {
  const { character } = useCharacter();
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const velocityRef = useRef(new THREE.Vector3(0, 0, 0));
  const isGroundedRef = useRef(true);
  const animTimeRef = useRef(0);
  const attackCooldownRef = useRef(0);
  const attackAnimRef = useRef(0);
  const comboRef = useRef(0); // 0 = no combo, 1 = first swing done, can chain
  const comboWindowRef = useRef(0);
  const isFightingRef = useRef(false);
  const moveSpeedRef = useRef(0);
  const mountedZeroRef = useRef(0); // always 0 — used to suppress player anim when mounted
  const currentSpeedRef = useRef(0); // actual interpolated speed for acceleration feel
  const survivalAccumRef = useRef(0);
  const lootCheckRef = useRef(0);
  
  const landingImpactRef = useRef(0);
  const wasInAirRef = useRef(false);
  const targetRotRef = useRef(0);
  const leanRef = useRef(0); // lateral lean
  const hipSwayRef = useRef(0);
  const idleShiftRef = useRef(0);
  const collisionRebuildTimer = useRef(0);
  // T012: track previous inputs so we can rebuild collision only when something actually changed.
  const prevResourcesRef = useRef<WorldResource[]>(resources);
  const prevStructuresRef = useRef<PlacedStructure[]>(structures);
  const prevMountedRef = useRef(isMounted);
  // T011: spatial grid over resources — rebuilt only when the resources array reference changes.
  const resourceGrid = useMemo(() => buildResourceGrid(resources), [resources]);
  const horseRotRef = useRef(0); // horse's own facing for smooth turning
  const gatherCooldownRef = useRef(0);
  const jumpSquatRef = useRef(0);       // jump anticipation timer
  const landRecoveryRef = useRef(0);    // landing stiffness
  const prevMoveRef = useRef(0);        // previous frame move state for transition detection
  const turnDeltaRef = useRef(0);       // accumulated turn for animation
  const horsePitchRef = useRef(0);      // slope pitch for mounted horse
  const _internalDebugRef = useRef({ terrainY: 0, horseY: 0, riderY: 0, delta: 0, pitch: 0, pushX: 0, pushZ: 0 });
  const debugRef = mountedDebugRef || _internalDebugRef;
  const isDead = survival.health <= 0;

  // === SPAWN GUARD: Only run once per browser session ===
  const hasSpawnedRef = useRef(false);
  
  useEffect(() => {
    // CRITICAL: Only spawn once. Never re-run on reconnect or remount.
    if (hasSpawnedRef.current) {
      devLog('[Player] SPAWN SKIPPED — already spawned this session');
      return;
    }

    if (groupRef.current) {
      // CRITICAL: Build the obstacle list (static settlements/POIs/town/wilderness +
      // any current resources/structures/horse) BEFORE running findSafeSpawn,
      // otherwise the spawn validator runs against an empty obstacle set and can
      // place the player inside a building.
      rebuildObstacles(resources, structures, [horse], isMounted ? horse.id : null);

      // Check if playerPositionRef already has a valid position (reconnect case)
      const existingPos = playerPositionRef.current;
      if (existingPos && (existingPos.x !== 0 || existingPos.z !== 0)) {
        // Validate existing position — if inside a building, relocate safely
        const validated = findSafeSpawn(existingPos.x, existingPos.z, PLAYER_HEIGHT);
        devLog('[Player] SPAWN RESTORED — validated:', validated.x.toFixed(1), validated.z.toFixed(1),
          validated.fallbackUsed ? `(relocated from ${existingPos.x.toFixed(1)},${existingPos.z.toFixed(1)})` : '(position OK)');
        groupRef.current.position.set(validated.x, validated.y, validated.z);
        playerPositionRef.current.set(validated.x, validated.y, validated.z);
        hasSpawnedRef.current = true;
        return;
      }

      // Fresh spawn — use faction-based safe spawn system
      const spawnSession = loadWalletSession();
      const spawnFactionId = spawnSession?.faction_id || undefined;
      const spawn = findSafeSpawn(undefined, undefined, PLAYER_HEIGHT, spawnFactionId);
      devLog('[Player] SPAWN FRESH —', spawn.x.toFixed(1), spawn.z.toFixed(1), 'y=', spawn.y.toFixed(2),
        spawn.fallbackUsed ? `(fallback: ${spawn.rejectedReason})` : '(canonical)', 'faction:', spawnFactionId || 'guest');
      groupRef.current.position.set(spawn.x, spawn.y, spawn.z);
      playerPositionRef.current.set(spawn.x, spawn.y, spawn.z);
      hasSpawnedRef.current = true;
    }
    // Intentionally only re-run when playerPositionRef identity changes (i.e. never in practice
    // — hasSpawnedRef gates against re-spawn). resources/structures/horse are intentionally NOT
    // in deps so we don't re-spawn the player on world updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerPositionRef]);

  // === RESPAWN GUARD: Only run when health transitions to 0 ===
  const wasDeadRef = useRef(false);
  
  useEffect(() => {
    // Only trigger respawn when transitioning TO dead state
    if (isDead && !wasDeadRef.current) {
      devLog('[Player] RESPAWN TRIGGERED — health reached 0');
      wasDeadRef.current = true;
      if (isMounted) onDismountHorse();
      const timer = setTimeout(() => {
        if (groupRef.current) {
          // Ensure obstacle list is current before searching for a respawn point.
          rebuildObstacles(resources, structures, [horse], null);
          // Respawn at faction home kingdom
          const respawnSession = loadWalletSession();
          const respawnFactionId = respawnSession?.faction_id || undefined;
          const spawn = findSafeSpawn(undefined, undefined, PLAYER_HEIGHT, respawnFactionId);
          devLog('[Player] RESPAWN COMPLETE — teleporting to', spawn.x.toFixed(1), spawn.z.toFixed(1), 'faction:', respawnFactionId || 'guest');
          groupRef.current.position.set(spawn.x, spawn.y, spawn.z);
          playerPositionRef.current.set(spawn.x, spawn.y, spawn.z);
          velocityRef.current.set(0, 0, 0);
        }
        onRespawn();
      }, 1500);
      return () => clearTimeout(timer);
    }
    
    // Reset dead state when health restored
    if (!isDead && wasDeadRef.current) {
      devLog('[Player] RESPAWN STATE CLEARED — player alive again');
      wasDeadRef.current = false;
    }
  }, [isDead, isMounted, onDismountHorse, onRespawn, playerPositionRef]);

  useFrame((_, delta) => {
    if (!groupRef.current || !bodyRef.current || isDead) return;
    const dt = Math.min(delta, 0.05);
    const pos = groupRef.current.position;
    const vel = velocityRef.current;

    attackCooldownRef.current = Math.max(0, attackCooldownRef.current - dt);
    attackAnimRef.current = Math.max(0, attackAnimRef.current - dt);
    comboWindowRef.current = Math.max(0, comboWindowRef.current - dt);
    landingImpactRef.current = Math.max(0, landingImpactRef.current - dt * 4);
    gatherCooldownRef.current = Math.max(0, gatherCooldownRef.current - dt);
    idleShiftRef.current += dt;

    if (comboWindowRef.current <= 0) comboRef.current = 0;

    // Rebuild collision obstacles only when inputs change OR every 1.0s as a fallback
    // for horse position drift. Previously this ran every 0.5s unconditionally, which
    // re-cloned the static obstacle list (~200 entries) twice a second for no reason.
    collisionRebuildTimer.current += dt;
    const inputsChanged =
      resources !== prevResourcesRef.current ||
      structures !== prevStructuresRef.current ||
      isMounted !== prevMountedRef.current;
    if (inputsChanged || collisionRebuildTimer.current > 1.0) {
      collisionRebuildTimer.current = 0;
      prevResourcesRef.current = resources;
      prevStructuresRef.current = structures;
      prevMountedRef.current = isMounted;
      rebuildObstacles(resources, structures, [horse], isMounted ? horse.id : null);
    }

    const input = getMovementInput();
    const azimuth = cameraAzimuthRef.current;

    if (input.eat && !isMounted) onEatFood();

    // Call horse with H
    if (input.callHorse) onCallHorse();

    // === UNIFIED INTERACTION SYSTEM — Player is sole authority ===
    if (isMounted) {
      onSetInteractionText('🐴 Press E — Dismount');
      highlightedResourceRef.current = null;
      if (input.interact) {
        onDismountHorse();
        const angle = horseRotRef.current;
        // Yaw convention here: forward = (sin a, cos a). Therefore:
        //   left  = (-cos a,  sin a)
        //   right = ( cos a, -sin a)
        //   back  = (-sin a, -cos a)
        //   front = ( sin a,  cos a)
        // Try left, right, back, front in order; pick the first candidate that
        // isn't pushed by collision and isn't in deep water.
        const sa = Math.sin(angle);
        const ca = Math.cos(angle);
        const candidates: Array<[number, number]> = [
          [-ca,  sa], // left
          [ ca, -sa], // right
          [-sa, -ca], // back
          [ sa,  ca], // front
        ];
        let dmX = pos.x;
        let dmZ = pos.z;
        for (const [dx, dz] of candidates) {
          const cx = pos.x + dx * DISMOUNT_OFFSET;
          const cz = pos.z + dz * DISMOUNT_OFFSET;
          const r = resolveCollision(cx, cz, PLAYER_RADIUS);
          const pushed = Math.hypot(r.x - cx, r.z - cz);
          const groundY = getGroundHeight(r.x, r.z);
          if (pushed < 0.2 && groundY > -0.4) {
            dmX = r.x;
            dmZ = r.z;
            break;
          }
        }
        pos.x = dmX;
        pos.z = dmZ;
        pos.y = getGroundHeight(pos.x, pos.z) + PLAYER_HEIGHT / 2;
        // Clear mounted physics
        vel.set(0, 0, 0);
        currentSpeedRef.current = 0;
        horsePitchRef.current = 0;
      }
    } else {
      const hdx = pos.x - horse.position[0];
      const hdz = pos.z - horse.position[2];
      const horseDist = Math.sqrt(hdx * hdx + hdz * hdz);
      const horseInRange = horseDist < MOUNT_RANGE && horse.state !== 'mounted';

      if (horseInRange) {
        onSetInteractionText('🐴 Press E — Mount Horse');
        highlightedResourceRef.current = null;
        if (input.interact) {
          onMountHorse();
          pos.x = horse.position[0];
          pos.z = horse.position[2];
          // Snap to terrain-derived height immediately
          pos.y = getTerrainHeight(pos.x, pos.z) + 2.2;
          horseRotRef.current = horse.rotation;
          bodyRef.current.rotation.y = horse.rotation;
          playerRotationRef.current = horse.rotation;
          // Clear ALL physics state
          vel.set(0, 0, 0);
          currentSpeedRef.current = 0;
          isGroundedRef.current = true;
          wasInAirRef.current = false;
          jumpSquatRef.current = 0;
          landingImpactRef.current = 0;
          landRecoveryRef.current = 0;
          rebuildObstacles(resources, structures, [horse], horse.id);
        }
      } else if (!buildMode) {
        // Resource / workbench interaction.
        // T011: holder object so TypeScript narrows correctly across the closure
        // assignment in `forEachNearbyResource` — `let nearestRes = null` mutated
        // inside a callback gets narrowed to `never` after `if (nearestRes)`.
        const found: { res: WorldResource | null } = { res: null };
        let nearestDist = INTERACTION_RANGE;
        let nearestType: string | null = null;
        let nearestId: string | null = null;

        // T011: only scan resources in cells overlapping the player's interaction window
        // (was: full O(n) scan over every tree/rock in the world).
        forEachNearbyResource(resourceGrid, pos.x, pos.z, INTERACTION_RANGE, (res) => {
          if (res.depleted || !res.gatherable) return;
          const rdx = pos.x - res.position[0];
          const rdz = pos.z - res.position[2];
          const rDistSq = rdx * rdx + rdz * rdz;
          if (rDistSq < nearestDist * nearestDist) {
            nearestDist = Math.sqrt(rDistSq);
            found.res = res;
            nearestType = res.type;
            nearestId = res.id;
          }
        });

        for (const s of structures) {
          if (s.type !== 'workbench') continue;
          const wdx = pos.x - s.position[0];
          const wdz = pos.z - s.position[2];
          const wDistSq = wdx * wdx + wdz * wdz;
          if (wDistSq < INTERACTION_RANGE * INTERACTION_RANGE) {
            const wDist = Math.sqrt(wDistSq);
            if (wDist < nearestDist) {
              nearestDist = wDist;
              found.res = null;
              nearestType = 'workbench';
              nearestId = 'workbench-' + s.id;
            }
          }
        }
        const nearestRes = found.res;

        highlightedResourceRef.current = nearestId;

        if (nearestType) {
          let text = '';
          if (nearestType === 'tree') text = `🪓 Press E — Chop Tree (${nearestRes!.health}/${nearestRes!.maxHealth})`;
          else if (nearestType === 'rock') text = `⛏ Press E — Mine Rock (${nearestRes!.health}/${nearestRes!.maxHealth})`;
          else if (nearestType === 'berry_bush') text = `🫐 Press E — Pick Berries (${nearestRes!.health}/${nearestRes!.maxHealth})`;
          else if (nearestType === 'crate') text = `📦 Press E — Break Crate (${nearestRes!.health}/${nearestRes!.maxHealth})`;
          else if (nearestType === 'workbench') text = `🔨 Press E — Craft Food (5 Wood → 2 Food) [Wood: ${inventory.wood}]`;
          onSetInteractionText(text);

          if (input.interact && gatherCooldownRef.current <= 0) {
            gatherCooldownRef.current = GATHER_COOLDOWN;
            if (nearestType === 'workbench' && inventory.wood >= 5) {
              onAddResource('wood', -5);
              onAddResource('food', 2);
            } else if (nearestRes) {
              shakeResourceRef.current = nearestRes.id;
              if (nearestRes.health <= 1) {
                onDepleteResource(nearestRes.id);
                if (nearestRes.type === 'tree') onAddResource('wood', TREE_WOOD_REWARD);
                else if (nearestRes.type === 'rock') onAddResource('stone', ROCK_STONE_REWARD);
                else if (nearestRes.type === 'berry_bush') onAddResource('food', BERRY_FOOD_REWARD);
                else if (nearestRes.type === 'crate') {
                  onAddResource('wood', CRATE_REWARDS.wood);
                  onAddResource('stone', CRATE_REWARDS.stone);
                  onAddResource('food', CRATE_REWARDS.food);
                }
              } else {
                onHitResource(nearestRes.id);
                if (nearestRes.type === 'tree') onAddResource('wood', 1);
                else if (nearestRes.type === 'rock') onAddResource('stone', 1);
                else if (nearestRes.type === 'berry_bush') onAddResource('food', 1);
                else if (nearestRes.type === 'crate') onAddResource('wood', 1);
              }
            }
          }
        } else {
          onSetInteractionText(null);
        }
      } else {
        highlightedResourceRef.current = null;
        onSetInteractionText(null);
      }
    }

    // === MOVEMENT ===
    _camForward.set(-Math.sin(azimuth), 0, -Math.cos(azimuth));
    _camRight.crossVectors(_up, _camForward).negate();

    _moveDir.set(0, 0, 0);
    if (input.w) _moveDir.add(_camForward);
    if (input.s) _moveDir.sub(_camForward);
    if (input.a) _moveDir.sub(_camRight);
    if (input.d) _moveDir.add(_camRight);

    const canRun = input.run && survival.stamina > 0;
    let baseSpeed: number, runSpeed: number;
    if (isMounted) { baseSpeed = HORSE_SPEED; runSpeed = HORSE_RUN_SPEED; }
    else { baseSpeed = PLAYER_SPEED; runSpeed = PLAYER_RUN_SPEED; }
    let targetSpeed = canRun ? runSpeed : baseSpeed;
    const isMoving = _moveDir.lengthSq() > 0.001;
    const isAttacking = attackAnimRef.current > 0 || isFightingRef.current;
    // Allow movement during attack at reduced speed so player can escape enemy clusters
    const attackMoveBlock = isAttacking && !isMoving; // only block if NOT actively trying to move

    const accel = isMounted ? ACCEL_MOUNTED : (canRun ? ACCEL_GROUND_RUN : ACCEL_GROUND);
    const decel = isMounted ? DECEL_MOUNTED : DECEL_GROUND;

    // Reduce speed while attacking so escape is possible but not full-sprint
    if (isAttacking && isMoving) targetSpeed *= 0.45;

    if (isMoving && !attackMoveBlock) {
      _moveDir.normalize();

      if (isMounted) {
        // Horse steering: horse faces toward desired direction with speed-dependent turn rate
        const wantAngle = Math.atan2(_moveDir.x, _moveDir.z);
        let rotDiff = wantAngle - horseRotRef.current;
        while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
        while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;

        // Turn rate depends on speed — slower = tighter turns, faster = wider arcs
        const speedFactor = currentSpeedRef.current / HORSE_RUN_SPEED;
        const turnRate = THREE.MathUtils.lerp(HORSE_TURN_SPEED_STANDING, TURN_SPEED_MOUNTED, speedFactor);
        horseRotRef.current += rotDiff * Math.min(1, turnRate * dt);
        // Wrap
        if (horseRotRef.current > Math.PI) horseRotRef.current -= Math.PI * 2;
        if (horseRotRef.current < -Math.PI) horseRotRef.current += Math.PI * 2;

        bodyRef.current.rotation.y = horseRotRef.current;
        playerRotationRef.current = horseRotRef.current;

        // Lean into turn
        leanRef.current = THREE.MathUtils.lerp(leanRef.current, -rotDiff * 0.3 * speedFactor, dt * 5);

        // Move in horse's facing direction (not input direction)
        currentSpeedRef.current = THREE.MathUtils.lerp(
          currentSpeedRef.current, targetSpeed, 1 - Math.exp(-accel * dt / targetSpeed)
        );
        const spd = currentSpeedRef.current;
        vel.x = Math.sin(horseRotRef.current) * spd;
        vel.z = Math.cos(horseRotRef.current) * spd;
      } else {
        // Foot movement — direct control
        currentSpeedRef.current = THREE.MathUtils.lerp(
          currentSpeedRef.current, targetSpeed, 1 - Math.exp(-accel * dt / targetSpeed)
        );
        const spd = currentSpeedRef.current;
        vel.x = _moveDir.x * spd;
        vel.z = _moveDir.z * spd;

        // Smooth turning
        const angle = Math.atan2(_moveDir.x, _moveDir.z);
        targetRotRef.current = angle;
        let rotDiff = angle - bodyRef.current.rotation.y;
        while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
        while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
        bodyRef.current.rotation.y += rotDiff * Math.min(1, TURN_SPEED_FOOT * dt);
        playerRotationRef.current = bodyRef.current.rotation.y;

        // Track turn delta for animation
        turnDeltaRef.current = THREE.MathUtils.lerp(turnDeltaRef.current, rotDiff, dt * 8);
        leanRef.current = THREE.MathUtils.lerp(leanRef.current, -rotDiff * 0.5, dt * 8);
      }

      const animSpeed = isMounted ? (canRun ? 22 : 14) : (canRun ? 18 : 11);
      animTimeRef.current += dt * animSpeed;
      // Smooth move blend with distinct walk/run states
      const targetMs = canRun ? 1 : 0.5;
      moveSpeedRef.current = THREE.MathUtils.lerp(
        moveSpeedRef.current, targetMs, dt * 8
      );
    } else {
      // Decelerate — exponential decay for weighty feel
      const curSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
      if (curSpeed > 0.05) {
        const decay = Math.exp(-decel * dt);
        vel.x *= decay;
        vel.z *= decay;
        currentSpeedRef.current = curSpeed * decay;
        // Keep anim ticking during decel for natural stop
        animTimeRef.current += dt * (isMounted ? 8 : 6) * (currentSpeedRef.current / (isMounted ? HORSE_SPEED : PLAYER_SPEED));
      } else {
        vel.x = 0;
        vel.z = 0;
        currentSpeedRef.current = 0;
      }
      moveSpeedRef.current = THREE.MathUtils.lerp(moveSpeedRef.current, 0, dt * 6);
      leanRef.current = THREE.MathUtils.lerp(leanRef.current, 0, dt * 6);
      turnDeltaRef.current = THREE.MathUtils.lerp(turnDeltaRef.current, 0, dt * 5);
    }

    // Detect move state transitions
    prevMoveRef.current = isMoving ? 1 : THREE.MathUtils.lerp(prevMoveRef.current, 0, dt * 4);

    // Hip sway — stronger at walk, subtler at run
    const swayIntensity = moveSpeedRef.current > 0.7 ? 0.015 : 0.035;
    hipSwayRef.current = THREE.MathUtils.lerp(
      hipSwayRef.current,
      isMoving ? Math.sin(animTimeRef.current * 0.5) * swayIntensity * moveSpeedRef.current : 0,
      dt * 10
    );

    // Landing recovery
    landRecoveryRef.current = Math.max(0, landRecoveryRef.current - dt / LAND_RECOVERY_TIME);

    // Jump — with brief squat anticipation
    if (!isMounted && input.jump && isGroundedRef.current) {
      jumpSquatRef.current = JUMP_SQUAT_TIME;
    }
    if (jumpSquatRef.current > 0) {
      jumpSquatRef.current -= dt;
      if (jumpSquatRef.current <= 0) {
        vel.y = PLAYER_JUMP_FORCE;
        isGroundedRef.current = false;
        wasInAirRef.current = true;
      }
    }

    // === COMBO ATTACK SYSTEM ===
    if (!isMounted && !buildMode && !isMoving && input.attack && attackCooldownRef.current <= 0) {
      const isCombo = comboRef.current === 1 && comboWindowRef.current > 0;
      const atkDuration = isCombo ? 0.3 : 0.4;
      const atkDamage = isCombo ? PLAYER_ATTACK_DAMAGE * 1.3 : PLAYER_ATTACK_DAMAGE;

      attackCooldownRef.current = isCombo ? PLAYER_ATTACK_COOLDOWN * 0.8 : PLAYER_ATTACK_COOLDOWN;
      attackAnimRef.current = atkDuration;
      comboRef.current = isCombo ? 0 : 1;
      comboWindowRef.current = isCombo ? 0 : 0.6;

      const playerAngle = bodyRef.current.rotation.y;
      if (!isMoving) {
        vel.x += Math.sin(playerAngle) * 3;
        vel.z += Math.cos(playerAngle) * 3;
      }

      _forward.set(Math.sin(playerAngle), 0, Math.cos(playerAngle));
      const cosArc = Math.cos(PLAYER_ATTACK_ARC);

      const handle = enemiesHandleRef.current;
      if (handle) {
        const enemyMap = handle.getEnemies();
        enemyMap.forEach((enemy) => {
          if (enemy.state === 'dead') return;
          const dx = enemy.position[0] - pos.x;
          const dz = enemy.position[2] - pos.z;
          const distSq = dx * dx + dz * dz;
          if (distSq > PLAYER_ATTACK_RANGE * PLAYER_ATTACK_RANGE) return;
          const dist = Math.sqrt(distSq);
          _toEnemy.set(dx / dist, 0, dz / dist);
          if (_forward.dot(_toEnemy) > cosArc) {
            handle.hitEnemy(enemy.id, atkDamage);
          }
        });
      }

      // === PVP HIT DETECTION ===
      // Damage is allowed only when:
      //   1) Local player has a faction (guests cannot PvP).
      //   2) Remote player has a faction and a different one from local.
      //   3) An ACTIVE war exists between the two factions.
      //   4) BOTH players are inside the contested territory radius.
      if (onPvpHit && localClanId && remotePlayersRef?.current) {
        const pvpDmg = isCombo ? PVP_COMBO_DAMAGE : PVP_DAMAGE;
        const localFaction = getFactionById(localClanId);
        const localFactionColor = localFaction?.color ?? null;
        if (!localFactionColor) {
          // Local has no resolvable faction — skip PvP entirely.
        } else {
          const activeWars = activeWarsRef?.current;
          remotePlayersRef.current.forEach((remote) => {
            if (remote.health <= 0) return;
            if (!remote.clanColor) return;                        // guests can't be hit
            if (remote.clanColor === localFactionColor) return;   // same faction protection
            // Active-war gate (server-truth driven, refreshed by GameScene)
            const war = activeWars?.get(remote.clanColor);
            if (!war) return;
            // Local must be inside the war territory
            const aDx = pos.x - war.centerX;
            const aDz = pos.z - war.centerZ;
            if (aDx * aDx + aDz * aDz > war.radius * war.radius) return;
            // Remote must also be inside the war territory
            const rDx = remote.renderPosition[0] - war.centerX;
            const rDz = remote.renderPosition[2] - war.centerZ;
            if (rDx * rDx + rDz * rDz > war.radius * war.radius) return;
            // Existing arc + range check
            const dx = remote.renderPosition[0] - pos.x;
            const dz = remote.renderPosition[2] - pos.z;
            const distSq = dx * dx + dz * dz;
            if (distSq > PLAYER_ATTACK_RANGE * PLAYER_ATTACK_RANGE) return;
            const dist = Math.sqrt(distSq);
            if (dist < 0.01) return;
            _toEnemy.set(dx / dist, 0, dz / dist);
            if (_forward.dot(_toEnemy) > cosArc) {
              onPvpHit(remote.playerId, pvpDmg, isCombo);
            }
          });
        }
      }
    }

    // === GRAVITY & VERTICAL PHYSICS ===
    if (isMounted) {
      // MOUNTED: zero all vertical physics — Y is strictly terrain-derived
      vel.y = 0;
      isGroundedRef.current = true;
      wasInAirRef.current = false;
      jumpSquatRef.current = 0;
      landingImpactRef.current = 0;
      landRecoveryRef.current = 0;
    } else {
      vel.y -= GRAVITY * dt;
    }

    // === ENEMY PUSH-APART: prevent overlap pinning ===
    // Push player away from nearby alive enemies so they can't stack and trap the player
    const enemyHandle = enemiesHandleRef.current;
    if (enemyHandle) {
      const enemies = enemyHandle.getEnemies();
      let pushAwayX = 0, pushAwayZ = 0;
      const ENEMY_PUSH_RADIUS = 2.0; // start pushing when this close
      const ENEMY_PUSH_FORCE = 8;    // units/sec push strength
      enemies.forEach((e) => {
        if (e.state === 'dead') return;
        const edx = pos.x - e.position[0];
        const edz = pos.z - e.position[2];
        const eDist = Math.sqrt(edx * edx + edz * edz);
        if (eDist < ENEMY_PUSH_RADIUS && eDist > 0.01) {
          const overlap = 1 - eDist / ENEMY_PUSH_RADIUS; // 0..1
          pushAwayX += (edx / eDist) * overlap * ENEMY_PUSH_FORCE * dt;
          pushAwayZ += (edz / eDist) * overlap * ENEMY_PUSH_FORCE * dt;
        }
      });
      // Apply push — this lets the player slide out of enemy clusters
      pos.x += pushAwayX;
      pos.z += pushAwayZ;
    }

    // === STEP/SLOPE GUARD — no flying up cliffs (foot or horse) ===
    // If the candidate position would require climbing more than the gait allows,
    // try sliding along one axis; if both axes are too steep, stop horizontal motion.
    if (isMounted || isGroundedRef.current) {
      const baseStep = isMounted ? 0.85 : 0.55;
      const allowedStep = baseStep * (canRun ? 1.4 : 1.0);
      const curGround = getGroundHeight(pos.x, pos.z);
      const fullX = pos.x + vel.x * dt;
      const fullZ = pos.z + vel.z * dt;
      const fullDelta = getGroundHeight(fullX, fullZ) - curGround;
      if (fullDelta > allowedStep) {
        const onlyXDelta = getGroundHeight(fullX, pos.z) - curGround;
        const onlyZDelta = getGroundHeight(pos.x, fullZ) - curGround;
        if (onlyXDelta <= allowedStep && onlyXDelta < onlyZDelta) {
          // X-axis is OK, Z is the cliff — kill Z motion
          vel.z = 0;
        } else if (onlyZDelta <= allowedStep) {
          vel.x = 0;
        } else {
          // Both axes blocked
          vel.x = 0;
          vel.z = 0;
          currentSpeedRef.current *= 0.3;
        }
      }
    }

    // Apply horizontal movement
    pos.x += vel.x * dt;
    pos.z += vel.z * dt;
    if (!isMounted) {
      pos.y += vel.y * dt;
    }

    // === COLLISION RESOLUTION ===
    const colRadius = isMounted ? MOUNTED_RADIUS : PLAYER_RADIUS;
    const resolved = resolveCollision(pos.x, pos.z, colRadius);
    const pushX = resolved.x - pos.x;
    const pushZ = resolved.z - pos.z;
    if (Math.abs(pushX) > 0.001 || Math.abs(pushZ) > 0.001) {
      pos.x = resolved.x;
      pos.z = resolved.z;
      // Dampen velocity in push direction, but preserve at least 30% to allow escape
      if (pushX * vel.x < 0) vel.x *= 0.3;
      if (pushZ * vel.z < 0) vel.z *= 0.3;
    }

    // === GROUNDING — terrain height at FINAL resolved X/Z ===
    const heightOffset = isMounted ? 0 : PLAYER_HEIGHT / 2;
    const rawTerrainY = getTerrainHeight(pos.x, pos.z);
    // Bridge override: if player is on a bridge, use bridge deck height
    const bridgeY = getBridgeHeight(pos.x, pos.z);
    const groundY = bridgeY !== null ? bridgeY : rawTerrainY;
    const terrainY = groundY + heightOffset;

    if (isMounted) {
      // MOUNTED: ALWAYS snap to terrain — no conditional, no drift, no float
      pos.y = terrainY;

      // Slope pitch — sample terrain front/back along horse facing direction
      const pitchSampleDist = 1.2; // half horse body length
      const facingAngle = horseRotRef.current;
      const frontX = pos.x + Math.sin(facingAngle) * pitchSampleDist;
      const frontZ = pos.z + Math.cos(facingAngle) * pitchSampleDist;
      const backX = pos.x - Math.sin(facingAngle) * pitchSampleDist;
      const backZ = pos.z - Math.cos(facingAngle) * pitchSampleDist;
      const frontBridge = getBridgeHeight(frontX, frontZ);
      const backBridge = getBridgeHeight(backX, backZ);
      const frontY = frontBridge !== null ? frontBridge : getTerrainHeight(frontX, frontZ);
      const backY = backBridge !== null ? backBridge : getTerrainHeight(backX, backZ);
      const slopeAngle = Math.atan2(frontY - backY, pitchSampleDist * 2);
      const clampedPitch = THREE.MathUtils.clamp(slopeAngle, -0.45, 0.45); // ~25° max
      horsePitchRef.current = THREE.MathUtils.lerp(horsePitchRef.current, clampedPitch, dt * 8);

      // Debug data
      debugRef.current = {
        terrainY: groundY,
        horseY: groundY,
        riderY: pos.y,
        delta: pos.y - terrainY,
        pitch: horsePitchRef.current * (180 / Math.PI),
        pushX, pushZ,
      };
    } else {
      // On foot: standard conditional grounding with landing impact
      if (pos.y <= terrainY) {
        if (wasInAirRef.current && vel.y < -3) {
          landingImpactRef.current = Math.min(1, Math.abs(vel.y) / 12);
          landRecoveryRef.current = 1;
        }
        pos.y = terrainY;
        vel.y = 0;
        isGroundedRef.current = true;
        wasInAirRef.current = false;
      } else {
        wasInAirRef.current = true;
      }
      horsePitchRef.current = THREE.MathUtils.lerp(horsePitchRef.current, 0, dt * 10);
    }
    const halfWorld = 890;
    pos.x = THREE.MathUtils.clamp(pos.x, -halfWorld, halfWorld);
    pos.z = THREE.MathUtils.clamp(pos.z, -halfWorld, halfWorld);
    playerPositionRef.current.copy(pos);

    // Loot + coin collection
    if (!isMounted) {
      lootCheckRef.current += dt;
      if (lootCheckRef.current > 0.2) {
        lootCheckRef.current = 0;
        for (const loot of lootPickups) {
          if (loot.collected) continue;
          const dx = pos.x - loot.position[0];
          const dz = pos.z - loot.position[2];
          if (dx * dx + dz * dz < 4) onCollectLoot(loot.id);
        }
        // Try coin collection
        if (onTryCollectCoin) onTryCollectCoin();
      }
    }

    // Survival updates
    survivalAccumRef.current += dt;
    if (survivalAccumRef.current >= 0.1) {
      const elapsed = survivalAccumRef.current;
      survivalAccumRef.current = 0;

      let nearCampfire = false, nearShelter = false, nearBedroll = false;
      for (const s of structures) {
        const sdx = pos.x - s.position[0];
        const sdz = pos.z - s.position[2];
        const sdist = sdx * sdx + sdz * sdz;
        if (s.type === 'campfire' && sdist < CAMPFIRE_WARMTH_RANGE * CAMPFIRE_WARMTH_RANGE) nearCampfire = true;
        if (s.type === 'shelter' && sdist < SHELTER_EFFECT_RANGE * SHELTER_EFFECT_RANGE) nearShelter = true;
        if (s.type === 'bedroll' && sdist < 4 * 4) nearBedroll = true;
      }

      let zoneTempMod = 0;
      for (const poi of Object.values(POIS)) {
        const pdx = pos.x - poi.x;
        const pdz = pos.z - poi.z;
        if (pdx * pdx + pdz * pdz < POI_ZONE_RADIUS * POI_ZONE_RADIUS) zoneTempMod += poi.tempMod;
      }

      let tempChange = -TEMPERATURE_DRAIN * elapsed + zoneTempMod * elapsed;
      if (nearCampfire) tempChange += CAMPFIRE_WARMTH_RATE * elapsed;

      let hungerDrain = HUNGER_DRAIN * elapsed;
      if (nearShelter) hungerDrain *= SHELTER_HUNGER_REDUCTION;
      if (isMounted) hungerDrain *= 0.7;

      let staminaChange: number;
      if (canRun && isMoving) {
        staminaChange = -(isMounted ? STAMINA_DRAIN * 0.4 : STAMINA_DRAIN) * elapsed;
      } else {
        let regenRate = STAMINA_REGEN;
        // Graduated stamina penalty based on hunger level
        if (survival.hunger <= 0) {
          regenRate *= 0.2; // almost no regen when starving
        } else if (survival.hunger < LOW_HUNGER_THRESHOLD) {
          regenRate *= 0.4;
        } else if (survival.hunger < 40) {
          regenRate *= 0.7; // mild penalty at medium hunger
        }
        if (nearShelter) regenRate += SHELTER_STAMINA_BONUS;
        if (nearBedroll && !isMoving) regenRate += 12;
        staminaChange = regenRate * elapsed;
      }

      // HP is combat-only — no survival damage, no passive HP drain or heal
      // Hunger/temperature are cosmetic stats only

      onSurvivalUpdate({
        stamina: survival.stamina + staminaChange,
        hunger: survival.hunger - hungerDrain,
        temperature: survival.temperature + tempChange,
      });
    }

    // Sync external refs for multiplayer broadcaster
    if (externalMoveSpeedRef) externalMoveSpeedRef.current = moveSpeedRef.current;
    if (externalIsRunningRef) externalIsRunningRef.current = isMoving && canRun;
    if (externalIsGroundedRef) externalIsGroundedRef.current = isGroundedRef.current;
    if (externalAttackAnimRef) externalAttackAnimRef.current = attackAnimRef.current;
  });

  // === RICH PROCEDURAL ANIMATION ===
  const t = animTimeRef.current;
  const ms = moveSpeedRef.current;
  const attackT = attackAnimRef.current;
  const attacking = attackT > 0;
  const inAir = wasInAirRef.current;
  const landImpact = landingImpactRef.current;
  const landRecovery = landRecoveryRef.current;
  const lean = leanRef.current;
  const hipSway = hipSwayRef.current;
  const turnDelta = turnDeltaRef.current;
  const isComboSwing = comboRef.current === 0 && attacking;
  const jumpSquat = jumpSquatRef.current > 0 ? 1 : 0;

  // Locomotion — distinct walk vs run gaits
  const isRunning = ms > 0.7;
  const walkCycle = Math.sin(t);
  const runCycle = Math.sin(t * 1.1); // slightly faster cadence for run
  const gaitBlend = THREE.MathUtils.smoothstep(ms, 0.3, 0.8);

  // Leg swing — walk is longer stride, run is higher knee lift
  const walkLeg = walkCycle * 0.6;
  const runLeg = runCycle * 0.85;
  const legSwing = THREE.MathUtils.lerp(walkLeg, runLeg, gaitBlend) * ms;
  const legSwingBack = THREE.MathUtils.lerp(
    Math.sin(t + Math.PI) * 0.6,
    Math.sin(t * 1.1 + Math.PI) * 0.85,
    gaitBlend
  ) * ms;

  // Arms — counter-swing with phase offset
  const armSwing = THREE.MathUtils.lerp(
    Math.sin(t + 0.3) * 0.4,
    Math.sin(t * 1.1 + 0.3) * 0.65,
    gaitBlend
  ) * ms;
  const armSwingBack = THREE.MathUtils.lerp(
    Math.sin(t + Math.PI + 0.3) * 0.4,
    Math.sin(t * 1.1 + Math.PI + 0.3) * 0.65,
    gaitBlend
  ) * ms;

  // Body dynamics
  const bodyBob = Math.abs(Math.sin(t * 2)) * (isRunning ? 0.12 : 0.06) * ms
    - landImpact * 0.2
    - landRecovery * 0.1
    - jumpSquat * 0.08;
  const bodyForwardLean = ms * 0.05 + (isRunning ? 0.08 : 0) + jumpSquat * 0.12 + landRecovery * 0.06;
  const shoulderRoll = Math.sin(t) * (isRunning ? 0.06 : 0.03) * ms;
  const torsoTwist = Math.sin(t) * (isRunning ? 0.08 : 0.05) * ms + turnDelta * 0.15;

  // Attack animation — forward strike
  // Arm X rotation: NEGATIVE = swing forward (hand from -Y toward +Z), POSITIVE = pull back
  let atkSwingR = 0, atkSwingL = 0, atkBodyTwist = 0, atkLunge = 0;
  if (attacking) {
    const duration = isComboSwing ? 0.3 : 0.4;
    const phase = 1 - attackT / duration;

    if (isComboSwing) {
      // Combo: left-arm cross slash
      if (phase < 0.1) {
        const wp = phase / 0.1;
        atkSwingR = -0.2 * wp;
        atkSwingL = 0.4 * wp; // pull back slightly
        atkBodyTwist = -0.15 * wp;
      } else if (phase < 0.45) {
        const sp = (phase - 0.1) / 0.35;
        const ease = 1 - (1 - sp) * (1 - sp);
        atkSwingR = -0.2 * (1 - ease);
        atkSwingL = 0.4 - ease * 2.0; // swing to -1.6 (forward)
        atkBodyTwist = -0.15 + ease * 0.45;
        atkLunge = ease * 0.3;
      } else {
        const rp = (phase - 0.45) / 0.55;
        const ease = 1 - (1 - rp) * (1 - rp);
        atkSwingL = -1.6 * (1 - ease);
        atkBodyTwist = 0.3 * (1 - ease);
        atkLunge = 0.3 * (1 - ease);
      }
    } else {
      // Primary slash — right arm forward strike
      if (phase < 0.1) {
        // Brief wind-up — arm pulls back slightly (positive = back)
        const wp = phase / 0.1;
        atkSwingR = 0.5 * wp;
        atkBodyTwist = 0.1 * wp;
      } else if (phase < 0.5) {
        // MAIN FORWARD STRIKE — arm swings forward (negative)
        const sp = (phase - 0.1) / 0.4;
        const ease = 1 - (1 - sp) * (1 - sp);
        atkSwingR = 0.5 - ease * 2.3; // swing from +0.5 to -1.8 (forward!)
        atkBodyTwist = 0.1 - ease * 0.45;
        atkLunge = ease * 0.35;
      } else {
        // Quick recovery
        const rp = (phase - 0.5) / 0.5;
        const ease = 1 - (1 - rp) * (1 - rp);
        atkSwingR = -1.8 * (1 - ease);
        atkBodyTwist = -0.35 * (1 - ease);
        atkLunge = 0.35 * (1 - ease);
      }
    }
  }

  // Idle animation — breathing, weight shifting, subtle life
  const idleT = idleShiftRef.current;
  const idleBlend = 1 - THREE.MathUtils.smoothstep(ms, 0, 0.15); // fade out as movement starts
  const idleBreath = idleBlend * Math.sin(idleT * 1.5) * 0.015;
  const idleWeightShift = idleBlend * Math.sin(idleT * 0.35) * 0.025;
  const idleSway = idleBlend * Math.sin(idleT * 0.6) * 0.02;
  const idleHeadLook = idleBlend * Math.sin(idleT * 0.25) * 0.04;

  // In-air pose — dynamic
  const airT = inAir ? 1 : 0;
  const airLegSpread = airT * 0.2;
  const airArmRaise = airT * -0.4;
  const airBodyCurl = airT * -0.05; // slight forward curl

  // Horse animation: driven by horse.glb (single bundled file with all clips)
  // Only rider lean/sway is procedural polish.
  const riderLean = isMounted ? lean * 0.6 : 0;
  const horsePitch = horsePitchRef.current;
  const riderSlopeComp = isMounted ? -horsePitch * 0.35 : 0;

  if (isDead) {
    return (
      <group ref={groupRef}>
        {character === 'goblin' ? (
          <GoblinDeadModel />
        ) : character === 'octopus' ? (
          <OctopusDeadModel />
        ) : (
          // Generic death pose for soldier, nemoclaw, chillhouse, yeti, dog
          <group rotation={[Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
            <mesh castShadow>
              <capsuleGeometry args={[0.3, 1, 4, 8]} />
              <meshLambertMaterial color="#4a3520" />
            </mesh>
          </group>
        )}
      </group>
    );
  }

  const playerY = isMounted ? 1.2 : 0;

  return (
    <group ref={groupRef}>
      <group ref={bodyRef}>
        {/* ===== MOUNTED HORSE (GLB) ===== */}
        {isMounted && (
          <group position={[riderLean * 0.1, 0, 0]} rotation={[horsePitch, 0, 0]}>
            <Suspense fallback={
              <mesh>
                <boxGeometry args={[1, 2, 2]} />
                <meshStandardMaterial color="brown" wireframe />
              </mesh>
            }>
              <HorseGLBModel moveSpeed={currentSpeedRef} renderPath="mounted-local" />
            </Suspense>
          </group>
        )}

        {/* ===== PLAYER CHARACTER — GLB MODEL ===== */}
        <group
          position={[isMounted ? 0 : hipSway + idleWeightShift, playerY, isMounted ? 0 : atkLunge]}
          rotation={[
            isMounted ? riderSlopeComp : bodyForwardLean + idleSway + airBodyCurl + riderSlopeComp,
            isMounted ? 0 : torsoTwist + atkBodyTwist + idleHeadLook,
            isMounted ? riderLean : lean + riderLean
          ]}
        >
          {character === 'goblin' ? (
            <GoblinGLBModel moveSpeedRef={isMounted ? mountedZeroRef : moveSpeedRef} controllerHalfHeight={PLAYER_HEIGHT / 2} isGroundedRef={isGroundedRef} activeEmote={activeEmote} activeEmoteId={activeEmoteId} onEmoteComplete={onEmoteComplete} damageFlash={damageFlash} attackAnimRef={isMounted ? mountedZeroRef : attackAnimRef} isFightingRef={isFightingRef} />
          ) : character === 'octopus' ? (
            <OctopusGLBModel moveSpeedRef={isMounted ? mountedZeroRef : moveSpeedRef} controllerHalfHeight={PLAYER_HEIGHT / 2} isGroundedRef={isGroundedRef} activeEmote={activeEmote} activeEmoteId={activeEmoteId} onEmoteComplete={onEmoteComplete} damageFlash={damageFlash} attackAnimRef={isMounted ? mountedZeroRef : attackAnimRef} isFightingRef={isFightingRef} />
          ) : character === 'nemoclaw' ? (
            <NemoClawGLBModel moveSpeedRef={isMounted ? mountedZeroRef : moveSpeedRef} controllerHalfHeight={PLAYER_HEIGHT / 2} isGroundedRef={isGroundedRef} activeEmote={activeEmote} activeEmoteId={activeEmoteId} onEmoteComplete={onEmoteComplete} damageFlash={damageFlash} attackAnimRef={isMounted ? mountedZeroRef : attackAnimRef} isFightingRef={isFightingRef} />
          ) : character === 'chillhouse' ? (
            <ChillhouseGLBModel moveSpeedRef={isMounted ? mountedZeroRef : moveSpeedRef} controllerHalfHeight={PLAYER_HEIGHT / 2} isGroundedRef={isGroundedRef} activeEmote={activeEmote} activeEmoteId={activeEmoteId} onEmoteComplete={onEmoteComplete} damageFlash={damageFlash} attackAnimRef={isMounted ? mountedZeroRef : attackAnimRef} isFightingRef={isFightingRef} />
          ) : (character === 'yeti' || character === 'dog') ? (
            <PlaceholderLocalModel factionColor={getFactionByCharacter(character)?.colorHex || '#888'} label={character} moveSpeedRef={isMounted ? mountedZeroRef : moveSpeedRef} controllerHalfHeight={PLAYER_HEIGHT / 2} isGroundedRef={isGroundedRef} activeEmote={activeEmote} activeEmoteId={activeEmoteId} onEmoteComplete={onEmoteComplete} damageFlash={damageFlash} attackAnimRef={isMounted ? mountedZeroRef : attackAnimRef} isFightingRef={isFightingRef} />
          ) : (
            <PlayerGLBModel moveSpeedRef={isMounted ? mountedZeroRef : moveSpeedRef} controllerHalfHeight={PLAYER_HEIGHT / 2} isGroundedRef={isGroundedRef} activeEmote={activeEmote} activeEmoteId={activeEmoteId} onEmoteComplete={onEmoteComplete} damageFlash={damageFlash} attackAnimRef={isMounted ? mountedZeroRef : attackAnimRef} isFightingRef={isFightingRef} />
          )}
        </group>
      </group>
    </group>
  );
}

