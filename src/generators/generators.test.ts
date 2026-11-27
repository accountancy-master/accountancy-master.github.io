import { describe, expect, it } from 'vitest';
import { COURSES, PACKS, findQuestion } from '@/content/registry';
import type { JournalQuestion, McqQuestion, Question, TypedQuestion } from '@/content/types';
import { COMPANY_ACCOUNTS, resolveAccount } from '@/engine/accounts';
import { compareJournal } from '@/engine/compare';
import { creditor } from '@/engine/accounts';
import { checkAnswer } from '@/exercises/checkers';
import { EXERCISE_LOGIC, type Response } from '@/exercises/logic';
import { checkFormat, checkJournalSet, checkNumericAnswer } from '@/testing/questionChecks';
import { numericKey } from '@/exercises/numeric';
import { class12Templates } from '@/testing/class12Topic';
import { isBalanced } from '@/engine/journal';
import { formatINR } from '@/engine/money';
import { createRng } from '@/engine/rng';
import { MAX_ATTEMPTS, SET_ENTRIES, SET_TASK, generateFrom, setDateOrder } from './engine';
import { accountTemplate, crSide, drSide, journalSetTemplate, journalTemplate, amount, formatINR as inr, ledgerPeriods, setDays, statementTemplate } from './authoring';
import { TEMPLATES, buildInstance, generateQuestion, genId, getTemplate, parseGenId, type Template } from './index';

/** A generated question that must be a journal entry. */
function journalQuestion(templateId: string, seed: number): JournalQuestion {
  const q = generateQuestion(templateId, seed);
  if (q.type !== 'journal_entry') throw new Error(`${templateId} is not a journal template`);
  return q;
}

const SEEDS = 300;

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

