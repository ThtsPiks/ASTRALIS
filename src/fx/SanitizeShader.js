// ============================================================================
//  SANITIZE — runs right after the scene render, before bloom.
//  Any NaN/Inf pixel (degenerate normalize(), pow(neg), 0/0 in a procedural
//  shader) would otherwise be picked up by the bloom mip chain and smeared
//  into a large black rectangle. Replace non-finite with black, clamp the
//  HDR range so a single hot pixel can't flood a mip either.
// ============================================================================
export const SanitizeShader = {
  name: 'SanitizeShader',
  uniforms: {
    tDiffuse: { value: null },
    uMax: { value: 24.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uMax;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (!(c.r >= 0.0 && c.r <= uMax)) c.r = 0.004;
      if (!(c.g >= 0.0 && c.g <= uMax)) c.g = 0.006;
      if (!(c.b >= 0.0 && c.b <= uMax)) c.b = 0.012;
      if (!(c.a >= 0.0 && c.a <= 1.0)) c.a = 1.0;
      gl_FragColor = c;
    }`,
};
