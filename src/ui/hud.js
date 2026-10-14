// ============================================================================
//  CANVAS HUD — reticle, flight ladder, radar, brackets, telemetry, toasts
// ============================================================================
import * as THREE from '../../vendor/three/three.module.js';
import { clamp, lerp, fmtDist, fmtSpeed, fmtCredits, wrapAngle, TAU, DEG } from '../core/utils.js';

const C = {
  cyan: '#3ec8ff',
  cyanDim: 'rgba(62,200,255,0.35)',
  white: '#eaf6ff',
  green: '#7dffb0',
  amber: '#ffc24d',
  red: '#ff5c5c',
  purple: '#ff2ea6',
  bg: 'rgba(18,8,20,0.45)',
  line: 'rgba(62,200,255,0.5)',
};

function fmtSurf(d) {
  d = Math.abs(d || 0);
  if (d < 1000) return `${Math.round(d)} m`;
  return `${(d / 1000).toFixed(1)} km`;
}

const KIND_COLOR = {
  star: '#ffd27a', planet: '#7fd0ff', moon: '#a8b8c8', station: '#7dffb0',
  belt: '#c8a97a', wreck: '#ff9d5c', comet: '#bfeaff', ship: '#ff6a6a',
  enemy: '#ff5c5c', friendly: '#7dffb0',
};

