// Cinematic grade. Full anamorphic streaks only when uStrength >= 0.7 (ULTRA).
// HIGH uses chroma / unsharp / grain. MEDIUM/LOW leave this pass disabled.
export const DiamondShader = {
  name: 'DiamondShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: { x: 3840, y: 2160 } },
    uStrength: { value: 1 },
    uHeat: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uRes;
    uniform float uStrength;
    uniform float uHeat;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      vec2 res = max(uRes, vec2(1.0));
      vec2 px = 1.0 / res;
      float k = clamp(res.y / 2160.0, 0.42, 1.0);
      float r = length(vUv - 0.5);
      float heat = clamp(uHeat, 0.0, 1.4);
      vec2 warp = vec2(sin((vUv.y + uTime * 9.0) * 40.0), cos((vUv.x - uTime * 7.0) * 28.0)) * heat * 0.0045 * k;
      vec2 ca = (vUv - 0.5) * r * (0.0022 + heat * 0.008) * k + warp;
      vec3 src;
      src.r = texture2D(tDiffuse, vUv + ca).r;
      src.g = texture2D(tDiffuse, vUv).g;
      src.b = texture2D(tDiffuse, vUv - ca).b;

      vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb;
      vec3 s = texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb;
      vec3 e = texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb;
      vec3 w = texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb;
      vec3 blur = (n + s + e + w) * 0.25;
      vec3 col = src + (src - blur) * (0.28 * k);

      vec3 streak = vec3(0.0);
      if (uStrength > 0.68) {
        for (int i = -4; i <= 4; i++) {
          if (i == 0) continue;
          float f = float(i);
          vec3 smp = texture2D(tDiffuse, vUv + vec2(f * px.x * 12.5, 0.0)).rgb;
          float b = max(smp.r, max(smp.g, smp.b));
          float wt = smoothstep(0.78, 1.35, b) / (1.0 + abs(f) * 0.36);
          streak += smp * wt * 1.6;
        }
        col += streak * vec3(0.22, 0.72, 1.0) * (0.04 * k);
        col += streak.gbr * vec3(1.0, 0.28, 0.72) * (0.012 * k);
      }

      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, 1.04);
      col = (col - 0.42) * 1.08 + 0.42;
      col.r = pow(max(col.r, 0.0), 0.96) * 1.03;
      col.g = pow(max(col.g, 0.0), 1.01) * 0.99;
      col.b = pow(max(col.b, 0.0), 0.94) * 1.05;
      col += vec3(0.12, 0.78, 1.0) * pow(max(luma, 0.0), 2.4) * 0.08;
      col += vec3(0.95, 0.16, 0.58) * luma * 0.04;

      vec2 q = vUv * 2.0 - 1.0;
      float vig = smoothstep(1.55, 0.18, length(q * vec2(1.05, 1.0)));
      col *= mix(0.78, 1.0, vig);

      float g = (hash(vUv * res + uTime * 48.0) - 0.5) * (0.008 * k);
      col += g;

      col = mix(src, col, uStrength * mix(0.55, 1.0, k));
      col += vec3(1.0, 0.28, 0.05) * heat * r * 0.55;
      col += vec3(1.0, 0.72, 0.2) * heat * heat * 0.18;
      gl_FragColor = vec4(clamp(col, 0.0, 1.4), 1.0);
    }
  `,
};
