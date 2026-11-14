import { Link, useRoute } from 'wouter';
import type { ReactNode } from 'react';
import { useT } from './i18n';
import type { MessageKey } from './i18n';

const stroke = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

interface Item {
  href: string;
  label: MessageKey;
  match: string;
  icon: ReactNode;
}

const ITEMS: readonly Item[] = [
  {
    href: '/',
    label: 'nav.home',
    match: '/',
    icon: (
      <svg {...stroke}>
        <path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />
      </svg>
    ),
  },
  {
    href: '/library',
    label: 'nav.library',
    match: '/library',
    icon: (
      <svg {...stroke}>
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'nav.settings',
    match: '/settings',
    icon: (
      <svg {...stroke}>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
      </svg>
    ),
  },
];

function NavLink({ item }: { item: Item }) {
  const t = useT();
  const [active] = useRoute(item.match === '/' ? '/' : `${item.match}/*?`);
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`focus-ring flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold no-underline ${active ? 'text-accent' : 'text-fg-muted'}`}
    >
      {item.icon}
      <span>{t(item.label)}</span>
    </Link>
  );
}

/** Bottom navigation: Home, Library, Settings. */
export function AppNav() {
  const t = useT();
  return (
    <nav
      aria-label={t('nav.main')}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-chrome pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-(--content-max)">
        {ITEMS.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </div>
    </nav>
  );
}
