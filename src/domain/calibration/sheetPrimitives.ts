import type { Point, Rect } from '../geometry';
import type { CardImagePlacement } from '../models/cardImagePlacement';

/**
 * Device-independent drawing primitives shared by every exporter (calibration sheet, card pages,
 * personal photos, documents). Coordinates are PDF points with a TOP-LEFT origin, like UIKit;
 * the PDF writer converts to PDF's bottom-left origin in one place.
 */

/** sRGB components in 0...1. */
export type Color = readonly [number, number, number];

export const BLACK: Color = [0, 0, 0];
export const WHITE: Color = [1, 1, 1];
/** `UIColor.darkGray` is white 1/3. */
export const DARK_GRAY: Color = [1 / 3, 1 / 3, 1 / 3];
/** `UIColor.systemGreen` (light appearance), used by the preview safe-area guide. */
export const SYSTEM_GREEN: Color = [52 / 255, 199 / 255, 89 / 255];

export interface StrokeStyle {
  readonly width: number;
  readonly color: Color;
  readonly alpha: number;
  /** Dash lengths in points; empty or absent means solid. */
  readonly dash?: readonly number[];
  /** CoreGraphics default is butt. */
  readonly cap?: 'butt' | 'square';
}

export type TextWeight = 'regular' | 'semibold' | 'bold';

/** A literal (numerals, printer name) or an i18n key the caller translates before drawing. */
export type TextContent =
  | { readonly kind: 'literal'; readonly text: string }
  | { readonly kind: 'key'; readonly key: string };

export type ImageFit =
  /** Card artwork: aspect fill of the slot, then `CardImagePlacement` (PDFExportService.draw). */
  | { readonly kind: 'card'; readonly placement: CardImagePlacement }
  /** Personal photo: aspect fill with offsets clamped so no edge is uncovered. */
  | { readonly kind: 'photo'; readonly placement: CardImagePlacement }
  /** Document image: fit (or fill) inside the slot after `quarterTurns` clockwise turns. */
  | {
      readonly kind: 'document';
      readonly fillFrame: boolean;
      readonly placement: CardImagePlacement;
      readonly quarterTurns: number;
    };

export type DrawOp =
  | { readonly kind: 'fillRect'; readonly rect: Rect; readonly color: Color }
  /** All segments are stroked as ONE path, so overlapping translucent segments do not darken. */
  | {
      readonly kind: 'path';
      readonly segments: readonly (readonly [Point, Point])[];
      readonly stroke: StrokeStyle;
    }
  | { readonly kind: 'strokeRect'; readonly rect: Rect; readonly stroke: StrokeStyle }
  | {
      readonly kind: 'ellipse';
      readonly rect: Rect;
      readonly stroke?: StrokeStyle;
      readonly fill?: Color;
    }
  /** Text centred on `center` (the measured box centre, like the Swift `drawText`). */
  | {
      readonly kind: 'text';
      readonly content: TextContent;
      readonly center: Point;
      readonly size: number;
      readonly weight: TextWeight;
      readonly color: Color;
      /** Quarter turn counter-clockwise about `center` (Swift `rotate(by: -.pi / 2)`). */
      readonly rotatedCCW?: boolean;
    }
  | {
      readonly kind: 'clip';
      readonly rects: readonly Rect[];
      readonly evenOdd: boolean;
      readonly ops: readonly DrawOp[];
    }
  /** Raster artwork clipped to `rect`; mirrors are applied about the rect centre (duplex flip). */
  | {
      readonly kind: 'image';
      readonly source: string;
      readonly rect: Rect;
      readonly fit: ImageFit;
      readonly mirrorX: boolean;
      readonly mirrorY: boolean;
    }
  /** A source PDF page drawn as vectors into `rect` (1-based page number). */
  | {
      readonly kind: 'pdfPage';
      readonly source: string;
      readonly pageNumber: number;
      readonly rect: Rect;
      readonly quarterTurns: number;
    };

/** Every op, depth first, including those nested inside clip groups. */
export function flattenOps(ops: readonly DrawOp[]): DrawOp[] {
  return ops.flatMap((op) => (op.kind === 'clip' ? [op, ...flattenOps(op.ops)] : [op]));
}
