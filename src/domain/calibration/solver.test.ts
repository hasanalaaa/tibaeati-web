import {
  roundHalfAwayFromZero,
  solve,
  SolveError,
  validatedOverride,
  CONFIDENCE_THRESHOLD,
} from './solver';
import type { Solution, SolveFailure } from './solver';
import type { Rect } from '../geometry';

// Mirrors XCTAssertEqual(_, _, accuracy:): |a - b| <= accuracy.
function expectNear(actual: number, expected: number, accuracy: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(accuracy);
}

function failureOf(fn: () => unknown): SolveFailure {
  try {
    fn();
  } catch (error) {
    if (error instanceof SolveError) return error.failure;
    throw error;
  }
  throw new Error('expected a SolveError');
}

/** The frame rectangle as printed, in scan pixels. */
function frameRect(pxPerMM: number, driftX = 1, driftY = 1): Rect {
  return {
    x: (210 * pxPerMM - 100 * driftX * pxPerMM) / 2,
    y: (297 * pxPerMM - 150 * driftY * pxPerMM) / 2,
    width: 100 * driftX * pxPerMM,
    height: 150 * driftY * pxPerMM,
  };
}

function solution(
  over: Partial<{
    scaleX: number;
    scaleY: number;
    offsetXMM: number;
    offsetYMM: number;
    confidence: number;
  }> = {},
): Solution {
  return {
    offsetXMM: over.offsetXMM ?? 0,
    offsetYMM: over.offsetYMM ?? 0,
    scaleX: over.scaleX ?? 1,
    scaleY: over.scaleY ?? 1,
    measuredFrameWidthMM: 100,
    measuredFrameHeightMM: 150,
    confidence: over.confidence ?? 1,
  };
}

describe('CalibrationSolverTests', () => {
  it('testKnownPixelFramesSolveWithinTwoHundredthsOfMillimetre', () => {
    const cases: readonly { pxPerMM: number; driftX: number; driftY: number }[] = [
      { pxPerMM: 4, driftX: 1.0, driftY: 1.0 },
      { pxPerMM: 10, driftX: 0.98, driftY: 1.0 },
      { pxPerMM: 10, driftX: 1.02, driftY: 1.0 },
      { pxPerMM: 4, driftX: 1.0, driftY: 0.98 },
      { pxPerMM: 4, driftX: 1.0, driftY: 1.02 },
      { pxPerMM: 200 / 52.91667, driftX: 1.01, driftY: 0.99 },
    ];
    for (const fixture of cases) {
      const s = solve({
        frameRectPx: frameRect(fixture.pxPerMM, fixture.driftX, fixture.driftY),
        pageWidthPx: 210 * fixture.pxPerMM,
        pageHeightPx: 297 * fixture.pxPerMM,
      });
      expectNear(s.measuredFrameWidthMM, 100 * fixture.driftX, 0.02);
      expectNear(s.measuredFrameHeightMM, 150 * fixture.driftY, 0.02);
      expectNear(s.scaleX, 1 / fixture.driftX, 0.001);
      expectNear(s.scaleY, 1 / fixture.driftY, 0.001);
      expect(s.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
    }
  });

  it('testMeasuredSizeReportsRulerTruthNotTheCorrection', () => {
    const expanded = solve({
      frameRectPx: frameRect(10, 1.02, 1.02),
      pageWidthPx: 2100,
      pageHeightPx: 2970,
    });
    expectNear(expanded.measuredFrameWidthMM, 102, 0.02);
    expectNear(expanded.measuredFrameHeightMM, 153, 0.02);

    const shrunk = solve({
      frameRectPx: frameRect(10, 0.98, 0.98),
      pageWidthPx: 2100,
      pageHeightPx: 2970,
    });
    expectNear(shrunk.measuredFrameWidthMM, 98, 0.02);
    expectNear(shrunk.measuredFrameHeightMM, 147, 0.02);
  });

  it('testDegenerateRectangleThrowsFrameNotFound', () => {
    expect(
      failureOf(() =>
        solve({
          frameRectPx: { x: 0, y: 0, width: 4, height: 900 },
          pageWidthPx: 840,
          pageHeightPx: 1188,
        }),
      ),
    ).toEqual({ kind: 'frameNotFound' });
  });

  it('testValidatedOverrideAcceptsExactWindowBoundaries', () => {
    expect(() => validatedOverride(solution({ scaleX: 0.97, scaleY: 1.03 }))).not.toThrow();
    expect(() => validatedOverride(solution({ offsetXMM: -15, offsetYMM: 15 }))).not.toThrow();
  });

  it('testValidatedOverrideRejectsScaleOutsideProtectedWindow', () => {
    const failure = failureOf(() => validatedOverride(solution({ scaleX: 1.0301 })));
    if (failure.kind !== 'outOfRange') throw new Error('expected .outOfRange');
    expect(failure.detail).toContain('0.97');
    expect(() => validatedOverride(solution({ scaleY: 0.9699 }))).toThrow(SolveError);
  });

  it('testValidatedOverrideRejectsOffsetOutsideFifteenMillimetres', () => {
    expect(failureOf(() => validatedOverride(solution({ offsetXMM: 15.01 }))).kind).toBe(
      'outOfRange',
    );
    expect(() => validatedOverride(solution({ offsetYMM: -15.5 }))).toThrow(SolveError);
  });

  it('testValidatedOverrideRefusesLowConfidence', () => {
    expect(() => validatedOverride(solution({ confidence: 0.3 }))).toThrow(SolveError);
  });
});

// Extra cases with no Swift counterpart: they pin behaviour the port must keep.
describe('solver extras (no Swift test)', () => {
  it('roundHalfAwayFromZero matches Swift rounded()', () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
    expect(roundHalfAwayFromZero(-0.4)).toBe(-0);
    expect(roundHalfAwayFromZero(1.4999)).toBe(1);
  });

  it('refuses a page smaller than 8 px', () => {
    expect(
      failureOf(() => solve({ frameRectPx: frameRect(4), pageWidthPx: 8, pageHeightPx: 1188 })),
    ).toEqual({ kind: 'frameNotFound' });
  });
});
