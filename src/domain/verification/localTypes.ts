// TODO: replace each type below with the shared domain type once S1a lands.

/** Swift DuplexBindingEdge. */
export type DuplexBindingEdge = 'longEdge' | 'shortEdge';

/** Swift DuplexCalibrationTransform (ProjectSettings.swift). */
export interface DuplexCalibrationTransform {
  readonly offsetXMM: number;
  readonly offsetYMM: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export const IDENTITY_CALIBRATION: DuplexCalibrationTransform = {
  offsetXMM: 0,
  offsetYMM: 0,
  scaleX: 1,
  scaleY: 1,
};

const clamp = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), high);

/** Swift DuplexCalibrationTransform.normalized: protected windows offset ±15 mm, scale 0.97...1.03. */
export function normalizeCalibration(t: DuplexCalibrationTransform): DuplexCalibrationTransform {
  return {
    offsetXMM: clamp(Number.isFinite(t.offsetXMM) ? t.offsetXMM : 0, -15, 15),
    offsetYMM: clamp(Number.isFinite(t.offsetYMM) ? t.offsetYMM : 0, -15, 15),
    scaleX: clamp(Number.isFinite(t.scaleX) ? t.scaleX : 1, 0.97, 1.03),
    scaleY: clamp(Number.isFinite(t.scaleY) ? t.scaleY : 1, 0.97, 1.03),
  };
}

/** CGRect (origin + size). Only positive sizes are expected by callers. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** CGSize. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/** CGVector. */
export interface Vector {
  readonly dx: number;
  readonly dy: number;
}

export const midX = (r: Rect): number => r.x + r.width / 2;
export const midY = (r: Rect): number => r.y + r.height / 2;

/** CalibrationSheetService.horizontalReferenceMM / verticalReferenceMM. */
export const HORIZONTAL_REFERENCE_MM = 100;
export const VERTICAL_REFERENCE_MM = 150;
