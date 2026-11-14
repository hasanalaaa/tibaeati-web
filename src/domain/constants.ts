export const DEFAULT_MARGIN_MM = 10;
export const DEFAULT_GAP_MM = 6;
export const DEFAULT_BLEED_MM = 0;
export const DEFAULT_SAFE_AREA_MM = 2.5;

export const PREVIEW_BASE_DPI = 120;
export const PREVIEW_MAX_DPI = 220;
export const MINIMUM_EXPORTED_IMAGE_DPI = 150;
export const EXPORTED_IMAGE_DPI = 300;
export const HIGH_EXPORTED_IMAGE_DPI = 450;
export const ULTRA_EXPORTED_IMAGE_DPI = 600;
export const MAXIMUM_EXPORTED_IMAGE_DPI = 600;

export const AVAILABLE_EXPORT_DPIS = [150, 300, 450, 600] as const;
export const MAXIMUM_CARDS_PER_PROJECT = 200;
export const MAXIMUM_STORED_IMAGE_DIMENSION = 8_000;
export const MAXIMUM_RASTER_PIXEL_COUNT = 48_000_000;
export const EXPORT_RETENTION_MS = 24 * 60 * 60 * 1_000;
