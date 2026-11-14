import { z } from 'zod';

export interface CardImagePlacement {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export const DEFAULT_PLACEMENT: CardImagePlacement = { scale: 1, offsetX: 0, offsetY: 0 };

const clamp = (value: number, fallback: number, low: number, high: number): number =>
  Math.min(Math.max(Number.isFinite(value) ? value : fallback, low), high);

export function normalizePlacement(p: CardImagePlacement): CardImagePlacement {
  return {
    scale: clamp(p.scale, 1, 1, 4),
    offsetX: clamp(p.offsetX, 0, -1.5, 1.5),
    offsetY: clamp(p.offsetY, 0, -1.5, 1.5),
  };
}

export const CardImagePlacementSchema = z
  .object({
    scale: z.number().default(1),
    offsetX: z.number().default(0),
    offsetY: z.number().default(0),
  })
  .transform(normalizePlacement);
