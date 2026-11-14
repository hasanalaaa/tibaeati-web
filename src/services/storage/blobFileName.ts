/** Extensions a stored file may have. Everything else is rejected, on write and on backup import. */
export const BLOB_EXTENSIONS = ['jpg', 'png', 'webp', 'heic', 'pdf'] as const;
export type BlobExtension = (typeof BLOB_EXTENSIONS)[number];

// One flat component: no path separators, no leading dot, no ".." anywhere, bounded length.
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}\.(jpg|png|webp|heic|pdf)$/;

export function isSafeBlobFileName(fileName: string): boolean {
  return SAFE_NAME.test(fileName);
}

export function blobExtension(fileName: string): BlobExtension {
  return fileName.slice(fileName.lastIndexOf('.') + 1) as BlobExtension;
}

const EXTENSION_BY_MIME: Readonly<Record<string, BlobExtension>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'application/pdf': 'pdf',
};

export const extensionForMime = (mimeType: string): BlobExtension | undefined =>
  EXTENSION_BY_MIME[mimeType.toLowerCase()];

export const MIME_BY_EXTENSION: Readonly<Record<BlobExtension, string>> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  pdf: 'application/pdf',
};
