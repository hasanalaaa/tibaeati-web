// @vitest-environment node
import { DomainError } from '@/domain/errors';
import { maxX, maxY, midY, type Point, type Rect } from '@/domain/geometry';
import { buildLayout } from '@/domain/layout/engine';
import type { LayoutSlot } from '@/domain/layout/types';
import type { CardEntry } from '@/domain/models/cardEntry';
import {
  DUPLEX_BINDING_EDGES,
  defaultProjectSettings,
  type ProjectSettings,
} from '@/domain/models/projectSettings';
import { applyPrinterProfile } from '@/domain/printers/profiles';
import { CARD_KINDS } from '@/domain/templates';
import { card, makeProject } from '@/domain/testFixtures';
import type { ProjectMode } from '@/domain/modes';
import { toPdfRect } from './coords';
import { exportProjectPdf } from './export';
import { cardPageOps } from './pagePlan';
import { imageAt, inspectPdf, mmToPdfPoint, solidPng, type InspectedPage } from './testPdf';

/**
 * Port of `PDFRegistrationTests` (LayoutEngineGoldenTests.swift:291-541). Swift rasterises the PDF
 * and reads pixels; Node has no PDF rasteriser, so these tests read the content stream instead:
 * each card image is a solid-colour XObject, and a sample point "has" a colour when it lies inside
 * that image's drawn rectangle. A point inside no image is white page background.
 */

const mocks = vi.hoisted(() => ({
  calls: [] as { sizePt: { width: number; height: number }; dpi: number }[],
}));

vi.mock('../image/render', () => ({
  renderImageContent: async (request: {
    source: Blob;
    sizePt: { width: number; height: number };
    dpi: number;
  }) => {
    mocks.calls.push({ sizePt: request.sizePt, dpi: request.dpi });
    const rgb = (await request.source.text()).split(',').map(Number) as [number, number, number];
    return { blob: new Blob([solidPng(rgb)]), pixelWidth: 4, pixelHeight: 4, dpi: request.dpi, reduced: false };
  },
  textToPng: () => Promise.reject(new Error('not used')),
}));

const RED = [255, 0, 0] as const;
const GREEN = [0, 255, 0] as const;
const BLUE = [0, 0, 255] as const;
const ORANGE = [255, 128, 0] as const;
const YELLOW = [255, 255, 0] as const;
const COLORS = [RED, GREEN, BLUE, ORANGE];
const MM = 72 / 25.4;
/** 0.001 mm in points: the N2 precision requirement. */
const TOLERANCE_PT = 0.001 * MM;

const files = new Map<string, string>();
const deps = {
  loadBlob: (name: string): Promise<Blob | undefined> =>
    Promise.resolve(files.has(name) ? new Blob([files.get(name) ?? '']) : undefined),
};

function fixture(bleed = 0, marks = false): { cards: CardEntry[]; settings: ProjectSettings } {
  files.clear();
  const cards = Array.from({ length: 12 }, (_, index) => {
    const name = `card-${index}.jpg`;
    files.set(name, (COLORS[index % 4] ?? RED).join(','));
    return card('unified', index, name, name);
  });
  const settings: ProjectSettings = {
    ...defaultProjectSettings(),
    bleedMM: bleed,
    showCropMarks: marks,
    showRegistrationMarks: marks,
    autoOptimizeForPrinter: false,
  };
  return { cards, settings };
}

const colorAt = (page: InspectedPage, p: Point): readonly number[] =>
  imageAt(page, p)?.rgb ?? [255, 255, 255];

const pdfPoint = (p: Point, pageHeight: number): Point => ({ x: p.x, y: pageHeight - p.y });

function expectRect(actual: Rect, expected: Rect): void {
  expect(Math.abs(actual.x - expected.x)).toBeLessThan(TOLERANCE_PT);
  expect(Math.abs(actual.y - expected.y)).toBeLessThan(TOLERANCE_PT);
  expect(Math.abs(actual.width - expected.width)).toBeLessThan(TOLERANCE_PT);
  expect(Math.abs(actual.height - expected.height)).toBeLessThan(TOLERANCE_PT);
}

