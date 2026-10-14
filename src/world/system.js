// ============================================================================
//  SYSTEM BUILDER — turns a generated system description into 3D objects
// ============================================================================
import * as THREE from '../../vendor/three/three.module.js';
import * as BGU from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { RNG, Simplex, fbm } from '../core/rng.js';
import { clamp, TAU } from '../core/utils.js';
import {
  createPlanetMaterial, createAtmosphereMaterial, createCloudMaterial,
  createRingGeometry, createRingMaterial, createStarMaterial, createGlowSprite, rockNoiseMaps,
} from './materials.js?v=chart1';
import { makeAsteroidGeometry, makeWreckMesh } from '../ship/models.js';
import { makeStationMesh } from '../ship/stations.js?v=station10';
import { dressMainStation, commitHeroStation, isHeroStation, heroDefFor, stageHeroIfReady, prepareHeroStation, reclaimHeroWraps } from './station-hero.js?v=port31';
import { rockOreTons, isHubKind } from '../game/career.js?v=omega14';

const GEO = {
  hi: new THREE.SphereGeometry(1, 128, 96),
  med: new THREE.SphereGeometry(1, 72, 48),
  lo: new THREE.SphereGeometry(1, 44, 30),
  tiny: new THREE.SphereGeometry(1, 28, 20),
};
const RING_UP = new THREE.Vector3(0, 1, 0);

export class SystemScene {
  constructor(scene, galaxy) {
    this.scene = scene;
    this.galaxy = galaxy;
    this.root = new THREE.Group();
    this.root.name = 'system';
    scene.add(this.root);
    this.bodies = [];      // targetable runtime bodies
    this.planets = [];     // {data, group, spin, mesh, clouds, atmo, moons[]}
    this.belts = [];
    this.stations = [];
    this.wrecks = [];
    this.comets = [];
    this.star = null;
    this.data = null;
    this._tmp = new THREE.Vector3();
    this._tmpQ = new THREE.Quaternion();
    this._tmpM = new THREE.Matrix4();
    this._tmpS = new THREE.Vector3();
  }

  clear() {
    reclaimHeroWraps(this.root);
    const dispose = (o) => {
      o.traverse((c) => {
        if (c.geometry && c.geometry.userData?.own) c.geometry.dispose();
        // Hero GLB clones share materials/maps with the retained template.
        // Disposing them poisons Halcyon / observatory on the next visit.
        if (c.userData?.retainAssets) return;
        if (c.material) {
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          for (const m of mats) { m.map?.dispose?.(); m.dispose(); }
        }
      });
    };
    dispose(this.root);
    this.root.clear();
    this.bodies = []; this.planets = []; this.belts = [];
    this.stations = []; this.wrecks = []; this.comets = []; this.star = null;
  }

  build(sysData) {
    this.clear();
    this.data = sysData;
    const rng = new RNG(sysData.seed);

    // ------------------------------------------------------------ THE STAR
    const star = sysData.star;
    const starGroup = new THREE.Group();
    const starMat = createStarMaterial(star);
    const starMesh = new THREE.Mesh(GEO.hi, starMat);
    starMesh.scale.setScalar(star.radius);
    starGroup.add(starMesh);

    const corona1 = createGlowSprite(star.hex, star.radius * 5.2, 0.85, 2.6);
    const corona2 = createGlowSprite('#ffffff', star.radius * 2.3, 0.55, 1.6);
    const corona3 = createGlowSprite(star.hex, star.radius * 14.0, 0.28, 3.4);
    starGroup.add(corona1, corona2, corona3);

    const light = new THREE.PointLight(star.color, 1.25, 0, 0);
    starGroup.add(light);
    this.root.add(starGroup);

    this.star = {
      kind: 'star', data: { ...star, id: sysData.id + '-star', name: star.name },
      group: starGroup, mesh: starMesh, mat: starMat, radius: star.radius,
      coronas: [corona1, corona2, corona3],
    };
    this.bodies.push(this.star);
    this.ambient = new THREE.AmbientLight(0x334466, 0.35);
    this.root.add(this.ambient);

    // ----------------------------------------------------------- PLANETS
    for (const p of sysData.planets) this.planets.push(this._buildPlanet(p, star, false));
    for (const pl of this.planets) {
      for (const m of pl.data.moons) {
        pl.moons.push(this._buildPlanet(m, star, true, pl));
      }
    }

    // ------------------------------------------------------------- BELTS
    for (const b of sysData.belts) this.belts.push(this._buildBelt(b, rng));

    // ---------------------------------------------------------- STATIONS
    for (const s of sysData.stations) this.stations.push(this._buildStation(s));

    // ------------------------------------------------------------ WRECKS
    for (const w of sysData.wrecks) this.wrecks.push(this._buildWreck(w));

    // ------------------------------------------------------------ COMETS
    if (rng.chance(0.55)) this.comets.push(this._buildComet(rng, sysData));

    return this;
  }

