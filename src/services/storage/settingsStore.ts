import { AppSettingsSchema, defaultAppSettings } from '@/domain/models/appSettings';
import type { TibaeatiDb } from './db';
import { createKvDoc } from './kvDoc';

export const createSettingsStore = (db: TibaeatiDb) =>
  createKvDoc(db, 'settings', AppSettingsSchema, defaultAppSettings);

export type SettingsStore = ReturnType<typeof createSettingsStore>;
