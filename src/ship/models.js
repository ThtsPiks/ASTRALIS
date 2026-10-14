// ============================================================================
//  PROCEDURAL MODELS — ships, stations, asteroids, wrecks, projectiles
// ============================================================================
import * as THREE from '../../vendor/three/three.module.js';
import * as BGU from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { Simplex, RNG } from '../core/rng.js';
import { clamp, TAU } from '../core/utils.js';
import { createGlowSprite, hullPanelMaps } from '../world/materials.js?v=choir3';
import { loft, noseSections, wing, fin, nozzle, intake, canopy, hatch } from './hullkit.js';

// --------------------------------------------------------------------------
const GROUPS = ['hull', 'dark', 'glow', 'glass', 'accent', 'engine', 'navL', 'navR', 'strobe'];
class PartBuilder {
  constructor() { this.g = {}; for (const k of GROUPS) this.g[k] = []; }
  add(group, geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
    const g = geo.clone();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
    const s = Array.isArray(scale) ? new THREE.Vector3(scale[0], scale[1], scale[2]) : new THREE.Vector3(scale, scale, scale);
    m.compose(new THREE.Vector3(pos[0], pos[1], pos[2]), q, s);
    g.applyMatrix4(m);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    (this.g[group] || this.g.hull).push(g);
    return this;
  }
  raw(group, geo) {
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    (this.g[group] || this.g.hull).push(geo);
    return this;
  }
  build() {
    const out = {};
    for (const k of Object.keys(this.g)) {
      if (!this.g[k].length) continue;
      const list = this.g[k].map((g) => {
        // mergeGeometries needs identical attribute sets — strip extras
        const keep = ['position', 'normal', 'uv'];
        for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name);
        if (!g.attributes.normal) g.computeVertexNormals();
        return g.index ? g.toNonIndexed() : g;
      });
      const merged = BGU.mergeGeometries(list, false);
      if (!merged) continue;
      merged.userData.own = true;
      out[k] = merged;
      this.g[k].forEach((g) => g.dispose());
      list.forEach((g) => g.dispose());
    }
    return out;
  }
}

function makeShipMaterials(opts = {}) {
  const panels = hullPanelMaps();
  const hullCol = new THREE.Color(opts.hull || '#8d97a8');
  const accentCol = opts.accent ? new THREE.Color(opts.accent) : hullCol.clone().offsetHSL(0, 0.05, -0.28);
  return {
    hull: new THREE.MeshStandardMaterial({
      color: hullCol,
      metalness: opts.metal ?? 0.36, roughness: Math.max(opts.rough ?? 0.5, 0.5), flatShading: false,
      emissive: new THREE.Color(opts.emissive || '#000000'), emissiveIntensity: 0.22,
      envMapIntensity: 1.0,
      map: panels.map, roughnessMap: panels.rough,
    }),
    accent: new THREE.MeshStandardMaterial({
      color: accentCol, metalness: 0.6, roughness: 0.42, envMapIntensity: 0.9, roughnessMap: panels.rough,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: new THREE.Color(opts.dark || '#2a2f3a'), metalness: 0.55, roughness: 0.58,
      envMapIntensity: 0.8, roughnessMap: panels.rough,
    }),
    engine: new THREE.MeshStandardMaterial({
      color: new THREE.Color('#4a4e56'), metalness: 0.8, roughness: 0.52, envMapIntensity: 0.8,
      emissive: new THREE.Color(opts.glowEmit || '#59d8ff'), emissiveIntensity: 0.1,
    }),
    glow: new THREE.MeshStandardMaterial({
      color: new THREE.Color(opts.glow || '#041018'),
      emissive: new THREE.Color(opts.glowEmit || '#59d8ff'), emissiveIntensity: 1.7,
      metalness: 0, roughness: 1, toneMapped: false,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#0a1a26'), metalness: 0.2, roughness: 0.06,
      emissive: new THREE.Color(opts.glassEmit || '#1d5f7a'), emissiveIntensity: 0.6,
      envMapIntensity: 1.4, clearcoat: 1, clearcoatRoughness: 0.05, reflectivity: 0.8,
    }),
    navL: new THREE.MeshStandardMaterial({ color: '#200000', emissive: new THREE.Color('#ff2a2a'), emissiveIntensity: 0.9, toneMapped: false }),
    navR: new THREE.MeshStandardMaterial({ color: '#002000', emissive: new THREE.Color('#2aff6a'), emissiveIntensity: 0.9, toneMapped: false }),
    strobe: new THREE.MeshStandardMaterial({ color: '#202020', emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.8, toneMapped: false }),
  };
}

export function assemble(parts, mats) {
  const grp = new THREE.Group();
  for (const k of Object.keys(parts)) {
    if (!mats[k]) continue;
    const m = new THREE.Mesh(parts[k], mats[k]);
    m.name = k;
    m.castShadow = false;
    grp.add(m);
  }
  return grp;
}

// ---- shared detail helpers ------------------------------------------------
function addNozzle(b, x, y, z, r, len = 0.9, flare = 1.25) {
  const n = nozzle(r, len, flare);
  n.bell.translate(x, y, z); b.raw('engine', n.bell);
  n.throat.translate(x, y, z); b.raw('dark', n.throat);
  n.inner.translate(x, y, z); b.raw('dark', n.inner);
  n.disc.translate(x, y, z); b.raw('glow', n.disc);
}
function gunBarrel(b, x, y, z, len = 1.15, r = 0.06) {
  const inward = x === 0 ? 0 : Math.sign(x);
  b.raw('dark', loft([
    { z: z + 0.32, w: r * 7.2, h: r * 5.6, x: x - inward * r * 2.4, y, n: 2.6 },
    { z: z, w: r * 4.4, h: r * 3.6, x, y, n: 2.4 },
    { z: z - len * 0.28, w: r * 2.2, h: r * 2.0, x, y, n: 2.2 },
  ], { segs: 10, capStart: true }));
  const barrel = new THREE.CylinderGeometry(r, r * 1.12, len * 0.72, 8);
  barrel.rotateX(Math.PI / 2); barrel.translate(x, y, z - len * 0.52);
  b.raw('dark', barrel);
}
function navLights(b, x, y, z) {
  const s = new THREE.SphereGeometry(0.055, 8, 6);
  const l = s.clone(); l.translate(-x, y, z); b.raw('navL', l);
  const r = s.clone(); r.translate(x, y, z); b.raw('navR', r);
}
function rcsPods(b, x, y, z) {
  for (const sx of [-1, 1]) {
    b.raw('dark', loft([
      { z: z - 0.14, w: 0.05, h: 0.1, x: sx * x * 0.45, y, n: 2.4 },
      { z: z, w: 0.18, h: 0.13, x: sx * x, y, n: 2.4 },
      { z: z + 0.14, w: 0.05, h: 0.1, x: sx * x * 0.45, y, n: 2.4 },
    ], { segs: 8, capStart: true, capEnd: true }));
  }
}
function pylon(b, ax, ay, az, bx, by, bz, thick = 0.22, chord = 1.2) {
  b.raw('dark', loft([
    { z: az - chord * 0.28, w: thick * 0.55, h: thick * 0.35, x: ax, y: ay, n: 2.4 },
    { z: (az + bz) * 0.5, w: thick, h: thick * 0.65, x: (ax + bx) * 0.5, y: (ay + by) * 0.5, n: 2.4 },
    { z: bz + chord * 0.18, w: thick * 0.8, h: thick * 0.5, x: bx, y: by, n: 2.4 },
  ], { segs: 10, capStart: true, capEnd: true }));
}
function spineStrip(b, w, z0, z1, y) {
  const g = new THREE.BoxGeometry(w, 0.05, z1 - z0);
  g.translate(0, y, (z0 + z1) / 2);
  b.raw('accent', g);
}
function radiatorFins(b, x, y, z, n, w, h) {
  for (let i = 0; i < n; i++) {
    const f = new THREE.BoxGeometry(0.03, h, w);
    f.translate(x, y, z + (i - (n - 1) / 2) * 0.32);
    b.raw('accent', f);
  }
}
function tailPlate(b, z, w, h, n = 2.6, x = 0, y = 0) {
  b.raw('dark', loft([{ z: z - 0.02, w: w * 0.985, h: h * 0.985, n, x, y }, { z: z + 0.06, w: w * 0.9, h: h * 0.9, n, x, y }], { segs: 24, capEnd: true }));
  const vent = new THREE.BoxGeometry(w * 0.5, h * 0.12, 0.05); vent.translate(x, y + h * 0.18, z + 0.07); b.raw('accent', vent);
  const vent2 = vent.clone(); vent2.translate(0, -h * 0.36, 0); b.raw('accent', vent2);
}
function rectNozzle(b, x, y, z, w, h, depth = 0.55) {
  const housing = new THREE.BoxGeometry(w * 1.18, h * 1.25, depth);
  housing.translate(x, y, z);
  b.raw('engine', housing);
  const lip = new THREE.BoxGeometry(w * 1.28, h * 1.38, 0.07);
  lip.translate(x, y, z + depth * 0.48);
  b.raw('dark', lip);
  const glow = new THREE.BoxGeometry(w, h, 0.09);
  glow.translate(x, y, z + depth * 0.52);
  b.raw('glow', glow);
}
function cargoRibs(b, z0, z1, w, h, n = 5) {
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    const z = z0 + t * (z1 - z0);
    const top = new THREE.BoxGeometry(w * 0.9, 0.07, 0.11);
    top.translate(0, h * 0.52, z);
    b.raw('dark', top);
    for (const s of [-1, 1]) {
      const side = new THREE.BoxGeometry(0.07, h * 0.62, 0.11);
      side.translate(s * w * 0.52, 0.05, z);
      b.raw('dark', side);
    }
  }
}
function gearPod(b, x, y, z, len = 1.5) {
  b.raw('dark', loft([
    { z: z - len * 0.5, w: 0.2, h: 0.16, x, y, n: 2.4 },
    { z, w: 0.34, h: 0.26, x, y, n: 2.4 },
    { z: z + len * 0.5, w: 0.2, h: 0.14, x, y, n: 2.4 },
  ], { segs: 10, capStart: true, capEnd: true }));
}
/** Tricycle bays in hull-local units (mesh already scaled). */
function triGear(belly, noseZ, mainX, mainZ, lenN = 1.05, lenM = 1.22) {
  return [
    { x: 0, y: belly, z: noseZ, len: lenN, dual: false, splay: 0, fold: 1.28 },
    { x: -mainX, y: belly, z: mainZ, len: lenM, dual: true, splay: -0.18, fold: -1.42 },
    { x: mainX, y: belly, z: mainZ, len: lenM, dual: true, splay: 0.18, fold: -1.42 },
  ];
}
// --------------------------------------------------------------------------
//  ASTEROIDS
// --------------------------------------------------------------------------
const _astNoise = {};
export function makeAsteroidGeometry(seed = 1, detail = 1, roughness = 0.4) {
  const key = `${seed}_${detail}_${roughness}`;
  if (_astNoise[key]) return _astNoise[key];
  const g = new THREE.IcosahedronGeometry(1, detail);
  const noise = new Simplex(seed * 7919 + 13);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  const counts = {};
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key2 = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
    if (counts[key2] === undefined) {
      const n = noise.noise(v.x * 1.7, v.y * 1.7, v.z * 1.7);
      const n2 = noise.noise(v.x * 4.3 + 9, v.y * 4.3, v.z * 4.3) * 0.4;
      counts[key2] = 1 + clamp(n * roughness + n2 * roughness * 0.6, -0.75, 0.75);
    }
    v.multiplyScalar(counts[key2]);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  g.userData.own = false;   // cached & shared — never dispose
  _astNoise[key] = g;
  return g;
}

