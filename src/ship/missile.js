// Seeker missile hull — imported GLB, fitted tiny vs Aurora (~1.15 world units).

import * as THREE from '../../vendor/three/three.module.js';
import { GLTFLoader } from '../../vendor/three/addons/loaders/GLTFLoader.js';
import { createGlowSprite } from '../world/materials.js?v=choir3';

const URL = 'models/seeker.glb?v=msk4';
/** World length of the live seeker. Aurora is ~14 — ~1/3.5 so soft-launch reads on trailer cams. */
export const SEEKER_LEN = 4.0;

let _root = null;
let _pending = null;

export function seekerReady() {
  return !!_root;
}

export async function preloadSeeker() {
  if (_root) return _root;
  if (_pending) return _pending;
  _pending = loadSeeker().then((r) => {
    _root = r;
    return r;
  }).catch((err) => {
    _pending = null;
    console.warn('[seeker] GLB skipped', err);
    return null;
  });
  return _pending;
}

async function loadSeeker() {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(URL);
  const scene = gltf.scene;
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = true;
    o.castShadow = false;
    o.receiveShadow = false;
    const src = o.material;
    if (!src) return;
    o.material = Array.isArray(src) ? src.map((m) => toStandard(m)) : toStandard(src);
  });

  // Bake into a clean group, tip toward local -Z (ship forward).
  const raw = new THREE.Group();
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const mesh = new THREE.Mesh(o.geometry.clone(), o.material);
    mesh.geometry.applyMatrix4(o.matrixWorld);
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    raw.add(mesh);
  });

  let box = new THREE.Box3().setFromObject(raw);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  raw.position.sub(center);

  // Longest axis → Z, then flip so nose points -Z.
  const axes = [
    { a: 'x', v: size.x },
    { a: 'y', v: size.y },
    { a: 'z', v: size.z },
  ].sort((a, b) => b.v - a.v);
  if (axes[0].a === 'x') raw.rotation.y = Math.PI / 2;
  else if (axes[0].a === 'y') raw.rotation.x = -Math.PI / 2;
  raw.updateMatrixWorld(true);

  const baked = new THREE.Group();
  raw.updateMatrixWorld(true);
  raw.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    baked.add(new THREE.Mesh(g, o.material));
  });
  box = new THREE.Box3().setFromObject(baked);
  box.getSize(size);
  box.getCenter(center);
  baked.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.translate(-center.x, -center.y, -center.z);
  });
  // Nose toward -Z: if max.z is larger in magnitude tip, flip 180°.
  box = new THREE.Box3().setFromObject(baked);
  if (Math.abs(box.max.z) > Math.abs(box.min.z)) baked.rotation.y = Math.PI;
  baked.updateMatrixWorld(true);

  const final = new THREE.Group();
  baked.updateMatrixWorld(true);
  baked.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    final.add(new THREE.Mesh(g, o.material));
  });
  box = new THREE.Box3().setFromObject(final);
  box.getSize(size);
  const len = Math.max(size.x, size.y, size.z, 0.01);
  const s = SEEKER_LEN / len;
  final.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.scale(s, s, s);
    o.geometry.computeBoundingBox();
    o.geometry.computeBoundingSphere();
  });

  const glow = createGlowSprite('#ff9a40', 0.85, 0.55, 3.4);
  glow.position.z = SEEKER_LEN * 0.48;
  final.add(glow);
  final.userData.length = SEEKER_LEN;
  final.userData.seeker = true;
  return final;
}

function toStandard(mat) {
  if (!mat) return mat;
  if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
    mat.transparent = false;
    mat.opacity = 1;
    mat.side = THREE.FrontSide;
    mat.depthWrite = true;
    if (mat.map && mat.map.colorSpace == null) mat.map.colorSpace = THREE.SRGBColorSpace;
    return mat;
  }
  const std = new THREE.MeshStandardMaterial({
    color: mat.color ? mat.color.clone() : new THREE.Color(0xc8c4bc),
    map: mat.map || null,
    metalness: 0.55,
    roughness: 0.42,
    emissive: 0x000000,
    side: THREE.FrontSide,
    depthWrite: true,
  });
  if (mat.map && mat.map.colorSpace == null) mat.map.colorSpace = THREE.SRGBColorSpace;
  mat.dispose?.();
  return std;
}

export function makeSeekerMesh() {
  if (!_root) return null;
  const g = new THREE.Group();
  _root.traverse((o) => {
    if (!o.isMesh) return;
    const mesh = new THREE.Mesh(o.geometry, o.material.clone());
    mesh.frustumCulled = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    g.add(mesh);
  });
  const glow = createGlowSprite('#ff9a40', 0.85, 0.55, 3.4);
  glow.position.z = SEEKER_LEN * 0.48;
  g.add(glow);
  g.userData.length = SEEKER_LEN;
  g.userData.seeker = true;
  return g;
}
