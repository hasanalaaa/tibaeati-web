import { z } from 'zod';
import { CardImagePlacementSchema, DEFAULT_PLACEMENT } from './cardImagePlacement';

export const PersonalPhotoSchema = z.object({
  imageFileName: z.string().optional(),
  placement: CardImagePlacementSchema.default(DEFAULT_PLACEMENT),
});

export type PersonalPhoto = z.output<typeof PersonalPhotoSchema>;
