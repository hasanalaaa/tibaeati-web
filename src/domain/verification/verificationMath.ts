import {
  HORIZONTAL_REFERENCE_MM,
  midX,
  midY,
  normalizeCalibration,
  VERTICAL_REFERENCE_MM,
} from './localTypes';
import type {
  DuplexBindingEdge,
  DuplexCalibrationTransform,
  Rect,
  Size,
  Vector,
} from './localTypes';

/**
 * Pure measurement and correction mathematics for the print verification loop
 * (port of VerificationMath.swift). Everything is in physical millimetres.
 *
 * A calibration C maps an ideal point x around the page centre c as
 *   A_C(x) = S_C·(x − c) + c + t_C.
 * The printer adds a feed drift E of the same shape; measuring the residual of a
 * printed back sheet lets `propose` solve the new calibration that cancels E.
 */

export type VerificationMathFailure =
  /** One side's 100 × 150 mm reference frame is absent. */
  | { readonly kind: 'missingFrame' }
  /** Frames were found but imply impossible geometry (never guess). */
  | { readonly kind: 'implausibleGeometry'; readonly detail: string }
  /** Confidence below the acceptance threshold: NO proposal at all. */
  | { readonly kind: 'lowConfidence'; readonly confidence: number };

export class VerificationMathError extends Error {
  readonly failure: VerificationMathFailure;
  constructor(failure: VerificationMathFailure) {
    super(failure.kind);
    this.name = 'VerificationMathError';
    this.failure = failure;
  }
}

export interface Measurement {
  /** Back centre minus ideal (mirrored front) centre. */
  readonly residualOffsetXMM: number;
  readonly residualOffsetYMM: number;
  /** Combined observed span ÷ nominal span per axis. */
  readonly residualScaleX: number;
  readonly residualScaleY: number;
  /** Vector from the page centre to the reference (ideal back) centre. */
  readonly referenceDisplacementMM: Vector;
  /** [0, 1]; below `CONFIDENCE_THRESHOLD` no proposal may be produced. */
  readonly confidence: number;
}

export interface Proposal {
  readonly newOffsetXMM: number;
  readonly newOffsetYMM: number;
  readonly newScaleX: number;
  readonly newScaleY: number;
  /** Baseline (active) values the proposal was computed against. */
  readonly baselineOffsetXMM: number;
  readonly baselineOffsetYMM: number;
  readonly baselineScaleX: number;
  readonly baselineScaleY: number;
}

export interface ProposalDeltas {
  readonly deltaOffsetXMM: number;
  readonly deltaOffsetYMM: number;
  readonly scaleChangeX: number;
  readonly scaleChangeY: number;
}

export function proposalDeltas(p: Proposal): ProposalDeltas {
  return {
    deltaOffsetXMM: p.newOffsetXMM - p.baselineOffsetXMM,
    deltaOffsetYMM: p.newOffsetYMM - p.baselineOffsetYMM,
    scaleChangeX: Math.abs(p.newScaleX - p.baselineScaleX),
    scaleChangeY: Math.abs(p.newScaleY - p.baselineScaleY),
  };
}

export const CONFIDENCE_THRESHOLD = 0.55;

/** Supervisor gates: corrections beyond these need the user's explicit confirmation. */
export const OFFSET_CONFIRMATION_LIMIT_MM = 2;
export const SCALE_CONFIRMATION_LIMIT = 0.01;

export type SafetyGate =
  | { readonly kind: 'applyDirectly' }
  | { readonly kind: 'needsExplicitConfirmation'; readonly reasons: readonly string[] };

export interface MeasureInput {
  readonly frontFrameMM: Rect | null;
  readonly backFrameMM: Rect | null;
  readonly pageSizeMM?: Size;
  readonly nominalWidthMM?: number;
  readonly nominalHeightMM?: number;
  readonly bindingEdge?: DuplexBindingEdge;
  readonly detectorConfidence?: number;
}

/** Swift `max(0, min(1, x))`: a NaN input resolves to 1 there (min returns its first argument). */
function clampUnitSwift(x: number): number {
  const lower = x < 1 ? x : 1;
  return lower >= 0 ? lower : 0;
}

