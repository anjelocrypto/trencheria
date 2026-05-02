import { getTerrainHeight } from '../components/Terrain';
import { WORLD_SIZE } from '../constants';
import { REGIONS, SETTLEMENTS, SMALL_POIS, ROADS } from '../world/RegionData';
import { RIVERS, LAKES } from '../world/WaterData';
import { BRIDGES } from '../world/BridgeData';
import { LootPickup } from '../types';

// Wilderness building positions for tree exclusion — inline list matching WildernessStructures clusters
// We can't import WILDERNESS_BUILDINGS directly due to circular deps, so we define cluster centers here
const WILDERNESS_CLUSTER_CENTERS: { x: number; z: number; radius: number }[] = [
  // Central world
  { x: 120, z: 30, radius: 20 }, { x: 75, z: -20, radius: 15 }, { x: -40, z: -120, radius: 22 },
  { x: 15, z: -130, radius: 14 }, { x: -175, z: -20, radius: 20 }, { x: -160, z: 60, radius: 16 },
  { x: -40, z: 140, radius: 18 }, { x: 50, z: 140, radius: 16 }, { x: 110, z: -140, radius: 18 },
  { x: 70, z: -120, radius: 14 }, { x: -240, z: -130, radius: 19 }, { x: 240, z: 180, radius: 16 },
  { x: -140, z: 210, radius: 18 }, { x: 200, z: -80, radius: 16 }, { x: -85, z: -30, radius: 14 },
  { x: 40, z: 70, radius: 14 },
  // Thornwall corridor
  { x: -350, z: -300, radius: 24 }, { x: -420, z: -380, radius: 19 }, { x: -480, z: -500, radius: 22 },
  { x: -550, z: -480, radius: 16 }, { x: -460, z: -350, radius: 18 },
  // Goldenvale corridor
  { x: -400, z: 80, radius: 22 }, { x: -480, z: 60, radius: 18 }, { x: -520, z: 180, radius: 20 },
  { x: -600, z: 50, radius: 19 }, { x: -580, z: 160, radius: 16 },
  // Rivermoor corridor
  { x: 350, z: 280, radius: 22 }, { x: 420, z: 400, radius: 18 }, { x: 380, z: 320, radius: 20 },
  { x: 500, z: 380, radius: 16 }, { x: 480, z: 420, radius: 18 },
  // Stonepeak corridor
  { x: -350, z: 380, radius: 24 }, { x: -300, z: 450, radius: 19 }, { x: -430, z: 550, radius: 18 },
  { x: -450, z: 450, radius: 20 },
  // Darkhollow corridor
  { x: 400, z: -300, radius: 22 }, { x: 480, z: -380, radius: 18 }, { x: 550, z: -450, radius: 20 },
  { x: 600, z: -350, radius: 16 },
  // Inter-kingdom + edge
  { x: -560, z: -200, radius: 19 }, { x: -540, z: -80, radius: 18 }, { x: -500, z: 300, radius: 20 },
  { x: -460, z: 400, radius: 18 }, { x: 520, z: 50, radius: 19 }, { x: 530, z: -150, radius: 18 },
  { x: -200, z: 540, radius: 20 }, { x: 100, z: 530, radius: 18 }, { x: 300, z: 450, radius: 19 },
  { x: -650, z: -600, radius: 24 }, { x: 650, z: 500, radius: 22 }, { x: 0, z: 600, radius: 20 },
  { x: -200, z: -500, radius: 22 }, { x: 200, z: 500, radius: 19 },
];
export interface WorldResource {
  id: string;
  type: 'tree' | 'rock' | 'berry_bush' | 'crate';
  position: [number, number, number];
  health: number;
  maxHealth: number;
  depleted: boolean;
  scale: number;
  variant: number;
  gatherable: boolean;
  trunkHeight: number;
  crownRadius: number;
  respawnTimer?: number;
}

// ========== FOREST BIOMES ==========
interface ForestZone {
  cx: number;
  cz: number;
  radius: number;
  density: number; // trees per ~100 sq units
  type: 'dense' | 'light' | 'scattered' | 'grove';
  name: string;
}

