import { devLog, devWarn } from '../utils/devLog';
/**
 * Proximity Voice Chat — WebRTC peer-to-peer audio with Supabase signaling.
 *
 * Architecture:
 * - Uses the existing Supabase Realtime channel for WebRTC signaling
 *   (SDP offers/answers/ICE candidates) and speaking-state broadcasts.
 * - Establishes direct WebRTC peer connections for audio between players.
 * - Uses Web Audio API GainNodes for distance-based attenuation.
 * - Push-to-talk on K key: mic track is muted/unmuted (not re-acquired).
 *
 * Scalability:
 * - MAX_VOICE_PEERS caps simultaneous WebRTC connections (default 6).
 * - Only creates peers for the N closest players within hearing range.
 * - Periodically prunes far-away peers to free resources.
 */

import { useRef, useCallback, useEffect, useState } from 'react';
// RealtimeChannel type — defined locally to remove @supabase/supabase-js dependency
type RealtimeChannel = ReturnType<typeof import('@/integrations/supabase/client').supabase.channel>;
import * as THREE from 'three';
import { MAX_VOICE_PEERS } from './types';

// ─── Config ───
const VOICE_MAX_RANGE = 40;
const VOICE_FULL_RANGE = 15;
const VOICE_GAIN = 1.6;
const VOICE_SILENCE_THRESHOLD = 0.005;
const VOICE_INIT_DELAY_MS = 3000;
const VOICE_PEER_SYNC_MS = 2000; // how often to re-evaluate peer set
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];
const PEER_RETRY_DELAY_MS = 2000;
const PEER_RETRY_MAX = 3;

// ─── Rate-limited voice logger ───
const vLog: Record<string, number> = {};
function voiceLog(label: string, data?: Record<string, unknown>) {
  const c = vLog[label] ?? 0;
  if (c >= 8) return;
  vLog[label] = c + 1;
  const s = data ? ' — ' + JSON.stringify(data) : '';
  devLog(`[Voice] ${label}${s}`);
}

interface PeerEntry {
  pc: RTCPeerConnection;
  audioEl: HTMLAudioElement;
  gainNode: GainNode;
  sourceNode: MediaElementAudioSourceNode | null;
  hasRemoteDesc: boolean;
  iceCandidateBuffer: RTCIceCandidateInit[];
  retryCount: number;
}

export interface VoiceState {
  micPermission: 'prompt' | 'granted' | 'denied' | 'error';
  isTalking: boolean;
  micReady: boolean;
  speakingPeers: Set<string>;
}

