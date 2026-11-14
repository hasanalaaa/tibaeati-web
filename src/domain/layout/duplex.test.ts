import {
  applyMarginPreset,
  defaultProjectSettings,
  DUPLEX_BINDING_EDGES,
  type DuplexBindingEdge,
  type PaperSizeOption,
} from '../models/projectSettings';
import { CARD_KINDS, LOCKED_TEMPLATES, a4Capacity, type CardKind } from '../templates';
import { cards, expectNear, makeProject } from '../testFixtures';
import { buildLayout } from './engine';
import { isLayoutEmpty } from './types';

// Boundary calibration values inside the protected normalised ranges (±15 mm, 0.97...1.03).
const BOUNDARY_CALIBRATIONS = [
  { label: 'identity', offsetXMM: 0, offsetYMM: 0, scaleX: 1.0, scaleY: 1.0 },
  { label: 'max-offset-positive', offsetXMM: 15, offsetYMM: 15, scaleX: 0.97, scaleY: 0.97 },
  { label: 'max-offset-negative', offsetXMM: -15, offsetYMM: -15, scaleX: 1.03, scaleY: 1.03 },
  { label: 'mixed-extremes', offsetXMM: -14.5, offsetYMM: 13.5, scaleX: 1.03, scaleY: 0.97 },
] as const;

function maximumDeviationMM(
  cardCount: number,
  kind: CardKind,
  edge: DuplexBindingEdge,
  calibration: { offsetXMM: number; offsetYMM: number; scaleX: number; scaleY: number },
  paperSize: PaperSizeOption = 'a4',
): number {
  const settings = {
    ...applyMarginPreset({ ...defaultProjectSettings(), paperSize }, 'balanced'),
    lockCardTemplate: true,
    duplexBindingEdge: edge,
    backOffsetXMM: calibration.offsetXMM,
    backOffsetYMM: calibration.offsetYMM,
    backScaleX: calibration.scaleX,
    backScaleY: calibration.scaleY,
  };
  const mode = kind === 'unified' ? 'unifiedOnly' : 'housingOnly';
  const layout = buildLayout(makeProject(mode, cards(cardCount, kind), settings, 'Duplex'));
  expect(isLayoutEmpty(layout), `layout must contain ${cardCount} ${kind} cards`).toBe(false);
  return layout.registrationReport.maximumDigitalDeviationMM;
}

describe('DuplexRoundTripTests', () => {
  it('testBothEdgesAllTemplatesIdentityCalibrationRoundTripWithinMicrometre', () => {
    for (const kind of CARD_KINDS) {
      for (const edge of DUPLEX_BINDING_EDGES) {
        const deviation = maximumDeviationMM(a4Capacity(LOCKED_TEMPLATES[kind]), kind, edge, {
          offsetXMM: 0,
          offsetYMM: 0,
          scaleX: 1,
          scaleY: 1,
        });
        expect(deviation, `${kind}/${edge}`).toBeLessThanOrEqual(0.001);
      }
    }
  });

  it('testBoundaryCalibrationsRoundTripWithinMicrometre', () => {
    for (const calibration of BOUNDARY_CALIBRATIONS) {
      for (const edge of DUPLEX_BINDING_EDGES) {
        const deviation = maximumDeviationMM(
          a4Capacity(LOCKED_TEMPLATES.unified),
          'unified',
          edge,
          calibration,
        );
        expect(deviation, `${calibration.label}/${edge}`).toBeLessThanOrEqual(0.001);
      }
    }
  });

  it('testHousingBoundaryCalibrationOnLetterPaperWithinMicrometre', () => {
    const deviation = maximumDeviationMM(
      8,
      'housing',
      'longEdge',
      { offsetXMM: 15, offsetYMM: -15, scaleX: 1.03, scaleY: 0.97 },
      'letter',
    );
    expect(deviation).toBeLessThanOrEqual(0.001);
  });

  it('testBackRectIsActuallyMirroredRelativeToFrontForLongEdge', () => {
    const settings = {
      ...applyMarginPreset({ ...defaultProjectSettings(), paperSize: 'a4' as const }, 'balanced'),
      lockCardTemplate: true,
      duplexBindingEdge: 'longEdge' as const,
    };
    const layout = buildLayout(makeProject('unifiedOnly', cards(6, 'unified'), settings, 'Mirror'));
    const fronts = layout.frontPages[0] ?? [];
    const backs = layout.backPages[0] ?? [];
    expect(fronts.length).toBeGreaterThan(0);
    fronts.forEach((front, index) => {
      const back = backs[index];
      if (back?.cardID !== front.cardID) return;
      expectNear(back.rect.y, front.rect.y, 1e-6);
      expect(back.rect.x).not.toBe(front.rect.x);
      expectNear(back.rect.width, front.rect.width, 1e-9);
    });
  });
});
