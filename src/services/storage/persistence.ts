export interface StorageStatus {
  readonly persisted: boolean | undefined;
  readonly usageBytes: number | undefined;
  readonly quotaBytes: number | undefined;
}

/** Asks the browser not to evict our data. Returns undefined when the API is unavailable. */
export async function requestPersistence(): Promise<boolean | undefined> {
  if (typeof navigator === 'undefined' || !('storage' in navigator)) return undefined;
  return navigator.storage.persist();
}

export async function storageStatus(): Promise<StorageStatus> {
  if (typeof navigator === 'undefined' || !('storage' in navigator)) {
    return { persisted: undefined, usageBytes: undefined, quotaBytes: undefined };
  }
  const [persisted, estimate] = await Promise.all([
    navigator.storage.persisted(),
    navigator.storage.estimate(),
  ]);
  return { persisted, usageBytes: estimate.usage, quotaBytes: estimate.quota };
}
