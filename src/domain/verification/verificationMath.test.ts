import { IDENTITY_CALIBRATION, normalizeCalibration } from './localTypes';
import type { DuplexCalibrationTransform, Rect, Vector } from './localTypes';
import {
  CONFIDENCE_THRESHOLD,
  measure,
  mergedOverrideValues,
  propose,
  safetyAssessment,
  VerificationMathError,
} from './verificationMath';
import type { Measurement, Proposal, VerificationMathFailure } from './verificationMath';

// Mirrors XCTAssertEqual(_, _, accuracy:): |a - b| <= accuracy.
function expectNear(actual: number, expected: number, accuracy: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(accuracy);
}

function failureOf(fn: () => unknown): VerificationMathFailure {
  try {
    fn();
  } catch (error) {
    if (error instanceof VerificationMathError) return error.failure;
    throw error;
  }
  throw new Error('expected a VerificationMathError');
}

const ZERO: Vector = { dx: 0, dy: 0 };

/** The frame rectangle a PERFECT detector would see, in mm. */
function idealFrameMM(scaleX: number, scaleY: number, offsetXMM: number, offsetYMM: number): Rect {
  return {
    x: 105 + offsetXMM - 50 * scaleX,
    y: 148.5 + offsetYMM - 75 * scaleY,
    width: 100 * scaleX,
    height: 150 * scaleY,
  };
}

function measurement(
  rX: number,
  rY: number,
  rhoX: number,
  rhoY: number,
  u: Vector = ZERO,
  confidence = 1,
): Measurement {
  return {
    residualOffsetXMM: rX,
    residualOffsetYMM: rY,
    residualScaleX: rhoX,
    residualScaleY: rhoY,
    referenceDisplacementMM: u,
    confidence,
  };
}

