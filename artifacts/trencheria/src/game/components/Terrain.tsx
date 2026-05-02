import { useMemo, memo } from 'react';
import * as THREE from 'three';
import { WORLD_SIZE, HALF_WORLD, COLORS } from '../constants';
import { ROADS, REGIONS, SETTLEMENTS } from '../world/RegionData';
import { getRailFlattenGrid } from '../world/RailwayData';

function noise2D(x: number, z: number, scale: number = 1, seed: number = 0): number {
  const nx = (x + seed) * scale;
  const nz = (z + seed) * scale;
  return (Math.sin(nx * 1.7 + nz * 3.1) * 0.5 +
          Math.sin(nx * 0.8 - nz * 1.3) * 0.3 +
          Math.cos(nx * 2.1 + nz * 0.7) * 0.2);
}

// Regional height modifiers — expanded for new kingdoms
function getRegionalHeight(x: number, z: number): number {
  let mod = 0;
  // Frostmere highlands — elevated terrain SE
  const frostDist = Math.sqrt((x - 160) ** 2 + (z - 200) ** 2);
  if (frostDist < 100) mod += (1 - frostDist / 100) * 12;

  // Ashwood slight elevation
  const ashDist = Math.sqrt((x + 190) ** 2 + (z - 140) ** 2);
  if (ashDist < 80) mod += (1 - ashDist / 80) * 3;

  // Greenmeadow — flatten for farmland
  const greenDist = Math.sqrt((x + 160) ** 2 + (z + 130) ** 2);
  if (greenDist < 70) mod -= (1 - greenDist / 70) * 4;

  // Stonepeak — high mountain kingdom
  const stonepeakDist = Math.sqrt((x + 400) ** 2 + (z - 500) ** 2);
  if (stonepeakDist < 120) mod += (1 - stonepeakDist / 120) * 18;

  // Thornwall — rugged frontier hills
  const thornDist = Math.sqrt((x + 500) ** 2 + (z + 450) ** 2);
  if (thornDist < 100) mod += (1 - thornDist / 100) * 6;

  // Rivermoor — low wetlands
  const riverDist = Math.sqrt((x - 450) ** 2 + (z - 350) ** 2);
  if (riverDist < 100) mod -= (1 - riverDist / 100) * 3;

  // Darkhollow — desolate flat wasteland
  const darkDist = Math.sqrt((x - 550) ** 2 + (z + 400) ** 2);
  if (darkDist < 100) mod += (1 - darkDist / 100) * 2;

  // Goldenvale — gentle rolling plains
  const goldDist = Math.sqrt((x + 550) ** 2 + (z - 100) ** 2);
  if (goldDist < 100) mod -= (1 - goldDist / 100) * 2;

  // Northern reach — cold hills
  const northDist = Math.sqrt(x ** 2 + (z - 500) ** 2);
  if (northDist < 100) mod += (1 - northDist / 100) * 8;

  return mod;
}

export function getTerrainHeight(x: number, z: number): number {
  const h1 = noise2D(x, z, 0.008, 42) * 15;
  const h2 = noise2D(x, z, 0.02, 17) * 5;
  const h3 = noise2D(x, z, 0.05, 99) * 2;

  const distFromCenter = Math.sqrt(x * x + z * z);
  const flattenFactor = Math.max(0, 1 - distFromCenter / 40);

  // Flatten around settlements — plateau function for proper building grounding
  let settleFlatten = 0;
  for (const s of SETTLEMENTS) {
    const sd = Math.sqrt((x - s.position[0]) ** 2 + (z - s.position[1]) ** 2);
    // Large kingdoms (walls at ±45) need bigger flatten radius
    // Medium (walls ±20) and small get proportional radii
    const flatR = s.size === 'large' ? 70 : s.size === 'medium' ? 35 : 25;
    if (sd < flatR) {
      const t = sd / flatR;
      // Plateau: terrain is ~97% flat within 85% of radius, then rapid linear falloff
      // This ensures walls, towers, and corner structures all sit on level ground
      const f = t < 0.85 ? 1.0 : Math.max(0, 1 - (t - 0.85) / 0.15);
      settleFlatten = Math.max(settleFlatten, f * 0.97);
    }
  }

  const baseHeight = (h1 + h2 + h3) * (1 - flattenFactor * 0.8);
  // Modest mountain amplification — 1.25x regional for more dramatic peaks
  const regional = getRegionalHeight(x, z) * 1.25;
  const rawHeight = (baseHeight + regional) * (1 - settleFlatten) + regional * settleFlatten * 0.3;

  // Railway corridor flattening — uses precomputed grid (fast lookup).
  // The grid also bakes in station-platform pads (see RailwayData.ts) so
  // station footprints sit fully flat against this same target.
  // Floor the target at 0 so rail/station flat zones never dip below water
  // level when they pass through farmland lowlands or wetlands (regional<0).
  // Real railways in such terrain run on embankments; this matches that.
  const railFlatten = getRailFlattenGrid().sample(x, z);
  const railTarget = Math.max(0, regional * 0.3);
  let height = rawHeight * (1 - railFlatten) + railTarget * railFlatten;

  // Conservative terrain stepping for voxel-inspired terracing
  // Only apply outside settlement AND railway flatten zones
  const combinedFlatten = Math.max(settleFlatten, railFlatten);
  if (combinedFlatten < 0.3) {
    const stepStrength = 1 - combinedFlatten / 0.3;
    const stepped = Math.round(height * 2.5) / 2.5;
    height = height + (stepped - height) * stepStrength * 0.7;
  }

  return Math.max(-1, height);
}

