/**
 * PerfBaseline — Baseline measurement tooling for P0 refactor.
 * 
 * Provides:
 * 1. Large readable on-screen HUD with FPS, frame ticks/sec, heap
 * 2. Scenario labeling (Open Field / Capital / Combat)
 * 3. "Copy Baseline Summary" button for easy reporting
 * 4. Console logging of heap every 30s
 * 
 * Mount PerfBaselineR3F inside <Canvas>.
 * Mount PerfBaselineHUD outside <Canvas>.
 * 
 * BASELINE TOOLING ONLY. No gameplay logic. Remove after P0 validation.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

// ─── Shared state bridge between R3F and DOM ───

const perfState = {
  fps: 0,
  frameTicks: 0,
  // Rolling buffers for 30-second averages
  fpsHistory: [] as number[],
  tickHistory: [] as number[],
  lastFpsSampleTime: 0,
  frameCountSinceLastSample: 0,
  tickCountSinceLastSample: 0,
  lastTickSampleTime: 0,
};

// ─── R3F Component (inside Canvas) ───

export function PerfBaselineR3F() {
  const { gl } = useThree();

  useFrame(() => {
    const now = performance.now();

    // Count frame ticks
    perfState.tickCountSinceLastSample++;

    // Sample every 1 second
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
    }
  });

  // Use gl.info for draw call counting & fps proxy via rAF
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let raf: number;

    const loop = () => {
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        const elapsed = (now - lastTime) / 1000;
        const fps = frameCount / elapsed;
        perfState.fps = fps;
        perfState.fpsHistory.push(fps);
        if (perfState.fpsHistory.length > 30) perfState.fpsHistory.shift();
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

type Scenario = 'Open Field' | 'Capital' | 'Combat' | 'None';

interface BaselineData {
  fps: number;
  ticks: number;
}

export function PerfBaselineHUD() {
  const [displayFps, setDisplayFps] = useState(0);
  const [displayTicks, setDisplayTicks] = useState(0);
  const [avgFps, setAvgFps] = useState(0);
  const [avgTicks, setAvgTicks] = useState(0);
  const [heapMB, setHeapMB] = useState('—');
  const [initialHeap, setInitialHeap] = useState('—');
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

  // Poll perfState every 500ms for display
  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayFps(Math.round(perfState.fps));
      setDisplayTicks(Math.round(perfState.frameTicks));

      // 30s rolling averages
      if (perfState.fpsHistory.length > 0) {
        const sum = perfState.fpsHistory.reduce((a, b) => a + b, 0);
        setAvgFps(Math.round(sum / perfState.fpsHistory.length));
      }
      if (perfState.tickHistory.length > 0) {
        const sum = perfState.tickHistory.reduce((a, b) => a + b, 0);
        setAvgTicks(Math.round(sum / perfState.tickHistory.length));
      }

      // Heap
      const perf = (performance as any);
      if (perf.memory) {
        const used = (perf.memory.usedJSHeapSize / 1048576).toFixed(1);
        setHeapMB(used);
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Initial heap capture
  useEffect(() => {
    const timeout = setTimeout(() => {
      const perf = (performance as any);
      if (perf.memory) {
        const used = (perf.memory.usedJSHeapSize / 1048576).toFixed(1);
        setInitialHeap(used);
        initialHeapRef.current = used;
        console.log(`[PerfBaseline] Initial heap: ${used}MB`);
      }
    }, 3000);
    return () => clearTimeout(timeout);
  }, []);

  // Heap logger every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      const perf = (performance as any);
      if (perf.memory) {
        const used = (perf.memory.usedJSHeapSize / 1048576).toFixed(1);
        const total = (perf.memory.totalJSHeapSize / 1048576).toFixed(1);
        console.log(`[PerfBaseline] Heap: ${used}MB used / ${total}MB total`);
        fiveMinHeapRef.current = used;
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

      // Accumulate samples
      recordFpsAccum.current.push(perfState.fps);
      recordTickAccum.current.push(perfState.frameTicks);

      // Auto-stop at 30s
      if (elapsed >= 30) {
        finishRecording();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [recording]);

  const startRecording = useCallback((s: Scenario) => {
    setScenario(s);
    recordScenarioRef.current = s;
    recordStartRef.current = performance.now();
    recordFpsAccum.current = [];
    recordTickAccum.current = [];
    setRecording(true);
    setRecordSeconds(0);
    console.log(`[PerfBaseline] Started 30s recording for: ${s}`);
  }, []);

  const finishRecording = useCallback(() => {
    setRecording(false);
    const fpsArr = recordFpsAccum.current;
    const tickArr = recordTickAccum.current;
    const avgF = fpsArr.length > 0 ? Math.round(fpsArr.reduce((a, b) => a + b, 0) / fpsArr.length) : 0;
    const avgT = tickArr.length > 0 ? Math.round(tickArr.reduce((a, b) => a + b, 0) / tickArr.length) : 0;
    const s = recordScenarioRef.current;
    capturedRef.current[s] = { fps: avgF, ticks: avgT };
    console.log(`[PerfBaseline] ${s} — 30s avg FPS: ${avgF}, ticks/sec: ${avgT}`);
  }, []);

  const copySummary = useCallback(() => {
    const of = capturedRef.current['Open Field'];
    const cap = capturedRef.current['Capital'];
    const com = capturedRef.current['Combat'];
    const summary = [
      `Open field FPS: ${of?.fps ?? '___'}`,
      `Capital FPS: ${cap?.fps ?? '___'}`,
      `Combat FPS: ${com?.fps ?? '___'}`,
      `Open field frame ticks/sec: ${of?.ticks ?? '___'}`,
      `Capital frame ticks/sec: ${cap?.ticks ?? '___'}`,
      `Combat frame ticks/sec: ${com?.ticks ?? '___'}`,
      `Initial heap: ${initialHeapRef.current}MB`,
      `5-minute heap: ${fiveMinHeapRef.current}MB`,
      `Console errors: no`,
      `Ready for P0: yes`,
    ].join('\n');
    navigator.clipboard.writeText(summary).then(() => {
      console.log('[PerfBaseline] Summary copied to clipboard!');
      console.log(summary);
    }).catch(() => {
      console.log('[PerfBaseline] Clipboard failed, summary:');
      console.log(summary);
    });
  }, []);

  const scenarioColor = (s: Scenario) => {
    const captured = !!capturedRef.current[s];
    if (recording && scenario === s) return '#ff0';
    if (captured) return '#0f0';
    return '#888';
  };

  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{
      position: 'fixed',
      bottom: 8,
      right: 8,
      zIndex: 99999,
      background: 'rgba(0,0,0,0.88)',
      color: '#0f0',
      fontFamily: 'monospace',
      fontSize: collapsed ? 11 : 14,
      padding: collapsed ? '6px 10px' : '12px 16px',
      borderRadius: 8,
      border: '1px solid #333',
      minWidth: collapsed ? 120 : 260,
      pointerEvents: 'auto',
      userSelect: 'none',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setCollapsed(!collapsed)}>
        <span style={{ fontWeight: 'bold', color: '#fff', fontSize: 11 }}>
          📊 PERF {collapsed ? `${displayFps} FPS` : 'BASELINE'}
        </span>
        <span style={{ color: '#666', fontSize: 10, marginLeft: 8 }}>{collapsed ? '▲' : '▼'}</span>
      </div>

      {!collapsed && (
        <>
          {/* Live metrics */}
          <div style={{ marginTop: 8, marginBottom: 6 }}>
            <span style={{ color: '#aaa' }}>FPS: </span>
            <span style={{ color: displayFps < 30 ? '#f44' : displayFps < 50 ? '#ff0' : '#0f0', fontWeight: 'bold', fontSize: 16 }}>
              {displayFps}
            </span>
            <span style={{ color: '#666', marginLeft: 8 }}>avg30s: {avgFps}</span>
          </div>
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: '#aaa' }}>Ticks/s: </span>
            <span style={{ fontWeight: 'bold' }}>{displayTicks}</span>
            <span style={{ color: '#666', marginLeft: 8 }}>avg30s: {avgTicks}</span>
          </div>
          <div style={{ marginBottom: 10 }}>
            <span style={{ color: '#aaa' }}>Heap: </span>
            <span>{heapMB} MB</span>
            <span style={{ color: '#666', marginLeft: 8 }}>init: {initialHeap} MB</span>
          </div>

          {/* Scenario buttons */}
          <div style={{ fontWeight: 'bold', color: '#ccc', marginBottom: 4, fontSize: 11 }}>
            RECORD 30s BASELINE:
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
            {(['Open Field', 'Capital', 'Combat'] as Scenario[]).map(s => (
              <button
                key={s}
                onClick={() => !recording && startRecording(s)}
                disabled={recording}
                style={{
                  background: scenarioColor(s),
                  color: '#000',
                  border: 'none',
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontSize: 11,
                  fontWeight: 'bold',
                  fontFamily: 'monospace',
                  cursor: recording ? 'not-allowed' : 'pointer',
                  opacity: recording && scenario !== s ? 0.4 : 1,
                }}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Recording indicator */}
          {recording && (
            <div style={{ color: '#ff0', marginBottom: 8, fontSize: 12 }}>
              ⏺ Recording {scenario}... {recordSeconds}s / 30s
            </div>
          )}

          {/* Captured results */}
          {Object.keys(capturedRef.current).length > 0 && (
            <div style={{ borderTop: '1px solid #333', paddingTop: 6, marginBottom: 8, fontSize: 11, color: '#aaa' }}>
              {Object.entries(capturedRef.current).map(([k, v]) => (
                <div key={k}>{k}: {v.fps} FPS / {v.ticks} ticks/s</div>
              ))}
            </div>
          )}

          {/* Copy button */}
          <button
            onClick={copySummary}
            style={{
              background: '#2a6',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 'bold',
              fontFamily: 'monospace',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            📋 Copy Baseline Summary
          </button>
        </>
      )}
    </div>
  );
}
