// ============================================================================
//  HULL KIT — lofted fuselages, tapered wings, engine bells, greebles.
//  Every ship in ASTRALIS is assembled from these primitives so hulls read as
//  blended aerospace bodies instead of stacked boxes.
// ============================================================================
import * as THREE from '../../vendor/three/three.module.js';
import { TAU } from '../core/utils.js';

const _v = new THREE.Vector3();

// Superellipse point on a cross-section. n=2 ellipse, n<2 diamond-ish, n>2 boxy.
function sePoint(theta, w, h, n, top, bot) {
  const c = Math.cos(theta), s = Math.sin(theta);
  const e = 2 / n;
  const x = Math.sign(c) * Math.pow(Math.abs(c), e) * w * 0.5;
  let y = Math.sign(s) * Math.pow(Math.abs(s), e) * h * 0.5;
  y *= s >= 0 ? top : bot;
  return [x, y];
}

/**
 * Loft a closed body through cross-sections along local +Z.
 * section: { z, w, h, x=0, y=0, n=2, top=1, bot=1, roll=0 }
 * opts: { segs=28, capStart=false, capEnd=false, uvScale=1 }
 */
export function loft(sections, opts = {}) {
  const segs = opts.segs || 28;
  const S0 = sections.map((s) => ({ x: 0, y: 0, n: 2, top: 1, bot: 1, roll: 0, ...s }));
  // subdivide long spans so vertex normals (and specular) interpolate smoothly
  const maxSeg = opts.maxSeg || 0.45;
  const S = [S0[0]];
  const KEYS = ['z', 'w', 'h', 'x', 'y', 'n', 'top', 'bot', 'roll'];
  for (let i = 1; i < S0.length; i++) {
    const a = S0[i - 1], b = S0[i];
    const len = Math.abs(b.z - a.z);
    const steps = Math.max(1, Math.ceil(len / maxSeg));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      if (k === steps) { S.push(b); continue; }
      const m = {};
      for (const key of KEYS) m[key] = a[key] + (b[key] - a[key]) * t;
      S.push(m);
    }
  }
  const pos = [], uv = [], idx = [];
  let totalLen = 0;
  for (let i = 1; i < S.length; i++) totalLen += Math.abs(S[i].z - S[i - 1].z);
  let acc = 0;
  for (let i = 0; i < S.length; i++) {
    const s = S[i];
    if (i > 0) acc += Math.abs(s.z - S[i - 1].z);
    const v = totalLen > 0 ? acc / totalLen : 0;
    for (let j = 0; j <= segs; j++) {
      const th = (j / segs) * TAU + s.roll;
      const [px, py] = sePoint(th, Math.max(s.w, 0.001), Math.max(s.h, 0.001), s.n, s.top, s.bot);
      pos.push(px + s.x, py + s.y, s.z);
      uv.push((j / segs) * (opts.uvScale || 1) * 2, v * (opts.uvScale || 1) * Math.max(1, totalLen * 0.25));
    }
  }
  const ring = segs + 1;
  for (let i = 0; i < S.length - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * ring + j, b = a + 1, c = a + ring, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  // caps: start cap faces -Z, end cap faces +Z
  const capRing = (i, flip) => {
    const s = S[i];
    const center = pos.length / 3;
    pos.push(s.x, s.y, s.z);
    uv.push(0.5, 0.5);
    for (let j = 0; j < segs; j++) {
      const a = i * ring + j, b = a + 1;
      if (flip) idx.push(center, a, b); else idx.push(center, b, a);
    }
  };
  if (opts.capStart) capRing(0, false);
  if (opts.capEnd) capRing(S.length - 1, true);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // stitch the seam normals so the body shades continuously
  const nrm = g.attributes.normal;
  for (let i = 0; i < S.length; i++) {
    const a = i * ring, b = a + segs;
    _v.set(nrm.getX(a) + nrm.getX(b), nrm.getY(a) + nrm.getY(b), nrm.getZ(a) + nrm.getZ(b)).normalize();
    nrm.setXYZ(a, _v.x, _v.y, _v.z);
    nrm.setXYZ(b, _v.x, _v.y, _v.z);
  }
  nrm.needsUpdate = true;
  return g;
}

/** Ogive / bullet nose helper: returns sections from tip (zTip) to base (zBase). */
export function noseSections(zTip, zBase, w, h, steps = 5, extra = {}) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const k = Math.sin(t * Math.PI * 0.5);           // ogive curve
    out.push({ z: zTip + (zBase - zTip) * t, w: Math.max(0.02, w * k), h: Math.max(0.02, h * k), ...extra });
  }
  return out;
}

/**
 * Tapered wing. Built along local Z then rotated so span runs along ±X.
 * o: { side:±1, x0, y0, z0, span, root, tip, sweep, dihedral, thick, thickTip, n=1.5, twist=0 }
 * Chord is measured along ship Z (forward = -Z). z0 is the chord centre at the root.
 */
