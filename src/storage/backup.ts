import { isPartB } from '@/content/courseOptions';
import type { Difficulty } from '@/content/types';
import type { EnteredRow } from '@/engine/formats';
import type { JournalLine } from '@/engine/journal';
import type { LongResponse } from '@/exercises/logic';
import {
  BACKUP_FORMAT,
  SESSION_KINDS,
  isCourseOf,
  validExamDates,
  type AttemptEvent,
  type CardReviewEvent,
  type LevelResult,
  type MockPaperRecord,
  type Profile,
  type ProfileBackup,
  type SessionKind,
  type SessionResult,
  type WrittenResult,
  WRITTEN_ANSWER_MAX,
} from './types';

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'complex'];
const RESULT_KINDS: readonly string[] = SESSION_KINDS.filter((k) => k !== 'level');
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isCount = (v: unknown): v is number => isNum(v) && Number.isInteger(v) && v >= 0;

function fail(): never {
  throw new Error('Invalid backup file');
}

/** The rows of one list of a format as an attempt keeps them: the particulars and an amount in paise for every column. */
function parseRows(raw: unknown): EnteredRow[] {
  if (!Array.isArray(raw)) return fail();
  return raw.map((r: unknown): EnteredRow => {
    if (!isObject(r) || typeof r.label !== 'string' || !Array.isArray(r.amounts) || !r.amounts.every(isNum)) return fail();
    return { label: r.label, amounts: [...(r.amounts as number[])] };
  });
}

/** The lists of the two sides of an account. */
const parseSides = (raw: unknown): [EnteredRow[], EnteredRow[]] =>
  Array.isArray(raw) && raw.length === 2 ? [parseRows(raw[0]), parseRows(raw[1])] : fail();

/** The answer kept with an attempt (a set of entries, an account or a statement), built again from its known fields. */
function parseAnswer(raw: unknown): LongResponse {
  if (!isObject(raw)) return fail();
  if (raw.type === 'journal_set') {
    if (!Array.isArray(raw.entries)) return fail();
    const entries = raw.entries.map((lines: unknown) => {
      if (!Array.isArray(lines)) return fail();
      return lines.map((l: unknown): JournalLine => {
        if (!isObject(l) || typeof l.accountId !== 'string' || (l.side !== 'Dr' && l.side !== 'Cr') || !isNum(l.amount)) return fail();
        return { accountId: l.accountId, side: l.side, amount: l.amount };
      });
    });
    return { type: 'journal_set', entries };
  }
  if (raw.type === 'account') {
    if (raw.later !== undefined && !Array.isArray(raw.later)) return fail();
    const later = (raw.later as unknown[] | undefined)?.map(parseSides);
    return { type: 'account', sides: parseSides(raw.sides), below: parseSides(raw.below), ...(later ? { later } : {}) };
  }
  if (raw.type === 'statement') {
    if ((raw.final !== null && !isNum(raw.final)) || (raw.finalLabel !== undefined && typeof raw.finalLabel !== 'string')) return fail();
    // A statement in parts keeps the rows of its later lists and what was typed for its sub-totals (null for one left empty).
    if (raw.more !== undefined && !Array.isArray(raw.more)) return fail();
    if (raw.subtotals !== undefined && (!Array.isArray(raw.subtotals) || !raw.subtotals.every((s: unknown) => s === null || (Array.isArray(s) && s.every(isNum))))) return fail();
    const more = (raw.more as unknown[] | undefined)?.map(parseRows);
    const subtotals = (raw.subtotals as (number[] | null)[] | undefined)?.map((s) => (s === null ? null : [...s]));
    return {
      type: 'statement',
      rows: parseRows(raw.rows),
      final: raw.final,
      ...(raw.finalLabel !== undefined ? { finalLabel: raw.finalLabel } : {}),
      ...(more ? { more } : {}),
      ...(subtotals ? { subtotals } : {}),
    };
  }
  return fail();
}

/**
 * Validates a backup and returns freshly built objects containing only known fields. An event belongs to the course
 * it was made in, which is the learner's own or another course of the app (a learner may change course, and keeps
 * what they did in each); an event of a course this version does not have is not one it can keep.
 */
