// ============================================================================
//  STATION HULLS — lofted aerospace hubs, merged into a handful of meshes.
//  Every solid part also registers a local-space collider primitive, so the
//  flight model hits the hull the player sees instead of one fat sphere.
//  Collider kinds: s sphere · c capsule · y capped cylinder · t torus · b box.
// ============================================================================
import * as THREE from '../../vendor/three/three.module.js';
import { RNG } from '../core/rng.js';
import { TAU } from '../core/utils.js';
import { loft } from './hullkit.js';
import { PartBuilder, makeShipMaterials, assemble } from './models.js';

const _UP = new THREE.Vector3(0, 1, 0);
const _A = new THREE.Vector3();
const _B = new THREE.Vector3();
const _Q = new THREE.Quaternion();
const _M = new THREE.Matrix4();
const _S1 = new THREE.Vector3(1, 1, 1);

class Kit {
  constructor(b, R) { this.b = b; this.R = R; this.cols = []; }

  loftY(mat, sections, col = null, segs = 18) {
    const g = loft(sections, { segs, capStart: true, capEnd: true, maxSeg: this.R * 0.08 });
    g.rotateX(-Math.PI / 2);
    this.b.raw(mat, g);
    if (col) this.cols.push(col);
  }

  /** Cylinder from a to b (top radius r2 at b). col: 'c' capsule, 'y' flat-capped, false none. */
  tube(mat, a, b, r, { r2 = r, seg = 12, col = 'c', open = false } = {}) {
    _A.fromArray(a); _B.fromArray(b);
    const dir = _B.clone().sub(_A);
    const L = dir.length();
    if (L < 1e-4) return;
    const g = new THREE.CylinderGeometry(r2, r, L, seg, 1, open);
    g.applyQuaternion(_Q.setFromUnitVectors(_UP, dir.normalize()));
    g.translate((_A.x + _B.x) / 2, (_A.y + _B.y) / 2, (_A.z + _B.z) / 2);
    this.b.raw(mat, g);
    if (col) this.cols.push({ t: col, a: [...a], b: [...b], r: Math.max(r, r2) });
  }

  box(mat, c, size, ry = 0, col = true) {
    this.b.add(mat, new THREE.BoxGeometry(size[0], size[1], size[2]), c, [0, ry, 0]);
    if (col) this.cols.push({ t: 'b', c: [...c], h: [size[0] / 2, size[1] / 2, size[2] / 2], ry });
  }

