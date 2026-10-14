import * as THREE from '../../vendor/three/three.module.js';

const vert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv; varying vec3 vWorldPos; varying vec3 vLocal;
void main(){
  vUv = uv; vLocal = position;
  vec4 wp = modelMatrix * vec4(position,1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;

const frag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
precision highp float;
varying vec2 vUv; varying vec3 vWorldPos; varying vec3 vLocal;
uniform vec3 uColor, uStarPos, uPlanetPos;
uniform float uDensity, uPlanetRadius, uSpin;
void main(){
  float t = vUv.x;
  float dens = 0.0;
  dens = max(dens, 0.30 * smoothstep(0.01, 0.05, t) * smoothstep(0.24, 0.19, t));
  dens = max(dens, 1.00 * smoothstep(0.21, 0.27, t) * smoothstep(0.56, 0.50, t));
  dens = max(dens, 0.84 * smoothstep(0.63, 0.67, t) * smoothstep(0.91, 0.86, t));
  dens *= 1.0 - 0.95 * (1.0 - smoothstep(0.016, 0.0, abs(t - 0.59)));
  dens *= 1.0 - 0.88 * (1.0 - smoothstep(0.010, 0.0, abs(t - 0.81)));
  dens = max(dens, 0.58 * (1.0 - smoothstep(0.008, 0.0, abs(t - 0.96))));
  dens *= (0.72 + 0.28 * sin(t * 220.0) * sin(t * 71.0));
  // vLocal is object-space — mesh.rotation does not change atan(z,x).
  // Keplerian shear: inner annulus races the outer so spin reads at a glance.
  float az = atan(vLocal.z, vLocal.x) + uSpin * mix(1.42, 0.74, t);
  dens *= 0.62 + 0.38 * (0.52 + 0.48 * sin(az * 4.0 + t * 5.5) * sin(az * 2.0 + 0.85));
  dens *= 0.80 + 0.20 * sin(az * 9.0 + t * 12.0);
  dens *= 0.88 + 0.12 * sin(az * 17.0);
  float spoke = pow(0.5 + 0.5 * sin(az * 3.0 + 0.4), 7.0);
  dens *= 1.0 - 0.28 * spoke * smoothstep(0.16, 0.34, t) * smoothstep(0.74, 0.52, t);
  dens *= smoothstep(0.0, 0.03, t) * smoothstep(1.0, 0.97, t) * uDensity;
  if (dens < 0.01) discard;
  vec3 L = normalize(uStarPos - vWorldPos);
  float lit = abs(dot(vec3(0.0, 1.0, 0.0), L)) * 0.5 + 0.58;
  vec3 toFrag = vWorldPos - uPlanetPos;
  float along = dot(toFrag, L);
  float shadow = 1.0;
  if (along < 0.0) {
    float perp = length(toFrag - L * along);
    shadow = smoothstep(uPlanetRadius * 0.90, uPlanetRadius * 1.16, perp);
  }
  vec3 ice = mix(uColor, vec3(0.96, 0.93, 0.86), 0.5);
  vec3 col = ice * lit * shadow * (0.9 + 0.2 * dens);
  vec3 V = normalize(cameraPosition - vWorldPos);
  col += ice * pow(clamp(dot(-V, L), 0.0, 1.0), 5.0) * 0.5 * shadow;
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(col, clamp(dens, 0.0, 1.0));
  #include <colorspace_fragment>
}`;

export function createTitleRingMaterial(rings, planetRadius) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(rings.color || '#efe6cc') },
      uStarPos: { value: new THREE.Vector3() },
      uPlanetPos: { value: new THREE.Vector3() },
      uPlanetRadius: { value: planetRadius },
      uInner: { value: rings.inner },
      uOuter: { value: rings.outer },
      uDensity: { value: rings.density ?? 1 },
      uSeed: { value: 0.66 },
      uGaps: { value: 3 },
      uSpin: { value: 0 },
    },
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: true,
  });
}
