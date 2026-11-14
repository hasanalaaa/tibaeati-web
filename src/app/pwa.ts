import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

let needRefresh = false;
let applyUpdate: (() => Promise<void>) | undefined;
const listeners = new Set<() => void>();

export function registerServiceWorker(): void {
  applyUpdate = registerSW({
    onNeedRefresh() {
      needRefresh = true;
      listeners.forEach((listener) => listener());
    },
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePwaUpdate(): { needRefresh: boolean; update: () => void } {
  const pending = useSyncExternalStore(subscribe, () => needRefresh);
  // Activates the waiting worker and reloads the page.
  return { needRefresh: pending, update: () => void applyUpdate?.() };
}