export function wing(o) {
  const side = o.side || 1;
  const thick = o.thick ?? 0.22;
  const thickTip = o.thickTip ?? thick * 0.55;
  const n = o.n ?? 1.5;
  const dz = Math.tan(o.dihedral || 0);
  const secs = [
    { z: 0, w: o.root, h: thick, x: 0, y: 0, n },
    { z: o.span * 0.55, w: o.root + (o.tip - o.root) * 0.55, h: thick + (thickTip - thick) * 0.55, x: -side * o.sweep * 0.55, y: o.span * 0.55 * dz, n },
    { z: o.span, w: o.tip, h: thickTip, x: -side * o.sweep, y: o.span * dz, n },
  ];
  const g = loft(secs, { segs: 16, capStart: true, capEnd: true, uvScale: 0.6 });
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(o.twist || 0, side * Math.PI / 2, 0));
  m.compose(new THREE.Vector3(o.x0 || 0, o.y0 || 0, o.z0 || 0), q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

/** Vertical fin (tail). Same as wing but spans along +Y and cants outward by `cant`. */
export function fin(o) {
  const side = o.side || 0;
  const thick = o.thick ?? 0.14;
  const n = o.n ?? 1.4;
  const secs = [
    { z: 0, w: o.root, h: thick, n },
    { z: o.height, w: o.tip, h: thick * 0.5, x: o.sweep, n },
  ];
  const g = loft(secs, { segs: 12, capStart: true, capEnd: true, uvScale: 0.5 });
  // permutation: world = (local.y, local.z, local.x) → chord along Z, height along Y
  const perm = new THREE.Matrix4().set(
    0, 1, 0, 0,
    0, 0, 1, 0,
    1, 0, 0, 0,
    0, 0, 0, 1,
  );
  g.applyMatrix4(perm);
  g.rotateZ(-side * (o.cant || 0));
  g.translate(o.x0 || 0, o.y0 || 0, o.z0 || 0);
  return g;
}

/** Engine bell: returns { bell, throat, disc } geometries positioned with exit plane at z=+len/2. */
export function nozzle(radius, len = 0.9, flare = 1.25) {
  const pts = [];
  const steps = 9;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = radius * (0.62 + (flare - 0.62) * Math.pow(t, 1.7));
    pts.push(new THREE.Vector2(r, -len / 2 + t * len));
  }
  const bell = new THREE.LatheGeometry(pts, 20);
  bell.rotateX(Math.PI / 2);
  // inner bell wall: reversed point order so normals face inward, dark material
  const inner = new THREE.LatheGeometry(pts.slice().reverse().map((p) => new THREE.Vector2(p.x * 0.94, p.y)), 20);
  inner.rotateX(Math.PI / 2);
  const throat = new THREE.CylinderGeometry(radius * 0.66, radius * 0.66, len * 0.35, 16, 1, true);
  throat.rotateX(Math.PI / 2);
  throat.translate(0, 0, -len * 0.25);
  // hot core sits recessed at the throat, not flush with the lip
  const disc = new THREE.CircleGeometry(radius * 0.7, 20);
  disc.translate(0, 0, -len * 0.05);
  return { bell, throat, inner, disc };
}

/** Intake: hollow rectangular duct with dark inner face. */
export function intake(w, h, depth) {
  const outer = new THREE.BoxGeometry(w, h, depth);
  const inner = new THREE.BoxGeometry(w * 0.8, h * 0.72, 0.05);
  inner.translate(0, 0, -depth / 2 + 0.02);
  return { outer, inner };
}

/** Greeble strip: n small boxes along axis. */
export function panelRow(n, size, pitch, axis = 'z') {
  const geos = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
    const off = (i - (n - 1) / 2) * pitch;
    if (axis === 'z') g.translate(0, 0, off); else if (axis === 'x') g.translate(off, 0, 0); else g.translate(0, off, 0);
    geos.push(g);
  }
  return geos;
}

/** Canopy: teardrop glass shell along Z. */
export function canopy(zFront, zBack, w, h, y) {
  const len = zBack - zFront;
  return loft([
    { z: zFront, w: w * 0.18, h: h * 0.2, y: y - h * 0.15, n: 2 },
    { z: zFront + len * 0.28, w: w * 0.85, h: h * 0.9, y, n: 2.2 },
    { z: zFront + len * 0.62, w: w, h: h, y, n: 2.2 },
    { z: zBack, w: w * 0.7, h: h * 0.45, y: y - h * 0.1, n: 2.2 },
  ], { segs: 18, capStart: true, capEnd: true, uvScale: 0.5 });
}

/** Solar blanket: thin dark slab plus a glow rail along its length. */
export function solarWing(len, wid, x, y, z, rotZ = 0) {
  const slab = new THREE.BoxGeometry(len, 0.05, wid);
  const rail = new THREE.BoxGeometry(len * 0.98, 0.02, wid * 0.08);
  const cells = [];
  const nCell = Math.max(2, Math.floor(len / 0.9));
  for (let i = 0; i < nCell; i++) {
    const c = new THREE.BoxGeometry(len / nCell - 0.08, 0.02, wid * 0.86);
    c.translate((i - (nCell - 1) / 2) * (len / nCell), 0.035, 0);
    cells.push(c);
  }
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rotZ)), new THREE.Vector3(1, 1, 1));
  slab.applyMatrix4(m);
  rail.translate(0, 0.04, wid * 0.46);
  rail.applyMatrix4(m);
  cells.forEach((c) => c.applyMatrix4(m));
  return { slab, rail, cells };
}

/** Landing-gear bay doors / hatch lines as flush dark slabs. */
export function hatch(w, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, 0.03, d);
  g.translate(x, y, z);
  return g;
}