function checkTemplate(t: Template) {
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

describe('generators', () => {
  it('has unique template ids', () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(16);
  });

  describe('every template belongs somewhere', () => {
    const topics = new Set(COURSES.flatMap((c) => c.topics.map((t) => t.id)));
    for (const t of TEMPLATES) {
      it(`${t.id} has a well-formed id, a topic of the course and a concept of that topic's pack`, () => {
        expect(t.id, 'ids are lower-case words joined by hyphens').toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
        expect(Number.isInteger(t.version) && t.version >= 1).toBe(true);
        expect(topics.has(t.topicId), `unknown topic ${t.topicId}`).toBe(true);
        const pack = PACKS.find((p) => p.topicId === t.topicId);
        expect(pack?.concepts.some((c) => c.id === t.conceptId), `concept ${t.conceptId} is not in the ${t.topicId} pack`).toBe(true);
      });
    }
  });

  // A journal template that states its entry directly (here a rectification with Suspense) passes the same harness.
  it('a direct-lines journal template is valid over the same seeds', () => {
    const t = journalTemplate({
      id: 'test-direct-lines',
      topicId: 'rectification-of-errors',
      conceptId: 'x',
      difficulty: 'medium',
      generate: (rng) => {
        const a = amount(rng, 1000, 9000, 500);
        const x = inr(a);
        if (rng.pick([true, false])) {
          return {
            prompt: `Rent of ${x} paid in cash was wrongly debited to Salaries A/c. Pass the rectifying entry.`,
            lines: [
              { accountId: 'rent', side: 'Dr', amount: a },
              { accountId: 'salaries', side: 'Cr', amount: a },
            ],
            explanation: ['Salaries A/c was debited by mistake, so it is credited.', 'Rent A/c should have been debited, so it is debited.'],
            distractorAccounts: ['cash', 'wages'],
          };
        }
        return {
          prompt: `The total of the Purchases Book, ${x}, was never posted. The difference in the trial balance was put to Suspense A/c. Pass the rectifying entry.`,
          lines: [
            { accountId: 'purchases', side: 'Dr', amount: a },
            { accountId: 'suspense', side: 'Cr', amount: a },
          ],
          explanation: ['Purchases A/c is short of the total, so it is debited.', 'Suspense A/c held the difference, so it is credited.'],
        };
      },
    });
    checkTemplate(t);
  });

  // The student works the amount out, so the prompt gives the base figures but never an amount of the entry.
  it('a computed journal template need not show an amount of the entry, and one that is not marked computed must', () => {
    const make = (computed: boolean | undefined) =>
      journalTemplate({
        id: 'test-computed',
        topicId: 'depreciation',
        conceptId: 'x',
        difficulty: 'medium',
        computed,
        generate: (rng) => {
          const cost = amount(rng, 100000, 900000, 10000);
          const charge = cost / 10;
          return {
            prompt: `Machinery costing ${inr(cost)} is depreciated at 10% a year. Pass the entry for the year's depreciation.`,
            lines: [
              { accountId: 'depreciation', side: 'Dr', amount: charge },
              { accountId: 'machinery', side: 'Cr', amount: charge },
            ],
            explanation: ['Depreciation is an expense, so it is debited.', 'The asset falls in value, so it is credited.'],
          };
        },
      });
    expect(() => checkTemplate(make(true))).not.toThrow();
    expect(() => checkTemplate(make(undefined))).toThrow();
  });

  // A set of entries passes the same harness, and the harness refuses what makes a set a poor one.
  describe('a set of journal entries', () => {
    const dr = (accountId: string, amt: number) => ({ accountId, side: 'Dr' as const, amount: amt });
    const cr = (accountId: string, amt: number) => ({ accountId, side: 'Cr' as const, amount: amt });
    type Shape = 'good' | 'two' | 'backwards' | 'repeated' | 'unbalanced' | 'bothSides' | 'paise' | 'labelled' | 'labelledRepeat';
    const make = (shape: Shape, difficulty: 'easy' | 'complex' = 'easy') =>
      journalSetTemplate({
        id: 'test-set',
        topicId: 'journal-entries',
        conceptId: 'x',
        difficulty,
        generate: (rng) => {
          const capital = amount(rng, 100000, 500000, 50000);
          const goods = amount(rng, 20000, 60000, 5000);
          const rent = amount(rng, 3000, 9000, 500);
          const [d1, d2, d3] = setDays(rng, 3, 1, 7);
          const bought = `Bought goods for ${inr(goods)} from Kiran on credit.`;
          const transactions = [
            {
              date: `${d1} April`,
              text: `Started the business with cash of ${inr(capital)}.`,
              lines: [dr('cash', capital), cr('capital', capital)],
              explanation: ['Cash comes in, so Cash A/c is debited.', 'It is capital, so Capital A/c is credited.'],
            },
            {
              date: `${shape === 'backwards' ? d3 : d2} April`,
              text: shape === 'repeated' ? `Paid rent of ${inr(rent)} in cash.` : bought,
              lines: [dr('purchases', goods + (shape === 'paise' ? 50 : 0)), cr('creditor:Kiran', shape === 'unbalanced' ? goods + 100 : goods + (shape === 'paise' ? 50 : 0))],
              explanation: ['Goods are bought, so Purchases A/c is debited.', 'Kiran is owed the price, so Kiran is credited.'],
            },
            {
              date: `${shape === 'backwards' ? d2 : d3} April`,
              text: `Paid rent of ${inr(rent)} in cash.`,
              lines: [dr(shape === 'bothSides' ? 'debtor:Kiran' : 'rent', rent), cr('cash', rent)],
              explanation: ['Rent is an expense, so Rent A/c is debited.', 'Cash goes out, so Cash A/c is credited.'],
            },
          ];
          const opening = 'Asha opened a bookshop in Pune in April. All payments in the first week were in cash.';
          // Items that are not dated transactions: a task of their own, and a label where the date would be.
          if (shape === 'labelled' || shape === 'labelledRepeat') {
            const labelled = transactions.map(({ text, lines, explanation }, i) => ({ label: `(${'abc'[i]})`, text: shape === 'labelledRepeat' ? transactions[0].text : text, lines, explanation }));
            return { task: 'Pass the entries for these three items.', opening, transactions: labelled };
          }
          return { opening, transactions: shape === 'two' ? transactions.slice(0, 2) : transactions };
        },
      });

    it('is valid over the same seeds: three to eight entries, each valid on its own, in date order', () => {
      checkTemplate(make('good'));
      const q = generateFrom(make('good'), 7);
      if (q.type !== 'journal_set') throw new Error('not a set');
      expect(q.entries).toHaveLength(3);
      expect(q.prompt.split('\n')).toEqual([SET_TASK, 'Asha opened a bookshop in Pune in April. All payments in the first week were in cash.']);
      expect(q.accountChoices).toEqual([...q.accountChoices].sort());
      expect(q.accountChoices).toEqual(expect.arrayContaining(['cash', 'bank', 'capital', 'purchases', 'creditor:Kiran', 'rent']));
    });

    it.each(['two', 'backwards', 'repeated', 'unbalanced', 'bothSides'] as const)('is refused when it is %s', (shape) => {
      expect(() => checkTemplate(make(shape))).toThrow();
    });

    it('may give a task of its own and labels in place of dates, and is then valid over the same seeds', () => {
      checkTemplate(make('labelled'));
      const q = generateFrom(make('labelled'), 7);
      if (q.type !== 'journal_set') throw new Error('not a set');
      expect(q.prompt.split('\n')[0]).toBe('Pass the entries for these three items.');
      expect(q.entries.map((e) => [e.label, e.date])).toEqual([['(a)', undefined], ['(b)', undefined], ['(c)', undefined]]);
      // The texts of labelled items must still differ.
      expect(() => checkTemplate(make('labelledRepeat'))).toThrow(/repeats the text/);
    });

    it('must keep to whole rupees, and to the number of transactions its difficulty calls for', () => {
      expect(() => checkTemplate(make('paise'))).toThrow(/whole rupees/);
      expect(() => checkTemplate(make('good', 'complex'))).toThrow(/complex set has 6 to 8/);
    });

    it('reads dates in order of time, with or without a year', () => {
      const order = (date: string) => setDateOrder(date)!;
      expect(order('5 April')).toBeLessThan(order('6 April'));
      expect(order('30 April')).toBeLessThan(order('1 May'));
      expect(order('31 December 2025')).toBeLessThan(order('1 January 2026'));
      for (const bad of ['April 5', '5th April', '0 April', '32 April', '5 Apr', '5 april', '']) expect(setDateOrder(bad), bad).toBeNull();
    });

    it('gives the days of a set in order, each once', () => {
      for (let seed = 1; seed <= 50; seed++) {
        const days = setDays(createRng(seed), 6, 1, 28);
        expect(days).toHaveLength(6);
        expect(new Set(days).size).toBe(6);
        expect(days).toEqual([...days].sort((a, b) => a - b));
        expect(days.every((d) => d >= 1 && d <= 28)).toBe(true);
      }
    });
  });

  // An account and a statement pass the same harness, and the engine refuses what cannot be right.
  describe('a format', () => {
    type Shape = 'good' | 'unequal' | 'paise' | 'twins' | 'noSpare' | 'blankLabel' | 'oneSide' | 'badText' | 'twoColumns';
    const account = (shape: Shape) =>
      accountTemplate({
        id: 'test-account',
        topicId: 'ledger',
        conceptId: 'x',
        difficulty: 'easy',
        generate: (rng) => {
          const bought = amount(rng, 20000, 60000, 1000);
          const paid = amount(rng, 5000, 15000, 1000);
          const back = amount(rng, 1000, 4000, 500) + (shape === 'paise' ? 50 : 0);
          const balance = bought - paid - back + (shape === 'unequal' ? 100000 : 0);
          const cash = { date: '18 April', label: shape === 'blankLabel' ? ' ' : 'Cash A/c', amount: paid };
          return {
            task: "Prepare Rao & Co.'s account for April and balance it.",
            data: `Asha Traders buys from Rao & Co. on credit.\n4 April: Bought goods for ${inr(bought)}.\n9 April: Returned goods of ${inr(back)}.\n18 April: Paid ${inr(paid)} in cash.${shape === 'badText' ? ' undefined' : ''}`,
            title: 'Rao & Co. A/c',
            ...(shape === 'twoColumns' ? { columns: ['Cash (₹)', 'Bank (₹)'] } : {}),
            left: drSide(
              shape === 'oneSide'
                ? []
                : [{ date: '9 April', label: 'Purchases Return A/c', amount: back }, cash, ...(shape === 'twins' ? [cash] : []), { date: '30 April', label: 'Balance c/d', amount: balance - (shape === 'twins' ? paid : 0), closing: true }],
            ),
            right: crSide([{ date: '4 April', label: 'Purchases A/c', amount: bought }], shape === 'oneSide' ? [] : [{ date: '1 May', label: 'Balance b/d', amount: balance }]),
            distractors: shape === 'noSpare' ? ['Cash A/c', 'Sales A/c'] : ['Rao & Co. A/c', 'Bank A/c', 'Sales A/c'],
            explanation: ['The purchase is credited.', 'The return and the payment are debited.', 'The balance is carried down on the debit side.'],
          };
        },
      });

    it('an account is valid over the same seeds, with its sides, its rows below the totals and its labels', () => {
      checkTemplate(account('good'));
      const q = generateFrom(account('good'), 7);
      if (q.type !== 'account') throw new Error('not an account');
      expect(q.prompt).toBe("Prepare Rao & Co.'s account for April and balance it.");
      expect(q.columns).toEqual(['Amount (₹)']);
      expect(q.sides.map((s) => [s.title, s.prefix, s.rows.length, s.below.length])).toEqual([['Dr', 'To', 3, 0], ['Cr', 'By', 1, 1]]);
      expect(q.sides[0].rows[2]).toMatchObject({ label: 'Balance c/d', closing: true, date: '30 April' });
      expect(q.labels).toEqual(['Balance b/d', 'Balance c/d', 'Bank A/c', 'Cash A/c', 'Purchases A/c', 'Purchases Return A/c', 'Rao & Co. A/c', 'Sales A/c']);
      expect(q.explanation).toBe(q.working.join(' '));
    });

    it.each([
      ['unequal', /do not agree/],
      ['paise', /whole number of rupees/],
      ['twins', /cannot be told apart/],
      ['noSpare', /no row uses/],
      ['oneSide', /has no rows|rows, not/],
      ['badText', /undefined/],
      ['twoColumns', /amounts for 2 amount columns/],
    ] as const)('an account is refused when it is %s', (shape, why) => {
      expect(() => checkTemplate(account(shape))).toThrow(why);
    });

    it('an account without the particulars of a row is a fault of the template', () => {
      expect(() => checkTemplate(account('blankLabel'))).toThrow(/no particulars/);
    });

    // An account kept over several periods, built from dated entries and the balancing dates.
    type Years = 'good' | 'four' | 'five' | 'tooLong' | 'lopsided' | 'sameTitles' | 'noBalanceLeft';
    const machinery = (shape: Years) =>
      accountTemplate({
        id: 'test-periods',
        topicId: 'depreciation',
        conceptId: 'x',
        difficulty: 'complex',
        generate: (rng) => {
          const cost = amount(rng, 100000, 400000, 50000);
          const charge = cost / 10;
          const years = shape === 'four' ? 4 : shape === 'five' ? 5 : 3;
          const supplier = creditor('Rao & Co.');
          const dr = (accountId: string, amt: number) => ({ accountId, side: 'Dr' as const, amount: amt });
          const cr = (accountId: string, amt: number) => ({ accountId, side: 'Cr' as const, amount: amt });
          const entries = [
            { date: '1 April 2023', lines: [dr('machinery', cost), cr('bank', cost)] },
            // The same charge every year: the same row in every period.
            ...Array.from({ length: years }, (_, y) => ({ date: `31 March ${2024 + y}`, lines: [dr('depreciation', charge), cr('machinery', charge)] })),
            // A year crowded with small additions, to go past the rows an account over several periods may have.
            ...(shape === 'tooLong' ? Array.from({ length: 18 }, (_, k) => ({ date: `${k + 2} May 2024`, lines: [dr('machinery', (k + 1) * 100000), cr(k % 2 ? 'cash' : supplier, (k + 1) * 100000)] })) : []),
            // Sold for what is left in the books at the end: nothing to carry down.
            ...(shape === 'noBalanceLeft' ? [{ date: '31 March 2026', lines: [dr('cash', cost - 3 * charge), cr('machinery', cost - 3 * charge)] }] : []),
          ];
          const closings = Array.from({ length: years }, (_, y) => ({
            closeOn: `31 March ${2024 + y}`,
            reopenOn: `1 April ${2024 + y}`,
            title: shape === 'sameTitles' ? 'A year' : `Year ended 31 March ${2024 + y}`,
          }));
          const sides = ledgerPeriods(entries, 'machinery', closings);
          return {
            task: `Prepare Machinery A/c for the ${years} years ended 31 March ${2023 + years} and bring the balance down.`,
            data: `Machinery was bought for ${inr(cost)} by cheque on 1 April 2023. Depreciation is ${inr(charge)} a year.`,
            title: 'Machinery A/c',
            ...sides,
            ...(shape === 'lopsided' ? { later: sides.later!.map((p, i) => (i === 0 ? { ...p, right: p.right.slice(0, 1) } : p)) } : {}),
            distractors: ['Machinery A/c', 'Depreciation on Machinery', 'Rent A/c'],
            explanation: ['The machinery is debited at cost.', 'Each year the depreciation is credited and the balance carried down.'],
          };
        },
      });

    it('an account kept over several periods is valid over the same seeds: each period balanced, the same row allowed in two periods', () => {
      checkTemplate(machinery('good'));
      checkTemplate(machinery('four'));
      const q = generateFrom(machinery('good'), 7);
      if (q.type !== 'account') throw new Error('not an account');
      expect(q.periodTitles).toEqual(['Year ended 31 March 2024', 'Year ended 31 March 2025', 'Year ended 31 March 2026']);
      expect(q.later).toHaveLength(2);
      // The first year: bought, depreciated, carried down. Each later year opens with the balance brought down.
      expect(q.sides.map((s) => s.rows.map((r) => r.label))).toEqual([['Bank A/c'], ['Depreciation A/c', 'Balance c/d']]);
      expect(q.later!.map(([left, right]) => [left.map((r) => r.label), right.map((r) => r.label)])).toEqual([
        [['Balance b/d'], ['Depreciation A/c', 'Balance c/d']],
        [['Balance b/d'], ['Depreciation A/c', 'Balance c/d']],
      ]);
      expect(q.later![0][0][0]).toMatchObject({ date: '1 April 2024', amounts: q.sides[1].rows[1].amounts });
      expect(q.later![0][1][0].amounts).toEqual(q.sides[1].rows[0].amounts);
      // The last balance is brought down below the totals, and the place for it is offered whatever the answer.
      expect(q.sides[0].below).toEqual([{ date: '1 April 2026', label: 'Balance b/d', amounts: q.later![1][1][1].amounts }]);
      expect(q.continued).toBe(true);
      const sold = generateFrom(machinery('noBalanceLeft'), 7);
      if (sold.type !== 'account') throw new Error('not an account');
      expect(sold.sides.flatMap((s) => s.below)).toEqual([]);
      expect(sold.continued).toBe(true);
    });

    it.each([
      ['five', /5 periods, not 4 at most/],
      ['tooLong', /rows over 3 periods, not 24 at most/],
      ['lopsided', /Year ended 31 March 2025, the two sides do not agree/],
      ['sameTitles', /two periods have the same title/],
    ] as const)('an account over several periods is refused when it is %s', (shape, why) => {
      expect(() => checkTemplate(machinery(shape))).toThrow(why);
    });

    it('an account says when its task asks for the balance to be brought down, and a row may carry a reference', () => {
      const t = accountTemplate({
        id: 'test-suspense',
        topicId: 'rectification-of-errors',
        conceptId: 'x',
        difficulty: 'medium',
        generate: (rng) => {
          const a = amount(rng, 1000, 9000, 500);
          const b = amount(rng, 10000, 20000, 1000);
          return {
            task: 'Prepare Suspense A/c and bring down the balance, if any.',
            data: `The trial balance was short by ${inr(a + b)} on the debit side.\n(a) Sales Book undercast by ${inr(a)}.\n(b) ${inr(b)} received from Mohan was not posted to Mohan A/c.`,
            title: 'Suspense A/c',
            left: drSide([{ label: 'Difference in trial balance', amount: a + b }]),
            right: crSide([
              { label: 'Sales A/c', amount: a, ref: '(a)' },
              { label: 'Mohan A/c', amount: b, ref: '(b)' },
            ]),
            broughtDown: true,
            distractors: ['Balance b/d', 'Balance c/d', 'Purchases A/c'],
            explanation: ['The two errors explain the whole difference.', 'No balance is left.'],
          };
        },
      });
      checkTemplate(t);
      const q = generateFrom(t, 3);
      if (q.type !== 'account') throw new Error('not an account');
      // No balance is left, and the place for one is offered all the same: the screen does not say which it is.
      expect(q.continued).toBe(true);
      expect(q.sides.flatMap((s) => s.below)).toEqual([]);
      expect(q.sides[1].rows.map((r) => r.ref)).toEqual(['(a)', '(b)']);
    });

    // A row that is as right under other wording: `also`. The opening difference of a Suspense A/c may be "Balance b/d".
    type Wording = 'good' | 'twin' | 'twinWording' | 'noSpare' | 'blank';
    const reworded = (shape: Wording) =>
      accountTemplate({
        id: 'test-other-wording',
        topicId: 'rectification-of-errors',
        conceptId: 'x',
        difficulty: 'medium',
        generate: (rng) => {
          const sales = amount(rng, 1000, 9000, 500);
          const open = amount(rng, 10000, 20000, 1000);
          const opening = { date: '31 March', label: 'Difference in trial balance', also: shape === 'blank' ? ['Balance b/d', ' '] : ['Balance b/d'], amount: open };
          // A second row of the debit side for the same amount: called "Balance b/d", or as right under that name.
          const twin = shape === 'twin' ? [{ label: 'Balance b/d', amount: open }] : shape === 'twinWording' ? [{ label: 'Purchases A/c', also: ['Balance b/d'], amount: open }] : [];
          return {
            task: 'Prepare Suspense A/c. If a balance is left, carry it down and bring it down.',
            data: `The trial balance was short by ${inr(open)} on the debit side.\n(a) The Sales Book was overcast by ${inr(sales)}.\n(b) ${inr(sales)} received from Mohan was not posted to his account.`,
            title: 'Suspense A/c',
            // The balance that is left is as large as the difference: the same name and amount, in a list of its own.
            left: drSide([opening, ...twin, { label: 'Sales A/c', amount: sales, ref: '(a)' }], [{ label: 'Balance b/d', amount: open }]),
            right: crSide([{ label: 'Mohan A/c', amount: sales + twin.length * open, ref: '(b)' }, { label: 'Balance c/d', amount: open, closing: true }]),
            broughtDown: true,
            distractors: shape === 'noSpare' ? ['Balance b/d', 'Suspense A/c'] : ['Suspense A/c', 'Capital A/c'],
            explanation: ['The two errors leave the opening difference in the account.', 'It is carried down and brought down.'],
          };
        },
      });

    it('an account may give a row other wordings: they are offered with the labels, and the row is right under any of them', () => {
      checkTemplate(reworded('good'));
      const q = generateFrom(reworded('good'), 7);
      if (q.type !== 'account') throw new Error('not an account');
      expect(q.sides[0].rows[0]).toMatchObject({ label: 'Difference in trial balance', also: ['Balance b/d'] });
      expect([...q.sides[0].rows.slice(1), ...q.sides[1].rows, ...q.sides[0].below].every((r) => r.also === undefined)).toBe(true);
      expect(q.labels).toEqual(['Balance b/d', 'Balance c/d', 'Capital A/c', 'Difference in trial balance', 'Mohan A/c', 'Sales A/c', 'Suspense A/c']);
      // The same name and the same amount stand above and below the totals: two lists, so two rows that can be told apart.
      expect(q.sides[0].below[0]).toEqual({ label: 'Balance b/d', amounts: q.sides[0].rows[0].amounts });
      const right = EXERCISE_LOGIC.account.e2eExpected(q) as Extract<Response, { type: 'account' }>;
      const other = { ...right, type: 'account' as const, sides: [right.sides[0].map((r, i) => (i === 0 ? { ...r, label: 'Balance b/d' } : r)), right.sides[1]] as typeof right.sides };
      expect(checkAnswer(q, other)).toMatchObject({ correct: true, parts: { right: 5, total: 5 } });
    });

    it.each([
      ['twin', /two rows "Balance b\/d" with the same amounts cannot be told apart/],
      ['twinWording', /two rows "Balance b\/d" with the same amounts cannot be told apart/],
      ['noSpare', /only 1 labels on offer that no row uses/],
      ['blank', /empty other wording/],
    ] as const)('an account with other wordings is refused when it is %s', (shape, why) => {
      expect(() => checkTemplate(reworded(shape))).toThrow(why);
    });

    type Kind = 'good' | 'unequal' | 'final' | 'badFinal' | 'agreeAndFinal' | 'oneColumnAgree' | 'choice' | 'noChoice' | 'four' | 'five' | 'threeAgree';
    const statement = (kind: Kind) =>
      statementTemplate({
        id: 'test-statement',
        topicId: 'trial-balance',
        conceptId: 'x',
        difficulty: 'easy',
        generate: (rng) => {
          const cash = amount(rng, 5000, 30000, 1000);
          const rent = amount(rng, 2000, 9000, 500);
          const final = kind === 'final' || kind === 'badFinal' || kind === 'agreeAndFinal' || kind === 'choice' || kind === 'noChoice';
          // A book with several amount columns: the value, the tax and the total of each invoice.
          if (kind === 'four' || kind === 'five' || kind === 'threeAgree') {
            const names = ['Taxable value (₹)', 'CGST (₹)', 'SGST (₹)', 'Total (₹)', 'Paid (₹)'].slice(0, kind === 'five' ? 5 : kind === 'four' ? 4 : 3);
            const invoice = (label: string, value: number) => ({ label, amounts: [value, value / 20, value / 20, value + value / 10, value].slice(0, names.length) });
            return {
              task: 'Prepare the Purchases Book for April.',
              data: `Three invoices were received in April, each with CGST and SGST at 5% each: ${inr(cash)}, ${inr(rent * 2)} and ${inr(cash + rent)}.`,
              title: 'Purchases Book',
              columns: names,
              totalsAgree: kind === 'threeAgree',
              rows: [invoice('Rao & Co.', cash), invoice('Meena Suppliers', rent * 2), invoice('Patel Brothers', cash + rent)],
              distractors: ['Sundaram & Co.', 'Bhatia Wholesalers'],
              explanation: ['Each invoice is entered with its value, its tax and its total.'],
            };
          }
          return {
            task: 'Prepare the Trial Balance of Ravi Textiles as on 31 March 2026.',
            data: `These balances were taken from the ledger of Ravi Textiles:\nCash in hand: ${inr(cash)}\nRent paid: ${inr(rent)}\nCapital: ${inr(cash + rent)}`,
            title: 'Trial Balance of Ravi Textiles as on 31 March 2026',
            heading: 'Name of account',
            columns: kind === 'oneColumnAgree' ? ['Amount (₹)'] : ['Debit (₹)', 'Credit (₹)'],
            totalsAgree: !final || kind === 'agreeAndFinal',
            rows:
              kind === 'oneColumnAgree'
                ? [{ label: 'Cash in hand', amount: cash }, { label: 'Rent paid', amount: rent }, { label: 'Capital', amount: cash + rent }]
                : [
                    { label: 'Cash in hand', amounts: [cash, 0] },
                    { label: 'Rent paid', amounts: [rent, null] },
                    { label: 'Capital', amounts: [0, cash + rent - (final ? rent : 0) + (kind === 'unequal' ? 10000 : 0)] },
                  ],
            ...(final
              ? {
                  final: {
                    label: 'Debits over credits',
                    amount: rent + (kind === 'badFinal' ? 10000 : 0),
                    ...(kind === 'choice' ? { alternatives: ['Credits over debits', 'Debits over credits'] } : kind === 'noChoice' ? { alternatives: ['Debits over credits'] } : {}),
                  },
                }
              : {}),
            distractors: ['Closing stock', 'Suspense A/c'],
            explanation: ['Cash is an asset and rent an expense: both are debit balances.', 'Capital is a credit balance.'],
          };
        },
      });

    it('a statement is valid over the same seeds, with totals that agree or a final figure', () => {
      checkTemplate(statement('good'));
      checkTemplate(statement('final'));
      const q = generateFrom(statement('good'), 7);
      if (q.type !== 'statement') throw new Error('not a statement');
      expect(q.heading).toBe('Name of account');
      expect(q.totalsAgree).toBe(true);
      // A column left blank (0 or null) is 0.
      expect(q.rows[1].amounts[1]).toBe(0);
      const ends = generateFrom(statement('final'), 7);
      if (ends.type !== 'statement') throw new Error('not a statement');
      expect(ends.final).toEqual({ label: 'Debits over credits', amount: ends.final!.amount });
      expect(ends.totalsAgree).toBeUndefined();
    });

    it('a statement may leave the name of its final figure to the student, and may have up to four amount columns', () => {
      checkTemplate(statement('choice'));
      const q = generateFrom(statement('choice'), 7);
      if (q.type !== 'statement') throw new Error('not a statement');
      // The right name among the others, sorted, each once.
      expect(q.final?.options).toEqual(['Credits over debits', 'Debits over credits']);
      checkTemplate(statement('four'));
      const book = generateFrom(statement('four'), 7);
      if (book.type !== 'statement') throw new Error('not a statement');
      expect(book.columns).toHaveLength(4);
      expect(book.rows.every((r) => r.amounts.length === 4)).toBe(true);
    });

    it.each([
      ['unequal', /two columns do not agree/],
      ['badFinal', /not the difference of the two columns/],
      ['agreeAndFinal', /ends on no final figure/],
      ['oneColumnAgree', /two amount columns/],
      ['threeAgree', /two amount columns/],
      ['five', /5 amount columns, not 1 to 4/],
      ['noChoice', /no alternative label that differs/],
    ] as const)('a statement is refused when it is %s', (kind, why) => {
      expect(() => checkTemplate(statement(kind))).toThrow(why);
    });
  });

  it('round-trips a generated id', () => {
    const t = getTemplate('je-capital');
    expect(parseGenId(genId(t, 99))).toEqual({ templateId: 'je-capital', version: t.version, seed: 99 });
    expect(parseGenId('je-q-001')).toBeNull();
  });

  it('throws for an unknown template', () => {
    expect(() => getTemplate('nope')).toThrow('Unknown template: nope');
  });

  // The one harness that gates all content: every template, of every kind, over the same seeds.
  // The whole Cash Flow Statements build two balance sheets and the statement, and verify it again from the data, for
  // each of the 300 seeds: about 2.5 s each on their own and near the 5 s a test is given when the whole suite runs at
  // once. They get longer, as the case studies do (cases.test.ts).
  const SLOW = new Set(['cf-fmt-statement', 'cf-fmt-statement-notes', 'cf-fmt-statement-investments', 'cf-fmt-statement-loss']);
  for (const template of TEMPLATES) {
    it(`${template.id} (${template.kind}) is valid over ${SEEDS} seeds`, SLOW.has(template.id) ? { timeout: 30_000 } : {}, () => checkTemplate(template));
  }

  for (const id of ['je-payment-discount', 'je-receipt-discount']) {
    it(`${id} prompt states both the settled amount and the amount outstanding`, () => {
      for (let seed = 1; seed <= 300; seed++) {
        const q = journalQuestion(id, seed);
        const money = q.expected.find((l) => l.accountId === 'cash' || l.accountId === 'bank')!;
        const party = q.expected.find((l) => l.accountId.startsWith('creditor:') || l.accountId.startsWith('debtor:'))!;
        expect(q.prompt, `seed ${seed}`).toContain(formatINR(money.amount));
        expect(q.prompt, `seed ${seed}`).toContain(formatINR(party.amount));
      }
    });
  }

  it('pins je-gst-sale seed 2 so seeded output stays stable', () => {
    const q = journalQuestion('je-gst-sale', 2);
    expect(q.prompt).toBe(
      'Sold goods for ₹60,000 (before GST), plus CGST @ 2.5% and SGST @ 2.5%, and received a cheque for the full invoice amount.',
    );
    expect(q.expected).toEqual([
      { accountId: 'bank', side: 'Dr', amount: 6300000 },
      { accountId: 'sales', side: 'Cr', amount: 6000000 },
      { accountId: 'outputCGST', side: 'Cr', amount: 150000 },
      { accountId: 'outputSGST', side: 'Cr', amount: 150000 },
    ]);
  });

  it('pins je-trade-discount seed 1 so seeded output stays stable', () => {
    const q = journalQuestion('je-trade-discount', 1);
    expect(q.prompt).toBe(
      'Purchased goods of list price ₹70,000 from Lakshmi Stores on credit at 10% trade discount. GST is charged on the price after trade discount: IGST @ 18%.',
    );
    expect(q.expected).toEqual([
      { accountId: 'purchases', side: 'Dr', amount: 6300000 },
      { accountId: 'inputIGST', side: 'Dr', amount: 1134000 },
      { accountId: 'creditor:Lakshmi Stores', side: 'Cr', amount: 7434000 },
    ]);
  });

  for (const id of ['je-gst-purchase', 'je-gst-sale', 'je-trade-discount']) {
    it(`${id} prompt states each tax and a rate that matches the entry`, () => {
      for (let seed = 1; seed <= 300; seed++) {
        const q = journalQuestion(id, seed);
        const base = q.expected.find((l) => l.accountId === 'purchases' || l.accountId === 'sales')!;
        for (const tax of ['CGST', 'SGST', 'IGST']) {
          const taxLine = q.expected.find((l) => l.accountId.endsWith(tax));
          const m = new RegExp(`${tax} @ (\\d+(?:\\.\\d+)?)%`).exec(q.prompt);
          expect(m !== null, `seed ${seed} ${tax}: ${q.prompt}`).toBe(taxLine !== undefined);
          if (taxLine && m) {
            expect(Math.round((base.amount * Number(m[1])) / 100), `seed ${seed} ${tax}: ${q.prompt}`).toBe(
              taxLine.amount,
            );
          }
        }
      }
    });
  }

  it('rejects a seed that is not a non-negative safe integer', () => {
    for (const bad of [-5, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => generateQuestion('je-capital', bad)).toThrow(`Invalid seed: ${bad}`);
    }
    expect(() => generateQuestion('je-capital', 0)).not.toThrow();
  });

  it('parseGenId returns null for a seed outside the safe integer range', () => {
    expect(parseGenId('gen:je-capital:1:99999999999999999999')).toBeNull();
    expect(parseGenId('gen:je-capital:1:9007199254740992')).toBeNull();
    expect(parseGenId('gen:je-capital:1:9007199254740991')).not.toBeNull();
  });
});

