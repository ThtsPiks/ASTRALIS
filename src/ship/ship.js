// ============================================================================
//  SHIPS — player flight model, NPC AI, projectiles
// ============================================================================
import * as THREE from '../../vendor/three/three.module.js';
import { makeShipMesh, makeEnemyMesh, makeBolt, makeMissile, SHIP_DEFS, FLEET_IDS, COMING_IDS, HANGAR_IDS, resolveShipId } from './models.js?v=solo1';
import { createShieldMaterial, createGlowSprite } from '../world/materials.js';
import { clamp, lerp, damp, wrapAngle, TAU } from '../core/utils.js';
import { Audio } from '../core/audio.js';
import { makeSeekerMesh, SEEKER_LEN } from './missile.js?v=msk4';

const HARDPOINTS = {
  aurora: [[-1.48, -0.32, -3.5], [1.48, -0.32, -3.5]],
  vesper: [[-0.72, -0.78, -5.2], [0.72, -0.78, -5.2]],
  ember: [[-0.4, -0.28, -6.0], [0.4, -0.28, -6.0]],
  anvil: [[-3.62, -0.22, -3.2], [3.62, -0.22, -3.2], [-1.12, -0.7, -5.2], [1.12, -0.7, -5.2]],
  specter: [[-2.38, -0.14, -2.6], [2.38, -0.14, -2.6], [-0.86, -0.32, -5.0], [0.86, -0.32, -5.0]],
};
const ENGINES = {
  aurora: [[-1.18, 0, 5.1], [1.18, 0, 5.1]],
  vesper: [[-2.42, -0.22, 5.3], [2.42, -0.22, 5.3]],
  ember: [[-0.74, -0.08, 5.05], [0.74, -0.08, 5.05]],
  anvil: [[-1.55, 0.38, 5.8], [1.55, 0.38, 5.8]],
  specter: [[-0.58, -0.04, 4.28], [0.58, -0.04, 4.28]],
};

let _gearMats = null;
function gearMaterials() {
  if (_gearMats) return _gearMats;
  _gearMats = {
    steel: new THREE.MeshStandardMaterial({ color: 0x4a515c, metalness: 0.86, roughness: 0.28 }),
    piston: new THREE.MeshStandardMaterial({ color: 0xb8c0c8, metalness: 0.9, roughness: 0.18 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1c2026, metalness: 0.55, roughness: 0.48 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x141416, metalness: 0.06, roughness: 0.94 }),
    hub: new THREE.MeshStandardMaterial({ color: 0x8a929c, metalness: 0.78, roughness: 0.32 }),
  };
  return _gearMats;
}

function defaultGearBays() {
  return [
    { x: 0, y: -0.52, z: -2.15, len: 1.05, dual: false, splay: 0, fold: 1.32 },
    { x: -0.78, y: -0.54, z: 1.05, len: 1.22, dual: true, splay: -0.18, fold: -1.48 },
    { x: 0.78, y: -0.54, z: 1.05, len: 1.22, dual: true, splay: 0.18, fold: -1.48 },
  ];
}

function makeGearLeg(bay) {
  const mats = gearMaterials();
  const len = bay.len || 1.15;
  const root = new THREE.Group();
  root.position.set(bay.x, bay.y, bay.z);
  root.rotation.z = bay.splay || 0;

  const pivot = new THREE.Group();
  root.add(pivot);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.12, 10), mats.dark);
  collar.position.y = 0.04;
  pivot.add(collar);

  const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.078, len * 0.62, 10), mats.steel);
  strut.position.y = -len * 0.31;
  pivot.add(strut);

  const scA = new THREE.Mesh(new THREE.BoxGeometry(0.045, len * 0.32, 0.032), mats.dark);
  scA.position.set(0.09, -len * 0.38, 0);
  scA.rotation.z = 0.42;
  pivot.add(scA);
  const scB = new THREE.Mesh(new THREE.BoxGeometry(0.045, len * 0.26, 0.028), mats.steel);
  scB.position.set(0.07, -len * 0.52, 0);
  scB.rotation.z = -0.38;
  pivot.add(scB);

  const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, len * 0.42, 10), mats.piston);
  piston.position.y = -len * 0.72;
  pivot.add(piston);

  const axleW = bay.dual ? 0.34 : 0.16;
  const axle = new THREE.Mesh(new THREE.BoxGeometry(axleW, 0.09, 0.09), mats.steel);
  axle.position.y = -len * 0.94;
  pivot.add(axle);

  const wheels = [];
  const xs = bay.dual ? [-0.13, 0.13] : [0];
  const r = bay.dual ? 0.175 : 0.15;
  for (const wx of xs) {
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.085, 18), mats.rubber);
    tire.rotation.z = Math.PI / 2;
    tire.position.set(wx, -len * 0.94, 0);
    pivot.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.52, r * 0.52, 0.092, 12), mats.hub);
    rim.rotation.z = Math.PI / 2;
    rim.position.set(wx, -len * 0.94, 0);
    pivot.add(rim);
    wheels.push(tire);
  }

  root.userData.pivot = pivot;
  root.userData.fold = bay.fold ?? (Math.abs(bay.x) < 0.05 ? 1.32 : -1.48);
  root.userData.wheels = wheels;
  root.userData.len = len;
  root.visible = false;
  return root;
}

