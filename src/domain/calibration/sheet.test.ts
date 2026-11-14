import { defaultProjectSettings } from '../models/projectSettings';
import { expectNear } from '../testFixtures';
import { mmToPoints, pointsToMM } from '../units';
import { CALIBRATION_SHEET_KEYS, calibrationSheet } from './sheet';
import { flattenOps, type DrawOp } from './sheetPrimitives';

const A4 = { width: 595.275_590_551_181_2, height: 841.889_763_779_527_7 };

const rects = (ops: readonly DrawOp[]) =>
  flattenOps(ops).flatMap((o) => (o.kind === 'strokeRect' ? [o] : []));
const texts = (ops: readonly DrawOp[]) =>
  flattenOps(ops).flatMap((o) => (o.kind === 'text' ? [o] : []));
const paths = (ops: readonly DrawOp[]) =>
  flattenOps(ops).flatMap((o) => (o.kind === 'path' ? [o] : []));

// Geometry of CalibrationSheetService.swift, frozen in millimetres.
describe('calibration sheet', () => {
  it('front page: exact 100 x 150 mm frame centred on the paper, solid', () => {
    const sheet = calibrationSheet(defaultProjectSettings(), 'Brother DCP');
    expectNear(sheet.pageSize.width, A4.width, 1e-9);
    expectNear(sheet.pageSize.height, A4.height, 1e-9);
    const [frame] = rects(sheet.pages[0]);
    if (!frame) throw new Error('frame');
    expectNear(pointsToMM(frame.rect.width), 100, 1e-9);
    expectNear(pointsToMM(frame.rect.height), 150, 1e-9);
    expectNear(frame.rect.x + frame.rect.width / 2, A4.width / 2, 1e-9);
    expectNear(frame.rect.y + frame.rect.height / 2, A4.height / 2, 1e-9);
    expect(frame.stroke).toEqual({ width: 0.75, color: [0, 0, 0], alpha: 0.92, dash: [] });
  });

  it('back page: frame moved by the offset and scaled by the measured scale, dashed', () => {
    const settings = {
      ...defaultProjectSettings(),
      backOffsetXMM: 1.5,
      backOffsetYMM: -0.75,
      backScaleX: 1.004,
      backScaleY: 0.998,
    };
    const sheet = calibrationSheet(settings, 'P');
    const [frame] = rects(sheet.pages[1]);
    if (!frame) throw new Error('frame');
    expectNear(pointsToMM(frame.rect.width), 100 * 1.004, 1e-9);
    expectNear(pointsToMM(frame.rect.height), 150 * 0.998, 1e-9);
    expectNear(pointsToMM(frame.rect.x + frame.rect.width / 2 - A4.width / 2), 1.5, 1e-9);
    expectNear(pointsToMM(frame.rect.y + frame.rect.height / 2 - A4.height / 2), -0.75, 1e-9);
    expect(frame.stroke.dash).toEqual([4, 2]);
    // 41 steps of 0.5 mm in X and Y, long ticks on whole millimetres.
    const ruler = paths(sheet.pages[1]).find((p) => p.stroke.width === 0.6);
    expect(ruler?.segments).toHaveLength(82);
    const vertical = ruler?.segments.filter(([a, b]) => a.x === b.x) ?? [];
    const xs = vertical.map(([a]) => a.x).sort((a, b) => a - b);
    expectNear(pointsToMM((xs[40] ?? 0) - (xs[0] ?? 0)), 20 * 1.004, 1e-9);
    const readout = texts(sheet.pages[1]).find(
      (t) => t.content.kind === 'literal' && t.content.text.startsWith('X '),
    );
    expect(readout?.content).toEqual({
      kind: 'literal',
      text: 'X 1.50 mm · Y -0.75 mm · SX 1.0040 · SY 0.9980',
    });
  });

  it('corner crosses sit 8 mm in with 5 mm arms on both pages', () => {
    const sheet = calibrationSheet(defaultProjectSettings(), 'P');
    for (const page of sheet.pages) {
      const corners = paths(page).find((p) => p.stroke.width === 0.35);
      expect(corners?.segments).toHaveLength(8);
      const [first] = corners?.segments ?? [];
      expectNear(pointsToMM(first?.[0].x ?? 0), 3, 1e-9);
      expectNear(pointsToMM(first?.[1].x ?? 0), 13, 1e-9);
      expectNear(pointsToMM(first?.[0].y ?? 0), 8, 1e-9);
    }
  });

  it('labels: Latin numerals literal, Arabic copy as i18n keys, binding edge, sanitised name', () => {
    const sheet = calibrationSheet(defaultProjectSettings(), '  HP: Office/Jet  ');
    const front = texts(sheet.pages[0]);
    expect(front.map((t) => (t.content.kind === 'literal' ? t.content.text : t.content.key))).toEqual([
      '100 mm',
      '150 mm',
      CALIBRATION_SHEET_KEYS.frontTitle,
      'HP- Office-Jet',
      'duplexEdge.longEdge',
      CALIBRATION_SHEET_KEYS.printActualSize,
      CALIBRATION_SHEET_KEYS.measureFrame,
    ]);
    expect(front[1]?.rotatedCCW).toBe(true);
    expectNear(front[6]?.center.y ?? 0, A4.height / 2 + mmToPoints(86), 1e-9);
    expect(front.find((t) => t.size === 17)?.weight).toBe('bold');
  });

  it('front target: 18 mm cross, 2/4/6 mm rings and a 2.6 pt centre dot', () => {
    const ops = calibrationSheet(defaultProjectSettings(), 'P').pages[0];
    const ellipses = flattenOps(ops).flatMap((o) => (o.kind === 'ellipse' ? [o] : []));
    expect(ellipses.map((e) => e.rect.width)).toEqual([
      mmToPoints(4),
      mmToPoints(8),
      mmToPoints(12),
      2.6,
    ]);
    expect(ellipses[3]?.fill).toEqual([0, 0, 0]);
  });
});
