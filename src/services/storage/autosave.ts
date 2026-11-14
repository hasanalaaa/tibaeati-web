/** ProjectEditorViewModel.scheduleAutosave sleeps 500 ms (ProjectEditorViewModel.swift:390). */
export const AUTOSAVE_DELAY_MS = 500;

export interface Autosaver<T> {
  /** Replaces any pending value and restarts the delay. */
  schedule(value: T): void;
  /** Saves the pending value now, if any. Resolves when the save has finished. */
  flush(): Promise<void>;
  /** Drops the pending value without saving. */
  cancel(): void;
}

export function createAutosaver<T>(
  save: (value: T) => Promise<void>,
  delayMs: number = AUTOSAVE_DELAY_MS,
): Autosaver<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { value: T } | undefined;
  // Saves run one after another so an older write can never land after a newer one.
  let chain: Promise<void> = Promise.resolve();

  function run(): Promise<void> {
    clearTimeout(timer);
    timer = undefined;
    const job = pending;
    pending = undefined;
    if (job) chain = chain.then(() => save(job.value));
    return chain;
  }

  return {
    schedule(value) {
      pending = { value };
      clearTimeout(timer);
      timer = setTimeout(() => void run().catch(() => undefined), delayMs);
    },
    flush: run,
    cancel() {
      clearTimeout(timer);
      timer = undefined;
      pending = undefined;
    },
  };
}

/** Flushes when the page is hidden or being closed, the last moments a save can still run. */
export function flushOnPageHide(autosaver: Autosaver<never> | Autosaver<unknown>): () => void {
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') void autosaver.flush();
  };
  const onPageHide = (): void => void autosaver.flush();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
  };
}
