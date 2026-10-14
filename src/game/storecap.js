// ============================================================================
//  One-shot Steam screenshot capture from the live title system (real WebGL).
//  Trigger: file STORECAP next to index.html, or ?storecap=1
//  ?storecap=planets  — planet plates only
//  ?storecap=play     — gameplay stills only
//  ?storecap=stations — hub exteriors (trade / refinery / science / Halcyon)
// ============================================================================
import * as THREE from '../../vendor/three/three.module.js';
import { NpcShip } from '../ship/ship.js';

const W = 1920, H = 1080;
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _s = new THREE.Vector3();
const _u = new THREE.Vector3(0, 1, 0);
const _look = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _fwd = new THREE.Vector3();
const _rad = new THREE.Vector3();
const _pol = new THREE.Vector3();
const _tmp = new THREE.Vector3();

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
function frames(n) {
  return new Promise((r) => {
    let i = 0, done = false;
    const finish = () => { if (done) return; done = true; r(); };
    const step = () => { if (++i >= n) finish(); else requestAnimationFrame(step); };
    requestAnimationFrame(step);
    setTimeout(finish, Math.max(400, n * 48));
  });
}

async function armed() {
  try {
    if (new URLSearchParams(location.search).has('storecap')) return true;
  } catch { /* ignore */ }
  try {
    const r = await fetch('STORECAP', { cache: 'no-store' });
    return r.ok;
  } catch { return false; }
}

function hideChrome() {
  document.body.classList.add('storecap');
  document.body.classList.remove('on-title');
  for (const id of ['title', 'boot', 'pause', 'station', 'death', 'modal', 'jumpFx', 'fade', 'vignette', 'toastHost', 'mapWrap']) {
    document.getElementById(id)?.classList.add('hidden');
  }
  const hud = document.getElementById('hud');
  if (hud) hud.style.visibility = 'hidden';
}

function shipLen(ship) {
  return Math.max(10, (ship.mesh?.userData.length || 11) * (ship.scale || 1));
}

function setShipPose(ship, pos, forward, upHint) {
  _fwd.copy(forward).normalize();
  let up = (upHint || _u).clone().normalize();
  if (Math.abs(up.dot(_fwd)) > 0.94) up.set(0, 1, 0);
  const right = _tmp.crossVectors(up, _fwd);
  if (right.lengthSq() < 1e-6) {
    up.set(0, 0, 1);
    right.crossVectors(up, _fwd);
  }
  right.normalize();
  up.crossVectors(_fwd, right).normalize();
  _m.makeBasis(right, up, _look.copy(_fwd).multiplyScalar(-1));
  _q.setFromRotationMatrix(_m);
  ship.position.copy(pos);
  ship.quaternion.copy(_q);
  ship.throttle = 0.88;
  ship.boost = false;
  if (ship.shieldMesh) ship.shieldMesh.visible = false;
  ship.sync();
}

function frameCam(game, { back, side, lift, lookAhead, lookWorld, lookBlend, fov }) {
  const ship = game.ship;
  const L = shipLen(ship);
  game.camera.position.copy(ship.position)
    .addScaledVector(ship.forward, -L * back)
    .addScaledVector(ship.right, -L * side)
    .addScaledVector(ship.up, L * lift);
  const look = ship.position.clone().addScaledVector(ship.forward, L * lookAhead);
  if (lookWorld) look.lerp(lookWorld, lookBlend || 0);
  game.camera.up.copy(ship.up);
  game.camera.lookAt(look);
  game.camera.fov = fov;
}

function lightHull(game) {
  if (game.fillLight) game.fillLight.intensity = 0.95;
  if (game.rimLight) game.rimLight.intensity = 1.2;
  game.renderer.toneMappingExposure = 1.12;
}

