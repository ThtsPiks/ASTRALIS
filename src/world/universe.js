// ============================================================================
//  LOCAL SHEET — many galaxies, sparse systems, filaments of the cosmic web
// ============================================================================
import { RNG } from '../core/rng.js';
import { generateGalaxy, GALAXY_SEED } from './galaxy.js?v=port28';
import { filamentTransit, LAWS } from './physics.js?v=chart1';

export const UNIVERSE_SEED = 'LOCAL-SHEET-AETHERIA';

/**
 * Each entry is a galaxy, not a star. System counts stay low on purpose:
 * a spiral has tens of billions of stars in reality — we simulate the
 * *charted* pocket the player can reach, not the whole disc stuffed into one map.
 */
export const GALAXY_CATALOG = [
  { id: 'aetheria', worlds: ['rocky', 'barren', 'terra', 'ocean', 'marsh', 'desert', 'rust', 'ice', 'salt', 'toxic', 'carbon', 'ash', 'lava', 'gas', 'icegiant'], name: 'Aetheria Expanse', type: 'barred spiral', hub: true, systems: 12, arms: 2, tint: '#c44a9a', curvature: 0.85, x: 0, y: 0, z: 0, blurb: 'Home disc. Concord charts only the inner arm.' },
  { id: 'vhel', worlds: ['lava', 'ash', 'rust', 'carbon', 'desert', 'rocky', 'barren', 'gas'], name: 'Vhel Rift', type: 'barred spiral', systems: 10, arms: 2, tint: '#ff7a3a', curvature: 1.1, x: 3.2, y: 0.4, z: 1.1, blurb: 'Syndicate space. Dust lane, high metallicity.' },
  { id: 'nyx', worlds: ['exotic', 'barren', 'ice', 'icegiant', 'rocky'], name: 'Nyx Cloud', type: 'irregular dwarf', systems: 6, arms: 0, tint: '#6b2a8f', curvature: 1.6, x: -2.4, y: -0.8, z: 1.8, blurb: 'Dwarf irregular. Few stars, deep wells around the core remnant.' },
  { id: 'kaluga', worlds: ['terra', 'ocean', 'marsh', 'rocky', 'ice', 'salt', 'desert', 'gas'], name: 'Kaluga Arm', type: 'spiral', systems: 11, arms: 3, tint: '#3ec8ff', curvature: 0.9, x: 1.1, y: 2.6, z: -1.4, blurb: 'Free Colony shipping lane along a thin spiral.' },
  { id: 'concord', worlds: ['barren', 'rocky', 'salt', 'ice', 'icegiant', 'desert'], name: 'Concord Halo', type: 'lenticular', systems: 8, arms: 0, tint: '#9ad0ff', curvature: 0.7, x: -3.6, y: 1.2, z: -0.6, blurb: 'S0 galaxy. Old stars, quiet, long filaments.' },
  { id: 'choir', worlds: ['exotic', 'toxic', 'gas', 'barren', 'lava'], name: 'Choir Void', type: 'elliptical', systems: 7, arms: 0, tint: '#c98aff', curvature: 1.8, x: 0.6, y: -3.1, z: 2.4, blurb: 'E4. The Signal leaks from here. Tidal κ is high.' },
  { id: 'cinder', worlds: ['lava', 'ash', 'rust', 'carbon', 'toxic', 'rocky', 'gas'], name: 'Cinder Stream', type: 'irregular', systems: 9, arms: 1, tint: '#ff5a2a', curvature: 1.3, x: 4.4, y: -1.6, z: 0.3, blurb: 'Tidal stream leftover. Starburst knots.' },
  { id: 'octant', worlds: ['barren', 'rocky', 'exotic', 'ice'], name: 'Octant Deep', type: 'dwarf spheroidal', systems: 5, arms: 0, tint: '#5a6a88', curvature: 1.4, x: -1.8, y: 3.4, z: 2.0, blurb: 'Almost no gas. Survey-only pocket.' },
  { id: 'reticuli', worlds: ['terra', 'ocean', 'marsh', 'rocky', 'desert', 'gas'], name: 'Reticuli Sheet', type: 'spiral', systems: 10, arms: 2, tint: '#7dffb0', curvature: 0.95, x: 2.8, y: 2.2, z: 2.8, blurb: 'Green-arm spiral, agricultural worlds in G-star belts.' },
  { id: 'fornax', worlds: ['gas', 'icegiant', 'lava', 'carbon', 'barren', 'exotic'], name: 'Fornax Clusterlet', type: 'compact group', systems: 8, arms: 0, tint: '#ffd27a', curvature: 1.25, x: -4.2, y: -2.4, z: 1.0, blurb: 'Several cores in a small group. Crowded wells.' },
  { id: 'tucanae', worlds: ['ocean', 'marsh', 'ice', 'salt', 'toxic', 'rocky', 'icegiant'], name: 'Tucanae Drift', type: 'magellanic', systems: 7, arms: 1, tint: '#ff9ad4', curvature: 1.35, x: 5.1, y: 0.8, z: -2.2, blurb: 'Bar + one ragged arm. Magellanic analogue.' },
  { id: 'mensae', worlds: ['ice', 'salt', 'icegiant', 'barren', 'rocky'], name: 'Mensae Quiet', type: 'dwarf irregular', systems: 6, arms: 0, tint: '#8fa8bd', curvature: 1.05, x: 0.2, y: 4.6, z: -2.8, blurb: 'Sparse, cold, honest physics. Good for first halo drops.' },
];

