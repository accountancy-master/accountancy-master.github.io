// ---------------------------------------------------------------------------------------------------------------
// The walk through a case: what the picture shows at each step, and the words of each step (what moves and why).
// Watch plays these steps; Play goes through the same stages with the student doing the work.
// ---------------------------------------------------------------------------------------------------------------

import { normalSide, resolveAccount } from '@/engine/accounts';
import {
  BOOK_NAME,
  CLASS_NAME,
  DIFFERENCE,
  entryText,
  errorsWhen,
  f,
  resultWords,
  sideWord,
  TB_DATE,
  title,
  totalsOf,
  correctedTb,
  type Case,
  type CaseError,
  type LedgerState,
} from './model';

export interface DeskState extends LedgerState {
  /** The ledger has been posted (the accounts are shown). */
  posted: boolean;
  /** The trial balance: not yet drawn up, as first drawn up, or checked against the ledger. */
  tb: 'none' | 'draft' | 'checked';
  /** The rectifying entries passed so far (written in the journal of rectifications). */
  entries: ReadonlySet<string>;
  /** The corrected trial balance is drawn up. */
  corrected: boolean;
  /** The effect on the profit is shown. */
  profit: boolean;
  /** The accounts the step is about, opened in the picture. */
  focus: string[];
  /** The error the step is about. */
  current: string | null;
}

export const START: DeskState = {
  posted: false,
  checked: false,
  balanced: false,
  suspense: false,
  tb: 'none',
  revealed: new Set(),
  rectified: new Set(),
  entries: new Set(),
  corrected: false,
  profit: false,
  focus: [],
  current: null,
};

export interface WalkStep {
  id: string;
  title: string;
  text: string;
  state: DeskState;
}

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const plural = (n: number, one: string, many: string) => `${WORDS[n] ?? n} ${n === 1 ? one : many}`;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** What the case is about, before anything happens. */
export function aboutCase(c: Case): string {
  const d = c.data;
  const book = c.book ? ` and the credit ${c.book.kind === 'sales' ? 'sales' : 'purchases'} in the ${c.book.name}` : '';
  return `${d.owner} runs ${d.business}, which ${d.trade}. ${d.opening.length ? 'It began April with the balances shown. ' : ''}The clerk wrote April's transactions in the journal${book}. ${plural(c.errors.length, 'error is', 'errors are')} hidden in the books: some the trial balance will show, some it never can.`;
}

/** Why an error is rectified the way it is, and its entry, in words. */
export function explainError(c: Case, e: CaseError): string {
  if (e.when === 'tb') return `${e.text} The ledger is right; only the trial balance was drawn up wrongly. ${e.inTrialBalance}`;
  const entry = entryText(e.entry!);
  if (e.kind === 'complete-omission') return `Nothing of it was posted, so the debits and the credits stayed equal and the trial balance could never show it. The entry that was left out is passed now: ${entry}.`;
  if (e.kind === 'compensating') {
    const [a, b] = e.delta;
    // Each balance stands in the column of its normal side: two accounts of one column move it up and down alike; one
    // of each column moves both columns up (or both down) alike.
    const drOne = normalSide(resolveAccount(a[0])) === 'Dr' ? a : b;
    const where =
      normalSide(resolveAccount(a[0])) === normalSide(resolveAccount(b[0])) ? 'the same column up and down by the same amount' : `both columns ${drOne[1] > 0 ? 'up' : 'down'} by the same amount`;
    return `Each slip alone would upset the trial balance, but ${title(a[0])} is ${f(Math.abs(a[1]))} too ${a[1] > 0 === (normalSide(resolveAccount(a[0])) === 'Dr') ? 'high' : 'low'} and ${title(b[0])} ${f(Math.abs(b[1]))} too ${b[1] > 0 === (normalSide(resolveAccount(b[0])) === 'Dr') ? 'high' : 'low'}: together they move ${where}, so the trial balance agrees and they are not in Suspense A/c. Put right one by one, the two corrections make one entry between the two accounts: ${entry}.`;
  }
  if (!e.oneSided && (e.spec.kind === 'principle' || e.spec.kind === 'wrong-account')) {
    const l = c.data.txns[e.spec.txn].lines[e.spec.line];
    const reason = e.kind === 'principle' ? ' (a capital item treated as revenue)' : '';
    return `Two accounts are wrong by the same amount${reason}: ${title(e.spec.as)} has ${f(l.amount)} of ${sideWord(l.side)} that belongs to ${title(l.accountId)}. The debit and credit totals stayed equal, so none of the difference in Suspense A/c is due to it, and the entry is between the two accounts: ${entry}.`;
  }
  const [id, v] = e.delta[0];
  const col = e.gap > 0 ? 'debit' : 'credit';
  const extra =
    e.kind === 'wrong-side'
      ? ` It is twice the amount: once to cancel the item on the wrong side, once for the item the right side should have had.`
      : e.kind === 'wrong-amount'
        ? ' Only the difference between what was posted and what should have been is put right.'
        : '';
  return `Only one account is wrong: ${title(id)}, by ${f(Math.abs(v))}. It made the ${col} column ${f(Math.abs(e.gap))} larger than the ${col === 'debit' ? 'credit' : 'debit'} column, and Suspense A/c holds that difference, so the rectifying entry ${v > 0 ? 'credits' : 'debits'} ${title(id)} and ${e.gap > 0 ? 'debits' : 'credits'} Suspense A/c: ${entry}.${extra}`;
}

