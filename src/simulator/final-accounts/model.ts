import { formatINR, type Paise } from '@/engine/money';

// ---------------------------------------------------------------------------------------------------------------
// The lab "From trial balance to final accounts": the accounting of it, as pure functions. A sole proprietor's trial
// balance, the closing stock and the year-end adjustments go in; the Trading Account, the Profit and Loss Account
// and the Balance Sheet come out, in the horizontal form of CBSE Class 11 (NCERT), row by row as the board writes
// them ("To Purchases 2,10,000 / Less: Purchases Return 10,000"). Every figure the screen shows comes from here.
//
// Conventions (stated on the screen too): the year ends on 31 March 2026; amounts worked out by a rate are rounded
// to the nearest rupee; depreciation is on the balance of the asset in the trial balance (for the months since it was
// bought, when it was bought during the year) and written off the asset; interest on capital is on the capital in
// the trial balance (no capital was brought in during the year); the provision for doubtful debts is made on the
// debtors left after the further bad debts, and bad debts with the change in the provision are one charge, "Bad
// Debts"; the provision for discount on debtors is made on the debtors left after the bad debts and the provision
// for doubtful debts; goods taken by the proprietor, given away or lost by fire leave Purchases at cost; the
// manager's commission is worked out last, on the net profit after every other adjustment; the Balance Sheet is in
// the order of permanence. Interest on drawings is not in the CBSE 2025-26 list of adjustments for Class 11, so the
// lab has none.
// ---------------------------------------------------------------------------------------------------------------

export const YEAR_END = '31 March 2026';

export type Kind =
  | 'openingStock'
  | 'purchases'
  | 'purchasesReturn'
  | 'sales'
  | 'salesReturn'
  | 'directExpense'
  | 'indirectExpense'
  | 'badDebts'
  | 'income'
  | 'fixedAsset'
  | 'debtors'
  | 'currentAsset'
  | 'provision'
  | 'capital'
  | 'drawings'
  | 'liability';

/** The kinds whose balance stands in the debit column of a trial balance; the others stand in the credit column. */
const DEBIT_KINDS: readonly Kind[] = ['openingStock', 'purchases', 'salesReturn', 'directExpense', 'indirectExpense', 'badDebts', 'fixedAsset', 'debtors', 'currentAsset', 'drawings'];

export interface ItemSpec {
  label: string;
  kind: Kind;
  /** Why it goes where it goes, in one sentence. */
  why: string;
  /** For an income: the short name of an amount of it accrued ("Commission" in "Accrued Commission"). */
  short?: string;
}

const direct = (label: string, why: string): ItemSpec => ({ label, kind: 'directExpense', why });
const indirect = (label: string, why: string): ItemSpec => ({ label, kind: 'indirectExpense', why });
const income = (label: string, short: string): ItemSpec => ({
  label,
  kind: 'income',
  short,
  why: `${label} is an income other than sales: it is earned by the business but not by trading in the goods, so it goes to the credit side of the Profit and Loss Account.`,
});
const fixed = (label: string): ItemSpec => ({ label, kind: 'fixedAsset', why: `${label} is owned for use over many years, not for sale: a fixed asset, on the assets side of the Balance Sheet.` });

/** Every account the lab knows, in the order the statements list them (the Balance Sheet in the order of permanence). */
export const ITEMS = {
  openingStock: { label: 'Opening Stock', kind: 'openingStock', why: 'The stock the year began with is part of the goods available for sale, so it is a cost of the goods: the debit side of the Trading Account.' },
  purchases: { label: 'Purchases', kind: 'purchases', why: 'Goods bought for resale are the main cost of the goods: the debit side of the Trading Account.' },
  purchasesReturn: { label: 'Purchases Return', kind: 'purchasesReturn', why: 'Goods sent back to suppliers reduce the purchases: the return is deducted from Purchases on the debit side of the Trading Account.' },
  sales: { label: 'Sales', kind: 'sales', why: 'Sales are what the goods brought in: the credit side of the Trading Account.' },
  salesReturn: { label: 'Sales Return', kind: 'salesReturn', why: 'Goods sent back by customers reduce the sales: the return is deducted from Sales on the credit side of the Trading Account.' },
  wages: direct('Wages', 'Wages paid to get the goods ready for sale are a direct expense, a cost of the goods: the debit side of the Trading Account.'),
  carriageInwards: direct('Carriage Inwards', 'Carriage inwards brings the purchased goods in: a direct expense, on the debit side of the Trading Account.'),
  powerAndFuel: direct('Power and Fuel', 'Power and fuel used in making the goods are a direct expense, on the debit side of the Trading Account.'),
  salaries: indirect('Salaries', 'Salaries are a cost of running the business, not of the goods: an indirect expense, on the debit side of the Profit and Loss Account.'),
  rent: indirect('Rent', 'Rent of the shop is a cost of running the business: an indirect expense, on the debit side of the Profit and Loss Account.'),
  insurance: indirect('Insurance', 'Insurance is a cost of running the business: an indirect expense, on the debit side of the Profit and Loss Account.'),
  advertisement: indirect('Advertisement', 'Advertisement is a selling expense: indirect, on the debit side of the Profit and Loss Account.'),
  carriageOutwards: indirect('Carriage Outwards', 'Carriage outwards takes goods already sold to customers: a selling expense, so it is indirect, on the debit side of the Profit and Loss Account, whatever its name.'),
  interestOnLoan: indirect('Interest on Loan', 'Interest on a loan is a cost of the money borrowed, not of the goods: an indirect expense, on the debit side of the Profit and Loss Account.'),
  badDebts: { label: 'Bad Debts', kind: 'badDebts', why: 'Bad debts are a loss of the business, not a cost of the goods: the debit side of the Profit and Loss Account.' },
  commissionReceived: income('Commission Received', 'Commission'),
  rentReceived: income('Rent Received', 'Rent'),
  interestReceived: income('Interest Received', 'Interest'),
  discountReceived: income('Discount Received', 'Discount'),
  landAndBuilding: fixed('Land and Building'),
  machinery: fixed('Machinery'),
  vehicles: fixed('Vehicles'),
  furniture: fixed('Furniture'),
  debtors: { label: 'Sundry Debtors', kind: 'debtors', why: 'Customers owe this amount to the business: a current asset, on the assets side of the Balance Sheet.' },
  billsReceivable: { label: 'Bills Receivable', kind: 'currentAsset', why: 'Bills to be received soon are a current asset, on the assets side of the Balance Sheet.' },
  bank: { label: 'Cash at Bank', kind: 'currentAsset', why: 'Money of the business at the bank is a current asset, on the assets side of the Balance Sheet.' },
  cash: { label: 'Cash in Hand', kind: 'currentAsset', why: 'Cash in hand is a current asset, on the assets side of the Balance Sheet.' },
  provision: {
    label: 'Provision for Doubtful Debts',
    kind: 'provision',
    why: 'A provision for debts that may not be paid is deducted from Sundry Debtors on the assets side of the Balance Sheet; it is not a liability.',
  },
  capital: { label: 'Capital', kind: 'capital', why: 'Capital is what the business owes its proprietor: the liabilities side of the Balance Sheet.' },
  drawings: {
    label: 'Drawings',
    kind: 'drawings',
    why: 'Drawings are what the proprietor took out for personal use: they are deducted from capital on the liabilities side of the Balance Sheet. They are not an expense of the business.',
  },
  bankLoan: { label: 'Bank Loan', kind: 'liability', why: 'A loan to be repaid after some years is a long-term liability, on the liabilities side of the Balance Sheet.' },
  creditors: { label: 'Sundry Creditors', kind: 'liability', why: 'Suppliers are owed this amount: a current liability, on the liabilities side of the Balance Sheet.' },
  billsPayable: { label: 'Bills Payable', kind: 'liability', why: 'Bills to be paid soon are a current liability, on the liabilities side of the Balance Sheet.' },
  bankOverdraft: {
    label: 'Bank Overdraft',
    kind: 'liability',
    why: 'The business has drawn more from the bank than it had there and owes the difference: a current liability, on the liabilities side of the Balance Sheet.',
  },
} as const satisfies Record<string, ItemSpec>;

