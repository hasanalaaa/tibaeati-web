import { applyMarginPreset, defaultProjectSettings } from '../models/projectSettings';
import { card, makeProject } from '../testFixtures';
import type { PrintProject } from '../models/printProject';
import type { CardKind } from '../templates';
import { inspectPreflight, type ImageFacts } from './preflight';
import {
  PREFLIGHT_SEVERITY_RANK,
  blockingIssues,
  canExport,
  preflightHeadline,
  warningIssues,
  type PreflightReport,
} from './types';

// Swift stores one 64 × 40 grey image and points every card side at it.
const IMAGE = 'stored.jpg';
const images = new Map<string, ImageFacts>([
  [IMAGE, { pixelWidth: 64, pixelHeight: 40, lowGrade: false }],
]);
const inspect = (project: PrintProject): PreflightReport =>
  inspectPreflight(project, { images, now: new Date(0) });
const side = (name: string | null): string | null => (name === null ? null : IMAGE);
const sideCard = (
  kind: CardKind,
  order: number,
  front: string | null = null,
  back: string | null = null,
) => card(kind, order, side(front), side(back));
const ids = (report: PreflightReport): Set<string> => new Set(report.issues.map((i) => i.id));

describe('PreflightRuleTests', () => {
  it('testEmptyProjectProducesBlockingNoImagesIssue', () => {
    const report = inspect(makeProject('unifiedOnly', [], defaultProjectSettings(), 'فارغ'));
    expect(canExport(report)).toBe(false);
    expect(blockingIssues(report).map((i) => i.id)).toEqual(['no-images']);
  });

  it('testCardsWithoutAnyImageAreStillBlocking', () => {
    const project = makeProject('housingOnly', [sideCard('housing', 0)], defaultProjectSettings());
    const report = inspect(project);
    expect(ids(report).has('no-images')).toBe(true);
    expect(canExport(report)).toBe(false);
  });

  it('testHealthyCompleteProjectIsExportableWithExactRegistration', () => {
    const cards = [0, 1, 2, 3].map((o) => sideCard('unified', o, `f${o}.jpg`, `b${o}.jpg`));
    const settings = {
      ...applyMarginPreset(defaultProjectSettings(), 'balanced'),
      backOffsetXMM: 1.2,
      backScaleY: 1.002,
    };
    const report = inspect(makeProject('unifiedOnly', cards, settings, 'سليم'));
    expect(canExport(report)).toBe(true);
    const issueIds = ids(report);
    expect(issueIds.has('registration-exact')).toBe(true);
    expect(issueIds.has('template-locked-unified')).toBe(true);
    expect(issueIds.has('calibration-applied')).toBe(true);
    expect(blockingIssues(report)).toEqual([]);
  });

  it('testMixedModeAddsSequenceInformationRule', () => {
    const cards = [
      ...[0, 1].map((o) => sideCard('unified', o, 'f.jpg', 'b.jpg')),
      ...[0, 1].map((o) => sideCard('housing', o, 'fh.jpg', 'bh.jpg')),
    ];
    const report = inspect(makeProject('mixed', cards, defaultProjectSettings(), 'كلاهما'));
    expect(ids(report).has('mixed-export-sequence')).toBe(true);
    expect(canExport(report)).toBe(true);
  });

  it('testDefaultCalibrationTriggersCalibrationNeededWarning', () => {
    const cards = [0, 1].map((o) => sideCard('unified', o, 'f.jpg', 'b.jpg'));
    const report = inspect(makeProject('unifiedOnly', cards, defaultProjectSettings()));
    expect(ids(report).has('calibration-needed')).toBe(true);
    expect(warningIssues(report).some((i) => i.id === 'calibration-needed')).toBe(true);
    expect(canExport(report)).toBe(true);
  });

  it('testOneSidedCardProducesWarningButNotBlock', () => {
    const cards = [
      sideCard('unified', 0, 'front.jpg', null),
      sideCard('unified', 1, 'front2.jpg', 'back2.jpg'),
    ];
    const report = inspect(makeProject('unifiedOnly', cards, defaultProjectSettings()));
    expect(canExport(report)).toBe(true);
    const warning = warningIssues(report).find((i) => i.id === 'one-sided');
    expect(warning).toBeDefined();
    // Swift checks the rendered detail contains "1"; the count parameter is that number.
    expect(warning?.detail).toEqual({ key: 'preflight.oneSided.detail', params: { count: 1 } });
  });

  it('testSeverityOrderingAndSorting', () => {
    expect(PREFLIGHT_SEVERITY_RANK.blocking).toBeGreaterThan(PREFLIGHT_SEVERITY_RANK.warning);
    expect(PREFLIGHT_SEVERITY_RANK.warning).toBeGreaterThan(PREFLIGHT_SEVERITY_RANK.information);
    const cards = [sideCard('unified', 0, 'f.jpg', null), sideCard('unified', 1, null, 'b.jpg')];
    const report = inspect(makeProject('unifiedOnly', cards, defaultProjectSettings()));
    const ranks = report.issues.map((i) => PREFLIGHT_SEVERITY_RANK[i.severity]);
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a));
  });

  it('testHeadlineReflectsState', () => {
    expect(preflightHeadline(inspect(makeProject('unifiedOnly')))).toEqual({
      key: 'preflight.headline.blocking',
    });
    const cards = [0, 1].map((o) => sideCard('unified', o, 'f.jpg', 'b.jpg'));
    const healthy = inspect(makeProject('unifiedOnly', cards, defaultProjectSettings(), 'y'));
    expect(preflightHeadline(healthy)).toEqual({ key: 'preflight.headline.warnings' });
  });
});
