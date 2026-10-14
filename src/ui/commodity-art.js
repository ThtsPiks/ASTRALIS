// Small, self-contained commodity illustrations for the station market.
// Kept as SVG so the cargo silhouettes stay sharp in the desktop build.
const art = {
  minerals: ['#d5b78e', '#745747', 'M16 69 31 29 58 17 83 36 71 79 42 87Z', 'M31 29 52 54 42 87M58 17 52 54 83 36M16 69 52 54 71 79'],
  ice_ore: ['#b9f1ff', '#347ba1', 'M17 75 29 30 51 14 78 33 85 73 54 89Z', 'M29 30 55 56 54 89M51 14 55 56 78 33M17 75 55 56 85 73'],
  rare_ore: ['#f1c9fa', '#8448aa', 'M15 73 28 36 51 18 75 31 87 73 51 91Z', 'M28 36 52 51 51 91M51 18 52 51 75 31M15 73 52 51 87 73'],
  metals: ['#cad9df', '#596f7c', 'M16 65 32 31 73 31 87 65 72 82 30 82Z', 'M16 65 87 65M32 31 40 65 30 82M73 31 63 65 72 82'],
  fuel: ['#b6f8e1', '#276d6d', 'M37 20 67 20 75 34 75 76 66 85 33 85 25 76 25 34Z', 'M25 41 75 41M37 20 33 41M67 20 66 41M45 52 55 52 49 67 58 67'],
  water: ['#b3e9ff', '#287bb2', 'M51 13 C35 38 25 52 25 65 A26 26 0 0 0 77 65 C77 52 66 36 51 13Z', 'M34 66 C36 75 42 78 50 79'],
  food: ['#e5d196', '#77723b', 'M20 30 77 30 83 79 18 79Z', 'M20 41 80 41M31 30 31 79M68 30 68 79M42 50 58 50 58 65 42 65Z'],
  medicine: ['#f5d4d8', '#a44c5b', 'M30 21 69 21 78 34 78 80 22 80 22 34Z', 'M22 41 78 41M44 49 56 49 56 57 64 57 64 68 56 68 56 75 44 75 44 68 36 68 36 57 44 57Z'],
  tech: ['#c6dcff', '#4667b6', 'M22 25 78 25 78 79 22 79Z', 'M33 36 67 36 67 67 33 67ZM13 37 22 37M13 52 22 52M13 67 22 67M78 37 87 37M78 52 87 52M78 67 87 67'],
  luxuries: ['#ffe0b2', '#ab7644', 'M50 14 78 38 67 77 50 89 33 77 22 38Z', 'M22 38 78 38M33 77 50 38 67 77M50 14 50 38'],
  data: ['#b0dffc', '#4d86b4', 'M25 19 67 19 78 30 78 82 25 82Z', 'M67 19 67 31 78 30M35 45 67 45M35 56 64 56M35 67 56 67'],
  slaves: ['#edb7a0', '#984d42', 'M27 25 74 25 74 78 27 78Z', 'M27 41 74 41M38 25 38 78M62 25 62 78M27 63 74 63'],
  narcotics: ['#dda6e8', '#754b87', 'M28 28 72 28 77 76 23 76Z', 'M28 43 72 43M44 52 56 52M50 47 50 67M40 76 40 83M60 76 60 83'],
  weapons: ['#e1bdac', '#86564c', 'M13 47 63 47 75 58 88 58 88 71 68 71 60 80 35 80 35 67 13 67Z', 'M26 47 26 67M43 47 43 80M66 54 75 58'],
};

export function commodityArt(id) {
  const [light, dark, shape, facets] = art[id] || art.minerals;
  const mark = `cargo-${id}`;
  return `<svg class="commodity-art" viewBox="0 0 100 100" role="img" aria-label="${id.replaceAll('_', ' ')} illustration">
    <defs><linearGradient id="${mark}" x1=".1" x2=".9" y1=".1" y2="1"><stop stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs>
    <circle cx="50" cy="54" r="42" fill="${light}" opacity=".065"/>
    <path d="${shape}" fill="url(#${mark})" stroke="${light}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="${facets}" fill="none" stroke="${dark}" stroke-width="2" stroke-linejoin="round" opacity=".68"/>
    <path d="M24 83 12 83M76 83 88 83" stroke="${light}" opacity=".5"/>
  </svg>`;
}
