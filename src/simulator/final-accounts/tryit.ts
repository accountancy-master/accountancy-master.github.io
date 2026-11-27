import { formatINR, rupees, type Paise } from '@/engine/money';
import { createRng, type Rng } from '@/engine/rng';
import {
  accruedName,
  adjustmentText,
  adjustmentTitle,
  advanceName,
  balanceOf,
  badDebtsChargeOf,
  CLAIM,
  commissionIn,
  commissionOn,
  COMMISSION_OWED,
  depreciationOf,
  destinationOf,
  discountBaseOf,
  discountOf,
  finalAccounts,
  fullState,
  hasItem,
  interestOnCapitalOf,
  ITEMS,
  newProvisionOf,
  outstandingName,
  prepaidName,
  SPOT_NAMES,
  sideOfItem,
  toRupee,
  type Adjustment,
  type Business,
  type FaState,
  type ItemId,
  type Spot,
} from './model';
import { closingStockOf } from './walk';

// ---------------------------------------------------------------------------------------------------------------
// "Try it": quick questions answered on the picture, with instant feedback and the reason. Nothing is recorded.
// Three kinds: where a balance of the trial balance goes, the effects of an adjustment, and the gross or net
// profit after a change. Each question carries the state the picture shows while it is asked, and after.
// ---------------------------------------------------------------------------------------------------------------

const inr = formatINR;

export interface WhereQuestion {
  kind: 'where';
  id: string;
  item: ItemId;
  prompt: string;
  answer: Spot;
  reason: string;
  /** The picture while asked (the balance not yet placed) and once answered. */
  before: FaState;
  after: FaState;
}

export interface EffectOption {
  id: string;
  text: string;
  right: boolean;
  /** For a wrong option: the mistake behind it. */
  why?: string;
}

export interface EffectsQuestion {
  kind: 'effects';
  id: string;
  adjustment: Adjustment;
  prompt: string;
  options: EffectOption[];
  reason: string;
  before: FaState;
  after: FaState;
}

export interface FigureQuestion {
  kind: 'figure';
  id: string;
  level: 'gross' | 'net';
  prompt: string;
  /** Negative for a loss. */
  answer: Paise;
  working: string[];
  /** Wrong figures a student is likely to give, with the mistake behind each. */
  mistakes: { value: Paise; why: string }[];
  before: FaState;
  after: FaState;
}

export type TryQuestion = WhereQuestion | EffectsQuestion | FigureQuestion;

// ---- where does this balance go ----

/** The traps of placing a balance: the wrong place a student is likely to choose, and why it is wrong. */
const WHERE_TRAPS: Partial<Record<ItemId, Partial<Record<Spot, string>>>> = {
  purchasesReturn: { 'trading-cr': 'It is a credit balance, but the board deducts it from Purchases on the debit side; shown on the credit side the gross profit is the same, but the format is not.' },
  salesReturn: { 'trading-dr': 'It is a debit balance, but the board deducts it from Sales on the credit side.' },
  carriageOutwards: { 'trading-dr': '"Carriage" is not enough: carriage outwards is paid to deliver goods already sold, a selling expense.' },
  drawings: { 'pl-dr': 'Drawings are not an expense of the business: the proprietor took the money out, so they reduce capital.', 'bs-assets': 'Drawings are not something the business owns: they reduce capital.' },
  provision: { 'bs-liabilities': 'A provision for doubtful debts is not owed to anyone: it is deducted from the debtors it is made for.' },
  bankOverdraft: { 'bs-assets': 'An overdraft is money the business owes the bank, not money it has there.' },
  openingStock: { 'bs-assets': 'The opening stock went into the cost of the goods; the stock on the Balance Sheet is the closing stock.' },
  badDebts: { 'bs-assets': 'These debts are already written off: they are a loss of the year, not an asset.' },
};

export function markWhere(q: WhereQuestion, chosen: Spot): { right: boolean; why: string } {
  if (chosen === q.answer) return { right: true, why: q.reason };
  const trap = WHERE_TRAPS[q.item]?.[chosen];
  return { right: false, why: `${trap ? `${trap} ` : ''}${q.reason}` };
}

