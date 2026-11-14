import type { AppErrorCode } from '@/domain/errors';
import type { MessageKey as DomainMessageKey, PreflightRuleKey } from '@/domain/messages';
import { DUPLEX_BINDING_EDGES, MARGIN_PRESETS } from '@/domain/models/projectSettings';
import type { ExportQuality } from '@/domain/models/projectSettings';
import { PRINTER_BRANDS, PRINTER_PROFILE_IDS } from '@/domain/printers/profiles';
import { CARD_KINDS } from '@/domain/templates';
import { ar } from './ar';
import { en } from './en';
import { formatMessage, interpolate } from './format';

describe('i18n dictionaries', () => {
  it('ar and en have identical key sets', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ar).sort());
  });
  it('has no empty strings', () => {
    for (const dict of [ar, en]) {
      for (const value of Object.values(dict)) expect(value.trim()).not.toBe('');
    }
  });
});

// Records force these lists to stay complete: a new union member that is not listed fails tsc.
const APP_ERROR_CODES: Record<AppErrorCode, true> = {
  invalidProject: true,
  noPrintableCards: true,
  storageUnavailable: true,
  readFailed: true,
  writeFailed: true,
  corruptProject: true,
  imageEncodingFailed: true,
  imageDecodingFailed: true,
  missingImage: true,
  invalidFileName: true,
  exportFailed: true,
  printCancelled: true,
  unsupportedProjectVersion: true,
  fileTooLarge: true,
  unsupportedFileType: true,
  invalidBackup: true,
};
const PREFLIGHT_RULES: Record<PreflightRuleKey, true> = {
  missingFiles: true,
  noImages: true,
  layoutEmpty: true,
  registrationExact: true,
  templateLocked: true,
  idealResolution: true,
  mixedSequence: true,
  actualSize: true,
  oneSided: true,
  lowResolution: true,
  calibrationApplied: true,
  calibrationNeeded: true,
  imageQuality: true,
};
const QUALITIES: Record<ExportQuality, true> = {
  fast: true,
  good: true,
  high: true,
  professional: true,
};

const DOMAIN_KEYS: readonly DomainMessageKey[] = [
  ...CARD_KINDS.map((k) => `cardKind.${k}` as const),
  ...CARD_KINDS.map((k) => `card.title.${k}` as const),
  'card.side.front',
  'card.side.back',
  ...DUPLEX_BINDING_EDGES.map((e) => `duplexEdge.${e}` as const),
  ...MARGIN_PRESETS.map((p) => `marginPreset.${p}` as const),
  ...(Object.keys(QUALITIES) as ExportQuality[]).map((q) => `exportQuality.${q}` as const),
  'settings.autoOptimizationSummary',
  ...PRINTER_PROFILE_IDS.flatMap(
    (id) => [`printer.${id}.title`, `printer.${id}.subtitle`] as const,
  ),
  ...PRINTER_BRANDS.map((b) => `printerBrand.${b}` as const),
  'printer.nicknameWithModel',
  'duplex.status.exact',
  'duplex.status.deviation',
  ...(Object.keys(APP_ERROR_CODES) as AppErrorCode[]).map((c) => `appError.${c}` as const),
  'validation.marginsExceedPaper',
  'validation.lockedSizeDoesNotFit',
  'validation.someCardsDoNotFit',
  'validation.calibrationOffPage',
  'validation.registrationNotGuaranteed',
  ...(Object.keys(PREFLIGHT_RULES) as PreflightRuleKey[]).flatMap(
    (r) => [`preflight.${r}.title`, `preflight.${r}.detail`] as const,
  ),
  'preflight.exportGeometry.title',
  'preflight.registrationDrift.title',
  'preflight.headline.blocking',
  'preflight.headline.warnings',
  'preflight.headline.ready',
  'project.untitled',
];

describe('domain MessageKey coverage', () => {
  it.each([
    ['ar', ar],
    ['en', en],
  ] as const)('every domain MessageKey exists in %s', (_name, dict) => {
    const missing = DOMAIN_KEYS.filter((key) => !(key in dict));
    expect(missing).toEqual([]);
  });
});

describe('interpolation', () => {
  const lookup = (key: string): string => en[key as keyof typeof en];

  it('fills simple placeholders and leaves unknown ones', () => {
    expect(interpolate('Hi {name} {x}', { name: 'Ali' }, lookup)).toBe('Hi Ali {x}');
    expect(interpolate('n={n}', { n: 3 }, lookup)).toBe('n=3');
  });
  it('resolves nested messages', () => {
    expect(
      formatMessage(
        {
          key: 'card.side.front',
          params: { title: { key: 'card.title.unified', params: { number: 2 } } },
        },
        lookup,
      ),
    ).toBe('Front Unified Card 2');
  });
});
