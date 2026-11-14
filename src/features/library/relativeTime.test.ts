import { relativeTime } from './relativeTime';

const NOW = new Date('2026-06-15T12:00:00.000Z');

describe('relativeTime', () => {
  it('uses the largest fitting unit', () => {
    expect(relativeTime('2026-06-15T11:00:00.000Z', NOW, 'en')).toBe('1 hour ago');
    expect(relativeTime('2026-06-12T12:00:00.000Z', NOW, 'en')).toBe('3 days ago');
    expect(relativeTime('2026-06-15T12:00:00.000Z', NOW, 'en')).toBe('now');
  });
  it('localises to Arabic', () => {
    expect(relativeTime('2026-06-12T12:00:00.000Z', NOW, 'ar')).toMatch(/أيام/);
  });
});
