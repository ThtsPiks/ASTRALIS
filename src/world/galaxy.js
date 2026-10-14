// ============================================================================
//  GALAXY GENERATOR
//  Deterministic, seeded. Produces star systems, stars, planets, moons,
//  rings, belts, stations, wrecks, factions, economies and markets.
// ============================================================================
import { RNG, Simplex, fbm } from '../core/rng.js';
import { clamp, lerp, toRoman, TAU } from '../core/utils.js';
import { dossier, STELLAR, gameOrbitFromAu, auFromGameOrbit, keplerMeanMotion, C, typeFromTeq } from './physics.js?v=chart1';
import { stationServices } from '../game/station-services.js?v=omega14';
import { economyPriceMult, hubKindForSystem, economyForHubKind, hubMarketBook, stationScale, isHubKind, routeHint } from '../game/career.js?v=sky2';

export const GALAXY_SEED = 'AETHERIA-EXPANSE-2077';
export const GALAXY_NAME = 'Aetheria Expanse';

// ---------------------------------------------------------------- star types
export const STAR_TYPES = {
  M: { label: 'Red Dwarf', color: 0xff9a5c, hex: '#ff9a5c', temp: 3200, radius: 250, lum: 0.35, weight: 26, hydrogen: true, fuelMul: 0.7 },
  K: { label: 'Orange Dwarf', color: 0xffc46b, hex: '#ffc46b', temp: 4600, radius: 330, lum: 0.7, weight: 18, hydrogen: true, fuelMul: 0.85 },
  G: { label: 'Yellow Dwarf', color: 0xfff3c9, hex: '#fff3c9', temp: 5800, radius: 400, lum: 1.0, weight: 15, hydrogen: true, fuelMul: 1 },
  F: { label: 'White Dwarf Star', color: 0xffffff, hex: '#ffffff', temp: 7000, radius: 460, lum: 2.4, weight: 11, hydrogen: true, fuelMul: 1.15 },
  A: { label: 'Blue White', color: 0xcfe0ff, hex: '#cfe0ff', temp: 9200, radius: 540, lum: 6.0, weight: 7, hydrogen: true, fuelMul: 1.3 },
  B: { label: 'Blue Giant', color: 0x9db9ff, hex: '#9db9ff', temp: 17000, radius: 700, lum: 18.0, weight: 4, hydrogen: false, fuelMul: 0 },
  RG: { label: 'Red Giant', color: 0xff6a3d, hex: '#ff6a3d', temp: 3800, radius: 1500, lum: 30.0, weight: 4, hydrogen: true, fuelMul: 1.4 },
  WD: { label: 'White Dwarf', color: 0xe6f2ff, hex: '#e6f2ff', temp: 14000, radius: 70, lum: 0.05, weight: 3, hydrogen: false, fuelMul: 0 },
};

// --------------------------------------------------------------- planet types
export const PLANET_TYPES = {
  lava: {
    label: 'Molten World', habitable: false,
    colors: ['#2b0d07', '#7a1d05', '#ff5a12', '#ffd257'],
    atmo: { color: '#ff6a2a', density: 0.35, height: 0.035 },
    baseValue: 900,
  },
  barren: {
    label: 'Barren Rock', habitable: false,
    colors: ['#4a4540', '#6d665e', '#8d857a', '#b3a99b'],
    atmo: null, baseValue: 420,
  },
  rocky: {
    label: 'Rocky World', habitable: false,
    colors: ['#5a4a3c', '#7d6a55', '#9c8a72', '#c2b39a'],
    atmo: { color: '#c9a97e', density: 0.18, height: 0.022 },
    baseValue: 620,
  },
  desert: {
    label: 'Desert World', habitable: true,
    colors: ['#a86f34', '#d39a4e', '#eec47f', '#fff0c6'],
    atmo: { color: '#f0c98a', density: 0.3, height: 0.03 },
    baseValue: 1100,
  },
  toxic: {
    label: 'Toxic World', habitable: false,
    colors: ['#3f4a17', '#6f8a1e', '#a8c62c', '#dff07a'],
    atmo: { color: '#b6e04a', density: 0.55, height: 0.05 },
    baseValue: 980,
  },
  terra: {
    label: 'Terrestrial', habitable: true,
    colors: ['#1a4d2e', '#2f7d4f', '#7ea85c', '#cbbd93'],
    atmo: { color: '#7fc4ff', density: 0.5, height: 0.045 },
    baseValue: 4200,
  },
  ocean: {
    label: 'Ocean World', habitable: true,
    colors: ['#08304f', '#0e5c8a', '#1e90c8', '#bfe9f5'],
    atmo: { color: '#8ad4ff', density: 0.62, height: 0.055 },
    baseValue: 3400,
  },
  ice: {
    label: 'Frozen World', habitable: false,
    colors: ['#8fa8bd', '#c3d8e8', '#e8f4ff', '#ffffff'],
    atmo: { color: '#dff0ff', density: 0.22, height: 0.026 },
    baseValue: 780,
  },
  carbon: {
    label: 'Carbon World', habitable: false,
    colors: ['#0e0e12', '#22222b', '#3a3a48', '#5b5b6e'],
    atmo: { color: '#7a6cff', density: 0.2, height: 0.024 },
    baseValue: 1650,
  },
  gas: {
    label: 'Gas Giant', habitable: false,
    colors: ['#5c2e0c', '#c17a32', '#e8c98a', '#f6ead2'],
    atmo: { color: '#efc896', density: 0.82, height: 0.055 },
    baseValue: 1500,
  },
  icegiant: {
    label: 'Ice Giant', habitable: false,
    colors: ['#1b3f6b', '#2a6ea8', '#57b6dd', '#b6ecff'],
    atmo: { color: '#7fe0ff', density: 0.75, height: 0.065 },
    baseValue: 1400,
  },
  exotic: {
    label: 'Exotic Anomaly', habitable: false,
    colors: ['#2a0a4a', '#6b1fa8', '#c04cf0', '#ff9ef0'],
    atmo: { color: '#c96bff', density: 0.9, height: 0.08 },
    baseValue: 9000,
  },
  rust: {
    label: 'Iron World', habitable: false,
    colors: ['#3a120c', '#8a2e18', '#c45a32', '#e7a07a'],
    atmo: { color: '#e0a090', density: 0.16, height: 0.02 },
    baseValue: 740,
  },
  ash: {
    label: 'Ash World', habitable: false,
    colors: ['#14110f', '#3a302c', '#6a4030', '#ff7a3a'],
    atmo: { color: '#c47a58', density: 0.22, height: 0.026 },
    baseValue: 860,
  },
  marsh: {
    label: 'Marsh World', habitable: true,
    colors: ['#0c2414', '#1d4a28', '#7ea84a', '#d6e6a0'],
    atmo: { color: '#b7e08a', density: 0.58, height: 0.05 },
    baseValue: 2600,
  },
  salt: {
    label: 'Salt Flat', habitable: false,
    colors: ['#c4b2a4', '#e6d2c4', '#f4e6dc', '#fff8f2'],
    atmo: { color: '#f0e4da', density: 0.12, height: 0.018 },
    baseValue: 690,
  },
};

export const ZONE_ORDER = ['lava', 'ash', 'barren', 'rocky', 'rust', 'desert', 'toxic', 'terra', 'marsh', 'ocean', 'ice', 'salt', 'carbon', 'gas', 'icegiant'];

// ------------------------------------------------------------------ economy
export const COMMODITIES = [
  { id: 'fuel', name: 'Hydrogen Fuel', base: 90, unit: 't', legal: true },
  { id: 'water', name: 'Water', base: 60, unit: 't', legal: true },
  { id: 'food', name: 'Food Rations', base: 180, unit: 't', legal: true },
  { id: 'metals', name: 'Metals', base: 480, unit: 't', legal: true },
  { id: 'minerals', name: 'Minerals', base: 220, unit: 't', legal: true },
  { id: 'ice_ore', name: 'Ice Ore', base: 90, unit: 't', legal: true },
  { id: 'rare_ore', name: 'Rare Earths', base: 980, unit: 't', legal: true },
  { id: 'medicine', name: 'Medicine', base: 900, unit: 't', legal: true },
  { id: 'tech', name: 'Technology', base: 1400, unit: 't', legal: true },
  { id: 'luxuries', name: 'Luxuries', base: 2100, unit: 't', legal: true },
  { id: 'data', name: 'Research Data', base: 760, unit: 'cr', legal: true },
  { id: 'slaves', name: 'Contraband', base: 3200, unit: 't', legal: false },
  { id: 'narcotics', name: 'Stims', base: 4100, unit: 't', legal: false },
  { id: 'weapons', name: 'Restricted Arms', base: 2800, unit: 't', legal: false },
];