// --------------------------------------------------------------------------
//  PLAYER SHIPS
// --------------------------------------------------------------------------
export const FLEET_IDS = ['aurora'];
export const COMING_IDS = ['pyre', 'marrow'];
export const HANGAR_IDS = ['aurora'];

/** Old 13-hull saves → nearest keeper. */
export const LEGACY_SHIPS = {
  vector: 'aurora',
  lancet: 'aurora',
  atlas: 'aurora',
  kaluga: 'aurora',
  icarus: 'aurora',
  helios: 'aurora',
  lattice: 'aurora',
  mirror: 'aurora',
  aegis: 'aurora',
  raven: 'aurora',
  volta: 'aurora',
  vesper: 'aurora',
  ember: 'aurora',
  nimbus: 'aurora',
  anvil: 'aurora',
  specter: 'aurora',
};

export function resolveShipId(id) {
  const mapped = LEGACY_SHIPS[id] || id;
  return SHIP_DEFS[mapped] ? mapped : 'aurora';
}

export const SHIP_DEFS = {
  aurora: {
    id: 'aurora',
    name: 'Aurora',
    cls: 'Survey Fighter',
    role: 'survey',
    fit: 'Scan survey · atmosphere skims',
    desc: 'Delta fighter. Two engines, canopy on the spine, sensors under the nose. This is what you launch in.',
    lore: 'Yards stamp one for every new expedition. It charts worlds. Small hold. Two guns. Swap it when you can afford a specialist.',
    guide: 'Issued at NEW EXPEDITION. Survey contracts. Swap at any station shipyard.',
    price: 0,
    stats: { speed: 780, boost: 2.15, accel: 235, turn: 1.78, hull: 110, shield: 150, cargo: 16, hardpoints: 2, jumpRange: 7400, fuel: 480, mining: 0.85, signature: 1.0, sensors: 1.22 },
    colors: { hull: '#c4b49a', dark: '#1a1c22', glowEmit: '#3ec8ff', glassEmit: '#1a6a88', metal: 0.42, rough: 0.38 },
  },
  vesper: {
    id: 'vesper',
    name: 'Vesper',
    cls: 'Cargo Hauler',
    role: 'haul',
    fit: 'Haul cargo · courier passengers',
    desc: 'Cockpit up front, hold in the middle, engines on pylons. Slow. Carries what the others cannot.',
    lore: 'Buy it at a pad when a contract asks for tonnage. Overflow from a smaller hull sits in the station locker.',
    guide: 'Buy at station from chapter 1. Cargo and courier work.',
    price: 186000,
    stats: { speed: 440, boost: 1.52, accel: 115, turn: 0.88, hull: 200, shield: 110, cargo: 68, hardpoints: 2, jumpRange: 6200, fuel: 640, mining: 1.15, signature: 1.28, sensors: 0.88 },
    colors: { hull: '#8e97a3', dark: '#1a1e26', glowEmit: '#5fd8ff', glassEmit: '#2b7fa0', metal: 0.48, rough: 0.52 },
  },
  ember: {
    id: 'ember',
    name: 'Ember',
    cls: 'Stealth Scout',
    role: 'scout',
    fit: 'Stealth beacons · fast dwells',
    desc: 'Flat dart. Buried engines. Almost no radar return. Fast. No cargo.',
    lore: 'Buy it for beacons and hot systems. Do not take cargo contracts — the hold is a joke.',
    guide: 'Buy at station from chapter 1. Silent work. Tiny hold.',
    price: 245000,
    stats: { speed: 1020, boost: 2.62, accel: 325, turn: 1.18, hull: 72, shield: 64, cargo: 5, hardpoints: 2, jumpRange: 5000, fuel: 380, mining: 0.28, signature: 0.48, sensors: 1.18 },
    colors: { hull: '#5c5752', dark: '#12100e', glowEmit: '#ff5a2a', glassEmit: '#4a2418', metal: 0.55, rough: 0.36 },
  },
  anvil: {
    id: 'anvil',
    name: 'Anvil',
    cls: 'Gunship',
    role: 'gunship',
    fit: 'Bounty hunts · hostile space',
    desc: 'Wide hull, chin cannon, armour on the sides. Turns like a brick. Hits like one.',
    lore: 'Issued on NEW EXPEDITION or buy at a pad from chapter 1. Bounty and hunt contracts. Modest hold — use the locker.',
    guide: 'Fly it from NEW EXPEDITION. Fighting.',
    price: 720000,
    stats: { speed: 500, boost: 1.68, accel: 148, turn: 1.02, hull: 340, shield: 360, cargo: 28, hardpoints: 4, jumpRange: 4600, fuel: 560, mining: 1.0, signature: 1.42, sensors: 0.82 },
    colors: { hull: '#7a8490', dark: '#161a22', glowEmit: '#ff9a4d', glassEmit: '#8a4420', metal: 0.5, rough: 0.48 },
  },
  specter: {
    id: 'specter',
    name: 'Specter Diamond',
    cls: 'Interceptor',
    role: 'interceptor',
    fit: 'Combat intercept · named hunts',
    desc: 'The one on the title screen. Diamond wings, four guns, barely shows on radar.',
    lore: 'Unlocks chapter 7. Hunts. Arrive unseen.',
    guide: 'Campaign unlock (chapter 7). Title hull.',
    price: 1480000,
    stats: { speed: 900, boost: 2.28, accel: 265, turn: 1.96, hull: 155, shield: 230, cargo: 8, hardpoints: 4, jumpRange: 5400, fuel: 440, mining: 0.4, signature: 0.62, sensors: 1.05 },
    colors: { hull: '#5e6874', dark: '#101418', glowEmit: '#7fd0ff', glassEmit: '#1a3a50', metal: 0.58, rough: 0.3 },
  },
  pyre: {
    id: 'pyre',
    name: 'Pyre',
    cls: 'Mining Cutter',
    role: 'mine',
    comingSoon: true,
    fit: 'Ore cuts · belt work',
    desc: 'Belt cutter. Chisel hull, drill collar faired into the nose, hoppers grown from the waist. Not in this build.',
    lore: 'Yards are still welding the production run.',
    guide: 'Coming soon.',
    price: 0,
    stats: { speed: 380, boost: 1.4, accel: 98, turn: 0.74, hull: 260, shield: 90, cargo: 54, hardpoints: 2, jumpRange: 4800, fuel: 520, mining: 1.85, signature: 1.35, sensors: 0.8 },
    colors: { hull: '#8a7a68', dark: '#1a1612', glowEmit: '#ff7a3a', glassEmit: '#6a3a20', metal: 0.44, rough: 0.58 },
  },
  marrow: {
    id: 'marrow',
    name: 'Marrow',
    cls: 'Salvage Tug',
    role: 'salvage',
    comingSoon: true,
    fit: 'Wreck pull · station tow',
    desc: 'Short tug. Closed nose, manipulator arms grown from the shoulders. Pulls wrecks, not races. Not in this build.',
    lore: 'Concord has the frame. Not the software.',
    guide: 'Coming soon.',
    price: 0,
    stats: { speed: 360, boost: 1.35, accel: 90, turn: 0.82, hull: 280, shield: 140, cargo: 36, hardpoints: 2, jumpRange: 4200, fuel: 500, mining: 1.2, signature: 1.5, sensors: 0.92 },
    colors: { hull: '#6e746c', dark: '#141816', glowEmit: '#9aff6a', glassEmit: '#2a4a30', metal: 0.46, rough: 0.55 },
  },
  nimbus: {
    id: 'nimbus',
    name: 'Nimbus',
    cls: 'Relay Cutter',
    role: 'relay',
    comingSoon: true,
    fit: 'Long range · sheet relays',
    desc: 'Long spine, dish faired into the back, quiet engines. Built to sit on a filament and listen. Not in this build.',
    lore: 'Sheet Office prototype. No delivery date.',
    guide: 'Coming soon.',
    price: 0,
    stats: { speed: 620, boost: 1.85, accel: 160, turn: 1.05, hull: 130, shield: 170, cargo: 12, hardpoints: 2, jumpRange: 9200, fuel: 720, mining: 0.35, signature: 0.78, sensors: 1.55 },
    colors: { hull: '#7a8896', dark: '#141820', glowEmit: '#7ec8ff', glassEmit: '#1a4a68', metal: 0.52, rough: 0.4 },
  },
};

