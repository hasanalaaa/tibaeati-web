import { DomainError } from '@/domain/errors';
import { CanvasUnavailableError, executeRaster, executeText } from './canvasOps';
import type { WorkerRequest, WorkerResponse } from './render';

// Worker entry: same executor as the main thread, on OffscreenCanvas.
self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const run =
    request.kind === 'raster'
      ? executeRaster(request.job)
      : executeText(request.text, request.style);
  run.then(
    (result) => {
      const response: WorkerResponse = { id: request.id, ok: true, result };
      self.postMessage(response);
    },
    (error: unknown) => {
      const response: WorkerResponse = {
        id: request.id,
        ok: false,
        unsupported: error instanceof CanvasUnavailableError,
        message: error instanceof Error ? error.message : String(error),
        ...(error instanceof DomainError ? { error: error.error } : {}),
      };
      self.postMessage(response);
    },
  );
});
