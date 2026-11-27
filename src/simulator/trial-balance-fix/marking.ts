// ---------------------------------------------------------------------------------------------------------------
// Marking the student's work: a rectifying entry (each wrong one told by the slip it shows), the wrong entries a
// quick question offers, and the detective's checks (each posting ticked against the books, each account added up
// again).
// ---------------------------------------------------------------------------------------------------------------

import type { JournalLine } from '@/engine/journal';
import type { Paise } from '@/engine/money';
import { BOOK_NAME, dayShort, f, findError, sideWord, title, type Case, type CaseError } from './model';

export interface EntryTry {
  dr: string | null;
  cr: string | null;
  amount: Paise | null;
  narration: string | null;
}

export interface Mark {
  right: boolean;
  why: string | null;
}

/** The two accounts and the amount of an error's rectifying entry (every one here has one debit and one credit). */
export function rightOf(e: CaseError): { dr: string; cr: string; amount: Paise } {
  const lines = e.entry!;
  return { dr: lines.find((l) => l.side === 'Dr')!.accountId, cr: lines.find((l) => l.side === 'Cr')!.accountId, amount: lines[0].amount };
}

/** The account of the original entry that was right: the other line of the transaction. */
function otherOfTxn(c: Case, e: CaseError): string | null {
  const spec = e.spec;
  if (!('line' in spec)) return null;
  return c.data.txns[spec.txn].lines[1 - spec.line].accountId;
}

/** Marks a rectifying entry, naming the slip when it is wrong. */
export function judgeEntry(c: Case, e: CaseError, t: EntryTry): Mark {
  const r = rightOf(e);
  if (!t.dr || !t.cr || t.amount === null || !t.narration) return { right: false, why: 'Choose both accounts, the amount and the narration.' };
  if (t.dr === t.cr) return { right: false, why: 'One account cannot be both debited and credited by the entry.' };
  if (t.dr === r.dr && t.cr === r.cr && t.amount === r.amount) {
    return t.narration === e.narration ? { right: true, why: null } : { right: false, why: `The entry is right, but the narration tells of another error. It reads: "Being ${e.narration}".` };
  }
  if (t.dr === r.cr && t.cr === r.dr) return { right: false, why: 'The entry is the wrong way round: posted, it would double the error instead of removing it.' };
  const usesSuspense = t.dr === 'suspense' || t.cr === 'suspense';
  const shouldSuspense = r.dr === 'suspense' || r.cr === 'suspense';
  if (usesSuspense && !shouldSuspense) {
    return {
      right: false,
      why:
        e.kind === 'complete-omission'
          ? 'The transaction was left out altogether, so the debits and credits stayed equal and none of the difference in Suspense A/c is due to it. Pass the entry that was left out.'
          : `This error left the debit and credit totals equal, so none of the difference in Suspense A/c is due to it: the entry is between ${title(r.dr)} and ${title(r.cr)}.`,
    };
  }
  if (shouldSuspense && !usesSuspense) {
    const other = otherOfTxn(c, e);
    const named = other && (t.dr === other || t.cr === other) ? ` ${title(other)} was right already.` : '';
    return { right: false, why: `This error left only one account wrong, and the difference it made stands in Suspense A/c: the other side of the entry is Suspense A/c.${named}` };
  }
  if (t.dr === r.dr && t.cr === r.cr) {
    if (e.kind === 'wrong-side' && t.amount * 2 === r.amount) return { right: false, why: `A posting on the wrong side is put right by twice its amount: ${f(t.amount)} to cancel the wrong item and ${f(t.amount)} for the right one.` };
    if (e.kind === 'wrong-amount' && 'line' in e.spec) {
      const l = c.data.txns[e.spec.txn].lines[e.spec.line];
      const as = (e.spec as { as: Paise }).as;
      if (t.amount === l.amount || t.amount === as) return { right: false, why: `Only the difference between what was posted (${f(as)}) and what should have been (${f(l.amount)}) is put right.` };
    }
    return { right: false, why: 'The accounts are right, but not the amount: it is what the error left wrong in the account.' };
  }
  const other = otherOfTxn(c, e);
  if (other && (t.dr === other || t.cr === other)) return { right: false, why: `${title(other)} was recorded correctly the first time; it is not touched.` };
  const wrongDr = t.dr !== r.dr;
  return { right: false, why: `${title(wrongDr ? t.dr : t.cr)} is not the account to ${wrongDr ? 'debit' : 'credit'}. Write what was posted and what should have been: the entry turns the first into the second.` };
}