/** Had the error been found before the trial balance was drawn up: how it would have been put right. */
export function beforeWords(e: CaseError): string {
  if (e.when === 'tb') return 'It is an error in drawing up the trial balance, found when the trial balance is checked.';
  if (e.oneSided) return `There would be no Suspense A/c yet, and only one account is wrong, so it would be corrected in the account itself, with no journal entry: ${e.inAccount}`;
  if (e.spec.kind === 'compensating') {
    const part = (x: { accountId: string; side: 'Dr' | 'Cr' }) => `the ${sideWord(x.side)} side of ${title(x.accountId)}`;
    return `Each slip is a wrong total in one account, so each would be corrected in its own account, with no journal entry: add up ${part(e.spec.a)} and ${part(e.spec.b)} again, and balance both accounts again.`;
  }
  return `There is nothing for Suspense A/c in it, so it would be put right by the same entry between the accounts: ${entryText(e.entry!)}.`;
}

export function classWords(e: CaseError): string {
  return `${CLASS_NAME[e.cls]}${e.when === 'tb' ? '' : e.oneSided ? ', one-sided: the trial balance does not agree' : e.kind === 'compensating' ? ': the two cancel, the trial balance agrees' : ', two-sided: the trial balance agrees'}.`;
}

/** The steps of the walk through a case. */
export function walkOf(c: Case): WalkStep[] {
  const steps: WalkStep[] = [];
  let s: DeskState = START;
  const step = (id: string, title_: string, text: string, change: Partial<DeskState>) => {
    s = { ...s, current: null, ...change };
    steps.push({ id, title: title_, text, state: s });
  };
  const set = (base: ReadonlySet<string>, more: string[]) => new Set([...base, ...more]);

  step('books', 'The books of April', aboutCase(c), { focus: [] });

  const book = c.book;
  step(
    'post',
    'Posting the ledger',
    `Every line of the journal is posted to its account: a debit on the debit side with "To" and the other account, a credit on the credit side with "By".${
      book ? ` Each row of the ${book.name} is posted to the party's account on its day, and the book's total to ${book.kind === 'sales' ? 'the credit of Sales A/c' : 'the debit of Purchases A/c'} on 30 April, "${book.kind === 'sales' ? 'By' : 'To'} Sundries as per ${BOOK_NAME[book.kind]}".` : ''
    } The postings are copied from the books as the clerk wrote them, errors and all: this ledger is the rough work from which the errors will be found.`,
    { posted: true, focus: c.accounts.filter((a) => a !== 'suspense').slice(0, 1) },
  );

  const before = errorsWhen(c, 'before');
  if (before.length) {
    step(
      'check',
      'Checked before balancing',
      `Before the accounts are balanced, the clerk notices a slip in the posting: ${before.map((e) => `${e.tag} ${e.text.charAt(0).toLowerCase()}${e.text.slice(1)}`).join(' ')} Found before the trial balance, there is no Suspense A/c yet, and only one account is wrong: it is corrected in the account itself, with no journal entry. ${before.map((e) => e.inAccount).join(' ')} The other errors stay hidden for now.`,
      { checked: true, focus: [...new Set(before.flatMap((e) => e.accounts))].slice(0, 2), current: before[0].letter },
    );
  }

  step(
    'balance',
    'Balancing the accounts',
    'Each account is balanced on 30 April: the difference of its two sides is written on the shorter side as "Balance c/d", both sides are totalled to the same figure, and the balance is brought down on 1 May on the other side as "Balance b/d". The clerk adds and balances; any slip in the adding stays hidden in the totals for now.',
    { checked: true, balanced: true, focus: [c.accounts[0]] },
  );

  const draft = totalsOf(c.tbDraft);
  step(
    'tb',
    'The trial balance',
    `Each balance goes into the trial balance of ${TB_DATE} once, by the balance method: a debit balance in the debit column, a credit balance in the credit column. The debit column adds up to ${f(draft.debit)} and the credit column to ${f(draft.credit)}: the trial balance does not agree.`,
    { tb: 'draft', focus: [] },
  );

  const tbErrs = errorsWhen(c, 'tb');
  const checked = totalsOf(c.tbChecked);
  if (tbErrs.length) {
    step(
      'tb-check',
      'Checking the trial balance',
      `Before a Suspense A/c is opened, the trial balance is checked against the ledger: each balance copied rightly, and into its right column. ${tbErrs.map((e) => `${e.tag} ${e.text}`).join(' ')} That is a slip in drawing up the trial balance, not in the books, so the trial balance itself is put right and no journal entry is passed${tbErrs.some((e) => e.kind === 'tb-wrong-column') ? ' (a balance in the wrong column moves the difference by twice its amount)' : ''}. The columns now add up to ${f(checked.debit)} and ${f(checked.credit)}: still not agreeing.`,
      { tb: 'checked', revealed: set(s.revealed, tbErrs.map((e) => e.letter)), current: tbErrs[0].letter },
    );
  } else {
    s = { ...s, tb: 'checked' };
  }

  const sus = c.suspense;
  step(
    'suspense',
    'Suspense A/c',
    `The ${sideWord(sus.side)} column is short by ${f(sus.amount)}. The difference is written in that column as Suspense A/c, so the trial balance agrees for now, and Suspense A/c is opened with it: "${sus.side === 'Dr' ? 'To' : 'By'} ${DIFFERENCE} ${f(sus.amount)}" on its ${sideWord(sus.side)} side. It holds the difference until the errors behind it are found.`,
    { tb: 'checked', suspense: true, focus: ['suspense'] },
  );

  for (const e of errorsWhen(c, 'after')) {
    step(`error-${e.letter}`, `Error ${e.tag}: ${e.name.toLowerCase()}`, `${e.text} ${explainError(c, e)}`, {
      revealed: set(s.revealed, [e.letter]),
      entries: set(s.entries, [e.letter]),
      focus: e.oneSided ? [...e.accounts.slice(0, 1), 'suspense'] : e.accounts.slice(0, 2),
      current: e.letter,
    });
  }

  const after = errorsWhen(c, 'after');
  step(
    'rectify-post',
    'Posting the rectifying entries',
    `The rectifying entries are posted like any other entry, each item marked with the letter of its error. Each account they touch starts from its balance brought down, takes the rectification, and is balanced again.${after.some((e) => !e.accounts.every((a) => c.recordedNet.has(a))) ? ' An account the clerk never opened is opened now.' : ''}`,
    { rectified: new Set(after.map((e) => e.letter)), focus: [after[0].accounts[0], 'suspense'] },
  );

  const through = after.filter((e) => e.oneSided);
  const never = after.filter((e) => !e.oneSided);
  const dSide = through.filter((e) => e.gap > 0).map((e) => e.gap);
  const cSide = through.filter((e) => e.gap < 0).map((e) => -e.gap);
  const sumOf = (xs: number[]) => xs.reduce((t, x) => t + x, 0);
  const debitTotal = sumOf(dSide) + (sus.side === 'Dr' ? sus.amount : 0);
  step(
    'suspense-close',
    'Suspense A/c closes',
    `Suspense A/c opened with ${f(sus.amount)} on its ${sideWord(sus.side)} side. The rectifications post ${dSide.length ? dSide.map(f).join(' + ') : 'nothing'} on its debit side and ${cSide.length ? cSide.map(f).join(' + ') : 'nothing'} on its credit side, so both sides total ${f(debitTotal)} and nothing is left in it: every error behind the difference has been found.${never.length ? ` ${list(never.map((e) => e.tag))} never touched it: ${never.length === 1 ? 'that error' : 'those errors'} had not upset the trial balance.` : ''}`,
    { focus: ['suspense'] },
  );

  const corr = totalsOf(correctedTb(c));
  step('corrected', 'The corrected trial balance', `With every error rectified, the trial balance is drawn up again from the corrected balances: both columns add up to ${f(corr.debit)}, with no Suspense A/c.`, { corrected: true, focus: [] });

  step('profit', 'Effect on the profit', profitText(c), { profit: true });
  return steps;
}

