const UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;

/** "12.3 MB" in the given locale. */
export function formatBytes(bytes: number, locale: string): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1_024 && unit < UNITS.length - 1) {
    value /= 1_024;
    unit += 1;
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: UNITS[unit] ?? 'byte',
    unitDisplay: 'short',
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
}