const FOREST_ZONES: ForestZone[] = [
  // ================================================================
  // === CENTRAL WORLD (original heartland, ±300) ===
  // ================================================================
  // Ashwood deep forest complex
  { cx: -210, cz: 165, radius: 70, density: 2.2, type: 'dense', name: 'Ashwood Deep' },
  { cx: -240, cz: 200, radius: 45, density: 1.8, type: 'dense', name: 'Ashwood North' },
  { cx: -175, cz: 115, radius: 35, density: 1.2, type: 'light', name: 'Ashwood Edge' },
  { cx: -260, cz: 40, radius: 50, density: 1.3, type: 'light', name: 'Western Woodland' },
  { cx: -280, cz: 130, radius: 35, density: 1.0, type: 'scattered', name: 'Far West Grove' },
  { cx: -220, cz: 250, radius: 45, density: 1.5, type: 'dense', name: 'Northern Pines' },
  { cx: -165, cz: 50, radius: 30, density: 0.7, type: 'light', name: 'Ashwood Southern Reach' },
  // Frostmere / highland
  { cx: 90, cz: 220, radius: 40, density: 0.9, type: 'scattered', name: 'Highland Thicket' },
  { cx: 60, cz: 260, radius: 45, density: 1.1, type: 'light', name: 'Northern Frontier' },
  { cx: 230, cz: 260, radius: 35, density: 0.7, type: 'scattered', name: 'Frostmere Pines' },
  // Heartland groves
  { cx: -70, cz: 45, radius: 25, density: 0.5, type: 'grove', name: 'Capital Grove East' },
  { cx: -115, cz: 130, radius: 30, density: 0.7, type: 'light', name: 'Midland Woods' },
  { cx: 70, cz: 100, radius: 22, density: 0.5, type: 'grove', name: 'Veyra Trail Grove' },
  { cx: -30, cz: 120, radius: 25, density: 0.6, type: 'grove', name: 'Northern Capital Grove' },
  { cx: 40, cz: 160, radius: 30, density: 0.7, type: 'light', name: 'Northern Meadow Woods' },
  // Greenmeadow surrounds
  { cx: -230, cz: -100, radius: 40, density: 1.0, type: 'light', name: 'Greenmeadow West Woods' },
  { cx: -200, cz: -210, radius: 45, density: 0.9, type: 'scattered', name: 'Southern Wilderness' },
  { cx: -100, cz: -200, radius: 30, density: 0.6, type: 'grove', name: 'Ravenwatch Approach' },
  // Blackthorn / eastern
  { cx: 260, cz: -210, radius: 40, density: 0.8, type: 'scattered', name: 'Blackthorn Frontier' },
  { cx: 160, cz: -240, radius: 35, density: 0.6, type: 'grove', name: 'Eastern Badlands Edge' },
  { cx: 115, cz: -180, radius: 28, density: 0.5, type: 'scattered', name: 'Frontier Copse' },
  { cx: 250, cz: 50, radius: 35, density: 0.6, type: 'scattered', name: 'Veyra Dead Woods' },
  { cx: 270, cz: 150, radius: 30, density: 0.5, type: 'grove', name: 'Ancient Grove' },
  // Border forests
  { cx: -280, cz: -200, radius: 45, density: 0.9, type: 'light', name: 'SW Border Forest' },
  { cx: 285, cz: 110, radius: 35, density: 0.6, type: 'scattered', name: 'Eastern Edge' },
  { cx: 0, cz: 285, radius: 40, density: 0.8, type: 'light', name: 'Northern Border' },
  { cx: 0, cz: -285, radius: 40, density: 0.7, type: 'scattered', name: 'Southern Border' },
  // Trail / road groves
  { cx: 140, cz: 70, radius: 28, density: 0.6, type: 'grove', name: 'Veyra Road Grove' },
  { cx: 110, cz: 25, radius: 22, density: 0.5, type: 'scattered', name: 'Eastern Meadow Trees' },
  { cx: -30, cz: -130, radius: 30, density: 0.7, type: 'light', name: 'Southern Heartland Woods' },
  { cx: 25, cz: -160, radius: 25, density: 0.6, type: 'scattered', name: 'Badlands Approach Trees' },
  { cx: -180, cz: -30, radius: 35, density: 0.8, type: 'light', name: 'Western Trail Forest' },
  { cx: 100, cz: -165, radius: 28, density: 0.5, type: 'scattered', name: 'Frontier Brush' },
  { cx: 140, cz: -200, radius: 25, density: 0.4, type: 'grove', name: 'Southern Frontier Grove' },
  // Deep corners
  { cx: -250, cz: 260, radius: 35, density: 0.6, type: 'scattered', name: 'NW Deep Forest' },
  { cx: 250, cz: -260, radius: 30, density: 0.5, type: 'scattered', name: 'SE Frontier Pines' },
  { cx: -150, cz: 250, radius: 30, density: 0.6, type: 'light', name: 'Far Northern Woods' },
  { cx: 150, cz: -270, radius: 25, density: 0.4, type: 'scattered', name: 'Deep South Trees' },

  // ================================================================
  // === EXPANDED WORLD — KINGDOM SURROUNDS ===
  // ================================================================

  // --- THORNWALL REGION (SW, center -500, -450) — broken woodland patches ---
  { cx: -450, cz: -500, radius: 55, density: 0.9, type: 'scattered', name: 'Thornwall Frontier Woods' },
  { cx: -550, cz: -400, radius: 45, density: 0.7, type: 'light', name: 'Thornwall Western Forest' },
  { cx: -400, cz: -380, radius: 40, density: 0.6, type: 'grove', name: 'Thornwall Approach Grove' },
  { cx: -580, cz: -500, radius: 50, density: 0.8, type: 'scattered', name: 'SW Frontier Pines' },
  { cx: -460, cz: -350, radius: 45, density: 0.7, type: 'light', name: 'Thornwall North Woodland' },
  { cx: -520, cz: -550, radius: 40, density: 0.6, type: 'scattered', name: 'Thornwall South Scrub' },
  { cx: -600, cz: -450, radius: 55, density: 0.8, type: 'light', name: 'Far SW Forest' },
  { cx: -380, cz: -500, radius: 35, density: 0.5, type: 'grove', name: 'Thornwall East Copse' },

  // --- GOLDENVALE REGION (W, center -550, 100) — cultivated groves, road-edge trees ---
  { cx: -600, cz: 50, radius: 55, density: 1.2, type: 'dense', name: 'Goldenvale Great Forest' },
  { cx: -580, cz: 180, radius: 50, density: 1.0, type: 'light', name: 'Vale Northern Woods' },
  { cx: -480, cz: 30, radius: 40, density: 0.8, type: 'light', name: 'Trade Road Forest' },
  { cx: -650, cz: 150, radius: 45, density: 0.9, type: 'light', name: 'Goldenvale Western Groves' },
  { cx: -620, cz: -50, radius: 50, density: 0.8, type: 'grove', name: 'Southern Vale Woods' },
  { cx: -500, cz: 200, radius: 40, density: 0.7, type: 'grove', name: 'Harvest Hill Grove' },
  { cx: -680, cz: 80, radius: 45, density: 0.7, type: 'scattered', name: 'Far West Vale Forest' },
  { cx: -550, cz: 250, radius: 40, density: 0.8, type: 'light', name: 'Vale Northern Reach' },

  // --- RIVERMOOR REGION (NE, center 450, 350) — riverbank trees, willow spacing ---
  { cx: 500, cz: 400, radius: 50, density: 0.9, type: 'light', name: 'Rivermoor Wetland Trees' },
  { cx: 420, cz: 420, radius: 40, density: 0.7, type: 'grove', name: 'Riverside Grove' },
  { cx: 380, cz: 280, radius: 45, density: 0.8, type: 'scattered', name: 'Reed Village Copse' },
  { cx: 520, cz: 300, radius: 45, density: 0.7, type: 'scattered', name: 'Rivermoor East Bank' },
  { cx: 400, cz: 450, radius: 40, density: 0.6, type: 'grove', name: 'Northern Wetland Copse' },
  { cx: 550, cz: 350, radius: 50, density: 0.8, type: 'light', name: 'Rivermoor Outer Forest' },
  { cx: 350, cz: 350, radius: 35, density: 0.6, type: 'grove', name: 'Rivermoor SW Copse' },
  { cx: 480, cz: 450, radius: 40, density: 0.7, type: 'light', name: 'NE Wetland Forest' },

  // --- STONEPEAK REGION (NW, center -400, 500) — highland pines, mountain bands ---
  { cx: -450, cz: 550, radius: 55, density: 1.3, type: 'dense', name: 'Highland Pine Forest' },
  { cx: -350, cz: 520, radius: 45, density: 1.0, type: 'light', name: 'Mountain Approach Woods' },
  { cx: -300, cz: 400, radius: 40, density: 0.7, type: 'scattered', name: 'Peak Trail Trees' },
  { cx: -480, cz: 500, radius: 50, density: 1.1, type: 'dense', name: 'Stonepeak Western Pines' },
  { cx: -420, cz: 600, radius: 45, density: 0.9, type: 'light', name: 'Stonepeak North Ridge' },
  { cx: -350, cz: 560, radius: 35, density: 0.8, type: 'scattered', name: 'Mountain Pass Forest' },
  { cx: -500, cz: 550, radius: 40, density: 0.7, type: 'scattered', name: 'Far NW Pines' },
  { cx: -320, cz: 480, radius: 35, density: 0.6, type: 'grove', name: 'Stonepeak Approach Copse' },

  // --- DARKHOLLOW REGION (SE, center 550, -400) — sparse dead woods ---
  { cx: 600, cz: -350, radius: 45, density: 0.5, type: 'scattered', name: 'Darkhollow Dead Forest' },
  { cx: 500, cz: -450, radius: 40, density: 0.4, type: 'grove', name: 'Wasteland Copse' },
  { cx: 480, cz: -300, radius: 35, density: 0.6, type: 'scattered', name: 'Hollow Edge Trees' },
  { cx: 620, cz: -450, radius: 50, density: 0.5, type: 'scattered', name: 'Far SE Dead Scrub' },
  { cx: 550, cz: -500, radius: 40, density: 0.4, type: 'scattered', name: 'Darkhollow Southern Waste' },
  { cx: 500, cz: -350, radius: 35, density: 0.5, type: 'grove', name: 'Ashkeep Ruins Trees' },
  { cx: 650, cz: -380, radius: 45, density: 0.4, type: 'scattered', name: 'Eastern Wastes Trees' },
  { cx: 580, cz: -280, radius: 35, density: 0.5, type: 'scattered', name: 'Hollow North Edge' },

  // ================================================================
  // === TRAVEL CORRIDORS — forests lining the roads between kingdoms ===
  // ================================================================

  // Ironhold → Thornwall corridor (SW diagonal)
  { cx: -200, cz: -180, radius: 45, density: 0.9, type: 'light', name: 'Western March South Woods' },
  { cx: -280, cz: -240, radius: 50, density: 0.8, type: 'light', name: 'March Waypoint Forest' },
  { cx: -350, cz: -300, radius: 50, density: 0.8, type: 'light', name: 'Western March Forest' },
  { cx: -380, cz: -350, radius: 45, density: 0.7, type: 'scattered', name: 'March Deep Woods' },
  { cx: -420, cz: -400, radius: 40, density: 0.6, type: 'scattered', name: 'Thornwatch Trail Trees' },
  { cx: -320, cz: -180, radius: 40, density: 0.7, type: 'light', name: 'Western March North Belt' },

  // Ironhold → Goldenvale corridor (W)
  { cx: -250, cz: 100, radius: 45, density: 0.9, type: 'light', name: 'Western Forest Belt' },
  { cx: -320, cz: 120, radius: 50, density: 0.8, type: 'light', name: 'Ashwood-Vale Transition' },
  { cx: -400, cz: 100, radius: 50, density: 0.9, type: 'light', name: 'Vale Approach Forest' },
  { cx: -450, cz: 80, radius: 40, density: 0.7, type: 'grove', name: 'Trade Route Groves' },
  { cx: -380, cz: 160, radius: 45, density: 0.8, type: 'light', name: 'Northern Vale Trail Forest' },

  // Ironhold → Stonepeak corridor (NW)
  { cx: -220, cz: 300, radius: 50, density: 1.0, type: 'light', name: 'NW Corridor South Forest' },
  { cx: -250, cz: 350, radius: 55, density: 1.1, type: 'dense', name: 'NW Corridor Deep Forest' },
  { cx: -280, cz: 400, radius: 50, density: 0.9, type: 'light', name: 'Highland Approach Forest' },
  { cx: -320, cz: 350, radius: 40, density: 0.8, type: 'light', name: 'Peak Road Forest' },
  { cx: -200, cz: 400, radius: 45, density: 0.8, type: 'scattered', name: 'Northern Wilderness' },

  // Ironhold → Rivermoor corridor (NE)
  { cx: 200, cz: 200, radius: 45, density: 0.8, type: 'light', name: 'NE Corridor South Forest' },
  { cx: 250, cz: 250, radius: 50, density: 0.9, type: 'light', name: 'NE Corridor Forest' },
  { cx: 300, cz: 280, radius: 45, density: 0.8, type: 'light', name: 'Rivermoor Trail Forest' },
  { cx: 350, cz: 300, radius: 40, density: 0.7, type: 'scattered', name: 'Reed Village Trail Trees' },
  { cx: 250, cz: 180, radius: 35, density: 0.6, type: 'grove', name: 'NE Meadow Copse' },

  // Ironhold → Darkhollow corridor (SE)
  { cx: 250, cz: -180, radius: 45, density: 0.7, type: 'scattered', name: 'SE Corridor South Forest' },
  { cx: 300, cz: -220, radius: 50, density: 0.7, type: 'light', name: 'SE Corridor Forest' },
  { cx: 350, cz: -260, radius: 45, density: 0.6, type: 'scattered', name: 'Darkhollow Trail Forest' },
  { cx: 400, cz: -300, radius: 40, density: 0.6, type: 'scattered', name: 'Ashkeep Approach Trees' },
  { cx: 450, cz: -350, radius: 40, density: 0.5, type: 'scattered', name: 'SE Wasteland Trees' },

  // Inter-kingdom connectors
  // Thornwall → Goldenvale (W edge)
  { cx: -580, cz: -200, radius: 50, density: 0.7, type: 'light', name: 'Thornwall-Vale Trail West' },
  { cx: -560, cz: -100, radius: 50, density: 0.8, type: 'light', name: 'Western Wall Forest' },
  { cx: -550, cz: 0, radius: 45, density: 0.7, type: 'scattered', name: 'SW-W Connector Woods' },

  // Goldenvale → Stonepeak (NW edge)
  { cx: -500, cz: 280, radius: 50, density: 0.9, type: 'light', name: 'Vale-Peak Trail Forest' },
  { cx: -480, cz: 380, radius: 50, density: 1.0, type: 'dense', name: 'Western Highland Forest' },
  { cx: -450, cz: 450, radius: 45, density: 0.8, type: 'light', name: 'Peak Southern Approach' },

  // Rivermoor → Darkhollow (E edge)
  { cx: 520, cz: 200, radius: 45, density: 0.6, type: 'scattered', name: 'Eastern Coastal Woods' },
  { cx: 530, cz: 50, radius: 50, density: 0.6, type: 'scattered', name: 'Eastern Frontier Forest' },
  { cx: 520, cz: -100, radius: 45, density: 0.5, type: 'scattered', name: 'Eastern Badlands Edge' },
  { cx: 540, cz: -200, radius: 40, density: 0.5, type: 'scattered', name: 'Darkhollow NE Approach' },

  // Stonepeak → Rivermoor (N edge)
  { cx: -200, cz: 550, radius: 50, density: 0.8, type: 'light', name: 'Northern Route W Forest' },
  { cx: -50, cz: 580, radius: 55, density: 0.9, type: 'light', name: 'Far North Woods' },
  { cx: 100, cz: 550, radius: 50, density: 0.8, type: 'light', name: 'Northern Route E Forest' },
  { cx: 250, cz: 500, radius: 45, density: 0.7, type: 'scattered', name: 'NE Northern Approach' },
  { cx: 350, cz: 420, radius: 40, density: 0.6, type: 'scattered', name: 'Rivermoor Northern Edge' },

  // ================================================================
  // === EMPTY ZONE FILL — plains, hillsides, edge wilderness ===
  // ================================================================

  // Central heartland fill (between original settlements)
  { cx: -80, cz: -80, radius: 35, density: 0.6, type: 'grove', name: 'Heartland South Copse' },
  { cx: 80, cz: -60, radius: 30, density: 0.5, type: 'grove', name: 'Heartland East Trees' },
  { cx: -50, cz: 200, radius: 35, density: 0.7, type: 'light', name: 'Northern Heartland Forest' },
  { cx: 150, cz: 130, radius: 30, density: 0.5, type: 'grove', name: 'Frostmere Road Copse' },
  { cx: -120, cz: -30, radius: 28, density: 0.5, type: 'grove', name: 'Western Heartland Copse' },

  // Transition zone fill (300-500 range — mostly empty currently)
  { cx: -350, cz: 0, radius: 55, density: 0.8, type: 'light', name: 'Western Plains Forest' },
  { cx: -300, cz: -100, radius: 50, density: 0.7, type: 'light', name: 'SW Plains Woodland' },
  { cx: -400, cz: -50, radius: 45, density: 0.7, type: 'scattered', name: 'Deep Western Forest' },
  { cx: 350, cz: 0, radius: 50, density: 0.6, type: 'scattered', name: 'Eastern Plains Trees' },
  { cx: 300, cz: -100, radius: 45, density: 0.5, type: 'scattered', name: 'SE Plains Scrub' },
  { cx: 400, cz: 100, radius: 50, density: 0.6, type: 'scattered', name: 'Eastern Wilds Forest' },
  { cx: 0, cz: 400, radius: 55, density: 0.8, type: 'light', name: 'Central North Forest' },
  { cx: 100, cz: 350, radius: 45, density: 0.7, type: 'scattered', name: 'NE Heartland Extension' },
  { cx: -100, cz: 350, radius: 50, density: 0.8, type: 'light', name: 'NW Heartland Extension' },
  { cx: 0, cz: -350, radius: 50, density: 0.6, type: 'scattered', name: 'Southern Wilds Forest' },
  { cx: -150, cz: -300, radius: 45, density: 0.7, type: 'light', name: 'SW Transition Forest' },
  { cx: 150, cz: -300, radius: 40, density: 0.5, type: 'scattered', name: 'SE Transition Scrub' },
  { cx: -150, cz: 400, radius: 45, density: 0.8, type: 'light', name: 'NW Transition Forest' },
  { cx: 200, cz: 400, radius: 45, density: 0.7, type: 'scattered', name: 'NE Transition Forest' },
  { cx: -400, cz: 250, radius: 50, density: 0.9, type: 'light', name: 'Western Highland Transition' },
  { cx: 400, cz: -150, radius: 45, density: 0.5, type: 'scattered', name: 'Eastern Frontier Transition' },

  // World edge forests (600-850 range)
  { cx: -700, cz: 0, radius: 60, density: 0.6, type: 'scattered', name: 'Far West Edge' },
  { cx: -750, cz: -200, radius: 55, density: 0.5, type: 'scattered', name: 'Far SW Edge Forest' },
  { cx: -750, cz: 200, radius: 55, density: 0.6, type: 'scattered', name: 'Far NW Edge Forest' },
  { cx: 700, cz: 0, radius: 55, density: 0.4, type: 'scattered', name: 'Far East Edge' },
  { cx: 700, cz: -200, radius: 50, density: 0.4, type: 'scattered', name: 'Far SE Edge Forest' },
  { cx: 700, cz: 200, radius: 50, density: 0.5, type: 'scattered', name: 'Far NE Edge Forest' },
  { cx: 0, cz: 700, radius: 60, density: 0.7, type: 'light', name: 'Far North Edge' },
  { cx: -300, cz: 650, radius: 55, density: 0.7, type: 'light', name: 'NW Edge Forest' },
  { cx: 300, cz: 600, radius: 50, density: 0.6, type: 'scattered', name: 'NE Edge Forest' },
  { cx: 0, cz: -700, radius: 55, density: 0.5, type: 'scattered', name: 'Far South Edge' },
  { cx: -300, cz: -600, radius: 50, density: 0.6, type: 'scattered', name: 'SW Edge Forest' },
  { cx: 300, cz: -600, radius: 50, density: 0.4, type: 'scattered', name: 'SE Edge Forest' },

  // Ridgeline and hillside forests
  { cx: -350, cz: 500, radius: 45, density: 1.0, type: 'dense', name: 'Stonepeak Ridge Forest' },
  { cx: -450, cz: 400, radius: 40, density: 0.8, type: 'light', name: 'Mountain Pine Belt' },
  { cx: 150, cz: 450, radius: 40, density: 0.7, type: 'scattered', name: 'Northern Hills Trees' },
  { cx: -100, cz: 500, radius: 45, density: 0.8, type: 'light', name: 'Northern Hillside Forest' },
  { cx: 500, cz: -150, radius: 40, density: 0.4, type: 'scattered', name: 'Eastern Crag Trees' },

  // Fill between kingdom pairs
  { cx: -500, cz: -250, radius: 50, density: 0.7, type: 'light', name: 'Thornwall-Vale Gap Forest' },
  { cx: -450, cz: -150, radius: 45, density: 0.6, type: 'scattered', name: 'SW Connector Forest' },
  { cx: 450, cz: 150, radius: 45, density: 0.5, type: 'scattered', name: 'Rivermoor Western Approach' },
  { cx: 400, cz: -50, radius: 40, density: 0.5, type: 'scattered', name: 'Eastern Crossroads Forest' },
  { cx: -450, cz: 250, radius: 45, density: 0.8, type: 'light', name: 'Vale-Peak Mid Forest' },
  { cx: 0, cz: -500, radius: 50, density: 0.5, type: 'scattered', name: 'Deep South Wilderness' },
  { cx: -200, cz: -450, radius: 45, density: 0.6, type: 'scattered', name: 'Far SW Plains Trees' },
  { cx: 200, cz: -450, radius: 40, density: 0.4, type: 'scattered', name: 'Far SE Plains Scrub' },
  { cx: 600, cz: 300, radius: 40, density: 0.5, type: 'scattered', name: 'Far NE Coastal Forest' },
  { cx: 650, cz: -100, radius: 40, density: 0.4, type: 'scattered', name: 'Eastern Wasteland Edge' },
  { cx: -650, cz: -300, radius: 45, density: 0.5, type: 'scattered', name: 'Far SW Border Forest' },
  { cx: -650, cz: 350, radius: 45, density: 0.6, type: 'light', name: 'Far NW Highland Forest' },
];

