// ============================================================================
//  THE AETHERIA SIGNAL — campaign chapters, flags, endings
// ============================================================================
import { SHIP_DEFS, FLEET_IDS, resolveShipId } from '../ship/models.js?v=solo1';
import { chartLockText } from '../game/galaxy-charts.js?v=sky1';
import { fmtCredits } from '../core/utils.js';
import { Audio } from '../core/audio.js';

export const VOICES = {
  dispatch: 'HALCYON CONTROL',
  kaluga: 'IONA VAY',
  choir: 'UNKNOWN TX',
  sable: 'SABLE · RECORDING',
  fed: 'CONCORD OFFICE',
  syn: 'VHEL DESK',
  ind: 'FREE COLONY NET',
};

/** What “sell” means after chapter 7. Choir Void opens only for Vhel. */
export function patronPitch(allegiance) {
  const a = allegiance === 'syn' || allegiance === 'fed' ? allegiance : 'ind';
  return {
    syn: {
      title: 'SELL TO VHEL',
      card: 'Vhel takes exclusive rights and pays. Choir Void opens from Aetheria.',
      button: 'SELL TO VHEL',
      toastTitle: 'RIGHTS SOLD TO VHEL',
      toastBody: 'Vhel owns the coordinates. Choir Void opens from Aetheria.',
      announce: 'Sold to Vhel. Choir Void is on U.',
      why: 'You sold the coordinates to Vhel. Choir Void opens from Aetheria. Every other galaxy is still a chart at the observatory.',
      lock: '',
      credits: ['Choir Void opens for Vhel', 'The Veil is the anchor'],
      filmCard: 'RIGHTS SOLD',
      filmLook: 'Hold the picture. The door in Aetheria does not move. Vhel’s name is what changes, and Choir Void is the room behind it.',
      filmDeskWho: 'VHEL DESK',
      filmDesk: 'The contract is sealed. We own the coordinates. Other ships can still buy neighbour charts. Choir Void opens from Aetheria because you sold the route to us.',
      filmIona: 'The money is real. So is the name on the route. Vhel will decide who flies Choir Void. Keep the credits. I will be listening for who they let through.',
      call: 'Sell to Vhel if they should own the route. They are the only desk that opens Choir Void. Jam the transmitter if it should go dark with no owner. Publish it if every ship should choose.',
    },
    fed: {
      title: 'SELL TO CONCORD',
      card: 'Concord buys the file and keeps it sealed. Choir Void stays closed. That is their lock, not yours.',
      button: 'SELL TO CONCORD',
      toastTitle: 'RIGHTS SOLD TO CONCORD',
      toastBody: 'Concord holds the coordinates. Choir Void stays closed.',
      announce: 'Sold to Concord. Choir Void stays closed.',
      why: 'You sold the coordinates to Concord. They keep the route sealed. Choir Void stays closed. Neighbour charts still open at the observatory.',
      lock: 'You sold the coordinates to Concord. They kept Choir Void closed.',
      credits: ['Concord keeps Choir shut', 'The Veil is the anchor'],
      filmCard: 'RIGHTS SOLD',
      filmLook: 'Hold the picture. The door stays in Aetheria. Concord is buying the lock, not the sky behind it.',
      filmDeskWho: 'CONCORD OFFICE',
      filmDesk: 'The file is ours. We will not put the coordinates on the open net, and we will not fly Choir Void. Neighbour charts stay on the observatory desk. The jam would have left this with no owner. This sale leaves it with us.',
      filmIona: 'Concord paid for the file. They will sit on it. Choir Void stays closed, and that was the sale, not the silence you could have made yourself.',
      call: 'Sell the file to Concord if they should hold it shut. Choir Void stays closed. The jam is the other lock: the transmitter goes dark and nobody keeps the coordinates. Publish it if every ship should have the route.',
    },
    ind: {
      title: 'GIVE IT TO THE COLONIES',
      card: 'They will not own the route. You are paid to keep it out of Concord and Vhel. Choir Void stays closed.',
      button: 'HAND TO THE COLONIES',
      toastTitle: 'FILED WITH THE COLONIES',
      toastBody: 'The colonies refused to own the route. Choir Void stays closed.',
      announce: 'Filed with the colonies. Choir Void stays closed.',
      why: 'You gave the file to the colonies. They refused to own the route. Choir Void stays closed. Neighbour charts still open at the observatory.',
      lock: 'The colonies would not own the route. Choir Void stays closed.',
      credits: ['Choir Void stays unowned', 'The Veil is the anchor'],
      filmCard: 'LEFT UNOWNED',
      filmLook: 'Hold the picture. The colonies will not put a name on this door. The route stays unowned.',
      filmDeskWho: 'FREE COLONY NET',
      filmDesk: 'We took the file and struck the ownership line off it. Concord does not have it. Vhel does not have it. Choir Void stays closed, because opening it would make a claim.',
      filmIona: 'They paid you to keep the other two desks out. They did not buy the sky. Choir Void stays closed, and no faction can call the route theirs.',
      call: 'Hand the file to the colonies if nobody should own it. They will not open Choir Void. Jam the transmitter if you want it dark. Publish the coordinates if every ship should choose.',
    },
  }[a];
}