  _buildPlanet(p, star, isMoon, parentRuntime) {
    const group = new THREE.Group();          // positioned at orbit location
    const spin = new THREE.Group();           // rotates with the planet
    group.add(spin);

    const geo = isMoon ? (p.radius < 10 ? GEO.tiny : GEO.lo) : (p.radius > 140 ? GEO.hi : p.radius > 55 ? GEO.med : GEO.lo);
    const mat = createPlanetMaterial(p, { displace: !isMoon });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.setScalar(p.radius);
    mesh.userData.bodyRef = { kind: isMoon ? 'moon' : 'planet', data: p };
    spin.add(mesh);

    // axial tilt
    spin.rotation.z = p.axialTilt || 0;
    spin.rotation.x = (p.axialTilt || 0) * 0.35;

    let clouds = null;
    if (p.clouds > 0.04) {
      const cm = createCloudMaterial(p);
      clouds = new THREE.Mesh(geo === GEO.hi ? GEO.med : geo, cm);
      clouds.scale.setScalar(p.radius * 1.017);
      spin.add(clouds);
    }

    let atmo = null;
    if (p.atmo) {
      const am = createAtmosphereMaterial(p);
      atmo = new THREE.Mesh(isMoon ? GEO.lo : GEO.med, am);
      atmo.scale.setScalar(p.radius * (1 + p.atmo.height * 3.2));
      atmo.renderOrder = 2;
      group.add(atmo);
    }

    let ringMesh = null;
    if (p.rings) {
      const rg = createRingGeometry(p.rings.inner, p.rings.outer, 220);
      rg.userData.own = true;
      const rm = createRingMaterial(p.rings, p.radius);
      ringMesh = new THREE.Mesh(rg, rm);
      ringMesh.rotation.x = 0;
      ringMesh.rotation.z = p.rings.tilt;
      ringMesh.renderOrder = 1;
      group.add(ringMesh);
    }

    this.root.add(group);

    const rt = {
      kind: isMoon ? 'moon' : 'planet',
      data: p, group, spin, mesh, mat, clouds, atmo, ringMesh,
      radius: p.radius,
      parent: parentRuntime || null,
      moons: [],
      angle: p.orbitPhase || 0,
    };
    if (!isMoon) this.bodies.push(rt);
    else this.bodies.push(rt);
    return rt;
  }

  /** Title-only gas giant. Not added to galaxy data, so gameplay types stay put. */
  spawnTitleJove() {
    const star = this.data?.star || { color: 0xfff1d0, radius: 80 };
    const R = 252;
    const p = {
      id: 'title-jove',
      name: 'Jove',
      kind: 'planet',
      type: 'gas',
      radius: R,
      orbitRadius: 24000,
      orbitSpeed: 0,
      orbitPhase: 2.18,
      inclination: 0.025,
      axialTilt: 0.055,
      rotSpeed: 0.006,
      seed: 880011,
      colors: ['#5a2e0e', '#c17a32', '#e8c98a', '#f6ead2'],
      atmo: { color: '#c4e8ff', density: 0.42, height: 0.016 },
      clouds: 0,
      cloudSeed: 1,
      cloudColor: '#f4e6c4',
      rings: {
        inner: R * 1.16,
        outer: R * 2.62,
        density: 1.0,
        color: '#efe6cc',
        tilt: 0.28,
        gaps: 3,
        seed: 91,
      },
      temp: 152,
      gravity: 2.4,
      mass: 318,
      physics: { teq: 152, g: 2.4, massEarth: 318, aAu: 5.2, aM: 1 },
      composition: ['Hydrogen', 'Helium', 'Ammonia'],
      atmosphereComp: ['Hydrogen', 'Helium', 'Methane'],
      zone: 'outer',
      habitable: false,
      value: 0,
      discovered: true, scanned: false, scanProgress: 0,
      landable: false,
      moons: [],
      hasLife: false,
    };
    const rt = this._buildPlanet(p, star, false);
    this.planets.push(rt);
    return rt;
  }