function getRoadFactor(x: number, z: number): number {
  let best = 0;
  for (const road of ROADS) {
    const dx = road.to[0] - road.from[0], dz = road.to[1] - road.from[1];
    const len2 = dx * dx + dz * dz;
    if (len2 < 1) continue;
    const t = Math.max(0, Math.min(1, ((x - road.from[0]) * dx + (z - road.from[1]) * dz) / len2));
    const px = road.from[0] + t * dx, pz = road.from[1] + t * dz;
    const dist = Math.sqrt((x - px) ** 2 + (z - pz) ** 2);
    const width = road.width + noise2D(px, pz, 0.05, 500) * 0.5;
    const factor = Math.max(0, 1 - dist / width);
    if (factor > best) best = factor;
  }
  return best;
}

export const Terrain = memo(function Terrain() {
  const geometry = useMemo(() => {
    const segments = 300;
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const positions = geo.attributes.position;
    const colors = new Float32Array(positions.count * 3);

    const grassColor = new THREE.Color('#4d8040');
    const grassDarkColor = new THREE.Color('#3a6830');
    const roadColor = new THREE.Color(COLORS.road);
    const sandColor = new THREE.Color('#c4b580');
    const stoneColor = new THREE.Color('#6a6a6a');
    const forestFloor = new THREE.Color('#354d28');
    const snowColor = new THREE.Color('#d0d8e0');
    const hillBrown = new THREE.Color('#6a6040');
    const tmpColor = new THREE.Color();

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const y = getTerrainHeight(x, z);
      positions.setY(i, y);

      if (y < -0.5) {
        tmpColor.copy(sandColor);
      } else if (y < 1.5) {
        tmpColor.copy(grassColor);
      } else if (y < 5) {
        tmpColor.lerpColors(grassColor, grassDarkColor, (y - 1.5) / 3.5);
      } else if (y < 9) {
        tmpColor.lerpColors(grassDarkColor, hillBrown, (y - 5) / 4);
      } else if (y < 14) {
        tmpColor.lerpColors(hillBrown, stoneColor, (y - 9) / 5);
      } else if (y < 18) {
        tmpColor.lerpColors(stoneColor, snowColor, (y - 14) / 4);
      } else {
        tmpColor.copy(snowColor);
      }

      // Ashwood dark forest floor
      const ashDist = Math.sqrt((x + 190) ** 2 + (z - 140) ** 2);
      if (ashDist < 80 && y > -0.3) {
        tmpColor.lerp(forestFloor, Math.max(0, 1 - ashDist / 80) * 0.6);
      }

      // Road overlay
      const roadFactor = getRoadFactor(x, z);
      if (roadFactor > 0.1) {
        tmpColor.lerp(roadColor, roadFactor * 0.8);
      }

      // Settlement ground
      for (const s of SETTLEMENTS) {
        const sd = Math.sqrt((x - s.position[0]) ** 2 + (z - s.position[1]) ** 2);
        const gR = s.size === 'large' ? 35 : s.size === 'medium' ? 20 : 12;
        if (sd < gR) {
          const villageGround = new THREE.Color(s.type === 'capital' ? '#7a7060' : s.type === 'village' ? '#7a6a4a' : '#6a6050');
          tmpColor.lerp(villageGround, Math.max(0, 1 - sd / gR) * 0.5);
        }
      }

      const variation = noise2D(x, z, 0.1, 300) * 0.04;
      colors[i * 3] = Math.max(0, Math.min(1, tmpColor.r + variation));
      colors[i * 3 + 1] = Math.max(0, Math.min(1, tmpColor.g + variation));
      colors[i * 3 + 2] = Math.max(0, Math.min(1, tmpColor.b + variation));
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshLambertMaterial vertexColors />
    </mesh>
  );
});
