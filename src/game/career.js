// Pure career / combat helpers — unit-tested, no Three.js.

export function defaultRep() {
  return { fed: 18, ind: 8, syn: 0, cul: -8, none: 0 };
}

export function clampRep(n) {
  return Math.max(-100, Math.min(100, Number.isFinite(n) ? n : 0));
}

export function dockPriceMult(rep, factionId) {
  const r = clampRep(rep && rep[factionId]);
  return Math.max(0.52, Math.min(1.45, 1 - r * 0.0045));
}

export function addRep(rep, factionId, delta) {
  const out = { ...(rep || defaultRep()) };
  const id = factionId && out[factionId] !== undefined ? factionId : 'none';
  out[id] = clampRep((out[id] || 0) + delta);
  return out;
}

export function illegalIds(commodities) {
  return (commodities || []).filter((c) => c && c.legal === false).map((c) => c.id);
}

export function illegalTons(cargo, commodities) {
  let n = 0;
  for (const id of illegalIds(commodities)) n += cargo[id] || 0;
  return n;
}

export function contrabandFine(tons, wanted) {
  const t = Math.max(0, tons);
  return Math.round(t * 2800 + (wanted || 0) * 900);
}

export function lateFactor(playtime, expires) {
  if (expires == null) return 1;
  if (playtime <= expires) return 1;
  return Math.max(0.35, 1 - (playtime - expires) / 2400);
}

export function missionExpired(playtime, expires) {
  return expires != null && playtime > expires;
}

export function chaffBreaks(roll) {
  return roll < 0.78;
}

export function pipNorm(sys, eng, wep) {
  const a = Math.max(0, sys), b = Math.max(0, eng), c = Math.max(0, wep);
  const s = a + b + c || 1;
  return { sys: a / s, eng: b / s, wep: c / s };
}

export function saveSlotKey(i) {
  const n = Math.max(0, Math.min(2, i | 0));
  return n === 0 ? 'astralis_save_v1' : `astralis_save_v1_s${n}`;
}

export const COMBAT_RANKS = [
  'Harmless', 'Mostly Harmless', 'Novice', 'Competent', 'Expert', 'Master', 'Dangerous', 'Deadly', 'Elite',
];
export const TRADE_RANKS = [
  'Penniless', 'Peddler', 'Dealer', 'Merchant', 'Broker', 'Entrepreneur', 'Tycoon', 'Magnate', 'Elite',
];
export const EXPLORE_RANKS = [
  'Aimless', 'Scout', 'Surveyor', 'Trailblazer', 'Pathfinder', 'Ranger', 'Pioneer', 'Cartographer', 'Elite',
];

function _rankOf(value, steps, names) {
  const v = Math.max(0, Number(value) || 0);
  let i = 0;
  while (i < steps.length - 1 && v >= steps[i + 1]) i++;
  return { id: i, name: names[i], next: steps[i + 1] ?? null, value: v, progress: steps[i + 1] ? (v - steps[i]) / Math.max(1, steps[i + 1] - steps[i]) : 1 };
}

export function combatRank(kills) {
  return _rankOf(kills, [0, 3, 8, 18, 35, 60, 100, 160, 250], COMBAT_RANKS);
}
export function tradeRank(earned) {
  return _rankOf(earned, [0, 8000, 25000, 70000, 180000, 420000, 900000, 2e6, 5e6], TRADE_RANKS);
}
export function exploreRank(scans) {
  return _rankOf(scans, [0, 4, 10, 22, 40, 70, 110, 170, 260], EXPLORE_RANKS);
}

export function factionStanding(rep) {
  const r = clampRep(rep);
  if (r >= 75) return 'Allied';
  if (r >= 35) return 'Friendly';
  if (r >= 8) return 'Cordial';
  if (r > -8) return 'Neutral';
  if (r > -35) return 'Unfriendly';
  if (r > -75) return 'Hostile';
  return 'Outlaw';
}

export function insurancePremium(shipPrice, mul = 1) {
  return Math.round((Math.max(0, shipPrice) * 0.085 + 2800) * (mul || 1));
}

export function insuranceExcess(credits, shipPrice, covered) {
  const c = Math.max(0, credits || 0);
  const p = Math.max(0, shipPrice || 0);
  if (covered) return Math.round(p * 0.018 + c * 0.035);
  return Math.round(c * 0.18 + p * 0.05);
}

export function cargoKeepFrac(covered) {
  return covered ? 0.8 : 0.5;
}

