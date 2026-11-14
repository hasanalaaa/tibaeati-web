import { BLACK, WHITE, type DrawOp } from '../calibration/sheetPrimitives';
import { insetBy, midX, midY, type Rect, type Size } from '../geometry';
import {
  DEFAULT_PLACEMENT,
  normalizePlacement,
  type CardImagePlacement,
} from '../models/cardImagePlacement';
import { a4PageSizePoints, mmToPoints } from '../units';

/**
 * PersonalPhoto.swift `PersonalPhotoLayout`: ten 3 x 4 cm photos (Iraqi Ur portal services) in two
 * rows of five at the top of A4. Rectangles are in points, top-left origin.
 */
export const PERSONAL_PHOTO_RECT: Rect = {
  x: 0,
  y: 0,
  width: mmToPoints(30),
  height: mmToPoints(40),
};

/** Black frame drawn INSIDE each photo, so the outer size stays exactly 30 x 40 mm. */
export const PERSONAL_PHOTO_BORDER_WIDTH = mmToPoints(0.15);

export const PERSONAL_PHOTO_RECTS: readonly Rect[] = Array.from({ length: 10 }, (_, index) => ({
  x: mmToPoints(15 + (index % 5) * 37.5),
  y: mmToPoints(index < 5 ? 10 : 53),
  width: PERSONAL_PHOTO_RECT.width,
  height: PERSONAL_PHOTO_RECT.height,
}));

const validSize = (s: Size): boolean =>
  Number.isFinite(s.width) && Number.isFinite(s.height) && s.width > 0 && s.height > 0;

const coverFactor = (imageSize: Size): number =>
  Math.max(
    PERSONAL_PHOTO_RECT.width / imageSize.width,
    PERSONAL_PHOTO_RECT.height / imageSize.height,
  );

/** Offsets clamped so the scaled image always covers the whole photo. */
export function clampedPhotoPlacement(
  placement: CardImagePlacement,
  imageSize: Size,
): CardImagePlacement {
  if (!validSize(imageSize)) return DEFAULT_PLACEMENT;
  const result = normalizePlacement(placement);
  const factor = coverFactor(imageSize) * result.scale;
  const limitX = Math.max(
    0,
    (imageSize.width * factor - PERSONAL_PHOTO_RECT.width) / (2 * PERSONAL_PHOTO_RECT.width),
  );
  const limitY = Math.max(
    0,
    (imageSize.height * factor - PERSONAL_PHOTO_RECT.height) / (2 * PERSONAL_PHOTO_RECT.height),
  );
  return {
    scale: result.scale,
    offsetX: Math.min(Math.max(result.offsetX, -limitX), limitX),
    offsetY: Math.min(Math.max(result.offsetY, -limitY), limitY),
  };
}

/** Where the image is drawn, relative to the photo's top-left corner. */
export function photoImageRect(imageSize: Size, placement: CardImagePlacement): Rect {
  if (!(imageSize.width > 0 && imageSize.height > 0)) return { x: 0, y: 0, width: 0, height: 0 };
  const p = clampedPhotoPlacement(placement, imageSize);
  const factor = coverFactor(imageSize) * p.scale;
  const width = imageSize.width * factor;
  const height = imageSize.height * factor;
  return {
    x: midX(PERSONAL_PHOTO_RECT) - width / 2 + p.offsetX * PERSONAL_PHOTO_RECT.width,
    y: midY(PERSONAL_PHOTO_RECT) - height / 2 + p.offsetY * PERSONAL_PHOTO_RECT.height,
    width,
    height,
  };
}

/** `face` is normalised with a top-left origin (unlike Vision). */
export function suggestedPhotoPlacement(face: Rect, imageSize: Size): CardImagePlacement {
  const finite = [face.x, face.y, face.width, face.height].every(Number.isFinite);
  if (
    !(face.width > 0 && face.height > 0) ||
    !finite ||
    !(imageSize.width > 0 && imageSize.height > 0)
  ) {
    return DEFAULT_PLACEMENT;
  }
  const base = coverFactor(imageSize);
  const scale = Math.min(
    Math.max((PERSONAL_PHOTO_RECT.height * 0.42) / (face.height * imageSize.height * base), 1),
    4,
  );
  const width = imageSize.width * base * scale;
  const height = imageSize.height * base * scale;
  return clampedPhotoPlacement(
    {
      scale,
      offsetX: (width * (0.5 - midX(face))) / PERSONAL_PHOTO_RECT.width,
      offsetY:
        (PERSONAL_PHOTO_RECT.height * 0.42 -
          midY(PERSONAL_PHOTO_RECT) +
          height * (0.5 - midY(face))) /
        PERSONAL_PHOTO_RECT.height,
    },
    imageSize,
  );
}

export function photoEffectiveDPI(imageSize: Size, placement: CardImagePlacement): number {
  const draw = photoImageRect(imageSize, placement);
  return draw.width > 0 ? (imageSize.width / draw.width) * 72 : 0;
}

/** PersonalPhotoService.drawSheet as primitives: image clipped per photo, then the inner frame. */
export function personalPhotoSheetOps(
  source: string | undefined,
  placement: CardImagePlacement,
): DrawOp[] {
  const page = a4PageSizePoints();
  const ops: DrawOp[] = [
    {
      kind: 'fillRect',
      rect: { x: 0, y: 0, width: page.width, height: page.height },
      color: WHITE,
    },
  ];
  const half = PERSONAL_PHOTO_BORDER_WIDTH / 2;
  for (const rect of PERSONAL_PHOTO_RECTS) {
    if (source !== undefined) {
      ops.push({
        kind: 'image',
        source,
        rect,
        fit: { kind: 'photo', placement },
        mirrorX: false,
        mirrorY: false,
      });
    }
    ops.push({
      kind: 'strokeRect',
      rect: insetBy(rect, half, half),
      stroke: { width: PERSONAL_PHOTO_BORDER_WIDTH, color: BLACK, alpha: 1 },
    });
  }
  return ops;
}