export type ItemId = keyof typeof ITEMS;
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export const itemSpec = (id: ItemId): ItemSpec => ITEMS[id];
export const sideOfItem = (id: ItemId): 'Dr' | 'Cr' => (DEBIT_KINDS.includes(ITEMS[id].kind) ? 'Dr' : 'Cr');

export interface TbLine {
  id: ItemId;
  /** The balance, always positive; its column follows from the kind of the account. */
  amount: Paise;
}

/** A year-end adjustment: something known on 31 March that the trial balance does not yet show. */
export type Adjustment =
  | { type: 'closingStock'; amount: Paise }
  | { type: 'outstanding'; item: ItemId; amount: Paise }
  | { type: 'prepaid'; item: ItemId; amount: Paise }
  | { type: 'accrued'; item: ItemId; amount: Paise }
  | { type: 'advance'; item: ItemId; amount: Paise }
  /**
   * At `rate`% a year on the balance of the trial balance, for `months` of the year: 12 for an asset held all year,
   * fewer for one bought during the year (on the first day of a month) and shown at its cost.
   */
  | { type: 'depreciation'; item: ItemId; rate: number; months: number }
  /** Further bad debts written off, then a provision of `rate`% on the debtors that remain. */
  | { type: 'badDebts'; further: Paise; rate: number }
  /** A provision for discount on debtors at `rate`%, on the debtors left after the bad debts and the provision for doubtful debts. */
  | { type: 'discount'; rate: number }
  | { type: 'interestOnCapital'; rate: number }
  /** Goods taken by the proprietor for personal use, at cost. */
  | { type: 'goodsTaken'; amount: Paise }
  /** Goods given away as free samples or to the staff for their welfare, at cost. */
  | { type: 'goodsGiven'; to: GoodsGivenTo; amount: Paise }
  /** Goods costing `amount` destroyed by fire (an abnormal loss); `claim` is what the insurance company admitted. */
  | { type: 'abnormalLoss'; amount: Paise; claim: Paise }
  /** The manager's commission at `rate`% of the net profit before or after charging it, worked out after every other adjustment; unpaid. */
  | { type: 'commission'; rate: number; basis: 'before' | 'after' };

export type GoodsGivenTo = 'samples' | 'staffWelfare';

export type AdjustmentType = Adjustment['type'];

/** One key for each adjustment of a business: "outstanding:salaries", "closingStock". */
export const adjKey = (a: Adjustment): string => ('item' in a ? `${a.type}:${a.item}` : a.type === 'goodsGiven' ? `${a.type}:${a.to}` : a.type);

export interface Business {
  id: string;
  /** "Meera Textiles". */
  name: string;
  /** "a cloth shop". */
  trade: string;
  tb: TbLine[];
  /** The adjustments of the year, closing stock first, in the order they are told. */
  adjustments: Adjustment[];
}

/** Rounded to the nearest rupee. */
export const toRupee = (p: number): Paise => Math.round(p / 100) * 100;
const inr = formatINR;

export const balanceOf = (b: Business, id: ItemId): Paise => b.tb.find((l) => l.id === id)?.amount ?? 0;
export const hasItem = (b: Business, id: ItemId): boolean => b.tb.some((l) => l.id === id);

/** The two columns of the trial balance. */
export function trialBalanceTotals(b: Business): { dr: Paise; cr: Paise } {
  let dr = 0;
  let cr = 0;
  for (const l of b.tb) {
    if (sideOfItem(l.id) === 'Dr') dr += l.amount;
    else cr += l.amount;
  }
  return { dr, cr };
}

// ---- the figure of each adjustment ----

/** Depreciation for the year: the balance × rate × months / 12, to the nearest rupee. */
export const depreciationOf = (b: Business, a: { item: ItemId; rate: number; months: number }): Paise => toRupee((balanceOf(b, a.item) * a.rate * a.months) / 1200);
/** The new provision for doubtful debts: rate% of the debtors left after the further bad debts. */
export const newProvisionOf = (b: Business, a: { further: Paise; rate: number }): Paise => toRupee(((balanceOf(b, 'debtors') - a.further) * a.rate) / 100);
export const interestOnCapitalOf = (b: Business, a: { rate: number }): Paise => toRupee((balanceOf(b, 'capital') * a.rate) / 100);

