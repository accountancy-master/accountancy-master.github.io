// Asks the browser not to clear this app's stored progress when space runs low. All calls are guarded:
// a missing or failing storage API just means the browser keeps its own default behaviour.

let lastRequest: Promise<void> = Promise.resolve();

/** Requests persistent storage. Never throws and never rejects; the answer is read with `isStoragePersisted`. */
export function requestPersistence(): Promise<void> {
  lastRequest = (async () => {
    try {
      await navigator.storage?.persist?.();
    } catch {
      // Ignored: the request is only a courtesy to the browser.
    }
  })();
  return lastRequest;
}

/** True if the browser has agreed to keep the data; false when it has not, or when it cannot say. */
export async function isStoragePersisted(): Promise<boolean> {
  // A page's own effects run before the provider's, so let the provider's request start first.
  await Promise.resolve();
  await lastRequest;
  try {
    return (await navigator.storage?.persisted?.()) === true;
  } catch {
    return false;
  }
}
