import Dexie from 'dexie';
import type { Table } from 'dexie';

export const DB_NAME = 'tibaeati';

/** A project as stored: plain JSON, parsed with the zod schema on every read. */
export interface ProjectRow {
  readonly id: string;
  readonly updatedAt: string;
  readonly mode: string;
  readonly [field: string]: unknown;
}

/** A snapshot of a project record taken just before it was overwritten. */
export interface ProjectVersionRow {
  readonly key?: number;
  readonly projectId: string;
  readonly savedAt: string;
  readonly record: ProjectRow;
}

export interface BlobRow {
  readonly fileName: string;
  readonly blob: Blob;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly createdAt: string;
}

export interface KvRow {
  readonly key: string;
  readonly value: unknown;
}

export class TibaeatiDb extends Dexie {
  projects!: Table<ProjectRow, string>;
  projectVersions!: Table<ProjectVersionRow, number>;
  blobs!: Table<BlobRow, string>;
  kv!: Table<KvRow, string>;

  constructor(name: string = DB_NAME) {
    super(name);
    // Schema v1. Changing it needs a new `version(n)` block here plus a note in ARCHITECTURE.md.
    this.version(1).stores({
      projects: 'id, updatedAt, mode',
      projectVersions: '++key, projectId',
      blobs: 'fileName',
      kv: 'key',
    });
  }
}

let shared: TibaeatiDb | undefined;

/** The app-wide database. Tests build isolated instances with `new TibaeatiDb(uniqueName)`. */
export function getDb(): TibaeatiDb {
  shared ??= new TibaeatiDb();
  return shared;
}
