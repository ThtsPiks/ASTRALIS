// Planet access licences. The story opens a world type; the pilot then pays a
// cargo + RP stack at the galaxy's single observatory. A locked type refuses
// atmosphere entry and the deep survey. The orbital ping stays free.
import { commitOnce } from './ops.js?v=omega14';
import { tonsQty } from './catalog.js?v=omega14';

export const CARGO_LABEL = {
  minerals: 'Minerals',
  metals: 'Metals',
  ice_ore: 'Ice Ore',
  rare_ore: 'Rare Earths',
  tech: 'Technology',
};

/** Cost stacks use existing hold commodities. Starters stay free. */
export const WORLD_UNLOCKS = [
  { type: 'rocky', chapter: 1, rp: 0, cost: {}, label: 'Rocky worlds', why: 'Halcyon clears the inner rocks for every new contract.' },
  { type: 'barren', chapter: 1, rp: 0, cost: {}, label: 'Barren rock', why: 'Airless and quiet. Cleared from day one.' },
  { type: 'terra', chapter: 1, rp: 0, cost: {}, label: 'Terran worlds', why: 'Vesper Reach is the first job. Terran worlds come with the contract.' },
  { type: 'ocean', chapter: 1, rp: 0, cost: {}, label: 'Ocean worlds', why: 'Some charts log Vesper Reach as an ocean. Cleared with the contract.' },
  { type: 'desert', chapter: 2, rp: 20, cost: { minerals: 10 }, label: 'Desert worlds', why: 'Hot dust. A full mineral cut, then the array.' },
  { type: 'rust', chapter: 2, rp: 20, cost: { minerals: 8 }, label: 'Iron worlds', why: 'Red plate. A mineral haul, then the array.' },
  { type: 'salt', chapter: 2, rp: 20, cost: { minerals: 4, ice_ore: 4 }, label: 'Salt flats', why: 'Bright crust. Minerals and ice, not a free scan.' },
  { type: 'ice', chapter: 2, rp: 20, cost: { minerals: 6, ice_ore: 6 }, label: 'Ice worlds', why: 'Mine the ice belt. One survey will not pay this licence.' },
  { type: 'marsh', chapter: 4, rp: 30, cost: { minerals: 6 }, label: 'Marsh worlds', why: 'Wet and sour. A mineral cut, then the array.' },
  { type: 'toxic', chapter: 4, rp: 30, cost: { metals: 6, minerals: 6 }, label: 'Toxic worlds', why: 'Plate and a second ore cut. The beacon does not pay it for you.' },
  { type: 'carbon', chapter: 4, rp: 30, cost: { metals: 8 }, label: 'Carbon worlds', why: 'Eight tonnes of plate. Smelt a belt or haul it from a foundry.' },
  { type: 'ash', chapter: 6, rp: 35, cost: { metals: 4, minerals: 4 }, label: 'Ash worlds', why: 'Cooling crust. Hotter than a desert, short of a lava licence.' },
  { type: 'lava', chapter: 6, rp: 40, cost: { metals: 4, rare_ore: 4 }, label: 'Molten worlds', why: 'Rare earths, not a pocket sample. The heat licence is a real haul.' },
  { type: 'gas', chapter: 9, rp: 45, cost: { tech: 3, rare_ore: 3 }, label: 'Gas giants', why: 'Crack rare earths into tech, then pay both. One refinery click is not enough.' },
  { type: 'icegiant', chapter: 9, rp: 45, cost: { tech: 2, ice_ore: 8 }, label: 'Ice giants', why: 'A hold of ice plus tech. Budget a survey’s RP on top.' },
  { type: 'exotic', chapter: 13, rp: 60, cost: { rare_ore: 6, tech: 4 }, label: 'Exotic worlds', why: 'After the ending. The dearest licence on the sheet.' },
];

const STARTER = WORLD_UNLOCKS.filter((u) => u.rp === 0 && !Object.keys(u.cost || {}).length).map((u) => u.type);

export function unlockRow(type) {
  return WORLD_UNLOCKS.find((u) => u.type === type) || null;
}

function storyStage(game) {
  const c = game?.campaign;
  if (!c) return 1;
  if (c.ending) return 13;
  return Math.max(1, Number(c.chapter) || 1);
}

export function ensureWorldAccess(game) {
  if (!game) return {};
  if (!game.worldAccess || typeof game.worldAccess !== 'object') {
    game.worldAccess = {};
    for (const t of STARTER) game.worldAccess[t] = true;
  }
  return game.worldAccess;
}

export function migrateWorldAccess(game, saved) {
  if (saved && typeof saved === 'object') {
    game.worldAccess = { ...saved };
    ensureWorldAccess(game);
    return;
  }
  game.worldAccess = null;
  ensureWorldAccess(game);
  for (const row of Object.values(game.gallery || {})) {
    if (row?.type && unlockRow(row.type)) game.worldAccess[row.type] = true;
  }
}

export function worldTypeOpen(game, type) {
  if (!type || !unlockRow(type)) return true;
  return !!ensureWorldAccess(game)[type];
}

