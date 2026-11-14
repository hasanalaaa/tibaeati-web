import { BLACK, WHITE, type DrawOp } from '../calibration/sheetPrimitives';
import { insetBy, type Rect, type Size } from '../geometry';
import { DEFAULT_PLACEMENT } from '../models/cardImagePlacement';
import { documentJobSizeMM, type DocumentJob } from '../models/documentJob';
import { PAPER_SIZES, type PaperSizeOption } from '../models/projectSettings';
import { mmToPoints, pageSizePoints } from '../units';

/** i18n keys for document layout failures (the app dictionaries must define them). */
export type DocumentLayoutErrorKey =
  | 'documents.error.invalidDimensions'
  | 'documents.error.doesNotFit'
  | 'documents.error.pageLimit'
  | 'documents.error.originalPdfOnly'
  | 'documents.error.unreadablePdf';

export class DocumentLayoutError extends Error {
  readonly key: DocumentLayoutErrorKey;
  readonly fileName: string | undefined;

  constructor(key: DocumentLayoutErrorKey, fileName?: string) {
    super(key);
    this.name = 'DocumentLayoutError';
    this.key = key;
    this.fileName = fileName;
  }
}

export interface DocumentSlot {
  /** Index into `job.pages`. */
  readonly pageIndex: number;
  readonly rect: Rect;
}

export interface DocumentPlan {
  /** One size per output page (all equal unless original PDF sizes are kept). */
  readonly sizes: readonly Size[];
  readonly pages: readonly (readonly DocumentSlot[])[];
}

const MAX_PAGES = 100;
const MAX_COPIES = 200;
const MAX_OUTPUT = 200;
const EPSILON = 0.000_001;

const inRange = (v: number, low: number, high: number): boolean =>
  Number.isFinite(v) && v >= low && v <= high;

function checkCounts(job: DocumentJob): void {
  if (
    !Number.isInteger(job.copies) ||
    job.copies < 1 ||
    job.copies > MAX_COPIES ||
    job.pages.length > MAX_PAGES ||
    job.pages.length * job.copies > MAX_OUTPUT
  ) {
    throw new DocumentLayoutError('documents.error.pageLimit');
  }
}

/**
 * DocumentJob.swift `DocumentPrintLayout`: actual-size copies in a right-to-left grid, never scaled
 * to fit. Throws `DocumentLayoutError` instead of shrinking.
 */
export function documentPrintLayout(
  job: DocumentJob,
  paper: PaperSizeOption,
): { readonly pageSize: Size; readonly pages: readonly (readonly DocumentSlot[])[] } {
  const size = documentJobSizeMM(job);
  if (
    !inRange(size.width, 10, 420) ||
    !inRange(size.height, 10, 420) ||
    !inRange(job.marginMM, 0, 40) ||
    !inRange(job.gapMM, 0, 30)
  ) {
    throw new DocumentLayoutError('documents.error.invalidDimensions');
  }
  checkCounts(job);
  const paperMM = PAPER_SIZES[paper].sizeMM;
  const sheet = job.landscapePaper ? { width: paperMM.height, height: paperMM.width } : paperMM;
  const pageSize = pageSizePoints(sheet.width, sheet.height);
  const available = {
    width: sheet.width - 2 * job.marginMM,
    height: sheet.height - 2 * job.marginMM,
  };
  if (size.width > available.width + EPSILON || size.height > available.height + EPSILON) {
    throw new DocumentLayoutError('documents.error.doesNotFit');
  }
  // Swift `Int(...)` truncates; the 1e-7 absorbs representation error at exact fits.
  const columns = Math.min(
    10,
    Math.max(1, Math.trunc((available.width + job.gapMM) / (size.width + job.gapMM) + 0.000_000_1)),
  );
  const rows = Math.min(
    20,
    Math.max(
      1,
      Math.trunc((available.height + job.gapMM) / (size.height + job.gapMM) + 0.000_000_1),
    ),
  );
  const capacity = Math.max(1, columns * rows);
  const gridWidth = columns * size.width + (columns - 1) * job.gapMM;
  const left = (sheet.width - gridWidth) / 2;
  const pages: DocumentSlot[][] = [];
  const total = job.pages.length * job.copies;
  for (let index = 0; index < total; index += 1) {
    const cell = index % capacity;
    if (cell === 0) pages.push([]);
    const column = columns - 1 - (cell % columns);
    const row = Math.trunc(cell / columns);
    pages[pages.length - 1]?.push({
      pageIndex: index % job.pages.length,
      rect: {
        x: mmToPoints(left + column * (size.width + job.gapMM)),
        y: mmToPoints(job.marginMM + row * (size.height + job.gapMM)),
        width: mmToPoints(size.width),
        height: mmToPoints(size.height),
      },
    });
  }
  return { pageSize, pages };
}

