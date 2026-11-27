'use client';

import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ProgressStore, Profile, ProfilePatch } from '@/storage/types';
import { DEFAULT_COURSE_ID } from '@/content/catalogue.generated';
import { bootStore } from './openStore';
import { requestPersistence } from './persistence';
import type { Booted } from './openStore';

const PROFILE_KEY = 'am.profileId';

export interface StoreContextValue {
  store: ProgressStore;
  persistent: boolean;
  profiles: Profile[];
  profile: Profile | null;
  selectProfile(id: string | null): void;
  /**
   * Adds a learner and selects them. They join the course given, or the first course when none is, with the choice
   * of Part B of Class 12 given (none: the default, which Settings can change later).
   */
  createProfile(name: string, courseId?: string, options?: Pick<ProfilePatch, 'class12PartB'>): Promise<Profile>;
  /**
   * Renames the selected learner, sets their daily goal, changes the course they are on and/or switches their
   * challenge timer; `profile` reflects it as soon as this resolves. A change of course loses nothing: every screen
   * shows the other course at once, with what the learner had done in it.
   */
  updateProfile(patch: ProfilePatch): Promise<Profile>;
  /** Removes a learner and all their progress; deleting the selected learner also clears the selection. */
  deleteProfile(id: string): Promise<void>;
  refreshProfiles(): Promise<void>;
  /** False only on the landing page while the store opens (SHOWN_BEFORE_THE_STORE_OPENS): no learner is known yet. */
  ready: boolean;
}

const StoreContext = createContext<StoreContextValue | null>(null);

function readSavedProfileId(): string | null {
  try {
    return window.localStorage.getItem(PROFILE_KEY);
  } catch {
    return null;
  }
}

/**
 * In the test build only: installs the sample topic of Class 12 when a test has switched it on, before anything reads
 * what there is to play (testing/e2eCourse.ts). NEXT_PUBLIC_E2E is a build-time constant, so in a normal build this
 * does nothing and the sample's code is left out of the output.
 */
async function prepareTestBuild(): Promise<void> {
  if (process.env.NEXT_PUBLIC_E2E !== '1') return;
  try {
    (await import('@/testing/e2eCourse')).installSampleCourse();
  } catch {
    // The app starts without the sample.
  }
}

function saveProfileId(id: string | null): void {
  try {
    if (id === null) window.localStorage.removeItem(PROFILE_KEY);
    else window.localStorage.setItem(PROFILE_KEY, id);
  } catch {
    // Storage blocked: the choice simply is not remembered after a reload.
  }
}

/**
 * The page that is shown while the store opens instead of "Loading…": the landing page, which is about the app and
 * needs nothing of the learner's data but whether there is a learner to continue as (`ready` says when it knows). Its
 * built HTML is then the page itself, not "Loading…", and it stays mounted as the store opens.
 */
export const SHOWN_BEFORE_THE_STORE_OPENS = '/';

/** In place of the store until it is open: read by nothing, since there is no learner until then. */
const NOT_OPEN = new Proxy({} as ProgressStore, {
  get(_, key) {
    // Not a thenable, and safe to look at.
    if (typeof key === 'symbol' || key === 'then') return undefined;
    throw new Error('The store is not open yet');
  },
});

export function StoreProvider({ children }: { children: ReactNode }) {
  const [booted, setBooted] = useState<Booted | null>(null);
  // Kept in a ref so React strict mode's second effect run reuses the same open store.
  const bootRef = useRef<Promise<Booted> | null>(null);
  const early = usePathname() === SHOWN_BEFORE_THE_STORE_OPENS;

  useEffect(() => {
    let cancelled = false;
    bootRef.current ??= prepareTestBuild().then(() => bootStore({ readSavedId: readSavedProfileId }));
    void bootRef.current.then((b) => {
      if (!cancelled) setBooted(b);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!booted && !early) {
    return (
      <div data-testid="app-loading" aria-busy="true" className="flex min-h-dvh items-center justify-center">
        <p className="text-base">Loading…</p>
      </div>
    );
  }
  return <ReadyProvider booted={booted}>{children}</ReadyProvider>;
}

/** The store once it is open; before that (the landing page only) a store with no learner, and `ready` false. */
function ReadyProvider({ booted, children }: { booted: Booted | null; children: ReactNode }) {
  const store = booted?.store ?? NOT_OPEN;
  const persistent = booted?.persistent ?? false;
  const [profiles, setProfiles] = useState<Profile[]>(booted?.profiles ?? []);
  const [profileId, setProfileId] = useState<string | null>(booted?.profileId ?? null);
  // The store opened while the page was already shown: take what it holds, once.
  const [seen, setSeen] = useState(booted);
  if (seen !== booted) {
    setSeen(booted);
    setProfiles(booted?.profiles ?? []);
    setProfileId(booted?.profileId ?? null);
  }

  // Once after boot, if there is any progress worth keeping.
  const hadProfiles = (booted?.profiles.length ?? 0) > 0;
  useEffect(() => {
    if (hadProfiles) void requestPersistence();
  }, [hadProfiles]);

  const selectProfile = useCallback((id: string | null) => {
    setProfileId(id);
    saveProfileId(id);
  }, []);

  const refreshProfiles = useCallback(async () => {
    setProfiles(await store.listProfiles());
  }, [store]);

  const createProfile = useCallback(
    async (name: string, courseId: string = DEFAULT_COURSE_ID, options: Pick<ProfilePatch, 'class12PartB'> = {}) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Enter a name');
      let created = await store.createProfile(trimmed, DEFAULT_COURSE_ID);
      // A course that was chosen is set the way Settings sets it, through the same check.
      if (courseId !== DEFAULT_COURSE_ID) created = await store.updateProfile(created.id, { courseId });
      // A choice of Part B made as the learner is added is kept like one made in Settings.
      if (options.class12PartB !== undefined) created = await store.updateProfile(created.id, { class12PartB: options.class12PartB });
      setProfiles(await store.listProfiles());
      selectProfile(created.id);
      void requestPersistence();
      return created;
    },
    [store, selectProfile],
  );

  const updateProfile = useCallback(
    async (patch: ProfilePatch) => {
      if (profileId === null) throw new Error('Profile not found');
      const updated = await store.updateProfile(profileId, patch);
      setProfiles(await store.listProfiles());
      return updated;
    },
    [store, profileId],
  );

  const deleteProfile = useCallback(
    async (id: string) => {
      await store.deleteProfile(id);
      // The learner is gone from storage, so the selection goes first even if refreshing the list fails.
      if (id === profileId) selectProfile(null);
      setProfiles(await store.listProfiles());
    },
    [store, profileId, selectProfile],
  );

  const profile = useMemo(() => profiles.find((p) => p.id === profileId) ?? null, [profiles, profileId]);

  const value = useMemo<StoreContextValue>(
    () => ({
      store,
      persistent,
      profiles,
      profile,
      selectProfile,
      createProfile,
      updateProfile,
      deleteProfile,
      refreshProfiles,
      ready: booted !== null,
    }),
    [store, persistent, profiles, profile, selectProfile, createProfile, updateProfile, deleteProfile, refreshProfiles, booted],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
