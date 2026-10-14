// Expedition states, planet access, hazard, deposits, and the six field events.
import { commitOnce } from './ops.js?v=omega14';
import {
  EVENTS, MODULES, RECIPES, WORLD_ACCESS, worldAccess, hasModule, protection,
  ensureCareer, tonsQty, SLOT_COUNT, FIRST_RETURN_RP, FUEL_UNITS_PER_TON,
} from './catalog.js?v=chart1';
import { DEEP_RP, holdMass } from './ledger.js?v=omega14';
import { worldLock, CARGO_LABEL } from './planet-access.js?v=omega14';

const LIVE = new Set(['launch', 'run', 'result']);

export function sitesFor(type) {
  if (type === 'toxic') {
    return [
      { id: 'safe', label: 'Lee site', detail: '2 t minerals. The filter holds.', minerals: 2, rare: 0, risk: 'Hull stays quiet' },
      { id: 'rich', label: 'Vent site', detail: '2 t minerals and 1 t rare ore. Corrosion climbs.', minerals: 2, rare: 1, risk: 'Shown before you confirm' },
    ];
  }
  return [
    { id: 'safe', label: 'Certain cut', detail: '2 t minerals. Smaller, already assayed.', minerals: 2, rare: 0, risk: 'No extra hazard' },
    { id: 'light', label: 'Light lift', detail: '1 t minerals. Leaves room in the hold.', minerals: 1, rare: 0, risk: 'Less cargo' },
  ];
}

export function accessBlock(game, body) {
  const type = body?.type;
  if (!type || body?.kind === 'wreck' || body?.story === 'dive' || body?.story === 'signal' || body?.story === 'beacon') return null;
  const locked = worldLock(game, body);
  if (locked) return locked;
  const rule = worldAccess(type);
  if (rule.solid === false) {
    if (!hasModule(game, 'atmo1')) return { ok: false, reason: 'No solid pad — fit the atmosphere module, then spend a probe' };
    const holding = game.expedition?.bodyId === (body?.id || body?.name) && game.expedition?.reservedProbe;
    if ((game.atmoProbes || 0) < 1 && !holding) return { ok: false, reason: 'Need an atmosphere probe in the hold' };
  }
  if (type === 'toxic') {
    if (!hasModule(game, 'filter1')) return { ok: false, reason: 'Filtration I is not fitted — craft it at a survey array, then fit it at a shipyard' };
    if ((game.filters || 0) < 1 && !(game.expedition?.bodyId === (body?.id || body?.name) && game.expedition?.reservedFilter)) {
      return { ok: false, reason: 'Need a filter in the hold — 1 t minerals + 1 t tech makes three' };
    }
  }
  if (type === 'lava') {
    if (!hasModule(game, 'thermal2')) return { ok: false, reason: 'Thermal II is required before a lava expedition' };
    const holding = game.expedition?.bodyId === (body?.id || body?.name) && game.expedition?.reservedHeat;
    if ((game.heatPacks || 0) < 1 && !holding) return { ok: false, reason: 'Need a heat pack for the lava site' };
  }
  if (type === 'exotic' && !hasModule(game, 'analyzer') && !body.allowLand) {
    return { ok: false, reason: 'Exotic worlds stay on remote analysis until an analyzer is fitted' };
  }
  return null;
}

export function landingBlock(game, body) {
  const type = body?.type;
  if (body?.story === 'dive' || body?.story === 'signal') return null;
  const locked = worldLock(game, body);
  if (locked) return locked.reason;
  const rule = worldAccess(type);
  if (rule?.solid === false) {
    return 'This world has no landing pad. Use an atmosphere probe (Y).';
  }
  if (type === 'exotic' && !body?.allowLand) {
    return 'Exotic crust stays closed. Remote analysis is on the expedition card (Y).';
  }
  return null;
}

