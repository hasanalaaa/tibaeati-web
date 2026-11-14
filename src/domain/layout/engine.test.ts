import {
  containsRect,
  insetBy,
  intersects,
  maxX,
  maxY,
  midX,
  midY,
  type Point,
  type Rect,
} from '../geometry';
import { canExport } from '../preflight/types';
import { inspectPreflight } from '../preflight/preflight';
import { applyPrinterProfile } from '../printers/profiles';
import {
  ProjectSettingsSchema,
  defaultProjectSettings,
  type ProjectSettings,
} from '../models/projectSettings';
import { CARD_KINDS, LOCKED_TEMPLATES, exactSizePoints } from '../templates';
import { PAPER_SIZE_IDS } from '../models/projectSettings';
import { mmToPoints } from '../units';
import { validateForExport } from '../validation/projectValidator';
import { buildLayout } from './engine';
import { totalPageCount, type GeneratedLayout, type LayoutSlot } from './types';
import { balancedSettings, card, cards, expectNear, makeProject } from '../testFixtures';
import { createCardEntry } from '../models/cardEntry';

// Frozen golden constants, derived once from LockedCardTemplate.exactSizePoints (mm / 25.4 * 72).
const A4_WIDTH_POINTS = 595.275_590_551_181_2;
const A4_HEIGHT_POINTS = 841.889_763_779_527_7;
const UNIFIED_CARD_POINTS = { width: 242.645_669_291_338_58, height: 153.014_173_228_346_44 };
const HOUSING_CARD_POINTS = { width: 255.118_110_236_220_47, height: 170.078_740_157_480_3 };

const mmPoint = (x: number, y: number): Point => ({ x: (x * 72) / 25.4, y: (y * 72) / 25.4 });
const containsPoint = (r: Rect, p: Point): boolean =>
  p.x >= r.x && p.x < maxX(r) && p.y >= r.y && p.y < maxY(r);
const slotAt = (slots: readonly LayoutSlot[], p: Point): LayoutSlot | undefined =>
  slots.find((s) => containsPoint(s.rect, p));
const counts = (pages: GeneratedLayout['frontPages']): number[] => pages.map((p) => p.length);

