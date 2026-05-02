/**
 * Reusable medieval building piece definitions.
 * Shared geometries, materials, and seeded RNG.
 */
import * as THREE from 'three';

// Shared geometries — created once
export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  cyl12: new THREE.CylinderGeometry(1, 1, 1, 12),
  cone4: new THREE.ConeGeometry(1, 1, 4),
  cone6: new THREE.ConeGeometry(1, 1, 6),
  cone8: new THREE.ConeGeometry(1, 1, 8),
  cone12: new THREE.ConeGeometry(1, 1, 12),
  plane: new THREE.PlaneGeometry(1, 1),
  sphere8: new THREE.SphereGeometry(1, 8, 6),
  // Tapered tower (wider base)
  towerGeo: new THREE.CylinderGeometry(0.85, 1, 1, 8),
};

// Shared materials — expanded medieval palette
export const MAT = {
  // Stone variants
  stone: new THREE.MeshLambertMaterial({ color: '#9a9a98' }),
  stoneDark: new THREE.MeshLambertMaterial({ color: '#5a5a58' }),
  stoneLight: new THREE.MeshLambertMaterial({ color: '#b8b8b0' }),
  stoneRuin: new THREE.MeshLambertMaterial({ color: '#7a7060' }),
  stoneWarm: new THREE.MeshLambertMaterial({ color: '#a09880' }),
  cobble: new THREE.MeshLambertMaterial({ color: '#6a6a60' }),
  // Wood variants
  wood: new THREE.MeshLambertMaterial({ color: '#8b6914' }),
  woodDark: new THREE.MeshLambertMaterial({ color: '#5a3a0e' }),
  woodLight: new THREE.MeshLambertMaterial({ color: '#a07a20' }),
  woodWeathered: new THREE.MeshLambertMaterial({ color: '#6a5a38' }),
  timber: new THREE.MeshLambertMaterial({ color: '#3a2810' }),
  // Walls
  plaster: new THREE.MeshLambertMaterial({ color: '#d4c8a0' }),
  plasterWarm: new THREE.MeshLambertMaterial({ color: '#c8b890' }),
  plasterDirty: new THREE.MeshLambertMaterial({ color: '#b0a478' }),
  daub: new THREE.MeshLambertMaterial({ color: '#c4b088' }),
  // Roofs
  roof: new THREE.MeshLambertMaterial({ color: '#7a3030' }),
  roofDark: new THREE.MeshLambertMaterial({ color: '#5a2222' }),
  roofThatch: new THREE.MeshLambertMaterial({ color: '#8a7a38' }),
  roofSlate: new THREE.MeshLambertMaterial({ color: '#4a4a50' }),
  roofTile: new THREE.MeshLambertMaterial({ color: '#9a4a30' }),
  // Details
  door: new THREE.MeshLambertMaterial({ color: '#3a2510' }),
  doorFrame: new THREE.MeshLambertMaterial({ color: '#4a3520' }),
  shutter: new THREE.MeshLambertMaterial({ color: '#2a4a3a' }),
  iron: new THREE.MeshLambertMaterial({ color: '#3a3a3a' }),
  dark: new THREE.MeshLambertMaterial({ color: '#1a1a1a' }),
  // Props
  hay: new THREE.MeshLambertMaterial({ color: '#c4a040' }),
  tent: new THREE.MeshLambertMaterial({ color: '#6a5a3a' }),
  tentDark: new THREE.MeshLambertMaterial({ color: '#4a3a2a' }),
  tentRagged: new THREE.MeshLambertMaterial({ color: '#5a4a30' }),
  metal: new THREE.MeshLambertMaterial({ color: '#666' }),
  banner: new THREE.MeshLambertMaterial({ color: '#8b2020' }),
  bannerBlue: new THREE.MeshLambertMaterial({ color: '#2a3a8b' }),
  bannerGold: new THREE.MeshLambertMaterial({ color: '#c4a030' }),
  fence: new THREE.MeshLambertMaterial({ color: '#5a4520' }),
  crop: new THREE.MeshLambertMaterial({ color: '#8a9a30' }),
  cropGold: new THREE.MeshLambertMaterial({ color: '#c4a840' }),
  water: new THREE.MeshLambertMaterial({ color: '#2e5c7a', transparent: true, opacity: 0.7 }),
  fire: new THREE.MeshBasicMaterial({ color: '#ff6a10' }),
  fireGlow: new THREE.MeshBasicMaterial({ color: '#ff9930' }),
  cage: new THREE.MeshLambertMaterial({ color: '#3a3a3a' }),
  moss: new THREE.MeshLambertMaterial({ color: '#3a5a2a' }),
  snow: new THREE.MeshLambertMaterial({ color: '#d0d8e0' }),
  palisade: new THREE.MeshLambertMaterial({ color: '#5a4a30' }),
  palisadeSharp: new THREE.MeshLambertMaterial({ color: '#4a3a20' }),
  barrel: new THREE.MeshLambertMaterial({ color: '#6a4a20' }),
  cloth: new THREE.MeshLambertMaterial({ color: '#b0a080' }),
  leather: new THREE.MeshLambertMaterial({ color: '#6a4a2a' }),
  bone: new THREE.MeshLambertMaterial({ color: '#d0c8b0' }),
  herb: new THREE.MeshLambertMaterial({ color: '#4a7a3a' }),
  grave: new THREE.MeshLambertMaterial({ color: '#5a5a50' }),
  // Atmosphere & accent
  lantern: new THREE.MeshBasicMaterial({ color: '#ffaa40' }),
  goldTrim: new THREE.MeshLambertMaterial({ color: '#b8962a' }),
  stainedGlass: new THREE.MeshBasicMaterial({ color: '#3a6a8a', transparent: true, opacity: 0.6 }),
  dirt: new THREE.MeshLambertMaterial({ color: '#5a4a30' }),
  charred: new THREE.MeshLambertMaterial({ color: '#2a2018' }),
  ironRusty: new THREE.MeshLambertMaterial({ color: '#5a3a2a' }),
  rope: new THREE.MeshLambertMaterial({ color: '#7a6a4a' }),
  bloodStain: new THREE.MeshLambertMaterial({ color: '#4a1a10' }),
  chalk: new THREE.MeshLambertMaterial({ color: '#c8c0a8' }),
};

// Seeded random for deterministic generation
export function seededRng(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}