export function useProximityVoice(
  playerId: string,
  connected: boolean,
  channelRef: React.MutableRefObject<RealtimeChannel | null>,
  playerPositionRef: React.RefObject<THREE.Vector3>,
  remotePlayers: Map<string, { targetPosition: [number, number, number] }>,
) {
  const [micPermission, setMicPermission] = useState<VoiceState['micPermission']>('prompt');
  const [isTalking, setIsTalking] = useState(false);
  const [speakingPeers, setSpeakingPeers] = useState<Set<string>>(new Set());

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerEntry>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micReadyRef = useRef(false);
  const isTalkingRef = useRef(false);
  const voiceInitDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signalingSetupRef = useRef(false);
  const connectedRef = useRef(false);
  connectedRef.current = connected;

  // ─── Audio context lazy init ───
  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // ─── Destroy peer ───
  const destroyPeer = useCallback((remoteId: string) => {
    const entry = peersRef.current.get(remoteId);
    if (!entry) return;
    voiceLog('destroyPeer', { remoteId: remoteId.slice(0, 8) });
    try { entry.pc.close(); } catch {}
    entry.audioEl.srcObject = null;
    try { entry.audioEl.remove(); } catch {}
    if (entry.sourceNode) {
      try { entry.sourceNode.disconnect(); } catch {}
    }
    try { entry.gainNode.disconnect(); } catch {}
    peersRef.current.delete(remoteId);
  }, []);

  // ─── Create peer connection to a remote player ───
  const createPeer = useCallback((remoteId: string, initiator: boolean) => {
    const channel = channelRef.current;
    if (!channel) {
      voiceLog('createPeer skipped: no channel', { remoteId: remoteId.slice(0, 8) });
      return;
    }

    const existing = peersRef.current.get(remoteId);
    if (existing) {
      const state = existing.pc.connectionState;
      if (state !== 'failed' && state !== 'closed') return;
      destroyPeer(remoteId);
    }

    voiceLog('createPeer', { remoteId: remoteId.slice(0, 8), initiator });
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    const audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    audioEl.volume = 0;

    const ctx = getAudioCtx();
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0;
    gainNode.connect(ctx.destination);

    const entry: PeerEntry = {
      pc, audioEl, gainNode,
      sourceNode: null,
      hasRemoteDesc: false,
      iceCandidateBuffer: [],
      retryCount: 0,
    };

    pc.ontrack = (ev) => {
      voiceLog('ontrack', { from: remoteId.slice(0, 8), tracks: ev.streams.length });
      const stream = ev.streams[0] || new MediaStream([ev.track]);
      audioEl.srcObject = stream;

      if (!entry.sourceNode) {
        try {
          entry.sourceNode = ctx.createMediaElementSource(audioEl);
          entry.sourceNode.connect(gainNode);
          audioEl.volume = 1;
          voiceLog('audio routed through gain node', { from: remoteId.slice(0, 8) });
        } catch {
          audioEl.volume = 0;
          voiceLog('MediaElementSource failed — audio muted', { from: remoteId.slice(0, 8) });
        }
      }

      audioEl.play().catch(err => {
        voiceLog('audioEl.play() blocked', { err: err.message });
      });
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        channel.send({
          type: 'broadcast', event: 'voice_ice',
          payload: { from: playerId, to: remoteId, candidate: ev.candidate.toJSON() },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      voiceLog('peerState', { remote: remoteId.slice(0, 8), state });

      if (state === 'failed') {
        const peerEntry = peersRef.current.get(remoteId);
        if (peerEntry && peerEntry.retryCount < PEER_RETRY_MAX) {
          const retryCount = peerEntry.retryCount + 1;
          voiceLog('peer retry', { remote: remoteId.slice(0, 8), attempt: retryCount });
          destroyPeer(remoteId);
          setTimeout(() => {
            if (connectedRef.current && remotePlayers.has(remoteId)) {
              const newInitiator = playerId > remoteId;
              createPeer(remoteId, newInitiator);
              const newEntry = peersRef.current.get(remoteId);
              if (newEntry) newEntry.retryCount = retryCount;
            }
          }, PEER_RETRY_DELAY_MS);
        } else {
          destroyPeer(remoteId);
        }
      } else if (state === 'closed') {
        destroyPeer(remoteId);
      }
    };

    peersRef.current.set(remoteId, entry);

    if (initiator) {
      (async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          channel.send({
            type: 'broadcast', event: 'voice_offer',
            payload: { from: playerId, to: remoteId, sdp: offer },
          });
          voiceLog('offer sent', { to: remoteId.slice(0, 8) });
        } catch (err: any) {
          voiceLog('offer error', { err: err.message });
        }
      })();
    }
  }, [playerId, getAudioCtx, destroyPeer, remotePlayers]);

  // ─── Flush buffered ICE candidates ───
  const flushIceBuffer = useCallback(async (remoteId: string) => {
    const entry = peersRef.current.get(remoteId);
    if (!entry || !entry.hasRemoteDesc) return;

    const buffered = entry.iceCandidateBuffer.splice(0);
    for (const candidate of buffered) {
      try {
        await entry.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err: any) {
        voiceLog('buffered ICE add error', { err: err.message });
      }
    }
    if (buffered.length > 0) {
      voiceLog('flushed ICE buffer', { remoteId: remoteId.slice(0, 8), count: buffered.length });
    }
  }, []);

  // ─── Add tracks to all existing peers ───
  const addTracksToAllPeers = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    for (const [remoteId, entry] of peersRef.current) {
      const senders = entry.pc.getSenders();
      const hasAudioSender = senders.some(s => s.track?.kind === 'audio');
      if (hasAudioSender) continue;

      voiceLog('adding tracks to existing peer', { remoteId: remoteId.slice(0, 8) });
      stream.getTracks().forEach(track => {
        entry.pc.addTrack(track, stream);
      });

      const channel = channelRef.current;
      if (!channel) continue;
      const initiator = playerId > remoteId;
      if (initiator) {
        try {
          const offer = await entry.pc.createOffer();
          await entry.pc.setLocalDescription(offer);
          channel.send({
            type: 'broadcast', event: 'voice_offer',
            payload: { from: playerId, to: remoteId, sdp: offer },
          });
          voiceLog('renegotiation offer sent', { to: remoteId.slice(0, 8) });
        } catch (err: any) {
          voiceLog('renegotiation error', { err: err.message });
        }
      }
    }
  }, [playerId]);

  // ─── Acquire mic ───
  const acquireMic = useCallback(async () => {
    if (localStreamRef.current) return true;
    try {
      voiceLog('requesting mic');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      localStreamRef.current = stream;
      stream.getAudioTracks().forEach(t => { t.enabled = false; });
      micReadyRef.current = true;
      setMicPermission('granted');
      voiceLog('mic acquired');

      await addTracksToAllPeers();

      channelRef.current?.send({
        type: 'broadcast', event: 'voice_ready',
        payload: { playerId },
      });

      return true;
    } catch (err: any) {
      voiceLog('mic denied', { err: err.message });
      setMicPermission(err.name === 'NotAllowedError' ? 'denied' : 'error');
      return false;
    }
  }, [playerId, addTracksToAllPeers]);

  // ─── Handle signaling events ───
  const setupSignaling = useCallback(() => {
    const channel = channelRef.current;
    if (!channel || signalingSetupRef.current) return;
    signalingSetupRef.current = true;

    voiceLog('setupSignaling');

    const handleOffer = async ({ payload }: any) => {
      if (payload.to !== playerId) return;
      voiceLog('received offer', { from: payload.from.slice(0, 8) });

      if (!peersRef.current.has(payload.from)) {
        createPeer(payload.from, false);
      }
      const entry = peersRef.current.get(payload.from);
      if (!entry) return;

      try {
        const signalingState = entry.pc.signalingState;
        if (signalingState === 'stable') {
          await entry.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        } else if (signalingState === 'have-local-offer') {
          if (playerId < payload.from) {
            voiceLog('glare: rolling back', { signalingState });
            await entry.pc.setLocalDescription({ type: 'rollback' } as any);
            await entry.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          } else {
            voiceLog('glare: ignoring remote offer (we have priority)');
            return;
          }
        } else {
          await entry.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        }

        entry.hasRemoteDesc = true;
        await flushIceBuffer(payload.from);

        const answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        channel.send({
          type: 'broadcast', event: 'voice_answer',
          payload: { from: playerId, to: payload.from, sdp: answer },
        });
        voiceLog('answer sent', { to: payload.from.slice(0, 8) });
      } catch (err: any) {
        voiceLog('answer error', { err: err.message });
      }
    };

    const handleAnswer = async ({ payload }: any) => {
      if (payload.to !== playerId) return;
      const entry = peersRef.current.get(payload.from);
      if (!entry) return;
      try {
        await entry.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        entry.hasRemoteDesc = true;
        await flushIceBuffer(payload.from);
        voiceLog('answer applied', { from: payload.from.slice(0, 8) });
      } catch (err: any) {
        voiceLog('setRemote error', { err: err.message });
      }
    };

    const handleIce = async ({ payload }: any) => {
      if (payload.to !== playerId) return;
      const entry = peersRef.current.get(payload.from);
      if (!entry) {
        voiceLog('ICE for unknown peer', { from: payload.from.slice(0, 8) });
        return;
      }

      if (!entry.hasRemoteDesc) {
        entry.iceCandidateBuffer.push(payload.candidate);
        voiceLog('ICE buffered', { from: payload.from.slice(0, 8), buffered: entry.iceCandidateBuffer.length });
        return;
      }

      try {
        await entry.pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch (err: any) {
        voiceLog('ICE add error', { err: err.message });
      }
    };

    const handleSpeaking = ({ payload }: any) => {
      if (payload.playerId === playerId) return;
      setSpeakingPeers(prev => {
        const next = new Set(prev);
        if (payload.speaking) next.add(payload.playerId);
        else next.delete(payload.playerId);
        return next;
      });
    };

    const handleVoiceReady = ({ payload }: any) => {
      if (payload.playerId === playerId) return;
      voiceLog('voice_ready received', { from: payload.playerId.slice(0, 8) });

      if (!peersRef.current.has(payload.playerId)) {
        const initiator = playerId > payload.playerId;
        createPeer(payload.playerId, initiator);
      }
    };

    channel.on('broadcast', { event: 'voice_offer' }, handleOffer);
    channel.on('broadcast', { event: 'voice_answer' }, handleAnswer);
    channel.on('broadcast', { event: 'voice_ice' }, handleIce);
    channel.on('broadcast', { event: 'voice_speaking' }, handleSpeaking);
    channel.on('broadcast', { event: 'voice_ready' }, handleVoiceReady);
  }, [playerId, createPeer, flushIceBuffer]);

  // ─── Distance-based peer lifecycle management ───
  // Only maintain peers for the closest N players within hearing range.
  const syncPeersProximity = useCallback(() => {
    if (!connected) return;
    const localPos = playerPositionRef.current;

    // Build sorted list of nearby remote players
    const candidates: { id: string; dist: number }[] = [];
    for (const [remoteId, rp] of remotePlayers) {
      let dist = Infinity;
      if (localPos) {
        const dx = localPos.x - rp.targetPosition[0];
        const dz = localPos.z - rp.targetPosition[2];
        dist = Math.sqrt(dx * dx + dz * dz);
      }
      if (dist <= VOICE_MAX_RANGE) {
        candidates.push({ id: remoteId, dist });
      }
    }

    // Sort by distance, take closest MAX_VOICE_PEERS
    candidates.sort((a, b) => a.dist - b.dist);
    const allowedPeers = new Set(candidates.slice(0, MAX_VOICE_PEERS).map(c => c.id));

    // Create peers for allowed nearby players
    for (const id of allowedPeers) {
      if (!peersRef.current.has(id)) {
        const initiator = playerId > id;
        createPeer(id, initiator);
      }
    }

    // Destroy peers that are no longer in allowed set
    for (const [peerId] of peersRef.current) {
      if (!allowedPeers.has(peerId)) {
        voiceLog('proximity prune peer', { peerId: peerId.slice(0, 8) });
        destroyPeer(peerId);
        setSpeakingPeers(prev => {
          const next = new Set(prev);
          next.delete(peerId);
          return next;
        });
      }
    }
  }, [connected, remotePlayers, playerId, createPeer, destroyPeer, playerPositionRef]);

  // ─── Start talking (K down) ───
  const startTalking = useCallback(async () => {
    if (isTalkingRef.current) return;
    if (!localStreamRef.current) {
      const ok = await acquireMic();
      if (!ok) return;
    }

    isTalkingRef.current = true;
    setIsTalking(true);
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = true; });

    channelRef.current?.send({
      type: 'broadcast', event: 'voice_speaking',
      payload: { playerId, speaking: true },
    });
    voiceLog('transmitting');
  }, [playerId, acquireMic]);

  // ─── Stop talking (K up) ───
  const stopTalking = useCallback(() => {
    if (!isTalkingRef.current) return;
    isTalkingRef.current = false;
    setIsTalking(false);
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = false; });

    channelRef.current?.send({
      type: 'broadcast', event: 'voice_speaking',
      payload: { playerId, speaking: false },
    });
  }, [playerId]);

  // ─── Update distance-based gain ───
  const updateProximityGain = useCallback(() => {
    const pos = playerPositionRef.current;
    if (!pos) return;

    for (const [remoteId, entry] of peersRef.current) {
      const remote = remotePlayers.get(remoteId);
      if (!remote) {
        entry.gainNode.gain.value = 0;
        continue;
      }
      const dx = pos.x - remote.targetPosition[0];
      const dz = pos.z - remote.targetPosition[2];
      const dist = Math.sqrt(dx * dx + dz * dz);

      let vol = 0;
      if (dist <= VOICE_FULL_RANGE) {
        vol = VOICE_GAIN;
      } else if (dist < VOICE_MAX_RANGE) {
        const t = (dist - VOICE_FULL_RANGE) / (VOICE_MAX_RANGE - VOICE_FULL_RANGE);
        vol = VOICE_GAIN * (1 - t * t);
      }
      if (vol < VOICE_SILENCE_THRESHOLD) vol = 0;
      if (vol === 0) {
        entry.gainNode.gain.value = 0;
      } else {
        entry.gainNode.gain.value += (vol - entry.gainNode.gain.value) * 0.2;
      }
    }
  }, [playerPositionRef, remotePlayers]);

  // ─── K key handler ───
  useEffect(() => {
    if (!connected) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyK' && !e.repeat) startTalking();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyK') stopTalking();
    };
    const onBlur = () => stopTalking();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      stopTalking();
    };
  }, [connected, startTalking, stopTalking]);

  // ─── Setup signaling when connected ───
  useEffect(() => {
    if (connected && channelRef.current) {
      setupSignaling();
    }
    if (!connected) {
      signalingSetupRef.current = false;
    }
  }, [connected, setupSignaling]);

  // ─── Proximity-based peer sync (replaces old syncPeers) ───
  useEffect(() => {
    if (!connected) return;
    // Initial sync
    syncPeersProximity();
    // Periodic re-evaluation
    const interval = setInterval(syncPeersProximity, VOICE_PEER_SYNC_MS);
    return () => clearInterval(interval);
  }, [connected, syncPeersProximity]);

  // ─── Proximity gain update loop ───
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(updateProximityGain, 50);
    return () => clearInterval(interval);
  }, [connected, updateProximityGain]);

  // ─── Cleanup on disconnect/unmount ───
  useEffect(() => {
    return () => {
      if (voiceInitDelayRef.current) clearTimeout(voiceInitDelayRef.current);
      for (const [id] of peersRef.current) {
        destroyPeer(id);
      }
      peersRef.current.clear();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
      micReadyRef.current = false;
      signalingSetupRef.current = false;
      for (const k of Object.keys(vLog)) delete vLog[k];
    };
  }, [destroyPeer]);

  // ─── DEFERRED mic init ───
  useEffect(() => {
    if (connected && !localStreamRef.current && micPermission === 'prompt') {
      voiceLog('deferring mic acquisition', { delayMs: VOICE_INIT_DELAY_MS });
      voiceInitDelayRef.current = setTimeout(() => {
        voiceLog('deferred mic init starting');
        acquireMic();
      }, VOICE_INIT_DELAY_MS);
      return () => {
        if (voiceInitDelayRef.current) {
          clearTimeout(voiceInitDelayRef.current);
          voiceInitDelayRef.current = null;
        }
      };
    }
  }, [connected, acquireMic, micPermission]);

  // ─── Resume AudioContext on first user interaction ───
  useEffect(() => {
    if (!connected) return;
    const resume = () => {
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume();
        voiceLog('AudioContext resumed on user gesture');
      }
    };
    window.addEventListener('click', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
    return () => {
      window.removeEventListener('click', resume);
      window.removeEventListener('keydown', resume);
    };
  }, [connected]);

  return {
    micPermission,
    isTalking,
    micReady: micReadyRef.current,
    speakingPeers,
    startTalking,
    stopTalking,
  };
}