export const CHAPTERS = [
  {
    n: 1, title: 'THE REPLACEMENT',
    objective: 'Lock the marked planet (T) and hold F',
    why: 'Commander Sable vanished during a routine survey of Vesper Reach. Halcyon says you are taking over her contract; Iona says the contract is the only reason they will let you near the system. Scan the marked world. Find out what Sable saw—and why her last transmission told everyone to stay away.',
  },
  {
    n: 2, title: 'THREE CHARTS',
    objective: 'Ping three different worlds (T + hold F)',
    why: 'The navigation beacons across Aetheria went dark within minutes of one another. Concord wants three independent surveys before it risks restarting the network. Chart different worlds; a second reading of the same place cannot tell us whether the silence is spreading.',
  },
  {
    n: 3, title: 'FIT THE SHIP',
    objective: 'Dock Halcyon · E · SHIP UPGRADES · buy any rank 1',
    why: 'Sable’s route runs beyond the safe beacon corridor, and the starter hull was built for short hauls. Halcyon can fit a cheap first upgrade. Choose speed, acceleration, or cargo before you leave home; nobody knows how far the next lead will take you.',
  },
  {
    n: 4, title: "SABLE'S WRECK",
    objective: 'G · jump the gold star · hold F on the wreck',
    why: 'The last intact fragment of Sable’s log points to Beacon MX-0 in the next system. The beacon is still broadcasting a warning, though nobody can explain who recorded it. Jump there, find the wreck, and scan it before another crew reaches it.',
  },
  {
    n: 5, title: 'THE CRATE',
    objective: 'Jump the gold star · dock · drop the crate',
    why: 'The wreck contains a sealed four-tonne data crate. Concord wants it kept intact; Vhel has offered to buy it without opening it. Both groups know more than they admit. Take the crate to the marked station and watch who is waiting there.',
  },
  {
    n: 6, title: 'MORE WRECKS',
    objective: 'Tab wrecks · hold F · three of them',
    why: 'The crate was only a copy, and the recording has deliberate gaps. Sable scattered the remaining fragments across derelicts in Aetheria. Scan three wrecks and compare their logs; the missing pieces may explain why the navigation beacons were silenced.',
  },
  {
    n: 7, title: 'PICK A SIDE',
    objective: 'Dock · E · COMMS · pick Concord, Vhel, or Independents',
    why: 'The fragments have reached three very different audiences. Concord wants the transmitter jammed before more ships can follow it. Vhel wants exclusive rights to the coordinates. The Independents want no faction to control the route. Choose a patron, knowing the choice will shape who trusts you when the signal is found.',
  },
  {
    n: 8, title: 'FIGHT OR PASS',
    objective: 'Kill 2 hostiles — or jump a danger-3 system and dock without firing',
    why: 'Your new allies want proof that your choice was more than a button on a station screen. Concord asks you to clear two hostile ships. The Independents ask you to cross a danger-3 system and dock without firing. One path answers force with force; the other tests whether you can refuse the invitation.',
  },
  {
    n: 9, title: 'EIGHT TONNES',
    objective: 'Mine ore · sell or refine 8t',
    why: 'The route to the source runs deep into the system core, beyond the range of a cheap jump. Mine a belt, then sell or refine eight tonnes of ore to cover the drive and secure clearance. The work buys you a way forward—and gives the crews tracking the signal time to close in.',
  },
  {
    n: 10, title: 'THE CORE',
    objective: 'G · gold star · JUMP to the core',
    why: 'The recovered fragments resolve to a location inside Aetheria, toward the core. The signal is not coming from another galaxy, and the U map will not take you there. Jump to the marked star; Sable followed this route and never checked in again.',
  },
  {
    n: 11, title: 'THE SOURCE',
    objective: 'Lock the marked world · hold F, or fly into atmosphere',
    why: 'The jump shows the world. It does not read the transmitter. The wreck logs stop in orbit, and the voice on the beacons is still the old warning. Lock the world and hold F, or land. The surface reading is what says whether anyone is speaking.',
  },
  {
    n: 12, title: 'YOUR CALL',
    objective: 'Dock · E · COMMS · jam, sell, or publish',
    why: 'The surface reading is in. Jam the transmitter and the route stays buried, with no owner. Publish the coordinates and every ship can fly on to Choir Void. The third choice follows the desk you signed in chapter 7: Vhel takes the route and opens Choir Void, Concord buys the file and keeps it shut, the colonies take it and refuse to own it.',
  },
];

