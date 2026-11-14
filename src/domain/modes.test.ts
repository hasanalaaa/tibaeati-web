import { isModeId, MODE_IDS } from './modes';

describe('modes', () => {
  it('has the six iOS modes', () => {
    expect(MODE_IDS).toHaveLength(6);
  });
  it('guards ids', () => {
    expect(isModeId('passport')).toBe(true);
    expect(isModeId('nope')).toBe(false);
  });
});
