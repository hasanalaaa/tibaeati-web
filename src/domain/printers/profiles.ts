import type { Message } from '../messages';
import {
  PAPER_SIZES,
  applyMarginPreset,
  type MarginPreset,
  type ProjectSettings,
} from '../models/projectSettings';

export const PRINTER_BRANDS = [
  'brother',
  'canon',
  'hp',
  'epson',
  'xerox',
  'ricoh',
  'kyocera',
  'generic',
] as const;
export type PrinterBrand = (typeof PRINTER_BRANDS)[number];

export const PRINTER_PROFILE_IDS = [
  'brotherDCPT720DW',
  'brotherDCPSeries',
  'brotherMFCSeries',
  'brotherHLSeries',
  'brotherInkBenefit',
  'canonPixmaG3411',
  'canonPixmaGSeries',
  'canonPixmaTSSeries',
  'canonPixmaTRSeries',
  'canonMegaTank',
  'canonImageClass',
  'hpLaserJet',
  'hpSmartTank',
  'hpOfficeJet',
  'hpDeskJet',
  'epsonEcoTank',
  'epsonWorkForce',
  'xeroxVersaLink',
  'ricohIMSeries',
  'kyoceraEcosys',
  'genericLaser',
  'genericInkjet',
] as const;
export type PrinterProfileId = (typeof PRINTER_PROFILE_IDS)[number];

/** Default when nothing has been chosen yet (Swift `PrinterProfileStore` fallback). */
export const DEFAULT_PRINTER_PROFILE_ID: PrinterProfileId = 'brotherDCPT720DW';

export function isPrinterProfileId(value: string): value is PrinterProfileId {
  return (PRINTER_PROFILE_IDS as readonly string[]).includes(value);
}

export interface PrinterCalibration {
  readonly backOffsetXMM: number;
  readonly backOffsetYMM: number;
  readonly bleedMM: number;
  readonly safeAreaMM: number;
  readonly recommendedPreset: MarginPreset;
  readonly showCropMarks: boolean;
  readonly flipBackHorizontally: boolean;
  readonly flipBackVertically: boolean;
  readonly backScaleX: number;
  readonly backScaleY: number;
}

export interface PrinterProfile {
  readonly id: PrinterProfileId;
  readonly brand: PrinterBrand;
  readonly calibration: PrinterCalibration;
}

// Every built-in profile prints crop marks, never flips the back and has unit back scale.
const profile = (
  id: PrinterProfileId,
  brand: PrinterBrand,
  backOffsetXMM: number,
  backOffsetYMM: number,
  bleedMM: number,
  safeAreaMM: number,
  recommendedPreset: MarginPreset,
): PrinterProfile => ({
  id,
  brand,
  calibration: {
    backOffsetXMM,
    backOffsetYMM,
    bleedMM,
    safeAreaMM,
    recommendedPreset,
    showCropMarks: true,
    flipBackHorizontally: false,
    flipBackVertically: false,
    backScaleX: 1,
    backScaleY: 1,
  },
});

export const PRINTER_PROFILES: Readonly<Record<PrinterProfileId, PrinterProfile>> = {
  brotherDCPT720DW: profile('brotherDCPT720DW', 'brother', 0.15, -0.45, 2.1, 3.2, 'printSafe'),
  brotherDCPSeries: profile('brotherDCPSeries', 'brother', 0.1, -0.35, 2.0, 3.0, 'balanced'),
  brotherMFCSeries: profile('brotherMFCSeries', 'brother', 0.0, -0.3, 2.0, 3.0, 'balanced'),
  brotherHLSeries: profile('brotherHLSeries', 'brother', 0.0, -0.2, 1.8, 2.8, 'balanced'),
  brotherInkBenefit: profile('brotherInkBenefit', 'brother', 0.1, -0.35, 2.0, 3.0, 'printSafe'),
  canonPixmaG3411: profile('canonPixmaG3411', 'canon', 0.1, -0.4, 2.0, 3.0, 'printSafe'),
  canonPixmaGSeries: profile('canonPixmaGSeries', 'canon', 0.1, -0.35, 1.9, 3.0, 'balanced'),
  canonPixmaTSSeries: profile('canonPixmaTSSeries', 'canon', 0.0, -0.25, 1.8, 2.8, 'balanced'),
  canonPixmaTRSeries: profile('canonPixmaTRSeries', 'canon', 0.0, -0.25, 1.8, 2.8, 'balanced'),
  canonMegaTank: profile('canonMegaTank', 'canon', 0.1, -0.3, 1.9, 2.9, 'balanced'),
  canonImageClass: profile('canonImageClass', 'canon', 0.0, -0.15, 1.7, 2.7, 'compact'),
  hpLaserJet: profile('hpLaserJet', 'hp', 0.0, -0.2, 1.8, 2.8, 'compact'),
  hpSmartTank: profile('hpSmartTank', 'hp', 0.1, -0.3, 1.9, 3.0, 'balanced'),
  hpOfficeJet: profile('hpOfficeJet', 'hp', 0.0, -0.25, 1.8, 2.9, 'balanced'),
  hpDeskJet: profile('hpDeskJet', 'hp', 0.0, -0.25, 1.7, 2.8, 'balanced'),
  epsonEcoTank: profile('epsonEcoTank', 'epson', 0.1, -0.3, 1.9, 3.0, 'balanced'),
  epsonWorkForce: profile('epsonWorkForce', 'epson', 0.0, -0.2, 1.8, 2.8, 'balanced'),
  xeroxVersaLink: profile('xeroxVersaLink', 'xerox', 0.0, -0.1, 1.7, 2.7, 'compact'),
  ricohIMSeries: profile('ricohIMSeries', 'ricoh', 0.0, -0.15, 1.7, 2.7, 'compact'),
  kyoceraEcosys: profile('kyoceraEcosys', 'kyocera', 0.0, -0.1, 1.7, 2.7, 'compact'),
  genericLaser: profile('genericLaser', 'generic', 0.0, -0.15, 1.7, 2.7, 'compact'),
  genericInkjet: profile('genericInkjet', 'generic', 0.05, -0.3, 1.8, 2.8, 'balanced'),
};