function whereQuestion(b: Business, item: ItemId, n: number): WhereQuestion {
  const all = fullState(b, closingStockOf(b));
  const placed = new Set(all.placed);
  placed.delete(item);
  const d = destinationOf(item);
  return {
    kind: 'where',
    id: `where-${item}-${n}`,
    item,
    prompt: `Where does ${ITEMS[item].label}, ${inr(balanceOf(b, item))} (${sideOfItem(item) === 'Dr' ? 'a debit' : 'a credit'} balance in the trial balance), go?`,
    answer: d.spot,
    reason: `${ITEMS[item].why}${d.how === 'a row of its own' ? '' : ` In the format: ${SPOT_NAMES[d.spot]}, ${d.how}.`}`,
    before: { ...all, placed, closeTrading: false, closePL: false },
    after: all,
  };
}

// ---- the two effects of an adjustment ----

/** The right effects (two, or three) and the likely wrong ones of an adjustment on these books, made with `made`. */
function effectOptions(b: Business, a: Adjustment, made: readonly Adjustment[]): { right: string[]; wrong: [string, string][] } {
  const L = (id: ItemId) => ITEMS[id].label;
  const accountOf = (id: ItemId) => (ITEMS[id].kind === 'directExpense' ? 'Trading Account' : 'Profit and Loss Account');
  switch (a.type) {
    case 'closingStock':
      return {
        right: [`Credit side of the Trading Account: By Closing Stock ${inr(a.amount)}`, `Assets side of the Balance Sheet: Closing Stock ${inr(a.amount)}`],
        wrong: [
          [`Debit side of the Trading Account, beside the opening stock`, 'That is the place of the opening stock. Goods not sold come out of the cost, so the closing stock is credited.'],
          [`Credit side of the Profit and Loss Account`, 'Stock belongs to the trading of the goods: it is a Trading Account item.'],
          [`Fixed assets in the Balance Sheet`, 'Stock is held for sale, not for use: it is a current asset.'],
          [`Liabilities side of the Balance Sheet`, 'The business owns the unsold goods: they are an asset.'],
        ],
      };
    case 'outstanding': {
      const where = ITEMS[a.item].kind === 'directExpense' ? 'Trading Account' : 'Profit and Loss Account';
      return {
        right: [`Add ${inr(a.amount)} to ${L(a.item)} in the ${where} (debit side)`, `Show ${outstandingName(a.item)} ${inr(a.amount)} as a current liability`],
        wrong: [
          [`Deduct ${inr(a.amount)} from ${L(a.item)}`, 'Deducting is for an amount paid in advance. This one is unpaid but belongs to the year, so the expense is larger.'],
          [`Show ${prepaidName(a.item)} ${inr(a.amount)} as a current asset`, 'Nothing was paid ahead: the amount is still owed, so it is a liability.'],
          [`Deduct ${inr(a.amount)} from capital`, 'The unpaid expense lowers the profit, and so the capital, through the account; it is not taken off capital directly.'],
          [`Credit ${inr(a.amount)} to the Profit and Loss Account`, 'An expense is debited, never credited.'],
        ],
      };
    }
    case 'prepaid':
      return {
        right: [`Deduct ${inr(a.amount)} from ${L(a.item)} in the ${accountOf(a.item)} (debit side)`, `Show ${prepaidName(a.item)} ${inr(a.amount)} as a current asset`],
        wrong: [
          [`Add ${inr(a.amount)} to ${L(a.item)}`, 'Adding is for an unpaid expense. This part was paid for next year, so it is not an expense of this year.'],
          [`Show ${inr(a.amount)} as a current liability`, 'The business owes nothing: it is owed a service still to come, which is an asset.'],
          [`Credit ${inr(a.amount)} to the Profit and Loss Account as an income`, 'Nothing was earned: the expense of the year is smaller, so it is deducted from the expense.'],
          [`Add ${inr(a.amount)} to capital`, 'The prepaid part raises the profit, and so the capital, through the account; it is not added to capital directly.'],
        ],
      };
    case 'accrued':
      return {
        right: [`Add ${inr(a.amount)} to ${L(a.item)} in the Profit and Loss Account (credit side)`, `Show ${accruedName(a.item)} ${inr(a.amount)} as a current asset`],
        wrong: [
          [`Deduct ${inr(a.amount)} from ${L(a.item)}`, 'Deducting is for income received in advance. This income was earned this year, so it is added.'],
          [`Show ${inr(a.amount)} as a current liability`, 'The amount is due to the business, so it is an asset.'],
          [`Debit ${inr(a.amount)} to the Profit and Loss Account`, 'An income is credited, not debited.'],
          [`Leave it out until the cash comes in`, 'Income belongs to the year it is earned, whether or not the cash has come.'],
        ],
      };
    case 'advance':
      return {
        right: [`Deduct ${inr(a.amount)} from ${L(a.item)} in the Profit and Loss Account (credit side)`, `Show ${advanceName(a.item)} ${inr(a.amount)} as a current liability`],
        wrong: [
          [`Add ${inr(a.amount)} to ${L(a.item)}`, 'The cash is in, but the income belongs to the next year, so it is taken out of this year.'],
          [`Show ${inr(a.amount)} as a current asset`, 'The business still owes the service it was paid for: a liability.'],
          [`Keep the whole amount received as income of this year`, 'Only what was earned this year is income of this year.'],
          [`Deduct ${inr(a.amount)} from capital`, 'It lowers the profit through the account; it is not taken off capital directly.'],
        ],
      };
    case 'depreciation': {
      const d = depreciationOf(b, a);
      return {
        right: [`Debit ${inr(d)} to the Profit and Loss Account: Depreciation on ${L(a.item)}`, `Deduct ${inr(d)} from ${L(a.item)} in the Balance Sheet`],
        wrong: [
          [`Show Depreciation ${inr(d)} as a current liability`, 'Depreciation is not owed to anyone: it is a fall in the value of the asset.'],
          [`Credit ${inr(d)} to the Profit and Loss Account`, 'Depreciation is an expense, so it is debited.'],
          [`Add ${inr(d)} to ${L(a.item)}`, 'The asset is worth less, not more.'],
          [`Pay ${inr(d)} out of the bank`, 'Depreciation is a non-cash expense: no money leaves the business.'],
        ],
      };
    }
    case 'badDebts': {
      const n = newProvisionOf(b, a);
      const old = balanceOf(b, 'provision');
      const charge = badDebtsChargeOf(b, a);
      const debtors = balanceOf(b, 'debtors');
      const tbBad = balanceOf(b, 'badDebts');
      const onAll = Math.round((debtors * a.rate) / 100 / 100) * 100;
      return {
        right: [
          charge >= 0
            ? `Debit the Profit and Loss Account with ${inr(charge)}: ${[tbBad ? `bad debts ${inr(tbBad)}` : '', a.further ? `further bad debts ${inr(a.further)}` : '', `new provision ${inr(n)}`].filter(Boolean).join(' + ')}${old ? ` − old provision ${inr(old)}` : ''}`
            : `Credit the Profit and Loss Account with ${inr(-charge)}: the old provision ${inr(old)} less the bad debts and the new provision`,
          a.further ? `Deduct the further bad debts ${inr(a.further)} and the provision ${inr(n)} from Sundry Debtors` : `Deduct the provision ${inr(n)} from Sundry Debtors`,
        ],
        wrong: [
          [`Show the provision ${inr(n)} as a current liability`, 'A provision for doubtful debts is deducted from the debtors; it is not owed to anyone.'],
          ...(a.further && onAll !== n
            ? [[`Make the provision on all the debtors: ${inr(onAll)}`, `The further bad debts are written off first; the provision is on the ${inr(debtors - a.further)} that remain.`] as [string, string]]
            : []),
          ...(old ? [[`Debit the whole new provision ${inr(n)} and leave the old one as it is`, `The old provision of ${inr(old)} is already in the books: only the difference changes the profit.`] as [string, string]] : []),
          ...(tbBad ? [[`Deduct the bad debts of the trial balance, ${inr(tbBad)}, from the debtors again`, 'Those were written off during the year: the debtors are already shown without them.'] as [string, string]] : []),
          [`Credit ${inr(n)} to the Profit and Loss Account as an income`, 'A provision for a likely loss is a charge against the profit, not an income.'],
        ],
      };
    }
    case 'discount': {
      const x = discountOf(b, a, made);
      const base = discountBaseOf(b, made);
      const debtors = balanceOf(b, 'debtors');
      const onAll = Math.round((debtors * a.rate) / 100 / 100) * 100;
      return {
        right: [`Debit ${inr(x)} to the Profit and Loss Account: Provision for Discount on Debtors`, `Deduct ${inr(x)} from Sundry Debtors in the Balance Sheet`],
        wrong: [
          ...(onAll !== x
            ? [
                [
                  `Work it out on all the debtors: ${inr(onAll)}`,
                  `Discount is allowed only to debtors who pay: it is worked out on the ${inr(base)} left after ${made.some((m) => m.type === 'badDebts') ? 'the further bad debts and ' : ''}the provision for doubtful debts.`,
                ] as [string, string],
              ]
            : []),
          [`Show ${inr(x)} as a current liability`, 'A provision on debtors is deducted from the debtors; it is not owed to anyone.'],
          [`Credit ${inr(x)} to the Profit and Loss Account`, 'The discount the business expects to allow is a loss of the year: it is debited.'],
          [`Deduct ${inr(x)} from Sundry Creditors`, 'This discount is allowed by the business to its customers: it is deducted from the debtors, not from what the business owes.'],
        ],
      };
    }
    case 'interestOnCapital': {
      const i = interestOnCapitalOf(b, a);
      return {
        right: [`Debit ${inr(i)} to the Profit and Loss Account: Interest on Capital`, `Add ${inr(i)} to capital in the Balance Sheet`],
        wrong: [
          [`Credit ${inr(i)} to the Profit and Loss Account`, 'The business pays this interest to its proprietor: for the business it is an expense.'],
          [`Deduct ${inr(i)} from capital`, 'The interest is due to the proprietor, so it adds to capital.'],
          [`Show ${inr(i)} as a current liability`, 'It is credited to the proprietor\'s capital, not owed to an outsider.'],
          [`Pay ${inr(i)} out of the bank`, 'No cash moves: the interest is credited to capital.'],
        ],
      };
    }
    case 'goodsTaken':
      return {
        right: [`Deduct ${inr(a.amount)} from purchases in the Trading Account`, `Add ${inr(a.amount)} to drawings: deduct it from capital`],
        wrong: [
          [`Credit ${inr(a.amount)} to the Trading Account as sales`, 'The goods were not sold: they leave purchases at cost.'],
          [`Debit ${inr(a.amount)} to the Profit and Loss Account as an expense`, 'Goods taken by the proprietor are a withdrawal, not an expense of the business.'],
          [`Deduct ${inr(a.amount)} from the closing stock`, 'The stock was counted on the last day and the goods were not in it: it is purchases that were too high.'],
          [`Add ${inr(a.amount)} to capital`, 'The proprietor took value out, so capital falls.'],
        ],
      };
    case 'goodsGiven': {
      const samples = a.to === 'samples';
      return {
        right: [
          `Deduct ${inr(a.amount)} from purchases in the Trading Account`,
          samples
            ? hasItem(b, 'advertisement')
              ? `Add ${inr(a.amount)} to Advertisement in the Profit and Loss Account (debit side)`
              : `Debit ${inr(a.amount)} to the Profit and Loss Account as advertisement`
            : `Debit ${inr(a.amount)} to the Profit and Loss Account: Staff Welfare Expenses`,
        ],
        wrong: [
          [`Credit ${inr(a.amount)} to the Trading Account as sales`, 'The goods were given away, not sold.'],
          [`Add ${inr(a.amount)} to drawings`, `The proprietor did not take them: they were given ${samples ? 'away to promote sales' : 'to the staff'}, for the business.`],
          [`Show ${inr(a.amount)} as a current asset`, 'The goods are gone: the business does not own them any more.'],
          [
            `Debit ${inr(a.amount)} to the Profit and Loss Account and leave purchases as they are`,
            'The cost would then be counted twice: once in purchases and again as an expense. The goods leave purchases.',
          ],
          ...(samples ? [] : [[`Add ${inr(a.amount)} to wages in the Trading Account`, 'Goods given to the staff for their welfare are a cost of running the business, not of making the goods.'] as [string, string]]),
        ],
      };
    }
    case 'abnormalLoss': {
      const claim = Math.min(a.claim, a.amount);
      const loss = a.amount - claim;
      return {
        right: [
          `Deduct ${inr(a.amount)} from purchases in the Trading Account`,
          ...(loss > 0 ? [`Debit ${inr(loss)} to the Profit and Loss Account: Loss by Fire`] : []),
          ...(claim > 0 ? [`Show ${CLAIM} ${inr(claim)} as a current asset`] : []),
        ],
        wrong: [
          ...(claim > 0 && loss > 0
            ? [[`Debit the whole ${inr(a.amount)} to the Profit and Loss Account as Loss by Fire`, `The insurance company will pay ${inr(claim)}: only ${inr(loss)} is lost.`] as [string, string]]
            : []),
          ...(claim > 0 ? [[`Show ${inr(claim)} as a current liability`, 'The insurance company owes the business: the claim is an asset.'] as [string, string]] : []),
          [`Leave the goods in the cost of the goods sold`, 'A fire is not part of normal trading: the goods are taken out of the Trading Account, so that the gross profit shows normal trading.'],
          [`Add ${inr(a.amount)} to drawings`, 'The proprietor did not take the goods: the business lost them.'],
          [`Deduct ${inr(a.amount)} from the closing stock`, 'The stock was counted after the fire, without the burnt goods: their cost is in purchases, so it is purchases that come down.'],
        ],
      };
    }
    case 'commission': {
      const { profit, amount } = commissionIn(b, a, made);
      const other = commissionOn(profit, { rate: a.rate, basis: a.basis === 'after' ? 'before' : 'after' });
      return {
        right: [`Debit ${inr(amount)} to the Profit and Loss Account: Manager's Commission`, `Show ${COMMISSION_OWED} ${inr(amount)} as a current liability`],
        wrong: [
          ...(other !== amount
            ? [
                [
                  `Debit ${inr(other)} to the Profit and Loss Account: Manager's Commission`,
                  a.basis === 'after'
                    ? `That is ${a.rate}% of the profit before the commission. On the profit after charging it, the commission is ${inr(profit)} × ${a.rate}/${100 + a.rate}.`
                    : `That is the commission on the profit after charging it. On the profit before charging it, it is ${inr(profit)} × ${a.rate}/100.`,
                ] as [string, string],
              ]
            : []),
          [`Deduct ${inr(amount)} from capital`, 'The manager is not the proprietor: the commission is an expense of the business, not drawings.'],
          [`Credit ${inr(amount)} to the Profit and Loss Account`, 'The business owes the commission: it is an expense, debited.'],
          [`Show ${inr(amount)} as a current asset`, 'The business owes it to the manager: a liability.'],
        ],
      };
    }
  }
}

