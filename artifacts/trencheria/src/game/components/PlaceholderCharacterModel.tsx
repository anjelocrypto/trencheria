/**
 * Placeholder character model for factions without real GLB assets (Yetis, Dogs).
 * Uses simple geometric shapes with faction-colored material.
 * Designed for easy replacement — just swap this component for a real GLB model later.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface Props {
  factionColor: string;
  label: string;
  moveSpeedRef?: React.MutableRefObject<number>;
  isGroundedRef?: React.MutableRefObject<boolean>;
  /** Static version for remote players — no refs needed */
  moveSpeed?: number;
  isGrounded?: boolean;
}

export function PlaceholderCharacterModel({
  factionColor,
  label,
  moveSpeedRef,
  isGroundedRef,
  moveSpeed: staticMoveSpeed,
  isGrounded: staticIsGrounded,
}: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const bobRef = useRef(0);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const speed = moveSpeedRef?.current ?? staticMoveSpeed ?? 0;
    if (speed > 0.05) {
      bobRef.current += delta * 8;
      groupRef.current.position.y = Math.abs(Math.sin(bobRef.current)) * 0.1;
    } else {
      bobRef.current = 0;
      groupRef.current.position.y = 0;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Body */}
      <mesh position={[0, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.35, 1.0, 6, 12]} />
        <meshStandardMaterial color={factionColor} roughness={0.6} metalness={0.2} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.8, 0]} castShadow>
        <sphereGeometry args={[0.25, 12, 12]} />
        <meshStandardMaterial color={factionColor} roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Eyes */}
      <mesh position={[0.1, 1.85, 0.2]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[-0.1, 1.85, 0.2]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.3} />
      </mesh>
      {/* Faction icon floating above */}
      {/* Arms */}
      <mesh position={[0.45, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.1, 0.5, 4, 8]} />
        <meshStandardMaterial color={factionColor} roughness={0.7} />
      </mesh>
      <mesh position={[-0.45, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.1, 0.5, 4, 8]} />
        <meshStandardMaterial color={factionColor} roughness={0.7} />
      </mesh>
    </group>
  );
}

/** Local player placeholder — wraps with same interface as real character models */
export function PlaceholderLocalModel({
  factionColor,
  label,
  moveSpeedRef,
  isGroundedRef,
}: {
  factionColor: string;
  label: string;
  moveSpeedRef: React.MutableRefObject<number>;
  controllerHalfHeight: number;
  isGroundedRef: React.MutableRefObject<boolean>;
  activeEmote: string | null;
  activeEmoteId?: number;
  onEmoteComplete: () => void;
  damageFlash?: number;
  attackAnimRef?: React.MutableRefObject<number>;
  isFightingRef?: React.MutableRefObject<boolean>;
}) {
  return (
    <PlaceholderCharacterModel
      factionColor={factionColor}
      label={label}
      moveSpeedRef={moveSpeedRef}
      isGroundedRef={isGroundedRef}
    />
  );
}

/** Remote player placeholder — uses static values */
export function PlaceholderRemoteModel({
  factionColor,
  label,
  moveSpeed,
}: {
  factionColor: string;
  label: string;
  moveSpeed: number;
  isRunning: boolean;
  isGrounded: boolean;
  attackAnim: number;
  health: number;
  emote: string | null;
}) {
  return (
    <PlaceholderCharacterModel
      factionColor={factionColor}
      label={label}
      moveSpeed={moveSpeed}
      isGrounded={true}
    />
  );
}
