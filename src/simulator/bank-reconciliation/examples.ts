import { rupees } from '@/engine/money';
import type { Rng } from '@/engine/rng';
import { KINDS, type Book, type Item, type KindId, type Scenario } from './books';

// Ready months of the lab, and made-up ones in whole rupees.

export interface BrsExample {
  id: string;
  title: string;
  scenario: Scenario;
  from: Book;
  amended: boolean;
}

const r = rupees;

const KAVITA: Scenario = {
  firm: 'Kavita Textiles',
  month: 'March',
  year: 2026,
  lastDay: 31,
  opening: r(42000),
  common: [
    { day: 5, party: 'Kumar & Co.', amount: r(18000), into: true },
    { day: 12, party: 'Gupta Suppliers', amount: r(15000), into: false },
  ],
  items: [
    { id: 'a', kind: 'dishonoured', day: 18, depositedOn: 10, amount: r(3000), party: 'Joshi Stores' },
    { id: 'b', kind: 'direct', day: 24, amount: r(5000), party: 'Mehra Brothers' },
    { id: 'c', kind: 'issued', day: 28, amount: r(12500), party: 'Patel Traders' },
    { id: 'd', kind: 'deposited', day: 30, amount: r(8000), party: 'Sinha & Sons' },
    { id: 'e', kind: 'charges', day: 31, amount: r(350), party: '' },
    { id: 'f', kind: 'interest', day: 31, amount: r(600), party: '' },
  ],
};

const RAGHAV: Scenario = {
  firm: 'Raghav Auto Parts',
  month: 'March',
  year: 2026,
  lastDay: 31,
  opening: r(-25000),
  common: [
    { day: 6, party: 'Iyer Motors', amount: r(30000), into: true },
    { day: 15, party: 'Bharat Spares', amount: r(12000), into: false },
  ],
  items: [
    { id: 'a', kind: 'cbError', day: 9, amount: r(900), paid: r(4500), over: true, party: 'Ramesh Tyres' },
    { id: 'b', kind: 'bankError', day: 17, amount: r(2000), party: '' },
    { id: 'c', kind: 'standing', day: 20, amount: r(1200), party: '' },
    { id: 'd', kind: 'issued', day: 29, amount: r(6000), party: 'Deccan Lubricants' },
    { id: 'e', kind: 'deposited', day: 31, amount: r(9500), party: 'Sharma Garage' },
    { id: 'f', kind: 'charges', day: 31, amount: r(250), party: '' },
  ],
};

export const EXAMPLES: readonly BrsExample[] = [
  { id: 'favourable-cb', title: 'A favourable balance, from the Cash Book', scenario: KAVITA, from: 'cb', amended: false },
  { id: 'overdraft-pb', title: 'An overdraft with errors, from the Pass Book', scenario: RAGHAV, from: 'pb', amended: false },
  { id: 'amended-cb', title: 'Amend the cash book first, then reconcile', scenario: KAVITA, from: 'cb', amended: true },
];

const FIRMS = ['Meena Stationers', 'Arun Electricals', 'Gupta Provision Store', 'Sunita Boutique', 'Deepa Medicals', 'Iqbal Cycle Mart', 'Lakshmi Sweets', 'Naveen Hardware'];
const PARTIES = ['Anand & Co.', 'Bose Brothers', 'Chopra Traders', 'Das Agencies', 'Fernandes Stores', 'Hegde & Sons', 'Kapoor Mills', 'Nair Enterprises', 'Pillai Distributors', 'Reddy Textiles', 'Singh Transport', 'Verma Paper Mart'];
const MONTHS: [string, number][] = [['March', 31], ['June', 30], ['September', 30], ['December', 31]];

/** Rupee range and step of each kind's amount. */
const RANGE: Record<KindId, [number, number, number]> = {
  issued: [3000, 25000, 500],
  deposited: [3000, 25000, 500],
  charges: [100, 800, 50],
  interest: [200, 1500, 50],
  direct: [2000, 15000, 500],
  dishonoured: [1000, 10000, 500],
  standing: [500, 4000, 100],
  cbError: [90, 900, 90],
  bankError: [500, 5000, 500],
};

/** A made-up item of a kind: its day near the month end for the timing differences, any day for the rest. */
export function makeItem(rng: Rng, kind: KindId, id: string, lastDay: number, party: string): Item {
  const amount = r(rng.step(...RANGE[kind]));
  const late = kind === 'issued' || kind === 'deposited';
  const day = late ? rng.int(lastDay - 4, lastDay) : kind === 'charges' || kind === 'interest' ? lastDay : rng.int(8, lastDay - 3);
  const base: Item = { id, kind, day, amount, party: kind === 'charges' || kind === 'interest' || kind === 'standing' || kind === 'bankError' ? '' : party };
  if (kind === 'dishonoured') return { ...base, depositedOn: rng.int(2, day - 1) };
  if (kind === 'cbError') return { ...base, paid: r(rng.step(2000, 9000, 100)), over: rng.int(0, 1) === 0 };
  return base;
}

/** A made-up month: an opening balance (favourable, or an overdraft one time in three), two entries both books have, and four to six items that differ. */
export function randomScenario(rng: Rng, count = rng.int(4, 6)): Scenario {
  const [month, lastDay] = rng.pick(MONTHS);
  const overdraft = rng.int(0, 2) === 0;
  const opening = r(overdraft ? -rng.step(10000, 50000, 1000) : rng.step(20000, 80000, 1000));
  const parties = rng.shuffle(PARTIES);
  // At least one timing difference and one item the bank records first; the rest of any kind.
  const kinds: KindId[] = [rng.pick(['issued', 'deposited'] as const), rng.pick(['charges', 'interest', 'direct', 'dishonoured', 'standing'] as const)];
  for (const k of rng.shuffle(KINDS)) if (kinds.length < count && !kinds.includes(k)) kinds.push(k);
  const items = kinds.map((k, n) => makeItem(rng, k, 'abcdefgh'[n], lastDay, parties[n]));
  return {
    firm: rng.pick(FIRMS),
    month,
    year: rng.pick([2025, 2026]),
    lastDay,
    opening,
    common: [
      { day: rng.int(3, 8), party: parties[8], amount: r(rng.step(10000, 40000, 1000)), into: true },
      { day: rng.int(10, 16), party: parties[9], amount: r(rng.step(5000, 20000, 1000)), into: false },
    ],
    items: items.sort((a, b) => a.day - b.day),
  };
}