/** "two", "three": how many effects a question asks for. */
export const countWord = (n: number): string => ['none', 'one', 'two', 'three', 'four'][n] ?? String(n);

/** How many effects a question asks for: its right options. */
export const effectsWanted = (q: EffectsQuestion): number => q.options.filter((o) => o.right).length;

export function markEffects(q: EffectsQuestion, chosen: readonly string[]): { right: boolean; why: string[] } {
  const picked = q.options.filter((o) => chosen.includes(o.id));
  const wanted = effectsWanted(q);
  const right = picked.length === wanted && picked.every((o) => o.right);
  const why = [
    ...picked.filter((o) => !o.right).map((o) => `"${o.text}": ${o.why}`),
    ...(picked.filter((o) => o.right).length < wanted ? [`The ${countWord(wanted)} effects: ${q.options.filter((o) => o.right).map((o) => o.text).join('; and ')}.`] : []),
    q.reason,
  ];
  return { right, why };
}

/** Why an adjustment has the effects it has, in one sentence. */
function effectsReason(a: Adjustment): string {
  switch (a.type) {
    case 'goodsGiven':
      return 'The goods leave purchases (the Trading Account) and their cost becomes an expense (the Profit and Loss Account): the net profit is the same, and the Balance Sheet does not change.';
    case 'abnormalLoss':
      return 'The goods leave purchases (the Trading Account); the part the insurance company will pay is an asset, and only the rest is a loss in the Profit and Loss Account.';
    default:
      return 'Every adjustment changes the result of the year once (in the Trading or the Profit and Loss Account) and the Balance Sheet once.';
  }
}

