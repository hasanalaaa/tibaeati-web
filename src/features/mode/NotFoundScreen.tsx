import { useLocation } from 'wouter';
import { useT } from '@/app/i18n';
import { Button, Card, Screen } from '@/ui';

export function NotFoundScreen() {
  const t = useT();
  const [, navigate] = useLocation();
  return (
    <Screen title={t('notFound.title')} backLabel={t('nav.back')} onBack={() => navigate('/')}>
      <Card className="text-center">
        <p className="text-fg-muted">{t('notFound.body')}</p>
        <Button className="mt-4" onClick={() => navigate('/')}>
          {t('notFound.home')}
        </Button>
      </Card>
    </Screen>
  );
}
