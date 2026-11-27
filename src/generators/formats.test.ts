import { describe, expect, it } from 'vitest';
import { PACKS, getTopicPack } from '@/content/registry';
import type { AccountQuestion, StatementQuestion } from '@/content/types';
import { creditor } from '@/engine/accounts';
import { accountOf, cashBook, type DatedEntry } from '@/engine/books';
import { columnTotals } from '@/engine/formats';
import type { JournalLine } from '@/engine/journal';
import { checkAnswer } from '@/exercises/checkers';
import { CONFIG } from '@/learning/config';
import { BLUEPRINTS } from '@/learning/paperBlueprints';
import { availableItems, buildDailyChallenge, buildDailyMission, buildFreshQuestions, buildSmartPractice, withoutFormats } from '@/learning/practice';
import { deriveProgress } from '@/learning/progress';
import { buildLevelSession } from '@/learning/sessionBuilder';
import type { MockPaper } from '@/learning/mockPaper';
import { markPaper } from '@/play/mockSitting';
import { SAMPLE_ACCOUNT, SAMPLE_STATEMENT, SAMPLE_SUSPENSE, rightFormat, rightFormatDraft } from '@/testing/sampleFormats';
import { CASH_BOOK_COLUMNS, cashBookSides, crSide, drSide, keepFor, ledgerSides } from './authoring';
import { TEMPLATES, generateCaseQuestions, generateQuestion, getTemplate, isFormatKind } from './index';

const dr = (accountId: string, rupees: number): JournalLine => ({ accountId, side: 'Dr', amount: rupees * 100 });
const cr = (accountId: string, rupees: number): JournalLine => ({ accountId, side: 'Cr', amount: rupees * 100 });
const RAO = creditor('Rao & Co.');
const MONTH: DatedEntry[] = [
  { date: '4 April', lines: [dr('purchases', 40000), cr(RAO, 40000)] },
  { date: '9 April', lines: [dr('bank', 20000), cr('cash', 20000)] },
  { date: '18 April', lines: [dr(RAO, 15000), cr('bank', 15000)] },
  { date: '25 April', lines: [dr('cash', 6000), cr('sales', 6000)] },
];