export const ECONOMIES = {
  industrial: { label: 'Industrial', buys: ['food', 'water', 'minerals'], sells: ['tech', 'metals', 'fuel', 'medicine'] },
  agricultural: { label: 'Agricultural', buys: ['tech', 'medicine', 'metals'], sells: ['food', 'water', 'luxuries'] },
  mining: { label: 'Mining', buys: ['food', 'water', 'medicine'], sells: ['minerals', 'ice_ore', 'rare_ore', 'metals'] },
  research: { label: 'Research', buys: ['rare_ore', 'data', 'food'], sells: ['tech', 'medicine'] },
  trade: { label: 'Trade Hub', buys: ['metals', 'luxuries', 'tech'], sells: ['fuel', 'water', 'food'] },
  military: { label: 'Military', buys: ['tech', 'luxuries', 'metals'], sells: ['fuel', 'medicine'] },
};

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
  gateway: 'Filament Gate',
};

export const FACTIONS = [
  { id: 'fed', name: 'Terran Concord', color: '#6fd3ff', aggr: 0.2 },
  { id: 'ind', name: 'Free Colonies', color: '#9dff8a', aggr: 0.5 },
  { id: 'syn', name: 'Syndicate of Vhel', color: '#ff9d5c', aggr: 0.85 },
  { id: 'cul', name: 'Void Choir', color: '#d08aff', aggr: 1.0 },
  { id: 'none', name: 'Unclaimed', color: '#9aa4b2', aggr: 0.6 },
];

const GREEK = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega'];
const GENITIVE = ['Cygni', 'Orionis', 'Lyrae', 'Draconis', 'Aquilae', 'Pegasi', 'Andromedae', 'Cassiopeiae', 'Ceti', 'Eridani', 'Hydrae', 'Leonis', 'Ursae', 'Tauri', 'Geminorum', 'Virginis', 'Scorpii', 'Sagittarii', 'Carinae', 'Velorum', 'Centauri', 'Boötis', 'Herculis', 'Ophiuchi', 'Serpentis', 'Arae', 'Coronae', 'Delphini', 'Fornacis', 'Horologii', 'Lacertae', 'Lupi', 'Mensae', 'Normae', 'Octantis', 'Pavonis', 'Phoenicis', 'Pictoris', 'Piscium', 'Reticuli', 'Sculptoris', 'Telescopii', 'Trianguli', 'Tucanae', 'Volantis', 'Vulpeculae'];
const CATALOG = ['NGC', 'HD', 'KOI', 'GJ', 'TRAPPIST', 'WASP', 'Kepler', 'TOI', 'LHS', 'Ross'];

export const BIOME_NAMES = ['cryo', 'silica', 'ferrous', 'aurum', 'xenic', 'thal', 'vorn', 'quasar', 'nyx', 'helios'];

// ---------------------------------------------------------------------------

function makeStarName(rng, index) {
  const style = rng.next();
  if (style < 0.55) return `${rng.pick(GREEK)} ${rng.pick(GENITIVE)}`;
  if (style < 0.8) return `${rng.pick(CATALOG)}-${rng.int(100, 9999)}`;
  return `${rng.pick(CATALOG)} ${rng.int(1, 899)}${rng.pick(['', ' b', ' A', ' c'])}`;
}

function composition(rng, type) {
  const table = {
    lava: ['Iron', 'Silicates', 'Sulfur', 'Basalt'],
    ash: ['Volcanic ash', 'Basalt', 'Sulfur', 'Iron'],
    barren: ['Silicates', 'Iron', 'Nickel', 'Regolith'],
    rocky: ['Silicates', 'Iron', 'Magnesium', 'Water ice'],
    rust: ['Iron oxide', 'Hematite', 'Silicates', 'Dust'],
    desert: ['Silica sand', 'Iron oxide', 'Sulfates', 'Trace water'],
    toxic: ['Methane', 'Ammonia', 'Sulfuric acid', 'Chlorine'],
    terra: ['Nitrogen', 'Oxygen', 'Liquid water', 'Silicates'],
    marsh: ['Wet soil', 'Methane', 'Nitrogen', 'Organics'],
    ocean: ['Liquid water', 'Salts', 'Nitrogen', 'Silicates'],
    ice: ['Water ice', 'Ammonia', 'Methane ice', 'Silicates'],
    salt: ['Halite', 'Gypsum', 'Silicates', 'Trace brine'],
    carbon: ['Graphite', 'Diamond', 'Carbides', 'Iron'],
    gas: ['Hydrogen', 'Helium', 'Methane', 'Ammonia'],
    icegiant: ['Water', 'Ammonia', 'Methane', 'Hydrogen'],
    exotic: ['Degenerate matter', 'Unknown lattice', 'Chroniton traces', '—'],
  };
  return rng.shuffle([...(table[type] || table.rocky)]).slice(0, 4);
}

function planetTypeForZone(rng, zone, starType) {
  const w = {
    hot: { lava: 34, barren: 20, rocky: 16, carbon: 8, desert: 12, toxic: 6, gas: 3, icegiant: 1 },
    warm: { desert: 24, rocky: 18, barren: 12, terra: 12, ocean: 8, toxic: 14, ice: 4, gas: 6, carbon: 2 },
    life: { terra: 26, ocean: 24, desert: 12, toxic: 10, ice: 8, rocky: 8, barren: 4, gas: 6, carbon: 2 },
    cold: { ice: 40, barren: 16, rocky: 12, gas: 16, icegiant: 12, toxic: 4 },
    outer: { gas: 42, icegiant: 34, ice: 18, barren: 6 },
  }[zone];
  if (starType === 'RG') { delete w.terra; delete w.ocean; w.lava = (w.lava || 0) + 20; }
  if (starType === 'WD') { w.carbon = (w.carbon || 0) + 12; w.exotic = 3; }
  const keys = Object.keys(w);
  return rng.weighted(keys, (k) => w[k]);
}

function zoneOf(ratio) {
  if (ratio < 0.28) return 'hot';
  if (ratio < 0.55) return 'warm';
  if (ratio < 0.85) return 'life';
  if (ratio < 1.4) return 'cold';
  return 'outer';
}

// ---------------------------------------------------------------------------

function makeMoon(rng, parent, idx, star) {
  const types = ['barren', 'rocky', 'ice', 'lava', 'carbon'];
  const t = allowType(parent.type === 'gas' || parent.type === 'icegiant'
    ? rng.weighted(types, (k) => ({ barren: 5, rocky: 4, ice: 6, lava: parent.type === 'gas' ? 2 : 0, carbon: 1 }[k]))
    : rng.pick(['barren', 'rocky', 'ice']), true);
  const radius = rng.range(5, 18) * (parent.type === 'gas' ? 1.5 : 1);
  const def = PLANET_TYPES[t];
  return {
    id: `${parent.id}-m${idx}`,
    name: `${parent.name} ${toRoman(idx + 1)}`,
    kind: 'moon',
    type: t,
    radius,
    orbitRadius: parent.radius * rng.range(2.4, 6.5) + radius * 2,
    orbitSpeed: rng.range(0.06, 0.22) * (rng.chance(0.15) ? -1 : 1),
    orbitPhase: rng.range(0, TAU),
    inclination: rng.range(-0.35, 0.35),
    rotSpeed: rng.range(0.002, 0.006) * (rng.chance(0.2) ? -1 : 1),
    seed: rng.int(1, 2 ** 30),
    colors: [def.colors[0], def.colors[1], def.colors[2], def.colors[3]],
    atmo: null,
    clouds: 0,
    rings: null,
    temp: Math.round(parent.temp * rng.range(0.85, 1.1)),
    gravity: +(radius / 60 * 9.81 * rng.range(0.4, 1.0)).toFixed(2),
    mass: +(radius ** 3 / 60 ** 3).toFixed(3),
    physics: dossier(star || { type: 'G', temp: 5772 }, parent.orbitRadius || 20000, t, radius),
    composition: composition(rng, t),
    value: Math.round(def.baseValue * 0.35 * (radius / 40)),
    discovered: false, scanned: false, scanProgress: 0,
    landable: true,
  };
}

