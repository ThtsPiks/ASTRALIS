// ============================================================================
//  MENUS — title, ship select, pause, station services, modals
// ============================================================================
import { SHIP_DEFS, FLEET_IDS, HANGAR_IDS, resolveShipId } from '../ship/ship.js?v=omega15';
import { COMMODITIES, ECONOMIES, PLANET_TYPES, STAR_TYPES, STATION_KIND_LABEL } from '../world/galaxy.js?v=chart1';
import { clamp, fmtCredits, fmtDist, fmtTime } from '../core/utils.js';
import { Audio } from '../core/audio.js';
import { shipUnlocked, onCampaignEvent, chapterInfo, nextStep, patronPitch } from '../story/campaign.js?v=finale6';
import { briefingSlide, briefingNotesHtml, BRIEFING } from './briefing.js?v=story5';
import { tutorialNav } from '../game/tutorial.js?v=tut4';
import { saveSlotKey, combatRank, tradeRank, exploreRank, insurancePremium, insuranceExcess, writFine, factionStanding, REFINE_RECIPES, canRefine, applyRefine, applyBulletinBonus, routeHint, circuitHint, surveyDataPayout, refineHaulDelta, sellableTons, bulletinRemaining, padJobs } from '../game/career.js?v=omega14';
import { wipeNativeSaves } from '../core/persist.js';
import { ACHIEVEMENTS } from '../game/achievements.js';
import { shipThumbnail } from './shipthumb.js?v=hangar3';
import { commodityArt } from './commodity-art.js?v=svg2';
import { stationProfile, stationServices, stationTabs, STATION_PROFILES } from '../game/station-services.js?v=omega14';
import { FUEL_CR_PER_UNIT } from '../game/ledger.js?v=omega14';
import { tradePrices, tonsQty, RECIPES, MODULES, SLOT_COUNT } from '../game/catalog.js?v=omega14';
import {
  quoteExpedition, cancelExpedition, armExpedition, chooseSite, sitesFor, resolveEvent, EVENTS,
  craftRecipe, learnBlueprint, fitModule, unfitModule, buyFinished, convertFuelCargo, publishDiscovery,
} from '../game/expedition.js?v=omega14';
import { accessRows, unlockWorldType, nextLicenceGoals } from '../game/planet-access.js?v=omega14';
import { chartRows, buyGalaxyChart } from '../game/galaxy-charts.js?v=sky1';
import { planetThumbnail } from './planetthumb.js?v=chart1';
import { transitReport, anchorStatus, contributeAnchor, refundAnchor, buildAnchor, openScienceRoute, reserveReturnCell } from '../game/route.js?v=finale6';

const shipVis = (id) => {
  const url = shipThumbnail(SHIP_DEFS[id]);
  return url ? `<img src="${url}" alt="${SHIP_DEFS[id].name}" draggable="false" />` : (SHIP_SVG[id] || '');
};

const SHIP_SVG = {
  aurora: `<svg viewBox="0 0 300 120"><path d="M38 62 L120 46 L248 56 L248 68 L120 78 Z" fill="#c4b49a"/><path d="M150 48 L258 30 L266 42 L178 58 Z" fill="#1a1c22"/><path d="M150 76 L258 94 L266 82 L178 66 Z" fill="#1a1c22"/><rect x="228" y="46" width="18" height="10" fill="#3ec8ff"/><rect x="228" y="68" width="18" height="10" fill="#3ec8ff"/><path d="M52 52 L92 48 L110 56 L92 58 Z" fill="#0d2233" stroke="#3ec8ff"/></svg>`,
  vesper: `<svg viewBox="0 0 300 120"><path d="M28 58 L72 42 L108 40 L108 80 L72 78 Z" fill="#8e97a3"/><rect x="108" y="38" width="118" height="44" fill="#8e97a3"/><rect x="118" y="34" width="98" height="8" fill="#1a1e26"/><rect x="226" y="44" width="28" height="32" fill="#6a7480"/><rect x="250" y="50" width="16" height="12" fill="#5fd8ff"/><rect x="250" y="66" width="16" height="12" fill="#5fd8ff"/><path d="M40 48 L78 40 L92 52 L78 54 Z" fill="#0d2233" stroke="#5fd8ff"/></svg>`,
  ember: `<svg viewBox="0 0 300 120"><path d="M24 60 L90 50 L160 46 L250 54 L270 60 L250 66 L160 74 L90 70 Z" fill="#5c5752"/><path d="M170 48 L255 28 L262 40 L200 56 Z" fill="#12100e"/><path d="M170 72 L255 92 L262 80 L200 64 Z" fill="#12100e"/><rect x="248" y="54" width="20" height="6" fill="#ff5a2a"/><rect x="248" y="62" width="20" height="6" fill="#ff5a2a"/></svg>`,
  anvil: `<svg viewBox="0 0 300 120"><path d="M30 62 L95 44 L200 42 L230 60 L200 78 L95 76 Z" fill="#7a8490"/><path d="M150 44 L262 28 L274 40 L250 52 L180 52 Z" fill="#5a6470"/><path d="M150 76 L262 92 L274 80 L250 68 L180 68 Z" fill="#5a6470"/><rect x="46" y="70" width="40" height="8" fill="#161a22"/><rect x="238" y="38" width="16" height="10" fill="#ff9a4d"/><rect x="238" y="72" width="16" height="10" fill="#ff9a4d"/></svg>`,
  specter: `<svg viewBox="0 0 300 120"><path d="M32 62 L125 46 L255 38 L278 62 L255 86 L125 78 Z" fill="#5e6874"/><path d="M155 48 L260 24 L272 40 L190 58 Z" fill="#101418"/><path d="M155 76 L260 96 L272 82 L190 66 Z" fill="#101418"/><rect x="78" y="54" width="34" height="12" fill="#0d2233" stroke="#7fd0ff"/><rect x="232" y="50" width="14" height="8" fill="#7fd0ff"/><rect x="232" y="64" width="14" height="8" fill="#7fd0ff"/></svg>`,
  pyre: `<svg viewBox="0 0 300 120"><path d="M22 60 L68 44 L110 40 L220 42 L248 52 L248 68 L220 78 L110 80 L68 76 Z" fill="#8a7a68"/><path d="M22 60 L48 50 L48 70 Z" fill="#1a1612"/><ellipse cx="38" cy="60" rx="10" ry="8" fill="#1a1612"/><rect x="118" y="48" width="6" height="24" fill="#4a3c30"/><rect x="168" y="48" width="6" height="24" fill="#4a3c30"/><rect x="248" y="50" width="18" height="10" fill="#ff7a3a"/><rect x="248" y="62" width="18" height="10" fill="#ff7a3a"/><path d="M78 46 L108 42 L118 54 L108 56 Z" fill="#0d2233"/></svg>`,
  marrow: `<svg viewBox="0 0 300 120"><path d="M40 60 L86 44 L200 42 L236 54 L236 66 L200 78 L86 76 Z" fill="#6e746c"/><path d="M86 48 L38 36 L42 46 L86 56 Z" fill="#4a5248"/><path d="M86 72 L38 84 L42 74 L86 64 Z" fill="#4a5248"/><path d="M72 50 L108 42 L122 54 L108 56 Z" fill="#0d2233"/><rect x="236" y="50" width="20" height="10" fill="#9aff6a"/><rect x="236" y="62" width="20" height="10" fill="#9aff6a"/></svg>`,
  nimbus: `<svg viewBox="0 0 300 120"><path d="M20 60 L88 50 L170 48 L250 54 L274 60 L250 66 L170 72 L88 70 Z" fill="#7a8896"/><ellipse cx="168" cy="44" rx="32" ry="9" fill="#7a8896"/><ellipse cx="168" cy="40" rx="26" ry="5" fill="#141820"/><path d="M58 52 L96 46 L110 56 L96 58 Z" fill="#0d2233"/><rect x="250" y="54" width="18" height="6" fill="#7ec8ff"/><rect x="250" y="62" width="18" height="6" fill="#7ec8ff"/></svg>`,
};

const LIVERIES = [
  { id: 'cyan', name: 'HALCYON CYAN', hex: '#3ec8ff', cost: 400 },
  { id: 'amber', name: 'VEIN AMBER', hex: '#ffb24a', cost: 600 },
  { id: 'violet', name: 'CHOIR VIOLET', hex: '#c04cf0', cost: 700 },
];

const ORE_IDS = new Set(['minerals', 'ice_ore', 'rare_ore', 'metals']);
const MARKET_COPY = {
  minerals: ['RAW ORE', 'Common rock for foundries. Refine 2t into 1t of metal.'],
  ice_ore: ['RAW ORE', 'Frozen deposits. Refine 2t into 1t of water.'],
  rare_ore: ['RARE ORE', 'Valuable earths. Refine 2t into 1t of technology.'],
  metals: ['REFINED', 'Finished plate. Trade hubs pay well for a full hold.'],
  fuel: ['SUPPLY', 'Hydrogen for station and ship supply chains.'],
  water: ['SUPPLY', 'Essential cargo for colonies and industrial pads.'],
  food: ['SUPPLY', 'Rations for remote mines and refinery crews.'],
  medicine: ['SUPPLY', 'High value medical cargo for populated systems.'],
  tech: ['HIGH VALUE', 'Electronics and machinery for growing stations.'],
  luxuries: ['HIGH VALUE', 'Premium cargo with strong trade hub demand.'],
  data: ['RESEARCH', 'Survey records. Check the survey desk for a premium.'],
  slaves: ['RESTRICTED', 'Illegal cargo. Federation ports do not list it.'],
  narcotics: ['RESTRICTED', 'Illegal cargo. Carrying it can bring a fine.'],
  weapons: ['RESTRICTED', 'Restricted arms. Carrying them can bring a fine.'],
};

const UPGRADES = {
  hull: { name: 'Hull Reinforcement', desc: 'Ablative plating bonded to the frame.', max: 5, base: 2800, step: 1.75, apply: (s, l) => { s.hull *= 1 + 0.22 * l; s.maxHull *= 1 + 0.22 * l; } },
  shield: { name: 'Shield Booster', desc: 'Higher-capacity emitter array.', max: 5, base: 3200, step: 1.7, apply: (s, l) => { s.shield *= 1 + 0.25 * l; s.maxShield *= 1 + 0.25 * l; } },
  speed: { name: 'Thruster Tuning', desc: 'Top speed. Cheap first rack at a garage.', max: 5, base: 1600, step: 1.75, apply: (s, l) => { s.speed *= 1 + 0.09 * l; } },
  accel: { name: 'Injector Rack', desc: 'Time to speed. Separate from top-end.', max: 5, base: 1400, step: 1.75, apply: (s, l) => { s.accel *= 1 + 0.1 * l; } },
  cargo: { name: 'Cargo Rack', desc: 'Pressurised hold volume. First rank is cheap.', max: 5, base: 1200, step: 1.65, apply: (s, l) => { s.cargo += 14 * l; } },
  fsd: { name: 'Frame Shift Drive', desc: 'Extends interstellar jump range.', max: 5, base: 4800, step: 1.85, apply: (s, l) => { s.jumpRange *= 1 + 0.18 * l; } },
  mining: { name: 'Mining Laser', desc: 'Higher-yield extraction beam.', max: 4, base: 2400, step: 1.7, apply: (s, l) => { s.mining *= 1 + 0.35 * l; } },
  ordnance: { name: 'Ordnance Rack', desc: 'Extra missile tubes and magazine volume.', max: 4, base: 2200, step: 1.6, apply: () => {} },
};

function garagePad(st) {
  return !!(stationServices(st).shipyard || stationServices(st).ordnance);
}

function upgradePrice(st, u, lvl) {
  const mul = garagePad(st) ? 1 : 1.6;
  return Math.round(u.base * mul * Math.pow(u.step, lvl));
}

