/**
 * World Region & Settlement Data
 * Central data source for the entire open world.
 * All positions, gameplay metadata, and POI definitions.
 */

export interface RegionDef {
  id: string;
  name: string;
  center: [number, number]; // [x, z]
  radius: number;
  danger: number; // 0-3
  tempMod: number;
  resourceBonus: number;
  resourceFocus: 'wood' | 'stone' | 'food' | 'mixed';
  description: string;
  color: string; // map color
  enemyTypes: ('bandit' | 'wolf')[];
  enemyCount: number;
  enemySpread: number;
}

export interface SettlementDef {
  id: string;
  name: string;
  regionId: string;
  position: [number, number]; // [x, z]
  type: 'capital' | 'village' | 'fort' | 'ruins' | 'bandit_camp' | 'outpost' | 'monastery'
    | 'fortified_city' | 'river_town' | 'mountain_hold' | 'frontier_camp' | 'trade_city';
  size: 'large' | 'medium' | 'small';
  description: string;
}

export interface SmallPOIDef {
  id: string;
  name: string;
  position: [number, number];
  type: 'shrine' | 'wagon' | 'bridge' | 'graveyard' | 'hunter_camp' | 'ruined_house'
    | 'watchtower' | 'cave' | 'watchpost' | 'inn' | 'clearing' | 'stone_circle'
    | 'pond' | 'burned_village' | 'supply_depot' | 'crossroads'
    | 'milestone' | 'lantern_post' | 'roadside_cross' | 'abandoned_camp' | 'gallows';
}

export interface RoadSegment {
  from: [number, number];
  to: [number, number];
  width: number; // road width factor
}

