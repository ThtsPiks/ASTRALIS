// ============================================================================
//  ASTRALIS — main game orchestrator
// ============================================================================
import * as THREE from '../../vendor/three/three.module.js';
import { EffectComposer } from '../../vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../../vendor/three/addons/postprocessing/UnrealBloomPass.js?v=vsync1';
import { AfterimagePass } from '../../vendor/three/addons/postprocessing/AfterimagePass.js';
import { ShaderPass } from '../../vendor/three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from '../../vendor/three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from '../../vendor/three/addons/shaders/FXAAShader.js';
import { ColorGradeShader } from '../fx/ColorGradeShader.js';
import { DiamondShader } from '../fx/DiamondShader.js?v=fps1';
import { SanitizeShader } from '../fx/SanitizeShader.js';
import { RtxShader } from '../fx/RtxShader.js?v=rtx1';
import { SMAAPass } from '../../vendor/three/addons/postprocessing/SMAAPass.js';

import { systemById, PLANET_TYPES, COMMODITIES, ECONOMIES, STAR_TYPES } from '../world/galaxy.js?v=port28';
import { generateUniverse, galaxyById, transitQuote } from '../world/universe.js?v=port28';
import { canFrameShift, auFromGameOrbit, airDensity, wellParameter } from '../world/physics.js?v=chart1';
import { flightFeel } from '../world/atmo.js?v=chart1';
import { SystemScene } from '../world/system.js?v=port31';
import { preloadMainStation, isHeroStation } from '../world/station-hero.js?v=port31';
import { stationDistance } from '../world/station-collide.js?v=station4';
import { Background } from '../world/background.js?v=sto3';
import { bakeTitleJoveTexture, createTitleJoveMaterial, createRingGeometry } from '../world/materials.js?v=chart1';
import { createTitleRingMaterial } from '../world/titlering.js?v=spin4';
import { PlanetSurface } from '../world/surface.js?v=chart1';
import { Ship, PlayerController, NpcShip, ProjectileManager, SHIP_DEFS, FLEET_IDS, resolveShipId } from '../ship/ship.js?v=omega15';
import { ParticleSystem, Beam, Shockwave, ScanArray } from '../fx/particles.js?v=scanvisual1';
import { Input } from '../core/input.js?v=mouse1';
import { FuelProbe } from '../ship/fuel-probe.js?v=omega14';
import { Audio } from '../core/audio.js?v=score2';
import { HUD } from '../ui/hud.js?v=hud2';
import { MapView } from '../ui/maps.js?v=finale6';
import { Menus } from '../ui/menus.js?v=port34';
import { clamp, lerp, damp, fmtDist, fmtCredits, fmtSpeed, fmtTime, DEG, TAU } from '../core/utils.js';
import { RNG } from '../core/rng.js';
import { createCampaign, migrateCampaign, onCampaignEvent, chapterInfo, refreshUnlocks, galaxyOpen, galaxyLockReason, latestComm, restoreStoryCargo, nextStep, shipUnlocked } from '../story/campaign.js?v=finale6';
import { Cinema } from './cinema.js?v=port21';
import { makeTutorial, tutorialNav, noteTutorial, advanceTutorial, TUTORIAL_STEPS, coachTutorial } from './tutorial.js?v=tut4';
import { defaultRep, addRep, dockPriceMult, illegalTons, contrabandFine, lateFactor, missionExpired, chaffBreaks, saveSlotKey, insuranceExcess, cargoKeepFrac, salvagePayout, exploreBonus, bountyMult, extractTons, mineHazard, prospectDwell, rollBulletins, bulletinSlice, STATION_KIND_LABEL, addMinedCargo, planetMine, surveyDataPayout, MINE_CUT_RANGE, MINE_PROSPECT_RANGE, MINE_VEIN_RANGE, padJobs, paydayLine, pickCircuitDest, shiftListedPrice } from './career.js?v=omega14';
import { AchievementTracker } from './achievements.js?v=fleet6';
import { pullNativeSaves, pushNativeSave, wipeNativeSaves } from '../core/persist.js';
import { bustHeroThumbs } from '../ui/shipthumb.js?v=hangar3';
import {
  SAVE_V, seedLedger, restoreLedger, migrateFuel, trySpendFuel, grantDeepRp, holdMass,
} from './ledger.js?v=omega14';
import { careerSnapshot, tonsQty } from './catalog.js?v=chart1';
import {
  accessBlock, launchExpedition, grantReturnBonus, abortExpedition,
  noteFragment, tickHazard, hazardEffect, takeDeposit, landingBlock, shedOverflow, legacyScanGrant,
} from './expedition.js?v=chart1';
import { accessRows } from './planet-access.js?v=chart1';
import { commitTransit, markLegacyRoutes, ensurePocket, anchorJumpGate, transitReport, POCKET_ID } from './route.js?v=finale6';

const _X_AXIS = new THREE.Vector3(1, 0, 0);
const _SHIP_FORWARD = new THREE.Vector3(0, 0, -1);
const _autopilotQ = new THREE.Quaternion();
const _camPitch = new THREE.Quaternion();
const _camLocal = new THREE.Vector3();
const _camWorld = new THREE.Vector3();
const _camLook = new THREE.Vector3();
const _camRadial = new THREE.Vector3();
const _stationN = new THREE.Vector3();
const _camTangent = new THREE.Vector3();
const NPC_NAMES = ['Red Vulture', 'Black Mamba', 'Iron Jackal', 'Crimson Fang', 'Void Reaper', 'Sable Wing', 'Ghost Talon', 'Rust Baron', 'Night Adder', 'Cinder Wolf', 'Hollow Saint', 'Pale Horse'];

export class Game {
  constructor() {
    this.state = 'boot';       // boot | title | playing | paused | docked | map | dead
    this.quality = 'med';
    this._graphicsChosen = false;
    this.settings = {
      sensitivity: 1.0, invertY: false, mouseSteer: true, rollOnE: false,
      masterVol: 0.72, sfxVol: 0.82, musicVol: 0.48, muted: false, bloom: true, fxaa: true, rtx: false,
      pixelRatio: 0, radarRange: 14000, showLadder: true, showHints: true,
      dynamicRes: true, vsync: true,
    };
    this._dynScale = 1;
    this.rep = defaultRep();
    this.wanted = 0;
    this.chaff = 6;
    this.heatsinks = 4;
    this.pips = { sys: 2, eng: 2, wep: 2 };
    this.silent = false;
    this.autopilot = false;
    this.photo = false;
    this.storedShips = [];
    this.locker = {};
    this.saveSlot = 0;
    this.insured = false;
    this.stats = { distance: 0, scans: 0, kills: 0, mined: 0, earned: 0, jumps: 0, playtime: 0, discovered: 0, dockings: 0 };
    this.missions = [];
    this.missionOffers = {};
    this.gallery = {};         // scanned body log
    this.campaign = createCampaign();
    this.tutorial = null;
    this.achievements = null;
    this._filamentRides = 0;
    this._wantShot = false;
    this.hudCinematic = 0;
    this.livery = '#3ec8ff';
    this.flightLayer = 'space';
    this.surface = null;
    this._surfaceAgl = null;
    this.atmoPlanet = null;
    this._atmoFeel = null;
    this.contacts = [];
    this._tmpV = new THREE.Vector3();
    this._tmpV2 = new THREE.Vector3();
    this._tmpV3 = new THREE.Vector3();
    this._atmoSweepStart = new THREE.Vector3();
    this._q = new THREE.Quaternion();
  }

  // =========================================================================
  //  BOOT
  // =========================================================================
  _detectQuality() {
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 0;
    const dpr = window.devicePixelRatio || 1;
    const w = window.screen?.width || window.innerWidth || 1920;
    const h = window.screen?.height || window.innerHeight || 1080;
    const pixels = w * h * dpr;
    let score = cores + (mem ? mem : 6);
    if (pixels > 7e6) score -= 5;
    else if (pixels > 4e6) score -= 2;
    if (score >= 16) return 'high';
    if (score >= 10) return 'med';
    return 'low';
  }

  _loadGraphics() {
    try {
      const d = JSON.parse(localStorage.getItem('astralis-graphics') || 'null');
      if (d && typeof d === 'object') {
        if (d.quality === 'low' || d.quality === 'med' || d.quality === 'high' || d.quality === 'ultra' || d.quality === '8k') {
          this.quality = d.quality;
        }
        this._graphicsChosen = !!d.chosen;
        if (d.settings && typeof d.settings === 'object') {
          for (const k of Object.keys(this.settings)) {
            if (d.settings[k] !== undefined) this.settings[k] = d.settings[k];
          }
        }
        return;
      }
    } catch { /* fresh machine */ }
    this.quality = this._detectQuality();
    this._graphicsChosen = false;
  }

  _saveGraphics() {
    try {
      localStorage.setItem('astralis-graphics', JSON.stringify({
        quality: this.quality,
        chosen: !!this._graphicsChosen,
        settings: { ...this.settings },
      }));
    } catch { /* private mode */ }
  }

  _matchGpu() {
    if (this._graphicsChosen) return;
    try {
      const gl = this.renderer?.getContext?.();
      const ext = gl?.getExtension?.('WEBGL_debug_renderer_info');
      const gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
      if (/intel|uhd|iris|hd graphics|llvmpipe|swiftshader/i.test(gpu)) {
        if (this.quality === '8k' || this.quality === 'ultra' || this.quality === 'high') this.quality = 'med';
        this.settings.bloom = false;
        this.settings.rtx = false;
      }
    } catch { /* keep detected tier */ }
    if (!this._graphicsChosen) this.settings.rtx = this.quality === 'high' || this.quality === 'ultra';
  }

