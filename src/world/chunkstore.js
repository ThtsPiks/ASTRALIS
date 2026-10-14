// ============================================================================
//  DISK CHUNK STORE — albedo + streamed terrain tiles from /data/cache
// ============================================================================
import * as THREE from '../../vendor/three/three.module.js';

export const CHUNK_M = 420;
const TILE_RES = 48;

function pidOf(planet) {
  const raw = String(planet?.id || planet?.seed || 'w0000_terra');
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function parseAlbedo(buf) {
  const u8 = new Uint8Array(buf);
  const mag = String.fromCharCode(...u8.subarray(0, 8));
  if (mag !== 'ASTRALB1') return null;
  const view = new DataView(buf);
  const w = view.getUint16(8, true);
  const h = view.getUint16(10, true);
  const rgb = new Uint8Array(buf, 12, w * h * 3);
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    rgba[j] = rgb[i]; rgba[j + 1] = rgb[i + 1]; rgba[j + 2] = rgb[i + 2]; rgba[j + 3] = 255;
  }
  const tex = new THREE.DataTexture(rgba, w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function parseChunk(buf) {
  const u8 = new Uint8Array(buf);
  const mag = String.fromCharCode(...u8.subarray(0, 8));
  if (mag !== 'ASTRCH01') return null;
  const view = new DataView(buf);
  const res = view.getUint16(8, true);
  const heightBytes = res * res * 4;
  const rgbBytes = res * res * 3;
  const header = buf.byteLength - heightBytes - rgbBytes;
  if (header < 10) return null;
  const off = header >= 12 ? 12 : 10;
  const heights = new Float32Array(res * res);
  new Uint8Array(heights.buffer).set(new Uint8Array(buf, off, heightBytes));
  const rgb = new Uint8Array(buf, off + heightBytes, res * res * 3);
  return { res, heights, rgb };
}

export class ChunkStore {
  constructor() {
    this.id = '';
    this.albedo = null;
    this.manifest = null;
    this.tiles = new Map();
    this.inflight = new Set();
    this.missing = new Set();
    this.group = null;
    this.pal = null;
    this.ready = false;
  }

  async bind(planet, group, pal) {
    this.ready = false;
    this.group = group;
    this.pal = pal;
    this.unloadAll();
    try {
      const m = await fetch('data/cache/manifest.json').then((r) => (r.ok ? r.json() : null));
      this.manifest = m;
    } catch { this.manifest = null; }
    const type = planet?.type || 'rocky';
    const listed = this.manifest?.planets?.find((p) => p.type === type);
    if (listed) this.id = listed.id;
    else if (this.manifest?.planets?.length) {
      const i = Math.abs(planet?.seed || 1) % this.manifest.planets.length;
      this.id = this.manifest.planets[i].id;
    } else {
      this.id = pidOf(planet);
    }
    try {
      const buf = await fetch(`data/cache/planets/${this.id}/albedo.bin`).then((r) => (r.ok ? r.arrayBuffer() : null));
      if (buf) this.albedo = parseAlbedo(buf);
    } catch { this.albedo = null; }
    this.ready = !!this.id;
    return this.albedo;
  }

  request(ix, iz) {
    const key = `${ix}:${iz}`;
    if (!this.ready || this.tiles.has(key) || this.inflight.has(key) || this.missing.has(key) || !this.group) return;
    this.inflight.add(key);
    fetch(`data/cache/chunks/${this.id}/${ix}_${iz}.bin`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((buf) => {
        this.inflight.delete(key);
        if (!buf || !this.group) { this.missing.add(key); return; }
        const ch = parseChunk(buf);
        if (!ch) { this.missing.add(key); return; }
        const mesh = this._meshFromChunk(ch, ix, iz);
        this.group.add(mesh);
        this.tiles.set(key, mesh);
      })
      .catch(() => { this.inflight.delete(key); this.missing.add(key); });
  }

  _meshFromChunk(ch, ix, iz) {
    const res = Math.min(ch.res, TILE_RES + 16);
    const geo = new THREE.PlaneGeometry(CHUNK_M, CHUNK_M, res - 1, res - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const srcR = ch.res;
    for (let i = 0; i < pos.count; i++) {
      const u = (pos.getX(i) / CHUNK_M + 0.5);
      const v = (pos.getZ(i) / CHUNK_M + 0.5);
      const x = Math.max(0, Math.min(srcR - 1, Math.floor(u * (srcR - 1))));
      const y = Math.max(0, Math.min(srcR - 1, Math.floor(v * (srcR - 1))));
      const idx = y * srcR + x;
      pos.setY(i, ch.heights[idx] || 24);
      col[i * 3] = ch.rgb[idx * 3] / 255;
      col[i * 3 + 1] = ch.rgb[idx * 3 + 1] / 255;
      col[i * 3 + 2] = ch.rgb[idx * 3 + 2] / 255;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.82, metalness: 0.06, fog: true, envMapIntensity: 0.5,
    });
    if (this.albedo) {
      mat.map = this.albedo;
      mat.vertexColors = false;
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(ix * CHUNK_M, 0.4, iz * CHUNK_M);
    mesh.frustumCulled = true;
    return mesh;
  }

  stream(shipPos) {
    if (!this.ready || !shipPos) return;
    const ix = Math.round(shipPos.x / CHUNK_M);
    const iz = Math.round(shipPos.z / CHUNK_M);
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) this.request(ix + dx, iz + dz);
    }
    for (const [key, mesh] of this.tiles) {
      const [x, z] = key.split(':').map(Number);
      if (Math.abs(x - ix) > 3 || Math.abs(z - iz) > 3) {
        mesh.parent?.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        this.tiles.delete(key);
      }
    }
  }

  unloadAll() {
    for (const mesh of this.tiles.values()) {
      mesh.parent?.remove(mesh);
      mesh.geometry?.dispose();
      mesh.material?.dispose();
    }
    this.tiles.clear();
    this.inflight.clear();
    this.missing.clear();
    if (this.albedo) { this.albedo.dispose?.(); this.albedo = null; }
  }
}

let _store;
export function chunkStore() {
  if (!_store) _store = new ChunkStore();
  return _store;
}
