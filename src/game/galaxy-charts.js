// Filament charts. Home is open. Every other galaxy on the sheet stays shut
// until you buy its chart at an observatory in a galaxy that shares a filament
// with it. Choir Void stays an ending. The Veil stays the anchor.
import { commitOnce } from './ops.js?v=omega14';
import { tonsQty } from './catalog.js?v=omega14';
import { haveOf, CARGO_LABEL } from './planet-access.js?v=omega14';
import { galaxyDef, galaxyChartDepth, sheetNeighbours } from '../world/universe.js?v=chart1';

const POCKET = 'veil';
const SIGNAL = 'choir';

const BY_DEPTH = {
  1: { chapter: 3, rp: 0, cost: { minerals: 10, metals: 4 } },
  2: { chapter: 5, rp: 15, cost: { metals: 6, rare_ore: 3 } },
  3: { chapter: 7, rp: 20, cost: { tech: 2, rare_ore: 4 } },
  4: { chapter: 9, rp: 25, cost: { tech: 3, rare_ore: 4 } },
};

function depthOffer(depth) {
  return BY_DEPTH[Math.min(4, Math.max(1, depth))] || BY_DEPTH[4];
}

export function ensureCharts(camp) {
  if (!camp) return {};
  if (!camp.charts || typeof camp.charts !== 'object') camp.charts = {};
  return camp.charts;
}

export function chartSellers(id, homeId = 'aetheria', charts = {}) {
  if (!id || id === homeId || id === POCKET || id === SIGNAL) return [];
  return sheetNeighbours(id).filter((n) => n === homeId || !!charts[n]);
}

export function chartOffer(id, homeId = 'aetheria') {
  const def = galaxyDef(id);
  if (!def || id === homeId || id === POCKET || id === SIGNAL) return null;
  const depth = galaxyChartDepth(id, homeId);
  const offer = depthOffer(depth);
  const parts = [];
  for (const [cid, n] of Object.entries(offer.cost)) {
    if (n > 0) parts.push({ id: cid, need: n, label: CARGO_LABEL[cid] || cid });
  }
  if (offer.rp > 0) parts.push({ id: 'rp', need: offer.rp, label: 'RP' });
  return {
    id,
    name: def.name,
    worlds: def.worlds || [],
    depth,
    chapter: offer.chapter,
    rp: offer.rp,
    cost: offer.cost,
    parts,
    costText: parts.map((p) => (p.id === 'rp' ? `${p.need} RP` : `${p.need} t ${p.label}`)).join(' · '),
  };
}

export function chartRows(game) {
  const home = game?.universe?.homeId || 'aetheria';
  const charts = ensureCharts(game?.campaign);
  const here = game?.galaxy?.id || home;
  const rows = [];
  const ids = [];
  const seen = new Set();
  const walk = [home];
  while (walk.length) {
    const cur = walk.shift();
    for (const n of sheetNeighbours(cur)) {
      if (seen.has(n) || n === home) continue;
      seen.add(n);
      ids.push(n);
      walk.push(n);
    }
  }
  for (const id of ids) {
    if (id === POCKET || id === SIGNAL) continue;
    const offer = chartOffer(id, home);
    if (!offer) continue;
    const open = !!charts[id];
    const sellers = chartSellers(id, home, charts);
    const hereSells = sellers.includes(here);
    const stage = Math.max(1, Number(game?.campaign?.chapter) || 1);
    const storyOk = stage >= offer.chapter;
    const routeOk = !!game?.route?.opened;
    const parts = offer.parts.map((p) => ({ ...p, have: haveOf(game, p.id) }));
    const afford = parts.every((p) => p.have + 1e-6 >= p.need);
    let state = 'beyond';
    if (open) state = 'open';
    else if (!sellers.length) state = 'beyond';
    else if (!storyOk) state = 'sealed';
    else if (!routeOk) state = 'route';
    else if (!hereSells) state = 'elsewhere';
    else if (!afford) state = 'short';
    else state = 'available';
    rows.push({
      ...offer,
      open,
      sellers,
      sellerLabel: sellerNames(sellers),
      hereSells,
      storyOk,
      routeOk,
      parts,
      state,
    });
  }
  return rows;
}

function sellerNames(ids) {
  return ids.map((id) => galaxyDef(id)?.name || id).join(' or ');
}

export function chartLockText(id, homeId, charts, chapter) {
  if (id === POCKET) return 'The Veil is the anchor desk, not a filament chart.';
  if (id === SIGNAL) return '';
  const offer = chartOffer(id, homeId);
  if (!offer) return 'Closed.';
  const sellers = chartSellers(id, homeId, charts || {});
  const where = sellers.length
    ? `Buy the chart at the observatory in ${sellerNames(sellers)}.`
    : 'Chart a galaxy on the filament toward it first.';
  const when = (chapter || 1) < offer.chapter ? ` Opens at chapter ${offer.chapter}.` : '';
  return `${offer.name} is not charted. ${where} Cost ${offer.costText}.${when}`;
}

function spendOffer(game, offer) {
  for (const [id, need] of Object.entries(offer.cost || {})) {
    if (!(need > 0)) continue;
    game.cargo = game.cargo || {};
    game.cargo[id] = tonsQty((game.cargo[id] || 0) - need);
    if (game.cargo[id] <= 0) delete game.cargo[id];
  }
  if (offer.rp > 0) game.rp = Math.max(0, (game.rp || 0) - offer.rp);
}

export function buyGalaxyChart(game, id) {
  const home = game?.universe?.homeId || 'aetheria';
  const charts = ensureCharts(game?.campaign);
  if (id === home) return { ok: true, repeat: true, label: 'Home' };
  if (id === POCKET) return { ok: false, reason: 'The Veil opens from the anchor desk, not a chart' };
  if (id === SIGNAL) return { ok: false, reason: 'Choir Void opens with the ending, not a chart' };
  const offer = chartOffer(id, home);
  if (!offer) return { ok: false, reason: 'Unknown galaxy' };
  if (charts[id]) return { ok: true, repeat: true, label: offer.name };
  if (game.state === 'docked' && game.dockedAt?.data?.kind !== 'hub_survey') {
    return { ok: false, reason: 'Charts are sold at an observatory' };
  }
  const sellers = chartSellers(id, home, charts);
  if (!sellers.includes(game.galaxy?.id)) {
    const where = sellers.length ? sellerNames(sellers) : 'a galaxy on the way there';
    return { ok: false, reason: `This chart is sold in ${where}` };
  }
  const stage = Math.max(1, Number(game.campaign?.chapter) || 1);
  if (stage < offer.chapter) return { ok: false, reason: `Opens at chapter ${offer.chapter}` };
  if (!game.route?.opened) return { ok: false, reason: 'Open the science route first — three worlds, two types, Navigation I, 30 RP' };
  const miss = offer.parts.filter((p) => haveOf(game, p.id) + 1e-6 < p.need);
  if (miss.length) {
    const line = miss.map((p) => `${haveOf(game, p.id)}/${p.need} ${p.label}`).join(' · ');
    return { ok: false, reason: `Need ${offer.costText} — you have ${line}` };
  }
  commitOnce(game, `chart:${id}`, () => {
    spendOffer(game, offer);
    charts[id] = true;
    const gal = (game.universe?.galaxies || []).find((g) => g.id === id);
    if (gal) gal.discovered = true;
    return { ok: true };
  });
  return { ok: true, label: offer.name };
}
