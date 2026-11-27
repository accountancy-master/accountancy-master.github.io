import type { AccountQuestion, AccountSide, Difficulty, JournalSetQuestion } from '@/content/types';
import { CLASS11_ACCOUNTS, creditor, debtor, normalSide, resolveAccount } from '@/engine/accounts';
import { listBalances, post, trialBalance, type Ledger } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import { parseRupees } from '@/lib/money-input';
import type { Rng } from '@/engine/rng';
import { accountTemplate, amount, factsTemplate, crSide, drSide, formatINR as inr, interleave, journalSetTemplate, mcqTemplate, numericTemplate, rupees } from '../authoring';
import type { AccountParts, Distractor, FormatRowParts, JournalSetParts, SetTransaction, Template } from '../types';
import { assertionReasonTemplate } from '../assertionReason';

const T = 'final-accounts';

/** Concepts of this topic (the pack lists the same ids). */
const C = {
  users: 'fa-users',
  capRev: 'fa-capital-revenue',
  trading: 'fa-trading',
  classify: 'fa-classify',
  pl: 'fa-pl',
  bs: 'fa-balance-sheet',
  capital: 'fa-capital',
  whole: 'fa-whole',
} as const;

// ---------------------------------------------------------------------------------------------------------------
// Shared model: a list of "Name: ₹amount" lines, the roles of the names, and a parser that reads a prompt back.
// ---------------------------------------------------------------------------------------------------------------

type Item = readonly [label: string, amount: number];
const sum = (items: readonly Item[]): number => items.reduce((s, i) => s + i[1], 0);
const rows = (items: readonly Item[]): string => items.map(([l, a]) => `${l}: ${inr(a)}`).join('\n');
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const DIRECT = ['Wages', 'Carriage inwards', 'Freight inwards', 'Power and fuel'];
/** Every indirect expense and income that a net-profit question may list. */
const IND_EXP = [
  'Rent paid', 'Salaries', 'Stationery', 'Advertisement', 'Carriage outwards', 'Insurance', 'Telephone charges',
  'Postage', 'Travelling expenses', 'Bank charges', 'Discount allowed', 'Commission paid', 'Legal charges',
  'Audit fees', 'General expenses', 'Charity',
];
const IND_INC = ['Commission received', 'Discount received', 'Rent received', 'Miscellaneous income'];
const FIN_EXP = ['Interest on bank loan', 'Loss on sale of old furniture'];
const FIN_INC = ['Interest received', 'Dividend received'];
/**
 * Operating-profit questions follow the Class 11 treatment: interest, dividends, rent received, charity and a profit
 * or loss on the sale of a fixed asset are non-operating. They list only items whose side of that line no textbook
 * disputes, so bank charges and miscellaneous income (which some books call financial or non-operating) stay out.
 */
const OPER_EXP = IND_EXP.filter((l) => l !== 'Bank charges' && l !== 'Charity');
const OPER_INC = ['Commission received', 'Discount received'];
const NONOP_EXP = [...FIN_EXP, 'Charity'];
const NONOP_INC = [...FIN_INC, 'Rent received', 'Profit on sale of old machinery'];
const FIXED = ['Land', 'Building', 'Machinery', 'Furniture', 'Vehicles', 'Computers'];
const CUR_ASSETS = ['Cash in hand', 'Cash at bank', 'Sundry debtors', 'Bills receivable'];
const CUR_LIAB = ['Sundry creditors', 'Bills payable', 'Bank overdraft'];
const LT_LIAB = ['Long-term bank loan'];

type Role =
  | 'os' | 'pur' | 'purRet' | 'sales' | 'salesRet' | 'direct' | 'opExp' | 'nonOpExp' | 'opInc' | 'nonOpInc' | 'cs'
  | 'drawings' | 'capital' | 'addCapital' | 'fixed' | 'curAsset' | 'curLiab' | 'ltLiab' | 'gp' | 'np' | 'adjPur';
const ROLES = new Map<string, Role>();
const roleOf = (role: Role, labels: string[]) => labels.forEach((l) => ROLES.set(l, role));
roleOf('os', ['Opening stock']);
roleOf('pur', ['Purchases']);
roleOf('purRet', ['Purchases return']);
roleOf('sales', ['Sales']);
roleOf('salesRet', ['Sales return']);
roleOf('direct', DIRECT);
// Direct expenses that only the templates of the quality pass list (see `drawFitting`); no older prompt has them.
roleOf('direct', ['Import duty', 'Dock dues', 'Factory lighting']);
roleOf('adjPur', ['Adjusted purchases']);
roleOf('opExp', IND_EXP.filter((l) => !NONOP_EXP.includes(l)));
roleOf('nonOpExp', NONOP_EXP);
roleOf('opInc', IND_INC.filter((l) => !NONOP_INC.includes(l)));
roleOf('nonOpInc', NONOP_INC);
roleOf('cs', ['Closing stock']);
roleOf('drawings', ['Drawings']);
roleOf('capital', ['Capital', 'Opening capital']);
roleOf('addCapital', ['Additional capital introduced']);
roleOf('fixed', FIXED);
roleOf('curAsset', CUR_ASSETS);
roleOf('curLiab', CUR_LIAB);
roleOf('ltLiab', LT_LIAB);
roleOf('gp', ['Gross profit']);
roleOf('np', ['Net profit']);

type Figures = Record<Role, number>;

/** Reads the "Name: ₹amount" lines of a prompt back into totals by role (the independent half of every `verify`). */
function figures(prompt: string): Figures {
  const f = {} as Figures;
  for (const r of new Set(ROLES.values())) f[r] = 0;
  for (const line of prompt.split('\n')) {
    const m = /^(.+): (₹[\d,]+)$/.exec(line.trim());
    if (!m) continue;
    const role = ROLES.get(m[1]);
    const p = parseRupees(m[2]);
    if (role && p !== null) f[role] += p;
  }
  return f;
}
const cogsOf = (f: Figures): number => f.os + f.pur - f.purRet + f.direct - f.cs;
const grossOf = (f: Figures): number => f.sales - f.salesRet - cogsOf(f);
/** Indirect incomes less indirect expenses: what the Profit and Loss Account adds to the gross profit. */
const indirectOf = (f: Figures): number => f.opInc + f.nonOpInc - f.opExp - f.nonOpExp;
const netOf = (f: Figures): number => grossOf(f) + indirectOf(f);

const draw = (rng: Rng, pool: string[], n: number, min: number, max: number, step: number): Item[] =>
  rng.shuffle(pool).slice(0, n).map((l) => [l, amount(rng, min, max, step)] as const);

const OWNERS: [string, string][] = [
  ['Ramesh Iyer', 'a cloth merchant'], ['Fatima Khan', 'a stationery wholesaler'], ['Gurpreet Singh', 'a hardware dealer'],
  ['Lakshmi Narayanan', 'a grocery wholesaler'], ['Sunil Deshmukh', 'a footwear trader'], ['Meena Patel', 'a dealer in electrical goods'],
  ['Arjun Nair', 'a spice trader'], ['Kavita Sharma', 'a bookseller'], ['Imran Sheikh', 'a mobile phone retailer'],
  ['Deepa Menon', 'a crockery trader'],
];
/**
 * Small manufacturers, for the questions whose direct expenses include wages, power and fuel or factory lighting: a
 * bookseller or a mobile retailer does not run workshop machines. Used from version 2 of the templates that drew those
 * heads for a trader (see `drawFitting`); the traders above keep carriage, freight and duties on goods bought.
 */
const MAKERS: [string, string][] = [
  ['Harish Bansal', 'the owner of a small flour mill'], ['Nirmala Rao', 'the owner of a furniture workshop'],
  ['Joseph Thomas', 'the owner of a bakery'], ['Rekha Jain', 'the owner of a garment-stitching unit'],
  ['Manoj Yadav', 'the owner of a small printing press'], ['Salma Ansari', 'a maker of leather bags'],
];
const TRADER_DIRECT = ['Carriage inwards', 'Freight inwards', 'Import duty', 'Dock dues'];
const MAKER_DIRECT = ['Wages', 'Power and fuel', 'Factory lighting', 'Carriage inwards', 'Freight inwards'];
const YEAR = 'for the year ended 31 March';
/** A Balance Sheet shows the position on a date, so its questions say "as at". */
const AS_AT = 'as at 31 March';
/** The opening sentence of a trial-balance style prompt. */
function intro(rng: Rng, what = 'the following balances', when = YEAR): string {
  return introOf(rng, rng.pick(OWNERS), what, when);
}
/** The opening sentence for a business already chosen. */
function introOf(rng: Rng, [name, trade]: [string, string], what = 'the following balances', when = YEAR): string {
  return rng.pick([
    `${name}, ${trade}, supplies ${what} ${when}:`,
    `The books of ${name}, ${trade}, show ${what} ${when}:`,
    `The records of ${name}, ${trade}, give ${what} ${when}:`,
  ]);
}
/**
 * Closing stock is valued at the year end, so it stands outside the trial balance and is given after it. (A closing
 * stock listed inside a trial balance would mean it has already been set off against purchases, and it would then
 * appear only in the Balance Sheet.)
 */
const closingNote = (cs: number): string => `The closing stock at the year end is not in the trial balance:\nClosing stock: ${inr(cs)}`;

// ---------------------------------------------------------------------------------------------------------------
// Drawing the figures of a Trading Account (so that the gross profit is whole, positive and known) and a P&L account.
// ---------------------------------------------------------------------------------------------------------------

interface Trading {
  os: number; pur: number; purRet: number; sales: number; salesRet: number; directs: Item[]; cs: number;
  dir: number; netPur: number; netSales: number; cogs: number; gp: number;
}

function drawTrading(rng: Rng, o: { returns: boolean; direct: number; gp?: [number, number]; pool?: string[] }): Trading | null {
  const os = amount(rng, 20000, 120000, 5000);
  const pur = amount(rng, 150000, 600000, 5000);
  const purRet = o.returns ? amount(rng, 5000, 30000, 1000) : 0;
  const directs = draw(rng, o.pool ?? DIRECT, o.direct, 5000, 40000, 1000);
  const cs = amount(rng, 20000, 140000, 5000);
  const dir = sum(directs);
  const netPur = pur - purRet;
  const cogs = os + netPur + dir - cs;
  if (cogs < rupees(100000)) return null;
  const [g1, g2] = o.gp ?? [40000, 200000];
  const gp = amount(rng, g1, g2, 5000);
  const salesRet = o.returns ? amount(rng, 4000, 25000, 1000) : 0;
  const netSales = cogs + gp;
  return { os, pur, purRet, sales: netSales + salesRet, salesRet, directs, cs, dir, netPur, netSales, cogs, gp };
}

/** The Trading Account lines in the order of a trial balance (with the closing stock last). */
function tradingRows(t: Trading, o: { returns?: boolean; closing?: boolean } = {}): Item[] {
  const r = o.returns ?? t.purRet > 0;
  return [
    ['Opening stock', t.os],
    ['Purchases', t.pur],
    ...(r ? ([['Purchases return', t.purRet]] as Item[]) : []),
    ['Sales', t.sales],
    ...(r ? ([['Sales return', t.salesRet]] as Item[]) : []),
    ...t.directs,
    ...(o.closing === false ? [] : ([['Closing stock', t.cs]] as Item[])),
  ];
}

/**
 * A Trading Account and a business that fits it: half the time a small manufacturer, whose direct expenses may be wages,
 * power and fuel or factory lighting, and otherwise a trader, whose direct expenses are carriage, freight and duties
 * on goods bought. The business is drawn after the figures.
 */
function drawFitting(rng: Rng, o: { returns: boolean; direct: number; gp?: [number, number] }): { t: Trading; who: [string, string] } | null {
  const maker = rng.next() < 0.5;
  const t = drawTrading(rng, { ...o, pool: maker ? MAKER_DIRECT : TRADER_DIRECT });
  return t && { t, who: rng.pick(maker ? MAKERS : OWNERS) };
}

function tradingWorking(t: Trading): string[] {
  const out: string[] = [];
  const returns = t.purRet > 0;
  if (returns) {
    out.push(`Net sales = Sales − Sales return = ${inr(t.sales)} − ${inr(t.salesRet)} = ${inr(t.netSales)}.`);
    out.push(`Net purchases = Purchases − Purchases return = ${inr(t.pur)} − ${inr(t.purRet)} = ${inr(t.netPur)}.`);
  }
  // Without returns the purchases and the sales are already the net figures, so the working calls them by their names.
  out.push(
    `Cost of goods sold = Opening stock + ${returns ? 'Net purchases' : 'Purchases'} + Direct expenses − Closing stock = ${inr(t.os)} + ${inr(t.netPur)} + ${inr(t.dir)} − ${inr(t.cs)} = ${inr(t.cogs)}.`,
  );
  out.push(`Gross profit = ${returns ? 'Net sales' : 'Sales'} − Cost of goods sold = ${inr(t.netSales)} − ${inr(t.cogs)} = ${inr(t.gp)}.`);
  return out;
}

interface Indirect { exps: Item[]; incs: Item[]; nonExp: Item[]; nonInc: Item[]; np: number; E: number; I: number }
/** `operating` keeps to the items an operating-profit question may list (see OPER_EXP). */
function drawIndirect(
  rng: Rng, gp: number, o: { exp: number; inc: number; nonExp?: number; nonInc?: number; operating?: boolean },
): Indirect | null {
  const exps = draw(rng, o.operating ? OPER_EXP : IND_EXP, o.exp, 3000, 22000, 1000);
  const incs = draw(rng, o.operating ? OPER_INC : IND_INC, o.inc, 2000, 15000, 1000);
  const nonExp = draw(rng, o.operating ? NONOP_EXP : FIN_EXP, o.nonExp ?? 0, 3000, 18000, 1000);
  const nonInc = draw(rng, o.operating ? NONOP_INC : FIN_INC, o.nonInc ?? 0, 2000, 15000, 1000);
  const E = sum(exps) + sum(nonExp);
  const I = sum(incs) + sum(nonInc);
  const np = gp - E + I;
  if (np < rupees(10000)) return null;
  return { exps, incs, nonExp, nonInc, np, E, I };
}

const plWorking = (gp: number, x: Indirect): string[] => [
  `Net profit = Gross profit − Indirect expenses + Indirect incomes = ${inr(gp)} − ${inr(x.E)} + ${inr(x.I)} = ${inr(x.np)}.`,
];

// ---------------------------------------------------------------------------------------------------------------
// EASY, numeric
// ---------------------------------------------------------------------------------------------------------------

const faNetSales = numericTemplate({
  id: 'fa-net-sales', topicId: T, conceptId: C.trading, difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const gross = amount(rng, 80000, 600000, 10000);
    const ret = amount(rng, 3000, 40000, 1000);
    const net = gross - ret;
    const sales = rng.next() < 0.5;
    const [label, retLabel, noun] = sales ? ['Sales', 'Sales return', 'sales'] : ['Purchases', 'Purchases return', 'purchases'];
    const lead = rng.pick([
      `A trader's books show:`,
      `Extract from the books of a small business:`,
      `At the end of the year a shop's accounts show:`,
    ]);
    return {
      prompt: `${lead}\n${rows([[label, gross], [retLabel, ret]])}\nWhat are the net ${noun} for the year?`,
      answer: net,
      commonErrors: [
        { value: gross + ret, why: `Added the returns to the ${noun} instead of deducting them.` },
        { value: gross, why: `Gave the ${noun} without deducting the returns.` },
        { value: ret, why: 'Gave the returns, not the net figure.' },
      ],
      explanation: [`Net ${noun} = ${cap(noun)} − ${cap(noun)} return.`, `${inr(gross)} − ${inr(ret)} = ${inr(net)}.`],
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    return q.answer === f.sales - f.salesRet + f.pur - f.purRet;
  },
});

// Version 2: the business fits its direct expenses (no wages or power and fuel for a bookseller).
const faGpBasic = numericTemplate({
  id: 'fa-gp-basic', version: 2, topicId: T, conceptId: C.trading, difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const fit = drawFitting(rng, { returns: false, direct: rng.pick([1, 1, 2]) });
    if (!fit) return null;
    const { t, who } = fit;
    return {
      prompt: `${introOf(rng, who, 'these figures')}\n${rows(tradingRows(t))}\nCalculate the gross profit.`,
      answer: t.gp,
      commonErrors: [
        { value: t.gp + t.dir, why: 'Left the direct expenses out of the Trading Account.' },
        { value: t.cogs, why: 'Stopped at the cost of goods sold and did not deduct it from sales.' },
        { value: t.gp - t.cs, why: 'Forgot the closing stock, so the cost of goods sold came out too high.' },
        { value: t.gp - 2 * t.cs, why: 'Added the closing stock to the cost instead of deducting it.' },
        { value: t.gp - t.dir, why: 'Deducted the direct expenses twice.' },
      ],
      explanation: tradingWorking(t),
    };
  },
  verify: (q) => grossOf(figures(q.prompt)) === q.answer,
});

const faCogsBasic = numericTemplate({
  id: 'fa-cogs-basic', topicId: T, conceptId: C.trading, difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const t = drawTrading(rng, { returns: false, direct: rng.pick([1, 2]) });
    if (!t) return null;
    const items = tradingRows(t).filter(([l]) => l !== 'Sales');
    return {
      prompt: `${intro(rng, 'these figures')}\n${rows(items)}\nFind the cost of goods sold.`,
      answer: t.cogs,
      commonErrors: [
        { value: t.cogs + 2 * t.cs, why: 'Added the closing stock to the cost instead of deducting it.' },
        { value: t.cogs + t.cs, why: 'Left the closing stock out of the working.' },
        { value: t.cogs - t.dir, why: 'Left the direct expenses out of the cost of goods sold.' },
        { value: t.cogs - t.os, why: 'Left the opening stock out of the cost of goods sold.' },
      ],
      explanation: [tradingWorking(t).filter((l) => l.startsWith('Cost'))[0]],
    };
  },
  verify: (q) => cogsOf(figures(q.prompt)) === q.answer,
});

const faNpBasic = numericTemplate({
  id: 'fa-np-basic', topicId: T, conceptId: C.pl, difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const gp = amount(rng, 60000, 250000, 5000);
    const x = drawIndirect(rng, gp, { exp: rng.pick([2, 3]), inc: 1 });
    if (!x) return null;
    return {
      prompt: `${intro(rng, 'these figures')}\n${rows([['Gross profit', gp], ...x.exps, ...x.incs])}\nFind the net profit.`,
      answer: x.np,
      commonErrors: [
        { value: gp - x.E, why: 'Forgot to add the indirect income.' },
        { value: gp - x.E - x.I, why: 'Deducted the indirect income as if it were an expense.' },
        { value: gp + x.E + x.I, why: 'Added the indirect expenses instead of deducting them.' },
        { value: gp, why: 'Stopped at the gross profit; indirect expenses and incomes were never brought in.' },
      ],
      explanation: plWorking(gp, x),
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    return q.answer === f.gp + indirectOf(f);
  },
});

const faClosingCapitalBasic = numericTemplate({
  id: 'fa-closing-capital-basic', topicId: T, conceptId: C.capital, difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const open = amount(rng, 100000, 800000, 10000);
    const np = amount(rng, 20000, 150000, 5000);
    const dr = amount(rng, 5000, 60000, 1000);
    const lead = rng.pick([
      'A sole proprietor starts the year with the capital below.',
      'The owner of a small business has these figures.',
      'The year-end figures of a proprietor are:',
    ]);
    return {
      prompt: `${lead}\n${rows([['Opening capital', open], ['Net profit', np], ['Drawings', dr]])}\nWhat is the closing capital?`,
      answer: open + np - dr,
      commonErrors: [
        { value: open + np + dr, why: 'Added the drawings instead of deducting them.' },
        { value: open + np, why: 'Forgot to deduct the drawings.' },
        { value: open - dr, why: 'Forgot to add the net profit.' },
        { value: open - np - dr, why: 'Deducted the profit as if it were a loss.' },
      ],
      explanation: ['Closing capital = Opening capital + Net profit − Drawings.', `${inr(open)} + ${inr(np)} − ${inr(dr)} = ${inr(open + np - dr)}.`],
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    return q.answer === f.capital + f.np - f.drawings;
  },
});