/** One-line player instruction: keys, destination, no poetry. */
export function nextStep(game) {
  const c = game?.campaign;
  const gal = game?.galaxy;
  if (!c || c.ending) {
    return {
      hud: 'Observatory chart · then U along a filament',
      how: 'Dock the observatory. If Navigation I is not fitted, buy metals, tech and rare earths there, fit them at the shipyard, and open the science route. Then buy a neighbour’s chart. U only rides a filament from the galaxy you are in.',
      why: c?.ending === 'open'
        ? 'You published the coordinates. Choir Void is the filament from Aetheria. Every other galaxy is a chart at the observatory next door.'
        : c?.ending === 'lock'
          ? 'You jammed the transmitter. Neighbour charts still open. Choir Void stays closed.'
          : patronPitch(c?.allegiance).why,
      mapKey: 'G',
      systemId: null, galaxyId: null,
    };
  }
  const ch = c.chapter;
  const named = (tag) => storySystem(gal, tag);
  const home = named('home');
  const beacon = named('beacon');
  const market = named('market');
  const core = named('core');
  const signal = named('signal');
  const here = game.system;
  const inSys = (s) => s && here && s.id === here.id;

  if (ch === 1) {
    const w = diveWorld(game);
    return {
      hud: `T then hold F · ${w?.name || 'the marked world'}`,
      how: `Lock ${w?.name || 'the marked planet'} with T, then hold F for lidar ping — that finishes this chapter. Deep survey and Y come later for other worlds. Orbital ping stays free. You can also fly into the clouds. Stay in this system.`,
      why: CHAPTERS[0].why,
      mapKey: 'M',
      systemId: here?.id, galaxyId: gal?.id, bodyHint: w?.name,
    };
  }
  if (ch === 2) {
    const n = Math.min(3, (c.scanIds || []).length || c.homeScans || 0);
    return {
      hud: `T + hold F · unique surveys ${n}/3`,
      how: 'Each different planet or moon: lock with T (or Tab), hold F for ping — ping counts. Same world twice does not count. You need three.',
      why: CHAPTERS[1].why,
      mapKey: 'M',
      systemId: here?.id, galaxyId: gal?.id,
    };
  }
  if (ch === 3) {
    const yardSys = (gal?.systems || []).find((s) => (s.stations || []).some((st) => st.kind === 'hub_shipyard')) || home;
    const yard = (yardSys?.stations || []).find((s) => s.kind === 'hub_shipyard');
    const there = inSys(yardSys);
    return {
      hud: there
        ? `Dock ${yard?.name || 'the shipyard'} · E · SHIP UPGRADES · buy L1`
        : `G · JUMP · ${yardSys?.name || 'the shipyard'}`,
      how: there
        ? `Press E at ${yard?.name || 'the shipyard'}. Open SHIP UPGRADES and buy any rank-1 item. A module you already fitted still counts.`
        : `The shipyard is not in this system. Press G, click the gold star, confirm JUMP, then dock ${yard?.name || 'the shipyard'}.`,
      why: CHAPTERS[2].why,
      mapKey: there ? 'M' : 'G',
      systemId: yardSys?.id, galaxyId: gal?.id,
    };
  }
  if (ch === 4) {
    if (!inSys(beacon)) {
      return {
        hud: `G · JUMP · ${beacon?.name || 'the next system'}`,
        how: `Press G for this galaxy. Click the gold star. Confirm JUMP. The chart shows the fuel in units before you go, and whether the ride back is covered. (U is other galaxies — ignore it for now.)`,
        why: CHAPTERS[3].why,
        mapKey: 'G',
        systemId: beacon?.id, galaxyId: gal?.id,
      };
    }
    return {
      hud: 'Tab the wreck · hold F',
      how: 'Tab until you lock Beacon MX-0. Fly close. Hold F. If a planet sits in the way, fly around it.',
      why: CHAPTERS[3].why,
      mapKey: 'M',
      systemId: beacon?.id, galaxyId: gal?.id,
    };
  }
  if (ch === 5) {
    if (!inSys(market)) {
      return {
        hud: `G · JUMP · ${market?.name || 'the market'} · crate in hold`,
        how: 'Press G, click the gold star, confirm JUMP. Then fly to the station and press E. Leave the crate sealed.',
        why: CHAPTERS[4].why,
        mapKey: 'G',
        systemId: market?.id, galaxyId: gal?.id,
      };
    }
    return {
      hud: 'Dock the marked pad · E',
      how: 'Lock the station (T), slow down, press E when it says so. Docking unloads the crate. You do not need COMMS yet.',
      why: CHAPTERS[4].why,
      mapKey: 'M',
      systemId: market?.id, galaxyId: gal?.id,
    };
  }
  if (ch === 6) {
    return {
      hud: `Tab wrecks · hold F · ${(c.flags.ch5Wrecks || 0)}/3`,
      how: 'Tab until a wreck locks. Hold F. If this system has none left, press G and jump to another star in Aetheria.',
      why: CHAPTERS[5].why,
      mapKey: 'G',
      systemId: here?.id, galaxyId: gal?.id,
    };
  }
  if (ch === 7) {
    return {
      hud: 'Dock · E · COMMS · pick Concord / Vhel / Independents',
      how: `Fly to ${home?.stations?.[0]?.name || 'a station'}. Press E. Open COMMS. One button. This decides who you work for at the end.`,
      why: CHAPTERS[6].why,
      mapKey: 'M',
      systemId: home?.id, galaxyId: gal?.id,
    };
  }
  if (ch === 8) {
    return {
      hud: c.allegiance === 'ind'
        ? 'G · JUMP a danger-3 system · dock without firing'
        : 'Destroy 2 hostiles (RMB seeker) — or dock in danger-3 without firing there',
      how: 'Two seeker kills finish the fight. A shot in an older system does not spoil a clean dock: jump to a danger-3 star and dock without firing in that system. Missiles you spend stay spent.',
      why: CHAPTERS[7].why,
      mapKey: 'G',
      systemId: (gal?.systems || []).find((s) => (s.danger || 0) >= 3 && s.id !== here?.id)?.id || here?.id,
      galaxyId: gal?.id,
    };
  }
  if (ch === 9) {
    const sold = Math.min(8, c.flags.oreSold || 0);
    return {
      hud: `Mine ore · sell or refine · ${sold}/8t`,
      how: 'Point at a belt rock, hold F to cut. Dock any pad. MARKET to sell, or REFINERY to smelt. Eight tonnes total.',
      why: CHAPTERS[8].why,
      mapKey: 'G',
      systemId: here?.id, galaxyId: gal?.id,
    };
  }
  if (ch === 10) {
    if (!inSys(core)) {
      return {
        hud: `G · JUMP · ${core?.name || 'the core'}`,
        how: 'Press G, click the gold star, confirm JUMP. The source is in this galaxy, not on the U map.',
        why: CHAPTERS[9].why,
        mapKey: 'G',
        systemId: core?.id, galaxyId: gal?.id,
      };
    }
    return {
      hud: 'You are in the core · next job loads',
      how: 'This jump counted. Scoop the star if fuel is low (hold outside the corona). Watch the HUD for the next line.',
      why: CHAPTERS[9].why,
      mapKey: 'M',
      systemId: core?.id, galaxyId: gal?.id,
    };
  }
  if (ch === 11) {
    if (!inSys(signal)) {
      return {
        hud: `G · JUMP · ${signal?.name || 'the source system'}`,
        how: 'Press G. The gold star is the source system. Confirm JUMP.',
        why: CHAPTERS[10].why,
        mapKey: 'G',
        systemId: signal?.id, galaxyId: gal?.id,
      };
    }
    return {
      hud: 'Lock the marked world · hold F, or land',
      how: 'Lock the marked world (T). Hold F from orbit, or fly into atmosphere. Either counts.',
      why: CHAPTERS[10].why,
      mapKey: 'M',
      systemId: signal?.id, galaxyId: gal?.id,
    };
  }
  const port = (gal?.systems || []).find((s) => (s.stations || []).some((st) => st.kind === 'hub_trade')) || here;
  const portName = (port?.stations || []).find((st) => st.kind === 'hub_trade')?.name || 'the trade exchange';
  return {
    hud: `Dock ${portName} · E · COMMS`,
    how: `The radio is on the trade exchange, not on the yard or the arsenal. Press E at ${portName}. Jam the transmitter, publish the coordinates, or ${patronPitch(c.allegiance).button.toLowerCase()}.`,
    why: CHAPTERS[11].why,
    mapKey: 'M',
    systemId: port?.id, galaxyId: gal?.id,
  };
}