/** The profit as per the books, corrected for each error that left an income or an expense wrong. */
export function profitText(c: Case): string {
  const touched = errorsWhen(c, 'after').filter((e) => e.profitWords.length);
  const books = `The books showed ${resultWords(c.profit.books)} for April (with closing stock of ${f(c.data.closingStock)}).`;
  if (!touched.length) return `${books} None of the errors left an income or an expense wrong, so the profit stands.`;
  const items = touched.map((e) => `${e.tag} ${e.profitWords.join(' ')}`).join(' ');
  const rest = errorsWhen(c, 'after').length > touched.length ? ' The other errors left only personal or real accounts wrong (a party, cash, bank, an asset), and leave the profit as it was.' : '';
  return `${books} ${items} Corrected: ${resultWords(c.profit.corrected)}.${rest}`;
}

/** The lines of the corrected profit statement: profit as per books, each error added or taken off. */
export function profitLines(c: Case): { label: string; amount: number; sign: '+' | '-' | '' }[] {
  const out: { label: string; amount: number; sign: '+' | '-' | '' }[] = [{ label: c.profit.books >= 0 ? 'Profit as per the books' : 'Loss as per the books', amount: Math.abs(c.profit.books), sign: '' }];
  for (const e of errorsWhen(c, 'after')) {
    if (e.profit === 0) continue;
    out.push({ label: `${e.tag} ${e.name}: ${e.profit > 0 ? 'overstated' : 'understated'}`, amount: Math.abs(e.profit), sign: e.profit > 0 ? '-' : '+' });
  }
  out.push({ label: c.profit.corrected >= 0 ? 'Corrected profit' : 'Corrected loss', amount: Math.abs(c.profit.corrected), sign: '' });
  return out;
}

