/**
 * Shared time-of-day state — GLOBALLY SYNCHRONIZED.
 *
 * All clients compute timeOfDay from the same absolute epoch using Date.now().
 * This guarantees every player sees the same sun, sky, fog, and lamp state
 * with zero network traffic.
 *
 * Full cycle = 3600 seconds (1 real hour).
 * WORLD_EPOCH is an arbitrary fixed timestamp. All clients share it.
 */
import * as THREE from 'three';

// Full cycle = 3600 seconds (1 hour)
const DAY_LENGTH = 3600;
const DAY_LENGTH_MS = DAY_LENGTH * 1000;

/**
 * Fixed world epoch — an arbitrary past timestamp.
 * Every client uses this same constant so they all compute the same timeOfDay.
 * Changing this value shifts what time the world "starts" at.
 */
const WORLD_EPOCH_MS = 1700000000000; // Nov 14 2023 — arbitrary anchor

/**
 * Compute timeOfDay deterministically from the real clock.
 * 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
 */
function computeTimeOfDay(): number {
  const elapsed = (Date.now() - WORLD_EPOCH_MS) % DAY_LENGTH_MS;
  return elapsed / DAY_LENGTH_MS;
}

export function getTimeOfDay(): number {
  return computeTimeOfDay();
}

/**
 * advanceTime is now a no-op. Time is derived from the real clock.
 * Kept for API compatibility so callers don't break.
 */
export function advanceTime(_deltaSec: number) {
  // No-op: time is globally computed from Date.now()
}

/** Sun elevation: 0 at horizon, PI/2 at zenith. Negative = below horizon. */
export function getSunElevation(): number {
  const t = computeTimeOfDay();
  if (t < 0.2 || t > 0.8) return -0.1; // below horizon
  const normalized = (t - 0.2) / 0.6; // 0→1 over daytime
  return Math.sin(normalized * Math.PI) * (Math.PI / 2.2);
}

/** Sun azimuth angle (rotation around Y axis). East→South→West. */
export function getSunAzimuth(): number {
  const t = computeTimeOfDay();
  const normalized = (t - 0.2) / 0.6;
  return -Math.PI * 0.4 + normalized * Math.PI * 0.8;
}

/** Get sun direction vector (world space, pointing FROM sun). */
export function getSunDirection(out: THREE.Vector3): THREE.Vector3 {
  const elev = getSunElevation();
  const azim = getSunAzimuth();
  out.set(
    Math.cos(elev) * Math.sin(azim),
    Math.sin(elev),
    Math.cos(elev) * Math.cos(azim)
  );
  return out;
}

// ---- Color palettes for different times ----

interface TimeColors {
  sunColor: THREE.Color;
  ambientColor: THREE.Color;
  fogColor: THREE.Color;
  sunIntensity: number;
  ambientIntensity: number;
}

const sunrise = {
  sunColor: new THREE.Color('#ff8844'),
  ambientColor: new THREE.Color('#8a6050'),
  fogColor: new THREE.Color('#c49060'),
  sunIntensity: 1.0,
  ambientIntensity: 0.25,
};

const day = {
  sunColor: new THREE.Color('#ffe8c0'),
  ambientColor: new THREE.Color('#9aabbf'),
  fogColor: new THREE.Color('#8a9a80'),
  sunIntensity: 1.4,
  ambientIntensity: 0.35,
};

const sunset = {
  sunColor: new THREE.Color('#ff6622'),
  ambientColor: new THREE.Color('#7a5040'),
  fogColor: new THREE.Color('#b07040'),
  sunIntensity: 1.1,
  ambientIntensity: 0.22,
};

const night = {
  sunColor: new THREE.Color('#334466'),
  ambientColor: new THREE.Color('#2a3850'),
  fogColor: new THREE.Color('#1a2535'),
  sunIntensity: 0.18,
  ambientIntensity: 0.14,
};

/** Returns 0 during day, 1 at full night. Smooth transition. */
export function getNightFactor(): number {
  const t = computeTimeOfDay();
  if (t < 0.2 || t > 0.85) return 1;
  if (t < 0.3) return 1 - (t - 0.2) / 0.1;
  if (t > 0.7) return (t - 0.7) / 0.15;
  return 0;
}