// The kinds Class 12 adds (a ratio answer, a "times" answer, an entry with a partner's accounts, accounts in columns,
// statements in parts with percentages and negative figures) pass the harness every template passes. The real
// Class 12 topics are checked as they get templates; until then a sample of each kind stands in for them.
describe('the kinds of question Class 12 adds', () => {
  for (const t of class12Templates('partnership-fundamentals')) {
    it(`${t.id} (${t.kind}${t.kind === 'numeric' ? `, ${t.unit}` : ''}) passes the harness`, () => checkTemplate(t));
  }

  it('offer an entry of a firm the accounts of a firm, and never those of a company', () => {
    const t = class12Templates('partnership-fundamentals').find((x) => x.id === 's12-capital-brought')!;
    const company = new Set(COMPANY_ACCOUNTS.map((a) => a.id));
    for (let seed = 1; seed <= 60; seed++) {
      const q = generateFrom(t, seed);
      if (q.type !== 'journal_entry') throw new Error('not an entry');
      expect(q.accountChoices.some((id) => company.has(id)), `seed ${seed}`).toBe(false);
      expect(q.accountChoices.filter((id) => id.includes(':')).length, `seed ${seed}`).toBe(3);
      // The names a picker shows are all different: a partner's capital, current and loan accounts are three names.
      const names = q.accountChoices.map((id) => resolveAccount(id).name);
      expect(new Set(names).size, `seed ${seed}`).toBe(names.length);
    }
  });
});
