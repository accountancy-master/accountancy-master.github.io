import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '@/storage/memoryStore';
import type { ProgressStore } from '@/storage/types';
import { bootStore, openStore } from './openStore';

describe('openStore', () => {
  it('uses the persistent store when it works', async () => {
    const { store, persistent, profiles } = await openStore();
    expect(persistent).toBe(true);
    expect(profiles).toEqual([]);
    const p = await store.createProfile('A', 'cbse-11-accountancy');
    expect((await store.listProfiles()).map((x) => x.id)).toContain(p.id);
  });

  it('falls back to memory when the persistent store cannot be opened', async () => {
    const broken = () => {
      throw new Error('IndexedDB blocked');
    };
    const { store, persistent, profiles } = await openStore(broken);
    expect(persistent).toBe(false);
    expect(store).toBeInstanceOf(MemoryStore);
    expect(profiles).toEqual([]);
  });

  it('falls back when the first read fails (private browsing)', async () => {
    const failing = () =>
      ({
        listProfiles: async () => {
          throw new Error('quota');
        },
      }) as unknown as ProgressStore;
    const { persistent, profiles } = await openStore(failing);
    expect(persistent).toBe(false);
    expect(profiles).toEqual([]);
  });

  it('returns the profiles it already read, with a single read', async () => {
    const memory = new MemoryStore();
    const p = await memory.createProfile('A', 'cbse-11-accountancy');
    let reads = 0;
    const counting = {
      listProfiles: async () => {
        reads++;
        return memory.listProfiles();
      },
    } as unknown as ProgressStore;
    const { profiles } = await openStore(() => counting);
    expect(profiles.map((x) => x.id)).toEqual([p.id]);
    expect(reads).toBe(1);
  });
});

describe('bootStore', () => {
  async function storeWith(...names: string[]) {
    const memory = new MemoryStore();
    const made = [];
    for (const n of names) made.push(await memory.createProfile(n, 'cbse-11-accountancy'));
    return { memory, made };
  }

  it('returns the store, its profiles and the saved selection', async () => {
    const { memory, made } = await storeWith('A', 'B');
    const booted = await bootStore({ make: () => memory, readSavedId: () => made[1].id });
    expect(booted.store).toBe(memory);
    expect(booted.persistent).toBe(true);
    expect(booted.profiles.map((p) => p.id).sort()).toEqual(made.map((p) => p.id).sort());
    expect(booted.profileId).toBe(made[1].id);
  });

  it('ignores a saved id that no longer exists', async () => {
    const { memory } = await storeWith('A');
    const booted = await bootStore({ make: () => memory, readSavedId: () => 'gone' });
    expect(booted.persistent).toBe(true);
    expect(booted.profileId).toBeNull();
  });

  it('selects nothing when nothing was saved', async () => {
    const { memory } = await storeWith('A');
    const booted = await bootStore({ make: () => memory, readSavedId: () => null });
    expect(booted.profileId).toBeNull();
  });

  it('tolerates localStorage throwing', async () => {
    const { memory } = await storeWith('A');
    const booted = await bootStore({
      make: () => memory,
      readSavedId: () => {
        throw new Error('storage blocked');
      },
    });
    expect(booted.persistent).toBe(true);
    expect(booted.profiles).toHaveLength(1);
    expect(booted.profileId).toBeNull();
  });

  it('reads profiles once, so a later failing read cannot break boot', async () => {
    const memory = new MemoryStore();
    await memory.createProfile('A', 'cbse-11-accountancy');
    let calls = 0;
    const flaky = {
      listProfiles: async () => {
        calls++;
        if (calls > 1) throw new Error('second read fails');
        return memory.listProfiles();
      },
    } as unknown as ProgressStore;
    const booted = await bootStore({ make: () => flaky, readSavedId: () => null });
    expect(calls).toBe(1);
    expect(booted.persistent).toBe(true);
    expect(booted.profiles).toHaveLength(1);
  });

  it('falls back to memory with no profiles when the persistent store cannot be opened', async () => {
    const booted = await bootStore({
      make: () => {
        throw new Error('IndexedDB blocked');
      },
      readSavedId: () => 'x',
    });
    expect(booted.store).toBeInstanceOf(MemoryStore);
    expect(booted.persistent).toBe(false);
    expect(booted.profiles).toEqual([]);
    expect(booted.profileId).toBeNull();
  });

  it('never rejects: any unexpected failure after opening falls back to memory', async () => {
    const odd = { listProfiles: async () => null } as unknown as ProgressStore;
    const booted = await bootStore({ make: () => odd, readSavedId: () => 'x' });
    expect(booted.store).toBeInstanceOf(MemoryStore);
    expect(booted.persistent).toBe(false);
    expect(booted.profiles).toEqual([]);
    expect(booted.profileId).toBeNull();
  });
});
