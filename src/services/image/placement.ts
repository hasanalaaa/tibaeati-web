import type { ImageFit } from '@/domain/calibration/sheetPrimitives';
import {
  MAXIMUM_EXPORTED_IMAGE_DPI,
  MAXIMUM_RASTER_PIXEL_COUNT,
  PREVIEW_BASE_DPI,
  PREVIEW_MAX_DPI,
} from '@/domain/constants';
import type { Rect, Size } from '@/domain/geometry';
import { normalizePlacement, type CardImagePlacement } from '@/domain/models/cardImagePlacement';
import { PERSONAL_PHOTO_RECT, photoImageRect } from '@/domain/photos/layout';

/**
 * Hard per-canvas pixel budget. iOS Safari refuses canvases above ~16.7 MP (and kills tabs that
 * hold several); 12 MP keeps a wide margin while allowing a 600 dpi card or a 350 dpi A4 page.
 */
export const CANVAS_PIXEL_BUDGET = 12_000_000;

/** ImageStore.swift:39 writes JPEG at 0.96; the web export uses the same quality. */
export const EXPORT_JPEG_QUALITY = 0.96;

const ZERO: Rect = { x: 0, y: 0, width: 0, height: 0 };

function aspectFillSize(image: Size, container: Size): Size {
  if (!(image.width > 0 && image.height > 0 && container.width > 0 && container.height > 0)) {
    return { width: 0, height: 0 };
  }
  const scale = Math.max(container.width / image.width, container.height / image.height);
  return { width: image.width * scale, height: image.height * scale };
}

/** PDFExportService.draw(image:in:placement:), relative to the card's top-left corner. */
export function cardImageDrawRect(image: Size, card: Size, placement: CardImagePlacement): Rect {
  if (!(image.width > 0 && image.height > 0)) return ZERO;
  const p = normalizePlacement(placement);
  const base = aspectFillSize(image, card);
  const width = base.width * p.scale;
  const height = base.height * p.scale;
  return {
    x: card.width / 2 - width / 2 + p.offsetX * card.width,
    y: card.height / 2 - height / 2 + p.offsetY * card.height,
    width,
    height,
  };
}

/** Where to draw the image: a rect in a frame centred on the slot, after `quarterTurns`. */
export interface ContentPlacement {
  readonly quarterTurns: number;
  readonly drawRect: Rect;
}

/** One dispatcher for every fit rule, so PDF and canvas output use identical maths. */
export function contentPlacement(fit: ImageFit, image: Size, slot: Size): ContentPlacement {
  switch (fit.kind) {
    case 'card': {
      const r = cardImageDrawRect(image, slot, fit.placement);
      return {
        quarterTurns: 0,
        drawRect: { ...r, x: r.x - slot.width / 2, y: r.y - slot.height / 2 },
      };
    }
    case 'photo': {
      // The photo maths are defined on the nominal 30 x 40 mm rect; scale to the slot if it differs.
      const r = photoImageRect(image, fit.placement);
      const sx = slot.width / PERSONAL_PHOTO_RECT.width;
      const sy = slot.height / PERSONAL_PHOTO_RECT.height;
      return {
        quarterTurns: 0,
        drawRect: {
          x: (r.x - PERSONAL_PHOTO_RECT.width / 2) * sx,
          y: (r.y - PERSONAL_PHOTO_RECT.height / 2) * sy,
          width: r.width * sx,
          height: r.height * sy,
        },
      };
    }
    case 'document': {
      const turns = ((fit.quarterTurns % 4) + 4) % 4;
      const frame = turns % 2 === 0 ? slot : { width: slot.height, height: slot.width };
      if (!(image.width > 0 && image.height > 0)) return { quarterTurns: turns, drawRect: ZERO };
      const ratio = fit.fillFrame
        ? Math.max(frame.width / image.width, frame.height / image.height)
        : Math.min(frame.width / image.width, frame.height / image.height);
      const p = fit.fillFrame
        ? normalizePlacement(fit.placement)
        : { scale: 1, offsetX: 0, offsetY: 0 };
      const width = image.width * ratio * p.scale;
      const height = image.height * ratio * p.scale;
      return {
        quarterTurns: turns,
        drawRect: {
          x: -width / 2 + p.offsetX * frame.width,
          y: -height / 2 + p.offsetY * frame.height,
          width,
          height,
        },
      };
    }
  }
}

export interface CanvasGeometry {
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  /** Device pixels per point, per axis; the canvas covers exactly the requested size in points. */
  readonly scaleX: number;
  readonly scaleY: number;
  readonly dpi: number;
  /** True when the requested dpi was lowered to stay inside the pixel budget. */
  readonly reduced: boolean;
}

/** Highest dpi <= requested whose canvas stays within `budget` pixels. */
export function budgetedDpi(
  sizePt: Size,
  requestedDpi: number,
  budget = CANVAS_PIXEL_BUDGET,
): number {
  const area = Math.max(sizePt.width * sizePt.height, 1);
  const budgetDpi = Math.sqrt(budget / area) * 72;
  return Math.max(1, Math.min(requestedDpi, budgetDpi));
}

export function canvasGeometry(
  sizePt: Size,
  requestedDpi: number,
  budget = CANVAS_PIXEL_BUDGET,
): CanvasGeometry {
  let dpi = budgetedDpi(sizePt, requestedDpi, budget);
  let pixelWidth = Math.max(1, Math.round((sizePt.width * dpi) / 72));
  let pixelHeight = Math.max(1, Math.round((sizePt.height * dpi) / 72));
  // Rounding up can cross the budget by a few pixels; step down until it fits.
  while (pixelWidth * pixelHeight > budget && dpi > 1) {
    dpi *= 0.999;
    pixelWidth = Math.max(1, Math.round((sizePt.width * dpi) / 72));
    pixelHeight = Math.max(1, Math.round((sizePt.height * dpi) / 72));
  }
  return {
    pixelWidth,
    pixelHeight,
    scaleX: pixelWidth / sizePt.width,
    scaleY: pixelHeight / sizePt.height,
    dpi,
    reduced: dpi < requestedDpi - 1e-9,
  };
}

/** ImageExportService.effectiveDPI: Swift's 48 MP page budget (the web adds `CANVAS_PIXEL_BUDGET`). */
export function effectiveExportDPI(pageSize: Size, requestedDPI: number): number {
  const requested = Math.min(Math.max(requestedDPI, 72), MAXIMUM_EXPORTED_IMAGE_DPI);
  const pageArea = Math.max(pageSize.width * pageSize.height, 1);
  const budgetDPI = Math.sqrt(MAXIMUM_RASTER_PIXEL_COUNT / pageArea) * 72;
  return Math.min(requested, budgetDPI);
}

/** ImageExportService.recommendedPreviewDPI. */
export function recommendedPreviewDPI(
  pageSize: Size,
  screenScale: number,
  preferredDPI: number,
  pageCount = 1,
): number {
  const longestDisplaySide = 1_400;
  const longestPageSide = Math.max(pageSize.width, pageSize.height, 1);
  const displayDriven = (longestDisplaySide * Math.max(screenScale, 1) * 72) / longestPageSide;
  const preferred = Math.min(
    Math.max(Math.min(preferredDPI, displayDriven), PREVIEW_BASE_DPI),
    PREVIEW_MAX_DPI,
  );
  const budget =
    Math.sqrt(
      24_000_000 / (Math.max(pageSize.width * pageSize.height, 1) * Math.max(pageCount, 1)),
    ) * 72;
  return Math.min(preferred, budget);
}