// ========== REGIONS ==========
export const REGIONS: RegionDef[] = [
  {
    id: 'heartland', name: 'Kingdom Heartland',
    center: [0, 0], radius: 80,
    danger: 0, tempMod: 0.1, resourceBonus: 1.0, resourceFocus: 'mixed',
    description: 'The safe civilized center of the realm',
    color: '#6a8a4a', enemyTypes: [], enemyCount: 0, enemySpread: 0,
  },
  {
    id: 'greenmeadow', name: 'Greenmeadow Fields',
    center: [-160, -130], radius: 70,
    danger: 0, tempMod: 0.15, resourceBonus: 1.2, resourceFocus: 'food',
    description: 'Peaceful farmland with abundant food',
    color: '#7a9a5a', enemyTypes: ['wolf'], enemyCount: 2, enemySpread: 30,
  },
  {
    id: 'blackthorn', name: 'Blackthorn Frontier',
    center: [190, -160], radius: 60,
    danger: 2, tempMod: -0.1, resourceBonus: 1.3, resourceFocus: 'stone',
    description: 'Military frontier between safe and hostile lands',
    color: '#7a6a4a', enemyTypes: ['bandit'], enemyCount: 5, enemySpread: 25,
  },
  {
    id: 'old_veyra', name: 'Old Veyra',
    center: [200, 100], radius: 70,
    danger: 3, tempMod: -0.4, resourceBonus: 2.0, resourceFocus: 'stone',
    description: 'Ancient fallen civilization, high risk high reward',
    color: '#6a5a4a', enemyTypes: ['bandit', 'wolf'], enemyCount: 6, enemySpread: 30,
  },
  {
    id: 'ravenwatch', name: 'Ravenwatch Badlands',
    center: [10, -210], radius: 60,
    danger: 2, tempMod: 0, resourceBonus: 1.5, resourceFocus: 'mixed',
    description: 'Lawless bandit territory',
    color: '#5a4a3a', enemyTypes: ['bandit'], enemyCount: 7, enemySpread: 25,
  },
  {
    id: 'ashwood', name: 'Ashwood Deep',
    center: [-190, 140], radius: 75,
    danger: 2, tempMod: -0.25, resourceBonus: 1.5, resourceFocus: 'wood',
    description: 'Dense dangerous forest, rich in timber',
    color: '#2a4a1a', enemyTypes: ['wolf'], enemyCount: 6, enemySpread: 35,
  },
  {
    id: 'frostmere', name: 'Frostmere Heights',
    center: [160, 200], radius: 65,
    danger: 1, tempMod: -0.5, resourceBonus: 1.4, resourceFocus: 'stone',
    description: 'Cold highlands with vistas and rare stone',
    color: '#8a8a9a', enemyTypes: ['wolf', 'bandit'], enemyCount: 4, enemySpread: 30,
  },
  // === EXPANDED REGIONS (3x world) ===
  {
    id: 'thornwall', name: 'Thornwall Reaches',
    center: [-500, -450], radius: 90,
    danger: 2, tempMod: -0.2, resourceBonus: 1.5, resourceFocus: 'stone',
    description: 'Fortified stone frontier stronghold',
    color: '#5a5a6a', enemyTypes: ['bandit'], enemyCount: 6, enemySpread: 40,
  },
  {
    id: 'rivermoor', name: 'Rivermoor Wetlands',
    center: [450, 350], radius: 85,
    danger: 1, tempMod: 0.1, resourceBonus: 1.3, resourceFocus: 'food',
    description: 'Lush riverside kingdom with docks and canals',
    color: '#3a6a4a', enemyTypes: ['wolf'], enemyCount: 4, enemySpread: 35,
  },
  {
    id: 'stonepeak', name: 'Stonepeak Highlands',
    center: [-400, 500], radius: 80,
    danger: 2, tempMod: -0.6, resourceBonus: 1.6, resourceFocus: 'stone',
    description: 'Mountain kingdom carved into the highlands',
    color: '#7a7a8a', enemyTypes: ['wolf', 'bandit'], enemyCount: 5, enemySpread: 35,
  },
  {
    id: 'darkhollow', name: 'Darkhollow Wastes',
    center: [550, -400], radius: 80,
    danger: 3, tempMod: -0.3, resourceBonus: 1.8, resourceFocus: 'mixed',
    description: 'Desolate frontier of ruins and survivors',
    color: '#4a3a2a', enemyTypes: ['bandit', 'wolf'], enemyCount: 8, enemySpread: 35,
  },
  {
    id: 'goldenvale', name: 'Goldenvale Plains',
    center: [-550, 100], radius: 90,
    danger: 1, tempMod: 0.15, resourceBonus: 1.4, resourceFocus: 'food',
    description: 'Prosperous trade kingdom of merchants',
    color: '#8a9a4a', enemyTypes: ['bandit'], enemyCount: 3, enemySpread: 40,
  },
  // Transition regions
  {
    id: 'western_marches', name: 'Western Marches',
    center: [-350, -200], radius: 70,
    danger: 1, tempMod: 0, resourceBonus: 1.1, resourceFocus: 'mixed',
    description: 'Rolling hills between heartland and frontier',
    color: '#6a7a4a', enemyTypes: ['wolf'], enemyCount: 3, enemySpread: 30,
  },
  {
    id: 'eastern_wilds', name: 'Eastern Wilds',
    center: [400, -100], radius: 70,
    danger: 2, tempMod: -0.1, resourceBonus: 1.2, resourceFocus: 'wood',
    description: 'Wild borderlands between kingdoms',
    color: '#4a5a3a', enemyTypes: ['wolf', 'bandit'], enemyCount: 4, enemySpread: 30,
  },
  {
    id: 'northern_reach', name: 'Northern Reach',
    center: [0, 500], radius: 80,
    danger: 1, tempMod: -0.4, resourceBonus: 1.3, resourceFocus: 'stone',
    description: 'Cold northern wilderness',
    color: '#6a6a7a', enemyTypes: ['wolf'], enemyCount: 4, enemySpread: 40,
  },
];

