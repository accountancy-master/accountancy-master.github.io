/**
 * Case studies of Computerised Accounting, the option a Class 12 learner may take as Part B: a business that moves to
 * a computerised system, or runs its figures on a sheet. A learner sees them only with that choice, as the topic is
 * (content/courseOptions.ts). They stay outside the mock papers (`STAGES_OUTSIDE_PAPERS` in learning/paperBlueprints.ts):
 * the 6-mark question of that paper is a schedule to prepare.
 *
 * The conventions are those of the topic's bank (templates/computerised-accounting.ts), whose helpers these cases
 * reuse: a spreadsheet function is described in plain words beside its name; SLN is (cost - salvage value) ÷ life; DB
 * charges a fixed rate, 1 - (salvage value ÷ cost)^(1 ÷ life), on the book value at the start of each period, and the
 * figures make that rate exact; PMT is the equal instalment at the end of each year, on a round loan at a rate a lender
 * charges on a business loan (8% to 12%); the schedule rounds the instalment and each year's interest to the nearest
 * rupee and adjusts the last instalment so that the loan is repaid exactly; interest of a year is the balance at its start
 * × the rate; a code follows only the scheme the case sets out; a ratio is defined in the case, since a learner of this
 * option has not met the analysis of statements; entries are those of a sole trader, made through a journal voucher,
 * depreciation credited to the asset account. No DBMS or SQL.
 *
 * Figures are in whole rupees until they are returned. Every typed part and entry is worked out again by its `verify`
 * from the printed case text.
 */
import type { JournalQuestion, McqQuestion } from '@/content/types';
import { creditor, debtor } from '@/engine/accounts';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import { caseTemplate, rupees } from '../authoring';
import { CAS_CASE as C, type CasBrsSheet, type CasCodeScheme, type CasLoan } from '../templates/computerised-accounting';
import type { CaseTemplate, JournalParts, McqParts, SetTransaction } from '../types';

const TOPIC = 'computerised-accounting';
const CONCEPT = 'cas-case';
const common = { topicId: TOPIC, conceptId: CONCEPT };

const { HINTS, inr, dec, amountsIn, optionText, cap, typed, choice, dr, cr, sideTotal } = C;

/** The printed case a question was made from. */
const ctx = (q: { context?: string }): string => q.context ?? '';
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
/** The amounts of the line of a text that starts with `start`, in whole rupees. */
const lineAmounts = (text: string, start: string): number[] => amountsIn(text.split('\n').find((l) => l.startsWith(start)) ?? '');

/** The first draw that is not null. */
function firstGood<S>(times: number, draw: () => S | null): S | null {
  for (let i = 0; i < times; i++) {
    const s = draw();
    if (s !== null) return s;
  }
  return null;
}

/** The ledger account an asset of the bank's list is kept in. */
const ACCOUNT_OF: Record<string, { id: string; name: string }> = {
  machine: { id: 'machinery', name: 'Machinery' },
  'delivery van': { id: 'vehicles', name: 'Vehicles' },
  'set of computers': { id: 'computers', name: 'Computers' },
  generator: { id: 'machinery', name: 'Machinery' },
  'printing press': { id: 'machinery', name: 'Machinery' },
  'packing machine': { id: 'machinery', name: 'Machinery' },
};

// ---------------------------------------------------------------------------------------------------------------
// 1. A depreciation schedule on a sheet
// ---------------------------------------------------------------------------------------------------------------

interface Sln {
  firm: string;
  asset: string;
  cost: number;
  salvage: number;
  life: number;
  dep: number;
  k: number;
  first: number;
  /** Installation charges, part of the cost, with a cell of their own; 0 when the invoice is the whole cost. */
  install: number;
}

/** The cost, salvage value and life printed in the cells: with installation charges there is one cell more. */
function slnOf(text: string): { cost: number; salvage: number; life: number } {
  const c = C.cellsIn(text);
  return c.has('B4') ? { cost: c.get('B1')! + c.get('B2')!, salvage: c.get('B3')!, life: c.get('B4')! } : { cost: c.get('B1')!, salvage: c.get('B2')!, life: c.get('B3')! };
}

const slnSchedule = caseTemplate<Sln>({
  ...common,
  id: 'case-cas-sln-schedule',
  difficulty: 'easy',
  title: 'A depreciation schedule on a sheet',
  setup: (rng) => {
    const life = rng.pick([4, 5, 8, 10]), dep = rng.step(8000, 90000, 1000);
    // A salvage value of at most a quarter of what is written off: an asset is not sold for most of its cost.
    const salvage = rng.step(4000, Math.min(60000, Math.floor((dep * life) / 8000) * 2000), 2000);
    const cost = dep * life + salvage;
    const install = rng.next() < 0.5 ? Math.min(rng.step(2, 12, 1) * 1000, Math.floor(cost / 10000) * 1000) : 0;
    return { firm: rng.pick(C.FIRMS), asset: rng.pick(C.ASSETS), cost, salvage, life, dep, k: rng.int(2, life - 1), first: rng.pick([2021, 2022, 2023]), install };
  },
  context: (s) =>
    [
      `${s.firm} has moved its record of fixed assets from a register to a sheet. It bought a ${s.asset} on 1 April ${s.first}; its years end on 31 March, and every year is a full year.`,
      ...(s.install
        ? [`B1 (invoice price): ${inr(s.cost - s.install)}`, `B2 (installation charges): ${inr(s.install)}`, `B3 (salvage value): ${inr(s.salvage)}`, `B4 (life in years): ${s.life}`]
        : [`B1 (cost): ${inr(s.cost)}`, `B2 (salvage value): ${inr(s.salvage)}`, `B3 (life in years): ${s.life}`]),
      `Column C, depreciation: =SLN(${s.install ? '$B$1+$B$2,$B$3,$B$4' : '$B$1,$B$2,$B$3'}), from C2 down, one row for each year. (${C.SLN_SAYS}.)`,
      `Column D, book value at the end of the year: ${s.install ? 'the cost in B1 and B2 at the start, then ' : ''}the book value of the year before less that year's depreciation.`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const parts = typed('rupees', s.dep, [
          [s.cost / s.life, 'Ignored the salvage value: SLN deducts it from the cost before dividing.'],
          [(s.cost + s.salvage) / s.life, 'Added the salvage value to the cost instead of deducting it.'],
          [s.cost - s.salvage, 'Did not divide by the life: that is the total depreciation over the whole life.'],
          s.install > 0 && [(s.cost - s.install - s.salvage) / s.life, 'Left the installation charges out of the cost; they are part of what the asset cost to put to use.'],
        ]);
        return parts && {
          prompt: 'What does the formula in column C return?',
          ...parts,
          explanation: [...(s.install ? [`Cost = ${inr(s.cost - s.install)} + ${inr(s.install)} = ${inr(s.cost)}.`] : []), `(${inr(s.cost)} - ${inr(s.salvage)}) ÷ ${s.life} = ${inr(s.cost - s.salvage)} ÷ ${s.life} = ${inr(s.dep)}.`],
          hints: HINTS.depreciation,
        };
      },
      verify: (q) => {
        const { cost, salvage, life } = slnOf(ctx(q));
        return q.answer === rupees((cost - salvage) / life);
      },
    },
    {
      kind: 'mcq',
      make: () =>
        choice(
          'Why are the references in the formula written with $ signs?',
          'So that every row of column C still reads the same cells when the formula is copied down',
          [
            ['So that the amounts are shown in a currency', 'A $ in a reference has nothing to do with money: it fixes the column letter or the row number it stands before.'],
            ['So that each row moves down to the next cell of column B', 'That is what a relative reference does, and the copies would then read the wrong cells.'],
            ['So that nobody can change the cost in B1', 'A $ does not protect a cell: B1 can still be changed, and the schedule would follow it.'],
          ],
          'A $ fixes the column letter or the row number it stands before, so a copy of the formula keeps reading the same cells.',
          HINTS.copy,
        ),
      verify: (q) => optionText(q).includes('same cells'),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const parts = typed('rupees', s.k * s.dep, [
          [(s.k - 1) * s.dep, `Added up the depreciation of ${s.k - 1} ${s.k === 2 ? 'year' : 'years'} only.`],
          [s.cost - s.k * s.dep, 'Gave the book value instead of the depreciation charged so far.'],
          [(s.k * s.cost) / s.life, 'Ignored the salvage value: the yearly depreciation is (cost - salvage value) ÷ life.'],
        ]);
        return parts && { prompt: `What is the total depreciation charged in the first ${s.k} years?`, ...parts, explanation: [`${s.k} × ${inr(s.dep)} = ${inr(s.k * s.dep)}.`], hints: HINTS.depreciation };
      },
      verify: (q) => {
        const { cost, salvage, life } = slnOf(ctx(q));
        const k = Number(/first (\d+) years/.exec(q.prompt)?.[1]);
        return q.answer === rupees((k * (cost - salvage)) / life);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const book = s.cost - s.k * s.dep;
        const parts = typed('rupees', book, [
          [s.cost - (s.k - 1) * s.dep, `Took the book value at the start of year ${s.k}, one year's depreciation short.`],
          [s.cost - (s.k + 1) * s.dep, `Deducted the depreciation of ${s.k + 1} years.`],
          [s.cost - (s.k * s.cost) / s.life, 'Ignored the salvage value: the yearly depreciation is (cost - salvage value) ÷ life.'],
          [s.k * s.dep, 'Gave the depreciation charged so far, not the book value.'],
        ]);
        return parts && { prompt: `What book value does column D show at the end of year ${s.k}?`, ...parts, explanation: [`${inr(s.cost)} - ${s.k} × ${inr(s.dep)} = ${inr(book)}.`], hints: HINTS.depreciation };
      },
      verify: (q) => {
        const { cost, salvage, life } = slnOf(ctx(q));
        const k = Number(/end of year (\d+)\?/.exec(q.prompt)?.[1]);
        return q.answer === rupees(cost - (k * (cost - salvage)) / life);
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const a = ACCOUNT_OF[s.asset];
        return {
          prompt: `Pass the entry the journal voucher records for the depreciation of one year, credited to the asset account (${a.name} A/c).`,
          lines: [dr('depreciation', s.dep), cr(a.id, s.dep)],
          explanation: ['Depreciation is an expense: Depreciation A/c is debited.', `The value of the asset falls: ${a.name} A/c is credited with ${inr(s.dep)}.`],
          distractorAccounts: ['provisionForDepreciation', 'profitAndLoss'],
          hints: HINTS.entries,
        };
      },
      verify: (q) => {
        const { cost, salvage, life } = slnOf(ctx(q));
        return sideTotal(q, 'Dr') === rupees((cost - salvage) / life) && q.expected.some((l) => l.side === 'Dr' && l.accountId === 'depreciation');
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 2. Two methods side by side
// ---------------------------------------------------------------------------------------------------------------

interface TwoMethods {
  firm: string;
  asset: string;
  cost: number;
  salvage: number;
  life: number;
  sln: number;
  rate: number;
  years: { start: number; dep: number; end: number }[];
  /** The years the owner compares. */
  k: 2 | 3;
}

const twoMethods = caseTemplate<TwoMethods>({
  ...common,
  id: 'case-cas-two-methods',
  version: 2,
  difficulty: 'medium',
  title: 'Two methods side by side',
  setup: (rng) =>
    firstGood(30, () => {
      // The written down value rate fits the life: over it, either method leaves about a tenth of the cost.
      const life = rng.pick([5, 8, 10]);
      const rate = rng.pick(({ 5: [30, 40], 8: [25], 10: [20] } as Record<number, number[]>)[life]);
      const cost = C.exactCost(rng, rate, 3, 200000, 2500000);
      if (cost === null) return null;
      const sln = Math.round((cost * 0.9) / life / 100) * 100;
      const salvage = cost - sln * life;
      const k = rng.pick([2, 3] as const);
      const years = C.wdvYears(cost, rate, k);
      if (salvage <= 0 || sln * k === sum(years.map((y) => y.dep))) return null;
      return { firm: rng.pick(C.FIRMS), asset: rng.pick(C.ASSETS), cost, salvage, life, sln, rate, years, k };
    }),
  context: (s) =>
    [
      `${s.firm} wants to compare two methods of depreciation for a ${s.asset} over its first ${s.k} years, before it sets up its computerised system. It lays both out on a sheet; every year is a full year.`,
      `B1 (cost): ${inr(s.cost)}`,
      `B2 (salvage value): ${inr(s.salvage)}`,
      `B3 (life in years): ${s.life}`,
      `F1 (rate of depreciation, written down value): ${s.rate}%`,
      `Column C, straight line: =SLN($B$1,$B$2,$B$3) in every year. (${C.SLN_SAYS}.)`,
      'Column D, written down value: the book value at the start of the year times $F$1; the book value falls by that depreciation each year.',
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const parts = typed('rupees', s.sln, [
          [s.cost / s.life, 'Ignored the salvage value.'],
          [(s.cost * s.rate) / 100, 'Used the rate of column D.'],
          [s.cost - s.salvage, 'Did not divide by the life.'],
        ]);
        return parts && { prompt: 'What depreciation does column C show each year?', ...parts, explanation: [`(${inr(s.cost)} - ${inr(s.salvage)}) ÷ ${s.life} = ${inr(s.sln)}.`], hints: HINTS.depreciation };
      },
      verify: (q) => {
        const c = C.cellsIn(ctx(q));
        return q.answer === rupees((c.get('B1')! - c.get('B2')!) / c.get('B3')!);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const parts = typed('rupees', s.years[0].dep, [
          [((s.cost - s.salvage) * s.rate) / 100, 'Took the salvage value off first: this rate is charged on the book value.'],
          [s.years[0].end, 'Gave the book value at the end of the year.'],
          [s.sln, 'Gave the straight line figure.'],
        ]);
        return parts && { prompt: 'What depreciation does column D show for year 1?', ...parts, explanation: [`${inr(s.cost)} × ${s.rate}% = ${inr(s.years[0].dep)}.`], hints: HINTS.depreciation };
      },
      verify: (q) => {
        const c = C.cellsIn(ctx(q));
        return q.answer === rupees((c.get('B1')! * c.get('F1')!) / 100);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const y = s.years[s.k - 1];
        const parts = typed('rupees', y.dep, [
          [(s.cost * s.rate) / 100, 'Charged the rate on the cost every year, as the straight line method does.'],
          [s.years[s.k - 2].dep, `Gave the depreciation of year ${s.k - 1}.`],
          [y.start, `Gave the book value at the start of year ${s.k} without charging the rate on it.`],
          [y.end, `Gave the book value at the end of year ${s.k}.`],
        ]);
        return parts && {
          prompt: `What depreciation does column D show for year ${s.k}?`,
          ...parts,
          explanation: [...s.years.map((x, i) => `Year ${i + 1}: ${inr(x.start)} × ${s.rate}% = ${inr(x.dep)}; book value ${inr(x.end)}.`)],
          hints: HINTS.depreciation,
        };
      },
      verify: (q) => {
        const c = C.cellsIn(ctx(q));
        const r = c.get('F1')! / 100;
        const k = Number(/for year (\d)\?/.exec(q.prompt)?.[1]);
        return q.answer === rupees(c.get('B1')! * (1 - r) ** (k - 1) * r);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const wdv = sum(s.years.map((y) => y.dep));
        const gap = Math.abs(wdv - s.k * s.sln);
        const parts = typed('rupees', gap, [
          [wdv, 'Gave the total of the written down value method alone.'],
          [s.k * s.sln, 'Gave the total of the straight line method alone.'],
          [Math.abs(s.years[0].dep - s.sln), 'Compared year 1 only.'],
          [Math.abs(s.years[s.k - 1].dep - s.sln), `Compared year ${s.k} only.`],
        ]);
        return parts && {
          prompt: `By how much do the two methods differ in the total depreciation of the first ${s.k} years?`,
          ...parts,
          explanation: [`Straight line: ${s.k} × ${inr(s.sln)} = ${inr(s.k * s.sln)}.`, `Written down value: ${s.years.map((y) => inr(y.dep)).join(' + ')} = ${inr(wdv)}.`, `Difference = ${inr(gap)}.`],
          hints: HINTS.depreciation,
        };
      },
      verify: (q) => {
        const c = C.cellsIn(ctx(q));
        const r = c.get('F1')! / 100, cost = c.get('B1')!;
        const k = Number(/first (\d) years/.exec(q.prompt)?.[1]);
        return q.answer === rupees(Math.abs(cost * (1 - (1 - r) ** k) - (k * (cost - c.get('B2')!)) / c.get('B3')!));
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const slnBook = s.cost - s.k * s.sln, wdvBook = s.years[s.k - 1].end;
        const higher = wdvBook > slnBook ? 'Written down value' : 'Straight line';
        const other = higher === 'Straight line' ? 'Written down value' : 'Straight line';
        const hi = Math.max(slnBook, wdvBook);
        return choice(
          `Which method leaves the higher book value after ${s.k} years, and what is that value?`,
          `${higher}: ${inr(hi)}`,
          [
            [`${other}: ${inr(hi)}`, `${inr(hi)} is what the ${lower2(higher)} method leaves.`],
            [`${other}: ${inr(Math.min(slnBook, wdvBook))}`, 'That is the lower of the two book values.'],
            [`${higher}: ${inr(hi - s.salvage)}, with the salvage value taken off as well`, 'The book value is the cost less the depreciation; the salvage value is not taken off again.'],
            [`${higher}: ${inr(s.cost)}, the cost`, `Depreciation has been charged for ${s.k} years, so the book value is below the cost.`],
          ],
          `Straight line: ${inr(s.cost)} - ${inr(s.k * s.sln)} = ${inr(slnBook)}. Written down value: ${inr(wdvBook)}.`,
          HINTS.depreciation,
        );
      },
      verify: (q) => {
        const c = C.cellsIn(ctx(q));
        const r = c.get('F1')! / 100, cost = c.get('B1')!;
        const k = Number(/after (\d) years/.exec(q.prompt)?.[1]);
        const sln = cost - (k * (cost - c.get('B2')!)) / c.get('B3')!, wdv = cost * (1 - r) ** k;
        return optionText(q) === (wdv > sln ? `Written down value: ${inr(Math.round(wdv))}` : `Straight line: ${inr(Math.round(sln))}`);
      },
    },
  ],
});

