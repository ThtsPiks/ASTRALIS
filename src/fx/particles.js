// ============================================================================
//  PARTICLE / FX SYSTEMS — explosions, engine trails, sparks, beams, warp
// ============================================================================
import * as THREE from '../../vendor/three/three.module.js';
import { clamp } from '../core/utils.js';

const P_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
uniform float uPixelRatio;
void main(){
  vColor = aColor; vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(aSize * uPixelRatio * (900.0 / max(-mv.z, 1.0)), 18.0);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;
const P_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
precision highp float;
varying vec3 vColor;
varying float vAlpha;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = pow(1.0 - d * 2.0, 1.8);
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(vColor * (0.6 + a * 1.4), a * vAlpha);
  #include <colorspace_fragment>
}`;

export class ParticleSystem {
  constructor(scene, max = 4000) {
    this.max = max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.alpha0 = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grow = new Float32Array(max);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    g.setDrawRange(0, 0);
    const m = new THREE.ShaderMaterial({
      uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
      vertexShader: P_VERT, fragmentShader: P_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
    this.geo = g;
    scene.add(this.points);
    this._c = new THREE.Color();
    this._v = new THREE.Vector3();
    this._etAcc = 0;
  }

  spawn(x, y, z, vx, vy, vz, life, size, color, drag = 0.9, grow = 0, alpha = 1) {
    let i;
    if (this.count < this.max) { i = this.count++; }
    else { i = Math.floor(Math.random() * this.max); }
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this._c.set(color);
    this.col[i3] = this._c.r; this.col[i3 + 1] = this._c.g; this.col[i3 + 2] = this._c.b;
    this.size[i] = size;
    this.alpha[i] = alpha;
    this.alpha0[i] = alpha;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.drag[i] = drag;
    this.grow[i] = grow;
  }

  update(dt) {
    const n = this.count;
    let w = 0;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      const i3 = i * 3, w3 = w * 3;
      const d = Math.pow(this.drag[i], dt * 60 / 60);
      const damp = Math.exp(-this.drag[i] * dt * 2.2);
      void d;
      this.vel[i3] *= damp; this.vel[i3 + 1] *= damp; this.vel[i3 + 2] *= damp;
      if (w !== i) {
        this.pos[w3] = this.pos[i3]; this.pos[w3 + 1] = this.pos[i3 + 1]; this.pos[w3 + 2] = this.pos[i3 + 2];
        this.vel[w3] = this.vel[i3]; this.vel[w3 + 1] = this.vel[i3 + 1]; this.vel[w3 + 2] = this.vel[i3 + 2];
        this.col[w3] = this.col[i3]; this.col[w3 + 1] = this.col[i3 + 1]; this.col[w3 + 2] = this.col[i3 + 2];
        this.size[w] = this.size[i]; this.drag[w] = this.drag[i];
        this.maxLife[w] = this.maxLife[i]; this.grow[w] = this.grow[i];
        this.alpha0[w] = this.alpha0[i];
      }
      this.pos[w3] += this.vel[w3] * dt;
      this.pos[w3 + 1] += this.vel[w3 + 1] * dt;
      this.pos[w3 + 2] += this.vel[w3 + 2] * dt;
      const t = this.life[w] / this.maxLife[w];
      this.alpha[w] = clamp(this.alpha0[w] * t * t * 1.6, 0, 1);
      this.size[w] = this.size[w] + this.grow[w] * dt;
      this.life[w] = this.life[i];
      w++;
    }
    this.count = w;
    this.geo.setDrawRange(0, w);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }

  // ------------------------------------------------------------- emitters
  explosion(pos, scale = 1, colorA = '#ffd27a', colorB = '#ff5a1e') {
    const n = Math.round(90 * scale);
    for (let i = 0; i < n; i++) {
      const dir = new THREE.Vector3().randomDirection();
      const sp = (18 + Math.random() * 130) * scale;
      const t = Math.random();
      this.spawn(
        pos.x + dir.x * scale * 2, pos.y + dir.y * scale * 2, pos.z + dir.z * scale * 2,
        dir.x * sp, dir.y * sp, dir.z * sp,
        0.5 + Math.random() * 1.5 * scale,
        (1.6 + Math.random() * 5) * scale,
        t < 0.45 ? '#ffffff' : t < 0.75 ? colorA : colorB,
        1.4 + Math.random(), 6 * scale
      );
    }
    // smoke / debris
    for (let i = 0; i < n * 0.6; i++) {
      const dir = new THREE.Vector3().randomDirection();
      const sp = (6 + Math.random() * 55) * scale;
      this.spawn(pos.x, pos.y, pos.z, dir.x * sp, dir.y * sp, dir.z * sp,
        1.2 + Math.random() * 2.4, (3 + Math.random() * 8) * scale,
        Math.random() < 0.4 ? '#4a3a34' : '#241d1c', 0.6, 12 * scale, 0.6);
    }
    // shockwave ring
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2;
      const up = new THREE.Vector3().randomDirection().multiplyScalar(0.25);
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).add(up).normalize();
      this.spawn(pos.x, pos.y, pos.z, dir.x * 240 * scale, dir.y * 240 * scale, dir.z * 240 * scale,
        0.42, 2.2 * scale, '#ffe6b0', 2.4, 0);
    }
  }

  sparks(pos, normal, count = 14, color = '#ffe6a0', speed = 50) {
    for (let i = 0; i < count; i++) {
      const dir = normal.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(0.85)).normalize();
      const sp = speed * (0.35 + Math.random());
      this.spawn(pos.x, pos.y, pos.z, dir.x * sp, dir.y * sp, dir.z * sp,
        0.18 + Math.random() * 0.4, 0.7 + Math.random() * 1.7, color, 2.2, 0);
    }
  }

  engineTrail(pos, dir, intensity, color = '#6fd8ff', spread = 0.5, dt = 0.016) {
    const rate = intensity * 18 * dt;
    this._etAcc = (this._etAcc || 0) + rate;
    let n = this._etAcc | 0;
    this._etAcc -= n;
    if (n > 3) n = 3;
    const s = this._v;
    for (let i = 0; i < n; i++) {
      s.randomDirection().multiplyScalar(spread * (0.6 + Math.random() * 1.2));
      const sp = 30 + intensity * 90;
      this.spawn(pos.x + s.x, pos.y + s.y, pos.z + s.z,
        -dir.x * sp + s.x * 16, -dir.y * sp + s.y * 16, -dir.z * sp + s.z * 16,
        0.35 + Math.random() * 0.35, 0.8 + intensity * 1.4, color, 3.0, 1.2, 0.18);
    }
  }

  warpStreak(pos, dir, amount) {
    if (amount <= 0.01) return;
    const n = Math.round(amount * 6);
    for (let i = 0; i < n; i++) {
      const s = new THREE.Vector3().randomDirection().multiplyScalar(30 + Math.random() * 160);
      this.spawn(pos.x + s.x, pos.y + s.y, pos.z + s.z,
        -dir.x * (400 + Math.random() * 1600), -dir.y * (400 + Math.random() * 1600), -dir.z * (400 + Math.random() * 1600),
        0.25 + Math.random() * 0.4, 1.2 + Math.random() * 2.4,
        Math.random() < 0.4 ? '#bfe4ff' : '#7fb4ff', 0.4, 0, 0.55);
    }
  }

  scanWave(pos, radius, color = '#7dffb0') {
    const n = 60;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const b = Math.acos(2 * Math.random() - 1);
      const dir = new THREE.Vector3(Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a));
      this.spawn(pos.x + dir.x * radius * 0.1, pos.y + dir.y * radius * 0.1, pos.z + dir.z * radius * 0.1,
        dir.x * radius * 0.9, dir.y * radius * 0.9, dir.z * radius * 0.9,
        1.1, 1.4, color, 0.2, 0, 0.8);
    }
  }

  dispose() {
    this.points.parent?.remove(this.points);
    this.geo.dispose();
    this.points.material.dispose();
  }
}

// ---------------------------------------------------------------------------
//  MINING / WEAPON BEAM
// ---------------------------------------------------------------------------
export class Beam {
  constructor(scene, color = '#7fe8ff') {
    const g = new THREE.CylinderGeometry(0.35, 0.35, 1, 8, 1, true);
    g.translate(0, -0.5, 0);
    g.rotateX(Math.PI / 2);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uAlpha: { value: 1 } },
      vertexShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); #include <logdepthbuf_vertex> }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        precision highp float;
        varying vec2 vUv;
        uniform float uTime, uAlpha; uniform vec3 uColor;
        void main(){
          float pulse = 0.6 + 0.4 * sin(vUv.y * 40.0 - uTime * 26.0);
          float edge = pow(1.0 - abs(vUv.x - 0.5) * 2.0, 0.6);
          float a = pulse * edge * uAlpha;
          #include <logdepthbuf_fragment>
          gl_FragColor = vec4(uColor * (1.2 + pulse), a);
          #include <colorspace_fragment>
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this._v = new THREE.Vector3();
  }
  set(from, to, width = 1) {
    this.mesh.visible = true;
    this.mesh.position.copy(from);
    const d = this._v.subVectors(to, from);
    const len = d.length();
    this.mesh.scale.set(width, width, len);
    this.mesh.lookAt(to);
  }
  hide() { this.mesh.visible = false; }
  update(dt) { this.mat.uniforms.uTime.value += dt; }
  dispose() { this.mesh.parent?.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
}

// ---------------------------------------------------------------------------
//  EXPANDING SHOCKWAVE RING
// ---------------------------------------------------------------------------
export class Shockwave {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.geo = new THREE.RingGeometry(0.86, 1, 64);
  }
  fire(pos, color = '#ffe6b0', size = 60, life = 0.8) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color), transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(this.geo, mat);
    m.position.copy(pos);
    m.quaternion.copy(this.scene.userData.camQuat || new THREE.Quaternion());
    this.scene.add(m);
    this.pool.push({ m, t: 0, life, size });
  }
  update(dt) {
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const w = this.pool[i];
      w.t += dt;
      const k = w.t / w.life;
      if (k >= 1) { this.scene.remove(w.m); w.m.material.dispose(); this.pool.splice(i, 1); continue; }
      const s = w.size * (0.2 + k * 3.2);
      w.m.scale.setScalar(s);
      w.m.material.opacity = (1 - k) * 0.85;
    }
  }
}

// ---------------------------------------------------------------------------
//  ACTIVE SENSOR — lidar rings, rotating scan plane, hull return ticks
// ---------------------------------------------------------------------------
const _SCAN_Z = new THREE.Vector3(0, 0, 1);
const _SCAN_LOOK = new THREE.Vector3();

export class ScanArray {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.group.frustumCulled = false;
    scene.add(this.group);
    const addMat = (color, opacity) => new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    });
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.88, 1.02, 72), addMat(0x7fd8ff, 0.55));
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.rings.push({ mesh, t: i / 3 });
    }
    this.plane = new THREE.Mesh(new THREE.CircleGeometry(1, 56), addMat(0x3ec8ff, 0.08));
    this.plane.frustumCulled = false;
    this.group.add(this.plane);
    this.sweep = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.045), addMat(0xffe9b0, 0.9));
    this.sweep.frustumCulled = false;
    this.sweep.position.z = 0.02;
    this.group.add(this.sweep);
    this.ticks = [];
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 6), addMat(0x7dffb0, 0));
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.ticks.push({ mesh, flash: 0, a: i * Math.PI / 3 });
    }
    this._flash = 0;
    this._spin = 0;
  }
  pingFlash() { this._flash = 1; }
  update(dt, ship, targetPos, active, mode, blocked) {
    if (!active || !ship) { this.group.visible = false; return; }
    this.group.visible = true;
    // The array is mounted to the ship.  It must follow the nose while the
    // pilot turns; using the locked target here left the ring fixed in the
    // direction it was first activated, even though the scan check used the
    // current ship heading.
    _SCAN_LOOK.copy(ship.forward);
    if (_SCAN_LOOK.lengthSq() < 1e-8 && targetPos) _SCAN_LOOK.copy(targetPos).sub(ship.position);
    if (_SCAN_LOOK.lengthSq() < 1e-8) _SCAN_LOOK.set(0, 0, 1);
    _SCAN_LOOK.normalize();
    this.group.position.copy(ship.position).addScaledVector(_SCAN_LOOK, 14);
    this.group.quaternion.setFromUnitVectors(_SCAN_Z, _SCAN_LOOK);
    const wreck = mode === 'wreck';
    const ping = mode === 'ping';
    const col = blocked ? 0xff5c5c : wreck ? 0xff9d5c : ping ? 0x7fd8ff : 0x7dffb0;
    for (const r of this.rings) r.mesh.material.color.setHex(col);
    this.plane.material.color.setHex(blocked ? 0xff5c5c : 0x3ec8ff);
    this.sweep.material.color.setHex(blocked ? 0xff8a8a : 0xffe9b0);
    // Keep the sensor animation near the reticle instead of filling the
    // chase camera and obscuring the ship.
    const span = wreck ? 1.8 : ping ? 2.2 : 2.6;
    this._spin += dt * (blocked ? 1.2 : ping ? 5.4 : 3.6);
    this.sweep.rotation.z = this._spin;
    this.plane.scale.setScalar(span * 0.92);
    this.plane.material.opacity = blocked ? 0.02 : 0.035;
    for (const r of this.rings) {
      r.t = (r.t + dt * (blocked ? 0.35 : 0.85)) % 1;
      r.mesh.scale.setScalar(1.2 + r.t * span);
      r.mesh.material.opacity = (1 - r.t) * (blocked ? 0.12 : 0.38);
    }
    this._flash = Math.max(0, this._flash - dt * 2.8);
    const hull = Math.max(1.6, (ship.scale || 1) * 2.4);
    for (const t of this.ticks) {
      t.flash = Math.max(t.flash * Math.exp(-dt * 6), this._flash);
      const wob = this._spin * 0.7 + t.a;
      t.mesh.position.set(Math.cos(wob) * hull * 0.55, Math.sin(wob * 1.4) * hull * 0.28, Math.sin(wob) * hull * 0.2);
      t.mesh.material.opacity = 0.06 + t.flash * 0.7;
      t.mesh.material.color.setHex(col);
    }
  }
  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
