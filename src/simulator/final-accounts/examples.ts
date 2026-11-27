import { rupees } from '@/engine/money';
import { createRng, type Rng } from '@/engine/rng';
import { balanceOf, finalAccounts, fullState, trialBalanceTotals, type Adjustment, type Business, type ItemId, type TbLine } from './model';

// ---------------------------------------------------------------------------------------------------------------
// The businesses of the lab: three ready ones (a year of profit with most kinds of adjustment, a year of loss with a
// bank overdraft, a shop with a loan and bills) and endless new ones from a seed. Every trial balance agrees. The
// figures of the ready ones come to whole rupees without rounding; new ones may round a rate to the rupee.
// ---------------------------------------------------------------------------------------------------------------

const tb = (lines: [ItemId, number][]): TbLine[] => lines.map(([id, r]) => ({ id, amount: rupees(r) }));

/**
 * The walk-through's business: a profit, and the adjustments of the syllabus one after another, the manager's
 * commission last (it is worked out on the profit after all the others: ₹34,650 × 10/110 = ₹3,150).
 */
export const MEERA: Business = {
  id: 'meera',
  name: 'Meera Textiles',
  trade: 'a cloth shop in Surat',
  tb: tb([
    ['openingStock', 40000],
    ['purchases', 210000],
    ['purchasesReturn', 10000],
    ['sales', 320000],
    ['salesReturn', 5000],
    ['wages', 18000],
    ['carriageInwards', 7000],
    ['salaries', 36000],
    ['rent', 24000],
    ['insurance', 6000],
    ['badDebts', 2000],
    ['commissionReceived', 8000],
    ['rentReceived', 12000],
    ['machinery', 80000],
    ['furniture', 50000],
    ['debtors', 60000],
    ['provision', 3000],
    ['bank', 28000],
    ['cash', 8000],
    ['capital', 200000],
    ['drawings', 24000],
    ['creditors', 45000],
  ]),
  adjustments: [
    { type: 'closingStock', amount: rupees(50000) },
    { type: 'outstanding', item: 'salaries', amount: rupees(4000) },
    { type: 'prepaid', item: 'insurance', amount: rupees(1500) },
    { type: 'accrued', item: 'commissionReceived', amount: rupees(2100) },
    { type: 'advance', item: 'rentReceived', amount: rupees(3000) },
    { type: 'depreciation', item: 'machinery', rate: 10, months: 12 },
    { type: 'badDebts', further: rupees(1000), rate: 5 },
    { type: 'interestOnCapital', rate: 6 },
    { type: 'goodsTaken', amount: rupees(3000) },
    { type: 'abnormalLoss', amount: rupees(6000), claim: rupees(4000) },
    { type: 'commission', rate: 10, basis: 'after' },
  ],
};

/** A hard year: a gross loss and a net loss, and a bank balance on the other side (an overdraft). Free samples move the gross loss but not the net loss. */
export const KABIR: Business = {
  id: 'kabir',
  name: 'Kabir Electricals',
  trade: 'an electrical goods shop in Pune',
  tb: tb([
    ['openingStock', 60000],
    ['purchases', 240000],
    ['sales', 300000],
    ['wages', 20000],
    ['carriageInwards', 5000],
    ['salaries', 36000],
    ['rent', 18000],
    ['advertisement', 9000],
    ['insurance', 3000],
    ['commissionReceived', 6000],
    ['vehicles', 120000],
    ['furniture', 40000],
    ['debtors', 50000],
    ['cash', 6000],
    ['capital', 260000],
    ['drawings', 30000],
    ['creditors', 55000],
    ['bankOverdraft', 16000],
  ]),
  adjustments: [
    { type: 'closingStock', amount: rupees(20000) },
    { type: 'outstanding', item: 'wages', amount: rupees(2000) },
    { type: 'prepaid', item: 'insurance', amount: rupees(1000) },
    { type: 'accrued', item: 'commissionReceived', amount: rupees(1000) },
    { type: 'depreciation', item: 'vehicles', rate: 10, months: 12 },
    { type: 'goodsTaken', amount: rupees(2000) },
    { type: 'goodsGiven', to: 'samples', amount: rupees(1500) },
  ],
};

