import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { HORSE_CAMERA_DISTANCE_BONUS, HORSE_CAMERA_HEIGHT_BONUS } from './HorseData';

const ORBIT_DISTANCE = 12;
const MIN_DISTANCE = 6;
const MAX_DISTANCE = 22;
const MIN_POLAR = 0.25;
const MAX_POLAR = 1.45;
const ORBIT_SENSITIVITY = 0.003;
const ZOOM_SENSITIVITY = 0.5;
const CAMERA_HEIGHT_OFFSET = 2;

const _targetPos = new THREE.Vector3();
const _lookAt = new THREE.Vector3();
const _velocity = new THREE.Vector3();
const _prevTarget = new THREE.Vector3();

interface CameraControllerProps {
  targetRef: React.RefObject<THREE.Vector3>;
  azimuthRef: React.MutableRefObject<number>;
  isMounted?: boolean;
}

export function CameraController({ targetRef, azimuthRef, isMounted = false }: CameraControllerProps) {
  const { camera, gl } = useThree();
  const polarRef = useRef(0.7);
  const distanceRef = useRef(ORBIT_DISTANCE);
  const smoothDistRef = useRef(ORBIT_DISTANCE); // smoothed distance for speed-pull
  const prevTargetRef = useRef(new THREE.Vector3());
  const targetSpeedRef = useRef(0);
  const lookAtSmooth = useRef(new THREE.Vector3());
  const firstFrame = useRef(true);

  useEffect(() => {
    const canvas = gl.domElement;
    const onPointerDown = () => { canvas.requestPointerLock?.(); };
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      azimuthRef.current -= e.movementX * ORBIT_SENSITIVITY;
      polarRef.current = THREE.MathUtils.clamp(
        polarRef.current - e.movementY * ORBIT_SENSITIVITY,
        MIN_POLAR, MAX_POLAR
      );
    };
    const onWheel = (e: WheelEvent) => {
      distanceRef.current = THREE.MathUtils.clamp(
        distanceRef.current + e.deltaY * 0.01 * ZOOM_SENSITIVITY,
        MIN_DISTANCE, MAX_DISTANCE
      );
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.code === 'Escape') document.exitPointerLock?.(); };
    const onContextMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('wheel', onWheel, { passive: true });
    canvas.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [gl, azimuthRef]);

  useFrame((_, delta) => {
    const target = targetRef.current;
    if (!target) return;
    const dt = Math.min(delta, 0.05);

    // Track target speed for dynamic camera
    if (firstFrame.current) {
      prevTargetRef.current.copy(target);
      lookAtSmooth.current.copy(target);
      firstFrame.current = false;
    }
    _velocity.subVectors(target, prevTargetRef.current).divideScalar(Math.max(dt, 0.001));
    const targetSpeed = _velocity.length();
    targetSpeedRef.current = THREE.MathUtils.lerp(targetSpeedRef.current, targetSpeed, dt * 3);
    prevTargetRef.current.copy(target);

    // Dynamic distance — pull back when sprinting/riding fast
    const speedPull = isMounted
      ? Math.min(targetSpeedRef.current / 30, 1) * 3
      : Math.min(targetSpeedRef.current / 14, 1) * 1.5;

    const distBonus = isMounted ? HORSE_CAMERA_DISTANCE_BONUS : 0;
    const heightBonus = isMounted ? HORSE_CAMERA_HEIGHT_BONUS : 0;
    const wantDist = distanceRef.current + distBonus + speedPull;

    // Smooth the distance change
    smoothDistRef.current = THREE.MathUtils.lerp(smoothDistRef.current, wantDist, dt * 4);

    const dist = smoothDistRef.current;
    const azimuth = azimuthRef.current;
    const polar = polarRef.current;
    const sinPolar = Math.sin(polar);

    _targetPos.set(
      target.x + dist * sinPolar * Math.sin(azimuth),
      target.y + dist * Math.cos(polar) + CAMERA_HEIGHT_OFFSET + heightBonus,
      target.z + dist * sinPolar * Math.cos(azimuth),
    );

    // Adaptive camera lerp — faster follow when moving fast, smoother when still
    const baseLerp = 5;
    const speedLerp = isMounted ? 4 : 6;
    const lerpFactor = baseLerp + Math.min(targetSpeedRef.current / 10, 1) * speedLerp;

    camera.position.lerp(_targetPos, lerpFactor * dt);

    // Smooth look-at with slight lag for cinematic feel
    const lookY = target.y + 1.2 + heightBonus * 0.3;
    _lookAt.set(target.x, lookY, target.z);
    lookAtSmooth.current.lerp(_lookAt, dt * (8 + targetSpeedRef.current * 0.3));
    camera.lookAt(lookAtSmooth.current);
  });

  return null;
}
