import { containsRect, intersects } from '../geometry';
import {
  createDocumentJob,
  type DocumentJob,
  type DocumentPage,
  type DocumentTemplate,
} from '../models/documentJob';
import { expectNear } from '../testFixtures';
import { pointsToMM } from '../units';
import {
  DocumentLayoutError,
  documentPageOps,
  documentPlan,
  documentPrintLayout,
  originalPdfPageSize,
} from './layout';

const imagePage = (fileName = 'fixture.jpg'): DocumentPage => ({
  id: crypto.randomUUID(),
  source: { kind: 'image', fileName },
  quarterTurns: 0,
  placement: { scale: 1, offsetX: 0, offsetY: 0 },
  fillFrame: false,
});

const job = (template: DocumentTemplate, patch: Partial<DocumentJob> = {}): DocumentJob => ({
  ...createDocumentJob(template),
  pages: [imagePage()],
  ...patch,
});

// Port of DocumentStudioTests.swift (layout parts).
describe('DocumentPrintLayout', () => {
  it('keeps passport and licence sizes exact and never scales to fit', () => {
    const cases: [DocumentTemplate, number, number, number][] = [
      ['passportData', 125, 88, 3],
      ['passportOpenPortrait', 125, 176, 1],
      ['passportOpenLandscape', 176, 125, 2],
      ['drivingLicense', 86, 54, 8],
    ];
    for (const [template, width, height, capacity] of cases) {
      const layout = documentPrintLayout(job(template, { copies: 9 }), 'a4');
      expect(layout.pages[0]).toHaveLength(capacity);
      expect(layout.pages.flat()).toHaveLength(9);
      const page = { x: 0, y: 0, ...layout.pageSize };
      for (const slots of layout.pages) {
        slots.forEach((slot, index) => {
          expectNear(pointsToMM(slot.rect.width), width, 0.000_001);
          expectNear(pointsToMM(slot.rect.height), height, 0.000_001);
          expect(containsRect(page, slot.rect)).toBe(true);
          for (const other of slots.slice(index + 1)) expect(intersects(slot.rect, other.rect)).toBe(false);
        });
      }
    }
  });

  it('fills right to left, centred horizontally, from the top margin', () => {
    const layout = documentPrintLayout(job('drivingLicense', { copies: 2 }), 'a4');
    const [first, second] = layout.pages[0] ?? [];
    // Two 86 mm columns with a 6 mm gap, centred on 210 mm: left edge 16 mm.
    expectNear(pointsToMM(first?.rect.x ?? 0), 16 + 86 + 6, 1e-9);
    expectNear(pointsToMM(second?.rect.x ?? 0), 16, 1e-9);
    expectNear(pointsToMM(first?.rect.y ?? 0), 10, 1e-9);
  });

  it('fails instead of silently shrinking an oversized template', () => {
    expect(() =>
      documentPrintLayout(job('custom', { customWidthMM: 300, customHeightMM: 400 }), 'a4'),
    ).toThrow(DocumentLayoutError);
  });

  it('bounds copies and rejects invalid custom dimensions', () => {
    expect(() => documentPrintLayout(job('custom', { customWidthMM: Number.NaN }), 'a4')).toThrow(
      DocumentLayoutError,
    );
    expect(() => documentPrintLayout(job('custom', { copies: 201 }), 'a4')).toThrow(DocumentLayoutError);
  });

  it('uses landscape paper when asked', () => {
    const layout = documentPrintLayout(job('passportOpenLandscape', { landscapePaper: true }), 'a4');
    expectNear(pointsToMM(layout.pageSize.width), 297, 1e-9);
  });
});

describe('original PDF page sizes', () => {
  it('swaps for odd source or user quarter turns', () => {
    const page = { cropBox: { width: 600, height: 400 }, rotation: 0 };
    expect(originalPdfPageSize(page, 0)).toEqual({ width: 600, height: 400 });
    expect(originalPdfPageSize(page, 1)).toEqual({ width: 400, height: 600 });
    expect(originalPdfPageSize({ ...page, rotation: 90 }, 1)).toEqual({ width: 600, height: 400 });
    expect(originalPdfPageSize({ ...page, rotation: 270 }, 0)).toEqual({ width: 400, height: 600 });
  });

  it('plans one page per source page and copy, PDF pages only', () => {
    const pdf = (page: number, quarterTurns: 0 | 1 = 0): DocumentPage => ({
      ...imagePage(),
      source: { kind: 'pdf', fileName: 'a.pdf', page },
      quarterTurns,
    });
    const source = (_: string, page: number) =>
      page === 1 ? { cropBox: { width: 300, height: 500 }, rotation: 0 } : { cropBox: { width: 600, height: 400 }, rotation: 0 };
    const plan = documentPlan(job('a4', { originalPDFPages: true, copies: 2, pages: [pdf(1), pdf(2, 1)] }), 'a4', source);
    expect(plan.sizes).toEqual([
      { width: 300, height: 500 },
      { width: 400, height: 600 },
      { width: 300, height: 500 },
      { width: 400, height: 600 },
    ]);
    expect(plan.pages[1]).toEqual([{ pageIndex: 1, rect: { x: 0, y: 0, width: 400, height: 600 } }]);
    expect(() => documentPlan(job('a4', { originalPDFPages: true }), 'a4', source)).toThrow(DocumentLayoutError);
    expect(() => documentPlan(job('a4', { originalPDFPages: true, pages: [pdf(9)] }), 'a4', () => undefined)).toThrow(
      DocumentLayoutError,
    );
  });

  it('draws images, PDF pages and the optional 0.15 mm border inside the slot', () => {
    const j = job('passportData', { showBorder: true });
    const layout = documentPrintLayout(j, 'a4');
    const ops = documentPageOps(j, layout.pages[0] ?? [], layout.pageSize);
    expect(ops.map((o) => o.kind)).toEqual(['fillRect', 'image', 'strokeRect']);
    const border = ops[2];
    expect(border?.kind === 'strokeRect' && pointsToMM(border.stroke.width)).toBeCloseTo(0.15, 12);
  });
});