/** The debtors a provision for discount is made on: those left after the further bad debts and the provision for doubtful debts (the old one, when no new one is made). */
export function discountBaseOf(b: Business, made: readonly Adjustment[]): Paise {
  const bad = made.find((x) => x.type === 'badDebts');
  return balanceOf(b, 'debtors') - (bad ? bad.further + newProvisionOf(b, bad) : balanceOf(b, 'provision'));
}
export const discountOf = (b: Business, a: { rate: number }, made: readonly Adjustment[]): Paise => toRupee((discountBaseOf(b, made) * a.rate) / 100);

/** The manager's commission on `profit`, the net profit before charging it: nothing when there is no profit. */
export const commissionOn = (profit: Paise, a: { rate: number; basis: 'before' | 'after' }): Paise =>
  profit <= 0 ? 0 : toRupee((profit * a.rate) / (a.basis === 'after' ? 100 + a.rate : 100));

/** The manager's commission with these adjustments made (every other one, and this one last): the profit it is on, and the amount. */
export function commissionIn(b: Business, a: Extract<Adjustment, { type: 'commission' }>, made: readonly Adjustment[]): { profit: Paise; amount: Paise } {
  const st = finalAccounts(b, fullState(b, [...made.filter((x) => x.type !== 'commission'), a]));
  return st.commission ?? { profit: 0, amount: 0 };
}

/** The charge to the Profit and Loss Account for bad debts: bad debts of the trial balance + further + new provision − old provision (negative: an excess written back). */
export function badDebtsChargeOf(b: Business, a: { further: Paise; rate: number }): Paise {
  return balanceOf(b, 'badDebts') + a.further + newProvisionOf(b, a) - balanceOf(b, 'provision');
}

/** The largest amount an adjustment may take on these books (an expense cannot be prepaid by more than was paid). */
export function limitOf(b: Business, a: Adjustment): Paise {
  const MAX = 1_00_00_000_00; // ₹1 crore
  switch (a.type) {
    case 'prepaid':
    case 'advance':
      return balanceOf(b, a.item);
    case 'badDebts':
      return balanceOf(b, 'debtors');
    case 'goodsTaken':
    case 'goodsGiven':
    case 'abnormalLoss':
      return balanceOf(b, 'purchases') - balanceOf(b, 'purchasesReturn');
    default:
      return MAX;
  }
}

/** An adjustment brought within what the books allow: amounts and rates not negative and not past their limit. */
export function clampAdjustment(b: Business, a: Adjustment): Adjustment {
  const money = (x: Paise) => Math.min(Math.max(0, toRupee(Number.isFinite(x) ? x : 0)), limitOf(b, a));
  const rate = (r: number) => Math.min(100, Math.max(0, Number.isFinite(r) ? Math.round(r * 100) / 100 : 0));
  const months = (m: number) => Math.min(12, Math.max(1, Number.isFinite(m) ? Math.round(m) : 12));
  switch (a.type) {
    case 'depreciation':
      return { ...a, rate: rate(a.rate), months: months(a.months) };
    case 'badDebts':
      return { ...a, further: money(a.further), rate: rate(a.rate) };
    case 'discount':
    case 'interestOnCapital':
      return { ...a, rate: rate(a.rate) };
    case 'commission':
      return { ...a, rate: rate(a.rate), basis: a.basis === 'before' ? 'before' : 'after' };
    case 'abnormalLoss': {
      const amount = money(a.amount);
      return { ...a, amount, claim: Math.min(amount, Math.max(0, toRupee(Number.isFinite(a.claim) ? a.claim : 0))) };
    }
    default:
      return { ...a, amount: money(a.amount) };
  }
}

// ---- the statements ----

/** Where a balance or an effect lands. */
export type Spot = 'trading-dr' | 'trading-cr' | 'pl-dr' | 'pl-cr' | 'bs-liabilities' | 'bs-assets';
export const SPOTS: readonly Spot[] = ['trading-dr', 'trading-cr', 'pl-dr', 'pl-cr', 'bs-liabilities', 'bs-assets'];
export const SPOT_NAMES: Record<Spot, string> = {
  'trading-dr': 'Trading Account, debit side',
  'trading-cr': 'Trading Account, credit side',
  'pl-dr': 'Profit and Loss Account, debit side',
  'pl-cr': 'Profit and Loss Account, credit side',
  'bs-liabilities': 'Balance Sheet, liabilities side',
  'bs-assets': 'Balance Sheet, assets side',
};

/** One line of a row: the base figure, or an "Add:" or "Less:" under it. */
export interface Part {
  /** Unique on the page: the screen finds it by this key to fly it in. */
  key: string;
  text: string;
  amount: Paise;
  sign: 1 | -1;
  /** The key of the place it comes from: a trial balance line (`tb:<id>`), an adjustment (`adj:<key>`) or another row. */
  source: string;
}

export interface Row {
  key: string;
  /** The particulars, without "To" or "By". */
  label: string;
  parts: Part[];
  /** The figure in the outer column: the parts added up. */
  amount: Paise;
  /** A balancing row: gross profit c/d, net profit transferred. */
  closing?: boolean;
}

export interface Side {
  rows: Row[];
  total: Paise;
}

export interface Statements {
  trading: { dr: Side; cr: Side; closed: boolean };
  pl: { dr: Side; cr: Side; closed: boolean };
  bs: { liabilities: Side; assets: Side; closed: boolean };
  /** Gross profit (negative: a gross loss), once the Trading Account is closed. */
  gross: Paise | null;
  /** Net profit (negative: a net loss), once the Profit and Loss Account is closed. */
  net: Paise | null;
  /** The capital at the end of the year, once the Profit and Loss Account is closed. */
  capital: Paise | null;
  /** The manager's commission, when it is made and the gross profit is known: the net profit before it, and the commission. */
  commission: { profit: Paise; amount: Paise } | null;
}

/** What is on the picture: the balances placed so far, the adjustments made, and the accounts closed. */
export interface FaState {
  placed: ReadonlySet<ItemId>;
  adjustments: readonly Adjustment[];
  closeTrading: boolean;
  /** Closes the Profit and Loss Account and carries the net profit to capital; needs `closeTrading`. */
  closePL: boolean;
}

