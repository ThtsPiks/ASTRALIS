// ============================================================================
//  PROCEDURAL SPACE MATERIALS  (GLSL)
//  Planets, atmospheres, clouds, rings, stars, nebula skybox, shields.
// ============================================================================
import * as THREE from '../../vendor/three/three.module.js';

export const GLSL_NOISE = /* glsl */ `
vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
}

float fbm3(vec3 p, int oct){
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < 7; i++) {
    if (i >= oct) break;
    s += a * snoise(p);
    n += a;
    p = p * 2.03 + vec3(11.7, 3.1, 7.9);
    a *= 0.5;
  }
  return s / n;
}

float ridged3(vec3 p, int oct){
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    float x = 1.0 - abs(snoise(p));
    s += a * x * x;
    n += a;
    p = p * 2.11 + vec3(5.3, 1.7, 9.1);
    a *= 0.5;
  }
  return s / n;
}

vec3 hash33(vec3 p){
  p = vec3(dot(p, vec3(127.1,311.7,74.7)), dot(p, vec3(269.5,183.3,246.1)), dot(p, vec3(113.5,271.9,124.6)));
  return fract(sin(p) * 43758.5453123);
}
`;

export const TYPE_IDS = {
  lava: 0, barren: 1, rocky: 2, desert: 3, toxic: 4, terra: 5,
  ocean: 6, ice: 7, carbon: 8, gas: 9, icegiant: 10, exotic: 11,
  rust: 12, ash: 13, marsh: 14, salt: 15,
};

// ---------------------------------------------------------------------------
//  PLANET SURFACE
// ---------------------------------------------------------------------------
// shared chunk: noise + terrain heightfield, used by BOTH stages
const PLANET_COMMON = /* glsl */ `
precision highp float;
uniform vec3  uColA, uColB, uColC, uColD;
uniform float uSeed, uTypeF, uTime;
uniform float uSeaLevel, uIceCap, uCraters, uRelief, uContScale, uBands, uStorm;
uniform float uNightLights, uOceanSpec, uGlow, uDisplace, uAurora, uHero;
uniform vec3  uStormPos;
${GLSL_NOISE}

float continent(vec3 p){
  int oct = uHero > 0.5 ? 7 : 5;
  float base = fbm3(p * uContScale + uSeed, oct);
  float warp = fbm3(p * uContScale * 0.55 + uSeed * 2.3 + base * 0.9, uHero > 0.5 ? 5 : 3);
  return base * 0.7 + warp * 0.3;
}
float mountains(vec3 p){ return ridged3(p * uContScale * 3.4 + uSeed * 1.7, uHero > 0.5 ? 6 : 4); }
float craterField(vec3 p, float scale){
  float n1 = snoise(p * scale + uSeed * 3.1);
  float n2 = snoise(p * scale * 2.3 + uSeed * 5.7);
  float r1 = 1.0 - smoothstep(0.0, 0.16, abs(n1));
  float r2 = 1.0 - smoothstep(0.0, 0.13, abs(n2));
  return clamp(r1 * 0.75 + r2 * 0.45, 0.0, 1.0);
}
float surfaceHeight(vec3 p){
  int t = int(uTypeF + 0.5);
  float h = 0.0;
  if (t == 0 || t == 13) { h = (continent(p) * 0.6 + mountains(p) * 0.4) * 0.5; }
  else if (t == 1 || t == 2 || t == 12) { h = continent(p) * 0.55 + craterField(p, uContScale * 5.0) * uCraters * 0.7 + mountains(p) * 0.18; }
  else if (t == 3) { h = continent(p) * 0.45 + snoise(p * uContScale * 18.0 + uSeed) * 0.08 + mountains(p) * 0.25; }
  else if (t == 4) { h = continent(p) * 0.4 + ridged3(p * uContScale * 2.2 + uSeed, 3) * 0.35; }
  else if (t == 5 || t == 6 || t == 14) { float c = continent(p); h = c * 0.85 + max(0.0, c) * mountains(p) * 0.55; }
  else if (t == 15) { h = continent(p) * 0.12 + ridged3(p * uContScale * 8.0 + uSeed, 3) * 0.08; }
  else if (t == 7) { h = continent(p) * 0.6 + craterField(p, uContScale * 4.0) * 0.35 + ridged3(p * uContScale * 6.0 + uSeed, 3) * 0.2; }
  else if (t == 8) { h = continent(p) * 0.5 + ridged3(p * uContScale * 5.0 + uSeed, 4) * 0.4; }
  else if (t == 11) { h = fbm3(p * uContScale * 2.0 + vec3(uTime * 0.02) + uSeed, 5) * 0.7; }
  return h;
}
`;

