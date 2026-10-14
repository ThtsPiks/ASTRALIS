// Live 3D reels. Skip anytime. HUD hides while rolling.

import { patronPitch } from './campaign.js?v=finale6';

export const REELS = {
  open: {
    id: 'open',
    music: 0.42,
    shots: [
      {
        dur: 6.4, cam: 'void', fadeIn: 0.2,
        card: { kicker: 'THE AETHERIA SIGNAL', title: 'SABLE MISSED CHECK-IN' },
        line: {
          who: 'HALCYON CONTROL',
          text: 'The navigation beacons across Aetheria went dark within minutes of each other. Commander Sable was on a routine survey of Vesper Reach when it happened. She has not checked in since.',
        },
      },
      {
        dur: 6.2, cam: 'limb', fadeIn: 0.25,
        line: {
          who: 'UNKNOWN TX',
          text: 'Beacon MX-0, repeating. These coordinates are not a destination. They are a warning. Keep clear of the inner world.',
        },
      },
      {
        dur: 7.2, cam: 'three',
        line: {
          who: 'SABLE · RECORDING',
          text: 'This is Sable, over Vesper Reach. The beacons did not fail. Something is using them. I left a sealed crate on MX-0. Do not open it. If I do not come back, take it to the market station and tell no one what you think is inside.',
        },
      },
      {
        dur: 6.4, cam: 'limb',
        line: {
          who: 'IONA VAY',
          text: 'Halcyon will not let a stranger near that system. They will let the pilot who holds Sable’s contract. That pilot is you. Find what she saw, and why her last call told every ship to stay away.',
        },
      },
      {
        dur: 5.2, cam: 'chase', fadeOut: 0.6,
        card: { kicker: 'CHAPTER 01', title: 'THE REPLACEMENT' },
        line: { who: 'HALCYON CONTROL', text: 'Vesper Reach is in front of you. If she left a trace, bring it home. If you hear her voice, do not follow it alone.' },
      },
    ],
  },

  ch2: {
    id: 'ch2',
    music: 0.32,
    shots: [
      {
        dur: 5.0, cam: 'limb', fadeIn: 0.4,
        card: { kicker: 'CHAPTER 02', title: 'THREE CHARTS' },
        line: {
          who: 'HALCYON CONTROL',
          text: 'The nav beacons did not fail together by accident. Concord needs three independent charts before anyone touches the network. Survey different worlds; a second pass over the same world tells us nothing.',
        },
      },
      {
        dur: 4.4, cam: 'chase', fadeOut: 0.5,
        line: {
          who: 'SABLE · RECORDING',
          text: 'Sable left the same instruction in every surviving copy: map the local system first. Finish the three charts, dock at Halcyon, and fit the ship. Do not take an intergalactic jump until we know what is calling.',
        },
      },
    ],
  },

  chSto: {
    id: 'chSto',
    music: 0.28,
    shots: [
      {
        dur: 5.2, cam: 'station', fadeIn: 0.4,
        card: { kicker: 'CHAPTER 03', title: 'FIT THE SHIP' },
        line: {
          who: 'HALCYON CONTROL',
          text: 'The next leg crosses a dead beacon corridor. Dock at Halcyon, press E, open SHIP UPGRADES, and buy any rank-1 part. Speed, acceleration, or cargo will do. I want the ship ready before we lose the safety of home.',
        },
      },
      {
        dur: 4.4, cam: 'chase', fadeOut: 0.5,
        line: {
          who: 'IONA VAY',
          text: 'An upgrade will not make the signal less strange. It may get us to Sable’s wreck before the people already tracking her contract. I have seen their transponder twice. They are not Concord.',
        },
      },
    ],
  },

  ch3: {
    id: 'ch3',
    music: 0.38,
    shots: [
      {
        dur: 5.2, cam: 'pull', fadeIn: 0.45,
        card: { kicker: 'CHAPTER 04', title: "SABLE'S WRECK" },
        line: {
          who: 'HALCYON CONTROL',
          text: 'Sable’s last clean log came from Beacon MX-0, one system over. Plot the gold marker with G and confirm the jump. Keep her warning in mind: the beacon may be bait, but the wreck is our only lead.',
        },
      },
      {
        dur: 5.0, cam: 'wreck', fadeOut: 0.5,
        line: {
          who: 'UNKNOWN TX',
          text: 'MX-0 payload intact. You came back. Good. The coordinates remain sealed until the crate leaves this system. Do not open it here. Do not let them convince you that the warning is the message.',
        },
      },
    ],
  },

  ch4: {
    id: 'ch4',
    music: 0.3,
    shots: [
      {
        dur: 5.4, cam: 'station', fadeIn: 0.4,
        card: { kicker: 'CHAPTER 05', title: 'THE CRATE' },
        line: {
          who: 'IONA VAY',
          text: 'Four tonnes of silence in a box. Concord says leave it sealed; Vhel has already named a price. Take the marked jump and dock at the market station. I will meet you on the pad, and we will decide who gets to ask questions.',
        },
      },
      {
        dur: 4.6, cam: 'three', fadeOut: 0.5,
        line: {
          who: 'VHEL DESK',
          text: 'The crate is expected. Bring it to the marked pad; docking will transfer it under seal. Do not open it in flight, and do not hand it to anyone claiming to be Sable. We will talk once it is off your ship.',
        },
      },
    ],
  },

  ch5: {
    id: 'ch5',
    music: 0.4,
    shots: [
      {
        dur: 5.2, cam: 'wreck', fadeIn: 0.45,
        card: { kicker: 'CHAPTER 06', title: 'MORE WRECKS' },
        line: {
          who: 'HALCYON CONTROL',
          text: 'The crate held a copy of Sable’s recording—and a gap cut clean through the middle. Other wrecks across Aetheria carry the missing fragments. Find three derelicts and scan them. We need the whole transmission before anyone can sell us a story.',
        },
      },
      {
        dur: 4.6, cam: 'void', fadeOut: 0.5,
        line: {
          who: 'HALCYON CONTROL',
          text: 'Use Tab until a wreck locks, then hold F to read its beacon. If this system is empty, use G and jump to another star in Aetheria. The fragments are scattered; the pattern is not.',
        },
      },
    ],
  },

  ch6: {
    id: 'ch6',
    music: 0.28,
    shots: [
      {
        dur: 5.6, cam: 'station', fadeIn: 0.4,
        card: { kicker: 'CHAPTER 07', title: 'PICK A SIDE' },
        line: {
          who: 'HALCYON CONTROL',
          text: 'Three groups have read the fragments, and each heard a different promise. Concord wants the transmitter silenced. Vhel wants the coordinates under contract. The Independents want no one to own the sky. Dock, open COMMS, and choose who gets your trust.',
        },
      },
      {
        dur: 4.2, cam: 'chase', fadeOut: 0.5,
        line: {
          who: 'IONA VAY',
          text: 'Choose carefully. The recording will not care whose flag is on your hull. The crews following us will. I can keep the channel open, but I cannot make this choice for you.',
        },
      },
    ],
  },

  ch7: {
    id: 'ch7',
    music: 0.36,
    shots: [
      {
        dur: 5.4, cam: 'three', fadeIn: 0.4,
        card: { kicker: 'CHAPTER 08', title: 'FIGHT OR PASS' },
        line: {
          who: 'CONCORD OFFICE',
          text: 'Your choice needs to mean something once the pressure starts. Destroy two hostiles, or cross a danger-3 system and dock without firing. Concord will call the first proof. The Independents will call the second. You know which one you chose.',
        },
      },
      {
        dur: 4.4, cam: 'chase', fadeOut: 0.5,
        line: {
          who: 'FREE COLONY NET',
          text: 'If you can cross their territory without firing, do it. Restraint is not the same as fear. We will remember what you chose when nobody was watching.',
        },
      },
    ],
  },

  chOre: {
    id: 'chOre',
    music: 0.34,
    shots: [
      {
        dur: 5.2, cam: 'station', fadeIn: 0.4,
        card: { kicker: 'CHAPTER 09', title: 'EIGHT TONNES' },
        line: {
          who: 'HALCYON CONTROL',
          text: 'The route inward is unstable, and the core jump will drain the ship. Cut ore from a belt, then dock and sell or smelt eight tonnes. Once the hold is clear and the drive is paid for, we can send you toward the source.',
        },
      },
      {
        dur: 4.4, cam: 'void', fadeOut: 0.5,
        line: {
          who: 'IONA VAY',
          text: 'Foundries still pay for honest metal. Eight tonnes gets you the fuel and the clearance. Do not linger in the belt with a full hold; the traffic out there has been listening to our comms.',
        },
      },
    ],
  },

  ch8: {
    id: 'ch8',
    music: 0.44,
    shots: [
      {
        dur: 5.6, cam: 'pull', fadeIn: 0.5,
        card: { kicker: 'CHAPTER 10', title: 'THE CORE' },
        line: {
          who: 'HALCYON CONTROL',
          text: 'We have the route now. The coordinates point inward, to the core of this galaxy—not out through U. Press G, select the gold star, and confirm the jump. Whatever Sable found, it has been waiting longer than any of us.',
        },
      },
      {
        dur: 4.8, cam: 'limb', fadeOut: 0.55,
        line: {
          who: 'UNKNOWN TX',
          text: 'Source active. Inner world confirmed. No fleet, no station, no distress call—only a transmitter still broadcasting after every beacon around it went dark. Approach when you are ready.',
        },
      },
    ],
  },

  ch9: {
    id: 'ch9',
    music: 0.62,
    shots: [
      {
        dur: 10.5, cam: 'reveal', fadeIn: 0.9, fadeOut: 0.45,
        card: { kicker: 'THE LAST WORLD', title: 'THE SOURCE' },
        line: {
          who: 'HALCYON CONTROL',
          text: 'There it is. One world, still transmitting. No fleet on the scope. Every copy we pulled from the wrecks stops in this orbit. Look at it. The reading is the next thing you do, not this picture.',
        },
      },
      {
        dur: 8.5, cam: 'reveal', fadeIn: 0.25, fadeOut: 0.4,
        line: {
          who: 'UNKNOWN TX',
          text: 'Keep clear of the inner world. I said keep clear. The coordinates are not a destination.',
        },
      },
      {
        dur: 7.2, cam: 'limb', fadeOut: 0.75,
        line: {
          who: 'IONA VAY',
          text: 'That is the old warning, played again. It still will not say what is on the surface. Lock the world and hold F, or land. Do not decide from a loop.',
        },
      },
    ],
  },

  'end-lock': {
    id: 'end-lock',
    music: 0.22,
    shots: [
      {
        dur: 8.0, cam: 'reveal', fadeIn: 0.8, fadeOut: 0.4,
        card: { kicker: 'ENDING', title: 'TRANSMITTER JAMMED' },
        line: {
          who: 'HALCYON CONTROL',
          text: 'One last look before the transmitter goes dark. The light stays. The route does not.',
        },
      },
      {
        dur: 6.2, cam: 'limb', fadeIn: 0.3,
        line: {
          who: 'HALCYON CONTROL',
          text: 'The transmitter is quiet. The hidden route stays hidden, and the beacons remain dark. There will be no rush to the source, no claim to defend. Neighbour charts are still bought at the observatory. Choir Void stays closed. You brought the signal to an end, but not the questions it left behind.',
        },
      },
      {
        dur: 5.0, cam: 'chase', fadeOut: 0.8,
        line: {
          who: 'SABLE · RECORDING',
          text: 'I wanted to hear the whole thing. I still do. But some doors only open one way, and I have seen what happens when people call curiosity a right. Leave it buried. Let the silence be ours this time.',
        },
      },
    ],
  },

  'end-open': {
    id: 'end-open',
    music: 0.55,
    shots: [
      {
        dur: 9.0, cam: 'reveal', fadeIn: 0.85, fadeOut: 0.4,
        card: { kicker: 'ENDING', title: 'COORDINATES PUBLISHED' },
        line: {
          who: 'HALCYON CONTROL',
          text: 'The job ends on the door in Aetheria, not on the world the coordinates name. This is the transmitter. Choir Void is the filament you just put on the map. Every ship that follows will be looking for that line.',
        },
      },
      {
        dur: 6.4, cam: 'limb', fadeIn: 0.3,
        line: {
          who: 'HALCYON CONTROL',
          text: 'The coordinates are on the open net. No faction can call the route private now, and every ship can decide whether to follow it. Choir Void is marked on the U map. Press U if you want to see what the signal was hiding.',
        },
      },
      {
        dur: 5.6, cam: 'pull', fadeOut: 0.9,
        line: {
          who: 'UNKNOWN TX',
          text: 'Coordinates received. Route is no longer restricted. The old transmission has nothing left to repeat.',
        },
      },
      {
        dur: 5.2, cam: 'pull', fadeOut: 0.9,
        line: {
          who: 'HALCYON CONTROL',
          text: 'Contract closed. G still takes you between stars in Aetheria, and the garage is still open. You gave the route to everyone; what happens when they arrive is beyond this contract. The rest is yours.',
        },
      },
    ],
  },
};

