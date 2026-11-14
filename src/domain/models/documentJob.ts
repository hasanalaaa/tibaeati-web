import { z } from 'zod';
import type { Size } from '../geometry';
import { CardImagePlacementSchema, DEFAULT_PLACEMENT } from './cardImagePlacement';

export const DOCUMENT_TEMPLATES = [
  'passportData',
  'passportOpenPortrait',
  'passportOpenLandscape',
  'drivingLicense',
  'a4',
  'a5',
  'custom',
] as const;
export type DocumentTemplate = (typeof DOCUMENT_TEMPLATES)[number];

const TEMPLATE_SIZES_MM: Readonly<Record<DocumentTemplate, Size | undefined>> = {
  passportData: { width: 125, height: 88 },
  passportOpenPortrait: { width: 125, height: 176 },
  passportOpenLandscape: { width: 176, height: 125 },
  drivingLicense: { width: 86, height: 54 },
  a4: { width: 210, height: 297 },
  a5: { width: 148, height: 210 },
  custom: undefined,
};

export const documentTemplateSizeMM = (template: DocumentTemplate): Size | undefined =>
  TEMPLATE_SIZES_MM[template];

export const DocumentSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('image'), fileName: z.string() }),
  z.object({ kind: z.literal('pdf'), fileName: z.string(), page: z.number().int() }),
]);
export type DocumentSource = z.output<typeof DocumentSourceSchema>;

export const DocumentPageSchema = z.object({
  id: z.uuid(),
  source: DocumentSourceSchema,
  quarterTurns: z
    .number()
    .int()
    .default(0)
    .transform((turns) => (((turns % 4) + 4) % 4) as 0 | 1 | 2 | 3),
  placement: CardImagePlacementSchema.default(DEFAULT_PLACEMENT),
  fillFrame: z.boolean().default(false),
});
export type DocumentPage = z.output<typeof DocumentPageSchema>;

export const DocumentJobSchema = z.object({
  template: z.enum(DOCUMENT_TEMPLATES),
  customWidthMM: z.number(),
  customHeightMM: z.number(),
  marginMM: z.number(),
  gapMM: z.number(),
  copies: z.number().int(),
  landscapePaper: z.boolean(),
  showBorder: z.boolean(),
  originalPDFPages: z.boolean(),
  pages: z.array(DocumentPageSchema),
});
export type DocumentJob = z.output<typeof DocumentJobSchema>;

export function createDocumentJob(template: DocumentTemplate): DocumentJob {
  return {
    template,
    customWidthMM: 100,
    customHeightMM: 150,
    marginMM: template === 'a4' ? 0 : 10,
    gapMM: 6,
    copies: 1,
    landscapePaper: false,
    showBorder: false,
    originalPDFPages: false,
    pages: [],
  };
}

export const documentJobSizeMM = (job: DocumentJob): Size =>
  documentTemplateSizeMM(job.template) ?? { width: job.customWidthMM, height: job.customHeightMM };

export const documentImageFileNames = (job: DocumentJob): string[] =>
  job.pages.flatMap((p) => (p.source.kind === 'image' ? [p.source.fileName] : []));

export const documentPdfFileNames = (job: DocumentJob): string[] =>
  job.pages.flatMap((p) => (p.source.kind === 'pdf' ? [p.source.fileName] : []));
