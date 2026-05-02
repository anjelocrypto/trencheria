/**
 * RailwayTrack — Static BufferGeometry built with direct typed-array writes.
 * NO .clone(), NO mergeGeometries(), NO useFrame. Minimal heap footprint.
 * Each box is 24 vertices (with normals). Written directly into pre-allocated buffers.
 */
import { useMemo, memo } from 'react';
import * as THREE from 'three';
import { LINE_A_WAYPOINTS, LINE_B_WAYPOINTS, RailwayWaypoint } from '../world/RailwayData';
import { getRailGroundHeight } from '../systems/Grounding';

const GAUGE = 1.2;
const BALLAST_H = 0.15;
const SLEEPER_H = 0.12;
const RAIL_H = 0.15;
const RAIL_Y_OFF = BALLAST_H + SLEEPER_H + RAIL_H / 2;
const SLP_Y_OFF = BALLAST_H + SLEEPER_H / 2;
const SLEEPER_SPACING = 2.0;
const TRACK_HEIGHT_OFFSET = 0.35;
const SUBDIV = 4;

const railMat = new THREE.MeshLambertMaterial({ color: '#3a3a3a' });
const sleeperMat = new THREE.MeshLambertMaterial({ color: '#5a3a1a' });
const ballastMat = new THREE.MeshLambertMaterial({ color: '#6a6050' });

// ---- Direct box vertex writer ----
// A box has 6 faces × 4 verts = 24 verts, 6 faces × 2 tris × 3 indices = 36 indices
const VERTS_PER_BOX = 24;
const INDICES_PER_BOX = 36;

// Unit box template: 8 corners of a 1×1×1 box centered at origin
// We transform them per-instance and write 24 verts (with face normals)
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();

// Box face definitions: [axis, sign, corner offsets (4 verts CCW)]
// Each face: normal axis (0=x,1=y,2=z), sign (+1/-1), 4 corner indices from 8 corners
const CORNERS = [
  [-0.5, -0.5, -0.5], [-0.5, -0.5,  0.5], [-0.5,  0.5, -0.5], [-0.5,  0.5,  0.5],
  [ 0.5, -0.5, -0.5], [ 0.5, -0.5,  0.5], [ 0.5,  0.5, -0.5], [ 0.5,  0.5,  0.5],
];

// 6 faces: [normal_x, normal_y, normal_z, v0, v1, v2, v3] (CCW winding)
const FACES = [
  [ 1, 0, 0, 4, 6, 7, 5], // +X
  [-1, 0, 0, 0, 1, 3, 2], // -X
  [ 0, 1, 0, 2, 3, 7, 6], // +Y
  [ 0,-1, 0, 0, 4, 5, 1], // -Y
  [ 0, 0, 1, 1, 5, 7, 3], // +Z
  [ 0, 0,-1, 0, 2, 6, 4], // -Z
];

/**
 * Write a transformed box into position/normal/index buffers.
 * pos: center position, quat: rotation, sx/sy/sz: scale (half-extents are size/2)
 */
function writeBox(
  positions: Float32Array, normals: Float32Array, indices: Uint32Array,
  vOffset: number, iOffset: number,
  cx: number, cy: number, cz: number,
  qx: number, qy: number, qz: number, qw: number,
  sx: number, sy: number, sz: number,
): void {
  // Transform each of 8 corners
  const transformed: number[] = new Array(24); // 8 corners × 3
  for (let c = 0; c < 8; c++) {
    // Scale corner
    let x = CORNERS[c][0] * sx;
    let y = CORNERS[c][1] * sy;
    let z = CORNERS[c][2] * sz;
    // Apply quaternion rotation (inline for speed)
    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;
    transformed[c * 3]     = ix * qw + iw * -qx + iy * -qz - iz * -qy + cx;
    transformed[c * 3 + 1] = iy * qw + iw * -qy + iz * -qx - ix * -qz + cy;
    transformed[c * 3 + 2] = iz * qw + iw * -qz + ix * -qy - iy * -qx + cz;
  }

  let vi = vOffset * 3;
  let ni = vOffset * 3;
  let ii = iOffset;

  for (let f = 0; f < 6; f++) {
    const face = FACES[f];
    // Rotate normal by quaternion
    let nx = face[0], ny = face[1], nz = face[2];
    const inx = qw * nx + qy * nz - qz * ny;
    const iny = qw * ny + qz * nx - qx * nz;
    const inz = qw * nz + qx * ny - qy * nx;
    const inw = -qx * nx - qy * ny - qz * nz;
    const rnx = inx * qw + inw * -qx + iny * -qz - inz * -qy;
    const rny = iny * qw + inw * -qy + inz * -qx - inx * -qz;
    const rnz = inz * qw + inw * -qz + inx * -qy - iny * -qx;

    const baseVert = vOffset + f * 4;
    for (let v = 0; v < 4; v++) {
      const ci = face[3 + v];
      positions[vi++] = transformed[ci * 3];
      positions[vi++] = transformed[ci * 3 + 1];
      positions[vi++] = transformed[ci * 3 + 2];
      normals[ni++] = rnx;
      normals[ni++] = rny;
      normals[ni++] = rnz;
    }
    // Two triangles: 0,1,2 and 0,2,3
    indices[ii++] = baseVert;
    indices[ii++] = baseVert + 1;
    indices[ii++] = baseVert + 2;
    indices[ii++] = baseVert;
    indices[ii++] = baseVert + 2;
    indices[ii++] = baseVert + 3;
  }
}

