import { describe, expect, it } from 'vitest';
import { findQuestion } from '@/content/registry';
import { topicOfQuestion } from '@/content/outline';
import { isBalanced } from '@/engine/journal';
import { rupees } from '@/engine/money';
import { RECTIFYING, bandValues, effectOfLines, openingBalances, play, postLines, sameBooks, totalsOf } from './engine';
import { simQuestionId, simTopicOf } from './ids';
import { accountChoices, isComplete, markPrediction, markWords, type Prediction } from './predict';
import { mistakeQuestion, predictionQuestion } from './questions';
import { findScene, type MistakeCase } from './scenes';
import type { SimTransaction } from './types';

const scene = findScene('ae')!;
const OPENING = openingBalances(scene.opening.lines);
const tx = (id: string) => scene.transactions.find((t) => t.id === `s.${id}`)!;

/** The books a case starts from, and the books it should end with. */
function booksOf(c: MistakeCase) {
  const before = postLines(OPENING, c.setup ?? []);
  return { before, should: postLines(before, c.right) };
}

describe('mistake mode', () => {
  const cases = scene.mistakes.flatMap((m) => Array.from({ length: 30 }, (_, i) => m.make(i + 1)));

  it('has every class of error a Class 11 student meets, one-sided and two-sided', () => {
    expect(new Set(scene.mistakes.map((m) => m.errorClass))).toEqual(new Set(['omission', 'commission', 'principle']));
    expect(new Set(scene.mistakes.map((m) => m.oneSided))).toEqual(new Set([true, false]));
    // Omission and commission come both ways; an error of principle is always two-sided.
    for (const k of ['omission', 'commission'] as const) expect(new Set(scene.mistakes.filter((m) => m.errorClass === k).map((m) => m.oneSided)), k).toEqual(new Set([true, false]));
    expect(scene.mistakes.filter((m) => m.errorClass === 'principle').every((m) => !m.oneSided)).toBe(true);
  });

  it.each(scene.mistakes.map((m) => [m.id, m] as const))('%s: the wrong entry shows its error, and the correcting entry restores the books', (_, m) => {
    for (let seed = 1; seed <= 30; seed++) {
      const c = m.make(seed);
      const { before, should } = booksOf(c);
      expect(isBalanced(c.right), c.id).toBe(true);
      expect(isBalanced(c.correction), c.id).toBe(true);
      const wrong: SimTransaction = { id: c.id, text: c.recorded, lines: c.wrong };
      const played = play(scene, before, wrong, { withSuspense: true });
      expect(c.oneSided, c.id).toBe(m.oneSided);
      expect(c.errorClass, c.id).toBe(m.errorClass);
      if (c.oneSided) {
        // The posting tips the equation by exactly the difference of the two sides of the entry, which Suspense then holds.
        const dr = c.wrong.filter((l) => l.side === 'Dr').reduce((s, l) => s + l.amount, 0);
        const cr = c.wrong.filter((l) => l.side === 'Cr').reduce((s, l) => s + l.amount, 0);
        expect(dr, c.id).not.toBe(cr);
        const last = played.steps.at(-1)!;
        const tipped = played.steps.at(-2)!;
        expect(tipped.totals.balanced, c.id).toBe(false);
        expect(Math.abs(tipped.totals.left - tipped.totals.right), c.id).toBe(Math.abs(dr - cr));
        expect(last.kind, c.id).toBe('suspense');
        expect(last.totals.balanced, c.id).toBe(true);
        expect(last.totals.suspense, c.id).toEqual({ side: dr > cr ? 'right' : 'left', amount: Math.abs(dr - cr) });
        expect(c.correction.some((l) => l.accountId === 'suspense'), c.id).toBe(true);
      } else {
        // A two-sided error (or none posted) keeps the equation, but some band shows the wrong figure.
        expect(isBalanced(c.wrong) || c.wrong.length === 0, c.id).toBe(true);
        expect(played.steps.every((s) => s.totals.balanced && s.totals.suspense === null), c.id).toBe(true);
        expect(bandValues(scene, played.after), c.id).not.toEqual(bandValues(scene, should));
        expect(c.correction.some((l) => l.accountId === 'suspense'), c.id).toBe(false);
      }
      // The correction closes Suspense and leaves exactly the books the right entry would have made.
      const corrected = play(scene, played.after, { id: `${c.id}-c`, text: 'correction', lines: c.correction });
      expect(sameBooks(corrected.after, should), c.id).toBe(true);
      expect(totalsOf(scene, corrected.after).suspense, c.id).toBeNull();
      expect(corrected.steps.every((s) => s.totals.balanced), c.id).toBe(true);
    }
  });

  it('asks one question with four different choices, one right, each wrong one naming its mistake', () => {
    for (const c of cases) {
      expect(c.options.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd']);
      expect(new Set(c.options.map((o) => o.text)).size, c.id).toBe(4);
      const right = c.options.find((o) => o.id === c.correct)!;
      expect(right.why, c.id).toBeUndefined();
      expect(c.options.filter((o) => o.id !== c.correct).every((o) => (o.why ?? '').length > 10), c.id).toBe(true);
      // The right choice names the class of the error as CBSE does.
      const name = { omission: 'Error of omission', commission: 'Error of commission', principle: 'Error of principle' }[c.errorClass];
      expect(right.text.startsWith(name), c.id).toBe(true);
    }
  });

  it('the found-mistake question is made again from its id, exactly', () => {
    const c = scene.mistakes[3].make(5);
    const q = mistakeQuestion(scene, c);
    expect(q.id).toBe(`sim:ae:${c.id}`);
    expect(findQuestion(q.id)).toEqual(q);
  });

  it('classes each error as the Rectification of Errors topic does, and uses Suspense only for a one-sided one', () => {
    const want: Record<string, [string, boolean]> = {
      'omitted-purchase': ['omission', false],
      'credit-not-posted': ['omission', true],
      'wrong-amount': ['commission', false],
      // A credit purchase recorded as a cash purchase: a wrong account (through a wrong book), no rule broken.
      'credit-as-cash': ['commission', false],
      'short-posting': ['commission', true],
      'wrong-side': ['commission', true],
      'drawings-as-salary': ['principle', false],
      'machine-as-repairs': ['principle', false],
      'furniture-as-purchases': ['principle', false],
    };
    expect(Object.fromEntries(scene.mistakes.map((m) => [m.id, [m.errorClass, m.oneSided]]))).toEqual(want);
    for (const c of cases) {
      expect(c.narration.endsWith('now rectified') || c.narration.endsWith('now recorded') || c.narration.endsWith('now posted'), c.id).toBe(true);
      const right = c.options.find((o) => o.id === c.correct)!.text;
      expect(/trial balance (still )?agrees/.test(right) || /does not agree|out by twice/.test(right) || c.errorClass === 'principle', c.id).toBe(true);
    }
  });

  it('tells a rectifying entry as a correction, not as money moving in or out', () => {
    const c = scene.mistakes.find((m) => m.id === 'wrong-amount')!.make(1);
    const { before } = booksOf(c);
    const wrong = play(scene, before, { id: 'w', text: c.recorded, lines: c.wrong });
    const fixed = play(scene, wrong.after, { id: 'c', kind: RECTIFYING, text: 'c', lines: c.correction });
    expect(fixed.steps[0].text).toMatch(/^The rectifying entry moves ₹/);
    expect(fixed.steps[0].text).not.toContain('out of the business');
  });
});

describe('predict mode', () => {
  const sale = tx('sale-cash');
  const effect = effectOfLines(scene, sale.lines, sale.costOfSale);

  it('marks the directions', () => {
    const right: Prediction = { directions: { assets: 'up', liabilities: 'same', capital: 'up' } };
    expect(markPrediction(sale, effect, right, 'directions').correct).toBe(true);
    const wrong: Prediction = { directions: { assets: 'same', liabilities: 'same', capital: 'same' } };
    const m = markPrediction(sale, effect, wrong, 'directions');
    expect(m.correct).toBe(false);
    expect(m.sides.map((s) => s.right)).toEqual([false, true, false]);
    // It is one of the transaction's traps, so its mistake is named.
    expect(m.mistake).toBe('Thought cash only replaces stock, forgetting the profit.');
    expect(markWords(m)).toEqual(['Assets should go up by ₹3,000.', 'Capital should go up by ₹3,000.']);
  });

  it('marks the amounts at the middle level: the profit, not the price', () => {
    const p: Prediction = { directions: { assets: 'up', liabilities: 'same', capital: 'up' }, amounts: { assets: rupees(15000), capital: rupees(15000) } };
    expect(markPrediction(sale, effect, p, 'amounts').correct).toBe(false);
    p.amounts = { assets: rupees(3000), capital: rupees(3000) };
    expect(markPrediction(sale, effect, p, 'amounts').correct).toBe(true);
  });

  it('marks the accounts at the top level', () => {
    const p: Prediction = { directions: { assets: 'up', liabilities: 'same', capital: 'up' }, amounts: { assets: rupees(3000), capital: rupees(3000) }, debited: ['cash'], credited: ['sales'] };
    expect(isComplete(p, 'accounts')).toBe(true);
    expect(markPrediction(sale, effect, p, 'accounts').correct).toBe(true);
    expect(markPrediction(sale, effect, { ...p, credited: ['capital'] }, 'accounts').correct).toBe(false);
    const offered = accountChoices(sale);
    expect(offered).toEqual(expect.arrayContaining(['cash', 'sales']));
    expect(new Set(offered).size).toBe(offered.length);
  });

  it('is complete only when every side has a direction (and an amount, where asked)', () => {
    expect(isComplete({ directions: { assets: 'up', liabilities: 'same' } }, 'directions')).toBe(false);
    expect(isComplete({ directions: { assets: 'up', liabilities: 'same', capital: 'up' } }, 'amounts')).toBe(false);
  });

  it('every starter transaction is recorded against a question that can be made again, with the right effect as its answer', () => {
    for (const t of scene.transactions) {
      const q = predictionQuestion(scene, t);
      expect(new Set(q.options.map((o) => o.text)).size, t.id).toBe(q.options.length);
      expect(q.options.length, t.id).toBeGreaterThanOrEqual(3);
      expect(findQuestion(q.id), t.id).toEqual(q);
      expect(topicOfQuestion(q.id)).toBe('accounting-equation');
    }
  });

  it('questions of the generators are made again from their ids', () => {
    expect(findQuestion(simQuestionId('ae', 'm.17'))?.type).toBe('mcq');
    expect(findQuestion(simQuestionId('ae', 'j.je-capital.3'))?.prompt).toContain('₹');
    expect(simTopicOf('sim:ae:j.je-capital.3')).toBe('journal-entries');
    expect(simTopicOf('sim:ae:m.017')).toBe('accounting-equation');
    expect(findQuestion('sim:ae:m.017')).toBeUndefined();
    expect(findQuestion('sim:ae:s.no-such')).toBeUndefined();
    expect(simTopicOf('sim:zz:s.x')).toBeUndefined();
  });
});
