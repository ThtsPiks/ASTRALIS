// Story permission, science unlock, and ship supplies are three different answers.
import { generateGalaxy } from '../world/galaxy.js?v=chart1';
import { transitQuote } from '../world/universe.js?v=chart1';
import { galaxyOpen, galaxyLockReason } from '../story/campaign.js?v=finale6';
import { ensureCareer, hasModule, ANCHOR_RP, ROUTE_OPEN_RP } from './catalog.js?v=omega14';
import { trySpendFuel } from './ledger.js?v=omega14';

const POCKET_ID = 'veil';

export function researchedWorlds(game) {
  const ids = Object.keys(game?.researched || {});
  const types = new Set();
  const gal = game?.galaxy;
  if (gal) {
    for (const sys of gal.systems || []) {
      for (const p of sys.planets || []) if (game.researched?.[p.id]) types.add(p.type);
      for (const p of sys.planets || []) for (const m of p.moons || []) if (game.researched?.[m.id]) types.add(m.type || p.type);
    }
  }
  for (const g of game?.universe?.galaxies || []) {
    for (const sys of g.systems || []) {
      for (const p of sys.planets || []) if (game.researched?.[p.id]) types.add(p.type);
    }
  }
  return { count: ids.length, types: types.size };
}

export function scienceReady(game) {
  ensureCareer(game);
  const worlds = researchedWorlds(game);
  const nav = !!game.blueprints?.nav1 && hasModule(game, 'nav1');
  const opened = !!game.route.opened;
  const reasons = [];
  if (worlds.count < 3 || worlds.types < 2) reasons.push(`Worlds ${worlds.count}/3 and types ${worlds.types}/2`);
  if (!game.blueprints?.nav1) reasons.push(`Navigation blueprint ${ROUTE_OPEN_RP ? '60' : ''} RP`);
  if (!hasModule(game, 'nav1')) reasons.push('Navigation I is not fitted');
  if (!opened) reasons.push(`Open the route for ${ROUTE_OPEN_RP} RP`);
  return { ok: reasons.length === 0, reasons, worlds, opened, nav };
}

export function openScienceRoute(game) {
  ensureCareer(game);
  if (game.route.opened) return { ok: true, repeat: true };
  const worlds = researchedWorlds(game);
  if (worlds.count < 3 || worlds.types < 2) return { ok: false, reason: 'Survey 3 worlds of at least 2 types first' };
  if (!game.blueprints?.nav1 || !hasModule(game, 'nav1')) return { ok: false, reason: 'Fit Navigation I before opening the route' };
  if ((game.rp || 0) < ROUTE_OPEN_RP) return { ok: false, reason: `Need ${ROUTE_OPEN_RP} RP to open the route` };
  game.rp -= ROUTE_OPEN_RP;
  game.route.opened = true;
  return { ok: true, rp: game.rp };
}

export function transitReport(game, galId) {
  ensureCareer(game);
  const home = game.universe?.homeId || 'aetheria';
  const storyOk = galaxyOpen(game.campaign, galId, home);
  const story = storyOk ? 'Story allows this chart' : (galaxyLockReason(game.campaign, galId, home) || 'Story has not opened this galaxy');
  const legacy = !!(game.route.legacy?.[galId] || game.route.calibrated?.[galId] && game.route.legacy?.[galId]);
  const science = legacy ? { ok: true, reasons: [] } : scienceReady(game);
  const scienceText = legacy
    ? 'Already calibrated on this career'
    : (science.ok ? 'Science route is open' : science.reasons[0] || 'Science route is closed');
  const massT = Math.max(12, (game.ship?.stats?.hull || 100) * 0.35);
  const q = game.universe && game.galaxy ? transitQuote(game.universe, game.galaxy.id, galId, massT) : null;
  const fuelNeed = q?.fuel || 0;
  const haveFuel = Math.round(game.ship?.fuel || 0);
  const needCell = !legacy;
  const haveCell = (game.transitCells || 0) >= 1;
  let shipText = 'Ship can pay the hop';
  let shipOk = true;
  if (!q) { shipOk = false; shipText = 'No filament from here'; }
  else if (haveFuel < fuelNeed) { shipOk = false; shipText = `Need ${fuelNeed} fuel · tank ${haveFuel}`; }
  else if (needCell && !haveCell) { shipOk = false; shipText = 'Need 1 transit cell — this is supplies, not a story lock'; }
  else if (haveFuel < fuelNeed * 2 && !game.route.calibrated?.[galId]) shipText = `Fuel pays the hop. Return is not confirmed (${fuelNeed} more would cover it).`;
  return {
    storyOk, story, scienceOk: !!science.ok, science: scienceText,
    shipOk, ship: shipText, fuelNeed, legacy, q,
  };
}

