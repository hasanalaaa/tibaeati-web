const STEPS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3_600],
  ['month', 30 * 24 * 3_600],
  ['week', 7 * 24 * 3_600],
  ['day', 24 * 3_600],
  ['hour', 3_600],
  ['minute', 60],
];

/** "3 days ago" / "قبل ٣ أيام" in the active language. */
export function relativeTime(iso: string, now: Date, locale: string): string {
  const seconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1_000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of STEPS) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.trunc(seconds / size), unit);
  }
  return formatter.format(0, 'second');
}