/** A key of an adjustment for the id of a question: "goodsGiven-samples", "commission". */
const adjKeyOf = (a: Adjustment): string => (a.type === 'goodsGiven' ? `goodsGiven-${a.to}` : a.type);

function effectsQuestion(b: Business, a: Adjustment, rng: Rng, n: number): EffectsQuestion {
  const base = closingStockOf(b).filter((x) => x !== a);
  const made = a.type === 'closingStock' ? [a] : [...base, a];
  const { right, wrong } = effectOptions(b, a, made);
  const options = rng.shuffle([
    ...right.map((text, i) => ({ id: `r${i}`, text, right: true })),
    ...rng.shuffle(wrong).slice(0, 4).map(([text, why], i) => ({ id: `w${i}`, text, right: false, why })),
  ]);
  const profitFirst = a.type === 'commission' ? ` The net profit before it is ${inr(commissionIn(b, a, made).profit)}.` : a.type === 'discount' ? discountNote(b, made) : '';
  return {
    kind: 'effects',
    id: `effects-${adjKeyOf(a)}-${n}`,
    adjustment: a,
    prompt: `${adjustmentText(b, a)}${profitFirst} Choose its ${countWord(right.length)} effects.`,
    options,
    reason: effectsReason(a),
    before: fullState(b, base),
    after: fullState(b, made),
  };
}

