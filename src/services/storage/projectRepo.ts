import { DomainError } from '@/domain/errors';
import { randomId } from '@/domain/ids';
import type { NewId } from '@/domain/ids';
import { reidentifiedCard } from '@/domain/models/cardEntry';
import { documentPdfFileNames } from '@/domain/models/documentJob';
import {
  PrintProjectSchema,
  projectImageFileNames,
  PRINT_PROJECT_SCHEMA_VERSION,
} from '@/domain/models/printProject';
import type { PrintProject } from '@/domain/models/printProject';
import { normalizeProject } from '@/domain/validation/normalize';
import type { ProjectRow, TibaeatiDb } from './db';
import type { JournalStore } from './journalStore';
import { migrateProjectRecord } from './migrations';

/** Previous versions kept per project (Swift kept one). */
export const MAX_PROJECT_VERSIONS = 5;

export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly mode: PrintProject['mode'];
  readonly cardCount: number;
  /** Document-mode page count; undefined for other modes. */
  readonly pageCount: number | undefined;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly hasPreviousVersion: boolean;
}

/** A stored record that could not be read. It is kept untouched in the database. */
export interface QuarantinedRecord {
  readonly id: string;
  readonly reason: 'corrupt' | 'newerVersion';
  readonly error: string;
}

export interface ProjectListing {
  readonly projects: readonly ProjectSummary[];
  readonly quarantined: readonly QuarantinedRecord[];
}

export interface SaveOptions {
  /** Localised fallback for an empty name. */
  readonly untitledName?: string;
  /** Keep the overwritten record in `projectVersions` (default true). Autosave may pass false. */
  readonly snapshot?: boolean;
}

export interface ProjectRepoDeps {
  readonly now?: () => Date;
  readonly newId?: NewId;
  readonly journal?: JournalStore;
}

export type ParsedProject =
  | { readonly ok: true; readonly project: PrintProject }
  | { readonly ok: false; readonly reason: QuarantinedRecord['reason']; readonly error: string };

export function parseProjectRecord(raw: unknown): ParsedProject {
  try {
    const result = PrintProjectSchema.safeParse(migrateProjectRecord(raw));
    if (result.success) return { ok: true, project: result.data };
    return { ok: false, reason: 'corrupt', error: result.error.message };
  } catch (error) {
    if (error instanceof DomainError && error.error.code === 'unsupportedProjectVersion') {
      return { ok: false, reason: 'newerVersion', error: error.message };
    }
    throw error;
  }
}

/** Every stored file a project uses: images and document PDFs. */
export const projectFileNames = (project: PrintProject): string[] => [
  ...projectImageFileNames(project),
  ...(project.documentJob ? documentPdfFileNames(project.documentJob) : []),
];

const toRow = (project: PrintProject): ProjectRow => project;

