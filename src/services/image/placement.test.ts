import { a4PageSizePoints, mmToPoints } from '@/domain/units';
import { PERSONAL_PHOTO_RECT, photoImageRect } from '@/domain/photos/layout';
import {
  CANVAS_PIXEL_BUDGET,
  canvasGeometry,
  cardImageDrawRect,
  contentPlacement,
  effectiveExportDPI,
  recommendedPreviewDPI,
} from './placement';

const card = { width: mmToPoints(85.6), height: mmToPoints(53.98) };

describe('card image placement (PDFExportService.draw)', () => {
  it('aspect-fills the card and centres it by default', () => {
    const r = cardImageDrawRect({ width: 1000, height: 1000 }, card, { scale: 1, offsetX: 0, offsetY: 0 });
    expect(r.width).toBeCloseTo(card.width, 12);
    expect(r.height).toBeCloseTo(card.width, 12);
    expect(r.x).toBeCloseTo(0, 12);
    expect(r.y + r.height / 2).toBeCloseTo(card.height / 2, 12);
  });

  it('applies scale and offsets as fractions of the card, clamped like CardImagePlacement', () => {
    const image = { width: 856, height: 540 };
    const r = cardImageDrawRect(image, card, { scale: 2, offsetX: 0.1, offsetY: -0.2 });
    const base = Math.max(card.width / 856, card.height / 540);
    expect(r.width).toBeCloseTo(856 * base * 2, 9);
    expect(r.x).toBeCloseTo(card.width / 2 - r.width / 2 + 0.1 * card.width, 9);
    expect(r.y).toBeCloseTo(card.height / 2 - r.height / 2 - 0.2 * card.height, 9);
    const clamped = cardImageDrawRect(image, card, { scale: 9, offsetX: 3, offsetY: Number.NaN });
    expect(clamped.width).toBeCloseTo(856 * base * 4, 9);
    expect(clamped.x).toBeCloseTo(card.width / 2 - clamped.width / 2 + 1.5 * card.width, 9);
    expect(clamped.y).toBeCloseTo(card.height / 2 - clamped.height / 2, 9);
  });

  it('expresses every fit relative to the slot centre', () => {
    const image = { width: 600, height: 800 };
    const c = contentPlacement({ kind: 'card', placement: { scale: 1, offsetX: 0, offsetY: 0 } }, image, card);
    expect(c.quarterTurns).toBe(0);
    expect(c.drawRect.x + c.drawRect.width / 2).toBeCloseTo(0, 12);
    const p = contentPlacement({ kind: 'photo', placement: { scale: 1.3, offsetX: 0.1, offsetY: 0 } }, image, PERSONAL_PHOTO_RECT);
    const swift = photoImageRect(image, { scale: 1.3, offsetX: 0.1, offsetY: 0 });
    expect(p.drawRect.x).toBeCloseTo(swift.x - PERSONAL_PHOTO_RECT.width / 2, 12);
    expect(p.drawRect.y).toBeCloseTo(swift.y - PERSONAL_PHOTO_RECT.height / 2, 12);
  });

  it('fits or fills documents inside the turned frame', () => {
    const slot = { width: mmToPoints(125), height: mmToPoints(88) };
    const image = { width: 1000, height: 2000 };
    const fit = contentPlacement(
      { kind: 'document', fillFrame: false, placement: { scale: 3, offsetX: 1, offsetY: 1 }, quarterTurns: 1 },
      image,
      slot,
    );
    // Turned frame is 88 x 125 mm; fit ignores the placement.
    expect(fit.quarterTurns).toBe(1);
    expect(fit.drawRect.height).toBeCloseTo(slot.width, 9);
    expect(fit.drawRect.x).toBeCloseTo(-fit.drawRect.width / 2, 9);
    const fill = contentPlacement(
      { kind: 'document', fillFrame: true, placement: { scale: 1, offsetX: 0.25, offsetY: 0 }, quarterTurns: -3 },
      image,
      slot,
    );
    expect(fill.quarterTurns).toBe(1);
    expect(fill.drawRect.width).toBeCloseTo(slot.height, 9);
    expect(fill.drawRect.x).toBeCloseTo(-fill.drawRect.width / 2 + 0.25 * slot.height, 9);
  });
});

describe('pixel budget', () => {
  it('keeps a 600 dpi card exact and lowers an A4 page to fit the canvas budget', () => {
    const cardCanvas = canvasGeometry(card, 600);
    expect(cardCanvas.reduced).toBe(false);
    expect(cardCanvas.pixelWidth).toBe(Math.round((85.6 / 25.4) * 600));
    expect(cardCanvas.scaleX * card.width).toBeCloseTo(cardCanvas.pixelWidth, 9);
    const page = canvasGeometry(a4PageSizePoints(), 600);
    expect(page.reduced).toBe(true);
    expect(page.pixelWidth * page.pixelHeight).toBeLessThanOrEqual(CANVAS_PIXEL_BUDGET);
    expect(page.dpi).toBeGreaterThan(340);
  });

  it('ports ImageExportService.effectiveDPI and the aggregate preview budget', () => {
    const a4 = a4PageSizePoints();
    expect(effectiveExportDPI(a4, 600)).toBe(600);
    expect(effectiveExportDPI(a4, 10)).toBe(72);
    const a3 = { width: a4.height, height: a4.width * 2 };
    expect(effectiveExportDPI(a3, 600)).toBeCloseTo(Math.sqrt(48_000_000 / (a3.width * a3.height)) * 72, 9);
    const dpi = recommendedPreviewDPI(a4, 3, 600, 200);
    expect(a4.width * a4.height * (dpi / 72) ** 2 * 200).toBeLessThanOrEqual(24_000_001);
  });
});
