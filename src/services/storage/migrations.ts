import { DomainError } from '@/domain/errors';
import { PRINT_PROJECT_SCHEMA_VERSION } from '@/domain/models/printProject';

type Migration = (record: Record<string, unknown>) => Record<string, unknown>;

/**
 * Keyed by the version a record is migrated FROM; each step returns a record at version + 1.
 * Version 1 is current, so the table is empty. Add `1: (r) => ({ ...r, schemaVersion: 2 })` here
 * together with the zod schema change.
 */
const PROJECT_MIGRATIONS: Readonly<Record<number, Migration>> = {};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Brings a raw stored project up to the current shape. Throws `unsupportedProjectVersion` when newer. */
export function migrateProjectRecord(raw: unknown): unknown {
  if (!isRecord(raw)) return raw; // the zod parse reports the real problem
  let version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1;
  if (version > PRINT_PROJECT_SCHEMA_VERSION) {
    throw new DomainError({ code: 'unsupportedProjectVersion' });
  }
  let record = raw;
  while (version < PRINT_PROJECT_SCHEMA_VERSION) {
    const step = PROJECT_MIGRATIONS[version];
    if (!step) return raw;
    record = step(record);
    version += 1;
  }
  return record;
}