/** A shop with a bank loan and bills: a provision for discount on debtors, goods given to the staff, and an uninsured loss by fire. */
export const ANANYA: Business = {
  id: 'ananya',
  name: 'Ananya Stationers',
  trade: 'a stationery shop in Kochi',
  tb: tb([
    ['openingStock', 25000],
    ['purchases', 160000],
    ['sales', 240000],
    ['salesReturn', 4000],
    ['carriageInwards', 4000],
    ['salaries', 30000],
    ['rent', 18000],
    ['insurance', 3600],
    ['advertisement', 6000],
    ['interestOnLoan', 3000],
    ['badDebts', 1000],
    ['interestReceived', 2000],
    ['landAndBuilding', 150000],
    ['furniture', 30000],
    ['debtors', 40000],
    ['provision', 2000],
    ['billsReceivable', 10000],
    ['bank', 22000],
    ['cash', 4400],
    ['capital', 195000],
    ['drawings', 18000],
    ['bankLoan', 50000],
    ['creditors', 32000],
    ['billsPayable', 8000],
  ]),
  adjustments: [
    { type: 'closingStock', amount: rupees(35000) },
    { type: 'outstanding', item: 'rent', amount: rupees(1500) },
    { type: 'prepaid', item: 'insurance', amount: rupees(900) },
    { type: 'accrued', item: 'interestReceived', amount: rupees(500) },
    { type: 'depreciation', item: 'furniture', rate: 10, months: 12 },
    { type: 'badDebts', further: rupees(1000), rate: 5 },
    { type: 'discount', rate: 2 },
    { type: 'interestOnCapital', rate: 5 },
    { type: 'goodsGiven', to: 'staffWelfare', amount: rupees(1000) },
    { type: 'abnormalLoss', amount: rupees(4000), claim: 0 },
  ],
};

export const READY: readonly Business[] = [MEERA, KABIR, ANANYA];

const NAMES = ['Divya', 'Rohan', 'Farah', 'Arjun', 'Lakshmi', 'Imran', 'Gurpreet', 'Nikhil', 'Sneha', 'Tenzin', 'Joseph', 'Pooja'];
const TRADES: [string, string][] = [
  ['Footwear', 'a shoe shop'],
  ['Hardware', 'a hardware store'],
  ['Book House', 'a bookshop'],
  ['Opticals', 'a spectacles shop'],
  ['Traders', 'a grocery wholesaler'],
  ['Crockery', 'a crockery shop'],
];
const CITIES = ['Jaipur', 'Lucknow', 'Indore', 'Mysuru', 'Guwahati', 'Nagpur', 'Bhopal', 'Coimbatore'];

const r = (rng: Rng, min: number, max: number, step: number) => rupees(rng.step(min, max, step));

/** Goods lost by fire: insured in part, in full, or not at all. */
function abnormal(rng: Rng): Adjustment {
  const amount = r(rng, 2000, 10000, 1000);
  const cover = rng.pick([0, 0.5, 0.6, 0.75, 1]);
  return { type: 'abnormalLoss', amount, claim: Math.round((amount * cover) / rupees(100)) * rupees(100) };
}

