import { DomainError } from '@/domain/errors';

export interface ProbedImage {
  readonly format: 'jpeg' | 'png' | 'webp' | 'gif';
  /** Display size, after the EXIF orientation is applied. */
  readonly width: number;
  readonly height: number;
  /** EXIF orientation 1...8 (1 when absent). */
  readonly orientation: number;
}

/** Bytes read from the front of a file for probing; covers EXIF blocks and large APP segments. */
const PROBE_BYTES = 512 * 1024;
/** Above this, decoding is downscaled so one bitmap cannot exhaust an iPhone's memory. */
export const MAX_DECODE_PIXELS = 24_000_000;

function exifOrientation(view: DataView, start: number, length: number): number {
  // "Exif\0\0" then a TIFF header.
  if (length < 14 || view.getUint32(start) !== 0x45786966) return 1;
  const tiff = start + 6;
  const little = view.getUint16(tiff) === 0x4949;
  const u16 = (o: number): number => view.getUint16(o, little);
  const u32 = (o: number): number => view.getUint32(o, little);
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > view.byteLength) return 1;
  const entries = u16(ifd);
  for (let i = 0; i < entries; i += 1) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > view.byteLength) break;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

const oriented = (
  format: ProbedImage['format'],
  w: number,
  h: number,
  orientation: number,
): ProbedImage | undefined =>
  w > 0 && h > 0
    ? orientation >= 5
      ? { format, width: h, height: w, orientation }
      : { format, width: w, height: h, orientation }
    : undefined;

/**
 * Pixel size from the file header, without decoding. Undefined for unknown or truncated data.
 * Supports JPEG (with EXIF orientation), PNG, WebP and GIF.
 */
export function probeImageBytes(bytes: Uint8Array): ProbedImage | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = bytes.byteLength;
  if (n >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(12) === 0x49484452) {
    return oriented('png', view.getUint32(16), view.getUint32(20), 1);
  }
  if (n >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return oriented('gif', view.getUint16(6, true), view.getUint16(8, true), 1);
  }
  if (n >= 30 && view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250) {
    const chunk = view.getUint32(12);
    if (chunk === 0x56503820 /* "VP8 " */) {
      return oriented(
        'webp',
        view.getUint16(26, true) & 0x3fff,
        view.getUint16(28, true) & 0x3fff,
        1,
      );
    }
    if (chunk === 0x5650384c /* "VP8L" */) {
      const b = view.getUint32(21, true);
      return oriented('webp', (b & 0x3fff) + 1, ((b >>> 14) & 0x3fff) + 1, 1);
    }
    if (chunk === 0x56503858 /* "VP8X" */) {
      const w = 1 + (view.getUint16(24, true) | (view.getUint8(26) << 16));
      const h = 1 + (view.getUint16(27, true) | (view.getUint8(29) << 16));
      return oriented('webp', w, h, 1);
    }
    return undefined;
  }
  if (n >= 4 && view.getUint16(0) === 0xffd8) {
    let orientation = 1;
    let offset = 2;
    while (offset + 4 <= n) {
      if (bytes[offset] !== 0xff) return undefined;
      const marker = bytes[offset + 1] ?? 0;
      if (marker === 0xff) {
        offset += 1;
        continue;
      }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        offset += 2;
        continue;
      }
      const length = view.getUint16(offset + 2);
      if (marker === 0xe1) orientation = exifOrientation(view, offset + 4, length - 2);
      const isSOF =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSOF && offset + 9 <= n) {
        return oriented(
          'jpeg',
          view.getUint16(offset + 7),
          view.getUint16(offset + 5),
          orientation,
        );
      }
      if (marker === 0xda || marker === 0xd9) return undefined;
      offset += 2 + length;
    }
  }
  return undefined;
}

export async function probeImage(blob: Blob): Promise<ProbedImage | undefined> {
  const head = new Uint8Array(await blob.slice(0, PROBE_BYTES).arrayBuffer());
  return probeImageBytes(head);
}

/**
 * Decodes with the EXIF orientation applied (like UIImage). Very large images are decoded
 * downscaled; callers must use the returned bitmap's own width/height for placement maths.
 * The caller owns the bitmap and must `close()` it.
 */
export async function decodeImage(blob: Blob): Promise<ImageBitmap> {
  const probe = await probeImage(blob).catch(() => undefined);
  const options: ImageBitmapOptions = { imageOrientation: 'from-image' };
  if (probe && probe.width * probe.height > MAX_DECODE_PIXELS) {
    const k = Math.sqrt(MAX_DECODE_PIXELS / (probe.width * probe.height));
    // Width only: the browser keeps the aspect ratio, so the result can never be distorted.
    options.resizeWidth = Math.max(1, Math.floor(probe.width * k));
    options.resizeQuality = 'high';
  }
  try {
    return await createImageBitmap(blob, options);
  } catch {
    throw new DomainError({ code: 'imageDecodingFailed' });
  }
}
