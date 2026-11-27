/**
 * Case studies of Introduction to Accounting, the first topic of Class 11: one small Indian business and the things
 * its owner and its users meet, from the terms of accounting to who needs which information. They stay outside the
 * mock papers (`STAGES_OUTSIDE_PAPERS` in learning/paperBlueprints.ts).
 *
 * Conventions, stated in every case text that relies on them: GST is ignored; trade discount is taken off the list
 * price and never entered in the books; cash discount is worked on the invoice amount after trade discount; stock is
 * valued at cost; capital = assets - liabilities, and an order, enquiry or quotation is not yet a transaction.
 * Every typed part is worked out again by its `verify` from the printed case text.
 */
import type { Rng } from '@/engine/rng';
import { parseRupees } from '@/lib/money-input';
import { caseTemplate, formatINR, rupees } from '../authoring';
import type { CaseTemplate, Distractor } from '../types';

const TOPIC = 'introduction-to-accounting';
const CONCEPT = 'ia-case';
const common = { topicId: TOPIC, conceptId: CONCEPT };

/** A rupee figure as the case prints it. */
const inr = (r: number): string => formatINR(rupees(r));
/** The case text a question was made from. */
const ctx = (q: { context?: string }): string => q.context ?? '';
/** The first rupee figure on the line of the case text that starts with `start`, in whole rupees. */
const figure = (text: string, start: string): number => {
  const line = text.split('\n').find((l) => l.startsWith(start)) ?? '';
  const m = /₹\d(?:[\d,]*\d)?/.exec(line);
  return m ? (parseRupees(m[0]) ?? NaN) / 100 : NaN;
};
/** A whole number written after `label` on a line of the case text ("Units bought: 150"). */
const count = (text: string, label: string): number => Number(new RegExp(`${label}(\\d+)`).exec(text)?.[1]);

/** The answer and its common errors in paise, without a slip that is the answer, a repeat or not above nil. */
function numeric(answer: number, errs: [number, string][]): { answer: number; commonErrors: { value: number; why: string }[] } | null {
  const seen = new Set([answer]);
  const commonErrors = errs.filter(([v]) => v > 0 && Number.isInteger(v) && !seen.has(v) && seen.add(v)).map(([v, why]) => ({ value: rupees(v), why }));
  return commonErrors.length >= 2 ? { answer: rupees(answer), commonErrors } : null;
}

// ---------------------------------------------------------------------------------------------------------------
// 1. The first month of a new business: classify its items, then current assets and capital, then a user's need.
// ---------------------------------------------------------------------------------------------------------------

interface Shop {
  name: string;
  owner: string;
  goods: string;
  asset: string;
  customer: string;
  supplier: string;
}
const NEW_SHOPS: Shop[] = [
  { name: 'Gill Auto Parts, Ludhiana', owner: 'Harjit Gill', goods: 'auto parts', asset: 'display counter', customer: 'Sandhu Motors', supplier: 'Bharat Spares' },
  { name: 'Kaveri Medicals, Mysuru', owner: 'Kaveri Rao', goods: 'medicines', asset: 'refrigerator for medicines', customer: 'Lotus Nursing Home', supplier: 'Deccan Pharma Distributors' },
  { name: 'Bose Stationery Mart, Kolkata', owner: 'Ananya Bose', goods: 'stationery', asset: 'billing computer', customer: 'Sunrise School', supplier: 'Hooghly Paper Agency' },
  { name: 'Lakshmi Agro Inputs, Guntur', owner: 'Lakshmi Reddy', goods: 'seeds and fertilisers', asset: 'storage shed', customer: 'Rythu Farmers\' Group', supplier: 'Godavari Fertilisers' },
  { name: 'Qureshi Footwear, Agra', owner: 'Imran Qureshi', goods: 'footwear', asset: 'shop furniture', customer: 'Taj Uniforms', supplier: 'Agra Leather Works' },
  { name: 'Thomas Hardware, Kottayam', owner: 'Mary Thomas', goods: 'hardware', asset: 'pipe-cutting machine', customer: 'Kerala Builders', supplier: 'Cochin Steel Traders' },
];
const PENDING = ['An order for {g} worth {a} has been placed with a supplier; nothing has been delivered.', 'A quotation of {a} has been received for {g} the shop may buy next month.', 'A customer has asked about {g} worth {a}; no order has been placed.'];

