import { useRef, useState } from 'react';
import { useI18n } from '@/app/i18n';
import { DomainError, appErrorMessage } from '@/domain/errors';
import { downloadBlob } from '@/lib/download';
import { storage } from '@/services/storage';
import { Button, ConfirmDialog, useToast } from '@/ui';
import { Section } from './Section';

type Mode = 'merge' | 'replace';
const MODES: readonly Mode[] = ['merge', 'replace'];

export function BackupSection() {
  const { t } = useI18n();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('merge');
  const [pending, setPending] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function guarded(action: () => Promise<string>): Promise<void> {
    try {
      toast.show(await action());
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

  const exportAll = () =>
    guarded(async () => {
      const blob = await storage().backup.exportAll();
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `tibaeati-backup-${date}.zip`);
      return t('settings.backup.exported');
    });

  const importFile = (file: File) =>
    guarded(async () => {
      const result = await storage().backup.importAll(file, { mode });
      return t('settings.backup.imported', { projects: result.projects, blobs: result.blobs });
    });

  return (
    <Section title={t('settings.backup')}>
      <p className="mb-3 text-fg-muted">{t('settings.backup.body')}</p>
      <Button
        onClick={() => {
          void exportAll();
        }}
      >
        {t('settings.backup.export')}
      </Button>
      <fieldset className="mt-4 border-0 p-0">
        <legend className="mb-2 text-sm font-semibold">{t('settings.backup.mode')}</legend>
        <div className="flex flex-wrap gap-2">
          {MODES.map((value) => (
            <Button
              key={value}
              variant={mode === value ? 'primary' : 'secondary'}
              aria-pressed={mode === value}
              onClick={() => {
                setMode(value);
              }}
            >
              {t(`settings.backup.mode.${value}`)}
            </Button>
          ))}
        </div>
      </fieldset>
      <Button
        variant="secondary"
        className="mt-3"
        onClick={() => {
          fileInput.current?.click();
        }}
      >
        {t('settings.backup.import')}
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept=".zip,application/zip"
        hidden
        aria-label={t('settings.backup.import')}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          if (mode === 'replace') setPending(file);
          else void importFile(file);
        }}
      />
      <ConfirmDialog
        open={pending !== null}
        title={t('settings.backup.replace.title')}
        confirmLabel={t('settings.backup.replace.confirm')}
        cancelLabel={t('common.cancel')}
        onCancel={() => {
          setPending(null);
        }}
        onConfirm={() => {
          const file = pending;
          setPending(null);
          if (file) void importFile(file);
        }}
      >
        {t('settings.backup.replace.body')}
      </ConfirmDialog>
    </Section>
  );
}