// ========== SETTLEMENTS ==========
export const SETTLEMENTS: SettlementDef[] = [
  // Capital
  {
    id: 'ironhold', name: 'Ironhold', regionId: 'heartland',
    position: [0, 0], type: 'capital', size: 'large',
    description: 'The fortified capital of the realm',
  },
  // Farming village
  {
    id: 'greenmeadow_village', name: 'Greenmeadow', regionId: 'greenmeadow',
    position: [-155, -125], type: 'village', size: 'medium',
    description: 'A peaceful farming settlement',
  },
  // Military fort
  {
    id: 'blackthorn_fort', name: 'Blackthorn Fort', regionId: 'blackthorn',
    position: [185, -155], type: 'fort', size: 'medium',
    description: 'Frontier military outpost',
  },
  // Ruined city
  {
    id: 'old_veyra_ruins', name: 'Old Veyra', regionId: 'old_veyra',
    position: [195, 95], type: 'ruins', size: 'large',
    description: 'Once-great city now in ruins',
  },
  // Bandit camp
  {
    id: 'ravenwatch_camp', name: 'Ravenwatch', regionId: 'ravenwatch',
    position: [5, -205], type: 'bandit_camp', size: 'medium',
    description: 'Lawless outlaw settlement',
  },
  // Forest outpost
  {
    id: 'ashwood_shrine', name: "Saint's Crossing", regionId: 'ashwood',
    position: [-185, 135], type: 'outpost', size: 'small',
    description: 'A small forest waystation',
  },
  // Mountain monastery
  {
    id: 'frostmere_monastery', name: 'Frostmere Keep', regionId: 'frostmere',
    position: [155, 195], type: 'monastery', size: 'small',
    description: 'Highland stone monastery',
  },
  // Extra small settlements
  {
    id: 'ashen_hollow', name: 'Ashen Hollow', regionId: 'old_veyra',
    position: [160, 50], type: 'outpost', size: 'small',
    description: 'A scavenger camp near the ruins',
  },
  {
    id: 'millbrook', name: 'Millbrook', regionId: 'greenmeadow',
    position: [-110, -80], type: 'village', size: 'small',
    description: 'Small hamlet with a grain mill',
  },
  // === 5 NEW KINGDOMS ===
  {
    id: 'thornwall_city', name: 'Thornwall', regionId: 'thornwall',
    position: [-500, -450], type: 'fortified_city', size: 'large',
    description: 'Fortified stone city on the frontier',
  },
  {
    id: 'rivermoor_city', name: 'Rivermoor', regionId: 'rivermoor',
    position: [450, 350], type: 'river_town', size: 'large',
    description: 'River kingdom with docks and bridges',
  },
  {
    id: 'stonepeak_hold', name: 'Stonepeak', regionId: 'stonepeak',
    position: [-400, 500], type: 'mountain_hold', size: 'large',
    description: 'Mountain fortress carved into the highlands',
  },
  {
    id: 'darkhollow_camp', name: 'Darkhollow', regionId: 'darkhollow',
    position: [550, -400], type: 'frontier_camp', size: 'large',
    description: 'Ruined-but-inhabited frontier settlement',
  },
  {
    id: 'goldenvale_city', name: 'Goldenvale', regionId: 'goldenvale',
    position: [-550, 100], type: 'trade_city', size: 'large',
    description: 'Prosperous trading city',
  },
  // Supporting settlements near new kingdoms
  {
    id: 'thornwall_outpost', name: 'Thornwatch', regionId: 'thornwall',
    position: [-440, -400], type: 'outpost', size: 'small',
    description: 'Border watch near Thornwall',
  },
  {
    id: 'rivermoor_village', name: 'Reed Village', regionId: 'rivermoor',
    position: [400, 300], type: 'village', size: 'small',
    description: 'Fishing village near Rivermoor',
  },
  {
    id: 'stonepeak_outpost', name: 'High Watch', regionId: 'stonepeak',
    position: [-350, 450], type: 'outpost', size: 'small',
    description: 'Mountain lookout post',
  },
  {
    id: 'darkhollow_ruins', name: 'Ashkeep', regionId: 'darkhollow',
    position: [500, -350], type: 'ruins', size: 'medium',
    description: 'Ancient fortress ruins repurposed by scavengers',
  },
  {
    id: 'goldenvale_village', name: 'Harvest Hill', regionId: 'goldenvale',
    position: [-500, 150], type: 'village', size: 'small',
    description: 'Farming hamlet supplying Goldenvale',
  },
];