export function quoteExpedition(game, body) {
  ensureCareer(game);
  const id = body?.id || body?.name || '';
  const type = body?.type || 'rocky';
  const rule = worldAccess(type);
  const block = accessBlock(game, body);
  const known = !!(game.researched && game.researched[id]);
  const fuel = Math.round(Number(game.ship?.fuel) || 0);
  const hop = 40;
  const back = fuel >= hop * 2 ? 'Return fuel looks covered' : 'Return not confirmed — keep a reserve or a station behind you';
  const mass = holdMass(game);
  const max = game.ship?.stats?.cargo || 16;
  return {
    id, type, name: body?.name || 'World',
    status: known ? 'surveyed' : (game.expedition?.bodyId === id ? game.expedition.phase : 'discovered'),
    module: rule.module ? MODULES[rule.module]?.name || rule.module : 'none',
    haveModule: rule.module ? hasModule(game, rule.module) : true,
    pack: rule.pack || 'kit',
    kits: game.kits || 0,
    filters: game.filters || 0,
    freeHold: tonsQty(max - mass),
    fuel, hop, back,
    block: block?.reason || '',
    known,
    sites: sitesFor(type),
  };
}

export function cancelExpedition(game) {
  ensureCareer(game);
  const ex = game.expedition;
  if (!ex) return { ok: true, idle: true };
  if (LIVE.has(ex.phase) || ex.phase === 'done' || ex.phase === 'aborted') {
    return { ok: false, reason: 'Already launched — this expedition keeps its id' };
  }
  if (ex.reservedKit) game.kits = (game.kits || 0) + 1;
  if (ex.reservedFilter) game.filters = (game.filters || 0) + 1;
  if (ex.reservedHeat) game.heatPacks = (game.heatPacks || 0) + 1;
  if (ex.reservedProbe) game.atmoProbes = (game.atmoProbes || 0) + 1;
  if (ex.free && game.campaign?.flags) game.campaign.flags.freeDeep = false;
  game.expedition = { ...ex, phase: 'cancelled', reservedKit: false, reservedFilter: false };
  return { ok: true, refunded: true };
}

export function armExpedition(game, body) {
  ensureCareer(game);
  const id = String(body?.id || body?.name || '');
  if (!id) return { ok: false, reason: 'No world' };
  if (game.researched?.[id]) return { ok: true, repeat: true, phase: 'done' };
  if (game.expedition?.bodyId === id && LIVE.has(game.expedition.phase)) {
    return { ok: true, resume: true };
  }
  const block = accessBlock(game, body);
  if (block) return block;
  const flags = game.campaign?.flags || (game.campaign && (game.campaign.flags = game.campaign.flags || {}));
  const free = flags && !flags.freeDeep;
  const remote = worldAccess(body?.type).solid === false;
  if (!remote && !free && (game.kits || 0) < 1) return { ok: false, reason: 'Need a scan kit — orbital ping stays free' };
  if (body?.type === 'toxic' && (game.filters || 0) < 1) return { ok: false, reason: 'Need a filter' };
  if (body?.type === 'lava' && (game.heatPacks || 0) < 1) return { ok: false, reason: 'Need a heat pack' };
  if (remote && (game.atmoProbes || 0) < 1) return { ok: false, reason: 'Need an atmosphere probe' };
  const reservedKit = !remote && !free;
  const reservedFilter = body?.type === 'toxic';
  const reservedHeat = body?.type === 'lava';
  const reservedProbe = remote;
  if (reservedKit) game.kits -= 1;
  if (reservedFilter) game.filters -= 1;
  if (reservedHeat) game.heatPacks -= 1;
  if (reservedProbe) game.atmoProbes -= 1;
  const event = EVENTS[(id.length + (body?.type || '').length) % EVENTS.length];
  game.expedition = {
    id: `ex-${id}`,
    bodyId: id,
    type: body?.type || 'rocky',
    name: body?.name || id,
    phase: 'ready',
    paid: false,
    reservedKit,
    reservedFilter,
    reservedHeat,
    reservedProbe,
    free: !!free,
    eventId: event.id,
    rewardGiven: false,
  };
  return { ok: true, phase: 'ready', free: !!free, event };
}

