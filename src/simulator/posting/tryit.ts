// ---------------------------------------------------------------------------------------------------------------
// "Try it" questions of the lab "posting", answered on the picture with instant feedback and nothing recorded:
//  - side: which side of which account a journal line lands on, and what its particulars say;
//  - balance: the balance c/d of an account and the side it is written on;
//  - column: the column of the trial balance an account's balance goes in (or none).
// ---------------------------------------------------------------------------------------------------------------

import type { Side } from '@/engine/accounts';
import { formatINR, type Paise } from '@/engine/money';
import { createRng } from '@/engine/rng';
import { ledgerOf, postingsOfLine, type TAccount } from './ledger';
import { accountTitle, kindOf, reasonFor, storyFromSeed, type PostingStory } from './story';

export type TryKind = 'side' | 'balance' | 'column';
export const TRY_KINDS: readonly TryKind[] = ['side', 'balance', 'column'];

export interface Feedback {
  right: boolean;
  /** What was right or wrong, and why, in a sentence or three. */
  message: string;
}

export interface SideQuestion {
  kind: 'side';
  story: PostingStory;
  txn: number;
  line: number;
  /** The two accounts of the entry, each offered with both sides. */
  accounts: string[];
  /** The particulars offered, in order. */
  particulars: string[];
  answer: { accountId: string; side: Side; particulars: string };
}

export interface BalanceQuestion {
  kind: 'balance';
  story: PostingStory;
  account: TAccount;
}

export interface ColumnQuestion {
  kind: 'column';
  story: PostingStory;
  account: TAccount;
}

export type PostingQuestion = SideQuestion | BalanceQuestion | ColumnQuestion;

const sideName = (s: Side) => (s === 'Dr' ? 'debit' : 'credit');
const other = (s: Side): Side => (s === 'Dr' ? 'Cr' : 'Dr');

/** A question of the kind, from the seed: its story and what is asked change with it. */
export function makeQuestion(seed: number, kind: TryKind): PostingQuestion {
  const story = storyFromSeed(seed);
  const rng = createRng(seed * 31 + TRY_KINDS.indexOf(kind));
  const ledger = ledgerOf(story);
  if (kind === 'side') {
    // A simple entry (one debit, one credit), so that the line makes one posting.
    const simple = story.txns.map((t, i) => ({ t, i })).filter(({ t }) => t.lines.length === 2);
    const { t, i } = rng.pick(simple);
    const line = rng.int(0, 1);
    const l = t.lines[line];
    const row = postingsOfLine(story, i, line)[0];
    const otherTitle = row.particulars.slice(3);
    const word = l.side === 'Dr' ? 'To' : 'By';
    const wrongWord = l.side === 'Dr' ? 'By' : 'To';
    return {
      kind,
      story,
      txn: i,
      line,
      accounts: t.lines.map((x) => x.accountId),
      particulars: rng.shuffle([`${word} ${otherTitle}`, `${wrongWord} ${otherTitle}`, `${word} ${accountTitle(l.accountId)}`]),
      answer: { accountId: l.accountId, side: l.side, particulars: row.particulars },
    };
  }
  // An account with two items or more is a better question; one with no balance now and then.
  const rich = ledger.filter((a) => a.debit.length + a.credit.length >= 2);
  const pool = kind === 'column' ? ledger : rich.length > 0 ? rich : ledger;
  const account = rng.pick(pool);
  return kind === 'balance' ? { kind: 'balance', story, account } : { kind: 'column', story, account };
}

export function checkSide(q: SideQuestion, accountId: string, side: Side, particulars: string): Feedback {
  const a = q.answer;
  const title = accountTitle(a.accountId);
  const why = reasonFor(a.accountId, a.side);
  if (accountId !== a.accountId) {
    return {
      right: false,
      message: `That is the account of the other line of this entry. This line is for ${title}, so it is posted in ${title}: ${sideName(a.side)} side, "${a.particulars}".`,
    };
  }
  if (side !== a.side) {
    return { right: false, message: `Wrong side. The journal says ${title} is ${a.side === 'Dr' ? 'debited' : 'credited'}, so it goes on the ${sideName(a.side)} side. ${why}` };
  }
  if (particulars !== a.particulars) {
    const own = particulars.endsWith(title) && !a.particulars.endsWith(title);
    return {
      right: false,
      message: own
        ? `Right side, but the particulars name the other account of the entry, never the account you are in: "${a.particulars}".`
        : `Right side, but "To" goes with the debit side and "By" with the credit side: "${a.particulars}".`,
    };
  }
  return { right: true, message: `The ${sideName(a.side)} side of ${title}, as "${a.particulars}". ${why}` };
}

export function checkBalance(q: BalanceQuestion, written: Side | 'none', amount: Paise | null): Feedback {
  const a = q.account;
  const sides =
    a.debitSum === 0 || a.creditSum === 0
      ? `The ${a.debitSum === 0 ? 'credit' : 'debit'} side adds up to ${formatINR(a.total)} and the ${a.debitSum === 0 ? 'debit' : 'credit'} side is empty.`
      : `The debit side adds up to ${formatINR(a.debitSum)} and the credit side to ${formatINR(a.creditSum)}.`;
  if (!a.balance) {
    return written === 'none'
      ? { right: true, message: `${sides} They are equal, so there is no balance to carry down: the account is closed by totalling it.` }
      : { right: false, message: `${sides} They are equal, so there is no balance: nothing is carried down.` };
  }
  const cdSide = other(a.balance.side);
  const how = `The difference, ${formatINR(a.balance.amount)}, is written on the shorter ${sideName(cdSide)} side as "${a.carriedDown!.particulars}", and brought down on the ${sideName(a.balance.side)} side: a ${sideName(a.balance.side)} balance.`;
  if (written === 'none') return { right: false, message: `${sides} They are not equal, so there is a balance. ${how}` };
  if (written === a.balance.side) return { right: false, message: `Balance c/d goes on the shorter side, so that both sides total the same. ${sides} ${how}` };
  if (amount !== a.balance.amount) {
    const slip =
      amount === a.total
        ? 'That is the total of the larger side; the balance is the difference of the two sides.'
        : amount === Math.min(a.debitSum, a.creditSum)
          ? 'That is the total of the shorter side; the balance is the difference of the two sides.'
          : amount === null
            ? 'Type the amount of the balance.'
            : 'The balance is the difference of the two sides.';
    return { right: false, message: `Right side, wrong amount. ${slip} ${sides} ${how}` };
  }
  return { right: true, message: `${sides} ${how}` };
}

export function checkColumn(q: ColumnQuestion, column: Side | 'none'): Feedback {
  const a = q.account;
  if (!a.balance) {
    return column === 'none'
      ? { right: true, message: `${a.title} has no balance (both sides total ${formatINR(a.total)}), so it is left out of the trial balance.` }
      : { right: false, message: `${a.title} has no balance (both sides total ${formatINR(a.total)}). By the balance method only accounts with a balance are listed.` };
  }
  const b = a.balance;
  const reason = `${a.title} has a ${sideName(b.side)} balance of ${formatINR(b.amount)}, brought down on the ${sideName(b.side)} side; it is ${kindOf(a.accountId)}. So it goes in the ${sideName(b.side)} column.`;
  if (column === 'none') return { right: false, message: `Every account with a balance is listed. ${reason}` };
  if (column !== b.side) {
    return {
      right: false,
      message: `Wrong column. The balance goes in the column of the side it is brought down on, not the side "Balance c/d" was written on. ${reason}`,
    };
  }
  return { right: true, message: `${reason}` };
}
