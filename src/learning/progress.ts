import type { Level, LevelOutline, TopicOutline } from '@/content/types';
import type { AttemptEvent, CardReviewEvent, LevelResult, SessionResult } from '@/storage/types';
import { CONFIG } from './config';
import { dayKey, updateStreak, xpForAttempt, type Streak } from './gamification';
import { applyAttempt, DAY_MS, decay } from './mastery';
import { scheduleReview, type ReviewState } from './srs';

export interface ConceptProgress {
  mastery: number;
  lastAt: number;
  review: ReviewState;
}

export interface QuestionRecord {
  attempts: number;
  lastCorrect: boolean;
  mistakeOpen: boolean;
  mistakeSessionId?: string;
  /** When the attempt that opened (or reopened) the mistake happened. */
  mistakeAt?: number;
  mistakeCode?: string;
  /** How many times a mistake on this question has been put right (answered correctly in a later session). */
  corrected?: number;
}

export interface Progress {
  xp: number;
  streak: Streak;
  concepts: Record<string, ConceptProgress>;
  questions: Record<string, QuestionRecord>;
  passedLevelIds: string[];
  answered: number;
  correct: number;
  /** Local day to XP earned that day (questions and bonuses). */
  xpByDay: Record<string, number>;
  missionDoneDays: string[];
  challengeDoneDays: string[];
}

/** A bonus session counts only when at least half of its scored questions were right (a session with none always does). */
const earnsBonus = (r: Pick<SessionResult, 'correct' | 'total'>): boolean => !(r.total > 0 && r.correct / r.total < CONFIG.xp.bonusMinScore);

/**
 * The bonus a mock paper earns: so much for every mark the paper carries, when at least half its marks were earned.
 * Each sitting is recorded once and a new paper is always another paper, so there is no once-a-day limit.
 */
export const mockPaperBonus = (r: Pick<SessionResult, 'correct' | 'total'>): number =>
  earnsBonus(r) ? r.total * CONFIG.xp.mockBonusPerMark : 0;

const byTime = <T extends { at: number; id: string }>(rows: T[]) =>
  [...rows].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/**
 * The streak of days on which something was done. A day is active when a question was answered or a card was rated
 * on it, whichever happened first.
 */
export function deriveStreak(attempts: readonly Pick<AttemptEvent, 'at'>[], cardReviews: readonly Pick<CardReviewEvent, 'at'>[]): Streak {
  const activeDays = new Set([...attempts.map((a) => dayKey(a.at)), ...cardReviews.map((c) => dayKey(c.at))]);
  let streak: Streak = { count: 0, lastDay: null };
  for (const day of [...activeDays].sort()) streak = updateStreak(streak, day);
  return streak;
}

