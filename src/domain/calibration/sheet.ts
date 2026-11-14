import { safeFileNameComponent } from '../fileName';
import { midX, midY, maxX, maxY, type Point, type Rect, type Size } from '../geometry';
import {
  duplexCalibration,
  duplexEdgeTitleKey,
  normalizeSettings,
  paperPageSizePoints,
  type ProjectSettings,
} from '../models/projectSettings';
import { mmToPoints } from '../units';
import {
  BLACK,
  DARK_GRAY,
  WHITE,
  type Color,
  type DrawOp,
  type StrokeStyle,
  type TextContent,
  type TextWeight,
} from './sheetPrimitives';

/** CalibrationSheetService.swift:9-10. */
export const CALIBRATION_HORIZONTAL_REFERENCE_MM = 100;
export const CALIBRATION_VERTICAL_REFERENCE_MM = 150;

/** i18n keys the calibration sheet needs (the app dictionaries must define them). */
export const CALIBRATION_SHEET_KEYS = {
  frontTitle: 'calibrationSheet.frontTitle',
  backTitle: 'calibrationSheet.backTitle',
  printActualSize: 'calibrationSheet.printActualSize',
  measureFrame: 'calibrationSheet.measureFrame',
  backInstruction: 'calibrationSheet.backInstruction',
} as const;

export interface CalibrationSheet {
  readonly pageSize: Size;
  readonly title: string;
  readonly pages: readonly [readonly DrawOp[], readonly DrawOp[]];
}

type Segment = readonly [Point, Point];

const literal = (text: string): TextContent => ({ kind: 'literal', text });
const key = (k: string): TextContent => ({ kind: 'key', key: k });
const seg = (x0: number, y0: number, x1: number, y1: number): Segment => [
  { x: x0, y: y0 },
  { x: x1, y: y1 },
];
const text = (
  content: TextContent,
  center: Point,
  size: number,
  color: Color = BLACK,
  weight: TextWeight = 'regular',
): DrawOp => ({ kind: 'text', content, center, size, weight, color });

function cornerReferences(size: Size): DrawOp {
  const inset = mmToPoints(8);
  const arm = mmToPoints(5);
  const corners: Point[] = [
    { x: inset, y: inset },
    { x: size.width - inset, y: inset },
    { x: inset, y: size.height - inset },
    { x: size.width - inset, y: size.height - inset },
  ];
  return {
    kind: 'path',
    stroke: { width: 0.35, color: BLACK, alpha: 0.5 },
    segments: corners.flatMap((p) => [
      seg(p.x - arm, p.y, p.x + arm, p.y),
      seg(p.x, p.y - arm, p.x, p.y + arm),
    ]),
  };
}

function referenceFrame(
  center: Point,
  scaleX: number,
  scaleY: number,
  emphasized: boolean,
): DrawOp[] {
  const width = mmToPoints(CALIBRATION_HORIZONTAL_REFERENCE_MM) * scaleX;
  const height = mmToPoints(CALIBRATION_VERTICAL_REFERENCE_MM) * scaleY;
  const rect: Rect = { x: center.x - width / 2, y: center.y - height / 2, width, height };
  // The dash set for the frame stays active for the ticks, as in the Swift context.
  const stroke: StrokeStyle = {
    width: emphasized ? 0.75 : 0.55,
    color: BLACK,
    alpha: emphasized ? 0.92 : 0.66,
    dash: emphasized ? [] : [4, 2],
  };
  const tick = mmToPoints(2);
  const ticks: Segment[] = [];
  for (const x of [rect.x, midX(rect), maxX(rect)]) {
    ticks.push(seg(x, rect.y - tick, x, rect.y + tick));
    ticks.push(seg(x, maxY(rect) - tick, x, maxY(rect) + tick));
  }
  for (const y of [rect.y, midY(rect), maxY(rect)]) {
    ticks.push(seg(rect.x - tick, y, rect.x + tick, y));
    ticks.push(seg(maxX(rect) - tick, y, maxX(rect) + tick, y));
  }
  return [
    { kind: 'strokeRect', rect, stroke },
    { kind: 'path', segments: ticks, stroke },
    text(literal('100 mm'), { x: midX(rect), y: rect.y - mmToPoints(5) }, 9, DARK_GRAY),
    {
      kind: 'text',
      content: literal('150 mm'),
      center: { x: rect.x - mmToPoints(6), y: midY(rect) },
      size: 9,
      weight: 'regular',
      color: DARK_GRAY,
      rotatedCCW: true,
    },
  ];
}

