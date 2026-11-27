import { formatINR, type Paise } from '@/engine/money';
import {
  adjKey,
  adjustmentText,
  adjustmentTitle,
  balanceOf,
  effectsOf,
  finalAccounts,
  fullState,
  hasItem,
  ITEMS,
  SPOT_NAMES,
  trialBalanceTotals,
  YEAR_END,
  type Adjustment,
  type Business,
  type FaState,
  type ItemId,
  type Kind,
  type Statements,
} from './model';

// ---------------------------------------------------------------------------------------------------------------
// The walk-through: the steps of the guided example, each a state of the picture and a sentence or two on what moves
// and why. Part one sorts the trial balance into the three statements and closes them; part two makes the
// adjustments one at a time and shows that each has two effects (a loss by fire with an insurance claim, three) and
// leaves the Balance Sheet in agreement.
// ---------------------------------------------------------------------------------------------------------------

export interface WalkStep {
  title: string;
  /** What moves and why, in a sentence or two. */
  text: string;
  /** For an adjustment: its effects (two, or three), and what they did. */
  effects?: string[];
  result?: string;
  state: FaState;
}

/** "First", "Second", "Third": the name of an effect by its place. */
export const ORDINALS = ['First', 'Second', 'Third', 'Fourth'] as const;

/** Everything a step says, as one announcement. */
export const stepWords = (s: WalkStep): string => [s.text, ...(s.effects ?? []).map((e, i) => `${ORDINALS[i]} effect: ${e}.`), s.result ?? ''].filter(Boolean).join(' ');

const inr = formatINR;

/** "A, B and C". */
export const andList = (xs: readonly string[]): string => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

const idsOf = (b: Business, kinds: readonly Kind[]): ItemId[] => b.tb.map((l) => l.id).filter((id) => kinds.includes(ITEMS[id].kind));
const named = (b: Business, id: ItemId) => `${ITEMS[id].label} ${inr(balanceOf(b, id))}`;

/** The closing stock of a business's own adjustments (nothing when it has none). */
export const closingStockOf = (b: Business): Adjustment[] => b.adjustments.filter((a) => a.type === 'closingStock');

/** "gross profit of ₹1,00,000" or "gross loss of ₹5,000". */
const result = (level: 'gross' | 'net', x: Paise) => `${level} ${x >= 0 ? 'profit' : 'loss'} of ${inr(Math.abs(x))}`;

