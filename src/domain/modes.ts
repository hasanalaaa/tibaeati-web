export const MODE_IDS = [
  'unifiedOnly',
  'housingOnly',
  'mixed',
  'personalPhotos',
  'passport',
  'documents',
] as const;

export type ModeId = (typeof MODE_IDS)[number];

export function isModeId(value: string): value is ModeId {
  return (MODE_IDS as readonly string[]).includes(value);
}
