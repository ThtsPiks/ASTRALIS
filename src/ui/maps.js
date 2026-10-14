// ============================================================================
//  MAPS — orbital system map + galaxy chart
// ============================================================================
import * as THREE from '../../vendor/three/three.module.js';
import { clamp, fmtDist, fmtCredits, TAU, DEG, toRoman } from '../core/utils.js';
import { PLANET_TYPES, STAR_TYPES, ECONOMIES, STATION_KIND_LABEL } from '../world/galaxy.js?v=chart1';
import { flightFeel } from '../world/atmo.js?v=surf1';
import { transitQuote, filamentsFrom } from '../world/universe.js?v=chart1';
import { Audio } from '../core/audio.js';
import { mapStoryHint, mapBodyHint, galaxyOpen, galaxyLockReason, nextStep, travelLegend, sheetAsleep } from '../story/campaign.js?v=finale6';
import { combatRank, tradeRank, exploreRank, circuitHint } from '../game/career.js?v=omega14';
import { transitReport } from '../game/route.js?v=finale6';

function activeRoute(g) {
  return (g?.missions || []).find((m) => !m.story && m.destSystemId && m.destSystemId !== g.system?.id) || null;
}

const WORLD_SHORT = {
  lava: 'Molten', ash: 'Ash', barren: 'Barren', rocky: 'Rocky', rust: 'Iron', desert: 'Desert', toxic: 'Toxic',
  terra: 'Terra', marsh: 'Marsh', ocean: 'Ocean', ice: 'Ice', salt: 'Salt', carbon: 'Carbon', gas: 'Gas', icegiant: 'Ice giant', exotic: 'Exotic',
};