function creditRoll(afterLines) {
  return {
    dur: 28, cam: 'reveal', fadeIn: 0.8, fadeOut: 1.4,
    credits: [
      { title: 'ASTRALIS' },
      { role: 'THE AETHERIA SIGNAL' },
      { role: 'DISPATCH', lines: ['Halcyon Control', 'Iona Vay'] },
      { role: 'THE CONTRACT', lines: ['Commander Sable'] },
      { role: 'THE HULL', lines: ['Aurora'] },
      { role: 'THE SKY', lines: ['Twelve charted galaxies', 'One source world'] },
      { role: 'AFTER THE JOB', lines: afterLines },
      { role: 'END OF CONTRACT', end: true },
    ],
  };
}

REELS['end-lock'].shots.push(creditRoll(['Choir Void stays closed', 'The Veil is the anchor']));
REELS['end-open'].shots.push(creditRoll(['Choir Void is on the filament', 'The Veil is the anchor']));

function allegianceOf(game) {
  const a = game?.campaign?.allegiance;
  return a === 'syn' || a === 'fed' ? a : 'ind';
}

function ch10Reel(allegiance) {
  const sell = patronPitch(allegiance);
  return {
    id: 'ch10',
    music: 0.34,
    shots: [
      {
        dur: 8.4, cam: 'reveal', fadeIn: 0.55, fadeOut: 0.35,
        card: { kicker: 'CHAPTER 12', title: 'YOUR CALL' },
        line: {
          who: 'UNKNOWN TX',
          text: 'Source confirmed. The payload is coordinates, not a voice. The voice was cut together from old beacon traffic. There is no one speaking. This world is the door in Aetheria. The route is past it.',
        },
      },
      {
        dur: 7.4, cam: 'limb', fadeIn: 0.25, fadeOut: 0.35,
        line: {
          who: 'SABLE · RECORDING',
          text: 'I reached the source. It is a transmitter, not a ghost. Jam it, hand the file to the desk you already trusted, or publish it. Do not let this place disappear into another sealed crate.',
        },
      },
      {
        dur: 7.2, cam: 'station', fadeOut: 0.6,
        line: {
          who: 'HALCYON CONTROL',
          text: `${sell.call} Dock the trade exchange, press E, and open COMMS.`,
        },
      },
    ],
  };
}

function patronReel(allegiance) {
  const sell = patronPitch(allegiance);
  return {
    id: 'end-patron',
    music: 0.3,
    shots: [
      {
        dur: 8.0, cam: 'reveal', fadeIn: 0.8, fadeOut: 0.4,
        card: { kicker: 'ENDING', title: sell.filmCard },
        line: { who: 'HALCYON CONTROL', text: sell.filmLook },
      },
      {
        dur: 7.2, cam: 'limb', fadeIn: 0.3,
        line: { who: sell.filmDeskWho, text: sell.filmDesk },
      },
      {
        dur: 6.2, cam: 'three', fadeOut: 0.75,
        line: { who: 'IONA VAY', text: sell.filmIona },
      },
      creditRoll(sell.credits),
    ],
  };
}

export function reelById(id, game) {
  if (id === 'ch10') return ch10Reel(allegianceOf(game));
  if (id === 'end-patron') return patronReel(allegianceOf(game));
  return REELS[id] || null;
}
