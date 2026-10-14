// ============================================================================
//  Input: keyboard, mouse-steering, wheel throttle, gamepad (best effort)
// ============================================================================
import { clamp } from './utils.js';

const KEYMAP = {};
const SHIFT_CODES = new Set(['ShiftLeft', 'ShiftRight']);
// macOS InitialKeyRepeat is ~225–375ms (sometimes longer). WKWebView's
// flagsChanged synthesizes Shift keyup while the key is still down, and
// Shift often does not key-repeat. 140ms was too short and boost strobed.
const SHIFT_STICKY_MS = 720;

function isShiftEvent(e) {
  return SHIFT_CODES.has(e.code) || e.key === 'Shift';
}

export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.pressed = new Set();   // edge-triggered, consumed per frame
    // nx/ny: absolute cursor (-1..1, for UI/aim). sx/sy: relative virtual
    // stick — driven by mouse *motion*, springs back to centre when the hand
    // stops, so a cursor parked over a button never spins the ship.
    this.mouse = { x: 0, y: 0, nx: 0, ny: 0, dx: 0, dy: 0, sx: 0, sy: 0, inside: false, locked: false, movedAt: 0 };
    this.buttons = { left: false, right: false, middle: false };
    this.buttonPressed = { left: false, right: false };
    this.wheel = 0;
    this.enabled = true;
    this.steerSensitivity = 1.0;
    this.invertY = false;
    this.useMouseSteer = true;
    this.gpLive = false;
    this.shift = false;
    this._shiftOffAt = 0;
    this._nativeShift = null;
    this._nativeMouse = false;

    this._bind();
    if (typeof window.__astralisNativeShift === 'boolean') {
      this._nativeShift = window.__astralisNativeShift;
      if (this._nativeShift) this._latchShift();
    }
  }

  _bind() {
    const d = this.dom;

    window.__astralisShift = (down) => {
      this._nativeShift = !!down;
      window.__astralisNativeShift = this._nativeShift;
      if (down) this._latchShift();
      else {
        this.shift = false;
        this._shiftOffAt = 0;
        this.keys.delete('ShiftLeft');
        this.keys.delete('ShiftRight');
      }
    };

    // Native host (WKWebView / WebView2) pushes raw deltas after mouse:lock —
    // unlimited turn, no screen-edge stop.
    window.__astralisMouseDelta = (dx, dy) => {
      if (!this.enabled) return;
      const r = (d.canvasWrap || document.body).getBoundingClientRect();
      const k = 1 / Math.max(90, r.width * 0.14);
      this.mouse.dx += dx;
      this.mouse.dy += dy;
      this.mouse.sx = clamp(this.mouse.sx + dx * k, -1, 1);
      this.mouse.sy = clamp(this.mouse.sy + dy * k, -1, 1);
      this.mouse.movedAt = performance.now();
      this.mouse.locked = true;
      this._nativeMouse = true;
    };
    window.__astralisMouseCapture = (on) => {
      this._nativeMouse = !!on;
      this.mouse.locked = !!on;
      if (!on) this.centerStick();
    };

    window.addEventListener('keydown', (e) => {
      const c = e.code;
      const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
      // Do not preventDefault on Shift — WKWebView then pulses a fake keyup
      // and boost strobes while the key is physically held.
      const isMod = SHIFT_CODES.has(c) || c === 'AltLeft' || c === 'AltRight'
        || c === 'MetaLeft' || c === 'MetaRight' || c === 'ControlLeft' || c === 'ControlRight';
      if (!typing && !e.metaKey && !e.ctrlKey && !isMod) e.preventDefault();
      if (!this.keys.has(c)) this.pressed.add(c);
      this.keys.add(c);
      this._noteShift(e, false);
    }, { passive: false, capture: true });

    window.addEventListener('keyup', (e) => {
      if (isShiftEvent(e)) {
        // Keep Shift in `keys` until sticky expires. WebKit keyup is a lie.
        this._noteShift(e, true);
        return;
      }
      this.keys.delete(e.code);
      this._noteShift(e, true);
    }, { capture: true });
    window.addEventListener('blur', () => this._clearShift(true));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._clearShift(true);
    });

    const target = d.canvasWrap || window;
    if (d.canvasWrap && d.canvasWrap.tabIndex < 0) d.canvasWrap.tabIndex = 0;
    const onPointer = (e) => {
      try { (d.canvasWrap || document.body).focus(); } catch { /* ignore */ }
      if (e) this._noteShift(e, false);
    };
    target.addEventListener('pointerdown', onPointer);
    window.addEventListener('mousemove', (e) => {
      const r = (d.canvasWrap || document.body).getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
      this.mouse.nx = r.width > 1 ? (this.mouse.x / r.width) * 2 - 1 : 0;
      this.mouse.ny = r.height > 1 ? (this.mouse.y / r.height) * 2 - 1 : 0;
      this.mouse.inside = this.mouse.x >= 0 && this.mouse.y >= 0 && this.mouse.x <= r.width && this.mouse.y <= r.height;
      // When native mouse capture is live, deltas arrive via __astralisMouseDelta.
      if (this._nativeMouse) {
        this._noteShift(e, false);
        return;
      }
      const mx = e.movementX || 0, my = e.movementY || 0;
      this.mouse.dx += mx;
      this.mouse.dy += my;
      const k = 1 / Math.max(90, r.width * 0.14);
      this.mouse.sx = clamp(this.mouse.sx + mx * k, -1, 1);
      this.mouse.sy = clamp(this.mouse.sy + my * k, -1, 1);
      this.mouse.movedAt = performance.now();
      this._noteShift(e, false);
    });
    document.addEventListener('pointerlockchange', () => {
      if (this._nativeMouse) return;
      this.mouse.locked = document.pointerLockElement === (d.canvasWrap || null) && !!d.canvasWrap;
      if (!this.mouse.locked) { this.mouse.sx = 0; this.mouse.sy = 0; }
    });

    target.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      this._noteShift(e, false);
      if (e.button === 0) { this.buttons.left = true; this.buttonPressed.left = true; }
      if (e.button === 2) { this.buttons.right = true; this.buttonPressed.right = true; }
      if (e.button === 1) this.buttons.middle = true;
    });
    window.addEventListener('mouseup', (e) => {
      this._noteShift(e, false);
      if (e.button === 0) this.buttons.left = false;
      if (e.button === 2) this.buttons.right = false;
      if (e.button === 1) this.buttons.middle = false;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.wheel += clamp(-e.deltaY, -160, 160) / 160;
      this._noteShift(e, false);
    }, { passive: false });
  }

  _latchShift() {
    this.shift = true;
    this._shiftOffAt = 0;
    this.keys.add('ShiftLeft');
  }

  _armShiftOff() {
    if (this._shiftOffAt <= 0) this._shiftOffAt = Math.max(1, performance.now());
  }

  _clearShift(allKeys) {
    this.shift = false;
    this._shiftOffAt = 0;
    if (this._nativeShift != null) this._nativeShift = false;
    this.keys.delete('ShiftLeft');
    this.keys.delete('ShiftRight');
    if (allKeys) {
      this.keys.clear();
      this.buttons.left = this.buttons.right = false;
      this.centerStick();
    }
  }

  _noteShift(e, isKeyUp) {
    const shiftCode = isShiftEvent(e);
    const bit = !!(e.shiftKey || (e.getModifierState && e.getModifierState('Shift')));
    if (bit || (shiftCode && !isKeyUp)) {
      // A live shiftKey bit beats a stale native-false (async evaluateJavaScript).
      if (bit && this._nativeShift === false) this._nativeShift = true;
      this._latchShift();
      if (SHIFT_CODES.has(e.code)) this.keys.add(e.code);
      return;
    }
    if (this._nativeShift === true) { this._latchShift(); return; }
    if (this._nativeShift === false) {
      this.shift = false;
      this._shiftOffAt = 0;
      this.keys.delete('ShiftLeft');
      this.keys.delete('ShiftRight');
      return;
    }
    if (shiftCode && isKeyUp) this._armShiftOff();
  }

  down(code) {
    if (!this.enabled) return false;
    if (code === 'ShiftLeft' || code === 'ShiftRight') {
      if (this._nativeShift === true) return true;
      if (this._nativeShift === false) return false;
      return this.shift;
    }
    return this.keys.has(code);
  }
  hit(code) { return this.pressed.has(code); }
  anyDown(...codes) { return codes.some((c) => this.keys.has(c)); }

  /** analog axis -1..1 with keyboard smoothing */
  axis(negCode, posCode, state, dt, rate = 6) {
    let target = 0;
    if (this.keys.has(negCode)) target -= 1;
    if (this.keys.has(posCode)) target += 1;
    state.v = clamp(state.v + (target - state.v) * clamp(rate * dt, 0, 1), -1, 1);
    if (Math.abs(state.v) < 0.001) state.v = 0;
    return state.v;
  }

  gamepad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  /** call once per frame: relaxes the virtual stick toward centre */
  relaxStick(dt) {
    const idle = performance.now() - this.mouse.movedAt;
    const captured = this.mouse.locked || this._nativeMouse;
    const rate = captured
      ? (idle < 90 ? 0.12 : 1.35)
      : (idle < 80 ? 0.45 : 3.8);
    const f = Math.exp(-rate * dt);
    this.mouse.sx *= f; this.mouse.sy *= f;
    if (Math.abs(this.mouse.sx) < 0.002) this.mouse.sx = 0;
    if (Math.abs(this.mouse.sy) < 0.002) this.mouse.sy = 0;
  }

  centerStick() {
    this.mouse.nx = 0; this.mouse.ny = 0;
    this.mouse.sx = 0; this.mouse.sy = 0;
    this.mouse.dx = 0; this.mouse.dy = 0;
  }

  _postNative(msg) {
    try { window.webkit?.messageHandlers?.astralis?.postMessage(msg); } catch { /* mac */ }
    try { window.chrome?.webview?.postMessage(msg); } catch { /* win */ }
  }

  lockPointer() {
    this._postNative('mouse:lock');
    const el = this.dom.canvasWrap;
    if (el && !this.mouse.locked && !this._nativeMouse && el.requestPointerLock) {
      try { el.requestPointerLock(); } catch (_) { /* ignore */ }
    }
  }
  unlockPointer() {
    this._postNative('mouse:unlock');
    this._nativeMouse = false;
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  }

  endFrame() {
    if (this._nativeShift === true) {
      this._latchShift();
    } else if (this._nativeShift === false) {
      this.shift = false;
      this._shiftOffAt = 0;
      this.keys.delete('ShiftLeft');
      this.keys.delete('ShiftRight');
    } else if (this._shiftOffAt > 0 && performance.now() - this._shiftOffAt > SHIFT_STICKY_MS) {
      this.shift = false;
      this.keys.delete('ShiftLeft');
      this.keys.delete('ShiftRight');
      this._shiftOffAt = 0;
    }
    this.pressed.clear();
    this.buttonPressed.left = false;
    this.buttonPressed.right = false;
    this.mouse.dx = 0; this.mouse.dy = 0;
    this.wheel = 0;
  }
}

export { KEYMAP };
