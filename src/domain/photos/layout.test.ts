import { containsRect, insetBy, intersects, maxX, midX, type Size } from '../geometry';
import { a4PageSizePoints, mmToPoints, pointsToMM } from '../units';
import { expectNear } from '../testFixtures';
import {
  PERSONAL_PHOTO_BORDER_WIDTH,
  PERSONAL_PHOTO_RECT,
  PERSONAL_PHOTO_RECTS,
  personalPhotoSheetOps,
  photoEffectiveDPI,
  photoImageRect,
  suggestedPhotoPlacement,
} from './layout';

// Port of PersonalPhotoTests.swift (layout and crop maths; Vision import is out of scope).
describe('PersonalPhotoLayout', () => {
  it('has ten photos of exact size in two rows with a safe top margin', () => {
    expect(PERSONAL_PHOTO_RECTS).toHaveLength(10);
    const page = { x: 0, y: 0, ...a4PageSizePoints() };
    PERSONAL_PHOTO_RECTS.forEach((rect, index) => {
      expectNear(pointsToMM(rect.width), 30, 0.000_001);
      expectNear(pointsToMM(rect.height), 40, 0.000_001);
      expectNear(pointsToMM(rect.y), index < 5 ? 10 : 53, 0.000_001);
      expect(containsRect(page, rect)).toBe(true);
      for (const other of PERSONAL_PHOTO_RECTS.slice(index + 1)) {
        expect(intersects(rect, other)).toBe(false);
      }
    });
    expectNear(pointsToMM(Math.min(...PERSONAL_PHOTO_RECTS.map((r) => r.x))), 15, 0.000_001);
    expectNear(pointsToMM(Math.max(...PERSONAL_PHOTO_RECTS.map(maxX))), 195, 0.000_001);
    expectNear(pointsToMM(PERSONAL_PHOTO_BORDER_WIDTH), 0.15, 1e-12);
  });

  it('never stretches or leaves uncovered edges, even with invalid input', () => {
    const sizes: Size[] = [
      { width: 1200, height: 1600 },
      { width: 2200, height: 800 },
      { width: 500, height: 2000 },
    ];
    for (const size of sizes) {
      for (const requested of [
        { scale: 4, offsetX: 1.5, offsetY: -1.5 },
        { scale: Number.NaN, offsetX: Number.POSITIVE_INFINITY, offsetY: Number.NEGATIVE_INFINITY },
      ]) {
        const draw = photoImageRect(size, requested);
        expect(containsRect(insetBy(draw, -0.000_001, -0.000_001), PERSONAL_PHOTO_RECT)).toBe(true);
        expectNear(draw.width / draw.height, size.width / size.height, 0.000_001);
      }
    }
  });

  it('centres a face without cutting image edges', () => {
    const size = { width: 2000, height: 2000 };
    const face = { x: 0.25, y: 0.25, width: 0.2, height: 0.3 };
    const placement = suggestedPhotoPlacement(face, size);
    const draw = photoImageRect(size, placement);
    expectNear(draw.x + midX(face) * draw.width, midX(PERSONAL_PHOTO_RECT), 0.000_001);
    expectNear(draw.y + (face.y + face.height / 2) * draw.height, PERSONAL_PHOTO_RECT.height * 0.42, 0.000_001);
  });

  it('reports effective dpi and draws image then inner frame per photo', () => {
    expectNear(photoEffectiveDPI({ width: 709, height: 945 }, { scale: 1, offsetX: 0, offsetY: 0 }), 600, 1);
    const ops = personalPhotoSheetOps('p.jpg', { scale: 1, offsetX: 0, offsetY: 0 });
    expect(ops.map((o) => o.kind)).toEqual([
      'fillRect',
      ...Array.from({ length: 10 }, () => ['image', 'strokeRect']).flat(),
    ]);
    const frame = ops[2];
    expect(frame?.kind === 'strokeRect' && frame.rect.width).toBeCloseTo(
      mmToPoints(30) - PERSONAL_PHOTO_BORDER_WIDTH,
      12,
    );
    expect(personalPhotoSheetOps(undefined, { scale: 1, offsetX: 0, offsetY: 0 }).some((o) => o.kind === 'image')).toBe(false);
  });
});