export class Ship {
  constructor(def, scene, shipScale = 1) {
    this.def = def;
    this.stats = { ...def.stats };
    this.scene = scene;
    this.group = new THREE.Group();
    this.mesh = makeShipMesh(def, shipScale);
    this.group.add(this.mesh);
    this.scale = shipScale;

    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.velocity = new THREE.Vector3();
    this.angVel = new THREE.Vector3();

    this.throttle = 0;
    this.boostAmt = 0;
    this.boost = false;
    this._boostVis = 0;
    this.speed = 0;

    this.hull = this.stats.hull;
    this.maxHull = this.stats.hull;
    this.shield = this.stats.shield;
    this.maxShield = this.stats.shield;
    this.fuel = this.stats.fuel;
    this.maxFuel = this.stats.fuel;

    this.cargo = {};
    this.cargoUsed = 0;
    this.credits = 0;

    this.cooldown = 0;
    this.missileCooldown = 0;
    this.mining = false;
    this.shieldHitT = 0;
    this.hullHitT = 0;
    this.alive = true;

    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();

    this.shieldMat = createShieldMaterial('#59d8ff');
    this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), this.shieldMat);
    this.shieldMesh.scale.setScalar(shipScale * 7.5);
    this.group.add(this.shieldMesh);

    this.gearDown = false;
    this.gearFrac = 0;
    this._bindPropulsion();

    scene.add(this.group);
  }

  _clearPropulsion() {
    for (const s of this.engineGlows || []) s.parent?.remove(s);
    for (const g of this.gear || []) g.parent?.remove(g);
    if (this.mesh) {
      const drop = [];
      this.mesh.children.forEach((o) => { if (o.userData?.nitroRig) drop.push(o); });
      drop.forEach((o) => o.parent?.remove(o));
    }
    this.engineGlows = [];
    this.nitroFx = [];
    this.gear = [];
  }

  _bindPropulsion() {
    this._lightMats = null;
    this.nitroFx = [];
    this.engineGlows = [];
    const mesh = this.mesh;
    const engines = mesh.userData.enginePos?.length ? mesh.userData.enginePos : (ENGINES[this.def.id] || []);
    const guns = mesh.userData.guns?.length ? mesh.userData.guns : (HARDPOINTS[this.def.id] || []);
    if (mesh.userData.hero) {
      mesh.traverse((o) => {
        if (o.userData.nitroSprite) this.engineGlows.push(o);
        if (o.userData.nitroRig) this.nitroFx.push(o.userData.nitroRig);
      });
    } else {
      for (const e of engines) {
        const sp = createGlowSprite(this.def.colors?.glowEmit || '#59d8ff', 1.5, 0.0, 3.8);
        sp.position.set(e[0], e[1], e[2]);
        mesh.add(sp);
        this.engineGlows.push(sp);
      }
    }
    this.hardpoints = guns.map((h) => new THREE.Vector3(h[0], h[1], h[2]).multiplyScalar(this.scale));
    this.engineLocal = engines.map((h) => new THREE.Vector3(h[0], h[1], h[2]).multiplyScalar(this.scale));
    this.gear = [];
    const bays = mesh.userData.gear?.length ? mesh.userData.gear : defaultGearBays();
    let reach = 0;
    for (const bay of bays) {
      const leg = makeGearLeg(bay);
      mesh.add(leg);
      this.gear.push(leg);
      reach = Math.max(reach, -(bay.y || 0) + (bay.len || 1.15));
    }
    this.gearReach = reach || 2.4;
  }

  applyLivery(hex) {
    if (!hex) return;
    this._livery = hex;
    if (this.def?.colors) this.def.colors.glowEmit = hex;
    const skip = new Set(['navL', 'navR', 'strobe']);
    this.mesh?.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (skip.has(o.name)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m?.emissive) continue;
        if ((m.emissiveIntensity || 0) < 0.35) continue;
        m.emissive.set(hex);
      }
    });
    for (const s of this.engineGlows || []) {
      if (s.material?.color) s.material.color.set(hex);
    }
    for (const fx of this.nitroFx || []) {
      if (fx.col?.set) fx.col.set(hex);
    }
  }

  replaceHull(mesh) {
    if (!mesh || mesh === this.mesh) return false;
    this._clearPropulsion();
    this.group.remove(this.mesh);
    this.mesh.traverse((o) => {
      if (o.geometry?.userData?.own) o.geometry.dispose();
      if (!o.material) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach((m) => { if (!m.userData?.keepMaps) m.dispose(); });
    });
    this.mesh = mesh;
    this.group.add(mesh);
    this._bindPropulsion();
    this.gearFrac = this.gearDown ? 1 : 0;
    if (this._livery) this.applyLivery(this._livery);
    return true;
  }

  get forward() { return this._fwd.set(0, 0, -1).applyQuaternion(this.quaternion); }
  get right() { return this._right.set(1, 0, 0).applyQuaternion(this.quaternion); }
  get up() { return this._up.set(0, 1, 0).applyQuaternion(this.quaternion); }

  hardpointWorld(i) {
    return this.hardpoints[i % this.hardpoints.length].clone().applyQuaternion(this.quaternion).add(this.position);
  }
  engineWorld(i) {
    return this.engineLocal[i % this.engineLocal.length].clone().applyQuaternion(this.quaternion).add(this.position);
  }

  sync() {
    this.group.position.copy(this.position);
    this.group.quaternion.copy(this.quaternion);
  }

  damage(amount, fromDir) {
    if (!this.alive) return 'none';
    let remaining = amount;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, remaining);
      this.shield -= absorbed;
      remaining -= absorbed;
      this.shieldHitT = 1;
      Audio.shieldHit();
    }
    if (remaining > 0) {
      this.hull -= remaining;
      this.hullHitT = 1;
      Audio.hit();
    }
    if (this.hull <= 0) { this.hull = 0; this.alive = false; return 'destroyed'; }
    return remaining > 0 ? 'hull' : 'shield';
  }

  repair(hullAmount, shieldAmount) {
    this.hull = Math.min(this.maxHull, this.hull + hullAmount);
    this.shield = Math.min(this.maxShield, this.shield + shieldAmount);
  }

  updateVisuals(dt, time, camPos) {
    this.shieldMat.uniforms.uTime.value = time;
    this.shieldMat.uniforms.uHit.value = this.shieldHitT;
    const shieldFrac = this.shield / Math.max(1, this.maxShield);
    this.shieldMat.uniforms.uOpacity.value = clamp(this.shieldHitT * 0.9 + (shieldFrac < 0.35 ? 0.12 : 0.0), 0, 1);
    this.shieldHitT = Math.max(0, this.shieldHitT - dt * 2.6);
    this.hullHitT = Math.max(0, this.hullHitT - dt * 3.2);
    const g = clamp(this.throttle, 0, 1.6);
    // exhaust-cone fade: when the camera sits directly behind the engines the
    // additive glows stack into a white veil — dim them by view alignment.
    let cone = 0;
    if (camPos) {
      const back = this._backVec || (this._backVec = new THREE.Vector3());
      back.set(0, 0, 1).applyQuaternion(this.group.quaternion);
      const toCam = this._toCam || (this._toCam = new THREE.Vector3());
      toCam.copy(camPos).sub(this.group.position).normalize();
      const d = back.dot(toCam);
      cone = d > 0 ? d * d : 0;
    }
    const fade = 1 - 0.85 * cone;
    this._boostVis = damp(this._boostVis || 0, this.boost ? 1 : 0, 14, dt);
    this.boostAmt = this._boostVis;
    const b = this._boostVis;
    for (const s of this.engineGlows) {
      if (this.mesh?.userData?.hero) {
        const base = 1.15 + g * 1.55 + b * 2.35;
        s.scale.setScalar(base);
        s.material.opacity = clamp(0.28 + g * 0.4 + b * 0.38, 0.22, 0.92);
        if (b > 0.3) s.material.color.set('#ffd6a0');
        else s.material.color.set(this.def.colors?.glowEmit || '#3ec8ff');
      } else {
        const base = (0.45 + g * 0.75 + b * 0.5) * (1 - 0.55 * cone);
        s.scale.setScalar(base * (0.97 + Math.sin(time * 2.2 + s.position.x) * 0.03));
        s.material.opacity = clamp((0.03 + g * 0.2 + b * 0.05) * fade, 0, 0.28);
      }
    }
    for (const fx of this.nitroFx || []) {
      const len = 1 + g * 0.9 + b * 2.15;
      const fat = 1 + g * 0.12 + b * 0.4;
      if (fx.cone) {
        fx.cone.scale.set(fat, len, fat);
        fx.cone.material.opacity = clamp(0.2 + g * 0.34 + b * 0.38, 0.16, 0.8);
        fx.cone.material.color.copy(b > 0.28 ? fx.boost : fx.col);
      }
      if (fx.flame) {
        fx.flame.scale.set(0.85 + b * 0.5, 0.7 + g * 0.5 + b * 1.6, 0.85 + b * 0.5);
        fx.flame.material.opacity = clamp(b * 0.72, 0, 0.7);
      }
      if (fx.core?.material) {
        fx.core.material.emissiveIntensity = 1.5 + g * 1.9 + b * 2.6;
        fx.core.material.emissive.copy(b > 0.28 ? fx.boost : fx.col);
      }
    }
    // engine discs breathe with throttle; strobes blink; nav lights steady
    if (!this._lightMats) {
      this._lightMats = { glow: null, strobe: null };
      this.mesh.traverse((o) => { if (o.isMesh && o.name && this._lightMats.hasOwnProperty(o.name)) this._lightMats[o.name] = o.material; });
    }
    if (this._lightMats.glow) this._lightMats.glow.emissiveIntensity = 0.7 + g * 1.0 + b * 0.7 + Math.sin(time * 2.4) * 0.04;
    if (this._lightMats.strobe) {
      const ph = (time * 1.1) % 1;
      this._lightMats.strobe.emissiveIntensity = (ph < 0.06 || (ph > 0.14 && ph < 0.2)) ? 1.3 : 0.05;
    }
    this.gearFrac = damp(this.gearFrac || 0, this.gearDown ? 1 : 0, 7.2, dt);
    for (const gmesh of this.gear) {
      const f = this.gearFrac;
      gmesh.visible = f > 0.03;
      if (gmesh.userData.pivot) gmesh.userData.pivot.rotation.x = (1 - f) * (gmesh.userData.fold || -1.4);
      if (this.gearDown && this.speed > 2) {
        for (const w of gmesh.userData.wheels || []) w.rotation.x += this.speed * dt * 0.55;
      }
    }
    // damage smoke tint
    if (this.hull / this.maxHull < 0.35) {
      this.mesh.children.forEach((c) => { if (c.material?.emissive && c.material.userData?._orig === undefined) { } });
    }
  }

  dispose() {
    if (this.group.parent) this.group.parent.remove(this.group);
    else this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (!o.material) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach((m) => { if (!m.userData?.keepMaps) m.dispose(); });
    });
  }
}