async function exported(mode: ProjectMode, cards: CardEntry[], settings: ProjectSettings) {
  const project = makeProject(mode, cards, settings, 'Precision fixture');
  const layout = buildLayout(project);
  const pdf = await inspectPdf(await exportProjectPdf(project, layout, deps));
  return { project, layout, pdf };
}

beforeEach(() => {
  mocks.calls.length = 0;
});

describe('PDFRegistrationTests', () => {
  it('pairs identity and positions for both edges and partial sheets', async () => {
    const { cards, settings } = fixture();
    for (const edge of DUPLEX_BINDING_EDGES) {
      const { pdf } = await exported('unifiedOnly', cards, { ...settings, duplexBindingEdge: edge });
      expect(pdf.pages).toHaveLength(4);
      for (const sheet of [0, 1]) {
        const front = pdf.pages[sheet * 2];
        const back = pdf.pages[sheet * 2 + 1];
        if (!front || !back) throw new Error('missing page');
        const h = front.mediaBox.height;
        const count = sheet === 0 ? 8 : 4;
        for (let index = 0; index < count; index += 1) {
          // Frozen A4 balanced geometry, independently of the layout engine.
          const x = index % 2 === 0 ? 108 : 16.4;
          const y = 10 + Math.trunc(index / 2) * (sheet === 0 ? 74.34 : 59.98);
          const point = mmToPdfPoint(x + 10, y + 10, h);
          const backPoint = mmToPdfPoint(
            edge === 'longEdge' ? 210 - x - 85.6 + 10 : x + 10,
            edge === 'shortEdge' ? 297 - y - 53.98 + 10 : y + 10,
            h,
          );
          const expected = COLORS[(sheet * 8 + index) % 4];
          expect(colorAt(front, point)).toEqual(expected);
          expect(colorAt(back, backPoint)).toEqual(expected);
        }
      }
    }
    // Front and back share one file and placement: each card image is embedded once.
    expect(mocks.calls).toHaveLength(12 * 2);
  });

  it('draws every image exactly on its domain slot rect (< 0.001 mm), front then back', async () => {
    const { cards, settings } = fixture();
    for (const flip of [false, true]) {
      const { layout, pdf } = await exported('unifiedOnly', cards, {
        ...settings,
        flipBackHorizontally: flip,
        backOffsetXMM: 0.7,
        backOffsetYMM: -0.4,
        backScaleX: 1.002,
      });
      const sequence = layout.frontPages.flatMap((f, i) => [f, layout.backPages[i] ?? []]);
      expect(pdf.pages).toHaveLength(sequence.length);
      sequence.forEach((slots: readonly LayoutSlot[], pageIndex) => {
        const page = pdf.pages[pageIndex];
        if (!page) throw new Error('missing page');
        const images = page.draws.filter((d) => d.subtype === 'Image');
        expect(images).toHaveLength(slots.length);
        slots.forEach((slot, i) => {
          const draw = images[i];
          if (!draw) throw new Error('missing draw');
          expectRect(draw.bounds, toPdfRect(slot.rect, page.mediaBox.height));
          const mirrored = flip && !slot.isFront;
          // Mirror about the slot centre: negative x scale, origin moved to the right edge.
          expect(draw.matrix[0] < 0).toBe(mirrored);
        });
      });
    }
    expect(mocks.calls.every((c) => c.dpi === 300)).toBe(true);
  });

  it('keeps large bleed and marks off the adjacent card', async () => {
    const { cards, settings } = fixture(10, true);
    const { project, layout, pdf } = await exported('unifiedOnly', cards, settings);
    const slots = layout.frontPages[0] ?? [];
    const first = slots[0]?.rect;
    const left = slots[1]?.rect;
    const page = pdf.pages[0];
    if (!first || !left || !page) throw new Error('fixture');
    const h = page.mediaBox.height;
    expect(colorAt(page, pdfPoint({ x: first.x + 1, y: first.y + 12 }, h))).toEqual(RED);
    const gap = pdfPoint({ x: (first.x + maxX(left)) / 2, y: midY(first) }, h);
    expect(colorAt(page, gap)).toEqual([255, 255, 255]);
    // Marks are drawn inside an even-odd clip that excludes every card rectangle.
    const ops = cardPageOps(slots, project, layout.pageSize);
    const clip = ops.find((op) => op.kind === 'clip');
    expect(clip?.kind === 'clip' && clip.evenOdd).toBe(true);
    expect(clip?.kind === 'clip' ? clip.rects.slice(1) : []).toEqual(slots.map((s) => s.rect));
    expect(page.content).toContain('W*');
  });

  it('stops artwork at the exact card edges even with legacy printer bleed', async () => {
    for (const kind of CARD_KINDS) {
      const { settings } = fixture(2.1);
      const one = [card(kind, 0, 'card-0.jpg', 'card-0.jpg')];
      const { layout, pdf } = await exported(
        kind === 'unified' ? 'unifiedOnly' : 'housingOnly',
        one,
        settings,
      );
      for (const index of [0, 1]) {
        const rect = (index === 0 ? layout.frontPages : layout.backPages)[0]?.[0]?.rect;
        const page = pdf.pages[index];
        if (!rect || !page) throw new Error('fixture');
        const h = page.mediaBox.height;
        expect(colorAt(page, pdfPoint({ x: rect.x + 2, y: rect.y + 12 }, h))).toEqual(RED);
        for (const p of [
          { x: rect.x - 2, y: midY(rect) },
          { x: maxX(rect) + 2, y: midY(rect) },
          { x: rect.x + rect.width / 2, y: rect.y - 2 },
          { x: rect.x + rect.width / 2, y: maxY(rect) + 2 },
        ]) {
          expect(colorAt(page, pdfPoint(p, h))).toEqual([255, 255, 255]);
        }
      }
    }
  });

  it('has no automatic guides in a normal preview and clean defaults', () => {
    const { cards, settings } = fixture();
    const project = makeProject('unifiedOnly', cards, { ...settings, showSafeAreaInPreview: false });
    const layout = buildLayout(project);
    const slots = layout.frontPages[0] ?? [];
    expect(cardPageOps(slots, project, layout.pageSize, true)).toEqual(
      cardPageOps(slots, project, layout.pageSize, false),
    );
    const defaults = defaultProjectSettings();
    expect(defaults.showCropMarks).toBe(false);
    expect(defaults.showRegistrationMarks).toBe(false);
    expect(defaults.showSafeAreaInPreview).toBe(false);
    expect(applyPrinterProfile(defaults, 'brotherDCPT720DW').showCropMarks).toBe(false);
    // Opted in, the guide is the dashed green safe-area inset, preview only.
    const guided = makeProject('unifiedOnly', cards, { ...settings, showSafeAreaInPreview: true });
    const withGuides = cardPageOps(slots, guided, layout.pageSize, true);
    const guide = withGuides.find((op) => op.kind === 'strokeRect');
    expect(guide?.kind === 'strokeRect' && guide.stroke.dash).toEqual([4, 3]);
    expect(cardPageOps(slots, guided, layout.pageSize, false).some((op) => op.kind === 'strokeRect')).toBe(
      false,
    );
  });

  it('continues housing cards on the left after three unified cards, for both edges', async () => {
    const { cards, settings } = fixture();
    files.set('housing.jpg', YELLOW.join(','));
    const mixed = [
      ...cards.slice(0, 3),
      ...[0, 1, 2].map((order) => card('housing', order, 'housing.jpg', 'housing.jpg')),
    ];
    // Independently calculated millimetre geometry (Swift test, lines 447-456).
    const rectangles: Rect[] = [
      { x: 112.4, y: 10, width: 85.6, height: 53.98 },
      { x: 12, y: 10, width: 85.6, height: 53.98 },
      { x: 112.4, y: 69.98, width: 85.6, height: 53.98 },
      { x: 12, y: 69.98, width: 90, height: 60 },
      { x: 108, y: 135.98, width: 90, height: 60 },
      { x: 12, y: 135.98, width: 90, height: 60 },
    ];
    const colors = [RED, GREEN, BLUE, YELLOW, YELLOW, YELLOW];
    for (const edge of DUPLEX_BINDING_EDGES) {
      const { pdf } = await exported('mixed', mixed, { ...settings, duplexBindingEdge: edge });
      expect(pdf.pages).toHaveLength(2);
      const [front, back] = pdf.pages;
      if (!front || !back) throw new Error('pages');
      const h = front.mediaBox.height;
      rectangles.forEach((r, index) => {
        const frontPoint = mmToPdfPoint(r.x + 10, r.y + 10, h);
        const backPoint = mmToPdfPoint(
          edge === 'longEdge' ? 210 - maxX(r) + 10 : r.x + 10,
          edge === 'shortEdge' ? 297 - maxY(r) + 10 : r.y + 10,
          h,
        );
        expect(colorAt(front, frontPoint)).toEqual(colors[index]);
        expect(colorAt(back, backPoint)).toEqual(colors[index]);
      });
      for (const [x, y] of [
        [5, 5],
        [107.2, 74],
        [20, 132.98],
      ] as const) {
        expect(colorAt(front, mmToPdfPoint(x, y, h))).toEqual([255, 255, 255]);
      }
    }
  });

  it('keeps the 1:1 page contract: MediaBox is exactly the paper, no rotation or crop', async () => {
    // AirPrint's ExactSizePDFPageRenderer has no web equivalent (the OS dialog prints the PDF);
    // what remains testable is that every page is exactly A4 at the origin, unrotated.
    const { cards, settings } = fixture();
    const { pdf } = await exported('unifiedOnly', cards, settings);
    for (const page of pdf.pages) {
      expect(page.mediaBox).toEqual({ x: 0, y: 0, width: page.mediaBox.width, height: page.mediaBox.height });
      expect(Math.abs(page.mediaBox.width - 595.275_59)).toBeLessThan(0.001);
      expect(Math.abs(page.mediaBox.height - 841.889_76)).toBeLessThan(0.001);
      expect(page.page.getRotation().angle).toBe(0);
      expect(page.page.getCropBox()).toEqual(page.mediaBox);
    }
  });

  it('keeps protected sizes and the front/back sequence in a mixed PDF', async () => {
    const { cards, settings } = fixture();
    const { pdf } = await exported(
      'mixed',
      [...cards, card('housing', 0, 'card-0.jpg', 'card-0.jpg')],
      settings,
    );
    expect(pdf.pages).toHaveLength(4);
    for (const page of pdf.pages) {
      expect(Math.abs(page.mediaBox.width - 595.275_59)).toBeLessThan(0.001);
      expect(Math.abs(page.mediaBox.height - 841.889_76)).toBeLessThan(0.001);
    }
    const [, , front, back] = pdf.pages;
    if (!front || !back) throw new Error('pages');
    const h = front.mediaBox.height;
    expect(colorAt(front, mmToPdfPoint(118, 139.96, h))).toEqual(RED);
    expect(colorAt(back, mmToPdfPoint(22, 139.96, h))).toEqual(RED);
  });
});