/** One try at a business from the generator; null when the figures would not be believable. */
function attempt(rng: Rng, seed: number): Business | null {
  const [tradeName, trade] = rng.pick(TRADES);
  const os = r(rng, 20000, 60000, 5000);
  const cs = r(rng, 25000, 70000, 5000);
  const purchases = r(rng, 150000, 300000, 10000);
  const pr = rng.next() < 0.6 ? r(rng, 2000, 10000, 1000) : 0;
  const sr = rng.next() < 0.6 ? r(rng, 2000, 10000, 1000) : 0;
  const wages = r(rng, 10000, 30000, 1000);
  const carriage = r(rng, 2000, 8000, 1000);
  const cogs = os + purchases - pr + wages + carriage - cs;
  const margin = rng.pick([20, 25, 30, 35]);
  const sales = Math.round((cogs * (100 + margin)) / 100 / rupees(10000)) * rupees(10000) + sr;
  const salaries = r(rng, 24000, 60000, 6000);
  const rent = r(rng, 12000, 36000, 6000);
  const insurance = r(rng, 2400, 6000, 1200);
  const extra = rng.pick<ItemId | null>(['advertisement', 'carriageOutwards', null]);
  const extraAmount = extra ? r(rng, 2000, 8000, 1000) : 0;
  const bad = r(rng, 1000, 4000, 500);
  const commission = r(rng, 4000, 12000, 1000);
  const rentReceived = r(rng, 6000, 18000, 1200);
  const machinery = r(rng, 50000, 150000, 10000);
  const furniture = r(rng, 20000, 60000, 5000);
  const debtors = r(rng, 40000, 100000, 5000);
  const provision = r(rng, 1000, 4000, 500);
  const creditors = r(rng, 30000, 80000, 5000);
  const cash = r(rng, 2000, 10000, 1000);
  const drawings = r(rng, 12000, 36000, 2000);

  const lines: [ItemId, number][] = [
    ['openingStock', os],
    ['purchases', purchases],
    ...(pr ? ([['purchasesReturn', pr]] as [ItemId, number][]) : []),
    ['sales', sales],
    ...(sr ? ([['salesReturn', sr]] as [ItemId, number][]) : []),
    ['wages', wages],
    ['carriageInwards', carriage],
    ['salaries', salaries],
    ['rent', rent],
    ['insurance', insurance],
    ...(extra ? ([[extra, extraAmount]] as [ItemId, number][]) : []),
    ['badDebts', bad],
    ['commissionReceived', commission],
    ['rentReceived', rentReceived],
    ['machinery', machinery],
    ['furniture', furniture],
    ['debtors', debtors],
    ['provision', provision],
    ['cash', cash],
    ['drawings', drawings],
    ['creditors', creditors],
  ];
  const draft: Business = { id: '', name: '', trade: '', tb: lines.map(([id, amount]) => ({ id, amount })), adjustments: [] };
  const { dr, cr } = trialBalanceTotals(draft);
  // Capital = what the books need, rounded to ₹10,000; the bank balance takes up the rest. Now and then it is an overdraft.
  const gap = dr - cr;
  const spare = r(rng, 5000, 30000, 1000);
  const overdraft = rng.next() < 0.25;
  const capital = overdraft ? Math.floor((gap - spare) / rupees(10000)) * rupees(10000) : Math.ceil((gap + spare) / rupees(10000)) * rupees(10000);
  if (capital < rupees(100000)) return null;
  const bank = capital - gap;
  const tbLines: TbLine[] = [
    ...lines.map(([id, amount]) => ({ id, amount })),
    { id: bank >= 0 ? 'bank' : 'bankOverdraft', amount: Math.abs(bank) },
    { id: 'capital', amount: capital },
  ];
  const adjustments: Adjustment[] = [
    { type: 'closingStock', amount: cs },
    { type: 'outstanding', item: 'salaries', amount: (salaries / 12) * rng.int(1, 2) },
    { type: 'prepaid', item: 'insurance', amount: (insurance / 12) * rng.int(2, 6) },
    { type: 'accrued', item: 'commissionReceived', amount: r(rng, 1000, 3000, 500) },
    { type: 'advance', item: 'rentReceived', amount: (rentReceived / 12) * rng.int(1, 3) },
    { type: 'depreciation', item: 'machinery', rate: rng.pick([10, 15, 20]), months: 12 },
    { type: 'badDebts', further: r(rng, 500, 3000, 500), rate: rng.pick([2, 5, 10]) },
    ...(rng.next() < 0.5 ? [{ type: 'discount', rate: rng.pick([1, 2]) } as Adjustment] : []),
    { type: 'interestOnCapital', rate: rng.pick([5, 6, 8, 10]) },
    { type: 'goodsTaken', amount: r(rng, 1000, 5000, 500) },
    ...(rng.next() < 0.4 ? [{ type: 'goodsGiven', to: rng.pick(['samples', 'staffWelfare'] as const), amount: r(rng, 1000, 4000, 500) } as Adjustment] : []),
    ...(rng.next() < 0.4 ? [abnormal(rng)] : []),
    // The manager's commission last: it is on the profit after every other adjustment.
    { type: 'commission', rate: rng.pick([5, 10]), basis: rng.pick(['before', 'after'] as const) },
  ];
  const name = `${rng.pick(NAMES)} ${tradeName}`;
  const b: Business = { id: `new-${seed}`, name, trade: `${trade} in ${rng.pick(CITIES)}`, tb: tbLines.filter((l) => l.amount > 0), adjustments };
  // A year that ends in a profit after every adjustment, and a gross profit that a shop would believe.
  const after = finalAccounts(b, fullState(b, adjustments));
  if ((after.gross ?? 0) <= 0 || (after.net ?? 0) <= 0 || balanceOf(b, 'capital') * 0.4 < (after.net ?? 0)) return null;
  return b;
}

/** A business made from a seed: the same seed always makes the same business. */
export function newBusiness(seed: number): Business {
  for (let k = 0; k < 40; k++) {
    const b = attempt(createRng(seed * 7919 + k), seed);
    if (b) return b;
  }
  return { ...MEERA, id: `new-${seed}` };
}
