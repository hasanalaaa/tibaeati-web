import type { ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useI18n } from '@/app/i18n';
import type { Language } from '@/app/i18n';
import { Button, Card, Screen } from '@/ui';

type Appearance = 'system' | 'light' | 'dark';

const LANGUAGES: readonly Language[] = ['ar', 'en'];
const APPEARANCES: readonly Appearance[] = ['system', 'light', 'dark'];

export interface SettingsScreenProps {
  appearance: Appearance;
  onAppearanceChange: (appearance: Appearance) => void;
  version: string;
  updateAvailable: boolean;
  onUpdate: () => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="mb-3">
      <h2 className="mb-3 text-base font-bold">{title}</h2>
      {children}
    </Card>
  );
}

export function SettingsScreen({
  appearance,
  onAppearanceChange,
  version,
  updateAvailable,
  onUpdate,
}: SettingsScreenProps) {
  const { t, language, setLanguage } = useI18n();
  const [, navigate] = useLocation();
  return (
    <Screen title={t('settings.title')} backLabel={t('nav.back')} onBack={() => navigate('/')}>
      <div className="mx-auto max-w-xl">
        <Section title={t('settings.language')}>
          <div role="group" aria-label={t('settings.language')} className="flex flex-wrap gap-2">
            {LANGUAGES.map((code) => (
              <Button
                key={code}
                variant={language === code ? 'primary' : 'secondary'}
                aria-pressed={language === code}
                onClick={() => setLanguage(code)}
              >
                {t(`settings.language.${code}`)}
              </Button>
            ))}
          </div>
        </Section>
        <Section title={t('settings.appearance')}>
          <div role="group" aria-label={t('settings.appearance')} className="flex flex-wrap gap-2">
            {APPEARANCES.map((value) => (
              <Button
                key={value}
                variant={appearance === value ? 'primary' : 'secondary'}
                aria-pressed={appearance === value}
                onClick={() => onAppearanceChange(value)}
              >
                {t(`settings.appearance.${value}`)}
              </Button>
            ))}
          </div>
        </Section>
        <Section title={t('settings.update')}>
          <p className="mb-3 text-fg-muted" role="status">
            {updateAvailable ? t('settings.update.available') : t('settings.update.none')}
          </p>
          {updateAvailable ? (
            <Button onClick={onUpdate}>{t('settings.update.apply')}</Button>
          ) : null}
        </Section>
        <Section title={t('settings.version')}>
          <p dir="ltr" className="text-fg-muted">
            {version}
          </p>
        </Section>
        <p className="px-1 text-sm text-fg-subtle">{t('settings.privacy')}</p>
      </div>
    </Screen>
  );
}