function frontTarget(center: Point, printerName: string, edgeTitleKey: string): DrawOp[] {
  const stroke: StrokeStyle = { width: 0.9, color: BLACK, alpha: 1 };
  const arm = mmToPoints(18);
  const ops: DrawOp[] = [
    {
      kind: 'path',
      stroke,
      segments: [
        seg(center.x - arm, center.y, center.x + arm, center.y),
        seg(center.x, center.y - arm, center.x, center.y + arm),
      ],
    },
  ];
  for (const radiusMM of [2, 4, 6]) {
    const r = mmToPoints(radiusMM);
    ops.push({
      kind: 'ellipse',
      rect: { x: center.x - r, y: center.y - r, width: r * 2, height: r * 2 },
      stroke,
    });
  }
  ops.push({
    kind: 'ellipse',
    rect: { x: center.x - 1.3, y: center.y - 1.3, width: 2.6, height: 2.6 },
    fill: BLACK,
  });
  ops.push(
    text(key(CALIBRATION_SHEET_KEYS.frontTitle), { x: center.x, y: 45 }, 17, BLACK, 'bold'),
    text(literal(printerName), { x: center.x, y: 68 }, 11, DARK_GRAY),
    text(key(edgeTitleKey), { x: center.x, y: 88 }, 10, DARK_GRAY),
    text(
      key(CALIBRATION_SHEET_KEYS.printActualSize),
      { x: center.x, y: 108 },
      11,
      DARK_GRAY,
      'semibold',
    ),
    text(
      key(CALIBRATION_SHEET_KEYS.measureFrame),
      { x: center.x, y: center.y + mmToPoints(86) },
      11,
      DARK_GRAY,
    ),
  );
  return ops;
}

/** `String(format: "%.2f")` for the finite, clamped calibration values. */
const fixed = (value: number, digits: number): string => value.toFixed(digits);

function backRuler(
  center: Point,
  offsetMM: { readonly x: number; readonly y: number },
  scale: { readonly x: number; readonly y: number },
): DrawOp[] {
  const halfMillimetre = mmToPoints(0.5);
  const segments: Segment[] = [];
  for (let step = -20; step <= 20; step += 1) {
    const xDistance = step * halfMillimetre * scale.x;
    const yDistance = step * halfMillimetre * scale.y;
    const length = step % 2 === 0 ? 8 : 4;
    segments.push(
      seg(center.x + xDistance, center.y - length, center.x + xDistance, center.y + length),
    );
    segments.push(
      seg(center.x - length, center.y + yDistance, center.x + length, center.y + yDistance),
    );
  }
  const readout = `X ${fixed(offsetMM.x, 2)} mm · Y ${fixed(offsetMM.y, 2)} mm · SX ${fixed(scale.x, 4)} · SY ${fixed(scale.y, 4)}`;
  return [
    { kind: 'path', segments, stroke: { width: 0.6, color: BLACK, alpha: 1 } },
    text(key(CALIBRATION_SHEET_KEYS.backTitle), { x: center.x, y: 45 }, 17, BLACK, 'bold'),
    text(literal(readout), { x: center.x, y: 70 }, 10, DARK_GRAY),
    text(
      key(CALIBRATION_SHEET_KEYS.backInstruction),
      { x: center.x, y: center.y + mmToPoints(86) },
      11,
      DARK_GRAY,
    ),
  ];
}

/**
 * The two-page duplex calibration target of CalibrationSheetService.makeTestSheet: page 1 is the
 * nominal 100 x 150 mm frame and centre target, page 2 the calibrated frame and 0.5 mm ruler.
 */
export function calibrationSheet(settings: ProjectSettings, printerName: string): CalibrationSheet {
  const normalized = normalizeSettings(settings);
  const pageSize = paperPageSizePoints(normalized.paperSize);
  const center: Point = { x: pageSize.width / 2, y: pageSize.height / 2 };
  const calibration = duplexCalibration(normalized);
  const calibratedCenter: Point = {
    x: center.x + mmToPoints(calibration.offsetXMM),
    y: center.y + mmToPoints(calibration.offsetYMM),
  };
  const safeName = safeFileNameComponent(printerName, 'Printer');
  const background: DrawOp = {
    kind: 'fillRect',
    rect: { x: 0, y: 0, width: pageSize.width, height: pageSize.height },
    color: WHITE,
  };
  const front: DrawOp[] = [
    background,
    cornerReferences(pageSize),
    ...referenceFrame(center, 1, 1, true),
    ...frontTarget(center, safeName, duplexEdgeTitleKey(normalized.duplexBindingEdge)),
  ];
  const back: DrawOp[] = [
    background,
    cornerReferences(pageSize),
    ...referenceFrame(calibratedCenter, calibration.scaleX, calibration.scaleY, false),
    ...backRuler(
      calibratedCenter,
      { x: calibration.offsetXMM, y: calibration.offsetYMM },
      { x: calibration.scaleX, y: calibration.scaleY },
    ),
  ];
  return { pageSize, title: 'Tibaeati Precision Duplex Calibration', pages: [front, back] };
}
