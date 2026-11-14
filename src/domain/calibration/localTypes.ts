// TODO: replace with the shared domain type once S1a lands.

/** CGRect (origin + size) in scan pixels. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** CalibrationSheetService.horizontalReferenceMM / verticalReferenceMM. */
export const HORIZONTAL_REFERENCE_MM = 100;
export const VERTICAL_REFERENCE_MM = 150;