export function launchExpedition(game, body) {
  ensureCareer(game);
  const id = String(body?.id || body?.name || '');
  const ex = game.expedition;
  if (game.researched?.[id]) return { ok: true, repeat: true };
  if (ex?.bodyId === id && LIVE.has(ex.phase)) return { ok: true, resume: true };
  if (!ex || ex.bodyId !== id || ex.phase !== 'ready') {
    const armed = armExpedition(game, body);
    if (!armed.ok) return armed;
  }
  const cur = game.expedition;
  if (!cur || cur.phase === 'cancelled') return { ok: false, reason: 'Expedition was cancelled' };
  if (cur.free && game.campaign?.flags) game.campaign.flags.freeDeep = true;
  cur.phase = 'run';
  cur.paid = true;
  cur.reservedKit = false;
  cur.reservedFilter = false;
  cur.reservedHeat = false;
  cur.reservedProbe = false;
  return { ok: true, spent: cur.free ? 0 : 1, phase: 'run', event: EVENTS.find((e) => e.id === cur.eventId) };
}

export function resolveEvent(game, choice) {
  ensureCareer(game);
  const ex = game.expedition;
  const ev = EVENTS.find((e) => e.id === ex?.eventId);
  if (!ex || !ev) return { ok: false, reason: 'No field event' };
  if (ex.eventResolved) return { ok: true, repeat: true, text: ev.title };
  if (ev.id === 'storm' && choice === 'b') {
    if ((game.filters || 0) < 1) return { ok: false, reason: 'No spare filter' };
    game.filters -= 1;
  }
  if (ev.id === 'beacon' && choice === 'a') {
    if (tonsQty(game.cargo?.metals || 0) < 1) return { ok: false, reason: 'Need 1 t metals' };
    game.cargo.metals = tonsQty(game.cargo.metals - 1);
  }
  if (ev.id === 'sample' && choice === 'a') {
    if ((game.kits || 0) < 1) return { ok: false, reason: 'Need a scan kit' };
    game.kits -= 1;
    game.specimens = tonsQty((game.specimens || 0) + 0.1);
  }
  if (ev.id === 'distress' && choice === 'a') {
    if ((game.ship?.fuel || 0) < 40) return { ok: false, reason: 'Not enough fuel to share' };
    game.ship.fuel -= 40;
  }
  if (ev.id === 'storm' && choice === 'a') ex.haulMul = 0.5;
  if (ev.id === 'cache' && choice === 'a') ex.bonusMinerals = 2;
  if (ev.id === 'cache' && choice === 'b') {
    ex.bonusRare = 1;
    if (game.ship) game.ship.hull = Math.max(1, (game.ship.hull || 1) - 8);
  }
  if (ev.id === 'quiet' && choice === 'b') ex.bonusMinerals = 1;
  if (ev.id === 'beacon' && choice === 'b') ex.bonusTech = 0.5;
  ex.eventResolved = choice;
  return { ok: true, text: choice === 'a' ? ev.a : ev.b };
}

export function chooseSite(game, siteId) {
  ensureCareer(game);
  const ex = game.expedition;
  if (!ex || ex.phase === 'cancelled' || ex.phase === 'aborted') return { ok: false, reason: 'No open expedition' };
  if (ex.rewardGiven) return { ok: true, repeat: true };
  const sites = sitesFor(ex.type);
  const site = sites.find((s) => s.id === siteId) || sites[0];
  const op = commitOnce(game, `site:${ex.id}`, () => {
    const room = Math.max(0, (game.ship?.stats?.cargo || 16) - holdMass(game));
    let minerals = tonsQty((site.minerals + (ex.bonusMinerals || 0)) * (ex.haulMul || 1));
    let rare = tonsQty(site.rare + (ex.bonusRare || 0));
    const need = tonsQty(minerals + rare);
    if (need > room + 0.05) {
      const scale = room <= 0 ? 0 : room / need;
      minerals = tonsQty(minerals * scale);
      rare = tonsQty(rare * scale);
    }
    if (minerals > 0) game.cargo.minerals = tonsQty((game.cargo.minerals || 0) + minerals);
    if (rare > 0) game.cargo.rare_ore = tonsQty((game.cargo.rare_ore || 0) + rare);
    if (ex.bonusTech) game.cargo.tech = tonsQty((game.cargo.tech || 0) + ex.bonusTech);
    const depKey = `${ex.bodyId}:minerals`;
    game.deposits[depKey] = Math.max(0, tonsQty((game.deposits[depKey] ?? 8) - minerals));
    if (rare) {
      const rk = `${ex.bodyId}:rare_ore`;
      game.deposits[rk] = Math.max(0, tonsQty((game.deposits[rk] ?? 2) - rare));
    }
    return { ok: true, minerals, rare, partial: minerals + rare + 0.05 < site.minerals + site.rare };
  });
  if (!op.ok) return op;
  ex.phase = 'result';
  ex.rewardGiven = true;
  ex.siteId = site.id;
  game.pendingReturn = true;
  return { ok: true, repeat: !!op.repeat, site, ...(op.result || {}) };
}

