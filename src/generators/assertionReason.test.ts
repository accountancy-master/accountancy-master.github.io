import { describe, expect, it } from 'vitest';
import { CBSE11 } from '@/content/courses/cbse11';
import { packsOf } from '@/content/registry';
import type { McqQuestion } from '@/content/types';
import { TEMPLATES } from '@/generators';
import { generateFrom } from '@/generators/engine';
import { bankOf } from '@/learning/mockPaper';
import { sheetSources } from '@/learning/worksheet';
import { ASSERTION_REASON_OPTIONS, FEWEST_ITEMS, assertionReasonTemplate, type AssertionReasonAnswer, type AssertionReasonItem } from './assertionReason';
import { isAssertionReason } from './ids';

const COURSE = CBSE11.id;
const TOPICS = packsOf(COURSE).map((p) => p.topicId).sort();
const OPTIONS = Object.values(ASSERTION_REASON_OPTIONS);
const answerOf = (q: McqQuestion) => (Object.keys(ASSERTION_REASON_OPTIONS) as AssertionReasonAnswer[]).find((a) => ASSERTION_REASON_OPTIONS[a] === q.options.find((o) => o.id === q.correct)!.text)!;

/** Every item of a bank, one question each: seeds in a row walk through it. */
function bank(id: string): McqQuestion[] {
  const template = TEMPLATES.find((t) => t.id === id)!;
  const seen = new Map<string, McqQuestion>();
  for (let seed = 1; seed <= 100; seed++) {
    const q = generateFrom(template, seed) as McqQuestion;
    seen.set(q.prompt, q);
  }
  return [...seen.values()];
}

