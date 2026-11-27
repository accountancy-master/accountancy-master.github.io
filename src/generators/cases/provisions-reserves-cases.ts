/**
 * Case studies of Provisions and Reserves: one business at its year end, from the bad debts and the provision for
 * doubtful debts to the charges against profit and the reserves made out of it.
 *
 * Conventions (stated in each case text): the year ends on 31 March; further bad debts are written off before the
 * provision for doubtful debts is made on the debtors that remain; once a provision stands, the bad debts of a year are
 * set off against it and the provision is then brought to the amount needed through Profit and Loss A/c; depreciation
 * is on cost (straight line) and credited to Provision for Depreciation A/c; a transfer to a reserve is a share of the
 * net profit, found after every charge. The stage stays outside the mock papers (`STAGES_OUTSIDE_PAPERS`).
 *
 * Figures are whole rupees until they are returned. Every typed part is worked out again by its `verify` from the
 * printed case text, one labelled figure to a line.
 */
import type { JournalLine } from '@/engine/journal';
import { caseTemplate, formatINR } from '../authoring';
import type { CaseTemplate, McqParts, NumericParts } from '../types';

const common = { topicId: 'provisions-and-reserves', conceptId: 'pr-case' };

const rs = (n: number): number => n * 100;
const inr = (n: number): string => formatINR(rs(n));
const pc = (n: number, r: number): number => (n * r) / 100;
const dr = (accountId: string, n: number): JournalLine => ({ accountId, side: 'Dr', amount: rs(n) });
const cr = (accountId: string, n: number): JournalLine => ({ accountId, side: 'Cr', amount: rs(n) });

/** The printed case a question was made from. */
const ctx = (q: { context?: string }): string => q.context ?? '';
/** The line of a text that starts with `start`. */
const lineOf = (text: string, start: string): string => text.split('\n').find((l) => l.startsWith(start)) ?? '';
/** The first rupee figure on the line that starts with `start`, in whole rupees. */
const fig = (text: string, start: string): number => {
  const m = /₹([\d,]+)/.exec(lineOf(text, start));
  return m ? Number(m[1].replace(/,/g, '')) : Number.NaN;
};
/** The first percentage on the line that starts with `start`. */
const rate = (text: string, start: string): number => Number(/(\d+)%/.exec(lineOf(text, start))?.[1] ?? Number.NaN);
/** The text of the right option of a question. */
const picked = (q: { options: { id: string; text: string }[]; correct: string }): string => q.options.find((o) => o.id === q.correct)?.text ?? '';

/** A numeric part in rupees; null when the answer is not positive or fewer than two usable slips remain. */
function numeric(prompt: string, answer: number, errs: [number, string][], explanation: string[], hints: string[]): NumericParts | null {
  if (!(answer > 0) || !Number.isInteger(answer)) return null;
  const seen = new Set([answer]);
  const commonErrors: { value: number; why: string }[] = [];
  for (const [v, why] of errs) {
    if (v > 0 && Number.isInteger(v) && !seen.has(v)) {
      seen.add(v);
      commonErrors.push({ value: rs(v), why });
    }
  }
  return commonErrors.length >= 2 ? { prompt, answer: rs(answer), commonErrors, explanation, hints } : null;
}

/** A multiple-choice part; null when fewer than three distinct wrong options remain. */
function choice(prompt: string, correct: string, wrong: [string, string][], explanation: string, hints: string[]): McqParts | null {
  const seen = new Set([correct]);
  const distractors = wrong.filter(([t]) => (seen.has(t) ? false : (seen.add(t), true))).map(([text, why]) => ({ text, why }));
  return distractors.length >= 3 ? { prompt, correct, distractors, explanation, hints } : null;
}

