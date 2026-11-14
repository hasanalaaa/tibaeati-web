/**
 * Matches C `printf("%.Nf")` as used by Swift `String(format:)`: exact binary ties round to even.
 * `Number.prototype.toFixed` rounds those ties away from zero (0.125 -> "0.13" instead of "0.12").
 */
export function formatFixed(value: number, digits: number): string {
  const result = value.toFixed(digits);
  const exact = Math.abs(value).toFixed(100);
  const dot = exact.indexOf('.');
  const kept = exact.slice(0, digits === 0 ? dot : dot + 1 + digits);
  const rest = exact.slice(dot + 1 + digits);
  if (!/^50*$/.test(rest)) return result;
  const lastDigit = Number(kept.at(-1));
  if (lastDigit % 2 !== 0) return result;
  return (value < 0 ? '-' : '') + kept;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Swift `String.prefix(n)` counts grapheme clusters, not UTF-16 units. */
export function prefixGraphemes(value: string, count: number): string {
  let result = '';
  let taken = 0;
  for (const { segment } of segmenter.segment(value)) {
    if (taken === count) break;
    result += segment;
    taken += 1;
  }
  return result;
}

export function graphemeCount(value: string): number {
  return [...segmenter.segment(value)].length;
}
