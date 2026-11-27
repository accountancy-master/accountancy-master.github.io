import { loadTopics } from '@/content/loadTopics';
import { templateOutlinesOf, courseOfTopic } from '@/content/outline';
import type { JournalQuestion } from '@/content/types';
import { creditor, debtor } from '@/engine/accounts';
import { createRng } from '@/engine/rng';
import { PARTIES } from '@/generators/authoring';
import { generateFrom } from '@/generators/engine';
import { getTemplate } from '@/generators/loaded';
import type { EquationMove } from '@/generators/templates/accounting-equation';
import type { Template } from '@/generators/types';
import { equationMoves, type EquationMoveDefs } from '../moves';
import type { Effect, JournalLine, Paise, SimTransaction } from '../types';
import { cr, dr } from './build';

// ---------------------------------------------------------------------------------------------------------------
// Transactions from the topic generators. The accounting-equation generators describe a transaction and its effect
// on the totals; here each kind is journalised, and a unit test proves for hundreds of seeds that the entry has
// exactly the effect the generator states. Journal Entries' templates give the entry itself.
// ---------------------------------------------------------------------------------------------------------------

const ASSET_WORDS: [string, string][] = [
  ['shop fittings', 'shopFittings'],
  ['refrigerator', 'refrigerator'],
  ['delivery van', 'vehicles'],
  ['computer', 'computers'],
  ['machinery', 'machinery'],
  ['furniture', 'furniture'],
];
const EXPENSE_WORDS: [string, string, string][] = [
  ['shop rent', 'rent', 'outstandingRent'],
  ['staff salaries', 'salaries', 'outstandingSalaries'],
  ['electricity charges', 'electricity', 'outstandingElectricity'],
  ['advertising charges', 'advertisement', 'outstandingExpenses'],
  ['repair charges', 'repairs', 'outstandingExpenses'],
  ['telephone charges', 'telephone', 'outstandingExpenses'],
];
const INCOME_WORDS: [string, string][] = [
  ['interest on a bank deposit', 'interestReceived'],
  ['rent from a sub-tenant', 'rentReceived'],
  ['dividend on shares', 'dividendReceived'],
  ['commission', 'commissionReceived'],
];
const ACCRUED_WORDS: [string, string, string][] = [
  ['commission of', 'accruedCommission', 'commissionReceived'],
  ['interest of', 'accruedInterest', 'interestReceived'],
  ['rent of', 'accruedRent', 'rentReceived'],
];

function find<T extends [string, ...string[]]>(text: string, words: T[], what: string): T {
  const hit = words.find(([w]) => text.includes(w));
  if (!hit) throw new Error(`No ${what} in: ${text}`);
  return hit;
}
const party = (text: string): string => {
  const p = PARTIES.find((name) => text.includes(name));
  if (!p) throw new Error(`No party in: ${text}`);
  return p;
};
const asset = (text: string) => find(text, ASSET_WORDS, 'asset')[1];

/** The kind of each move, as the simulator names it. */
const KIND: Record<string, string> = {
  'capital-cash': 'Capital introduced',
  'capital-asset': 'Capital introduced in kind',
  'drawings-cash': 'Drawings in cash',
  'drawings-goods': 'Drawings in goods',
  'expense-cash': 'Expense paid',
  'income-cash': 'Income earned in cash',
  'credit-asset': 'Asset bought on credit',
  'credit-goods': 'Goods bought on credit',
  'pay-creditor': 'Liability paid',
  'loan-bank': 'Loan taken',
  'repay-loan': 'Loan repaid',
  'credit-sale-profit': 'Goods sold on credit',
  'cash-sale-profit': 'Goods sold for cash',
  'sale-loss': 'Goods sold at a loss',
  'collect-debtor': 'Debtor pays',
  deposit: 'Cash deposited',
  'buy-asset-cash': 'Asset bought by cheque',
  'buy-goods-cash': 'Goods bought for cash',
  'return-supplier': 'Goods returned to a supplier',
  'bill-accepted': 'Bill accepted',
  'bill-received': 'Bill received',
  'prepaid-all': 'Expense paid in advance',
  outstanding: 'Expense outstanding',
  'prepaid-part': 'Expense partly prepaid',
  accrued: 'Income earned, not yet received',
  advance: 'Income received in advance',
  depreciation: 'Depreciation',
  'bad-debt': 'Bad debts',
  theft: 'Loss of goods by theft',
  'discount-allowed': 'Settled with a discount allowed',
  'discount-received': 'Settled with a discount received',
  'fire-claim': 'Loss by fire, partly insured',
  'asset-sale-profit': 'Asset sold at a profit',
  'asset-sale-loss': 'Asset sold at a loss',
  'owner-paid-creditor': 'Creditor paid by the proprietor',
};