// ---------------------------------------------------------------------------
//  PLAYER CONTROLLER
// ---------------------------------------------------------------------------
export class PlayerController {
  constructor(ship) {
    this.ship = ship;
    this.flightAssist = true;
    this.pitch = 0; this.yaw = 0; this.roll = 0;
    this.maxSpeed = 500;
    this.speedCap = 500;
    this.reverse = false;
    this._boostHold = 0;
    this._ax = { v: 0 }; this._ay = { v: 0 }; this._ar = { v: 0 };
    this.atmoYaw = null;
    this.atmoPitch = 0;
    this.atmoRoll = 0;
  }

  resetAtmo(yaw = 0, pitch = -0.1) {
    this.atmoYaw = yaw;
    this.atmoPitch = pitch;
    this.atmoRoll = 0;
  }

  clearAtmo() {
    this.atmoYaw = null;
    this.atmoPitch = 0;
    this.atmoRoll = 0;
  }

  update(dt, input, opts) {
    const s = this.ship;
    if (!s.alive) return;
    const st = s.stats;

    // ---- throttle --------------------------------------------------------
    if (input.down('KeyW')) s.throttle = clamp(s.throttle + dt * 0.55, 0, 1);
    if (input.down('KeyS')) s.throttle = clamp(s.throttle - dt * 0.55, -0.35, 1);
    if (input.wheel !== 0) s.throttle = clamp(s.throttle + input.wheel * 0.14, -0.35, 1);
    if (input.hit('KeyR') || input.hit('Space') && opts.brakeOnSpace) s.throttle = 0;
    if (input.down('KeyR')) {
      // brake: dump velocity
      s.velocity.multiplyScalar(Math.exp(-3.2 * dt));
      s.throttle = Math.max(0, s.throttle - dt * 1.4);
    }
    if ((s.fuel || 0) <= 0.05) {
      s.boost = false;
      if (s.throttle > 0.18) s.throttle = 0.18;
    }
    const wantBoost = (input.down('ShiftLeft') || input.down('ShiftRight'))
      && s.throttle > 0.08 && s.fuel > 0.05;
    if (wantBoost) {
      s.boost = true;
      this._boostHold = 0.22;
    } else if (s.boost && s.throttle > 0.04 && s.fuel > 0.05 && this._boostHold > 0) {
      this._boostHold -= dt;
      s.boost = true;
    } else {
      s.boost = false;
      this._boostHold = 0;
    }

    // gamepad — ignore until a button is pressed so a parked pad cannot climb
    const gp = input.gamepad();
    let gpPitch = 0, gpYaw = 0, gpRoll = 0;
    if (gp) {
      if (!input.gpLive && gp.buttons?.some((b) => b && (b.pressed || b.value > 0.4))) input.gpLive = true;
      if (input.gpLive) {
        const dz = (v) => (Math.abs(v) < 0.22 ? 0 : v);
        gpYaw = dz(gp.axes[0] || 0);
        gpPitch = dz(gp.axes[1] || 0);
        gpRoll = dz(gp.axes[2] || 0) + (gp.buttons[4]?.pressed ? -1 : 0) + (gp.buttons[5]?.pressed ? 1 : 0);
        const rt = gp.buttons[7]?.value || 0;
        const lt = gp.buttons[6]?.value || 0;
        if (rt > 0.05) s.throttle = clamp(rt, 0, 1);
        else if (lt > 0.05) s.throttle = clamp(-lt, -0.35, 1);
      }
    }

    // ---- steering: motion stick only. Cursor *position* (nx/ny) must never
    // steer — after a menu click the pointer sits in the top half and the
    // nose climbs forever.
    let mx = 0, my = 0;
    if (opts.mouseSteer) {
      const DZ = 0.04;
      const shape = (v) => { const a = Math.abs(v); return a < DZ ? 0 : Math.sign(v) * Math.pow((a - DZ) / (1 - DZ), 1.15); };
      const sens = opts.sensitivity ?? 1;
      mx = clamp(shape(clamp(input.mouse.sx * sens, -1, 1)), -1, 1);
      my = clamp(shape(clamp(input.mouse.sy * sens, -1, 1)), -1, 1) * (opts.invertY ? -1 : 1);
    }
    if (input.down('ArrowLeft')) mx = -1;
    if (input.down('ArrowRight')) mx = 1;
    if (input.down('ArrowUp')) my = -1;
    if (input.down('ArrowDown')) my = 1;
    mx = clamp(mx + gpYaw, -1, 1);
    my = clamp(my + gpPitch, -1, 1);

    let rollIn = 0;
    if (!opts.atmo && input.down('KeyA')) rollIn -= 1;
    if (!opts.atmo && input.down('KeyD')) rollIn += 1;
    if (input.down('KeyQ')) rollIn -= 1;
    if (input.down('KeyE') && (opts.rollOnE || opts.atmo)) rollIn += 1;
    rollIn = clamp(rollIn + gpRoll, -1, 1);

    this.pitch = my; this.yaw = mx; this.roll = rollIn;

    if (opts.atmo) {
      // On a planet A/D are the easy keyboard yaw controls; Q/E retain roll.
      if (input.down('KeyA')) mx = -1;
      if (input.down('KeyD')) mx = 1;
      this._updateAtmo(dt, opts, input, mx, my, rollIn);
      return;
    }

    const turn = st.turn * (s.boost ? 0.82 : 1) * (opts.warp ? 0.25 : 1) * (opts.turnMul || 1);
    const pitchRate = 0.92 * turn, yawRate = 0.72 * turn, rollRate = 1.6 * turn;

    s.angVel.x = damp(s.angVel.x, -my * pitchRate, 6, dt);
    s.angVel.y = damp(s.angVel.y, -mx * yawRate, 6, dt);
    s.angVel.z = damp(s.angVel.z, -rollIn * rollRate, 6, dt);

    s._e.set(s.angVel.x * dt, s.angVel.y * dt, s.angVel.z * dt);
    s._q.setFromEuler(s._e);
    s.quaternion.multiply(s._q).normalize();

    // ---- thrust ----------------------------------------------------------
    const fwd = s.forward;
    this.speedCap = opts.maxSpeed;
    const boostMul = s.boost ? (opts.atmo ? Math.min(1.22, st.boost) : st.boost) : 1;
    const targetSpeed = s.throttle * this.speedCap * boostMul;
    const accel = st.accel * (s.boost ? 2.1 : 1) * (opts.pipEng || 1) * (opts.accelMul || 1);
    const curFwd = s.velocity.dot(fwd);
    const delta = clamp(targetSpeed - curFwd, -accel * dt * 1.6, accel * dt);
    s.velocity.addScaledVector(fwd, delta);

    if (this.flightAssist) {
      const fwdSpeed = s.velocity.dot(fwd);
      s._tmp.copy(fwd).multiplyScalar(fwdSpeed);
      const lateral = s.velocity.clone().sub(s._tmp);
      const k = 6.5 * (opts.assist == null ? 1 : opts.assist);
      s.velocity.sub(lateral.multiplyScalar(clamp(k * dt, 0, 1)));
      const sp = s.velocity.length();
      const maxAllowed = Math.abs(targetSpeed) * 1.12 + 8;
      if (sp > maxAllowed) s.velocity.multiplyScalar(damp(sp, maxAllowed, 3.2, dt) / sp);
    } else {
      s.velocity.multiplyScalar(Math.exp(-0.045 * dt));
    }

    s.speed = s.velocity.length();
    if (s.boost) s.fuel = Math.max(0, s.fuel - dt * 0.9);
    else if (s.throttle > 0.6) s.fuel = Math.max(0, s.fuel - dt * 0.06);

    // Shields recharge only when docked (see Game.dock), not in flight.

    s.position.addScaledVector(s.velocity, dt);
    s.sync();
    s.updateVisuals(dt, opts.time, opts.camPos);
  }