const planetVert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vLocal;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vObjT1; varying vec3 vObjT2;
varying vec3 vW1; varying vec3 vW2;
${PLANET_COMMON}
void main(){
  vec3 nrm = normalize(position);
  vLocal = nrm;
  vec3 pos = position;
  if (uDisplace > 0.5 && (uTypeF < 8.5 || uTypeF > 11.5)) {
    pos += normal * surfaceHeight(nrm) * uRelief;
  }
  vec3 up = abs(nrm.y) < 0.95 ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0);
  vObjT1 = normalize(cross(up, nrm));
  vObjT2 = cross(nrm, vObjT1);
  vW1 = normalize(mat3(modelMatrix) * vObjT1);
  vW2 = normalize(mat3(modelMatrix) * vObjT2);
  vec4 wp = modelMatrix * vec4(pos, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

const planetFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vLocal;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vObjT1; varying vec3 vObjT2;
varying vec3 vW1; varying vec3 vW2;
uniform vec3  uStarPos, uStarColor, uCamPos;
uniform float uStarIntensity;
${PLANET_COMMON}

// ---- gas giant bands (Jupiter-grade zones, oval GRS, differential rotation)
vec3 gasColor(vec3 p, out float glowAmt){
  glowAmt = 0.0;
  int gt = int(uTypeF + 0.5);
  float ice = gt == 10 ? 1.0 : 0.0;
  float hero = uHero;
  float lat = clamp(p.y, -1.0, 1.0);
  float absLat = abs(lat);

  float lon = atan(p.z, p.x);
  float shear = (1.0 - lat * lat) * (uTime * mix(0.0065, 0.0105, hero));
  float lw = lon + shear;

  int wOct = hero > 0.5 ? 5 : 4;
  float warp = fbm3(vec3(cos(lw) * 2.15, lat * uBands * 0.40, sin(lw) * 2.15) + uSeed, wOct);
  float yb = lat * uBands + warp * mix(1.12, 1.52, hero);

  float belts = sin(yb * 3.14159265);
  belts += 0.30 * sin(yb * 2.18 + uSeed);
  belts += 0.11 * sin(yb * 5.35 + warp * 2.1);
  float b01 = belts * 0.5 + 0.5;

  int tOct = hero > 0.5 ? 6 : 4;
  float turb = fbm3(vec3(cos(lw) * 3.55 + shear * 3.5, yb * 1.32, sin(lw) * 3.55) + uSeed * 1.7, tOct);
  float streak = snoise(vec3(lw * mix(5.5, 9.5, hero), yb * 2.35, uSeed * 0.9));

  vec3 col = mix(uColA, uColB, smoothstep(0.10, 0.46, b01 + turb * 0.10));
  col = mix(col, uColC, smoothstep(0.36, 0.76, b01 + streak * 0.07));
  col = mix(col, uColD, smoothstep(0.66, 1.0, b01) * 0.60);

  float polar = smoothstep(0.46, 0.92, absLat);
  vec3 poleCol = mix(uColA, uColB, 0.38) * mix(0.84, 0.72, ice);
  col = mix(col, poleCol, polar * 0.56);
  col *= 0.90 + 0.12 * b01 + 0.055 * turb;

  float eq = 1.0 - smoothstep(0.0, 0.20, absLat);
  col = mix(col, mix(uColC, uColD, 0.42), eq * mix(0.16, 0.22, hero));

  vec3 sp = normalize(uStormPos);
  vec3 east = cross(sp, vec3(0.0, 1.0, 0.0));
  if (dot(east, east) < 1e-6) east = cross(sp, vec3(1.0, 0.0, 0.0));
  east = normalize(east);
  vec3 north = normalize(cross(east, sp));
  vec3 dlt = p - sp;
  float sd = length(vec2(dot(dlt, east) * 0.46, dot(dlt, north) * 1.42));
  float storm = smoothstep(0.29, 0.032, sd) * uStorm;
  float ang = atan(dot(dlt, north), dot(dlt, east));
  float spiral = 0.5 + 0.5 * sin(ang * 2.15 + sd * 25.0 - uTime * 0.16);
  vec3 spot = mix(vec3(0.58, 0.24, 0.13), vec3(0.84, 0.44, 0.20), spiral);
  if (ice > 0.5) spot = mix(uColC, vec3(0.72, 0.86, 0.95), 0.42);
  col = mix(col, spot, storm * mix(0.52, 0.70, hero) * (0.60 + 0.40 * spiral));
  float collar = smoothstep(0.33, 0.21, sd) * (1.0 - smoothstep(0.19, 0.065, sd));
  col = mix(col, mix(uColD, uColC, 0.22), collar * uStorm * 0.40);

  vec3 sp2 = normalize(vec3(-sp.z, 0.16, sp.x));
  float oval = smoothstep(0.125, 0.022, distance(p, sp2)) * uStorm;
  col = mix(col, mix(uColD, uColC, 0.32), oval * 0.46);

  vec3 sp3 = normalize(vec3(sp.z, 0.11, -sp.x * 0.82));
  float barge = smoothstep(0.105, 0.018, distance(p, sp3)) * uStorm;
  col = mix(col, mix(uColA, uColB, 0.22), barge * 0.38);

  glowAmt = storm * 0.03 * uStorm;
  return col;
}

// ---- terrestrial albedo ---------------------------------------------------
vec3 terrainColor(vec3 p, float h, out float water, out float emis, out float spec){
  water = 0.0; emis = 0.0; spec = 0.05;
  int t = int(uTypeF + 0.5);
  vec3 col;
  float detail = fbm3(p * uContScale * (uHero > 0.5 ? 36.0 : 22.0) + uSeed * 4.4, uHero > 0.5 ? 5 : 3) * (uHero > 0.5 ? 0.22 : 0.18);
  float lat = abs(p.y);

  if (t == 0) { // lava
    float crk = ridged3(p * uContScale * 5.5 + uSeed * 2.2, 4);
    float crack = smoothstep(0.42, 0.78, crk);
    col = mix(uColA, uColB, smoothstep(-0.4, 0.5, h + detail));
    col = mix(col, uColC, crack * 0.55);
    emis = crack * uGlow * (0.75 + 0.35 * sin(uTime * 1.3 + crk * 8.0));
    spec = 0.05;
  } else if (t == 1 || t == 2) { // barren / rocky
    col = mix(uColA, uColB, smoothstep(-0.5, 0.35, h));
    col = mix(col, uColC, smoothstep(0.25, 0.85, h + detail));
    float cr = craterField(p, uContScale * 5.0);
    col *= 1.0 - cr * uCraters * 0.42;
    col = mix(col, uColD, smoothstep(0.62, 0.95, cr * uCraters) * 0.5);
    spec = 0.04;
  } else if (t == 3) { // desert
    col = mix(uColA, uColB, smoothstep(-0.5, 0.4, h));
    col = mix(col, uColC, smoothstep(0.1, 0.8, h + detail * 2.0));
    float dune = snoise(p * uContScale * 26.0 + uSeed) * 0.5 + 0.5;
    col = mix(col, uColD, dune * 0.28);
    col = mix(col, vec3(0.92,0.94,0.98), smoothstep(uIceCap, uIceCap + 0.12, lat) * 0.7);
    spec = 0.05;
  } else if (t == 4) { // toxic
    col = mix(uColA, uColB, smoothstep(-0.5, 0.4, h + detail));
    col = mix(col, uColC, smoothstep(0.2, 0.9, h));
    float pool = smoothstep(0.05, -0.25, h);
    col = mix(col, vec3(0.72, 0.95, 0.25), pool * 0.75);
    emis = pool * 0.22;
    spec = mix(0.06, 0.7, pool);
  } else if (t == 5) { // terra
    float land = smoothstep(uSeaLevel - 0.012, uSeaLevel + 0.02, h);
    water = 1.0 - land;
    vec3 sea = mix(uColA * 0.45, uColB, smoothstep(uSeaLevel - 0.35, uSeaLevel, h));
    vec3 shore = mix(uColD, uColC, 0.5);
    float moisture = fbm3(p * uContScale * 3.0 + uSeed * 8.0, 4) * 0.5 + 0.5;
    float veg = smoothstep(0.35, 0.62, moisture);
    vec3 green = mix(uColB * 1.05, uColC, veg);
    vec3 landc = mix(shore, green, smoothstep(uSeaLevel + 0.01, uSeaLevel + 0.16, h));
    landc = mix(landc, mix(uColD, vec3(0.62,0.58,0.5), 0.4), smoothstep(0.42, 0.78, h));
    landc = mix(landc, vec3(0.42,0.4,0.36), smoothstep(0.68, 0.95, h));
    col = mix(sea, landc, land);
    col = mix(col, vec3(0.93,0.96,1.0), smoothstep(uIceCap, uIceCap + 0.09, lat + detail * 0.3));
    spec = mix(0.85, 0.06, land);
    if (uNightLights > 0.01) {
      float pop = fbm3(p * uContScale * 9.0 + uSeed * 12.0, 4) * 0.5 + 0.5;
      float lon = atan(p.z, p.x);
      float grid = step(0.72, fract(lon * 28.0)) * step(0.72, fract(p.y * 36.0));
      float city = smoothstep(0.62, 0.78, pop) * land * (1.0 - smoothstep(uIceCap - 0.15, uIceCap + 0.05, lat));
      float flick = 0.82 + 0.18 * sin(uTime * 2.0 + pop * 40.0);
      emis = city * uNightLights * flick * (0.55 + 0.45 * grid);
    }
  } else if (t == 6) { // ocean
    float land = smoothstep(uSeaLevel + 0.16, uSeaLevel + 0.22, h);
    water = 1.0 - land;
    float depth = smoothstep(uSeaLevel - 0.6, uSeaLevel + 0.1, h);
    vec3 sea = mix(uColA, uColB, depth);
    sea = mix(sea, uColC, smoothstep(0.72, 0.98, depth));
    col = mix(sea, mix(uColC, uColD, 0.4), land);
    col = mix(col, vec3(0.95,0.98,1.0), smoothstep(uIceCap, uIceCap + 0.08, lat));
    spec = mix(0.9, 0.08, land);
  } else if (t == 7) { // ice
    col = mix(uColA, uColB, smoothstep(-0.5, 0.4, h + detail));
    col = mix(col, uColC, smoothstep(0.15, 0.8, h));
    float crev = ridged3(p * uContScale * 12.0 + uSeed, 3);
    col = mix(col, uColA * 0.6, smoothstep(0.55, 0.9, crev) * 0.5);
    col = mix(col, uColD, smoothstep(0.5, 0.95, 1.0 - lat));
    spec = 0.45;
  } else if (t == 8) { // carbon
    col = mix(uColA, uColB, smoothstep(-0.5, 0.5, h + detail));
    float glint = smoothstep(0.72, 0.95, mountains(p));
    col = mix(col, uColC, glint * 0.6);
    spec = mix(0.15, 1.0, glint);
    emis = glint * 0.05;
  } else if (t == 12) { // rust / iron
    col = mix(uColA, uColB, smoothstep(-0.45, 0.4, h));
    col = mix(col, uColC, smoothstep(0.15, 0.8, h + detail));
    float cr = craterField(p, uContScale * 4.2);
    col *= 1.0 - cr * 0.38;
    float maria = smoothstep(0.1, -0.4, h);
    col = mix(col, uColA * 0.45, maria * 0.7);
    spec = 0.07;
  } else if (t == 13) { // ash crust
    float crk = ridged3(p * uContScale * 6.2 + uSeed * 2.2, 4);
    float crack = smoothstep(0.64, 0.9, crk);
    col = mix(uColA, uColB, smoothstep(-0.2, 0.75, h));
    col = mix(col, uColD, crack);
    emis = crack * uGlow * 0.45;
    spec = 0.04;
  } else if (t == 14) { // marsh
    float land = smoothstep(0.06, 0.16, h);
    water = 1.0 - land;
    vec3 bog = mix(uColA, uColB, smoothstep(-0.45, 0.15, h));
    vec3 reed = mix(uColC, uColD, smoothstep(0.05, 0.7, h + detail));
    col = mix(bog, reed, land);
    emis = smoothstep(0.02, -0.22, h) * 0.16;
    spec = mix(0.5, 0.07, land);
  } else if (t == 15) { // salt flat
    float pan = smoothstep(-0.2, 0.35, h + detail * 0.25);
    col = mix(uColA, uColB, pan);
    float crack = ridged3(p * uContScale * 16.0 + uSeed, 3);
    col = mix(col, uColC * 0.55, smoothstep(0.72, 0.95, crack) * 0.55);
    col = mix(col, uColD, smoothstep(0.5, 0.92, lat));
    spec = 0.32;
  } else if (t == 11) { // exotic
    float n = fbm3(p * uContScale * 3.0 + vec3(uTime * 0.05) + uSeed, 5);
    col = mix(uColA, uColB, smoothstep(-0.6, 0.6, n));
    col = mix(col, uColC, smoothstep(0.2, 0.9, n));
    float vein = ridged3(p * uContScale * 9.0 + vec3(0.0, uTime * 0.15, 0.0), 4);
    col = mix(col, uColD, smoothstep(0.6, 0.95, vein));
    emis = smoothstep(0.55, 0.95, vein) * uGlow * 1.2 + 0.08;
    spec = 0.6;
  } else { col = uColB; }
  return col;
}

void main(){
  vec3 p = normalize(vLocal);
  int t = int(uTypeF + 0.5);

  float h = 0.0;
  if (t < 9 || t == 11 || t > 11) h = surfaceHeight(p);

  vec3 albedo;
  float water = 0.0, emis = 0.0, spec = 0.05, glowAmt = 0.0;
  if (t == 9 || t == 10) { albedo = gasColor(p, glowAmt); emis = glowAmt; spec = 0.12; }
  else { albedo = terrainColor(p, h, water, emis, spec); }

  float distCam = length(uCamPos - vWorldPos);
  float microFade = 1.0 - smoothstep(90.0, 520.0, distCam);
  if (t != 9 && t != 10) {
    float micro = snoise(p * uContScale * 72.0 + uSeed * 9.1);
    albedo *= 1.0 + micro * 0.045 * microFade;
    if (uHero > 0.5) {
      float fine = fbm3(p * uContScale * 54.0 + uSeed * 6.2, 5);
      albedo *= 1.0 + fine * 0.07 * microFade;
      albedo = mix(albedo, albedo * vec3(1.06, 1.04, 0.98), 0.18);
    }
  } else if (uHero > 0.5) {
    float fine = fbm3(p * 16.5 + uSeed * 6.2, 4);
    albedo *= 1.0 + fine * 0.045;
  }

  // ---- tangent-space normal from height gradient --------------------------
  vec3 N = normalize(vWorldNormal);
  if (uDisplace > 0.5 && (t < 9 || t == 11)) {
    float dhx = dFdx(h), dhy = dFdy(h);
    vec3 dpx = dFdx(p), dpy = dFdy(p);
    vec2 ux = vec2(dot(dpx, vObjT1), dot(dpx, vObjT2));
    vec2 uy = vec2(dot(dpy, vObjT1), dot(dpy, vObjT2));
    float det = ux.x * uy.y - ux.y * uy.x;
    vec2 grad = abs(det) > 1e-14 ? vec2(dhx * uy.y - dhy * ux.y, dhy * ux.x - dhx * uy.x) / det : vec2(0.0);
    float fw = fwidth(h);
    float stable = 1.0 - smoothstep(0.06, 0.22, fw);
    float strength = ((water > 0.5) ? 0.02 : 0.6) * stable;
    grad = clamp(grad * strength, -2.2, 2.2);
    N = normalize(N - (vW1 * grad.x + vW2 * grad.y));
  }

  // ---- lighting -----------------------------------------------------------
  vec3 L = normalize(uStarPos - vWorldPos);
  vec3 V = normalize(uCamPos - vWorldPos);
  float ndl = dot(N, L);
  float diff = clamp(ndl, 0.0, 1.0);
  float wrapBias = (t == 9 || t == 10) ? 0.28 : 0.12;
  float wrap = clamp((ndl + wrapBias) / (1.0 + wrapBias), 0.0, 1.0);
  wrap = pow(wrap, (t == 9 || t == 10) ? 0.70 : 0.85);
  float lightAmt = (t == 9 || t == 10) ? wrap : diff;

  vec3 starCol = uStarColor * uStarIntensity;
  vec3 lit = albedo * starCol * (lightAmt * 0.94 + 0.06);

  vec3 LV = L + V;
  vec3 H = dot(LV, LV) > 1e-8 ? normalize(LV) : N;   // L == -V would be normalize(0) → NaN
  float ndh = max(dot(N, H), 0.0);
  float specPow = mix(220.0, 14.0, spec);
  float specular = pow(ndh, specPow) * spec * lightAmt * (0.35 + 0.65 * water);
  if (t == 9 || t == 10) specular *= 0.32;
  lit += starCol * specular * 1.2;
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.4);
  if (water > 0.45) lit += starCol * fres * 0.42 * water;
  if (t == 9 || t == 10) {
    float scatter = pow(clamp(1.0 - abs(ndl), 0.0, 1.0), 2.6) * smoothstep(-0.28, 0.22, ndl);
    lit += mix(uColB, uColC, 0.45) * starCol * scatter * mix(0.10, 0.16, uHero);
  }

  float night = clamp(-ndl * 1.4, 0.0, 1.0);
  vec3 ambient = albedo * vec3(0.035, 0.045, 0.07) * (1.0 - diff);
  vec3 cityGlow = vec3(1.0, 0.78, 0.42) * emis * (0.25 + night * 1.6);

  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  vec3 rimCol = uColD * rim * 0.2 * (0.35 + wrap);

  vec3 aurora = vec3(0.0);
  if (uAurora > 0.01) {
    vec3 np = normalize(vLocal);
    float lat = abs(np.y);
    float band = smoothstep(0.42, 0.7, lat) * smoothstep(0.97, 0.8, lat);
    float curtain = 0.5 + 0.5 * snoise(vec3(np.x * 9.0 + uTime * 0.05, np.z * 9.0 - uTime * 0.03, lat * 6.0));
    curtain = pow(clamp(curtain, 0.0, 1.0), 2.4);
    float rays = 0.6 + 0.4 * snoise(vec3(np.xz * 26.0, uTime * 0.11));
    vec3 aurCol = mix(vec3(0.22, 1.0, 0.55), vec3(0.55, 0.28, 1.0), smoothstep(0.55, 0.92, lat));
    aurora = aurCol * band * curtain * rays * uAurora * (0.18 + night * 1.5) * 0.55;
  }

  vec3 col = lit + ambient + cityGlow + rimCol + aurora;
  col += albedo * emis * 0.35;
  float term = smoothstep(0.28, 0.0, abs(ndl));
  col += uColD * term * ((t == 9 || t == 10) ? mix(0.10, 0.16, uHero) : 0.06);

  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export function createPlanetMaterial(planet, opts = {}) {
  const c = planet.colors || ['#555', '#888', '#bbb', '#eee'];
  const col = (h) => new THREE.Color(h);
  const isGiant = planet.type === 'gas' || planet.type === 'icegiant';
  const uniforms = {
    uColA: { value: col(c[0]) },
    uColB: { value: col(c[1]) },
    uColC: { value: col(c[2]) },
    uColD: { value: col(c[3]) },
    uSeed: { value: (planet.seed % 100000) / 977.0 },
    uTypeF: { value: TYPE_IDS[planet.type] ?? 2 },
    uTime: { value: 0 },
    uStarPos: { value: new THREE.Vector3() },
    uStarColor: { value: new THREE.Color(0xffffff) },
    uStarIntensity: { value: 1.0 },
    uCamPos: { value: new THREE.Vector3() },
    uSeaLevel: { value: planet.type === 'ocean' ? -0.35 : planet.type === 'marsh' ? 0.02 : planet.type === 'terra' ? 0.02 : 0.0 },
    uIceCap: { value: planet.type === 'ice' ? 0.25 : planet.type === 'salt' ? 0.55 : planet.type === 'terra' ? 0.78 : planet.type === 'ocean' || planet.type === 'marsh' ? 0.84 : planet.type === 'desert' ? 0.92 : 0.72 },
    uCraters: { value: planet.type === 'barren' ? 1.0 : planet.type === 'rocky' || planet.type === 'rust' ? 0.8 : planet.type === 'ice' ? 0.4 : planet.type === 'lava' || planet.type === 'ash' ? 0.25 : planet.type === 'salt' ? 0.08 : 0.25 },
    uRelief: { value: isGiant ? 0.0 : planet.type === 'salt' ? 0.018 : (planet.radius > 150 ? 0.03 : 0.045) },
    uContScale: { value: isGiant ? 1.0 : (planet.type === 'terra' || planet.type === 'ocean' ? 1.9 : 2.6) },
    uBands: { value: planet.type === 'gas' ? 12.2 : planet.type === 'icegiant' ? 6.0 : 1.0 },
    uStorm: { value: planet.type === 'gas' ? 1.0 : planet.type === 'icegiant' ? 0.45 : 0.0 },
    uStormPos: { value: new THREE.Vector3(0.6, -0.25, 0.76).normalize() },
    uNightLights: { value: planet.type === 'terra' && planet.hasLife ? 0.85 : planet.type === 'terra' ? 0.0 : 0.0 },
    uAurora: { value: (planet.type === 'terra' && (planet.atmo?.density ?? 0) > 0.25) ? 0.9 : planet.type === 'ice' ? 0.8 : planet.type === 'icegiant' ? 0.55 : planet.type === 'ocean' ? 0.5 : planet.type === 'toxic' ? 0.45 : 0.0 },
    uOceanSpec: { value: 1.0 },
    uGlow: { value: planet.type === 'lava' ? 1.35 : planet.type === 'ash' ? 0.7 : planet.type === 'exotic' ? 1.6 : 0.0 },
    uDisplace: { value: opts.displace === false ? 0.0 : 1.0 },
    uHero: { value: 0.0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: planetVert,
    fragmentShader: planetFrag,
    glslVersion: null,
    transparent: false,
    depthWrite: true,
    depthTest: true,
  });
  mat.userData.planet = planet;
  return mat;
}

// ---------------------------------------------------------------------------
//  TITLE JOVE — 4K baked equirect (once) + lit sphere. Gameplay gas stays.
// ---------------------------------------------------------------------------
const JOVE_BAKE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uSeed;
${GLSL_NOISE}

vec3 pal(float t){
  t = clamp(t, 0.0, 1.0);
  vec3 walnut = vec3(0.095, 0.032, 0.010);
  vec3 russet = vec3(0.28, 0.10, 0.028);
  vec3 ochre  = vec3(0.52, 0.24, 0.055);
  vec3 amber  = vec3(0.70, 0.42, 0.14);
  vec3 cream  = vec3(0.86, 0.68, 0.40);
  vec3 ivory  = vec3(0.94, 0.86, 0.68);
  vec3 c = mix(walnut, russet, smoothstep(0.00, 0.18, t));
  c = mix(c, ochre,  smoothstep(0.14, 0.38, t));
  c = mix(c, amber,  smoothstep(0.34, 0.58, t));
  c = mix(c, cream,  smoothstep(0.52, 0.80, t));
  c = mix(c, ivory,  smoothstep(0.74, 1.00, t));
  return c;
}

float beltWells(float y){
  float d = 0.0;
  d = max(d, 0.96 * exp(-pow((y - 0.205) / 0.068, 2.0)));
  d = max(d, 0.94 * exp(-pow((y + 0.195) / 0.074, 2.0)));
  d = max(d, 0.58 * exp(-pow((y - 0.415) / 0.038, 2.0)));
  d = max(d, 0.54 * exp(-pow((y + 0.455) / 0.036, 2.0)));
  d = max(d, 0.40 * exp(-pow((y - 0.575) / 0.030, 2.0)));
  d = max(d, 0.36 * exp(-pow((y + 0.615) / 0.028, 2.0)));
  d = max(d, 0.22 * exp(-pow((y - 0.105) / 0.022, 2.0)));
  d = max(d, 0.18 * exp(-pow((y + 0.088) / 0.018, 2.0)));
  float polar = smoothstep(0.58, 0.92, abs(y));
  d = mix(d, 0.42, polar * 0.85);
  return clamp(d, 0.0, 1.0);
}

float oval(vec2 p, vec2 c, vec2 r){
  vec2 d = (p - c) / r;
  return length(d);
}

void main(){
  float lon = (vUv.x - 0.5) * 6.28318530718;
  float lat = (vUv.y - 0.5) * 3.14159265359;
  float y0 = sin(lat);
  vec3 p = vec3(cos(lat) * cos(lon), y0, cos(lat) * sin(lon));

  float n1 = fbm3(p * 2.15 + uSeed, 5);
  float n2 = fbm3(p * 5.4 + vec3(uSeed * 1.7, 2.1, -uSeed), 4);
  float n3 = fbm3(vec3(cos(lon) * 3.2, y0 * 6.5, sin(lon) * 3.2) + uSeed * 0.9, 4);

  float y = y0;
  y += n1 * 0.048;
  y += n2 * 0.016;

  float festN = y0 - 0.125;
  float festMask = exp(-pow(festN / 0.055, 2.0));
  float kh = lon * 8.4 + n1 * 2.6 + uSeed;
  float hook = pow(clamp(sin(kh) * 0.5 + 0.35, 0.0, 1.0), 2.4);
  y -= hook * festMask * 0.062;

  float festS = y0 + 0.118;
  float festMaskS = exp(-pow(festS / 0.050, 2.0));
  float ks = lon * 7.1 - n1 * 2.1 + 1.7;
  float hookS = pow(clamp(sin(ks) * 0.5 + 0.28, 0.0, 1.0), 2.2);
  y += hookS * festMaskS * 0.048;

  float wells = beltWells(y);
  float edge = 1.0 - smoothstep(0.0, 0.16, abs(wells - 0.42));
  float billow = n2 * 0.55 + n3 * 0.45;
  wells = clamp(wells + edge * billow * 0.28, 0.0, 1.0);

  float zone = 1.0 - wells;
  float eq = 1.0 - smoothstep(0.0, 0.16, abs(y0));
  zone = clamp(zone + eq * 0.12, 0.0, 1.0);

  float fil = snoise(vec3(lon * 22.0, y * 70.0, uSeed * 0.4));
  fil += 0.45 * snoise(vec3(lon * 48.0, y * 150.0, uSeed + 3.1));
  fil += 0.22 * snoise(vec3(lon * 90.0, y * 280.0, uSeed * 2.2));
  float filament = fil * 0.5 + 0.5;

  vec3 col = pal(zone * 0.82 + 0.10 + filament * 0.08 - wells * 0.06);
  col *= 0.90 + 0.16 * filament;
  col = mix(col, pal(zone * 0.55), edge * 0.18 * (0.5 + billow));

  float polar = smoothstep(0.52, 0.88, abs(y0));
  vec3 pole = mix(vec3(0.22, 0.13, 0.07), vec3(0.42, 0.28, 0.14), 0.45 + 0.3 * n2);
  col = mix(col, pole, polar * 0.72);
  float mott = fbm3(p * 7.5 + uSeed * 2.4, 4);
  col = mix(col, col * vec3(0.82, 0.78, 0.72), polar * (0.25 + 0.35 * mott));

  float dlon = 0.0;
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float blon = fract(0.07 + fi * 0.173 + uSeed * 0.01) * 6.28318530718 - 3.14159265359;
    float blat = mix(-0.34, 0.32, fract(fi * 0.41 + 0.18));
    if (abs(blat) < 0.07) blat += 0.12 * sign(blat + 0.001);
    dlon = atan(sin(lon - blon), cos(lon - blon));
    float od = oval(vec2(dlon, y0), vec2(0.0, blat), vec2(0.11 + 0.04 * fract(fi * 1.7), 0.028 + 0.01 * fract(fi * 2.3)));
    float ov = smoothstep(1.0, 0.38, od);
    vec3 barge = mix(vec3(0.16, 0.06, 0.02), vec3(0.38, 0.16, 0.05), fract(fi * 0.27));
    vec3 wo = mix(vec3(0.90, 0.82, 0.64), vec3(0.78, 0.62, 0.38), 0.35);
    vec3 sc = (i < 5) ? barge : wo;
    col = mix(col, sc, ov * mix(0.55, 0.82, float(i < 5)));
  }

  // Great Red Spot — oval, salmon, pale collar, internal spiral. Not a red disc.
  float glon = 0.42;
  float glat = -0.34;
  dlon = atan(sin(lon - glon), cos(lon - glon));
  vec2 gp = vec2(dlon / 0.195, (y0 - glat) / 0.078);
  float gd = length(gp);
  float gbody = smoothstep(1.05, 0.42, gd);
  float gcore = smoothstep(0.55, 0.12, gd);
  float gang = atan(gp.y, gp.x);
  float gspiral = 0.5 + 0.5 * sin(gang * 2.35 + gd * 9.5 - n3 * 1.4);
  vec3 gcol = mix(vec3(0.42, 0.16, 0.07), vec3(0.70, 0.32, 0.12), gspiral);
  gcol = mix(gcol, vec3(0.55, 0.22, 0.08), gcore * 0.45);
  col = mix(col, gcol, gbody * 0.88);
  float collar = smoothstep(1.22, 0.92, gd) * (1.0 - smoothstep(0.92, 0.58, gd));
  col = mix(col, vec3(0.90, 0.80, 0.58), collar * 0.55);
  float wake = exp(-pow((y0 - glat) / 0.09, 2.0)) * exp(-pow((dlon - 0.22) / 0.28, 2.0));
  col = mix(col, pal(0.72), wake * 0.22);

  float oaLon = glon + 1.15;
  float d2 = oval(vec2(atan(sin(lon - oaLon), cos(lon - oaLon)), y0), vec2(0.0, -0.48), vec2(0.09, 0.032));
  col = mix(col, vec3(0.92, 0.86, 0.70), smoothstep(1.0, 0.4, d2) * 0.7);

  float grain = snoise(p * 48.0 + uSeed);
  col *= 1.0 + grain * 0.045;
  col = clamp(col, 0.0, 1.15);

  float h = zone * 0.55 + filament * 0.35 + gbody * 0.25;
  gl_FragColor = vec4(col, clamp(h, 0.0, 1.0));
}
`;

let _joveRT = null;

export function bakeTitleJoveTexture(renderer) {
  if (_joveRT) return _joveRT.texture;
  const max = renderer.capabilities.maxTextureSize || 4096;
  const w = Math.min(4096, max);
  const h = Math.max(512, w / 2);
  const target = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: true,
    depthBuffer: false,
    stencilBuffer: false,
    type: THREE.UnsignedByteType,
  });
  target.texture.colorSpace = THREE.LinearSRGBColorSpace;
  target.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 8);
  target.texture.wrapS = THREE.RepeatWrapping;
  target.texture.wrapT = THREE.ClampToEdgeWrapping;
  target.texture.needsUpdate = true;

  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSeed: { value: 17.31 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: JOVE_BAKE_FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  scene.add(mesh);

  const prevTarget = renderer.getRenderTarget();
  const prevTone = renderer.toneMapping;
  const prevXR = renderer.xr.enabled;
  renderer.xr.enabled = false;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setRenderTarget(target);
  renderer.render(scene, cam);
  renderer.setRenderTarget(prevTarget);
  renderer.toneMapping = prevTone;
  renderer.xr.enabled = prevXR;

  mat.dispose();
  mesh.geometry.dispose();
  _joveRT = target;
  return target.texture;
}

const titleJoveVert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vLocal;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec2 vUv;
void main(){
  vLocal = normalize(position);
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

const titleJoveFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vLocal;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec2 vUv;
uniform sampler2D uMap;
uniform vec3 uStarPos, uStarColor, uCamPos;
uniform float uStarIntensity, uTime;
void main(){
  vec4 s = texture2D(uMap, vUv);
  vec3 albedo = s.rgb;
  float h = s.a;

  vec3 N = normalize(vWorldNormal);
  vec3 dpdx = dFdx(vWorldPos);
  vec3 dpdy = dFdy(vWorldPos);
  float bh = 2.4;
  N = normalize(N - normalize(dpdx) * dFdx(h) * bh - normalize(dpdy) * dFdy(h) * bh);

  vec3 L = normalize(uStarPos - vWorldPos);
  vec3 V = normalize(uCamPos - vWorldPos);
  float ndl = dot(N, L);
  float wrap = clamp((ndl + 0.08) / 1.08, 0.0, 1.0);
  wrap = pow(wrap, 0.92);
  float night = smoothstep(0.12, -0.18, ndl);

  vec3 starCol = uStarColor * uStarIntensity;
  vec3 lit = albedo * starCol * (wrap * 1.05 + 0.03);

  vec3 H = normalize(L + V);
  float lum = dot(albedo, vec3(0.30, 0.52, 0.18));
  float specMask = smoothstep(0.38, 0.72, lum);
  float spec = pow(max(dot(N, H), 0.0), 42.0) * specMask * wrap * 0.16;
  lit += starCol * spec;

  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.8);
  float scatter = pow(clamp(1.0 - abs(ndl), 0.0, 1.0), 2.4) * smoothstep(-0.18, 0.28, ndl);
  vec3 cyan = vec3(0.62, 0.90, 1.0);
  lit += cyan * starCol * (fres * 0.26 + scatter * 0.16);

  float term = smoothstep(0.22, 0.0, abs(ndl));
  lit += cyan * term * 0.12;

  vec3 ambient = albedo * vec3(0.018, 0.016, 0.022);
  vec3 col = mix(lit + ambient, albedo * vec3(0.012, 0.010, 0.014), night * 0.92);

  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export function createTitleJoveMaterial(map) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uTime: { value: 0 },
      uStarPos: { value: new THREE.Vector3() },
      uStarColor: { value: new THREE.Color(1.0, 0.94, 0.82) },
      uStarIntensity: { value: 1.38 },
      uCamPos: { value: new THREE.Vector3() },
      uHero: { value: 1 },
      uTypeF: { value: 9 },
    },
    vertexShader: titleJoveVert,
    fragmentShader: titleJoveFrag,
    transparent: false,
    depthWrite: true,
    depthTest: true,
  });
  mat.userData.titleJove = true;
  return mat;
}

// ---------------------------------------------------------------------------
//  ATMOSPHERE (fresnel glow shell)
// ---------------------------------------------------------------------------
const atmoVert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWorldPos; varying vec3 vWorldNormal;
void main(){
  vec4 wp = modelMatrix * vec4(position,1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;
const atmoFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
precision highp float;
varying vec3 vWorldPos; varying vec3 vWorldNormal;
uniform vec3 uColor, uStarPos, uCamPos;
uniform float uDensity, uPower, uIntensity, uTime;
${GLSL_NOISE}
void main(){
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 L = normalize(uStarPos - vWorldPos);
  float fres = pow(clamp(1.0 - abs(dot(N, V)), 0.0, 1.0), uPower);
  float lit = clamp(dot(N, L) * 0.75 + 0.35, 0.0, 1.2);
  // scattering brightens the limb toward the star
  float forward = pow(clamp(dot(-V, L) * 0.5 + 0.5, 0.0, 1.0), 2.0);
  float band = 0.85 + 0.15 * snoise(vWorldPos * 0.004 + vec3(uTime * 0.02));
  float a = fres * uDensity * lit * band * (1.0 + forward * 0.72);
  float coolBias = clamp((uColor.b - uColor.r) * 1.8 + 0.15, 0.0, 1.0);
  vec3 rayleigh = mix(uColor, vec3(0.35, 0.55, 1.0), 0.28 * coolBias);
  vec3 col = mix(uColor, rayleigh, forward * 0.45 * coolBias) * a * uIntensity;
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  #include <colorspace_fragment>
}`;

