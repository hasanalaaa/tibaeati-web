import { DomainError } from '../errors';
import { containsRect, insetBy } from '../geometry';
import { randomId, type NewId } from '../ids';
import { buildLayout } from '../layout/engine';
import { isLayoutEmpty } from '../layout/types';
import type { Message } from '../messages';
import { cardHasAnyImage } from '../models/cardEntry';
import type { PrintProject } from '../models/printProject';
import { normalizeSettings, paperPageSizePoints } from '../models/projectSettings';
import { mmToPoints } from '../units';

export {
  normalizeCards,
  normalizeProject,
  normalizeProjectName,
  normalizeSettings,
  type NormalizeOptions,
} from './normalize';

const invalid = (key: Message['key']): DomainError =>
  new DomainError({ code: 'invalidProject', reason: { key } });

/** Throws `DomainError` when the project cannot be exported exactly. */
export function validateForExport(project: PrintProject, newId: NewId = randomId): void {
  if (!project.cards.some(cardHasAnyImage)) {
    throw new DomainError({ code: 'noPrintableCards' });
  }

  const settings = normalizeSettings(project.settings);
  const pageSize = paperPageSizePoints(settings.paperSize);
  const horizontalMargins = mmToPoints(settings.marginLeadingMM + settings.marginTrailingMM);
  const verticalMargins = mmToPoints(settings.marginTopMM + settings.marginBottomMM);
  if (!(pageSize.width > horizontalMargins && pageSize.height > verticalMargins)) {
    throw invalid('validation.marginsExceedPaper');
  }

  const layout = buildLayout(project, newId);
  if (isLayoutEmpty(layout)) throw invalid('validation.lockedSizeDoesNotFit');

  const activeIds = new Set(project.cards.filter(cardHasAnyImage).map((c) => c.id));
  const placedIds = new Set(layout.frontPages.flatMap((p) => p.map((s) => s.cardID)));
  const sameIds =
    activeIds.size === placedIds.size && [...activeIds].every((id) => placedIds.has(id));
  if (!sameIds || layout.frontPages.length !== layout.backPages.length) {
    throw invalid('validation.someCardsDoNotFit');
  }

  const page = insetBy({ x: 0, y: 0, ...layout.pageSize }, -0.001, -0.001);
  const allSlots = [...layout.frontPages, ...layout.backPages].flat();
  if (!allSlots.every((slot) => containsRect(page, slot.rect))) {
    throw invalid('validation.calibrationOffPage');
  }
  if (!(layout.registrationReport.maximumDigitalDeviationMM <= 0.001)) {
    throw invalid('validation.registrationNotGuaranteed');
  }
}
