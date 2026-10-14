// ============================================================================
//  PLANET SURFACE — infinite heightfield, streamed chunks, typed worlds
// ============================================================================
import * as THREE from '../../vendor/three/three.module.js';
import { RNG, Simplex, hashInt, fbm, ridged } from '../core/rng.js';
import { clamp } from '../core/utils.js';
import { makeGlowTexture } from './materials.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _eul = new THREE.Euler();

const CHUNK = 2200;
const VIEW_R = 3;          // 7×7 tiles → ~7.7 km to the rim (camera.far 8200)
const SEGS = 48;
const POI_CELL = 2800;
const SCATTER_R = 3400;
const SCATTER_CELL = 170;

function cellUnit(seed, ix, iz, salt) {
  return hashInt(seed ^ salt ^ hashInt(ix * 73856093 + iz * 19349663 + salt)) / 4294967296;
}

function surfDist(d) {
  d = Math.abs(d);
  if (d < 1000) return `${Math.round(d)} m`;
  return `${(d / 1000).toFixed(1)} km`;
}

export class PlanetSurface {
  constructor(scene, planet, seed = 1, star = null) {
    this.scene = scene;
    this.planet = planet;
    this.star = star;
    this.seed = ((seed % 99991) + 17) >>> 0;
    this.rng = new RNG(this.seed);
    this.simplex = new Simplex(this.seed);
    this.group = new THREE.Group();
    this.group.name = 'planetSurface';
    scene.add(this.group);

    this.type = planet?.type || 'rocky';
    this.gas = this.type === 'gas' || this.type === 'icegiant';
    this.crushY = this.gas ? 22 : -40;
    this.seaLevel = 9;
    this.pal = this._palette(planet);
    this.fogColor = new THREE.Color(this.pal.fog);

    const Hkm = planet?.physics?.scaleHeightKm || 8;
    const dens = this.gas
      ? clamp(0.00042 + 1.6 / (Hkm * 1800), 0.00032, 0.00135)
      : clamp(0.0002 + 1.1 / (Hkm * 2200), 0.00016, 0.00052);
    scene.fog = new THREE.FogExp2(this.pal.fogHex, dens);
    scene.background = new THREE.Color(this.pal.horizon);

    this.chunks = new Map();
    this._chunkPool = [];
    this._chunkQueue = [];
    this._chunkBuild = null;
    this._chunkMat = null;
    this._lastIx = NaN;
    this._lastIz = NaN;
    this._viewR = VIEW_R;
    this.viewR = VIEW_R;
    this._scAt = null;
    this._poiLive = new Map();
    this._scanned = new Set();
    this._announced = new Set();
    this._veins = new Map();
    this._surfaceFrames = 0;
    this.pois = [];
    this.heroGroup = new THREE.Group();
    this.heroGroup.name = 'surfaceHeroes';

    this._buildLights();
    this._buildSky();
    this._sharedMats();
    if (this.gas) this._buildCloudDeck();
    else {
      this.group.add(this.heroGroup);
      this._buildTerrainMat();
      this._syncChunks(0, 0, this.viewR);
      // Queue terrain here, but let the game loop build tiles after atmospheric
      // entry returns. Even one procedural tile can stall the transition on
      // slower machines.
      this._buildScatterPools();
      if (this.type === 'ocean') this._buildWater();
    }
  }

  _palette(planet) {
    const t = planet?.type || 'rocky';
    const table = {
      terra: {
        low: '#1a3e2c', mid: '#3d7a4a', high: '#c4b48a', rock: '#5a5348',
        fog: '#8ab4c4', fogHex: 0x8ab4c4, zenith: '#152a48', horizon: '#9ec8e0',
        sun: '#fff4d2', hemiSky: 0xb8d8f0, hemiGnd: 0x1a3020, bush: '#1a3a22',
        shore: '#c2b07a', sea: '#1a5a78',
      },
      ocean: {
        low: '#082838', mid: '#0e4a68', high: '#c8d8c0', rock: '#3a4a48',
        fog: '#6aa0b8', fogHex: 0x6aa0b8, zenith: '#0c2438', horizon: '#7eb8d4',
        sun: '#ffe8c8', hemiSky: 0x9ad0e8, hemiGnd: 0x082030, bush: '#163828',
        shore: '#d8c8a0', sea: '#0a4a72',
      },
      desert: {
        low: '#b07a3a', mid: '#d4a05a', high: '#f0e0b8', rock: '#6a4a28',
        fog: '#e0c08a', fogHex: 0xe0c08a, zenith: '#3a5a88', horizon: '#f2d09a',
        sun: '#ffe0a0', hemiSky: 0xffe8c0, hemiGnd: 0x3a2810, bush: '#5a4020',
        mesa: '#8a5a30',
      },
      ice: {
        low: '#5a7a90', mid: '#c8dce8', high: '#f4f8fc', rock: '#8aa0b0',
        fog: '#c8dce8', fogHex: 0xc8dce8, zenith: '#4a6a88', horizon: '#e0eef8',
        sun: '#fff8e8', hemiSky: 0xe8f4ff, hemiGnd: 0x203040, bush: '#a8c0d0',
        lake: '#3a6a88',
      },
      lava: {
        low: '#1a0806', mid: '#4a1810', high: '#8a3a18', rock: '#2a1008',
        fog: '#6a2818', fogHex: 0x6a2818, zenith: '#10060a', horizon: '#c04a22',
        sun: '#ffb070', hemiSky: 0xffa070, hemiGnd: 0x180808, bush: '#3a1008',
        emit: '#ff6a18',
      },
      rocky: {
        low: '#4a4038', mid: '#7a6a58', high: '#c0b098', rock: '#3a322c',
        fog: '#8a7a68', fogHex: 0x8a7a68, zenith: '#1a1820', horizon: '#c0a888',
        sun: '#ffe8c0', hemiSky: 0xd8c8b0, hemiGnd: 0x241810, bush: '#3a3028',
      },
      barren: {
        low: '#3a3836', mid: '#6a6660', high: '#b0a89c', rock: '#2a2826',
        fog: '#6a6660', fogHex: 0x6a6660, zenith: '#121418', horizon: '#8a8680',
        sun: '#e8e0d4', hemiSky: 0xc0b8b0, hemiGnd: 0x181616, bush: '#2a2824',
      },
      toxic: {
        low: '#2a380c', mid: '#7a9a28', high: '#d8f070', rock: '#2a3010',
        fog: '#6a8a28', fogHex: 0x6a8a28, zenith: '#101808', horizon: '#c0d860',
        sun: '#e8f0a0', hemiSky: 0xd8f080, hemiGnd: 0x1a2008, bush: '#2a3810',
        pool: '#c8f040',
      },
      carbon: {
        low: '#101018', mid: '#2a2a38', high: '#5a5a70', rock: '#0c0c12',
        fog: '#2a2a38', fogHex: 0x2a2a38, zenith: '#06060c', horizon: '#3a3a58',
        sun: '#c8c0ff', hemiSky: 0x8888aa, hemiGnd: 0x0a0a10, bush: '#1a1a22',
        crystal: '#a8a0ff',
      },
      exotic: {
        low: '#4a1040', mid: '#a03a78', high: '#ffb0d8', rock: '#3a0c38',
        fog: '#c44a9a', fogHex: 0xc44a9a, zenith: '#140818', horizon: '#e070b0',
        sun: '#ffd0f0', hemiSky: 0xff9ad8, hemiGnd: 0x4a1040, bush: '#5a1460',
        crystal: '#80ffe8',
      },
      gas: {
        low: '#c98f4a', mid: '#e8c07a', high: '#f6e6c0', rock: '#8a5a2b',
        fog: '#e8c8a0', fogHex: 0xe8c8a0, zenith: '#2a1810', horizon: '#f0d0a0',
        sun: '#ffe0b8', hemiSky: 0xffe0b8, hemiGnd: 0x302010, bush: '#4a3018',
        storm: '#8a4020',
      },
      icegiant: {
        low: '#1b3f6b', mid: '#2a6ea8', high: '#b6ecff', rock: '#143050',
        fog: '#57b6dd', fogHex: 0x57b6dd, zenith: '#081018', horizon: '#7fe0ff',
        sun: '#e8f8ff', hemiSky: 0xa8e8ff, hemiGnd: 0x102030, bush: '#143050',
        storm: '#104070',
      },
    };
    return table[t] || table.rocky;
  }