export function createAtmosphereMaterial(planet, starColor = 0xffffff) {
  const a = planet.atmo;
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(a.color) },
      uStarPos: { value: new THREE.Vector3() },
      uCamPos: { value: new THREE.Vector3() },
      uDensity: { value: a.density * 1.15 },
      uPower: { value: planet.type === 'gas' || planet.type === 'icegiant' ? 2.2 : 2.8 },
      uIntensity: { value: 1.5 },
      uTime: { value: 0 },
    },
    vertexShader: atmoVert,
    fragmentShader: atmoFrag,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}

// ---------------------------------------------------------------------------
//  CLOUDS
// ---------------------------------------------------------------------------
const cloudFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
precision highp float;
varying vec3 vLocal; varying vec3 vWorldPos; varying vec3 vWorldNormal;
uniform vec3 uColor, uStarPos, uCamPos, uStarTint;
uniform float uCover, uSeed, uTime, uDensity, uSwirl, uCheap;
${GLSL_NOISE}
void main(){
  vec3 p = normalize(vLocal);
  vec3 q = p * 2.6 + vec3(uTime * 0.006, 0.0, uTime * 0.002);
  int wOct = uCheap > 0.5 ? 2 : 3;
  int nOct = uCheap > 0.5 ? 3 : 6;
  float warp = fbm3(q * 1.7 + uSeed, wOct);
  float n = fbm3(q + warp * uSwirl + uSeed, nOct);
  n = n * 0.5 + 0.5;
  float cov = smoothstep(1.0 - uCover, 1.0 - uCover + 0.22, n);
  if (cov < 0.004) discard;
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uStarPos - vWorldPos);
  float diff = clamp(dot(N, L) * 0.85 + 0.22, 0.05, 1.15);
  // self-shadow darkening on the trailing edge
  float thickness = smoothstep(0.2, 0.9, n);
  vec3 col = uColor * diff * uStarTint * mix(0.72, 1.0, thickness);
  float a = cov * uDensity;
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;
const cloudVert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vLocal; varying vec3 vWorldPos; varying vec3 vWorldNormal;
void main(){
  vLocal = normalize(position);
  vec4 wp = modelMatrix * vec4(position,1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;

export function createCloudMaterial(planet) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(planet.cloudColor || '#ffffff') },
      uStarPos: { value: new THREE.Vector3() },
      uCamPos: { value: new THREE.Vector3() },
      uStarTint: { value: new THREE.Color(0xffffff) },
      uCover: { value: planet.clouds },
      uSeed: { value: ((planet.cloudSeed || planet.seed) % 100000) / 911.0 },
      uTime: { value: 0 },
      uDensity: { value: planet.type === 'toxic' ? 0.95 : 0.85 },
      uSwirl: { value: planet.type === 'toxic' ? 1.1 : 0.55 },
      uCheap: { value: 0.0 },
    },
    vertexShader: cloudVert,
    fragmentShader: cloudFrag,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}