const H = {
  provision: [
    'Which debtors can still turn bad once the further bad debts are written off?',
    'New provision = Rate % x (Debtors - Further bad debts).',
  ],
  charge: [
    'What does the year bear: the bad debts, the further bad debts and the new provision? What was provided in an earlier year?',
    'Charge = Bad debts + Further bad debts + New provision - Old provision.',
  ],
  debtors: [
    'The bad debts of the trial balance are already out of the debtors. What is still to come off?',
    'Debtors shown = Debtors - Further bad debts - New provision for doubtful debts.',
  ],
  where: [
    'Does the provision belong to the owner, or does it reduce what an asset is worth?',
    'A provision for doubtful debts is deducted from the debtors on the assets side.',
  ],
  reserve: [
    'Is the amount deducted to find the net profit, or taken out of the net profit afterwards?',
    'Charges (depreciation, provisions) come first; the reserve is a share of the net profit left after them.',
  ],
  kind: [
    'Where did the gain come from: normal trading, or a fixed asset?',
    'A gain on selling a fixed asset is a capital profit and is kept in a capital reserve.',
  ],
  entry: [
    'Is the year-end amount a charge against profit, or a provision written back?',
    'A rise in the provision: Profit and Loss A/c Dr, To Provision for Doubtful Debts A/c. A surplus written back: the other way round.',
  ],
};

const FIRMS = [
  { name: 'Anand Hardware Mart', town: 'Indore' },
  { name: 'Kisan Seeds and Fertilisers', town: 'Nashik' },
  { name: 'Lakshmi Medical Agencies', town: 'Madurai' },
  { name: 'Sai Paints and Sanitary', town: 'Nagpur' },
  { name: 'Brahmaputra Tea Traders', town: 'Jorhat' },
  { name: 'Vidya Book Distributors', town: 'Patna' },
  { name: 'Shree Auto Parts', town: 'Ludhiana' },
];

const L = {
  debtors: 'Sundry debtors (trial balance)',
  bad: 'Bad debts (trial balance)',
  oldPdd: 'Provision for doubtful debts (trial balance, credit)',
  further: 'Further bad debts to be written off',
  pddRate: 'Provision for doubtful debts to be kept at',
};

// ---------------------------------------------------------------------------------------------------------------
// 1. Easy: the debtors at one year end, with the trial balance figures and two adjustments.
// ---------------------------------------------------------------------------------------------------------------

interface OneYear {
  firm: (typeof FIRMS)[number];
  d: number;
  b1: number;
  o: number;
  b2: number;
  r: number;
  n: number;
}