  _updateAtmo(dt, opts, input, mx, my, rollIn) {
    const s = this.ship;
    const st = s.stats;
    if (this.atmoYaw == null) {
      s._e.setFromQuaternion(s.quaternion, 'YXZ');
      this.atmoYaw = s._e.y;
      this.atmoPitch = clamp(s._e.x, -0.72, 0.78);
      this.atmoRoll = clamp(s._e.z, -0.55, 0.55);
    }

    const turn = st.turn * (s.boost ? 0.9 : 1) * (opts.turnMul || 1);
    this.atmoYaw += -mx * turn * 1.22 * dt;
    this.atmoPitch = clamp(this.atmoPitch + -my * turn * 0.92 * dt, -0.72, 0.78);
    const wantRoll = clamp(-mx * 0.38 + rollIn * 0.42, -0.52, 0.52);
    this.atmoRoll = damp(this.atmoRoll, wantRoll, 7.5, dt);
    if (Math.abs(rollIn) < 0.08 && Math.abs(mx) < 0.08) {
      this.atmoRoll = damp(this.atmoRoll, 0, 4.2, dt);
    }

    s._e.set(this.atmoPitch, this.atmoYaw, this.atmoRoll, 'YXZ');
    s.quaternion.setFromEuler(s._e);
    s.angVel.set(-my * turn, -mx * turn, -this.atmoRoll);

    const fwd = s.forward;
    const heading = s._tmp.set(fwd.x, 0, fwd.z);
    if (heading.lengthSq() < 1e-6) heading.set(0, 0, -1);
    heading.normalize();

    const gPull = Math.max(4, opts.gPull || 9.6);
    const boostMul = s.boost ? 1.12 : 1;
    const thr = Math.max(0, s.throttle);
    const climb = clamp(fwd.y, -0.55, 0.72);
    // Forward throttle no longer turns into vertical lift. Keep level flight
    // stable, with a separate hold-to-climb / hold-to-descend input.
    const liftCmd = (input.down('Space') ? 1 : 0) - (input.down('ControlLeft') || input.down('ControlRight') ? 1 : 0);
    const climbLift = clamp(climb, -0.55, 0.72) * 0.5;
    s.velocity.y += gPull * (1 + (liftCmd * 0.78 + climbLift) * boostMul) * dt;

    this.speedCap = opts.maxSpeed || 420;
    const cruise = this.speedCap * thr * boostMul * (1 - Math.max(0, climb) * 0.24);
    const curH = s.velocity.x * heading.x + s.velocity.z * heading.z;
    const acc = st.accel * (s.boost ? 1.8 : 1) * (opts.pipEng || 1) * (opts.accelMul || 1);
    const dH = clamp(cruise - curH, -acc * dt * 1.5, acc * dt);
    s.velocity.x += heading.x * dH;
    s.velocity.z += heading.z * dH;

    const latX = s.velocity.x - heading.x * (curH + dH);
    const latZ = s.velocity.z - heading.z * (curH + dH);
    const k = 6.2 * (opts.assist == null ? 1 : Math.max(0.45, opts.assist));
    const f = clamp(k * dt, 0, 1);
    s.velocity.x -= latX * f;
    s.velocity.z -= latZ * f;

    s.speed = s.velocity.length();
    if (s.boost) s.fuel = Math.max(0, s.fuel - dt * 0.9);
    else if (s.throttle > 0.6) s.fuel = Math.max(0, s.fuel - dt * 0.06);

    s.position.addScaledVector(s.velocity, dt);
    s.sync();
    s.updateVisuals(dt, opts.time, opts.camPos);
  }
}

