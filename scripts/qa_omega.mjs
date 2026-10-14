import { trySpendFuel, probeIntake, holdMass, seedLedger, migrateFuel } from '../src/game/ledger.js';
import { tradePrices, tonsQty } from '../src/game/catalog.js';
import { commitOnce } from '../src/game/ops.js';
import {
  armExpedition, cancelExpedition, launchExpedition, chooseSite, accessBlock, grantReturnBonus, tickHazard,
  resolveEvent, landingBlock, fitModule,
} from '../src/game/expedition.js';
import { commitTransit, anchorStatus, buildAnchor, ensurePocket } from '../src/game/route.js';
import { galaxyOpen } from '../src/story/campaign.js';
import { STAR_TYPES } from '../src/world/galaxy.js';
import { generateUniverse, GALAXY_CATALOG } from '../src/world/universe.js';
import { accessRows, unlockWorldType, migrateWorldAccess } from '../src/game/planet-access.js';
import { buyGalaxyChart, chartRows } from '../src/game/galaxy-charts.js';

let failed = 0;
const ok = (name, cond) => {
  if (!cond) { failed++; console.error('FAIL', name); }
  else console.log('ok', name);
};

ok('tenths', tonsQty(1.26) === 1.3);
const prices = tradePrices(100);
ok('sell below buy', prices.sell < prices.buy);
ok('wd dry', STAR_TYPES.WD.hydrogen === false && STAR_TYPES.G.hydrogen === true);
ok('probe star mul', probeIntake(1, 999, 1, 1) === 12);

const ship = { fuel: 10, maxFuel: 480 };
ok('short fuel', trySpendFuel(ship, 11).ok === false && ship.fuel === 10);
ok('exact fuel', trySpendFuel({ fuel: 11, maxFuel: 480 }, 11).ok === true);

const game = { campaign: { flags: {} }, cargo: { metals: 2, minerals: 2 }, researched: {}, rp: 0, ship: { fuel: 400, maxFuel: 480, stats: { cargo: 16 } }, state: 'playing' };
seedLedger(game);
game.worldAccess.toxic = true;
const armed = armExpedition(game, { id: 'w1', type: 'rocky', name: 'Rock' });
ok('first arm is free', armed.ok && armed.free === true && game.kits === 4);
const cancelled = cancelExpedition(game);
ok('cancel restores the free survey', cancelled.refunded && game.kits === 4 && !game.campaign.flags.freeDeep);
const toxic = accessBlock(game, { id: 'tox', type: 'toxic' });
ok('toxic needs filter module', toxic && /Filtration/.test(toxic.reason));
game.fitted = ['filter1'];
game.filters = 1;
const launched = launchExpedition(game, { id: 'tox', type: 'toxic', name: 'Acid' });
ok('toxic launch once', launched.ok && game.filters === 0 && game.kits === 4);
const again = launchExpedition(game, { id: 'tox', type: 'toxic', name: 'Acid' });
ok('no second filter', again.resume && game.filters === 0);
chooseSite(game, 'rich');
const twice = chooseSite(game, 'safe');
ok('site once', twice.repeat === true || twice.ok === true && (game.cargo.rare_ore || 0) <= 1);
game.pendingReturn = true;
game.returnBonus = false;
const bonus = grantReturnBonus(game);
ok('return rp once', bonus.gained === 20 && grantReturnBonus(game).repeat === true);

const ops = {};
const host = { ops };
let n = 0;
commitOnce(host, 'a', () => { n += 1; return { ok: true, n }; });
commitOnce(host, 'a', () => { n += 1; return { ok: true, n }; });
ok('op once', n === 1);

ok('choir lock stays story', galaxyOpen({ ending: 'lock' }, 'choir') === false);
ok('veil is not the choir map', galaxyOpen({ ending: 'open' }, 'veil') === false);
ok('neighbour stays shut until charted', galaxyOpen({ ending: null }, 'kaluga') === false);
ok('a bought chart opens that galaxy', galaxyOpen({ ending: null, charts: { kaluga: true } }, 'kaluga') === true);

const dry = { fuel: 80, maxFuel: 480 };
migrateFuel(dry, { v: 2, fuel: 80, fuelMigrated: true });
ok('v2 tank kept', dry.fuel === 80);