const faBsAssetsTotal = numericTemplate({
  id: 'fa-bs-assets-total', topicId: T, conceptId: C.bs, difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const fixed = draw(rng, FIXED, 2, 40000, 400000, 10000);
    const debtors: Item = ['Sundry debtors', amount(rng, 30000, 200000, 5000)];
    const cash: Item = [rng.pick(['Cash in hand', 'Cash at bank']), amount(rng, 10000, 90000, 5000)];
    const cs: Item = ['Closing stock', amount(rng, 20000, 140000, 5000)];
    const all = rng.shuffle([...fixed, debtors, cash, cs]);
    const t = sum(all);
    return {
      prompt: `${rng.pick(['At the end of the year a trader owns:', 'These are the assets of a business on the last day of the year:', 'The asset balances on the closing date are:'])}\n${rows(all)}\nWhat is the total of the assets side of the Balance Sheet?`,
      answer: t,
      commonErrors: [
        { value: t - cs[1], why: 'Left the closing stock out; it is an asset of the business.' },
        { value: debtors[1] + cash[1] + cs[1], why: 'Added only the current assets and left out the fixed assets.' },
        { value: t - cash[1], why: 'Left the cash or bank balance out of the total.' },
        { value: t - debtors[1], why: 'Left the debtors out of the total.' },
      ],
      explanation: [
        `Every item is an asset, fixed or current, so add them all: ${all.map(([, a]) => inr(a)).join(' + ')}.`,
        `Total of the assets side = ${inr(t)}.`,
      ],
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    return q.answer === f.fixed + f.curAsset + f.cs;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// EASY, choices
// ---------------------------------------------------------------------------------------------------------------

type Cat = 'direct' | 'indExp' | 'indInc' | 'bs';
const CAT_TEXT: Record<Cat, string> = {
  direct: 'A direct expense, debited in the Trading Account',
  indExp: 'An indirect expense, debited in the Profit and Loss Account',
  indInc: 'An indirect income, credited in the Profit and Loss Account',
  bs: 'Neither: it is shown in the Balance Sheet',
};
const CAT_WHY: Record<Cat, string> = {
  direct: 'Took it as a cost of buying or making the goods, which belongs in the Trading Account.',
  indExp: 'Took it as an indirect expense of selling or running the business.',
  indInc: 'Took it as an income earned outside the sale of goods.',
  bs: 'Took it as an asset, a liability or the owner\'s capital, so it was never closed to an account.',
};
const DIRECT_ITEMS: [string, Cat, string][] = [
  ['Carriage inwards: transport of purchased goods to the shop', 'direct', 'It is a cost of bringing the goods to the shop, so it is a direct expense.'],
  ['Wages paid to the workers who unload and stack the goods purchased', 'direct', 'Wages are a direct expense: they are a cost of getting the goods ready for sale.'],
  ['Freight paid on goods bought from another city', 'direct', 'Freight on purchases is part of the cost of the goods: a direct expense.'],
  ['Power and fuel used to run the machines of a small flour mill', 'direct', 'Power and fuel used in making the goods are a direct expense.'],
  ['Factory lighting of a furniture workshop', 'direct', 'Lighting of the place where the goods are made is a cost of making them: a direct expense. Office lighting would be indirect.'],
  ['Dock dues paid on goods imported for resale', 'direct', 'Dock dues on goods bought are part of the cost of bringing them in: a direct expense.'],
  ['Import duty paid on goods bought for resale', 'direct', 'Duty on goods bought is part of their cost: a direct expense.'],
  ['Rent of the shop', 'indExp', 'Rent is an indirect expense: it is a cost of running the business, not of the goods.'],
  ['Salary of the office manager', 'indExp', 'Salaries are an indirect expense.'],
  ['Advertisement expenses', 'indExp', 'Advertisement is a selling expense: an indirect expense.'],
  ['Carriage outwards: delivery of goods to customers', 'indExp', 'Carriage outwards is a selling expense. Only carriage inwards is direct.'],
  ['Discount allowed to customers', 'indExp', 'Discount allowed is a loss for the business: an indirect expense.'],
  ['Interest paid on a bank loan', 'indExp', 'Interest on a loan is a financial expense: an indirect expense.'],
  ['Telephone charges of the office', 'indExp', 'Telephone charges are an indirect expense.'],
  ['Audit fees', 'indExp', 'Audit fees are an indirect expense.'],
  ['Commission received for selling another firm\'s goods', 'indInc', 'Commission received is an indirect income, credited in the Profit and Loss Account.'],
  ['Discount received from suppliers', 'indInc', 'Discount received is a gain: an indirect income.'],
  ['Interest received on a fixed deposit', 'indInc', 'Interest received is an indirect income.'],
  ['Rent received for sub-letting a part of the shop', 'indInc', 'Rent received is an indirect income.'],
  ['Dividend received on shares held by the business', 'indInc', 'Dividend received is an indirect income.'],
  ['Money owed by customers (sundry debtors)', 'bs', 'Debtors are an asset: they appear in the Balance Sheet.'],
  ['Furniture bought for the shop', 'bs', 'Furniture is an asset: it appears in the Balance Sheet.'],
  ['Drawings of the proprietor', 'bs', 'Drawings are deducted from capital in the Balance Sheet; they are not a business expense.'],
  ['A bank loan repayable after five years', 'bs', 'A loan is a liability: it appears in the Balance Sheet.'],
];

// Version 2: power and fuel belong to a business that runs machines; factory lighting and dock dues added.
const faDirectIndirect = mcqTemplate({
  id: 'fa-direct-indirect', version: 2, topicId: T, conceptId: C.classify, difficulty: 'easy',
  generate: (rng) => {
    const [item, cat, why] = rng.pick(DIRECT_ITEMS);
    const wrong = (Object.keys(CAT_TEXT) as Cat[]).filter((c) => c !== cat);
    return {
      prompt: `In the final accounts of a sole proprietor, "${item}" is treated as:`,
      correct: CAT_TEXT[cat],
      distractors: wrong.map((c): Distractor => ({ text: CAT_TEXT[c], why: CAT_WHY[c] })),
      explanation: why,
    };
  },
});

type Side = 'TD' | 'TC' | 'PD' | 'PC' | 'BA' | 'BL';
const SIDE_TEXT: Record<Side, string> = {
  TD: 'Trading Account, debit side',
  TC: 'Trading Account, credit side',
  PD: 'Profit and Loss Account, debit side',
  PC: 'Profit and Loss Account, credit side',
  BA: 'Balance Sheet, assets side',
  BL: 'Balance Sheet, liabilities side',
};
const SIDE_WHY: Record<Side, string> = {
  TD: 'Put it among the costs of the goods on the debit side of the Trading Account.',
  TC: 'Put it on the credit side of the Trading Account, where only sales and closing stock belong.',
  PD: 'Took it as an indirect expense and debited it in the Profit and Loss Account.',
  PC: 'Took it as an indirect income and credited it in the Profit and Loss Account.',
  BA: 'Took it as something the business owns or is owed and put it among the assets.',
  BL: 'Took it as something the business owes, or as the owner\'s claim, and put it among the liabilities.',
};
/** Closing stock appears in two places, so its question names one of them and asks for the other. */
const CLOSING_STOCK_ASK = 'Closing stock is shown as a current asset in the Balance Sheet. Where else does it appear in the final accounts of a sole proprietor?';
const SIDE_ITEMS: [string, Side, string][] = [
  ['Opening stock', 'TD', 'Opening stock is part of the goods available for sale: debit side of the Trading Account.'],
  ['Purchases', 'TD', 'Purchases are the main cost of the goods sold: debit side of the Trading Account.'],
  ['Wages', 'TD', 'Wages are a direct expense: debit side of the Trading Account.'],
  ['Carriage inwards', 'TD', 'Carriage inwards is a direct expense: debit side of the Trading Account.'],
  ['Power and fuel', 'TD', 'Power and fuel are a direct expense: debit side of the Trading Account.'],
  ['Sales', 'TC', 'Sales are the revenue the goods bring in: credit side of the Trading Account.'],
  ['Closing stock', 'TC', 'Closing stock reduces the cost of goods sold, so it is also shown on the credit side of the Trading Account.'],
  ['Rent paid', 'PD', 'Rent is an indirect expense: debit side of the Profit and Loss Account.'],
  ['Salaries', 'PD', 'Salaries are an indirect expense: debit side of the Profit and Loss Account.'],
  ['Advertisement', 'PD', 'Advertisement is an indirect expense: debit side of the Profit and Loss Account.'],
  ['Carriage outwards', 'PD', 'Carriage outwards is an indirect (selling) expense: debit side of the Profit and Loss Account.'],
  ['Discount allowed', 'PD', 'Discount allowed is an indirect expense: debit side of the Profit and Loss Account.'],
  ['Interest on a bank loan', 'PD', 'Interest paid is an indirect expense: debit side of the Profit and Loss Account.'],
  ['Commission received', 'PC', 'Commission received is an indirect income: credit side of the Profit and Loss Account.'],
  ['Discount received', 'PC', 'Discount received is an indirect income: credit side of the Profit and Loss Account.'],
  ['Interest received', 'PC', 'Interest received is an indirect income: credit side of the Profit and Loss Account.'],
  ['Rent received', 'PC', 'Rent received is an indirect income: credit side of the Profit and Loss Account.'],
  ['Sundry debtors', 'BA', 'Debtors owe the business money: an asset in the Balance Sheet.'],
  ['Machinery', 'BA', 'Machinery is a fixed asset: assets side of the Balance Sheet.'],
  ['Cash at bank', 'BA', 'Cash at bank is a current asset: assets side of the Balance Sheet.'],
  ['Sundry creditors', 'BL', 'Creditors are owed money by the business: a liability in the Balance Sheet.'],
  ['Bills payable', 'BL', 'Bills payable are a liability: liabilities side of the Balance Sheet.'],
  ['Bank overdraft', 'BL', 'An overdraft is money owed to the bank: a liability in the Balance Sheet.'],
  ['Capital', 'BL', 'Capital is what the business owes the owner: liabilities side of the Balance Sheet.'],
  ['Drawings', 'BL', 'Drawings are not an expense. They are deducted from capital on the liabilities side of the Balance Sheet.'],
];

const faStatementSide = mcqTemplate({
  id: 'fa-statement-side', topicId: T, conceptId: C.classify, difficulty: 'easy',
  generate: (rng) => {
    const [item, side, why] = rng.pick(SIDE_ITEMS);
    const stock = item === 'Closing stock';
    // The assets side is the place the closing-stock question already names, so it is not offered as a wrong option.
    const wrong = (Object.keys(SIDE_TEXT) as Side[]).filter((s) => s !== side && !(stock && s === 'BA'));
    return {
      prompt: stock ? CLOSING_STOCK_ASK : `Where is "${item}" shown in the final accounts of a sole proprietor?`,
      correct: SIDE_TEXT[side],
      distractors: wrong.map((s): Distractor => ({ text: SIDE_TEXT[s], why: SIDE_WHY[s] })),
      explanation: why,
    };
  },
});

const OPTION4 = ['Capital expenditure', 'Revenue expenditure', 'Capital receipt', 'Revenue receipt'] as const;
type Kind4 = (typeof OPTION4)[number];
const isExp = (k: Kind4): boolean => k.endsWith('expenditure');
/** Why a learner who is shown `right` as the answer might still have picked `k`. */
const kindWhy = (right: Kind4, k: Kind4): string =>
  isExp(right) !== isExp(k)
    ? isExp(right) ? 'Took money paid out as money received.' : 'Took money received as money paid out.'
    : k.startsWith('Capital')
      ? isExp(k) ? 'Treated a cost that only keeps the business running as the purchase of a lasting asset.' : 'Treated a regular earning of the business as money that changes the capital or the assets.'
      : isExp(k) ? 'Treated the cost of acquiring or improving a lasting asset as an expense of the year.' : 'Treated a loan or the sale of an asset as an income earned in the year.';
const EXP_SCENARIOS: [(x: string) => string, Kind4, string][] = [
  [(x) => `The business buys a delivery van for ${x}.`, 'Capital expenditure', 'A van is a fixed asset that serves for years.'],
  [(x) => `${x} is paid as wages to workers for installing a newly bought machine.`, 'Capital expenditure', 'Installation cost is needed to bring the machine into use, so it is added to the machine\'s cost.'],
  [(x) => `The business pays ${x} as carriage to bring new office furniture to the shop.`, 'Capital expenditure', 'Carriage on a new asset is part of the cost of that asset.'],
  [(x) => `A new floor is added to the shop building at a cost of ${x}.`, 'Capital expenditure', 'The floor adds a lasting asset and earning capacity.'],
  [(x) => `Legal fees of ${x} are paid to register land bought for the business.`, 'Capital expenditure', 'The fees are a cost of acquiring the land: capital expenditure.'],
  [(x) => `The business buys a computer for ${x} for its office.`, 'Capital expenditure', 'A computer is a fixed asset used for years.'],
  [(x) => `The shop rent for the year, ${x}, is paid.`, 'Revenue expenditure', 'Rent is a running cost whose benefit is used up within the year.'],
  [(x) => `${x} is spent on routine repairs to keep an old machine working.`, 'Revenue expenditure', 'Routine repairs only maintain the earning capacity; they are an expense of the year.'],
  [(x) => `Goods worth ${x} are bought for resale.`, 'Revenue expenditure', 'Goods bought for resale are a trading cost, not a fixed asset.'],
  [(x) => `The business pays ${x} as salaries to its staff.`, 'Revenue expenditure', 'Salaries are a day-to-day cost of running the business.'],
  [(x) => `${x} is spent on whitewashing the shop at the end of the year.`, 'Revenue expenditure', 'Whitewashing only keeps the premises in good condition.'],
  [(x) => `${x} is paid for petrol used by the delivery van.`, 'Revenue expenditure', 'Fuel is used up in running the van: a revenue expense.'],
];
const REC_SCENARIOS: [(x: string) => string, Kind4, string][] = [
  [(x) => `The owner brings ${x} into the business as additional capital.`, 'Capital receipt', 'Money from the owner adds to capital: a capital receipt.'],
  [(x) => `The business takes a bank loan of ${x} for five years.`, 'Capital receipt', 'A loan is a liability and not an income: a capital receipt.'],
  [(x) => `An old machine is sold for ${x}, which is its book value.`, 'Capital receipt', 'The sale of a fixed asset is a capital receipt.'],
  [(x) => `A long-term investment is sold for ${x}.`, 'Capital receipt', 'Selling an investment held for the long term is a capital receipt.'],
  [(x) => `Goods are sold to customers for ${x}.`, 'Revenue receipt', 'Sales of goods are the business\'s regular earning: a revenue receipt.'],
  [(x) => `The business receives commission of ${x} for acting as an agent.`, 'Revenue receipt', 'Commission is an income of the year: a revenue receipt.'],
  [(x) => `Interest of ${x} is received on a fixed deposit.`, 'Revenue receipt', 'Interest earned is a revenue receipt.'],
  [(x) => `A part of the shop is sub-let and rent of ${x} is received.`, 'Revenue receipt', 'Rent from sub-letting is an income of the year.'],
  [(x) => `A discount of ${x} is received from a supplier for prompt payment.`, 'Revenue receipt', 'Discount received is a gain of the year: a revenue receipt.'],
];

function kindTemplate(id: string, bank: typeof EXP_SCENARIOS, ask: string, concept: string) {
  return mcqTemplate({
    id, topicId: T, conceptId: concept, difficulty: 'easy',
    generate: (rng) => {
      const [text, kind, why] = rng.pick(bank);
      const x = inr(amount(rng, 2000, 90000, 1000));
      return {
        prompt: `${text(x)} ${ask}`,
        correct: kind,
        distractors: OPTION4.filter((k) => k !== kind).map((k): Distractor => ({ text: k, why: kindWhy(kind, k) })),
        explanation: why,
      };
    },
  });
}
const faCapRevExp = kindTemplate('fa-capital-revenue-exp', EXP_SCENARIOS, 'How is this item classified?', C.capRev);
const faCapRevRec = kindTemplate('fa-capital-revenue-receipt', REC_SCENARIOS, 'How is this item classified?', C.capRev);

type Bsc = 'CA' | 'FA' | 'CL' | 'LL' | 'CAP';
const BSC_TEXT: Record<Bsc, string> = {
  CA: 'Current asset', FA: 'Fixed (non-current) asset', CL: 'Current liability', LL: 'Long-term liability', CAP: 'Capital',
};
const BSC_WHY: Record<Bsc, string> = {
  CA: 'Took it as a current asset: something that will turn into cash within the year.',
  FA: 'Took it as a fixed asset: something held for long-term use and not for sale.',
  CL: 'Took it as a current liability: a debt due within the year.',
  LL: 'Took it as a long-term liability: a debt that is repaid after more than a year.',
  CAP: 'Took it as capital: the owner\'s own investment in the business.',
};
const BSC_ITEMS: [string, Bsc, string][] = [
  ['Sundry debtors', 'CA', 'Debtors will pay within the credit period, so they are a current asset.'],
  ['Cash in hand', 'CA', 'Cash is the most liquid current asset.'],
  ['Closing stock', 'CA', 'Stock is held for sale and turns into cash within the year: a current asset.'],
  ['Bills receivable', 'CA', 'A bill receivable is collected within a short period: a current asset.'],
  ['Furniture in the shop', 'FA', 'Furniture is held for use over many years, not for sale: a fixed asset.'],
  ['Land', 'FA', 'Land is held for use for a very long time: a fixed asset.'],
  ['Machinery', 'FA', 'Machinery is used for years: a fixed asset.'],
  ['A delivery van', 'FA', 'A van is used for years: a fixed asset.'],
  ['Sundry creditors', 'CL', 'Creditors are paid within the credit period: a current liability.'],
  ['Bills payable', 'CL', 'A bill payable falls due within a few months: a current liability.'],
  ['Bank overdraft', 'CL', 'An overdraft is repayable on demand: a current liability.'],
  ['A bank loan repayable after five years', 'LL', 'The loan is not due within the year: a long-term liability.'],
  ['Cash at bank', 'CA', 'Money in the bank can be drawn at once: a current asset.'],
  ['The shop building owned by the business', 'FA', 'The building is held for use for many years, not for sale: a fixed asset.'],
  ['Computers used in the office', 'FA', 'The computers are used in the business for years and are not held for sale: a fixed asset.'],
  ['A loan from a relative repayable after three years', 'LL', 'The loan falls due after more than a year: a long-term liability.'],
  ['The owner\'s capital', 'CAP', 'Capital is the owner\'s claim on the business, not a debt to outsiders.'],
];
const faBsClassify = mcqTemplate({
  id: 'fa-bs-classify', topicId: T, conceptId: C.bs, difficulty: 'easy',
  generate: (rng) => {
    const [item, cat, why] = rng.pick(BSC_ITEMS);
    const wrong = (Object.keys(BSC_TEXT) as Bsc[]).filter((c) => c !== cat);
    return {
      prompt: `In the Balance Sheet of a sole proprietor, "${item}" is classified as:`,
      correct: BSC_TEXT[cat],
      distractors: wrong.map((c): Distractor => ({ text: BSC_TEXT[c], why: BSC_WHY[c] })),
      explanation: why,
    };
  },
});

const USERS: [who: string, need: string][] = [
  ['the proprietor of the business', 'how much profit the business earned and what the capital now stands at'],
  ['a bank that has lent money to the business', 'whether the business can pay the interest and repay the loan'],
  ['a supplier who sells goods to the business on credit', 'whether the business will be able to pay for the goods on time'],
  ['the employees of the business', 'whether the business is stable enough to keep paying wages and a bonus'],
  ['the income-tax department', 'the profit on which the tax of the business is to be worked out'],
  ['a person thinking of investing in the business', 'whether the business earns enough profit to be worth investing in'],
  ['a customer who depends on the business for regular supplies', 'whether the business will carry on and keep supplying the goods'],
  ['the manager who runs the business from day to day', 'which costs are rising and where the business can be run better'],
];
const faUserNeed = mcqTemplate({
  id: 'fa-user-need', topicId: T, conceptId: C.users, difficulty: 'easy',
  generate: (rng) => {
    const i = rng.int(0, USERS.length - 1);
    const [who, need] = USERS[i];
    const others = USERS.filter((_, j) => j !== i);
    return {
      prompt: rng.pick([
        `The financial statements of a business are read by many people. The main interest of ${who} is to learn:`,
        `Different people read the final accounts of a business for different reasons. What does ${who} mainly want to find out?`,
        `Think of ${who}. What is this reader chiefly looking for in the financial statements of the business?`,
      ]),
      correct: cap(need),
      distractors: others.map(([w, n]): Distractor => ({ text: cap(n), why: `That is the main concern of ${w}, not of ${who}.` })),
      explanation: `${cap(who)} uses the statements to judge ${need}.`,
    };
  },
});

const LIQ_TIERS: string[][] = [
  ['Land', 'Building'],
  ['Machinery', 'Furniture', 'Vehicles'],
  ['Closing stock'],
  ['Sundry debtors'],
  ['Cash at bank'],
  ['Cash in hand'],
];
const faMarshalling = mcqTemplate({
  id: 'fa-marshalling', topicId: T, conceptId: C.bs, difficulty: 'easy',
  generate: (rng) => {
    const tiers = rng.shuffle([0, 1, 2, 3, 4, 5]).slice(0, 4).sort((a, b) => a - b);
    const picks = tiers.map((t) => ({ tier: t, name: rng.pick(LIQ_TIERS[t]) }));
    const byLiquidity = rng.next() < 0.5;
    const first = byLiquidity ? picks[picks.length - 1] : picks[0];
    const opposite = byLiquidity ? picks[0] : picks[picks.length - 1];
    const basis = byLiquidity ? 'order of liquidity' : 'order of permanence';
    const other = byLiquidity ? 'order of permanence' : 'order of liquidity';
    const near = byLiquidity ? 'most liquid' : 'most permanent';
    const list = rng.shuffle(picks.map((p) => p.name)).join(', ');
    const order = (byLiquidity ? [...picks].reverse() : picks).map((p) => p.name).join(', ');
    return {
      prompt: `A Balance Sheet is marshalled in the ${basis}. Which of these assets is listed first: ${list}?`,
      correct: first.name,
      distractors: picks
        .filter((p) => p !== first)
        .map((p): Distractor => ({
          text: p.name,
          why: p === opposite
            ? `Used the ${other} instead of the ${basis}.`
            : `Misplaced it: it is not the ${near} of the four.`,
        })),
      explanation: byLiquidity
        ? `The order of liquidity starts with the asset that is easiest to turn into cash and ends with the one kept longest. These four are listed as: ${order}.`
        : `The order of permanence starts with the asset kept longest in the business and ends with the most liquid. These four are listed as: ${order}.`,
    };
  },
});

// ---------------------------------------------------------------------------------------------------------------
// MEDIUM, numeric
// ---------------------------------------------------------------------------------------------------------------

const faGpReturns = numericTemplate({
  id: 'fa-gp-returns', topicId: T, conceptId: C.trading, difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const t = drawTrading(rng, { returns: true, direct: 2 });
    if (!t) return null;
    return {
      prompt: `${intro(rng, 'these figures')}\n${rows(tradingRows(t))}\nCalculate the gross profit.`,
      answer: t.gp,
      commonErrors: [
        { value: t.gp + t.salesRet, why: 'Did not deduct the sales return from sales.' },
        { value: t.gp - t.purRet, why: 'Did not deduct the purchases return from purchases.' },
        { value: t.gp + t.salesRet - t.purRet, why: 'Ignored both returns and used the gross figures.' },
        { value: t.gp - 2 * t.purRet, why: 'Added the purchases return to purchases instead of deducting it.' },
        { value: t.gp + 2 * t.salesRet, why: 'Added the sales return to sales instead of deducting it.' },
        { value: t.gp + t.dir, why: 'Left the direct expenses out of the Trading Account.' },
      ],
      explanation: tradingWorking(t),
    };
  },
  verify: (q) => grossOf(figures(q.prompt)) === q.answer,
});

// Version 2: the business fits its direct expenses (no wages or power and fuel for a mobile phone retailer).
const faCogsReturns = numericTemplate({
  id: 'fa-cogs-returns', version: 2, topicId: T, conceptId: C.trading, difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const fit = drawFitting(rng, { returns: true, direct: rng.pick([2, 3]) });
    if (!fit) return null;
    const { t, who } = fit;
    const items = tradingRows(t).filter(([l]) => l !== 'Sales' && l !== 'Sales return');
    return {
      prompt: `${introOf(rng, who, 'these figures')}\n${rows(items)}\nWhat is the cost of goods sold?`,
      answer: t.cogs,
      commonErrors: [
        { value: t.cogs + t.purRet, why: 'Did not deduct the purchases return from purchases.' },
        { value: t.cogs + 2 * t.purRet, why: 'Added the purchases return instead of deducting it.' },
        { value: t.cogs - t.dir, why: 'Left the direct expenses out.' },
        { value: t.cogs + t.cs, why: 'Forgot to deduct the closing stock.' },
      ],
      explanation: tradingWorking(t).filter((l) => !l.startsWith('Gross') && !l.startsWith('Net sales')),
    };
  },
  verify: (q) => cogsOf(figures(q.prompt)) === q.answer,
});

type Unknown = 'cs' | 'sales' | 'pur' | 'os';
const faGpMissing = numericTemplate({
  id: 'fa-gp-missing', topicId: T, conceptId: C.trading, difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const t = drawTrading(rng, { returns: true, direct: 1, gp: [40000, 150000] });
    if (!t) return null;
    const u = rng.pick<Unknown>(['cs', 'sales', 'pur', 'os']);
    const label = { cs: 'Closing stock', sales: 'Sales (before deducting the return)', pur: 'Purchases (before deducting the return)', os: 'Opening stock' }[u];
    const skip = { cs: 'Closing stock', sales: 'Sales', pur: 'Purchases', os: 'Opening stock' }[u];
    const items: Item[] = [...tradingRows(t).filter(([l]) => l !== skip), ['Gross profit', t.gp]];
    const answers = { cs: t.cs, sales: t.sales, pur: t.pur, os: t.os };
    const working: Record<Unknown, string[]> = {
      cs: [
        `Net sales = ${inr(t.sales)} − ${inr(t.salesRet)} = ${inr(t.netSales)}. Cost of goods sold = Net sales − Gross profit = ${inr(t.netSales)} − ${inr(t.gp)} = ${inr(t.cogs)}.`,
        `Closing stock = Opening stock + Net purchases + Direct expenses − Cost of goods sold = ${inr(t.os)} + ${inr(t.netPur)} + ${inr(t.dir)} − ${inr(t.cogs)} = ${inr(t.cs)}.`,
      ],
      sales: [
        `Cost of goods sold = ${inr(t.os)} + ${inr(t.netPur)} + ${inr(t.dir)} − ${inr(t.cs)} = ${inr(t.cogs)}.`,
        `Net sales = Cost of goods sold + Gross profit = ${inr(t.cogs)} + ${inr(t.gp)} = ${inr(t.netSales)}.`,
        `Sales = Net sales + Sales return = ${inr(t.netSales)} + ${inr(t.salesRet)} = ${inr(t.sales)}.`,
      ],
      pur: [
        `Cost of goods sold = Net sales − Gross profit = ${inr(t.netSales)} − ${inr(t.gp)} = ${inr(t.cogs)}.`,
        `Net purchases = Cost of goods sold + Closing stock − Opening stock − Direct expenses = ${inr(t.cogs)} + ${inr(t.cs)} − ${inr(t.os)} − ${inr(t.dir)} = ${inr(t.netPur)}.`,
        `Purchases = Net purchases + Purchases return = ${inr(t.netPur)} + ${inr(t.purRet)} = ${inr(t.pur)}.`,
      ],
      os: [
        `Cost of goods sold = Net sales − Gross profit = ${inr(t.netSales)} − ${inr(t.gp)} = ${inr(t.cogs)}.`,
        `Opening stock = Cost of goods sold + Closing stock − Net purchases − Direct expenses = ${inr(t.cogs)} + ${inr(t.cs)} − ${inr(t.netPur)} − ${inr(t.dir)} = ${inr(t.os)}.`,
      ],
    };
    const errs: Record<Unknown, [number, string][]> = {
      cs: [
        [t.cogs, 'Stopped at the cost of goods sold; the closing stock is the balancing figure.'],
        [t.cs + t.purRet, 'Did not deduct the purchases return from purchases.'],
        [t.cs - t.dir, 'Left the direct expenses out of the goods available for sale.'],
        [t.os + t.netPur + t.dir, 'Gave the goods available for sale instead of the closing stock.'],
      ],
      sales: [
        [t.netSales, 'Forgot to add back the sales return to get the sales figure.'],
        [t.cogs, 'Gave the cost of goods sold without adding the gross profit.'],
        [t.netSales - t.salesRet, 'Deducted the sales return instead of adding it back.'],
        [t.cogs + t.salesRet, 'Added the sales return but forgot the gross profit.'],
      ],
      pur: [
        [t.netPur, 'Forgot to add back the purchases return to get the purchases figure.'],
        [t.pur - t.cs, 'Forgot to add the closing stock when working back to the purchases.'],
        [t.pur + t.dir, 'Did not deduct the direct expenses from the cost of goods available.'],
        [t.netPur - t.purRet, 'Deducted the purchases return instead of adding it back.'],
        [t.pur + 2 * t.os, 'Added the opening stock instead of deducting it.'],
      ],
      os: [
        [t.os + t.dir, 'Left the direct expenses out of the working.'],
        [t.os + t.purRet, 'Deducted the purchases return twice.'],
        [t.os - t.purRet, 'Used the purchases without deducting the return.'],
        [t.os - t.cs, 'Left the closing stock out of the working.'],
        [t.cogs, 'Gave the cost of goods sold, which is not the figure asked for.'],
      ],
    };
    return {
      prompt: `${intro(rng, 'these figures from the Trading Account')}\n${rows(items)}\nFind the ${label.toLowerCase()}.`,
      answer: answers[u],
      commonErrors: errs[u].map(([value, why]) => ({ value, why })),
      explanation: working[u],
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    const missing = (['cs', 'sales', 'pur', 'os'] as const).filter((r) => f[r] === 0);
    if (missing.length !== 1) return false;
    f[missing[0]] = q.answer;
    return grossOf(f) === f.gp;
  },
});

const faNpFromTb = numericTemplate({
  id: 'fa-np-from-tb', topicId: T, conceptId: C.pl, difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const t = drawTrading(rng, { returns: rng.next() < 0.5, direct: 2, gp: [70000, 220000] });
    if (!t) return null;
    const x = drawIndirect(rng, t.gp, { exp: rng.pick([3, 4]), inc: rng.pick([1, 2]) });
    if (!x) return null;
    const all = [...tradingRows(t), ...x.exps, ...x.incs];
    return {
      prompt: `${intro(rng, 'these figures')}\n${rows(all)}\nFind the net profit for the year.`,
      answer: x.np,
      commonErrors: [
        { value: t.gp, why: 'Stopped at the gross profit.' },
        { value: x.np - x.I, why: 'Left the indirect incomes out.' },
        { value: x.np - 2 * x.I, why: 'Deducted the indirect incomes as if they were expenses.' },
        { value: x.np + t.dir, why: 'Left the direct expenses out of the Trading Account.' },
        { value: x.np + x.E, why: 'Forgot the indirect expenses.' },
      ],
      explanation: [...tradingWorking(t), ...plWorking(t.gp, x)],
    };
  },
  verify: (q) => netOf(figures(q.prompt)) === q.answer,
});

