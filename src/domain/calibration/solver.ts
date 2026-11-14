import { HORIZONTAL_REFERENCE_MM, VERTICAL_REFERENCE_MM } from '../constants';
import type { Rect } from '../geometry';

/**
 * Solves printer feed calibration from a scanned test sheet (port of the pure
 * maths in CalibrationSolver.swift). Given the pixel rectangle of the known
 * 100 × 150 mm reference frame, it derives the actual px/mm scale of the print
 * and turns the drift into scale corrections. It never guesses: without a
 * usable frame it fails with an explicit reason.
 *
 * Frame detection on decoded images (detectReferenceFrame) is not part of this
 * module; it needs pixel data and lives with the image services.
 */

export type SolveFailure =
  /** No usable 100×150 mm frame was detected in the image. */
  | { readonly kind: 'frameNotFound' }
  /** The measured size implies a correction outside the protected window (offset ±15 mm, scale 0.97...1.03). */
  | { readonly kind: 'outOfRange'; readonly detail: string };

export class SolveError extends Error {
  readonly failure: SolveFailure;
  constructor(failure: SolveFailure) {
    super(failure.kind);
    this.name = 'SolveError';
    this.failure = failure;
  }
}

export interface Solution {
  readonly offsetXMM: number;
  readonly offsetYMM: number;
  readonly scaleX: number;
  readonly scaleY: number;
  /** The measured physical dimensions of the printed frame, in mm. */
  readonly measuredFrameWidthMM: number;
  readonly measuredFrameHeightMM: number;
  /** Confidence in [0, 1]; below `CONFIDENCE_THRESHOLD` callers must refuse. */
  readonly confidence: number;
}

export const CONFIDENCE_THRESHOLD = 0.55;

/** Swift `Double.rounded()`: half away from zero (Math.round rounds negative halves up). */
export function roundHalfAwayFromZero(x: number): number {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

function ratioConfidence(a: number, b: number): number {
  if (!(b > 0)) return 0;
  const ratio = a / b;
  const distance = Math.abs(1 - ratio);
  return Math.max(0, Math.min(1, 1 - distance * 3));
}

export interface SolveInput {
  /** The frame as seen in the scan, in pixels. */
  readonly frameRectPx: Rect;
  /** Full scan size in the same pixel space. */
  readonly pageWidthPx: number;
  readonly pageHeightPx: number;
  /** Printed frame size at 100% scale. */
  readonly nominalWidthMM?: number;
  readonly nominalHeightMM?: number;
  /** Physical paper size. */
  readonly expectedPageWidthMM?: number;
  readonly expectedPageHeightMM?: number;
}

/** Solves from an explicitly provided frame rect (px) inside a scan of known pixel size. */
export function solve(input: SolveInput): Solution {
  const {
    frameRectPx,
    pageWidthPx,
    pageHeightPx,
    nominalWidthMM = HORIZONTAL_REFERENCE_MM,
    nominalHeightMM = VERTICAL_REFERENCE_MM,
    expectedPageWidthMM = 210,
    expectedPageHeightMM = 297,
  } = input;

  if (!(frameRectPx.width > 8 && frameRectPx.height > 8 && pageWidthPx > 8 && pageHeightPx > 8)) {
    throw new SolveError({ kind: 'frameNotFound' });
  }

  // px per mm as printed, from both frame axes...
  const pxPerMMFromWidth = frameRectPx.width / nominalWidthMM;
  const pxPerMMFromHeight = frameRectPx.height / nominalHeightMM;
  // ...and cross-checked against the whole-page expectation.
  const pxPerMMFromPageX = pageWidthPx / expectedPageWidthMM;
  const pxPerMMFromPageY = pageHeightPx / expectedPageHeightMM;

  // Agreement between the two independent measurements drives confidence.
  const agreementX = ratioConfidence(pxPerMMFromWidth, pxPerMMFromPageX);
  const agreementY = ratioConfidence(pxPerMMFromHeight, pxPerMMFromPageY);
  const confidence = Math.min(agreementX, agreementY);

  // scaleX/Y are the CORRECTIONS (inverse of the feed drift); the printed size a
  // ruler reads is therefore nominal ÷ correction.
  const scaleX = pxPerMMFromPageX / pxPerMMFromWidth;
  const scaleY = pxPerMMFromPageY / pxPerMMFromHeight;
  const measuredWidthMM = nominalWidthMM / scaleX;
  const measuredHeightMM = nominalHeightMM / scaleY;

  return {
    offsetXMM: 0,
    offsetYMM: 0,
    scaleX: roundHalfAwayFromZero(scaleX * 10_000) / 10_000,
    scaleY: roundHalfAwayFromZero(scaleY * 10_000) / 10_000,
    measuredFrameWidthMM: roundHalfAwayFromZero(measuredWidthMM * 100) / 100,
    measuredFrameHeightMM: roundHalfAwayFromZero(measuredHeightMM * 100) / 100,
    confidence,
  };
}

export interface ValidatedOverride {
  readonly x: number;
  readonly y: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

/**
 * Acceptance against the protected windows before any persistence. Out-of-range
 * results are rejected, never silently clipped.
 */
export function validatedOverride(solution: Solution): ValidatedOverride {
  if (!(solution.confidence >= CONFIDENCE_THRESHOLD)) {
    throw new SolveError({ kind: 'frameNotFound' });
  }
  const inScale = (v: number): boolean => v >= 0.97 && v <= 1.03;
  if (!inScale(solution.scaleX) || !inScale(solution.scaleY)) {
    throw new SolveError({
      kind: 'outOfRange',
      detail: `Scale ${solution.scaleX.toFixed(4)}/${solution.scaleY.toFixed(4)} outside 0.97–1.03`,
    });
  }
  const inOffset = (v: number): boolean => v >= -15 && v <= 15;
  if (!inOffset(solution.offsetXMM) || !inOffset(solution.offsetYMM)) {
    throw new SolveError({
      kind: 'outOfRange',
      detail: `Offset ${solution.offsetXMM.toFixed(2)}/${solution.offsetYMM.toFixed(2)} mm outside ±15`,
    });
  }
  return {
    x: solution.offsetXMM,
    y: solution.offsetYMM,
    scaleX: solution.scaleX,
    scaleY: solution.scaleY,
  };
}
