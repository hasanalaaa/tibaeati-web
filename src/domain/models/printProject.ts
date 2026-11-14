import { z } from 'zod';
import { randomId, type NewId } from '../ids';
import { MODE_IDS, type ProjectMode } from '../modes';
import { CardEntrySchema, type CardEntry } from './cardEntry';
import { DocumentJobSchema, documentImageFileNames, type DocumentJob } from './documentJob';
import { PersonalPhotoSchema, type PersonalPhoto } from './personalPhoto';
import {
  ProjectSettingsSchema,
  defaultProjectSettings,
  type ProjectSettings,
} from './projectSettings';

/** Version of the web store's project shape. Bump it only together with a storage migration. */
export const PRINT_PROJECT_SCHEMA_VERSION = 1;

export const PrintProjectSchema = z.object({
  id: z.uuid(),
  name: z.string().default(''),
  mode: z.enum(MODE_IDS).default('unifiedOnly'),
  settings: ProjectSettingsSchema.default(defaultProjectSettings),
  cards: z.array(CardEntrySchema).default([]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  schemaVersion: z.literal(PRINT_PROJECT_SCHEMA_VERSION),
  personalPhoto: PersonalPhotoSchema.optional(),
  documentJob: DocumentJobSchema.optional(),
});

export type PrintProject = z.output<typeof PrintProjectSchema>;

export interface PrintProjectInput {
  readonly id?: string;
  readonly name: string;
  readonly mode: ProjectMode;
  readonly settings?: ProjectSettings;
  readonly cards?: readonly CardEntry[];
  readonly personalPhoto?: PersonalPhoto;
  readonly documentJob?: DocumentJob;
}

export function createPrintProject(
  input: PrintProjectInput,
  now: Date,
  newId: NewId = randomId,
): PrintProject {
  const timestamp = now.toISOString();
  const project: PrintProject = {
    id: input.id ?? newId(),
    name: input.name,
    mode: input.mode,
    settings: input.settings ?? defaultProjectSettings(),
    cards: [...(input.cards ?? [])],
    createdAt: timestamp,
    updatedAt: timestamp,
    schemaVersion: PRINT_PROJECT_SCHEMA_VERSION,
  };
  if (input.personalPhoto) project.personalPhoto = input.personalPhoto;
  if (input.documentJob) project.documentJob = input.documentJob;
  return project;
}

export function projectImageFileNames(project: PrintProject): string[] {
  const names: string[] = [];
  for (const card of project.cards) {
    if (card.frontImageFileName !== undefined) names.push(card.frontImageFileName);
    if (card.backImageFileName !== undefined) names.push(card.backImageFileName);
  }
  if (project.personalPhoto?.imageFileName !== undefined) {
    names.push(project.personalPhoto.imageFileName);
  }
  if (project.documentJob) names.push(...documentImageFileNames(project.documentJob));
  return names;
}
