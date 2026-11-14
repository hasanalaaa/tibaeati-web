import { z } from 'zod';
import {
  DEFAULT_BLEED_MM,
  DEFAULT_GAP_MM,
  DEFAULT_MARGIN_MM,
  DEFAULT_SAFE_AREA_MM,
  EXPORTED_IMAGE_DPI,
  MAXIMUM_EXPORTED_IMAGE_DPI,
  MINIMUM_EXPORTED_IMAGE_DPI,
} from '../constants';
import type { Size } from '../geometry';
import { pageSizePoints } from '../units';

export const DUPLEX_BINDING_EDGES = ['longEdge', 'shortEdge'] as const;
export type DuplexBindingEdge = (typeof DUPLEX_BINDING_EDGES)[number];

export const PAPER_SIZE_IDS = ['a5', 'a4', 'a3', 'letter', 'legal'] as const;
export type PaperSizeOption = (typeof PAPER_SIZE_IDS)[number];

/** Paper names are the same in every language. */
export const PAPER_SIZES: Readonly<
  Record<PaperSizeOption, { readonly displayName: string; readonly sizeMM: Size }>
> = {
  a5: { displayName: 'A5', sizeMM: { width: 148, height: 210 } },
  a4: { displayName: 'A4', sizeMM: { width: 210, height: 297 } },
  a3: { displayName: 'A3', sizeMM: { width: 297, height: 420 } },
  letter: { displayName: 'US Letter', sizeMM: { width: 215.9, height: 279.4 } },
  legal: { displayName: 'US Legal', sizeMM: { width: 215.9, height: 355.6 } },
};

export function paperPageSizePoints(paper: PaperSizeOption): Size {
  const { width, height } = PAPER_SIZES[paper].sizeMM;
  return pageSizePoints(width, height);
}

export const MARGIN_PRESETS = ['balanced', 'compact', 'printSafe'] as const;
export type MarginPreset = (typeof MARGIN_PRESETS)[number];

export interface MarginValues {
  readonly top: number;
  readonly bottom: number;
  readonly leading: number;
  readonly trailing: number;
  readonly horizontalGap: number;
  readonly verticalGap: number;
}

export const MARGIN_PRESET_VALUES: Readonly<Record<MarginPreset, MarginValues>> = {
  balanced: { top: 10, bottom: 10, leading: 8, trailing: 8, horizontalGap: 6, verticalGap: 6 },
  compact: { top: 10, bottom: 10, leading: 6, trailing: 6, horizontalGap: 5, verticalGap: 5 },
  printSafe: { top: 10, bottom: 10, leading: 10, trailing: 10, horizontalGap: 6, verticalGap: 6 },
};

