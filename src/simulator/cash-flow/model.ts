// ---------------------------------------------------------------------------------------------------------------
// The lab "Where the cash came from and went": a year of a company that is not a financing company, and the Cash
// Flow Statement it gives under AS 3 (Revised) by the indirect method, as CBSE Class 12 (2025-26) prepares it.
//
// Every figure the screen shows is made here. A statement is a list of rows in the board's order; each row carries
// its signed amount (an inflow or an item added is positive, an outflow or an item deducted is negative), the
// running figure of its part before and after it (what the picture draws as a step), and the reason it stands where
// it does. Amounts are in paise, as everywhere in the app.
//
// Conventions (the CBSE treatment):
// - The company is not a financing company: interest and dividend received are investing inflows (taken out of the
//   profit under operating activities), interest paid is a financing outflow (added back to the profit).
// - Bank overdraft is a short-term borrowing: its change is a financing flow, never a working capital change and
//   never deducted from cash.
// - Cash and cash equivalents are cash, bank and short-term investments maturing within three months.
// - The tax actually paid is deducted after cash generated from operations.
// ---------------------------------------------------------------------------------------------------------------

import { formatINR, type Paise } from '@/engine/money';

export type Section = 'operating' | 'investing' | 'financing' | 'cash';

/** A balance of working capital at the two dates. */
export interface WcItem {
  id: WcId;
  open: Paise;
  close: Paise;
}

export type WcId = 'inventories' | 'tradeReceivables' | 'prepaidExpenses' | 'tradePayables' | 'outstandingExpenses';

export const WC_ITEMS: Record<WcId, { label: string; kind: 'asset' | 'liability'; up: string; down: string }> = {
  inventories: {
    label: 'Inventories',
    kind: 'asset',
    up: 'Cash went into goods that are still unsold, and the profit does not show them as an expense',
    down: 'Goods bought in an earlier year were sold: their cost reduced this year’s profit, but no cash went out for them this year',
  },
  tradeReceivables: {
    label: 'Trade receivables',
    kind: 'asset',
    up: 'Customers owe more than at the start: part of the revenue in the profit has not yet come in as cash',
    down: 'Customers paid more than this year’s credit revenue: cash came in beyond what the profit shows',
  },
  prepaidExpenses: {
    label: 'Prepaid expenses',
    kind: 'asset',
    up: 'Cash was paid in advance for expenses of the next year, which are not in this year’s profit',
    down: 'An expense charged in this year’s profit was paid for in an earlier year',
  },
  tradePayables: {
    label: 'Trade payables',
    kind: 'liability',
    up: 'Goods were bought on credit and not yet paid for: the cash stays in the business',
    down: 'Suppliers were paid more than this year’s credit purchases: extra cash went out',
  },
  outstandingExpenses: {
    label: 'Outstanding expenses',
    kind: 'liability',
    up: 'Expenses charged in the profit are not yet paid: the cash stays in the business',
    down: 'Expenses of an earlier year were paid this year: cash went out that this year’s profit does not show',
  },
};

/** The year: what a question gives, already worked down to the flows (no balance sheet arithmetic left). */
export interface CashFlowYear {
  company: string;
  /** Net profit before tax and extraordinary items; negative for a loss. */
  npbt: Paise;
  /** Depreciation charged on machinery. */
  depreciation: Paise;
  /** Goodwill written off (amortised). */
  goodwill: Paise;
  /** A machine sold during the year: its book value and the price it fetched. */
  sale: { book: Paise; price: Paise } | null;
  /** Interest on debentures for the year, paid. */
  interestPaid: Paise;
  /** Interest received on non-current investments. */
  interestReceived: Paise;
  /** Dividend received on shares held as investments. */
  dividendReceived: Paise;
  wc: WcItem[];
  /** Income tax actually paid during the year. */
  taxPaid: Paise;
  machineryBought: Paise;
  investmentsBought: Paise;
  /** Proceeds of shares issued for cash, with any securities premium. */
  sharesIssued: Paise;
  debenturesIssued: Paise;
  loanRepaid: Paise;
  /** Change in bank overdraft: positive for an increase. */
  overdraftChange: Paise;
  dividendPaid: Paise;
  /** Cash and cash equivalents at the beginning of the year. */
  openingCash: Paise;
}