  ball(mat, c, r, col = true, seg = 18) {
    this.b.add(mat, new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.6 | 0)), c);
    if (col) this.cols.push({ t: 's', c: [...c], r });
  }

  /** Horizontal ring (around local Y) centred on c. */
  ring(mat, c, R, r, { seg = 64, col = true } = {}) {
    this.b.add(mat, new THREE.TorusGeometry(R, r, 12, seg), c, [Math.PI / 2, 0, 0]);
    if (col) this.cols.push({ t: 't', c: [...c], R, r });
  }

  deco(mat, geo, pos, rot) { this.b.add(mat, geo, pos, rot); }

  /** Placed geometry with an arbitrary quaternion. */
  place(mat, geo, pos, quat) {
    geo.applyMatrix4(_M.compose(_A.fromArray(pos), quat, _S1));
    this.b.raw(mat, geo);
  }

  /** Framed solar wing. Long axis along the direction ry (radians about Y), face tilted by tilt. */
  solar(c, w, h, ry = 0, tilt = 0.35) {
    const R = this.R;
    const th = Math.max(R * 0.018, h * 0.03);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, ry, 0, 'YXZ'));
    this.place('dark', new THREE.BoxGeometry(w, h, th), c, q);
    const cols = Math.max(3, Math.round(w / (h * 0.55)));
    const cw = w / cols;
    for (let i = 0; i < cols; i++) {
      for (const row of [-1, 1]) {
        const g = new THREE.BoxGeometry(cw * 0.86, h * 0.4, th * 0.28);
        g.translate(-w / 2 + cw * (i + 0.5), row * h * 0.24, th * 0.5 + th * 0.14 + th * 0.08);
        this.place('glass', g, c, q);
      }
    }
    const spar = new THREE.BoxGeometry(w * 1.02, h * 0.035, th * 2.2);
    this.place('accent', spar, c, q);
    const ht = Math.abs(Math.sin(tilt)) * h / 2 + th;
    this.cols.push({ t: 'b', c: [...c], h: [w / 2, Math.abs(Math.cos(tilt)) * h / 2 + th, ht], ry });
  }

  /**
   * One bowl. The shell stops short of the lip so the rim torus kisses the
   * edge instead of occupying the same surface. The feed sits in the bowl.
   */
  dish(c, r, dir, mat = 'hull') {
    const n = new THREE.Vector3(...dir).normalize();
    const depth = r * 0.48;
    const th = r * 0.07;
    const lip = 0.84;
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push(new THREE.Vector2(r * lip * t, depth * t * t));
    }
    for (let i = 8; i >= 1; i--) {
      const t = i / 8;
      pts.push(new THREE.Vector2(Math.max(r * lip * t * 0.88, r * 0.05), depth * t * t + th));
    }
    const g = new THREE.LatheGeometry(pts, 28);
    g.computeVertexNormals();
    const q = new THREE.Quaternion().setFromUnitVectors(_UP, n);
    this.place(mat, g, c, q);
    const rimTube = r * 0.045;
    const rim = new THREE.TorusGeometry(r * lip + rimTube, rimTube, 8, 28);
    rim.rotateX(Math.PI / 2);
    rim.translate(0, depth, 0);
    this.place('dark', rim, c, q);
    const y0 = th + r * 0.02;
    const feedY = depth * 0.58;
    const post = new THREE.CylinderGeometry(r * 0.028, r * 0.04, feedY - y0, 8);
    post.translate(0, (feedY + y0) / 2, 0);
    this.place('dark', post, c, q);
    this.place('glow', new THREE.SphereGeometry(r * 0.05, 10, 8).translate(0, feedY, 0), c, q);
    const origin = new THREE.Vector3(...c);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU;
      const rimP = new THREE.Vector3(Math.cos(a) * (r * lip), depth * 0.96, Math.sin(a) * (r * lip));
      const feedP = new THREE.Vector3(0, feedY, 0);
      rimP.applyQuaternion(q).add(origin);
      feedP.applyQuaternion(q).add(origin);
      this.tube('dark', rimP.toArray(), feedP.toArray(), r * 0.012, { seg: 5, col: false });
    }
    const back = origin.clone().addScaledVector(n, -r * 0.22);
    this.tube('dark', back.toArray(), origin.toArray(), r * 0.07, { r2: r * 0.05, seg: 8, col: false });
    this.cols.push({ t: 's', c: origin.clone().addScaledVector(n, depth * 0.35).toArray(), r: r * 0.9 });
  }

  /** Boom from a point inside a solid hull out to a dish. */
  mountDish(anchor, dir, r, mat = 'hull') {
    const n = new THREE.Vector3(...dir).normalize();
    const a = new THREE.Vector3(...anchor);
    const c = a.clone().addScaledVector(n, r * 0.7);
    this.tube('dark', a.toArray(), c.toArray(), r * 0.07, { r2: r * 0.045, seg: 8, col: false });
    this.dish(c.toArray(), r, [n.x, n.y, n.z], mat);
  }

  /** Docking collar on the bottom of a spine. The pad ring hangs from four struts. */
  dock(c, R, glow = 'glow') {
    const [x, y, z] = c;
    this.tube('dark', [x, y + R * 0.2, z], [x, y - R * 0.02, z], R * 0.17, { col: 'y' });
    this.ring('hull', [x, y - R * 0.16, z], R * 0.36, R * 0.055, { seg: 40 });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + Math.PI / 4;
      this.tube('dark', [x + Math.cos(a) * R * 0.15, y + R * 0.02, z + Math.sin(a) * R * 0.15],
        [x + Math.cos(a) * R * 0.34, y - R * 0.15, z + Math.sin(a) * R * 0.34], R * 0.022, { seg: 6, col: false });
    }
    const lipY = y - R * 0.16 - R * 0.055 - R * 0.012;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      this.b.add(glow, new THREE.BoxGeometry(R * 0.045, R * 0.022, R * 0.045),
        [x + Math.cos(a) * R * 0.36, lipY, z + Math.sin(a) * R * 0.36]);
    }
  }

  /** Mast with a blinking tip. */
  mast(base, h, r) {
    const top = [base[0], base[1] + h, base[2]];
    this.tube('dark', base, top, r, { r2: r * 0.5, seg: 6, col: false });
    this.b.add('glow', new THREE.SphereGeometry(r * 2.4, 8, 6), top);
  }
}

// --------------------------------------------------------------------------
function habRing(k, c, Rr, tube, blocks, ph = 0) {
  const [x, y, z] = c;
  k.ring('hull', c, Rr, tube * 1.3, { seg: 72, col: false });
  k.cols.push({ t: 't', c: [...c], R: Rr, r: tube * 1.3 });
  for (let i = 0; i < blocks; i++) {
    const a = (i / blocks) * TAU + ph;
    const cx = x + Math.cos(a) * Rr, cz = z + Math.sin(a) * Rr;
    k.box('dark', [cx, y, cz], [tube * 2.2, tube * 1.7, tube * 1.35], -a, false);
  }
}