export function costParts(row) {
  const parts = [];
  for (const [id, n] of Object.entries(row?.cost || {})) {
    if (n > 0) parts.push({ id, need: n, label: CARGO_LABEL[id] || id });
  }
  if ((row?.rp || 0) > 0) parts.push({ id: 'rp', need: row.rp, label: 'RP' });
  return parts;
}

export function haveOf(game, id) {
  if (id === 'rp') return Math.max(0, Number(game?.rp) || 0);
  return tonsQty(game?.cargo?.[id] || 0);
}

export function costShort(row) {
  const parts = costParts(row);
  if (!parts.length) return 'UNLOCKED';
  return parts.map((p) => (p.id === 'rp' ? `${p.need} RP` : `${p.need} t ${p.label}`)).join(' · ');
}

export function missingCost(game, row) {
  return costParts(row).filter((p) => haveOf(game, p.id) + 1e-6 < p.need);
}

export function canAfford(game, row) {
  return missingCost(game, row).length === 0;
}

function spendCost(game, row) {
  const miss = missingCost(game, row);
  if (miss.length) return false;
  for (const [id, need] of Object.entries(row.cost || {})) {
    if (!(need > 0)) continue;
    game.cargo = game.cargo || {};
    game.cargo[id] = tonsQty((game.cargo[id] || 0) - need);
    if (game.cargo[id] <= 0) delete game.cargo[id];
  }
  if ((row.rp || 0) > 0) game.rp = Math.max(0, (game.rp || 0) - row.rp);
  return true;
}

export function worldLock(game, body) {
  if (!body || body.kind === 'wreck' || body.kind === 'station') return null;
  if (body.story === 'dive' || body.story === 'signal' || body.story === 'beacon') return null;
  const row = unlockRow(body.type);
  if (!row || worldTypeOpen(game, body.type)) return null;
  const stage = storyStage(game);
  if (stage < row.chapter) {
    const when = row.chapter >= 13 ? 'after the campaign ending' : `at chapter ${row.chapter}`;
    return { ok: false, story: true, reason: `${row.label} are sealed. The story opens them ${when}.` };
  }
  return {
    ok: false,
    story: false,
    reason: `${row.label} need a licence — dock at this galaxy’s observatory · ${costShort(row)}`,
  };
}

export function galaxyWorlds(game) {
  const list = game?.galaxy?.worlds;
  return Array.isArray(list) && list.length ? list : WORLD_UNLOCKS.map((u) => u.type);
}

export function accessRows(game, types = galaxyWorlds(game)) {
  ensureWorldAccess(game);
  const stage = storyStage(game);
  const only = new Set(types);
  return WORLD_UNLOCKS.filter((row) => only.has(row.type)).map((row) => {
    const open = !!game.worldAccess[row.type];
    const storyOk = stage >= row.chapter;
    const parts = costParts(row).map((p) => ({ ...p, have: haveOf(game, p.id) }));
    const afford = canAfford(game, row);
    let state = 'sealed';
    if (open) state = 'open';
    else if (storyOk && afford) state = 'available';
    else if (storyOk) state = 'short';
    return {
      ...row,
      open,
      storyOk,
      canPay: afford,
      parts,
      costText: costShort(row),
      state,
    };
  });
}

/** Next licence goals for the expedition desk — story-open types not yet cleared. */
export function nextLicenceGoals(game, limit = 3) {
  return accessRows(game)
    .filter((r) => r.state === 'available' || r.state === 'short' || r.state === 'sealed')
    .sort((a, b) => {
      const rank = { available: 0, short: 1, sealed: 2 };
      return (rank[a.state] - rank[b.state]) || (a.chapter - b.chapter);
    })
    .slice(0, limit);
}

export function unlockWorldType(game, type) {
  ensureWorldAccess(game);
  const row = unlockRow(type);
  if (!row) return { ok: false, reason: 'Unknown world type' };
  if (game.worldAccess[type]) return { ok: true, repeat: true, label: row.label };
  if (game.state === 'docked' && game.dockedAt?.data?.kind !== 'hub_survey') {
    return { ok: false, reason: 'Licences are issued at this galaxy’s observatory' };
  }
  if (!galaxyWorlds(game).includes(type)) return { ok: false, reason: 'This observatory does not chart that world type' };
  if (storyStage(game) < row.chapter) {
    return { ok: false, reason: row.chapter >= 13 ? 'Finish the campaign first' : `Opens at chapter ${row.chapter}` };
  }
  const miss = missingCost(game, row);
  if (miss.length) {
    const line = miss.map((p) => `${haveOf(game, p.id)}/${p.need} ${p.label}`).join(' · ');
    return { ok: false, reason: `Need ${costShort(row)} — you have ${line}` };
  }
  const op = commitOnce(game, `access:${type}`, () => {
    spendCost(game, row);
    game.worldAccess[type] = true;
    return { ok: true, label: row.label, rp: game.rp };
  });
  return { ok: true, label: row.label, repeat: !!op.repeat };
}
