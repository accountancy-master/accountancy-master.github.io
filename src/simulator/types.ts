import type { Side } from '@/engine/accounts';
import type { JournalLine } from '@/engine/journal';
import type { Paise } from '@/engine/money';

export type { JournalLine, Paise, Side };

/**
 * One transaction the simulator plays: what happened, in words, and the entry as it is journalised. The movements the
 * screen animates are worked out from the entry (engine.ts), so what moves is always what the journal says.
 */
export interface SimTransaction {
  /** Stable for the same transaction: `s.<id>` for one of a scene's own list, `m.<seed>` or `j.<template>.<seed>` for one of a generator. */
  id: string;
  /** What happened, as a sentence: "The proprietor started the business with ₹2,00,000 in cash." */
  text: string;
  /** The entry, as it is journalised. */
  lines: JournalLine[];
  /** The narration under the entry, without "Being" and the brackets: "capital brought in". */
  narration?: string;
  /**
   * Goods sold whose cost is known: the cost at which they leave stock. The journal records the sale at its price
   * (Sales A/c); the equation also shows the goods leaving stock at cost, so that capital rises only by the profit.
   */
  costOfSale?: Paise;
  /** The reason in one or two sentences, said before the movements are explained. */
  why?: string;
  /** Wrong effects a student is likely to give, each with the mistake behind it: the wrong choices of a prediction. */
  traps?: { effect: Effect; why: string }[];
  /** A short name of the kind of transaction: "Capital introduced", "Expense outstanding". */
  kind?: string;
}

/** The change a transaction makes to each side of the equation, in paise: assets, liabilities and capital. */
export interface Effect {
  assets: Paise;
  liabilities: Paise;
  capital: Paise;
}

/** Ledger balances: debits less credits by account id, so that a debit balance is positive and a credit one negative. */
export type Balances = Readonly<Record<string, Paise>>;

/** Where a coin of a movement starts or ends: a band of a container, a container as a whole, or outside the business. */
export type Spot = { container: string; band: string } | 'outside';

/** What one step of a transaction does, by the way value moves. */
export type StepKind =
  /** Value comes into an asset and a claim on it (capital, an income, a liability) rises with it. */
  | 'inflow'
  /** Value leaves an asset and a claim falls with it (an expense, drawings, a liability paid). */
  | 'outflow'
  /** One asset turns into another (or one liability replaces another): the totals stay as they were. */
  | 'exchange'
  /** A claim moves between liabilities and capital (an expense left unpaid, a creditor paid by the proprietor). */
  | 'shift'
  /** One side of an entry posted alone: the equation no longer holds. */
  | 'oneSided'
  /** The difference of the trial balance put in Suspense A/c until the error is found. */
  | 'suspense';

export interface Move {
  from: Spot;
  to: Spot;
}

/** The change of one band in a step. */
export interface BandChange {
  container: string;
  band: string;
  /** Change in what the band shows, positive when it grows. */
  delta: Paise;
}

/** The totals of the containers, and whether the equation holds. */
export interface Totals {
  /** What each container shows, by container id. */
  containers: Record<string, Paise>;
  /** The left side (assets, with a debit Suspense) and the right side (liabilities and capital, with a credit Suspense). */
  left: Paise;
  right: Paise;
  balanced: boolean;
  /** The balance of Suspense A/c and the side it stands on, or null when it has none. */
  suspense: { side: 'left' | 'right'; amount: Paise } | null;
}

export interface SimStep {
  kind: StepKind;
  amount: Paise;
  /** The lines this step posts. A step of the equation alone (the cost of goods sold) posts lines the journal does not show. */
  lines: JournalLine[];
  /** True for a step the journal does not record: the goods of a sale leaving stock at cost. */
  equationOnly?: true;
  moves: Move[];
  changes: BandChange[];
  /** What happened in this step, in words. */
  text: string;
  /** The books after the step. */
  balances: Balances;
  totals: Totals;
}

/** A transaction played on a set of books: every step, and the books before and after. */
export interface Played {
  transaction: SimTransaction;
  before: Balances;
  after: Balances;
  steps: SimStep[];
  /** The change in assets, liabilities and capital over the whole transaction (Suspense apart). */
  effect: Effect;
  /** Each container's change, by id. */
  containerChanges: Record<string, Paise>;
}
