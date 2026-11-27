/**
 * Case studies of the first Class 12 stage: one partnership firm and one year, from the net profit to what each
 * partner is finally credited with. They use the topic Fundamentals of Partnership only.
 *
 * Everything is made with the examined code of that topic (`PF_CASE` in `templates/partnership-fundamentals.ts`):
 * its partners, firms and years, its interest on capital (a full year on the opening capital, and capital brought in
 * or withdrawn for the months from its date), its drawings and their interest, its profit that leaves every share in
 * whole hundreds, its single adjusting entry, the year of its formats (`partnersYear`) with the entries that write
 * the partners' accounts up (`yearEntries`) and its Profit and Loss Appropriation Account (`appropriationAccount`).
 *
 * The rulings of the topic, each stated in the case text where a part relies on it: interest on a partner's loan is
 * a charge against profit (6% p.a. when nothing is agreed), never an item of the Appropriation Account; interest on
 * drawings is credited to Profit and Loss Appropriation A/c; a commission "after charging such commission" is the
 * profit x rate / (100 + rate); a deficiency in a guaranteed share is borne by whoever gave the guarantee, in the
 * ratio stated; every case says whether capitals are fixed or fluctuating; shares of profit come out in whole
 * hundreds or better.
 *
 * Every typed answer is checked another way by its `verify`, from the printed case: interest on capital by the
 * product method, interest on drawings withdrawal by withdrawal, a guaranteed share by giving the junior partner the
 * guaranteed amount and the guarantors what is left, a past adjustment by sharing a profit out both ways.
 */
import type { AccountQuestion, JournalQuestion, JournalSetQuestion } from '@/content/types';
import { partnerCapital, partnerCurrent, partnerDrawings } from '@/engine/accounts';
import { columnarAccount, post } from '@/engine/books';
import type { Rng } from '@/engine/rng';
import { caseTemplate, columnarSides, lowestTerms, partnerColumns, rupees, setHolds } from '../authoring';
import { PF_CASE as P, type PfDrawKind, type PfDrawn, type PfMove, type PfPartnersYear, type PfYear } from '../templates/partnership-fundamentals';
import type { AccountSideParts, CaseTemplate, FormatRowParts, JournalParts, NumericParts, SetTransaction } from '../types';

const TOPIC = 'partnership-fundamentals';
const CONCEPT = 'pf-case';
const { inr, sum, near, list, ratioText, each, ownId, ownName, capitalsAre, whyOwn, firstOf, APP } = P;

type Errs = [number, string][];
/** A numeric part from whole rupees: the wrong figures that are not whole, or repeat, are dropped (`numeric` of the topic). */
function num(prompt: string, answer: number, errs: Errs, explanation: string[], hints?: string[]): NumericParts | null {
  const n = P.numeric(answer, errs);
  return n && { prompt, ...n, explanation, ...(hints ? { hints } : {}) };
}
/** The lines of the printed case. */
const caseLines = (q: { context?: string }): string[] => (q.context ?? '').split('\n');
/** The account of a partner that this firm does not use for the year: the slip of a fixed or a fluctuating capital. */
const otherOwn = (fixed: boolean, name: string): string => (fixed ? partnerCapital(name) : partnerCurrent(name));
const otherOwnName = (fixed: boolean, name: string): string => `${name}'s ${fixed ? 'Capital' : 'Current'} A/c`;
/** "₹20,000 + ₹15,000 = ₹35,000". */
const added = (xs: readonly number[]): string => (xs.length === 1 ? inr(xs[0]) : `${xs.map(inr).join(' + ')} = ${inr(sum(xs))}`);
const capitalsLine = (fixed: boolean, yr: PfYear, names: string[], caps: number[]): string => `${fixed ? 'Fixed capitals' : 'Capitals'} on ${yr.from}: ${each(names, caps)}`;
const moveLine = (yr: PfYear, names: string[], m: PfMove): string => `${firstOf(yr, m.k)}: ${P.moveSays(names, m)}`;
const CAPITALS_RE = /^(Fixed capitals|Capitals) on/;
/**
 * A base for capitals in `units` that puts the firm's total capital between `lo` and `hi`, so that the profit of the
 * year can be a believable part of it (about 10% to 40%); null when none does.
 */
function capitalBase(rng: Rng, units: readonly number[], lo: number, hi: number): number | null {
  const fits = [50000, 100000, 200000].filter((b) => sum(units) * b >= lo && sum(units) * b <= hi);
  return fits.length > 0 ? rng.pick(fits) : null;
}
/** The most a firm with `capital` earns in a year in these cases: 40% of it. */
const PROFIT_CAP = 0.4;

// ---------------------------------------------------------------------------------------------------------------
// 1. case-pf-no-deed: a firm with no deed. A partner's loan and claims to a salary, to interest on capital or to
//    shares in the ratio of capitals: what the Act allows, and what that leaves each partner (easy)
// ---------------------------------------------------------------------------------------------------------------

type Claim = 'salary' | 'capital' | 'ratio';
interface NoDeed {
  names: string[];
  yr: PfYear;
  firm: string;
  silent: string;
  caps: number[];
  li: number;
  k: number;
  m: number;
  asked: number;
  loan: number;
  interest: number;
  claims: Claim[];
  si: number;
  s: number;
  ci: number;
  r: number;
  largest: number;
  divisible: number;
  profit: number;
  i: number;
}