// ---------------------------------------------------------------------------
//  NPC SHIPS
// ---------------------------------------------------------------------------
export class NpcShip {
  constructor(scene, variant, position, opts = {}) {
    this.variant = variant;
    this.mesh = makeEnemyMesh(variant);
    this.mesh.scale.setScalar(opts.scale || 1);
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    this.group.position.copy(position);
    scene.add(this.group);

    this.position = position.clone();
    this.quaternion = new THREE.Quaternion();
    this.velocity = new THREE.Vector3();
    this.speed = 0;
    this.hull = opts.hull || 90;
    this.maxHull = this.hull;
    this.shield = opts.shield || 60;
    this.maxShield = this.shield;
    this.alive = true;
    this.hostile = opts.hostile !== false;
    this.bounty = opts.bounty || 900;
    this.name = opts.name || 'Unknown Contact';
    this.faction = opts.faction || 'Pirates';
    this.aggroRange = opts.aggroRange || 9000;
    this.fireRange = opts.fireRange || 2200;
    this.maxSpeed = opts.maxSpeed || 380;
    this.turn = opts.turn || 1.1;
    this.cooldown = Math.random() * 1.2;
    this.state = 'patrol';
    this.wander = new THREE.Vector3().randomDirection().multiplyScalar(600);
    this.wanderT = 0;
    this.accuracy = opts.accuracy ?? 0.55;
    this._fwd = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._m = new THREE.Matrix4();

    const glowCol = variant === 0 ? '#ff5a3d' : '#c04cf0';
    this.engineGlow = createGlowSprite(glowCol, 0.72, 0.38, 2.6);
    this.engineGlow.position.set(variant === 0 ? -1.3 : -2.2, variant === 0 ? 0 : -0.2, 3.7);
    this.mesh.add(this.engineGlow);
    this.engineGlow2 = createGlowSprite(glowCol, 0.72, 0.38, 2.6);
    this.engineGlow2.position.set(variant === 0 ? 1.3 : 2.2, variant === 0 ? 0 : -0.2, 3.7);
    this.mesh.add(this.engineGlow2);
    this.shieldMat = createShieldMaterial('#ff6a6a');
    this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), this.shieldMat);
    this.shieldMesh.scale.setScalar(7);
    this.group.add(this.shieldMesh);
    this.hitT = 0;
  }

  get forward() { return this._fwd.set(0, 0, -1).applyQuaternion(this.quaternion); }

  damage(amount) {
    if (this.shield > 0) {
      const a = Math.min(this.shield, amount);
      this.shield -= a; amount -= a; this.hitT = 1;
    }
    this.hull -= amount;
    this.hitT = 1;
    if (this.hull <= 0) { this.hull = 0; this.alive = false; return true; }
    return false;
  }

  update(dt, time, player, obstacles, fireCb) {
    if (!this.alive) return;
    const toPlayer = this._tmp.copy(player.position).sub(this.position);
    const dist = toPlayer.length();
    toPlayer.normalize();

    if (dist < this.aggroRange && this.hostile) this.state = 'attack';
    else if (this.state === 'attack' && dist > this.aggroRange * 1.7) this.state = 'patrol';

    let desired = this._tmp2;
    if (this.state === 'attack') {
      // lead the target
      const t = dist / 1400;
      desired.copy(player.position).addScaledVector(player.velocity, t * this.accuracy).sub(this.position);
      const want = desired.length();
      desired.normalize();
      // keep preferred stand-off distance
      const ideal = this.fireRange * 0.55;
      if (want < ideal * 0.6) desired.multiplyScalar(-0.6);
      // orbit a bit
      if (want < this.fireRange) {
        const side = this._tmp.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
        desired.addScaledVector(side, 0.35 * Math.sin(time * 0.5 + this.wanderT));
        desired.normalize();
      }
    } else {
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = 4 + Math.random() * 5;
        this.wander.set(
          this.position.x + (Math.random() - 0.5) * 8000,
          this.position.y + (Math.random() - 0.5) * 3000,
          this.position.z + (Math.random() - 0.5) * 8000
        );
      }
      desired.copy(this.wander).sub(this.position).normalize();
    }

    // obstacle avoidance
    for (const o of obstacles) {
      const dx = this.position.x - o.x, dy = this.position.y - o.y, dz = this.position.z - o.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const safe = o.r * 1.35 + 120;
      if (d < safe && d > 0.001) {
        desired.addScaledVector(this._tmp.set(dx / d, dy / d, dz / d), (safe - d) / safe * 3.2);
        desired.normalize();
      }
    }

    // rotate toward desired
    const fwd = this.forward;
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), desired.clone().negate(), new THREE.Vector3(0, 1, 0));
    const targetQ = new THREE.Quaternion().setFromRotationMatrix(m);
    const angle = 2 * Math.acos(clamp(Math.abs(targetQ.dot(this.quaternion)), 0, 1));
    this.quaternion.slerp(targetQ, clamp(this.turn * dt * 1.6, 0, 1));
    this.quaternion.normalize();

    const aligned = fwd.dot(desired);
    const thrust = this.state === 'attack' ? (aligned > 0.5 ? 1 : 0.35) : 0.6;
    const targetSpeed = this.maxSpeed * thrust * (this.state === 'attack' && dist < this.fireRange * 0.7 ? 0.7 : 1);
    const cur = this.velocity.dot(fwd);
    this.velocity.addScaledVector(fwd, clamp(targetSpeed - cur, -260 * dt, 260 * dt));
    // damp lateral
    const fs = this.velocity.dot(fwd);
    const lat = this.velocity.clone().addScaledVector(fwd, -fs);
    this.velocity.sub(lat.multiplyScalar(clamp(5 * dt, 0, 1)));
    this.speed = this.velocity.length();
    this.position.addScaledVector(this.velocity, dt);

    this.group.position.copy(this.position);
    this.group.quaternion.copy(this.quaternion);

    // weapons
    this.cooldown -= dt;
    if (this.state === 'attack' && this.cooldown <= 0 && dist < this.fireRange && aligned > 0.86) {
      this.cooldown = 0.55 + Math.random() * 0.7;
      const origin = this.position.clone().addScaledVector(fwd, 6);
      const spread = (1 - this.accuracy) * 0.06;
      const dir = toPlayer.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(spread)).normalize();
      fireCb && fireCb(origin, dir, this);
    }

    this.hitT = Math.max(0, this.hitT - dt * 2.6);
    this.shieldMat.uniforms.uTime.value = time;
    this.shieldMat.uniforms.uHit.value = this.hitT;
    this.shieldMat.uniforms.uOpacity.value = clamp(this.hitT * 0.9, 0, 1);
    this.engineGlow.material.opacity = 0.12 + thrust * 0.32;
    this.engineGlow.scale.setScalar(0.7 + thrust * 0.9);
    this.engineGlow2.material.opacity = this.engineGlow.material.opacity;
    this.engineGlow2.scale.copy(this.engineGlow.scale);
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry && o.geometry.userData?.own) o.geometry.dispose();
      if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { m.map?.dispose?.(); m.dispose(); }); }
    });
  }
}

