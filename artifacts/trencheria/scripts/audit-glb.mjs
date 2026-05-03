#!/usr/bin/env node
/**
 * GLB Audit Script — dev-only, read-only.
 *
 * Walks artifacts/trencheria/src/assets/*.glb and reports per-file:
 *   - file size, mesh count, skinned mesh count, vertex count
 *   - material/texture/image presence
 *   - bone count
 *   - animation names + durations
 *   - root-position tracks (translation tracks targeting root/hips/pelvis/armature)
 *   - scale tracks (any .scale tracks — these often cause popping)
 *   - empty clips, zero-duration clips, single-frame clips
 *
 * Output: human-readable report to stdout AND markdown report file at
 *   .local/glb_audit_report.md
 *
 * Pure Node, no deps — parses GLB binary format directly.
 *
 * Usage:  node artifacts/trencheria/scripts/audit-glb.mjs [assetsDir] [outFile]
 */

import { readFile, readdir, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ASSETS = resolve(__dirname, '..', 'src', 'assets');
const DEFAULT_REPORT = resolve(__dirname, '..', '..', '..', '.local', 'glb_audit_report.md');

const ROOT_NAME_RE = /(hips|pelvis|root|armature)/i;

const GLB_MAGIC = 0x46546c67; // "glTF" little-endian
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"

// ---------- GLB parsing ----------

function parseGLB(buf) {
  if (buf.length < 12) throw new Error('truncated header');
  const magic = buf.readUInt32LE(0);
  if (magic !== GLB_MAGIC) throw new Error(`bad magic 0x${magic.toString(16)}`);
  const version = buf.readUInt32LE(4);
  const totalLen = buf.readUInt32LE(8);
  if (version !== 2) throw new Error(`unsupported glTF version ${version}`);

  let offset = 12;
  let json = null;
  let bin = null;

  while (offset < totalLen && offset < buf.length) {
    if (offset + 8 > buf.length) break;
    const chunkLen = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkLen;
    if (dataEnd > buf.length) break;
    if (chunkType === CHUNK_JSON) {
      json = JSON.parse(buf.slice(dataStart, dataEnd).toString('utf8'));
    } else if (chunkType === CHUNK_BIN) {
      bin = buf.slice(dataStart, dataEnd);
    }
    offset = dataEnd;
  }
  if (!json) throw new Error('no JSON chunk');
  return { json, bin, totalLen };
}

// ---------- glTF analysis ----------

const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_ELEMENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function accessorCount(gltf, idx) {
  const a = gltf.accessors?.[idx];
  return a?.count ?? 0;
}

function accessorByteSize(gltf, idx) {
  const a = gltf.accessors?.[idx];
  if (!a) return 0;
  return (COMPONENT_BYTES[a.componentType] ?? 0) * (TYPE_ELEMENTS[a.type] ?? 0) * a.count;
}

function maxKeyframeTime(gltf, samplerInputAccessorIdx, bin) {
  const a = gltf.accessors?.[samplerInputAccessorIdx];
  if (!a) return 0;
  if (typeof a.max?.[0] === 'number') return a.max[0];
  // Fallback: try reading the last float from the bin chunk
  if (!bin) return 0;
  const bv = gltf.bufferViews?.[a.bufferView];
  if (!bv) return 0;
  if (a.componentType !== 5126 || a.type !== 'SCALAR') return 0;
  const offset = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0) + (a.count - 1) * 4;
  if (offset + 4 > bin.length) return 0;
  return bin.readFloatLE(offset);
}

