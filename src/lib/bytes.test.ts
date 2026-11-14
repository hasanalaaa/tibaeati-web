import { formatBytes } from './bytes';

describe('formatBytes', () => {
  it('scales units', () => {
    expect(formatBytes(512, 'en')).toBe('512 byte');
    expect(formatBytes(1_536, 'en')).toMatch(/1\.5\s?kB/);
    expect(formatBytes(5 * 1_024 * 1_024, 'en')).toMatch(/5\s?MB/);
  });
});
