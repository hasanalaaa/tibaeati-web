import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/app/i18n';
import { formatBytes } from '@/lib/bytes';
import { requestPersistence, storage, storageStatus } from '@/services/storage';
import type { StorageStatus } from '@/services/storage';
import { Button, useToast } from '@/ui';
import { Section } from './Section';

interface Snapshot {
  status: StorageStatus;
  files: { count: number; bytes: number };
}

async function loadSnapshot(): Promise<Snapshot> {
  const [status, files] = await Promise.all([storageStatus(), storage().blobs.usage()]);
  return { status, files };
}

export function StorageSection() {
  const { t, language } = useI18n();
  const toast = useToast();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  const refresh = useCallback(async () => {
    setSnapshot(await loadSnapshot());
  }, []);

  useEffect(() => {
    let live = true;
    void loadSnapshot()
      .then((next) => {
        if (live) setSnapshot(next);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  async function request(): Promise<void> {
    const granted = await requestPersistence();
    toast.show(granted === true ? t('settings.storage.granted') : t('settings.storage.denied'));
    await refresh();
  }

  const status = snapshot?.status;
  const persistence =
    status?.persisted === undefined
      ? t('settings.storage.unsupported')
      : status.persisted
        ? t('settings.storage.persisted')
        : t('settings.storage.notPersisted');

  return (
    <Section title={t('settings.storage')}>
      <div role="status" className="space-y-1 text-fg-muted">
        {snapshot ? (
          <>
            <p>
              {status?.usageBytes !== undefined && status.quotaBytes !== undefined
                ? t('settings.storage.usage', {
                    used: formatBytes(status.usageBytes, language),
                    quota: formatBytes(status.quotaBytes, language),
                  })
                : t('settings.storage.usageUnknown')}
            </p>
            <p>
              {t('settings.storage.files', {
                count: snapshot.files.count,
                size: formatBytes(snapshot.files.bytes, language),
              })}
            </p>
            <p>{persistence}</p>
          </>
        ) : null}
      </div>
      {status?.persisted === false ? (
        <Button
          className="mt-3"
          onClick={() => {
            void request();
          }}
        >
          {t('settings.storage.request')}
        </Button>
      ) : null}
    </Section>
  );
}
