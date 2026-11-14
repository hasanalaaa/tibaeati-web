import { MAXIMUM_EXPORTED_IMAGE_DPI } from '../constants';
import { cardHasAnyImage } from '../models/cardEntry';
import type { PrintProject } from '../models/printProject';
import { applyMarginPreset, type MarginPreset } from '../models/projectSettings';
import { PRINTER_PROFILES, type PrinterProfileId } from './profiles';

/** Picks export DPI and margin preset for the paper, card count and printer. */
export function optimizeOutput(project: PrintProject, profileId: PrinterProfileId): PrintProject {
  if (!project.settings.autoOptimizeForPrinter) return project;

  const activeCount = Math.max(project.cards.filter(cardHasAnyImage).length, 1);
  let preset: MarginPreset = PRINTER_PROFILES[profileId].calibration.recommendedPreset;
  let dpi: number;

  switch (project.settings.paperSize) {
    case 'a5':
      dpi = activeCount <= 4 ? 600 : 450;
      preset = 'compact';
      break;
    case 'a4':
    case 'letter':
      dpi = activeCount <= 10 ? 450 : 300;
      break;
    case 'legal':
      dpi = activeCount <= 8 ? 450 : 300;
      preset = 'balanced';
      break;
    case 'a3':
      dpi = 300;
      preset = 'balanced';
      break;
  }

  if (profileId === 'brotherDCPT720DW' && activeCount >= 8) {
    preset = 'printSafe';
    dpi = Math.max(dpi, 450);
  } else if (activeCount >= 14) {
    preset = 'compact';
  }

  const settings = applyMarginPreset(
    { ...project.settings, exportDPI: Math.min(dpi, MAXIMUM_EXPORTED_IMAGE_DPI) },
    preset,
  );
  return { ...project, settings };
}
