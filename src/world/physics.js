// ============================================================================
//  PHYSICAL LAWS — SI formulas, game-scale mapping, jump / entry constraints
//  These are the rules the universe is generated from. Planets are not
//  unique snowflakes; they are solutions of the same equations.
// ============================================================================

/** Map: 100 galaxy-chart units = 1 light-year (intra-galaxy hops). */
export const LY = 100;
/** Universe chart: 1 unit ≈ 1 million light-years (compressed Local Sheet). */
export const MLY = 1;

export const C = {
  G: 6.67430e-11,          // N m² kg⁻²
  c: 299792458,            // m/s
  k: 1.380649e-23,         // J/K
  sigma: 5.670374419e-8,   // W m⁻² K⁻⁴  Stefan–Boltzmann
  au: 1.495978707e11,      // m
  pc: 3.085677581e16,      // m
  ly: 9.460730472e15,      // m
  Msun: 1.98847e30,        // kg
  Rsun: 6.957e8,           // m
  Mearth: 5.9722e24,       // kg
  Rearth: 6.371e6,         // m
  g0: 9.80665,             // m/s²
  u: 1.66053906660e-27,    // kg  atomic mass unit
};

/** Star type → typical mass (M☉), radius (R☉), Teff (K), albedo-independent. */
export const STELLAR = {
  M:  { mass: 0.40, radius: 0.50, teff: 3200, hzInner: 0.15, hzOuter: 0.40 },
  K:  { mass: 0.80, radius: 0.85, teff: 4600, hzInner: 0.45, hzOuter: 0.85 },
  G:  { mass: 1.00, radius: 1.00, teff: 5772, hzInner: 0.95, hzOuter: 1.70 },
  F:  { mass: 1.35, radius: 1.25, teff: 7000, hzInner: 1.4,  hzOuter: 2.4  },
  A:  { mass: 2.10, radius: 1.80, teff: 9200, hzInner: 2.6,  hzOuter: 4.8  },
  B:  { mass: 8.00, radius: 4.00, teff: 17000, hzInner: 8,   hzOuter: 18   },
  RG: { mass: 1.20, radius: 40,   teff: 3800, hzInner: 20,  hzOuter: 60   },
  WD: { mass: 0.60, radius: 0.012, teff: 14000, hzInner: 0.02, hzOuter: 0.06 },
};

export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/** L / L☉ from Stefan–Boltzmann:  (R/R☉)² (T/T☉)⁴ */
export function luminositySolar(radiusSolar, teff) {
  const t = teff / 5772;
  return radiusSolar * radiusSolar * t * t * t * t;
}

/** Equilibrium temperature (K). Bond albedo A, circulating factor f=1/4. */
export function teqK(teff, rStarM, semiMajorM, albedo = 0.3) {
  return teff * Math.sqrt(rStarM / (2 * semiMajorM)) * Math.pow(1 - albedo, 0.25);
}

/** Surface gravity in m/s² and in g0. */
export function gravity(massKg, radiusM) {
  const g = C.G * massKg / (radiusM * radiusM);
  return { ms2: g, g: g / C.g0 };
}

/** Escape velocity m/s. */
export function vEscape(massKg, radiusM) {
  return Math.sqrt(2 * C.G * massKg / radiusM);
}

/** Kepler period seconds. */
export function keplerPeriod(semiMajorM, massCentralKg) {
  return 2 * Math.PI * Math.sqrt((semiMajorM ** 3) / (C.G * massCentralKg));
}

/** Mean motion rad/s → game orbitSpeed (visual). */
export function keplerMeanMotion(semiMajorM, massCentralKg) {
  return Math.sqrt(C.G * massCentralKg / (semiMajorM ** 3));
}

/** Hill radius of a planet (m). */
export function hillRadius(aM, mPlanet, mStar) {
  return aM * Math.cbrt(mPlanet / (3 * mStar));
}

/** Roche limit (fluid) m. */
export function rocheLimit(rPrimaryM, densityPrimary, densitySecondary) {
  return 2.44 * rPrimaryM * Math.cbrt(densityPrimary / Math.max(1e-6, densitySecondary));
}

/** Scale height H = kT / (μ m_u g). μ ≈ mean molecular weight. */
export function scaleHeight(tempK, mu, gMs2) {
  return (C.k * tempK) / (mu * C.u * Math.max(0.05, gMs2));
}

/**
 * Approximate atmospheric density at altitude (exponential).
 * rho = rho0 * exp(-h / H)
 */