export function writFine(wanted) {
  const w = Math.max(0, wanted | 0);
  return Math.round(w * w * 1800 + w * 1400);
}

export function salvagePayout(base, firstEver, exploreBonus = 1) {
  const b = Math.max(80, base || 400);
  const pay = firstEver ? b : Math.round(b * 0.12);
  return Math.round(pay * (exploreBonus || 1));
}

export function exploreBonus(scans) {
  return 1 + Math.min(0.35, exploreRank(scans).id * 0.04);
}

export function bountyMult(kills) {
  return 1 + combatRank(kills).id * 0.06;
}

export const STATION_KIND_LABEL = {
  hub_trade: 'Trade Exchange',
  hub_shipyard: 'Shipworks',
  hub_arsenal: 'Arsenal',
  hub_refinery: 'Refinery Hub',
  hub_survey: 'Survey Array',
  shipyard: 'Shipyard',
  refinery: 'Refinery',
  orbital: 'Orbital',
  outpost: 'Outpost',
};

export const PLANET_MINE = {
  lava: { commodity: 'metals', rare: 0.18, hazard: 'heat', label: 'basaltic vein' },
  ice: { commodity: 'ice_ore', rare: 0.08, hazard: null, label: 'volatile ice' },
  carbon: { commodity: 'minerals', rare: 0.28, hazard: null, label: 'carbide seam' },
  rocky: { commodity: 'minerals', rare: 0.09, hazard: null, label: 'silicate' },
  barren: { commodity: 'minerals', rare: 0.05, hazard: null, label: 'regolith' },
  desert: { commodity: 'minerals', rare: 0.04, hazard: 'heat', label: 'oxide dust' },
  toxic: { commodity: 'minerals', rare: 0.11, hazard: 'toxic', label: 'precipitate' },
  exotic: { commodity: 'rare_ore', rare: 0.4, hazard: 'unstable', label: 'lattice' },
};

export const REFINE_RECIPES = [
  { id: 'smelt', name: 'Smelt minerals', in: 'minerals', inAmt: 2, out: 'metals', outAmt: 1, fee: 40, hint: 'Two tonnes of rock become plate. Trade spins pay for metals; dumping raw here is the lazy ticket.' },
  { id: 'melt', name: 'Melt ice ore', in: 'ice_ore', inAmt: 2, out: 'water', outAmt: 1, fee: 14, hint: 'Ice becomes water. Agricultural and trade pads buy it; keep a tank for the return hop.' },
  { id: 'crack', name: 'Crack rare earths', in: 'rare_ore', inAmt: 2, out: 'tech', outAmt: 1, fee: 180, hint: 'Rare earths become tech. Survey arrays and trade spins fight over the crate.' },
];

export const MINE_CUT_RANGE = 1400;
export const MINE_PROSPECT_RANGE = 2800;
export const MINE_VEIN_RANGE = 160;

export function planetMine(type) {
  return PLANET_MINE[type] || null;
}

export function isHubKind(kind) {
  return typeof kind === 'string' && kind.startsWith('hub_');
}

export function hubKindForEconomy(economy) {
  if (economy === 'industrial' || economy === 'mining') return 'hub_refinery';
  if (economy === 'research') return 'hub_survey';
  return 'hub_trade';
}

/** Hub type from what is actually in the system — belts and worlds, not a dice roll. */
export function hubKindForSystem(sys) {
  if (!sys) return 'hub_trade';
  const planets = sys.planets || [];
  const n = planets.length;
  const faction = sys.faction?.id || 'none';
  const types = new Set(planets.map((p) => p.type));
  const belts = (sys.belts || []).length;
  const mine = belts > 0 || types.has('lava') || types.has('carbon');
  const hab = types.has('terra') || types.has('ocean');
  if (n <= 1 && (faction === 'none' || (!mine && !hab))) return 'hub_survey';
  if (mine) return 'hub_refinery';
  if (hab) return 'hub_trade';
  if (n <= 1) return 'hub_survey';
  return 'hub_trade';
}

export function economyForHubKind(kind, sys) {
  if (kind === 'hub_refinery') {
    const belts = (sys?.belts || []).length;
    const hot = (sys?.planets || []).some((p) => p.type === 'lava' || p.type === 'carbon');
    return belts || hot ? 'mining' : 'industrial';
  }
  if (kind === 'hub_survey') return 'research';
  const ocean = (sys?.planets || []).some((p) => p.type === 'ocean');
  const terra = (sys?.planets || []).some((p) => p.type === 'terra');
  if (ocean && !terra) return 'agricultural';
  return 'trade';
}

