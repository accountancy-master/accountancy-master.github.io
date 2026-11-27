import type { Difficulty } from '@/content/types';
import { formatINR } from '@/engine/money';
import { createRng } from '@/engine/rng';
import { simLabel } from './accounts';
import type { Effect, Paise, SimTransaction } from './types';

// ---------------------------------------------------------------------------------------------------------------
// Predict mode: before the animation the student says, for each side of the equation, whether it goes up, down or
// stays; at the middle level also by how much, and at the top level which accounts are debited and credited. The
// animation then shows the truth and the prediction is marked here.
// ---------------------------------------------------------------------------------------------------------------

export type Direction = 'up' | 'down' | 'same';
export const SIDES = ['assets', 'liabilities', 'capital'] as const;
export type SideKey = (typeof SIDES)[number];

export type PredictLevel = 'directions' | 'amounts' | 'accounts';
export const PREDICT_LEVELS: readonly { id: PredictLevel; label: string; detail: string }[] = [
  { id: 'directions', label: 'Which way', detail: 'Up, down or no change for each side' },
  { id: 'amounts', label: 'By how much', detail: 'The direction and the amount' },
  { id: 'accounts', label: 'The entry too', detail: 'The amounts, and the accounts debited and credited' },
];
/** The difficulty an attempt at each level is recorded with (and so the XP it earns). */
export const LEVEL_DIFFICULTY: Record<PredictLevel, Difficulty> = { directions: 'easy', amounts: 'medium', accounts: 'complex' };

export interface Prediction {
  directions: Partial<Record<SideKey, Direction>>;
  /** At the 'amounts' and 'accounts' levels: the amount of each side's change, in paise (nothing for "no change"). */
  amounts?: Partial<Record<SideKey, Paise | null>>;
  /** At the 'accounts' level. */
  debited?: string[];
  credited?: string[];
}

export const directionOf = (v: Paise): Direction => (v > 0 ? 'up' : v < 0 ? 'down' : 'same');

export interface SideMark {
  side: SideKey;
  expected: Direction;
  expectedAmount: Paise;
  given: Direction | undefined;
  givenAmount: Paise | null | undefined;
  right: boolean;
}

export interface Marked {
  correct: boolean;
  sides: SideMark[];
  accounts: { debited: string[]; credited: string[]; right: boolean } | null;
  /** The named mistake behind a wrong prediction, where it is one the transaction expects. */
  mistake: string | null;
  /** The trap whose effect the student gave, if any: its index among the transaction's traps. */
  trap: number | null;
}

/** True when every side has a direction (and, where the level asks, an amount for every side that moves). */
export function isComplete(p: Prediction, level: PredictLevel): boolean {
  if (!SIDES.every((s) => p.directions[s] !== undefined)) return false;
  if (level === 'directions') return true;
  const amountsIn = SIDES.every((s) => p.directions[s] === 'same' || (p.amounts?.[s] ?? null) !== null);
  if (!amountsIn) return false;
  return level === 'amounts' || ((p.debited?.length ?? 0) > 0 && (p.credited?.length ?? 0) > 0);
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
const unique = (ids: string[]) => [...new Set(ids)];

/** The accounts of the entry on each side. */
export function entryAccounts(tx: SimTransaction): { debited: string[]; credited: string[] } {
  return {
    debited: unique(tx.lines.filter((l) => l.side === 'Dr').map((l) => l.accountId)),
    credited: unique(tx.lines.filter((l) => l.side === 'Cr').map((l) => l.accountId)),
  };
}

export function markPrediction(tx: SimTransaction, effect: Effect, p: Prediction, level: PredictLevel): Marked {
  const sides = SIDES.map((side): SideMark => {
    const expectedAmount = Math.abs(effect[side]);
    const expected = directionOf(effect[side]);
    const given = p.directions[side];
    const givenAmount = p.amounts?.[side];
    const amountRight = level === 'directions' || expected === 'same' || givenAmount === expectedAmount;
    return { side, expected, expectedAmount, given, givenAmount, right: given === expected && amountRight };
  });
  let accounts: Marked['accounts'] = null;
  if (level === 'accounts') {
    const want = entryAccounts(tx);
    accounts = { ...want, right: sameSet(p.debited ?? [], want.debited) && sameSet(p.credited ?? [], want.credited) };
  }
  const correct = sides.every((s) => s.right) && (accounts?.right ?? true);
  // A wrong prediction that matches a trap of the transaction in its directions is that trap's mistake.
  const trap = correct ? -1 : (tx.traps ?? []).findIndex((t) => SIDES.every((s) => directionOf(t.effect[s]) === p.directions[s]));
  return {
    correct,
    sides,
    accounts,
    mistake: trap >= 0 ? tx.traps![trap].why : null,
    trap: trap >= 0 ? trap : null,
  };
}

const SIDE_WORD: Record<SideKey, string> = { assets: 'Assets', liabilities: 'Liabilities', capital: 'Capital' };
const DIRECTION_WORD: Record<Direction, string> = { up: 'go up', down: 'go down', same: 'stay the same' };

/** What was wrong with a prediction, side by side, in words. */
export function markWords(m: Marked): string[] {
  const out: string[] = [];
  for (const s of m.sides) {
    if (s.right) continue;
    const by = s.expected === 'same' ? '' : ` by ${formatINR(s.expectedAmount)}`;
    out.push(`${SIDE_WORD[s.side]} should ${DIRECTION_WORD[s.expected]}${by}.`);
  }
  if (m.accounts && !m.accounts.right) {
    out.push(`Debited: ${m.accounts.debited.map(simLabel).join(', ')}. Credited: ${m.accounts.credited.map(simLabel).join(', ')}.`);
  }
  return out;
}

/** Accounts often confused in an entry: the pool the choices of the top level are filled from. */
const POOL = ['cash', 'bank', 'capital', 'drawings', 'purchases', 'sales', 'rent', 'salaries', 'commissionReceived', 'furniture', 'machinery', 'bankLoan', 'outstandingSalaries', 'depreciation', 'badDebts', 'discountReceived'];

/** The accounts offered at the top level: those of the entry and four others, in an order drawn from the transaction id. */
export function accountChoices(tx: SimTransaction): string[] {
  const own = unique(tx.lines.map((l) => l.accountId));
  let h = 0;
  for (const ch of tx.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rng = createRng(h);
  const others = rng.shuffle(POOL.filter((id) => !own.includes(id))).slice(0, Math.max(4, 8 - own.length));
  return rng.shuffle([...own, ...others]);
}