describe('the Assertion and Reason banks of Class 11', () => {
  const templates = TEMPLATES.filter((t) => isAssertionReason(t.id) && TOPICS.includes(t.topicId));

  it('has one bank for each topic of the course, of medium difficulty, on a level of its own at the end of the ladder', () => {
    expect(templates.map((t) => t.topicId).sort()).toEqual(TOPICS);
    for (const t of templates) {
      expect(t, t.id).toMatchObject({ kind: 'mcq', difficulty: 'medium' });
      // Version 1, or a later one where an item was put right by the Class 11 quality pass (dep-, faa-, and roe-, whose
      // item on the side of Suspense A/c now teaches the side that undoes each error).
      expect(t.version, t.id).toBe(['dep-assertion-reason', 'faa-assertion-reason', 'roe-assertion-reason'].includes(t.id) ? 2 : 1);
      const { levels } = packsOf(COURSE).find((p) => p.topicId === t.topicId)!;
      const level = levels.find((l) => l.id === `${t.topicId}-assertion-reason`)!;
      expect(level, t.id).toMatchObject({ title: 'Assertion and Reason', generate: { templateIds: [t.id], count: 8 } });
      // Only the levels the registry adds stand after it.
      expect(levels.slice(levels.indexOf(level) + 1).every((l) => l.lookBack !== undefined || l.cases !== undefined), t.id).toBe(true);
      expect(levels.filter((l) => l.generate?.templateIds.includes(t.id)), t.id).toEqual([level]);
    }
  });

  it('spreads every bank across the four answers, the first the commonest but never the only one', () => {
    for (const t of templates) {
      const questions = bank(t.id);
      expect(questions.length, t.id).toBeGreaterThanOrEqual(FEWEST_ITEMS);
      const count = (answer: AssertionReasonAnswer) => questions.filter((q) => answerOf(q) === answer).length;
      expect(count('explains'), t.id).toBeGreaterThanOrEqual(4);
      expect(count('explains') / questions.length, t.id).toBeLessThanOrEqual(0.5);
      for (const answer of ['not-the-reason', 'a-only', 'r-only'] as const) expect(count(answer), `${t.id} ${answer}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('asks in the four options of the board, word for word, and says of A, of R and of the link between them', () => {
    expect(OPTIONS).toEqual([
      'Both Assertion (A) and Reason (R) are true, and R is the correct explanation of A.',
      'Both A and R are true, but R is not the correct explanation of A.',
      'A is true, but R is false.',
      'A is false, but R is true.',
    ]);
    for (const t of templates) {
      for (const q of bank(t.id)) {
        expect(q.options.map((o) => o.text).sort(), q.prompt).toEqual([...OPTIONS].sort());
        expect(q.prompt).toMatch(/^Assertion \(A\): .+\nReason \(R\): .+\nChoose the correct option\.$/);
        const answer = answerOf(q);
        expect(q.explanation.startsWith(`A is ${answer === 'r-only' ? 'false' : 'true'}. `), q.prompt).toBe(true);
        expect(q.explanation, q.prompt).toContain(` R is ${answer === 'a-only' ? 'false' : 'true'}. `);
        for (const o of q.options.filter((x) => x.id !== q.correct)) expect(o.why, q.prompt).toMatch(/^Took /);
      }
    }
  });

  it('never repeats an item among the seeds of a session', () => {
    for (const t of templates) {
      const size = bank(t.id).length;
      for (const base of [1, 7, 1_000_000_123, 2_000_000_011]) {
        const prompts = Array.from({ length: size }, (_, i) => (generateFrom(t, base + i) as McqQuestion).prompt);
        expect(new Set(prompts).size, t.id).toBe(size);
      }
    }
  });

  it('serves all four answers in any level of eight', () => {
    for (const t of templates) {
      const size = bank(t.id).length;
      for (let base = 0; base < size; base++) {
        const answers = new Set(Array.from({ length: 8 }, (_, i) => answerOf(generateFrom(t, base + i) as McqQuestion)));
        expect(answers.size, `${t.id} from seed ${base}`).toBe(4);
      }
    }
  });

  it('keeps to the 2025-26 syllabus of Class 11', () => {
    for (const t of templates) {
      for (const q of bank(t.id)) {
        const text = [q.prompt, q.explanation, ...q.options.map((o) => o.why ?? '')].join(' ').toLowerCase();
        for (const beyond of ['interest on drawings', 'totals method', 'three column']) expect(text, q.prompt).not.toContain(beyond);
      }
    }
  });

  it('is in no mock paper and on no worksheet', () => {
    expect(bankOf(COURSE).templates.some((t) => isAssertionReason(t.id))).toBe(false);
    const sources = sheetSources(COURSE, TOPICS, 'mixed');
    expect(sources.some((s) => 'template' in s && isAssertionReason(s.template.id))).toBe(false);
  });
});

describe('assertionReasonTemplate', () => {
  const item = (n: number, answer: AssertionReasonAnswer): AssertionReasonItem =>
    answer === 'explains' || answer === 'not-the-reason'
      ? { answer, a: `A${n}`, r: `R${n}`, aWhy: 'Why A.', rWhy: 'Why R.', link: 'The link.' }
      : { answer, a: `A${n}`, r: `R${n}`, aWhy: 'Why A.', rWhy: 'Why R.' };
  const ofAnswers = (answers: AssertionReasonAnswer[]) => answers.map((a, i) => item(i, a));
  const def = { prefix: 'x', topicId: 'theory-base', conceptId: 'thb-principles' };

  it('refuses a bank that is too small, or that leaves out an answer', () => {
    expect(() => assertionReasonTemplate({ ...def, items: ofAnswers(['explains', 'not-the-reason', 'a-only', 'r-only']) })).toThrow('4 items, not 10 or more');
    expect(() => assertionReasonTemplate({ ...def, items: ofAnswers(Array(10).fill('explains')) })).toThrow('no item has the answer "not-the-reason"');
  });

  it('says what mistake each wrong option makes', () => {
    const items = ofAnswers(['explains', 'not-the-reason', 'a-only', 'r-only', 'explains', 'not-the-reason', 'a-only', 'r-only', 'explains', 'explains']);
    const t = assertionReasonTemplate({ ...def, items });
    const why = (answer: AssertionReasonAnswer, chosen: AssertionReasonAnswer) => {
      const q = Array.from({ length: items.length }, (_, seed) => generateFrom(t, seed) as McqQuestion).find((x) => answerOf(x) === answer)!;
      return q.options.find((o) => o.text === ASSERTION_REASON_OPTIONS[chosen])!.why;
    };
    expect(why('explains', 'not-the-reason')).toBe('Took R as a true statement that does not explain A. The link.');
    expect(why('not-the-reason', 'explains')).toBe('Took R as the reason for A because both are true. The link.');
    expect(why('explains', 'a-only')).toBe('Took R as false. Why R.');
    expect(why('explains', 'r-only')).toBe('Took A as false. Why A.');
    expect(why('a-only', 'explains')).toBe('Took R as true. Why R.');
    expect(why('a-only', 'r-only')).toBe('Took A as false and R as true. Why A. Why R.');
    expect(why('r-only', 'a-only')).toBe('Took A as true and R as false. Why A. Why R.');
  });
});
