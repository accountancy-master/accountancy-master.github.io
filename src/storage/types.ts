import { COURSE_IDS } from '@/content/catalogue.generated';
import { isPartB, type PartB } from '@/content/courseOptions';
import type { Difficulty } from '@/content/types';
import type { LongResponse } from '@/exercises/logic';

/**
 * `case` is one whole case study played from the Case studies screen (a topic's own Case study level is a `level`);
 * `mock` is one sitting of a mock paper; `marathon` is one run of questions that goes on until the learner stops it.
 */
export const SESSION_KINDS = ['level', 'smart', 'fresh', 'mistakes', 'cards', 'daily_challenge', 'daily_mission', 'case', 'mock', 'marathon'] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export interface Profile {
  id: string;
  name: string;
  /**
   * The course the learner is on now. They may change it (Settings); what they did in another course stays in the
   * event log, under that course, and is there again when they change back.
   */
  courseId: string;
  createdAt: number;
  dailyGoalXp?: number;
  /**
   * False once the learner has switched the challenge timer off: timed levels are then played without the clock.
   * A learner who never chose (and every learner stored before this was a setting) has none, which is on.
   */
  challengeTimer?: boolean;
  /**
   * The day of the learner's exam in each course, by course id, written YYYY-MM-DD: what the countdown on Home and
   * in the top bar counts to. A course without one (and every learner stored before this was a setting) has none set.
   */
  examDates?: Record<string, string>;
  /**
   * Part B of Class 12 as the learner's school teaches it: 'computerised' for Computerised Accounting in place of
   * Analysis of Financial Statements. A learner who never chose (and every learner stored before this was a setting)
   * has none, which is Analysis of Financial Statements (content/courseOptions.ts). Changing it removes nothing: the
   * work done in the topics of either choice stays, and is there again when the learner changes back.
   */
  class12PartB?: PartB;
}

/** True for a real day written YYYY-MM-DD (the form of a date field's value): '2027-02-15', not '2027-02-30'. */
export function isExamDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** The exam dates as they can be kept: only an object of course ids to real days. Anything else is none at all. */
export function examDatesFrom(raw: unknown): Record<string, string> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [courseId, day] of Object.entries(raw)) if (courseId !== '' && isExamDate(day)) out[courseId] = day;
  return out;
}

/** True for exam dates that are exactly what can be kept (see `examDatesFrom`): nothing in them is left out. */
export const validExamDates = (raw: unknown): raw is Record<string, string> => {
  const kept = examDatesFrom(raw);
  return kept !== undefined && Object.keys(kept).length === Object.keys(raw as object).length;
};

/** The day of the learner's exam in a course, or null when they have not set one. */
export const examDateOf = (profile: Pick<Profile, 'examDates'>, courseId: string): string | null => {
  const day = profile.examDates && Object.hasOwn(profile.examDates, courseId) ? profile.examDates[courseId] : undefined;
  return isExamDate(day) ? day : null;
};

/** True unless the learner has switched the challenge timer off (see `Profile.challengeTimer`). */
export const challengeTimerOn = (profile: Pick<Profile, 'challengeTimer'>): boolean => profile.challengeTimer !== false;

/**
 * What a learner may change about themselves: the name, the daily goal, the course they are on, the challenge timer,
 * the exam dates (all of them at once: a course left out has no date) and Part B of Class 12.
 */
export interface ProfilePatch {
  name?: string;
  dailyGoalXp?: number;
  courseId?: string;
  challengeTimer?: boolean;
  examDates?: Record<string, string>;
  class12PartB?: PartB;
}

export interface AttemptEvent {
  id: string;
  profileId: string;
  courseId: string;
  topicId: string;
  conceptId: string;
  questionId: string;
  difficulty: Difficulty;
  correct: boolean;
  hintsUsed: number;
  mistakeCode?: string;
  /**
   * What the student answered, kept only for a set of entries, an account or a statement that was not right (see
   * `answerToKeep`): the Mistakes screen shows it marked. Attempts made before answers were kept have none.
   */
  answer?: LongResponse;
  timeMs: number;
  at: number;
  sessionId: string;
  levelId?: string;
  sessionKind?: SessionKind;
}