describe('the sides of an account from the books', () => {
  it('makes the two sides of a ledger account, balanced, and brings the balance down when asked', () => {
    expect(drSide([])).toEqual({ title: 'Dr', prefix: 'To', rows: [] });
    expect(crSide([], [{ label: 'Balance b/d', amount: 100 }])).toEqual({ title: 'Cr', prefix: 'By', rows: [], below: [{ label: 'Balance b/d', amount: 100 }] });
    const view = accountOf(MONTH, RAO, { date: '1 April', side: 'Cr', amount: 1000000 });
    const closed = ledgerSides(view, { closeOn: '30 April' });
    expect(closed.left.rows).toEqual([
      { date: '18 April', label: 'Bank A/c', amount: 1500000 },
      { date: '30 April', label: 'Balance c/d', amount: 3500000, closing: true },
    ]);
    expect(closed.right.rows).toEqual([
      { date: '1 April', label: 'Balance b/d', amount: 1000000 },
      { date: '4 April', label: 'Purchases A/c', amount: 4000000 },
    ]);
    expect(closed.left.below ?? closed.right.below).toBeUndefined();
    const continued = ledgerSides(view, { closeOn: '30 April', reopenOn: '1 May' });
    expect(continued.right.below).toEqual([{ date: '1 May', label: 'Balance b/d', amount: 3500000 }]);
    expect(continued.left.below).toBeUndefined();
    // An account whose sides are equal has no closing row.
    const even = ledgerSides(accountOf([MONTH[0], { date: '5 April', lines: [dr(RAO, 40000), cr('cash', 40000)] }], RAO), { closeOn: '30 April', reopenOn: '1 May' });
    expect([...even.left.rows, ...even.right.rows].some((r) => r.closing)).toBe(false);
  });

  it('makes the two sides of a cash book with cash and bank columns, each column carried down on its own side', () => {
    expect(CASH_BOOK_COLUMNS).toEqual(['Cash (₹)', 'Bank (₹)']);
    // Cash in hand, and a bank account that ends overdrawn.
    const view = cashBook([...MONTH, { date: '28 April', lines: [dr('rent', 12000), cr('bank', 12000)] }], { date: '1 April', cash: 3000000, bank: 0 });
    const sides = cashBookSides(view, { closeOn: '30 April', reopenOn: '1 May' });
    expect(sides.left.rows).toEqual([
      { date: '1 April', label: 'Balance b/d', amounts: [3000000, 0] },
      { date: '9 April', label: 'Cash A/c', amounts: [0, 2000000], contra: true },
      { date: '25 April', label: 'Sales A/c', amounts: [600000, 0] },
      // The overdraft is carried down on the debit side.
      { date: '30 April', label: 'Balance c/d', amounts: [0, 700000], closing: true },
    ]);
    expect(sides.right.rows.at(-1)).toEqual({ date: '30 April', label: 'Balance c/d', amounts: [1600000, 0], closing: true });
    expect(sides.left.below).toEqual([{ date: '1 May', label: 'Balance b/d', amounts: [1600000, 0] }]);
    expect(sides.right.below).toEqual([{ date: '1 May', label: 'Balance b/d', amounts: [0, 700000] }]);
    const total = (rows: typeof sides.left.rows) => [0, 1].map((c) => rows.reduce((sum, r) => sum + (r.amounts![c] ?? 0), 0));
    expect(total(sides.left.rows)).toEqual(total(sides.right.rows));
  });

  it('keeps what a format was made from for the verify that follows, and for no other question', () => {
    const kept = keepFor<number[]>();
    expect(kept.of('a')).toBeUndefined();
    kept.keep('a', [1, 2]);
    expect(kept.of('a')).toEqual([1, 2]);
    expect(kept.of('b')).toBeUndefined();
    kept.keep('b', [3]);
    expect(kept.of('a')).toBeUndefined();
  });
});

