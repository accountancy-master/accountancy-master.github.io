import { partnerLoan } from '@/engine/accounts';
import { rupees } from '@/engine/money';
import type { Rng } from '@/engine/rng';
import { bankOf, dissolve, EXPENSE_FORMS, type AssetFate, type DAsset, type DFirm, type DLiability, type ExpenseForm } from './dissolve';

// Ready firms of the dissolution lab, and made-up ones whose every figure comes out in whole rupees.

export interface DExample {
  id: string;
  title: string;
  firm: DFirm;
}

const r = rupees;

export const EXAMPLES: readonly DExample[] = [
  {
    id: 'sold-taken-discount',
    title: 'Sold, taken over, a discount',
    firm: {
      firm: 'Asha and Bharat',
      date: '31 March 2026',
      partners: [
        { name: 'Asha', ratio: 3, capital: r(160000), loan: 0 },
        { name: 'Bharat', ratio: 2, capital: r(110000), loan: r(30000) },
      ],
      assets: [
        { id: 'stock', name: 'Stock', the: 'the stock', book: r(60000), fate: { kind: 'taken', by: 0, amount: r(54000) } },
        { id: 'debtors', name: 'Debtors', the: 'the debtors', book: r(90000), fate: { kind: 'sold', amount: r(82000) } },
        { id: 'machinery', name: 'Machinery', the: 'the machinery', book: r(200000), fate: { kind: 'sold', amount: r(171000) } },
        { id: 'furniture', name: 'Furniture', the: 'the furniture', book: r(40000), fate: { kind: 'silent' } },
        { id: 'goodwill', name: 'Goodwill', the: 'the goodwill', book: r(20000), intangible: true, fate: { kind: 'silent' } },
      ],
      provision: r(5000),
      liabilities: [
        { id: 'creditors', name: 'Creditors', the: 'the creditors', what: 'creditors', book: r(80000), fate: { kind: 'paid', discount: r(2000) } },
        { id: 'billsPayable', name: 'Bills payable', the: 'the bills payable', what: 'bills payable', book: r(20000), fate: { kind: 'paid', discount: 0 } },
      ],
      reserve: r(25000),
      plCredit: 0,
      plDebit: 0,
      unrecordedAsset: null,
      unrecordedLiability: null,
      expenses: { form: 'firm', by: 0, actual: r(4000), fee: 0 },
    },
  },
  {
    id: 'kind-and-deficiency',
    title: 'Settled in kind, a partner short',
    firm: {
      firm: 'Kabir, Leela and Manoj',
      date: '30 September 2025',
      partners: [
        { name: 'Kabir', ratio: 2, capital: r(100000), loan: 0 },
        { name: 'Leela', ratio: 2, capital: r(45000), loan: 0 },
        { name: 'Manoj', ratio: 1, capital: r(15000), loan: 0 },
      ],
      assets: [
        { id: 'stock', name: 'Stock', the: 'the stock', book: r(70000), fate: { kind: 'creditors', amount: r(65000) } },
        { id: 'debtors', name: 'Debtors', the: 'the debtors', book: r(60000), fate: { kind: 'sold', amount: r(54000) } },
        { id: 'furniture', name: 'Furniture', the: 'the furniture', book: r(50000), fate: { kind: 'taken', by: 1, amount: r(42000) } },
        { id: 'investments', name: 'Investments', the: 'the investments', book: r(30000), fate: { kind: 'sold', amount: r(33000) } },
      ],
      provision: 0,
      liabilities: [
        { id: 'creditors', name: 'Creditors', the: 'the creditors', what: 'creditors', book: r(90000), fate: { kind: 'paid', discount: 0 } },
        { id: partnerLoan('Suman'), name: "Loan from Suman (Kabir's spouse)", the: 'the loan from Suman', what: "Suman's loan", book: r(40000), fate: { kind: 'taken', by: 0 } },
      ],
      reserve: 0,
      plCredit: 0,
      plDebit: r(15000),
      unrecordedAsset: { what: 'old computer', amount: r(6000), by: null },
      unrecordedLiability: { what: 'repairs bill', amount: r(5000), by: null },
      expenses: { form: 'feeFirmPays', by: 2, actual: r(4000), fee: r(6000) },
    },
  },
  {
    id: 'profit-reserve-loan',
    title: 'A profit, reserves and a loan',
    firm: {
      firm: 'Esha, Farhan and Gauri',
      date: '31 December 2025',
      partners: [
        { name: 'Esha', ratio: 5, capital: r(100000), loan: 0 },
        { name: 'Farhan', ratio: 3, capital: r(80000), loan: 0 },
        { name: 'Gauri', ratio: 2, capital: r(60000), loan: r(20000) },
      ],
      assets: [
        { id: 'building', name: 'Building', the: 'the building', book: r(200000), fate: { kind: 'sold', amount: r(260000) } },
        { id: 'stock', name: 'Stock', the: 'the stock', book: r(50000), fate: { kind: 'sold', amount: r(45000) } },
        { id: 'debtors', name: 'Debtors', the: 'the debtors', book: r(40000), fate: { kind: 'sold', amount: r(38000) } },
      ],
      provision: 0,
      liabilities: [
        { id: 'creditors', name: 'Creditors', the: 'the creditors', what: 'creditors', book: r(50000), fate: { kind: 'paid', discount: 0 } },
        { id: 'bankLoan', name: 'Bank loan', the: 'the bank loan', what: 'bank loan', book: r(60000), fate: { kind: 'paid', discount: 0 } },
      ],
      reserve: r(30000),
      plCredit: r(10000),
      plDebit: 0,
      unrecordedAsset: null,
      unrecordedLiability: null,
      expenses: { form: 'partnerPays', by: 0, actual: r(3000), fee: 0 },
    },
  },
];

