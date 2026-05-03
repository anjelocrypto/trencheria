/**
 * DevPreview — DEV-ONLY character + horse animation harness.
 *
 * Route: /dev/preview  (gated on import.meta.env.DEV — returns NotFound in production).
 *
 * Lets you cycle every playable character + horse + select NPCs through every animation
 * state (idle / walk / run / jump / fight / hit / emote_pushup / emote_agree / emote_wave)
 * without needing to log in, join multiplayer, or run the game world.
 *
 * Does NOT touch SQL, Supabase, clan-war logic, networking, or production gameplay.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import * as THREE from 'three';

import NotFound from './NotFound';

import { PlayerGLBModel } from '../game/components/PlayerCharacterModel';
import { GoblinGLBModel } from '../game/components/GoblinCharacterModel';
import { OctopusGLBModel } from '../game/components/OctopusCharacterModel';
import { NemoClawGLBModel } from '../game/components/NemoClawCharacterModel';
import { ChillhouseGLBModel } from '../game/components/ChillhouseCharacterModel';
import { HorseGLBModel } from '../game/components/HorseGLBModel';
import { ElderManModel } from '../game/components/ElderManModel';
import { GardenerWomanModel } from '../game/components/GardenerWomanModel';
import { GuardianModel } from '../game/components/GuardianModel';
import { VillagerMan1Model } from '../game/components/VillagerMan1Model';
import { VillagerWoman1Model } from '../game/components/VillagerWoman1Model';

type PlayableId = 'soldier' | 'goblin' | 'octopus' | 'nemoclaw' | 'chillhouse';
type NpcId = 'elderman' | 'gardener' | 'guardian' | 'villagerMan1' | 'villagerWoman1';
type SubjectKind = 'playable' | 'horse' | 'npc';

interface SubjectChoice {
  id: string;
  label: string;
  kind: SubjectKind;
  playable?: PlayableId;
  npc?: NpcId;
}

const SUBJECTS: SubjectChoice[] = [
  { id: 'soldier',       label: 'Soldier (default)',  kind: 'playable', playable: 'soldier' },
  { id: 'goblin',        label: 'Goblin',             kind: 'playable', playable: 'goblin' },
  { id: 'octopus',       label: 'Octopus',            kind: 'playable', playable: 'octopus' },
  { id: 'nemoclaw',      label: 'NemoClaw',           kind: 'playable', playable: 'nemoclaw' },
  { id: 'chillhouse',    label: 'ChillGuys',          kind: 'playable', playable: 'chillhouse' },
  { id: 'horse',         label: 'Horse (stand/walk)', kind: 'horse' },
  { id: 'elderman',      label: 'NPC: Elder Man',     kind: 'npc', npc: 'elderman' },
  { id: 'gardener',      label: 'NPC: Gardener',      kind: 'npc', npc: 'gardener' },
  { id: 'guardian',      label: 'NPC: Guardian',      kind: 'npc', npc: 'guardian' },
  { id: 'villagerMan1',  label: 'NPC: Villager Man',  kind: 'npc', npc: 'villagerMan1' },
  { id: 'villagerWoman1',label: 'NPC: Villager Woman',kind: 'npc', npc: 'villagerWoman1' },
];

type AnimState =
  | 'idle' | 'walk' | 'run' | 'jump'
  | 'fight' | 'hit'
  | 'emote_pushup' | 'emote_agree' | 'emote_wave';

const PLAYABLE_ACTIONS: { id: AnimState; label: string }[] = [
  { id: 'idle',          label: 'Idle' },
  { id: 'walk',          label: 'Walk' },
  { id: 'run',           label: 'Run' },
  { id: 'jump',          label: 'Jump' },
  { id: 'fight',         label: 'Fight' },
  { id: 'hit',           label: 'Get Hit' },
  { id: 'emote_pushup',  label: 'Emote: Pushup' },
  { id: 'emote_agree',   label: 'Emote: Agree' },
  { id: 'emote_wave',    label: 'Emote: Wave' },
];

const HORSE_ACTIONS: { id: 'stand' | 'walk'; label: string }[] = [
  { id: 'stand', label: 'Stand' },
  { id: 'walk',  label: 'Walk' },
];

// ------------------------------------------------------------------
// Playable harness — drives the 5 playable character GLB components
// with mock refs that mirror what the real game runtime feeds in.
// ------------------------------------------------------------------

function PlayableHarness({ playable, anim }: { playable: PlayableId; anim: AnimState }) {
  // Mock refs that the real game would update from controller/network state.
  const moveSpeedRef = useRef(0);
  const isGroundedRef = useRef(true);
  const attackAnimRef = useRef(0);
  const isFightingRef = useRef(false);

  const [activeEmote, setActiveEmote] = useState<string | null>(null);
  const [activeEmoteId, setActiveEmoteId] = useState(0);
  const [damageFlash, setDamageFlash] = useState(0);

  // Drive mock state from the selected anim.
  useEffect(() => {
    // Defaults
    moveSpeedRef.current = 0;
    isGroundedRef.current = true;
    isFightingRef.current = false;
    setActiveEmote(null);

    switch (anim) {
      case 'idle': break;
      case 'walk': moveSpeedRef.current = 0.5; break;
      case 'run':  moveSpeedRef.current = 1.0; break;
      case 'jump': isGroundedRef.current = false; break;
      case 'fight':
        isFightingRef.current = true;
        attackAnimRef.current = (attackAnimRef.current ?? 0) + 1;
        break;
      case 'hit':
        setDamageFlash((n) => n + 1);
        break;
      case 'emote_pushup':
        setActiveEmoteId((n) => n + 1);
        setActiveEmote('pushup');
        break;
      case 'emote_agree':
        setActiveEmoteId((n) => n + 1);
        setActiveEmote('agree');
        break;
      case 'emote_wave':
        setActiveEmoteId((n) => n + 1);
        setActiveEmote('wave');
        break;
    }
  }, [anim]);

  const onEmoteComplete = useCallback(() => setActiveEmote(null), []);

  const commonProps = {
    moveSpeedRef,
    controllerHalfHeight: 0.9,
    isGroundedRef,
    activeEmote,
    activeEmoteId,
    onEmoteComplete,
    damageFlash,
    attackAnimRef,
    isFightingRef,
  };

  switch (playable) {
    case 'soldier':    return <PlayerGLBModel    {...commonProps} />;
    case 'goblin':     return <GoblinGLBModel    {...commonProps} />;
    case 'octopus':    return <OctopusGLBModel   {...commonProps} />;
    case 'nemoclaw':   return <NemoClawGLBModel  {...commonProps} />;
    case 'chillhouse': return <ChillhouseGLBModel{...commonProps} />;
  }
}

// ------------------------------------------------------------------
// Horse harness
// ------------------------------------------------------------------

function HorseHarness({ phase }: { phase: 'stand' | 'walk' }) {
  const moveSpeed = phase === 'walk' ? 1.0 : 0;
  return <HorseGLBModel moveSpeed={moveSpeed} renderPath="dev-preview" />;
}

// ------------------------------------------------------------------
// NPC harness — NPCs only have stand+walk clips per the audit.
// We feed a stationary `def` and a moving `playerPos` to drive walk.
// ------------------------------------------------------------------

function NpcHarness({ npc, phase }: { npc: NpcId; phase: 'stand' | 'walk' }) {
  const def = useMemo(() => ({
    id: `dev-${npc}`,
    homePos: [0, 0, 0] as [number, number, number],
    patrolRadius: phase === 'walk' ? 4 : 0,
    patrolSpeed: phase === 'walk' ? 1.2 : 0,
    facingAngle: 0,
    standDuration: phase === 'stand' ? 9999 : 0,
    walkDuration:  phase === 'walk' ? 9999 : 0,
  }), [npc, phase]);

  // Provide a non-null playerPos so NPC update logic actually runs.
  const playerPos = useMemo(() => new THREE.Vector3(20, 0, 20), []);

  switch (npc) {
    case 'elderman':       return <ElderManModel       def={def} playerPos={playerPos} />;
    case 'gardener':       return <GardenerWomanModel  def={def} playerPos={playerPos} />;
    case 'guardian':       return <GuardianModel       def={def} playerPos={playerPos} />;
    case 'villagerMan1':   return <VillagerMan1Model   def={def} playerPos={playerPos} />;
    case 'villagerWoman1': return <VillagerWoman1Model def={def} playerPos={playerPos} />;
  }
}

// ------------------------------------------------------------------
// Page
// ------------------------------------------------------------------

export default function DevPreview() {
  // Hard gate: if not running in Vite dev mode, render NotFound and bail.
  // (This means /dev/preview returns 404 in production builds.)
  if (!import.meta.env.DEV) return <NotFound />;

  const [subjectId, setSubjectId] = useState<string>('soldier');
  const subject = SUBJECTS.find((s) => s.id === subjectId) ?? SUBJECTS[0];

  const [playableAnim, setPlayableAnim] = useState<AnimState>('idle');
  const [horsePhase, setHorsePhase] = useState<'stand' | 'walk'>('stand');
  const [npcPhase, setNpcPhase] = useState<'stand' | 'walk'>('stand');

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0b0d12', color: '#e8eaed', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #222', background: '#11141a', fontFamily: 'system-ui, sans-serif', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '0.05em' }}>DEV CHARACTER PREVIEW</div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#9aa0a6' }}>Subject:</span>
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            style={{ background: '#1a1f29', color: '#e8eaed', border: '1px solid #2a3140', padding: '4px 8px', fontSize: 12 }}
          >
            {SUBJECTS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>

        {subject.kind === 'playable' && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {PLAYABLE_ACTIONS.map((a) => (
              <button
                key={a.id}
                onClick={() => setPlayableAnim(a.id)}
                style={btnStyle(playableAnim === a.id)}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}

        {subject.kind === 'horse' && (
          <div style={{ display: 'flex', gap: 4 }}>
            {HORSE_ACTIONS.map((a) => (
              <button key={a.id} onClick={() => setHorsePhase(a.id)} style={btnStyle(horsePhase === a.id)}>
                {a.label}
              </button>
            ))}
          </div>
        )}

        {subject.kind === 'npc' && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setNpcPhase('stand')} style={btnStyle(npcPhase === 'stand')}>Stand</button>
            <button onClick={() => setNpcPhase('walk')}  style={btnStyle(npcPhase === 'walk')}>Walk</button>
          </div>
        )}

        <div style={{ marginLeft: 'auto', fontSize: 11, color: '#6c7280' }}>
          Drag to rotate • Scroll to zoom • DEV BUILD ONLY
        </div>
      </div>

      {/* Status line */}
      <div style={{ padding: '6px 16px', fontSize: 11, color: '#9aa0a6', background: '#0e1117', borderBottom: '1px solid #1a1f29' }}>
        {subject.kind === 'playable' && <span>Playable: <b>{subject.label}</b> · Anim: <b>{playableAnim}</b></span>}
        {subject.kind === 'horse' && <span>Horse phase: <b>{horsePhase}</b></span>}
        {subject.kind === 'npc' && <span>NPC: <b>{subject.label}</b> · Phase: <b>{npcPhase}</b></span>}
      </div>

      {/* 3D Canvas */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <Canvas
          shadows
          camera={{ position: [3.2, 2.4, 4.5], fov: 45 }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <color attach="background" args={[0x10141b]} />
          <hemisphereLight args={[0xffffff, 0x444444, 0.8]} />
          <directionalLight
            position={[5, 8, 4]}
            intensity={1.2}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />
          <Environment preset="city" />

          {/* Ground grid */}
          <Grid
            args={[20, 20]}
            cellSize={0.5}
            cellThickness={0.6}
            cellColor="#2a3140"
            sectionSize={2}
            sectionThickness={1}
            sectionColor="#3a4258"
            fadeDistance={20}
            fadeStrength={1}
            infiniteGrid
            position={[0, 0.001, 0]}
          />
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[40, 40]} />
            <meshStandardMaterial color="#0b0d12" />
          </mesh>

          {/* Subject */}
          <group position={[0, 0, 0]}>
            {subject.kind === 'playable' && subject.playable && (
              <PlayableHarness playable={subject.playable} anim={playableAnim} />
            )}
            {subject.kind === 'horse' && <HorseHarness phase={horsePhase} />}
            {subject.kind === 'npc' && subject.npc && (
              <NpcHarness npc={subject.npc} phase={npcPhase} />
            )}
          </group>

          <OrbitControls target={[0, 1, 0]} enableDamping dampingFactor={0.1} />
        </Canvas>
      </div>
    </div>
  );
}

function btnStyle(active: boolean): React.CSSProperties {
  return {
    padding: '4px 10px',
    fontSize: 12,
    background: active ? '#3a8bff' : '#1a1f29',
    color: active ? '#fff' : '#e8eaed',
    border: '1px solid ' + (active ? '#3a8bff' : '#2a3140'),
    borderRadius: 3,
    cursor: 'pointer',
    fontFamily: 'system-ui, sans-serif',
  };
}
