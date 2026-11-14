import type { PDFDocument } from 'pdf-lib';
import { calibrationSheet } from '@/domain/calibration/sheet';
import { MAXIMUM_EXPORTED_IMAGE_DPI } from '@/domain/constants';
import { documentPageOps, documentPlan, type SourcePdfPage } from '@/domain/documents/layout';
import { DomainError } from '@/domain/errors';
import { isLayoutEmpty, type GeneratedLayout } from '@/domain/layout/types';
import { documentPdfFileNames, type DocumentJob } from '@/domain/models/documentJob';
import type { PersonalPhoto } from '@/domain/models/personalPhoto';
import type { PrintProject } from '@/domain/models/printProject';
import {
  clampedExportDPI,
  normalizeSettings,
  type PaperSizeOption,
  type ProjectSettings,
} from '@/domain/models/projectSettings';
import { personalPhotoSheetOps } from '@/domain/photos/layout';
import { a4PageSizePoints } from '@/domain/units';
import { cardPageOps } from './pagePlan';
import { createPdf, loadSourcePdf, PdfWriter, savePdf, type ExportDeps } from './writer';

/**
 * Card project: page size is exactly the paper size; each physical sheet's front is followed by its
 * matching back (PDFExportService.exportPDF). Back rectangles come from the layout engine.
 */
export async function exportProjectPdf(
  project: PrintProject,
  layout: GeneratedLayout,
  deps: ExportDeps,
): Promise<Blob> {
  if (isLayoutEmpty(layout)) throw new DomainError({ code: 'noPrintableCards' });
  const settings = normalizeSettings(project.settings);
  const doc = await createPdf({
    title: project.name,
    ...(project.mode === 'mixed'
      ? { subject: 'Unified cards followed continuously by Housing cards, paired duplex sheets' }
      : {}),
  });
  const writer = new PdfWriter(doc, deps, { dpi: clampedExportDPI(settings) });
  const total = layout.frontPages.length * 2;
  let done = 0;
  for (const [index, front] of layout.frontPages.entries()) {
    const back = layout.backPages[index] ?? [];
    for (const slots of [front, back]) {
      await writer.addPage(layout.pageSize, cardPageOps(slots, project, layout.pageSize));
      done += 1;
      deps.onProgress?.(done, total);
    }
  }
  return savePdf(doc);
}

export interface CalibrationDeps {
  /** Translates the sheet's i18n keys (see CALIBRATION_SHEET_KEYS and `duplexEdge.*`). */
  translate(key: string): string;
  signal?: AbortSignal;
}

/** CalibrationSheetService.makeTestSheet: two pages, nothing raster except non-Latin labels. */
export async function exportCalibrationSheetPdf(
  settings: ProjectSettings,
  printerName: string,
  deps: CalibrationDeps,
): Promise<Blob> {
  const sheet = calibrationSheet(settings, printerName);
  const doc = await createPdf({ title: sheet.title });
  const writerDeps: ExportDeps = {
    loadBlob: () => Promise.resolve(undefined),
    ...(deps.signal ? { signal: deps.signal } : {}),
  };
  const writer = new PdfWriter(doc, writerDeps, { dpi: MAXIMUM_EXPORTED_IMAGE_DPI, translate: (key) => deps.translate(key) });
  for (const ops of sheet.pages) await writer.addPage(sheet.pageSize, ops);
  return savePdf(doc);
}

/** PersonalPhotoService.exportPDF: one A4 page, ten 30 x 40 mm photos; the photo is embedded once. */
export async function exportPersonalPhotosPdf(
  photo: PersonalPhoto,
  name: string,
  deps: ExportDeps,
): Promise<Blob> {
  if (photo.imageFileName === undefined) throw new DomainError({ code: 'noPrintableCards' });
  const doc = await createPdf({
    title: name,
    subject: '10 personal photos, 30 x 40 mm, A4, print at 100%',
  });
  const writer = new PdfWriter(doc, deps, { dpi: MAXIMUM_EXPORTED_IMAGE_DPI });
  await writer.addPage(a4PageSizePoints(), personalPhotoSheetOps(photo.imageFileName, photo.placement));
  deps.onProgress?.(1, 1);
  return savePdf(doc);
}

/**
 * DocumentPrintService.exportPDF: actual-size copies on `paper`, or, in original-size mode, every
 * source PDF page at its own size. PDF pages are copied as vectors (form XObjects), images are
 * rendered at up to 600 dpi; mixed jobs combine both.
 */
export async function exportDocumentPdf(
  job: DocumentJob,
  paper: PaperSizeOption,
  title: string,
  deps: ExportDeps,
): Promise<Blob> {
  const sources = new Map<string, PDFDocument>();
  for (const fileName of new Set(documentPdfFileNames(job))) {
    deps.signal?.throwIfAborted();
    sources.set(fileName, await loadSourcePdf(deps, fileName));
  }
  const sourcePage = (fileName: string, pageNumber: number): SourcePdfPage | undefined => {
    const page = sources.get(fileName)?.getPages()[pageNumber - 1];
    if (!page) return undefined;
    const crop = page.getCropBox();
    return { cropBox: { width: crop.width, height: crop.height }, rotation: page.getRotation().angle };
  };
  const plan = documentPlan(job, paper, sourcePage);
  if (plan.pages.length === 0) throw new DomainError({ code: 'noPrintableCards' });

  const doc = await createPdf({ title, subject: 'Actual-size document copies. Print at 100%.' });
  const writer = new PdfWriter(doc, deps, { dpi: MAXIMUM_EXPORTED_IMAGE_DPI }, sources);
  for (const [index, slots] of plan.pages.entries()) {
    const size = plan.sizes[index];
    if (!size) continue;
    await writer.addPage(size, documentPageOps(job, slots, size));
    deps.onProgress?.(index + 1, plan.pages.length);
  }
  return savePdf(doc);
}
