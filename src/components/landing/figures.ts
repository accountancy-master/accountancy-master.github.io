// ---------------------------------------------------------------------------------------------------------------
// The figures the landing page shows: the transactions that tip and level the scale of the opening, and the one sale
// that is followed through the books. Plain data and arithmetic, worked out here once, so that every figure the page
// prints comes from one place and a unit test (figures.test.ts) can check that the books agree.
// ---------------------------------------------------------------------------------------------------------------

const WHOLE = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** An amount in rupees with Indian grouping and no symbol: 1,40,100. */
export const amount = (n: number): string => WHOLE.format(n);

/** An amount in rupees with the symbol: ₹1,40,100. A negative one is written −₹5,000. */
export const inr = (n: number): string => (n < 0 ? `−₹${amount(-n)}` : `₹${amount(n)}`);

/** A change, signed: +25,000 or −10,000. */
export const signed = (n: number): string => (n < 0 ? `−${amount(-n)}` : `+${amount(n)}`);

// ---------------------------------------------------------------------------------------------------------------
// The opening: the accounting equation as a scale. Each transaction changes the items of each side; the side that
// changes first tips the beam, and the other side levels it again.
// ---------------------------------------------------------------------------------------------------------------

export type Side = 'assets' | 'liabilities' | 'capital';

export interface Move {
  side: Side;
  /** The item of the side that changes: "Cash", "Creditors", "Capital". */
  item: string;
  by: number;
}

export interface EquationStep {
  /** The transaction, as the voucher says it. */
  text: string;
  /** What changes first: always on the assets side here, so the beam tips and is then levelled. */
  first: Move[];
  /** What brings the equation level again; empty when the assets only change form. */
  then: Move[];
  /** Why the other side moved, in a few words: "a liability", "profit adds to capital". */
  why: string;
}

export const EQUATION_STEPS: readonly EquationStep[] = [
  {
    text: 'Started business with cash ₹5,00,000',
    first: [{ side: 'assets', item: 'Cash', by: 500_000 }],
    then: [{ side: 'capital', item: 'Capital', by: 500_000 }],
    why: 'the owner’s money is capital',
  },
  {
    text: 'Bought furniture on credit from Mehta Furnishers, ₹25,000',
    first: [{ side: 'assets', item: 'Furniture', by: 25_000 }],
    then: [{ side: 'liabilities', item: 'Creditors', by: 25_000 }],
    why: 'the business now owes Mehta Furnishers',
  },
  {
    text: 'Bought goods for cash, ₹40,000',
    first: [
      { side: 'assets', item: 'Stock', by: 40_000 },
      { side: 'assets', item: 'Cash', by: -40_000 },
    ],
    then: [],
    why: 'one asset became another: the totals do not move',
  },
  {
    text: 'Sold goods costing ₹30,000 for ₹45,000 in cash',
    first: [
      { side: 'assets', item: 'Cash', by: 45_000 },
      { side: 'assets', item: 'Stock', by: -30_000 },
    ],
    then: [{ side: 'capital', item: 'Capital', by: 15_000 }],
    why: 'the profit of ₹15,000 belongs to the owner',
  },
  {
    text: 'Paid Mehta Furnishers ₹10,000',
    first: [{ side: 'assets', item: 'Cash', by: -10_000 }],
    then: [{ side: 'liabilities', item: 'Creditors', by: -10_000 }],
    why: 'less cash, and less owed',
  },
  {
    text: 'Withdrew ₹5,000 in cash for personal use',
    first: [{ side: 'assets', item: 'Cash', by: -5_000 }],
    then: [{ side: 'capital', item: 'Capital', by: -5_000 }],
    why: 'drawings reduce capital',
  },
  {
    text: 'Took a bank loan of ₹1,00,000, received in cash',
    first: [{ side: 'assets', item: 'Cash', by: 100_000 }],
    then: [{ side: 'liabilities', item: 'Bank loan', by: 100_000 }],
    why: 'a loan is a liability',
  },
];

/** The items of each side, in the order they first appear, with their amounts. */
export type Position = Record<Side, { item: string; amount: number }[]>;

export const EMPTY_POSITION: Position = { assets: [], liabilities: [], capital: [] };

/** A position after some moves: an item that falls to nothing leaves its side. */
export function apply(position: Position, moves: readonly Move[]): Position {
  const next: Position = { assets: [...position.assets], liabilities: [...position.liabilities], capital: [...position.capital] };
  for (const m of moves) {
    const list = next[m.side];
    const at = list.findIndex((x) => x.item === m.item);
    if (at === -1) list.push({ item: m.item, amount: m.by });
    else list[at] = { item: m.item, amount: list[at].amount + m.by };
    next[m.side] = list.filter((x) => x.amount !== 0);
  }
  return next;
}

export const total = (position: Position, side: Side): number => position[side].reduce((n, x) => n + x.amount, 0);

/** Where the books stand after every step, from the empty book: after step 0, step 1 … */
export const EQUATION_POSITIONS: readonly Position[] = EQUATION_STEPS.reduce<Position[]>((list, step) => {
  const before = list.at(-1) ?? EMPTY_POSITION;
  list.push(apply(apply(before, step.first), step.then));
  return list;
}, []);

/** The books at the end, after the last transaction: what is shown without motion. */
export const EQUATION_END: Position = EQUATION_POSITIONS[EQUATION_POSITIONS.length - 1];

// ---------------------------------------------------------------------------------------------------------------
// One sale, followed through the books of Sharma Electronics, Jaipur, for April 2026. The business opened the month
// with cash ₹60,000, stock ₹40,000 and furniture ₹20,000 (capital ₹1,20,000), sold fans to Gupta Traders on credit
// (the sale followed), paid a salary of ₹3,000 in cash, and had stock of ₹10,000 left at the end.
// ---------------------------------------------------------------------------------------------------------------