// ---------------------------------------------------------------------------
//  RINGS
// ---------------------------------------------------------------------------
export function createRingGeometry(inner, outer, segments = 256, rings = 3) {
  const geo = new THREE.BufferGeometry();
  const pos = [], uv = [], idx = [];
  for (let r = 0; r <= rings; r++) {
    const rad = inner + ((outer - inner) * r) / rings;
    const t = r / rings;
    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      pos.push(Math.cos(a) * rad, 0, Math.sin(a) * rad);
      uv.push(t, s / segments);
    }
  }
  const stride = segments + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * stride + s, b = a + 1, c = a + stride, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  geo.setIndex(idx);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}

const ringVert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv; varying vec3 vWorldPos; varying vec3 vLocal;
void main(){
  vUv = uv;
  vLocal = position;
  vec4 wp = modelMatrix * vec4(position,1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;
const ringFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
precision highp float;
varying vec2 vUv; varying vec3 vWorldPos; varying vec3 vLocal;
uniform vec3 uColor, uStarPos, uPlanetPos;
uniform float uInner, uOuter, uDensity, uSeed, uGaps, uPlanetRadius;
${GLSL_NOISE}
void main(){
  float t = vUv.x;
  // radial structure
  float n = fbm3(vec3(t * 60.0, uSeed, uSeed * 0.5), 4);
  float fine = snoise(vec3(t * 420.0, uSeed * 2.0, 0.0));
  float dens = smoothstep(-0.35, 0.55, n * 0.75 + fine * 0.35);
  // Cassini-like gaps
  for (int i = 0; i < 4; i++) {
    if (float(i) >= uGaps) break;
    float gpos = fract(uSeed * 0.137 + float(i) * 0.31);
    float gw = 0.02 + 0.035 * fract(uSeed * 0.71 + float(i));
    dens *= 1.0 - smoothstep(gw, 0.0, abs(t - gpos)) * 0.92;
  }
  // edge fade
  dens *= smoothstep(0.0, 0.05, t) * smoothstep(1.0, 0.93, t);
  dens *= uDensity;
  float az = atan(vLocal.z, vLocal.x);
  dens *= 0.78 + 0.22 * snoise(vec3(az * 6.0, t * 28.0, uSeed));
  if (dens < 0.006) discard;

  vec3 L = normalize(uStarPos - vWorldPos);
  vec3 N = vec3(0.0, 1.0, 0.0);
  float lit = abs(dot(N, L)) * 0.75 + 0.35;

  // planet shadow
  vec3 toFrag = vWorldPos - uPlanetPos;
  float along = dot(toFrag, L);
  float shadow = 1.0;
  if (along < 0.0) {
    float perp = length(toFrag - L * along);
    shadow = smoothstep(uPlanetRadius * 0.92, uPlanetRadius * 1.25, perp);
  }

  vec3 col = uColor * lit * shadow * mix(0.75, 1.15, fine * 0.5 + 0.5);
  // forward scattering sparkle when backlit
  vec3 V = normalize(cameraPosition - vWorldPos);
  float fwd = pow(clamp(dot(-V, L), 0.0, 1.0), 6.0);
  col += uColor * fwd * 0.35 * shadow;
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(col, clamp(dens, 0.0, 1.0));
  #include <colorspace_fragment>
}`;

export function createRingMaterial(rings, planetRadius) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(rings.color) },
      uStarPos: { value: new THREE.Vector3() },
      uPlanetPos: { value: new THREE.Vector3() },
      uPlanetRadius: { value: planetRadius },
      uInner: { value: rings.inner },
      uOuter: { value: rings.outer },
      uDensity: { value: rings.density },
      uSeed: { value: (rings.seed % 9999) / 137.0 },
      uGaps: { value: rings.gaps },
    },
    vertexShader: ringVert,
    fragmentShader: ringFrag,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

// ---------------------------------------------------------------------------
//  STAR SURFACE
// ---------------------------------------------------------------------------
const starFrag = /* glsl */ `
precision highp float;
varying vec3 vLocal; varying vec3 vWorldNormal; varying vec3 vWorldPos;
uniform vec3 uColor, uColorHot, uCamPos;
uniform float uSeed, uTime, uActivity, uIntensity;
${GLSL_NOISE}
void main(){
  vec3 p = normalize(vLocal);
  vec3 q = p * 5.0 + vec3(uTime * 0.05, uTime * 0.02, 0.0);
  float gran = fbm3(q * 3.2 + uSeed, 5);
  float cells = fbm3(q * 9.0 + uSeed * 2.0, 4);
  float flare = ridged3(p * 2.4 + vec3(uTime * 0.03) + uSeed, 4);
  float v = gran * 0.55 + cells * 0.3 + flare * 0.35 * uActivity;
  v = clamp(v * 1.35 + 0.35, 0.0, 1.6);
  vec3 col = mix(uColor, uColorHot, smoothstep(0.55, 1.25, v));
  col += uColorHot * pow(smoothstep(0.9, 1.5, v), 2.0) * 0.8;
  float spot = smoothstep(0.78, 0.96, ridged3(p * 4.2 + uSeed * 1.7, 3));
  col *= 1.0 - spot * 0.28 * uActivity;
  // limb darkening
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(uCamPos - vWorldPos);
  float mu = clamp(dot(N, V), 0.0, 1.0);
  col *= mix(0.45, 1.15, pow(mu, 0.55));
  // prominences at the limb
  float limb = pow(1.0 - mu, 4.0);
  col += uColorHot * limb * (0.4 + 0.6 * flare) * uActivity;
  gl_FragColor = vec4(col * uIntensity, 1.0);
  #include <colorspace_fragment>
}`;
const starVert = /* glsl */ `
varying vec3 vLocal; varying vec3 vWorldNormal; varying vec3 vWorldPos;
void main(){
  vLocal = normalize(position);
  vec4 wp = modelMatrix * vec4(position,1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export function createStarMaterial(star) {
  const c = new THREE.Color(star.color);
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: c.clone().multiplyScalar(0.75) },
      uColorHot: { value: new THREE.Color(0xffffff).lerp(c, 0.35) },
      uCamPos: { value: new THREE.Vector3() },
      uSeed: { value: (star.seed % 9999) / 211.0 },
      uTime: { value: 0 },
      uActivity: { value: star.type === 'RG' ? 1.4 : star.type === 'M' ? 1.2 : star.type === 'B' ? 0.9 : 0.7 },
      uIntensity: { value: 2.1 },
    },
    vertexShader: starVert,
    fragmentShader: starFrag,
  });
}