function planetFrame(scene, rt) {
  scene.update(0.35, 12, new THREE.Vector3(0, 0, 0));
  scene.getPos(rt, _p);
  const R = Math.max(24, rt.radius || 80);
  _s.copy(_p).negate();
  if (_s.lengthSq() < 0.01) _s.set(1, 0.08, 0.2);
  _s.normalize();
  _d.crossVectors(_u, _s);
  if (_d.lengthSq() < 0.01) _d.crossVectors(new THREE.Vector3(1, 0, 0), _s);
  _d.normalize();
  _look.crossVectors(_s, _d).normalize();
  return {
    pos: _p.clone(),
    R,
    toStar: _s.clone(),
    limb: _d.clone(),
    polar: _look.clone(),
  };
}

function hidePlayClutter(game, keepNpc) {
  const sc = game.systemScene;
  if (sc) {
    for (const list of [sc.stations, sc.wrecks, sc.comets]) {
      for (const x of list || []) {
        if (x.group) x.group.visible = false;
        if (x.mesh) x.mesh.visible = false;
        if (x.root) x.root.visible = false;
      }
    }
    for (const belt of sc.belts || []) {
      if (belt.group) belt.group.visible = false;
    }
  }
  for (const n of game.npcs || []) {
    const on = !!(keepNpc && n.alive && n.group);
    if (n.group) n.group.visible = on;
    if (n.mesh) n.mesh.visible = on;
    if (n.shieldMesh) n.shieldMesh.visible = false;
  }
  if (game.ship?.group) game.ship.group.visible = true;
  if (game.ship?.mesh) game.ship.mesh.visible = true;
}

function poseEstablish(game, f, ship, o = {}) {
  const pos = f.pos.clone()
    .addScaledVector(_rad, f.R * (o.shipR ?? 1.65))
    .addScaledVector(_pol, f.R * (o.shipPolar ?? 0.35))
    .addScaledVector(f.toStar, f.R * (o.shipStar ?? 0.18));
  setShipPose(ship, pos, _fwd, _pol);
  game.camera.position.copy(f.pos)
    .addScaledVector(_rad, f.R * (o.camR ?? 2.7))
    .addScaledVector(_pol, f.R * (o.camPolar ?? 1.05))
    .addScaledVector(f.toStar, f.R * (o.camStar ?? 0.9));
  game.camera.up.copy(_pol);
  game.camera.lookAt(f.pos.clone().addScaledVector(_rad, f.R * (o.lookR ?? 0.22)));
  game.camera.fov = o.fov ?? 38;
}