const faNpMissing = numericTemplate({
  id: 'fa-np-missing', topicId: T, conceptId: C.pl, difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const gp = amount(rng, 80000, 250000, 5000);
    const x = drawIndirect(rng, gp, { exp: 3, inc: 1 });
    if (!x) return null;
    const unknownExpense = rng.next() < 0.6;
    if (unknownExpense) {
      const [, hidden] = x.exps[2];
      const given = [...x.exps.slice(0, 2), ...x.incs];
      return {
        prompt: `${intro(rng, 'these figures from the Profit and Loss Account')}\n${rows([['Gross profit', gp], ...given, ['Net profit', x.np]])}\nThe only other item is the expense "${x.exps[2][0]}". Find the missing expense.`,
        answer: hidden,
        commonErrors: [
          { value: hidden - 2 * x.I, why: 'Subtracted the income instead of adding it when working back from the net profit.' },
          { value: x.E, why: 'Gave the total of all the expenses and forgot the two already shown.' },
          { value: hidden - x.I, why: 'Forgot the income when working back from the net profit.' },
          { value: hidden + 2 * sum(x.exps.slice(0, 2)), why: 'Added the known expenses instead of deducting them.' },
          { value: x.E - x.I, why: 'Gave the whole fall from gross profit to net profit. That is all the expenses less the income, not the one missing expense.' },
        ],
        explanation: [
          'Net profit = Gross profit − Expenses + Income, so Expenses = Gross profit + Income − Net profit.',
          `Total expenses = ${inr(gp)} + ${inr(x.I)} − ${inr(x.np)} = ${inr(x.E)}.`,
          `Missing expense = ${inr(x.E)} − ${inr(sum(x.exps.slice(0, 2)))} = ${inr(hidden)}.`,
        ],
      };
    }
    const [, hidden] = x.incs[0];
    return {
      prompt: `${intro(rng, 'these figures from the Profit and Loss Account')}\n${rows([['Gross profit', gp], ...x.exps, ['Net profit', x.np]])}\nThe only income in the account is "${x.incs[0][0]}". Find the missing income.`,
      answer: hidden,
      commonErrors: [
        { value: x.E - hidden, why: 'Took the gap between the gross profit and the net profit as the income.' },
        { value: x.E, why: 'Gave the total of the expenses.' },
        { value: x.np + x.E, why: 'Added the expenses to the net profit and forgot to deduct the gross profit.' },
        { value: hidden + x.E, why: 'Added the expenses a second time while working back.' },
      ],
      explanation: [
        'Net profit = Gross profit − Expenses + Income, so Income = Net profit − Gross profit + Expenses.',
        `Income = ${inr(x.np)} − ${inr(gp)} + ${inr(x.E)} = ${inr(hidden)}.`,
      ],
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    return /missing expense/.test(q.prompt)
      ? f.gp + indirectOf(f) - q.answer === f.np
      : f.gp + indirectOf(f) + q.answer === f.np;
  },
});

/** The convention every operating-profit question states. It names each non-operating item the questions can list. */
const OP_NOTE = 'Treat interest, dividends, rent received, charity and any profit or loss on the sale of a fixed asset as non-operating; every other item is operating.';
/** "Loss on sale of old furniture" -> "the loss on sale of old furniture". */
const the = (label: string): string => `the ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
const faOperatingProfit = numericTemplate({
  id: 'fa-operating-profit', topicId: T, conceptId: C.pl, difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const gp = amount(rng, 90000, 260000, 5000);
    const x = drawIndirect(rng, gp, { exp: 2, inc: 1, nonExp: 1, nonInc: 1, operating: true });
    if (!x) return null;
    const op = gp - sum(x.exps) + sum(x.incs);
    const askNet = rng.next() < 0.3;
    const body = rows([['Gross profit', gp], ...x.exps, ...x.nonExp, ...x.incs, ...x.nonInc]);
    const [[nonExpName, nonExp]] = x.nonExp;
    const [[nonIncName, nonInc]] = x.nonInc;
    return {
      prompt: `${intro(rng, 'these figures')}\n${body}\n${askNet ? '' : OP_NOTE + '\n'}Calculate the ${askNet ? 'net profit' : 'operating profit'}.`,
      answer: askNet ? x.np : op,
      commonErrors: askNet
        ? [
            { value: op, why: `Left out ${the(nonExpName)} and ${the(nonIncName)}. Every expense and income of the year enters the net profit.` },
            { value: x.np + 2 * nonExp, why: `Added ${the(nonExpName)} instead of deducting it.` },
            { value: x.np - 2 * nonInc, why: `Deducted ${the(nonIncName)} instead of adding it.` },
            { value: x.np + nonExp, why: `Left out ${the(nonExpName)}; it is a charge against the profit of the year.` },
            { value: gp, why: 'Stopped at the gross profit.' },
          ]
        : [
            { value: x.np, why: 'Gave the net profit: the non-operating items were not taken out.' },
            { value: op - nonExp, why: `Deducted ${the(nonExpName)}, which is a non-operating expense.` },
            { value: op + nonInc, why: `Added ${the(nonIncName)}, which is a non-operating income.` },
            { value: gp - sum(x.exps), why: 'Left out the operating income.' },
            { value: x.np - nonExp + nonInc, why: 'Adjusted the net profit the wrong way: the non-operating expense is added back and the non-operating income is taken out.' },
          ],
      explanation: askNet
        ? [
            `Indirect expenses = ${[...x.exps, ...x.nonExp].map(([, a]) => inr(a)).join(' + ')} = ${inr(x.E)}.`,
            `Indirect incomes = ${[...x.incs, ...x.nonInc].map(([, a]) => inr(a)).join(' + ')} = ${inr(x.I)}.`,
            ...plWorking(gp, x),
          ]
        : [
            `Non-operating items: ${the(nonExpName)} and ${the(nonIncName)}. They are left out.`,
            `Operating profit = Gross profit − Operating expenses + Operating incomes = ${inr(gp)} − ${inr(sum(x.exps))} + ${inr(sum(x.incs))} = ${inr(op)}.`,
            `Check: Net profit ${inr(x.np)} + ${inr(nonExp)} − ${inr(nonInc)} = ${inr(op)}.`,
          ],
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    return /Calculate the net profit/.test(q.prompt)
      ? f.gp - f.opExp - f.nonOpExp + f.opInc + f.nonOpInc === q.answer
      : f.gp - f.opExp + f.opInc === q.answer;
  },
});

const faBsTotalCapital = numericTemplate({
  id: 'fa-bs-total-capital', topicId: T, conceptId: C.bs, difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const cp = amount(rng, 150000, 900000, 10000);
    const np = amount(rng, 20000, 160000, 5000);
    const dr = amount(rng, 5000, 60000, 1000);
    const cr = amount(rng, 30000, 200000, 5000);
    const loan = amount(rng, 50000, 300000, 10000);
    const t = cp + np - dr + cr + loan;
    return {
      prompt: `${intro(rng, 'these figures')}\n${rows([['Capital', cp], ['Net profit', np], ['Drawings', dr], ['Sundry creditors', cr], ['Long-term bank loan', loan]])}\nWhat is the total of the liabilities side of the Balance Sheet (which equals the total of the Balance Sheet)?`,
      answer: t,
      commonErrors: [
        { value: t + 2 * dr, why: 'Added the drawings instead of deducting them from capital.' },
        { value: t + dr, why: 'Forgot to deduct the drawings.' },
        { value: t - np, why: 'Forgot to add the net profit to the capital.' },
        { value: t - loan, why: 'Left the long-term loan out of the liabilities.' },
        { value: t - np + dr, why: 'Left out the net profit and also added the drawings.' },
      ],
      explanation: [`Closing capital = ${inr(cp)} + ${inr(np)} − ${inr(dr)} = ${inr(cp + np - dr)}.`, `Total = Closing capital + Creditors + Loan = ${inr(cp + np - dr)} + ${inr(cr)} + ${inr(loan)} = ${inr(t)}.`],
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    return q.answer === f.capital + f.np - f.drawings + f.curLiab + f.ltLiab;
  },
});

const faClosingCapitalExtra = numericTemplate({
  id: 'fa-closing-capital-extra', topicId: T, conceptId: C.capital, difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const gp = amount(rng, 80000, 240000, 5000);
    const x = drawIndirect(rng, gp, { exp: 2, inc: 1 });
    if (!x) return null;
    const open = amount(rng, 150000, 800000, 10000);
    const add = amount(rng, 20000, 150000, 5000);
    const dr = amount(rng, 5000, 50000, 1000);
    const closing = open + add + x.np - dr;
    return {
      prompt: `${intro(rng, 'these figures')}\n${rows([['Opening capital', open], ['Additional capital introduced', add], ['Gross profit', gp], ...x.exps, ...x.incs, ['Drawings', dr]])}\nWhat is the closing capital at the end of the year?`,
      answer: closing,
      commonErrors: [
        { value: closing - add, why: 'Left out the additional capital introduced during the year.' },
        { value: closing + 2 * dr, why: 'Added the drawings instead of deducting them.' },
        { value: closing - x.np + gp, why: 'Added the gross profit instead of the net profit.' },
        { value: closing + dr, why: 'Forgot to deduct the drawings.' },
      ],
      explanation: [...plWorking(gp, x), `Closing capital = Opening capital + Additional capital + Net profit − Drawings = ${inr(open)} + ${inr(add)} + ${inr(x.np)} − ${inr(dr)} = ${inr(closing)}.`],
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    return q.answer === f.capital + f.addCapital + f.gp + indirectOf(f) - f.drawings;
  },
});

type Group = 'ca' | 'fa' | 'cl';
const faGroupTotal = numericTemplate({
  id: 'fa-group-total', topicId: T, conceptId: C.bs, difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const group = rng.pick<Group>(['ca', 'fa', 'cl']);
    const fixed = draw(rng, FIXED, 3, 40000, 400000, 10000);
    const cur = draw(rng, CUR_ASSETS, 3, 15000, 150000, 5000);
    const cs: Item = ['Closing stock', amount(rng, 20000, 140000, 5000)];
    const cl = draw(rng, CUR_LIAB, 2, 20000, 150000, 5000);
    const loan: Item = ['Long-term bank loan', amount(rng, 60000, 300000, 10000)];
    // The capital is the balancing figure, so the list is a Balance Sheet that agrees.
    const capital: Item = ['Capital', sum(fixed) + sum(cur) + cs[1] - sum(cl) - loan[1]];
    if (capital[1] < rupees(100000)) return null;
    const all = rng.shuffle([...fixed, ...cur, cs, ...cl, loan, capital]);
    const ask = { ca: 'total current assets', fa: 'total fixed assets', cl: 'total current liabilities' }[group];
    const right = { ca: sum(cur) + cs[1], fa: sum(fixed), cl: sum(cl) }[group];
    const errs: Record<Group, [number, string][]> = {
      ca: [[sum(cur), 'Left the closing stock out of the current assets.'], [right + fixed[0][1], `Counted ${fixed[0][0].toLowerCase()}, a fixed asset, as a current asset.`], [right + sum(fixed), 'Added the fixed assets to the current assets.'], [right - cur[0][1], `Left out ${cur[0][0].toLowerCase()}.`]],
      fa: [[right - fixed[0][1], `Left out ${fixed[0][0].toLowerCase()}.`], [right + cs[1], 'Counted the closing stock, a current asset, as a fixed asset.'], [right + sum(cur) + cs[1], 'Added the current assets to the fixed assets.']],
      cl: [[right + loan[1], 'Counted the long-term loan, which is not due within the year, as a current liability.'], [right + capital[1], 'Counted the owner\'s capital as a current liability.'], [right - cl[0][1], `Left out ${cl[0][0].toLowerCase()}.`], [right + loan[1] + capital[1], 'Added every item on the liabilities side.']],
    };
    return {
      prompt: `${intro(rng, 'the items of the Balance Sheet', AS_AT)}\n${rows(all)}\nFind the ${ask}.`,
      answer: right,
      commonErrors: errs[group].map(([value, why]) => ({ value, why })),
      explanation: [
        group === 'ca' ? 'Current assets: cash, bank, debtors, bills receivable and closing stock.' : group === 'fa' ? 'Fixed assets: land, building, machinery, furniture, vehicles and computers.' : 'Current liabilities: creditors, bills payable and bank overdraft.',
        `Total = ${(group === 'ca' ? [...cur, cs] : group === 'fa' ? fixed : cl).map(([, a]) => inr(a)).join(' + ')} = ${inr(right)}.`,
      ],
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    if (f.fixed + f.curAsset + f.cs !== f.capital + f.curLiab + f.ltLiab) return false; // the Balance Sheet agrees
    return q.answer === (/total current assets/.test(q.prompt) ? f.curAsset + f.cs : /total fixed assets/.test(q.prompt) ? f.fixed : f.curLiab);
  },
});

const faWorkingCapital = numericTemplate({
  id: 'fa-working-capital', topicId: T, conceptId: C.bs, difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const cur = draw(rng, CUR_ASSETS, 3, 15000, 150000, 5000);
    const cs: Item = ['Closing stock', amount(rng, 20000, 140000, 5000)];
    const cl = draw(rng, CUR_LIAB, 2, 20000, 120000, 5000);
    const loan: Item = ['Long-term bank loan', amount(rng, 60000, 300000, 10000)];
    const ca = sum(cur) + cs[1];
    const cls = sum(cl);
    if (ca <= cls + rupees(10000)) return null;
    return {
      prompt: `${intro(rng, 'these Balance Sheet items', AS_AT)}\n${rows(rng.shuffle([...cur, cs, ...cl, loan]))}\nFind the working capital (current assets less current liabilities).`,
      answer: ca - cls,
      commonErrors: [
        { value: ca - cls - loan[1], why: 'Counted the long-term loan as a current liability.' },
        { value: ca - cls - cs[1], why: 'Left the closing stock out of the current assets.' },
        { value: ca + cls, why: 'Added the current liabilities to the current assets.' },
        { value: ca, why: 'Gave the current assets and forgot to deduct the current liabilities.' },
      ],
      explanation: [
        `Current assets = ${[...cur, cs].map(([, a]) => inr(a)).join(' + ')} = ${inr(ca)}.`,
        `Current liabilities = ${cl.map(([, a]) => inr(a)).join(' + ')} = ${inr(cls)}. The long-term loan is not a current liability.`,
        `Working capital = ${inr(ca)} − ${inr(cls)} = ${inr(ca - cls)}.`,
      ],
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    return q.answer === f.curAsset + f.cs - f.curLiab;
  },
});

const faBsBalance = numericTemplate({
  id: 'fa-bs-balance', topicId: T, conceptId: C.capital, difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const fixed = draw(rng, FIXED, 2, 60000, 400000, 10000);
    const cur = draw(rng, CUR_ASSETS, 2, 20000, 150000, 5000);
    const cs: Item = ['Closing stock', amount(rng, 20000, 140000, 5000)];
    const cl = draw(rng, CUR_LIAB, 1, 20000, 120000, 5000);
    const loan: Item = ['Long-term bank loan', amount(rng, 40000, 200000, 10000)];
    const assets = sum(fixed) + sum(cur) + cs[1];
    const outside = sum(cl) + loan[1];
    if (assets - outside < rupees(100000)) return null;
    return {
      prompt: `${intro(rng, 'all the assets and outside liabilities of the business', AS_AT)}\n${rows(rng.shuffle([...fixed, ...cur, cs, ...cl, loan]))}\nFind the closing capital of the proprietor.`,
      answer: assets - outside,
      commonErrors: [
        { value: assets + outside, why: 'Added the outside liabilities to the assets.' },
        { value: assets, why: 'Gave the total of the assets and did not deduct the liabilities.' },
        { value: assets - cl[0][1], why: 'Deducted only the current liability and forgot the loan.' },
        { value: assets - loan[1], why: 'Deducted only the loan and forgot the current liability.' },
        { value: assets - cs[1] - outside, why: 'Left the closing stock out of the assets.' },
      ],
      explanation: [
        `Assets = ${[...fixed, ...cur, cs].map(([, a]) => inr(a)).join(' + ')} = ${inr(assets)}.`,
        `Outside liabilities = ${[...cl, loan].map(([, a]) => inr(a)).join(' + ')} = ${inr(outside)}.`,
        `Closing capital = Assets − Outside liabilities = ${inr(assets)} − ${inr(outside)} = ${inr(assets - outside)}.`,
      ],
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    return q.answer + f.curLiab + f.ltLiab === f.fixed + f.curAsset + f.cs;
  },
});

const faOpeningCapital = numericTemplate({
  id: 'fa-opening-capital', topicId: T, conceptId: C.capital, difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const open = amount(rng, 100000, 800000, 10000);
    const np = amount(rng, 20000, 150000, 5000);
    const dr = amount(rng, 5000, 60000, 1000);
    const add = rng.next() < 0.5 ? amount(rng, 10000, 100000, 5000) : 0;
    const closing = open + add + np - dr;
    const rowsList: Item[] = [['Closing capital', closing], ['Net profit', np], ['Drawings', dr], ...(add ? ([['Additional capital introduced', add]] as Item[]) : [])];
    const lead = rng.pick(['The capital at the end of the year and the movements during the year are:', 'A proprietor reports:', 'The year-end figures of a business are:']);
    const labelled = rows(rowsList).replace('Closing capital', 'Capital at the end of the year');
    return {
      prompt: `${lead}\n${labelled}\nFind the capital at the beginning of the year.`,
      answer: open,
      commonErrors: [
        { value: closing + np + dr - add, why: 'Added the profit to the closing capital instead of deducting it.' },
        { value: closing - np - dr - add, why: 'Deducted the drawings instead of adding them back.' },
        { value: closing - np + dr + add, why: 'Added the additional capital back instead of deducting it.' },
        { value: closing + dr - add, why: 'Forgot to deduct the net profit.' },
        { value: closing - np - add, why: 'Forgot to add the drawings back.' },
      ],
      explanation: [
        add ? 'Closing capital = Opening capital + Additional capital + Net profit − Drawings.' : 'Closing capital = Opening capital + Net profit − Drawings.',
        add ? `Opening capital = ${inr(closing)} − ${inr(add)} − ${inr(np)} + ${inr(dr)} = ${inr(open)}.` : `Opening capital = ${inr(closing)} − ${inr(np)} + ${inr(dr)} = ${inr(open)}.`,
      ],
    };
  },
  verify: (q) => {
    const m = /Capital at the end of the year: (₹[\d,]+)/.exec(q.prompt);
    const f = figures(q.prompt);
    const closing = m ? parseRupees(m[1]) : null;
    return closing !== null && closing === q.answer + f.addCapital + f.np - f.drawings;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// MEDIUM, choices
// ---------------------------------------------------------------------------------------------------------------

const resultOptions = (profitWord: string, lossWord: string, diff: number, sign: 1 | -1, a: number, b: number, gross: boolean): { correct: string; wrong: Distractor[] } => {
  const w = (s: number) => (s > 0 ? profitWord : lossWord);
  const level = gross ? 'Gross' : 'Net';
  const text = (s: number, v: number) => `${level} ${w(s).toLowerCase()} of ${inr(v)}`;
  const wrong: Distractor[] = [
    { text: text(-sign as 1 | -1, diff), why: `Read it the wrong way round: the ${sign > 0 ? 'credit' : 'debit'} side is the larger, so the result is a ${w(sign).toLowerCase()}.` },
    { text: text(sign, a + b), why: 'Added the two sides instead of finding the difference.' },
    { text: `${gross ? 'Net' : 'Gross'} ${w(sign).toLowerCase()} of ${inr(diff)}`, why: gross ? 'Called the result of the Trading Account the net profit; the net profit comes after the indirect items.' : 'Called the result of the Profit and Loss Account the gross profit; the gross profit comes from the Trading Account.' },
    { text: `${level} ${w(sign).toLowerCase()} of ${inr(Math.min(a, b))}`, why: 'Took the smaller side of the account as the result.' },
  ];
  return { correct: text(sign, diff), wrong };
};

const faGrossResult = mcqTemplate({
  id: 'fa-gross-result', topicId: T, conceptId: C.trading, difficulty: 'medium',
  generate: (rng) => {
    const small = amount(rng, 150000, 500000, 10000);
    const diff = amount(rng, 10000, 120000, 5000);
    const big = small + diff;
    const sign: 1 | -1 = rng.next() < 0.6 ? 1 : -1; // 1: credit side larger
    const debit = sign > 0 ? small : big;
    const credit = sign > 0 ? big : small;
    const r = resultOptions('Profit', 'Loss', diff, sign, debit, credit, true);
    return {
      prompt: `The debit side of a Trading Account (opening stock, net purchases and direct expenses) totals ${inr(debit)}. The credit side (net sales and closing stock) totals ${inr(credit)}. What does the account show?`,
      correct: r.correct,
      distractors: r.wrong,
      explanation: `The credit side is ${sign > 0 ? 'larger' : 'smaller'} than the debit side by ${inr(diff)}, so the balancing figure is a gross ${sign > 0 ? 'profit' : 'loss'} of ${inr(diff)}, carried to the Profit and Loss Account.`,
    };
  },
});

const faNetResult = mcqTemplate({
  id: 'fa-net-result', topicId: T, conceptId: C.pl, difficulty: 'medium',
  generate: (rng) => {
    const gp = amount(rng, 60000, 160000, 5000);
    // This one may be a loss, so it draws its own items (drawIndirect only accepts a profit).
    const exps = draw(rng, IND_EXP, 3, 10000, 60000, 1000);
    const incs = draw(rng, IND_INC, 1, 2000, 15000, 1000);
    const E = sum(exps);
    const I = sum(incs);
    const net = gp - E + I;
    if (net === 0 || Math.abs(net) < rupees(3000)) return null;
    const sign: 1 | -1 = net > 0 ? 1 : -1;
    const r = resultOptions('Profit', 'Loss', Math.abs(net), sign, gp + I, E, false);
    return {
      prompt: `${intro(rng, 'these figures from the Profit and Loss Account')}\n${rows([['Gross profit', gp], ...exps, ...incs])}\nWhat is the result of the Profit and Loss Account?`,
      correct: r.correct,
      distractors: r.wrong,
      explanation: `Credit side = Gross profit + Incomes = ${inr(gp)} + ${inr(I)} = ${inr(gp + I)}. Debit side = Expenses = ${inr(E)}. The difference, ${inr(Math.abs(net))}, is a net ${sign > 0 ? 'profit' : 'loss'}.`,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    const net = f.gp + indirectOf(f);
    const right = q.options.find((o) => o.id === q.correct)?.text ?? '';
    return right === `Net ${net > 0 ? 'profit' : 'loss'} of ${inr(Math.abs(net))}`;
  },
});

const faStockEffect = mcqTemplate({
  id: 'fa-stock-effect', topicId: T, conceptId: C.trading, difficulty: 'medium',
  generate: (rng) => {
    const cs = amount(rng, 40000, 150000, 5000);
    const err = amount(rng, 5000, 30000, 1000);
    const kind = rng.pick(['over', 'under', 'omitted'] as const);
    const x = kind === 'omitted' ? cs : err;
    const [prompt, dir] = {
      over: [`The closing stock was shown at ${inr(cs + err)} but its correct value is ${inr(cs)}. What is the effect on the final accounts of the year? (Ignore every other item.)`, 'overstated'],
      under: [`The closing stock was shown at ${inr(cs - err)} but its correct value is ${inr(cs)}. What is the effect on the final accounts of the year? (Ignore every other item.)`, 'understated'],
      omitted: [`The closing stock of ${inr(cs)} was left out of the final accounts altogether. What is the effect on the final accounts of the year? (Ignore every other item.)`, 'understated'],
    }[kind] as [string, 'overstated' | 'understated'];
    const flip = dir === 'overstated' ? 'understated' : 'overstated';
    const y = inr(x);
    return {
      prompt,
      correct: `Gross profit, net profit and closing capital are all ${dir} by ${y}`,
      distractors: [
        { text: `Gross profit and net profit are ${dir} by ${y}, but closing capital is not affected`, why: 'Forgot that the profit is added to capital, so the capital is wrong by the same amount.' },
        { text: `Gross profit, net profit and closing capital are all ${flip} by ${y}`, why: 'Reversed the effect: a higher closing stock lowers the cost of goods sold and raises the profit.' },
        { text: `Only the assets side of the Balance Sheet is ${dir} by ${y}; the profit is not affected`, why: 'Forgot that closing stock is credited in the Trading Account, so it changes the gross profit as well.' },
        { text: `Gross profit is ${dir} by ${y}, but net profit is not affected`, why: 'Thought the error stops at the Trading Account; the gross profit flows into the net profit.' },
      ],
      explanation: `Closing stock is deducted in finding the cost of goods sold. If it is ${dir}, the cost is ${flip} and the gross profit ${dir} by ${y}. The same amount flows to the net profit and then to the closing capital.`,
    };
  },
});

/** `ask` replaces the usual question; `why` is the reason for this particular entry. */
type Closing = { item: string; dr: string; cr: string; alts: [string, string][]; why: string; ask?: string };
const CLOSING: Closing[] = [
  { item: 'Purchases', dr: 'Trading A/c', cr: 'Purchases A/c', why: 'Purchases A/c has a debit balance, so it is credited to close it, and the cost is carried to the Trading Account.', alts: [['Profit and Loss A/c Dr; To Purchases A/c', 'Closed purchases to the Profit and Loss Account; it is a cost of the goods, so it goes to the Trading Account.'], ['Purchases A/c Dr; To Trading A/c', 'Reversed the entry: purchases has a debit balance, so it is credited to close it.'], ['Purchases A/c Dr; To Profit and Loss A/c', 'Reversed the entry and also chose the Profit and Loss Account.']] },
  { item: 'Wages (a direct expense)', dr: 'Trading A/c', cr: 'Wages A/c', why: 'Wages A/c has a debit balance, so it is credited to close it. A direct expense is carried to the Trading Account.', alts: [['Profit and Loss A/c Dr; To Wages A/c', 'Treated wages as an indirect expense.'], ['Wages A/c Dr; To Trading A/c', 'Reversed the entry: an expense with a debit balance is credited to close it.'], ['Capital A/c Dr; To Wages A/c', 'Charged wages straight to capital instead of through the final accounts.']] },
  { item: 'Carriage inwards', dr: 'Trading A/c', cr: 'Carriage Inwards A/c', why: 'Carriage inwards is a direct expense with a debit balance: it is credited to close it and carried to the Trading Account.', alts: [['Profit and Loss A/c Dr; To Carriage Inwards A/c', 'Treated carriage inwards as an indirect expense.'], ['Carriage Inwards A/c Dr; To Trading A/c', 'Reversed the entry.'], ['Trading A/c Dr; To Carriage Outwards A/c', 'Mixed up carriage inwards with carriage outwards.']] },
  { item: 'Rent paid', dr: 'Profit and Loss A/c', cr: 'Rent Paid A/c', why: 'Rent is an indirect expense with a debit balance: it is credited to close it and carried to the Profit and Loss Account.', alts: [['Trading A/c Dr; To Rent Paid A/c', 'Treated rent as a direct expense.'], ['Rent Paid A/c Dr; To Profit and Loss A/c', 'Reversed the entry: rent has a debit balance, so it is credited to close it.'], ['Capital A/c Dr; To Rent Paid A/c', 'Charged rent straight to capital instead of through the Profit and Loss Account.']] },
  { item: 'Salaries', dr: 'Profit and Loss A/c', cr: 'Salaries A/c', why: 'Salaries are an indirect expense with a debit balance: the account is credited to close it and the amount is carried to the Profit and Loss Account.', alts: [['Trading A/c Dr; To Salaries A/c', 'Treated salaries as a direct expense.'], ['Salaries A/c Dr; To Profit and Loss A/c', 'Reversed the entry.'], ['Drawings A/c Dr; To Salaries A/c', 'Confused a business expense with the owner\'s drawings.']] },
  { item: 'Sales', dr: 'Sales A/c', cr: 'Trading A/c', why: 'Sales A/c has a credit balance, so it is debited to close it, and the revenue is carried to the credit of the Trading Account.', alts: [['Trading A/c Dr; To Sales A/c', 'Reversed the entry: sales has a credit balance, so it is debited to close it.'], ['Sales A/c Dr; To Profit and Loss A/c', 'Sent sales to the Profit and Loss Account; sales are a trading item.'], ['Profit and Loss A/c Dr; To Sales A/c', 'Reversed the entry and chose the Profit and Loss Account.']] },
  { item: 'Commission received', dr: 'Commission Received A/c', cr: 'Profit and Loss A/c', why: 'An income has a credit balance, so it is debited to close it. An indirect income is carried to the credit of the Profit and Loss Account.', alts: [['Profit and Loss A/c Dr; To Commission Received A/c', 'Reversed the entry: an income has a credit balance, so it is debited to close it.'], ['Commission Received A/c Dr; To Trading A/c', 'Treated the commission as a trading income.'], ['Commission Received A/c Dr; To Capital A/c', 'Credited the commission straight to capital.']] },
  { item: 'Opening stock', dr: 'Trading A/c', cr: 'Opening Stock A/c', why: 'The opening stock has a debit balance, so it is credited to close it. It is part of the cost of the goods, so it goes to the Trading Account.', alts: [['Profit and Loss A/c Dr; To Opening Stock A/c', 'Treated opening stock as an indirect expense.'], ['Opening Stock A/c Dr; To Trading A/c', 'Reversed the entry.'], ['Closing Stock A/c Dr; To Trading A/c', 'Gave the closing stock entry in place of the opening stock entry.']] },
  { item: 'Closing stock', dr: 'Closing Stock A/c', cr: 'Trading A/c', ask: 'The closing stock is valued at the year end and is not yet in the books. Which entry brings it into the final accounts?', why: 'The entry opens Closing Stock A/c with a debit balance, which is shown as an asset in the Balance Sheet, and credits the Trading Account, which lowers the cost of goods sold.', alts: [['Trading A/c Dr; To Closing Stock A/c', 'Reversed the entry: closing stock reduces the cost, so it is credited to Trading A/c.'], ['Profit and Loss A/c Dr; To Closing Stock A/c', 'Sent the closing stock to the Profit and Loss Account as an expense.'], ['Trading A/c Dr; To Opening Stock A/c', 'Gave the opening stock entry in place of the closing stock entry.']] },
  { item: 'the gross profit shown by the Trading Account', dr: 'Trading A/c', cr: 'Profit and Loss A/c', why: 'A gross profit is the credit balance of the Trading Account. The account is debited to close it and the profit is carried to the credit of the Profit and Loss Account.', alts: [['Profit and Loss A/c Dr; To Trading A/c', 'Reversed the entry: a gross profit is a credit to the Profit and Loss Account.'], ['Trading A/c Dr; To Capital A/c', 'Sent the gross profit straight to capital; it first goes to the Profit and Loss Account.'], ['Trading A/c Dr; To Drawings A/c', 'Sent the gross profit to Drawings.']] },
  { item: 'the net profit shown by the Profit and Loss Account', dr: 'Profit and Loss A/c', cr: 'Capital A/c', why: 'A net profit is the credit balance of the Profit and Loss Account. The account is debited to close it and the profit is added to the proprietor\'s capital.', alts: [['Capital A/c Dr; To Profit and Loss A/c', 'Reversed the entry: that would reduce capital, as for a loss.'], ['Profit and Loss A/c Dr; To Drawings A/c', 'Sent the profit to Drawings instead of capital.'], ['Trading A/c Dr; To Capital A/c', 'Skipped the Profit and Loss Account and used the Trading Account.']] },
  { item: 'Drawings', dr: 'Capital A/c', cr: 'Drawings A/c', why: 'Drawings A/c has a debit balance, so it is credited to close it. Drawings are not an expense: they reduce the capital, so Capital A/c is debited.', alts: [['Profit and Loss A/c Dr; To Drawings A/c', 'Treated drawings as a business expense.'], ['Drawings A/c Dr; To Capital A/c', 'Reversed the entry: drawings reduce capital, so capital is debited.'], ['Trading A/c Dr; To Drawings A/c', 'Treated drawings as a direct expense.']] },
];
const faClosingEntry = mcqTemplate({
  id: 'fa-closing-entry', topicId: T, conceptId: C.capital, difficulty: 'medium',
  generate: (rng) => {
    const c = rng.pick(CLOSING);
    const verb = rng.pick(['At the end of the year, which closing entry is passed for', 'Which closing entry is passed at the year end for']);
    return {
      prompt: c.ask ?? `${verb} ${c.item}?`,
      correct: `${c.dr} Dr; To ${c.cr}`,
      distractors: c.alts.map(([text, why]): Distractor => ({ text, why })),
      explanation: `${c.dr} Dr; To ${c.cr}. ${c.why}`,
    };
  },
});

// ---------------------------------------------------------------------------------------------------------------
// COMPLEX. Version 2 of each (the quality pass): hints of their own in place of the default pair, shared by the
// templates that ask the same thing, and a business that fits its direct expenses (`drawFitting`).
// ---------------------------------------------------------------------------------------------------------------

const H_COMPLEX = {
  gross: [
    'Sort the list first: which lines are costs of the goods, which are sales, and which wait for the Profit and Loss Account or the Balance Sheet?',
    'Cost of goods sold = Opening stock + (Purchases − Purchases return) + Direct expenses − Closing stock. Gross profit = (Sales − Sales return) − Cost of goods sold. The closing stock is the line given below the trial balance.',
  ],
  net: [
    'Find the gross profit first; only then turn to the indirect items. Which lines are neither an expense nor an income?',
    'Net profit = Gross profit − Indirect expenses + Indirect incomes. Drawings, assets and liabilities never enter it.',
  ],
  capital: [
    'The capital at the end needs the net profit of the year: work out the gross profit, then the net profit.',
    'Closing capital = Opening capital + Net profit − Drawings. Drawings reduce the capital; they are not an expense.',
  ],
  balanceSheet: [
    'The Balance Sheet needs the capital after the profit and the drawings, so find the net profit first. Is every asset in the list?',
    'Total = Fixed assets + Current assets, the closing stock included. Check it from the other side: Capital + Net profit − Drawings + Creditors + Loans.',
  ],
  currentAssets: [
    'Which of these turn into cash within the year? And which current asset is not in the list at all?',
    'Current assets = cash in hand, cash at bank, debtors, bills receivable and the closing stock given in the question. Fixed assets, capital and liabilities stay out.',
  ],
  operating: [
    'Start from the gross profit and ask of each item: does it come from the main activity of buying and selling?',
    'Operating profit = Gross profit − Operating expenses + Operating incomes. Leave out the items the note calls non-operating (or add back the non-operating expenses to the net profit and take out the non-operating incomes).',
  ],
  markup: [
    'Is the rate on the cost or on the sales? Turn the net sales into the cost of goods sold before anything else.',
    'On cost: cost = Net sales × 100 ÷ (100 + rate). On sales: cost = Net sales × (100 − rate) ÷ 100. Closing stock = Opening stock + Net purchases + Wages − Cost of goods sold.',
  ],
};

const faComplexGp = numericTemplate({
  id: 'fa-complex-gp', version: 2, topicId: T, conceptId: C.whole, difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const fit = drawFitting(rng, { returns: true, direct: 3, gp: [60000, 220000] });
    if (!fit) return null;
    const { t, who } = fit;
    const noise = [...draw(rng, IND_EXP, 2, 5000, 25000, 1000), ...draw(rng, ['Drawings', 'Sundry debtors', 'Furniture'], 1, 10000, 90000, 5000)];
    const askCogs = rng.next() < 0.35;
    const all = rng.shuffle([...tradingRows(t, { closing: false }), ...noise]);
    const [extraName, extra] = noise[0];
    return {
      prompt: `${introOf(rng, who, 'this trial-balance extract')}\n${rows(all)}\n${closingNote(t.cs)}\n${askCogs ? 'Find the cost of goods sold.' : 'Find the gross profit.'}`,
      answer: askCogs ? t.cogs : t.gp,
      commonErrors: askCogs
        ? [
            { value: t.cogs + t.purRet, why: 'Did not deduct the purchases return.' },
            { value: t.cogs + t.cs, why: 'Forgot to deduct the closing stock.' },
            { value: t.cogs - t.dir, why: 'Left out the direct expenses.' },
            { value: t.cogs + extra, why: `Brought ${extraName.toLowerCase()}, an indirect item, into the cost of goods sold.` },
          ]
        : [
            { value: t.gp - extra, why: `Charged ${extraName.toLowerCase()}, an indirect item, to the Trading Account.` },
            { value: t.gp + t.salesRet - t.purRet, why: 'Ignored both returns.' },
            { value: t.gp + t.dir, why: 'Left the direct expenses out.' },
            { value: t.gp - t.cs, why: 'Forgot the closing stock, which is given below the trial balance.' },
            { value: t.gp + t.salesRet, why: 'Did not deduct the sales return from sales.' },
            { value: t.gp - t.purRet, why: 'Did not deduct the purchases return from purchases.' },
          ],
      explanation: [
        ...tradingWorking(t).filter((l) => !askCogs || (!l.startsWith('Gross') && !l.startsWith('Net sales'))),
        `The other balances (${noise.map(([l]) => l.toLowerCase()).join(', ')}) belong to the Profit and Loss Account or the Balance Sheet.`,
      ],
      hints: H_COMPLEX.gross,
    };
  },
  verify: (q) => (/cost of goods sold\.$/.test(q.prompt) ? cogsOf(figures(q.prompt)) : grossOf(figures(q.prompt))) === q.answer,
});

const faComplexNp = numericTemplate({
  id: 'fa-complex-np', version: 2, topicId: T, conceptId: C.whole, difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const fit = drawFitting(rng, { returns: true, direct: 2, gp: [90000, 240000] });
    if (!fit) return null;
    const { t, who } = fit;
    const x = drawIndirect(rng, t.gp, { exp: 3, inc: 2, nonExp: rng.pick([0, 1]) });
    if (!x) return null;
    const dr = amount(rng, 10000, 50000, 1000);
    const noise: Item[] = [['Drawings', dr], ...draw(rng, ['Sundry debtors', 'Furniture', 'Sundry creditors'], 1, 20000, 120000, 5000)];
    const all = rng.shuffle([...tradingRows(t, { closing: false }), ...x.exps, ...x.nonExp, ...x.incs, ...noise]);
    const errs: [number, string][] = [
      [t.gp, 'Stopped at the gross profit.'],
      [x.np - x.I, 'Left the indirect incomes out.'],
      [x.np - dr, 'Deducted the drawings in the Profit and Loss Account; drawings reduce capital, not profit.'],
      [x.np + t.salesRet, 'Did not deduct the sales return.'],
      ...x.nonExp.map(([l, a]): [number, string] => [x.np + a, `Left out ${the(l)}; it is an indirect expense of the year.`]),
      [x.np - t.cs, 'Forgot the closing stock, which is given below the trial balance.'],
    ];
    return {
      prompt: `${introOf(rng, who, 'this trial-balance extract')}\n${rows(all)}\n${closingNote(t.cs)}\nCalculate the net profit for the year.`,
      answer: x.np,
      commonErrors: errs.map(([value, why]) => ({ value, why })),
      explanation: [...tradingWorking(t), ...plWorking(t.gp, x), 'Drawings and the asset and liability balances do not enter the profit.'],
      hints: H_COMPLEX.net,
    };
  },
  verify: (q) => netOf(figures(q.prompt)) === q.answer,
});

const faComplexClosingCapital = numericTemplate({
  id: 'fa-complex-closing-capital', version: 2, topicId: T, conceptId: C.whole, difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const fit = drawFitting(rng, { returns: true, direct: 2, gp: [80000, 220000] });
    if (!fit) return null;
    const { t, who } = fit;
    const x = drawIndirect(rng, t.gp, { exp: 3, inc: 1 });
    if (!x) return null;
    const open = amount(rng, 200000, 900000, 10000);
    const dr = amount(rng, 10000, 60000, 1000);
    const noise = draw(rng, ['Furniture', 'Sundry creditors', 'Cash at bank'], 2, 20000, 150000, 5000);
    const closing = open + x.np - dr;
    const all = rng.shuffle([['Capital', open], ['Drawings', dr], ...tradingRows(t, { closing: false }), ...x.exps, ...x.incs, ...noise] as Item[]);
    return {
      prompt: `${introOf(rng, who, 'this trial-balance extract')}\n${rows(all)}\n${closingNote(t.cs)}\nThe proprietor introduced no further capital during the year. Find the proprietor's capital at the end of the year.`,
      answer: closing,
      commonErrors: [
        { value: open + t.gp - dr, why: 'Added the gross profit instead of the net profit.' },
        { value: open + x.np, why: 'Forgot to deduct the drawings.' },
        { value: open + x.np + dr, why: 'Added the drawings instead of deducting them.' },
        { value: open - dr, why: 'Forgot to add the net profit.' },
      ],
      explanation: [...tradingWorking(t), ...plWorking(t.gp, x), `Closing capital = Opening capital + Net profit − Drawings = ${inr(open)} + ${inr(x.np)} − ${inr(dr)} = ${inr(closing)}.`],
      hints: H_COMPLEX.capital,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    return q.answer === f.capital + netOf(f) - f.drawings;
  },
});

