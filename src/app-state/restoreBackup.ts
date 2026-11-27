import { COURSE_IDS } from '@/content/catalogue.generated';
import type { Profile, ProgressStore } from '@/storage/types';

export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

export const BACKUP_TOO_LARGE = 'That file is too large to be a backup.';
export const BACKUP_UNKNOWN_COURSE = "This backup is for a course this version of the app doesn't have.";
export const BACKUP_INVALID = 'That file is not a valid backup.';

export const backupRestored = (name: string) =>
  `Backup restored for ${name}. Existing progress was kept and new progress was added.`;

export type RestoreOutcome = { ok: true; profile: Profile; text: string } | { ok: false; text: string };

const courseIdOf = (row: unknown): string | null => {
  if (typeof row !== 'object' || row === null) return null;
  const courseId = (row as { courseId?: unknown }).courseId;
  return typeof courseId === 'string' ? courseId : null;
};

/**
 * The course ids the file names: the learner's, and that of every event and paper (a learner who has been on two
 * courses has events of both). The rest of the shape is checked by the store.
 */
function namedCourseIds(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const file = raw as Record<string, unknown>;
  const lists = ['attempts', 'cardReviews', 'sessionResults', 'mockPapers'].flatMap((name) => (Array.isArray(file[name]) ? (file[name] as unknown[]) : []));
  return [file.profile, ...lists].flatMap((row) => courseIdOf(row) ?? []);
}

/**
 * Reads a chosen backup file and restores it into the store. Never throws: the outcome carries the text to show.
 * The caller refreshes its profile list and selects `profile` afterwards.
 */
export async function restoreBackupFile(file: File, store: ProgressStore): Promise<RestoreOutcome> {
  if (file.size > MAX_BACKUP_BYTES) return { ok: false, text: BACKUP_TOO_LARGE };
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    return { ok: false, text: BACKUP_INVALID };
  }
  if (namedCourseIds(raw).some((courseId) => !COURSE_IDS.includes(courseId))) return { ok: false, text: BACKUP_UNKNOWN_COURSE };
  try {
    const profile = await store.importProfile(raw);
    return { ok: true, profile, text: backupRestored(profile.name) };
  } catch {
    return { ok: false, text: BACKUP_INVALID };
  }
}