function playPose(game, rt, kind) {
  const scene = game.systemScene;
  const ship = game.ship;
  if (!scene || !rt || !ship) return false;
  const f = planetFrame(scene, rt);
  const L = shipLen(ship);
  lightHull(game);
  hidePlayClutter(game, kind === 'intercept');

  _rad.copy(f.limb);
  _pol.copy(f.polar);
  _fwd.copy(f.toStar).cross(_rad);
  if (_fwd.lengthSq() < 0.01) _fwd.copy(_pol);
  _fwd.normalize();

  if (kind === 'limb') {
    const pos = f.pos.clone()
      .addScaledVector(_rad, f.R * 1.32)
      .addScaledVector(_pol, f.R * 0.08)
      .addScaledVector(f.toStar, f.R * 0.16);
    setShipPose(ship, pos, _fwd, _pol);
    frameCam(game, {
      back: 1.88, side: 1.52, lift: 0.5,
      lookAhead: 2.0, lookWorld: f.pos, lookBlend: 0.26, fov: 34,
    });
  } else if (kind === 'hull') {
    const pos = f.pos.clone()
      .addScaledVector(_rad, f.R * 2.08)
      .addScaledVector(_pol, f.R * 0.12)
      .addScaledVector(f.toStar, f.R * 0.28);
    setShipPose(ship, pos, _fwd.clone().addScaledVector(f.toStar, 0.2).normalize(), _pol);
    frameCam(game, {
      back: 1.72, side: 1.48, lift: 0.42,
      lookAhead: 1.35, lookWorld: null, lookBlend: 0, fov: 30,
    });
  } else if (kind === 'planet') {
    poseEstablish(game, f, ship, { shipR: 1.68, shipPolar: 0.38, camR: 2.75, camPolar: 1.08, camStar: 0.95, fov: 38 });
  } else if (kind === 'skim') {
    poseEstablish(game, f, ship, {
      shipR: 1.48, shipPolar: 0.22, shipStar: 0.12,
      camR: 2.25, camPolar: 0.72, camStar: 0.55, lookR: 0.28, fov: 36,
    });
  } else if (kind === 'wide') {
    poseEstablish(game, f, ship, {
      shipR: 1.72, shipPolar: 0.48, shipStar: 0.22,
      camR: 2.85, camPolar: 1.22, camStar: 1.15, lookR: 0.25, fov: 40,
    });
  } else if (kind === 'rings') {
    poseEstablish(game, f, ship, {
      shipR: 1.72, shipPolar: 0.48, shipStar: 0.22,
      camR: 2.85, camPolar: 1.22, camStar: 1.15, lookR: 0.25, fov: 40,
    });
  } else if (kind === 'intercept') {
    poseEstablish(game, f, ship, {
      shipR: 1.62, shipPolar: 0.3, shipStar: 0.16,
      camR: 2.45, camPolar: 0.85, camStar: 0.7, lookR: 0.3, fov: 36,
    });
    hidePlayClutter(game, true);
    let npc = (game.npcs || []).find((n) => n.alive && n.group);
    if (!npc) {
      npc = new NpcShip(game.scene, 1, ship.position.clone(), {
        hostile: true, name: 'Raider', hull: 90, shield: 50, scale: 2.8,
      });
      game.npcs = game.npcs || [];
      game.npcs.push(npc);
    } else {
      npc.mesh.scale.setScalar(Math.max(2.7, (ship.scale || 1) * 0.9));
    }
    npc.group.visible = true;
    if (npc.mesh) npc.mesh.visible = true;
    if (npc.shieldMesh) npc.shieldMesh.visible = false;
    npc.position.copy(ship.position)
      .addScaledVector(ship.forward, L * 2.6)
      .addScaledVector(ship.right, L * 1.05)
      .addScaledVector(ship.up, L * 0.22);
    const m = new THREE.Matrix4().lookAt(npc.position, ship.position, ship.up);
    npc.quaternion.setFromRotationMatrix(m);
    npc.group.position.copy(npc.position);
    npc.group.quaternion.copy(npc.quaternion);
  } else {
    return false;
  }

  game.camera.near = 0.18;
  game.camera.far = 9e6;
  game.camera.aspect = W / H;
  game.camera.updateProjectionMatrix();
  if (ship.updateVisuals) ship.updateVisuals(0.016, 9.2, game.camera.position);
  return true;
}

function blobFromCanvas(canvas) {
  return new Promise((resolve, reject) => {
    if (canvas.toBlob) canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob')), 'image/jpeg', 0.92);
    else reject(new Error('no toBlob'));
  });
}

async function postShot(name, blob) {
  const r = await fetch('/__storecap/' + name, { method: 'POST', body: blob });
  if (!r.ok) throw new Error('storecap ' + name + ' ' + r.status);
}

async function loadWorld(game, hit) {
  if (!hit) return null;
  if (hit.gal) game.galaxy = hit.gal;
  game.buildSystem(hit.sys.id, 'preview');
  if (game.ship?.group) game.ship.group.visible = true;
  if (game.ship?.mesh) game.ship.mesh.visible = true;
  await wait(560);
  return (game.systemScene?.planets || []).find((p) => p.data?.id === hit.planet.id)
    || game.systemScene?.planets?.[0]
    || null;
}

async function snap(game, name) {
  await frames(14);
  game.composer.render(0);
  const blob = await blobFromCanvas(game.renderer.domElement);
  await postShot(name, blob);
}

