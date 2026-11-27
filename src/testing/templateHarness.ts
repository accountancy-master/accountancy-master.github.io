import { expect, it } from 'vitest';
import { findQuestion } from '@/content/registry';
import type { JournalQuestion, McqQuestion, Question, TypedQuestion } from '@/content/types';
import { resolveAccount } from '@/engine/accounts';
import { compareJournal } from '@/engine/compare';

import { checkFormat, checkJournalSet, checkNumericAnswer } from '@/testing/questionChecks';
import { numericKey } from '@/exercises/numeric';
import { isBalanced } from '@/engine/journal';
import { formatINR } from '@/engine/money';
import { MAX_ATTEMPTS, SET_ENTRIES, generateFrom } from '@/generators/engine';
import { TEMPLATES, buildInstance, genId, type Template } from '@/generators/index';

// The harness that gates all content: every template, of every kind, over the same seeds. It is split into parts
// (src/generators/harness/templates-*.test.ts), one file each, because a test file runs on one worker: in one file the
// harness took five minutes, in parts it takes a fraction of that on a machine with several cores.

export const SEEDS = 300;

// The checks every template of every kind must pass. A failure names the template and the seed.
function checkJournal(t: Template, q: JournalQuestion, at: string) {
  expect(isBalanced(q.expected), at).toBe(true);
  for (const line of q.expected) {
    expect(Number.isInteger(line.amount) && line.amount > 0, at).toBe(true);
    expect(() => resolveAccount(line.accountId), at).not.toThrow();
    expect(q.accountChoices, at).toContain(line.accountId);
  }
  expect(compareJournal(q.expected, q.expected).correct, at).toBe(true);
  // The prompt must be tied to the entry it builds.
  if (t.id === 'je-trade-discount') {
    const purchases = q.expected.find((l) => l.accountId === 'purchases')!;
    expect(q.prompt, at).toContain('after trade discount');
    expect(q.prompt, at).not.toContain(formatINR(purchases.amount));
  } else if (!(t.kind === 'journal' && t.computed)) {
    // A template marked `computed` leaves the amount for the student to work out.
    expect(q.expected.some((l) => q.prompt.includes(formatINR(l.amount))), `${at}: ${q.prompt}`).toBe(true);
  }
}

function checkMcq(q: McqQuestion, at: string) {
  expect(q.options.length, at).toBeGreaterThanOrEqual(4);
  expect(new Set(q.options.map((o) => o.text)).size, `${at}: option texts are not unique`).toBe(q.options.length);
  expect(new Set(q.options.map((o) => o.id)).size, `${at}: option ids are not unique`).toBe(q.options.length);
  expect(q.options.filter((o) => o.id === q.correct), `${at}: not exactly one correct option`).toHaveLength(1);
  const correctText = q.options.find((o) => o.id === q.correct)!.text;
  for (const o of q.options.filter((x) => x.id !== q.correct)) {
    expect(o.text, `${at}: a distractor equals the correct text`).not.toBe(correctText);
    expect(typeof o.why === 'string' && o.why.trim().length > 0, `${at}: distractor "${o.text}" has no why`).toBe(true);
  }
}

function checkNumeric(q: TypedQuestion, at: string) {
  // One positive integer in the unit (paise, a number, hundredths of a percent or of "times"), or a ratio of two to
  // four whole numbers in lowest terms with wrong ratios of as many terms: see checkNumericAnswer.
  checkNumericAnswer(q, at);
  expect(q.commonErrors.length, `${at}: needs at least two common errors`).toBeGreaterThanOrEqual(2);
  const values = q.commonErrors.map((e) => numericKey(e.value));
  expect(values, `${at}: a common error equals the answer`).not.toContain(numericKey(q.answer));
  expect(new Set(values).size, `${at}: common errors repeat a value`).toBe(values.length);
  for (const e of q.commonErrors) expect(e.why.trim().length > 0, `${at}: common error ${e.value} has no why`).toBe(true);
  expect(q.working.length, `${at}: no working lines`).toBeGreaterThanOrEqual(1);
}

export function checkTemplate(t: Template) {
  const registered = TEMPLATES.includes(t);
  let rejected = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const at = `${t.id} seed ${seed}`;
    // Walk the attempts the engine would: a rejection is fine (and counted), an invalid instance is a fault.
    let built = buildInstance(t, seed);
    if ('rejected' in built) rejected++;
    for (let attempt = 1; !('question' in built) && attempt < MAX_ATTEMPTS; attempt++) {
      if ('invalid' in built) throw new Error(`${at}: ${built.invalid}`);
      built = buildInstance(t, seed, attempt);
    }
    if (!('question' in built)) throw new Error(`${at}: no valid question in ${MAX_ATTEMPTS} attempts`);
    const q: Question = built.question;
    expect(generateFrom(t, seed), `${at}: not deterministic`).toEqual(q);
    expect(q.id, `${at}: the id must keep the seed asked for`).toBe(genId(t, seed));
    if (registered) expect(findQuestion(q.id), `${at}: the id does not regenerate the question`).toEqual(q);
    expect(q.prompt.trim().length, `${at}: empty prompt`).toBeGreaterThan(10);
    expect(q.prompt, `${at}: bad text in the prompt`).not.toMatch(/undefined|NaN/);
    expect(q.hints.length, `${at}: needs at least two hints`).toBeGreaterThanOrEqual(2);
    if (q.type === 'journal_entry') checkJournal(t, q, at);
    else if (q.type === 'journal_set') checkJournalSet(q, at, { entries: SET_ENTRIES[t.difficulty], what: `a ${t.difficulty} set` });
    else if (q.type === 'account' || q.type === 'statement') checkFormat(q, at);
    else if (q.type === 'mcq') checkMcq(q, at);
    else if (q.type === 'numeric') checkNumeric(q, at);
    else throw new Error(`${at}: a template made a ${q.type} question`);
  }
  expect(rejected, `${t.id}: rejects ${rejected} of ${SEEDS} seeds on the first attempt`).toBeLessThan(SEEDS / 2);
}

/** How many files the harness is split into. */
export const TEMPLATE_PARTS = 12;

// The whole Cash Flow Statements build two balance sheets and the statement, and verify it again from the data, for
// each of the 300 seeds: about 2.5 s each on their own, longer on a busy machine.
const SLOW = new Set(['cf-fmt-statement', 'cf-fmt-statement-notes', 'cf-fmt-statement-investments', 'cf-fmt-statement-loss']);

/** Registers the harness for part `part` (1 to TEMPLATE_PARTS) of the templates: every TEMPLATE_PARTS-th one. */
export function templateHarnessPart(part: number): void {
  TEMPLATES.forEach((template, i) => {
    if (i % TEMPLATE_PARTS !== part - 1) return;
    it(`${template.id} (${template.kind}) is valid over ${SEEDS} seeds`, SLOW.has(template.id) ? { timeout: 30_000 } : {}, () => checkTemplate(template));
  });
}
