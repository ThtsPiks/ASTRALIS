// Screen-space reflections, contact shade, and a fresnel rim.
// The scene uses a logarithmic depth buffer, so view Z is decoded from that.
export const RtxShader = {
  name: 'RtxShader',
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uProj: { value: null },
    uInvProj: { value: null },
    uTexel: { value: null },
    uLogFC: { value: 1 },
    uSteps: { value: 10 },
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
    uniform sampler2D tDepth;
    uniform mat4 uProj;
    uniform mat4 uInvProj;
    uniform vec2 uTexel;
    uniform float uLogFC;
    uniform float uSteps;
    uniform float uStrength;
    varying vec2 vUv;

    float sceneZ(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      if (d <= 0.0001 || d >= 0.998) return 0.0;
      return 1.0 - exp2(d * 2.0 / max(uLogFC, 0.0001));
    }

    vec3 viewPos(vec2 uv, float viewZ) {
      vec4 clip = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
      vec3 ray = clip.xyz / max(abs(clip.w), 0.0001);
      return ray * (viewZ / min(ray.z, -0.0001));
    }

    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      float vz = sceneZ(vUv);
      if (vz >= -0.05) {
        gl_FragColor = src;
        return;
      }
      vec3 pos = viewPos(vUv, vz);
      vec3 n = normalize(cross(dFdx(pos), dFdy(pos)));
      vec3 v = normalize(pos);
      if (dot(n, v) > 0.0) n = -n;

      float ndv = clamp(dot(n, -v), 0.0, 1.0);
      float fres = pow(1.0 - ndv, 3.0);

      vec3 refl = reflect(v, n);
      float reach = clamp(abs(vz) * 0.28, 60.0, 6000.0);
      vec3 tip = pos + refl * reach;
      vec4 tipClip = uProj * vec4(tip, 1.0);
      vec2 tipUv = tipClip.xy / max(abs(tipClip.w), 0.0001) * 0.5 + 0.5;

      vec3 hitCol = src.rgb;
      float hit = 0.0;
      float steps = clamp(uSteps, 4.0, 16.0);
      for (int i = 1; i <= 16; i++) {
        if (float(i) > steps) break;
        float t = float(i) / steps;
        vec2 suv = mix(vUv, tipUv, t);
        if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) break;
        float sz = sceneZ(suv);
        if (sz >= -0.05) continue;
        vec3 sp = viewPos(suv, sz);
        float rayZ = mix(vz, tip.z, t);
        if (sz > rayZ && sz - rayZ < reach * 0.08) {
          hitCol = texture2D(tDiffuse, suv).rgb;
          hit = 1.0 - t * 0.35;
          break;
        }
      }

      float ao = 1.0;
      vec2 o = uTexel * 2.5;
      float z1 = sceneZ(vUv + vec2(o.x, 0.0));
      float z2 = sceneZ(vUv - vec2(o.x, 0.0));
      float z3 = sceneZ(vUv + vec2(0.0, o.y));
      float z4 = sceneZ(vUv - vec2(0.0, o.y));
      ao -= clamp((vz - z1) / max(abs(vz), 1.0), 0.0, 1.0) * 0.35;
      ao -= clamp((vz - z2) / max(abs(vz), 1.0), 0.0, 1.0) * 0.35;
      ao -= clamp((vz - z3) / max(abs(vz), 1.0), 0.0, 1.0) * 0.35;
      ao -= clamp((vz - z4) / max(abs(vz), 1.0), 0.0, 1.0) * 0.35;
      ao = clamp(ao, 0.55, 1.0);

      vec3 col = src.rgb * ao;
      col += hitCol * hit * fres * 0.55;
      col += vec3(0.65, 0.82, 1.0) * fres * 0.16;
      col = mix(src.rgb, col, uStrength);
      gl_FragColor = vec4(max(col, vec3(0.0)), src.a);
    }
  `,
};
