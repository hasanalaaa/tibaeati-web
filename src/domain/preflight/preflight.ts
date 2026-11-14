import { DomainError, appErrorMessage } from '../errors';
import { formatFixed } from '../format';
import { randomId, type NewId } from '../ids';
import { buildLayout } from '../layout/engine';
import { isDigitallyExact, isLayoutEmpty, registrationStatus } from '../layout/types';
import type { Message, MessageParams, PreflightRuleKey } from '../messages';
import { normalizePlacement, type CardImagePlacement } from '../models/cardImagePlacement';
import { cardHasAnyImage } from '../models/cardEntry';
import type { PrintProject } from '../models/printProject';
import { PAPER_SIZES, clampedExportDPI, normalizeSettings } from '../models/projectSettings';
import { modeCardKinds } from '../modes';
import { LOCKED_TEMPLATES, cardKindTitleKey, exactSizeMM, type CardKind } from '../templates';
import { millimetresToPixels } from '../units';
import { validateForExport } from '../validation/projectValidator';
import { normalizeCards } from '../validation/normalize';
import {
  PREFLIGHT_SEVERITY_RANK,
  type PreflightIssue,
  type PreflightReport,
  type PreflightSeverity,
} from './types';

/** What the image store knows about one stored image. Absent from the map = unreadable. */
export interface ImageFacts {
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  /** Scan quality grade C or worse (advisory only, never blocking). */
  readonly lowGrade: boolean;
}

export interface PreflightInput {
  readonly images: ReadonlyMap<string, ImageFacts>;
  readonly now: Date;
  readonly newId?: NewId;
}

const issue = (
  id: string,
  severity: PreflightSeverity,
  key: PreflightRuleKey,
  params: { title?: MessageParams; detail?: MessageParams } = {},
): PreflightIssue => ({
  id,
  severity,
  title: withParams(`preflight.${key}.title`, params.title),
  detail: withParams(`preflight.${key}.detail`, params.detail),
});

const withParams = (key: Message['key'], params: MessageParams | undefined): Message =>
  params ? { key, params } : { key };

