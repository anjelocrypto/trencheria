/**
 * LoadingOverlay — stays on top of the game Canvas until the world is ready.
 * 
 * Unlike the old LoadingScreen:
 * - Does NOT control when to transition (that's driven by StartupReadiness)
 * - Shows indeterminate progress that reflects real stage names
 * - Fades out smoothly when `ready` prop becomes true
 * - Unmounts after fade-out completes
 */
import { useState, useEffect, useRef } from 'react';

interface Props {
  /** True once StartupReadiness confirms the first stable frames */
  ready: boolean;
  /** Called after the fade-out animation completes — parent can unmount overlay */
  onFadeComplete: () => void;
}

const TIPS = [
  'Forging the realm...',
  'Raising castle walls...',
  'Summoning creatures...',
  'Lighting the torches...',
  'Sharpening swords...',
  'Saddling horses...',
  'Charting the railways...',
];

export function LoadingOverlay({ ready, onFadeComplete }: Props) {
  const [opacity, setOpacity] = useState(1);
  const [visible, setVisible] = useState(true);
  const [tipIndex, setTipIndex] = useState(0);
  const [fakeProgress, setFakeProgress] = useState(0);
  const startTime = useRef(Date.now());

  // Rotate tips
  useEffect(() => {
    const iv = setInterval(() => {
      setTipIndex(i => (i + 1) % TIPS.length);
    }, 2200);
    return () => clearInterval(iv);
  }, []);

  // Progress that caps at 85% until ready, then jumps to 100%
  useEffect(() => {
    if (ready) {
      setFakeProgress(100);
      return;
    }
    const iv = setInterval(() => {
      const elapsed = (Date.now() - startTime.current) / 1000;
      // Ease toward 85% over ~12 seconds (slower to match real load time)
      const pct = Math.min(85, 85 * (1 - Math.exp(-elapsed / 5)));
      setFakeProgress(pct);
    }, 80);
    return () => clearInterval(iv);
  }, [ready]);

  // Fade out when ready
  useEffect(() => {
    if (!ready) return;
    // Brief pause at 100% so user sees it complete
    const t1 = setTimeout(() => setOpacity(0), 400);
    // After CSS transition completes
    const t2 = setTimeout(() => {
      setVisible(false);
      onFadeComplete();
    }, 1100); // 400ms pause + 700ms fade
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [ready, onFadeComplete]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-end pb-32 pointer-events-none"
      style={{
        opacity,
        transition: 'opacity 700ms ease-out',
      }}
    >
      {/* Full-screen dark overlay — covers the brown bg-background */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to bottom, rgba(10,8,5,0.95) 0%, rgba(10,8,5,0.98) 70%, rgba(10,8,5,1) 100%)',
        }}
      />

      {/* Title */}
      <div className="relative z-10 text-center mb-8">
        <h1
          className="text-4xl md:text-5xl font-bold tracking-wider"
          style={{
            fontFamily: "'Cinzel', 'Times New Roman', serif",
            color: '#d4a854',
            textShadow: '0 0 20px rgba(212, 168, 84, 0.4), 0 2px 8px rgba(0,0,0,0.8)',
          }}
        >
          TRENCHERIA
        </h1>
      </div>

      {/* Loading bar */}
      <div className="relative z-10 w-80 md:w-96">
        <p
          className="text-sm text-center mb-3 transition-opacity duration-500"
          style={{
            fontFamily: "'Cinzel', 'Times New Roman', serif",
            color: '#b8a070',
            textShadow: '0 1px 4px rgba(0,0,0,0.8)',
          }}
        >
          {ready ? 'World ready!' : TIPS[tipIndex]}
        </p>

        <div
          className="relative h-3 rounded-full overflow-hidden"
          style={{
            background: 'rgba(0,0,0,0.7)',
            border: '1px solid rgba(212, 168, 84, 0.3)',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
          }}
        >
          <div
            className="h-full rounded-full transition-all duration-300 ease-out"
            style={{
              width: `${fakeProgress}%`,
              background: 'linear-gradient(90deg, #8a6520, #d4a854, #c4943c)',
              boxShadow: '0 0 8px rgba(212, 168, 84, 0.5)',
            }}
          />
        </div>

        <p
          className="text-xs text-center mt-2"
          style={{
            fontFamily: "'Cinzel', 'Times New Roman', serif",
            color: '#8a7a5a',
          }}
        >
          {Math.floor(fakeProgress)}%
        </p>
      </div>
    </div>
  );
}