/** G = this galaxy. U = other galaxies. Choir Void follows the ending. */
export function travelLegend(camp) {
  return 'Click a destination, then CONFIRM at the bottom.';
}

export function sheetAsleep(camp) {
  return false;
}

const UNLOCKS = {
  1: ['aurora'],
};

const BEAT_PAY = { 2: 2800, 3: 3600, 4: 7200, 5: 0, 6: 0, 7: 11000, 8: 0, 9: 9000, 10: 14000, 11: 16000, 12: 22000 };

const CHAPTER_FILM = {
  2: 'ch2', 3: 'chSto', 4: 'ch3', 5: 'ch4', 6: 'ch5', 7: 'ch6', 8: 'ch7', 9: 'chOre', 10: 'ch8', 11: 'ch9', 12: 'ch10',
};

export function createCampaign() {
  return {
    chapter: 1,
    allegiance: null,
    mercy: false,
    ending: null,
    homeScans: 0,
    scanIds: [],
    wreckScans: 0,
    killsInHunt: 0,
    flags: { stationFull: true, stretched12: true },
    comms: [],
    unlockedShips: ['aurora'],
    charts: {},
  };
}

export function migrateCampaign(c) {
  if (!c) return c;
  c.scanIds = Array.isArray(c.scanIds) ? c.scanIds : [];
  c.flags = c.flags || {};
  if (!c.charts || typeof c.charts !== 'object') c.charts = {};
  if (c.ending) {
    c.chapter = 12;
    c.flags.stretched12 = true;
    return c;
  }
  if (!c.flags.stretched12) {
    c.flags.stretched12 = true;
    const map = { 1: 1, 2: 2, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 10, 9: 11, 10: 12 };
    if (c.chapter >= 1 && c.chapter <= 10) c.chapter = map[c.chapter] || c.chapter;
    if (c.chapter >= 4) c.flags.stoInstall = true;
    if (c.chapter >= 10) c.flags.oreSold = Math.max(c.flags.oreSold || 0, 8);
  }
  if (c.chapter > 12) c.chapter = 12;
  return c;
}

export function chapterInfo(camp) {
  const n = Math.max(1, Math.min(CHAPTERS.length, (camp && camp.chapter) || 1));
  return CHAPTERS[n - 1];
}

export function storySystem(galaxy, tag) {
  if (tag === 'signal') {
    const tagged = galaxy?.systems?.find((s) => s.storyTag === 'signal');
    if (tagged) return tagged;
    return galaxy?.systems?.find((s) => (s.planets || []).some((p) => p.story === 'signal')) || null;
  }
  return galaxy?.systems?.find((s) => s.storyTag === tag) || null;
}

export function pushComm(camp, who, text) {
  camp.comms.unshift({ who, text, t: Date.now() });
  if (camp.comms.length > 48) camp.comms.length = 48;
}

function announce(game, who, text) {
  const c = game.campaign;
  if (!c) return;
  // Station traffic log + one expiring HUD comm. Do not also toast the
  // same paragraph — that tripled the briefing across left/bottom/compass.
  pushComm(c, who, text);
  try { Audio.radio(); } catch { /* audio optional */ }
}

export function shipUnlocked(camp, id) {
  const hid = resolveShipId(id);
  if (SHIP_DEFS[hid]?.comingSoon) return false;
  if (!camp) return hid === 'aurora';
  return (camp.unlockedShips || []).includes(hid);
}

export function refreshUnlocks(camp) {
  camp.unlockedShips = camp.unlockedShips || ['aurora'];
  camp.unlockedShips = camp.unlockedShips.map((id) => resolveShipId(id)).filter((id, i, a) => a.indexOf(id) === i && FLEET_IDS.includes(id));
  for (const [ch, ids] of Object.entries(UNLOCKS)) {
    if (camp.chapter >= +ch) {
      for (const id of ids) if (!camp.unlockedShips.includes(id)) camp.unlockedShips.push(id);
    }
  }
}

function homeStation(game) {
  const home = storySystem(game.galaxy, 'home') || game.galaxy?.systems?.[0];
  return home?.stations?.[0] || game.system?.stations?.[0] || null;
}

function diveWorld(game) {
  const planets = game.system?.planets || [];
  return planets.find((p) => p.story === 'dive' || p.type === 'terra' || p.type === 'ocean') || planets[0] || null;
}

