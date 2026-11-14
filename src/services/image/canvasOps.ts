import type { Color, DrawOp, StrokeStyle, TextWeight } from '@/domain/calibration/sheetPrimitives';
import { DomainError } from '@/domain/errors';
import type { Size } from '@/domain/geometry';
import { decodeImage } from './decode';
import { CANVAS_PIXEL_BUDGET, canvasGeometry, contentPlacement } from './placement';

/**
 * Browser-only: executes drawing primitives on a 2D canvas. Runs unchanged in a Worker
 * (OffscreenCanvas) or on the main thread (HTMLCanvasElement). Not covered by Node tests; the
 * geometry it applies comes from the pure, tested `placement.ts`.
 */

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type RasterFormat = 'image/png' | 'image/jpeg';

export interface RasterJob {
  readonly widthPt: number;
  readonly heightPt: number;
  readonly dpi: number;
  readonly ops: readonly DrawOp[];
  /** Image sources by `DrawOp.source`; decoded one at a time and released immediately. */
  readonly sources: Readonly<Record<string, Blob>>;
  readonly format: RasterFormat;
  readonly quality?: number;
}

export interface RasterResult {
  readonly blob: Blob;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly dpi: number;
  readonly reduced: boolean;
}

export interface TextStyle {
  readonly size: number;
  readonly weight: TextWeight;
  readonly color: Color;
  readonly dpi: number;
}

export interface TextRaster {
  readonly blob: Blob;
  /** Size of the measured text box in points (place it centred on the anchor). */
  readonly widthPt: number;
  readonly heightPt: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}

/** Thrown when this environment has no usable 2D canvas (e.g. a Worker without OffscreenCanvas 2D). */
export class CanvasUnavailableError extends Error {
  constructor() {
    super('2D canvas unavailable');
    this.name = 'CanvasUnavailableError';
  }
}

function createCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document === 'undefined') throw new CanvasUnavailableError();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context2d(canvas: AnyCanvas, alpha = false): Ctx2D {
  // Narrowed per canvas type so each getContext overload resolves to its exact context type.
  const ctx: Ctx2D | null =
    'convertToBlob' in canvas
      ? canvas.getContext('2d', { alpha })
      : canvas.getContext('2d', { alpha });
  if (!ctx) throw new CanvasUnavailableError();
  return ctx;
}

async function encode(canvas: AnyCanvas, type: RasterFormat, quality?: number): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob(quality === undefined ? { type } : { type, quality });
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new DomainError({ code: 'imageEncodingFailed' }));
      },
      type,
      quality,
    );
  });
}

/** Frees the backing store now instead of at garbage collection (matters on iOS Safari). */
function release(canvas: AnyCanvas): void {
  canvas.width = 0;
  canvas.height = 0;
}

const css = (c: Color, alpha = 1): string =>
  `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${alpha})`;

const WEIGHTS: Readonly<Record<TextWeight, number>> = { regular: 400, semibold: 600, bold: 700 };
const FONT_STACK = '-apple-system, system-ui, "Segoe UI", Roboto, "Noto Naskh Arabic", sans-serif';
/** UIFont system line height is ~1.19 x size; the text box is centred on its anchor like Swift. */
export const TEXT_LINE_HEIGHT = 1.2;

const fontFor = (size: number, weight: TextWeight): string =>
  `${WEIGHTS[weight]} ${size}px ${FONT_STACK}`;

function applyStroke(ctx: Ctx2D, s: StrokeStyle): void {
  ctx.lineWidth = s.width;
  ctx.strokeStyle = css(s.color, s.alpha);
  ctx.lineCap = s.cap ?? 'butt';
  ctx.setLineDash(s.dash ? [...s.dash] : []);
}

