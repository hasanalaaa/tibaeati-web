import { maxX, maxY, type Rect, type Size } from '../geometry';
import {
  normalizeDuplexCalibration,
  type DuplexBindingEdge,
  type DuplexCalibrationTransform,
} from '../models/projectSettings';
import { mmToPoints, pointsToMM } from '../units';

/** Turning the sheet over mirrors across the binding edge's axis. */
export function mirror(rect: Rect, pageSize: Size, edge: DuplexBindingEdge): Rect {
  switch (edge) {
    case 'longEdge':
      return { x: pageSize.width - maxX(rect), y: rect.y, width: rect.width, height: rect.height };
    case 'shortEdge':
      return { x: rect.x, y: pageSize.height - maxY(rect), width: rect.width, height: rect.height };
  }
}

/** Scale about the page centre, then translate by the millimetre offset. */
export function applyCalibration(
  rect: Rect,
  pageSize: Size,
  calibration: DuplexCalibrationTransform,
): Rect {
  const c = normalizeDuplexCalibration(calibration);
  const centerX = pageSize.width / 2;
  const centerY = pageSize.height / 2;
  const scaledX = centerX + (rect.x - centerX) * c.scaleX;
  const scaledY = centerY + (rect.y - centerY) * c.scaleY;
  return {
    x: scaledX + mmToPoints(c.offsetXMM),
    y: scaledY + mmToPoints(c.offsetYMM),
    width: rect.width * c.scaleX,
    height: rect.height * c.scaleY,
  };
}

export function removeCalibration(
  rect: Rect,
  pageSize: Size,
  calibration: DuplexCalibrationTransform,
): Rect {
  const c = normalizeDuplexCalibration(calibration);
  const centerX = pageSize.width / 2;
  const centerY = pageSize.height / 2;
  const translatedX = rect.x - mmToPoints(c.offsetXMM);
  const translatedY = rect.y - mmToPoints(c.offsetYMM);
  return {
    x: centerX + (translatedX - centerX) / c.scaleX,
    y: centerY + (translatedY - centerY) / c.scaleY,
    width: rect.width / c.scaleX,
    height: rect.height / c.scaleY,
  };
}

/** The one duplex transform: every back rectangle derives from its front rectangle. */
export function duplexBackRect(
  front: Rect,
  pageSize: Size,
  edge: DuplexBindingEdge,
  calibration: DuplexCalibrationTransform,
): Rect {
  return applyCalibration(mirror(front, pageSize, edge), pageSize, calibration);
}

export function recoverFrontRect(
  back: Rect,
  pageSize: Size,
  edge: DuplexBindingEdge,
  calibration: DuplexCalibrationTransform,
): Rect {
  return mirror(removeCalibration(back, pageSize, calibration), pageSize, edge);
}

export function rectDeviationMM(lhs: Rect, rhs: Rect): number {
  const pointDeviation = Math.max(
    Math.abs(lhs.x - rhs.x),
    Math.abs(lhs.y - rhs.y),
    Math.abs(maxX(lhs) - maxX(rhs)),
    Math.abs(maxY(lhs) - maxY(rhs)),
  );
  return pointsToMM(pointDeviation);
}