function spokes(k, c, r0, r1, n, r, ph = 0) {
  const [x, y, z] = c;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + ph;
    k.tube('hull', [x + Math.cos(a) * r0, y, z + Math.sin(a) * r0], [x + Math.cos(a) * r1, y, z + Math.sin(a) * r1], r, { seg: 10 });
  }
}

function tank(k, x, y, z, r, h) {
  k.tube('hull', [x, y - h / 2, z], [x, y + h / 2, z], r, { seg: 16, col: 'y' });
  k.ball('hull', [x, y + h / 2, z], r, true, 16);
  k.ball('hull', [x, y - h / 2, z], r, true, 16);
  const darkT = r * 0.04;
  const glowT = r * 0.022;
  k.ring('dark', [x, y + h * 0.22, z], r + darkT, darkT, { seg: 20, col: false });
  k.ring('glow', [x, y - h * 0.22, z], r + glowT, glowT, { seg: 20, col: false });
}

function cargoPod(k, ringOuter, a, y, R) {
  const len = R * 0.4;
  const center = ringOuter + R * 0.06 + len * 0.5;
  const x = Math.cos(a) * center;
  const z = Math.sin(a) * center;
  const inner = center - len * 0.5;
  k.tube('dark',
    [Math.cos(a) * ringOuter, y, Math.sin(a) * ringOuter],
    [Math.cos(a) * inner, y, Math.sin(a) * inner],
    R * 0.04, { seg: 8, col: false });
  k.box('hull', [x, y, z], [len, R * 0.22, R * 0.2], -a);
  k.box('accent', [x, y + R * 0.116, z], [len * 0.7, R * 0.02, R * 0.14], -a, false);
  const face = len * 0.5 + R * 0.004;
  k.box('glow', [x + Math.cos(a) * face, y, z + Math.sin(a) * face], [R * 0.016, R * 0.06, R * 0.12], -a, false);
}

// ------------------------------------------------------------ TRADE EXCHANGE
function buildTrade(k) {
  const R = k.R;
  k.loftY('hull', [
    { z: -R * 1.0, w: R * 0.16, h: R * 0.16, n: 2.2 },
    { z: -R * 0.55, w: R * 0.3, h: R * 0.3, n: 2.2 },
    { z: -R * 0.12, w: R * 0.48, h: R * 0.48, n: 2.2 },
    { z: R * 0.12, w: R * 0.48, h: R * 0.48, n: 2.2 },
    { z: R * 0.6, w: R * 0.28, h: R * 0.28, n: 2.2 },
    { z: R * 1.05, w: R * 0.12, h: R * 0.12, n: 2.2 },
  ], { t: 'c', a: [0, -R * 0.9, 0], b: [0, R * 0.95, 0], r: R * 0.22 }, 24);
  // Ports sit on the tangent plane of the waist so they don't cut the hull.
  for (const s of [-1, 1]) {
    k.box('glass', [s * R * 0.248, R * 0.02, 0], [R * 0.016, R * 0.12, R * 0.07], 0, false);
    k.box('glass', [0, R * 0.02, s * R * 0.248], [R * 0.07, R * 0.12, R * 0.016], 0, false);
  }

  const wr = R * 1.12;
  const tube = R * 0.11;
  habRing(k, [0, 0, 0], wr, tube, 8, 0.2);
  spokes(k, [0, 0, 0], R * 0.16, wr - tube, 6, R * 0.04);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.55;
    cargoPod(k, wr + tube * 1.3, a, 0, R);
  }

  k.ring('hull', [0, R * 0.5, 0], R * 0.58, R * 0.045, { seg: 48 });
  spokes(k, [0, R * 0.5, 0], R * 0.1, R * 0.56, 4, R * 0.026, 0.4);

  k.dock([0, -R * 1.02, 0], R);
  const yb = R * 1.16;
  k.tube('dark', [0, R * 0.9, 0], [0, yb + R * 0.06, 0], R * 0.038, { r2: R * 0.024, seg: 8 });
  k.tube('dark', [-R * 0.52, yb, 0], [R * 0.52, yb, 0], R * 0.022, { seg: 8, col: false });
  for (const s of [-1, 1]) {
    k.box('dark', [s * R * 0.5, yb, 0], [R * 0.16, R * 0.1, R * 0.07], 0, false);
    k.solar([s * R * 1.02, yb, 0], R * 0.96, R * 0.36, 0, 0.32);
  }
  k.tube('dark', [0, R * 0.82, R * 0.02], [0, R * 0.92, R * 0.3], R * 0.018, { seg: 6, col: false });
  k.dish([0, R * 0.92, R * 0.3], R * 0.12, [0.04, 0.3, 1]);
  k.mast([0, yb + R * 0.02, 0], R * 0.26, R * 0.012);
}