function setChapter(game, n, toastTitle) {
  const c = game.campaign;
  let guard = 0;
  while (guard++ < 4) {
    if (n === 9 && (c.flags.oreSold || 0) >= 8) { n = 10; continue; }
    if (n === 10) {
      const core = storySystem(game.galaxy, 'core');
      if (core && game.system?.id === core.id) {
        c.flags.coreArrived = true;
        n = 11;
        continue;
      }
    }
    break;
  }
  if (n <= c.chapter) return;
  const from = c.chapter;
  c.chapter = n;
  const before = new Set(c.unlockedShips || []);
  refreshUnlocks(c);
  const added = (c.unlockedShips || []).filter((id) => !before.has(id));
  const info = chapterInfo(c);
  const pay = BEAT_PAY[n] || 0;
  if (pay) {
    game.credits += pay;
    game.stats.earned += pay;
  }
  const played = game.cinema?.play(CHAPTER_FILM[n] || `ch${n}`);
  if (!played) {
    if (toastTitle) game.bigToast(toastTitle, info.objective, 'good');
    else game.bigToast(`CHAPTER ${info.n} · ${info.title}`, info.objective, 'good');
    if (pay && game.hud) game.hud.toast(`+${fmtCredits(pay)} CR`, 'money', 4, true);
    if (added.length && game.hud) {
      const names = added.map((id) => SHIP_DEFS[id]?.name || id).join(' · ');
      game.hud.toast(`HULL UNLOCKED · ${names}`, 'money', 8, true);
    }
  }
  if (n === 2) {
    harvestPingedSurveys(game);
    const got = (c.scanIds || []).length;
    if (got && game.hud) game.hud.toast(`Survey ${Math.min(3, got)}/3 locked`, 'good', 4, true);
    if (got >= 3) {
      setChapter(game, 3);
      return;
    }
  }
  if (n === 3 && from < 3) pinStoryCourier(game);
  if (n === 10 && from < 10 && game.hud) game.hud.toast('Source is in the core. Press G, gold star, JUMP.', 'info', 8, true);
  revealStoryDest(game);
  syncStoryMissions(game);
  game.save();
}

function giveBlackMarketRun(game) {
  if (game.missions.some((m) => m.id === 'story-black-market')) return;
  const destSys = storySystem(game.galaxy, 'market') || game.galaxy.systems[2];
  const st = destSys.stations[0] || game.system.stations[0];
  if (!st) return;
  game.cargo.data = (game.cargo.data || 0) + 4;
  game.missions.push({
    id: 'story-black-market',
    type: 'cargo',
    story: true,
    commodity: 'data',
    commodityName: 'Sealed beacon dump',
    amount: 4,
    destId: st.id,
    destName: st.name,
    destSystem: destSys.name,
    reward: 18000,
    desc: 'Deliver the sealed crate. Do not open it. Docking at the marked pad unloads it.',
    escrow: true,
  });
  game.campaign.flags.crate = true;
  if (game.hud) game.hud.toast(`Crate loaded · take it to ${st.name} in ${destSys.name}`, 'info', 9, true);
}

function bodyKey(payload) {
  if (payload?.id) return String(payload.id);
  if (payload?.name) return `${payload.kind || 'body'}:${payload.name}`;
  return '';
}

function creditUniqueSurvey(c, payload) {
  const kind = payload.kind;
  if (kind !== 'planet' && kind !== 'moon') return false;
  const id = bodyKey(payload);
  if (!id) return false;
  c.scanIds = Array.isArray(c.scanIds) ? c.scanIds : [];
  if (c.scanIds.includes(id)) return false;
  c.scanIds.push(id);
  c.homeScans = c.scanIds.length;
  return true;
}

function harvestPingedSurveys(game) {
  const c = game?.campaign;
  if (!c || c.chapter > 2) return;
  const systems = game.galaxy?.systems?.length ? game.galaxy.systems : (game.system ? [game.system] : []);
  for (const sys of systems) {
    for (const p of sys.planets || []) {
      if (p.pinged || p.scanned) creditUniqueSurvey(c, { id: p.id, kind: 'planet', name: p.name });
      for (const m of p.moons || []) {
        if (m.pinged || m.scanned) creditUniqueSurvey(c, { id: m.id, kind: 'moon', name: m.name });
      }
    }
  }
}

function pinStoryCourier(game) {
  const c = game?.campaign;
  if (!c || c.flags.courierPinned) return;
  if (game.missions?.some((m) => m.id === 'story-courier')) {
    c.flags.courierPinned = true;
    return;
  }
  const home = homeStation(game);
  const destSys = storySystem(game.galaxy, 'market') || (game.galaxy?.systems || []).find((s) => s.id !== game.system?.id);
  const dest = destSys?.stations?.[0];
  if (!home || !dest) return;
  const t = game.stats?.playtime || 0;
  game.missions = game.missions || [];
  game.missions.push({
    id: 'story-courier',
    type: 'courier',
    pad: true,
    title: 'TIMED COURIER',
    commodity: 'passengers',
    commodityName: 'Priority packet',
    amount: 1,
    destId: dest.id,
    destName: dest.name,
    destSystem: destSys.name,
    destSystemId: destSys.id,
    origin: home.id,
    originName: home.name,
    originSystem: game.system?.name || '',
    reward: 6400,
    expires: t + 900,
    desc: 'Packet from Halcyon. Fifteen minutes. Dock the marked pad.',
    escrow: true,
  });
  game.cargo = game.cargo || {};
  game.cargo.passengers = (game.cargo.passengers || 0) + 1;
  c.flags.courierPinned = true;
  if (game.hud) game.hud.toast('Timed courier on COMMS · 15 min', 'info', 8, true);
}

function storyProgress(game) {
  const c = game.campaign;
  const ch = c.chapter;
  if (ch === 1) return { progress: (c.flags.dived || c.flags.dockedOnce || c.flags.pingedDive) ? 1 : 0, count: 1 };
  if (ch === 2) return { progress: Math.min(3, (c.scanIds || []).length || c.homeScans || 0), count: 3 };
  if (ch === 3) return { progress: c.flags.stoInstall ? 1 : 0, count: 1 };
  if (ch === 4) return { progress: c.flags.beaconScanned ? 1 : 0, count: 1 };
  if (ch === 5) {
    const m = game.missions.find((x) => x.id === 'story-black-market');
    const have = (game.cargo.data || 0);
    return { progress: m ? Math.min(m.amount, have) : 0, count: m?.amount || 4 };
  }
  if (ch === 6) return { progress: Math.min(3, c.flags.ch5Wrecks || 0), count: 3 };
  if (ch === 7) return { progress: c.allegiance ? 1 : 0, count: 1 };
  if (ch === 8) return { progress: Math.min(2, c.killsInHunt || 0) + (c.mercy ? 2 : 0), count: 2 };
  if (ch === 9) return { progress: Math.min(8, c.flags.oreSold || 0), count: 8 };
  if (ch === 10) return { progress: c.flags.coreArrived ? 1 : 0, count: 1 };
  if (ch === 11) return { progress: c.flags.signal ? 1 : 0, count: 1 };
  if (ch === 12) return { progress: c.ending ? 1 : 0, count: 1 };
  return { progress: 0, count: 1 };
}

