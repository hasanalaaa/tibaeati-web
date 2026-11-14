import type { Rect, Size } from './geometry';

export const POINTS_PER_INCH = 72;
export const MILLIMETRES_PER_INCH = 25.4;

/**
 * Swift `.rounded()` rounds half away from zero; `Math.round` rounds half towards +infinity,
 * which differs for negative ties (-2.5 -> -2 instead of -3).
 */
export function roundHalfAwayFromZero(value: number): number {
  const rounded = Math.sign(value) * Math.round(Math.abs(value));
  return rounded === 0 ? 0 : rounded;
}

/** Swift `Int64 / Int64` truncates towards zero. */
export function intDiv(dividend: number, divisor: number): number {
  return Math.trunc(dividend / divisor);
}

export function micrometresToPoints(micrometres: number): number {
  return (micrometres / 1_000 / MILLIMETRES_PER_INCH) * POINTS_PER_INCH;
}

export function pointsToMicrometres(points: number): number {
  if (!Number.isFinite(points)) return 0;
  return roundHalfAwayFromZero((points / POINTS_PER_INCH) * MILLIMETRES_PER_INCH * 1_000);
}

export function millimetresToMicrometres(millimetres: number): number {
  if (!Number.isFinite(millimetres)) return 0;
  return roundHalfAwayFromZero(millimetres * 1_000);
}

export function mmToPoints(millimetres: number): number {
  if (!Number.isFinite(millimetres)) return 0;
  return (millimetres / MILLIMETRES_PER_INCH) * POINTS_PER_INCH;
}

export function pointsToMM(points: number): number {
  if (!Number.isFinite(points)) return 0;
  return (points / POINTS_PER_INCH) * MILLIMETRES_PER_INCH;
}

export function inchesToPoints(inches: number): number {
  if (!Number.isFinite(inches)) return 0;
  return inches * POINTS_PER_INCH;
}

export function millimetresToPixels(millimetres: number, dpi: number): number {
  if (!Number.isFinite(dpi) || dpi <= 0) return 0;
  return (millimetres / MILLIMETRES_PER_INCH) * dpi;
}

export function pageSizePoints(widthMM: number, heightMM: number): Size {
  return { width: mmToPoints(widthMM), height: mmToPoints(heightMM) };
}

export function a4PageSizePoints(): Size {
  return pageSizePoints(210, 297);
}

export function snapped(value: number, precision = 1_000): number {
  if (!Number.isFinite(value) || precision <= 0) return 0;
  return roundHalfAwayFromZero(value * precision) / precision;
}

export function snappedRect(rect: Rect, precision = 1_000): Rect {
  return {
    x: snapped(rect.x, precision),
    y: snapped(rect.y, precision),
    width: snapped(rect.width, precision),
    height: snapped(rect.height, precision),
  };
}