// Each builder receives the PartBuilder and returns { length, engines:[[x,y,z]], guns:[[x,y,z]] }.
const HULLS = {
  aurora(b) {
    b.raw('hull', loft([
      { z: -5.7, w: 0.16, h: 0.1, n: 1.5, bot: 0.7 },
      { z: -4.6, w: 0.78, h: 0.46, n: 1.7, bot: 0.72 },
      { z: -3.1, w: 1.42, h: 0.86, n: 1.85, bot: 0.68 },
      { z: -1.0, w: 1.78, h: 1.04, n: 2.0, bot: 0.62 },
      { z: 1.2, w: 1.88, h: 1.08, n: 2.1, bot: 0.62 },
      { z: 2.9, w: 1.62, h: 0.9, n: 2.1, bot: 0.68 },
      { z: 4.05, w: 1.12, h: 0.58, n: 2.2 },
    ], { segs: 28, capEnd: true }));
    tailPlate(b, 4.05, 1.12, 0.58, 2.2);
    b.raw('glass', canopy(-3.35, -1.05, 0.7, 0.4, 0.54));
    const frame = new THREE.BoxGeometry(0.76, 0.05, 0.1); frame.translate(0, 0.74, -2.35); b.raw('dark', frame);
    spineStrip(b, 0.26, -2.7, 3.6, 0.56);
    b.raw('dark', loft([
      { z: -3.6, w: 0.7, h: 0.08, y: -0.42, n: 2.2 },
      { z: -4.6, w: 0.85, h: 0.14, y: -0.4, n: 2.2 },
      { z: -5.15, w: 0.35, h: 0.08, y: -0.32, n: 2.2 },
    ], { segs: 12, capStart: true, capEnd: true }));
    for (const s of [-1, 1]) {
      b.raw('hull', wing({ side: s, x0: s * 0.9, y0: -0.04, z0: 1.15, span: 3.45, root: 5.15, tip: 0.68, sweep: 2.65, dihedral: -0.04, thick: 0.22, n: 1.35 }));
      b.raw('hull', wing({ side: s, x0: s * 0.62, y0: 0.04, z0: -2.55, span: 1.05, root: 1.45, tip: 0.32, sweep: 0.48, dihedral: 0.04, thick: 0.1, n: 1.3 }));
      b.raw('hull', loft([
        { z: 0.9, w: 0.55, h: 0.55, x: s * 0.92, y: -0.02, n: 2.4 },
        { z: 1.85, w: 0.92, h: 0.82, x: s * 1.02, y: -0.02, n: 2.4 },
        { z: 3.55, w: 0.96, h: 0.86, x: s * 1.02, y: -0.02, n: 2.4 },
        { z: 4.35, w: 0.78, h: 0.7, x: s * 1.02, y: -0.02, n: 2.4 },
      ], { segs: 16, capStart: true, capEnd: true }));
      addNozzle(b, s * 1.02, -0.02, 4.55, 0.38, 0.82);
      b.raw('hull', fin({ side: s, x0: s * 1.0, y0: 0.42, z0: 3.05, root: 1.48, tip: 0.42, sweep: 0.78, height: 0.95, cant: 0.22 }));
      gunBarrel(b, s * 0.95, -0.3, -1.35, 1.15, 0.055);
      const wt = new THREE.BoxGeometry(0.22, 0.1, 0.7); wt.translate(s * 4.28, -0.16, 3.4); b.raw('dark', wt);
    }
    b.raw('dark', hatch(1.1, 2.15, 0, -0.54, 0.55));
    navLights(b, 4.28, -0.16, 3.4);
    return { length: 10.3, engines: [[-1.02, -0.02, 5.0], [1.02, -0.02, 5.0]], guns: [[-0.95, -0.3, -2.5], [0.95, -0.3, -2.5]], gear: triGear(-0.54, -2.15, 0.78, 1.05) };
  },

  ember(b) {
    b.raw('hull', loft([
      { z: -6.15, w: 0.12, h: 0.08, n: 1.25, bot: 0.8 },
      { z: -4.9, w: 0.9, h: 0.32, n: 1.32, bot: 0.72 },
      { z: -3.1, w: 1.72, h: 0.52, n: 1.38, bot: 0.68 },
      { z: -0.5, w: 2.22, h: 0.62, n: 1.42, bot: 0.68 },
      { z: 1.9, w: 2.08, h: 0.56, n: 1.42, bot: 0.7 },
      { z: 3.7, w: 1.42, h: 0.46, n: 1.48, bot: 0.75 },
      { z: 4.65, w: 0.88, h: 0.34, n: 1.5 },
    ], { segs: 28, capEnd: true }));
    tailPlate(b, 4.65, 0.88, 0.34, 1.5);
    b.raw('glass', loft([
      { z: -3.55, w: 0.32, h: 0.1, y: 0.28, n: 1.6 },
      { z: -2.55, w: 0.6, h: 0.2, y: 0.36, n: 1.8 },
      { z: -1.35, w: 0.52, h: 0.12, y: 0.34, n: 1.8 },
    ], { segs: 12, capStart: true, capEnd: true }));
    spineStrip(b, 0.16, -2.4, 3.8, 0.34);
    for (const s of [-1, 1]) {
      b.raw('hull', wing({ side: s, x0: s * 1.08, y0: -0.02, z0: 0.85, span: 3.35, root: 5.5, tip: 0.52, sweep: 3.15, dihedral: -0.02, thick: 0.13, n: 1.18 }));
      b.raw('hull', wing({ side: s, x0: s * 0.55, y0: 0.02, z0: -3.35, span: 1.15, root: 2.15, tip: 0.38, sweep: 1.4, dihedral: 0.02, thick: 0.08, n: 1.18 }));
      b.raw('hull', loft([
        { z: 0.6, w: 0.55, h: 0.28, x: s * 0.7, y: -0.06, n: 1.6 },
        { z: 1.7, w: 0.74, h: 0.42, x: s * 0.72, y: -0.06, n: 1.6 },
        { z: 3.9, w: 0.74, h: 0.42, x: s * 0.72, y: -0.06, n: 1.6 },
        { z: 4.55, w: 0.64, h: 0.32, x: s * 0.72, y: -0.06, n: 1.6 },
      ], { segs: 14, capStart: true, capEnd: true }));
      rectNozzle(b, s * 0.72, -0.06, 4.72, 0.5, 0.18, 0.48);
      b.raw('hull', fin({ side: s, x0: s * 0.7, y0: 0.26, z0: 3.45, root: 1.55, tip: 0.38, sweep: 0.92, height: 1.05, cant: 0.48, thick: 0.1 }));
      gunBarrel(b, s * 0.48, -0.22, -4.2, 0.95, 0.045);
    }
    b.raw('dark', loft([
      { z: 2.9, w: 0.12, h: 0.08, y: -0.28, n: 2.2 },
      { z: 3.5, w: 0.1, h: 0.55, y: -0.55, n: 2.2 },
      { z: 4.0, w: 0.08, h: 0.2, y: -0.72, n: 2.2 },
    ], { segs: 8, capStart: true, capEnd: true }));
    navLights(b, 4.35, -0.04, 3.5);
    return { length: 11.2, engines: [[-0.72, -0.06, 5.0], [0.72, -0.06, 5.0]], guns: [[-0.48, -0.22, -5.15], [0.48, -0.22, -5.15]], gear: triGear(-0.30, -2.55, 0.72, 0.55, 0.88, 1.02) };
  },

  specter(b) {
    b.raw('hull', loft([
      { z: -6.05, w: 0.14, h: 0.09, n: 1.22 },
      { z: -4.55, w: 1.08, h: 0.48, n: 1.28, bot: 0.68 },
      { z: -2.35, w: 2.2, h: 0.9, n: 1.32, bot: 0.64 },
      { z: 0.05, w: 2.82, h: 1.06, n: 1.38, bot: 0.64 },
      { z: 2.25, w: 2.48, h: 0.88, n: 1.4, bot: 0.7 },
      { z: 4.05, w: 1.5, h: 0.52, n: 1.5 },
    ], { segs: 28, capEnd: true }));
    tailPlate(b, 4.05, 1.5, 0.52, 1.5);
    b.raw('glass', canopy(-3.55, -1.15, 0.76, 0.4, 0.5));
    spineStrip(b, 0.2, -2.7, 3.5, 0.54);
    for (const s of [-1, 1]) {
      b.raw('hull', loft([
        { z: -2.4, w: 0.4, h: 0.28, x: s * 1.05, y: -0.12, n: 1.5 },
        { z: -1.5, w: 1.05, h: 0.52, x: s * 1.28, y: -0.1, n: 1.4 },
        { z: -0.4, w: 1.12, h: 0.48, x: s * 1.32, y: -0.08, n: 1.4 },
        { z: 0.5, w: 0.7, h: 0.32, x: s * 1.2, y: -0.06, n: 1.5 },
      ], { segs: 14, capStart: true, capEnd: true }));
      b.raw('dark', loft([
        { z: -2.35, w: 0.55, h: 0.22, x: s * 1.28, y: -0.1, n: 1.4 },
        { z: -1.55, w: 0.82, h: 0.32, x: s * 1.3, y: -0.1, n: 1.4 },
      ], { segs: 10, capStart: true }));
      b.raw('hull', wing({ side: s, x0: s * 1.35, y0: -0.04, z0: 1.28, span: 3.4, root: 4.65, tip: 0.82, sweep: 2.55, thick: 0.16, n: 1.18 }));
      b.raw('hull', fin({ side: s, x0: s * 1.05, y0: 0.38, z0: 3.15, root: 1.95, tip: 0.52, sweep: 1.12, height: 1.55, cant: 0.48, thick: 0.1 }));
      b.raw('hull', wing({ side: s, x0: s * 1.05, y0: -0.02, z0: 3.7, span: 1.2, root: 1.38, tip: 0.48, sweep: 0.72, thick: 0.1, n: 1.18 }));
      rectNozzle(b, s * 0.55, -0.04, 3.85, 0.7, 0.2, 0.62);
      gunBarrel(b, s * 1.15, -0.28, -2.85, 1.05, 0.05);
      gunBarrel(b, s * 2.05, -0.12, -0.4, 0.95, 0.05);
    }
    b.raw('dark', hatch(1.2, 2.0, 0, -0.48, 0.48));
    navLights(b, 4.7, -0.04, 3.45);
    return { length: 10.9, engines: [[-0.55, -0.04, 4.2], [0.55, -0.04, 4.2]], guns: [[-2.05, -0.12, -1.35], [2.05, -0.12, -1.35], [-1.15, -0.28, -3.9], [1.15, -0.28, -3.9]], gear: triGear(-0.48, -2.35, 0.95, 0.7) };
  },

  vesper(b) {
    b.raw('hull', loft([
      { z: -5.55, w: 0.5, h: 0.34, y: 0.22, n: 1.7, bot: 0.55 },
      { z: -4.55, w: 1.38, h: 0.98, y: 0.22, n: 2.2, bot: 0.68 },
      { z: -3.45, w: 1.92, h: 1.42, y: 0.1, n: 2.8, bot: 0.75 },
      { z: -2.55, w: 2.4, h: 1.82, y: 0.0, n: 3.8, bot: 0.82 },
    ], { segs: 24, capStart: true }));
    b.raw('glass', loft([
      { z: -5.15, w: 0.68, h: 0.2, y: 0.48, n: 2.2 },
      { z: -4.35, w: 1.22, h: 0.4, y: 0.68, n: 2.4 },
      { z: -3.65, w: 1.12, h: 0.24, y: 0.72, n: 2.4 },
    ], { segs: 14, capStart: true, capEnd: true }));
    b.raw('hull', loft([
      { z: -2.55, w: 2.4, h: 1.88, n: 4.4 },
      { z: 0.5, w: 2.62, h: 2.08, n: 4.6 },
      { z: 3.15, w: 2.55, h: 2.02, n: 4.6 },
      { z: 4.05, w: 2.12, h: 1.68, n: 4.2 },
    ], { segs: 22, capEnd: true }));
    tailPlate(b, 4.05, 2.12, 1.68, 4.2);
    cargoRibs(b, -2.05, 3.15, 2.62, 2.08, 6);
    spineStrip(b, 0.42, -2.35, 3.55, 1.08);
    for (const s of [-1, 1]) {
      const door = new THREE.BoxGeometry(0.06, 1.15, 2.2); door.translate(s * 1.31, -0.02, 0.4); b.raw('accent', door);
      b.raw('hull', wing({ side: s, x0: s * 1.28, y0: -0.18, z0: 1.7, span: 1.85, root: 2.6, tip: 1.05, sweep: 0.55, dihedral: -0.06, thick: 0.32, n: 1.75 }));
      pylon(b, s * 1.28, -0.18, 1.5, s * 2.05, -0.2, 2.4, 0.28, 1.4);
      b.raw('hull', loft([
        { z: 1.15, w: 0.55, h: 0.5, x: s * 2.05, y: -0.2, n: 2.4 },
        { z: 2.0, w: 1.02, h: 0.95, x: s * 2.08, y: -0.2, n: 2.4 },
        { z: 3.9, w: 1.02, h: 0.95, x: s * 2.08, y: -0.2, n: 2.4 },
        { z: 4.55, w: 0.82, h: 0.76, x: s * 2.08, y: -0.2, n: 2.4 },
      ], { segs: 16, capStart: true, capEnd: true }));
      addNozzle(b, s * 2.08, -0.2, 4.78, 0.44, 0.9, 1.2);
      pylon(b, s * 0.7, -0.95, -0.2, s * 0.82, -1.18, 0.15, 0.16, 0.9);
      gearPod(b, s * 0.82, -1.18, 0.15, 1.35);
      b.raw('dark', fin({ side: s, x0: s * 1.05, y0: 0.95, z0: 3.15, root: 1.18, tip: 0.38, sweep: 0.52, height: 0.72, cant: 0.16 }));
    }
    b.raw('dark', loft([
      { z: -2.8, w: 1.1, h: 0.16, y: -0.82, n: 2.4 },
      { z: -3.7, w: 0.85, h: 0.22, y: -0.78, n: 2.4 },
      { z: -4.4, w: 0.45, h: 0.14, y: -0.62, n: 2.4 },
    ], { segs: 10, capStart: true, capEnd: true }));
    gunBarrel(b, -0.38, -0.78, -4.15, 0.9, 0.05);
    gunBarrel(b, 0.38, -0.78, -4.15, 0.9, 0.05);
    b.raw('dark', hatch(1.55, 2.7, 0, -1.02, 0.75));
    navLights(b, 3.1, -0.2, 2.4);
    return { length: 10.6, engines: [[-2.08, -0.2, 5.25], [2.08, -0.2, 5.25]], guns: [[-0.38, -0.78, -5.05], [0.38, -0.78, -5.05]], gear: triGear(-1.02, -2.35, 0.95, 1.1, 1.28, 1.48) };
  },

  anvil(b) {
    b.raw('hull', loft([
      { z: -5.85, w: 0.62, h: 0.32, n: 1.7, bot: 0.52 },
      { z: -4.35, w: 1.85, h: 0.88, n: 2.0, bot: 0.52 },
      { z: -2.35, w: 2.85, h: 1.38, n: 2.4, bot: 0.48 },
      { z: 0.25, w: 3.25, h: 1.58, n: 2.6, bot: 0.48 },
      { z: 2.45, w: 3.05, h: 1.48, n: 2.6, bot: 0.5 },
      { z: 4.25, w: 2.15, h: 1.12, n: 2.6 },
    ], { segs: 28, capEnd: true }));
    tailPlate(b, 4.25, 2.15, 1.12, 2.6);
    b.raw('glass', loft([
      { z: -4.15, w: 0.68, h: 0.16, y: 0.52, n: 2.2 },
      { z: -3.15, w: 1.12, h: 0.36, y: 0.68, n: 2.4 },
      { z: -1.75, w: 1.02, h: 0.2, y: 0.64, n: 2.4 },
    ], { segs: 14, capStart: true, capEnd: true }));
    b.raw('dark', loft([
      { z: -2.4, w: 1.15, h: 0.22, y: -0.72, n: 2.4 },
      { z: -3.6, w: 0.7, h: 0.36, y: -0.82, n: 2.4 },
      { z: -4.85, w: 0.38, h: 0.28, y: -0.86, n: 2.4 },
    ], { segs: 12, capStart: true, capEnd: true }));
    gunBarrel(b, 0, -0.88, -4.7, 1.05, 0.1);
    spineStrip(b, 0.36, -2.2, 3.6, 0.78);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const plate = new THREE.BoxGeometry(0.1, 0.7, 1.35);
        plate.translate(s * 1.62, 0.02, -2.05 + i * 1.72);
        b.raw('accent', plate);
      }
      b.raw('hull', wing({ side: s, x0: s * 1.6, y0: -0.08, z0: 1.05, span: 3.15, root: 3.45, tip: 1.15, sweep: 1.05, dihedral: -0.05, thick: 0.32, n: 1.55 }));
      b.raw('dark', loft([
        { z: 0.2, w: 0.45, h: 0.28, x: s * 3.15, y: -0.18, n: 2.4 },
        { z: 0.9, w: 0.62, h: 0.42, x: s * 3.22, y: -0.2, n: 2.4 },
        { z: 1.7, w: 0.5, h: 0.32, x: s * 3.22, y: -0.2, n: 2.4 },
      ], { segs: 10, capStart: true, capEnd: true }));
      gunBarrel(b, s * 3.22, -0.2, 0.15, 1.05, 0.07);
      gunBarrel(b, s * 1.05, -0.62, -3.15, 1.0, 0.065);
      b.raw('hull', loft([
        { z: 1.6, w: 0.7, h: 0.55, x: s * 1.15, y: 0.42, n: 2.4 },
        { z: 2.5, w: 1.05, h: 0.92, x: s * 1.22, y: 0.48, n: 2.4 },
        { z: 4.4, w: 1.05, h: 0.92, x: s * 1.22, y: 0.48, n: 2.4 },
        { z: 5.0, w: 0.86, h: 0.76, x: s * 1.22, y: 0.48, n: 2.4 },
      ], { segs: 16, capStart: true, capEnd: true }));
      addNozzle(b, s * 1.22, 0.48, 5.22, 0.46, 0.92, 1.18);
      b.raw('hull', fin({ side: s, x0: s * 1.35, y0: 0.55, z0: 3.5, root: 1.48, tip: 0.48, sweep: 0.7, height: 1.05, cant: 0.28 }));
    }
    b.raw('dark', hatch(1.55, 2.55, 0, -0.8, 0.48));
    navLights(b, 4.7, -0.12, 2.15);
    return { length: 11.5, engines: [[-1.22, 0.48, 5.7], [1.22, 0.48, 5.7]], guns: [[-3.22, -0.2, -0.9], [3.22, -0.2, -0.9], [-1.05, -0.62, -4.15], [1.05, -0.62, -4.15]], gear: triGear(-0.80, -2.2, 1.15, 0.9, 1.18, 1.38) };
  },

  pyre(b) {
    b.raw('hull', loft([
      { z: -6.15, w: 0.22, h: 0.16, n: 1.9, bot: 0.82 },
      { z: -5.25, w: 0.92, h: 0.72, n: 2.6, bot: 0.78 },
      { z: -4.15, w: 1.62, h: 1.18, n: 3.2, bot: 0.7 },
      { z: -2.35, w: 2.15, h: 1.52, n: 3.8, bot: 0.62 },
      { z: -0.15, w: 2.48, h: 1.72, n: 4.2, bot: 0.55 },
      { z: 1.85, w: 2.38, h: 1.62, n: 4.0, bot: 0.58 },
      { z: 3.55, w: 1.82, h: 1.22, n: 3.4 },
      { z: 4.45, w: 1.18, h: 0.82, n: 3.0 },
    ], { segs: 26, capEnd: true }));
    tailPlate(b, 4.45, 1.18, 0.82, 3.0);
    b.raw('dark', loft([
      { z: -4.35, w: 1.48, h: 1.08, n: 3.0 },
      { z: -5.05, w: 1.82, h: 1.38, n: 3.4 },
      { z: -5.55, w: 1.58, h: 1.18, n: 3.2 },
      { z: -5.95, w: 0.88, h: 0.68, n: 2.6 },
    ], { segs: 20, capStart: true, capEnd: true }));
    b.raw('dark', loft([
      { z: -5.85, w: 0.62, h: 0.62, n: 2.6 },
      { z: -6.55, w: 0.16, h: 0.16, n: 2.2 },
    ], { segs: 14, capEnd: true }));
    b.raw('glass', loft([
      { z: -3.95, w: 0.52, h: 0.12, y: 0.62, n: 2.2 },
      { z: -3.15, w: 0.92, h: 0.28, y: 0.78, n: 2.4 },
      { z: -2.15, w: 0.78, h: 0.14, y: 0.72, n: 2.4 },
    ], { segs: 14, capStart: true, capEnd: true }));
    spineStrip(b, 0.28, -2.6, 3.4, 0.88);
    for (const s of [-1, 1]) {
      const door = new THREE.BoxGeometry(0.05, 0.95, 2.35);
      door.translate(s * 1.24, 0.02, 0.15);
      b.raw('accent', door);
      b.raw('hull', loft([
        { z: -1.85, w: 0.42, h: 0.85, x: s * 1.08, y: -0.08, n: 3.4 },
        { z: -0.55, w: 1.05, h: 1.22, x: s * 1.48, y: -0.12, n: 3.8 },
        { z: 1.55, w: 1.05, h: 1.22, x: s * 1.48, y: -0.12, n: 3.8 },
        { z: 2.65, w: 0.48, h: 0.72, x: s * 1.12, y: -0.06, n: 3.2 },
      ], { segs: 16, capStart: true, capEnd: true }));
      b.raw('hull', loft([
        { z: 1.85, w: 0.55, h: 0.55, x: s * 1.12, y: 0.02, n: 2.4 },
        { z: 2.85, w: 0.95, h: 0.88, x: s * 1.22, y: 0.02, n: 2.4 },
        { z: 4.55, w: 0.95, h: 0.88, x: s * 1.22, y: 0.02, n: 2.4 },
        { z: 5.15, w: 0.78, h: 0.72, x: s * 1.22, y: 0.02, n: 2.4 },
      ], { segs: 16, capStart: true, capEnd: true }));
      addNozzle(b, s * 1.22, 0.02, 5.38, 0.4, 0.86, 1.18);
      b.raw('hull', loft([
        { z: -0.35, w: 0.22, h: 0.18, x: s * 0.55, y: -0.82, n: 2.4 },
        { z: 0.35, w: 0.32, h: 0.26, x: s * 0.72, y: -1.12, n: 2.4 },
        { z: 1.15, w: 0.22, h: 0.16, x: s * 0.72, y: -1.12, n: 2.4 },
      ], { segs: 10, capStart: true, capEnd: true }));
      gunBarrel(b, s * 0.58, -0.52, -4.55, 0.82, 0.05);
      b.raw('hull', fin({ side: s, x0: s * 0.95, y0: 0.72, z0: 3.15, root: 1.15, tip: 0.38, sweep: 0.52, height: 0.72, cant: 0.14, thick: 0.1 }));
    }
    b.raw('dark', hatch(1.35, 2.15, 0, -0.86, 0.35));
    navLights(b, 2.05, -0.12, 2.35);
    return { length: 11.8, engines: [[-1.22, 0.02, 5.85], [1.22, 0.02, 5.85]], guns: [[-0.58, -0.52, -5.35], [0.58, -0.52, -5.35]], gear: triGear(-0.86, -2.0, 0.85, 0.8, 1.22, 1.42) };
  },

  marrow(b) {
    b.raw('hull', loft([
      { z: -5.45, w: 0.42, h: 0.32, n: 2.2, bot: 0.78 },
      { z: -4.45, w: 1.28, h: 0.95, n: 2.7, bot: 0.7 },
      { z: -2.75, w: 2.15, h: 1.52, n: 3.2, bot: 0.62 },
      { z: -0.15, w: 2.52, h: 1.78, n: 3.5, bot: 0.58 },
      { z: 2.05, w: 2.32, h: 1.62, n: 3.4, bot: 0.62 },
      { z: 3.75, w: 1.68, h: 1.15, n: 3.0 },
    ], { segs: 26, capStart: true, capEnd: true }));
    tailPlate(b, 3.75, 1.68, 1.15, 3.0);
    b.raw('glass', loft([
      { z: -4.85, w: 0.48, h: 0.12, y: 0.38, n: 2.2 },
      { z: -4.05, w: 0.95, h: 0.32, y: 0.62, n: 2.4 },
      { z: -2.85, w: 0.82, h: 0.16, y: 0.68, n: 2.4 },
    ], { segs: 14, capStart: true, capEnd: true }));
    b.raw('hull', loft([
      { z: -0.55, w: 0.55, h: 0.22, y: 0.92, n: 2.6 },
      { z: 0.55, w: 0.95, h: 0.52, y: 1.08, n: 2.6 },
      { z: 1.75, w: 0.78, h: 0.32, y: 0.98, n: 2.6 },
    ], { segs: 14, capStart: true, capEnd: true }));
    spineStrip(b, 0.26, -2.55, 3.15, 0.92);
    for (const s of [-1, 1]) {
      b.raw('hull', loft([
        { z: -0.55, w: 0.55, h: 0.72, x: s * 1.08, y: 0.12, n: 2.8 },
        { z: 0.15, w: 0.78, h: 0.72, x: s * 1.62, y: 0.16, n: 2.8 },
        { z: 0.65, w: 0.52, h: 0.52, x: s * 2.05, y: 0.12, n: 2.6 },
      ], { segs: 14, capStart: true, capEnd: true }));
      b.raw('hull', loft([
        { z: 0.35, w: 0.48, h: 0.42, x: s * 1.85, y: 0.1, n: 2.6 },
        { z: -1.25, w: 0.4, h: 0.34, x: s * 2.32, y: -0.04, n: 2.4 },
        { z: -2.75, w: 0.34, h: 0.28, x: s * 2.52, y: -0.14, n: 2.4 },
        { z: -3.45, w: 0.42, h: 0.2, x: s * 2.58, y: -0.16, n: 2.4 },
      ], { segs: 12, capStart: true, capEnd: true }));
      b.raw('dark', loft([
        { z: -3.25, w: 0.16, h: 0.14, x: s * 2.42, y: -0.02, n: 2.2 },
        { z: -3.95, w: 0.1, h: 0.08, x: s * 2.28, y: 0.16, n: 2.2 },
      ], { segs: 8, capStart: true, capEnd: true }));
      b.raw('dark', loft([
        { z: -3.25, w: 0.16, h: 0.14, x: s * 2.68, y: -0.28, n: 2.2 },
        { z: -3.95, w: 0.1, h: 0.08, x: s * 2.82, y: -0.46, n: 2.2 },
      ], { segs: 8, capStart: true, capEnd: true }));
      b.raw('hull', loft([
        { z: 1.45, w: 0.55, h: 0.5, x: s * 0.95, y: 0.08, n: 2.4 },
        { z: 2.45, w: 0.98, h: 0.9, x: s * 1.08, y: 0.08, n: 2.4 },
        { z: 4.15, w: 0.98, h: 0.9, x: s * 1.08, y: 0.08, n: 2.4 },
        { z: 4.75, w: 0.8, h: 0.72, x: s * 1.08, y: 0.08, n: 2.4 },
      ], { segs: 16, capStart: true, capEnd: true }));
      addNozzle(b, s * 1.08, 0.08, 4.98, 0.42, 0.86, 1.18);
      gunBarrel(b, s * 0.72, -0.58, -3.55, 0.88, 0.05);
      b.raw('hull', fin({ side: s, x0: s * 0.92, y0: 0.72, z0: 2.85, root: 1.12, tip: 0.35, sweep: 0.48, height: 0.68, cant: 0.16, thick: 0.1 }));
    }
    b.raw('dark', hatch(1.42, 2.05, 0, -0.9, 0.35));
    navLights(b, 2.55, -0.14, 2.05);
    return { length: 10.6, engines: [[-1.08, 0.08, 5.45], [1.08, 0.08, 5.45]], guns: [[-0.72, -0.58, -4.4], [0.72, -0.58, -4.4]], gear: triGear(-0.90, -2.1, 0.90, 0.85, 1.22, 1.38) };
  },

  nimbus(b) {
    b.raw('hull', loft([
      { z: -6.55, w: 0.12, h: 0.08, n: 1.5 },
      { z: -5.15, w: 0.72, h: 0.38, n: 1.7, bot: 0.72 },
      { z: -3.15, w: 1.22, h: 0.62, n: 1.9, bot: 0.68 },
      { z: -0.35, w: 1.48, h: 0.78, n: 2.05, bot: 0.68 },
      { z: 2.15, w: 1.38, h: 0.7, n: 2.1, bot: 0.7 },
      { z: 4.15, w: 0.98, h: 0.48, n: 2.15 },
      { z: 4.85, w: 0.62, h: 0.32, n: 2.2 },
    ], { segs: 26, capEnd: true }));
    tailPlate(b, 4.85, 0.62, 0.32, 2.2);
    b.raw('glass', canopy(-4.05, -1.85, 0.58, 0.28, 0.4));
    spineStrip(b, 0.16, -3.35, 3.85, 0.4);
    b.raw('hull', loft([
      { z: -0.15, w: 0.42, h: 0.1, y: 0.4, n: 2.2 },
      { z: 0.75, w: 1.22, h: 0.38, y: 0.58, n: 2.3 },
      { z: 1.65, w: 1.48, h: 0.46, y: 0.64, n: 2.3 },
      { z: 2.55, w: 1.05, h: 0.26, y: 0.5, n: 2.2 },
      { z: 3.25, w: 0.38, h: 0.08, y: 0.38, n: 2.2 },
    ], { segs: 18, capStart: true, capEnd: true }));
    b.raw('dark', loft([
      { z: 0.85, w: 1.05, h: 0.08, y: 0.88, n: 2.2 },
      { z: 1.55, w: 1.38, h: 0.12, y: 0.94, n: 2.2 },
      { z: 2.25, w: 0.95, h: 0.08, y: 0.86, n: 2.2 },
    ], { segs: 16, capStart: true, capEnd: true }));
    for (const s of [-1, 1]) {
      b.raw('hull', wing({ side: s, x0: s * 0.7, y0: 0.0, z0: 1.15, span: 2.95, root: 3.55, tip: 0.62, sweep: 1.85, dihedral: 0.06, thick: 0.1, n: 1.25 }));
      b.raw('hull', loft([
        { z: 1.65, w: 0.38, h: 0.26, x: s * 0.58, y: -0.04, n: 2.2 },
        { z: 2.75, w: 0.68, h: 0.44, x: s * 0.64, y: -0.04, n: 2.2 },
        { z: 4.65, w: 0.68, h: 0.44, x: s * 0.64, y: -0.04, n: 2.2 },
        { z: 5.25, w: 0.52, h: 0.32, x: s * 0.64, y: -0.04, n: 2.2 },
      ], { segs: 14, capStart: true, capEnd: true }));
      rectNozzle(b, s * 0.64, -0.04, 5.38, 0.46, 0.16, 0.42);
      b.raw('hull', fin({ side: s, x0: s * 0.58, y0: 0.3, z0: 3.75, root: 1.45, tip: 0.38, sweep: 0.72, height: 0.92, cant: 0.2, thick: 0.08 }));
      gunBarrel(b, s * 0.48, -0.2, -3.85, 0.92, 0.042);
    }
    navLights(b, 3.55, 0.04, 2.45);
    return { length: 12.0, engines: [[-0.64, -0.04, 5.6], [0.64, -0.04, 5.6]], guns: [[-0.48, -0.2, -4.75], [0.48, -0.2, -4.75]], gear: triGear(-0.38, -2.5, 0.62, 0.7, 0.95, 1.08) };
  },
};