export function syncStoryMissions(game) {
  const c = game.campaign;
  if (!c || !game.galaxy) return;
  const ch = c.chapter;
  const st = homeStation(game);
  const world = diveWorld(game);
  game.missions = (game.missions || []).filter((m) => !m.story || m.id === 'story-black-market');
  if (c.ending) return;
  const { progress, count } = storyProgress(game);
  const info = chapterInfo(c);
  if (ch === 5) {
    giveBlackMarketRun(game);
    return;
  }
  if (game.missions.some((m) => m.id === `story-ch${ch}`)) {
    const m = game.missions.find((x) => x.id === `story-ch${ch}`);
    if (m) { m.progress = progress; m.count = count; m.desc = info.why; m.how = nextStep(game).how; }
    return;
  }
  const destSys = (() => {
    if (ch === 4) return storySystem(game.galaxy, 'beacon');
    if (ch === 10) return storySystem(game.galaxy, 'core');
    if (ch === 11) return storySystem(game.galaxy, 'signal');
    return storySystem(game.galaxy, 'home') || game.system;
  })();
  game.missions.unshift({
    id: `story-ch${ch}`,
    type: 'story',
    story: true,
    progress, count,
    destId: st?.id,
    destName: st?.name || 'Halcyon Port',
    destSystem: destSys?.name || game.system?.name,
    targetSystemId: destSys?.id,
    reward: BEAT_PAY[ch + 1] || 0,
    desc: info.why,
    how: nextStep(game).how,
    expires: null,
  });
  if (world && ch <= 2) world.story = world.story || 'dive';
}

export function restoreStoryCargo(game) {
  const c = game.campaign;
  if (!c) return;
  if (c.chapter === 5 && c.flags.crate) {
    const m = game.missions.find((x) => x.id === 'story-black-market');
    const need = m?.amount || 4;
    game.cargo.data = Math.max(game.cargo.data || 0, need);
  }
}

