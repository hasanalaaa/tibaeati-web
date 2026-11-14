import { Link } from 'wouter';
import { useI18n } from '@/app/i18n';
import type { ProjectSummary } from '@/services/storage';
import { Card, Menu } from '@/ui';
import type { MenuItem } from '@/ui';
import { relativeTime } from './relativeTime';

export interface ProjectItemActions {
  rename: (project: ProjectSummary) => void;
  duplicate: (project: ProjectSummary) => void;
  restore: (project: ProjectSummary) => void;
  export: (project: ProjectSummary) => void;
  remove: (project: ProjectSummary) => void;
}

function DotsIcon() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

export function ProjectItem({
  project,
  now,
  actions,
  onOpen,
}: {
  project: ProjectSummary;
  now: Date;
  actions: ProjectItemActions;
  onOpen: () => void;
}) {
  const { t, language } = useI18n();
  const name = project.name === '' ? t('project.untitled') : project.name;
  const count =
    project.pageCount === undefined
      ? t('library.cards', { count: project.cardCount })
      : t('library.pages', { count: project.pageCount });
  const items: MenuItem[] = [
    { key: 'open', label: t('library.action.open'), onSelect: onOpen },
    {
      key: 'rename',
      label: t('library.action.rename'),
      onSelect: () => {
        actions.rename(project);
      },
    },
    {
      key: 'duplicate',
      label: t('library.action.duplicate'),
      onSelect: () => {
        actions.duplicate(project);
      },
    },
    {
      key: 'restore',
      label: t('library.action.restore'),
      disabled: !project.hasPreviousVersion,
      onSelect: () => {
        actions.restore(project);
      },
    },
    {
      key: 'export',
      label: t('library.action.export'),
      onSelect: () => {
        actions.export(project);
      },
    },
    {
      key: 'delete',
      label: t('library.action.delete'),
      onSelect: () => {
        actions.remove(project);
      },
    },
  ];
  return (
    <li>
      <Card className="flex items-center gap-2 p-2 ps-4">
        <Link
          href={`/project/${project.id}`}
          className="focus-ring block min-h-11 min-w-0 flex-1 rounded-md py-1 text-inherit no-underline"
        >
          <span className="block truncate text-base font-bold">{name}</span>
          <span className="block truncate text-sm text-fg-muted">
            {t(`mode.${project.mode}.title`)} · {count}
          </span>
          <span className="block truncate text-sm text-fg-subtle">
            {t('library.updated', { time: relativeTime(project.updatedAt, now, language) })}
          </span>
        </Link>
        <Menu label={t('library.menu', { name })} items={items}>
          <DotsIcon />
        </Menu>
      </Card>
    </li>
  );
}