game.flightLayer = 'atmo';
game.fitted = [];
game.atmoPlanet = { data: { type: 'lava' } };
game.hazard = 0;
tickHazard(game, 10);
ok('hazard climbs', game.hazard > 0);
game.state = 'paused';
const frozen = game.hazard;
tickHazard(game, 10);
ok('pause freezes hazard', game.hazard === frozen);

const routeGame = {
  campaign: { flags: {}, ending: null },
  universe: { homeId: 'aetheria', galaxies: [], filaments: [] },
  galaxy: { id: 'aetheria', systems: [] },
  ship: { fuel: 500, maxFuel: 480, stats: { hull: 100, cargo: 16 } },
  researched: {}, rp: 0, fitted: [], blueprints: {}, transitCells: 0, cargo: {},
};
const hop = commitTransit(routeGame, 'kaluga');
ok('uncharted galaxy is a story lock', hop.ok === false && hop.story === true);
routeGame.campaign.charts = { kaluga: true };
const hopCharted = commitTransit(routeGame, 'kaluga');
ok('charted galaxy fails on supplies, not story', hopCharted.ok === false && hopCharted.story === false);
ok('anchor not built by default', anchorStatus(routeGame).built === false);
const built = buildAnchor(routeGame);
ok('anchor refuses early', built.ok === false);
ok('mass tenths', holdMass({ cargo: { ice: 1.04 }, kits: 0, filters: 0, transitCells: 0 }) === 1);

const cleared = { lava: true, gas: true, exotic: true };
const lava = accessBlock({ fitted: ['thermal2'], heatPacks: 0, filters: 0, atmoProbes: 0, worldAccess: cleared }, { id: 'hot', type: 'lava' });
ok('lava needs a heat pack', lava && /heat pack/.test(lava.reason));
const gas = accessBlock({ fitted: [], atmoProbes: 0, worldAccess: cleared }, { id: 'g', type: 'gas' });
ok('gas needs a probe', gas && /probe/.test(gas.reason));
ok('exotic stays in orbit', /Exotic/.test(landingBlock({ worldAccess: cleared }, { type: 'exotic' }) || ''));

game.expedition.eventResolved = false;
game.expedition.eventId = 'quiet';
game.filters = 0;
const ev = resolveEvent(game, 'b');
ok('event choice once', ev.ok === true && resolveEvent(game, 'a').repeat === true);

const sheet = generateUniverse('QA-SHEET');
const home = sheet.galaxies.find((g) => g.id === 'aetheria');
const types = new Set((home.systems[0].planets || []).map((p) => p.type));
ok('home has a safe world and a toxic world', (types.has('rocky') || types.has('barren')) && types.has('toxic') && home.systems[0].planets.some((p) => p.story === 'dive'));
ok('home spawn is only the trade port', home.systems[0].stations.length === 1 && home.systems[0].stations[0].kind === 'hub_trade');
const away = sheet.galaxies.find((g) => g.id === 'kaluga');
ok('neighbour changes two rules', away.rules && away.rules.buyTax !== 1 && away.rules.hazardBias > 0);
const gate = away.systems[away.systems.length - 1];
const pad = gate.stations.find((s) => (s.market || []).some((row) => row.id === 'fuel' && row.stock >= 20));
ok('arrival pad stocks fuel', !!pad);