export function onCampaignEvent(game, type, payload = {}) {
  if (game.tutorial) return;
  const c = game.campaign;
  if (!c || c.ending) return;
  const ch = c.chapter;

  if (type === 'playstart' && !c.flags.intro) {
    c.flags.intro = true;
    const world = diveWorld(game);
    const wname = world?.name || 'the marked world';
    const st = homeStation(game);
    if (st) st.name = 'Halcyon Port';
    if (world) world.story = 'dive';
    announce(game, VOICES.dispatch, `${game.callsign}, Halcyon Control. Sable missed check-in. Marked planet is ${wname}. Lock it with T, hold F.`);
    const body = (game.bodies || []).find((b) => b.data && world && b.data.id === world.id);
    if (body && game.setTarget) game.setTarget(body, true);
    revealStoryDest(game);
    syncStoryMissions(game);
  }

  if (type === 'load' || type === 'respawn') {
    restoreStoryCargo(game);
    harvestPingedSurveys(game);
    if (c.chapter >= 3 && !c.ending) pinStoryCourier(game);
    if (c.chapter === 9 && (c.flags.oreSold || 0) >= 8) setChapter(game, 10, 'ORE LOGGED');
    if (c.chapter === 10) {
      const core = storySystem(game.galaxy, 'core');
      if (core && game.system?.id === core.id) setChapter(game, 11);
    }
    syncStoryMissions(game);
    if (type === 'respawn') {
      announce(game, VOICES.dispatch, 'Clone bay green. Contract still stands.');
    }
  }

  if (type === 'filament') {
    c.flags.filamentRide = true;
    announce(game, VOICES.dispatch, 'Transit hold. You are between galaxies. Sit still until the ride ends.');
  }

  if (type === 'atmosphere') {
    c.flags.dived = true;
    if (ch === 1 && payload.story === 'dive') {
      const w = diveWorld(game);
      if (w) {
        w.pinged = true;
        creditUniqueSurvey(c, { id: w.id, kind: w.kind || 'planet', name: w.name });
      }
      announce(game, VOICES.dispatch, `Down on ${payload.name || 'the surface'}. Scan three different worlds next.`);
      setChapter(game, 2, 'PLANET SCANNED');
    }
    if (ch === 11 && (payload.story === 'signal' || payload.signal)) {
      c.flags.signal = true;
      game.hudCinematic = 5;
      announce(game, VOICES.dispatch, 'Surface reading is in. Dock a trade pad and open COMMS.');
      setChapter(game, 12, 'SOURCE FOUND');
    }
  }

  if (type === 'dock') {
    c.flags.dockedOnce = true;
    if (ch === 1) {
      announce(game, VOICES.dispatch, 'Docked. The contract is still the marked planet. Lock it with T and hold F.');
    }
    if (ch === 3) {
      c.flags.stoDock = true;
      if (c.flags.stoInstall) setChapter(game, 4, 'UPGRADE FITTED');
    }
    if (ch === 5 && payload.stationId && game.missions.some((m) => m.id === 'story-black-market' && m.destId === payload.stationId)) {
      announce(game, VOICES.syn, 'Crate received, still sealed. Scan other wrecks — they have the rest of the recording.');
      setChapter(game, 6);
    }
    if (ch === 8 && !(c.flags.shotsThisVisit > 0) && (payload.danger || 0) >= 3) {
      c.flags.visitedDanger = true;
      c.mercy = true;
      announce(game, VOICES.ind, 'You did not fire. That is what we asked.');
      setChapter(game, 9, 'NO SHOTS FIRED');
    }
  }

  if (type === 'upgrade') {
    c.flags.stoInstall = true;
    if (ch === 3) {
      announce(game, VOICES.dispatch, 'Upgrade is in. Press G, click the gold star, jump. Sable’s wreck is in that system.');
      setChapter(game, 4, 'UPGRADE FITTED');
    }
  }

  if (type === 'mine') {
    const tons = Math.max(0, Number(payload.tons) || 0);
    c.flags.oreCut = (c.flags.oreCut || 0) + tons;
  }

  if (type === 'ore') {
    const tons = Math.max(0, Number(payload.tons) || 0);
    c.flags.oreSold = (c.flags.oreSold || 0) + tons;
    if (ch === 9) {
      syncStoryMissions(game);
      if ((c.flags.oreSold || 0) >= 8) {
        announce(game, VOICES.dispatch, 'Eight tonnes logged. Press G, gold star, jump toward the core.');
        setChapter(game, 10, 'ORE LOGGED');
      } else if (game.hud) {
        game.hud.toast(`Ore ${Math.min(8, Math.round(c.flags.oreSold || 0))}/8t`, 'good', 3.4, true);
      }
    }
  }

  if (type === 'scan' || type === 'ping') {
    const kind = payload.kind;
    const story = payload.story;
    if (ch === 1 && (story === 'dive' || payload.dive) && (kind === 'planet' || kind === 'moon')) {
      c.flags.pingedDive = true;
      creditUniqueSurvey(c, payload);
      const w = diveWorld(game);
      if (w) {
        w.pinged = true;
        creditUniqueSurvey(c, { id: w.id, kind: w.kind || 'planet', name: w.name });
      }
      announce(game, VOICES.dispatch, `Scan on ${payload.name || 'the marked world'} is in. Three different charts next — then dock Halcyon.`);
      setChapter(game, 2, 'SCAN COMPLETE');
      if (game.hud && !c.flags.pingDeepHint) {
        c.flags.pingDeepHint = true;
        game.hud.toast('Ping logged. Other worlds: deep survey costs a scan kit; world licences unlock at the Research Array.', 'info', 8, true);
      }
    }
    if ((ch === 2 || c.chapter === 2) && creditUniqueSurvey(c, payload)) {
      syncStoryMissions(game);
      const n = c.scanIds.length;
      if (n >= 3) {
        announce(game, VOICES.dispatch, 'Three charts in. Dock Halcyon, press E, open SHIP UPGRADES, buy any rank 1. A module you already fitted still counts.');
        setChapter(game, 3);
        const fittedAlready = Object.values(game.upgrades || {}).some((n) => n > 0) || (game.fitted || []).length > 0;
        if (fittedAlready) {
          c.flags.stoInstall = true;
          setChapter(game, 4, 'UPGRADE ALREADY FITTED');
        }
      } else if (game.hud) {
        game.hud.toast(`Survey ${n}/3 locked`, 'good', 4, true);
      }
    }
    if (kind === 'wreck' && (type === 'scan' || type === 'ping')) {
      if (type === 'scan') c.wreckScans++;
      if (ch === 4 && (story === 'beacon' || payload.beacon)) {
        c.flags.beaconScanned = true;
        announce(game, VOICES.choir, 'Beacon MX-0. Coordinates follow. Do not approach the inner world.');
        announce(game, VOICES.sable, 'Sable. If this is looping I did not make it back. Do not open the crate. Take it to the market station.');
        announce(game, VOICES.kaluga, 'Iona Vay. That was Sable. Bring the crate. I will be on the pad.');
        giveBlackMarketRun(game);
        setChapter(game, 5);
      }
      if (ch === 6) {
        c.flags.wreckIds = Array.isArray(c.flags.wreckIds) ? c.flags.wreckIds : [];
        const wid = payload.id;
        if (wid && !c.flags.wreckIds.includes(wid)) {
          c.flags.wreckIds.push(wid);
          c.flags.ch5Wrecks = c.flags.wreckIds.length;
          syncStoryMissions(game);
          if (c.flags.ch5Wrecks >= 3) {
            announce(game, VOICES.dispatch, 'Three wrecks, same recording. Dock, open COMMS, pick who you work for.');
            setChapter(game, 7);
          } else if (game.hud) {
            game.hud.toast(`Wrecks ${c.flags.ch5Wrecks}/3`, 'good', 4, true);
          }
        }
      }
    }
    if (ch === 11 && (story === 'signal' || payload.signal) && (kind === 'planet' || kind === 'moon')) {
      c.flags.signal = true;
      game.hudCinematic = 6;
      announce(game, VOICES.dispatch, 'Surface reading is in. Dock a trade pad and open COMMS.');
      setChapter(game, 12, 'SOURCE FOUND');
    }
  }

  if (type === 'jump') {
    c.flags.shotsThisVisit = 0;
    const tag = payload.storyTag;
    if (tag === 'beacon' && ch === 4) {
      if (game.hud) game.hud.toast('This system. Tab wrecks, hold F on Beacon MX-0.', 'info', 8, true);
    }
    if (tag === 'market' && ch === 5 && game.hud) {
      game.hud.toast('Dock the marked station. The crate unloads when you dock.', 'info', 8, true);
    }
    if (tag === 'signal' && (ch === 11 || ch === 10) && game.hud) {
      game.hud.toast('Source world is in this system — scan it (F) or land on it', 'info', 8, true);
    }
    if (tag && tag !== 'home') c.flags.leftHome = true;
    if ((payload.danger || 0) >= 2) c.flags.visitedDanger = true;
    if (ch === 10 && tag === 'core') {
      c.flags.coreArrived = true;
      announce(game, VOICES.dispatch, 'Core system. The source world is here. Lock it, hold F, or land.');
      setChapter(game, 11);
    }
  }

  if (type === 'kill') {
    if (ch === 8) {
      c.flags.shotsThisVisit = (c.flags.shotsThisVisit || 0) + 1;
      c.killsInHunt++;
      syncStoryMissions(game);
      if (c.killsInHunt >= 2) {
        c.mercy = false;
        announce(game, VOICES.fed, 'Two hostiles down. Concord has the report.');
        setChapter(game, 9, 'HOSTILES DOWN');
      }
    }
  }

  if (type === 'choice') {
    if (ch === 7 && payload.allegiance) {
      c.allegiance = payload.allegiance;
      const line = payload.allegiance === 'fed'
        ? 'Writ is filed. If you have to shoot, shoot.'
        : payload.allegiance === 'syn'
          ? 'You work for Vhel now. Keep the crate’s coordinates off Concord channels.'
          : 'No flag. Cross a hot system without firing if you can.';
      announce(game, payload.allegiance === 'fed' ? VOICES.fed : payload.allegiance === 'syn' ? VOICES.syn : VOICES.ind, line);
      setChapter(game, 8);
    }
    if (ch === 12 && payload.ending) {
      finishCampaign(game, payload.ending);
    }
  }
}