// ---------------------------------------------------------------------------
//  PROJECTILES
// ---------------------------------------------------------------------------
export class ProjectileManager {
  constructor(scene, max = 260) {
    this.scene = scene;
    this.pool = [];
    this.active = [];
    this.max = max;
    for (let i = 0; i < max; i++) {
      const m = makeBolt('#7fe8ff');
      m.visible = false;
      scene.add(m);
      this.pool.push({ mesh: m, vel: new THREE.Vector3(), life: 0, dmg: 0, owner: null, homing: null, speed: 0 });
    }
    this.missilePool = [];
    for (let i = 0; i < 24; i++) {
      const m = makeSeekerMesh() || makeMissile();
      m.visible = false;
      // Fitted seeker is already SEEKER_LEN; procedural fallback needs a shrink.
      if (!m.userData?.seeker) m.scale.setScalar(0.38);
      scene.add(m);
      this.missilePool.push({
        mesh: m, vel: new THREE.Vector3(), life: 0, dmg: 0, owner: null, target: null,
        dir: new THREE.Vector3(), armed: 0, motor: 0, phase: 'idle',
      });
    }
  }

  /** Swap pool meshes to the imported seeker once the GLB is ready. */
  adoptSeekerMeshes() {
    for (const slot of this.missilePool) {
      if (slot.life > 0) continue;
      if (slot.mesh?.userData?.seeker) continue;
      const next = makeSeekerMesh();
      if (!next) return false;
      next.visible = false;
      this.scene.remove(slot.mesh);
      slot.mesh.traverse?.((o) => {
        if (o.geometry?.userData?.own) o.geometry.dispose?.();
      });
      this.scene.add(next);
      slot.mesh = next;
    }
    return true;
  }

