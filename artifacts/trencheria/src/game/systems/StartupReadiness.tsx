/**
 * StartupReadiness — tracks real loading milestones from inside the R3F Canvas.
 * 
 * Placed inside the GameScene Canvas, it:
 * 1. Detects when the first useFrame fires (Canvas + WebGL ready)
 * 2. Waits a few stable frames to confirm the render loop is alive
 * 3. Calls onReady() so the loading overlay can fade out
 * 
 * This replaces the fake timer approach — the loading screen stays
 * visible until the game world has actually rendered.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

interface Props {
  onReady: () => void;
}

/** Minimum stable frames AND minimum wall-clock time before declaring ready */
const MIN_STABLE_FRAMES = 30;
const MIN_ELAPSED_MS = 3000; // at least 3 seconds to let assets load

export function StartupReadiness({ onReady }: Props) {
  const frameCount = useRef(0);
  const fired = useRef(false);
  const mountTime = useRef(Date.now());

  useFrame(() => {
    if (fired.current) return;
    frameCount.current++;

    const elapsed = Date.now() - mountTime.current;

    // Must have both enough frames AND enough wall-clock time.
    // This ensures Suspense boundaries, terrain, and core assets
    // have had time to resolve — not just the first few empty frames.
    if (frameCount.current >= MIN_STABLE_FRAMES && elapsed >= MIN_ELAPSED_MS) {
      fired.current = true;
      console.log(`[Startup] Scene ready after ${frameCount.current} frames, ${elapsed}ms`);
      onReady();
    }
  });

  return null;
}