export class Menus {
  constructor(game) {
    this.game = game;
    this.el = {
      boot: document.getElementById('boot'),
      title: document.getElementById('title'),
      shipSelect: document.getElementById('shipSelect'),
      pause: document.getElementById('pause'),
      station: document.getElementById('station'),
      death: document.getElementById('death'),
      modal: document.getElementById('modal'),
      briefing: document.getElementById('briefing'),
    };
    this.selectedShip = 'aurora';
    this.hangarMode = 'launch';
    this.stationTab = 'comms';
    this.qtyMode = 1;
    this.marketFilter = 'all';
    this._briefI = 0;
    this._briefFrom = 'title';
    this._bindGlobal();
    window.addEventListener('keydown', (e) => {
      const br = this.el.briefing;
      if (br && !br.classList.contains('hidden')) {
        if (e.code === 'ArrowRight' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.code === 'KeyD') {
          e.preventDefault();
          this._briefDelta(1);
        } else if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'Backspace') {
          e.preventDefault();
          this._briefDelta(-1);
        } else if (e.code === 'Escape') {
          e.preventDefault();
          this.closeBriefing();
        }
        return;
      }
      if (this.game.state !== 'title' || this.el.title.classList.contains('hidden')) return;
      if (!this.el.modal.classList.contains('hidden')) {
        if (e.code === 'Escape') { e.preventDefault(); this.closeModal(); }
        return;
      }
      if (this.el.briefing && !this.el.briefing.classList.contains('hidden')) return;
      const click = (act) => document.querySelector(`#title [data-act="${act}"]`)?.click();
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        const active = document.activeElement;
        if (active?.matches('#titleMenu .mbtn') && !active.disabled) active.click();
        else click(this.game.hasSave(0) || this.game.hasSave(1) || this.game.hasSave(2) ? 'continue' : 'new');
      }
      else if (e.code === 'KeyH') click('controls');
      else if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        e.preventDefault();
        const btns = this._titleButtons();
        if (!btns.length) return;
        const i = Math.max(0, btns.indexOf(document.activeElement));
        const next = e.code === 'ArrowDown' ? (i + 1) % btns.length : (i - 1 + btns.length) % btns.length;
        btns[next].focus({ preventScroll: true });
      }
    });
  }

  hideAll() {
    for (const k in this.el) if (this.el[k] && k !== 'boot') this.el[k].classList.add('hidden');
    document.getElementById('mapWrap').classList.add('hidden');
    document.body.classList.remove('on-title');
    document.body.classList.remove('on-briefing');
    const ae = document.activeElement;
    if (ae && ae !== document.body && typeof ae.blur === 'function') ae.blur();
  }

  show(id) {
    this.hideAll();
    this.el[id].classList.remove('hidden');
    document.body.classList.toggle('on-title', id === 'title');
    document.body.classList.toggle('on-briefing', id === 'briefing');
  }

  _bindGlobal() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      Audio.init(); Audio.resume();
      switch (act) {
        case 'tutorial': Audio.uiClick(); this.openBriefing('title'); break;
        case 'brief-next': Audio.uiClick(); this._briefDelta(1); break;
        case 'brief-prev': Audio.uiClick(); this._briefDelta(-1); break;
        case 'brief-close': Audio.uiBack(); this.closeBriefing(); break;
        case 'brief-goto':
          Audio.uiClick();
          this._briefI = Math.max(0, Math.min(BRIEFING.length - 1, Number(b.dataset.i) || 0));
          this._paintBriefing();
          break;
        case 'new': {
          Audio.uiClick();
          const callsign = (document.getElementById('callsign')?.value || 'NOVA-7').toUpperCase().slice(0, 16) || 'NOVA-7';
          this.game.newGame('aurora', callsign);
          break;
        }
        case 'hangar':
          Audio.uiBack();
          break;
        case 'continue':
          Audio.uiClick();
          if (this.game.hasSave(0) || this.game.hasSave(1) || this.game.hasSave(2)) {
            const slot = this.game.hasSave(0) ? 0 : this.game.hasSave(1) ? 1 : 2;
            void this.game.loadGame(slot).then((ok) => { if (!ok) Audio.uiBack(); });
          } else Audio.uiBack();
          break;
        case 'back': Audio.uiBack(); this.showTitle(); break;
        case 'launch': Audio.uiClick(); this.launch(); break;
        case 'resume': this.game.resume(); break;
        case 'pause': this.game.pause(); break;
        case 'save': Audio.uiClick(); this.game.save(false); break;
        case 'quit':
          Audio.uiBack();
          if (this.game.tutorial) this.game.endTutorial('skip');
          else this.game.toTitle();
          break;
        case 'exit': {
          Audio.uiBack();
          this.game.save(true);
          const leave = () => {
            try { window.webkit?.messageHandlers?.astralis?.postMessage('quit'); } catch {}
            try { window.chrome?.webview?.postMessage('quit'); } catch {}
            try { window.external?.sendMessage?.('quit'); } catch {}
            try { window.location.href = 'astralis://quit'; } catch {}
          };
          setTimeout(leave, 220);
          break;
        }
        case 'controls': Audio.uiClick(); this.openControls(); break;
        case 'settings': Audio.uiClick(); this.openSettings(); break;
        case 'achievements': Audio.uiClick(); this.openAchievements(); break;
        case 'close': Audio.uiBack(); this.closeModal(); break;
        case 'undock': Audio.uiClick(); this.game.undock(); break;
        case 'respawn': Audio.uiClick(); this.game.respawn(); break;
        default: break;
      }
    });
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest('[data-act]')) Audio.uiHover();
    });
  }

  // ------------------------------------------------------------------ title
  showTitle() {
    this.show('title');
    const g = this.game;
    const save = g.saveInfo(0) || g.saveInfo(1) || g.saveInfo(2);
    const btn = document.getElementById('btnContinue');
    const info = document.getElementById('continueInfo');
    const stack = document.getElementById('titleMenu');
    if (save) {
      btn.disabled = false;
      const sysName = (g.galaxy.systems.find((s) => s.id === save.sysId) || {}).name || 'Unknown';
      info.textContent = `${save.callsign} · ${SHIP_DEFS[resolveShipId(save.shipId)]?.name || 'Unknown ship'} · ${fmtCredits(save.credits || 0)} CR · ${sysName}`;
      if (stack && stack.firstElementChild !== btn) stack.insertBefore(btn, stack.firstElementChild);
      btn.classList.add('primary');
      const nb = stack?.querySelector('[data-act="new"]'); if (nb) nb.classList.remove('primary');
    } else {
      btn.disabled = true; info.textContent = 'No save data found';
      btn.classList.remove('primary');
      const nb = stack?.querySelector('[data-act="new"]'); if (nb) nb.classList.add('primary');
    }
    this._focusTitleDefault();
  }

  _titleButtons() {
    return [...document.querySelectorAll('#titleMenu .mbtn')].filter((b) => !b.disabled);
  }
  _focusTitleDefault() {
    const btns = this._titleButtons();
    const primary = btns.find((b) => b.classList.contains('primary')) || btns[0];
    primary?.focus({ preventScroll: true });
  }

  openShipSelect(mode = 'launch') {
    if (mode === 'launch') this.selectedShip = 'aurora';
    this.hangarMode = mode;
    this.show('shipSelect');
    const head = document.querySelector('#shipSelect h2');
    const foot = document.querySelector('#shipSelect .ss-foot');
    if (head) head.textContent = mode === 'hangar' ? 'HANGAR ROSTER' : 'SELECT YOUR VESSEL';
    if (foot) foot.style.display = mode === 'hangar' ? 'none' : '';
    const eyebrow = document.querySelector('#shipSelect .eyebrow');
    if (eyebrow) eyebrow.textContent = mode === 'hangar' ? 'FLEET · AURORA' : 'CAREER INITIALIZATION';
    this._fillShipGrid(mode);
    this.game.preloadHangarHulls?.().then(() => {
      if (this.hangarMode === mode && !this.el.shipSelect.classList.contains('hidden')) {
        this._fillShipGrid(mode);
      }
    });
    const cs = document.getElementById('callsign');
    if (cs) cs.oninput = () => { this.callsign = cs.value.toUpperCase().slice(0, 16); };
  }

  _fillShipGrid(mode = this.hangarMode) {
    const grid = document.getElementById('ssGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const camp = this.game.campaign;
    for (const id of HANGAR_IDS) {
      const d = SHIP_DEFS[id];
      if (!d) continue;
      const soon = !!d.comingSoon;
      const issued = id === 'aurora' || id === 'anvil';
      const gated = !soon && !shipUnlocked(camp, id) && d.price > 0;
      const launchLock = mode !== 'hangar' && !issued;
      const previewLock = soon || launchLock || (gated && mode !== 'hangar');
      const card = document.createElement('div');
      card.className = 'ship-card' + (id === this.selectedShip && !previewLock ? ' sel' : '') + (soon ? ' soon' : previewLock ? ' lock' : '');
      const stat = (label, val, max, txt) => `<div class="sc-stat"><span>${label}</span><div class="bar"><i style="width:${clamp(val / max * 100, 3, 100)}%"></i></div><b>${txt}</b></div>`;
      const priceLine = soon
        ? 'COMING SOON'
        : mode === 'hangar'
          ? (issued ? 'ISSUED ON NEW EXPEDITION' : gated ? 'UNLOCK VIA CAMPAIGN · THEN BUY AT A PAD' : `STATION SHIPYARD · ${fmtCredits(d.price)} CR`)
          : (issued ? 'ISSUED FREE OF CHARGE' : gated ? 'UNLOCK VIA CAMPAIGN' : 'BUY AT STATION SHIPYARD AFTER LAUNCH');
      const tag = soon
        ? '<span class="sc-tag soon">COMING SOON</span>'
        : (id === this.selectedShip && !previewLock ? '<span class="sc-tag sel">SELECTED</span>' : '');
      card.innerHTML = `
        <div class="sc-vis">${tag}${shipVis(id)}</div>
        <div class="sc-body">
          <div class="sc-cls">${d.cls}${soon ? ' · COMING SOON' : previewLock ? ' · ' + (issued ? '' : gated ? 'LOCKED' : 'STATION') : ''}</div>
          <div class="sc-name">${d.name}</div>
          <div class="sc-desc">${d.desc}</div>
          <p style="font-size:11px;color:var(--cy);margin-top:6px;letter-spacing:.06em">${(d.fit || '').toUpperCase()}</p>
          ${soon ? '' : `<p style="font-size:11px;color:var(--text-dim);margin-top:6px">${d.lore || ''}</p>
          <p style="font-size:11px;color:var(--amber);margin-top:8px">${d.guide || ''}</p>
          <div class="sc-stats">
            ${stat('SPEED', d.stats.speed, 1100, d.stats.speed)}
            ${stat('AGILITY', d.stats.turn, 2.1, d.stats.turn.toFixed(2))}
            ${stat('HULL', d.stats.hull, 360, d.stats.hull)}
            ${stat('SHIELDS', d.stats.shield, 380, d.stats.shield)}
            ${stat('CARGO', d.stats.cargo, 70, d.stats.cargo + 't')}
            ${stat('JUMP', d.stats.jumpRange, 8000, fmtDist(d.stats.jumpRange))}
            ${stat('GUNS', d.stats.hardpoints, 4, d.stats.hardpoints)}
          </div>`}
          <div class="sc-price">${priceLine}</div>
        </div>`;
      card.onclick = () => {
        Audio.uiClick();
        if (soon) {
          this.game.hud?.toast('Not in this build.', 'info', 2.4);
          return;
        }
        if (mode === 'hangar') return;
        if (!issued) {
          this.game.hud?.toast(gated ? 'Earn this hull in THE AETHERIA SIGNAL, then buy it at a station' : 'Launch in the Aurora. Buy and swap hulls at any station shipyard.', 'info', 4);
          return;
        }
        this.selectedShip = id;
        this.openShipSelect(mode);
      };
      grid.appendChild(card);
    }
  }

  launch() {
    if (this.hangarMode === 'hangar') { this.showTitle(); return; }
    this.selectedShip = 'aurora';
    const callsign = (document.getElementById('callsign').value || 'NOVA-7').toUpperCase().slice(0, 16) || 'NOVA-7';
    this.game.newGame('aurora', callsign);
  }

  // ------------------------------------------------------------------ pause
  openPause() {
    this.show('pause');
    const tut = this.game.tutorial && !this.game.tutorial.done;
    const saveRow = document.querySelector('#pause [data-act="save"]');
    if (saveRow) saveRow.classList.toggle('hidden', !!tut);
    const saveBtn = document.querySelector('#pause [data-act="save"] span');
    if (saveBtn) saveBtn.textContent = 'SAVE GAME';
    const hint = document.getElementById('saveHint');
    if (hint) hint.textContent = 'Writes this career. Title → CONTINUE.';
    const quitSpan = document.querySelector('#pause [data-act="quit"] span');
    const quitEm = document.querySelector('#pause [data-act="quit"] em');
    if (quitSpan) quitSpan.textContent = tut ? 'END TRAINING' : 'ABANDON TO TITLE';
    if (quitEm) quitEm.textContent = tut ? 'Career save is not touched.' : 'Leave this session';
    const g = this.game, s = g.stats;
    const nav = tut ? tutorialNav(g.tutorial, g) : nextStep(g);
    const ch = chapterInfo(g.campaign || {});
    const head = tut
      ? `<div class="eyebrow">TRAINING RANGE · ${nav.title}</div>`
      : `<div class="eyebrow">NEXT · CH.${ch.n} ${ch.title}</div>`;
    document.getElementById('pauseStats').innerHTML = `
      <div class="story-next">
        ${head}
        <div style="color:var(--amber);margin:6px 0 4px;font-family:Orbitron;letter-spacing:.08em">${nav.hud}</div>
        <div style="color:var(--text-dim);font-size:13px;line-height:1.55">${nav.how}</div>
      </div>
      <div><span>CREDITS</span><b style="color:var(--amber)">${fmtCredits(g.credits)}</b></div>
      <div><span>DISTANCE</span><b>${fmtDist(s.distance)}</b></div>
      <div><span>SCANS</span><b>${s.scans}</b></div>
      <div><span>KILLS</span><b>${s.kills}</b></div>
      <div><span>ORE MINED</span><b>${Math.round(s.mined)}t</b></div>
      <div><span>JUMPS</span><b>${s.jumps}</b></div>
      <div><span>SYSTEMS</span><b>${g.galaxy.systems.filter((x) => x.visited).length}/${g.galaxy.systems.length}</b></div>
      <div><span>CHAPTER</span><b>${tut ? '—' : `${g.campaign ? g.campaign.chapter : 1}/12`}</b></div>
      <div><span>COMBAT</span><b>${combatRank(s.kills).name}</b></div>
      <div><span>TRADE</span><b>${tradeRank(s.earned).name}</b></div>
      <div><span>EXPLORE</span><b>${exploreRank(s.scans).name}</b></div>
      <div><span>INSURANCE</span><b>${g.insured ? 'COVERED' : 'UNINSURED'}</b></div>
      <div class="wide"><span>FLIGHT TIME</span><b>${fmtTime(s.playtime)}</b></div>`;
  }

  // ------------------------------------------------------------------ death
  openDeath(cause) {
    this.show('death');
    document.getElementById('deathInfo').textContent = cause || 'Your vessel was destroyed.';
    const g = this.game;
    const cost = insuranceExcess(g.credits, SHIP_DEFS[g.shipDefId].price, g.insured);
    document.getElementById('respawnCost').textContent = g.insured
      ? `Covered clone · excess ${fmtCredits(cost)} CR · 20% cargo lost`
      : `Uninsured · excess ${fmtCredits(cost)} CR · half cargo lost`;
  }

  // ------------------------------------------------------------------ modal
  openModal(title, html, wide = false) {
    this.el.modal.classList.remove('hidden');
    const inner = this.el.modal.querySelector('.modal-inner');
    if (inner) inner.classList.toggle('wide', !!wide);
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = html;
    this._modalPrev = null;
  }
  closeModal() {
    this.el.modal.classList.add('hidden');
    const inner = this.el.modal.querySelector('.modal-inner');
    if (inner) inner.classList.remove('wide');
    if (this.game.state === 'paused' && !this.el.pause.classList.contains('hidden')) return;
  }

  openControls() {
    const row = (k, v) => `<div class="ctrl-row"><kbd>${k}</kbd><span>${v}</span></div>`;
    const sec = (title, rows) => `<div class="ctrl-sec"><h3>${title}</h3>${rows}</div>`;
    const html = `<div class="ctrl-grid">
      ${sec('FLIGHT', [
        row('MOUSE', 'Turn — cursor is captured in flight (Esc releases)'),
        row('W / S', 'Throttle up / down'),
        row('SHIFT', 'Boost'),
        row('R', 'Brake'),
        row('X', 'Launch / recall fuel probe near a star (below 120 m/s)'),
        row('Y', 'Expedition prep (deep survey kits) — or rescue tow when fuel is empty'),
        row('A / D', 'Roll'),
        row('RMB', 'Seeker — only after LOCK SOLID'),
        row('C', 'Chaff'),
      ].join(''))}
      ${sec('ON A PLANET', [
        row('W / S', 'Forward speed / reduce speed.'),
        row('A / D', 'Turn left / right.'),
        row('SPACE / CTRL', 'Climb / descend.'),
        row('MOUSE / ARROWS', 'Pitch and steer.'),
        row('NOSE UP', 'Climb out of atmosphere.'),
        row('L', 'Landing gear'),
        row('F', 'Prospect a vein, or dump a site'),
      ].join(''))}
      ${sec('LOCK & SCAN', [
        row('T', 'Cycle planets and moons — the marker points at the next world'),
        row('TAB', 'Cycle stations in this galaxy'),
        row('NOSE ON', 'Hold a hostile in the reticle ~2s → LOCK SOLID'),
        row('RMB', 'Release seeker once LOCK SOLID'),
        row('F', 'Hold — lidar ping (free), then deep survey (scan kit), or prospect/cut on belt rocks'),
        row('Y', 'Prepare expedition before deep survey; call rescue when the tank is empty'),
        row('J', 'Jump to the locked body in this system'),
      ].join(''))}
      ${sec('MAPS', [
        row('M', 'This star — planets, pads, wrecks'),
        row('G', 'This galaxy — then CONFIRM JUMP'),
        row('U', 'Other galaxies — then CONFIRM TRANSIT'),
        row('ESC', 'Close the map. Not pause.'),
      ].join(''))}
      ${sec('PAD & MENU', [
        row('E', 'Dock when the prompt is green'),
        row('O', 'Point the nose at the station'),
        row('ESC', 'Pause'),
        row('H', 'This list'),
        row('F6', 'Save slot 1'),
      ].join(''))}
    </div>`;
    this.openModal('PILOT GUIDE', html, true);
  }

  openBriefing(from) {
    this._briefFrom = from || (this.game.state === 'paused' ? 'pause' : this.game.state === 'docked' ? 'station' : this.game.state === 'playing' ? 'play' : 'title');
    if (this._briefI == null) this._briefI = 0;
    if (from === 'title') this._briefI = 0;
    this.show('briefing');
    this._paintBriefing();
  }

  closeBriefing() {
    if (this.el.briefing) this.el.briefing.classList.add('hidden');
    if (this._briefFrom === 'pause') this.openPause();
    else if (this._briefFrom === 'station' && this.game.dockedAt) this.openStation(this.game.dockedAt.data);
    else if (this._briefFrom === 'play') {
      document.body.style.cursor = 'none';
      this.game.input?.lockPointer?.();
    } else this.showTitle();
  }

  _briefDelta(d) {
    const last = BRIEFING.length - 1;
    if (d > 0 && this._briefI >= last) { this.closeBriefing(); return; }
    this._briefI = Math.max(0, Math.min(last, (this._briefI || 0) + d));
    this._paintBriefing();
  }

  _paintBriefing() {
    const s = briefingSlide(this._briefI || 0);
    const idx = document.getElementById('brIndex');
    const title = document.getElementById('brTitle');
    const lead = document.getElementById('brLead');
    const notes = document.getElementById('brNotes');
    const photo = document.getElementById('brPhoto');
    const next = document.querySelector('#brNext span');
    const nextEm = document.querySelector('#brNext em');
    const prev = document.getElementById('brPrev');
    if (idx) idx.textContent = `TRAINING · ${String(s.i + 1).padStart(2, '0')} / ${String(s.of).padStart(2, '0')}`;
    if (title) title.textContent = s.title;
    if (lead) lead.hidden = true;
    const bodyEl = document.getElementById('brBody');
    if (bodyEl) bodyEl.hidden = true;
    if (notes) notes.innerHTML = briefingNotesHtml(s);
    if (photo) {
      const k = (s.key || '').replace(/</g, '');
      photo.innerHTML = `<img src="${s.img}?v=aurora1" alt="${s.title}" draggable="false" /><div class="br-chip">${k}</div>`;
    }
    if (next) next.textContent = s.i >= s.of - 1 ? 'DONE' : 'NEXT';
    if (nextEm) nextEm.textContent = s.i >= s.of - 1 ? 'To title' : 'Enter';
    if (prev) prev.disabled = s.i <= 0;
  }

  openSettings() {
    const g = this.game, st = g.settings;

    const tog = (on) => `<div class="toggle ${on ? 'on' : ''}"><i></i></div>`;
    const html = `
      <div class="set-row"><label>RTX<small>Reflections, crevice shade, and a rim light in flight. Heavier on the GPU. Off in the menu.</small></label><div class="ctl" data-toggle="rtx">${tog(!!st.rtx)}</div></div>
      <div class="set-row"><label>Graphics quality<small>Picked for this machine. Your choice is kept after you quit.</small></label>
        <div class="ctl"><select id="setQuality">
          ${['low', 'med', 'high', 'ultra', '8k'].map((q) => `<option value="${q}" ${g.quality === q ? 'selected' : ''}>${q === '8k' ? '8K' : q === 'ultra' ? 'ULTRA · 4K' : q.toUpperCase()}</option>`).join('')}
        </select></div></div>
      <div class="set-row"><label>VSYNC<small>Locks frames to the display — smoother, less heat</small></label><div class="ctl" data-toggle="vsync">${tog(st.vsync !== false)}</div></div>
      <div class="set-row"><label>Bloom<small>Glow on stars, engines and explosions</small></label><div class="ctl" data-toggle="bloom">${tog(st.bloom)}</div></div>
      <div class="set-row"><label>Anti-aliasing<small>SMAA in 4K / ultra, FXAA otherwise</small></label><div class="ctl" data-toggle="fxaa">${tog(st.fxaa)}</div></div>
      <div class="set-row"><label>Dynamic resolution<small>Only moves the automatic scale when you have not set Render scale yourself. Drops it if frames fall below 50.</small></label><div class="ctl" data-toggle="dynamicRes">${tog(st.dynamicRes !== false)}</div></div>
      <div class="set-row"><label>Render scale<small>Stays where you put it. 1.0 = native · 2.0 = 4K on 1080p · 4.0 = 8K</small></label>
        <div class="ctl"><input type="range" id="setPR" min="0.5" max="5" step="0.1" value="${Math.min(5, (st.pixelRatio > 0 ? st.pixelRatio : g._basePr()))}"><span class="set-val" id="setPRv">${(st.pixelRatio > 0 ? st.pixelRatio : g._basePr()).toFixed(1)}×</span></div></div>
      <div class="mp-sep"></div>
      <div class="set-row"><label>Mouse steering<small>Move to turn. In the app the mouse is captured so it never hits the screen edge. Esc / pause releases</small></label><div class="ctl" data-toggle="mouseSteer">${tog(st.mouseSteer)}</div></div>
      <div class="set-row"><label>Steering sensitivity</label>
        <div class="ctl"><input type="range" id="setSens" min="0.3" max="2.5" step="0.05" value="${st.sensitivity}"><span class="set-val" id="setSensv">${st.sensitivity.toFixed(2)}</span></div></div>
      <div class="set-row"><label>Invert pitch</label><div class="ctl" data-toggle="invertY">${tog(st.invertY)}</div></div>
      <div class="set-row"><label>Roll on Q/E<small>Otherwise roll is A/D only</small></label><div class="ctl" data-toggle="rollOnE">${tog(st.rollOnE)}</div></div>
      <div class="set-row"><label>Show mission steps on HUD<small>Short how-to under the chapter line in flight</small></label><div class="ctl" data-toggle="showHints">${tog(st.showHints)}</div></div>
      <div class="mp-sep"></div>
      <div class="set-row"><label>Mute all audio</label><div class="ctl" data-toggle="muted">${tog(!!st.muted)}</div></div>
      <div class="set-row"><label>Master volume</label>
        <div class="ctl"><input type="range" id="setVol" min="0" max="1" step="0.01" value="${st.masterVol ?? 0.72}"><span class="set-val" id="setVolv">${Math.round((st.masterVol ?? 0.72) * 100)}%</span></div></div>
      <div class="set-row"><label>Effects</label>
        <div class="ctl"><input type="range" id="setSfx" min="0" max="1" step="0.01" value="${st.sfxVol ?? 0.82}"><span class="set-val" id="setSfxv">${Math.round((st.sfxVol ?? 0.82) * 100)}%</span></div></div>
      <div class="set-row"><label>Music<small>Soft cabin score. Louder when hostiles close</small></label>
        <div class="ctl"><input type="range" id="setMus" min="0" max="1" step="0.01" value="${st.musicVol ?? 0.48}"><span class="set-val" id="setMusv">${Math.round((st.musicVol ?? 0.48) * 100)}%</span></div></div>
      <div class="set-row"><label>Radar range</label>
        <div class="ctl"><input type="range" id="setRadar" min="3" max="18" step="1" value="${Math.log2(st.radarRange / 250)}"><span class="set-val" id="setRadarv">${fmtDist(st.radarRange)}</span></div></div>
      <div class="mp-sep"></div>
      <div class="set-row"><label>Career slots<small>F6 / F7 / F8 in flight</small></label>
        <div class="ctl">${[0, 1, 2].map((i) => {
          const d = g.saveInfo(i);
          return `<button class="buybtn" data-slot="${i}" style="margin-left:4px">${d ? `S${i + 1} ${d.callsign}` : `SLOT ${i + 1} EMPTY`}</button>`;
        }).join('')}</div></div>
      <div class="set-row"><label>Erase saved career<small>Wipes all three slots</small></label>
        <div class="ctl"><button class="buybtn" id="wipeSave" style="border-color:rgba(255,92,92,.5);color:var(--red)">WIPE</button></div></div>
      <div class="set-row"><label>Career file<small>Export or import this slot. A newer file is refused.</small></label>
        <div class="ctl"><button class="buybtn" id="exportSave">EXPORT</button><button class="buybtn" id="importSave">IMPORT</button></div></div>
    `;
    this.openModal('SETTINGS', html);
    const body = document.getElementById('modalBody');

    body.querySelectorAll('[data-toggle]').forEach((el) => {
      el.style.cursor = 'pointer';
      el.onclick = () => {
        const k = el.dataset.toggle;
        g.settings[k] = !g.settings[k];
        el.querySelector('.toggle').classList.toggle('on', !!g.settings[k]);
        Audio.uiClick();
        if (k === 'vsync') g.applyVsync();
        else g.applyQuality();
        this._applyAudio();
        g._graphicsChosen = true;
        g._saveGraphics?.();
      };
    });
    const bind = (id, fn, fmt) => {
      const e = body.querySelector(id);
      if (!e) return;
      e.oninput = () => { fn(parseFloat(e.value)); if (fmt) body.querySelector(fmt.id).textContent = fmt.fn(parseFloat(e.value)); g._saveGraphics?.(); };
    };
    bind('#setPR', (v) => { g.settings.pixelRatio = v; g._dynScale = 1; g.onResize(); }, { id: '#setPRv', fn: (v) => v.toFixed(1) + '×' });
    bind('#setSens', (v) => { g.settings.sensitivity = v; }, { id: '#setSensv', fn: (v) => v.toFixed(2) });
    bind('#setVol', (v) => { g.settings.masterVol = v; this._applyAudio(); }, { id: '#setVolv', fn: (v) => Math.round(v * 100) + '%' });
    bind('#setSfx', (v) => { g.settings.sfxVol = v; this._applyAudio(); }, { id: '#setSfxv', fn: (v) => Math.round(v * 100) + '%' });
    bind('#setMus', (v) => { g.settings.musicVol = v; this._applyAudio(); }, { id: '#setMusv', fn: (v) => Math.round(v * 100) + '%' });
    bind('#setRadar', (v) => { g.settings.radarRange = Math.round(250 * Math.pow(2, v)); }, { id: '#setRadarv', fn: (v) => fmtDist(Math.round(250 * Math.pow(2, v))) });
    const q = body.querySelector('#setQuality');
    if (q) q.onchange = () => { g.quality = q.value; g._graphicsChosen = true; g.settings.pixelRatio = 0; g.applyQuality(); g._saveGraphics?.(); Audio.uiClick(); };
    const w = body.querySelector('#wipeSave');
    if (w) w.onclick = () => {
      try { for (let i = 0; i < 3; i++) localStorage.removeItem(saveSlotKey(i)); } catch {}
      wipeNativeSaves();
      w.textContent = 'WIPED'; w.disabled = true; Audio.uiBack();
    };
    const exp = body.querySelector('#exportSave');
    if (exp) exp.onclick = () => { g.exportCareer(); };
    const imp = body.querySelector('#importSave');
    if (imp) imp.onclick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const res = g.importCareer(String(reader.result || ''));
          g.hud?.toast(res.ok ? 'Career file stored — CONTINUE from the title' : res.reason, res.ok ? 'good' : 'bad', 4);
        };
        reader.readAsText(file);
      };
      input.click();
    };
    body.querySelectorAll('[data-slot]').forEach((b) => {
      b.onclick = () => { g.save(false, parseInt(b.dataset.slot, 10)); this.openSettings(); };
    });
      this._applyAudio();
  }

  openAchievements() {
    const tr = this.game.achievements;
    const rows = (tr ? tr.list() : ACHIEVEMENTS.map((a) => ({ ...a, unlocked: false })));
    const have = rows.filter((a) => a.unlocked).length;
    const html = `
      <p class="ach-lead">${have} / ${rows.length} unlocked · same names as Steam</p>
      <div class="ach-list">
        ${rows.map((a) => {
          const hidden = a.hidden && !a.unlocked;
          const name = hidden ? 'Hidden achievement' : a.name;
          const desc = hidden ? 'Keep flying.' : a.desc;
          return `<div class="ach-row ${a.unlocked ? 'on' : ''}">
            <b>${name}</b>
            <span>${desc}</span>
          </div>`;
        }).join('')}
      </div>`;
    this.openModal('ACHIEVEMENTS', html);
  }

  _applyAudio() {
    const st = this.game.settings;
    Audio.init();
    Audio.setMuted(!!st.muted);
    Audio.setVolumes(st.masterVol ?? 0.72, st.sfxVol ?? 0.82, st.musicVol ?? 0.48);
    Audio.resume();
  }

  // ================================================================ STATION
  openStation(station) {
    this.station = station;
    this.stationTab = (this.game.campaign?.chapter === 7 || this.game.campaign?.chapter === 12)
      ? 'comms'
      : stationProfile(station).home;
    this.marketFilter = 'all';
    this.show('station');
    const g = this.game;
    const root = document.getElementById('station');
    if (root) {
      root.dataset.kind = station.kind || 'orbital';
      root.style.setProperty('--st-accent', stationProfile(station).color);
    }
    const kindLabel = (STATION_KIND_LABEL[station.kind] || station.kind || 'Orbital Port').toUpperCase();
    const stType = document.getElementById('stType');
    if (stType) stType.textContent = `${kindLabel} · BERTH SECURE`;
    document.getElementById('stSystem').textContent = `${g.system.name} · ${g.system.designation} · ${g.system.faction.name}`;
    document.getElementById('stName').textContent = station.name.toUpperCase();
    document.getElementById('stMeta').innerHTML =
      `${ECONOMIES[station.economy].label} · ${(STATION_KIND_LABEL[station.kind] || station.kind).toUpperCase()} · POP. ${station.population.toLocaleString('en-US')}`;
    const res = g.tryCompleteMissions(station.id);
    if (res.count) {
      g.bigToast(`${res.count} CONTRACT${res.count > 1 ? 'S' : ''} COMPLETED`, `+${fmtCredits(res.paid)} CR transferred`, 'money');
      Audio.credits();
    }
    const ore = (g.cargo.minerals || 0) + (g.cargo.ice_ore || 0) + (g.cargo.rare_ore || 0);
    if (station.kind === 'hub_refinery' && ore > 0) g.hud.toast('Raw ore in hold — REFINERY tab, then haul metals to a trade spin', 'good', 4.2);
    if (station.kind === 'hub_trade' && ((g.cargo.metals || 0) + (g.cargo.luxuries || 0)) > 0) g.hud.toast('Metals and luxuries sell high here', 'money', 3.6);
    if (station.kind === 'hub_survey' && (g.cargo.data || 0) > 0) g.hud.toast(`${Math.floor(g.cargo.data)} research data — SURVEY DESK pays a premium`, 'money', 4);
    if (station.kind === 'hub_survey' && this.stationTab === 'market') this.stationTab = 'survey';
    this._renderTabs();
    this.renderStationTab(this.stationTab);
  }

  _renderTabs() {
    const tabs = stationTabs(this.station);
    if (!tabs.some(([id]) => id === this.stationTab)) this.stationTab = stationProfile(this.station).home;
    const host = document.getElementById('stTabs');
    host.innerHTML = tabs.map(([id, label]) =>
      `<button class="st-tab ${id === this.stationTab ? 'on' : ''}" data-tab="${id}">${label}</button>`).join('');
    host.querySelectorAll('[data-tab]').forEach((b) => {
      b.onclick = () => { this.stationTab = b.dataset.tab; Audio.uiClick(); this._renderTabs(); this.renderStationTab(this.stationTab); };
    });
  }

  renderStationTab(tab) {
    const g = this.game, st = this.station;
    if (!stationTabs(st).some(([id]) => id === tab)) tab = stationProfile(st).home;
    this.stationTab = tab;
    const body = document.getElementById('stBody');
    document.getElementById('stCredits').textContent = fmtCredits(g.credits);
    if (tab === 'comms') body.innerHTML = this._commsHTML();
    else if (tab === 'survey') body.innerHTML = this._surveyHTML();
    else if (tab === 'market') body.innerHTML = this._marketHTML();
    else if (tab === 'refine') body.innerHTML = this._refineHTML();
    else if (tab === 'workshop') body.innerHTML = this._workshopHTML();
    else if (tab === 'access') body.innerHTML = this._accessHTML();
    else if (tab === 'services') body.innerHTML = this._servicesHTML();
    else if (tab === 'arsenal') body.innerHTML = this._arsenalHTML();
    else if (tab === 'directory') body.innerHTML = this._directoryHTML();
    else if (tab === 'upgrades') body.innerHTML = this._upgradesHTML();
    else if (tab === 'shipyard') body.innerHTML = this._shipyardHTML();
    else if (tab === 'missions') body.innerHTML = this._missionsHTML();
    else if (tab === 'cargo') body.innerHTML = this._cargoHTML();
    else body.innerHTML = this._logHTML();
    if (tab === stationProfile(st).home && tab !== 'market' && tab !== 'access') {
      const p = stationProfile(st);
      body.insertAdjacentHTML('afterbegin', `<header class="port-intro"><strong>${p.code}</strong><div><small>${p.label.toUpperCase()}</small><h3>${p.title}</h3><p>${p.description}</p></div></header>`);
    }
    this._bindStation(body, tab);
  }

  _refresh() {
    const body = document.getElementById('stBody');
    const top = body?.scrollTop || 0;
    this.renderStationTab(this.stationTab);
    if (body) body.scrollTop = top;
  }

  _commsHTML() {
    const g = this.game;
    const camp = g.campaign || {};
    const ch = chapterInfo(camp);
    const log = (camp.comms || []).slice(0, 12).map((m) =>
      `<div class="mission-card"><div class="mt">${m.who}</div><p>${m.text}</p></div>`).join('')
      || `<p style="color:var(--text-dim)">No radio yet. Dock, scan or jump and Control will call.</p>`;
    let choices = '';
    if (camp.chapter === 7 && !camp.allegiance) {
      choices = `<div class="eyebrow">PICK A SIDE</div>
        <div class="svc-grid">
          <div class="svc-card"><h3>TERRAN CONCORD</h3><p>Law. They want the transmitter jammed and pirates cleared.</p><button class="buybtn" data-allegiance="fed" style="width:100%;margin-top:10px">SIGN WITH CONCORD</button></div>
          <div class="svc-card"><h3>SYNDICATE OF VHEL</h3><p>They already bought the crate. They want exclusive rights to the coordinates.</p><button class="buybtn" data-allegiance="syn" style="width:100%;margin-top:10px">WORK FOR VHEL</button></div>
          <div class="svc-card"><h3>FREE COLONIES</h3><p>No flag. Cross a hot system without firing if you can. Repair and rescue stay open either way.</p><button class="buybtn" data-allegiance="ind" style="width:100%;margin-top:10px">STAY INDEPENDENT</button></div>
        </div>`;
    } else if (camp.chapter === 12 && !camp.ending) {
      if (!g._savedBeforeEnding) { g._savedBeforeEnding = true; g.save(true); }
      choices = `<div class="eyebrow">YOUR CALL · SAVED</div>
        <div class="svc-grid">
          <div class="svc-card"><h3>JAM IT</h3><p>Shut the transmitter down. Beacons stay dark. You go home. Choir Void stays closed.</p><button class="buybtn" data-ending="lock" style="width:100%;margin-top:10px">JAM THE TRANSMITTER</button></div>
          <div class="svc-card"><h3>${patronPitch(camp.allegiance).title}</h3><p>${patronPitch(camp.allegiance).card}</p><button class="buybtn" data-ending="patron" style="width:100%;margin-top:10px">${patronPitch(camp.allegiance).button}</button></div>
          <div class="svc-card"><h3>PUBLISH</h3><p>Put the coordinates on the open net. Every ship hears it. Choir Void opens on U.</p><button class="buybtn" data-ending="open" style="width:100%;margin-top:10px">PUBLISH</button></div>
        </div>`;
    } else if (camp.ending) {
      choices = `<div class="eyebrow">JOB CLOSED</div><p style="color:var(--green)">${camp.ending === 'patron' ? patronPitch(camp.allegiance).toastTitle : camp.ending.toUpperCase()}. G still jumps stars here. Neighbour charts are at the observatory. Garage still sells upgrades.</p>`;
    }
    const nav = nextStep(g);
    const st = this.station;
    const pads = (g.listPadJobs && g.listPadJobs(st)) || padJobs(st, g.galaxy?.hubs || [], g.stats.playtime, g.campaign?.flags || {});
    const openPad = pads.find((j) => !g.missions.some((m) => m.id === j.id));
    let padCard = '';
    const courier = g.missions.find((m) => m.id === 'story-courier');
    if (courier) {
      const left = Math.max(0, (courier.expires || 0) - (g.stats.playtime || 0));
      padCard += `<div class="eyebrow" style="color:var(--amber)">TIMED COURIER · PAYDAY</div>
        <div class="mission-card" style="border-color:var(--amber);margin-bottom:16px">
          <div class="mt">PRIORITY PACKET</div>
          <h4>${courier.amount}t ${courier.commodityName} → ${courier.destName}</h4>
          <p>${courier.desc}</p>
          <div class="mrow"><span>Clock <b>${fmtTime(left)}</b></span><span>Pay <b>${fmtCredits(courier.reward)} CR</b></span></div>
        </div>
        <div class="mp-sep"></div>`;
    }
    if (openPad) {
      padCard = `<div class="eyebrow" style="color:var(--amber)">PAD PRIORITY</div>
        <div class="mission-card" style="border-color:var(--amber);margin-bottom:16px">
          <div class="mt">${openPad.title}</div>
          <h4>${openPad.amount}t ${openPad.commodityName} → ${openPad.destName}</h4>
          <p>${openPad.desc}</p>
          <div class="mrow"><span>Reward <b>${fmtCredits(openPad.reward)} CR</b></span>
          <button class="buybtn" data-mission="${openPad.id}">ACCEPT RUN</button></div>
        </div>
        <div class="mp-sep"></div>`;
    }
    return `<div class="eyebrow">CHAPTER ${ch.n} · ${ch.title}</div>
      <p style="color:var(--amber);margin:10px 0 8px">${nav.hud}</p>
      <p style="color:var(--text-dim);margin:0 0 8px">${nav.how}</p>
      <p style="color:var(--text-dim);font-size:12px;margin:0 0 16px">Active detail: <b style="color:var(--cy)">CONTRACTS</b> tab → AETHERIA SIGNAL.</p>
      <div class="mp-sep"></div>${padCard}${choices}
      <div class="mp-sep"></div><div class="eyebrow">TRAFFIC LOG</div>${log}`;
  }

  _marketHTML() {
    const g = this.game, st = this.station;
    const mkt = st.market || [];
    const eco = ECONOMIES[st.economy] || ECONOMIES.trade;
    const notes = (g.stationBulletins && g.stationBulletins(st)) || st.bulletins || [];
    const left = bulletinRemaining(g.stats.playtime);
    const hint = st.routeHint || circuitHint(st, g.galaxy?.hubs || []) || routeHint(st.economy, eco.buys, eco.sells, st.kind, st.circuit);
    const heldRows = mkt.filter((it) => (g.cargo[it.id] || 0) >= 1);
    const heldValue = heldRows.reduce((sum, it) => sum + Math.floor(g.cargo[it.id] || 0) * applyBulletinBonus(it.price, notes, it.id, true), 0);
    const wanted = mkt.filter((it) => eco.buys.includes(it.id)).map((it) => COMMODITIES.find((c) => c.id === it.id)?.name).filter(Boolean);
    const supplied = mkt.filter((it) => eco.sells.includes(it.id)).map((it) => COMMODITIES.find((c) => c.id === it.id)?.name).filter(Boolean);
    const visible = [...mkt].sort((a, b) => Number((g.cargo[b.id] || 0) > 0) - Number((g.cargo[a.id] || 0) > 0));
    let html = `<div class="market-page">
      <header class="market-hero">
        <div><div class="eyebrow">${eco.label.toUpperCase()} ECONOMY · LIVE MARKET</div>
          <h3>What do you want to trade?</h3>
          <p>BUY loads your hold. SELL turns your cargo into credits. Prices below are per tonne.</p></div>
        <div class="market-wallet"><span>YOUR CREDITS</span><strong>${fmtCredits(g.credits)} CR</strong><span>HOLD ${Number(g.cargoUsed()).toFixed(0)} / ${g.ship.stats.cargo}t · ${fmtCredits(heldValue)} CR here</span></div>
      </header>
      <div class="market-orient">
        <div><small>THIS STATION WANTS</small><b>${wanted.join(' · ') || 'General cargo'}</b><span>Look for “high demand” on each card.</span></div>
        <div><small>THIS STATION STOCKS</small><b>${supplied.join(' · ') || 'Mixed goods'}</b><span>Look for “good buy” before loading up.</span></div>
      </div>
      <div class="market-route"><b>WHERE NEXT</b><span>${hint}</span></div>`;
    let bulletinHtml = '';
    if (notes.length) {
      bulletinHtml = `<div class="market-bulletins"><div class="eyebrow">LOCAL DEALS · ${fmtTime(left)} LEFT</div><div class="market-bulletin-list">`;
      for (const n of notes) {
        bulletinHtml += `<div><b>${(COMMODITIES.find((c) => c.id === n.id)?.name || n.id).toUpperCase()}</b><span>${n.text}</span></div>`;
      }
      bulletinHtml += `</div></div>`;
    }
    html += `<div class="market-toolbar"><div class="market-quantity"><span>AMOUNT PER CLICK</span><div>${[1, 10, 'MAX'].map((q) => `<button type="button" data-qty="${q}" class="${this.qtyMode === q ? 'on' : ''}" aria-pressed="${this.qtyMode === q}">${q}</button>`).join('')}</div></div></div>
      <div class="market-grid">`;
    for (const it of visible) {
      const com = COMMODITIES.find((c) => c.id === it.id);
      if (!com) continue;
      const held = g.cargo[it.id] || 0;
      const listed = tradePrices(it.price * (g.galaxy?.rules?.buyTax || 1));
      let sellP = applyBulletinBonus(listed.sell, notes, it.id, true);
      let buyP = applyBulletinBonus(listed.buy, notes, it.id, false);
      if (sellP >= buyP) sellP = Math.max(1, buyP - 1);
      const buyDiff = Math.round((buyP / com.base - 1) * 100);
      const sellDiff = Math.round((sellP / com.base - 1) * 100);
      const reserved = g.missions.filter((m) => m.commodity === it.id).reduce((a, m) => a + m.amount, 0);
      const pinned = g.pinned?.[it.id] || 0;
      const storyHold = it.id === 'data' && g.campaign?.flags?.crate ? Math.min(held, 4) : 0;
      const sellable = sellableTons(held, reserved + pinned + storyHold);
      const requested = this.qtyMode === 'MAX' ? Infinity : this.qtyMode;
      const buyQty = tonsQty(Math.max(0, Math.min(requested, it.stock, g.ship.stats.cargo - g.cargoUsed(), g.credits / Math.max(buyP, 1))));
      const sellQty = tonsQty(Math.min(requested, sellable));
      const buyLabel = Number.isInteger(buyQty) ? buyQty : Number(buyQty.toPrecision(2));
      const [kind, desc] = MARKET_COPY[it.id] || ['CARGO', 'Trade cargo.'];
      html += `<article class="market-card ${held > 0 ? 'has-cargo' : ''}">
        <div class="market-card-top"><div class="market-art market-art-${it.id}">${commodityArt(it.id)}</div>
          <div class="market-card-name"><small>${kind}${com.legal ? '' : ' · ILLEGAL'}</small><h4>${com.name}</h4><p>${desc}</p></div></div>
        <div class="market-card-flags"><span>STATION STOCK <b>${it.stock}t</b></span><span>YOUR HOLD <b>${held.toFixed(0)}t</b></span></div>
        <div class="market-prices">
          <div><small>BUY FROM STATION</small><strong>${fmtCredits(buyP)} <em>CR/t</em></strong><span class="${buyDiff <= -5 ? 'deal' : ''}">${buyDiff <= -5 ? 'GOOD BUY' : 'VS AVG'} · ${buyDiff > 0 ? '+' : ''}${buyDiff}%</span></div>
          <div><small>SELL TO STATION</small><strong>${fmtCredits(sellP)} <em>CR/t</em></strong><span class="${sellDiff >= 5 ? 'deal' : ''}">${sellDiff >= 5 ? 'HIGH DEMAND' : 'VS AVG'} · ${sellDiff > 0 ? '+' : ''}${sellDiff}%</span></div>
        </div>
        <div class="market-actions"><button class="buybtn" data-buy="${it.id}" ${buyQty ? '' : 'disabled'}>${buyQty ? `BUY ${buyLabel}t` : 'BUY CARGO'}</button>
          <button class="sellbtn" data-sell="${it.id}" ${sellQty ? '' : 'disabled'}>${sellQty ? `SELL ${sellQty}t` : 'SELL CARGO'}</button>
          <button class="buybtn" data-pin="${it.id}" style="margin-left:8px">${pinned ? 'PINNED' : 'PIN'}</button></div>
        ${reserved > 0 ? `<div class="market-reserved">${reserved}t reserved for a contract</div>` : ''}
        ${pinned ? `<div class="market-reserved">${pinned}t pinned — sell-all skips it</div>` : ''}
      </article>`;
    }
    if (!visible.length) html += `<div class="market-empty">This station has nothing on the board.</div>`;
    html += `</div>${bulletinHtml}</div>`;
    return html;
  }

  _refineHTML() {
    const g = this.game;
    const hubs = g.galaxy?.hubs || [];
    const trade = hubs.find((h) => h.kind === 'hub_trade');
    const tradeSys = trade && g.galaxy.systems.find((s) => s.id === trade.systemId);
    const tradePad = tradeSys && (tradeSys.stations || []).find((s) => s.id === trade.id);
    const metalsThere = tradePad?.market?.find((x) => x.id === 'metals')?.price;
    const localMetals = this.station?.market?.find((x) => x.id === 'metals')?.price;
    const localMin = this.station?.market?.find((x) => x.id === 'minerals')?.price;
    let html = `<div class="eyebrow">ORE REFINERY</div>
      <p style="color:var(--text-dim);margin:8px 0 16px">Ore is cheap on this board and the stock is thin — mine the belt, then run the foundry. Haul plate to ${trade ? `${trade.name} (${trade.system})` : 'a trade spin'}. You lose mass. You make the route.</p>`;
    if (metalsThere && localMin) {
      const rec = REFINE_RECIPES[0];
      const delta = refineHaulDelta(localMin, metalsThere, rec);
      html += `<p style="color:var(--cy);margin:0 0 16px">This pad buys minerals at ${fmtCredits(localMin)} CR/t. ${trade.name} sells metals at ${fmtCredits(metalsThere)} CR/t. Smelt-and-haul beats dump by about ${fmtCredits(Math.max(0, delta))} CR per batch.</p>`;
    }
    html += `<div class="svc-grid">`;
    for (const rec of REFINE_RECIPES) {
      const have = g.cargo[rec.in] || 0;
      const ok = canRefine(g.cargo, rec, g.credits);
      const inName = COMMODITIES.find((c) => c.id === rec.in)?.name || rec.in;
      const outName = COMMODITIES.find((c) => c.id === rec.out)?.name || rec.out;
      html += `<div class="svc-card refinery-recipe">
        <div class="refinery-materials"><div class="market-art">${commodityArt(rec.in)}</div><span>${rec.inAmt}t → ${rec.outAmt}t</span><div class="market-art">${commodityArt(rec.out)}</div></div>
        <h3>${rec.name.toUpperCase()}</h3>
        <p>${rec.hint}</p>
        <div class="svc-row"><span>Feed</span><b>${rec.inAmt}t ${inName}</b></div>
        <div class="svc-row"><span>Yield</span><b>${rec.outAmt}t ${outName}</b></div>
        <div class="svc-row"><span>In hold</span><b>${have ? have.toFixed(1) + 't' : '—'}</b></div>
        <div class="svc-row"><span>Fee</span><b class="up">${fmtCredits(rec.fee)} CR</b></div>
        <button class="buybtn" data-refine="${rec.id}" style="width:100%;margin-top:12px" ${ok ? '' : 'disabled'}>${ok ? 'RUN BATCH' : 'NEED FEED OR CREDITS'}</button>
      </div>`;
    }
    html += `</div>`;
    return html;
  }

  _surveyHTML() {
    const g = this.game, st = this.station;
    const data = Math.floor(g.cargo.data || 0);
    const listed = (st.market || []).find((x) => x.id === 'data')?.price || 760;
    const pay = surveyDataPayout(data, listed);
    const here = g.system;
    const unscanned = (here.planets || []).filter((p) => !p.scanned).slice(0, 6);
    const nearby = [...(g.galaxy?.systems || [])]
      .filter((s) => s.id !== here.id)
      .sort((a, b) => {
        const da = Math.hypot(a.pos.x - here.pos.x, a.pos.y - here.pos.y, a.pos.z - here.pos.z);
        const db = Math.hypot(b.pos.x - here.pos.x, b.pos.y - here.pos.y, b.pos.z - here.pos.z);
        return da - db;
      });
    const hidden = nearby.filter((s) => !s.discovered).slice(0, 3);
    const chartCost = 420;
    let html = `<div class="eyebrow">SURVEY DESK · ${(STATION_KIND_LABEL[st.kind] || 'ARRAY').toUpperCase()}</div>
      <p style="color:var(--text-dim);margin:8px 0 16px">This is not a freight dump. Deep-survey a world (hold F), dock, cash the charts. Rare earths still buy on the side if the pad stocks them.</p>
      <div class="svc-grid">
        <div class="svc-card">
          <h3>RESEARCH DATA</h3>
          <p>Each first deep survey files one unit of research data. This array pays a premium over the listed rate.</p>
          <div class="svc-row"><span>In hold</span><b>${data || '—'}</b></div>
          <div class="svc-row"><span>Payout</span><b class="up">${fmtCredits(pay)} CR</b></div>
          <button class="buybtn" data-survey="cash" style="width:100%;margin-top:12px" ${data > 0 ? '' : 'disabled'}>${data > 0 ? 'CASH DATA' : 'NO DATA ON FILE'}</button>
        </div>
        <div class="svc-card">
          <h3>NAVIGATION CHART</h3>
          <p>Buy a filed chart. The nearest uncharted star is marked discovered on G.</p>
          <div class="svc-row"><span>Cost</span><b class="up">${fmtCredits(chartCost)} CR</b></div>
          <div class="svc-row"><span>Next</span><b>${hidden[0] ? 'Uncharted system in range' : 'Sheet is filed'}</b></div>
          <button class="buybtn" data-survey="chart" style="width:100%;margin-top:12px" ${hidden[0] && g.credits >= chartCost ? '' : 'disabled'}>${hidden[0] ? 'BUY CHART' : 'NO BLANKS LEFT'}</button>
        </div>
      </div>
      <div class="mp-sep"></div>
      <div class="eyebrow">UNSCANNED IN ${here.name.toUpperCase()}</div>`;
    if (!unscanned.length) html += `<p style="color:var(--text-dim)">Every world here is filed. Jump, scan, come back.</p>`;
    else {
      html += `<table class="mkt"><thead><tr><th>BODY</th><th>CLASS</th><th class="num">EST. VALUE</th></tr></thead><tbody>`;
      for (const p of unscanned) {
        html += `<tr><td class="name">${p.name}</td><td>${p.pinged ? 'PINGED' : 'DARK'}</td><td class="num">${fmtCredits(p.value || 0)}</td></tr>`;
      }
      html += `</tbody></table>`;
    }
    return html;
  }

  _workshopHTML() {
    const g = this.game;
    const kind = this.station?.kind;
    const lab = kind === 'hub_survey';
    const yard = kind === 'hub_shipyard';
    const row = (k, v) => `<div class="svc-row"><span>${k}</span><b>${v}</b></div>`;
    const anchor = anchorStatus(g);
    const science = g.route?.opened ? 'OPEN' : 'CLOSED';
    const goals = nextLicenceGoals(g, 4);
    const goalLines = goals.length
      ? goals.map((r) => {
        const when = r.chapter >= 13 ? 'after the ending' : `ch.${r.chapter}`;
        const parts = (r.parts || []).map((p) => {
          const ok = p.have + 1e-6 >= p.need;
          return `<li data-ok="${ok ? '1' : '0'}"><span>${p.label}</span><b>${p.id === 'rp' ? `${Math.floor(p.have)} / ${p.need}` : `${p.have} / ${p.need} t`}</b></li>`;
        }).join('') || '<li data-ok="1"><span>Licence</span><b>UNLOCKED</b></li>';
        const tag = r.state === 'available' ? 'READY' : r.state === 'short' ? 'NEED CARGO' : `SEALED · ${when}`;
        return `<article class="goal-row" data-state="${r.state}">
          <header><h4>${r.label}</h4><em>${tag}</em></header>
          <ul>${parts}</ul>
        </article>`;
      }).join('')
      : '<p>Every local world type is unlocked.</p>';
    let html = `<div class="eyebrow">EXPEDITION DESK</div>
      <section class="goal-board">
        <div class="goal-head">
          <div><h3>WORLD LICENCES</h3>
            <p>Goal: clear each kind of world in this galaxy. Pay the stack at the observatory (Research Array), then land and deep-survey. Orbital ping stays free. Story worlds on the job stay open.</p></div>
          <div class="obs-stats"><b>${(g.rp || 0)}</b><span>research points</span></div>
        </div>
        <div class="goal-list">${goalLines}</div>
        ${lab ? '<p class="goal-hint">You are at the observatory — open the OBSERVATORY tab to license a world.</p>' : '<p class="goal-hint">Find this galaxy’s single observatory to spend cargo and RP on a licence.</p>'}
      </section>
      <div class="svc-grid">
        <div class="svc-card"><h3>HOLD</h3>
          ${row('Kits', g.kits || 0)} ${row('Filters', g.filters || 0)} ${row('Cells', g.transitCells || 0)}
          ${row('RP', g.rp || 0)} ${row('Slots', `${(g.fitted || []).length} / ${SLOT_COUNT}`)}
          ${row('Fitted', (g.fitted || []).join(', ') || '—')}
          ${row('Science route', science)}
        </div>
        <div class="svc-card"><h3>CRAFT</h3>
          ${lab ? RECIPES.map((rec) => `<button class="buybtn" data-craft="${rec.id}" style="width:100%;margin-top:8px">${rec.name}</button>
            <button class="buybtn" data-buy-item="${rec.id}" style="width:100%;margin-top:4px">BUY ${rec.name}</button>`).join('')
            : '<p>Kits, filters, packs and cells are built at a research array.</p>'}
        </div>
        <div class="svc-card"><h3>MODULES</h3>
          ${Object.values(MODULES).map((mod) => `<div class="svc-row"><span>${mod.name}</span><b>${mod.rp} RP</b></div>
            ${lab ? `<button class="buybtn" data-learn="${mod.id}" style="width:100%;margin-top:4px">LEARN</button>` : ''}
            ${yard ? `<button class="buybtn" data-fit="${mod.id}" style="width:100%;margin-top:4px">BUILD & FIT</button>` : ''}`).join('')}
          ${yard ? (g.fitted || []).map((id) => `<button class="buybtn" data-unfit="${id}" style="width:100%;margin-top:8px">STOW ${MODULES[id]?.name || id}</button>`).join('') : '<p>Learn a blueprint at the array. Fit it at the shipyard.</p>'}
        </div>
        <div class="svc-card"><h3>ROUTE</h3>
          <p>Three worlds, two types, then Navigation I. Ore comes from a refinery, tech from the observatory. Fit the module at the shipyard — a copy in the locker does not ask for the ore again — then pay ${30} RP here. Each station sells a different list. Neighbour galaxies are cargo charts on the observatory tab. Choir Void is a filament from Aetheria. The Veil is the anchor.</p>
          <button class="buybtn" data-route="open" style="width:100%;margin-top:8px">OPEN SCIENCE ROUTE</button>
          ${row('Fragments', `${anchor.fragmentCount}/3`)}
          ${row('Galaxies visited', `${anchor.galaxyCount}/3`)}
          ${row('Anchor ore', `${4 - anchor.rareLeft}/4 rare · ${4 - anchor.techLeft}/4 tech`)}
          <button class="buybtn" data-anchor="give" style="width:100%;margin-top:8px">DELIVER ORE</button>
          <button class="buybtn" data-anchor="back" style="width:100%;margin-top:4px">TAKE DELIVERY BACK</button>
          <button class="buybtn" data-anchor="build" style="width:100%;margin-top:4px">BUILD ANCHOR</button>
          <button class="buybtn" data-anchor="reserve" style="width:100%;margin-top:4px">RESERVE RETURN CELL</button>
          <button class="buybtn" data-anchor="jump" style="width:100%;margin-top:4px">${g.galaxy?.id === 'veil' ? 'RETURN THROUGH ANCHOR' : 'JUMP THE ANCHOR'}</button>
        </div>
      </div>`;
    const researched = Object.keys(g.researched || {});
    if (researched.length) {
      html += `<div class="eyebrow">FILE A COPY</div>`;
      for (const id of researched.slice(0, 8)) {
        html += `<button class="buybtn" data-publish="${id}" style="margin:4px">${g.published?.[id] ? 'FILED' : 'PUBLISH'} ${id}</button>`;
      }
    }
    return html;
  }

  _accessHTML() {
    const g = this.game;
    const rows = accessRows(g);
    const openN = rows.filter((r) => r.open).length;
    const counts = {};
    for (const s of g.galaxy?.systems || []) {
      for (const p of s.planets || []) counts[p.type] = (counts[p.type] || 0) + 1;
    }
    const tag = { open: 'UNLOCKED', available: 'READY', short: 'NEED CARGO', sealed: 'SEALED' };
    const byType = {};
    for (const s of g.galaxy?.systems || []) {
      for (const p of s.planets || []) {
        const slot = byType[p.type] || (byType[p.type] = { sample: p, places: [] });
        if (!slot.places.includes(s.name)) slot.places.push(s.name);
      }
    }
    const cards = rows.map((r) => {
      const when = r.chapter >= 13 ? 'After the ending' : `Chapter ${r.chapter}`;
      const slot = byType[r.type];
      const img = planetThumbnail(r.type, slot?.sample);
      const where = (slot?.places || []).slice(0, 3).join(' · ');
      const goal = (r.parts || []).length
        ? `<ul class="obs-goal">${r.parts.map((p) => {
          const ok = p.have + 1e-6 >= p.need;
          const have = p.id === 'rp' ? Math.floor(p.have) : p.have;
          const unit = p.id === 'rp' ? '' : ' t';
          return `<li data-ok="${ok ? '1' : '0'}"><span>${p.label}</span><b>${have} / ${p.need}${unit}</b></li>`;
        }).join('')}</ul>`
        : '';
      let action;
      if (r.state === 'open') action = '<div class="obs-done">UNLOCKED</div>';
      else if (r.state === 'sealed') action = `<div class="obs-when">Opens · ${when}</div>`;
      else if (r.state === 'short') action = `<div class="obs-when">Need · ${r.costText}</div>`;
      else action = `<button class="obs-buy" data-unlock="${r.type}">LICENSE · ${r.costText}</button>`;
      return `<article class="obs-card" data-state="${r.state}">
        <div class="obs-art">${img ? `<img src="${img}" alt="${r.label}" draggable="false" />` : ''}<span class="obs-pill">${tag[r.state]}</span></div>
        <div class="obs-body">
          <h3>${r.label}</h3>
          ${where ? `<p class="obs-where">${where}</p>` : ''}
          <p>${r.state === 'sealed' ? `The story opens these skies at ${when.toLowerCase()}.` : r.why}</p>
          <dl><div><dt>Charted here</dt><dd>${counts[r.type] || 0}</dd></div><div><dt>Story</dt><dd>${when}</dd></div><div><dt>Cost</dt><dd>${r.costText}</dd></div></dl>
          ${goal}
          ${action}
        </div>
      </article>`;
    }).join('');
    const stationName = this.station?.name || 'Observatory';
    return `<section class="obs">
      <header class="obs-head">
        <div><small>OBSERVATORY · ${(g.galaxy?.name || '').toUpperCase()}</small><h2>${stationName}</h2>
          <p>This observatory charts only the ${rows.length} kinds of world that exist in this galaxy. Pay the stack on a card to unlock that kind. Other galaxies open from the charts below — each one is sold in a neighbouring observatory, and lists only the worlds that galaxy actually has.</p></div>
        <div class="obs-stats"><b>${openN}<i>/${rows.length}</i></b><span>unlocked</span><b>${g.rp || 0}</b><span>research points</span></div>
      </header>
      <div class="obs-grid">${cards}</div>
      ${this._chartHTML()}
    </section>`;
  }

  _chartHTML() {
    const g = this.game;
    const rows = chartRows(g);
    const tag = {
      open: 'UNLOCKED',
      available: 'READY',
      short: 'NEED CARGO',
      sealed: 'SEALED',
      route: 'SCIENCE ROUTE',
      elsewhere: 'OTHER OBSERVATORY',
      beyond: 'NO PATH YET',
    };
    const cards = rows.map((r) => {
      const worlds = (r.worlds || []).join(' · ');
      const goal = `<ul class="obs-goal">${(r.parts || []).map((p) => {
        const ok = p.have + 1e-6 >= p.need;
        const have = p.id === 'rp' ? Math.floor(p.have) : p.have;
        const unit = p.id === 'rp' ? '' : ' t';
        return `<li data-ok="${ok ? '1' : '0'}"><span>${p.label}</span><b>${have} / ${p.need}${unit}</b></li>`;
      }).join('')}</ul>`;
      let action = '<div class="obs-done">UNLOCKED</div>';
      if (r.state === 'available') action = `<button class="obs-buy" data-chart="${r.id}">CHART · ${r.costText}</button>`;
      else if (r.state === 'short') action = `<div class="obs-when">Need · ${r.costText}</div>`;
      else if (r.state === 'sealed') action = `<div class="obs-when">Opens · Chapter ${r.chapter}</div>`;
      else if (r.state === 'route') action = '<div class="obs-when">Open the science route first</div>';
      else if (r.state === 'elsewhere') action = `<div class="obs-when">Sold in ${r.sellerLabel}</div>`;
      else if (r.state === 'beyond') action = '<div class="obs-when">Chart a galaxy on the way first</div>';
      return `<article class="goal-row" data-state="${r.state === 'open' ? 'available' : r.state}">
        <header><h4>${r.name}</h4><em>${tag[r.state] || r.state}</em></header>
        <p>${worlds}</p>
        ${r.state === 'open' ? '' : goal}
        ${action}
      </article>`;
    }).join('');
    return `<div class="obs-charts">
      <div class="eyebrow">GALAXY CHARTS</div>
      <p>Home is open. The first neighbour is a full ore haul, not a pocket purchase. The galaxy after that costs another haul plus the RP from a fresh survey. Choir Void follows the ending and only has a filament from Aetheria. The Veil follows the anchor.</p>
      <div class="goal-list">${cards}</div>
    </div>`;
  }

  _bindAccess(host, refresh) {
    host.querySelectorAll('[data-unlock]').forEach((b) => {
      b.onclick = () => {
        const res = unlockWorldType(this.game, b.dataset.unlock);
        if (res.ok && !res.repeat) Audio.credits?.();
        this.game.hud.toast(res.ok ? `${res.label} unlocked` : res.reason, res.ok ? 'good' : 'bad', 3.4);
        if (res.ok) this.game.save?.(true);
        refresh();
      };
    });
    host.querySelectorAll('[data-chart]').forEach((b) => {
      b.onclick = () => {
        const res = buyGalaxyChart(this.game, b.dataset.chart);
        if (res.ok && !res.repeat) Audio.credits?.();
        this.game.hud.toast(res.ok ? `${res.label} charted — it is on the U map` : res.reason, res.ok ? 'good' : 'bad', 3.6);
        if (res.ok) this.game.save?.(true);
        refresh();
      };
    });
  }

  openExpedition(target) {
    const g = this.game;
    const body = target?.data;
    if (!body) { g.hud?.toast('Lock a world (T), then press Y', 'info', 2.6); return; }
    const q = quoteExpedition(g, body);
    const html = `<p>${q.name} · ${q.type} · ${q.status}</p>
      <div class="svc-row"><span>Module</span><b>${q.module}${q.haveModule ? '' : ' · missing'}</b></div>
      <div class="svc-row"><span>Kits / filters</span><b>${q.kits} / ${q.filters}</b></div>
      <div class="svc-row"><span>Hold free</span><b>${q.freeHold} t</b></div>
      <div class="svc-row"><span>Fuel</span><b>${q.fuel} u · hop ~${q.hop}</b></div>
      <p>${q.back}</p>
      ${q.block ? `<p>${q.block}</p>` : ''}
      <button class="buybtn" id="exStart" ${q.block ? 'disabled' : ''}>START EXPEDITION</button>
      <button class="buybtn" id="exCancel">CANCEL</button>`;
    this.openModal('EXPEDITION', html, true);
    const host = document.getElementById('modalBody');
    const start = host.querySelector('#exStart');
    const cancel = host.querySelector('#exCancel');
    if (start) start.onclick = () => {
      const res = armExpedition(g, body);
      g.hud.toast(res.ok ? 'Expedition ready — hold F on the world' : res.reason, res.ok ? 'good' : 'bad', 3.4);
      this.closeModal();
    };
    if (cancel) cancel.onclick = () => {
      const res = cancelExpedition(g);
      g.hud.toast(res.refunded ? 'Cancelled — materials returned' : (res.reason || 'Closed'), res.ok ? 'info' : 'bad', 3);
      this.closeModal();
    };
  }

  openFieldChoice(body) {
    const g = this.game;
    const sites = sitesFor(body?.type);
    const ev = EVENTS.find((e) => e.id === g.expedition?.eventId);
    const eventHtml = ev
      ? `<p><b>${ev.title}</b> — ${ev.text}</p>
      <button class="buybtn" data-event="a" style="width:100%;margin-top:8px">${ev.a}</button>
      <button class="buybtn" data-event="b" style="width:100%;margin-top:8px">${ev.b}</button>`
      : '';
    const html = `${eventHtml}<p>Pick up what the hold can take. The rest stays on the site.</p>
      ${sites.map((s) => `<button class="buybtn" data-site="${s.id}" style="width:100%;margin-top:8px">${s.label} — ${s.detail} · ${s.risk}</button>`).join('')}`;
    this.openModal('FIELD RESULT', html, true);
    const bodyEl = document.getElementById('modalBody');
    bodyEl.querySelectorAll('[data-event]').forEach((b) => {
      b.onclick = () => {
        const res = resolveEvent(g, b.dataset.event);
        g.hud.toast(res.ok ? (res.text || 'Logged') : (res.reason || 'Cannot'), res.ok ? 'good' : 'bad', 3.2);
        if (res.ok) bodyEl.querySelectorAll('[data-event]').forEach((x) => { x.disabled = true; });
      };
    });
    bodyEl.querySelectorAll('[data-site]').forEach((b) => {
      b.onclick = () => {
        const res = chooseSite(g, b.dataset.site);
        g.ship.cargo = g.cargo;
        g.hud.toast(res.ok ? `${res.site?.label || 'Site'} · ${res.minerals || 0} t minerals` : (res.reason || 'No haul'), res.ok ? 'good' : 'bad', 3.4);
        this.closeModal();
      };
    });
  }

  _servicesHTML() {
    const g = this.game, s = g.ship;
    const mul = g.dockMult ? g.dockMult() : 1;
    const fuelPrice = Math.round(FUEL_CR_PER_UNIT * mul);
    const fuelNeeded = Math.ceil(s.maxFuel - s.fuel);
    const fuelCost = fuelNeeded * fuelPrice;
    const hullNeeded = Math.ceil(s.maxHull - s.hull);
    const hullCost = Math.round(hullNeeded * 42 * mul);
    const shieldNeeded = Math.ceil(s.maxShield - s.shield);
    const shieldCost = Math.round(shieldNeeded * 26 * mul);
    const row = (label, val, cls = '') => `<div class="svc-row"><span>${label}</span><b class="${cls}">${val}</b></div>`;
    return `<div class="svc-grid">
      <div class="svc-card"><h3>REFUELLING</h3><p>The pad does not fill the tank. Buy the units you need.</p>
        ${row('Tank', `${Math.round(s.fuel)} / ${s.maxFuel}`)}
        ${row('Price', `${fuelPrice} CR / unit`)}
        ${row('Cost', fmtCredits(fuelCost) + ' CR', 'up')}
        <button class="buybtn" data-svc="fuel" style="width:100%;margin-top:12px" ${fuelNeeded <= 0 || g.credits < fuelCost ? 'disabled' : ''}>${fuelNeeded <= 0 ? 'TANK FULL' : 'REFUEL'}</button>
        <button class="buybtn" data-svc="pump" style="width:100%;margin-top:8px">PUMP 1 t HOLD FUEL → 40 UNITS</button>
      </div>
      <div class="svc-card"><h3>EXPEDITION</h3><p>Orbital ping is free. A deep survey spends one scan kit. The first one this career is free.</p>
        ${row('Scan kits', String(g.kits || 0))}
        ${row('Research', `${g.rp || 0} RP`)}
        ${row('Hold', `${Number(g.cargoUsed()).toFixed(1)} t`)}
      </div>
      <div class="svc-card"><h3>HULL REPAIR</h3><p>Weld and pressurise.</p>
        ${row('Hull', `${Math.round(s.hull)} / ${s.maxHull}`)}
        ${row('Cost', fmtCredits(hullCost) + ' CR', 'up')}
        <button class="buybtn" data-svc="hull" style="width:100%;margin-top:12px" ${hullNeeded <= 0 || g.credits < hullCost ? 'disabled' : ''}>${hullNeeded <= 0 ? 'HULL INTACT' : 'REPAIR HULL'}</button>
      </div>
      <div class="svc-card"><h3>SHIELD RECHARGE</h3><p>Cycle the emitters at dock voltage.</p>
        ${row('Shields', `${Math.round(s.shield)} / ${s.maxShield}`)}
        ${row('Cost', fmtCredits(shieldCost) + ' CR', 'up')}
        <button class="buybtn" data-svc="shield" style="width:100%;margin-top:12px" ${shieldNeeded <= 0 || g.credits < shieldCost ? 'disabled' : ''}>${shieldNeeded <= 0 ? 'SHIELDS AT MAX' : 'RECHARGE'}</button>
      </div>
      <div class="svc-card"><h3>LLOYD'S OF AETHERIA</h3><p>Covered clones keep most of the hold. Policy burns on death.</p>
        ${row('Status', g.insured ? 'COVERED' : 'UNINSURED', g.insured ? 'up' : '')}
        ${row('Premium', fmtCredits(insurancePremium(SHIP_DEFS[g.shipDefId].price, mul)) + ' CR')}
        <button class="buybtn" data-svc="insurance" style="width:100%;margin-top:12px" ${g.insured || g.credits < insurancePremium(SHIP_DEFS[g.shipDefId].price, mul) ? 'disabled' : ''}>${g.insured ? 'POLICY ACTIVE' : 'BUY COVER'}</button>
      </div>
      <div class="svc-card"><h3>CUSTOMS WRIT</h3><p>Pay the Concord fine to clear the wanted flag.</p>
        ${row('Wanted', String(g.wanted || 0))}
        ${row('Fine', fmtCredits(writFine(g.wanted || 0)) + ' CR')}
        <button class="buybtn" data-svc="writ" style="width:100%;margin-top:12px" ${!(g.wanted > 0) || g.credits < writFine(g.wanted || 0) ? 'disabled' : ''}>${(g.wanted || 0) <= 0 ? 'CLEAN RECORD' : 'PAY FINE'}</button>
      </div>
    </div>`;
  }

  _arsenalHTML() {
    const g = this.game;
    const mul = g.dockMult ? g.dockMult() : 1;
    const unit = Math.round(850 * mul);
    const max = g.missilesMax || 8;
    const have = g.missiles ?? 0;
    const space = Math.max(0, max - have);
    const pack = Math.min(4, space);
    const packCost = pack * unit;
    const affordable = Math.min(space, Math.floor((g.credits || 0) / unit));
    const fillCost = affordable * unit;
    const ammoPct = max > 0 ? Math.round((have / max) * 100) : 0;
    const row = (label, val, cls = '') => `<div class="svc-row"><span>${label}</span><b class="${cls}">${val}</b></div>`;
    const bundleCost = Math.round((840 + 380 * 2) * mul * 0.85);
    return `<div class="svc-grid arsenal-grid">
      <div class="svc-card ordnance-card"><h3>MISSILE RACK</h3><p>Seeker missiles. Hold a hostile in the reticle until LOCK SOLID, then RMB.</p>
        ${row('Magazine', `${have} / ${max}`)}
        ${row('Unit price', fmtCredits(unit) + ' CR')}
        <div class="ammo-meter" aria-label="${ammoPct}% missile rack capacity"><i style="width:${ammoPct}%"></i></div>
        <div class="ammo-note">${space > 0 ? `${space} EMPTY RAIL${space === 1 ? '' : 'S'}` : 'RACK AT CAPACITY'}</div>
        <button class="buybtn ammo-one" data-svc="missile-one" style="width:100%;margin-top:10px" ${space <= 0 || g.credits < unit ? 'disabled' : ''}>${space <= 0 ? 'RACK FULL' : `BUY 1 MISSILE · ${fmtCredits(unit)}`}</button>
        <button class="buybtn" data-svc="missile-pack" style="width:100%;margin-top:8px" ${pack < 2 || g.credits < packCost ? 'disabled' : ''}>${pack < 2 ? 'BUY A SINGLE MISSILE ABOVE' : `BUY ${pack} MISSILES · ${fmtCredits(packCost)}`}</button>
        <button class="buybtn ammo-fill" data-svc="missile-fill" style="width:100%;margin-top:8px" ${affordable <= 0 ? 'disabled' : ''}>${space <= 0 ? 'RACK FULL' : affordable < space ? `BUY ${affordable} AFFORDABLE · ${fmtCredits(fillCost)}` : `FILL RACK · ${fmtCredits(fillCost)}`}</button>
      </div>
      <div class="svc-card"><h3>COUNTERMEASURES</h3><p>C deploys chaff. K dumps a heat sink.</p>
        ${row('Chaff', `${g.chaff ?? 0}`)}
        ${row('Heat sinks', `${g.heatsinks ?? 0}`)}
        <button class="buybtn" data-svc="chaff" style="width:100%;margin-top:12px" ${g.credits < Math.round(840 * mul) ? 'disabled' : ''}>BUY 2 CHAFF · ${fmtCredits(Math.round(840 * mul))}</button>
        <button class="buybtn" data-svc="heatsink" style="width:100%;margin-top:8px" ${g.credits < Math.round(380 * mul) ? 'disabled' : ''}>BUY HEAT SINK · ${fmtCredits(Math.round(380 * mul))}</button>
      </div>
      <div class="svc-card defense-bundle"><h3>DEFENSIVE FLIGHT PACK</h3>
        <p>Two chaff charges and two heat sinks. Keep a way out when a lock warning lights up.</p>
        ${row('Bundle contents', '2 CHAFF + 2 HEAT SINKS')}
        ${row('Bundle saving', '15%', 'up')}
        <button class="buybtn" data-svc="defense-pack" ${g.credits < bundleCost ? 'disabled' : ''}>BUY PACK · ${fmtCredits(bundleCost)} CR</button>
      </div>
    </div><div class="mp-sep"></div>${this._upgradesHTML(['ordnance'])}`;
  }

  _directoryHTML() {
    const g = this.game;
    const types = ['hub_trade', 'hub_shipyard', 'hub_arsenal', 'hub_refinery', 'hub_survey'];
    const ports = (g.galaxy?.systems || []).flatMap((sys) => (sys.stations || []).map((st) => ({ st, sys })));
    const distance = (sys) => sys.id === g.system.id ? -1 : Math.hypot(sys.pos.x - g.system.pos.x, sys.pos.y - g.system.pos.y, sys.pos.z - g.system.pos.z);
    return `<div class="eyebrow">PORT DIRECTORY</div><h3 class="directory-title">Find the right station</h3>
      <p class="directory-lead">Every hub has a job. Local ports can be targeted here; other systems are on G after undocking.</p>
      <div class="port-directory">${types.map((kind) => {
        const profile = STATION_PROFILES[kind];
        const hit = ports.filter(({ st }) => stationProfile(st) === profile).sort((a, b) => distance(a.sys) - distance(b.sys))[0];
        const here = hit?.st.id === this.station.id;
        const local = hit?.sys.id === g.system.id;
        return `<article class="directory-card" style="--port-color:${profile.color}"><strong>${profile.code}</strong><div>
          <h4>${profile.label}</h4><p>${profile.description}</p><b>${hit?.st.name || 'No port listed'}</b>
          <small>${here ? 'YOU ARE HERE' : local ? 'IN THIS SYSTEM · M ORBITAL MAP' : hit ? hit.sys.name + ' · G GALAXY MAP' : 'Explore another system'}</small>
          ${hit && local && !here ? `<button class="buybtn" data-port-target="${hit.st.id}">SET FLIGHT TARGET</button>` : ''}
        </div></article>`;
      }).join('')}</div>`;
  }

  _upgradesHTML(keys = Object.keys(UPGRADES).filter((key) => key !== 'ordnance')) {
    const g = this.game;
    g.upgrades = g.upgrades || {};
    const sto = garagePad(this.station);
    let html = `<div class="eyebrow">${keys.length === 1 ? 'MAGAZINE UPGRADE' : 'ENGINEERING BAY'}</div>
      <p style="color:var(--text-dim);margin:8px 0 16px">${keys.length === 1 ? 'A larger rack lets you carry more seeker missiles.' : 'Choose a part to install. Each level permanently improves your ship. Paint is in HULL & PAINT.'}</p>
      <div class="svc-grid">`;
    for (const key of keys) {
      const u = UPGRADES[key];
      const lvl = g.upgrades[key] || 0;
      const maxed = lvl >= u.max;
      const cost = upgradePrice(this.station, u, lvl);
      html += `<div class="svc-card">
        <h3>${u.name}</h3><p>${u.desc}</p>
        <div class="svc-row"><span>Installed</span><b>${'◆'.repeat(lvl)}${'◇'.repeat(u.max - lvl)}</b></div>
        <div class="svc-row"><span>${maxed ? 'Fully upgraded' : 'Next level'}</span><b class="up">${maxed ? '—' : fmtCredits(cost) + ' CR'}</b></div>
        <button class="buybtn" data-up="${key}" style="width:100%;margin-top:12px" ${maxed || g.credits < cost ? 'disabled' : ''}>${maxed ? 'MAX LEVEL' : 'INSTALL'}</button>
      </div>`;
    }
    html += `</div>`;
    return html;
  }

  _shipyardHTML() {
    const g = this.game;
    const s = g.ship;
    const paint = garagePad(this.station);
    let html = `<div class="eyebrow">${this.station?.kind === 'shipyard' ? 'GARAGE · STO' : 'GARAGE'}</div>
      <p style="color:var(--text-dim);margin:8px 0 16px">Inspect your ship and personalise its engine glow. Performance parts are in SHIP UPGRADES.</p>
      <div class="svc-card" style="margin-bottom:16px">
        <h3>${s?.def?.name || 'AURORA'}</h3>
        <p>Your active expedition ship.</p>
        <div class="svc-row"><span>SPEED</span><b>${s?.stats?.speed ?? '—'}</b></div>
        <div class="svc-row"><span>ACCEL</span><b>${s?.stats?.accel ?? '—'}</b></div>
        <div class="svc-row"><span>HOLD</span><b>${s?.stats?.cargo ?? '—'}t</b></div>
      </div>`;
    if (paint) {
      html += `<div class="eyebrow">PAINT BAY</div><div class="svc-grid">`;
      for (const lv of LIVERIES) {
        const on = (g.livery || '#3ec8ff') === lv.hex;
        html += `<div class="svc-card">
          <h3>${lv.name}</h3>
          <p>Emissive / engine glow only.</p>
          <div class="svc-row"><span>Glow</span><b style="color:${lv.hex}">${lv.hex}</b></div>
          <button class="buybtn" data-paint="${lv.id}" style="width:100%;margin-top:12px" ${on || g.credits < lv.cost ? 'disabled' : ''}>${on ? 'ACTIVE' : `PAINT · ${fmtCredits(lv.cost)} CR`}</button>
        </div>`;
      }
      html += `</div>`;
    } else {
      html += `<p style="color:var(--text-dim)">Visit a Shipworks for engine colours.</p>`;
    }
    if (FLEET_IDS.length > 1) {
      html += `<div class="mp-sep"></div><div class="eyebrow">HULLS</div><div class="ss-grid">`;
      for (const id of FLEET_IDS) {
        const d = SHIP_DEFS[id];
        if (!d) continue;
        const active = id === g.shipDefId;
        html += `<div class="ship-card ${active ? 'sel' : ''}"><div class="sc-body"><div class="sc-name">${d.name}</div></div></div>`;
      }
      html += `</div>`;
    }
    return html;
  }

  _missionsHTML() {
    const g = this.game, st = this.station;
    const offers = g.offerMissions(st);
    let html = `<div class="eyebrow">AVAILABLE CONTRACTS</div>
      <p style="color:var(--text-dim);margin:0 0 12px">Amber PAD runs are the money loop. Accept, jump, dock, get paid. Campaign steps also appear under Esc → pause and COMMS.</p>`;
    if (!offers.length) html += `<p style="color:var(--text-dim)">No contracts posted right now.</p>`;
    for (const m of offers) {
      const taken = g.missions.some((x) => x.id === m.id);
      html += `<div class="mission-card${m.pad ? '" style="border-color:var(--amber)' : ''}">
        <div class="mt">${m.pad ? m.title : m.type.toUpperCase() + ' CONTRACT'}</div>
        <h4>${m.pad ? `${m.amount}t ${m.commodityName} → ${m.destName}` : m.type === 'cargo' ? `Haul ${m.amount}t of ${m.commodityName}` : m.type === 'courier' ? `Carry ${m.amount} passenger(s)` : m.type === 'survey' ? `Survey ${m.count} bodies in ${g.galaxy.systems.find((s) => s.id === m.targetSystemId)?.name || '—'}` : m.type === 'hunt' ? `Kill ${m.targetName} in ${g.galaxy.systems.find((s) => s.id === m.targetSystemId)?.name || '—'}` : `Destroy ${m.count} hostiles in ${g.galaxy.systems.find((s) => s.id === m.targetSystemId)?.name || '—'}`}</h4>
        <p>${m.desc}</p>
        ${m.hullHintWhy ? `<p style="font-size:11px;color:var(--cy);margin-top:4px">Recommended hull · ${m.hullHintWhy}${g.shipDefId === m.hullHint ? ' · YOU ARE IN IT' : ''}</p>` : ''}
        <div class="mrow"><span>Reward <b>${fmtCredits(m.reward)} CR</b></span><span>Deadline <b>${fmtTime(Math.max(0, (m.expires || 0) - (g.stats.playtime || 0)))}</b></span><span>Destination <b style="color:var(--white)">${m.destName} · ${m.destSystem}</b></span>
        <button class="buybtn" data-mission="${m.id}" ${taken ? 'disabled' : ''}>${taken ? 'ACCEPTED' : 'ACCEPT'}</button></div>
      </div>`;
    }
    html += `<div class="mp-sep"></div><div class="eyebrow" style="color:var(--green)">ACTIVE CONTRACTS (${g.missions.length}/6)</div>`;
    if (!g.missions.length) html += `<p style="color:var(--text-dim)">Nothing on the books. Take a contract above.</p>`;
    for (const m of g.missions) {
      const here = m.destId === st.id;
      let status = '';
      if (m.type === 'cargo' || m.type === 'courier') status = `Carrying ${g.cargo[m.commodity] || 0}/${m.amount}`;
      else status = `Progress ${m.progress || 0}/${m.count || 1}`;
      const abandon = m.story ? '' : `<button class="sellbtn" data-abandon="${m.id}">ABANDON</button>`;
      html += `<div class="mission-card ${here ? 'done' : 'active'}">
        <div class="mt">${m.story ? 'AETHERIA SIGNAL' : m.type.toUpperCase()} · ${status}</div>
        <h4>${m.story ? chapterInfo(g.campaign).title : `${m.destName} — ${m.destSystem}`}</h4>
        <p>${m.desc}</p>
        ${m.story && m.how ? `<p style="font-size:12.5px;color:var(--cy);line-height:1.55;margin-top:8px">${m.how}</p>` : ''}
        <div class="mrow"><span>Reward <b>${m.reward ? fmtCredits(m.reward) + ' CR' : 'chapter beat'}</b></span>
        <span>${m.story ? '<b style="color:var(--purple)">CAMPAIGN</b>' : here ? '<b style="color:var(--amber)">COMPLETABLE HERE</b>' : 'IN PROGRESS'}</span>
        ${abandon}</div>
      </div>`;
    }
    return html;
  }

  _cargoHTML() {
    const g = this.game;
    const keys = Object.keys(g.cargo).filter((k) => g.cargo[k] > 0);
    const lockerKeys = Object.keys(g.locker || {}).filter((k) => g.locker[k] > 0);
    let html = `<div class="eyebrow">CARGO HOLD · ${g.cargoUsed()} / ${g.ship.stats.cargo} T</div>`;
    if (!keys.length) html += `<p style="color:var(--text-dim)">The hold is empty. Mine asteroids in a belt or buy commodities at the market.</p>`;
    else {
      html += `<div class="cargo-list">`;
      for (const k of keys) {
        const com = COMMODITIES.find((c) => c.id === k);
        const name = com ? com.name : k === 'passengers' ? 'Passengers' : k;
        html += `<div class="cargo-item"><span>${name}</span><b>${Math.round(g.cargo[k])}${k === 'data' ? ' cr' : 't'}</b></div>`;
      }
      html += `</div>`;
    }
    html += `<div class="mp-sep"></div><div class="eyebrow">STATION LOCKER${g.lockerAt ? ' · ' + g.lockerAt.toUpperCase() : ''}</div>`;
    if (!lockerKeys.length) html += `<p style="color:var(--text-dim)">Empty. Cargo that will not fit a smaller hull after a shipyard swap is stowed here.</p>`;
    else {
      html += `<div class="cargo-list">`;
      for (const k of lockerKeys) {
        const com = COMMODITIES.find((c) => c.id === k);
        const name = com ? com.name : k === 'passengers' ? 'Passengers' : k;
        const n = Math.round(g.locker[k]);
        html += `<div class="cargo-item"><span>${name}</span><b>${n}${k === 'data' ? ' cr' : 't'}</b>
          <button class="buybtn" data-locker="${k}" style="margin-left:12px;padding:6px 10px">RETRIEVE</button></div>`;
      }
      html += `</div>`;
    }
    html += `<div class="mp-hint" style="margin-top:14px">Selling is done from the <b>Commodity Market</b> tab. Mission cargo cannot be sold.</div>`;
    return html;
  }

  _logHTML() {
    const g = this.game, s = g.stats;
    const entries = Object.entries(g.gallery).sort((a, b) => b[1].t - a[1].t);
    let html = `<div class="svc-grid" style="margin-bottom:18px">
      <div class="svc-card"><h3>CAREER STATISTICS</h3>
        ${[['Credits', fmtCredits(g.credits)], ['Distance flown', fmtDist(s.distance)], ['Bodies surveyed', s.scans],
          ['Hostiles destroyed', s.kills], ['Ore mined', Math.round(s.mined) + ' t'], ['Frame shifts', s.jumps],
          ['Systems visited', g.galaxy.systems.filter((x) => x.visited).length + ' / ' + g.galaxy.systems.length],
          ['Wanted', g.wanted || 0], ['Chaff', g.chaff ?? 0], ['Heat sinks', g.heatsinks ?? 0],
          ['Dockings', s.dockings], ['Flight time', fmtTime(s.playtime)]]
          .map(([k, v]) => `<div class="svc-row"><span>${k}</span><b>${v}</b></div>`).join('')}
      </div>
      <div class="svc-card"><h3>STANDING</h3>
        ${[['Concord', (g.rep||{}).fed], ['Colonies', (g.rep||{}).ind], ['Syndicate', (g.rep||{}).syn], ['Choir', (g.rep||{}).cul]]
          .map(([k, v]) => `<div class="svc-row"><span>${k}</span><b>${factionStanding(v)} · ${Math.round(v || 0)}</b></div>`).join('')}
        <div class="svc-row"><span>Combat</span><b>${combatRank(s.kills).name}</b></div>
        <div class="svc-row"><span>Trade</span><b>${tradeRank(s.earned).name}</b></div>
        <div class="svc-row"><span>Explore</span><b>${exploreRank(s.scans).name}</b></div>
        <div class="svc-row"><span>Insurance</span><b>${g.insured ? 'COVERED' : 'UNINSURED'}</b></div>
      </div>
      <div class="svc-card"><h3>VESSEL</h3>
        ${[['Ship', g.ship.def.name], ['Class', g.ship.def.cls], ['Callsign', g.callsign],
          ['Hull', `${Math.round(g.ship.hull)} / ${g.ship.maxHull}`], ['Shields', `${Math.round(g.ship.shield)} / ${g.ship.maxShield}`],
          ['Fuel', `${Math.round(g.ship.fuel)} / ${g.ship.maxFuel} u`], ['Cargo', `${g.cargoUsed()} / ${g.ship.stats.cargo} t`],
          ['Jump range', fmtDist(g.ship.stats.jumpRange)]]
          .map(([k, v]) => `<div class="svc-row"><span>${k}</span><b>${v}</b></div>`).join('')}
      </div></div>`;
    html += `<div class="eyebrow">SURVEY ARCHIVE — ${entries.length} BODIES</div>`;
    if (!entries.length) html += `<p style="color:var(--text-dim)">No surveys logged yet. Target a world, hold <b style="color:var(--amber)">F</b> to ping, then dwell for a deep survey.</p>`;
    else {
      html += `<table class="mkt"><thead><tr><th>BODY</th><th>SYSTEM</th><th>CLASS</th><th class="num">VALUE</th></tr></thead><tbody>`;
      for (const [, e] of entries.slice(0, 200)) {
        html += `<tr><td class="name">${e.name}</td><td>${e.system}</td><td>${PLANET_TYPES[e.type]?.label || 'Derelict'}</td><td class="num" style="color:var(--green)">${fmtCredits(e.value)}</td></tr>`;
      }
      html += `</tbody></table>`;
    }
    return html;
  }

  _bindStation(body, tab) {
    const g = this.game;
    const toast = (res) => g.hud.toast(res?.ok ? (res.reason || 'Done') : (res?.reason || 'Refused'), res?.ok ? 'good' : 'bad', 3);
    this._bindAccess(body, () => this._refresh());
    body.querySelectorAll('[data-pin]').forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.pin;
        g.pinned = g.pinned || {};
        if (g.pinned[id]) delete g.pinned[id];
        else g.pinned[id] = g.cargo?.[id] || 0;
        this._refresh();
      };
    });
    body.querySelectorAll('[data-craft]').forEach((b) => { b.onclick = () => { toast(craftRecipe(g, b.dataset.craft)); this._refresh(); }; });
    body.querySelectorAll('[data-buy-item]').forEach((b) => { b.onclick = () => { toast(buyFinished(g, b.dataset.buyItem)); this._refresh(); }; });
    body.querySelectorAll('[data-learn]').forEach((b) => { b.onclick = () => { toast(learnBlueprint(g, b.dataset.learn)); this._refresh(); }; });
    body.querySelectorAll('[data-fit]').forEach((b) => { b.onclick = () => { toast(fitModule(g, b.dataset.fit)); this._refresh(); }; });
    body.querySelectorAll('[data-unfit]').forEach((b) => { b.onclick = () => { toast(unfitModule(g, b.dataset.unfit)); this._refresh(); }; });
    body.querySelectorAll('[data-route]').forEach((b) => { b.onclick = () => { toast(openScienceRoute(g)); this._refresh(); }; });
    body.querySelectorAll('[data-publish]').forEach((b) => { b.onclick = () => { const r = publishDiscovery(g, b.dataset.publish); g.hud.toast(r.ok ? `Copy filed · +${r.result?.pay || 0} CR` : r.reason, r.ok ? 'good' : 'bad', 3); this._refresh(); }; });
    body.querySelectorAll('[data-anchor]').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.anchor;
        const res = k === 'give' ? contributeAnchor(g) : k === 'back' ? refundAnchor(g) : k === 'build' ? buildAnchor(g) : k === 'reserve' ? reserveReturnCell(g) : null;
        if (k === 'jump') { this.game.jumpToAnchor(); return; }
        toast(res);
        this._refresh();
      };
    });
    body.querySelectorAll('[data-port-target]').forEach((b) => {
      b.onclick = () => {
        const target = g.bodies.find((rt) => rt.kind === 'station' && rt.data?.id === b.dataset.portTarget);
        if (!target) return;
        g.setTarget(target, true);
        g.hud.toast(`${target.data.name} targeted. Undock when ready.`, 'good', 4);
        b.textContent = 'TARGET SET · UNDOCK WHEN READY';
        Audio.uiClick();
      };
    });
    body.querySelectorAll('[data-qty]').forEach((b) => {
      b.onclick = () => { this.qtyMode = b.dataset.qty === 'MAX' ? 'MAX' : parseInt(b.dataset.qty, 10); Audio.uiClick(); this._refresh(); };
    });
    const qtyFor = (price, maxByCargo, maxByStock) => {
      let q = this.qtyMode === 'MAX' ? 99999 : this.qtyMode;
      q = Math.min(q, maxByStock, maxByCargo, g.credits / Math.max(price, 1));
      return tonsQty(q);
    };
    body.querySelectorAll('[data-buy]').forEach((b) => {
      b.onclick = () => {
        if (!stationServices(this.station).market) return;
        const it = this.station.market.find((x) => x.id === b.dataset.buy);
        const notes = (g.stationBulletins && g.stationBulletins(this.station)) || [];
        const price = applyBulletinBonus(tradePrices(it.price).buy, notes, it.id, false);
        const space = g.ship.stats.cargo - g.cargoUsed();
        const q = qtyFor(price, space, it.stock);
        if (q <= 0) {
          g.hud.toast(space < 0.1 ? 'Hold full — sell cargo first' : 'Cannot buy that here', 'bad', 2.6);
          return;
        }
        g.credits -= q * price;
        g.tradeFill?.(this.station, it.id, q, false);
        g.cargo[it.id] = (g.cargo[it.id] || 0) + q;
        Audio.credits();
        g.hud.toast(`Bought ${q}t ${COMMODITIES.find((c) => c.id === it.id).name}`, 'money', 2.4);
        this._refresh();
      };
    });
    body.querySelectorAll('[data-sell]').forEach((b) => {
      b.onclick = () => {
        if (!stationServices(this.station).market) return;
        const it = this.station.market.find((x) => x.id === b.dataset.sell);
        const notes = (g.stationBulletins && g.stationBulletins(this.station)) || [];
        const listed = tradePrices(it.price);
        let price = applyBulletinBonus(listed.sell, notes, it.id, true);
        const buyP = applyBulletinBonus(listed.buy, notes, it.id, false);
        if (price >= buyP) price = Math.max(1, buyP - 1);
        const reserved = g.missions.filter((m) => m.commodity === b.dataset.sell).reduce((a, m) => a + m.amount, 0);
        const pinned = g.pinned?.[b.dataset.sell] || 0;
        const storyHold = b.dataset.sell === 'data' && g.campaign?.flags?.crate ? Math.min(g.cargo[b.dataset.sell] || 0, 4) : 0;
        const held = sellableTons(g.cargo[b.dataset.sell], reserved + pinned + storyHold);
        const q = tonsQty(Math.min(this.qtyMode === 'MAX' ? 99999 : this.qtyMode, held));
        if (q <= 0) { g.hud.toast(reserved || pinned || storyHold ? 'That cargo is pinned, story-locked, or on a contract' : 'Nothing to sell', 'bad'); return; }
        g.credits += Math.round(q * price);
        g.stats.earned += Math.round(q * price);
        g.tradeFill?.(this.station, it.id, q, true);
        g.cargo[b.dataset.sell] = tonsQty((g.cargo[b.dataset.sell] || 0) - q);
        if (g.cargo[b.dataset.sell] <= 0) delete g.cargo[b.dataset.sell];
        if (g.pinned?.[b.dataset.sell]) g.pinned[b.dataset.sell] = Math.min(g.pinned[b.dataset.sell], g.cargo[b.dataset.sell] || 0);
        Audio.credits();
        g.hud.toast(`Sold ${q}t for ${fmtCredits(Math.round(q * price))} CR`, 'money', 2.4);
        let countable = q;
        if (b.dataset.sell === 'metals' && (g.oreShield || 0) > 0) {
          const skip = Math.min(g.oreShield, q);
          g.oreShield = tonsQty(g.oreShield - skip);
          countable = tonsQty(q - skip);
        }
        if (ORE_IDS.has(b.dataset.sell) && countable > 0) {
          onCampaignEvent(g, 'ore', { tons: countable, id: b.dataset.sell, kind: this.station.kind });
        }
        this._refresh();
      };
    });
    body.querySelectorAll('[data-survey]').forEach((b) => {
      b.onclick = () => {
        if (b.dataset.survey === 'cash') {
          const pay = g.cashSurveyData(this.station);
          if (pay <= 0) { g.hud.toast('No research data in the hold', 'bad'); return; }
          Audio.credits();
          g.hud.toast(`Cashed survey data · +${fmtCredits(pay)} CR`, 'money', 3.2);
          this._refresh();
          return;
        }
        if (b.dataset.survey === 'chart') {
          const res = g.buyNavChart();
          if (!res.ok) {
            g.hud.toast(res.reason === 'credits' ? 'Not enough credits' : 'No uncharted neighbour', 'bad');
            return;
          }
          Audio.credits();
          g.hud.toast(`Chart filed · ${res.name}`, 'good', 3.4);
          this._refresh();
        }
      };
    });
    body.querySelectorAll('[data-refine]').forEach((b) => {
      b.onclick = () => {
        const rec = REFINE_RECIPES.find((r) => r.id === b.dataset.refine);
        if (!rec || !canRefine(g.cargo, rec, g.credits)) return;
        const times = this.qtyMode === 'MAX'
          ? Math.min(Math.floor((g.cargo[rec.in] || 0) / rec.inAmt), Math.floor(g.credits / rec.fee))
          : Math.min(this.qtyMode || 1, Math.floor((g.cargo[rec.in] || 0) / rec.inAmt), Math.floor(g.credits / rec.fee));
        if (times <= 0) return;
        for (let i = 0; i < times; i++) g.cargo = applyRefine(g.cargo, rec);
        g.credits -= rec.fee * times;
        g.ship.cargo = g.cargo;
        Audio.credits();
        g.hud.toast(`Refined ${times} batch${times > 1 ? 'es' : ''} · ${COMMODITIES.find((c) => c.id === rec.out)?.name || rec.out}`, 'good', 2.6);
        g.oreShield = tonsQty((g.oreShield || 0) + rec.outAmt * times);
        onCampaignEvent(g, 'ore', { tons: rec.inAmt * times, id: rec.in, kind: this.station.kind });
        this._refresh();
      };
    });
    body.querySelectorAll('[data-locker]').forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.locker;
        const space = g.ship.stats.cargo - g.cargoUsed();
        const n = g.retrieveLocker(id, 99999);
        if (n <= 0) { g.hud.toast(space <= 0 ? 'Hold full — switch to a larger hull or sell first' : 'Locker empty', 'bad'); return; }
        Audio.credits();
        g.hud.toast(`Retrieved ${n}t from locker`, 'good', 2.4);
        this._refresh();
      };
    });
    body.querySelectorAll('[data-svc]').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.svc, s = g.ship;
        if ((k.startsWith('missile') || ['chaff', 'heatsink', 'defense-pack'].includes(k)) && !stationServices(this.station).ordnance) return;
        if (k === 'fuel') { const need = s.maxFuel - s.fuel; const cost = Math.ceil(need) * Math.round(FUEL_CR_PER_UNIT * (g.dockMult?.() || 1)); if (need > 0 && g.credits >= cost) { g.credits -= cost; s.fuel = s.maxFuel; g.hud.toast(`Tank filled · −${cost} CR`, 'good', 2.6); } }
        if (k === 'pump') { const r = convertFuelCargo(g); g.hud.toast(r.ok ? `Pumped ${r.tons} t → ${r.units} fuel units` : r.reason, r.ok ? 'good' : 'bad', 3); }
        if (k === 'hull') { const need = Math.ceil(s.maxHull - s.hull); const cost = Math.round(need * 42 * (g.dockMult?.() || 1)); if (g.credits >= cost) { g.credits -= cost; s.hull = s.maxHull; } }
        if (k === 'shield') { const need = Math.ceil(s.maxShield - s.shield); const cost = Math.round(need * 26 * (g.dockMult?.() || 1)); if (g.credits >= cost) { g.credits -= cost; s.shield = s.maxShield; } }
        if (k === 'missile-one' || k === 'missile' || k === 'missile-pack' || k === 'missile-fill') {
          const max = g.missilesMax || 8;
          const have = g.missiles ?? 0;
          const space = Math.max(0, max - have);
          const unit = Math.round(850 * (g.dockMult?.() || 1));
          const affordable = Math.floor((g.credits || 0) / unit);
          const n = k === 'missile-one' ? 1 : k === 'missile-pack' || k === 'missile' ? Math.min(4, space) : Math.min(space, affordable);
          const cost = n * unit;
          if (n > 0 && n <= space && g.credits >= cost) {
            g.credits -= cost;
            g.missiles = have + n;
            g.hud.toast(`${n} SEEKER MISSILE${n > 1 ? 'S' : ''} LOADED · −${fmtCredits(cost)} CR`, 'good', 3.2);
            g.save?.(true);
          }
        }
        if (k === 'chaff') { const cost = Math.round(840 * (g.dockMult?.() || 1)); if (g.credits >= cost) { g.credits -= cost; g.chaff = (g.chaff || 0) + 2; } }
        if (k === 'heatsink') { const cost = Math.round(380 * (g.dockMult?.() || 1)); if (g.credits >= cost) { g.credits -= cost; g.heatsinks = (g.heatsinks || 0) + 1; } }
        if (k === 'defense-pack') {
          const cost = Math.round((840 + 380 * 2) * (g.dockMult?.() || 1) * 0.85);
          if (g.credits >= cost) {
            g.credits -= cost;
            g.chaff = (g.chaff || 0) + 2;
            g.heatsinks = (g.heatsinks || 0) + 2;
            g.hud.toast('Defensive pack loaded · 2 chaff + 2 heat sinks', 'good', 3);
            g.save?.(true);
          }
        }
        if (k === 'insurance') {
          const cost = insurancePremium(SHIP_DEFS[g.shipDefId].price, g.dockMult?.() || 1);
          if (!g.insured && g.credits >= cost) { g.credits -= cost; g.insured = true; g.hud.toast('Hull insurance active until next destruction', 'good', 4); }
        }
        if (k === 'writ') {
          const cost = writFine(g.wanted || 0);
          if ((g.wanted || 0) > 0 && g.credits >= cost) { g.credits -= cost; g.wanted = 0; g.hud.toast('Writ cleared — Concord standing restored locally', 'good', 4); }
        }
        Audio.credits();
        this._refresh();
      };
    });
    body.querySelectorAll('[data-up]').forEach((b) => {
      b.onclick = () => {
        const key = b.dataset.up, u = UPGRADES[key];
        if (!u || (key === 'ordnance' ? !stationServices(this.station).ordnance : !stationServices(this.station).upgrades)) return;
        g.upgrades = g.upgrades || {};
        const lvl = g.upgrades[key] || 0;
        if (lvl >= u.max) return;
        const cost = upgradePrice(this.station, u, lvl);
        if (g.credits < cost) return;
        g.credits -= cost;
        g.upgrades[key] = lvl + 1;
        g.applyUpgrades();
        Audio.credits();
        const st = g.ship.stats;
        g.hud.toast(`${u.name} → L${lvl + 1}  ·  SPEED ${st.speed}  ACCEL ${st.accel}  HOLD ${st.cargo}t`, 'good', 4.2);
        onCampaignEvent(g, 'upgrade', { key, level: lvl + 1, stationKind: this.station?.kind });
        this._refresh();
      };
    });
    body.querySelectorAll('[data-paint]').forEach((b) => {
      b.onclick = () => {
        if (!stationServices(this.station).shipyard) return;
        const lv = LIVERIES.find((x) => x.id === b.dataset.paint);
        if (!lv) return;
        if ((g.livery || '') === lv.hex) return;
        if (g.credits < lv.cost) { g.hud.toast('Not enough credits', 'bad'); return; }
        g.credits -= lv.cost;
        g.livery = lv.hex;
        g.ship?.applyLivery?.(lv.hex);
        Audio.credits();
        g.hud.toast(`PAINT · ${lv.name}`, 'good', 3.2);
        this._refresh();
      };
    });
    body.querySelectorAll('[data-ship]').forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.ship;
        const res = g.switchShip(id, this.station);
        if (!res.ok) {
          if (res.reason === 'locked') g.hud.toast('That hull is not for sale yet', 'bad');
          else if (res.reason === 'credits') g.hud.toast('Not enough credits', 'bad');
          return;
        }
        Audio.dock();
        const title = res.bought ? 'HULL PURCHASED' : 'ACTIVE HULL SWITCHED';
        g.bigToast(title, res.name, 'good');
        if (res.overflow) g.hud.toast(`${Math.round(res.overflow)}t overflow stowed in station locker`, 'info', 5);
        this._refresh();
      };
    });
    body.querySelectorAll('[data-mission]').forEach((b) => {
      b.onclick = () => {
        const m = g.offerMissions(this.station).find((x) => x.id === b.dataset.mission);
        if (m && g.acceptMission(m)) this._refresh();
        else this._refresh();
      };
    });
    body.querySelectorAll('[data-abandon]').forEach((b) => {
      b.onclick = () => {
        const i = g.missions.findIndex((x) => x.id === b.dataset.abandon);
        if (i >= 0) {
          const m = g.missions[i];
          if (m.story || m.pad) { g.hud.toast(m.story ? 'This job is the contract. You cannot drop it.' : 'Pad run stays until the clock runs out', 'bad', 3); return; }
          if (m.escrow && g.cargo[m.commodity]) {
            g.cargo[m.commodity] = Math.max(0, g.cargo[m.commodity] - m.amount);
            if (g.cargo[m.commodity] <= 0) delete g.cargo[m.commodity];
          }
          g.missions.splice(i, 1);
          g.credits = Math.max(0, g.credits - Math.round(m.reward * 0.1));
          g.hud.toast('Contract abandoned — reputation penalty applied', 'bad', 4);
          Audio.uiBack();
          this._refresh();
        }
      };
    });
    body.querySelectorAll('[data-allegiance]').forEach((b) => {
      b.onclick = () => {
        onCampaignEvent(g, 'choice', { allegiance: b.dataset.allegiance });
        Audio.uiClick();
        this._refresh();
      };
    });
    body.querySelectorAll('[data-ending]').forEach((b) => {
      b.onclick = () => {
        onCampaignEvent(g, 'choice', { ending: b.dataset.ending });
        Audio.uiClick();
        this._refresh();
      };
    });
  }
}

export { UPGRADES };
