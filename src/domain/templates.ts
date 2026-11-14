import type { Size } from './geometry';
import { micrometresToPoints } from './units';

export {
  MODE_IDS,
  SELECTABLE_MODES,
  exportsMultipleCardKinds,
  isModeId,
  modeCardKinds,
  modePrimaryKind,
  type ModeId,
  type ProjectMode,
} from './modes';

export const CARD_KINDS = ['unified', 'housing'] as const;
export type CardKind = (typeof CARD_KINDS)[number];

/**
 * Immutable print specification. Dimensions are integer micrometres so repeated layout
 * calculations never accumulate floating-point drift before conversion to PDF points.
 */
export interface LockedCardTemplate {
  readonly kind: CardKind;
  readonly widthMicrometres: number;
  readonly heightMicrometres: number;
  readonly a4Columns: number;
  readonly a4Rows: number;
  readonly defaultCardCount: number;
}

export const LOCKED_TEMPLATES: Readonly<Record<CardKind, LockedCardTemplate>> = {
  unified: {
    kind: 'unified',
    widthMicrometres: 85_600,
    heightMicrometres: 53_980,
    a4Columns: 2,
    a4Rows: 5,
    defaultCardCount: 10,
  },
  housing: {
    kind: 'housing',
    widthMicrometres: 90_000,
    heightMicrometres: 60_000,
    a4Columns: 2,
    a4Rows: 4,
    defaultCardCount: 8,
  },
};

export function exactSizeMM(template: LockedCardTemplate): Size {
  return { width: template.widthMicrometres / 1_000, height: template.heightMicrometres / 1_000 };
}

export function exactSizePoints(template: LockedCardTemplate): Size {
  return {
    width: micrometresToPoints(template.widthMicrometres),
    height: micrometresToPoints(template.heightMicrometres),
  };
}

export function a4Capacity(template: LockedCardTemplate): number {
  return template.a4Columns * template.a4Rows;
}

export function cardKindTitleKey(kind: CardKind): `cardKind.${CardKind}` {
  return `cardKind.${kind}`;
}
