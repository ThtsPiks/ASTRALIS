// ============================================================================
//  Procedural audio — no sample files. Soft cabin, not arcade buzz.
// ============================================================================
import { clamp, lerp } from './utils.js';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.masterGain = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.engine = null;
    this.noiseBuf = null;
    this.reverb = null;
    this._musicTimer = null;
    this._musicStep = 0;
    this._scale = [0, 2, 3, 5, 7, 9, 10, 12];
    this._root = 55;
    this._intensity = 0.18;
    this.volMaster = 0.72;
    this.volSfx = 0.82;
    this.volMusic = 0.48;
    this._lastLaser = 0;
    this._lastPing = 0;
    this._lastHover = 0;
    this._boostAmt = 0;
  }

  init() {
    if (this.ready) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.noiseBuf = this._makeNoise(8);

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.volMaster;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -22;
    comp.knee.value = 24;
    comp.ratio.value = 1.6;
    comp.attack.value = 0.02;
    comp.release.value = 0.35;
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -8;
    limit.knee.value = 12;
    limit.ratio.value = 3.2;
    limit.attack.value = 0.008;
    limit.release.value = 0.28;
    master.connect(comp);
    comp.connect(limit);
    limit.connect(ctx.destination);

    const sfx = ctx.createGain(); sfx.gain.value = this.volSfx;
    const music = ctx.createGain(); music.gain.value = 0.0001;
    sfx.connect(master);
    music.connect(master);

    const conv = ctx.createConvolver();
    conv.buffer = this._makeImpulse(1.15, 2.8);
    const wet = ctx.createGain(); wet.gain.value = 0.12;
    conv.connect(wet); wet.connect(master);

    this.masterGain = master;
    this.sfxGain = sfx;
    this.musicGain = music;
    this.reverb = conv;
    this._buildEngine();
    this.ready = true;
    return true;
  }

  resume() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    this.startMusic();
    if (!this._visHook) {
      this._visHook = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.ctx?.state === 'suspended') this.ctx.resume();
      });
    }
  }

  setMuted(m) {
    this.muted = !!m;
    this._applyGains();
  }

  setVolumes(master, sfx, music) {
    if (master != null) this.volMaster = clamp(master, 0, 1);
    if (sfx != null) this.volSfx = clamp(sfx, 0, 1);
    if (music != null) this.volMusic = clamp(music, 0, 1);
    this._applyGains();
  }

  _applyGains() {
    if (!this.masterGain || !this.ctx) return;
    const t = this.ctx.currentTime;
    const m = this.muted ? 0 : this.volMaster;
    this._holdSet(this.masterGain.gain, m, t, 0.08);
    if (this.sfxGain) this._holdSet(this.sfxGain.gain, this.volSfx, t, 0.08);
    if (this.musicGain) {
      const mus = this.muted ? 0.0001 : 0.28 * this.volMusic;
      this._holdSet(this.musicGain.gain, Math.max(0.0001, mus), t, 0.12);
    }
  }

  _holdSet(param, value, now, tc) {
    try { param.cancelAndHoldAtTime(now); }
    catch {
      try { param.cancelScheduledValues(now); param.setValueAtTime(param.value, now); }
      catch { /* ignore */ }
    }
    param.setTargetAtTime(value, now, tc);
  }

  _makeImpulse(dur, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  _makeNoise(dur) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + 0.029 * w;
      b1 = 0.985 * b1 + 0.1 * w;
      b2 = 0.95 * b2 + 0.22 * w;
      d[i] = (b0 * 0.55 + b1 * 0.3 + b2 * 0.15) * 1.6;
    }
    // Equal-power crossfade so the loop seam does not click.
    const fade = Math.min(Math.floor(ctx.sampleRate * 0.18), (len / 4) | 0);
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      const a = d[i];
      const b = d[len - fade + i];
      d[i] = b * (1 - t) + a * t;
    }
    for (let i = 0; i < fade; i++) d[len - fade + i] = d[i];
    return buf;
  }

  _noiseSource(loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = loop;
    return s;
  }

  _buildEngine() {
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = 0;
    // Cabin rumble only — no triangle / detuned pair (those scream on laptop speakers).
    const rumble = ctx.createBiquadFilter();
    rumble.type = 'lowpass'; rumble.frequency.value = 90; rumble.Q.value = 0.55;
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 38;
    const sg = ctx.createGain(); sg.gain.value = 0.55;
    const noise = this._noiseSource(true);
    const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 110; nf.Q.value = 0.4;
    const ng = ctx.createGain(); ng.gain.value = 0;
    const air = this._noiseSource(true);
    const af = ctx.createBiquadFilter(); af.type = 'bandpass'; af.frequency.value = 240; af.Q.value = 0.5;
    const ag = ctx.createGain(); ag.gain.value = 0;

    sub.connect(sg); sg.connect(rumble);
    noise.connect(nf); nf.connect(ng); ng.connect(rumble);
    rumble.connect(g);
    air.connect(af); af.connect(ag); ag.connect(g);
    g.connect(this.sfxGain);

    sub.start(); noise.start(); air.start();
    this.engine = { g, rumble, sub, sg, ng, nf, ag, af, noise, air, level: 0 };
  }

  updateEngine(throttle, speedRatio, boost, warp, silent = false) {
    if (!this.ready || !this.engine) return;
    const e = this.engine;
    const t = clamp(throttle, 0, 1.6);
    const hush = silent ? 0.22 : 1;
    this._boostAmt = lerp(this._boostAmt || 0, boost ? 1 : 0, 0.2);
    const b = this._boostAmt;
    const target = this.muted ? 0 : (0.012 + 0.034 * t + 0.012 * speedRatio + 0.016 * b + (warp ? 0.02 : 0)) * hush;
    e.level = lerp(e.level, target, 0.06);
    const now = this.ctx.currentTime;
    if (now - (e._t || 0) < 0.09) return;
    e._t = now;
    this._holdSet(e.g.gain, e.level, now, 0.12);
    this._holdSet(e.sub.frequency, 34 + 18 * t + 4 * b, now, 0.16);
    this._holdSet(e.rumble.frequency, (72 + 55 * clamp(t, 0, 1)) * (silent ? 0.7 : 1), now, 0.16);
    this._holdSet(e.ng.gain, (0.045 + 0.07 * t) * hush, now, 0.16);
    this._holdSet(e.ag.gain, ((0.018 * b) + (warp ? 0.03 : 0) + 0.008 * t) * hush, now, 0.18);
    this._holdSet(e.af.frequency, 220 + 160 * t, now, 0.18);
  }

  _env(node, t0, a, d, peak) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(Math.max(0.0001, peak), t0 + a);
    g.gain.linearRampToValueAtTime(0.0001, t0 + a + d);
    node.connect(g);
    return g;
  }

  _osc(type, f0, f1, t0, dur, peak, dest = this.sfxGain) {
    if (!this.ready || this.muted) return null;
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = this._env(o, t0, Math.min(0.012, dur * 0.22), dur, peak);
    g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.08);
    o.onended = () => { try { o.disconnect(); g.disconnect(); } catch { /* */ } };
    return o;
  }

  _noiseHit(t0, dur, peak, freq, type = 'lowpass', q = 1, dest = this.sfxGain) {
    if (!this.ready || this.muted) return null;
    const s = this._noiseSource(false);
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    s.connect(f);
    const g = this._env(f, t0, 0.006, dur, peak);
    g.connect(dest);
    s.start(t0); s.stop(t0 + dur + 0.08);
    s.onended = () => { try { s.disconnect(); f.disconnect(); g.disconnect(); } catch { /* */ } };
    return { s, f };
  }

  uiClick() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._osc('sine', 420, 280, t, 0.06, 0.028);
  }
  uiHover() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    if (now - this._lastHover < 0.12) return;
    this._lastHover = now;
    this._osc('sine', 520, 640, now, 0.03, 0.008);
  }
  uiBack() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._osc('sine', 280, 180, t, 0.1, 0.03);
  }

  radio(who = '') {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const choir = /CHOIR|UNKNOWN|ECHO|SABLE/i.test(String(who));
    this._noiseHit(t, choir ? 0.22 : 0.07, choir ? 0.035 : 0.02, choir ? 380 : 1600, 'bandpass', choir ? 0.8 : 2.2);
    this._osc('sine', choir ? 110 : 740, choir ? 62 : 420, t, choir ? 0.28 : 0.05, choir ? 0.028 : 0.016);
  }

  laser() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    if (t - this._lastLaser < 0.07) return;
    this._lastLaser = t;
    this._noiseHit(t, 0.045, 0.04, 2200, 'bandpass', 1.6);
    this._osc('sine', 880, 140, t, 0.09, 0.03);
    this._osc('sine', 1760, 320, t, 0.04, 0.012);
  }

  missileLaunch() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const n = this._noiseHit(t, 0.42, 0.11, 480, 'bandpass', 1.1);
    if (n) n.f.frequency.exponentialRampToValueAtTime(1800, t + 0.42);
    this._osc('sine', 140, 420, t, 0.36, 0.055);
  }

  explosion(size = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const vol = clamp(0.22 * Math.min(size, 2.2), 0.06, 0.32);
    this._noiseHit(t, 0.22 * size + 0.18, vol, 900, 'lowpass', 0.8);
    this._noiseHit(t + 0.02, 0.7 * size + 0.3, vol * 0.55, 160, 'lowpass', 0.6);
    this._osc('sine', 90 / Math.max(0.6, size), 32, t, 0.55 * size + 0.25, vol * 0.45);
    this._noiseHit(t, 1.2 * size, vol * 0.22, 500, 'lowpass', 0.5, this.reverb);
  }

  hit() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._noiseHit(t, 0.08, 0.12, 1800, 'bandpass', 1.4);
    this._osc('sine', 210, 70, t, 0.1, 0.05);
  }

  shieldHit() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._osc('sine', 420, 160, t, 0.22, 0.05);
    this._noiseHit(t, 0.14, 0.03, 1400, 'bandpass', 1.2);
  }

  jumpCharge() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._osc('sine', 55, 180, t, 2.1, 0.07);
    this._noiseHit(t, 2.1, 0.028, 180, 'lowpass', 0.8);
  }

  jumpFire() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._osc('sine', 880, 55, t, 1.4, 0.18);
    this._noiseHit(t, 1.1, 0.12, 1400, 'lowpass', 0.7);
    this._noiseHit(t, 1.8, 0.1, 700, 'lowpass', 0.6, this.reverb);
  }

  warpEnter() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._osc('sine', 180, 920, t, 0.65, 0.08);
    this._noiseHit(t, 0.7, 0.05, 360, 'bandpass', 2);
  }
  warpExit() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._osc('sine', 980, 140, t, 0.8, 0.09);
    this._noiseHit(t, 0.85, 0.06, 2200, 'lowpass', 0.8);
  }

  scanPing() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    if (t - this._lastPing < 0.55) return;
    this._lastPing = t;
    this._osc('sine', 740, 520, t, 0.11, 0.028);
    this._osc('sine', 1480, 1040, t, 0.08, 0.01);
  }

  scanComplete() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [0, 3, 7, 10].forEach((s, i) => {
      this._osc('sine', 392 * Math.pow(2, s / 12), 392 * Math.pow(2, s / 12), t + i * 0.11, 0.38, 0.055);
    });
  }

  credits() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._osc('sine', 392, 523, t, 0.12, 0.03);
    this._osc('sine', 523, 659, t + 0.09, 0.16, 0.022);
  }

  alarm() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) this._osc('sine', 280, 210, t + i * 0.38, 0.22, 0.028);
  }

  dock() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._noiseHit(t, 0.18, 0.09, 180, 'lowpass', 0.7);
    this._osc('sine', 70, 42, t, 0.4, 0.1);
    this._osc('sine', 220, 330, t + 0.28, 0.22, 0.04);
    this._osc('sine', 330, 440, t + 0.42, 0.35, 0.035);
  }

  chaff() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._noiseHit(t, 0.28, 0.09, 3200, 'highpass', 0.6);
    this._osc('triangle', 240, 90, t, 0.18, 0.03);
  }

  heatDump() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._noiseHit(t, 0.45, 0.07, 900, 'bandpass', 0.8);
    this._osc('sine', 240, 80, t, 0.4, 0.04);
  }

  gear(down) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    if (t - (this._lastGear || 0) < 0.9) return;
    this._lastGear = t;
    this._osc('sine', down ? 180 : 260, down ? 90 : 200, t, 0.22, 0.05);
    this._noiseHit(t, 0.16, 0.04, 400, 'lowpass', 1);
  }

  startMusic() {
    if (!this.ready || this._scoreOn) return;
    this._scoreOn = true;
    this._bpm = 48;
    this._bar = 0;
    this._nextBar = this.ctx.currentTime + 0.35;
    this._holdSet(this.musicGain.gain, 0.28 * this.volMusic, this.ctx.currentTime, 2.2);
    this._scoreTimer = setInterval(() => this._fillScore(), 200);
    this._fillScore();
  }

  setMusicIntensity(v) { this._intensity = clamp(v, 0, 1); }

  /** Original cabin score. D minor, eight bars, no samples. */
  _fillScore() {
    if (!this.ctx) return;
    if (this.muted) {
      this._nextBar = this.ctx.currentTime + 0.2;
      return;
    }
    const beat = 60 / this._bpm;
    const barDur = beat * 4;
    const horizon = this.ctx.currentTime + 1.4;
    while (this._nextBar < horizon) {
      this._playBar(this._nextBar, this._bar % 8, beat);
      this._nextBar += barDur;
      this._bar++;
    }
  }

  _playBar(t, bar, beat) {
    const D = 146.83;
    const f = (semi, oct = 0) => D * Math.pow(2, semi / 12 + oct);
    const inten = this._intensity || 0;
    const chords = [
      [0, 3, 7],
      [-4, 0, 3],
      [3, 7, 10],
      [-2, 2, 5],
      [0, 3, 7],
      [-5, -1, 2],
      [-4, 0, 5],
      [-2, 2, 7],
    ];
    const ch = chords[bar];
    const pad = 0.008 + 0.006 * inten;
    for (const semi of ch) this._tone(f(semi, 1), t, beat * 7.2, 'sine', pad, 0.85);
    this._tone(f(ch[0], 0), t, beat * 7.2, 'sine', 0.016 + 0.006 * inten, 0.2);
    if (bar % 2 === 0) this._tone(f(12, 1), t + beat * 2, beat * 3.2, 'sine', 0.006 + 0.008 * inten, 0.6);
  }

  _tone(freq, t, dur, type, peak, send = 0.4) {
    if (!this.ready || this.muted || !(freq > 0) || !(dur > 0)) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(180, t);
    lp.frequency.linearRampToValueAtTime(320, t + Math.min(1.2, dur * 0.4));
    lp.frequency.linearRampToValueAtTime(160, t + dur);
    lp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + Math.min(0.18, dur * 0.35));
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.55), t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(this.musicGain);
    if (send > 0 && this.reverb) {
      const sg = ctx.createGain();
      sg.gain.value = send * 0.35;
      g.connect(sg); sg.connect(this.reverb);
    }
    o.start(t); o.stop(t + dur + 0.05);
    o.onended = () => { try { o.disconnect(); lp.disconnect(); g.disconnect(); } catch { /* */ } };
  }

  _tick(t, peak) {
    if (!this.ready || this.muted) return;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + 0.06);
    o.onended = () => { try { o.disconnect(); g.disconnect(); } catch { /* */ } };
  }
  startMining() {
    if (!this.ready || this._mining) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = this._noiseSource(true);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 0.7;
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 2.1;
    const lg = ctx.createGain(); lg.gain.value = 90;
    lfo.connect(lg); lg.connect(f.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.032, t + 0.3);
    s.connect(f); f.connect(g); g.connect(this.sfxGain);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 72;
    const og = ctx.createGain(); og.gain.value = 0.025; o.connect(og); og.connect(g);
    s.start(); lfo.start(); o.start();
    this._mining = { s, lfo, o, g };
  }
  stopMining() {
    if (!this._mining) return;
    const t = this.ctx.currentTime;
    const m = this._mining; this._mining = null;
    m.g.gain.cancelScheduledValues(t);
    try { m.g.gain.cancelAndHoldAtTime(t); } catch { m.g.gain.setValueAtTime(Math.max(0.0001, m.g.gain.value), t); }
    m.g.gain.linearRampToValueAtTime(0.0001, t + 0.22);
    m.s.stop(t + 0.28); m.lfo.stop(t + 0.28); m.o.stop(t + 0.28);
  }
}

export const Audio = new AudioEngine();