const caseDebtorsYearEnd = caseTemplate<OneYear>({
  id: 'case-prc-debtors-year-end',
  ...common,
  difficulty: 'easy',
  title: 'Doubtful debts at the year end',
  setup: (rng) => {
    const firm = rng.pick(FIRMS);
    const d = rng.step(100000, 400000, 10000);
    const b1 = rng.step(2000, 9000, 500);
    const b2 = rng.step(2000, 12000, 1000);
    const r = rng.pick([4, 5, 10]);
    const n = pc(d - b2, r);
    const o = rng.step(3000, 15000, 500);
    if (!Number.isInteger(n) || n === o || b1 === b2 || b1 + b2 + n - o <= 0) return null;
    return { firm, d, b1, o, b2, r, n };
  },
  context: (s) =>
    [
      `${s.firm.name}, ${s.firm.town}, sells on credit and closes its books on 31 March 2026.`,
      `${L.debtors}: ${inr(s.d)}`,
      `${L.bad}: ${inr(s.b1)}`,
      `${L.oldPdd}: ${inr(s.o)}`,
      `${L.further}: ${inr(s.b2)}`,
      `${L.pddRate}: ${s.r}% of the debtors left after the further bad debts`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          'What is the new provision for doubtful debts?',
          s.n,
          [
            [pc(s.d, s.r), 'Took the rate on the debtors before the further bad debts were written off.'],
            [s.n - s.o, 'Gave only the increase over the old provision; the question asks for the provision itself.'],
            [s.d - s.b2 - s.n, 'Gave the debtors left after the provision instead of the provision.'],
          ],
          [`Debtors left = ${inr(s.d)} - ${inr(s.b2)} = ${inr(s.d - s.b2)}.`, `New provision = ${s.r}% of ${inr(s.d - s.b2)} = ${inr(s.n)}.`],
          H.provision,
        ),
      verify: (q) => {
        const t = ctx(q);
        return q.answer === rs(pc(fig(t, L.debtors) - fig(t, L.further), rate(t, L.pddRate)));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          'What is the total charged to the Profit and Loss Account for bad debts and the provision for doubtful debts, after the old provision is taken into account?',
          s.b1 + s.b2 + s.n - s.o,
          [
            [s.b2 + s.n - s.o, 'Left out the bad debts already in the trial balance; they are a charge of this year too.'],
            [s.b1 + s.b2 + s.n, 'Forgot the old provision, which was charged in an earlier year and is set against this year\'s charge.'],
            [s.b1 + s.b2 + s.n + s.o, 'Added the old provision instead of deducting it.'],
          ],
          [
            'Charge = Bad debts + Further bad debts + New provision - Old provision.',
            `${inr(s.b1)} + ${inr(s.b2)} + ${inr(s.n)} - ${inr(s.o)} = ${inr(s.b1 + s.b2 + s.n - s.o)}.`,
          ],
          H.charge,
        ),
      verify: (q) => {
        const t = ctx(q);
        const n = pc(fig(t, L.debtors) - fig(t, L.further), rate(t, L.pddRate));
        return q.answer === rs(fig(t, L.bad) + fig(t, L.further) + n - fig(t, L.oldPdd));
      },
    },
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          `Where is the new provision of ${inr(s.n)} shown in the balance sheet?`,
          'Deducted from sundry debtors on the assets side',
          [
            ['On the liabilities side, along with the capital', 'Treated the provision as part of the owner\'s funds, as a reserve is.'],
            ['As a current liability', 'A provision for doubtful debts is owed to no one; it reduces what the debtors are worth.'],
            ['It is not shown: it is only an entry in the Profit and Loss Account', 'Left out the second effect: the provision stays in the books and is deducted from the debtors.'],
          ],
          'The provision tells how much of the debtors is not expected to be collected, so it is deducted from them on the assets side.',
          H.where,
        ),
      verify: (q) => picked(q) === 'Deducted from sundry debtors on the assets side',
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          'At what amount are the sundry debtors shown in the balance sheet?',
          s.d - s.b2 - s.n,
          [
            [s.d - s.b1 - s.b2 - s.n, 'Deducted the bad debts of the trial balance again; they were written off before the trial balance was drawn up.'],
            [s.d - s.n, 'Did not deduct the further bad debts.'],
            [s.d - s.b2, 'Did not deduct the provision for doubtful debts.'],
          ],
          [`${inr(s.d)} - further bad debts ${inr(s.b2)} - provision ${inr(s.n)} = ${inr(s.d - s.b2 - s.n)}.`, 'The bad debts of the trial balance are not deducted again.'],
          H.debtors,
        ),
      verify: (q) => {
        const t = ctx(q);
        const left = fig(t, L.debtors) - fig(t, L.further);
        return q.answer === rs(left - pc(left, rate(t, L.pddRate)));
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 2. Medium: charges first, then the reserves (revenue and capital).
// ---------------------------------------------------------------------------------------------------------------

interface ChargesThenReserves {
  firm: (typeof FIRMS)[number];
  profit: number;
  cost: number;
  dr: number;
  dep: number;
  debtors: number;
  pr: number;
  pdd: number;
  tr: number;
  landCost: number;
  gain: number;
}

const C = {
  profit: 'Profit for the year before depreciation and the provision',
  machine: 'Machinery at cost',
  debtors: 'Sundry debtors at the year end, all bad debts written off',
  land: 'A plot of land sold during the year',
};

const net = (s: ChargesThenReserves): number => s.profit - s.dep - s.pdd;

const caseChargesAndReserves = caseTemplate<ChargesThenReserves>({
  id: 'case-prc-charges-and-reserves',
  ...common,
  difficulty: 'medium',
  title: 'Charges first, reserves after',
  setup: (rng) => {
    const firm = rng.pick(FIRMS);
    const profit = rng.step(300000, 900000, 10000);
    const cost = rng.step(200000, 800000, 50000);
    const dr2 = rng.pick([10, 15, 20]);
    const debtors = rng.step(100000, 400000, 10000);
    const pr = rng.pick([4, 5]);
    const tr = rng.pick([10, 20, 25]);
    const landCost = rng.step(200000, 600000, 50000);
    const gain = rng.step(20000, 150000, 5000);
    const dep = pc(cost, dr2);
    const pdd = pc(debtors, pr);
    const s = { firm, profit, cost, dr: dr2, dep, debtors, pr, pdd, tr, landCost, gain };
    const n = net(s);
    if (!Number.isInteger(dep) || !Number.isInteger(pdd) || n < 150000 || !Number.isInteger(pc(n, tr)) || dep === pdd) return null;
    return s;
  },
  context: (s) =>
    [
      `${s.firm.name}, ${s.firm.town}, closes its books on 31 March 2026. The owner keeps part of the profit in the business.`,
      `${C.profit}: ${inr(s.profit)}`,
      `${C.machine}: ${inr(s.cost)}; depreciation ${s.dr}% a year on cost, credited to Provision for Depreciation A/c`,
      `${C.debtors}: ${inr(s.debtors)}; a provision for doubtful debts of ${s.pr}% is created for the first time`,
      `Transfer to General Reserve: ${s.tr}% of the net profit`,
      `${C.land}: cost ${inr(s.landCost)}, sold for ${inr(s.landCost + s.gain)}; the gain is not part of the profit above and is kept in a reserve`,
    ].join('\n'),
  parts: [
    {
      kind: 'journal',
      make: (s) => ({
        prompt: 'Pass the journal entry for the depreciation of the year.',
        lines: [dr('depreciation', s.dep), cr('provisionForDepreciation', s.dep)],
        explanation: [
          `Depreciation = ${s.dr}% of ${inr(s.cost)} = ${inr(s.dep)}, an expense of the year: Depreciation A/c is debited.`,
          'The machinery stays at cost, so the credit goes to Provision for Depreciation A/c.',
        ],
        hints: [
          'Is the machinery account itself reduced, or is the depreciation gathered in another account?',
          'Depreciation A/c Dr; To Provision for Depreciation A/c, with the year\'s depreciation on cost.',
        ],
        distractorAccounts: ['machinery', 'generalReserve', 'repairs'],
      }),
      verify: (q) => {
        const t = ctx(q);
        const dep = pc(fig(t, C.machine), rate(t, C.machine));
        return q.expected.some((l) => l.accountId === 'provisionForDepreciation' && l.side === 'Cr' && l.amount === rs(dep));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          'What is the net profit for the year?',
          net(s),
          [
            [s.profit - s.dep, 'Left out the provision for doubtful debts, which is a charge against profit.'],
            [s.profit - s.pdd, 'Left out the depreciation, which is a charge against profit.'],
            [net(s) - pc(net(s), s.tr), 'Also deducted the transfer to General Reserve, which is made out of the net profit after it is found.'],
            [net(s) + s.gain, 'Added the gain on the land, which the case says is not part of the profit and goes to a reserve of its own.'],
          ],
          [
            `Depreciation = ${inr(s.dep)}; provision for doubtful debts = ${s.pr}% of ${inr(s.debtors)} = ${inr(s.pdd)}. Both are charges.`,
            `Net profit = ${inr(s.profit)} - ${inr(s.dep)} - ${inr(s.pdd)} = ${inr(net(s))}.`,
          ],
          H.reserve,
        ),
      verify: (q) => {
        const t = ctx(q);
        return q.answer === rs(fig(t, C.profit) - pc(fig(t, C.machine), rate(t, C.machine)) - pc(fig(t, C.debtors), rate(t, C.debtors)));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          'How much is transferred to General Reserve?',
          pc(net(s), s.tr),
          [
            [pc(s.profit, s.tr), 'Took the rate on the profit before depreciation and the provision were charged.'],
            [pc(net(s) + s.gain, s.tr), 'Added the gain on the land to the profit; it is a capital profit and goes to a capital reserve.'],
            [net(s) - pc(net(s), s.tr), 'Gave what is left for the capital instead of the transfer.'],
          ],
          [`Net profit = ${inr(net(s))} (after both charges).`, `Transfer = ${s.tr}% of ${inr(net(s))} = ${inr(pc(net(s), s.tr))}.`],
          H.reserve,
        ),
      verify: (q) => {
        const t = ctx(q);
        const n = fig(t, C.profit) - pc(fig(t, C.machine), rate(t, C.machine)) - pc(fig(t, C.debtors), rate(t, C.debtors));
        return q.answer === rs(pc(n, rate(t, 'Transfer to General Reserve')));
      },
    },
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          `In which reserve is the gain of ${inr(s.gain)} on the land kept?`,
          'A capital reserve',
          [
            ['General Reserve, a revenue reserve', 'Treated the gain on a fixed asset as trading profit.'],
            ['A provision for depreciation', 'A provision is a charge against profit; this gain is a profit kept back.'],
            ['A secret reserve', 'Thought a reserve shown in the books is a hidden one.'],
          ],
          `Land is a fixed asset. Selling it for ${inr(s.landCost + s.gain)} against its cost of ${inr(s.landCost)} gives a capital profit of ${inr(s.gain)}, which is kept in a capital reserve, apart from the revenue reserves made out of trading profit.`,
          H.kind,
        ),
      verify: (q) => picked(q) === 'A capital reserve',
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          'What is the total of the two reserves made this year (General Reserve and the reserve for the gain on land)?',
          pc(net(s), s.tr) + s.gain,
          [
            [pc(net(s), s.tr) + s.landCost + s.gain, 'Took the whole sale price of the land instead of the gain.'],
            [pc(net(s), s.tr), 'Left out the capital reserve.'],
            [pc(net(s), s.tr) + s.gain + s.dep + s.pdd, 'Counted the provisions as reserves; they are charges against profit.'],
          ],
          [`General Reserve = ${inr(pc(net(s), s.tr))}; capital reserve = ${inr(s.landCost + s.gain)} - ${inr(s.landCost)} = ${inr(s.gain)}.`, `Total = ${inr(pc(net(s), s.tr) + s.gain)}.`],
          H.reserve,
        ),
      verify: (q) => {
        const t = ctx(q);
        const n = fig(t, C.profit) - pc(fig(t, C.machine), rate(t, C.machine)) - pc(fig(t, C.debtors), rate(t, C.debtors));
        const [cost, sold] = (lineOf(t, C.land).match(/₹[\d,]+/g) ?? []).map((m) => Number(m.slice(1).replace(/,/g, '')));
        return q.answer === rs(pc(n, rate(t, 'Transfer to General Reserve')) + sold - cost);
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 3. Complex: the provision over two years, the second ending in a charge or in a write-back.
// ---------------------------------------------------------------------------------------------------------------

interface TwoYears {
  firm: (typeof FIRMS)[number];
  d1: number;
  r1: number;
  n1: number;
  b2: number;
  d2: number;
  r2: number;
  n2: number;
}

const Y = {
  d1: 'Debtors on 31 March 2025, after all bad debts',
  bad: 'Bad debts written off during 2025-26',
  d2: 'Debtors on 31 March 2026, after all bad debts',
};
/** The year-end figure of the second year: positive for a charge, negative for a write-back. */
const yearEnd = (s: TwoYears): number => s.b2 + s.n2 - s.n1;

const caseTwoYears = caseTemplate<TwoYears>({
  id: 'case-prc-two-years',
  ...common,
  difficulty: 'complex',
  title: 'A provision over two years',
  setup: (rng) => {
    const firm = rng.pick(FIRMS);
    const r1 = rng.pick([5, 10]);
    const d1 = rng.step(150000, 450000, 10000);
    const n1 = pc(d1, r1);
    const b2 = rng.step(2000, Math.floor((n1 * 3) / 4 / 1000) * 1000, 1000);
    const r2 = rng.pick([4, 5, 10]);
    const d2 = Math.max(100000, d1 + 10000 * rng.int(-8, 8));
    const n2 = pc(d2, r2);
    const s = { firm, d1, r1, n1, b2, d2, r2, n2 };
    if (!Number.isInteger(n1) || !Number.isInteger(n2) || b2 >= n1 || yearEnd(s) === 0 || n2 === n1) return null;
    return s;
  },
  context: (s) =>
    [
      `${s.firm.name}, ${s.firm.town}, created a provision for doubtful debts for the first time on 31 March 2025. A debt that proves bad is written off to Bad Debts A/c; at the year end the bad debts are set off against the provision, which is then brought to the amount needed through Profit and Loss A/c.`,
      `${Y.d1}: ${inr(s.d1)}; provision created at ${s.r1}%`,
      `${Y.bad}: ${inr(s.b2)}`,
      `${Y.d2}: ${inr(s.d2)}; provision to be kept at ${s.r2}%`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          'What does Provision for Doubtful Debts A/c show on 31 March 2026, after the bad debts of 2025-26 are set off and before the year-end adjustment?',
          s.n1 - s.b2,
          [
            [s.n1, 'Forgot to set the bad debts of the year off against the provision.'],
            [s.n1 + s.b2, 'Added the bad debts to the provision instead of setting them off against it.'],
            [s.n2, 'Gave the provision now needed instead of what the account holds before the adjustment.'],
          ],
          [`Provision created on 31 March 2025 = ${s.r1}% of ${inr(s.d1)} = ${inr(s.n1)}.`, `Less bad debts set off: ${inr(s.n1)} - ${inr(s.b2)} = ${inr(s.n1 - s.b2)}.`],
          H.provision,
        ),
      verify: (q) => {
        const t = ctx(q);
        return q.answer === rs(pc(fig(t, Y.d1), rate(t, Y.d1)) - fig(t, Y.bad));
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const x = Math.abs(yearEnd(s));
        const charge = `${inr(x)} is charged to the Profit and Loss Account`;
        const back = `${inr(x)} is written back to the Profit and Loss Account`;
        const plain = Math.abs(s.n2 - s.n1);
        const right = yearEnd(s) > 0 ? charge : back;
        const wrongPlain = s.n2 > s.n1 ? `${inr(plain)} is charged to the Profit and Loss Account` : `${inr(plain)} is written back to the Profit and Loss Account`;
        return choice(
          'What is the effect of the year-end adjustment of 31 March 2026 on the Profit and Loss Account?',
          right,
          [
            [yearEnd(s) > 0 ? back : charge, 'Read the direction the wrong way round: compare what the account holds after the bad debts with what is needed.'],
            [wrongPlain, 'Compared only the old and the new provision and forgot that the old one first met the bad debts of the year.'],
            [`${inr(s.n2)} is charged to the Profit and Loss Account`, 'Charged the whole new provision, ignoring what the account already holds.'],
            [`${inr(s.b2 + s.n2)} is charged to the Profit and Loss Account`, 'Charged the bad debts and the new provision in full, ignoring the old provision.'],
          ],
          yearEnd(s) > 0
            ? `The account holds ${inr(s.n1)} - ${inr(s.b2)} = ${inr(s.n1 - s.b2)} and ${inr(s.n2)} is needed (${s.r2}% of ${inr(s.d2)}), so ${inr(x)} more is charged: bad debts ${inr(s.b2)} + new provision ${inr(s.n2)} - old provision ${inr(s.n1)}.`
            : `The account holds ${inr(s.n1)} - ${inr(s.b2)} = ${inr(s.n1 - s.b2)} and only ${inr(s.n2)} is needed (${s.r2}% of ${inr(s.d2)}), so the surplus of ${inr(x)} is written back: the old provision ${inr(s.n1)} is more than the bad debts ${inr(s.b2)} and the new provision ${inr(s.n2)} together.`,
          H.entry,
        );
      },
      verify: (q) => {
        const t = ctx(q);
        const net2 = fig(t, Y.bad) + pc(fig(t, Y.d2), rate(t, Y.d2)) - pc(fig(t, Y.d1), rate(t, Y.d1));
        return picked(q) === `${inr(Math.abs(net2))} is ${net2 > 0 ? 'charged' : 'written back'} to the Profit and Loss Account`;
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const x = Math.abs(yearEnd(s));
        const up = yearEnd(s) > 0;
        return {
          prompt: 'Pass the year-end entry of 31 March 2026 that brings the provision to the amount needed.',
          lines: up ? [dr('profitAndLoss', x), cr('provisionForDoubtfulDebts', x)] : [dr('provisionForDoubtfulDebts', x), cr('profitAndLoss', x)],
          explanation: [
            `Provision needed = ${s.r2}% of ${inr(s.d2)} = ${inr(s.n2)}; the account holds ${inr(s.n1 - s.b2)}.`,
            up
              ? `It must rise by ${inr(x)}: Profit and Loss A/c is debited and Provision for Doubtful Debts A/c credited.`
              : `It holds ${inr(x)} too much: Provision for Doubtful Debts A/c is debited and Profit and Loss A/c credited, which raises the profit.`,
          ],
          hints: H.entry,
          distractorAccounts: ['badDebts', 'sales', 'badDebtsRecovered'],
        };
      },
      verify: (q) => {
        const t = ctx(q);
        const net2 = fig(t, Y.bad) + pc(fig(t, Y.d2), rate(t, Y.d2)) - pc(fig(t, Y.d1), rate(t, Y.d1));
        const want = net2 > 0 ? 'provisionForDoubtfulDebts' : 'profitAndLoss';
        return q.expected.some((l) => l.side === 'Cr' && l.accountId === want && l.amount === rs(Math.abs(net2)));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          'At what amount are the debtors shown in the balance sheet of 31 March 2026?',
          s.d2 - s.n2,
          [
            [s.d2 - s.n1 + s.b2, 'Deducted what the provision account held before the adjustment instead of the provision now needed.'],
            [s.d2 - s.b2 - s.n2, 'Deducted the bad debts again; the debtors are already stated after them.'],
            [s.d2, 'Left out the provision for doubtful debts.'],
          ],
          [`Debtors ${inr(s.d2)} less provision ${inr(s.n2)} = ${inr(s.d2 - s.n2)}.`],
          H.debtors,
        ),
      verify: (q) => {
        const t = ctx(q);
        return q.answer === rs(fig(t, Y.d2) - pc(fig(t, Y.d2), rate(t, Y.d2)));
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 4. Medium: a provision for discount on debtors beside the provision for doubtful debts (added with the final accounts
// with adjustments, where the provision for discount is entered and shown; last in the list, so no case moves).
// ---------------------------------------------------------------------------------------------------------------

interface Discount {
  firm: (typeof FIRMS)[number];
  d: number;
  b2: number;
  r: number;
  n: number;
  q: number;
  x: number;
}

const D = {
  debtors: 'Sundry debtors (trial balance)',
  further: 'Further bad debts to be written off',
  pddRate: 'Provision for doubtful debts (none in the books) to be made at',
  discRate: 'Provision for discount on debtors (none in the books) to be made at',
};

const H_DISCOUNT = [
  'A debtor who will not pay takes no discount for paying early. Which debtors are left once the bad and the doubtful ones are out?',
  'Good debtors = Debtors - Further bad debts - Provision for doubtful debts; provision for discount = Rate % x Good debtors.',
];

const caseDiscountOnDebtors = caseTemplate<Discount>({
  id: 'case-prc-discount-on-debtors',
  ...common,
  difficulty: 'medium',
  title: 'A provision for discount on debtors',
  setup: (rng) => {
    const firm = rng.pick(FIRMS);
    // The debtors left after the further bad debts are in round tens of thousands, so that both provisions are round.
    const b2 = rng.step(4000, 20000, 1000);
    const d = rng.step(150000, 500000, 10000) + b2;
    const r = rng.pick([5, 10]);
    const n = pc(d - b2, r);
    const fits = [2, 2, 1, 3].filter((k) => pc(d - b2 - n, k) % 10 === 0);
    if (fits.length === 0) return null;
    const q = rng.pick(fits);
    const x = pc(d - b2 - n, q);
    return { firm, d, b2, r, n, q, x };
  },
  context: (s) =>
    [
      `${s.firm.name}, ${s.firm.town}, allows its customers a cash discount for paying early and closes its books on 31 March 2026.`,
      `${D.debtors}: ${inr(s.d)}`,
      `${D.further}: ${inr(s.b2)}`,
      `${D.pddRate}: ${s.r}% of the debtors left after the further bad debts`,
      `${D.discRate}: ${s.q}% of the good debtors`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          'What is the provision for doubtful debts?',
          s.n,
          [
            [pc(s.d, s.r), 'Took the rate on the debtors before the further bad debts were written off.'],
            [s.d - s.b2 - s.n, 'Gave the debtors left after the provision instead of the provision.'],
            [pc(s.d - s.b2, s.q), 'Used the rate of the provision for discount.'],
          ],
          [`Debtors left = ${inr(s.d)} - ${inr(s.b2)} = ${inr(s.d - s.b2)}.`, `Provision for doubtful debts = ${s.r}% of ${inr(s.d - s.b2)} = ${inr(s.n)}.`],
          H.provision,
        ),
      verify: (q) => {
        const t = ctx(q);
        return q.answer === rs(pc(fig(t, D.debtors) - fig(t, D.further), rate(t, D.pddRate)));
      },
    },
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          'In what order are the further bad debts, the provision for doubtful debts and the provision for discount dealt with?',
          'Further bad debts, then the provision for doubtful debts, then the provision for discount',
          [
            ['The provision for discount first, then the further bad debts, then the provision for doubtful debts', 'Reversed the order: discount is reckoned only on the debtors expected to pay.'],
            ['The provision for doubtful debts first, then the further bad debts, then the provision for discount', 'Made the provision before writing off the debts that are already lost.'],
            ['All three on the full debtors of the trial balance, in any order', 'Each step works on the debtors the step before it leaves.'],
          ],
          `Debts already lost go first (${inr(s.b2)}); the doubtful part of what is left next (${inr(s.n)}); the discount only on the good debtors, who will pay.`,
          H_DISCOUNT,
        ),
      verify: (q) => picked(q) === 'Further bad debts, then the provision for doubtful debts, then the provision for discount',
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          'What is the provision for discount on debtors?',
          s.x,
          [
            [pc(s.d, s.q), 'Took the rate on the debtors of the trial balance, before the bad and the doubtful debts came off.'],
            [pc(s.d - s.b2, s.q), 'Took the rate on the debtors after the further bad debts but before the provision for doubtful debts.'],
            [pc(s.d - s.b2 - s.n, s.r), 'Used the rate of the provision for doubtful debts.'],
          ],
          [
            `Good debtors = ${inr(s.d)} - ${inr(s.b2)} - ${inr(s.n)} = ${inr(s.d - s.b2 - s.n)}.`,
            `Provision for discount = ${s.q}% of ${inr(s.d - s.b2 - s.n)} = ${inr(s.x)}.`,
          ],
          H_DISCOUNT,
        ),
      verify: (q) => {
        const t = ctx(q);
        const left = fig(t, D.debtors) - fig(t, D.further);
        return q.answer === rs(pc(left - pc(left, rate(t, D.pddRate)), rate(t, D.discRate)));
      },
    },
    {
      kind: 'journal',
      make: (s) => ({
        prompt: 'Pass the adjusting entry for the provision for discount on debtors.',
        lines: [dr('profitAndLoss', s.x), cr('provisionForDiscountOnDebtors', s.x)],
        explanation: [
          `The provision for discount is ${inr(s.x)}.`,
          "The discount the good debtors are expected to take is a charge against this year's profit: Profit and Loss A/c is debited.",
          'It is kept against the debtors: Provision for Discount on Debtors A/c is credited.',
        ],
        hints: ['Is the provision a charge against profit, or money owed to someone?', 'Profit and Loss A/c Dr; To Provision for Discount on Debtors A/c.'],
        distractorAccounts: ['discountAllowed', 'discountReceived', 'provisionForDoubtfulDebts'],
      }),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          'At what amount are the sundry debtors shown in the balance sheet?',
          s.d - s.b2 - s.n - s.x,
          [
            [s.d - s.b2 - s.n, 'Did not deduct the provision for discount.'],
            [s.d - s.n - s.x, 'Did not deduct the further bad debts.'],
            [s.d - s.b2 - s.x, 'Did not deduct the provision for doubtful debts.'],
          ],
          [`${inr(s.d)} - further bad debts ${inr(s.b2)} - provision for doubtful debts ${inr(s.n)} - provision for discount ${inr(s.x)} = ${inr(s.d - s.b2 - s.n - s.x)}.`],
          H_DISCOUNT,
        ),
      verify: (q) => {
        const t = ctx(q);
        const left = fig(t, D.debtors) - fig(t, D.further);
        const good = left - pc(left, rate(t, D.pddRate));
        return q.answer === rs(good - pc(good, rate(t, D.discRate)));
      },
    },
  ],
});

const cases: CaseTemplate[] = [caseDebtorsYearEnd, caseChargesAndReserves, caseTwoYears, caseDiscountOnDebtors];

export default cases;