/** Everything placed and closed, with these adjustments. */
export const fullState = (b: Business, adjustments: readonly Adjustment[]): FaState => ({
  placed: new Set(b.tb.map((l) => l.id)),
  adjustments,
  closeTrading: true,
  closePL: true,
});

const part = (key: string, text: string, amount: Paise, sign: 1 | -1, source: string): Part => ({ key, text, amount, sign, source });
const sumParts = (parts: readonly Part[]): Paise => parts.reduce((s, p) => s + p.sign * p.amount, 0);
const row = (label: string, parts: Part[], closing = false): Row => ({ key: parts[0].key, label, parts, amount: sumParts(parts), ...(closing ? { closing } : {}) });
const side = (rows: Row[]): Side => ({ rows, total: rows.reduce((s, r) => s + r.amount, 0) });
const idsOfKind = (b: Business, kind: Kind): ItemId[] => ITEM_IDS.filter((id) => ITEMS[id].kind === kind && hasItem(b, id));

export const GROSS_PROFIT_CD = 'Gross Profit c/d';
export const GROSS_LOSS_CD = 'Gross Loss c/d';
export const GROSS_PROFIT_BD = 'Gross Profit b/d';
export const GROSS_LOSS_BD = 'Gross Loss b/d';
export const NET_PROFIT_TO_CAPITAL = 'Net Profit transferred to Capital A/c';
export const NET_LOSS_TO_CAPITAL = 'Net Loss transferred to Capital A/c';

/** "Outstanding Salaries", "Prepaid Insurance", "Accrued Commission", "Rent Received in Advance". */
export const outstandingName = (id: ItemId) => `Outstanding ${ITEMS[id].label}`;
export const prepaidName = (id: ItemId) => `Prepaid ${ITEMS[id].label}`;
export const accruedName = (id: ItemId) => `Accrued ${(ITEMS[id] as ItemSpec).short ?? ITEMS[id].label}`;
export const advanceName = (id: ItemId) => `${ITEMS[id].label} in Advance`;
export const depreciationName = (id: ItemId) => `Depreciation on ${ITEMS[id].label}`;
export const COMMISSION = "Manager's Commission";
export const COMMISSION_OWED = "Outstanding Manager's Commission";
export const DISCOUNT_PROVISION = 'Provision for Discount on Debtors';
export const LOSS_BY_FIRE = 'Loss by Fire';
export const CLAIM = 'Insurance Claim Receivable';
export const STAFF_WELFARE = 'Staff Welfare Expenses';
export const SAMPLES_ROW = 'Advertisement (free samples)';
/** What the Purchases row says of goods that left without being sold. */
const GOODS_GIVEN_LINE: Record<GoodsGivenTo, string> = { samples: 'Less: Goods given as free samples', staffWelfare: 'Less: Goods given for staff welfare' };

