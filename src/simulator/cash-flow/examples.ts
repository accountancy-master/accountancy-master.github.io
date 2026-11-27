// The ready years of the cash flow lab, and made-up years drawn from a seed. Every figure is a whole number of
// rupees in paise; each ready year is worked by hand in examples.test.ts.

import { createRng, type Rng } from '@/engine/rng';
import type { Paise } from '@/engine/money';
import { statementOf, type CashFlowYear, type WcItem } from './model';

const R = (rupees: number): Paise => rupees * 100;

const NOTHING = {
  depreciation: 0,
  goodwill: 0,
  sale: null,
  interestPaid: 0,
  interestReceived: 0,
  dividendReceived: 0,
  wc: [],
  taxPaid: 0,
  machineryBought: 0,
  investmentsBought: 0,
  sharesIssued: 0,
  debenturesIssued: 0,
  loanRepaid: 0,
  overdraftChange: 0,
  dividendPaid: 0,
} satisfies Partial<CashFlowYear>;

export interface CashFlowExample {
  id: string;
  title: string;
  /** What the year shows, in one line. */
  point: string;
  year: CashFlowYear;
}

export const EXAMPLES: CashFlowExample[] = [
  {
    id: 'growing',
    title: 'A growing year',
    point: 'Operations bring cash in; a new machine takes most of it out; shares fill the gap.',
    year: {
      ...NOTHING,
      company: 'Kaveri Looms Ltd.',
      npbt: R(320000),
      depreciation: R(60000),
      goodwill: R(20000),
      sale: { book: R(50000), price: R(40000) },
      interestPaid: R(30000),
      dividendReceived: R(15000),
      wc: [
        { id: 'inventories', open: R(140000), close: R(180000) },
        { id: 'tradeReceivables', open: R(120000), close: R(105000) },
        { id: 'tradePayables', open: R(90000), close: R(115000) },
        { id: 'outstandingExpenses', open: R(20000), close: R(12000) },
      ],
      taxPaid: R(85000),
      machineryBought: R(360000),
      investmentsBought: R(50000),
      sharesIssued: R(150000),
      overdraftChange: R(20000),
      dividendPaid: R(80000),
      openingCash: R(63000),
    },
  },
  {
    id: 'loss',
    title: 'A loss, and still cash from operations',
    point: 'The year ends in a loss, yet depreciation and customers paying up leave the operations with cash.',
    year: {
      ...NOTHING,
      company: 'Dhauli Cement Ltd.',
      npbt: R(-40000),
      depreciation: R(90000),
      sale: { book: R(60000), price: R(75000) },
      interestPaid: R(24000),
      wc: [
        { id: 'tradeReceivables', open: R(150000), close: R(110000) },
        { id: 'inventories', open: R(100000), close: R(120000) },
        { id: 'tradePayables', open: R(80000), close: R(95000) },
      ],
      taxPaid: R(10000),
      machineryBought: R(40000),
      loanRepaid: R(100000),
      openingCash: R(45000),
    },
  },
  {
    id: 'squeeze',
    title: 'Profit up, cash down',
    point: 'A profit of ₹4,00,000, yet cash falls: customers and unsold goods have soaked it up.',
    year: {
      ...NOTHING,
      company: 'Pragati Traders Ltd.',
      npbt: R(400000),
      depreciation: R(50000),
      interestReceived: R(20000),
      wc: [
        { id: 'tradeReceivables', open: R(100000), close: R(260000) },
        { id: 'inventories', open: R(120000), close: R(210000) },
        { id: 'tradePayables', open: R(110000), close: R(140000) },
        { id: 'prepaidExpenses', open: R(5000), close: R(15000) },
      ],
      taxPaid: R(110000),
      machineryBought: R(250000),
      debenturesIssued: R(100000),
      dividendPaid: R(60000),
      openingCash: R(180000),
    },
  },
];

/** The year played in Watch. */
export const WATCH_EXAMPLE = EXAMPLES[0];

