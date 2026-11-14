import {
  BLACK,
  SYSTEM_GREEN,
  WHITE,
  type DrawOp,
  type StrokeStyle,
} from '@/domain/calibration/sheetPrimitives';
import { insetBy, maxX, maxY, type Point, type Rect, type Size } from '@/domain/geometry';
import type { LayoutSlot } from '@/domain/layout/types';
import type { PrintProject } from '@/domain/models/printProject';
import { normalizeSettings } from '@/domain/models/projectSettings';
import { mmToPoints } from '@/domain/units';

/** PDFExportService.swift:10-13. */
export const CROP_MARK_LENGTH = mmToPoints(3);
export const CROP_MARK_INSET = mmToPoints(1.2);
export const REGISTRATION_LENGTH = mmToPoints(4.5);
export const REGISTRATION_INSET = mmToPoints(3);

type Segment = readonly [Point, Point];
const seg = (x0: number, y0: number, x1: number, y1: number): Segment => [
  { x: x0, y: y0 },
  { x: x1, y: y1 },
];

const CROP_STROKE: StrokeStyle = { width: 0.5, color: BLACK, alpha: 0.72, cap: 'square' };
const REGISTRATION_STROKE: StrokeStyle = { width: 0.4, color: BLACK, alpha: 0.42 };

export function cropMarkSegments(rect: Rect): Segment[] {
  const o = CROP_MARK_INSET;
  const l = CROP_MARK_LENGTH;
  const { x, y } = rect;
  const mx = maxX(rect);
  const my = maxY(rect);
  return [
    seg(x, y - o, x, y - o - l),
    seg(x - o, y, x - o - l, y),
    seg(mx, y - o, mx, y - o - l),
    seg(mx + o, y, mx + o + l, y),
    seg(x, my + o, x, my + o + l),
    seg(x - o, my, x - o - l, my),
    seg(mx, my + o, mx, my + o + l),
    seg(mx + o, my, mx + o + l, my),
  ];
}

export function registrationMarkSegments(page: Size): Segment[] {
  const midX = page.width / 2;
  const midY = page.height / 2;
  const x0 = REGISTRATION_INSET;
  const x1 = page.width - REGISTRATION_INSET;
  const y0 = REGISTRATION_INSET;
  const y1 = page.height - REGISTRATION_INSET;
  const l = REGISTRATION_LENGTH;
  return [
    seg(midX - l, y0, midX + l, y0),
    seg(midX, y0 - 1.5, midX, y0 + l),
    seg(midX - l, y1, midX + l, y1),
    seg(midX, y1 - l, midX, y1 + 1.5),
    seg(x0, midY - l, x0, midY + l),
    seg(x0 - 1.5, midY, x0 + l, midY),
    seg(x1, midY - l, x1, midY + l),
    seg(x1 - l, midY, x1 + 1.5, midY),
  ];
}

/**
 * PDFExportService.drawPage as primitives, shared by PDF and PNG export. Back slots arrive with
 * their duplex rectangles from the layout engine and are never recomputed here.
 * Batch overlays (`batch*PlanKey`) are not drawn yet: the batch renderer is slice S8.
 */
export function cardPageOps(
  slots: readonly LayoutSlot[],
  project: PrintProject,
  pageSize: Size,
  includePreviewOverlays = false,
): DrawOp[] {
  const settings = normalizeSettings(project.settings);
  const cards = new Map(project.cards.map((c) => [c.id, c]));
  const pageRect: Rect = { x: 0, y: 0, width: pageSize.width, height: pageSize.height };
  const ops: DrawOp[] = [{ kind: 'fillRect', rect: pageRect, color: WHITE }];

  for (const slot of slots) {
    const card = cards.get(slot.cardID);
    if (!card) continue;
    const fileName = slot.isFront ? card.frontImageFileName : card.backImageFileName;
    if (fileName === undefined) continue;
    ops.push({
      kind: 'image',
      source: fileName,
      rect: slot.rect,
      fit: { kind: 'card', placement: slot.isFront ? card.frontPlacement : card.backPlacement },
      mirrorX: !slot.isFront && settings.flipBackHorizontally,
      mirrorY: !slot.isFront && settings.flipBackVertically,
    });
  }

  if (includePreviewOverlays && settings.showSafeAreaInPreview) {
    const inset = mmToPoints(Math.max(0, settings.safeAreaMM));
    for (const slot of slots) {
      ops.push({
        kind: 'strokeRect',
        rect: insetBy(slot.rect, inset, inset),
        stroke: { width: 0.7, color: SYSTEM_GREEN, alpha: 0.7, dash: [4, 3] },
      });
    }
  }

  // Marks belong in the whitespace: an even-odd clip keeps them off every card.
  const marks: DrawOp[] = [];
  if (settings.showRegistrationMarks) {
    marks.push({
      kind: 'path',
      segments: registrationMarkSegments(pageSize),
      stroke: REGISTRATION_STROKE,
    });
  }
  if (settings.showCropMarks) {
    for (const slot of slots) {
      marks.push({ kind: 'path', segments: cropMarkSegments(slot.rect), stroke: CROP_STROKE });
    }
  }
  if (marks.length > 0) {
    ops.push({
      kind: 'clip',
      rects: [pageRect, ...slots.map((s) => s.rect)],
      evenOdd: true,
      ops: marks,
    });
  }
  return ops;
}