export type RowKind = 'heading' | 'subhead' | 'item' | 'subtotal' | 'final';

export interface CfRow {
  id: string;
  kind: RowKind;
  section: Section;
  label: string;
  /** Signed: an inflow, or an item added, is positive. Nothing for a heading. */
  amount: Paise;
  /** The running figure of its part before this row and after it: a step of the picture. A sub-total starts at 0. */
  from: Paise;
  to: Paise;
  /** Why it stands here, and why it goes the way it does. */
  why: string;
  /** For an item: "Add", "Less", or nothing for the first figure of a part. */
  sign?: 'Add' | 'Less';
}

export interface Statement {
  rows: CfRow[];
  /** Operating profit before working capital changes. */
  opProfit: Paise;
  /** Cash generated from operations. */
  cgo: Paise;
  operating: Paise;
  investing: Paise;
  financing: Paise;
  net: Paise;
  closing: Paise;
}

export const HEAD = {
  operating: 'A. Cash flows from operating activities',
  investing: 'B. Cash flows from investing activities',
  financing: 'C. Cash flows from financing activities',
} as const;

export const LABEL = {
  npbt: 'Net profit before tax and extraordinary items',
  adjustments: 'Adjustments for non-cash and non-operating items',
  opProfit: 'Operating profit before working capital changes',
  wc: 'Adjustments for working capital changes',
  cgo: 'Cash generated from operations',
  tax: 'Income tax paid',
  depreciation: 'Depreciation on machinery',
  goodwill: 'Goodwill written off',
  loss: 'Loss on sale of machinery',
  profit: 'Profit on sale of machinery',
  interestAdj: 'Interest on debentures',
  interestReceived: 'Interest received',
  dividendReceived: 'Dividend received',
  bought: 'Purchase of machinery',
  sold: 'Sale of machinery',
  investments: 'Purchase of non-current investments',
  shares: 'Proceeds from issue of equity shares',
  debentures: 'Proceeds from issue of debentures',
  loan: 'Repayment of long-term bank loan',
  overdraftUp: 'Increase in bank overdraft',
  overdraftDown: 'Decrease in bank overdraft',
  interestPaid: 'Interest paid on debentures',
  dividendPaid: 'Dividend paid',
  opening: 'Cash and cash equivalents at the beginning of the year',
  closing: 'Cash and cash equivalents at the end of the year',
} as const;

/** "Net cash from operating activities" or "Net cash used in operating activities", as AS 3 words it. */
export const netLabel = (section: 'operating' | 'investing' | 'financing', amount: Paise): string =>
  `Net cash ${amount < 0 ? 'used in' : 'from'} ${section} activities`;
export const changeLabel = (amount: Paise): string => `Net ${amount < 0 ? 'decrease' : 'increase'} in cash and cash equivalents`;

/** An amount as the statement prints it: an outflow or a deduction in brackets, no ₹ (the column says ₹). */
export const statementAmount = (p: Paise): string => (p < 0 ? `(${formatINR(-p).slice(1)})` : formatINR(p).slice(1));
/** "+₹40,000" or "−₹40,000". */
export const signedINR = (p: Paise): string => (p === 0 ? '₹0' : `${p > 0 ? '+' : '−'}${formatINR(Math.abs(p))}`);

export const wcChange = (w: WcItem): Paise => {
  const change = w.close - w.open;
  return WC_ITEMS[w.id].kind === 'asset' ? -change : change;
};
export const wcLabel = (w: WcItem): string => `${w.close > w.open ? 'Increase' : 'Decrease'} in ${WC_ITEMS[w.id].label.toLowerCase()}`;

