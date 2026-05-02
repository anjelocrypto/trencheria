/**
 * Cinematic camera system for the main menu.
 * Smoothly interpolates through predefined cinematic shots of the world.
 */
import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SETTLEMENTS, LANDMARKS, SMALL_POIS } from '../world/RegionData';
import { getTerrainHeight } from '../components/Terrain';

// Cinematic shot definition
interface CinematicShot {
  name: string;
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
  duration: number; // seconds to spend on this shot
  ease: 'smooth' | 'slow' | 'drift';
}

// Generate cinematic shots from world data
function generateCinematicShots(): CinematicShot[] {
  const shots: CinematicShot[] = [];

  // Capital Ironhold - epic opening
  const capitalPos = SETTLEMENTS.find(s => s.id === 'ironhold')?.position || [0, 0];
  const capitalY = getTerrainHeight(capitalPos[0], capitalPos[1]);
  shots.push({
    name: 'Ironhold Reveal',
    position: new THREE.Vector3(capitalPos[0] + 60, capitalY + 35, capitalPos[1] + 60),
    lookAt: new THREE.Vector3(capitalPos[0], capitalY + 8, capitalPos[1]),
    duration: 12,
    ease: 'slow',
  });

  // Orbit around capital
  shots.push({
    name: 'Capital Orbit',
    position: new THREE.Vector3(capitalPos[0] - 45, capitalY + 25, capitalPos[1] + 50),
    lookAt: new THREE.Vector3(capitalPos[0], capitalY + 5, capitalPos[1]),
    duration: 10,
    ease: 'smooth',
  });

  // Fort Blackthorn - military atmosphere
  const fort = SETTLEMENTS.find(s => s.id === 'blackthorn_fort');
  if (fort) {
    const fortY = getTerrainHeight(fort.position[0], fort.position[1]);
    shots.push({
      name: 'Blackthorn Fort',
      position: new THREE.Vector3(fort.position[0] + 40, fortY + 22, fort.position[1] - 30),
      lookAt: new THREE.Vector3(fort.position[0], fortY + 6, fort.position[1]),
      duration: 9,
      ease: 'smooth',
    });
  }

  // Monastery Frostmere - sacred heights
  const monastery = SETTLEMENTS.find(s => s.id === 'frostmere_monastery');
  if (monastery) {
    const monY = getTerrainHeight(monastery.position[0], monastery.position[1]);
    shots.push({
      name: 'Frostmere Keep',
      position: new THREE.Vector3(monastery.position[0] - 30, monY + 28, monastery.position[1] + 45),
      lookAt: new THREE.Vector3(monastery.position[0], monY + 10, monastery.position[1]),
      duration: 10,
      ease: 'drift',
    });
  }

  // Old Veyra Ruins - mystical atmosphere
  const ruins = SETTLEMENTS.find(s => s.id === 'old_veyra_ruins');
  if (ruins) {
    const ruinY = getTerrainHeight(ruins.position[0], ruins.position[1]);
    shots.push({
      name: 'Old Veyra Ruins',
      position: new THREE.Vector3(ruins.position[0] - 50, ruinY + 20, ruins.position[1] - 35),
      lookAt: new THREE.Vector3(ruins.position[0], ruinY + 4, ruins.position[1]),
      duration: 11,
      ease: 'slow',
    });
  }

  // Greenmeadow Village - peaceful countryside
  const village = SETTLEMENTS.find(s => s.id === 'greenmeadow_village');
  if (village) {
    const villY = getTerrainHeight(village.position[0], village.position[1]);
    shots.push({
      name: 'Greenmeadow Fields',
      position: new THREE.Vector3(village.position[0] + 35, villY + 18, village.position[1] + 40),
      lookAt: new THREE.Vector3(village.position[0], villY + 3, village.position[1]),
      duration: 9,
      ease: 'smooth',
    });
  }

  // Ashwood Forest - deep woods
  const ashwood = SETTLEMENTS.find(s => s.id === 'ashwood_shrine');
  if (ashwood) {
    const ashY = getTerrainHeight(ashwood.position[0], ashwood.position[1]);
    shots.push({
      name: 'Ashwood Deep',
      position: new THREE.Vector3(ashwood.position[0] + 25, ashY + 15, ashwood.position[1] - 30),
      lookAt: new THREE.Vector3(ashwood.position[0], ashY + 5, ashwood.position[1]),
      duration: 8,
      ease: 'drift',
    });
  }

  // Road journey - dolly shot
  const bridge = SMALL_POIS.find(p => p.type === 'bridge');
  if (bridge) {
    const bridgeY = getTerrainHeight(bridge.position[0], bridge.position[1]);
    shots.push({
      name: 'Stone Bridge',
      position: new THREE.Vector3(bridge.position[0] - 20, bridgeY + 8, bridge.position[1] + 25),
      lookAt: new THREE.Vector3(bridge.position[0], bridgeY + 2, bridge.position[1]),
      duration: 7,
      ease: 'smooth',
    });
  }

  // Ravenwatch Badlands - dangerous territory
  const banditCamp = SETTLEMENTS.find(s => s.id === 'ravenwatch_camp');
  if (banditCamp) {
    const campY = getTerrainHeight(banditCamp.position[0], banditCamp.position[1]);
    shots.push({
      name: 'Ravenwatch Badlands',
      position: new THREE.Vector3(banditCamp.position[0] + 40, campY + 16, banditCamp.position[1] + 35),
      lookAt: new THREE.Vector3(banditCamp.position[0], campY + 2, banditCamp.position[1]),
      duration: 8,
      ease: 'slow',
    });
  }

  // Wide landscape shot
  shots.push({
    name: 'Kingdom Vista',
    position: new THREE.Vector3(80, 50, 120),
    lookAt: new THREE.Vector3(0, 0, 0),
    duration: 10,
    ease: 'drift',
  });

  return shots;
}

