// @vitest-environment node
import 'fake-indexeddb/auto';
import { strToU8, zipSync } from 'fflate';
import { DomainError } from '@/domain/errors';
import { createCardEntry } from '@/domain/models/cardEntry';
import { createPrintProject } from '@/domain/models/printProject';
import { createAutosaver } from './autosave';
import { MAX_IMAGE_BYTES, MAX_PDF_BYTES } from './blobStore';
import { TibaeatiDb } from './db';
import { createBackup } from './backup';
import { createStorage } from './index';
import type { Storage } from './index';

let counter = 0;
let tick = 0;
let ids = 0;
const newId = (): string => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`;
const clock = (): Date => new Date(Date.UTC(2026, 0, 1, 0, 0, ++tick));

const setup = (): Storage =>
  createStorage(new TibaeatiDb(`test-${++counter}`), { now: clock, newId });

const jpeg = (size = 10): Blob => new Blob([new Uint8Array(size).fill(7)], { type: 'image/jpeg' });

function projectWith(files: string[], name = 'P'): ReturnType<typeof createPrintProject> {
  return createPrintProject(
    {
      name,
      mode: 'unifiedOnly',
      cards: files.map((f, order) =>
        createCardEntry({ kind: 'unified', order, frontImageFileName: f }, newId),
      ),
    },
    clock(),
    newId,
  );
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof DomainError ? error.error.code : `other:${String(error)}`;
  }
}

describe('projectRepo', () => {
  it('saves and loads an equal project, bumping updatedAt from the clock', async () => {
    const s = setup();
    const project = projectWith(['a.jpg']);
    const saved = await s.projects.save(project, { untitledName: 'Untitled' });
    expect(saved.updatedAt).not.toBe(project.updatedAt);
    expect(await s.projects.get(project.id)).toEqual(saved);
    expect(saved.cards).toEqual(project.cards);
  });

  it('lists summaries newest first and flags history', async () => {
    const s = setup();
    const a = await s.projects.save(projectWith([], 'A'));
    const b = await s.projects.save(projectWith([], 'B'));
    await s.projects.save({ ...a, name: 'A2' });
    const { projects, quarantined } = await s.projects.list();
    expect(quarantined).toEqual([]);
    expect(projects.map((p) => p.name)).toEqual(['A2', 'B']);
    expect(projects[0]?.hasPreviousVersion).toBe(true);
    expect(projects[1]?.hasPreviousVersion).toBe(false);
    expect(b.id).toBe(projects[1]?.id);
  });

  it('restores the previous version and makes the restore reversible', async () => {
    const s = setup();
    const v1 = await s.projects.save(projectWith([], 'one'));
    await s.projects.save({ ...v1, name: 'two' });
    const restored = await s.projects.restorePreviousVersion(v1.id);
    expect(restored.name).toBe('one');
    const back = await s.projects.restorePreviousVersion(v1.id);
    expect(back.name).toBe('two');
  });

  it('keeps only the last 5 versions', async () => {
    const s = setup();
    let p = await s.projects.save(projectWith([], 'v0'));
    for (let i = 1; i <= 8; i += 1) p = await s.projects.save({ ...p, name: `v${i}` });
    expect(await s.db.projectVersions.where('projectId').equals(p.id).count()).toBe(5);
  });

  it('quarantines a corrupt record instead of deleting it', async () => {
    const s = setup();
    const ok = await s.projects.save(projectWith([], 'ok'));
    await s.db.projects.put({
      id: '11111111-1111-4111-8111-111111111111',
      updatedAt: '2026-01-01T00:00:00.000Z',
      mode: 'unifiedOnly',
      schemaVersion: 1,
      createdAt: 'not a date',
    });
    await s.db.projects.put({
      id: '22222222-2222-4222-8222-222222222222',
      updatedAt: '2026-01-01T00:00:00.000Z',
      mode: 'unifiedOnly',
      schemaVersion: 99,
    });
    const { projects, quarantined } = await s.projects.list();
    expect(projects.map((p) => p.id)).toEqual([ok.id]);
    expect(quarantined.map((q) => [q.id, q.reason])).toEqual(
      expect.arrayContaining([
        ['11111111-1111-4111-8111-111111111111', 'corrupt'],
        ['22222222-2222-4222-8222-222222222222', 'newerVersion'],
      ]),
    );
    expect(quarantined[0]?.error).not.toBe('');
    expect(await s.db.projects.count()).toBe(3);
    expect(await codeOf(s.projects.get('11111111-1111-4111-8111-111111111111'))).toBe(
      'corruptProject',
    );
  });

  it('delete removes blobs no other project references, keeps shared ones', async () => {
    const s = setup();
    const onlyA = await s.blobs.put(jpeg(), { mimeType: 'image/jpeg' });
    const shared = await s.blobs.put(jpeg(), { mimeType: 'image/jpeg' });
    const a = await s.projects.save(projectWith([onlyA, shared], 'A'));
    await s.projects.save(projectWith([shared], 'B'));
    await s.projects.delete(a.id);
    expect(await s.blobs.has(onlyA)).toBe(false);
    expect(await s.blobs.has(shared)).toBe(true);
    expect(await s.db.projectVersions.where('projectId').equals(a.id).count()).toBe(0);
  });

  it('duplicates with fresh ids and renames', async () => {
    const s = setup();
    const a = await s.projects.save(projectWith(['x.jpg'], 'Base'));
    const copy = await s.projects.duplicate(a.id, { copySuffix: 'Copy' });
    expect(copy.id).not.toBe(a.id);
    expect(copy.name).toBe('Base Copy');
    expect(copy.cards[0]?.id).not.toBe(a.cards[0]?.id);
    const renamed = await s.projects.rename(a.id, '  New​  name ');
    expect(renamed.name).toBe('New name');
  });
});

describe('blobStore', () => {
  it('stores under a generated safe name and reads it back', async () => {
    const s = setup();
    const name = await s.blobs.put(jpeg(5), { mimeType: 'image/jpeg' });
    expect(name).toMatch(/^[0-9a-f-]+\.jpg$/);
    expect((await s.blobs.get(name))?.size).toBe(5);
    expect(await s.blobs.usage()).toEqual({ count: 1, bytes: 5 });
    await s.blobs.delete(name);
    expect(await s.blobs.has(name)).toBe(false);
  });

  it('rejects unknown types, empty files and oversize files', async () => {
    const s = setup();
    expect(await codeOf(s.blobs.put(jpeg(), { mimeType: 'text/html' }))).toBe(
      'unsupportedFileType',
    );
    expect(await codeOf(s.blobs.put(new Blob([]), { mimeType: 'image/png' }))).toBe(
      'unsupportedFileType',
    );
    const big = { size: MAX_IMAGE_BYTES + 1 } as Blob;
    expect(await codeOf(s.blobs.put(big, { mimeType: 'image/png' }))).toBe('fileTooLarge');
    const bigPdf = { size: MAX_PDF_BYTES + 1 } as Blob;
    expect(await codeOf(s.blobs.put(bigPdf, { mimeType: 'application/pdf' }))).toBe('fileTooLarge');
    const okPdf = { size: MAX_PDF_BYTES } as Blob;
    expect(await codeOf(s.blobs.put(okPdf, { mimeType: 'image/png' }))).toBe(undefined);
  });
});

describe('kv stores', () => {
  it('printers: defaults, update, corrupt value is preserved', async () => {
    const s = setup();
    expect((await s.printers.current()).savedPrinters).toEqual([]);
    await s.printers.update((p) => ({
      ...p,
      selectedProfileId: 'brotherDCPT720DW',
      calibrationOverrides: { x: { xMM: 1, yMM: 2, scaleX: 1, scaleY: 1 } },
    }));
    expect((await s.printers.current()).selectedProfileId).toBe('brotherDCPT720DW');
    await s.db.kv.put({ key: 'printers', value: { schemaVersion: 7 } });
    expect((await s.printers.current()).selectedProfileId).toBeUndefined();
    expect(await s.db.kv.get('printers.corrupt')).toBeDefined();
  });

  it('journal records last project on save and calibration', async () => {
    const s = setup();
    const p = await s.projects.save(projectWith([], 'J'));
    await s.journal.recordCalibration('brotherDCPT720DW');
    expect((await s.journal.lastCalibration())?.profileId).toBe('brotherDCPT720DW');
    expect((await s.journal.lastProject())?.id).toBe(p.id);
  });

  it('settings default to the Swift values', async () => {
    const s = setup();
    expect(await s.settings.current()).toMatchObject({
      pageMarginTop: 8,
      privacyHideInSwitcher: true,
      onboardingCompleted: false,
    });
  });
});

describe('backup', () => {
  async function seeded(): Promise<{ s: Storage; id: string; file: string }> {
    const s = setup();
    const file = await s.blobs.put(jpeg(64), { mimeType: 'image/jpeg' });
    const p = await s.projects.save(projectWith([file], 'Backed up'));
    await s.printers.update((x) => ({ ...x, nickname: 'Office' }));
    return { s, id: p.id, file };
  }
  const backupOf = (s: Storage) => createBackup({ db: s.db, blobs: s.blobs, now: clock, newId });

  it('exports and imports everything (replace) including blobs and kv', async () => {
    const { s, id, file } = await seeded();
    const zip = await backupOf(s).exportAll();
    await s.projects.delete(id);
    await s.printers.update((x) => ({ ...x, nickname: 'changed' }));
    expect(await s.blobs.has(file)).toBe(false);
    const result = await backupOf(s).importAll(zip, { mode: 'replace' });
    expect(result).toEqual({ projects: 1, blobs: 1 });
    expect((await s.projects.get(id))?.name).toBe('Backed up');
    expect((await s.blobs.get(file))?.size).toBe(64);
    expect((await s.printers.current()).nickname).toBe('Office');
  });

  it('merge keeps newer local data and adds missing projects', async () => {
    const { s, id } = await seeded();
    const zip = await backupOf(s).exportAll();
    const local = await s.projects.get(id);
    if (!local) throw new Error('missing');
    await s.projects.save({ ...local, name: 'Local newer' });
    const other = await s.projects.save(projectWith([], 'Only local'));
    const result = await backupOf(s).importAll(zip, { mode: 'merge' });
    expect(result.projects).toBe(0);
    expect((await s.projects.get(id))?.name).toBe('Local newer');
    expect(await s.projects.get(other.id)).toBeDefined();
  });

  it('exports and imports a single project as a copy when the id exists', async () => {
    const { s, id, file } = await seeded();
    const zip = await backupOf(s).exportProject(id);
    const copyId = await backupOf(s).importProject(zip);
    expect(copyId).not.toBe(id);
    expect((await s.projects.get(copyId))?.cards[0]?.frontImageFileName).toBe(file);
    expect(await codeOf(backupOf(s).importAll(zip, { mode: 'merge' }))).toBe('invalidBackup');
  });

  const evil = (name: string): Blob => {
    const manifest = JSON.stringify({
      format: 'tibaeati-backup',
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      appVersion: '0',
    });
    return new Blob([
      zipSync({
        'manifest.json': strToU8(manifest),
        'projects.json': strToU8('[]'),
        'kv.json': strToU8('[]'),
        [name]: strToU8('x'),
      }),
    ]);
  };

  it.each([
    'blobs/../../evil.jpg',
    'blobs/a/b.jpg',
    '/etc/passwd',
    'blobs/..jpg',
    'blobs/evil.exe',
    'blobs/.hidden.jpg',
    'blobs\\evil.jpg',
    'other/file.json',
  ])('rejects zip-slip or unlisted entry %s', async (name) => {
    const s = setup();
    expect(await codeOf(backupOf(s).importAll(evil(name), { mode: 'replace' }))).toBe(
      'invalidBackup',
    );
    expect(await s.db.blobs.count()).toBe(0);
  });

  it('rejects garbage, a bad manifest and an invalid project; writes nothing', async () => {
    const { s } = await seeded();
    const b = backupOf(s);
    expect(
      await codeOf(b.importAll(new Blob([new Uint8Array(50).fill(1)]), { mode: 'replace' })),
    ).toBe('invalidBackup');
    const bad = new Blob([
      zipSync({
        'manifest.json': strToU8('{"format":"nope"}'),
        'projects.json': strToU8('[]'),
        'kv.json': strToU8('[]'),
      }),
    ]);
    expect(await codeOf(b.importAll(bad, { mode: 'replace' }))).toBe('invalidBackup');
    const badProject = new Blob([
      zipSync({
        'manifest.json': strToU8(
          '{"format":"tibaeati-backup","version":1,"createdAt":"2026-01-01T00:00:00.000Z","appVersion":"0"}',
        ),
        'projects.json': strToU8('[{"id":"x"}]'),
        'kv.json': strToU8('[]'),
      }),
    ]);
    expect(await codeOf(b.importAll(badProject, { mode: 'replace' }))).toBe('invalidBackup');
    expect(await s.db.projects.count()).toBe(1);
  });

  it('restore enforces the size limit and the file-name allow-list', async () => {
    const { s } = await seeded();
    const tooBig = { size: MAX_IMAGE_BYTES + 1 } as Blob;
    expect(await codeOf(s.blobs.restore('abc.jpg', tooBig))).toBe('fileTooLarge');
    expect(await codeOf(s.blobs.restore('../x.jpg', jpeg()))).toBe('invalidFileName');
  });
});

describe('autosaver', () => {
  it('debounces, keeps the latest value and flushes immediately', async () => {
    vi.useFakeTimers();
    const saved: number[] = [];
    const saver = createAutosaver<number>((v) => {
      saved.push(v);
      return Promise.resolve();
    }, 500);
    saver.schedule(1);
    await vi.advanceTimersByTimeAsync(300);
    saver.schedule(2);
    await vi.advanceTimersByTimeAsync(300);
    expect(saved).toEqual([]);
    await vi.advanceTimersByTimeAsync(300);
    expect(saved).toEqual([2]);
    saver.schedule(3);
    await saver.flush();
    expect(saved).toEqual([2, 3]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(saved).toEqual([2, 3]);
    vi.useRealTimers();
  });
});