  async init(progress = async () => {}) {
    this._loadGraphics();
    const wrap = document.getElementById('canvasWrap');
    this.wrap = wrap;
    await progress(6, 'Allocating WebGL2 render device');

    this.renderer = new THREE.WebGLRenderer({
      antialias: false, alpha: false, powerPreference: 'high-performance',
      logarithmicDepthBuffer: true, stencil: false, preserveDrawingBuffer: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(this._pr());
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x03060c, 1);
    this.renderer.shadowMap.enabled = false;
    wrap.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.4, 9e6);
    this.camera.position.set(0, 40, 160);
    this.scene.add(this.camera);
    this.fillLight = new THREE.DirectionalLight(0xd8e8ff, 0.18);
    this.fillLight.position.set(0.35, 0.7, 1);
    this.camera.add(this.fillLight);
    this.rimLight = new THREE.DirectionalLight(0x7fb8ff, 0.2);
    this.rimLight.position.set(-0.8, 0.2, -0.4);
    this.camera.add(this.rimLight);

    this._buildEnvironment();
    this.input = new Input({ canvasWrap: wrap });
    this.hud = new HUD(document.getElementById('hud'));
    this.hud.resize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, 1.25));
    this.maps = new MapView(document.getElementById('mapCanvas'), document.getElementById('mapPanel'));
    this.menus = new Menus(this);
    this.cinema = new Cinema(this);
    this.preloadHalcyon = () => preloadMainStation();
    this.achievements = new AchievementTracker(this);
    this._warmHero();

    await progress(18, 'Assembling post-processing chain');
    // post-processing
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(this._pr());
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this._attachRtxDepth();
    this.rtxPass = new ShaderPass(RtxShader);
    this.rtxPass._cam = this.camera;
    this.rtxPass.enabled = false;
    this.rtxPass.uniforms.uProj.value = new THREE.Matrix4();
    this.rtxPass.uniforms.uInvProj.value = new THREE.Matrix4();
    this.rtxPass.uniforms.uTexel.value = new THREE.Vector2();
    const rtxRender = this.rtxPass.render.bind(this.rtxPass);
    this.rtxPass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
      const cam = this.camera;
      this.rtxPass.uniforms.tDepth.value = readBuffer.depthTexture;
      this.rtxPass.uniforms.uProj.value.copy(cam.projectionMatrix);
      this.rtxPass.uniforms.uInvProj.value.copy(cam.projectionMatrixInverse);
      this.rtxPass.uniforms.uTexel.value.set(1 / Math.max(1, readBuffer.width), 1 / Math.max(1, readBuffer.height));
      this.rtxPass.uniforms.uLogFC.value = 2 / Math.log2(cam.far + 1);
      rtxRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    };
    this.composer.addPass(this.rtxPass);
    this.sanitizePass = new ShaderPass(SanitizeShader);
    this.composer.addPass(this.sanitizePass);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.48, 0.34, 0.74);
    // Half-res bloom lives inside the pass (_resScale). Do not wrap setSize:
    // that desynced mip FBOs from invSize and threw GL 1282 every frame.
    this.bloomPass._resScale = 0.5;
    this.composer.addPass(this.bloomPass);
    this.afterimage = new AfterimagePass(0.0);
    this.afterimage.enabled = false;
    this.composer.addPass(this.afterimage);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
    this.gradePass = new ShaderPass(ColorGradeShader);
    this.gradePass.enabled = false;
    this.composer.addPass(this.gradePass);
    this.diamondPass = new ShaderPass(DiamondShader);
    this.diamondPass.uniforms.uRes.value = new THREE.Vector2(3840, 2160);
    this.composer.addPass(this.diamondPass);
    this.smaaPass = new SMAAPass(window.innerWidth, window.innerHeight);
    this.composer.addPass(this.smaaPass);
    this.fxaaPass = new ShaderPass(FXAAShader);
    this.fxaaPass.enabled = false;
    this.composer.addPass(this.fxaaPass);

    await progress(34, 'Compiling procedural GLSL shaders');
    // fx
    this.particles = new ParticleSystem(this.scene, 2400);
    this.beam = new Beam(this.scene, '#7fe8ff');
    this.shock = new Shockwave(this.scene);
    this.scanArray = new ScanArray(this.scene);
    this.fuelProbe = new FuelProbe(this.scene);

    await progress(50, 'Mounting planetary cache (streamed chunks + baked albedo)');
    // background
    this.background = new Background(this.scene, '#2a4d8f', 7);
    this.background.bake(this.renderer, this._nebulaBakeSize());

    this._matchGpu();
    this.onResize();
    this.applyQuality();
    this._saveGraphics();
    window.addEventListener('resize', () => this.onResize());

    await progress(66, 'Weaving the Local Sheet');
    this.universe = generateUniverse();
    this.galaxy = galaxyById(this.universe, this.universe.homeId);
    await progress(90, `${this.universe.galaxies.length} galaxies · ${this.universe.totalSystems} systems · ${this.universe.totalPlanets} worlds`);

    await progress(97, 'Calibrating flight model');
    this._NpcCtor = NpcShip;
    this._clock = new THREE.Clock();
    this._loop = this._loop.bind(this);
    await pullNativeSaves();
    const keep = () => { try { this._saveGraphics(); this.save(true); } catch { /* quitting */ } };
    window.addEventListener('pagehide', keep);
    window.addEventListener('beforeunload', keep);
    requestAnimationFrame(this._loop);
  }

  _nebulaBakeSize() {
    const q = this.quality;
    return q === 'ultra' ? 1024 : q === 'high' ? 1024 : q === 'med' ? 768 : 512;
  }

  /** target pixel ratio for the quality tier (before dynamic scaling) */
  _basePr() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, window.innerWidth || 1920);
    const h = Math.max(1, window.innerHeight || 1080);
    const long = Math.max(w, h);
    const q = this.quality;
    const eight = q === '8k';
    const maxEdge = q === 'low' ? 1280 : q === 'med' ? 1600 : q === 'high' ? 1920 : eight ? 7680 : 2560;
    const edgeCap = maxEdge / long;
    const tier = q === 'low' ? 0.85 : q === 'med' ? 1.0 : q === 'high' ? 1.0 : eight ? edgeCap : 1.25;
    const want = this.settings.pixelRatio > 0
      ? this.settings.pixelRatio
      : (eight ? edgeCap : Math.min(dpr, tier));
    if (this.settings.pixelRatio > 0) return Math.max(0.5, Math.min(want, 5));
    return Math.max(0.55, Math.min(want, edgeCap, eight ? 5 : 2.0));
  }

  _pr() {
    const base = this._basePr();
    const manual = this.settings.pixelRatio > 0;
    const scale = manual ? 1 : (this._dynScale ?? 1);
    if (this.state === 'title' || this.state === 'boot') {
      return Math.max(0.72, Math.min(base, 1.0));
    }
    return Math.max(0.6, base * scale);
  }

  _refreshHz() {
    const native = Number(window.__astralisDisplayHz);
    if (native > 20 && native < 361) return Math.round(native);
    const hz = Number(window.screen?.refreshRate);
    if (hz > 20 && hz < 361) return Math.round(hz);
    return 60;
  }

  /** Present cap when VSYNC is on. ~60 on ProMotion/144Hz so M4 stays cool. */
  _vsyncCapHz() {
    const hz = this._refreshHz();
    if (hz >= 48 && hz <= 62) return hz;
    return 60;
  }

  applyVsync() {
    this._lastPresent = null;
    this._fpsLow = 0;
    this._fpsHigh = 0;
  }

  /**
   * Frame-time governor. Cooperates with vsync: if we are hitting the cap,
   * do not shrink. Drop scale after several frames below ~50; recover slowly.
   */
  _governResolution(dt) {
    if (this.settings.dynamicRes === false) return;
    if (this.settings.pixelRatio > 0) return;
    const fps = 1 / Math.max(dt, 1e-4);
    const vsync = this.settings.vsync !== false;
    const cap = vsync ? this._vsyncCapHz() : 60;
    const floor = this.state === 'title' ? 0.72 : 0.55;
    const lowHold = this.state === 'title' ? 0.45 : 0.9;
    const cur = this._dynScale ?? 1;
    let next = cur;
    if (fps < 50) {
      this._fpsLow = (this._fpsLow || 0) + dt;
      this._fpsHigh = 0;
      if (this._fpsLow > lowHold && cur > floor) {
        next = Math.max(floor, +(cur - 0.1).toFixed(2));
        this._fpsLow = 0;
      }
    } else if (fps >= (vsync ? cap - 3 : 58)) {
      this._fpsLow = 0;
      this._fpsHigh = (this._fpsHigh || 0) + dt;
      if (this._fpsHigh > 4.0 && cur < 1) {
        next = Math.min(1, +(cur + 0.05).toFixed(2));
        this._fpsHigh = 0;
      }
    } else {
      this._fpsLow = 0;
      this._fpsHigh = 0;
    }
    if (next !== cur) { this._dynScale = next; this.onResize(); }
  }

  _logPerf() {
    const now = this.time || 0;
    if (now > 48) return;
    if (now - (this._perfLogAt || 0) < 4) return;
    this._perfLogAt = now;
    const pr = this._pr();
    console.log(
      `[ASTRALIS] fps ${Math.round(this.fps || 0)} · scale ${Math.round((this._dynScale || 1) * 100)}% · pr ${pr.toFixed(2)} · ${this.quality} · vsync ${this.settings.vsync !== false ? 'on' : 'off'}`,
    );
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = this._pr();
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const px = 1 / Math.max(1, this.renderer.domElement.width);
    const py = 1 / Math.max(1, this.renderer.domElement.height);
    this.fxaaPass.material.uniforms.resolution.value.set(px, py);
    const dw = this.renderer.domElement.width;
    const dh = this.renderer.domElement.height;
    // AA choice follows the *effective* pixel ratio: at ≥1.8 device px per
    // CSS px the buffer is already supersampled — a 3-pass SMAA on 8 Mpx is
    // 5–7 ms of nothing. FXAA covers the middle band, SMAA only near 1:1.
    const aaOn = this.settings.fxaa && this.quality !== 'low';
    const crisp = this.quality === 'high' || this.quality === 'ultra' || this.quality === '8k';
    if (this.smaaPass) {
      this.smaaPass.enabled = aaOn && crisp && pr < 1.3;
      if (this.smaaPass.enabled) this.smaaPass.setSize(dw, dh);
    }
    this.fxaaPass.enabled = aaOn && !(this.smaaPass && this.smaaPass.enabled) && pr < 1.8;
    if (this.diamondPass?.uniforms?.uRes) this.diamondPass.uniforms.uRes.value.set(dw, dh);
    this._attachRtxDepth();
    this.hud.resize(w, h, Math.min(window.devicePixelRatio || 1, 1.25));
    if (this.maps.mode) this.maps.resize();
  }

  applyQuality() {
    const q = this.quality;
    const stars = q === '8k' ? 28000 : q === 'ultra' ? 22000 : q === 'high' ? 14000 : q === 'med' ? 8000 : 5000;
    const viewR = q === 'low' ? 2 : 3;
    const rtx = !!this.settings.rtx;
    this.bloomPass.enabled = this.settings.bloom && q !== 'low';
    const top = q === '8k' || q === 'ultra';
    this.bloomPass.strength = (q === '8k' ? 0.55 : q === 'ultra' ? 0.5 : q === 'high' ? 0.42 : 0.28) + (rtx && q !== 'low' ? 0.08 : 0);
    this.bloomPass.radius = q === '8k' ? 0.42 : q === 'ultra' ? 0.38 : 0.28;
    this.bloomPass.threshold = top ? 1.1 : 1.14;
    this.bloomPass._resScale = q === '8k' ? 0.28 : q === 'ultra' ? 0.5 : q === 'high' ? 0.38 : 0.26;
    this.renderer.toneMappingExposure = q === '8k' ? 1.22 : q === 'ultra' ? 1.18 : 1.06;
    if (this.diamondPass) {
      this.diamondPass.enabled = q === 'ultra' || q === '8k';
      if (this.diamondPass.uniforms?.uStrength) this.diamondPass.uniforms.uStrength.value = top ? 1 : 0;
    }
    if (this.gradePass) this.gradePass.enabled = false;
    if (this.rtxPass) {
      this.rtxPass.enabled = rtx && this.state !== 'title' && this.state !== 'boot';
      this.rtxPass.uniforms.uSteps.value = q === '8k' ? 8 : q === 'ultra' ? 14 : q === 'high' ? 10 : q === 'med' ? 7 : 5;
      this.rtxPass.uniforms.uStrength.value = top ? 1 : 0.85;
    }
    this.background?.setStarCount(stars);
    this.surface?.setViewRadius(viewR);
    this._dynScale = 1; this._fpsLow = 0; this._fpsHigh = 0;
    if (this.background && this.background._bakedSize && this.background._bakedSize !== this._nebulaBakeSize()) {
      this.background.bake(this.renderer, this._nebulaBakeSize());
    }
    this.onResize();
  }

  // =========================================================================
  //  TITLE SCREEN BACKDROP
  // =========================================================================
  async startTitlePreview() {
    this.shipDefId = 'aurora';
    this._spawnShip(SHIP_DEFS.aurora, 2.85);
    this._warmHero();
    this.callsign = 'NOVA-7';
    this.credits = 0;
    this.cargo = {};
    this.rp = 0;
    this.kits = 0;
    this.filters = 0;
    this.transitCells = 0;
    this.researched = {};
    this.expedition = null;
    this.fuelMigrated = true;
    this.system = null;
    const home = this.galaxy.systems[0];
    home.discovered = true;
    this.buildSystem(home.id, 'preview');
    this.ship.group.visible = true;
    if (this.ship.mesh) this.ship.mesh.visible = true;
    this.state = 'title';
    this._dynScale = 1;
    this._fpsLow = 0;
    this._fpsHigh = 0;
    if (this.resetTitleCam) this.resetTitleCam();
    this.renderer.toneMappingExposure = 1.14;
    if (this.bloomPass) {
      this.bloomPass.threshold = 1.42;
      this.bloomPass.strength = 0.24;
    }
    if (this.diamondPass) {
      this.diamondPass.enabled = false;
      if (this.diamondPass.uniforms?.uStrength) this.diamondPass.uniforms.uStrength.value = 0.35;
    }
    if (this.fillLight) this.fillLight.intensity = 0.16;
    if (this.rimLight) this.rimLight.intensity = 0.28;
    this._dressTitlePlanet();
    this.onResize();
    this._warmHero();
  }

  /** Title-only Jupiter. Bakes a 4K map once; gameplay planet types stay. */
  _dressTitlePlanet() {
    const scene = this.systemScene;
    if (!scene) return;
    const rt = scene.spawnTitleJove?.() || scene.bodies.find((b) => b.kind === 'planet' && b.data.type === 'gas');
    if (!rt?.mesh) return;
    const geo = new THREE.SphereGeometry(1, 192, 128);
    geo.userData.own = true;
    if (rt.mesh.geometry?.userData?.own) rt.mesh.geometry.dispose();
    rt.mesh.geometry = geo;
    rt.mesh.frustumCulled = false;
    rt.mesh.renderOrder = 0;

    const map = bakeTitleJoveTexture(this.renderer);
    const old = rt.mesh.material;
    rt.mat = createTitleJoveMaterial(map);
    rt.mesh.material = rt.mat;
    if (old && old !== rt.mat) old.dispose();

    const pos = rt.group.position;
    const toStar = pos.lengthSq() > 1e-6 ? pos.clone().negate().normalize() : new THREE.Vector3(1, 0, 0);
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(toStar, up);
    if (right.lengthSq() < 1e-8) right.set(0, 0, 1);
    right.normalize();
    const camDir = right.clone().multiplyScalar(-0.66).addScaledVector(toStar, 0.26).addScaledVector(up, 0.64).normalize();
    if (rt.spin) {
      rt.spin.rotation.z = 0.048;
      rt.spin.rotation.x = 0.012;
      rt.spin.rotation.y = Math.atan2(-camDir.z, camDir.x);
      rt.spin.scale.set(1, 0.945, 1);
    }
    if (rt.clouds) rt.clouds.visible = false;
    {
      const R = rt.radius;
      const spec = {
        inner: R * 1.16, outer: R * 2.62, density: 1.0,
        color: '#efe6cc', tilt: 0.28, gaps: 3, seed: 91,
      };
      if (rt.ringMesh?.geometry?.userData?.own) rt.ringMesh.geometry.dispose();
      if (rt.ringMesh?.material && rt.ringMesh.material !== rt.mat) rt.ringMesh.material.dispose();
      const rg = createRingGeometry(spec.inner, spec.outer, 384, 8);
      rg.userData.own = true;
      const rm = createTitleRingMaterial(spec, R);
      // Tilt lives on ringSpin; the mesh spins local Y so the plane stays put.
      if (!rt.ringSpin) {
        rt.ringSpin = new THREE.Group();
        rt.group.add(rt.ringSpin);
      }
      rt.ringSpin.rotation.set(0.22, 0.58, 0.18);
      if (!rt.ringMesh) {
        rt.ringMesh = new THREE.Mesh(rg, rm);
        rt.ringSpin.add(rt.ringMesh);
        rt.ringMesh.rotation.set(0, 0, 0);
      } else {
        rt.ringMesh.geometry = rg;
        rt.ringMesh.material = rm;
        if (rt.ringMesh.parent !== rt.ringSpin) {
          rt.ringMesh.parent?.remove(rt.ringMesh);
          rt.ringSpin.add(rt.ringMesh);
        }
        // Keep Y (titleCamera spins it). Zero leftover _buildPlanet tilt.
        rt.ringMesh.rotation.x = 0;
        rt.ringMesh.rotation.z = 0;
      }
      rt.ringMesh.visible = true;
      rt.ringMesh.frustumCulled = false;
      rt.ringMesh.renderOrder = 4;
    }
    if (rt.atmo) {
      const ag = new THREE.SphereGeometry(1, 64, 40);
      ag.userData.own = true;
      if (rt.atmo.geometry?.userData?.own) rt.atmo.geometry.dispose();
      rt.atmo.geometry = ag;
      if (rt.spin && rt.atmo.parent !== rt.spin) {
        rt.group.remove(rt.atmo);
        rt.spin.add(rt.atmo);
      }
      rt.atmo.scale.setScalar(rt.radius * 1.048);
      rt.atmo.renderOrder = 2;
      rt.atmo.frustumCulled = false;
      const au = rt.atmo.material?.uniforms;
      if (au) {
        au.uColor?.value?.set('#c4e8ff');
        if (au.uDensity) au.uDensity.value = 0.42;
        if (au.uPower) au.uPower.value = 3.15;
        if (au.uIntensity) au.uIntensity.value = 1.42;
      }
    }
    for (const b of scene.bodies) {
      if (b === rt || b.kind === 'star') continue;
      if (b.group) b.group.visible = false;
    }
    for (const belt of scene.belts || []) {
      if (belt.group) belt.group.visible = false;
    }
    for (const c of scene.comets || []) {
      if (c.mesh) c.mesh.visible = false;
      if (c.group) c.group.visible = false;
    }
    this._titleHero = rt;
  }

  setHeroShip(id) {
    if (this.state !== 'title' || !SHIP_DEFS[id]) return;
    this.shipDefId = id;
    this._spawnShip(SHIP_DEFS[id]);
    this.ship.group.visible = true;
    this.ship.throttle = 0.55;
    this.heroSwitchedAt = this.time || 0;
  }

  // =========================================================================
  //  NEW / LOAD GAME
  // =========================================================================
  async newGame(shipId, callsign) {
    const hid = resolveShipId(shipId || 'aurora');
    this.shipDefId = (FLEET_IDS.includes(hid) && !SHIP_DEFS[hid]?.comingSoon) ? hid : 'aurora';
    this._warmHero();
    this.universe = generateUniverse();
    this.galaxy = galaxyById(this.universe, this.universe.homeId);
    this.campaign = createCampaign();
    this.tutorial = null;
    refreshUnlocks(this.campaign);
    this.stats = { distance: 0, scans: 0, kills: 0, mined: 0, earned: 0, jumps: 0, playtime: 0, discovered: 0, dockings: 0 };
    this.missions = [];
    this.missionOffers = {};
    this.gallery = {};
    this.callsign = callsign || 'NOVA-7';
    this.credits = 4200;
    this.cargo = {};
    seedLedger(this);
    this.upgrades = {};
    this.livery = '#3ec8ff';
    this.missiles = 8;
    this.missilesMax = 8;
    this.lockFrac = 0;
    this.lockNpc = null;
    this.rep = defaultRep();
    this.wanted = 0;
    this.chaff = 6;
    this.heatsinks = 4;
    this.pips = { sys: 2, eng: 2, wep: 2 };
    this.silent = false;
    this.autopilot = false;
    this.photo = false;
    this.storedShips = [];
    this.locker = {};
    this.insured = false;
    this._spawnShip(SHIP_DEFS[this.shipDefId] || SHIP_DEFS.aurora);
    this._tryAdoptHero();
    this.ship.credits = this.credits;
    this.ship.fuel = this.ship.maxFuel;
    this.menus.hideAll();
    this.state = 'loading';
    this.buildSystem(this.galaxy.systems[0].id, 'fresh');
    await this._primeStations();
    this.state = 'playing';
    this._curtain(240);
    this.renderer.toneMappingExposure = 1.12;
    if (this.fillLight) this.fillLight.intensity = 0.18;
    if (this.rimLight) this.rimLight.intensity = 0.2;
    this.applyQuality();
    this.menus.hideAll();
    document.body.classList.remove('storecap');
    const hudEl = document.getElementById('hud');
    if (hudEl) hudEl.style.visibility = '';
    this.input.enabled = true;
    document.body.style.cursor = 'none';
    this.input.centerStick();
    this.input.lockPointer();
    this.missiles = this.missilesMax || 8;
    this.hud.toasts.length = 0;
    this.hud.muteToasts = 0.6;
    onCampaignEvent(this, 'playstart');
    // Opening film commits hero stations on stop; if it does not run, reveal now.
    if (!this.cinema?.play('open')) {
      this.systemScene?.mountHeroStation?.((st) => this._pullShipOutOfStations());
    }
    this.achievements?.evaluate({ event: 'playstart' });
    this.save(true);
  }

  async startTutorial() {
    this.shipDefId = 'aurora';
    this._warmHero();
    this.tutorial = makeTutorial();
    if (!this.universe) this.universe = generateUniverse();
    this.galaxy = galaxyById(this.universe, this.universe.homeId) || this.universe.galaxies[0];
    this.campaign = createCampaign();
    this.stats = { distance: 0, scans: 0, kills: 0, mined: 0, earned: 0, jumps: 0, playtime: 0, discovered: 0, dockings: 0 };
    this.missions = [];
    this.missionOffers = {};
    this.callsign = 'CADET';
    this.shipDefId = 'aurora';
    this.credits = 4200;
    this.cargo = {};
    seedLedger(this);
    this.upgrades = {};
    this.livery = '#3ec8ff';
    this.missiles = 8;
    this.missilesMax = 8;
    this.lockFrac = 0;
    this.lockNpc = null;
    this.wanted = 0;
    this.chaff = 6;
    this.heatsinks = 4;
    this.pips = { sys: 2, eng: 2, wep: 2 };
    this.silent = false;
    this.autopilot = false;
    this.photo = false;
    this.storedShips = [];
    this.locker = {};
    this.insured = false;
    this.rep = defaultRep();
    this.gallery = {};
    this._spawnShip(SHIP_DEFS.aurora);
    this.ship.credits = this.credits;
    this.ship.fuel = this.ship.maxFuel;
    this.buildSystem(this.galaxy.systems[0].id, 'fresh');
    this.state = 'playing';
    this._curtain(240);
    this.renderer.toneMappingExposure = 1.12;
    if (this.fillLight) this.fillLight.intensity = 0.18;
    if (this.rimLight) this.rimLight.intensity = 0.2;
    this.applyQuality();
    this.menus.hideAll();
    document.body.classList.remove('storecap');
    const hudEl = document.getElementById('hud');
    if (hudEl) hudEl.style.visibility = '';
    this.input.enabled = true;
    document.body.style.cursor = 'none';
    this.input.centerStick();
    this.input.lockPointer();
    this.hud.toasts.length = 0;
    this.hud.muteToasts = 1.2;
    // Training has no opening film — commit deferred hero stations now.
    this.systemScene?.mountHeroStation?.((st) => this._pullShipOutOfStations());
    this._tutorialAssist();
    this._syncCoach(true);
  }

  endTutorial(reason = 'done') {
    const tut = this.tutorial;
    this.tutorial = tut ? { ...tut, done: true } : { done: true };
    this._syncCoach(false);
    if (reason === 'done') this.bigToast('RANGE COMPLETE', 'Title → NEW EXPEDITION starts the contract', 'good');
    else {
      this.menus.hideAll();
      this.hud.toast('Training ended. Career is untouched.', 'info', 4, true);
    }
    window.setTimeout(() => this.toTitle(), reason === 'done' ? 2800 : 600);
  }

  _tutorialStation() {
    const list = this.systemScene?.stations || [];
    return list.find((st) => /halcyon/i.test(st.data?.name || st.name || '')) || list[0] || null;
  }

  _careerHintOnce(flag, text, kind = 'info', ttl = 6.5) {
    const f = this.campaign?.flags;
    if (!f || f[flag]) return;
    f[flag] = true;
    this.hud?.toast(text, kind, ttl, true);
  }

  _tutorialAssist() {
    if (!this.tutorial || this.tutorial.done) return;
    const id = TUTORIAL_STEPS[this.tutorial.i]?.id;
    if (id === 'ping' && this.systemScene?.planets?.length) {
      const cur = this.target;
      const isPlanet = cur && (cur.kind === 'planet' || cur.data?.type);
      if (!isPlanet) {
        const p = this.systemScene.planets.find((x) => x.data?.type === 'terra' || x.data?.type === 'ocean') || this.systemScene.planets[0];
        if (p) this.setTarget(p, true);
      }
    }
    if (id === 'dock') {
      const st = this._tutorialStation();
      if (st && this.target !== st) this.setTarget(st, true);
      this.dockComp = false;
      this.autopilot = false;
      if (!this.tutorial.flags.dockSnap && st && this.ship) {
        this.tutorial.flags.dockSnap = true;
        const p = this.systemScene.getPos(st, new THREE.Vector3());
        this._poseOutside(p, this._stationVisualExtent(st) + 180, p.clone().add(new THREE.Vector3(0, 24, 0)));
        this.ship.velocity.set(0, 0, 0);
        this.ship.throttle = 0;
        this._snapChaseCam();
        this._curtain(160);
      }
    }
  }

  _syncCoach(show) {
    const el = document.getElementById('coach');
    if (!el) return;
    const on = show !== false && this.tutorial && !this.tutorial.done && this.state !== 'title' && this.state !== 'boot';
    el.classList.toggle('hidden', !on);
    if (!on) return;
    const c = coachTutorial(this.tutorial, this);
    el.classList.toggle('on-map', !!c.onMap);
    el.classList.toggle('nobar', c.bar === false);
    const step = document.getElementById('coachStep');
    const keys = document.getElementById('coachKeys');
    const dos = document.getElementById('coachDo');
    const wait = document.getElementById('coachWait');
    const tip = document.getElementById('coachTip');
    const bar = document.getElementById('coachBar');
    if (step) {
      const line = `${c.stepLine}  ·  ${c.title}`;
      if (step.textContent !== line) step.textContent = line;
    }
    if (keys) {
      const html = (c.keys || []).map((k) => `<kbd>${k}</kbd>`).join('');
      if (keys.innerHTML !== html) keys.innerHTML = html;
    }
    if (dos && dos.textContent !== c.do) dos.textContent = c.do;
    if (wait && wait.textContent !== c.wait) wait.textContent = c.wait;
    if (tip && tip.textContent !== c.tip) tip.textContent = c.tip;
    if (bar) bar.style.width = `${Math.round(clamp(c.progress || 0, 0, 1) * 100)}%`;
  }

  _tickTutorial(dt = 0.016) {
    if (!this.tutorial || this.tutorial.done) { this._syncCoach(false); return; }
    const id = TUTORIAL_STEPS[this.tutorial.i]?.id;
    if (id === 'ping') {
      if (this.input?.down('KeyF')) this.tutorial.fHold = (this.tutorial.fHold || 0) + dt;
      else this.tutorial.fHold = Math.max(0, (this.tutorial.fHold || 0) - dt * 0.85);
    }
    this._tutorialAssist();
    const { event } = advanceTutorial(this.tutorial, this);
    if (event === 'next') {
      Audio.uiClick();
      this._tutorialAssist();
    } else if (event === 'complete') {
      this.endTutorial('done');
      return;
    }
    this._syncCoach(true);
  }

  _spawnShip(def, scale) {
    if (this.ship) { this.ship.dispose(); }
    this.ship = new Ship(def, this.scene, scale ?? (def.id === 'aurora' ? 1.35 : 1.15));
    this.ship.isPlayer = true;
    this.ship.radius = 6.2;
    this.controller = new PlayerController(this.ship);
    this.ship.cargo = this.cargo || {};
    this.applyUpgrades();
    this._tryAdoptHero();
  }

  _warmHero() {
    if (this._heroWarm) return;
    this._heroWarm = true;
    import('../ship/hero.js?v=fix1').then(async (api) => {
      this._heroApi = api;
      await api.preloadImported('aurora');
      bustHeroThumbs();
      this._tryAdoptHero();
    }).catch((err) => console.warn('[hero] warm failed', err));
    import('../ship/missile.js?v=msk4').then(async (api) => {
      this._seekerApi = api;
      await api.preloadSeeker();
      if (this.projectiles?.adoptSeekerMeshes) this.projectiles.adoptSeekerMeshes();
    }).catch((err) => console.warn('[seeker] warm failed', err));
  }

  async _ensureHero(id = 'aurora') {
    this._warmHero();
    const t0 = performance.now();
    while (!this._heroApi && performance.now() - t0 < 12000) {
      await new Promise((r) => setTimeout(r, 40));
    }
    if (!this._heroApi) return false;
    if (this._heroApi.IMPORT_SPECS?.[id]) await this._heroApi.preloadImported(id);
    return !!(this._heroApi.importedReady?.(id) || (id === 'aurora' && this._heroApi.heroReady()));
  }

  _tryAdoptHero() {
    if (!this._heroApi) return;
    if (this.state === 'boot') return;
    const id = this.shipDefId;
    if (!id || !this.ship) return;
    if (!(this._heroApi.importedReady?.(id) || (id === 'aurora' && this._heroApi.heroReady()))) return;
    if (this.ship.mesh?.userData?.importId === id) return;
    const mesh = this._heroApi.makeImportedMesh?.(id, this.ship.scale)
      || (id === 'aurora' ? this._heroApi.makeHeroMesh(this.ship.scale) : null);
    if (mesh) this.ship.replaceHull(mesh);
  }

  applyUpgrades() {
    if (!this.ship || !this.shipDefId) return;
    const s = this.ship;
    const base = { ...SHIP_DEFS[this.shipDefId].stats };
    s.stats = { ...base };
    const up = this.upgrades || {};
    if (up.engine && !up.speed) {
      up.speed = up.engine;
      up.accel = up.engine;
      delete up.engine;
    }
    const lvl = (k) => up[k] || 0;
    s.stats.hull = Math.round(base.hull * (1 + 0.22 * lvl('hull')));
    s.stats.shield = Math.round(base.shield * (1 + 0.25 * lvl('shield')));
    s.stats.speed = Math.round(base.speed * (1 + 0.09 * lvl('speed')));
    s.stats.accel = Math.round(base.accel * (1 + 0.10 * lvl('accel')));
    s.stats.turn = +(base.turn * (1 + 0.05 * lvl('speed'))).toFixed(3);
    s.stats.cargo = base.cargo + 14 * lvl('cargo');
    s.stats.jumpRange = Math.round(base.jumpRange * (1 + 0.18 * lvl('fsd')));
    s.stats.mining = +(base.mining * (1 + 0.35 * lvl('mining'))).toFixed(2);
    this.missilesMax = 8 + 4 * lvl('ordnance');
    this.missiles = Math.min(this.missiles ?? 8, this.missilesMax);
    const hf = s.hull / Math.max(1, s.maxHull), sf = s.shield / Math.max(1, s.maxShield);
    s.maxHull = s.stats.hull; s.maxShield = s.stats.shield; s.maxFuel = s.stats.fuel;
    s.hull = clamp(s.maxHull * (isFinite(hf) ? hf : 1), 1, s.maxHull);
    s.shield = clamp(s.maxShield * (isFinite(sf) ? sf : 1), 0, s.maxShield);
    s.fuel = Math.min(s.fuel, s.maxFuel);
    if (this.livery) s.applyLivery?.(this.livery);
  }

  _migrateStoredShips(list, activeId) {
    const seen = new Set([activeId]);
    const out = [];
    for (const row of list || []) {
      const id = resolveShipId(row?.id);
      if (!id || seen.has(id) || !SHIP_DEFS[id]) continue;
      seen.add(id);
      out.push({ id, at: row.at || 'dock' });
    }
    return out;
  }

  ownsShip(id) {
    const hid = resolveShipId(id);
    if (hid === this.shipDefId) return true;
    return (this.storedShips || []).some((s) => s.id === hid);
  }

  lockerUsed() {
    let n = 0;
    for (const k in (this.locker || {})) n += this.locker[k];
    return n;
  }

  _stowOverflow(cap, station) {
    this.locker = this.locker || {};
    const reserved = {};
    for (const m of this.missions || []) {
      if (m.escrow && m.commodity) reserved[m.commodity] = (reserved[m.commodity] || 0) + m.amount;
    }
    let used = this.cargoUsed();
    if (used <= cap) return 0;
    let moved = 0;
    const keys = Object.keys(this.cargo);
    keys.sort((a, b) => (reserved[a] ? 1 : 0) - (reserved[b] ? 1 : 0));
    for (const k of keys) {
      if (used <= cap) break;
      const free = Math.max(0, (this.cargo[k] || 0) - (reserved[k] || 0));
      const take = Math.min(free, used - cap);
      if (take <= 0) continue;
      this.cargo[k] -= take;
      if (this.cargo[k] <= 0) delete this.cargo[k];
      this.locker[k] = (this.locker[k] || 0) + take;
      used -= take;
      moved += take;
    }
    if (used > cap) {
      for (const k of Object.keys(this.cargo)) {
        if (used <= cap) break;
        const take = Math.min(this.cargo[k] || 0, used - cap);
        if (take <= 0) continue;
        this.cargo[k] -= take;
        if (this.cargo[k] <= 0) delete this.cargo[k];
        this.locker[k] = (this.locker[k] || 0) + take;
        used -= take;
        moved += take;
      }
    }
    if (moved && station) this.lockerAt = station.name;
    return moved;
  }

  retrieveLocker(id, qty) {
    this.locker = this.locker || {};
    const have = Math.floor(this.locker[id] || 0);
    const space = Math.max(0, this.ship.stats.cargo - this.cargoUsed());
    const n = Math.min(qty, have, space);
    if (n <= 0) return 0;
    this.locker[id] -= n;
    if (this.locker[id] <= 0) delete this.locker[id];
    this.cargo[id] = (this.cargo[id] || 0) + n;
    this.ship.cargo = this.cargo;
    return n;
  }

  switchShip(id, station) {
    const hid = resolveShipId(id);
    if (!SHIP_DEFS[hid]) return { ok: false, reason: 'unknown' };
    if (SHIP_DEFS[hid].comingSoon) return { ok: false, reason: 'soon' };
    if (hid === this.shipDefId) return { ok: false, reason: 'same' };
    if (!shipUnlocked(this.campaign, hid)) return { ok: false, reason: 'locked' };
    const owned = this.ownsShip(hid);
    const cost = owned ? 0 : SHIP_DEFS[hid].price;
    if (this.credits < cost) return { ok: false, reason: 'credits' };
    this.credits -= cost;
    this.storedShips = this.storedShips || [];
    if (this.shipDefId && this.shipDefId !== hid && !this.storedShips.some((s) => s.id === this.shipDefId)) {
      this.storedShips.push({ id: this.shipDefId, at: (station && station.name) || 'dock' });
    }
    this.storedShips = this.storedShips.filter((s) => s.id !== hid);
    const pos = this.ship.position.clone(), quat = this.ship.quaternion.clone();
    this.shipDefId = hid;
    this._spawnShip(SHIP_DEFS[hid]);
    this._ensureHero(hid).then(() => this._tryAdoptHero());
    this.applyUpgrades();
    this.ship.position.copy(pos);
    this.ship.quaternion.copy(quat);
    const overflow = this._stowOverflow(this.ship.stats.cargo, station);
    this.ship.cargo = this.cargo;
    this.ship.sync();
    this.achievements?.evaluate();
    return { ok: true, bought: !owned && cost > 0, cost, overflow, name: SHIP_DEFS[hid].name };
  }

  /** jump range in light years */
  get jumpRangeLy() { return this.ship.stats.jumpRange / 240; }

  dockMult() { return dockPriceMult(this.rep, this.system?.faction?.id); }

  popChaff() {
    if ((this.chaff || 0) <= 0) { this.hud.toast('No chaff canisters', 'bad'); return; }
    this.chaff -= 1;
    this.chaffCloud = 2.8;
    let broke = 0;
    if (this.projectiles) for (const m of this.projectiles.missilePool) {
      if (m.life > 0 && m.target === this.ship && chaffBreaks(Math.random())) { m.target = null; broke++; }
    }
    this.particles.scanWave(this.ship.position, 18, '#ffe9b0');
    this.hud.toast(broke ? `CHAFF — ${broke} seeker(s) broken` : 'CHAFF DEPLOYED', 'good', 2.2);
    Audio.chaff();
  }

  dumpHeat() {
    if ((this.heatsinks || 0) <= 0) { this.hud.toast('No heat sinks', 'bad'); return; }
    this.heatsinks -= 1;
    this.heat = 0;
    this.hud.toast('HEAT SINK', 'good', 1.6);
    this.particles.sparks(this.ship.position, this.ship.up, 10, '#7fd0ff', 22);
    Audio.heatDump();
  }

  shiftPip(which) {
    const k = which === 1 ? 'sys' : which === 2 ? 'eng' : 'wep';
    this.pips[k] = Math.min(4, (this.pips[k] || 2) + 1);
    const others = ['sys', 'eng', 'wep'].filter((x) => x !== k);
    let drain = 1;
    for (const o of others) {
      const take = Math.min(drain, Math.max(0, this.pips[o] - 1));
      this.pips[o] -= take; drain -= take;
    }
    this.hud.toast(`PIPS  SYS ${this.pips.sys}  ENG ${this.pips.eng}  WEP ${this.pips.wep}`, 'info', 1.8);
  }

  hasSave(slot = 0) {
    try { return !!localStorage.getItem(saveSlotKey(slot)); } catch { return false; }
  }
  saveInfo(slot = this.saveSlot || 0) {
    try {
      const d = JSON.parse(localStorage.getItem(saveSlotKey(slot)) || 'null');
      if (!d) return null;
      return d;
    } catch { return null; }
  }

  async loadGame(slot = 0) {
    this.saveSlot = slot;
    const d = this.saveInfo(slot);
    if (!d) return false;
    this.shipDefId = resolveShipId(d.shipId || 'aurora');
    this._warmHero();
    this.universe = generateUniverse();
    this.galaxy = galaxyById(this.universe, d.galaxyId || this.universe.homeId) || this.universe.galaxies[0];
    if (d.galaxies) {
      for (const g of this.universe.galaxies) {
        const sv = d.galaxies[g.id];
        if (sv) { g.discovered = !!sv.discovered; g.visited = !!sv.visited; }
      }
    }
    Object.assign(this.stats, d.stats || {});
    this.campaign = migrateCampaign(d.campaign || createCampaign());
    if (!this.campaign.charts || typeof this.campaign.charts !== 'object') this.campaign.charts = {};
    for (const g of this.universe.galaxies) {
      if (g.visited && g.id !== this.universe.homeId && g.id !== 'veil' && g.id !== 'choir') this.campaign.charts[g.id] = true;
    }
    this.tutorial = null;
    refreshUnlocks(this.campaign);
    this.missions = d.missions || [];
    this.gallery = d.gallery || {};
    this.callsign = d.callsign || 'NOVA-7';
    this.shipDefId = resolveShipId(d.shipId || 'aurora');
    this.credits = d.credits || 0;
    this.cargo = d.cargo || {};
    restoreLedger(this, d);
    this.upgrades = d.upgrades || {};
    this.livery = d.livery || this.livery || '#3ec8ff';
    if (this.campaign) {
      this.campaign.scanIds = Array.isArray(this.campaign.scanIds) ? this.campaign.scanIds : [];
      if (!this.campaign.homeScans) this.campaign.homeScans = this.campaign.scanIds.length;
    }
    this.missiles = d.missiles ?? 8;
    this.rep = d.rep || defaultRep();
    this.wanted = d.wanted || 0;
    this.chaff = d.chaff ?? 6;
    this.heatsinks = d.heatsinks ?? 4;
    this.pips = d.pips || { sys: 2, eng: 2, wep: 2 };
    this.storedShips = this._migrateStoredShips(d.storedShips, this.shipDefId);
    this.locker = d.locker || {};
    this.lockerAt = d.lockerAt || '';
    this.insured = !!d.insured;
    this.lockFrac = 0;
    this.lockNpc = null;
    if (d.settings) {
      const keep = ['bloom', 'fxaa', 'pixelRatio', 'dynamicRes', 'vsync'];
      const held = {};
      for (const k of keep) held[k] = this.settings[k];
      Object.assign(this.settings, d.settings);
      for (const k of keep) this.settings[k] = held[k];
    }
    if (this.settings.vsync == null) this.settings.vsync = true;
    this.settings.vsync = this.settings.vsync !== false;
    if (!(this.settings.masterVol > 0)) this.settings.masterVol = 0.72;
    if (!(this.settings.sfxVol > 0)) this.settings.sfxVol = 0.82;
    if (!(this.settings.musicVol > 0)) this.settings.musicVol = 0.48;
    this.settings.muted = !!this.settings.muted;
    this._spawnShip(SHIP_DEFS[this.shipDefId] || SHIP_DEFS.aurora);
    this.applyUpgrades();
    // restore body flags
    for (const gal of this.universe.galaxies) {
      for (const s of gal.systems) {
        const sv = (d.systems || {})[s.id];
        if (sv) { s.discovered = !!sv.discovered; s.visited = !!sv.visited; }
        for (const p of s.planets) {
          const f = (d.bodies || {})[p.id];
          if (f) { p.discovered = !!f.d; p.scanned = !!f.s; p.pinged = !!(f.p || f.s); }
          for (const m of p.moons) {
            const fm = (d.bodies || {})[m.id];
            if (fm) { m.discovered = !!fm.d; m.scanned = !!fm.s; m.pinged = !!(fm.p || fm.s); }
          }
        }
        for (const w of s.wrecks) { const f = (d.bodies || {})[w.id]; if (f) { w.discovered = !!f.d; w.scanned = !!f.s; w.pinged = !!(f.p || f.s); w.distressPaid = !!f.k; } }
      }
    }
    this.state = 'loading';
    this.buildSystem(d.sysId || this.galaxy.systems[0].id, 'load');
    await this._primeStations();
    if (d.pos) this.ship.position.fromArray(d.pos);
    if (d.quat) this.ship.quaternion.fromArray(d.quat);
    if (d.vel) this.ship.velocity.fromArray(d.vel);
    this._ejectFromSolids();
    this._snapChaseCam();
    this._curtain(160);
    this.ship.hull = d.hull ?? this.ship.maxHull;
    this.ship.shield = d.shield ?? this.ship.maxShield;
    const fuelMove = migrateFuel(this.ship, d);
    if (fuelMove.migrated) this.fuelMigrated = true;
    if ((d.v || 1) < 3) {
      markLegacyRoutes(this, d.galaxies);
      legacyScanGrant(this);
    }
    if (this.route?.anchor?.built) ensurePocket(this.universe);
    shedOverflow(this);
    this.ship.cargo = this.cargo;
    this.ship.sync();
    this.state = 'playing';
    this.renderer.toneMappingExposure = 1.12;
    if (this.fillLight) this.fillLight.intensity = 0.18;
    if (this.rimLight) this.rimLight.intensity = 0.2;
    this.applyQuality();
    this.menus.hideAll();
    document.body.classList.remove('storecap');
    const hudEl = document.getElementById('hud');
    if (hudEl) hudEl.style.visibility = '';
    this.input.enabled = true;
    document.body.style.cursor = 'none';
    this.input.centerStick();
    this.input.lockPointer();
    this.bigToast('CAREER RESTORED', `${this.callsign} · ${fmtCredits(this.credits)} CR`, 'good');
    onCampaignEvent(this, 'load');
    this.achievements?.evaluate({ event: 'load', silent: true });
    return true;
  }

  save(silent = false, slot = this.saveSlot) {
    // Title/boot hold a preview Specter at 0 CR. Training must never smash CONTINUE.
    if (this.state === 'title' || this.state === 'boot' || this.tutorial) return false;
    this.saveSlot = Math.max(0, Math.min(2, (slot ?? this.saveSlot ?? 0) | 0));
    try {
      const ship = this.ship;
      const sys = this.system;
      const bodies = {};
      const systems = {};
      const galaxies = {};
      for (const gal of this.universe?.galaxies || []) {
        if (gal.discovered || gal.visited) galaxies[gal.id] = { discovered: gal.discovered ? 1 : 0, visited: gal.visited ? 1 : 0 };
        for (const s of gal.systems || []) {
          if (s.discovered || s.visited) systems[s.id] = { discovered: s.discovered ? 1 : 0, visited: s.visited ? 1 : 0 };
          for (const p of s.planets || []) {
            if (p.discovered || p.scanned || p.pinged) bodies[p.id] = { d: p.discovered ? 1 : 0, s: p.scanned ? 1 : 0, p: p.pinged ? 1 : 0 };
            for (const m of p.moons || []) if (m.discovered || m.scanned || m.pinged) bodies[m.id] = { d: m.discovered ? 1 : 0, s: m.scanned ? 1 : 0, p: m.pinged ? 1 : 0 };
          }
          for (const w of s.wrecks || []) if (w.discovered || w.scanned || w.pinged || w.distressPaid) bodies[w.id] = { d: w.discovered ? 1 : 0, s: w.scanned ? 1 : 0, p: w.pinged ? 1 : 0, k: w.distressPaid ? 1 : 0 };
        }
      }
      const data = {
        v: SAVE_V, ts: Date.now(), callsign: this.callsign, shipId: this.shipDefId || 'aurora',
        credits: this.credits, cargo: this.cargo || {},
        rp: this.rp || 0, kits: this.kits || 0, filters: this.filters || 0, transitCells: this.transitCells || 0,
        researched: this.researched || {}, expedition: this.expedition || null, fuelMigrated: true,
        ...careerSnapshot(this),
        hull: ship?.hull ?? 0, shield: ship?.shield ?? 0, fuel: ship?.fuel ?? 0,
        sysId: sys?.id || '',
        galaxyId: this.galaxy?.id || '',
        galaxies,
        pos: ship?.position?.toArray?.() || [0, 0, 0],
        quat: ship?.quaternion?.toArray?.() || [0, 0, 0, 1],
        vel: ship?.velocity?.toArray?.() || [0, 0, 0],
        stats: this.stats, missions: this.missions, gallery: this.gallery,
        campaign: this.campaign,
        upgrades: this.upgrades, missiles: this.missiles, livery: this.livery || '#3ec8ff',
        rep: this.rep, wanted: this.wanted, chaff: this.chaff, heatsinks: this.heatsinks,
        pips: this.pips, storedShips: this.storedShips, locker: this.locker, lockerAt: this.lockerAt || '', insured: !!this.insured,
        bodies, systems, settings: { ...this.settings }, quality: this.quality,
      };
      const json = JSON.stringify(data);
      try { localStorage.setItem(saveSlotKey(this.saveSlot), json); } catch { /* quota */ }
      pushNativeSave(this.saveSlot, json);
      if (!silent) this._saveFeedback(true);
      this.achievements?.syncStats();
      return true;
    } catch (err) {
      console.warn('[ASTRALIS] save failed', err);
      if (!silent) this._saveFeedback(false);
      return false;
    }
  }

  exportCareer() {
    this.save(true);
    let json = '';
    try { json = localStorage.getItem(saveSlotKey(this.saveSlot || 0)) || ''; } catch { json = ''; }
    if (!json) return false;
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `astralis-slot-${(this.saveSlot || 0) + 1}.json`;
    a.click();
    return true;
  }

  importCareer(text) {
    let data;
    try { data = JSON.parse(text); } catch { return { ok: false, reason: 'Not a career file' }; }
    if (!data || typeof data !== 'object') return { ok: false, reason: 'Empty file' };
    if ((data.v || 0) > SAVE_V) return { ok: false, reason: 'This file is newer than the game' };
    if (data.credits != null && !Number.isFinite(Number(data.credits))) return { ok: false, reason: 'Broken credits' };
    if (data.fuel != null && !Number.isFinite(Number(data.fuel))) return { ok: false, reason: 'Broken fuel' };
    const json = JSON.stringify(data);
    const slot = this.saveSlot || 0;
    try { localStorage.setItem(saveSlotKey(slot), json); } catch { return { ok: false, reason: 'Could not store the file' }; }
    pushNativeSave(slot, json);
    return { ok: true };
  }

  _saveFeedback(ok) {
    const n = (this.saveSlot | 0) + 1;
    if (ok) {
      this.hud?.toast(`Saved · slot ${n}`, 'good', 2.4, true);
      this.bigToast('SAVED', `Career slot ${n} · title → CONTINUE`);
    } else {
      this.hud?.toast('Save failed', 'bad', 3.2, true);
      this.bigToast('SAVE FAILED', 'Could not write this career');
    }
    const btn = document.querySelector('#pause [data-act="save"] span');
    if (btn) btn.textContent = ok ? `SAVED · SLOT ${n}` : 'SAVE FAILED';
    const hint = document.getElementById('saveHint');
    if (hint) hint.textContent = ok ? 'Written on this machine. Title → CONTINUE.' : 'Write failed — try again';
  }

  // =========================================================================
  //  SYSTEM BUILD
  // =========================================================================
  buildSystem(sysId, mode = 'fresh', focusId = null) {
    this._arrivalFocusId = focusId || null;
    const sys = systemById(this.galaxy, sysId);
    if (!sys) return;
    this.fuelProbe?.reset();
    if (this.surface) { this.surface.dispose(); this.surface = null; }
    // Atmosphere entry hides the deep-space backdrop. A system rebuild (most
    // notably ABANDON → title) must always restore it before showing the menu.
    if (this.background?.group) this.background.group.visible = true;
    this.scene.background = null;
    this.scene.fog = null;
    this.flightLayer = 'space';
    this.atmoPlanet = null;
    this._atmoFeel = null;
    this.controller?.clearAtmo();
    if (this.systemScene) {
      this.systemScene.clear();
      this.systemScene.root.parent?.remove(this.systemScene.root);
      this.systemScene = null;
    }
    this.system = sys;
    sys.discovered = true;
    sys.visited = true;
    for (const p of sys.planets) { p.discovered = true; for (const m of p.moons) m.discovered = true; }
    for (const w of sys.wrecks) w.discovered = true;
    for (const b of sys.belts) b.discovered = true;

    this.systemScene = new SystemScene(this.scene, this.galaxy);
    this.systemScene.allowHeroStation = mode !== 'preview' && mode !== 'fresh';
    this.systemScene.hideMainPort = mode === 'fresh';
    this.systemScene.onMainStation = (st) => this._pullShipOutOfStations();
    if (mode === 'fresh') preloadMainStation();
    this.systemScene.build(sys);
    this.bodies = this.systemScene.bodies;
    this.systemScene.update(0, this.time || 0, new THREE.Vector3(0, 0, 0));

    let outer = 40000;
    for (const p of sys.planets) outer = Math.max(outer, p.orbitRadius);
    this.navLimit = Math.min(Math.max(outer * 8 + 250000, 900000), 4e6);

    // background tint
    const tint = new THREE.Color(sys.nebulaTint);
    const nb = this.background.nebulaMat.uniforms;
    nb.uTintA.value.copy(tint).multiplyScalar(0.5);
    nb.uTintB.value.setHSL((tint.getHSL({}).h + 0.12) % 1, 0.72, 0.46).multiplyScalar(0.5);
    nb.uTintC.value.setHSL((tint.getHSL({}).h + 0.55) % 1, 0.55, 0.4).multiplyScalar(0.4);
    nb.uSeed.value = (sys.seed % 997) / 7.3;
    this.background.bake(this.renderer, this._nebulaBakeSize());
    this.ambientColor = new THREE.Color(sys.star.color).multiplyScalar(0.14);

    // arrival position
    this._placeArrival(mode);

    const rng = new RNG(sys.seed + 17);
    this._clearNpcs();
    this.projectiles && this.projectiles.clear();
    if (!this.projectiles) this.projectiles = new ProjectileManager(this.scene);
    this._spawnNpcs(sys, rng);

    this.target = null;
    this.heat = 0;
    this.jumpCharge = 0;
    this.jumpState = 'idle';
    this.scanProgress = 0;
    this.mineRock = null;
    this.dockPrompt = null;
    this.warpAmount = 0;
    if (mode === 'jump') this.hud.toast(`${sys.name} · ${sys.planets.length} worlds`, 'info', 3.2);
    if (sys.danger >= 3) Audio.alarm();
    this.checkMissions();
    if (mode === 'fresh' || mode === 'preview' || mode === 'respawn') {
      const homeWorld = this.systemScene.planets.find((p) => p.data.type === 'terra' || p.data.type === 'ocean') || this.systemScene.planets[0];
      if (homeWorld) this.setTarget(homeWorld, true);
    }
  }

  async _primeStations() {
    const el = document.getElementById('loadScreen');
    if (el) el.classList.remove('hidden');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      await preloadMainStation();
      const scene = this.systemScene;
      scene?.mountHeroStation?.();
      this._pullShipOutOfStations();
    } catch (err) {
      console.warn('[station] preload failed', err);
    } finally {
      if (this.ship) {
        this.ship.group.visible = true;
        if (this.ship.mesh) this.ship.mesh.visible = true;
        if (this.ship.shieldMesh) this.ship.shieldMesh.visible = true;
        this.ship.sync();
        this._snapChaseCam();
      }
      if (el) el.classList.add('hidden');
    }
  }

  _pullShipOutOfStations() {
    const s = this.ship;
    if (!s || !this.systemScene) return;
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (const st of this.systemScene.stations || []) {
      const ext = st.mesh?.userData?.extent;
      if (!(ext > 0)) continue;
      this.systemScene.getPos(st, p);
      if (s.position.distanceTo(p) > ext + 40) continue;
      const d = stationDistance(st, s.position, n, 30);
      if (d === Infinity || d > 20) continue;
      if (n.lengthSq() < 1e-6) n.copy(s.position).sub(p);
      if (n.lengthSq() < 1e-6) n.set(1, 0.2, 0);
      n.normalize();
      s.position.addScaledVector(n, 24 - d);
    }
    s.sync?.();
  }

  /** Farthest hull vertex from the station origin. dockRadius is the pad, not the mesh. */
  _stationVisualExtent(st) {
    if (st?.mesh?.userData?.extent) return st.mesh.userData.extent;
    const R = Math.max(st?.radius || 0, st?.data?.radius || 130, 40);
    const kind = st?.data?.kind || st?.kind || '';
    if (kind === 'hub_trade' || kind === 'hub_refinery' || kind === 'hub_survey') return R * 2.55;
    if (kind === 'shipyard' || kind === 'refinery') return R * 2.15;
    return R * 1.9;
  }

  _bodyVisualRadius(rt) {
    const r = rt?.radius || rt?.data?.radius || 80;
    let ext = r * 1.22;
    const atmoH = rt?.data?.atmo?.height;
    if (atmoH) ext = Math.max(ext, r * (1 + atmoH * 3.2) * 1.12);
    const outer = rt?.data?.rings?.outer;
    if (outer) ext = Math.max(ext, outer * 1.14);
    return ext;
  }

  _snapChaseCam() {
    if (!this.ship) return;
    this.camMode = 0;
    this._camOff = null;
    this._camLock = true;
    this.ship.sync();
    this._updateCamera(0.05);
    this._camLock = false;
    if (this.flightLayer !== 'atmo') {
      this.camera.near = 0.4;
      this.camera.far = 9e6;
      this.camera.updateProjectionMatrix();
    }
  }

  _curtain(hold = 200) {
    const fade = document.getElementById('fade');
    if (!fade) return;
    fade.classList.remove('hidden');
    fade.classList.add('on');
    window.setTimeout(() => {
      fade.classList.remove('on');
      window.setTimeout(() => fade.classList.add('hidden'), 500);
    }, hold);
  }

  _ejectFromSolids() {
    if (!this.ship || !this.systemScene) return;
    const s = this.ship;
    const pos = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let pass = 0; pass < 5; pass++) {
      let moved = false;
      for (const p of this.systemScene.planets || []) {
        pos.copy(p.group.position);
        const need = this._bodyVisualRadius(p) + 180;
        const d = s.position.distanceTo(pos);
        if (d < need) {
          if (d < 1e-3) n.copy(s.position).normalize();
          else n.copy(s.position).sub(pos).normalize();
          s.position.copy(pos).addScaledVector(n, need);
          moved = true;
        }
        for (const m of p.moons || []) {
          pos.copy(m.group.position);
          const mn = this._bodyVisualRadius(m) + 90;
          const md = s.position.distanceTo(pos);
          if (md < mn) {
            if (md < 1e-3) n.set(1, 0.2, 0).normalize();
            else n.copy(s.position).sub(pos).normalize();
            s.position.copy(pos).addScaledVector(n, mn);
            moved = true;
          }
        }
      }
      for (const st of this.systemScene.stations || []) {
        const hit = stationDistance(st, s.position, n, 40);
        if (hit === Infinity || hit >= 16) continue;
        s.position.addScaledVector(n, 18 - hit);
        moved = true;
      }
      const starR = (this.system?.star?.radius || 400) * 8;
      const sr = s.position.length();
      if (sr < starR) {
        s.position.multiplyScalar(starR / Math.max(sr, 1));
        moved = true;
      }
      if (!moved) break;
    }
  }

  _poseOutside(anchor, standoff, lookAt) {
    const radial = anchor.clone();
    if (radial.lengthSq() < 1e-6) radial.set(1, 0, 0);
    else radial.normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const along = new THREE.Vector3().crossVectors(up, radial);
    if (along.lengthSq() < 1e-6) along.set(0, 0, 1);
    else along.normalize();
    this.ship.position.copy(anchor)
      .addScaledVector(radial, standoff)
      .addScaledVector(up, 52)
      .addScaledVector(along, Math.min(90, standoff * 0.08));
    const aim = lookAt.clone();
    const look = new THREE.Matrix4().lookAt(this.ship.position, aim, up);
    this.ship.quaternion.setFromRotationMatrix(look);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.ship.quaternion);
    this.ship.velocity.copy(fwd).multiplyScalar(48);
    this.ship.throttle = 0.18;
    this._ejectFromSolids();
    this._snapChaseCam();
    this._spawnGrace = (this.time || 0) + 2.6;
  }

  _placeArrival(mode) {
    if (mode === 'load' || !this.ship) return;
    const focus = this._arrivalFocusId
      ? this.systemScene.stations.find((s) => s.data?.id === this._arrivalFocusId)
      : null;
    const st = focus || this.systemScene.stations[0];
    const planets = this.systemScene.planets || [];
    const inner = planets[0];
    const outer = planets[planets.length - 1];
    const pick = (mode === 'filament' && outer) ? outer : (st || inner);
    const anchor = new THREE.Vector3();
    if (pick) this.systemScene.getPos(pick, anchor);
    if (anchor.length() < 50) {
      const r = (st?.data?.orbitRadius || inner?.data?.orbitRadius || 12000);
      const a = st?.angle ?? 0.4;
      anchor.set(Math.cos(a) * r, 40, Math.sin(a) * r);
    }
    const cap = this.navLimit ? this.navLimit * 0.72 : 400000;
    if (anchor.length() > cap) anchor.multiplyScalar(cap / anchor.length());

    const isStation = !!(st && pick === st);
    const standoff = isStation
      ? this._stationVisualExtent(pick) + 200
      : this._bodyVisualRadius(pick) + 280;
    // Quarter-profile of the pad/world — never look through the hull at the star.
    const aim = anchor.clone().add(new THREE.Vector3(0, isStation ? 28 : 0, 0));
    this._poseOutside(anchor, standoff, aim);
  }

  _clearNpcs() {
    if (!this.npcs) this.npcs = [];
    for (const n of this.npcs) n.dispose();
    this.npcs = [];
  }

  _spawnNpcs(sys, rng) {
    const hostileCount = sys.danger <= 0 ? 0 : Math.min(6, sys.danger + (rng.chance(0.4) ? 1 : 0));
    for (let i = 0; i < hostileCount; i++) {
      const r = rng.range(16000, 90000);
      const a = rng.range(0, TAU);
      const pos = new THREE.Vector3(Math.cos(a) * r, rng.range(-1600, 1600), Math.sin(a) * r);
      const n = new NpcShip(this.scene, rng.int(0, 1), pos, {
        name: rng.pick(NPC_NAMES),
        faction: sys.faction.id === 'cul' ? 'Void Choir' : 'Pirate',
        hull: 70 + sys.danger * 32,
        shield: 45 + sys.danger * 26,
        bounty: 1600 + sys.danger * 980 + rng.int(0, 700),
        maxSpeed: 300 + sys.danger * 40,
        turn: 0.85 + sys.danger * 0.12,
        accuracy: 0.35 + sys.danger * 0.13,
        aggroRange: 11000,
        fireRange: 2400,
      });
      n.kind = 'ship';
      this.npcs.push(n);
    }
    // civilian traffic near stations
    const traffic = Math.min(4, sys.stations.length * 2 + (rng.chance(0.6) ? 1 : 0));
    for (let i = 0; i < traffic; i++) {
      const st = sys.stations[rng.int(0, Math.max(0, sys.stations.length - 1))];
      if (!st) break;
      const a = rng.range(0, TAU);
      const pos = new THREE.Vector3(Math.cos(a) * st.orbitRadius, rng.range(-500, 500), Math.sin(a) * st.orbitRadius);
      const n = new NpcShip(this.scene, rng.int(0, 1), pos, {
        hostile: false, name: `${sys.faction.name.split(' ')[0]} Freighter ${rng.int(100, 999)}`,
        faction: sys.faction.name, hull: 120, shield: 60, bounty: 0,
        maxSpeed: 200, turn: 0.6, aggroRange: 0, fireRange: 0, scale: 1.5,
      });
      n.kind = 'ship';
      n.hostile = false;
      this.npcs.push(n);
    }
    if ((this.wanted || 0) >= 2) {
      const r = rng.range(12000, 28000);
      const a = rng.range(0, TAU);
      const cop = new NpcShip(this.scene, 1, new THREE.Vector3(Math.cos(a) * r, 200, Math.sin(a) * r), {
        name: 'Concord Patrol', faction: 'Terran Concord', hostile: true,
        hull: 140, shield: 110, bounty: 0, maxSpeed: 340, turn: 1.1, aggroRange: 16000, fireRange: 2800,
      });
      cop.kind = 'ship';
      this.npcs.push(cop);
    }
    for (const m of (this.missions || [])) {
      if (m.type === 'hunt' && m.targetSystemId === sys.id && (m.progress || 0) < 1) this._spawnHunt(m);
    }
  }

  _spawnHunt(m) {
    if (!this.scene || this.npcs.some((n) => n.alive && n.name === m.targetName)) return;
    const a = Math.random() * TAU;
    const r = 22000 + Math.random() * 40000;
    const n = new NpcShip(this.scene, 1, new THREE.Vector3(Math.cos(a) * r, 400, Math.sin(a) * r), {
      name: m.targetName, faction: 'Pirate', hostile: true,
      hull: 160, shield: 140, bounty: Math.round(m.reward * 0.25),
      maxSpeed: 360, turn: 1.15, aggroRange: 14000, fireRange: 2600,
    });
    n.kind = 'ship';
    n.hunt = true;
    this.npcs.push(n);
    this.hud.toast(`HVT ${m.targetName} is in-system`, 'info', 4);
  }

  // =========================================================================
  //  TARGETING
  // =========================================================================
  getBodyWorldPos(rt, out) {
    if (rt.kind === 'star') return out.set(0, 0, 0);
    if (rt.kind === 'belt') {
      // nearest point on the belt ring
      const p = this.ship.position;
      const ang = Math.atan2(p.z, p.x);
      const r = rt.data.radius;
      return out.set(Math.cos(ang) * r, p.y * 0.2, Math.sin(ang) * r);
    }
    return this.systemScene.getPos(rt, out);
  }

  buildContacts() {
    const out = [];
    const cam = this.camera;
    const sp = this.ship.position;
    const v = this._tmpV3;
    for (const rt of this.bodies) {
      this.getBodyWorldPos(rt, v);
      const d = v.distanceTo(sp);
      if (rt.kind !== 'star' && d > 900000) continue;
      const data = rt.data;
      out.push({
        rt, worldPos: v.clone(), dist: d,
        radius: rt.kind === 'belt' ? rt.data.width * 0.5 : rt.radius,
        name: data.name || 'Unknown',
        kind: rt.kind,
        kindLabel: rt.kind === 'planet' ? PLANET_TYPES[data.type].label : rt.kind === 'moon' ? 'Moon' : rt.kind === 'station' ? 'Station · ' + ECONOMIES[data.economy].label : rt.kind === 'belt' ? 'Asteroid Belt' : rt.kind === 'wreck' ? 'Derelict' : rt.kind === 'comet' ? 'Comet' : 'Star',
        scanned: data.scanned,
        isTarget: this.target === rt,
        hullFrac: undefined,
        hostile: false,
      });
    }
    for (const n of this.npcs) {
      if (!n.alive) continue;
      const d = n.position.distanceTo(sp);
      if (d > 120000) continue;
      out.push({
        rt: n, worldPos: n.position.clone(), dist: d, radius: 9,
        name: n.name, kind: 'ship', kindLabel: n.hostile ? `Hostile · ${n.faction}` : `Civilian · ${n.faction}`,
        scanned: true, isTarget: this.target === n,
        hullFrac: n.hull / n.maxHull, hostile: n.hostile, locking: this.lockNpc === n, lockFrac: this.lockNpc === n ? this.lockFrac : 0,
      });
    }
    out.sort((a, b) => a.dist - b.dist);
    const stations = out.filter((c) => c.kind === 'station');
    const rest = out.filter((c) => c.kind !== 'station').slice(0, 40);
    return [...stations, ...rest];
  }

  setTarget(rt, quiet = false) {
    this.target = rt;
    if (quiet) return;
    Audio.scanPing();
    const name = rt.data?.name || rt.name || 'Target';
    this.hud.toast(`Target: ${name}`, 'info', 2.0);
  }

  _galaxyStationTargets() {
    const order = ['hub_survey', 'hub_trade', 'hub_refinery', 'hub_shipyard', 'hub_arsenal', 'orbital', 'outpost', 'gateway', 'shipyard', 'refinery'];
    const here = this.system?.id;
    const rows = [];
    for (const sys of this.galaxy?.systems || []) {
      for (const st of sys.stations || []) {
        const local = (this.systemScene?.stations || []).find((s) => s.data?.id === st.id) || null;
        rows.push({
          kind: 'station',
          remote: sys.id !== here,
          data: local?.data || st,
          system: sys,
          local,
          id: st.id,
        });
      }
    }
    rows.sort((a, b) => {
      const ai = order.indexOf(a.data?.kind);
      const bi = order.indexOf(b.data?.kind);
      const ak = ai < 0 ? 40 : ai;
      const bk = bi < 0 ? 40 : bi;
      if (ak !== bk) return ak - bk;
      return (a.system.id === here ? 0 : 1) - (b.system.id === here ? 0 : 1);
    });
    return rows;
  }

  cycleTarget(dir = 1) {
    const list = this._galaxyStationTargets();
    if (!list.length) {
      this.hud.toast('No stations charted in this galaxy', 'info', 2.2);
      return;
    }
    const cur = this.target?.data?.id || this.target?.id;
    let i = list.findIndex((t) => t.id === cur);
    if (i < 0) i = -1;
    i = (i + (dir >= 0 ? 1 : -1) + list.length) % list.length;
    const pick = list[i];
    const label = STATION_KIND_LABEL[pick.data?.kind] || 'Station';
    if (pick.local) this.setTarget(pick.local, true);
    else {
      this.target = pick;
      Audio.scanPing();
    }
    const where = pick.remote ? pick.system.name : 'this system';
    this.hud.toast(`${pick.data.name} · ${label} · ${where}`, 'info', 2.6);
  }

  cycleWorld(dir = 1) {
    const list = [];
    for (const p of this.systemScene?.planets || []) {
      list.push(p);
      for (const m of p.moons || []) list.push(m);
    }
    if (!list.length) {
      this.hud.toast('No worlds in this system', 'info', 2.2);
      return;
    }
    const cur = this.target;
    let i = list.indexOf(cur);
    if (i < 0) {
      const fwd = this.ship.forward;
      let best = 0;
      let bestAng = Infinity;
      list.forEach((rt, k) => {
        const wp = this.getBodyWorldPos(rt, this._tmpV);
        const to = this._tmpV2.copy(wp).sub(this.ship.position);
        const d = to.length() || 1;
        to.multiplyScalar(1 / d);
        const ang = Math.acos(clamp(to.dot(fwd), -1, 1));
        if (ang < bestAng) { bestAng = ang; best = k; }
      });
      i = best;
    } else {
      i = (i + dir + list.length) % list.length;
    }
    const pick = list[i];
    this.setTarget(pick, true);
    const kind = pick.kind === 'moon' ? 'MOON' : 'PLANET';
    this.hud.toast(`${pick.data?.name || 'WORLD'} · ${kind}`, 'info', 2.2);
  }

  targetFromCrosshair() {
    const fwd = this.camera.getWorldDirection(this._tmpV);
    let best = null, bestScore = Infinity;
    for (const c of this.contacts) {
      const to = this._tmpV2.copy(c.worldPos).sub(this.ship.position);
      const d = to.length();
      to.normalize();
      const ang = Math.acos(clamp(to.dot(fwd), -1, 1));
      const angSize = Math.atan2(Math.max(c.radius, c.kind === 'station' ? 800 : 0), d);
      const tol = c.kind === 'station' ? Math.max(angSize * 3, 0.14) : Math.max(angSize * 1.3, 0.035);
      if (ang < tol) {
        const score = ang / tol + d * 1e-6;
        if (score < bestScore) { bestScore = score; best = c.rt; }
      }
    }
    if (best) this.setTarget(best);
    else this.hud.toast('Nothing under the cross', 'info', 2);
  }

  get targetPos() {
    if (!this.target || this.target.remote) return null;
    if (this.target.kind === 'ship' || this.target instanceof NpcShip) return this.target.position;
    return this.getBodyWorldPos(this.target, new THREE.Vector3());
  }

  // =========================================================================
  //  JUMP
  // =========================================================================
  firstHopToward(sys) {
    if (!sys || !this.galaxy || sys.id === this.system?.id) return null;
    const byId = Object.fromEntries(this.galaxy.systems.map((s) => [s.id, s]));
    const start = this.system.id;
    const q = [start];
    const prev = { [start]: null };
    for (let i = 0; i < q.length; i++) {
      const id = q[i];
      if (id === sys.id) break;
      for (const n of byId[id]?.links || []) {
        if (prev[n] !== undefined || !byId[n]) continue;
        prev[n] = id;
        q.push(n);
      }
    }
    if (prev[sys.id] === undefined) return null;
    let cur = sys.id;
    while (prev[cur] && prev[cur] !== start) cur = prev[cur];
    return byId[cur] || null;
  }

  jumpQuote(sys) {
    if (!sys || sys.id === this.system?.id) return { here: true };
    const d = Math.hypot(sys.pos.x - this.system.pos.x, sys.pos.y - this.system.pos.y, sys.pos.z - this.system.pos.z);
    const ly = d / 100;
    const inRange = ly <= this.jumpRangeLy;
    const fuelCost = Math.max(1, Math.round(ly * 0.22));
    const hop = inRange ? null : this.firstHopToward(sys);
    let hopLy = 0, hopFuel = 0;
    if (hop) {
      hopLy = Math.hypot(hop.pos.x - this.system.pos.x, hop.pos.y - this.system.pos.y, hop.pos.z - this.system.pos.z) / 100;
      hopFuel = Math.max(1, Math.round(hopLy * 0.22));
    }
    const hopOk = !!(hop && hop.id !== this.system.id && hopLy <= this.jumpRangeLy);
    return { here: false, d, ly, inRange, fuelCost, hop, hopLy, hopFuel, hopOk };
  }

  jumpToSystem(sys, stationId) {
    if (!sys || sys.id === this.system.id) return;
    if (this.flightLayer === 'atmo') {
      this.hud.toast('Leave the atmosphere first, then confirm the jump', 'bad', 4);
      return;
    }
    const quote = this.jumpQuote(sys);
    let target = sys;
    let relay = false;
    if (!quote.inRange && quote.hopOk) {
      target = quote.hop;
      relay = true;
    } else if (!quote.inRange) {
      this.hud.toast('Out of drive range — no relay hop on this chart', 'bad', 4);
      return;
    }
    if (this.fuelProbe?.active) {
      this.hud.toast('Recall the fuel probe before the jump (X)', 'bad', 4);
      return;
    }
    const need = relay ? quote.hopFuel : quote.fuelCost;
    const paid = trySpendFuel(this.ship, need);
    if (!paid.ok) {
      this.hud.toast(`Jump needs ${paid.need} fuel · tank ${Math.round(paid.have)}`, 'bad', 4.5);
      return;
    }
    this.stats.jumps++;
    this.achievements?.evaluate();
    this.maps.close();
    this._syncMapState();
    if (relay) this.hud.toast(`Relay hop · ${target.name} · toward ${sys.name}`, 'info', 6, true);
    const landId = relay ? null : stationId;
    const landName = landId && (sys.stations || []).find((st) => st.id === landId)?.name;
    this.jumpCinematic(`${relay ? 'RELAY' : 'FRAME SHIFT'} · ${(landName || target.name).toUpperCase()}`, () => {
      this.buildSystem(target.id, 'jump', landId);
      if (landId) {
        const pad = this.systemScene?.stations?.find((x) => x.data?.id === landId);
        if (pad) this.setTarget(pad, true);
      }
      if ((this.wanted || 0) >= 2) {
        this.hud.toast('INTERDICTION — Concord patrol dropped with you', 'bad', 5);
      }
      onCampaignEvent(this, 'jump', { storyTag: target.storyTag, danger: target.danger, id: target.id });
    });
  }

  canSpaceJump() {
    if (this.flightLayer === 'atmo') return false;
    if (!this.ship || !this.system) return false;
    const r = this.ship.position.length();
    const starR = this.system.star?.radius || 80;
    if (r < starR * 10) return false;
    return canFrameShift(this.system.star.massSolar || 1, auFromGameOrbit(Math.max(80, r)));
  }

  inFilamentReady() {
    if (this.state === 'docked') return true;
    return this.canSpaceJump();
  }

  jumpToGalaxy(galId) {
    if (!this.universe || galId === this.galaxy.id) return;
    if (!galaxyOpen(this.campaign, galId)) {
      this.hud.toast(galaxyLockReason(this.campaign, galId, this.universe.homeId) || 'Galaxy sealed', 'bad', 7);
      return;
    }
    const dest = galaxyById(this.universe, galId);
    if (!dest) return;
    const massT = Math.max(12, (this.ship.stats.hull || 100) * 0.35);
    const q = transitQuote(this.universe, this.galaxy.id, galId, massT);
    if (!q) {
      this.hud.toast('No filament to that galaxy — pick a neighbour on the pink lines', 'bad', 6);
      return;
    }
    if (this.flightLayer === 'atmo') {
      this.hud.toast('Leave the atmosphere first, then confirm transit', 'bad', 4);
      return;
    }
    if (this.fuelProbe?.active) {
      this.hud.toast('Recall the fuel probe before transit (X)', 'bad', 4);
      return;
    }
    if (galId === POCKET_ID) {
      this.hud.toast('The Veil is an anchor hop, not a filament on this chart', 'bad', 5);
      return;
    }
    const paid = commitTransit(this, galId);
    if (!paid.ok) {
      this.hud.toast(paid.reason || 'Transit refused', paid.story ? 'bad' : 'info', 5);
      return;
    }
    this.stats.jumps++;
    this.maps.close();
    this.state = 'playing';
    document.body.style.cursor = 'none';
    this._syncMapState();
    const drop = dest.systems.find((s) => s.hasGate) || dest.systems[dest.systems.length - 1] || dest.systems[0];
    this.filament = {
      t: 0, dur: 8.0, dest, dropId: drop.id,
      tidal: q.tidalG || 1, name: dest.name, type: dest.type, kappa: dest.curvature,
    };
    this.hudCinematic = 1;
    this.input.enabled = false;
    this.bigToast('FILAMENT CORRIDOR', `${dest.name} · ${q.fil.dMly} Mly · κ ${q.fil.curvature}`, 'info');
    document.getElementById('jumpText').textContent = `FILAMENT · ${dest.name.toUpperCase()}`;
    const fx = document.getElementById('jumpFx');
    fx.classList.remove('hidden');
    fx.classList.add('fire');
  }

  _tickFilament(dt) {
    const f = this.filament;
    if (!f) return false;
    this.fuelProbe?.reset();
    f.t += dt;
    const u = clamp(f.t / f.dur, 0, 1);
    const s = this.ship;
    const fwd = s.forward;
    s.throttle = 1;
    s.velocity.copy(fwd).multiplyScalar(4200 + u * 18000);
    s.position.addScaledVector(fwd, s.velocity.length() * dt * 0.35);
    this.hud.shake = Math.max(this.hud.shake, 0.18 + f.tidal * 0.05 + u * 0.35);
    this.afterimage.enabled = true;
    this.afterimage.uniforms.damp.value = 0.82 + u * 0.12;
    if (this.diamondPass?.uniforms?.uHeat) this.diamondPass.uniforms.uHeat.value = 0.25 + u * 0.85;
    this.particles.warpStreak(s.position, fwd, 0.45 + u);
    this.particles.update(dt);
    this.background.update(dt * (1 + u * 4), this.camera.position, 1, this.camera);
    s.sync();
    s.updateVisuals(dt, this.time, this.camera.position);
    this._updateCamera(dt);
    if (f.t >= f.dur) {
      const dest = f.dest, dropId = f.dropId, name = f.name, type = f.type, kappa = f.kappa;
      this.filament = null;
      this.hudCinematic = 0;
      this.input.enabled = true;
      this.afterimage.enabled = false;
      if (this.diamondPass?.uniforms?.uHeat) this.diamondPass.uniforms.uHeat.value = 0;
      document.getElementById('jumpFx').classList.remove('fire');
      document.getElementById('jumpFx').classList.add('hidden');
      this.galaxy = dest;
      dest.discovered = true;
      dest.visited = true;
      this.buildSystem(dropId, 'filament');
      this.hud.toast(`Halo insertion · ${name} · ${type} · κ=${kappa}`, 'good', 7);
      this.bigToast('GALAXY TRANSIT', name, 'info');
      this._filamentRides = (this._filamentRides || 0) + 1;
      onCampaignEvent(this, 'filament', { galaxyId: dest.id });
      this.achievements?.evaluate({ event: 'filament' });
    }
    return true;
  }

  jumpCinematic(text, cb, ms = 3400) {
    this.fuelProbe?.reset();
    const fx = document.getElementById('jumpFx');
    document.getElementById('jumpText').textContent = text;
    fx.classList.remove('hidden');
    void fx.offsetWidth;
    fx.classList.add('fire');
    Audio.jumpCharge();
    setTimeout(() => Audio.jumpFire(), Math.min(1500, ms * 0.4));
    const fade = document.getElementById('fade');
    fade.classList.remove('hidden');
    const mid = ms * 0.55;
    setTimeout(() => fade.classList.add('on'), mid - 400);
    setTimeout(() => {
      cb && cb();
      fade.classList.remove('on');
    }, mid);
    setTimeout(() => { fx.classList.remove('fire'); fx.classList.add('hidden'); }, ms);
    setTimeout(() => fade.classList.add('hidden'), ms - 200);
  }

  // =========================================================================
  //  MINING / SCANNING
  // =========================================================================
  findMineRock() {
    const fwd = this.ship.forward;
    const sp = this.ship.position;
    this._mineLocal = this._mineLocal || new THREE.Vector3();
    this._mineWp = this._mineWp || new THREE.Vector3();
    this._mineTo = this._mineTo || new THREE.Vector3();
    let best = null, bestScore = Infinity;
    let nearBelt = false;
    const belts = this.systemScene?.belts || [];
    for (const belt of belts) {
      if (!belt.group) continue;
      const local = belt.group.worldToLocal(this._mineLocal.copy(sp));
      for (const r of belt.rocks) {
        if (!r.alive) continue;
        const dx = r.pos.x - local.x, dy = r.pos.y - local.y, dz = r.pos.z - local.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 9000) nearBelt = true;
        if (d > MINE_PROSPECT_RANGE) continue;
        const wp = this._mineWp.copy(r.pos).applyMatrix4(belt.group.matrixWorld);
        const to = this._mineTo.copy(wp).sub(sp);
        const dist = to.length() || 1;
        to.multiplyScalar(1 / dist);
        const ang = Math.acos(clamp(to.dot(fwd), -1, 1));
        const sizeRad = Math.atan2(Math.max(r.size, 5) * 2.6, d);
        const tol = Math.max(sizeRad, d < 420 ? 0.62 : d < MINE_CUT_RANGE ? 0.28 : 0.12);
        // Tight nose-on only — no loose side-catch (that stole F after leaving a planet).
        if (ang < tol) {
          const score = ang * 1.6 + d * 1e-4;
          if (score < bestScore) {
            bestScore = score;
            best = { rock: r, belt, worldPos: wp.clone(), dist: d, source: 'belt', ang };
          }
        }
      }
    }
    this._nearBelt = nearBelt;
    return best;
  }

  stationBulletins(station) {
    if (!station) return [];
    const slice = bulletinSlice(this.stats.playtime);
    if (station._bulletinSlice === slice && station.bulletins) return station.bulletins;
    const rng = new RNG(station.seed + slice * 9173);
    station.bulletins = rollBulletins((pool) => rng.pick(pool), station.economy, station.kind, rng.int(2, 4));
    station._bulletinSlice = slice;
    return station.bulletins;
  }

  // =========================================================================
  //  COMBAT
  // =========================================================================
  firePrimary() {
    const s = this.ship;
    if (!s || !s.alive || s.cooldown > 0 || this.heat >= 1) return;
    const n = Math.min(s.stats.hardpoints, s.hardpoints.length) || 1;
    s.cooldown = n >= 4 ? 0.15 : 0.19;
    this.heat = Math.min(1.35, this.heat + 0.04 * Math.min(2, n));
    const bank = n >= 4 ? (this._gunBank = 1 - (this._gunBank || 0)) : 0;
    const start = n >= 4 ? bank * 2 : 0;
    const count = n >= 4 ? 2 : n;
    for (let k = 0; k < count; k++) {
      const origin = s.hardpointWorld(start + k).addScaledVector(s.forward, 6.4);
      const dir = s.forward.clone().addScaledVector(s.right, (k % 2 ? 1 : -1) * 0.0028);
      dir.normalize();
      const p = this.projectiles.fire(origin, dir, {
        speed: 1950, life: 1.45, dmg: 15 + 5 * ((this.pips?.wep || 2) / 2), owner: s,
        color: s.def.colors.glowEmit === '#ff9a4d' ? '#ffb066' : '#7fe8ff',
      });
      if (p) p.vel.add(s.velocity);
    }
    s.velocity.addScaledVector(s.forward, -4.5);
    Audio.laser();
    this.hud.shake = Math.max(this.hud.shake, 0.045);
    this.particles.sparks(s.hardpointWorld(start).addScaledVector(s.forward, 6.4), s.forward, 3, '#bfe8ff', 18);
  }

  _updateMissileLock(dt) {
    const s = this.ship;
    if (!s || this.flightLayer === 'atmo' || !this.npcs) {
      this.lockFrac = 0; this.lockNpc = null; this._lockTone = 0; return;
    }
    let n = (this.target instanceof NpcShip && this.target.alive && this.target.hostile) ? this.target : null;
    if (!n) {
      let best = 0.9;
      for (const x of this.npcs) {
        if (!x.alive || !x.hostile) continue;
        const d = s.position.distanceTo(x.position);
        if (d > 12000) continue;
        const align = s.forward.dot(this._tmpV2.copy(x.position).sub(s.position).normalize());
        if (align > best) { best = align; n = x; }
      }
    }
    if (!n || !n.alive) {
      this.lockFrac = Math.max(0, (this.lockFrac || 0) - dt * 0.85);
      this._lockTone = 0;
      if (this.lockFrac <= 0.04) this.lockNpc = null;
      return;
    }
    const d = s.position.distanceTo(n.position);
    const align = s.forward.dot(this._tmpV2.copy(n.position).sub(s.position).normalize());
    // ~2.2 s of solid nose-on dwell before the rail will release.
    if (d < 12000 && align > 0.9) {
      this.lockFrac = Math.min(1, (this.lockFrac || 0) + dt * (0.32 + 0.55 * clamp((align - 0.9) / 0.1, 0, 1)));
      this.lockNpc = n;
      if (this.lockFrac >= 1 && !this._lockReadyNote) {
        this._lockReadyNote = true;
        this.hud.toast('LOCK SOLID — RMB RELEASES SEEKER', 'good', 2.6);
        Audio.uiClick();
      } else if (this.lockFrac > 0.15 && this.lockFrac < 1) {
        const tick = Math.floor(this.lockFrac * 6);
        if (tick !== this._lockTone) {
          this._lockTone = tick;
          Audio.uiHover?.();
        }
      }
    } else {
      this.lockFrac = Math.max(0, (this.lockFrac || 0) - dt * 1.05);
      this._lockReadyNote = false;
      this._lockTone = 0;
      if (this.lockFrac <= 0.04) this.lockNpc = null;
    }
  }

  fireMissile() {
    const s = this.ship;
    if (s.missileCooldown > 0) return;
    if ((this.missiles ?? 0) <= 0) { this.hud.toast('No seekers left — restock ordnance on a pad', 'bad'); return; }
    const seek = this.lockNpc && this.lockNpc.alive && (this.lockFrac || 0) >= 1 ? this.lockNpc : null;
    if (!seek) {
      this.hud.toast('NO LOCK — hold a hostile in the reticle until LOCK SOLID', 'bad', 2.8);
      return;
    }
    this.missiles -= 1;
    s.missileCooldown = 2.1;
    this.lockFrac = 0.2;
    this._lockReadyNote = false;
    this._lockTone = 0;
    // Rail under the hardpoint: shove clear, then motor.
    const origin = s.hardpointWorld(0).addScaledVector(s.forward, 1.2).addScaledVector(s.up, -0.55);
    const dir = s.forward.clone();
    const drop = s.up.clone().multiplyScalar(-18).addScaledVector(s.right, (Math.random() < 0.5 ? -1 : 1) * 6);
    this.projectiles.fireMissile(origin, dir, seek, {
      dmg: 125, owner: s, inherit: s.velocity, drop,
      dropSpeed: 38, motorDelay: 0.42, armDelay: 0.55, speed: 920, boost: 2400, life: 10,
    });
    Audio.missileLaunch();
    this.hud.shake = Math.max(this.hud.shake, 0.08);
    this.particles.sparks(origin, dir, 6, '#ff9a40', 18);
    this.hud.toast('SEEKER AWAY', 'info', 1.6);
  }

  npcFire(origin, dir, owner) {
    const danger = this.system?.danger || 1;
    if (owner.hostile && this.ship?.alive !== false && Math.random() < 0.055 * danger) {
      this.projectiles.fireMissile(origin, dir, this.ship, { dmg: 32 + danger * 6, owner, speed: 480, life: 6.5 });
      this.particles.sparks(origin, dir, 5, '#ff7a40', 16);
      return;
    }
    const p = this.projectiles.fire(origin, dir, { speed: 2000, life: 2.5, dmg: 8 + danger * 2.5, owner, color: '#ff6a5c', big: true });
    if (p) p.vel.addScaledVector(owner.velocity, 0.4);
    Audio.laser();
    this.particles.sparks(origin, dir, 2, '#ffb0a0', 12);
  }

  // =========================================================================
  //  DOCKING
  // =========================================================================
  dock(stationRT) {
    this.fuelProbe?.reset();
    this.state = 'docked';
    this.dockedAt = stationRT;
    Audio.dock();
    this.stats.dockings++;
    this.ship.velocity.set(0, 0, 0);
    this.ship.shield = this.ship.maxShield;
    const tons = illegalTons(this.cargo, COMMODITIES);
    if (tons > 0 && (this.system.faction?.id === 'fed' || this.system.danger < 2)) {
      const fine = contrabandFine(tons, this.wanted);
      this.credits = Math.max(0, this.credits - fine);
      this.wanted = Math.min(10, (this.wanted || 0) + 1);
      this.rep = addRep(this.rep, this.system.faction?.id, -12);
      this.hud.toast(`CUSTOMS SCAN — contraband · −${fmtCredits(fine)} CR fine`, 'bad', 6);
    } else if ((this.wanted || 0) > 0 && this.system.faction?.id === 'fed') {
      const fine = 400 * this.wanted;
      this.credits = Math.max(0, this.credits - fine);
      this.hud.toast(`OUTSTANDING WRITS · −${fmtCredits(fine)} CR`, 'bad', 4);
    }
    onCampaignEvent(this, 'dock', { stationId: stationRT.data.id, danger: this.system.danger });
    this.achievements?.evaluate();
    noteTutorial(this.tutorial, 'dock');
    if (!this.tutorial && !this.campaign.flags.padPitch && stationRT.data.kind === 'hub_trade') {
      this.campaign.flags.padPitch = true;
      this.hud.toast('CONTRACTS — ration run posted. One jump, 9.8k CR. Then you mine.', 'money', 6.5);
    }
    this.lastPort = { galaxyId: this.galaxy?.id || '', sysId: this.system?.id || '', stationId: stationRT.data?.id || '' };
    const back = grantReturnBonus(this);
    if (back.ok) this.hud.toast(`First full return · +${back.gained} RP`, 'good', 4);
    if ((this.debt || 0) > 0) this.hud.toast(`Rescue debt ${this.debt} CR · rewards pay 20% toward it`, 'info', 3.5);
    const ready = accessRows(this).filter((r) => r.state === 'available' || r.state === 'short');
    if (ready.length && stationRT.data?.kind === 'hub_survey') {
      const line = ready.map((r) => `${r.label}${r.state === 'short' ? ' (need cargo)' : ''}`).join(', ');
      this.hud.toast(`OBSERVATORY · ${line}`, 'info', 4.5);
    }
    this.menus.openStation(stationRT.data);
    this.dockComp = false;
    this.autopilot = false;
    document.body.style.cursor = 'default';
    if (this.ship.fuel < this.ship.maxFuel - 1) {
      this.hud.toast('Tank stays as you landed — buy fuel in SERVICES', 'info', 3.6);
    }
    this.save(true);
  }

  callRescue() {
    this.debt = Math.min(6000, (this.debt || 0) + 1500);
    const port = this.lastPort;
    const gal = port?.galaxyId && this.universe ? this.universe.galaxies.find((g) => g.id === port.galaxyId) : null;
    if (gal) this.galaxy = gal;
    const sysId = port?.sysId || this.galaxy?.systems?.[0]?.id;
    if (sysId) this.buildSystem(sysId, 'jump');
    const st = this.systemScene?.stations?.[0];
    if (st) {
      const p = this.systemScene.getPos(st, new THREE.Vector3());
      this._poseOutside(p, this._stationVisualExtent(st) + 220, p.clone().add(new THREE.Vector3(0, 40, 0)));
    }
    if (this.ship) this.ship.fuel = Math.max(this.ship.fuel || 0, Math.min(this.ship.maxFuel || 40, 40));
    this.hud.toast(`Rescue tow · debt ${this.debt} CR · tank topped to a safe reserve`, 'info', 5);
    this.save(true);
  }

  jumpToAnchor() {
    const returning = this.galaxy?.id === POCKET_ID;
    const gate = anchorJumpGate(this, returning);
    if (!gate.ok) {
      this.hud.toast(gate.reason || 'Anchor hop refused', 'bad', 5);
      return;
    }
    const paid = trySpendFuel(this.ship, gate.fuelNeed);
    if (!paid.ok) {
      this.hud.toast(`Need ${paid.need} fuel · tank ${Math.round(paid.have)}`, 'info', 4);
      return;
    }
    let destId = this.route.anchor.homeSys;
    let destGal = this.route.anchor.homeGalaxy || this.universe?.homeId;
    if (!returning) {
      this.transitCells = Math.max(0, (this.transitCells || 0) - 1);
      const pocket = ensurePocket(this.universe);
      destGal = pocket.id;
      destId = pocket.systems[0]?.id;
    } else {
      this.route.anchor.reservedCell = false;
    }
    const dest = this.universe.galaxies.find((g) => g.id === destGal);
    if (!dest) {
      this.hud.toast('Anchor chart missing', 'bad', 4);
      return;
    }
    this.galaxy = dest;
    dest.visited = true;
    dest.discovered = true;
    this.maps?.close();
    this.jumpCinematic(returning ? 'ANCHOR RETURN' : 'VEIL ANCHOR', () => {
      this.buildSystem(destId || dest.systems[0].id, 'jump');
    });
  }

  undock() {
    const st = this.dockedAt;
    this.menus.hideAll();
    this.state = 'playing';
    document.body.style.cursor = 'none';
    this.input.centerStick();
    this.save();
    if (this.campaign) this.campaign.flags.stationFull = true;
    if (st) {
      const p = this.systemScene.getPos(st, new THREE.Vector3());
      this._poseOutside(p, this._stationVisualExtent(st) + 200, p.clone().add(new THREE.Vector3(0, 28, 0)));
    }
    this.dockedAt = null;
    this._undockGrace = (this.time || 0) + 2.4;
  }

  enterAtmosphere(planetRT) {
    if (this.flightLayer === 'atmo' || this._leavingAtmo) return;
    if (this._exitGrace && this.time < this._exitGrace) return;
    const denied = landingBlock(this, planetRT?.data);
    if (denied) {
      this.hud.toast(denied, 'bad', 4.5);
      return;
    }
    this.fuelProbe?.reset();
    // A space autopilot target is a system-space coordinate. Leaving it active
    // in the planet-local surface frame would steer the ship out of the scene.
    this.autopilot = false;
    this.dockComp = null;
    this.flightLayer = 'atmo';
    this._surfaceAgl = null;
    this.atmoPlanet = planetRT;
    this._atmoFog0 = null;
    if (this.surface) this.surface.dispose();
    try {
      this.surface = new PlanetSurface(this.scene, planetRT.data, planetRT.data.seed || 1, this.system.star);
      const probe = this.surface.heightAt(0, 0);
      if (!Number.isFinite(probe)) throw new Error('surface');
    } catch (err) {
      this.surface?.dispose();
      this.surface = null;
      this.flightLayer = 'space';
      this.atmoPlanet = null;
      if (this.systemScene?.root) this.systemScene.root.visible = true;
      if (this.background?.group) this.background.group.visible = true;
      if (this.expedition && this.expedition.phase === 'ready') abortExpedition(this);
      this.hud.toast('Surface did not come up — you are still in orbit. An unstarted expedition was not charged.', 'bad', 5);
      return;
    }
    this.surface.setViewRadius(this.quality === 'low' ? 2 : 3);
    if (this.systemScene?.root) this.systemScene.root.visible = false;
    if (this.background?.group) this.background.group.visible = false;
    for (const n of this.npcs) if (n.group) n.group.visible = false;
    this._atmoFill = this.fillLight?.intensity;
    this._atmoRim = this.rimLight?.intensity;
    if (this.fillLight) this.fillLight.intensity = 0.08;
    if (this.rimLight) this.rimLight.intensity = 0.06;
    this._curtain(180);
    let y0 = this.surface.heightAt(0, 0);
    for (let i = -4; i <= 4; i++) {
      for (let j = -4; j <= 4; j++) {
        y0 = Math.max(y0, this.surface.heightAt(i * 320, j * 320));
      }
    }
    this.controller.resetAtmo(0, -0.08);
    this.ship.quaternion.setFromEuler(new THREE.Euler(-0.08, 0, 0, 'YXZ'));
    this.ship.sync();
    const L = Math.max(8, (this.ship.mesh?.userData.length || 10) * (this.ship.scale || 1));
    const fwd = this.ship.forward;
    y0 = Math.max(y0, this.surface.heightAt(-fwd.x * L * 6, -fwd.z * L * 6));
    // Start low enough to see the local terrain immediately after the dive,
    // while keeping a generous margin above the sampled landing area.
    y0 += 64;
    this.ship.position.set(0, y0, 0);
    this._atmoOrigin = new THREE.Vector3(0, y0, 0);
    const ph = planetRT.data.physics;
    const feel = flightFeel(planetRT.data.type, ph);
    this._atmoFeel = feel;
    this._entryT = feel.entryDur ?? 2.4;
    this.ship.velocity.set(fwd.x * 72, 0, fwd.z * 72);
    this.ship.throttle = 0.72;
    this.ship.sync();
    this._snapChaseCam();
    if (this.ship) this.ship.gearDown = false;
    const g = ph?.g ?? planetRT.data.gravity ?? 1;
    this.hud.toast(`ENTRY · ${PLANET_TYPES[planetRT.data.type]?.label || feel.label} · ${g.toFixed(2)} g`, 'info', 4.6);
    this.hud.toast(feel.toast, feel.crushDmg || feel.heatDmg || feel.acidDmg ? 'bad' : 'info', 5.6);
    const vein = planetMine(planetRT.data.type);
    if (vein) this.hud.toast(`Surface veins · ${vein.label} · hold F to prospect, keep holding to cut`, 'info', 5);
    onCampaignEvent(this, 'atmosphere', { story: planetRT.data.story, name: planetRT.data.name, signal: planetRT.data.story === 'signal' });
  }

  exitAtmosphere() {
    if (this.flightLayer !== 'atmo' || this._leavingAtmo) return;
    this._leavingAtmo = true;
    const pl = this.atmoPlanet;
    if (this.ship) this.ship.gearDown = false;
    Audio.gear(false);
    const fade = document.getElementById('fade');
    if (fade) {
      fade.classList.remove('hidden');
      void fade.offsetWidth;
      fade.classList.add('on');
    }
    window.setTimeout(() => this._commitExitAtmosphere(pl), 560);
  }

  _commitExitAtmosphere(pl, quiet) {
    this.surface?.dispose();
    this.surface = null;
    this._surfaceAgl = null;
    this._atmoOrigin = null;
    this.flightLayer = 'space';
    this._entryT = 0;
    this._leavingAtmo = false;
    this._atmoFeel = null;
    this.controller?.clearAtmo();
    this._exitGrace = this.time + 3.4;
    // Drop surface tool state so F returns to orbital scan, not a leftover vein/cut.
    this.mineRock = null;
    this.poiPrompt = null;
    this.mining = false;
    this.prospecting = false;
    this.dumping = false;
    this.fMode = null;
    this.scanHud = null;
    this._nearBelt = false;
    if (this._miningSound) { Audio.stopMining(); this._miningSound = false; }
    this.beam?.hide?.();
    if (this.diamondPass?.uniforms?.uHeat) this.diamondPass.uniforms.uHeat.value = 0;
    if (this.systemScene?.root) this.systemScene.root.visible = true;
    if (this.fillLight && this._atmoFill != null) this.fillLight.intensity = this._atmoFill;
    if (this.rimLight && this._atmoRim != null) this.rimLight.intensity = this._atmoRim;
    if (this.background?.group) this.background.group.visible = true;
    for (const n of this.npcs) if (n.alive && n.group) n.group.visible = true;
    this.scene.background = null;
    this.scene.fog = null;
    this.camera.near = 0.18;
    this.camera.far = 9e6;
    this.camera.updateProjectionMatrix();
    if (pl) {
      const p = pl.group.position.clone();
      const out = p.lengthSq() < 1 ? new THREE.Vector3(0, 1, 0) : p.clone().normalize();
      const tangent = new THREE.Vector3(0, 1, 0).cross(out);
      if (tangent.lengthSq() < 1e-4) tangent.set(1, 0, 0).cross(out);
      tangent.normalize();
      const dir = out.clone().multiplyScalar(0.76).addScaledVector(tangent, 0.58).addScaledVector(new THREE.Vector3(0, 1, 0), 0.16);
      dir.normalize();
      const alt = this._bodyVisualRadius(pl) + 280;
      this.ship.position.copy(p).addScaledVector(out, alt);
      this.ship.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
      this.ship.velocity.copy(dir).multiplyScalar(480);
      this.ship.throttle = 0.48;
      this.ship.angVel.set(0, 0, 0);
      this.ship.sync();
    }
    this.atmoPlanet = null;
    this._camOff = null;
    this._camLock = true;
    this._updateCamera(0.02);
    this._camLock = false;
    const fade = document.getElementById('fade');
    if (fade) {
      fade.classList.remove('on');
      window.setTimeout(() => fade.classList.add('hidden'), 700);
    }
    if (!quiet) this.hud.toast(pl?.data?.name ? `ORBIT · ${pl.data.name}` : 'ORBIT RECOVERED', 'good', 3);
  }

  // =========================================================================
  //  MISSIONS
  // =========================================================================
  offerMissions(station) {
    if (this.missionOffers[station.id]) {
      const cached = this.missionOffers[station.id].filter((x) => !x.pad);
      this.missionOffers[station.id] = [...this.listPadJobs(station), ...cached];
      return this.missionOffers[station.id];
    }
    const rng = new RNG(station.seed + Math.floor(this.stats.playtime / 900));
    const list = [...this.listPadJobs(station)];
    const n = rng.int(3, 5);
    const gal = this.galaxy;
    const hubs = gal.hubs || [];
    for (let i = 0; i < n; i++) {
      const type = rng.weighted(['cargo', 'courier', 'survey', 'bounty', 'hunt'], (t) => ({ cargo: 5, courier: 3, survey: 3, bounty: this.system.danger > 0 ? 3 : 1, hunt: this.system.danger > 1 ? 2 : 1 }[t]));
      const allStations = [];
      for (const s of gal.systems) for (const st of s.stations) if (st.id !== station.id) allStations.push({ st, sys: s });
      if (!allStations.length) continue;
      let dest = rng.pick(allStations);
      const dist0 = Math.hypot(dest.sys.pos.x - this.system.pos.x, dest.sys.pos.y - this.system.pos.y, dest.sys.pos.z - this.system.pos.z);
      const base = {
        id: `${station.id}-m${i}-${rng.int(1000, 9999)}`,
        type, origin: station.id, originName: station.name, originSystem: this.system.name,
        destId: dest.st.id, destName: dest.st.name, destSystem: dest.sys.name,
        distance: dist0, expires: this.stats.playtime + rng.range(1400, 3400),
      };
      if (type === 'cargo') {
        const com = rng.pick(COMMODITIES.filter((c) => c.legal && c.id !== 'fuel' && c.id !== 'data'));
        const hub = pickCircuitDest(com.id, station.id, hubs, null);
        if (hub) {
          const sys = gal.systems.find((s) => s.id === hub.systemId);
          const st = sys && (sys.stations || []).find((x) => x.id === hub.id);
          if (st && sys) dest = { st, sys };
        }
        base.destId = dest.st.id; base.destName = dest.st.name; base.destSystem = dest.sys.name;
        base.distance = Math.hypot(dest.sys.pos.x - this.system.pos.x, dest.sys.pos.y - this.system.pos.y, dest.sys.pos.z - this.system.pos.z);
        base.commodity = com.id;
        base.commodityName = com.name;
        base.amount = rng.chance(0.42) ? rng.int(4, 12) : rng.int(16, 40);
        const unit = 72 + Math.sqrt(com.base) * 5.4;
        base.reward = Math.round(base.amount * unit * (1.2 + base.distance * 0.04) * rng.range(0.95, 1.22));
        base.desc = `Transport ${base.amount}t of ${com.name} to ${dest.st.name} in ${dest.sys.name}.`;
        base.hullHint = 'aurora';
        base.hullHintWhy = base.amount > 16 ? 'Aurora hold is 16t — locker the rest at the pad' : 'Aurora hold is enough';
      } else if (type === 'courier') {
        base.amount = rng.int(1, 3);
        base.commodity = 'passengers';
        base.commodityName = 'Passengers';
        const hops = Math.min(14, Math.max(0.4, (base.distance || dist0) / 100));
        base.reward = Math.round(base.amount * 1100 * (1.15 + hops * 0.22) * rng.range(0.9, 1.2));
        base.desc = `Carry ${base.amount} passenger${base.amount > 1 ? 's' : ''} to ${dest.st.name} in ${dest.sys.name}. Do not ask what's in the crate.`;
        base.hullHint = 'aurora';
        base.hullHintWhy = 'Aurora — small passenger rack';
      } else if (type === 'survey') {
        const targetSys = rng.chance(0.6) ? this.system : rng.pick(gal.systems);
        base.count = rng.int(2, 5);
        base.progress = 0;
        base.targetSystemId = targetSys.id;
        base.destId = station.id; base.destName = station.name; base.destSystem = this.system.name;
        base.reward = Math.round(base.count * 2600 * rng.range(0.9, 1.4));
        base.desc = `Complete detailed survey scans of ${base.count} uncharted bod${base.count > 1 ? 'ies' : 'y'} in ${targetSys.name}, then report back here.`;
        const hot = (targetSys.danger || 0) > 1;
        base.hullHint = 'aurora';
        base.hullHintWhy = hot ? 'Aurora — fly quiet, scan, leave' : 'Aurora — survey sensors';
      } else if (type === 'bounty') {
        const targetSys = gal.systems.filter((s) => s.danger > 0);
        const ts = targetSys.length ? rng.pick(targetSys) : this.system;
        base.count = rng.int(2, 4);
        base.progress = 0;
        base.targetSystemId = ts.id;
        base.destId = station.id; base.destName = station.name; base.destSystem = this.system.name;
        base.reward = Math.round(base.count * 1900 * (1 + ts.danger * 0.25) * rng.range(0.9, 1.3));
        base.desc = `Eliminate ${base.count} hostile contacts in ${ts.name}. Return here for payment.`;
        base.hullHint = 'aurora';
        base.hullHintWhy = 'Aurora — two guns, get in and out';
      } else {
        const targetSys = gal.systems.filter((s) => s.danger > 0);
        const ts = targetSys.length ? rng.pick(targetSys) : this.system;
        base.type = 'hunt';
        base.count = 1;
        base.progress = 0;
        base.targetName = rng.pick(NPC_NAMES);
        base.targetSystemId = ts.id;
        base.destId = station.id; base.destName = station.name; base.destSystem = this.system.name;
        base.reward = Math.round(5200 * (1 + ts.danger * 0.3) * rng.range(0.95, 1.35));
        base.desc = `Kill ${base.targetName} in ${ts.name}. One hull. No substitutes.`;
        base.hullHint = 'specter';
        base.hullHintWhy = 'Specter — interceptor, arrive unseen';
      }
      list.push(base);
    }
    this.missionOffers[station.id] = list;
    return list;
  }

  listPadJobs(station) {
    if (this.tutorial) return [];
    const flags = this.campaign?.flags || {};
    return padJobs(station, this.galaxy?.hubs || [], this.stats.playtime, flags);
  }

  acceptMission(m) {
    if (this.missions.length >= 6) { this.hud.toast('Mission log full (6 active)', 'bad'); return false; }
    if ((m.type === 'cargo' || m.type === 'courier') && !m.produce) {
      const space = this.ship.stats.cargo - this.cargoUsed();
      if (space < m.amount) { this.hud.toast(`Not enough cargo space (${space}t free)`, 'bad'); return false; }
      this.cargo[m.commodity] = (this.cargo[m.commodity] || 0) + m.amount;
      m.escrow = true;
    }
    m.acceptedAt = this.stats.playtime;
    this.missions.push(m);
    // A signed contract includes its destination's navigation packet. The
    // route must be readable on the galaxy chart even before the player has
    // visited the system, otherwise a named delivery turns into guessing.
    if (m.destSystemId) {
      const dest = this.galaxy?.systems?.find((sys) => sys.id === m.destSystemId);
      if (dest) dest.discovered = true;
    }
    if (m.type === 'hunt' && m.targetSystemId === this.system?.id) this._spawnHunt(m);
    this.hud.toast(m.pad ? `${m.title} accepted · ${m.destName}` : `Contract accepted: ${m.type.toUpperCase()}`, 'good', 4.2);
    return true;
  }

  cargoUsed() {
    return holdMass(this);
  }

  tradeFill(station, id, qty, selling) {
    const it = station?.market?.find((x) => x.id === id);
    const com = COMMODITIES.find((c) => c.id === id);
    if (!it || !com) return it;
    Object.assign(it, shiftListedPrice(it, com.base, qty, selling));
    return it;
  }

  cashSurveyData(station) {
    const n = Math.floor(this.cargo.data || 0);
    if (n <= 0) return 0;
    const listed = (station?.market || []).find((x) => x.id === 'data')?.price || 760;
    const pay = surveyDataPayout(n, listed);
    delete this.cargo.data;
    this.ship.cargo = this.cargo;
    this.credits += pay;
    this.stats.earned += pay;
    return pay;
  }

  buyNavChart() {
    const here = this.system;
    const linked = (here.links || []).map((id) => this.galaxy.systems.find((s) => s.id === id)).filter((s) => s && !s.discovered);
    const cand = linked[0] || this.galaxy.systems.find((s) => s.id !== here.id && !s.discovered);
    if (!cand) return { ok: false, reason: 'none' };
    const cost = 420;
    if (this.credits < cost) return { ok: false, reason: 'credits', cost };
    this.credits -= cost;
    cand.discovered = true;
    return { ok: true, name: cand.name, cost };
  }

  checkMissions(event, mission) {
    // called on scan / kill / dock — never bump story contracts here
    for (const m of this.missions) {
      if (m.story) continue;
      if (m.type === 'survey' && event === 'scan') {
        if (mission && mission.systemId === m.targetSystemId) {
          m.progress = (m.progress || 0) + 1;
          if (m.progress >= m.count) this.hud.toast(`Survey contract complete — return to ${m.destName}`, 'money', 6);
        }
      }
      if (m.type === 'bounty' && event === 'kill') {
        if (this.system.id === m.targetSystemId) {
          m.progress = (m.progress || 0) + 1;
          if (m.progress >= m.count) this.hud.toast(`Bounty contract complete — return to ${m.destName}`, 'money', 6);
        }
      }
      if (m.type === 'hunt' && event === 'kill' && mission && mission.name === m.targetName) {
        m.progress = 1;
        this.hud.toast(`HVT down — ${m.targetName}. Return to ${m.destName}`, 'money', 6);
      }
    }
  }

  tryCompleteMissions(stationId) {
    let paid = 0, count = 0;
    for (let i = this.missions.length - 1; i >= 0; i--) {
      const m = this.missions[i];
      if (m.destId !== stationId) continue;
      if (m.story && m.type !== 'cargo' && m.type !== 'courier') continue;
      let ok = false;
      if (m.type === 'cargo' || m.type === 'courier') {
        if ((this.cargo[m.commodity] || 0) >= m.amount) {
          this.cargo[m.commodity] -= m.amount;
          if (this.cargo[m.commodity] <= 0) delete this.cargo[m.commodity];
          ok = true;
        }
      } else if ((m.progress || 0) >= m.count) ok = true;
      if (ok) {
        const latePenalty = lateFactor(this.stats.playtime, m.expires);
        const pay = Math.round(m.reward * latePenalty);
        this.credits += pay;
        this.stats.earned += pay;
        this.achievements?.evaluate();
        paid += pay;
        count++;
        this.rep = addRep(this.rep, this.system.faction?.id, 3);
        if (m.id && String(m.id).startsWith('pad-ration')) {
          if (this.campaign) this.campaign.flags.rationDone = true;
          this.missionOffers = {};
          this.hud.toast('Ration run paid. Mine this belt, smelt, haul plate to Halcyon.', 'money', 6.5);
        }
        if (m.id && String(m.id).startsWith('pad-plate')) {
          if (this.campaign) this.campaign.flags.plateDone = true;
          this.missionOffers = {};
          this.hud.toast('Plate run paid. The board is yours — watch HUB BULLETIN for spikes.', 'money', 6);
        }
        this.missions.splice(i, 1);
      }
    }
    if (paid > 0 && (this.debt || 0) > 0) {
      const skim = Math.min(this.debt, Math.round(paid * 0.2));
      this.credits = Math.max(0, this.credits - skim);
      this.debt -= skim;
      if (skim > 0) this.hud.toast(`Debt payment ${skim} CR · ${this.debt} CR left`, 'info', 3);
    }
    return { paid, count };
  }

  // =========================================================================
  //  DEATH
  // =========================================================================
  die(cause) {
    if (this.state === 'dead') return;
    abortExpedition(this);
    this.fuelProbe?.reset();
    this.state = 'dead';
    Audio.explosion(3.2);
    this.particles.explosion(this.ship.position, 3.4, '#ffd27a', '#ff5a1e');
    this.shock.fire(this.ship.position, '#ffe6b0', 40, 1.4);
    this.hud.shake = 1.4;
    this.hud.damageFlash = 1.6;
    this.ship.group.visible = false;
    this.ship.alive = false;
    this.scanArray?.update(0.016, this.ship, null, false);
    document.body.style.cursor = 'default';
    setTimeout(() => this.menus.openDeath(cause), 1500);
  }

  respawn() {
    const price = SHIP_DEFS[this.shipDefId].price;
    const cost = insuranceExcess(this.credits, price, this.insured);
    const keep = cargoKeepFrac(this.insured);
    this.credits = Math.max(250, this.credits - cost);
    this.ship.group.visible = true;
    this.ship.alive = true;
    this._spawnShip(SHIP_DEFS[this.shipDefId]);
    this.ship.credits = this.credits;
    this.ship.cargo = this.cargo;
    this.applyUpgrades();
    this.missiles = 0;
    for (const k of Object.keys(this.cargo)) {
      if (this.pinned?.[k]) continue;
      if (k === 'data' && this.campaign?.flags?.crate) continue;
      this.cargo[k] = tonsQty(this.cargo[k] * keep);
      if (this.cargo[k] <= 0) delete this.cargo[k];
    }
    this.insured = false;
    let st = this.systemScene.stations[0];
    if (!st) {
      // jump home
      this.buildSystem(this.galaxy.systems[0].id, 'respawn');
      st = this.systemScene.stations[0];
    }
    if (st) {
      const p = this.systemScene.getPos(st, new THREE.Vector3());
      this._poseOutside(p, this._stationVisualExtent(st) + 200, p.clone().add(new THREE.Vector3(0, 28, 0)));
    } else {
      this.ship.position.set(20000, 0, 20000);
      this.ship.velocity.set(0, 0, 0);
      this._snapChaseCam();
    }
    this.ship.hull = this.ship.maxHull;
    this.ship.shield = this.ship.maxShield;
    this.ship.fuel = this.ship.maxFuel;
    this.ship.sync();
    this.menus.hideAll();
    this.state = 'playing';
    document.body.style.cursor = 'none';
    this.input.centerStick();
    restoreStoryCargo(this);
    this.hud.toast(`Insurance clone activated · −${fmtCredits(cost)} CR`, 'bad', 5);
    onCampaignEvent(this, 'respawn');
    this.save();
  }

  // =========================================================================
  //  UI helpers
  // =========================================================================
  bigToast(title, sub, kind = '') {
    const host = document.getElementById('toastHost');
    const el = document.createElement('div');
    el.className = 'bigtoast ' + kind;
    el.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    host.appendChild(el);
    setTimeout(() => el.remove(), 3400);
  }

  // =========================================================================
  //  MAIN LOOP
  // =========================================================================
  _loop(ts) {
    requestAnimationFrame(this._loop);
    if (this.settings.vsync !== false && ts != null) {
      const minMs = 1000 / this._vsyncCapHz();
      if (this._lastPresent != null && (ts - this._lastPresent) < minMs * 0.86) return;
      this._lastPresent = ts;
    }
    let dt = this._clock.getDelta();
    dt = Math.min(dt, this.maxDt || 0.05);
    this.time = (this.time || 0) + dt;
    this.fps = lerp(this.fps || 60, 1 / Math.max(dt, 1e-4), 0.08);
    this._logPerf();

    this._globalKeys();
    this.input.relaxStick(dt);
    if (this.state === 'playing' || this.state === 'title') this._governResolution(dt);
    // Unlimited mouse look while flying: native host captures deltas; browsers
    // need a click for Pointer Lock. Re-assert capture every so often if lost.
    if (this.state === 'playing' && !this.autopilot && this.settings.mouseSteer) {
      const locked = this.input.mouse.locked || this.input._nativeMouse;
      if (!locked) {
        this._wantMouseLock = (this._wantMouseLock || 0) + dt;
        // Browser Pointer Lock needs a gesture — left click still works.
        if (this.input.buttonPressed.left || this._wantMouseLock > 0.35) {
          this.input.lockPointer();
          this._wantMouseLock = 0;
        }
      } else this._wantMouseLock = 0;
    } else if (this.state !== 'playing' && (this.input.mouse.locked || this.input._nativeMouse)) {
      this.input.unlockPointer();
    }
    if (this.filament) {
      this._tickFilament(dt);
      if (this.diamondPass?.uniforms?.uTime) this.diamondPass.uniforms.uTime.value = this.time || 0;
      this.render(dt);
      this.input.endFrame();
      return;
    }
    if (this.state === 'playing') this.update(dt);
    else {
      // keep the world alive visually when paused/map/docked
      this._idleUpdate(dt);
      // title/hero camera runs *after* the world moved, in the same frame —
      // a separate setInterval fought the rAF cadence and read as shake
      if (this.onIdleFrame) this.onIdleFrame(dt);
    }
    this.render(dt);
    this.input.endFrame();
  }

  _globalKeys() {
    const i = this.input;
    if (i.hit('F12')) { i.pressed.delete('F12'); this.captureStoreShot(); }
    const st = this.state;
    if (this.cinema?.active) {
      if (i.hit('Escape') || i.hit('KeyP')) { i.pressed.delete('Escape'); i.pressed.delete('KeyP'); this.cinema.skipAll(); return; }
      if (i.hit('Space') || i.hit('Enter') || i.hit('NumpadEnter')) {
        i.pressed.delete('Space'); i.pressed.delete('Enter'); i.pressed.delete('NumpadEnter');
        this.cinema.skipShot();
        return;
      }
      return;
    }
    if (st === 'boot') return;
    if (st === 'title') {
      if (i.hit('F9')) { i.pressed.delete('F9'); this.photo = !this.photo; }
      return;
    }
    if (i.hit('F5')) { i.pressed.delete('F5'); this.save(); }
    if (this.filament) return;
    if (i.hit('Escape')) {
      i.pressed.delete('Escape');
      if (this._briefingOpen()) { this.menus.closeBriefing(); return; }
      if (!this.el_modalHidden()) { this.menus.closeModal(); }
      else if (st === 'map') { this.maps.close(); this._syncMapState(); }
      else if (st === 'paused') this.resume();
      else if (st === 'docked') this.game_undockSafe();
      else if (st === 'playing') this.pause();
      return;
    }
    if (st === 'map') {
      if (i.hit('Enter') || i.hit('NumpadEnter')) {
        i.pressed.delete('Enter'); i.pressed.delete('NumpadEnter');
        this.maps.confirm();
        return;
      }
      if (i.hit('KeyM') || i.hit('KeyG') || i.hit('KeyU')) {
        i.pressed.delete('KeyM'); i.pressed.delete('KeyG'); i.pressed.delete('KeyU');
        this.maps.close(); this._syncMapState();
      }
    }
    if (st === 'playing' && i.hit('KeyF1')) { this.menus.openControls(); }
  }

  el_modalHidden() { return document.getElementById('modal').classList.contains('hidden'); }
  _briefingOpen() { return !document.getElementById('briefing')?.classList.contains('hidden'); }
  game_undockSafe() { if (this.state === 'docked') this.undock(); }

  _buildEnvironment() {
    // tiny procedural HDR environment so metallic hulls have something to reflect
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = new THREE.Scene();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(60, 32, 20),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        vertexShader: 'varying vec3 vN; void main(){ vN = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `varying vec3 vN;
          void main(){
            float h = vN.y * 0.5 + 0.5;
            vec3 col = mix(vec3(0.006, 0.008, 0.014), vec3(0.09, 0.11, 0.16), smoothstep(0.05, 0.9, h));
            col = mix(col, vec3(0.10, 0.16, 0.26), pow(max(0.0, vN.y), 1.4));
            col += vec3(0.25, 0.7, 1.0) * pow(max(0.0, 1.0 - abs(vN.y) * 2.4), 4.0) * 0.22;
            col += vec3(0.9, 0.3, 0.6) * pow(max(0.0, dot(vN, normalize(vec3(-0.55, 0.2, 0.5)))), 12.0) * 0.35;
            col += vec3(1.1, 0.95, 0.65) * pow(max(0.0, dot(vN, normalize(vec3(0.4, 0.35, -0.7)))), 6.0) * 0.35;
            col += vec3(0.7, 0.75, 0.95) * pow(max(0.0, dot(vN, normalize(vec3(0.1, 0.9, 0.2)))), 10.0) * 0.18;
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    env.add(dome);
    // broad, soft key card instead of a pin-point star: metals pick up a
    // gradient highlight rather than hard white blobs
    const starDisc = new THREE.Mesh(new THREE.SphereGeometry(11, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.85, 0.78, 0.62) }));
    starDisc.position.set(36, 16, -20);
    env.add(starDisc);
    const starB = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.6, 0.9) }));
    starB.position.set(-28, 10, -18);
    env.add(starB);
    this.scene.environment = pmrem.fromScene(env, 0.04).texture;
    pmrem.dispose();
    dome.geometry.dispose(); dome.material.dispose(); starDisc.geometry.dispose(); starDisc.material.dispose();
    starB.geometry.dispose(); starB.material.dispose();
  }

  _idleUpdate(dt) {
    if (this.systemScene) this.systemScene.update(dt * (this.state === 'title' ? 0.1 : 0.25), this.time, this.camera.position);
    this.background.update(dt, this.camera.position, 0, this.camera);
    if (this.state !== 'title') {
      this.particles.update(dt);
      this.shock.update(dt);
    }
    if (this.state !== 'dead' && this.ship) this.ship.updateVisuals(dt, this.time, this.camera.position);
    if (this.maps.mode) this.maps.draw(dt);
    this.hud.draw({ hidden: true, dt });
    Audio.updateEngine(0, 0, false, false, false);
    Audio.setMusicIntensity(this.state === 'title' ? 0.2 : 0.12);
    if (this.gradePass?.uniforms?.uTime) this.gradePass.uniforms.uTime.value = this.time || 0;
    if (this.diamondPass?.uniforms?.uTime) this.diamondPass.uniforms.uTime.value = this.time || 0;
    this._tickTutorial(dt);
  }

  update(dt) {
    if (this.cinema?.active) {
      this.fuelProbe?.reset();
      this.cinema.tick(dt);
      this.cinema.applyCamera(dt);
      if (this.gradePass?.uniforms?.uTime) this.gradePass.uniforms.uTime.value = this.time || 0;
      if (this.diamondPass?.uniforms?.uTime) this.diamondPass.uniforms.uTime.value = this.time || 0;
      return;
    }
    const s = this.ship;
    this.stats.playtime += dt;
    s.cooldown = Math.max(0, s.cooldown - dt);
    s.missileCooldown = Math.max(0, s.missileCooldown - dt);
    this.heat = Math.max(0, this.heat - dt * (0.42 + (this.silent ? 0.35 : 0) + (this.pips?.sys || 2) * 0.04));
    this.chaffCloud = Math.max(0, (this.chaffCloud || 0) - dt);

    for (let i = this.missions.length - 1; i >= 0; i--) {
      const m = this.missions[i];
      if (m.story) continue;
      if (missionExpired(this.stats.playtime, m.expires)) {
        this.hud.toast(`Contract expired: ${m.type}`, 'bad', 4);
        this.rep = addRep(this.rep, this.system?.faction?.id, -5);
        if (m.escrow && m.commodity) {
          this.cargo[m.commodity] = Math.max(0, (this.cargo[m.commodity] || 0) - m.amount);
          if (!this.cargo[m.commodity]) delete this.cargo[m.commodity];
        }
        this.missions.splice(i, 1);
      }
    }

    if (this._briefingOpen()) return;
    if (this.input.hit('Escape') || this.input.hit('KeyP')) { this.pause(); return; }
    if (this.photo && this.input.hit('Escape')) { this.photo = false; }
    if (this.input.hit('KeyM')) { this.maps.toggle('system', this); this._syncMapState(); return; }
    if (this.input.hit('KeyG')) {
      this.maps.toggle('galaxy', this);
      this._syncMapState();
      if (this.maps.mode === 'galaxy') {
        noteTutorial(this.tutorial, 'map');
        this.hud.toast('Pick a system, then press CONFIRM JUMP (or Enter).', 'info', 5, true);
      }
      return;
    }
    if (this.input.hit('KeyU')) {
      this.maps.toggle('universe', this);
      this._syncMapState();
      if (this.maps.mode === 'universe') {
        this.hud.toast('Pick a galaxy, then press CONFIRM TRANSIT (or Enter).', 'info', 5, true);
      }
      return;
    }
    if (this.input.hit('KeyH')) { this.menus.openControls(); return; }
    if (this.input.hit('KeyY')) {
      if ((this.ship?.fuel || 0) <= 0.5) this.callRescue();
      else this.menus.openExpedition(this.target);
      return;
    }
    if (this.input.hit('KeyV')) { this.cycleCamera(); }
    if (this.input.hit('KeyZ')) { this.controller.flightAssist = !this.controller.flightAssist; this.hud.toast(`Flight assist ${this.controller.flightAssist ? 'ON' : 'OFF'}`, 'info', 2); }
    if (this.input.hit('KeyC')) this.popChaff();
    if (this.input.hit('KeyK')) this.dumpHeat();
    if (this.input.hit('KeyX')) this.fuelProbe?.toggle(this);
    if (this.input.hit('KeyN')) { this.silent = !this.silent; this.hud.toast(this.silent ? 'SILENT RUNNING' : 'RADIATORS OPEN', this.silent ? 'good' : 'info', 2); Audio.uiClick(); }
    if (this.input.hit('KeyB')) { this.autopilot = !this.autopilot; this.hud.toast(this.autopilot ? 'AUTOPILOT ON — toward target' : 'AUTOPILOT OFF', 'info', 2); }
    if (this.input.hit('KeyO')) {
      this.dockComp = !this.dockComp;
      if (this.dockComp && this.systemScene?.stations?.length) {
        let best = null, bd = 1e12;
        for (const st of this.systemScene.stations) {
          const wp = this.systemScene.getPos(st, this._tmpV);
          const d = wp.distanceTo(this.ship.position);
          if (d < bd) { bd = d; best = st; }
        }
        if (best) this.setTarget(best, true);
        this.autopilot = true;
      } else if (!this.dockComp) this.autopilot = false;
      this.hud.toast(this.dockComp ? 'DOCKING COMPUTER ON' : 'DOCKING COMPUTER OFF', 'info', 2.2);
    }
    if (this.input.hit('KeyL')) {
      if (this.ship) {
        this.ship.gearDown = !this.ship.gearDown;
        this._gearAuto = false;
        this.hud.toast(this.ship.gearDown ? 'LANDING GEAR DOWN' : 'GEAR UP', 'info', 1.6);
        Audio.gear(this.ship.gearDown);
      }
    }
    if (this.input.hit('Digit1')) this.shiftPip(1);
    if (this.input.hit('Digit2')) this.shiftPip(2);
    if (this.input.hit('Digit3')) this.shiftPip(3);
    if (this.input.hit('F9')) { this.photo = !this.photo; this.hud.toast(this.photo ? 'PHOTO MODE · F12 saves a 16:9 shot' : 'HUD RESTORED', 'info', 2.2); }
    if (this.input.hit('F6')) this.save(false, 0);
    if (this.input.hit('F7')) this.save(false, 1);
    if (this.input.hit('F8')) this.save(false, 2);
    if (this.input.hit('Tab')) { this.cycleTarget(1); }
    if (this.input.hit('KeyT')) {
      this.cycleWorld(1);
      if (this.tutorial && !this.tutorial.done && TUTORIAL_STEPS[this.tutorial.i]?.id === 'lock') {
        const t = this.target;
        if (t && (t.kind === 'planet' || t.kind === 'moon' || t.data?.type)) noteTutorial(this.tutorial, 'lock');
      }
    }
    if (this.input.hit('BracketLeft')) this.settings.radarRange = clamp(this.settings.radarRange * 0.7, 2000, 400000);
    if (this.input.hit('BracketRight')) this.settings.radarRange = clamp(this.settings.radarRange * 1.4, 2000, 400000);
    if (this.input.buttons.right && this.input.buttonPressed.right) this.fireMissile();

    // -------- adaptive speed cap
    const feel = this.flightLayer === 'atmo' ? (this._atmoFeel || flightFeel(this.atmoPlanet?.data?.type, this.atmoPlanet?.data?.physics)) : null;
    const near = this.flightLayer === 'atmo' ? 900 : this._nearestBodyDistance();
    const autopilotBody = this.autopilot && (this.target?.kind === 'planet' || this.target?.kind === 'moon');
    const maxSpeed = this.flightLayer === 'atmo'
      ? (feel?.maxSpeed || 480)
      : autopilotBody ? 28000 : clamp(near * 0.5, 320, 28000);
    this.controller.maxSpeed = maxSpeed;

    // -------- frame shift (J)
    if (this.flightLayer !== 'atmo') this._updateJump(dt);

    // -------- physics
    const warp = this.jumpState === 'charging' || this.jumpState === 'firing';
    if (this.flightLayer === 'atmo') this._atmoSweepStart.copy(s.position);
    this.controller.update(dt, this.input, {
      maxSpeed, mouseSteer: this.settings.mouseSteer && !this.autopilot, invertY: this.settings.invertY,
      rollOnE: this.settings.rollOnE, time: this.time, warp, camPos: this.camera.position,
      brakeOnSpace: false, sensitivity: this.settings.sensitivity,
      pipSys: (this.pips?.sys || 2) / 2,
      pipEng: 0.72 + 0.28 * ((this.pips?.eng || 2) / 2),
      atmo: this.flightLayer === 'atmo',
      gPull: feel?.gPull || 0,
      hoverMul: feel?.hoverMul || 1.42,
      assist: feel?.assist,
      turnMul: feel?.turnMul,
      accelMul: feel?.accelMul,
    });
    if (this.autopilot || this.dockComp) this._steerAutopilot(dt);
    // Primaries retired — combat is seeker lock (RMB). Space keeps cinema / UI advance only.
    this.firing = false;

    this.stats.distance += s.velocity.length() * dt;

    if (this.flightLayer === 'atmo' && this.surface) {
      this.surface.update(dt, s.position);
      const load = tickHazard(this, dt);
      const hx = hazardEffect(load);
      if (hx.warn && (!this._hzLoad || this.time - this._hzLoad > 6)) {
        this.hud.toast(hx.warn, load >= 75 ? 'bad' : 'info', 2.8);
        this._hzLoad = this.time;
      }
      if (hx.damage) {
        const res = s.damage(s.maxHull * 0.01 * dt);
        if (res === 'destroyed') this.die('Environment load breached the hull');
      }
      const feel = this._atmoFeel || flightFeel(this.atmoPlanet?.data?.type, this.atmoPlanet?.data?.physics);
      const ph = this.atmoPlanet?.data?.physics;
      s.velocity.y -= feel.gPull * dt;
      const H = (ph?.scaleHeightKm || 8) * 1000;
      const rho = airDensity((ph?.rho0 || 0.8) * feel.rhoMul, Math.max(0, s.position.y) * 8, H);
      const entry = Math.max(0, this._entryT || 0);
      if (entry > 0) this._entryT = entry - dt;
      const bleed = 0.012 + rho * 0.038 * feel.drag + (entry > 0 ? 0.1 : 0);
      s.velocity.multiplyScalar(Math.exp(-dt * bleed));
      const t = this.time || 0;
      // Soft weather only — hard pulse/mag used to make engines warble and the deck feel broken.
      const wind = Math.min(feel.wind || 0, 10);
      if (wind > 0) {
        s.velocity.x += Math.sin(t * feel.windHz * 2.1) * wind * dt;
        s.velocity.z += Math.cos(t * feel.windHz * 1.37) * wind * 0.85 * dt;
        if (this.surface.gas) s.velocity.y += Math.sin(t * feel.windHz * 0.55 + s.position.x * 0.001) * wind * 0.28 * dt;
      }
      const pulse = Math.min(feel.pulse || 0, 1.4);
      if (pulse) s.velocity.y += Math.sin(t * 1.15) * pulse * dt;
      const mag = Math.min(feel.mag || 0, 3.2);
      if (mag) {
        s.velocity.x += Math.sin(t * 0.7 + s.position.z * 0.002) * mag * dt;
        s.velocity.z += Math.cos(t * 0.85 + s.position.x * 0.002) * mag * 0.7 * dt;
      }
      const entryU = entry > 0 ? clamp(entry / Math.max(0.4, feel.entryDur || 3.6), 0, 1) : 0;
      this.hud.shake = Math.max(this.hud.shake * 0.88, entryU * 0.1 + (feel.wind ? 0.015 : 0));
      if (this.diamondPass?.uniforms?.uHeat) {
        this.diamondPass.uniforms.uHeat.value = damp(this.diamondPass.uniforms.uHeat.value, entryU * 0.16, 7, dt);
      }
      if (feel.motes && this.particles && Math.random() < dt * feel.motes) {
        this.particles.spawn(
          s.position.x + (Math.random() - 0.5) * 40,
          s.position.y - 4,
          s.position.z + (Math.random() - 0.5) * 40,
          (Math.random() - 0.5) * 8, -6 - Math.random() * 10, (Math.random() - 0.5) * 8,
          0.35, 1.4, feel.mote, 0.15, 0, 0.7,
        );
      }
      const aglNow = this.surface.gas ? s.position.y : (s.position.y - this.surface.heightAt(s.position.x, s.position.z));
      if (feel.heatDmg && aglNow < (feel.heatAlt || 90)) {
        const res = s.damage(dt * feel.heatDmg * clamp(1 - aglNow / (feel.heatAlt || 90), 0.15, 1));
        this.hud.shake = Math.max(this.hud.shake, 0.18);
        if (!this._heatDeck || this.time - this._heatDeck > 3.2) {
          this.hud.toast('DECK HEAT — climb', 'bad', 2.4);
          this._heatDeck = this.time;
        }
        if (res === 'destroyed') this.die('Cooked on the molten deck');
      }
      if (feel.acidDmg) {
        const res = s.damage(dt * feel.acidDmg);
        if (!this._acidDeck || this.time - this._acidDeck > 4) {
          this.hud.toast('ACID COLUMN — hull etching', 'bad', 2.4);
          this._acidDeck = this.time;
        }
        if (res === 'destroyed') this.die('Eaten by the toxic column');
      }
      if (this.surface.gas) {
        this._surfaceAgl = Math.max(0, s.position.y);
        const crushY = feel.crushY ?? this.surface.crushY;
        if (s.position.y < crushY) {
          const res = s.damage(dt * (feel.crushDmg || 28));
          this.hud.shake = Math.max(this.hud.shake, 0.4);
          this.hud.toast('PRESSURE WELL — climb', 'bad', 2);
          if (res === 'destroyed') this.die('Crushed in the gas envelope');
        }
      } else {
        let ground = this.surface.heightAt(s.position.x, s.position.z);
        // Sweep the flight path and the ship footprint across the heightfield.
        // Center-only contact allowed ridges to clip the hull and left the
        // rendered ship one physics step behind its corrected position.
        const dx = s.position.x - this._atmoSweepStart.x;
        const dz = s.position.z - this._atmoSweepStart.z;
        const travel = Math.hypot(dx, dz);
        const steps = Math.min(16, Math.max(1, Math.ceil(travel / 18)));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          ground = Math.max(ground, this.surface.heightAt(this._atmoSweepStart.x + dx * t, this._atmoSweepStart.z + dz * t));
        }
        const fwd = s.forward, fx = fwd.x, fz = fwd.z;
        const right = s.right, rx = right.x, rz = right.z;
        const noseSpan = Math.max(7, (s.mesh?.userData.length || 16) * (s.scale || 1) * 0.38);
        const wingSpan = noseSpan * 0.55;
        for (const [ox, oz] of [[fx * noseSpan, fz * noseSpan], [-fx * noseSpan, -fz * noseSpan], [rx * wingSpan, rz * wingSpan], [-rx * wingSpan, -rz * wingSpan]]) {
          ground = Math.max(ground, this.surface.heightAt(s.position.x + ox, s.position.z + oz));
        }
        const reach = (s.gearReach || 2.4) * (s.scale || 1);
        const agl = s.position.y - ground - reach;
        const spd = s.velocity.length();
        const lowering = this.input.down('ControlLeft') || this.input.down('ControlRight');
        if (feel.buoyancy && agl < 48 && !s.gearDown && !lowering) {
          s.velocity.y += feel.buoyancy * (48 - agl) / 48 * dt;
        }
        if (feel.gearAuto && !s.gearDown && agl < 12 && spd < 55) {
          s.gearDown = true;
          this._gearAuto = true;
          if (!this._gearAudioAt || this.time - this._gearAudioAt > 1.2) {
            Audio.gear(true);
            this._gearAudioAt = this.time;
          }
        } else if (s.gearDown && this._gearAuto && agl > 70) {
          s.gearDown = false;
          this._gearAuto = false;
          if (!this._gearAudioAt || this.time - this._gearAudioAt > 1.2) {
            Audio.gear(false);
            this._gearAudioAt = this.time;
          }
        }
        const floor = ground + (s.gearDown ? reach : reach + 6);
        if (s.position.y < floor) {
          const impact = -s.velocity.y;
          s.position.y = floor;
          if (s.velocity.y < 0) {
            if (s.gearDown && impact < 36) {
              s.velocity.y = 0;
              s.velocity.x *= Math.exp(-dt * 7.5);
              s.velocity.z *= Math.exp(-dt * 7.5);
            } else {
              s.velocity.y *= -Math.min(0.22, feel.bounce);
              if (impact > 42) {
                const res = s.damage((impact - 42) * 0.55);
                this.hud.shake = Math.max(this.hud.shake, 0.28);
                if (!this._hardDeck || this.time - this._hardDeck > 1.6) {
                  this.hud.toast('HARD DECK', 'bad', 1.6);
                  this._hardDeck = this.time;
                }
                if (res === 'destroyed') this.die('Broke up on the surface');
              }
            }
          }
          const grip = s.gearDown ? 5.2 : (1.8 - feel.slip);
          if (grip > 0.2) {
            s.velocity.x *= Math.exp(-dt * grip);
            s.velocity.z *= Math.exp(-dt * grip);
          }
        }
        // Match the HUD to the same swept hull/gear clearance used by the
        // terrain contact solver, instead of measuring only under the nose.
        this._surfaceAgl = Math.max(0, s.position.y - ground - reach);
      }
      s.sync();
      if (aglNow > 720 && s.forward.y > 0.1 && this.scene.fog) {
        const u = clamp((aglNow - 720) / 280, 0, 1);
        if (this._atmoFog0 == null) this._atmoFog0 = this.scene.fog.density;
        this.scene.fog.density = this._atmoFog0 * (1 + u * 3.2);
      }
      // Use height above the local terrain, not planet-centred Y. High
      // plateaus can sit above 1 km; the old absolute check kicked a ship back
      // to orbit while it was still only a few dozen metres above the ground.
      if (aglNow > 1050) this.exitAtmosphere();
      else if (aglNow > 860 && s.forward.y > 0.1) this.exitAtmosphere();
      this._updateSurfacePois(dt);
    }

    // -------- stellar collection requires a deployed probe
    this.fuelProbe?.update(dt, this);
    this.scooping = (this.fuelProbe?.rate || 0) > 0;

    if (s.maxFuel > 0 && s.fuel / s.maxFuel < 0.12 && (!this._fuelHint || this.time - this._fuelHint > 50)) {
      this.hud.toast('Fuel low — dock (E), or approach a star and launch the fuel probe (X)', 'info', 6, true);
      this._fuelHint = this.time;
    }

    // -------- world
    if (this.flightLayer !== 'atmo') {
      this.systemScene.update(dt, this.time, this.camera.position);
      this.background.update(dt, this.camera.position, this.warpAmount, this.camera);
    }

    // -------- npcs
    const obstacles = [];
    let hostiles = 0;
    if (this.flightLayer !== 'atmo') {
      for (const p of this.systemScene.planets) {
        obstacles.push({ x: p.group.position.x, y: p.group.position.y, z: p.group.position.z, r: p.radius });
        for (const m of p.moons) obstacles.push({ x: m.group.position.x, y: m.group.position.y, z: m.group.position.z, r: m.radius });
      }
      obstacles.push({ x: 0, y: 0, z: 0, r: this.system.star.radius });
      for (const n of this.npcs) {
        if (!n.alive) continue;
        if (n.hostile) hostiles++;
        const fr = n.fireRange, ar = n.aggroRange;
        const sig = this.ship.stats.signature ?? 1;
        n.fireRange *= (this.silent ? 0.42 : 1) * sig;
        n.aggroRange *= (this.silent ? 0.48 : 1) * sig;
        n.update(dt, this.time, s, obstacles, (o, d, owner) => this.npcFire(o, d, owner));
        n.fireRange = fr; n.aggroRange = ar;
      }
      this._updateMissileLock(dt);
    } else {
      this.lockFrac = 0; this.lockNpc = null;
    }

    // -------- projectiles
    const ptargets = [...this.npcs.filter((n) => n.alive), {
      alive: true, position: s.position, radius: 6.2, kind: 'player', isPlayer: true,
    }];
    // planets block shots
    this.projectiles.update(dt, ptargets, (proj, tgt, isMissile) => {
      if (isMissile) { this.particles.explosion(proj.mesh.position, 1.1); this.shock.fire(proj.mesh.position, '#ffd2a0', 12, 0.5); Audio.explosion(0.7); this.hud.shake = Math.max(this.hud.shake, 0.12); }
      if (tgt.isPlayer) {
        const res = s.damage(proj.dmg);
        this.hud.damageFlash = Math.max(this.hud.damageFlash, 0.7);
        this.hud.flash = Math.max(this.hud.flash, 0.8);
        this.hud.shake = Math.max(this.hud.shake, 0.28);
        if (isMissile) { this.particles.explosion(proj.mesh.position, 1.2); Audio.explosion(0.8); }
        if (res === 'destroyed') this.die('Destroyed by hostile fire');
      } else if (tgt instanceof NpcShip) {
        const killed = tgt.damage(proj.dmg);
        this.particles.sparks(proj.mesh.position, proj.vel.clone().normalize().negate(), 10, '#ffd27a', 40);
        if (isMissile) { this.particles.explosion(proj.mesh.position, 1.1); Audio.explosion(0.6); }
        if (killed) this._killNpc(tgt);
      }
    }, this.particles);

    // -------- mining / scanning
    this._updateTool(dt);

    // -------- docking
    this._updateDocking(dt);

    // -------- collisions
    this._updateCollisions(dt);

    // -------- camera
    this._updateCamera(dt);
    this._tickTutorial(dt);

    // -------- audio
    const speedRatio = clamp(s.speed / Math.max(1, this.controller.speedCap), 0, 1);
    this.warpAmount = this.flightLayer === 'atmo' ? 0 : clamp((s.speed - 5200) / 14000, 0, 0.35);
    Audio.updateEngine(s.throttle, speedRatio, !!(s.boost || (s.boostAmt > 0.35)), this.warpAmount > 0.25, !!this.silent);
    Audio.setMusicIntensity(hostiles > 0 && this._nearestHostile() < 9000 ? 0.85 : this.warpAmount > 0.3 ? 0.42 : 0.22);
    this.afterimage.enabled = false;
    if (this.diamondPass?.uniforms?.uHeat && this.flightLayer !== 'atmo') {
      this.diamondPass.uniforms.uHeat.value *= Math.exp(-dt * 4);
    }

    // engine trail
    if (s.throttle > 0.05 || s.boost || (s.boostAmt || 0) > 0.08) {
      const back = this._trailBack || (this._trailBack = new THREE.Vector3());
      back.copy(s.forward).multiplyScalar(-1);
      const toCam = this._trailCam || (this._trailCam = new THREE.Vector3());
      toCam.copy(this.camera.position).sub(s.position).normalize();
      const cd = back.dot(toCam);
      const cone = cd > 0 ? cd * cd : 0;
      const inten = clamp(s.throttle + (s.boostAmt || (s.boost ? 1 : 0)) * 0.5, 0, 1.5) * (1 - (s.mesh?.userData?.hero ? 0.22 : 0.7) * cone);
      const hero = !!(s.mesh?.userData?.hero);
      if (!hero) {
        for (let i = 0; i < s.engineLocal.length; i++) {
          this.particles.engineTrail(s.engineWorld(i), s.forward, inten,
            s.def.colors.glowEmit, 0.55 * s.scale, dt);
        }
      }
    }
    if (s.hull / s.maxHull < 0.3 && Math.random() < 0.4) {
      this.particles.spawn(s.position.x, s.position.y, s.position.z,
        (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8,
        1.4, 2.4, Math.random() < 0.5 ? '#3a2a26' : '#ff7a3d', 0.5, 5, 0.6);
    }

    this.particles.update(dt);
    this.beam.update(dt);
    this.shock.update(dt);
    if (this.gradePass?.uniforms?.uTime) this.gradePass.uniforms.uTime.value = this.time || 0;
    if (this.diamondPass?.uniforms?.uTime) this.diamondPass.uniforms.uTime.value = this.time || 0;
    if (this.hudCinematic > 0) this.hudCinematic = Math.max(0, this.hudCinematic - dt);

    // -------- contacts + hud
    this.contacts = this.buildContacts();
    this._drawHud(dt, hostiles, near, maxSpeed);

    // autosave
    if (Math.floor(this.stats.playtime) % 60 === 0 && Math.floor(this.stats.playtime) !== this._lastSave) {
      this._lastSave = Math.floor(this.stats.playtime);
      this.save();
    }
  }

  _syncMapState() {
    if (this.maps.mode) {
      this.state = 'map';
      document.body.style.cursor = 'default';
      this.input.unlockPointer?.();
    } else {
      this.state = 'playing';
      document.body.style.cursor = 'none';
    }
  }

  _nearestHostile() {
    let d = Infinity;
    for (const n of this.npcs) if (n.alive && n.hostile) d = Math.min(d, n.position.distanceTo(this.ship.position));
    return d;
  }

  _nearestBodyDistance() {
    let best = Infinity;
    const sp = this.ship.position;
    for (const p of this.systemScene.planets) {
      best = Math.min(best, p.group.position.distanceTo(sp) - p.radius);
      for (const m of p.moons) best = Math.min(best, m.group.position.distanceTo(sp) - m.radius);
    }
    best = Math.min(best, sp.length() - this.system.star.radius);
    for (const st of this.systemScene.stations) best = Math.min(best, this.systemScene.getPos(st, this._tmpV).distanceTo(sp) - st.radius);
    return Math.max(best, 60);
  }

  _killNpc(n) {
    Audio.explosion(1.1);
    this.particles.explosion(n.position, 1.5);
    this.shock.fire(n.position, '#ffd2a0', 16, 0.7);
    this.hud.shake = Math.max(this.hud.shake, clamp(300 / n.position.distanceTo(this.ship.position), 0.02, 0.5));
    n.alive = false;
    n.group.visible = false;
    if (n.hostile) {
      this.stats.kills++;
      const bounty = Math.round(n.bounty * bountyMult(this.stats.kills));
      this.credits += bounty;
      this.stats.earned += bounty;
      this.hud.toast(`${n.name} destroyed · +${fmtCredits(bounty)} CR bounty`, 'money', 4.5);
      Audio.credits();
      this.rep = addRep(this.rep, this.system.faction?.id, 4);
      this.wanted = Math.max(0, (this.wanted || 0) - (n.faction === 'Pirate' ? 0 : 0));
      this.bigToast('TARGET DESTROYED', `${n.name} · +${fmtCredits(bounty)} CR`, 'money');
      // drop cargo
      this.checkMissions('kill', n);
      this.particles.scanWave(n.position, 40, '#ffc24d');
      onCampaignEvent(this, 'kill', { hostile: true });
      this.achievements?.evaluate();
    } else {
      this.hud.toast(`You destroyed a civilian vessel — writ issued`, 'bad', 5);
      this.credits = Math.max(0, this.credits - 1500);
      this.wanted = Math.min(10, (this.wanted || 0) + 2);
      this.rep = addRep(this.rep, this.system.faction?.id, -22);
      n.dispose();
    }
    if (this.target === n) this.target = null;
    setTimeout(() => { this.npcs = this.npcs.filter((x) => x.alive); }, 1500);
  }

  _updateJump(dt) {
    const s = this.ship;
    if (this.target?.remote && this.target.system && this.target.system.id !== this.system?.id) {
      const holding = this.input.down('KeyJ');
      if (!holding) {
        if (this.jumpState === 'charging') this.hud.toast('Jump aborted', 'info', 1.6);
        this.jumpState = 'idle'; this.jumpCharge = 0; return;
      }
      if (this.flightLayer === 'atmo') {
        this.jumpState = 'idle'; this.jumpCharge = 0;
        if (!this._jToast || this.time - this._jToast > 3.2) {
          this.hud.toast('Leave the atmosphere, then hold J', 'bad', 3);
          this._jToast = this.time;
        }
        return;
      }
      if (this.jumpState !== 'charging') { this.jumpState = 'charging'; Audio.jumpCharge(); }
      this.jumpCharge += dt / 2.3;
      if (this.jumpCharge >= 1) {
        const sys = this.target.system;
        const id = this.target.data?.id;
        this.jumpState = 'idle'; this.jumpCharge = 0;
        this.jumpToSystem(sys, id);
      }
      return;
    }
    const tp = this.targetPos;
    // The autopilot is a route-to-target command, so let it use the same
    // in-system frame shift the player can hold manually. Keep manual J for
    // every target; automatic charging is limited to planets and moons.
    const autopilotShift = this.autopilot && (this.target?.kind === 'planet' || this.target?.kind === 'moon');
    const dist = tp ? s.position.distanceTo(tp) : Infinity;
    const shiftStandOff = autopilotShift
      ? Math.max((this.target.radius || 40) * 7, this._bodyVisualRadius(this.target) * 1.5 + 500)
      : 0;
    const holding = this.input.down('KeyJ') || (autopilotShift && dist > shiftStandOff);
    if (!holding) {
      if (this.jumpState === 'charging') this.hud.toast('Frame shift aborted', 'info', 2);
      this.jumpState = 'idle'; this.jumpCharge = 0; return;
    }
    if (!tp || !this.target) {
      if (!this._jToast || this.time - this._jToast > 3.2) {
        this.hud.toast('Lock a body (T) then hold J for in-system frame shift', 'info', 3.2);
        this._jToast = this.time;
      }
      this.jumpState = 'idle'; this.jumpCharge = 0; return;
    }
    const tRadius = this.target.kind === 'station'
      ? Math.max(80, this.target.data?.dockRadius || this.target.data?.radius || 400)
      : (this.target.radius || this.target.data?.radius || 40);
    if (dist < tRadius * 7) { this.jumpState = 'idle'; this.jumpCharge = 0; return; }
    const dir = tp.clone().sub(s.position).normalize();
    const align = s.forward.dot(dir);
    if (align < 0.94) { this.jumpState = 'idle'; this.jumpCharge = Math.max(0, this.jumpCharge - dt * 1.5); return; }
    if (!this.canSpaceJump()) {
      this.jumpState = 'idle'; this.jumpCharge = 0;
      if (!this._wellToast || this.time - this._wellToast > 4) {
        this.hud.toast('Too close to the star for frame-shift', 'bad', 4);
        this._wellToast = this.time;
      }
      return;
    }
    const cost = clamp(dist / 24000, 0.05, 1.8);
    if (s.fuel < cost) { if (this.jumpState !== 'nofuel') this.hud.toast('Insufficient fuel for frame shift', 'bad'); this.jumpState = 'nofuel'; return; }
    if (this.jumpState !== 'charging') { this.jumpState = 'charging'; Audio.jumpCharge(); }
    this.jumpCharge += dt / 2.3;
    if (this.jumpCharge >= 1) {
      this.jumpState = 'idle'; this.jumpCharge = 0;
      s.fuel -= cost;
      this.stats.jumps++;
      this.achievements?.evaluate();
      Audio.warpEnter();
      const dest = this.target;
      const destPos = this.getBodyWorldPos(dest, new THREE.Vector3());
      if (dest?.kind === 'station' && isHeroStation(dest.data)) {
        this.systemScene?.prepareHeroForJump?.(dest);
      }
      const here = this.getBodyWorldPos(dest, new THREE.Vector3());
      const bodyR = dest.kind === 'station'
        ? Math.max(80, dest.data?.dockRadius || dest.data?.radius || 400)
        : (dest.radius || dest.data?.radius || tRadius);
      const clear = Math.max(bodyR * 2.2 + 220, 480);
      const back = s.position.clone().sub(here);
      if (back.lengthSq() < 1) back.set(0, 0.2, 1);
      back.normalize();
      s.position.copy(here).addScaledVector(back, clear);
      const look = new THREE.Matrix4().lookAt(s.position, destPos, new THREE.Vector3(0, 1, 0));
      s.quaternion.setFromRotationMatrix(look);
      s.velocity.copy(dir).multiplyScalar(120);
      s.throttle = 0.3;
      this.setTarget(dest, true);
      s.sync();
      this._snapChaseCam();
      this._spawnGrace = (this.time || 0) + 1.6;
      this.particles.scanWave(s.position, 60, '#9fd8ff');
      const destName = dest.data?.name || dest.name || 'target';
      this.hud.toast(`Frame shift · ${destName}`, 'good', 3.5);
      setTimeout(() => Audio.warpExit(), 300);
    }
  }

  _scanBody(t) {
    return !!(t && (t.kind === 'planet' || t.kind === 'moon' || t.kind === 'wreck'));
  }

  _fNoTarget(msg) {
    if (!this._noFToast || this.time - this._noFToast > 8) {
      this.hud.toast(msg, 'info', 3.2);
      this._noFToast = this.time;
    }
  }

  _updateTool(dt) {
    const s = this.ship;
    const active = this.input.down('KeyF');
    this.beam.hide();
    this.mining = false;
    this.scanning = false;
    this.prospecting = false;
    this.dumping = false;
    this.fMode = null;
    this.scanHud = null;

    const oreName = (id) => (COMMODITIES.find((c) => c.id === id)?.name || id || 'ore');
    const idleArray = () => this.scanArray?.update(dt, s, this.targetPos, false);
    const stopMineFx = () => {
      if (this._miningSound) { Audio.stopMining(); this._miningSound = false; }
    };

    const finishProspect = (rock, pos) => {
      rock.prospected = true;
      rock.prospect = 1;
      const hex = rock.rare ? '#c04cf0' : rock.grade >= 4 ? '#ffc24d' : rock.grade >= 3 ? '#7dffb0' : '#c8a97a';
      if (rock.belt) this.systemScene.tintRock(rock, hex);
      const tag = rock.rare ? 'RARE' : `GRADE ${rock.grade}`;
      this.hud.toast(`Prospect ${tag} · ${oreName(rock.commodity)} · ${Math.round(rock.ore)}t`, 'good', 3.2);
      if (pos) this.particles.scanWave(pos, 18, hex);
      Audio.scanPing();
    };

    const extractFrom = (rock, worldPos, dist) => {
      this.mining = true;
      this.prospecting = false;
      this.fMode = 'cut';
      this.mineRock = { rock, worldPos, dist, source: this.mineRock?.source || 'belt' };
      const from = s.hardpointWorld(0);
      this.beam.set(from, worldPos, 1.1);
      this.beam.mat.uniforms.uColor.value.set(rock.rare ? '#c04cf0' : '#ff9a4d');
      const rate = extractTons(s.stats.mining, { prospected: !!rock.prospected, grade: rock.grade || 1 }, dt);
      const taken = Math.min(rate, rock.ore);
      const space = s.stats.cargo - this.cargoUsed();
      const idPre = rock.commodity || 'minerals';
      const actual = takeDeposit(this, `${this.system?.id || 'sys'}:${idPre}`, Math.min(taken, Math.max(0, space)));
      if (space <= 0) {
        if (!this._cargoWarned || this.time - this._cargoWarned > 3) { this.hud.toast('Cargo hold full — dock and sell', 'bad'); this._cargoWarned = this.time; }
      } else if (actual > 0) {
        rock.ore -= actual;
        const id = rock.commodity || 'minerals';
        this.cargo = addMinedCargo(this.cargo, id, actual);
        this.ship.cargo = this.cargo;
        this.stats.mined += actual;
        onCampaignEvent(this, 'mine', { tons: actual, id });
        if ((this.stats.mined || 0) >= 50) this.achievements?.evaluate();
        this.particles.sparks(worldPos, from.clone().sub(worldPos).normalize(), 2, rock.rare ? '#e0a0ff' : '#ffc24d', 22);
        if (!this._mineGot || this.time - this._mineGot > 7) {
          const held = this.cargo[id] || 0;
          this.hud.toast(`Hold ${held.toFixed(1)}t ${oreName(id)} · smelt at a refinery or sell raw`, 'money', 3.2);
          this._mineGot = this.time;
        }
      }
      const hz = mineHazard(rock.hazard, dt);
      if (hz.heat) this.heat = Math.min(1.35, (this.heat || 0) + hz.heat);
      if (hz.hull) {
        const res = s.damage(hz.hull);
        if (res === 'destroyed') this.die('Hull breached on an unstable cut');
      }
      if (rock.hazard && (!this._hzToast || this.time - this._hzToast > 4)) {
        this.hud.toast(rock.hazard === 'heat' ? 'Vein is hot — dump heat (K)' : rock.hazard === 'toxic' ? 'Toxic dust — hull taking it' : 'Unstable rock — cut and break off', 'bad', 3.2);
        this._hzToast = this.time;
      }
      if (!this._miningSound) { Audio.startMining(); this._miningSound = true; }
      if (rock.ore <= 0) {
        rock.alive = false;
        if (rock.belt) {
          this.systemScene.hideRock(rock);
          this.particles.explosion(worldPos, 0.35, '#c8a97a', '#6b5a44');
        }
        this.hud.toast(`Depleted · ${oreName(rock.commodity)} in hold ${this.cargoUsed().toFixed(1)}t`, 'good', 2.8);
        Audio.stopMining(); this._miningSound = false;
      }
    };

    const prospectRock = (rock, worldPos, dist, source) => {
      this.prospecting = true;
      this.fMode = 'prospect';
      this.mineRock = { rock, worldPos, dist, source };
      const dwell = prospectDwell(s.stats.sensors);
      rock.prospect = clamp((rock.prospect || 0) + dt / dwell, 0, 1);
      this.beam.set(s.hardpointWorld(0), worldPos, source === 'planet' ? 0.7 : 0.75);
      this.beam.mat.uniforms.uColor.value.set('#7ec8ff');
      if (rock.prospect >= 1) {
        finishProspect(rock, worldPos);
        if (source === 'planet' || dist <= MINE_CUT_RANGE) extractFrom(rock, worldPos, dist);
      }
      if (!this._miningSound) { Audio.startMining(); this._miningSound = true; }
    };

    // Exclusive F: one action per hold. Atmosphere never runs orbital ping.
    if (this.flightLayer === 'atmo') {
      this._nearBelt = false;
      if (this.surface && !this.surface.gas) {
        const hit = this.surface.nearestVein(s.position, MINE_VEIN_RANGE);
        if (hit && hit.dist < MINE_VEIN_RANGE) {
          const rock = hit.rock;
          const worldPos = new THREE.Vector3(rock.x, (rock.y || 0) + 2.4, rock.z);
          this.mineRock = { rock, worldPos, dist: hit.dist, source: 'planet' };
          if (active) {
            if (!rock.prospected) prospectRock(rock, worldPos, hit.dist, 'planet');
            else extractFrom(rock, worldPos, hit.dist);
          } else stopMineFx();
          idleArray();
          return;
        }
      }
      this.mineRock = null;
      const poi = this.poiPrompt;
      if (active && poi && !poi.scanned) {
        stopMineFx();
        this.dumping = true;
        this.fMode = 'dump';
        poi.scan = (poi.scan || 0) + dt;
        if (poi.scan >= 1.15) {
          this.surface.markScanned?.(poi);
          poi.scanned = true;
          if (poi.mesh) poi.mesh.visible = false;
          this.credits += poi.value;
          this.stats.earned += poi.value;
          this.achievements?.evaluate();
          this.hud.toast(`${poi.name} · +${fmtCredits(poi.value)} CR`, 'money', 3.2);
          this.poiPrompt = null;
          this.dumping = false;
          this.fMode = null;
        }
        idleArray();
        return;
      }
      stopMineFx();
      if (active) {
        const hasVeins = !!(this.surface && !this.surface.gas && planetMine(this.surface.type));
        this._fNoTarget(hasVeins
          ? 'No vein in range — fly over a deposit, or a beacon to dump data'
          : 'No ore here — fly to a beacon, or mine belts in orbit');
      }
      idleArray();
      return;
    }

    const rockHit = this.findMineRock();
    this.mineRock = rockHit;
    const t = this.target;
    const wantScan = this._scanBody(t);
    // Locked planet/moon/wreck owns F. Belt mining only steals when a rock is
    // clearly nose-on and inside cut range (or no survey target is locked).
    const rockStealsF = !!(active && rockHit && rockHit.dist < MINE_PROSPECT_RANGE && (
      !wantScan
      || (rockHit.dist <= MINE_CUT_RANGE && (rockHit.ang == null || rockHit.ang < 0.16))
    ));
    if (rockStealsF) {
      const rock = rockHit.rock;
      if (!rock.prospected) {
        prospectRock(rock, rockHit.worldPos, rockHit.dist, 'belt');
        idleArray();
        return;
      }
      if (rockHit.dist <= MINE_CUT_RANGE) {
        extractFrom(rock, rockHit.worldPos, rockHit.dist);
        idleArray();
        return;
      }
      this.fMode = 'cut';
      this.beam.set(s.hardpointWorld(0), rockHit.worldPos, 0.35);
      this.beam.mat.uniforms.uColor.value.set('#7dffb0');
      stopMineFx();
      idleArray();
      return;
    }
    if (wantScan) this.mineRock = null;
    stopMineFx();

    if (active && wantScan) {
      this.fMode = 'scan';
      this._updateScan(dt, t);
      return;
    }
    idleArray();
    if (active && this._nearBelt) {
      this._fNoTarget('Point the nose at an asteroid to prospect');
    }
  }

  _scanProfile(rt) {
    const d = rt.data || {};
    const r = rt.radius || d.radius || 40;
    const kind = rt.kind || d.kind;
    const type = d.type;
    let sig = 0.88;
    if (kind === 'wreck') sig = 1.55;
    else if (type === 'gas' || type === 'icegiant') sig = 1.38;
    else if (type === 'terra' || type === 'ocean') sig = 1.16;
    else if (type === 'lava') sig = 1.22;
    const heatMul = 1 - clamp((this.heat || 0) - 0.48, 0, 0.45);
    const silentMul = this.silent ? 0.52 : 1;
    const pip = 0.82 + (this.pips?.sys || 2) * 0.06;
    const sensor = this.ship?.stats?.sensors ?? 1;
    const k = sig * heatMul * silentMul * pip * sensor;
    if (kind === 'wreck') {
      return {
        pingRange: 2400 * k, deepRange: 880 * k,
        pingDwell: 0.7, deepDwell: 3.05,
        alignPing: 0.4, alignDeep: 0.66,
        wreck: true, sig,
      };
    }
    return {
      pingRange: (r * 8.2 + 2600) * k,
      deepRange: (r * 3.6 + 820) * k,
      pingDwell: 0.52 + Math.min(0.55, r * 0.0008),
      deepDwell: 2.35 + Math.min(3.1, r * 0.01),
      alignPing: 0.48, alignDeep: 0.74,
      wreck: false, sig,
    };
  }

  _scanOccluded(from, to, targetRt) {
    this._sDir = this._sDir || new THREE.Vector3();
    this._sC = this._sC || new THREE.Vector3();
    this._sToC = this._sToC || new THREE.Vector3();
    const dir = this._sDir.copy(to).sub(from);
    const dist = dir.length();
    if (dist < 8) return null;
    dir.multiplyScalar(1 / dist);
    const hit = (rt) => {
      if (!rt || rt === targetRt) return false;
      this.systemScene.getPos(rt, this._sC);
      const toC = this._sToC.copy(this._sC).sub(from);
      const tca = toC.dot(dir);
      if (tca < 30 || tca > dist - 24) return false;
      const d2 = toC.lengthSq() - tca * tca;
      const rad = (rt.radius || 40) * 0.97;
      return d2 < rad * rad;
    };
    for (const p of this.systemScene.planets) {
      if (hit(p)) return p;
      for (const m of p.moons) if (hit(m)) return m;
    }
    const starR = (this.system.star.radius || 400) * 0.92;
    this._sC.set(0, 0, 0);
    const toC = this._sToC.copy(this._sC).sub(from);
    const tca = toC.dot(dir);
    if (tca > 40 && tca < dist - 30) {
      const d2 = toC.lengthSq() - tca * tca;
      if (d2 < starR * starR) return { kind: 'star', data: this.system.star, radius: starR };
    }
    return null;
  }

  _scanWarn(msg) {
    if (!this._scanToast || this.time - this._scanToast > 2.6) {
      this.hud.toast(msg, 'bad', 2.4);
      this._scanToast = this.time;
    }
  }

  _updateScan(dt, t) {
    const s = this.ship;
    const d = t.data;
    const wp = this.targetPos;
    const dist = s.position.distanceTo(wp);
    const prof = this._scanProfile(t);
    const dir = this._tmpV.copy(wp).sub(s.position);
    const len = dir.length() || 1;
    dir.multiplyScalar(1 / len);
    const align = s.forward.dot(dir);
    const occ = this._scanOccluded(s.position, wp, t);
    const pinged = !!d.pinged;
    const scanned = !!d.scanned;
    const inPing = dist <= prof.pingRange && align > prof.alignPing;
    const inDeep = dist <= prof.deepRange && align > prof.alignDeep;
    const bloom = (this.heat || 0) > 0.9;
    const rate = bloom ? 0.36 : 1;
    this.heat = Math.min(1.35, (this.heat || 0) + dt * 0.2);

    let blocked = null;
    if (occ) blocked = 'occluded';
    else if (!scanned && !pinged && !inPing) blocked = dist > prof.pingRange ? 'range' : 'align';
    else if (pinged && !scanned && !inDeep) blocked = dist > prof.deepRange ? 'range' : 'align';

    const mode = prof.wreck ? 'wreck' : (!pinged ? 'ping' : 'deep');
    this.scanning = !scanned;
    this.fMode = 'scan';
    // No signal means no visible return wave. The HUD explains why the scan
    // cannot start; avoid throwing a giant red sensor disc over the ship.
    this.scanArray?.update(dt, s, wp, !blocked, mode, !!blocked);

    if (blocked) {
      d.scanProgress = Math.max(0, (d.scanProgress || 0) - dt * 0.5);
      d.pingProgress = Math.max(0, (d.pingProgress || 0) - dt * 0.65);
      const reason = blocked === 'occluded'
        ? `${occ.data?.name || 'Body'} blocks the signal`
        : blocked === 'range'
          ? `Move within ${fmtDist(pinged ? prof.deepRange : prof.pingRange)}`
          : 'Aim the nose at the target';
      this.scanHud = {
        active: true, mode, amount: pinged ? (d.scanProgress || 0) : (d.pingProgress || 0),
        label: blocked === 'occluded' ? 'SIGNAL BLOCKED' : blocked === 'range' ? 'OUT OF RANGE' : 'OFF AXIS',
        sub: reason,
        blocked: true, wreck: !!prof.wreck,
      };
      const armId = d.id || d.name;
      const armed = this.expedition?.bodyId === armId && (this.expedition.phase === 'run' || this.expedition.phase === 'running');
      if (!armed) d._deepArm = 0;
      return;
    }

    if (bloom) this._scanWarn('SENSOR BLOOM — dump heat (K)');

    if (pinged && !d._storyPing) {
      d._storyPing = true;
      onCampaignEvent(this, 'ping', {
        id: d.id || d.name, kind: t.kind || d.kind || 'planet', story: d.story, name: d.name,
        dive: d.story === 'dive', beacon: d.story === 'beacon', signal: d.story === 'signal',
        distress: !!d.distress,
      });
    }

    if (!pinged) {
      d.pingProgress = clamp((d.pingProgress || 0) + dt * rate / prof.pingDwell, 0, 1);
      if (Math.random() < dt * 0.55) Audio.scanPing();
      this.scanHud = {
        active: true, mode: 'ping', amount: d.pingProgress,
        label: prof.wreck ? 'WRECK PING' : 'LIDAR PING',
        sub: `Dwell ${Math.round((1 - d.pingProgress) * prof.pingDwell * 10) / 10}s · sig ${prof.sig.toFixed(2)}`,
        wreck: !!prof.wreck,
      };
      if (d.pingProgress >= 1) this._completePing(t);
      return;
    }

    if (!scanned) {
      const bodyId = d.id || d.name;
      const phase = this.expedition?.bodyId === bodyId ? this.expedition.phase : '';
      const going = phase === 'run' || phase === 'running';
      const known = !!this.researched?.[bodyId];
      if (!going && !known) {
        if (phase !== 'ready') {
          if (!(d._deepArm > 0)) {
            this._careerHintOnce(
              'deepArmHint',
              'Press Y to prepare, or keep holding F — first deep on the contract world is free.',
              'info',
              7,
            );
          }
          d._deepArm = (d._deepArm || 0) + dt;
          if (d._deepArm < 0.45) {
            this.scanHud = {
              active: true, mode: 'deep', amount: d._deepArm / 0.45,
              label: 'ARMING DEEP SURVEY',
              sub: 'Hold the nose — Y prepares, the kit spends when the survey locks',
              wreck: !!prof.wreck,
            };
            return;
          }
        }
        const block = t.kind === 'wreck' ? null : accessBlock(this, d);
        if (block) {
          d._deepArm = 0;
          if (block.story === false && /licen/i.test(block.reason || '')) {
            this._careerHintOnce(
              'licenceHint',
              'World type needs a licence — dock the Research Array, tab WORLD LICENCES.',
              'info',
              7,
            );
          }
          this.scanHud = {
            active: true, mode: 'deep', amount: 0,
            label: 'DEEP SURVEY BLOCKED', sub: block.reason, blocked: true, wreck: !!prof.wreck,
          };
          return;
        }
        const gate = launchExpedition(this, d);
        if (!gate.ok) {
          d._deepArm = 0;
          if (/scan kit/i.test(gate.reason || '')) {
            this._careerHintOnce(
              'kitHint',
              'Deep survey needs a scan kit — observatory EXPEDITION tab. Orbital ping stays free.',
              'info',
              7,
            );
          }
          this.scanHud = {
            active: true, mode: 'deep', amount: 0,
            label: 'DEEP SURVEY BLOCKED', sub: gate.reason, blocked: true, wreck: !!prof.wreck,
          };
          return;
        }
        if (gate.spent) this.hud.toast(`Scan kit loaded · ${this.kits} left`, 'info', 2.8);
        if (!gate.spent && !gate.resume && this.expedition?.free) this.hud.toast('First deep survey is on the house', 'good', 2.8);
      }
      d.scanProgress = clamp((d.scanProgress || 0) + dt * rate / prof.deepDwell, 0, 1);
      if (Math.random() < dt * 0.35) Audio.scanPing();
      this.scanHud = {
        active: true, mode: 'deep', amount: d.scanProgress,
        label: prof.wreck ? 'WRECK SALVAGE SURVEY' : 'DEEP SURVEY',
        sub: `Hold F · ${Math.round((1 - d.scanProgress) * prof.deepDwell * 10) / 10}s dwell remaining`,
        wreck: !!prof.wreck,
      };
      if (d.scanProgress >= 1) this._completeScan(t);
      return;
    }

    this.scanHud = {
      active: true, mode: 'lock', amount: 1,
      label: 'CHART LOCKED', sub: d.name, wreck: !!prof.wreck,
    };
  }

  _completePing(rt) {
    const d = rt.data;
    d.pinged = true;
    d.pingProgress = 1;
    d.discovered = true;
    this.scanArray?.pingFlash();
    Audio.scanPing();
    const wp = this.targetPos;
    const from = this.ship.position;
    this._sDir = this._sDir || new THREE.Vector3();
    this._sC = this._sC || new THREE.Vector3();
    this._sDir.copy(wp).sub(from);
    const dist = this._sDir.length() || 1;
    this._sDir.multiplyScalar(1 / dist);
    for (let i = 0; i < 7; i++) {
      const u = (i + 1) / 8;
      this._sC.copy(from).addScaledVector(this._sDir, dist * u);
      this.particles.spawn(this._sC.x, this._sC.y, this._sC.z,
        this._sDir.x * 8, this._sDir.y * 8, this._sDir.z * 8,
        0.45, 1.6, rt.kind === 'wreck' ? '#ff9d5c' : '#9fd8ff', 0.2, 0, 0.85);
    }
    const first = !d.pingPaid;
    d.pingPaid = true;
    const pay = first ? Math.max(70, Math.round((d.value || 400) * (rt.kind === 'wreck' ? 0.11 : 0.07))) : 0;
    if (pay) { this.credits += pay; this.stats.earned += pay; }
    this.hud.toast(pay ? `PING RETURN · ${d.name} · +${fmtCredits(pay)} CR` : `PING RETURN · ${d.name}`, pay ? 'money' : 'info', 3.2);
    noteTutorial(this.tutorial, 'ping');
    onCampaignEvent(this, 'ping', {
      id: d.id || d.name, kind: rt.kind || d.kind || 'planet', story: d.story, name: d.name,
      dive: d.story === 'dive', beacon: d.story === 'beacon', signal: d.story === 'signal',
      distress: !!d.distress,
    });
    this._claimDistress(d);
  }

  _completeScan(rt) {
    const d = rt.data;
    d.scanned = true;
    d.pinged = true;
    d.scanProgress = 1;
    d.pingProgress = 1;
    this.stats.scans++;
    this.achievements?.evaluate();
    const wp = this.targetPos;
    this.scanArray?.pingFlash();
    Audio.scanComplete();
    const from = this.ship.position;
    this._sDir = this._sDir || new THREE.Vector3();
    this._sC = this._sC || new THREE.Vector3();
    this._sDir.copy(wp).sub(from);
    const dist = this._sDir.length() || 1;
    this._sDir.multiplyScalar(1 / dist);
    for (let i = 0; i < 10; i++) {
      const u = (i + 1) / 11;
      this._sC.copy(from).addScaledVector(this._sDir, dist * u);
      this.particles.spawn(this._sC.x, this._sC.y, this._sC.z,
        this._sDir.x * 12, this._sDir.y * 12, this._sDir.z * 12,
        0.55, 2.1, rt.kind === 'wreck' ? '#ff9d5c' : '#7dffb0', 0.15, 0, 0.9);
    }
    let base = d.value || 400;
    if (d.hasLife) base = Math.round(base * 1.8);
    if (rt.kind === 'wreck' || d.kind === 'wreck') base = d.value || base;
    const firstEver = !this.gallery[d.id];
    const pay = salvagePayout(base, firstEver, exploreBonus(this.stats.scans));
    this.gallery[d.id] = { name: d.name, type: d.type, system: this.system.name, value: base, t: Date.now() };
    const rpGain = grantDeepRp(this, d.id || d.name);
    this.credits += pay;
    this.stats.earned += pay;
    this.achievements?.evaluate();
    if (firstEver) {
      this.cargo.data = (this.cargo.data || 0) + 1;
      this.hud.toast(`Deep survey · ${d.name} · +${fmtCredits(pay)} CR${rpGain.gained ? ` · +${rpGain.gained} RP` : ''}`, 'money', 5);
      if (rt.kind === 'wreck') noteFragment(this, d.id || d.name);
      else this.menus.openFieldChoice(d);
      this.bigToast(rt.kind === 'wreck' ? 'WRECK DOSSIER' : 'DEEP SURVEY', `${d.name} · ${PLANET_TYPES[d.type]?.label || 'Derelict'} · +${fmtCredits(pay)} CR${d.hasLife ? ' · LIFE SIGNS' : ''}`, 'good');
    } else {
      this.hud.toast(`Re-survey of ${d.name} · +${fmtCredits(pay)} CR`, 'money', 3.5);
    }
    this.checkMissions('scan', { systemId: this.system.id });
    noteTutorial(this.tutorial, 'scan');
    onCampaignEvent(this, 'scan', {
      id: d.id || d.name,
      kind: rt.kind || d.kind || 'planet',
      story: d.story,
      name: d.name,
      dive: d.story === 'dive',
      beacon: d.story === 'beacon',
      signal: d.story === 'signal',
      distress: !!d.distress,
    });
    this._claimDistress(d);
  }

  _claimDistress(d) {
    if (!d?.distress || d.distressPaid) return;
    d.distressPaid = true;
    d.discovered = true;
    const space = Math.max(0, (this.ship.stats.cargo || 0) - this.cargoUsed());
    const tons = Math.min(2, space);
    if (tons > 0) {
      this.cargo.minerals = (this.cargo.minerals || 0) + tons;
      this.ship.cargo = this.cargo;
    }
    this.credits += 1800;
    this.stats.earned += 1800;
    this.hud.toast(`DISTRESS CRATE · +${tons}t minerals · +${fmtCredits(1800)} CR`, 'money', 5.2, true);
  }

  _updateDocking(dt) {
    const s = this.ship;
    this.dockPrompt = null;
    if (!s || !this.systemScene?.stations?.length) return;
    if (this.flightLayer === 'atmo') return;
    if (this._undockGrace && this.time < this._undockGrace) return;

    let best = null, bd = Infinity, req = 0;
    for (const st of this.systemScene.stations) {
      const wp = this.systemScene.getPos(st, this._tmpV);
      const d = wp.distanceTo(s.position);
      const vis = Math.max(st.radius || 0, st.data.radius || 0, st.data.dockRadius || 90);
      let r = vis * 2.6 + 80;
      // Give the docking computer a small buffer beyond the manual prompt
      // radius so it can catch an orbiting pad while bleeding off speed.
      if (this.dockComp) r *= 1.25;
      if (this.tutorial) r = vis * 5 + 520;
      if (d < bd) { bd = d; best = st; req = r; }
    }
    if (!best || bd > req) return;

    const tooFast = this.tutorial ? false : s.speed >= 720;
    this.dockPrompt = { st: best, dist: bd, tooFast };
    if (tooFast) return;
    if (this.input.down('KeyE') || this.dockComp) this.dock(best);
  }

  _updateCollisions(dt) {
    const s = this.ship;
    this.collisionWarn = false;
    if (this.flightLayer === 'atmo') return;
    if (this._spawnGrace && this.time < this._spawnGrace) return;
    // planets / moons / star
    const list = [];
    for (const p of this.systemScene.planets) {
      list.push({ pos: p.group.position, r: p.radius, name: p.data.name, planet: p });
      for (const m of p.moons) list.push({ pos: m.group.position, r: m.radius, name: m.data.name, planet: m });
    }
    list.push({ pos: new THREE.Vector3(0, 0, 0), r: this.system.star.radius * 1.05, name: this.system.star.name });
    if (this._collideStations(s)) return;

    for (const o of list) {
      const d = s.position.distanceTo(o.pos);
      if (o.planet && d < o.r * 1.5) {
        if (this._leavingAtmo) return;
        if (this._exitGrace && this.time < this._exitGrace) continue;
        this.enterAtmosphere(o.planet);
        return;
      }
      if (d < o.r * 1.6 && d > o.r) {
        const closing = this._tmpV2.copy(o.pos).sub(s.position).normalize().dot(s.velocity);
        if (closing > 40) this.collisionWarn = true;
      }
      if (d < o.r + 4) {
        const n = this._tmpV2.copy(s.position).sub(o.pos).normalize();
        const impact = Math.abs(s.velocity.dot(n.clone().negate()));
        s.position.copy(o.pos).addScaledVector(n, o.r + 6);
        s.velocity.addScaledVector(n, impact * 0.65).multiplyScalar(0.4);
        if (impact > 40) {
          const dmg = impact * 0.45;
          const res = s.damage(dmg);
          this.hud.shake = Math.max(this.hud.shake, clamp(impact / 500, 0.1, 0.9));
          this.hud.damageFlash = Math.max(this.hud.damageFlash, clamp(impact / 400, 0.2, 1.2));
          this.particles.sparks(s.position, n, 22, '#ffc24d', 60);
          if (res === 'destroyed') this.die(`Impacted ${o.name} at ${fmtSpeed(impact)} m/s`);
        }
      }
    }
    // asteroids
    for (const belt of this.systemScene.belts) {
      const local = belt.group.worldToLocal(this._tmpV3.copy(s.position));
      for (const r of belt.rocks) {
        if (!r.alive) continue;
        const dx = r.pos.x - local.x, dy = r.pos.y - local.y, dz = r.pos.z - local.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        const min = r.size + 3.5;
        if (d2 < min * min) {
          const impact = s.velocity.length();
          const n = this._tmpV2.set(-dx, -dy, -dz).normalize().applyQuaternion(belt.group.quaternion);
          s.position.addScaledVector(n, min + 1);
          s.velocity.multiplyScalar(0.35);
          this.particles.sparks(s.position, n, 10, '#c8a97a', 30);
          if (impact > 120) {
            const res = s.damage(impact * 0.16);
            this.hud.shake = Math.max(this.hud.shake, 0.25);
            if (res === 'destroyed') this.die('Collided with an asteroid at speed');
          }
          r.ore = Math.max(0, r.ore - impact * 0.05);
          break;
        }
      }
    }
    // charted-volume edge — damp outward speed, don't snap/jitter
    if (this.flightLayer === 'atmo') return;
    const limit = this.navLimit || 900000;
    const r = s.position.length();
    if (r > limit) {
      const inv = 1 / r;
      const nx = s.position.x * inv, ny = s.position.y * inv, nz = s.position.z * inv;
      const vr = s.velocity.x * nx + s.velocity.y * ny + s.velocity.z * nz;
      if (vr > 0) {
        s.velocity.x -= nx * vr;
        s.velocity.y -= ny * vr;
        s.velocity.z -= nz * vr;
      }
      const over = (r - limit) / limit;
      const pull = (220 + over * 1600) * dt;
      s.velocity.x -= nx * pull;
      s.velocity.y -= ny * pull;
      s.velocity.z -= nz * pull;
      const hard = limit * 1.14;
      if (r > hard) s.position.multiplyScalar(hard / r);
      if (!this._edgeToast || this.time - this._edgeToast > 10) {
        this.hud.toast('Chart edge — press U to leave this galaxy', 'info', 5);
        this._edgeToast = this.time;
      }
    }
  }

  /** Hull-accurate station contact. Returns true when the ship was destroyed. */
  _collideStations(s) {
    const n = _stationN;
    const shipR = Math.max(12, (s.mesh?.userData?.length || 11) * (s.scale || 1) * 0.62);
    for (const st of this.systemScene.stations) {
      let d = stationDistance(st, s.position, n, 240);
      if (d === Infinity) continue;
      if (d < 180 && d > shipR && s.velocity.dot(n) < -40 && -s.velocity.dot(n) * 2.2 > d) this.collisionWarn = true;
      if (d >= shipR) continue;
      const impact = Math.max(0, -s.velocity.dot(n));
      // Full-depth eject, clamped so a deep embed clears in 1–2 frames without
      // flinging the ship across the map (old 8u/frame left them inside the hull).
      let guard = 0;
      while (d < shipR && guard++ < 3) {
        const push = Math.min(shipR - d + 0.35, 140);
        s.position.addScaledVector(n, push);
        d = stationDistance(st, s.position, n, 240);
        if (d === Infinity) break;
      }
      // Cancel inward velocity only — never scale the whole vector / destroy on soft hits.
      if (impact > 0) s.velocity.addScaledVector(n, impact);
      if (impact > 260) {
        const res = s.damage(impact * 0.12);
        this.hud.shake = Math.max(this.hud.shake, clamp(impact / 900, 0.04, 0.35));
        this.hud.damageFlash = Math.max(this.hud.damageFlash, clamp(impact / 800, 0.05, 0.4));
        this.particles.sparks(s.position, n, 8, '#ffc24d', 24);
        if (res === 'destroyed') { this.die(`Impacted ${st.data.name} at ${fmtSpeed(impact)} m/s`); return true; }
      }
    }
    return false;
  }

  _updateCamera(dt) {
    if (this.cinema?.active) { this.cinema.applyCamera(dt); return; }
    const s = this.ship;
    const mode = this.camMode || 0;
    const snap = this._camLock;
    let off, lag = 9;
    if (this.flightLayer === 'atmo') {
      const L = Math.max(8, (s.mesh?.userData.length || 10) * (s.scale || 1));
      const fwd = s.forward;
      const hlen = Math.hypot(fwd.x, fwd.z);
      const hx = hlen > 0.08 ? fwd.x / hlen : 0;
      const hz = hlen > 0.08 ? fwd.z / hlen : 0;
      const steep = clamp((0.42 - hlen) / 0.42, 0, 1);
      const mode = this.camMode || 0;
      let ox;
      let oy;
      let oz;
      let lookK = 12;
      if (mode === 2) {
        _camLocal.set(0, L * 0.205, -L * 0.12).applyQuaternion(s.quaternion);
        ox = _camLocal.x; oy = _camLocal.y; oz = _camLocal.z;
        lookK = 0.95;
      } else if (mode === 3) {
        const a = this.time * 0.16;
        const R = L * 4.2;
        ox = Math.cos(a) * R;
        oy = L * 1.35;
        oz = Math.sin(a) * R;
        lookK = 0;
      } else if (mode === 1) {
        _camWorld.set(-hx * L * 3.15, L * 1.15, -hz * L * 3.15);
        _camLocal.set(0, L * 0.32, L * 1.25).applyQuaternion(s.quaternion);
        _camWorld.lerp(_camLocal, steep);
        ox = _camWorld.x; oy = _camWorld.y; oz = _camWorld.z;
        lookK = 9;
      } else {
        _camWorld.set(-hx * L * 5.4, L * 1.85 + Math.max(0, -fwd.y) * L * 0.35, -hz * L * 5.4);
        _camLocal.set(0, L * 0.5, L * 1.95).applyQuaternion(s.quaternion);
        _camWorld.lerp(_camLocal, steep);
        ox = _camWorld.x; oy = _camWorld.y; oz = _camWorld.z;
      }
      const desiredAtmo = this._tmpV.set(ox, oy, oz);
      if (!this._camOff || snap) this._camOff = desiredAtmo.clone();
      else this._camOff.lerp(desiredAtmo, 1 - Math.exp(-10 * dt));
      this.camera.position.copy(s.position).add(this._camOff);
      if (this.hud.shake > 0.01) {
        this.camera.position.add(new THREE.Vector3().randomDirection().multiplyScalar(this.hud.shake * 0.45));
      }
      if (mode === 2) {
        _camLook.copy(s.position).addScaledVector(fwd, L * lookK).addScaledVector(s.up, -L * 0.16);
      } else if (mode === 3 || steep > 0.65) {
        _camLook.copy(s.position).add(new THREE.Vector3(0, L * 0.12, 0));
      } else {
        _camLook.set(
          s.position.x + hx * L * lookK,
          s.position.y + fwd.y * L * 4 + 3,
          s.position.z + hz * L * lookK
        );
      }
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(_camLook);
      if (this.surface && !this.surface.gas) {
        const gy = this.surface.heightAt(this.camera.position.x, this.camera.position.z) + 14;
        if (this.camera.position.y < gy) {
          this.camera.position.y = gy;
          if (mode === 3) _camLook.copy(s.position).add(new THREE.Vector3(0, L * 0.12, 0));
          this.camera.lookAt(_camLook);
        }
      }
      this.camera.near = mode === 2 ? 0.35 : 0.4;
      this.camera.far = 8200;
      this.camera.fov = damp(this.camera.fov, mode === 2 ? 64 : 58, 8, dt);
      this.camera.updateProjectionMatrix();
      return;
    }
    const L = Math.max(8, (s.mesh?.userData.length || 10) * (s.scale || 1));
    if (mode === 0) { off = new THREE.Vector3(0, L * 0.46, L * 2.05); lag = 18; }
    else if (mode === 1) { off = new THREE.Vector3(0, L * 0.28, L * 1.35); lag = 22; }
    else if (mode === 2) { off = new THREE.Vector3(0, L * 0.205, -L * 0.12); lag = 28; }
    else {
      const a = this.time * 0.16;
      const R = L * 3.1;
      off = new THREE.Vector3(Math.cos(a) * R, L * 0.72 + Math.sin(a * 0.7) * L * 0.2, Math.sin(a) * R);
      lag = 4;
    }
    // damp the *offset* in ship space, not the world position — otherwise the
    // camera falls back by speed/lag at cruise and the hull shrinks to a dot
    const desiredOff = off.applyQuaternion(s.quaternion);
    if (!this._camOff || snap) this._camOff = desiredOff.clone();
    else this._camOff.lerp(desiredOff, 1 - Math.exp(-lag * dt));
    this.camera.position.copy(s.position).add(this._camOff);
    if (this.hud.shake > 0.01) {
      this.camera.position.add(new THREE.Vector3().randomDirection().multiplyScalar(this.hud.shake * 0.8));
    }
    const parked = this.camera.position.clone();
    this._clearFlightCam(L);
    const occluded = this.camera.position.distanceTo(parked) > 0.45;
    this._q.copy(s.quaternion);
    if (mode === 2 && occluded) {
      _camLook.copy(s.position).add(_camLocal.set(0, 0.45, -L * 0.38).applyQuaternion(s.quaternion));
      const m = new THREE.Matrix4().lookAt(this.camera.position, _camLook, new THREE.Vector3(0, 1, 0));
      this._q.setFromRotationMatrix(m);
    } else if (mode === 2) {
      this._q.multiply(_camPitch.setFromAxisAngle(_X_AXIS, -0.28));
    } else if (mode === 0 || mode === 1) {
      // pitch the chase camera down a touch so the hull sits in the lower third
      // and the horizon/target stays high in frame
      this._q.multiply(_camPitch.setFromAxisAngle(_X_AXIS, mode === 0 ? -0.13 : -0.11));
    }
    if (mode === 3 || (occluded && mode !== 2)) {
      const m = new THREE.Matrix4().lookAt(this.camera.position, s.position, new THREE.Vector3(0, 1, 0));
      this._q.setFromRotationMatrix(m);
    }
    this.camera.quaternion.slerp(this._q, snap ? 1 : 1 - Math.exp(-(mode === 2 ? 30 : 14) * dt));

    const speedRatio = clamp(s.speed / 4200, 0, 1);
    const targetFov = (mode === 2 ? 64 : 48) + speedRatio * 3 + (s.boostAmt || (s.boost ? 1 : 0)) * 2 + this.warpAmount * 6;
    this.camera.near = mode === 2 ? 0.35 : 0.4;
    this.camera.far = 9e6;
    this.camera.fov = damp(this.camera.fov, targetFov, 6, dt);
    if (this.filament) {
      const u = clamp(this.filament.t / this.filament.dur, 0, 1);
      this.camera.fov = 52 + u * 48;
    }
    this.camera.updateProjectionMatrix();
  }

  // Pull the boom out of planets, moons, stations, and the star. If the
  // hull then sits inside the boom, slide sideways so the ship stays in frame.
  _clearFlightCam(L) {
    if (this.flightLayer === 'atmo' || !this.ship || !this.systemScene) return;
    const cam = this.camera.position;
    const ship = this.ship.position;
    const spheres = [];
    const add = (pos, r) => { if (pos && r > 2) spheres.push({ pos, r }); };
    for (const p of this.systemScene.planets || []) {
      add(p.group.position, (p.radius || 40) * 1.03);
      for (const m of p.moons || []) add(m.group.position, (m.radius || 8) * 1.08 + 1.2);
    }
    add(new THREE.Vector3(), (this.system?.star?.radius || 400) * 1.12);
    for (const st of this.systemScene.stations || []) {
      for (let pass = 0; pass < 3; pass++) {
        const d = stationDistance(st, cam, _stationN, 20);
        if (d === Infinity || d >= 2.5) break;
        cam.addScaledVector(_stationN, 2.5 - d);
      }
    }
    const minBoom = Math.max(8.4, L * 0.62);
    for (let pass = 0; pass < 3; pass++) {
      for (const sp of spheres) {
        _camRadial.copy(cam).sub(sp.pos);
        const d = _camRadial.length();
        if (d >= sp.r) continue;
        if (d < 1e-4) _camRadial.set(0, 1, 0);
        else _camRadial.multiplyScalar(1 / d);
        cam.copy(sp.pos).addScaledVector(_camRadial, sp.r + 1.6);
      }
      if (cam.distanceTo(ship) >= minBoom) continue;
      let nearest = null;
      let best = Infinity;
      for (const sp of spheres) {
        const d = cam.distanceTo(sp.pos);
        if (d < best) { best = d; nearest = sp; }
      }
      _camRadial.copy(cam).sub(nearest ? nearest.pos : ship);
      if (_camRadial.lengthSq() < 1e-6) _camRadial.set(0, 1, 0);
      _camRadial.normalize();
      _camTangent.crossVectors(_camRadial, _camLook.copy(cam).sub(ship));
      if (_camTangent.lengthSq() < 1e-6) _camTangent.crossVectors(_camRadial, _X_AXIS);
      if (_camTangent.lengthSq() < 1e-6) _camTangent.set(1, 0, 0);
      _camTangent.normalize();
      cam.addScaledVector(_camTangent, minBoom);
    }
  }

  cycleCamera() {
    this.camMode = ((this.camMode || 0) + 1) % 4;
    this._camOff = null;
    const names = ['CHASE', 'CLOSE CHASE', 'COCKPIT', 'CINEMATIC'];
    this.hud.toast(`Camera: ${names[this.camMode]}`, 'info', 1.8);
    Audio.uiClick();
  }

  _steerAutopilot(dt) {
    const wp = this.targetPos;
    const s = this.ship;
    if (!wp || !s) { this.autopilot = false; return; }
    const want = this._tmpV2.copy(wp).sub(s.position);
    const dist = want.length();
    if (dist < 1) return;
    want.normalize();
    _autopilotQ.setFromUnitVectors(_SHIP_FORWARD, want);
    s.quaternion.slerp(_autopilotQ, clamp(2.1 * dt, 0, 1));
    s.quaternion.normalize();
    const isPlanet = this.target?.kind === 'planet' || this.target?.kind === 'moon';
    if (isPlanet && this.autopilot) {
      // Stop well outside the atmosphere.  The player chooses when to cross
      // the atmospheric boundary; B is navigation, not an automatic landing.
      const stopRadius = Math.max(
        (this.target.radius || 40) * 1.8 + 420,
        this._bodyVisualRadius(this.target) + 520,
      );
      if (dist <= stopRadius) {
        s.throttle = 0;
        this.autopilot = false;
        this.hud.toast('AUTOPILOT ARRIVED · ORBITAL STAND-OFF', 'info', 3.2);
        s.sync();
        return;
      }
      const approachSpeed = Math.sqrt(2 * 120 * Math.max(0, dist - stopRadius)) + 80;
      s.throttle = clamp(approachSpeed / Math.max(1, this.controller?.speedCap || 28000), 0.004, 0.78);
    } else {
      const pad = (this.target?.kind === 'station') ? 140 : 480;
      s.throttle = dist > pad * 10 ? 0.78 : dist > pad * 3 ? 0.42 : 0.12;
      if (this.dockComp && this.target?.kind === 'station') {
        // Docking requires <720 m/s inside the pad radius. A fixed 0.06
        // throttle still commands ~1,600 m/s, so the computer can orbit the
        // pad forever without ever satisfying _updateDocking(). Start braking
        // at the physical capture radius and follow a stopping-distance curve.
        const dockRange = Math.max(
          this.target.radius || 0,
          this.target.data?.radius || 0,
          this.target.data?.dockRadius || 0,
        ) * 2.6 + 80;
        const captureRange = dockRange * 1.25;
        const braking = Math.max(0, dist - captureRange);
        const approachSpeed = Math.sqrt(2 * 160 * braking) + 120;
        s.throttle = clamp(
          approachSpeed / Math.max(1, this.controller?.speedCap || 28000),
          0.004,
          0.78,
        );
      } else if (this.dockComp) {
        s.throttle = dist > pad * 8 ? 0.55 : dist > pad * 2.2 ? 0.22 : 0.06;
      }
    }
    s.sync();
  }

  _updateSurfacePois() {
    const pois = this.surface?.pois;
    if (!pois) { this.poiPrompt = null; return; }
    const s = this.ship;
    const near = this.surface.nearestPoi?.(s.position, 2800);
    if (near && near.dist < 920 && this.surface.noteSeen?.(near.poi)) {
      const rng = this.surface.formatRange ? this.surface.formatRange(near.dist) : `${Math.round(near.dist)} m`;
      this.hud.toast(`${near.poi.name} · ${rng}`, 'info', 3.0);
    }
    let best = null, bd = 150;
    for (const p of pois) {
      if (p.scanned) continue;
      const wp = p.position || p.mesh?.position;
      if (!wp) continue;
      const d = s.position.distanceTo(wp);
      if (d < bd) { bd = d; best = p; }
    }
    this.poiPrompt = best;
  }

  _drawHud(dt, hostiles, near, maxSpeed) {
    const s = this.ship;
    const t = this.target;
    let tinfo = null;
    if (t) {
      const wp = this.targetPos;
      const dist = wp ? s.position.distanceTo(wp) : 0;
      const dir = wp ? this._tmpV.copy(wp).sub(s.position).normalize() : null;
      const align = dir ? s.forward.dot(dir) : 0;
      const d = t.data || t;
      let info = '';
      if (t.kind === 'planet' || t.kind === 'moon') {
        if (this.flightLayer === 'atmo') info = d.scanned ? PLANET_TYPES[d.type].label : 'SURFACE';
        else info = d.scanned ? PLANET_TYPES[d.type].label : d.pinged ? 'PINGED · DWELL FOR DEEP SURVEY' : 'UNSURVEYED';
        if (d.hasLife && d.scanned) info += ' · LIFE';
      } else if (t.kind === 'station') info = t.remote
        ? `${STATION_KIND_LABEL[d.kind] || 'Station'} · ${t.system?.name || 'other star'} · HOLD J`
        : `${ECONOMIES[d.economy]?.label || 'Station'} · ${STATION_KIND_LABEL[d.kind] || d.kind}`;
      else if (t.kind === 'belt') info = `BELT · ${Math.round(d.richness * 100)}% RICH · ${String(d.composition || 'ore').replace('_', ' ')}`;
      else if (t.kind === 'ship' || t instanceof NpcShip) {
        const lock = (this.lockNpc === t) ? Math.round((this.lockFrac || 0) * 100) : 0;
        info = `${t.hostile ? 'HOSTILE' : 'CIVILIAN'} · ${Math.round(t.hull)} HP${lock ? ` · LOCK ${lock}%` : ''}`;
      }
      else if (t.kind === 'wreck') info = d.scanned ? 'SALVAGED' : d.pinged ? 'PINGED' : 'DERELICT';
      else info = String(t.kind).toUpperCase();
      tinfo = {
        name: d.name || t.name || 'Unknown',
        dist: t.remote ? null : dist,
        where: t.remote ? (t.system?.name || 'OTHER STAR') : '',
        align: (align + 1) / 2, info,
      };
    }
    const mined = this.mineRock?.rock;
    const oreLabel = mined ? (COMMODITIES.find((c) => c.id === mined.commodity)?.name || mined.commodity || 'ore') : 'ore';
    const inAtmo = this.flightLayer === 'atmo';
    const poiDumping = this.dumping && this.poiPrompt;
    const progress = this.mining
      ? {
        amount: mined?.oreMax ? 1 - clamp((mined.ore || 0) / mined.oreMax, 0, 1) : 1 - clamp((mined?.ore || 0) / 60, 0, 1),
        label: mined?.rare ? `CUTTING ${String(oreLabel).toUpperCase()} · RARE` : `CUTTING ${String(oreLabel).toUpperCase()}`,
        color: mined?.rare ? '#c04cf0' : '#ffc24d',
        sub: `G${mined?.grade || 1} · ${(mined?.ore || 0).toFixed(1)}t left in rock · hold ${this.cargoUsed().toFixed(1)}/${s.stats.cargo}t`,
      }
      : this.prospecting
        ? { amount: mined?.prospect || 0, label: 'PROSPECTING', color: '#7ec8ff', sub: `Grading ${oreLabel} · ${Math.round((mined?.prospect || 0) * 100)}% · keep holding to cut` }
        : poiDumping
          ? {
            amount: clamp((this.poiPrompt.scan || 0) / 1.15, 0, 1),
            label: `DUMPING ${String(this.poiPrompt.name || 'BEACON').toUpperCase()}`,
            color: '#ffc24d',
            sub: 'Hold F · one data dump',
          }
          : this.jumpState === 'charging'
            ? { amount: this.jumpCharge, label: 'FRAME SHIFT', color: '#c98aff', kind: 'jump' }
            : null;

    const scanT = this._scanBody(this.target);
    let prompt = null;
    if (this.dockPrompt?.tooFast) prompt = `SLOW DOWN TO DOCK — ${this.dockPrompt.st.data.name.toUpperCase()}`;
    else if (this.dockPrompt) prompt = this.dockComp ? `DOCKING COMPUTER · ${this.dockPrompt.st.data.name.toUpperCase()}` : `PRESS  E  TO DOCK — ${this.dockPrompt.st.data.name.toUpperCase()}`;
    else if (this.mining || this.prospecting || this.dumping || this.fMode === 'scan') {
      prompt = null;
    }
    else if (this.mineRock && this.mineRock.dist < MINE_PROSPECT_RANGE) {
      const r = this.mineRock.rock;
      const nm = COMMODITIES.find((c) => c.id === r.commodity)?.name || r.commodity || 'ore';
      if (!r.prospected) prompt = this.mineRock.source === 'planet' ? `HOLD  F  TO PROSPECT VEIN · ${String(nm).toUpperCase()}` : `HOLD  F  TO PROSPECT · ${String(nm).toUpperCase()}`;
      else if (this.mineRock.dist > MINE_CUT_RANGE && this.mineRock.source !== 'planet') prompt = `G${r.grade}${r.rare ? ' RARE' : ''} ${String(nm).toUpperCase()} · CLOSE TO ${(MINE_CUT_RANGE / 1000).toFixed(1)} KM TO CUT`;
      else prompt = `HOLD  F  TO CUT · G${r.grade}${r.rare ? ' RARE' : ''} ${String(nm).toUpperCase()} · ${Math.round(r.ore)}t`;
    }
    else if (inAtmo && this.poiPrompt) prompt = `HOLD  F  TO DUMP ${String(this.poiPrompt.name || 'BEACON').toUpperCase()}`;
    else if (!inAtmo && scanT && !this.target.data.scanned) {
      const wp = this.targetPos;
      const dist = s.position.distanceTo(wp);
      const prof = this._scanProfile(this.target);
      const need = this.target.data.pinged ? prof.deepRange : prof.pingRange;
      if (dist < need * 2.4) {
        prompt = dist <= need
          ? (this.target.data.pinged ? 'HOLD  F  · DWELL FOR DEEP SURVEY' : 'HOLD  F  · LIDAR PING')
          : `CLOSE TO ${fmtDist(need)} TO ${this.target.data.pinged ? 'DEEP-SURVEY' : 'PING'}`;
      }
    }
    else if (this._nearBelt && !inAtmo && !scanT) {
      prompt = 'ASTEROID FIELD · NOSE ON A ROCK · HOLD F TO PROSPECT';
      if ((this.campaign?.chapter || 0) >= 2) {
        this._careerHintOnce('beltIntro', 'Prospect first (hold F), fly closer, hold F again to cut ore into cargo.', 'info', 5.5);
      }
    }
    if (this.fuelProbe?.active || !prompt) prompt = this.fuelProbe?.hint(this) || prompt;

    let fVerb = 'SCAN';
    if (this.fMode === 'dump' || (inAtmo && this.poiPrompt && !this.mineRock)) fVerb = 'DUMP';
    else if (this.fMode === 'cut' || this.mining) fVerb = 'CUT';
    else if (this.fMode === 'prospect' || this.prospecting || (this.mineRock && !this.mineRock.rock?.prospected)) fVerb = 'PROSPECT';
    else if (this.fMode === 'scan') fVerb = 'SCAN';

    let atmoPoi = null;
    if (this.flightLayer === 'atmo' && this.surface?.nearestPoi) {
      const n = this.surface.nearestPoi(s.position, 6000);
      if (n) atmoPoi = { name: n.poi.name, dist: n.dist };
    }

    this.hud.draw({
      dt, camera: this.camera, ship: s,
      shipPos: s.position, velocity: s.velocity,
      shipForward: s.forward, shipRight: s.right, shipUp: s.up,
      speed: s.speed, throttle: s.throttle, boost: !!(s.boost || (s.boostAmt > 0.4)),
      hull: s.hull, maxHull: s.maxHull, shield: s.shield, maxShield: s.maxShield,
      fuel: s.fuel, maxFuel: s.maxFuel,
      cargoUsed: this.cargoUsed(), cargoMax: s.stats.cargo,
      credits: this.credits,
      systemName: this.system.name, faction: this.system.faction.name, danger: this.system.danger,
      galaxyName: this.galaxy?.name,
      shipName: `${this.callsign} · ${s.def.name}`,
      clock: `T+${fmtTime(this.stats.playtime)}  ·  ${fmtDist(this.stats.distance)} FLOWN`,
      fps: this.fps,
      contacts: this.contacts,
      target: tinfo,
      radarRange: this.settings.radarRange,
      mode: this.warpAmount > 0.2 ? 'frame shift' : s.speed > 2200 ? 'supercruise' : 'normal space',
      warp: this.warpAmount,
      firing: this.firing,
      hostiles,
      overheat: this.heat,
      collisionWarn: this.collisionWarn,
      prompt, progress,
      scan: this.fMode === 'scan' ? this.scanHud : null,
      fVerb, fMode: this.fMode,
      missileLock: !!(this.projectiles && this.projectiles.missilePool.some((m) => m.life > 0 && m.target === s)),
      lockFrac: this.lockFrac || 0,
      missiles: this.missiles ?? 0,
      missilesMax: this.missilesMax || 8,
      mouseSteer: this.settings.mouseSteer,
      hidden: this.hudCinematic > 0 || !!this.photo,
      hints: !!this.settings.showHints,
      chaff: this.chaff || 0, heatsinks: this.heatsinks || 0,
      pips: this.pips, wanted: this.wanted || 0, silent: !!this.silent, autopilot: !!this.autopilot,
      dockComp: !!this.dockComp,
      news: null,
      rankLine: null,
      payday: this.tutorial ? null : paydayLine(this.missions, this.cargo, this.galaxy?.hubs || [], this.dockedAt?.data?.kind || this.systemScene?.stations?.[0]?.data?.kind),
      insured: !!this.insured,
      rep: this.rep,
      quiet: (this.stats.playtime || 0) < 12,
      story: this.tutorial ? { n: (this.tutorial.i || 0) + 1, title: 'TRAINING' } : (this.campaign && !this.campaign.ending ? chapterInfo(this.campaign) : null),
      nav: this.tutorial ? tutorialNav(this.tutorial, this) : (this.campaign ? nextStep(this) : null),
      atmo: this.flightLayer === 'atmo',
      altitude: this.surface
        ? (this._surfaceAgl ?? (this.surface.gas ? s.position.y : s.position.y - this.surface.heightAt(s.position.x, s.position.z)))
        : s.position.y,
      atmoFeel: this._atmoFeel?.hud || '',
      atmoRange: this._atmoOrigin
        ? Math.hypot(s.position.x - this._atmoOrigin.x, s.position.z - this._atmoOrigin.z)
        : 0,
      atmoPoi,
      comm: latestComm(this.campaign, null),
      well: wellParameter(this.system.star.massSolar || 1, auFromGameOrbit(Math.max(80, s.position.length()))),
      wellOk: this.flightLayer === 'atmo' ? true : canFrameShift(this.system.star.massSolar || 1, auFromGameOrbit(Math.max(80, s.position.length()))),
      haloReady: this.flightLayer !== 'atmo' && this.inFilamentReady(),
      haloPos: this._haloWorld(),
    });
  }

  _haloWorld() {
    const outer = (this.system.planets || []).reduce((m, p) => Math.max(m, p.orbitRadius || 0), 18000);
    const n = this.ship.position.clone();
    if (n.lengthSq() < 1) n.set(1, 0, 0); else n.normalize();
    return n.multiplyScalar(outer * 1.08);
  }

  _attachRtxDepth() {
    const fit = (rt) => {
      if (!rt) return;
      const d = rt.depthTexture;
      if (d && d.image && d.image.width === rt.width && d.image.height === rt.height) return;
      const depth = new THREE.DepthTexture(rt.width, rt.height);
      depth.type = THREE.UnsignedIntType;
      rt.depthBuffer = true;
      rt.depthTexture = depth;
    };
    fit(this.composer?.renderTarget1);
    fit(this.composer?.renderTarget2);
  }

  render(dt) {
    const load = document.getElementById('loadScreen');
    if (load && !load.classList.contains('hidden')) return;
    if (!this.systemScene) { this.renderer.render(this.scene, this.camera); return; }
    if (this.rtxPass) {
      const on = !!this.settings.rtx && this.state !== 'title' && this.state !== 'boot';
      this.rtxPass.enabled = on;
    }
    this.composer.render(dt);
    if (this._wantShot) {
      this._wantShot = false;
      this._dumpShot();
    }
  }

  captureStoreShot() {
    this._wantShot = true;
  }

  _dumpShot() {
    const canvas = this.renderer.domElement;
    const done = (blob) => {
      if (!blob) { this.hud?.toast('Screenshot failed', 'bad'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `astralis-shot-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      this.hud?.toast('Screenshot → Downloads (need five 1920×1080 for Steam)', 'good', 4.5, true);
    };
    if (canvas.toBlob) canvas.toBlob(done, 'image/png');
    else {
      const data = canvas.toDataURL('image/png');
      fetch(data).then((r) => r.blob()).then(done).catch(() => this.hud?.toast('Screenshot failed', 'bad'));
    }
  }

  // =========================================================================
  //  STATE SWITCHES
  // =========================================================================
  pause() {
    if (this.state === 'playing') {
      this.save(true);
      this.state = 'paused';
      this.maps.close();
      this.menus.openPause();
      document.body.style.cursor = 'default';
      Audio.stopMining(); this._miningSound = false;
    } else if (this.state === 'paused') this.resume();
  }
  resume() {
    this.state = 'playing';
    this.menus.hideAll();
    document.body.style.cursor = 'none';
    this.input.centerStick();
    this.input.lockPointer();
    Audio.uiClick();
  }
  toTitle() {
    this.fuelProbe?.reset();
    if (!this.tutorial) this.save(true);
    this.tutorial = null;
    this._syncCoach(false);
    this.maps.close();
    this.menus.hideAll();
    this.startTitlePreview();
    this.menus.showTitle();
    document.body.style.cursor = 'default';
    Audio.stopMining(); this._miningSound = false;
  }
}