export const ALL_WORLD_TYPES = ['rocky', 'barren', 'terra', 'ocean', 'marsh', 'desert', 'rust', 'ice', 'salt', 'toxic', 'carbon', 'ash', 'lava', 'gas', 'icegiant', 'exotic'];
const GIANTS = new Set(['gas', 'icegiant', 'exotic']);
const NEAREST = {
  rocky: ['rocky', 'barren', 'desert', 'carbon', 'ice', 'terra'],
  barren: ['barren', 'rocky', 'ice', 'carbon', 'desert'],
  desert: ['desert', 'rust', 'rocky', 'carbon', 'barren', 'lava'],
  terra: ['terra', 'marsh', 'ocean', 'rocky', 'desert', 'ice'],
  ocean: ['ocean', 'marsh', 'terra', 'salt', 'rocky'],
  marsh: ['marsh', 'terra', 'ocean', 'toxic', 'desert'],
  ice: ['ice', 'salt', 'barren', 'rocky', 'ocean'],
  salt: ['salt', 'ice', 'barren', 'rocky', 'desert'],
  toxic: ['toxic', 'marsh', 'desert', 'carbon', 'rocky'],
  rust: ['rust', 'rocky', 'desert', 'barren', 'carbon'],
  ash: ['ash', 'lava', 'barren', 'rocky', 'rust'],
  lava: ['lava', 'ash', 'carbon', 'desert', 'rocky', 'toxic'],
  carbon: ['carbon', 'rocky', 'barren', 'lava'],
  gas: ['gas', 'icegiant', 'exotic'],
  icegiant: ['icegiant', 'gas', 'exotic'],
  exotic: ['exotic', 'gas', 'icegiant'],
};
let WORLD_SET = null;

function allowType(type, solidOnly = false, climate = null) {
  const legal = (t) => (!WORLD_SET || WORLD_SET.has(t)) && !(solidOnly && GIANTS.has(t));
  const fit = (t) => legal(t) && (!climate || fitsClimate(t, climate.teq, climate.aAu));
  if (fit(type)) return type;
  const order = [...(NEAREST[type] || []), ...ALL_WORLD_TYPES];
  return order.find(fit) || order.find(legal) || type;
}

function nudgeHex(hex, seed, slot) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (!Number.isFinite(n)) return hex;
  const swing = ((seed >> (slot * 4)) & 31) - 15;
  const ch = (v, k) => Math.max(0, Math.min(255, v + Math.round(swing * k)));
  const r = ch((n >> 16) & 255, 1);
  const g = ch((n >> 8) & 255, slot === 1 ? 0.45 : 0.7);
  const b = ch(n & 255, slot === 2 ? 1 : 0.35);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Star class may forbid a world. It does not replace the temperature ladder. */
function starSkew(type, starType) {
  const hot = starType === 'B' || starType === 'A' || starType === 'RG';
  if (hot && (type === 'terra' || type === 'ocean' || type === 'marsh')) return starType === 'RG' ? 'ash' : 'rust';
  if (starType === 'M' && (type === 'terra' || type === 'marsh')) return 'barren';
  if (starType === 'M' && type === 'ocean') return 'ice';
  if (starType === 'WD' && (type === 'terra' || type === 'ocean' || type === 'marsh' || type === 'desert' || type === 'gas')) return 'carbon';
  if (starType === 'F' && type === 'terra') return 'desert';
  return type;
}

function makePlanet(rng, sys, idx, orbitRadius, zone, starTemp, starLum) {
  const probe = dossier(sys.star, orbitRadius, 'rocky', 60);
  const giant = probe.aAu > 3.8 && rng.chance(Math.min(0.82, 0.18 + (probe.aAu - 3.5) * 0.12));
  let type = typeFromTeq(probe.teq, rng, { giant });
  if (rng.chance(WORLD_SET?.has('exotic') ? 0.1 : 0.008)) type = 'exotic';
  type = allowType(starSkew(type, sys.star?.type), false, { teq: probe.teq, aAu: probe.aAu });
  return finalizePlanet(rng, sys, idx, orbitRadius, zone, starTemp, starLum, type);
}

function fitsClimate(type, teq, aAu) {
  if (type === 'lava') return teq >= 700;
  if (type === 'ash') return teq >= 520 && teq < 1100;
  if (type === 'rust') return teq >= 280 && teq < 640;
  if (type === 'desert') return teq >= 300 && teq < 760;
  if (type === 'terra' || type === 'ocean' || type === 'marsh') return teq >= 245 && teq <= 315;
  if (type === 'salt') return teq >= 190 && teq <= 340;
  if (type === 'ice') return teq <= 180;
  if (type === 'toxic') return teq >= 220 && teq <= 520;
  if (type === 'gas') return aAu >= 1.2;
  if (type === 'icegiant') return aAu >= 2.2 && teq < 200;
  if (type === 'carbon') return teq <= 220 || teq >= 600;
  return true;
}

function orbitForClimate(sys, type) {
  const goal = { lava: 1100, ash: 780, rust: 420, desert: 430, terra: 288, ocean: 286, marsh: 292, toxic: 360, ice: 130, salt: 250, carbon: 150, gas: 160, icegiant: 90, rocky: 250, barren: 220, exotic: 180 }[type] || 280;
  const far = type === 'gas' || type === 'icegiant';
  const lo = gameOrbitFromAu(0.14);
  const hi = gameOrbitFromAu(14);
  let a = gameOrbitFromAu(far ? 6 : 1);
  for (let k = 0; k < 14; k++) {
    const teq = dossier(sys.star, a, type, far ? 200 : 70).teq;
    if (Math.abs(teq - goal) < 18) break;
    a *= Math.max(0.45, Math.min(2.4, (teq / goal) ** 2));
    a = clamp(a, lo, hi);
  }
  return clamp(a, lo, hi);
}

function coverWorlds(systems, meta) {
  if (!WORLD_SET) return;
  const planets = () => systems.flatMap((s) => s.planets);
  const count = (t) => planets().filter((p) => p.type === t).length;
  const start = meta.story ? 1 : 0;
  for (const type of WORLD_SET) {
    if (count(type) > 0) continue;
    const giant = GIANTS.has(type);
    let host = null;
    let pick = null;
    for (let i = systems.length - 1; i >= start && !pick; i--) {
      const sys = systems[i];
      if (sys.storyTag) continue;
      pick = sys.planets.find((p) => !p.story && count(p.type) > 1 && fitsClimate(type, p.physics?.teq, p.physics?.aAu));
      if (pick) host = sys;
    }
    if (pick && host) {
      paintWorld(pick, host, type, pick.name);
      if (giant && pick.radius < 150) pick.radius = 180;
      if (!giant && pick.radius > 120) pick.radius = 80;
    }
    if (count(type) > 0) continue;
    let placed = null;
    for (const sys of systems) {
      if (sys.storyTag) continue;
      const orbit = orbitForClimate(sys, type);
      const phys = dossier(sys.star, orbit, type, giant ? 200 : 70);
      if (!fitsClimate(type, phys.teq, phys.aAu)) continue;
      placed = { sys, orbit };
      break;
    }
    if (!placed) continue;
    const made = finalizePlanet(new RNG(`${placed.sys.seed}:cover:${type}`), placed.sys, placed.sys.planets.length, placed.orbit, giant ? 'outer' : 'inner', placed.sys.star.temp, placed.sys.star.lum, type);
    placed.sys.planets.push(made);
  }
  for (const sys of systems) sys.planets.sort((a, b) => a.orbitRadius - b.orbitRadius);
}