type Ask1 = 'debtor' | 'creditor';
type Ask2 = 'asset' | 'loan';
interface FirstMonth {
  shop: Shop;
  cash: number;
  bank: number;
  asset: number;
  stock: number;
  debtor: number;
  creditor: number;
  loan: number;
  loanYears: number;
  pending: number;
  pendingText: string;
  ask1: Ask1;
  ask2: Ask2;
}

const CLASSES = {
  ca: 'Current asset',
  nca: 'Non-current asset',
  cl: 'Current liability',
  ncl: 'Non-current liability',
  cap: 'Capital',
  inc: 'Income (revenue)',
} as const;
type Cls = keyof typeof CLASSES;
const CLASS_SLIP: Record<Cls, string> = {
  ca: 'Treated it as a current asset, something the business owns that turns into cash within a year',
  nca: 'Treated it as a non-current asset, something the business owns and keeps for years',
  cl: 'Treated it as a current liability, something the business owes and must pay within a year',
  ncl: 'Treated it as a non-current liability, something the business owes and need not pay for more than a year',
  cap: 'Treated it as capital, the owner\'s own stake',
  inc: 'Treated it as an income, something earned',
};
/** A classification part: the right class, the reason, and three close wrong classes. */
function classify(prompt: string, right: Cls, why: string, wrong: Cls[]): { prompt: string; correct: string; distractors: Distractor[]; explanation: string; hints: string[] } {
  return {
    prompt,
    correct: CLASSES[right],
    distractors: wrong.map((k) => ({ text: CLASSES[k], why: `${CLASS_SLIP[k]}; but it ${why}.` })),
    explanation: `${CLASSES[right]}: it ${why}.`,
    hints: ['Owned, or owed? And by when: within a year of the date, or later?', 'Owned and turned into cash within a year: current asset; kept for years: non-current. Owed and due within a year: current liability; later: non-current.'],
  };
}

