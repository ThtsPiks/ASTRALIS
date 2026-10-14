// ============================================================================
//  PLANET THUMBNAILS — one studio render per world type, same shaders as flight.
// ============================================================================
import * as THREE from '../../vendor/three/three.module.js';
import { createPlanetMaterial, createAtmosphereMaterial, createCloudMaterial, createRingGeometry, createRingMaterial } from '../world/materials.js?v=chart1';
import { PLANET_TYPES } from '../world/galaxy.js?v=chart1';

const SIZE = 320;
const SEEDS = { rocky: 41021, barren: 88213, terra: 51277, ocean: 23981, marsh: 62841, desert: 71423, rust: 39017, ice: 33107, salt: 55209, toxic: 61339, carbon: 17401, ash: 80443, lava: 90127, gas: 12011, icegiant: 45073, exotic: 77719 };
const CLOUDS = { terra: 0.46, ocean: 0.55, marsh: 0.7, toxic: 0.72, lava: 0.12, ash: 0.1, desert: 0.06, ice: 0.1, rocky: 0.04, rust: 0.05 };
const CLOUD_COL = { toxic: '#d9f07a', lava: '#ff9a5c', ash: '#ffb080', marsh: '#d6f0a0' };
let _scene = null, _cam = null, _rt = null, _own = null, _flip = null;
const _cache = new Map();
const _geo = new THREE.SphereGeometry(1, 128, 96);
const _star = new THREE.Vector3(-60, 34, 70);
const _clear = new THREE.Color();

function studio() {
  if (_scene) return;
  _scene = new THREE.Scene();
  _cam = new THREE.PerspectiveCamera(28, 1, 0.1, 400);
}

function renderer() {
  const gameR = window.ASTRALIS?.renderer;
  if (gameR) return gameR;
  if (!_own) {
    _own = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    _own.setPixelRatio(1);
    _own.setSize(SIZE, SIZE, false);
    _own.outputColorSpace = THREE.SRGBColorSpace;
  }
  return _own;
}

function studioPlanet(type, src) {
  const def = PLANET_TYPES[type] || PLANET_TYPES.rocky;
  const giant = type === 'gas' || type === 'icegiant';
  const seed = src?.seed || SEEDS[type] || 1234;
  return {
    type,
    colors: src?.colors?.length ? [...src.colors] : [...def.colors],
    seed,
    cloudSeed: src?.cloudSeed || seed * 3,
    radius: src?.radius || (giant ? 200 : 70),
    atmo: src ? (src.atmo ? { ...src.atmo } : null) : (def.atmo ? { ...def.atmo } : null),
    clouds: src ? (src.clouds || 0) : (CLOUDS[type] || 0),
    cloudColor: src?.cloudColor || CLOUD_COL[type] || '#ffffff',
    hasLife: src ? !!src.hasLife : type === 'terra',
    rings: src?.rings || null,
  };
}

function ringSpec(p) {
  if (p.rings && p.radius) {
    const s = 1 / p.radius;
    return {
      inner: Math.min(1.6, Math.max(1.25, p.rings.inner * s)),
      outer: Math.min(2.25, Math.max(1.85, p.rings.outer * s)),
      density: p.rings.density ?? 0.7,
      seed: p.rings.seed || p.seed,
      gaps: p.rings.gaps || 2,
      color: p.rings.color || '#e6d2a8',
      tilt: p.rings.tilt || 0.4,
    };
  }
  if (p.type === 'gas' || p.type === 'icegiant') {
    return {
      inner: 1.42, outer: 2.2, density: 0.62, seed: p.seed, gaps: p.type === 'gas' ? 3 : 1,
      color: p.type === 'icegiant' ? '#c5e6ff' : '#e8d2a4', tilt: 0.42,
    };
  }
  return null;
}

function grab(r) {
  const px = new Uint8Array(SIZE * SIZE * 4);
  r.readRenderTargetPixels(_rt, 0, 0, SIZE, SIZE, px);
  if (!_flip) _flip = document.createElement('canvas');
  _flip.width = SIZE;
  _flip.height = SIZE;
  const ctx = _flip.getContext('2d');
  const img = ctx.createImageData(SIZE, SIZE);
  const row = SIZE * 4;
  for (let y = 0; y < SIZE; y++) img.data.set(px.subarray((SIZE - 1 - y) * row, (SIZE - y) * row), y * row);
  ctx.putImageData(img, 0, 0);
  return _flip.toDataURL('image/png');
}

export function planetThumbnail(type, src = null) {
  const key = src ? `${type}:${src.seed || 0}:${src.rings ? 1 : 0}:${src.hasLife ? 1 : 0}` : type;
  if (_cache.has(key)) return _cache.get(key);
  let url = '';
  const made = [];
  try {
    studio();
    const r = renderer();
    const p = studioPlanet(type, src);
    const group = new THREE.Group();
    const setLight = (mat) => {
      const u = mat.uniforms;
      if (u.uStarPos) u.uStarPos.value.copy(_star);
      if (u.uCamPos) u.uCamPos.value.copy(_cam.position);
      if (u.uStarIntensity) u.uStarIntensity.value = 1.45;
      if (u.uStarTint) u.uStarTint.value.set(0xffffff);
      if (u.uTime) u.uTime.value = 12;
    };
    const ring = ringSpec(p);
    const frame = ring ? 2.1 : 1.28;
    const dist = frame / Math.tan((_cam.fov * Math.PI / 180) / 2);
    _cam.position.set(0, ring ? dist * 0.32 : 0.18, ring ? dist * 0.95 : dist);
    _cam.lookAt(0, 0, 0);
    _cam.updateProjectionMatrix();

    const body = new THREE.Mesh(_geo, createPlanetMaterial(p, { displace: false }));
    const yaw = ((p.seed % 628) / 100) - 1.2;
    body.rotation.set(0.18 + (p.seed % 9) * 0.03, yaw, 0.08);
    group.add(body);
    made.push(body.material);
    if (p.clouds > 0.04) {
      const clouds = new THREE.Mesh(_geo, createCloudMaterial(p));
      clouds.scale.setScalar(1.017);
      clouds.rotation.copy(body.rotation);
      group.add(clouds);
      made.push(clouds.material);
    }
    if (p.atmo) {
      const atmo = new THREE.Mesh(_geo, createAtmosphereMaterial(p));
      atmo.scale.setScalar(1 + p.atmo.height * 3.2);
      atmo.renderOrder = 2;
      group.add(atmo);
      made.push(atmo.material);
    }
    if (ring) {
      const rings = { inner: ring.inner, outer: ring.outer, density: ring.density, seed: ring.seed, gaps: ring.gaps, color: ring.color };
      const geo = createRingGeometry(rings.inner, rings.outer, 180);
      const mat = createRingMaterial(rings, 1);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.z = ring.tilt;
      mesh.renderOrder = 1;
      group.add(mesh);
      made.push(mat, geo);
    }
    for (const m of made) if (m.uniforms) setLight(m);
    _scene.add(group);

    if (!_rt) _rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { colorSpace: THREE.SRGBColorSpace, samples: 4 });
    const prevTarget = r.getRenderTarget();
    const prevAlpha = r.getClearAlpha();
    r.getClearColor(_clear);
    r.setRenderTarget(_rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(_scene, _cam);
    r.setRenderTarget(prevTarget);
    r.setClearColor(_clear, prevAlpha);
    url = grab(r);
    _scene.remove(group);
  } catch (err) {
    console.warn('planet thumbnail failed', type, err);
    url = '';
  }
  for (const m of made) m.dispose?.();
    if (url) _cache.set(key, url);
  return url;
}
