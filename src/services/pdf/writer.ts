import {
  LineCapStyle,
  PDFDocument,
  StandardFonts,
  appendBezierCurve,
  beginText,
  clip,
  clipEvenOdd,
  closePath,
  concatTransformationMatrix,
  drawObject,
  endPath,
  endText,
  fill,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  setDashPattern,
  setFillingRgbColor,
  setFontAndSize,
  setGraphicsState,
  setLineCap,
  setLineWidth,
  setStrokingRgbColor,
  setTextMatrix,
  showText,
  stroke,
  type PDFFont,
  type PDFName,
  type PDFOperator,
  type PDFPage,
  type PDFRef,
} from 'pdf-lib';
import type { Color, DrawOp, StrokeStyle, TextContent, TextWeight } from '@/domain/calibration/sheetPrimitives';
import { DomainError } from '@/domain/errors';
import type { Rect, Size } from '@/domain/geometry';
import { renderImageContent, textToPng } from '../image/render';
import { imageMatrix, pdfPageMatrix, toPdfPoint, toPdfRect, type Matrix } from './coords';

export interface ExportDeps {
  /** Image or PDF bytes stored under `fileName`; undefined when the file is missing. */
  loadBlob(fileName: string): Promise<Blob | undefined>;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export interface WriterOptions {
  /** Raster resolution for artwork drawn into slots (lowered automatically for huge slots). */
  readonly dpi: number;
  /** Turns `TextContent` keys into display strings. */
  readonly translate?: (key: string) => string;
}

export interface PdfMetadata {
  readonly title: string;
  readonly subject?: string;
}

const PRODUCER = 'Tibaeati Web';
/** Bezier circle constant, as CoreGraphics uses for ellipses. */
const KAPPA = 0.552_284_749_830_793_6;
/** Dpi for rasterised (non-Latin) text inside PDFs. */
const TEXT_DPI = 600;

const isPng = (b: Uint8Array): boolean => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const bytesOf = async (blob: Blob): Promise<Uint8Array> => new Uint8Array(await blob.arrayBuffer());

/** Creates the document with the producer metadata every export carries; never adds links. */
export async function createPdf(meta: PdfMetadata): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  doc.setTitle(meta.title);
  doc.setProducer(PRODUCER);
  doc.setCreator(PRODUCER);
  doc.setAuthor(PRODUCER);
  if (meta.subject !== undefined) doc.setSubject(meta.subject);
  return doc;
}

