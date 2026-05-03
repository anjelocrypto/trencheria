import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { advanceTime, getSunDirection, getTimeColors } from '../systems/TimeOfDay';
import { useQualitySettings } from '../hooks/useQualitySettings';

interface Props {
  playerPositionRef: React.RefObject<THREE.Vector3>;
}

const sunDir = new THREE.Vector3();
const colors = {
  sunColor: new THREE.Color(),
  ambientColor: new THREE.Color(),
  fogColor: new THREE.Color(),
  sunIntensity: 1.4,
  ambientIntensity: 0.35,
};

export function Atmosphere({ playerPositionRef }: Props) {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const quality = useQualitySettings();
  // Far-prop shadows: shrink the sun's shadow camera so distant objects
  // (which use castShadow) simply fall outside the shadow frustum and
  // never hit the depth pass. ~3-4× cheaper shadow render on Med/Low.
  const shadowFar = quality.farShadows ? 200 : 90;
  const shadowExtent = quality.farShadows ? 60 : 35;
  const shadowMapDim = quality.shadowMapSize;

  useFrame(({ scene }, delta) => {
    // Advance global clock
    advanceTime(delta);

    // Get current time-of-day colors
    getTimeColors(colors);
    getSunDirection(sunDir);

    const pp = playerPositionRef.current;
    const px = pp ? pp.x : 0;
    const pz = pp ? pp.z : 0;

    // Position sun light relative to player
    if (lightRef.current) {
      const sunDist = 120;
      lightRef.current.position.set(
        px + sunDir.x * sunDist,
        Math.max(10, sunDir.y * 80), // keep above ground even at low angles
        pz + sunDir.z * sunDist
      );
      lightRef.current.target.position.set(px, 0, pz);
      lightRef.current.target.updateMatrixWorld();
      lightRef.current.color.copy(colors.sunColor);
      lightRef.current.intensity = colors.sunIntensity;
    }

    // Ambient
    if (ambientRef.current) {
      ambientRef.current.color.copy(colors.ambientColor);
      ambientRef.current.intensity = colors.ambientIntensity;
    }

    // Hemisphere
    if (hemiRef.current) {
      hemiRef.current.color.copy(colors.ambientColor);
      hemiRef.current.intensity = colors.ambientIntensity * 0.8;
    }

    // Fog
    const fog = scene.fog as THREE.Fog | null;
    if (fog) {
      fog.color.copy(colors.fogColor);
    }
  });

  return (
    <>
      {/* Sun */}
      <directionalLight
        ref={lightRef}
        position={[120, 60, 80]}
        intensity={1.4}
        castShadow={quality.shadows}
        shadow-mapSize={[shadowMapDim, shadowMapDim]}
        shadow-camera-far={shadowFar}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        color="#ffe0a0"
      >
        <object3D attach="target" />
      </directionalLight>
      {/* Ambient fill */}
      <ambientLight ref={ambientRef} intensity={0.35} color="#9aabbf" />
      {/* Hemisphere */}
      <hemisphereLight ref={hemiRef} args={['#7a98b8', '#4a6a3a', 0.3]} />
      {/* Fog — initial values, updated each frame */}
      <fog attach="fog" args={['#8a9a80', 60, 250]} />
    </>
  );
}
