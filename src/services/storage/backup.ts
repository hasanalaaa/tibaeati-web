import { Unzip, UnzipInflate, Zip, ZipDeflate, strFromU8, strToU8 } from 'fflate';
import { z } from 'zod';
import { DomainError } from '@/domain/errors';
import { randomId } from '@/domain/ids';
import type { NewId } from '@/domain/ids';
import { AppSettingsSchema } from '@/domain/models/appSettings';
import { JournalSchema } from '@/domain/models/journal';
import { PrinterStateSchema } from '@/domain/models/printerState';
import type { PrintProject } from '@/domain/models/printProject';
import { isSafeBlobFileName } from './blobFileName';
import type { BlobStore } from './blobStore';
import type { ProjectRow, TibaeatiDb } from './db';
import { parseProjectRecord, projectFileNames } from './projectRepo';

export const BACKUP_FORMAT = 'tibaeati-backup';
export const BACKUP_VERSION = 1;

/** Bounds on what an import may expand to, so a hostile or broken file cannot exhaust memory. */
export const MAX_BACKUP_UNCOMPRESSED_BYTES = 1_536 * 1_024 * 1_024;
export const MAX_BACKUP_ENTRIES = 20_000;
const MAX_JSON_ENTRY_BYTES = 64 * 1_024 * 1_024;
const SLICE_BYTES = 1_024 * 1_024;

const ManifestSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  createdAt: z.iso.datetime(),
  appVersion: z.string(),
  scope: z.enum(['all', 'project']).default('all'),
});

/** kv keys a backup may carry, each with the schema that validates its value. */
const KV_SCHEMAS = {
  printers: PrinterStateSchema,
  settings: AppSettingsSchema,
  journal: JournalSchema,
} as const;
const KvEntrySchema = z.object({
  key: z.enum(['printers', 'settings', 'journal']),
  value: z.unknown(),
});

const invalidBackup = (): DomainError => new DomainError({ code: 'invalidBackup' });

export interface BackupDeps {
  readonly db: TibaeatiDb;
  readonly blobs: BlobStore;
  readonly now?: () => Date;
  readonly newId?: NewId;
  readonly appVersion?: string;
}

export interface ImportResult {
  readonly projects: number;
  readonly blobs: number;
}

interface ParsedArchive {
  readonly scope: 'all' | 'project';
  readonly projects: PrintProject[];
  readonly kv: { key: keyof typeof KV_SCHEMAS; value: unknown }[];
  readonly blobs: Map<string, Blob>;
}

async function pushBlob(file: ZipDeflate, blob: Blob): Promise<void> {
  if (blob.size === 0) {
    file.push(new Uint8Array(0), true);
    return;
  }
  for (let start = 0; start < blob.size; start += SLICE_BYTES) {
    const end = Math.min(start + SLICE_BYTES, blob.size);
    const bytes = new Uint8Array(await blob.slice(start, end).arrayBuffer());
    file.push(bytes, end === blob.size);
  }
}

function jsonEntry(zip: Zip, name: string, value: unknown): void {
  const file = new ZipDeflate(name, { level: 6 });
  zip.add(file);
  file.push(strToU8(JSON.stringify(value)), true);
}

async function buildArchive(
  deps: BackupDeps,
  scope: 'all' | 'project',
  rows: readonly ProjectRow[],
  kv: readonly { key: string; value: unknown }[],
  blobNames: ReadonlySet<string> | undefined,
): Promise<Blob> {
  const chunks: Uint8Array[] = [];
  let failure: Error | undefined;
  const zip = new Zip((err, chunk) => {
    if (err) failure = err;
    else chunks.push(chunk);
  });
  const now = deps.now ?? (() => new Date());
  jsonEntry(zip, 'manifest.json', {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now().toISOString(),
    appVersion: deps.appVersion ?? __APP_VERSION__,
    scope,
  });
  jsonEntry(zip, 'projects.json', rows);
  jsonEntry(zip, 'kv.json', kv);

  const names = (await deps.db.blobs.toCollection().primaryKeys()).filter(
    (name) => blobNames === undefined || blobNames.has(name),
  );
  for (const name of names) {
    const row = await deps.db.blobs.get(name);
    if (!row) continue;
    // Images and PDFs are already compressed: level 0 stores them without wasting CPU.
    const file = new ZipDeflate(`blobs/${name}`, { level: 0 });
    zip.add(file);
    await pushBlob(file, row.blob);
  }
  zip.end();
  if (failure) throw failure;
  return new Blob(chunks as BlobPart[], { type: 'application/zip' });
}

