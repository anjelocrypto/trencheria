/**
 * Loading screen shown while the game world initializes.
 * Displays the cinematic 3D world background with a themed loading bar.
 */
import { useState, useEffect, useRef } from 'react';

interface Props {
  onReady: () => void;
}

export function LoadingScreen({ onReady }: Props) {
  const [progress, setProgress] = useState(0);
  const startTime = useRef(Date.now());

  useEffect(() => {
    // Simulate loading progress based on time — the actual game Canvas
    // mounts behind this overlay and loads assets in parallel.
    // We ramp to ~90% quickly, then slow down, and call onReady at 100%.
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime.current) / 1000;
      let pct: number;
      if (elapsed < 2) {
        pct = (elapsed / 2) * 60; // 0-60% in first 2s
      } else if (elapsed < 4) {
        pct = 60 + ((elapsed - 2) / 2) * 25; // 60-85% in next 2s
      } else if (elapsed < 5.5) {
        pct = 85 + ((elapsed - 4) / 1.5) * 10; // 85-95% in next 1.5s
      } else {
        pct = 95 + ((elapsed - 5.5) / 1) * 5; // 95-100% in last 1s
      }

      pct = Math.min(pct, 100);
      setProgress(pct);

      if (pct >= 100) {
        clearInterval(interval);
        setTimeout(onReady, 300); // brief pause before transition
      }
    }, 50);

    return () => clearInterval(interval);
  }, [onReady]);

  const tips = [
    'Forging the realm...',
    'Raising castle walls...',
    'Summoning creatures...',
    'Lighting the torches...',
    'Sharpening swords...',
  ];
  const tipIndex = Math.floor(progress / 22) % tips.length;

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-end pb-32 pointer-events-none">
      {/* Dark cinematic overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0.85) 100%)',
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
          MEDIEVAL FORGE QUEST
        </h1>
      </div>

      {/* Loading bar container */}
      <div className="relative z-10 w-80 md:w-96">
        {/* Tip text */}
        <p
          className="text-sm text-center mb-3 transition-opacity duration-500"
          style={{
            fontFamily: "'Cinzel', 'Times New Roman', serif",
            color: '#b8a070',
            textShadow: '0 1px 4px rgba(0,0,0,0.8)',
          }}
        >
          {tips[tipIndex]}
        </p>

        {/* Bar background */}
        <div
          className="relative h-3 rounded-full overflow-hidden"
          style={{
            background: 'rgba(0,0,0,0.7)',
            border: '1px solid rgba(212, 168, 84, 0.3)',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
          }}
        >
          {/* Fill */}
          <div
            className="h-full rounded-full transition-all duration-150 ease-out"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #8a6520, #d4a854, #c4943c)',
              boxShadow: '0 0 8px rgba(212, 168, 84, 0.5)',
            }}
          />
        </div>

        {/* Percentage */}
        <p
          className="text-xs text-center mt-2"
          style={{
            fontFamily: "'Cinzel', 'Times New Roman', serif",
            color: '#8a7a5a',
          }}
        >
          {Math.floor(progress)}%
        </p>
      </div>
    </div>
  );
}