export class HUD {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = 0; this.h = 0; this.dpr = 1;
    this.toasts = [];
    this.warnings = [];
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this.shake = 0;
    this.flash = 0;
    this.damageFlash = 0;
    this.scanPulse = 0;
    this.time = 0;
    this.muteToasts = 0;
    this.slots = { w: 0, h: 0, items: [] };
  }

  resize(w, h, dpr) {
    this.dpr = dpr;
    this.w = w; this.h = h;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._L = this._layout();
  }

  _layout() {
    const w = this.w, h = this.h;
    const s = w < 1000 ? 0.78 : w < 1280 ? 0.88 : 1;
    const panelW = Math.round(200 * s);
    const pad = Math.max(10, Math.round(16 * s));
    const overlayChrome = typeof window !== 'undefined' && !!(window.webkit?.messageHandlers?.astralis);
    const padTop = pad + (overlayChrome ? 22 : 0);
    const hideRight = w < 980;
    const hideHints = w < 1100 || h < 680;
    const hideCompass = w < 920 || h < 640;
    const radarR = Math.min(68 * s, Math.max(42, Math.min(w, h) * 0.09));
    return { s, panelW: Math.max(216, panelW), pad, padTop, hideRight, hideHints, hideCompass, radarR };
  }

  mark(id, x, y, w, h) {
    if (!this.slots) this.slots = { w: this.w, h: this.h, items: [] };
    this.slots.items.push({ id, x, y, w, h });
  }

  toast(text, kind = 'info', ttl = 3.2, force = false) {
    if (!force && this.muteToasts > 0 && kind !== 'bad') return;
    const last = this.toasts[this.toasts.length - 1];
    if (last && last.text === text) {
      last.t = 0;
      last.ttl = Math.max(last.ttl, ttl);
      last.kind = kind;
      return;
    }
    this.toasts.push({ text, kind, t: 0, ttl });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  project(pos, camera) {
    this._v.copy(pos).project(camera);
    return {
      x: (this._v.x * 0.5 + 0.5) * this.w,
      y: (-this._v.y * 0.5 + 0.5) * this.h,
      z: this._v.z,
      visible: this._v.z < 1 && this._v.z > -1,
    };
  }

  // -------------------------------------------------------------- drawing
  panel(x, y, w, h, cut = 10, fill = C.bg, stroke = C.line, lw = 1) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x + cut, y);
    c.lineTo(x + w, y);
    c.lineTo(x + w, y + h - cut);
    c.lineTo(x + w - cut, y + h);
    c.lineTo(x, y + h);
    c.lineTo(x, y + cut);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
  }

  label(text, x, y, size = 11, color = C.cyan, align = 'left', font = 'Rajdhani', weight = 600, spacing = 0) {
    const c = this.ctx;
    c.font = `${weight} ${size}px ${font}, sans-serif`;
    c.fillStyle = color;
    const prevAlign = c.textAlign;
    c.textAlign = align;
    c.textBaseline = 'alphabetic';
    c.fillText(text, x, y);
    c.textAlign = prevAlign;
  }

  bar(x, y, w, h, frac, color, bg = 'rgba(255,255,255,0.09)', vertical = false) {
    const c = this.ctx;
    c.fillStyle = bg;
    c.fillRect(x, y, w, h);
    frac = clamp(frac, 0, 1);
    c.fillStyle = color;
    if (vertical) c.fillRect(x, y + h * (1 - frac), w, h * frac);
    else c.fillRect(x, y, w * frac, h);
    c.strokeStyle = 'rgba(255,255,255,0.18)';
    c.lineWidth = 1;
    c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  draw(s) {
    const c = this.ctx;
    const { w, h } = this;
    this.time += s.dt;
    if (this.muteToasts > 0) this.muteToasts = Math.max(0, this.muteToasts - s.dt);
    c.clearRect(0, 0, w, h);

    if (s.hidden) {
      this.slots = { w, h, items: [] };
      return;
    }

    this.slots = { w, h, items: [] };
    this._feedY = 0;
    this._L = this._layout();
    if (typeof c.letterSpacing !== 'undefined') c.letterSpacing = '0px';

    c.save();
    if (this.shake > 0.01) {
      c.translate((Math.random() - 0.5) * this.shake * 14, (Math.random() - 0.5) * this.shake * 14);
      this.shake *= Math.exp(-6 * s.dt);
    }

    const cam = s.camera;
    const cx = w / 2, cy = h / 2;

    if (s.atmo) {
      this.drawLeftPanel(s);
      this.drawAtmoHud(s, cx, cy);
      this.drawInteract(s);
      this.drawProgress(s);
      this.drawComms(s);
      this.drawToasts(s);
      this.drawWarnings(s);
    } else {
      this.drawLadder(s, cam, cx, cy);
      this.drawPrograde(s, cam);
      this.drawTargets(s, cam);
      this.drawReticle(s, cx, cy);
      this.drawRadar(s);
      this.drawLeftPanel(s);
      if (!this._L.hideRight) this.drawRightPanel(s);
      this.drawTopBar(s);
      this.drawWarnings(s);
      this.drawComms(s);
      this.drawToasts(s);
      this.drawInteract(s);
      this.drawProgress(s);
      if (s.fMode === 'scan') this.drawScanSweep(s);
      this.drawHalo(s, cam);
    }

    c.restore();

    // full-screen damage flash
    if (this.damageFlash > 0.01) {
      const g = c.createRadialGradient(cx, cy, Math.min(w, h) * 0.2, cx, cy, Math.max(w, h) * 0.75);
      g.addColorStop(0, 'rgba(255,0,0,0)');
      g.addColorStop(1, `rgba(255,30,20,${clamp(this.damageFlash * 0.65, 0, 0.7)})`);
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      this.damageFlash = Math.max(0, this.damageFlash - s.dt * 1.8);
    }
    // shield flash
    if (this.flash > 0.01) {
      c.fillStyle = `rgba(90,200,255,${this.flash * 0.13})`;
      c.fillRect(0, 0, w, h);
      this.flash = Math.max(0, this.flash - s.dt * 3.4);
    }
    // warp vignette
    if (s.warp > 0.02) {
      const g = c.createRadialGradient(cx, cy, Math.min(w, h) * 0.12, cx, cy, Math.max(w, h) * 0.7);
      g.addColorStop(0, 'rgba(120,190,255,0)');
      g.addColorStop(1, `rgba(150,210,255,${clamp(s.warp * 0.42, 0, 0.45)})`);
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }
    // scanline / grain
    c.globalAlpha = 0.035;
    c.fillStyle = '#9fd8ff';
    const off = (this.time * 42) % 4;
    for (let y = -4 + off; y < h; y += 4) c.fillRect(0, y, w, 1);
    c.globalAlpha = 1;
  }

  drawAtmoHud(s, cx, cy) {
    const c = this.ctx;
    const { w, h } = this;
    c.save();
    c.strokeStyle = 'rgba(62,200,255,0.75)';
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(cx - 12, cy); c.lineTo(cx - 3, cy);
    c.moveTo(cx + 3, cy); c.lineTo(cx + 12, cy);
    c.moveTo(cx, cy - 12); c.lineTo(cx, cy - 3);
    c.moveTo(cx, cy + 3); c.lineTo(cx, cy + 12);
    c.stroke();
    this.label(fmtSpeed(s.speed), 18, h - 34, 18, C.cyan, 'left', 'Orbitron', 700);
    this.label(`ALT ${Math.round(s.altitude || 0)}`, 18, h - 16, 11, 'rgba(255,180,230,0.8)', 'left', 'Share Tech Mono');
    if (s.atmoFeel) this.label(s.atmoFeel, w / 2, 40, 10, 'rgba(196,160,255,0.88)', 'center', 'Share Tech Mono');
    this.mark('atmoSpeed', 18, h - 48, 160, 36);
    const rngTxt = fmtSurf(s.atmoRange || 0);
    this.label(`RNG ${rngTxt}`, w - 18, h - 34, 12, C.cyan, 'right', 'Share Tech Mono');
    if (s.atmoPoi) {
      this.label(`${s.atmoPoi.name}  ${fmtSurf(s.atmoPoi.dist)}`, w - 18, h - 16, 11, C.amber, 'right', 'Share Tech Mono');
    }
    this.label('W/S SPEED  ·  A/D TURN  ·  SPACE/CTRL ALTITUDE  ·  NOSE-UP TO LEAVE', w / 2, 22, 9, C.purple, 'center', 'Orbitron', 700, 2);
    // Keep the heading tape below both the control legend and atmosphere label.
    if (!this._L?.hideCompass) this._drawCompassTape(s, 66);
    this._feedY = Math.max(this._feedY || 0, 54);
    c.restore();
  }

  // ------------------------------------------------------- flight ladder
  drawLadder(s, cam, cx, cy) {
    const c = this.ctx;
    const fwd = this._v.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const pitch = Math.asin(clamp(fwd.y, -1, 1));
    c.save();
    c.strokeStyle = 'rgba(95,216,255,0.22)';
    c.fillStyle = 'rgba(95,216,255,0.38)';
    c.lineWidth = 1;
    c.font = '600 10px Rajdhani, sans-serif';
    c.textAlign = 'center';
    const p0 = pitch / DEG;
    for (let d = -20; d <= 20; d += 10) {
      const target = Math.round((p0 + d) / 10) * 10 - d;
      const y = cy - (target - p0) * (h2px(this.h));
      if (y < 96 || y > this.h - 130) continue;
      const wide = 70, gap = 28;
      const isZero = Math.abs(target) < 0.001;
      c.globalAlpha = isZero ? 0.55 : 0.22;
      c.beginPath();
      c.moveTo(cx - wide, y); c.lineTo(cx - gap, y);
      c.moveTo(cx + gap, y); c.lineTo(cx + wide, y);
      c.stroke();
      if (isZero) { c.beginPath(); c.moveTo(cx - wide, y); c.lineTo(cx - wide, y + 5); c.moveTo(cx + wide, y); c.lineTo(cx + wide, y + 5); c.stroke(); }
    }
    c.globalAlpha = 1;
    c.restore();
    if (!this._L?.hideCompass) this._drawCompassTape(s, 22);
  }

  _drawCompassTape(s, tapeY) {
    const c = this.ctx;
    const cx = this.w / 2;
    const fwd = s.shipForward;
    if (!fwd) return;
    const heading = Math.atan2(fwd.x, -fwd.z);
    const tapeW = Math.min(340, this.w * 0.32);
    const x0 = cx - tapeW / 2;
    c.save();
    c.beginPath();
    c.rect(x0, tapeY - 14, tapeW, 28);
    c.clip();
    c.strokeStyle = 'rgba(95,216,255,0.45)';
    c.fillStyle = 'rgba(190,235,255,0.82)';
    c.font = '600 10px Rajdhani, sans-serif';
    c.textAlign = 'center';
    const hdgDeg = ((heading / DEG) + 360) % 360;
    const pxPerDeg = tapeW / 90;
    const cardinals = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let d = -50; d <= 50; d += 5) {
      const a = Math.round((hdgDeg + d) / 5) * 5;
      const aa = ((a % 360) + 360) % 360;
      const x = cx + (a - hdgDeg) * pxPerDeg;
      if (x < x0 || x > x0 + tapeW) continue;
      const major = aa % 15 === 0;
      c.globalAlpha = major ? 0.9 : 0.3;
      c.beginPath();
      c.moveTo(x, tapeY + 8); c.lineTo(x, tapeY + (major ? 0 : 4));
      c.stroke();
      if (major) c.fillText(cardinals[aa] !== undefined ? cardinals[aa] : String(aa).padStart(3, '0'), x, tapeY - 2);
    }
    c.restore();
    c.save();
    c.strokeStyle = C.amber; c.fillStyle = 'rgba(10,18,26,0.92)'; c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(cx - 20, tapeY + 10); c.lineTo(cx + 20, tapeY + 10);
    c.lineTo(cx + 20, tapeY + 24); c.lineTo(cx, tapeY + 29); c.lineTo(cx - 20, tapeY + 24);
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = C.amber;
    c.font = '700 12px Orbitron, sans-serif'; c.textAlign = 'center';
    c.fillText(String(Math.round((((Math.atan2(fwd.x, -fwd.z) / DEG) + 360) % 360))).padStart(3, '0'), cx, tapeY + 23);
    c.restore();
    this.mark('compass', x0, tapeY - 14, tapeW, 44);
  }

  drawPrograde(s, cam) {
    if (s.speed < 2) return;
    const c = this.ctx;
    const dir = this._v.copy(s.velocity).normalize();
    const p = this.project(cam.position.clone().addScaledVector(dir, 1000), cam);
    if (!p.visible || p.x < 0 || p.x > this.w || p.y < 0 || p.y > this.h) return;
    c.save();
    c.strokeStyle = 'rgba(125,255,176,0.85)';
    c.lineWidth = 1.4;
    c.beginPath(); c.arc(p.x, p.y, 11, 0, TAU); c.stroke();
    for (let i = 0; i < 3; i++) {
      const a = i * (TAU / 3) + Math.PI / 6;
      c.beginPath();
      c.moveTo(p.x + Math.cos(a) * 11, p.y + Math.sin(a) * 11);
      c.lineTo(p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 18);
      c.stroke();
    }
    c.restore();
  }

  drawReticle(s, cx, cy) {
    const c = this.ctx;
    const r = 12;
    c.save();
    c.strokeStyle = s.firing ? 'rgba(255,200,120,0.95)' : 'rgba(95,216,255,0.8)';
    c.lineWidth = 1.5;
    const L = 9;
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [sx, sy] of corners) {
      c.beginPath();
      c.moveTo(cx + sx * r, cy + sy * r - sy * L);
      c.lineTo(cx + sx * r, cy + sy * r);
      c.lineTo(cx + sx * r - sx * L, cy + sy * r);
      c.stroke();
    }
    c.beginPath(); c.arc(cx, cy, 1.6, 0, TAU); c.fillStyle = c.strokeStyle; c.fill();
    const lf = s.lockFrac || 0;
    if (lf > 0.02) {
      c.strokeStyle = lf >= 1 ? C.red : C.amber;
      c.globalAlpha = 0.35 + lf * 0.65;
      c.lineWidth = 1.4;
      c.beginPath(); c.arc(cx, cy, 22 + (1 - lf) * 18, 0, TAU * lf); c.stroke();
      this.label(lf >= 1 ? 'LOCK SOLID' : 'SEEKING', cx, cy + 38, 10, lf >= 1 ? C.red : C.amber, 'center', 'Orbitron', 700, 2);
    }
    c.globalAlpha = 0.75;
    c.beginPath(); c.moveTo(cx, cy - r - 6); c.lineTo(cx, cy - r - 14); c.stroke();
    c.restore();
  }

  drawTargets(s, cam) {
    const c = this.ctx;
    this._labelRects = [];
    this._chevPts = [];
    for (const t of (s.contacts || [])) {
      if (!t.worldPos) continue;
      const p = this.project(t.worldPos, cam);
      const dist = cam.position.distanceTo(t.worldPos);
      const angSize = Math.atan2(t.radius || 20, Math.max(dist, 1));
      const boxSize = clamp(angSize * (this.h / (cam.fov * DEG)) * 0.9, 26, 420);
      const isTarget = t.isTarget;
      const col = isTarget ? C.amber : (KIND_COLOR[t.kind] || C.cyan);
      const close = dist < (isTarget || t.hostile ? 4e9 : t.kind === 'station' ? 8e6 : 30000);
      const showLabel = isTarget || t.hostile || (close && (t.kind !== 'moon' || dist < 9000));
      if (p.visible && p.x > -100 && p.x < this.w + 100 && p.y > -60 && p.y < this.h + 60 && (close || isTarget || t.hostile)) {
        c.save();
        c.strokeStyle = col;
        c.globalAlpha = isTarget ? 0.95 : (t.hostile ? 0.75 : close ? 0.4 : 0.18);
        c.lineWidth = isTarget ? 1.8 : 1.1;
        const hs = boxSize / 2;
        const cl = Math.min(16, hs * 0.4);
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          c.beginPath();
          c.moveTo(p.x + sx * hs, p.y + sy * hs - sy * cl);
          c.lineTo(p.x + sx * hs, p.y + sy * hs);
          c.lineTo(p.x + sx * hs - sx * cl, p.y + sy * hs);
          c.stroke();
        }
        if (t.hostile) {
          c.beginPath();
          const r = hs + 6;
          c.moveTo(p.x, p.y - r); c.lineTo(p.x + r * 0.75, p.y + r * 0.6);
          c.lineTo(p.x - r * 0.75, p.y + r * 0.6); c.closePath();
          c.globalAlpha *= 0.5; c.stroke();
        }
        const overPanel = (p.x < 260 && p.y < 230) || (p.x > this.w - 260 && p.y < 230);
        const label = t.name.length > 26 ? t.name.slice(0, 25) + '…' : t.name;
        c.font = '600 11px Rajdhani, sans-serif';
        const lw = c.measureText(label.toUpperCase()).width + 90;
        const lr = { x: p.x + hs + 5, y: p.y - 14, w: lw, h: 34 };
        let collide = false;
        for (const r of this._labelRects) {
          if (lr.x < r.x + r.w && lr.x + lr.w > r.x && lr.y < r.y + r.h && lr.y + lr.h > r.y) { collide = true; break; }
        }
        if (showLabel && !overPanel && !collide) {
          this._labelRects.push(lr);
          c.globalAlpha = isTarget ? 1 : 0.6;
          c.font = '600 11px Rajdhani, sans-serif';
          c.textAlign = 'left';
          c.fillStyle = col;
          c.fillText(label.toUpperCase(), p.x + hs + 7, p.y - 3);
          c.globalAlpha *= 0.85;
          c.font = '500 10px Share Tech Mono, monospace';
          c.fillText(`${fmtDist(dist)}  •  ${t.kindLabel || t.kind}`, p.x + hs + 7, p.y + 10);
        }
        if (t.hullFrac !== undefined && t.hullFrac < 1) {
          c.globalAlpha = 1;
          const bw = boxSize;
          c.fillStyle = 'rgba(255,255,255,0.12)';
          c.fillRect(p.x - bw / 2, p.y + hs + 5, bw, 3);
          c.fillStyle = t.hullFrac > 0.5 ? C.green : t.hullFrac > 0.22 ? C.amber : C.red;
          c.fillRect(p.x - bw / 2, p.y + hs + 5, bw * t.hullFrac, 3);
        }
        if (t.locking && t.lockFrac > 0.02) {
          const r = hs + 10 + (1 - t.lockFrac) * 14;
          c.save();
          c.strokeStyle = t.lockFrac >= 1 ? C.red : C.amber;
          c.globalAlpha = 0.55 + t.lockFrac * 0.45;
          c.lineWidth = 1.6;
          c.setLineDash([6, 5]);
          c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.stroke();
          c.setLineDash([]);
          c.restore();
        }
        if (t.scanned === false && t.kind === 'planet' && showLabel) {
          c.globalAlpha = 0.55;
          c.fillStyle = C.cyan;
          c.font = '600 9px Rajdhani, sans-serif';
          c.fillText('UNSCANNED', p.x + hs + 7, p.y + 23);
        }
        c.restore();
      } else if (dist < 300000 && (isTarget || t.hostile || t.kind === 'station' || dist < 90000)) {
        // off-screen chevron, kept clear of HUD bands and de-duplicated
        const dx = p.x - cxOf(this.w), dy = p.y - this.h / 2;
        const a = Math.atan2(dy, dx);
        const cosA = Math.cos(a), sinA = Math.sin(a);
        const hx = this.w / 2, hy = this.h / 2;
        const eR = this.w - 56 - hx, eL = hx - 56, eB = this.h - 64 - hy, eT = hy - 104;
        let tScale = 1e9;
        if (cosA > 1e-4) tScale = Math.min(tScale, eR / cosA); else if (cosA < -1e-4) tScale = Math.min(tScale, eL / -cosA);
        if (sinA > 1e-4) tScale = Math.min(tScale, eB / sinA); else if (sinA < -1e-4) tScale = Math.min(tScale, eT / -sinA);
        const ex = hx + cosA * tScale, ey = hy + sinA * tScale;
        let dup = false;
        for (const q of this._chevPts) { if ((q.x - ex) ** 2 + (q.y - ey) ** 2 < 30 ** 2) { dup = true; break; } }
        if (!dup) {
          this._chevPts.push({ x: ex, y: ey });
          c.save();
          c.translate(ex, ey); c.rotate(a);
          c.strokeStyle = col; c.globalAlpha = isTarget ? 0.9 : t.hostile ? 0.75 : 0.4; c.lineWidth = 1.6;
          c.beginPath(); c.moveTo(-8, -7); c.lineTo(6, 0); c.lineTo(-8, 7); c.stroke();
          c.restore();
        }
      }
    }
  }

  radarGeom() {
    const L = this._L || this._layout();
    const R = L.radarR;
    return { R, cx: this.w - R - L.pad - 6, cy: this.h - R - 16 };
  }

  drawRadar(s) {
    const c = this.ctx;
    const { R, cx, cy } = this.radarGeom();
    c.save();
    // disc
    c.beginPath(); c.arc(cx, cy, R, 0, TAU);
    c.fillStyle = 'rgba(4,12,20,0.62)'; c.fill();
    c.strokeStyle = C.line; c.lineWidth = 1.2; c.stroke();
    c.beginPath(); c.arc(cx, cy, R * 0.66, 0, TAU); c.globalAlpha = 0.35; c.stroke();
    c.beginPath(); c.arc(cx, cy, R * 0.33, 0, TAU); c.stroke();
    c.globalAlpha = 0.3;
    c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.stroke();
    c.globalAlpha = 1;

    // sweep
    const sweep = (this.time * 1.5) % TAU;
    const grad = c.createConicGradient ? c.createConicGradient(sweep, cx, cy) : null;
    if (grad) {
      grad.addColorStop(0, 'rgba(95,216,255,0.30)');
      grad.addColorStop(0.08, 'rgba(95,216,255,0.0)');
      grad.addColorStop(1, 'rgba(95,216,255,0.0)');
      c.beginPath(); c.arc(cx, cy, R - 1, 0, TAU); c.fillStyle = grad; c.fill();
    }

    // contacts
    const fwd = s.shipForward;
    const right = s.shipRight;
    const up = s.shipUp;
    const range = s.radarRange;
    for (const t of (s.contacts || [])) {
      if (!t.worldPos) continue;
      const rel = this._v2.copy(t.worldPos).sub(s.shipPos);
      const d = rel.length();
      if (d > range) continue;
      const rx = rel.dot(right) / range;
      const rz = -rel.dot(fwd) / range;
      const ry = rel.dot(up) / range;
      const px = cx + rx * R * 0.94, py = cy + rz * R * 0.94;
      const col = KIND_COLOR[t.kind] || C.cyan;
      c.globalAlpha = clamp(1.15 - d / range, 0.25, 1);
      c.fillStyle = col;
      const size = t.isTarget ? 3.6 : t.kind === 'star' ? 4 : t.hostile ? 3.2 : 2.1;
      if (Math.abs(ry) > 0.18) {
        c.beginPath(); c.arc(px, py, size, 0, TAU); c.strokeStyle = col; c.lineWidth = 1.2; c.stroke();
        c.beginPath(); c.arc(px, py, size * 0.4, 0, TAU); c.fill();
      } else {
        c.beginPath(); c.arc(px, py, size, 0, TAU); c.fill();
      }
      if (t.hostile) {
        c.strokeStyle = C.red; c.lineWidth = 1;
        c.strokeRect(px - 5, py - 5, 10, 10);
      }
    }
    c.globalAlpha = 1;
    // own ship
    c.fillStyle = C.white;
    c.beginPath();
    c.moveTo(cx, cy - 5.5); c.lineTo(cx + 4, cy + 4.5); c.lineTo(cx, cy + 2); c.lineTo(cx - 4, cy + 4.5);
    c.closePath(); c.fill();
    c.restore();

    // range label
    this.label(`${fmtDist(range)}`, cx, cy - R - 8, 9, 'rgba(95,216,255,0.55)', 'center', 'Rajdhani', 600);
    this.mark('radar', cx - R, cy - R, R * 2, R * 2 + 12);
  }

  drawLeftPanel(s) {
    const c = this.ctx;
    const L = this._L || this._layout();
    const w = L.panelW, x = L.pad, y = L.padTop ?? L.pad;
    const story = !!(s.nav && s.story);
    const pay = !!s.payday;
    const showHow = !!(s.hints && s.nav?.how && !L.hideHints && !s.nav.tutorial);
    let howLines = [];
    if (showHow) {
      c.font = '500 10px Rajdhani, sans-serif';
      howLines = wrapHudText(c, s.nav.how, w - 24).slice(0, 2);
    }
    const howExtra = showHow ? 8 + howLines.length * 14 : 0;
    const h = (s.nav ? (story ? 204 : 188) : 160) + (pay ? 34 : 0) + (L.hideRight ? 22 : 0) + howExtra;
    this.panel(x, y, w, h, 12);
    this.mark('left', x, y, w, h);
    c.save();
    c.beginPath(); c.rect(x + 1, y + 1, w - 2, h - 2); c.clip();
    const bw = w - 24, bx = x + 12;

    this.label(fitHudText(c, s.shipName || '', bw - 52), bx, y + 16, 10, 'rgba(190,230,255,0.7)', 'left', 'Rajdhani', 600);
    this.label(`${Math.round(s.fps || 0)} FPS`, x + w - 12, y + 16, 9, 'rgba(190,230,255,0.35)', 'right', 'Share Tech Mono');
    this.label(fitHudText(c, (s.systemName || '').toUpperCase(), bw), bx, y + 32, 11, C.white, 'left', 'Orbitron', 700);
    const sh = s.shield / s.maxShield;
    const hu = s.hull / s.maxHull;
    this.label('SHIELD', bx, y + 52, 9, 'rgba(190,230,255,0.55)', 'left', 'Rajdhani', 700);
    this.label(`${Math.round(s.shield)}`, bx + bw, y + 52, 9, 'rgba(190,230,255,0.75)', 'right', 'Share Tech Mono');
    this.bar(bx, y + 56, bw, 8, sh, sh > 0.4 ? C.cyan : sh > 0.18 ? C.amber : C.red);
    this.label('HULL', bx, y + 78, 9, 'rgba(190,230,255,0.55)', 'left', 'Rajdhani', 700);
    this.label(`${Math.round(s.hull)}`, bx + bw, y + 78, 9, 'rgba(190,230,255,0.75)', 'right', 'Share Tech Mono');
    this.bar(bx, y + 82, bw, 8, hu, hu > 0.45 ? C.green : hu > 0.2 ? C.amber : C.red);

    this.label('FUEL', bx, y + 104, 9, 'rgba(190,230,255,0.55)', 'left', 'Rajdhani', 700);
    this.label(`${Math.round(s.fuel)} / ${s.maxFuel}`, bx + bw, y + 104, 9, 'rgba(190,230,255,0.6)', 'right', 'Share Tech Mono');
    this.bar(bx, y + 108, bw, 7, s.fuel / s.maxFuel, s.fuel / s.maxFuel > 0.25 ? '#7fd0ff' : C.red);

    this.label('CARGO', bx, y + 130, 9, 'rgba(190,230,255,0.55)', 'left', 'Rajdhani', 700);
    this.label(`${s.cargoUsed}/${s.cargoMax} t`, bx + bw, y + 130, 9, 'rgba(190,230,255,0.6)', 'right', 'Share Tech Mono');
    this.bar(bx, y + 134, bw, 7, s.cargoUsed / s.cargoMax, C.amber);
    let ny = 154;
    if (s.payday) {
      this.label(fitHudText(c, s.payday.title, bw), bx, y + 154, 8.5, C.amber, 'left', 'Rajdhani', 700);
      this.label(fitHudText(c, s.payday.line, bw), bx, y + 170, 10, C.green, 'left', 'Rajdhani', 700);
      ny = 186;
    }

    if (s.nav) {
      const raw = s.nav.hud || '';
      if (s.nav.tutorial) {
        this.label(fitHudText(c, s.nav.title || 'TRAINING', bw), bx, y + ny, 8.5, C.amber, 'left', 'Rajdhani', 700);
        this.label(fitHudText(c, raw, bw), bx, y + ny + 16, 10, C.cyan, 'left', 'Rajdhani', 700);
      } else if (story) {
        this.label(fitHudText(c, `CH.${s.story.n} ${s.story.title}`, bw), bx, y + ny, 8.5, '#c98aff', 'left', 'Rajdhani', 700);
        this.label(fitHudText(c, raw, bw), bx, y + ny + 16, 11, C.white, 'left', 'Rajdhani', 700);
      } else {
        this.label(fitHudText(c, raw, bw), bx, y + ny + 8, 10, '#c98aff', 'left', 'Rajdhani', 700);
      }
      if (showHow && howLines.length) {
        let hy = y + ny + (s.nav.tutorial ? 34 : story ? 34 : 26);
        c.font = '500 10px Rajdhani, sans-serif';
        for (const line of howLines) {
          this.label(fitHudText(c, line, bw), bx, hy, 10, 'rgba(190,230,255,0.52)', 'left', 'Rajdhani', 500);
          hy += 14;
        }
      }
    }
    if (L.hideRight) {
      this.label(fmtSpeed(s.speed), bx, y + h - 10, 12, C.white, 'left', 'Orbitron', 700);
      this.label(s.haloReady ? 'U READY' : 'U LOCKED', x + w - 12, y + h - 10, 9, s.haloReady ? C.green : 'rgba(190,230,255,0.45)', 'right', 'Rajdhani', 700);
    }
    c.restore();
    this._feedY = y + h + 10;
  }

  drawRightPanel(s) {
    const c = this.ctx;
    const L = this._L || this._layout();
    const w = L.panelW, h = 248;
    const x = this.w - w - L.pad, y = L.padTop ?? L.pad;
    this.panel(x, y, w, h, 12);
    this.mark('right', x, y, w, h);
    c.save();
    c.beginPath(); c.rect(x + 1, y + 1, w - 2, h - 2); c.clip();
    const bx = x + 12, bw = w - 24;

    this.label(`${fmtCredits(s.credits)} CR`, bx, y + 16, 11, C.green, 'left', 'Orbitron', 700);
    this.label(String(s.clock || '').split('  ·  ')[0], x + w - 12, y + 16, 9, 'rgba(190,230,255,0.4)', 'right', 'Share Tech Mono');

    this.label('VELOCITY', bx, y + 36, 9, 'rgba(190,230,255,0.55)', 'left', 'Rajdhani', 700);
    this.label(fmtSpeed(s.speed), x + w - 12, y + 58, 22, C.white, 'right', 'Orbitron', 700);
    this.label('M/S', x + w - 12, y + 72, 8, 'rgba(190,230,255,0.45)', 'right', 'Rajdhani', 600);

    this.label('THROTTLE', bx, y + 90, 9, 'rgba(190,230,255,0.55)', 'left', 'Rajdhani', 700);
    const tfrac = clamp(s.throttle, 0, 1);
    const boosting = !!(s.boost || (s.boostAmt > 0.4));
    this.bar(bx, y + 96, bw, 8, tfrac, boosting ? C.amber : C.cyan);
    this.label(`${Math.round(tfrac * 100)}%${boosting ? ' · BOOST' : ''}`, x + w - 12, y + 118, 10, boosting ? C.amber : 'rgba(190,230,255,0.7)', 'right', 'Share Tech Mono');

    this.label((s.mode || '').toUpperCase(), bx, y + 136, 10, s.warp > 0.4 ? C.purple : C.green, 'left', 'Rajdhani', 700);
    const phi = s.well;
    this.label('WELL Φ', bx, y + 154, 9, 'rgba(190,230,255,0.5)', 'left', 'Rajdhani', 700);
    this.label(phi == null ? '—' : Number(phi).toFixed(2), x + w - 12, y + 154, 11, s.wellOk ? C.green : C.red, 'right', 'Share Tech Mono');
    this.label(fitHudText(c, s.wellOk ? 'FSD CLEAR' : 'LOCKED · STAR CORONA', bw), bx, y + 170, 10, s.wellOk ? C.green : C.amber, 'left', 'Rajdhani', 700);

    const mm = s.missilesMax || 8, mi = s.missiles ?? 0;
    this.label('MISSILES', bx, y + 190, 9, 'rgba(190,230,255,0.5)', 'left', 'Rajdhani', 700);
    this.label(`${mi}/${mm}`, x + w - 12, y + 190, 10, mi > 0 ? C.amber : C.red, 'right', 'Share Tech Mono');
    this.bar(bx, y + 196, bw, 7, mi / Math.max(1, mm), mi > 0 ? C.amber : C.red);

    if (s.pips) {
      this.label(fitHudText(c, `SYS ${s.pips.sys}  ENG ${s.pips.eng}  WEP ${s.pips.wep}  C ${s.chaff ?? 0}`, bw), bx, y + 218, 9, 'rgba(190,230,255,0.55)', 'left', 'Share Tech Mono');
    }
    const halo = s.haloReady ? 'U · RIDE FILAMENT' : 'U LOCKED · LEAVE ATMO';
    this.label(fitHudText(c, halo, bw), bx, y + 236, 8.5, s.haloReady ? C.green : 'rgba(190,230,255,0.45)', 'left', 'Rajdhani', 700);
    c.restore();
  }

  drawTopBar(s) {
    if (s.target) {
      const L = this._L || this._layout();
      const w = Math.min(280, this.w * 0.42);
      const x = this.w / 2 - w / 2;
      const radarTop = this.h - (L.radarR * 2 + 36);
      const y = Math.min(this.h - 96, radarTop - 52);
      this.panel(x, y, w, 44, 8, 'rgba(6,14,22,0.62)', 'rgba(255,194,77,0.4)');
      this.mark('target', x, y, w, 44);
      this.label('TARGET', x + 12, y + 14, 9, 'rgba(255,194,77,0.7)', 'left', 'Rajdhani', 700);
      this.label(s.target.name.toUpperCase(), x + 12, y + 32, 13, C.amber, 'left', 'Orbitron', 700);
      this.label(s.target.dist == null ? (s.target.where || 'OTHER STAR') : fmtDist(s.target.dist), x + w - 12, y + 32, 12, C.white, 'right', 'Share Tech Mono');
      this.label(s.target.info, x + w - 12, y + 14, 9, 'rgba(190,230,255,0.65)', 'right', 'Rajdhani', 600);
    }
  }

  drawWarnings(s) {
    const c = this.ctx;
    const list = [];
    if (s.hull / s.maxHull < 0.3) list.push(['HULL CRITICAL', C.red, 1]);
    if (s.shield <= 0 && s.hull / s.maxHull < 0.65) list.push(['SHIELDS DOWN', C.amber, 1]);
    if (s.fuel / s.maxFuel < 0.12) list.push(['FUEL RESERVE LOW', C.amber, 0.6]);
    if (s.collisionWarn) list.push(['PULL UP — TERRAIN', C.red, 1]);
    if (s.missileLock) list.push(['INCOMING MISSILE', C.red, 1]);
    if ((s.wanted || 0) >= 2) list.push([`WANTED ×${s.wanted}`, C.amber, 0.7]);
    if (s.insured === false && (s.hull / s.maxHull) < 0.45) list.push(['UNINSURED', C.amber, 0.5]);
    if (s.silent) list.push(['SILENT RUNNING', C.cyan, 0.4]);
    if (s.autopilot) list.push(['AUTOPILOT', C.green, 0.3]);
    if (s.dockComp) list.push(['DOCKING COMPUTER', C.green, 0.45]);
    if (s.overheat > 0.8) list.push(['WEAPONS OVERHEAT', C.amber, 0.7]);
    if (!list.length) return;
    c.save();
    c.textAlign = 'center';
    let y = 92;
    for (const [txt, col, blink] of list) {
      const a = blink > 0.8 ? (0.5 + 0.5 * Math.sin(this.time * 9)) : 1;
      c.globalAlpha = a;
      c.font = '700 15px Orbitron, sans-serif';
      c.fillStyle = 'rgba(0,0,0,0.5)';
      c.fillText(txt, this.w / 2 + 1, y + 1);
      c.fillStyle = col;
      c.fillText(txt, this.w / 2, y);
      y += 22;
    }
    c.restore();
  }

  drawToasts(s) {
    const c = this.ctx;
    const L = this._L || this._layout();
    const x = L.pad;
    const maxW = L.panelW;
    const hintTop = this.h - 28;
    let y = this._feedY > 0 ? this._feedY : (L.padTop || L.pad) + 220;
    c.save();
    c.textAlign = 'left';
    let shown = 0;
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      t.t += s.dt;
      if (t.t > t.ttl) { this.toasts.splice(i, 1); continue; }
      if (y + 22 > hintTop) continue;
      const k = clamp((t.ttl - t.t) / 0.5, 0, 1) * clamp(t.t / 0.22, 0, 1);
      c.globalAlpha = k;
      const col = t.kind === 'good' ? C.green : t.kind === 'bad' ? C.red : t.kind === 'money' ? C.amber : C.cyan;
      c.font = '600 13px Rajdhani, sans-serif';
      const text = fitHudText(c, t.text, maxW - 18);
      const wpx = Math.min(c.measureText(text).width + 26, maxW);
      c.fillStyle = 'rgba(4,12,20,0.72)';
      c.fillRect(x, y, wpx, 22);
      c.fillStyle = col;
      c.fillRect(x, y, 2.5, 22);
      c.fillText(text, x + 11, y + 15);
      this.mark(`toast${shown}`, x, y, wpx, 22);
      y += 26;
      shown++;
    }
    c.restore();
    this._feedY = y;
  }

  _actionY(s) {
    if (s.atmo) return 86;
    return this.h - 128;
  }

  drawInteract(s) {
    if (!s.prompt || s.progress?.kind === 'jump') return;
    const c = this.ctx;
    c.save();
    c.textAlign = 'center';
    const y = this._actionY(s);
    const txt = s.prompt;
    c.font = '700 14px Rajdhani, sans-serif';
    const wpx = Math.min(c.measureText(txt).width + 60, this.w * 0.62);
    const x = this.w / 2 - wpx / 2;
    c.fillStyle = 'rgba(4,12,20,0.7)';
    c.fillRect(x, y - 20, wpx, 32);
    c.strokeStyle = 'rgba(125,255,176,0.5)';
    c.lineWidth = 1;
    c.strokeRect(x + 0.5, y - 19.5, wpx - 1, 31);
    c.fillStyle = C.green;
    c.fillText(txt, this.w / 2, y + 1);
    this.mark('prompt', x, y - 20, wpx, 32);
    c.restore();
  }

  drawScanSweep(s) {
    const sc = s.scan;
    if (!sc || !sc.active) return;
    const c = this.ctx;
    const cx = this.w / 2, cy = this.h / 2;
    if (sc.blocked) {
      // A status readout is enough when there is no return. Avoid layering a
      // second red radar over the 3D ship and the centre reticle.
      this.label(sc.label || 'NO SIGNAL', cx, cy - 88, 10, C.red, 'center', 'Orbitron', 700, 1);
      if (sc.sub) this.label(sc.sub, cx, cy - 73, 9, 'rgba(220,230,240,0.8)', 'center', 'Share Tech Mono', 500);
      return;
    }
    const R = 48;
    const col = sc.blocked ? C.red : sc.wreck ? '#ff9d5c' : sc.mode === 'ping' ? C.cyan : C.green;
    const ang = this.time * (sc.blocked ? 1.4 : sc.mode === 'ping' ? 5.6 : 3.2);
    c.save();
    c.strokeStyle = col;
    c.globalAlpha = 0.28;
    c.lineWidth = 1.2;
    c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke();
    // rotating lidar spoke — not a pie fill
    c.globalAlpha = 0.85;
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
    c.stroke();
    c.globalAlpha = 0.22;
    c.beginPath();
    c.moveTo(cx, cy);
    c.arc(cx, cy, R, ang - 0.55, ang);
    c.closePath();
    c.fillStyle = col;
    c.fill();
    // dwell ticks around the ring
    const n = 18;
    const amt = clamp(sc.amount || 0, 0, 1);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * TAU;
      const on = i / n <= amt;
      c.globalAlpha = on ? 0.95 : 0.2;
      c.strokeStyle = on ? col : 'rgba(190,230,255,0.35)';
      c.lineWidth = on ? 2 : 1;
      const r0 = R + 5, r1 = R + (on ? 11 : 8);
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      c.stroke();
    }
    c.globalAlpha = 1;
    this.label(sc.label || 'LIDAR', cx, cy - R - 22, 10, col, 'center', 'Orbitron', 700, 1.2);
    if (sc.sub) this.label(sc.sub, cx, cy - R - 8, 9, 'rgba(190,230,255,0.7)', 'center', 'Share Tech Mono', 500);
    c.restore();
  }

  drawProgress(s) {
    const c = this.ctx;
    if (!s.progress || s.progress.amount <= 0.001) return;
    if (s.progress.kind === 'jump') {
      const barW = Math.min(460, this.w * 0.42);
      const bh = 26;
      const y = this.h - 40;
      const x = this.w / 2 - barW / 2;
      const amt = clamp(s.progress.amount, 0, 1);
      c.save();
      c.fillStyle = 'rgba(4,12,20,0.88)';
      c.fillRect(x, y, barW, bh);
      c.strokeStyle = 'rgba(201,138,255,0.65)';
      c.lineWidth = 1;
      c.strokeRect(x + 0.5, y + 0.5, barW - 1, bh - 1);
      c.textAlign = 'left';
      c.font = '700 11px Orbitron, sans-serif';
      c.fillStyle = '#c98aff';
      c.fillText('FRAME SHIFT', x + 12, y + 17);
      const tx = x + 132;
      const tw = barW - 146;
      c.fillStyle = 'rgba(201,138,255,0.2)';
      c.fillRect(tx, y + 11, tw, 4);
      c.fillStyle = '#c98aff';
      c.fillRect(tx, y + 11, tw * amt, 4);
      c.restore();
      return;
    }
    const w = 280, x = this.w / 2 - w / 2;
    const y = s.atmo ? (s.prompt ? this._actionY(s) + 28 : this._actionY(s)) : this.h - 148;
      c.save();
      c.fillStyle = 'rgba(4,12,20,0.6)';
      c.fillRect(x, y, w, 6);
      c.fillStyle = s.progress.color || C.cyan;
      c.fillRect(x, y, w * clamp(s.progress.amount, 0, 1), 6);
      c.strokeStyle = 'rgba(255,255,255,0.2)';
      c.strokeRect(x + 0.5, y + 0.5, w - 1, 5);
      c.textAlign = 'center';
      c.font = '700 12px Rajdhani, sans-serif';
      c.fillStyle = s.progress.color || C.cyan;
      c.fillText(s.progress.label, this.w / 2, y - 8);
      if (s.progress.sub) {
        c.font = '500 10px Share Tech Mono, monospace';
        c.fillStyle = 'rgba(190,230,255,0.6)';
        c.fillText(s.progress.sub, this.w / 2, y + 20);
      }
      c.restore();
  }

  drawComms(s) {
    if (!s.comm) return;
    const c = this.ctx;
    const L = this._L || this._layout();
    const x = L.pad;
    const maxW = L.panelW;
    const y0 = this._feedY || (L.pad + 220);
    c.save();
    c.font = '600 12px Rajdhani, sans-serif';
    const lines = wrapHudText(c, s.comm.text, maxW - 16);
    const boxH = 18 + lines.length * 15;
    if (y0 + boxH > this.h - 36) { c.restore(); return; }
    c.fillStyle = 'rgba(4,12,20,0.72)';
    c.fillRect(x, y0, maxW, boxH);
    c.fillStyle = 'rgba(201,138,255,0.9)';
    c.fillRect(x, y0, 2.5, boxH);
    c.textAlign = 'left';
    c.font = '700 9px Orbitron, sans-serif';
    c.fillStyle = 'rgba(201,138,255,0.8)';
    c.fillText(s.comm.who, x + 10, y0 + 12);
    c.font = '600 11px Rajdhani, sans-serif';
    c.fillStyle = 'rgba(234,246,255,0.86)';
    c.fillText(fitHudText(c, lines[0] || '', maxW - 18), x + 10, y0 + 27);
    if (lines[1]) c.fillText(fitHudText(c, lines[1], maxW - 18), x + 10, y0 + 42);
    c.restore();
    this.mark('comm', x, y0, maxW, boxH);
    this._feedY = y0 + boxH + 8;
  }

  drawWell(s) {
    const phi = s.well;
    if (phi == null) return;
    const c = this.ctx;
    const x = this.w - 188, y = this.h - 78, w = 168, h = 36;
    this.panel(x, y, w, h, 8, 'rgba(8,14,22,0.55)', s.wellOk ? 'rgba(125,255,176,0.35)' : 'rgba(255,92,92,0.55)');
    this.label('WELL Φ', x + 12, y + 14, 9, 'rgba(190,230,255,0.55)', 'left', 'Rajdhani', 700, 1.4);
    this.label(Number(phi).toFixed(2), x + w - 12, y + 14, 11, s.wellOk ? C.green : C.red, 'right', 'Share Tech Mono');
    this.label(s.wellOk ? 'FSD CLEAR' : 'LOCKED · CORONA', x + 12, y + 28, 10, s.wellOk ? C.green : C.amber, 'left', 'Rajdhani', 700);
  }

  drawHalo(s, cam) {
    if (!s.haloPos || !cam || s.haloReady) return;
    const p = this.project(s.haloPos, cam);
    if (p.visible && p.x > 80 && p.x < this.w - 80 && p.y > 80 && p.y < this.h - 80) return;
    const c = this.ctx;
    const cx = this.w / 2, cy = this.h / 2;
    const ang = Math.atan2((p.visible ? p.y : cy - 200) - cy, (p.visible ? p.x : cx + 200) - cx);
    const r = Math.min(this.w, this.h) * 0.34;
    const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
    c.save();
    c.fillStyle = 'rgba(201,138,255,0.75)';
    c.beginPath();
    c.moveTo(x + Math.cos(ang) * 7, y + Math.sin(ang) * 7);
    c.lineTo(x + Math.cos(ang + 2.4) * 5, y + Math.sin(ang + 2.4) * 5);
    c.lineTo(x + Math.cos(ang - 2.4) * 5, y + Math.sin(ang - 2.4) * 5);
    c.closePath(); c.fill();
    c.restore();
  }
}

function h2px(h) { return h / 900 * 9; }
const cxOf = (w) => w / 2;
const is = {};
function wrapHudText(ctx, text, maxW) {
  const words = String(text || '').split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; }
    else line = t;
  }
  if (line) lines.push(line);
  return lines.length ? lines.slice(0, 2) : [''];
}

function fitHudText(ctx, text, maxW) {
  let t = String(text || '');
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 4 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

export function hudSlotsOverlap(slots) {
  const items = (slots && slots.items) || [];
  const hits = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
        hits.push([a.id, b.id]);
      }
    }
  }
  return hits;
}