/** The accounts offered in the entry: every account of the case's books, true or recorded, and Suspense A/c. */
export function accountChoices(c: Case): string[] {
  return [...c.accounts].sort((a, b) => title(a).localeCompare(title(b)));
}

/** The narrations offered: this error's and those of the case's other errors (at most four, in a fixed order). */
export function narrationChoices(c: Case, e: CaseError): string[] {
  const others = c.errors.filter((x) => x.letter !== e.letter && x.narration).map((x) => x.narration);
  const pick = [e.narration, ...others.slice(0, 3)];
  // A fixed shuffle by the error's letter, so the right one is not always first.
  const k = e.letter.charCodeAt(0) % pick.length;
  return [...pick.slice(k), ...pick.slice(0, k)];
}

/** Three wrong entries for an error, each with the slip it shows. */
export function slipsOf(c: Case, e: CaseError): { lines: JournalLine[]; why: string }[] {
  const r = rightOf(e);
  const two = (dr: string, cr: string, amount: Paise): JournalLine[] => [
    { accountId: dr, side: 'Dr', amount },
    { accountId: cr, side: 'Cr', amount },
  ];
  const out: { lines: JournalLine[]; why: string }[] = [];
  const add = (dr: string, cr: string, amount: Paise) => {
    if (dr === cr || amount <= 0) return;
    if (dr === r.dr && cr === r.cr && amount === r.amount) return;
    if (out.some((o) => o.lines[0].accountId === dr && o.lines[1].accountId === cr && o.lines[0].amount === amount)) return;
    const m = judgeEntry(c, e, { dr, cr, amount, narration: e.narration });
    out.push({ lines: two(dr, cr, amount), why: m.why ?? '' });
  };
  const other = otherOfTxn(c, e);
  add(r.cr, r.dr, r.amount);
  if (e.oneSided) {
    if (other) add(r.dr === 'suspense' ? other : r.dr, r.cr === 'suspense' ? other : r.cr, r.amount);
    if (e.kind === 'wrong-side') add(r.dr, r.cr, r.amount / 2);
    if (e.kind === 'wrong-amount' && 'line' in e.spec) add(r.dr, r.cr, c.data.txns[e.spec.txn].lines[e.spec.line].amount);
  } else {
    add(r.dr, 'suspense', r.amount);
    add('suspense', r.cr, r.amount);
    if (e.kind === 'principle' && other) add(r.dr, other, r.amount);
  }
  add(r.dr, r.cr, r.amount * 2);
  if (r.amount % 200 === 0) add(r.dr, r.cr, r.amount / 2);
  return out.slice(0, 3);
}

// ---------------------------------------------------------------------------------------------------------------
// The detective's checks.
// ---------------------------------------------------------------------------------------------------------------

export interface Check {
  id: string;
  kind: 'posting' | 'book' | 'account';
  /** What the books say: "Apr 10, journal: Rao & Co. A/c Dr ₹12,000". */
  says: string;
  /** What the ledger shows for it. */
  shows: string;
  /** The account to open beside it. */
  accountId: string;
  /** The error it uncovers, or null when it agrees. */
  letter: string | null;
  /** Said once it is answered. */
  why: string;
}

/**
 * Every check of the books after the trial balance: each posting of the journal and of the subsidiary book ticked
 * against its account, the book added up again, and each account added up and balanced again. A posting already
 * corrected before the trial balance is not checked again.
 */
