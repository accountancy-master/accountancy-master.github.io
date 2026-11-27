import { rupees } from '@/engine/money';
import type { Effect, JournalLine, Paise, SimTransaction } from '../types';

// Small helpers for writing transactions of a scene by hand.

export const dr = (accountId: string, amount: Paise): JournalLine => ({ accountId, side: 'Dr', amount });
export const cr = (accountId: string, amount: Paise): JournalLine => ({ accountId, side: 'Cr', amount });
export const r = rupees;

/** An effect in rupees: the change in assets, liabilities and capital. */
export const fx = (assets: number, liabilities: number, capital: number): Effect => ({ assets: rupees(assets), liabilities: rupees(liabilities), capital: rupees(capital) });

/** A transaction of a scene's own list: its id is `s.<name>`. */
export function tx(name: string, kind: string, text: string, lines: JournalLine[], extra: Partial<Omit<SimTransaction, 'id' | 'kind' | 'text' | 'lines'>> = {}): SimTransaction {
  return { id: `s.${name}`, kind, text, lines, ...extra };
}