export function airDensity(rho0, h, H) {
  return rho0 * Math.exp(-h / Math.max(1, H));
}

/** Convective heat flux ~ k ρ^n v^m  (Sutton–Graves-like). */
export function entryHeat(rho, speedMs) {
  return 1.83e-4 * Math.sqrt(Math.max(rho, 1e-8)) * (speedMs ** 3);
}

/** Gravity-well parameter that forbids FTL too close to a mass. */
export function wellParameter(massSolar, distAu) {
  return massSolar / Math.max(0.02, distAu * distAu);
}

/** Intra-galaxy jump is legal outside the inner corona — habitable-zone spawn must be able to jump. */
export function canFrameShift(massSolar, distAu) {
  const minAu = 0.16 * Math.sqrt(Math.max(0.2, massSolar || 1));
  return distAu > minAu;
}

/**
 * Inter-galactic transit (metric ride along a dark-matter filament).
 * Energy scales with rest mass and comoving distance² — you are stretching
 * a corridor, not flying through vacuum at v>c. Curvature of the filament
 * (how bent the cosmic web is) multiplies the cost.
 */
export function filamentTransit(shipMassT, distMly, curvature = 1) {
  const fuel = Math.round(3 + distMly * 1.35 * curvature);
  const chargeS = clamp(3.2 + distMly * 0.55 + curvature, 3.2, 12);
  const tidalG = +(0.04 * distMly * curvature).toFixed(3);
  const dropHaloAu = clamp(40 + distMly * 8, 40, 180);
  return { fuel, chargeS, tidalG, dropHaloAu, legal: distMly < 28 };
}

export function auFromGameOrbit(orbitRadius, auGame = 22000) {
  return orbitRadius / auGame;
}

export function gameOrbitFromAu(au, auGame = 22000) {
  return au * auGame;
}

/** Classify climate band from Teq — same law for every world. */
export function climateFromTeq(teq) {
  if (teq > 700) return 'hot';
  if (teq > 320) return 'warm';
  if (teq > 230) return 'life';
  if (teq > 120) return 'cold';
  return 'outer';
}

/**
 * Planet class from equilibrium temperature (probe albedo 0.3), then giants by a.
 * Dice only pick among physically allowed siblings — not the class itself.
 */
export function typeFromTeq(teq, rng, { giant = false } = {}) {
  if (giant) return teq < 140 ? 'icegiant' : 'gas';
  if (teq >= 850) return rng.weighted(['lava', 'ash', 'barren'], (k) => ({ lava: 5, ash: 3, barren: 2 }[k]));
  if (teq >= 640) return rng.weighted(['ash', 'lava', 'rust', 'barren'], (k) => ({ ash: 4, lava: 3, rust: 2, barren: 2 }[k]));
  if (teq >= 480) return rng.weighted(['rust', 'rocky', 'desert', 'barren'], (k) => ({ rust: 4, rocky: 3, desert: 2, barren: 2 }[k]));
  if (teq >= 330) return rng.weighted(['desert', 'rust', 'rocky', 'toxic'], (k) => ({ desert: 4, rust: 3, rocky: 2, toxic: 2 }[k]));
  if (teq >= 245 && teq <= 315) {
    return rng.weighted(['terra', 'ocean', 'marsh', 'desert'], (k) => ({ terra: 4, ocean: 3, marsh: 3, desert: 2 }[k]));
  }
  if (teq >= 180) return rng.weighted(['rocky', 'salt', 'barren', 'rust'], (k) => ({ rocky: 3, salt: 3, barren: 2, rust: 2 }[k]));
  if (teq >= 70) return rng.weighted(['ice', 'salt', 'barren', 'carbon'], (k) => ({ ice: 5, salt: 2, barren: 2, carbon: 2 }[k]));
  return rng.chance(0.55) ? 'ice' : 'carbon';
}

/** Mean molecular weight guess from planet class. */
export function muForType(type) {
  return ({
    terra: 29, ocean: 28, marsh: 30, desert: 32, toxic: 40, lava: 36, ash: 34, rocky: 28, rust: 32,
    barren: 1, ice: 20, salt: 29, carbon: 16, gas: 2.3, icegiant: 6, exotic: 12,
  }[type] || 28);
}

export function albedoForType(type) {
  return ({
    terra: 0.30, ocean: 0.35, marsh: 0.18, desert: 0.32, ice: 0.65, salt: 0.55, gas: 0.45,
    icegiant: 0.50, lava: 0.12, ash: 0.10, barren: 0.14, rocky: 0.18, rust: 0.16, toxic: 0.22,
    carbon: 0.08, exotic: 0.05,
  }[type] || 0.25);
}

