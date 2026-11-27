import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { parseBackup } from './backup';
import { DexieStore } from './dexieStore';
import { MemoryStore } from './memoryStore';
import { examDateOf, isExamDate, type ProgressStore } from './types';

const C11 = 'cbse-11-accountancy';
const C12 = 'cbse-12-accountancy';

let n = 0;
const stores: [string, () => ProgressStore][] = [
  ['MemoryStore', () => new MemoryStore()],
  ['DexieStore', () => new DexieStore(`exam-dates-db-${n++}`)],
];

describe('isExamDate', () => {
  it('takes a real day written YYYY-MM-DD and nothing else', () => {
    expect(isExamDate('2027-02-15')).toBe(true);
    expect(isExamDate('2028-02-29')).toBe(true);
    for (const bad of ['2027-02-30', '2027-2-15', '15-02-2027', '2027-13-01', '', '2027-02-15T00:00', 20270215, null, undefined]) {
      expect(isExamDate(bad), String(bad)).toBe(false);
    }
  });
});

describe.each(stores)('%s keeps an exam date for each course with the learner', (_name, make) => {
  it('has none for a new learner, keeps one per course, and removes one that is cleared', async () => {
    const store = make();
    const p = await store.createProfile('Varun', C11);
    expect(p).not.toHaveProperty('examDates');
    expect(examDateOf(p, C12)).toBeNull();

    const set = await store.updateProfile(p.id, { examDates: { [C12]: '2027-02-15' } });
    expect(examDateOf(set, C12)).toBe('2027-02-15');
    expect(examDateOf(set, C11)).toBeNull();
    const both = await store.updateProfile(p.id, { examDates: { [C12]: '2027-02-15', [C11]: '2027-03-01' } });
    expect((await store.listProfiles())[0]).toEqual(both);
    // Another setting changed afterwards leaves the dates as they are.
    expect((await store.updateProfile(p.id, { dailyGoalXp: 20 })).examDates).toEqual({ [C12]: '2027-02-15', [C11]: '2027-03-01' });

    const cleared = await store.updateProfile(p.id, { examDates: { [C11]: '2027-03-01' } });
    expect(examDateOf(cleared, C12)).toBeNull();
    await expect(store.updateProfile(p.id, { examDates: { [C12]: '15/02/2027' } })).rejects.toThrow('Invalid exam date');
    await expect(store.updateProfile(p.id, { examDates: 'soon' as unknown as Record<string, string> })).rejects.toThrow('Invalid exam date');
    expect((await store.listProfiles())[0]).toEqual(cleared);
  });

  it('a backup carries the dates, and a backup made before there were any restores a learner who has none', async () => {
    const source = make();
    const p = await source.createProfile('Varun', C12);
    await source.updateProfile(p.id, { examDates: { [C12]: '2027-02-15' } });
    const backup = JSON.parse(JSON.stringify(await source.exportProfile(p.id)));
    expect(backup.profile.examDates).toEqual({ [C12]: '2027-02-15' });
    expect(examDateOf(await make().importProfile(backup), C12)).toBe('2027-02-15');

    delete backup.profile.examDates;
    const restored = await make().importProfile(backup);
    expect(restored).not.toHaveProperty('examDates');
    expect(examDateOf(restored, C12)).toBeNull();
  });
});

describe('parseBackup and exam dates', () => {
  const base = () => ({ format: 'accountancy-master-backup', version: 1, profile: { id: 'p', name: 'V', courseId: C11, createdAt: 1 }, attempts: [], levelResults: [] }) as Record<string, unknown> & { profile: Record<string, unknown> };
  it.each([
    ['a string', '2027-02-15'],
    ['a date that is not one', { [C12]: '2027-02-31' }],
    ['a number', { [C12]: 20270215 }],
  ])('rejects %s', (_label, examDates) => {
    const raw = base();
    raw.profile.examDates = examDates;
    expect(() => parseBackup(raw)).toThrow('Invalid backup file');
  });
});

describe('an exam date of a learner stored before there were any', () => {
  it('is unset, and the learner is read as they were stored', async () => {
    const name = `old-exam-db-${n++}`;
    await new DexieStore(name).listProfiles();
    const raw = new Dexie(name);
    await raw.open();
    await raw.table('profiles').put({ id: 'p1', name: 'Old', courseId: C11, createdAt: 10 });
    raw.close();
    const [old] = await new DexieStore(name).listProfiles();
    expect(old).toEqual({ id: 'p1', name: 'Old', courseId: C11, createdAt: 10 });
    expect(examDateOf(old, C11)).toBeNull();
  });
});
