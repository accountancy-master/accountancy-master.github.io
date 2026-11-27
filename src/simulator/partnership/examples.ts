import { rupees, type Paise } from '@/engine/money';
import type { Rng } from '@/engine/rng';
import { appropriate, interestForYear, interestOnDrawings, type Appropriation, type AppropriationIn, type PartnerIn } from './appropriation';
import { fr } from './fraction';
import { reconProblem, reconstitute, type ReconIn } from './reconstitution';

// The ready examples of the partnership lab, and new figures made from a seed. Every example is worked in the tests.

const R = rupees;
const p = (name: string, capital: number, ratio: number, salary = 0, drawings = 0): PartnerIn => ({ name, capital: R(capital), ratio, salary: R(salary), drawings: R(drawings) });

export const NAMES = ['Asha', 'Bimal', 'Chitra'] as const;
export const NEW_PARTNER = 'Dev';

export interface AppExample {
  id: string;
  title: string;
  input: AppropriationIn;
}

export const EXAMPLES: readonly AppExample[] = [
  {
    id: 'full',
    title: 'Enough profit, fixed capitals',
    input: {
      partners: [p('Asha', 400000, 3, 0, 40000), p('Bimal', 300000, 2, 60000, 30000)],
      netProfit: R(300000),
      iocRate: 10,
      iodRate: 6,
      commission: null,
      guarantee: null,
      capitals: 'fixed',
    },
  },
  {
    id: 'short',
    title: 'The profit falls short',
    input: {
      partners: [p('Asha', 200000, 1, 0, 20000), p('Bimal', 100000, 1, 30000)],
      netProfit: R(45000),
      iocRate: 10,
      iodRate: 0,
      commission: null,
      guarantee: null,
      capitals: 'fluctuating',
    },
  },
  {
    id: 'guarantee',
    title: 'A guaranteed minimum profit',
    input: {
      partners: [p('Asha', 300000, 5, 0, 50000), p('Bimal', 200000, 3, 0, 30000), p('Chitra', 100000, 2, 0, 20000)],
      netProfit: R(230000),
      iocRate: 5,
      iodRate: 0,
      commission: null,
      guarantee: { partner: 2, amount: R(50000), by: 'firm' },
      capitals: 'fluctuating',
    },
  },
  {
    id: 'commission',
    title: 'Salary and commission',
    input: {
      partners: [p('Asha', 500000, 2, 0, 60000), p('Bimal', 300000, 2, 36000, 24000), p('Chitra', 200000, 1, 0, 12000)],
      netProfit: R(400000),
      iocRate: 8,
      iodRate: 10,
      commission: { partner: 2, rate: 5 },
      guarantee: null,
      capitals: 'fixed',
    },
  },
  {
    id: 'loss',
    title: 'A year of loss',
    input: {
      partners: [p('Asha', 400000, 3, 0, 20000), p('Bimal', 300000, 2, 60000)],
      netProfit: R(-20000),
      iocRate: 10,
      iodRate: 10,
      commission: null,
      guarantee: null,
      capitals: 'fluctuating',
    },
  },
];

export interface ReconExample {
  id: string;
  title: string;
  input: ReconIn;
}

export const RECON_EXAMPLES: readonly ReconExample[] = [
  {
    id: 'admit-old',
    title: 'Dev joins, from both in the old ratio',
    input: { names: ['Asha', 'Bimal'], ratio: [3, 2], goodwill: R(100000), event: { kind: 'admission', name: NEW_PARTNER, share: fr(1, 5), from: { kind: 'old-ratio' }, capital: R(80000), premium: 'cash' } },
  },
  {
    id: 'admit-one',
    title: 'Dev joins, all from Asha',
    input: { names: ['Asha', 'Bimal'], ratio: [3, 2], goodwill: R(100000), event: { kind: 'admission', name: NEW_PARTNER, share: fr(1, 5), from: { kind: 'one', partner: 0 }, capital: R(80000), premium: 'capital' } },
  },
  {
    id: 'change',
    title: 'A new ratio among the same partners',
    input: { names: ['Asha', 'Bimal', 'Chitra'], ratio: [3, 2, 1], goodwill: R(60000), event: { kind: 'change', newRatio: [1, 2, 3] } },
  },
  {
    id: 'retire',
    title: 'Chitra retires',
    input: { names: ['Asha', 'Bimal', 'Chitra'], ratio: [3, 2, 1], goodwill: R(120000), event: { kind: 'retirement', partner: 2, newRatio: 'old-ratio' } },
  },
  {
    id: 'death',
    title: 'Bimal dies, a new ratio agreed',
    input: { names: ['Asha', 'Bimal', 'Chitra'], ratio: [2, 2, 1], goodwill: R(50000), event: { kind: 'death', partner: 1, newRatio: [1, 1] } },
  },
];