function analyse(gltf, bin) {
  const meshes = gltf.meshes ?? [];
  const nodes = gltf.nodes ?? [];
  const skins = gltf.skins ?? [];
  const materials = gltf.materials ?? [];
  const textures = gltf.textures ?? [];
  const images = gltf.images ?? [];
  const animations = gltf.animations ?? [];

  // Vertex count: sum POSITION accessor.count over every primitive
  let vertexCount = 0;
  let primitiveCount = 0;
  for (const m of meshes) {
    for (const p of m.primitives ?? []) {
      primitiveCount++;
      const posIdx = p.attributes?.POSITION;
      if (typeof posIdx === 'number') vertexCount += accessorCount(gltf, posIdx);
    }
  }

  // Skinned mesh count = nodes with both mesh+skin refs
  const skinnedNodes = nodes.filter((n) => typeof n.mesh === 'number' && typeof n.skin === 'number');

  // Bone count = sum of joints across all skins (deduped per skin)
  const boneCount = skins.reduce((sum, s) => sum + (s.joints?.length ?? 0), 0);

  // Animations
  const animReports = animations.map((anim, idx) => {
    const channels = anim.channels ?? [];
    const samplers = anim.samplers ?? [];

    let duration = 0;
    let positionTracks = 0;
    let scaleTracks = 0;
    let rotationTracks = 0;
    let weightTracks = 0;
    let rootPositionTracks = 0;
    let rootScaleTracks = 0;

    for (const ch of channels) {
      const path = ch.target?.path;
      const targetNodeIdx = ch.target?.node;
      const targetNode = typeof targetNodeIdx === 'number' ? nodes[targetNodeIdx] : null;
      const targetName = targetNode?.name ?? '';
      const isRoot = ROOT_NAME_RE.test(targetName);
      if (path === 'translation') {
        positionTracks++;
        if (isRoot) rootPositionTracks++;
      } else if (path === 'scale') {
        scaleTracks++;
        if (isRoot) rootScaleTracks++;
      } else if (path === 'rotation') {
        rotationTracks++;
      } else if (path === 'weights') {
        weightTracks++;
      }
      const samp = samplers[ch.sampler];
      if (samp) {
        const t = maxKeyframeTime(gltf, samp.input, bin);
        if (t > duration) duration = t;
      }
    }

    return {
      index: idx,
      name: anim.name ?? `(unnamed_${idx})`,
      channels: channels.length,
      samplers: samplers.length,
      duration: Number(duration.toFixed(3)),
      positionTracks,
      scaleTracks,
      rotationTracks,
      weightTracks,
      rootPositionTracks,
      rootScaleTracks,
      empty: channels.length === 0,
      zeroDuration: duration <= 0,
    };
  });

  return {
    asset: gltf.asset ?? {},
    meshCount: meshes.length,
    primitiveCount,
    skinnedMeshCount: skinnedNodes.length,
    vertexCount,
    nodeCount: nodes.length,
    boneCount,
    materialCount: materials.length,
    textureCount: textures.length,
    imageCount: images.length,
    animations: animReports,
  };
}

// ---------- Per-file audit ----------

function suspicions(report) {
  const flags = [];
  if (report.animations.length === 0) flags.push('NO_ANIMATIONS');
  for (const a of report.animations) {
    if (a.empty) flags.push(`EMPTY_CLIP:${a.name}`);
    if (a.zeroDuration && !a.empty) flags.push(`ZERO_DURATION:${a.name}`);
    if (a.duration > 0 && a.duration < 0.05) flags.push(`SUB_50MS_CLIP:${a.name}(${a.duration}s)`);
    if (a.rootPositionTracks > 0) flags.push(`ROOT_TRANSLATION:${a.name}(x${a.rootPositionTracks})`);
    if (a.rootScaleTracks > 0) flags.push(`ROOT_SCALE:${a.name}(x${a.rootScaleTracks})`);
    if (a.scaleTracks > 0 && a.rootScaleTracks === 0) flags.push(`NON_ROOT_SCALE:${a.name}(x${a.scaleTracks})`);
  }
  if (report.skinnedMeshCount === 0 && report.meshCount > 0 && report.boneCount > 0) {
    flags.push('SKIN_BUT_NO_SKINNED_MESH');
  }
  if (report.meshCount > 1) flags.push(`MULTI_MESH(${report.meshCount})`);
  if (report.materialCount === 0) flags.push('NO_MATERIALS');
  if (report.textureCount === 0 && report.materialCount > 0) flags.push('NO_TEXTURES');
  return flags;
}

async function auditFile(path) {
  const st = await stat(path);
  const buf = await readFile(path);
  const { json, bin } = parseGLB(buf);
  const r = analyse(json, bin);
  return { path, sizeBytes: st.size, ...r, flags: suspicions(r) };
}

// ---------- Reporting ----------

