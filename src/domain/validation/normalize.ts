import { MAXIMUM_CARDS_PER_PROJECT } from '../constants';
import { prefixGraphemes } from '../format';
import { randomId, type NewId } from '../ids';
import { normalizePlacement } from '../models/cardImagePlacement';
import { reidentifiedCard, type CardEntry } from '../models/cardEntry';
import { PRINT_PROJECT_SCHEMA_VERSION, type PrintProject } from '../models/printProject';
import { normalizeSettings } from '../models/projectSettings';
import { CARD_KINDS } from '../templates';

export { normalizeSettings };

export interface NormalizeOptions {
  /** Localised fallback for an empty name (i18n key `project.untitled`). */
  readonly untitledName: string;
  readonly newId?: NewId;
}

export function normalizeProject(project: PrintProject, options: NormalizeOptions): PrintProject {
  const result: PrintProject = {
    ...project,
    name: normalizeProjectName(project.name, options.untitledName),
    settings: normalizeSettings(project.settings),
    cards: normalizeCards(project.cards, options.newId),
    schemaVersion: PRINT_PROJECT_SCHEMA_VERSION,
  };
  if (project.personalPhoto) {
    result.personalPhoto = {
      ...project.personalPhoto,
      placement: normalizePlacement(project.personalPhoto.placement),
    };
  }
  return result;
}

// Swift `CharacterSet.controlCharacters` is general categories Cc and Cf (includes RLM/LRM/ZWJ).
const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}]/gu;

export function normalizeProjectName(name: string, untitledName: string): string {
  const collapsed = name.replace(CONTROL_CHARACTERS, '').replace(/\s+/gu, ' ').trim();
  return prefixGraphemes(collapsed === '' ? untitledName : collapsed, 80);
}

/** Caps the count, repairs duplicate ids and renumbers `order` per kind in list order. */
export function normalizeCards(cards: readonly CardEntry[], newId: NewId = randomId): CardEntry[] {
  const seen = new Set<string>();
  const result: CardEntry[] = [];
  for (const original of cards.slice(0, MAXIMUM_CARDS_PER_PROJECT)) {
    const card = seen.has(original.id) ? reidentifiedCard(original, newId) : original;
    seen.add(card.id);
    result.push({
      ...card,
      frontPlacement: normalizePlacement(card.frontPlacement),
      backPlacement: normalizePlacement(card.backPlacement),
    });
  }
  for (const kind of CARD_KINDS) {
    let order = 0;
    result.forEach((card, index) => {
      if (card.kind === kind) result[index] = { ...card, order: order++ };
    });
  }
  return result;
}