const NON_CASH = 'a non-cash expense: it reduced the profit, but no cash went out, so it is added back';
const FINANCE = 'the cost of the company’s finance: it reduced the profit and is added back here, because the payment is shown under financing activities';
const INVESTING_INCOME = 'income from an investment: it is in the profit, but it belongs to investing activities, so it is deducted here and the receipt is shown there';

/** The statement of a year, row by row, in the order of the board's format. Rows of nil are left out. */
export function statementOf(y: CashFlowYear): Statement {
  const rows: CfRow[] = [];
  let run = 0;
  const heading = (section: Section, label: string) => rows.push({ id: `h-${section}`, kind: 'heading', section, label, amount: 0, from: run, to: run, why: '' });
  const subhead = (id: string, section: Section, label: string) => rows.push({ id, kind: 'subhead', section, label, amount: 0, from: run, to: run, why: '' });
  const item = (id: string, section: Section, label: string, amount: Paise, why: string, first = false) => {
    if (amount === 0 && !first) return;
    rows.push({ id, kind: 'item', section, label, amount, from: run, to: run + amount, why, ...(first ? {} : { sign: amount < 0 ? 'Less' : 'Add' }) });
    run += amount;
  };
  const subtotal = (id: string, section: Section, label: string, why: string, kind: RowKind = 'subtotal') => {
    rows.push({ id, kind, section, label, amount: run, from: 0, to: run, why });
  };

  // A. Operating activities.
  heading('operating', HEAD.operating);
  run = 0;
  item(
    'npbt',
    'operating',
    LABEL.npbt,
    y.npbt,
    y.npbt < 0
      ? `The indirect method starts from the profit, and this year it is a loss of ${formatINR(-y.npbt)}: the start is a minus figure. The profit is on the accrual basis, so the steps below turn it into cash.`
      : `The indirect method starts from the profit of ${formatINR(y.npbt)}. The profit is on the accrual basis, not cash, so the steps below turn it into cash.`,
    true,
  );
  const sale = y.sale;
  const gain = sale ? sale.price - sale.book : 0;
  const adjusting = y.depreciation + y.goodwill + Math.abs(gain) + y.interestPaid + y.interestReceived + y.dividendReceived > 0;
  if (adjusting) subhead('sh-adjust', 'operating', LABEL.adjustments);
  item('depreciation', 'operating', LABEL.depreciation, y.depreciation, `Depreciation, ${formatINR(y.depreciation)}, is ${NON_CASH}.`);
  item('goodwill', 'operating', LABEL.goodwill, y.goodwill, `Goodwill written off, ${formatINR(y.goodwill)}, is ${NON_CASH}.`);
  if (sale && gain < 0)
    item('loss', 'operating', LABEL.loss, -gain, `The machine with a book value of ${formatINR(sale.book)} fetched ${formatINR(sale.price)}: a loss of ${formatINR(-gain)}. It reduced the profit, but no cash went out, so it is added back; the cash from the sale is shown under investing activities.`);
  if (sale && gain > 0)
    item('profit', 'operating', LABEL.profit, -gain, `The machine with a book value of ${formatINR(sale.book)} fetched ${formatINR(sale.price)}: a profit of ${formatINR(gain)}. It belongs to investing activities, where the whole sale price is shown, so it is deducted here and not counted twice.`);
  item('interest-adj', 'operating', LABEL.interestAdj, y.interestPaid, `Interest on debentures, ${formatINR(y.interestPaid)}, is ${FINANCE}.`);
  item('interest-received-adj', 'operating', LABEL.interestReceived, -y.interestReceived, `Interest received, ${formatINR(y.interestReceived)}, is ${INVESTING_INCOME}.`);
  item('dividend-received-adj', 'operating', LABEL.dividendReceived, -y.dividendReceived, `Dividend received, ${formatINR(y.dividendReceived)}, is ${INVESTING_INCOME}.`);
  const opProfit = run;
  subtotal('op-profit', 'operating', LABEL.opProfit, `The profit with the non-cash items and the items of other activities taken out: ${formatINR(opProfit)}.`);
  run = opProfit;
  const moving = y.wc.filter((w) => w.close !== w.open);
  if (moving.length > 0) subhead('sh-wc', 'operating', LABEL.wc);
  for (const w of moving) {
    const info = WC_ITEMS[w.id];
    const amt = wcChange(w);
    const what = `${info.label} ${w.close > w.open ? 'rose' : 'fell'} from ${formatINR(w.open)} to ${formatINR(w.close)}`;
    const rule = info.kind === 'asset' ? (amt < 0 ? 'an increase in a current asset is deducted' : 'a decrease in a current asset is added') : amt > 0 ? 'an increase in a current liability is added' : 'a decrease in a current liability is deducted';
    item(`wc-${w.id}`, 'operating', wcLabel(w), amt, `${what}. ${info[w.close > w.open ? 'up' : 'down']}, so ${rule}.`);
  }
  const cgo = run;
  subtotal('cgo', 'operating', LABEL.cgo, `The cash the operations really brought in before tax: ${formatINR(cgo)}.`);
  item('tax', 'operating', LABEL.tax, -y.taxPaid, `The income tax actually paid during the year, ${formatINR(y.taxPaid)}, is an operating outflow. It comes after cash generated from operations.`);
  const operating = run;
  subtotal('net-operating', 'operating', netLabel('operating', operating), `What the year’s operations added to the cash: ${signedINR(operating)}. This flows into the reservoir through the operating pipe.`);

  // B. Investing activities.
  heading('investing', HEAD.investing);
  run = 0;
  item('bought', 'investing', LABEL.bought, -y.machineryBought, `Cash paid for machinery, ${formatINR(y.machineryBought)}, is spent on a long-term asset: an investing outflow.`);
  if (sale) item('sold', 'investing', LABEL.sold, sale.price, `The whole sale price of the machine, ${formatINR(sale.price)}, is cash received: an investing inflow. (Its ${gain > 0 ? 'profit' : gain < 0 ? 'loss' : 'book value'} is not a cash flow.)`);
  item('investments', 'investing', LABEL.investments, -y.investmentsBought, `Cash paid for long-term investments, ${formatINR(y.investmentsBought)}: an investing outflow.`);
  item('interest-received', 'investing', LABEL.interestReceived, y.interestReceived, `Interest received on investments, ${formatINR(y.interestReceived)}: an investing inflow for a company that is not a financing company.`);
  item('dividend-received', 'investing', LABEL.dividendReceived, y.dividendReceived, `Dividend received on investments, ${formatINR(y.dividendReceived)}: an investing inflow for a company that is not a financing company.`);
  const investing = run;
  subtotal('net-investing', 'investing', netLabel('investing', investing), `What buying and selling long-term assets and investments did to the cash: ${signedINR(investing)}.`);

  // C. Financing activities.
  heading('financing', HEAD.financing);
  run = 0;
  item('shares', 'financing', LABEL.shares, y.sharesIssued, `Cash received for shares issued, ${formatINR(y.sharesIssued)}, with any securities premium: a financing inflow.`);
  item('debentures', 'financing', LABEL.debentures, y.debenturesIssued, `Cash received for debentures issued, ${formatINR(y.debenturesIssued)}: money borrowed for the long term, a financing inflow.`);
  item('loan', 'financing', LABEL.loan, -y.loanRepaid, `A long-term loan repaid, ${formatINR(y.loanRepaid)}: a financing outflow.`);
  item(
    'overdraft',
    'financing',
    y.overdraftChange > 0 ? LABEL.overdraftUp : LABEL.overdraftDown,
    y.overdraftChange,
    `Bank overdraft is a short-term borrowing, so its ${y.overdraftChange > 0 ? 'increase is a financing inflow' : 'decrease is a financing outflow'} of ${formatINR(Math.abs(y.overdraftChange))}. It is not a working capital change.`,
  );
  item('interest-paid', 'financing', LABEL.interestPaid, -y.interestPaid, `Interest paid on debentures, ${formatINR(y.interestPaid)}, is the cost of borrowed money: a financing outflow.`);
  item('dividend-paid', 'financing', LABEL.dividendPaid, -y.dividendPaid, `Dividend paid to the shareholders, ${formatINR(y.dividendPaid)}: a financing outflow, for every kind of company.`);
  const financing = run;
  subtotal('net-financing', 'financing', netLabel('financing', financing), `What raising and repaying finance did to the cash: ${signedINR(financing)}.`);

  // The change in cash, and the reservoir from start to end.
  const net = operating + investing + financing;
  run = net;
  rows.push({
    id: 'net-change',
    kind: 'subtotal',
    section: 'cash',
    label: changeLabel(net),
    amount: net,
    from: 0,
    to: net,
    why: `The three activities together: ${[operating, investing, financing].map(signedINR).join(' ')} = ${signedINR(net)}.`,
  });
  rows.push({
    id: 'opening',
    kind: 'item',
    section: 'cash',
    label: LABEL.opening,
    amount: y.openingCash,
    from: net,
    to: net + y.openingCash,
    sign: 'Add',
    why: `The reservoir held ${formatINR(y.openingCash)} of cash and cash equivalents at the start of the year (cash, bank and investments maturing within three months).`,
  });
  const closing = y.openingCash + net;
  rows.push({
    id: 'closing',
    kind: 'final',
    section: 'cash',
    label: LABEL.closing,
    amount: closing,
    from: 0,
    to: closing,
    why: `${formatINR(y.openingCash)} ${signedINR(net).replace(/^([+−])/, '$1 ')} = ${formatINR(closing)}. It must agree with the cash and cash equivalents in the closing balance sheet: that is the check on the whole statement.`,
  });

  return { rows, opProfit, cgo, operating, investing, financing, net, closing };
}