const faComplexBsTotal = numericTemplate({
  id: 'fa-complex-bs-total', version: 2, topicId: T, conceptId: C.whole, difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const fit = drawFitting(rng, { returns: true, direct: 2, gp: [80000, 200000] });
    if (!fit) return null;
    const { t, who } = fit;
    const x = drawIndirect(rng, t.gp, { exp: 3, inc: 1 });
    if (!x) return null;
    const dr = amount(rng, 10000, 50000, 1000);
    const fixed = draw(rng, FIXED, 2, 60000, 350000, 10000);
    const debtors: Item = ['Sundry debtors', amount(rng, 30000, 160000, 5000)];
    const cash: Item = ['Cash at bank', amount(rng, 10000, 80000, 5000)];
    const creditors: Item = ['Sundry creditors', amount(rng, 30000, 150000, 5000)];
    const loan: Item = ['Long-term bank loan', amount(rng, 50000, 250000, 10000)];
    const drTotal = t.os + t.pur + t.salesRet + t.dir + sum(x.exps) + dr + sum(fixed) + debtors[1] + cash[1];
    const crOthers = t.sales + t.purRet + sum(x.incs) + creditors[1] + loan[1];
    const capital = drTotal - crOthers;
    if (capital < rupees(100000) || capital > rupees(2000000)) return null;
    const assets = sum(fixed) + debtors[1] + cash[1] + t.cs;
    const tbRows = rng.shuffle([
      ['Opening stock', t.os], ['Purchases', t.pur], ['Purchases return', t.purRet], ['Sales', t.sales], ['Sales return', t.salesRet],
      ...t.directs, ...x.exps, ...x.incs, ['Drawings', dr], ['Capital', capital], ...fixed, debtors, cash, creditors, loan,
    ] as Item[]);
    return {
      prompt: `${introOf(rng, who, 'this trial balance', AS_AT)}\n${rows(tbRows)}\n${closingNote(t.cs)}\nFind the total of the Balance Sheet.`,
      answer: assets,
      commonErrors: [
        { value: assets - t.cs, why: 'Left the closing stock out; it is not in the trial balance but it is an asset.' },
        { value: capital + creditors[1] + loan[1], why: 'Used the capital of the trial balance and did not add the profit or deduct the drawings.' },
        { value: assets + 2 * dr, why: 'Added the drawings to capital instead of deducting them.' },
        { value: assets - x.np, why: 'Did not add the net profit to capital, so the total is short by the profit.' },
        { value: assets + t.gp - x.np, why: 'Added the gross profit to capital instead of the net profit.' },
        { value: drTotal, why: 'Gave the total of the trial balance instead of the total of the Balance Sheet.' },
      ],
      explanation: [
        ...tradingWorking(t), ...plWorking(t.gp, x),
        `Assets = Fixed assets + Debtors + Cash at bank + Closing stock = ${inr(sum(fixed))} + ${inr(debtors[1])} + ${inr(cash[1])} + ${inr(t.cs)} = ${inr(assets)}.`,
        `Check: Capital ${inr(capital)} + Profit ${inr(x.np)} − Drawings ${inr(dr)} + Creditors ${inr(creditors[1])} + Loan ${inr(loan[1])} = ${inr(capital + x.np - dr + creditors[1] + loan[1])}.`,
      ],
      hints: H_COMPLEX.balanceSheet,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    // The liabilities side: capital plus profit less drawings plus the outside liabilities.
    return q.answer === f.capital + netOf(f) - f.drawings + f.curLiab + f.ltLiab && q.answer === f.fixed + f.curAsset + f.cs;
  },
});

const faComplexCurrentAssets = numericTemplate({
  id: 'fa-complex-current-assets', version: 2, topicId: T, conceptId: C.whole, difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const cur = draw(rng, CUR_ASSETS, 3, 15000, 140000, 5000);
    const fixed = draw(rng, FIXED, 2, 60000, 350000, 10000);
    const cs: Item = ['Closing stock', amount(rng, 20000, 140000, 5000)];
    const noise: Item[] = [['Capital', amount(rng, 200000, 800000, 10000)], rng.pick<Item>([['Sundry creditors', amount(rng, 20000, 120000, 5000)], ['Long-term bank loan', amount(rng, 50000, 250000, 10000)]])];
    const all = rng.shuffle([...cur, ...fixed, ...noise]);
    const right = sum(cur) + cs[1];
    return {
      prompt: `${intro(rng, 'these balances from the trial balance', AS_AT)}\n${rows(all)}\nThe closing stock, counted at the year end and not yet in the books, is ${inr(cs[1])}. Find the total current assets in the Balance Sheet.`,
      answer: right,
      commonErrors: [
        { value: sum(cur), why: 'Forgot the closing stock, which is not in the trial balance.' },
        { value: right + sum(fixed), why: 'Included the fixed assets among the current assets.' },
        { value: right + fixed[0][1], why: `Included ${fixed[0][0].toLowerCase()}, a fixed asset, among the current assets.` },
        { value: right + noise[1][1], why: `Included ${noise[1][0].toLowerCase()}, a liability, among the assets.` },
      ],
      explanation: [`Current assets from the list: ${cur.map(([l]) => l.toLowerCase()).join(', ')} = ${inr(sum(cur))}.`, `Add the closing stock ${inr(cs[1])}: ${inr(right)}.`, 'Fixed assets, capital and liabilities are not current assets.'],
      hints: H_COMPLEX.currentAssets,
    };
  },
  verify: (q) => {
    const m = /is (₹[\d,]+)\. Find the total current assets/.exec(q.prompt);
    const closing = m ? parseRupees(m[1]) : null;
    return closing !== null && q.answer === figures(q.prompt).curAsset + closing;
  },
});

const faComplexOperating = numericTemplate({
  id: 'fa-complex-operating', version: 2, topicId: T, conceptId: C.whole, difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const fit = drawFitting(rng, { returns: true, direct: 2, gp: [90000, 240000] });
    if (!fit) return null;
    const { t, who } = fit;
    const x = drawIndirect(rng, t.gp, { exp: 3, inc: 1, nonExp: 1, nonInc: 1, operating: true });
    if (!x) return null;
    const op = t.gp - sum(x.exps) + sum(x.incs);
    const all = rng.shuffle([...tradingRows(t, { closing: false }), ...x.exps, ...x.nonExp, ...x.incs, ...x.nonInc]);
    const [[nonExpName, nonExp]] = x.nonExp;
    const [[nonIncName, nonInc]] = x.nonInc;
    return {
      prompt: `${introOf(rng, who, 'this trial-balance extract')}\n${rows(all)}\n${closingNote(t.cs)}\n${OP_NOTE}\nFind the operating profit.`,
      answer: op,
      commonErrors: [
        { value: x.np, why: 'Gave the net profit without removing the non-operating items.' },
        { value: op - nonExp, why: `Deducted ${the(nonExpName)}, which is a non-operating expense.` },
        { value: op + nonInc, why: `Added ${the(nonIncName)}, which is a non-operating income.` },
        { value: t.gp - sum(x.exps), why: 'Left out the operating income.' },
        { value: x.np + nonExp + nonInc, why: 'Added both non-operating items to the net profit instead of adding back the expense and taking out the income.' },
        { value: t.gp, why: 'Stopped at the gross profit; the operating expenses and the operating income still have to be brought in.' },
      ],
      explanation: [
        ...tradingWorking(t),
        `Non-operating items: ${the(nonExpName)} and ${the(nonIncName)}. They are left out.`,
        `Operating profit = Gross profit − Operating expenses + Operating incomes = ${inr(t.gp)} − ${inr(sum(x.exps))} + ${inr(sum(x.incs))} = ${inr(op)}.`,
        `Check: Net profit ${inr(x.np)} + ${inr(nonExp)} − ${inr(nonInc)} = ${inr(op)}.`,
      ],
      hints: H_COMPLEX.operating,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    return q.answer === netOf(f) + f.nonOpExp - f.nonOpInc;
  },
});