export function finishScience(game, bodyId) {
  const id = String(bodyId || '');
  if (!id || game.researched?.[id]) return { ok: false, repeat: true, rp: game.rp || 0 };
  game.researched = game.researched || {};
  game.researched[id] = 1;
  game.rp = (game.rp || 0) + DEEP_RP;
  if (game.expedition?.bodyId === id) game.expedition.phase = 'done';
  return { ok: true, rp: game.rp, gained: DEEP_RP };
}

export function grantReturnBonus(game) {
  ensureCareer(game);
  if (!game.pendingReturn || game.returnBonus) return { ok: false, repeat: !!game.returnBonus };
  game.returnBonus = true;
  game.pendingReturn = false;
  game.rp = (game.rp || 0) + FIRST_RETURN_RP;
  return { ok: true, gained: FIRST_RETURN_RP, rp: game.rp };
}

export function abortExpedition(game) {
  ensureCareer(game);
  const ex = game.expedition;
  if (!ex || ex.phase === 'done' || ex.phase === 'cancelled' || ex.phase === 'aborted') return;
  if (ex.phase === 'ready') {
    cancelExpedition(game);
    return;
  }
  game.expedition = { ...ex, phase: 'aborted' };
}

export function noteFragment(game, id) {
  ensureCareer(game);
  const key = String(id || '');
  if (!key || game.route.fragments.includes(key)) return false;
  game.route.fragments.push(key);
  return true;
}

export function tickHazard(game, dt) {
  if (!game || game.state !== 'playing' || game.flightLayer !== 'atmo') return game?.hazard || 0;
  const body = game.atmoPlanet?.data;
  if (!body) return game.hazard || 0;
  const rule = worldAccess(body.type);
  const have = protection(game);
  const bias = game.galaxy?.rules?.hazardBias || 0;
  let gap = bias;
  for (const [k, need] of Object.entries(rule.hazard || {})) {
    gap = Math.max(gap, (need || 0) - (have[k] || 0));
  }
  if (gap <= 0) game.hazard = Math.max(0, (game.hazard || 0) - dt * 5);
  else game.hazard = Math.min(100, (game.hazard || 0) + dt * gap);
  return game.hazard;
}

export function hazardEffect(hazard) {
  if (hazard >= 100) return { damage: true, warn: 'Hull is taking the environment' };
  if (hazard >= 75) return { damage: false, warn: 'Leave — the load is past the exit line' };
  if (hazard >= 50) return { damage: false, warn: 'Environment load is climbing' };
  return { damage: false, warn: '' };
}

export function takeDeposit(game, key, want) {
  ensureCareer(game);
  const id = String(key || 'ore');
  if (game.deposits[id] == null) game.deposits[id] = 12;
  const left = game.deposits[id];
  const n = tonsQty(Math.min(Math.max(0, want), left));
  game.deposits[id] = tonsQty(left - n);
  return n;
}

export function convertFuelCargo(game) {
  const have = tonsQty(game.cargo?.fuel || 0);
  if (have < 1) return { ok: false, reason: 'Need 1 t of hydrogen in the hold' };
  const room = (game.ship?.maxFuel || 0) - (game.ship?.fuel || 0);
  if (room < 1) return { ok: false, reason: 'Tank is already full' };
  const tons = Math.min(have, Math.floor(room / FUEL_UNITS_PER_TON) || (room >= FUEL_UNITS_PER_TON ? 1 : 0));
  if (tons < 1) return { ok: false, reason: 'Not enough empty tank for 40 units' };
  game.cargo.fuel = tonsQty(have - tons);
  if (game.cargo.fuel <= 0) delete game.cargo.fuel;
  const units = tons * FUEL_UNITS_PER_TON;
  game.ship.fuel = Math.min(game.ship.maxFuel, game.ship.fuel + units);
  return { ok: true, tons, units };
}

