import { describe, expect, it } from 'vitest';
import { COURSES } from '@/content/registry';

import { post, trialBalance } from '@/engine/books';
import { type JournalLine } from '@/engine/journal';
import { checkFormat } from '@/testing/questionChecks';
import { SAMPLE_CHAIN } from '@/testing/sampleCase';
import { amount, caseTemplate, crSide, drSide, formatINR, ledgerPeriods, type CasePart } from './authoring';
import { CASE_PARTS, CHAINED_CASE_PARTS, casePartsProblem, generateCase } from './engine';
import {
  CASES,
  CASE_STAGES,
  TEMPLATES,
  buildCase,
  casePartId,
  findTemplate,
  generateCaseQuestions,
  generateQuestion,
  parseCasePartId,
  parseGenId,
} from './index';
import { checkCase } from '@/testing/caseHarness';
const dr = (accountId: string, value: number): JournalLine => ({ accountId, side: 'Dr', amount: value });
const cr = (accountId: string, value: number): JournalLine => ({ accountId, side: 'Cr', amount: value });

/** A small but complete case, as a worked example and to test the engine: a week of a new shop. */
const sample = caseTemplate({
  id: 'test-case-week',
  topicId: 'trial-balance',
  conceptId: 'tb-case',
  difficulty: 'easy',
  title: 'The first week of a shop',
  setup: (rng) => {
    const capital = amount(rng, 200000, 500000, 50000);
    const goods = amount(rng, 40000, 90000, 5000);
    const sale = amount(rng, 20000, 60000, 5000);
    const rent = amount(rng, 4000, 9000, 1000);
    if (sale >= goods) return null;
    const owner = rng.pick(['Meena', 'Arjun', 'Fatima']);
    const entries = [
      [dr('cash', capital), cr('capital', capital)],
      [dr('purchases', goods), cr('cash', goods)],
      [dr('cash', sale), cr('sales', sale)],
      [dr('rent', rent), cr('cash', rent)],
    ];
    return { owner, capital, goods, sale, rent, entries, ledger: post(entries) };
  },
  context: (s) =>
    [
      `${s.owner} opened a stationery shop on 1 April.`,
      `1 April: Started business with cash ${formatINR(s.capital)}.`,
      `2 April: Bought goods for cash ${formatINR(s.goods)}.`,
      `5 April: Sold goods for cash ${formatINR(s.sale)}.`,
      `7 April: Paid rent ${formatINR(s.rent)} in cash.`,
    ].join('\n'),
  parts: [
    {
      kind: 'journal',
      make: (s) => ({
        prompt: 'Pass the journal entry for the transaction of 2 April.',
        lines: s.entries[1],
        explanation: ['Goods bought for resale are purchases, an expense, so Purchases A/c is debited.', 'Cash goes out, so Cash A/c is credited.'],
      }),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => ({
        prompt: 'What is the balance of Cash A/c at the end of 7 April?',
        answer: s.ledger.get('cash')!,
        commonErrors: [
          { value: s.capital - s.goods - s.rent, why: 'Left out the cash received from the sale.' },
          { value: s.capital - s.goods + s.sale, why: 'Left out the rent paid.' },
        ],
        explanation: [
          `Receipts: ${formatINR(s.capital)} + ${formatINR(s.sale)} = ${formatINR(s.capital + s.sale)}.`,
          `Payments: ${formatINR(s.goods)} + ${formatINR(s.rent)} = ${formatINR(s.goods + s.rent)}.`,
          `Balance = ${formatINR(s.capital + s.sale - s.goods - s.rent)} (debit).`,
        ],
      }),
      verify: (q) => q.answer > 0,
    },
    {
      kind: 'mcq',
      make: () => ({
        prompt: 'In the trial balance on 7 April, which of these balances goes in the credit column?',
        correct: 'Sales A/c',
        distractors: [
          { text: 'Purchases A/c', why: 'Purchases are an expense, which has a debit balance.' },
          { text: 'Rent A/c', why: 'Rent paid is an expense, which has a debit balance.' },
          { text: 'Cash A/c', why: 'Cash is an asset, which has a debit balance.' },
        ],
        explanation: 'Sales are an income, and incomes have credit balances.',
      }),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => ({
        prompt: 'What is the total of the debit column of the trial balance on 7 April?',
        answer: trialBalance(s.ledger).debitTotal,
        commonErrors: [
          { value: s.capital, why: 'Took only the capital, forgetting that sales also have a credit balance.' },
          { value: s.capital + s.sale + s.goods + s.rent, why: 'Added the balances of both columns together.' },
        ],
        explanation: [
          `Debit balances: Cash ${formatINR(s.ledger.get('cash')!)}, Purchases ${formatINR(s.goods)}, Rent ${formatINR(s.rent)}.`,
          `Total = ${formatINR(trialBalance(s.ledger).debitTotal)}, the same as Capital + Sales.`,
        ],
      }),
    },
  ],
});