// ------------------------------------------------------------------ REFINERY
function buildRefinery(k, rng, small) {
  const R = k.R;
  k.loftY('hull', [
    { z: -R * 1.05, w: R * 0.2, h: R * 0.2, n: 2.4 },
    { z: -R * 0.72, w: R * 0.32, h: R * 0.26, n: 2.4 },
    { z: -R * 0.55, w: R * 0.66, h: R * 0.42, n: 2.6 },
    { z: -R * 0.38, w: R * 0.4, h: R * 0.32, n: 2.4 },
    { z: R * 0.15, w: R * 0.36, h: R * 0.32, n: 2.4 },
    { z: R * 0.95, w: R * 0.18, h: R * 0.18, n: 2.4 },
    { z: R * 1.28, w: R * 0.1, h: R * 0.1, n: 2.2 },
  ], { t: 'c', a: [0, -R * 0.95, 0], b: [0, R * 1.15, 0], r: R * 0.18 });
  k.cols.push({ t: 'y', a: [0, -R * 0.64, 0], b: [0, -R * 0.46, 0], r: R * 0.32 });

  const tanks = small ? 4 : 6;
  for (let i = 0; i < tanks; i++) {
    const a = (i / tanks) * TAU + 0.15;
    const rad = R * (i % 2 ? 0.72 : 0.9);
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    const tr = R * rng.range(0.15, 0.19), th = R * rng.range(0.28, 0.4);
    const ty = rng.range(-R * 0.05, R * 0.12);
    tank(k, x, ty, z, tr, th);
    const sink = rad - tr * 0.25;
    k.tube('dark',
      [Math.cos(a) * R * 0.08, R * 0.02, Math.sin(a) * R * 0.08],
      [Math.cos(a) * sink, ty, Math.sin(a) * sink],
      R * 0.038, { seg: 8 });
    const cap = ty + th * 0.5 + tr * 0.35;
    k.tube('accent',
      [Math.cos(a) * R * 0.06, R * 0.55, Math.sin(a) * R * 0.06],
      [Math.cos(a) * sink, cap, Math.sin(a) * sink],
      R * 0.016, { seg: 5, col: false });
  }

  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.35;
    const rad = R * 0.4;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    k.tube('dark', [Math.cos(a) * R * 0.08, R * 0.5, Math.sin(a) * R * 0.08], [Math.cos(a) * R * 0.36, R * 0.5, Math.sin(a) * R * 0.36], R * 0.045, { seg: 8, col: false });
    k.tube('dark', [x, R * 0.42, z], [x, R * 1.16, z], R * 0.08, { r2: R * 0.05, seg: 10 });
    k.tube('hull', [x, R * 1.08, z], [x, R * 1.36, z], R * 0.062, { seg: 10, col: false });
    const lip = R * 0.01;
    k.ring('glow', [x, R * 1.24, z], R * 0.062 + lip, lip, { seg: 14, col: false });
  }
  k.tube('dark', [0, R * 1.12, 0], [0, R * 1.36, 0], R * 0.032, { r2: R * 0.02, seg: 8, col: false });
  k.mast([0, R * 1.32, 0], R * 0.2, R * 0.011);

  for (const s of [-1, 1]) {
    k.tube('dark', [s * R * 0.1, -R * 0.55, 0], [s * R * 0.5, -R * 0.55, 0], R * 0.026, { seg: 8, col: false });
    k.box('dark', [s * R * 0.52, -R * 0.55, 0], [R * 0.16, R * 0.1, R * 0.08], 0, false);
    k.solar([s * R * 1.04, -R * 0.55, 0], R * 0.96, R * 0.38, 0, 0.42);
  }
  k.dock([0, -R * 1.08, 0], R);
}

