import type { ImageFit } from '@/domain/calibration/sheetPrimitives';
import { DomainError, type AppError } from '@/domain/errors';
import type { Size } from '@/domain/geometry';
import {
  executeRaster,
  executeText,
  type RasterJob,
  type RasterResult,
  type TextRaster,
  type TextStyle,
} from './canvasOps';
import { EXPORT_JPEG_QUALITY } from './placement';

export type { RasterFormat, RasterJob, RasterResult, TextRaster, TextStyle } from './canvasOps';

export type WorkerRequest =
  | { readonly id: number; readonly kind: 'raster'; readonly job: RasterJob }
  | {
      readonly id: number;
      readonly kind: 'text';
      readonly text: string;
      readonly style: TextStyle;
    };

export type WorkerResponse =
  | { readonly id: number; readonly ok: true; readonly result: RasterResult | TextRaster }
  | {
      readonly id: number;
      readonly ok: false;
      readonly unsupported: boolean;
      readonly message: string;
      readonly error?: AppError;
    };

type Body =
  | { readonly kind: 'raster'; readonly job: RasterJob }
  | {
      readonly kind: 'text';
      readonly text: string;
      readonly style: TextStyle;
    };

/** undefined: not tried yet; null: unavailable, render on the main thread. */
let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, (response: WorkerResponse | 'fallback') => void>();
let queue: Promise<unknown> = Promise.resolve();
let peakCanvasPixels = 0;
let jobCount = 0;

function disableWorker(): void {
  worker?.terminate();
  worker = null;
  for (const settle of pending.values()) settle('fallback');
  pending.clear();
}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  const supported =
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap === 'function';
  if (!supported) return (worker = null);
  try {
    const created = new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
    created.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const settle = pending.get(event.data.id);
      pending.delete(event.data.id);
      settle?.(event.data);
    });
    created.addEventListener('error', disableWorker);
    worker = created;
  } catch {
    worker = null;
  }
  return worker;
}

function viaWorker(body: Body): Promise<WorkerResponse | 'fallback'> {
  const w = getWorker();
  if (!w) return Promise.resolve('fallback');
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    w.postMessage({ ...body, id } satisfies WorkerRequest);
  });
}

async function run(body: Body): Promise<RasterResult | TextRaster> {
  const response = await viaWorker(body);
  if (response === 'fallback' || (!response.ok && response.unsupported)) {
    if (response !== 'fallback') disableWorker();
    return body.kind === 'raster' ? executeRaster(body.job) : executeText(body.text, body.style);
  }
  if (response.ok) return response.result;
  throw response.error ? new DomainError(response.error) : new Error(response.message);
}

/** Jobs run one at a time, so at most one decoded image and one canvas are alive. */
function enqueue<T extends RasterResult | TextRaster>(body: Body): Promise<T> {
  const result = queue.then(() => run(body)) as Promise<T>;
  queue = result.catch(() => undefined);
  return result.then((value) => {
    jobCount += 1;
    peakCanvasPixels = Math.max(peakCanvasPixels, value.pixelWidth * value.pixelHeight);
    return value;
  });
}

/**
 * Renders primitives to an image. Uses a Worker with OffscreenCanvas when available and falls back
 * to a main-thread canvas otherwise; callers cannot tell which ran.
 */
export function renderRaster(job: RasterJob): Promise<RasterResult> {
  return enqueue<RasterResult>({ kind: 'raster', job });
}

export interface ImageContentRequest {
  readonly source: Blob;
  readonly fit: ImageFit;
  /** Slot size in points; the output covers exactly this rectangle. */
  readonly sizePt: Size;
  readonly dpi: number;
  /** PNG instead of JPEG (quality 0.96). */
  readonly lossless?: boolean;
}

/** One slot's artwork (placement, rotation and clipping applied) on a white background. */
export function renderImageContent(request: ImageContentRequest): Promise<RasterResult> {
  const rect = { x: 0, y: 0, width: request.sizePt.width, height: request.sizePt.height };
  return renderRaster({
    widthPt: rect.width,
    heightPt: rect.height,
    dpi: request.dpi,
    ops: [
      { kind: 'image', source: 'content', rect, fit: request.fit, mirrorX: false, mirrorY: false },
    ],
    sources: { content: request.source },
    format: request.lossless ? 'image/png' : 'image/jpeg',
    quality: EXPORT_JPEG_QUALITY,
  });
}

/** Shaped text as a transparent PNG with its box size in points. */
export function textToPng(text: string, style: TextStyle): Promise<TextRaster> {
  return enqueue<TextRaster>({ kind: 'text', text, style });
}

/** Diagnostics for the verification script: largest canvas used so far and job count. */
export function rasterStats(): { readonly peakCanvasPixels: number; readonly jobs: number } {
  return { peakCanvasPixels, jobs: jobCount };
}