export async function savePdf(doc: PDFDocument): Promise<Blob> {
  const bytes = await doc.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

/** Loads a stored PDF; encrypted or malformed files are `readFailed`. */
export async function loadSourcePdf(deps: ExportDeps, fileName: string): Promise<PDFDocument> {
  const blob = await deps.loadBlob(fileName);
  if (!blob) throw new DomainError({ code: 'readFailed', fileName });
  try {
    return await PDFDocument.load(await bytesOf(blob), { updateMetadata: false });
  } catch {
    throw new DomainError({ code: 'readFailed', fileName });
  }
}

/** Shared resources for one export: each artwork, font and source page is embedded once. */
export class PdfWriter {
  private readonly images = new Map<string, PDFRef>();
  private readonly embeddedPages = new Map<string, PDFRef>();
  private readonly fonts = new Map<TextWeight, PDFFont>();
  private readonly texts = new Map<string, { ref: PDFRef; width: number; height: number }>();

  constructor(
    private readonly doc: PDFDocument,
    private readonly deps: ExportDeps,
    private readonly options: WriterOptions,
    private readonly sourcePdfs: ReadonlyMap<string, PDFDocument> = new Map(),
  ) {}

  async addPage(size: Size, ops: readonly DrawOp[]): Promise<PDFPage> {
    this.deps.signal?.throwIfAborted();
    const page = this.doc.addPage([size.width, size.height]);
    const out = new PageOps(page, this.doc, size.height);
    await this.write(out, ops);
    page.pushOperators(...out.operators);
    return page;
  }

  private async write(out: PageOps, ops: readonly DrawOp[]): Promise<void> {
    for (const op of ops) {
      switch (op.kind) {
        case 'fillRect':
          out.fillRect(op.rect, op.color);
          break;
        case 'path':
          out.strokePath(op.segments.map(([a, b]) => [out.point(a), out.point(b)] as const), op.stroke);
          break;
        case 'strokeRect':
          out.strokeRect(op.rect, op.stroke);
          break;
        case 'ellipse':
          if (op.fill) out.ellipse(op.rect, { fill: op.fill });
          if (op.stroke) out.ellipse(op.rect, { stroke: op.stroke });
          break;
        case 'text':
          await this.text(out, op.content, op);
          break;
        case 'clip':
          out.push(pushGraphicsState());
          for (const r of op.rects) out.rect(r);
          out.push(op.evenOdd ? clipEvenOdd() : clip(), endPath());
          await this.write(out, op.ops);
          out.push(popGraphicsState());
          break;
        case 'image': {
          const ref = await this.image(op.source, op.rect, op.fit);
          out.drawXObject(ref, imageMatrix(op.rect, out.pageHeight, op.mirrorX, op.mirrorY));
          break;
        }
        case 'pdfPage': {
          const source = this.sourcePdfs.get(op.source);
          const page = source?.getPages()[op.pageNumber - 1];
          if (!page) throw new DomainError({ code: 'readFailed', fileName: op.source });
          // A blank source page has no content stream: nothing to draw, like CGContext.drawPDFPage.
          if (!page.node.Contents()) break;
          const crop = page.getCropBox();
          const ref = await this.embeddedPage(op.source, op.pageNumber, page, crop);
          out.drawXObject(
            ref,
            pdfPageMatrix(op.rect, out.pageHeight, crop, page.getRotation().angle, op.quarterTurns),
          );
          break;
        }
      }
    }
  }

  private async image(source: string, rect: Rect, fit: Extract<DrawOp, { kind: 'image' }>['fit']): Promise<PDFRef> {
    const key = JSON.stringify([source, rect.width, rect.height, fit]);
    const cached = this.images.get(key);
    if (cached) return cached;
    this.deps.signal?.throwIfAborted();
    const blob = await this.deps.loadBlob(source);
    if (!blob) throw new DomainError({ code: 'missingImage', fileName: source });
    const rendered = await renderImageContent({
      source: blob,
      fit,
      sizePt: { width: rect.width, height: rect.height },
      dpi: this.options.dpi,
    });
    const bytes = await bytesOf(rendered.blob);
    const embedded = isPng(bytes) ? await this.doc.embedPng(bytes) : await this.doc.embedJpg(bytes);
    this.images.set(key, embedded.ref);
    return embedded.ref;
  }

  private async embeddedPage(
    source: string,
    pageNumber: number,
    page: PDFPage,
    crop: Rect,
  ): Promise<PDFRef> {
    const key = `${source}#${pageNumber}`;
    const cached = this.embeddedPages.get(key);
    if (cached) return cached;
    // Identity matrix: the form keeps the source page's own user space; `pdfPageMatrix` places it.
    const [embedded] = await this.doc.embedPages(
      [page],
      [{ left: crop.x, bottom: crop.y, right: crop.x + crop.width, top: crop.y + crop.height }],
      [[1, 0, 0, 1, 0, 0]],
    );
    if (!embedded) throw new DomainError({ code: 'readFailed', fileName: source });
    this.embeddedPages.set(key, embedded.ref);
    return embedded.ref;
  }

  private async font(weight: TextWeight): Promise<PDFFont> {
    const cached = this.fonts.get(weight);
    if (cached) return cached;
    const font = await this.doc.embedFont(
      weight === 'regular' ? StandardFonts.Helvetica : StandardFonts.HelveticaBold,
    );
    this.fonts.set(weight, font);
    return font;
  }

  private async text(
    out: PageOps,
    content: TextContent,
    op: Extract<DrawOp, { kind: 'text' }>,
  ): Promise<void> {
    const text = content.kind === 'literal' ? content.text : this.translateKey(content.key);
    if (text === '') return;
    const center = out.point(op.center);
    const [cos, sin] = op.rotatedCCW ? [0, 1] : [1, 0];
    const font = await this.font(op.weight);
    let encoded: ReturnType<PDFFont['encodeText']> | undefined;
    try {
      encoded = font.encodeText(text);
    } catch {
      // Not WinAnsi (Arabic, etc.): pdf-lib cannot shape it, so it is rasterised below.
      encoded = undefined;
    }
    if (encoded) {
      const width = font.widthOfTextAtSize(text, op.size);
      const height = font.heightAtSize(op.size);
      const ascent = font.heightAtSize(op.size, { descender: false });
      // Baseline origin relative to the box centre, then rotated about the centre.
      const local = { x: -width / 2, y: height / 2 - ascent };
      const name = out.font(font);
      out.push(
        pushGraphicsState(),
        beginText(),
        setFillingRgbColor(...op.color),
        setFontAndSize(name, op.size),
        setTextMatrix(cos, sin, -sin, cos, center.x + local.x * cos - local.y * sin, center.y + local.x * sin + local.y * cos),
        showText(encoded),
        endText(),
        popGraphicsState(),
      );
      return;
    }
    const raster = await this.rasterText(text, op);
    const local = { x: -raster.width / 2, y: -raster.height / 2 };
    out.drawXObject(raster.ref, [
      raster.width * cos,
      raster.width * sin,
      -raster.height * sin,
      raster.height * cos,
      center.x + local.x * cos - local.y * sin,
      center.y + local.x * sin + local.y * cos,
    ]);
  }

  private async rasterText(
    text: string,
    op: Extract<DrawOp, { kind: 'text' }>,
  ): Promise<{ ref: PDFRef; width: number; height: number }> {
    const key = JSON.stringify([text, op.size, op.weight, op.color]);
    const cached = this.texts.get(key);
    if (cached) return cached;
    const png = await textToPng(text, { size: op.size, weight: op.weight, color: op.color, dpi: TEXT_DPI });
    const embedded = await this.doc.embedPng(await bytesOf(png.blob));
    const value = { ref: embedded.ref, width: png.widthPt, height: png.heightPt };
    this.texts.set(key, value);
    return value;
  }

  private translateKey(key: string): string {
    if (!this.options.translate) {
      throw new DomainError({ code: 'exportFailed', reason: `missing translation for ${key}` });
    }
    return this.options.translate(key);
  }
}

/** Operator buffer for one page; all coordinates enter through `toPdfPoint` / `toPdfRect`. */
class PageOps {
  readonly operators: PDFOperator[] = [];
  private readonly states = new Map<number, PDFName>();
  private readonly xobjects = new Map<PDFRef, PDFName>();
  private readonly fontNames = new Map<PDFRef, PDFName>();

  constructor(
    private readonly page: PDFPage,
    private readonly doc: PDFDocument,
    readonly pageHeight: number,
  ) {}

  push(...ops: PDFOperator[]): void {
    this.operators.push(...ops);
  }

  point(p: { readonly x: number; readonly y: number }): { x: number; y: number } {
    return toPdfPoint(p, this.pageHeight);
  }

  rect(r: Rect): void {
    const p = toPdfRect(r, this.pageHeight);
    this.push(rectangle(p.x, p.y, p.width, p.height));
  }

  private alpha(value: number): PDFOperator[] {
    if (value >= 1) return [];
    let name = this.states.get(value);
    if (!name) {
      name = this.page.node.newExtGState('GS', this.doc.context.obj({ Type: 'ExtGState', CA: value, ca: value }));
      this.states.set(value, name);
    }
    return [setGraphicsState(name)];
  }

  private strokeState(s: StrokeStyle): PDFOperator[] {
    return [
      ...this.alpha(s.alpha),
      setLineWidth(s.width),
      setLineCap(s.cap === 'square' ? LineCapStyle.Projecting : LineCapStyle.Butt),
      setDashPattern([...(s.dash ?? [])], 0),
      setStrokingRgbColor(...s.color),
    ];
  }

  fillRect(r: Rect, color: Color): void {
    this.push(pushGraphicsState(), setFillingRgbColor(...color));
    this.rect(r);
    this.push(fill(), popGraphicsState());
  }

  strokeRect(r: Rect, s: StrokeStyle): void {
    this.push(pushGraphicsState(), ...this.strokeState(s));
    this.rect(r);
    this.push(stroke(), popGraphicsState());
  }

  strokePath(segments: readonly (readonly [{ x: number; y: number }, { x: number; y: number }])[], s: StrokeStyle): void {
    this.push(pushGraphicsState(), ...this.strokeState(s));
    for (const [a, b] of segments) this.push(moveTo(a.x, a.y), lineTo(b.x, b.y));
    this.push(stroke(), popGraphicsState());
  }

  ellipse(r: Rect, paint: { readonly fill?: Color; readonly stroke?: StrokeStyle }): void {
    const p = toPdfRect(r, this.pageHeight);
    const cx = p.x + p.width / 2;
    const cy = p.y + p.height / 2;
    const rx = p.width / 2;
    const ry = p.height / 2;
    const ox = rx * KAPPA;
    const oy = ry * KAPPA;
    this.push(pushGraphicsState());
    if (paint.stroke) this.push(...this.strokeState(paint.stroke));
    if (paint.fill) this.push(setFillingRgbColor(...paint.fill));
    this.push(
      moveTo(cx + rx, cy),
      appendBezierCurve(cx + rx, cy + oy, cx + ox, cy + ry, cx, cy + ry),
      appendBezierCurve(cx - ox, cy + ry, cx - rx, cy + oy, cx - rx, cy),
      appendBezierCurve(cx - rx, cy - oy, cx - ox, cy - ry, cx, cy - ry),
      appendBezierCurve(cx + ox, cy - ry, cx + rx, cy - oy, cx + rx, cy),
      closePath(),
      paint.fill ? fill() : stroke(),
      popGraphicsState(),
    );
  }

  drawXObject(ref: PDFRef, m: Matrix): void {
    let name = this.xobjects.get(ref);
    if (!name) {
      name = this.page.node.newXObject('X', ref);
      this.xobjects.set(ref, name);
    }
    this.push(pushGraphicsState(), concatTransformationMatrix(...m), drawObject(name), popGraphicsState());
  }

  font(font: PDFFont): PDFName {
    let name = this.fontNames.get(font.ref);
    if (!name) {
      name = this.page.node.newFontDictionary('F', font.ref);
      this.fontNames.set(font.ref, name);
    }
    return name;
  }
}