// ------------------------------------------------------- OBSERVATORY / SURVEY
function buildSurvey(k) {
  const R = k.R;
  const truss = loft([
    { z: -R * 1.5, w: R * 0.16, h: R * 0.12, n: 2.4 },
    { z: -R * 0.65, w: R * 0.26, h: R * 0.18, n: 2.4 },
    { z: 0, w: R * 0.32, h: R * 0.22, n: 2.4 },
    { z: R * 0.65, w: R * 0.26, h: R * 0.18, n: 2.4 },
    { z: R * 1.5, w: R * 0.16, h: R * 0.12, n: 2.4 },
  ], { segs: 16, capStart: true, capEnd: true, maxSeg: R * 0.08 });
  k.b.raw('hull', truss);
  k.cols.push({ t: 'c', a: [0, 0, -R * 1.45], b: [0, 0, R * 1.45], r: R * 0.12 });

  for (const z of [-R * 0.95, -R * 0.38, R * 0.38, R * 0.95]) {
    const y0 = R * 0.04;
    k.tube('hull', [0, y0, z - R * 0.14], [0, y0, z + R * 0.14], R * 0.09, { seg: 14 });
    k.ball('hull', [0, y0, z - R * 0.14], R * 0.09, false, 12);
    k.ball('hull', [0, y0, z + R * 0.14], R * 0.09, false, 12);
    k.tube('glow', [0, y0 + R * 0.096, z - R * 0.08], [0, y0 + R * 0.096, z + R * 0.08], R * 0.007, { seg: 4, col: false });
  }

  k.tube('hull', [0, R * 0.0, 0], [0, R * 0.32, 0], R * 0.1, { r2: R * 0.07, seg: 14, col: 'y' });
  k.mountDish([0, R * 0.28, 0], [0.2, 1, 0.08], R * 0.28);

  k.mountDish([0, R * 0.0, R * 1.32], [0, 0.25, 1], R * 0.18);
  k.mountDish([0, R * 0.0, -R * 1.32], [0, 0.25, -1], R * 0.18);

  const yoke = [R * 0.04, R * 0.04, R * 0.62];
  const pivot = [R * 0.1, R * 0.2, R * 0.7];
  const eye = [R * 0.28, R * 0.58, R * 0.88];
  k.tube('accent', yoke, pivot, R * 0.035, { seg: 8, col: false });
  k.tube('hull', pivot, eye, R * 0.07, { r2: R * 0.05, seg: 14 });
  k.ball('glass', eye, R * 0.055, false, 14);

  for (const s of [-1, 1]) {
    k.tube('dark', [s * R * 0.06, 0, -R * 0.12], [s * R * 0.46, 0, -R * 0.12], R * 0.026, { seg: 8, col: false });
    k.box('dark', [s * R * 0.5, 0, -R * 0.12], [R * 0.14, R * 0.09, R * 0.07], 0, false);
    k.solar([s * R * 1.0, 0, -R * 0.12], R * 0.92, R * 0.34, 0, 0.28);
    k.tube('dark', [s * R * 0.05, R * 0.02, R * 0.5], [s * R * 0.66, R * 0.28, R * 0.64], R * 0.016, { seg: 6, col: false });
    k.box('dark', [s * R * 0.66, R * 0.28, R * 0.64], [R * 0.06, R * 0.28, R * 0.2], 0, false);
  }
  k.mast([0, R * 0.05, -R * 0.78], R * 0.42, R * 0.013);

  k.tube('hull', [0, -R * 0.02, 0], [0, -R * 0.32, 0], R * 0.09, { r2: R * 0.07, seg: 12, col: 'y' });
  k.dock([0, -R * 0.38, 0], R * 0.72);
}

// ------------------------------------------------------------------- ARSENAL
function buildArsenal(k) {
  const R = k.R;
  k.tube('hull', [0, -R * 0.7, 0], [0, R * 0.48, 0], R * 0.38, { seg: 24, col: 'y' });
  k.tube('hull', [0, R * 0.48, 0], [0, R * 0.68, 0], R * 0.38, { r2: R * 0.22, seg: 24 });
  k.ball('hull', [0, R * 0.68, 0], R * 0.22, true, 20);
  k.tube('hull', [0, -R * 0.88, 0], [0, -R * 0.7, 0], R * 0.22, { r2: R * 0.38, seg: 24 });
  const core = R * 0.38;
  k.ring('dark', [0, R * 0.08, 0], core + R * 0.016, R * 0.016, { seg: 36, col: false });
  k.ring('glow', [0, -R * 0.16, 0], core + R * 0.01, R * 0.01, { seg: 36, col: false });
  k.ring('accent', [0, R * 0.28, 0], core + R * 0.012, R * 0.012, { seg: 36, col: false });

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const rad = R * 0.66;
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    const tr = R * 0.14;
    for (const y of [R * 0.06, -R * 0.2]) {
      k.tube('dark',
        [Math.cos(a) * R * 0.28, y, Math.sin(a) * R * 0.28],
        [Math.cos(a) * (rad - tr * 0.2), y, Math.sin(a) * (rad - tr * 0.2)],
        R * 0.04, { seg: 8, col: false });
    }
    k.tube('hull', [x, -R * 0.46, z], [x, R * 0.3, z], tr, { seg: 16, col: 'y' });
    k.ball('hull', [x, -R * 0.46, z], tr, true, 14);
    k.tube('accent', [x, R * 0.24, z], [x, R * 0.52, z], tr * 0.92, { r2: R * 0.028, seg: 16 });
    k.ball('accent', [x, R * 0.52, z], R * 0.028, false, 10);
    k.ring('glow', [x, R * 0.04, z], tr + R * 0.008, R * 0.008, { seg: 18, col: false });
    k.ring('dark', [x, -R * 0.14, z], tr + R * 0.011, R * 0.011, { seg: 18, col: false });
  }

  k.tube('dark', [0, R * 0.72, 0], [0, R * 0.9, 0], R * 0.08, { r2: R * 0.05, seg: 12, col: 'y' });
  k.ball('glass', [0, R * 0.9, 0], R * 0.1, true, 16);
  const yb = R * 1.08;
  k.tube('dark', [0, R * 0.96, 0], [0, yb, 0], R * 0.028, { seg: 8, col: false });
  k.tube('dark', [-R * 0.44, yb, 0], [R * 0.44, yb, 0], R * 0.02, { seg: 6, col: false });
  for (const s of [-1, 1]) {
    k.box('dark', [s * R * 0.42, yb, 0], [R * 0.14, R * 0.08, R * 0.06], 0, false);
    k.solar([s * R * 0.9, yb, 0], R * 0.88, R * 0.3, 0, 0.3);
  }
  k.tube('dark', [R * 0.18, R * 0.46, R * 0.04], [R * 0.5, R * 0.6, R * 0.16], R * 0.022, { seg: 6, col: false });
  k.dish([R * 0.5, R * 0.6, R * 0.16], R * 0.1, [0.55, 0.7, 0.3]);
  k.mast([0, yb - R * 0.02, 0], R * 0.22, R * 0.01);

  k.tube('hull', [0, -R * 0.8, 0], [0, -R * 0.98, 0], R * 0.12, { seg: 12, col: 'y' });
  k.dock([0, -R * 0.98, 0], R * 0.7);
}

