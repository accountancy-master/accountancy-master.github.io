import type { Rng } from '@/engine/rng';
import { rupees, type Paise } from '@/engine/money';
import { creditor, debtor } from '@/engine/accounts';
import { partyBalance, problemOf, recordsOf, type AssetId, type ExpenseId, type GstSetting, type Month, type PettyHead, type Tx } from './model';

// ---------------------------------------------------------------------------------------------------------------
// Ready months for the lab, and months made from a seed. Every figure is a whole number of rupees.
// ---------------------------------------------------------------------------------------------------------------

const R = rupees;

export interface Example {
  id: string;
  title: string;
  month: Month;
}

/** A month without GST: every book, a settlement at a discount each way, two contra entries, petty cash. */
const NAVYA: Month = {
  firm: 'Navya Electricals',
  goods: 'electric fans',
  month: 'April',
  year: 2026,
  lastDay: 30,
  opening: { cash: R(20000), bank: R(60000) },
  owed: { debtors: { 'Mohan Stores': R(1200) }, creditors: {} },
  gst: { rate: 0, intra: true },
  txs: [
    { day: 1, kind: 'imprest', amount: R(3000) },
    { day: 2, kind: 'creditPurchase', party: 'Rao & Co.', list: R(40000), td: 10, no: 101 },
    { day: 4, kind: 'creditSale', party: 'Kiran Stores', list: R(25000), td: 0, no: 51 },
    { day: 5, kind: 'deposit', amount: R(10000) },
    { day: 7, kind: 'purchaseReturn', party: 'Rao & Co.', list: R(4000), td: 10, no: 11 },
    { day: 9, kind: 'petty', head: 'postage', what: 'postage stamps', amount: R(150) },
    { day: 10, kind: 'salesReturn', party: 'Kiran Stores', list: R(2000), td: 0, no: 21 },
    { day: 12, kind: 'assetCredit', asset: 'computers', party: 'Hi-Tech Systems', amount: R(30000) },
    { day: 14, kind: 'cashSale', amount: R(8000), mode: 'cash' },
    { day: 16, kind: 'petty', head: 'conveyance', what: 'an auto fare to the bank', amount: R(120) },
    { day: 18, kind: 'received', party: 'Kiran Stores', amount: R(22500), mode: 'bank', due: R(23000) },
    { day: 20, kind: 'expense', expense: 'rent', amount: R(6000), mode: 'bank' },
    { day: 22, kind: 'petty', head: 'stationery', what: 'pens and file covers', amount: R(230) },
    { day: 24, kind: 'paid', party: 'Rao & Co.', amount: R(32000), mode: 'bank', due: R(32400) },
    { day: 26, kind: 'withdraw', amount: R(5000) },
    { day: 27, kind: 'goodsDrawings', amount: R(1500) },
    { day: 28, kind: 'badDebt', party: 'Mohan Stores', amount: R(1200) },
    { day: 30, kind: 'reimburse' },
  ],
};

/** A month with GST at 18% within the state, opening and closing with an overdraft. */
const KAVYA: Month = {
  firm: 'Kavya Stationers',
  goods: 'notebooks',
  month: 'May',
  year: 2026,
  lastDay: 31,
  opening: { cash: R(15000), bank: -R(12000) },
  owed: { debtors: {}, creditors: { 'Sharma Bros': R(20000) } },
  gst: { rate: 18, intra: true },
  txs: [
    { day: 2, kind: 'creditPurchase', party: 'Lakshmi Traders', list: R(50000), td: 20, no: 310 },
    { day: 3, kind: 'creditSale', party: 'Anand & Sons', list: R(30000), td: 0, no: 71 },
    { day: 6, kind: 'creditSale', party: 'Mehta Bros', list: R(20000), td: 10, no: 72 },
    { day: 8, kind: 'salesReturn', party: 'Mehta Bros', list: R(2000), td: 10, no: 31 },
    { day: 10, kind: 'cashSale', amount: R(6000), mode: 'cash' },
    { day: 12, kind: 'received', party: 'Anand & Sons', amount: R(35000), mode: 'bank', due: R(35400) },
    { day: 14, kind: 'purchaseReturn', party: 'Lakshmi Traders', list: R(5000), td: 20, no: 15 },
    { day: 17, kind: 'paid', party: 'Sharma Bros', amount: R(19500), mode: 'bank', due: R(20000) },
    { day: 20, kind: 'deposit', amount: R(15000) },
    { day: 22, kind: 'assetPaid', asset: 'furniture', amount: R(10000), mode: 'bank' },
    { day: 25, kind: 'expense', expense: 'wages', amount: R(4000), mode: 'cash' },
    { day: 27, kind: 'paid', party: 'Lakshmi Traders', amount: R(20000), mode: 'bank' },
    { day: 28, kind: 'drawings', amount: R(3000), mode: 'bank' },
  ],
};

