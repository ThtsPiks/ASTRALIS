// ============================================================================
//  Steam achievements — API names are stable. Never rename after first upload.
//  Local unlock + toast now. Native posts achieve:/stat: for steam_api later.
// ============================================================================
import { FLEET_IDS } from '../ship/models.js?v=fleet5';

const STORE_KEY = 'astralis.achievements.v1';

/** Steamworks Admin → Stats & Achievements. Copy API Name exactly. */
export const ACHIEVEMENTS = [
  { id: 'ACH_COLD_BOOT', name: 'Cold Boot', desc: 'Launch a new expedition.', hidden: false },
  { id: 'ACH_FIRST_DOCK', name: 'Pad Contact', desc: 'Dock at a station.', hidden: false },
  { id: 'ACH_FIRST_PING', name: 'First Return', desc: 'Complete a deep survey.', hidden: false },
  { id: 'ACH_FRAME_SHIFT', name: 'Frame Shift', desc: 'Jump to another star with G.', hidden: false },
  { id: 'ACH_HALO_RIDER', name: 'Halo Rider', desc: 'Ride a filament into another galaxy.', hidden: false },
  { id: 'ACH_VESPER', name: 'Hauler Hands', desc: 'Switch into Vesper Hauler.', hidden: false },
  { id: 'ACH_EMBER', name: 'Needle Work', desc: 'Switch into Ember Interceptor.', hidden: false },
  { id: 'ACH_ANVIL', name: 'Gun Deck', desc: 'Switch into Anvil Gunship.', hidden: false },
  { id: 'ACH_SPECTER', name: 'Diamond Skin', desc: 'Switch into Specter Diamond.', hidden: false },
  { id: 'ACH_FIVE_HULLS', name: 'Full Rack', desc: 'Own all five flyable hulls. The hangar flies one ship until the other four exist.', hidden: false, stat: 'stat_hulls', max: 5 },
  { id: 'ACH_BELT_CUT', name: 'Belt Cut', desc: 'Mine 50 tonnes of ore.', hidden: false, stat: 'stat_mined', max: 50 },
  { id: 'ACH_WRECK_MAKER', name: 'Wreck Maker', desc: 'Destroy 10 hostile ships.', hidden: false, stat: 'stat_kills', max: 10 },
  { id: 'ACH_SURVEYOR', name: 'Surveyor', desc: 'Complete 10 deep surveys.', hidden: false, stat: 'stat_scans', max: 10 },
  { id: 'ACH_AETHERIA', name: 'The Aetheria Signal', desc: 'Finish the campaign — any ending.', hidden: false },
  { id: 'ACH_CREDITS', name: 'Ledger Green', desc: 'Earn 100,000 CR lifetime.', hidden: false, stat: 'stat_earned', max: 100000 },
  { id: 'ACH_MERCY', name: 'Cold Guns', desc: 'Walk the hunt without firing.', hidden: true },
  { id: 'ACH_LOCK', name: 'Muted', desc: 'Lock the Choir.', hidden: true },
  { id: 'ACH_OPEN', name: 'Heard', desc: 'Broadcast the Signal to the sky.', hidden: true },
  { id: 'ACH_PATRON', name: 'Sold Voice', desc: 'Sell the Signal to a patron.', hidden: true },
  { id: 'ACH_CHOIR_VOID', name: 'Choir Door', desc: 'Arrive in Choir Void.', hidden: true },
];

export const STEAM_STATS = [
  { id: 'stat_scans', type: 'int', name: 'Deep surveys' },
  { id: 'stat_kills', type: 'int', name: 'Hostiles destroyed' },
  { id: 'stat_mined', type: 'int', name: 'Ore mined (t)' },
  { id: 'stat_earned', type: 'int', name: 'Lifetime credits earned' },
  { id: 'stat_docks', type: 'int', name: 'Station dockings' },
  { id: 'stat_jumps', type: 'int', name: 'Frame shifts' },
  { id: 'stat_hulls', type: 'int', name: 'Owned flyable hulls' },
];

const BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

function nativeSend(msg) {
  try { window.webkit?.messageHandlers?.astralis?.postMessage(msg); } catch { /* mac host */ }
  try { window.chrome?.webview?.postMessage(msg); } catch { /* WebView2 */ }
  try { window.external?.sendMessage?.(msg); } catch { /* Photino */ }
}

function ownedHulls(game) {
  const ids = new Set();
  if (game.shipDefId) ids.add(game.shipDefId);
  for (const s of game.storedShips || []) if (s?.id) ids.add(s.id);
  return [...ids].filter((id) => FLEET_IDS.includes(id));
}