// ---- the figure after a change ----

const LOSS_NOTE = ' (A loss is a profit below nothing: type it with a minus sign.)';

export function markFigure(q: FigureQuestion, value: Paise): { right: boolean; why: string } {
  if (value === q.answer) return { right: true, why: q.working.join(' ') };
  const known = q.mistakes.find((m) => m.value === value);
  return { right: false, why: `${known ? `${known.why} ` : ''}${q.working.join(' ')}` };
}

/** The gross profit when the closing stock is valued at another figure. */
function grossWithStock(b: Business, rng: Rng, n: number): FigureQuestion | null {
  const cs = closingStockOf(b)[0];
  if (!cs || cs.type !== 'closingStock') return null;
  const now = cs.amount + rupees(rng.pick([-10000, -5000, 5000, 10000]));
  if (now <= 0) return null;
  const changed: Adjustment = { type: 'closingStock', amount: now };
  const f = finalAccounts(b, fullState(b, [changed]));
  const g = f.gross ?? 0;
  const debit = f.trading.dr.total - Math.max(0, g);
  const credit = f.trading.cr.total - Math.max(0, -g);
  const state = fullState(b, [changed]);
  return {
    kind: 'figure',
    id: `gross-stock-${n}`,
    level: 'gross',
    prompt: `The closing stock is counted again and valued at ${inr(now)} instead of ${inr(cs.amount)}. What is the gross profit now?${g < 0 || (f.gross ?? 0) - (now - cs.amount) < 0 ? LOSS_NOTE : ''}`,
    answer: g,
    working: [`Debit side: ${inr(debit)}. Credit side: net sales and the closing stock of ${inr(now)}, ${inr(credit)}.`, `Gross ${g >= 0 ? 'profit' : 'loss'} = ${inr(credit)} − ${inr(debit)} = ${inr(Math.abs(g))}.`],
    mistakes: [
      { value: g - (now - cs.amount), why: 'That is the gross profit with the old closing stock.' },
      { value: g - 2 * now, why: 'The closing stock went to the debit side, beside the opening stock.' },
      { value: g - now, why: 'The closing stock was left out of the Trading Account.' },
    ].filter((m) => m.value !== g),
    before: { ...state, closeTrading: false, closePL: false },
    after: state,
  };
}