// ------------------------------------------------------------------ SHIPYARD
function buildShipyard(k, rng, hub) {
  const R = k.R;
  const z0 = -R * 0.8, z1 = R * 1.6;
  const bx = R * 0.6, by = R * 0.45;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    k.tube('hull', [sx * bx, sy * by, z0], [sx * bx, sy * by, z1], R * 0.06, { seg: 8 });
  }
  const ribs = hub ? 7 : 5;
  for (let i = 0; i < ribs; i++) {
    const z = z0 + (z1 - z0) * (i / (ribs - 1));
    k.box('dark', [0, by, z], [bx * 2 + R * 0.12, R * 0.07, R * 0.07]);
    k.box('dark', [0, -by, z], [bx * 2 + R * 0.12, R * 0.07, R * 0.07]);
    k.box('dark', [bx, 0, z], [R * 0.07, by * 2, R * 0.07]);
    k.box('dark', [-bx, 0, z], [R * 0.07, by * 2, R * 0.07]);
    k.box('glow', [bx - R * 0.039, 0, z], [R * 0.012, by * 1.5, R * 0.016], 0, false);
    k.box('glow', [-bx + R * 0.039, 0, z], [R * 0.012, by * 1.5, R * 0.016], 0, false);
  }
  k.b.raw('accent', loft([
    { z: z0 + R * 0.3, w: R * 0.12, h: R * 0.1, n: 2.4 },
    { z: z0 + R * 0.7, w: R * 0.5, h: R * 0.3, n: 2.8 },
    { z: z1 - R * 0.6, w: R * 0.56, h: R * 0.32, n: 3.0 },
    { z: z1 - R * 0.35, w: R * 0.5, h: R * 0.3, n: 3.0 },
  ], { segs: 16, capStart: true, capEnd: true, maxSeg: R * 0.08 }));
  k.cols.push({ t: 'c', a: [0, 0, z0 + R * 0.5], b: [0, 0, z1 - R * 0.4], r: R * 0.2 });
  for (const sx of [-1, 1]) {
    const x = sx * bx * 0.75;
    k.tube('accent', [x, by, R * 0.6], [x, by + R * 0.35, R * 0.6], R * 0.035, { seg: 6 });
    k.tube('accent', [x, by + R * 0.35, R * 0.6], [x * 0.2, by + R * 0.35, R * 0.2], R * 0.03, { seg: 6 });
    k.tube('dark', [x * 0.2, by + R * 0.35, R * 0.2], [x * 0.2, R * 0.19, R * 0.2], R * 0.012, { seg: 4, col: false });
    k.ball('glow', [x * 0.2, R * 0.175, R * 0.2], R * 0.016, false, 8);
  }

  const cz = -R * 1.35;
  k.tube('hull', [0, -R * 0.55, cz], [0, R * 0.65, cz], R * 0.32, { seg: 18, col: 'y' });
  k.ball('hull', [0, R * 0.65, cz], R * 0.32, true, 18);
  k.box('hull', [0, 0, (cz + z0) / 2], [R * 0.3, R * 0.3, z0 - cz], 0);
  k.ring('glass', [0, R * 0.12, cz], R * 0.32 + R * 0.014, R * 0.014, { seg: 32, col: false });
  habRing(k, [0, 0, cz], R * 0.78, R * 0.1, hub ? 8 : 6, 0.2);
  spokes(k, [0, 0, cz], R * 0.22, R * 0.7, 4, R * 0.036, Math.PI / 4);

  const yb = R * 1.08;
  k.tube('dark', [0, R * 0.78, cz], [0, yb, cz], R * 0.032, { r2: R * 0.02, seg: 8 });
  k.tube('dark', [-R * 0.5, yb, cz], [R * 0.5, yb, cz], R * 0.018, { seg: 6, col: false });
  for (const s of [-1, 1]) {
    k.box('dark', [s * R * 0.48, yb, cz], [R * 0.14, R * 0.08, R * 0.06], 0, false);
    k.solar([s * R * 0.98, yb, cz], R * 0.92, R * 0.32, 0, 0.32);
  }
  k.dock([0, -R * 0.68, cz], R);
  k.mast([0, yb - R * 0.02, cz], R * 0.24, R * 0.011);
  if (hub) {
    k.tube('dark', [R * 0.06, R * 0.68, cz], [R * 0.46, R * 0.8, cz - R * 0.08], R * 0.02, { seg: 6, col: false });
    k.dish([R * 0.46, R * 0.8, cz - R * 0.08], R * 0.11, [0.65, 0.55, -0.25]);
  }
}

