// ============================================================================
//  SHIP THUMBNAILS — offscreen studio render of each hull for menus/cards.
//  Uses the game renderer so imported GLB maps stay on the same WebGL context.
// ============================================================================
import * as THREE from '../../vendor/three/three.module.js';
import { makeShipMesh } from '../ship/models.js?v=ports4';

let _r = null, _scene = null, _cam = null, _env = null, _rig = null, _rt = null, _flip = null;
const _cache = new Map();
const TW = 640, TH = 300;
const _clearCol = new THREE.Color();

function studio() {
  if (_scene) return;
  _scene = new THREE.Scene();
  _cam = new THREE.PerspectiveCamera(32, TW / TH, 0.2, 400);

  _rig = new THREE.Group();
  const key = new THREE.DirectionalLight(0xfff1dc, 3.4); key.position.set(6, 8, 6);
  const fill = new THREE.DirectionalLight(0x9ecbff, 2.1); fill.position.set(-8, 2, 4);
  const rim = new THREE.DirectionalLight(0x8fd8ff, 2.8); rim.position.set(-3, 3, -9);
  const under = new THREE.DirectionalLight(0x3ec8ff, 1.1); under.position.set(0, -6, 2);
  _rig.add(key, fill, rim, under, new THREE.HemisphereLight(0x6a8ab8, 0x141824, 1.05));
  _scene.add(_rig);
}

function ensureEnv(renderer) {
  if (_env || !renderer) return;
  const pm = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(40, 24, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vN; void main(){
      float h = vN.y * 0.5 + 0.5;
      vec3 col = mix(vec3(0.02,0.025,0.04), vec3(0.22,0.28,0.4), smoothstep(0.1, 0.95, h));
      col += vec3(0.3,0.8,1.2) * pow(max(0.0, dot(vN, normalize(vec3(-0.6,0.4,0.6)))), 6.0);
      col += vec3(1.4,0.5,0.9) * pow(max(0.0, dot(vN, normalize(vec3(0.7,0.1,-0.5)))), 10.0) * 0.6;
      col += vec3(2.2,2.0,1.6) * pow(max(0.0, dot(vN, normalize(vec3(0.3,0.8,0.4)))), 30.0);
      gl_FragColor = vec4(col, 1.0); }`,
  }));
  env.add(dome);
  _env = pm.fromScene(env, 0.05).texture;
  pm.dispose(); dome.geometry.dispose(); dome.material.dispose();
  _scene.environment = _env;
}

function fallbackRenderer() {
  if (_r) return _r;
  _r = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: true });
  _r.setPixelRatio(1);
  _r.setSize(TW, TH, false);
  _r.toneMapping = THREE.ACESFilmicToneMapping;
  _r.toneMappingExposure = 1.2;
  _r.outputColorSpace = THREE.SRGBColorSpace;
  _r.setClearColor(0x000000, 0);
  return _r;
}

function grabFromTarget(renderer, rt) {
  const pixels = new Uint8Array(TW * TH * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, TW, TH, pixels);
  if (!_flip) _flip = document.createElement('canvas');
  _flip.width = TW;
  _flip.height = TH;
  const ctx = _flip.getContext('2d');
  const img = ctx.createImageData(TW, TH);
  const row = TW * 4;
  for (let y = 0; y < TH; y++) {
    img.data.set(pixels.subarray((TH - 1 - y) * row, (TH - y) * row), y * row);
  }
  ctx.putImageData(img, 0, 0);
  return _flip.toDataURL('image/png');
}

export function bustHeroThumbs() {
  _cache.clear();
}

export function shipThumbnail(def, opts = {}) {
  if (!def) return '';
  const api = window.ASTRALIS?._heroApi;
  const hq = !!api?.importedReady?.(def.id);
  const key = `${def.id}:${opts.angle ?? 'std'}:${hq ? 'hq' : 'lo'}`;
  if (_cache.has(key)) return _cache.get(key);
  try {
    studio();
    const gameR = window.ASTRALIS?.renderer;
    const renderer = gameR || fallbackRenderer();
    ensureEnv(renderer);
    if (!_rt && gameR) {
      _rt = new THREE.WebGLRenderTarget(TW, TH, { colorSpace: THREE.SRGBColorSpace });
    }
    const mesh = (hq && api.makeImportedMesh(def.id, 1)) || makeShipMesh(def, 1);
    mesh.traverse((o) => {
      if (o.isMesh && o.material && hq) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => { m.side = THREE.DoubleSide; m.needsUpdate = true; });
      }
    });
    _scene.add(mesh);
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 0.2) * 0.5;
    mesh.position.sub(center);
    const yaw = opts.yaw ?? -0.72, pitch = opts.pitch ?? 0.42;
    const dist = radius / Math.tan((_cam.fov * Math.PI / 180) / 2) * 1.35;
    _cam.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, -Math.cos(yaw) * Math.cos(pitch) * dist);
    _cam.lookAt(0, 0, 0);
    _cam.updateProjectionMatrix();

    let url = '';
    if (gameR && _rt) {
      const prevAlpha = renderer.getClearAlpha();
      renderer.getClearColor(_clearCol);
      const prevExp = renderer.toneMappingExposure;
      renderer.toneMappingExposure = 1.22;
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(_rt);
      renderer.clear();
      renderer.render(_scene, _cam);
      renderer.setRenderTarget(null);
      renderer.setClearColor(_clearCol, prevAlpha);
      renderer.toneMappingExposure = prevExp;
      url = grabFromTarget(renderer, _rt);
    } else {
      renderer.setClearColor(0x000000, 0);
      renderer.render(_scene, _cam);
      url = renderer.domElement.toDataURL('image/png');
    }

    _scene.remove(mesh);
    mesh.traverse((o) => {
      if (hq) {
        if (o.material) {
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach((m) => { if (!m.userData?.keepMaps) m.dispose(); });
        }
        return;
      }
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    _cache.set(key, url);
    return url;
  } catch (e) {
    console.warn('ship thumbnail failed', e);
    return '';
  }
}
