import { safeFileNameComponent } from './fileName';
import { formatFixed, prefixGraphemes } from './format';
import { intDiv, millimetresToMicrometres, roundHalfAwayFromZero } from './units';

describe('Swift numeric parity helpers', () => {
  it('rounds half away from zero like Swift .rounded()', () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
    expect(roundHalfAwayFromZero(-0.4)).toBe(0);
    expect(Object.is(roundHalfAwayFromZero(-0.4), 0)).toBe(true);
    expect(millimetresToMicrometres(215.9)).toBe(215_900);
    expect(millimetresToMicrometres(-0.0005)).toBe(-1);
  });

  it('truncates integer division towards zero like Int64', () => {
    expect(intDiv(7, 2)).toBe(3);
    expect(intDiv(-7, 2)).toBe(-3);
  });

  it('formats like printf %.Nf, ties to even', () => {
    expect(formatFixed(0.125, 2)).toBe('0.12');
    expect(formatFixed(0.375, 2)).toBe('0.38');
    expect(formatFixed(-0.125, 2)).toBe('-0.12');
    expect(formatFixed(85.6, 2)).toBe('85.60');
    expect(formatFixed(1.002, 4)).toBe('1.0020');
    expect(formatFixed(2.5, 0)).toBe('2');
  });

  it('cuts by grapheme clusters', () => {
    expect(prefixGraphemes('éab', 1)).toBe('é');
  });

  it('sanitises file name components', () => {
    expect(safeFileNameComponent('  a/b:c  ')).toBe('a-b-c');
    expect(safeFileNameComponent(' .. ')).toBe('Tibaeati');
  });
});
