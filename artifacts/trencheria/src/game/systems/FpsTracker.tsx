/**
 * FpsTracker — Lightweight always-on FPS sampler.
 *
 * Mounted regardless of `?perf=1` / F3 so the adaptive-quality fallback in
 * GameScene works for normal players. Uses requestAnimationFrame; cost is
 * one increment + one timestamp comparison per frame, plus one global write
 * per second. Exposes the rolling 30s average on
 * `window.__trencheriaAvgFps30` (same key PerfBaseline writes to — last
 * writer wins; both produce the same number so it's fine).
 */
import { useEffect } from 'react';

export function FpsTracker() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let frameCount = 0;
    let lastTime = performance.now();
    let raf = 0;
    const history: number[] = [];

    const loop = () => {
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        const elapsed = (now - lastTime) / 1000;
        const fps = frameCount / elapsed;
        history.push(fps);
        if (history.length > 30) history.shift();
        const sum = history.reduce((a, b) => a + b, 0);
        (window as unknown as { __trencheriaAvgFps30?: number }).__trencheriaAvgFps30 =
          sum / history.length;
        frameCount = 0;
        lastTime = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return null;
}