/** The firms played in Watch. */
export const WATCH_EXAMPLES = EXAMPLES.slice(0, 2);

const NAMES = ['Asha', 'Bharat', 'Chitra', 'Dev', 'Esha', 'Farhan', 'Gauri', 'Harish', 'Ishaan', 'Jaya', 'Kabir', 'Leela', 'Manoj', 'Nisha', 'Omkar', 'Pooja', 'Rohan', 'Sana', 'Tarun', 'Uma', 'Vikram', 'Zoya'];
const RELATIVES = [
  { rel: 'spouse', names: ['Kiran', 'Suman', 'Shashi'] },
  { rel: 'brother', names: ['Suresh', 'Prakash', 'Naveen'] },
  { rel: 'sister', names: ['Meena', 'Anjali', 'Kavita'] },
];
const RATIOS2 = [[3, 2], [2, 1], [3, 1], [5, 3], [1, 1], [7, 3]];
const RATIOS3 = [[5, 3, 2], [3, 2, 1], [2, 2, 1], [2, 1, 1], [1, 1, 1], [4, 3, 3]];
const DATES = ['31 March 2026', '31 March 2025', '30 June 2025', '30 September 2025', '31 December 2025'];
const MAIN: [string, string, string][] = [['machinery', 'Machinery', 'the machinery'], ['building', 'Building', 'the building'], ['furniture', 'Furniture', 'the furniture']];
const SECOND: [string, string, string][] = [['investments', 'Investments', 'the investments'], ['vehicles', 'Vehicles', 'the vehicles'], ['computers', 'Computers', 'the computers']];
const OLD = ['old typewriter', 'old computer', 'old scooter'];
const BILLS = ['repairs bill', 'electricity bill', 'claim for damages'];

/** A price near a book value: `pct` per cent above or below it, in whole thousands. */
const near = (book: number, pct: number): number => Math.round((book * (100 + pct)) / 100 / 1000) * 1000;

/**
 * A made-up firm: two or three partners, four or five assets that go every way an asset can go, one or two outside
 * liabilities, perhaps a partner's loan, reserves or a past loss, things not in the books, and expenses in any of
 * their six forms. Every share comes out in whole rupees and every partner ends with something to be paid (or, now
 * and then, with a deficiency to bring in).
 */