/** The final accounts of a business in a state: only what is placed is shown, and an account is balanced only once closed. */
export function finalAccounts(b: Business, s: FaState): Statements {
  const placed = (id: ItemId) => hasItem(b, id) && s.placed.has(id);
  const amt = (id: ItemId) => balanceOf(b, id);
  const find = <T extends AdjustmentType>(type: T, item?: ItemId) =>
    s.adjustments.find((a) => a.type === type && (item === undefined || ('item' in a && a.item === item))) as Extract<Adjustment, { type: T }> | undefined;
  const all = <T extends AdjustmentType>(type: T) => s.adjustments.filter((a) => a.type === type) as Extract<Adjustment, { type: T }>[];
  const given = (to: GoodsGivenTo) => all('goodsGiven').find((g) => g.to === to && g.amount > 0);
  const samples = given('samples');
  const fire = find('abnormalLoss');

  /** An expense or an income row with what the adjustments add to it or take from it. */
  const nominalRow = (prefix: string, id: ItemId): Row => {
    const parts = [part(`${prefix}:${id}`, ITEMS[id].label, amt(id), 1, `tb:${id}`)];
    const out = find('outstanding', id);
    const pre = find('prepaid', id);
    const acc = find('accrued', id);
    const adv = find('advance', id);
    if (out && out.amount > 0) parts.push(part(`${prefix}:${id}:outstanding`, 'Add: Outstanding', out.amount, 1, `adj:${adjKey(out)}`));
    if (pre && pre.amount > 0) parts.push(part(`${prefix}:${id}:prepaid`, 'Less: Prepaid', pre.amount, -1, `adj:${adjKey(pre)}`));
    if (acc && acc.amount > 0) parts.push(part(`${prefix}:${id}:accrued`, 'Add: Accrued', acc.amount, 1, `adj:${adjKey(acc)}`));
    if (adv && adv.amount > 0) parts.push(part(`${prefix}:${id}:advance`, 'Less: Received in Advance', adv.amount, -1, `adj:${adjKey(adv)}`));
    if (id === 'advertisement' && samples) parts.push(part(`${prefix}:${id}:samples`, 'Add: Free samples', samples.amount, 1, `adj:${adjKey(samples)}`));
    return row(ITEMS[id].label, parts);
  };
  const plainRow = (prefix: string, id: ItemId): Row => row(ITEMS[id].label, [part(`${prefix}:${id}`, ITEMS[id].label, amt(id), 1, `tb:${id}`)]);

  // ---- Trading Account ----
  const trDr: Row[] = [];
  const trCr: Row[] = [];
  if (placed('openingStock')) trDr.push(plainRow('tr', 'openingStock'));
  if (placed('purchases')) {
    const parts = [part('tr:purchases', 'Purchases', amt('purchases'), 1, 'tb:purchases')];
    if (placed('purchasesReturn')) parts.push(part('tr:purchasesReturn', 'Less: Purchases Return', amt('purchasesReturn'), -1, 'tb:purchasesReturn'));
    // Goods that left without being sold come out of Purchases at cost: taken by the proprietor, given away, lost by fire.
    const goods = find('goodsTaken');
    if (goods && goods.amount > 0) parts.push(part('tr:goodsTaken', 'Less: Goods taken for personal use', goods.amount, -1, 'adj:goodsTaken'));
    for (const g of all('goodsGiven')) if (g.amount > 0) parts.push(part(`tr:goodsGiven:${g.to}`, GOODS_GIVEN_LINE[g.to], g.amount, -1, `adj:${adjKey(g)}`));
    if (fire && fire.amount > 0) parts.push(part('tr:abnormalLoss', 'Less: Goods lost by fire', fire.amount, -1, 'adj:abnormalLoss'));
    trDr.push(row('Purchases', parts));
  }
  for (const id of idsOfKind(b, 'directExpense')) if (placed(id)) trDr.push(nominalRow('tr', id));
  if (placed('sales')) {
    const parts = [part('tr:sales', 'Sales', amt('sales'), 1, 'tb:sales')];
    if (placed('salesReturn')) parts.push(part('tr:salesReturn', 'Less: Sales Return', amt('salesReturn'), -1, 'tb:salesReturn'));
    trCr.push(row('Sales', parts));
  }
  const stock = find('closingStock');
  if (stock && stock.amount > 0) trCr.push(row('Closing Stock', [part('tr:closingStock', 'Closing Stock', stock.amount, 1, 'adj:closingStock')]));

  let gross: Paise | null = null;
  if (s.closeTrading) {
    gross = side(trCr).total - side(trDr).total;
    if (gross > 0) trDr.push(row(GROSS_PROFIT_CD, [part('tr:gp', GROSS_PROFIT_CD, gross, 1, '')], true));
    if (gross < 0) trCr.push(row(GROSS_LOSS_CD, [part('tr:gl', GROSS_LOSS_CD, -gross, 1, '')], true));
  }

  // ---- Profit and Loss Account ----
  const plDr: Row[] = [];
  const plCr: Row[] = [];
  if (gross !== null && gross < 0) plDr.push(row(GROSS_LOSS_BD, [part('pl:gl', GROSS_LOSS_BD, -gross, 1, 'tr:gl')]));
  if (gross !== null && gross > 0) plCr.push(row(GROSS_PROFIT_BD, [part('pl:gp', GROSS_PROFIT_BD, gross, 1, 'tr:gp')]));
  for (const id of idsOfKind(b, 'indirectExpense')) if (placed(id)) plDr.push(nominalRow('pl', id));
  // Goods given away: free samples are advertisement (added to it when the trial balance has it), goods given to the staff a welfare expense.
  if (samples && !hasItem(b, 'advertisement')) plDr.push(row(SAMPLES_ROW, [part('pl:goodsGiven:samples', SAMPLES_ROW, samples.amount, 1, `adj:${adjKey(samples)}`)]));
  const welfare = given('staffWelfare');
  if (welfare) plDr.push(row(STAFF_WELFARE, [part('pl:goodsGiven:staffWelfare', STAFF_WELFARE, welfare.amount, 1, `adj:${adjKey(welfare)}`)]));

  // Bad debts and the provision: one charge (or, when the old provision is more than enough, an excess written back).
  const bad = find('badDebts');
  const oldProvision = placed('provision') ? amt('provision') : 0;
  const tbBad = placed('badDebts') ? amt('badDebts') : 0;
  let newProvision = 0;
  if (bad && placed('debtors')) {
    newProvision = newProvisionOf(b, bad);
    const charge = tbBad + bad.further + newProvision - oldProvision;
    if (charge >= 0) {
      const lines: Part[] = [
        ...(tbBad ? [part('pl:badDebts', 'Bad Debts', tbBad, 1, 'tb:badDebts')] : []),
        ...(bad.further ? [part('pl:badDebts:further', tbBad ? 'Add: Further Bad Debts' : 'Further Bad Debts', bad.further, 1, 'adj:badDebts')] : []),
        ...(newProvision ? [part('pl:badDebts:new', 'Add: New Provision for Doubtful Debts', newProvision, 1, 'adj:badDebts')] : []),
        ...(oldProvision ? [part('pl:badDebts:old', 'Less: Old Provision for Doubtful Debts', oldProvision, -1, 'tb:provision')] : []),
      ];
      if (lines.length > 0) {
        // The first line is the base: it carries no "Add:".
        lines[0] = { ...lines[0], text: lines[0].text.replace(/^Add: /, '') };
        plDr.push(row(tbBad || bad.further ? 'Bad Debts' : 'Provision for Doubtful Debts', lines));
      }
    } else {
      plCr.push(
        row('Old Provision for Doubtful Debts', [
          part('pl:provision:old', 'Old Provision for Doubtful Debts', oldProvision, 1, 'tb:provision'),
          ...(tbBad ? [part('pl:provision:bad', 'Less: Bad Debts', tbBad, -1, 'tb:badDebts')] : []),
          ...(bad.further ? [part('pl:provision:further', 'Less: Further Bad Debts', bad.further, -1, 'adj:badDebts')] : []),
          ...(newProvision ? [part('pl:provision:new', 'Less: New Provision for Doubtful Debts', newProvision, -1, 'adj:badDebts')] : []),
        ]),
      );
    }
  } else if (tbBad) {
    plDr.push(plainRow('pl', 'badDebts'));
  }
  // The provision for discount, on the debtors left after the bad debts and the provision for doubtful debts.
  const disc = find('discount');
  const discAmount = disc && placed('debtors') ? discountOf(b, disc, s.adjustments) : 0;
  if (discAmount > 0) plDr.push(row(DISCOUNT_PROVISION, [part('pl:discount', DISCOUNT_PROVISION, discAmount, 1, 'adj:discount')]));
  for (const d of all('depreciation')) {
    const x = depreciationOf(b, d);
    if (placed(d.item) && x > 0) plDr.push(row(depreciationName(d.item), [part(`pl:depreciation:${d.item}`, depreciationName(d.item), x, 1, `adj:${adjKey(d)}`)]));
  }
  const ioc = find('interestOnCapital');
  const iocAmount = ioc && placed('capital') ? interestOnCapitalOf(b, ioc) : 0;
  if (iocAmount > 0) plDr.push(row('Interest on Capital', [part('pl:interestOnCapital', 'Interest on Capital', iocAmount, 1, 'adj:interestOnCapital')]));

  // Goods lost by fire: the part the insurance company will not pay is a loss of the year.
  const claim = fire && fire.amount > 0 ? Math.min(fire.claim, fire.amount) : 0;
  if (fire && fire.amount > claim)
    plDr.push(
      row(LOSS_BY_FIRE, [
        part('pl:abnormalLoss', LOSS_BY_FIRE, fire.amount, 1, 'adj:abnormalLoss'),
        ...(claim > 0 ? [part('pl:abnormalLoss:claim', 'Less: Insurance claim admitted', claim, -1, 'adj:abnormalLoss')] : []),
      ]),
    );

  for (const id of idsOfKind(b, 'income')) if (placed(id)) plCr.push(nominalRow('pl', id));

  // The manager's commission, last: on the net profit after every other item, before or after charging it.
  const comm = find('commission');
  let commission: { profit: Paise; amount: Paise } | null = null;
  if (comm && gross !== null) {
    const profit = side(plCr).total - side(plDr).total;
    commission = { profit, amount: commissionOn(profit, comm) };
    if (commission.amount > 0) plDr.push(row(COMMISSION, [part('pl:commission', COMMISSION, commission.amount, 1, 'adj:commission')]));
  }

  let net: Paise | null = null;
  if (s.closeTrading && s.closePL) {
    net = side(plCr).total - side(plDr).total;
    if (net > 0) plDr.push(row(NET_PROFIT_TO_CAPITAL, [part('pl:np', NET_PROFIT_TO_CAPITAL, net, 1, '')], true));
    if (net < 0) plCr.push(row(NET_LOSS_TO_CAPITAL, [part('pl:nl', NET_LOSS_TO_CAPITAL, -net, 1, '')], true));
  }

  // ---- Balance Sheet, in the order of permanence ----
  const liabilities: Row[] = [];
  const assets: Row[] = [];
  let capital: Paise | null = null;
  if (placed('capital')) {
    const parts = [part('bs:capital', 'Capital', amt('capital'), 1, 'tb:capital')];
    if (iocAmount > 0) parts.push(part('bs:capital:interestOnCapital', 'Add: Interest on Capital', iocAmount, 1, 'adj:interestOnCapital'));
    if (net !== null && net > 0) parts.push(part('bs:capital:np', 'Add: Net Profit', net, 1, 'pl:np'));
    if (net !== null && net < 0) parts.push(part('bs:capital:nl', 'Less: Net Loss', -net, -1, 'pl:nl'));
    if (placed('drawings')) parts.push(part('bs:capital:drawings', 'Less: Drawings', amt('drawings'), -1, 'tb:drawings'));
    const goods = find('goodsTaken');
    if (goods && goods.amount > 0) parts.push(part('bs:capital:goodsTaken', 'Less: Goods taken for personal use', goods.amount, -1, 'adj:goodsTaken'));
    const r = row('Capital', parts);
    liabilities.push(r);
    if (net !== null) capital = r.amount;
  }
  for (const id of idsOfKind(b, 'liability')) if (placed(id)) liabilities.push(plainRow('bs', id));
  for (const a of all('outstanding'))
    if (placed(a.item) && a.amount > 0) liabilities.push(row(outstandingName(a.item), [part(`bs:outstanding:${a.item}`, outstandingName(a.item), a.amount, 1, `adj:${adjKey(a)}`)]));
  for (const a of all('advance'))
    if (placed(a.item) && a.amount > 0) liabilities.push(row(advanceName(a.item), [part(`bs:advance:${a.item}`, advanceName(a.item), a.amount, 1, `adj:${adjKey(a)}`)]));
  if (commission && commission.amount > 0) liabilities.push(row(COMMISSION_OWED, [part('bs:commission', COMMISSION_OWED, commission.amount, 1, 'adj:commission')]));

  for (const id of idsOfKind(b, 'fixedAsset')) {
    if (!placed(id)) continue;
    const parts = [part(`bs:${id}`, ITEMS[id].label, amt(id), 1, `tb:${id}`)];
    const d = find('depreciation', id);
    const x = d ? depreciationOf(b, d) : 0;
    if (d && x > 0) parts.push(part(`bs:${id}:depreciation`, 'Less: Depreciation', x, -1, `adj:${adjKey(d)}`));
    assets.push(row(ITEMS[id].label, parts));
  }
  for (const a of all('prepaid'))
    if (placed(a.item) && a.amount > 0) assets.push(row(prepaidName(a.item), [part(`bs:prepaid:${a.item}`, prepaidName(a.item), a.amount, 1, `adj:${adjKey(a)}`)]));
  for (const a of all('accrued'))
    if (placed(a.item) && a.amount > 0) assets.push(row(accruedName(a.item), [part(`bs:accrued:${a.item}`, accruedName(a.item), a.amount, 1, `adj:${adjKey(a)}`)]));
  if (stock && stock.amount > 0) assets.push(row('Closing Stock', [part('bs:closingStock', 'Closing Stock', stock.amount, 1, 'adj:closingStock')]));
  if (placed('debtors')) {
    const parts = [part('bs:debtors', 'Sundry Debtors', amt('debtors'), 1, 'tb:debtors')];
    if (bad) {
      if (bad.further) parts.push(part('bs:debtors:further', 'Less: Further Bad Debts', bad.further, -1, 'adj:badDebts'));
      if (newProvision) parts.push(part('bs:debtors:provision:new', 'Less: Provision for Doubtful Debts', newProvision, -1, 'adj:badDebts'));
    } else if (oldProvision) {
      parts.push(part('bs:debtors:provision', 'Less: Provision for Doubtful Debts', oldProvision, -1, 'tb:provision'));
    }
    if (discAmount > 0) parts.push(part('bs:debtors:discount', 'Less: Provision for Discount', discAmount, -1, 'adj:discount'));
    assets.push(row('Sundry Debtors', parts));
  }
  if (claim > 0) assets.push(row(CLAIM, [part('bs:claim', CLAIM, claim, 1, 'adj:abnormalLoss')]));
  for (const id of idsOfKind(b, 'currentAsset')) if (placed(id)) assets.push(plainRow('bs', id));

  return {
    trading: { dr: side(trDr), cr: side(trCr), closed: gross !== null },
    pl: { dr: side(plDr), cr: side(plCr), closed: net !== null },
    bs: { liabilities: side(liabilities), assets: side(assets), closed: net !== null },
    gross,
    net,
    capital,
    commission,
  };
}