function fmtBytes(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(2)}MB`;
}

function renderMarkdown(audits) {
  const lines = [];
  lines.push('# Trencheria GLB Audit Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Files scanned: ${audits.length}`);
  const totalBytes = audits.reduce((s, a) => s + a.sizeBytes, 0);
  const totalVerts = audits.reduce((s, a) => s + a.vertexCount, 0);
  lines.push(`Total size: ${fmtBytes(totalBytes)}, total vertices: ${totalVerts.toLocaleString()}`);
  lines.push('');

  // Summary table
  lines.push('## Summary table');
  lines.push('');
  lines.push('| File | Size | Meshes | Skinned | Verts | Bones | Mats | Tex | Anims | Flags |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---|');
  for (const a of audits) {
    const flag = a.flags.length ? `⚠️ ${a.flags.length}` : 'ok';
    lines.push(
      `| \`${basename(a.path)}\` | ${fmtBytes(a.sizeBytes)} | ${a.meshCount} | ${a.skinnedMeshCount} | ${a.vertexCount} | ${a.boneCount} | ${a.materialCount} | ${a.textureCount} | ${a.animations.length} | ${flag} |`,
    );
  }
  lines.push('');

  // Flags overview
  const flagged = audits.filter((a) => a.flags.length > 0);
  lines.push(`## Suspicious files (${flagged.length})`);
  lines.push('');
  if (flagged.length === 0) {
    lines.push('_None._');
  } else {
    for (const a of flagged) {
      lines.push(`### \`${basename(a.path)}\``);
      for (const f of a.flags) lines.push(`- ${f}`);
      lines.push('');
    }
  }

  // Per-file animation detail
  lines.push('## Per-file animation detail');
  lines.push('');
  for (const a of audits) {
    lines.push(`### \`${basename(a.path)}\` — ${fmtBytes(a.sizeBytes)}`);
    lines.push('');
    lines.push(
      `meshes=${a.meshCount} (skinned=${a.skinnedMeshCount}) primitives=${a.primitiveCount} verts=${a.vertexCount} nodes=${a.nodeCount} bones=${a.boneCount} mats=${a.materialCount} tex=${a.textureCount} img=${a.imageCount}`,
    );
    if (a.animations.length === 0) {
      lines.push('_no animations_');
    } else {
      lines.push('');
      lines.push('| # | Name | Dur(s) | Channels | Pos | RootPos | Scale | RootScale | Rot |');
      lines.push('|---:|---|---:|---:|---:|---:|---:|---:|---:|');
      for (const c of a.animations) {
        lines.push(
          `| ${c.index} | \`${c.name}\` | ${c.duration} | ${c.channels} | ${c.positionTracks} | ${c.rootPositionTracks} | ${c.scaleTracks} | ${c.rootScaleTracks} | ${c.rotationTracks} |`,
        );
      }
    }
    if (a.flags.length) {
      lines.push('');
      lines.push('**Flags:** ' + a.flags.map((f) => `\`${f}\``).join(', '));
    }
    lines.push('');
  }

  // Aggregate "what to fix" hints
  lines.push('## Aggregate hints');
  lines.push('');
  const filesWithRootPos = audits.filter((a) => a.animations.some((c) => c.rootPositionTracks > 0));
  const filesWithRootScale = audits.filter((a) => a.animations.some((c) => c.rootScaleTracks > 0));
  const filesWithAnyScale = audits.filter((a) => a.animations.some((c) => c.scaleTracks > 0));
  const filesWithEmpty = audits.filter((a) => a.animations.some((c) => c.empty));
  lines.push(`- Files with **root-translation tracks** (will slide if not stripped): ${filesWithRootPos.length}`);
  for (const f of filesWithRootPos) lines.push(`  - \`${basename(f.path)}\``);
  lines.push(`- Files with **root-scale tracks** (will pop if not stripped): ${filesWithRootScale.length}`);
  for (const f of filesWithRootScale) lines.push(`  - \`${basename(f.path)}\``);
  lines.push(`- Files with **any scale tracks** (review for popping): ${filesWithAnyScale.length}`);
  lines.push(`- Files with **empty clips**: ${filesWithEmpty.length}`);
  for (const f of filesWithEmpty) lines.push(`  - \`${basename(f.path)}\``);
  lines.push('');
  return lines.join('\n');
}

// ---------- Main ----------

async function main() {
  const assetsDir = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_ASSETS;
  const outFile = process.argv[3] ? resolve(process.argv[3]) : DEFAULT_REPORT;

  const entries = await readdir(assetsDir);
  const glbs = entries.filter((n) => n.toLowerCase().endsWith('.glb')).sort();
  if (glbs.length === 0) {
    console.error(`No GLB files in ${assetsDir}`);
    process.exit(1);
  }

  const audits = [];
  for (const name of glbs) {
    const p = join(assetsDir, name);
    try {
      audits.push(await auditFile(p));
    } catch (err) {
      audits.push({
        path: p,
        sizeBytes: 0,
        meshCount: 0,
        primitiveCount: 0,
        skinnedMeshCount: 0,
        vertexCount: 0,
        nodeCount: 0,
        boneCount: 0,
        materialCount: 0,
        textureCount: 0,
        imageCount: 0,
        animations: [],
        flags: [`PARSE_ERROR:${err.message}`],
      });
    }
  }

  const md = renderMarkdown(audits);
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, md, 'utf8');

  // Console summary
  console.log(`Audited ${audits.length} GLB files. Report: ${outFile}`);
  const flagged = audits.filter((a) => a.flags.length > 0);
  console.log(`Suspicious: ${flagged.length}`);
  for (const a of flagged) {
    console.log(`  ${basename(a.path)}: ${a.flags.join(', ')}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