describe('exportProjectPdf contract', () => {
  it('sets metadata, reports progress and embeds no links', async () => {
    const { cards, settings } = fixture();
    const project = makeProject('unifiedOnly', cards.slice(0, 2), settings, 'بطاقات');
    const progress: number[] = [];
    const blob = await exportProjectPdf(project, buildLayout(project), {
      ...deps,
      onProgress: (done) => progress.push(done),
    });
    expect(blob.type).toBe('application/pdf');
    const { doc, pages } = await inspectPdf(blob);
    expect(doc.getTitle()).toBe('بطاقات');
    expect(doc.getProducer()).toBe('Tibaeati Web');
    expect(progress).toEqual([1, 2]);
    for (const page of pages) expect(page.page.node.Annots()?.size() ?? 0).toBe(0);
  });

  it('fails loudly on a missing image, an empty layout and an aborted signal', async () => {
    const { settings } = fixture();
    const missing = makeProject('unifiedOnly', [card('unified', 0, 'absent.jpg', null)], settings);
    await expect(exportProjectPdf(missing, buildLayout(missing), deps)).rejects.toEqual(
      new DomainError({ code: 'missingImage', fileName: 'absent.jpg' }),
    );
    const empty = makeProject('unifiedOnly', [], settings);
    await expect(exportProjectPdf(empty, buildLayout(empty), deps)).rejects.toBeInstanceOf(DomainError);
    const { cards } = fixture();
    const project = makeProject('unifiedOnly', cards, settings);
    const controller = new AbortController();
    controller.abort();
    await expect(
      exportProjectPdf(project, buildLayout(project), { ...deps, signal: controller.signal }),
    ).rejects.toThrow();
  });
});