/** Every row of the statements, with the spot it stands on. */
export function rowsOf(st: Statements): { spot: Spot; row: Row }[] {
  const at = (spot: Spot, s: Side) => s.rows.map((row) => ({ spot, row }));
  return [
    ...at('trading-dr', st.trading.dr),
    ...at('trading-cr', st.trading.cr),
    ...at('pl-dr', st.pl.dr),
    ...at('pl-cr', st.pl.cr),
    ...at('bs-liabilities', st.bs.liabilities),
    ...at('bs-assets', st.bs.assets),
  ];
}

/** Every part on the statements, by key: what the screen compares between two states to see what arrived and what changed. */
export function partsOf(st: Statements): Map<string, Part> {
  const out = new Map<string, Part>();
  for (const { row } of rowsOf(st)) for (const p of row.parts) out.set(p.key, p);
  return out;
}

// ---- where each balance goes ----

/** Where a balance of the trial balance goes, before any adjustment touches it, and how. */
export function destinationOf(id: ItemId): { spot: Spot; how: string } {
  switch (ITEMS[id].kind) {
    case 'openingStock':
    case 'purchases':
    case 'directExpense':
      return { spot: 'trading-dr', how: 'a row of its own' };
    case 'purchasesReturn':
      return { spot: 'trading-dr', how: 'deducted from Purchases' };
    case 'sales':
      return { spot: 'trading-cr', how: 'a row of its own' };
    case 'salesReturn':
      return { spot: 'trading-cr', how: 'deducted from Sales' };
    case 'indirectExpense':
    case 'badDebts':
      return { spot: 'pl-dr', how: 'a row of its own' };
    case 'income':
      return { spot: 'pl-cr', how: 'a row of its own' };
    case 'fixedAsset':
    case 'debtors':
    case 'currentAsset':
      return { spot: 'bs-assets', how: 'a row of its own' };
    case 'provision':
      return { spot: 'bs-assets', how: 'deducted from Sundry Debtors' };
    case 'capital':
    case 'liability':
      return { spot: 'bs-liabilities', how: 'a row of its own' };
    case 'drawings':
      return { spot: 'bs-liabilities', how: 'deducted from Capital' };
  }
}

