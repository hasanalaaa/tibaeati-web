// @vitest-environment node
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { CALIBRATION_SHEET_KEYS } from '@/domain/calibration/sheet';
import { DocumentLayoutError } from '@/domain/documents/layout';
import { createDocumentJob, type DocumentJob, type DocumentPage } from '@/domain/models/documentJob';
import { defaultProjectSettings } from '@/domain/models/projectSettings';
import { PERSONAL_PHOTO_BORDER_WIDTH, PERSONAL_PHOTO_RECTS } from '@/domain/photos/layout';
import { a4PageSizePoints, mmToPoints } from '@/domain/units';
import { toPdfRect } from './coords';
import { exportCalibrationSheetPdf, exportDocumentPdf, exportPersonalPhotosPdf } from './export';
import { contains, imageAt, inspectPdf, mmToPdfPoint, solidPng, streamText } from './testPdf';

const mocks = vi.hoisted(() => ({
  calls: [] as { sizePt: { width: number; height: number }; dpi: number; fit: unknown }[],
}));

vi.mock('../image/render', () => ({
  renderImageContent: async (request: {
    source: Blob;
    sizePt: { width: number; height: number };
    dpi: number;
    fit: unknown;
  }) => {
    mocks.calls.push({ sizePt: request.sizePt, dpi: request.dpi, fit: request.fit });
    const rgb = (await request.source.text()).split(',').map(Number) as [number, number, number];
    return { blob: new Blob([solidPng(rgb)]), pixelWidth: 4, pixelHeight: 4, dpi: request.dpi, reduced: false };
  },
  textToPng: (text: string, style: { size: number }) =>
    Promise.resolve({
      blob: new Blob([solidPng([0, 0, 0])]),
      widthPt: text.length * style.size * 0.5,
      heightPt: style.size * 1.2,
      pixelWidth: 4,
      pixelHeight: 4,
    }),
}));

const files = new Map<string, Blob>();
const deps = { loadBlob: (name: string) => Promise.resolve(files.get(name)) };
const TOLERANCE_PT = 0.001 * (72 / 25.4);

beforeEach(() => {
  files.clear();
  mocks.calls.length = 0;
});

describe('PersonalPhotoTests (PDF part)', () => {
  it('has one A4 page with the photo embedded once and drawn in all ten positions', async () => {
    files.set('photo.jpg', new Blob(['255,0,0']));
    const blob = await exportPersonalPhotosPdf(
      { imageFileName: 'photo.jpg', placement: { scale: 1, offsetX: 0, offsetY: 0 } },
      'photo-test',
      deps,
    );
    const { doc, pages } = await inspectPdf(blob);
    expect(pages).toHaveLength(1);
    const page = pages[0];
    if (!page) throw new Error('page');
    const a4 = a4PageSizePoints();
    expect(Math.abs(page.mediaBox.width - a4.width)).toBeLessThan(0.001);
    expect(Math.abs(page.mediaBox.height - a4.height)).toBeLessThan(0.001);
    expect(mocks.calls).toHaveLength(1);
    expect(doc.getSubject()).toBe('10 personal photos, 30 x 40 mm, A4, print at 100%');
    const images = page.draws.filter((d) => d.subtype === 'Image');
    expect(images).toHaveLength(10);
    PERSONAL_PHOTO_RECTS.forEach((rect, index) => {
      const expected = toPdfRect(rect, a4.height);
      const bounds = images[index]?.bounds;
      if (!bounds) throw new Error('draw');
      for (const k of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs(bounds[k] - expected[k])).toBeLessThan(TOLERANCE_PT);
      }
      const centre = { x: expected.x + expected.width / 2, y: expected.y + expected.height / 2 };
      expect(imageAt(page, centre)?.rgb).toEqual([255, 0, 0]);
      expect(imageAt(page, { x: expected.x - 1, y: centre.y })).toBeUndefined();
      expect(imageAt(page, { x: expected.x + expected.width + 1, y: centre.y })).toBeUndefined();
    });
    // Ten inner frames, 0.15 mm wide, inset by half their width (outer size stays 30 x 40 mm).
    const frames = [...page.content.matchAll(/(\S+) w[\s\S]*?(\S+) (\S+) (\S+) (\S+) re\s+S/g)];
    expect(frames).toHaveLength(10);
    frames.forEach((m, index) => {
      expect(Number(m[1])).toBeCloseTo(PERSONAL_PHOTO_BORDER_WIDTH, 9);
      const outer = toPdfRect(PERSONAL_PHOTO_RECTS[index] ?? { x: 0, y: 0, width: 0, height: 0 }, a4.height);
      expect(Number(m[2]) - PERSONAL_PHOTO_BORDER_WIDTH / 2).toBeCloseTo(outer.x, 9);
      expect(Number(m[4]) + PERSONAL_PHOTO_BORDER_WIDTH).toBeCloseTo(outer.width, 9);
    });
    expect(imageAt(page, mmToPdfPoint(100, 150, a4.height))).toBeUndefined();
  });
});

