// ============================================================================
//  DEEP-SPACE BACKDROP — nebula skybox, starfield
//  Sky is a clip-space quad (not a giant sphere). Huge sphere triangles were
//  flashing as blue squares when logarithmic depth sorted them over the ship.
// ============================================================================
import * as THREE from '../../vendor/three/three.module.js';
import { createNebulaMaterial, createStarfield } from './materials.js?v=jove6';

export class Background {
  constructor(scene, tint = '#2a4d8f', seed = 1) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.renderOrder = -2000;
    scene.add(this.group);

    this.nebulaMat = createNebulaMaterial(tint);
    this.nebulaMat.uniforms.uSeed.value = (seed % 997) / 7.3;
    this._invProj = new THREE.Matrix4();
    this._camRot = new THREE.Matrix3();

    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uCube: { value: null },
        uInvProj: { value: this._invProj },
        uCamRot: { value: this._camRot },
      },
      vertexShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        uniform mat4 uInvProj;
        uniform mat3 uCamRot;
        varying vec3 vDir;
        void main(){
          vec4 ndc = vec4(position.xy, 1.0, 1.0);
          gl_Position = ndc;
          #include <logdepthbuf_vertex>
          vec4 view = uInvProj * ndc;
          vDir = uCamRot * normalize(view.xyz);
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform samplerCube uCube;
        varying vec3 vDir;
        void main(){
          vec3 d = vDir;
          if (!(length(d) > 0.0)) d = vec3(0.0, 0.0, 1.0);
          vec3 col = textureCube(uCube, normalize(d)).rgb;
          if (!(col.r >= 0.0)) col = vec3(0.004, 0.006, 0.012);
          gl_FragColor = vec4(col, 1.0);
          #include <logdepthbuf_fragment>
          #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    const quad = new THREE.PlaneGeometry(2, 2);
    this.nebula = new THREE.Mesh(quad, this.skyMat);
    this.nebula.frustumCulled = false;
    this.nebula.renderOrder = -1e6;
    this.nebula.matrixAutoUpdate = false;
    this.group.add(this.nebula);

    this._bakeGeo = new THREE.SphereGeometry(1, 24, 16);
    this._rt = null; this._cubeCam = null; this._bakedSize = 0;

    this.stars = createStarfield(32000, 1.4e6);
    this.group.add(this.stars);
    this.galaxies = [];
  }

  setStarCount(n) {
    const geo = this.stars?.geometry;
    if (!geo) return;
    const max = geo.getAttribute('position')?.count || 0;
    const count = Math.max(0, Math.min(max, n | 0));
    geo.setDrawRange(0, count);
  }

  bake(renderer, size = 1024) {
    if (!renderer) return;
    if (!this._rt || this._bakedSize !== size) {
      this._rt?.dispose();
      this._rt = new THREE.WebGLCubeRenderTarget(size, {
        type: THREE.HalfFloatType, generateMipmaps: false,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      });
      this._cubeCam = new THREE.CubeCamera(0.1, 100, this._rt);
      this._bakedSize = size;
    }
    const s = new THREE.Scene();
    const m = new THREE.Mesh(this._bakeGeo, this.nebulaMat);
    m.scale.setScalar(10); m.frustumCulled = false;
    s.add(m);
    this._cubeCam.update(renderer, s);
    this.skyMat.uniforms.uCube.value = this._rt.texture;
  }

  update(dt, camPos, warpAmount = 0, camera = null) {
    this.group.position.copy(camPos);
    this.nebulaMat.uniforms.uTime.value += dt;
    this.stars.material.uniforms.uTime.value += dt;
    this.stars.material.uniforms.uWarp.value = warpAmount;
    this.group.rotation.y += dt * 0.0009;
    if (camera) {
      this._invProj.copy(camera.projectionMatrixInverse);
      this._camRot.setFromMatrix4(camera.matrixWorld);
    }
  }

  dispose() {
    this._rt?.dispose(); this.nebulaMat.dispose(); this.skyMat.dispose(); this._bakeGeo.dispose();
    this.group.parent?.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { o.material.map?.dispose?.(); o.material.dispose(); }
    });
  }
}
