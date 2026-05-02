import { forwardRef, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NetworkPlayerState } from './types';
import { SurvivalState } from '../types';
import { HorseData } from '../systems/HorseData';
import { MountedDebugData } from '../components/Player';
import { CharacterType } from '../context/CharacterContext';
import { loadWalletSession } from '../hooks/usePlayerAccount';
import { getFactionById } from '../systems/FactionData';

interface Props {
  playerId: string;
  displayName: string;
  characterType: CharacterType;
  playerPositionRef: React.RefObject<THREE.Vector3>;
  playerRotationRef: React.RefObject<number>;
  survival: SurvivalState;
  isMounted: boolean;
  horse: HorseData;
  moveSpeedRef: React.RefObject<number>;
  isRunningRef: React.RefObject<boolean>;
  isGroundedRef: React.RefObject<boolean>;
  attackAnimRef: React.RefObject<number>;
  mountedDebugRef: React.RefObject<MountedDebugData>;
  buildMode: boolean;
  emote: string | null;
  isSpeaking: boolean;
  onUpdateLocalState: (state: NetworkPlayerState) => void;
}

export const MultiplayerBroadcaster = forwardRef<THREE.Object3D, Props>(function MultiplayerBroadcaster({
  playerId, displayName, characterType, playerPositionRef, playerRotationRef,
  survival, isMounted, horse, moveSpeedRef, isRunningRef, isGroundedRef, attackAnimRef,
  mountedDebugRef, buildMode, emote, isSpeaking, onUpdateLocalState,
}, _ref) {
  // Faction identity is read from stored session — no async RPC polling needed
  const factionRef = useRef<{ name: string | null; color: string | null }>({ name: null, color: null });

  // Read faction from session once (it's permanent, never changes)
  if (factionRef.current.name === null) {
    const session = loadWalletSession();
    if (session?.faction_id) {
      const faction = getFactionById(session.faction_id);
      if (faction) {
        factionRef.current = { name: faction.name, color: faction.color };
      } else {
        factionRef.current = { name: session.faction_name, color: session.faction_color };
      }
    }
  }

  // PERF: allocate the broadcast state object and its position/horsePosition tuples once,
  // then mutate fields in place each frame. Previously this allocated a new object plus
  // a fresh [x,y,z] array every frame — significant GC pressure when the player moves.
  // The downstream useMultiplayer.updateLocalState only reads fields synchronously and
  // captures a snapshot at the broadcast cadence (MOVE_BROADCAST_MS / META_BROADCAST_MS),
  // so reusing the same instance is safe.
  const stateRef = useRef<NetworkPlayerState | null>(null);
  if (stateRef.current === null) {
    stateRef.current = {
      playerId,
      displayName,
      characterType,
      position: [0, 0, 0],
      rotation: 0,
      moveSpeed: 0,
      isRunning: false,
      isGrounded: true,
      isMounted: false,
      health: 100,
      maxHealth: 100,
      stamina: 100,
      hunger: 100,
      temperature: 50,
      attackAnim: 0,
      buildMode: false,
      horsePitch: 0,
      horsePosition: [horse.position[0], horse.position[1], horse.position[2]],
      horseRotation: horse.rotation,
      horseState: horse.state,
      emote: null,
      isSpeaking: false,
      clanName: factionRef.current.name,
      clanColor: factionRef.current.color,
      timestamp: 0,
    };
  }

  useFrame(() => {
    const pos = playerPositionRef.current;
    const rot = playerRotationRef.current;
    if (!pos) return;

    const state = stateRef.current!;
    // Identity / display fields — cheap re-assigns, no allocation
    state.playerId = playerId;
    state.displayName = displayName;
    state.characterType = characterType;
    // Position tuple — mutate in place to avoid per-frame array alloc
    state.position[0] = pos.x;
    state.position[1] = pos.y;
    state.position[2] = pos.z;
    state.rotation = rot ?? 0;
    state.moveSpeed = moveSpeedRef.current ?? 0;
    state.isRunning = isRunningRef.current ?? false;
    state.isGrounded = isGroundedRef.current ?? true;
    state.isMounted = isMounted;
    state.health = survival.health;
    state.maxHealth = 100;
    state.stamina = survival.stamina;
    state.hunger = survival.hunger;
    state.temperature = survival.temperature;
    state.attackAnim = attackAnimRef.current ?? 0;
    state.buildMode = buildMode;
    state.horsePitch = mountedDebugRef.current?.pitch ?? 0;
    // Horse position tuple — mutate in place; horse.position is itself a stable tuple
    // updated by horse logic.
    state.horsePosition[0] = horse.position[0];
    state.horsePosition[1] = horse.position[1];
    state.horsePosition[2] = horse.position[2];
    state.horseRotation = horse.rotation;
    state.horseState = horse.state;
    state.emote = emote;
    state.isSpeaking = isSpeaking;
    state.clanName = factionRef.current.name;
    state.clanColor = factionRef.current.color;
    state.timestamp = Date.now();

    onUpdateLocalState(state);
  });

  return null;
});
