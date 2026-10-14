// Imported flyable hulls. Dynamic-imported after renderer exists. Not on the boot graph.

import * as THREE from '../../vendor/three/three.module.js';
import { GLTFLoader } from '../../vendor/three/addons/loaders/GLTFLoader.js';
import { createGlowSprite } from '../world/materials.js?v=choir3';

export const IMPORT_SPECS = {
  aurora: { id: 'aurora', url: 'models/aurora-flight.glb?v=fix1', len: 10.3, glow: '#3ec8ff', engines: 4 },
};

const _pack = Object.create(null);
const _pending = Object.create(null);

export function importedIds() {
  return Object.keys(IMPORT_SPECS);
}

export function importedReady(id) {
  return !!_pack[id]?.root;
}

export function heroReady() {
  return importedReady('aurora');
}

export async function preloadHero(url = IMPORT_SPECS.aurora.url) {
  if (url !== IMPORT_SPECS.aurora.url) IMPORT_SPECS.aurora.url = url;
  return preloadImported('aurora');
}

export async function preloadImported(id) {
  const spec = IMPORT_SPECS[id];
  if (!spec) return null;
  if (_pack[id]) return _pack[id].root;
  if (_pending[id]) return _pending[id];
  _pending[id] = loadImported(spec).then((root) => {
    return _pack[id]?.root || root;
  }).catch((err) => {
    delete _pending[id];
    console.warn(`[hero] ${id} GLB skipped`, err);
    return null;
  });
  return _pending[id];
}

export async function preloadAllImported() {
  await Promise.all(importedIds().map((id) => preloadImported(id)));
}

async function loadImported(spec) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(spec.url);
  sanitizeTree(gltf.scene);
  const fitted = fitImported(gltf.scene, spec);
  _pack[spec.id] = fitted;
  return fitted.root;
}

function sanitizeTree(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = true;
    o.castShadow = false;
    o.receiveShadow = false;
    const src = o.material;
    if (!src) return;
    o.material = Array.isArray(src) ? src.map((m) => toStandard(m)) : toStandard(src);
  });
}

function toStandard(mat) {
  if (!mat) return mat;
  const mapped = !!(mat.map || mat.metalnessMap || mat.roughnessMap || mat.normalMap);
  const metal = mapped ? 1 : (Number.isFinite(mat.metalness) ? mat.metalness : 0.42);
  const rough = mapped ? (Number.isFinite(mat.roughness) ? mat.roughness : 1) : Math.max(mat.roughness ?? 0.4, 0.28);
  const col = mapped ? new THREE.Color(1, 1, 1) : (mat.color ? mat.color.clone() : new THREE.Color(0xc4b49a));
  if (mat.map && mat.map.colorSpace == null) mat.map.colorSpace = THREE.SRGBColorSpace;
  if (!mat.isMeshPhysicalMaterial && !mat.isMeshBasicMaterial && mat.isMeshStandardMaterial) {
    if (mapped) mat.color.set(1, 1, 1);
    mat.emissive?.setRGB(0, 0, 0);
    mat.emissiveIntensity = 0;
    mat.transparent = false;
    mat.opacity = 1;
    mat.side = THREE.FrontSide;
    mat.depthWrite = true;
    mat.envMapIntensity = 1;
    mat.roughness = rough;
    mat.metalness = metal;
    mat.toneMapped = true;
    mat.userData.keepMaps = true;
    mat.needsUpdate = true;
    return mat;
  }
  const std = new THREE.MeshStandardMaterial({
    color: col,
    map: mat.map || null,
    normalMap: mat.normalMap || null,
    metalnessMap: mat.metalnessMap || null,
    roughnessMap: mat.roughnessMap || mat.metalnessMap || null,
    metalness: metal,
    roughness: rough,
    envMapIntensity: 1,
    emissive: 0x000000,
    emissiveIntensity: 0,
    transparent: false,
    opacity: 1,
    side: THREE.FrontSide,
    toneMapped: true,
    flatShading: false,
    depthWrite: true,
  });
  if (mat.normalScale && std.normalScale) std.normalScale.copy(mat.normalScale);
  std.userData.keepMaps = true;
  mat.dispose();
  return std;
}

