/**
 * useQualitySettings — Low / Medium / High rendering quality tier.
 *
 * Persisted to localStorage so the user keeps their pick across sessions.
 * Defaults to 'medium' on touch devices, 'high' otherwise.
 *
 * The tier controls:
 * - Canvas DPR cap                 (Low 1, Medium 1.5, High 2)
 * - Antialias                      (High only)
 * - Shadows                        (Medium+)
 * - Shadow map size                (Low 512, Medium 1024, High 2048)
 * - Far-prop shadow casting        (gated in components via this hook)
 * - Adaptive fallback              (auto-drops one tier on sustained <35 FPS)
 */

import { useEffect, useState, useCallback } from 'react';

export type QualityTier = 'low' | 'medium' | 'high';

const STORAGE_KEY = 'trencheria.quality';
const ADAPTIVE_KEY = 'trencheria.quality.autoDropped';
// Browser StorageEvent only fires in OTHER tabs/windows — not the same
// document. We dispatch this CustomEvent in addition so subscribers in
// THIS tab (GameScene, Atmosphere, SettingsPanel) all update live when
// the user clicks a quality button.
const SAME_TAB_EVENT = 'trencheria-quality-change';

function detectDefaultTier(): QualityTier {
  if (typeof window === 'undefined') return 'high';
  // Touch device → start medium so phones don't melt
  const isTouch =
    'ontouchstart' in window ||
    (navigator.maxTouchPoints !== undefined && navigator.maxTouchPoints > 0);
  return isTouch ? 'medium' : 'high';
}

function readStoredTier(): QualityTier {
  if (typeof window === 'undefined') return 'high';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'low' || raw === 'medium' || raw === 'high') return raw;
  } catch {
    /* ignore */
  }
  return detectDefaultTier();
}

interface QualitySettingsValue {
  tier: QualityTier;
  setTier: (t: QualityTier) => void;
  dpr: [number, number];
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: number;
  farShadows: boolean;
}

function tierToValues(tier: QualityTier): Omit<QualitySettingsValue, 'tier' | 'setTier'> {
  switch (tier) {
    case 'low':
      return {
        dpr: [1, 1],
        antialias: false,
        shadows: false,
        shadowMapSize: 512,
        farShadows: false,
      };
    case 'medium':
      return {
        dpr: [1, 1.5],
        antialias: false,
        shadows: true,
        shadowMapSize: 1024,
        farShadows: false,
      };
    case 'high':
    default:
      return {
        dpr: [1, 2],
        antialias: true,
        shadows: true,
        shadowMapSize: 2048,
        farShadows: true,
      };
  }
}

/**
 * Read-only snapshot of current quality (does not subscribe to changes).
 * For components that need to react, prefer `useQualitySettings()`.
 */
export function getCurrentQualityTier(): QualityTier {
  return readStoredTier();
}

export function getCurrentQualityValues(): Omit<QualitySettingsValue, 'tier' | 'setTier'> {
  return tierToValues(readStoredTier());
}

/**
 * Tries to drop one tier (high → medium → low). No-op if already low or
 * if we already auto-dropped this session (avoid oscillation).
 */
export function tryAdaptiveDrop(): QualityTier | null {
  if (typeof window === 'undefined') return null;
  try {
    if (window.sessionStorage.getItem(ADAPTIVE_KEY) === '1') return null;
    const cur = readStoredTier();
    const next: QualityTier | null =
      cur === 'high' ? 'medium' : cur === 'medium' ? 'low' : null;
    if (!next) return null;
    window.localStorage.setItem(STORAGE_KEY, next);
    window.sessionStorage.setItem(ADAPTIVE_KEY, '1');
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: next }));
    window.dispatchEvent(new CustomEvent(SAME_TAB_EVENT, { detail: next }));
    return next;
  } catch {
    return null;
  }
}

export function useQualitySettings(): QualitySettingsValue {
  const [tier, setTierState] = useState<QualityTier>(() => readStoredTier());

  // Cross-tab sync via StorageEvent + same-tab sync via CustomEvent so all
  // hook consumers in this document update when ANY of them calls setTier.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const v = e.newValue;
      if (v === 'low' || v === 'medium' || v === 'high') setTierState(v);
    };
    const onSameTab = (e: Event) => {
      const v = (e as CustomEvent<QualityTier>).detail;
      if (v === 'low' || v === 'medium' || v === 'high') setTierState(v);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(SAME_TAB_EVENT, onSameTab as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SAME_TAB_EVENT, onSameTab as EventListener);
    };
  }, []);

  const setTier = useCallback((t: QualityTier) => {
    setTierState(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
      // Notify all in-document subscribers (GameScene, Atmosphere, etc.)
      window.dispatchEvent(new CustomEvent(SAME_TAB_EVENT, { detail: t }));
    } catch {
      /* ignore */
    }
  }, []);

  return {
    tier,
    setTier,
    ...tierToValues(tier),
  };
}
