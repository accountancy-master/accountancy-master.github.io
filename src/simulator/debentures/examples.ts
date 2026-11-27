import { rupees } from '@/engine/money';
import type { Rng } from '@/engine/rng';
import { CASES, figures, type AllotMonth, type AssetKind, type DebInput, type Route } from './issue';

// Ready examples of the lab, and made-up issues in whole rupees for "New figures" and the quick questions.

export interface DebExample {
  id: string;
  title: string;
  input: DebInput;
}

const base: Omit<DebInput, 'company' | 'route' | 'n' | 'issueAt' | 'issuePct' | 'redeemAt' | 'redPct'> = {
  face: 100, rate: 9, years: 5, month: 'April', year: 2025, spBefore: 0,
  vendor: { name: 'Sharma Traders', asset: 'Machinery', price: rupees(495000) },
  loan: { amount: rupees(1000000), rate: 10, method: 'suspense' },
};

export const EXAMPLES: readonly DebExample[] = [
  {
    id: 'discount-premium',
    title: 'At a discount, redeemable at a premium',
    input: { ...base, company: 'Sagar Mills Ltd.', route: 'cash', n: 10000, issueAt: 'discount', issuePct: 5, redeemAt: 'premium', redPct: 5, month: 'July', spBefore: rupees(40000) },
  },
  {
    id: 'premium-premium',
    title: 'At a premium, redeemable at a premium',
    input: { ...base, company: 'Himgiri Steels Ltd.', route: 'cash', n: 10000, rate: 8, issueAt: 'premium', issuePct: 4, redeemAt: 'premium', redPct: 10, years: 6 },
  },
  {
    id: 'discount-par',
    title: 'At a discount, redeemable at par',
    input: { ...base, company: 'Kaveri Paper Mills Ltd.', route: 'cash', n: 6000, rate: 8, issueAt: 'discount', issuePct: 5, redeemAt: 'par', redPct: 0, month: 'October', spBefore: rupees(100000) },
  },
  {
    id: 'vendor',
    title: 'To a vendor for machinery',
    input: { ...base, company: 'Deccan Tools Ltd.', route: 'vendor', n: 0, issueAt: 'premium', issuePct: 10, redeemAt: 'par', redPct: 0, month: 'October' },
  },
  {
    id: 'collateral',
    title: 'As collateral security for a loan',
    input: { ...base, company: 'Vindhya Chemicals Ltd.', route: 'collateral', n: 12000, issueAt: 'par', issuePct: 0, redeemAt: 'par', redPct: 0 },
  },
  {
    id: 'collateral-note',
    title: 'Collateral security, no entry (a note)',
    input: { ...base, company: 'Nilgiri Tea Estates Ltd.', route: 'collateral', n: 1500, face: 1000, rate: 10, issueAt: 'par', issuePct: 0, redeemAt: 'par', redPct: 0, month: 'October', loan: { amount: rupees(1200000), rate: 11, method: 'note' } },
  },
];

/** The examples played in Watch. */
export const WATCH_EXAMPLES = EXAMPLES.slice(0, 5);

export const COMPANIES = [
  'Sagar Mills Ltd.', 'Narmada Textiles Ltd.', 'Himgiri Steels Ltd.', 'Konark Cements Ltd.', 'Deccan Tools Ltd.',
  'Kaveri Paper Mills Ltd.', 'Aravali Motors Ltd.', 'Nilgiri Tea Estates Ltd.', 'Vindhya Chemicals Ltd.', 'Godavari Foods Ltd.',
];
const VENDORS = ['Sharma Traders', 'Mehta Engineering Works', 'Lakshmi Industries', 'Bose & Sons', 'Iyer Machines', 'Khanna Brothers'];
const ASSETS: AssetKind[] = ['Machinery', 'Building', 'Furniture'];
const RATES = [6, 7, 8, 9, 10, 11, 12];

/** A balance of Securities Premium before an issue whose loss is `loss` paise: none, less than the loss, or more. */
function premiumBefore(rng: Rng, loss: number): number {
  const state = rng.int(0, 3);
  if (state === 0 || loss <= 0) return 0;
  const lossRs = loss / 100;
  if (state === 1) return rupees(Math.ceil(lossRs / 10000) * 10000 + rng.step(10000, 80000, 10000));
  return rupees(Math.max(1000, Math.floor((lossRs * rng.pick([0.25, 0.4, 0.5, 0.6])) / 1000) * 1000));
}

/**
 * A made-up issue in whole rupees: a nominal value of whole lakhs (so interest for three or six months is whole
 * rupees at any rate), a premium of 5% to 25%, a discount of 5% or 10%, a premium on redemption of 5% or 10%.
 */
export function randomInput(rng: Rng, route: Route = rng.pick(['cash', 'cash', 'cash', 'vendor', 'collateral'] as const), caseId?: (typeof CASES)[number]['id']): DebInput {
  const face = rng.pick([100, 100, 100, 500, 1000]);
  const n = face === 100 ? rng.step(1000, 20000, 1000) : face === 500 ? rng.step(200, 4000, 200) : rng.step(100, 2000, 100);
  const c = caseId ? CASES.find((x) => x.id === caseId)! : rng.pick(CASES);
  const month: AllotMonth = rng.pick(['April', 'April', 'July', 'October', 'January'] as const);
  const input: DebInput = {
    company: rng.pick(COMPANIES), route, n, face, rate: rng.pick(RATES),
    issueAt: c.issueAt, issuePct: c.issueAt === 'premium' ? rng.pick([5, 10, 20, 25]) : c.issueAt === 'discount' ? rng.pick([5, 10]) : 0,
    redeemAt: c.redeemAt, redPct: c.redeemAt === 'premium' ? rng.pick([5, 10]) : 0,
    years: rng.int(4, 8), month, year: rng.pick([2024, 2025]), spBefore: 0,
    vendor: { name: rng.pick(VENDORS), asset: rng.pick(ASSETS), price: 0 },
    loan: { amount: 0, rate: 10, method: rng.pick(['note', 'suspense'] as const) },
  };
  if (route === 'vendor') input.vendor.price = n * figures({ ...input, route: 'cash' }).issuePrice;
  if (route === 'collateral') {
    const loan = rng.step(500000, 4000000, 100000);
    const nominal = (loan * rng.pick([120, 125, 130, 150])) / 100;
    input.n = nominal / face;
    input.issueAt = 'par';
    input.issuePct = 0;
    input.redeemAt = 'par';
    input.redPct = 0;
    input.loan = { amount: rupees(loan), rate: rng.pick([8, 9, 10, 11, 12, 13].filter((x) => x !== input.rate)), method: input.loan.method };
    // A loan of whole lakhs and months of whole quarters make the interest on it whole rupees.
  } else {
    input.spBefore = premiumBefore(rng, figures(input).loss);
  }
  return input;
}