async function captureGameplay(game) {
  const picks = findBeauties(game);
  const by = Object.fromEntries(picks.map((h) => [h.key, h]));
  const home = game.galaxy;
  const want = new URLSearchParams(location.search).get('shot');
  const groups = [
    { hit: by.terra, kinds: [['01_limb.jpg', 'limb'], ['02_hull.jpg', 'hull'], ['03_planet.jpg', 'planet']] },
    { hit: by.ocean, kinds: [['05_skim.jpg', 'skim']] },
    { hit: by.icegiant, kinds: [['06_wide.jpg', 'wide']] },
    { hit: by.rings, kinds: [['07_rings.jpg', 'rings']] },
    { hit: by.lava || by.exotic, kinds: [['08_intercept.jpg', 'intercept']] },
  ].map((g) => ({
    ...g,
    kinds: want ? g.kinds.filter(([n]) => n.includes(want)) : g.kinds,
  })).filter((g) => g.kinds.length);
  for (const g of groups) {
    const rt = await loadWorld(game, g.hit);
    if (!rt) continue;
    for (const [name, kind] of g.kinds) {
      try {
        if (!playPose(game, rt, kind)) continue;
        await wait(180);
        await snap(game, name);
      } catch (err) {
        console.warn('[storecap]', name, err);
      }
    }
  }
  if (home) game.galaxy = home;
}

export async function maybeStoreCap(game) {
  if (!(await armed())) return;
  const hud = document.getElementById('hud');
  const prev = {
    idle: game.onIdleFrame,
    photo: game.photo,
    dyn: game.settings.dynamicRes,
    pr: game.settings.pixelRatio,
    diamond: game.diamondPass ? game.diamondPass.enabled : true,
    hudVis: hud ? hud.style.visibility : '',
    fill: game.fillLight?.intensity,
    rim: game.rimLight?.intensity,
    exp: game.renderer.toneMappingExposure,
  };
  hideChrome();
  game.onIdleFrame = () => {};
  game.photo = true;
  game.settings.dynamicRes = false;
  game._dynScale = 1;
  game.settings.pixelRatio = 1;
  game.renderer.setPixelRatio(1);
  game.renderer.setSize(W, H, false);
  game.composer.setPixelRatio(1);
  game.composer.setSize(W, H);
  game.camera.aspect = W / H;
  game.camera.updateProjectionMatrix();
  if (game.diamondPass) game.diamondPass.enabled = false;

  try {
    await wait(1400);
    await frames(12);

    const q = location.search;
    const onlyStations = /stations/i.test(q);
    const onlyMenus = /menus/i.test(q);
    const onlyPlanets = /planets/i.test(q);
    const onlyPlay = /play/i.test(q) && !onlyPlanets && !onlyStations && !onlyMenus;
    if (onlyMenus) window.__STORECAP_HUBS = findHubs(game);
    else if (onlyStations) await captureStations(game);
    else {
      if (!onlyPlanets) await captureGameplay(game);
      if (!onlyPlay) await captureBeauties(game);
    }
  } finally {
    window.__STORECAP_DONE = true;
    document.body.classList.remove('storecap');
    if (hud) hud.style.visibility = prev.hudVis || '';
    game.photo = !!prev.photo;
    game.settings.dynamicRes = prev.dyn;
    game.settings.pixelRatio = prev.pr;
    if (game.diamondPass) game.diamondPass.enabled = prev.diamond;
    if (game.fillLight && prev.fill != null) game.fillLight.intensity = prev.fill;
    if (game.rimLight && prev.rim != null) game.rimLight.intensity = prev.rim;
    if (prev.exp != null) game.renderer.toneMappingExposure = prev.exp;
    game.onIdleFrame = prev.idle;
    game.onResize();
  }
}

function beautyScore(p, sys) {
  let s = (p.radius || 40) * 0.4;
  if (p.rings) {
    s += 150 + (p.rings.density || 0) * 50;
    const span = (p.rings.outer || 0) / Math.max(p.radius || 1, 1);
    s += Math.min(80, span * 18);
  }
  if (p.type === 'exotic') s += 140;
  else if (p.type === 'icegiant') s += 90;
  else if (p.type === 'terra') s += 75 + (p.hasLife ? 40 : 0);
  else if (p.type === 'ocean') s += 68 + (p.hasLife ? 24 : 0);
  else if (p.type === 'lava') s += 72;
  else if (p.type === 'ice') s += 48;
  else if (p.type === 'desert') s += 55;
  else if (p.type === 'gas') s += 42;
  else if (p.type === 'toxic') s += 28;
  s += (p.clouds || 0) * 38;
  s += Math.abs(p.axialTilt || 0) * 14;
  const st = sys.star?.type;
  if (st === 'G' || st === 'F' || st === 'K') s += 20;
  if (st === 'A' || st === 'B') s += 12;
  return s;
}