/** "Trading A/c, Dr" as a tag beside a placed balance. */
export const SPOT_TAGS: Record<Spot, string> = {
  'trading-dr': 'Trading A/c, Dr',
  'trading-cr': 'Trading A/c, Cr',
  'pl-dr': 'P&L A/c, Dr',
  'pl-cr': 'P&L A/c, Cr',
  'bs-liabilities': 'Balance Sheet, liabilities',
  'bs-assets': 'Balance Sheet, assets',
};

// ---- the effects of an adjustment ----

export interface Effect {
  spot: Spot;
  /** "Salaries + ₹4,000", in the words of the statement. */
  text: string;
}

const MONTH_NAMES = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
/** The day an asset held for `months` of the year to 31 March 2026 was bought: "1 October 2025". */
export const boughtOn = (months: number): string => {
  const i = 12 - months;
  return `1 ${MONTH_NAMES[i]} ${i <= 8 ? 2025 : 2026}`;
};

/**
 * The places an adjustment changes, in the order a student is taught them: the Trading or the Profit and Loss
 * Account first, then the Balance Sheet. Every adjustment has two, but goods lost by fire with an insurance claim has
 * three (the Trading Account, the loss not claimed, the claim), and goods given away touch the two accounts only.
 * `made` is what else is made with it: the provision for discount and the manager's commission depend on it.
 */
export function effectsOf(b: Business, a: Adjustment, made: readonly Adjustment[] = b.adjustments): Effect[] {
  const L = (id: ItemId) => ITEMS[id].label;
  const directItem = (id: ItemId) => ITEMS[id].kind === 'directExpense';
  switch (a.type) {
    case 'closingStock':
      return [
        { spot: 'trading-cr', text: `By Closing Stock ${inr(a.amount)}` },
        { spot: 'bs-assets', text: `Closing Stock ${inr(a.amount)}, a current asset` },
      ];
    case 'outstanding':
      return [
        { spot: directItem(a.item) ? 'trading-dr' : 'pl-dr', text: `${L(a.item)}: add outstanding ${inr(a.amount)}` },
        { spot: 'bs-liabilities', text: `${outstandingName(a.item)} ${inr(a.amount)}, a current liability` },
      ];
    case 'prepaid':
      return [
        { spot: directItem(a.item) ? 'trading-dr' : 'pl-dr', text: `${L(a.item)}: less prepaid ${inr(a.amount)}` },
        { spot: 'bs-assets', text: `${prepaidName(a.item)} ${inr(a.amount)}, a current asset` },
      ];
    case 'accrued':
      return [
        { spot: 'pl-cr', text: `${L(a.item)}: add accrued ${inr(a.amount)}` },
        { spot: 'bs-assets', text: `${accruedName(a.item)} ${inr(a.amount)}, a current asset` },
      ];
    case 'advance':
      return [
        { spot: 'pl-cr', text: `${L(a.item)}: less received in advance ${inr(a.amount)}` },
        { spot: 'bs-liabilities', text: `${advanceName(a.item)} ${inr(a.amount)}, a current liability` },
      ];
    case 'depreciation': {
      const d = depreciationOf(b, a);
      return [
        { spot: 'pl-dr', text: `To ${depreciationName(a.item)} ${inr(d)}` },
        { spot: 'bs-assets', text: `${L(a.item)}: less depreciation ${inr(d)}` },
      ];
    }
    case 'badDebts': {
      const n = newProvisionOf(b, a);
      const old = balanceOf(b, 'provision');
      const charge = badDebtsChargeOf(b, a);
      const added = [...(a.further ? [`further bad debts ${inr(a.further)}`] : []), `new provision ${inr(n)}`];
      return [
        charge >= 0
          ? { spot: 'pl-dr', text: `Bad Debts: add ${added.join(' and ')}${old ? `, less old provision ${inr(old)}` : ''}` }
          : { spot: 'pl-cr', text: `Old provision ${inr(old)} less the bad debts and the new provision: ${inr(-charge)} written back` },
        { spot: 'bs-assets', text: `Sundry Debtors: less ${[...(a.further ? [`further bad debts ${inr(a.further)}`] : []), `provision for doubtful debts ${inr(n)}`].join(' and ')}` },
      ];
    }
    case 'discount': {
      const x = discountOf(b, a, made);
      return [
        { spot: 'pl-dr', text: `To ${DISCOUNT_PROVISION} ${inr(x)}` },
        { spot: 'bs-assets', text: `Sundry Debtors: less provision for discount ${inr(x)}` },
      ];
    }
    case 'interestOnCapital': {
      const i = interestOnCapitalOf(b, a);
      return [
        { spot: 'pl-dr', text: `To Interest on Capital ${inr(i)}` },
        { spot: 'bs-liabilities', text: `Capital: add interest on capital ${inr(i)}` },
      ];
    }
    case 'goodsTaken':
      return [
        { spot: 'trading-dr', text: `Purchases: less goods taken ${inr(a.amount)}, at cost` },
        { spot: 'bs-liabilities', text: `Capital: less goods taken ${inr(a.amount)}, as drawings` },
      ];
    case 'goodsGiven':
      return [
        { spot: 'trading-dr', text: `Purchases: less goods given ${a.to === 'samples' ? 'as free samples' : 'for staff welfare'} ${inr(a.amount)}, at cost` },
        a.to === 'samples'
          ? { spot: 'pl-dr', text: hasItem(b, 'advertisement') ? `Advertisement: add free samples ${inr(a.amount)}` : `To ${SAMPLES_ROW} ${inr(a.amount)}` }
          : { spot: 'pl-dr', text: `To ${STAFF_WELFARE} ${inr(a.amount)}` },
      ];
    case 'abnormalLoss': {
      const claim = Math.min(a.claim, a.amount);
      const loss = a.amount - claim;
      return [
        { spot: 'trading-dr', text: `Purchases: less goods lost by fire ${inr(a.amount)}, at cost` },
        ...(loss > 0 ? [{ spot: 'pl-dr' as Spot, text: `To ${LOSS_BY_FIRE} ${inr(loss)}${claim ? ` (${inr(a.amount)} less the claim of ${inr(claim)})` : ''}` }] : []),
        ...(claim > 0 ? [{ spot: 'bs-assets' as Spot, text: `${CLAIM} ${inr(claim)}, a current asset` }] : []),
      ];
    }
    case 'commission': {
      const c = commissionIn(b, a, made).amount;
      return [
        { spot: 'pl-dr', text: `To ${COMMISSION} ${inr(c)}` },
        { spot: 'bs-liabilities', text: `${COMMISSION_OWED} ${inr(c)}, a current liability` },
      ];
    }
  }
}

