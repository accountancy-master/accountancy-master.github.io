// ---------------------------------------------------------------------------------------------------------------
// "Try it" questions of the lab "trial-balance-scale", answered on the scale with instant feedback, nothing recorded:
//  - tip: will this error tip the scale, and which pan goes down;
//  - suspense: which pan Suspense goes on, and for how much;
//  - entry: the rectifying entry once the trial balance has been prepared;
//  - class: the class of the error.
// ---------------------------------------------------------------------------------------------------------------

import type { Side } from '@/engine/accounts';
import type { JournalLine } from '@/engine/journal';
import { formatINR, type Paise } from '@/engine/money';
import { createRng, type Rng } from '@/engine/rng';
import {
  booksFromSeed,
  entryText,
  ERRORS,
  gapOf,
  isOneSided,
  problemOf,
  rectifyingEntry,
  suspenseOf,
  type ErrorCase,
  type ErrorClass,
  type ScaleBooks,
  type Tilt,
} from './scale';

export type ScaleTryKind = 'tip' | 'suspense' | 'entry' | 'class';
export const SCALE_TRY_KINDS: readonly ScaleTryKind[] = ['tip', 'suspense', 'entry', 'class'];

export interface Feedback {
  right: boolean;
  message: string;
}

export interface ScaleQuestion {
  kind: ScaleTryKind;
  books: ScaleBooks;
  error: ErrorCase;
  /** For `entry`: the entries offered, each with the slip it stands for (null for the right one). */
  entries: { lines: JournalLine[]; why: string | null }[];
}

const f = formatINR;
const sideName = (s: Side) => (s === 'Dr' ? 'debit' : 'credit');

/** An error that suits the books, from the rng; one-sided only when asked. */
function errorFor(rng: Rng, books: ScaleBooks, oneSided: boolean): ErrorCase {
  for (;;) {
    const spec = rng.pick(ERRORS);
    const input = spec.sample(rng, books);
    const e = spec.make(books, input);
    if (problemOf(books, e, input) === null && (!oneSided || isOneSided(e))) return e;
  }
}

const flip = (l: JournalLine): JournalLine => ({ ...l, side: l.side === 'Dr' ? 'Cr' : 'Dr' });
const debitsFirst = (ls: JournalLine[]): JournalLine[] => [...ls.filter((l) => l.side === 'Dr'), ...ls.filter((l) => l.side === 'Cr')];

/** The rectifying entry and three wrong ones, each a slip students make. */
export function entryChoices(e: ErrorCase, rng: Rng): ScaleQuestion['entries'] {
  const right = rectifyingEntry(e);
  const wrong: { lines: JournalLine[]; why: string }[] = [
    { lines: debitsFirst(right.map(flip)), why: 'Reversed the entry: it would double the error instead of removing it.' },
  ];
  const suspense = right.find((l) => l.accountId === 'suspense');
  if (suspense) {
    wrong.push({
      lines: debitsFirst(right.map((l) => (l === suspense ? { ...l, accountId: 'cash' } : l))),
      why: 'Brought Cash A/c in; no cash is received or paid when an error is rectified. The other side is Suspense A/c, which holds the difference.',
    });
    if (e.id === 'wrong-side') {
      wrong.push({
        lines: right.map((l) => ({ ...l, amount: l.amount / 2 })),
        why: 'Corrected the amount once. A posting on the wrong side has to come off that side and go on the other: twice the amount.',
      });
    }
    const real = right.find((r) => r.accountId !== 'suspense')!;
    const full = e.should.find((l) => l.accountId === real.accountId)?.amount;
    // (For a wrong side the whole figure is the amount counted once, named above.)
    if (full !== undefined && full !== real.amount && e.id !== 'wrong-side') {
      wrong.push({
        lines: right.map((l) => ({ ...l, amount: full })),
        why: `Used the whole figure, ${formatINR(full)}, instead of the difference the error made, ${formatINR(real.amount)}.`,
      });
    }
    const original = e.should.filter((l) => l.accountId !== real.accountId);
    if (original.length === 1) {
      wrong.push({
        lines: debitsFirst(right.map((l) => (l === suspense ? { ...l, accountId: original[0].accountId } : l))),
        why: `Used ${original[0].accountId === 'sales' ? 'Sales A/c' : 'the other account of the transaction'}, which was recorded correctly. The difference is in Suspense A/c, and the entry clears it.`,
      });
    }
  } else {
    const [a, b] = right;
    wrong.push({
      lines: [a, { ...b, accountId: 'suspense' }],
      why: 'Used Suspense A/c. This error left the totals equal, so no Suspense A/c was opened and there is nothing in it to clear.',
    });
    wrong.push({
      lines: [{ ...a, accountId: 'suspense' }, b],
      why: 'Used Suspense A/c. This error left the totals equal, so no Suspense A/c was opened and there is nothing in it to clear.',
    });
    if (e.should.length === 2) wrong.push({ lines: debitsFirst(e.should), why: 'Passed the original entry again instead of correcting what was wrong.' });
  }
  const seen = new Set([entryText(right)]);
  const picked = rng.shuffle(wrong).filter((w) => {
    const t = entryText(w.lines);
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  });
  return rng.shuffle([{ lines: right, why: null }, ...picked.slice(0, 3)]);
}

