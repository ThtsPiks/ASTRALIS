// Resource catalog. Numbers are the v2 prototype until a playtest changes them.

export const MASS_STEP = 0.1;
export const SLOT_COUNT = 3;
export const FUEL_UNITS_PER_TON = 40;
export const RESCUE_DEBT = 1500;
export const RESCUE_DEBT_CAP = 6000;
export const FIRST_RETURN_RP = 20;
export const ROUTE_OPEN_RP = 30;
export const NAV_BLUEPRINT_RP = 60;
export const ANCHOR_RP = 200;

export function tonsQty(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return 0;
  return Math.round(x * 10) / 10;
}

export function tradePrices(listed) {
  const buy = Math.max(1, Math.round(Number(listed) || 1));
  const sell = Math.max(1, Math.min(buy - 1, Math.round(buy * 0.82)));
  return { buy, sell };
}

export const MODULES = {
  thermal1: { id: 'thermal1', name: 'Thermal I', slot: 1, rp: 20, mass: { metals: 2, minerals: 1 }, protects: { heat: 1, cold: 1 } },
  filter1: { id: 'filter1', name: 'Filtration I', slot: 1, rp: 20, mass: { metals: 1, tech: 1 }, protects: { corrosion: 1 }, needs: 'filter' },
  seal1: { id: 'seal1', name: 'Seal I', slot: 1, rp: 20, mass: { metals: 2, tech: 1 }, protects: { water: 1 } },
  abrasion1: { id: 'abrasion1', name: 'Abrasion I', slot: 1, rp: 15, mass: { metals: 2 }, protects: { dust: 1 } },
  atmo1: { id: 'atmo1', name: 'Atmosphere module', slot: 1, rp: 30, mass: { metals: 2, tech: 1 }, protects: { pressure: 1 } },
  thermal2: { id: 'thermal2', name: 'Thermal II', slot: 1, rp: 50, replaces: 'thermal1', needModule: 'thermal1', mass: { rare_ore: 2, tech: 2 }, protects: { heat: 2, cold: 1 } },
  nav1: { id: 'nav1', name: 'Navigation I', slot: 1, rp: NAV_BLUEPRINT_RP, mass: { metals: 2, tech: 2, rare_ore: 1 }, protects: {} },
  analyzer: { id: 'analyzer', name: 'Anomaly analyzer', slot: 1, rp: 100, mass: { rare_ore: 2, tech: 3 }, protects: { anomaly: 1 } },
};

export const RECIPES = [
  { id: 'kits3', name: '3 scan kits', known: true, out: 'kits', count: 3, mass: { metals: 1, minerals: 1 }, outMass: 0.6 },
  { id: 'filters3', name: '3 filters', known: true, out: 'filters', count: 3, mass: { minerals: 1, tech: 1 }, outMass: 0.6 },
  { id: 'heat3', name: '3 heat packs', known: false, out: 'heatPacks', count: 3, mass: { minerals: 1, rare_ore: 1 }, outMass: 0.6 },
  { id: 'probes3', name: '3 atmosphere probes', known: false, out: 'atmoProbes', count: 3, mass: { metals: 1, minerals: 1 }, outMass: 0.6 },
  { id: 'cells2', name: '2 transit cells', known: false, out: 'transitCells', count: 2, mass: { rare_ore: 1, tech: 1 }, outMass: 1 },
];

export const WORLD_ACCESS = {
  rocky: { access: 'land', hazard: { heat: 0, cold: 0, corrosion: 0 } },
  barren: { access: 'land', hazard: { heat: 0, cold: 0, corrosion: 0 } },
  desert: { access: 'land', module: 'thermal1', hazard: { heat: 1 } },
  rust: { access: 'land', hazard: { heat: 1, dust: 1 } },
  terra: { access: 'land', hazard: { heat: 0 } },
  marsh: { access: 'platform', module: 'seal1', hazard: { water: 1 } },
  ocean: { access: 'platform', module: 'seal1', hazard: { water: 1 } },
  salt: { access: 'land', hazard: { heat: 0, cold: 0 } },
  ash: { access: 'land', module: 'thermal1', hazard: { heat: 1 } },
  ice: { access: 'land', module: 'thermal1', hazard: { cold: 1 } },
  toxic: { access: 'expedition', module: 'filter1', pack: 'filter', hazard: { corrosion: 1 } },
  lava: { access: 'probe', module: 'thermal2', pack: 'heat', hazard: { heat: 2 } },
  carbon: { access: 'land', optional: 'abrasion1', hazard: { dust: 1 } },
  gas: { access: 'atmo-probe', module: 'atmo1', pack: 'probe', solid: false, hazard: { pressure: 2 } },
  icegiant: { access: 'atmo-probe', module: 'atmo1', pack: 'probe', solid: false, hazard: { pressure: 2, cold: 1 } },
  exotic: { access: 'remote', module: 'analyzer', hazard: { anomaly: 1 } },
};

export const EVENTS = [
  { id: 'storm', title: 'Toxic squall', text: 'The wind turns the survey short.', a: 'Leave with the smaller haul', b: 'Spend a spare filter and stay', need: 'filter' },
  { id: 'beacon', title: 'Dead beacon', text: 'A marker can be repaired or stripped.', a: 'Spend 1 t metals to mark a safe lane', b: 'Strip the parts' },
  { id: 'sample', title: 'Living sample', text: 'A clean container or a distant look.', a: 'Take the sample — spends a kit', b: 'Watch from range — less science' },
  { id: 'distress', title: 'Distress ping', text: 'Someone is low on fuel.', a: 'Share 40 fuel units', b: 'Send coordinates only' },
  { id: 'cache', title: 'Sealed cache', text: 'The lock takes time or a cut.', a: 'Open it slowly — certain minerals', b: 'Cut it — rare ore, hull risk' },
  { id: 'quiet', title: 'Quiet site', text: 'Nothing moves. The chart is still useful.', a: 'Log it and lift', b: 'Walk the rim for a second crate' },
];

