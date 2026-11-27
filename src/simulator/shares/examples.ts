import { rupees } from '@/engine/money';
import type { Rng } from '@/engine/rng';
import { issueProblem, issueShares, type IssueIn } from './issue';

// The ready issues of the share-capital lab, and new figures made from a seed. Every example is worked in the tests.

const R = rupees;

export interface IssueExample {
  id: string;
  title: string;
  input: IssueIn;
}

export const ISSUE_EXAMPLES: readonly IssueExample[] = [
  {
    id: 'premium',
    title: 'At a premium: forfeited and reissued',
    input: {
      company: 'Vayu Motors Ltd.',
      authorised: 200000,
      offered: 50000,
      face: R(10),
      premium: R(2),
      application: R(3),
      allotment: R(3),
      calls: [R(2), R(2)],
      applied: 50000,
      rejected: 0,
      defaulter: { shares: 500, paid: 'application' },
      forfeitEarly: false,
      advance: null,
      reissue: { shares: 400, price: R(8) },
    },
  },
  {
    id: 'pro-rata',
    title: 'Over-subscribed: pro-rata allotment',
    input: {
      company: 'Kaveri Textiles Ltd.',
      authorised: 300000,
      offered: 100000,
      face: R(10),
      premium: 0,
      application: R(2),
      allotment: R(3),
      calls: [R(5)],
      applied: 160000,
      rejected: 10000,
      defaulter: { shares: 600, paid: 'application' },
      forfeitEarly: false,
      advance: { shares: 1000 },
      reissue: { shares: 600, price: R(9) },
    },
  },
  {
    id: 'early',
    title: 'Forfeited before the final call',
    input: {
      company: 'Neelgiri Foods Ltd.',
      authorised: 50000,
      offered: 20000,
      face: R(10),
      premium: R(1),
      application: R(2),
      allotment: R(4),
      calls: [R(2), R(2)],
      applied: 20000,
      rejected: 0,
      defaulter: { shares: 300, paid: 'allotment' },
      forfeitEarly: true,
      advance: null,
      reissue: { shares: 300, price: R(7) },
    },
  },
  {
    id: 'advance',
    title: 'Calls in advance, every share paid',
    input: {
      company: 'Sahyadri Pumps Ltd.',
      authorised: 100000,
      offered: 40000,
      face: R(10),
      premium: R(3),
      application: R(3),
      allotment: R(3),
      calls: [R(2), R(2)],
      applied: 40000,
      rejected: 0,
      defaulter: null,
      forfeitEarly: false,
      advance: { shares: 2000 },
      reissue: null,
    },
  },
];

export const PATTERNS: number[][] = [
  [3, 3, 4],
  [2, 3, 5],
  [3, 2, 5],
  [2, 3, 2, 3],
  [3, 3, 2, 2],
  [2, 4, 2, 2],
  [4, 4, 2],
  [3, 4, 3],
];
/** Shares applied for (after rejections) : shares offered. */
export const SUBSCRIPTION: [number, number][] = [
  [1, 1],
  [5, 4],
  [4, 3],
  [3, 2],
  [2, 1],
];
const COMPANIES = ['Vayu Motors Ltd.', 'Kaveri Textiles Ltd.', 'Neelgiri Foods Ltd.', 'Sahyadri Pumps Ltd.', 'Ganga Cables Ltd.', 'Thar Solar Ltd.', 'Konkan Ports Ltd.'];

/** A new issue whose figures all come out in whole rupees (or whole paise where a share is split). */
export function newIssue(rng: Rng): IssueIn {
  for (;;) {
    const pattern = rng.pick(PATTERNS);
    const [num, den] = rng.pick(SUBSCRIPTION);
    const offered = rng.pick([10000, 20000, 25000, 40000, 50000, 100000]);
    const pool = (offered * num) / den;
    const rejected = num === den ? 0 : rng.pick([0, 0, 1000, 2000, 5000]);
    const calls = pattern.slice(2).map(R);
    const paid = rng.pick(calls.length === 1 ? (['application', 'allotment'] as const) : (['application', 'allotment', 'call1'] as const));
    const d = den * 100 * rng.int(1, 6);
    const early = calls.length === 2 && paid !== 'call1' && rng.int(0, 2) === 0;
    const withDefaulter = rng.int(0, 5) > 0;
    const x: IssueIn = {
      company: rng.pick(COMPANIES),
      authorised: offered * rng.pick([2, 3, 4]),
      offered,
      face: R(10),
      premium: R(rng.pick([0, 0, 1, 2, 3, 5])),
      application: R(pattern[0]),
      allotment: R(pattern[1]),
      calls,
      applied: pool + rejected,
      rejected,
      defaulter: withDefaulter ? { shares: d, paid } : null,
      forfeitEarly: withDefaulter && early,
      advance: rng.int(0, 3) === 0 ? { shares: 500 * rng.int(1, 4) } : null,
      reissue: null,
    };
    if (issueProblem(x)) continue;
    // A holder who "does not pay the allotment money" must owe some: skip an issue whose excess application money
    // already covers that holder's whole allotment.
    if (x.defaulter?.paid === 'application' && (pool - offered) * x.application >= offered * (x.allotment + x.premium)) continue;
    if (x.defaulter && rng.int(0, 3) > 0) {
      // Reissue all or half of them, at a discount no more than was forfeited a share (in whole rupees), or at par.
      const worked = issueShares(x);
      const r = rng.int(0, 1) === 0 ? d : d / 2;
      const perShare = Math.floor(worked.figures.forfeited / d / 100);
      const discount = rng.int(0, Math.max(0, perShare));
      x.reissue = { shares: r, price: R(10 - discount) };
      try {
        issueShares(x);
      } catch {
        continue;
      }
    }
    return x;
  }
}
