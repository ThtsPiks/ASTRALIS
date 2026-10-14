// Resource ledger — fuel quotes, kit mass, expedition charge.
import { restoreCareer, packMass } from './catalog.js?v=omega14';
import { ensureWorldAccess, migrateWorldAccess } from './planet-access.js?v=omega14';

export const SAVE_V = 3;
export const KIT_MASS = 0.2;
export const FILTER_MASS = 0.2;
export const TRANSIT_MASS = 0.5;
export const PROBE_UNITS_PER_SEC = 8;
export const DEEP_RP = 12;
export const STARTER_KITS = 4;
export const FUEL_CR_PER_UNIT = 3;

export function systemJumpCost(ly) {
  const n = Number(ly);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(1, Math.round(n * 0.22));
}

/** Spend the full price or spend nothing. */
export function trySpendFuel(ship, cost) {
  const need = Math.max(0, Math.round(Number(cost) || 0));
  const have = Number(ship?.fuel) || 0;
  if (need <= 0) return { ok: true, spent: 0, have };
  if (have + 1e-6 < need) return { ok: false, need, have, spent: 0 };
  ship.fuel = have - need;
  return { ok: true, spent: need, have: ship.fuel };
}

export function holdMass(game) {
  let n = 0;
  const cargo = game?.cargo || {};
  for (const k in cargo) {
    if (k === 'data') continue;
    const v = Number(cargo[k]) || 0;
    if (v > 0) n += v;
  }
  n += (game?.kits || 0) * KIT_MASS;
  n += (game?.filters || 0) * FILTER_MASS;
  n += (game?.transitCells || 0) * TRANSIT_MASS;
  n += packMass(game);
  return Math.round(n * 10) / 10;
}

export function seedLedger(game) {
  game.rp = 0;
  game.kits = STARTER_KITS;
  game.filters = 0;
  game.transitCells = 0;
  game.researched = {};
  game.expedition = null;
  game.fuelMigrated = true;
  restoreCareer(game, {});
  game.worldAccess = null;
  ensureWorldAccess(game);
}

export function restoreLedger(game, data) {
  const d = data || {};
  game.rp = Math.max(0, Number(d.rp) || 0);
  game.kits = Math.max(0, Number(d.kits) || 0);
  game.filters = Math.max(0, Number(d.filters) || 0);
  game.transitCells = Math.max(0, Number(d.transitCells) || 0);
  game.researched = d.researched && typeof d.researched === 'object' ? { ...d.researched } : {};
  game.expedition = d.expedition || null;
  game.fuelMigrated = !!d.fuelMigrated || (d.v || 0) >= 2;
  restoreCareer(game, d);
  migrateWorldAccess(game, d.worldAccess);
}

/** One-shot refill for the old tank bug. Later loads keep the saved number. */
export function migrateFuel(ship, data) {
  const d = data || {};
  const loaded = d.fuel;
  if (loaded == null || !Number.isFinite(Number(loaded))) {
    ship.fuel = ship.maxFuel;
    return { migrated: false, fuel: ship.fuel };
  }
  ship.fuel = Number(loaded);
  const old = (d.v || 1) < SAVE_V && !d.fuelMigrated;
  if (old && ship.fuel <= 190 && ship.maxFuel > 300) {
    ship.fuel = ship.maxFuel;
    return { migrated: true, fuel: ship.fuel };
  }
  return { migrated: false, fuel: ship.fuel };
}

/**
 * Start or resume a deep survey.
 * First career survey is free. Later ones spend one kit, once per expedition id.
 */
export function beginDeepSurvey(game, bodyId) {
  const id = String(bodyId || '');
  if (!id) return { ok: false, reason: 'No body id' };
  if (game.researched?.[id]) return { ok: true, repeat: true };
  if (game.expedition?.bodyId === id && game.expedition.phase === 'running') {
    return { ok: true, resume: true };
  }
  if (!game.campaign) game.campaign = { flags: {} };
  const flags = game.campaign.flags || (game.campaign.flags = {});
  if (!flags.freeDeep) {
    flags.freeDeep = true;
    game.expedition = { id: `free-${id}`, bodyId: id, phase: 'running', paid: false };
    return { ok: true, free: true };
  }
  if ((game.kits || 0) < 1) {
    return { ok: false, reason: 'Need a scan kit — orbital ping stays free' };
  }
  game.kits -= 1;
  game.expedition = { id: `ex-${id}`, bodyId: id, phase: 'running', paid: true };
  return { ok: true, spent: 1, kits: game.kits };
}

export function grantDeepRp(game, bodyId) {
  const id = String(bodyId || '');
  if (!id || game.researched?.[id]) return { ok: false, repeat: true, rp: game.rp || 0 };
  game.researched = game.researched || {};
  game.researched[id] = 1;
  game.rp = (game.rp || 0) + DEEP_RP;
  if (game.expedition?.bodyId === id) game.expedition = { ...game.expedition, phase: 'done' };
  return { ok: true, rp: game.rp, gained: DEEP_RP };
}

export function probeIntake(dt, room, zoneStrength, starMul = 1) {
  const zone = Math.max(0.5, Math.min(1.5, 0.5 + Math.max(0, Math.min(1, zoneStrength))));
  const star = Math.max(0.5, Math.min(1.5, Number(starMul) || 1));
  const raw = Math.max(0, dt) * PROBE_UNITS_PER_SEC * zone * star;
  return Math.min(Math.max(0, room), raw);
}
