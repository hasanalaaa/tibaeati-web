import type { Message, MessageParam } from './messages';

export type AppError =
  | { readonly code: 'invalidProject'; readonly reason: Message }
  | { readonly code: 'noPrintableCards' }
  | { readonly code: 'storageUnavailable' }
  | { readonly code: 'readFailed'; readonly fileName: string }
  | { readonly code: 'writeFailed'; readonly fileName: string }
  | { readonly code: 'corruptProject'; readonly fileName: string }
  | { readonly code: 'imageEncodingFailed' }
  | { readonly code: 'imageDecodingFailed' }
  | { readonly code: 'missingImage'; readonly fileName: string }
  | { readonly code: 'invalidFileName' }
  | { readonly code: 'exportFailed'; readonly reason: MessageParam }
  | { readonly code: 'printCancelled' }
  | { readonly code: 'unsupportedProjectVersion' }
  | { readonly code: 'fileTooLarge' }
  | { readonly code: 'unsupportedFileType' }
  | { readonly code: 'invalidBackup' };

export type AppErrorCode = AppError['code'];

/** Thrown carrier for an `AppError`, so domain code can fail loudly like Swift `throws`. */
export class DomainError extends Error {
  readonly error: AppError;

  constructor(error: AppError) {
    super(error.code);
    this.name = 'DomainError';
    this.error = error;
  }
}

export function appErrorMessage(error: AppError): Message {
  switch (error.code) {
    case 'invalidProject':
      return { key: 'appError.invalidProject', params: { reason: error.reason } };
    case 'exportFailed':
      return { key: 'appError.exportFailed', params: { reason: error.reason } };
    case 'readFailed':
    case 'writeFailed':
    case 'corruptProject':
    case 'missingImage':
      return { key: `appError.${error.code}`, params: { fileName: error.fileName } };
    default:
      return { key: `appError.${error.code}` };
  }
}