export function hubMarketBook(kind) {
  if (kind === 'hub_trade') return { buys: ['metals', 'luxuries', 'tech'], sells: ['fuel', 'food', 'water', 'luxuries'] };
  if (kind === 'hub_refinery' || kind === 'refinery') return { buys: ['food', 'water'], sells: ['minerals', 'ice_ore', 'metals', 'rare_ore'] };
  if (kind === 'hub_survey') return { buys: ['data', 'rare_ore'], sells: ['tech', 'medicine'] };
  if (kind === 'hub_shipyard' || kind === 'shipyard') return { buys: ['metals'], sells: [] };
  if (kind === 'hub_arsenal') return { buys: ['tech'], sells: ['medicine', 'weapons'] };
  if (kind === 'orbital' || kind === 'outpost' || kind === 'gateway') return { buys: ['food', 'minerals'], sells: ['fuel', 'food', 'water'] };
  return null;
}

export function stationScale(kind) {
  if (kind === 'hub_shipyard') return { radius: 1120, dock: 740, popMin: 3000, popMax: 26000, spin: 0.003 };
  if (kind === 'hub_arsenal') return { radius: 1050, dock: 690, popMin: 1200, popMax: 10000, spin: 0.003 };
  if (kind === 'hub_trade') return { radius: 1340, dock: 860, popMin: 18000, popMax: 160000, spin: 0.004 };
  if (kind === 'hub_refinery') return { radius: 1200, dock: 780, popMin: 9000, popMax: 72000, spin: 0.0035 };
  if (kind === 'hub_survey') return { radius: 1100, dock: 720, popMin: 1400, popMax: 12000, spin: 0.003 };
  if (kind === 'shipyard') return { radius: 700, dock: 430, popMin: 400, popMax: 22000, spin: 0.006 };
  if (kind === 'refinery') return { radius: 560, dock: 340, popMin: 180, popMax: 7000, spin: 0.005 };
  if (kind === 'outpost') return { radius: 400, dock: 250, popMin: 40, popMax: 800, spin: 0.007 };
  return { radius: 540, dock: 320, popMin: 80, popMax: 4500, spin: 0.006 };
}

export function economyPriceMult(economy, commodityId, hubKind, buys = [], sells = []) {
  const book = hubMarketBook(hubKind);
  const want = book ? book.buys : buys;
  const have = book ? book.sells : sells;
  let m = 1;
  if (want.includes(commodityId)) m += isHubKind(hubKind) ? 0.5 : 0.26;
  if (have.includes(commodityId)) m -= isHubKind(hubKind) ? 0.46 : 0.24;
  if (hubKind === 'hub_trade') {
    if (commodityId === 'metals' || commodityId === 'luxuries' || commodityId === 'tech') m += 0.24;
    if (commodityId === 'food' || commodityId === 'water') m -= 0.12;
    if (commodityId === 'fuel') m -= 0.06;
  }
  if (hubKind === 'hub_refinery') {
    if (commodityId === 'minerals' || commodityId === 'ice_ore' || commodityId === 'rare_ore') m -= 0.1;
    if (commodityId === 'food' || commodityId === 'water') m += 0.16;
    if (commodityId === 'tech' || commodityId === 'fuel') m -= 0.08;
  }
  if (hubKind === 'hub_survey') {
    if (commodityId === 'data' || commodityId === 'rare_ore') m += 0.36;
    if (commodityId === 'minerals' || commodityId === 'metals') m -= 0.16;
    if (commodityId === 'food' || commodityId === 'fuel') m += 0.1;
    if (commodityId === 'medicine' || commodityId === 'tech') m -= 0.08;
  }
  return Math.max(0.32, Math.min(2.45, m));
}

export function applyBulletinBonus(price, bulletin, commodityId, selling) {
  const hit = (bulletin || []).find((b) => b.id === commodityId);
  if (!hit) return price;
  const bonus = hit.bonus || 0;
  if (selling) return Math.round(price * (1 + bonus));
  return Math.round(price * (1 + bonus * 0.35));
}

export function bulletinSlice(playtime, sliceSec = 480) {
  return Math.floor(Math.max(0, playtime || 0) / Math.max(60, sliceSec));
}