const tmpColor = new THREE.Color();

function lerpColor(a: THREE.Color, b: THREE.Color, t: number, out: THREE.Color): THREE.Color {
  out.r = a.r + (b.r - a.r) * t;
  out.g = a.g + (b.g - a.g) * t;
  out.b = a.b + (b.b - a.b) * t;
  return out;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function getTimeColors(out: TimeColors = {
  sunColor: new THREE.Color(),
  ambientColor: new THREE.Color(),
  fogColor: new THREE.Color(),
  sunIntensity: 1,
  ambientIntensity: 0.3,
}): TimeColors {
  const t = computeTimeOfDay();

  // Time zones:
  // 0.0-0.2: night
  // 0.2-0.3: sunrise transition
  // 0.3-0.45: morning
  // 0.45-0.55: noon
  // 0.55-0.7: afternoon
  // 0.7-0.8: sunset transition
  // 0.8-1.0: night

  if (t < 0.2 || t >= 0.8) {
    // Night
    out.sunColor.copy(night.sunColor);
    out.ambientColor.copy(night.ambientColor);
    out.fogColor.copy(night.fogColor);
    out.sunIntensity = night.sunIntensity;
    out.ambientIntensity = night.ambientIntensity;
  } else if (t < 0.3) {
    // Sunrise transition (night → sunrise → day)
    const p = (t - 0.2) / 0.1;
    if (p < 0.5) {
      const pp = p / 0.5;
      lerpColor(night.sunColor, sunrise.sunColor, pp, out.sunColor);
      lerpColor(night.ambientColor, sunrise.ambientColor, pp, out.ambientColor);
      lerpColor(night.fogColor, sunrise.fogColor, pp, out.fogColor);
      out.sunIntensity = lerp(night.sunIntensity, sunrise.sunIntensity, pp);
      out.ambientIntensity = lerp(night.ambientIntensity, sunrise.ambientIntensity, pp);
    } else {
      const pp = (p - 0.5) / 0.5;
      lerpColor(sunrise.sunColor, day.sunColor, pp, out.sunColor);
      lerpColor(sunrise.ambientColor, day.ambientColor, pp, out.ambientColor);
      lerpColor(sunrise.fogColor, day.fogColor, pp, out.fogColor);
      out.sunIntensity = lerp(sunrise.sunIntensity, day.sunIntensity, pp);
      out.ambientIntensity = lerp(sunrise.ambientIntensity, day.ambientIntensity, pp);
    }
  } else if (t < 0.7) {
    // Daytime
    out.sunColor.copy(day.sunColor);
    out.ambientColor.copy(day.ambientColor);
    out.fogColor.copy(day.fogColor);
    out.sunIntensity = day.sunIntensity;
    out.ambientIntensity = day.ambientIntensity;
  } else {
    // Sunset transition (day → sunset → night)
    const p = (t - 0.7) / 0.1;
    if (p < 0.5) {
      const pp = p / 0.5;
      lerpColor(day.sunColor, sunset.sunColor, pp, out.sunColor);
      lerpColor(day.ambientColor, sunset.ambientColor, pp, out.ambientColor);
      lerpColor(day.fogColor, sunset.fogColor, pp, out.fogColor);
      out.sunIntensity = lerp(day.sunIntensity, sunset.sunIntensity, pp);
      out.ambientIntensity = lerp(day.ambientIntensity, sunset.ambientIntensity, pp);
    } else {
      const pp = (p - 0.5) / 0.5;
      lerpColor(sunset.sunColor, night.sunColor, pp, out.sunColor);
      lerpColor(sunset.ambientColor, night.ambientColor, pp, out.ambientColor);
      lerpColor(sunset.fogColor, night.fogColor, pp, out.fogColor);
      out.sunIntensity = lerp(sunset.sunIntensity, night.sunIntensity, pp);
      out.ambientIntensity = lerp(sunset.ambientIntensity, night.ambientIntensity, pp);
    }
  }

  return out;
}