  fire(origin, dir, opts) {
    const p = this.pool.find((x) => x.life <= 0);
    if (!p) return null;
    p.mesh.visible = true;
    p.mesh.position.copy(origin);
    p.mesh.lookAt(origin.clone().add(dir));
    p.vel.copy(dir).multiplyScalar(opts.speed || 2400);
    p.life = opts.life || 2.4;
    p.dmg = opts.dmg || 12;
    p.owner = opts.owner || null;
    p.mesh.material.color.set(opts.color || '#7fe8ff');
    p.mesh.children[0].material.color.set(opts.color || '#7fe8ff');
    p.mesh.children[0].scale.setScalar(opts.big ? 1.15 : 1);
    return p;
  }

  fireMissile(origin, dir, target, opts) {
    const m = this.missilePool.find((x) => x.life <= 0);
    if (!m) return null;
    if (!m.mesh.userData?.seeker) {
      const live = makeSeekerMesh();
      if (live) {
        this.scene.remove(m.mesh);
        this.scene.add(live);
        m.mesh = live;
      }
    }
    m.mesh.visible = true;
    m.mesh.position.copy(origin);
    m.mesh.lookAt(origin.clone().add(dir));
    // Soft launch: shove off the rail, motor lights after a short drop.
    const kick = opts.dropSpeed ?? 42;
    m.vel.copy(dir).multiplyScalar(kick);
    if (opts.inherit) m.vel.addScaledVector(opts.inherit, 0.85);
    if (opts.drop) m.vel.add(opts.drop);
    m.life = opts.life || 9.5;
    m.dmg = opts.dmg || 110;
    m.owner = opts.owner || null;
    m.target = target || null;
    m.dir.copy(dir).normalize();
    m.armed = opts.armDelay ?? 0.45;
    m.motor = opts.motorDelay ?? 0.38;
    m.phase = 'drop';
    m.cruise = opts.speed || 980;
    m.boost = opts.boost || 2200;
    return m;
  }