export interface LevelResult {
  id: string;
  profileId: string;
  topicId: string;
  levelId: string;
  score: number;
  passed: boolean;
  at: number;
}

export interface CardReviewEvent {
  id: string;
  profileId: string;
  courseId: string;
  topicId: string;
  cardId: string;
  conceptId: string;
  known: boolean;
  at: number;
  sessionId: string;
}

export interface SessionResult {
  id: string;
  profileId: string;
  courseId: string;
  kind: Exclude<SessionKind, 'level'>;
  sessionId: string;
  /** Local YYYY-MM-DD on which the session finished. */
  day: string;
  /**
   * Scored questions answered correctly, out of those asked. For a mock paper: the marks earned (whole marks, a half
   * mark dropped) out of the marks of the paper; the exact marks are in the paper's own record.
   */
  correct: number;
  total: number;
  at: number;
  /** For a marathon run: the topic it was on, or 'all' for every topic the learner had played. */
  scope?: string;
  /** For a marathon run: its longest row of correct answers. */
  bestStreak?: number;
  /** For a marathon run: how long it lasted. */
  timeMs?: number;
}

/**
 * One sitting of a mock paper: in progress until `submittedAt` is set, then a marked paper in the history. The one
 * record that is rewritten: the answers are saved as the learner goes, so a paper survives a reload. The paper
 * itself is not stored; it is rebuilt from `paper` (see learning/mockPaper.ts), and the marked script from that and
 * the answers kept here.
 */
export interface MockPaperRecord {
  id: string;
  profileId: string;
  courseId: string;
  /** Which paper: its kind, topic and number, as `paperKey` writes them ("full.3", "topic.ledger.2"). */
  paper: string;
  /** The session its attempts and its session result are recorded under. */
  sessionId: string;
  startedAt: number;
  /** The time allowed, fixed when the paper was started. The clock is `startedAt + allowedMs`, whatever happens to the app. */
  allowedMs: number;
  /** The answers by question id, each as its answer input holds it (see play/drafts.ts). Storage keeps them as they are. */
  answers: Record<string, unknown>;
  /** The ids of the questions marked for review. */
  flagged: string[];
  /** Milliseconds spent on each question, by question id. */
  timeMs: Record<string, number>;
  /** The question the learner was on, counted from 0 over everything they answer. */
  current: number;
  /** When the paper was handed in (by the learner, or by the clock). Absent while it is in progress. */
  submittedAt?: number;
  /** Set with `submittedAt`: the marks earned (halves allowed) and the marks of the paper. */
  marks?: number;
  maxMarks?: number;
  /** True once the attempts and the session result of the sitting are in the event log. */
  recorded?: boolean;
}

/**
 * One board-style written answer, marked by the learner against the model answer (content/written): the points they
 * ticked as written, and the marks those earn. Not an attempt: it counts towards no mastery, level or XP. The latest
 * result of a question below full marks puts it on the list to rewrite (Mistakes).
 */
export interface WrittenResult {
  id: string;
  profileId: string;
  courseId: string;
  topicId: string;
  questionId: string;
  /** The marks earned, halves allowed, out of `maxMarks` (the marks of the question when it was written). */
  marks: number;
  maxMarks: number;
  /** The points ticked as written, by their place in the question's points. */
  ticked: number[];
  /** True when the answer was written on paper, not typed. */
  onPaper: boolean;
  /** What was typed, when it was (at most WRITTEN_ANSWER_MAX characters). */
  answer?: string;
  timeMs: number;
  at: number;
}

/** The longest typed answer kept with a written result. */
export const WRITTEN_ANSWER_MAX = 4000;

export const BACKUP_FORMAT = 'accountancy-master-backup';

export interface ProfileBackup {
  format: typeof BACKUP_FORMAT;
  version: 1;
  profile: Profile;
  attempts: AttemptEvent[];
  levelResults: LevelResult[];
  cardReviews: CardReviewEvent[];
  sessionResults: SessionResult[];
  mockPapers: MockPaperRecord[];
  /** Backups made before written answers have none. */
  writtenResults: WrittenResult[];
}