function fitImported(scene, spec) {
  const root = scene.clone(true);
  root.rotation.y = Math.PI / 2;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  const m = new THREE.Matrix4();
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    o.geometry = o.geometry.clone();
    m.copy(o.matrixWorld);
    o.geometry.applyMatrix4(m);
    o.position.set(0, 0, 0);
    o.rotation.set(0, 0, 0);
    o.scale.set(1, 1, 1);
    o.matrix.identity();
    o.matrixWorld.identity();
  });
  root.rotation.set(0, 0, 0);
  root.position.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  box.getCenter(center);
  box.getSize(size);
  const len = Math.max(size.x, size.z, 0.01);
  const s = spec.len / len;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    o.geometry.translate(-center.x, -center.y, -center.z);
    o.geometry.scale(s, s, s);
    o.geometry.computeBoundingBox();
    o.geometry.computeBoundingSphere();
  });
  box.setFromObject(root);
  box.getSize(size);
  const min = box.min, max = box.max;
  const k = spec.engines || 2;
  const engines = findAftPorts(root, box, k) || fallbackEngines(min, max, size, k);
  const y = (min.y + max.y) * 0.5;
  const ng = spec.guns || 2;
  const guns = ng <= 2
    ? [
      [-size.x * 0.1, y * 0.12, min.z * 0.88],
      [size.x * 0.1, y * 0.12, min.z * 0.88],
    ]
    : [
      [-size.x * 0.38, y * 0.08, min.z * 0.55],
      [size.x * 0.38, y * 0.08, min.z * 0.55],
      [-size.x * 0.12, y * 0.02, min.z * 0.9],
      [size.x * 0.12, y * 0.02, min.z * 0.9],
    ];
  const layout = {
    length: spec.len,
    glow: spec.glow,
    importId: spec.id,
    engines,
    guns,
    gear: [
      { x: 0, y: min.y + 0.04, z: min.z * 0.38, len: 1.05, dual: false, splay: 0, fold: 1.28 },
      { x: -size.x * 0.16, y: min.y + 0.04, z: max.z * 0.08, len: 1.18, dual: true, splay: -0.18, fold: -1.42 },
      { x: size.x * 0.16, y: min.y + 0.04, z: max.z * 0.08, len: 1.18, dual: true, splay: 0.18, fold: -1.42 },
    ],
  };
  stamp(root, layout);
  return { root, layout, spec };
}

function fallbackEngines(min, max, size, k = 4) {
  const y = min.y + size.y * 0.42;
  const z = max.z * 0.98;
  if (k <= 2) {
    return [
      [-size.x * 0.18, y, z],
      [size.x * 0.18, y, z],
    ];
  }
  return [
    [-size.x * 0.42, y, z],
    [-size.x * 0.13, y, z],
    [size.x * 0.13, y, z],
    [size.x * 0.42, y, z],
  ];
}

function findAftPorts(root, box, k = 4) {
  const spanZ = box.max.z - box.min.z;
  const zCut = box.max.z - spanZ * 0.11;
  const pts = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const p = o.geometry.attributes.position;
    const step = Math.max(1, (p.count / 8000) | 0);
    for (let i = 0; i < p.count; i += step) {
      const z = p.getZ(i);
      if (z < zCut) continue;
      pts.push([p.getX(i), p.getY(i), z]);
    }
  });
  if (pts.length < 24 * k) return null;
  const xs = pts.map((p) => p[0]).sort((a, b) => a - b);
  let cents = [];
  for (let i = 0; i < k; i++) cents.push(xs[(((i + 0.5) / k) * (xs.length - 1)) | 0]);
  let buckets = [];
  for (let iter = 0; iter < 10; iter++) {
    buckets = Array.from({ length: k }, () => []);
    for (const p of pts) {
      let bi = 0, bd = 1e9;
      for (let i = 0; i < k; i++) {
        const d = Math.abs(p[0] - cents[i]);
        if (d < bd) { bd = d; bi = i; }
      }
      buckets[bi].push(p);
    }
    cents = buckets.map((b, i) => {
      if (!b.length) return cents[i];
      let x = 0;
      for (const p of b) x += p[0];
      return x / b.length;
    });
  }
  const ports = [];
  for (const b of buckets) {
    if (b.length < 6) continue;
    b.sort((a, c) => c[2] - a[2]);
    const top = b.slice(0, Math.max(8, (b.length * 0.2) | 0));
    let x = 0, y = 0, z = 0;
    for (const p of top) { x += p[0]; y += p[1]; z += p[2]; }
    const n = top.length;
    ports.push([x / n, y / n, z / n + 0.04]);
  }
  if (ports.length < k) return null;
  ports.sort((a, b) => a[0] - b[0]);
  return ports;
}