function isPlausible(frame: Rect, pageSizeMM: Size): boolean {
  const minWidthMM = 60;
  const maxWidthMM = 140;
  const minHeightMM = 90;
  const maxHeightMM = 210;
  if (!(
    frame.width >= minWidthMM &&
    frame.width <= maxWidthMM &&
    frame.height >= minHeightMM &&
    frame.height <= maxHeightMM
  )) {
    return false;
  }
  const minX = frame.x;
  const maxX = frame.x + frame.width;
  const minY = frame.y;
  const maxY = frame.y + frame.height;
  if (!(
    minX >= -1 &&
    maxX <= pageSizeMM.width + 1 &&
    minY >= -1 &&
    maxY <= pageSizeMM.height + 1
  )) {
    return false;
  }
  return Number.isFinite(midX(frame)) && Number.isFinite(midY(frame));
}

/**
 * Computes the print residual from the two detected reference frames.
 * Confidence combines the detector trust with cross-sheet agreement: front and
 * back pass through the same feed, so materially different per-axis drift
 * between them means a bad scan, not a fact.
 */
export function measure(input: MeasureInput): Measurement {
  const {
    frontFrameMM,
    backFrameMM,
    pageSizeMM = { width: 210, height: 297 },
    nominalWidthMM = HORIZONTAL_REFERENCE_MM,
    nominalHeightMM = VERTICAL_REFERENCE_MM,
    bindingEdge = 'longEdge',
    detectorConfidence = 1,
  } = input;

  if (frontFrameMM === null || backFrameMM === null) {
    throw new VerificationMathError({ kind: 'missingFrame' });
  }
  const front = frontFrameMM;
  const back = backFrameMM;
  if (!(front.width > 1 && front.height > 1 && back.width > 1 && back.height > 1)) {
    throw new VerificationMathError({ kind: 'implausibleGeometry', detail: 'degenerate frame' });
  }
  for (const frame of [front, back]) {
    if (!isPlausible(frame, pageSizeMM)) {
      throw new VerificationMathError({
        kind: 'implausibleGeometry',
        detail: `frame ${frame.width.toFixed(1)}×${frame.height.toFixed(1)} mm outside printable bounds`,
      });
    }
  }

  // Combined observed scale per axis, measured on BOTH sheets.
  const frontScaleX = front.width / nominalWidthMM;
  const frontScaleY = front.height / nominalHeightMM;
  const backScaleX = back.width / nominalWidthMM;
  const backScaleY = back.height / nominalHeightMM;

  // Cross-sheet agreement: same feed implies the spans should nearly match.
  const agreementX = 1 - Math.min(1, Math.abs(backScaleX - frontScaleX) / 0.04);
  const agreementY = 1 - Math.min(1, Math.abs(backScaleY - frontScaleY) / 0.04);
  const confidence = clampUnitSwift(detectorConfidence) * Math.min(agreementX, agreementY);

  // Back centre minus its ideal (mirrored front) centre, in mm.
  const idealBackCenter =
    bindingEdge === 'longEdge'
      ? { x: pageSizeMM.width - midX(front), y: midY(front) }
      : { x: midX(front), y: pageSizeMM.height - midY(front) };
  const backCenter = { x: midX(back), y: midY(back) };
  const referenceDisplacement: Vector = {
    dx: idealBackCenter.x - pageSizeMM.width / 2,
    dy: idealBackCenter.y - pageSizeMM.height / 2,
  };

  return {
    residualOffsetXMM: backCenter.x - idealBackCenter.x,
    residualOffsetYMM: backCenter.y - idealBackCenter.y,
    residualScaleX: backScaleX,
    residualScaleY: backScaleY,
    referenceDisplacementMM: referenceDisplacement,
    confidence,
  };
}

