/**
 * devLog — Production-safe logging helpers.
 *
 * `devLog` / `devWarn` are no-ops in production builds. They also gate on
 * a `?debug=1` URL param so a user can opt in to verbose logging in prod
 * for a specific session. Errors should always use `console.error`
 * directly — those stay on in production.
 */

const isDev = import.meta.env.DEV;

let debugFlag = false;
if (typeof window !== 'undefined') {
  try {
    const params = new URLSearchParams(window.location.search);
    debugFlag = params.get('debug') === '1' || params.get('perf') === '1';
  } catch {
    debugFlag = false;
  }
}

const enabled = isDev || debugFlag;

export function devLog(...args: unknown[]): void {
  if (enabled) console.log(...args);
}

export function devWarn(...args: unknown[]): void {
  if (enabled) console.warn(...args);
}

export const isDebugLoggingEnabled = enabled;
