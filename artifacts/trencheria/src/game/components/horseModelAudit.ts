import * as THREE from 'three';

export interface HorseClipAudit {
  name: string;
  trackCount: number;
  scaleTrackCount: number;
  positionTrackCount: number;
  rotationTrackCount: number;
}

export interface HorseSceneAudit {
  bounds: {
    width: number;
    height: number;
    depth: number;
    minY: number;
    maxY: number;
  };
  boneCount: number;
  meshCount: number;
  negativeScaleNodes: string[];
  rootPosition: [number, number, number];
  rootRotation: [number, number, number];
  rootScale: [number, number, number];
  rootBoneName: string | null;
  rootBoneScale: [number, number, number] | null;
  rootBonePosition: [number, number, number] | null;
  skinnedMeshCount: number;
}

export interface HorseAssetAudit {
  stand: HorseSceneAudit;
  walk: HorseSceneAudit;
  standClips: HorseClipAudit[];
  walkClips: HorseClipAudit[];
  sameBoneHierarchy: boolean;
  walkHasScaleTracks: boolean;
  standHasScaleTracks: boolean;
}

const round = (value: number) => Number(value.toFixed(3));

const toTuple = (vector: THREE.Vector3 | THREE.Euler): [number, number, number] => [
  round(vector.x),
  round(vector.y),
  round(vector.z),
];

function auditClip(clip: THREE.AnimationClip): HorseClipAudit {
  const scaleTrackCount = clip.tracks.filter((track) => track.name.endsWith('.scale')).length;
  const positionTrackCount = clip.tracks.filter((track) => track.name.endsWith('.position')).length;
  const rotationTrackCount = clip.tracks.filter((track) => track.name.endsWith('.quaternion')).length;

  return {
    name: clip.name,
    trackCount: clip.tracks.length,
    scaleTrackCount,
    positionTrackCount,
    rotationTrackCount,
  };
}

function getRootBone(skeleton: THREE.Skeleton | null): THREE.Bone | null {
  if (!skeleton || skeleton.bones.length === 0) return null;
  const boneSet = new Set(skeleton.bones);
  return skeleton.bones.find((bone) => !bone.parent || !boneSet.has(bone.parent as THREE.Bone)) ?? skeleton.bones[0];
}

function auditScene(scene: THREE.Object3D): HorseSceneAudit & { boneNames: string[] } {
  scene.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  bounds.getSize(size);

  let meshCount = 0;
  let skinnedMeshCount = 0;
  const negativeScaleNodes: string[] = [];
  let skeleton: THREE.Skeleton | null = null;

  scene.traverse((child) => {
    if (child.scale.x < 0 || child.scale.y < 0 || child.scale.z < 0) {
      negativeScaleNodes.push(child.name || child.uuid);
    }

    if ((child as THREE.Mesh).isMesh) {
      meshCount += 1;
    }

    if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
      skinnedMeshCount += 1;
      if (!skeleton) {
        skeleton = (child as THREE.SkinnedMesh).skeleton;
      }
    }
  });

  const rootBone = getRootBone(skeleton);
  const boneNames = skeleton?.bones.map((bone) => bone.name) ?? [];

  return {
    bounds: {
      width: round(size.x),
      height: round(size.y),
      depth: round(size.z),
      minY: round(bounds.min.y),
      maxY: round(bounds.max.y),
    },
    boneCount: boneNames.length,
    boneNames,
    meshCount,
    negativeScaleNodes,
    rootPosition: toTuple(scene.position),
    rootRotation: toTuple(scene.rotation),
    rootScale: toTuple(scene.scale),
    rootBoneName: rootBone?.name ?? null,
    rootBoneScale: rootBone ? toTuple(rootBone.scale) : null,
    rootBonePosition: rootBone ? toTuple(rootBone.position) : null,
    skinnedMeshCount,
  };
}

export function auditHorseAssets(
  standScene: THREE.Object3D,
  walkScene: THREE.Object3D,
  standAnimations: THREE.AnimationClip[],
  walkAnimations: THREE.AnimationClip[],
): HorseAssetAudit {
  const stand = auditScene(standScene);
  const walk = auditScene(walkScene);
  const standClips = standAnimations.map(auditClip);
  const walkClips = walkAnimations.map(auditClip);

  return {
    stand,
    walk,
    standClips,
    walkClips,
    sameBoneHierarchy:
      stand.boneNames.length === walk.boneNames.length &&
      stand.boneNames.every((boneName, index) => boneName === walk.boneNames[index]),
    walkHasScaleTracks: walkClips.some((clip) => clip.scaleTrackCount > 0),
    standHasScaleTracks: standClips.some((clip) => clip.scaleTrackCount > 0),
  };
}
