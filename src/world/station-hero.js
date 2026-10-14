// Imported hero stations — Halcyon Port + Research Array observatory.
// Visual fit and collider stamps are sliced across frames so title / film / jumps
// never run a multi-second clone+voxel pass on the critical path.
import * as THREE from '../../vendor/three/three.module.js';
import { GLTFLoader } from '../../vendor/three/addons/loaders/GLTFLoader.js';
import { toCreasedNormals } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

const LONG_AXIS = 7000;
/** One cell per vertex. Full cubes touch, so the shell is continuous and cheap. */
const CELL = 48;
/** Only parts smaller than this (half-extent) get a single inset OBB. */
const OBB_MAX = 48;
const OBB_INSET = 0.87;

/** @typedef {{ id: string, url: string, wrapName: string, match: (data: any) => boolean }} HeroDef */

/** @type {HeroDef[]} */
export const HERO_DEFS = [
  {
    id: 'port',
    url: 'models/halcyon.glb?v=port18',
    wrapName: 'halcyon-port',
    match: (d) => d?.kind === 'hub_trade' || !!(d?.mainPort || d?.name === 'Halcyon Port'),
  },
  {
    id: 'observatory',
    url: 'models/observatory.glb?v=port18',
    wrapName: 'observatory',
    match: (d) => d?.kind === 'hub_survey' || !!d?.observatory,
  },
  {
    id: 'arsenal',
    url: 'models/arsenal.glb?v=port20',
    wrapName: 'arsenal',
    match: (d) => d?.kind === 'hub_arsenal' || !!d?.arsenal,
  },
  {
    id: 'shipyard',
    url: 'models/shipworks.glb?v=port29',
    wrapName: 'shipworks',
    // Sketchfab scene includes a backdrop planet. It must not enter the fit or the shell.
    drop: ['Planet'],
    sealFaces: true,
    match: (d) => d?.kind === 'hub_shipyard',
  },
];

/** Per-hero idle state (template + fitted wrap ready to parent). */
const slots = new Map();

function slotFor(def) {
  let s = slots.get(def.id);
  if (!s) {
    s = { pending: null, templateRoot: null, fitPending: null, idleWrap: null, colPending: null };
    slots.set(def.id, s);
  }
  return s;
}

export function heroDefFor(data) {
  if (!data) return null;
  for (const def of HERO_DEFS) if (def.match(data)) return def;
  return null;
}

export function isHeroStation(data) {
  return !!heroDefFor(data);
}

function yieldMain(ms = 0) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Oriented / voxel colliders in wrap-local space.
 * Small compact parts → one inset OBB (matches metal, does not seal neighbor gaps).
 * Larger meshes → voxels ONLY where vertices are, with tight per-cell AABBs —
 * never one box around the whole mesh bounds (that filled ring holes / spoke gaps),
 * never full CELL cubes (those inflated thin panels into empty space).
 */
function appendMeshColliders(o, invWrap, cols, scratch) {
  if (!o.isMesh || !o.geometry) return;
  const geo = o.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (!bb || bb.isEmpty()) return;

  const { rel, pos, quat, center, v } = scratch;
  rel.copy(invWrap).multiply(o.matrixWorld);
  rel.decompose(pos, quat, scratch.scl);
  const sx = Math.abs(scratch.scl.x);
  const sy = Math.abs(scratch.scl.y);
  const sz = Math.abs(scratch.scl.z);
  if (!(sx > 1e-8 && sy > 1e-8 && sz > 1e-8)) return;

  // Half-extents in the object's local frame (matches decompose quat).
  const hx = Math.abs((bb.max.x - bb.min.x) * 0.5 * sx);
  const hy = Math.abs((bb.max.y - bb.min.y) * 0.5 * sy);
  const hz = Math.abs((bb.max.z - bb.min.z) * 0.5 * sz);
  const longest = Math.max(hx, hy, hz);
  // Skip dust / bolts; keep observatory braces and Halcyon metal.
  if (longest < 8) return;

  if (longest <= OBB_MAX) {
    bb.getCenter(center);
    center.applyMatrix4(rel);
    cols.push({
      t: 'b',
      c: [center.x, center.y, center.z],
      h: [hx * OBB_INSET, hy * OBB_INSET, hz * OBB_INSET],
      q: [quat.x, quat.y, quat.z, quat.w],
    });
    return;
  }

  appendSurfaceVoxels(geo, rel, cols);
}

