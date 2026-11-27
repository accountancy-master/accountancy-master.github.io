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

export class MemoryStore implements ProgressStore {
  private profiles = new Map<string, Profile>();
  private attempts = new Map<string, AttemptEvent>();
  private levelResults = new Map<string, LevelResult>();
  private cardReviews = new Map<string, CardReviewEvent>();
  private sessionResults = new Map<string, SessionResult>();
  private mockPapers = new Map<string, MockPaperRecord>();
  private writtenResults = new Map<string, WrittenResult>();

  async listProfiles() {
    return structuredClone([...this.profiles.values()].sort(compareProfiles));
  }
  async createProfile(name: string, courseId: string) {
    const p: Profile = { id: newId(), name, courseId, createdAt: Date.now() };
    this.profiles.set(p.id, structuredClone(p));
    return p;
  }
  async updateProfile(id: string, patch: ProfilePatch) {
    const existing = this.profiles.get(id);
    if (!existing) throw new Error('Profile not found');
    const updated = applyProfilePatch(existing, patch);
    this.profiles.set(id, structuredClone(updated));
    return updated;
  }
  async deleteProfile(id: string) {
    this.profiles.delete(id);
    for (const events of [this.attempts, this.levelResults, this.cardReviews, this.sessionResults, this.mockPapers, this.writtenResults]) {
      for (const [key, e] of events) if (e.profileId === id) events.delete(key);
    }
  }
  async appendAttempt(e: AttemptEvent) {
    if (!this.attempts.has(e.id)) this.attempts.set(e.id, structuredClone(e));
  }
  async listAttempts(profileId: string) {
    return structuredClone([...this.attempts.values()].filter((a) => a.profileId === profileId).sort(compareByAt));
  }
  async appendLevelResult(r: LevelResult) {
    if (!this.levelResults.has(r.id)) this.levelResults.set(r.id, structuredClone(r));
  }
  async listLevelResults(profileId: string) {
    return structuredClone([...this.levelResults.values()].filter((r) => r.profileId === profileId).sort(compareByAt));
  }
  async appendCardReview(e: CardReviewEvent) {
    if (!this.cardReviews.has(e.id)) this.cardReviews.set(e.id, structuredClone(e));
  }
  async listCardReviews(profileId: string) {
    return structuredClone([...this.cardReviews.values()].filter((r) => r.profileId === profileId).sort(compareByAt));
  }
  async appendSessionResult(r: SessionResult) {
    if (!this.sessionResults.has(r.id)) this.sessionResults.set(r.id, structuredClone(r));
  }
  async listSessionResults(profileId: string) {
    return structuredClone([...this.sessionResults.values()].filter((r) => r.profileId === profileId).sort(compareByAt));
  }
  async appendWrittenResult(r: WrittenResult) {
    if (!this.writtenResults.has(r.id)) this.writtenResults.set(r.id, structuredClone(r));
  }
  async listWrittenResults(profileId: string) {
    return structuredClone([...this.writtenResults.values()].filter((r) => r.profileId === profileId).sort(compareByAt));
  }
  async appendTogether(work: () => Promise<unknown>) {
    const before = [this.attempts, this.levelResults, this.cardReviews, this.sessionResults].map((events) => new Set(events.keys()));
    try {
      await work();
    } catch (err) {
      // None of it: whatever was appended before the failure is taken out again.
      [this.attempts, this.levelResults, this.cardReviews, this.sessionResults].forEach((events: Map<string, unknown>, i) => {
        for (const key of [...events.keys()]) if (!before[i].has(key)) events.delete(key);
      });
      throw err;
    }
  }
  async putMockPaper(p: MockPaperRecord) {
    this.mockPapers.set(p.id, structuredClone(p));
  }
  async listMockPapers(profileId: string) {
    return structuredClone([...this.mockPapers.values()].filter((p) => p.profileId === profileId).sort(compareByStart));
  }
  async exportProfile(profileId: string): Promise<ProfileBackup> {
    const profile = this.profiles.get(profileId);
    if (!profile) throw new Error('Profile not found');
    return {
      format: BACKUP_FORMAT,
      version: 1,
      profile: structuredClone(profile),
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
    if (!this.profiles.has(b.profile.id)) this.profiles.set(b.profile.id, structuredClone(b.profile));
    for (const a of b.attempts) if (!this.attempts.has(a.id)) this.attempts.set(a.id, structuredClone(a));
    for (const r of b.levelResults) if (!this.levelResults.has(r.id)) this.levelResults.set(r.id, structuredClone(r));
    for (const r of b.cardReviews) if (!this.cardReviews.has(r.id)) this.cardReviews.set(r.id, structuredClone(r));
    for (const r of b.sessionResults) if (!this.sessionResults.has(r.id)) this.sessionResults.set(r.id, structuredClone(r));
    for (const p of b.mockPapers) if (!this.mockPapers.has(p.id)) this.mockPapers.set(p.id, structuredClone(p));
    for (const r of b.writtenResults) if (!this.writtenResults.has(r.id)) this.writtenResults.set(r.id, structuredClone(r));
    return structuredClone(this.profiles.get(b.profile.id) as Profile);
  }
}
