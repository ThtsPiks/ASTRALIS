// Interaction-only briefing. No flight stick, no camera. JPG / live HUD stills.

export const BRIEFING = [
  {
    key: 'T',
    title: 'LOCK',
    img: 'guide/key-t.jpg',
    see: 'Gold strip at the bottom: TARGET, the name, the range. Empty gold = nothing locked. Scan, jump and dock all need this.',
    do: 'Press T. The marker points at a planet or moon. Press T again to move to the next world. Tab only cycles stations.',
  },
  {
    key: 'F',
    title: 'SCAN / MINE',
    img: 'guide/key-f.jpg',
    see: 'One key, three jobs. Hold F on a world: lidar ping first (free), then deep survey (costs a scan kit — first deep on the contract world is free). On a belt rock: first hold grades the ore, keep holding to cut into cargo.',
    do: 'Lock first (T). HOLD F — do not tap. Deep survey on new worlds may need Y to prepare an expedition and a kit from the observatory EXPEDITION tab.',
  },
  {
    key: 'Y',
    title: 'EXPEDITION',
    img: 'guide/key-g.jpg',
    see: 'Before a deep survey on most worlds, Y opens the expedition card — kits, filters, and fuel check. Empty tank in open space: Y calls rescue (adds debt).',
    do: 'Lock a world (T). Press Y to prepare, or hold F after ping — the HUD walks you through arming. Orbital ping never spends a kit.',
  },
  {
    key: 'E',
    title: 'DOCK',
    img: 'guide/key-e.jpg',
    see: 'Green PRESS E TO DOCK when you are close to the spinning ring. After E the pad computer opens — refuel in FUEL & REPAIRS if the tank is low.',
    do: 'Fly to Halcyon (the ring). Slow down. When the green prompt shows, press E. O is optional — it only aims you at the pad.',
  },
  {
    key: 'PAD',
    title: 'THE PAD COMPUTER',
    img: 'guide/market.jpg',
    see: 'Tabs: COMMS, MARKET, CONTRACTS, SHIPYARD. Green price = cheap here. Red = expensive. Ration / plate runs sit under CONTRACTS.',
    do: 'Click MARKET to buy cheap and sell high. CONTRACTS for the payday. UNDOCK when you are done.',
  },
  {
    key: 'M',
    title: 'THIS STAR',
    img: 'guide/key-m.jpg',
    see: 'Orbital chart: planets, pads, wrecks around you right now. Click a body to lock it.',
    do: 'Press M. Click what you want. Esc closes the chart — that is not pause.',
  },
  {
    key: 'G',
    title: 'THIS GALAXY',
    img: 'guide/key-g.jpg',
    see: 'Star chart. After you click a star, yellow CONFIRM JUMP sits at the bottom. Fuel comes off the left bar when you confirm.',
    do: 'Press G. Click a star. Press CONFIRM JUMP (or Enter). Do not skip the confirm.',
  },
  {
    key: 'U',
    title: 'OTHER GALAXIES',
    img: 'guide/key-u.jpg',
    see: 'Galaxies on pink filaments. After you click a neighbour: yellow CONFIRM TRANSIT. You arrive in their outer halo, not the core.',
    do: 'Press U in open space (not in atmosphere). Click a linked galaxy. Confirm. Skip this until the story asks.',
  },
  {
    key: 'L',
    title: 'LAND',
    img: 'guide/key-l.jpg',
    see: 'The view becomes ground and sky. ALT on the HUD. W/S set speed, A/D turn, and SPACE/CTRL raise or lower altitude.',
    do: 'Fly into the clouds. Mouse turns along the horizon. Nose up and throttle to leave. L drops the gear. Hold F over a site to dump survey data.',
  },
];

export function briefingSlide(i) {
  const n = ((i % BRIEFING.length) + BRIEFING.length) % BRIEFING.length;
  return { i: n, of: BRIEFING.length, ...BRIEFING[n] };
}

export function briefingNotesHtml(s) {
  return `
    <div class="br-see"><b>ON THE SCREEN</b><p>${s.see}</p></div>
    <div class="br-do"><b>PRESS</b><p>${s.do}</p></div>`;
}