/**
 * Derives the new override values that cancel the measured residual. Throws
 * `lowConfidence` BEFORE proposing anything when trust is short.
 *
 * With the ACTIVE calibration C baked into every print and feed drift E, the
 * measurement yields ρ_tot = ρ·S_C and r = (ρ_tot − 1)·u + ρ·t_C + t_E, hence
 *   S_new = 1/ρ = S_C/ρ_tot
 *   t_E   = r − (ρ_tot − 1)·u − ρ·t_C
 *   t_new = −t_E/ρ
 */
export function propose(
  activeCalibration: DuplexCalibrationTransform,
  measurement: Measurement,
  confidenceThreshold: number = CONFIDENCE_THRESHOLD,
): Proposal {
  if (!(measurement.confidence >= confidenceThreshold)) {
    throw new VerificationMathError({ kind: 'lowConfidence', confidence: measurement.confidence });
  }

  const current = normalizeCalibration(activeCalibration);
  if (!(
    measurement.residualScaleX > 0.5 &&
    measurement.residualScaleX < 1.5 &&
    measurement.residualScaleY > 0.5 &&
    measurement.residualScaleY < 1.5
  )) {
    throw new VerificationMathError({
      kind: 'implausibleGeometry',
      detail: 'residual scale outside sane range',
    });
  }

  // Pure printer-drift scales (total observed ÷ active calibration).
  const driftScaleX = measurement.residualScaleX / current.scaleX;
  const driftScaleY = measurement.residualScaleY / current.scaleY;
  if (!(driftScaleX > 0.5 && driftScaleX < 1.5 && driftScaleY > 0.5 && driftScaleY < 1.5)) {
    throw new VerificationMathError({
      kind: 'implausibleGeometry',
      detail: 'implied feed drift outside sane range',
    });
  }

  const newScaleX = 1 / driftScaleX;
  const newScaleY = 1 / driftScaleY;

  // Pure feed translation: remove the scale leverage at the reference, then the
  // active calibration's own baked-in translation.
  const leverageX = (measurement.residualScaleX - 1) * measurement.referenceDisplacementMM.dx;
  const leverageY = (measurement.residualScaleY - 1) * measurement.referenceDisplacementMM.dy;
  const driftTX = measurement.residualOffsetXMM - leverageX - driftScaleX * current.offsetXMM;
  const driftTY = measurement.residualOffsetYMM - leverageY - driftScaleY * current.offsetYMM;

  return {
    newOffsetXMM: -driftTX / driftScaleX,
    newOffsetYMM: -driftTY / driftScaleY,
    newScaleX,
    newScaleY,
    baselineOffsetXMM: current.offsetXMM,
    baselineOffsetYMM: current.offsetYMM,
    baselineScaleX: current.scaleX,
    baselineScaleY: current.scaleY,
  };
}

/** |Δoffset| > 2 mm or |Δscale| > 0.01 requires explicit confirmation; boundary values apply directly. */
export function safetyAssessment(proposal: Proposal): SafetyGate {
  const d = proposalDeltas(proposal);
  const reasons: string[] = [];
  if (
    Math.abs(d.deltaOffsetXMM) > OFFSET_CONFIRMATION_LIMIT_MM ||
    Math.abs(d.deltaOffsetYMM) > OFFSET_CONFIRMATION_LIMIT_MM
  ) {
    reasons.push('offset>2mm');
  }
  if (d.scaleChangeX > SCALE_CONFIRMATION_LIMIT || d.scaleChangeY > SCALE_CONFIRMATION_LIMIT) {
    reasons.push('scale>0.01');
  }
  return reasons.length === 0
    ? { kind: 'applyDirectly' }
    : { kind: 'needsExplicitConfirmation', reasons };
}

export interface MergedOverrideValues {
  readonly x: number;
  readonly y: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

/** The proposal's values always pass through `normalizeCalibration`, keeping the protected windows intact. */
export function mergedOverrideValues(proposal: Proposal): MergedOverrideValues {
  const n = normalizeCalibration({
    offsetXMM: proposal.newOffsetXMM,
    offsetYMM: proposal.newOffsetYMM,
    scaleX: proposal.newScaleX,
    scaleY: proposal.newScaleY,
  });
  return { x: n.offsetXMM, y: n.offsetYMM, scaleX: n.scaleX, scaleY: n.scaleY };
}
