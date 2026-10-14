import * as THREE from '../../vendor/three/three.module.js';
import { probeIntake } from '../game/ledger.js?v=omega14';

// A reusable collector. Fuel goes directly to the tank; deployment is not saved.
export class FuelProbe {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'stellar-fuel-probe';
    scene.add(this.group);
    const metal = new THREE.MeshStandardMaterial({ color: '#536879', metalness: 0.75, roughness: 0.35 });
    const foil = new THREE.MeshStandardMaterial({ color: '#d9ad65', metalness: 0.65, roughness: 0.4, side: THREE.DoubleSide });
    const lamp = new THREE.MeshBasicMaterial({ color: '#82e2ff' });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.2, 6, 8), metal);
    body.rotation.x = Math.PI / 2;
    this.group.add(body);
    this.collector = new THREE.Group();
    this.collector.position.z = 2;
    const dish = new THREE.Mesh(new THREE.ConeGeometry(7, 2.8, 8, 1, true), foil);
    dish.rotation.x = Math.PI / 2;
    this.collector.add(dish);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(7, 0.13, 4, 32), metal);
    rim.position.z = -1.4;
    this.collector.add(rim);
    this.group.add(this.collector);
    this.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.65, 8, 6), lamp);
    this.lamp.position.z = -3.2;
    this.group.add(this.lamp);
    this.trail = new THREE.Group();
    const particle = new THREE.SphereGeometry(0.2, 4, 4);
    for (let i = 0; i < 12; i++) {
      const mote = new THREE.Mesh(particle, lamp);
      this.trail.add(mote);
    }
    this.group.add(this.trail);
    this._mount = new THREE.Vector3();
    this._work = new THREE.Vector3();
    this._from = new THREE.Vector3();
    this._origin = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.phase = 'stowed';
    this.elapsed = 0;
    this.rate = 0;
    this.collected = 0;
    this.group.visible = false;
  }

  get active() { return this.phase !== 'stowed'; }

  range(game) {
    const radius = game.system?.star?.radius || 0;
    return { min: radius * 1.8, max: radius * 6 };
  }

  reason(game) {
    const s = game.ship;
    const star = game.system?.star;
    const gOnly = game.galaxy?.rules?.hydrogen === 'g-only' && star?.type !== 'G';
    if (star && (star.hydrogen === false || gOnly)) return 'This star has no usable hydrogen — the chart says so before you jump';
    if (game.state !== 'playing' || !s?.alive || game.flightLayer === 'atmo') return 'Launch the fuel probe in space';
    if (game.jumpState === 'charging' || game.jumpState === 'firing' || game.filament) return 'Finish the jump before launching the probe';
    const { min, max } = this.range(game);
    const distance = s.position.length();
    if (distance < min) return 'Too close to the star — move away from the corona';
    if (!max || distance > max) return 'Approach the star to launch the fuel probe';
    if (s.velocity.length() > 120 || s.boost) return 'Hold R to slow below 120 m/s, then press X';
    if (s.fuel >= s.maxFuel - 0.01) return 'Fuel tank full';
    return null;
  }

  _positions(ship) {
    const length = Math.max(8, (ship.mesh?.userData.length || 10) * (ship.scale || 1));
    this._mount.set(length * 0.25, length * 0.15, 0).applyQuaternion(ship.quaternion).add(ship.position);
    this._work.set(length * 0.85, length * 0.5, -length * 0.25).applyQuaternion(ship.quaternion).add(ship.position);
    // Even around small stars, keep the collector outside the hot corona.
    const safe = this.starRadius * 1.5 + 12;
    if (this._work.length() < safe) this._work.setLength(safe);
    this.group.scale.setScalar(Math.min(2, Math.max(0.65, length / 65)));
  }

  toggle(game) {
    if (this.active) { this.recall(game, 'Returning to ship'); return; }
    const reason = this.reason(game);
    if (reason) { game.hud.toast(reason, 'info', 3); return; }
    this.starRadius = game.system.star.radius;
    this.systemId = game.system.id;
    this._positions(game.ship);
    this.group.position.copy(this._mount);
    this.phase = 'deploying';
    this.elapsed = 0;
    this.collected = 0;
    this.group.visible = true;
    game.autopilot = false;
    game.dockComp = false;
    game.ship.throttle = 0;
    game.hud.toast('Fuel probe launched · X to recall', 'good', 3);
  }

  recall(game, message) {
    if (!this.active || this.phase === 'returning') return;
    this.phase = 'returning';
    this.elapsed = 0;
    this.rate = 0;
    this._from.copy(this.group.position);
    game.hud.toast(message, 'info', 3);
  }

  update(dt, game) {
    this.rate = 0;
    if (!this.active) return;
    const s = game.ship;
    if (!s?.alive || game.flightLayer === 'atmo' || game.system?.id !== this.systemId) { this.reset(); return; }
    if (game.state !== 'playing') return;
    this._positions(s);
    const { min, max } = this.range(game);
    const distance = s.position.length();
    if (game.jumpState === 'charging' || game.jumpState === 'firing') this.recall(game, 'Jump preparation · recalling fuel probe');
    else if (distance < min || distance > max || s.velocity.length() > 120 || s.boost) this.recall(game, 'Leaving collection conditions · recalling fuel probe');
    else if (s.fuel >= s.maxFuel - 0.01) this.recall(game, 'Fuel tank full · recalling fuel probe');
    this.elapsed += dt;
    if (this.phase === 'returning') {
      const u = Math.min(1, this.elapsed / 1.2);
      this.group.position.lerpVectors(this._from, this._mount, u * u * (3 - 2 * u));
      this.collector.scale.setScalar(Math.max(0.1, 1 - u));
      if (u >= 1) { this.reset(); return; }
    } else if (this.phase === 'deploying') {
      const u = Math.min(1, this.elapsed / 1.8);
      this.group.position.lerpVectors(this._mount, this._work, u * u * (3 - 2 * u));
      this.collector.scale.setScalar(Math.max(0.1, u));
      if (u >= 1) { this.phase = 'collecting'; this.elapsed = 0; }
    } else {
      this.group.position.lerp(this._work, 1 - Math.exp(-4 * dt));
      this.collector.scale.setScalar(1);
      const probeDistance = this.group.position.length();
      if (probeDistance >= this.starRadius * 1.5 && probeDistance <= max + 120) {
        const strength = Math.max(0.2, Math.min(1, 1 - (distance - min) / (max - min)));
        const starMul = Math.max(0.5, Math.min(1.5, game.system?.star?.fuelMul || 1));
        const amount = probeIntake(dt, s.maxFuel - s.fuel, strength, starMul);
        s.fuel += amount;
        this.collected += amount;
        this.rate = dt > 0 ? amount / dt : 0;
      }
    }
    this.group.lookAt(this._origin);
    this.trail.visible = this.rate > 0;
    this.trail.children.forEach((mote, i) => {
      const t = (this.elapsed * 0.7 + i / 12) % 1;
      const a = i * 2.4;
      mote.position.set(Math.cos(a) * 5 * (1 - t), Math.sin(a) * 5 * (1 - t), 25 * (1 - t) + 3);
    });
  }

  hint(game) {
    if (this.phase === 'deploying') return 'FUEL PROBE · DEPLOYING · X TO RECALL';
    if (this.phase === 'returning') return 'FUEL PROBE · RETURNING';
    if (this.phase === 'collecting') return `FUEL PROBE · +${this.rate.toFixed(1)} u/s · TANK ${Math.round(100 * game.ship.fuel / game.ship.maxFuel)}% · X TO RECALL`;
    if (game.flightLayer === 'atmo') return null;
    const { min, max } = this.range(game);
    const distance = game.ship.position.length();
    if (distance >= min && distance <= max && game.ship.fuel < game.ship.maxFuel - 0.5) {
      return game.ship.velocity.length() > 120 ? 'HOLD R TO SLOW · X TO LAUNCH FUEL PROBE' : 'PRESS X TO COLLECT STELLAR FUEL';
    }
    return null;
  }
}
