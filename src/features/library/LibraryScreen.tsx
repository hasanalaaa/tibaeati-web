import { useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useI18n } from '@/app/i18n';
import { DomainError, appErrorMessage } from '@/domain/errors';
import { safeFileNameComponent } from '@/domain/fileName';
import { downloadBlob } from '@/lib/download';
import { storage } from '@/services/storage';
import type { ProjectSummary } from '@/services/storage';
import { Button, Card, ConfirmDialog, Dialog, EmptyState, Screen, TextField, useToast } from '@/ui';
import { ProjectItem } from './ProjectItem';
import type { ProjectItemActions } from './ProjectItem';
import { useProjects } from './useProjects';

export function LibraryScreen() {
  const { t, language } = useI18n();
  const toast = useToast();
  const [, navigate] = useLocation();
  const state = useProjects();
  const [now] = useState(() => new Date());
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const untitledName = t('project.untitled');

  async function run(action: () => Promise<string | undefined>): Promise<void> {
    try {
      const done = await action();
      if (done) toast.show(done);
    } catch (error) {
      toast.show(
        t(
          appErrorMessage(
            error instanceof DomainError ? error.error : { code: 'storageUnavailable' },
          ),
        ),
      );
    }
  }

  const actions: ProjectItemActions = {
    rename: (project) => {
      setRenameValue(project.name);
      setRenaming(project);
    },
    duplicate: (project) =>
      void run(async () => {
        await storage().projects.duplicate(project.id, {
          copySuffix: t('library.copySuffix'),
          untitledName,
        });
        return t('library.duplicated');
      }),
    restore: (project) =>
      void run(async () => {
        await storage().projects.restorePreviousVersion(project.id);
        return t('library.restored');
      }),
    export: (project) =>
      void run(async () => {
        const blob = await storage().backup.exportProject(project.id);
        const base = safeFileNameComponent(project.name === '' ? untitledName : project.name);
        downloadBlob(blob, `${base}.tibaeati.zip`);
        return t('library.exported');
      }),
    remove: setDeleting,
  };

  function onImportFile(file: File | undefined): void {
    if (!file) return;
    void run(async () => {
      const id = await storage().backup.importProject(file);
      navigate(`/project/${id}`);
      return t('library.imported');
    });
  }

  const listing = state.status === 'ready' ? state.listing : undefined;
  const needle = query.trim().toLocaleLowerCase(language);
  const visible = (listing?.projects ?? []).filter((p) =>
    (p.name === '' ? untitledName : p.name).toLocaleLowerCase(language).includes(needle),
  );

  return (
    <Screen title={t('library.title')}>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <TextField
          type="search"
          label={t('library.search')}
          hideLabel
          placeholder={t('library.search')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
          className="min-w-48 flex-1"
        />
        <Button
          variant="secondary"
          onClick={() => {
            fileInput.current?.click();
          }}
        >
          {t('library.import')}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".zip,application/zip"
          hidden
          aria-label={t('library.import')}
          onChange={(e) => {
            onImportFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      {(listing?.quarantined.length ?? 0) > 0 && listing ? (
        <Card className="mb-4 border-warning" role="alert">
          <h2 className="font-bold">
            {t('library.quarantine.title', { count: listing.quarantined.length })}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">{t('library.quarantine.body')}</p>
          <ul className="mt-2 list-none space-y-1 p-0 text-sm text-fg-muted">
            {listing.quarantined.map((q) => (
              <li key={q.id} dir="ltr" className="truncate">
                {q.id} ·{' '}
                {t(
                  q.reason === 'newerVersion'
                    ? 'library.quarantine.newer'
                    : 'library.quarantine.corrupt',
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {state.status === 'loading' ? (
        <p role="status" className="text-fg-muted">
          {t('library.loading')}
        </p>
      ) : null}
      {state.status === 'error' ? (
        <p role="alert" className="text-warning">
          {t('library.loadFailed')}
        </p>
      ) : null}
      {listing?.projects.length === 0 ? (
        <EmptyState
          title={t('library.empty.title')}
          body={t('library.empty.body')}
          action={
            <Button
              onClick={() => {
                navigate('/');
              }}
            >
              {t('library.empty.home')}
            </Button>
          }
        />
      ) : null}
      {listing && listing.projects.length > 0 && visible.length === 0 ? (
        <p className="text-fg-muted">{t('library.noResults')}</p>
      ) : null}
      {visible.length > 0 ? (
        <ul className="grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((project) => (
            <ProjectItem
              key={project.id}
              project={project}
              now={now}
              actions={actions}
              onOpen={() => {
                navigate(`/project/${project.id}`);
              }}
            />
          ))}
        </ul>
      ) : null}

      <Dialog
        open={renaming !== null}
        onClose={() => {
          setRenaming(null);
        }}
        title={t('library.rename.title')}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setRenaming(null);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="rename-form">
              {t('common.save')}
            </Button>
          </>
        }
      >
        <form
          id="rename-form"
          onSubmit={(e) => {
            e.preventDefault();
            const target = renaming;
            setRenaming(null);
            if (target)
              void run(async () => {
                await storage().projects.rename(target.id, renameValue, { untitledName });
                return t('library.renamed');
              });
          }}
        >
          <TextField
            label={t('library.rename.field')}
            value={renameValue}
            maxLength={80}
            onChange={(e) => {
              setRenameValue(e.target.value);
            }}
          />
        </form>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title={t('library.delete.title')}
        confirmLabel={t('library.delete.confirm')}
        cancelLabel={t('common.cancel')}
        onCancel={() => {
          setDeleting(null);
        }}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (target)
            void run(async () => {
              await storage().projects.delete(target.id);
              return t('library.deleted');
            });
        }}
      >
        {t('library.delete.body', {
          name: deleting && deleting.name !== '' ? deleting.name : untitledName,
        })}
      </ConfirmDialog>
    </Screen>
  );
}
