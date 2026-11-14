import type { CardKind } from './templates';

export const MODE_IDS = [
  'unifiedOnly',
  'housingOnly',
  'mixed',
  'personalPhotos',
  'passport',
  'documents',
] as const;

export type ModeId = (typeof MODE_IDS)[number];
export type ProjectMode = ModeId;

export function isModeId(value: string): value is ModeId {
  return (MODE_IDS as readonly string[]).includes(value);
}

export const SELECTABLE_MODES: readonly ProjectMode[] = ['unifiedOnly', 'housingOnly', 'mixed'];

const MODE_CARD_KINDS: Readonly<Record<ProjectMode, readonly CardKind[]>> = {
  unifiedOnly: ['unified'],
  housingOnly: ['housing'],
  mixed: ['unified', 'housing'],
  personalPhotos: [],
  passport: [],
  documents: [],
};

export function modeCardKinds(mode: ProjectMode): readonly CardKind[] {
  return MODE_CARD_KINDS[mode];
}

export function modePrimaryKind(mode: ProjectMode): CardKind | undefined {
  const kinds = MODE_CARD_KINDS[mode];
  return kinds.length === 1 ? kinds[0] : undefined;
}

export function exportsMultipleCardKinds(mode: ProjectMode): boolean {
  return MODE_CARD_KINDS[mode].length > 1;
}
