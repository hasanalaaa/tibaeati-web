import { crc32, deflateSync } from 'node:zlib';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFStream,
  decodePDFRawStream,
  type PDFPage,
} from 'pdf-lib';
import type { Point, Rect } from '@/domain/geometry';
import { applyMatrix, multiply, type Matrix } from './coords';

/**
 * Test-only PDF inspection (Node). Pixel checks are impossible without a PDF rasteriser in Node,
 * so the tests read the content stream instead: every `Do` with the CTM in effect, and the colour
 * of each embedded image (the mocked renderer emits solid-colour PNGs).
 */

export function solidPng(
  rgb: readonly [number, number, number],
  width = 4,
  height = 4,
): Uint8Array<ArrayBuffer> {
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [...rgb]).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

export interface Draw {
  readonly name: string;
  readonly subtype: 'Image' | 'Form';
  readonly matrix: Matrix;
  /** Axis-aligned bounds of the unit square (Image) in PDF space, bottom-left origin. */
  readonly bounds: Rect;
  /** First pixel of an image XObject (RGB), from its decoded stream. */
  readonly rgb?: readonly [number, number, number];
  readonly stream: PDFRawStream;
}

export interface InspectedPage {
  readonly mediaBox: Rect;
  readonly content: string;
  readonly draws: readonly Draw[];
  readonly page: PDFPage;
}

export function streamText(stream: PDFStream): string {
  const bytes = stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents();
  return Buffer.from(bytes).toString('latin1');
}

function pageContent(page: PDFPage): string {
  const contents = page.node.Contents();
  if (!contents) return '';
  if (contents instanceof PDFArray) {
    return contents
      .asArray()
      .map((ref) => streamText(page.doc.context.lookup(ref, PDFStream)))
      .join('\n');
  }
  return streamText(contents);
}

const unitBounds = (m: Matrix): Rect => {
  const pts = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ].map((p) => applyMatrix(m, p));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
};

/** Tracks q/Q/cm and records every `/Name Do` with its CTM. */
export function parseDraws(content: string): { name: string; matrix: Matrix }[] {
  const tokens = content.match(/\/[^\s/[\]()<>]+|[-+]?\d*\.?\d+(?:e[-+]?\d+)?|[A-Za-z*'"]+/g) ?? [];
  const stack: Matrix[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  let operands: string[] = [];
  const draws: { name: string; matrix: Matrix }[] = [];
  for (const token of tokens) {
    if (/^[-+]?\d*\.?\d+/.test(token) || token.startsWith('/')) {
      operands.push(token);
      continue;
    }
    if (token === 'q') stack.push(ctm);
    else if (token === 'Q') ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (token === 'cm') {
      const n = operands.slice(-6).map(Number) as unknown as Matrix;
      ctm = multiply(ctm, n);
    } else if (token === 'Do') {
      draws.push({ name: operands[operands.length - 1]?.slice(1) ?? '', matrix: ctm });
    }
    operands = [];
  }
  return draws;
}

export async function inspectPdf(blob: Blob): Promise<{ doc: PDFDocument; pages: InspectedPage[] }> {
  const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()), {
    updateMetadata: false,
  });
  const pages = doc.getPages().map((page) => {
    const content = pageContent(page);
    const xobjects = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    const draws = parseDraws(content).map(({ name, matrix }) => {
      const stream = xobjects?.lookup(PDFName.of(name), PDFStream);
      if (!(stream instanceof PDFRawStream)) throw new Error(`missing XObject ${name}`);
      const subtype: Draw['subtype'] = stream.dict.get(PDFName.of('Subtype'))?.toString() === '/Image' ? 'Image' : 'Form';
      let rgb: Draw['rgb'];
      if (subtype === 'Image') {
        const px = decodePDFRawStream(stream).decode();
        rgb = [px[0] ?? 0, px[1] ?? 0, px[2] ?? 0];
      }
      const draw: Draw = { name, subtype, matrix, bounds: unitBounds(matrix), stream, ...(rgb ? { rgb } : {}) };
      return draw;
    });
    const box = page.getMediaBox();
    return { mediaBox: box, content, draws, page };
  });
  return { doc, pages };
}

/** Top-left millimetre point -> PDF points (bottom-left) for a page of height `pageHeight`. */
export const mmToPdfPoint = (xMM: number, yMM: number, pageHeight: number): Point => ({
  x: (xMM * 72) / 25.4,
  y: pageHeight - (yMM * 72) / 25.4,
});

export const contains = (r: Rect, p: Point): boolean =>
  p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

/** The topmost image drawn at `p` (later draws paint over earlier ones). */
export const imageAt = (page: InspectedPage, p: Point): Draw | undefined =>
  [...page.draws].reverse().find((d) => d.subtype === 'Image' && contains(d.bounds, p));