export const HULL_LAYOUT = {};

export function makeShipMesh(def, scale = 1) {
  const b = new PartBuilder();
  const id = def.id;
  const builder = HULLS[id] || HULLS.aurora;
  const layout = builder(b);
  HULL_LAYOUT[id] = layout;

  const parts = b.build();
  const mats = makeShipMaterials(def.colors);
  const grp = assemble(parts, mats);
  grp.scale.setScalar(scale);
  grp.userData.enginePos = layout.engines;
  grp.userData.guns = layout.guns;
  grp.userData.gear = layout.gear;
  grp.userData.length = layout.length;
  return grp;
}

export function shipLayout(id) {
  if (HULL_LAYOUT[id]) return HULL_LAYOUT[id];
  const b = new PartBuilder();
  const layout = (HULLS[id] || HULLS.aurora)(b);
  for (const k of Object.keys(b.g)) b.g[k].forEach((g) => g.dispose());
  HULL_LAYOUT[id] = layout;
  return layout;
}

/** Choir void-craft — closed lofted hull, not paper vanes / bloom rings. */
export function makeChoirMesh(scale = 1) {
  const b = new PartBuilder();
  b.raw('hull', loft([
    { z: -5.35, w: 0.06, h: 0.06, n: 1.35 },
    { z: -4.35, w: 0.72, h: 0.48, n: 1.4 },
    { z: -3.15, w: 1.38, h: 0.92, n: 1.45, bot: 0.82 },
    { z: -1.35, w: 1.92, h: 1.22, n: 1.5, bot: 0.78 },
    { z: 0.35, w: 2.08, h: 1.28, n: 1.5, bot: 0.8 },
    { z: 2.15, w: 1.62, h: 1.02, n: 1.55 },
    { z: 3.85, w: 1.05, h: 0.72, n: 1.6 },
    { z: 4.65, w: 0.62, h: 0.42, n: 1.7 },
  ], { segs: 26, capStart: true, capEnd: true }));
  tailPlate(b, 4.65, 0.62, 0.42, 1.7);
  // Solid mid belt (closed volume) — a torus here read as a hole through the hull.
  b.raw('dark', loft([
    { z: -0.35, w: 2.18, h: 1.38, n: 1.5, bot: 0.8 },
    { z: 0.25, w: 2.32, h: 1.48, n: 1.5, bot: 0.8 },
    { z: 0.95, w: 2.14, h: 1.34, n: 1.5, bot: 0.8 },
  ], { segs: 26, capStart: true, capEnd: true }));
  b.raw('dark', loft([
    { z: -4.85, w: 0.22, h: 0.1, y: -0.28, n: 1.7 },
    { z: -3.55, w: 0.68, h: 0.28, y: -0.52, n: 1.55 },
    { z: -2.15, w: 0.48, h: 0.16, y: -0.4, n: 1.7 },
    { z: -1.15, w: 0.22, h: 0.08, y: -0.24, n: 1.8 },
  ], { segs: 16, capStart: true, capEnd: true }));
  b.raw('glow', loft([
    { z: -4.45, w: 0.07, h: 0.035, y: -0.34, n: 1.7 },
    { z: -3.4, w: 0.22, h: 0.08, y: -0.54, n: 1.55 },
    { z: -2.5, w: 0.1, h: 0.04, y: -0.42, n: 1.7 },
  ], { segs: 12, capStart: true, capEnd: true }));
  b.raw('glass', canopy(-3.35, -1.55, 0.62, 0.38, 0.42));
  spineStrip(b, 0.14, -3.2, 3.4, 0.58);
  b.raw('dark', loft([
    { z: -0.85, w: 0.55, h: 0.08, y: 0.68, n: 2.1 },
    { z: 0.55, w: 1.15, h: 0.14, y: 0.78, n: 2.2 },
    { z: 1.85, w: 0.72, h: 0.08, y: 0.66, n: 2.1 },
  ], { segs: 14, capStart: true, capEnd: true }));
  for (const s of [-1, 1]) {
    b.raw('hull', wing({
      side: s, x0: s * 0.82, y0: 0.22, z0: 0.15,
      span: 3.15, root: 2.85, tip: 0.52, sweep: 1.35,
      dihedral: 0.42, thick: 0.28, thickTip: 0.12, n: 1.28,
    }));
    b.raw('hull', wing({
      side: s, x0: s * 0.78, y0: -0.18, z0: 0.35,
      span: 2.75, root: 2.45, tip: 0.46, sweep: 1.05,
      dihedral: -0.48, thick: 0.24, thickTip: 0.1, n: 1.28,
    }));
    b.raw('hull', loft([
      { z: -0.85, w: 0.55, h: 0.42, x: s * 0.95, y: 0.04, n: 1.6 },
      { z: 0.55, w: 0.82, h: 0.58, x: s * 1.15, y: 0.04, n: 1.55 },
      { z: 1.85, w: 0.48, h: 0.32, x: s * 0.88, y: 0.02, n: 1.7 },
    ], { segs: 14, capStart: true, capEnd: true }));
    b.raw('hull', fin({
      side: s, x0: s * 0.42, y0: 0.48, z0: 2.85,
      root: 1.35, tip: 0.32, sweep: 0.62, height: 0.95, cant: 0.28, thick: 0.12,
    }));
    b.raw('dark', loft([
      { z: 2.05, w: 0.42, h: 0.32, x: s * 0.55, y: -0.08, n: 2.2 },
      { z: 3.55, w: 0.58, h: 0.46, x: s * 0.58, y: -0.08, n: 2.2 },
      { z: 4.55, w: 0.5, h: 0.38, x: s * 0.58, y: -0.08, n: 2.2 },
    ], { segs: 12, capStart: true, capEnd: true }));
    addNozzle(b, s * 0.58, -0.08, 4.78, 0.26, 0.72, 1.28);
    for (let i = 0; i < 4; i++) {
      const vent = new THREE.BoxGeometry(0.04, 0.09, 0.28);
      vent.translate(s * 0.98, 0.05, -2.35 + i * 0.72);
      b.raw('dark', vent);
      const slit = new THREE.BoxGeometry(0.02, 0.04, 0.18);
      slit.translate(s * 1.0, 0.05, -2.35 + i * 0.72);
      b.raw('glow', slit);
    }
    gunBarrel(b, s * 0.52, -0.28, -3.55, 1.15, 0.045);
  }
  navLights(b, 3.85, 0.12, 0.35);
  const parts = b.build();
  const mats = makeShipMaterials({
    hull: '#6a6280',
    dark: '#1c1826',
    accent: '#322a42',
    emissive: '#181024',
    glowEmit: '#6e48e8',
    glassEmit: '#4a2288',
    metal: 0.58,
    rough: 0.38,
  });
  // Panel atlas is a grid — it reads as holes on these dark hulls.
  for (const k of Object.keys(mats)) {
    const m = mats[k];
    if (m && m.map) { m.map = null; m.needsUpdate = true; }
    if (m && m.roughnessMap) { m.roughnessMap = null; m.needsUpdate = true; }
  }
  mats.glow.emissiveIntensity = 0.7;
  const grp = assemble(parts, mats);
  grp.scale.setScalar(scale);
  grp.userData.ring = null;
  grp.userData.spin = 0;
  grp.userData.bob = Math.random() * Math.PI * 2;
  grp.userData.length = 10.2;
  return grp;
}