/** A figure with its sign written out: "₹52,000", "−₹5,000". */
const signed = (x: Paise): string => (x < 0 ? `−${inr(-x)}` : inr(x));

/** The debtors a provision for discount would be made on, said in the prompt (they depend on what is made with it). */
const discountNote = (b: Business, made: readonly Adjustment[]): string =>
  ` The debtors, less ${made.some((x) => x.type === 'badDebts') ? 'the further bad debts and ' : ''}the provision for doubtful debts, stand at ${inr(discountBaseOf(b, made))}.`;

/** How an adjustment's figure is worked out, when a rate or a set of figures is behind it: one sentence of the working. */
function figureWorking(b: Business, a: Adjustment, made: readonly Adjustment[]): string | null {
  switch (a.type) {
    case 'depreciation':
      return `Depreciation = ${inr(balanceOf(b, a.item))} × ${a.rate}%${a.months === 12 ? '' : ` × ${a.months}/12`} = ${inr(depreciationOf(b, a))}.`;
    case 'interestOnCapital':
      return `Interest on capital = ${inr(balanceOf(b, 'capital'))} × ${a.rate}% = ${inr(interestOnCapitalOf(b, a))}.`;
    case 'badDebts': {
      const n = newProvisionOf(b, a);
      const old = balanceOf(b, 'provision');
      const charge = badDebtsChargeOf(b, a) - balanceOf(b, 'badDebts');
      return `New provision = (${inr(balanceOf(b, 'debtors'))} − ${inr(a.further)}) × ${a.rate}% = ${inr(n)}. The charge of the year rises by ${[...(a.further ? [`further bad debts ${inr(a.further)}`] : []), `new provision ${inr(n)}`].join(' + ')}${old ? ` − old provision ${inr(old)}` : ''} = ${signed(charge)}.`;
    }
    case 'discount':
      return `Provision for discount = ${inr(discountBaseOf(b, made))} × ${a.rate}% = ${inr(discountOf(b, a, made))}.`;
    default:
      return null;
  }
}