/** A source page's crop box size (points) and its `/Rotate` in degrees. */
export interface SourcePdfPage {
  readonly cropBox: Size;
  readonly rotation: number;
}

/** Output page size for "original PDF size" mode: the crop box, turned by source and user rotation. */
export function originalPdfPageSize(page: SourcePdfPage, quarterTurns: number): Size {
  const sourceRotation = ((Math.trunc(page.rotation / 90) % 2) + 2) % 2;
  const rotated = ((((quarterTurns % 4) + 4) % 4) + sourceRotation) % 2 !== 0;
  return rotated ? { width: page.cropBox.height, height: page.cropBox.width } : page.cropBox;
}

/**
 * DocumentPrintService.plan. `sourcePage(fileName, pageNumber)` returns the source page geometry
 * for original-size mode, or undefined when the page cannot be read.
 */
export function documentPlan(
  job: DocumentJob,
  paper: PaperSizeOption,
  sourcePage: (fileName: string, pageNumber: number) => SourcePdfPage | undefined,
): DocumentPlan {
  if (!job.originalPDFPages) {
    const layout = documentPrintLayout(job, paper);
    return { sizes: layout.pages.map(() => layout.pageSize), pages: layout.pages };
  }
  checkCounts(job);
  const sizes: Size[] = [];
  const pages: DocumentSlot[][] = [];
  for (let copy = 0; copy < job.copies; copy += 1) {
    job.pages.forEach((entry, index) => {
      if (entry.source.kind !== 'pdf')
        throw new DocumentLayoutError('documents.error.originalPdfOnly');
      const source = sourcePage(entry.source.fileName, entry.source.page);
      if (!source)
        throw new DocumentLayoutError('documents.error.originalPdfOnly', entry.source.fileName);
      const size = originalPdfPageSize(source, entry.quarterTurns);
      if (!(inRange(size.width, EPSILON, 10_000) && inRange(size.height, EPSILON, 10_000))) {
        throw new DocumentLayoutError('documents.error.unreadablePdf', entry.source.fileName);
      }
      sizes.push(size);
      pages.push([
        { pageIndex: index, rect: { x: 0, y: 0, width: size.width, height: size.height } },
      ]);
    });
  }
  return { sizes, pages };
}

/** DocumentPrintService.draw as primitives for one output page. */
export function documentPageOps(
  job: DocumentJob,
  slots: readonly DocumentSlot[],
  pageSize: Size,
): DrawOp[] {
  const ops: DrawOp[] = [
    {
      kind: 'fillRect',
      rect: { x: 0, y: 0, width: pageSize.width, height: pageSize.height },
      color: WHITE,
    },
  ];
  const borderInset = mmToPoints(0.075);
  for (const slot of slots) {
    const entry = job.pages[slot.pageIndex];
    if (!entry) continue;
    const turns = ((entry.quarterTurns % 4) + 4) % 4;
    if (entry.source.kind === 'image') {
      ops.push({
        kind: 'image',
        source: entry.source.fileName,
        rect: slot.rect,
        fit: {
          kind: 'document',
          fillFrame: entry.fillFrame,
          placement: entry.fillFrame ? entry.placement : DEFAULT_PLACEMENT,
          quarterTurns: turns,
        },
        mirrorX: false,
        mirrorY: false,
      });
    } else {
      ops.push({
        kind: 'pdfPage',
        source: entry.source.fileName,
        pageNumber: entry.source.page,
        rect: slot.rect,
        quarterTurns: turns,
      });
    }
    if (job.showBorder) {
      ops.push({
        kind: 'strokeRect',
        rect: insetBy(slot.rect, borderInset, borderInset),
        stroke: { width: mmToPoints(0.15), color: BLACK, alpha: 1 },
      });
    }
  }
  return ops;
}