export function makeEnemyMesh(variant = 0) {
  const b = new PartBuilder();
  if (variant === 0) {
    // raider: angular dart, forward-swept blades, rust hull
    b.raw('hull', loft([
      ...noseSections(-4.8, -2.6, 1.05, 0.62, 4, { n: 1.3 }),
      { z: -1.0, w: 1.65, h: 0.92, n: 1.4, bot: 0.7 }, { z: 1.5, w: 1.85, h: 1.02, n: 1.4, bot: 0.7 }, { z: 3.1, w: 1.2, h: 0.72, n: 1.5 },
    ], { segs: 22, capEnd: true }));
    tailPlate(b, 3.1, 1.2, 0.72, 1.5);
    b.raw('glass', canopy(-2.6, -0.9, 0.7, 0.5, 0.4));
    for (const s of [-1, 1]) {
      b.raw('hull', wing({ side: s, x0: s * 0.8, y0: 0, z0: 1.2, span: 2.7, root: 2.6, tip: 0.5, sweep: -1.4, thick: 0.16, n: 1.2 }));
      const blade = new THREE.ConeGeometry(0.12, 1.4, 6); blade.rotateX(-Math.PI / 2); blade.translate(s * 3.5, 0, -0.9); b.raw('dark', blade);
      b.raw('dark', loft([{ z: 0.4, w: 0.2, h: 0.2, x: s * 1.3 }, { z: 1.2, w: 0.78, h: 0.78, x: s * 1.3 }, { z: 3.0, w: 0.72, h: 0.72, x: s * 1.3 }], { segs: 14, capStart: true, capEnd: true }));
      addNozzle(b, s * 1.3, 0, 3.25, 0.32, 0.7, 1.3);
      gunBarrel(b, s * 0.95, -0.22, -1.6, 1.6, 0.07);
      b.raw('dark', fin({ side: s, x0: s * 0.9, y0: 0.35, z0: 2.2, root: 1.1, tip: 0.3, sweep: 0.6, height: 0.9, cant: 0.6 }));
    }
    navLights(b, 3.4, 0, -0.2, 0.62, 1.4);
  } else {
    // enforcer: heavy blocky hull, side pods, four purple bells
    b.raw('hull', loft([
      ...noseSections(-4.4, -2.8, 1.6, 1.2, 3, { n: 2.6 }),
      { z: -1.5, w: 2.3, h: 1.65, n: 2.8 }, { z: 1.8, w: 2.4, h: 1.7, n: 2.8 }, { z: 3.4, w: 1.9, h: 1.4, n: 2.8 },
    ], { segs: 24, capEnd: true }));
    tailPlate(b, 3.4, 1.9, 1.4, 2.8);
    const bridge = new THREE.BoxGeometry(1.25, 0.42, 0.7); bridge.translate(0, 0.85, -2.1); b.raw('glass', bridge);
    for (const s of [-1, 1]) {
      b.raw('hull', loft([{ z: -1.2, w: 0.5, h: 0.5, x: s * 2.2, y: -0.2 }, { z: -0.4, w: 1.3, h: 1.3, x: s * 2.2, y: -0.2, n: 2.6 }, { z: 3.0, w: 1.3, h: 1.3, x: s * 2.2, y: -0.2, n: 2.6 }], { segs: 16, capStart: true, capEnd: true }));
      addNozzle(b, s * 2.2, -0.2, 3.25, 0.4, 0.7, 1.25);
      addNozzle(b, s * 0.7, 0.1, 3.55, 0.36, 0.7, 1.25);
      for (let i = 0; i < 3; i++) { const p = new THREE.BoxGeometry(0.14, 0.7, 1.1); p.translate(s * 1.28, 0.1, -1.2 + i * 1.4); b.raw('accent', p); }
      gunBarrel(b, s * 2.2, -0.2, -1.4, 1.8, 0.09);
      gunBarrel(b, s * 0.6, -0.7, -2.9, 1.4, 0.07);
    }
    b.raw('dark', hatch(1.4, 2.6, 0, -0.85, 0.6));
    navLights(b, 2.9, -0.2, 1.6, 0.95, 0.4);
  }
  const parts = b.build();
  const grp = assemble(parts, makeShipMaterials({
    hull: variant === 0 ? '#5a3038' : '#3c3a4a',
    dark: '#171319',
    accent: variant === 0 ? '#2a1418' : '#1e1c26',
    glowEmit: variant === 0 ? '#ff4d4d' : '#c04cf0',
    glassEmit: '#7a1f2a',
    rough: 0.55,
  }));
  grp.userData.length = 9;
  return grp;
}