function finalizePlanet(rng, sys, idx, orbitRadius, zone, starTemp, starLum, type) {
  if (!PLANET_TYPES[type]) type = 'rocky';
  const def = PLANET_TYPES[type];
  const id = `${sys.id}-p${idx}`;
  const name = `${sys.name} ${toRoman(idx + 1)}`;
  const isGiant = type === 'gas' || type === 'icegiant' || type === 'exotic';
  const radius = isGiant
    ? rng.range(type === 'exotic' ? 90 : 170, type === 'gas' ? 340 : 220)
    : rng.range(28, 105) * (type === 'terra' || type === 'ocean' || type === 'marsh' ? 1.12 : 1);

  // temperature from stellar flux
  const phys = dossier(sys.star, orbitRadius, type, radius);
  const temp = phys.teq;

  const clouds = type === 'terra' ? rng.range(0.3, 0.62)
    : type === 'ocean' ? rng.range(0.4, 0.72)
    : type === 'toxic' ? rng.range(0.5, 0.85)
    : isGiant ? rng.range(0.0, 0.2)
    : type === 'lava' ? rng.range(0.05, 0.2)
    : type === 'ash' ? rng.range(0.04, 0.14)
    : type === 'marsh' ? rng.range(0.55, 0.82)
    : type === 'desert' ? rng.range(0.0, 0.18)
    : type === 'rust' ? rng.range(0.0, 0.1)
    : type === 'salt' ? rng.range(0.0, 0.06)
    : rng.range(0.0, 0.12);

  let rings = null;
  const ringChance = isGiant ? 0.5 : type === 'ice' ? 0.08 : 0.035;
  if (rng.chance(ringChance)) {
    const inner = radius * rng.range(1.35, 1.7);
    rings = {
      inner,
      outer: inner * rng.range(1.5, 2.6),
      density: rng.range(0.35, 0.95),
      color: rng.pick(['#d8c9a8', '#c9d6e8', '#e8dcc0', '#b9a98f', '#dff0ff', '#e0c9ff']),
      tilt: rng.range(-0.6, 0.6),
      gaps: rng.int(1, 4),
      seed: rng.int(1, 1e6),
    };
  }

  // Sparse moons: most solids have none; giants rarely keep one or two.
  const moonCount = isGiant
    ? (rng.chance(0.28) ? 1 : rng.chance(0.06) ? 2 : 0)
    : (rng.chance(0.1) ? 1 : 0);
  const bodySeed = rng.int(1, 2 ** 30);
  const p = {
    id, name, kind: 'planet', type, radius, orbitRadius,
    orbitSpeed: keplerMeanMotion(phys.aM, (sys.star.massSolar || 1) * C.Msun) * 1.6e5,
    orbitPhase: rng.range(0, TAU),
    inclination: rng.range(-0.09, 0.09),
    axialTilt: rng.range(-0.5, 0.5) + (rng.chance(0.05) ? rng.range(1.2, 1.6) : 0),
    rotSpeed: rng.range(0.0012, 0.004) * (rng.chance(0.12) ? -1 : 1),
    seed: bodySeed,
    colors: def.colors.map((hex, i) => nudgeHex(hex, bodySeed, i)),
    atmo: def.atmo ? { ...def.atmo, color: def.atmo.color } : null,
    clouds,
    cloudSeed: rng.int(1, 2 ** 30),
    cloudColor: type === 'toxic' ? '#d9f07a' : type === 'marsh' ? '#d6f0a0' : type === 'lava' || type === 'ash' ? '#ff9a5c' : '#ffffff',
    rings,
    temp,
    gravity: phys.g,
    mass: phys.massEarth,
    physics: phys,
    composition: composition(rng, type),
    atmosphereComp: def.atmo ? composition(rng, type).slice(0, 3) : ['None', '—', '—'],
    zone,
    habitable: def.habitable && type !== 'toxic',
    value: Math.round(def.baseValue * (radius / 60) * (type === 'terra' ? rng.range(1.4, 3.0) : rng.range(0.7, 1.6))),
    discovered: false, scanned: false, scanProgress: 0,
    landable: true,
    moons: [],
    hasLife: false,
    lifeForm: null,
  };
  if (type === 'terra' && rng.chance(0.45)) { p.hasLife = true; p.lifeForm = rng.pick(['Microbial mats', 'Flora & fauna', 'Pre-industrial civilisation', 'Ruined civilisation', 'Oceanic megafauna']); p.value = Math.round(p.value * 3.2); }
  if (type === 'ocean' && rng.chance(0.6)) { p.hasLife = true; p.lifeForm = rng.pick(['Oceanic megafauna', 'Bioluminescent plankton', 'Amphibious colonies']); p.value = Math.round(p.value * 2.1); }
  if (type === 'marsh' && rng.chance(0.5)) { p.hasLife = true; p.lifeForm = rng.pick(['Wetland mats', 'Amphibious colonies', 'Sour-gas flora']); p.value = Math.round(p.value * 2.0); }

  for (let m = 0; m < moonCount; m++) p.moons.push(makeMoon(rng, p, m, sys.star));
  return p;
}

// ---------------------------------------------------------------------------

function makeMarket(rng, economy, station) {
  const eco = ECONOMIES[economy] || ECONOMIES.trade;
  const book = hubMarketBook(station?.kind) || eco;
  const items = [];
  const hub = station?.kind || 'orbital';
  for (const c of COMMODITIES) {
    if (!c.legal && station?.factionId === 'fed') continue;
    if (!c.legal && rng.chance(0.5)) continue;
    const strict = !!hubMarketBook(station?.kind);
    if (strict && !book.buys.includes(c.id) && !book.sells.includes(c.id)) continue;
    const demand = book.buys.includes(c.id);
    const supply = book.sells.includes(c.id);
    let mult = economyPriceMult(economy, c.id, hub, book.buys, book.sells);
    mult *= 1 + rng.range(-0.05, 0.05);
    if (!c.legal && rng.chance(0.35)) mult += 0.8;
    const price = Math.max(8, Math.round(c.base * mult));
    const stock = supply
      ? rng.int(isHubKind(hub) ? 160 : 70, isHubKind(hub) ? 680 : 340)
      : 0;
    items.push({ id: c.id, price, stock, demand: demand ? rng.int(4, 10) : rng.int(0, 3) });
  }
  return items;
}

const HUB_NAMES = {
  hub_shipyard: ['Shipworks', 'Drydock', 'Engineering'],
  hub_arsenal: ['Arsenal', 'Armoury', 'Defence Depot'],
  hub_trade: ['Exchange', 'Spin', 'Bazaar', 'Gateway', 'Ring'],
  hub_refinery: ['Foundry', 'Works', 'Crucible', 'Smelter', 'Forge'],
  hub_survey: ['Array', 'Observatory', 'Annex', 'Lab', 'Listen'],
};

function applyStationScale(st, rng) {
  const sc = stationScale(st.kind);
  st.radius = sc.radius;
  st.dockRadius = sc.dock;
  st.population = rng.int(sc.popMin, sc.popMax);
  st.spin = sc.spin;
  return st;
}

/** Push pads off the star, planets, and each other. Same-ring clones around white dwarfs were docking inside ice worlds. */
function finalizeStationOrbits(sys) {
  const stations = sys.stations || [];
  if (!stations.length) return;
  const starClear = (sys.star?.radius || 400) * 2.2 + 240;
  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    const selfR = (st.radius || 130) * 2.4;
    let r = Math.max(starClear + selfR, st.orbitRadius || starClear);
    for (let pass = 0; pass < 20; pass++) {
      let bumpTo = r;
      for (const p of sys.planets) {
        const ext = p.rings ? p.rings.outer : p.radius;
        const need = ext + selfR + 140;
        if (Math.abs(r - p.orbitRadius) < need) bumpTo = Math.max(bumpTo, p.orbitRadius + need);
      }
      for (let j = 0; j < i; j++) {
        const o = stations[j];
        const need = (o.radius || 130) * 2.4 + selfR + 180;
        if (Math.abs(r - o.orbitRadius) < need) bumpTo = Math.max(bumpTo, o.orbitRadius + need);
      }
      if (bumpTo <= r + 0.5) break;
      r = bumpTo;
    }
    st.orbitRadius = r;
  }
}