// ========== ROCK FORMATIONS ==========
interface RockZone {
  cx: number;
  cz: number;
  radius: number;
  density: number;
  type: 'field' | 'outcrop' | 'scattered' | 'boulders';
  name: string;
}

const ROCK_ZONES: RockZone[] = [
  // === CENTRAL WORLD (original) ===
  { cx: 180, cz: 230, radius: 50, density: 1.5, type: 'outcrop', name: 'Frostmere Crags' },
  { cx: 220, cz: 260, radius: 40, density: 1.2, type: 'field', name: 'Highland Stones' },
  { cx: 130, cz: 245, radius: 30, density: 0.9, type: 'scattered', name: 'Mountain Pass Rocks' },
  { cx: 210, cz: -175, radius: 40, density: 1.2, type: 'field', name: 'Fort Approach Stones' },
  { cx: 250, cz: -130, radius: 35, density: 1.0, type: 'outcrop', name: 'Eastern Frontier Rocks' },
  { cx: 265, cz: -230, radius: 40, density: 0.8, type: 'scattered', name: 'Badlands Boulders' },
  { cx: 220, cz: 115, radius: 40, density: 1.3, type: 'outcrop', name: 'Veyra Rubble' },
  { cx: 255, cz: 30, radius: 35, density: 1.0, type: 'field', name: 'Ancient Stones' },
  { cx: 205, cz: 158, radius: 28, density: 0.7, type: 'scattered', name: 'Veyra Path Rocks' },
  { cx: 30, cz: -225, radius: 35, density: 1.1, type: 'field', name: 'Ravenwatch Rocks' },
  { cx: 60, cz: -250, radius: 35, density: 0.8, type: 'outcrop', name: 'Southern Crags' },
  { cx: -50, cz: -245, radius: 30, density: 0.7, type: 'scattered', name: 'Bandit Stones' },
  { cx: 50, cz: 50, radius: 18, density: 0.4, type: 'scattered', name: 'Heartland Stones' },
  { cx: -40, cz: -110, radius: 22, density: 0.4, type: 'scattered', name: 'Road Boulders' },
  { cx: -270, cz: 260, radius: 40, density: 0.7, type: 'boulders', name: 'NW Corner Rocks' },
  { cx: 270, cz: 270, radius: 40, density: 0.8, type: 'outcrop', name: 'NE Mountain Edge' },
  { cx: -270, cz: -260, radius: 38, density: 0.6, type: 'scattered', name: 'SW Wilderness Stones' },
  { cx: 270, cz: -270, radius: 38, density: 0.5, type: 'boulders', name: 'SE Border Rocks' },
  { cx: 130, cz: 50, radius: 22, density: 0.5, type: 'scattered', name: 'Eastern Road Rocks' },
  { cx: 160, cz: 15, radius: 20, density: 0.6, type: 'field', name: 'Veyra Approach Stones' },
  { cx: -20, cz: -150, radius: 25, density: 0.6, type: 'scattered', name: 'Southern Heartland Rocks' },
  { cx: 40, cz: -180, radius: 22, density: 0.5, type: 'field', name: 'Ravenwatch Road Rocks' },
  { cx: -200, cz: -50, radius: 25, density: 0.5, type: 'scattered', name: 'Western Wilderness Rocks' },
  { cx: 30, cz: 145, radius: 20, density: 0.4, type: 'scattered', name: 'Northern Meadow Stones' },
  { cx: -70, cz: -160, radius: 22, density: 0.5, type: 'field', name: 'Greenmeadow-Ravenwatch Rocks' },
  { cx: 120, cz: -60, radius: 18, density: 0.4, type: 'scattered', name: 'Blackthorn Approach Rocks' },

  // === EXPANDED WORLD ROCKS ===
  // Thornwall — rugged frontier stone
  { cx: -480, cz: -480, radius: 45, density: 1.0, type: 'outcrop', name: 'Thornwall Crags' },
  { cx: -530, cz: -420, radius: 35, density: 0.8, type: 'field', name: 'Frontier Stones' },
  // Stonepeak — very rocky mountain terrain
  { cx: -420, cz: 520, radius: 55, density: 1.8, type: 'outcrop', name: 'Stonepeak Crags' },
  { cx: -380, cz: 480, radius: 40, density: 1.3, type: 'boulders', name: 'Mountain Boulders' },
  { cx: -340, cz: 540, radius: 35, density: 1.0, type: 'field', name: 'Peak Road Stones' },
  // Darkhollow — wasteland rubble
  { cx: 580, cz: -420, radius: 45, density: 1.2, type: 'field', name: 'Darkhollow Rubble' },
  { cx: 520, cz: -380, radius: 40, density: 0.9, type: 'scattered', name: 'Wasteland Stones' },
  // Rivermoor — river stones
  { cx: 470, cz: 300, radius: 30, density: 0.6, type: 'scattered', name: 'River Stones' },
  // Goldenvale — decorative stones
  { cx: -580, cz: 120, radius: 30, density: 0.5, type: 'scattered', name: 'Vale Stones' },
  // Travel corridors
  { cx: -380, cz: -300, radius: 35, density: 0.7, type: 'scattered', name: 'March Road Rocks' },
  { cx: 380, cz: -280, radius: 35, density: 0.8, type: 'field', name: 'Eastern Corridor Rocks' },
  { cx: -280, cz: 380, radius: 30, density: 0.6, type: 'scattered', name: 'NW Corridor Rocks' },
  { cx: 280, cz: 300, radius: 30, density: 0.5, type: 'scattered', name: 'NE Corridor Rocks' },
  // World edges
  { cx: -650, cz: -50, radius: 40, density: 0.4, type: 'scattered', name: 'Far West Rocks' },
  { cx: 650, cz: -50, radius: 40, density: 0.4, type: 'scattered', name: 'Far East Rocks' },
];