export interface ProgressStore {
  listProfiles(): Promise<Profile[]>;
  createProfile(name: string, courseId: string): Promise<Profile>;
  /**
   * Renames a learner, sets the daily goal, changes the course they are on, switches the challenge timer and/or sets
   * the exam dates. Throws 'Enter a name', 'Invalid daily goal', 'Unknown course', 'Invalid challenge timer',
   * 'Invalid exam date' or 'Profile not found'.
   * Changing the course removes nothing.
   */
  updateProfile(id: string, patch: ProfilePatch): Promise<Profile>;
  /** Removes the profile and all its events. An unknown id does nothing. */
  deleteProfile(id: string): Promise<void>;
  appendAttempt(e: AttemptEvent): Promise<void>;
  listAttempts(profileId: string): Promise<AttemptEvent[]>;
  appendLevelResult(r: LevelResult): Promise<void>;
  listLevelResults(profileId: string): Promise<LevelResult[]>;
  appendCardReview(e: CardReviewEvent): Promise<void>;
  listCardReviews(profileId: string): Promise<CardReviewEvent[]>;
  appendSessionResult(r: SessionResult): Promise<void>;
  listSessionResults(profileId: string): Promise<SessionResult[]>;
  /**
   * Stores the events that `work` appends (attempts, card reviews, level results, session results) as one write: all
   * of them, or when one fails none. `work` starts its appends at once and waits for nothing but them, so nothing
   * of it is still to be started when the first append is on its way.
   */
  appendTogether(work: () => Promise<unknown>): Promise<void>;
  appendWrittenResult(r: WrittenResult): Promise<void>;
  listWrittenResults(profileId: string): Promise<WrittenResult[]>;
  /** Stores a mock paper as it stands now, replacing what was stored under its id. */
  putMockPaper(p: MockPaperRecord): Promise<void>;
  /** The learner's mock papers, in progress and submitted, oldest first. */
  listMockPapers(profileId: string): Promise<MockPaperRecord[]>;
  exportProfile(profileId: string): Promise<ProfileBackup>;
  importProfile(raw: unknown): Promise<Profile>;
}

export const compareByAt = (a: { at: number; id: string }, b: { at: number; id: string }) =>
  a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export const compareByStart = (a: { startedAt: number; id: string }, b: { startedAt: number; id: string }) =>
  a.startedAt - b.startedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export const compareProfiles = (a: Profile, b: Profile) =>
  a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Applies a profile patch, throwing the user-facing messages the settings screen shows. */
export function applyProfilePatch(profile: Profile, patch: ProfilePatch): Profile {
  const next: Profile = { ...profile };
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name === '') throw new Error('Enter a name');
    next.name = name;
  }
  if (patch.dailyGoalXp !== undefined) {
    if (!Number.isInteger(patch.dailyGoalXp) || patch.dailyGoalXp <= 0) throw new Error('Invalid daily goal');
    next.dailyGoalXp = patch.dailyGoalXp;
  }
  if (patch.courseId !== undefined) {
    // Only a course this version of the app has: a learner is never left on one it cannot show.
    if (!COURSE_IDS.includes(patch.courseId)) throw new Error('Unknown course');
    next.courseId = patch.courseId;
  }
  if (patch.challengeTimer !== undefined) {
    if (typeof patch.challengeTimer !== 'boolean') throw new Error('Invalid challenge timer');
    next.challengeTimer = patch.challengeTimer;
  }
  if (patch.examDates !== undefined) {
    if (!validExamDates(patch.examDates)) throw new Error('Invalid exam date');
    next.examDates = { ...patch.examDates };
  }
  if (patch.class12PartB !== undefined) {
    if (!isPartB(patch.class12PartB)) throw new Error('Invalid Part B');
    next.class12PartB = patch.class12PartB;
  }
  return next;
}

/**
 * True for the course of an event of this learner that can be kept: the course the learner is on (whatever it is),
 * or any course this version of the app has. A learner who has been on two courses has events of both.
 */
export const isCourseOf = (profile: Pick<Profile, 'courseId'>, courseId: unknown): courseId is string =>
  typeof courseId === 'string' && courseId !== '' && (courseId === profile.courseId || COURSE_IDS.includes(courseId));