// ----------------------------------------------------------- ORBITAL STATION
function buildOrbital(k, rng) {
  const R = k.R;
  k.loftY('hull', [
    { z: -R * 0.85, w: R * 0.14, h: R * 0.14, n: 2.4 },
    { z: -R * 0.3, w: R * 0.3, h: R * 0.3, n: 2.6 },
    { z: R * 0.25, w: R * 0.28, h: R * 0.28, n: 2.6 },
    { z: R * 0.9, w: R * 0.12, h: R * 0.12, n: 2.4 },
  ], { t: 'c', a: [0, -R * 0.8, 0], b: [0, R * 0.85, 0], r: R * 0.15 });
  habRing(k, [0, 0, 0], R * 0.92, R * 0.1, 8);
  spokes(k, [0, 0, 0], R * 0.08, R * 0.84, 4, R * 0.038, 0.35);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + rng.range(0, 0.4);
    const y = (i - 1) * R * 0.22;
    k.tube('accent', [Math.cos(a) * R * 0.06, y, Math.sin(a) * R * 0.06], [Math.cos(a) * R * 0.4, y, Math.sin(a) * R * 0.4], R * 0.08, { seg: 12, col: 'y' });
    k.ball('glass', [Math.cos(a) * R * 0.4, y, Math.sin(a) * R * 0.4], R * 0.08, false, 12);
  }
  const yb = R * 0.98;
  k.tube('dark', [0, R * 0.72, 0], [0, yb, 0], R * 0.028, { r2: R * 0.018, seg: 8 });
  k.tube('dark', [-R * 0.46, yb, 0], [R * 0.46, yb, 0], R * 0.016, { seg: 6, col: false });
  for (const s of [-1, 1]) {
    k.box('dark', [s * R * 0.44, yb, 0], [R * 0.14, R * 0.08, R * 0.06], 0, false);
    k.solar([s * R * 0.92, yb, 0], R * 0.88, R * 0.3, 0, 0.32);
  }
  k.tube('dark', [0, R * 0.32, R * 0.04], [R * 0.06, R * 0.46, R * 0.26], R * 0.016, { seg: 6, col: false });
  k.dish([R * 0.06, R * 0.46, R * 0.26], R * 0.09, [0.15, 0.4, 1]);
  k.dock([0, -R * 0.88, 0], R);
  k.mast([0, yb - R * 0.01, 0], R * 0.22, R * 0.01);
}