const faComplexResult = mcqTemplate({
  id: 'fa-complex-result', version: 2, topicId: T, conceptId: C.whole, difficulty: 'complex',
  generate: (rng) => {
    const fit = drawFitting(rng, { returns: true, direct: 2, gp: [50000, 150000] });
    if (!fit) return null;
    const { t, who } = fit;
    const exps = draw(rng, IND_EXP, 4, 8000, 45000, 1000);
    const incs = draw(rng, IND_INC, 1, 3000, 15000, 1000);
    const E = sum(exps);
    const I = sum(incs);
    const net = t.gp - E + I;
    if (Math.abs(net) < rupees(5000)) return null;
    const sign = net > 0 ? 'profit' : 'loss';
    const flip = net > 0 ? 'loss' : 'profit';
    const noGp = t.gp - E; // forgot the incomes
    const dr: Item = ['Drawings', amount(rng, 10000, 50000, 1000)];
    const all = rng.shuffle([...tradingRows(t, { closing: false }), ...exps, ...incs, dr]);
    const wrongIncome = t.gp - E - I;
    return {
      prompt: `${introOf(rng, who, 'this trial-balance extract')}\n${rows(all)}\n${closingNote(t.cs)}\nWhat does the Profit and Loss Account of the year show?`,
      correct: `Net ${sign} of ${inr(Math.abs(net))}`,
      distractors: [
        { text: `Net ${flip} of ${inr(Math.abs(net))}`, why: 'Read the result the wrong way round: compare the credit side (gross profit and incomes) with the debit side (expenses).' },
        { text: `Net ${noGp > 0 ? 'profit' : 'loss'} of ${inr(Math.abs(noGp))}`, why: 'Left the indirect income out of the account.' },
        { text: `Net ${wrongIncome > 0 ? 'profit' : 'loss'} of ${inr(Math.abs(wrongIncome))}`, why: 'Deducted the indirect income as if it were an expense.' },
        { text: `Net ${net - dr[1] > 0 ? 'profit' : 'loss'} of ${inr(Math.abs(net - dr[1]))}`, why: 'Deducted the drawings as an expense; drawings reduce capital, not profit.' },
        { text: `Gross profit of ${inr(t.gp)}`, why: 'Gave the gross profit, the result of the Trading Account, as the final result.' },
      ],
      explanation: [...tradingWorking(t), `Credit side = ${inr(t.gp)} + ${inr(I)} = ${inr(t.gp + I)}; debit side (expenses) = ${inr(E)}.`, `Net ${sign} = ${inr(Math.abs(net))}.`].join(' '),
      hints: H_COMPLEX.net,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    const net = netOf(f);
    return (q.options.find((o) => o.id === q.correct)?.text ?? '') === `Net ${net > 0 ? 'profit' : 'loss'} of ${inr(Math.abs(net))}`;
  },
});

const faComplexMarkup = numericTemplate({
  id: 'fa-complex-markup', version: 2, topicId: T, conceptId: C.whole, difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const onCost = rng.next() < 0.5;
    const pct = onCost ? rng.pick([20, 25, 40, 50]) : rng.pick([20, 25, 40]);
    // On cost: net sales = cost x (100 + pct)/100. On sales: cost = net sales x (100 - pct)/100.
    // The base figure is a multiple of Rs 10,000, so the other one is a whole number of rupees for these percentages.
    const base = amount(rng, 150000, 700000, 10000);
    const cogs = onCost ? base : (base * (100 - pct)) / 100;
    const netSales = onCost ? (base * (100 + pct)) / 100 : base;
    const cs = amount(rng, 20000, 120000, 5000);
    const os = amount(rng, 20000, 100000, 5000);
    const dir = amount(rng, 5000, 30000, 1000);
    const purRet = amount(rng, 3000, 25000, 1000);
    const pur = cogs + cs - os - dir + purRet;
    if (pur < rupees(80000) || cogs % 100 !== 0 || netSales % 100 !== 0) return null;
    const salesRet = amount(rng, 4000, 25000, 1000);
    const sales = netSales + salesRet;
    const gp = netSales - cogs;
    const basis = onCost ? `${pct}% of the cost of goods sold` : `${pct}% of net sales`;
    const available = os + pur - purRet + dir;
    const whole = (v: number): boolean => Number.isInteger(v) && v % 100 === 0;
    // The cost of goods sold a learner reaches by applying the rate to the wrong base.
    const otherCogs = onCost ? (netSales * (100 - pct)) / 100 : (netSales * 100) / (100 + pct);
    // ... and by applying the right rate to the sales before the return is deducted.
    const grossSalesCogs = onCost ? (sales * 100) / (100 + pct) : (sales * (100 - pct)) / 100;
    return {
      prompt: `${introOf(rng, rng.pick(MAKERS), 'these figures')}\n${rows([['Opening stock', os], ['Purchases', pur], ['Purchases return', purRet], ['Sales', sales], ['Sales return', salesRet], ['Wages', dir]])}\nThe gross profit for the year is ${basis}. The closing stock has not yet been valued. Find the closing stock.`,
      answer: cs,
      commonErrors: [
        // The slip this question is built around: taking a rate on cost as a rate on sales, or the other way round.
        ...(whole(otherCogs)
          ? [{ value: available - otherCogs, why: onCost ? `Took ${pct}% of net sales as the gross profit; the rate is on the cost of goods sold.` : `Took ${pct}% of the cost as the gross profit; the rate is on net sales.` }]
          : []),
        { value: cs + purRet, why: 'Did not deduct the purchases return from purchases.' },
        { value: cs - dir, why: 'Left the wages out of the cost of goods available.' },
        ...(whole(grossSalesCogs)
          ? [{ value: available - grossSalesCogs, why: 'Did not deduct the sales return before working out the cost of goods sold.' }]
          : []),
        { value: cogs, why: 'Gave the cost of goods sold; the closing stock is the balancing figure.' },
        { value: gp, why: 'Gave the gross profit instead of the closing stock.' },
      ],
      explanation: [
        `Net sales = Sales − Sales return = ${inr(sales)} − ${inr(salesRet)} = ${inr(netSales)}.`,
        onCost
          ? `Gross profit is ${pct}% of the cost, so net sales are ${100 + pct}% of the cost. Cost of goods sold = ${inr(netSales)} × 100/${100 + pct} = ${inr(cogs)}.`
          : `Gross profit is ${pct}% of net sales, so the cost is ${100 - pct}% of net sales. Cost of goods sold = ${inr(netSales)} × ${100 - pct}/100 = ${inr(cogs)}.`,
        `Goods available for sale = Opening stock + Net purchases + Wages = ${inr(os)} + (${inr(pur)} − ${inr(purRet)}) + ${inr(dir)} = ${inr(available)}.`,
        `Closing stock = Goods available for sale − Cost of goods sold = ${inr(available)} − ${inr(cogs)} = ${inr(cs)}.`,
      ],
      hints: H_COMPLEX.markup,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    const m = /is (\d+)% of (the cost of goods sold|net sales)/.exec(q.prompt);
    if (!m) return false;
    const p = Number(m[1]);
    const ns = f.sales - f.salesRet;
    const cost = m[2] === 'net sales' ? (ns * (100 - p)) / 100 : (ns * 100) / (100 + p);
    return Number.isInteger(cost) && q.answer === f.os + f.pur - f.purRet + f.direct - cost;
  },
});

const templates: Template[] = [
  // Easy
  faNetSales, faGpBasic, faCogsBasic, faNpBasic, faClosingCapitalBasic, faBsAssetsTotal,
  faDirectIndirect, faStatementSide, faCapRevExp, faCapRevRec, faBsClassify, faUserNeed, faMarshalling,
  // Medium
  faGpReturns, faCogsReturns, faGpMissing, faNpFromTb, faNpMissing, faOperatingProfit, faBsTotalCapital,
  faClosingCapitalExtra, faGroupTotal, faWorkingCapital, faBsBalance, faOpeningCapital,
  faGrossResult, faNetResult, faStockEffect, faClosingEntry,
  // Complex
  faComplexGp, faComplexNp, faComplexClosingCapital, faComplexBsTotal, faComplexCurrentAssets, faComplexOperating,
  faComplexResult, faComplexMarkup,
];

// ---------------------------------------------------------------------------------------------------------------
// SETS OF CLOSING ENTRIES. One question lists the balances of the year and asks for the closing entries, one entry
// for each item. Closing entries are all passed on the last day of the year: the opening line says so once, and the
// items carry labels, (a), (b), ..., in place of a date. The chart has one Stock A/c (no separate Opening Stock and
// Closing Stock accounts), and every set that touches stock says so in its opening line; the opening stock is always
// transferred out of that account before the closing stock is brought into it.
// ---------------------------------------------------------------------------------------------------------------

const C_SETS = 'fa-closing-sets';
const CLOSING_TASK = 'Pass the closing entries.';
/** Said once in every opening line, in place of a date on each item. */
const CLOSING_DAY = 'on 31 March, the last day of the year, and every entry below is passed on that day';
/** An item of a set before it has its label. */
interface Step {
  text: string;
  lines: JournalLine[];
  explanation: string[];
}
/** A ledger balance: the account and the amount. */
type Bal = readonly [accountId: string, amount: number];

const Dr = (accountId: string, amt: number): JournalLine => ({ accountId, side: 'Dr', amount: amt });
const Cr = (accountId: string, amt: number): JournalLine => ({ accountId, side: 'Cr', amount: amt });
const ledgerName = (id: string): string => resolveAccount(id).name;
const ac = (id: string): string => `${ledgerName(id)} A/c`;
const total = (xs: readonly Bal[]): number => xs.reduce((s, x) => s + x[1], 0);
/** The balances as lines of the opening list: the name of the ledger account, then the amount. */
const listed = (xs: readonly Bal[]): Item[] => xs.map(([id, a]) => [ledgerName(id), a] as const);
/** "A, B and C". */
const andList = (xs: string[]): string => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
/** "₹a + ₹b = ₹c", or the amount alone when there is only one. */
const added = (xs: number[]): string => (xs.length < 2 ? xs.map(inr).join('') : `${xs.map(inr).join(' + ')} = ${inr(xs.reduce((s, x) => s + x, 0))}`);
/** The items in their order, labelled (a), (b), ... */
const labelled = (steps: Step[]): SetTransaction[] => steps.map((s, i) => ({ label: `(${'abcdefgh'[i]})`, ...s }));

const SET_DIRECT = ['wages', 'carriageInwards', 'freight', 'powerAndFuel'];
const SET_EXPENSES = [
  'rent', 'salaries', 'stationery', 'advertisement', 'carriageOutwards', 'insurance', 'telephone', 'postage', 'travellingExpenses',
  'bankCharges', 'discountAllowed', 'legalCharges', 'auditFees', 'generalExpenses', 'charity',
];
const SET_INCOMES = ['commissionReceived', 'discountReceived', 'rentReceived', 'interestReceived', 'miscellaneousIncome'];
/** The accounts that are closed to the Trading Account. */
const TRADING_IDS = ['stock', 'purchases', 'purchasesReturn', 'sales', 'salesReturn', ...SET_DIRECT];

const STOCK_NOTE = 'The ledger has one Stock A/c: the opening stock is transferred out of it, and the closing stock is then brought into it.';
const OPENING_STOCK = 'Stock on 1 April (opening stock)';
const CLOSING_STOCK = 'Closing stock, valued on 31 March and not yet in the books';
const OPENING_CAPITAL = 'Capital on 1 April';
const CLOSING_HINTS = [
  'An account with a debit balance is closed by crediting it, and one with a credit balance by debiting it. The other half of the entry is the account the balance is carried to.',
  'Costs of the goods go to the debit of the Trading Account, sales and closing stock to its credit. Indirect expenses and incomes go to the Profit and Loss Account, and its balance goes to Capital A/c.',
];

type Returns = 'none' | 'purchases' | 'sales' | 'both';
interface SetTrading {
  os: number; pur: number; purRet: number; sales: number; salesRet: number; directs: Bal[]; cs: number;
  netPur: number; netSales: number; debit: number; credit: number;
  /** The gross profit; negative for a gross loss. */
  gross: number;
}

/** The figures of a Trading Account, drawn so that the gross profit (or loss) is a round amount. */
function drawSetTrading(rng: Rng, returns: Returns, directCount: number, loss: boolean): SetTrading {
  const os = amount(rng, 30000, 120000, 5000);
  const pur = amount(rng, 200000, 600000, 10000);
  const purRet = returns === 'purchases' || returns === 'both' ? amount(rng, 5000, 30000, 1000) : 0;
  const directs = rng.shuffle(SET_DIRECT).slice(0, directCount).map((id): Bal => [id, amount(rng, 5000, 40000, 1000)]);
  const cs = amount(rng, 30000, 140000, 5000);
  const gross = loss ? -amount(rng, 5000, 30000, 1000) : amount(rng, 40000, 200000, 5000);
  const salesRet = returns === 'sales' || returns === 'both' ? amount(rng, 4000, 25000, 1000) : 0;
  const netPur = pur - purRet;
  const debit = os + netPur + total(directs);
  const netSales = debit + gross - cs;
  return { os, pur, purRet, sales: netSales + salesRet, salesRet, directs, cs, netPur, netSales, debit, credit: netSales + cs, gross };
}

/** Freight alone could be on goods bought or on goods sent out, so a set that lists it says which. */
const freightNote = (t: SetTrading): string => (t.directs.some(([id]) => id === 'freight') ? ' Freight was paid on goods bought.' : '');

/** The trading balances as the opening line lists them (the closing stock is given after everything else). */
const tradingBalances = (t: SetTrading): Bal[] => [
  ['purchases', t.pur],
  ...(t.purRet ? ([['purchasesReturn', t.purRet]] as Bal[]) : []),
  ['sales', t.sales],
  ...(t.salesRet ? ([['salesReturn', t.salesRet]] as Bal[]) : []),
  ...t.directs,
];

const stepPurchasesReturn = (t: SetTrading): Step => ({
  text: 'Close Purchases Return A/c by transferring its balance to Purchases A/c.',
  lines: [Dr('purchasesReturn', t.purRet), Cr('purchases', t.purRet)],
  explanation: [
    `Purchases Return A/c has a credit balance of ${inr(t.purRet)}, so it is debited to close it.`,
    `Goods sent back to suppliers reduce the purchases: Purchases A/c is credited, and its balance falls to ${inr(t.pur)} − ${inr(t.purRet)} = ${inr(t.netPur)}.`,
  ],
});

const stepSalesReturn = (t: SetTrading): Step => ({
  text: 'Close Sales Return A/c by transferring its balance to Sales A/c.',
  lines: [Dr('sales', t.salesRet), Cr('salesReturn', t.salesRet)],
  explanation: [
    `Goods sent back by customers reduce the sales: Sales A/c is debited, and its balance falls to ${inr(t.sales)} − ${inr(t.salesRet)} = ${inr(t.netSales)}.`,
    `Sales Return A/c has a debit balance of ${inr(t.salesRet)}, so it is credited to close it.`,
  ],
});

/** The debit side of the Trading Account in one entry (`all`), or in two: the goods, then the direct expenses. */
function stepTradingDebit(t: SetTrading, part: 'all' | 'goods' | 'direct'): Step {
  const purchases = t.purRet ? 'the balance now left on Purchases A/c' : 'the purchases';
  const direct = t.directs.length > 1 ? 'the direct expenses' : 'the direct expense';
  const goods: Bal[] = [['stock', t.os], ['purchases', t.netPur]];
  const items = part === 'all' ? [...goods, ...t.directs] : part === 'goods' ? goods : t.directs;
  const what = part === 'all' ? `the opening stock, ${purchases} and ${direct}` : part === 'goods' ? `the opening stock and ${purchases}` : direct;
  const which = part === 'all' ? `The opening stock, the purchases and ${direct}` : part === 'goods' ? 'The opening stock and the purchases' : 'Direct expenses';
  const credited = items.map(([id, a]) =>
    id === 'stock' ? `${ac(id)} ${inr(a)} (the opening stock)` : id === 'purchases' && t.purRet ? `${ac(id)} ${inr(a)} (${inr(t.pur)} − ${inr(t.purRet)})` : `${ac(id)} ${inr(a)}`,
  );
  return {
    text: `Transfer ${what} to the debit of the Trading Account${items.length > 1 ? ', in one entry' : ''}.`,
    lines: [Dr('trading', total(items)), ...items.map(([id, a]) => Cr(id, a))],
    explanation: [
      `${which} are costs of the goods, so they are carried to the debit of the Trading Account: Trading A/c is debited with ${added(items.map((x) => x[1]))}.`,
      `${items.length > 1 ? 'Each of these accounts has a debit balance, so each is credited to close it' : 'The account has a debit balance, so it is credited to close it'}: ${andList(credited)}.`,
    ],
  };
}

const salesText = (t: SetTrading): string => (t.salesRet ? 'the balance now left on Sales A/c' : 'the sales');
const salesClosed = (t: SetTrading): string =>
  t.salesRet
    ? `Sales A/c has a credit balance of ${inr(t.sales)} − ${inr(t.salesRet)} = ${inr(t.netSales)} after the return, so it is debited to close it.`
    : `Sales A/c has a credit balance of ${inr(t.netSales)}, so it is debited to close it.`;

const stepSales = (t: SetTrading): Step => ({
  text: `Transfer ${salesText(t)} to the credit of the Trading Account.`,
  lines: [Dr('sales', t.netSales), Cr('trading', t.netSales)],
  explanation: [salesClosed(t), 'The revenue from the goods is carried to the credit of the Trading Account: Trading A/c is credited.'],
});

const stepClosingStock = (t: SetTrading): Step => ({
  text: 'Bring the closing stock into the books.',
  lines: [Dr('stock', t.cs), Cr('trading', t.cs)],
  explanation: [
    `The goods unsold on 31 March are an asset: Stock A/c is debited with ${inr(t.cs)}, and this balance goes to the Balance Sheet.`,
    'The closing stock reduces the cost of the goods sold: Trading A/c is credited.',
  ],
});

const stepSalesAndStock = (t: SetTrading): Step => ({
  text: `Transfer ${salesText(t)} to the credit of the Trading Account and bring the closing stock into the books, in one entry.`,
  lines: [Dr('sales', t.netSales), Dr('stock', t.cs), Cr('trading', t.credit)],
  explanation: [
    salesClosed(t),
    `The goods unsold on 31 March are an asset: Stock A/c is debited with ${inr(t.cs)}, and this balance goes to the Balance Sheet.`,
    `Sales and closing stock make up the credit side of the Trading Account: Trading A/c is credited with ${inr(t.netSales)} + ${inr(t.cs)} = ${inr(t.credit)}.`,
  ],
});

/** The balance of the Trading Account, which the student works out from the two sides. */
function stepGross(t: SetTrading): Step {
  const text = 'Close the Trading Account by transferring its balance, the gross profit or gross loss of the year, to the Profit and Loss Account.';
  const sides = `Debit side of the Trading Account = ${added([t.os, t.netPur, ...t.directs.map((d) => d[1])])}. Credit side = ${inr(t.netSales)} + ${inr(t.cs)} = ${inr(t.credit)}.`;
  return t.gross > 0
    ? {
        text,
        lines: [Dr('trading', t.gross), Cr('profitAndLoss', t.gross)],
        explanation: [
          sides,
          `The credit side is larger by ${inr(t.gross)}: a gross profit. Trading A/c is debited to close it.`,
          'The gross profit is carried to the credit of the Profit and Loss Account: Profit and Loss A/c is credited.',
        ],
      }
    : {
        text,
        lines: [Dr('profitAndLoss', -t.gross), Cr('trading', -t.gross)],
        explanation: [
          sides,
          `The debit side is larger by ${inr(-t.gross)}: a gross loss. It is carried to the debit of the Profit and Loss Account: Profit and Loss A/c is debited.`,
          'Trading A/c is credited to close it.',
        ],
      };
}

interface SetProfit {
  /** The gross profit; negative for a gross loss. */
  gross: number;
  exps: Bal[]; incs: Bal[]; E: number; I: number;
  /** The net profit; negative for a net loss. */
  net: number;
  capital: number; drawings: number;
}

/** Indirect expenses and incomes around a gross profit, with the capital and the drawings of the year. */
function drawSetProfit(rng: Rng, gross: number, expCount: number, incCount: number): SetProfit | null {
  const exps = rng.shuffle(SET_EXPENSES).slice(0, expCount).map((id): Bal => [id, amount(rng, 4000, 30000, 1000)]);
  const incs = rng.shuffle(SET_INCOMES).slice(0, incCount).map((id): Bal => [id, amount(rng, 2000, 15000, 1000)]);
  const E = total(exps);
  const I = total(incs);
  const net = gross + I - E;
  // A result too small to tell a profit from a loss at a glance is not asked.
  if (Math.abs(net) < rupees(5000)) return null;
  return { gross, exps, incs, E, I, net, capital: amount(rng, 300000, 900000, 50000), drawings: amount(rng, 20000, 90000, 5000) };
}

/** The gross profit or loss when the opening line gives it (the Trading Account is already drawn up). */
const stepGrossGiven = (p: SetProfit): Step =>
  p.gross > 0
    ? {
        text: 'Transfer the gross profit to the Profit and Loss Account.',
        lines: [Dr('trading', p.gross), Cr('profitAndLoss', p.gross)],
        explanation: [
          `A gross profit is the credit balance of the Trading Account, here ${inr(p.gross)}: Trading A/c is debited to close it.`,
          'The gross profit is carried to the credit of the Profit and Loss Account: Profit and Loss A/c is credited.',
        ],
      }
    : {
        text: 'Transfer the gross loss to the Profit and Loss Account.',
        lines: [Dr('profitAndLoss', -p.gross), Cr('trading', -p.gross)],
        explanation: [
          `A gross loss is the debit balance of the Trading Account, here ${inr(-p.gross)}. It is carried to the debit of the Profit and Loss Account: Profit and Loss A/c is debited.`,
          'Trading A/c is credited to close it.',
        ],
      };

/** `directs` are the direct expenses of the same list, which this entry leaves out (they went to the Trading Account). */
const stepExpenses = (p: SetProfit, directs: readonly Bal[] = []): Step => ({
  text: 'Transfer the indirect expenses to the debit of the Profit and Loss Account, in one entry.',
  lines: [Dr('profitAndLoss', p.E), ...p.exps.map(([id, a]) => Cr(id, a))],
  explanation: [
    `Indirect expenses are charged against the profit of the year: Profit and Loss A/c is debited with ${added(p.exps.map((x) => x[1]))}.`,
    `Each expense account has a debit balance, so each is credited to close it: ${andList(p.exps.map(([id, a]) => `${ac(id)} ${inr(a)}`))}.`,
    ...(p.exps.some(([id]) => id === 'carriageOutwards') ? ['Carriage outwards is paid on goods sent to customers: a cost of selling, so it is an indirect expense.'] : []),
    ...(directs.length > 0
      ? [`${andList(directs.map(([id]) => ac(id)))} ${directs.length > 1 ? 'are direct expenses and were' : 'is a direct expense and was'} closed to the Trading Account, so ${directs.length > 1 ? 'they are' : 'it is'} not part of this entry.`]
      : []),
  ],
});

const stepIncomes = (p: SetProfit): Step => ({
  text:
    p.incs.length > 1
      ? 'Transfer the indirect incomes to the credit of the Profit and Loss Account, in one entry.'
      : 'Transfer the indirect income to the credit of the Profit and Loss Account.',
  lines: [...p.incs.map(([id, a]) => Dr(id, a)), Cr('profitAndLoss', p.I)],
  explanation: [
    `An income account has a credit balance, so it is debited to close it: ${andList(p.incs.map(([id, a]) => `${ac(id)} ${inr(a)}`))}.`,
    `The income is carried to the credit of the Profit and Loss Account: Profit and Loss A/c is credited with ${added(p.incs.map((x) => x[1]))}.`,
  ],
});

/** What Capital A/c shows once the net result and the drawings are both in it: added to whichever entry comes last. */
const capitalNote = (p: SetProfit): string =>
  `Capital A/c now stands at ${inr(p.capital)} ${p.net > 0 ? '+' : '−'} ${inr(Math.abs(p.net))} − ${inr(p.drawings)} = ${inr(p.capital + p.net - p.drawings)}, the capital shown in the Balance Sheet.`;

/** The balance of the Profit and Loss Account, which the student works out from the two sides. */
function stepNet(p: SetProfit, last: boolean): Step {
  const text = 'Close the Profit and Loss Account by transferring its balance, the net profit or net loss of the year, to Capital A/c.';
  const side = (parts: [string, number][]): string =>
    parts.length === 0 ? 'nothing' : parts.length === 1 ? `${parts[0][0]} ${inr(parts[0][1])}` : `${parts.map(([l, a]) => `${l} ${inr(a)}`).join(' + ')} = ${inr(parts.reduce((s, x) => s + x[1], 0))}`;
  const credit: [string, number][] = [...(p.gross > 0 ? ([['gross profit', p.gross]] as [string, number][]) : []), ...(p.I > 0 ? ([[p.incs.length > 1 ? 'indirect incomes' : 'indirect income', p.I]] as [string, number][]) : [])];
  const debit: [string, number][] = [...(p.gross < 0 ? ([['gross loss', -p.gross]] as [string, number][]) : []), ['indirect expenses', p.E]];
  const sides = `Credit side of the Profit and Loss Account: ${side(credit)}. Debit side: ${side(debit)}.`;
  const note = last ? [capitalNote(p)] : [];
  return p.net > 0
    ? {
        text,
        lines: [Dr('profitAndLoss', p.net), Cr('capital', p.net)],
        explanation: [
          sides,
          `The credit side is larger by ${inr(p.net)}: a net profit. Profit and Loss A/c is debited to close it.`,
          'The profit belongs to the proprietor, so it is added to the capital: Capital A/c is credited.',
          ...note,
        ],
      }
    : {
        text,
        lines: [Dr('capital', -p.net), Cr('profitAndLoss', -p.net)],
        explanation: [
          sides,
          `The debit side is larger by ${inr(-p.net)}: a net loss. The loss is borne by the proprietor, so it reduces the capital: Capital A/c is debited.`,
          'Profit and Loss A/c is credited to close it.',
          ...note,
        ],
      };
}

const stepDrawings = (p: SetProfit, last: boolean): Step => ({
  text: 'Close Drawings A/c by transferring its balance to Capital A/c.',
  lines: [Dr('capital', p.drawings), Cr('drawings', p.drawings)],
  explanation: [
    'Drawings are not an expense, so they do not go to the Profit and Loss Account. They reduce the capital: Capital A/c is debited.',
    `Drawings A/c has a debit balance of ${inr(p.drawings)}, so it is credited to close it.`,
    ...(last ? [capitalNote(p)] : []),
  ],
});

/** The net result and the drawings, in an order drawn from the seed; the later of the two says what the capital now is. */
const capitalSteps = (rng: Rng, p: SetProfit): Step[] => (rng.pick([true, false]) ? [stepNet(p, false), stepDrawings(p, true)] : [stepDrawings(p, false), stepNet(p, true)]);

const ACCOUNT_BY_NAME = new Map(CLASS11_ACCOUNTS.map((a) => [a.name, a]));

/**
 * The independent check of a set of closing entries. The balances are read back from the opening line into a ledger
 * (debit balances positive), every entry of the set is posted to it, and the books must then be closed: every account
 * at nil except Stock A/c (the closing stock), Capital A/c (the capital after the net result and the drawings) and,
 * in a set that stops at the gross profit, Profit and Loss A/c. The gross and net results are worked out again here
 * by the formulas, from the listed balances, and compared with the entries that transfer them.
 */
function closesTheBooks(q: JournalSetQuestion): boolean {
  const before = new Map<string, number>();
  const put = (m: Map<string, number>, id: string, x: number) => m.set(id, (m.get(id) ?? 0) + x);
  let closing = 0;
  for (const line of q.prompt.split('\n')) {
    const m = /^(.+): (₹[\d,]+)$/.exec(line.trim());
    if (!m) continue;
    const x = parseRupees(m[2]);
    if (x === null) return false;
    const label = m[1];
    if (label === CLOSING_STOCK) closing = x;
    else if (label === OPENING_STOCK) put(before, 'stock', x);
    else if (label === OPENING_CAPITAL) put(before, 'capital', -x);
    else if (label.startsWith('Gross ')) put(before, label.includes('Profit and Loss A/c') ? 'profitAndLoss' : 'trading', label.startsWith('Gross profit') ? -x : x);
    else {
      const a = ACCOUNT_BY_NAME.get(label);
      if (!a) return false;
      put(before, a.id, normalSide(a) === 'Dr' ? x : -x);
    }
  }
  const after = new Map(before);
  for (const e of q.entries) for (const l of e.expected) put(after, l.accountId, l.side === 'Dr' ? l.amount : -l.amount);

  const was = (id: string) => before.get(id) ?? 0;
  const tradingListed = TRADING_IDS.some((id) => before.has(id));
  // Gross profit = sales less returns, plus closing stock, less opening stock, net purchases and direct expenses.
  const gross = tradingListed ? closing - TRADING_IDS.reduce((s, id) => s + was(id), 0) : -(was('trading') + was('profitAndLoss'));
  const indirect = [...before.keys()].filter((id) => !TRADING_IDS.includes(id) && ['income', 'expense'].includes(resolveAccount(id).type));
  // Net profit = gross profit, plus the incomes (credit balances), less the indirect expenses (debit balances).
  const net = gross - indirect.reduce((s, id) => s + was(id), 0);
  if (gross === 0) return false;

  const has = (e: JournalSetQuestion['entries'][number], id: string) => e.expected.some((l) => l.accountId === id);
  const sideOf = (e: JournalSetQuestion['entries'][number], id: string) => e.expected.find((l) => l.accountId === id)!;
  const grossEntry = q.entries.find((e) => e.expected.length === 2 && has(e, 'trading') && has(e, 'profitAndLoss'));
  const netEntry = q.entries.find((e) => e.expected.length === 2 && has(e, 'profitAndLoss') && has(e, 'capital'));
  const grossAlreadyMoved = was('profitAndLoss') !== 0;
  if (grossAlreadyMoved === (grossEntry !== undefined)) return false;
  if (grossEntry) {
    const l = sideOf(grossEntry, 'trading');
    if (l.amount !== Math.abs(gross) || l.side !== (gross > 0 ? 'Dr' : 'Cr')) return false;
  }
  if (netEntry) {
    const l = sideOf(netEntry, 'profitAndLoss');
    if (net === 0 || l.amount !== Math.abs(net) || l.side !== (net > 0 ? 'Dr' : 'Cr')) return false;
  }
  const closingCapital = -was('capital') + net - was('drawings');
  if (netEntry && closingCapital <= 0) return false;
  return [...after].every(([id, x]) => {
    if (id === 'stock') return x === closing && closing > 0;
    if (id === 'capital') return netEntry !== undefined && x === -closingCapital;
    if (id === 'profitAndLoss') return x === (netEntry ? 0 : -gross);
    return x === 0;
  });
}

const closingSet = (id: string, difficulty: Difficulty, generate: (rng: Rng) => JournalSetParts | null) =>
  journalSetTemplate({ id, topicId: T, conceptId: C_SETS, difficulty, generate, verify: closesTheBooks });

/**
 * The entries on the two sides of the Trading Account, in an order drawn from the seed. Closing stock is brought in
 * by an entry of its own, as the topic's card on closing entries gives it; `merge` joins it with the sales in one
 * compound entry, which the item then asks for in so many words, and is used only where a set would otherwise be
 * longer than its difficulty allows.
 */
function tradingSteps(rng: Rng, t: SetTrading, o: { split: boolean; merge: boolean }): Step[] {
  const returns = rng.shuffle([...(t.purRet ? [stepPurchasesReturn(t)] : []), ...(t.salesRet ? [stepSalesReturn(t)] : [])]);
  const [stockOut, ...directs] = o.split ? [stepTradingDebit(t, 'goods'), stepTradingDebit(t, 'direct')] : [stepTradingDebit(t, 'all')];
  // The opening stock leaves Stock A/c before the closing stock is brought into it, as the opening line says.
  const threads = o.merge ? [[stockOut, stepSalesAndStock(t)], directs] : [[stockOut, stepClosingStock(t)], directs, [stepSales(t)]];
  // A return is closed before the account it reduces is transferred; the gross result comes when both sides are in.
  return [...returns, ...interleave(rng, threads), stepGross(t)];
}

// 1. The closing entries of the Trading Account, up to the gross profit or loss (4 or 5 entries).
const faSetTradingClosing = closingSet('fa-set-trading-closing', 'medium', (rng) => {
  const [name, trade] = rng.pick(OWNERS);
  const returns = rng.pick<Returns>(['none', 'none', 'purchases', 'sales', 'both', 'both']);
  // Without returns the debit side is sometimes passed in two entries. With both returns the credit side has to be
  // one entry (the item says so), or the set would have six entries.
  const split = returns === 'none' && rng.pick([true, false]);
  // One year in eight ends in a gross loss, so the side of the last entry has to be worked out, not assumed.
  const t = drawSetTrading(rng, returns, split ? 2 : rng.pick([1, 2]), rng.int(1, 8) === 1);
  return {
    task: CLOSING_TASK,
    opening: [
      `${name}, ${trade}, closes the books ${CLOSING_DAY}. These entries make up the Trading Account; work out every amount from the balances below. ${STOCK_NOTE}${freightNote(t)}`,
      rows([[OPENING_STOCK, t.os], ...listed(tradingBalances(t)), [CLOSING_STOCK, t.cs]]),
    ].join('\n'),
    transactions: labelled(tradingSteps(rng, t, { split, merge: returns === 'both' })),
    hints: CLOSING_HINTS,
    distractorAccounts: ['capital', 'carriageOutwards', 'salaries'],
  };
});

// 2. The closing entries of the Profit and Loss Account and of capital, from a gross profit that is given (4 or 5 entries).
const faSetPlClosing = closingSet('fa-set-pl-closing', 'medium', (rng) => {
  const [name, trade] = rng.pick(OWNERS);
  const gross = rng.int(1, 8) === 1 ? -amount(rng, 5000, 30000, 1000) : amount(rng, 50000, 220000, 5000);
  // `moved`: the gross result already stands in Profit and Loss A/c. `noIncome`: the business has no other income.
  const shape = rng.pick(['all', 'all', 'moved', 'noIncome'] as const);
  const p = drawSetProfit(rng, gross, rng.pick([2, 3, 4]), shape === 'noIncome' ? 0 : rng.pick([1, 2]));
  if (!p) return null;
  const word = gross > 0 ? 'profit' : 'loss';
  const grossLine: Item =
    shape === 'moved'
      ? [`Gross ${word}, already transferred to the ${gross > 0 ? 'credit' : 'debit'} of Profit and Loss A/c`, Math.abs(gross)]
      : [`Gross ${word}, the ${gross > 0 ? 'credit' : 'debit'} balance of Trading A/c`, Math.abs(gross)];
  const transfers = interleave(rng, [[stepExpenses(p)], p.incs.length > 0 ? [stepIncomes(p)] : []]);
  return {
    task: CLOSING_TASK,
    opening: [
      `${name}, ${trade}, has drawn up the Trading Account and closes the rest of the books ${CLOSING_DAY}. Work out every amount from the balances below. No capital was introduced during the year.`,
      rows([grossLine, ...listed(rng.shuffle([...p.exps, ...p.incs])), [OPENING_CAPITAL, p.capital], ...listed([['drawings', p.drawings]])]),
    ].join('\n'),
    transactions: labelled([...(shape === 'moved' ? [] : [stepGrossGiven(p)]), ...transfers, ...capitalSteps(rng, p)]),
    hints: CLOSING_HINTS,
    distractorAccounts: ['trading', 'sales', 'purchases', 'wages'],
  };
});

// 3. The whole of the closing: Trading Account, Profit and Loss Account and capital (6 to 8 entries).
const faSetYearEndClosing = closingSet('fa-set-year-end-closing', 'complex', (rng) => {
  const [name, trade] = rng.pick(OWNERS);
  const returns = rng.pick<Returns>(['none', 'none', 'purchases', 'sales', 'both']);
  // Entries when the sales and the closing stock each have their own: the returns, the debit side, the two credits,
  // the gross result, the indirect expenses, the incomes if any, the net result and the drawings. A set has room for
  // eight, so only a longer one joins the sales and the closing stock in one entry (and its item says so). To keep
  // that the exception, a year with a return more often has no other income, and one with both returns has none.
  const returnCount = returns === 'none' ? 0 : returns === 'both' ? 2 : 1;
  const incCount = returnCount === 2 ? 0 : returnCount === 1 ? rng.pick([0, 0, 1]) : rng.pick([0, 1, 2]);
  const merge = returnCount + 7 + (incCount > 0 ? 1 : 0) > 8;
  const t = drawSetTrading(rng, returns, rng.pick([1, 2]), rng.int(1, 10) === 1);
  const p = drawSetProfit(rng, t.gross, rng.pick([2, 3]), incCount);
  if (!p) return null;
  const transfers = interleave(rng, [[stepExpenses(p, t.directs)], p.incs.length > 0 ? [stepIncomes(p)] : []]);
  return {
    task: CLOSING_TASK,
    opening: [
      `${name}, ${trade}, closes the books ${CLOSING_DAY}. Work out every amount from the balances below. No capital was introduced during the year. ${STOCK_NOTE}${freightNote(t)}`,
      rows([
        [OPENING_STOCK, t.os],
        ...listed(rng.shuffle([...tradingBalances(t), ...p.exps, ...p.incs])),
        [OPENING_CAPITAL, p.capital],
        ...listed([['drawings', p.drawings]]),
        [CLOSING_STOCK, t.cs],
      ]),
    ].join('\n'),
    transactions: labelled([...tradingSteps(rng, t, { split: false, merge }), ...transfers, ...capitalSteps(rng, p)]),
    hints: CLOSING_HINTS,
  };
});

const sets: Template[] = [faSetTradingClosing, faSetPlClosing, faSetYearEndClosing];

// ---------------------------------------------------------------------------------------------------------------
// FORMATS. The student prepares one statement of the final accounts, row by row: the Trading Account, the Profit and
// Loss Account or the Balance Sheet. The data is a whole trial balance that agrees, drawn as the case studies of the
// final accounts draw theirs (the capital is a round figure and the bank balance is the balancing figure), and then
// the closing stock, which stands outside it. The rows are read from the books: each balance of the ledger goes to
// its statement by the type of its account. `verify` works the statement out again from the printed data alone,
// placing every printed balance by its name.
// ---------------------------------------------------------------------------------------------------------------

const C_FORMATS = 'fa-formats';
const FMT_DATE = '31 March 2026';
/** The chart has no "sundry" accounts, so the totals of debtors and creditors are written as party accounts. */
const FMT_DEBTORS = debtor('Sundry Debtors');
const FMT_CREDITORS = creditor('Sundry Creditors');

const GP_CD = 'Gross Profit c/d';
const GL_CD = 'Gross Loss c/d';
const GP_BD = 'Gross Profit b/d';
const GL_BD = 'Gross Loss b/d';
const NET_PROFIT = 'Net Profit transferred to Capital A/c';
const NET_LOSS = 'Net Loss transferred to Capital A/c';

/** A head of account and the range its balance is drawn from, in rupees. */
type FmtHead = readonly [id: string, min: number, max: number, step: number];
/** Freight is left out: the name alone does not say whether it was paid on goods bought or on goods sent out. */
const FMT_DIRECT: FmtHead[] = [['wages', 18000, 60000, 2000], ['carriageInwards', 6000, 24000, 1000], ['powerAndFuel', 8000, 30000, 1000]];
const FMT_INDIRECT: FmtHead[] = [
  ['salaries', 36000, 96000, 6000], ['rent', 24000, 72000, 6000], ['insurance', 8000, 24000, 1000], ['advertisement', 10000, 30000, 2000],
  ['carriageOutwards', 5000, 20000, 1000], ['telephone', 6000, 18000, 1000], ['stationery', 3000, 12000, 1000],
  ['discountAllowed', 3000, 12000, 1000], ['bankCharges', 1000, 5000, 1000], ['generalExpenses', 4000, 18000, 1000],
  ['charity', 2000, 10000, 1000], ['auditFees', 5000, 20000, 1000],
];
const FMT_INCOME: FmtHead[] = [
  ['commissionReceived', 9000, 24000, 1000], ['discountReceived', 3000, 12000, 1000], ['rentReceived', 12000, 36000, 1000], ['interestReceived', 3000, 12000, 1000],
];
/** The fixed assets, the most permanent first. */
const FMT_FIXED: FmtHead[] = [
  ['building', 300000, 800000, 50000], ['machinery', 150000, 500000, 10000], ['furniture', 40000, 150000, 5000],
  ['vehicles', 150000, 400000, 10000], ['computers', 40000, 160000, 5000],
];
/** An expense students take for the direct expense beside it: listed with it whenever there is room. */
const FMT_TWIN: Record<string, string> = { carriageInwards: 'carriageOutwards', wages: 'salaries' };

interface FmtSpec {
  fixed: number;
  directs: number;
  indirect: number;
  incomes: number;
  returns: Returns;
  /** The year ends in a net profit, in a net loss after a gross profit, or in a gross loss. */
  result: 'profit' | 'netLoss' | 'grossLoss';
  loan?: boolean;
  billsPayable?: boolean;
  billsReceivable?: boolean;
  cash?: boolean;
  /** The bank balance is a credit one: an overdraft. */
  overdraft?: boolean;
}

/** A business, its trial balance on the last day of the year (a debit balance positive) and its closing stock. */
interface FmtBooks {
  name: string;
  trade: string;
  ledger: Ledger;
  cs: number;
}

/** The first result `make` gives in a few goes: a format tries other figures before it gives a seed up. */
function fmtTry<P>(goes: number, make: () => P | null): P | null {
  for (let i = 0; i < goes; i++) {
    const made = make();
    if (made) return made;
  }
  return null;
}

/**
 * A trial balance that agrees. The gross profit follows from the result wanted, the cost of goods sold from a margin
 * on it, purchases and sales from those. The capital is what the other balances need, taken to a round figure, and
 * the bank balance is the balancing figure (an overdraft when the spec asks for one). Null for figures that would
 * not be believable: a capital too small, or a profit or a loss out of proportion to it.
 */
function fmtBooks(rng: Rng, s: FmtSpec): FmtBooks | null {
  const [name, trade] = rng.pick(OWNERS);
  const at = ([id, min, max, step]: FmtHead): Bal => [id, amount(rng, min, max, step)];
  const directs = rng.shuffle(FMT_DIRECT).slice(0, s.directs).map(at);
  const twins = directs.map(([id]) => FMT_TWIN[id]);
  const pool = rng.shuffle(FMT_INDIRECT);
  // A business with a bank loan has paid the year's interest on it: one of its indirect expenses.
  const loan = s.loan ? amount(rng, 100000, 300000, 50000) : 0;
  const interest: Bal[] = loan ? [['interestPaid', (loan * rng.pick([8, 10, 12])) / 100]] : [];
  const indirect = [...[...pool.filter(([id]) => twins.includes(id)), ...pool.filter(([id]) => !twins.includes(id))].slice(0, s.indirect - interest.length).map(at), ...interest];
  const incomes = rng.shuffle(FMT_INCOME).slice(0, s.incomes).map(at);
  let gross: number;
  let cogs: number;
  if (s.result === 'grossLoss') {
    gross = -amount(rng, 6000, 30000, 1000);
    cogs = amount(rng, 300000, 700000, 10000);
  } else {
    const net = s.result === 'profit' ? amount(rng, 40000, 150000, 1000) : -amount(rng, 6000, 36000, 1000);
    gross = total(indirect) - total(incomes) + net;
    if (gross < rupees(s.result === 'profit' ? 80000 : 24000)) return null;
    // A year that ends in a loss is one of thin margins.
    const margin = rng.pick(s.result === 'profit' ? [20, 25, 30, 40] : [8, 10, 12]);
    cogs = Math.round((gross * 100) / margin / rupees(10000)) * rupees(10000);
  }
  const round5 = (v: number): number => Math.round(v / rupees(5000)) * rupees(5000);
  const os = round5((cogs * rng.int(8, 16)) / 100);
  const counted = round5((cogs * rng.int(9, 18)) / 100);
  const cs = counted === os ? os + rupees(5000) : counted;
  const pr = s.returns === 'purchases' || s.returns === 'both' ? amount(rng, 4000, 20000, 1000) : 0;
  const sr = s.returns === 'sales' || s.returns === 'both' ? amount(rng, 4000, 20000, 1000) : 0;
  const purchases = cogs - os - total(directs) + cs + pr;
  const sales = cogs + gross + sr;
  if (purchases < rupees(100000)) return null;
  const drawings = amount(rng, 24000, 72000, 6000);
  // Debtors and creditors in proportion to the turnover, and bills in proportion to them.
  const debtors = round5((sales * rng.int(10, 24)) / 100);
  const creditors = round5((cogs * rng.int(8, 18)) / 100);
  const bills = (owed: number): number => Math.max(rupees(5000), round5((owed * rng.int(20, 45)) / 100));
  const lines: JournalLine[] = [
    Dr('drawings', drawings),
    ...rng.shuffle(FMT_FIXED).slice(0, s.fixed).map(at).map(([id, a]) => Dr(id, a)),
    Dr('stock', os),
    Dr('purchases', purchases),
    ...(pr ? [Cr('purchasesReturn', pr)] : []),
    Cr('sales', sales),
    ...(sr ? [Dr('salesReturn', sr)] : []),
    ...[...directs, ...indirect].map(([id, a]) => Dr(id, a)),
    ...incomes.map(([id, a]) => Cr(id, a)),
    Dr(FMT_DEBTORS, debtors),
    Cr(FMT_CREDITORS, creditors),
    ...(loan ? [Cr('bankLoan', loan)] : []),
    ...(s.billsPayable ? [Cr('billsPayable', bills(creditors))] : []),
    ...(s.billsReceivable ? [Dr('billsReceivable', bills(debtors))] : []),
    ...(s.cash ? [Dr('cash', amount(rng, 4000, 20000, 1000))] : []),
  ];
  // What the capital less the bank balance must be for the two columns to agree.
  const gap = lines.reduce((x, l) => x + (l.side === 'Dr' ? l.amount : -l.amount), 0);
  const spare = amount(rng, 12000, 40000, 1000);
  const capital = s.overdraft ? Math.floor((gap - spare) / rupees(10000)) * rupees(10000) : Math.ceil((gap + spare) / rupees(10000)) * rupees(10000);
  const bank = capital - gap;
  const net = gross - total(indirect) + total(incomes);
  // A profit of more than two fifths of the capital, or a loss of more than a quarter of it, would not be believable.
  if (capital < rupees(150000) || net * 100 > capital * 40 || -net * 4 > capital) return null;
  // A trial balance lists the accounts as the ledger has them, in no order of its own.
  const ledger = post([rng.shuffle([Cr('capital', capital), ...lines, bank > 0 ? Dr('bank', bank) : Cr('bank', -bank)])]);
  return { name, trade, ledger, cs };
}

/** The final accounts a trial balance and its closing stock give, every balance placed by the type of its account. */
interface FmtFigures {
  os: number; pur: number; pr: number; netPur: number; directs: Bal[];
  sales: number; sr: number; netSales: number; cs: number;
  /** The two sides of the Trading Account before its balance. */
  debit: number; credit: number;
  /** The gross profit and the net profit; negative for a loss. */
  gross: number; net: number;
  /** The indirect expenses and the incomes other than sales, in the order of the trial balance. */
  expenses: Bal[]; incomes: Bal[];
}

function fmtFigures(b: FmtBooks): FmtFigures {
  const of = (id: string): number => b.ledger.get(id) ?? 0;
  const typed = (type: string, trading: boolean): Bal[] => [...b.ledger].filter(([id]) => resolveAccount(id).type === type && TRADING_IDS.includes(id) === trading);
  const directs = typed('expense', true).filter(([id]) => SET_DIRECT.includes(id));
  const expenses = typed('expense', false);
  const incomes = typed('income', false).map(([id, x]): Bal => [id, -x]);
  const [os, pur, pr, sales, sr] = [of('stock'), of('purchases'), -of('purchasesReturn'), -of('sales'), of('salesReturn')];
  const debit = os + pur - pr + total(directs);
  const credit = sales - sr + b.cs;
  const gross = credit - debit;
  return { os, pur, pr, netPur: pur - pr, directs, sales, sr, netSales: sales - sr, cs: b.cs, debit, credit, gross, net: gross - total(expenses) + total(incomes), expenses, incomes };
}

const FMT_TB_LABELS: Record<string, string> = { stock: 'Opening Stock' };
const fmtRow = (label: string, amt: number, details?: string[]): FormatRowParts => ({ label, amount: amt, ...(details ? { details } : {}) });
const fmtClosing = (label: string, amt: number): FormatRowParts => ({ label, amount: amt, closing: true });
/** "wages ₹24,000 and carriage inwards ₹8,000". */
const fmtNamed = (xs: readonly Bal[]): string => andList(xs.map(([id, a]) => `${ledgerName(id).toLowerCase()} ${inr(a)}`));
const fmtNames = (xs: readonly Bal[]): string => andList(xs.map(([id]) => ledgerName(id).toLowerCase()));

/**
 * The data of a format: the business and the day, the trial balance one balance to a line, the closing stock, and
 * then whatever an account already prepared shows (`given`).
 */
function fmtData(b: FmtBooks, given?: string): string {
  return [
    `${b.name}, ${b.trade}, closes the books on ${FMT_DATE}, the end of the accounting year. The trial balance on that date:`,
    listBalances(trialBalance(b.ledger).rows.map((r) => ({ ...r, label: FMT_TB_LABELS[r.accountId] ?? r.label }))),
    `Closing stock is valued at ${inr(b.cs)}; it is not in the trial balance.`,
    ...(given ? [given] : []),
  ].join('\n');
}

/**
 * A statement of the final accounts without the data it is prepared from. A format that stands alone adds its data
 * (`fmtData`); in a case that chains the three statements on one trial balance the case text is the data.
 */
type FmtStatement = Omit<AccountParts, 'data'>;

const FMT_SORT_HINT = 'Sort the balances before you enter any: a cost of the goods, a cost of running the business or another income, or something owned, owed or due to the proprietor?';

/** The Trading Account of a set of books: its balance is the gross profit, or the gross loss on the other side. */
function fmtTradingParts(b: FmtBooks): FmtStatement {
  const f = fmtFigures(b);
  const leftOut = [...f.expenses, ...f.incomes];
  return {
    task: `Prepare the Trading Account of ${b.name} for the year ended ${FMT_DATE}; enter each item at its net figure.`,
    title: `Trading Account of ${b.name} for the year ended ${FMT_DATE}`,
    left: drSide([
      fmtRow('Opening Stock', f.os),
      fmtRow('Purchases', f.netPur, f.pr ? [`Purchases ${inr(f.pur)}`, `Less: Purchases Return ${inr(f.pr)}`] : undefined),
      ...f.directs.map(([id, a]) => fmtRow(ledgerName(id), a)),
      ...(f.gross > 0 ? [fmtClosing(GP_CD, f.gross)] : []),
    ]),
    right: crSide([
      fmtRow('Sales', f.netSales, f.sr ? [`Sales ${inr(f.sales)}`, `Less: Sales Return ${inr(f.sr)}`] : undefined),
      fmtRow('Closing Stock', f.cs),
      ...(f.gross < 0 ? [fmtClosing(GL_CD, -f.gross)] : []),
    ]),
    // An indirect expense offered for the Trading Account, the balance brought down where it is carried down, the
    // owner's accounts, and a return entered as a row of its own.
    distractors: [
      ...leftOut.slice(0, 4).map(([id]) => ledgerName(id)),
      f.gross > 0 ? GP_BD : GL_BD,
      f.gross > 0 ? GL_CD : GP_CD,
      'Drawings',
      'Capital',
      ...(f.pr ? ['Purchases Return'] : []),
      ...(f.sr ? ['Sales Return'] : []),
    ],
    explanation: [
      `Debit side, the cost of the goods: opening stock ${inr(f.os)}, purchases ${f.pr ? `less the return, ${inr(f.pur)} − ${inr(f.pr)} = ${inr(f.netPur)}` : inr(f.netPur)}, and the direct ${f.directs.length > 1 ? 'expenses' : 'expense'}, ${fmtNamed(f.directs)}.`,
      `Credit side: sales ${f.sr ? `less the return, ${inr(f.sales)} − ${inr(f.sr)} = ${inr(f.netSales)}` : inr(f.netSales)}, and the closing stock ${inr(f.cs)}, which is given below the trial balance.`,
      `${cap(fmtNames(leftOut))} are indirect items: they wait for the Profit and Loss Account. Capital, drawings, the assets and the liabilities go to the Balance Sheet.`,
      ...(f.expenses.some(([id]) => id === 'carriageOutwards') && f.directs.some(([id]) => id === 'carriageInwards')
        ? ['Carriage inwards is paid to bring the goods in, so it is a cost of the goods; carriage outwards is paid to send them to customers, a selling expense.']
        : []),
      `Debit side = ${added([f.os, f.netPur, ...f.directs.map((d) => d[1])])}. Credit side = ${inr(f.netSales)} + ${inr(f.cs)} = ${inr(f.credit)}.`,
      f.gross > 0
        ? `The credit side is larger by ${inr(f.gross)}: a gross profit. It is entered on the debit side as "To ${GP_CD}", and both sides then total ${inr(f.credit)}.`
        : `The debit side is larger by ${inr(-f.gross)}: the goods cost more than they brought in, a gross loss. It is entered on the credit side as "By ${GL_CD}", and both sides then total ${inr(f.debit)}.`,
    ],
    hints: [
      FMT_SORT_HINT,
      'Debit: opening stock, purchases less returns and the direct expenses. Credit: sales less returns and the closing stock. The difference is the gross profit (credit side larger) or the gross loss (debit side larger), entered on the shorter side.',
    ],
  };
}

/** What the data of a Profit and Loss Account says the Trading Account shows. */
const fmtGrossGiven = (b: FmtBooks): string => {
  const { gross } = fmtFigures(b);
  return `The Trading Account for the year, already prepared, shows a gross ${gross > 0 ? 'profit' : 'loss'} of ${inr(Math.abs(gross))}.`;
};

/**
 * The Profit and Loss Account of a set of books, from the gross profit or loss its data gives (`from` left out), or,
 * in a case that has just asked for the Trading Account, from the one that account shows.
 */
function fmtProfitAndLossParts(b: FmtBooks, from = 'given'): FmtStatement {
  const f = fmtFigures(b);
  const E = total(f.expenses);
  const I = total(f.incomes);
  const debit = E + Math.max(0, -f.gross);
  const credit = I + Math.max(0, f.gross);
  const row = ([id, a]: Bal): FormatRowParts => fmtRow(ledgerName(id), a);
  const apart = [...f.expenses, ...f.incomes].filter(([id]) => ['charity', 'rentReceived', 'interestReceived'].includes(id));
  return {
    task: `Prepare the Profit and Loss Account of ${b.name} for the year ended ${FMT_DATE}, starting from the gross ${f.gross > 0 ? 'profit' : 'loss'} ${from}.`,
    title: `Profit and Loss Account of ${b.name} for the year ended ${FMT_DATE}`,
    left: drSide([...(f.gross < 0 ? [fmtRow(GL_BD, -f.gross)] : []), ...f.expenses.map(row), ...(f.net > 0 ? [fmtClosing(NET_PROFIT, f.net)] : [])]),
    right: crSide([...(f.gross > 0 ? [fmtRow(GP_BD, f.gross)] : []), ...f.incomes.map(row), ...(f.net < 0 ? [fmtClosing(NET_LOSS, -f.net)] : [])]),
    // A direct expense offered for the Profit and Loss Account, the items of the Trading Account and of the Balance
    // Sheet, the gross result carried down where it is brought down, and the other closing row.
    distractors: [
      ...f.directs.map(([id]) => ledgerName(id)),
      'Purchases',
      'Closing Stock',
      'Drawings',
      'Capital',
      f.gross > 0 ? GP_CD : GL_CD,
      f.net > 0 ? NET_LOSS : NET_PROFIT,
      'Sundry Debtors',
    ],
    explanation: [
      f.gross > 0
        ? `The gross profit of ${inr(f.gross)} is brought down from the Trading Account to the credit side: "By ${GP_BD}".`
        : `The gross loss of ${inr(-f.gross)} is brought down from the Trading Account to the debit side: "To ${GL_BD}".`,
      `Debit side, the indirect expenses: ${fmtNamed(f.expenses)}.`,
      ...(f.incomes.length > 0 ? [`Credit side, the ${f.incomes.length > 1 ? 'incomes' : 'income'} other than sales: ${fmtNamed(f.incomes)}.`] : []),
      `${cap(fmtNames(f.directs))}, the stocks, purchases and sales have already been used in the Trading Account. Capital, drawings, the assets and the liabilities go to the Balance Sheet.`,
      ...(apart.length > 0 ? [`${cap(fmtNames(apart))} ${apart.length > 1 ? 'do' : 'does'} not come from buying and selling goods, but ${apart.length > 1 ? 'they are items' : 'it is an item'} of the Profit and Loss Account all the same.`] : []),
      `Debit side = ${added([...(f.gross < 0 ? [-f.gross] : []), ...f.expenses.map((x) => x[1])])}. Credit side = ${credit > 0 ? added([...(f.gross > 0 ? [f.gross] : []), ...f.incomes.map((x) => x[1])]) : 'nothing'}.`,
      f.net > 0
        ? `The credit side is larger by ${inr(f.net)}: a net profit. It is entered on the debit side as "To ${NET_PROFIT}", and both sides then total ${inr(credit)}.`
        : `The debit side is larger by ${inr(-f.net)}: a net loss. It is entered on the credit side as "By ${NET_LOSS}", and both sides then total ${inr(debit)}.`,
    ],
    hints: [
      FMT_SORT_HINT,
      'Credit: the gross profit brought down and the incomes other than sales. Debit: the indirect expenses (and a gross loss, if that is what the Trading Account shows). The difference is the net profit or the net loss, entered on the shorter side.',
    ],
  };
}

type Marshal = 'liquidity' | 'permanence';

/** What the data of a Balance Sheet says of the year: the net profit already found, and that the capital only moved by it and the drawings. */
const FMT_NO_CAPITAL = 'No capital was brought in during the year.';
const fmtNetGiven = (b: FmtBooks): string => `The Trading and Profit and Loss Account for the year, already prepared, shows a net profit of ${inr(fmtFigures(b).net)}. ${FMT_NO_CAPITAL}`;

/**
 * The Balance Sheet of a set of books, the capital as one figure after the net profit and the drawings. `unmarked`
 * (version 2 of `fa-fmt-balance-sheet`): an account format matches the rows of a side as a collection and cannot
 * mark their order, so the task no longer asks for an order it would not check; it says the solution sets the rows out
 * in that order. It also puts a bank overdraft before the creditors, after the long-term loan. The chained cases keep
 * the first wording.
 */
function fmtBalanceSheetParts(b: FmtBooks, order: Marshal, unmarked = false): FmtStatement {
  const f = fmtFigures(b);
  const of = (id: string): number => b.ledger.get(id) ?? 0;
  const bank = of('bank');
  const capital = -of('capital');
  const drawings = of('drawings');
  const fixed = FMT_FIXED.filter(([id]) => b.ledger.has(id)).map(([id]): Bal => [id, of(id)]);
  // Both sides in the order of permanence; the order of liquidity is the same lists read from the other end.
  const assets: FormatRowParts[] = [
    ...fixed.map(([id, a]) => fmtRow(ledgerName(id), a)),
    fmtRow('Closing Stock', b.cs),
    fmtRow('Sundry Debtors', of(FMT_DEBTORS)),
    ...(b.ledger.has('billsReceivable') ? [fmtRow('Bills Receivable', of('billsReceivable'))] : []),
    ...(bank > 0 ? [fmtRow('Cash at Bank', bank)] : []),
    ...(b.ledger.has('cash') ? [fmtRow('Cash in Hand', of('cash'))] : []),
  ];
  const overdraft = bank < 0 ? [fmtRow('Bank Overdraft', -bank)] : [];
  const liabilities: FormatRowParts[] = [
    fmtRow('Capital', capital + f.net - drawings, [`Opening Capital ${inr(capital)}`, `Add: Net Profit ${inr(f.net)}`, `Less: Drawings ${inr(drawings)}`]),
    ...(b.ledger.has('bankLoan') ? [fmtRow('Bank Loan', -of('bankLoan'))] : []),
    ...(unmarked ? overdraft : []),
    fmtRow('Sundry Creditors', -of(FMT_CREDITORS)),
    ...(b.ledger.has('billsPayable') ? [fmtRow('Bills Payable', -of('billsPayable'))] : []),
    ...(unmarked ? [] : overdraft),
  ];
  const inOrder = (rows: FormatRowParts[]): FormatRowParts[] => (order === 'permanence' ? rows : [...rows].reverse());
  const side = (rows: FormatRowParts[]): string => rows.map((r) => `${r.label} ${inr(r.amount ?? 0)}`).join(', ');
  const bsTotal = assets.reduce((x, r) => x + (r.amount ?? 0), 0);
  return {
    task: unmarked
      ? `Prepare the Balance Sheet of ${b.name} as at ${FMT_DATE}; enter each item at its net figure, the capital after the net profit and the drawings. The rows may be entered in any order: the solution sets them out in the order of ${order}.`
      : `Prepare the Balance Sheet of ${b.name} as at ${FMT_DATE} in the order of ${order}; enter each item at its net figure, the capital after the net profit and the drawings.`,
    title: `Balance Sheet of ${b.name} as at ${FMT_DATE}`,
    left: { title: 'Liabilities', rows: inOrder(liabilities) },
    right: { title: 'Assets', rows: inOrder(assets) },
    // Drawings and the profit as rows of their own, the stock of the wrong day, the bank balance under the name of
    // the other side, and balances that were closed to the Trading and Profit and Loss Account.
    distractors: ['Drawings', 'Net Profit', 'Opening Stock', bank > 0 ? 'Bank Overdraft' : 'Cash at Bank', 'Sales', 'Purchases', ledgerName(f.expenses[0][0])],
    explanation: [
      `Capital = opening capital ${inr(capital)} + net profit ${inr(f.net)} − drawings ${inr(drawings)} = ${inr(capital + f.net - drawings)}. The profit belongs to the proprietor and the drawings were taken out by the proprietor, so both are shown inside the capital and neither is a row of its own.`,
      `Liabilities, what the business owes: ${side(inOrder(liabilities))}.`,
      `Assets, what the business owns: ${side(inOrder(assets))}.`,
      'The closing stock is an asset although it is not in the trial balance. The opening stock is not: it went into the cost of the goods in the Trading Account.',
      bank > 0
        ? 'Bank A/c has a debit balance: money of the business lying at the bank, shown as Cash at Bank among the assets.'
        : 'Bank A/c has a credit balance: the business has drawn more than it had at the bank and owes the difference, so it is shown as Bank Overdraft among the liabilities.',
      order === 'liquidity'
        ? 'Order of liquidity: the assets begin with the one nearest to cash and end with the most lasting; the liabilities begin with the one to be paid soonest and end with the capital.'
        : 'Order of permanence: the assets begin with the most lasting and end with cash; the liabilities begin with the capital and end with the one to be paid soonest.',
      `Sales, purchases, the expenses and the incomes were closed to the Trading and Profit and Loss Account, so none of them is here. Both sides total ${inr(bsTotal)}.`,
    ],
    hints: [
      'Only what the business owns, what it owes and what is due to the proprietor has a place here. Which balances of the trial balance were already used up in finding the profit?',
      'Liabilities: capital (opening capital, add net profit, less drawings) and the amounts owed to others. Assets: fixed assets, closing stock, debtors, bills receivable, bank and cash. The two sides must agree.',
    ],
  };
}

// ---- the independent reading: the printed data worked by hand, every printed balance placed by its name ----

const FMT_READ_DIRECT = ['Wages A/c', 'Carriage Inwards A/c', 'Power and Fuel A/c'];
const FMT_READ_COST = ['Opening Stock', 'Purchases A/c', 'Purchases Return A/c', ...FMT_READ_DIRECT];
const FMT_READ_SALES = ['Sales A/c', 'Sales Return A/c'];
/** What is owned or owed on the last day; a credit balance among them is a liability. */
const FMT_READ_POSITION = [
  'Building A/c', 'Machinery A/c', 'Furniture A/c', 'Vehicles A/c', 'Computers A/c', 'Sundry Debtors', 'Bills Receivable A/c', 'Bank A/c', 'Cash A/c',
  'Sundry Creditors', 'Bills Payable A/c', 'Bank Loan A/c',
];
const FMT_READ_OWNER = ['Capital A/c', 'Drawings A/c'];
/** Every printed balance that is not an indirect expense or an income other than sales. */
const FMT_READ_ELSEWHERE = new Set([...FMT_READ_COST, ...FMT_READ_SALES, ...FMT_READ_POSITION, ...FMT_READ_OWNER]);
/** "Wages A/c" as the row of a statement names it. */
const fmtPlain = (printed: string): string => printed.replace(/ A\/c$/, '');

interface FmtHand {
  /** A printed balance, a debit as a positive figure (0 when the trial balance has no such line). */
  get(label: string): number;
  labels: string[];
  cs: number;
  /** The gross and the net profit the printed figures give (negative for a loss). */
  gross: number;
  net: number;
  /** What the data says an account already prepared shows, a loss as a negative figure. */
  given: { level: string; result: number } | null;
}

/** Null for data whose trial balance does not agree, lists an account twice or has no closing stock beside it. */
function fmtRead(data: string): FmtHand | null {
  const printed = new Map<string, number>();
  let cs = 0;
  for (const line of data.split('\n')) {
    const m = /^(.+): (₹[\d,]+) \((Dr|Cr)\)$/.exec(line);
    const x = m ? parseRupees(m[2]) : null;
    if (m && x !== null) {
      if (printed.has(m[1])) return null;
      printed.set(m[1], m[3] === 'Dr' ? x : -x);
    }
    const stock = /^Closing stock is valued at (₹[\d,]+);/.exec(line);
    if (stock) cs = parseRupees(stock[1]) ?? 0;
  }
  const get = (label: string): number => printed.get(label) ?? 0;
  const sumOf = (labels: readonly string[]): number => labels.reduce((x, l) => x + get(l), 0);
  const labels = [...printed.keys()];
  if (cs <= 0 || sumOf(labels) !== 0) return null;
  // Gross profit = sales less returns, plus the closing stock, less the opening stock, net purchases and direct expenses.
  const gross = -sumOf(FMT_READ_SALES) + cs - sumOf(FMT_READ_COST);
  // Net profit = gross profit less the indirect expenses (debit balances) plus the other incomes (credit balances).
  const net = gross - sumOf(labels.filter((l) => !FMT_READ_ELSEWHERE.has(l)));
  const said = /shows a (gross|net) (profit|loss) of (₹[\d,]+)\./.exec(data);
  const result = said ? parseRupees(said[3]) : null;
  return { get, labels, cs, gross, net, given: said && result !== null ? { level: said[1], result: said[2] === 'profit' ? result : -result } : null };
}

type FmtWant = [label: string, amount: number];

/** True when a side holds exactly the rows wanted, each at its amount, with the row named as its closing row and no other. */
function fmtSideHolds(side: AccountSide, want: FmtWant[], closing?: string): boolean {
  return (
    side.below.length === 0 &&
    side.rows.length === want.length &&
    want.every(([label, a]) => a > 0 && side.rows.some((r) => r.label === label && r.amounts.length === 1 && r.amounts[0] === a && Boolean(r.closing) === (label === closing)))
  );
}

/** The Trading Account worked again from the printed data; `loss` says which way the year must have gone. */
function fmtTradingHolds(q: AccountQuestion, loss: boolean): boolean {
  const h = fmtRead(q.data);
  if (!h || h.gross === 0 || h.gross < 0 !== loss) return false;
  const closing = loss ? GL_CD : GP_CD;
  const debit: FmtWant[] = [
    ['Opening Stock', h.get('Opening Stock')],
    ['Purchases', h.get('Purchases A/c') + h.get('Purchases Return A/c')],
    ...FMT_READ_DIRECT.filter((l) => h.get(l) !== 0).map((l): FmtWant => [fmtPlain(l), h.get(l)]),
  ];
  const credit: FmtWant[] = [['Sales', -h.get('Sales A/c') - h.get('Sales Return A/c')], ['Closing Stock', h.cs]];
  (loss ? credit : debit).push([closing, Math.abs(h.gross)]);
  return fmtSideHolds(q.sides[0], debit, closing) && fmtSideHolds(q.sides[1], credit, closing);
}

/**
 * True when the data gives the result of the account before this one as the printed figures make it. In a case that
 * chains the statements (`chained`) the data is the case text, which must give no such result: the student has just
 * found it.
 */
const fmtGivenHolds = (h: FmtHand, level: 'gross' | 'net', chained: boolean): boolean =>
  chained ? h.given === null : h.given?.level === level && h.given.result === (level === 'gross' ? h.gross : h.net);

/** The Profit and Loss Account worked again from the printed data, the gross result checked against the trial balance. */
function fmtProfitAndLossHolds(q: AccountQuestion, loss: boolean, chained = false): boolean {
  const h = fmtRead(q.data);
  if (!h || h.gross === 0 || h.net === 0 || h.net < 0 !== loss || !fmtGivenHolds(h, 'gross', chained)) return false;
  const closing = loss ? NET_LOSS : NET_PROFIT;
  const nominal = h.labels.filter((l) => !FMT_READ_ELSEWHERE.has(l));
  const debit = nominal.filter((l) => h.get(l) > 0).map((l): FmtWant => [fmtPlain(l), h.get(l)]);
  const credit = nominal.filter((l) => h.get(l) < 0).map((l): FmtWant => [fmtPlain(l), -h.get(l)]);
  (h.gross > 0 ? credit : debit).push([h.gross > 0 ? GP_BD : GL_BD, Math.abs(h.gross)]);
  (loss ? credit : debit).push([closing, Math.abs(h.net)]);
  return fmtSideHolds(q.sides[0], debit, closing) && fmtSideHolds(q.sides[1], credit, closing);
}

/** The Balance Sheet worked again from the printed data: each side from its own balances, and the two must agree. */
function fmtBalanceSheetHolds(q: AccountQuestion, chained = false): boolean {
  const h = fmtRead(q.data);
  if (!h || !fmtGivenHolds(h, 'net', chained) || !q.data.includes(FMT_NO_CAPITAL)) return false;
  const name = (l: string): string => (l === 'Bank A/c' ? (h.get(l) > 0 ? 'Cash at Bank' : 'Bank Overdraft') : l === 'Cash A/c' ? 'Cash in Hand' : fmtPlain(l));
  const position = FMT_READ_POSITION.filter((l) => h.get(l) !== 0);
  const assets: FmtWant[] = [['Closing Stock', h.cs], ...position.filter((l) => h.get(l) > 0).map((l): FmtWant => [name(l), h.get(l)])];
  const liabilities: FmtWant[] = [
    ['Capital', -h.get('Capital A/c') + h.net - h.get('Drawings A/c')],
    ...position.filter((l) => h.get(l) < 0).map((l): FmtWant => [name(l), -h.get(l)]),
  ];
  const totalOf = (want: FmtWant[]): number => want.reduce((x, w) => x + w[1], 0);
  return (
    totalOf(assets) === totalOf(liabilities) &&
    q.sides[0].title === 'Liabilities' &&
    q.sides[1].title === 'Assets' &&
    fmtSideHolds(q.sides[0], liabilities) &&
    fmtSideHolds(q.sides[1], assets)
  );
}

// fa-fmt-trading: the Trading Account from a trial balance and the closing stock; the indirect items are left out (easy)
const faFmtTrading = accountTemplate({
  id: 'fa-fmt-trading',
  topicId: T,
  conceptId: C_FORMATS,
  difficulty: 'easy',
  generate: (rng) =>
    fmtTry(8, () => {
      const b = fmtBooks(rng, {
        fixed: 1,
        directs: rng.pick([1, 2, 2]),
        indirect: rng.pick([2, 3]),
        incomes: rng.pick([0, 1]),
        returns: rng.pick<Returns>(['none', 'purchases', 'sales', 'both', 'both']),
        result: 'profit',
      });
      return b && { ...fmtTradingParts(b), data: fmtData(b) };
    }),
  verify: (q) => fmtTradingHolds(q, false),
});

// fa-fmt-pl: the Profit and Loss Account, the gross profit given; direct items and balance sheet items are left out (easy)
const faFmtProfitAndLoss = accountTemplate({
  id: 'fa-fmt-pl',
  topicId: T,
  conceptId: C_FORMATS,
  difficulty: 'easy',
  generate: (rng) =>
    fmtTry(8, () => {
      const directs = rng.pick([1, 1, 2]);
      const b = fmtBooks(rng, { fixed: 1, directs, indirect: directs === 1 ? rng.pick([4, 5]) : 4, incomes: rng.pick([1, 2]), returns: 'none', result: 'profit' });
      return b && { ...fmtProfitAndLossParts(b), data: fmtData(b, fmtGrossGiven(b)) };
    }),
  verify: (q) => fmtProfitAndLossHolds(q, false),
});

// fa-fmt-balance-sheet: the Balance Sheet, the net profit given (medium). Version 2: the order of the rows is not marked
// (no account format marks it), so the task no longer asks for it; the solution still shows the order it names.
const faFmtBalanceSheet = accountTemplate({
  id: 'fa-fmt-balance-sheet',
  version: 2,
  topicId: T,
  conceptId: C_FORMATS,
  difficulty: 'medium',
  generate: (rng) =>
    fmtTry(8, () => {
      // Beside the capital and the creditors, one or two of a loan, bills payable and an overdraft, or none; beside
      // the usual assets, bills receivable or cash in hand or both. A business with an overdraft keeps some cash.
      const owed = rng.pick([['loan'], ['billsPayable'], ['overdraft'], ['loan', 'billsPayable'], ['billsPayable', 'overdraft'], []]);
      const owned = rng.pick([['billsReceivable'], ['cash'], ['billsReceivable', 'cash']]);
      const overdraft = owed.includes('overdraft');
      const b = fmtBooks(rng, {
        fixed: 2,
        directs: 1,
        indirect: 2,
        incomes: owed.length + owned.length > 3 ? 0 : rng.pick([0, 1]),
        returns: 'none',
        result: 'profit',
        loan: owed.includes('loan'),
        billsPayable: owed.includes('billsPayable'),
        billsReceivable: owned.includes('billsReceivable'),
        cash: overdraft || owned.includes('cash'),
        overdraft,
      });
      return b && { ...fmtBalanceSheetParts(b, rng.pick<Marshal>(['liquidity', 'permanence']), true), data: fmtData(b, fmtNetGiven(b)) };
    }),
  verify: (q) => fmtBalanceSheetHolds(q),
});

// fa-fmt-loss: a year that went badly, so the closing row falls on the other side: a Trading Account that ends in a
// gross loss, or a Profit and Loss Account that ends in a net loss, after a gross profit or after a gross loss (medium)
const faFmtLoss = accountTemplate({
  id: 'fa-fmt-loss',
  topicId: T,
  conceptId: C_FORMATS,
  difficulty: 'medium',
  generate: (rng) =>
    fmtTry(8, () => {
      const shape = rng.pick(['trading', 'netLoss', 'netLoss', 'grossLoss'] as const);
      if (shape === 'trading') {
        const b = fmtBooks(rng, { fixed: 1, directs: rng.pick([1, 2]), indirect: 2, incomes: rng.pick([0, 1]), returns: rng.pick<Returns>(['none', 'purchases', 'sales', 'both']), result: 'grossLoss' });
        return b && { ...fmtTradingParts(b), data: fmtData(b) };
      }
      // After a gross loss the credit side has the other incomes only, so the business has one at least.
      const incomes = shape === 'grossLoss' ? rng.pick([1, 2]) : rng.pick([0, 1, 1]);
      const b = fmtBooks(rng, { fixed: 1, directs: 1, indirect: incomes === 0 ? 4 : rng.pick([3, 4]), incomes, returns: 'none', result: shape });
      // Other incomes larger than the gross loss and the expenses together would turn the year into a profit.
      return b && fmtFigures(b).net < 0 ? { ...fmtProfitAndLossParts(b), data: fmtData(b, fmtGrossGiven(b)) } : null;
    }),
  verify: (q) => (q.title.startsWith('Trading Account') ? fmtTradingHolds(q, true) : fmtProfitAndLossHolds(q, true)),
});

const formats: Template[] = [faFmtTrading, faFmtProfitAndLoss, faFmtBalanceSheet, faFmtLoss];

/** One set of books for all three statements: what the trial balance of a year that ends in a profit is to have. */
export type ChainBooksSpec = Omit<FmtSpec, 'result'>;
export type ChainBooks = FmtBooks;
export type ChainOrder = Marshal;

/**
 * The three statements of the final accounts made as the formats above make them, for a case that chains them on one
 * trial balance (`case-fa-chain-trading-pl-bs` in `cases/final-accounts.ts`): the same rows, wording and working,
 * without the data, which is the text of the case. The Profit and Loss Account starts from the gross profit of the
 * Trading Account before it, and the Balance Sheet from the net profit, so the case text gives neither; each `Holds`
 * works its statement out again from the printed case alone.
 */
export const FA_CHAIN = {
  /** A year that ends in a gross profit and a net profit; null for figures that would not be believable (try again). */
  books: (rng: Rng, spec: ChainBooksSpec): ChainBooks | null => fmtTry(8, () => fmtBooks(rng, { ...spec, result: 'profit' })),
  /** The case text: the business, its trial balance, the closing stock, and that nothing else is to be adjusted. */
  caseText: (b: ChainBooks): string => fmtData(b, `There is no other adjustment. ${FMT_NO_CAPITAL}`),
  trading: fmtTradingParts,
  profitAndLoss: (b: ChainBooks): FmtStatement => fmtProfitAndLossParts(b, 'of the Trading Account'),
  balanceSheet: fmtBalanceSheetParts,
  tradingHolds: (q: AccountQuestion): boolean => fmtTradingHolds(q, false),
  profitAndLossHolds: (q: AccountQuestion): boolean => fmtProfitAndLossHolds(q, false, true),
  balanceSheetHolds: (q: AccountQuestion): boolean => fmtBalanceSheetHolds(q, true),
};


// ---------------------------------------------------------------------------------------------------------------
// Financial statements (meaning, objectives, importance) and deferred revenue expenditure, added after the check against the CBSE 2025-26 syllabus, which names both at the head of the unit on the financial statements of a sole proprietor.
// ---------------------------------------------------------------------------------------------------------------

const faStatementsMeaning = factsTemplate({
  id: 'fa-statements-meaning', topicId: T, conceptId: 'fa-users', difficulty: 'easy',
  facts: [
    {
      prompt: 'Which statements are the financial statements of a sole proprietor?',
      correct: 'The Trading and Profit and Loss Account, and the Balance Sheet',
      distractors: [
        { text: 'The trial balance and the balance sheet', why: 'The trial balance only checks the ledger; it is not a financial statement.' },
        { text: 'The journal and the ledger', why: 'These are books of account, kept through the year.' },
        { text: 'The cash book and the bank pass book', why: 'These record cash and bank dealings; they are not the year-end statements.' },
      ],
      explanation: 'The result of the year and the position at its end are the financial statements.',
    },
    {
      prompt: 'When, and from what, are the financial statements prepared?',
      correct: 'At the end of the accounting period, from the trial balance and the adjustments',
      distractors: [
        { text: 'Every day, from the source documents', why: 'Source documents feed the books every day; statements are drawn up at the end of the period.' },
        { text: 'At the start of the year, from the budget', why: 'A budget is a plan; financial statements report what happened.' },
        { text: 'Whenever cash runs short, from the cash book', why: 'They are prepared for every period, from the whole of the ledger.' },
      ],
      explanation: 'Once the period ends, the balances of the trial balance and the adjustments are worked into the statements.',
    },
    {
      prompt: 'What are the two main objectives of preparing financial statements?',
      correct: 'To find the profit or loss of the period and to show the financial position at its end',
      distractors: [
        { text: 'To check the arithmetical accuracy of the ledger and to find errors', why: 'That is what the trial balance is for.' },
        { text: 'To record each transaction and to post it to the ledger', why: 'That is the work of the journal and the ledger.' },
        { text: 'To fix the selling prices and to plan the purchases', why: 'Statements inform such decisions, but their objective is to report the result and the position.' },
      ],
      explanation: 'The Trading and Profit and Loss Account gives the result; the Balance Sheet gives the position.',
    },
  ],
});

const STATEMENTS = {
  trading: 'The Trading Account',
  pl: 'The Profit and Loss Account',
  bs: 'The Balance Sheet',
  tb: 'The Trial Balance',
} as const;
type Statement = keyof typeof STATEMENTS;
const STATEMENT_SLIP: Record<Statement, string> = {
  trading: 'The Trading Account gives the gross profit on buying and selling goods, not this.',
  pl: 'The Profit and Loss Account gives the net profit after all expenses, not this.',
  bs: 'The Balance Sheet shows what is owned and owed on one date, not this.',
  tb: 'The trial balance only checks the ledger; it is not a financial statement and answers no such question.',
};
const faStatementsImportance = factsTemplate({
  id: 'fa-statements-importance', topicId: T, conceptId: 'fa-users', difficulty: 'medium',
  facts: ([
    ['A bank asked for a loan wants to see what the business owns that could secure it.', 'bs', 'Assets and liabilities on a date are in the Balance Sheet.'],
    ['The owner wants to know the profit made on buying and selling goods, before the running expenses.', 'trading', 'That is the gross profit, found in the Trading Account.'],
    ['The owner wants to know what is left of the year\'s earnings after rent, salaries and every other expense.', 'pl', 'That is the net profit, found in the Profit and Loss Account.'],
    ['A supplier wants to compare what the business owns in cash and debtors with what it owes in the short run.', 'bs', 'Current assets and current liabilities are in the Balance Sheet.'],
    ['The owner wants to see whether the cost of the goods sold has risen faster than the sales.', 'trading', 'Sales and the cost of goods sold meet in the Trading Account.'],
  ] as [string, Statement, string][]).map(([need, st, why]) => ({
    prompt: `${need} Which statement serves this need?`,
    correct: STATEMENTS[st],
    distractors: (Object.keys(STATEMENTS) as Statement[]).filter((k) => k !== st).map((k) => ({ text: STATEMENTS[k], why: STATEMENT_SLIP[k] })),
    explanation: why,
  })),
});

const SPEND = {
  capital: 'Capital expenditure',
  revenue: 'Revenue expenditure',
  deferred: 'Deferred revenue expenditure',
  receipt: 'Capital receipt',
} as const;
type Spend = keyof typeof SPEND;
const SPEND_SLIP: Record<Spend, string> = {
  capital: 'Capital expenditure buys or improves a fixed asset; nothing of the kind is bought here.',
  revenue: 'Revenue expenditure is used up within the year; this is not the case here.',
  deferred: 'Deferred revenue expenditure is a heavy revenue outlay whose benefit lasts several years; that does not fit here.',
  receipt: 'This is money spent, not money received.',
};
const faDeferredClassify = factsTemplate({
  id: 'fa-deferred-classify', topicId: T, conceptId: 'fa-capital-revenue', difficulty: 'medium',
  facts: ([
    ['A heavy advertising campaign to launch a new product, expected to bring in sales for three years.', 'deferred', 'It buys no asset (revenue in nature), but its benefit lasts several years, so it is deferred revenue expenditure, written off over those years.'],
    ['A large sum spent on shifting the business to new premises, expected to benefit the business for years.', 'deferred', 'No asset is bought, but the benefit is spread over several years: deferred revenue expenditure, written off over those years.'],
    ['The electricity bill of the shop for March.', 'revenue', 'A running expense used up within the year is revenue expenditure.'],
    ['A new delivery van bought for the business.', 'capital', 'A fixed asset that will serve for years is capital expenditure.'],
    ['Wages paid for installing a new machine.', 'capital', 'Installation brings the asset into use and is part of its cost: capital expenditure.'],
    ['Routine repairs to the shop\'s shutters.', 'revenue', 'Routine repairs keep an asset working and are used up within the year: revenue expenditure.'],
  ] as [string, Spend, string][]).map(([item, kind, why]) => ({
    prompt: `${item} How is this expenditure classified?`,
    correct: SPEND[kind],
    distractors: (Object.keys(SPEND) as Spend[]).filter((k) => k !== kind).map((k) => ({ text: SPEND[k], why: SPEND_SLIP[k] })),
    explanation: why,
  })),
});

const faDeferredWhere = factsTemplate({
  id: 'fa-deferred-where', topicId: T, conceptId: 'fa-capital-revenue', difficulty: 'easy',
  facts: [
    {
      prompt: 'Deferred revenue expenditure of a year has been partly written off. Where is the part not yet written off shown?',
      correct: 'On the assets side of the Balance Sheet',
      distractors: [
        { text: 'On the liabilities side of the Balance Sheet', why: 'It is an amount spent whose benefit is still to come, not an amount owed.' },
        { text: 'On the debit side of the Trading Account', why: 'Only the part written off for the year is charged, and to the Profit and Loss Account.' },
        { text: 'Nowhere: it is forgotten once the year ends', why: 'It is carried forward until written off in the years that benefit.' },
      ],
      explanation: 'The balance carried forward is shown among the assets until it is fully written off.',
    },
    {
      prompt: 'The part of deferred revenue expenditure written off for the year is shown:',
      correct: 'On the debit side of the Profit and Loss Account',
      distractors: [
        { text: 'On the credit side of the Profit and Loss Account', why: 'A write-off is an expense, debited.' },
        { text: 'On the assets side of the Balance Sheet', why: 'That is where the part not yet written off goes.' },
        { text: 'As a deduction from capital', why: 'It is a charge against the profit of the year, not a withdrawal by the owner.' },
      ],
      explanation: 'Each year that benefits bears its share, charged to the Profit and Loss Account.',
    },
  ],
});

/** What a question on deferred revenue expenditure was made from, kept for its `verify`. */
let keptDeferred: { prompt: string; spent: number; years: number; year: number; ask: 'charge' | 'left' } | undefined;

const faDeferredAmount = numericTemplate({
  id: 'fa-deferred-amount', topicId: T, conceptId: 'fa-capital-revenue', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const years = rng.pick([3, 4, 5]);
    const share = amount(rng, 20000, 200000, 10000);
    const spent = share * years;
    const year = rng.int(1, years - 1);
    const ask = rng.pick(['charge', 'left'] as const);
    const firm = rng.pick(['Meera Garments', 'Sharma Traders', 'Kiran Stores', 'Rao Electricals']);
    const yearName = ['first', 'second', 'third', 'fourth'][year - 1];
    const prompt = `${firm} spent ${inr(spent)} on an advertising campaign to launch a new product. The benefit is expected to last ${years} years, and the amount is written off equally over them as deferred revenue expenditure. ${ask === 'charge' ? `How much is charged to the Profit and Loss Account of the ${yearName} year?` : `How much is shown on the assets side of the Balance Sheet at the end of the ${yearName} year?`}`;
    keptDeferred = { prompt, spent, years, year, ask };
    const left = spent - share * year;
    const answer = ask === 'charge' ? share : left;
    const errors =
        ask === 'charge'
          ? [
              { value: spent, why: 'Charged the whole amount to one year; its benefit is spread over several.' },
              { value: left, why: `Gave the amount carried forward at the end of the ${yearName} year instead of the amount charged.` },
              ...(year > 1 ? [{ value: share * year, why: 'Gave the total written off so far instead of the charge of this year.' }] : []),
            ]
          : [
              { value: spent, why: 'Carried the whole amount forward, as if nothing had been written off.' },
              { value: share, why: 'Gave the amount written off in a year instead of the balance carried forward.' },
              ...(year > 1 ? [{ value: spent - share, why: 'Deducted only one year\'s write-off.' }] : []),
            ];
    const commonErrors = errors.filter((e, i) => e.value !== answer && errors.findIndex((x) => x.value === e.value) === i);
    if (commonErrors.length < 2) return null;
    return {
      prompt,
      answer,
      commonErrors,
      explanation: [
        `Written off each year = ${inr(spent)} ÷ ${years} = ${inr(share)}.`,
        ask === 'charge'
          ? `Each year that benefits, the ${yearName} included, bears ${inr(share)} in the Profit and Loss Account.`
          : `At the end of the ${yearName} year, ${year} year${year === 1 ? '' : 's'} written off: ${inr(spent)} - ${inr(share * year)} = ${inr(left)}, shown on the assets side.`,
      ],
    };
  },
  verify: (q) => {
    const k = keptDeferred;
    if (!k || k.prompt !== q.prompt) return false;
    // Year by year: the balance falls by an equal share each year.
    let balance = k.spent;
    const share = k.spent / k.years;
    for (let y = 1; y <= k.year; y++) balance -= share;
    return q.answer === (k.ask === 'charge' ? share : balance);
  },
});

