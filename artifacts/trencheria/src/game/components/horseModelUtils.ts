import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';

function fixHorseMaterial(material: THREE.Material) {
  material.visible = true;
  material.side = THREE.DoubleSide;
  material.transparent = false;
  material.opacity = 1;
  material.depthWrite = true;
  material.depthTest = true;
  material.alphaTest = 0;
  material.needsUpdate = true;
}

export function prepareHorseScene(scene: THREE.Object3D) {
  scene.traverse((child) => {
    child.frustumCulled = false;

    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
        const skinnedMesh = mesh as THREE.SkinnedMesh;
        skinnedMesh.geometry.computeBoundingBox();
        skinnedMesh.geometry.computeBoundingSphere();
        if (skinnedMesh.geometry.boundingSphere) {
          skinnedMesh.geometry.boundingSphere.radius *= 10;
        }
      }

      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((material) => material && fixHorseMaterial(material));
      } else if (mesh.material) {
        fixHorseMaterial(mesh.material);
      }
    }
  });
}

export function clonePreparedHorseScene(scene: THREE.Object3D) {
  const clone = SkeletonUtils.clone(scene);
  prepareHorseScene(clone);
  return clone;
}

export function stripScaleTracks(clip: THREE.AnimationClip) {
  const filteredTracks = clip.tracks.filter((track) => !track.name.endsWith('.scale'));
  if (filteredTracks.length === clip.tracks.length) {
    return clip;
  }

  return new THREE.AnimationClip(
    clip.name,
    clip.duration,
    filteredTracks.map((track) => track.clone()),
  );
}
