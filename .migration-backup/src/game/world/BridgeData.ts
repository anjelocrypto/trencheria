/**
 * Bridge definitions — shared between renderer, terrain, and collision.
 */

export interface BridgeDef {
  id: string;
  position: [number, number, number]; // center of bridge deck
  rotation: number; // Y rotation in radians
  length: number;
  width: number;
  style: 'stone' | 'wood' | 'grand';
}

export const BRIDGES: BridgeDef[] = [
  // Bridge over the existing river near Ironhold
  {
    id: 'bridge-ironhold-river',
    position: [30, 0.5, -10],
    rotation: 0.3,
    length: 26,
    width: 5,
    style: 'stone',
  },
  // Bridge connecting central world to Rivermoor (NE expansion)
  {
    id: 'bridge-rivermoor-approach',
    position: [320, 0.8, 280],
    rotation: 0.6,
    length: 30,
    width: 5,
    style: 'grand',
  },
  // Bridge near Goldenvale trade route (western expansion)
  {
    id: 'bridge-goldenvale-trade',
    position: [-380, 0.5, 60],
    rotation: -0.2,
    length: 24,
    width: 4.5,
    style: 'stone',
  },
  // Bridge over Darkhollow marsh crossing
  {
    id: 'bridge-darkhollow-marsh',
    position: [400, 0.3, -320],
    rotation: 0.4,
    length: 28,
    width: 4,
    style: 'wood',
  },
  // Small bridge near Stonepeak mountain pass
  {
    id: 'bridge-stonepeak-pass',
    position: [-300, 2, 400],
    rotation: 0.1,
    length: 20,
    width: 4,
    style: 'stone',
  },
];

/**
 * Check if a world position is on a bridge. Returns bridge deck height or null.
 */
export function getBridgeHeight(x: number, z: number): number | null {
  for (const bridge of BRIDGES) {
    const cos = Math.cos(-bridge.rotation);
    const sin = Math.sin(-bridge.rotation);
    const lx = cos * (x - bridge.position[0]) + sin * (z - bridge.position[2]);
    const lz = -sin * (x - bridge.position[0]) + cos * (z - bridge.position[2]);

    if (Math.abs(lx) <= bridge.width / 2 + 0.5 && Math.abs(lz) <= bridge.length / 2) {
      // Deck visual at py+0.8, thickness 0.4 → surface = py+0.8+0.2 = py+1.0
      // Add small ramp zone at bridge ends for smooth terrain→deck transition
      const endBlend = Math.max(0, (Math.abs(lz) - bridge.length / 2 + 2) / 2);
      return bridge.position[1] + 1.0;
    }
  }
  return null;
}