/** Part one: from the trial balance to the three statements, closed, with the closing stock as the one thing from outside it. */
export function partOne(b: Business): WalkStep[] {
  const steps: WalkStep[] = [];
  const placed = new Set<ItemId>();
  let adjustments: Adjustment[] = [];
  let closeTrading = false;
  let closePL = false;
  const push = (title: string, text: string) =>
    steps.push({ title, text, state: { placed: new Set(placed), adjustments: [...adjustments], closeTrading, closePL } });
  const place = (ids: ItemId[]) => ids.forEach((id) => placed.add(id));
  const { dr } = trialBalanceTotals(b);

  push(
    'The trial balance',
    `This is the trial balance of ${b.name}, ${b.trade}, on ${YEAR_END}. Its two columns agree at ${inr(dr)}. Every balance in it goes to exactly one place: the Trading Account, the Profit and Loss Account or the Balance Sheet.`,
  );

  // The cost of the goods: opening stock, purchases less the return, the direct expenses.
  const cost = idsOf(b, ['openingStock', 'purchases', 'purchasesReturn', 'directExpense']);
  if (cost.length > 0) {
    place(cost);
    const purchases = hasItem(b, 'purchases')
      ? `${named(b, 'purchases')}${hasItem(b, 'purchasesReturn') ? ` less ${named(b, 'purchasesReturn')}` : ''}`
      : null;
    const parts = [
      ...(hasItem(b, 'openingStock') ? [named(b, 'openingStock')] : []),
      ...(purchases ? [purchases] : []),
      ...idsOf(b, ['directExpense']).map((id) => named(b, id)),
    ];
    push(
      'The cost of the goods',
      `${andList(parts)} go to the debit side of the Trading Account. They are the cost of the goods: what the year started with, what was bought (less what went back to suppliers) and the direct expenses of getting the goods ready to sell.`,
    );
  }

  const sales = idsOf(b, ['sales', 'salesReturn']);
  if (sales.length > 0) {
    place(sales);
    push(
      'What the goods brought in',
      `${named(b, 'sales')}${hasItem(b, 'salesReturn') ? ` less ${named(b, 'salesReturn')}` : ''} goes to the credit side of the Trading Account: what the goods were sold for, less what customers sent back.`,
    );
  }

  const stock = closingStockOf(b);
  if (stock.length > 0) {
    adjustments = [...stock];
    const cs = stock[0].type === 'closingStock' ? stock[0].amount : 0;
    push(
      'Closing stock: two places',
      `Closing stock of ${inr(cs)} is not in the trial balance: it was counted on ${YEAR_END}. It goes to two places. On the credit side of the Trading Account, because these goods were not sold, so their cost comes out of the cost of the goods sold; and among the assets, because the business still owns them.`,
    );
  }

  closeTrading = true;
  const t = finalAccounts(b, { placed, adjustments, closeTrading, closePL });
  const g = t.gross ?? 0;
  const trDr = t.trading.dr.total - Math.max(0, g);
  const trCr = t.trading.cr.total - Math.max(0, -g);
  push(
    g >= 0 ? 'Gross profit' : 'Gross loss',
    g >= 0
      ? `The credit side, ${inr(trCr)}, is larger than the debit side, ${inr(trDr)}: the difference is a gross profit of ${inr(g)}. It balances the Trading Account as "To Gross Profit c/d" and is carried down to the credit side of the Profit and Loss Account as "By Gross Profit b/d".`
      : `The debit side, ${inr(trDr)}, is larger than the credit side, ${inr(trCr)}: the goods cost more than they brought in, a gross loss of ${inr(-g)}. It balances the Trading Account as "By Gross Loss c/d" on the credit side and is carried down to the debit side of the Profit and Loss Account as "To Gross Loss b/d".`,
  );

  const expenses = idsOf(b, ['indirectExpense', 'badDebts']);
  if (expenses.length > 0) {
    place(expenses);
    push(
      'The running costs',
      `${andList(expenses.map((id) => named(b, id)))} go to the debit side of the Profit and Loss Account. They are costs of running and selling, not of the goods themselves: indirect expenses.`,
    );
  }

  const incomes = idsOf(b, ['income']);
  if (incomes.length > 0) {
    place(incomes);
    push('Other incomes', `${andList(incomes.map((id) => named(b, id)))} ${incomes.length > 1 ? 'go' : 'goes'} to the credit side of the Profit and Loss Account: income earned other than by selling the goods.`);
  }

  const owned = idsOf(b, ['fixedAsset', 'debtors', 'provision', 'currentAsset']);
  if (owned.length > 0) {
    place(owned);
    const words = owned
      .filter((id) => id !== 'provision')
      .map((id) => (id === 'debtors' && hasItem(b, 'provision') ? `${named(b, 'debtors')} less ${named(b, 'provision')}` : named(b, id)));
    push('What the business owns', `${andList(words)} go to the assets side of the Balance Sheet: what the business owns on ${YEAR_END}. Each is still there, so none of them touches the profit.`);
  }

  const owner = idsOf(b, ['capital', 'drawings', 'liability']);
  if (owner.length > 0) {
    place(owner);
    const s = finalAccounts(b, { placed, adjustments, closeTrading, closePL });
    const words = [
      ...(hasItem(b, 'capital') ? [`${named(b, 'capital')}${hasItem(b, 'drawings') ? ` less ${named(b, 'drawings')}` : ''}`] : []),
      ...idsOf(b, ['liability']).map((id) => named(b, id)),
    ];
    const net = finalAccounts(b, fullState(b, adjustments)).net ?? 0;
    const L = s.bs.liabilities.total;
    const A = s.bs.assets.total;
    push(
      'What the business owes',
      `${andList(words)} go to the liabilities side: what the business owes its proprietor and others. Drawings are deducted from capital; they are not an expense. The sides do not agree yet: liabilities ${inr(L)}, assets ${inr(A)}. The difference, ${inr(Math.abs(A - L))}, is the year's ${net >= 0 ? 'profit' : 'loss'}, still in the Profit and Loss Account.`,
    );
  }

  closePL = true;
  const f = finalAccounts(b, { placed, adjustments, closeTrading, closePL });
  const n = f.net ?? 0;
  const plDr = f.pl.dr.total - Math.max(0, n);
  const plCr = f.pl.cr.total - Math.max(0, -n);
  push(
    n >= 0 ? 'Net profit to capital' : 'Net loss to capital',
    `${n >= 0 ? `The credit side, ${inr(plCr)}, is larger than the debit side, ${inr(plDr)}: a net profit of ${inr(n)}, entered as "To Net Profit transferred to Capital A/c". It belongs to the proprietor, so it is added to capital` : `The debit side, ${inr(plDr)}, is larger than the credit side, ${inr(plCr)}: a net loss of ${inr(-n)}, entered as "By Net Loss transferred to Capital A/c". The proprietor bears it, so it is deducted from capital`}, which becomes ${inr(f.capital ?? 0)}. Now the Balance Sheet agrees: ${inr(f.bs.assets.total)} on each side.`,
  );
  return steps;
}