// ---------------------------------------------------------------------------
//  CORONA / GLOW SPRITE
// ---------------------------------------------------------------------------
export function makeGlowTexture(size = 256, power = 2.2, core = 0.0) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  // Falloff dies inside the quad so bloom mips never pick up square corners.
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.42);
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const a = Math.pow(1 - t, power) * (1 - core) + (t < 0.06 ? core : 0);
    grd.addColorStop(t, `rgba(255,255,255,${a.toFixed(4)})`);
  }
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let _panelMaps;
export function hullPanelMaps() {
  if (_panelMaps) return _panelMaps;
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#d4d0c8';
  g.fillRect(0, 0, size, size);
  g.strokeStyle = 'rgba(20,24,32,0.28)';
  g.lineWidth = 2;
  for (let i = 0; i <= 16; i++) {
    g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, size); g.stroke();
    g.beginPath(); g.moveTo(0, i * 32); g.lineTo(size, i * 32); g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,0.16)';
  for (let y = 6; y < size; y += 32) {
    for (let x = 6; x < size; x += 32) g.fillRect(x, y, 3, 3);
  }
  g.strokeStyle = 'rgba(255,255,255,0.08)';
  g.lineWidth = 1;
  for (let i = 0; i < 48; i++) {
    g.beginPath();
    g.moveTo(Math.random() * size, Math.random() * size);
    g.lineTo(Math.random() * size, Math.random() * size);
    g.stroke();
  }
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3.5, 3.5);
  map.anisotropy = 8;
  map.colorSpace = THREE.SRGBColorSpace;

  const rc = document.createElement('canvas');
  rc.width = rc.height = size;
  const rg = rc.getContext('2d');
  const src = g.getImageData(0, 0, size, size);
  const dst = rg.createImageData(size, size);
  for (let i = 0; i < src.data.length; i += 4) {
    const lum = src.data[i];
    // keep the multiplier high: material.roughness * this must stay ≥ ~0.3
    // or the star point light draws pin-sharp white spots on every curve
    const r = 185 + (255 - lum) * 0.3;
    dst.data[i] = dst.data[i + 1] = dst.data[i + 2] = r;
    dst.data[i + 3] = 255;
  }
  rg.putImageData(dst, 0, 0);
  const rough = new THREE.CanvasTexture(rc);
  rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
  rough.repeat.set(3.5, 3.5);
  rough.anisotropy = 4;
  _panelMaps = { map, rough };
  return _panelMaps;
}