export function deriveProgress(
  attempts: AttemptEvent[],
  levelResults: LevelResult[],
  now: number,
  sessionResults: SessionResult[] = [],
  cardReviews: CardReviewEvent[] = [],
): Progress {
  const p: Progress = {
    xp: 0,
    streak: { count: 0, lastDay: null },
    concepts: {},
    questions: {},
    passedLevelIds: [],
    answered: 0,
    correct: 0,
    xpByDay: {},
    missionDoneDays: [],
    challengeDoneDays: [],
  };
  const earn = (day: string, xp: number) => {
    p.xp += xp;
    p.xpByDay[day] = (p.xpByDay[day] ?? 0) + xp;
  };
  const answeredRight = new Set<string>();

  for (const a of byTime(attempts)) {
    p.answered++;
    if (a.correct) p.correct++;
    const repeat = a.correct && answeredRight.has(a.questionId);
    // Partial XP for a long answer is earned on the first answer to its question only.
    const firstTry = p.questions[a.questionId] === undefined;
    if (a.correct) answeredRight.add(a.questionId);
    earn(dayKey(a.at), xpForAttempt(a, repeat, firstTry));

    const prev = p.concepts[a.conceptId];
    const before = prev ? decay(prev.mastery, (a.at - prev.lastAt) / DAY_MS) : 0;
    p.concepts[a.conceptId] = {
      mastery: applyAttempt(before, a),
      lastAt: a.at,
      review: scheduleReview(prev?.review, a.correct, a.at),
    };

    const q = p.questions[a.questionId] ?? { attempts: 0, lastCorrect: false, mistakeOpen: false };
    q.attempts++;
    q.lastCorrect = a.correct;
    if (!a.correct) {
      if (!q.mistakeOpen) q.mistakeAt = a.at;
      q.mistakeOpen = true;
      q.mistakeSessionId = a.sessionId;
      q.mistakeCode = a.mistakeCode ?? q.mistakeCode;
    } else if (q.mistakeOpen && a.sessionId !== q.mistakeSessionId) {
      // An immediate retry in the same session does not prove the idea has stuck.
      q.mistakeOpen = false;
      q.corrected = (q.corrected ?? 0) + 1;
    }
    p.questions[a.questionId] = q;
  }

  for (const r of byTime(levelResults)) {
    if (r.passed && !p.passedLevelIds.includes(r.levelId)) {
      p.passedLevelIds.push(r.levelId);
      earn(dayKey(r.at), CONFIG.xp.levelPassBonus);
    }
  }

  p.streak = deriveStreak(attempts, cardReviews);

  for (const r of byTime(sessionResults)) {
    // Too few right: no bonus, and the day stays open for another try.
    if (!earnsBonus(r)) continue;
    if (r.kind === 'daily_mission' && !p.missionDoneDays.includes(r.day)) {
      p.missionDoneDays.push(r.day);
      earn(r.day, CONFIG.xp.dailyMissionBonus);
    } else if (r.kind === 'daily_challenge' && !p.challengeDoneDays.includes(r.day)) {
      p.challengeDoneDays.push(r.day);
      earn(r.day, CONFIG.xp.dailyChallengeBonus);
    } else if (r.kind === 'mock') {
      earn(r.day, mockPaperBonus(r));
    }
  }

  for (const c of Object.values(p.concepts)) c.mastery = decay(c.mastery, (now - c.lastAt) / DAY_MS);
  return p;
}

export const xpToday = (progress: Progress, today: string): number => progress.xpByDay[today] ?? 0;

export const goalMet = (progress: Progress, today: string, goalXp: number): boolean =>
  xpToday(progress, today) >= goalXp;

export function scoreLevel(correct: number, total: number, level: Pick<Level, 'passMark'>): { score: number; passed: boolean } {
  const score = total === 0 ? 1 : correct / total;
  return { score, passed: score >= (level.passMark ?? CONFIG.level.defaultPassMark) };
}

export function isLevelUnlocked(level: Pick<LevelOutline, 'order'>, levels: readonly Pick<LevelOutline, 'id' | 'order'>[], passedLevelIds: string[]): boolean {
  const earlier = levels.filter((l) => l.order < level.order).sort((a, b) => b.order - a.order)[0];
  return !earlier || passedLevelIds.includes(earlier.id);
}

/**
 * Whether a level may be played. The one place that applies the "unlock all levels" device setting: with it on every
 * level is open, otherwise a level opens when the one above it has been passed.
 */
export const levelUnlocked = (
  level: Pick<LevelOutline, 'order'>,
  levels: readonly Pick<LevelOutline, 'id' | 'order'>[],
  passedLevelIds: string[],
  unlockAll: boolean,
): boolean =>
  unlockAll || isLevelUnlocked(level, levels, passedLevelIds);

export function topicMastery(pack: Pick<TopicOutline, 'concepts'>, progress: Progress): number {
  if (pack.concepts.length === 0) return 0;
  const total = pack.concepts.reduce((s, c) => s + (progress.concepts[c.id]?.mastery ?? 0), 0);
  return Math.round(total / pack.concepts.length);
}

/**
 * The topics the learner has played (an attempt at one of the topic's concepts), weakest first: lowest topic mastery,
 * and of two equally weak the earlier in `packs`. A look-back level asks about these before any other earlier topic.
 */
export function weakestTopics(packs: readonly Pick<TopicOutline, 'topicId' | 'concepts'>[], progress: Progress): string[] {
  return packs
    .filter((p) => p.concepts.some((c) => progress.concepts[c.id] !== undefined))
    .map((p, i) => ({ topicId: p.topicId, i, mastery: topicMastery(p, progress) }))
    .sort((a, b) => a.mastery - b.mastery || a.i - b.i)
    .map((x) => x.topicId);
}
