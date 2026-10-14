// Cinematic teal/orange grade, vignette, film grain — HUD stays on a separate canvas.
export const ColorGradeShader = {
  name: 'ColorGradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uStrength: { value: 1 },
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
    uniform float uStrength;
    varying vec2 vUv;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 col = src.rgb;
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, 1.12);
      col = (col - 0.5) * 1.18 + 0.5;
      col = max(col, vec3(0.0));
      col.r = pow(col.r, 0.9) * 1.12;
      col.g = pow(col.g, 1.06) * 0.92;
      col.b = pow(col.b, 0.88) * 1.14;
      vec3 mag = vec3(0.95, 0.18, 0.62);
      vec3 cyan = vec3(0.15, 0.82, 1.0);
      col += mag * (1.0 - luma) * luma * 0.08;
      col += cyan * pow(luma, 1.8) * 0.08;
      vec2 q = vUv * 2.0 - 1.0;
      float vig = smoothstep(1.45, 0.22, length(q * vec2(1.08, 1.0)));
      col *= mix(0.55, 1.0, vig);
      float g = (hash(vUv * vec2(1920.0, 1080.0) + uTime * 60.0) - 0.5) * 0.045;
      col += g;
      col = mix(src.rgb, col, uStrength);
      gl_FragColor = vec4(clamp(col, 0.0, 1.2), src.a);
    }
  `,
};