/** "Net profit falls from ₹52,000 to ₹48,000", or for a loss "Gross loss grows from ₹5,000 to ₹7,000". */
function levelWords(level: 'gross' | 'net', a: Paise, z: Paise): string {
  if (a >= 0 && z >= 0) return `${level} profit ${z > a ? 'rises' : 'falls'} from ${inr(a)} to ${inr(z)}`;
  if (a < 0 && z < 0) return `${level} loss ${-z > -a ? 'grows' : 'shrinks'} from ${inr(-a)} to ${inr(-z)}`;
  return a >= 0 ? `${level} profit of ${inr(a)} turns into a ${level} loss of ${inr(-z)}` : `${level} loss of ${inr(-a)} turns into a ${level} profit of ${inr(z)}`;
}

/** What changed between two states of the final accounts, in words. */
export function changeWords(before: Statements, after: Statements): string[] {
  const out: string[] = [];
  if (before.gross !== null && after.gross !== null && before.gross !== after.gross) out.push(levelWords('gross', before.gross, after.gross));
  if (before.net !== null && after.net !== null && before.net !== after.net) out.push(levelWords('net', before.net, after.net));
  if (before.capital !== null && after.capital !== null && before.capital !== after.capital)
    out.push(`capital ${after.capital > before.capital ? 'rises' : 'falls'} from ${inr(before.capital)} to ${inr(after.capital)}`);
  return out;
}

/** Why the Balance Sheet still agrees after an adjustment, in one sentence. */
function stillAgrees(before: Statements, after: Statements): string {
  const A0 = before.bs.assets.total;
  const A1 = after.bs.assets.total;
  const same = before.bs.liabilities.total === after.bs.liabilities.total && A0 === A1;
  const capitalStays = before.capital === after.capital && before.net !== after.net;
  if (capitalStays) return `Capital stays at ${inr(after.capital ?? 0)}: it gains in one line what it loses in another, so the Balance Sheet stays at ${inr(A1)}.`;
  if (same && before.net === after.net)
    return `The net ${(after.net ?? 0) >= 0 ? 'profit' : 'loss'} does not change: what the Trading Account gains, the Profit and Loss Account charges. So the Balance Sheet stays at ${inr(A1)} on each side.`;
  if (same) return `The Balance Sheet stays at ${inr(A1)} on each side: the two effects cancel inside it.`;
  return `Both sides of the Balance Sheet move from ${inr(A0)} to ${inr(A1)} together, so it still agrees.`;
}

/** Why an adjustment is made, in one sentence. */
export function adjustmentWhy(a: Adjustment): string {
  switch (a.type) {
    case 'closingStock':
      return 'Goods not sold come out of the cost of the goods, and the business still owns them.';
    case 'outstanding':
      return 'The expense belongs to this year although it is unpaid, and the amount is owed.';
    case 'prepaid':
      return 'Part of what was paid buys a benefit of next year: it is not an expense of this year, and the business is owed that benefit.';
    case 'accrued':
      return 'The income belongs to this year although the cash has not come in, and it is due to the business.';
    case 'advance':
      return 'Part of what was received belongs to next year: it is not income of this year, and the business owes that service.';
    case 'depreciation':
      return 'The asset has lost part of its value in use: an expense of the year, and a lower figure for the asset.';
    case 'badDebts':
      return 'Debts that will not be collected are a loss of the year, and the debtors are shown at what is expected to come in.';
    case 'discount':
      return 'Customers who pay on time will take a discount: it is provided for in the year of the sales, and the debtors are shown at what is expected to come in. It is worked out on the debtors expected to pay, after the bad debts and the provision for doubtful debts.';
    case 'interestOnCapital':
      return "The proprietor's capital earns interest from the business: an expense of the business, added to capital.";
    case 'goodsTaken':
      return 'The goods were not sold: they leave purchases at cost, and they are drawings of the proprietor.';
    case 'goodsGiven':
      return a.to === 'samples'
        ? 'The goods were not sold: they leave purchases at cost, and their cost is an expense of selling, advertisement.'
        : 'The goods were not sold: they leave purchases at cost, and their cost is an expense of running the business, staff welfare.';
    case 'abnormalLoss':
      return `A fire is not part of normal trading, so the goods leave purchases at cost and the gross profit shows normal trading only. ${
        a.claim >= a.amount
          ? 'The insurance company will pay the whole cost: it is due to the business, and nothing is lost.'
          : a.claim > 0
            ? 'What the insurance company will pay is due to the business; only the rest is a loss of the year.'
            : 'Nothing will be recovered, so the whole cost is a loss of the year.'
      }`;
    case 'commission':
      return 'The manager earns a share of the profit of the year: an expense of the business, still owed on 31 March. It is worked out last, on the net profit after every other adjustment.';
  }
}

