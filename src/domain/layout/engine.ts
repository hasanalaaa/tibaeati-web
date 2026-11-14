import { union, type Rect, type Size } from '../geometry';
import { randomId, type NewId } from '../ids';
import { cardHasAnyImage, type CardEntry } from '../models/cardEntry';
import type { PrintProject } from '../models/printProject';
import { PAPER_SIZES, duplexCalibration, type ProjectSettings } from '../models/projectSettings';
import { LOCKED_TEMPLATES, exactSizePoints, type CardKind } from '../templates';
import { intDiv, micrometresToPoints, millimetresToMicrometres } from '../units';
import { normalizeCards, normalizeSettings } from '../validation/normalize';
import { duplexBackRect, recoverFrontRect, rectDeviationMM } from './duplex';
import type { GeneratedLayout, LayoutSlot } from './types';

/** Integer micrometres; converted to points only when a rectangle is emitted. */
interface MetricSize {
  readonly width: number;
  readonly height: number;
}

interface MetricRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface FlowingSheet {
  readonly cards: readonly CardEntry[];
  readonly rectangles: readonly Rect[];
  readonly verticalGap: number;
}

const sizePoints = (s: MetricSize): Size => ({
  width: micrometresToPoints(s.width),
  height: micrometresToPoints(s.height),
});

const rectPoints = (r: MetricRect): Rect => ({
  x: micrometresToPoints(r.x),
  y: micrometresToPoints(r.y),
  width: micrometresToPoints(r.width),
  height: micrometresToPoints(r.height),
});

const width = (kind: CardKind): number => LOCKED_TEMPLATES[kind].widthMicrometres;
const height = (kind: CardKind): number => LOCKED_TEMPLATES[kind].heightMicrometres;
const maxOf = (values: readonly number[], fallback: number): number =>
  values.length === 0 ? fallback : Math.max(...values);

/**
 * Deterministic physical layout. Cards are placed from integer micrometres; each back slot is
 * derived from its front slot through one duplex transform, so front and back never drift.
 */
export function buildLayout(project: PrintProject, newId: NewId = randomId): GeneratedLayout {
  const settings = normalizeSettings(project.settings);
  const sizeMM = PAPER_SIZES[settings.paperSize].sizeMM;
  const page: MetricSize = {
    width: millimetresToMicrometres(sizeMM.width),
    height: millimetresToMicrometres(sizeMM.height),
  };
  const pageSize = sizePoints(page);
  const requestedContent = makeContentMetric(page, settings);
  const cards = orderedCards(normalizeCards(project.cards, newId));

  if (cards.length === 0) {
    return {
      pageSize,
      contentRect: rectPoints(requestedContent),
      frontPages: [],
      backPages: [],
      registrationReport: {
        pairedCardCount: 0,
        maximumDigitalDeviationMM: 0,
        effectiveHorizontalGapMM: settings.horizontalGapMM,
        effectiveVerticalGapMM: settings.verticalGapMM,
        appliedCalibration: duplexCalibration(settings),
        usedLockedTemplate: settings.lockCardTemplate,
      },
    };
  }

  const horizontalGap = Math.max(0, millimetresToMicrometres(settings.horizontalGapMM));
  const verticalGap = Math.max(0, millimetresToMicrometres(settings.verticalGapMM));
  const sheets = flowingSheets(cards, page, requestedContent, horizontalGap, verticalGap, settings);
  const frontPages: LayoutSlot[][] = [];
  const backPages: LayoutSlot[][] = [];
  let maximumDeviationMM = 0;
  sheets.forEach((sheet, sheetIndex) => {
    const pair = buildPairedSlots(sheet, pageSize, settings, sheetIndex);
    frontPages.push(pair.front);
    backPages.push(pair.back);
    maximumDeviationMM = Math.max(maximumDeviationMM, pair.maximumDeviationMM);
  });

  // Like `CGRect.null.union(first)`, the first rectangle is taken as-is, not recomputed.
  const firstPage = frontPages[0] ?? [];
  const firstRect = firstPage[0]?.rect;
  const effectiveContent = firstRect
    ? firstPage.slice(1).reduce((partial, slot) => union(partial, slot.rect), firstRect)
    : rectPoints(requestedContent);

  return {
    pageSize,
    contentRect: effectiveContent,
    frontPages,
    backPages,
    registrationReport: {
      pairedCardCount: frontPages.reduce((sum, p) => sum + p.length, 0),
      maximumDigitalDeviationMM: maximumDeviationMM,
      effectiveHorizontalGapMM: horizontalGap / 1_000,
      effectiveVerticalGapMM:
        (sheets.length === 0 ? verticalGap : Math.min(...sheets.map((s) => s.verticalGap))) / 1_000,
      appliedCalibration: duplexCalibration(settings),
      usedLockedTemplate: settings.lockCardTemplate,
    },
  };
}

const KIND_RANK: Readonly<Record<CardKind, number>> = { unified: 0, housing: 1 };

function orderedCards(cards: readonly CardEntry[]): CardEntry[] {
  // Swift compares `UUID.uuidString`, which is upper-case.
  return cards.filter(cardHasAnyImage).sort((a, b) => {
    if (a.kind !== b.kind) return KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (a.order !== b.order) return a.order - b.order;
    const ia = a.id.toUpperCase();
    const ib = b.id.toUpperCase();
    return ia < ib ? -1 : ia > ib ? 1 : 0;
  });
}

