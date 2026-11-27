import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { parseBackup } from './backup';
import { DexieStore } from './dexieStore';
import { MemoryStore } from './memoryStore';
import type { ProgressStore } from './types';

// Part B of Class 12 is kept with the learner, like the exam dates and the challenge timer: changed in Settings, carried
// by a backup, and read as Analysis of Financial Statements (none set) for every learner stored before it.

const C11 = 'cbse-11-accountancy';
const C12 = 'cbse-12-accountancy';

let n = 0;
const stores: [string, () => ProgressStore][] = [
  ['MemoryStore', () => new MemoryStore()],
  ['DexieStore', () => new DexieStore(`part-b-db-${n++}`)],
];

describe.each(stores)('%s keeps the choice of Part B with the learner', (_name, make) => {
  it('has none for a new learner, keeps a choice, changes it back, and refuses one it does not know', async () => {
    const store = make();
    const p = await store.createProfile('Meera', C12);
    expect(p).not.toHaveProperty('class12PartB');
    const cas = await store.updateProfile(p.id, { class12PartB: 'computerised' });
    expect(cas.class12PartB).toBe('computerised');
    expect((await store.listProfiles())[0]).toEqual(cas);
    // Another setting changed afterwards leaves the choice as it is; so does a change of course.
    expect((await store.updateProfile(p.id, { dailyGoalXp: 20 })).class12PartB).toBe('computerised');
    expect((await store.updateProfile(p.id, { courseId: C11 })).class12PartB).toBe('computerised');
    expect((await store.updateProfile(p.id, { class12PartB: 'analysis' })).class12PartB).toBe('analysis');
    await expect(store.updateProfile(p.id, { class12PartB: 'accounts' as never })).rejects.toThrow('Invalid Part B');
    expect((await store.listProfiles())[0].class12PartB).toBe('analysis');
  });

  it('a backup carries the choice, and one made before there was any restores a learner who has none', async () => {
    const source = make();
    const p = await source.createProfile('Meera', C12);
    await source.updateProfile(p.id, { class12PartB: 'computerised' });
    const backup = JSON.parse(JSON.stringify(await source.exportProfile(p.id)));
    expect(backup.profile.class12PartB).toBe('computerised');
    expect((await make().importProfile(backup)).class12PartB).toBe('computerised');
    delete backup.profile.class12PartB;
    expect(await make().importProfile(backup)).not.toHaveProperty('class12PartB');
  });
});

describe('parseBackup and Part B', () => {
  it('rejects a choice it does not know', () => {
    const raw = { format: 'accountancy-master-backup', version: 1, profile: { id: 'p', name: 'V', courseId: C12, createdAt: 1, class12PartB: 'both' }, attempts: [], levelResults: [] };
    expect(() => parseBackup(raw)).toThrow('Invalid backup file');
  });
});
