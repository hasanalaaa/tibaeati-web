import type { z } from 'zod';
import type { TibaeatiDb } from './db';

/**
 * One schema-validated document in the `kv` table. A stored value that fails to parse is copied to
 * `<key>.corrupt` before the default is used, so a bad write can never destroy the only copy.
 */
export function createKvDoc<S extends z.ZodType>(
  db: TibaeatiDb,
  key: string,
  schema: S,
  defaults: () => z.output<S>,
) {
  async function current(): Promise<z.output<S>> {
    const row = await db.kv.get(key);
    if (row === undefined) return defaults();
    const parsed = schema.safeParse(row.value);
    if (parsed.success) return parsed.data;
    await db.kv.put({ key: `${key}.corrupt`, value: row.value });
    return defaults();
  }

  /** Read-modify-write in one transaction so concurrent updates cannot lose each other. */
  async function update(mutator: (state: z.output<S>) => z.output<S>): Promise<z.output<S>> {
    return db.transaction('rw', db.kv, async () => {
      const next = schema.parse(mutator(await current()));
      await db.kv.put({ key, value: next });
      return next;
    });
  }

  return { current, update };
}
