import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { FuelProbe } from '../src/ship/fuel-probe.js';

function setup(radius = 400) {
  const scene = new THREE.Scene();
  const probe = new FuelProbe(scene);
  const game = {
    state: 'playing', flightLayer: 'space', jumpState: 'idle',
    system: { id: 'test', star: { radius } },
    ship: { alive: true, position: new THREE.Vector3(0, 0, radius * 3),
      quaternion: new THREE.Quaternion(), velocity: new THREE.Vector3(),
      fuel: 10, maxFuel: 480, scale: 1, mesh: { userData: { length: 65 } } },
    hud: { toast() {} },
  };
  return { probe, game, scene };
}
function tick(probe, game, seconds) {
  for (let i = 0; i < Math.round(seconds * 60); i++) probe.update(1 / 60, game);
}

const { probe, game, scene } = setup();
tick(probe, game, 3);
assert.equal(game.ship.fuel, 10, 'no automatic refuel with probe stowed');
game.ship.position.z = 4000;
probe.toggle(game);
assert.equal(probe.phase, 'stowed', 'cannot launch far from star');
game.ship.position.z = 500;
probe.toggle(game);
assert.equal(probe.phase, 'stowed', 'cannot launch in corona');
game.ship.position.z = 1200;
game.ship.velocity.z = 121;
probe.toggle(game);
assert.equal(probe.phase, 'stowed', 'cannot launch at high speed');
game.ship.velocity.set(0, 0, 0);
game.flightLayer = 'atmo';
probe.toggle(game);
assert.equal(probe.phase, 'stowed', 'cannot launch on a planet');
game.flightLayer = 'space';
probe.toggle(game);
tick(probe, game, 1);
assert.equal(game.ship.fuel, 10, 'deployment produces no fuel');
assert.ok(probe.group.visible && probe.group.position.distanceTo(game.ship.position) > 10, 'visible detached probe');
tick(probe, game, 3);
assert.equal(probe.phase, 'collecting');
assert.ok(game.ship.fuel > 10 && probe.rate > 0, 'deployed collector refuels');
const pausedFuel = game.ship.fuel;
game.state = 'paused';
tick(probe, game, 3);
assert.equal(game.ship.fuel, pausedFuel, 'pause does not collect');
game.state = 'playing';
probe.toggle(game);
const recalledFuel = game.ship.fuel;
tick(probe, game, 2);
assert.equal(game.ship.fuel, recalledFuel, 'return flight produces no fuel');
assert.equal(probe.phase, 'stowed');
assert.equal(probe.group.visible, false);

for (const trigger of ['full', 'speed', 'boost', 'range', 'corona', 'jump', 'atmo', 'death', 'system']) {
  const { probe: p, game: g } = setup();
  p.toggle(g);
  tick(p, g, 2);
  if (trigger === 'full') g.ship.fuel = g.ship.maxFuel - 0.1;
  if (trigger === 'speed') g.ship.velocity.z = 181;
  if (trigger === 'boost') g.ship.boost = true;
  if (trigger === 'range') g.ship.position.z = 3000;
  if (trigger === 'corona') g.ship.position.z = 500;
  if (trigger === 'jump') g.jumpState = 'charging';
  if (trigger === 'atmo') g.flightLayer = 'atmo';
  if (trigger === 'death') g.ship.alive = false;
  if (trigger === 'system') g.system.id = 'other';
  tick(p, g, 2);
  assert.equal(p.phase, 'stowed', `automatic recovery: ${trigger}`);
  assert.ok(g.ship.fuel <= g.ship.maxFuel, 'tank never overfills');
}
for (const radius of [60, 250, 400, 700, 1800]) {
  const { probe: p, game: g } = setup(radius);
  p.toggle(g);
  tick(p, g, 3);
  assert.ok(g.ship.fuel > 10, `collect near star radius ${radius}`);
  assert.ok(p.group.position.length() > radius * 1.5, 'probe stays outside corona');
}
for (let i = 0; i < 30; i++) {
  probe.toggle(game);
  tick(probe, game, 0.2);
  probe.toggle(game);
  tick(probe, game, 2);
}
assert.equal(scene.children.length, 1, 'repeated deployment reuses the same mesh');
console.log('PASS fuel probe: range, controls, deployment, collection, pause, recall, full tank, transitions, star sizes and reuse');