describe('VerificationMathTests', () => {
  it('testRecoversKnownDriftWithinFiveHundredthsOfMillimetreOnBothAxesAndScales', () => {
    const active = IDENTITY_CALIBRATION;
    const cases: readonly { rX: number; rY: number; rhoX: number; rhoY: number }[] = [
      { rX: 0.4, rY: 0.0, rhoX: 1.0, rhoY: 1.0 },
      { rX: 0.0, rY: 0.4, rhoX: 1.0, rhoY: 1.0 },
      { rX: -0.3, rY: 0.25, rhoX: 1.006, rhoY: 0.995 },
      { rX: 0.12, rY: -0.18, rhoX: 0.998, rhoY: 1.01 },
      { rX: 0.05, rY: 0.05, rhoX: 1.002, rhoY: 1.002 },
    ];
    for (const fixture of cases) {
      const m = measurement(fixture.rX, fixture.rY, fixture.rhoX, fixture.rhoY);
      const proposal = propose(active, m);

      expectNear(proposal.newOffsetXMM, -fixture.rX / fixture.rhoX, 0.0001);
      expectNear(proposal.newOffsetYMM, -fixture.rY / fixture.rhoY, 0.0001);
      expectNear(proposal.newScaleX, 1 / fixture.rhoX, 0.00001);
      expectNear(proposal.newScaleY, 1 / fixture.rhoY, 0.00001);

      const merged = mergedOverrideValues(proposal);
      expect(Math.abs(merged.x - proposal.newOffsetXMM)).toBeLessThan(0.05);
      expect(Math.abs(merged.y - proposal.newOffsetYMM)).toBeLessThan(0.05);
    }
  });

  it('testCompositionWithExistingCalibrationClosesTheLoopExactly', () => {
    const active: DuplexCalibrationTransform = {
      offsetXMM: 0.8,
      offsetYMM: -1.1,
      scaleX: 0.995,
      scaleY: 1.004,
    };
    const driftRhoX = 1.004;
    const driftRhoY = 0.997;
    const driftTX = 0.35;
    const driftTY = -0.22;

    const m = measurement(
      driftRhoX * active.offsetXMM + driftTX,
      driftRhoY * active.offsetYMM + driftTY,
      driftRhoX * active.scaleX,
      driftRhoY * active.scaleY,
    );
    const proposal = propose(normalizeCalibration(active), m);

    expectNear(proposal.newScaleX * driftRhoX, 1, 0.00001);
    expectNear(proposal.newScaleY * driftRhoY, 1, 0.00001);
    expectNear(proposal.newOffsetXMM * driftRhoX + driftTX, 0, 0.0001);
    expectNear(proposal.newOffsetYMM * driftRhoY + driftTY, 0, 0.0001);
  });

  it('testOffCentreReferenceLeverageIsSeparatedExactly', () => {
    const u: Vector = { dx: 60, dy: -40 };
    const rhoX = 1.01;
    const rhoY = 1.0;
    const trueDriftTX = 0.2;
    const trueDriftTY = 0.0;
    const apparentRX = (rhoX - 1) * u.dx + trueDriftTX;
    const apparentRY = (rhoY - 1) * u.dy + trueDriftTY;

    const proposal = propose(
      IDENTITY_CALIBRATION,
      measurement(apparentRX, apparentRY, rhoX, rhoY, u),
    );

    const carriedX = proposal.newScaleX * rhoX;
    const carriedY = proposal.newScaleY * rhoY;
    expectNear(carriedX, 1, 0.00001);
    expectNear(carriedY, 1, 0.00001);
    const residualAtUAfterFix = (carriedX - 1) * u.dx + proposal.newOffsetXMM * rhoX + trueDriftTX;
    expectNear(residualAtUAfterFix, 0, 0.0001);
    const residualYAfterFix = (carriedY - 1) * u.dy + proposal.newOffsetYMM * rhoY + trueDriftTY;
    expectNear(residualYAfterFix, 0, 0.0001);
  });

  it('testMeasureComputesResidualAgainstMirroredIdealCentreLongEdge', () => {
    const pageSize = { width: 210, height: 297 };
    const front = idealFrameMM(1, 1, 0, 0);
    const back = idealFrameMM(1, 1.008, 0.4, -0.25);

    const m = measure({
      frontFrameMM: front,
      backFrameMM: back,
      pageSizeMM: pageSize,
      bindingEdge: 'longEdge',
      detectorConfidence: 1,
    });
    expectNear(m.residualOffsetXMM, 0.4, 0.0001);
    expectNear(m.residualOffsetYMM, -0.25, 0.0001);
    expectNear(m.residualScaleX, 1, 0.0001);
    expectNear(m.residualScaleY, 1.008, 0.0001);
    expectNear(m.referenceDisplacementMM.dx, 0, 0.0001);
    expectNear(m.confidence, 0.8, 0.001);
    expect(m.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
  });

  it('testMeasureShortEdgeMirrorsVertically', () => {
    const pageSize = { width: 210, height: 297 };
    const front: Rect = { x: 55, y: 73.5, width: 100, height: 150 };
    const back: Rect = { x: 56, y: 74.5, width: 100, height: 150 };

    const m = measure({
      frontFrameMM: front,
      backFrameMM: back,
      pageSizeMM: pageSize,
      bindingEdge: 'shortEdge',
      detectorConfidence: 1,
    });
    const frontMidY = front.y + front.height / 2;
    expectNear(m.residualOffsetXMM, 1, 0.0001);
    expectNear(
      m.residualOffsetYMM,
      1 - (2 * frontMidY - 297) - (frontMidY - (297 - frontMidY)),
      0.01,
    );
  });

  it('testMeasureThrowsMissingFrameWhenEitherSideIsAbsent', () => {
    const frame = idealFrameMM(1, 1, 0, 0);
    expect(failureOf(() => measure({ frontFrameMM: null, backFrameMM: frame }))).toEqual({
      kind: 'missingFrame',
    });
    expect(failureOf(() => measure({ frontFrameMM: frame, backFrameMM: null }))).toEqual({
      kind: 'missingFrame',
    });
  });

  it('testMeasureRejectsImplausibleFramesInsteadOfGuessing', () => {
    const sane = idealFrameMM(1, 1, 0, 0);
    const giant: Rect = { x: 0, y: 0, width: 205, height: 290 };
    expect(failureOf(() => measure({ frontFrameMM: giant, backFrameMM: sane })).kind).toBe(
      'implausibleGeometry',
    );
    const degenerate: Rect = { x: 0, y: 0, width: 0.5, height: 150 };
    expect(() => measure({ frontFrameMM: degenerate, backFrameMM: sane })).toThrow(
      VerificationMathError,
    );
  });

  it('testCrossSheetDisagreementReducesConfidence', () => {
    const pageSize = { width: 210, height: 297 };
    const front = idealFrameMM(1, 1, 0, 0);
    const back = idealFrameMM(1.03, 1.0, 0, 0);

    const agreeing = measure({
      frontFrameMM: front,
      backFrameMM: idealFrameMM(1.001, 1.001, 0, 0),
      pageSizeMM: pageSize,
      detectorConfidence: 1,
    });
    expect(agreeing.confidence).toBeGreaterThan(0.9);

    const disagreeing = measure({
      frontFrameMM: front,
      backFrameMM: back,
      pageSizeMM: pageSize,
      detectorConfidence: 1,
    });
    expect(disagreeing.confidence).toBeLessThan(CONFIDENCE_THRESHOLD);
  });

  it('testLowConfidenceProducesNoProposalAtAll', () => {
    const m = measurement(0.4, 0, 1, 1, ZERO, 0.3);
    expect(failureOf(() => propose(IDENTITY_CALIBRATION, m))).toEqual({
      kind: 'lowConfidence',
      confidence: 0.3,
    });
  });

  it('testSafetyGatesMatchSupervisorLimitsVerbatim', () => {
    const proposal = (dx: number, dy: number, dsx: number, dsy: number): Proposal => ({
      newOffsetXMM: dx,
      newOffsetYMM: dy,
      newScaleX: 1 + dsx,
      newScaleY: 1 + dsy,
      baselineOffsetXMM: 0,
      baselineOffsetYMM: 0,
      baselineScaleX: 1,
      baselineScaleY: 1,
    });

    const inside = proposal(1.999, -1.999, 0.00999, 0.00999);
    expect(safetyAssessment(inside)).toEqual({ kind: 'applyDirectly' });

    const beyondOffset = proposal(2.001, 0, 0, 0);
    expect(safetyAssessment(beyondOffset)).toEqual({
      kind: 'needsExplicitConfirmation',
      reasons: ['offset>2mm'],
    });

    const beyondScale = proposal(0, 0, 0, 0.0101);
    expect(safetyAssessment(beyondScale)).toEqual({
      kind: 'needsExplicitConfirmation',
      reasons: ['scale>0.01'],
    });

    const safeThroughSolver = propose(IDENTITY_CALIBRATION, measurement(-1.2, 0.6, 1.004, 0.998));
    expect(safetyAssessment(safeThroughSolver)).toEqual({ kind: 'applyDirectly' });

    const wildThroughSolver = propose(IDENTITY_CALIBRATION, measurement(-3, 0, 1, 1));
    expect(safetyAssessment(wildThroughSolver)).toEqual({
      kind: 'needsExplicitConfirmation',
      reasons: ['offset>2mm'],
    });
  });

  it('testMergedValuesAlwaysPassThroughNormalizedWindows', () => {
    const proposal = propose(IDENTITY_CALIBRATION, measurement(-20, 20, 0.9, 1.12));
    const merged = mergedOverrideValues(proposal);
    expect(merged.x).toBeGreaterThanOrEqual(-15);
    expect(merged.x).toBeLessThanOrEqual(15);
    expect(merged.y).toBeGreaterThanOrEqual(-15);
    expect(merged.y).toBeLessThanOrEqual(15);
    expect(merged.scaleX).toBeGreaterThanOrEqual(0.97);
    expect(merged.scaleX).toBeLessThanOrEqual(1.03);
    expect(merged.scaleY).toBeGreaterThanOrEqual(0.97);
    expect(merged.scaleY).toBeLessThanOrEqual(1.03);
  });
});