describe('LayoutEngineGoldenTests', () => {
  it('testUnifiedTenCardsKeepExactDimensionsAcrossSpaciousA4Sheets', () => {
    const layout = buildLayout(makeProject('unifiedOnly', cards(10, 'unified')));
    expect(counts(layout.frontPages)).toEqual([8, 2]);
    expect(counts(layout.backPages)).toEqual([8, 2]);
    expectNear(layout.pageSize.width, A4_WIDTH_POINTS, 1e-9);
    expectNear(layout.pageSize.height, A4_HEIGHT_POINTS, 1e-9);
    const first = layout.frontPages[0];
    expect(first).toBeDefined();
    for (const slot of first ?? []) {
      expectNear(slot.rect.width, UNIFIED_CARD_POINTS.width, 1e-6);
      expectNear(slot.rect.height, UNIFIED_CARD_POINTS.height, 1e-6);
    }
  });

  it('testHousingEightCardsOnA4ProduceExactFrozenDimensions', () => {
    const layout = buildLayout(makeProject('housingOnly', cards(8, 'housing')));
    expect(layout.frontPages[0]?.length).toBe(8);
    expect(layout.backPages[0]?.length).toBe(8);
    for (const slot of layout.frontPages[0] ?? []) {
      expectNear(slot.rect.width, HOUSING_CARD_POINTS.width, 1e-6);
      expectNear(slot.rect.height, HOUSING_CARD_POINTS.height, 1e-6);
    }
  });

  it('testFirstSlotSitsOnRightEdgeForRTL', () => {
    const layout = buildLayout(
      makeProject('unifiedOnly', cards(10, 'unified'), balancedSettings()),
    );
    const first = layout.frontPages[0]?.find((s) => s.slotIndex === 0);
    expect(first).toBeDefined();
    expect(midX(first?.rect ?? { x: 0, y: 0, width: 0, height: 0 })).toBeGreaterThan(
      A4_WIDTH_POINTS / 2,
    );
  });

  it('testLargeGapsReduceCapacityWithoutChangingCardDimensions', () => {
    const settings: ProjectSettings = {
      ...balancedSettings(),
      marginLeadingMM: 40,
      marginTrailingMM: 40,
      horizontalGapMM: 20,
      verticalGapMM: 20,
    };
    const layout = buildLayout(makeProject('unifiedOnly', cards(10, 'unified'), settings));
    expect(layout.frontPages[0]?.length).toBe(4);
    expect(layout.frontPages.flat().length).toBe(10);
    for (const slot of layout.frontPages[0] ?? []) {
      expectNear(slot.rect.width, UNIFIED_CARD_POINTS.width, 1e-6);
      expectNear(slot.rect.height, UNIFIED_CARD_POINTS.height, 1e-6);
    }
    expect(layout.registrationReport.effectiveHorizontalGapMM).toBe(20);
    expect(layout.registrationReport.effectiveVerticalGapMM).toBeGreaterThanOrEqual(20);
  });

  it('testLargeMarginsReduceColumnsWithoutShrinkingCardsOrGaps', () => {
    const settings: ProjectSettings = {
      ...balancedSettings(),
      marginTopMM: 50,
      marginBottomMM: 50,
      marginLeadingMM: 50,
      marginTrailingMM: 50,
    };
    const layout = buildLayout(makeProject('unifiedOnly', cards(10, 'unified'), settings));
    expect(counts(layout.frontPages)).toEqual([3, 3, 3, 1]);
    const safeRect = {
      x: mmToPoints(50),
      y: mmToPoints(50),
      width: mmToPoints(110),
      height: mmToPoints(197),
    };
    for (const slot of layout.frontPages.flat()) {
      expect(containsRect(insetBy(safeRect, -0.001, -0.001), slot.rect)).toBe(true);
    }
    expect(layout.registrationReport.effectiveVerticalGapMM).toBe(6);
  });

  it('testMixedModeMaintainsContinuousOrderAcrossSheets', () => {
    const all = [...cards(10, 'unified'), ...cards(8, 'housing')];
    const layout = buildLayout(makeProject('mixed', all));
    expect(counts(layout.frontPages)).toEqual([8, 8, 2]);
    expect(counts(layout.backPages)).toEqual([8, 8, 2]);
    expect(layout.frontPages.flat().map((s) => s.cardID)).toEqual(all.map((c) => c.id));
    expect(layout.frontPages[1]?.map((s) => s.kind)).toEqual([
      'unified',
      'unified',
      'housing',
      'housing',
      'housing',
      'housing',
      'housing',
      'housing',
    ]);
  });

  it('testHousingContinuesInNextRTLSlotForOddAndEvenUnifiedCounts', () => {
    for (const unifiedCount of [1, 2, 3, 7, 8, 9]) {
      const all = [...cards(unifiedCount, 'unified'), ...cards(5, 'housing')];
      const layout = buildLayout(makeProject('mixed', all));
      const slots = layout.frontPages.flat();
      expect(slots.map((s) => s.cardID)).toEqual(all.map((c) => c.id));
      const lastUnified = slots[unifiedCount - 1];
      const firstHousing = slots[unifiedCount];
      if (!lastUnified || !firstHousing) throw new Error('missing slots');
      if (unifiedCount % 2 === 1) {
        expect(lastUnified.sheetIndex).toBe(firstHousing.sheetIndex);
        expectNear(lastUnified.rect.y, firstHousing.rect.y, 0.001);
        expect(lastUnified.rect.x).toBeGreaterThan(maxX(firstHousing.rect));
      } else if (unifiedCount === 2) {
        expect(firstHousing.sheetIndex).toBe(0);
        expect(firstHousing.rect.y).toBeGreaterThan(maxY(lastUnified.rect));
        expect(midX(firstHousing.rect)).toBeGreaterThan(layout.pageSize.width / 2);
      }
      const pageRect = { x: 0, y: 0, ...layout.pageSize };
      for (const page of layout.frontPages) {
        page.forEach((a, index) => {
          expect(containsRect(pageRect, a.rect)).toBe(true);
          const size = exactSizePoints(LOCKED_TEMPLATES[a.kind]);
          expectNear(a.rect.width, size.width, 0.001);
          expectNear(a.rect.height, size.height, 0.001);
          for (const b of page.slice(index + 1)) {
            expect(intersects(a.rect, b.rect)).toBe(false);
            const dx = Math.max(a.rect.x - maxX(b.rect), b.rect.x - maxX(a.rect));
            const dy = Math.max(a.rect.y - maxY(b.rect), b.rect.y - maxY(a.rect));
            expect(Math.max(dx, dy)).toBeGreaterThanOrEqual(mmToPoints(6) - 0.001);
          }
        });
      }
    }
  });

  it('testDefaultSpacingIsPreservedInsteadOfSqueezingTenCardsOntoA4', () => {
    const layout = buildLayout(makeProject('unifiedOnly', cards(10, 'unified')));
    expect(counts(layout.frontPages)).toEqual([8, 2]);
    expect(layout.registrationReport.effectiveHorizontalGapMM).toBe(6);
    expect(layout.registrationReport.effectiveVerticalGapMM).toBe(6);
  });

  it('testFourCardsFlowRightLeftThenDownWithPositiveGaps', () => {
    const four = cards(4, 'unified');
    const layout = buildLayout(makeProject('unifiedOnly', four));
    const s = layout.frontPages[0] ?? [];
    const [s0, s1, s2, s3] = s;
    if (!s0 || !s1 || !s2 || !s3) throw new Error('missing slots');
    expect(s.map((x) => x.cardID)).toEqual(four.map((c) => c.id));
    expect(s0.rect.x).toBeGreaterThan(maxX(s1.rect));
    expect(s0.rect.y).toBe(s1.rect.y);
    expect(s0.rect.x).toBe(s2.rect.x);
    expect(s1.rect.x).toBe(s3.rect.x);
    expect(s2.rect.y).toBeGreaterThan(maxY(s0.rect));
    expect(s2.rect.y).toBe(s3.rect.y);
  });

  it('testImpossibleMarginsRetainSpacingOnPhysicalPage', () => {
    const settings: ProjectSettings = {
      ...balancedSettings(),
      marginLeadingMM: 50,
      marginTrailingMM: 50,
      marginTopMM: 50,
      marginBottomMM: 50,
    };
    const layout = buildLayout(makeProject('unifiedOnly', cards(10, 'unified'), settings));
    expect(layout.registrationReport.effectiveHorizontalGapMM).toBeGreaterThan(0);
    expect(layout.registrationReport.effectiveVerticalGapMM).toBeGreaterThan(0);
  });

  it('testExportRefusesCalibrationThatClipsCardsOffThePage', () => {
    const settings: ProjectSettings = {
      ...balancedSettings(),
      marginLeadingMM: 0,
      marginTrailingMM: 30,
      backOffsetXMM: 15,
    };
    const project = makeProject('unifiedOnly', cards(10, 'unified'), settings);
    expect(() => {
      validateForExport(project);
    }).toThrow();
    const images = new Map([
      ['f.jpg', { pixelWidth: 64, pixelHeight: 40, lowGrade: false }],
      ['b.jpg', { pixelWidth: 64, pixelHeight: 40, lowGrade: false }],
    ]);
    expect(canExport(inspectPreflight(project, { images, now: new Date(0) }))).toBe(false);
  });

  it('testExportRefusesPartialLayoutWhenOneTemplateCannotFit', () => {
    const settings: ProjectSettings = {
      ...balancedSettings(),
      paperSize: 'a5',
      marginLeadingMM: 30,
      marginTrailingMM: 30,
    };
    const project = makeProject('mixed', [card('unified', 0), card('housing', 0)], settings);
    expect(() => {
      validateForExport(project);
    }).toThrow();
  });

  it('testLegacyPresetsUpgradeOnceAndNewExplicitChoicesSurviveReload', () => {
    const settings = balancedSettings();
    const legacy = JSON.parse(JSON.stringify(settings)) as Record<string, unknown>;
    delete legacy.layoutPreferencesVersion;
    legacy.horizontalGapMM = 4;
    legacy.verticalGapMM = 4;
    legacy.showCropMarks = true;
    legacy.showRegistrationMarks = true;
    legacy.showSafeAreaInPreview = true;
    const upgraded = ProjectSettingsSchema.parse(legacy);
    expect(upgraded.horizontalGapMM).toBe(6);
    expect(upgraded.verticalGapMM).toBe(6);
    expect(upgraded.showCropMarks).toBe(false);
    expect(upgraded.showRegistrationMarks).toBe(false);
    expect(upgraded.showSafeAreaInPreview).toBe(false);
    legacy.horizontalGapMM = 12;
    const custom = ProjectSettingsSchema.parse(legacy);
    expect(custom.horizontalGapMM).toBe(12);
    const explicit: ProjectSettings = {
      ...settings,
      showCropMarks: true,
      showRegistrationMarks: true,
      showSafeAreaInPreview: true,
      verticalGapMM: 9,
    };
    const reloaded = ProjectSettingsSchema.parse(JSON.parse(JSON.stringify(explicit)));
    expect(reloaded).toEqual(explicit);
  });

  it('testSparsePagesStartTenMillimetresFromTopForEveryPaperAndKind', () => {
    for (const paperSize of PAPER_SIZE_IDS) {
      for (const kind of CARD_KINDS) {
        const settings = { ...defaultProjectSettings(), paperSize };
        const mode = kind === 'unified' ? 'unifiedOnly' : 'housingOnly';
        const layout = buildLayout(makeProject(mode, [card(kind, 0)], settings));
        const first = layout.frontPages[0]?.[0];
        expect(first).toBeDefined();
        expectNear(first?.rect.y ?? Number.NaN, mmToPoints(10), 0.001);
      }
    }
  });

  it('testFullA4PageUsesTenMillimetreTopAndBottomMarginsWithoutScaling', () => {
    for (const kind of CARD_KINDS) {
      const mode = kind === 'unified' ? 'unifiedOnly' : 'housingOnly';
      const layout = buildLayout(makeProject(mode, cards(8, kind)));
      const slots = layout.frontPages[0] ?? [];
      expect(slots.length).toBe(8);
      expectNear(slots[0]?.rect.y ?? Number.NaN, mmToPoints(10), 0.001);
      const last = slots.at(-1);
      expectNear(last ? maxY(last.rect) : 0, mmToPoints(287), 0.003);
      const size = exactSizePoints(LOCKED_TEMPLATES[kind]);
      for (const slot of slots) {
        expectNear(slot.rect.width, size.width, 0.001);
        expectNear(slot.rect.height, size.height, 0.001);
      }
    }
  });

  it('testRegistrationReportIsDigitallyExactForBalancedPreset', () => {
    const layout = buildLayout(makeProject('unifiedOnly', cards(8, 'unified'), balancedSettings()));
    expect(layout.registrationReport.maximumDigitalDeviationMM).toBeLessThanOrEqual(0.001);
  });
});