async function drawOps(
  ctx: Ctx2D,
  ops: readonly DrawOp[],
  sources: Readonly<Record<string, Blob>>,
): Promise<void> {
  for (const op of ops) {
    switch (op.kind) {
      case 'fillRect':
        ctx.fillStyle = css(op.color);
        ctx.fillRect(op.rect.x, op.rect.y, op.rect.width, op.rect.height);
        break;
      case 'path':
        ctx.beginPath();
        for (const [a, b] of op.segments) {
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
        applyStroke(ctx, op.stroke);
        ctx.stroke();
        break;
      case 'strokeRect':
        ctx.beginPath();
        ctx.rect(op.rect.x, op.rect.y, op.rect.width, op.rect.height);
        applyStroke(ctx, op.stroke);
        ctx.stroke();
        break;
      case 'ellipse': {
        const r = op.rect;
        ctx.beginPath();
        ctx.ellipse(
          r.x + r.width / 2,
          r.y + r.height / 2,
          r.width / 2,
          r.height / 2,
          0,
          0,
          Math.PI * 2,
        );
        if (op.fill) {
          ctx.fillStyle = css(op.fill);
          ctx.fill();
        }
        if (op.stroke) {
          applyStroke(ctx, op.stroke);
          ctx.stroke();
        }
        break;
      }
      case 'text': {
        if (op.content.kind !== 'literal') {
          throw new DomainError({ code: 'exportFailed', reason: 'untranslated text' });
        }
        ctx.save();
        ctx.translate(op.center.x, op.center.y);
        if (op.rotatedCCW) ctx.rotate(-Math.PI / 2);
        ctx.font = fontFor(op.size, op.weight);
        ctx.fillStyle = css(op.color);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.direction = 'rtl';
        ctx.fillText(op.content.text, 0, 0);
        ctx.restore();
        break;
      }
      case 'clip':
        ctx.save();
        ctx.beginPath();
        for (const r of op.rects) ctx.rect(r.x, r.y, r.width, r.height);
        ctx.clip(op.evenOdd ? 'evenodd' : 'nonzero');
        await drawOps(ctx, op.ops, sources);
        ctx.restore();
        break;
      case 'image': {
        const blob = sources[op.source];
        if (!blob) throw new DomainError({ code: 'missingImage', fileName: op.source });
        const bitmap = await decodeImage(blob);
        try {
          const r = op.rect;
          const placement = contentPlacement(
            op.fit,
            { width: bitmap.width, height: bitmap.height },
            { width: r.width, height: r.height },
          );
          const d = placement.drawRect;
          ctx.save();
          ctx.beginPath();
          ctx.rect(r.x, r.y, r.width, r.height);
          ctx.clip();
          ctx.translate(r.x + r.width / 2, r.y + r.height / 2);
          ctx.scale(op.mirrorX ? -1 : 1, op.mirrorY ? -1 : 1);
          ctx.rotate((placement.quarterTurns * Math.PI) / 2);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(bitmap, d.x, d.y, d.width, d.height);
          ctx.restore();
        } finally {
          bitmap.close();
        }
        break;
      }
      case 'pdfPage':
        throw new DomainError({
          code: 'exportFailed',
          reason: 'PDF pages cannot be rasterised here',
        });
    }
  }
}

/** Renders `job.ops` (points, top-left origin) on a canvas within `CANVAS_PIXEL_BUDGET`. */
export async function executeRaster(job: RasterJob): Promise<RasterResult> {
  const size: Size = { width: job.widthPt, height: job.heightPt };
  const g = canvasGeometry(size, job.dpi, CANVAS_PIXEL_BUDGET);
  const canvas = createCanvas(g.pixelWidth, g.pixelHeight);
  try {
    const ctx = context2d(canvas);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, g.pixelWidth, g.pixelHeight);
    ctx.scale(g.scaleX, g.scaleY);
    await drawOps(ctx, job.ops, job.sources);
    const blob = await encode(
      canvas,
      job.format,
      job.format === 'image/jpeg' ? job.quality : undefined,
    );
    return {
      blob,
      pixelWidth: g.pixelWidth,
      pixelHeight: g.pixelHeight,
      dpi: g.dpi,
      reduced: g.reduced,
    };
  } finally {
    release(canvas);
  }
}

/** Shaped text (Arabic included) as a transparent PNG; pdf-lib cannot shape Arabic itself. */
export async function executeText(text: string, style: TextStyle): Promise<TextRaster> {
  const probe = createCanvas(1, 1);
  let widthPt: number;
  try {
    const ctx = context2d(probe);
    ctx.font = fontFor(style.size, style.weight);
    ctx.direction = 'rtl';
    widthPt = Math.max(1, ctx.measureText(text).width);
  } finally {
    release(probe);
  }
  const heightPt = style.size * TEXT_LINE_HEIGHT;
  const g = canvasGeometry({ width: widthPt, height: heightPt }, style.dpi);
  const canvas = createCanvas(g.pixelWidth, g.pixelHeight);
  try {
    const ctx = context2d(canvas, true);
    ctx.scale(g.scaleX, g.scaleY);
    ctx.font = fontFor(style.size, style.weight);
    ctx.fillStyle = css(style.color);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'rtl';
    ctx.fillText(text, widthPt / 2, heightPt / 2);
    const blob = await encode(canvas, 'image/png');
    return { blob, widthPt, heightPt, pixelWidth: g.pixelWidth, pixelHeight: g.pixelHeight };
  } finally {
    release(canvas);
  }
}
