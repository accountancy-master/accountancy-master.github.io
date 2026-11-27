import { describe, expect, it } from 'vitest';
import { PACKS } from '@/content/registry';
import { TEMPLATES, generateCaseQuestions, generateQuestion } from '@/generators';
import { generateCase } from '@/generators/engine';
import { SAMPLE_CASE, SAMPLE_CHAIN } from '@/testing/sampleCase';
import { SAMPLE_ACCOUNT, SAMPLE_STATEMENT } from '@/testing/sampleFormats';
import { SAMPLE_SET } from '@/testing/sampleSet';
import { casePosition, caseStaysInReach, isCaseOpen, isLongQuestion, ownData, toggleCase, type CaseView } from './caseStudy';

describe('the case panel in the player', () => {
  const A = 'A shop.\n1 April: Started business.';
  const B = 'A factory.\n1 April: Bought a machine.';

  it('is open on the first question of a case', () => {
    expect(isCaseOpen(null, A)).toBe(true);
  });

  it('stays as the learner left it for the rest of that case', () => {
    let view: CaseView | null = null;
    view = toggleCase(view, A);
    expect(view).toEqual({ context: A, open: false });
    // The next questions of the case carry the same text.
    expect(isCaseOpen(view, A)).toBe(false);
    view = toggleCase(view, A);
    expect(isCaseOpen(view, A)).toBe(true);
    expect(isCaseOpen(toggleCase(view, A), A)).toBe(false);
  });

  it('is open again when another case begins, whatever was done with the last one', () => {
    const folded = toggleCase(null, A);
    expect(isCaseOpen(folded, B)).toBe(true);
    // Folding the new case is about the new case.
    expect(toggleCase(folded, B)).toEqual({ context: B, open: false });
    expect(isCaseOpen(toggleCase(folded, B), A)).toBe(true);
  });
});

describe('casePosition', () => {
  it('is null for a question that is not part of a case: authored, generated, or of a case that does not exist', () => {
    expect(casePosition(PACKS[0].questions[0])).toBeNull();
    expect(casePosition(generateQuestion(TEMPLATES[0].id, 7))).toBeNull();
    expect(casePosition({ id: 'gen:case-nope~2:1:7' })).toBeNull();
    expect(casePosition({ id: '' })).toBeNull();
  });
});

describe('the case of a chained case, which is the data of its formats', () => {
  const [set, account, statement] = generateCase(SAMPLE_CHAIN, 7);
  const short = generateCase(SAMPLE_CASE, 7);

  it('stays at the top of the screen while a format or a set of a case is answered, and scrolls with the page once it is checked', () => {
    for (const q of [set, account, statement]) {
      expect(caseStaysInReach(q, false), q.type).toBe(true);
      expect(caseStaysInReach(q, true), q.type).toBe(false);
    }
  });

  it('scrolls with the page above a short question of a case, as it always did', () => {
    expect(new Set(short.map((q) => q.type))).toEqual(new Set(['journal_entry', 'numeric', 'mcq']));
    expect(short.some(isLongQuestion)).toBe(false);
    expect([set, account, statement, SAMPLE_ACCOUNT, SAMPLE_STATEMENT, SAMPLE_SET].every(isLongQuestion)).toBe(true);
    for (const q of short) expect([caseStaysInReach(q, false), caseStaysInReach(q, true)], q.type).toEqual([false, false]);
  });

  it('is nothing to keep in reach for a question that has no case: a format that stands alone has a Data panel of its own', () => {
    for (const q of [SAMPLE_ACCOUNT, SAMPLE_STATEMENT, SAMPLE_SET]) expect(caseStaysInReach(q, false), q.type).toBe(false);
  });

  it('is the one panel: a format of a case shows no Data panel, a format that stands alone shows its data', () => {
    if (account.type !== 'account' || statement.type !== 'statement') throw new Error('unexpected kinds');
    // The data of a format of a case is the case text, which the case panel already shows.
    expect([account.data, statement.data]).toEqual([account.context, account.context]);
    expect([ownData(account), ownData(statement)]).toEqual([null, null]);
    expect(ownData(SAMPLE_ACCOUNT)).toBe(SAMPLE_ACCOUNT.data);
    expect(ownData(SAMPLE_STATEMENT)).toBe(SAMPLE_STATEMENT.data);
  });

  it('is open on the first part and then as the learner left it, part after part, since every part carries the same text', () => {
    let view: CaseView | null = null;
    expect(isCaseOpen(view, set.context!)).toBe(true);
    view = toggleCase(view, set.context!);
    expect([account, statement].map((q) => isCaseOpen(view, q.context!))).toEqual([false, false]);
  });

  it('knows where a format stands in a chained case that a stage has', () => {
    const parts = generateCaseQuestions('case-fa-chain-trading-pl-bs', 3);
    expect(parts.map((q) => casePosition(q))).toEqual([1, 2, 3].map((number) => ({ number, of: 3 })));
    expect(parts.every((q) => q.type === 'account' && caseStaysInReach(q, false) && ownData(q) === null)).toBe(true);
  });
});