function worldLine(sys, limit = 3) {
  const labels = [];
  for (const p of sys.planets || []) {
    const label = WORLD_SHORT[p.type] || PLANET_TYPES[p.type]?.label;
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels.slice(0, limit).join(' · ');
}

export class MapView {
  constructor(canvas, panel) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.panel = panel;
    this.mode = null;         // 'system' | 'galaxy' | 'universe'
    this.game = null;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.dragging = false;
    this.hover = null;
    this.selected = null;
    this.time = 0;
    this.mouse = { x: 0, y: 0 };
    this._hits = [];
    this._bind();
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('mousedown', (e) => {
      this.dragging = true;
      this._dragStart = { x: e.offsetX, y: e.offsetY, px: this.pan.x, py: this.pan.y };
      this._moved = 0;
    });
    window.addEventListener('mouseup', (e) => {
      const ui = e.target && e.target.closest && e.target.closest('#mapDock, #mapPanel, button, .mbtn, .mp-row');
      if (ui) { this.dragging = false; return; }
      if (this.dragging && this._moved < 5) this._click(e);
      this.dragging = false;
    });
    c.addEventListener('mousemove', (e) => {
      this.mouse.x = e.offsetX; this.mouse.y = e.offsetY;
      if (this.dragging && this._dragStart) {
        const dx = e.offsetX - this._dragStart.x, dy = e.offsetY - this._dragStart.y;
        this._moved = Math.max(this._moved || 0, Math.hypot(dx, dy));
        this.pan.x = this._dragStart.px + dx;
        this.pan.y = this._dragStart.py + dy;
      }
    });
    c.addEventListener('wheel', (e) => {
      if (!this.mode) return;
      e.preventDefault();
      const f = Math.exp(-e.deltaY * 0.0014);
      // Universe/galaxy need a low floor so the full sheet/chart still fits with padding.
      const minZ = this.mode === 'universe' || this.mode === 'galaxy' ? 0.18 : 0.25;
      const maxZ = this.mode === 'universe' ? 8 : 14;
      this.zoom = clamp(this.zoom * f, minZ, maxZ);
    }, { passive: false });
    c.addEventListener('dblclick', (e) => {
      if (!this.mode) return;
      this._click(e);
      this.confirm();
    });
    const dock = document.getElementById('mapDock');
    const dockBtn = document.getElementById('mapConfirmBtn');
    const stop = (e) => { e.stopPropagation(); this.dragging = false; };
    if (dock) {
      dock.addEventListener('pointerdown', stop);
      dock.addEventListener('mousedown', stop);
    }
    if (dockBtn) {
      dockBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dragging = false;
        this.confirm();
      });
    }
  }

  open(mode, game) {
    this.mode = mode;
    this.game = game;
    this.wrap = this.wrap || document.getElementById('mapWrap');
    this.wrap.classList.remove('hidden');
    void this.wrap.offsetWidth;
    if (mode === 'system') {
      this.zoom = 1; this.pan = { x: 0, y: 0 };
      this.selected = game.target && game.target.data ? game.target.data.id : null;
    }
    if (mode === 'universe') {
      this.zoom = 1; this.pan = { x: 0, y: 0 };
      const links = filamentsFrom(game.universe, game.galaxy.id);
      const pick = links.map((f) => (f.a === game.galaxy.id ? f.b : f.a))
        .find((id) => galaxyOpen(game.campaign, id, game.universe.homeId));
      this.selected = pick || game.galaxy.id;
    }
    if (mode === 'galaxy') {
      this.zoom = 1; this.pan = { x: 0, y: 0 };
      const step = nextStep(game);
      const route = activeRoute(game);
      let pick = route?.destSystemId || (step && step.systemId) || game.system.id;
      if (pick === game.system.id) {
        const here = game.system;
        const nxt = [...game.galaxy.systems]
          .filter((s) => s.id !== here.id)
          .sort((a, b) => {
            const da = Math.hypot(a.pos.x - here.pos.x, a.pos.y - here.pos.y, a.pos.z - here.pos.z);
            const db = Math.hypot(b.pos.x - here.pos.x, b.pos.y - here.pos.y, b.pos.z - here.pos.z);
            return da - db;
          })[0];
        if (nxt) pick = nxt.id;
      }
      this.selected = pick;
    }
    this.resize();
    this.updatePanel();
    this._syncDock();
    Audio.uiClick();
  }

  confirm() {
    const g = this.game;
    if (!g || !this.mode) return false;
    g.input?.unlockPointer?.();
    if (this.mode === 'galaxy') {
      let sel = g.galaxy.systems.find((s) => s.id === this.selected);
      if (!sel || sel.id === g.system.id) sel = this._nearestOtherSystem(g);
      if (!sel) {
        g.hud.toast('No other system on this chart', 'bad', 3);
        return false;
      }
      this.selected = sel.id;
      g.jumpToSystem(sel);
      return true;
    }
    if (this.mode === 'universe') {
      let id = this.selected;
      if (!id || id === g.galaxy.id || !galaxyOpen(g.campaign, id, g.universe.homeId)) {
        id = this._nearestOpenGalaxy(g);
      } else if (!transitQuote(g.universe, g.galaxy.id, id, 40)) {
        id = this._nearestOpenGalaxy(g);
      }
      if (!id || id === g.galaxy.id) {
        g.hud.toast('No open neighbour on the Local Sheet', 'bad', 4);
        return false;
      }
      this.selected = id;
      g.jumpToGalaxy(id);
      return true;
    }
    return false;
  }

  _nearestOtherSystem(g) {
    const here = g.system;
    return [...g.galaxy.systems]
      .filter((s) => s.id !== here.id)
      .sort((a, b) => {
        const da = Math.hypot(a.pos.x - here.pos.x, a.pos.y - here.pos.y, a.pos.z - here.pos.z);
        const db = Math.hypot(b.pos.x - here.pos.x, b.pos.y - here.pos.y, b.pos.z - here.pos.z);
        return da - db;
      })[0] || null;
  }

  _nearestOpenGalaxy(g) {
    const links = filamentsFrom(g.universe, g.galaxy.id);
    return links.map((f) => (f.a === g.galaxy.id ? f.b : f.a))
      .find((id) => galaxyOpen(g.campaign, id, g.universe.homeId)) || null;
  }

  close() {
    this.mode = null;
    const w = document.getElementById('mapWrap');
    if (w) w.classList.add('hidden');
  }

  toggle(mode, game) {
    if (this.mode === mode) this.close();
    else this.open(mode, game);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    const r = this.canvas.getBoundingClientRect();
    this.w = r.width; this.h = r.height;
    this.canvas.width = Math.floor(r.width * dpr);
    this.canvas.height = Math.floor(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _click(e) {
    if (!this.mode) return;
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bestD = 26;
    for (const h of this._hits) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < Math.max(bestD, h.r + 6)) { bestD = d; best = h; }
    }
    if (best) {
      const same = this.selected === best.id;
      this.selected = best.id;
      Audio.uiClick();
      if (this.mode === 'system' && best.body) {
        this.game.setTarget(best.body);
      }
      this.updatePanel();
      if (same && (this.mode === 'galaxy' || this.mode === 'universe')) {
        this.confirm();
      }
      return;
    }
    this.updatePanel();
  }

  updatePanel() {
    const g = this.game;
    if (!g) return;
    const p = this.panel;
    if (this.mode === 'system') {
      const sys = g.system;
      let html = `
        <div class="mp-title">${sys.name}</div>
        <div class="mp-sub">${sys.designation} · ${STAR_TYPES[sys.star.type].label} · ${sys.faction.name}</div>
        <div class="mp-grid">
          <div><span>PLANETS</span><b>${sys.planets.length}</b></div>
          <div><span>BELTS</span><b>${sys.belts.length}</b></div>
          <div><span>STATIONS</span><b>${sys.stations.length}</b></div>
          <div><span>DANGER</span><b class="${sys.danger >= 3 ? 'bad' : ''}">${sys.danger}/4</b></div>
          <div><span>COMBAT</span><b>${combatRank(g.stats.kills).name}</b></div>
          <div><span>TRADE</span><b>${tradeRank(g.stats.earned).name}</b></div>
          <div><span>EXPLORE</span><b>${exploreRank(g.stats.scans).name}</b></div>
        </div>
        <div class="mp-sep"></div>
        <div class="mp-list">`;
      html += `<div class="mp-row ${this.selected === sys.id + '-star' ? 'sel' : ''}" data-id="${sys.id}-star">
          <i style="background:${sys.star.hex}"></i><span>${sys.star.name}</span><em>STAR</em></div>`;
      for (const pl of sys.planets) {
        html += this._planetRow(pl, g);
        for (const m of pl.moons) html += this._planetRow(m, g, true);
      }
      for (const s of sys.stations) {
        html += `<div class="mp-row ${this.selected === s.id ? 'sel' : ''}" data-id="${s.id}">
          <i style="background:${s.kind === 'hub_refinery' ? '#ff9a4d' : s.kind === 'hub_survey' ? '#7ec8ff' : '#7dffb0'}"></i><span>${s.name}</span><em>${STATION_KIND_LABEL[s.kind] || ECONOMIES[s.economy].label}</em></div>`;
      }
      for (const b of sys.belts) {
        html += `<div class="mp-row ${this.selected === b.id ? 'sel' : ''}" data-id="${b.id}">
          <i style="background:#c8a97a"></i><span>${b.name}</span><em>BELT</em></div>`;
      }
      for (const w of sys.wrecks) {
        const wh = mapBodyHint(g, w);
        html += `<div class="mp-row ${this.selected === w.id ? 'sel' : ''}" data-id="${w.id}">
          <i style="background:#ff9d5c"></i><span>${w.name}${wh ? ' ★' : ''}</span><em>${wh || 'WRECK'}</em></div>`;
      }
      html += `</div>`;
      html += this._detailBlock();
      p.innerHTML = html;
    } else if (this.mode === 'universe') {
      p.innerHTML = this._universePanel();
    } else {
      const gal = g.galaxy;
      const step = nextStep(g);
      const route = activeRoute(g);
      let html = `<div class="mp-title">${gal.name}</div>
        <div class="mp-sub">${travelLegend(g.campaign)}</div>
        <div class="mp-hint">${step.how}</div>
        <div class="mp-list">`;
      const sorted = [...gal.systems].sort((a, b) => {
        const da = Math.hypot(a.pos.x - g.system.pos.x, a.pos.y - g.system.pos.y, a.pos.z - g.system.pos.z);
        const db = Math.hypot(b.pos.x - g.system.pos.x, b.pos.y - g.system.pos.y, b.pos.z - g.system.pos.z);
        return da - db;
      });
      for (const s of sorted) {
        const d = Math.hypot(s.pos.x - g.system.pos.x, s.pos.y - g.system.pos.y, s.pos.z - g.system.pos.z);
        const ly = d / 100;
        const routeTarget = route?.destSystemId === s.id;
        const known = s.discovered || routeTarget;
        const inR = ly <= g.jumpRangeLy;
        const hub = known && (s.stations || []).find((st) => String(st.kind || '').startsWith('hub_'));
        const hubTag = hub ? ` · ${STATION_KIND_LABEL[hub.kind] || 'HUB'}` : '';
        const skies = known ? worldLine(s, 2) : '';
        html += `<div class="mp-row ${this.selected === s.id ? 'sel' : ''} ${s.id === g.system.id ? 'cur' : ''}" data-id="${s.id}">
          <i style="background:${known ? s.star.hex : '#4a5563'}"></i>
          <span>${known ? s.name : 'Uncharted System'}${s.storyTag ? ' ★' : ''}</span>
          <em>${d < 1 ? 'CURRENT' : ly.toFixed(1) + ' ly · ' + (inR ? 'IN RANGE' : 'NO RANGE')}${skies ? ' · ' + skies : ''}${routeTarget ? ' · CONTRACT DESTINATION' : ''}${hubTag}${mapStoryHint(g, s) ? ' · ' + mapStoryHint(g, s) : ''}</em></div>`;
      }
      html += `</div>`;
      const sel = gal.systems.find((s) => s.id === this.selected);
      if (sel) {
        const routeTarget = route?.destSystemId === sel.id;
        const revealed = sel.discovered || routeTarget;
        const qj = g.jumpQuote(sel);
        const d = qj.here ? 0 : qj.d;
        const ly = qj.here ? 0 : qj.ly;
        const inRange = qj.here || qj.inRange;
        const fuelCost = qj.here ? 0 : (qj.hopOk ? qj.hopFuel : qj.fuelCost);
        const story = mapStoryHint(g, sel);
        const label = qj.here
          ? 'YOU ARE HERE'
          : qj.hopOk ? `CONFIRM JUMP · RELAY ${qj.hop.name.toUpperCase()}`
          : qj.inRange ? `CONFIRM JUMP · ${sel.name.toUpperCase()}`
          : 'OUT OF DRIVE RANGE';
        html += `<div class="mp-detail">
          <div class="mp-dtitle">${revealed ? sel.name : 'UNKNOWN SYSTEM'}</div>
          <div class="mp-dsub">${revealed ? sel.designation : 'Long-range sensors only'}${routeTarget ? ' · CONTRACT DESTINATION' : ''}${story ? ' · ' + story : ''}</div>
          ${revealed ? `<div class="mp-drow"><span>Faction</span><b style="color:${sel.faction.color}">${sel.faction.name}</b></div>
          <div class="mp-drow"><span>Star</span><b>${STAR_TYPES[sel.star.type].label} · ${sel.star.temp}K</b></div>
          <div class="mp-drow"><span>Worlds</span><b>${worldLine(sel) || '—'}</b></div>
          <div class="mp-drow"><span>Bodies</span><b>${sel.planets.length} planets${sel.belts?.length ? ` · ${sel.belts.length} belt` : ''}</b></div>
          <div class="mp-drow"><span>Hub</span><b>${(sel.stations || []).filter((st) => String(st.kind).startsWith('hub_')).map((st) => STATION_KIND_LABEL[st.kind] || st.kind).join(' · ') || 'none'}</b></div>
          <div class="mp-drow"><span>Danger</span><b class="${sel.danger >= 3 ? 'bad' : ''}">${sel.danger}/4</b></div>
          ${(sel.stations || []).find((st) => st.routeHint) ? `<p class="mp-hint">${((sel.stations || []).find((st) => st.routeHint) || {}).routeHint}</p>` : ((sel.stations || []).some((st) => String(st.kind).startsWith('hub_')) ? `<p class="mp-hint">${circuitHint((sel.stations || []).find((st) => String(st.kind).startsWith('hub_')), g.galaxy?.hubs || [])}</p>` : '')}` : ''}
          <div class="mp-drow"><span>Distance</span><b>${d < 1 ? '—' : ly.toFixed(2) + ' ly'}</b></div>
          <div class="mp-drow"><span>Drive range</span><b class="${inRange ? 'good' : 'bad'}">${g.jumpRangeLy.toFixed(1)} ly</b></div>
          <div class="mp-drow"><span>Fuel cost</span><b>${d < 1 ? '—' : fuelCost + ' u'}</b></div>
          <div class="mp-drow"><span>Return</span><b>${d < 1 ? '—' : ((g.ship?.fuel || 0) >= fuelCost * 2 ? 'Reserve covers a hop back' : 'Return not confirmed')}</b></div>
          ${qj.hopOk ? `<p class="mp-hint">Too far for one shot. Confirm hops via ${qj.hop.name} (${qj.hopLy.toFixed(1)} ly).</p>` : ''}
          <button class="mp-btn mp-confirm" id="jumpBtn" ${qj.here ? 'disabled' : ''}>
            ${label}
          </button>
          <p class="mp-hint">Enter also confirms.</p>
        </div>`;
      }
      p.innerHTML = html;
      const jb = p.querySelector('#jumpBtn');
      if (jb) jb.onclick = () => this.confirm();
    }
    // row click handlers
    p.querySelectorAll('.mp-row').forEach((row) => {
      row.onclick = () => {
        this.selected = row.dataset.id;
        Audio.uiClick();
        if (this.mode === 'system') {
          const b = this.game.bodies.find((x) => x.data && x.data.id === this.selected);
          if (b) this.game.setTarget(b);
        }
        this.updatePanel();
      };
    });
    const gb = p.querySelector('#galJumpBtn');
    if (gb) gb.onclick = () => this.confirm();
    this._syncDock();
  }

  _syncDock() {
    const btn = document.getElementById('mapConfirmBtn');
    const keyEl = document.getElementById('mapConfirmKey');
    const labelEl = document.getElementById('mapConfirmLabel');
    const hintEl = document.getElementById('mapDockHint');
    if (!btn || !labelEl || !hintEl) return;
    const g = this.game;
    btn.disabled = false;
    btn.classList.toggle('primary', this.mode === 'galaxy' || this.mode === 'universe');
    if (keyEl) keyEl.textContent = this.mode === 'universe' ? 'U' : this.mode === 'galaxy' ? 'G' : 'M';
    if (!g || this.mode === 'system' || !this.mode) {
      btn.disabled = true;
      labelEl.textContent = 'ORBITAL CHART';
      hintEl.textContent = 'G jumps stars in this galaxy · U other galaxies · Esc closes';
      return;
    }
    if (this.mode === 'galaxy') {
      let sel = g.galaxy.systems.find((s) => s.id === this.selected);
      if (!sel || sel.id === g.system.id) sel = this._nearestOtherSystem(g);
      if (!sel) {
        btn.disabled = true;
        labelEl.textContent = 'NO DESTINATION';
        hintEl.textContent = 'This chart has no other star';
        return;
      }
      const qj = g.jumpQuote(sel);
      // A contract supplies a navigation packet, so its destination must use
      // the same known name everywhere on the map, including this action.
      const isContractDestination = activeRoute(g)?.destSystemId === sel.id;
      const name = sel.discovered || isContractDestination ? sel.name : 'Uncharted';
      labelEl.textContent = qj.here
        ? 'YOU ARE HERE'
        : qj.hopOk
          ? `CONFIRM JUMP  ·  ${name.toUpperCase()} VIA ${qj.hop.name.toUpperCase()}`
          : qj.inRange
            ? `CONFIRM JUMP  ·  ${name.toUpperCase()}`
            : 'OUT OF DRIVE RANGE';
      const blocked = !qj.here && !qj.inRange && !qj.hopOk;
      btn.disabled = blocked;
      hintEl.textContent = blocked
        ? 'That star is past the drive. Pick a relay inside range.'
        : 'Enter also confirms · click the same star twice';
      return;
    }
    let sel = g.universe?.galaxies.find((x) => x.id === this.selected);
    if (!sel || sel.id === g.galaxy.id || !galaxyOpen(g.campaign, sel.id, g.universe.homeId)) {
      const nid = this._nearestOpenGalaxy(g);
      sel = nid ? g.universe.galaxies.find((x) => x.id === nid) : null;
    }
    if (!sel) {
      btn.disabled = true;
      labelEl.textContent = 'NO OPEN NEIGHBOUR';
      hintEl.textContent = 'Buy a chart at this galaxy’s observatory';
      return;
    }
    const locked = !galaxyOpen(g.campaign, sel.id, g.universe.homeId);
    if (locked) {
      btn.disabled = true;
      labelEl.textContent = `LOCKED  ·  ${sel.name.toUpperCase()}`;
      hintEl.textContent = galaxyLockReason(g.campaign, sel.id, g.universe.homeId) || 'Finish the job in Aetheria first';
      return;
    }
    labelEl.textContent = `CONFIRM TRANSIT  ·  ${sel.name.toUpperCase()}`;
    hintEl.textContent = 'Enter also confirms · click the same galaxy twice';
  }

  _universePanel() {
    const g = this.game, u = g.universe;
    if (!u) return `<div class="mp-title">LOCAL SHEET</div>`;
    const ready = g.inFilamentReady();
    let html = `<div class="mp-title">LOCAL SHEET · OTHER GALAXIES</div>
      <div class="mp-sub">${travelLegend(g.campaign)}</div>
      <div class="mp-hint"><b>G</b> jumps stars in this galaxy. <b>U</b> other galaxies. A galaxy stays locked until you buy its chart at a neighbouring observatory. Choir Void still waits on the ending. The Veil is the anchor.</div>
      <div class="mp-drow"><span>Drive</span><b class="${ready ? '' : 'bad'}">${ready ? 'READY' : 'LEAVE ATMO / STAR CORONA'}</b></div>
      <div class="mp-list">`;
    for (const gal of u.galaxies) {
      const open = galaxyOpen(g.campaign, gal.id, u.homeId);
      html += `<div class="mp-row ${this.selected === gal.id ? 'sel' : ''} ${gal.id === g.galaxy.id ? 'cur' : ''} ${open ? '' : 'lock'}" data-id="${gal.id}">
        <i style="background:${open ? (gal.tint || '#5fd8ff') : '#4a5563'}"></i>
        <span>${gal.id === g.galaxy.id ? gal.name : (open ? gal.name : gal.name + ' · LOCKED')}</span>
        <em>${gal.id === g.galaxy.id ? 'YOU ARE HERE' : open ? (gal.type + ' · ' + gal.systems.length + ' sys') : (gal.id === 'choir' ? 'after the job' : gal.id === 'veil' ? 'anchor' : 'buy chart')}</em></div>`;
    }
    html += `</div>`;
    const sel = u.galaxies.find((x) => x.id === this.selected) || g.galaxy;
    const q = sel && sel.id !== g.galaxy.id ? transitQuote(u, g.galaxy.id, sel.id, 40) : null;
    html += `<div class="mp-detail">
      <div class="mp-dtitle">${sel.discovered || sel.id === g.galaxy.id ? sel.name : 'UNRESOLVED'}</div>
      <div class="mp-dsub">${sel.type} · κ=${sel.curvature}</div>
      <p style="font-size:12px;color:var(--text-dim);margin:8px 0">${sel.blurb || ''}</p>
      <div class="mp-drow"><span>Systems</span><b>${sel.systems.length}</b></div>
      <div class="mp-drow"><span>Worlds here</span><b>${(sel.worlds || []).join(' · ') || '—'}</b></div>
      <div class="mp-drow"><span>Planets</span><b>${sel.totalPlanets}</b></div>
      <div class="mp-drow"><span>Moons</span><b>${sel.totalMoons}</b></div>`;
    const locked = sel && !galaxyOpen(g.campaign, sel.id, u.homeId);
    const whyLock = locked ? galaxyLockReason(g.campaign, sel.id, u.homeId) : '';
    const report = sel && sel.id !== g.galaxy.id ? transitReport(g, sel.id) : null;
    if (q) {
      html += `<div class="mp-drow"><span>Story</span><b>${report?.storyOk ? 'OPEN' : 'CLOSED'}</b></div>
        <div class="mp-drow"><span>Science</span><b>${report?.scienceOk ? 'OPEN' : 'NOT READY'}</b></div>
        <div class="mp-drow"><span>Ship</span><b>${report?.shipOk ? 'CAN PAY' : 'SHORT'}</b></div>
        <p class="mp-hint">${report?.story || ''} ${report?.science || ''} ${report?.ship || ''}</p>
        <div class="mp-drow"><span>Filament</span><b>${q.fil.dMly} Mly · κ ${q.fil.curvature}</b></div>
        <div class="mp-drow"><span>Fuel / charge</span><b>${report?.fuelNeed ?? q.fuel} u · ${q.chargeS.toFixed(1)} s</b></div>
        <div class="mp-drow"><span>Tidal load</span><b>${q.tidalG} g</b></div>
        <div class="mp-drow"><span>Drop</span><b>target halo ~${q.dropHaloAu} AU</b></div>
        ${whyLock ? `<p class="mp-hint">${whyLock}</p>` : ''}
        <button class="mp-btn mp-confirm" id="galJumpBtn" ${locked || sel.id === g.galaxy.id ? 'disabled' : ''}>
          ${locked ? 'LOCKED' : !q.legal ? `CONFIRM TRANSIT · ${sel.name.toUpperCase()}` : `CONFIRM TRANSIT · ${sel.name.toUpperCase()}`}
        </button>
        <p class="mp-hint">Enter also confirms.</p>`;
    } else if (sel.id === g.galaxy.id) {
      html += `<p class="mp-hint">${ready
        ? 'You are here. Click a neighbour, then press the yellow CONFIRM TRANSIT at the bottom.'
        : 'You are here. Leave atmosphere or the star corona, then pick a neighbour.'}</p>`;
    } else {
      html += `<p class="mp-hint">No direct filament from here. Ride a neighbour first, then hop the web.</p>`;
    }
    html += `</div>`;
    return html;
  }

  _planetRow(pl, g, isMoon = false) {
    const def = PLANET_TYPES[pl.type];
    const col = def.colors[2];
    const known = pl.discovered || pl.scanned;
    const story = mapBodyHint(g, pl);
    return `<div class="mp-row ${isMoon ? 'sub' : ''} ${this.selected === pl.id ? 'sel' : ''}" data-id="${pl.id}">
      <i style="background:${known ? col : '#4a5563'}"></i>
      <span>${known ? pl.name : pl.name + ' ··?'}${story ? ' ★' : ''}</span>
      <em>${story || (known ? def.label : 'UNSCANNED')}</em></div>`;
  }

  _detailBlock() {
    const g = this.game;
    const sys = g.system;
    let obj = null;
    if (this.selected === sys.id + '-star') obj = { kind: 'star', data: sys.star };
    else {
      const b = g.bodies.find((x) => x.data && x.data.id === this.selected);
      if (b) obj = b;
    }
    if (!obj) return `<div class="mp-detail"><div class="mp-dsub">Select a body on the chart or in the list.</div></div>`;
    const d = obj.kind === 'star' ? null : obj.data;
    if (obj.kind === 'star') {
      const st = obj.data;
      return `<div class="mp-detail">
        <div class="mp-dtitle">${st.name}</div><div class="mp-dsub">${STAR_TYPES[st.type].label}</div>
        <div class="mp-drow"><span>Temperature</span><b>${st.temp} K</b></div>
        <div class="mp-drow"><span>Radius</span><b>${fmtDist(st.radius)}</b></div>
        <div class="mp-drow"><span>Luminosity</span><b>${st.lum.toFixed(2)} L☉</b></div>
      </div>`;
    }
    if (obj.kind === 'station') {
      const s = obj.data;
      const hint = circuitHint(s, g.galaxy?.hubs || []);
      return `<div class="mp-detail">
        <div class="mp-dtitle">${s.name}</div>
        <div class="mp-dsub">${ECONOMIES[s.economy].label} · ${STATION_KIND_LABEL[s.kind] || s.kind}</div>
        <div class="mp-drow"><span>Population</span><b>${s.population.toLocaleString('en-US')}</b></div>
        <div class="mp-drow"><span>Services</span><b>${Object.entries(s.services).filter(([, v]) => v).map(([k]) => k).join(', ')}</b></div>
        <p class="mp-hint">${s.routeHint || hint}</p>
        <button class="mp-btn" id="setTargetBtn">SET AS TARGET</button>
      </div>`;
    }
    if (obj.kind === 'belt') {
      const b = obj.data;
      return `<div class="mp-detail">
        <div class="mp-dtitle">${b.name}</div><div class="mp-dsub">Asteroid belt</div>
        <div class="mp-drow"><span>Radius</span><b>${fmtDist(b.radius)}</b></div>
        <div class="mp-drow"><span>Richness</span><b>${Math.round(b.richness * 100)}%</b></div>
        <div class="mp-drow"><span>Main ore</span><b>${b.composition}</b></div>
      </div>`;
    }
    // planet / moon / wreck
    const known = d.scanned || d.discovered;
    const def = PLANET_TYPES[d.type];
    if (!known) {
      return `<div class="mp-detail">
        <div class="mp-dtitle">${d.name}</div>
        <div class="mp-dsub">No detailed survey on record</div>
        <div class="mp-drow"><span>Orbit</span><b>${fmtDist(d.orbitRadius || 0)}</b></div>
        <div class="mp-drow"><span>Est. value</span><b>${fmtCredits(d.value || 0)} CR</b></div>
        <div class="mp-hint">${d.pinged ? 'Hold <b>F</b> in deep-survey range and dwell — planet limb will occlude the return.' : 'Hold <b>F</b> to ping (lidar), then keep holding to dwell a deep survey. Not instant. Range drops in silent running / heat bloom.'}</div>
      </div>`;
    }
    return `<div class="mp-detail">
      <div class="mp-dtitle">${d.name}</div>
      <div class="mp-dsub">${def ? def.label : 'Wreck'}${d.hasLife ? ' · LIFE SIGNATURES' : ''}</div>
      <div class="mp-drow"><span>Radius</span><b>${fmtDist(d.radius)}</b></div>
      <div class="mp-drow"><span>Gravity</span><b>${d.gravity} g${d.physics ? ` · vesc ${d.physics.vEscKmS} km/s` : ''}</b></div>
      <div class="mp-drow"><span>Flight</span><b>${flightFeel(d.type, d.physics).hud}</b></div>
      <div class="mp-drow"><span>Surface Teq</span><b>${d.physics ? d.physics.teq : d.temp} K · ${d.physics ? d.physics.climate : ''}</b></div>
      ${d.physics ? `<div class="mp-drow"><span>Mass / orbit</span><b>${d.physics.massEarth} M⊕ · ${d.physics.aAu.toFixed(2)} AU · P ${d.physics.periodDays} d</b></div>
      <div class="mp-drow"><span>Hill / H</span><b>${d.physics.hillAu} AU · ${d.physics.scaleHeightKm} km</b></div>
      <div class="mp-drow"><span>Albedo / μ</span><b>${d.physics.albedo} · μ=${d.physics.mu}</b></div>` : ''}
      <div class="mp-drow"><span>Moons</span><b>${d.moons ? d.moons.length : 0}</b></div>
      <div class="mp-drow"><span>Atmosphere</span><b>${d.atmo ? 'Present' : 'None'}</b></div>
      <div class="mp-drow"><span>Composition</span><b>${(d.composition || []).join(', ')}</b></div>
      ${d.hasLife ? `<div class="mp-drow"><span>Biosphere</span><b class="good">${d.lifeForm}</b></div>` : ''}
      <div class="mp-drow"><span>Survey value</span><b class="good">${fmtCredits(d.value)} CR</b></div>
      <button class="mp-btn" id="setTargetBtn">SET AS TARGET</button>
    </div>`;
  }

  // ------------------------------------------------------------------ draw
  draw(dt) {
    if (!this.mode || !this.game) return;
    if (!this.w || this.w < 8) this.resize();
    const c = this.ctx;
    const { w, h } = this;
    this.time += dt;
    c.clearRect(0, 0, w, h);
    this._hits = [];
    // backdrop
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, 'rgba(10,22,34,0.92)');
    g.addColorStop(1, 'rgba(3,7,12,0.96)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // grid
    c.strokeStyle = 'rgba(95,216,255,0.05)';
    c.lineWidth = 1;
    const step = 48;
    for (let x = (this.pan.x % step); x < w; x += step) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    for (let y = (this.pan.y % step); y < h; y += step) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }

    if (this.mode === 'system') this.drawSystem();
    else if (this.mode === 'universe') this.drawUniverse();
    else this.drawGalaxy();

    // hover tooltip
    const hv = this._hits.find((x) => Math.hypot(x.x - this.mouse.x, x.y - this.mouse.y) < Math.max(12, x.r + 4));
    if (hv && hv.label) {
      c.font = '600 12px Rajdhani, sans-serif';
      const tw = c.measureText(hv.label).width + 16;
      c.fillStyle = 'rgba(4,12,20,0.9)';
      c.fillRect(this.mouse.x + 14, this.mouse.y - 24, tw, 20);
      c.strokeStyle = 'rgba(95,216,255,0.5)';
      c.strokeRect(this.mouse.x + 14.5, this.mouse.y - 23.5, tw - 1, 19);
      c.fillStyle = '#eaf6ff';
      c.textAlign = 'left';
      c.fillText(hv.label, this.mouse.x + 22, this.mouse.y - 10);
    }

    // header
    c.textAlign = 'left';
    c.font = '700 13px Orbitron, sans-serif';
    c.fillStyle = 'rgba(95,216,255,0.9)';
    c.fillText(this.mode === 'system' ? 'ORBITAL CHART' : this.mode === 'universe' ? 'LOCAL SHEET · UNIVERSE' : 'GALAXY CHART', 22, 30);
    c.font = '600 13px Share Tech Mono, monospace';
    c.fillStyle = 'rgba(255,210,120,0.95)';
    c.fillText(this.mode === 'universe'
      ? 'Click a galaxy, then CONFIRM TRANSIT under the chart'
      : this.mode === 'galaxy'
        ? 'Click a star, then CONFIRM JUMP under the chart'
        : 'DRAG · PAN    WHEEL · ZOOM    Esc closes', 22, 48);
  }

  drawSystem() {
    const c = this.ctx, g = this.game, sys = g.system;
    const cx = this.w / 2 + this.pan.x, cy = this.h / 2 + this.pan.y;
    let maxR = 0;
    for (const p of sys.planets) maxR = Math.max(maxR, p.orbitRadius + p.radius);
    for (const b of sys.belts) maxR = Math.max(maxR, b.radius + b.width);
    for (const s of sys.stations) maxR = Math.max(maxR, s.orbitRadius);
    const base = Math.min(this.w, this.h) * 0.44 / Math.max(maxR, 1);
    const k = base * this.zoom;

    // orbits
    for (const p of sys.planets) {
      c.beginPath();
      c.ellipse(cx, cy, p.orbitRadius * k, p.orbitRadius * k * Math.cos(p.inclination), 0, 0, TAU);
      c.strokeStyle = this.selected === p.id ? 'rgba(255,194,77,0.55)' : 'rgba(95,216,255,0.14)';
      c.lineWidth = this.selected === p.id ? 1.6 : 1;
      c.stroke();
    }
    for (const s of sys.stations) {
      c.beginPath();
      c.ellipse(cx, cy, s.orbitRadius * k, s.orbitRadius * k, 0, 0, TAU);
      c.strokeStyle = 'rgba(125,255,176,0.12)';
      c.setLineDash([3, 6]); c.lineWidth = 1; c.stroke(); c.setLineDash([]);
    }
    // belts
    for (const b of sys.belts) {
      c.beginPath();
      c.ellipse(cx, cy, b.radius * k, b.radius * k, 0, 0, TAU);
      c.strokeStyle = 'rgba(200,169,122,0.3)';
      c.lineWidth = Math.max(1.5, b.width * k * 0.7);
      c.globalAlpha = 0.35; c.stroke(); c.globalAlpha = 1;
    }

    // star
    const sr = Math.max(7, sys.star.radius * k);
    const grad = c.createRadialGradient(cx, cy, 0, cx, cy, sr * 3.4);
    grad.addColorStop(0, sys.star.hex);
    grad.addColorStop(0.22, sys.star.hex + 'aa');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = grad;
    c.beginPath(); c.arc(cx, cy, sr * 3.4, 0, TAU); c.fill();
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(cx, cy, sr * 0.6, 0, TAU); c.fill();
    this._hits.push({ x: cx, y: cy, r: sr, id: sys.id + '-star', label: sys.star.name });

    // planets & moons & stations
    const tmp = new THREE.Vector3();
    for (const rt of g.bodies) {
      if (rt.kind === 'star') continue;
      g.systemScene.getPos(rt, tmp);
      const x = cx + tmp.x * k, y = cy + tmp.z * k;
      if (x < -200 || x > this.w + 200 || y < -200 || y > this.h + 200) continue;
      const known = rt.data.discovered || rt.data.scanned || rt.kind === 'station';
      let r = Math.max(2.4, Math.log(rt.radius + 1) * 1.5 * Math.min(this.zoom, 3));
      let col = known ? (PLANET_TYPES[rt.data.type]?.colors[2] || '#9fd8ff') : '#5b6b7d';
      if (rt.kind === 'station') { col = '#7dffb0'; r = 4.5; }
      if (rt.kind === 'wreck') { col = '#ff9d5c'; r = 4; }
      if (rt.kind === 'comet') { col = '#bfeaff'; r = 3.4; }
      const isSel = this.selected === rt.data.id;
      const isTgt = g.target === rt;
      if (isTgt || isSel) {
        c.strokeStyle = isTgt ? '#ffc24d' : 'rgba(95,216,255,0.7)';
        c.lineWidth = 1.4;
        const rr = r + 7 + Math.sin(this.time * 3) * 1.2;
        c.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          c.moveTo(x + sx * rr, y + sy * rr - sy * 5); c.lineTo(x + sx * rr, y + sy * rr); c.lineTo(x + sx * rr - sx * 5, y + sy * rr);
        }
        c.stroke();
      }
      const storyH = mapBodyHint(g, rt.data);
      if (storyH) {
        c.strokeStyle = '#c98aff'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(x, y, r + 11 + Math.sin(this.time * 4) * 2, 0, TAU); c.stroke();
        c.font = '700 9px Orbitron, sans-serif';
        c.fillStyle = '#c98aff';
        c.textAlign = 'left';
        c.fillText(storyH, x + r + 6, y - 8);
      }
      c.fillStyle = col;
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      if (rt.kind === 'planet' && rt.data.rings) {
        c.strokeStyle = col; c.globalAlpha = 0.6; c.lineWidth = 1;
        c.beginPath(); c.ellipse(x, y, r * 2.1, r * 0.7, 0.4, 0, TAU); c.stroke(); c.globalAlpha = 1;
      }
      if (known) {
        c.font = '500 10px Rajdhani, sans-serif';
        c.fillStyle = 'rgba(190,230,255,0.65)';
        c.textAlign = 'left';
        c.fillText(rt.data.name, x + r + 6, y + 3.5);
      }
      this._hits.push({ x, y, r, id: rt.data.id, body: rt, label: `${known ? rt.data.name : 'Unidentified'} · ${fmtDist(tmp.distanceTo(g.ship.position))}` });
    }

    // player
    const pp = g.ship.position;
    const px = cx + pp.x * k, py = cy + pp.z * k;
    const fwd = g.ship.forward;
    const ang = Math.atan2(fwd.x, -fwd.z);
    c.save();
    c.translate(px, py); c.rotate(-ang + Math.PI);
    c.fillStyle = '#ffffff';
    c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(0, 3); c.lineTo(-5, 6); c.closePath(); c.fill();
    c.restore();
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.beginPath(); c.arc(px, py, 12 + Math.sin(this.time * 4) * 2, 0, TAU); c.stroke();

    for (const m of (g.missions || [])) {
      if (m.destId && g.systemScene) {
        const st = g.bodies.find((b) => b.kind === 'station' && b.data.id === m.destId);
        if (!st) continue;
        g.systemScene.getPos(st, tmp);
        const mx = cx + tmp.x * k, my = cy + tmp.z * k;
        c.strokeStyle = '#ffc24d'; c.globalAlpha = 0.8; c.lineWidth = 1.4;
        c.beginPath(); c.arc(mx, my, 9 + Math.sin(this.time * 5) * 2, 0, TAU); c.stroke();
        c.globalAlpha = 1;
        c.font = '700 9px Rajdhani, sans-serif'; c.fillStyle = '#ffc24d';
        c.fillText('JOB', mx + 10, my - 6);
      }
    }
  }

  drawGalaxy() {
    const c = this.ctx, g = this.game, gal = g.galaxy;
    const step = nextStep(g);
    const route = activeRoute(g);
    const cx = this.w / 2 + this.pan.x, cy = this.h / 2 + this.pan.y;
    let maxR = 1;
    for (const s of gal.systems) {
      const sx = Math.abs(s.pos.x);
      const sy = Math.abs(s.pos.z * 0.86 + s.pos.y * 0.3);
      maxR = Math.max(maxR, Math.hypot(sx, sy));
    }
    const k = (Math.min(this.w, this.h) * 0.40 / maxR) * this.zoom;

    const proj = (p) => ({ x: cx + p.x * k, y: cy + p.z * k * 0.86 + p.y * k * 0.3 });

    // galactic haze
    const grad = c.createRadialGradient(cx, cy, 0, cx, cy, maxR * k * 1.1);
    grad.addColorStop(0, 'rgba(80,120,200,0.14)');
    grad.addColorStop(0.6, 'rgba(60,80,160,0.06)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = grad;
    c.beginPath(); c.arc(cx, cy, maxR * k * 1.1, 0, TAU); c.fill();

    // links
    for (const s of gal.systems) {
      const a = proj(s.pos);
      for (const lid of s.links) {
        const o = gal.systems.find((x) => x.id === lid);
        if (!o) continue;
        const b = proj(o.pos);
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y);
        c.strokeStyle = 'rgba(95,216,255,0.09)'; c.lineWidth = 1; c.stroke();
      }
    }

    for (const s of gal.systems) {
      const p = proj(s.pos);
      const cur = s.id === g.system.id;
      const routeTarget = route?.destSystemId === s.id;
      const known = s.discovered || routeTarget;
      const sel = this.selected === s.id;
      const baseR = ({ WD: 3.4, M: 4.4, K: 5.2, G: 5.8, F: 6.4, A: 7.2, B: 8.6, RG: 11.5 }[s.star.type] || 5.5);
      const r = cur ? baseR + 1.6 : baseR;
      if (cur) {
        const pulse = 14 + Math.sin(this.time * 3) * 5;
        c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 1.4;
        c.beginPath(); c.arc(p.x, p.y, pulse, 0, TAU); c.stroke();
        c.beginPath(); c.arc(p.x, p.y, pulse + 6, 0, TAU);
        c.strokeStyle = 'rgba(255,255,255,0.2)'; c.stroke();
      }
      if (sel) {
        c.strokeStyle = '#ffc24d'; c.lineWidth = 1.6;
        c.beginPath(); c.arc(p.x, p.y, r + 8, 0, TAU); c.stroke();
      }
      const gl = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.2);
      const col = known ? s.star.hex : '#4a5563';
      gl.addColorStop(0, col);
      gl.addColorStop(0.45, col + '88');
      gl.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gl;
      c.beginPath(); c.arc(p.x, p.y, r * 3.2, 0, TAU); c.fill();
      c.fillStyle = col;
      c.beginPath(); c.arc(p.x, p.y, r * 0.7, 0, TAU); c.fill();
      c.fillStyle = known ? 'rgba(255,255,255,0.9)' : '#7b8798';
      c.beginPath(); c.arc(p.x - r * 0.16, p.y - r * 0.16, r * 0.22, 0, TAU); c.fill();
      if (known && s.planets.length) {
        const orbit = r + 10;
        s.planets.forEach((pl, i) => {
          const a = -Math.PI * 0.5 + (i / s.planets.length) * TAU;
          const x = p.x + Math.cos(a) * orbit;
          const y = p.y + Math.sin(a) * orbit * 0.62;
          const giant = pl.type === 'gas' || pl.type === 'icegiant' || pl.type === 'exotic';
          const pr = giant ? 3.4 : Math.max(1.7, Math.min(2.8, Math.log(pl.radius + 1) * 0.55));
          const pc = PLANET_TYPES[pl.type]?.colors[2] || '#9fd8ff';
          c.fillStyle = pc;
          c.beginPath(); c.arc(x, y, pr, 0, TAU); c.fill();
          if (pl.rings || giant) {
            c.strokeStyle = pc;
            c.globalAlpha = 0.75;
            c.lineWidth = 1;
            c.beginPath(); c.ellipse(x, y, pr * 2.1, pr * 0.65, 0.6, 0, TAU); c.stroke();
            c.globalAlpha = 1;
          }
        });
      }
      if (known) {
        c.strokeStyle = s.faction.color; c.lineWidth = 1.4;
        c.beginPath(); c.arc(p.x, p.y, r * 0.95, 0, TAU); c.stroke();
      }
      const job = routeTarget || (g.missions || []).some((m) => m.targetSystemId === s.id || m.destSystem === s.name);
      const isNext = step && step.systemId === s.id && !cur;
      if (isNext) {
        const pulse = 16 + Math.sin(this.time * 4) * 4;
        c.strokeStyle = 'rgba(255,194,77,0.95)'; c.lineWidth = 2.2;
        c.beginPath(); c.arc(p.x, p.y, pulse, 0, TAU); c.stroke();
        c.strokeStyle = 'rgba(201,138,255,0.55)'; c.lineWidth = 1.2;
        c.beginPath(); c.arc(p.x, p.y, pulse + 7, 0, TAU); c.stroke();
      } else if (job) {
        c.strokeStyle = '#ffc24d'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(p.x, p.y, r + 12, 0, TAU); c.stroke();
      }
      c.font = cur ? '700 12px Orbitron, sans-serif' : '600 11px Rajdhani, sans-serif';
      c.fillStyle = cur ? '#ffffff' : known ? 'rgba(190,230,255,0.8)' : 'rgba(150,165,185,0.45)';
      c.textAlign = 'center';
      const hint = mapStoryHint(g, s);
      c.fillText(known || cur ? s.name : '???', p.x, p.y - r - (known && s.planets.length ? 18 : 8));
      const skies = known ? worldLine(s, 2) : '';
      if (skies) {
        c.fillStyle = 'rgba(186,214,236,0.72)';
        c.font = '600 9px Rajdhani, sans-serif';
        c.fillText(skies, p.x, p.y + r + 16);
      }
      const tagY = p.y + r + (skies ? 28 : 14);
      if (routeTarget) {
        c.fillStyle = '#ffc24d';
        c.font = '700 8px Orbitron, sans-serif';
        c.fillText('CONTRACT', p.x, tagY);
      }
      if (hint) {
        c.fillStyle = '#c98aff';
        c.font = '700 8px Orbitron, sans-serif';
        c.fillText(hint.replace('CAMPAIGN · ', ''), p.x, tagY);
      }
      this._hits.push({ x: p.x, y: p.y, r: r + (s.planets.length ? 16 : 6), id: s.id, label: known || cur ? `${s.name}${skies ? ' · ' + skies : ''}` : 'Uncharted' });
    }
  }

  drawUniverse() {
    const c = this.ctx, g = this.game, u = g.universe;
    if (!u) return;
    const cx = this.w / 2 + this.pan.x, cy = this.h / 2 + this.pan.y;
    // Fit against the same foreshortened coords proj() uses — no post-scale
    // multipliers (those used to throw every galaxy except origin off-screen).
    let maxR = 1;
    for (const gal of u.galaxies) {
      const sx = Math.abs(gal.pos.x);
      const sy = Math.abs(gal.pos.z * 0.86 + gal.pos.y * 0.3);
      maxR = Math.max(maxR, Math.hypot(sx, sy));
    }
    const k = (Math.min(this.w, this.h) * 0.36 / maxR) * this.zoom;
    const proj = (p) => ({ x: cx + p.x * k, y: cy + p.z * k * 0.86 + p.y * k * 0.3 });

    for (const f of u.filaments) {
      const A = u.galaxies.find((x) => x.id === f.a);
      const B = u.galaxies.find((x) => x.id === f.b);
      if (!A || !B) continue;
      const a = proj(A.pos), b = proj(B.pos);
      const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.12;
      const my = (a.y + b.y) / 2 - (b.x - a.x) * 0.12;
      const dim = sheetAsleep(g.campaign);
      c.beginPath(); c.moveTo(a.x, a.y); c.quadraticCurveTo(mx, my, b.x, b.y);
      c.strokeStyle = dim ? 'rgba(255,80,200,0.05)' : 'rgba(255,80,200,0.16)';
      c.lineWidth = 7;
      c.stroke();
      c.beginPath(); c.moveTo(a.x, a.y); c.quadraticCurveTo(mx, my, b.x, b.y);
      c.strokeStyle = dim ? 'rgba(120,90,140,0.18)' : `rgba(200,120,255,${0.35 + f.curvature * 0.12})`;
      c.lineWidth = 1.6 + f.curvature * 0.5;
      c.setLineDash([6, 10]);
      c.stroke();
      c.setLineDash([]);
      if (dim) continue;
      const tPulse = (this.time * 0.15 + f.curvature) % 1;
      const px = (1 - tPulse) * (1 - tPulse) * a.x + 2 * (1 - tPulse) * tPulse * mx + tPulse * tPulse * b.x;
      const py = (1 - tPulse) * (1 - tPulse) * a.y + 2 * (1 - tPulse) * tPulse * my + tPulse * tPulse * b.y;
      c.fillStyle = 'rgba(255,180,255,0.9)';
      c.beginPath(); c.arc(px, py, 2.4, 0, TAU); c.fill();
    }
    for (const gal of u.galaxies) {
      const locked = !galaxyOpen(g.campaign, gal.id, g.universe.homeId);
      const p = proj(gal.pos);
      const cur = gal.id === g.galaxy.id;
      const sel = this.selected === gal.id;
      const r = 10 + gal.systems.length * 0.35;
      const col = locked ? '#4a5563' : (gal.tint || '#5fd8ff');
      const gl = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 5);
      gl.addColorStop(0, col);
      gl.addColorStop(0.35, col + '55');
      gl.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gl;
      c.beginPath(); c.arc(p.x, p.y, r * 5, 0, TAU); c.fill();
      if (cur) {
        c.strokeStyle = '#fff'; c.lineWidth = 2;
        c.beginPath(); c.arc(p.x, p.y, r + 10 + Math.sin(this.time * 3) * 3, 0, TAU); c.stroke();
      }
      if (sel) {
        c.strokeStyle = '#ffc24d'; c.lineWidth = 1.6;
        c.beginPath(); c.arc(p.x, p.y, r + 16, 0, TAU); c.stroke();
      }
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(p.x, p.y, 3, 0, TAU); c.fill();
      c.font = cur ? '700 12px Orbitron, sans-serif' : '600 11px Rajdhani, sans-serif';
      c.fillStyle = cur ? '#fff' : 'rgba(220,230,255,0.85)';
      c.textAlign = 'center';
      c.fillText(gal.discovered || cur ? gal.name : '???', p.x, p.y - r - 10);
      if (locked && !cur) {
        c.fillStyle = '#ffc24d';
        c.font = '700 8px Orbitron, sans-serif';
        c.fillText('SEALED', p.x, p.y + r + 12);
      }
      this._hits.push({ x: p.x, y: p.y, r: r + 8, id: gal.id, label: gal.name });
    }
  }
}
