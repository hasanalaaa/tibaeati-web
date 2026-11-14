import { z } from 'zod';

export const JOURNAL_SCHEMA_VERSION = 1;

export const LastProjectRecordSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  updatedAt: z.iso.datetime(),
});
export type LastProjectRecord = z.output<typeof LastProjectRecordSchema>;

export const CalibrationRecordSchema = z.object({
  profileId: z.string(),
  date: z.iso.datetime(),
});
export type CalibrationRecord = z.output<typeof CalibrationRecordSchema>;

/** Advisory state for the home dashboard (Swift JournalPayload). */
export const JournalSchema = z.object({
  schemaVersion: z.literal(JOURNAL_SCHEMA_VERSION),
  lastProject: LastProjectRecordSchema.optional(),
  lastCalibration: CalibrationRecordSchema.optional(),
});
export type Journal = z.output<typeof JournalSchema>;

export const defaultJournal = (): Journal => ({ schemaVersion: JOURNAL_SCHEMA_VERSION });