  _n(x, z, s = 1) {
    return this.simplex.noise(x * s, 0.37, z * s);
  }

  _fbm(x, z, s, oct = 4) {
    return fbm(this.simplex, x * s, 0.21, z * s, oct, 2.03, 0.5);
  }

  _ridge(x, z, s, oct = 4) {
    return ridged(this.simplex, x * s, 0.19, z * s, oct);
  }

  _craters(x, z, cell, maxR, depth, thresh = 0.32) {
    const ix = Math.floor(x / cell);
    const iz = Math.floor(z / cell);
    let h = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx0 = ix + dx, cz0 = iz + dz;
        const u = cellUnit(this.seed, cx0, cz0, 11);
        const v = cellUnit(this.seed, cx0, cz0, 27);
        const w = cellUnit(this.seed, cx0, cz0, 43);
        if (w < thresh) continue;
        const cx = (cx0 + 0.12 + u * 0.76) * cell;
        const cz = (cz0 + 0.12 + v * 0.76) * cell;
        const r = maxR * (0.4 + w * 0.6);
        const d = Math.hypot(x - cx, z - cz);
        if (d >= r) continue;
        const t = d / r;
        h += (t * t - 1) * depth;
        if (t > 0.7) h += Math.sin((t - 0.7) / 0.3 * Math.PI) * depth * 0.32;
      }
    }
    return h;
  }

  _h(x, z) {
    const t = this.type;
    if (this.gas) return 48 + this._n(x, z, 0.00055) * 16;
    if (t === 'lava') return this._hLava(x, z);
    if (t === 'barren') return this._hBarren(x, z);
    if (t === 'rocky') return this._hRocky(x, z);
    if (t === 'desert') return this._hDesert(x, z);
    if (t === 'toxic') return this._hToxic(x, z);
    if (t === 'terra') return this._hTerra(x, z);
    if (t === 'ocean') return this._hOcean(x, z);
    if (t === 'ice') return this._hIce(x, z);
    if (t === 'carbon') return this._hCarbon(x, z);
    if (t === 'exotic') return this._hExotic(x, z);
    return 18 + this._fbm(x, z, 0.0004, 5) * 70 + this._ridge(x, z, 0.00028) * 96;
  }

  _hLava(x, z) {
    const n = this._fbm(x, z, 0.00042, 5);
    const r = this._ridge(x, z, 0.00032, 5);
    const flow = this._n(x, z, 0.00038);
    const channel = Math.exp(-flow * flow * 11) * 48;
    const caldera = this._craters(x, z, 1600, 520, 72, 0.48);
    const cone = Math.max(0, this._n(x, z, 0.00018) - 0.38) ** 1.35 * 160;
    return 18 + n * 42 + r * 70 - channel + caldera + cone;
  }

  _hBarren(x, z) {
    const n = this._fbm(x, z, 0.00032, 5);
    const craters = this._craters(x, z, 520, 210, 42, 0.18);
    const big = this._craters(x, z, 2400, 880, 96, 0.55);
    const rim = this._ridge(x, z, 0.00022, 4) * 48;
    return 12 + n * 28 + craters + big + rim;
  }

  _hRocky(x, z) {
    const wx = x + this._n(x, z, 0.00022) * 220;
    const wz = z + this._n(x, z, 0.0002) * 220;
    const n = this._fbm(wx, wz, 0.00032, 5);
    const r = this._ridge(wx, wz, 0.00022, 6);
    const canyon = Math.exp(-(this._n(wx, wz, 0.00016) ** 2) * 7) * 92;
    const massif = Math.max(0, this._n(x, z, 0.00012) - 0.12) ** 1.4 * 210;
    return 22 + n * 52 + r * r * 180 + massif - canyon;
  }

  _hDesert(x, z) {
    const warp = this._n(x, z, 0.00055) * 140;
    const dunes = Math.sin((x + warp) * 0.0064) * 28
      + Math.sin((x * 0.55 + z * 0.18) * 0.01) * 14
      + Math.sin((z - warp * 0.4) * 0.0048) * 10
      + this._n(x, z, 0.0032) * 6;
    const mesaN = this._n(x, z, 0.00016);
    let h = 14 + dunes + this._fbm(x, z, 0.0007, 4) * 14;
    if (mesaN > 0.28) {
      const u = clamp((mesaN - 0.28) / 0.32, 0, 1);
      const cliff = u * u * 118 + this._n(x, z, 0.005) * 4;
      h = Math.max(h, 36 + cliff);
    }
    const wash = Math.exp(-(this._n(x, z, 0.0002) ** 2) * 9) * 36;
    return h - wash;
  }

  _hToxic(x, z) {
    const n = this._fbm(x, z, 0.00042, 5);
    const basin = this._ridge(x, z, 0.00026, 4);
    const pools = this._craters(x, z, 780, 260, 32, 0.32);
    const mound = Math.max(0, this._n(x, z, 0.0007) - 0.4) * 70;
    return 8 + n * 34 + (1 - basin) * 58 + pools + mound;
  }

  _hTerra(x, z) {
    const wx = x + this._n(x, z, 0.00028) * 240;
    const wz = z + this._n(x, z, 0.00024) * 240;
    const n = this._fbm(wx, wz, 0.00036, 6);
    const r = this._ridge(wx, wz, 0.00028, 5);
    const continent = this._fbm(x, z, 0.00011, 4);
    const alpine = Math.max(0, continent - 0.08) ** 1.45;
    const river = Math.exp(-(this._n(wx, wz, 0.0002) ** 2) * 9) * 36;
    const foothill = Math.max(0, n) * 22;
    return 20 + n * 58 + r * 96 * (0.28 + alpine) + alpine * 210 + foothill - river;
  }

  _hOcean(x, z) {
    const n = this._fbm(x, z, 0.00032, 6);
    const ring = this._craters(x, z, 2600, 640, -36, 0.62);
    const peak = Math.max(0, this._n(x, z, 0.00014) - 0.42) * 160;
    // Give the designated arrival pad a broad island. Without this anchor,
    // an ocean world's first few kilometres can be entirely submerged, so
    // the pilot sees only a flat water horizon and has no nearby relief to fly.
    const landingIsland = Math.exp(-(((x - 160) ** 2 + (z + 110) ** 2) / (2 * 900 ** 2))) * 148;
    const island = Math.max(0, n - 0.12) * 165 + Math.max(0, ring) + peak + landingIsland;
    return Math.max(this.seaLevel - 22, this.seaLevel - 10 + island);
  }

  _hIce(x, z) {
    const n = this._fbm(x, z, 0.00034, 5);
    const r = this._ridge(x, z, 0.00022, 6);
    const lake = this._n(x, z, 0.00022);
    const crevasse = Math.exp(-(this._n(x, z, 0.0009) ** 2) * 18) * 34;
    let h = 18 + n * 40 + r * r * 165 - crevasse;
    if (lake < -0.32) h = Math.min(h, 10 + (lake + 0.32) * 14);
    return h;
  }

  _hCarbon(x, z) {
    const n = this._fbm(x, z, 0.00032, 5);
    const steps = Math.floor((n * 0.5 + 0.5) * 9) / 9;
    const r = this._ridge(x, z, 0.00042, 4);
    const scarp = steps * 110 + r * 28;
    const spire = Math.max(0, this._n(x, z, 0.0014) - 0.52) * 150;
    const needle = Math.max(0, this._n(x, z, 0.0028) - 0.7) * 90;
    return 12 + scarp + spire + needle;
  }

  _hExotic(x, z) {
    const wx = x + this._n(x, z, 0.00042) * 280;
    const n = this._fbm(wx, z, 0.00032, 6);
    const hex = Math.abs(Math.sin(x * 0.00135) * Math.sin(z * 0.00135));
    const terrace = Math.pow(hex, 1.35) * 82;
    const spine = Math.max(0, this._ridge(x, z, 0.00055, 4) - 0.42) * 150;
    const bowl = this._craters(x, z, 1700, 420, 40, 0.42);
    return 16 + n * 52 + terrace + spine + bowl;
  }

  heightAt(x, z) {
    // Match the height of the rendered PlaneGeometry triangles. The mesh is
    // sampled on a fixed grid; querying the raw noise field here made the
    // ship collide with peaks and valleys that were not visible on screen.
    const step = CHUNK / SEGS;
    const gx = x / step, gz = z / step;
    const ix = Math.floor(gx), iz = Math.floor(gz);
    const fx = gx - ix, fz = gz - iz;
    const x0 = ix * step, z0 = iz * step;
    const a = this._h(x0, z0);
    const b = this._h(x0, z0 + step);
    const c = this._h(x0 + step, z0 + step);
    const d = this._h(x0 + step, z0);

    // PlaneGeometry uses triangles (a,b,d) and (b,c,d), split on b-d.
    if (fx + fz <= 1) {
      return a * (1 - fx - fz) + b * fz + d * fx;
    }
    return b * (1 - fx) + c * (fx + fz - 1) + d * (1 - fz);
  }

  setViewRadius(r) {
    const n = Math.max(1, Math.min(4, r | 0));
    if (n === this.viewR) return;
    this.viewR = n;
    this._lastIx = NaN;
    this._lastIz = NaN;
  }

  _buildLights() {
    const pal = this.pal;
    this.hemi = new THREE.HemisphereLight(pal.hemiSky, pal.hemiGnd, this.gas ? 1.05 : 0.88);
    this.group.add(this.hemi);
    this.sun = new THREE.DirectionalLight(pal.sun, this.gas ? 1.35 : 1.7);
    this.sun.position.set(420, 640, -380);
    this.group.add(this.sun);
    this.sun.target.position.set(0, 0, 0);
    this.group.add(this.sun.target);
    this.fill = new THREE.DirectionalLight(pal.horizon, 0.3);
    this.fill.position.set(-280, 120, 200);
    this.group.add(this.fill);
    if (this.type === 'lava') {
      this.glow = new THREE.PointLight(pal.emit || '#ff6a18', 2.4, 900, 1.6);
      this.glow.position.set(0, 40, 0);
      this.group.add(this.glow);
    }
  }

  _buildSky() {
    const pal = this.pal;
    const R = 6600;
    const geo = new THREE.SphereGeometry(R, 40, 24);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const zen = new THREE.Color(pal.zenith);
    const hor = new THREE.Color(pal.horizon);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / R;
      const t = clamp(y * 0.55 + 0.45, 0, 1);
      tmp.copy(hor).lerp(zen, t * t);
      col[i * 3] = tmp.r;
      col[i * 3 + 1] = tmp.g;
      col[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -2;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);

    const tex = makeGlowTexture(128, 2.2);
    const sunMat = new THREE.SpriteMaterial({
      map: tex, color: pal.sun, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false,
    });
    this.sunDisc = new THREE.Sprite(sunMat);
    this._sunDir = this.sun.position.clone().normalize();
    this.sunDisc.position.copy(this._sunDir).multiplyScalar(R * 0.82);
    this.sunDisc.scale.setScalar(520);
    this.group.add(this.sunDisc);
  }

  _sharedMats() {
    const pal = this.pal;
    this._mat = {
      metal: new THREE.MeshStandardMaterial({
        color: '#6a7380', metalness: 0.58, roughness: 0.36, fog: true,
      }),
      dark: new THREE.MeshStandardMaterial({
        color: '#2a3038', metalness: 0.4, roughness: 0.55, fog: true,
      }),
      lamp: new THREE.MeshBasicMaterial({ color: 0x7fe8ff, fog: false }),
      rock: new THREE.MeshStandardMaterial({
        color: pal.rock, roughness: 0.94, metalness: 0.06, fog: true, flatShading: true,
      }),
      bush: new THREE.MeshLambertMaterial({ color: pal.bush, fog: true, flatShading: true }),
      emit: new THREE.MeshStandardMaterial({
        color: pal.emit || pal.crystal || '#ff8a30',
        emissive: pal.emit || pal.crystal || '#ff6a18',
        emissiveIntensity: 0.85, roughness: 0.4, metalness: 0.1, fog: true, flatShading: true,
      }),
      crystal: new THREE.MeshStandardMaterial({
        color: pal.crystal || pal.high, emissive: pal.crystal || pal.high,
        emissiveIntensity: 0.35, roughness: 0.22, metalness: 0.45, fog: true, flatShading: true,
      }),
      ice: new THREE.MeshStandardMaterial({
        color: pal.high, roughness: 0.28, metalness: 0.18, fog: true, flatShading: true,
      }),
    };
  }

  _groundTex() {
    const cnv = document.createElement('canvas');
    cnv.width = cnv.height = 256;
    const ctx = cnv.getContext('2d');
    const img = ctx.createImageData(256, 256);
    const d = img.data;
    const rng = new RNG(this.seed ^ 0x9e3779b9);
    for (let i = 0; i < 256 * 256; i++) {
      const n = 0.76 + rng.next() * 0.24;
      const v = Math.floor(n * 255);
      d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cnv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }

  _buildTerrainMat() {
    const type = this.type;
    const pal = this.pal;
    this._chunkMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: type === 'ice' || type === 'ocean' ? 0.4 : type === 'carbon' ? 0.55 : 0.92,
      metalness: type === 'carbon' ? 0.28 : type === 'ice' ? 0.12 : 0.04,
      map: this._groundTex(),
      fog: true,
      envMapIntensity: 0.35,
    });
    if (type === 'lava') {
      this._chunkMat.emissive = new THREE.Color(pal.emit || '#ff4a10');
      this._chunkMat.emissiveIntensity = 0.2;
    }
  }

  _acquireChunk() {
    let mesh = this._chunkPool.pop();
    if (!mesh) {
      const geo = new THREE.PlaneGeometry(CHUNK, CHUNK, SEGS, SEGS);
      geo.rotateX(-Math.PI / 2);
      mesh = new THREE.Mesh(geo, this._chunkMat);
      mesh.receiveShadow = false;
      mesh.matrixAutoUpdate = true;
    }
    return mesh;
  }

  _beginChunkBuild(mesh, k, ix, iz) {
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const ox = (ix + 0.5) * CHUNK;
    const oz = (iz + 0.5) * CHUNK;
    const uv = geo.attributes.uv;
    let col = geo.attributes.color;
    if (!col) {
      col = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
      geo.setAttribute('color', col);
    }
    const pal = this.pal;
    const cLow = new THREE.Color(pal.low);
    const cMid = new THREE.Color(pal.mid);
    const cHigh = new THREE.Color(pal.high);
    const cRock = new THREE.Color(pal.rock);
    const cEmit = pal.emit ? new THREE.Color(pal.emit) : null;
    const cShore = pal.shore ? new THREE.Color(pal.shore) : null;
    const cLake = pal.lake ? new THREE.Color(pal.lake) : pal.pool ? new THREE.Color(pal.pool) : null;
    const cCrystal = pal.crystal ? new THREE.Color(pal.crystal) : null;
    const type = this.type;
    this._chunkBuild = {
      k, ix, iz, mesh, geo, pos, uv, col, ox, oz,
      row: 0,
      colorRow: 0,
      stage: 'height',
      colors: { cLow, cMid, cHigh, cRock, cEmit, cShore, cLake, cCrystal, type },
    };
  }

  _advanceChunkBuild(heightRows = 4, colorRows = 5) {
    let build = this._chunkBuild;
    if (!build) {
      while (this._chunkQueue.length) {
        const { k, x, z } = this._chunkQueue.shift();
        if (this.chunks.has(k)) continue;
        this._beginChunkBuild(this._acquireChunk(), k, x, z);
        build = this._chunkBuild;
        break;
      }
    }
    if (!build) return;

    const { pos, uv, geo, mesh, ox, oz } = build;
    const side = SEGS + 1;
    if (build.stage === 'height') {
      const endRow = Math.min(SEGS + 1, build.row + heightRows);
      for (let row = build.row; row < endRow; row++) {
        const lz = row / SEGS;
        const z = oz + (lz - 0.5) * CHUNK;
        for (let col = 0; col < side; col++) {
          const lx = col / SEGS;
          const x = ox + (lx - 0.5) * CHUNK;
          const i = row * side + col;
          pos.setXYZ(i, x - ox, this._h(x, z), z - oz);
          uv.setXY(i, x / 180, z / 180);
        }
      }
      build.row = endRow;
      if (build.row >= SEGS + 1) {
        pos.needsUpdate = true;
        uv.needsUpdate = true;
        geo.computeVertexNormals();
        const { cMid } = build.colors;
        for (let i = 0; i < build.col.count; i++) build.col.setXYZ(i, cMid.r, cMid.g, cMid.b);
        build.col.needsUpdate = true;
        mesh.position.set(ox, 0, oz);
        this.group.add(mesh);
        build.stage = 'color';
      }
      return;
    }

    const { col, colorRow, colors } = build;
    const endRow = Math.min(SEGS + 1, colorRow + colorRows);
    const nrm = geo.attributes.normal;
    const { cLow, cMid, cHigh, cRock, cEmit, cShore, cLake, cCrystal, type } = colors;
    for (let row = colorRow; row < endRow; row++) {
      const start = row * side;
      for (let column = 0; column < side; column++) {
        const i = start + column;
      const x = pos.getX(i) + ox;
      const y = pos.getY(i);
      const z = pos.getZ(i) + oz;
      const ny = nrm.getY(i);
      const slope = clamp(1 - ny, 0, 1);
      const h = clamp((y - 8) / 240, 0, 1);
      _c.copy(cLow).lerp(cMid, clamp(h * 1.25, 0, 1)).lerp(cHigh, h * h);
      if (slope > 0.22) _c.lerp(cRock, clamp((slope - 0.22) / 0.4, 0, 1));
      if (type === 'terra' && y > 110 && slope < 0.38) _c.lerp(cHigh, clamp((y - 110) / 90, 0, 0.7));
      if (type === 'lava' && cEmit) {
        const crack = this._n(x, z, 0.008);
        if (crack > 0.38) _c.lerp(cEmit, (crack - 0.38) * 2.1);
      }
      if (type === 'ocean' && cShore && y < this.seaLevel + 6) {
        _c.lerp(cShore, clamp((this.seaLevel + 6 - y) / 10, 0, 1));
      }
      if (type === 'terra' && cShore && y < 28 && slope < 0.22) {
        const wet = this._n(x, z, 0.00026);
        if (Math.abs(wet) < 0.12) _c.lerp(cShore, 0.45);
      }
      if ((type === 'ice' || type === 'toxic') && cLake && y < 14 && slope < 0.18) {
        _c.lerp(cLake, 0.55);
      }
      if (type === 'exotic') {
        const hue = this._n(x, z, 0.0012);
        _c.offsetHSL(hue * 0.08, 0.05, 0);
      }
      if (type === 'carbon' && slope > 0.2 && cCrystal) {
        _c.lerp(cCrystal, 0.18);
      }
      col.setXYZ(i, _c.r, _c.g, _c.b);
      }
    }
    build.colorRow = endRow;
    col.needsUpdate = true;
    if (build.colorRow >= SEGS + 1) {
      geo.computeBoundingSphere();
      this.chunks.set(build.k, mesh);
      this._chunkBuild = null;
    }
  }

  _syncChunks(px, pz, radius = this._viewR) {
    const ix = Math.floor(px / CHUNK);
    const iz = Math.floor(pz / CHUNK);
    if (ix === this._lastIx && iz === this._lastIz && radius === this._viewR && !this._chunkQueue.length) return;
    this._lastIx = ix;
    this._lastIz = iz;
    this._viewR = radius;
    const need = new Set();
    for (let z = iz - radius; z <= iz + radius; z++) {
      for (let x = ix - radius; x <= ix + radius; x++) {
        need.add(`${x},${z}`);
      }
    }
    const queued = new Set(this._chunkQueue.map((q) => q.k));
    if (this._chunkBuild) queued.add(this._chunkBuild.k);
    for (const k of need) {
      if (this.chunks.has(k) || queued.has(k)) continue;
      const c = k.indexOf(',');
      this._chunkQueue.push({ k, x: +k.slice(0, c), z: +k.slice(c + 1) });
    }
    this._chunkQueue = this._chunkQueue.filter((q) => need.has(q.k));
    this._chunkQueue.sort((a, b) =>
      (a.x - ix) ** 2 + (a.z - iz) ** 2 - ((b.x - ix) ** 2 + (b.z - iz) ** 2));
    for (const [k, mesh] of this.chunks) {
      if (need.has(k)) continue;
      this.group.remove(mesh);
      this._chunkPool.push(mesh);
      this.chunks.delete(k);
    }
  }

  _drainChunks() {
    this._advanceChunkBuild(2, 3);
  }

  _buildWater() {
    const geo = new THREE.PlaneGeometry(14000, 14000, 28, 28);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: this.pal.sea || '#0a4a72',
      roughness: 0.18,
      metalness: 0.35,
      transparent: true,
      opacity: 0.78,
      fog: true,
      depthWrite: true,
    });
    this.water = new THREE.Mesh(geo, mat);
    this.water.position.y = this.seaLevel;
    this.group.add(this.water);
  }

  _buildCloudDeck() {
    const pal = this.pal;
    this.clouds = [];
    const span = 15000;
    for (let k = 0; k < 6; k++) {
      const geo = new THREE.PlaneGeometry(span, span, 40, 40);
      geo.rotateX(-Math.PI / 2);
      this._sculptCloud(geo, k, 0, 0);
      const mat = new THREE.MeshLambertMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.5 - k * 0.055,
        fog: true,
        depthWrite: k === 0,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      this.group.add(mesh);
      this.clouds.push(mesh);
    }
    const puffGeo = new THREE.IcosahedronGeometry(1, 1);
    const puffMat = new THREE.MeshLambertMaterial({
      color: pal.high, transparent: true, opacity: 0.28, fog: true, depthWrite: false,
    });
    this.puffs = new THREE.InstancedMesh(puffGeo, puffMat, 48);
    this.puffs.instanceMatrix.needsUpdate = true;
    this.group.add(this.puffs);
    this._placePuffs(0, 0);

    this.lightning = new THREE.PointLight(this.type === 'icegiant' ? '#b6ecff' : '#ffe0a0', 0, 1800, 1.4);
    this.lightning.position.set(0, 90, 0);
    this.group.add(this.lightning);
    this._flashT = 0;
  }

  _sculptCloud(geo, k, ox, oz) {
    const pal = this.pal;
    const pos = geo.attributes.position;
    let col = geo.attributes.color;
    if (!col) {
      col = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
      geo.setAttribute('color', col);
    }
    const cA = new THREE.Color(pal.low);
    const cB = new THREE.Color(pal.mid);
    const cC = new THREE.Color(pal.high);
    const cS = new THREE.Color(pal.storm || pal.rock);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + ox;
      const z = pos.getZ(i) + oz;
      const band = 0.5 + 0.5 * Math.sin(z * 0.00055 + k * 0.4);
      const n = this._n(x, z, 0.00055 + k * 0.00018);
      const storm = this._craters(x, z, 2200, 700, 1, 0.6);
      const y = 42 + k * 26 + n * 16 + storm * 18;
      pos.setY(i, y);
      _c.copy(cA).lerp(cB, band).lerp(cC, clamp(n * 0.5 + 0.35, 0, 1));
      if (storm < -0.25) _c.lerp(cS, clamp((-storm - 0.25) * 1.4, 0, 1));
      col.setXYZ(i, _c.r, _c.g, _c.b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }

  _placePuffs(px, pz) {
    if (!this.puffs) return;
    const n = this.puffs.count;
    for (let i = 0; i < n; i++) {
      const u = cellUnit(this.seed, i, Math.round(px / 400), 77 + i);
      const v = cellUnit(this.seed, i, Math.round(pz / 400), 91 + i);
      const a = u * Math.PI * 2;
      const r = 200 + v * 5200;
      const x = px + Math.cos(a) * r;
      const z = pz + Math.sin(a) * r;
      const y = 50 + (i % 6) * 22 + u * 18;
      const sc = 40 + v * 90;
      _p.set(x, y, z);
      _q.setFromEuler(_eul.set(u * 0.4, a, v * 0.3));
      _s.set(sc, sc * (0.35 + u * 0.25), sc);
      _m.compose(_p, _q, _s);
      this.puffs.setMatrixAt(i, _m);
    }
    this.puffs.instanceMatrix.needsUpdate = true;
  }

  _buildScatterPools() {
    const type = this.type;
    const nRock = type === 'ocean' ? 180 : type === 'desert' ? 260 : type === 'barren' ? 340 : type === 'rocky' ? 420 : 400;
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    rockGeo.scale(1.15, 0.7, 1.0);
    this.rocks = new THREE.InstancedMesh(rockGeo, this._mat.rock, nRock);
    this.rocks.frustumCulled = false;
    this.group.add(this.rocks);

    if (type === 'terra' || type === 'toxic' || type === 'ocean' || type === 'marsh') {
      const bushGeo = new THREE.IcosahedronGeometry(1, 0);
      bushGeo.scale(0.7, 1.35, 0.7);
      const nBush = type === 'ocean' ? 90 : type === 'terra' ? 220 : 140;
      this.bushes = new THREE.InstancedMesh(bushGeo, this._mat.bush, nBush);
      this.bushes.frustumCulled = false;
      this.group.add(this.bushes);
    }
    if (type === 'ice') {
      const shardGeo = new THREE.OctahedronGeometry(1, 0);
      this.shards = new THREE.InstancedMesh(shardGeo, this._mat.ice, 160);
      this.shards.frustumCulled = false;
      this.group.add(this.shards);
    }
    if (type === 'lava' || type === 'ash') {
      const ventGeo = new THREE.IcosahedronGeometry(1, 0);
      this.vents = new THREE.InstancedMesh(ventGeo, this._mat.emit, type === 'ash' ? 40 : 90);
      this.vents.frustumCulled = false;
      this.group.add(this.vents);
    }
    if (type === 'carbon' || type === 'exotic') {
      const cryGeo = new THREE.OctahedronGeometry(1, 0);
      this.crystals = new THREE.InstancedMesh(cryGeo, this._mat.crystal, type === 'exotic' ? 140 : 100);
      this.crystals.frustumCulled = false;
      this.group.add(this.crystals);
    }
    if (type === 'desert') {
      const boneGeo = new THREE.BoxGeometry(1, 0.22, 0.28);
      this.bones = new THREE.InstancedMesh(boneGeo, this._mat.dark, 70);
      this.bones.frustumCulled = false;
      this.group.add(this.bones);
    }
  }

  _placeScatter(px, pz) {
    const type = this.type;
    const ix0 = Math.floor(px / SCATTER_CELL);
    const iz0 = Math.floor(pz / SCATTER_CELL);
    const reach = Math.ceil(SCATTER_R / SCATTER_CELL);
    const place = (mesh, filter, scaleFn) => {
      if (!mesh) return;
      let n = 0;
      const cap = mesh.count;
      for (let iz = iz0 - reach; iz <= iz0 + reach && n < cap; iz++) {
        for (let ix = ix0 - reach; ix <= ix0 + reach && n < cap; ix++) {
          const u = cellUnit(this.seed, ix, iz, 3);
          if (u > 0.74) continue;
          const x = (ix + cellUnit(this.seed, ix, iz, 5)) * SCATTER_CELL;
          const z = (iz + cellUnit(this.seed, ix, iz, 7)) * SCATTER_CELL;
          if (Math.hypot(x - px, z - pz) > SCATTER_R) continue;
          const y = this._h(x, z);
          if (filter && !filter(x, z, y)) continue;
          const sc = scaleFn(u, cellUnit(this.seed, ix, iz, 9));
          _p.set(x, y + sc.y * 0.28, z);
          _q.setFromEuler(_eul.set(u * 0.5, u * 6.28, cellUnit(this.seed, ix, iz, 13) * 0.5));
          _s.copy(sc);
          _m.compose(_p, _q, _s);
          mesh.setMatrixAt(n++, _m);
        }
      }
      _s.set(0, 0, 0);
      _m.compose(_p.set(0, -200, 0), _q.identity(), _s);
      for (let i = n; i < cap; i++) mesh.setMatrixAt(i, _m);
      mesh.instanceMatrix.needsUpdate = true;
    };

    place(this.rocks, (x, z, y) => type !== 'ocean' || y > this.seaLevel + 2, (u, v) => {
      const sc = 4.6 + u * 22;
      return _s.set(sc * (0.7 + v * 0.5), sc * (0.42 + v * 0.4), sc * (0.7 + v * 0.5)).clone();
    });
    place(this.bushes, (x, z, y) => {
      if (type === 'ocean') return y > this.seaLevel + 3;
      if (type === 'terra') return y > 14 && y < 160;
      return y > 8;
    }, (u, v) => {
      const sc = 2.2 + u * 6.5;
      return _s.set(sc * 0.65, sc, sc * 0.65).clone();
    });
    place(this.shards, (x, z, y) => y > 14, (u, v) => {
      const sc = 4 + u * 16;
      return _s.set(sc * 0.45, sc, sc * 0.45).clone();
    });
    place(this.vents, (x, z, y) => this._n(x, z, 0.00048) * this._n(x, z, 0.00048) < 0.08, (u, v) => {
      const sc = 2.4 + u * 8;
      return _s.set(sc * 0.7, sc * 0.5, sc * 0.7).clone();
    });
    place(this.crystals, (x, z, y) => y > 12, (u, v) => {
      const sc = 5 + u * 18;
      return _s.set(sc * 0.4, sc, sc * 0.4).clone();
    });
    place(this.bones, (x, z, y) => y > 10 && y < 40, (u, v) => {
      const sc = 6 + u * 14;
      return _s.set(sc, sc * 0.4, sc * 0.35).clone();
    });
  }

  _poiCatalog() {
    const t = this.type;
    const common = [
      { key: 'beacon', name: 'Survey Beacon', value: 520, hero: null },
      { key: 'relay', name: 'Relay Spike', value: 640, hero: 'mast' },
      { key: 'wreck', name: 'Downed Hull', value: 980, hero: 'wreck' },
    ];
    const extra = {
      lava: [
        { key: 'vent', name: 'Thermal Vent', value: 860, hero: 'vent' },
        { key: 'caldera', name: 'Caldera Mast', value: 1100, hero: 'vent' },
      ],
      barren: [
        { key: 'crater', name: 'Crater Survey', value: 720, hero: 'pad' },
        { key: 'wreck', name: 'Impact Wreck', value: 1040, hero: 'wreck' },
      ],
      rocky: [
        { key: 'cairn', name: 'Ridge Cairn', value: 700, hero: 'ruin' },
        { key: 'canyon', name: 'Canyon Cache', value: 880, hero: 'wreck' },
      ],
      desert: [
        { key: 'mesa', name: 'Mesa Ruin', value: 920, hero: 'ruin' },
        { key: 'dune', name: 'Dune Wreck', value: 1010, hero: 'wreck' },
      ],
      toxic: [
        { key: 'stack', name: 'Vent Stack', value: 840, hero: 'vent' },
        { key: 'lab', name: 'Ruined Lab', value: 1180, hero: 'ruin' },
      ],
      terra: [
        { key: 'mast', name: 'Research Mast', value: 760, hero: 'mast' },
        { key: 'ruin', name: 'Old Habitat', value: 990, hero: 'ruin' },
      ],
      ocean: [
        { key: 'atoll', name: 'Atoll Pad', value: 820, hero: 'platform' },
        { key: 'rig', name: 'Wave Rig', value: 1080, hero: 'platform' },
      ],
      ice: [
        { key: 'lake', name: 'Frozen Lake Hut', value: 780, hero: 'pad' },
        { key: 'spire', name: 'Ice Spire Camp', value: 940, hero: 'crystal' },
      ],
      carbon: [
        { key: 'scarp', name: 'Scarp Relay', value: 900, hero: 'mast' },
        { key: 'farm', name: 'Crystal Farm', value: 1240, hero: 'crystal' },
      ],
      exotic: [
        { key: 'pylon', name: 'Anomaly Pylon', value: 1600, hero: 'pylon' },
        { key: 'spine', name: 'Crystal Spine', value: 1420, hero: 'crystal' },
      ],
    };
    return common.concat(extra[t] || extra.rocky);
  }

  _poiAt(ix, iz) {
    const origin = ix === 0 && iz === 0;
    const u = cellUnit(this.seed, ix, iz, 201);
    if (!origin && u > 0.58) return null;
    const cat = this._poiCatalog();
    const pick = origin ? cat[0] : cat[Math.floor(cellUnit(this.seed, ix, iz, 211) * cat.length) % cat.length];
    const x = origin ? 160 : (ix + 0.18 + cellUnit(this.seed, ix, iz, 221) * 0.64) * POI_CELL;
    const z = origin ? -110 : (iz + 0.18 + cellUnit(this.seed, ix, iz, 231) * 0.64) * POI_CELL;
    let y = this._h(x, z);
    let hero = pick.hero;
    let name = pick.name;
    if (this.type === 'ocean' && y < this.seaLevel + 1) {
      if (!origin && pick.hero !== 'platform') return null;
      hero = 'platform';
      name = origin ? 'Drop Rig' : pick.name;
      y = this.seaLevel;
    } else if (this.type === 'ocean' && origin) {
      // Keep the guaranteed starting Drop Rig on the island instead of
      // spawning an unhelpful beacon at an arbitrary height.
      hero = 'platform';
      name = 'Drop Rig';
    }
    const k = `${ix},${iz}`;
    return {
      ix, iz, x, z, y,
      name,
      value: pick.value + Math.floor(cellUnit(this.seed, ix, iz, 241) * 420),
      hero,
      scanned: this._scanned.has(k),
      toast: this._announced.has(k),
      key: k,
    };
  }

  _makeHero(kind) {
    const g = new THREE.Group();
    const metal = this._mat.metal;
    const dark = this._mat.dark;
    const emit = this._mat.emit;
    const crystal = this._mat.crystal;
    if (kind === 'wreck') {
      const hull = new THREE.Mesh(new THREE.BoxGeometry(22, 4.6, 8.2), metal);
      hull.rotation.set(0.18, 0.55, -0.22);
      hull.position.y = 3.2;
      const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.45, 3.4), dark);
      wing.position.set(6, 2.2, -3);
      wing.rotation.set(0.4, 0.2, 0.6);
      const rib = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 14), metal);
      rib.position.set(-4, 2.6, 1);
      rib.rotation.y = 0.3;
      g.add(hull, wing, rib);
    } else if (kind === 'ruin') {
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(3.2 + i, 5 + i * 1.4, 2.4), dark);
        b.position.set((i - 1.4) * 4.2, (5 + i * 1.4) * 0.5, (i % 2) * 3.5 - 1);
        b.rotation.y = i * 0.4;
        g.add(b);
      }
    } else if (kind === 'vent') {
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 18, 8), dark);
      stack.position.y = 9;
      const lip = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 2.2, 2.2, 10), emit);
      lip.position.y = 19;
      const glow = new THREE.Mesh(new THREE.SphereGeometry(2.1, 8, 6), emit);
      glow.position.y = 21.5;
      g.add(stack, lip, glow);
    } else if (kind === 'mast') {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(10, 11, 1.2, 12), metal);
      pad.position.y = 0.6;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.7, 22, 6), metal);
      mast.position.y = 12;
      const dish = new THREE.Mesh(new THREE.SphereGeometry(3.2, 8, 6, 0, Math.PI * 2, 0, 1.2), dark);
      dish.position.y = 24;
      g.add(pad, mast, dish);
    } else if (kind === 'platform') {
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(14, 15, 1.4, 14), metal);
      deck.position.y = 8;
      for (let i = 0; i < 4; i++) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 16, 6), dark);
        const a = i * 1.57 + 0.4;
        leg.position.set(Math.cos(a) * 10, 0, Math.sin(a) * 10);
        g.add(leg);
      }
      const crane = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 16), metal);
      crane.position.set(0, 12, 4);
      g.add(deck, crane);
    } else if (kind === 'crystal') {
      for (let i = 0; i < 5; i++) {
        const sp = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), crystal);
        const sc = 4 + i * 1.8;
        sp.scale.set(sc * 0.35, sc, sc * 0.35);
        sp.position.set((i - 2) * 3.4, sc * 0.55, (i % 2) * 2.6);
        sp.rotation.y = i * 0.7;
        g.add(sp);
      }
    } else if (kind === 'pylon') {
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(4.5, 0), crystal);
      core.position.y = 10;
      core.scale.set(1, 2.4, 1);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.5, 8, 1, true), emit);
      ring.position.y = 10;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(5, 6, 2, 8), dark);
      base.position.y = 1;
      g.add(base, core, ring);
    } else {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 1.1, 12), metal);
      pad.position.y = 0.55;
      const hut = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 5), dark);
      hut.position.y = 2.2;
      g.add(pad, hut);
    }
    return g;
  }

  _syncPois(px, pz) {
    const ix = Math.floor(px / POI_CELL);
    const iz = Math.floor(pz / POI_CELL);
    const R = 3;
    const list = [];
    for (let z = iz - R; z <= iz + R; z++) {
      for (let x = ix - R; x <= ix + R; x++) {
        const rec = this._poiAt(x, z);
        if (!rec) continue;
        rec.position = new THREE.Vector3(rec.x, rec.y, rec.z);
        rec.dist = Math.hypot(rec.x - px, rec.z - pz);
        list.push(rec);
      }
    }
    list.sort((a, b) => a.dist - b.dist);
    const vis = list.filter((p) => !p.scanned).slice(0, 8);
    const need = new Set(vis.map((p) => p.key));
    for (const rec of vis) {
      let live = this._poiLive.get(rec.key);
      if (!live) {
        live = rec;
        live.mesh = new THREE.Group();
        const beacon = this._makeBeacon();
        live.mesh.add(beacon);
        live.lamp = beacon.userData.lamp;
        if (rec.hero) {
          const hero = this._makeHero(rec.hero);
          hero.position.set(18, 0, 10);
          live.mesh.add(hero);
        }
        live.mesh.position.copy(live.position);
        this.heroGroup.add(live.mesh);
        this._poiLive.set(rec.key, live);
      }
      live.mesh.visible = !live.scanned;
      rec.mesh = live.mesh;
      rec.lamp = live.lamp;
    }
    for (const [k, live] of this._poiLive) {
      if (need.has(k)) continue;
      this.heroGroup.remove(live.mesh);
      live.mesh.traverse((o) => {
        if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
      });
      this._poiLive.delete(k);
    }
    this.pois = list;
  }

  noteSeen(poi) {
    if (!poi?.key) return false;
    if (this._announced.has(poi.key)) return false;
    this._announced.add(poi.key);
    poi.toast = true;
    return true;
  }

  _makeBeacon() {
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(11, 12, 1.1, 12), this._mat.metal);
    pad.position.y = 0.55;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 16, 6), this._mat.metal);
    mast.position.y = 8.5;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.35, 10, 8), this._mat.lamp);
    lamp.position.y = 17.2;
    g.add(pad, mast, lamp);
    g.userData.lamp = lamp;
    return g;
  }

  markScanned(poi) {
    if (!poi) return;
    poi.scanned = true;
    if (poi.key) this._scanned.add(poi.key);
    if (poi.mesh) poi.mesh.visible = false;
  }

  nearestPoi(pos, maxD = 1e9) {
    let best = null, bd = maxD;
    for (const p of this.pois) {
      if (p.scanned) continue;
      const d = Math.hypot(pos.x - p.x, pos.z - p.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best ? { poi: best, dist: bd } : null;
  }

  veinAt(x, z) {
    if (this.gas) return null;
    const type = this.type;
    const yld = ({
      lava: { commodity: 'metals', rare: 0.18, hazard: 'heat' },
      ice: { commodity: 'ice_ore', rare: 0.08, hazard: null },
      carbon: { commodity: 'minerals', rare: 0.28, hazard: null },
      rocky: { commodity: 'minerals', rare: 0.09, hazard: null },
      barren: { commodity: 'minerals', rare: 0.05, hazard: null },
      desert: { commodity: 'minerals', rare: 0.04, hazard: 'heat' },
      toxic: { commodity: 'minerals', rare: 0.11, hazard: 'toxic' },
      exotic: { commodity: 'rare_ore', rare: 0.4, hazard: 'unstable' },
    })[type];
    if (!yld) return null;
    const cell = 78;
    const ix = Math.floor(x / cell);
    const iz = Math.floor(z / cell);
    const k = `${ix},${iz}`;
    if (!this._veins) this._veins = new Map();
    if (this._veins.has(k)) return this._veins.get(k);
    const u = cellUnit(this.seed, ix, iz, 401);
    if (u > 0.7) {
      const empty = { empty: true, ix, iz };
      this._veins.set(k, empty);
      return empty;
    }
    const grade = 1 + Math.floor(cellUnit(this.seed, ix, iz, 411) * 5);
    const rare = cellUnit(this.seed, ix, iz, 421) < yld.rare;
    const cx = (ix + 0.5) * cell;
    const cz = (iz + 0.5) * cell;
    const ore = 5 + grade * 3.5 + cellUnit(this.seed, ix, iz, 431) * 7;
    const v = {
      empty: false, ix, iz, x: cx, z: cz, y: this.heightAt(cx, cz),
      commodity: rare ? 'rare_ore' : yld.commodity,
      grade, rare, hazard: yld.hazard,
      ore, oreMax: ore, prospected: false, prospect: 0, alive: true,
    };
    this._veins.set(k, v);
    return v;
  }

  nearestVein(pos, range = 160) {
    if (this.gas || !pos) return null;
    let best = null, bd = range;
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const v = this.veinAt(pos.x + dx * 78, pos.z + dz * 78);
        if (!v || v.empty || !v.alive || v.ore <= 0) continue;
        const d = Math.hypot(pos.x - v.x, pos.z - v.z);
        if (d < bd) { bd = d; best = v; }
      }
    }
    return best ? { rock: best, dist: bd } : null;
  }

  update(dt, shipPos) {
    if (this.sky && shipPos) {
      this.sky.position.set(shipPos.x, 0, shipPos.z);
      if (this.sunDisc && this._sunDir) {
        this.sunDisc.position.set(
          shipPos.x + this._sunDir.x * 5400,
          this._sunDir.y * 5400,
          shipPos.z + this._sunDir.z * 5400
        );
      }
    }
    if (this.glow && shipPos) this.glow.position.set(shipPos.x + 80, 36, shipPos.z - 40);

    if (!this.gas) {
      this._syncChunks(shipPos.x, shipPos.z, this.viewR);
      // Stream terrain a tile at a time so procedural height/color work stays
      // spread across frames instead of causing large entry/flight stalls.
      this._drainChunks();
      this._surfaceFrames++;
      if (this._surfaceFrames === 2) {
        this._scAt = { x: shipPos.x, z: shipPos.z };
        this._placeScatter(shipPos.x, shipPos.z);
      } else if (this._surfaceFrames === 3) {
        this._syncPois(shipPos.x, shipPos.z);
      } else if (this._surfaceFrames > 3 && this._scAt
        && Math.hypot(shipPos.x - this._scAt.x, shipPos.z - this._scAt.z) > 480) {
        this._scAt = { x: shipPos.x, z: shipPos.z };
        this._placeScatter(shipPos.x, shipPos.z);
        this._syncPois(shipPos.x, shipPos.z);
      }
      if (this.water) this.water.position.set(shipPos.x, this.seaLevel, shipPos.z);
    } else {
      const ix = Math.round(shipPos.x / 800);
      const iz = Math.round(shipPos.z / 800);
      if (ix !== this._lastIx || iz !== this._lastIz) {
        this._lastIx = ix;
        this._lastIz = iz;
        for (let k = 0; k < this.clouds.length; k++) {
          this.clouds[k].position.set(shipPos.x, 0, shipPos.z);
          this._sculptCloud(this.clouds[k].geometry, k, shipPos.x, shipPos.z);
        }
        this._placePuffs(shipPos.x, shipPos.z);
      }
      this._flashT -= dt;
      if (this._flashT <= 0) {
        this._flashT = 2.2 + this.rng.next() * 5.5;
        if (this.rng.next() < 0.55) {
          this.lightning.intensity = 8;
          this.lightning.position.set(
            shipPos.x + (this.rng.next() - 0.5) * 1800,
            70 + this.rng.next() * 80,
            shipPos.z + (this.rng.next() - 0.5) * 1800
          );
        }
      }
      if (this.lightning.intensity > 0.05) {
        this.lightning.intensity *= Math.exp(-dt * 8);
      } else this.lightning.intensity = 0;
    }

    if (this.pois) {
      const t = performance.now() * 0.001;
      for (const p of this.pois) {
        if (p.scanned || !p.lamp) continue;
        const pulse = 0.55 + Math.sin(t * 3.2 + p.value) * 0.45;
        p.lamp.scale.setScalar(0.85 + pulse * 0.35);
      }
    }
  }

  formatRange(d) { return surfDist(d); }

  dispose() {
    this.scene.fog = null;
    this.scene.background = new THREE.Color('#03070c');
    this.group.parent?.remove(this.group);
    const dump = (o) => {
      if (o.geometry?.dispose) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { m.map?.dispose?.(); m.dispose?.(); }
      }
    };
    this.group.traverse(dump);
    if (this._chunkBuild?.mesh) dump(this._chunkBuild.mesh);
    this._chunkBuild = null;
    for (const mesh of this._chunkPool) dump(mesh);
    this.chunks.clear();
    this._chunkPool.length = 0;
    this._poiLive.clear();
    this.pois = [];
  }
}
