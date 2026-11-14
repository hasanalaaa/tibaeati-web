import type { Message } from '../messages';

export const PREFLIGHT_SEVERITY_RANK = { information: 0, warning: 1, blocking: 2 } as const;
export type PreflightSeverity = keyof typeof PREFLIGHT_SEVERITY_RANK;

export interface PreflightIssue {
  readonly id: string;
  readonly severity: PreflightSeverity;
  readonly title: Message;
  readonly detail: Message;
}

export interface PreflightReport {
  readonly issues: readonly PreflightIssue[];
  readonly checkedAt: Date;
}

export const blockingIssues = (report: PreflightReport): PreflightIssue[] =>
  report.issues.filter((i) => i.severity === 'blocking');

export const warningIssues = (report: PreflightReport): PreflightIssue[] =>
  report.issues.filter((i) => i.severity === 'warning');

export const canExport = (report: PreflightReport): boolean => blockingIssues(report).length === 0;

export function preflightHeadline(report: PreflightReport): Message {
  if (blockingIssues(report).length > 0) return { key: 'preflight.headline.blocking' };
  if (warningIssues(report).length > 0) return { key: 'preflight.headline.warnings' };
  return { key: 'preflight.headline.ready' };
}
