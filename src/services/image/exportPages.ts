import { DomainError } from '@/domain/errors';
import { flattenOps } from '@/domain/calibration/sheetPrimitives';
import { isLayoutEmpty, type GeneratedLayout } from '@/domain/layout/types';
import type { PrintProject } from '@/domain/models/printProject';
import { cardPageOps } from '../pdf/pagePlan';
import type { ExportDeps } from '../pdf/writer';
import { CANVAS_PIXEL_BUDGET, EXPORT_JPEG_QUALITY, canvasGeometry, effectiveExportDPI } from './placement';
import { renderRaster, type RasterFormat } from './render';

export interface PageImagesResult {
  /** Front then back for every sheet, like ImageExportService.exportImages. */
  readonly pages: readonly Blob[];
  readonly dpi: number;
  /** i18n key with `{ requested, used }` params when the dpi had to be lowered. */
  readonly warning?: {
    readonly key: 'export.dpiReduced';
    readonly params: { readonly requested: number; readonly used: number };
  };
}

/**
 * One image per page, within `CANVAS_PIXEL_BUDGET` (never crashes: the dpi is lowered and a warning
 * returned instead). Pages render one at a time; images decode one at a time.
 */
export async function exportPagesPng(
  project: PrintProject,
  layout: GeneratedLayout,
  deps: ExportDeps,
  dpi: number,
  format: RasterFormat = 'image/png',
): Promise<PageImagesResult> {
  if (isLayoutEmpty(layout)) throw new DomainError({ code: 'noPrintableCards' });
  const swiftDpi = effectiveExportDPI(layout.pageSize, dpi);
  const geometry = canvasGeometry(layout.pageSize, swiftDpi, CANVAS_PIXEL_BUDGET);
  const pages: Blob[] = [];
  const sheets = layout.frontPages.map((front, index) => [front, layout.backPages[index] ?? []] as const);
  const total = sheets.length * 2;
  for (const sheet of sheets) {
    for (const slots of sheet) {
      deps.signal?.throwIfAborted();
      const ops = cardPageOps(slots, project, layout.pageSize);
      const sources: Record<string, Blob> = {};
      for (const op of flattenOps(ops)) {
        if (op.kind !== 'image' || op.source in sources) continue;
        const blob = await deps.loadBlob(op.source);
        if (!blob) throw new DomainError({ code: 'missingImage', fileName: op.source });
        sources[op.source] = blob;
      }
      const result = await renderRaster({
        widthPt: layout.pageSize.width,
        heightPt: layout.pageSize.height,
        dpi: geometry.dpi,
        ops,
        sources,
        format,
        quality: EXPORT_JPEG_QUALITY,
      });
      pages.push(result.blob);
      deps.onProgress?.(pages.length, total);
    }
  }
  const used = Math.round(geometry.dpi * 100) / 100;
  return geometry.dpi < dpi - 1e-9
    ? { pages, dpi: geometry.dpi, warning: { key: 'export.dpiReduced', params: { requested: dpi, used } } }
    : { pages, dpi: geometry.dpi };
}