/** A month with IGST at 5%: a dealer buying from another state. */
const ORBIT: Month = {
  firm: 'Orbit Footwear',
  goods: 'shoes',
  month: 'June',
  year: 2026,
  lastDay: 30,
  opening: { cash: R(12000), bank: R(45000) },
  owed: { debtors: {}, creditors: {} },
  gst: { rate: 5, intra: false },
  txs: [
    { day: 1, kind: 'imprest', amount: R(2000) },
    { day: 3, kind: 'creditPurchase', party: 'Delhi Leather Works', list: R(80000), td: 25, no: 902 },
    { day: 5, kind: 'creditSale', party: 'Patel Shoe Mart', list: R(36000), td: 0, no: 18 },
    { day: 8, kind: 'petty', head: 'refreshments', what: 'tea for visiting buyers', amount: R(180) },
    { day: 11, kind: 'purchaseReturn', party: 'Delhi Leather Works', list: R(8000), td: 25, no: 6 },
    { day: 15, kind: 'cashPurchase', amount: R(4000), mode: 'cash' },
    { day: 18, kind: 'received', party: 'Patel Shoe Mart', amount: R(20000), mode: 'bank' },
    { day: 21, kind: 'assetCredit', asset: 'officeEquipment', party: 'Cool Air Co.', amount: R(24000) },
    { day: 24, kind: 'petty', head: 'postage', what: 'speed post charges', amount: R(260) },
    { day: 26, kind: 'drawings', amount: R(2500), mode: 'cash' },
    { day: 30, kind: 'reimburse' },
  ],
};

export const WATCH_EXAMPLES: readonly Example[] = [
  { id: 'navya', title: 'A month without GST', month: NAVYA },
  { id: 'kavya', title: 'With GST (CGST and SGST 18%) and an overdraft', month: KAVYA },
];

export const EXAMPLES: readonly Example[] = [...WATCH_EXAMPLES, { id: 'orbit', title: 'With IGST 5%', month: ORBIT }];

// ---------------------------------------------------------------------------------------------------------------
// Months from a seed
// ---------------------------------------------------------------------------------------------------------------

const FIRMS: readonly { firm: string; goods: string }[] = [
  { firm: 'Sagar Traders', goods: 'rice bags' },
  { firm: 'Bharat Cycle House', goods: 'bicycles' },
  { firm: 'Meher Textiles', goods: 'cotton sarees' },
  { firm: 'Zoya Crockery', goods: 'dinner sets' },
  { firm: 'Tara Toys', goods: 'wooden toys' },
  { firm: 'Gill Hardware', goods: 'door fittings' },
];
const SUPPLIERS = ['Rao & Co.', 'Sharma Bros', 'Lakshmi Traders', 'Delhi Supply Co.', 'Bose & Sons'];
const CUSTOMERS = ['Kiran Stores', 'Anand & Sons', 'Mehta Bros', 'Patel Mart', 'Gupta Agencies'];
/** The supplier of each kind of asset, so that a computer is not bought from a furniture maker. */
const VENDOR: Record<AssetId, string> = { computers: 'Hi-Tech Systems', officeEquipment: 'Cool Air Co.', furniture: 'Woodcraft Furnishers' };
const MONTHS: readonly [string, number][] = [
  ['April', 30],
  ['May', 31],
  ['June', 30],
  ['July', 31],
  ['August', 31],
];
const PETTY: readonly { head: PettyHead; what: string }[] = [
  { head: 'postage', what: 'postage stamps' },
  { head: 'postage', what: 'registered post fee' },
  { head: 'conveyance', what: 'an auto fare to the bank' },
  { head: 'conveyance', what: 'a taxi fare for a messenger' },
  { head: 'stationery', what: 'printer paper' },
  { head: 'stationery', what: 'a stapler and pins' },
  { head: 'refreshments', what: 'tea for the staff' },
];