/** A copy of a year with one figure changed, kept within what the year can hold. */
export function withFigure(y: CashFlowYear, key: FigureKey, value: Paise): CashFlowYear {
  const v = Math.round(value);
  if (key === 'saleBook' || key === 'salePrice') {
    const sale = y.sale ?? { book: 0, price: 0 };
    const next = { ...sale, [key === 'saleBook' ? 'book' : 'price']: Math.max(0, v) };
    return { ...y, sale: next.book === 0 && next.price === 0 ? null : next };
  }
  if (key.startsWith('wc:')) {
    const [, id, end] = key.split(':') as [string, WcId, 'open' | 'close'];
    const has = y.wc.some((w) => w.id === id);
    const wc = has ? y.wc.map((w) => (w.id === id ? { ...w, [end]: Math.max(0, v) } : w)) : [...y.wc, { id, open: 0, close: 0, [end]: Math.max(0, v) }];
    return { ...y, wc: wc.filter((w) => w.open !== 0 || w.close !== 0) };
  }
  const k = key as Exclude<FigureKey, 'saleBook' | 'salePrice' | `wc:${string}`>;
  return { ...y, [k]: k === 'npbt' || k === 'overdraftChange' ? v : Math.max(0, v) };
}

/** The figures a student can change in the sandbox. */
export type FigureKey =
  | 'npbt'
  | 'depreciation'
  | 'goodwill'
  | 'saleBook'
  | 'salePrice'
  | 'interestPaid'
  | 'interestReceived'
  | 'dividendReceived'
  | `wc:${WcId}:${'open' | 'close'}`
  | 'taxPaid'
  | 'machineryBought'
  | 'investmentsBought'
  | 'sharesIssued'
  | 'debenturesIssued'
  | 'loanRepaid'
  | 'overdraftChange'
  | 'dividendPaid'
  | 'openingCash';

