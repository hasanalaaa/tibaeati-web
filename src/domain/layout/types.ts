import { formatFixed } from '../format';
import type { Rect, Size } from '../geometry';
import type { Message } from '../messages';
import type { DuplexCalibrationTransform } from '../models/projectSettings';
import type { CardKind } from '../templates';

export interface LayoutSlot {
  readonly cardID: string;
  readonly kind: CardKind;
  readonly sheetIndex: number;
  readonly slotIndex: number;
  readonly pageIndex: number;
  readonly rect: Rect;
  readonly nominalFrontRect: Rect;
  readonly isFront: boolean;
}

export const layoutSlotId = (slot: LayoutSlot): string =>
  `${slot.cardID}-${slot.pageIndex}-${slot.isFront ? 'front' : 'back'}`;

export interface DuplexRegistrationReport {
  readonly pairedCardCount: number;
  readonly maximumDigitalDeviationMM: number;
  readonly effectiveHorizontalGapMM: number;
  readonly effectiveVerticalGapMM: number;
  readonly appliedCalibration: DuplexCalibrationTransform;
  readonly usedLockedTemplate: boolean;
}

export const isDigitallyExact = (report: DuplexRegistrationReport): boolean =>
  report.maximumDigitalDeviationMM <= 0.001;

export function registrationStatus(report: DuplexRegistrationReport): Message {
  if (isDigitallyExact(report)) return { key: 'duplex.status.exact' };
  return {
    key: 'duplex.status.deviation',
    params: { deviation: formatFixed(report.maximumDigitalDeviationMM, 3) },
  };
}

export interface GeneratedLayout {
  readonly pageSize: Size;
  readonly contentRect: Rect;
  readonly frontPages: readonly (readonly LayoutSlot[])[];
  readonly backPages: readonly (readonly LayoutSlot[])[];
  readonly registrationReport: DuplexRegistrationReport;
}

export const totalPageCount = (layout: GeneratedLayout): number =>
  layout.frontPages.length + layout.backPages.length;

export const isLayoutEmpty = (layout: GeneratedLayout): boolean =>
  layout.frontPages.length === 0 && layout.backPages.length === 0;