function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function isNearSettlement(x: number, z: number, minDist: number): boolean {
  for (const s of SETTLEMENTS) {
    // Size-aware exclusion: large kingdoms have walls at ±45, need 70+ buffer
    // Medium settlements need ~40, small ~25
    const sizeBuffer = s.size === 'large' ? 70 : s.size === 'medium' ? 40 : 25;
    const effectiveDist = Math.max(minDist, sizeBuffer);
    const d = Math.sqrt((x - s.position[0]) ** 2 + (z - s.position[1]) ** 2);
    if (d < effectiveDist) return true;
  }
  return false;
}

function isNearRoad(x: number, z: number, minDist: number): boolean {
  for (const road of ROADS) {
    const dx = road.to[0] - road.from[0];
    const dz = road.to[1] - road.from[1];
    const len2 = dx * dx + dz * dz;
    if (len2 < 1) continue;
    const t = Math.max(0, Math.min(1, ((x - road.from[0]) * dx + (z - road.from[1]) * dz) / len2));
    const px = road.from[0] + t * dx;
    const pz = road.from[1] + t * dz;
    const dist = Math.sqrt((x - px) ** 2 + (z - pz) ** 2);
    if (dist < minDist + road.width) return true;
  }
  return false;
}

function isNearPOI(x: number, z: number, minDist: number): boolean {
  for (const poi of SMALL_POIS) {
    const d = Math.sqrt((x - poi.position[0]) ** 2 + (z - poi.position[1]) ** 2);
    if (d < minDist) return true;
  }
  return false;
}