const statementsAndDeferred: Template[] = [faStatementsMeaning, faStatementsImportance, faDeferredClassify, faDeferredWhere, faDeferredAmount];

// Added after the check against the CBSE 2025-26 syllabus: they come last.
const all: Template[] = [...templates, ...sets, ...formats, ...statementsAndDeferred];

// Assertion and Reason comes last, and is on its own level and on no mock paper (see assertionReason.ts).
const assertionReason = assertionReasonTemplate({
  prefix: 'fa', topicId: 'final-accounts', conceptId: 'fa-whole',
  items: [
    {
      answer: 'explains',
      a: 'Closing stock is entered on the credit side of the Trading Account.',
      r: 'It takes the unsold goods out of the cost of goods sold.',
      aWhy: 'It appears there, and as a current asset in the Balance Sheet.',
      rWhy: 'Cost of goods sold counts only the goods actually sold.',
      link: 'The credit entry is what removes the unsold goods from the cost, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'Carriage inwards of ₹4,000 is debited to the Trading Account.',
      r: 'It is a cost of bringing the goods to the business, which makes it a direct expense.',
      aWhy: 'The Trading Account takes the direct expenses.',
      rWhy: 'A cost of buying the goods and bringing them in is direct.',
      link: 'It goes to the Trading Account because it is a direct expense, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'Drawings of ₹25,000 are not debited to the Profit and Loss Account.',
      r: 'Drawings are a withdrawal of capital and not an expense of the business.',
      aWhy: 'They are deducted from capital in the Balance Sheet.',
      rWhy: 'The owner takes them out for private use; they are not a cost of earning revenue.',
      link: 'Only expenses go to the Profit and Loss Account, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'A gross profit of ₹2,00,000, indirect expenses of ₹80,000 and commission received of ₹10,000 give a net profit of ₹1,30,000.',
      r: 'Net profit = Gross profit - Indirect expenses + Indirect incomes.',
      aWhy: '₹2,00,000 - ₹80,000 + ₹10,000 = ₹1,30,000.',
      rWhy: 'The Profit and Loss Account starts from the gross profit, charges the running costs and adds the other incomes.',
      link: 'The figure in A is that formula applied, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'Of a launch campaign costing ₹3,00,000 whose benefit will last three years, ₹1,00,000 is charged this year and ₹2,00,000 is shown on the assets side.',
      r: 'Deferred revenue expenditure is written off over the years that benefit from it.',
      aWhy: 'One third is written off, and the part not yet written off stands as an asset.',
      rWhy: 'The charge is spread over the years of benefit, as the syllabus treats it.',
      link: 'The split follows from spreading the cost over three years, so R explains A.',
    },
    {
      answer: 'not-the-reason',
      a: 'A Balance Sheet is a statement and not an account.',
      r: 'The two sides of a Balance Sheet total the same.',
      aWhy: 'It lists assets and liabilities on a date, and no entries are posted to it.',
      rWhy: 'What is owned equals what is owed, the owner included.',
      link: 'An account balanced at the year end also has equal totals. A Balance Sheet is a statement because it has no debit and credit sides.',
    },
    {
      answer: 'not-the-reason',
      a: 'The ₹50,000 received for an old machine is not included in Sales.',
      r: 'A loan received is a capital receipt.',
      aWhy: 'Sales takes only the goods in which the business deals.',
      rWhy: 'A loan changes liabilities and assets, and it is not income.',
      link: 'R is about a loan. The price of the machine is left out because the machine was not goods for sale.',
    },
    {
      answer: 'not-the-reason',
      a: 'Office salaries are debited to the Profit and Loss Account.',
      r: 'Wages of the workers who make the goods are debited to the Trading Account.',
      aWhy: 'Office salaries are an indirect expense.',
      rWhy: 'Those wages are a direct expense.',
      link: 'R is about a direct expense. Salaries go to the Profit and Loss Account because they are a cost of running the office.',
    },
    {
      answer: 'a-only',
      a: 'Carriage outwards is an indirect expense.',
      r: 'Every carriage expense is a cost of bringing goods in.',
      aWhy: 'It is a cost of sending goods to customers, a selling expense.',
      rWhy: 'Carriage outwards is paid on goods going out.',
    },
    {
      answer: 'a-only',
      a: 'With an opening capital of ₹3,00,000, a net profit of ₹80,000 and drawings of ₹20,000, the closing capital is ₹3,60,000.',
      r: 'Drawings are added to capital in the Balance Sheet.',
      aWhy: '₹3,00,000 + ₹80,000 - ₹20,000 = ₹3,60,000.',
      rWhy: 'Drawings are deducted from capital.',
    },
    {
      answer: 'r-only',
      a: 'The trial balance is one of the financial statements.',
      r: 'The financial statements are prepared from the trial balance.',
      aWhy: 'They are the Trading and Profit and Loss Account and the Balance Sheet; the trial balance is only a check.',
      rWhy: 'Its balances are carried to them.',
    },
    {
      answer: 'r-only',
      a: 'Closing stock of ₹40,000 listed inside the trial balance is credited to the Trading Account.',
      r: 'Closing stock listed inside the trial balance has already been set off against purchases.',
      aWhy: 'It is shown only in the Balance Sheet, since it has been dealt with already.',
      rWhy: 'That is why it stands in the trial balance at all.',
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Added in the quality pass, after the papers, worksheets and Look back levels were set (they are in
// `outsidePapers.ts`): the closing stock inside the trial balance with adjusted purchases, combined and less common
// heads of account, and the order of the assets in a marshalled Balance Sheet.
// ---------------------------------------------------------------------------------------------------------------

const ADJUSTED_NOTE = 'The closing stock appears inside the trial balance: the purchases have already been adjusted for the opening and the closing stock.';
const H_ADJUSTED = [
  'The closing stock is inside the trial balance and the purchases are "adjusted". Which stock has already been dealt with, and where?',
  'Adjusted purchases = Opening stock + Purchases − Closing stock, so neither stock enters the Trading Account again. Cost of goods sold = Adjusted purchases + Direct expenses; gross profit = Net sales − that. The closing stock goes to the Balance Sheet only.',
];

// fa-complex-gp-adjusted: closing stock inside the trial balance, purchases already adjusted for both stocks (complex)
const faComplexGpAdjusted = numericTemplate({
  id: 'fa-complex-gp-adjusted', topicId: T, conceptId: C.whole, difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const fit = drawFitting(rng, { returns: true, direct: 2, gp: [60000, 200000] });
    if (!fit) return null;
    const { t, who } = fit;
    // The purchases less their return, adjusted for the two stocks before the trial balance was drawn up.
    const adj = t.os + t.netPur - t.cs;
    if (adj < rupees(80000)) return null;
    const noise = [...draw(rng, IND_EXP, 2, 5000, 25000, 1000), ...draw(rng, ['Sundry debtors', 'Furniture'], 1, 20000, 90000, 5000)];
    const askCogs = rng.next() < 0.35;
    const all = rng.shuffle([['Adjusted purchases', adj], ['Sales', t.sales], ['Sales return', t.salesRet], ...t.directs, ['Closing stock', t.cs], ...noise] as Item[]);
    const [extraName, extra] = noise[0];
    return {
      prompt: `${introOf(rng, who, 'this trial-balance extract')}\n${rows(all)}\n${ADJUSTED_NOTE}\n${askCogs ? 'Find the cost of goods sold.' : 'Find the gross profit.'}`,
      answer: askCogs ? t.cogs : t.gp,
      commonErrors: askCogs
        ? [
            { value: t.cogs - t.cs, why: 'Deducted the closing stock again; the adjusted purchases already leave it out.' },
            { value: t.cogs - t.dir, why: 'Left out the direct expenses.' },
            { value: t.cogs + extra, why: `Brought ${extraName.toLowerCase()}, an indirect item, into the cost of goods sold.` },
          ]
        : [
            { value: t.gp + t.cs, why: 'Credited the closing stock to the Trading Account as well; the adjusted purchases already leave it out, so it goes to the Balance Sheet only.' },
            { value: t.gp + t.dir, why: 'Left the direct expenses out.' },
            { value: t.gp + t.salesRet, why: 'Did not deduct the sales return from sales.' },
            { value: t.gp - extra, why: `Charged ${extraName.toLowerCase()}, an indirect item, to the Trading Account.` },
          ],
      explanation: [
        'Adjusted purchases = Opening stock + Purchases − Closing stock: both stocks were dealt with before the trial balance was drawn up, so neither enters the Trading Account again.',
        `Net sales = ${inr(t.sales)} − ${inr(t.salesRet)} = ${inr(t.netSales)}.`,
        `Cost of goods sold = Adjusted purchases + Direct expenses = ${inr(adj)} + ${inr(t.dir)} = ${inr(t.cogs)}.`,
        ...(askCogs ? [] : [`Gross profit = ${inr(t.netSales)} − ${inr(t.cogs)} = ${inr(t.gp)}.`]),
        `The closing stock of ${inr(t.cs)} in the trial balance is shown only in the Balance Sheet, as a current asset. ${noise.map(([l]) => cap(l.toLowerCase())).join(', ')} belong to the Profit and Loss Account or the Balance Sheet.`,
      ],
      hints: H_ADJUSTED,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    if (f.adjPur <= 0 || f.cs <= 0 || f.os !== 0 || f.pur !== 0) return false;
    const cogs = f.adjPur + f.direct;
    return q.answer === (/cost of goods sold\.$/.test(q.prompt) ? cogs : f.sales - f.salesRet - cogs);
  },
});

// fa-heads-combined: joined heads ("wages and salaries"), factory and office items, duties, royalty, plain "carriage" (medium)
type Place = 'TD' | 'PD' | 'PC' | 'BA';
const PLACE: Record<Place, string> = {
  TD: 'Trading Account, debit side',
  PD: 'Profit and Loss Account, debit side',
  PC: 'Profit and Loss Account, credit side',
  BA: 'Balance Sheet, assets side',
};
const PLACE_SLIP: Record<Place, string> = {
  TD: 'Took it as a cost of buying the goods or of making them.',
  PD: 'Took it as a cost of selling the goods or of running the office.',
  PC: 'Took it as an income or a gain of the year.',
  BA: 'Took it as something the business still owns at the year end.',
};
const JOINED = 'When a trial balance joins two heads of account, most textbooks place the pair by its first word.';
const HEADS: [business: string, head: string, place: Place, why: string][] = [
  ['a furniture workshop', 'Wages and salaries', 'TD', `${JOINED} Wages come first, so the whole amount is a direct expense.`],
  ['a garment-stitching unit', 'Salaries and wages', 'PD', `${JOINED} Salaries come first, so the whole amount is an indirect expense.`],
  ['a small flour mill', 'Factory lighting', 'TD', 'Lighting of the place where the goods are made is a cost of making them: a direct expense.'],
  ['a printing press', 'Office lighting', 'PD', 'Lighting of the office is a cost of running the business: an indirect expense.'],
  ['a hardware dealer', 'Lighting and heating', 'PD', 'Lighting that is not said to be of a factory is taken as a running cost of the business: an indirect expense.'],
  ['a bakery', 'Royalty paid on the quantity of biscuits produced', 'TD', 'A royalty that depends on the goods produced is a cost of making them: a direct expense.'],
  ['a dealer in imported electrical goods', 'Dock dues', 'TD', 'Dock dues are paid to bring goods bought from abroad ashore: part of their cost, a direct expense.'],
  ['a dealer in imported toys', 'Customs duty on goods imported', 'TD', 'Duty paid on goods bought is part of their cost: a direct expense.'],
  ['a stationery wholesaler', 'Carriage', 'TD', 'Carriage with no word saying inwards or outwards is taken as carriage inwards: a direct expense.'],
  ['a maker of leather bags', 'Factory rent', 'TD', 'Rent of the place where the goods are made is a cost of making them: a direct expense.'],
  ['a footwear trader', 'Rent, rates and taxes', 'PD', 'Rent, rates and taxes of the shop or office are costs of running the business: an indirect expense.'],
  ['a small printing press', 'Motive power', 'TD', 'Motive power drives the machines that make the goods: a direct expense, like power and fuel.'],
  ['a cloth merchant', 'Discount received', 'PC', 'Discount received from suppliers is a gain: an indirect income.'],
  ['a spice trader', 'Bills receivable', 'BA', 'A bill to be collected is an asset of the business: it goes to the Balance Sheet.'],
];
const faHeadsCombined = factsTemplate({
  id: 'fa-heads-combined', topicId: T, conceptId: C.classify, difficulty: 'medium',
  facts: HEADS.map(([business, head, place, why]) => ({
    prompt: `The trial balance of ${business} lists "${head}". Where is it shown in the final accounts?`,
    correct: PLACE[place],
    distractors: (Object.keys(PLACE) as Place[]).filter((k) => k !== place).map((k) => ({ text: PLACE[k], why: PLACE_SLIP[k] })),
    explanation: why,
    hints: [
      'Ask what the item pays for: getting the goods ready for sale, running the office and the selling, an income, or something owned?',
      'Costs of buying or making the goods go to the Trading Account; costs of selling and running the business to the Profit and Loss Account. Two heads joined together go by the first.',
    ],
  })),
});

// fa-marshalling-order: the order in which four assets stand in a Balance Sheet marshalled by liquidity or by permanence (medium)
/** Assets from the most lasting to the most liquid; each tier is one place in the order. */
const ORDER_TIERS: string[][] = [
  ['Land', 'Building'],
  ['Machinery', 'Furniture', 'Vehicles'],
  ['Closing stock'],
  ['Sundry debtors'],
  ['Bills receivable'],
  ['Cash at bank'],
  ['Cash in hand'],
];
const tierOf = (name: string): number => ORDER_TIERS.findIndex((tier) => tier.includes(name));
const ORDER_FIRMS = ['Joshi Hardware', 'Devika Tea Traders', 'Anand Cycle Works', 'Sharma Clinic Supplies', 'Kaveri Coaching Centre', 'Lakshmi Agro Inputs'];
const faMarshallingOrder = mcqTemplate({
  id: 'fa-marshalling-order', topicId: T, conceptId: C.bs, difficulty: 'medium',
  generate: (rng) => {
    const tiers = rng.shuffle(ORDER_TIERS.map((_, i) => i)).slice(0, 4).sort((a, b) => a - b);
    const permanence = tiers.map((i) => rng.pick(ORDER_TIERS[i]));
    const byLiquidity = rng.next() < 0.5;
    const basis = byLiquidity ? 'liquidity' : 'permanence';
    const other = byLiquidity ? 'permanence' : 'liquidity';
    const right = byLiquidity ? [...permanence].reverse() : permanence;
    const swap = (i: number): string[] => right.map((x, k) => (k === i ? right[i + 1] : k === i + 1 ? right[i] : x));
    const nearer = byLiquidity ? 'nearer to cash' : 'kept longer in the business';
    const text = (xs: string[]): string => xs.join(', ');
    return {
      prompt: `The Balance Sheet of ${rng.pick(ORDER_FIRMS)} is marshalled in the order of ${basis}. In what order are these assets shown? ${text(rng.shuffle(right))}`,
      correct: text(right),
      distractors: [
        { text: text([...right].reverse()), why: `Used the order of ${other} instead of the order of ${basis}.` },
        ...[0, 1, 2].map((i): Distractor => ({ text: text(swap(i)), why: `Put ${right[i + 1].toLowerCase()} before ${right[i].toLowerCase()}, though ${right[i].toLowerCase()} is ${nearer}.` })),
      ],
      explanation: byLiquidity
        ? `The order of liquidity starts with the asset nearest to cash and ends with the one kept longest: ${text(right)}.`
        : `The order of permanence starts with the asset kept longest in the business and ends with the most liquid: ${text(right)}.`,
      hints: [
        'Which of the four is cash, or nearest to it, and which is kept in the business longest?',
        'Liquidity: cash in hand, cash at bank, bills receivable, debtors, stock, then the fixed assets. Permanence is the same list read from the other end.',
      ],
    };
  },
  verify: (q) => {
    const m = /order of (liquidity|permanence)\. In what order are these assets shown\? (.+)$/.exec(q.prompt);
    if (!m) return false;
    const names = m[2].split(', ');
    const sorted = [...names].sort((a, b) => (m[1] === 'permanence' ? tierOf(a) - tierOf(b) : tierOf(b) - tierOf(a)));
    return names.every((n) => tierOf(n) >= 0) && q.options.find((o) => o.id === q.correct)?.text === sorted.join(', ');
  },
});

// fa-fmt-trading-adjusted: the Trading Account from a trial balance with adjusted purchases and the closing stock in it (medium)
const ADJUSTED_PURCHASES = 'Adjusted Purchases';
const FMT_ADJUSTED_NOTE = 'The closing stock is inside the trial balance: the purchases were adjusted for the opening and the closing stock before it was drawn up.';
const faFmtTradingAdjusted = accountTemplate({
  id: 'fa-fmt-trading-adjusted',
  topicId: T,
  conceptId: C_FORMATS,
  difficulty: 'medium',
  generate: (rng) =>
    fmtTry(8, () => {
      const b = fmtBooks(rng, {
        fixed: 1,
        directs: rng.pick([1, 2]),
        indirect: rng.pick([2, 3]),
        incomes: rng.pick([0, 1]),
        returns: rng.pick<Returns>(['none', 'sales']),
        result: 'profit',
      });
      if (!b) return null;
      // Wages or power and fuel are the direct expenses of a small manufacturer, not of a bookseller or a mobile
      // retailer: such a trial balance belongs to one of the makers (`MAKERS`).
      const [name, trade] = b.ledger.has('wages') || b.ledger.has('powerAndFuel') ? rng.pick(MAKERS) : [b.name, b.trade];
      const f = fmtFigures(b);
      const adjusted = f.os + f.pur - f.cs;
      // The same trial balance with the two stocks folded into the purchases and the closing stock listed instead.
      const ledger: Ledger = new Map(b.ledger);
      ledger.set('purchases', adjusted);
      ledger.set('stock', f.cs);
      const labels: Record<string, string> = { purchases: ADJUSTED_PURCHASES, stock: 'Closing Stock' };
      const data = [
        `${name}, ${trade}, closes the books on ${FMT_DATE}, the end of the accounting year. The trial balance on that date:`,
        listBalances(trialBalance(ledger).rows.map((r) => ({ ...r, label: labels[r.accountId] ?? r.label }))),
        FMT_ADJUSTED_NOTE,
      ].join('\n');
      const leftOut = [...f.expenses, ...f.incomes];
      return {
        task: `Prepare the Trading Account of ${name} for the year ended ${FMT_DATE} from this trial balance; enter each item at its net figure.`,
        data,
        title: `Trading Account of ${name} for the year ended ${FMT_DATE}`,
        left: drSide([fmtRow(ADJUSTED_PURCHASES, adjusted), ...f.directs.map(([id, a]) => fmtRow(ledgerName(id), a)), fmtClosing(GP_CD, f.gross)]),
        right: crSide([fmtRow('Sales', f.netSales, f.sr ? [`Sales ${inr(f.sales)}`, `Less: Sales Return ${inr(f.sr)}`] : undefined)]),
        distractors: ['Closing Stock', 'Opening Stock', 'Purchases', GP_BD, ...leftOut.slice(0, 2).map(([id]) => ledgerName(id)), 'Drawings', ...(f.sr ? ['Sales Return'] : [])],
        explanation: [
          `Adjusted purchases ${inr(adjusted)} are the opening stock and the purchases less the closing stock (${inr(f.os)} + ${inr(f.pur)} − ${inr(f.cs)}): both stocks have already been dealt with.`,
          'So no opening stock is debited and the closing stock is not credited: the debit side has the adjusted purchases and the direct expenses, the credit side the sales.',
          `Debit side = ${added([adjusted, ...f.directs.map((d) => d[1])])}. Credit side = ${f.sr ? `${inr(f.sales)} − ${inr(f.sr)} = ` : ''}${inr(f.netSales)}.`,
          `The credit side is larger by ${inr(f.gross)}: the gross profit, entered on the debit side as "To ${GP_CD}". It is the same gross profit the opening stock, the purchases and the closing stock would give.`,
          `The closing stock of ${inr(f.cs)} in the trial balance goes to the Balance Sheet only, as a current asset. ${cap(fmtNames(leftOut))} wait for the Profit and Loss Account.`,
        ],
        hints: H_ADJUSTED,
      };
    }),
  verify: (q) => {
    if (!q.data.includes(FMT_ADJUSTED_NOTE)) return false;
    const printed = new Map<string, number>();
    for (const line of q.data.split('\n')) {
      const m = /^(.+): (₹[\d,]+) \((Dr|Cr)\)$/.exec(line);
      const x = m ? parseRupees(m[2]) : null;
      if (m && x !== null) printed.set(m[1], m[3] === 'Dr' ? x : -x);
    }
    const get = (label: string): number => printed.get(label) ?? 0;
    const adjusted = get(ADJUSTED_PURCHASES);
    const sales = -get('Sales A/c') - get('Sales Return A/c');
    const directs = FMT_READ_DIRECT.filter((l) => get(l) !== 0).map((l): FmtWant => [fmtPlain(l), get(l)]);
    const gross = sales - adjusted - directs.reduce((x, d) => x + d[1], 0);
    if (get('Closing Stock') <= 0 || printed.has('Opening Stock') || gross <= 0) return false;
    return fmtSideHolds(q.sides[0], [[ADJUSTED_PURCHASES, adjusted], ...directs, [GP_CD, gross]], GP_CD) && fmtSideHolds(q.sides[1], [['Sales', sales]], GP_CD);
  },
});

/** The templates of the quality pass: no paper, worksheet or Look back level draws on them (`outsidePapers.ts`). */
const qualityPass: Template[] = [faComplexGpAdjusted, faHeadsCombined, faMarshallingOrder, faFmtTradingAdjusted];

const withAssertionReason: Template[] = [...all, assertionReason, ...qualityPass];

export default withAssertionReason;
