/**
 * WarSounds — lightweight Web Audio API sound cues for territory war events.
 * Uses oscillator-based synthesis (no external files needed).
 * Each event type has a unique sound signature.
 * Deduplication: won't replay the same event within a cooldown window.
 */

const audioCtxRef: { current: AudioContext | null } = { current: null };
const lastPlayedRef: Map<string, number> = new Map();
const COOLDOWN_MS = 5000; // 5s between same event type

function getAudioCtx(): AudioContext | null {
  try {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  } catch {
    return null; // Browser blocked audio
  }
}

function canPlay(eventKey: string): boolean {
  const now = Date.now();
  const last = lastPlayedRef.get(eventKey) || 0;
  if (now - last < COOLDOWN_MS) return false;
  lastPlayedRef.set(eventKey, now);
  return true;
}

/** Challenged — sharp ascending two-tone alert */
export function playChallengedSound(): void {
  if (!canPlay('challenged')) return;
  const ctx = getAudioCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(440, now);
  osc.frequency.linearRampToValueAtTime(660, now + 0.15);
  osc.frequency.linearRampToValueAtTime(880, now + 0.3);
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + 0.6);
}

/** War started — dramatic low horn blast */
export function playWarStartedSound(): void {
  if (!canPlay('war_started')) return;
  const ctx = getAudioCtx();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Low horn
  const gain1 = ctx.createGain();
  gain1.connect(ctx.destination);
  gain1.gain.setValueAtTime(0, now);
  gain1.gain.linearRampToValueAtTime(0.15, now + 0.1);
  gain1.gain.setValueAtTime(0.15, now + 0.5);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

  const osc1 = ctx.createOscillator();
  osc1.type = 'sawtooth';
  osc1.frequency.setValueAtTime(110, now);
  osc1.frequency.linearRampToValueAtTime(130, now + 0.4);
  osc1.connect(gain1);
  osc1.start(now);
  osc1.stop(now + 1.2);

  // Upper harmonic
  const gain2 = ctx.createGain();
  gain2.connect(ctx.destination);
  gain2.gain.setValueAtTime(0, now + 0.05);
  gain2.gain.linearRampToValueAtTime(0.06, now + 0.15);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

  const osc2 = ctx.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(220, now);
  osc2.frequency.linearRampToValueAtTime(260, now + 0.4);
  osc2.connect(gain2);
  osc2.start(now + 0.05);
  osc2.stop(now + 1.0);
}

/** Territory captured — triumphant ascending fanfare */
export function playCapturedSound(): void {
  if (!canPlay('captured')) return;
  const ctx = getAudioCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = [330, 392, 494, 659]; // E4, G4, B4, E5

  notes.forEach((freq, i) => {
    const t = now + i * 0.12;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    osc.connect(gain);
    osc.start(t);
    osc.stop(t + 0.4);
  });
}

/** War resolved — descending resolution tone */
export function playResolvedSound(): void {
  if (!canPlay('resolved')) return;
  const ctx = getAudioCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.1, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(520, now);
  osc.frequency.linearRampToValueAtTime(260, now + 0.6);
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + 0.8);
}
