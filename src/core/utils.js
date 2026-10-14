// ============================================================================
//  Small math / formatting helpers
// ============================================================================

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
export const smootherstep = (t) => { const x = clamp(t, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); };
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

const ROMAN = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];
export function toRoman(n) {
  if (n <= 0) return String(n);
  let out = '';
  for (const [v, s] of ROMAN) { while (n >= v) { out += s; n -= v; } }
  return out;
}

export function fmtNum(n, digits = 0) {
  if (!isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e4) return Math.round(n).toLocaleString('en-US');
  return n.toFixed(digits);
}

export function fmtCredits(n) {
  n = Math.round(n);
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + ' B';
  if (a >= 1e6) return (n / 1e6).toFixed(2) + ' M';
  if (a >= 1e4) return (n / 1e3).toFixed(1) + ' K';
  return n.toLocaleString('en-US');
}

// 1 world unit == 1 km in-fiction
export function fmtDist(d) {
  d = Math.abs(d);
  if (d < 1) return (d * 1000).toFixed(0) + ' m';
  if (d < 1000) return d.toFixed(1) + ' km';
  if (d < 1e6) return (d / 1000).toFixed(2) + ' Mm';
  if (d < 1e9) return (d / 1e6).toFixed(2) + ' Gm';
  return (d / 1e9).toFixed(2) + ' Tm';
}

export function fmtSpeed(v) {
  return Math.round(Math.abs(v)).toLocaleString('en-US');
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtCoord(v) {
  const f = (x) => (x < 0 ? '-' : '+') + Math.abs(x).toFixed(0).padStart(5, '0');
  return `${f(v.x)} ${f(v.y)} ${f(v.z)}`;
}

let _uid = 0;
export const uid = (p = 'id') => `${p}_${(++_uid).toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