// ========== ROAD NETWORK ==========
export const ROADS: RoadSegment[] = [
  // ===== EXISTING CENTRAL ROADS =====
  // Main roads from Ironhold
  { from: [0, 38], to: [0, 55], width: 4.0 },             // Capital gate approach
  { from: [0, 55], to: [-155, -125], width: 3.5 },         // Ironhold → Greenmeadow
  { from: [0, 55], to: [185, -135], width: 3.0 },          // Ironhold → Blackthorn (via south gate)
  { from: [185, -135], to: [185, -155], width: 3.0 },      // approach fort gate
  { from: [0, 55], to: [5, -205], width: 2.5 },            // Ironhold → Ravenwatch
  { from: [0, 55], to: [-185, 135], width: 2.5 },          // Ironhold → Ashwood
  { from: [0, 55], to: [195, 95], width: 2.5 },            // Ironhold → Old Veyra
  // Secondary roads
  { from: [185, -155], to: [195, 95], width: 2.0 },        // Blackthorn → Old Veyra
  { from: [195, 95], to: [155, 209], width: 2.0 },         // Old Veyra → Frostmere
  { from: [-155, -125], to: [-110, -80], width: 2.0 },     // Greenmeadow → Millbrook
  { from: [-110, -80], to: [0, 55], width: 2.0 },          // Millbrook → Ironhold
  { from: [5, -205], to: [185, -155], width: 1.8 },        // Ravenwatch → Blackthorn
  { from: [-185, 135], to: [155, 195], width: 1.5 },       // Ashwood → Frostmere (mountain trail)
  { from: [160, 50], to: [195, 95], width: 1.5 },          // Ashen Hollow → Old Veyra
  // Ring road segments
  { from: [-155, -125], to: [5, -205], width: 1.5 },       // Greenmeadow → Ravenwatch
  { from: [-185, 135], to: [-155, -125], width: 1.5 },     // Ashwood → Greenmeadow (long trail)

  // ===== NEW KINGDOM CONNECTOR ROADS =====
  // Ironhold → Thornwall (SW main road, via Western Marches)
  { from: [-155, -125], to: [-280, -240], width: 3.0 },    // Greenmeadow → Western Marches waypoint
  { from: [-280, -240], to: [-440, -400], width: 2.5 },    // Waypoint → Thornwatch outpost
  { from: [-440, -400], to: [-500, -450], width: 3.0 },    // Thornwatch → Thornwall

  // Ironhold → Goldenvale (W main road)
  { from: [-185, 135], to: [-320, 120], width: 2.5 },      // Ashwood → midpoint
  { from: [-320, 120], to: [-500, 150], width: 2.5 },      // midpoint → Harvest Hill
  { from: [-500, 150], to: [-550, 100], width: 3.0 },      // Harvest Hill → Goldenvale

  // Ironhold → Rivermoor (NE main road, via Frostmere)
  { from: [155, 195], to: [280, 260], width: 2.5 },        // Frostmere → midpoint
  { from: [280, 260], to: [400, 300], width: 2.5 },        // midpoint → Reed Village
  { from: [400, 300], to: [450, 350], width: 3.0 },        // Reed Village → Rivermoor

  // Ironhold → Darkhollow (SE main road, via Blackthorn)
  { from: [185, -155], to: [340, -260], width: 2.5 },      // Blackthorn → midpoint
  { from: [340, -260], to: [500, -350], width: 2.5 },      // midpoint → Ashkeep
  { from: [500, -350], to: [550, -400], width: 3.0 },      // Ashkeep → Darkhollow

  // Ironhold → Stonepeak (NW main road, via Ashwood) — Codex audit re-route:
  // the original diagonal crossed river-great at a 12° angle (would need a
  // ~76u bridge) and the first switchback attempt then plowed straight
  // through Lake Tarn. This routing crosses the river PERPENDICULAR at
  // (-220, 230) (bridge-stonepeak-river) and hooks NE around Lake Tarn before
  // turning west onto the Stonepeak gate, keeping every leg under ~10% grade.
  { from: [-185, 135], to: [-220, 200], width: 2.5 },      // Ashwood → river approach
  { from: [-220, 200], to: [-220, 285], width: 2.5 },      // North leg, BRIDGE over River Great
  { from: [-220, 285], to: [-300, 380], width: 2.5 },      // NW climb past river
  { from: [-300, 380], to: [-340, 460], width: 2.5 },      // mountain ascent
  { from: [-340, 460], to: [-360, 510], width: 2.5 },      // around Lake Tarn east-north
  { from: [-360, 510], to: [-400, 500], width: 3.0 },      // final approach to Stonepeak gate

  // ===== INTER-KINGDOM SECONDARY ROADS =====
  // Thornwall → Goldenvale (southern connector)
  { from: [-500, -450], to: [-550, -200], width: 2.0 },    // Thornwall → waypoint
  { from: [-550, -200], to: [-550, 100], width: 2.0 },     // waypoint → Goldenvale

  // Goldenvale → Stonepeak (western connector)
  { from: [-550, 100], to: [-480, 300], width: 2.0 },      // Goldenvale → waypoint
  { from: [-480, 300], to: [-400, 500], width: 2.0 },      // waypoint → Stonepeak

  // Rivermoor → Darkhollow (eastern connector)
  { from: [450, 350], to: [520, 100], width: 2.0 },        // Rivermoor → waypoint
  { from: [520, 100], to: [550, -400], width: 2.0 },       // waypoint → Darkhollow

  // Stonepeak → Rivermoor (northern connector)
  { from: [-400, 500], to: [0, 550], width: 2.0 },         // Stonepeak → north waypoint
  { from: [0, 550], to: [450, 350], width: 2.0 },          // north waypoint → Rivermoor
];

