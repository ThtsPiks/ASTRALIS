// ============================================================================
//  STATION COLLIDERS — signed distance to the primitives a station mesh
//  registered in stations.js. Works in the mesh's local frame so spin and
//  orbit motion come for free from matrixWorld.
// ============================================================================
import * as THREE from '../../vendor/three/three.module.js';

const _inv = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const EPS = 0.6;

function sdSphere(x, y, z, c) {
  return Math.hypot(x - c.c[0], y - c.c[1], z - c.c[2]) - c.r;
}

function sdCapsule(x, y, z, c) {
  const ax = c.a[0], ay = c.a[1], az = c.a[2];
  const bx = c.b[0] - ax, by = c.b[1] - ay, bz = c.b[2] - az;
  const px = x - ax, py = y - ay, pz = z - az;
  const bb = bx * bx + by * by + bz * bz || 1;
  const h = Math.min(1, Math.max(0, (px * bx + py * by + pz * bz) / bb));
  return Math.hypot(px - bx * h, py - by * h, pz - bz * h) - c.r;
}

function sdCylinder(x, y, z, c) {
  const ax = c.a[0], ay = c.a[1], az = c.a[2];
  const bx = c.b[0] - ax, by = c.b[1] - ay, bz = c.b[2] - az;
  const px = x - ax, py = y - ay, pz = z - az;
  const baba = bx * bx + by * by + bz * bz || 1;
  const paba = px * bx + py * by + pz * bz;
  const qx = px * baba - bx * paba, qy = py * baba - by * paba, qz = pz * baba - bz * paba;
  const dx = Math.hypot(qx, qy, qz) - c.r * baba;
  const dy = Math.abs(paba - baba * 0.5) - baba * 0.5;
  const x2 = dx * dx, y2 = dy * dy * baba;
  const d = Math.max(dx, dy) < 0 ? -Math.min(x2, y2) : (dx > 0 ? x2 : 0) + (dy > 0 ? y2 : 0);
  return Math.sign(d) * Math.sqrt(Math.abs(d)) / baba;
}

function sdTorus(x, y, z, c) {
  const qx = Math.hypot(x - c.c[0], z - c.c[2]) - c.R;
  return Math.hypot(qx, y - c.c[1]) - c.r;
}

function sdBox(x, y, z, c) {
  let px = x - c.c[0], py = y - c.c[1], pz = z - c.c[2];
  if (c.q) {
    const qx = -c.q[0], qy = -c.q[1], qz = -c.q[2], qw = c.q[3];
    const tx = 2 * (qy * pz - qz * py);
    const ty = 2 * (qz * px - qx * pz);
    const tz = 2 * (qx * py - qy * px);
    const rx = px + qw * tx + (qy * tz - qz * ty);
    const ry = py + qw * ty + (qz * tx - qx * tz);
    pz = pz + qw * tz + (qx * ty - qy * tx);
    px = rx;
    py = ry;
  } else if (c.ry) {
    const cs = Math.cos(c.ry), sn = Math.sin(c.ry);
    const rx = px * cs - pz * sn;
    pz = px * sn + pz * cs;
    px = rx;
  }
  const qx = Math.abs(px) - c.h[0], qy = Math.abs(py) - c.h[1], qz = Math.abs(pz) - c.h[2];
  const out = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  return out + Math.min(Math.max(qx, Math.max(qy, qz)), 0);
}

const SDF = { s: sdSphere, c: sdCapsule, y: sdCylinder, t: sdTorus, b: sdBox };

function field(cols, x, y, z) {
  let d = Infinity;
  for (let i = 0; i < cols.length; i++) {
    const v = SDF[cols[i].t](x, y, z, cols[i]);
    if (v < d) d = v;
  }
  return d;
}

/**
 * Signed distance (world units) from a world point to a station hull, with the
 * outward world-space normal written to outNormal. Returns Infinity when the
 * station has no colliders or the point is outside its bounding sphere + pad.
 */
export function stationDistance(rt, worldPoint, outNormal, pad = 0) {
  const mesh = rt?.mesh;
  const cols = mesh?.userData?.colliders;
  if (!cols?.length) return Infinity;
  rt.group.updateMatrixWorld(true);
  _inv.copy(mesh.matrixWorld).invert();
  _p.copy(worldPoint).applyMatrix4(_inv);
  const ext = mesh.userData.extent || 0;
  if (_p.length() > ext + pad) return Infinity;
  const d = field(cols, _p.x, _p.y, _p.z);
  if (outNormal) {
    _n.set(
      field(cols, _p.x + EPS, _p.y, _p.z) - field(cols, _p.x - EPS, _p.y, _p.z),
      field(cols, _p.x, _p.y + EPS, _p.z) - field(cols, _p.x, _p.y - EPS, _p.z),
      field(cols, _p.x, _p.y, _p.z + EPS) - field(cols, _p.x, _p.y, _p.z - EPS),
    );
    if (_n.lengthSq() < 1e-10) _n.copy(_p);
    if (_n.lengthSq() < 1e-10) _n.set(0, 1, 0);
    outNormal.copy(_n.transformDirection(mesh.matrixWorld));
  }
  return d;
}