async function readableRows(db: TibaeatiDb, ids?: readonly string[]): Promise<ProjectRow[]> {
  const rows = ids
    ? (await db.projects.bulkGet([...ids])).filter((r) => r !== undefined)
    : await db.projects.toArray();
  // Unreadable records stay in the database (quarantine) but cannot round-trip through a backup.
  return rows.filter((row) => parseProjectRecord(row).ok);
}

/** Reads and validates the whole archive in memory-bounded steps; nothing is written here. */
async function parseArchive(file: Blob): Promise<ParsedArchive> {
  const jsonChunks = new Map<string, Uint8Array[]>();
  const blobChunks = new Map<string, Uint8Array[]>();
  const seen = new Set<string>();
  let total = 0;
  let failure: DomainError | undefined;

  const fail = (): void => {
    failure ??= invalidBackup();
  };

  const unzip = new Unzip((entry) => {
    if (failure) return;
    const name = entry.name;
    if (name.endsWith('/')) return; // directory marker
    const isBlob = name.startsWith('blobs/');
    const blobName = isBlob ? name.slice('blobs/'.length) : '';
    const knownJson = name === 'manifest.json' || name === 'projects.json' || name === 'kv.json';
    // Allow-list of exact names: rejects '..', absolute paths, separators, backslashes, extra dirs.
    if (
      seen.has(name) ||
      seen.size >= MAX_BACKUP_ENTRIES ||
      !(knownJson || (isBlob && isSafeBlobFileName(blobName)))
    ) {
      fail();
      return;
    }
    seen.add(name);
    const chunks: Uint8Array[] = [];
    (isBlob ? blobChunks : jsonChunks).set(isBlob ? blobName : name, chunks);
    let entryBytes = 0;
    entry.ondata = (err, chunk) => {
      if (err || failure) {
        fail();
        entry.terminate();
        return;
      }
      entryBytes += chunk.length;
      total += chunk.length;
      if (total > MAX_BACKUP_UNCOMPRESSED_BYTES || (!isBlob && entryBytes > MAX_JSON_ENTRY_BYTES)) {
        fail();
        entry.terminate();
        return;
      }
      chunks.push(chunk);
    };
    entry.start();
  });
  unzip.register(UnzipInflate);

  try {
    const reader = file.stream().getReader();
    for (;;) {
      const { done, value } = await reader.read();
      unzip.push(value ?? new Uint8Array(0), done);
      if (failure) {
        await reader.cancel();
        throw failure;
      }
      if (done) break;
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw invalidBackup();
  }

  const jsonOf = (name: string): unknown => {
    const chunks = jsonChunks.get(name);
    if (!chunks) throw invalidBackup();
    const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
    try {
      return JSON.parse(strFromU8(bytes));
    } catch {
      throw invalidBackup();
    }
  };

  const manifest = ManifestSchema.safeParse(jsonOf('manifest.json'));
  const rows = z.array(z.unknown()).safeParse(jsonOf('projects.json'));
  const kv = z.array(KvEntrySchema).safeParse(jsonOf('kv.json'));
  if (!manifest.success || !rows.success || !kv.success) throw invalidBackup();

  const projects: PrintProject[] = [];
  for (const row of rows.data) {
    const parsed = parseProjectRecord(row);
    if (!parsed.ok) throw invalidBackup();
    projects.push(parsed.project);
  }
  for (const entry of kv.data) {
    if (!KV_SCHEMAS[entry.key].safeParse(entry.value).success) throw invalidBackup();
  }

  const blobs = new Map<string, Blob>();
  for (const [name, chunks] of blobChunks) blobs.set(name, new Blob(chunks as BlobPart[]));
  blobChunks.clear();
  return { scope: manifest.data.scope, projects, kv: kv.data, blobs };
}

export function createBackup(deps: BackupDeps) {
  const { db, blobs } = deps;
  const newId = deps.newId ?? randomId;

  async function writeBlobs(archive: ParsedArchive): Promise<void> {
    for (const [name, blob] of archive.blobs) await blobs.restore(name, blob);
  }

  return {
    /** Everything: readable projects, printers/settings/journal and every stored file. */
    async exportAll(): Promise<Blob> {
      const kv = (await db.kv.toArray()).filter((row) => row.key in KV_SCHEMAS);
      return buildArchive(deps, 'all', await readableRows(db), kv, undefined);
    },

    /**
     * Restores a full backup. `replace` first empties projects, history, files and the known kv
     * documents; `merge` keeps local data and takes an imported project only when it is newer.
     * The whole archive is validated before the first write.
     */
    async importAll(file: Blob, options: { mode: 'merge' | 'replace' }): Promise<ImportResult> {
      const archive = await parseArchive(file);
      if (archive.scope !== 'all') throw invalidBackup();
      // Size and type limits are enforced per file inside the transaction: one failure rolls back.
      let imported = 0;
      await db.transaction('rw', db.projects, db.projectVersions, db.blobs, db.kv, async () => {
        if (options.mode === 'replace') {
          await Promise.all([
            db.projects.clear(),
            db.projectVersions.clear(),
            db.blobs.clear(),
            db.kv.bulkDelete(Object.keys(KV_SCHEMAS).flatMap((k) => [k, `${k}.corrupt`])),
          ]);
        }
        await writeBlobs(archive);
        for (const project of archive.projects) {
          const existing = await db.projects.get(project.id);
          const existingParsed = existing ? parseProjectRecord(existing) : undefined;
          const keepLocal =
            options.mode === 'merge' &&
            existingParsed?.ok === true &&
            existingParsed.project.updatedAt >= project.updatedAt;
          if (keepLocal) continue;
          await db.projects.put(project);
          imported += 1;
        }
        for (const entry of archive.kv) {
          if (options.mode === 'merge' && (await db.kv.get(entry.key))) continue;
          await db.kv.put({ key: entry.key, value: entry.value });
        }
      });
      return { projects: imported, blobs: archive.blobs.size };
    },

    /** One project with its files, as a file that can move to another device. */
    async exportProject(id: string): Promise<Blob> {
      const rows = await readableRows(db, [id]);
      const row = rows[0];
      if (!row) throw new DomainError({ code: 'readFailed', fileName: id });
      const parsed = parseProjectRecord(row);
      if (!parsed.ok) throw new DomainError({ code: 'corruptProject', fileName: id });
      const names = new Set(projectFileNames(parsed.project));
      return buildArchive(deps, 'project', rows, [], names);
    },

    /** Adds the project to the library. An id that already exists locally gets a fresh id (a copy). */
    async importProject(file: Blob): Promise<string> {
      const archive = await parseArchive(file);
      const project = archive.projects[0];
      if (archive.scope !== 'project' || archive.projects.length !== 1 || !project) {
        throw invalidBackup();
      }
      let finalId = project.id;
      await db.transaction('rw', db.projects, db.blobs, async () => {
        await writeBlobs(archive);
        if (await db.projects.get(project.id)) finalId = newId();
        await db.projects.put({ ...project, id: finalId });
      });
      return finalId;
    },
  };
}

export type Backup = ReturnType<typeof createBackup>;
