import {
  DEFAULT_GAP_MM,
  DEFAULT_MARGIN_MM,
  EXPORTED_IMAGE_DPI,
  MAXIMUM_CARDS_PER_PROJECT,
} from '../constants';
import { graphemeCount } from '../format';
import { createCardEntry } from '../models/cardEntry';
import { PRINT_PROJECT_SCHEMA_VERSION } from '../models/printProject';
import { defaultProjectSettings, type ProjectSettings } from '../models/projectSettings';
import { expectNear, makeProject } from '../testFixtures';
import { normalizeProject, normalizeProjectName, normalizeSettings } from './projectValidator';

const UNTITLED = 'مشروع بدون اسم';
const withSettings = (patch: Partial<ProjectSettings>): ProjectSettings => ({
  ...defaultProjectSettings(),
  ...patch,
});

describe('ValidatorBoundsTests', () => {
  it('testBackOffsetClampedToFifteenMillimetres', () => {
    const n = normalizeSettings(withSettings({ backOffsetXMM: 40, backOffsetYMM: -40 }));
    expectNear(n.backOffsetXMM, 15, 1e-9);
    expectNear(n.backOffsetYMM, -15, 1e-9);
  });

  it('testBackOffsetInsideBoundsIsUntouched', () => {
    const n = normalizeSettings(withSettings({ backOffsetXMM: 7.5, backOffsetYMM: -14.9 }));
    expectNear(n.backOffsetXMM, 7.5, 1e-9);
    expectNear(n.backOffsetYMM, -14.9, 1e-9);
  });

  it('testBackScaleClampedToProtectedRange', () => {
    const n = normalizeSettings(withSettings({ backScaleX: 1.5, backScaleY: 0.5 }));
    expectNear(n.backScaleX, 1.03, 1e-9);
    expectNear(n.backScaleY, 0.97, 1e-9);
  });

  it('testBoundaryScalesSurviveNormalization', () => {
    const n = normalizeSettings(withSettings({ backScaleX: 0.97, backScaleY: 1.03 }));
    expectNear(n.backScaleX, 0.97, 1e-12);
    expectNear(n.backScaleY, 1.03, 1e-12);
  });

  it('testExportDPIClampedToSupportedWindow', () => {
    expectNear(normalizeSettings(withSettings({ exportDPI: 10 })).exportDPI, 150, 1e-9);
    expectNear(normalizeSettings(withSettings({ exportDPI: 1200 })).exportDPI, 600, 1e-9);
    expectNear(normalizeSettings(withSettings({ exportDPI: 333.3 })).exportDPI, 333.3, 1e-9);
  });

  it('testNonFiniteValuesFallBackToDefaults', () => {
    const n = normalizeSettings(
      withSettings({
        marginTopMM: Number.POSITIVE_INFINITY,
        horizontalGapMM: Number.NaN,
        backScaleX: Number.NaN,
        exportDPI: Number.NaN,
      }),
    );
    expectNear(n.marginTopMM, DEFAULT_MARGIN_MM, 1e-9);
    expectNear(n.horizontalGapMM, DEFAULT_GAP_MM, 1e-9);
    expectNear(n.backScaleX, 1, 1e-9);
    expectNear(n.exportDPI, EXPORTED_IMAGE_DPI, 1e-9);
  });

  it('testLockCardTemplateIsForcedTrue', () => {
    expect(normalizeSettings(withSettings({ lockCardTemplate: false })).lockCardTemplate).toBe(
      true,
    );
    const project = normalizeProject(makeProject('mixed', [], defaultProjectSettings(), 'n'), {
      untitledName: UNTITLED,
    });
    expect(project.settings.lockCardTemplate).toBe(true);
    expect(project.schemaVersion).toBe(PRINT_PROJECT_SCHEMA_VERSION);
  });

  it('testProjectNameSanitizedControlCharactersCollapsedAndTrimmed', () => {
    expect(normalizeProjectName('  hello \t world \n ', UNTITLED)).toBe('hello world');
    expect(normalizeProjectName('\u0007\u001Bمخفي', UNTITLED)).toBe('مخفي');
    expect(normalizeProjectName('   ', UNTITLED)).toBe('مشروع بدون اسم');
    expect(graphemeCount(normalizeProjectName('ط'.repeat(200), UNTITLED))).toBe(80);
  });

  it('testDuplicateCardIDsReidentifiedAndOrdersRebuiltPerKind', () => {
    const sharedID = crypto.randomUUID();
    const project = makeProject(
      'mixed',
      [
        createCardEntry({ id: sharedID, kind: 'housing', order: 9, frontImageFileName: 'a.jpg' }),
        createCardEntry({ id: sharedID, kind: 'housing', order: 4, frontImageFileName: 'b.jpg' }),
        createCardEntry({ kind: 'unified', order: 42, frontImageFileName: 'c.jpg' }),
        createCardEntry({ kind: 'housing', order: 1, frontImageFileName: 'd.jpg' }),
      ],
      defaultProjectSettings(),
      'إصلاح',
    );
    const normalized = normalizeProject(project, { untitledName: UNTITLED });
    expect(new Set(normalized.cards.map((c) => c.id)).size).toBe(normalized.cards.length);
    expect(normalized.cards.length).toBe(4);
    expect(normalized.cards.filter((c) => c.kind === 'unified').map((c) => c.order)).toEqual([0]);
    const housingOrders = normalized.cards
      .filter((c) => c.kind === 'housing')
      .map((c) => c.order)
      .sort((a, b) => a - b);
    expect(housingOrders).toEqual([0, 1, 2]);
  });

  it('testCardCountCappedAtProtectedMaximum', () => {
    const many = Array.from({ length: 250 }, (_, order) =>
      createCardEntry({ kind: 'unified', order, frontImageFileName: 'f.jpg' }),
    );
    const normalized = normalizeProject(
      makeProject('unifiedOnly', many, defaultProjectSettings(), 'حد'),
      { untitledName: UNTITLED },
    );
    expect(normalized.cards.length).toBe(MAXIMUM_CARDS_PER_PROJECT);
  });
});