function makeContentMetric(page: MetricSize, settings: ProjectSettings): MetricRect {
  const leading = millimetresToMicrometres(settings.marginLeadingMM);
  const trailing = millimetresToMicrometres(settings.marginTrailingMM);
  const top = millimetresToMicrometres(settings.marginTopMM);
  const bottom = millimetresToMicrometres(settings.marginBottomMM);
  return {
    x: leading,
    y: top,
    width: Math.max(0, page.width - leading - trailing),
    height: Math.max(0, page.height - top - bottom),
  };
}

/**
 * Rows continue across card kinds. A row reserves its tallest card's height; each sheet
 * reserves its widest card's column width. No gap or card is shrunk.
 */
function flowingSheets(
  cards: readonly CardEntry[],
  page: MetricSize,
  content: MetricRect,
  horizontalGap: number,
  verticalGap: number,
  settings: ProjectSettings,
): FlowingSheet[] {
  const widest = maxOf(
    cards.map((c) => width(c.kind)),
    0,
  );
  const tallest = maxOf(
    cards.map((c) => height(c.kind)),
    0,
  );
  let available = content;
  // Preserve the physical-page fallback for impossible A4 margins.
  if (settings.paperSize === 'a4' && (content.width < widest || content.height < tallest)) {
    available = { x: 0, y: 0, width: page.width, height: page.height };
  }
  if (widest <= 0 || available.width < widest || available.height < tallest) return [];
  const fittingColumns = intDiv(available.width + horizontalGap, widest + horizontalGap);
  const columns = settings.paperSize === 'a4' ? Math.min(2, fittingColumns) : fittingColumns;
  if (columns <= 0) return [];

  const sheets: FlowingSheet[] = [];
  let rows: CardEntry[][] = [];
  let usedHeight = 0;
  const rowHeight = (row: readonly CardEntry[]): number =>
    maxOf(
      row.map((c) => height(c.kind)),
      0,
    );

  const finishSheet = (): void => {
    if (rows.length === 0) return;
    const columnWidth = maxOf(
      rows.flat().map((c) => width(c.kind)),
      widest,
    );
    const gridWidth = columns * columnWidth + (columns - 1) * horizontalGap;
    const originX = available.x + intDiv(available.width - gridWidth, 2);
    const heights = rows.map(rowHeight);
    const nextRowHeight = heights.at(-1) ?? 0;
    // Fill only a sheet that cannot accept another row at the requested gap.
    // Sparse sheets stay at the top with normal spacing.
    const full = usedHeight + verticalGap + nextRowHeight > available.height;
    const rowGap =
      full && rows.length > 1
        ? Math.max(
            verticalGap,
            intDiv(available.height - heights.reduce((a, b) => a + b, 0), rows.length - 1),
          )
        : verticalGap;
    let y = available.y;
    const pageCards: CardEntry[] = [];
    const rectangles: Rect[] = [];
    for (const row of rows) {
      row.forEach((card, index) => {
        const template = LOCKED_TEMPLATES[card.kind];
        const column = columns - 1 - index;
        // Align each card to the outside of its column. Larger Housing cards expand towards
        // the centre only into reserved whitespace.
        const inset = column === 0 ? 0 : columnWidth - template.widthMicrometres;
        const x = originX + column * (columnWidth + horizontalGap) + inset;
        const size = exactSizePoints(template);
        rectangles.push({
          x: micrometresToPoints(x),
          y: micrometresToPoints(y),
          width: size.width,
          height: size.height,
        });
        pageCards.push(card);
      });
      y += rowHeight(row) + rowGap;
    }
    sheets.push({ cards: pageCards, rectangles, verticalGap: rowGap });
    rows = [];
    usedHeight = 0;
  };

  for (let offset = 0; offset < cards.length; offset += columns) {
    const row = cards.slice(offset, Math.min(offset + columns, cards.length));
    const thisRowHeight = rowHeight(row);
    const precedingGap = rows.length === 0 ? 0 : verticalGap;
    if (usedHeight + precedingGap + thisRowHeight > available.height) finishSheet();
    usedHeight += (rows.length === 0 ? 0 : verticalGap) + thisRowHeight;
    rows.push(row);
  }
  finishSheet();
  return sheets;
}

function buildPairedSlots(
  sheet: FlowingSheet,
  pageSize: Size,
  settings: ProjectSettings,
  sheetIndex: number,
): { front: LayoutSlot[]; back: LayoutSlot[]; maximumDeviationMM: number } {
  const front: LayoutSlot[] = [];
  const back: LayoutSlot[] = [];
  let maximumDeviationMM = 0;
  const edge = settings.duplexBindingEdge;
  const calibration = duplexCalibration(settings);

  sheet.cards.forEach((card, index) => {
    const frontRect = sheet.rectangles[index];
    if (!frontRect) throw new Error('Layout invariant: every card has a rectangle');
    const backRect = duplexBackRect(frontRect, pageSize, edge, calibration);
    const recoveredFront = recoverFrontRect(backRect, pageSize, edge, calibration);
    maximumDeviationMM = Math.max(maximumDeviationMM, rectDeviationMM(frontRect, recoveredFront));

    const common = { cardID: card.id, kind: card.kind, sheetIndex, slotIndex: index };
    front.push({
      ...common,
      pageIndex: sheetIndex * 2,
      rect: frontRect,
      nominalFrontRect: frontRect,
      isFront: true,
    });
    back.push({
      ...common,
      pageIndex: sheetIndex * 2 + 1,
      rect: backRect,
      nominalFrontRect: frontRect,
      isFront: false,
    });
  });
  return { front, back, maximumDeviationMM };
}