const amount = (rng: Rng, lo: number, hi: number, step: number): Paise => R(rng.step(lo, hi, step));

/** A month of 11 to 15 transactions from the seed, every book in use, checked by `problemOf`. */
export function randomMonth(rng: Rng): Month {
  for (let attempt = 0; attempt < 40; attempt++) {
    const m = tryMonth(rng);
    if (m && !problemOf(m)) return m;
  }
  return NAVYA;
}

function tryMonth(rng: Rng): Month | null {
  const { firm, goods } = rng.pick(FIRMS);
  const [month, lastDay] = rng.pick(MONTHS);
  const gst: GstSetting = rng.pick<GstSetting>([
    { rate: 0, intra: true },
    { rate: 0, intra: true },
    { rate: 18, intra: true },
    { rate: 5, intra: true },
    { rate: 18, intra: false },
    { rate: 5, intra: false },
  ]);
  const [s1] = rng.shuffle(SUPPLIERS);
  const [c1, c2] = rng.shuffle(CUSTOMERS);
  const overdraft = rng.next() < 0.2;
  const opening = { cash: amount(rng, 10000, 40000, 1000), bank: overdraft ? -amount(rng, 5000, 20000, 1000) : amount(rng, 30000, 90000, 5000) };
  const petty = rng.next() < 0.7;
  const tdP = rng.pick([0, 10, 20, 25]);
  const tdS = rng.pick([0, 0, 10]);
  type Plain = Tx extends infer T ? (T extends { day: number } ? Omit<T, 'day'> : never) : never;
  const plan: Plain[] = [];
  const buy = amount(rng, 20000, 80000, 4000);
  plan.push({ kind: 'creditPurchase', party: s1, list: buy, td: tdP, no: rng.int(101, 899) });
  const sell = amount(rng, 16000, 60000, 4000);
  plan.push({ kind: 'creditSale', party: c1, list: sell, td: tdS, no: rng.int(11, 99) });
  if (rng.next() < 0.6) plan.push({ kind: 'creditSale', party: c2, list: amount(rng, 8000, 32000, 4000), td: tdS, no: rng.int(11, 99) + 100 });
  if (rng.next() < 0.8) plan.push({ kind: 'purchaseReturn', party: s1, list: amount(rng, 4000, 8000, 4000), td: tdP, no: rng.int(11, 40) });
  if (rng.next() < 0.7) plan.push({ kind: 'salesReturn', party: c1, list: amount(rng, 2000, 6000, 2000), td: tdS, no: rng.int(41, 80) });
  plan.push({ kind: 'cashSale', amount: amount(rng, 4000, 20000, 1000), mode: rng.pick(['cash', 'cash', 'bank'] as const) });
  if (rng.next() < 0.4) plan.push({ kind: 'cashPurchase', amount: amount(rng, 2000, 8000, 1000), mode: 'cash' });
  plan.push(rng.pick<Plain>([{ kind: 'deposit', amount: amount(rng, 5000, 15000, 1000) }, { kind: 'withdraw', amount: amount(rng, 3000, 10000, 1000) }]));
  plan.push({ kind: 'expense', expense: rng.pick<ExpenseId>(['rent', 'wages', 'salaries', 'electricity']), amount: amount(rng, 2000, 9000, 500), mode: rng.pick(['cash', 'bank'] as const) });
  const asset = rng.pick<AssetId>(['furniture', 'computers', 'officeEquipment']);
  plan.push(
    rng.pick<Plain>([
      { kind: 'assetCredit', asset, party: VENDOR[asset], amount: amount(rng, 10000, 40000, 2000) },
      { kind: 'assetPaid', asset: rng.pick<AssetId>(['furniture', 'computers', 'officeEquipment']), amount: amount(rng, 5000, 20000, 1000), mode: 'bank' },
    ]),
  );
  if (rng.next() < 0.5) plan.push(rng.pick<Plain>([{ kind: 'goodsDrawings', amount: amount(rng, 500, 3000, 100) }, { kind: 'drawings', amount: amount(rng, 1000, 5000, 500), mode: rng.pick(['cash', 'bank'] as const) }]));
  const pettyItems = petty ? rng.shuffle(PETTY).slice(0, rng.int(2, 3)) : [];
  const imprest = R(rng.pick([2000, 3000, 5000]));
  const pettyPlan: Plain[] = pettyItems.map((p) => ({ kind: 'petty', head: p.head, what: p.what, amount: amount(rng, 80, 450, 10) }));

  // The order: the dealings first, the settlements of the parties later in the month.
  const early = rng.shuffle(plan);
  const purchase = early.findIndex((t) => t.kind === 'creditPurchase');
  const sale = early.findIndex((t) => t.kind === 'creditSale' && t.party === c1);
  // Returns come after the goods they are of.
  const ordered: Plain[] = [];
  const later: Plain[] = [];
  for (const [i, t] of early.entries()) {
    if ((t.kind === 'purchaseReturn' && i < purchase) || (t.kind === 'salesReturn' && i < sale)) later.push(t);
    else ordered.push(t);
  }
  ordered.splice(Math.min(ordered.length, rng.int(3, 6)), 0, ...later);
  // Petty payments spread through the month.
  for (const p of pettyPlan) ordered.splice(rng.int(1, ordered.length), 0, p);
  const n = ordered.length + 2 + (petty ? 2 : 0);
  if (n > lastDay - 2) return null;
  const days = rng.shuffle(Array.from({ length: lastDay - 3 }, (_, i) => i + 2)).slice(0, ordered.length + 2).sort((a, b) => a - b);
  const txs: Tx[] = [];
  if (petty) txs.push({ day: 1, kind: 'imprest', amount: imprest });
  ordered.forEach((t, i) => txs.push({ ...t, day: days[i] } as Tx));
  const base: Month = { firm, goods, month, year: 2026, lastDay, opening, owed: { debtors: {}, creditors: {} }, gst, txs };
  // The settlements: the customer settles at a cash discount, the supplier is paid (at a discount or on account).
  const records = recordsOf(base);
  const owedBy = partyBalance(base, records, debtor(c1));
  const owedTo = partyBalance(base, records, creditor(s1));
  const pct = rng.pick([2, 4, 5]);
  const disc = R(Math.round((owedBy / 100) * pct / 100));
  txs.push({ day: days[ordered.length], kind: 'received', party: c1, amount: owedBy - disc, mode: rng.pick(['cash', 'bank'] as const), due: owedBy });
  if (rng.next() < 0.5) {
    const d2 = R(Math.round((owedTo / 100) * rng.pick([2, 5]) / 100));
    txs.push({ day: days[ordered.length + 1], kind: 'paid', party: s1, amount: owedTo - d2, mode: 'bank', due: owedTo });
  } else {
    txs.push({ day: days[ordered.length + 1], kind: 'paid', party: s1, amount: R(Math.floor(owedTo / 100 / 2000) * 1000), mode: 'bank' });
  }
  txs.sort((a, b) => a.day - b.day);
  if (petty) txs.push({ day: lastDay, kind: 'reimburse' });
  return { ...base, txs };
}
