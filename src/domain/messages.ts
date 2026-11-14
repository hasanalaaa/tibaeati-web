import type { AppErrorCode } from './errors';
import type { DuplexBindingEdge, ExportQuality, MarginPreset } from './models/projectSettings';
import type { PrinterBrand, PrinterProfileId } from './printers/profiles';
import type { CardKind } from './templates';

/** Preflight rules whose title and detail are both plain dictionary entries. */
export type PreflightRuleKey =
  | 'missingFiles'
  | 'noImages'
  | 'layoutEmpty'
  | 'registrationExact'
  | 'templateLocked'
  | 'idealResolution'
  | 'mixedSequence'
  | 'actualSize'
  | 'oneSided'
  | 'lowResolution'
  | 'calibrationApplied'
  | 'calibrationNeeded'
  | 'imageQuality';

/**
 * Every i18n key the domain can return. The app dictionaries (`src/app/i18n/ar.ts`, `en.ts`)
 * must define each of these; placeholders are written `{name}` and filled from `params`.
 */
export type MessageKey =
  | `cardKind.${CardKind}`
  | `card.title.${CardKind}`
  | 'card.side.front'
  | 'card.side.back'
  | `duplexEdge.${DuplexBindingEdge}`
  | `marginPreset.${MarginPreset}`
  | `exportQuality.${ExportQuality}`
  | 'settings.autoOptimizationSummary'
  | `printer.${PrinterProfileId}.title`
  | `printer.${PrinterProfileId}.subtitle`
  | `printerBrand.${PrinterBrand}`
  | 'printer.nicknameWithModel'
  | 'duplex.status.exact'
  | 'duplex.status.deviation'
  | `appError.${AppErrorCode}`
  | 'validation.marginsExceedPaper'
  | 'validation.lockedSizeDoesNotFit'
  | 'validation.someCardsDoNotFit'
  | 'validation.calibrationOffPage'
  | 'validation.registrationNotGuaranteed'
  | `preflight.${PreflightRuleKey}.title`
  | `preflight.${PreflightRuleKey}.detail`
  | 'preflight.exportGeometry.title'
  | 'preflight.registrationDrift.title'
  | 'preflight.headline.blocking'
  | 'preflight.headline.warnings'
  | 'preflight.headline.ready'
  | 'project.untitled';

export type MessageParam = string | number | Message;
export type MessageParams = Readonly<Record<string, MessageParam>>;

export interface Message {
  readonly key: MessageKey;
  readonly params?: MessageParams;
}