describe('calibration sheet PDF', () => {
  const translate = (key: string): string =>
    key === CALIBRATION_SHEET_KEYS.frontTitle ? 'FRONT · الوجه' : `T:${key}`;

  it('is two pages of the paper size with vector rulers and Latin labels as text', async () => {
    const settings = { ...defaultProjectSettings(), backOffsetXMM: 1.25, backScaleX: 1.003 };
    const blob = await exportCalibrationSheetPdf(settings, 'Brother', { translate });
    const { doc, pages } = await inspectPdf(blob);
    expect(doc.getTitle()).toBe('Tibaeati Precision Duplex Calibration');
    expect(pages).toHaveLength(2);
    for (const page of pages) {
      expect(Math.abs(page.mediaBox.width - 595.275_59)).toBeLessThan(0.001);
      expect(Math.abs(page.mediaBox.height - 841.889_76)).toBeLessThan(0.001);
    }
    const [front, back] = pages;
    if (!front || !back) throw new Error('pages');
    // The 100 x 150 mm frame is a vector rectangle centred on the page.
    const w = mmToPoints(100);
    const h = mmToPoints(150);
    const x = 595.275_590_551_181_2 / 2 - w / 2;
    const y = 841.889_763_779_527_7 / 2 - h / 2;
    const rects = [...front.content.matchAll(/(\S+) (\S+) (\S+) (\S+) re/g)].map((m) =>
      m.slice(1, 5).map(Number),
    );
    expect(
      rects.some((r) => [x, y, w, h].every((v, i) => Math.abs((r[i] ?? NaN) - v) < TOLERANCE_PT)),
    ).toBe(true);
    expect(front.content).toContain('[] 0 d');
    expect(back.content).toContain('[4 2] 0 d');
    // Arabic label rasterised (an image draw); Latin labels and the readout are real text.
    expect(front.draws.filter((d) => d.subtype === 'Image')).toHaveLength(1);
    expect(front.content).toContain('Tj');
    expect(back.content).toContain('Tj');
  });

  it('fails loudly when a key cannot be translated', async () => {
    await expect(
      exportCalibrationSheetPdf(defaultProjectSettings(), 'P', {
        translate: () => {
          throw new Error('no key');
        },
      }),
    ).rejects.toThrow('no key');
  });
});

async function sourcePdf(
  pages: readonly { size: [number, number]; text?: string; rotate?: number }[],
): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const spec of pages) {
    const page = doc.addPage(spec.size);
    if (spec.text) page.drawText(spec.text, { x: 20, y: 30, size: 20, font });
    if (spec.rotate) page.setRotation(degrees(spec.rotate));
  }
  return new Blob([new Uint8Array(await doc.save({ useObjectStreams: false }))]);
}

const pdfPage = (fileName: string, page: number, quarterTurns = 0): DocumentPage => ({
  id: crypto.randomUUID(),
  source: { kind: 'pdf', fileName, page },
  quarterTurns: quarterTurns as 0 | 1 | 2 | 3,
  placement: { scale: 1, offsetX: 0, offsetY: 0 },
  fillFrame: false,
});

