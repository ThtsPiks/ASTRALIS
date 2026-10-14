// ============================================================================
//  ASTRALIS — entry point & boot sequence
// ============================================================================
import * as THREE from '../vendor/three/three.module.js';
import { Game } from './game/game.js?v=port42';
import { Audio } from './core/audio.js?v=score2';
import { maybeStoreCap } from './game/storecap.js?v=hubs1';

const game = new Game();
window.ASTRALIS = game;

const logEl = document.getElementById('bootLog');

const nextFrame = () => new Promise((r) => {
  let done = false;
  const finish = () => { if (done) return; done = true; r(); };
  requestAnimationFrame(finish);
  setTimeout(finish, 80);
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function stamp(msg, tag = '') {
  const plain = String(msg).replace(/<[^>]+>/g, '');
  if (tag === 'warn' && logEl) {
    logEl.classList.remove('hidden');
    logEl.innerHTML += `<i>[WARN]</i>  ${plain}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }
}

async function progress() {
  await nextFrame();
}

async function boot() {
  const shownAt = performance.now();
  await wait(80);

  const canvasProbe = document.createElement('canvas');
  const gl = canvasProbe.getContext('webgl2') || canvasProbe.getContext('webgl');
  if (!gl) {
    stamp('WebGL is not available. ASTRALIS cannot start.', 'warn');
    if (logEl) {
      logEl.classList.remove('hidden');
      logEl.innerHTML += '\n<i>[FATAL] WebGL is not available. ASTRALIS cannot start.</i>';
    }
    return;
  }

  try {
    await game.init(progress);
  } catch (err) {
    console.error(err);
    stamp('Initialisation failed: ' + err.message, 'warn');
    return;
  }

    const left = 2600 - (performance.now() - shownAt);
  if (left > 0) await wait(left);

  // black curtain over the first frames so the camera settles off-screen
  const fade = document.getElementById('fade');
  fade.classList.remove('hidden'); fade.classList.add('on');
  document.getElementById('boot').classList.add('hidden');
  game.state = 'title';
  game.menus.showTitle();

  try {
    await game.startTitlePreview();
  } catch (err) {
    stamp('Title preview failed: ' + err.message, 'warn');
  }
  setTimeout(() => { fade.classList.remove('on'); setTimeout(() => fade.classList.add('hidden'), 600); }, 700);
  maybeStoreCap(game).catch((err) => console.warn('[storecap]', err));
}

// ---------------------------------------------------------------------------
//  First-gesture audio unlock
// ---------------------------------------------------------------------------
function unlockAudio() {
  Audio.init();
  Audio.resume();
  if (game.menus) game.menus._applyAudio();
  window.removeEventListener('pointerdown', unlockAudio, true);
  window.removeEventListener('click', unlockAudio, true);
  window.removeEventListener('keydown', unlockAudio, true);
  window.removeEventListener('touchstart', unlockAudio, true);
}
window.addEventListener('pointerdown', unlockAudio, true);
window.addEventListener('click', unlockAudio, true);
window.addEventListener('keydown', unlockAudio, true);
window.addEventListener('touchstart', unlockAudio, { capture: true, passive: true });

// ---------------------------------------------------------------------------
//  Title-screen backdrop: slow cinematic orbit around the home star
// ---------------------------------------------------------------------------
let _t = 0;
const _planetPos = new THREE.Vector3(), _shipPos = new THREE.Vector3(), _camPos = new THREE.Vector3(), _camOff = new THREE.Vector3();
const _dir = new THREE.Vector3(), _side = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _tmpQ = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _tmpA = new THREE.Vector3(), _tmpB = new THREE.Vector3(), _tmpC = new THREE.Vector3();
function titleCamera(dt) {
  if (game.state !== 'title' || !game.systemScene) return;
  _t += dt;
  const scene = game.systemScene;
  let rt = game._titleHero;
  if (!rt || !rt.mesh) {
    rt = scene.bodies.find((b) => b.kind === 'planet' && (b.data.type === 'gas' || b.data.type === 'icegiant'));
    if (!rt) rt = scene.bodies.filter((b) => b.kind === 'planet').sort((a, b) => b.radius - a.radius)[0];
  }
  if (!rt) return;
  scene.getPos ? scene.getPos(rt, _planetPos) : rt.group.getWorldPosition(_planetPos);
  const R = rt.radius || 80;

  if (game.ship) {
    game.ship.group.visible = false;
    if (game.ship.mesh) game.ship.mesh.visible = false;
    if (game.ship.shieldMesh) game.ship.shieldMesh.visible = false;
  }

  const toStar = _tmpA.copy(_planetPos).negate().normalize();
  const a = Math.sin(_t * 0.009) * 0.045;
  _tmpB.crossVectors(toStar, _up);
  if (_tmpB.lengthSq() < 1e-8) _tmpB.set(0, 0, 1);
  _tmpB.normalize();
  _dir.copy(_tmpB).multiplyScalar(-0.66)
    .addScaledVector(toStar, 0.26)
    .addScaledVector(_up, 0.64);
  _dir.applyAxisAngle(_up, a);
  _dir.normalize();

  const dist = R * 5.32;
  game.camera.position.copy(_planetPos).addScaledVector(_dir, dist);
  game.camera.position.addScaledVector(_tmpB, -R * 0.16);
  game.camera.up.copy(_up);
  game.camera.near = 0.18;
  game.camera.far = Math.max(9e6, R * 50);
  game.camera.fov = 38;
  game.camera.updateProjectionMatrix();
  _tmpC.copy(_planetPos)
    .addScaledVector(_tmpB, R * 0.28)
    .addScaledVector(_up, -R * 0.44)
    .addScaledVector(toStar, R * 0.046);
  game.camera.lookAt(_tmpC);
  // Truck in true camera +X so the disc slides RIGHT in frame (~11% width).
  // World-space _tmpB look-at (0.60R→0.28R last pass) was a pan toward center.
  game.camera.updateMatrixWorld();
  _side.set(1, 0, 0).transformDirection(game.camera.matrixWorld);
  const slide = dist * 0.13;
  game.camera.position.addScaledVector(_side, -slide);
  _tmpC.addScaledVector(_side, -slide);
  game.camera.lookAt(_tmpC);
  // Ring disc in XZ; ringSpin holds the tilt. Spin local Y so the plane stays put.
  // Pattern lives in object-space; uSpin is what the eye actually sees.
  if (rt.ringMesh) {
    rt.ringMesh.rotation.y += 0.07 * dt;
    const spin = rt.ringMesh.material?.uniforms?.uSpin;
    if (spin) spin.value += 0.07 * dt;
  }
}
game.resetTitleCam = () => { _t = 0; };
game.onIdleFrame = (dt) => titleCamera(dt);

// ---------------------------------------------------------------------------
//  Safety: report uncaught errors on the boot log
// ---------------------------------------------------------------------------
window.addEventListener('error', (e) => {
  if (!document.getElementById('boot').classList.contains('hidden')) {
    stamp('Runtime error: ' + e.message, 'warn');
  }
  console.error(e.error || e.message);
});

boot();