function makeStation(rng, sys, idx, orbitRadius, forceKind) {
  let kind = forceKind;
  if (!kind) {
    kind = idx === 0 ? 'orbital' : rng.weighted(['orbital', 'outpost', 'shipyard', 'refinery'], () => 1);
  }
  const economy = isHubKind(kind)
    ? economyForHubKind(kind, sys)
    : (sys.faction.id === 'cul' ? rng.pick(['research', 'trade']) : rng.pick(Object.keys(ECONOMIES)));
  const prefix = rng.pick(['Kestrel', 'Meridian', 'Halcyon', 'Vantage', 'Ironhold', 'Nova', 'Perihelion', 'Wayfarer', 'Aegis', 'Cinder', 'Solace', 'Tempest', 'Verdant', 'Obelisk', 'Lantern']);
  const suffix = (HUB_NAMES[kind] && rng.pick(HUB_NAMES[kind]))
    || rng.pick(['Station', 'Port', 'Terminal', 'Platform', 'Reach', 'Anchor', 'Gateway', 'Spire']);
  const st = {
    id: `${sys.id}-s${idx}`,
    name: `${prefix} ${suffix}`,
    kind, economy,
    factionId: sys.faction.id,
    orbitRadius,
    orbitSpeed: (rng.chance(0.5) ? -1 : 1) * keplerMeanMotion(auFromGameOrbit(orbitRadius) * C.au, (sys.star.massSolar || 1) * C.Msun) * 1.6e5 * 0.035,
    orbitPhase: rng.range(0, TAU),
    inclination: rng.range(-0.04, 0.04),
    radius: 130,
    dockRadius: 85,
    seed: rng.int(1, 2 ** 30),
    reputation: 0,
    market: null,
    services: {
      refuel: true,
      repair: true,
      market: kind !== 'outpost' || rng.chance(0.55),
      shipyard: kind === 'shipyard' || kind === 'hub_trade',
      refinery: kind === 'hub_refinery' || kind === 'refinery',
      missions: true,
      bar: rng.chance(0.7),
      survey: kind === 'hub_survey',
    },
    population: 1000,
  };
  applyStationScale(st, rng);
  return st;
}

function addBelt(sys, rng, radius, composition = 'minerals') {
  const br = Math.max(4000, radius);
  sys.belts.push({
    id: `${sys.id}-b${sys.belts.length}`,
    name: `${sys.name} Belt ${String.fromCharCode(65 + sys.belts.length)}`,
    radius: br,
    width: br * rng.range(0.04, 0.1),
    count: rng.int(200, 380),
    inclination: rng.range(-0.08, 0.08),
    phase: rng.range(0, TAU),
    richness: rng.range(0.55, 0.95),
    seed: rng.int(1, 2 ** 30),
    composition,
    discovered: false,
  });
}

function promoteHub(st, sys, kind, rng) {
  st.kind = kind;
  st.economy = economyForHubKind(kind, sys);
  st.services.refinery = kind === 'hub_refinery';
  st.services.shipyard = kind === 'hub_trade' || st.services.shipyard;
  st.services.market = true;
  st.services.survey = kind === 'hub_survey';
  applyStationScale(st, rng);
  st.market = makeMarket(rng, st.economy, st);
  return st;
}

function ensurePad(sys, rng, kind) {
  if (sys.stations.length) return sys.stations[0];
  const orbit = sys.planets[0] ? sys.planets[0].orbitRadius * 1.18 : 14000;
  const st = makeStation(rng, sys, 0, orbit, kind);
  st.market = makeMarket(rng, st.economy, st);
  sys.stations.push(st);
  sys.economy = st.economy;
  return st;
}

function scoreSystemForHub(sys, kind) {
  const planets = sys.planets || [];
  const types = new Set(planets.map((p) => p.type));
  const belts = (sys.belts || []).length;
  const unclaimed = sys.faction?.id === 'none';
  if (kind === 'hub_survey') {
    let s = 0;
    if (planets.length <= 1) s += 10;
    else s -= planets.length;
    if (unclaimed) s += 7;
    if (!belts && !types.has('terra') && !types.has('ocean')) s += 3;
    return s;
  }
  if (kind === 'hub_refinery') {
    let s = 0;
    if (belts) s += 10;
    if (types.has('lava')) s += 6;
    if (types.has('carbon')) s += 6;
    if (types.has('ice')) s += 3;
    if (types.has('terra') || types.has('ocean')) s -= 2;
    return s;
  }
  let s = 0;
  if (types.has('terra') || types.has('ocean')) s += 10;
  const pop = (sys.stations || []).reduce((n, st) => n + (st.population || 0), 0);
  if (pop > 20000) s += 4;
  if (unclaimed) s -= 5;
  return s;
}

function ensureGalaxyHubs(systems, rng, reservedIds = new Set()) {
  const want = ['hub_trade', 'hub_refinery', 'hub_survey'];
  for (const kind of want) {
    if (systems.some((sys) => sys.stations.some((st) => st.kind === kind))) continue;
    const ranked = systems
      .map((sys) => ({ sys, score: scoreSystemForHub(sys, kind) }))
      .sort((a, b) => b.score - a.score);
    let placed = null;
    for (const { sys } of ranked) {
      const st = (sys.stations || []).find((s) => !isHubKind(s.kind) && !reservedIds.has(s.id));
      if (st) { placed = { sys, st }; break; }
    }
    if (!placed) {
      for (const { sys } of ranked) {
        if (reservedIds.size && sys.stations.some((s) => reservedIds.has(s.id)) && sys.stations.length <= 1) continue;
        const st = ensurePad(sys, rng, kind);
        if (st && !reservedIds.has(st.id)) { placed = { sys, st }; break; }
      }
    }
    if (!placed) continue;
    promoteHub(placed.st, placed.sys, kind, rng);
    if (kind === 'hub_refinery' && !placed.sys.belts.length) {
      const last = placed.sys.planets[placed.sys.planets.length - 1];
      addBelt(placed.sys, rng, last ? last.orbitRadius * 1.22 : 16000, 'minerals');
    }
    placed.sys.economy = placed.st.economy;
  }
}

const GALAXY_HUBS = ['hub_trade', 'hub_refinery', 'hub_survey'];
const OPTIONAL_HUBS = ['hub_shipyard', 'hub_arsenal'];

function demoteHub(st, rng) {
  st.kind = 'orbital';
  st.economy = 'trade';
  st.services = stationServices(st);
  applyStationScale(st, rng);
  st.market = makeMarket(rng, st.economy, st);
}

/** One of each specialist per galaxy. Extra trade spins become ordinary ports. */
function balanceGalaxyHubs(systems, rng, story) {
  const home = systems[0];
  for (const kind of [...GALAXY_HUBS, ...OPTIONAL_HUBS]) {
    const optional = OPTIONAL_HUBS.includes(kind);
    const found = [];
    for (const sys of systems) {
      for (const st of sys.stations || []) if (st.kind === kind) found.push({ sys, st });
    }
    let keep = found[0] || null;
    if (kind === 'hub_trade' && story && home) keep = found.find((f) => f.sys === home) || keep;
    if (kind === 'hub_survey') keep = found.find((f) => f.sys !== home) || keep;
    if (kind === 'hub_survey' && keep && keep.sys === home && systems.length > 1) {
      const dest = systems.find((s) => s !== home && !(s.stations || []).some((st) => GALAXY_HUBS.includes(st.kind))) || systems[1];
      placeSpecialist(dest, kind, rng, 4, story);
      demoteHub(keep.st, rng);
      keep = { sys: dest, st: dest.stations[dest.stations.length - 1] };
    }
    if (!keep) {
      if (optional) continue;
      const busy = new Set();
      for (const sys of systems) {
        if ((sys.stations || []).some((st) => GALAXY_HUBS.includes(st.kind))) busy.add(sys.id);
      }
      const pool = systems.filter((s) => !busy.has(s.id) && !(kind === 'hub_survey' && s === home));
      const sys = pool[0] || systems.find((s) => s !== home) || home;
      const pad = (sys.stations || []).find((s) => !isHubKind(s.kind));
      if (pad) promoteHub(pad, sys, kind, rng);
      else placeSpecialist(sys, kind, rng, GALAXY_HUBS.indexOf(kind), story);
      const fresh = (sys.stations || []).filter((st) => st.kind === kind).pop();
      keep = fresh ? { sys, st: fresh } : null;
    }
    for (const f of found) {
      if (!keep || f.st === keep.st) continue;
      demoteHub(f.st, rng);
    }
  }
}