function isInWater(x: number, z: number): boolean {
  for (const lake of LAKES) {
    const cos = Math.cos(-lake.rotation);
    const sin = Math.sin(-lake.rotation);
    const lx = cos * (x - lake.position[0]) + sin * (z - lake.position[2]);
    const lz = -sin * (x - lake.position[0]) + cos * (z - lake.position[2]);
    const nx = lx / (lake.radiusX + 4);
    const nz = lz / (lake.radiusZ + 4);
    if (nx * nx + nz * nz <= 1) return true;
  }
  for (const river of RIVERS) {
    const pts = river.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0], az = pts[i][2];
      const bx = pts[i + 1][0], bz = pts[i + 1][2];
      const dx = bx - ax, dz = bz - az;
      const len2 = dx * dx + dz * dz;
      if (len2 < 1) continue;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
      const px = ax + t * dx, pz = az + t * dz;
      const dist = Math.sqrt((x - px) ** 2 + (z - pz) ** 2);
      if (dist < river.width / 2 + 4) return true;
    }
  }
  return false;
}

function isOnBridge(x: number, z: number): boolean {
  for (const bridge of BRIDGES) {
    const cos = Math.cos(-bridge.rotation);
    const sin = Math.sin(-bridge.rotation);
    const lx = cos * (x - bridge.position[0]) + sin * (z - bridge.position[2]);
    const lz = -sin * (x - bridge.position[0]) + cos * (z - bridge.position[2]);
    if (Math.abs(lx) <= bridge.width / 2 + 4 && Math.abs(lz) <= bridge.length / 2 + 5) {
      return true;
    }
  }
  return false;
}

