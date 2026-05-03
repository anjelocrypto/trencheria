/**
 * WebGLRecovery — Detects WebGL context loss and attempts recovery.
 *
 * Listens for webglcontextlost / webglcontextrestored on the actual canvas
 * element and prevents the default so the browser re-creates the context.
 * Increments a global counter exposed on `window.__trencheriaWebglLossCount`
 * so PerfBaseline can surface it.
 *
 * No per-frame heartbeat logging in production — that fires every 5s
 * forever and pollutes user consoles. PerfBaseline owns runtime FPS now.
 */

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { devLog, isDebugLoggingEnabled } from '../utils/devLog';

declare global {
  interface Window {
    __trencheriaWebglLossCount?: number;
  }
}

export function WebGLRecovery() {
  const { gl } = useThree();
  const frameCountRef = useRef(0);
  const lastHeartbeatRef = useRef(performance.now());
  const contextLostRef = useRef(false);

  useEffect(() => {
    const canvas = gl.domElement;
    if (!canvas) {
      console.error('[WebGL] No canvas element found on renderer');
      return;
    }

    devLog('[WebGL] Recovery monitor attached to canvas');
    if (typeof window !== 'undefined' && window.__trencheriaWebglLossCount === undefined) {
      window.__trencheriaWebglLossCount = 0;
    }

    const onContextLost = (event: Event) => {
      console.error('[WebGL] ⚠️ CONTEXT LOST — preventing default to allow restore');
      event.preventDefault();
      contextLostRef.current = true;
      if (typeof window !== 'undefined') {
        window.__trencheriaWebglLossCount = (window.__trencheriaWebglLossCount ?? 0) + 1;
      }
    };

    const onContextRestored = () => {
      devLog('[WebGL] ✅ CONTEXT RESTORED');
      contextLostRef.current = false;
      frameCountRef.current = 0;
      lastHeartbeatRef.current = performance.now();
    };

    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    return () => {
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
    };
  }, [gl]);

  // Heartbeat only in dev/debug. In production this is silent (the prior
  // implementation logged every 5s forever).
  useFrame(() => {
    if (!isDebugLoggingEnabled) return;
    frameCountRef.current++;
    const now = performance.now();
    if (now - lastHeartbeatRef.current >= 5000) {
      const fps = frameCountRef.current / ((now - lastHeartbeatRef.current) / 1000);
      devLog(`[WebGL] Heartbeat — ${Math.round(fps)} fps, contextLost=${contextLostRef.current}`);
      frameCountRef.current = 0;
      lastHeartbeatRef.current = now;
    }
  });

  const firstFrameRef = useRef(true);
  useFrame(() => {
    if (firstFrameRef.current) {
      firstFrameRef.current = false;
      devLog('[WebGL] ✅ First frame rendered in GameScene Canvas');
    }
  });

  return null;
}

/**
 * Hook for the menu Canvas to force resource disposal before unmount,
 * so the heavier game Canvas doesn't immediately exhaust GPU resources
 * and trip a context-loss event.
 */
export function MenuCanvasCleanup() {
  const { gl } = useThree();

  useEffect(() => {
    devLog('[WebGL] Menu Canvas mounted');
    return () => {
      devLog('[WebGL] Menu Canvas unmounting — disposing renderer cache');
      gl.dispose();
    };
  }, [gl]);

  return null;
}