// ------------------------------------------------------------------- OUTPOST
function buildOutpost(k) {
  const R = k.R;
  k.ball('hull', [0, 0, 0], R * 0.3, true, 20);
  const lat = R * 0.18;
  const belt = Math.sqrt(Math.max(0.01, R * R * 0.09 - lat * lat));
  k.ring('dark', [0, lat, 0], belt + R * 0.01, R * 0.01, { seg: 28, col: false });
  for (const s of [-1, 1]) {
    k.tube('hull', [s * R * 0.16, 0, 0], [s * R * 0.78, 0, 0], R * 0.15, { seg: 16 });
    k.tube('glow', [s * R * 0.34, R * 0.156, 0], [s * R * 0.7, R * 0.156, 0], R * 0.007, { seg: 4, col: false });
    k.tube('accent', [0, 0, s * R * 0.16], [0, 0, s * R * 0.58], R * 0.12, { seg: 14, col: 'y' });
    k.ball('accent', [0, 0, s * R * 0.58], R * 0.12, true, 12);
    k.tube('dark', [s * R * 0.62, 0, 0], [s * R * 1.02, 0, 0], R * 0.026, { seg: 6, col: false });
    k.box('dark', [s * R * 1.06, 0, 0], [R * 0.14, R * 0.09, R * 0.07], 0, false);
    k.solar([s * R * 1.58, 0, 0], R * 0.96, R * 0.32, 0, 0.34);
  }
  k.tube('hull', [0, R * 0.16, 0], [0, R * 0.48, 0], R * 0.1, { seg: 14, col: 'y' });
  k.ball('glass', [0, R * 0.48, 0], R * 0.1, true, 14);
  k.tube('dark', [-R * 0.1, R * 0.08, -R * 0.08], [-R * 0.38, R * 0.34, -R * 0.28], R * 0.016, { seg: 6, col: false });
  k.dish([-R * 0.38, R * 0.34, -R * 0.28], R * 0.09, [-0.5, 0.7, -0.4]);
  k.tube('dark', [0, -R * 0.18, 0], [0, -R * 0.46, 0], R * 0.08, { seg: 10, col: 'y' });
  k.dock([0, -R * 0.5, 0], R * 0.72);
  k.mast([0, R * 0.52, 0], R * 0.26, R * 0.01);
}

const HUB_MATS = {
  hub_shipyard: { hull: '#a2a3bc', dark: '#191c30', glowEmit: '#afaaff', glassEmit: '#2f3a82', accent: '#71798a', rough: 0.45 },
  hub_arsenal: { hull: '#797e89', dark: '#211b20', glowEmit: '#ff806a', glassEmit: '#35306a', accent: '#b97b65', rough: 0.6 },
  hub_trade: { hull: '#9aaab8', dark: '#14232b', glowEmit: '#49f4c1', glassEmit: '#1a4a88', accent: '#b68a45', rough: 0.46 },
  hub_refinery: { hull: '#877d70', dark: '#1a1612', glowEmit: '#ff783a', glassEmit: '#2a3468', accent: '#c48343', rough: 0.58 },
  hub_survey: { hull: '#b8c6d4', dark: '#121c2b', glowEmit: '#54cfff', glassEmit: '#1a4a78', accent: '#8ddfff', rough: 0.42 },
  shipyard: { hull: '#93a0b0', dark: '#22262e', glowEmit: '#7dffb0', glassEmit: '#1f4a78', accent: '#5a6878', rough: 0.5 },
  refinery: { hull: '#8a7a68', dark: '#1a1612', glowEmit: '#ff9a4d', glassEmit: '#2a3468', accent: '#6a5238', rough: 0.55 },
  orbital: { hull: '#9baebe', dark: '#172432', glowEmit: '#75e7ff', glassEmit: '#1f4a7a', accent: '#6a8298', rough: 0.5 },
  outpost: { hull: '#a09a88', dark: '#1c2228', glowEmit: '#ffc76b', glassEmit: '#2f3a70', accent: '#8a7550', rough: 0.56 },
};

export function makeStationMesh(s) {
  const rng = new RNG(s.seed || 1);
  const b = new PartBuilder();
  const R = Math.max(40, s.radius || 130);
  const kind = s.kind || 'orbital';
  const k = new Kit(b, R);
  if (kind === 'hub_trade') buildTrade(k, rng);
  else if (kind === 'hub_refinery' || kind === 'refinery') buildRefinery(k, rng, kind === 'refinery');
  else if (kind === 'hub_survey') buildSurvey(k);
  else if (kind === 'hub_arsenal') buildArsenal(k);
  else if (kind === 'hub_shipyard' || kind === 'shipyard') buildShipyard(k, rng, kind === 'hub_shipyard');
  else if (kind === 'outpost') buildOutpost(k);
  else buildOrbital(k, rng);

  const pal = HUB_MATS[kind] || HUB_MATS.orbital;
  const parts = b.build();
  const grp = assemble(parts, makeShipMaterials(pal));
  const box = new THREE.Box3();
  let far = 0;
  for (const g of Object.values(parts)) {
    g.computeBoundingBox();
    box.union(g.boundingBox);
    const p = g.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) far = Math.max(far, p[i] * p[i] + p[i + 1] * p[i + 1] + p[i + 2] * p[i + 2]);
  }
  grp.userData.extent = Math.sqrt(far);
  grp.userData.colliders = k.cols;
  grp.userData.top = box.max.y;
  grp.userData.dockPoint = new THREE.Vector3(0, box.min.y, 0);
  grp.userData.hub = kind.startsWith('hub_');
  return grp;
}