export const printerTitleKey = (id: PrinterProfileId): `printer.${PrinterProfileId}.title` =>
  `printer.${id}.title`;

export const printerSubtitleKey = (id: PrinterProfileId): `printer.${PrinterProfileId}.subtitle` =>
  `printer.${id}.subtitle`;

export const printerBrandTitleKey = (brand: PrinterBrand): `printerBrand.${PrinterBrand}` =>
  `printerBrand.${brand}`;

/** A user-measured duplex calibration that overrides a profile's built-in values. */
export interface MeasuredCalibration {
  readonly x: number;
  readonly y: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

const clampScale = (value: number): number => Math.min(Math.max(value, 0.97), 1.03);

export function applyPrinterProfile(
  settings: ProjectSettings,
  id: PrinterProfileId,
  options: { readonly nickname?: string; readonly measured?: MeasuredCalibration } = {},
): ProjectSettings {
  const calibration = PRINTER_PROFILES[id].calibration;
  const { measured } = options;
  const next: ProjectSettings = {
    ...applyMarginPreset(settings, calibration.recommendedPreset),
    backOffsetXMM: measured ? measured.x : calibration.backOffsetXMM,
    backOffsetYMM: measured ? measured.y : calibration.backOffsetYMM,
    // The Swift override store clamps scale on read; clamping here keeps that guarantee.
    backScaleX: measured ? clampScale(measured.scaleX) : calibration.backScaleX,
    backScaleY: measured ? clampScale(measured.scaleY) : calibration.backScaleY,
    bleedMM: 0,
    safeAreaMM: calibration.safeAreaMM,
    flipBackHorizontally: calibration.flipBackHorizontally,
    flipBackVertically: calibration.flipBackVertically,
    appliedPrinterProfileID: id,
  };
  const nickname = options.nickname?.trim();
  if (nickname) next.printerNickname = nickname;
  else delete next.printerNickname;
  return next;
}

function appliedOrSelected(
  settings: ProjectSettings,
  selectedProfileId: PrinterProfileId,
): { readonly id: PrinterProfileId; readonly applied: boolean } {
  const applied = settings.appliedPrinterProfileID;
  return applied !== undefined && isPrinterProfileId(applied)
    ? { id: applied, applied: true }
    : { id: selectedProfileId, applied: false };
}

export function activePrinterDisplayName(
  settings: ProjectSettings,
  selectedProfileId: PrinterProfileId,
): Message {
  const { id, applied } = appliedOrSelected(settings, selectedProfileId);
  const title: Message = { key: printerTitleKey(id) };
  const nickname = settings.printerNickname;
  if (applied && nickname) {
    return { key: 'printer.nicknameWithModel', params: { nickname, printer: title } };
  }
  return title;
}

export function autoOptimizationSummary(
  settings: ProjectSettings,
  selectedProfileId: PrinterProfileId,
): Message {
  const { id } = appliedOrSelected(settings, selectedProfileId);
  return {
    key: 'settings.autoOptimizationSummary',
    params: {
      profile: { key: printerTitleKey(id) },
      paper: PAPER_SIZES[settings.paperSize].displayName,
    },
  };
}
