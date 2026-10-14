// One operation id commits once. A repeat returns the stored result and does not spend again.

export function commitOnce(game, id, mutate) {
  const key = String(id || '');
  if (!key) return { ok: false, reason: 'Missing operation id' };
  game.ops = game.ops && typeof game.ops === 'object' ? game.ops : {};
  if (game.ops[key]) return { ok: true, repeat: true, result: game.ops[key] };
  let result;
  try {
    result = mutate();
  } catch (err) {
    return { ok: false, reason: err?.message || 'Operation failed' };
  }
  if (result && result.ok === false) return result;
  const stored = result && typeof result === 'object' ? result : { ok: true };
  game.ops[key] = stored;
  return { ok: true, fresh: true, result: stored };
}
