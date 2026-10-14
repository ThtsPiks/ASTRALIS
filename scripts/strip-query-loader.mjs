export function resolve(specifier, context, nextResolve) {
  const q = specifier.indexOf('?');
  if (q >= 0) specifier = specifier.slice(0, q);
  return nextResolve(specifier, context);
}