  /** swept segment vs sphere — prevents fast projectiles tunnelling */
  _segHit(p0, p1, c, r) {
    const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
    const L2 = dx * dx + dy * dy + dz * dz;
    const mx = p0.x - c.x, my = p0.y - c.y, mz = p0.z - c.z;
    const cc = mx * mx + my * my + mz * mz - r * r;
    if (cc <= 0) return 0;                       // started inside
    const b = mx * dx + my * dy + mz * dz;
    if (b > 0) return -1;                        // moving away
    const disc = b * b - L2 * cc;
    if (disc < 0) return -1;
    const t = (-b - Math.sqrt(disc)) / (L2 || 1e-9);
    if (t < 0 || t > 1) return -1;
    return t;
  }

  update(dt, targets, onHit, particles) {
    const p0 = this._p0 || (this._p0 = new THREE.Vector3());
    const p1 = this._p1 || (this._p1 = new THREE.Vector3());
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p0.copy(p.mesh.position);
      p.mesh.position.addScaledVector(p.vel, dt);
      p1.copy(p.mesh.position);
      let hit = false;
      for (const t of targets) {
        if (!t.alive || t === p.owner || (t.isPlayer && p.owner && p.owner.isPlayer)) continue;
        const c = t.position || t.worldPos;
        const rr = (t.radius || 8) + 3;
        const tt = this._segHit(p0, p1, c, rr);
        if (tt >= 0) {
          if (tt > 0) p.mesh.position.lerpVectors(p0, p1, tt);
          onHit && onHit(p, t);
          if (particles) particles.sparks(p.mesh.position, p.vel.clone().normalize().negate(), 8, '#ffe6a0', 40);
          hit = true;
          break;
        }
      }
      if (hit) { p.life = 0; p.mesh.visible = false; }
    }
    for (const m of this.missilePool) {
      if (m.life <= 0) continue;
      m.life -= dt;
      m.armed = (m.armed || 0) - dt;
      m.motor = (m.motor || 0) - dt;
      if (m.life <= 0) {
        m.mesh.visible = false;
        m.phase = 'idle';
        if (particles) particles.spawn(m.mesh.position.x, m.mesh.position.y, m.mesh.position.z, 0, 0, 0, 0.4, 1.4, '#ff8a3d', 1.4, 4, 0.6);
        continue;
      }
      if (m.phase === 'drop' && m.motor <= 0) m.phase = 'burn';
      const want = this._tv || (this._tv = new THREE.Vector3());
      if (m.phase === 'burn' && m.target && m.target.alive !== false) {
        const tp = m.target.position || m.target.worldPos;
        const tv = m.target.velocity;
        want.copy(tp).sub(m.mesh.position);
        const dist = want.length() || 1;
        if (tv) want.addScaledVector(tv, clamp(dist / 1600, 0.05, 1.4));
        want.normalize();
        const ang = Math.acos(clamp(m.dir.dot(want), -1, 1));
        const maxTurn = 2.85 * dt;
        const k = ang < 1e-4 ? 1 : Math.min(1, maxTurn / ang);
        m.dir.lerp(want, k).normalize();
      }
      if (m.phase === 'burn') {
        const cruise = m.cruise || 980;
        const boost = m.boost || 2200;
        const sp = Math.min(m.vel.length() + boost * dt, cruise);
        m.vel.copy(m.dir).multiplyScalar(sp);
      } else {
        // Coast off the rail — slight settle, no hard turn yet.
        m.vel.multiplyScalar(Math.exp(-0.35 * dt));
        m.vel.addScaledVector(m.dir, 18 * dt);
      }
      const m0 = this._m0 || (this._m0 = new THREE.Vector3());
      m0.copy(m.mesh.position);
      m.mesh.position.addScaledVector(m.vel, dt);
      if (particles && m.phase === 'burn') {
        const exhaust = m.dir;
        const trail = SEEKER_LEN * 0.55;
        particles.spawn(
          m.mesh.position.x - exhaust.x * trail, m.mesh.position.y - exhaust.y * trail, m.mesh.position.z - exhaust.z * trail,
          -exhaust.x * 28 + (Math.random() - 0.5) * 6, -exhaust.y * 28 + (Math.random() - 0.5) * 6, -exhaust.z * 28 + (Math.random() - 0.5) * 6,
          0.55, 1.8, Math.random() < 0.45 ? '#ff7a2a' : '#ffd27a', 1.1, 3, 0.85);
      }
      let hit = false;
      if ((m.armed || 0) <= 0) {
        if (m.target && m.target.alive !== false) {
          const c = m.target.position || m.target.worldPos;
          if (c && m.mesh.position.distanceTo(c) < 18) {
            onHit && onHit(m, m.target, true);
            hit = true;
          }
        }
        if (!hit) for (const t of targets) {
          if (!t.alive || t === m.owner || (t.isPlayer && m.owner && m.owner.isPlayer)) continue;
          const c = t.position || t.worldPos;
          const tt = this._segHit(m0, m.mesh.position, c, (t.radius || 8) + 8);
          if (tt >= 0) { if (tt > 0) m.mesh.position.lerpVectors(m0, m.mesh.position, tt); onHit && onHit(m, t, true); hit = true; break; }
        }
      }
      if (hit) { m.life = 0; m.mesh.visible = false; m.phase = 'idle'; }
      m.mesh.lookAt(m.mesh.position.clone().add(m.dir));
    }
  }

  clear() {
    for (const p of this.pool) { p.life = 0; p.mesh.visible = false; }
    for (const m of this.missilePool) { m.life = 0; m.mesh.visible = false; }
  }
}

export { SHIP_DEFS, FLEET_IDS, COMING_IDS, HANGAR_IDS, resolveShipId };
