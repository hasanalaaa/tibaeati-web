import { defaultJournal, JournalSchema } from '@/domain/models/journal';
import type { CalibrationRecord, LastProjectRecord } from '@/domain/models/journal';
import type { TibaeatiDb } from './db';
import { createKvDoc } from './kvDoc';

/** Port of Swift JournalStore: the last project saved and the last calibration, for the dashboard. */
export function createJournalStore(db: TibaeatiDb, now: () => Date = () => new Date()) {
  const doc = createKvDoc(db, 'journal', JournalSchema, defaultJournal);
  return {
    async recordLastProject(record: LastProjectRecord): Promise<void> {
      await doc.update((j) => ({ ...j, lastProject: record }));
    },
    async recordCalibration(profileId: string): Promise<void> {
      await doc.update((j) => ({
        ...j,
        lastCalibration: { profileId, date: now().toISOString() },
      }));
    },
    async lastProject(): Promise<LastProjectRecord | undefined> {
      return (await doc.current()).lastProject;
    },
    async lastCalibration(): Promise<CalibrationRecord | undefined> {
      return (await doc.current()).lastCalibration;
    },
  };
}

export type JournalStore = ReturnType<typeof createJournalStore>;