let _rockMaps;
export function rockNoiseMaps() {
  if (_rockMaps) return _rockMaps;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = (Math.sin(x * 0.11) * Math.cos(y * 0.09) + Math.sin((x + y) * 0.07)) * 0.5 + 0.5;
      const v = Math.floor(70 + n * 140);
      const i = (y * size + x) * 4;
      img.data[i] = v; img.data[i + 1] = v * 0.92; img.data[i + 2] = v * 0.84; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  const rough = map.clone();
  _rockMaps = { map, rough };
  return _rockMaps;
}

export function createGlowSprite(color, size, opacity = 1, power = 2.4) {
  const tex = makeGlowTexture(256, power);
  const mat = new THREE.SpriteMaterial({
    map: tex, color: new THREE.Color(color), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, opacity,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(size, size, 1);
  return s;
}

// ---------------------------------------------------------------------------
//  NEBULA SKYBOX
// ---------------------------------------------------------------------------
const nebulaFrag = /* glsl */ `
precision highp float;
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vDir;
uniform float uTime, uSeed;
uniform vec3 uTintA, uTintB, uTintC;
uniform float uIntensity;
${GLSL_NOISE}
void main(){
  vec3 d = normalize(vDir);
  // galactic band (faint)
  float band = exp(-pow(abs(d.y * 1.7 + fbm3(d * 1.5 + uSeed, 3) * 0.5), 2.0) * 4.5);
  // large-scale mask: nebulae live in localised patches, not everywhere
  float mask = fbm3(d * 1.15 + uSeed * 0.7, 3) * 0.5 + 0.5;
  mask = smoothstep(0.46, 0.9, mask);
  float n1 = fbm3(d * 2.6 + uSeed, 5) * 0.5 + 0.5;
  float n2 = fbm3(d * 6.5 + uSeed * 2.7 + vec3(0.0, uTime * 0.004, 0.0), 4) * 0.5 + 0.5;
  float n3 = ridged3(d * 3.6 + uSeed * 1.3, 4);
  float cloud = pow(clamp(n1 * 0.72 + n2 * 0.38 - 0.47, 0.0, 1.0), 2.4) * mask;
  float dust  = pow(clamp(1.0 - n3 * 1.35, 0.0, 1.0), 4.0) * mask;

  vec3 col = vec3(0.0035, 0.005, 0.0105);            // deep space base
  col += uTintA * cloud * 0.6;
  col += uTintB * pow(cloud, 2.6) * 0.85;
  col += uTintC * dust * 0.24;
  col += mix(uTintA, vec3(0.72, 0.78, 0.95), 0.6) * band * (0.02 + cloud * 0.18);
  float filament = pow(clamp(ridged3(d * 2.1 + uSeed * 0.4, 3), 0.0, 1.0), 3.2) * mask;
  col += uTintC * filament * 0.18;
  col *= 1.0 - dust * 0.5;
  gl_FragColor = vec4(col * uIntensity, 1.0);
  #include <logdepthbuf_fragment>
  #include <colorspace_fragment>
}`;
const nebulaVert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp.xyz, 1.0);
  #include <logdepthbuf_vertex>
}`;

export function createNebulaMaterial(tint) {
  const t = new THREE.Color(tint);
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: Math.random() * 100 },
      uTintA: { value: t.clone().multiplyScalar(0.72) },
      uTintB: { value: new THREE.Color().setHSL((t.getHSL({}).h + 0.12) % 1, 0.78, 0.52).multiplyScalar(0.7) },
      uTintC: { value: new THREE.Color().setHSL((t.getHSL({}).h + 0.55) % 1, 0.62, 0.46).multiplyScalar(0.55) },
      uIntensity: { value: 1.55 },
    },
    vertexShader: nebulaVert,
    fragmentShader: nebulaFrag,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
}

// ---------------------------------------------------------------------------
//  STARFIELD POINTS
// ---------------------------------------------------------------------------
const starPointVert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aSize;
attribute vec3 aColor;
attribute float aTwinkle;
varying vec3 vColor;
varying float vTw;
uniform float uTime, uPixelRatio, uWarp;
void main(){
  vColor = aColor;
  vTw = aTwinkle;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float tw = 0.75 + 0.25 * sin(uTime * (1.0 + aTwinkle * 3.0) + aTwinkle * 40.0);
  gl_PointSize = min(aSize * tw * uPixelRatio * (1.0 + uWarp * 1.5), 3.2);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;
const starPointFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vColor;
varying float vTw;
uniform float uWarp;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = pow(1.0 - d * 2.0, 2.2);
  vec3 col = vColor * (1.0 + a * 0.6);
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(col * a * (1.0 + uWarp * 0.5), a);
  #include <colorspace_fragment>
}`;