// Easing functions
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function easeLinear(t: number): number {
  return t;
}

function getEaseFunction(ease: CinematicShot['ease']) {
  switch (ease) {
    case 'slow': return easeInOutCubic;
    case 'drift': return easeLinear;
    default: return easeInOutSine;
  }
}

export function CinematicCamera() {
  const { camera } = useThree();
  const shots = useMemo(() => generateCinematicShots(), []);
  
  const shotIndexRef = useRef(0);
  const shotTimeRef = useRef(0);
  const prevPosRef = useRef(new THREE.Vector3());
  const prevLookRef = useRef(new THREE.Vector3());
  const initialized = useRef(false);

  useFrame((_, delta) => {
    if (shots.length === 0) return;
    const dt = Math.min(delta, 0.1); // Cap delta for stability

    const currentShot = shots[shotIndexRef.current];
    const nextIndex = (shotIndexRef.current + 1) % shots.length;
    const nextShot = shots[nextIndex];

    // Initialize on first frame
    if (!initialized.current) {
      prevPosRef.current.copy(currentShot.position);
      prevLookRef.current.copy(currentShot.lookAt);
      camera.position.copy(currentShot.position);
      camera.lookAt(currentShot.lookAt);
      initialized.current = true;
      return;
    }

    shotTimeRef.current += dt;
    const progress = Math.min(shotTimeRef.current / currentShot.duration, 1);
    const easedProgress = getEaseFunction(currentShot.ease)(progress);

    // Interpolate position and lookAt
    const targetPos = new THREE.Vector3().lerpVectors(
      currentShot.position,
      nextShot.position,
      easedProgress
    );
    const targetLook = new THREE.Vector3().lerpVectors(
      currentShot.lookAt,
      nextShot.lookAt,
      easedProgress
    );

    // Smooth camera movement (additional dampening)
    camera.position.lerp(targetPos, dt * 1.5);
    prevLookRef.current.lerp(targetLook, dt * 2);
    camera.lookAt(prevLookRef.current);

    // Advance to next shot
    if (progress >= 1) {
      shotIndexRef.current = nextIndex;
      shotTimeRef.current = 0;
      prevPosRef.current.copy(nextShot.position);
      prevLookRef.current.copy(nextShot.lookAt);
    }
  });

  return null;
}