export function learnBlueprint(game, moduleId) {
  ensureCareer(game);
  const mod = MODULES[moduleId];
  if (!mod) return { ok: false, reason: 'Unknown module' };
  if (game.blueprints[moduleId]) return { ok: true, repeat: true };
  if (game.state === 'docked' && game.dockedAt?.data?.kind !== 'hub_survey') {
    return { ok: false, reason: 'Blueprints are learned at a research array' };
  }
  if ((game.rp || 0) < mod.rp) return { ok: false, reason: `Need ${mod.rp} RP` };
  if (mod.needModule && !hasModule(game, mod.needModule) && !game.blueprints[mod.needModule]) {
    return { ok: false, reason: 'Learn the previous tier first' };
  }
  game.rp -= mod.rp;
  game.blueprints[moduleId] = 1;
  return { ok: true, rp: game.rp };
}

function massGap(game, mass) {
  const miss = [];
  for (const [id, need] of Object.entries(mass || {})) {
    if (!(need > 0)) continue;
    const have = tonsQty(game.cargo?.[id] || 0);
    if (have + 1e-6 < need) miss.push({ id, have, need, label: CARGO_LABEL[id] || id });
  }
  return miss;
}

function massGapText(game, mass) {
  const miss = massGap(game, mass);
  if (!miss.length) return '';
  const need = miss.map((p) => `${p.need} t ${p.label}`).join(' · ');
  const have = miss.map((p) => `${p.have}/${p.need} ${p.label}`).join(' · ');
  return `Need ${need} — you have ${have}. Ore is at a refinery. Tech is at the observatory.`;
}

function spendMass(game, mass) {
  if (massGap(game, mass).length) return false;
  for (const [id, need] of Object.entries(mass || {})) {
    game.cargo[id] = tonsQty((game.cargo[id] || 0) - need);
    if (game.cargo[id] <= 0) delete game.cargo[id];
  }
  return true;
}

function takeLocker(game, moduleId) {
  const pads = game.moduleLocker || {};
  for (const key of Object.keys(pads)) {
    const list = pads[key];
    if (!Array.isArray(list)) continue;
    const i = list.indexOf(moduleId);
    if (i < 0) continue;
    list.splice(i, 1);
    return true;
  }
  return false;
}

export function craftRecipe(game, recipeId) {
  ensureCareer(game);
  if (game.state === 'docked' && game.dockedAt?.data?.kind !== 'hub_survey') {
    return { ok: false, reason: 'Craft at a research array' };
  }
  const rec = RECIPES.find((r) => r.id === recipeId);
  if (!rec) return { ok: false, reason: 'Unknown recipe' };
  if (!rec.known && !game.blueprints[rec.id]) return { ok: false, reason: 'Blueprint not learned' };
  const before = holdMass(game);
  if (!spendMass(game, rec.mass)) return { ok: false, reason: massGapText(game, rec.mass) };
  game[rec.out] = (game[rec.out] || 0) + rec.count;
  const after = holdMass(game);
  return { ok: true, count: rec.count, before, after, name: rec.name };
}

export function buyFinished(game, recipeId) {
  ensureCareer(game);
  const rec = RECIPES.find((r) => r.id === recipeId);
  const mod = MODULES[recipeId];
  if (rec) {
    const cost = Object.values(rec.mass).reduce((s, n) => s + n, 0) * 900;
    if ((game.credits || 0) < cost) return { ok: false, reason: `Need ${cost} CR` };
    game.credits -= cost;
    game[rec.out] = (game[rec.out] || 0) + rec.count;
    return { ok: true, cost, name: rec.name };
  }
  if (!mod) return { ok: false, reason: 'Unknown item' };
  if (!game.blueprints[recipeId]) return { ok: false, reason: 'Learn the blueprint first' };
  const cost = Object.values(mod.mass).reduce((s, n) => s + n, 0) * 900 + 400;
  if ((game.credits || 0) < cost) return { ok: false, reason: `Need ${cost} CR` };
  const pad = game.dockedAt?.data?.id || 'pad';
  const locker = game.moduleLocker[pad] || [];
  if (game.dockedAt?.data?.kind === 'hub_shipyard' && game.fitted.length < SLOT_COUNT && !hasModule(game, mod.id)) {
    game.credits -= cost;
    game.fitted = game.fitted.concat(mod.id).slice(0, SLOT_COUNT);
    return { ok: true, cost, name: mod.name, fitted: game.fitted };
  }
  if (game.fitted.length >= SLOT_COUNT && locker.length > 8) return { ok: false, reason: 'Locker is full' };
  game.credits -= cost;
  game.moduleLocker[pad] = locker.concat(mod.id);
  return { ok: true, cost, name: mod.name, stored: true, reason: `${mod.name} is in the locker. BUILD & FIT installs it without the ore.` };
}

