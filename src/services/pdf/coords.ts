import type { Point, Rect } from '@/domain/geometry';

/** PDF matrix [a b c d e f]: x' = a x + c y + e, y' = b x + d y + f. */
export type Matrix = readonly [number, number, number, number, number, number];

/**
 * The ONE place where the domain's top-left origin becomes PDF's bottom-left origin.
 * Every PDF coordinate in this module goes through `toPdfPoint` / `toPdfRect`.
 */
export function toPdfPoint(p: Point, pageHeight: number): Point {
  return { x: p.x, y: pageHeight - p.y };
}

export function toPdfRect(r: Rect, pageHeight: number): Rect {
  return { x: r.x, y: pageHeight - r.y - r.height, width: r.width, height: r.height };
}

/**
 * Maps an image XObject's unit square onto `rect` (top-left coordinates), optionally mirrored
 * about the rect centre (the Swift duplex flip: translate to centre, scale by -1, translate back).
 */
export function imageMatrix(
  rect: Rect,
  pageHeight: number,
  mirrorX = false,
  mirrorY = false,
): Matrix {
  const r = toPdfRect(rect, pageHeight);
  return [
    mirrorX ? -r.width : r.width,
    0,
    0,
    mirrorY ? -r.height : r.height,
    mirrorX ? r.x + r.width : r.x,
    mirrorY ? r.y + r.height : r.y,
  ];
}

export function multiply(m: Matrix, n: Matrix): Matrix {
  // m applied after n (m * n in PDF's row-vector convention: first n, then m).
  return [
    n[0] * m[0] + n[1] * m[2],
    n[0] * m[1] + n[1] * m[3],
    n[2] * m[0] + n[3] * m[2],
    n[2] * m[1] + n[3] * m[3],
    n[4] * m[0] + n[5] * m[2] + m[4],
    n[4] * m[1] + n[5] * m[3] + m[5],
  ];
}

export const translation = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];
export const scaling = (s: number): Matrix => [s, 0, 0, s, 0, 0];

/** Counter-clockwise rotation in PDF space; exact for multiples of 90 degrees. */
export function rotation(degrees: number): Matrix {
  const turns = (((Math.round(degrees / 90) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  if (degrees % 90 === 0) {
    const table: Readonly<Record<0 | 1 | 2 | 3, readonly [number, number]>> = {
      0: [1, 0],
      1: [0, 1],
      2: [-1, 0],
      3: [0, -1],
    };
    const [cos, sin] = table[turns];
    return [cos, sin, -sin, cos, 0, 0];
  }
  const rad = (degrees * Math.PI) / 180;
  return [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0];
}

export function applyMatrix(m: Matrix, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/**
 * DocumentPrintService.draw for a PDF source page: the crop box is rotated by its `/Rotate`,
 * scaled DOWN only (CGPDFPage.getDrawingTransform never enlarges) to fit, centred in the slot,
 * then turned by the user's clockwise quarter turns. Returns the matrix for a form XObject whose
 * coordinates are the source page's default user space.
 */
export function pdfPageMatrix(
  slot: Rect,
  pageHeight: number,
  cropBox: Rect,
  sourceRotation: number,
  quarterTurns: number,
): Matrix {
  const turns = ((quarterTurns % 4) + 4) % 4;
  const frame = turns % 2 === 0 ? slot : { ...slot, width: slot.height, height: slot.width };
  const rotated = ((Math.trunc(sourceRotation / 90) % 2) + 2) % 2 !== 0;
  const box = rotated ? { width: cropBox.height, height: cropBox.width } : cropBox;
  const s = Math.min(1, frame.width / box.width, frame.height / box.height);
  const center = toPdfPoint(
    { x: slot.x + slot.width / 2, y: slot.y + slot.height / 2 },
    pageHeight,
  );
  // Clockwise turns (y-down UIKit) are negative angles in y-up PDF space; so is /Rotate.
  const steps: Matrix[] = [
    translation(-(cropBox.x + cropBox.width / 2), -(cropBox.y + cropBox.height / 2)),
    rotation(-sourceRotation),
    scaling(s),
    rotation(-90 * turns),
    translation(center.x, center.y),
  ];
  return steps.reduce<Matrix>((acc, step) => multiply(step, acc), [1, 0, 0, 1, 0, 0]);
}