export function createStarfield(count = 14000, radius = 900000) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const twink = new Float32Array(count);
  const palette = [
    new THREE.Color('#ffffff'), new THREE.Color('#cfe0ff'), new THREE.Color('#9db9ff'),
    new THREE.Color('#fff3c9'), new THREE.Color('#ffc46b'), new THREE.Color('#ff9a5c'),
    new THREE.Color('#e6f2ff'), new THREE.Color('#ffd9d0'),
  ];
  let i3 = 0;
  for (let i = 0; i < count; i++) {
    // uniform on sphere, slight galactic band concentration
    let u = Math.random() * 2 - 1;
    if (Math.random() < 0.45) u = (Math.random() * 0.5 - 0.25) + (Math.random() < 0.5 ? -0.1 : 0.1);
    const th = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const r = radius * (0.85 + Math.random() * 0.3);
    pos[i3] = Math.cos(th) * s * r;
    pos[i3 + 1] = u * r;
    pos[i3 + 2] = Math.sin(th) * s * r;
    const c = palette[Math.floor(Math.pow(Math.random(), 1.7) * palette.length)];
    const b = 0.35 + Math.pow(Math.random(), 2.4) * 1.3;
    col[i3] = c.r * b; col[i3 + 1] = c.g * b; col[i3 + 2] = c.b * b;
    size[i] = (0.55 + Math.pow(Math.random(), 6) * 2.6) * 1.25;
    twink[i] = Math.random();
    i3 += 3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aTwinkle', new THREE.BufferAttribute(twink, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }, uWarp: { value: 0 } },
    vertexShader: starPointVert,
    fragmentShader: starPointFrag,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -1000;
  return pts;
}