  _buildBelt(b, rng) {
    const count = b.count;
    const variants = [
      makeAsteroidGeometry(b.seed, 1, 0.34),
      makeAsteroidGeometry(b.seed + 11, 1, 0.5),
      makeAsteroidGeometry(b.seed + 23, 2, 0.28),
    ];
    const group = new THREE.Group();
    group.rotation.x = b.inclination;
    group.rotation.y = b.phase;
    this.root.add(group);

    const rock = rockNoiseMaps();
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(rng.range(0.05, 0.12), rng.range(0.08, 0.28), rng.range(0.22, 0.4)),
      roughness: 0.86, metalness: 0.18, flatShading: false,
      map: rock.map, roughnessMap: rock.rough, envMapIntensity: 0.55,
      vertexColors: true,
    });

    const meshes = variants.map((g) => {
      const im = new THREE.InstancedMesh(g, mat, 0);
      im.frustumCulled = false;
      return im;
    });
    meshes.forEach((m) => group.add(m));

    const rocks = [];
    const noise = new Simplex(b.seed);
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, TAU);
      const r = b.radius + rng.gauss() * b.width * 0.5;
      const y = rng.gauss() * b.width * 0.18;
      const size = Math.pow(rng.next(), 2.6) * 26 + 2.4;
      const variant = rng.int(0, 2);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(0, TAU), rng.range(0, TAU), rng.range(0, TAU)));
      const pos = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
      const spin = new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize().multiplyScalar(rng.range(-0.5, 0.5));
      const clump = clamp(0.55 + fbm(noise, pos.x * 0.00006, pos.y * 0.00006, pos.z * 0.00006, 3) * 0.9, 0.1, 1.6);
      const grade = 1 + Math.floor(clamp(b.richness * rng.range(0.7, 1.4), 0, 0.999) * 5);
      const rare = rng.next() < (b.composition === 'rare_ore' ? 0.45 : 0.08 + b.richness * 0.12);
      const hazard = rng.chance(0.12 + (grade >= 4 ? 0.1 : 0)) ? (rng.chance(0.45) ? 'unstable' : 'heat') : null;
      const commodity = rare ? 'rare_ore' : b.composition;
      const ore = rockOreTons(size * clump, b.richness, grade, rare);
      rocks.push({
        idx: i, variant, pos, quat: q, size: size * clump, spin,
        ore, oreMax: ore, commodity, grade, rare, hazard,
        prospected: false, prospect: 0, alive: true, belt: b,
      });
    }
    // counts per variant
    const counts = [0, 0, 0];
    for (const r of rocks) counts[r.variant]++;
    meshes.forEach((m, i) => { m.count = counts[i]; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); });
    const cursor = [0, 0, 0];
    const M = new THREE.Matrix4();
    const baseCol = new THREE.Color().copy(mat.color);
    for (const r of rocks) {
      const v = r.variant;
      r.instanceId = cursor[v]++;
      M.compose(r.pos, r.quat, this._tmpS.setScalar(r.size));
      meshes[v].setMatrixAt(r.instanceId, M);
      meshes[v].setColorAt(r.instanceId, baseCol);
    }
    meshes.forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    });

    const rt = {
      kind: 'belt', data: b, group, meshes, rocks, radius: b.radius,
      _M: new THREE.Matrix4(), _near: [],
    };
    this.bodies.push(rt);
    return rt;
  }

  _buildStation(s) {
    const group = new THREE.Group();
    const mesh = makeStationMesh(s);
    group.add(mesh);
    const hub = isHubKind(s.kind);
    const br = hub ? 160 : 90;
    const beacon = createGlowSprite('#7dffb0', br, 0.9, 2.0);
    beacon.position.y = (mesh.userData.top ?? s.radius * 1.15) + br * 0.3;
    group.add(beacon);
    const beacon2 = createGlowSprite(s.kind === 'hub_refinery' ? '#ff9a4d' : s.kind === 'hub_survey' ? '#7ec8ff' : '#ff6a6a', hub ? 110 : 70, 0.9, 2.0);
    beacon2.position.copy(mesh.userData.dockPoint || new THREE.Vector3(0, -s.radius, 0)).y -= hub ? 60 : 40;
    group.add(beacon2);
    this.root.add(group);
    const rt = {
      kind: 'station', data: s, group, mesh, radius: s.radius,
      angle: s.orbitPhase, beacon, beacon2, spinSpeed: s.spin || (hub ? 0.003 : 0.006),
    };
    this.bodies.push(rt);
    // If the GLB was fitted on the title screen, swap it in this frame.
    // Otherwise keep the stand-in visible until the model is actually ready.
    if (isHeroStation(s)) {
      if (stageHeroIfReady(rt)) commitHeroStation(rt);
      else dressMainStation(rt, (station) => this.onMainStation?.(station), { deferReveal: false });
    }
    return rt;
  }

  mountHeroStation(onReady) {
    const list = (this.stations || []).filter((s) => isHeroStation(s.data));
    for (const st of list) {
      const def = heroDefFor(st.data);
      // Already showing the imported mesh — sync path, no clone/voxel.
      if (def && st.mesh?.name === def.wrapName) {
        if (onReady) onReady(st);
        continue;
      }
      // Dress finished during the film — unhide + drop procedural in this call.
      if (st._heroWrap || stageHeroIfReady(st)) {
        commitHeroStation(st);
        if (onReady) onReady(st);
        continue;
      }
      // Still building: reveal when the promise completes (do not block / do not voxel).
      st._wantReveal = (s) => { if (onReady) onReady(s); };
      if (!st._dressing) dressMainStation(st, null, { deferReveal: true });
    }
  }

  /** In-system J / arrival: commit prebuilt hero before the pose is shown. */
  prepareHeroForJump(st, onReady) {
    return prepareHeroStation(st, onReady);
  }

  _buildWreck(w) {
    const group = new THREE.Group();
    const mesh = makeWreckMesh(w);
    group.add(mesh);
    group.position.set(w.pos.x, w.pos.y, w.pos.z);
    this.root.add(group);
    const rt = { kind: 'wreck', data: w, group, mesh, radius: w.radius };
    this.bodies.push(rt);
    return rt;
  }

  _buildComet(rng, sys) {
    const geo = makeAsteroidGeometry(rng.int(1, 9999), 0, 0.6);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xb8d4e4, roughness: 0.22, metalness: 0.38, flatShading: false,
      emissive: new THREE.Color('#3a6a88'), emissiveIntensity: 0.18, envMapIntensity: 1.1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.setScalar(rng.range(6, 14));
    const glow = createGlowSprite('#a8e8ff', 42, 0.55, 2.2);
    mesh.add(glow);
    this.root.add(mesh);

    // particle tail
    const N = 420;
    const pos = new Float32Array(N * 3);
    const tgeo = new THREE.BufferGeometry();
    tgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const tmat = new THREE.PointsMaterial({
      color: 0xbfeaff, size: 8, sizeAttenuation: true, transparent: true,
      opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const tail = new THREE.Points(tgeo, tmat);
    tail.frustumCulled = false;
    this.root.add(tail);

    const rt = {
      kind: 'comet',
      data: { id: sys.id + '-comet', name: `Comet ${rng.int(1, 99)}P/${sys.name.split(' ')[0]}`, kind: 'comet' },
      mesh, tail, radius: 12,
      a: rng.range(30000, 90000), e: rng.range(0.55, 0.86),
      phase: rng.range(0, TAU), speed: rng.range(0.02, 0.05),
      incl: rng.range(-0.5, 0.5), N,
    };
    this.bodies.push(rt);
    return rt;
  }

  // --------------------------------------------------------------- update
  update(dt, time, camPos, opts = {}) {
    const d = this.data;
    if (!d) return;
    const move = !opts.freezeOrbit;

    // star
    if (this.star) {
      this.star.mat.uniforms.uTime.value = time;
      this.star.mat.uniforms.uCamPos.value.copy(camPos);
      const pulse = 1 + Math.sin(time * 0.7) * 0.015;
      this.star.mesh.scale.setScalar(this.star.radius * pulse);
      this.star.coronas[0].material.rotation = time * 0.02;
      this.star.coronas[2].material.rotation = -time * 0.013;
    }

    // planets
    for (const p of this.planets) {
      if (p.group && !p.group.visible) continue;
      if (move) p.angle += p.data.orbitSpeed * dt;
      const r = p.data.orbitRadius;
      const inc = p.data.inclination || 0;
      p.group.position.set(
        Math.cos(p.angle) * r,
        Math.sin(p.angle) * Math.sin(inc) * r,
        Math.sin(p.angle) * r * Math.cos(inc)
      );
      p.spin.rotation.y += p.data.rotSpeed * dt;
      p.mesh.material.uniforms.uTime.value = time;
      p.mesh.material.uniforms.uStarPos.value.set(0, 0, 0);
      p.mesh.material.uniforms.uCamPos.value.copy(camPos);
      const dist = camPos.distanceTo(p.group.position);
      const atten = clamp((d.star.radius * 26) / Math.max(dist, 1), 0.35, 2.2);
      const hero = p.mesh.material.uniforms.uHero?.value > 0.5;
      const typeF = p.mesh.material.uniforms.uTypeF?.value ?? 0;
      const giant = typeF > 8.5 && typeF < 10.5;
      p.mesh.material.uniforms.uStarIntensity.value = hero ? (giant ? 1.32 : 1.55) : 1.15 * clamp(atten, 0.5, 1.6);
      if (p.clouds) {
        p.clouds.rotation.y += p.data.rotSpeed * dt * 1.35;
        p.clouds.material.uniforms.uTime.value = time;
        p.clouds.material.uniforms.uStarPos.value.set(0, 0, 0);
        p.clouds.material.uniforms.uCamPos.value.copy(camPos);
        p.clouds.material.uniforms.uStarTint.value.setHex(d.star.color).lerp(new THREE.Color(0xffffff), 0.55);
      }
      if (p.atmo) {
        p.atmo.material.uniforms.uStarPos.value.set(0, 0, 0);
        p.atmo.material.uniforms.uCamPos.value.copy(camPos);
        p.atmo.material.uniforms.uTime.value = time;
        const pix = p.radius / Math.max(dist, 1);
        p.atmo.visible = pix > 0.002;
        if (p.atmo.visible && !p.mesh.material.userData?.titleJove) {
          p.atmo.material.uniforms.uIntensity.value = 1.5 * clamp(pix * 90, 0.18, 1);
        }
      }
      if (p.ringMesh) {
        p.ringMesh.material.uniforms.uStarPos.value.set(0, 0, 0);
        p.ringMesh.material.uniforms.uPlanetPos.value.copy(p.group.position);
      }
      for (const m of p.moons) {
        if (move) m.angle += m.data.orbitSpeed * dt;
        const mr = m.data.orbitRadius;
        m.group.position.set(
          p.group.position.x + Math.cos(m.angle) * mr,
          p.group.position.y + Math.sin(m.angle) * Math.sin(m.data.inclination) * mr,
          p.group.position.z + Math.sin(m.angle) * mr * Math.cos(m.data.inclination)
        );
        m.spin.rotation.y += m.data.rotSpeed * dt * 0.5;
        m.mesh.material.uniforms.uTime.value = time;
        m.mesh.material.uniforms.uStarPos.value.set(0, 0, 0);
        m.mesh.material.uniforms.uCamPos.value.copy(camPos);
        if (m.atmo) {
          m.atmo.material.uniforms.uStarPos.value.set(0, 0, 0);
          m.atmo.material.uniforms.uCamPos.value.copy(camPos);
          const md = camPos.distanceTo(m.group.position);
          const mpix = m.radius / Math.max(md, 1);
          m.atmo.visible = mpix > 0.002;
          if (m.atmo.visible) m.atmo.material.uniforms.uIntensity.value = 1.5 * clamp(mpix * 90, 0.18, 1);
        }
      }
    }

    // belts
    for (const b of this.belts) {
      b.group.rotation.y += 0.0035 * dt * (22000 / Math.max(b.data.radius, 1));
      this._updateBeltNear(b, camPos, dt);
    }

    // stations
    for (const s of this.stations) {
      if (move) s.angle += s.data.orbitSpeed * dt;
      const r = s.data.orbitRadius;
      s.group.position.set(Math.cos(s.angle) * r, Math.sin(s.angle) * Math.sin(s.data.inclination) * r, Math.sin(s.angle) * r);
      s.mesh.rotation.y += s.spinSpeed * dt;
      const bl = (Math.sin(time * 2.4) * 0.5 + 0.5);
      s.beacon.material.opacity = 0.35 + bl * 0.65;
      s.beacon2.material.opacity = 0.35 + (1 - bl) * 0.65;
    }

    // wrecks
    for (const w of this.wrecks) {
      const r = w.data.rot;
      w.mesh.rotation.x += r.x * 0.04 * dt;
      w.mesh.rotation.y += r.y * 0.04 * dt;
      w.mesh.rotation.z += r.z * 0.04 * dt;
    }

    // comets
    for (const c of this.comets) {
      c.phase += c.speed * dt * (26000 / Math.max(c.a, 1)) * 12;
      const e = c.e;
      const rr = (c.a * (1 - e * e)) / (1 + e * Math.cos(c.phase));
      const x = Math.cos(c.phase) * rr;
      const z = Math.sin(c.phase) * rr;
      const y = Math.sin(c.phase) * rr * Math.sin(c.incl) * 0.3;
      c.mesh.position.set(x, y, z);
      c.mesh.rotation.y += dt * 0.6;
      // tail points away from star
      const dir = this._tmp.copy(c.mesh.position);
      if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
      else dir.normalize();
      const pos = c.tail.geometry.attributes.position;
      const rnd = c._rnd || (c._rnd = new RNG(42));
      for (let i = 0; i < c.N; i++) {
        const t = i / c.N;
        const spread = t * 900 * (0.3 + rnd.next() * 0.02);
        pos.setXYZ(i,
          c.mesh.position.x + dir.x * t * 5200 + (rnd.next() - 0.5) * spread,
          c.mesh.position.y + dir.y * t * 5200 + (rnd.next() - 0.5) * spread,
          c.mesh.position.z + dir.z * t * 5200 + (rnd.next() - 0.5) * spread
        );
      }
      pos.needsUpdate = true;
      c.tail.material.opacity = clamp(2.4 - rr / 30000, 0.05, 0.6);
    }
  }

  _updateBeltNear(b, camPos, dt) {
    const local = b.group.worldToLocal(this._tmp.copy(camPos));
    const NEAR = 9000;
    const M = b._M;
    const q = this._tmpQ;
    const e = new THREE.Euler();
    for (const r of b.rocks) {
      if (!r.alive) continue;
      const dx = r.pos.x - local.x, dy = r.pos.y - local.y, dz = r.pos.z - local.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < NEAR * NEAR) {
        r._rot = (r._rot || 0) + dt * (0.2 + r.spin.length());
        e.set(r.spin.x * r._rot, r.spin.y * r._rot, r.spin.z * r._rot);
        q.setFromEuler(e);
        M.compose(r.pos, q, this._tmpS.setScalar(r.size));
        b.meshes[r.variant].setMatrixAt(r.instanceId, M);
        b.meshes[r.variant].instanceMatrix.needsUpdate = true;
      }
    }
  }

  /** world position of a runtime body */
  getPos(rt, out = new THREE.Vector3()) {
    if (rt.kind === 'star') return out.set(0, 0, 0);
    if (rt.group) return rt.group.getWorldPosition(out);
    return out.set(0, 0, 0);
  }

  hideRock(rock) {
    rock.alive = false;
    const M = new THREE.Matrix4().makeScale(0, 0, 0);
    this.belts.find((b) => b.rocks.includes(rock))?.meshes[rock.variant].setMatrixAt(rock.instanceId, M);
    const belt = this.belts.find((b) => b.rocks.includes(rock));
    if (belt) belt.meshes[rock.variant].instanceMatrix.needsUpdate = true;
  }

  tintRock(rock, hex) {
    const belt = this.belts.find((b) => b.rocks.includes(rock));
    if (!belt) return;
    const mesh = belt.meshes[rock.variant];
    mesh.setColorAt(rock.instanceId, new THREE.Color(hex));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}