export class AchievementTracker {
  constructor(game) {
    this.game = game;
    this.unlocked = new Set();
    this._lastStat = {};
    this.hydrate();
  }

  hydrate() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      if (Array.isArray(raw)) for (const id of raw) if (BY_ID[id]) this.unlocked.add(id);
      if (this.unlocked.has('ACH_FIVE_HULLS') && FLEET_IDS.length < 5) {
        this.unlocked.delete('ACH_FIVE_HULLS');
        this.persist();
      }
    } catch { /* ignore */ }
  }

  persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify([...this.unlocked])); } catch { /* quota */ }
  }

  isUnlocked(id) { return this.unlocked.has(id); }

  unlock(id, silent = false) {
    const def = BY_ID[id];
    if (!def || this.unlocked.has(id)) return false;
    this.unlocked.add(id);
    this.persist();
    nativeSend('achieve:' + id);
    if (!silent && this.game?.hud) {
      this.game.hud.toast(`ACHIEVEMENT · ${def.name.toUpperCase()}`, 'good', 5.5, true);
      this.game.bigToast?.(def.name.toUpperCase(), def.desc, 'ach');
    }
    return true;
  }

  /** Push INT stats to Steam. Only send when the value actually changed. */
  syncStats() {
    const g = this.game;
    if (!g?.stats) return;
    const hulls = ownedHulls(g).length;
    const next = {
      stat_scans: g.stats.scans | 0,
      stat_kills: g.stats.kills | 0,
      stat_mined: Math.round(g.stats.mined || 0),
      stat_earned: Math.round(g.stats.earned || 0),
      stat_docks: g.stats.dockings | 0,
      stat_jumps: g.stats.jumps | 0,
      stat_hulls: hulls,
    };
    for (const [k, v] of Object.entries(next)) {
      if (this._lastStat[k] === v) continue;
      this._lastStat[k] = v;
      nativeSend(`stat:${k}:${v}`);
    }
  }

  evaluate(opts = {}) {
    const silent = !!opts.silent;
    const g = this.game;
    if (!g) return;
    const s = g.stats || {};
    const c = g.campaign || {};
    const hulls = ownedHulls(g);
    const hullSet = new Set(hulls);

    if (opts.event === 'playstart' || opts.event === 'load') this.unlock('ACH_COLD_BOOT', silent);
    if ((s.dockings | 0) >= 1) this.unlock('ACH_FIRST_DOCK', silent);
    if ((s.scans | 0) >= 1) this.unlock('ACH_FIRST_PING', silent);
    if ((s.jumps | 0) >= 1) this.unlock('ACH_FRAME_SHIFT', silent);
    const home = g.universe?.homeId;
    const rode = opts.event === 'filament' || (g._filamentRides | 0) > 0
      || (g.universe?.galaxies || []).some((gal) => gal.visited && gal.id !== home);
    if (rode) this.unlock('ACH_HALO_RIDER', silent);
    if (hullSet.has('vesper')) this.unlock('ACH_VESPER', silent);
    if (hullSet.has('ember')) this.unlock('ACH_EMBER', silent);
    if (hullSet.has('anvil')) this.unlock('ACH_ANVIL', silent);
    if (hullSet.has('specter')) this.unlock('ACH_SPECTER', silent);
    if (FLEET_IDS.length >= 5 && FLEET_IDS.every((id) => hullSet.has(id))) this.unlock('ACH_FIVE_HULLS', silent);
    if ((s.mined || 0) >= 50) this.unlock('ACH_BELT_CUT', silent);
    if ((s.kills | 0) >= 10) this.unlock('ACH_WRECK_MAKER', silent);
    if ((s.scans | 0) >= 10) this.unlock('ACH_SURVEYOR', silent);
    if ((s.earned || 0) >= 100000) this.unlock('ACH_CREDITS', silent);
    if (c.ending) this.unlock('ACH_AETHERIA', silent);
    if (c.mercy && (c.chapter || 0) >= 7) this.unlock('ACH_MERCY', silent);
    if (c.ending === 'lock') this.unlock('ACH_LOCK', silent);
    if (c.ending === 'open') this.unlock('ACH_OPEN', silent);
    if (c.ending === 'patron') this.unlock('ACH_PATRON', silent);
    if (g.galaxy?.id === 'choir') this.unlock('ACH_CHOIR_VOID', silent);
    this.syncStats();
  }

  list() {
    return ACHIEVEMENTS.map((a) => ({
      ...a,
      unlocked: this.unlocked.has(a.id),
    }));
  }

  progress() {
    return { have: this.unlocked.size, total: ACHIEVEMENTS.length };
  }
}