describe('DocumentStudioTests (PDF part)', () => {
  it('keeps vector text of every imported PDF page', async () => {
    files.set(
      'doc.pdf',
      await sourcePdf([
        { size: [354.3307, 249.4488], text: 'VECTOR-KEEP-1' },
        { size: [354.3307, 249.4488], text: 'VECTOR-KEEP-2' },
      ]),
    );
    const job: DocumentJob = {
      ...createDocumentJob('passportData'),
      pages: [pdfPage('doc.pdf', 1), pdfPage('doc.pdf', 2)],
    };
    const { pages } = await inspectPdf(await exportDocumentPdf(job, 'a4', 'Vector roundtrip', deps));
    const forms = pages.flatMap((p) => p.draws.filter((d) => d.subtype === 'Form'));
    expect(forms).toHaveLength(2);
    const text = forms.map((f) => streamText(f.stream)).join('\n');
    expect(text).toContain('Tj');
    // Helvetica text is hex-encoded by pdf-lib; check the glyph codes of both labels.
    for (const label of ['VECTOR-KEEP-1', 'VECTOR-KEEP-2']) {
      expect(text.toUpperCase()).toContain(Buffer.from(label, 'latin1').toString('hex').toUpperCase());
    }
  });

  it('keeps original sizes with mixed page sizes, copies and user rotation', async () => {
    files.set('orig.pdf', await sourcePdf([{ size: [300, 500], text: 'PAGE ONE' }, { size: [600, 400], text: 'TWO' }]));
    const job: DocumentJob = {
      ...createDocumentJob('a4'),
      originalPDFPages: true,
      copies: 2,
      pages: [pdfPage('orig.pdf', 1), pdfPage('orig.pdf', 2, 1)],
    };
    const { pages } = await inspectPdf(await exportDocumentPdf(job, 'a4', 'Original sizes', deps));
    expect(pages.map((p) => [p.mediaBox.width, p.mediaBox.height])).toEqual([
      [300, 500],
      [400, 600],
      [300, 500],
      [400, 600],
    ]);
    // Each source page is embedded once and fills its own page exactly (1:1, no scaling).
    const first = pages[0]?.draws[0];
    expect(first?.matrix).toEqual([1, 0, 0, 1, 0, 0]);
    const turned = pages[1]?.draws[0]?.matrix;
    expect(turned?.map((v) => Math.round(v * 1e9) / 1e9)).toEqual([0, -1, 1, 0, 0, 600]);
  });

  it('honours the source /Rotate when sizing original pages', async () => {
    files.set('rot.pdf', await sourcePdf([{ size: [600, 400], rotate: 90 }, { size: [100, 100] }]));
    const job: DocumentJob = { ...createDocumentJob('a4'), originalPDFPages: true, pages: [pdfPage('rot.pdf', 1), pdfPage('rot.pdf', 2)] };
    const { pages } = await inspectPdf(await exportDocumentPdf(job, 'a4', 'Rotated', deps));
    expect([pages[0]?.mediaBox.width, pages[0]?.mediaBox.height]).toEqual([400, 600]);
    // A blank source page (no content stream) exports as a blank page of its size.
    expect(pages[1]?.draws).toHaveLength(0);
  });

  it('mixes images and PDF pages on the template grid, with border', async () => {
    files.set('scan.jpg', new Blob(['0,0,255']));
    files.set('doc.pdf', await sourcePdf([{ size: [354.3307, 249.4488], text: 'X' }]));
    const job: DocumentJob = {
      ...createDocumentJob('passportData'),
      showBorder: true,
      pages: [
        {
          id: crypto.randomUUID(),
          source: { kind: 'image', fileName: 'scan.jpg' },
          quarterTurns: 1,
          placement: { scale: 1, offsetX: 0, offsetY: 0 },
          fillFrame: false,
        },
        pdfPage('doc.pdf', 1),
      ],
    };
    const { pages } = await inspectPdf(await exportDocumentPdf(job, 'a4', 'Mixed', deps));
    expect(pages).toHaveLength(1);
    const page = pages[0];
    if (!page) throw new Error('page');
    const image = page.draws.find((d) => d.subtype === 'Image');
    const form = page.draws.find((d) => d.subtype === 'Form');
    // 125 x 88 mm passport data page, first slot top-right (right-to-left grid), never scaled.
    expect(Math.abs((image?.bounds.width ?? 0) - mmToPoints(125))).toBeLessThan(TOLERANCE_PT);
    expect(Math.abs((image?.bounds.height ?? 0) - mmToPoints(88))).toBeLessThan(TOLERANCE_PT);
    expect(contains(image?.bounds ?? { x: 0, y: 0, width: 0, height: 0 }, mmToPdfPoint(150, 50, page.mediaBox.height))).toBe(true);
    expect(form).toBeDefined();
    expect(mocks.calls[0]?.fit).toEqual({
      kind: 'document',
      fillFrame: false,
      placement: { scale: 1, offsetX: 0, offsetY: 0 },
      quarterTurns: 1,
    });
    expect(page.content.match(/ re\s+S/g)).toHaveLength(2);
  });

  it('rejects image pages in original-size mode and unreadable PDFs', async () => {
    files.set('scan.jpg', new Blob(['0,0,255']));
    files.set('bad.pdf', new Blob(['not a pdf']));
    const imageJob: DocumentJob = {
      ...createDocumentJob('a4'),
      originalPDFPages: true,
      pages: [
        {
          id: crypto.randomUUID(),
          source: { kind: 'image', fileName: 'scan.jpg' },
          quarterTurns: 0,
          placement: { scale: 1, offsetX: 0, offsetY: 0 },
          fillFrame: false,
        },
      ],
    };
    await expect(exportDocumentPdf(imageJob, 'a4', 'x', deps)).rejects.toBeInstanceOf(DocumentLayoutError);
    const badJob: DocumentJob = { ...createDocumentJob('a4'), pages: [pdfPage('bad.pdf', 1)] };
    await expect(exportDocumentPdf(badJob, 'a4', 'x', deps)).rejects.toMatchObject({
      error: { code: 'readFailed', fileName: 'bad.pdf' },
    });
  });
});
