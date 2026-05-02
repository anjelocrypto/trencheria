import { useEffect } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import soldierIdleUrl from '@/assets/soldier.glb?url';

export function GLBInspector() {
  const gltf = useGLTF(soldierIdleUrl);
  const { actions, clips } = useAnimations(gltf.animations, gltf.scene);

  useEffect(() => {
    console.log('=== GLB INSPECTOR: soldier.glb (IDLE) ===');
    
    // 1. Animation clips
    console.log(`Animation clips (${clips.length}):`, clips.map(c => ({
      name: c.name,
      duration: c.duration.toFixed(3) + 's',
      tracks: c.tracks.length,
    })));

    // 2. Check for skinned meshes (rigged character)
    const skinnedMeshes: THREE.SkinnedMesh[] = [];
    const allMeshes: THREE.Mesh[] = [];
    gltf.scene.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
        skinnedMeshes.push(child as THREE.SkinnedMesh);
      }
      if ((child as THREE.Mesh).isMesh) {
        allMeshes.push(child as THREE.Mesh);
      }
    });
    console.log(`Skinned meshes: ${skinnedMeshes.length}, Total meshes: ${allMeshes.length}`);

    // 3. Skeleton info
    if (skinnedMeshes.length > 0) {
      const skeleton = skinnedMeshes[0].skeleton;
      console.log(`Skeleton bones (${skeleton.bones.length}):`, skeleton.bones.map(b => b.name));
    } else {
      console.log('NO SKINNED MESH — this model may not have a skeleton/rig.');
    }

    // 4. Bounding box for scale
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    console.log('Bounding box size:', { x: size.x.toFixed(3), y: size.y.toFixed(3), z: size.z.toFixed(3) });
    console.log('Bounding box min:', { x: box.min.x.toFixed(3), y: box.min.y.toFixed(3), z: box.min.z.toFixed(3) });
    console.log('Bounding box max:', { x: box.max.x.toFixed(3), y: box.max.y.toFixed(3), z: box.max.z.toFixed(3) });
    console.log(`Character height: ${size.y.toFixed(3)} units`);

    // 5. Root motion check — sample first position track
    clips.forEach(clip => {
      const posTracks = clip.tracks.filter(t => t.name.includes('.position'));
      if (posTracks.length > 0) {
        const rootTrack = posTracks.find(t => t.name.includes('Hips') || t.name.includes('Root') || posTracks[0]);
        if (rootTrack) {
          const vals = rootTrack.values;
          const first = [vals[0], vals[1], vals[2]];
          const last = [vals[vals.length - 3], vals[vals.length - 2], vals[vals.length - 1]];
          const drift = Math.sqrt(
            (last[0] - first[0]) ** 2 + (last[1] - first[1]) ** 2 + (last[2] - first[2]) ** 2
          );
          console.log(`Root motion check (${rootTrack.name}): drift=${drift.toFixed(4)}`, { first, last });
          console.log(drift < 0.01 ? '✅ IN-PLACE animation' : '⚠️ HAS ROOT MOTION');
        }
      }
    });

    // 6. Scene hierarchy
    const hierarchy: string[] = [];
    gltf.scene.traverse((child) => {
      const depth = getDepth(child, gltf.scene);
      hierarchy.push('  '.repeat(depth) + `${child.type}: "${child.name}"`);
    });
    console.log('Scene hierarchy:\n' + hierarchy.join('\n'));

    // 7. Materials
    allMeshes.forEach(m => {
      const mat = m.material as THREE.Material;
      console.log(`Mesh "${m.name}" material:`, {
        type: mat.type,
        name: mat.name,
      });
    });

    // Play the first clip for visual inspection
    if (clips.length > 0) {
      const action = actions[clips[0].name];
      if (action) {
        action.reset().play();
        console.log(`Playing clip: "${clips[0].name}"`);
      }
    }

    console.log('=== END GLB INSPECTOR ===');
  }, [gltf, clips, actions]);

  return (
    <primitive object={gltf.scene} position={[5, 0, 5]} scale={1} />
  );
}

function getDepth(obj: THREE.Object3D, root: THREE.Object3D): number {
  let depth = 0;
  let current = obj;
  while (current.parent && current !== root) {
    depth++;
    current = current.parent;
  }
  return depth;
}