export function checksOf(c: Case): Check[] {
  const out: Check[] = [];
  const posting = (ti: number, li: number, where: string) => {
    const t = c.data.txns[ti];
    const p = c.posted.find((x) => x.txn === ti && x.line === li);
    const e = c.errors.find((x) => 'line' in x.spec && x.kind !== 'principle' && x.spec.txn === ti && x.spec.line === li);
    if (e?.when === 'before') return;
    const principle = c.errors.find((x) => x.kind === 'principle' && 'line' in x.spec && x.spec.txn === ti && x.spec.line === li);
    const accountId = principle ? (principle.spec as { as: string }).as : t.lines[li].accountId;
    const side = t.lines[li].side;
    const amount = t.lines[li].amount;
    const says = `${dayShort(t.day)}, ${where}: ${title(accountId)} ${side === 'Dr' ? 'Dr' : 'Cr'} ${f(amount)}`;
    let shows: string;
    let why: string;
    if (!p) {
      shows = `Nothing in ${title(accountId)} for ${dayShort(t.day)}, and the L.F. is blank.`;
      why = `${e!.tag} The posting was left out: ${title(accountId)} is short of a ${sideWord(side)} of ${f(amount)}.`;
    } else if (p.accountId !== accountId) {
      shows = `Not in ${title(accountId)}: posted to ${title(p.accountId)} instead.`;
      why = `${e!.tag} Posted to the wrong account: ${title(p.accountId)} has the item that belongs to ${title(accountId)}.`;
    } else if (p.side !== side) {
      shows = `${title(accountId)}, ${sideWord(p.side)} side: "${p.side === 'Dr' ? 'To' : 'By'} ${p.label} ${f(p.amount)}".`;
      why = `${e!.tag} Posted to the ${sideWord(p.side)} side, where the books say ${sideWord(side)}.`;
    } else if (p.amount !== amount) {
      shows = `${title(accountId)}, ${sideWord(p.side)} side: "${p.side === 'Dr' ? 'To' : 'By'} ${p.label} ${f(p.amount)}".`;
      why = `${e!.tag} Posted as ${f(p.amount)}, where the books say ${f(amount)}.`;
    } else {
      shows = `${title(accountId)}, ${sideWord(p.side)} side: "${p.side === 'Dr' ? 'To' : 'By'} ${p.label} ${f(p.amount)}".`;
      why = principle
        ? `It agrees with the journal. (The journal itself names the wrong account here: ticking the ledger against the journal cannot find an error of principle.)`
        : 'It agrees: the same account, side and amount as the books.';
    }
    out.push({ id: `post:${ti}.${li}`, kind: 'posting', says, shows, accountId: p?.accountId === accountId || !p ? accountId : p.accountId, letter: p && p.accountId === accountId && p.side === side && p.amount === amount ? null : (e?.letter ?? null), why });
  };
  for (const [ti, t] of c.data.txns.entries()) {
    if (c.errors.some((e) => e.kind === 'complete-omission' && 'txn' in e.spec && e.spec.txn === ti)) continue;
    if (t.book) posting(ti, t.lines[0].accountId.includes(':') ? 0 : 1, c.book ? BOOK_NAME[c.book.kind] : 'book');
    else {
      posting(ti, 0, 'journal');
      posting(ti, 1, 'journal');
    }
  }
  if (c.book) {
    const b = c.book;
    const e = b.letter ? findError(c, b.letter) : undefined;
    out.push({
      id: 'book-total',
      kind: 'book',
      says: `${b.name}: ${b.rows.map((r) => f(r.amount)).join(' + ')}`,
      shows: `Total written ${f(b.total)}, posted to ${b.kind === 'sales' ? 'Sales A/c' : 'Purchases A/c'}.`,
      accountId: b.kind,
      letter: e?.letter ?? null,
      why: e ? `${e.tag} The rows add up to ${f(b.sum)}, not ${f(b.total)}: the book was ${b.total > b.sum ? 'overcast' : 'undercast'}.` : `The rows add up to ${f(b.sum)}, the total written: it agrees.`,
    });
  }
  for (const id of c.accounts) {
    if (id === 'suspense' || !c.recordedNet.has(id)) continue;
    const e = c.errors.find((x) => (x.kind === 'casting' || x.kind === 'compensating' || x.kind === 'wrong-balance') && x.accounts.includes(id));
    const spec = e?.spec;
    let why = 'Both sides add up as written, and the balance carried down is their difference: it agrees.';
    if (spec?.kind === 'casting' || spec?.kind === 'compensating') {
      const cast = spec.kind === 'casting' ? spec : [spec.a, spec.b].find((x) => x.accountId === id)!;
      why = `${e!.tag} The ${sideWord(cast.side)} side was ${cast.by > 0 ? 'overcast' : 'undercast'} by ${f(Math.abs(cast.by))}.`;
    } else if (spec?.kind === 'wrong-balance') why = `${e!.tag} ${e!.text}`;
    out.push({ id: `acc:${id}`, kind: 'account', says: `${title(id)}: add up both sides again.`, shows: 'Check the totals and the balance carried down.', accountId: id, letter: e?.letter ?? null, why });
  }
  return out;
}

/** The errors a detective finds by ticking: those some check uncovers. */
export const foundByTicking = (checks: readonly Check[]): Set<string> => new Set(checks.filter((k) => k.letter).map((k) => k.letter!));