// ---------------------------------------------------------------------------
//  SHIELD BUBBLE
// ---------------------------------------------------------------------------
export function createShieldMaterial(color = '#59d8ff') {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uHit: { value: 0 },
      uCamPos: { value: new THREE.Vector3() },
      uOpacity: { value: 0.0 },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vLocal; varying vec3 vWorldPos; varying vec3 vWorldNormal;
      void main(){
        vLocal = normalize(position);
        vec4 wp = modelMatrix * vec4(position,1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix)*normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      precision highp float;
      varying vec3 vLocal; varying vec3 vWorldPos; varying vec3 vWorldNormal;
      uniform vec3 uColor, uCamPos; uniform float uTime, uHit, uOpacity;
      ${GLSL_NOISE}
      void main(){
        vec3 V = normalize(uCamPos - vWorldPos);
        if (uOpacity < 0.002) discard;
        float fres = pow(clamp(1.0 - abs(dot(normalize(vWorldNormal), V)), 0.0, 1.0), 2.4);
        float hex = snoise(vLocal * 26.0 + vec3(uTime*0.4));
        float grid = smoothstep(0.72, 0.95, abs(hex));
        float a = (fres * 0.75 + grid * 0.35) * (0.35 + uHit * 1.6) * uOpacity;
        if (!(a >= 0.004)) discard;
        vec3 col = uColor * (1.0 + uHit * 2.0);
        #include <logdepthbuf_fragment>
        gl_FragColor = vec4(col * a * 1.6, clamp(a, 0.0, 1.0));
        #include <colorspace_fragment>
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
  });
}