export function inspectPreflight(project: PrintProject, input: PreflightInput): PreflightReport {
  const newId = input.newId ?? randomId;
  const settings = normalizeSettings(project.settings);
  const normalized: PrintProject = {
    ...project,
    settings,
    cards: normalizeCards(project.cards, newId),
  };
  const layout = buildLayout(normalized, newId);
  const issues: PreflightIssue[] = [];
  const activeCards = normalized.cards.filter(cardHasAnyImage);
  const sides = (c: (typeof activeCards)[number]): string[] =>
    [c.frontImageFileName, c.backImageFileName].filter((n): n is string => n !== undefined);

  const referenced = new Set(activeCards.flatMap(sides));
  const missing = [...referenced].filter((name) => !input.images.has(name));
  if (missing.length > 0) {
    issues.push(
      issue('missing-files', 'blocking', 'missingFiles', { detail: { count: missing.length } }),
    );
  }

  if (activeCards.length === 0) issues.push(issue('no-images', 'blocking', 'noImages'));

  if (isLayoutEmpty(layout) && activeCards.length > 0) {
    issues.push(issue('layout-empty', 'blocking', 'layoutEmpty'));
  }

  if (!isLayoutEmpty(layout)) {
    try {
      validateForExport(normalized, newId);
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      issues.push({
        id: 'export-geometry',
        severity: 'blocking',
        title: { key: 'preflight.exportGeometry.title' },
        detail: appErrorMessage(error.error),
      });
    }
  }

  if (!isDigitallyExact(layout.registrationReport)) {
    issues.push({
      id: 'registration-drift',
      severity: 'blocking',
      title: { key: 'preflight.registrationDrift.title' },
      detail: registrationStatus(layout.registrationReport),
    });
  } else if (!isLayoutEmpty(layout)) {
    issues.push(issue('registration-exact', 'information', 'registrationExact'));
  }

  const dpi = clampedExportDPI(settings);
  for (const kind of modeCardKinds(normalized.mode)) {
    const expected = exactSizeMM(LOCKED_TEMPLATES[kind]);
    const kindTitle: Message = { key: cardKindTitleKey(kind) };
    issues.push(
      issue(`template-locked-${kind}`, 'information', 'templateLocked', {
        title: { kind: kindTitle },
        detail: { width: formatFixed(expected.width, 2), height: formatFixed(expected.height, 2) },
      }),
    );

    const bleed = Math.max(0, settings.bleedMM) * 2;
    const idealWidth = Math.trunc(Math.ceil(millimetresToPixels(expected.width + bleed, dpi)));
    const idealHeight = Math.trunc(Math.ceil(millimetresToPixels(expected.height + bleed, dpi)));
    issues.push(
      issue(`ideal-resolution-${kind}-${Math.trunc(dpi)}`, 'information', 'idealResolution', {
        title: { kind: kindTitle },
        detail: { width: idealWidth, height: idealHeight, dpi: Math.trunc(dpi) },
      }),
    );
  }

  if (normalized.mode === 'mixed') {
    issues.push(issue('mixed-export-sequence', 'information', 'mixedSequence'));
  }

  issues.push(
    issue('actual-size-printing', 'information', 'actualSize', {
      detail: { paper: PAPER_SIZES[settings.paperSize].displayName },
    }),
  );

  const incompleteCount = activeCards.filter(
    (c) => (c.frontImageFileName === undefined) !== (c.backImageFileName === undefined),
  ).length;
  if (incompleteCount > 0) {
    issues.push(issue('one-sided', 'warning', 'oneSided', { detail: { count: incompleteCount } }));
  }

  const isLowResolution = (
    fileName: string | undefined,
    kind: CardKind,
    placement: CardImagePlacement,
  ): boolean => {
    const facts = fileName === undefined ? undefined : input.images.get(fileName);
    if (!facts) return false;
    const size = exactSizeMM(LOCKED_TEMPLATES[kind]);
    const scale = normalizePlacement(placement).scale;
    const requiredWidth = millimetresToPixels(size.width + settings.bleedMM * 2, dpi) * scale;
    const requiredHeight = millimetresToPixels(size.height + settings.bleedMM * 2, dpi) * scale;
    return facts.pixelWidth + 8 < requiredWidth || facts.pixelHeight + 8 < requiredHeight;
  };
  let lowResolutionCount = 0;
  for (const card of activeCards) {
    if (isLowResolution(card.frontImageFileName, card.kind, card.frontPlacement))
      lowResolutionCount++;
    if (isLowResolution(card.backImageFileName, card.kind, card.backPlacement))
      lowResolutionCount++;
  }
  if (lowResolutionCount > 0) {
    issues.push(
      issue('low-resolution', 'warning', 'lowResolution', {
        detail: { count: lowResolutionCount, dpi: Math.trunc(dpi) },
      }),
    );
  }

  if (
    Math.abs(settings.backOffsetXMM) > 0.001 ||
    Math.abs(settings.backOffsetYMM) > 0.001 ||
    Math.abs(settings.backScaleX - 1) > 0.0001 ||
    Math.abs(settings.backScaleY - 1) > 0.0001
  ) {
    issues.push(
      issue('calibration-applied', 'information', 'calibrationApplied', {
        detail: {
          x: formatFixed(settings.backOffsetXMM, 2),
          y: formatFixed(settings.backOffsetYMM, 2),
          sx: formatFixed(settings.backScaleX, 4),
          sy: formatFixed(settings.backScaleY, 4),
        },
      }),
    );
  } else {
    issues.push(issue('calibration-needed', 'warning', 'calibrationNeeded'));
  }

  const poorQualityCount = activeCards
    .flatMap(sides)
    .filter((name) => input.images.get(name)?.lowGrade === true).length;
  if (poorQualityCount > 0) {
    issues.push(
      issue('image-quality', 'warning', 'imageQuality', { detail: { count: poorQualityCount } }),
    );
  }

  issues.sort((lhs, rhs) => {
    if (lhs.severity !== rhs.severity) {
      return PREFLIGHT_SEVERITY_RANK[rhs.severity] - PREFLIGHT_SEVERITY_RANK[lhs.severity];
    }
    return lhs.id < rhs.id ? -1 : lhs.id > rhs.id ? 1 : 0;
  });
  return { issues, checkedAt: input.now };
}
