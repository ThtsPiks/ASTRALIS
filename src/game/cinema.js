// Live WebGL story film — letterbox, staged chase, radio lines. Skip: Space / Esc.

import * as THREE from '../../vendor/three/three.module.js';
import { Audio } from '../core/audio.js?v=port5';
import { nextStep } from '../story/campaign.js?v=finale6';
import { reelById } from '../story/reels.js?v=finale6';
import { makeChoirMesh } from '../ship/models.js?v=choir3';

// Opening + forks + the planet + endings. Grind chapters stay as HUD, not ads.
const BEAT_FILMS = new Set(['open', 'ch2', 'chSto', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8', 'chOre', 'ch9', 'ch10', 'end-lock', 'end-patron', 'end-open']);

const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _look = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _pinPos = new THREE.Vector3();
const _limb = new THREE.Vector3();
const _nose = new THREE.Vector3(0, 0, -1);
const _choirAim = new THREE.Vector3();

function shipLen(ship) {
  return Math.max(10, (ship.mesh?.userData.length || 11) * (ship.scale || 1));
}

function makeChoirCraft(scale = 1) {
  return makeChoirMesh(scale);
}

export class Cinema {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.reel = null;
    this.i = 0;
    this.t = 0;
    this._who = '';
    this.root = document.getElementById('cinema');
    this.elKicker = document.getElementById('cnKicker');
    this.elTitle = document.getElementById('cnTitle');
    this.elWho = document.getElementById('cnWho');
    this.elText = document.getElementById('cnText');
    this.elCard = this.root?.querySelector('.cn-card');
    this.elLine = this.root?.querySelector('.cn-line');
    this.elSkip = document.getElementById('cnSkip');
    this.elCredits = document.getElementById('cnCredits');
    this.elCreditsTrack = document.getElementById('cnCreditsTrack');
    if (this.elSkip) this.elSkip.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.skipAll();
    });
  }

  play(id) {
    const g = this.game;
    if (!g || g.state === 'title' || g.state === 'boot') return false;
    if (this.active) this.stop(false);
    const reel = reelById(id, g);
    if (!reel?.shots?.length) return false;
    if (!BEAT_FILMS.has(id)) return false;
    const flags = (g.campaign.flags = g.campaign.flags || {});
    flags.films = flags.films || {};
    if (flags.films[id]) return false;
    if (g.flightLayer === 'atmo' && g._commitExitAtmosphere) g._commitExitAtmosphere(g.atmoPlanet, true);
    const ship = g.ship;
    this.reel = reel;
    this.i = 0;
    this.t = 0;
    this.active = true;
    this._saved = {
      enabled: g.input.enabled,
      cam: g.camMode,
      photo: g.photo,
      cursor: document.body.style.cursor,
      mute: g.hud.muteToasts,
      target: g.target,
      ship: ship ? {
        position: ship.position.clone(),
        quaternion: ship.quaternion.clone(),
        velocity: ship.velocity.clone(),
        angVel: ship.angVel.clone(),
        throttle: ship.throttle,
        gearDown: ship.gearDown,
      } : null,
    };
    g.input.enabled = false;
    g.input.unlockPointer?.();
    g.input.centerStick?.();
    g.photo = false;
    g.hud.muteToasts = 99;
    g.hud.toasts = [];
    document.body.classList.add('on-cinema');
    this.root?.classList.remove('hidden');
    Audio.setMusicIntensity(reel.music || 0.4);
    Audio.radio(reel.shots[0]?.line?.who || 'open');
    this._enterShot(reel.shots[0]);
    g.preloadHalcyon?.();
    return true;
  }

  skipShot() {
    if (!this.active || !this.reel) return;
    this._advance();
  }

  skipAll() {
    if (!this.active) return;
    this.stop(true);
  }

  tick(dt) {
    if (!this.active || !this.reel) return;
    const shot = this.reel.shots[this.i];
    if (!shot) { this.stop(true); return; }
    this.t += dt;
    this._paint(shot);
    const g = this.game;
    if (g.ship) {
      g.ship.throttle = Math.max(g.ship.throttle, 0.22);
      g.ship.boost = false;
      if (g.ship.velocity.length() > 80) g.ship.velocity.multiplyScalar(0.96);
      g.ship.sync?.();
      if (g.ship.updateVisuals) g.ship.updateVisuals(dt, g.time || 0, g.camera.position);
    }
    if (g.systemScene) g.systemScene.update(dt, g.time, g.camera.position, { freezeOrbit: true });
    if (g.background) g.background.update(dt, g.camera.position, 0, g.camera);
    this._tickChoir(dt);
    if (this.t >= shot.dur) this._advance();
  }

  applyCamera(dt) {
    if (!this.active || !this.reel) return false;
    const shot = this.reel.shots[this.i];
    if (!shot) return false;
    this._cam(shot, dt);
    return true;
  }

  stop(finished) {
    const g = this.game;
    const id = this.reel?.id;
    this._clearChoir();
    this._clearHero();
    this._anchor = null;
    this.active = false;
    this.reel = null;
    this.i = 0;
    this.t = 0;
    document.body.classList.remove('on-cinema');
    this.root?.classList.add('hidden');
    this.elCredits?.classList.remove('on');
    if (this.elCard) this.elCard.classList.remove('on');
    if (this.elLine) this.elLine.classList.remove('on');
    if (id) {
      const flags = (g.campaign.flags = g.campaign.flags || {});
      flags.films = flags.films || {};
      flags.films[id] = true;
    }
    if (this._saved) {
      const savedShip = this._saved.ship;
      if (savedShip && g.ship) {
        g.ship.position.copy(savedShip.position);
        g.ship.quaternion.copy(savedShip.quaternion);
        g.ship.velocity.copy(savedShip.velocity);
        g.ship.angVel.copy(savedShip.angVel);
        g.ship.throttle = savedShip.throttle;
        g.ship.gearDown = savedShip.gearDown;
        g.ship.sync?.();
      }
      g.target = this._saved.target;
      g.input.enabled = this._saved.enabled !== false;
      g.camMode = this._saved.cam || 0;
      g.photo = !!this._saved.photo;
      g.hud.muteToasts = this._saved.mute || 0;
      document.body.style.cursor = this._saved.cursor || 'none';
    }
    g.hudCinematic = 0;
    g._camLock = true;
    g._updateCamera(0.05);
    g._camLock = false;
    if (g.state === 'playing') {
      document.body.style.cursor = 'none';
      g.input.centerStick?.();
      g.input.lockPointer?.();
    }
    Audio.setMusicIntensity(0.2);
    if (finished && g.campaign && !g.campaign.ending) {
      const nav = nextStep(g);
      if (nav?.hud) g.hud.toast(nav.hud, 'info', 6.5, true);
    }
    this._saved = null;
    g._tryAdoptHero?.();
    // Prefer a sync reveal: dress runs during the film so stop only unhides.
    if (finished) g.systemScene?.mountHeroStation?.(() => g._pullShipOutOfStations?.());
  }

  _advance() {
    this.i += 1;
    this.t = 0;
    const next = this.reel?.shots[this.i];
    if (!next) { this.stop(true); return; }
    Audio.radio(next.line?.who || '');
    this._enterShot(next);
  }

  _enterShot(shot) {
    const g = this.game;
    g.hudCinematic = 1;
    this._who = '';
    this._stage(shot);
    this._paint(shot, true);
  }

  _paint(shot, force) {
    const u = this.t / Math.max(0.01, shot.dur);
    const fadeIn = shot.fadeIn || 0.35;
    const fadeOut = shot.fadeOut || 0.35;
    let a = 1;
    if (this.t < fadeIn) a = this.t / fadeIn;
    else if (this.t > shot.dur - fadeOut) a = Math.max(0, (shot.dur - this.t) / fadeOut);
    if (this.root) this.root.style.setProperty('--cn-a', a.toFixed(3));

    if (shot.card) {
      this.elCard?.classList.add('on');
      if (this.elKicker) this.elKicker.textContent = shot.card.kicker || '';
      if (this.elTitle) this.elTitle.textContent = shot.card.title || '';
    } else this.elCard?.classList.remove('on');

    if (shot.credits) {
      this.elLine?.classList.remove('on');
      this.elCard?.classList.remove('on');
      this.elCredits?.classList.add('on');
      if (force || this._creditsFor !== shot) {
        this._creditsFor = shot;
        this._fillCredits(shot.credits);
      }
      const y = 78 - u * 168;
      if (this.elCreditsTrack) this.elCreditsTrack.style.transform = `translateY(${y}vh)`;
    } else {
      this.elCredits?.classList.remove('on');
      if (shot.line) {
        this.elLine?.classList.add('on');
        if (this.elWho) this.elWho.textContent = shot.line.who || '';
        if (this.elText && (force || this._who !== shot.line.text)) {
          this.elText.textContent = shot.line.text;
          this._who = shot.line.text;
        }
      } else this.elLine?.classList.remove('on');
    }
  }

  _fillCredits(blocks) {
    if (!this.elCreditsTrack) return;
    this.elCreditsTrack.innerHTML = (blocks || []).map((b) => {
      const title = b.title ? `<h3>${b.title}</h3>` : '';
      const role = b.role ? `<div class="role">${b.role}</div>` : '';
      const lines = (b.lines || []).map((n) => `<div class="name">${n}</div>`).join('');
      return `<div class="cn-credit${b.end ? ' end' : ''}">${role}${title}${lines}</div>`;
    }).join('');
  }

  _body(kind) {
    const g = this.game;
    const sc = g.systemScene;
    if (!sc) return null;
    if (kind === 'planet' || kind === 'limb' || kind === 'giant') {
      const planets = sc.planets || [];
      if (kind === 'giant') {
        return planets.find((p) => p.data?.type === 'gas' || p.data?.type === 'icegiant' || p.data?.story === 'signal')
          || planets[0];
      }
      return planets.find((p) => p.data?.story === 'dive' || p.data?.type === 'terra' || p.data?.type === 'ocean')
        || planets[0];
    }
    if (kind === 'station') return sc.stations?.[0] || null;
    if (kind === 'wreck') return sc.wrecks?.[0] || sc.stations?.[0] || sc.planets?.[0] || null;
    return null;
  }

  _world(rt) {
    const g = this.game;
    if (!rt || !g.systemScene?.getPos) return null;
    return g.systemScene.getPos(rt, _pos);
  }

  _focusKind(cam) {
    if (cam === 'station') return 'station';
    if (cam === 'wreck') return 'wreck';
    if (cam === 'giant' || cam === 'reveal') return 'giant';
    return 'planet';
  }

  _pinShot(shot, s) {
    const kind = this._focusKind(shot.cam || 'chase');
    const body = this._body(kind);
    const wp = this._world(body);
    if (!wp) { this._anchor = null; return; }
    this._anchor = { body, kind, off: s.position.clone().sub(wp) };
  }

  _holdPin() {
    const g = this.game;
    const s = g.ship;
    if (!s || !this._anchor) return null;
    const wp = g.systemScene?.getPos(this._anchor.body, _pinPos);
    if (!wp) return null;
    s.position.copy(wp).add(this._anchor.off);
    _fwd.copy(wp).sub(s.position);
    if (_fwd.lengthSq() > 1e-8) {
      _fwd.normalize();
      s.quaternion.setFromUnitVectors(_nose, _fwd);
    }
    s.velocity.set(0, 0, 0);
    s.sync?.();
    return wp;
  }

  _stage(shot) {
    const g = this.game;
    const s = g.ship;
    if (!s) return;
    const L = shipLen(s);
    const cam = shot.cam || 'chase';
    if (cam === 'limb' || cam === 'pull' || cam === 'giant' || cam === 'reveal') {
      const p = this._body(cam === 'giant' || cam === 'reveal' ? 'giant' : 'planet');
      const wp = this._world(p);
      const R = Math.max(40, p?.radius || p?.data?.radius || 80);
      if (wp) {
        const standoff = R * (cam === 'reveal' ? 2.35 : cam === 'pull' ? 4.2 : cam === 'giant' ? 3.6 : 3.4);
        s.position.copy(wp).add(_tmp.set(standoff * 0.62, R * 0.14, standoff * 0.55));
        _fwd.copy(wp).sub(s.position).normalize();
        s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), _fwd);
        if (p && g.setTarget) g.setTarget(p, true);
      }
    } else if (cam === 'station') {
      const st = this._body('station');
      const wp = this._world(st);
      if (wp) {
        const R = g._stationVisualExtent ? g._stationVisualExtent(st) : 220;
        if (g._poseOutside) g._poseOutside(wp, R + 90, wp.clone().add(new THREE.Vector3(0, 28, 0)));
        else s.position.copy(wp).add(_tmp.set(R + 90, 40, R * 0.2));
        if (st && g.setTarget) g.setTarget(st, true);
      }
    } else if (cam === 'wreck') {
      const w = this._body('wreck');
      const wp = this._world(w) || s.position.clone().addScaledVector(s.forward, 220);
      s.position.copy(wp).add(_tmp.set(L * 8, L * 2.2, L * 6));
      _fwd.copy(wp).sub(s.position).normalize();
      s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), _fwd);
      if (w && g.setTarget) g.setTarget(w, true);
    } else if (cam === 'choir' || cam === 'void') {
      const p = this._body('planet');
      const wp = this._world(p);
      if (wp) {
        const R = Math.max(80, p?.radius || 80);
        // Sit on the limb, not in front of a centered disc — hull stays a subject.
        const standoff = cam === 'void' ? R * 3.4 : R * 3.6;
        s.position.copy(wp).add(_tmp.set(standoff * 0.72, R * 0.12, standoff * 0.48));
        _fwd.copy(wp).sub(s.position).normalize();
        s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), _fwd);
      }
    }
    this._placeChoir(shot);
    s.velocity.set(0, 0, 0);
    s.throttle = 0.35;
    s.sync?.();
    this._pinShot(shot, s);
    g._camLock = true;
    g._updateCamera(0.02);
    g._camLock = false;
  }

  _cam(shot, dt) {
    const g = this.game;
    const s = g.ship;
    if (!s) return;
    const cam = shot.cam || 'chase';
    const u = this.t;
    if (cam === 'reveal') {
      this._revealWorld(s, u);
      return;
    }
    const focusPos = this._holdPin();
    const L = shipLen(s);
    _fwd.copy(s.forward);
    _right.copy(s.right);
    _up.copy(s.up);
    if (_up.lengthSq() < 1e-6) _up.copy(_worldUp);

    let back = 2.9, side = 0.55, lift = 0.55, lookAhead = 5.2, fov = 38, planetW = 0.12;
    if (cam === 'three') { back = 3.05; side = 0.72; lift = 0.52; lookAhead = 4.8; fov = 37; planetW = 0.12; }
    else if (cam === 'cockpit') { back = -0.12; side = 0; lift = 0.205; lookAhead = 0.95; fov = 64; planetW = 0; }
    else if (cam === 'pull') { back = 3.4; side = 0.78; lift = 0.62; lookAhead = 4.6; fov = 38; planetW = 0.14; }
    else if (cam === 'void') { back = 3.2; side = 0.62; lift = 0.58; lookAhead = 6.4; fov = 38; planetW = 0.12; }
    else if (cam === 'limb' || cam === 'giant') { back = 3.05; side = 0.64; lift = 0.56; lookAhead = 5.4; fov = 37; planetW = 0.12; }
    else if (cam === 'station') { back = 2.85; side = 0.62; lift = 0.5; lookAhead = 4.2; fov = 36; planetW = 0.14; }
    else if (cam === 'wreck') { back = 2.9; side = 0.66; lift = 0.5; lookAhead = 4.6; fov = 36; planetW = 0.1; }
    else if (cam === 'choir') { back = 3.15; side = 0.7; lift = 0.58; lookAhead = 6.2; fov = 38; planetW = 0.12; }
    else if (cam === 'chase') { back = 2.95; side = 0.58; lift = 0.54; lookAhead = 5.6; fov = 37; planetW = 0.12; }

    const sway = Math.sin(u * 0.22) * 0.05;
    // Camera on the starboard quarter so the hull sits lower-left, planet behind.
    g.camera.position.copy(s.position)
      .addScaledVector(_fwd, -L * back)
      .addScaledVector(_right, L * (side + sway))
      .addScaledVector(_up, L * lift);
    this._keepCamOut(g.camera.position, s, L, cam);

    _look.copy(s.position)
      .addScaledVector(_fwd, L * lookAhead)
      .addScaledVector(_up, L * (cam === 'cockpit' ? -0.16 : 0.12));
    const wp = focusPos || this._world(this._body(this._focusKind(cam)));
    if (wp && planetW > 0) {
      const body = this._anchor?.body || this._body(this._focusKind(cam));
      const R = Math.max(40, body?.radius || body?.data?.radius || 80);
      _limb.copy(wp).addScaledVector(_tmp.copy(g.camera.position).sub(wp).normalize(), R * 0.92);
      _look.lerp(_limb, planetW);
    }
    if (this._choir?.children?.length && (cam === 'choir' || shot.aliens)) {
      const mid = this._choir.children[Math.floor(this._choir.children.length / 2)];
      mid.getWorldPosition(_choirAim);
      _look.lerp(_choirAim, cam === 'choir' ? 0.22 : 0.12);
    }
    g.camera.up.copy(_up);
    g.camera.lookAt(_look);
    g.camera.near = 0.18;
    g.camera.far = 9e6;
    g.camera.fov = fov;
    g.camera.updateProjectionMatrix();
  }

  _placeChoir(shot) {
    const n = shot.aliens || (shot.cam === 'choir' ? 5 : 0);
    if (!n) { this._clearChoir(); return; }
    const g = this.game;
    const s = g.ship;
    if (!s) return;
    this._clearChoir();
    const group = new THREE.Group();
    group.name = 'choirFleet';
    _fwd.copy(s.forward);
    _right.copy(s.right);
    _up.copy(s.up);
    if (_up.lengthSq() < 1e-6) _up.copy(_worldUp);
    const L = shipLen(s);
    const spread = L * 7.5;
    const p = this._body('planet');
    const wp = this._world(p);
    const R = Math.max(40, p?.radius || p?.data?.radius || 80);
    for (let i = 0; i < n; i++) {
      const craft = makeChoirCraft(0.92 + (i % 3) * 0.18);
      const u = (i / Math.max(1, n - 1)) - 0.5;
      // Tangent to the limb, close enough that the lofted hull fills the frame.
      craft.position.copy(s.position)
        .addScaledVector(_fwd, L * (6.2 + (i % 3) * 1.15))
        .addScaledVector(_right, -L * 6.4 - u * spread * 0.62)
        .addScaledVector(_up, Math.sin(i * 1.2) * L * 1.15 + L * 0.85);
      if (wp) {
        _tmp.copy(craft.position).sub(wp);
        const need = R * 1.18 + L * 10;
        if (_tmp.length() < need) {
          if (_tmp.lengthSq() < 1e-6) _tmp.set(0, 1, 0);
          _tmp.normalize();
          craft.position.copy(wp).addScaledVector(_tmp, need);
        }
      }
      craft.lookAt(s.position);
      craft.userData.home = craft.position.clone();
      group.add(craft);
    }
    g.scene.add(group);
    this._choir = group;
  }

  /** Wide, slow orbit so the source world fills the frame and the hull stays a small witness. */
  _revealWorld(s, u) {
    const g = this.game;
    const body = this._body('giant') || this._body('planet');
    const wp = this._world(body);
    if (!wp) return;
    const R = Math.max(70, body.radius || body.data?.radius || 140);
    const ang = 0.42 + u * 0.04;
    const shipD = R * 2.15;
    const camD = R * 2.72;
    s.position.set(wp.x + Math.sin(ang) * shipD, wp.y + R * 0.11, wp.z + Math.cos(ang) * shipD);
    _fwd.copy(wp).sub(s.position);
    if (_fwd.lengthSq() > 1e-8) {
      _fwd.normalize();
      s.quaternion.setFromUnitVectors(_nose, _fwd);
    }
    s.velocity.set(0, 0, 0);
    s.sync?.();
    g.camera.position.set(wp.x + Math.sin(ang) * camD, wp.y + R * 0.34, wp.z + Math.cos(ang) * camD);
    g.camera.up.set(0, 1, 0);
    g.camera.lookAt(wp.x, wp.y + R * 0.02, wp.z);
    g.camera.near = 0.18;
    g.camera.far = 9e6;
    g.camera.fov = 28;
    g.camera.updateProjectionMatrix();
    const mat = body.mesh?.material;
    if (mat?.uniforms?.uHero) mat.uniforms.uHero.value = 1;
  }

  _keepCamOut(pos, s, L, cam) {
    const g = this.game;
    const sc = g.systemScene;
    if (sc?.planets) {
      for (const p of sc.planets) {
        const wp = this._world(p);
        if (!wp) continue;
        const need = (p.radius || 40) * 1.06 + L * 2.2;
        _tmp.copy(pos).sub(wp);
        const d = _tmp.length();
        if (d < need) {
          if (d < 1e-5) _tmp.set(0, 1, 0);
          else _tmp.multiplyScalar(1 / d);
          pos.copy(wp).addScaledVector(_tmp, need);
        }
      }
    }
    if (cam !== 'cockpit') {
      const hull = pos.distanceTo(s.position);
      const min = L * 2.4;
      if (hull < min) {
        _tmp.copy(pos).sub(s.position);
        if (_tmp.lengthSq() < 1e-6) _tmp.copy(_fwd).multiplyScalar(-1);
        _tmp.normalize();
        pos.copy(s.position).addScaledVector(_tmp, min);
      }
    }
  }

  _tickChoir(dt) {
    if (!this._choir) return;
    const t = this.t || 0;
    for (const child of this._choir.children) {
      if (child.userData.ring) child.userData.ring.rotation.z += (child.userData.spin || 0.5) * dt;
      if (child.userData.home) {
        child.position.copy(child.userData.home);
        child.position.y += Math.sin(t * 0.7 + (child.userData.bob || 0)) * 1.15;
        child.rotation.z = Math.sin(t * 0.35 + (child.userData.bob || 0)) * 0.05;
      }
    }
  }

  _clearHero() {
    for (const p of this.game?.systemScene?.planets || []) {
      if (p.mesh?.material?.uniforms?.uHero) p.mesh.material.uniforms.uHero.value = 0;
    }
  }

  _clearChoir() {
    if (!this._choir) return;
    this._choir.traverse((o) => {
      if (o.geometry) o.geometry.dispose?.();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => m.dispose?.());
      }
    });
    this._choir.parent?.remove(this._choir);
    this._choir = null;
  }
}
