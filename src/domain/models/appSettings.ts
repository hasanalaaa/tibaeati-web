import { z } from 'zod';

export const APP_SETTINGS_SCHEMA_VERSION = 1;

const margin = z.number().min(0).max(50);

/** Non-UI preferences Swift kept in @AppStorage. Language and appearance stay in localStorage. */
export const AppSettingsSchema = z.object({
  schemaVersion: z.literal(APP_SETTINGS_SCHEMA_VERSION),
  pageMarginTop: margin.default(8),
  pageMarginBottom: margin.default(8),
  pageMarginLeading: margin.default(8),
  pageMarginTrailing: margin.default(8),
  onboardingCompleted: z.boolean().default(false),
  privacyLockEnabled: z.boolean().default(false),
  privacyHideInSwitcher: z.boolean().default(true),
});
export type AppSettings = z.output<typeof AppSettingsSchema>;

export const defaultAppSettings = (): AppSettings =>
  AppSettingsSchema.parse({ schemaVersion: APP_SETTINGS_SCHEMA_VERSION });
