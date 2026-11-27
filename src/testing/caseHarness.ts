import { expect, it } from 'vitest';
import { findQuestion } from '@/content/registry';
import type { Question } from '@/content/types';
import { resolveAccount } from '@/engine/accounts';
import { isBalanced } from '@/engine/journal';
import { checkFormat, checkJournalSet, checkNumericAnswer } from '@/testing/questionChecks';

import { MAX_ATTEMPTS, MAX_SET_ENTRIES, MIN_SET_ENTRIES, casePartsProblem, generateCase } from '@/generators/engine';
import {
  CASES,
  buildCase,
  genId,
  type CaseTemplate,
} from '@/generators/index';

// The harness that gates every case: each case, whole, over the same seeds. Split into parts
// (src/generators/harness/cases-*.test.ts) so that the parts run at once, one file each.

export const SEEDS = 100;

// The checks every question of every case must pass. A failure names the case, the seed and the question.
function checkQuestion(q: Question, at: string) {
  expect(q.prompt.trim().length, `${at}: empty prompt`).toBeGreaterThan(10);
  expect(q.hints.length, `${at}: needs at least two hints`).toBeGreaterThanOrEqual(2);
  if (q.type === 'journal_entry') {
    expect(isBalanced(q.expected), `${at}: the entry does not balance`).toBe(true);
    for (const line of q.expected) {
      expect(() => resolveAccount(line.accountId), at).not.toThrow();
      expect(q.accountChoices, at).toContain(line.accountId);
    }
  } else if (q.type === 'mcq') {
    expect(q.options.length, at).toBeGreaterThanOrEqual(4);
    expect(new Set(q.options.map((o) => o.text)).size, `${at}: option texts are not unique`).toBe(q.options.length);
    for (const o of q.options.filter((x) => x.id !== q.correct)) {
      expect(typeof o.why === 'string' && o.why.trim().length > 0, `${at}: option "${o.text}" has no why`).toBe(true);
    }
  } else if (q.type === 'numeric') {
    checkNumericAnswer(q, at);
    expect(q.commonErrors.length, `${at}: needs at least two common errors`).toBeGreaterThanOrEqual(2);
    expect(q.working.length, `${at}: no working lines`).toBeGreaterThanOrEqual(1);
  } else if (q.type === 'journal_set') {
    // The long kinds pass the checks they pass on their own. A set of a case may be of any length a set may be (its
    // marks do not follow from its difficulty), and may leave its opening line to the case text.
    checkJournalSet(q, at, { entries: [MIN_SET_ENTRIES, MAX_SET_ENTRIES], what: 'a set', openingOptional: true });
  } else if (q.type === 'account' || q.type === 'statement') {
    checkFormat(q, at);
    expect(q.data, `${at}: the data of a format of a case is the case text`).toBe(q.context);
  } else {
    throw new Error(`${at}: a case made a ${q.type} question`);
  }
}

export function checkCase(c: CaseTemplate) {
  const registered = CASES.includes(c);
  // How many questions, and of which kinds: 4 to 8, or 2 to 5 with a long one among them; two kinds, or formats alone.
  expect(casePartsProblem(c.parts.map((p) => p.kind)), c.id).toBeNull();
  let rejected = 0;
  const contexts = new Set<string>();
  for (let seed = 1; seed <= SEEDS; seed++) {
    const at = `${c.id} seed ${seed}`;
    // Walk the attempts the engine would: a rejection is fine (and counted), a refused question is a fault.
    let built = buildCase(c, seed);
    if ('rejected' in built) rejected++;
    for (let attempt = 1; !('questions' in built) && attempt < MAX_ATTEMPTS; attempt++) {
      if ('invalid' in built) throw new Error(`${at}: ${built.invalid}`);
      built = buildCase(c, seed, attempt);
    }
    if (!('questions' in built)) throw new Error(`${at}: no valid case in ${MAX_ATTEMPTS} attempts`);
    const questions = built.questions;
    expect(generateCase(c, seed), `${at}: not deterministic`).toEqual(questions);

    const context = questions[0].context ?? '';
    expect(context.trim().length, `${at}: the case text is too short to be a case`).toBeGreaterThan(80);
    expect(context, `${at}: bad text in the case`).not.toMatch(/undefined|NaN|\[object/);
    contexts.add(context);
    questions.forEach((q, i) => {
      const where = `${at} question ${i + 1}`;
      expect(q.id, `${where}: the id must keep the seed asked for`).toBe(genId(c.parts[i], seed));
      expect(q.context, `${where}: every question carries the same case text`).toBe(context);
      expect({ topicId: q.topicId, conceptId: q.conceptId }, where).toEqual({ topicId: c.topicId, conceptId: c.conceptId });
      if (registered) expect(findQuestion(q.id), `${where}: the id does not regenerate the question`).toEqual(q);
      checkQuestion(q, where);
    });
    expect(new Set(questions.map((q) => q.prompt)).size, `${at}: two questions have the same prompt`).toBe(questions.length);
  }
  expect(rejected, `${c.id}: rejects ${rejected} of ${SEEDS} seeds on the first attempt`).toBeLessThan(SEEDS / 2);
  expect(contexts.size, `${c.id}: the case hardly changes from seed to seed`).toBeGreaterThan(SEEDS / 2);
}

/** How many files the harness is split into. */
export const CASE_PARTS_FILES = 4;

/** Registers the harness for part `part` (1 to CASE_PARTS_FILES) of the cases. A long chained case takes a few seconds. */
export function caseHarnessPart(part: number): void {
  CASES.forEach((c, i) => {
    if (i % CASE_PARTS_FILES !== part - 1) return;
    it(`${c.id} (${c.parts.length} questions) is valid over ${SEEDS} seeds`, { timeout: 30_000 }, () => checkCase(c));
  });
}