export function worldAccess(type) {
  return WORLD_ACCESS[type] || WORLD_ACCESS.rocky;
}

export function hasModule(game, id) {
  return Array.isArray(game?.fitted) && game.fitted.includes(id);
}

export function protection(game) {
  const lvl = { heat: 0, cold: 0, corrosion: 0, water: 0, dust: 0, pressure: 0, anomaly: 0 };
  for (const id of game?.fitted || []) {
    const mod = MODULES[id];
    if (!mod) continue;
    for (const k of Object.keys(mod.protects || {})) lvl[k] = Math.max(lvl[k] || 0, mod.protects[k] || 0);
  }
  return lvl;
}

export function blankRoute() {
  return {
    calibrated: {},
    legacy: {},
    opened: false,
    fragments: [],
    anchor: { rare: 0, tech: 0, built: false, reservedCell: false, homeGalaxy: 'aetheria', homeSys: '' },
  };
}

export function ensureCareer(game) {
  if (!game) return;
  if (!Array.isArray(game.fitted)) game.fitted = [];
  if (!game.blueprints || typeof game.blueprints !== 'object') game.blueprints = { kits3: 1, filters3: 1 };
  if (!game.deposits || typeof game.deposits !== 'object') game.deposits = {};
  if (!game.pinned || typeof game.pinned !== 'object') game.pinned = {};
  if (!game.ops || typeof game.ops !== 'object') game.ops = {};
  if (!game.published || typeof game.published !== 'object') game.published = {};
  if (!game.moduleLocker || typeof game.moduleLocker !== 'object') game.moduleLocker = {};
  if (!game.overflow || typeof game.overflow !== 'object') game.overflow = {};
  if (!game.route) game.route = blankRoute();
  if (!game.route.anchor) game.route.anchor = blankRoute().anchor;
  game.debt = Math.max(0, Number(game.debt) || 0);
  game.heatPacks = Math.max(0, Number(game.heatPacks) || 0);
  game.atmoProbes = Math.max(0, Number(game.atmoProbes) || 0);
  game.specimens = tonsQty(game.specimens || 0);
  game.hazard = Math.max(0, Math.min(100, Number(game.hazard) || 0));
  game.oreShield = Math.max(0, Number(game.oreShield) || 0);
  game.returnBonus = !!game.returnBonus;
  game.pendingReturn = !!game.pendingReturn;
  game.legacyScanRp = !!game.legacyScanRp;
}

export function careerSnapshot(game) {
  ensureCareer(game);
  return {
    fitted: [...game.fitted],
    blueprints: { ...game.blueprints },
    deposits: { ...game.deposits },
    pinned: { ...game.pinned },
    ops: game.ops,
    published: { ...game.published },
    moduleLocker: game.moduleLocker,
    overflow: { ...game.overflow },
    route: game.route,
    debt: game.debt,
    heatPacks: game.heatPacks,
    atmoProbes: game.atmoProbes,
    specimens: game.specimens,
    hazard: game.hazard,
    oreShield: game.oreShield,
    returnBonus: game.returnBonus,
    pendingReturn: game.pendingReturn,
    legacyScanRp: game.legacyScanRp,
    lastPort: game.lastPort || null,
    worldAccess: { ...(game.worldAccess || {}) },
  };
}

export function restoreCareer(game, data) {
  const d = data || {};
  game.fitted = Array.isArray(d.fitted) ? d.fitted.filter((id) => MODULES[id]).slice(0, SLOT_COUNT) : [];
  game.blueprints = d.blueprints && typeof d.blueprints === 'object' ? { ...d.blueprints } : {};
  game.deposits = d.deposits && typeof d.deposits === 'object' ? { ...d.deposits } : {};
  game.pinned = d.pinned && typeof d.pinned === 'object' ? { ...d.pinned } : {};
  game.ops = d.ops && typeof d.ops === 'object' ? { ...d.ops } : {};
  game.published = d.published && typeof d.published === 'object' ? { ...d.published } : {};
  game.moduleLocker = d.moduleLocker && typeof d.moduleLocker === 'object' ? d.moduleLocker : {};
  game.overflow = d.overflow && typeof d.overflow === 'object' ? { ...d.overflow } : {};
  game.route = d.route && typeof d.route === 'object' ? d.route : blankRoute();
  if (!game.route.anchor) game.route.anchor = blankRoute().anchor;
  if (!game.route.calibrated) game.route.calibrated = {};
  if (!game.route.legacy) game.route.legacy = {};
  if (!Array.isArray(game.route.fragments)) game.route.fragments = [];
  game.debt = Math.max(0, Number(d.debt) || 0);
  game.heatPacks = Math.max(0, Number(d.heatPacks) || 0);
  game.atmoProbes = Math.max(0, Number(d.atmoProbes) || 0);
  game.specimens = tonsQty(d.specimens || 0);
  game.hazard = 0;
  game.oreShield = Math.max(0, Number(d.oreShield) || 0);
  game.returnBonus = !!d.returnBonus;
  game.pendingReturn = !!d.pendingReturn;
  game.legacyScanRp = !!d.legacyScanRp;
  game.lastPort = d.lastPort || null;
  if (!game.blueprints.kits3) game.blueprints.kits3 = 1;
  if (!game.blueprints.filters3) game.blueprints.filters3 = 1;
  ensureCareer(game);
}

export function packMass(game) {
  return tonsQty((game?.heatPacks || 0) * 0.2 + (game?.atmoProbes || 0) * 0.2 + (game?.specimens || 0) * 0.1);
}