export function createProjectRepo(db: TibaeatiDb, deps: ProjectRepoDeps = {}) {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? randomId;

  async function writeProject(
    project: PrintProject,
    options: SaveOptions = {},
  ): Promise<PrintProject> {
    const normalized = normalizeProject(project, {
      untitledName: options.untitledName ?? '',
      newId,
    });
    const saved: PrintProject = {
      ...normalized,
      schemaVersion: PRINT_PROJECT_SCHEMA_VERSION,
      updatedAt: now().toISOString(),
    };
    // Validate what we are about to store, so a bug never writes a record we cannot read back.
    const check = PrintProjectSchema.parse(saved);

    await db.transaction('rw', db.projects, db.projectVersions, async () => {
      const existing = await db.projects.get(check.id);
      // A damaged or newer record is never rotated into history over a good snapshot.
      if (existing && options.snapshot !== false && parseProjectRecord(existing).ok) {
        await db.projectVersions.add({
          projectId: check.id,
          savedAt: now().toISOString(),
          record: existing,
        });
        const keys = await db.projectVersions.where('projectId').equals(check.id).primaryKeys();
        const excess = keys.slice(0, Math.max(0, keys.length - MAX_PROJECT_VERSIONS));
        await db.projectVersions.bulkDelete(excess);
      }
      await db.projects.put(toRow(check));
    });

    if (deps.journal) {
      try {
        await deps.journal.recordLastProject({
          id: check.id,
          name: check.name,
          updatedAt: check.updatedAt,
        });
      } catch (error) {
        // Advisory state (Swift JournalStore): a failed journal write must never fail a save.
        console.warn('journal write failed', error);
      }
    }
    return check;
  }

  async function get(id: string): Promise<PrintProject | undefined> {
    const row = await db.projects.get(id);
    if (!row) return undefined;
    const parsed = parseProjectRecord(row);
    if (parsed.ok) return parsed.project;
    throw new DomainError(
      parsed.reason === 'newerVersion'
        ? { code: 'unsupportedProjectVersion' }
        : { code: 'corruptProject', fileName: id },
    );
  }

  return {
    async list(): Promise<ProjectListing> {
      const [rows, versionKeys] = await Promise.all([
        db.projects.orderBy('updatedAt').reverse().toArray(),
        db.projectVersions.orderBy('projectId').uniqueKeys(),
      ]);
      const withHistory = new Set(versionKeys.map(String));
      const projects: ProjectSummary[] = [];
      const quarantined: QuarantinedRecord[] = [];
      for (const row of rows) {
        const parsed = parseProjectRecord(row);
        if (!parsed.ok) {
          quarantined.push({ id: row.id, reason: parsed.reason, error: parsed.error });
          continue;
        }
        const p = parsed.project;
        projects.push({
          id: p.id,
          name: p.name,
          mode: p.mode,
          cardCount: p.cards.length,
          pageCount: p.documentJob?.pages.length,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          hasPreviousVersion: withHistory.has(p.id),
        });
      }
      return { projects, quarantined };
    },

    get,

    save: writeProject,

    async rename(id: string, name: string, options: SaveOptions = {}): Promise<PrintProject> {
      const project = await get(id);
      if (!project) throw new DomainError({ code: 'readFailed', fileName: id });
      return writeProject({ ...project, name }, options);
    },

    async duplicate(
      id: string,
      options: SaveOptions & { readonly copySuffix: string },
    ): Promise<PrintProject> {
      const project = await get(id);
      if (!project) throw new DomainError({ code: 'readFailed', fileName: id });
      const timestamp = now().toISOString();
      const base = normalizeProject(project, { untitledName: options.untitledName ?? '', newId });
      return writeProject(
        {
          ...base,
          id: newId(),
          name: `${base.name} ${options.copySuffix}`,
          cards: base.cards.map((card) => reidentifiedCard(card, newId)),
          createdAt: timestamp,
        },
        { ...options, snapshot: false },
      );
    },

    /** Replaces the current record with its latest snapshot; the current one becomes the snapshot. */
    async restorePreviousVersion(id: string): Promise<PrintProject> {
      const versions = await db.projectVersions.where('projectId').equals(id).sortBy('key');
      const latest = versions.at(-1);
      const restored = latest ? parseProjectRecord(latest.record) : undefined;
      if (!latest || !restored?.ok) {
        throw new DomainError({ code: 'readFailed', fileName: id });
      }
      if (latest.key !== undefined) await db.projectVersions.delete(latest.key);
      return writeProject(restored.project, {});
    },

    async delete(id: string): Promise<void> {
      await db.transaction('rw', db.projects, db.projectVersions, db.blobs, async () => {
        const doomed = new Set<string>();
        const rows = [
          ...(await db.projects.where('id').equals(id).toArray()),
          ...(await db.projectVersions.where('projectId').equals(id).toArray()).map(
            (v) => v.record,
          ),
        ];
        for (const row of rows) {
          const parsed = parseProjectRecord(row);
          if (parsed.ok) for (const name of projectFileNames(parsed.project)) doomed.add(name);
        }
        await db.projects.delete(id);
        await db.projectVersions.where('projectId').equals(id).delete();
        if (doomed.size === 0) return;

        const stillUsed = new Set<string>();
        const keepIfMentioned = (raw: unknown): void => {
          const parsed = parseProjectRecord(raw);
          if (parsed.ok) {
            for (const name of projectFileNames(parsed.project)) stillUsed.add(name);
            return;
          }
          // Unreadable record: keep any blob whose name appears in it, so recovery stays possible.
          const text = JSON.stringify(raw);
          for (const name of doomed) if (text.includes(name)) stillUsed.add(name);
        };
        await db.projects.each(keepIfMentioned);
        await db.projectVersions.each((v) => {
          keepIfMentioned(v.record);
        });
        await db.blobs.bulkDelete([...doomed].filter((name) => !stillUsed.has(name)));
      });
    },
  };
}

export type ProjectRepo = ReturnType<typeof createProjectRepo>;
