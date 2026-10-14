// Per-class atmosphere handling. Dossier gives g / ρ / H; this is how the hull feels it.
// Tuned as a lander sim: steady pull, mild weather — not carnival forces.
import { clamp } from '../core/utils.js';

const FEEL = {
  terra: {
    label: 'THICK AIR',
    toast: 'Lander mode. W/S set forward speed · A/D turn · Space/Ctrl controls altitude.',
    gPull: 9.6, drag: 0.42, rhoMul: 1, maxSpeed: 360, lift: 1.05,
    bounce: 0.08, slip: 0.08, wind: 2.2, windHz: 0.22, assist: 1,
    turnMul: 1.08, accelMul: 1, heatDmg: 0, acidDmg: 0, crushDmg: 0,
    buoyancy: 0, mag: 0, pulse: 0, motes: 1.6, mote: '#9fd8ff',
    gearAuto: true, entryDur: 2.0, hud: '1 g · AIR', hoverMul: 1.38,
  },
  ocean: {
    label: 'WET COLUMN',
    toast: 'Heavy wet air. Watch drag over the spray — the deck will stall you.',
    gPull: 9.2, drag: 0.72, rhoMul: 1.25, maxSpeed: 300, lift: 1.2,
    bounce: 0.06, slip: 0.14, wind: 3.5, windHz: 0.2, assist: 0.95,
    turnMul: 0.98, accelMul: 0.9, heatDmg: 0, acidDmg: 0, crushDmg: 0,
    buoyancy: 14, mag: 0, pulse: 0, motes: 2.4, mote: '#8ad4ff',
    gearAuto: true, entryDur: 2.2, hud: 'WET · DRAG', hoverMul: 1.36,
  },
  desert: {
    label: 'THIN DUST',
    toast: 'Thin air, thermals. Mesas drop off — watch the lee side.',
    gPull: 8.4, drag: 0.26, rhoMul: 0.55, maxSpeed: 420, lift: 0.55,
    bounce: 0.1, slip: 0.12, wind: 4.5, windHz: 0.35, assist: 0.9,
    turnMul: 1.1, accelMul: 1.06, heatDmg: 0, acidDmg: 0, crushDmg: 0,
    buoyancy: 0, mag: 0, pulse: 0, motes: 4, mote: '#eec47f',
    gearAuto: true, entryDur: 1.8, hud: 'DUST · THERMALS', hoverMul: 1.34,
  },
  ice: {
    label: 'GLAZE',
    toast: 'Low gravity over ice. Use Space/Ctrl to change altitude; the deck has little grip.',
    gPull: 5.8, drag: 0.16, rhoMul: 0.4, maxSpeed: 380, lift: 0.35,
    bounce: 0.1, slip: 0.22, wind: 2.8, windHz: 0.18, assist: 0.78,
    turnMul: 0.96, accelMul: 1, heatDmg: 0, acidDmg: 0, crushDmg: 0,
    buoyancy: 0, mag: 0, pulse: 0, motes: 3, mote: '#e8f4ff',
    gearAuto: true, entryDur: 1.6, hud: 'ICE · LOW G', hoverMul: 1.3,
  },
  lava: {
    label: 'HEAT WELL',
    toast: 'Heavy world. Hover high — the caldera cooks hull, not the boost.',
    gPull: 12.5, drag: 0.34, rhoMul: 0.7, maxSpeed: 320, lift: 0.42,
    bounce: 0.08, slip: 0.1, wind: 3.2, windHz: 0.4, assist: 0.9,
    turnMul: 0.94, accelMul: 0.92, heatDmg: 4.2, acidDmg: 0, crushDmg: 0,
    buoyancy: 0, mag: 0, pulse: 0, motes: 4, mote: '#ff6a2a',
    gearAuto: false, entryDur: 2.6, hud: 'HEAT · HEAVY', hoverMul: 1.45,
    heatAlt: 90,
  },
  toxic: {
    label: 'SOUP',
    toast: 'Acid column. Hover slow. It eats paint if you linger in the pools.',
    gPull: 9.0, drag: 0.85, rhoMul: 1.45, maxSpeed: 250, lift: 1.05,
    bounce: 0.08, slip: 0.12, wind: 3.8, windHz: 0.28, assist: 0.84,
    turnMul: 0.88, accelMul: 0.8, heatDmg: 0, acidDmg: 0.55, crushDmg: 0,
    buoyancy: 0, mag: 0, pulse: 0, motes: 4.5, mote: '#b6e04a',
    gearAuto: true, entryDur: 2.4, hud: 'TOXIC SOUP', hoverMul: 1.36,
  },
  barren: {
    label: 'VACUUM',
    toast: 'Almost no air. Ease off speed before the ridge; the deck has no grip.',
    gPull: 4.6, drag: 0.04, rhoMul: 0.02, maxSpeed: 480, lift: 0,
    bounce: 0.14, slip: 0.18, wind: 0, windHz: 0.1, assist: 0.72,
    turnMul: 1.1, accelMul: 1.08, heatDmg: 0, acidDmg: 0, crushDmg: 0,
    buoyancy: 0, mag: 0, pulse: 0, motes: 0.3, mote: '#b3a99b',
    gearAuto: false, entryDur: 1.1, hud: '0.2 g · VACUUM', hoverMul: 1.24,
  },
  rocky: {
    label: 'THIN ROCK',
    toast: 'Canyons and rims. Air is thin — keep enough clearance over the ridgeline.',
    gPull: 7.8, drag: 0.2, rhoMul: 0.35, maxSpeed: 400, lift: 0.28,
    bounce: 0.1, slip: 0.12, wind: 2.4, windHz: 0.24, assist: 0.84,
    turnMul: 1.06, accelMul: 1.04, heatDmg: 0, acidDmg: 0, crushDmg: 0,
    buoyancy: 0, mag: 0, pulse: 0, motes: 2.2, mote: '#c2b39a',
    gearAuto: true, entryDur: 1.6, hud: 'THIN ROCK', hoverMul: 1.34,
  },
  carbon: {
    label: 'MAG WELL',
    toast: 'Dense lattice. Mild magnetic drift — hold the heading.',
    gPull: 11.2, drag: 0.36, rhoMul: 0.5, maxSpeed: 300, lift: 0.22,
    bounce: 0.09, slip: 0.1, wind: 1.6, windHz: 0.45, assist: 0.88,
    turnMul: 0.92, accelMul: 0.86, heatDmg: 0, acidDmg: 0, crushDmg: 0,
    buoyancy: 0, mag: 2.4, pulse: 0, motes: 2, mote: '#7a6cff',
    gearAuto: true, entryDur: 2.0, hud: 'CARBON · MAG', hoverMul: 1.42,
  },
  gas: {
    label: 'BAND STORM',
    toast: 'No deck. Ride the bands and stay above the crush layer.',
    gPull: 11.5, drag: 0.95, rhoMul: 1.9, maxSpeed: 280, lift: 0.7,
    bounce: 0, slip: 0.16, wind: 8, windHz: 0.45, assist: 0.74,
    turnMul: 0.86, accelMul: 0.78, heatDmg: 0, acidDmg: 0, crushDmg: 16,
    buoyancy: 6, mag: 0, pulse: 0, motes: 3.2, mote: '#efc896',
    gearAuto: false, entryDur: 2.8, hud: 'GAS · CRUSH', hoverMul: 1.36,
    crushY: 22,
  },
  icegiant: {
    label: 'COLD BANDS',
    toast: 'Methane wind. Stay above the blue bands; the deeper layers crush the hull.',
    gPull: 10.4, drag: 0.82, rhoMul: 1.6, maxSpeed: 290, lift: 0.8,
    bounce: 0, slip: 0.18, wind: 6.5, windHz: 0.38, assist: 0.76,
    turnMul: 0.88, accelMul: 0.8, heatDmg: 0, acidDmg: 0, crushDmg: 12,
    buoyancy: 5, mag: 0, pulse: 0, motes: 2.8, mote: '#7fe0ff',
    gearAuto: false, entryDur: 2.6, hud: 'ICE GIANT · WIND', hoverMul: 1.34,
    crushY: 18,
  },
  // Pink / violet anomaly worlds — look weird, fly normal. Old pulse/acid made engine warble + hull spam.
  exotic: {
    label: 'VIOLET HAZE',
    toast: 'Strange light, steady pull. Fly it like any other lander.',
    gPull: 8.8, drag: 0.48, rhoMul: 1.05, maxSpeed: 340, lift: 0.55,
    bounce: 0.09, slip: 0.12, wind: 2.6, windHz: 0.3, assist: 0.88,
    turnMul: 1.02, accelMul: 0.96, heatDmg: 0, acidDmg: 0, crushDmg: 0,
    buoyancy: 0, mag: 0, pulse: 0.85, motes: 5.5, mote: '#c04cf0',
    gearAuto: true, entryDur: 2.0, hud: 'ANOMALY · HAZE', hoverMul: 1.36,
  },
  rust: {
    label: 'IRON DUST',
    toast: 'Red plate and grit. Thin air — keep clearance over the ridges.',
    gPull: 8.6, drag: 0.22, rhoMul: 0.4, maxSpeed: 390, lift: 0.3,
    bounce: 0.1, slip: 0.14, wind: 3.2, windHz: 0.3, assist: 0.86,
    turnMul: 1.04, accelMul: 1.02, heatDmg: 0.4, acidDmg: 0, crushDmg: 0,
    buoyancy: 0, mag: 0, pulse: 0, motes: 3.2, mote: '#c45a32',
    gearAuto: true, entryDur: 1.7, hud: 'IRON · DUST', hoverMul: 1.34,
  },
  ash: {
    label: 'ASH COLUMN',
    toast: 'Cooling crust. Hot vents below — hover above the ash plumes.',
    gPull: 9.4, drag: 0.3, rhoMul: 0.55, maxSpeed: 340, lift: 0.38,
    bounce: 0.09, slip: 0.12, wind: 3.6, windHz: 0.36, assist: 0.88,
    turnMul: 0.96, accelMul: 0.94, heatDmg: 2.2, acidDmg: 0, crushDmg: 0,
    buoyancy: 0, mag: 0, pulse: 0, motes: 3.8, mote: '#ff7a3a',
    gearAuto: false, entryDur: 2.2, hud: 'ASH · HEAT', hoverMul: 1.4,
    heatAlt: 70,
  },
  marsh: {
    label: 'WET MARSH',
    toast: 'Sour wet air. Drag is high — keep speed modest over the flats.',
    gPull: 8.8, drag: 0.78, rhoMul: 1.3, maxSpeed: 280, lift: 1.1,
    bounce: 0.07, slip: 0.16, wind: 3.0, windHz: 0.24, assist: 0.9,
    turnMul: 0.94, accelMul: 0.88, heatDmg: 0, acidDmg: 0.15, crushDmg: 0,
    buoyancy: 8, mag: 0, pulse: 0, motes: 2.6, mote: '#b7e08a',
    gearAuto: true, entryDur: 2.2, hud: 'MARSH · WET', hoverMul: 1.36,
  },
  salt: {
    label: 'SALT FLAT',
    toast: 'Bright crust, thin air. Glare and dust — easy deck once you slow.',
    gPull: 6.2, drag: 0.12, rhoMul: 0.25, maxSpeed: 410, lift: 0.18,
    bounce: 0.12, slip: 0.2, wind: 2.0, windHz: 0.2, assist: 0.8,
    turnMul: 1.06, accelMul: 1.04, heatDmg: 0, acidDmg: 0, crushDmg: 0,
    buoyancy: 0, mag: 0, pulse: 0, motes: 1.8, mote: '#f4e6dc',
    gearAuto: true, entryDur: 1.4, hud: 'SALT · THIN', hoverMul: 1.3,
  },
};

export function flightFeel(type, physics = null) {
  const base = FEEL[type] || FEEL.rocky;
  const feel = { ...base, type: type || 'rocky' };
  const g = physics?.g;
  if (typeof g === 'number' && g > 0) {
    // Map dossier g into a calm lander band (~Earth 1g ≈ 9.5 pull).
    feel.gPull = clamp(g * 9.5, 4.5, 16);
    feel.hud = `${g.toFixed(2)} g · ${base.label}`;
  }
  if (typeof physics?.rho0 === 'number') {
    feel.rhoMul = clamp((physics.rho0 / 0.8) * (base.rhoMul || 1), 0.02, 2.4);
  }
  return feel;
}

export function allFeelTypes() {
  return Object.keys(FEEL);
}
