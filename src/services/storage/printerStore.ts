import { defaultPrinterState, PrinterStateSchema } from '@/domain/models/printerState';
import type { TibaeatiDb } from './db';
import { createKvDoc } from './kvDoc';

/** Mirror of Swift PrinterStoreMigrator's `current()` / `update(_:)`. */
export const createPrinterStore = (db: TibaeatiDb) =>
  createKvDoc(db, 'printers', PrinterStateSchema, defaultPrinterState);

export type PrinterStore = ReturnType<typeof createPrinterStore>;