const COMPANIES = ['Narmada Steel Ltd.', 'Saptagiri Foods Ltd.', 'Lohit Paper Mills Ltd.', 'Chilika Marine Ltd.', 'Sahyadri Tools Ltd.', 'Tapti Polymers Ltd.', 'Nilgiri Tea Ltd.', 'Gomti Electricals Ltd.'];

const step = (rng: Rng, min: number, max: number, by: number): Paise => R(rng.step(min, max, by));
const maybe = (rng: Rng, chance: number, value: () => Paise): Paise => (rng.next() < chance ? value() : 0);

function drawYear(rng: Rng): CashFlowYear {
  const loss = rng.next() < 0.15;
  const npbt = loss ? -step(rng, 10000, 80000, 5000) : step(rng, 100000, 600000, 10000);
  const sold = rng.next() < 0.5;
  const book = sold ? step(rng, 30000, 120000, 5000) : 0;
  const price = sold ? Math.max(0, book + rng.pick([-1, 0, 1]) * step(rng, 5000, 25000, 5000)) : 0;
  const received = rng.next() < 0.5 ? 'interest' : 'dividend';
  const income = maybe(rng, 0.6, () => step(rng, 10000, 40000, 5000));
  const wcIds = ['inventories', 'tradeReceivables', 'tradePayables', ...(rng.next() < 0.5 ? [rng.pick(['prepaidExpenses', 'outstandingExpenses'] as const)] : [])] as WcItem['id'][];
  const wc: WcItem[] = wcIds.map((id) => {
    const small = id === 'prepaidExpenses' || id === 'outstandingExpenses';
    const open = small ? step(rng, 5000, 40000, 5000) : step(rng, 60000, 250000, 10000);
    const change = small ? step(rng, 5000, 15000, 5000) : step(rng, 10000, 60000, 5000);
    return { id, open, close: Math.max(0, open + rng.pick([-1, 1]) * change) };
  });
  const interestPaid = maybe(rng, 0.6, () => step(rng, 10000, 60000, 5000));
  const financing = rng.pick(['shares', 'debentures', 'loan', 'overdraft'] as const);
  return {
    company: rng.pick(COMPANIES),
    npbt,
    depreciation: step(rng, 20000, 120000, 5000),
    goodwill: maybe(rng, 0.35, () => step(rng, 10000, 40000, 5000)),
    sale: sold ? { book, price } : null,
    interestPaid,
    interestReceived: received === 'interest' ? income : 0,
    dividendReceived: received === 'dividend' ? income : 0,
    wc,
    taxPaid: npbt > 0 ? Math.round((npbt * 0.25) / R(5000)) * R(5000) : step(rng, 0, 20000, 5000),
    machineryBought: step(rng, 50000, 400000, 10000),
    investmentsBought: maybe(rng, 0.3, () => step(rng, 20000, 150000, 10000)),
    sharesIssued: financing === 'shares' ? step(rng, 100000, 400000, 10000) : 0,
    debenturesIssued: financing === 'debentures' ? step(rng, 100000, 300000, 10000) : 0,
    loanRepaid: financing === 'loan' ? step(rng, 50000, 200000, 10000) : 0,
    overdraftChange: financing === 'overdraft' ? rng.pick([-1, 1]) * step(rng, 10000, 60000, 5000) : 0,
    dividendPaid: maybe(rng, 0.6, () => step(rng, 20000, 120000, 5000)),
    openingCash: step(rng, 40000, 200000, 5000),
  };
}

/**
 * A made-up year from a seed: a company that is not a financing company, with a closing cash of at least ₹10,000.
 * When a draw would leave too little cash, the company raises the shortfall by an issue of shares.
 */
export function randomYear(seed: number): CashFlowYear {
  const rng = createRng(seed);
  const y = drawYear(rng);
  const closing = statementOf(y).closing;
  if (closing >= R(10000)) return y;
  const short = R(10000) - closing;
  return { ...y, sharesIssued: y.sharesIssued + Math.ceil(short / R(10000)) * R(10000) };
}