export function commitTransit(game, galId) {
  const report = transitReport(game, galId);
  if (!report.storyOk) return { ok: false, story: true, reason: report.story };
  if (!report.scienceOk) return { ok: false, story: false, reason: report.science };
  if (!report.shipOk) return { ok: false, story: false, reason: report.ship };
  const paid = trySpendFuel(game.ship, report.fuelNeed);
  if (!paid.ok) return { ok: false, story: false, reason: `Need ${paid.need} fuel · tank ${Math.round(paid.have)}` };
  if (!report.legacy) game.transitCells = Math.max(0, (game.transitCells || 0) - 1);
  game.route.calibrated[galId] = true;
  if (game.galaxy?.id) game.route.calibrated[game.galaxy.id] = true;
  return { ok: true, legacy: report.legacy, fuel: report.fuelNeed };
}

export function markLegacyRoutes(game, visited) {
  ensureCareer(game);
  for (const id of Object.keys(visited || {})) {
    const row = visited[id];
    const on = row === true || !!(row && row.visited);
    if (!on) continue;
    game.route.calibrated[id] = true;
    game.route.legacy[id] = true;
  }
}

export function anchorStatus(game) {
  ensureCareer(game);
  const a = game.route.anchor;
  const visited = (game.universe?.galaxies || []).filter((g) => g.visited && g.id !== POCKET_ID).length;
  const rareLeft = Math.max(0, 4 - (a.rare || 0));
  const techLeft = Math.max(0, 4 - (a.tech || 0));
  return {
    built: !!a.built,
    galaxies: visited >= 3,
    galaxyCount: visited,
    fragments: (game.route.fragments || []).length >= 3,
    fragmentCount: (game.route.fragments || []).length,
    analyzer: hasModule(game, 'analyzer'),
    rp: (game.rp || 0) >= ANCHOR_RP || !!a.rpPaid,
    rareLeft, techLeft,
    rareHave: game.cargo?.rare_ore || 0,
    techHave: game.cargo?.tech || 0,
  };
}

export function contributeAnchor(game) {
  ensureCareer(game);
  const a = game.route.anchor;
  if (a.built) return { ok: false, reason: 'Anchor is already built' };
  const rareLeft = Math.max(0, 4 - (a.rare || 0));
  const techLeft = Math.max(0, 4 - (a.tech || 0));
  const rare = Math.min(rareLeft, game.cargo?.rare_ore || 0);
  const tech = Math.min(techLeft, game.cargo?.tech || 0);
  if (rare <= 0 && tech <= 0) return { ok: false, reason: 'Nothing to deliver' };
  if (rare) {
    game.cargo.rare_ore = Math.max(0, (game.cargo.rare_ore || 0) - rare);
    if (game.cargo.rare_ore <= 0) delete game.cargo.rare_ore;
    a.rare = (a.rare || 0) + rare;
  }
  if (tech) {
    game.cargo.tech = Math.max(0, (game.cargo.tech || 0) - tech);
    if (game.cargo.tech <= 0) delete game.cargo.tech;
    a.tech = (a.tech || 0) + tech;
  }
  return { ok: true, rare: a.rare, tech: a.tech };
}

export function refundAnchor(game) {
  ensureCareer(game);
  const a = game.route.anchor;
  if (a.built) return { ok: false, reason: 'The anchor is already lit' };
  if (a.rare) game.cargo.rare_ore = (game.cargo.rare_ore || 0) + a.rare;
  if (a.tech) game.cargo.tech = (game.cargo.tech || 0) + a.tech;
  a.rare = 0;
  a.tech = 0;
  return { ok: true };
}

