import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '@/generators';
import { ASSERTION_REASON_OPTIONS, assertionReasonFacts, type AssertionReasonItem } from '@/generators/authoring';
import { generateFrom } from '@/generators/engine';
import { isAssertionReason } from '@/generators/ids';
import { bankOf } from '@/learning/mockPaper';
import { CBSE12 } from './courses/cbse12';
import { PACKS } from './registry';
import type { McqQuestion } from './types';

const OPTIONS = Object.values(ASSERTION_REASON_OPTIONS);
const templates = TEMPLATES.filter((t) => isAssertionReason(t.id));

/** Every question of a bank: enough seeds to reach each item of it. */
function bankOfTemplate(template: (typeof templates)[number]): McqQuestion[] {
  const byPrompt = new Map<string, McqQuestion>();
  for (let seed = 1; seed <= 600; seed++) {
    const q = generateFrom(template, seed) as McqQuestion;
    byPrompt.set(q.prompt, q);
  }
  return [...byPrompt.values()];
}

describe('Assertion-Reason banks', () => {
  it('has one template and one last level of its own for every topic of Class 12', () => {
    for (const { id: topicId } of CBSE12.topics) {
      const own = templates.filter((t) => t.topicId === topicId);
      expect(own, topicId).toHaveLength(1);
      expect(own[0].difficulty, topicId).toBe('medium');
      const pack = PACKS.find((p) => p.topicId === topicId)!;
      const level = pack.levels.find((l) => l.id === `${topicId}-assertion-reason`);
      expect(level?.generate?.templateIds, topicId).toEqual([own[0].id]);
      expect(level?.title, topicId).toBe('Assertion and Reason');
      // Only the levels the registry adds (Look back, the case studies) come after it.
      const after = pack.levels.slice(pack.levels.indexOf(level!) + 1);
      expect(after.every((l) => l.type === 'look_back' || l.type === 'case_study'), topicId).toBe(true);
    }
  });

  it('asks at least ten questions, with the four options word for word, and every answer among them', () => {
    expect(templates.length).toBeGreaterThanOrEqual(CBSE12.topics.length);
    for (const template of templates) {
      const questions = bankOfTemplate(template);
      expect(questions.length, template.id).toBeGreaterThanOrEqual(10);
      const answers = new Map<string, number>();
      for (const q of questions) {
        expect(q.prompt, template.id).toMatch(/^Assertion \(A\): .+\nReason \(R\): .+\nChoose the correct option\.$/);
        expect(q.options.map((o) => o.text).sort(), q.prompt).toEqual([...OPTIONS].sort());
        const right = q.options.find((o) => o.id === q.correct)!.text;
        answers.set(right, (answers.get(right) ?? 0) + 1);
      }
      for (const option of OPTIONS) expect(answers.get(option) ?? 0, `${template.id}: ${option}`).toBeGreaterThanOrEqual(2);
      // The first answer is the commonest in a board paper, but never the only one.
      expect(answers.get(OPTIONS[0])!, template.id).toBeLessThan(questions.length / 2);
    }
  });

  it('is in no mock paper bank and no Look back level', () => {
    for (const choice of [undefined, { class12PartB: 'computerised' as const }]) {
      expect(bankOf(CBSE12.id, choice).templates.filter((t) => isAssertionReason(t.id))).toEqual([]);
    }
    for (const pack of PACKS) {
      for (const level of pack.levels) {
        const looked = [...(level.lookBack?.templateIds ?? []), ...(level.lookBack?.earlier ?? []).flatMap((t) => t.templateIds)];
        expect(looked.filter(isAssertionReason), level.id).toEqual([]);
      }
    }
  });

  it('refuses a bank too small, without one of the answers, or with a link in the wrong place', () => {
    const item = (answer: AssertionReasonItem['answer'], i: number): AssertionReasonItem => ({
      assertion: `A ${i}.`, reason: `R ${i}.`, answer, a: 'a', r: 'r', ...(answer === 'both' || answer === 'bothNot' ? { link: 'l' } : {}),
    });
    const whole = (['both', 'both', 'both', 'both', 'bothNot', 'bothNot', 'aOnly', 'aOnly', 'rOnly', 'rOnly'] as const).map(item);
    expect(assertionReasonFacts(whole)).toHaveLength(10);
    expect(() => assertionReasonFacts(whole.slice(0, 9))).toThrow('at least 10');
    expect(() => assertionReasonFacts(whole.map((x) => (x.answer === 'rOnly' ? { ...x, answer: 'aOnly' as const } : x)))).toThrow('rOnly');
    expect(() => assertionReasonFacts(whole.map((x) => (x.answer === 'aOnly' ? { ...x, link: 'l' } : x)))).toThrow('link');
    expect(() => assertionReasonFacts(whole.map((x) => (x.answer === 'both' ? { ...x, link: undefined } : x)))).toThrow('link');
  });
});

describe('an Assertion-Reason level', () => {
  it('shows the four options in the order of the board, and repeats no item within the size of the bank', () => {
    const order = Object.values(ASSERTION_REASON_OPTIONS);
    for (const t of TEMPLATES.filter((x) => isAssertionReason(x.id))) {
      const prompts = new Set<string>();
      for (let seed = 1; seed <= 10; seed++) {
        const q = generateFrom(t, seed);
        if (q.type !== 'mcq') throw new Error(t.id);
        expect(q.options.map((o) => o.text), t.id).toEqual(order);
        prompts.add(q.prompt);
      }
      expect(prompts.size, t.id).toBe(10);
    }
  });
});
