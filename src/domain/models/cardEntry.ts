import { z } from 'zod';
import { randomId, type NewId } from '../ids';
import type { Message } from '../messages';
import { CARD_KINDS, type CardKind } from '../templates';
import {
  CardImagePlacementSchema,
  DEFAULT_PLACEMENT,
  normalizePlacement,
  type CardImagePlacement,
} from './cardImagePlacement';

export const CardEntrySchema = z.object({
  id: z.uuid(),
  kind: z.enum(CARD_KINDS).default('unified'),
  order: z
    .number()
    .int()
    .default(0)
    .transform((order) => Math.max(0, order)),
  frontImageFileName: z.string().optional(),
  backImageFileName: z.string().optional(),
  frontPlacement: CardImagePlacementSchema.default(DEFAULT_PLACEMENT),
  backPlacement: CardImagePlacementSchema.default(DEFAULT_PLACEMENT),
  /** Batch overlay plan keys ("t:<text>\u0001q:<payload>"); absent for regular cards. */
  batchFrontPlanKey: z.string().optional(),
  batchBackPlanKey: z.string().optional(),
});

export type CardEntry = z.output<typeof CardEntrySchema>;

export interface CardEntryInput {
  readonly id?: string;
  readonly kind: CardKind;
  readonly order: number;
  readonly frontImageFileName?: string;
  readonly backImageFileName?: string;
  readonly frontPlacement?: CardImagePlacement;
  readonly backPlacement?: CardImagePlacement;
}

export function createCardEntry(input: CardEntryInput, newId: NewId = randomId): CardEntry {
  const card: CardEntry = {
    id: input.id ?? newId(),
    kind: input.kind,
    order: Math.max(0, input.order),
    frontPlacement: normalizePlacement(input.frontPlacement ?? DEFAULT_PLACEMENT),
    backPlacement: normalizePlacement(input.backPlacement ?? DEFAULT_PLACEMENT),
  };
  if (input.frontImageFileName !== undefined) card.frontImageFileName = input.frontImageFileName;
  if (input.backImageFileName !== undefined) card.backImageFileName = input.backImageFileName;
  return card;
}

export const isCardComplete = (card: CardEntry): boolean =>
  card.frontImageFileName !== undefined && card.backImageFileName !== undefined;

export const cardHasAnyImage = (card: CardEntry): boolean =>
  card.frontImageFileName !== undefined || card.backImageFileName !== undefined;

/** Same content under a fresh id (used to repair duplicate ids). */
export function reidentifiedCard(card: CardEntry, newId: NewId = randomId): CardEntry {
  return {
    ...card,
    id: newId(),
    order: Math.max(0, card.order),
    frontPlacement: normalizePlacement(card.frontPlacement),
    backPlacement: normalizePlacement(card.backPlacement),
  };
}

export function cardTitle(card: CardEntry): Message {
  return { key: `card.title.${card.kind}`, params: { number: card.order + 1 } };
}

export function cardFrontTitle(card: CardEntry): Message {
  return { key: 'card.side.front', params: { title: cardTitle(card) } };
}

export function cardBackTitle(card: CardEntry): Message {
  return { key: 'card.side.back', params: { title: cardTitle(card) } };
}