// Stations live in stations.js (lofted hub architecture, merged geos).

// --------------------------------------------------------------------------
//  WRECKS
// --------------------------------------------------------------------------
export function makeWreckMesh(w) {
  const rng = new RNG(w.seed);
  const b = new PartBuilder();
  const R = w.radius;
  const pieces = rng.int(5, 9);
  for (let i = 0; i < pieces; i++) {
    const p = [rng.range(-1, 1) * R, rng.range(-1, 1) * R * 0.5, rng.range(-1, 1) * R];
    const rot = [rng.range(0, TAU), rng.range(0, TAU), rng.range(0, TAU)];
    const kind = rng.int(0, 3);
    if (kind === 0) b.add('hull', new THREE.BoxGeometry(R * rng.range(0.4, 1.4), R * rng.range(0.2, 0.6), R * rng.range(0.4, 1.4)), p, rot);
    else if (kind === 1) b.add('hull', new THREE.CylinderGeometry(R * 0.3, R * rng.range(0.3, 0.55), R * rng.range(0.6, 1.8), 10, 1, rng.chance(0.4)), p, rot);
    else b.add('dark', new THREE.BoxGeometry(R * rng.range(0.1, 0.3), R * rng.range(0.1, 0.3), R * rng.range(1.0, 2.6)), p, rot);
  }
  b.add('dark', new THREE.TorusGeometry(R * 0.7, R * 0.09, 6, 18, rng.range(2.5, 5.5)), [0, 0, 0], [rng.range(0, TAU), rng.range(0, TAU), 0]);
  for (let i = 0; i < 3; i++) {
    b.add('glow', new THREE.SphereGeometry(R * 0.07, 6, 5), [rng.range(-1, 1) * R, rng.range(-1, 1) * R * 0.5, rng.range(-1, 1) * R]);
  }
  const parts = b.build();
  const grp = assemble(parts, makeShipMaterials({ hull: '#4a4a52', dark: '#1a1a20', glowEmit: '#ff8a3d', glassEmit: '#552222', rough: 0.85 }));
  return grp;
}

