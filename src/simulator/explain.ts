import { formatINR } from '@/engine/money';
import { explainSimLine, simLabel } from './accounts';
import { totalsOf } from './engine';
import type { Scene } from './scenes';
import type { Balances, Effect, JournalLine, Paise, Played, Totals } from './types';

// ---------------------------------------------------------------------------------------------------------------
// The words of the simulator: what moved, why each side moved, the journal entry and the ledger accounts. Every
// animation has these as its text equivalent, so a screen reader hears what a sighted learner sees.
// ---------------------------------------------------------------------------------------------------------------

const f = formatINR;

/** A signed amount: "+₹5,000", "−₹5,000", "₹0". */
export const signed = (v: Paise): string => (v === 0 ? '₹0' : `${v > 0 ? '+' : '−'}${f(Math.abs(v))}`);

/** "Assets ₹2,85,000 = Liabilities ₹85,000 + Capital ₹2,00,000", with Suspense where it stands, and whether it holds. */
export function equationLine(scene: Scene, totals: Totals): string {
  const name = (id: string) => scene.containers.find((c) => c.id === id)?.title ?? id;
  const side = (ids: readonly string[], which: 'left' | 'right') => {
    const parts = ids.map((id) => `${name(id)} ${f(totals.containers[id] ?? 0)}`);
    if (totals.suspense?.side === which) parts.push(`Suspense ${f(totals.suspense.amount)}`);
    return parts.join(' + ');
  };
  const sign = totals.balanced ? '=' : '≠';
  return `${side(scene.equation.left, 'left')} ${sign} ${side(scene.equation.right, 'right')}`;
}

/** Whether the books balance, in words. */
export function balanceWords(totals: Totals): string {
  if (!totals.balanced) return `Not balanced: the two sides differ by ${f(Math.abs(totals.left - totals.right))}.`;
  if (totals.suspense) return 'Balanced, but only with Suspense A/c: an error is still waiting to be found.';
  return 'Balanced.';
}

/** The change of one container in words: "Assets rise by ₹3,000: Cash +₹15,000, Stock −₹12,000." */
export function containerChangeWords(scene: Scene, played: Played, containerId: string): string {
  const c = scene.containers.find((x) => x.id === containerId);
  if (!c) return '';
  const delta = played.containerChanges[containerId] ?? 0;
  const bands = new Map<string, Paise>();
  for (const s of played.steps) for (const ch of s.changes) if (ch.container === containerId) bands.set(ch.band, (bands.get(ch.band) ?? 0) + ch.delta);
  const parts = [...bands].filter(([, d]) => d !== 0).map(([id, d]) => `${scene.bands.find((b) => b.id === id)?.label ?? id} ${signed(d)}`);
  // "Assets rise", "Capital rises".
  const many = /s$/.test(c.title) && c.title !== 'Suspense';
  if (delta === 0) return parts.length > 0 ? `${c.title} ${many ? 'stay' : 'stays'} at the same total: ${parts.join(', ')}.` : `${c.title} ${many ? 'do' : 'does'} not change.`;
  return `${c.title} ${delta > 0 ? (many ? 'rise' : 'rises') : many ? 'fall' : 'falls'} by ${f(Math.abs(delta))}${parts.length > 0 ? `: ${parts.join(', ')}` : ''}.`;
}

/** The entry with its debits first, as a journal shows it. */
export const entryOrder = (lines: readonly JournalLine[]): JournalLine[] => [...lines].sort((a, b) => (a.side === b.side ? 0 : a.side === 'Dr' ? -1 : 1));

/** The entry in words, line by line: "Cash A/c Dr ₹5,000", "To Capital A/c ₹5,000". */
export function entryWords(lines: readonly JournalLine[]): string[] {
  return entryOrder(lines).map((l) => (l.side === 'Dr' ? `${simLabel(l.accountId)} Dr ${f(l.amount)}` : `To ${simLabel(l.accountId)} ${f(l.amount)}`));
}

export interface Explanation {
  happened: string;
  why: string | null;
  /** One sentence for each container of the equation (and Suspense, where it moved). */
  sides: string[];
  /** One sentence for each step, in order. */
  steps: string[];
  entry: JournalLine[];
  narration: string | null;
  /** Why each account is debited or credited. */
  ledger: string[];
  /** For a sale whose cost is known: how the equation shows it beside the journal. */
  costNote: string | null;
  equation: string;
  balance: string;
}

export function explainPlayed(scene: Scene, played: Played): Explanation {
  const tx = played.transaction;
  const containers = [...scene.equation.left, ...scene.equation.right, ...scene.containers.filter((c) => c.side === 'either').map((c) => c.id)];
  const sides = containers.filter((id) => scene.containers.some((c) => c.id === id && (c.side !== 'either' || played.containerChanges[id] !== 0))).map((id) => containerChangeWords(scene, played, id));
  const totals = totalsOf(scene, played.after);
  const journal = tx.lines;
  return {
    happened: tx.text,
    why: tx.why ?? null,
    sides,
    steps: played.steps.map((s) => s.text),
    entry: entryOrder(journal),
    narration: tx.narration ?? null,
    ledger: entryOrder(journal).map(explainSimLine),
    costNote: tx.costOfSale
      ? `The journal records the sale at its price (Sales A/c is credited with ${f(salePrice(tx.lines))}). In the equation the goods also leave stock at their cost of ${f(tx.costOfSale)}, so ${profitWords(tx.lines, tx.costOfSale)}.`
      : null,
    equation: equationLine(scene, totals),
    balance: balanceWords(totals),
  };
}

const salePrice = (lines: readonly JournalLine[]): Paise => lines.filter((l) => l.accountId === 'sales' && l.side === 'Cr').reduce((s, l) => s + l.amount, 0);

function profitWords(lines: readonly JournalLine[], cost: Paise): string {
  const diff = salePrice(lines) - cost;
  if (diff > 0) return `capital rises only by the profit of ${f(diff)}`;
  if (diff < 0) return `capital falls by the loss of ${f(-diff)}`;
  return 'capital does not change: there is no profit and no loss';
}

/** What a step says to a screen reader once it has played: what moved, and the new totals. */
export function stepAnnouncement(scene: Scene, text: string, totals: Totals): string {
  return `${text} Now ${equationLine(scene, totals)}. ${balanceWords(totals)}`;
}

/** An effect in words, as an option of a question: "Assets increase by ₹5,000, liabilities unchanged, capital increases by ₹5,000". */
export function describeEffect(e: Effect): string {
  if (e.assets === 0 && e.liabilities === 0 && e.capital === 0) return 'Assets, liabilities and capital all unchanged';
  const clause = (word: string, v: Paise, s = '') => (v === 0 ? `${word} unchanged` : `${word} ${v > 0 ? 'increase' : 'decrease'}${s} by ${f(Math.abs(v))}`);
  return `${clause('Assets', e.assets)}, ${clause('liabilities', e.liabilities)}, ${clause('capital', e.capital, 's')}`;
}

/** The books of a scene in words, container by container. */
export function booksWords(scene: Scene, balances: Balances): string {
  return equationLine(scene, totalsOf(scene, balances));
}