export const SALE = {
  seller: 'Sharma Electronics',
  city: 'Jaipur',
  buyer: 'Gupta Traders',
  invoiceNo: 'SE/142',
  date: '12 April 2026',
  item: 'table fans',
  quantity: 20,
  rate: 2_500,
  tradeDiscountPercent: 10,
  /** Within the state: GST of 18% is CGST 9% and SGST 9%. */
  gstPercent: 18,
} as const;

export const LIST_PRICE = SALE.quantity * SALE.rate;
export const TRADE_DISCOUNT = (LIST_PRICE * SALE.tradeDiscountPercent) / 100;
/** GST is charged on the price after trade discount, and Sales A/c takes this figure. */
export const TAXABLE = LIST_PRICE - TRADE_DISCOUNT;
export const CGST = (TAXABLE * SALE.gstPercent) / 2 / 100;
export const SGST = CGST;
export const INVOICE_TOTAL = TAXABLE + CGST + SGST;

export interface JournalLine {
  account: string;
  side: 'Dr' | 'Cr';
  amount: number;
}

/** The entry in the journal of Sharma Electronics. */
export const JOURNAL: readonly JournalLine[] = [
  { account: `${SALE.buyer} A/c`, side: 'Dr', amount: INVOICE_TOTAL },
  { account: 'Sales A/c', side: 'Cr', amount: TAXABLE },
  { account: 'Output CGST A/c', side: 'Cr', amount: CGST },
  { account: 'Output SGST A/c', side: 'Cr', amount: SGST },
];

export const NARRATION = `(Being ${SALE.quantity} ${SALE.item} sold to ${SALE.buyer} on credit at ${inr(LIST_PRICE)} less ${SALE.tradeDiscountPercent}% trade discount, with CGST and SGST at 9% each)`;

/** The month's other figures. */
export const OPENING = { cash: 60_000, stock: 40_000, furniture: 20_000 } as const;
export const CAPITAL = OPENING.cash + OPENING.stock + OPENING.furniture;
export const SALARY = 3_000;
export const CLOSING_STOCK = 10_000;
export const CASH_AT_END = OPENING.cash - SALARY;

export interface TrialRow {
  account: string;
  dr?: number;
  cr?: number;
  /** A row the sale made. */
  sale?: boolean;
}

/** The trial balance of Sharma Electronics as at 30 April 2026. */
export const TRIAL_BALANCE: readonly TrialRow[] = [
  { account: 'Cash', dr: CASH_AT_END },
  { account: 'Stock (1 April)', dr: OPENING.stock },
  { account: 'Furniture', dr: OPENING.furniture },
  { account: SALE.buyer, dr: INVOICE_TOTAL, sale: true },
  { account: 'Salary', dr: SALARY },
  { account: 'Capital', cr: CAPITAL },
  { account: 'Sales', cr: TAXABLE, sale: true },
  { account: 'Output CGST', cr: CGST, sale: true },
  { account: 'Output SGST', cr: SGST, sale: true },
];

export const TRIAL_DR = TRIAL_BALANCE.reduce((n, r) => n + (r.dr ?? 0), 0);
export const TRIAL_CR = TRIAL_BALANCE.reduce((n, r) => n + (r.cr ?? 0), 0);

/** Trading Account for the month: opening stock against sales and closing stock. */
export const GROSS_PROFIT = TAXABLE + CLOSING_STOCK - OPENING.stock;
export const TRADING_TOTAL = TAXABLE + CLOSING_STOCK;
/** Profit and Loss Account: the salary against the gross profit. */
export const NET_PROFIT = GROSS_PROFIT - SALARY;

export interface SheetRow {
  label: string;
  amount: number;
  /** Shown as a working beside the item ("Add: Net profit"), not added again into the total. */
  inner?: boolean;
}

export const BALANCE_SHEET: { liabilities: readonly SheetRow[]; assets: readonly SheetRow[] } = {
  liabilities: [
    { label: 'Capital', amount: CAPITAL, inner: true },
    { label: 'Add: Net profit', amount: NET_PROFIT, inner: true },
    { label: 'Capital at the end', amount: CAPITAL + NET_PROFIT },
    { label: 'Output CGST', amount: CGST },
    { label: 'Output SGST', amount: SGST },
  ],
  assets: [
    { label: 'Furniture', amount: OPENING.furniture },
    { label: 'Closing stock', amount: CLOSING_STOCK },
    { label: SALE.buyer, amount: INVOICE_TOTAL },
    { label: 'Cash', amount: CASH_AT_END },
  ],
};

const sheetTotal = (rows: readonly SheetRow[]) => rows.reduce((n, r) => n + (r.inner ? 0 : r.amount), 0);
export const BS_LIABILITIES = sheetTotal(BALANCE_SHEET.liabilities);
export const BS_ASSETS = sheetTotal(BALANCE_SHEET.assets);

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
}

/** A whole number of rupees in words, the Indian way (lakh, crore), as an invoice writes it: "Rupees fifty-three thousand one hundred only". */
export function inWords(n: number): string {
  const parts: string[] = [];
  const units: [number, string][] = [
    [10_000_000, 'crore'],
    [100_000, 'lakh'],
    [1_000, 'thousand'],
    [100, 'hundred'],
  ];
  let rest = n;
  for (const [size, name] of units) {
    const count = Math.floor(rest / size);
    if (count > 0) parts.push(`${belowHundred(count)} ${name}`);
    rest %= size;
  }
  if (rest > 0) parts.push(belowHundred(rest));
  return `Rupees ${parts.join(' ') || 'zero'} only`;
}