// ---- Spline builder ----
function buildSplinePoints(wps: RailwayWaypoint[]): Float32Array {
  const total = (wps.length - 1) * SUBDIV + 1;
  const arr = new Float32Array(total * 3);
  let idx = 0;
  for (let i = 0; i < wps.length - 1; i++) {
    for (let s = 0; s < SUBDIV; s++) {
      const t = s / SUBDIV;
      const x = wps[i].x + (wps[i + 1].x - wps[i].x) * t;
      const z = wps[i].z + (wps[i + 1].z - wps[i].z) * t;
      arr[idx++] = x;
      arr[idx++] = getRailGroundHeight(x, z) + TRACK_HEIGHT_OFFSET;
      arr[idx++] = z;
    }
  }
  const last = wps[wps.length - 1];
  arr[idx++] = last.x;
  arr[idx++] = getRailGroundHeight(last.x, last.z) + TRACK_HEIGHT_OFFSET;
  arr[idx++] = last.z;
  return arr;
}

// ---- Static geometry builder ----
interface TrackGeos {
  rails: THREE.BufferGeometry;
  sleepers: THREE.BufferGeometry;
  ballast: THREE.BufferGeometry;
}

const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _zero = new THREE.Vector3(0, 0, 0);
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _cross = new THREE.Vector3();

