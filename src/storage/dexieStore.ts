import Dexie, { type Table } from 'dexie';
import { newId } from '@/lib/ids';
import { parseBackup } from './backup';
import {
  BACKUP_FORMAT,
  applyProfilePatch,
  compareByAt,
  compareByStart,
  compareProfiles,
  type AttemptEvent,
  type CardReviewEvent,
  type LevelResult,
  type MockPaperRecord,
  type Profile,
  type ProfileBackup,
  type ProfilePatch,
  type ProgressStore,
  type SessionResult,
  type WrittenResult,
} from './types';

// Events are immutable facts: a second append with an existing id is ignored, not an error.
function ignoreDuplicate(err: unknown): void {
  if (!(err instanceof Dexie.ConstraintError)) throw err;
}

class Db extends Dexie {
  profiles!: Table<Profile, string>;
  attempts!: Table<AttemptEvent, string>;
  levelResults!: Table<LevelResult, string>;
  cardReviews!: Table<CardReviewEvent, string>;
  sessionResults!: Table<SessionResult, string>;
  mockPapers!: Table<MockPaperRecord, string>;
  writtenResults!: Table<WrittenResult, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      profiles: 'id',
      attempts: 'id, profileId',
      levelResults: 'id, profileId',
    });
    // Version 2 only adds tables, so existing rows need no upgrade function.
    this.version(2).stores({
      cardReviews: 'id, profileId',
      sessionResults: 'id, profileId',
    });
    // Version 3 adds the mock papers, again a table of its own.
    this.version(3).stores({
      mockPapers: 'id, profileId',
    });
    // Version 4 added three tables that the app no longer uses; version 6 drops them.
    this.version(4).stores({
      syncLinks: 'profileId',
      syncMarks: '[kind+id], profileId',
      changeTimes: '[kind+id], profileId',
    });
    // Version 5 adds the learner's written answers (content/written), a table of its own.
    this.version(5).stores({
      writtenResults: 'id, profileId',
    });
    // Version 6 drops the three tables of version 4, with whatever they held. Nothing else changes.
    this.version(6).stores({
      syncLinks: null,
      syncMarks: null,
      changeTimes: null,
    });
    // A new field of a row that is not indexed (the `answer` an attempt keeps) needs no new version: a table stores
    // its rows whole, and only `id` and `profileId` are indexed.
  }
}

export class DexieStore implements ProgressStore {
  private db: Db;

  constructor(name = 'accountancy-master') {
    this.db = new Db(name);
  }

  async listProfiles() {
    return (await this.db.profiles.toArray()).sort(compareProfiles);
  }
  async createProfile(name: string, courseId: string) {
    const p: Profile = { id: newId(), name, courseId, createdAt: Date.now() };
    await this.db.profiles.put(p);
    return p;
  }
  async updateProfile(id: string, patch: ProfilePatch) {
    const { profiles } = this.db;
    return this.db.transaction('rw', profiles, async () => {
      const existing = await profiles.get(id);
      if (!existing) throw new Error('Profile not found');
      const next = applyProfilePatch(existing, patch);
      await profiles.put(next);
      return next;
    });
  }
  async deleteProfile(id: string) {
    const { profiles, attempts, levelResults, cardReviews, sessionResults, mockPapers, writtenResults } = this.db;
    await this.db.transaction('rw', [profiles, attempts, levelResults, cardReviews, sessionResults, mockPapers, writtenResults], async () => {
      await profiles.delete(id);
      for (const table of [attempts, levelResults, cardReviews, sessionResults, mockPapers, writtenResults] as Table<{ profileId: string }, string>[]) {
        await table.where('profileId').equals(id).delete();
      }
    });
  }
  async appendAttempt(e: AttemptEvent) {
    await this.db.attempts.add(e).catch(ignoreDuplicate);
  }
  async listAttempts(profileId: string) {
    return (await this.db.attempts.where('profileId').equals(profileId).toArray()).sort(compareByAt);
  }
  async appendLevelResult(r: LevelResult) {
    await this.db.levelResults.add(r).catch(ignoreDuplicate);
  }
  async listLevelResults(profileId: string) {
    return (await this.db.levelResults.where('profileId').equals(profileId).toArray()).sort(compareByAt);
  }
  async appendCardReview(e: CardReviewEvent) {
    await this.db.cardReviews.add(e).catch(ignoreDuplicate);
  }
  async listCardReviews(profileId: string) {
    return (await this.db.cardReviews.where('profileId').equals(profileId).toArray()).sort(compareByAt);
  }
  async appendSessionResult(r: SessionResult) {
    await this.db.sessionResults.add(r).catch(ignoreDuplicate);
  }
  async listSessionResults(profileId: string) {
    return (await this.db.sessionResults.where('profileId').equals(profileId).toArray()).sort(compareByAt);
  }
  async appendWrittenResult(r: WrittenResult) {
    await this.db.writtenResults.add(r).catch(ignoreDuplicate);
  }
  async listWrittenResults(profileId: string) {
    return (await this.db.writtenResults.where('profileId').equals(profileId).toArray()).sort(compareByAt);
  }
  async appendTogether(work: () => Promise<unknown>) {
    const { attempts, levelResults, cardReviews, sessionResults } = this.db;
    // The appends made inside `work` join this one transaction.
    await this.db.transaction('rw', [attempts, levelResults, cardReviews, sessionResults], work);
  }
  async putMockPaper(p: MockPaperRecord) {
    await this.db.mockPapers.put(p);
  }
  async listMockPapers(profileId: string) {
    return (await this.db.mockPapers.where('profileId').equals(profileId).toArray()).sort(compareByStart);
  }
  async exportProfile(profileId: string): Promise<ProfileBackup> {
    const profile = await this.db.profiles.get(profileId);
    if (!profile) throw new Error('Profile not found');
    return {
      format: BACKUP_FORMAT,
      version: 1,
      profile,
      attempts: await this.listAttempts(profileId),
      levelResults: await this.listLevelResults(profileId),
      cardReviews: await this.listCardReviews(profileId),
      sessionResults: await this.listSessionResults(profileId),
      mockPapers: await this.listMockPapers(profileId),
      writtenResults: await this.listWrittenResults(profileId),
    };
  }
  async importProfile(raw: unknown) {
    const b = parseBackup(raw);
    const { profiles, attempts, levelResults, cardReviews, sessionResults, mockPapers, writtenResults } = this.db;
    return this.db.transaction('rw', [profiles, attempts, levelResults, cardReviews, sessionResults, mockPapers, writtenResults], async () => {
      const existing = await profiles.get(b.profile.id);
      if (!existing) await profiles.add(b.profile);
      // Events are immutable facts: add only ids not already stored (by any profile).
      await attempts.bulkAdd(await this.newRows(attempts, b.attempts));
      await levelResults.bulkAdd(await this.newRows(levelResults, b.levelResults));
      await cardReviews.bulkAdd(await this.newRows(cardReviews, b.cardReviews));
      await sessionResults.bulkAdd(await this.newRows(sessionResults, b.sessionResults));
      await writtenResults.bulkAdd(await this.newRows(writtenResults, b.writtenResults));
      // A paper already on this device is kept as it is here (it may have gone further than the backup).
      await mockPapers.bulkAdd(await this.newRows(mockPapers, b.mockPapers));
      return existing ?? b.profile;
    });
  }

  private async newRows<T extends { id: string }>(table: Table<T, string>, rows: T[]): Promise<T[]> {
    const present = await table.bulkGet(rows.map((r) => r.id));
    const seen = new Set<string>();
    return rows.filter((r, i) => {
      if (present[i] || seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  }
}