function stamp(root, layout) {
  root.userData.enginePos = layout.engines;
  root.userData.guns = layout.guns;
  root.userData.gear = layout.gear;
  root.userData.length = layout.length;
  root.userData.hero = true;
  root.userData.importId = layout.importId;
}

function attachNitro(root, engines, hex = '#3ec8ff') {
  const col = new THREE.Color(hex);
  const boost = new THREE.Color('#ffc878');
  const xs = engines.map((e) => Math.abs(e[0])).sort((a, b) => a - b);
  const innerCut = xs.length >= 4 ? (xs[1] + xs[2]) * 0.5 : 1e9;
  for (const e of engines) {
    const inner = engines.length <= 2 || Math.abs(e[0]) <= innerCut + 0.01;
    const r = inner ? (engines.length <= 2 ? 0.26 : 0.19) : 0.115;
    const g = new THREE.Group();
    g.position.set(e[0], e[1], e[2]);

    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x03080c, emissive: col.clone(), emissiveIntensity: 1.8,
      roughness: 1, metalness: 0, toneMapped: false,
    });
    const core = new THREE.Mesh(new THREE.CircleGeometry(r * 0.72, 16), coreMat);
    core.rotation.x = Math.PI;
    core.position.z = 0.02;

    const coneMat = new THREE.MeshBasicMaterial({
      color: col.clone(), transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false,
    });
    const coneH = inner ? (engines.length <= 2 ? 1.35 : 1.05) : 0.72;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r * 0.95, coneH, 14, 1, true), coneMat);
    cone.rotation.x = Math.PI / 2;
    cone.position.z = coneH * 0.55;

    const flameMat = new THREE.MeshBasicMaterial({
      color: boost.clone(), transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false,
    });
    const flameH = inner ? (engines.length <= 2 ? 1.9 : 1.55) : 1.05;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(r * 0.48, flameH, 10, 1, true), flameMat);
    flame.rotation.x = Math.PI / 2;
    flame.position.z = flameH * 0.52;

    const sprite = createGlowSprite(hex, inner ? (engines.length <= 2 ? 1.45 : 1.15) : 0.72, 0.4, 3.4);
    sprite.position.z = 0.06;
    sprite.userData.nitroSprite = true;

    g.add(core, cone, flame, sprite);
    g.userData.nitroRig = { cone, flame, core, sprite, col, boost, inner };
    root.add(g);
  }
}

export function makeImportedMesh(id, scale = 1) {
  const pack = _pack[id];
  if (!pack) return null;
  const g = new THREE.Group();
  pack.root.traverse((o) => {
    if (!o.isMesh) return;
    const mesh = new THREE.Mesh(o.geometry, keep(o.material.clone()));
    mesh.frustumCulled = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    g.add(mesh);
  });
  attachNitro(g, pack.layout.engines, pack.spec.glow);
  g.scale.setScalar(scale);
  stamp(g, pack.layout);
  return g;
}

export function makeHeroMesh(scale = 1) {
  return makeImportedMesh('aurora', scale);
}

function keep(mat) {
  mat.userData.keepMaps = true;
  return mat;
}