export function parseBackup(raw: unknown): ProfileBackup {
  if (!isObject(raw) || raw.format !== BACKUP_FORMAT || raw.version !== 1) return fail();
  const { profile: p, attempts, levelResults } = raw;
  // Backups made before daily practice have neither list: treat them as empty.
  const cardReviews = raw.cardReviews ?? [];
  const sessionResults = raw.sessionResults ?? [];
  // And those made before mock papers have no papers.
  const mockPapers = raw.mockPapers ?? [];
  // And those made before written answers have no written results.
  const writtenResults = raw.writtenResults ?? [];
  if (!isObject(p) || !isStr(p.id) || !isStr(p.name) || !isStr(p.courseId) || !isNum(p.createdAt)) return fail();
  if (p.dailyGoalXp !== undefined && (!isNum(p.dailyGoalXp) || !Number.isInteger(p.dailyGoalXp) || p.dailyGoalXp <= 0)) return fail();
  // Backups made before the challenge timer was a setting have none: the learner has it on.
  if (p.challengeTimer !== undefined && typeof p.challengeTimer !== 'boolean') return fail();
  // And those made before exam dates were a setting have none: the learner has no date set.
  if (p.examDates !== undefined && !validExamDates(p.examDates)) return fail();
  // And those made before Part B of Class 12 was a choice have none: the learner has Analysis of Financial Statements.
  if (p.class12PartB !== undefined && !isPartB(p.class12PartB)) return fail();
  if (!Array.isArray(attempts) || !Array.isArray(levelResults) || !Array.isArray(cardReviews) || !Array.isArray(sessionResults)) return fail();
  if (!Array.isArray(mockPapers) || !Array.isArray(writtenResults)) return fail();
  const profile: Profile = { id: p.id, name: p.name, courseId: p.courseId, createdAt: p.createdAt };
  if (p.dailyGoalXp !== undefined) profile.dailyGoalXp = p.dailyGoalXp;
  if (p.challengeTimer !== undefined) profile.challengeTimer = p.challengeTimer;
  if (p.examDates !== undefined) profile.examDates = { ...p.examDates };
  if (p.class12PartB !== undefined) profile.class12PartB = p.class12PartB;

  const parsedAttempts = attempts.map((r: unknown): AttemptEvent => {
    if (
      !isObject(r) ||
      !isStr(r.id) || !isStr(r.topicId) || !isStr(r.conceptId) || !isStr(r.questionId) || !isStr(r.sessionId) ||
      r.profileId !== profile.id ||
      !isCourseOf(profile, r.courseId) ||
      !DIFFICULTIES.includes(r.difficulty as Difficulty) ||
      typeof r.correct !== 'boolean' ||
      !isNum(r.hintsUsed) || !Number.isInteger(r.hintsUsed) || r.hintsUsed < 0 ||
      !isNum(r.timeMs) || r.timeMs < 0 ||
      !isNum(r.at) ||
      (r.mistakeCode !== undefined && typeof r.mistakeCode !== 'string') ||
      (r.levelId !== undefined && typeof r.levelId !== 'string') ||
      (r.sessionKind !== undefined && !SESSION_KINDS.includes(r.sessionKind as SessionKind))
    ) {
      return fail();
    }
    const a: AttemptEvent = {
      id: r.id,
      profileId: profile.id,
      courseId: r.courseId as string,
      topicId: r.topicId,
      conceptId: r.conceptId,
      questionId: r.questionId,
      difficulty: r.difficulty as Difficulty,
      correct: r.correct,
      hintsUsed: r.hintsUsed,
      timeMs: r.timeMs,
      at: r.at,
      sessionId: r.sessionId,
    };
    if (r.mistakeCode !== undefined) a.mistakeCode = r.mistakeCode as string;
    // Backups made before answers were kept have none, and so has every attempt but a long question that was missed.
    if (r.answer !== undefined) a.answer = parseAnswer(r.answer);
    if (r.levelId !== undefined) a.levelId = r.levelId as string;
    if (r.sessionKind !== undefined) a.sessionKind = r.sessionKind as SessionKind;
    return a;
  });

  const parsedResults = levelResults.map((r: unknown): LevelResult => {
    if (
      !isObject(r) ||
      !isStr(r.id) || !isStr(r.topicId) || !isStr(r.levelId) ||
      r.profileId !== profile.id ||
      !isNum(r.score) || r.score < 0 || r.score > 1 ||
      typeof r.passed !== 'boolean' ||
      !isNum(r.at)
    ) {
      return fail();
    }
    return { id: r.id, profileId: profile.id, topicId: r.topicId, levelId: r.levelId, score: r.score, passed: r.passed, at: r.at };
  });

  const parsedCardReviews = cardReviews.map((r: unknown): CardReviewEvent => {
    if (
      !isObject(r) ||
      !isStr(r.id) || !isStr(r.topicId) || !isStr(r.cardId) || !isStr(r.conceptId) || !isStr(r.sessionId) ||
      r.profileId !== profile.id ||
      !isCourseOf(profile, r.courseId) ||
      typeof r.known !== 'boolean' ||
      !isNum(r.at)
    ) {
      return fail();
    }
    return {
      id: r.id,
      profileId: profile.id,
      courseId: r.courseId as string,
      topicId: r.topicId,
      cardId: r.cardId,
      conceptId: r.conceptId,
      known: r.known,
      at: r.at,
      sessionId: r.sessionId,
    };
  });

  const parsedSessionResults = sessionResults.map((r: unknown): SessionResult => {
    if (
      !isObject(r) ||
      !isStr(r.id) || !isStr(r.sessionId) ||
      r.profileId !== profile.id ||
      !isCourseOf(profile, r.courseId) ||
      typeof r.kind !== 'string' || !RESULT_KINDS.includes(r.kind) ||
      typeof r.day !== 'string' || !DAY.test(r.day) ||
      !isCount(r.correct) || !isCount(r.total) || r.correct > r.total ||
      !isNum(r.at) ||
      (r.scope !== undefined && !isStr(r.scope)) ||
      (r.bestStreak !== undefined && !isCount(r.bestStreak)) ||
      (r.timeMs !== undefined && (!isNum(r.timeMs) || r.timeMs < 0))
    ) {
      return fail();
    }
    const s: SessionResult = {
      id: r.id,
      profileId: profile.id,
      courseId: r.courseId as string,
      kind: r.kind as SessionResult['kind'],
      sessionId: r.sessionId,
      day: r.day,
      correct: r.correct,
      total: r.total,
      at: r.at,
    };
    if (r.scope !== undefined) s.scope = r.scope as string;
    if (r.bestStreak !== undefined) s.bestStreak = r.bestStreak as number;
    if (r.timeMs !== undefined) s.timeMs = r.timeMs as number;
    return s;
  });

  const parsedMockPapers = mockPapers.map((r: unknown): MockPaperRecord => {
    if (
      !isObject(r) ||
      !isStr(r.id) || !isStr(r.paper) || !isStr(r.sessionId) ||
      r.profileId !== profile.id ||
      !isCourseOf(profile, r.courseId) ||
      !isNum(r.startedAt) ||
      !isNum(r.allowedMs) || r.allowedMs <= 0 ||
      !isObject(r.answers) ||
      !Array.isArray(r.flagged) || !r.flagged.every(isStr) ||
      !isObject(r.timeMs) || !Object.values(r.timeMs).every((v) => isNum(v) && v >= 0) ||
      !isCount(r.current) ||
      (r.submittedAt !== undefined && !isNum(r.submittedAt)) ||
      (r.marks !== undefined && (!isNum(r.marks) || r.marks < 0)) ||
      (r.maxMarks !== undefined && (!isNum(r.maxMarks) || r.maxMarks < 0)) ||
      (r.recorded !== undefined && typeof r.recorded !== 'boolean')
    ) {
      return fail();
    }
    const p: MockPaperRecord = {
      id: r.id,
      profileId: profile.id,
      courseId: r.courseId as string,
      paper: r.paper,
      sessionId: r.sessionId,
      startedAt: r.startedAt,
      allowedMs: r.allowedMs,
      // What an answer may look like is the business of the answer inputs, which read each one with care.
      answers: { ...r.answers },
      flagged: [...(r.flagged as string[])],
      timeMs: { ...(r.timeMs as Record<string, number>) },
      current: r.current,
    };
    if (r.submittedAt !== undefined) p.submittedAt = r.submittedAt as number;
    if (r.marks !== undefined) p.marks = r.marks as number;
    if (r.maxMarks !== undefined) p.maxMarks = r.maxMarks as number;
    if (r.recorded !== undefined) p.recorded = r.recorded as boolean;
    return p;
  });

  const parsedWritten = writtenResults.map((r: unknown): WrittenResult => {
    if (
      !isObject(r) ||
      !isStr(r.id) || !isStr(r.topicId) || !isStr(r.questionId) ||
      r.profileId !== profile.id ||
      !isCourseOf(profile, r.courseId) ||
      !isNum(r.maxMarks) || r.maxMarks <= 0 ||
      !isNum(r.marks) || r.marks < 0 || r.marks > r.maxMarks || !Number.isInteger(r.marks * 2) ||
      !Array.isArray(r.ticked) || !r.ticked.every(isCount) ||
      typeof r.onPaper !== 'boolean' ||
      (r.answer !== undefined && (typeof r.answer !== 'string' || r.answer.length > WRITTEN_ANSWER_MAX)) ||
      !isNum(r.timeMs) || r.timeMs < 0 ||
      !isNum(r.at)
    ) {
      return fail();
    }
    const w: WrittenResult = {
      id: r.id,
      profileId: profile.id,
      courseId: r.courseId as string,
      topicId: r.topicId,
      questionId: r.questionId,
      marks: r.marks,
      maxMarks: r.maxMarks,
      ticked: [...(r.ticked as number[])],
      onPaper: r.onPaper,
      timeMs: r.timeMs,
      at: r.at,
    };
    if (r.answer !== undefined) w.answer = r.answer as string;
    return w;
  });

  return {
    format: BACKUP_FORMAT,
    version: 1,
    profile,
    attempts: parsedAttempts,
    levelResults: parsedResults,
    cardReviews: parsedCardReviews,
    sessionResults: parsedSessionResults,
    mockPapers: parsedMockPapers,
    writtenResults: parsedWritten,
  };
}
