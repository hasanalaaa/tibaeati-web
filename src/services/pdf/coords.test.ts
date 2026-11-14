import { applyMatrix, imageMatrix, pdfPageMatrix, toPdfPoint, toPdfRect } from './coords';

const H = 841.889_763_779_527_7;

describe('top-left to PDF bottom-left conversion', () => {
  it('flips y about the page height and keeps sizes', () => {
    expect(toPdfPoint({ x: 10, y: 0 }, H)).toEqual({ x: 10, y: H });
    expect(toPdfPoint({ x: 10, y: H }, H)).toEqual({ x: 10, y: 0 });
    expect(toPdfRect({ x: 5, y: 20, width: 100, height: 50 }, H)).toEqual({
      x: 5,
      y: H - 70,
      width: 100,
      height: 50,
    });
  });

  it('maps the image unit square onto the rect, mirrored about its centre on request', () => {
    const rect = { x: 30, y: 40, width: 200, height: 100 };
    const pdf = toPdfRect(rect, H);
    const corners = (m: ReturnType<typeof imageMatrix>) =>
      [applyMatrix(m, { x: 0, y: 0 }), applyMatrix(m, { x: 1, y: 1 })];
    expect(corners(imageMatrix(rect, H))).toEqual([
      { x: pdf.x, y: pdf.y },
      { x: pdf.x + 200, y: pdf.y + 100 },
    ]);
    // Mirrored: image-left lands on the rect's right edge, footprint unchanged.
    expect(corners(imageMatrix(rect, H, true, false))).toEqual([
      { x: pdf.x + 200, y: pdf.y },
      { x: pdf.x, y: pdf.y + 100 },
    ]);
    expect(corners(imageMatrix(rect, H, false, true))).toEqual([
      { x: pdf.x, y: pdf.y + 100 },
      { x: pdf.x + 200, y: pdf.y },
    ]);
  });

  it('places a source page 1:1 in its own-size slot, with source and user rotation', () => {
    const crop = { x: 0, y: 0, width: 600, height: 400 };
    const same = pdfPageMatrix({ x: 0, y: 0, width: 600, height: 400 }, 400, crop, 0, 0);
    expect(applyMatrix(same, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(applyMatrix(same, { x: 600, y: 400 })).toEqual({ x: 600, y: 400 });
    // One clockwise user turn: a 400 x 600 page; the source top-left corner goes to the top-right.
    const turned = pdfPageMatrix({ x: 0, y: 0, width: 400, height: 600 }, 600, crop, 0, 1);
    const topLeft = applyMatrix(turned, { x: 0, y: 400 });
    expect(topLeft.x).toBeCloseTo(400, 9);
    expect(topLeft.y).toBeCloseTo(600, 9);
    // /Rotate 90 plus one user turn = 180 degrees in a 600 x 400 page.
    const both = pdfPageMatrix({ x: 0, y: 0, width: 600, height: 400 }, 400, crop, 90, 1);
    const p = applyMatrix(both, { x: 0, y: 0 });
    expect(p.x).toBeCloseTo(600, 9);
    expect(p.y).toBeCloseTo(400, 9);
  });

  it('never enlarges a small page and shrinks a large one into the slot, centred', () => {
    const slot = { x: 100, y: 100, width: 300, height: 300 };
    const small = pdfPageMatrix(slot, H, { x: 0, y: 0, width: 100, height: 50 }, 0, 0);
    expect(small[0]).toBe(1);
    expect(applyMatrix(small, { x: 50, y: 25 })).toEqual(toPdfPoint({ x: 250, y: 250 }, H));
    const large = pdfPageMatrix(slot, H, { x: 10, y: 10, width: 600, height: 300 }, 0, 0);
    expect(large[0]).toBeCloseTo(0.5, 12);
    expect(applyMatrix(large, { x: 310, y: 160 })).toEqual(toPdfPoint({ x: 250, y: 250 }, H));
  });
});
