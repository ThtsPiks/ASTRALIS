// Interactive training range — one key, one job, stays on screen until done.

export const TUTORIAL_STEPS = [
  {
    id: 'fly',
    title: 'SPEED UP',
    hud: 'HOLD W',
    how: 'Keep W down until the bar fills. Mouse turns. A still mouse flies straight.',
  },
  {
    id: 'lock',
    title: 'LOCK',
    hud: 'PRESS T',
    how: 'Press T. The marker turns to the next planet or moon. Press T again for another world. Tab is only for stations.',
  },
  {
    id: 'ping',
    title: 'SCAN',
    hud: 'HOLD F',
    how: 'Do not tap — keep F down until the ping finishes. Same key mines rocks later; here it scans.',
  },
  {
    id: 'chart',
    title: 'MAP',
    hud: 'PRESS G',
    how: 'G opens the galaxy map. Esc closes it. That is the whole step.',
  },
  {
    id: 'dock',
    title: 'DOCK',
    hud: 'PRESS E',
    how: 'The ring in front of you is the station. Press E to go inside.',
  },
];

export function makeTutorial() {
  return { i: 0, flags: {}, done: false, fHold: 0 };
}

export function tutorialNav(tut, game) {
  if (!tut || tut.done) return null;
  const c = coachTutorial(tut, game);
  const step = TUTORIAL_STEPS[tut.i] || TUTORIAL_STEPS[0];
  return { title: c.stepLine, hud: c.do, how: step.how || c.wait, tutorial: true };
}

export function noteTutorial(tut, ev) {
  if (!tut || tut.done) return tut;
  if (ev === 'lock') tut.flags.locked = true;
  if (ev === 'ping' || ev === 'scan') tut.flags.pinged = true;
  if (ev === 'map') tut.flags.chart = true;
  if (ev === 'dock') tut.flags.docked = true;
  return tut;
}

export function stepComplete(tut, game) {
  if (!tut || tut.done || !game?.ship) return false;
  const id = TUTORIAL_STEPS[tut.i]?.id;
  if (id === 'fly') return game.ship.speed > 80;
  if (id === 'lock') return !!tut.flags.locked;
  if (id === 'ping') return !!tut.flags.pinged || (tut.fHold || 0) >= 1.15;
  if (id === 'chart') return !!tut.flags.chart && game.maps?.mode !== 'galaxy' && game.maps?.mode !== 'universe';
  if (id === 'dock') return !!tut.flags.docked;
  return false;
}

export function advanceTutorial(tut, game) {
  if (!tut || tut.done) return { tut, event: null };
  if (!stepComplete(tut, game)) return { tut, event: null };
  tut.i += 1;
  tut.fHold = 0;
  if (tut.i >= TUTORIAL_STEPS.length) {
    tut.done = true;
    tut.i = TUTORIAL_STEPS.length - 1;
    return { tut, event: 'complete' };
  }
  return { tut, event: 'next' };
}

/** Live coach card — one verb, one key, a bar. */
export function coachTutorial(tut, game) {
  const i = tut && !tut.done ? tut.i : 0;
  const step = TUTORIAL_STEPS[i] || TUTORIAL_STEPS[0];
  const n = i + 1;
  const base = {
    n, of: TUTORIAL_STEPS.length,
    stepLine: `STEP ${n} / ${TUTORIAL_STEPS.length}`,
    title: step.title,
    keys: ['W'],
    do: 'HOLD W',
    wait: step.how || 'Keep it down.',
    tip: 'Pause → END TRAINING leaves your career save alone.',
    progress: 0,
    progressLabel: '',
    onMap: !!(game?.maps?.mode),
    bar: true,
    go: true,
  };
  if (!tut || tut.done) return { ...base, go: false };

  const speed = game?.ship?.speed || 0;
  const holdingF = !!game?.input?.down?.('KeyF');
  const mapOpen = game?.maps?.mode === 'galaxy' || game?.maps?.mode === 'universe';

  if (step.id === 'fly') {
    const p = Math.min(1, speed / 80);
    return {
      ...base,
      keys: ['W'],
      do: 'HOLD W',
      wait: step.how,
      tip: '',
      progress: p,
      progressLabel: `${Math.round(speed)} / 80 m/s`,
      bar: true,
    };
  }

  if (step.id === 'lock') {
    const t = game?.target;
    const onBody = t && (t.kind === 'planet' || t.kind === 'moon' || t.data?.type);
    return {
      ...base,
      keys: ['T'],
      do: 'PRESS T',
      wait: step.how,
      tip: '',
      progress: tut.flags.locked ? 1 : onBody ? 0.45 : 0,
      progressLabel: tut.flags.locked ? 'LOCKED' : '',
      bar: false,
    };
  }

  if (step.id === 'ping') {
    const amt = holdingF ? Math.max(game?.scanHud?.amount || 0, Math.min(1, (tut.fHold || 0) / 1.15)) : (tut.fHold || 0) / 1.15;
    return {
      ...base,
      keys: ['F'],
      do: holdingF ? 'KEEP HOLDING F' : 'HOLD F',
      wait: step.how,
      tip: '',
      progress: Math.min(1, amt),
      progressLabel: holdingF ? 'SCANNING…' : 'HOLD F',
      bar: true,
    };
  }

  if (step.id === 'chart') {
    if (mapOpen) {
      return {
        ...base,
        keys: ['ESC'],
        do: 'PRESS ESC',
        wait: 'Close the map. That is all.',
        tip: '',
        progress: 1,
        progressLabel: '',
        onMap: true,
        bar: false,
      };
    }
    return {
      ...base,
      keys: ['G'],
      do: 'PRESS G',
      wait: step.how,
      tip: '',
      progress: tut.flags.chart ? 0.5 : 0,
      progressLabel: '',
      bar: false,
    };
  }

  const prompt = game?.dockPrompt;
  const ready = !!prompt && !prompt.tooFast;
  return {
    ...base,
    keys: ['E'],
    do: 'PRESS E',
    wait: ready ? step.how : step.how,
    tip: '',
    progress: ready ? 1 : 0.5,
    progressLabel: '',
    bar: false,
  };
}
