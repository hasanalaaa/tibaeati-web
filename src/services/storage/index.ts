import type { NewId } from '@/domain/ids';
import { createBackup } from './backup';
import { createBlobStore } from './blobStore';
import { getDb } from './db';
import { createJournalStore } from './journalStore';
import { createPrinterStore } from './printerStore';
import { createProjectRepo } from './projectRepo';
import { createSettingsStore } from './settingsStore';

/** Wires every store to one database. Tests call this with their own `TibaeatiDb`. */
export function createStorage(
  db = getDb(),
  deps: { readonly now?: () => Date; readonly newId?: NewId } = {},
) {
  const blobs = createBlobStore(db, deps);
  const journal = createJournalStore(db, deps.now);
  const projects = createProjectRepo(db, { ...deps, journal });
  const printers = createPrinterStore(db);
  const settings = createSettingsStore(db);
  const backup = createBackup({ db, blobs, ...deps });
  return { db, blobs, journal, projects, printers, settings, backup };
}

export type Storage = ReturnType<typeof createStorage>;

let shared: Storage | undefined;
/** The app-wide storage, created on first use. */
export const storage = (): Storage => (shared ??= createStorage());

export { createAutosaver, flushOnPageHide, AUTOSAVE_DELAY_MS } from './autosave';
export type { Autosaver } from './autosave';
export { requestPersistence, storageStatus } from './persistence';
export type { StorageStatus } from './persistence';
export { liveQuery } from 'dexie';
export type { ProjectListing, ProjectSummary, QuarantinedRecord, SaveOptions } from './projectRepo';
export type { ImportResult } from './backup';