export function densityForType(type) {
  // g/cm³
  return ({
    terra: 5.5, ocean: 5.1, marsh: 4.6, desert: 5.3, rocky: 5.0, rust: 5.4, barren: 3.9,
    lava: 5.8, ash: 4.2, ice: 1.6, salt: 2.2, carbon: 7.0, toxic: 4.8, gas: 1.3, icegiant: 1.6, exotic: 9.0,
  }[type] || 4.5);
}

/**
 * Derive a full physical dossier from star + orbit + class.
 * Radius in game units (≈ km visual). Earth visual radius ≈ 60.
 */
export function dossier(star, orbitRadius, type, radiusGame) {
  const st = STELLAR[star.type] || STELLAR.G;
  const massSolar = star.massSolar || st.mass;
  const rStarM = (star.radiusSolar || st.radius) * C.Rsun;
  const aAu = auFromGameOrbit(orbitRadius);
  const aM = aAu * C.au;
  const teff = star.temp || st.teff;
  const lum = luminositySolar(star.radiusSolar || st.radius, teff);
  const alb = albedoForType(type);
  const teq = teqK(teff, rStarM, aM, alb);
  const rEarth = Math.max(0.08, radiusGame / 60);
  const dens = densityForType(type) * 1000; // kg/m³
  const rM = rEarth * C.Rearth;
  const massKg = (4 / 3) * Math.PI * rM ** 3 * dens;
  const massEarth = massKg / C.Mearth;
  const grav = gravity(massKg, rM);
  const vesc = vEscape(massKg, rM);
  const period = keplerPeriod(aM, massSolar * C.Msun);
  const hill = hillRadius(aM, massKg, massSolar * C.Msun);
  const H = scaleHeight(teq, muForType(type), grav.ms2);
  const rho0 = type === 'barren' ? 0 : type === 'gas' ? 0.16 : type === 'terra' ? 1.2 : type === 'icegiant' ? 0.4 : 0.6;
  return {
    massSolar, aAu, aM, lum, albedo: alb, teq: Math.round(teq),
    rEarth: +rEarth.toFixed(3), massEarth: +massEarth.toFixed(3),
    g: +grav.g.toFixed(3), gMs2: +grav.ms2.toFixed(2),
    vEscKmS: +(vesc / 1000).toFixed(2),
    periodDays: +(period / 86400).toFixed(2),
    hillAu: +(hill / C.au).toFixed(4),
    scaleHeightKm: +(H / 1000).toFixed(1),
    rho0,
    mu: muForType(type),
    well: +wellParameter(massSolar, aAu).toFixed(3),
    climate: climateFromTeq(teq),
  };
}

export const LAWS = [
  { id: 'newton', title: 'Universal gravitation', text: 'F = G m₁ m₂ / r². Orbits, wells and landing g all come from this.' },
  { id: 'kepler', title: 'Kepler III', text: 'T² ∝ a³ / M★. Outer worlds are slow. Inner worlds whip.' },
  { id: 'stefan', title: 'Stefan–Boltzmann', text: 'L = 4π R² σ T⁴. Hotter / bigger stars push the habitable zone out.' },
  { id: 'teq', title: 'Radiative equilibrium', text: 'Teq = T★ √(R★ / 2a) (1−A)^¼. Climate class is this number, not a dice roll.' },
  { id: 'hydro', title: 'Hydrostatic atmosphere', text: 'H = kT / (μ m_u g). Thin air on small worlds, thick soup on giants.' },
  { id: 'entry', title: 'Aerothermal entry', text: 'q̇ ∝ √ρ v³. You do not teleport onto a world — you bleed speed into heat.' },
  { id: 'roche', title: 'Roche / Hill', text: 'Moons live inside the Hill sphere and outside the Roche limit. That is why giants have families and lava worlds do not.' },
  { id: 'ftl', title: 'Frame-shift veto', text: 'Alcubierre-class stretch cannot form inside a star corona or atmosphere. Jump from open space.' },
  { id: 'filament', title: 'Cosmic web', text: 'Galaxies sit on dark-matter filaments. Inter-galactic travel rides the filament: energy ∝ m d² κ. You emerge in the target halo, not the core.' },
  { id: 'c', title: 'Relativity bound', text: 'Nothing massive crosses a galaxy in real time. The metric ride is a geometry cheat, paid in fuel and tidal load — not a magic teleporter.' },
];