function isNearWildernessBuilding(x: number, z: number, minDist: number): boolean {
  for (const c of WILDERNESS_CLUSTER_CENTERS) {
    const d = Math.sqrt((x - c.x) ** 2 + (z - c.z) ** 2);
    if (d < c.radius + minDist) return true;
  }
  return false;
}

// Check if position is in a region that should be mostly barren
function getRegionScatterSuppress(x: number, z: number): number {
  // Darkhollow — desolate wasteland, suppress random scatter
  const darkDist = Math.sqrt((x - 550) ** 2 + (z + 400) ** 2);
  if (darkDist < 120) return 0.5;
  // Stonepeak high altitude — suppress scatter above snowline
  const stoneDist = Math.sqrt((x + 400) ** 2 + (z - 500) ** 2);
  if (stoneDist < 100) return 0.6;
  return 1.0;
}

function getForestDensityAt(x: number, z: number): { density: number; type: ForestZone['type'] } {
  let best = { density: 0, type: 'scattered' as ForestZone['type'] };
  for (const zone of FOREST_ZONES) {
    const d = Math.sqrt((x - zone.cx) ** 2 + (z - zone.cz) ** 2);
    if (d < zone.radius) {
      const factor = 1 - (d / zone.radius) ** 0.7;
      const effectiveDensity = zone.density * factor;
      if (effectiveDensity > best.density) {
        best = { density: effectiveDensity, type: zone.type };
      }
    }
  }
  return best;
}