const firstMonth = caseTemplate<FirstMonth>({
  id: 'case-ia-first-month',
  ...common,
  difficulty: 'easy',
  title: 'The first month of a new shop',
  setup: (rng: Rng) => {
    const shop = rng.pick(NEW_SHOPS);
    const s: FirstMonth = {
      shop,
      cash: rng.step(10000, 60000, 1000),
      bank: rng.step(40000, 250000, 5000),
      asset: rng.step(40000, 200000, 5000),
      stock: rng.step(50000, 300000, 5000),
      debtor: rng.step(10000, 80000, 1000),
      creditor: rng.step(20000, 150000, 5000),
      loan: rng.step(100000, 300000, 25000),
      loanYears: rng.int(3, 6),
      pending: rng.step(10000, 90000, 5000),
      pendingText: rng.pick(PENDING),
      ask1: rng.pick(['debtor', 'creditor'] as const),
      ask2: rng.pick(['asset', 'loan'] as const),
    };
    const assets = s.cash + s.bank + s.asset + s.stock + s.debtor;
    return assets - s.creditor - s.loan >= 50000 ? s : null;
  },
  context: (s) =>
    [
      `${s.shop.owner} opened ${s.shop.name}, a shop selling ${s.shop.goods}, on 1 April. On 30 April its records show:`,
      `Cash in hand: ${inr(s.cash)}`,
      `Balance in the shop's bank account: ${inr(s.bank)}`,
      `Cost of the ${s.shop.asset}, bought for use in the shop: ${inr(s.asset)}`,
      `Unsold ${s.shop.goods}, at cost: ${inr(s.stock)}`,
      `Due from ${s.shop.customer}, for goods sold on credit: ${inr(s.debtor)}`,
      `Due to ${s.shop.supplier}, for goods bought on credit: ${inr(s.creditor)}`,
      `Bank loan, repayable in one sum after ${s.loanYears} years: ${inr(s.loan)}`,
      `Other fact: ${s.pendingText.replace('{g}', s.shop.goods).replace('{a}', inr(s.pending))}`,
    ].join('\n'),
  parts: [
    {
      kind: 'mcq',
      make: (s) =>
        s.ask1 === 'debtor'
          ? classify(`How is the ${inr(s.debtor)} due from ${s.shop.customer} shown in the books of ${s.shop.name}?`, 'ca', 'is owed to the shop by a customer and will be collected within the year', ['cl', 'inc', 'nca'])
          : classify(`How is the ${inr(s.creditor)} due to ${s.shop.supplier} shown in the books of ${s.shop.name}?`, 'cl', 'is owed by the shop to a supplier and must be paid within the credit period, well within a year', ['ca', 'ncl', 'cap']),
    },
    {
      kind: 'mcq',
      make: (s) =>
        s.ask2 === 'asset'
          ? classify(`How is the cost of the ${s.shop.asset} shown in the books of ${s.shop.name}?`, 'nca', 'is owned by the shop and kept for use for many years, not bought to be resold', ['ca', 'inc', 'ncl'])
          : classify(`How is the bank loan shown in the books of ${s.shop.name} on 30 April?`, 'ncl', `is owed to the bank and is not due until ${s.loanYears} years from now, more than a year after 30 April`, ['cl', 'cap', 'nca']),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const ca = s.cash + s.bank + s.stock + s.debtor;
        const n = numeric(ca, [
          [ca + s.asset, `Added the ${s.shop.asset}, which is kept for years and so is a non-current asset.`],
          [ca - s.stock, `Left out the unsold ${s.shop.goods}, which will be sold within the year and so count among the current assets.`],
          [ca + s.pending, 'Counted the other fact as an asset, though no transaction has taken place yet.'],
          [s.cash + s.bank, 'Counted only cash and bank, leaving out stock and the amount due from the customer.'],
        ]);
        return n && {
          prompt: `What is the total of the current assets of ${s.shop.name} on 30 April?`,
          ...n,
          explanation: [
            'Current assets: cash, the bank balance, the unsold goods and the amount due from the customer.',
            `${inr(s.cash)} + ${inr(s.bank)} + ${inr(s.stock)} + ${inr(s.debtor)} = ${inr(ca)}.`,
            `The ${s.shop.asset} is a non-current asset, and the other fact is not a transaction, so neither is counted.`,
          ],
          hints: ['Pick out what the shop owns that will be cash, or used up, within the year.', 'Current assets here: cash, bank, stock and the amount due from the customer. Leave out what is kept for years and what has not happened yet.'],
        };
      },
      verify: (q) => {
        const t = ctx(q);
        const ca = figure(t, 'Cash in hand') + figure(t, 'Balance in the') + figure(t, 'Unsold') + figure(t, 'Due from');
        return q.answer === rupees(ca);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const assets = s.cash + s.bank + s.asset + s.stock + s.debtor;
        const liabilities = s.creditor + s.loan;
        const capital = assets - liabilities;
        const n = numeric(capital, [
          [assets + liabilities, 'Added the liabilities to the assets instead of deducting them.'],
          [assets, 'Gave the total of the assets and did not deduct the liabilities.'],
          [assets - s.creditor, 'Deducted the supplier but not the bank loan, which is owed to an outsider too.'],
          [capital - s.pending, 'Deducted the other fact as if it were a liability, though no transaction has taken place yet.'],
        ]);
        return n && {
          prompt: `What is ${s.shop.owner}'s capital in ${s.shop.name} on 30 April?`,
          ...n,
          explanation: [
            `Assets = ${inr(s.cash)} + ${inr(s.bank)} + ${inr(s.asset)} + ${inr(s.stock)} + ${inr(s.debtor)} = ${inr(assets)}.`,
            `Liabilities = ${inr(s.creditor)} + ${inr(s.loan)} = ${inr(liabilities)}.`,
            `Capital = Assets - Liabilities = ${inr(assets)} - ${inr(liabilities)} = ${inr(capital)}.`,
            'The other fact is not yet a transaction, so it is left out.',
          ],
          hints: ['What the business owns, less what it owes to outsiders, belongs to the owner.', 'Capital = Assets - Liabilities. Add every asset, add every liability, leave out what has not happened, then deduct.'],
        };
      },
      verify: (q) => {
        const t = ctx(q);
        const assets = figure(t, 'Cash in hand') + figure(t, 'Balance in the') + figure(t, 'Cost of') + figure(t, 'Unsold') + figure(t, 'Due from');
        return q.answer === rupees(assets - figure(t, 'Due to') - figure(t, 'Bank loan'));
      },
    },
    {
      kind: 'mcq',
      make: (s) => ({
        prompt: `Before agreeing to the loan, the bank studied the accounts that ${s.shop.owner} gave it. What did the bank mainly want to know?`,
        correct: 'Whether the shop could pay the interest regularly and repay the loan when due',
        distractors: [
          { text: 'Whether the shop would pay for goods bought on credit within the credit period', why: 'That is what a supplier selling on credit wants to know, not a lender.' },
          { text: 'Whether the profit on which income tax is charged was correctly worked out', why: 'That is the interest of the income tax department.' },
          { text: 'Which goods sell fastest, to plan next month\'s buying', why: 'That is what the owner or a manager inside the shop wants to know.' },
          { text: 'Whether the shop will keep supplying goods and honour its warranties', why: 'That is the interest of a customer who depends on the shop.' },
        ],
        explanation: 'A bank is an external user that lends money: its question is whether the interest and the loan will be paid on time, which it reads from the position (what is owned and owed) and the flow of cash.',
        hints: ['Think of the decision the bank had to take, and what could go wrong for it.', 'A lender looks at repayment: interest on time and the loan back when due.'],
      }),
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 2. A new machine: capital or revenue, item by item.
// ---------------------------------------------------------------------------------------------------------------

interface Works {
  name: string;
  asset: string;
  old: string;
  price: [number, number, number];
}
const WORKS: Works[] = [
  { name: 'Sharma Flour Mill, Indore', asset: 'a grinding machine', old: 'its old grinding machine', price: [150000, 400000, 10000] },
  { name: 'Joseph Printers, Kochi', asset: 'an offset printing machine', old: 'an old cutting machine', price: [300000, 800000, 25000] },
  { name: 'Rathore Packaging, Jodhpur', asset: 'a carton-making machine', old: 'an old sealing machine', price: [200000, 600000, 10000] },
  { name: 'Singh Dairy, Karnal', asset: 'a milk chilling machine', old: 'an old milk cooler', price: [150000, 500000, 10000] },
  { name: 'Mehta Engineering Works, Rajkot', asset: 'a lathe machine', old: 'an old drilling machine', price: [200000, 500000, 10000] },
  { name: 'Ansari Garments, Bhiwandi', asset: 'an embroidery machine', old: 'an old sewing machine', price: [150000, 450000, 10000] },
];
type Special = 'shed' | 'carriage' | 'insurance' | 'whitewash';
interface Machine {
  w: Works;
  price: number;
  carriage: number;
  install: number;
  shed: number;
  service: number;
  insurance: number;
  whitewash: number;
  old: number;
  special: Special;
}
const CAP_REV = {
  cx: 'Capital expenditure',
  rx: 'Revenue expenditure',
  cr: 'Capital receipt',
  rr: 'Revenue receipt',
} as const;
type CapRev = keyof typeof CAP_REV;
const CAP_REV_SLIP: Record<CapRev, string> = {
  cx: 'Treated it as capital expenditure, spending that buys a lasting asset or gets one ready for use',
  rx: 'Treated it as revenue expenditure, a running cost of the year',
  cr: 'Treated it as a capital receipt, money from the owner, a loan or the sale of a long-term asset',
  rr: 'Treated it as a revenue receipt, money earned from the regular work of the business',
};
const CAP_REV_HINTS = ['Is money going out or coming in? Then: does it concern a lasting asset, or the running of this year?', 'Buying an asset or getting it ready to work: capital expenditure. Keeping it working this year: revenue expenditure. Selling a long-term asset: capital receipt.'];
const capRev = (prompt: string, right: CapRev, why: string) => ({
  prompt,
  correct: CAP_REV[right],
  distractors: (Object.keys(CAP_REV) as CapRev[]).filter((k) => k !== right).map((k) => ({ text: CAP_REV[k], why: `${CAP_REV_SLIP[k]}; but it ${why}.` })),
  explanation: `${CAP_REV[right]}: it ${why}.`,
  hints: CAP_REV_HINTS,
});
const SPECIAL_ASK: Record<Special, { line: string; right: CapRev; why: string }> = {
  shed: { line: 'Wages paid to the firm\'s own workers for building a shed for the machine', right: 'cx', why: 'is spent on creating a lasting asset (the shed), so it is part of a capital asset, though wages are usually a running cost' },
  carriage: { line: 'Carriage paid to bring the new machine to the premises', right: 'cx', why: 'is a cost of getting the new machine ready for use, so it is added to the cost of the machine' },
  insurance: { line: 'Insurance of the new machine for the year', right: 'rx', why: 'protects the machine for this year only; its benefit is used up within the year' },
  whitewash: { line: 'Whitewashing of the premises, done every year', right: 'rx', why: 'is a routine cost repeated every year, whose benefit is used up within the year' },
};

const newMachine = caseTemplate<Machine>({
  id: 'case-ia-new-machine',
  ...common,
  difficulty: 'medium',
  title: 'Capital or revenue: a new machine',
  setup: (rng: Rng) => {
    const w = rng.pick(WORKS);
    const price = rng.step(...w.price);
    const s: Machine = {
      w,
      price,
      carriage: rng.step(2000, 15000, 500),
      install: rng.step(3000, 20000, 500),
      shed: rng.step(10000, 60000, 1000),
      service: rng.step(2000, 12000, 500),
      insurance: rng.step(2000, 10000, 500),
      whitewash: rng.step(5000, 20000, 1000),
      old: rng.step(10000, 60000, 1000),
      special: rng.pick(['shed', 'carriage', 'insurance', 'whitewash'] as const),
    };
    return s;
  },
  context: (s) =>
    [
      `During the year ended 31 March, ${s.w.name} bought ${s.w.asset} and paid or received the following.`,
      `Price of the new machine: ${inr(s.price)}`,
      `Carriage paid to bring the new machine to the premises: ${inr(s.carriage)}`,
      `Installation charges of the new machine: ${inr(s.install)}`,
      `Wages paid to the firm's own workers for building a shed for the machine: ${inr(s.shed)}`,
      `Routine servicing of the new machine during the year: ${inr(s.service)}`,
      `Insurance of the new machine for the year: ${inr(s.insurance)}`,
      `Whitewashing of the premises, done every year: ${inr(s.whitewash)}`,
      `Received from the sale of ${s.w.old}: ${inr(s.old)}`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const cost = s.price + s.carriage + s.install;
        const n = numeric(cost, [
          [s.price, 'Took the price alone; carriage and installation are needed before the machine can work, so they are part of its cost.'],
          [s.price + s.install, 'Left out the carriage, which is part of the cost of getting the machine ready.'],
          [cost + s.service + s.insurance, 'Added the servicing and the insurance of the year, which are running costs and not part of the cost of the machine.'],
          [cost - s.old, 'Deducted the sale of the old machine, which is a separate capital receipt.'],
        ]);
        return n && {
          prompt: `At what amount is the new machine recorded in the books of ${s.w.name}?`,
          ...n,
          explanation: [
            'The cost of an asset is everything paid to buy it and get it ready for use.',
            `Price ${inr(s.price)} + carriage ${inr(s.carriage)} + installation ${inr(s.install)} = ${inr(cost)}.`,
            'Servicing and insurance keep it working this year: they are revenue expenditure.',
          ],
          hints: ['Which payments had to be made before the machine could start work?', 'Cost of the machine = price + carriage to bring it + installation. Running costs of the year are not part of it.'],
        };
      },
      verify: (q) => {
        const t = ctx(q);
        return q.answer === rupees(figure(t, 'Price of the new') + figure(t, 'Carriage paid') + figure(t, 'Installation'));
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const ask = SPECIAL_ASK[s.special];
        return capRev(`How is this item classified: "${ask.line}"?`, ask.right, ask.why);
      },
    },
    {
      kind: 'mcq',
      make: (s) => capRev(`How is the ${inr(s.old)} received from the sale of ${s.w.old} classified?`, 'cr', 'comes from selling a long-term asset, not from the regular work of the business'),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const rev = s.service + s.insurance + s.whitewash;
        const n = numeric(rev, [
          [rev + s.carriage + s.install, 'Counted the carriage and installation of the new machine, which are part of its cost (capital).'],
          [rev + s.shed, 'Counted the wages for building the shed, which create a lasting asset (capital).'],
          [s.service + s.insurance, 'Left out the yearly whitewashing, a routine running cost.'],
          [rev - s.insurance, 'Left out the insurance of the year, a running cost.'],
        ]);
        return n && {
          prompt: `What is the total revenue expenditure of ${s.w.name} among these items?`,
          ...n,
          explanation: [
            'Revenue expenditure: the running costs whose benefit is used up within the year.',
            `Servicing ${inr(s.service)} + insurance ${inr(s.insurance)} + whitewashing ${inr(s.whitewash)} = ${inr(rev)}.`,
            'The price, carriage, installation and the shed are capital expenditure; the sale of the old machine is a receipt.',
          ],
          hints: CAP_REV_HINTS,
        };
      },
      verify: (q) => {
        const t = ctx(q);
        return q.answer === rupees(figure(t, 'Routine servicing') + figure(t, 'Insurance of') + figure(t, 'Whitewashing'));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const cap = s.price + s.carriage + s.install + s.shed;
        const n = numeric(cap, [
          [cap - s.shed, 'Left out the wages for building the shed, which create a lasting asset.'],
          [cap + s.old, 'Added the sale of the old machine, which is a capital receipt, not an expenditure.'],
          [cap + s.service, 'Added the routine servicing, a running cost of the year.'],
          [s.price, 'Counted the price of the machine alone.'],
        ]);
        return n && {
          prompt: `What is the total capital expenditure of ${s.w.name} among these items?`,
          ...n,
          explanation: [
            'Capital expenditure: buying a lasting asset or getting it ready, and creating one.',
            `Price ${inr(s.price)} + carriage ${inr(s.carriage)} + installation ${inr(s.install)} + wages for the shed ${inr(s.shed)} = ${inr(cap)}.`,
          ],
          hints: CAP_REV_HINTS,
        };
      },
      verify: (q) => {
        const t = ctx(q);
        return q.answer === rupees(figure(t, 'Price of the new') + figure(t, 'Carriage paid') + figure(t, 'Installation') + figure(t, 'Wages paid'));
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 3. A purchase with two discounts, then the stock at the end of the month.
// ---------------------------------------------------------------------------------------------------------------

interface Dealer {
  name: string;
  goods: string;
  unit: string;
  list: [number, number, number];
  sell: number;
}
const DEALERS: Dealer[] = [
  { name: 'Sai Electricals, Vijayawada', goods: 'ceiling fans', unit: 'fans', list: [1200, 3000, 100], sell: 30 },
  { name: 'Fashion Point, Surat', goods: 'kurtas', unit: 'kurtas', list: [400, 900, 100], sell: 40 },
  { name: 'Vidya Stationers, Patna', goods: 'school bags', unit: 'bags', list: [300, 700, 100], sell: 35 },
  { name: 'Gupta Utensils, Moradabad', goods: 'steel utensil sets', unit: 'sets', list: [500, 1200, 100], sell: 30 },
  { name: 'Comfort Shoes, Kanpur', goods: 'pairs of school shoes', unit: 'pairs', list: [400, 1200, 100], sell: 40 },
  { name: 'Annapurna Kitchenware, Coimbatore', goods: 'mixer grinders', unit: 'mixers', list: [1500, 4000, 100], sell: 25 },
];
interface Month {
  d: Dealer;
  open: number;
  bought: number;
  sold: number;
  list: number;
  td: number;
  cd: number;
  unitCost: number;
  sellPrice: number;
}

const purchaseMonth = caseTemplate<Month>({
  id: 'case-ia-discounts-and-stock',
  ...common,
  difficulty: 'medium',
  title: 'Two discounts and the stock in hand',
  setup: (rng: Rng) => {
    const d = rng.pick(DEALERS);
    const list = rng.step(...d.list);
    const td = rng.pick([10, 20, 25]);
    const cd = rng.pick([2, 5]);
    const unitCost = (list * (100 - td)) / 100;
    const open = rng.step(10, 60, 5);
    const bought = rng.step(50, 300, 50);
    const sold = rng.step(30, open + bought - 10, 5);
    const sellPrice = Math.round((unitCost * (100 + d.sell)) / 100);
    if (!Number.isInteger(unitCost) || (bought * unitCost * cd) % 100 !== 0) return null;
    return { d, open, bought, sold, list, td, cd, unitCost, sellPrice };
  },
  context: (s) =>
    [
      `${s.d.name} sells ${s.d.goods}. Its figures for May (ignore GST):`,
      `Opening stock on 1 May: ${s.open} ${s.d.unit}, which cost ${inr(s.open * s.unitCost)} in all`,
      `Units bought on 6 May: ${s.bought} ${s.d.unit}, at a list price of ${inr(s.list)} each`,
      `Trade discount allowed by the wholesaler: ${s.td}% of the list price`,
      `Cash discount: ${s.cd}% of the invoice amount, for payment within 10 days`,
      'The invoice was paid in full on 14 May.',
      `Units sold during May: ${s.sold}, at ${inr(s.sellPrice)} each`,
      'The cost of each unit was the same all month. Stock is valued at cost.',
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const listTotal = s.bought * s.list;
        const invoice = s.bought * s.unitCost;
        const n = numeric(invoice, [
          [listTotal, 'Recorded the purchase at the list price; the trade discount is taken off before the purchase is recorded.'],
          [listTotal - invoice, 'Gave the amount of the trade discount instead of the purchase.'],
          [invoice - (invoice * s.cd) / 100, 'Took off the cash discount too; the purchase is recorded at the invoice amount, and the cash discount separately.'],
        ]);
        return n && {
          prompt: `At what amount is the purchase of 6 May recorded in the books of ${s.d.name}?`,
          ...n,
          explanation: [
            `List price = ${s.bought} × ${inr(s.list)} = ${inr(listTotal)}.`,
            `Trade discount = ${s.td}% of ${inr(listTotal)} = ${inr(listTotal - invoice)}.`,
            `Purchase recorded = ${inr(listTotal)} - ${inr(listTotal - invoice)} = ${inr(invoice)}. The trade discount is never entered in the books.`,
          ],
          hints: ['Which discount comes off before anything is written in the books?', 'Purchase recorded = list price × units, less trade discount. The cash discount is recorded separately, when payment is made.'],
        };
      },
      verify: (q) => {
        const t = ctx(q);
        const td = Number(/Trade discount allowed by the wholesaler: (\d+)%/.exec(t)?.[1]);
        return q.answer === rupees((count(t, 'Units bought on 6 May: ') * figure(t, 'Units bought') * (100 - td)) / 100);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const listTotal = s.bought * s.list;
        const invoice = s.bought * s.unitCost;
        const cash = (invoice * s.cd) / 100;
        const n = numeric(cash, [
          [(listTotal * s.cd) / 100, 'Worked the cash discount on the list price; it is worked on the invoice amount after trade discount.'],
          [listTotal - invoice, 'Gave the trade discount instead of the cash discount.'],
          [invoice - cash, 'Gave the amount paid instead of the discount.'],
        ]);
        return n && {
          prompt: `How much cash discount did ${s.d.name} earn by paying on 14 May?`,
          ...n,
          explanation: [`Invoice amount = ${inr(invoice)} (after trade discount).`, `Cash discount = ${s.cd}% of ${inr(invoice)} = ${inr(cash)}.`, `Amount paid = ${inr(invoice)} - ${inr(cash)} = ${inr(invoice - cash)}.`],
          hints: ['On which amount is a cash discount worked: the list price or the invoice?', 'Cash discount = rate × invoice amount after trade discount.'],
        };
      },
      verify: (q) => {
        const t = ctx(q);
        const td = Number(/Trade discount allowed by the wholesaler: (\d+)%/.exec(t)?.[1]);
        const cd = Number(/Cash discount: (\d+)%/.exec(t)?.[1]);
        const invoice = (count(t, 'Units bought on 6 May: ') * figure(t, 'Units bought') * (100 - td)) / 100;
        return q.answer === rupees((invoice * cd) / 100);
      },
    },
    {
      kind: 'mcq',
      make: (s) => ({
        prompt: `How do the books of ${s.d.name} show the two discounts on the purchase of 6 May?`,
        correct: 'The trade discount is not entered at all; the cash discount is entered as discount received, an income',
        distractors: [
          { text: 'Both discounts are entered as discount received', why: 'Entered the trade discount, which only fixes the price and is never written in the books.' },
          { text: 'Neither discount is entered in the books', why: 'Left out the cash discount, which is a real gain for paying early and is recorded.' },
          { text: 'The trade discount is entered as discount received; the cash discount is not entered', why: 'Reversed the two: it is the cash discount that is recorded, not the trade discount.' },
          { text: 'The cash discount is entered as discount allowed, an expense', why: 'Took the buyer for the seller: the seller allows the discount; the buyer receives it.' },
        ],
        explanation: 'Trade discount is taken off the list price before the purchase is recorded, so it never appears in the books. Cash discount is earned by paying early: the buyer records it as discount received.',
        hints: ['Ask what each discount is for: buying in quantity, or paying early?', 'Trade discount: not recorded. Cash discount: recorded, as discount received by the buyer and discount allowed by the seller.'],
      }),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const left = s.open + s.bought - s.sold;
        const value = left * s.unitCost;
        const n = numeric(value, [
          [left * s.sellPrice, 'Valued the unsold units at the selling price; stock is valued at cost.'],
          [(s.bought - s.sold) * s.unitCost, 'Left out the opening stock when counting the units left.'],
          [left * s.list, 'Valued the units at the list price; the cost is the price after trade discount.'],
          [(s.open + s.bought) * s.unitCost, 'Did not deduct the units sold.'],
        ]);
        return n && {
          prompt: `What is the closing stock of ${s.d.name} on 31 May, valued at cost?`,
          ...n,
          explanation: [
            `Units left = ${s.open} + ${s.bought} - ${s.sold} = ${left}.`,
            `Cost of one unit = ${inr(s.list)} less ${s.td}% = ${inr(s.unitCost)}.`,
            `Closing stock = ${left} × ${inr(s.unitCost)} = ${inr(value)}.`,
          ],
          hints: ['First count the units left; then decide which price to value them at.', 'Units left = opening + bought - sold; value them at cost, the price after trade discount.'],
        };
      },
      verify: (q) => {
        const t = ctx(q);
        const open = count(t, 'Opening stock on 1 May: ');
        const left = open + count(t, 'Units bought on 6 May: ') - count(t, 'Units sold during May: ');
        return q.answer === rupees((left * figure(t, 'Opening stock')) / open);
      },
    },
  ],
});

const cases: CaseTemplate[] = [firstMonth, newMachine, purchaseMonth];

export default cases;
