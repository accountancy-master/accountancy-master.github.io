import { dayKey } from '@/learning/gamification';
import type { SessionKind } from '@/storage/types';

/** The practice routes, `/practice/<mode>`. */
export const PRACTICE_MODES = ['smart', 'fresh', 'mistakes', 'cards', 'daily', 'mission'] as const;
export type PracticeMode = (typeof PRACTICE_MODES)[number];

export const isPracticeMode = (s: string): s is PracticeMode => (PRACTICE_MODES as readonly string[]).includes(s);

const KIND: Record<PracticeMode, Exclude<SessionKind, 'level'>> = {
  smart: 'smart',
  fresh: 'fresh',
  mistakes: 'mistakes',
  cards: 'cards',
  daily: 'daily_challenge',
  mission: 'daily_mission',
};

/** The session kind a mode records (the daily challenge and the mission earn their bonuses through theirs). */
export const kindForMode = (mode: PracticeMode): Exclude<SessionKind, 'level'> => KIND[mode];

export const MODE_TITLE: Record<PracticeMode, string> = {
  smart: 'Smart practice',
  fresh: 'Fresh questions',
  mistakes: 'Fix your mistakes',
  cards: 'Revise rule cards',
  daily: 'Daily challenge',
  mission: 'Daily mission',
};

/**
 * The local day a finished session is recorded for. The daily challenge is the one set built for the day it was
 * started (its questions come from that day), so it keeps that day even when it is finished after midnight.
 */
export const sessionResultDay = (kind: SessionKind, startedAt: number, finishedAt: number): string =>
  dayKey(kind === 'daily_challenge' ? startedAt : finishedAt);

/**
 * Mistake review serves exact questions and the daily challenge is the same for everyone: no extra ones there. (A case
 * study has none either, whatever the kind of session: `similarTo` gives nothing for a question of a case.)
 */
export const allowsSimilar = (kind: SessionKind): boolean => kind !== 'daily_challenge' && kind !== 'mistakes';