export function bulletinRemaining(playtime, sliceSec = 480) {
  const t = Math.max(0, playtime || 0);
  const span = Math.max(60, sliceSec);
  const end = (Math.floor(t / span) + 1) * span;
  return Math.max(0, end - t);
}

export function shiftListedPrice(item, base, qty, selling) {
  if (!item) return item;
  const q = Math.max(0, Number(qty) || 0);
  if (q <= 0) return item;
  const b = Math.max(8, base || item.price || 100);
  const next = { ...item };
  if (selling) {
    next.stock = Math.round((next.stock || 0) + q);
    next.price = Math.round(Math.max(b * 0.52, (next.price || b) * (0.988 ** Math.min(40, q))));
  } else {
    next.stock = Math.max(0, Math.round((next.stock || 0) - q));
    next.price = Math.round(Math.min(b * 1.85, (next.price || b) * (1.012 ** Math.min(40, q))));
  }
  return next;
}

export function findHub(hubs, kind) {
  return (hubs || []).find((h) => h && h.kind === kind) || null;
}

export function pickCircuitDest(commodity, fromId, hubs, fallback) {
  const want = (kind) => {
    const h = findHub(hubs, kind);
    return h && h.id !== fromId ? h : null;
  };
  if (commodity === 'metals' || commodity === 'luxuries' || commodity === 'tech') return want('hub_trade') || fallback;
  if (commodity === 'minerals' || commodity === 'ice_ore' || commodity === 'food' || commodity === 'water') return want('hub_refinery') || fallback;
  if (commodity === 'data' || commodity === 'rare_ore') return want('hub_survey') || fallback;
  return fallback;
}

export function padJobs(station, hubs, playtime, flags = {}) {
  if (!station) return [];
  const jobs = [];
  const refinery = findHub(hubs, 'hub_refinery');
  const trade = findHub(hubs, 'hub_trade');
  const t = playtime || 0;
  if (!flags.rationDone && station.kind === 'hub_trade' && refinery && refinery.id !== station.id) {
    jobs.push({
      id: `pad-ration-${station.id}`,
      type: 'cargo',
      pad: true,
      title: 'RATION RUN',
      commodity: 'food',
      commodityName: 'Food Rations',
      amount: 10,
      destId: refinery.id,
      destName: refinery.name,
      destSystem: refinery.system,
      destSystemId: refinery.systemId,
      origin: station.id,
      originName: station.name,
      originSystem: '',
      reward: 9800,
      expires: t + 2400,
      desc: `Foundry crews are hungry. We load 10t of rations. Jump to ${refinery.name} in ${refinery.system}, dock E, get paid. Then mine their belt.`,
      hullHint: 'aurora',
      hullHintWhy: 'Aurora hold is enough',
      produce: false,
    });
  }
  if (flags.rationDone && !flags.plateDone && station.kind === 'hub_refinery' && trade && trade.id !== station.id) {
    jobs.push({
      id: `pad-plate-${station.id}`,
      type: 'cargo',
      pad: true,
      title: 'PLATE RUN',
      commodity: 'metals',
      commodityName: 'Metals',
      amount: 6,
      destId: trade.id,
      destName: trade.name,
      destSystem: trade.system,
      destSystemId: trade.systemId,
      origin: station.id,
      originName: station.name,
      originSystem: '',
      reward: 14200,
      expires: t + 3600,
      desc: `Mine this system's belt (nose on a rock, hold F). REFINERY tab: 2t minerals → 1t metals. Bring 6t plate to ${trade.name}.`,
      hullHint: 'aurora',
      hullHintWhy: 'Mine, smelt, haul — Aurora can do this',
      produce: true,
    });
  }
  return jobs;
}