{
  const pilot = { campaign: { chapter: 1, flags: {} }, cargo: {}, ship: { fuel: 400, maxFuel: 480, stats: { cargo: 16 } }, state: 'playing', gallery: {} };
  seedLedger(pilot);
  ok('starter rocky open', accessBlock(pilot, { id: 'r1', type: 'rocky' }) === null && landingBlock(pilot, { id: 'r1', type: 'rocky' }) === null);
  const sealed = accessBlock(pilot, { id: 'd1', type: 'desert' });
  ok('desert sealed by story at ch1', sealed && sealed.story === true && /chapter 2/.test(sealed.reason));
  ok('locked world refuses atmosphere', /sealed/.test(landingBlock(pilot, { id: 'd1', type: 'desert' }) || ''));
  ok('story dive world stays open', accessBlock(pilot, { id: 'v', type: 'desert', story: 'dive' }) === null);
  ok('signal gas giant can be entered', landingBlock(pilot, { id: 's', type: 'gas', story: 'signal' }) === null);
  const early = unlockWorldType(pilot, 'desert');
  ok('unlock refused before chapter', early.ok === false && pilot.rp === 0);
  pilot.campaign.chapter = 2;
  ok('unlock refused without cargo', unlockWorldType(pilot, 'desert').ok === false);
  pilot.rp = 10;
  ok('unlock refused with RP only', unlockWorldType(pilot, 'desert').ok === false);
  pilot.cargo = { minerals: 10 };
  ok('unlock refused when the haul is short of RP', unlockWorldType(pilot, 'desert').ok === false);
  pilot.rp = 20;
  const paid = unlockWorldType(pilot, 'desert');
  ok('unlock spends cargo and RP once', paid.ok && pilot.rp === 0 && (pilot.cargo.minerals || 0) === 0
    && unlockWorldType(pilot, 'desert').repeat === true && pilot.rp === 0);
  ok('unlocked desert lands', landingBlock(pilot, { id: 'd1', type: 'desert' }) === null);
  const rows = accessRows(pilot);
  ok('menu lists 12 types without a galaxy', rows.length === 12 && rows.find((r) => r.type === 'exotic').state === 'sealed');
  pilot.campaign.ending = 'lock';
  ok('ending opens exotic for purchase', ['available', 'short'].includes(accessRows(pilot).find((r) => r.type === 'exotic').state));
  const u = generateUniverse();
  let moonFail = 0;
  let obsFail = 0;
  let matchFail = 0;
  let hubFail = 0;
  const requiredHubs = ['hub_trade', 'hub_refinery', 'hub_survey'];
  let yardN = 0;
  let arsenalN = 0;
  let portN = 0;
  for (const gal of u.galaxies) {
    const stations = gal.systems.flatMap((s) => s.stations || []);
    const surveys = stations.filter((st) => st.kind === 'hub_survey');
    if (surveys.length !== 1) obsFail++;
    for (const kind of requiredHubs) {
      if (stations.filter((st) => st.kind === kind).length !== 1) hubFail++;
    }
    const yards = stations.filter((st) => st.kind === 'hub_shipyard').length;
    const guns = stations.filter((st) => st.kind === 'hub_arsenal').length;
    if (yards > 1 || guns > 1) hubFail++;
    if (gal.id === 'aetheria' && yards !== 1) hubFail++;
    yardN += yards;
    arsenalN += guns;
    portN += stations.filter((st) => st.kind === 'orbital' || st.kind === 'outpost').length;
    const obs = surveys[0];
    if (obs && (obs.market || []).some((row) => row.id === 'minerals' || row.id === 'metals' || row.id === 'ice_ore')) hubFail++;
    const def = GALAXY_CATALOG.find((d) => d.id === gal.id);
    if (!def || [...def.worlds].join('|') !== [...(gal.worlds || [])].join('|')) matchFail++;
    const want = new Set(gal.worlds || []);
    const bodies = gal.systems.flatMap((s) => s.planets.flatMap((p) => [p, ...p.moons]));
    if (bodies.some((b) => !want.has(b.type))) matchFail++;
    for (const t of want) {
      if (!bodies.some((b) => b.type === t && b.kind === 'planet')) matchFail++;
    }
    const moons = bodies.filter((b) => b.kind === 'moon').length;
    const planets = bodies.filter((b) => b.kind === 'planet').length;
    if (moons > planets * 0.55 + 6) moonFail++;
  }
  ok('every galaxy has exactly one observatory', obsFail === 0);
  ok('every galaxy has one exchange, one refinery, one observatory', hubFail === 0);
  ok('shipyards and arsenals are not in every galaxy', yardN < u.galaxies.length && arsenalN < yardN);
  ok('small ports stay sparse', portN < u.galaxies.length * 4);
  ok('every galaxy observatory set matches generated types', matchFail === 0);
  ok('moons stay sparse across galaxies', moonFail === 0);
  pilot.galaxy = u.galaxies.find((x) => x.id === 'mensae');
  const local = accessRows(pilot).map((r) => r.type).sort().join(',');
  ok('observatory shows only this galaxy', local === [...pilot.galaxy.worlds].sort().join(','));
  const onlyTypes = new Set(pilot.galaxy.worlds);
  const strays = pilot.galaxy.systems.flatMap((s) => s.planets.flatMap((p) => [p, ...p.moons])).filter((b) => !onlyTypes.has(b.type));
  ok('galaxy generates only its own types', strays.length === 0);
  pilot.rp = 99;
  pilot.cargo = { minerals: 10, ice_ore: 10 };
  pilot.state = 'docked';
  pilot.dockedAt = { data: { kind: 'hub_trade' } };
  ok('licence needs an observatory', unlockWorldType(pilot, 'ice').ok === false);
  pilot.dockedAt = { data: { kind: 'hub_survey' } };
  ok('observatory refuses foreign types', unlockWorldType(pilot, 'lava').ok === false);
  ok('observatory licenses local type', unlockWorldType(pilot, 'ice').ok === true);
  pilot.galaxy = u.galaxies.find((x) => x.id === 'aetheria');
  pilot.universe = u;
  pilot.campaign.chapter = 1;
  pilot.route = { opened: false };
  const listed = chartRows(pilot);
  ok('charts name the worlds that galaxy has', listed.every((r) => {
    const def = GALAXY_CATALOG.find((d) => d.id === r.id);
    return def && def.worlds.join('|') === r.worlds.join('|');
  }));
  ok('neighbours are gated and far galaxies wait', listed.some((r) => r.state === 'sealed') && listed.some((r) => r.state === 'beyond'));
  pilot.campaign.chapter = 3;
  pilot.route.opened = true;
  pilot.dockedAt = { data: { kind: 'hub_survey' } };
  pilot.cargo = { minerals: 10, metals: 4 };
  pilot.rp = 20;
  const near = chartRows(pilot).find((r) => r.hereSells && r.depth === 1);
  const far = chartRows(pilot).find((r) => r.state === 'beyond');
  ok('home observatory refuses a far galaxy', !!far && buyGalaxyChart(pilot, far.id).ok === false);
  const bought = buyGalaxyChart(pilot, near.id);
  ok('home observatory charts a neighbour', bought.ok === true && galaxyOpen(pilot.campaign, near.id) === true);
  ok('chart spends the haul once', pilot.rp === 20 && (pilot.cargo.minerals || 0) === 0 && (pilot.cargo.metals || 0) === 0 && buyGalaxyChart(pilot, near.id).repeat === true);
  ok('survey data is not hold mass', holdMass({ cargo: { data: 5, minerals: 1 }, kits: 0, filters: 0, transitCells: 0 }) === 1);
  const fitGame = { state: 'docked', dockedAt: { data: { kind: 'hub_shipyard', id: 'yard' } }, cargo: { metals: 2 }, blueprints: { nav1: 1 }, fitted: [], moduleLocker: { yard: ['nav1'] }, rp: 0 };
  ok('locker module fits without ore', fitModule(fitGame, 'nav1').ok === true && fitGame.fitted.includes('nav1') && fitGame.moduleLocker.yard.length === 0);
  const bare = { state: 'docked', dockedAt: { data: { kind: 'hub_shipyard', id: 'yard' } }, cargo: {}, blueprints: { nav1: 1 }, fitted: [], moduleLocker: {}, rp: 0 };
  ok('fit names the missing stack', /Technology/.test(fitModule(bare, 'nav1').reason || '') && /Rare Earths/.test(fitModule(bare, 'nav1').reason || ''));
  const home = u.galaxies.find((x) => x.id === 'aetheria');
  ok('home galaxy has no exotic', !home.worlds.includes('exotic'));
  const legacy = { gallery: { a: { type: 'lava' } } };
  migrateWorldAccess(legacy, undefined);
  ok('old save keeps surveyed types', legacy.worldAccess.lava === true && legacy.worldAccess.rocky === true && !legacy.worldAccess.gas);
}

if (failed) {
  console.error(failed, 'failed');
  process.exit(1);
}
console.log('omega ok');