// --------------------------------------------------------------------------
//  PROJECTILES / MISSILES
// --------------------------------------------------------------------------
const _boltGeo = new THREE.CylinderGeometry(0.16, 0.16, 6.5, 6, 1, true);
_boltGeo.rotateX(Math.PI / 2);
const _boltGeoBig = new THREE.CylinderGeometry(0.34, 0.34, 11, 6, 1, true);
_boltGeoBig.rotateX(Math.PI / 2);

export function makeBolt(color = '#7fe8ff', big = false) {
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color), transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const m = new THREE.Mesh(big ? _boltGeoBig : _boltGeo, mat);
  const g = createGlowSprite(color, big ? 3.4 : 2.1, 0.42, 2.8);
  m.add(g);
  m.userData.own = false;
  return m;
}

export function makeMissile() {
  const b = new PartBuilder();
  b.add('hull', new THREE.CylinderGeometry(0.28, 0.32, 3.1, 8), [0, 0, 0], [Math.PI / 2, 0, 0]);
  b.add('hull', new THREE.ConeGeometry(0.32, 0.95, 8), [0, 0, -1.85], [-Math.PI / 2, 0, 0]);
  b.add('dark', new THREE.BoxGeometry(1.15, 0.07, 0.55), [0, 0, 0.85]);
  b.add('dark', new THREE.BoxGeometry(0.07, 1.15, 0.55), [0, 0, 0.85]);
  b.add('glow', new THREE.CylinderGeometry(0.22, 0.28, 0.28, 8), [0, 0, 1.55], [Math.PI / 2, 0, 0]);
  const parts = b.build();
  const g = assemble(parts, makeShipMaterials({ hull: '#d4d8e0', dark: '#1a1c22', glowEmit: '#ff7a28' }));
  g.add(createGlowSprite('#ff9a40', 2.6, 0.5, 2.8).translateZ(1.85));
  return g;
}

export { makeShipMaterials, PartBuilder };
