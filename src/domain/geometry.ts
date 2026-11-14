export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** CoreGraphics-style rectangle, origin top-left. Widths are never negative in this app. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const minX = (r: Rect): number => r.x;
export const minY = (r: Rect): number => r.y;
export const maxX = (r: Rect): number => r.x + r.width;
export const maxY = (r: Rect): number => r.y + r.height;
export const midX = (r: Rect): number => r.x + r.width / 2;
export const midY = (r: Rect): number => r.y + r.height / 2;

export function rectFromSize(size: Size): Rect {
  return { x: 0, y: 0, width: size.width, height: size.height };
}

export function insetBy(r: Rect, dx: number, dy: number): Rect {
  return { x: r.x + dx, y: r.y + dy, width: r.width - 2 * dx, height: r.height - 2 * dy };
}

/** Smallest rectangle containing both, like `CGRect.union`. */
export function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(maxX(a), maxX(b)) - x, height: Math.max(maxY(a), maxY(b)) - y };
}

/** Edges inclusive, like `CGRect.contains(_: CGRect)`. */
export function containsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    maxX(inner) <= maxX(outer) &&
    maxY(inner) <= maxY(outer)
  );
}

/** Rectangles that only share an edge do not intersect, like `CGRect.intersects`. */
export function intersects(a: Rect, b: Rect): boolean {
  return a.x < maxX(b) && b.x < maxX(a) && a.y < maxY(b) && b.y < maxY(a);
}