export function fitModule(game, moduleId) {
  ensureCareer(game);
  if (game.state !== 'docked') return { ok: false, reason: 'Fit modules only at a station' };
  if (game.dockedAt?.data?.kind !== 'hub_shipyard') return { ok: false, reason: 'Fit modules at a shipyard' };
  const mod = MODULES[moduleId];
  if (!mod) return { ok: false, reason: 'Unknown module' };
  if (!game.blueprints[moduleId]) return { ok: false, reason: 'Blueprint not owned' };
  if (hasModule(game, moduleId)) return { ok: false, reason: 'Already fitted — duplicates do not stack' };
  const replacing = !!(mod.replaces && hasModule(game, mod.replaces));
  if (game.fitted.length >= SLOT_COUNT && !replacing) return { ok: false, reason: 'All three slots are full' };
  const fromLocker = takeLocker(game, moduleId);
  if (!fromLocker && !spendMass(game, mod.mass)) return { ok: false, reason: massGapText(game, mod.mass) };
  let fitted = game.fitted.filter((id) => id !== mod.replaces);
  fitted.push(moduleId);
  game.fitted = fitted.slice(0, SLOT_COUNT);
  return { ok: true, fitted: game.fitted };
}

export function unfitModule(game, moduleId) {
  ensureCareer(game);
  if (game.state !== 'docked') return { ok: false, reason: 'Unfit only at a station' };
  if (game.dockedAt?.data?.kind !== 'hub_shipyard') return { ok: false, reason: 'Stow modules at a shipyard' };
  if (!hasModule(game, moduleId)) return { ok: false, reason: 'Not fitted' };
  game.fitted = game.fitted.filter((id) => id !== moduleId);
  const pad = game.dockedAt?.data?.id || 'pad';
  game.moduleLocker[pad] = (game.moduleLocker[pad] || []).concat(moduleId);
  return { ok: true };
}

export function publishDiscovery(game, bodyId) {
  ensureCareer(game);
  const id = String(bodyId || '');
  if (!id || !game.researched?.[id]) return { ok: false, reason: 'Survey the world first' };
  return commitOnce(game, `publish:${id}`, () => {
    const pay = 900;
    game.credits = (game.credits || 0) + pay;
    game.published[id] = 1;
    return { ok: true, pay };
  });
}

export function shedOverflow(game) {
  ensureCareer(game);
  const max = game.ship?.stats?.cargo || 16;
  let guard = 0;
  while (holdMass(game) > max + 0.05 && guard++ < 80) {
    let key = '';
    let best = 0;
    for (const k of Object.keys(game.cargo || {})) {
      if (game.pinned?.[k]) continue;
      if (k === 'data' && game.campaign?.flags?.crate) continue;
      const v = Number(game.cargo[k]) || 0;
      if (v > best) { best = v; key = k; }
    }
    if (!key) break;
    const move = Math.min(best, 0.5);
    game.cargo[key] = tonsQty(best - move);
    if (game.cargo[key] <= 0) delete game.cargo[key];
    game.overflow[key] = tonsQty((game.overflow[key] || 0) + move);
  }
  return game.overflow;
}

export function legacyScanGrant(game) {
  ensureCareer(game);
  if (game.legacyScanRp) return { ok: false, repeat: true };
  const n = Object.keys(game.gallery || {}).length;
  if (n <= 0) {
    game.legacyScanRp = true;
    return { ok: false, empty: true };
  }
  game.legacyScanRp = true;
  const gain = Math.min(24, n * 2);
  game.rp = (game.rp || 0) + gain;
  return { ok: true, gain };
}

export { WORLD_ACCESS, EVENTS, RECIPES, MODULES };