/** The name of a method as it stands in the middle of a sentence. */
const lower2 = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

// ---------------------------------------------------------------------------------------------------------------
// 3. What DB charges
// ---------------------------------------------------------------------------------------------------------------

interface Db {
  firm: string;
  asset: string;
  cost: number;
  salvage: number;
  life: number;
  rate: number;
  years: { start: number; dep: number; end: number }[];
  /** The later period the case asks about. */
  k: number;
  /** What the accountant is doing: the words change with it, the working does not. */
  why: string;
}

const dbFunction = caseTemplate<Db>({
  ...common,
  id: 'case-cas-db-function',
  difficulty: 'complex',
  title: 'What DB charges',
  setup: (rng) =>
    firstGood(30, () => {
      const c = C.dbCase(rng);
      if (!c) return null;
      const firm = rng.pick(C.FIRMS), asset = rng.pick(C.ASSETS);
      const why = rng.pick([
        `The accountant of ${firm} tries the function DB on a ${asset} before moving the fixed asset records to a sheet.`,
        `${firm} has moved its fixed asset records to a sheet and wants to see what DB charges on a ${asset}.`,
        `Before it changes its method of depreciation, ${firm} works out the depreciation of a ${asset} with the function DB.`,
      ]);
      return { firm, asset, ...c, years: C.wdvYears(c.cost, c.rate, c.life), k: rng.int(2, c.life), why };
    }),
  context: (s) =>
    [
      s.why,
      `B1 (cost): ${inr(s.cost)}`,
      `B2 (salvage value): ${inr(s.salvage)}`,
      `B3 (life in years): ${s.life}`,
      `${C.DB_SAYS.charAt(0).toUpperCase()}${C.DB_SAYS.slice(1)}.`,
      'For one period the formula is =DB(B1,B2,B3,period).',
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'percent',
      make: (s) => {
        const parts = typed('percent', s.rate, [
          [(((s.cost - s.salvage) / s.cost) * 100) / s.life, 'Gave the straight line rate: (cost - salvage value) ÷ cost ÷ life.'],
          [(s.salvage / s.cost) * 100, 'Gave the salvage value as a percentage of the cost.'],
          [((s.cost - s.salvage) / s.cost) * 100, 'Gave the fall in value over the whole life as a percentage of the cost.'],
        ]);
        const root = 1 - s.rate / 100;
        return parts && {
          prompt: 'What rate, in per cent, does DB charge each year?',
          ...parts,
          explanation: [`Salvage value ÷ cost = ${inr(s.salvage)} ÷ ${inr(s.cost)} = ${Number((root ** s.life).toFixed(6))}.`, `Its ${s.life === 2 ? 'square' : s.life === 3 ? 'cube' : 'fourth'} root is ${root}.`, `Rate = 1 - ${root} = ${(s.rate / 100).toFixed(3)}, that is ${s.rate}%.`],
          hints: ['DB charges the same rate every year on a falling book value, so that the book value falls exactly to the salvage value.', 'Rate = 1 - (salvage value ÷ cost)^(1 ÷ life).'],
        };
      },
      verify: (q) => {
        const c = C.cellsIn(ctx(q));
        return Math.round((1 - (c.get('B2')! / c.get('B1')!) ** (1 / c.get('B3')!)) * 1000) * 10 === q.answer;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const parts = typed('rupees', s.years[0].dep, [
          [(s.cost - s.salvage) / s.life, 'Gave the straight line depreciation, which is what SLN returns.'],
          [((s.cost - s.salvage) * s.rate) / 100, 'Charged the rate on the cost less the salvage value.'],
          [s.years[0].end, 'Gave the book value at the end of the year.'],
        ]);
        return parts && { prompt: 'What does =DB(B1,B2,B3,1) return?', ...parts, explanation: [`${inr(s.cost)} × ${s.rate}% = ${inr(s.years[0].dep)}.`], hints: HINTS.depreciation };
      },
      verify: (q) => {
        const c = C.cellsIn(ctx(q));
        return q.answer === rupees(c.get('B1')! * (1 - (c.get('B2')! / c.get('B1')!) ** (1 / c.get('B3')!)));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const y = s.years[s.k - 1];
        const parts = typed('rupees', y.dep, [
          [(s.cost * s.rate) / 100, 'Charged the rate on the cost: DB charges it on the book value at the start of the period.'],
          [((s.cost - s.salvage) * s.rate * (1 - s.rate / 100) ** (s.k - 1)) / 100, 'Charged the rate on the cost less the salvage value.'],
          [y.start, `Gave the book value at the start of period ${s.k}.`],
          [(s.cost - s.salvage) / s.life, 'Gave the straight line depreciation.'],
        ]);
        return parts && {
          prompt: `What does =DB(B1,B2,B3,${s.k}) return?`,
          ...parts,
          explanation: [...s.years.slice(0, s.k).map((x, i) => `Year ${i + 1}: ${inr(x.start)} × ${s.rate}% = ${inr(x.dep)}.`), `DB for year ${s.k} = ${inr(y.dep)}.`],
          hints: HINTS.depreciation,
        };
      },
      verify: (q) => {
        const c = C.cellsIn(ctx(q));
        const keep = (c.get('B2')! / c.get('B1')!) ** (1 / c.get('B3')!);
        const k = Number(/=DB\(B1,B2,B3,(\d)\)/.exec(q.prompt)?.[1]);
        return q.answer === rupees(c.get('B1')! * keep ** (k - 1) * (1 - keep));
      },
    },
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          `What book value is left at the end of the ${s.life} years of its life?`,
          `${inr(s.salvage)}, the salvage value`,
          [
            ['Nothing: the whole cost has been written off', 'DB stops at the salvage value; that part of the cost is what the asset is expected to fetch.'],
            [`${inr(s.years[s.life - 1].start)}, the book value before the last year`, 'That leaves out the depreciation of the last year.'],
            [`${inr(s.cost - s.salvage)}, the cost less the salvage value`, 'That is the total depreciation over the life, not what is left.'],
          ],
          `Each year keeps ${100 - s.rate}% of the book value; after ${s.life} years the book value is exactly the salvage value, ${inr(s.salvage)}.`,
          HINTS.depreciation,
        ),
      verify: (q) => {
        const c = C.cellsIn(ctx(q));
        return amountsIn(optionText(q))[0] === c.get('B2');
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const sln = (s.cost - s.salvage) / s.life;
        const gap = s.years[0].dep - sln;
        const parts = typed('rupees', gap, [
          [s.years[0].dep, 'Gave the DB figure alone.'],
          [sln, 'Gave the SLN figure alone.'],
          [s.years[0].dep + sln, 'Added the two figures.'],
        ]);
        return parts && {
          prompt: 'In year 1, by how much does DB charge more than =SLN(B1,B2,B3)? (SLN gives (cost - salvage value) ÷ life.)',
          ...parts,
          explanation: [`DB: ${inr(s.years[0].dep)}.`, `SLN: (${inr(s.cost)} - ${inr(s.salvage)}) ÷ ${s.life} = ${inr(sln)}.`, `Difference = ${inr(gap)}.`],
          hints: HINTS.depreciation,
        };
      },
      verify: (q) => {
        const c = C.cellsIn(ctx(q));
        const cost = c.get('B1')!, salvage = c.get('B2')!, life = c.get('B3')!;
        return q.answer === rupees(cost * (1 - (salvage / cost) ** (1 / life)) - (cost - salvage) / life);
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 4. Instalments of a business loan
// ---------------------------------------------------------------------------------------------------------------

interface Borrow {
  firm: string;
  lender: string;
  l: CasLoan;
  r: number;
}

/** The instalments a case asks about: the interest of one, the principal of a later one, the balance after one. */
interface Instalments extends Borrow {
  i: number;
  p: number;
  b: number;
}

/** The schedule a case sets out, worked out again from its first line: the instalment is PMT's, rounded. */
function scheduleIn(text: string): { loan: number; pct: number; n: number; instalment: number; rows: ReturnType<typeof C.scheduleOf> } {
  const { loan, pct, n } = loanOf(text);
  const instalment = Math.round(C.pmtOf(loan, pct, n));
  return { loan, pct, n, instalment, rows: C.scheduleOf(loan, pct, instalment, n) };
}

const loanInstalments = caseTemplate<Instalments>({
  ...common,
  id: 'case-cas-loan-instalments',
  version: 2,
  difficulty: 'medium',
  title: 'Instalments of a business loan',
  setup: (rng) =>
    firstGood(20, () => {
      const l = C.makeLoan(rng);
      return l && { firm: rng.pick(C.FIRMS), lender: rng.pick(C.LENDERS), l, r: l.pct / 100, i: rng.int(2, l.years), p: rng.int(2, l.years), b: rng.int(1, l.years - 1) };
    }),
  context: (s) =>
    [
      `${s.firm} borrows ${inr(s.l.loan)} from ${s.lender} at ${s.l.rate} a year, to pay for its new computerised system, and repays it in ${s.l.years} equal yearly instalments, each at the end of a year.`,
      'On a sheet: B1 holds the loan, B2 the rate and B3 the number of instalments.',
      `${C.PMT_SAYS}.`,
      'IPMT gives the interest part of an instalment: the balance at the start of the year × the rate. PPMT gives the principal part: the instalment less that interest.',
      `The firm's repayment schedule shows every figure in whole rupees. ${C.LOAN_ROUNDING}.`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: ({ l, r }) => {
        const parts = typed('rupees', l.instalment, [
          [Math.round(l.loan / l.years + l.loan * r), 'Divided the loan equally and added a full year of interest on the whole loan.'],
          [Math.round((l.loan * (1 + r) ** l.years) / l.years), 'Added interest for every year on the whole loan and divided the total by the number of instalments.'],
          [Math.round(l.loan / l.years), 'Divided the loan by the number of instalments and left out the interest.'],
          [l.loan * r, "Gave only the first year's interest."],
          Math.trunc(l.pmt) !== l.instalment && [Math.trunc(l.pmt), 'Dropped the paise instead of rounding: a figure of 50 paise or more goes up to the next rupee.'],
        ]);
        return parts && {
          prompt: 'What does =PMT(B2,B3,-B1) return, to the nearest rupee?',
          ...parts,
          explanation: C.pmtLines(l),
          hints: ["The instalment is the same every year; each covers that year's interest and repays part of the loan.", 'Instalment = loan × r × (1 + r)^n ÷ ((1 + r)^n - 1). Work it to the paisa, then round to the nearest rupee.'],
        };
      },
      verify: (q) => q.answer === rupees(scheduleIn(ctx(q)).instalment),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: ({ l, r, i }) => {
        const row = l.rows[i - 1];
        const parts = typed('rupees', row.interest, [
          [row.principal, 'Gave the principal part of the instalment, not its interest.'],
          [row.instalment, 'Gave the whole instalment.'],
          [l.loan * r, 'Charged interest on the whole loan: after each instalment interest is on the balance left.'],
          [l.rows[i - 2].interest, `Gave the interest of instalment ${i - 1}.`],
        ]);
        return parts && {
          prompt: `In the firm's schedule, what is the interest part of instalment ${i}?`,
          ...parts,
          explanation: [...Array.from({ length: i }, (_, k) => C.loanRowLine(l, k + 1)), `Interest part of instalment ${i} = ${inr(row.interest)}.`],
          hints: HINTS.loan,
        };
      },
      verify: (q) => {
        const i = Number(/the interest part of instalment (\d)\?/.exec(q.prompt)?.[1]);
        return q.answer === rupees(scheduleIn(ctx(q)).rows[i - 1].interest);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: ({ l, r, p }) => {
        const row = l.rows[p - 1];
        const parts = typed('rupees', row.principal, [
          [l.rows[p - 2].principal, `Gave the principal part of instalment ${p - 1}.`],
          [l.instalment - l.loan * r, 'Took the interest as if it were on the whole loan every year.'],
          [row.interest, 'Gave the interest part of the instalment, not its principal.'],
          [Math.round(l.loan / l.years), 'Took the loan as repaid in equal parts.'],
          p === l.years && [l.instalment - row.interest, 'Took the last instalment to be the equal one; the last instalment is adjusted, and its principal part is the whole balance left.'],
        ]);
        return parts && {
          prompt: `In the firm's schedule, what is the principal part of instalment ${p}?`,
          ...parts,
          explanation: [...Array.from({ length: p }, (_, k) => C.loanRowLine(l, k + 1)), `Principal part of instalment ${p} = ${inr(row.principal)}.`],
          hints: HINTS.loan,
        };
      },
      verify: (q) => {
        const p = Number(/the principal part of instalment (\d)\?/.exec(q.prompt)?.[1]);
        const s = scheduleIn(ctx(q));
        // The principal parts add up to the loan; the one asked for is what is left of the instalment after interest.
        return q.answer === rupees(s.rows[p - 1].principal) && s.rows.reduce((t, x) => t + x.principal, 0) === s.loan;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: ({ l, r, b: k }) => {
        const row = l.rows[k - 1];
        const parts = typed('rupees', row.close, [
          [l.loan - k * l.instalment, 'Deducted the whole instalments from the loan; only their principal parts reduce it.'],
          k > 1 && [l.loan - k * l.rows[0].principal, 'Took the principal part of every instalment to be that of the first.'],
          [Math.round(l.loan - (k * l.loan) / l.years), 'Took the loan as repaid in equal parts.'],
          [row.open, `Gave the balance before instalment ${k}.`],
          [Math.round(l.loan * (1 + r) ** k - k * l.instalment), 'Added interest on the whole loan for every year, and deducted the instalments only at the end.'],
        ]);
        return parts && {
          prompt: `What balance of the loan does the schedule show after instalment ${k}?`,
          ...parts,
          explanation: Array.from({ length: k }, (_, i) => C.loanRowLine(l, i + 1)),
          hints: HINTS.loan,
        };
      },
      verify: (q) => {
        const k = Number(/after instalment (\d)\?/.exec(q.prompt)?.[1]);
        const s = scheduleIn(ctx(q));
        const r = s.pct / 100;
        // Close to the balance in one step, too: the loan grown at r for k years less the instalments grown with it.
        const grown = s.loan * (1 + r) ** k - s.instalment * (((1 + r) ** k - 1) / r);
        return q.answer === rupees(s.rows[k - 1].close) && Math.abs(grown - s.rows[k - 1].close) <= k;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: ({ l }) => {
        const all = sum(l.rows.map((x) => x.interest));
        const last = l.rows[l.years - 1];
        const parts = typed('rupees', all, [
          last.instalment !== l.instalment && [l.instalment * l.years - l.loan, 'Took the last instalment to be the equal one; it is adjusted to repay exactly the balance left.'],
          [l.instalment * l.years, 'Gave the total of the instalments; the loan itself has to be taken off.'],
          [l.rows[0].interest * l.years, "Took every year's interest to be that of the first."],
          [l.rows[0].interest, "Gave only the first year's interest."],
        ]);
        return parts && {
          prompt: 'How much interest does the schedule show over the whole life of the loan?',
          ...parts,
          explanation: [
            `${l.rows.map((x) => inr(x.interest)).join(' + ')} = ${inr(all)}.`,
            `Check: the instalments, ${l.years - 1} × ${inr(l.instalment)} + ${inr(last.instalment)} = ${inr(sum(l.rows.map((x) => x.instalment)))}, less the loan ${inr(l.loan)}.`,
          ],
          hints: HINTS.loan,
        };
      },
      verify: (q) => {
        const s = scheduleIn(ctx(q));
        return q.answer === rupees(s.rows.reduce((t, x) => t + x.instalment, 0) - s.loan);
      },
    },
    {
      kind: 'mcq',
      make: () =>
        choice(
          'Why is the loan entered as -B1 in the formula?',
          'So that the instalment comes out as a positive figure',
          [
            ['So that the interest is left out of the instalment', 'The sign has no effect on the interest: the instalment still includes it.'],
            ['So that the loan is treated as repaid at the start', 'That is decided by when the instalments fall, not by the sign of the loan.'],
            ['Because a loan is a loss to the business', 'A loan is a liability, not a loss; the sign only sets the sign of the answer.'],
          ],
          'PMT treats money received and money paid as opposite in sign. With the loan entered as a minus figure, the instalment is shown as a positive one.',
          HINTS.loan,
        ),
      verify: (q) => optionText(q).includes('positive'),
    },
  ],
});

/** The loan, the rate of a year in per cent and the number of instalments, from the first line of a case. */
function loanOf(text: string): { loan: number; pct: number; n: number } {
  const first = text.split('\n')[0];
  return { loan: amountsIn(first)[0], pct: Number(/(\d+(?:\.\d+)?)% a year/.exec(first)?.[1]), n: Number(/in (\d+) equal yearly instalments/.exec(first)?.[1]) };
}

// ---------------------------------------------------------------------------------------------------------------
// 5. The bank reconciliation on a sheet
// ---------------------------------------------------------------------------------------------------------------

interface Reconcile {
  firm: string;
  sheet: CasBrsSheet;
  cash: number;
  amended: number;
}

const amendedOf = (s: CasBrsSheet, cash: number): number => cash + sum(s.items.filter((x) => !x.item.timing).map((x) => x.item.sign * x.value));

const brsOnSheet = caseTemplate<Reconcile>({
  ...common,
  id: 'case-cas-brs-sheet',
  difficulty: 'medium',
  title: 'The bank reconciliation on a sheet',
  setup: (rng) =>
    firstGood(20, () => {
      const sheet = C.brsSheet(rng);
      if (!sheet) return null;
      const cash = sheet.fromCash ? sheet.start : sheet.answer;
      const amended = amendedOf(sheet, cash);
      return amended > 0 ? { firm: rng.pick(C.FIRMS), sheet, cash, amended } : null;
    }),
  context: (s) =>
    [
      `${s.firm} prepares its bank reconciliation statement on a sheet for 31 March 2026. Nothing is overdrawn, and the sheet holds:`,
      C.brsLines(s.sheet),
      `The formula in B${s.sheet.items.length + 3} is to work out the ${C.brsTarget(s.sheet)}.`,
    ].join('\n'),
  parts: [
    {
      kind: 'mcq',
      make: ({ sheet: s }) => {
        const dir = s.fromCash ? 1 : -1;
        const formula = (sign: (x: { item: { sign: number; timing: boolean } }) => number): string => `=B2${s.items.map((x, i) => `${sign(x) > 0 ? '+' : '-'}B${i + 3}`).join('')}`;
        const right = formula((x) => dir * x.item.sign);
        return choice(
          `Which formula gives the ${C.brsTarget(s)}?`,
          right,
          [
            [formula((x) => -dir * x.item.sign), 'Gave every item the opposite sign, as if starting from the other book.'],
            [formula((x) => (x.item.timing ? -1 : 1) * dir * x.item.sign), 'Reversed the signs of the two timing items.'],
            [formula((x) => (x.item.timing ? 1 : -1) * dir * x.item.sign), 'Reversed the signs of the items recorded by the bank only.'],
            [`=SUM(B2:B${s.items.length + 2})`, 'Added every item, though some of them have to be deducted.'],
          ],
          `From the ${s.fromCash ? C.BRS_START.cash : C.BRS_START.pass}: ${s.items.map((x) => `${dir * x.item.sign > 0 ? 'add' : 'deduct'} ${x.item.label}`).join('; ')}.`,
          HINTS.brs,
        );
      },
      verify: (q) => {
        const t = ctx(q);
        const fromCash = t.includes(C.BRS_START.cash);
        const signs = [...t.matchAll(/^B(\d+) \(([^)]+)\): ₹/gm)].filter((m) => m[1] !== '2').map((m) => {
          const item = C.BRS_ITEMS.find((i) => i.label === m[2]);
          return item ? `${(fromCash ? 1 : -1) * item.sign > 0 ? '+' : '-'}B${m[1]}` : '?';
        });
        return optionText(q) === `=B2${signs.join('')}`;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: ({ sheet: s }) => {
        const dir = s.fromCash ? 1 : -1;
        const total = (f: (x: CasBrsSheet['items'][number]) => number) => s.start + sum(s.items.map(f));
        const parts = typed('rupees', s.answer, [
          [total((x) => -dir * x.item.sign * x.value), 'Gave every item the opposite sign, as if starting from the other book.'],
          [total((x) => (x.item.timing ? -1 : 1) * dir * x.item.sign * x.value), 'Gave the two timing items the wrong signs.'],
          [total((x) => (x.item.timing ? dir * x.item.sign * x.value : 0)), 'Left out the items that only the bank has recorded.'],
          [total((x) => x.value), 'Added every item to the starting balance.'],
        ]);
        return parts && {
          prompt: `What ${C.brsTarget(s)} does the formula work out?`,
          ...parts,
          explanation: [`Start: ${inr(s.start)}.`, ...s.items.map((x) => `${dir * x.item.sign > 0 ? 'Add' : 'Deduct'} ${x.item.label}: ${inr(x.value)}.`), `${cap(C.brsTarget(s))} = ${inr(s.answer)}.`],
          hints: HINTS.brs,
        };
      },
      verify: (q) => {
        const v = C.brsFromPrompt(ctx(q));
        return v !== null && q.answer === rupees(v);
      },
    },
    {
      kind: 'mcq',
      make: ({ sheet: s }) => {
        const own = s.items.filter((x) => !x.item.timing);
        const [right] = own;
        const timing = s.items.filter((x) => x.item.timing).map((x) => x.item.label);
        return choice(
          'Which of these items has to be entered in the cash book as well?',
          cap(right.item.label),
          [
            ...timing.map((label): [string, string] => [cap(label), 'The cash book has this already; the bank has simply not got to it yet.']),
            ['None of them: a reconciliation never leads to an entry', 'What the bank has recorded and the cash book has not must be entered in the cash book.'],
          ],
          'Items only the bank has recorded are entered in the cash book. Cheques in transit are timing items: they clear by themselves.',
          HINTS.brs,
        );
      },
      verify: (q) => {
        const item = C.BRS_ITEMS.find((i) => cap(i.label) === optionText(q));
        return item !== undefined && !item.timing;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const own = s.sheet.items.filter((x) => !x.item.timing);
        const parts = typed('rupees', s.amended, [
          [s.cash, 'Left the cash book as it was.'],
          [s.cash - sum(own.map((x) => x.item.sign * x.value)), 'Gave the items the opposite signs: a charge reduces the cash book balance and a credit raises it.'],
          [s.cash + sum(s.sheet.items.map((x) => x.item.sign * x.value)), 'Included the two timing items, which the cash book already has.'],
        ]);
        return parts && {
          prompt: 'Once every item that only the bank has recorded is entered in the cash book, what is its balance?',
          ...parts,
          explanation: [`Cash book balance = ${inr(s.cash)}.`, ...own.map((x) => `${x.item.sign > 0 ? 'Add' : 'Deduct'} ${x.item.label}: ${inr(x.value)}.`), `Corrected balance = ${inr(s.amended)}.`],
          hints: ['Only what the bank has recorded and the cash book has not goes into the cash book.', 'A bank charge reduces the balance; money the bank received raises it.'],
        };
      },
      verify: (q) => {
        const t = ctx(q);
        const fromCash = t.includes(C.BRS_START.cash);
        let start = 0, timing = 0, own = 0;
        for (const m of t.matchAll(/^B(\d+) \(([^)]+)\): ₹([\d,]+)$/gm)) {
          const v = Number(m[3].replace(/,/g, ''));
          const item = C.BRS_ITEMS.find((i) => i.label === m[2]);
          if (m[1] === '2') start = v;
          else if (item?.timing) timing += item.sign * v;
          else if (item) own += item.sign * v;
        }
        // From the pass book, the corrected cash balance is the pass book balance less what is still in transit.
        return q.answer === rupees(fromCash ? start + own : start - timing);
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 6. Ratios from the cells of a sheet
// ---------------------------------------------------------------------------------------------------------------

type RatioCell = 'ca' | 'inv' | 'pre' | 'cl' | 'rev' | 'cost';
const RATIO_LABEL: Record<RatioCell, string> = {
  ca: 'current assets',
  inv: 'inventories',
  pre: 'prepaid expenses',
  cl: 'current liabilities',
  rev: 'revenue from operations',
  cost: 'cost of revenue from operations',
};

interface Ratios {
  firm: string;
  at: Record<RatioCell, string>;
  order: RatioCell[];
  value: Record<RatioCell, number>;
  current: number;
  quick: number;
  gross: number;
  fixedInv: number;
  fixedQuick: number;
}

/** "B3" for the cell that holds a figure, read from the printed line. */
function cellOf(text: string, label: string): string {
  return new RegExp(`^([A-Z]+\\d+) \\(${label}\\): `, 'm').exec(text)?.[1] ?? '';
}
function ratioCells(text: string): Record<RatioCell, number> {
  const c = C.cellsIn(text);
  const of = (key: RatioCell): number => c.get(cellOf(text, RATIO_LABEL[key])) ?? NaN;
  return { ca: of('ca'), inv: of('inv'), pre: of('pre'), cl: of('cl'), rev: of('rev'), cost: of('cost') };
}

const ratiosFromCells = caseTemplate<Ratios>({
  ...common,
  id: 'case-cas-ratios-from-cells',
  difficulty: 'medium',
  title: 'Ratios from the cells of a sheet',
  setup: (rng) =>
    firstGood(60, () => {
      const current = rng.pick([150, 175, 200, 225, 250, 300]), quick = rng.pick([75, 80, 100, 110, 120, 125]), fixedQuick = rng.pick([90, 105, 115, 130, 140]);
      const gross = rng.pick([20, 25, 30, 40]);
      const cl = rng.step(80000, 400000, 4000);
      const ca = (cl * current) / 100, qa = (cl * quick) / 100;
      const pre = rng.step(2000, 12000, 500);
      const inv = ca - qa - pre;
      const fixedInv = ca - (cl * fixedQuick) / 100 - pre;
      if (inv < 10000 || fixedInv < 10000 || fixedInv === inv || !Number.isInteger(ca) || !Number.isInteger(qa) || !Number.isInteger(fixedInv)) return null;
      const rev = rng.step(10, 80, 2) * 50000;
      const cost = (rev * (100 - gross)) / 100;
      const order = rng.shuffle(['ca', 'inv', 'pre', 'cl', 'rev', 'cost'] as RatioCell[]);
      const at = Object.fromEntries(order.map((k, i) => [k, `B${i + 2}`])) as Record<RatioCell, string>;
      return { firm: rng.pick(C.FIRMS), at, order, value: { ca, inv, pre, cl, rev, cost }, current, quick, gross, fixedInv, fixedQuick };
    }),
  context: (s) =>
    [
      `The owner of ${s.firm} keeps the year's figures on a sheet and works its ratios from the cells.`,
      ...s.order.map((k) => `${s.at[k]} (${RATIO_LABEL[k]}): ${inr(s.value[k])}`),
      'Current ratio = current assets ÷ current liabilities.',
      'Quick ratio = (current assets - inventories - prepaid expenses) ÷ current liabilities.',
      'Gross profit ratio = (revenue from operations - its cost) ÷ revenue from operations × 100.',
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'times',
      make: (s) => {
        const v = s.value;
        const parts = typed('times', s.current / 100, [
          [Math.round((v.cl / v.ca) * 100) / 100, 'Divided the current liabilities by the current assets: the ratio is upside down.'],
          [Math.round(((v.ca - v.cl) / v.cl) * 100) / 100, 'Deducted the current liabilities from the current assets before dividing.'],
          [s.quick / 100, 'Gave the quick ratio.'],
        ]);
        return parts && { prompt: 'What is the current ratio? Give it to two decimal places where needed (for 2.5 : 1 type 2.5).', ...parts, explanation: [`=${s.at.ca}/${s.at.cl}.`, `${inr(v.ca)} ÷ ${inr(v.cl)} = ${dec(s.current)}.`], hints: HINTS.ratios };
      },
      verify: (q) => {
        const v = ratioCells(ctx(q));
        return Math.round((v.ca / v.cl) * 100) === q.answer;
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const { ca, inv, pre, cl } = s.at;
        return choice(
          'Which formula gives the quick ratio?',
          `=(${ca}-${inv}-${pre})/${cl}`,
          [
            [`=${ca}-${inv}-${pre}/${cl}`, 'Left out the brackets: only the prepaid expenses would be divided.'],
            [`=(${ca}-${inv})/${cl}`, 'Left the prepaid expenses in the quick assets.'],
            [`=${ca}/${cl}`, 'Left the inventories and prepaid expenses in: that is the current ratio.'],
            [`=${cl}/(${ca}-${inv}-${pre})`, 'Turned the ratio upside down.'],
          ],
          `The quick assets need their own brackets: =(${ca}-${inv}-${pre})/${cl}.`,
          HINTS.ratios,
        );
      },
      verify: (q) => {
        const t = ctx(q);
        const [ca, inv, pre, cl] = ['ca', 'inv', 'pre', 'cl'].map((k) => cellOf(t, RATIO_LABEL[k as RatioCell]));
        return optionText(q) === `=(${ca}-${inv}-${pre})/${cl}`;
      },
    },
    {
      kind: 'numeric',
      unit: 'times',
      make: (s) => {
        const v = s.value;
        const parts = typed('times', s.quick / 100, [
          [s.current / 100, 'Left the inventories and prepaid expenses in: that is the current ratio.'],
          [Math.round(((v.ca - v.inv) / v.cl) * 100) / 100, 'Left the prepaid expenses in the quick assets.'],
          [Math.round((v.cl / (v.ca - v.inv - v.pre)) * 100) / 100, 'Turned the ratio upside down.'],
        ]);
        return parts && { prompt: 'What is the quick ratio? Give it to two decimal places where needed.', ...parts, explanation: [`Quick assets = ${inr(v.ca)} - ${inr(v.inv)} - ${inr(v.pre)} = ${inr(v.ca - v.inv - v.pre)}.`, `${inr(v.ca - v.inv - v.pre)} ÷ ${inr(v.cl)} = ${dec(s.quick)}.`], hints: HINTS.ratios };
      },
      verify: (q) => {
        const v = ratioCells(ctx(q));
        return Math.round(((v.ca - v.inv - v.pre) / v.cl) * 100) === q.answer;
      },
    },
    {
      kind: 'numeric',
      unit: 'percent',
      make: (s) => {
        const v = s.value;
        const parts = typed('percent', s.gross, [
          [Math.round(((v.rev - v.cost) / v.cost) * 10000) / 100, 'Worked the gross profit on the cost; the ratio is on revenue from operations.'],
          [100 - s.gross, 'Gave the cost as a percentage of revenue, not the gross profit.'],
        ]);
        return parts && { prompt: 'What is the gross profit ratio, in per cent?', ...parts, explanation: [`(${inr(v.rev)} - ${inr(v.cost)}) ÷ ${inr(v.rev)} × 100 = ${s.gross}%.`], hints: HINTS.ratios };
      },
      verify: (q) => {
        const v = ratioCells(ctx(q));
        return Math.round(((v.rev - v.cost) / v.rev) * 10000) === q.answer;
      },
    },
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          `The owner finds that the inventories in ${s.at.inv} should be ${inr(s.fixedInv)}, and that the current assets in ${s.at.ca} are right as they stand. Which results change on the sheet when ${s.at.inv} is corrected?`,
          'Only the quick ratio',
          [
            ['Only the current ratio', `The current ratio reads ${s.at.ca} and ${s.at.cl}, and neither has changed.`],
            ['The current ratio and the quick ratio', `The current ratio does not read ${s.at.inv} at all.`],
            ['All three ratios', 'The gross profit ratio reads the revenue and its cost, not the inventories.'],
          ],
          `Only a formula that reads ${s.at.inv} changes, and only the quick ratio does.`,
          HINTS.ratios,
        ),
      verify: (q) => optionText(q) === 'Only the quick ratio',
    },
    {
      kind: 'numeric',
      unit: 'times',
      make: (s) => {
        const v = s.value;
        const parts = typed('times', s.fixedQuick / 100, [
          [s.quick / 100, 'Gave the quick ratio before the correction.'],
          [s.current / 100, 'Gave the current ratio.'],
          [Math.round(((v.ca - s.fixedInv) / v.cl) * 100) / 100, 'Left the prepaid expenses in the quick assets.'],
        ]);
        return parts && { prompt: `With the inventories corrected to ${inr(s.fixedInv)}, what does the quick ratio become? Give it to two decimal places where needed.`, ...parts, explanation: [`Quick assets = ${inr(v.ca)} - ${inr(s.fixedInv)} - ${inr(v.pre)} = ${inr(v.ca - s.fixedInv - v.pre)}.`, `${inr(v.ca - s.fixedInv - v.pre)} ÷ ${inr(v.cl)} = ${dec(s.fixedQuick)}.`], hints: HINTS.ratios };
      },
      verify: (q) => {
        const v = ratioCells(ctx(q));
        const [inv] = amountsIn(q.prompt);
        return Math.round(((v.ca - inv - v.pre) / v.cl) * 100) === q.answer && inv !== v.inv;
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 7. Codes for a new chart of accounts
// ---------------------------------------------------------------------------------------------------------------

interface Coded {
  s: CasCodeScheme;
  at: number;
  newName: string;
}

/** The code the last line of the case asks about: the next serial of the group the new ledger joins. */
function nextCode(text: string): number {
  const group = /joins group (\d+)/.exec(text)?.[1];
  for (const m of text.matchAll(/^Ledgers of .+ \(group (\d+)\), in the order opened: (.+)$/gm)) {
    if (m[1] === group) return Number(m[1]) * 100 + m[2].split(', ').length + 1;
  }
  return NaN;
}

const codesOfAccounts = caseTemplate<Coded>({
  ...common,
  id: 'case-cas-chart-of-accounts',
  difficulty: 'medium',
  title: 'Codes for a new chart of accounts',
  setup: (rng) =>
    firstGood(20, () => {
      const s = C.codeScheme(rng, true);
      if (!s) return null;
      const { ledgers } = s.shown[0];
      return { s, at: rng.int(1, ledgers.length - 1), newName: rng.pick(['a ledger for a new branch', 'a ledger added this year', 'one more ledger']) };
    }),
  context: ({ s, newName }) =>
    [
      `${s.firm} is moving its books to a computerised system and gives each ledger account a ${C.SCHEME_RULE}.`,
      ...C.schemeLines(s),
      `Later, ${newName} joins group ${s.groups.get(s.shown[0].group)!.code}.`,
    ].join('\n'),
  parts: [
    {
      kind: 'mcq',
      make: ({ s, at }) => {
        const { group, ledgers } = s.shown[0];
        const g = s.groups.get(group)!;
        const headDigit = s.heads.get(g.head)!;
        const code = g.code * 100 + at + 1;
        return choice(
          `What is the code of ${ledgers[at]}?`,
          String(code),
          [
            [String(code - 1), 'Numbered the ledgers from 00 instead of 01.'],
            [String(headDigit * 100 + g.groupDigit * 10 + at + 1), 'Wrote the serial number as one digit, dropping its 0: the serial always takes two digits.'],
            ...(g.groupDigit !== headDigit ? [[String(g.groupDigit * 1000 + headDigit * 100 + at + 1), 'Wrote the group digit before the head digit.'] as [string, string]] : []),
            ...(at + 1 < ledgers.length ? [[String(code + 1), 'Counted one ledger too many in the order of opening.'] as [string, string]] : []),
          ],
          `${ledgers[at]} is in group ${g.code}, and it was the ledger number ${at + 1} opened in it: ${code}.`,
          HINTS.codes,
        );
      },
      verify: (q) => {
        const ledger = /What is the code of (.+?)\?/.exec(q.prompt)?.[1];
        return ledger !== undefined && C.codeFromPrompt(ctx(q), ledger) === Number(optionText(q));
      },
    },
    {
      kind: 'mcq',
      make: ({ s }) => {
        const [main, other] = s.shown;
        const at = Math.min(main.ledgers.length, other.ledgers.length) - 2;
        const g = s.groups.get(other.group)!;
        const code = g.code * 100 + at + 1;
        return choice(
          `Which ledger account has the code ${code}?`,
          other.ledgers[at],
          [
            [other.ledgers[at + 1], `Numbered the ledgers from 00, so took ${String(at + 1).padStart(2, '0')} as the ledger opened after it.`],
            [main.ledgers[at], `Took group ${s.groups.get(main.group)!.code}; the first two digits ${g.code} are the group ${other.group}.`],
            [`${other.group} (the group itself)`, 'Gave the group: a four-digit code names one ledger account.'],
            [`${g.head} (the major head)`, 'Gave the major head: only the first digit names it.'],
          ],
          `${code}: group ${g.code} is ${other.group}, and serial ${String(at + 1).padStart(2, '0')} is the ledger number ${at + 1} opened in it: ${other.ledgers[at]}.`,
          HINTS.codes,
        );
      },
      verify: (q) => C.codeFromPrompt(ctx(q), optionText(q)) === Number(/has the code (\d+)\?/.exec(q.prompt)?.[1]),
    },
    {
      kind: 'mcq',
      make: ({ s }) => {
        const { group, ledgers } = s.shown[0];
        const g = s.groups.get(group)!;
        const n = ledgers.length;
        const next = g.code * 100 + n + 1;
        return choice(
          `What code does the new ledger of group ${g.code} take?`,
          String(next),
          [
            [String(g.code * 100 + n), 'Gave the code of the last ledger already opened in the group.'],
            [String(g.code * 100 + 1), 'Started the group again from 01.'],
            [String(s.heads.get(g.head)! * 100 + g.groupDigit * 10 + n + 1), 'Wrote the serial number as one digit, dropping its 0.'],
          ],
          `Group ${g.code} has ${n} ledgers, so the new one is number ${n + 1}: ${g.code} followed by ${String(n + 1).padStart(2, '0')} = ${next}.`,
          HINTS.codes,
        );
      },
      verify: (q) => Number(optionText(q)) === nextCode(ctx(q)),
    },
    {
      kind: 'numeric',
      unit: 'number',
      make: ({ s }) => {
        const { group, ledgers } = s.shown[0];
        const g = s.groups.get(group)!;
        const used = ledgers.length + 1;
        const parts = typed('number', 99 - used, [
          [99 - ledgers.length, 'Left out the new ledger, which has taken a serial number too.'],
          [100 - used, 'Counted 00 as a serial number; the serials run from 01.'],
          [used, 'Gave the serial numbers used, not those left.'],
          [9 - used, 'Took the serial number to have one digit.'],
        ]);
        return parts && {
          prompt: `The serial number of a ledger has two digits, from 01. Once the new ledger is opened, how many more ledgers can group ${g.code} take?`,
          ...parts,
          explanation: [`Two digits from 01 give 99 serial numbers.`, `Group ${g.code} has used ${used} of them, so ${99 - used} are left.`],
          hints: HINTS.codes,
        };
      },
      verify: (q) => q.answer === 99 - (nextCode(ctx(q)) % 100),
    },
    {
      kind: 'mcq',
      make: ({ s }) => {
        const main = s.shown[0];
        const g = s.groups.get(main.group)!;
        const headOf = s.heads.get(g.head)!;
        return choice(
          `Every code of the group ${main.group} begins with the same two digits, ${g.code}. What does that give the firm?`,
          'A report can gather all the ledgers of the group from the first two digits of their codes',
          [
            [`Every ledger of the head ${g.head} has the same four digits`, `Only the first digit, ${headOf}, is shared by the whole head, and no two ledgers share all four.`],
            ['The balances of the group are always equal', 'A code says where a ledger belongs; it says nothing about its balance.'],
            ['No voucher of the group can be entered wrongly', 'A code does not stop a voucher being entered in the wrong ledger of the group.'],
          ],
          'That is the use of a code built by head, group and serial: ledgers of one class stand together and can be reported together, with room for new ones.',
          HINTS.codes,
        );
      },
      verify: (q) => optionText(q).includes('first two digits'),
    },
    {
      kind: 'mcq',
      make: () =>
        choice(
          'Which kind of code does this scheme use for its groups, keeping a range of numbers for each class of accounts?',
          'A block code',
          [
            ['A mnemonic code', 'A mnemonic code is made of letters that remind the user of the account, such as SD for Sundry Debtors.'],
            ['A sequential code alone', 'A sequential code runs on in one line, with no ranges kept for classes. Only the serial number inside a group works that way.'],
            ['No code at all, only a list of names', 'Every ledger here has a number that places it in the chart of accounts.'],
          ],
          'A block code keeps a range of numbers for each class of accounts, with room left in each range for new accounts.',
          HINTS.codes,
        ),
      verify: (q) => optionText(q) === 'A block code',
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 8. A bad day at data entry
// ---------------------------------------------------------------------------------------------------------------

interface Fault {
  check: string;
  line: (amount: number) => string;
  /** The words of the line that show this fault, for `verify`. */
  mark: string;
}

/** Each check, as a refused voucher shows it. Names are those of the bank's `CHECKS`. */
const FAULTS: Fault[] = [
  { check: 'Data type check', line: (x) => `amount typed as "${String(x).replace(/0(?=0$)/, 'O')}", with a letter O in it`, mark: 'a letter O' },
  { check: 'Presence (completeness) check', line: () => 'the name of the ledger to be debited left blank', mark: 'left blank' },
  { check: 'List (existence) check', line: () => 'ledger name misspelt; no ledger of that spelling has been created', mark: 'of that spelling' },
  { check: 'Date check', line: () => 'dated 31 June 2025, a date that does not exist', mark: 'does not exist' },
  { check: 'Range check', line: (x) => `amount typed as -${x}, though a payment must be above zero`, mark: 'above zero' },
  { check: 'Balancing check', line: (x) => `debits of ${inr(x)} but credits of ${inr(x - 2000)}`, mark: 'debits of' },
  { check: 'Duplicate check', line: () => 'the same bill, with the same number, as a voucher saved two days earlier', mark: 'same bill' },
];

const VOUCHER_FOR = ['Rent', 'Telephone', 'Stationery', 'Electricity', 'Advertisement', 'Wages', 'Repairs', 'Insurance'];

interface BadDay {
  firm: string;
  bank: number;
  rows: { no: string; name: string; amount: number; fault?: Fault; saved?: number }[];
  wrong: string;
  saved: number;
  right: number;
  refused: number;
}

const badDay = caseTemplate<BadDay>({
  ...common,
  id: 'case-cas-bad-day',
  difficulty: 'medium',
  title: 'A bad day at data entry',
  setup: (rng) =>
    firstGood(20, () => {
      const names = rng.shuffle(VOUCHER_FOR).slice(0, 5);
      const [f1, f2] = rng.shuffle(FAULTS);
      const a = rng.int(1, 9);
      let b = rng.int(1, 9);
      if (b === a) b = (a % 9) + 1;
      const right = (a * 10 + b) * 100, swapped = (b * 10 + a) * 100;
      const kinds = rng.shuffle(['clean', 'clean', 'slip', 'f1', 'f2'] as const);
      const rows = kinds.map((k, i) => {
        const amount = k === 'slip' ? right : rng.step(3, 40, 1) * 1000;
        const no = `V${i + 1}`;
        return { no, name: names[i], amount, ...(k === 'f1' ? { fault: f1 } : k === 'f2' ? { fault: f2 } : {}), saved: k === 'slip' ? swapped : k === 'clean' ? amount : undefined };
      });
      const saved = sum(rows.map((r) => r.saved ?? 0));
      const refused = sum(rows.filter((r) => r.fault).map((r) => r.amount));
      const bank = rng.step(150000, 800000, 1000);
      const wrong = rows.find((r) => r.saved !== undefined && r.saved !== r.amount)!.no;
      return { firm: rng.pick(C.FIRMS), bank, rows, wrong, saved, right, refused };
    }),
  context: (s) =>
    [
      `In its first week on a computerised system, an operator at ${s.firm} entered five payment vouchers, all paid from the bank, on 10 March 2026. The bank balance before them was ${inr(s.bank)}.`,
      ...s.rows.map((r) => (r.fault ? `${r.no} (${r.name}, bill ${inr(r.amount)}): refused, ${r.fault.line(r.amount)}.` : `${r.no} (${r.name}): saved at ${inr(r.saved!)}.`)),
      `At the end of the day the saved vouchers are compared with the bills: the bill of ${s.wrong} is for ${inr(s.right)}. The other saved vouchers agree with their bills.`,
      'The refused vouchers are not entered again that day.',
    ].join('\n'),
  parts: [
    ...([0, 1] as const).map((n) => ({
      kind: 'mcq' as const,
      make: (s: BadDay): McqParts | null => {
        const row = s.rows.filter((r) => r.fault)[n];
        const right = row.fault!;
        const check = C.CHECKS.find((c) => c.name === right.check)!;
        const near = check.near ?? [];
        return choice(
          `Which validation check of the system refused ${row.no}?`,
          right.check,
          C.CHECKS.filter((c) => c !== check && !near.includes(c.name) && !c.near?.includes(right.check)).map((c): [string, string] => [c.name, `Chose the ${c.name.toLowerCase()}, which makes sure ${c.about}.`]),
          `The ${right.check.toLowerCase()} makes sure ${check.about}.`,
          HINTS.validation,
        );
      },
      verify: (q: McqQuestion) => {
        const no = /refused (V\d)\?/.exec(q.prompt)?.[1];
        const line = ctx(q).split('\n').find((l) => l.startsWith(`${no} (`)) ?? '';
        const fault = FAULTS.find((f) => f.check === optionText(q));
        return fault !== undefined && line.includes(fault.mark);
      },
    })),
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const parts = typed('rupees', s.saved, [
          [s.saved + s.refused, 'Counted the refused vouchers as well: a refused voucher is not in the books.'],
          [s.saved - sum(s.rows.filter((r) => r.no === s.wrong).map((r) => r.saved!)) + s.right, `Took ${s.wrong} at its bill: the question asks what the system holds.`],
          [s.refused, 'Added up the refused vouchers instead of the saved ones.'],
        ]);
        return parts && { prompt: 'What is the total of the vouchers the system saved that day, as they stand before any correction?', ...parts, explanation: [...s.rows.filter((r) => !r.fault).map((r) => `${r.no}: ${inr(r.saved!)}.`), `Total = ${inr(s.saved)}.`], hints: ['Only a voucher that passes every check is saved.', 'Take each saved voucher at the figure it was saved at.'] };
      },
      verify: (q) => q.answer === rupees(sum(ctx(q).split('\n').filter((l) => /^V\d .*saved at/.test(l)).map((l) => amountsIn(l)[0]))),
    },
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          `Why did no validation check stop the slip in ${s.wrong}?`,
          'The figure was a proper amount in every way, so only comparing it with the bill could show it: that is verification',
          [
            ['The range check was switched off', 'A range check allows every figure inside its range; the wrong figure was inside it.'],
            ['The balancing check failed to work', 'The voucher balanced: the same wrong figure stood on both sides.'],
            ['Validation is done only at the end of the year', 'Validation is done as each entry is made.'],
          ],
          'Validation checks data against rules as it is entered; verification checks it against the source document. A wrong but possible figure passes every rule.',
          HINTS.validation,
        ),
      verify: (q) => optionText(q).endsWith('verification'),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const slip = sum(s.rows.filter((r) => r.no === s.wrong).map((r) => r.saved! - r.amount));
        const paid = s.saved - slip;
        const parts = typed('rupees', s.bank - paid, [
          [s.bank - s.saved, `Left ${s.wrong} at the figure it was saved at.`],
          [s.bank - paid - s.refused, 'Took off the refused vouchers as well, though they are not yet entered.'],
          [s.bank + paid, 'Added the payments to the balance.'],
          [s.bank - s.saved - slip, `Corrected ${s.wrong} the wrong way.`],
        ]);
        return parts && {
          prompt: `What bank balance does the system show once ${s.wrong} is corrected?`,
          ...parts,
          explanation: [`Payments saved, ${s.wrong} at its bill: ${inr(paid)}.`, `Balance = ${inr(s.bank)} - ${inr(paid)} = ${inr(s.bank - paid)}.`],
          hints: ['Only the saved vouchers have reached the bank account.', 'The corrected voucher stands at the figure of its bill.'],
        };
      },
      verify: (q) => {
        const t = ctx(q);
        const lines = t.split('\n');
        const bank = amountsIn(lines[0])[0];
        const check = /the bill of (V\d) is for (₹[\d,]+)/.exec(t);
        const paid = sum(lines.filter((l) => /^V\d .*saved at/.test(l)).map((l) => (l.startsWith(`${check?.[1]} `) ? amountsIn(check?.[2] ?? '')[0] : amountsIn(l)[0])));
        return q.answer === rupees(bank - paid);
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 9. Year-end vouchers
// ---------------------------------------------------------------------------------------------------------------

type AdjKind = 'out' | 'pre' | 'acc' | 'dep' | 'adv';
interface YearEndAdj {
  kind: AdjKind;
  line: string;
  lines: JournalLine[];
  effect: number;
  why: string[];
  report: string;
  account: string;
  /** The expense or income it is about: an amount is not both unpaid and paid in advance, or both earned and received early. */
  head: string;
}

function drawAdj(rng: Rng, kind: AdjKind): YearEndAdj {
  const x = rng.step(2000, 60000, 500);
  switch (kind) {
    case 'out': {
      const e = rng.pick([{ id: 'salaries', name: 'Salaries' }, { id: 'rent', name: 'Rent' }, { id: 'wages', name: 'Wages' }, { id: 'electricity', name: 'Electricity' }]);
      return { kind, line: `${inr(x)} of ${e.name.toLowerCase()} for the year is still unpaid.`, lines: [dr(e.id, x), cr('outstandingExpenses', x)], effect: -x, why: [`The expense of the year rises: ${e.name} A/c is debited.`, 'The amount is owed: Outstanding Expenses A/c is credited.'], report: 'In the balance sheet, among the current liabilities', account: 'Outstanding Expenses A/c', head: e.name };
    }
    case 'pre': {
      const e = rng.pick([{ id: 'insurance', name: 'Insurance' }, { id: 'rent', name: 'Rent' }, { id: 'advertisement', name: 'Advertisement' }]);
      return { kind, line: `${e.name} of ${inr(x)}, paid during the year, belongs to the next year.`, lines: [dr('prepaidExpenses', x), cr(e.id, x)], effect: x, why: ['The part paid in advance is an asset: Prepaid Expenses A/c is debited.', `The expense of this year falls: ${e.name} A/c is credited.`], report: 'In the balance sheet, among the current assets', account: 'Prepaid Expenses A/c', head: e.name };
    }
    case 'acc': {
      const i = rng.pick([{ id: 'commissionReceived', name: 'Commission' }, { id: 'interestReceived', name: 'Interest on investments' }, { id: 'rentReceived', name: 'Rent from a sub-tenant' }]);
      return { kind, line: `${i.name} of ${inr(x)} has been earned but not yet received.`, lines: [dr('accruedIncome', x), cr(i.id, x)], effect: x, why: ['The amount still to be received is an asset: Accrued Income A/c is debited.', 'The income of the year rises: the income account is credited.'], report: 'In the balance sheet, among the current assets', account: 'Accrued Income A/c', head: i.name };
    }
    case 'dep': {
      const a = rng.pick([{ id: 'machinery', name: 'machinery' }, { id: 'furniture', name: 'furniture' }, { id: 'vehicles', name: 'vehicles' }]);
      return { kind, line: `Depreciation of ${inr(x)} is charged on the ${a.name}, credited to the asset account.`, lines: [dr('depreciation', x), cr(a.id, x)], effect: -x, why: ['Depreciation is an expense: Depreciation A/c is debited.', `The value of the asset falls: ${cap(a.name)} A/c is credited.`], report: 'In the profit and loss account, among the expenses', account: 'Depreciation A/c', head: a.name };
    }
    case 'adv': {
      const i = rng.pick([{ id: 'commissionReceived', name: 'Commission' }, { id: 'rentReceived', name: 'Rent from a sub-tenant' }]);
      return { kind, line: `${i.name} of ${inr(x)}, received during the year, belongs to the next year.`, lines: [dr(i.id, x), cr('incomeReceivedInAdvance', x)], effect: -x, why: ['The income of this year falls: the income account is debited.', 'The amount received for the next year is a liability: Income Received in Advance A/c is credited.'], report: 'In the balance sheet, among the current liabilities', account: 'Income Received in Advance A/c', head: i.name };
    }
  }
}

interface YearEnd {
  firm: string;
  profit: number;
  adjs: YearEndAdj[];
  net: number;
}

const LABELS = ['(a)', '(b)', '(c)'];
const REPORTS = ['In the balance sheet, among the current liabilities', 'In the balance sheet, among the current assets', 'In the profit and loss account, among the expenses', 'In the profit and loss account, among the incomes'];

/** The effect of an adjustment line on the profit, from the printed line. */
function effectOfLine(line: string): number {
  const [x] = amountsIn(line);
  return /still unpaid|^\(.\) Depreciation|received during the year/.test(line) ? -x : x;
}

const yearEndVouchers = caseTemplate<YearEnd>({
  ...common,
  id: 'case-cas-year-end-vouchers',
  difficulty: 'medium',
  title: 'Year-end vouchers',
  setup: (rng) =>
    firstGood(20, () => {
      const kinds = rng.shuffle(['out', 'pre', 'acc', 'dep', 'adv'] as AdjKind[]).slice(0, 3);
      const adjs = kinds.map((k) => drawAdj(rng, k));
      if (new Set(adjs.map((a) => a.head)).size < adjs.length) return null;
      const profit = rng.step(100000, 900000, 1000);
      const net = profit + sum(adjs.map((a) => a.effect));
      return net > 0 ? { firm: rng.pick(C.FIRMS), profit, adjs, net } : null;
    }),
  context: (s) =>
    [
      `${s.firm} keeps its books on a computerised accounting system. On ${C.YEAR_END}, before these adjustments, the system shows a net profit of ${inr(s.profit)}. Each adjustment is entered ${C.VIA}.`,
      ...s.adjs.map((a, i) => `${LABELS[i]} ${a.line}`),
    ].join('\n'),
  parts: [
    ...([0, 1, 2] as const).map((n) => ({
      kind: 'journal' as const,
      make: (s: YearEnd): JournalParts => ({
        prompt: `Pass the entry the journal voucher records for adjustment ${LABELS[n]}.`,
        lines: s.adjs[n].lines,
        explanation: s.adjs[n].why,
        distractorAccounts: s.adjs[n].kind === 'out' ? ['prepaidExpenses', 'cash'] : s.adjs[n].kind === 'dep' ? ['provisionForDepreciation', 'profitAndLoss'] : ['outstandingExpenses', 'accruedIncome'].filter((id) => !s.adjs[n].lines.some((l) => l.accountId === id)),
        hints: HINTS.entries,
      }),
      verify: (q: JournalQuestion) => {
        const line = ctx(q).split('\n').find((l) => l.startsWith(`${LABELS[n]} `)) ?? '';
        return sideTotal(q, 'Dr') === rupees(amountsIn(line)[0]);
      },
    })),
    {
      kind: 'mcq',
      make: (s) => {
        const a = s.adjs[0];
        return choice(
          `Where do the reports of the system show ${a.account} after adjustment (a)?`,
          a.report,
          REPORTS.filter((r) => r !== a.report).map((r): [string, string] => [r, `${a.account} does not stand there: ${a.report.toLowerCase().replace(/^in the /, 'it stands in the ')}.`]),
          `Each ledger is created under a group, and the group has its place in the reports: ${a.report.toLowerCase()}.`,
          HINTS.entries,
        );
      },
      verify: (q) => {
        const asked = /show (.+) A\/c after/.exec(q.prompt)?.[1] ?? '';
        const where = /^(Outstanding Expenses|Income Received in Advance)$/.test(asked) ? 'current liabilities' : /^(Prepaid Expenses|Accrued Income)$/.test(asked) ? 'current assets' : 'the expenses';
        return optionText(q).endsWith(where);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const up = sum(s.adjs.filter((a) => a.effect > 0).map((a) => a.effect));
        const down = -sum(s.adjs.filter((a) => a.effect < 0).map((a) => a.effect));
        const parts = typed('rupees', s.net, [
          [s.profit, 'Left the profit as the system showed it: the adjustments change it.'],
          [s.profit - s.adjs.reduce((t, a) => t + a.effect, 0), 'Gave every adjustment the opposite sign.'],
          [up ? s.profit - down : 0, 'Made only the adjustments that reduce the profit.'],
          [down ? s.profit + up : 0, 'Made only the adjustments that raise the profit.'],
        ]);
        return parts && {
          prompt: 'What net profit do the reports show after the three adjustments?',
          ...parts,
          explanation: [`Net profit before = ${inr(s.profit)}.`, ...s.adjs.map((a) => `${a.effect > 0 ? 'Add' : 'Deduct'} ${inr(Math.abs(a.effect))}: ${a.line}`), `Net profit = ${inr(s.net)}.`],
          hints: ['Ask of each adjustment: does it add an expense, take one away, add an income or take one away?', 'A prepaid expense and an accrued income raise the profit; an outstanding expense, depreciation and income received in advance reduce it.'],
        };
      },
      verify: (q) => {
        const lines = ctx(q).split('\n');
        const profit = amountsIn(lines[0])[0];
        return q.answer === rupees(profit + sum(lines.slice(1).map(effectOfLine)));
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 10. Who changed the voucher?
// ---------------------------------------------------------------------------------------------------------------

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface Incident {
  firm: string;
  no: number;
  supplier: string;
  was: number;
  now: number;
  counts: number[];
  backupDay: number;
  failDay: number;
  lost: number;
  third: { name: string; scene: string };
}

const whoChanged = caseTemplate<Incident>({
  ...common,
  id: 'case-cas-who-changed',
  difficulty: 'easy',
  title: 'Who changed the voucher?',
  setup: (rng) => {
    const backupDay = rng.int(0, 3), failDay = rng.int(backupDay + 1, 5);
    const counts = DAYS.map(() => rng.int(15, 60));
    const was = rng.step(5, 60, 1) * 1000;
    const now = was + rng.step(2, 20, 1) * 1000;
    const third = rng.pick([
      { name: 'Password', scene: 'A visitor sits down at the accountant\'s computer and cannot open the books without the secret word only the staff know.' },
      { name: 'Data vault (encryption)', scene: "A laptop holding the firm's data is stolen, but its files cannot be read without the key." },
    ]);
    return { firm: rng.pick(C.FIRMS), no: rng.int(120, 480), supplier: rng.pick(C.SUPPLIERS), was, now, counts, backupDay, failDay, lost: sum(counts.slice(backupDay + 1, failDay + 1)), third };
  },
  context: (s) =>
    [
      `${s.firm} has two clerks, an accountant and an owner using one computerised accounting system. The clerks may enter vouchers; only the accountant may alter or delete one.`,
      `The auditor finds that payment voucher ${s.no} to ${s.supplier}, entered for ${inr(s.was)}, was altered to ${inr(s.now)} by the user "clerk2" at 7:40 p.m. The bill is for ${inr(s.was)}, and ${inr(s.now)} was paid.`,
      `In another week, a back-up is taken every ${DAYS[s.backupDay]} evening. The hard disk fails on ${DAYS[s.failDay]} at closing time, after that day's work.`,
      `Vouchers entered that week: ${DAYS.slice(0, s.failDay + 1).map((d, i) => `${d} ${s.counts[i]}`).join(', ')}.`,
      s.third.scene,
    ].join('\n'),
  parts: [
    {
      kind: 'mcq',
      make: () => securityChoice('Which security feature showed the auditor who altered the voucher?', 'Audit trail'),
      verify: (q) => optionText(q) === 'Audit trail',
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const parts = typed('rupees', s.now - s.was, [
          [s.now, 'Gave the figure the voucher was altered to.'],
          [s.was, 'Gave the figure of the bill.'],
          [s.now + s.was, 'Added the two figures.'],
        ]);
        return parts && { prompt: `How much was paid to ${s.supplier} beyond the bill?`, ...parts, explanation: [`${inr(s.now)} - ${inr(s.was)} = ${inr(s.now - s.was)}.`], hints: ['Compare what was paid with what the bill asks for.', 'The difference is the amount to recover.'] };
      },
      verify: (q) => {
        const [was, now] = amountsIn(ctx(q).split('\n')[1]);
        return q.answer === rupees(now - was);
      },
    },
    {
      kind: 'mcq',
      make: () => securityChoice('The clerk should not have been able to alter the voucher at all. Which feature, set up properly, stops this?', 'User access rights'),
      verify: (q) => optionText(q) === 'User access rights',
    },
    {
      kind: 'mcq',
      make: () => securityChoice('Which feature puts the books back after the hard disk fails?', 'Back-up and restore'),
      verify: (q) => optionText(q) === 'Back-up and restore',
    },
    {
      kind: 'numeric',
      unit: 'number',
      make: (s) => {
        const parts = typed('number', s.lost, [
          [s.counts[s.failDay], 'Counted only the day of the failure; every day since the last back-up is lost.'],
          [s.lost + s.counts[s.backupDay], 'Counted the vouchers of the back-up day, which the back-up of that evening holds.'],
          [sum(s.counts.slice(0, s.failDay + 1)), 'Counted every voucher of the week.'],
          [s.lost - s.counts[s.failDay], 'Left out the vouchers of the day of the failure.'],
        ]);
        return parts && {
          prompt: 'How many vouchers have to be entered again after the back-up is restored?',
          ...parts,
          explanation: [`The back-up of ${DAYS[s.backupDay]} evening holds everything up to that evening.`, `Entered since: ${DAYS.slice(s.backupDay + 1, s.failDay + 1).map((d, i) => `${d} ${s.counts[s.backupDay + 1 + i]}`).join(', ')}.`, `Total = ${s.lost}.`],
          hints: ['A back-up holds everything entered up to the moment it was taken.', 'Count every voucher entered after that moment.'],
        };
      },
      verify: (q) => {
        const t = ctx(q);
        const back = DAYS.indexOf(/every (\w+) evening/.exec(t)?.[1] ?? '');
        const entered = [...(/Vouchers entered that week: (.+)\.$/m.exec(t)?.[1] ?? '').matchAll(/(\w+) (\d+)/g)];
        return q.answer === sum(entered.filter((m) => DAYS.indexOf(m[1]) > back).map((m) => Number(m[2])));
      },
    },
    {
      kind: 'mcq',
      make: (s) => securityChoice(`Which feature is at work in the last line of the case?`, s.third.name),
      verify: (q) => optionText(q) === (ctx(q).includes('stolen') ? 'Data vault (encryption)' : 'Password'),
    },
  ],
});

function securityChoice(prompt: string, right: string): McqParts | null {
  const feature = C.SECURITY.find((f) => f.name === right)!;
  return choice(
    prompt,
    right,
    C.SECURITY.filter((f) => f.name !== right).map((f): [string, string] => [f.name, `Chose ${f.name.toLowerCase()}, which makes sure ${f.about}.`]),
    `${right} makes sure ${feature.about}.`,
    HINTS.security,
  );
}

// ---------------------------------------------------------------------------------------------------------------
// 11. Moving from the manual books
// ---------------------------------------------------------------------------------------------------------------

/** Businesses that move to a package: each with the kind of package that suits it, in the words of the bank. */
const MOVERS: { firm: string; business: string; kind: 'generic' | 'specific'; services?: true }[] = [
  { firm: 'Aravali Stores', business: 'a small grocery shop with one computer, which needs only the usual books and reports and wants to spend as little as possible', kind: 'generic' },
  { firm: 'Sahyadri Books', business: 'a small bookshop run by its owner, who wants the usual accounts at the lowest cost', kind: 'generic' },
  { firm: 'Rao Consultants', business: 'a two-person consultancy run by its owner, which needs a cash book, ledgers and final accounts and nothing more', kind: 'generic', services: true },
  { firm: 'Hotel Konkan', business: 'a hotel that wants a standard accounting package with a room-billing module added to it', kind: 'specific' },
  { firm: 'Vindhya Pharma', business: 'a chain of three pharmacies that wants a standard package altered to follow the expiry dates of medicines', kind: 'specific' },
  { firm: 'Godavari Coaching Centre', business: 'a coaching centre, owned by one teacher, that wants a standard accounting package adapted to collect fees batch by batch and term by term', kind: 'specific', services: true },
];

interface MovingOver {
  firm: string;
  business: string;
  kind: 'generic' | 'specific';
  assets: { id: string; name: string; value: number }[];
  customer: string;
  supplier: string;
  due: number;
  owed: number;
  loan: number;
  capital: number;
  deal: (typeof C.VOUCHER_CASES)[number];
  dealAmount: string;
}

const OPENING_ASSETS = [
  { id: 'machinery', name: 'Machinery' }, { id: 'furniture', name: 'Furniture' }, { id: 'stock', name: 'Stock' },
  { id: 'bank', name: 'Cash at bank' }, { id: 'cash', name: 'Cash in hand' }, { id: 'billsReceivable', name: 'Bills receivable' },
];

type Opening = Pick<MovingOver, 'assets' | 'due' | 'owed'>;

/**
 * The first transactions these opening balances allow, each with the most it can be and the party it names. Year-end
 * work has no place on the first day, a fixed deposit or a second bank is not in the list, the cash and the bank can
 * only pay what they hold, and a debtor pays, or a creditor is paid, no more than the balance brought in.
 */
function firstDeals({ assets, due, owed }: Opening): { deal: MovingOver['deal']; limit: number; customer?: string; supplier?: string }[] {
  const held = (id: string): number => assets.find((a) => a.id === id)?.value ?? 0;
  const cash = held('cash'), bank = held('bank');
  return C.VOUCHER_CASES.flatMap((deal) => {
    const t = deal.text('');
    if (/fixed deposit|current account|depreciation|bad debt|end of the year/.test(t)) return [];
    if (/goods/i.test(t) && !held('stock')) return [];
    if (/into the bank|by cheque|by bank transfer|from the bank/.test(t) && !bank) return [];
    const customer = C.CUSTOMERS.find((c) => t.includes(c) && !t.startsWith('Sold'));
    const supplier = C.SUPPLIERS.find((c) => t.includes(c) && !t.startsWith('Bought'));
    const limits = [90000, ...(customer ? [due] : []), ...(supplier ? [owed] : []), ...(/in cash$|of cash into/.test(t) ? [cash] : []), ...(/by cheque|by bank transfer|from the bank/.test(t) ? [bank] : [])];
    const limit = Math.min(...limits);
    return limit < 1000 ? [] : [{ deal, limit, ...(customer ? { customer } : {}), ...(supplier ? { supplier } : {}) }];
  });
}

const movingOver = caseTemplate<MovingOver>({
  ...common,
  id: 'case-cas-moving-over',
  difficulty: 'medium',
  title: 'Moving from the manual books',
  setup: (rng) =>
    firstGood(20, () => {
      const mover = rng.pick(MOVERS);
      const kinds = OPENING_ASSETS.filter((a) => !(mover.services && (a.id === 'stock' || a.id === 'machinery')));
      const assets = rng.shuffle(kinds).slice(0, rng.int(3, 4)).map((a) => ({ ...a, value: a.id === 'cash' ? rng.step(5000, 40000, 500) : rng.step(20000, 400000, 1000) }));
      const due = rng.step(10000, 150000, 1000), owed = rng.step(10000, 150000, 1000);
      const loan = rng.next() < 0.5 ? rng.step(50000, 300000, 10000) : 0;
      const capital = sum(assets.map((a) => a.value)) + due - owed - loan;
      if (capital <= 50000) return null;
      const first = rng.pick(firstDeals({ assets, due, owed }));
      const { firm, business, kind } = mover;
      return { firm, business, kind, assets, customer: first.customer ?? rng.pick(C.CUSTOMERS), supplier: first.supplier ?? rng.pick(C.SUPPLIERS), due, owed, loan, capital, deal: first.deal, dealAmount: inr(rng.step(1000, Math.floor(first.limit / 500) * 500, 500)) };
    }),
  context: (s) =>
    [
      `${s.firm} is ${s.business}.`,
      `It closes its handwritten books on 31 March 2026 and starts on a computerised accounting system on 1 April 2026, entering the balances of its last balance sheet ${C.VIA}.`,
      ...s.assets.map((a) => `${a.name}: ${inr(a.value)}`),
      `${s.customer} (a debtor): ${inr(s.due)}`,
      `${s.supplier} (a creditor): ${inr(s.owed)}`,
      ...(s.loan ? [`Bank loan: ${inr(s.loan)}`] : []),
      'The capital is not listed: it is the excess of the assets over the liabilities.',
      `First transaction on the new system: ${s.deal.text(s.dealAmount)}.`,
    ].join('\n'),
  parts: [
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          `Which kind of accounting software suits ${s.firm}?`,
          C.PKG_NAME[s.kind],
          [
            ...C.PKGS.filter((k) => k !== s.kind).map((k): [string, string] => [C.PKG_NAME[k], `${C.PKG_NAME[k]} does not fit this business: ${lower2(C.PKG_TRAITS[2][k])}`]),
            ['Spreadsheet software', 'A spreadsheet is a general tool for tables of figures; the question is about which kind of accounting package fits.'],
          ],
          `${C.PKG_NAME[s.kind]}: ${C.PKG_TRAITS.map((t) => t[s.kind]).slice(0, 2).join(' ')}`,
          HINTS.packages,
        ),
      verify: (q) => {
        const mover = MOVERS.find((m) => ctx(q).includes(m.business));
        return mover !== undefined && optionText(q) === C.PKG_NAME[mover.kind];
      },
    },
    {
      kind: 'mcq',
      make: () =>
        choice(
          'In what order is the new system set up?',
          'Install the software, create the company, create the groups and ledgers, then enter the vouchers',
          [
            ['Enter the vouchers, then create the ledgers they use', 'A voucher is posted to ledgers, so the ledgers must exist first.'],
            ['Create the ledgers, then install the software', 'Nothing can be created until the software is installed.'],
            ['Create the company at the end of the first year', 'The company is created first of all: everything is entered inside it.'],
          ],
          'Each step needs the one before it: the software, then the company, then its groups and ledgers, and only then the vouchers.',
          ['Ask what has to exist before this step can be taken.', 'Install, create the company, create the groups and ledgers, enter the vouchers.'],
        ),
      verify: (q) => optionText(q).startsWith('Install the software'),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const A = sum(s.assets.map((a) => a.value)) + s.due, L = s.owed + s.loan;
        const parts = typed('rupees', s.capital, [
          [A + L, 'Added the liabilities to the assets.'],
          [A, 'Gave the assets and left out the liabilities.'],
          [A - s.due - L, "Left out the amount due from the debtor, which is an asset."],
          [A - s.owed, s.loan ? 'Left out the bank loan.' : 'Left out the creditor.'],
        ]);
        return parts && { prompt: 'What capital does the opening entry credit?', ...parts, explanation: [`Assets = ${inr(A)}; liabilities = ${inr(L)}.`, `Capital = ${inr(A)} - ${inr(L)} = ${inr(s.capital)}.`], hints: ['The opening entry brings the balances of the balance sheet into the new books.', 'Capital = assets - liabilities.'] };
      },
      verify: (q) => {
        const { assets, debts } = openingOf(ctx(q));
        return q.answer === rupees(assets - debts);
      },
    },
    {
      kind: 'journal',
      make: (s) => ({
        prompt: 'Pass the opening entry.',
        lines: [...s.assets.map((a) => dr(a.id, a.value)), dr(debtor(s.customer), s.due), cr(creditor(s.supplier), s.owed), ...(s.loan ? [cr('bankLoan', s.loan)] : []), cr('capital', s.capital)],
        explanation: ['Every asset account is debited with its balance, and every liability account credited.', `The capital, ${inr(s.capital)}, is credited to Capital A/c.`],
        distractorAccounts: ['profitAndLoss', 'drawings'],
        hints: ['The opening entry brings the balances of the balance sheet into the new books.', 'Assets Dr; To Liabilities; To Capital (the difference).'],
      }),
      verify: (q) => {
        const { assets } = openingOf(ctx(q));
        return sideTotal(q, 'Dr') === rupees(assets) && sideTotal(q, 'Cr') === rupees(assets);
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const rest = Object.keys(C.VOUCHERS).filter((v) => v !== s.deal.voucher && !s.deal.near.includes(v));
        return choice(
          'Which type of voucher records the first transaction on the new system?',
          `${s.deal.voucher} voucher`,
          [...s.deal.near, ...rest].map((v): [string, string] => [`${v} voucher`, `Chose a ${v.toLowerCase()} voucher, which records ${C.VOUCHERS[v]}.`]),
          `A ${s.deal.voucher.toLowerCase()} voucher records ${C.VOUCHERS[s.deal.voucher]}: that is what happened here.`,
          HINTS.vouchers,
        );
      },
      verify: (q) => {
        const done = /First transaction on the new system: (.+)\.$/m.exec(ctx(q))?.[1] ?? '';
        const amount = /₹[\d,]+/.exec(done)?.[0] ?? '';
        const deal = C.VOUCHER_CASES.find((x) => x.text(amount) === done);
        return deal !== undefined && optionText(q) === `${deal.voucher} voucher`;
      },
    },
  ],
});

/** The total assets and liabilities of a "moving over" case, from its lines. */
function openingOf(text: string): { assets: number; debts: number } {
  let assets = 0, debts = 0;
  for (const m of text.matchAll(/^(.+?): ₹([\d,]+)$/gm)) {
    const v = Number(m[2].replace(/,/g, ''));
    if (m[1] === 'Bank loan' || m[1].endsWith('(a creditor)')) debts += v;
    else assets += v;
  }
  return { assets, debts };
}

// ---------------------------------------------------------------------------------------------------------------
// Chained cases: a schedule and a set of entries, at the end of the stage.
// ---------------------------------------------------------------------------------------------------------------

const loanChain = caseTemplate<Borrow & { j: 1 | 2 }>({
  ...common,
  id: 'case-cas-chain-loan-schedule',
  version: 2,
  difficulty: 'complex',
  title: 'A loan repayment schedule',
  setup: (rng) =>
    firstGood(20, () => {
      const l = C.makeLoan(rng, 3, 4);
      return l && { firm: rng.pick(C.FIRMS), lender: rng.pick(['a bank', 'a co-operative bank']), l, r: l.pct / 100, j: rng.pick([1, 2] as const) };
    }),
  context: (s) =>
    [
      `${s.firm} borrowed ${inr(s.l.loan)} on 1 April 2025 from ${s.lender} at ${s.l.rate} a year, repayable in ${s.l.years} equal yearly instalments, each at the end of a year by bank transfer.`,
      `Instalment, as =PMT gives it, rounded to the nearest rupee: ${inr(s.l.instalment)}`,
      'Interest of a year = balance at the start of the year × the rate (what =IPMT gives), rounded to the nearest rupee.',
      'Principal repaid = instalment - interest (what =PPMT gives).',
      'Balance at the end of the year = balance at the start - principal repaid.',
      "The last instalment is adjusted: it repays exactly the balance left, with that year's interest.",
    ].join('\n'),
  parts: [
    {
      kind: 'statement',
      make: ({ firm, l }) => ({
        task: `Prepare the loan repayment schedule for the ${l.years} instalments, as a sheet sets it out.`,
        title: `Loan repayment schedule of ${firm}`,
        heading: 'Instalment',
        columns: [{ name: 'Balance at the start (₹)', adds: false }, 'Interest (₹)', 'Principal repaid (₹)', { name: 'Balance at the end (₹)', adds: false }],
        rows: l.rows.map((r, k) => ({ label: `Instalment ${k + 1}`, amounts: [rupees(r.open), rupees(r.interest), rupees(r.principal), rupees(r.close)] })),
        distractors: [`Instalment ${l.years + 1}`, 'Instalment 0', 'Total interest'],
        explanation: [
          ...l.rows.map((_, k) => C.loanRowLine(l, k + 1)),
          `The principal repaid adds up to the loan, ${inr(l.loan)}, and the balance after the last instalment is nil.`,
        ],
        hints: HINTS.loan,
      }),
      verify: (q) => {
        const first = q.data.split('\n')[0];
        const loan = amountsIn(first)[0], instalment = lineAmounts(q.data, 'Instalment, as =PMT')[0];
        const pct = Number(/(\d+(?:\.\d+)?)% a year/.exec(first)?.[1]);
        const rows = C.scheduleOf(loan, pct, instalment, q.rows.length);
        return instalment === Math.round(C.pmtOf(loan, pct, q.rows.length))
          && q.rows.every((row, k) => row.amounts[0] === rupees(rows[k].open) && row.amounts[1] === rupees(rows[k].interest) && row.amounts[2] === rupees(rows[k].principal) && row.amounts[3] === rupees(rows[k].close))
          && q.rows[q.rows.length - 1].amounts[3] === 0;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: ({ l, r }) => {
        const all = sum(l.rows.map((x) => x.interest));
        const last = l.rows[l.years - 1];
        const parts = typed('rupees', all, [
          last.instalment !== l.instalment && [l.instalment * l.years - l.loan, 'Took the last instalment to be the equal one; it is adjusted to repay exactly the balance left.'],
          [l.instalment * l.years, 'Gave the total of the instalments; the loan itself has to be taken off.'],
          [l.rows[0].interest * l.years, "Took every year's interest to be that of the first."],
          [l.loan * r, "Gave only the first year's interest."],
        ]);
        return parts && {
          prompt: 'How much interest does the firm pay over the whole life of the loan?',
          ...parts,
          explanation: [
            `${l.rows.map((x) => inr(x.interest)).join(' + ')} = ${inr(all)}.`,
            `Check: the instalments, ${l.years - 1} × ${inr(l.instalment)} + ${inr(last.instalment)} = ${inr(sum(l.rows.map((x) => x.instalment)))}, less the loan ${inr(l.loan)}.`,
          ],
          hints: HINTS.loan,
        };
      },
      verify: (q) => {
        const t = ctx(q);
        const first = t.split('\n')[0];
        const loan = amountsIn(first)[0], pct = Number(/(\d+(?:\.\d+)?)% a year/.exec(first)?.[1]);
        const n = Number(/in (\d+) equal yearly instalments/.exec(first)?.[1]);
        const rows = C.scheduleOf(loan, pct, lineAmounts(t, 'Instalment, as =PMT')[0], n);
        return q.answer === rupees(rows.reduce((s, x) => s + x.instalment, 0) - loan);
      },
    },
    {
      kind: 'journal',
      make: ({ l, j }) => {
        const row = l.rows[j - 1];
        return {
          prompt: `Pass the entry for the ${j === 1 ? 'first' : 'second'} instalment, paid on 31 March ${2025 + j}, as one compound entry.`,
          lines: [dr('bankLoan', row.principal), dr('interestOnLoan', row.interest), cr('bank', row.instalment)],
          explanation: [
            `Interest of the year = ${inr(row.open)} × ${l.rate} = ${inr(row.interest)} to the nearest rupee, an expense: Interest on Loan A/c is debited.`,
            `The rest of the instalment, ${inr(row.principal)}, repays the loan: Bank Loan A/c is debited.`,
            `Bank A/c is credited with the whole instalment, ${inr(row.instalment)}.`,
            'Passed in two steps instead, the interest is first credited to Bank Loan A/c (Interest on Loan A/c Dr, To Bank Loan A/c), and the whole instalment then debited to it (Bank Loan A/c Dr, To Bank A/c); the question asks for the one entry that does both.',
          ],
          distractorAccounts: ['interestReceived', 'drawings'],
          hints: HINTS.loan,
        };
      },
      verify: (q) => {
        const t = ctx(q);
        const instalment = lineAmounts(t, 'Instalment, as =PMT')[0];
        const first = t.split('\n')[0];
        const pct = Number(/(\d+(?:\.\d+)?)% a year/.exec(first)?.[1]);
        const n = Number(/in (\d+) equal yearly instalments/.exec(first)?.[1]);
        const row = C.scheduleOf(amountsIn(first)[0], pct, instalment, n)[q.prompt.includes('first') ? 0 : 1];
        return sideTotal(q, 'Cr') === rupees(instalment) && q.expected.some((l) => l.accountId === 'interestOnLoan' && l.amount === rupees(row.interest));
      },
    },
  ],
});

interface Closing {
  firm: string;
  gross: number;
  expenses: { id: string; name: string; value: number }[];
  incomes: { id: string; name: string; value: number }[];
  drawings: number;
  opening: number;
  net: number;
}

const CLOSE_EXPENSES = [{ id: 'salaries', name: 'Salaries' }, { id: 'rent', name: 'Rent' }, { id: 'electricity', name: 'Electricity' }, { id: 'advertisement', name: 'Advertisement' }, { id: 'stationery', name: 'Stationery' }, { id: 'insurance', name: 'Insurance' }];
const CLOSE_INCOMES = [{ id: 'commissionReceived', name: 'Commission Received' }, { id: 'interestReceived', name: 'Interest Received' }, { id: 'rentReceived', name: 'Rent Received' }, { id: 'discountReceived', name: 'Discount Received' }];

const closingChain = caseTemplate<Closing>({
  ...common,
  id: 'case-cas-chain-closing-entries',
  version: 2,
  difficulty: 'complex',
  title: 'Closing the year on the system',
  setup: (rng) =>
    firstGood(20, () => {
      const expenses = rng.shuffle(CLOSE_EXPENSES).slice(0, rng.int(2, 3)).map((e) => ({ ...e, value: rng.step(10000, 150000, 500) }));
      const incomes = rng.shuffle(CLOSE_INCOMES).slice(0, 2).map((e) => ({ ...e, value: rng.step(2000, 60000, 500) }));
      const spent = sum(expenses.map((e) => e.value)), earned = sum(incomes.map((e) => e.value));
      const gross = rng.next() < 0.25 ? rng.step(20000, Math.max(20000, spent - earned), 1000) : rng.step(spent, spent + 400000, 1000);
      const net = gross + earned - spent;
      if (net === 0) return null;
      return { firm: rng.pick(C.FIRMS), gross, expenses, incomes, drawings: rng.step(10000, 200000, 1000), opening: rng.step(300000, 1500000, 10000), net };
    }),
  context: (s) =>
    [
      `${s.firm} keeps its books on a computerised accounting system. After the adjusting entries of ${C.YEAR_END}, the year end, the ledgers show:`,
      `Gross profit, carried from the Trading A/c to the credit of Profit and Loss A/c: ${inr(s.gross)}`,
      ...s.expenses.map((e) => `${e.name} A/c: ${inr(e.value)}`),
      ...s.incomes.map((e) => `${e.name} A/c: ${inr(e.value)}`),
      `Drawings A/c: ${inr(s.drawings)}`,
      `Capital A/c: ${inr(s.opening)}`,
      `The closing entries are entered ${C.VIA}.`,
    ].join('\n'),
  parts: [
    {
      kind: 'journal_set',
      make: (s) => {
        const spent = sum(s.expenses.map((e) => e.value)), earned = sum(s.incomes.map((e) => e.value));
        const transactions: SetTransaction[] = [
          { label: '(a)', text: 'The expense accounts are transferred to Profit and Loss A/c.', lines: [dr('profitAndLoss', spent), ...s.expenses.map((e) => cr(e.id, e.value))], explanation: ['An expense account has a debit balance; it is closed by crediting it.', `Profit and Loss A/c is debited with the total, ${inr(spent)}.`] },
          { label: '(b)', text: 'The income accounts are transferred to Profit and Loss A/c.', lines: [...s.incomes.map((e) => dr(e.id, e.value)), cr('profitAndLoss', earned)], explanation: ['An income account has a credit balance; it is closed by debiting it.', `Profit and Loss A/c is credited with the total, ${inr(earned)}.`] },
          s.net > 0
            ? { label: '(c)', text: 'The balance of Profit and Loss A/c is transferred to Capital A/c.', lines: [dr('profitAndLoss', s.net), cr('capital', s.net)], explanation: [`Net profit = ${inr(s.gross)} + ${inr(earned)} - ${inr(spent)} = ${inr(s.net)}.`, 'It is the credit balance of Profit and Loss A/c: it is closed by debiting it, and Capital A/c is credited.'] }
            : { label: '(c)', text: 'The balance of Profit and Loss A/c is transferred to Capital A/c.', lines: [dr('capital', -s.net), cr('profitAndLoss', -s.net)], explanation: [`Net loss = ${inr(spent)} - ${inr(s.gross)} - ${inr(earned)} = ${inr(-s.net)}.`, 'It is the debit balance of Profit and Loss A/c: it is closed by crediting it, and Capital A/c is debited.'] },
          { label: '(d)', text: 'Drawings A/c is transferred to Capital A/c.', lines: [dr('capital', s.drawings), cr('drawings', s.drawings)], explanation: ['Drawings reduce the capital: Capital A/c is debited.', 'Drawings A/c is closed by crediting it.'] },
        ];
        return { task: 'Pass the closing entries.', transactions, hints: HINTS.entries };
      },
      verify: (q) => {
        const t = ctx(q);
        const gross = lineAmounts(t, 'Gross profit')[0];
        const spent = sum(CLOSE_EXPENSES.flatMap((e) => lineAmounts(t, `${e.name} A/c`)));
        const earned = sum(CLOSE_INCOMES.flatMap((e) => lineAmounts(t, `${e.name} A/c`)));
        const net = gross + earned - spent;
        const third = q.entries[2].expected;
        return third.some((l) => l.side === (net > 0 ? 'Dr' : 'Cr') && l.accountId === 'profitAndLoss' && l.amount === rupees(Math.abs(net)));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const closing = s.opening + s.net - s.drawings;
        const parts = typed('rupees', closing, [
          [s.opening + s.net + s.drawings, 'Added the drawings instead of deducting them.'],
          [s.opening + s.net, 'Did not transfer the drawings to Capital A/c.'],
          [s.opening - s.net - s.drawings, s.net > 0 ? 'Deducted the net profit instead of adding it.' : 'Added the net loss instead of deducting it.'],
          [s.opening + s.gross - s.drawings, 'Took the gross profit as the net profit.'],
        ]);
        return parts && {
          prompt: 'What is the balance of Capital A/c after the closing entries, the figure the opening entry of the new year brings forward?',
          ...parts,
          explanation: [`Capital = ${inr(s.opening)} ${s.net > 0 ? '+' : '-'} ${inr(Math.abs(s.net))} - ${inr(s.drawings)} = ${inr(closing)}.`],
          hints: ['Work out the net profit or loss first.', 'Closing capital = capital + net profit (or - net loss) - drawings.'],
        };
      },
      verify: (q) => {
        const t = ctx(q);
        const gross = lineAmounts(t, 'Gross profit')[0];
        const spent = sum(CLOSE_EXPENSES.flatMap((e) => lineAmounts(t, `${e.name} A/c`)));
        const earned = sum(CLOSE_INCOMES.flatMap((e) => lineAmounts(t, `${e.name} A/c`)));
        return q.answer === rupees(lineAmounts(t, 'Capital A/c')[0] + gross + earned - spent - lineAmounts(t, 'Drawings A/c')[0]);
      },
    },
  ],
});

const cases: CaseTemplate[] = [
  slnSchedule,
  whoChanged,
  twoMethods,
  loanInstalments,
  brsOnSheet,
  ratiosFromCells,
  codesOfAccounts,
  badDay,
  yearEndVouchers,
  movingOver,
  dbFunction,
  // Chained cases stand last.
  loanChain,
  closingChain,
];

export default cases;
