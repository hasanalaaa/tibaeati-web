import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useT } from '@/app/i18n';
import { storage } from '@/services/storage';
import { Card, Screen } from '@/ui';

/** Stands in for the editor (slice S3). */
export function ProjectPlaceholderScreen({ id }: { id: string }) {
  const t = useT();
  const [, navigate] = useLocation();
  const [name, setName] = useState('');
  useEffect(() => {
    let live = true;
    void storage()
      .projects.get(id)
      .then((project) => {
        if (live) setName(project?.name ?? '');
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [id]);
  return (
    <Screen
      title={name === '' ? t('project.untitled') : name}
      backLabel={t('nav.back')}
      onBack={() => {
        navigate('/library');
      }}
    >
      <Card className="text-center">
        <h2 className="text-xl font-bold">{t('project.placeholder.title')}</h2>
        <p className="mt-2 text-fg-muted">{t('mode.soon.body')}</p>
      </Card>
    </Screen>
  );
}
