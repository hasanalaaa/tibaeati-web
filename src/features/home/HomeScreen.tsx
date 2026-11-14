import { Link, useLocation } from 'wouter';
import { useT } from '@/app/i18n';
import { MODE_IDS } from '@/domain/modes';
import { Card, IconButton, Screen } from '@/ui';

function GearIcon() {
  return (
    <svg
      aria-hidden="true"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

export function HomeScreen() {
  const t = useT();
  const [, navigate] = useLocation();
  return (
    <Screen
      title={t('home.title')}
      actions={
        <IconButton label={t('nav.settings')} onClick={() => navigate('/settings')}>
          <GearIcon />
        </IconButton>
      }
    >
      <p className="mb-4 text-fg-muted">{t('home.subtitle')}</p>
      <ul className="grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {MODE_IDS.map((id) => (
          <li key={id}>
            <Link
              href={`/mode/${id}`}
              className="focus-ring block h-full rounded-lg text-inherit no-underline"
            >
              <Card interactive className="h-full">
                <h2 className="text-lg font-bold">{t(`mode.${id}.title`)}</h2>
                <p className="mt-1 text-sm text-fg-muted">{t(`mode.${id}.subtitle`)}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </Screen>
  );
}