/** The gross or net profit after one adjustment of the business is made. */
function afterOne(b: Business, a: Adjustment, n: number): FigureQuestion {
  const base = closingStockOf(b);
  const made = [...base, a];
  const before = finalAccounts(b, fullState(b, base));
  const state = fullState(b, made);
  const after = finalAccounts(b, state);
  const level: 'gross' | 'net' = after.gross !== before.gross ? 'gross' : 'net';
  const x0 = (level === 'gross' ? before.gross : before.net) ?? 0;
  const x1 = (level === 'gross' ? after.gross : after.net) ?? 0;
  const d = x1 - x0;
  const name = level === 'gross' ? 'gross profit' : 'net profit';
  const c = a.type === 'commission' && after.commission ? { ...after.commission, rate: a.rate, basis: a.basis } : null;
  const per = c ? (c.basis === 'after' ? 100 + c.rate : 100) : 100;
  const how = figureWorking(b, a, made);
  const likely: { value: Paise; why: string }[] = [];
  if (c)
    likely.push({
      value: x0 - commissionOn(c.profit, { rate: c.rate, basis: c.basis === 'after' ? 'before' : 'after' }),
      why:
        c.basis === 'after'
          ? 'The commission was worked out on the profit before charging it, but it is on the profit after charging it.'
          : 'The commission was worked out on the profit after charging it, but it is on the profit before charging it.',
    });
  if (a.type === 'badDebts') {
    const old = balanceOf(b, 'provision');
    if (old) likely.push({ value: x0 - a.further - newProvisionOf(b, a), why: `The old provision of ${inr(old)} is already in the books: only the difference between the new provision and the old one is charged.` });
    if (a.further)
      likely.push({ value: x0 - a.further - toRupee((balanceOf(b, 'debtors') * a.rate) / 100) + old, why: 'The provision was made on all the debtors; it is made on those left after the further bad debts.' });
  }
  return {
    kind: 'figure',
    id: `${level}-after-${adjKeyOf(a)}-${n}`,
    level,
    prompt: `Before the adjustments the ${level} ${x0 >= 0 ? 'profit' : 'loss'} is ${inr(Math.abs(x0))}. ${adjustmentText(b, a)}${a.type === 'discount' ? discountNote(b, made) : ''} What is the ${name} now?${x0 < 0 || x1 < 0 ? LOSS_NOTE : ''}`,
    answer: x1,
    working: [
      ...(how ? [how] : []),
      c
        ? `Manager's commission = ${inr(c.profit)} × ${c.rate}/${per} = ${inr(c.amount)}${(c.profit * c.rate) % (per * 100) === 0 ? '' : ', to the nearest rupee'}: the net profit falls by it.`
        : `${adjustmentTitle(a)}: the ${name} ${d > 0 ? 'rises' : d < 0 ? 'falls' : 'does not change'}${d !== 0 ? ` by ${inr(Math.abs(d))}` : ''}.`,
      `${signed(x0)} ${d >= 0 ? '+' : '−'} ${inr(Math.abs(d))} = ${signed(x1)}.`,
    ],
    mistakes: [
      { value: x0, why: 'That is the figure before the adjustment: it changes the result of the year.' },
      { value: x0 - d, why: `The adjustment was taken the wrong way: it ${d > 0 ? 'raises' : 'lowers'} the ${name}.` },
      ...likely,
    ].filter((m, i, xs) => m.value !== x1 && xs.findIndex((y) => y.value === m.value) === i),
    // While it is asked the figure is not on the picture; nor is the commission, which is what the question works out.
    before: c ? { ...fullState(b, base), closePL: false } : { ...state, closeTrading: level === 'net', closePL: false },
    after: state,
  };
}

