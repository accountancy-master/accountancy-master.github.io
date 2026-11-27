import { describe, expect, it } from 'vitest';
import { rightFormat } from '@/testing/sampleFormats';
import { getTopicPack } from '@/content/registry';
import { checkAnswer, type Response } from '@/exercises/checkers';
import { deriveProgress, isLevelUnlocked, scoreLevel, topicMastery } from '@/learning/progress';
import { buildLevelSession, countScored } from '@/learning/sessionBuilder';
import { MemoryStore } from '@/storage/memoryStore';
import type { Question } from '@/content/types';

const T0 = new Date(2026, 9, 4, 18).getTime();

const rightAnswer = (q: Question): Response =>
  q.type === 'mcq'
    ? { type: 'mcq', optionId: q.correct }
    : q.type === 'true_false'
      ? { type: 'true_false', value: q.correct }
      : q.type === 'journal_entry'
        ? { type: 'journal_entry', lines: q.expected }
        : q.type === 'journal_set'
          ? { type: 'journal_set', entries: q.entries.map((e) => e.expected) }
          : q.type === 'account' || q.type === 'statement'
            ? rightFormat(q)
            : { type: 'numeric', value: q.answer };

const wrongAnswer = (q: Question): Response =>
  q.type === 'journal_entry'
    ? { type: 'journal_entry', lines: q.expected.map((l) => ({ ...l, side: l.side === 'Dr' ? 'Cr' : 'Dr' })) }
    : rightAnswer(q);

describe('a student plays through the first levels', () => {
  it('records attempts, passes levels, unlocks the next and tracks mistakes', async () => {
    const store = new MemoryStore();
    const profile = await store.createProfile('Varun', 'cbse-11-accountancy');
    const pack = getTopicPack('journal-entries')!;
    let clock = T0;
    let n = 0;

    const play = async (levelIndex: number, sessionId: string, wrongFirst = 0) => {
      const level = pack.levels[levelIndex];
      const items = buildLevelSession(level, pack, 1000 + levelIndex);
      let correct = 0;
      let wrongLeft = wrongFirst;
      for (const item of items) {
        if (item.kind !== 'question') continue;
        const q = item.question;
        const result = checkAnswer(q, wrongLeft-- > 0 ? wrongAnswer(q) : rightAnswer(q));
        if (result.correct) correct++;
        await store.appendAttempt({
          id: `a${n++}`, profileId: profile.id, courseId: profile.courseId, topicId: pack.topicId,
          conceptId: q.conceptId, questionId: q.id, difficulty: q.difficulty, correct: result.correct,
          hintsUsed: 0, mistakeCode: result.mistakeCode, timeMs: 5000, at: clock++, sessionId, levelId: level.id,
        });
      }
      const outcome = scoreLevel(correct, countScored(items), level);
      await store.appendLevelResult({
        id: `r${n++}`, profileId: profile.id, topicId: pack.topicId, levelId: level.id, at: clock++, ...outcome,
      });
      return outcome;
    };

    const progress = async () =>
      deriveProgress(await store.listAttempts(profile.id), await store.listLevelResults(profile.id), clock);

    expect(isLevelUnlocked(pack.levels[1], pack.levels, (await progress()).passedLevelIds)).toBe(false);

    for (let i = 0; i <= 3; i++) expect((await play(i, `s${i}`)).passed).toBe(true);

    // Two reversed entries out of eight: 75%, still a pass, and two open mistakes.
    expect(await play(4, 's4', 2)).toEqual({ score: 0.75, passed: true });

    const p = await progress();
    expect(p.passedLevelIds).toHaveLength(5);
    expect(isLevelUnlocked(pack.levels[5], pack.levels, p.passedLevelIds)).toBe(true);
    expect(isLevelUnlocked(pack.levels[6], pack.levels, p.passedLevelIds)).toBe(false);
    expect(p.xp).toBe(10 * 10 + 6 * 10 + 5 * 20);
    expect(topicMastery(pack, p)).toBeGreaterThan(0);
    const open = Object.values(p.questions).filter((q) => q.mistakeOpen);
    expect(open).toHaveLength(2);
    expect(open.every((q) => q.mistakeCode === 'sidesReversed')).toBe(true);

    // Replaying the same level in a later session corrects both mistakes.
    await play(4, 's5');
    expect(Object.values((await progress()).questions).filter((q) => q.mistakeOpen)).toHaveLength(0);
  });
});
