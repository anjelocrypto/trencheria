import { getTerrainHeight } from '../components/Terrain';

export type HorseState = 'idle' | 'called' | 'approaching' | 'waiting' | 'mounted';

export interface HorseData {
  id: string;
  position: [number, number, number];
  rotation: number;
  state: HorseState;
}

export const HORSE_SPEED = 22;
export const HORSE_RUN_SPEED = 32;
export const MOUNT_RANGE = 4;
export const DISMOUNT_OFFSET = 2.5;
export const HORSE_CAMERA_DISTANCE_BONUS = 4;
export const HORSE_CAMERA_HEIGHT_BONUS = 1.5;
export const HORSE_APPROACH_SPEED = 12;
export const HORSE_APPROACH_STOP_DIST = 3.5;
export const HORSE_WAIT_RANGE = 8; // stays within this range of player

export function createPlayerHorse(): HorseData {
  // Spawn near the south gate of Ironhold, not inside the keep
  const sx = 3;
  const sz = 48;
  return {
    id: 'player-horse',
    position: [sx, getTerrainHeight(sx, sz), sz],
    rotation: 0,
    state: 'idle',
  };
}
