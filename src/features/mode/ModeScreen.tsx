import { useLocation } from 'wouter';
import { useT } from '@/app/i18n';
import { isModeId } from '@/domain/modes';
import { Card, Screen } from '@/ui';
import { NotFoundScreen } from './NotFoundScreen';

export function ModeScreen({ id }: { id: string }) {
  const t = useT();
  const [, navigate] = useLocation();
  if (!isModeId(id)) return <NotFoundScreen />;
  return (
    <Screen title={t(`mode.${id}.title`)} backLabel={t('nav.back')} onBack={() => navigate('/')}>
      <Card className="text-center">
        <h2 className="text-xl font-bold">{t('mode.soon.title')}</h2>
        <p className="mt-2 text-fg-muted">{t('mode.soon.body')}</p>
      </Card>
    </Screen>
  );
}