describe('the formats of the Ledger and the Trial Balance', () => {
  // The six formats written with the kinds themselves. Other topics add their own: nothing here counts on which.
  const OWN = ['led-fmt-personal', 'led-fmt-cash', 'led-fmt-goods', 'led-fmt-compound', 'tb-fmt-balances', 'tb-fmt-transactions'];
  const FORMATS = OWN.map(getTemplate);
  const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);
  const accounts = (id: string) => SEEDS.map((seed) => generateQuestion(id, seed) as AccountQuestion);
  const statements = (id: string) => SEEDS.map((seed) => generateQuestion(id, seed) as StatementQuestion);
  const labelsOf = (q: AccountQuestion, side: 0 | 1) => q.sides[side].rows.map((r) => r.label);

  it('are of both kinds and every difficulty, each with a check of its own', () => {
    expect(FORMATS.every((t) => isFormatKind(t.kind) && TEMPLATES.includes(t))).toBe(true);
    expect(new Set(FORMATS.map((t) => t.kind))).toEqual(new Set(['account', 'statement']));
    expect(new Set(FORMATS.map((t) => t.difficulty))).toEqual(new Set(['easy', 'medium', 'complex']));
    for (const t of FORMATS) expect(typeof t.verify, t.id).toBe('function');
  });

  it('vary in structure across seeds, not only in amounts', () => {
    for (const t of FORMATS) {
      const shapes = new Set(
        SEEDS.map((seed) => {
          const q = generateQuestion(t.id, seed);
          if (q.type === 'account') return JSON.stringify(q.sides.map((s) => [s.rows.map((r) => r.label.replace(/^.* A\/c$/, 'x')), s.below.length]));
          if (q.type === 'statement') return String(q.rows.length) + q.rows.map((r) => (r.amounts[0] > 0 ? 'd' : 'c')).join('');
          return '';
        }),
      );
      expect(shapes.size, t.id).toBeGreaterThanOrEqual(4);
    }
  });

  it("led-fmt-personal: a customer's account closes on the credit side and a supplier's on the debit side", () => {
    const seen = new Set<string>();
    for (const q of accounts('led-fmt-personal')) {
      const customer = q.data.includes('is a customer of');
      const closing = q.sides.map((s) => s.rows.filter((r) => r.closing).length);
      expect(closing, q.id).toEqual(customer ? [0, 1] : [1, 0]);
      expect(q.title, q.id).toMatch(/ A\/c$/);
      expect(q.labels, q.id).toContain(q.title);
      expect(q.sides.flatMap((s) => s.below), q.id).toEqual([]);
      seen.add(`${customer ? 'customer' : 'supplier'} ${labelsOf(q, customer ? 0 : 1).includes('Balance b/d') ? 'with' : 'without'} an opening balance`);
    }
    expect(seen.size).toBe(4);
  });

  it('led-fmt-cash: opens with the cash in hand and brings the balance down on the debit side, below the totals', () => {
    for (const q of accounts('led-fmt-cash')) {
      expect(q.sides[0].rows[0], q.id).toMatchObject({ label: 'Balance b/d' });
      expect(q.sides[1].rows.at(-1), q.id).toMatchObject({ label: 'Balance c/d', closing: true });
      expect(q.sides[0].below, q.id).toEqual([{ date: expect.stringMatching(/^1 /), label: 'Balance b/d', amounts: q.sides[1].rows.at(-1)!.amounts }]);
      expect(q.sides[1].below, q.id).toEqual([]);
      // Every amount of a transaction is in the data the student reads.
      for (const row of q.sides.flatMap((s) => s.rows).filter((r) => !r.closing)) expect(q.data, `${q.id} ${row.label}`).toContain((row.amounts[0] / 100).toLocaleString('en-IN'));
    }
  });

  it('led-fmt-goods: leaves out the returns, the payments and the furniture, and says so in the task', () => {
    for (const q of accounts('led-fmt-goods')) {
      const buying = q.title === 'Purchases A/c';
      expect(q.prompt, q.id).toContain(buying ? 'Purchases Return A/c' : 'Sales Return A/c');
      const used = q.sides.flatMap((s) => s.rows.map((r) => r.label));
      for (const stranger of ['Purchases Return A/c', 'Sales Return A/c', 'Furniture A/c']) expect(used, q.id).not.toContain(stranger);
      // More transactions in the data than rows in the account: something had to be left out.
      const transactions = q.data.split('\n').filter((line) => line.startsWith('• ')).length;
      expect(transactions, q.id).toBeGreaterThan(used.length - 1);
      expect(q.labels, q.id).toContain(buying ? 'Purchases Return A/c' : 'Sales Return A/c');
    }
  });

  it('led-fmt-compound: shows the goods and each tax of the invoice, and the money and the discount of the settlement, as rows of their own', () => {
    for (const q of accounts('led-fmt-compound')) {
      const customer = q.data.includes('is a customer of');
      const [own, far] = customer ? [0, 1] : [1, 0];
      const rate = Number(/GST at (\d+)%/.exec(q.data)![1]);
      const goods = q.sides[own].rows.find((r) => r.label === (customer ? 'Sales A/c' : 'Purchases A/c'))!;
      const taxes = q.sides[own].rows.filter((r) => /GST A\/c$/.test(r.label));
      expect(taxes.length, q.id).toBe(q.data.includes('CGST and SGST') ? 2 : 1);
      expect(taxes.reduce((sum, r) => sum + r.amounts[0], 0), q.id).toBe((goods.amounts[0] * rate) / 100);
      const discount = q.sides[far].rows.find((r) => r.label === (customer ? 'Discount Allowed A/c' : 'Discount Received A/c'))!;
      const settled = Number(/in full settlement of ₹([\d,]+)/.exec(q.data)![1].replace(/,/g, '')) * 100;
      const money = q.sides[far].rows.find((r) => r.amounts[0] === settled - discount.amounts[0]);
      expect(money, q.id).toBeDefined();
      expect(q.sides[own].below, q.id).toHaveLength(1);
    }
  });

  it('tb-fmt-balances: puts every balance of the list in the column of its account, the trap balances among them', () => {
    const traps = new Set<string>();
    for (const q of statements('tb-fmt-balances')) {
      expect(q.totalsAgree, q.id).toBe(true);
      expect(q.columns, q.id).toEqual(['Debit (₹)', 'Credit (₹)']);
      for (const row of q.rows) {
        expect(q.data, q.id).toContain(`${row.label}: `);
        if (['Drawings', 'Sales returns', 'Discount allowed', 'Bad debts'].includes(row.label)) expect(row.amounts[1], `${q.id} ${row.label}`).toBe(0);
        if (['Purchases returns', 'Discount received', 'Bank overdraft', 'Provision for doubtful debts'].includes(row.label)) expect(row.amounts[0], `${q.id} ${row.label}`).toBe(0);
        traps.add(row.label);
      }
    }
    for (const trap of ['Drawings', 'Sales returns', 'Purchases returns', 'Discount allowed', 'Discount received', 'Bank overdraft']) expect(traps.has(trap), trap).toBe(true);
  });

  it('tb-fmt-transactions: lists the balance of every account that has one, and leaves out the customer who paid in full', () => {
    let leftOut = 0;
    for (const q of statements('tb-fmt-transactions')) {
      expect(q.prompt, q.id).toContain('by the balance method');
      const [debit, credit] = columnTotals(q.rows, 2);
      expect(debit, q.id).toBe(credit);
      expect(q.rows.map((r) => r.label), q.id).toEqual(expect.arrayContaining(['Cash A/c', 'Capital A/c', 'Purchases A/c', 'Sales A/c']));
      if (q.data.includes('the whole amount due')) {
        leftOut++;
        const customer = /in cash from (.+), the whole amount due/.exec(q.data)![1];
        expect(q.rows.map((r) => r.label), q.id).not.toContain(`${customer} A/c`);
        expect(q.labels, q.id).toContain(`${customer} A/c`);
      }
    }
    expect(leftOut).toBeGreaterThan(5);
    expect(leftOut).toBeLessThan(SEEDS.length);
  });
});