const RATIOS2 = [[3, 2], [2, 1], [1, 1], [5, 3], [3, 1], [4, 3]];
const RATIOS3 = [[3, 2, 1], [2, 2, 1], [5, 3, 2], [1, 1, 1], [4, 3, 2], [2, 1, 1]];
const SHARES = [fr(1, 4), fr(1, 5), fr(1, 6), fr(1, 3), fr(1, 10)];

/** Whether every figure of a year's sharing is in whole rupees, and no partner's share turns negative in a profit. */
function clean(a: Appropriation): boolean {
  const all = [...a.iod, ...a.ioc, ...a.salary, ...a.commission, ...a.shares, ...a.finalShares];
  if (all.some((x) => x % 100 !== 0)) return false;
  return a.divisible <= 0 || a.finalShares.every((x) => x >= 0);
}

/** A firm and a year of new figures, and a change in its partners, all in whole rupees as a board question has them. */
export function newFigures(rng: Rng): { appropriation: AppropriationIn; recon: ReconIn } {
  const three = rng.int(0, 1) === 1;
  const ratio = rng.pick(three ? RATIOS3 : RATIOS2);
  const names = NAMES.slice(0, ratio.length);
  const total = ratio.reduce((s, t) => s + t, 0);

  // A loss (1 in 6), a profit short of the appropriations (1 in 6), or a profit that covers them.
  const mood = rng.int(0, 5);
  let appropriation: AppropriationIn;
  for (;;) {
    const iocRate = rng.pick([5, 6, 8, 10, 12]);
    const iodRate = rng.pick([0, 5, 6, 10]);
    const salaried = rng.int(-1, names.length - 1);
    const partners: PartnerIn[] = names.map((name, i) => ({
      name,
      capital: R(rng.step(100000, 600000, 50000)),
      ratio: ratio[i],
      salary: i === salaried ? R(rng.step(24000, 72000, 12000)) : 0,
      drawings: R(rng.step(10000, 60000, 5000)),
    }));
    const iod = partners.reduce((s, x) => s + interestOnDrawings(x.drawings, iodRate), 0);
    const due = partners.reduce((s, x) => s + interestForYear(x.capital, iocRate) + x.salary, 0);
    // The short profit is a round part of what is due, so that every part of it is in whole rupees. A commission only
    // with a profit that covers everything.
    const commission = mood > 1 && rng.int(0, 3) === 0 ? { partner: rng.int(0, names.length - 1), rate: rng.pick([2, 5, 10]) } : null;
    const netProfit: Paise =
      mood === 0
        ? -R(rng.step(10000, 60000, 5000))
        : mood === 1
          ? Math.round((due * rng.pick([1, 2, 3])) / 4) - iod
          : Math.round((due + R(total * 1000 * rng.int(20, 120))) / R(1000)) * R(1000);
    if (netProfit === 0 || (mood === 1 && netProfit < 0)) continue;
    const guarantee = three && mood > 1 && rng.int(0, 2) === 0 ? { partner: names.length - 1, amount: R(rng.step(40000, 150000, 10000)), by: rng.int(0, 1) === 0 ? ('firm' as const) : 0 } : null;
    appropriation = { partners, netProfit, iocRate, iodRate, commission, guarantee, capitals: rng.int(0, 1) === 0 ? 'fixed' : 'fluctuating' };
    if (clean(appropriate(appropriation))) break;
  }

  let recon: ReconIn;
  for (;;) {
    const goodwill = R(rng.step(60000, 300000, 60000));
    const kinds = three ? (['admission', 'change', 'retirement', 'death'] as const) : (['admission', 'change'] as const);
    const kind = rng.pick(kinds);
    if (kind === 'admission') {
      const from = rng.pick([{ kind: 'old-ratio' as const }, { kind: 'equal' as const }, { kind: 'one' as const, partner: rng.int(0, names.length - 1) }]);
      recon = { names: [...names], ratio, goodwill, event: { kind, name: NEW_PARTNER, share: rng.pick(SHARES), from, capital: R(rng.step(50000, 200000, 10000)), premium: rng.int(0, 2) === 0 ? 'capital' : 'cash' } };
    } else if (kind === 'change') {
      const newRatio = rng.shuffle(ratio);
      if (newRatio.every((t, i) => t === ratio[i])) continue;
      recon = { names: [...names], ratio, goodwill, event: { kind, newRatio } };
    } else {
      const partner = rng.int(0, 2);
      const newRatio = rng.int(0, 2) === 0 ? rng.pick([[1, 1], [2, 1], [3, 2], [1, 2]]) : ('old-ratio' as const);
      recon = { names: [...names], ratio, goodwill, event: { kind, partner, newRatio } };
    }
    if (reconProblem(recon)) continue;
    const r = reconstitute(recon);
    if ([r.goodwillAmount, ...r.goodwillShares].every((x) => x % 100 === 0)) break;
  }
  return { appropriation, recon };
}