/** The adjustment as a question or a note states it. */
export function adjustmentText(b: Business, a: Adjustment): string {
  const L = (id: ItemId) => ITEMS[id].label;
  const lower = (id: ItemId) => ITEMS[id].label.toLowerCase();
  switch (a.type) {
    case 'closingStock':
      return `Closing stock on ${YEAR_END} is valued at ${inr(a.amount)}.`;
    case 'outstanding':
      return `${L(a.item)} of ${inr(a.amount)} for the year ${a.item === 'salaries' || a.item === 'wages' ? 'are' : 'is'} still unpaid.`;
    case 'prepaid':
      return `${inr(a.amount)} of the ${lower(a.item)} paid is for the next year.`;
    case 'accrued':
      return `${L(a.item).replace(/ Received$/, '')} of ${inr(a.amount)} has been earned but not yet received.`;
    case 'advance':
      return `${inr(a.amount)} of the ${lower(a.item)} is for the next year.`;
    case 'depreciation':
      return a.months === 12
        ? `Depreciate ${lower(a.item)} at ${a.rate}% p.a. on the balance shown, for the full year.`
        : `${L(a.item)} was bought on ${boughtOn(a.months)}. Depreciate it at ${a.rate}% p.a. from that date (${a.months} months).`;
    case 'badDebts': {
      const make = balanceOf(b, 'provision') ? 'maintain' : 'create';
      return a.further
        ? `Write off further bad debts of ${inr(a.further)} and ${make} a provision for doubtful debts at ${a.rate}% on the remaining debtors.`
        : `${make === 'maintain' ? 'Maintain' : 'Create'} a provision for doubtful debts at ${a.rate}% on the debtors.`;
    }
    case 'discount':
      return `Create a provision for discount on debtors at ${a.rate}%.`;
    case 'interestOnCapital':
      return `Allow interest on capital at ${a.rate}% p.a.; no capital was brought in during the year.`;
    case 'goodsTaken':
      return `The proprietor took goods costing ${inr(a.amount)} for personal use; no entry has been made.`;
    case 'goodsGiven':
      return a.to === 'samples'
        ? `Goods costing ${inr(a.amount)} were given away as free samples; no entry has been made.`
        : `Goods costing ${inr(a.amount)} were given to the staff for their welfare; no entry has been made.`;
    case 'abnormalLoss':
      return a.claim > 0
        ? `Goods costing ${inr(a.amount)} were destroyed by fire; the insurance company admitted a claim of ${inr(Math.min(a.claim, a.amount))}.`
        : `Goods costing ${inr(a.amount)} were destroyed by fire; they were not insured.`;
    case 'commission':
      return `The manager is entitled to a commission of ${a.rate}% of the net profit ${a.basis} charging such commission; it is unpaid.`;
  }
}

/** A short name for the adjustment, as a title. */
export function adjustmentTitle(a: Adjustment): string {
  switch (a.type) {
    case 'closingStock':
      return 'Closing stock';
    case 'outstanding':
      return outstandingName(a.item);
    case 'prepaid':
      return prepaidName(a.item);
    case 'accrued':
      return accruedName(a.item);
    case 'advance':
      return advanceName(a.item);
    case 'depreciation':
      return depreciationName(a.item);
    case 'badDebts':
      return 'Bad debts and provision';
    case 'discount':
      return 'Provision for discount on debtors';
    case 'interestOnCapital':
      return 'Interest on capital';
    case 'goodsTaken':
      return 'Goods taken for personal use';
    case 'goodsGiven':
      return a.to === 'samples' ? 'Goods given as free samples' : 'Goods given for staff welfare';
    case 'abnormalLoss':
      return 'Goods lost by fire';
    case 'commission':
      return "Manager's commission";
  }
}
