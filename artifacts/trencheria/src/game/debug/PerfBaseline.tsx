/**
 * PerfBaseline — Runtime performance HUD.
 *
 * Enabled via `?perf=1` URL param OR the F3 hotkey (toggled in GameScene).
 * In production the underlying `<PerfBaselineR3F>` and `<PerfBaselineHUD>`
 * are mounted only when `perfMode` is true so they impose zero overhead
 * on regular players.
 *
 * Tracks: live FPS, 1% low FPS, 30s avg FPS, frame ticks/sec, draw calls,
 * triangles, geometries, textures, programs, JS heap, and WebGL context-loss
 * count. Provides 30s scenario recordings (Open Field, Capital, Combat,
 * Forest, Multiplayer) and a one-click summary copy.
 *
 * Mount `PerfBaselineR3F` inside <Canvas>; mount `PerfBaselineHUD` outside.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { QualityTier } from '../hooks/useQualitySettings';

export function isPerfModeEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('perf') === '1';
  } catch {
    return false;
  }
}

// ─── Shared state bridge between R3F and DOM ───

const perfState = {
  fps: 0,
  frameTicks: 0,
  fpsHistory: [] as number[],            // last 30 samples (1Hz)
  fpsLowHistory: [] as number[],         // raw frame durations for 1% low
  tickHistory: [] as number[],
  lastFpsSampleTime: 0,
  frameCountSinceLastSample: 0,
  tickCountSinceLastSample: 0,
  lastTickSampleTime: 0,
  // gl.info snapshots
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  programs: 0,
};

// ─── R3F Component (inside Canvas) ───

export function PerfBaselineR3F() {
  const { gl } = useThree();
  const lastFrameTimeRef = useRef(0);

  useFrame(() => {
    const now = performance.now();
    perfState.tickCountSinceLastSample++;

    // Track per-frame durations for 1% low computation
    if (lastFrameTimeRef.current > 0) {
      const dur = now - lastFrameTimeRef.current;
      perfState.fpsLowHistory.push(dur);
      // Keep ~last 30s @ 60fps = 1800 samples max
      if (perfState.fpsLowHistory.length > 2000) perfState.fpsLowHistory.shift();
    }
    lastFrameTimeRef.current = now;

    if (perfState.lastTickSampleTime === 0) {
      perfState.lastTickSampleTime = now;
      perfState.lastFpsSampleTime = now;
    }

    if (now - perfState.lastTickSampleTime >= 1000) {
      const elapsed = (now - perfState.lastTickSampleTime) / 1000;
      const tickRate = perfState.tickCountSinceLastSample / elapsed;
      perfState.tickHistory.push(tickRate);
      if (perfState.tickHistory.length > 30) perfState.tickHistory.shift();
      perfState.frameTicks = tickRate;
      perfState.tickCountSinceLastSample = 0;
      perfState.lastTickSampleTime = now;

      // Snapshot gl.info — render counts reset each frame, so capture here
      perfState.drawCalls = gl.info.render.calls;
      perfState.triangles = gl.info.render.triangles;
      perfState.geometries = gl.info.memory.geometries;
      perfState.textures = gl.info.memory.textures;
      perfState.programs = gl.info.programs?.length ?? 0;
    }
  });

  // FPS via rAF (independent of useFrame to catch stalls)
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let raf = 0;

    const loop = () => {
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        const elapsed = (now - lastTime) / 1000;
        const fps = frameCount / elapsed;
        perfState.fps = fps;
        perfState.fpsHistory.push(fps);
        if (perfState.fpsHistory.length > 30) perfState.fpsHistory.shift();
        // Expose 30s avg for adaptive quality
        const sum = perfState.fpsHistory.reduce((a, b) => a + b, 0);
        const avg30 = sum / perfState.fpsHistory.length;
        (window as unknown as { __trencheriaAvgFps30?: number }).__trencheriaAvgFps30 = avg30;
        frameCount = 0;
        lastTime = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [gl]);

  return null;
}

// ─── DOM HUD Component (outside Canvas) ───

type Scenario = 'Open Field' | 'Capital' | 'Combat' | 'Forest' | 'Multiplayer' | 'None';

interface BaselineData {
  fps: number;
  fpsLow1pct: number;
  ticks: number;
  drawCalls: number;
  triangles: number;
}

interface HUDProps {
  quality?: QualityTier;
  onSetQuality?: (t: QualityTier) => void;
}

function compute1pctLow(samples: number[]): number {
  if (samples.length === 0) return 0;
  // 1% low = avg of slowest 1% frame durations → convert to fps
  const sorted = [...samples].sort((a, b) => b - a);
  const cut = Math.max(1, Math.floor(sorted.length * 0.01));
  const slowest = sorted.slice(0, cut);
  const avgDur = slowest.reduce((a, b) => a + b, 0) / slowest.length;
  return avgDur > 0 ? 1000 / avgDur : 0;
}

export function PerfBaselineHUD({ quality, onSetQuality }: HUDProps = {}) {
  const [displayFps, setDisplayFps] = useState(0);
  const [displayFpsLow, setDisplayFpsLow] = useState(0);
  const [displayTicks, setDisplayTicks] = useState(0);
  const [avgFps, setAvgFps] = useState(0);
  const [drawCalls, setDrawCalls] = useState(0);
  const [tris, setTris] = useState(0);
  const [progCount, setProgCount] = useState(0);
  const [heapMB, setHeapMB] = useState('—');
  const [initialHeap, setInitialHeap] = useState('—');
  const [contextLossCount, setContextLossCount] = useState(0);
  const [scenario, setScenario] = useState<Scenario>('None');
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const capturedRef = useRef<Record<string, BaselineData>>({});
  const fiveMinHeapRef = useRef('—');
  const initialHeapRef = useRef('—');
  const recordStartRef = useRef(0);
  const recordScenarioRef = useRef<Scenario>('None');
  const recordFpsAccum = useRef<number[]>([]);
  const recordTickAccum = useRef<number[]>([]);
  const recordDrawCallsAccum = useRef<number[]>([]);
  const recordTrisAccum = useRef<number[]>([]);
  const recordFrameDurations = useRef<number[]>([]);

  // 500ms display poll
  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayFps(Math.round(perfState.fps));
      setDisplayFpsLow(Math.round(compute1pctLow(perfState.fpsLowHistory)));
      setDisplayTicks(Math.round(perfState.frameTicks));
      setDrawCalls(perfState.drawCalls);
      setTris(perfState.triangles);
      setProgCount(perfState.programs);

      if (perfState.fpsHistory.length > 0) {
        const sum = perfState.fpsHistory.reduce((a, b) => a + b, 0);
        setAvgFps(Math.round(sum / perfState.fpsHistory.length));
      }

      const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
      if (perf.memory) {
        setHeapMB((perf.memory.usedJSHeapSize / 1048576).toFixed(1));
      }
      const w = window as unknown as { __trencheriaWebglLossCount?: number };
      setContextLossCount(w.__trencheriaWebglLossCount ?? 0);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Initial heap capture (after 3s warm-up)
  useEffect(() => {
    const timeout = setTimeout(() => {
      const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
      if (perf.memory) {
        const used = (perf.memory.usedJSHeapSize / 1048576).toFixed(1);
        setInitialHeap(used);
        initialHeapRef.current = used;
      }
    }, 3000);
    return () => clearTimeout(timeout);
  }, []);

  // 5-min heap tracker
  useEffect(() => {
    const interval = setInterval(() => {
      const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
      if (perf.memory) {
        fiveMinHeapRef.current = (perf.memory.usedJSHeapSize / 1048576).toFixed(1);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Recording timer
  useEffect(() => {
    if (!recording) return;
    const interval = setInterval(() => {
      const elapsed = Math.round((performance.now() - recordStartRef.current) / 1000);
      setRecordSeconds(elapsed);
      recordFpsAccum.current.push(perfState.fps);
      recordTickAccum.current.push(perfState.frameTicks);
      recordDrawCallsAccum.current.push(perfState.drawCalls);
      recordTrisAccum.current.push(perfState.triangles);
      // Snapshot last 60 frame durations into the recording set
      const recent = perfState.fpsLowHistory.slice(-60);
      recordFrameDurations.current.push(...recent);
      if (elapsed >= 30) finishRecording();
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const startRecording = useCallback((s: Scenario) => {
    setScenario(s);
    recordScenarioRef.current = s;
    recordStartRef.current = performance.now();
    recordFpsAccum.current = [];
    recordTickAccum.current = [];
    recordDrawCallsAccum.current = [];
    recordTrisAccum.current = [];
    recordFrameDurations.current = [];
    setRecording(true);
    setRecordSeconds(0);
  }, []);

  const finishRecording = useCallback(() => {
    setRecording(false);
    const fpsArr = recordFpsAccum.current;
    const tickArr = recordTickAccum.current;
    const dcArr = recordDrawCallsAccum.current;
    const triArr = recordTrisAccum.current;
    const avgF = fpsArr.length > 0 ? Math.round(fpsArr.reduce((a, b) => a + b, 0) / fpsArr.length) : 0;
    const avgT = tickArr.length > 0 ? Math.round(tickArr.reduce((a, b) => a + b, 0) / tickArr.length) : 0;
    const avgDC = dcArr.length > 0 ? Math.round(dcArr.reduce((a, b) => a + b, 0) / dcArr.length) : 0;
    const avgTri = triArr.length > 0 ? Math.round(triArr.reduce((a, b) => a + b, 0) / triArr.length) : 0;
    const low1 = Math.round(compute1pctLow(recordFrameDurations.current));
    const s = recordScenarioRef.current;
    capturedRef.current[s] = {
      fps: avgF, fpsLow1pct: low1, ticks: avgT,
      drawCalls: avgDC, triangles: avgTri,
    };
  }, []);

  const copySummary = useCallback(() => {
    const lines: string[] = [];
    const order: Scenario[] = ['Open Field', 'Capital', 'Combat', 'Forest', 'Multiplayer'];
    for (const s of order) {
      const v = capturedRef.current[s];
      if (!v) continue;
      lines.push(`${s}: avg ${v.fps} fps · 1% low ${v.fpsLow1pct} fps · ${v.drawCalls} draws · ${v.triangles} tris · ${v.ticks} ticks/s`);
    }
    lines.push(`Initial heap: ${initialHeapRef.current} MB`);
    lines.push(`5-min heap: ${fiveMinHeapRef.current} MB`);
    lines.push(`WebGL context losses: ${contextLossCount}`);
    if (quality) lines.push(`Quality tier: ${quality}`);
    const summary = lines.join('\n');
    navigator.clipboard.writeText(summary).then(() => {
      console.log('[PerfBaseline] Summary copied to clipboard:\n' + summary);
    }).catch(() => {
      console.log('[PerfBaseline] Clipboard failed, summary:\n' + summary);
    });
  }, [contextLossCount, quality]);

  const scenarioColor = (s: Scenario) => {
    const captured = !!capturedRef.current[s];
    if (recording && scenario === s) return '#ff0';
    if (captured) return '#0f0';
    return '#888';
  };

  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{
      position: 'fixed', bottom: 8, right: 8, zIndex: 99999,
      background: 'rgba(0,0,0,0.88)', color: '#0f0',
      fontFamily: 'monospace', fontSize: collapsed ? 11 : 12,
      padding: collapsed ? '6px 10px' : '10px 14px',
      borderRadius: 8, border: '1px solid #333',
      minWidth: collapsed ? 120 : 280,
      pointerEvents: 'auto', userSelect: 'none',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setCollapsed(!collapsed)}>
        <span style={{ fontWeight: 'bold', color: '#fff', fontSize: 11 }}>
          📊 PERF {collapsed ? `${displayFps} FPS` : '(F3)'}
        </span>
        <span style={{ color: '#666', fontSize: 10, marginLeft: 8 }}>{collapsed ? '▲' : '▼'}</span>
      </div>

      {!collapsed && (
        <>
          <div style={{ marginTop: 8, marginBottom: 4 }}>
            <span style={{ color: '#aaa' }}>FPS </span>
            <span style={{ color: displayFps < 30 ? '#f44' : displayFps < 50 ? '#ff0' : '#0f0', fontWeight: 'bold', fontSize: 16 }}>
              {displayFps}
            </span>
            <span style={{ color: '#666', marginLeft: 6 }}>avg30s {avgFps}</span>
            <span style={{ color: '#666', marginLeft: 6 }}>1% low {displayFpsLow}</span>
          </div>
          <div style={{ marginBottom: 4 }}>
            <span style={{ color: '#aaa' }}>Draws </span><span>{drawCalls}</span>
            <span style={{ color: '#aaa', marginLeft: 8 }}>Tris </span><span>{tris.toLocaleString()}</span>
            <span style={{ color: '#aaa', marginLeft: 8 }}>Prog </span><span>{progCount}</span>
          </div>
          <div style={{ marginBottom: 4 }}>
            <span style={{ color: '#aaa' }}>Ticks/s </span><span>{displayTicks}</span>
          </div>
          <div style={{ marginBottom: 8 }}>
            <span style={{ color: '#aaa' }}>Heap </span><span>{heapMB} MB</span>
            <span style={{ color: '#666', marginLeft: 6 }}>init {initialHeap} MB</span>
          </div>
          <div style={{ marginBottom: 8 }}>
            <span style={{ color: '#aaa' }}>WebGL ctx loss </span>
            <span style={{ color: contextLossCount > 0 ? '#f44' : '#0f0' }}>{contextLossCount}</span>
          </div>

          {onSetQuality && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: '#ccc', marginBottom: 3 }}>QUALITY</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['low', 'medium', 'high'] as QualityTier[]).map(t => (
                  <button key={t} onClick={() => onSetQuality(t)} style={{
                    flex: 1, background: quality === t ? '#2a6' : '#333',
                    color: '#fff', border: 'none', borderRadius: 4,
                    padding: '4px 6px', fontSize: 11, fontFamily: 'monospace',
                    cursor: 'pointer', textTransform: 'uppercase',
                  }}>{t}</button>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontWeight: 'bold', color: '#ccc', marginBottom: 4, fontSize: 10 }}>
            RECORD 30s SCENARIO:
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
            {(['Open Field', 'Capital', 'Combat', 'Forest', 'Multiplayer'] as Scenario[]).map(s => (
              <button key={s} onClick={() => !recording && startRecording(s)} disabled={recording}
                style={{
                  background: scenarioColor(s), color: '#000', border: 'none',
                  borderRadius: 4, padding: '3px 6px', fontSize: 10,
                  fontWeight: 'bold', fontFamily: 'monospace',
                  cursor: recording ? 'not-allowed' : 'pointer',
                  opacity: recording && scenario !== s ? 0.4 : 1,
                }}>{s}</button>
            ))}
          </div>

          {recording && (
            <div style={{ color: '#ff0', marginBottom: 8, fontSize: 11 }}>
              ⏺ Recording {scenario}… {recordSeconds}s / 30s
            </div>
          )}

          {Object.keys(capturedRef.current).length > 0 && (
            <div style={{ borderTop: '1px solid #333', paddingTop: 6, marginBottom: 8, fontSize: 10, color: '#aaa' }}>
              {Object.entries(capturedRef.current).map(([k, v]) => (
                <div key={k}>{k}: {v.fps}/{v.fpsLow1pct} · {v.drawCalls}dc · {v.triangles}tri</div>
              ))}
            </div>
          )}

          <button onClick={copySummary} style={{
            background: '#2a6', color: '#fff', border: 'none', borderRadius: 4,
            padding: '6px 12px', fontSize: 11, fontWeight: 'bold',
            fontFamily: 'monospace', cursor: 'pointer', width: '100%',
          }}>📋 Copy Baseline Summary</button>
        </>
      )}
    </div>
  );
}