/** One full cell per vertex. No triangle walk — that stalled spawn for seconds. */
function appendSurfaceVoxels(geo, rel, cols) {
  const attr = geo.attributes?.position;
  if (!attr) return;
  const seen = new Set();
  const v = new THREE.Vector3();
  const half = CELL * 0.5;
  for (let i = 0; i < attr.count; i++) {
    v.fromBufferAttribute(attr, i).applyMatrix4(rel);
    const ix = Math.floor(v.x / CELL);
    const iy = Math.floor(v.y / CELL);
    const iz = Math.floor(v.z / CELL);
    const key = `${ix}|${iy}|${iz}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cols.push({
      t: 'b',
      c: [(ix + 0.5) * CELL, (iy + 0.5) * CELL, (iz + 0.5) * CELL],
      h: [half, half, half],
    });
  }
}

const _ta = new THREE.Vector3();
const _tb = new THREE.Vector3();
const _tc = new THREE.Vector3();
const _tp = new THREE.Vector3();

function stampCell(v, seen, cols) {
  const ix = Math.floor(v.x / CELL);
  const iy = Math.floor(v.y / CELL);
  const iz = Math.floor(v.z / CELL);
  const key = `${ix}|${iy}|${iz}`;
  if (seen.has(key)) return;
  seen.add(key);
  const half = CELL * 0.5;
  cols.push({
    t: 'b',
    c: [(ix + 0.5) * CELL, (iy + 0.5) * CELL, (iz + 0.5) * CELL],
    h: [half, half, half],
  });
}

/** Fill a triangle whose edge is longer than one cell, so the face is not a hole. */
function fillTri(a, b, c, seen, cols) {
  const longest = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
  if (longest <= CELL * 0.75) return;
  const steps = Math.min(40, Math.ceil(longest / CELL));
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const row = steps - i;
    for (let j = 0; j <= row; j++) {
      const v = j / steps;
      const w = 1 - u - v;
      _tp.set(
        a.x * w + b.x * u + c.x * v,
        a.y * w + b.y * u + c.y * v,
        a.z * w + b.z * u + c.z * v,
      );
      stampCell(_tp, seen, cols);
    }
  }
}

/**
 * Shipyard shell: same cell grid as the other heroes, plus a fill on any
 * triangle wider than a cell. Vertex-only cubes leave holes in big panels.
 * One shared grid for the whole station so overlapping parts do not stack.
 */
async function stampSealed(meshes, invWrap, cols, scratch) {
  const seen = new Set();
  for (let m = 0; m < meshes.length; m++) {
    const o = meshes[m];
    const geo = o.geometry;
    if (!geo?.attributes?.position) continue;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (!bb || bb.isEmpty()) continue;
    const { rel, pos, quat, center } = scratch;
    rel.copy(invWrap).multiply(o.matrixWorld);
    rel.decompose(pos, quat, scratch.scl);
    const sx = Math.abs(scratch.scl.x);
    const sy = Math.abs(scratch.scl.y);
    const sz = Math.abs(scratch.scl.z);
    if (!(sx > 1e-8 && sy > 1e-8 && sz > 1e-8)) continue;
    const hx = Math.abs((bb.max.x - bb.min.x) * 0.5 * sx);
    const hy = Math.abs((bb.max.y - bb.min.y) * 0.5 * sy);
    const hz = Math.abs((bb.max.z - bb.min.z) * 0.5 * sz);
    const longest = Math.max(hx, hy, hz);
    if (longest < 8) continue;
    if (longest <= OBB_MAX) {
      bb.getCenter(center);
      center.applyMatrix4(rel);
      cols.push({
        t: 'b',
        c: [center.x, center.y, center.z],
        h: [hx * OBB_INSET, hy * OBB_INSET, hz * OBB_INSET],
        q: [quat.x, quat.y, quat.z, quat.w],
      });
      continue;
    }
    const attr = geo.attributes.position;
    const index = geo.index;
    const triCount = index ? index.count / 3 : attr.count / 3;
    const read = (slot, out) => {
      const ix = index ? index.getX(slot) : slot;
      out.fromBufferAttribute(attr, ix).applyMatrix4(rel);
    };
    for (let t = 0; t < triCount; t++) {
      const base = t * 3;
      read(base, _ta);
      read(base + 1, _tb);
      read(base + 2, _tc);
      stampCell(_ta, seen, cols);
      stampCell(_tb, seen, cols);
      stampCell(_tc, seen, cols);
      fillTri(_ta, _tb, _tc, seen, cols);
      if ((t & 2047) === 2047) await yieldMain(0);
    }
    if ((m & 1) === 1) await yieldMain(0);
  }
}

function makeScratch() {
  return {
    rel: new THREE.Matrix4(),
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    scl: new THREE.Vector3(),
    center: new THREE.Vector3(),
    v: new THREE.Vector3(),
  };
}

/** Build colliders across frames; writes wrap.userData.colliders when done. */
function stampCollidersAsync(wrap) {
  if (!wrap) return Promise.resolve([]);
  if (wrap.userData.colliders?.length) return Promise.resolve(wrap.userData.colliders);
  if (wrap.userData._colStamp) return wrap.userData._colStamp;

  wrap.userData._colStamp = (async () => {
    await yieldMain(0);
    wrap.updateMatrixWorld(true);
    const invWrap = new THREE.Matrix4().copy(wrap.matrixWorld).invert();
    const cols = [];
    const scratch = makeScratch();
    const meshes = [];
    wrap.traverse((o) => { if (o.isMesh && o.geometry) meshes.push(o); });
    // Larger meshes first so metal hulls get stamped before tiny detail.
    meshes.sort((a, b) => (b.geometry?.attributes?.position?.count || 0) - (a.geometry?.attributes?.position?.count || 0));
    if (wrap.userData.sealFaces) await stampSealed(meshes, invWrap, cols, scratch);
    else for (let i = 0; i < meshes.length; i++) appendMeshColliders(meshes[i], invWrap, cols, scratch);
    wrap.userData.colliders = cols;
    wrap.userData._colStamp = null;
    return cols;
  })();

  return wrap.userData._colStamp;
}

/**
 * Clone + scale only (no collider stamp). Yields so 2M-tri Halcyon does not
 * freeze the title / opening film for multiple seconds.
 */
async function buildVisualWrap(template, def) {
  await yieldMain(0);
  const src = template.clone(true);
  await yieldMain(0);
  if (def.drop?.length) {
    const kill = [];
    src.traverse((o) => {
      if (def.drop.some((n) => o.name === n || o.name?.startsWith(`${n}_`))) kill.push(o);
    });
    for (const o of kill) o.parent?.remove(o);
  }

  const meshes = [];
  src.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = true;
    o.geometry?.computeBoundingSphere?.();
    meshes.push(o);
  });
  await yieldMain(0);

  // Incremental world AABB — avoids one giant setFromObject hitch on Halcyon.
  src.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  for (let i = 0; i < meshes.length; i++) {
    const o = meshes[i];
    if (!o.geometry) continue;
    tmp.setFromObject(o);
    if (!tmp.isEmpty()) box.union(tmp);
    if ((i & 15) === 15) await yieldMain(0);
  }
  if (box.isEmpty()) return null;

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const long = Math.max(size.x, size.y, size.z);
  if (!(long > 0.01) || long > 1e7) return null;
  const scale = LONG_AXIS / long;
  src.scale.setScalar(scale);
  src.position.copy(center).multiplyScalar(-scale);

  const wrap = new THREE.Group();
  wrap.name = def.wrapName;
  wrap.add(src);
  wrap.updateMatrixWorld(true);
  await yieldMain(0);

  const fitted = new THREE.Box3();
  const tmp2 = new THREE.Box3();
  wrap.updateMatrixWorld(true);
  for (let i = 0; i < meshes.length; i++) {
    tmp2.setFromObject(meshes[i]);
    if (!tmp2.isEmpty()) fitted.union(tmp2);
    if ((i & 15) === 15) await yieldMain(0);
  }
  if (fitted.isEmpty()) return null;
  const span = new THREE.Vector3();
  fitted.getSize(span);
  const extent = 0.5 * Math.hypot(span.x, span.y, span.z);
  if (!(extent > 100)) return null;

  wrap.userData.extent = extent;
  wrap.userData.top = fitted.max.y;
  wrap.userData.dockPoint = new THREE.Vector3(0, fitted.min.y, 0);
  // Colliders fill in asynchronously — never block reveal on the voxel stamp.
  wrap.userData.colliders = null;
  wrap.userData.hub = true;
  wrap.userData.heroId = def.id;
  wrap.userData.sealFaces = !!def.sealFaces;
  wrap.traverse((o) => { o.userData.retainAssets = true; });
  wrap.visible = false;
  return wrap;
}

function load(def) {
  const slot = slotFor(def);
  if (slot.pending) return slot.pending;
  const loader = new GLTFLoader();
  slot.pending = loader.loadAsync(def.url).then((gltf) => {
    const root = gltf.scene;
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.receiveShadow = false;
      o.frustumCulled = true;
      o.matrixAutoUpdate = true;
      if (def.id === 'arsenal' && o.geometry) {
        o.geometry = toCreasedNormals(o.geometry, 55 * Math.PI / 180);
      }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        m.side = THREE.FrontSide;
        m.flatShading = false;
        m.depthWrite = true;
        m.transparent = false;
        m.opacity = 1;
        if (m.color && m.color.r + m.color.g + m.color.b < 0.08 && !m.map) m.color.set(0x8ea0b4);
      }
    });
    root.userData.template = true;
    slot.templateRoot = root;
    return root;
  }).catch((err) => {
    slot.pending = null;
    slot.templateRoot = null;
    console.warn(`[station] ${def.id} GLB skipped`, err);
    return null;
  });
  return slot.pending;
}

/**
 * After the template parses, build a fitted wrap off the critical path.
 * Resolves when the *visual* wrap is ready (colliders may still be stamping).
 */
function ensureFitted(def) {
  const slot = slotFor(def);
  if (slot.idleWrap) return Promise.resolve(slot.idleWrap);
  if (slot.fitPending) return slot.fitPending;
  slot.fitPending = load(def).then(async (template) => {
    if (!template) {
      slot.fitPending = null;
      return null;
    }
    // Let title / film paint a few frames before the heavy clone.
    await yieldMain(0);
    await yieldMain(32);
    try {
      if (!slot.idleWrap) {
        const wrap = await buildVisualWrap(template, def);
        if (wrap) {
          // Do not publish the wrap until the shell exists. Showing it early
          // is a station you can fly through.
          await stampCollidersAsync(wrap);
          if (wrap.userData.colliders?.length) slot.idleWrap = wrap;
        }
      }
    } catch (err) {
      console.warn(`[station] ${def.id} fit failed`, err);
      slot.idleWrap = null;
    }
    slot.fitPending = null;
    return slot.idleWrap;
  });
  return slot.fitPending;
}

/** Put a fitted wrap back in the pool when its system is torn down. */
export function reclaimHeroWraps(root) {
  if (!root) return;
  const wraps = [];
  root.traverse((o) => {
    if (o.userData?.heroId) wraps.push(o);
  });
  for (const wrap of wraps) {
    if (wrap.parent) wrap.parent.remove(wrap);
    wrap.visible = false;
    const slot = slots.get(wrap.userData.heroId);
    if (slot && !slot.idleWrap) slot.idleWrap = wrap;
  }
}

/** Take the idle wrap for parenting (null if not ready). */
function takeIdleWrap(def) {
  const slot = slotFor(def);
  const wrap = slot.idleWrap;
  slot.idleWrap = null;
  return wrap;
}

/**
 * Start GLB parse + idle fit for every hero as early as title / fresh.
 * Safe on preview — nothing is attached to the scene.
 */
export function preloadMainStation() {
  return Promise.all(HERO_DEFS.map((def) => ensureFitted(def)));
}

function applyBeacons(rt, wrap) {
  const top = wrap.userData.top;
  const dock = wrap.userData.dockPoint;
  // Keep the gameplay radius from the station data. The fitted mesh is kilometres
  // across; copying that into rt.radius made a sphere that blocked lidar and jumps.
  if (rt.beacon && top != null) rt.beacon.position.y = top + 280;
  if (rt.beacon2 && dock) rt.beacon2.position.set(dock.x, dock.y - 120, dock.z);
}

function isCommittedHero(rt) {
  const name = rt?.mesh?.name;
  return !!name && HERO_DEFS.some((d) => d.wrapName === name);
}

function hideProcedural(rt) {
  if (rt?.mesh && !isCommittedHero(rt) && !rt._heroWrap) rt.mesh.visible = false;
}

/** Stage a finished idle wrap onto rt without parenting (for defer / jump). */
function stageWrap(rt, wrap) {
  if (!wrap?.userData.colliders?.length) return false;
  applyBeacons(rt, wrap);
  wrap.visible = false;
  rt._heroWrap = wrap;
  return true;
}

/**
 * If a hero GLB is already prebuilt, stage it now (sync, no clone/voxel).
 * Returns true when _heroWrap is set or already committed.
 */
export function stageHeroIfReady(rt) {
  const def = heroDefFor(rt?.data);
  if (!rt || !def) return false;
  if (isCommittedHero(rt)) return true;
  if (rt._heroWrap) {
    hideProcedural(rt);
    if (!rt._heroWrap.userData.colliders?.length) stampCollidersAsync(rt._heroWrap);
    return true;
  }
  const wrap = takeIdleWrap(def);
  if (!wrap) {
    hideProcedural(rt);
    return false;
  }
  return stageWrap(rt, wrap);
}

/**
 * Jump / arrival helper: hide procedural, commit prebuilt hero in this turn if
 * ready, otherwise keep procedural hidden and attach when prebuild resolves —
 * never sync-voxel on the jump frame.
 */
export function prepareHeroStation(rt, onReady) {
  const def = heroDefFor(rt?.data);
  if (!rt || !def) return false;
  hideProcedural(rt);
  if (isCommittedHero(rt)) {
    if (!rt.mesh.userData.colliders?.length) stampCollidersAsync(rt.mesh);
    if (onReady) onReady(rt);
    return true;
  }
  if (stageHeroIfReady(rt)) {
    commitHeroStation(rt);
    if (onReady) onReady(rt);
    return true;
  }
  const prev = rt._wantReveal;
  rt._wantReveal = (s) => {
    if (prev) prev(s);
    if (onReady) onReady(s);
  };
  if (!rt._dressing && !rt._heroWrap) dressMainStation(rt, null, { deferReveal: true });
  return false;
}

/** Swap in a finished hero wrap: parent it and drop the procedural stand-in. */
export function commitHeroStation(rt) {
  const wrap = rt?._heroWrap;
  if (!wrap) return false;
  if (rt.mesh && rt.mesh !== wrap) rt.group.remove(rt.mesh);
  if (wrap.parent !== rt.group) rt.group.add(wrap);
  rt.mesh = wrap;
  rt._heroWrap = null;
  rt._dressing = false;
  if (!wrap.userData.colliders?.length) return false;
  applyBeacons(rt, wrap);
  wrap.visible = true;
  return true;
}

/**
 * Attach (or stage) an imported GLB onto a matching hero station runtime.
 * opts.deferReveal: keep wrap detached / hidden and leave the procedural mesh
 * until commitHeroStation — used during the opening film and jumps.
 * Never runs clone/voxel synchronously.
 */
export function dressMainStation(rt, onReady, opts = {}) {
  const def = heroDefFor(rt?.data);
  if (!rt || !def) return;
  if (isCommittedHero(rt) || rt._heroWrap || rt._dressing) {
    if (isCommittedHero(rt) && onReady) onReady(rt);
    else if (rt._heroWrap && !opts.deferReveal) {
      commitHeroStation(rt);
      if (onReady) onReady(rt);
    }
    return;
  }
  const defer = !!opts.deferReveal;
  rt._dressing = true;

  const finish = (wrap) => {
    rt._dressing = false;
    if (!rt.group?.parent) return;
    if (isCommittedHero(rt) || rt._heroWrap) {
      if (onReady) onReady(rt);
      return;
    }
    if (!wrap?.userData.colliders?.length || wrap.parent) return;
    if (slotFor(def).idleWrap === wrap) slotFor(def).idleWrap = null;

    if (defer) {
      stageWrap(rt, wrap);
      const want = rt._wantReveal;
      rt._wantReveal = null;
      // Film: neither set yet → stage only. Jump/load / cinema.stop → commit.
      if (want || onReady) {
        commitHeroStation(rt);
        if (want) want(rt);
        else if (onReady) onReady(rt);
      }
      return;
    }

    applyBeacons(rt, wrap);
    if (rt.mesh) rt.group.remove(rt.mesh);
    if (rt.mesh && rt.mesh !== wrap) rt.group.remove(rt.mesh);
    rt.group.add(wrap);
    rt.mesh = wrap;
    wrap.visible = true;
    if (onReady) onReady(rt);
  };

  // Prefer an already-built idle wrap (sync stage/commit only — no voxel).
  const idle = takeIdleWrap(def);
  if (idle) {
    finish(idle);
    return;
  }

  ensureFitted(def).then((ready) => {
    const wrap = takeIdleWrap(def) || (ready && !ready.parent ? ready : null);
    finish(wrap);
  });
}