/** Duplex correction in physical millimetres: translation for feed drift, scale for X/Y expansion. */
export interface DuplexCalibrationTransform {
  readonly offsetXMM: number;
  readonly offsetYMM: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

const clampFinite = (value: number, low: number, high: number, fallback: number): number =>
  Number.isFinite(value) ? Math.min(Math.max(value, low), high) : fallback;

export function normalizeDuplexCalibration(
  c: DuplexCalibrationTransform,
): DuplexCalibrationTransform {
  return {
    offsetXMM: Math.min(Math.max(Number.isFinite(c.offsetXMM) ? c.offsetXMM : 0, -15), 15),
    offsetYMM: Math.min(Math.max(Number.isFinite(c.offsetYMM) ? c.offsetYMM : 0, -15), 15),
    scaleX: Math.min(Math.max(Number.isFinite(c.scaleX) ? c.scaleX : 1, 0.97), 1.03),
    scaleY: Math.min(Math.max(Number.isFinite(c.scaleY) ? c.scaleY : 1, 0.97), 1.03),
  };
}

const RawProjectSettingsSchema = z.object({
  marginTopMM: z.number().default(DEFAULT_MARGIN_MM),
  marginBottomMM: z.number().default(DEFAULT_MARGIN_MM),
  marginLeadingMM: z.number().default(DEFAULT_MARGIN_MM),
  marginTrailingMM: z.number().default(DEFAULT_MARGIN_MM),
  horizontalGapMM: z.number().default(DEFAULT_GAP_MM),
  verticalGapMM: z.number().default(DEFAULT_GAP_MM),
  bleedMM: z.number().default(DEFAULT_BLEED_MM),
  safeAreaMM: z.number().default(DEFAULT_SAFE_AREA_MM),
  backOffsetXMM: z.number().default(0),
  backOffsetYMM: z.number().default(0),
  backScaleX: z.number().default(1),
  backScaleY: z.number().default(1),
  duplexBindingEdge: z.enum(DUPLEX_BINDING_EDGES).default('longEdge'),
  flipBackHorizontally: z.boolean().default(false),
  flipBackVertically: z.boolean().default(false),
  showCropMarks: z.boolean().default(false),
  showRegistrationMarks: z.boolean().default(false),
  showSafeAreaInPreview: z.boolean().default(false),
  exportDPI: z.number().default(EXPORTED_IMAGE_DPI),
  paperSize: z.enum(PAPER_SIZE_IDS).default('a4'),
  marginPreset: z.enum(MARGIN_PRESETS).default('balanced'),
  autoOptimizeForPrinter: z.boolean().default(true),
  lockCardTemplate: z.boolean().default(true),
  appliedPrinterProfileID: z.string().optional(),
  printerNickname: z.string().optional(),
  layoutPreferencesVersion: z.literal(1).optional(),
});

export type ProjectSettings = Omit<
  z.output<typeof RawProjectSettingsSchema>,
  'layoutPreferencesVersion'
> & { layoutPreferencesVersion: 1 };

export function defaultProjectSettings(): ProjectSettings {
  return {
    marginTopMM: DEFAULT_MARGIN_MM,
    marginBottomMM: DEFAULT_MARGIN_MM,
    marginLeadingMM: DEFAULT_MARGIN_MM,
    marginTrailingMM: DEFAULT_MARGIN_MM,
    horizontalGapMM: DEFAULT_GAP_MM,
    verticalGapMM: DEFAULT_GAP_MM,
    bleedMM: DEFAULT_BLEED_MM,
    safeAreaMM: DEFAULT_SAFE_AREA_MM,
    backOffsetXMM: 0,
    backOffsetYMM: 0,
    backScaleX: 1,
    backScaleY: 1,
    duplexBindingEdge: 'longEdge',
    flipBackHorizontally: false,
    flipBackVertically: false,
    showCropMarks: false,
    showRegistrationMarks: false,
    showSafeAreaInPreview: false,
    exportDPI: EXPORTED_IMAGE_DPI,
    paperSize: 'a4',
    marginPreset: 'balanced',
    autoOptimizeForPrinter: true,
    lockCardTemplate: true,
    layoutPreferencesVersion: 1,
  };
}

/** Protected bounds shared by decoding and `ProjectValidator.normalized(settings)`. */
export function normalizeSettings(settings: ProjectSettings): ProjectSettings {
  return {
    ...settings,
    marginTopMM: clampFinite(settings.marginTopMM, 10, 50, DEFAULT_MARGIN_MM),
    marginBottomMM: clampFinite(settings.marginBottomMM, 10, 50, DEFAULT_MARGIN_MM),
    marginLeadingMM: clampFinite(settings.marginLeadingMM, 0, 50, DEFAULT_MARGIN_MM),
    marginTrailingMM: clampFinite(settings.marginTrailingMM, 0, 50, DEFAULT_MARGIN_MM),
    horizontalGapMM: clampFinite(settings.horizontalGapMM, 0, 30, DEFAULT_GAP_MM),
    verticalGapMM: clampFinite(settings.verticalGapMM, 0, 30, DEFAULT_GAP_MM),
    // Legacy external bleed must not enlarge protected card artwork.
    bleedMM: 0,
    safeAreaMM: clampFinite(settings.safeAreaMM, 0, 20, DEFAULT_SAFE_AREA_MM),
    backOffsetXMM: clampFinite(settings.backOffsetXMM, -15, 15, 0),
    backOffsetYMM: clampFinite(settings.backOffsetYMM, -15, 15, 0),
    backScaleX: clampFinite(settings.backScaleX, 0.97, 1.03, 1),
    backScaleY: clampFinite(settings.backScaleY, 0.97, 1.03, 1),
    exportDPI: clampFinite(
      settings.exportDPI,
      MINIMUM_EXPORTED_IMAGE_DPI,
      MAXIMUM_EXPORTED_IMAGE_DPI,
      EXPORTED_IMAGE_DPI,
    ),
    lockCardTemplate: true,
  };
}

export const ProjectSettingsSchema = RawProjectSettingsSchema.transform(
  ({ layoutPreferencesVersion, ...raw }): ProjectSettings => {
    const settings: ProjectSettings = { ...raw, layoutPreferencesVersion: 1 };
    if (layoutPreferencesVersion === undefined) {
      // Upgrade old automatic guides and preset gaps once. Explicit choices saved with the
      // version marker survive subsequent loads and optimisation.
      settings.showCropMarks = false;
      settings.showRegistrationMarks = false;
      settings.showSafeAreaInPreview = false;
      const oldGap = settings.marginPreset === 'compact' ? 3 : 4;
      const preset = MARGIN_PRESET_VALUES[settings.marginPreset];
      if (settings.horizontalGapMM === oldGap) settings.horizontalGapMM = preset.horizontalGap;
      if (settings.verticalGapMM === oldGap) settings.verticalGapMM = preset.verticalGap;
    }
    return normalizeSettings(settings);
  },
);

export function clampedExportDPI(settings: ProjectSettings): number {
  return Math.min(
    Math.max(settings.exportDPI, MINIMUM_EXPORTED_IMAGE_DPI),
    MAXIMUM_EXPORTED_IMAGE_DPI,
  );
}

export function duplexCalibration(settings: ProjectSettings): DuplexCalibrationTransform {
  return normalizeDuplexCalibration({
    offsetXMM: settings.backOffsetXMM,
    offsetYMM: settings.backOffsetYMM,
    scaleX: settings.backScaleX,
    scaleY: settings.backScaleY,
  });
}

export function applyMarginPreset(
  settings: ProjectSettings,
  preset: MarginPreset,
): ProjectSettings {
  const values = MARGIN_PRESET_VALUES[preset];
  return {
    ...settings,
    marginPreset: preset,
    marginTopMM: values.top,
    marginBottomMM: values.bottom,
    marginLeadingMM: values.leading,
    marginTrailingMM: values.trailing,
    horizontalGapMM: values.horizontalGap,
    verticalGapMM: values.verticalGap,
  };
}

export type ExportQuality = 'fast' | 'good' | 'high' | 'professional';

export function exportQuality(settings: ProjectSettings): ExportQuality {
  const dpi = clampedExportDPI(settings);
  if (dpi < 200) return 'fast';
  if (dpi < 400) return 'good';
  if (dpi < 550) return 'high';
  return 'professional';
}

export const exportQualityKey = (settings: ProjectSettings): `exportQuality.${ExportQuality}` =>
  `exportQuality.${exportQuality(settings)}`;

export const duplexEdgeTitleKey = (edge: DuplexBindingEdge): `duplexEdge.${DuplexBindingEdge}` =>
  `duplexEdge.${edge}`;

export const marginPresetTitleKey = (preset: MarginPreset): `marginPreset.${MarginPreset}` =>
  `marginPreset.${preset}`;