function finishCampaign(game, ending) {
  const c = game.campaign;
  c.ending = ending;
  c.chapter = 12;
  if (ending === 'patron' && !c.allegiance) c.allegiance = 'ind';
  const sold = ending === 'patron' ? patronPitch(c.allegiance) : null;
  const titles = {
    lock: ['TRANSMITTER JAMMED', 'The signal is off. Neighbour galaxies open as charts at the observatory. Choir Void stays closed.'],
    open: ['COORDINATES PUBLISHED', 'Choir Void is a filament from Aetheria. Other galaxies are charts at the observatory.'],
  };
  if (sold) titles.patron = [sold.toastTitle, sold.toastBody];
  const t = titles[ending] || titles.open;
  if (!game.cinema?.play(`end-${ending}`)) game.bigToast(t[0], t[1], ending === 'open' ? 'good' : ending === 'lock' ? 'info' : 'money');
  announce(game, VOICES.dispatch, ending === 'open' ? 'Published. Choir Void is on U.' : ending === 'lock' ? 'Jammed. Job closed.' : sold.announce);
  const purse = ending === 'open' ? 80000 : ending === 'lock' ? 45000 : 120000;
  game.credits += purse;
  if (game.stats) game.stats.earned = (game.stats.earned || 0) + purse;
  refreshUnlocks(c);
  game.missions = (game.missions || []).filter((m) => !m.story);
  if (game.hud) {
    const ride = ending === 'open'
      ? 'Choir Void is a filament from Aetheria. Chart the other galaxies at the observatory. The Veil anchor is a separate desk.'
      : ending === 'patron'
        ? `${sold.toastBody} Neighbour charts are at the observatory. The Veil anchor is a separate desk.`
        : 'Transmitter jammed. Choir Void stays closed. Chart neighbour galaxies at the observatory. The Veil anchor is a separate desk.';
    game.hud.toast(ride, 'info', 12, true);
  }
  game.save();
  if (game.achievements) game.achievements.evaluate();
}

export function mapStoryHint(game, sys) {
  if (!game.campaign || !sys) return '';
  const step = nextStep(game);
  if (!step?.systemId || sys.id !== step.systemId) return '';
  if (sys.id === game.system?.id) return 'YOU ARE HERE';
  return 'NEXT · JUMP HERE';
}

export function mapBodyHint(game, data) {
  if (!game?.campaign || !data) return '';
  const ch = game.campaign.chapter;
  if (data.story === 'dive' && ch <= 2) return ch === 1 ? 'SCAN THIS' : 'CHART THIS';
  if (data.story === 'beacon' && ch === 4) return 'SABLE’S WRECK';
  if (data.story === 'signal' && (ch === 11 || ch === 12)) return 'THE SOURCE';
  if (data.distress && !data.distressPaid) return 'DISTRESS';
  return '';
}

function revealStoryDest(game) {
  const step = nextStep(game);
  const sys = (game.galaxy?.systems || []).find((s) => s.id === step.systemId);
  if (sys) sys.discovered = true;
}

export function galaxyLockReason(camp, galId, homeId = 'aetheria') {
  if (!galId || galId === homeId) return '';
  if (galaxyOpen(camp, galId, homeId)) return '';
  if (galId === 'choir' && camp?.ending === 'lock') return 'You jammed the transmitter. Choir Void stays closed.';
  if (galId === 'veil') return 'The Veil anchor is a different road. A Choir ending does not open it.';
  if (galId === 'choir' && camp?.ending === 'patron' && camp.allegiance !== 'syn') return patronPitch(camp.allegiance).lock;
  if (galId === 'choir' && !camp?.ending) {
    return 'Finish the job in Aetheria. Choir Void opens only if you publish the signal — or sell it to Vhel.';
  }
  return chartLockText(galId, homeId, camp?.charts, camp?.chapter || 1);
}

/** Home is open. Other sheet galaxies open when their chart is bought.
 *  Choir Void stays gated until an ending that opens the sky. The Veil is the anchor. */
export function galaxyOpen(camp, galId, homeId = 'aetheria') {
  if (!galId || galId === homeId) return true;
  if (galId === 'veil') return false;
  if (!camp) return false;
  if (galId === 'choir') {
    if (!camp.ending) return false;
    if (camp.ending === 'lock') return false;
    if (camp.ending === 'patron') return camp.allegiance === 'syn';
    return camp.ending === 'open';
  }
  return !!camp.charts?.[galId];
}

export function latestComm(camp, maxAgeMs = 9000) {
  const c = camp && camp.comms && camp.comms[0];
  if (!c) return null;
  if (maxAgeMs != null && Date.now() - (c.t || 0) > maxAgeMs) return null;
  return c;
}

export function shipLore(id) {
  return SHIP_DEFS[id]?.lore || '';
}