function getRockDensityAt(x: number, z: number): { density: number; type: RockZone['type'] } {
  let best = { density: 0, type: 'scattered' as RockZone['type'] };
  for (const zone of ROCK_ZONES) {
    const d = Math.sqrt((x - zone.cx) ** 2 + (z - zone.cz) ** 2);
    if (d < zone.radius) {
      const factor = 1 - (d / zone.radius) ** 0.8;
      const effectiveDensity = zone.density * factor;
      if (effectiveDensity > best.density) {
        best = { density: effectiveDensity, type: zone.type };
      }
    }
  }
  return best;
}

export function generateWorldResources(): WorldResource[] {
  const resources: WorldResource[] = [];
  const rand = seededRandom(12345);
  const half = WORLD_SIZE / 2;

  // ========== TREES ==========
  // 5x density via 40k attempts + ~160 forest zones across 1800x1800 world
  const treeAttempts = 40000;
  for (let i = 0; i < treeAttempts; i++) {
    const x = (rand() - 0.5) * WORLD_SIZE * 0.97;
    const z = (rand() - 0.5) * WORLD_SIZE * 0.97;
    const y = getTerrainHeight(x, z);
    
    // Skip water
    if (y < -0.3) continue;
    
    // Skip above snowline — trees don't grow on mountaintops
    if (y > 16) continue;
    
    // Skip too close to center (capital area)
    const distCenter = Math.sqrt(x * x + z * z);
    if (distCenter < 50) continue;
    
    // Skip near settlements (size-aware exclusion)
    if (isNearSettlement(x, z, 60)) continue;
    
    // Skip on roads
    if (isNearRoad(x, z, 6)) continue;
    
    // Skip near POIs
    if (isNearPOI(x, z, 7)) continue;
    
    // Skip in water bodies and on bridges
    if (isInWater(x, z)) continue;
    if (isOnBridge(x, z)) continue;
    
    // Skip near wilderness buildings (cottages, camps, etc.)
    if (isNearWildernessBuilding(x, z, 4)) continue;
    
    // Get local forest density
    const forest = getForestDensityAt(x, z);
    
    // Base spawn chance depends on density
    let spawnChance = forest.density * 0.35;
    
    // Minimum scatter in wilderness — suppressed in barren regions
    if (distCenter > 60 && forest.density < 0.1) {
      const suppress = getRegionScatterSuppress(x, z);
      spawnChance = Math.max(spawnChance, 0.03 * suppress);
    }
    
    if (rand() > spawnChance) continue;
    
    // Variant based on forest type
    let variant = rand() > 0.5 ? 0 : 1;
    let scale = 0.7 + rand() * 0.6;
    
    if (forest.type === 'dense') {
      scale = 0.9 + rand() * 0.8;
      variant = rand() > 0.3 ? 1 : 0;
    } else if (forest.type === 'light') {
      scale = 0.8 + rand() * 0.5;
    } else if (forest.type === 'grove') {
      scale = 0.6 + rand() * 0.4;
      variant = 0;
    }
    
    // Scale down trees at high altitude (stunted mountain trees)
    if (y > 10) {
      scale *= Math.max(0.5, 1 - (y - 10) / 12);
    }
    
    const trunkHeight = 2 + rand() * 2.5;
    const crownRadius = 1.2 + rand() * 1.8;
    const gatherable = rand() > 0.25;

    resources.push({
      id: `tree-${i}`, type: 'tree',
      position: [x, y, z], health: 3, maxHealth: 3,
      depleted: false, scale, variant, gatherable, trunkHeight, crownRadius,
    });
  }
  // ========== ROCKS ==========
  const rockAttempts = 3000; // Increased for expanded world
  for (let i = 0; i < rockAttempts; i++) {
    const x = (rand() - 0.5) * WORLD_SIZE * 0.94;
    const z = (rand() - 0.5) * WORLD_SIZE * 0.94;
    const y = getTerrainHeight(x, z);
    
    if (y < -0.5) continue;
    if (isNearSettlement(x, z, 55)) continue;
    if (isNearRoad(x, z, 4)) continue;
    if (isNearPOI(x, z, 5)) continue;
    
    const rock = getRockDensityAt(x, z);
    
    // Base spawn chance
    let spawnChance = rock.density * 0.3;
    
    // Higher terrain = more rocks
    if (y > 5) spawnChance += 0.1;
    if (y > 10) spawnChance += 0.15;
    
    // Minimum scatter
    spawnChance = Math.max(spawnChance, 0.03);
    
    if (rand() > spawnChance) continue;
    
    // Scale based on zone type
    let scale = 0.3 + rand() * 1.2;
    if (rock.type === 'outcrop') {
      scale = 0.8 + rand() * 2.0;
    } else if (rock.type === 'boulders') {
      scale = 1.2 + rand() * 1.5;
    } else if (rock.type === 'field') {
      scale = 0.4 + rand() * 1.0;
    }
    
    const gatherable = scale > 0.5 && rand() > 0.35;

    resources.push({
      id: `rock-${i}`, type: 'rock',
      position: [x, y + scale * 0.25, z], health: 3, maxHealth: 3,
      depleted: false, scale, variant: Math.floor(rand() * 3),
      gatherable, trunkHeight: 0, crownRadius: 0,
    });
  }

  // ========== BERRY BUSHES ==========
  // Near villages, forest edges, and groves
  const berrySpots = [
    // Near villages (NOT inside walled settlements)
    { cx: -155, cz: -125, count: 8, spread: 35 },
    { cx: -110, cz: -80, count: 5, spread: 25 },
    // Forest edges
    { cx: -160, cz: 120, count: 6, spread: 30 },
    { cx: -140, cz: 90, count: 4, spread: 20 },
    { cx: -100, cz: 60, count: 3, spread: 25 },
    // Scattered wilderness
    { cx: -80, cz: -50, count: 3, spread: 20 },
    { cx: 50, cz: -80, count: 2, spread: 20 },
    { cx: 80, cz: 120, count: 3, spread: 25 },
    { cx: -200, cz: -60, count: 4, spread: 30 },
    { cx: 100, cz: 200, count: 3, spread: 25 },
    // Trail food
    { cx: -40, cz: 0, count: 2, spread: 15 },
    { cx: 30, cz: -120, count: 2, spread: 15 },
  ];
  
  let berryId = 0;
  for (const spot of berrySpots) {
    for (let i = 0; i < spot.count; i++) {
      const angle = rand() * Math.PI * 2;
      const r = 5 + rand() * spot.spread;
      const x = spot.cx + Math.cos(angle) * r;
      const z = spot.cz + Math.sin(angle) * r;
      const y = getTerrainHeight(x, z);
      if (y < -0.2) continue;
      if (isNearSettlement(x, z, 25)) continue;
      if (isNearRoad(x, z, 2)) continue;
      
      resources.push({
        id: `berry-${berryId++}`, type: 'berry_bush',
        position: [x, y, z], health: 2, maxHealth: 2,
        depleted: false, scale: 0.5 + rand() * 0.35, variant: 0,
        gatherable: true, trunkHeight: 0, crownRadius: 0.8,
      });
    }
  }

  // ========== LOOTABLE CRATES ==========
  // Near camps, ruins, forts, and along trade routes
  const crateSpots = [
    // Near POIs
    { cx: 5, cz: -205, count: 5, spread: 15 },
    { cx: 195, cz: 95, count: 6, spread: 22 },
    { cx: 185, cz: -155, count: 5, spread: 18 },
    { cx: 160, cz: 50, count: 3, spread: 12 },
    { cx: 155, cz: 195, count: 3, spread: 15 },
    // Supply depots and camps
    { cx: 60, cz: -50, count: 3, spread: 8 },
    { cx: 130, cz: -110, count: 2, spread: 10 },
    // Roadside finds
    { cx: -70, cz: -55, count: 2, spread: 10 },
    { cx: 90, cz: -75, count: 2, spread: 8 },
    { cx: -90, cz: 65, count: 2, spread: 10 },
    { cx: 100, cz: 45, count: 2, spread: 10 },
    // Scattered wilderness
    { cx: -180, cz: 135, count: 2, spread: 15 },
    { cx: 0, cz: 0, count: 2, spread: 40 },
  ];
  
  let crateId = 0;
  for (const spot of crateSpots) {
    for (let i = 0; i < spot.count; i++) {
      const angle = rand() * Math.PI * 2;
      const r = 2 + rand() * spot.spread;
      const x = spot.cx + Math.cos(angle) * r;
      const z = spot.cz + Math.sin(angle) * r;
      const y = getTerrainHeight(x, z);
      if (y < -0.3) continue;
      if (isNearSettlement(x, z, 20)) continue;
      
      resources.push({
        id: `crate-${crateId++}`, type: 'crate',
        position: [x, y, z], health: 2, maxHealth: 2,
        depleted: false, scale: 0.45 + rand() * 0.35, variant: 0,
        gatherable: true, trunkHeight: 0, crownRadius: 0,
      });
    }
  }

  return resources;
}

export function generateLootDrop(pos: [number, number, number], enemyType: string): LootPickup[] {
  const drops: LootPickup[] = [];
  const id = `loot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  if (enemyType === 'bandit') {
    drops.push({ id: id + '-w', type: 'wood', position: [...pos], amount: 2, collected: false });
    if (Math.random() > 0.5) {
      drops.push({ id: id + '-s', type: 'stone', position: [pos[0] + 0.3, pos[1], pos[2] + 0.3], amount: 1, collected: false });
    }
    if (Math.random() > 0.7) {
      drops.push({ id: id + '-f', type: 'food', position: [pos[0] - 0.3, pos[1], pos[2] - 0.3], amount: 1, collected: false });
    }
  } else if (enemyType === 'wolf') {
    drops.push({ id: id + '-f', type: 'food', position: [...pos], amount: 2, collected: false });
  }

  return drops;
}

export const INTERACTION_RANGE = 4;
export const GATHER_COOLDOWN = 0.5;
export const TREE_WOOD_REWARD = 2;
export const ROCK_STONE_REWARD = 2;
export const BERRY_FOOD_REWARD = 2;
export const CRATE_REWARDS = { wood: 3, stone: 2, food: 1 };