/**
 * Swift `PDFRegistrationTests` rasterise exported PDFs. Export lives in a later slice, so only
 * their layout geometry is ported here: each frozen sample point must fall inside the slot whose
 * artwork the Swift test expects to see there.
 */
describe('PDFRegistrationTests (layout geometry only)', () => {
  const fixture = (bleedMM = 0): ReturnType<typeof makeProject> =>
    makeProject('unifiedOnly', cards(12, 'unified'), {
      ...defaultProjectSettings(),
      bleedMM,
      autoOptimizeForPrinter: false,
    });

  it('testActualPDFPairsIdentityAndPositionsForBothEdgesAndPartialSheets', () => {
    for (const edge of ['longEdge', 'shortEdge'] as const) {
      const project = fixture();
      project.settings.duplexBindingEdge = edge;
      const layout = buildLayout(project);
      expect(totalPageCount(layout)).toBe(4);
      for (const sheet of [0, 1]) {
        const count = sheet === 0 ? 8 : 4;
        const front = layout.frontPages[sheet] ?? [];
        const back = layout.backPages[sheet] ?? [];
        for (let index = 0; index < count; index++) {
          // Frozen A4 default geometry, independent of the engine.
          const x = index % 2 === 0 ? 108 : 16.4;
          const y = 10 + Math.trunc(index / 2) * (sheet === 0 ? 74.34 : 59.98);
          const point = mmPoint(x + 10, y + 10);
          const backPoint = {
            x: edge === 'longEdge' ? ((210 - x - 85.6 + 10) * 72) / 25.4 : point.x,
            y: edge === 'shortEdge' ? ((297 - y - 53.98 + 10) * 72) / 25.4 : point.y,
          };
          const expectedCard = project.cards[sheet * 8 + index]?.id;
          expect(slotAt(front, point)?.cardID).toBe(expectedCard);
          expect(slotAt(back, backPoint)?.cardID).toBe(expectedCard);
        }
      }
    }
  });

  it('testLargeBleedAndMarksNeverOverwriteAdjacentCard', () => {
    const project = fixture(10);
    project.settings.showCropMarks = true;
    project.settings.showRegistrationMarks = true;
    const layout = buildLayout(project);
    const page = layout.frontPages[0] ?? [];
    const [first, left] = page;
    if (!first || !left) throw new Error('missing slots');
    expect(slotAt(page, { x: first.rect.x + 1, y: first.rect.y + 12 })?.cardID).toBe(first.cardID);
    const gap = { x: (first.rect.x + maxX(left.rect)) / 2, y: midY(first.rect) };
    expect(slotAt(page, gap)).toBeUndefined();
  });

  it('testActualArtworkStopsAtExactCardEdgesEvenWithLegacyPrinterBleed', () => {
    for (const kind of CARD_KINDS) {
      const base = fixture(2.1);
      const project = {
        ...base,
        mode: kind === 'unified' ? ('unifiedOnly' as const) : ('housingOnly' as const),
        cards: [
          createCardEntry({
            kind,
            order: 0,
            frontImageFileName: 'f.jpg',
            backImageFileName: 'f.jpg',
          }),
        ],
      };
      const layout = buildLayout(project);
      for (const pages of [layout.frontPages, layout.backPages]) {
        const slots = pages[0] ?? [];
        const rect = slots[0]?.rect;
        if (!rect) throw new Error('missing slot');
        expect(slotAt(slots, { x: rect.x + 2, y: rect.y + 12 })).toBeDefined();
        for (const outside of [
          { x: rect.x - 2, y: midY(rect) },
          { x: maxX(rect) + 2, y: midY(rect) },
          { x: midX(rect), y: rect.y - 2 },
          { x: midX(rect), y: maxY(rect) + 2 },
        ]) {
          expect(slotAt(slots, outside)).toBeUndefined();
        }
      }
    }
  });

  it('testNormalPreviewHasNoBlueBoundaryOrOtherAutomaticGuides', () => {
    const settings = defaultProjectSettings();
    expect(settings.showCropMarks).toBe(false);
    expect(settings.showRegistrationMarks).toBe(false);
    expect(settings.showSafeAreaInPreview).toBe(false);
    const applied = applyPrinterProfile(settings, 'brotherDCPT720DW');
    expect(applied.showCropMarks).toBe(false);
  });

  it('testMixedPDFWithThreeUnifiedCardsContinuesHousingOnLeftForBothEdges', () => {
    const base = fixture();
    const project = {
      ...base,
      mode: 'mixed' as const,
      cards: [...base.cards.slice(0, 3), ...cards(3, 'housing')],
    };
    // Independently calculated millimetre geometry: 3 rows of heights 53.98, 60, 60,
    // two 6 mm gaps, 10 mm from top. Columns reserve 90 mm.
    const rectangles = [
      { x: 112.4, y: 10, width: 85.6, height: 53.98 },
      { x: 12, y: 10, width: 85.6, height: 53.98 },
      { x: 112.4, y: 69.98, width: 85.6, height: 53.98 },
      { x: 12, y: 69.98, width: 90, height: 60 },
      { x: 108, y: 135.98, width: 90, height: 60 },
      { x: 12, y: 135.98, width: 90, height: 60 },
    ];
    for (const edge of ['longEdge', 'shortEdge'] as const) {
      project.settings = { ...project.settings, duplexBindingEdge: edge };
      const layout = buildLayout(project);
      expect(totalPageCount(layout)).toBe(2);
      const front = layout.frontPages[0] ?? [];
      const back = layout.backPages[0] ?? [];
      rectangles.forEach((rect, index) => {
        const frontPoint = mmPoint(rect.x + 10, rect.y + 10);
        const backPoint = mmPoint(
          edge === 'longEdge' ? 210 - (rect.x + rect.width) + 10 : rect.x + 10,
          edge === 'shortEdge' ? 297 - (rect.y + rect.height) + 10 : rect.y + 10,
        );
        expect(slotAt(front, frontPoint)?.cardID).toBe(project.cards[index]?.id);
        expect(slotAt(back, backPoint)?.cardID).toBe(project.cards[index]?.id);
      });
      for (const [x, y] of [
        [5, 5],
        [107.2, 74],
        [20, 132.98],
      ] as const) {
        expect(slotAt(front, mmPoint(x, y))).toBeUndefined();
      }
    }
  });

  it('testMixedPDFKeepsProtectedSizesAndFrontBackSequence', () => {
    const base = fixture();
    const housing = createCardEntry({
      kind: 'housing',
      order: 0,
      frontImageFileName: 'f.jpg',
      backImageFileName: 'f.jpg',
    });
    const project = { ...base, mode: 'mixed' as const, cards: [...base.cards, housing] };
    const layout = buildLayout(project);
    expect(totalPageCount(layout)).toBe(4);
    expectNear(layout.pageSize.width, 595.27559, 0.001);
    expectNear(layout.pageSize.height, 841.88976, 0.001);
    // Swift samples red artwork, which only the housing card (sharing card 0's image) shows there.
    expect(slotAt(layout.frontPages[1] ?? [], mmPoint(118, 139.96))?.cardID).toBe(housing.id);
    expect(slotAt(layout.backPages[1] ?? [], mmPoint(22, 139.96))?.cardID).toBe(housing.id);
  });

  // Needs the print renderer (ExactSizePDFPageRenderer) and PDF rasterisation: export slice S4.
  it.todo('testAirPrintRendererKeepsPDFSizeDespitePrinterMarginsOrPaperSize');
});