function hideClutter(game) {
  if (game.ship?.group) game.ship.group.visible = false;
  for (const n of game.npcs || []) {
    if (n.group) n.group.visible = false;
    if (n.mesh) n.mesh.visible = false;
  }
  const sc = game.systemScene;
  if (!sc) return;
  for (const list of [sc.stations, sc.wrecks, sc.comets]) {
    for (const x of list || []) {
      if (x.group) x.group.visible = false;
      if (x.mesh) x.mesh.visible = false;
      if (x.root) x.root.visible = false;
    }
  }
}

function findBeauties(game) {
  const want = [
    ['rings', (p) => p.type === 'gas' && !!p.rings],
    ['icegiant', (p) => p.type === 'icegiant'],
    ['terra', (p) => p.type === 'terra'],
    ['lava', (p) => p.type === 'lava'],
    ['exotic', (p) => p.type === 'exotic'],
    ['ocean', (p) => p.type === 'ocean'],
  ];
  const hits = [];
  const used = new Set();
  const gals = game.universe?.galaxies || [game.galaxy].filter(Boolean);
  for (const [key, pred] of want) {
    let best = null;
    for (const gal of gals) {
      for (const sys of gal.systems || []) {
        for (const p of sys.planets || []) {
          if (!pred(p) || used.has(p.id)) continue;
          const score = beautyScore(p, sys);
          if (!best || score > best.score) best = { key, gal, sys, planet: p, score };
        }
      }
    }
    if (best) {
      used.add(best.planet.id);
      hits.push(best);
    }
  }
  return hits;
}

function beautyPose(game, rt) {
  const scene = game.systemScene;
  if (!scene || !rt) return false;
  scene.update(0.35, 12, game.camera.position);
  scene.getPos(rt, _p);
  const R = Math.max(24, rt.radius || 80);
  const toStar = _s.copy(_p).normalize();
  if (toStar.lengthSq() < 0.01) toStar.set(1, 0.05, 0.2).normalize();
  _d.crossVectors(_u, toStar);
  if (_d.lengthSq() < 0.01) _d.set(0, 0, 1);
  _d.normalize();
  const up = _look.crossVectors(toStar, _d).normalize();
  const ringed = !!(rt.data?.rings);
  const dist = ringed ? 4.15 : 3.55;
  const cam = _p.clone()
    .addScaledVector(_d, R * dist)
    .addScaledVector(up, R * (ringed ? 0.55 : 0.72))
    .addScaledVector(toStar, R * 0.85);
  game.camera.position.copy(cam);
  game.camera.up.copy(up);
  game.camera.lookAt(_p);
  game.camera.fov = ringed ? 42 : 40;
  game.camera.near = 0.18;
  game.camera.far = 9e6;
  game.camera.aspect = W / H;
  game.camera.updateProjectionMatrix();
  hideClutter(game);
  return true;
}