function collectHubs(systems) {
  const hubs = [];
  for (const sys of systems) {
    for (const st of sys.stations || []) {
      if (!isHubKind(st.kind)) continue;
      hubs.push({
        id: st.id, kind: st.kind, name: st.name, system: sys.name, systemId: sys.id, economy: st.economy,
      });
    }
  }
  return hubs;
}

function placeSpecialist(sys, kind, rng, i, story) {
  const anchor = sys.stations[0];
  const st = makeStation(rng, sys, sys.stations.length, (anchor?.orbitRadius || 16000) + (i + 1) * 1500, kind);
  const label = kind === 'hub_shipyard' ? 'Shipworks' : kind === 'hub_arsenal' ? 'Arsenal' : 'Array';
  st.id = `${sys.id}-${kind}`;
  st.name = `${story ? 'Halcyon' : sys.name} ${label}`;
  st.economy = kind === 'hub_arsenal' ? 'military' : kind === 'hub_survey' ? 'research' : 'industrial';
  st.orbitPhase = (anchor?.orbitPhase || 0) + 0.35 * (i + 1);
  st.market = makeMarket(rng, st.economy, st);
  sys.stations.push(st);
  return st;
}

function paintWorld(p, sys, type, name) {
  if (!PLANET_TYPES[type]) type = 'rocky';
  const def = PLANET_TYPES[type];
  const phys = dossier(sys.star, p.orbitRadius, type, p.radius);
  p.type = type;
  p.name = name;
  p.colors = [...def.colors];
  p.atmo = def.atmo ? { ...def.atmo } : null;
  p.physics = phys;
  p.temp = phys.teq;
  p.gravity = phys.g;
  p.habitable = false;
  p.hasLife = false;
  p.lifeForm = null;
  p.landable = type !== 'gas' && type !== 'icegiant';
  p.story = '';
}

function ensureStarterWorlds(home) {
  const keep = (p) => p.story === 'dive' || p.type === 'terra';
  const open = home.planets.filter((p) => !keep(p) && p.type !== 'gas' && p.type !== 'icegiant');
  let safe = open.find((p) => p.type === 'rocky' || p.type === 'barren');
  if (!safe && open[0]) {
    paintWorld(open[0], home, 'rocky', 'Cinder Shelf');
    safe = open[0];
  }
  if (!safe) {
    const orbit = (home.planets[0]?.orbitRadius || 8000) * 1.35;
    const made = finalizePlanet(new RNG(home.seed + 403), home, home.planets.length, orbit, 'inner', home.star.temp, home.star.lum, 'rocky');
    made.name = 'Cinder Shelf';
    home.planets.push(made);
    safe = made;
  }
  let toxic = home.planets.find((p) => p.type === 'toxic' && p !== safe && !keep(p));
  if (!toxic) {
    const donor = open.find((p) => p !== safe);
    if (donor) paintWorld(donor, home, 'toxic', 'Ash Veil');
    else {
      const orbit = ((safe || home.planets[0])?.orbitRadius || 9000) * 1.55;
      const made = finalizePlanet(new RNG(home.seed + 404), home, home.planets.length, orbit, 'outer', home.star.temp, home.star.lum, 'toxic');
      made.name = 'Ash Veil';
      home.planets.push(made);
    }
  }
}

function stockBasics(st) {
  if (!st || isHubKind(st.kind)) return;
  st.market = Array.isArray(st.market) ? st.market : [];
  for (const id of ['fuel', 'food', 'water']) {
    let row = st.market.find((item) => item.id === id);
    if (!row) {
      row = { id, price: id === 'fuel' ? 90 : 80, stock: 40, demand: 2 };
      st.market.push(row);
    } else if ((row.stock || 0) < 20) row.stock = 40;
  }
}

function addSpecialistHubs(systems, seed, story) {
  // Append stable IDs using a separate seed, preserving all existing ports,
  // cargo destinations and world generation when loading an older career.
  const rng = new RNG(`${seed}-specialist-ports`);
  const populated = systems.filter((s) => s.stations.length);
  const home = systems[0];
  const elsewhere = systems.filter((s) => s !== home);
  const jobs = [];
  if (story || rng.chance(0.35)) jobs.push('hub_shipyard');
  if (story || rng.chance(0.18)) jobs.push('hub_arsenal');
  for (const [i, kind] of jobs.entries()) {
    if (systems.some((s) => s.stations.some((st) => st.kind === kind))) continue;
    const sys = story
      ? (elsewhere[i % elsewhere.length] || home)
      : (populated[i % populated.length] || home);
    if (!sys) continue;
    placeSpecialist(sys, kind, rng, i, story);
  }
  for (const sys of systems) for (const st of sys.stations) {
    st.services = stationServices(st);
    if (!st.services.market) st.market = [];
  }
  if (!story) {
    const gate = systems[systems.length - 1];
    const pad = gate?.stations?.find((s) => s && !String(s.kind || '').startsWith('hub_')) || gate?.stations?.[0];
    if (pad) {
      pad.services = { ...(pad.services || {}), market: true, refuel: true, repair: true };
      stockBasics(pad);
    }
  }
}

function hopsBetween(systems, a, b) {
  if (!a || !b) return 99;
  if (a.id === b.id) return 0;
  const byId = new Map(systems.map((s) => [s.id, s]));
  const seen = new Set([a.id]);
  let q = [a.id], d = 0;
  while (q.length && d < 6) {
    const next = [];
    d++;
    for (const id of q) {
      const sys = byId.get(id);
      for (const lid of sys?.links || []) {
        if (seen.has(lid)) continue;
        if (lid === b.id) return d;
        seen.add(lid);
        next.push(lid);
      }
    }
    q = next;
  }
  return 99;
}

function stampStationCircuits(systems) {
  const hubs = [];
  for (const sys of systems) {
    for (const st of sys.stations || []) {
      if (isHubKind(st.kind)) hubs.push({ st, sys });
    }
  }
  const nearest = (kind, fromSys, fromSt) => {
    let best = null, bestH = 99;
    for (const h of hubs) {
      if (h.st.kind !== kind || h.st.id === fromSt.id) continue;
      const hops = hopsBetween(systems, fromSys, h.sys);
      if (hops < bestH) { bestH = hops; best = h; }
    }
    return best ? { name: best.st.name, sys: best.sys.name, hops: bestH } : null;
  };
  for (const sys of systems) {
    const eco = ECONOMIES[sys.economy] || ECONOMIES.trade;
    for (const st of sys.stations || []) {
      const circuit = {
        trade: nearest('hub_trade', sys, st),
        refinery: nearest('hub_refinery', sys, st),
        survey: nearest('hub_survey', sys, st),
      };
      st.circuit = circuit;
      const book = hubMarketBook(st.kind) || eco;
      st.routeHint = routeHint(st.economy, book.buys, book.sells, st.kind, circuit);
    }
  }
}

// ---------------------------------------------------------------------------

