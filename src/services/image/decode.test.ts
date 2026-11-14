import { probeImageBytes } from './decode';

const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const le16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];

function jpeg(width: number, height: number, orientation?: number): Uint8Array {
  const app1: number[] = [];
  if (orientation !== undefined) {
    // "Exif\0\0" + little-endian TIFF + IFD0 with one Orientation entry.
    const tiff = [0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0, ...le16(1), ...le16(0x0112), ...le16(3), 1, 0, 0, 0, ...le16(orientation), 0, 0, 0, 0, 0, 0];
    const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    app1.push(0xff, 0xe1, ...be16(body.length + 2), ...body);
  }
  const sof = [0xff, 0xc0, ...be16(17), 8, ...be16(height), ...be16(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...be16(4), 0, 0, ...app1, ...sof, 0xff, 0xda]);
}

describe('probeImageBytes', () => {
  it('reads JPEG size and swaps it for EXIF orientations 5-8', () => {
    expect(probeImageBytes(jpeg(4032, 3024))).toEqual({ format: 'jpeg', width: 4032, height: 3024, orientation: 1 });
    expect(probeImageBytes(jpeg(4032, 3024, 6))).toEqual({ format: 'jpeg', width: 3024, height: 4032, orientation: 6 });
    expect(probeImageBytes(jpeg(4032, 3024, 3))?.width).toBe(4032);
  });

  it('reads PNG, GIF and WebP headers and rejects garbage', () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(png.buffer).setUint32(16, 856);
    new DataView(png.buffer).setUint32(20, 540);
    expect(probeImageBytes(png)).toMatchObject({ format: 'png', width: 856, height: 540 });
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, ...le16(30), ...le16(40)]);
    expect(probeImageBytes(gif)).toMatchObject({ format: 'gif', width: 30, height: 40 });
    const webp = new Uint8Array(30);
    webp.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58]);
    webp.set([...le16(1999 & 0xffff), 0, ...le16(999 & 0xffff), 0], 24);
    expect(probeImageBytes(webp)).toMatchObject({ format: 'webp', width: 2000, height: 1000 });
    expect(probeImageBytes(new TextEncoder().encode('not an image'))).toBeUndefined();
    expect(probeImageBytes(new Uint8Array([0xff, 0xd8, 0xff]))).toBeUndefined();
  });
});