export function randomFirm(rng: Rng): DFirm {
  for (let attempt = 0; attempt < 300; attempt++) {
    const f = draw(rng);
    if (f) return f;
  }
  return EXAMPLES[0].firm;
}

function draw(rng: Rng): DFirm | null {
  const size = rng.pick([2, 2, 3]);
  const names = rng.shuffle(NAMES).slice(0, size);
  const ratio = rng.pick(size === 2 ? RATIOS2 : RATIOS3);
  const sumR = ratio.reduce((a, b) => a + b, 0);
  const anyone = () => rng.int(0, size - 1);
  const assets: DAsset[] = [];
  const [mid, mname, mthe] = rng.pick(MAIN);
  const mainBook = rng.step(100000, 400000, 10000);
  assets.push({ id: mid, name: mname, the: mthe, book: r(mainBook), fate: { kind: 'sold', amount: r(near(mainBook, rng.pick([-20, -10, 10, 20]))) } });
  const stock = rng.step(40000, 150000, 10000);
  const stockWay = rng.pick(['sold', 'taken', 'creditors'] as const);
  const stockAt = near(stock, rng.pick([-20, -10, 10]));
  const stockFate: AssetFate = stockWay === 'sold' ? { kind: 'sold', amount: r(stockAt) } : stockWay === 'taken' ? { kind: 'taken', by: anyone(), amount: r(stockAt) } : { kind: 'creditors', amount: r(stockAt) };
  assets.push({ id: 'stock', name: 'Stock', the: 'the stock', book: r(stock), fate: stockFate });
  const debtors = rng.step(40000, 150000, 10000);
  assets.push({ id: 'debtors', name: 'Debtors', the: 'the debtors', book: r(debtors), fate: { kind: 'sold', amount: r(debtors - rng.step(1000, 10000, 1000)) } });
  const provision = rng.int(0, 2) === 0 ? rng.step(2000, 8000, 1000) : 0;
  if (rng.int(0, 1) === 0) {
    const [sid, sname, sthe] = rng.pick(SECOND);
    const book = rng.step(20000, 80000, 5000);
    const way = rng.pick(['sold', 'taken', 'silent'] as const);
    assets.push({ id: sid, name: sname, the: sthe, book: r(book), fate: way === 'sold' ? { kind: 'sold', amount: r(near(book, 10)) } : way === 'taken' ? { kind: 'taken', by: anyone(), amount: r(near(book, -10)) } : { kind: 'silent' } });
  }
  if (rng.int(0, 2) === 0) assets.push({ id: 'goodwill', name: 'Goodwill', the: 'the goodwill', book: r(rng.step(10000, 40000, 5000)), intangible: true, fate: { kind: 'silent' } });

  const accepted = stockFate.kind === 'creditors' ? stockAt : 0;
  const creditorsBook = accepted + rng.step(20000, 100000, 5000);
  const liabilities: DLiability[] = [{ id: 'creditors', name: 'Creditors', the: 'the creditors', what: 'creditors', book: r(creditorsBook), fate: { kind: 'paid', discount: rng.int(0, 1) === 0 ? r(rng.step(1000, 5000, 1000)) : 0 } }];
  if (rng.int(0, 1) === 0) {
    const kind = rng.pick(['bills', 'bank', 'relative'] as const);
    const book = rng.step(20000, 80000, 10000);
    const fate = rng.int(0, 3) === 0 && kind !== 'bank' ? ({ kind: 'taken', by: anyone() } as const) : ({ kind: 'paid', discount: 0 } as const);
    if (kind === 'bills') liabilities.push({ id: 'billsPayable', name: 'Bills payable', the: 'the bills payable', what: 'bills payable', book: r(book), fate });
    else if (kind === 'bank') liabilities.push({ id: 'bankLoan', name: 'Bank loan', the: 'the bank loan', what: 'bank loan', book: r(book), fate });
    else {
      const rel = rng.pick(RELATIVES);
      const who = rng.pick(rel.names);
      liabilities.push({ id: partnerLoan(who), name: `Loan from ${who} (${names[anyone()]}'s ${rel.rel})`, the: `the loan from ${who}`, what: `${who}'s loan`, book: r(book), fate });
    }
  }
  const kept = rng.pick(['none', 'reserve', 'profit', 'loss', 'reserveAndLoss'] as const);
  const reserve = kept === 'reserve' || kept === 'reserveAndLoss' ? sumR * rng.step(2000, 8000, 1000) : 0;
  const plCredit = kept === 'profit' ? sumR * rng.step(2000, 6000, 1000) : 0;
  const plDebit = kept === 'loss' || kept === 'reserveAndLoss' ? sumR * rng.step(1000, 5000, 1000) : 0;
  const lender = rng.int(0, 2) === 0 ? anyone() : -1;
  const unrecordedAsset = rng.int(0, 3) === 0 ? { what: rng.pick(OLD), amount: r(rng.step(2000, 12000, 1000)), by: rng.int(0, 1) === 0 ? null : anyone() } : null;
  const unrecordedLiability = rng.int(0, 3) === 0 ? { what: rng.pick(BILLS), amount: r(rng.step(2000, 10000, 1000)), by: rng.int(0, 2) === 0 ? anyone() : null } : null;
  const form: ExpenseForm = rng.pick(EXPENSE_FORMS);
  const actual = rng.step(2000, 10000, 1000);
  const expenses = { form, by: anyone(), actual: r(actual), fee: form === 'feePersonal' || form === 'feeFirmPays' ? r(actual + rng.pick([1000, 2000, 3000])) : 0 };

  const partners = names.map((name, i) => ({ name, ratio: ratio[i], capital: r(10000), loan: i === lender ? r(rng.step(20000, 60000, 10000)) : 0 }));
  const firm: DFirm = { firm: names.join(names.length === 2 ? ' and ' : ', ').replace(/, ([^,]+)$/, ' and $1'), date: rng.pick(DATES), partners, assets, provision: r(provision), liabilities, reserve: r(reserve), plCredit: r(plCredit), plDebit: r(plDebit), unrecordedAsset, unrecordedLiability, expenses };

  // The main asset's price makes the result a whole multiple of ₹100 for every share.
  const unit = sumR * 10000;
  const base = (firm.assets[0].fate as { amount: number }).amount;
  let k = 0;
  const result = () => dissolve(firm).result;
  while (k < 40 && ((result() % unit) + unit) % unit !== 0) {
    k++;
    firm.assets[0] = { ...firm.assets[0], fate: { kind: 'sold', amount: base - k * 100000 } };
  }
  if (k === 40 || Math.abs(result()) < sumR * 100000) return null;

  // Capitals: the bank opens with a round balance, and the capitals take up the rest of the balance sheet.
  const bankWanted = rng.step(15000, 60000, 5000);
  partners.forEach((p) => (p.capital = 0));
  const rest = bankWanted * 100 - bankOf(firm);
  if (rest < size * r(40000)) return null;
  for (let i = 0; i < size - 1; i++) partners[i].capital = Math.round((rest * rng.pick(size === 2 ? [0.4, 0.5, 0.6] : [0.3, 0.35, 0.4])) / r(10000)) * r(10000);
  partners[size - 1].capital = rest - partners.slice(0, -1).reduce((s, p) => s + p.capital, 0);
  if (partners.some((p) => p.capital < r(20000))) return null;
  const d = dissolve(firm);
  if (d.problem) return null;
  // Nobody is left with a trifle; a partner short is allowed now and then.
  if (d.finals.some((x) => x > 0 && x < r(5000)) || d.finals.filter((x) => x < 0).length > (rng.int(0, 3) === 0 ? 1 : 0)) return null;
  return firm;
}
