import { devLog, devWarn } from '../utils/devLog';
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
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';

interface Props {
  onReady: () => void;
}

/** Minimum stable frames AND minimum wall-clock time before declaring ready */
const MIN_STABLE_FRAMES = 30;
const MIN_ELAPSED_MS = 3000; // at least 3 seconds to let assets load
/**
 * Hard wall-clock fallback. Codex follow-up #3 found the loading overlay can
 * stick at ~84% indefinitely if a Suspense boundary deep in the scene never
 * resolves (heavy GLBs / mid-load network stall). useFrame will then never
 * fire and the overlay never lifts. After this many ms we force-ready so the
 * player at least sees what HAS loaded, instead of being trapped on the
 * loading screen forever. Also unblocks dev-tool / screenshot capture flows.
 */
const HARD_FAILSAFE_MS = 12000;

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
      devLog(`[Startup] Scene ready after ${frameCount.current} frames, ${elapsed}ms`);
      onReady();
    }
  });

  // Hard wall-clock fallback running outside the R3F render loop, so it fires
  // even if useFrame never ticks (Suspense fallback parented above the
  // <Canvas>, all-suspended scene, etc.).
  useEffect(() => {
    const t = setTimeout(() => {
      if (fired.current) return;
      fired.current = true;
      devWarn(`[Startup] Force-ready after ${HARD_FAILSAFE_MS}ms (useFrame frames=${frameCount.current}); scene may still be hydrating.`);
      onReady();
    }, HARD_FAILSAFE_MS);
    return () => clearTimeout(t);
  }, [onReady]);

  return null;
}