export function buildAnchor(game) {
  const st = anchorStatus(game);
  if (st.built) return { ok: true, repeat: true };
  if (!st.galaxies) return { ok: false, reason: 'Visit 3 galaxies first' };
  if (!st.fragments) return { ok: false, reason: 'Need 3 story fragments from different wrecks' };
  if (!st.analyzer) return { ok: false, reason: 'Fit the anomaly analyzer' };
  if ((game.route.anchor.rare || 0) < 4 || (game.route.anchor.tech || 0) < 4) return { ok: false, reason: 'Deliver 4 t rare ore and 4 t tech' };
  if ((game.rp || 0) < ANCHOR_RP) return { ok: false, reason: `Need ${ANCHOR_RP} RP` };
  game.rp -= ANCHOR_RP;
  game.route.anchor.rpPaid = true;
  game.route.anchor.built = true;
  game.route.anchor.homeGalaxy = game.galaxy?.id || 'aetheria';
  game.route.anchor.homeSys = game.system?.id || '';
  if ((game.transitCells || 0) >= 1) {
    game.transitCells -= 1;
    game.route.anchor.reservedCell = true;
  }
  ensurePocket(game.universe);
  return { ok: true };
}

export function ensurePocket(universe) {
  if (!universe) return null;
  let g = universe.galaxies.find((x) => x.id === POCKET_ID);
  if (g) return g;
  g = generateGalaxy('VEIL-ANCHOR-1', {
    id: POCKET_ID,
    name: 'Veil Pocket',
    type: 'anchor pocket',
    systemCount: 4,
    arms: 0,
    tint: '#9ad7c4',
    story: false,
    worlds: ['exotic', 'toxic', 'ice', 'barren'],
    minPlanets: 3,
    maxPlanets: 5,
  });
  g.id = POCKET_ID;
  g.name = 'Veil Pocket';
  g.type = 'anchor pocket';
  g.blurb = 'A short chart on the far side of the anchor. Hydrogen is scarce. Storms run one step hotter.';
  g.curvature = 1.4;
  g.pos = { x: 8, y: 1, z: -6 };
  g.tint = '#9ad7c4';
  g.discovered = true;
  g.visited = false;
  g.rules = { hydrogen: 'g-only', hazardBias: 1, buyTax: 0.85 };
  for (const sys of g.systems || []) {
    if (sys.star) {
      const ok = sys.star.type === 'G';
      sys.star.hydrogen = ok;
      sys.star.fuelMul = ok ? 0.6 : 0;
    }
  }
  const drop = g.systems[0];
  if (drop) drop.hasGate = true;
  universe.galaxies.push(g);
  return g;
}

export function anchorJumpGate(game, returning) {
  ensureCareer(game);
  const a = game.route.anchor;
  if (!a.built) return { ok: false, reason: 'The anchor is not built' };
  const fuelNeed = 80;
  if ((game.ship?.fuel || 0) < fuelNeed) return { ok: false, story: false, reason: `Anchor hop needs ${fuelNeed} fuel · tank ${Math.round(game.ship?.fuel || 0)}` };
  if (!returning) {
    if ((game.transitCells || 0) < 1) return { ok: false, story: false, reason: 'Need a transit cell for the outbound hop' };
    if (!a.reservedCell) return { ok: false, story: false, reason: 'Reserve a second cell before the first exit — deliver it at the anchor desk' };
  } else if (!a.reservedCell) {
    return { ok: false, story: false, reason: 'The return cell was not reserved' };
  }
  return { ok: true, fuelNeed };
}

export function reserveReturnCell(game) {
  ensureCareer(game);
  if (!game.route.anchor.built) return { ok: false, reason: 'Build the anchor first' };
  if (game.route.anchor.reservedCell) return { ok: true, repeat: true };
  if ((game.transitCells || 0) < 1) return { ok: false, reason: 'Need a transit cell to reserve the ride home' };
  game.transitCells -= 1;
  game.route.anchor.reservedCell = true;
  return { ok: true };
}

export { POCKET_ID };