/** A round of six questions: two of each kind, mixed, from a seed. */
export function tryRound(b: Business, seed: number): TryQuestion[] {
  const rng = createRng(seed);
  const items = rng.shuffle(b.tb.map((l) => l.id));
  const adjs = rng.shuffle(b.adjustments);
  const where = items.slice(0, 2).map((id, i) => whereQuestion(b, id, seed * 10 + i));
  const effects = adjs.slice(0, 2).map((a, i) => effectsQuestion(b, a, rng, seed * 10 + i));
  const figures: FigureQuestion[] = [];
  const gross = grossWithStock(b, rng, seed);
  if (gross) figures.push(gross);
  for (const a of adjs.filter((x) => x.type !== 'closingStock')) {
    if (figures.length >= 2) break;
    const q = afterOne(b, a, seed);
    // An adjustment that moves the figure asked (every one on these books does; the check keeps a zero rate out).
    if (q.mistakes.some((m) => m.value !== q.answer && m.why.startsWith('That is the figure before'))) figures.push(q);
  }
  const round: TryQuestion[] = [];
  for (let i = 0; i < 2; i++) {
    if (where[i]) round.push(where[i]);
    if (effects[i]) round.push(effects[i]);
    if (figures[i]) round.push(figures[i]);
  }
  return round;
}

/** Reads a typed amount in rupees ("1,03,000", "-5000", "(5,000)"): paise, or null when it is not a whole number of rupees. */
export function parseRupees(text: string): Paise | null {
  const t = text.replace(/[₹,\s]/g, '').replace(/^\((.*)\)$/, '-$1').replace(/^−/, '-');
  if (!/^-?\d{1,9}$/.test(t)) return null;
  return rupees(Number(t));
}