function buildDirectGeometry(wps: RailwayWaypoint[]): TrackGeos {
  const pts = buildSplinePoints(wps);
  const numPts = pts.length / 3;

  // Count segments and sleepers first
  let segCount = 0;
  for (let i = 0; i < numPts - 1; i++) {
    const i3 = i * 3, n3 = (i + 1) * 3;
    const dx = pts[n3] - pts[i3], dy = pts[n3 + 1] - pts[i3 + 1], dz = pts[n3 + 2] - pts[i3 + 2];
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) >= 0.01) segCount++;
  }

  // Count sleepers
  let sleeperCount = 0;
  let acc = 0, nextDist = 0;
  for (let i = 1; i < numPts; i++) {
    const i3 = i * 3, p3 = (i - 1) * 3;
    const dx = pts[i3] - pts[p3], dy = pts[i3 + 1] - pts[p3 + 1], dz = pts[i3 + 2] - pts[p3 + 2];
    const segLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (segLen < 0.01) { acc += segLen; continue; }
    while (nextDist <= acc + segLen) { sleeperCount++; nextDist += SLEEPER_SPACING; }
    acc += segLen;
  }

  // Allocate buffers — rails: 2 boxes per segment, ballast: 1 box per segment
  const railBoxes = segCount * 2;
  const ballastBoxes = segCount;

  const railPos = new Float32Array(railBoxes * VERTS_PER_BOX * 3);
  const railNor = new Float32Array(railBoxes * VERTS_PER_BOX * 3);
  const railIdx = new Uint32Array(railBoxes * INDICES_PER_BOX);

  const ballPos = new Float32Array(ballastBoxes * VERTS_PER_BOX * 3);
  const ballNor = new Float32Array(ballastBoxes * VERTS_PER_BOX * 3);
  const ballIdx = new Uint32Array(ballastBoxes * INDICES_PER_BOX);

  const slpPos = new Float32Array(sleeperCount * VERTS_PER_BOX * 3);
  const slpNor = new Float32Array(sleeperCount * VERTS_PER_BOX * 3);
  const slpIdx = new Uint32Array(sleeperCount * INDICES_PER_BOX);

  // Write rail and ballast segments
  let railBox = 0, ballBox = 0;
  for (let i = 0; i < numPts - 1; i++) {
    const i3 = i * 3, n3 = (i + 1) * 3;
    const dx = pts[n3] - pts[i3], dy = pts[n3 + 1] - pts[i3 + 1], dz = pts[n3 + 2] - pts[i3 + 2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.01) continue;

    const mx = (pts[i3] + pts[n3]) * 0.5;
    const my = (pts[i3 + 1] + pts[n3 + 1]) * 0.5;
    const mz = (pts[i3 + 2] + pts[n3 + 2]) * 0.5;

    _dir.set(dx / len, dy / len, dz / len);
    _cross.set(-_dir.z, 0, _dir.x);
    _m4.lookAt(_zero, _dir, _up);
    _q.setFromRotationMatrix(_m4);

    // Left rail
    writeBox(railPos, railNor, railIdx,
      railBox * VERTS_PER_BOX, railBox * INDICES_PER_BOX,
      mx + _cross.x * (GAUGE / 2), my + RAIL_Y_OFF, mz + _cross.z * (GAUGE / 2),
      _q.x, _q.y, _q.z, _q.w, 0.12, RAIL_H, len);
    railBox++;

    // Right rail
    writeBox(railPos, railNor, railIdx,
      railBox * VERTS_PER_BOX, railBox * INDICES_PER_BOX,
      mx - _cross.x * (GAUGE / 2), my + RAIL_Y_OFF, mz - _cross.z * (GAUGE / 2),
      _q.x, _q.y, _q.z, _q.w, 0.12, RAIL_H, len);
    railBox++;

    // Ballast
    writeBox(ballPos, ballNor, ballIdx,
      ballBox * VERTS_PER_BOX, ballBox * INDICES_PER_BOX,
      mx, my + BALLAST_H / 2, mz,
      _q.x, _q.y, _q.z, _q.w, 3.0, BALLAST_H, len);
    ballBox++;
  }

  // Write sleepers
  let slpBox = 0;
  acc = 0; nextDist = 0;
  for (let i = 1; i < numPts; i++) {
    const i3 = i * 3, p3 = (i - 1) * 3;
    const dx = pts[i3] - pts[p3], dy = pts[i3 + 1] - pts[p3 + 1], dz = pts[i3 + 2] - pts[p3 + 2];
    const segLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (segLen < 0.01) { acc += segLen; continue; }

    _dir.set(dx / segLen, dy / segLen, dz / segLen);
    _m4.lookAt(_zero, _dir, _up);
    _q.setFromRotationMatrix(_m4);

    while (nextDist <= acc + segLen && slpBox < sleeperCount) {
      const t = Math.max(0, Math.min(1, (nextDist - acc) / segLen));
      const sx = pts[p3] + dx * t;
      const sy = pts[p3 + 1] + dy * t + SLP_Y_OFF - TRACK_HEIGHT_OFFSET;
      const sz = pts[p3 + 2] + dz * t;

      writeBox(slpPos, slpNor, slpIdx,
        slpBox * VERTS_PER_BOX, slpBox * INDICES_PER_BOX,
        sx, sy, sz, _q.x, _q.y, _q.z, _q.w, 2.0, SLEEPER_H, 0.3);
      slpBox++;
      nextDist += SLEEPER_SPACING;
    }
    acc += segLen;
  }

  // Build BufferGeometry objects
  const rails = new THREE.BufferGeometry();
  rails.setAttribute('position', new THREE.BufferAttribute(railPos, 3));
  rails.setAttribute('normal', new THREE.BufferAttribute(railNor, 3));
  rails.setIndex(new THREE.BufferAttribute(railIdx, 1));

  const ballast = new THREE.BufferGeometry();
  ballast.setAttribute('position', new THREE.BufferAttribute(ballPos, 3));
  ballast.setAttribute('normal', new THREE.BufferAttribute(ballNor, 3));
  ballast.setIndex(new THREE.BufferAttribute(ballIdx, 1));

  const sleepers = new THREE.BufferGeometry();
  sleepers.setAttribute('position', new THREE.BufferAttribute(slpPos, 3));
  sleepers.setAttribute('normal', new THREE.BufferAttribute(slpNor, 3));
  sleepers.setIndex(new THREE.BufferAttribute(slpIdx, 1));

  const totalVerts = (railBox + ballBox + slpBox) * VERTS_PER_BOX;
  const totalBytes = (railPos.byteLength + railNor.byteLength + railIdx.byteLength +
    ballPos.byteLength + ballNor.byteLength + ballIdx.byteLength +
    slpPos.byteLength + slpNor.byteLength + slpIdx.byteLength);
  console.log(`[RailwayTrack] Direct geometry: ${segCount} segs, ${slpBox} sleepers, ${totalVerts} verts, ${(totalBytes / 1024).toFixed(0)} KB`);

  return { rails, sleepers, ballast };
}

const StaticTrackLine = memo(function StaticTrackLine({
  waypoints, name,
}: {
  waypoints: RailwayWaypoint[]; name: string;
}) {
  const geo = useMemo(() => buildDirectGeometry(waypoints), [waypoints]);

  return (
    <group name={`track-${name}`}>
      <mesh geometry={geo.rails} material={railMat} castShadow />
      <mesh geometry={geo.ballast} material={ballastMat} />
      <mesh geometry={geo.sleepers} material={sleeperMat} castShadow />
    </group>
  );
});

export const RailwayTrack = memo(function RailwayTrack() {
  return (
    <group name="railway-tracks">
      <StaticTrackLine waypoints={LINE_A_WAYPOINTS} name="line-A" />
      <StaticTrackLine waypoints={LINE_B_WAYPOINTS} name="line-B" />
    </group>
  );
});