/** The narration of each move's entry, without "Being" and the brackets. */
const NARRATION: Record<string, string> = {
  'capital-cash': 'capital brought in',
  'capital-asset': 'asset brought in as capital',
  'drawings-cash': 'cash withdrawn for personal use',
  'drawings-goods': 'goods taken for personal use',
  'expense-cash': 'expense paid',
  'income-cash': 'income received',
  'credit-asset': 'asset bought on credit',
  'credit-goods': 'goods bought on credit',
  'pay-creditor': 'payment made to a creditor',
  'loan-bank': 'loan taken from the bank',
  'repay-loan': 'part of the loan repaid',
  'credit-sale-profit': 'goods sold on credit',
  'cash-sale-profit': 'goods sold for cash',
  'sale-loss': 'goods sold',
  'collect-debtor': 'cash received from a debtor',
  deposit: 'cash deposited into the bank',
  'buy-asset-cash': 'asset bought',
  'buy-goods-cash': 'goods bought for cash',
  'return-supplier': 'goods returned to the supplier',
  'bill-accepted': 'acceptance given to a creditor',
  'bill-received': 'acceptance received from a debtor',
  'prepaid-all': 'rent paid in advance',
  outstanding: 'expense due but not paid',
  'prepaid-part': 'insurance paid, part of it for the next year',
  accrued: 'income earned but not received',
  advance: 'rent received in advance',
  depreciation: 'depreciation charged',
  'bad-debt': 'bad debt written off',
  theft: 'goods lost by theft',
  'discount-allowed': 'cash received and discount allowed',
  'discount-received': 'payment made and discount received',
  'fire-claim': 'goods lost by fire and the insurance claim admitted',
  'asset-sale-profit': 'asset sold at a profit',
  'asset-sale-loss': 'asset sold at a loss',
  'owner-paid-creditor': 'creditor paid by the proprietor from private funds',
};