export function paydayLine(missions, cargo, hubs, hereKind) {
  const haul = (missions || []).find((m) => m && m.pad)
    || (missions || []).find((m) => m && !m.story && (m.type === 'cargo' || m.type === 'courier'));
  if (haul) {
    const have = Math.floor(cargo?.[haul.commodity] || 0);
    return {
      title: haul.id === 'story-courier' ? 'PAYDAY · TIMED COURIER' : (haul.title || (haul.pad ? 'PAD RUN' : haul.type.toUpperCase())),
      line: `${have}/${haul.amount}t ${haul.commodityName || haul.commodity} → ${haul.destName}`,
      pay: haul.reward || 0,
    };
  }
  const metals = cargo?.metals || 0;
  const minerals = cargo?.minerals || 0;
  const data = cargo?.data || 0;
  const trade = findHub(hubs, 'hub_trade');
  const refinery = findHub(hubs, 'hub_refinery');
  const survey = findHub(hubs, 'hub_survey');
  if (metals >= 1 && trade) return { title: 'SELL METALS', line: `${Math.floor(metals)}t plate → ${trade.name}`, pay: 0 };
  if (minerals >= 2 && hereKind === 'hub_refinery') return { title: 'SMELT', line: 'REFINERY tab · 2t ore → 1t metals', pay: 0 };
  if (minerals >= 2 && refinery) return { title: 'SMELT', line: `${Math.floor(minerals)}t ore → ${refinery.name}`, pay: 0 };
  if (data >= 1 && survey) return { title: 'CASH DATA', line: `${Math.floor(data)}t research → ${survey.name}`, pay: 0 };
  if (hereKind === 'hub_trade' && refinery) return { title: 'TRADE LOOP', line: `Food to ${refinery.name} · or mine their belt`, pay: 0 };
  return null;
}

export function rollBulletins(rngPick, economy, hubKind, n) {
  const count = Math.max(2, Math.min(4, n | 0));
  const pool = [];
  if (economy === 'mining' || economy === 'industrial' || hubKind === 'hub_refinery') {
    pool.push(
      { id: 'minerals', bonus: 0.38, text: 'Smelter queue — minerals +38%' },
      { id: 'ice_ore', bonus: 0.32, text: 'Volatile shortfall — ice ore +32%' },
      { id: 'rare_ore', bonus: 0.45, text: 'Foundry wants rare earths +45%' },
      { id: 'food', bonus: 0.28, text: 'Shift rations low — food +28%' },
    );
  }
  if (economy === 'agricultural') {
    pool.push(
      { id: 'tech', bonus: 0.34, text: 'Harvester parts — tech +34%' },
      { id: 'medicine', bonus: 0.3, text: 'Clinic restock — medicine +30%' },
      { id: 'fuel', bonus: 0.22, text: 'Pump shortage — fuel +22%' },
    );
  }
  if (economy === 'trade' || hubKind === 'hub_trade') {
    pool.push(
      { id: 'luxuries', bonus: 0.4, text: 'Orbital gala — luxuries +40%' },
      { id: 'metals', bonus: 0.36, text: 'Yard plates — metals +36%' },
      { id: 'food', bonus: 0.24, text: 'Liners boarding — food +24%' },
      { id: 'water', bonus: 0.2, text: 'Cisterns dry — water +20%' },
    );
  }
  if (economy === 'research' || hubKind === 'hub_survey') {
    pool.push(
      { id: 'rare_ore', bonus: 0.48, text: 'Sample request — rare earths +48%' },
      { id: 'data', bonus: 0.3, text: 'Archive gap — research data +30%' },
      { id: 'minerals', bonus: 0.26, text: 'Lab feedstock — minerals +26%' },
    );
  }
  if (economy === 'military') {
    pool.push(
      { id: 'metals', bonus: 0.34, text: 'Armour run — metals +34%' },
      { id: 'tech', bonus: 0.32, text: 'Sensor kit — tech +32%' },
      { id: 'luxuries', bonus: 0.22, text: 'Officer mess — luxuries +22%' },
    );
  }
  pool.push(
    { id: 'fuel', bonus: 0.18, text: 'Traffic spike — fuel +18%' },
    { id: 'water', bonus: 0.16, text: 'Life support top-up — water +16%' },
  );
  const uniq = [];
  const seen = new Set();
  for (const p of pool) {
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    uniq.push(p);
  }
  const out = [];
  const used = new Set();
  let guard = 0;
  while (out.length < count && guard++ < 40 && used.size < uniq.length) {
    const pick = rngPick(uniq.filter((p) => !used.has(p.id)));
    if (!pick) break;
    used.add(pick.id);
    out.push(pick);
  }
  return out;
}

export function prettyCom(id) {
  return String(id || '').replace(/_/g, ' ');
}