// ========== SMALL POIS ==========
export const SMALL_POIS: SmallPOIDef[] = [
  // === IRONHOLD TO GREENMEADOW CORRIDOR ===
  { id: 'sp1', name: 'Crossroads Well', position: [-70, -55], type: 'crossroads' },
  { id: 'sp2', name: 'Broken Wagon', position: [-118, -96], type: 'wagon' },
  { id: 'sp3', name: 'Wayside Shrine', position: [-40, -30], type: 'shrine' },
  { id: 'sp21', name: 'First Milestone', position: [-25, -15], type: 'milestone' },
  { id: 'sp22', name: 'Second Milestone', position: [-80, -60], type: 'milestone' },
  { id: 'sp28', name: 'Road Lantern', position: [-35, -45], type: 'lantern_post' },
  { id: 'sp16', name: 'Roadside Inn', position: [-128, -118], type: 'inn' },
  { id: 'sp40', name: 'Farm Shrine', position: [-120, -100], type: 'shrine' },
  { id: 'sp41', name: 'Third Milestone', position: [-140, -110], type: 'milestone' },
  
  // === IRONHOLD TO BLACKTHORN CORRIDOR ===
  { id: 'sp5', name: 'Hunter Camp', position: [152, -96], type: 'hunter_camp' },
  { id: 'sp6', name: 'Supply Depot', position: [82, -55], type: 'supply_depot' },
  { id: 'sp25', name: 'Frontier Cross', position: [140, -120], type: 'roadside_cross' },
  { id: 'sp29', name: 'Road Lantern', position: [45, -40], type: 'lantern_post' },
  { id: 'sp30', name: 'Blackthorn Milestone', position: [50, -90], type: 'milestone' },
  { id: 'sp43', name: 'Garrison Post', position: [100, -95], type: 'watchpost' },
  { id: 'sp44', name: 'Frontier Wagon', position: [160, -135], type: 'wagon' },
  { id: 'sp45', name: 'Border Shrine', position: [175, -145], type: 'shrine' },
  
  // === IRONHOLD TO RAVENWATCH CORRIDOR ===
  { id: 'sp7', name: 'Old Graveyard', position: [5, -100], type: 'graveyard' },
  { id: 'sp8', name: 'Ruined Farmhouse', position: [-15, -140], type: 'ruined_house' },
  { id: 'sp19', name: 'Hidden Shrine', position: [50, -170], type: 'shrine' },
  { id: 'sp27', name: 'Ravenwatch Gallows', position: [20, -180], type: 'gallows' },
  { id: 'sp48', name: 'Bandit Lookout', position: [-5, -160], type: 'watchpost' },
  { id: 'sp50', name: 'Southern Milestone', position: [0, -80], type: 'milestone' },
  { id: 'sp51', name: 'Outlaw Camp', position: [35, -195], type: 'abandoned_camp' },
  
  // === IRONHOLD TO ASHWOOD CORRIDOR ===
  { id: 'sp9', name: 'Forest Clearing', position: [-90, 65], type: 'clearing' },
  { id: 'sp10', name: 'Lone Watchtower', position: [-150, 122], type: 'watchtower' },
  { id: 'sp32', name: 'Forest Shrine', position: [-145, 115], type: 'shrine' },
  { id: 'sp33', name: 'Trail Marker', position: [-170, 70], type: 'milestone' },
  { id: 'sp34', name: 'Abandoned Campsite', position: [-100, 35], type: 'abandoned_camp' },
  { id: 'sp53', name: 'Woodcutter Camp', position: [-172, 122], type: 'hunter_camp' },
   
  // === IRONHOLD TO OLD VEYRA CORRIDOR ===
  { id: 'sp11', name: 'Burned Village', position: [100, 45], type: 'burned_village' },
  { id: 'sp12', name: 'Stone Circle', position: [150, 70], type: 'stone_circle' },
  { id: 'sp26', name: 'Roadside Camp', position: [95, 15], type: 'abandoned_camp' },
  { id: 'sp58', name: 'Ruins Approach', position: [130, 55], type: 'milestone' },
  { id: 'sp59', name: 'Ancient Cross', position: [170, 85], type: 'roadside_cross' },
  { id: 'sp60', name: 'Scavenger Camp', position: [188, 12], type: 'hunter_camp' },
  { id: 'sp62', name: 'Warning Post', position: [175, 75], type: 'watchpost' },
  
  // === BLACKTHORN TO OLD VEYRA ===
  { id: 'sp13', name: 'Watch Post', position: [195, -30], type: 'watchpost' },
  { id: 'sp64', name: 'Military Shrine', position: [200, -65], type: 'shrine' },
  { id: 'sp65', name: 'Supply Cache', position: [212, 68], type: 'supply_depot' },
  
  // === FROSTMERE HEIGHTS ===
  { id: 'sp14', name: 'Mountain Pond', position: [140, 160], type: 'pond' },
  { id: 'sp15', name: 'Hermit Cave', position: [180, 180], type: 'cave' },
  { id: 'sp31', name: 'Mountain Cross', position: [160, 165], type: 'roadside_cross' },
  { id: 'sp66', name: 'Highland Shrine', position: [135, 210], type: 'shrine' },
  { id: 'sp67', name: 'Mountain Watch', position: [185, 225], type: 'watchtower' },
  { id: 'sp68', name: 'Pilgrim Camp', position: [150, 185], type: 'hunter_camp' },
  { id: 'sp69', name: 'Stone Altar', position: [195, 205], type: 'stone_circle' },
  
  // === OLD VEYRA TO FROSTMERE ===
  { id: 'sp71', name: 'Ancient Path Marker', position: [180, 135], type: 'milestone' },
  { id: 'sp72', name: 'Veyra Outpost', position: [215, 125], type: 'watchpost' },
  { id: 'sp73', name: 'Ruined Shrine', position: [190, 150], type: 'shrine' },
  
  // === ASHWOOD DEEP ===
  { id: 'sp17', name: 'Abandoned Mine', position: [80, 140], type: 'cave' },
  { id: 'sp18', name: 'Signal Tower', position: [-65, 175], type: 'watchtower' },
  { id: 'sp74', name: 'Deep Forest Shrine', position: [-215, 165], type: 'shrine' },
  { id: 'sp75', name: 'Wolf Den', position: [-185, 185], type: 'cave' },
  { id: 'sp76', name: 'Ancient Oak Clearing', position: [-200, 135], type: 'clearing' },
  { id: 'sp77', name: 'Forest Graveyard', position: [-225, 125], type: 'graveyard' },
  { id: 'sp78', name: 'Hunter Lodge', position: [-175, 160], type: 'hunter_camp' },
  
  // === GREENMEADOW REGION ===
  { id: 'sp79', name: 'Farm Graveyard', position: [-185, -145], type: 'graveyard' },
  { id: 'sp80', name: 'Shepherd Hut', position: [-188, -146], type: 'ruined_house' },
  { id: 'sp81', name: 'Field Shrine', position: [-175, -115], type: 'shrine' },
  { id: 'sp82', name: 'Mill Pond', position: [-125, -100], type: 'pond' },
  
  // === GATE APPROACH ===
  { id: 'sp23', name: 'Gate Lantern', position: [3, 50], type: 'lantern_post' },
  { id: 'sp24', name: 'Gate Lantern', position: [-3, 50], type: 'lantern_post' },
  
  // === NW WILDERNESS ===
  { id: 'sp83', name: 'Northern Watch', position: [-235, 205], type: 'watchtower' },
  { id: 'sp84', name: 'Frontier Shrine', position: [-255, 165], type: 'shrine' },
  { id: 'sp85', name: 'Lost Caravan', position: [-245, 105], type: 'wagon' },
  { id: 'sp86', name: 'Wilderness Camp', position: [-265, 145], type: 'abandoned_camp' },
  { id: 'sp87', name: 'Border Stone', position: [-275, 85], type: 'milestone' },
  
  // === NE WILDERNESS ===
  { id: 'sp88', name: 'Mountain Shrine', position: [105, 245], type: 'shrine' },
  { id: 'sp89', name: 'Highland Camp', position: [145, 265], type: 'hunter_camp' },
  { id: 'sp90', name: 'Northern Watchtower', position: [65, 225], type: 'watchtower' },
  
  // === SW WILDERNESS ===
  { id: 'sp92', name: 'Southern Watch', position: [-205, -205], type: 'watchpost' },
  { id: 'sp93', name: 'Wilderness Shrine', position: [-235, -165], type: 'shrine' },
  { id: 'sp94', name: 'Abandoned Homestead', position: [-250, -210], type: 'ruined_house' },
  { id: 'sp96', name: 'Southern Graveyard', position: [-155, -225], type: 'graveyard' },
  
  // === SE WILDERNESS ===
  { id: 'sp97', name: 'Eastern Outpost', position: [245, -185], type: 'watchpost' },
  { id: 'sp98', name: 'Frontier Shrine', position: [265, -145], type: 'shrine' },
  { id: 'sp99', name: 'Desert Camp', position: [225, -225], type: 'abandoned_camp' },
  { id: 'sp100', name: 'Border Watch', position: [275, -105], type: 'watchtower' },
  
  // === MAP BORDER DETAILS ===
  { id: 'sp101', name: 'Northern Cross', position: [0, 275], type: 'roadside_cross' },
  { id: 'sp104', name: 'Southern Cross', position: [0, -275], type: 'roadside_cross' },
  { id: 'sp105', name: 'Border Cave', position: [65, -265], type: 'cave' },
  { id: 'sp107', name: 'Eastern Shrine', position: [285, 0], type: 'shrine' },
  { id: 'sp110', name: 'Western Shrine', position: [-285, 0], type: 'shrine' },
  
  // === CENTRAL REGION ===
  { id: 'sp113', name: 'Trade Crossroads', position: [35, 35], type: 'crossroads' },
  { id: 'sp114', name: 'Central Pond', position: [-45, 85], type: 'pond' },
  { id: 'sp115', name: 'Heartland Shrine', position: [55, 65], type: 'shrine' },
  { id: 'sp116', name: 'Capital Approach', position: [20, 45], type: 'lantern_post' },
  { id: 'sp117', name: 'Capital Approach', position: [-20, 45], type: 'lantern_post' },
  
  // === RAVENWATCH BADLANDS ===
  { id: 'sp118', name: 'Badland Cave', position: [-35, -215], type: 'cave' },
  { id: 'sp119', name: 'Outlaw Graveyard', position: [45, -235], type: 'graveyard' },
  { id: 'sp120', name: 'Bandit Shrine', position: [-25, -245], type: 'shrine' },
  
  // === ASHWOOD TO FROSTMERE TRAIL ===
  { id: 'sp121', name: 'Mountain Trail Start', position: [-105, 165], type: 'milestone' },
  { id: 'sp123', name: 'Highland Shrine', position: [25, 205], type: 'shrine' },
  { id: 'sp124', name: 'Mountain Camp', position: [65, 185], type: 'hunter_camp' },
  
  // === GREENMEADOW TO RAVENWATCH ===
  { id: 'sp125', name: 'Southern Trail Marker', position: [-105, -185], type: 'milestone' },
  { id: 'sp127', name: 'Warning Post', position: [-35, -195], type: 'watchpost' },
  
  // === ASHWOOD TO GREENMEADOW ===
  { id: 'sp128', name: 'Western Trail', position: [-180, 25], type: 'milestone' },
  { id: 'sp129', name: 'Forest Edge Camp', position: [-195, -35], type: 'hunter_camp' },
  { id: 'sp130', name: 'Woodland Shrine', position: [-205, -85], type: 'shrine' },

  // ===== NEW KINGDOM CORRIDOR POIS =====
  // Greenmeadow → Thornwall road
  { id: 'sp200', name: 'Western March Inn', position: [-220, -180], type: 'inn' },
  { id: 'sp201', name: 'March Milestone', position: [-300, -260], type: 'milestone' },
  { id: 'sp202', name: 'Frontier Watch', position: [-360, -320], type: 'watchtower' },
  { id: 'sp203', name: 'March Shrine', position: [-400, -380], type: 'shrine' },
  { id: 'sp204', name: 'Thornwall Approach', position: [-460, -420], type: 'lantern_post' },
  
  // Ashwood → Goldenvale road
  { id: 'sp210', name: 'Trader Rest', position: [-250, 130], type: 'inn' },
  { id: 'sp211', name: 'Western Milestone', position: [-380, 115], type: 'milestone' },
  { id: 'sp212', name: 'Vale Shrine', position: [-440, 125], type: 'shrine' },
  { id: 'sp213', name: 'Merchant Camp', position: [-492, 166], type: 'hunter_camp' },
   
  // Frostmere → Rivermoor road
  { id: 'sp220', name: 'River Approach', position: [220, 230], type: 'milestone' },
  { id: 'sp221', name: 'Eastern Inn', position: [320, 270], type: 'inn' },
  { id: 'sp222', name: 'River Shrine', position: [370, 290], type: 'shrine' },
  { id: 'sp223', name: 'Fisher Camp', position: [420, 320], type: 'hunter_camp' },
  
  // Blackthorn → Darkhollow road
  { id: 'sp230', name: 'Frontier Inn', position: [238, -275], type: 'inn' },
  { id: 'sp231', name: 'Dark Milestone', position: [380, -290], type: 'milestone' },
  { id: 'sp232', name: 'Hollow Shrine', position: [450, -330], type: 'shrine' },
  { id: 'sp233', name: 'Ruins Watch', position: [480, -360], type: 'watchtower' },
  
  // Ashwood → Stonepeak road
  { id: 'sp240', name: 'Mountain Road Start', position: [-230, 210], type: 'milestone' },
  { id: 'sp241', name: 'Mountain Inn', position: [-300, 340], type: 'inn' },
  { id: 'sp242', name: 'Peak Shrine', position: [-340, 420], type: 'shrine' },
  { id: 'sp243', name: 'High Watch Post', position: [-370, 470], type: 'watchpost' },

  // Thornwall → Goldenvale road
  { id: 'sp250', name: 'Western Waystation', position: [-540, -100], type: 'supply_depot' },
  { id: 'sp251', name: 'Border Shrine', position: [-560, -30], type: 'shrine' },
  
  // Goldenvale → Stonepeak road
  { id: 'sp260', name: 'Mountain Trail Post', position: [-510, 220], type: 'watchpost' },
  { id: 'sp261', name: 'Highland Shrine', position: [-450, 380], type: 'shrine' },
  
  // Rivermoor → Darkhollow road
  { id: 'sp270', name: 'Eastern Waystation', position: [500, 50], type: 'supply_depot' },
  { id: 'sp271', name: 'Wasteland Shrine', position: [530, -150], type: 'shrine' },
  
  // Stonepeak → Rivermoor (northern route)
  { id: 'sp280', name: 'Northern Waypoint', position: [-200, 540], type: 'watchpost' },
  { id: 'sp281', name: 'Cold Shrine', position: [100, 520], type: 'shrine' },
  { id: 'sp282', name: 'Northern Inn', position: [250, 460], type: 'inn' },
];