export function makeScaleQuestion(seed: number, kind: ScaleTryKind): ScaleQuestion {
  const rng = createRng(seed * 613 + SCALE_TRY_KINDS.indexOf(kind));
  const books = booksFromSeed(seed);
  const error = errorFor(rng, books, kind === 'suspense' || (kind === 'entry' && rng.next() < 0.6));
  return { kind, books, error, entries: kind === 'entry' ? entryChoices(error, rng) : [] };
}

export function checkTip(q: ScaleQuestion, answer: Tilt): Feedback {
  const g = gapOf(q.error);
  const truth: Tilt = g === 0 ? 'level' : g > 0 ? 'Dr' : 'Cr';
  const why =
    truth === 'level'
      ? 'The accounts it leaves wrong are wrong by amounts that cancel (or both pans change alike), so the debit and credit totals stay equal: the trial balance agrees.'
      : `It leaves one account wrong, so the ${sideName(truth)} total is larger by ${f(Math.abs(g))}: the ${sideName(truth)} pan goes down and the trial balance does not agree.`;
  if (answer === truth) return { right: true, message: `${why}` };
  return {
    right: false,
    message: truth === 'level' ? `It stays level. ${why}` : answer === 'level' ? `It tips. ${why}` : `It tips the other way. ${why}`,
  };
}

export function checkSuspense(q: ScaleQuestion, side: Side, amount: Paise | null): Feedback {
  const s = suspenseOf(q.error)!;
  const why = `The ${sideName(s.side === 'Dr' ? 'Cr' : 'Dr')} pan is heavier by ${f(s.amount)}, so Suspense A/c ${f(s.amount)} goes on the lighter, ${sideName(s.side)} pan: the ${sideName(s.side)} column of the trial balance.`;
  if (side !== s.side) return { right: false, message: `Suspense goes on the lighter pan, the side that is short; on the heavier one it would widen the gap. ${why}` };
  if (amount !== s.amount) {
    const slip =
      q.error.id === 'wrong-side' && amount === s.amount / 2
        ? 'A posting on the wrong side is missing from one side and added to the other, so the difference is twice its amount.'
        : 'Suspense takes the whole difference between the two columns.';
    return { right: false, message: `Right pan, wrong amount. ${slip} ${why}` };
  }
  return { right: true, message: `${why}` };
}

export function checkEntry(q: ScaleQuestion, index: number): Feedback {
  const right = q.entries.find((c) => c.why === null)!;
  const chosen = q.entries[index];
  const why = isOneSided(q.error)
    ? 'The error left one account wrong and the difference in Suspense A/c, so the entry corrects that account and clears Suspense.'
    : q.error.done.length === 0
      ? 'The transaction was left out of the books altogether and the totals stayed equal, so the entry that was left out is passed now, with no Suspense A/c.'
      : 'The error left two accounts wrong and the totals equal, so the entry is between those two accounts, with no Suspense A/c.';
  if (chosen === right) return { right: true, message: `The entry is ${entryText(right.lines)}. ${why}` };
  return { right: false, message: `${chosen.why} The entry is ${entryText(right.lines)}.` };
}

export const CLASS_WORDS: Record<ErrorClass, string> = {
  omission: 'a transaction left out of the books, wholly or in part',
  commission: 'a slip in recording, posting, totalling or carrying forward: a wrong account of the same kind, a wrong amount, a wrong side or a wrong total',
  principle: 'an accounting principle broken: a capital item treated as revenue, or the other way round',
  compensating: 'two errors whose effects cancel each other',
};

const CLASS_NAME: Record<ErrorClass, string> = {
  omission: 'an error of omission',
  commission: 'an error of commission',
  principle: 'an error of principle',
  compensating: 'compensating errors',
};

export function checkClass(q: ScaleQuestion, answer: ErrorClass): Feedback {
  const c = q.error.cls;
  const name = CLASS_NAME[c];
  const why = `It is ${name}: ${CLASS_WORDS[c]}.`;
  return answer === c ? { right: true, message: `${why}` } : { right: false, message: `Not ${CLASS_NAME[answer]}. ${why}` };
}