function distMly(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function weaveFilaments(defs) {
  const filaments = [];
  // nearest-neighbour web + a few extra bridges
  for (let i = 0; i < defs.length; i++) {
    const ds = defs
      .map((o, j) => ({ j, d: i === j ? 1e9 : distMly(defs[i], o) }))
      .sort((a, b) => a.d - b.d);
    for (const n of ds.slice(0, 2)) {
      const a = defs[i].id, b = defs[n.j].id;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (!filaments.some((f) => f.key === key)) {
        filaments.push({
          key, a, b, dMly: +n.d.toFixed(2),
          curvature: +((defs[i].curvature + defs[n.j].curvature) * 0.5).toFixed(2),
        });
      }
    }
  }
  // Hub doors + a few story bridges. Choir still campaign-gated at ride time.
  const extra = [
    ['aetheria', 'choir'], ['aetheria', 'kaluga'], ['aetheria', 'vhel'],
    ['aetheria', 'nyx'], ['aetheria', 'concord'], ['vhel', 'cinder'],
  ];
  for (const [a, b] of extra) addFilament(filaments, defs, a, b);
  ensureConnected(defs, filaments, 'aetheria');
  return filaments;
}

function addFilament(filaments, defs, a, b) {
  const A = defs.find((g) => g.id === a), B = defs.find((g) => g.id === b);
  if (!A || !B) return;
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  if (filaments.some((f) => f.key === key)) return;
  filaments.push({
    key, a, b, dMly: +distMly(A, B).toFixed(2),
    curvature: +((A.curvature + B.curvature) * 0.5).toFixed(2),
  });
}

function ensureConnected(defs, filaments, hubId = 'aetheria') {
  const other = (fil, id) => (fil.a === id ? fil.b : fil.a);
  for (let n = 0; n < defs.length + 2; n++) {
    const reach = new Set();
    const stack = [hubId];
    while (stack.length) {
      const id = stack.pop();
      if (reach.has(id)) continue;
      reach.add(id);
      for (const f of filaments) {
        if (f.a === id || f.b === id) stack.push(other(f, id));
      }
    }
    const missing = defs.find((d) => !reach.has(d.id));
    if (!missing) return;
    let best = null, bestD = 1e9;
    for (const r of defs) {
      if (!reach.has(r.id)) continue;
      const d = distMly(missing, r);
      if (d < bestD) { bestD = d; best = r; }
    }
    if (!best) return;
    addFilament(filaments, defs, missing.id, best.id);
  }
}

export function generateUniverse(seed = UNIVERSE_SEED) {
  const rng = new RNG(seed);
  const filaments = weaveFilaments(GALAXY_CATALOG);
  const galaxies = GALAXY_CATALOG.map((def, i) => {
    const g = generateGalaxy(`${seed}::${def.id}`, {
      id: def.id,
      name: def.name,
      type: def.type,
      systemCount: def.systems,
      arms: def.arms,
      tint: def.tint,
      story: def.id === 'aetheria',
      worlds: def.worlds,
      minPlanets: 5,
      maxPlanets: 9,
    });
    g.id = def.id;
    g.type = def.type;
    g.blurb = def.blurb;
    g.curvature = def.curvature;
    g.pos = { x: def.x, y: def.y, z: def.z };
    g.tint = def.tint;
    g.discovered = def.id === 'aetheria';
    g.visited = def.id === 'aetheria';
    g.hub = !!def.hub;
    if (def.id !== 'aetheria') {
      const hot = i % 2 === 0;
      g.rules = { hazardBias: hot ? 1 : 0.5, buyTax: hot ? 1.12 : 0.9 };
    }
    // Filament drop uses the outermost system. Relabel a non-hub pad so we
    // don't eat the galaxy's guaranteed trade/refinery/survey hub.
    const outer = g.systems[g.systems.length - 1];
    if (outer) {
      outer.hasGate = true;
      const st = (outer.stations || []).find((s) => s && !String(s.kind || '').startsWith('hub_') && s.kind !== 'gateway');
      if (st) {
        st.kind = 'gateway';
        st.name = `${def.name.split(' ')[0]} Filament Gate`;
        st.gateway = true;
      }
    }
    g.seedNoise = rng.int(1, 1e9);
    return g;
  });

  let totalPlanets = 0, totalMoons = 0, totalSystems = 0;
  for (const g of galaxies) {
    totalSystems += g.systems.length;
    totalPlanets += g.totalPlanets;
    totalMoons += g.totalMoons;
  }

  return {
    seed, name: 'Local Sheet',
    galaxies, filaments, laws: LAWS,
    homeId: 'aetheria',
    totalSystems, totalPlanets, totalMoons,
    totalBodies: totalPlanets + totalMoons,
  };
}

export function galaxyById(universe, id) {
  return universe.galaxies.find((g) => g.id === id);
}

export function filamentsFrom(universe, galaxyId) {
  return universe.filaments.filter((f) => f.a === galaxyId || f.b === galaxyId);
}

export function otherEnd(fil, galaxyId) {
  return fil.a === galaxyId ? fil.b : fil.a;
}

let _sheetWeb = null;
function sheetWeb() {
  if (!_sheetWeb) _sheetWeb = weaveFilaments(GALAXY_CATALOG);
  return _sheetWeb;
}

export function galaxyDef(id) {
  return GALAXY_CATALOG.find((g) => g.id === id) || null;
}

export function sheetNeighbours(id) {
  const out = [];
  for (const f of sheetWeb()) {
    if (f.a === id) out.push(f.b);
    else if (f.b === id) out.push(f.a);
  }
  return out;
}

/** Filament hops from home. Choir and the Veil are not chart stops. */
export function galaxyChartDepth(id, homeId = 'aetheria') {
  if (!id || id === homeId) return 0;
  const dist = new Map([[homeId, 0]]);
  const q = [homeId];
  while (q.length) {
    const cur = q.shift();
    const d = dist.get(cur);
    for (const n of sheetNeighbours(cur)) {
      if (dist.has(n)) continue;
      dist.set(n, d + 1);
      q.push(n);
    }
  }
  return dist.get(id) || 0;
}

export function transitQuote(universe, fromId, toId, shipMassT = 40) {
  const fil = universe.filaments.find((f) =>
    (f.a === fromId && f.b === toId) || (f.a === toId && f.b === fromId));
  if (!fil) return null;
  const q = filamentTransit(shipMassT, fil.dMly, fil.curvature);
  return { fil, ...q };
}

export { GALAXY_SEED };