describe('the Suspense A/c: the row it opens with is as right as "Balance b/d"', () => {
  const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);
  const DIFFERENCE = 'Difference in trial balance';
  const BD = 'Balance b/d';
  /** The Suspense A/c of the two formats of the topic and of the two chained cases that prepare one, over the seeds. */
  const accounts = (): AccountQuestion[] =>
    SEEDS.flatMap((seed) => [
      generateQuestion('roe-fmt-suspense', seed),
      generateQuestion('roe-fmt-suspense-find', seed),
      ...generateCaseQuestions('case-roe-chain-entries-and-suspense', seed),
      ...generateCaseQuestions('case-roe-chain-find-difference', seed),
    ]).filter((q): q is AccountQuestion => q.type === 'account');
  const lists = (q: AccountQuestion) => [q.sides[0].rows, q.sides[1].rows, q.sides[0].below, q.sides[1].below];
  /** The right answer with the opening row entered as "Balance b/d". */
  const reworded = (q: AccountQuestion) => {
    const r = rightFormat(q) as Extract<ReturnType<typeof rightFormat>, { type: 'account' }>;
    return { ...r, sides: r.sides.map((rows) => rows.map((row) => (row.label === DIFFERENCE ? { ...row, label: BD } : row))) as typeof r.sides };
  };

  it('only that row has other wording, and it is offered beside two labels that no row is right under', () => {
    const all = accounts();
    expect(all).toHaveLength(SEEDS.length * 4);
    for (const q of all) {
      const rows = lists(q).flat();
      expect(rows.filter((r) => r.also !== undefined), q.id).toEqual([expect.objectContaining({ label: DIFFERENCE, also: [BD] })]);
      expect(q.labels, q.id).toContain(BD);
      const accepted = new Set(rows.flatMap((r) => [r.label, ...(r.also ?? [])]));
      expect(q.labels.filter((label) => !accepted.has(label)).length, q.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('no row above the totals is called "Balance b/d" itself, so the opening row can always be told from the others', () => {
    for (const q of accounts()) {
      expect(q.sides.flatMap((s) => s.rows).some((r) => r.label === BD), q.id).toBe(false);
      for (const below of q.sides.map((s) => s.below)) expect(below.every((r) => r.label === BD && r.also === undefined), q.id).toBe(true);
    }
  });

  it('marks the account wholly right with the opening row entered as "Balance b/d"', () => {
    for (const q of accounts()) {
      const result = checkAnswer(q, reworded(q));
      const count = lists(q).flat().length;
      expect(result, q.id).toMatchObject({ correct: true, parts: { right: count, total: count } });
    }
  });

  it('keeps "Balance b/d" a mistake where it is one: a balance brought down that is not there, or written above the totals', () => {
    const all = accounts();
    const closed = all.filter((q) => q.sides.every((s) => s.below.length === 0));
    const open = all.filter((q) => q.sides.some((s) => s.below.length > 0));
    expect(Math.min(closed.length, open.length)).toBeGreaterThan(10);
    for (const q of closed) {
      // Nothing is left, and a balance is brought down all the same: a row that should not be there.
      const r = reworded(q);
      const result = checkAnswer(q, { ...r, below: [[{ label: BD, amounts: [70000] }], []] });
      expect(result, q.id).toMatchObject({ correct: false, format: { extra: 1 } });
      expect(result.parts!.right, q.id).toBe(result.parts!.total - 1);
    }
    for (const q of open) {
      // The balance that is left, brought down above the totals instead of below them.
      const r = reworded(q);
      const side = q.sides[0].below.length > 0 ? 0 : 1;
      const sides = r.sides.map((rows, s) => (s === side ? [...rows, ...r.below[side]] : rows)) as typeof r.sides;
      const result = checkAnswer(q, { ...r, sides, below: [[], []] });
      expect(result.format!.expected[2 + side], q.id).toEqual(['place']);
      expect(result.format!.right, q.id).toBe(result.format!.total - 1);
    }
  });
});

describe('where formats are served', () => {
  const ledger = getTopicPack('ledger')!;
  const formatLevel = ledger.levels.find((l) => l.type === 'format_practice')!;
  const all = availableItems(ledger, ledger.levels.map((l) => l.id));
  const formatIds = TEMPLATES.filter((t) => isFormatKind(t.kind)).map((t) => t.id);
  const isFormat = (type: string) => type === 'account' || type === 'statement';
  const types = (items: { kind: string; question?: { type: string } }[]) => items.flatMap((i) => (i.kind === 'question' ? [i.question!.type] : []));

  it('a level of formats serves formats only, as many as it says, the same for the same seed', () => {
    const items = buildLevelSession(formatLevel, ledger, 4200);
    expect(types(items)).toHaveLength(formatLevel.generate!.count);
    expect(types(items).every(isFormat)).toBe(true);
    expect(buildLevelSession(formatLevel, ledger, 4200)).toEqual(items);
    expect(formatLevel.passMark).toBe(0.5);
  });

  it('become available to practice once their level is passed, and not before', () => {
    const before = availableItems(ledger, ledger.levels.filter((l) => l.type !== 'format_practice').map((l) => l.id));
    expect(formatIds.filter((id) => before.templateIds.has(id))).toEqual([]);
    expect(formatLevel.generate!.templateIds.every((id) => all.templateIds.has(id))).toBe(true);
    expect([...withoutFormats(all).templateIds].filter((id) => formatIds.includes(id))).toEqual([]);
    expect(withoutFormats(all).templateIds.size).toBe(all.templateIds.size - formatIds.filter((id) => all.templateIds.has(id)).length);
  });

  it('are served by smart practice and fresh questions, and never by the daily challenge or the daily mission', () => {
    const progress = deriveProgress([], [], Date.UTC(2026, 9, 6));
    const now = Date.UTC(2026, 9, 6, 6);
    // Only the formats are available: what a session serves then is a format, or nothing.
    const only = { templateIds: new Set(formatIds), questionIds: new Set<string>() };
    expect(types(buildSmartPractice([ledger], progress, only, now, 1_000_000_000)).every(isFormat)).toBe(true);
    expect(types(buildSmartPractice([ledger], progress, only, now, 1_000_000_000)).length).toBeGreaterThan(0);
    expect(types(buildFreshQuestions(ledger, progress, only, 1_000_000_100))).toHaveLength(CONFIG.practice.freshCount);
    expect(buildDailyChallenge(PACKS, only, '2026-10-06')).toEqual([]);
    expect(buildDailyMission(PACKS, progress, {}, only, now, 1_000_000_200)).toEqual([]);
    // With everything available, the two daily rounds are as long as ever and hold no format.
    for (let day = 1; day <= 28; day++) {
      const challenge = types(buildDailyChallenge([ledger], all, `2026-10-${String(day).padStart(2, '0')}`));
      expect(challenge).toHaveLength(CONFIG.practice.dailyChallengeCount);
      expect(challenge.some(isFormat), `challenge of day ${day}`).toBe(false);
      const mission = types(buildDailyMission([ledger], progress, {}, all, now, 1_000_000_000 + day * 100));
      expect(mission).toHaveLength(CONFIG.practice.mission.questions + CONFIG.practice.mission.challenge);
      expect(mission.some(isFormat), `mission of day ${day}`).toBe(false);
    }
  });
});

describe('a format in a mock paper', () => {
  const paper = (question: AccountQuestion | StatementQuestion, marks: 4 | 6): MockPaper => ({
    ref: { kind: 'topic', topicId: question.topicId, number: 1 },
    key: `topic.${question.topicId}.1`,
    title: 'Topic test 1',
    marks,
    minutes: 40,
    blueprint: BLUEPRINTS.topic,
    entries: [{ number: 1, marks, section: 0, topicId: question.topicId, questions: [question] }],
  });
  const marksFor = (question: AccountQuestion | StatementQuestion, marks: 4 | 6, draft: unknown) => markPaper(paper(question, marks), { [question.id]: draft }).entries[0];

  it('earns its marks whole when every row is right, and none when nothing is entered', () => {
    expect(marksFor(SAMPLE_ACCOUNT, 4, rightFormatDraft(SAMPLE_ACCOUNT))).toMatchObject({ marks: 4 });
    expect(marksFor(SAMPLE_STATEMENT, 6, rightFormatDraft(SAMPLE_STATEMENT))).toMatchObject({ marks: 6 });
    expect(marksFor(SAMPLE_ACCOUNT, 4, undefined)).toMatchObject({ marks: 0, steps: [{ response: null }] });
  });

  it('shares its marks among its expected rows: marks times rows right, less one for each extra row, over rows expected, to the half mark', () => {
    const draft = rightFormatDraft(SAMPLE_ACCOUNT);
    if (draft.type !== 'account') throw new Error('not an account');
    // Five of six rows right: 4 x 5 / 6 = 3.33, so 3.5.
    const fiveOfSix = { ...draft, sides: [draft.sides[0].slice(1), draft.sides[1]] };
    expect(marksFor(SAMPLE_ACCOUNT, 4, fiveOfSix).marks).toBe(3.5);
    expect(marksFor(SAMPLE_ACCOUNT, 6, fiveOfSix).marks).toBe(5);
    // And one row that should not be there: four count, 4 x 4 / 6 = 2.67, so 2.5.
    const withExtra = { ...fiveOfSix, sides: [[...fiveOfSix.sides[0], { label: 'Sales A/c', amounts: ['500'] }], fiveOfSix.sides[1]] };
    const marked = marksFor(SAMPLE_ACCOUNT, 4, withExtra);
    expect(marked.marks).toBe(2.5);
    expect(marked.steps[0].result).toMatchObject({ correct: false, parts: { right: 4, total: 6 }, format: { right: 5, extra: 1 } });
    // Every row right and one extra: the paper gives all but the cancelled row, though the answer is not "correct".
    const allAndExtra = { ...draft, sides: [[...draft.sides[0], { label: 'Sales A/c', amounts: ['500'] }], draft.sides[1]] };
    expect(marksFor(SAMPLE_ACCOUNT, 6, allAndExtra)).toMatchObject({ marks: 5, steps: [{ correct: false }] });
    // A row that cannot be read is not marked; the others are.
    const partly = { ...draft, sides: [[...draft.sides[0].slice(0, 2), { label: 'Balance c/d', amounts: [''] }], draft.sides[1]] };
    expect(marksFor(SAMPLE_ACCOUNT, 6, partly).marks).toBe(5);
  });

  it('counts a row entered under other wording as right: every mark, alone and as a part of a chained case', () => {
    const draft = rightFormatDraft(SAMPLE_SUSPENSE);
    if (draft.type !== 'account') throw new Error('not an account');
    const reworded = { ...draft, sides: [[{ ...draft.sides[0][0], label: 'Balance b/d' }, ...draft.sides[0].slice(1)], draft.sides[1]] };
    expect(marksFor(SAMPLE_SUSPENSE, 4, reworded)).toMatchObject({ marks: 4, steps: [{ correct: true, result: { parts: { right: 5, total: 5 } } }] });
    expect(marksFor(SAMPLE_SUSPENSE, 6, reworded).marks).toBe(6);
    // One other row left out: four of five, whichever wording the opening row has. 4 x 4 / 5 = 3.2, so 3.
    const short = (d: { sides: unknown[][] }) => ({ ...d, sides: [d.sides[0], d.sides[1].slice(1)] });
    expect(marksFor(SAMPLE_SUSPENSE, 4, short(reworded)).marks).toBe(3);
    expect(marksFor(SAMPLE_SUSPENSE, 4, short(reworded)).marks).toBe(marksFor(SAMPLE_SUSPENSE, 4, short(draft)).marks);
    // As a part of a case its credit is its rows right over its rows: the whole of it.
    const asPart: MockPaper = { ...paper(SAMPLE_SUSPENSE, 6), entries: [{ number: 1, marks: 6, section: 0, topicId: SAMPLE_SUSPENSE.topicId, caseId: 'case-x', questions: [SAMPLE_SUSPENSE] }] };
    expect(markPaper(asPart, { [SAMPLE_SUSPENSE.id]: reworded }).entries[0].marks).toBe(6);
  });

  it('is marked the same as the check of the player marks it', () => {
    const draft = rightFormatDraft(SAMPLE_STATEMENT);
    if (draft.type !== 'statement') throw new Error('not a statement');
    const swapped = { ...draft, rows: draft.rows.map((r, i) => (i === 1 ? { ...r, amounts: [r.amounts[1], r.amounts[0]] } : r)) };
    const marked = marksFor(SAMPLE_STATEMENT, 4, swapped);
    expect(marked.marks).toBe(3);
    expect(marked.steps[0].result).toEqual(checkAnswer(SAMPLE_STATEMENT, marked.steps[0].response!));
    expect(marked.steps[0].result?.mistakeCode).toBe('rows:ocooo');
  });
});