async function captureBeauties(game) {
  const picks = findBeauties(game);
  const shipVis = game.ship?.group?.visible;
  const homeGal = game.galaxy;
  const catalog = picks.map((h) => ({
    key: h.key, score: Math.round(h.score),
    planet: h.planet.name, type: h.planet.type, rings: !!h.planet.rings,
    galaxy: h.gal?.name || h.gal?.id, system: h.sys.name,
  }));
  try { await postShot('beauties.json', new Blob([JSON.stringify(catalog, null, 2)], { type: 'application/json' })); }
  catch (err) { console.warn('[storecap] catalog', err); }
  for (const hit of picks) {
    try {
      if (hit.gal) game.galaxy = hit.gal;
      game.buildSystem(hit.sys.id, 'preview');
      const rt = (game.systemScene?.planets || []).find((p) => p.data?.id === hit.planet.id)
        || game.systemScene?.planets?.[0];
      if (!rt || !beautyPose(game, rt)) continue;
      await wait(520);
      hideClutter(game);
      await snap(game, `planet_${hit.key}.jpg`);
    } catch (err) {
      console.warn('[storecap] planet', hit.key, err);
    }
  }
  if (homeGal) game.galaxy = homeGal;
  if (game.ship?.group && shipVis !== undefined) game.ship.group.visible = shipVis;
}

function findHubs(game) {
  const gals = game.universe?.galaxies || [game.galaxy].filter(Boolean);
  const hits = {};
  for (const gal of gals) {
    for (const sys of gal.systems || []) {
      for (const st of sys.stations || []) {
        const pack = { gal, sys, station: st };
        if (st.name === 'Halcyon Port' && !hits.halcyon) hits.halcyon = { key: 'halcyon', ...pack };
        if (st.kind === 'hub_trade' && !hits.trade) hits.trade = { key: 'trade', ...pack };
        if (st.kind === 'hub_refinery' && !hits.refinery) hits.refinery = { key: 'refinery', ...pack };
        if (st.kind === 'hub_survey' && !hits.science) hits.science = { key: 'science', ...pack };
      }
    }
  }
  if (hits.halcyon && hits.trade && hits.halcyon.station.id === hits.trade.station.id) {
    for (const gal of gals) {
      for (const sys of gal.systems || []) {
        const st = (sys.stations || []).find((s) => s.kind === 'hub_trade' && s.id !== hits.halcyon.station.id);
        if (st) { hits.trade = { key: 'trade', gal, sys, station: st }; break; }
      }
      if (hits.trade.station.id !== hits.halcyon.station.id) break;
    }
  }
  return hits;
}

function hideExceptStation(game, keep) {
  const sc = game.systemScene;
  if (sc) {
    for (const x of sc.stations || []) {
      const on = x === keep;
      if (x.group) x.group.visible = on;
      if (x.mesh) x.mesh.visible = on;
    }
    for (const list of [sc.wrecks, sc.comets]) {
      for (const x of list || []) {
        if (x.group) x.group.visible = false;
        if (x.mesh) x.mesh.visible = false;
        if (x.root) x.root.visible = false;
      }
    }
    for (const belt of sc.belts || []) {
      if (belt.group) belt.group.visible = false;
    }
  }
  for (const n of game.npcs || []) {
    if (n.group) n.group.visible = false;
    if (n.mesh) n.mesh.visible = false;
    if (n.shieldMesh) n.shieldMesh.visible = false;
  }
  if (game.ship?.group) game.ship.group.visible = true;
  if (game.ship?.mesh) game.ship.mesh.visible = true;
}