/** The entry of a move, and the cost of the goods where it is a sale. */
export function journaliseMove(id: string, m: EquationMove): { lines: JournalLine[]; costOfSale?: Paise } {
  const { x, text, e } = m;
  switch (id) {
    case 'capital-cash':
      return { lines: [dr('cash', x), cr('capital', x)] };
    case 'capital-asset':
      return { lines: [dr(asset(text), x), cr('capital', x)] };
    case 'drawings-cash':
      return { lines: [dr('drawings', x), cr('cash', x)] };
    case 'drawings-goods':
      return { lines: [dr('drawings', x), cr('purchases', x)] };
    case 'expense-cash':
      return { lines: [dr(find(text, EXPENSE_WORDS, 'expense')[1], x), cr('cash', x)] };
    case 'income-cash':
      return { lines: [dr('cash', x), cr(find(text, INCOME_WORDS, 'income')[1], x)] };
    case 'credit-asset':
      return { lines: [dr(asset(text), x), cr(creditor(party(text)), x)] };
    case 'credit-goods':
      return { lines: [dr('purchases', x), cr(creditor(party(text)), x)] };
    case 'pay-creditor':
      return { lines: [dr(creditor(party(text)), x), cr('bank', x)] };
    case 'loan-bank':
      return { lines: [dr('bank', x), cr('bankLoan', x)] };
    case 'repay-loan':
      return { lines: [dr('bankLoan', x), cr('bank', x)] };
    case 'credit-sale-profit':
      return { lines: [dr(debtor(party(text)), x), cr('sales', x)], costOfSale: x - e.a };
    case 'cash-sale-profit':
      return { lines: [dr('cash', x), cr('sales', x)], costOfSale: x - e.a };
    case 'sale-loss': {
      const price = x + e.a;
      const buyer = text.includes('on credit') ? debtor(party(text)) : 'cash';
      return { lines: [dr(buyer, price), cr('sales', price)], costOfSale: x };
    }
    case 'collect-debtor':
      return { lines: [dr('cash', x), cr(debtor(party(text)), x)] };
    case 'deposit':
      return { lines: [dr('bank', x), cr('cash', x)] };
    case 'buy-asset-cash':
      return { lines: [dr(asset(text), x), cr('bank', x)] };
    case 'buy-goods-cash':
      return { lines: [dr('purchases', x), cr('cash', x)] };
    case 'return-supplier':
      return { lines: [dr(creditor(party(text)), x), cr('purchasesReturn', x)] };
    case 'bill-accepted':
      return { lines: [dr(creditor(party(text)), x), cr('billsPayable', x)] };
    case 'bill-received':
      return { lines: [dr('billsReceivable', x), cr(debtor(party(text)), x)] };
    case 'prepaid-all':
      return { lines: [dr('prepaidRent', x), cr('cash', x)] };
    case 'outstanding': {
      const [, expense, owed] = find(text, EXPENSE_WORDS, 'expense');
      return { lines: [dr(expense, x), cr(owed, x)] };
    }
    case 'prepaid-part': {
      const prepaid = x + e.a;
      return { lines: [dr('insurance', x - prepaid), dr('prepaidInsurance', prepaid), cr('bank', x)] };
    }
    case 'accrued': {
      const [, due, income] = find(text, ACCRUED_WORDS, 'income');
      return { lines: [dr(due, x), cr(income, x)] };
    }
    case 'advance':
      return { lines: [dr('cash', x), cr('rentReceivedInAdvance', x)] };
    case 'depreciation':
      return { lines: [dr('depreciation', x), cr(asset(text), x)] };
    case 'bad-debt':
      return { lines: [dr('badDebts', x), cr(debtor(party(text)), x)] };
    case 'theft':
      return { lines: [dr('lossByTheft', x), cr('purchases', x)] };
    case 'discount-allowed': {
      const discount = -e.a;
      return { lines: [dr('cash', x - discount), dr('discountAllowed', discount), cr(debtor(party(text)), x)] };
    }
    case 'discount-received': {
      const discount = e.c;
      return { lines: [dr(creditor(party(text)), x), cr('cash', x - discount), cr('discountReceived', discount)] };
    }
    case 'fire-claim': {
      const claim = x + e.a;
      return { lines: [dr('insuranceClaimReceivable', claim), dr('lossByFire', x - claim), cr('purchases', x)] };
    }
    case 'asset-sale-profit': {
      const book = x - e.a;
      return { lines: [dr('cash', x), cr(asset(text), book), cr('profitOnSaleOfAsset', e.a)] };
    }
    case 'asset-sale-loss': {
      const loss = -e.a;
      return { lines: [dr('cash', x - loss), dr('lossOnSaleOfAsset', loss), cr(asset(text), x)] };
    }
    case 'owner-paid-creditor':
      return { lines: [dr(creditor(party(text)), x), cr('capital', x)] };
    default:
      throw new Error(`The simulator does not know the move ${id}`);
  }
}

const sentence = (text: string): string => {
  const t = text.charAt(0).toUpperCase() + text.slice(1);
  return t.endsWith('.') ? t : `${t}.`;
};
const asEffect = (e: { a: Paise; l: Paise; c: Paise }): Effect => ({ assets: e.a, liabilities: e.l, capital: e.c });

/** The move a seed gives: drawn from every move there is, then made from the same seed. */
export function equationMoveFor(moves: EquationMoveDefs, seed: number): { id: string; move: EquationMove } {
  const rng = createRng(seed);
  const def = rng.pick(moves);
  return { id: def.id, move: def.make(rng) };
}

/** The transaction of an accounting-equation move. */
export function moveTransaction(seed: number, id: string, m: EquationMove): SimTransaction {
  const { lines, costOfSale } = journaliseMove(id, m);
  return {
    id: `m.${seed}`,
    kind: KIND[id] ?? 'Transaction',
    text: sentence(m.text),
    lines,
    ...(NARRATION[id] ? { narration: NARRATION[id] } : {}),
    ...(costOfSale ? { costOfSale } : {}),
    why: m.note,
    traps: [...(m.trap ? [m.trap] : []), ...(m.also ?? [])].map((t) => ({ effect: asEffect(t.e), why: t.why })),
  };
}

