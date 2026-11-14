import { ar } from './ar';
import { en } from './en';

describe('i18n dictionaries', () => {
  it('ar and en have identical key sets', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ar).sort());
  });
  it('has no empty strings', () => {
    for (const dict of [ar, en]) {
      for (const value of Object.values(dict)) expect(value.trim()).not.toBe('');
    }
  });
});
