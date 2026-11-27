import { DexieStore } from '@/storage/dexieStore';
import { MemoryStore } from '@/storage/memoryStore';
import type { Profile, ProgressStore } from '@/storage/types';

/**
 * Opens on-device storage, or an in-memory store if the browser blocks it, so a lesson can still be played.
 * Also returns the profiles read while checking that the store works, so callers need not read them again.
 */
export async function openStore(
  make: () => ProgressStore = () => new DexieStore(),
): Promise<{ store: ProgressStore; persistent: boolean; profiles: Profile[] }> {
  try {
    const store = make();
    const profiles = await store.listProfiles();
    return { store, persistent: true, profiles };
  } catch {
    return { store: new MemoryStore(), persistent: false, profiles: [] };
  }
}

export interface Booted {
  store: ProgressStore;
  persistent: boolean;
  profiles: Profile[];
  profileId: string | null;
}

/**
 * The whole start-up sequence: open the store, then pick the remembered profile if it still exists.
 * Never rejects: if anything fails, the app starts on an empty in-memory store instead of a blank page.
 */
export async function bootStore(
  deps: { make?: () => ProgressStore; readSavedId?: () => string | null } = {},
): Promise<Booted> {
  try {
    const { store, persistent, profiles } = await openStore(deps.make);
    let saved: string | null = null;
    try {
      saved = deps.readSavedId?.() ?? null;
    } catch {
      // Storage blocked: nothing is remembered between visits.
    }
    const profileId = saved !== null && profiles.some((p) => p.id === saved) ? saved : null;
    return { store, persistent, profiles, profileId };
  } catch {
    return { store: new MemoryStore(), persistent: false, profiles: [], profileId: null };
  }
}