/** The equation generators, once their topic is loaded (it is loaded here when it is not yet). */
export async function loadEquationMoves(): Promise<(seed: number) => SimTransaction> {
  await loadTopics(['accounting-equation']);
  const moves = equationMoves();
  if (!moves) throw new Error('The accounting equation was loaded without its moves');
  return (seed) => {
    const { id, move } = equationMoveFor(moves, seed);
    return moveTransaction(seed, id, move);
  };
}

const NO_COST =
  'The journal records a sale at its price, so Sales A/c is credited with the whole amount. The cost of these goods is not given, so here the equation adds the whole price to the profit so far and leaves stock as it is. That is not wrong: goods bought are kept in Purchases A/c and goods sold in Sales A/c, and the profit on them is worked out at the end of the year, when the stock left is counted. When the cost is known, the goods also leave stock at cost and capital rises only by the profit.';

const NO_COST_RETURN =
  'The cost of the goods returned is not given, so here the equation takes the whole amount off the profit so far and leaves stock as it is, just as a sale without its cost adds the whole price. The goods are back in the shop and are counted in the stock at the end of the year.';

/**
 * Templates whose party account stands on the other side of the equation from its usual one. An advance received from
 * a customer is owed back in goods (a liability), and an advance paid to a supplier is owed to the business in goods
 * (an asset). The journal names the same person either way, so the entry reads exactly as the template's.
 */
const ADVANCES: Record<string, { from: string; to: string; why: string }> = {
  'je-advance-received': {
    from: 'debtor:',
    to: 'creditor:',
    why: 'Nothing has been sold yet. Money comes in, and until the goods are supplied the business owes them to the customer: the customer’s account has a credit balance, a liability. Assets and liabilities rise together; capital does not change.',
  },
  'je-advance-paid': {
    from: 'creditor:',
    to: 'debtor:',
    why: 'Nothing has been bought yet. Money goes out, and until the goods arrive the supplier owes them to the business: the supplier’s account has a debit balance, an asset. One asset replaces another.',
  },
  'je-advance-adjusted': {
    from: 'debtor:',
    to: 'creditor:',
    why: `The advance was a liability: goods were owed to the customer. Supplying them uses it up, so that liability falls, and only the balance comes in as money. ${NO_COST}`,
  },
};

/** The transaction of a question of Journal Entries: its prompt and its entry. */
export function journalTransaction(templateId: string, seed: number, q: JournalQuestion): SimTransaction {
  const advance = ADVANCES[templateId];
  const lines = advance
    ? q.expected.map((l) => (l.accountId.startsWith(advance.from) ? { ...l, accountId: advance.to + l.accountId.slice(advance.from.length) } : l))
    : q.expected;
  const sale = lines.some((l) => l.accountId === 'sales' && l.side === 'Cr');
  const salesReturn = lines.some((l) => l.accountId === 'salesReturn' && l.side === 'Dr');
  const why = advance?.why ?? (sale ? NO_COST : salesReturn ? NO_COST_RETURN : undefined);
  return {
    id: `j.${templateId}.${seed}`,
    kind: 'Journal entry',
    text: q.prompt,
    lines,
    ...(why ? { why } : {}),
  };
}

/** The single-entry templates of Journal Entries, in their order. */
export const journalTemplates = (templates: readonly Template[]): Template[] => templates.filter((t) => t.kind === 'journal');

/** The question of a template for a seed, as a transaction; null when the template does not make a single entry. */
export function journalTransactionFrom(t: Template, seed: number): SimTransaction | null {
  const q = generateFrom(t, seed);
  return q.type === 'journal_entry' ? journalTransaction(t.id, seed, q) : null;
}

/** The single-entry templates of Journal Entries, once that topic is loaded (it is loaded here when it is not yet). */
export async function loadJournalEntries(): Promise<(seed: number) => SimTransaction> {
  await loadTopics(['journal-entries']);
  const list = journalTemplates(templateOutlinesOf(courseOfTopic('journal-entries') ?? '').filter((t) => t.topicId === 'journal-entries').map((t) => getTemplate(t.id)));
  return (seed) => {
    const t = list[seed % list.length];
    const own = Math.floor(seed / list.length) + 1;
    const made = journalTransactionFrom(t, own);
    if (!made) throw new Error(`Template ${t.id} made no single entry`);
    return made;
  };
}