/** Reads one figure of a year. */
export function figureOf(y: CashFlowYear, key: FigureKey): Paise {
  if (key === 'saleBook') return y.sale?.book ?? 0;
  if (key === 'salePrice') return y.sale?.price ?? 0;
  if (key.startsWith('wc:')) {
    const [, id, end] = key.split(':') as [string, WcId, 'open' | 'close'];
    return y.wc.find((w) => w.id === id)?.[end] ?? 0;
  }
  return y[key as 'npbt'];
}

export interface FigureSpec {
  key: FigureKey;
  label: string;
  min: Paise;
  max: Paise;
  step: Paise;
}

const R = (rupees: number): Paise => rupees * 100;
const WC_ORDER: WcId[] = ['inventories', 'tradeReceivables', 'prepaidExpenses', 'tradePayables', 'outstandingExpenses'];

/** The sandbox's controls, in groups. */
export const FIGURE_GROUPS: { id: string; title: string; figures: FigureSpec[] }[] = [
  {
    id: 'profit',
    title: 'The profit and its adjustments',
    figures: [
      { key: 'npbt', label: 'Net profit before tax (a loss below nil)', min: R(-300000), max: R(800000), step: R(5000) },
      { key: 'depreciation', label: 'Depreciation on machinery', min: 0, max: R(200000), step: R(5000) },
      { key: 'goodwill', label: 'Goodwill written off', min: 0, max: R(100000), step: R(5000) },
      { key: 'saleBook', label: 'Machine sold: its book value', min: 0, max: R(200000), step: R(5000) },
      { key: 'salePrice', label: 'Machine sold: the price it fetched', min: 0, max: R(200000), step: R(5000) },
      { key: 'interestPaid', label: 'Interest on debentures (paid)', min: 0, max: R(100000), step: R(5000) },
      { key: 'interestReceived', label: 'Interest received on investments', min: 0, max: R(100000), step: R(5000) },
      { key: 'dividendReceived', label: 'Dividend received on investments', min: 0, max: R(100000), step: R(5000) },
    ],
  },
  {
    id: 'wc',
    title: 'Working capital: balances at the start and at the end',
    figures: WC_ORDER.flatMap((id) => [
      { key: `wc:${id}:open` as FigureKey, label: `${WC_ITEMS[id].label} at the start`, min: 0, max: R(400000), step: R(5000) },
      { key: `wc:${id}:close` as FigureKey, label: `${WC_ITEMS[id].label} at the end`, min: 0, max: R(400000), step: R(5000) },
    ]),
  },
  {
    id: 'tax',
    title: 'Tax',
    figures: [{ key: 'taxPaid', label: 'Income tax paid during the year', min: 0, max: R(300000), step: R(5000) }],
  },
  {
    id: 'investing',
    title: 'Investing',
    figures: [
      { key: 'machineryBought', label: 'Machinery bought for cash', min: 0, max: R(800000), step: R(10000) },
      { key: 'investmentsBought', label: 'Non-current investments bought', min: 0, max: R(400000), step: R(10000) },
    ],
  },
  {
    id: 'financing',
    title: 'Financing',
    figures: [
      { key: 'sharesIssued', label: 'Equity shares issued for cash (with premium)', min: 0, max: R(800000), step: R(10000) },
      { key: 'debenturesIssued', label: 'Debentures issued for cash', min: 0, max: R(600000), step: R(10000) },
      { key: 'loanRepaid', label: 'Long-term bank loan repaid', min: 0, max: R(500000), step: R(10000) },
      { key: 'overdraftChange', label: 'Change in bank overdraft (a fall below nil)', min: R(-200000), max: R(200000), step: R(5000) },
      { key: 'dividendPaid', label: 'Dividend paid', min: 0, max: R(300000), step: R(5000) },
    ],
  },
  {
    id: 'cash',
    title: 'Cash at the start',
    figures: [{ key: 'openingCash', label: 'Cash and cash equivalents at the start', min: 0, max: R(500000), step: R(5000) }],
  },
];

/** The reservoir after the parts of the statement that have played: the opening cash and the nets of the finished parts. */
export function reservoirLevel(s: Statement, opening: Paise, done: { operating: boolean; investing: boolean; financing: boolean }): Paise {
  return opening + (done.operating ? s.operating : 0) + (done.investing ? s.investing : 0) + (done.financing ? s.financing : 0);
}