describe('case studies', () => {
  it('a case sets one scenario up and makes every question from it', () => {
    const questions = generateCase(sample, 7);
    expect(questions.map((q) => q.type)).toEqual(['journal_entry', 'numeric', 'mcq', 'numeric']);
    expect(questions.map((q) => q.id)).toEqual([1, 2, 3, 4].map((n) => `gen:test-case-week~${n}:1:7`));
    expect(new Set(questions.map((q) => q.context)).size).toBe(1);
    expect(questions[0].context).toMatch(/opened a stationery shop on 1 April\.\n1 April: Started business with cash ₹/);
    // The cash balance asked for is the one the entries of the same scenario give.
    const entry = questions[0];
    const cash = questions[1];
    if (entry.type !== 'journal_entry' || cash.type !== 'numeric' || cash.unit === 'ratio') throw new Error('unexpected kinds');
    expect(questions[0].context).toContain(formatINR(entry.expected[0].amount));
    expect(cash.working.at(-1)).toContain(formatINR(cash.answer));
  });

  it('passes the harness, and a rejected seed moves every question to the same next attempt', () => {
    checkCase(sample);
    for (let seed = 1; seed <= 40; seed++) {
      const first = buildCase(sample, seed);
      if ('questions' in first) continue;
      expect(first).toEqual({ rejected: true });
      const questions = generateCase(sample, seed);
      expect(new Set(questions.map((q) => q.context)).size, `seed ${seed}`).toBe(1);
      expect(questions.every((q) => parseGenId(q.id)?.seed === seed), `seed ${seed}`).toBe(true);
    }
  });

  it('says how many questions a case may have, and of which kinds', () => {
    expect([CASE_PARTS, CHAINED_CASE_PARTS]).toEqual([[4, 8], [2, 5]]);
    const short = ['journal', 'numeric', 'mcq', 'numeric'] as const;
    expect(casePartsProblem(short)).toBeNull();
    expect(casePartsProblem(short.slice(0, 3))).toBe('3 questions, not 4 to 8');
    expect(casePartsProblem([...short, ...short, 'mcq'])).toBe('9 questions, not 4 to 8');
    expect(casePartsProblem(['numeric', 'numeric', 'numeric', 'numeric'])).toMatch(/of one kind/);
    // A long question among them: fewer questions, each of them longer.
    expect(casePartsProblem(['journal_set', 'account', 'statement'])).toBeNull();
    expect(casePartsProblem(['numeric', 'account'])).toBeNull();
    expect(casePartsProblem(['account', 'numeric', 'mcq', 'numeric', 'mcq'])).toBeNull();
    expect(casePartsProblem(['account'])).toBe('1 questions, not 2 to 5 for a case with a set of entries or a format');
    expect(casePartsProblem(['account', 'numeric', 'mcq', 'numeric', 'mcq', 'journal'])).toMatch(/^6 questions, not 2 to 5/);
    // Formats alone may make a case (the three final accounts are three accounts); sets alone may not.
    expect(casePartsProblem(['account', 'account', 'account'])).toBeNull();
    expect(casePartsProblem(['account', 'statement'])).toBeNull();
    expect(casePartsProblem(['journal_set', 'journal_set'])).toMatch(/of one kind/);
  });

  describe('a chained case: a set of entries, an account and a statement on one scenario', () => {
    const questions = generateCase(SAMPLE_CHAIN, 7);
    const [set, account, statement] = questions;

    it('builds each part with the builder of its kind, under the id of a question of a case', () => {
      expect(questions.map((q) => q.type)).toEqual(['journal_set', 'account', 'statement']);
      expect(questions.map((q) => q.id)).toEqual([1, 2, 3].map((n) => `gen:case-sample-chain~${n}:1:7`));
      expect(SAMPLE_CHAIN.parts.map((p) => [p.kind, p.id])).toEqual([['journal_set', 'case-sample-chain~1'], ['account', 'case-sample-chain~2'], ['statement', 'case-sample-chain~3']]);
      if (set.type !== 'journal_set' || account.type !== 'account' || statement.type !== 'statement') throw new Error('unexpected kinds');
      expect(set.entries).toHaveLength(5);
      expect(set.accountChoices).toEqual(expect.arrayContaining(['cash', 'bank', 'capital', 'purchases', 'sales']));
      expect(account.sides.map((s) => [s.title, s.prefix])).toEqual([['Dr', 'To'], ['Cr', 'By']]);
      expect(account.sides[1].rows.at(-1)).toMatchObject({ label: 'Balance c/d', closing: true });
      expect(statement.totalsAgree).toBe(true);
      expect(statement.labels).toEqual(expect.arrayContaining(['Cash A/c', 'Closing stock', 'Suspense A/c']));
    });

    it('gives every part the case text, which is the data of a format and is given once', () => {
      const context = set.context!;
      expect(context.split('\n')).toHaveLength(6);
      expect(questions.map((q) => q.context)).toEqual([context, context, context]);
      if (set.type !== 'journal_set' || account.type !== 'account' || statement.type !== 'statement') throw new Error('unexpected kinds');
      expect([account.data, statement.data]).toEqual([context, context]);
      // The prompt of a format is its task; a set of a case may be its task alone, without an opening line.
      expect(set.prompt).toBe('Journalise the transactions of the week.');
      expect(account.prompt).toBe('Prepare Cash A/c for the week and balance it on 7 April.');
      // The amounts are in the case, not beside the entries they belong to.
      for (const entry of set.entries) expect(entry.text).not.toMatch(/₹/);
      for (const line of set.entries[0].expected) expect(context).toContain(formatINR(line.amount));
    });

    it('passes the harness, and no part is a template practice could draw', () => {
      checkCase(SAMPLE_CHAIN);
      expect(buildCase(SAMPLE_CHAIN, 7)).toEqual({ questions });
      for (const part of SAMPLE_CHAIN.parts) expect(TEMPLATES.some((t) => t.id === part.id)).toBe(false);
    });

    const base = { topicId: 'trial-balance', conceptId: 'tb-case', difficulty: 'easy' as const, setup: () => ({ a: 500000 }), context: () => 'A shop has cash of ₹5,000 and capital of ₹5,000 on 1 April.' };
    const cash = { title: 'Cash A/c', left: drSide([{ label: 'Capital A/c', amount: 500000 }]), right: crSide([{ label: 'Rent A/c', amount: 100000 }, { label: 'Balance c/d', amount: 400000, closing: true }]), distractors: ['Balance b/d', 'Cash A/c'], explanation: ['Cash received is debited.'] };
    const other: CasePart<{ a: number }> = { kind: 'numeric', unit: 'rupees', make: (s) => ({ prompt: 'What is the capital?', answer: s.a, commonErrors: [{ value: 1, why: 'x' }, { value: 2, why: 'y' }], explanation: ['a.'] }) };

    it('refuses a format that gives data of its own, and a set outside a case that has no opening line', () => {
      const good = caseTemplate({ ...base, id: 'test-case-format', title: 'One format', parts: [{ kind: 'account', make: () => ({ task: 'Prepare Cash A/c and balance it.', ...cash }) }, other] });
      const built = buildCase(good, 1);
      expect('questions' in built && built.questions[0]).toMatchObject({ type: 'account', data: base.context(), context: base.context(), prompt: 'Prepare Cash A/c and balance it.' });
      // The compiler refuses `data` in a part; told by a cast, the case template refuses it when the case is made.
      const twice = { task: 'Prepare Cash A/c and balance it.', ...cash, data: 'The same figures again.' } as unknown as Omit<typeof cash, never> & { task: string };
      const bad = caseTemplate({ ...base, id: 'test-case-data', title: 'Data twice', parts: [{ kind: 'account', make: () => twice }, other] });
      expect(() => buildCase(bad, 1)).toThrow('test-case-data: a format of a case gives no data of its own; the case text is its data');
      expect(() => bad.parts[0].generate(undefined as never)).toThrow(/gives no data of its own/);
    });

    it('takes an account kept over several periods as a part, made with ledgerPeriods', () => {
      const years = [
        { date: '1 April 2024', lines: [dr('machinery', 500000), cr('bank', 500000)] },
        { date: '31 March 2025', lines: [dr('depreciation', 50000), cr('machinery', 50000)] },
        { date: '31 March 2026', lines: [dr('depreciation', 50000), cr('machinery', 50000)] },
      ];
      const closings = [{ closeOn: '31 March 2025', reopenOn: '1 April 2025', title: 'Year ended 31 March 2025' }, { closeOn: '31 March 2026', title: 'Year ended 31 March 2026' }];
      const machine = caseTemplate({
        ...base,
        id: 'test-case-periods',
        title: 'Two years of a machine',
        parts: [other, { kind: 'account', make: () => ({ task: 'Prepare Machinery A/c for the two years.', title: 'Machinery A/c', ...ledgerPeriods(years, 'machinery', closings), distractors: ['Machinery A/c', 'Cash A/c'], explanation: ['The machine is debited at cost and credited with each depreciation.'] }) }],
      });
      const built = buildCase(machine, 1);
      const account = 'questions' in built ? built.questions[1] : undefined;
      if (account?.type !== 'account') throw new Error(JSON.stringify(built));
      expect(account.periodTitles).toEqual(['Year ended 31 March 2025', 'Year ended 31 March 2026']);
      expect(account.later).toHaveLength(1);
      expect(account.later![0][0][0]).toMatchObject({ label: 'Balance b/d', amounts: [450000] });
      checkFormat(account, 'test-case-periods');
    });

    it('checks a part as the engine checks a format or a set that stands alone, and says which question it refused', () => {
      const lopsided = { ...cash, right: crSide([{ label: 'Rent A/c', amount: 100000 }, { label: 'Balance c/d', amount: 300000, closing: true }]) };
      const bad = caseTemplate({ ...base, id: 'test-case-lopsided', title: 'Sides apart', parts: [other, { kind: 'account', make: () => ({ task: 'Prepare Cash A/c and balance it.', ...lopsided }) }] });
      expect(buildCase(bad, 1)).toEqual({ invalid: 'question 2: the two sides do not agree: 500000 against 400000' });
      const entry = { lines: [dr('cash', 500000), cr('capital', 500000)], explanation: ['Cash comes in.'] };
      const two = caseTemplate({ ...base, id: 'test-case-two', title: 'Two entries', parts: [other, { kind: 'journal_set', make: () => ({ transactions: [{ label: '(a)', text: 'Capital brought in.', ...entry }, { label: '(b)', text: 'More capital brought in.', ...entry }] }) }] });
      expect(buildCase(two, 1)).toEqual({ invalid: 'question 2: 2 transactions, not 3 to 8' });
      const failing = caseTemplate({ ...base, id: 'test-case-verify', title: 'Verify', parts: [other, { kind: 'account', make: () => ({ task: 'Prepare Cash A/c and balance it.', ...cash }), verify: (q) => q.sides[0].rows.length > 1 }] });
      expect(buildCase(failing, 1)).toEqual({ invalid: 'question 2: independent verification failed' });
    });
  });

  it('the chained case of the final accounts is three accounts from one trial balance, each read from the case text alone', () => {
    const c = CASES.find((x) => x.id === 'case-fa-chain-trading-pl-bs')!;
    expect(c.parts.map((p) => p.kind)).toEqual(['account', 'account', 'account']);
    expect(c.parts.every((p) => typeof p.verify === 'function')).toBe(true);
    const shapes = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const [trading, profitAndLoss, balanceSheet] = generateCaseQuestions(c.id, seed);
      if (trading.type !== 'account' || profitAndLoss.type !== 'account' || balanceSheet.type !== 'account') throw new Error('unexpected kinds');
      const at = `seed ${seed}`;
      // What one part ends on, the next begins with; neither figure is printed in the case.
      const gross = trading.sides[0].rows.find((r) => r.closing)!;
      const net = profitAndLoss.sides[0].rows.find((r) => r.closing)!;
      expect([gross.label, net.label], at).toEqual(['Gross Profit c/d', 'Net Profit transferred to Capital A/c']);
      expect(profitAndLoss.sides[1].rows[0], at).toEqual({ label: 'Gross Profit b/d', amounts: gross.amounts });
      expect(balanceSheet.sides[0].rows.find((r) => r.label === 'Capital')!.details, at).toContain(`Add: Net Profit ${formatINR(net.amounts[0])}`);
      expect(trading.context, at).not.toMatch(/gross profit|net profit/i);
      expect(trading.context, at).toMatch(/Closing stock is valued at ₹[\d,]+; it is not in the trial balance\.\nThere is no other adjustment\./);
      expect(profitAndLoss.prompt, at).toMatch(/starting from the gross profit of the Trading Account\.$/);
      expect(balanceSheet.sides.map((s) => s.title), at).toEqual(['Liabilities', 'Assets']);
      // No "A/c" on a row of a statement, though the trial balance names the accounts that way.
      for (const q of [trading, profitAndLoss, balanceSheet]) for (const row of q.sides.flatMap((s) => s.rows)) if (!row.closing) expect(row.label, at).not.toMatch(/A\/c/);
      shapes.add([trading, profitAndLoss, balanceSheet].map((q) => q.sides.map((s) => s.rows.length).join('/')).join(' '));
    }
    expect(shapes.size).toBeGreaterThanOrEqual(8);
  });

  it('reports which question was refused', () => {
    const broken = caseTemplate({
      id: 'test-case-broken',
      topicId: 'trial-balance',
      conceptId: 'tb-case',
      difficulty: 'easy',
      title: 'Broken',
      setup: () => ({ a: 100 }),
      context: () => 'A case.',
      parts: [
        { kind: 'numeric', unit: 'rupees', make: (s) => ({ prompt: 'What is a?', answer: s.a, commonErrors: [{ value: 1, why: 'x' }, { value: 2, why: 'y' }], explanation: ['a.'] }) },
        { kind: 'numeric', unit: 'rupees', make: () => ({ prompt: 'What is b?', answer: 0, commonErrors: [], explanation: ['b.'] }) },
      ],
    });
    expect(buildCase(broken, 1)).toEqual({ invalid: 'question 2: answer 0 is not a positive integer' });
  });

  it('names the questions of a case <caseId>~<n> and reads such ids back', () => {
    expect(casePartId('case-x', 0)).toBe('case-x~1');
    expect(parseCasePartId('case-x~3')).toEqual({ caseId: 'case-x', index: 2 });
    expect(parseCasePartId('je-capital')).toBeNull();
    expect(parseCasePartId('case-x~0')).toBeNull();
    expect(parseGenId('gen:case-x~3:1:42')).toEqual({ templateId: 'case-x~3', version: 1, seed: 42 });
  });

  it('keeps the questions of cases out of the templates practice draws from, yet finds them by id', () => {
    expect(TEMPLATES.some((t) => parseCasePartId(t.id) !== null)).toBe(false);
    for (const c of CASES) {
      expect(findTemplate(casePartId(c.id, 0)), c.id).toBe(c.parts[0]);
      expect(generateQuestion(casePartId(c.id, 0), 3), c.id).toEqual(generateCaseQuestions(c.id, 3)[0]);
    }
    expect(() => generateCaseQuestions('nope', 1)).toThrow('Unknown case: nope');
  });

  it('has unique case ids, none of them a template id', () => {
    const ids = CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id, 'case ids are lower-case words joined by hyphens, starting "case-"').toMatch(/^case(?:-[a-z0-9]+)+$/);
      expect(TEMPLATES.some((t) => t.id === id), id).toBe(false);
    }
  });

  describe('every stage belongs to a topic of the course', () => {
    const topics = new Set(COURSES.flatMap((course) => course.topics.map((t) => t.id)));
    for (const stage of CASE_STAGES) {
      it(`${stage.id}: its topic exists and its cases are filed under it`, () => {
        expect(topics.has(stage.topicId), `unknown topic ${stage.topicId}`).toBe(true);
        for (const c of stage.cases) {
          expect({ topicId: c.topicId, conceptId: c.conceptId }, c.id).toEqual({ topicId: stage.topicId, conceptId: stage.conceptId });
          expect(c.title.trim().length, `${c.id}: needs a title`).toBeGreaterThan(5);
        }
        expect(new Set(stage.cases.map((c) => c.title)).size, `${stage.id}: two cases share a title`).toBe(stage.cases.length);
      });
    }
  });

  // The harness over every case (100 seeds each) is in src/generators/harness/: split in parts so that they run at once.
});