export function routeHint(economy, buys = [], sells = [], hubKind, circuit) {
  if (hubKind === 'hub_refinery') {
    const dest = circuit?.trade;
    const where = dest ? `${dest.name} (${dest.sys}${dest.hops != null ? `, ${dest.hops} jump${dest.hops === 1 ? '' : 's'}` : ''})` : 'a trade spin';
    return `Belt feed — ore is cheap here but stock is thin. Mine the rocks, run REFINERY, haul metals to ${where}. Food is dear; buy it at a trade spin.`;
  }
  if (hubKind === 'hub_trade') {
    const src = circuit?.refinery;
    const where = src ? `${src.name} in ${src.sys}` : 'a foundry';
    return `Best sell for metals and luxuries. Food and water are cheap — fill the hold for ${where}.`;
  }
  if (hubKind === 'hub_survey') {
    return 'Survey array. Cash research data on the SURVEY DESK. Charts and scan pay, not a bulk market.';
  }
  const cheap = (sells || []).filter((id) => id !== 'fuel')[0];
  const want = (buys || []).filter((id) => id !== 'fuel')[0];
  if (cheap && want) return `Buy ${prettyCom(cheap)} cheap here. This pad wants ${prettyCom(want)}. One or two jumps is a route.`;
  if (cheap) return `Buy ${prettyCom(cheap)} cheap here and haul it one or two jumps.`;
  if (want) return `This pad is paying for ${prettyCom(want)}.`;
  return 'Green is cheap, red is dear. One or two jumps is a route.';
}

export function circuitHint(station, hubs = []) {
  if (station?.circuit) return routeHint(station.economy, [], [], station.kind, station.circuit);
  const named = (kind) => {
    const h = (hubs || []).find((x) => x.kind === kind && x.id !== station?.id);
    return h ? { name: h.name, sys: h.system, hops: h.hops } : null;
  };
  return routeHint(station?.economy, [], [], station?.kind, {
    trade: named('hub_trade'),
    refinery: named('hub_refinery'),
  });
}

export function surveyDataPayout(units, listedPrice) {
  const n = Math.max(0, Math.floor(units || 0));
  const p = Math.max(80, listedPrice || 760);
  return n * Math.round(p * 1.45);
}

export function refineHaulDelta(rawSell, refinedSell, recipe) {
  if (!recipe) return 0;
  const dump = (rawSell || 0) * recipe.inAmt;
  const haul = (refinedSell || 0) * recipe.outAmt - (recipe.fee || 0);
  return haul - dump;
}

export function sellableTons(held, reserved = 0) {
  const n = (Number(held) || 0) - (Number(reserved) || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 10) / 10;
}

export function extractTons(miningStat, opts, dt) {
  const prospected = !!(opts && opts.prospected);
  const grade = Math.max(1, Math.min(5, (opts && opts.grade) || 1));
  const hardness = 0.5 + grade * 0.1;
  const scanMul = prospected ? 1 : 0.32;
  const yieldMul = prospected ? (0.85 + grade * 0.16) : 0.45;
  const stat = Math.max(0.15, miningStat || 1);
  return stat * 1.35 * scanMul * yieldMul / hardness * Math.max(0, dt || 0);
}

export function addMinedCargo(cargo, commodityId, tons) {
  const id = commodityId || 'minerals';
  const n = Math.max(0, Number(tons) || 0);
  const next = { ...(cargo || {}) };
  next[id] = Math.round(((next[id] || 0) + n) * 100) / 100;
  if (next[id] <= 0) delete next[id];
  return next;
}

export function mineHazard(kind, dt) {
  const t = Math.max(0, dt || 0);
  if (kind === 'heat') return { heat: 0.14 * t, hull: 0 };
  if (kind === 'unstable') return { heat: 0.09 * t, hull: 5.2 * t };
  if (kind === 'toxic') return { heat: 0.06 * t, hull: 2.4 * t };
  return { heat: 0, hull: 0 };
}

export function prospectDwell(sensors) {
  return Math.max(0.7, 1.35 - Math.max(0, (sensors || 1) - 1) * 0.35);
}

export function canRefine(cargo, recipe, credits) {
  if (!recipe) return false;
  return (cargo[recipe.in] || 0) >= recipe.inAmt && (credits || 0) >= recipe.fee;
}

export function applyRefine(cargo, recipe) {
  const next = { ...(cargo || {}) };
  next[recipe.in] = (next[recipe.in] || 0) - recipe.inAmt;
  if (next[recipe.in] <= 0) delete next[recipe.in];
  next[recipe.out] = (next[recipe.out] || 0) + recipe.outAmt;
  return next;
}

export function rockOreTons(size, richness, grade, rare) {
  const g = Math.max(1, Math.min(5, grade || 1));
  const base = Math.max(0.4, size || 1) * Math.max(0.2, richness || 0.5) * (1.6 + g * 1.1);
  return Math.max(2, Math.round(rare ? base * 0.42 : base));
}
