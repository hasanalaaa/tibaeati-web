import { z } from 'zod';

export const PRINTER_STATE_SCHEMA_VERSION = 1;

/** Measured duplex correction for one printer profile (Swift PrintersFile.CalibrationOverride). */
export const CalibrationOverrideSchema = z.object({
  xMM: z.number(),
  yMM: z.number(),
  scaleX: z.number(),
  scaleY: z.number(),
});
export type CalibrationOverride = z.output<typeof CalibrationOverrideSchema>;

export const PrinterStateSchema = z.object({
  schemaVersion: z.literal(PRINTER_STATE_SCHEMA_VERSION),
  selectedProfileId: z.string().optional(),
  nickname: z.string().optional(),
  calibrationOverrides: z.record(z.string(), CalibrationOverrideSchema).default({}),
  /** Reserved for SPEC X3 (multiple saved printers). Always empty until that slice. */
  savedPrinters: z.array(z.unknown()).default([]),
});
export type PrinterState = z.output<typeof PrinterStateSchema>;

export const defaultPrinterState = (): PrinterState => ({
  schemaVersion: PRINTER_STATE_SCHEMA_VERSION,
  calibrationOverrides: {},
  savedPrinters: [],
});
