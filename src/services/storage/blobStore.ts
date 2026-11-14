import { DomainError } from '@/domain/errors';
import { randomId } from '@/domain/ids';
import type { NewId } from '@/domain/ids';
import {
  blobExtension,
  extensionForMime,
  isSafeBlobFileName,
  MIME_BY_EXTENSION,
} from './blobFileName';
import type { BlobExtension } from './blobFileName';
import type { TibaeatiDb } from './db';

/** ImageImportService.maximumInputBytes (ImageImportService.swift:5). */
export const MAX_IMAGE_BYTES = 80 * 1_024 * 1_024;
/** DocumentFileStore.maximumPDFBytes (DocumentFileStore.swift:8). */
export const MAX_PDF_BYTES = 50 * 1_024 * 1_024;

const maxBytes = (extension: BlobExtension): number =>
  extension === 'pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;

export interface BlobStoreDeps {
  readonly newId?: NewId;
  readonly now?: () => Date;
}

export interface BlobUsage {
  readonly count: number;
  readonly bytes: number;
}

export function createBlobStore(db: TibaeatiDb, deps: BlobStoreDeps = {}) {
  const newId = deps.newId ?? randomId;
  const now = deps.now ?? (() => new Date());

  function check(blob: Blob, extension: BlobExtension | undefined): BlobExtension {
    if (extension === undefined) throw new DomainError({ code: 'unsupportedFileType' });
    if (blob.size === 0) throw new DomainError({ code: 'unsupportedFileType' });
    if (blob.size > maxBytes(extension)) throw new DomainError({ code: 'fileTooLarge' });
    return extension;
  }

  async function write(fileName: string, blob: Blob, extension: BlobExtension): Promise<void> {
    await db.blobs.put({
      fileName,
      blob,
      mimeType: MIME_BY_EXTENSION[extension],
      byteLength: blob.size,
      createdAt: now().toISOString(),
    });
  }

  return {
    /** Stores `blob` under a generated, safe file name and returns that name. */
    async put(blob: Blob, options: { mimeType: string }): Promise<string> {
      const extension = check(blob, extensionForMime(options.mimeType));
      const fileName = `${newId()}.${extension}`;
      await write(fileName, blob, extension);
      return fileName;
    },

    /** Stores under a caller-chosen name (backup import). The name must already be safe. */
    async restore(fileName: string, blob: Blob): Promise<void> {
      if (!isSafeBlobFileName(fileName)) throw new DomainError({ code: 'invalidFileName' });
      await write(fileName, blob, check(blob, blobExtension(fileName)));
    },

    async get(fileName: string): Promise<Blob | undefined> {
      if (!isSafeBlobFileName(fileName)) return undefined;
      return (await db.blobs.get(fileName))?.blob;
    },

    async has(fileName: string): Promise<boolean> {
      return (await db.blobs.where(':id').equals(fileName).count()) > 0;
    },

    async delete(fileName: string): Promise<void> {
      await db.blobs.delete(fileName);
    },

    async usage(): Promise<BlobUsage> {
      let bytes = 0;
      let count = 0;
      await db.blobs.each((row) => {
        bytes += row.byteLength;
        count += 1;
      });
      return { count, bytes };
    },
  };
}

export type BlobStore = ReturnType<typeof createBlobStore>;