const noDeed = caseTemplate<NoDeed>({
  id: 'case-pf-no-deed',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'easy',
  title: 'A firm with no partnership deed',
  setup: (rng) => {
    const n = rng.pick([2, 2, 3]);
    const names = P.partners(rng, n);
    const yr = P.yearOf(rng);
    const firm = P.firmOf(rng);
    const silent = rng.pick(['They have no partnership deed.', 'They have no written deed, and their oral agreement settles none of the points below.']);
    const claims = rng.pick<Claim[]>([['salary'], ['capital'], ['ratio'], ['salary', 'capital'], ['salary', 'ratio'], ['capital', 'ratio']]);
    // Capitals in an order drawn for the seed; a claim to share by capitals needs one capital larger than the others.
    const units = rng.shuffle(rng.pick((n === 2 ? P.CAPS2 : P.CAPS3).filter((u) => u[0] > u[1])));
    const base = capitalBase(rng, units, 300000, 1500000);
    if (base === null) return null;
    const caps = units.map((u) => u * base);
    const largest = caps.indexOf(Math.max(...caps));
    const li = rng.int(0, n - 1);
    const k = rng.int(0, 3) === 0 ? 0 : rng.int(1, 9);
    const m = 12 - k;
    const asked = rng.pick([8, 9, 10, 12]);
    // A loan in keeping with the capitals: at most half of them.
    const loan = 20000 * rng.int(5, Math.max(5, Math.min(25, Math.floor(sum(caps) / 40000))));
    const interest = (loan * 6 * m) / 1200;
    const si = rng.int(0, n - 1);
    const s = rng.step(3000, 10000, 1000);
    const ci = rng.int(0, n - 1);
    const r = rng.pick([8, 10, 12]);
    // A profit of about 15% to 35% of the capitals.
    const step = n * 1000;
    const divisible = step * rng.int(Math.ceil((0.15 * sum(caps)) / step), Math.floor((0.35 * sum(caps)) / step));
    const claimant = { salary: si, capital: ci, ratio: largest }[claims[0]];
    const i = rng.int(0, 2) > 0 ? claimant : rng.int(0, n - 1);
    return { names, yr, firm, silent, caps, li, k, m, asked, loan, interest, claims, si, s, ci, r, largest, divisible, profit: divisible + interest, i };
  },
  context: (s) =>
    [
      `${list(s.names)} are partners in ${s.firm}. ${s.silent} Their capitals are fluctuating.`,
      `Capitals on ${s.yr.from}: ${each(s.names, s.caps)}`,
      `${firstOf(s.yr, s.k)}: ${s.names[s.li]} gave the firm a loan of ${inr(s.loan)} and asks for interest on it at ${s.asked}% p.a.`,
      ...(s.claims.includes('salary') ? [`${s.names[s.si]} works full time in the business and claims a salary of ${inr(s.s)} per month.`] : []),
      ...(s.claims.includes('capital') ? [`${s.names[s.ci]} wants interest on capital at ${s.r}% p.a. allowed to every partner.`] : []),
      ...(s.claims.includes('ratio') ? [`${s.names[s.largest]}, whose capital is the largest, wants the profit shared in the ratio of capitals.`] : []),
      `Profit for the ${s.yr.ended}, before any interest on the loan: ${inr(s.profit)}`,
    ].join('\n'),
  parts: [
    {
      kind: 'mcq',
      make: (s) => {
        const lender = s.names[s.li];
        return P.choice(
          'Which one of these does the Indian Partnership Act, 1932 allow, as the case stands?',
          `Interest on ${lender}'s loan at 6% p.a.`,
          [
            [`Interest on ${lender}'s loan at ${s.asked}% p.a., as asked`, 'Took the rate the partner asks for; with nothing agreed, the Act fixes the rate at 6% p.a.'],
            [`No interest on ${lender}'s loan, because nothing was agreed`, "Applied the rule for capital to a loan; a partner's loan earns 6% p.a. even when nothing has been agreed."],
            ...(s.claims.includes('salary') ? ([[`A salary of ${inr(s.s)} per month to ${s.names[s.si]}`, "Thought that working full time earns a salary by itself; a partner's salary needs an agreement of the partners."]] as [string, string][]) : []),
            ...(s.claims.includes('capital') ? ([[`Interest on capital at ${s.r}% p.a. to every partner`, "Took one partner's wish for an agreement; without one, no interest on capital is allowed."]] as [string, string][]) : []),
            ...(s.claims.includes('ratio') ? ([[`Sharing the profit in the ratio of capitals, ${ratioText(lowestTerms(s.caps))}`, 'Let the capitals decide the shares; without an agreement the profit is shared equally.']] as [string, string][]) : []),
          ],
          "The partners have agreed on none of these points, so the Indian Partnership Act, 1932 decides them: the profit is shared equally, whatever the capitals; no partner gets a salary or commission; no interest is allowed on capital and none is charged on drawings; and a partner's loan to the firm earns interest at 6% p.a.",
          P.H.noDeed,
        );
      },
      verify: (q) => {
        const lender = /: (\w+) gave the firm a loan/.exec(q.context ?? '')?.[1];
        return lender !== undefined && P.optionText(q) === `Interest on ${lender}'s loan at 6% p.a.`;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { loan, m, k, asked } = s;
        return num(
          `How much interest on the loan is ${s.names[s.li]} entitled to for the ${s.yr.ended}?`,
          s.interest,
          [
            [(loan * asked * m) / 1200, `Used the ${asked}% that the partner asks for; without an agreement the rate is 6% p.a.`],
            ...(m < 12 ? ([[(loan * 6) / 100, 'Charged interest for the whole year, although the loan was given part-way through it.']] as Errs) : []),
            ...(k > 0 ? ([[(loan * 6 * k) / 1200, 'Counted the months before the loan was given instead of the months after it.']] as Errs) : []),
            ...(k > 0 ? ([[(loan * 6 * (m - 1)) / 1200, 'Left out the month in which the loan was given, although it came on the first day of that month.']] as Errs) : []),
            ...(m === 12 ? ([[(loan * 6 * 6) / 1200, 'Charged six months, the period used for drawings whose dates are not known; the loan was with the firm all year.']] as Errs) : []),
          ],
          [
            "With no agreement on the rate, a partner's loan earns interest at 6% p.a.",
            `From ${firstOf(s.yr, k)} to ${s.yr.on} is ${m} months.`,
            `Interest = ${inr(loan)} x 6/100 x ${m}/12 = ${inr(s.interest)}. It is a charge against profit, credited to ${s.names[s.li]}'s Loan A/c.`,
          ],
          P.H.noDeed,
        );
      },
      verify: (q) => {
        const line = caseLines(q).find((l) => l.includes('gave the firm a loan')) ?? '';
        return near(q.answer / 100, (P.amountsIn(line)[0] * 6 * P.monthsLeft(line)[0]) / 1200);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const atAsked = (s.loan * s.asked * s.m) / 1200;
        return num(
          'How much profit is left to be shared among the partners?',
          s.divisible,
          [
            [s.profit, 'Did not charge the interest on the loan; it is a charge against profit that the Act allows even without an agreement.'],
            [s.profit - atAsked, `Charged the loan at the ${s.asked}% asked for instead of 6% p.a.`],
            ...(s.claims.includes('salary') ? ([[s.divisible - 12 * s.s, 'Also took out the salary that was claimed; without an agreement no partner gets a salary.']] as Errs) : []),
            ...(s.claims.includes('capital') ? ([[s.divisible - (sum(s.caps) * s.r) / 100, 'Also took out the interest on capital that was asked for; without an agreement none is allowed.']] as Errs) : []),
            ...(s.m < 12 ? ([[s.profit - (s.loan * 6) / 100, 'Charged the interest on the loan for the whole year, although the loan came part-way through it.']] as Errs) : []),
          ],
          [
            `Interest on the loan at 6% p.a. for ${s.m} months = ${inr(s.interest)}: a charge, taken out before anything is shared.`,
            `Nothing else is allowed without an agreement: no salary and no interest on capital.`,
            `Profit to be shared = ${inr(s.profit)} - ${inr(s.interest)} = ${inr(s.divisible)}.`,
          ],
          P.H.charge,
        );
      },
      verify: (q) => {
        const rows = caseLines(q);
        const line = rows.find((l) => l.includes('gave the firm a loan')) ?? '';
        const profit = P.amountsIn(P.rowOf(rows, 'Profit for the'))[0];
        return near(q.answer / 100, profit - (P.amountsIn(line)[0] * 6 * P.monthsLeft(line)[0]) / 1200);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const n = s.names.length;
        const nm = s.names[s.i];
        const share = s.divisible / n;
        const ioc = s.caps.map((c) => (c * s.r) / 100);
        return num(
          `What is ${nm}'s share of the profit of the year${s.i === s.li ? ', apart from the interest on the loan' : ''}?`,
          share,
          [
            [(s.divisible * s.caps[s.i]) / sum(s.caps), 'Shared the profit in the ratio of capitals; without an agreement the capitals do not decide the shares.'],
            ...(s.claims.includes('salary')
              ? ([
                  s.i === s.si
                    ? [(s.divisible - 12 * s.s) / n + 12 * s.s, 'Allowed the salary claimed and shared only the rest; without an agreement no partner gets a salary.']
                    : [(s.divisible - 12 * s.s) / n, 'Took out the salary claimed before sharing; without an agreement no partner gets a salary.'],
                ] as Errs)
              : []),
            ...(s.claims.includes('capital') ? ([[(s.divisible - sum(ioc)) / n + ioc[s.i], 'Allowed the interest on capital that was asked for; without an agreement none is allowed.']] as Errs) : []),
            [s.profit / n, 'Shared the profit before charging the interest on the loan.'],
            ...(s.i === s.li ? ([[share + s.interest, 'Added the interest on the loan to the share of profit; it is credited to the loan account, apart from the profit.']] as Errs) : []),
          ],
          [
            `Profit to be shared = ${inr(s.profit)} - interest on the loan ${inr(s.interest)} = ${inr(s.divisible)}.`,
            `With no agreement the profit is shared equally: ${inr(s.divisible)} / ${n} = ${inr(share)}.`,
          ],
          P.H.noDeed,
        );
      },
      verify: (q) => {
        const rows = caseLines(q);
        const n = P.namesIn(rows[0]).length;
        const line = rows.find((l) => l.includes('gave the firm a loan')) ?? '';
        const profit = P.amountsIn(P.rowOf(rows, 'Profit for the'))[0];
        // The equal shares of all the partners and the interest on the loan use up the profit.
        return n >= 2 && near((q.answer / 100) * n + (P.amountsIn(line)[0] * 6 * P.monthsLeft(line)[0]) / 1200, profit);
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 2. case-pf-interest-year: interest on capital with capital brought in or withdrawn, interest on drawings of
//    several kinds, and then the divisible profit and each partner's share (medium)
// ---------------------------------------------------------------------------------------------------------------

interface InterestYear {
  names: string[];
  yr: PfYear;
  firm: string;
  fixed: boolean;
  psr: number[];
  caps: number[];
  r: number;
  moves: PfMove[];
  ioc: number[];
  working: string[];
  q: number;
  kinds: PfDrawKind[];
  drawn: PfDrawn[];
  iod: number[];
  si: number;
  s: number;
  salary: number;
  profit: number;
  divisible: number;
  shares: number[];
  /** The move asked about, the partner whose interest on drawings is asked, the partner whose share is asked. */
  mi: number;
  di: number;
  i: number;
  ask: 'iod' | 'move';
}

/** The year read back from its case text: interest on capital by the product method, interest on drawings withdrawal by withdrawal. */
function readInterestYear(rows: string[]) {
  const [head, ...rest] = rows;
  const names = P.namesIn(head);
  const psr = P.psrIn(head);
  const caps = P.amountsIn(rest.find((l) => CAPITALS_RE.test(l)) ?? '');
  const r = P.rateIn(P.rowOf(rest, 'Interest on capital'));
  const changes = P.changesIn(rest, names);
  const ioc = caps.map((c, j) => P.productInterest(c, r, changes[j]));
  const q = P.rateIn(P.rowOf(rest, 'Interest on drawings'));
  const drawn = P.rowOf(rest, 'Drawings: ').slice('Drawings: '.length).split('; ');
  const iod = names.map((nm) => P.interestOnDrawn(drawn.find((t) => t.startsWith(`${nm} `)) ?? '', q));
  const salaryRow = P.rowOf(rest, 'Salary');
  const salary = names.map((nm) => (salaryRow.endsWith(` to ${nm}`) ? 12 * P.amountsIn(salaryRow)[0] : 0));
  const profit = P.amountsIn(P.rowOf(rest, 'Net profit'))[0];
  return { names, psr, ioc, iod, salary, profit, divisible: profit + sum(iod) - sum(ioc) - sum(salary) };
}

/** The wrong figures of the interest on one partner's drawings, by how the partner drew. */
function drawingErrors(kind: PfDrawKind, q: number, text: string): Errs {
  const amt = P.amountsIn(text)[0];
  if (kind === 'monthly') {
    const when = P.whenIn(text);
    const total = 12 * amt;
    return [
      [(total * q) / 100, 'Charged the whole year on the total, as if it had all been drawn on the first day.'],
      [(total * q * 6) / 1200, 'Used six months, which is for drawings whose dates are not known; here the dates are given.'],
      ...P.WHENS.filter((w) => w !== when).map((w): [number, string] => [(total * q * P.averagePeriod('month', w)) / 1200, `Used ${P.monthsText(P.averagePeriod('month', w))}, the period for drawings made ${P.timing('month', w)}.`]),
    ];
  }
  if (kind === 'date') {
    const months = P.monthsLeft(text)[0];
    return [
      [(amt * q) / 100, 'Charged interest for all twelve months, although the money was taken part-way through the year.'],
      [(amt * q * 6) / 1200, 'Ignored the date and used six months, which is only for drawings whose dates are not known.'],
      [(amt * q * (12 - months)) / 1200, 'Counted the months before the withdrawal instead of the months from it to the end of the year.'],
      [(amt * q * (months - 1)) / 1200, 'Left out the month of the withdrawal, although the money was taken on its first day.'],
    ];
  }
  return [
    [(amt * q) / 100, 'Charged interest for all twelve months. When the dates are not known the drawings are taken as spread evenly over the year, which gives six months.'],
    [(amt * q * 13) / 2400, 'Used 6.5 months, the period for equal drawings at the beginning of every month.'],
    [(amt * q * 11) / 2400, 'Used 5.5 months, the period for equal drawings at the end of every month.'],
  ];
}

const interestYear = caseTemplate<InterestYear>({
  id: 'case-pf-interest-year',
  // Version 2: the average period is said to be the average of the months for the first and the last withdrawal.
  version: 2,
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Interest on capital and drawings, then the shares',
  setup: (rng) => {
    const n = rng.pick([2, 3, 3]);
    const names = P.partners(rng, n);
    const yr = P.yearOf(rng);
    const firm = P.firmOf(rng);
    const fixed = rng.int(0, 1) === 0;
    const psr = P.psrOf(rng, n);
    const total = sum(psr);
    const units = rng.pick(n === 2 ? P.CAPS2 : P.CAPS3);
    const base = capitalBase(rng, units, 500000, 1600000);
    if (base === null) return null;
    const caps = units.map((u) => u * base);
    const r = rng.pick([5, 6, 8, 10]);
    const moves = P.movesOf(rng, caps, rng.pick([1, 1, 2]));
    if (moves === null) return null;
    const { ioc, working } = P.interestOnCapitals(names, caps, r, moves, yr);
    const q = rng.pick([6, 9, 10, 12]);
    const when = rng.pick(P.WHENS);
    // Each partner draws in a way of their own; at least one with dates, so that the period is worked out.
    const kinds = names.map(() => rng.pick<PfDrawKind>(['monthly', 'date', 'none']));
    if (!kinds.some((kd) => kd !== 'none')) kinds[rng.int(0, n - 1)] = rng.pick<PfDrawKind>(['monthly', 'date']);
    const drawn = kinds.map((kd) => P.drawnBy(rng, yr, q, kd, when));
    const iod = drawn.map((d) => d.interest);
    const withSalary = rng.int(0, 1) === 0;
    const si = rng.int(0, n - 1);
    const s = rng.step(2000, 8000, 500);
    const salary = withSalary ? 12 * s : 0;
    const profit = P.profitThatFits(rng, total, (p) => (p > PROFIT_CAP * sum(caps) ? null : p + sum(iod) - sum(ioc) - salary), sum(caps));
    if (profit === null) return null;
    const divisible = profit + sum(iod) - sum(ioc) - salary;
    const shares = psr.map((t) => (divisible * t) / total);
    const dated = names.map((_, j) => j).filter((j) => kinds[j] !== 'none');
    return {
      names, yr, firm, fixed, psr, caps, r, moves, ioc, working, q, kinds, drawn, iod, si, s, salary, profit, divisible, shares,
      mi: rng.int(0, moves.length - 1), di: rng.pick(dated), i: rng.int(0, n - 1), ask: rng.pick(['iod', 'move'] as const),
    };
  },
  context: (s) =>
    [
      `${list(s.names)} are partners in ${s.firm} sharing profits and losses in the ratio ${ratioText(s.psr)}. ${capitalsAre(s.fixed)} The deed provides for the items below.`,
      capitalsLine(s.fixed, s.yr, s.names, s.caps),
      ...s.moves.map((m) => moveLine(s.yr, s.names, m)),
      `Interest on capital: ${s.r}% p.a.`,
      `Drawings: ${s.names.map((nm, j) => `${nm} ${s.drawn[j].text}`).join('; ')}`,
      `Interest on drawings: ${s.q}% p.a.`,
      ...(s.salary > 0 ? [`Salary: ${inr(s.s)} per month to ${s.names[s.si]}`] : []),
      `Net profit for the ${s.yr.ended} as per Profit and Loss A/c: ${inr(s.profit)}`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const m = s.moves[s.mi];
        const j = m.i;
        const full = (s.caps[j] * s.r) / 100;
        const part = (m.amt * s.r * (12 - m.k)) / 1200;
        const before = (m.amt * s.r * m.k) / 1200;
        const brought = m.kind === 'in';
        const after = brought ? s.caps[j] + m.amt : s.caps[j] - m.amt;
        const date = firstOf(s.yr, m.k);
        return num(
          `How much interest on capital is ${s.names[j]} allowed for the ${s.yr.ended}?`,
          s.ioc[j],
          [
            [(after * s.r) / 100, 'Charged a full year on the capital as it stood after the change.'],
            [full, `Took interest on the opening capital only and ignored the capital ${brought ? 'brought in' : 'withdrawn'} on ${date}.`],
            [brought ? full + before : full - before, 'Counted the months before the change instead of the months from it to the end of the year.'],
            brought ? [full + (m.amt * s.r) / 100, 'Gave the fresh capital interest for the whole year, although it came in part-way through.'] : [full + part, 'Added interest on the capital withdrawn instead of deducting it.'],
          ],
          [
            'Interest runs on the opening capital for the whole year, and on capital brought in or withdrawn for the months from its date to the end of the year.',
            s.working[j],
          ],
          P.H.ioc,
        );
      },
      verify: (q) => {
        const y = readInterestYear(caseLines(q));
        const j = y.names.indexOf(/capital is (\w+) allowed/.exec(q.prompt)?.[1] ?? '');
        return j >= 0 && near(q.answer / 100, y.ioc[j]);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const j = s.di;
        const d = s.drawn[j];
        return num(
          `Find the interest on ${s.names[j]}'s drawings for the year.`,
          s.iod[j],
          drawingErrors(s.kinds[j], s.q, d.text),
          [
            s.kinds[j] === 'monthly'
              ? 'Equal drawings every month: the interest is worked on the total for the average period, the average of the months for the first and the last withdrawal.'
              : 'A single withdrawal: the interest runs from its date to the end of the year.',
            `${s.names[j]}: ${d.working}.`,
          ],
          P.H.iod,
        );
      },
      verify: (q) => {
        const y = readInterestYear(caseLines(q));
        const j = y.names.indexOf(/interest on (\w+)'s drawings/.exec(q.prompt)?.[1] ?? '');
        return j >= 0 && near(q.answer / 100, y.iod[j]);
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        if (s.ask === 'iod') {
          return P.choice(
            `The interest on drawings of all the partners for the year comes to ${inr(sum(s.iod))}. Where is it shown?`,
            P.PLACES.appCr,
            (['appDr', 'plDr', 'plCr'] as const).map((p): [string, string] => [P.PLACES[p], P.PLACE_WHY.drawings[p]!]),
            P.PLACE_EXPLAIN.drawings,
            P.H.charge,
          );
        }
        const m = s.moves[s.mi];
        const nm = s.names[m.i];
        const brought = m.kind === 'in';
        return P.choice(
          `In which account of ${nm} is the capital ${brought ? 'brought in' : 'withdrawn'} on ${firstOf(s.yr, m.k)} recorded?`,
          `${nm}'s Capital A/c`,
          [
            s.fixed
              ? [`${nm}'s Current A/c`, 'Passed a change in the capital itself through the Current A/c, which is for drawings, interest, salary and the share of profit.']
              : [`${nm}'s Current A/c`, 'Used a Current A/c, which is kept only when capitals are fixed.'],
            brought
              ? [`${nm}'s Drawings A/c`, 'Treated money the partner put into the firm as money taken out of it.']
              : [`${nm}'s Drawings A/c`, 'Treated capital withdrawn for good as drawings against the profit; it reduces the capital itself.'],
            [`${nm}'s Loan A/c`, 'Treated the amount as a loan between the partner and the firm; nothing has been lent.'],
            ['Profit and Loss Appropriation A/c', 'Named the account that shares out the profit; capital is not profit.'],
          ],
          s.fixed
            ? 'With fixed capitals the Capital A/c changes only when capital is brought in or permanently withdrawn, and this is such a change.'
            : 'With fluctuating capitals each partner has one account, the Capital A/c, and capital brought in or withdrawn changes it directly.',
          P.H.capitals,
        );
      },
      verify: (q) => {
        const text = P.optionText(q) ?? '';
        return q.prompt.startsWith('In which account') ? text.endsWith("'s Capital A/c") : text === P.PLACES.appCr;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const iocOpening = (sum(s.caps) * s.r) / 100;
        return num(
          'What is the divisible profit, the profit left to be shared in the profit-sharing ratio?',
          s.divisible,
          [
            [s.profit - sum(s.iod) - sum(s.ioc) - s.salary, 'Deducted the interest on drawings; the partners pay it to the firm, so it is added.'],
            [s.profit - sum(s.ioc) - s.salary, 'Left out the interest on drawings, which adds to the profit to be shared.'],
            [s.profit + sum(s.iod) - iocOpening - s.salary, 'Worked the interest on capital on the opening capitals only, ignoring the capital brought in or withdrawn.'],
            [s.profit + sum(s.iod) - s.salary, 'Forgot to take out the interest on capital.'],
            ...(s.salary > 0 ? ([[s.profit + sum(s.iod) - sum(s.ioc) - s.s, 'Took out the salary of one month only; the salary is for twelve months.']] as Errs) : []),
          ],
          [
            `Interest on capital at ${s.r}% p.a.: ${s.working.join(' ')} Total ${inr(sum(s.ioc))}.`,
            `Interest on drawings at ${s.q}% p.a.: ${s.names.map((nm, j) => `${nm} ${s.drawn[j].working}`).join('; ')}; total ${inr(sum(s.iod))}.`,
            ...(s.salary > 0 ? [`Salary to ${s.names[s.si]} = ${inr(s.s)} x 12 = ${inr(s.salary)}.`] : []),
            `Divisible profit = ${inr(s.profit)} + interest on drawings ${inr(sum(s.iod))} - interest on capital ${inr(sum(s.ioc))}${s.salary > 0 ? ` - salary ${inr(s.salary)}` : ''} = ${inr(s.divisible)}.`,
          ],
          P.H.approp,
        );
      },
      verify: (q) => near(q.answer / 100, readInterestYear(caseLines(q)).divisible),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const t = sum(s.psr);
        const share = (v: number): number => (v * s.psr[s.i]) / t;
        const n = s.names.length;
        return num(
          `What is ${s.names[s.i]}'s share of the divisible profit?`,
          s.shares[s.i],
          [
            [s.divisible / n, 'Shared the divisible profit equally, although the deed gives a ratio.'],
            [share(s.profit), 'Shared the net profit itself, without first making the appropriations.'],
            [s.shares[s.i] + s.ioc[s.i] + (s.i === s.si ? s.salary : 0), `Added ${s.names[s.i]}'s own interest on capital${s.i === s.si && s.salary > 0 ? ' and salary' : ''}; only the share of the divisible profit is asked.`],
            [share(s.divisible - sum(s.iod)), 'Left out the interest on drawings, which adds to the profit to be shared.'],
          ],
          [`Divisible profit = ${inr(s.divisible)}.`, P.sharesText(s.names, s.divisible, s.psr)],
          P.H.approp,
        );
      },
      verify: (q) => {
        const y = readInterestYear(caseLines(q));
        const i = y.names.indexOf(/What is (\w+)'s share/.exec(q.prompt)?.[1] ?? '');
        // One part of the ratio, taken from the answer, rebuilds the whole divisible profit.
        return i >= 0 && near(((q.answer / 100) * sum(y.psr)) / y.psr[i], y.divisible);
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Guaranteed shares: who gave the guarantee, the wording of the case and the reading of it back
// ---------------------------------------------------------------------------------------------------------------

/** Who made the guarantee: the firm (the two senior partners in their own ratio), both of them in a stated ratio, or one of them. */
type GuaranteeKind = 'firm' | 'ratio' | 'one';
interface Guarantee {
  kind: GuaranteeKind;
  /** The ratio in which the two senior partners bear a deficiency: their own for the firm, the stated one, or the guarantor's alone. */
  bear: [number, number];
  /** The partner who gave the guarantee alone (0 or 1); -1 otherwise. */
  g: number;
  guaranteed: number;
  own: number[];
  gap: number;
  borne: number[];
  final: number[];
}
/** A guarantee for the junior partner (the third) on a divisible profit, with a deficiency that is at most half the share. */
function guaranteeOn(rng: Rng, psr: number[], divisible: number, kind: GuaranteeKind): Guarantee | null {
  const [x, y] = psr;
  const total = sum(psr);
  const own = psr.map((t) => (divisible * t) / total);
  const g = kind === 'one' ? rng.int(0, 1) : -1;
  const stated = rng.pick(([[1, 1], [2, 1], [1, 2], [3, 1], [3, 2], [2, 3], [1, 3]] as [number, number][]).filter((pq) => !P.sameRatio(pq, [x, y])));
  const bear: [number, number] = kind === 'firm' ? [x, y] : kind === 'ratio' ? stated : g === 0 ? [1, 0] : [0, 1];
  const unit = (bear[0] + bear[1]) * 1000;
  const most = Math.min(6, Math.floor(own[2] / (2 * unit)));
  if (most < 1) return null;
  const gap = unit * rng.int(1, most);
  const borne = [(gap * bear[0]) / (bear[0] + bear[1]), (gap * bear[1]) / (bear[0] + bear[1])];
  if (borne.some((b, j) => b * 2 > own[j])) return null;
  return { kind, bear, g, guaranteed: own[2] + gap, own, gap, borne, final: [own[0] - borne[0], own[1] - borne[1], own[2] + gap] };
}
/** The sentence of the case that gives the guarantee. */
function guaranteeSays(names: string[], psr: number[], gt: Guarantee): string {
  const [a, b, c] = names;
  const promise = `that ${c}'s share of the divisible profit will not be less than ${inr(gt.guaranteed)} in any year`;
  if (gt.kind === 'firm') return `${c} is the junior partner. The firm has guaranteed ${promise}; any deficiency is borne by ${a} and ${b} in their profit-sharing ratio, ${ratioText(lowestTerms([psr[0], psr[1]]))}.`;
  if (gt.kind === 'ratio') return `${c} is the junior partner. ${a} and ${b} have guaranteed ${promise}; any deficiency is borne by them ${gt.bear[0] === gt.bear[1] ? 'equally' : `in the ratio ${ratioText(gt.bear)}`}.`;
  return `${c} is the junior partner. ${names[gt.g]} has personally guaranteed ${promise}.`;
}
/** Who bears a deficiency, as the working says it. */
function borneSays(names: string[], gt: Guarantee): string {
  const [a, b] = names;
  if (gt.kind === 'one') return `${names[gt.g]} alone gave the guarantee, so ${names[gt.g]} bears the whole ${inr(gt.gap)}; ${names[1 - gt.g]} is not touched.`;
  const how = gt.kind === 'firm' ? `in their profit-sharing ratio, ${ratioText(lowestTerms(gt.bear))}` : gt.bear[0] === gt.bear[1] ? 'equally' : `in the ratio ${ratioText(gt.bear)}`;
  return `It is borne by ${a} and ${b} ${how}: ${a} ${inr(gt.borne[0])}, ${b} ${inr(gt.borne[1])}.`;
}
/**
 * A guarantee read back from the case text and applied the other way round: the junior partner gets the guaranteed
 * amount (or the own share, if larger), and the partners who gave the guarantee get what is left of their shares.
 */
function readGuarantee(rows: string[], names: string[], psr: number[], divisible: number): number[] | null {
  const line = rows.find((l) => l.includes(' guaranteed that ')) ?? '';
  const c = names.indexOf(/that (\w+)'s share/.exec(line)?.[1] ?? '');
  const guaranteed = P.read(line, /not be less than (₹[\d,]+)/);
  if (c !== 2 || !(guaranteed > 0)) return null;
  const share = (j: number): number => (divisible * psr[j]) / sum(psr);
  const one = names.indexOf(/(\w+) has personally guaranteed/.exec(line)?.[1] ?? '');
  const stated = /borne by them (?:equally|in the ratio (\d+):(\d+))\./.exec(line);
  const firm = /in their profit-sharing ratio, (\d+):(\d+)\./.exec(line);
  const bear = one >= 0 ? [one === 0 ? 1 : 0, one === 1 ? 1 : 0] : stated ? (stated[1] ? [Number(stated[1]), Number(stated[2])] : [1, 1]) : firm ? [Number(firm[1]), Number(firm[2])] : null;
  if (!bear) return null;
  const third = Math.max(guaranteed, share(2));
  const short = third - share(2);
  return [share(0) - (short * bear[0]) / (bear[0] + bear[1]), share(1) - (short * bear[1]) / (bear[0] + bear[1]), third];
}

// ---------------------------------------------------------------------------------------------------------------
// 3. case-pf-guarantee: a junior partner's guaranteed share, by the firm, by both senior partners in a stated ratio
//    or by one of them: the share, the deficiency, the entry that makes it good and what a partner finally gets (medium)
// ---------------------------------------------------------------------------------------------------------------

interface GuaranteeCase {
  names: string[];
  yr: PfYear;
  firm: string;
  fixed: boolean;
  psr: number[];
  caps: number[];
  r: number;
  ioc: number[];
  si: number;
  s: number;
  salary: number;
  divisible: number;
  profit: number;
  gt: Guarantee;
  ask: number;
}

function readGuaranteeCase(rows: string[]) {
  const [head, ...rest] = rows;
  const names = P.namesIn(head);
  const psr = P.psrIn(head);
  const iocRow = P.rowOf(rest, 'Interest on capital');
  const ioc = iocRow ? sum(P.amountsIn(iocRow)) * (P.rateIn(iocRow) / 100) : 0;
  const salaryRow = P.rowOf(rest, 'Salary');
  const salary = salaryRow ? 12 * P.amountsIn(salaryRow)[0] : 0;
  const profit = P.amountsIn(P.rowOf(rest, 'Net profit'))[0];
  const divisible = profit - ioc - salary;
  return { names, psr, profit, divisible, final: readGuarantee(rest, names, psr, divisible) };
}

const guarantee = caseTemplate<GuaranteeCase>({
  id: 'case-pf-guarantee',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: "A junior partner's guaranteed share",
  setup: (rng) => {
    const names = P.partners(rng, 3);
    const yr = P.yearOf(rng);
    const firm = P.firmOf(rng);
    const fixed = rng.int(0, 1) === 0;
    const psr = P.psrOf(rng, 3);
    const total = sum(psr);
    const shape = rng.pick(['salary', 'capital', 'both', 'none'] as const);
    const units = rng.pick(P.CAPS3);
    const base = capitalBase(rng, units, 600000, 1600000);
    if (base === null) return null;
    const caps = units.map((u) => u * base);
    const r = rng.pick([5, 6, 8, 10]);
    const ioc = caps.map((c) => (shape === 'capital' || shape === 'both' ? (c * r) / 100 : 0));
    const si = rng.int(0, 1);
    const s = rng.step(2000, 8000, 1000);
    const salary = shape === 'salary' || shape === 'both' ? 12 * s : 0;
    const step = total * 1000;
    // Where the capitals are printed, a profit of at most 40% of them.
    const most = sum(ioc) > 0 ? Math.floor((PROFIT_CAP * sum(caps) - sum(ioc) - salary) / step) : Math.floor(720000 / step);
    const least = Math.ceil((sum(ioc) > 0 ? 100000 : 150000) / step);
    if (most < least) return null;
    const divisible = step * rng.int(least, most);
    const gt = guaranteeOn(rng, psr, divisible, rng.pick<GuaranteeKind>(['firm', 'firm', 'ratio', 'one']));
    if (gt === null) return null;
    const ask = gt.kind === 'one' ? (rng.int(0, 2) > 0 ? gt.g : 1 - gt.g) : rng.int(0, 1);
    return { names, yr, firm, fixed, psr, caps, r, ioc, si, s, salary, divisible, profit: divisible + sum(ioc) + salary, gt, ask };
  },
  context: (s) =>
    [
      `${list(s.names)} are partners in ${s.firm} sharing profits and losses in the ratio ${ratioText(s.psr)}. ${capitalsAre(s.fixed)}`,
      guaranteeSays(s.names, s.psr, s.gt),
      `The divisible profit is first shared in the profit-sharing ratio; a deficiency is then made good by an entry between the partners' ${s.fixed ? 'current' : 'capital'} accounts.`,
      ...(sum(s.ioc) > 0 ? [`Interest on capital: ${s.r}% p.a. on capitals of ${each(s.names, s.caps)}; no capital was brought in or withdrawn during the year`] : []),
      ...(s.salary > 0 ? [`Salary: ${inr(s.s)} per month to ${s.names[s.si]}`] : []),
      ...(sum(s.ioc) + s.salary === 0 ? ['The deed allows no interest on capital and no salary.'] : []),
      `Net profit for the ${s.yr.ended}: ${inr(s.profit)}`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const c = s.names[2];
        const t = sum(s.psr);
        const appropriated = sum(s.ioc) + s.salary;
        return num(
          `What is ${c}'s share of the divisible profit before the guarantee is applied?`,
          s.gt.own[2],
          [
            ...(appropriated > 0 ? ([[(s.profit * s.psr[2]) / t, `Shared the net profit without first taking out the ${[sum(s.ioc) > 0 ? 'interest on capital' : '', s.salary > 0 ? 'salary' : ''].filter(Boolean).join(' and ')}.`]] as Errs) : []),
            [s.divisible / 3, 'Shared the divisible profit equally, although the deed gives a ratio.'],
            [s.gt.guaranteed, `Gave the guaranteed amount; ${c}'s own share is worked out first, in the ratio.`],
            ...(s.ioc[2] > 0 ? ([[s.gt.own[2] + s.ioc[2], `Added ${c}'s interest on capital; only the share of the divisible profit is asked.`]] as Errs) : []),
          ],
          [
            appropriated > 0
              ? `Divisible profit = ${inr(s.profit)}${sum(s.ioc) > 0 ? ` - interest on capital ${inr(sum(s.ioc))}` : ''}${s.salary > 0 ? ` - salary ${inr(s.salary)}` : ''} = ${inr(s.divisible)}.`
              : `Nothing is appropriated before sharing, so the divisible profit is the net profit, ${inr(s.divisible)}.`,
            `${c}'s share = ${inr(s.divisible)} x ${s.psr[2]}/${t} = ${inr(s.gt.own[2])}.`,
          ],
          P.H.guarantee,
        );
      },
      verify: (q) => {
        const y = readGuaranteeCase(caseLines(q));
        return near(q.answer / 100, (y.divisible * y.psr[2]) / sum(y.psr));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const c = s.names[2];
        const onNet = s.gt.guaranteed - (s.profit * s.psr[2]) / sum(s.psr);
        return num(
          `By how much does ${c}'s share fall short of the guaranteed amount?`,
          s.gt.gap,
          [
            [s.gt.guaranteed, 'Gave the guaranteed amount itself, not the shortfall in it.'],
            [s.gt.own[2], `Gave ${c}'s share of the profit, not the amount by which it falls short.`],
            ...(sum(s.ioc) + s.salary > 0 ? ([[onNet, `Worked the shortfall on ${c}'s share of the net profit, before the appropriations were taken out.`]] as Errs) : []),
            [s.divisible - s.gt.guaranteed, `Gave what is left for the other two partners after ${c} takes the guaranteed amount.`],
          ],
          [`${c}'s share is ${inr(s.gt.own[2])}.`, `Deficiency = guaranteed amount - share = ${inr(s.gt.guaranteed)} - ${inr(s.gt.own[2])} = ${inr(s.gt.gap)}.`],
          P.H.guarantee,
        );
      },
      verify: (q) => {
        const y = readGuaranteeCase(caseLines(q));
        return y.final !== null && near(q.answer / 100, y.final[2] - (y.divisible * y.psr[2]) / sum(y.psr));
      },
    },
    {
      kind: 'journal',
      make: (s): JournalParts => {
        const [a, b, c] = s.names;
        return {
          prompt: `Pass the entry that makes good the deficiency in ${c}'s share.`,
          lines: [...s.gt.borne.flatMap((x, j) => (x > 0 ? [P.dr(ownId(s.fixed, s.names[j]), x)] : [])), P.cr(ownId(s.fixed, c), s.gt.gap)],
          explanation: [
            `Deficiency = ${inr(s.gt.guaranteed)} - ${inr(s.gt.own[2])} = ${inr(s.gt.gap)}.`,
            borneSays(s.names, s.gt),
            `A partner who bears a deficiency is debited and ${c} is credited. No profit account is used: the profit has already been shared. ${whyOwn(s.fixed)}`,
          ],
          distractorAccounts: [APP, 'profitAndLoss', otherOwn(s.fixed, c), otherOwn(s.fixed, s.gt.kind === 'one' ? s.names[s.gt.g] : a), partnerDrawings(b)],
          hints: P.H.guarantee,
        };
      },
      verify: (q: JournalQuestion) => {
        const y = readGuaranteeCase(caseLines(q));
        if (y.final === null) return false;
        const family = (q.context ?? '').includes('capitals are fixed') ? 'current' : 'capital';
        const moved = y.final.map((x, j) => x - (y.divisible * y.psr[j]) / sum(y.psr));
        const changed = moved.filter((x) => !near(x, 0)).length;
        return (
          q.expected.length === changed &&
          y.names.every((nm, j) => near(moved[j], 0) || q.expected.some((l) => l.accountId === `${family}:${nm}` && l.side === (moved[j] > 0 ? 'Cr' : 'Dr') && near(l.amount / 100, Math.abs(moved[j]))))
        );
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const j = s.ask;
        const nm = s.names[j];
        const { own, gap, borne, final, bear, kind } = s.gt;
        const pair = s.psr[0] + s.psr[1];
        const errs: Errs =
          kind === 'one'
            ? j === s.gt.g
              ? [
                  [own[j], `Gave the share before the deficiency in ${s.names[2]}'s share was made good.`],
                  [own[j] - (gap * s.psr[j]) / pair, `Shared the deficiency with ${s.names[1 - j]}; the guarantee was given by ${nm} alone.`],
                  [own[j] + gap, 'Added the deficiency instead of deducting it.'],
                  [gap, 'Gave the deficiency, not the profit the partner finally gets.'],
                ]
              : [
                  [own[j] - (gap * s.psr[j]) / pair, `Made ${nm} bear a part of the deficiency; the guarantee was given by ${s.names[1 - j]} alone.`],
                  [own[j] - gap, `Charged the deficiency to ${nm}, who gave no guarantee.`],
                  [final[1 - j], `Gave the final share of ${s.names[1 - j]}, the partner who gave the guarantee.`],
                ]
            : [
                [own[j], `Gave the share before the deficiency in ${s.names[2]}'s share was made good.`],
                [own[j] - gap / 2, 'Split the deficiency equally between the two partners who bear it.'],
                [own[j] - gap, `Charged the whole deficiency to ${nm} alone.`],
                [own[j] + borne[j], 'Added the share of the deficiency instead of deducting it.'],
                [own[j] - (gap * s.psr[j]) / sum(s.psr), `Divided the deficiency by ${sum(s.psr)}, the total of all three terms; only two partners bear it.`],
                ...(kind === 'ratio' ? ([[own[j] - (gap * s.psr[j]) / pair, `Shared the deficiency in the profit-sharing ratio; the guarantee says ${bear[0] === bear[1] ? 'equally' : `in the ratio ${ratioText(bear)}`}.`]] as Errs) : []),
              ];
        return num(
          `How much does ${nm} finally get as share of profit${j === s.si && s.salary > 0 ? ', apart from the salary' : ''}?`,
          final[j],
          errs,
          [
            `Shares in ${ratioText(s.psr)}: ${each(s.names, own)}.`,
            `Deficiency = ${inr(s.gt.guaranteed)} - ${inr(own[2])} = ${inr(gap)}. ${borneSays(s.names, s.gt)}`,
            borne[j] > 0 ? `${nm} finally gets ${inr(own[j])} - ${inr(borne[j])} = ${inr(final[j])}.` : `${nm} gave no guarantee, so the share of ${inr(own[j])} is not touched.`,
          ],
          P.H.guarantee,
        );
      },
      verify: (q) => {
        const y = readGuaranteeCase(caseLines(q));
        const i = y.names.indexOf(/How much does (\w+) finally get/.exec(q.prompt)?.[1] ?? '');
        // The three final shares use up the divisible profit, and the junior partner has at least the guaranteed amount.
        return y.final !== null && (i === 0 || i === 1) && near(sum(y.final), y.divisible) && near(q.answer / 100, y.final[i]);
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 4. case-pf-commission-loan: a partner's loan, a salary and a commission before or after charging it: the charge,
//    where it goes, the commission, the divisible profit and a partner's share (medium)
// ---------------------------------------------------------------------------------------------------------------

interface CommissionLoan {
  names: string[];
  yr: PfYear;
  firm: string;
  fixed: boolean;
  psr: number[];
  li: number;
  k: number;
  m: number;
  agreed: boolean;
  rate: number;
  loan: number;
  interest: number;
  si: number;
  s: number;
  ci: number;
  c: number;
  after: boolean;
  /** The net profit after the interest on the loan, before any appropriation. */
  net: number;
  commission: number;
  divisible: number;
  profit: number;
  i: number;
}

const commissionOn = (p: number, c: number, after: boolean): number => (after ? (p * c) / (100 + c) : (p * c) / 100);

function readCommissionLoan(rows: string[]) {
  const [head, ...rest] = rows;
  const names = P.namesIn(head);
  const psr = P.psrIn(head);
  const loanRow = P.rowOf(rest, 'Loan');
  const rate = loanRow.includes('nothing was agreed') ? 6 : P.rateIn(loanRow);
  const interest = (P.amountsIn(loanRow)[0] * rate * P.monthsLeft(loanRow)[0]) / 1200;
  const salaryRow = P.rowOf(rest, 'Salary');
  const commissionRow = P.rowOf(rest, 'Commission');
  const net = P.amountsIn(P.rowOf(rest, 'Profit for the'))[0] - interest;
  return {
    names,
    psr,
    interest,
    net,
    salary: names.map((nm) => (salaryRow.endsWith(` to ${nm}`) ? 12 * P.amountsIn(salaryRow)[0] : 0)),
    c: P.read(commissionRow, /^Commission: (\d+)%/),
    after: commissionRow.includes('after charging such commission'),
    commissioned: names.indexOf(/% to (\w+),/.exec(commissionRow)?.[1] ?? ''),
  };
}

const commissionLoan = caseTemplate<CommissionLoan>({
  id: 'case-pf-commission-loan',
  // Version 2: the share worked without charging the loan interest also works the commission on that larger profit.
  version: 2,
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: "A partner's loan, a salary and a commission",
  setup: (rng) => {
    const n = rng.pick([2, 3, 3]);
    const names = P.partners(rng, n);
    const yr = P.yearOf(rng);
    const firm = P.firmOf(rng);
    const fixed = rng.int(0, 1) === 0;
    const psr = P.psrOf(rng, n);
    const total = sum(psr);
    const li = rng.int(0, n - 1);
    const k = rng.int(1, 9);
    const m = 12 - k;
    const agreed = rng.int(0, 2) === 0;
    const rate = agreed ? rng.pick([8, 9, 10, 12]) : 6;
    const loan = agreed ? rng.step(120000, 600000, 60000) : rng.step(100000, 600000, 20000);
    const interest = (loan * rate * m) / 1200;
    const si = rng.int(0, n - 1);
    const s = rng.step(2000, 8000, 500);
    const ci = (si + rng.int(1, n - 1)) % n;
    const c = rng.pick([5, 10, 20, 25]);
    const after = rng.int(0, 1) === 0;
    const net = P.profitThatFits(rng, total, (p) => (Number.isInteger(commissionOn(p, c, after)) ? p - 12 * s - commissionOn(p, c, after) : null), 600000);
    if (net === null) return null;
    const commission = commissionOn(net, c, after);
    const divisible = net - 12 * s - commission;
    return { names, yr, firm, fixed, psr, li, k, m, agreed, rate, loan, interest, si, s, ci, c, after, net, commission, divisible, profit: net + interest, i: rng.int(0, n - 1) };
  },
  context: (s) =>
    [
      `${list(s.names)} are partners in ${s.firm} sharing profits and losses in the ratio ${ratioText(s.psr)}. ${capitalsAre(s.fixed)} The deed allows the salary and the commission below; it provides for no interest on capital and no interest on drawings.`,
      `Loan: ${s.names[s.li]} lent the firm ${inr(s.loan)} on ${firstOf(s.yr, s.k)}; ${s.agreed ? `interest at ${s.rate}% p.a. was agreed` : 'nothing was agreed about interest on it'}. The interest is credited to ${s.names[s.li]}'s Loan A/c`,
      `Salary: ${inr(s.s)} per month to ${s.names[s.si]}`,
      `Commission: ${s.c}% to ${s.names[s.ci]}, of the net profit (after all charges, before any ${s.after ? 'other appropriation), after charging such commission' : 'appropriation)'}`,
      `Profit for the ${s.yr.ended} before the interest on the loan: ${inr(s.profit)}`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { loan, rate, m, k } = s;
        return num(
          `How much interest on the loan is charged for the ${s.yr.ended}?`,
          s.interest,
          [
            [(loan * rate) / 100, 'Charged interest for the whole year, although the loan was given part-way through it.'],
            [(loan * rate * k) / 1200, 'Counted the months before the loan was given instead of the months after it.'],
            [(loan * rate * (m - 1)) / 1200, 'Left out the month in which the loan was given, although it came on the first day of that month.'],
            ...(s.agreed ? ([[(loan * 6 * m) / 1200, `Used 6% p.a., the rate of the Act, although the partners agreed on ${rate}% p.a.`]] as Errs) : ([[(loan * 6 * 6) / 1200, 'Charged six months, the period used for drawings whose dates are not known.']] as Errs)),
          ],
          [
            s.agreed ? `The partners agreed on ${rate}% p.a.` : 'Nothing was agreed, so the loan carries 6% p.a. under the Indian Partnership Act, 1932.',
            `From ${firstOf(s.yr, k)} to ${s.yr.on} is ${m} months: ${inr(loan)} x ${rate}/100 x ${m}/12 = ${inr(s.interest)}.`,
          ],
          P.H.charge,
        );
      },
      verify: (q) => near(q.answer / 100, readCommissionLoan(caseLines(q)).interest),
    },
    {
      kind: 'mcq',
      make: (s) =>
        P.choice(
          `Where is the interest on ${s.names[s.li]}'s loan shown in the final accounts of the firm?`,
          P.PLACES.plDr,
          (['appDr', 'appCr', 'plCr'] as const).map((p): [string, string] => [P.PLACES[p], P.PLACE_WHY.charge[p]!]),
          `${P.PLACE_EXPLAIN.charge} It is credited to ${s.names[s.li]}'s Loan A/c, not to the partner's ${s.fixed ? 'current' : 'capital'} account.`,
          P.H.charge,
        ),
      verify: (q) => P.optionText(q) === P.PLACES.plDr,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { c, after, net, profit } = s;
        return num(
          `What is ${s.names[s.ci]}'s commission for the year?`,
          s.commission,
          [
            after
              ? [(net * c) / 100, `Took ${c}% of the profit before the commission; the commission is ${c}% of the profit that is left after it.`]
              : [(net * c) / (100 + c), `Worked the commission on the profit after charging it (${c}/${100 + c}), although the deed says before.`],
            [commissionOn(profit, c, after), 'Worked the commission on the profit before the interest on the loan; the interest is a charge and comes off first.'],
            [commissionOn(net - 12 * s.s, c, after), 'Took out the salary before working the commission; the deed works it on the net profit, before any appropriation.'],
            ...(after ? ([[(net * c) / (100 - c), `Divided by ${100 - c} instead of ${100 + c}.`]] as Errs) : []),
          ],
          [
            `Net profit after the interest on the loan = ${inr(profit)} - ${inr(s.interest)} = ${inr(net)}.`,
            after
              ? `Commission after charging it = ${inr(net)} x ${c}/${100 + c} = ${inr(s.commission)}. Check: ${c}% of ${inr(net - s.commission)}, the profit left after it, is ${inr(s.commission)}.`
              : `Commission before charging it = ${inr(net)} x ${c}/100 = ${inr(s.commission)}.`,
          ],
          P.H.comm,
        );
      },
      verify: (q) => {
        const y = readCommissionLoan(caseLines(q));
        const comm = q.answer / 100;
        // The commission is the stated percentage of what defines it: the profit before it, or the profit left after it.
        return y.after ? near(comm * 100, y.c * (y.net - comm)) : near(comm * 100, y.c * y.net);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { c, after, net, profit } = s;
        const salary = 12 * s.s;
        return num(
          'What is the divisible profit, the profit left to be shared in the profit-sharing ratio?',
          s.divisible,
          [
            [profit - salary - commissionOn(profit, c, after), 'Did not charge the interest on the loan, so the commission was worked on too large a profit as well.'],
            [net - salary - commissionOn(net, c, !after), `Worked the commission ${after ? 'before' : 'after'} charging it, although the deed says ${after ? 'after' : 'before'}.`],
            [net - s.s - s.commission, 'Took out the salary of one month only; the salary is for twelve months.'],
            [net - s.commission, 'Forgot to take out the salary.'],
            [net - salary, 'Forgot to take out the commission.'],
          ],
          [
            `Net profit after the interest on the loan = ${inr(profit)} - ${inr(s.interest)} = ${inr(net)}.`,
            `Salary to ${s.names[s.si]} = ${inr(s.s)} x 12 = ${inr(salary)}. Commission to ${s.names[s.ci]} = ${inr(s.commission)}.`,
            `Divisible profit = ${inr(net)} - ${inr(salary)} - ${inr(s.commission)} = ${inr(s.divisible)}.`,
          ],
          P.H.approp,
        );
      },
      verify: (q) => {
        const y = readCommissionLoan(caseLines(q));
        const comm = y.after ? (y.net * y.c) / (100 + y.c) : (y.net * y.c) / 100;
        return near(q.answer / 100, y.net - sum(y.salary) - comm);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const t = sum(s.psr);
        const share = (v: number): number => (v * s.psr[s.i]) / t;
        const nm = s.names[s.i];
        const own = (s.i === s.si ? 12 * s.s : 0) + (s.i === s.ci ? s.commission : 0);
        const extra = [s.i === s.si ? 'salary' : '', s.i === s.ci ? 'commission' : ''].filter(Boolean);
        return num(
          `What is ${nm}'s share of the divisible profit${extra.length > 0 ? `, apart from the ${extra.join(' and ')}` : ''}?`,
          share(s.divisible),
          [
            [s.divisible / s.names.length, 'Shared the divisible profit equally, although the deed gives a ratio.'],
            [share(s.net), 'Shared the net profit without first taking out the salary and the commission.'],
            [share(s.profit - 12 * s.s - commissionOn(s.profit, s.c, s.after)), 'Did not charge the interest on the loan, so the commission and the share were worked on too large a profit; the interest is a charge against profit.'],
            ...(own > 0 ? ([[share(s.divisible) + own, `Added ${nm}'s own ${extra.join(' and ')}; only the share of the divisible profit is asked.`]] as Errs) : []),
            ...(s.i === s.li ? ([[share(s.divisible) + s.interest, 'Added the interest on the loan to the share; it is credited to the Loan A/c, apart from the profit.']] as Errs) : []),
          ],
          [`Divisible profit = ${inr(s.divisible)}.`, P.sharesText(s.names, s.divisible, s.psr)],
          P.H.approp,
        );
      },
      verify: (q) => {
        const y = readCommissionLoan(caseLines(q));
        const i = y.names.indexOf(/What is (\w+)'s share/.exec(q.prompt)?.[1] ?? '');
        const comm = y.after ? (y.net * y.c) / (100 + y.c) : (y.net * y.c) / 100;
        // From the share back to the whole: the shares, the salary and the commission use up the net profit.
        return i >= 0 && y.commissioned >= 0 && near(((q.answer / 100) * sum(y.psr)) / y.psr[i] + sum(y.salary) + comm, y.net);
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 5. case-pf-past-adjustment: interest on capital left out, or allowed at a wrong rate, in a year that is closed:
//    the interest in question, the profit that moves the other way, the single adjusting entry and who gains (complex)
// ---------------------------------------------------------------------------------------------------------------

interface PastAdjustment {
  names: string[];
  yr: PfYear;
  firm: string;
  fixed: boolean;
  psr: number[];
  caps: number[];
  shape: 'omitted' | 'rate';
  r: number;
  given: number;
  due: number;
  /** What each partner's interest should change by (positive: too little was credited). */
  delta: number[];
  moved: number;
  back: number[];
  net: number[];
  i: number;
}

/** The nets read back from the case: the year shared out both ways on a profit large enough, as it was and as the deed requires. */
function readPastAdjustment(rows: string[]): { names: string[]; net: number[] } | null {
  const [head, ...rest] = rows;
  const names = P.namesIn(head);
  const psr = P.psrIn(head);
  const caps = P.amountsIn(rest.find((l) => CAPITALS_RE.test(l)) ?? '');
  const found = P.rowOf(rest, 'After the accounts');
  const rates = /allowed at (\d+)% p\.a\. instead of the (\d+)% p\.a\./.exec(found);
  const [was, should] = rates ? [Number(rates[1]), Number(rates[2])] : [0, P.rateIn(found)];
  if (caps.length !== names.length || !(should > 0)) return null;
  const whole = sum(caps);
  const had = (rate: number): number[] => names.map((_, j) => (caps[j] * rate) / 100 + ((whole - (whole * rate) / 100) * psr[j]) / sum(psr));
  const [then, now] = [had(was), had(should)];
  return { names, net: names.map((_, j) => now[j] - then[j]) };
}
/** "Aarav only", "Aarav and Chetan". */
const who = (names: string[]): string => (names.length === 1 ? `${names[0]} only` : list(names));

const pastAdjustment = caseTemplate<PastAdjustment>({
  id: 'case-pf-past-adjustment',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Interest on capital set right after the year',
  setup: (rng) => {
    const n = rng.pick([2, 3, 3]);
    const names = P.partners(rng, n);
    const yr = P.yearOf(rng);
    const firm = P.firmOf(rng);
    const fixed = rng.int(0, 1) === 0;
    const base = rng.pick([50000, 100000]);
    const caps = rng.shuffle(rng.pick(n === 2 ? P.CAPS2 : P.CAPS3)).map((u) => u * base);
    const shape = rng.pick(['omitted', 'rate'] as const);
    const r = rng.pick([5, 6, 8, 10, 12]);
    const [given, due] = shape === 'rate' ? rng.pick(P.RATE_PAIRS) : [0, r];
    const delta = caps.map((c) => (c * (due - given)) / 100);
    const moved = sum(delta);
    // Every partner's part of the profit that moves in whole hundreds, and no partner whom the mistake leaves untouched.
    const usable = (n === 2 ? P.PSR2 : P.PSR3).filter((pr) => Math.abs(moved) % (sum(pr) * 100) === 0 && delta.every((x, j) => x * sum(pr) !== moved * pr[j]));
    if (usable.length === 0) return null;
    const psr = rng.pick(usable);
    const back = psr.map((t) => (moved * t) / sum(psr));
    const net = delta.map((x, j) => x - back[j]);
    return { names, yr, firm, fixed, psr, caps, shape, r, given, due, delta, moved, back, net, i: rng.int(0, n - 1) };
  },
  context: (s) =>
    [
      `${list(s.names)} are partners in ${s.firm} sharing profits and losses in the ratio ${ratioText(s.psr)}. ${capitalsAre(s.fixed)} No capital was brought in or withdrawn during the year.`,
      capitalsLine(s.fixed, s.yr, s.names, s.caps),
      s.shape === 'omitted'
        ? `After the accounts of the ${s.yr.ended} were closed, it was found that interest on capital at ${s.r}% p.a., which the deed provides, had been left out, so the whole profit had been shared in the profit-sharing ratio.`
        : `After the accounts of the ${s.yr.ended} were closed, it was found that interest on capital had been allowed at ${s.given}% p.a. instead of the ${s.due}% p.a. that the deed provides, and the rest of the profit shared in the profit-sharing ratio.`,
      'The profit of the year was more than enough for the interest. The partners will set the error right by one adjusting entry, without reopening the accounts.',
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const entry = sum(s.net.filter((x) => x > 0));
        const largest = Math.max(...s.delta.map(Math.abs));
        if (s.shape === 'omitted') {
          return num(
            'How much interest on capital was left out in all?',
            s.moved,
            [
              [largest, 'Gave the interest of one partner only; the total for all the partners is asked.'],
              [entry, 'Gave the amount of the adjusting entry, which is only the net effect, not the interest left out.'],
              ...(s.r !== 6 ? ([[(sum(s.caps) * 6) / 100, 'Worked the interest at 6% p.a., the rate the Act gives for a partner\'s loan; the deed fixes the rate for capital.']] as Errs) : []),
            ],
            [`Interest on capital at ${s.r}% p.a.: ${s.names.map((nm, j) => `${nm} ${inr(s.caps[j])} x ${s.r}/100 = ${inr(s.delta[j])}`).join('; ')}.`, `Total = ${added(s.delta)}.`],
            P.H.past,
          );
        }
        const short = s.due > s.given;
        return num(
          `By how much in all was the interest on capital ${short ? 'short' : 'in excess'}?`,
          Math.abs(s.moved),
          [
            [(sum(s.caps) * s.due) / 100, 'Gave the whole interest at the right rate, not the difference.'],
            [(sum(s.caps) * s.given) / 100, 'Gave the interest that was allowed, not the difference.'],
            [largest, 'Gave the difference for one partner only; the total for all the partners is asked.'],
            [entry, 'Gave the amount of the adjusting entry, which is only the net effect.'],
          ],
          [
            `The rate was ${s.given}% instead of ${s.due}%, a difference of ${Math.abs(s.due - s.given)}% on each capital: ${s.names.map((nm, j) => `${nm} ${inr(Math.abs(s.delta[j]))}`).join(', ')}.`,
            `Total = ${added(s.delta.map(Math.abs))}, ${short ? 'too little interest' : 'too much interest'}.`,
          ],
          P.H.past,
        );
      },
      verify: (q) => {
        const rows = caseLines(q);
        const caps = P.amountsIn(rows.find((l) => CAPITALS_RE.test(l)) ?? '');
        const found = P.rowOf(rows, 'After the accounts');
        const rates = /allowed at (\d+)% p\.a\. instead of the (\d+)% p\.a\./.exec(found);
        const diff = rates ? Math.abs(Number(rates[2]) - Number(rates[1])) : P.rateIn(found);
        return near(q.answer / 100, (sum(caps) * diff) / 100);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const nm = s.names[s.i];
        const takeBack = s.moved > 0;
        return num(
          takeBack ? `How much of the profit already credited to ${nm} has to be taken back?` : `How much more profit should ${nm} have been credited with?`,
          Math.abs(s.back[s.i]),
          [
            [Math.abs(s.delta[s.i]), takeBack ? `Gave the interest ${nm} should have been credited with, not the profit to be taken back.` : `Gave the interest ${nm} was credited with in excess, not the profit to be given.`],
            [Math.abs(s.moved), `Gave the whole amount for all the partners, not ${nm}'s part of it.`],
            [Math.abs(s.moved) / s.names.length, 'Divided it equally; the profit was shared in the profit-sharing ratio, so it moves back in that ratio.'],
            [Math.abs(s.net[s.i]), 'Gave the net effect on the partner; only the part that is profit is asked.'],
          ],
          [
            takeBack
              ? `The ${inr(s.moved)} of interest ${s.shape === 'omitted' ? 'left out' : 'that was short'} was shared out as profit instead, in ${ratioText(s.psr)}.`
              : `The ${inr(-s.moved)} of interest allowed in excess left that much less profit to be shared in ${ratioText(s.psr)}.`,
            `${nm}'s part = ${inr(Math.abs(s.moved))} x ${s.psr[s.i]}/${sum(s.psr)} = ${inr(Math.abs(s.back[s.i]))}.`,
          ],
          P.H.past,
        );
      },
      verify: (q) => {
        const rows = caseLines(q);
        const names = P.namesIn(rows[0]);
        const psr = P.psrIn(rows[0]);
        const i = names.indexOf(/credited to (\w+) has|should (\w+) have been/.exec(q.prompt)?.slice(1).find(Boolean) ?? '');
        const caps = P.amountsIn(rows.find((l) => CAPITALS_RE.test(l)) ?? '');
        const found = P.rowOf(rows, 'After the accounts');
        const rates = /allowed at (\d+)% p\.a\. instead of the (\d+)% p\.a\./.exec(found);
        const diff = rates ? Math.abs(Number(rates[2]) - Number(rates[1])) : P.rateIn(found);
        return i >= 0 && near(q.answer / 100, (((sum(caps) * diff) / 100) * psr[i]) / sum(psr));
      },
    },
    {
      kind: 'journal',
      make: (s): JournalParts => ({
        prompt: 'Pass the single adjusting entry.',
        lines: P.adjustingLines(s.fixed, s.names, s.net),
        explanation: [
          s.shape === 'omitted'
            ? `Should have been credited as interest: ${each(s.names, s.delta)}. It was shared as profit instead: ${each(s.names, s.back)}.`
            : `Interest ${s.moved > 0 ? 'short' : 'in excess'}: ${each(s.names, s.delta.map(Math.abs))}. Profit ${s.moved > 0 ? 'shared in excess' : 'short'}: ${each(s.names, s.back.map(Math.abs))}.`,
          `Net effect: ${P.netText(s.names, s.net)}.`,
          `A partner who received too much is debited and a partner who received too little is credited. ${whyOwn(s.fixed)}`,
        ],
        distractorAccounts: [APP, 'interestOnCapital', 'profitAndLoss', otherOwn(s.fixed, s.names[0])],
        hints: P.H.past,
      }),
      verify: (q: JournalQuestion) => {
        const y = readPastAdjustment(caseLines(q));
        if (y === null) return false;
        const family = (q.context ?? '').includes('capitals are fixed') ? 'current' : 'capital';
        const moved = y.names.filter((_, j) => !near(y.net[j], 0));
        return q.expected.length === moved.length && y.names.every((nm, j) => near(y.net[j], 0) || q.expected.some((l) => l.accountId === `${family}:${nm}` && l.side === (y.net[j] > 0 ? 'Cr' : 'Dr') && near(l.amount / 100, Math.abs(y.net[j]))));
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const gainers = s.names.filter((_, j) => s.net[j] > 0);
        const losers = s.names.filter((_, j) => s.net[j] < 0);
        const most = s.names.filter((_, j) => s.caps[j] === Math.max(...s.caps));
        const all = s.names.length === 2 ? 'Both partners, in the profit-sharing ratio' : 'All the partners, in the profit-sharing ratio';
        return P.choice(
          'Who gains from the adjusting entry, that is, whose account does it credit?',
          who(gainers),
          [
            [who(losers), 'Reversed the entry: these partners received too much and are debited.'],
            ['No partner: the profit of the year is the same, so nothing changes', "Thought that because the firm's profit does not change, no partner's account does; it was shared out wrongly."],
            [all, 'Treated the interest as more profit to share out; it comes out of the profit that was already shared.'],
            // Only where interest was short: looking at the interest alone, the largest capital seems to gain most.
            ...(s.moved > 0 ? ([[who(most), 'Looked only at the interest, which is largest on the largest capital, and not at the profit that moves the other way.']] as [string, string][]) : []),
          ],
          `Net effect: ${P.netText(s.names, s.net)}. Interest and profit together, a partner who was credited with too little gains and is credited; a partner who was credited with too much is debited.`,
          P.H.past,
        );
      },
      verify: (q) => {
        const y = readPastAdjustment(caseLines(q));
        return y !== null && P.optionText(q) === who(y.names.filter((_, j) => y.net[j] > 1e-6));
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Chained cases: the long question of the examination. One year of one firm; the Profit and Loss Appropriation
// Account, then the partners' accounts in columns (with, before them, the entries of the year in the first case).
// The year and its entries are those of the formats of the topic (`partnersYear`, `yearEntries`,
// `appropriationAccount`): each appropriation, and interest on drawings, has an account of its own, so the
// particulars read "To Interest on Capital A/c", "By Partner's Salary A/c", and the case text says so. The case text
// prints the net profit and never the divisible profit or a share: the partners' accounts start from the shares of
// the Appropriation Account, and their task says so.
// ---------------------------------------------------------------------------------------------------------------

interface Loan {
  lender: number;
  k: number;
  loan: number;
  interest: number;
}
interface Chain {
  y: PfPartnersYear;
  loan?: Loan;
  /** The guarantee of a junior partner's share, when the year has one; `y.shares` are then the final shares. */
  gt?: Guarantee;
  /** Whether the set of entries carries the net profit to the Appropriation Account (first chain only). */
  transfer?: boolean;
}

/**
 * The year of the topic's formats with its capitals, and the capital brought in or withdrawn, raised by the smallest
 * whole factor that leaves the net profit at most 40% of the capitals the year opens with: a firm with ₹3,00,000 of
 * capital does not earn ₹3,50,000. Interest on capital is worked again; the divisible profit and the shares stay as
 * they were, and so does a partner who overdraws (whose drawings are raised with the interest when they must be).
 * Null when no factor up to 12 does it.
 */
export function believable(y: PfPartnersYear, overdraw = false): PfPartnersYear | null {
  const o = y.shares.lastIndexOf(Math.min(...y.shares));
  for (let f = 1; f <= 12; f++) {
    const caps = y.caps.map((c) => c * f);
    const moves = y.moves.map((m) => ({ ...m, amt: m.amt * f }));
    const { ioc, working } = P.interestOnCapitals(y.names, caps, y.r, moves, y.yr);
    const drawings = [...y.drawings];
    if (overdraw && f > 1) drawings[o] = Math.max(drawings[o], Math.ceil((Math.max(y.currents[o], 0) + ioc[o] + y.salary[o] + y.commission[o] + y.shares[o] + 5000) / 10000) * 10000);
    const iod = drawings.map((d) => (sum(y.iod) > 0 ? (d * y.q * 6) / 1200 : 0));
    const profit = y.divisible + sum(ioc) + sum(y.salary) + sum(y.commission) - sum(iod);
    if (profit <= PROFIT_CAP * sum(caps)) return { ...y, caps, moves, ioc, iocWorking: working, drawings, iod, profit };
  }
  return null;
}

/** The case text of a year: the firm, the partners' accounts at the start, what happened, and the profit. */
function chainText(ch: Chain, lead: string, extra: string[] = []): string {
  const { y, loan } = ch;
  const allowedLines = [
    ...(sum(y.salary) > 0 ? [`Salary: ${inr(y.s)} per month to ${y.names[y.si]}`] : []),
    ...(sum(y.commission) > 0 ? [`Commission: ${inr(sum(y.commission))} for the year to ${y.names[y.ci]}`] : []),
  ];
  return [
    `${list(y.names)} are partners in ${y.firm} sharing profits and losses in the ratio ${ratioText(y.psr)}. ${capitalsAre(y.fixed)} ${lead}`,
    ...extra,
    capitalsLine(y.fixed, y.yr, y.names, y.caps),
    ...(y.fixed ? [`Current accounts on ${y.yr.from}: ${y.names.map((nm, j) => `${nm} ${inr(Math.abs(y.currents[j]))} (${y.currents[j] < 0 ? 'Dr' : 'Cr'})`).join(', ')}`] : []),
    ...y.moves.map((m) => moveLine(y.yr, y.names, m)),
    `Drawings during the year: ${each(y.names, y.drawings)}`,
    `Interest on capital: ${y.r}% p.a.`,
    sum(y.iod) > 0 ? `Interest on drawings: ${y.q}% p.a.; the dates of the drawings are not known` : 'No interest is charged on drawings',
    ...allowedLines,
    ...(loan
      ? [
          `Loan given to the firm by ${y.names[loan.lender]} on ${firstOf(y.yr, loan.k)}: ${inr(loan.loan)}; nothing is agreed about interest on it, which is credited to ${y.names[loan.lender]}'s Loan A/c`,
          `Profit for the ${y.yr.ended} before interest on ${y.names[loan.lender]}'s loan: ${inr(y.profit + loan.interest)}`,
        ]
      : [`Net profit for the ${y.yr.ended} as per Profit and Loss A/c: ${inr(y.profit)}`]),
  ].join('\n');
}

/**
 * The year read back from a printed chain and worked the long way: interest on capital by the product method, the
 * interest on the loan by its months, the divisible profit and the shares, and a guarantee applied the other way
 * round. Amounts in rupees; a current balance with a credit balance positive.
 */
function readChain(data: string) {
  const [head, ...rows] = data.split('\n');
  const names = P.namesIn(head);
  const psr = P.psrIn(head);
  const fixed = head.includes('capitals are fixed');
  const caps = P.amountsIn(rows.find((l) => CAPITALS_RE.test(l)) ?? '');
  const currents = [...P.rowOf(rows, 'Current accounts on').matchAll(/(₹[\d,]+) \((Dr|Cr)\)/g)].map((m) => (m[2] === 'Cr' ? 1 : -1) * P.toNumber(m[1]));
  const changes = P.changesIn(rows, names);
  const r = P.rateIn(P.rowOf(rows, 'Interest on capital'));
  const ioc = caps.map((cap, j) => P.productInterest(cap, r, changes[j]));
  const drawings = P.amountsIn(P.rowOf(rows, 'Drawings during the year'));
  const charged = P.rowOf(rows, 'Interest on drawings');
  const iod = drawings.map((d) => (charged ? (d * P.rateIn(charged) * 6) / 1200 : 0));
  const salaryRow = P.rowOf(rows, 'Salary');
  const salary = names.map((nm) => (salaryRow.endsWith(` to ${nm}`) ? 12 * P.amountsIn(salaryRow)[0] : 0));
  const commissionRow = P.rowOf(rows, 'Commission');
  const commission = names.map((nm) => (commissionRow.endsWith(` to ${nm}`) ? P.amountsIn(commissionRow)[0] : 0));
  const loanRow = P.rowOf(rows, 'Loan given');
  const loanInterest = loanRow ? (P.amountsIn(loanRow)[0] * 6 * P.monthsLeft(loanRow)[0]) / 1200 : 0;
  const profitRow = rows.find((l) => /^(Net profit|Profit) for the/.test(l)) ?? '';
  const stated = P.toNumber(/: (₹[\d,]+)$/.exec(profitRow)?.[1] ?? 'x');
  const profit = profitRow.startsWith('Net profit') ? stated : stated - loanInterest;
  const divisible = profit + sum(iod) - sum(ioc) - sum(salary) - sum(commission);
  const shares = psr.map((t) => (divisible * t) / sum(psr));
  const guaranteed = rows.some((l) => l.includes(' guaranteed that ')) ? readGuarantee(rows, names, psr, divisible) : shares;
  return {
    names, psr, fixed, caps, currents, ioc, drawings, iod, salary, commission, profit, divisible, shares,
    finals: guaranteed ?? [],
    moved: changes.map((own) => sum(own.map(([, delta]) => delta))),
  };
}
type ReadChain = ReturnType<typeof readChain>;
/** What the year adds to each partner's own account (capital or current), drawings and interest on drawings taken off. */
const yearlyOf = (b: ReadChain): number[] => b.names.map((_, j) => b.ioc[j] + b.salary[j] + b.commission[j] + b.finals[j] - b.drawings[j] - b.iod[j]);

/** The Appropriation Account of a chain: the format's account, and for a guaranteed share the final shares with how each was reached. */
function chainAppropriation(ch: Chain) {
  // Interest on a partner's loan is charged in Profit and Loss A/c: it has no line here, not even under the net profit.
  const { y, gt } = ch;
  const made = P.appropriationAccount({
    yr: y.yr, names: y.names, fixed: y.fixed, psr: y.psr, profit: y.profit, ioc: y.ioc, salary: y.salary, commission: y.commission, iod: y.iod, reserve: 0,
  });
  if (!gt) return made;
  const [a, b, c] = y.names;
  const guarantors = gt.kind === 'one' ? y.names[gt.g] : `${a} and ${b}`;
  const detailsOf = (j: number): string[] =>
    j === 2 ? [`Share of profit ${inr(gt.own[2])}`, `Add: Deficiency made good by ${guarantors} ${inr(gt.gap)}`] : gt.borne[j] > 0 ? [`Share of profit ${inr(gt.own[j])}`, `Less: Deficiency borne for ${c} ${inr(gt.borne[j])}`] : [];
  const rows = made.left.rows.map((row): FormatRowParts => {
    const j = y.names.findIndex((nm) => ownName(y.fixed, nm) === row.label);
    if (!row.closing || j < 0) return row;
    const details = detailsOf(j);
    return { ...row, amount: rupees(gt.final[j]), ...(details.length > 0 ? { details } : {}) };
  });
  const left: AccountSideParts = { ...made.left, rows };
  return { ...made, left };
}

const APP_DISTRACTORS = (y: PfPartnersYear): string[] => [
  "Interest on Partner's Loan A/c", 'Drawings A/c', 'Balance c/d', otherOwnName(y.fixed, y.names[0]), 'General Reserve A/c', "Manager's Commission A/c",
  "Partner's Salary A/c", "Partner's Commission A/c", 'Interest on Drawings A/c',
];

/** The working of the Appropriation Account of a chain. */
function appropriationWorking(ch: Chain): string[] {
  const { y, loan, gt } = ch;
  const account = y.fixed ? 'Current A/c' : 'Capital A/c';
  const out = [`interest on capital ${inr(sum(y.ioc))}`, ...(sum(y.salary) > 0 ? [`salary ${inr(sum(y.salary))}`] : []), ...(sum(y.commission) > 0 ? [`commission ${inr(sum(y.commission))}`] : [])];
  return [
    loan
      ? `Interest on ${y.names[loan.lender]}'s loan is a charge against profit: nothing is agreed, so 6% p.a. for ${12 - loan.k} months = ${inr(loan.loan)} x 6/100 x ${12 - loan.k}/12 = ${inr(loan.interest)}. It comes off in Profit and Loss A/c, so the net profit brought into this account is ${inr(y.profit + loan.interest)} - ${inr(loan.interest)} = ${inr(y.profit)}, and the interest itself is not shown here.`
      : `The account opens with the net profit brought from Profit and Loss A/c: By Profit and Loss A/c ${inr(y.profit)}.`,
    ...(sum(y.iod) > 0 ? [`Interest on drawings is credited. With no dates it runs for six months at ${y.q}% p.a.: ${y.names.map((nm, j) => `${nm} ${inr(y.drawings[j])} x ${y.q}/100 x 6/12 = ${inr(y.iod[j])}`).join('; ')}; total ${inr(sum(y.iod))}.`] : []),
    `Interest on capital at ${y.r}% p.a. is debited: ${y.iocWorking.join(' ')} Total ${inr(sum(y.ioc))}.`,
    ...(sum(y.salary) > 0 ? [`Salary to ${y.names[y.si]} = ${inr(y.s)} x 12 = ${inr(sum(y.salary))}, debited.`] : []),
    ...(sum(y.commission) > 0 ? [`The commission of ${inr(sum(y.commission))} to ${y.names[y.ci]} is debited.`] : []),
    `Divisible profit = ${inr(y.profit)}${sum(y.iod) > 0 ? ` + ${inr(sum(y.iod))}` : ''} - ${out.join(' - ')} = ${inr(y.divisible)}.`,
    P.sharesText(y.names, y.divisible, y.psr),
    ...(gt
      ? [
          `${y.names[2]}'s share of ${inr(gt.own[2])} is ${inr(gt.gap)} short of the guaranteed ${inr(gt.guaranteed)}. ${borneSays(y.names, gt)}`,
          `Each share is shown after the deficiency: ${each(y.names, gt.final)}.`,
        ]
      : []),
    `Each share is debited and carried to the partner's ${account}, because capitals are ${y.fixed ? 'fixed' : 'fluctuating'}. The two sides then agree and no balance is left.`,
  ];
}

/** The Appropriation Account rebuilt from the printed case: both sides at the net profit and interest on drawings, and a closing row for each partner's final share. */
function appropriationHolds(q: AccountQuestion): boolean {
  const b = readChain(q.data);
  const [debit, creditSide] = q.sides.map((side) => side.rows);
  const total = (rows: typeof debit): number => sum(rows.map((row) => row.amounts[0])) / 100;
  const credits = b.profit + sum(b.iod);
  const shown = (label: string): number => (debit.find((row) => row.label === label)?.amounts[0] ?? 0) / 100;
  return (
    b.finals.length === b.names.length &&
    near(total(debit), credits) &&
    near(total(creditSide), credits) &&
    near((creditSide.find((row) => row.label === 'Profit and Loss A/c')?.amounts[0] ?? 0) / 100, b.profit) &&
    near(shown('Interest on Capital A/c'), sum(b.ioc)) &&
    near(shown("Partner's Salary A/c"), sum(b.salary)) &&
    // Nothing that is a charge may stand in the account.
    !debit.some((row) => /Loan|Rent|Manager/.test(row.label)) &&
    b.names.every((nm, j) => debit.some((row) => row.closing && row.label === ownName(b.fixed, nm) && near(row.amounts[0] / 100, b.finals[j])))
  );
}

/** Partners' accounts in columns rebuilt from the printed case: each column closes on `expected`, and the share of profit is the final share. */
function columnsHold(q: AccountQuestion, expected: number[], finals: number[]): boolean {
  const [debit, creditSide] = q.sides;
  const carried = (side: typeof debit): number[] => side.rows.find((row) => row.closing)?.amounts ?? [];
  const brought = (side: typeof debit): number[] => side.below[0]?.amounts ?? [];
  const share = creditSide.rows.find((row) => row.label === 'Profit and Loss Appropriation A/c')?.amounts ?? [];
  return (
    expected.length === q.columns.length &&
    finals.every((x, c) => near((share[c] ?? 0) / 100, x)) &&
    expected.every((x, c) => near(((carried(debit)[c] ?? 0) - (carried(creditSide)[c] ?? 0)) / 100, x) && near(((brought(creditSide)[c] ?? 0) - (brought(debit)[c] ?? 0)) / 100, x))
  );
}

/** The closing balance of each partner's own account (capital, or current beside a fixed capital), in rupees. */
function closingOf(y: PfPartnersYear): number[] {
  return y.names.map((_, j) => {
    const yearly = y.ioc[j] + y.salary[j] + y.commission[j] + y.shares[j] - y.drawings[j] - y.iod[j];
    return y.fixed ? y.currents[j] + yearly : y.caps[j] + sum(y.moves.filter((m) => m.i === j).map((m) => (m.kind === 'in' ? m.amt : -m.amt))) + yearly;
  });
}

/** The partners' own accounts in columns from the year's entries: capital accounts, or current accounts beside fixed capitals. */
function chainColumns(ch: Chain) {
  const { y } = ch;
  const accountIds = y.names.map((nm) => ownId(y.fixed, nm));
  const opening = { date: y.yr.from, balances: P.openingBalances(y.fixed ? y.currents : y.caps) };
  return {
    title: y.fixed ? "Partners' Current Accounts" : "Partners' Capital Accounts",
    columns: partnerColumns(y.names),
    ...columnarSides(columnarAccount(P.yearEntries(y), accountIds, opening), { closeOn: y.yr.on, reopenOn: P.reopens(y.yr) }),
    // "Profit and Loss A/c" is not offered: an examiner would not refuse it against a share of profit.
    distractors: ['Bank A/c', y.fixed ? 'Capital A/c' : 'Current A/c', 'Cash A/c', "Interest on Partner's Loan A/c", "Partner's Salary A/c", "Partner's Commission A/c", 'Interest on Drawings A/c', 'Interest on Capital A/c'],
  };
}

/** The working of the partners' accounts of a chain. */
function columnsWorking(ch: Chain): string[] {
  const { y, loan } = ch;
  const closing = closingOf(y);
  const over = y.names.filter((_, j) => closing[j] < 0);
  return [
    y.fixed
      ? `Capitals are fixed, so every yearly item goes through the current accounts. An opening credit balance is on the credit side${y.currents.some((x) => x < 0) ? ' and an opening debit balance on the debit side' : ''}: Balance b/d.`
      : 'Capitals are fluctuating, so every item of the year goes through the capital accounts. Each partner has a column, and a capital is a credit balance: By Balance b/d.',
    y.fixed && y.moves.length > 0
      ? `Capital brought in or withdrawn belongs to the capital accounts and is not entered here, but it changes the interest on capital, which is credited: By Interest on Capital A/c. ${y.iocWorking.join(' ')}`
      : [y.fixed ? '' : P.movesWhy(y), `Interest on capital is credited: By Interest on Capital A/c. ${y.iocWorking.join(' ')}`].filter(Boolean).join(' '),
    ...P.allowedWhy(y),
    P.drawingsWhy(y),
    ...(loan ? [`The interest on ${y.names[loan.lender]}'s loan is credited to the Loan A/c, not to this account.`] : []),
    `Each partner's share of profit is taken from the Profit and Loss Appropriation Account: By Profit and Loss Appropriation A/c, ${each(y.names, y.shares)}.`,
    over.length > 0
      ? `Balances: ${P.balancesText(y.names, closing)}. ${over.length === 1 ? `${over[0]} has` : `${list(over)} have`} drawn more than the year gave, so ${over.length === 1 ? 'that account is' : 'those accounts are'} overdrawn: a debit balance is carried down on the credit side and brought down on the debit side. A credit balance is carried down on the debit side.`
      : `The credit side of every column is the larger. Balances: ${P.balancesText(y.names, closing)}, carried down on the debit side and brought down on the credit side on ${P.reopens(y.yr)}.`,
  ];
}
const columnsTask = (y: PfPartnersYear): string =>
  `Prepare the partners' ${y.fixed ? 'current' : 'capital'} accounts in columns for the ${y.yr.ended}, taking each partner's share of profit from the Profit and Loss Appropriation Account, and bring the balances down on ${P.reopens(y.yr)}.`;
const columnsVerify = (q: AccountQuestion): boolean => {
  const b = readChain(q.data);
  const yearly = yearlyOf(b);
  const expected = b.names.map((_, j) => (b.fixed ? (b.currents[j] ?? NaN) : b.caps[j] + b.moved[j]) + yearly[j]);
  return b.finals.length === b.names.length && columnsHold(q, expected, b.finals);
};

// ---------------------------------------------------------------------------------------------------------------
// 6. case-pf-chain-fluctuating: fluctuating capitals. The appropriation entries of the year (each appropriation, and
//    interest on drawings, through an account of its own that is then closed), the Profit and Loss Appropriation
//    Account, and the partners' capital accounts in columns (complex)
// ---------------------------------------------------------------------------------------------------------------

type SetItem = Pick<SetTransaction, 'text' | 'lines' | 'explanation'>;
/** The accounts of the appropriations a year has, by name, for the entry that closes them. */
function appropriationAccounts(y: PfPartnersYear): { id: string; name: string; amount: number }[] {
  return [
    { id: 'interestOnCapital', name: 'Interest on Capital A/c', amount: sum(y.ioc) },
    { id: 'partnersSalary', name: "Partner's Salary A/c", amount: sum(y.salary) },
    { id: 'partnersCommission', name: "Partner's Commission A/c", amount: sum(y.commission) },
  ].filter((x) => x.amount > 0);
}

function appropriationSet(ch: Chain): SetTransaction[] {
  const { y } = ch;
  const own = (j: number): string => partnerCapital(y.names[j]);
  const { dr, cr } = P;
  const items: SetItem[] = [];
  if (ch.transfer) {
    items.push({
      text: 'The net profit of the year is carried from Profit and Loss A/c to Profit and Loss Appropriation A/c.',
      lines: [dr('profitAndLoss', y.profit), cr(APP, y.profit)],
      explanation: [`Profit and Loss A/c is debited with its net profit of ${inr(y.profit)}, which closes it.`, 'Profit and Loss Appropriation A/c is credited: it is the account in which the profit is shared out.'],
    });
  }
  items.push({
    text: 'Interest on capital is allowed to the partners for the year.',
    lines: [dr('interestOnCapital', sum(y.ioc)), ...y.names.map((_, j) => cr(own(j), y.ioc[j]))],
    explanation: [`Interest on capital at ${y.r}% p.a. ${y.iocWorking.join(' ')} Total ${inr(sum(y.ioc))}.`, 'The firm records it in an account of its own first: Interest on Capital A/c is debited with the total.', "Capitals are fluctuating, so each partner's Capital A/c is credited."],
  });
  if (sum(y.salary) > 0) {
    items.push({
      text: `${y.names[y.si]} is allowed the salary for the year.`,
      lines: [dr('partnersSalary', sum(y.salary)), cr(own(y.si), sum(y.salary))],
      explanation: [`Salary = ${inr(y.s)} x 12 = ${inr(sum(y.salary))}.`, `Partner's Salary A/c is debited and ${y.names[y.si]}'s Capital A/c is credited. It is an appropriation, not the Salaries A/c of the staff.`],
    });
  }
  if (sum(y.commission) > 0) {
    items.push({
      text: `${y.names[y.ci]} is allowed the commission for the year.`,
      lines: [dr('partnersCommission', sum(y.commission)), cr(own(y.ci), sum(y.commission))],
      explanation: [`Partner's Commission A/c is debited with ${inr(sum(y.commission))} and ${y.names[y.ci]}'s Capital A/c is credited.`],
    });
  }
  if (sum(y.iod) > 0) {
    items.push(
      {
        text: 'Interest on drawings is charged to the partners for the year.',
        lines: [...y.names.map((_, j) => dr(own(j), y.iod[j])), cr('interestOnDrawings', sum(y.iod))],
        explanation: [
          `With no dates, interest on drawings runs for six months at ${y.q}% p.a.: ${y.names.map((nm, j) => `${nm} ${inr(y.drawings[j])} x ${y.q}/100 x 6/12 = ${inr(y.iod[j])}`).join('; ')}; total ${inr(sum(y.iod))}.`,
          "The partners owe it to the firm, so each partner's Capital A/c is debited, and Interest on Drawings A/c is credited.",
        ],
      },
      {
        text: 'Interest on Drawings A/c is closed at the year end.',
        lines: [dr('interestOnDrawings', sum(y.iod)), cr(APP, sum(y.iod))],
        explanation: ['Interest on drawings is a gain of the firm that adds to the profit to be shared.', 'Interest on Drawings A/c is debited to close it, and Profit and Loss Appropriation A/c is credited.'],
      },
    );
  }
  const closed = appropriationAccounts(y);
  items.push(
    {
      text: closed.length === 1 ? `${closed[0].name} is closed at the year end.` : `${list(closed.map((x) => x.name))} are closed at the year end.`,
      lines: [dr(APP, sum(closed.map((x) => x.amount))), ...closed.map((x) => cr(x.id, x.amount))],
      explanation: [
        'These are appropriations of profit, made because the partners have agreed to them.',
        `So ${closed.length === 1 ? 'the account is' : 'each account is'} closed to Profit and Loss Appropriation A/c, which is debited with ${added(closed.map((x) => x.amount))}, and never to Profit and Loss A/c.`,
      ],
    },
    {
      text: 'The profit that is left is shared among the partners.',
      lines: [dr(APP, y.divisible), ...y.names.map((_, j) => cr(own(j), y.shares[j]))],
      explanation: [
        `Divisible profit = ${inr(y.profit)}${sum(y.iod) > 0 ? ` + interest on drawings ${inr(sum(y.iod))}` : ''} - interest on capital ${inr(sum(y.ioc))}${sum(y.salary) > 0 ? ` - salary ${inr(sum(y.salary))}` : ''}${sum(y.commission) > 0 ? ` - commission ${inr(sum(y.commission))}` : ''} = ${inr(y.divisible)}.`,
        P.sharesText(y.names, y.divisible, y.psr),
        "Profit and Loss Appropriation A/c is debited with what is left, which closes it, and each partner's Capital A/c is credited with the share.",
      ],
    },
  );
  return P.labelled(items);
}

const chainFluctuating = caseTemplate<Chain>({
  id: 'case-pf-chain-fluctuating',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Entries, appropriation and capital accounts',
  setup: (rng) => {
    const drawn = P.partnersYear(rng, false, { rich: true });
    const y = drawn && believable(drawn);
    if (!y || closingOf(y).some((x) => x <= 0)) return null;
    return { y, transfer: rng.int(0, 1) === 0 };
  },
  context: (ch) =>
    chainText(
      ch,
      `${P.OWN_ACCOUNTS}${sum(ch.y.iod) > 0 ? ` ${P.OWN_DRAWINGS}` : ''}${ch.transfer ? '' : ' The net profit has already been carried to Profit and Loss Appropriation A/c.'}`,
    ),
  parts: [
    {
      kind: 'journal_set',
      make: (ch) => ({
        // The form of the entries, said plainly: each item through its own account, closed to the Appropriation A/c.
        task: `Pass the journal entries of ${ch.y.yr.on} for the appropriation of the profit, putting each item through its own account (${list([...appropriationAccounts(ch.y).map((x) => x.name), ...(sum(ch.y.iod) > 0 ? ['Interest on Drawings A/c'] : [])])}) and then closing that account to Profit and Loss Appropriation A/c.`,
        transactions: appropriationSet(ch),
        hints: [P.H.approp[0], 'Each appropriation is first credited to the partner from an account of its own, and that account is then closed to Profit and Loss Appropriation A/c.'],
        // The slips: the Current A/c that only fixed capitals have, the Drawings A/c, the staff's expense accounts, and
        // Profit and Loss A/c for what is no charge.
        distractorAccounts: [...ch.y.names.map(partnerCurrent), partnerDrawings(ch.y.names[0]), 'salaries', 'generalReserve', ...(ch.transfer ? [] : ['profitAndLoss'])],
      }),
      verify: (q: JournalSetQuestion) => {
        if (!setHolds()(q)) return false;
        const b = readChain(q.context ?? '');
        const ledger = post(q.entries.map((e) => e.expected));
        const carried = q.entries.some((e) => e.expected.some((l) => l.accountId === 'profitAndLoss'));
        return (
          ['interestOnCapital', 'partnersSalary', 'partnersCommission', 'interestOnDrawings'].every((id) => (ledger.get(id) ?? 0) === 0) &&
          // Profit and Loss Appropriation A/c is used up: closed when the set carries the profit to it, else debited with the whole profit.
          (ledger.get(APP) ?? 0) === (carried ? 0 : rupees(b.profit)) &&
          b.names.every((nm, j) => near(P.credit(ledger, partnerCapital(nm)), b.ioc[j] + b.salary[j] + b.commission[j] + b.shares[j] - b.iod[j]))
        );
      },
    },
    {
      kind: 'account',
      make: (ch) => {
        const made = chainAppropriation(ch);
        return {
          // The account the entries above are posted to: the task says so, in the words of the topic's format.
          task: `Posting the entries above, p${P.appTask(ch.y.yr, sum(ch.y.iod) > 0).slice(1)}`,
          title: P.APP_TITLE,
          left: made.left,
          right: made.right,
          distractors: APP_DISTRACTORS(ch.y),
          explanation: appropriationWorking(ch),
          hints: P.H.approp,
        };
      },
      verify: appropriationHolds,
    },
    {
      kind: 'account',
      make: (ch) => ({ task: columnsTask(ch.y), ...chainColumns(ch), explanation: columnsWorking(ch), hints: ["Which items add to a partner's capital and which take away from it?", P.H.ioc[0]] }),
      verify: columnsVerify,
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 7. case-pf-chain-fixed: fixed capitals. The Profit and Loss Appropriation Account (in a third of the seeds from a
//    profit that is still before interest on a partner's loan), then the partners' current accounts in columns, where
//    a partner may end overdrawn (complex)
// ---------------------------------------------------------------------------------------------------------------

const chainFixed = caseTemplate<Chain>({
  id: 'case-pf-chain-fixed',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Appropriation and current accounts',
  setup: (rng) => {
    const overdraw = rng.int(0, 9) < 3;
    const drawn = P.partnersYear(rng, true, { overdraw, rich: true });
    const y = drawn && believable(drawn, overdraw);
    if (!y || closingOf(y).some((x) => x === 0)) return null;
    if (rng.int(0, 2) > 0) return { y };
    const k = rng.int(1, 9);
    // A loan in keeping with the capitals of the firm.
    const loan = rng.step(100000, Math.max(100000, Math.min(400000, Math.floor(sum(y.caps) / 40000) * 20000)), 20000);
    return { y, loan: { lender: rng.int(0, y.names.length - 1), k, loan, interest: (loan * 6 * (12 - k)) / 1200 } };
  },
  context: (ch) => chainText(ch, P.ITEMS_OWN),
  parts: [
    {
      kind: 'account',
      make: (ch) => {
        const made = chainAppropriation(ch);
        return {
          task: `${P.appTask(ch.y.yr, sum(ch.y.iod) > 0)}${ch.loan ? ` Open it with the net profit after the interest on ${ch.y.names[ch.loan.lender]}'s loan.` : ''}`,
          title: P.APP_TITLE,
          left: made.left,
          right: made.right,
          distractors: [...APP_DISTRACTORS(ch.y), ...(ch.loan ? [`${ch.y.names[ch.loan.lender]}'s Loan A/c`] : [])],
          explanation: appropriationWorking(ch),
          hints: [P.H.charge[0], P.H.approp[0]],
        };
      },
      verify: appropriationHolds,
    },
    {
      kind: 'account',
      make: (ch) => ({ task: columnsTask(ch.y), ...chainColumns(ch), explanation: columnsWorking(ch), hints: [P.H.capitals[1], "Each share of profit is the one the Profit and Loss Appropriation Account carries to the partner's current account."] }),
      verify: columnsVerify,
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 8. case-pf-chain-guarantee: a year in which the junior partner's share is guaranteed, by the firm, by both other
//    partners in a stated ratio or by one of them. The Profit and Loss Appropriation Account shows each share after
//    the deficiency, and the partners' current (or capital) accounts take those shares (complex)
// ---------------------------------------------------------------------------------------------------------------

const chainGuarantee = caseTemplate<Chain>({
  id: 'case-pf-chain-guarantee',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Appropriation with a guaranteed share',
  setup: (rng) => {
    const names = P.partners(rng, 3);
    const yr = P.yearOf(rng);
    const firm = P.firmOf(rng);
    const fixed = rng.int(0, 1) === 0;
    const psr = P.psrOf(rng, 3);
    const total = sum(psr);
    const units = rng.pick(P.CAPS3);
    const base = capitalBase(rng, units, 600000, 1600000);
    if (base === null) return null;
    const caps = units.map((u) => u * base);
    const r = rng.pick([5, 6, 8, 10]);
    const moves = rng.int(0, 1) === 0 ? [] : P.movesOf(rng, caps, 1);
    if (moves === null) return null;
    const { ioc, working } = P.interestOnCapitals(names, caps, r, moves, yr);
    const si = rng.int(0, 1);
    const s = rng.step(2000, 8000, 500);
    const withSalary = rng.int(0, 2) > 0;
    const salary = names.map((_, j) => (withSalary && j === si ? 12 * s : 0));
    const q = rng.pick([6, 9, 10, 12]);
    const charged = rng.int(0, 2) > 0;
    const debit = fixed && rng.int(0, 2) === 0 ? rng.int(0, 2) : -1;
    const currents = names.map((_, j) => (fixed ? (j === debit ? -1 : 1) * rng.step(4000, 30000, 2000) : 0));
    const step = total * 1000;
    // A net profit of at most 40% of the capitals (interest on drawings only lowers it).
    const most = Math.floor((PROFIT_CAP * sum(caps) - sum(ioc) - sum(salary)) / step);
    const least = Math.ceil(100000 / step);
    if (most < least) return null;
    const divisible = step * rng.int(least, most);
    const gt = guaranteeOn(rng, psr, divisible, rng.pick<GuaranteeKind>(['firm', 'firm', 'ratio', 'one']));
    if (gt === null) return null;
    // Drawings in whole ten thousands, at most what the year gives the partner, so that an account is seldom overdrawn.
    const drawings = names.map((_, j) => rng.step(10000, Math.max(10000, Math.floor((ioc[j] + salary[j] + gt.final[j]) / 10000) * 10000), 10000));
    const iod = drawings.map((d) => (charged ? (d * q * 6) / 1200 : 0));
    const y: PfPartnersYear = {
      names, yr, firm, fixed, psr, caps, currents, moves, r, ioc, iocWorking: working, drawings, q, iod, si, s, salary, ci: 0, commission: [0, 0, 0],
      divisible, shares: gt.final, profit: divisible + sum(ioc) + sum(salary) - sum(iod),
    };
    const closing = closingOf(y);
    if (fixed ? closing.some((x) => x === 0) : closing.some((x) => x <= 0)) return null;
    return { y, gt };
  },
  context: (ch) =>
    chainText(ch, P.ITEMS_OWN, [
      `${guaranteeSays(ch.y.names, ch.y.psr, ch.gt!)} In the Profit and Loss Appropriation Account each partner's share of profit is shown after the deficiency has been borne.`,
    ]),
  parts: [
    {
      kind: 'account',
      make: (ch) => {
        const made = chainAppropriation(ch);
        return {
          task: `Prepare the Profit and Loss Appropriation Account for the ${ch.y.yr.ended}, showing interest on capital${sum(ch.y.iod) > 0 ? ' and interest on drawings as one figure each' : ' as one figure'} and each partner's share of profit on its own, after the deficiency.`,
          title: P.APP_TITLE,
          left: made.left,
          right: made.right,
          distractors: APP_DISTRACTORS(ch.y),
          explanation: appropriationWorking(ch),
          hints: [P.H.approp[0], P.H.guarantee[1]],
        };
      },
      verify: appropriationHolds,
    },
    {
      kind: 'account',
      make: (ch) => ({ task: columnsTask(ch.y), ...chainColumns(ch), explanation: columnsWorking(ch), hints: [P.H.capitals[1], 'Each share of profit is the one the Profit and Loss Appropriation Account shows, after the deficiency.'] }),
      verify: columnsVerify,
    },
  ],
});

// The cases of this stage (Class 12): see docs/authoring-cases.md. Its topic and concept are in ./index.ts. The
// cases of short questions come first, the shortest first, and the chained cases after them.
const cases: CaseTemplate[] = [noDeed, interestYear, guarantee, commissionLoan, pastAdjustment, chainFluctuating, chainFixed, chainGuarantee];

export default cases;
