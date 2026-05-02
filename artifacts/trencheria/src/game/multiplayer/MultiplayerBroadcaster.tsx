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

  useFrame(() => {
    const pos = playerPositionRef.current;
    const rot = playerRotationRef.current;
    if (!pos) return;

    const state: NetworkPlayerState = {
      playerId,
      displayName,
      characterType,
      position: [pos.x, pos.y, pos.z],
      rotation: rot ?? 0,
      moveSpeed: moveSpeedRef.current ?? 0,
      isRunning: isRunningRef.current ?? false,
      isGrounded: isGroundedRef.current ?? true,
      isMounted,
      health: survival.health,
      maxHealth: 100,
      stamina: survival.stamina,
      hunger: survival.hunger,
      temperature: survival.temperature,
      attackAnim: attackAnimRef.current ?? 0,
      buildMode,
      horsePitch: mountedDebugRef.current?.pitch ?? 0,
      horsePosition: horse.position,
      horseRotation: horse.rotation,
      horseState: horse.state,
      emote,
      isSpeaking,
      clanName: factionRef.current.name,
      clanColor: factionRef.current.color,
      timestamp: Date.now(),
    };
    onUpdateLocalState(state);
  });

  return null;
});