// ========== LANDMARK DEFINITIONS ==========
export interface LandmarkDef {
  id: string;
  name: string;
  position: [number, number];
  type: 'great_tower' | 'windmill' | 'cathedral' | 'giant_tree' | 'ruins_arch' | 'beacon';
  height: number;
}

export const LANDMARKS: LandmarkDef[] = [
  { id: 'lm1', name: 'Ironhold Tower', position: [0, 0], type: 'great_tower', height: 30 },
  { id: 'lm2', name: 'Greenmeadow Mill', position: [-145, -115], type: 'windmill', height: 18 },
  { id: 'lm3', name: 'Blackthorn Beacon', position: [185, -160], type: 'beacon', height: 22 },
  { id: 'lm4', name: 'Veyra Grand Arch', position: [195, 95], type: 'ruins_arch', height: 25 },
  { id: 'lm5', name: 'Ancient Oak', position: [-190, 145], type: 'giant_tree', height: 28 },
  { id: 'lm6', name: 'Frostmere Spire', position: [155, 200], type: 'cathedral', height: 24 },
  // New kingdom landmarks
  { id: 'lm7', name: 'Thornwall Citadel', position: [-500, -450], type: 'great_tower', height: 28 },
  { id: 'lm8', name: 'Rivermoor Lighthouse', position: [450, 350], type: 'beacon', height: 20 },
  { id: 'lm9', name: 'Stonepeak Spire', position: [-400, 500], type: 'cathedral', height: 30 },
  { id: 'lm10', name: 'Darkhollow Ruin', position: [550, -400], type: 'ruins_arch', height: 22 },
  { id: 'lm11', name: 'Goldenvale Gate', position: [-550, 100], type: 'great_tower', height: 24 },
];

// Utility: get region at world position
export function getRegionAt(x: number, z: number): RegionDef | null {
  let best: RegionDef | null = null;
  let bestDist = Infinity;
  for (const r of REGIONS) {
    const dx = x - r.center[0];
    const dz = z - r.center[1];
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < r.radius && dist < bestDist) {
      best = r;
      bestDist = dist;
    }
  }
  return best;
}

// Build POIS object compatible with existing constants format
export function buildPOISCompat(): Record<string, { x: number; z: number; label: string; danger: number; tempMod: number; resourceBonus: number }> {
  const result: Record<string, any> = {};
  for (const s of SETTLEMENTS) {
    const region = REGIONS.find(r => r.id === s.regionId);
    result[s.id] = {
      x: s.position[0],
      z: s.position[1],
      label: s.name,
      danger: region?.danger ?? 0,
      tempMod: region?.tempMod ?? 0,
      resourceBonus: region?.resourceBonus ?? 1,
    };
  }
  return result;
}