export interface AdjustmentStory {
  /** What the adjustment is and why it is made: two sentences. */
  text: string;
  /** Its effects, each with where it lands. */
  effects: string[];
  /** What the two effects did to the profit, the capital and the Balance Sheet. */
  result: string;
}

/** One adjustment in the walk-through: what it is, its effects, and what they did. `made` is every adjustment made with it. */
export function adjustmentStory(b: Business, a: Adjustment, before: Statements, after: Statements, made: readonly Adjustment[]): AdjustmentStory {
  const changes = changeWords(before, after);
  const first = changes.length > 0 ? `${andList(changes)}.` : '';
  const working =
    a.type === 'commission' && after.commission
      ? ` The net profit before it is ${inr(after.commission.profit)}: ${inr(after.commission.profit)} × ${a.rate}/${a.basis === 'after' ? 100 + a.rate : 100} = ${inr(after.commission.amount)}${(after.commission.profit * a.rate) % ((a.basis === 'after' ? 100 + a.rate : 100) * 100) === 0 ? '' : ', to the nearest rupee'}.`
      : '';
  return {
    text: `${adjustmentText(b, a)} ${adjustmentWhy(a)}${working}`,
    effects: effectsOf(b, a, made).map((e) => `${SPOT_NAMES[e.spot]}: ${e.text}`),
    result: `${first ? `${first.charAt(0).toUpperCase()}${first.slice(1)} ` : ''}${stillAgrees(before, after)}`,
  };
}

/** Part two: the finished accounts of part one, then each adjustment of the year with its two effects. */
export function partTwo(b: Business): WalkStep[] {
  let applied: Adjustment[] = closingStockOf(b);
  const start = finalAccounts(b, fullState(b, applied));
  const steps: WalkStep[] = [
    {
      title: 'The accounts before the adjustments',
      text: `These are the final accounts of part one: a ${result('gross', start.gross ?? 0)} and a ${result('net', start.net ?? 0)}, and a Balance Sheet that agrees at ${inr(start.bs.assets.total)}. Now the adjustments, one at a time: watch where each one lands, and the Balance Sheet after it.`,
      state: fullState(b, applied),
    },
  ];
  for (const a of b.adjustments.filter((x) => x.type !== 'closingStock')) {
    const before = finalAccounts(b, fullState(b, applied));
    applied = [...applied, a];
    const after = finalAccounts(b, fullState(b, applied));
    steps.push({ title: adjustmentTitle(a), ...adjustmentStory(b, a, before, after, applied), state: fullState(b, applied) });
  }
  const end = finalAccounts(b, fullState(b, applied));
  steps.push({
    title: 'Every adjustment, two effects',
    text: `After ${steps.length - 1} adjustments: a ${result('gross', end.gross ?? 0)}, a ${result('net', end.net ?? 0)}, and the Balance Sheet still agrees, at ${inr(end.bs.assets.total)}. Each adjustment was entered in two places (a loss by fire with an insurance claim, in three), like the debit and the credit of every entry in the books: that is why the two sides never parted.`,
    state: fullState(b, applied),
  });
  return steps;
}

/** The key of every adjustment of the business, for the cards beside the trial balance. */
export const adjustmentKeys = (b: Business): string[] => b.adjustments.map(adjKey);
