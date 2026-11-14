import { createCardEntry, type CardEntry } from './models/cardEntry';
import { createPrintProject, type PrintProject } from './models/printProject';
import {
  applyMarginPreset,
  defaultProjectSettings,
  type ProjectSettings,
} from './models/projectSettings';
import type { ProjectMode } from './modes';
import type { CardKind } from './templates';

/** Test-only helpers mirroring the Swift XCTest fixtures. */
export const EPOCH = new Date(0);

export function makeProject(
  mode: ProjectMode,
  cards: readonly CardEntry[] = [],
  settings: ProjectSettings = defaultProjectSettings(),
  name = 'Golden',
): PrintProject {
  return createPrintProject({ name, mode, settings, cards }, EPOCH);
}

export function card(
  kind: CardKind,
  order: number,
  front: string | null = 'f.jpg',
  back: string | null = 'b.jpg',
): CardEntry {
  return createCardEntry({
    kind,
    order,
    ...(front === null ? {} : { frontImageFileName: front }),
    ...(back === null ? {} : { backImageFileName: back }),
  });
}

export const cards = (count: number, kind: CardKind): CardEntry[] =>
  Array.from({ length: count }, (_, order) => card(kind, order));

export function balancedSettings(): ProjectSettings {
  return applyMarginPreset(
    { ...defaultProjectSettings(), paperSize: 'a4', lockCardTemplate: true },
    'balanced',
  );
}

/** `XCTAssertEqual(a, b, accuracy:)` passes when |a - b| <= accuracy. */
export function expectNear(actual: number, expected: number, accuracy: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(accuracy);
}
