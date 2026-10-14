// One service definition drives generation, maps, navigation and purchases.
const BASE = { refuel: true, repair: true, missions: true };
export const STATION_PROFILES = {
  hub_trade: { label: 'Trade Exchange', code: '01', color: '#61e0bb', home: 'market', title: 'Cargo exchange', description: 'Fuel, food, water and luxuries. This is the only port that buys a haul and files contracts.', tabs: [['market', 'CARGO MARKET'], ['missions', 'DELIVERY CONTRACTS'], ['services', 'FUEL & REPAIRS'], ['comms', 'STORY & RADIO'], ['directory', 'WHERE TO GO NEXT']], services: { market: true } },
  hub_shipyard: { label: 'Shipworks', code: '02', color: '#acb3ff', home: 'upgrades', title: 'Build your ship', description: 'Engines, hold, hull paint, and fitted modules. No cargo market.', tabs: [['upgrades', 'SHIP UPGRADES'], ['shipyard', 'HULL & PAINT'], ['workshop', 'FIT MODULES']], services: { upgrades: true, shipyard: true } },
  hub_arsenal: { label: 'Arsenal', code: '03', color: '#ff927d', home: 'arsenal', title: 'Prepare for contact', description: 'Missiles and countermeasures only.', tabs: [['arsenal', 'MISSILES & EQUIPMENT']], services: { ordnance: true } },
  hub_refinery: { label: 'Refinery', code: '04', color: '#ffb067', home: 'refine', title: 'Turn ore into cargo', description: 'Minerals, ice, metals and rare earths. Smelt here. Nothing else is on the board.', tabs: [['refine', 'SMELT THE HAUL'], ['market', 'ORE FOR SALE']], services: { refinery: true, market: true } },
  hub_survey: { label: 'Research Array', code: '05', color: '#70cfff', home: 'access', title: 'Observatory', description: 'World licences, galaxy charts, survey data and technology. Not a mine.', tabs: [['access', 'WORLD LICENCES'], ['survey', 'STAR CHARTS'], ['market', 'TECHNOLOGY'], ['workshop', 'EXPEDITION']], services: { survey: true, market: true } },
  orbital: { label: 'Service Port', code: '06', color: '#ffd078', home: 'services', title: 'Restock and recover', description: 'A small pad. Fuel, food and water, plus the radio. Specialists are in other systems.', tabs: [['services', 'FUEL & REPAIRS'], ['comms', 'STORY & RADIO'], ['directory', 'FIND A SPECIALIST']], services: {} },
};

export function stationProfile(station) {
  const kind = typeof station === 'string' ? station : station?.kind;
  if (kind === 'shipyard') return STATION_PROFILES.hub_shipyard;
  if (kind === 'refinery') return STATION_PROFILES.hub_refinery;
  return STATION_PROFILES[kind] || STATION_PROFILES.orbital;
}

export function stationServices(station) {
  return { ...BASE, ...stationProfile(station).services };
}

export function stationTabs(station) {
  return stationProfile(station).tabs.slice();
}