export function generateGalaxy(seed = GALAXY_SEED, meta = {}) {
  const rng = new RNG(seed);
  const simplex = new Simplex(rng.int(1, 1e9));
  const SYSTEM_COUNT = meta.systemCount ?? 12;
  const ARMS = Math.max(0, meta.arms ?? 2);
  const galId = meta.id || 'aetheria';
  const galName = meta.name || GALAXY_NAME;
  const systems = [];
  WORLD_SET = Array.isArray(meta.worlds) && meta.worlds.length ? new Set(meta.worlds) : null;

  const usedNames = new Set();

  for (let i = 0; i < SYSTEM_COUNT; i++) {
    const t = SYSTEM_COUNT <= 1 ? 0 : i / (SYSTEM_COUNT - 1);
    const arm = ARMS > 0 ? i % ARMS : 0;
    const angle = t * TAU * 1.15 + (ARMS > 0 ? (arm * TAU) / ARMS : rng.range(0, TAU)) + rng.range(-0.22, 0.22);
    const dist = 900 + t * 6200 + rng.range(-280, 280);
    const gx = Math.cos(angle) * dist;
    const gz = Math.sin(angle) * dist;
    const gy = fbm(simplex, gx * 0.00035, gz * 0.00035, 0.7, 3) * 780;

    let name = makeStarName(rng, i);
    let guard = 0;
    while (usedNames.has(name) && guard++ < 40) name = makeStarName(rng, i);
    usedNames.add(name);

    const starTypeKeys = Object.keys(STAR_TYPES);
    let starType = rng.weighted(starTypeKeys, (k) => STAR_TYPES[k].weight);
    if (i === 0 && meta.story) starType = 'G';
    const st = STAR_TYPES[starType];

    const faction = rng.weighted(FACTIONS, (f) => (t < 0.35 ? (f.id === 'fed' ? 4 : f.id === 'ind' ? 3 : 1) : (f.id === 'syn' ? 3 : f.id === 'cul' ? 2 : f.id === 'none' ? 3 : 1)));

    const stPhys = STELLAR[starType] || STELLAR.G;
    const sys = {
      id: `${galId}-sys${i}`,
      galaxyId: galId,
      index: i,
      name,
      designation: `SC-${rng.int(1000, 9999)}-${String.fromCharCode(65 + (i % 26))}`,
      pos: { x: gx, y: gy, z: gz },
      star: {
        type: starType,
        label: st.label,
        color: st.color,
        hex: st.hex,
        temp: Math.round(stPhys.teff * rng.range(0.96, 1.04)),
        radius: Math.round(st.radius * rng.range(0.85, 1.2)),
        lum: stPhys.mass, // placeholder, overwritten
        massSolar: +(stPhys.mass * rng.range(0.92, 1.08)).toFixed(3),
        radiusSolar: +(stPhys.radius * rng.range(0.9, 1.1)).toFixed(3),
        seed: rng.int(1, 2 ** 30),
        name: `${name} A`,
        hydrogen: st.hydrogen !== false,
        fuelMul: st.fuelMul ?? 1,
      },
      faction,
      danger: 0,
      economy: null,
      planets: [],
      belts: [],
      stations: [],
      wrecks: [],
      discovered: i === 0,
      visited: i === 0,
      scale: rng.range(0.85, 1.3),
      seed: rng.int(1, 2 ** 30),
      nebulaTint: meta.tint || rng.pick(['#8f2a6a', '#6b2a8f', '#2a4d8f', '#c44a9a', '#3a3a8f', '#2a8f7a']),
    };
    sys.star.lum = +(sys.star.radiusSolar ** 2 * (sys.star.temp / 5772) ** 4).toFixed(3);

    // ------------------------------------------------------------- planets
    // Always place the full count on a log spiral. Habitable-zone caps used to
    // `break` early (esp. WD / tight M stars) and leave the orbital chart empty.
    let planetCount = rng.int(meta.minPlanets ?? 5, meta.maxPlanets ?? 8);
    if (i === 0 && meta.story) planetCount = rng.int(Math.max(5, meta.minPlanets ?? 5), meta.maxPlanets ?? 8);
    else if (faction.id === 'none' && (rng.chance(0.55) || i === Math.max(2, SYSTEM_COUNT - 3))) {
      planetCount = rng.int(3, 5);
    }
    if (meta.story && i === SYSTEM_COUNT - 1) planetCount = Math.max(3, planetCount);
    planetCount = Math.max(faction.id === 'none' ? 3 : (meta.minPlanets ?? 5), planetCount);
    const hz = (STELLAR[starType] || STELLAR.G);
    const innerAu = Math.max(0.14, Math.min((hz.hzInner || 0.5) * rng.range(0.45, 0.85), 0.95));
    const outerAu = Math.max(innerAu * Math.max(7, planetCount + 2), Math.min(Math.max((hz.hzOuter || 1.5) * rng.range(3.2, 4.8), 5.5), 16));
    const maxOrbit = gameOrbitFromAu(outerAu) * sys.scale;
    for (let p = 0; p < planetCount; p++) {
      const t = planetCount <= 1 ? 0 : p / (planetCount - 1);
      const jitter = p === 0 || p === planetCount - 1 ? 1 : rng.range(0.94, 1.06);
      const orbit = gameOrbitFromAu(innerAu * Math.pow(outerAu / innerAu, t) * jitter) * sys.scale;
      const ratio = orbit / (maxOrbit * 0.55);
      const zone = zoneOf(ratio);
      const planet = makePlanet(rng, sys, p, orbit, zone, sys.star.temp, sys.star.lum);
      sys.planets.push(planet);
      // occasional belt between orbits
      if (p < planetCount - 1 && rng.chance(0.22) && sys.belts.length < 2) {
        const nextT = (p + 1) / (planetCount - 1);
        const nextOrbit = gameOrbitFromAu(innerAu * Math.pow(outerAu / innerAu, nextT)) * sys.scale;
        const br = lerp(orbit, nextOrbit, rng.range(0.35, 0.6));
        addBelt(sys, rng, br, rng.weighted(['minerals', 'ice_ore', 'rare_ore', 'minerals'], (k) => (k === 'rare_ore' ? 0.18 : 1)));
      }
    }

    // ---------------------------------------------------------- stations
    const stationCount = i === 0 ? 1 : faction.id === 'none' ? (rng.chance(0.16) ? 1 : 0) : (rng.chance(0.2) ? 1 : 0);
    for (let s = 0; s < stationCount; s++) {
      const targetOrbit = rng.chance(0.55) && sys.planets.length
        ? rng.pick(sys.planets).orbitRadius * rng.range(1.05, 1.25)
        : rng.range(6000, maxOrbit * 0.8);
      const st2 = makeStation(rng, sys, s, clamp(targetOrbit, 3200, maxOrbit));
      st2.market = makeMarket(rng, st2.economy, st2);
      sys.stations.push(st2);
    }
    sys.economy = sys.stations.length ? sys.stations[0].economy : 'trade';

    // ------------------------------------------------------------ wrecks
    const wreckCount = rng.int(1, 4);
    for (let w = 0; w < wreckCount; w++) {
      sys.wrecks.push({
        id: `${sys.id}-w${w}`,
        name: `${rng.pick(['UNS', 'ISV', 'CSV', 'HMS', 'SSV'])} ${rng.pick(['Auriga', 'Peregrine', 'Mnemosyne', 'Corvid', 'Halcyon', 'Vigil', 'Tanager', 'Orpheus', 'Sable', 'Icarus'])}`,
        kind: 'wreck',
        pos: (() => {
          const r = rng.range(9000, maxOrbit * 0.9);
          const a = rng.range(0, TAU);
          return { x: Math.cos(a) * r, y: rng.range(-600, 600), z: Math.sin(a) * r };
        })(),
        radius: rng.range(14, 34),
        value: rng.int(2, 12) * 1000,
        scanned: false, discovered: false, scanProgress: 0,
        rot: { x: rng.range(-1, 1), y: rng.range(-1, 1), z: rng.range(-1, 1) },
        seed: rng.int(1, 2 ** 30),
      });
    }
    if (systems.length % 3 === 1 && sys.wrecks[0] && !sys.wrecks[0].story) {
      sys.wrecks[0].distress = true;
      sys.wrecks[0].discovered = true;
      sys.wrecks[0].name = `DISTRESS · ${sys.wrecks[0].name}`;
    }

    sys.danger = clamp(Math.round(faction.aggr * 3 * rng.range(0.4, 1.25) + (t > 0.55 ? 1 : 0)), 0, 4);
    systems.push(sys);
  }

  if (meta.story) {
  // home system guarantee
  const home = systems[0];
  home.faction = FACTIONS[0];
  home.danger = 0;
  if (!home.stations.length) {
    const s = makeStation(new RNG(home.seed + 7), home, 0, home.planets[2] ? home.planets[2].orbitRadius * 1.08 : 12000, 'hub_trade');
    s.economy = 'trade';
    s.kind = 'hub_trade';
    s.services.shipyard = true;
    s.services.refinery = false;
    s.market = makeMarket(new RNG(home.seed + 9), s.economy, s);
    home.stations.push(s);
  }
  // home world: rocky body in the liquid-water band (ignore giants — they sit nearest 288 K on hot stars)
  let terra = home.planets.find((p) => p.type === 'terra' || p.type === 'ocean');
  if (!terra) {
    const rocky = home.planets.filter((p) => p.type !== 'gas' && p.type !== 'icegiant');
    const band = rocky.filter((p) => p.physics?.teq >= 245 && p.physics?.teq <= 315);
    const p = band[0] || rocky.slice().sort((a, b) => Math.abs((a.physics?.teq || 999) - 288) - Math.abs((b.physics?.teq || 999) - 288))[0];
    if (p) {
      const st = STELLAR[home.star.type] || STELLAR.G;
      let a = gameOrbitFromAu((st.hzInner + st.hzOuter) * 0.52);
      let phys = dossier(home.star, a, 'terra', p.radius);
      for (let k = 0; k < 8 && (phys.teq < 255 || phys.teq > 305); k++) {
        a *= (phys.teq / 288) ** 2;
        phys = dossier(home.star, a, 'terra', p.radius);
      }
      p.orbitRadius = a;
      p.type = 'terra';
      p.name = 'Vesper Reach';
      p.colors = [...PLANET_TYPES.terra.colors];
      p.atmo = { ...PLANET_TYPES.terra.atmo };
      p.clouds = 0.48;
      p.habitable = true;
      p.hasLife = true;
      p.lifeForm = 'Flora & fauna';
      p.physics = phys;
      p.temp = phys.teq;
      p.gravity = phys.g;
      terra = p;
    }
  }
  if (home.stations[0] && (terra || home.planets[0])) {
    home.stations[0].orbitRadius = (terra || home.planets[0]).orbitRadius * 1.14;
    home.stations[0].name = 'Halcyon Port';
    home.stations[0].mainPort = true;
    home.stations[0].kind = 'hub_trade';
    home.stations[0].economy = 'trade';
    home.stations[0].services.shipyard = true;
    home.stations[0].services.market = true;
    home.stations[0].services.refinery = false;
    home.stations[0].services.survey = false;
    applyStationScale(home.stations[0], new RNG(home.seed + 21));
    home.stations[0].market = makeMarket(new RNG(home.seed + 22), 'trade', home.stations[0]);
    home.economy = 'trade';
    if (!home.belts.length) {
      const outer = (terra || home.planets[home.planets.length - 1] || { orbitRadius: 18000 }).orbitRadius;
      addBelt(home, new RNG(home.seed + 33), outer * 1.48, 'minerals');
    }
  }
  if (terra && (terra.type === 'terra' || terra.type === 'ocean') && !/Vesper/.test(terra.name)) {
    terra.name = 'Vesper Reach';
  }
  if (terra) terra.story = 'dive';
  ensureStarterWorlds(home);

  home.storyTag = 'home';
  home.storyLabel = 'Home Port';
  const beacon = systems[1];
  if (beacon) {
    beacon.storyTag = 'beacon';
    beacon.storyLabel = "Sable's wreck";
    if (!beacon.wrecks.length) {
      beacon.wrecks.push({
        id: `${beacon.id}-beacon`,
        name: 'Beacon MX-0',
        kind: 'wreck',
        pos: { x: 18000, y: 400, z: -12000 },
        radius: 28, value: 14000, scanned: false, discovered: false, scanProgress: 0,
        rot: { x: 0.2, y: 1, z: -0.4 }, seed: beacon.seed + 13, story: 'beacon',
      });
    } else {
      beacon.wrecks[0].story = 'beacon';
      beacon.wrecks[0].name = 'Beacon MX-0';
    }
  }
  const market = systems[Math.min(4, systems.length - 1)];
  if (market) { market.storyTag = 'market'; market.storyLabel = 'Crate drop'; if (!market.stations.length) {
    const s = makeStation(new RNG(market.seed + 11), market, 0, 14000);
    s.economy = 'trade'; s.market = makeMarket(new RNG(market.seed + 12), s.economy, s);
    market.stations.push(s);
  }}
  const core = systems[Math.max(2, systems.length - 2)];
  if (core && core !== home && core !== beacon && core !== market) {
    core.storyTag = 'core';
    core.storyLabel = 'Core Approach';
    core.danger = Math.max(core.danger, 3);
    let giant = core.planets.find((p) => p.type === 'gas' || p.type === 'icegiant')
      || core.planets[core.planets.length - 1];
    if (!giant) {
      const last = core.planets[core.planets.length - 1];
      const orbit = Math.max(18000, (last?.orbitRadius || 16000) * 1.65);
      giant = finalizePlanet(new RNG(core.seed + 91), core, core.planets.length, orbit, 'outer', core.star.temp, core.star.lum, 'gas');
      core.planets.push(giant);
    }
    giant.story = 'signal';
    if (!/Choir/.test(giant.name)) giant.name = `${giant.name} · Choir`;
  }
  }

  coverWorlds(systems, meta);
  const worlds = WORLD_SET ? [...WORLD_SET] : [...ALL_WORLD_TYPES];
  WORLD_SET = null;

  const reserved = new Set();
  if (meta.story && systems[0]?.stations?.[0]) reserved.add(systems[0].stations[0].id);
  ensureGalaxyHubs(systems, rng, reserved);
  addSpecialistHubs(systems, seed, meta.story);
  balanceGalaxyHubs(systems, new RNG(`${seed}-one-array`), meta.story);

  // Every galaxy uses the same imported meshes: trade port, survey array, arsenal.
  for (const sys of systems) {
    for (const st of sys.stations || []) {
      if (st.kind === 'hub_survey') st.observatory = true;
      if (st.kind === 'hub_arsenal') st.arsenal = true;
    }
  }

  // connections (jump lanes) — nearest neighbours, then shrink so every
  // hop is inside the shortest flyable drive (Anvil / Ember / Marrow).
  linkSystems(systems);
  rescaleJumpGraph(systems, 14);
  if (meta.story) pullStoryChain(systems, 12);
  linkSystems(systems);

  for (const sys of systems) finalizeStationOrbits(sys);
  stampStationCircuits(systems);

  const totalPlanets = systems.reduce((a, s) => a + s.planets.length, 0);
  const totalMoons = systems.reduce((a, s) => a + s.planets.reduce((b, p) => b + p.moons.length, 0), 0);

  const hubs = collectHubs(systems);
  return { seed, id: galId, name: galName, type: meta.type || 'spiral', worlds, systems, hubs, totalPlanets, totalMoons, totalBodies: totalPlanets + totalMoons };
}

