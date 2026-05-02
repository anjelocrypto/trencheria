/**
 * WebGLRecovery — Detects WebGL context loss and attempts recovery.
 * 
 * Root cause: The lobby menu renders a full Canvas (Terrain, Water, Settlements).
 * When transitioning to the game, that Canvas unmounts and a new heavier one mounts.
 * This can exhaust GPU resources and cause WebGL context loss (FPS → 0, black screen).
 * 
 * This component:
 * 1. Listens for webglcontextlost / webglcontextrestored events
 * 2. Logs diagnostic heartbeats from useFrame to detect silent loop death
 * 3. Attempts context restoration when loss is detected
 */

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

export function WebGLRecovery() {
  const { gl } = useThree();
  const frameCountRef = useRef(0);
  const lastHeartbeatRef = useRef(performance.now());
  const contextLostRef = useRef(false);

  // Listen for WebGL context loss/restore on the actual canvas element
  useEffect(() => {
    const canvas = gl.domElement;
    if (!canvas) {
      console.error('[WebGL] No canvas element found on renderer');
      return;
    }

    console.log('[WebGL] Recovery monitor attached to canvas');

    const onContextLost = (event: Event) => {
      console.error('[WebGL] ⚠️ CONTEXT LOST — preventing default to allow restore');
      event.preventDefault(); // Critical: allows browser to attempt restore
      contextLostRef.current = true;
    };

    const onContextRestored = () => {
      console.log('[WebGL] ✅ CONTEXT RESTORED — render loop should resume');
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

  // Heartbeat: log every 5 seconds to prove the render loop is alive
  useFrame(() => {
    frameCountRef.current++;
    const now = performance.now();
    if (now - lastHeartbeatRef.current >= 5000) {
      const fps = frameCountRef.current / ((now - lastHeartbeatRef.current) / 1000);
      console.log(`[WebGL] Heartbeat — ${Math.round(fps)} fps, ${frameCountRef.current} frames in 5s, contextLost=${contextLostRef.current}`);
      frameCountRef.current = 0;
      lastHeartbeatRef.current = now;
    }
  });

  // Log first frame
  const firstFrameRef = useRef(true);
  useFrame(() => {
    if (firstFrameRef.current) {
      firstFrameRef.current = false;
      console.log('[WebGL] ✅ First frame rendered in GameScene Canvas');
    }
  });

  return null;
}

/**
 * Hook for the menu Canvas to force cleanup before unmount.
 * Call gl.forceContextLoss() is too aggressive — instead we just
 * dispose resources. R3F handles this on unmount already, but
 * we add logging to diagnose.
 */
export function MenuCanvasCleanup() {
  const { gl } = useThree();

  useEffect(() => {
    console.log('[WebGL] Menu Canvas mounted');
    return () => {
      console.log('[WebGL] Menu Canvas unmounting — R3F will dispose renderer');
      // Force dispose render target cache to free GPU memory before game canvas mounts
      gl.dispose();
    };
  }, [gl]);

  return null;
}
