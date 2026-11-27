import { describe, expect, it } from 'vitest';
import type { Card, Question } from '@/content/types';
import { CONFIG } from '@/learning/config';
import type { SessionItem } from '@/learning/sessionBuilder';
import { describeMission, summariseMission } from './mission';

const card = { kind: 'card', card: {} as Card } as const;
const question = { kind: 'question', question: {} as Question } as const;
const many = (item: SessionItem, n: number): SessionItem[] => Array.from({ length: n }, () => item);
const { cards, questions, challenge } = CONFIG.practice.mission;

describe('summariseMission', () => {
  it('splits a full mission into practice and challenge questions', () => {
    const s = summariseMission([...many(card, cards), ...many(question, questions + challenge)]);
    expect(s).toEqual({ cards, questions, challenge });
    expect(describeMission(s)).toBe('5 cards · 8 questions · 2 challenge questions');
  });

  it('counts a smaller mission together, without guessing a split', () => {
    const s = summariseMission([...many(card, 3), ...many(question, 4)]);
    expect(s).toEqual({ cards: 3, questions: 4, challenge: null });
    expect(describeMission(s)).toBe('3 cards · 4 questions');
  });

  it('leaves out what is missing and says one in the singular', () => {
    expect(describeMission(summariseMission(many(card, 1)))).toBe('1 card');
    expect(describeMission(summariseMission(many(question, 1)))).toBe('1 question');
    expect(summariseMission([])).toEqual({ cards: 0, questions: 0, challenge: null });
    expect(describeMission(summariseMission([]))).toBe('');
  });
});