function sysDist(a, b) {
  return Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z);
}

function linkSystems(systems) {
  for (const s of systems) {
    const d = systems
      .filter((o) => o !== s)
      .map((o) => ({ o, d: sysDist(s, o) }))
      .sort((a, b) => a.d - b.d);
    s.links = d.slice(0, 4).map((x) => x.o.id);
    s.nearest = d[0]?.o.id || null;
  }
}

/** Chart units: 100 = 1 ly. Keep nearest-neighbour edges inside `maxLy`. */
function rescaleJumpGraph(systems, maxLy = 14) {
  if (systems.length < 2) return;
  let maxEdge = 1;
  for (const s of systems) {
    for (const id of s.links || []) {
      const o = systems.find((x) => x.id === id);
      if (o) maxEdge = Math.max(maxEdge, sysDist(s, o));
    }
  }
  const cap = maxLy * 100;
  if (maxEdge <= cap) return;
  const k = cap / maxEdge;
  for (const s of systems) {
    s.pos.x *= k;
    s.pos.y *= k;
    s.pos.z *= k;
  }
}

function pullStoryChain(systems, maxLy = 12) {
  const order = ['home', 'beacon', 'market', 'core', 'signal'];
  const tagged = order.map((t) => systems.find((s) => s.storyTag === t)).filter(Boolean);
  const cap = maxLy * 100;
  for (let i = 1; i < tagged.length; i++) {
    const a = tagged[i - 1], b = tagged[i];
    const d = sysDist(a, b);
    if (d <= cap || d < 1) continue;
    const k = cap / d;
    b.pos.x = a.pos.x + (b.pos.x - a.pos.x) * k;
    b.pos.y = a.pos.y + (b.pos.y - a.pos.y) * k;
    b.pos.z = a.pos.z + (b.pos.z - a.pos.z) * k;
  }
}

// ---------------------------------------------------------------------------
export function systemById(galaxy, id) { return galaxy.systems.find((s) => s.id === id); }
export function allBodies(sys) {
  const out = [];
  for (const p of sys.planets) { out.push(p); for (const m of p.moons) out.push(m); }
  for (const s of sys.stations) out.push(s);
  for (const b of sys.belts) out.push(b);
  for (const w of sys.wrecks) out.push(w);
  return out;
}