function stationPose(game, rt, kind) {
  const scene = game.systemScene;
  const ship = game.ship;
  if (!scene || !rt || !ship) return false;
  scene.update(0.2, 8, new THREE.Vector3(0, 0, 0));
  scene.getPos(rt, _p);
  if (_p.length() < 80) {
    const r = rt.data?.orbitRadius || 12000;
    const a = rt.angle || 0.4;
    rt.group.position.set(Math.cos(a) * r, Math.sin(a) * Math.sin(rt.data?.inclination || 0) * r, Math.sin(a) * r);
    scene.getPos(rt, _p);
  }
  const R = Math.max(80, rt.radius || rt.data?.radius || 200);
  lightHull(game);
  hideExceptStation(game, rt);
  if (rt.spinSpeed != null) rt.spinSpeed = 0;

  const yaw = kind === 'science' ? 0.95 : kind === 'refinery' ? 0.52 : 0.38;
  const pitch = kind === 'science' ? 0.22 : 0.12;
  if (rt.mesh) rt.mesh.rotation.set(pitch, yaw, kind === 'trade' || kind === 'halcyon' ? 0.08 : 0.04);

  _d.set(1, 0.08, kind === 'science' ? 0.85 : 0.42).normalize();
  _u.set(0, 1, 0);
  _s.crossVectors(_u, _d).normalize();
  _pol.crossVectors(_d, _s).normalize();

  for (const p of scene.planets || []) {
    if (p.group) p.group.visible = false;
    if (p.mesh) p.mesh.visible = false;
  }
  for (const m of scene.moons || []) {
    if (m.group) m.group.visible = false;
    if (m.mesh) m.mesh.visible = false;
  }

  const camR = kind === 'science' ? 5.4 : kind === 'refinery' ? 5.6 : 5.85;
  const camLift = 0.7;
  game.camera.position.copy(_p)
    .addScaledVector(_d, R * camR)
    .addScaledVector(_pol, R * camLift)
    .addScaledVector(_s, R * (kind === 'refinery' ? 0.62 : kind === 'science' ? 0.48 : 0.32));
  const look = _p.clone().addScaledVector(_pol, R * -0.02);
  game.camera.up.copy(_pol);
  game.camera.lookAt(look);
  game.camera.fov = 46;
  game.camera.near = 0.18;
  game.camera.far = 9e6;
  game.camera.aspect = W / H;
  game.camera.updateProjectionMatrix();

  const L = shipLen(ship);
  const cam = game.camera.position;
  const toSt = _p.clone().sub(cam).normalize();
  const right = _tmp.crossVectors(_pol, toSt).normalize();
  const shipPos = cam.clone()
    .addScaledVector(toSt, L * (kind === 'science' ? 6.2 : 5.6))
    .addScaledVector(right, -L * 2.15)
    .addScaledVector(_pol, -L * 0.55);
  setShipPose(ship, shipPos, _p.clone().sub(shipPos).addScaledVector(_pol, R * 0.08), _pol);
  if (ship.updateVisuals) ship.updateVisuals(0.016, 9.2, game.camera.position);
  return true;
}

async function loadHub(game, hit) {
  if (!hit) return null;
  if (hit.gal) game.galaxy = hit.gal;
  game.buildSystem(hit.sys.id, 'preview');
  if (game.ship?.group) game.ship.group.visible = true;
  if (game.ship?.mesh) game.ship.mesh.visible = true;
  await wait(560);
  return (game.systemScene?.stations || []).find((s) => s.data?.id === hit.station.id)
    || (game.systemScene?.stations || []).find((s) => s.data?.kind === hit.station.kind)
    || game.systemScene?.stations?.[0]
    || null;
}

async function captureStations(game) {
  const hits = findHubs(game);
  window.__STORECAP_HUBS = hits;
  const home = game.galaxy;
  const catalog = Object.values(hits).map((h) => ({
    key: h.key, name: h.station.name, kind: h.station.kind,
    economy: h.station.economy, radius: h.station.radius,
    galaxy: h.gal?.name || h.gal?.id, system: h.sys.name,
  }));
  try { await postShot('stations.json', new Blob([JSON.stringify(catalog, null, 2)], { type: 'application/json' })); }
  catch (err) { console.warn('[storecap] stations catalog', err); }

  const want = new URLSearchParams(location.search).get('shot');
  const shots = [
    ['station_trade.jpg', 'trade', hits.trade],
    ['station_refinery.jpg', 'refinery', hits.refinery],
    ['station_science.jpg', 'science', hits.science],
    ['station_halcyon.jpg', 'halcyon', hits.halcyon],
  ];
  for (const [name, kind, hit] of shots) {
    if (want && !name.includes(want)) continue;
    if (!hit) { console.warn('[storecap] missing hub', kind); continue; }
    try {
      const rt = await loadHub(game, hit);
      if (!rt || !stationPose(game, rt, kind)) continue;
      await wait(220);
      await snap(game, name);
    } catch (err) {
      console.warn('[storecap]', name, err);
    }
  }
  if (home) game.galaxy = home;
}
