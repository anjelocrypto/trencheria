import { useState, useEffect, useCallback } from 'react';
import { useCharacter } from '../context/CharacterContext';

export interface EmoteOption {
  key: string;
  label: string;
  icon: string;
}

const SOLDIER_EMOTES: EmoteOption[] = [
  { key: 'pushups', label: 'Pushups', icon: '💪' },
  { key: 'agree', label: 'Agree', icon: '👍' },
  { key: 'wave', label: 'Wave', icon: '👋' },
  { key: 'cheer', label: 'Cheer', icon: '🎉' },
  { key: 'bow', label: 'Bow', icon: '🙇' },
];

const GOBLIN_EMOTES: EmoteOption[] = [
  { key: 'hiphop', label: 'Hip Hop', icon: '🕺' },
  { key: 'gangnam', label: 'Gangnam', icon: '🎶' },
];

const OCTOPUS_EMOTES: EmoteOption[] = [
  { key: 'octopusdance', label: 'Dance', icon: '🐙' },
];

const NEMOCLAW_EMOTES: EmoteOption[] = [
  { key: 'nemodance1', label: 'Dance 1', icon: '💃' },
  { key: 'nemodance2', label: 'Dance 2', icon: '🕺' },
];

interface EmoteWheelProps {
  onSelectEmote: (emoteKey: string) => void;
  isPlayingEmote: boolean;
}

export function EmoteWheel({ onSelectEmote, isPlayingEmote }: EmoteWheelProps) {
  const { character } = useCharacter();
  const EMOTE_OPTIONS = character === 'goblin' ? GOBLIN_EMOTES : character === 'octopus' ? OCTOPUS_EMOTES : character === 'nemoclaw' ? NEMOCLAW_EMOTES : SOLDIER_EMOTES;
  const [open, setOpen] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.code === 'KeyI') {
      e.preventDefault();
      if (isPlayingEmote) return;
      setOpen(prev => !prev);
    }
    if (e.code === 'Escape' && open) {
      setOpen(false);
    }
  }, [open, isPlayingEmote]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!open) return null;

  const radius = 100;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
      <div className="relative pointer-events-auto" style={{ width: radius * 2.6, height: radius * 2.6 }}>
        {/* Center label */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="font-mono text-xs px-3 py-1 rounded-full"
            style={{ background: 'rgba(0,0,0,0.8)', color: '#aaa', border: '1px solid #444' }}>
            EMOTES
          </div>
        </div>

        {/* Emote buttons arranged in a circle */}
        {EMOTE_OPTIONS.map((emote, i) => {
          const angle = (i / EMOTE_OPTIONS.length) * Math.PI * 2 - Math.PI / 2;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;

          return (
            <button
              key={emote.key}
              onClick={() => {
                onSelectEmote(emote.key);
                setOpen(false);
              }}
              className="absolute flex flex-col items-center gap-1 transition-all duration-150 hover:scale-110"
              style={{
                left: `calc(50% + ${x}px - 36px)`,
                top: `calc(50% + ${y}px - 30px)`,
                width: 72,
                background: 'rgba(0,0,0,0.85)',
                border: '1px solid #555',
                borderRadius: 10,
                padding: '6px 4px',
                color: '#fff',
              }}
            >
              <span style={{ fontSize: 24 }}>{emote.icon}</span>
              <span className="font-mono" style={{ fontSize: 10, color: '#ccc' }}>{emote.label}</span>
            </button>
          );
        })}
      </div>

      {/* Hint */}
      <div className="absolute bottom-32 font-mono text-xs"
        style={{ color: '#888' }}>
        Press I to close
      </div>
    </div>
  );
}
