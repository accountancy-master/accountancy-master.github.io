import { partnerCapital, partnerLoan } from '@/engine/accounts';
import { ledgerLabel } from '@/engine/books';
import { formatINR, type Paise } from '@/engine/money';
import { splitByRatio } from '../partnership/split';

// ---------------------------------------------------------------------------------------------------------------
// The dissolution of a firm, as src/content/cbse12/dissolution-of-partnership.ts and its templates teach it (CBSE
// 2025-26):
//  - every asset except cash at bank and fictitious assets goes to the debit of Realisation A/c at its gross book
//    value; every outside liability (a loan from a partner's relative among them) and the provision against an asset
//    go to its credit. Reserves and accumulated profits or losses go to the capital accounts in the profit-sharing
//    ratio. A partner's own loan is never passed through Realisation A/c: it is repaid after the outside liabilities
//    and before the capitals;
//  - an asset sold: Bank A/c Dr, To Realisation A/c; taken over by a partner: Capital A/c Dr, To Realisation A/c, at
//    the agreed value; accepted by the creditors: no entry (only the balance paid to them is recorded); an asset about
//    which nothing is said realises its book value if tangible and nothing if intangible;
//  - a liability paid: Realisation A/c Dr, To Bank A/c, with the amount actually paid (a discount needs no entry);
//    taken over by a partner: Realisation A/c Dr, To Capital A/c; an unrecorded asset or liability goes through
//    Realisation A/c with its whole amount;
//  - realisation expenses in their six forms (who bears them, and whose money paid them);
//  - the profit or loss on realisation is shared in the profit-sharing ratio; capitals are fluctuating; no partner is
//    insolvent: a partner whose capital account ends in debit brings the amount in, and every credit balance is paid,
//    which leaves the bank at nil.
// All amounts are in paise; a share that does not come out in whole paise is rounded so that the shares still add up
// (splitByRatio). Ready examples and questions are set in whole rupees.
// ---------------------------------------------------------------------------------------------------------------

export type ExpenseForm = 'firm' | 'partnerPays' | 'feePersonal' | 'feeFirmPays' | 'borneFirmPays' | 'bornePersonal';
export const EXPENSE_FORMS: readonly ExpenseForm[] = ['firm', 'partnerPays', 'feePersonal', 'feeFirmPays', 'borneFirmPays', 'bornePersonal'];

export interface DPartner {
  name: string;
  /** The term of the profit-sharing ratio. */
  ratio: number;
  capital: Paise;
  /** A loan the partner has given the firm (0 for none). */
  loan: Paise;
}

export type AssetFate =
  | { kind: 'sold'; amount: Paise }
  | { kind: 'taken'; by: number; amount: Paise }
  /** Accepted by the creditors at this value, in part settlement of their claim. */
  | { kind: 'creditors'; amount: Paise }
  /** Nothing is said about it: book value if tangible, nothing if intangible. */
  | { kind: 'silent' };

export interface DAsset {
  /** The ledger account (engine id): 'stock', 'machinery', 'goodwill'. */
  id: string;
  /** As the balance sheet names it. */
  name: string;
  /** In a sentence: "the stock". */
  the: string;
  book: Paise;
  intangible?: boolean;
  fate: AssetFate;
}

export type LiabilityFate = { kind: 'paid'; discount: Paise } | { kind: 'taken'; by: number };

export interface DLiability {
  /** The ledger account (engine id): 'creditors', 'billsPayable', partnerLoan('Kiran') for a relative's loan. */
  id: string;
  name: string;
  the: string;
  /** In the brackets of a row: "creditors". */
  what: string;
  book: Paise;
  fate: LiabilityFate;
}

/** Something that was not in the books: sold (by null) or taken over by a partner; paid by the firm (null) or by a partner. */
export interface Unrecorded {
  /** "old typewriter", "repairs bill". */
  what: string;
  amount: Paise;
  by: number | null;
}

export interface DFirm {
  firm: string;
  /** The date of dissolution: "31 March 2026". */
  date: string;
  partners: DPartner[];
  assets: DAsset[];
  /** Provision for doubtful debts, against the debtors. */
  provision: Paise;
  liabilities: DLiability[];
  reserve: Paise;
  /** Profit and Loss A/c: a credit balance (undistributed profit) and a debit balance (a past loss). */
  plCredit: Paise;
  plDebit: Paise;
  unrecordedAsset: Unrecorded | null;
  unrecordedLiability: Unrecorded | null;
  expenses: { form: ExpenseForm; by: number; actual: Paise; fee: Paise };
}

export type Side = 'Dr' | 'Cr';
export interface Line {
  /** Engine account id. */
  account: string;
  side: Side;
  amount: Paise;
}
export interface Entry {
  lines: Line[];
  narration: string;
}

/** One row of Realisation A/c or Bank A/c: written from `step` on (-1: an opening balance). */
export interface Row {
  particulars: string;
  amount: Paise;
  step: number;
}
/** One row of the capital accounts in columns. */
export interface ColRow {
  particulars: string;
  amounts: Paise[];
  step: number;
}

export type StepKind =
  | 'assets' | 'liabilities' | 'accumulated' | 'sold' | 'taken' | 'unrecordedAsset' | 'creditorsAsset' | 'paid' | 'liabilityTaken' | 'unrecordedLiability' | 'expenses' | 'result' | 'loans' | 'broughtIn' | 'final';

export interface DStep {
  kind: StepKind;
  title: string;
  text: string;
  entries: Entry[];
  /** The bank balance once this step is done. */
  bank: Paise;
  /** The capital balances once this step is done (credit positive). */
  capitals: Paise[];
}

export interface Dissolution {
  firm: DFirm;
  /** The cash at bank on the balance sheet: the figure that makes it agree. */
  bank: Paise;
  steps: DStep[];
  realisation: { dr: Row[]; cr: Row[] };
  capitals: { dr: ColRow[]; cr: ColRow[] };
  bankAccount: { dr: Row[]; cr: Row[] };
  /** Before the profit or loss is transferred. */
  realisationDebit: Paise;
  realisationCredit: Paise;
  /** Profit (positive) or loss (negative) on realisation, and each partner's share of it (same sign). */
  result: Paise;
  shares: Paise[];
  /** What each partner is paid at the end (positive) or brings in (negative). */
  finals: Paise[];
  /** Why the books cannot be closed as they stand, or null. */
  problem: string | null;
}

const inr = formatINR;
export const REAL = 'realisation';
export const BANK = 'bank';
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
/** "were" for the creditors and the bills payable, "was" for a loan. */
const were = (l: DLiability): string => (/s$|^bills /.test(l.what) ? 'were' : 'was');
/** "an old computer", "an electricity bill", "a repairs bill". */
export const withArticle = (w: string): string => `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`;
/** A liability as a sentence names it, without its article: "creditors", "loan from Suman". */
const bare = (l: DLiability): string => l.the.replace(/^the /, '');
const list = (xs: readonly string[]): string => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The cash at bank that makes the balance sheet agree. */
export function bankOf(f: DFirm): Paise {
  const right = sum(f.liabilities.map((l) => l.book)) + f.provision + sum(f.partners.map((p) => p.loan + p.capital)) + f.reserve + f.plCredit;
  const left = sum(f.assets.map((a) => a.book)) + f.plDebit;
  return right - left;
}

/** What an asset brings in money, what a partner is charged for it, and what the creditors take it at. */
export const cashOf = (a: DAsset): Paise => (a.fate.kind === 'sold' ? a.fate.amount : a.fate.kind === 'silent' && !a.intangible ? a.book : 0);
/** The value at which the creditors accepted assets, in all. */
export const acceptedOf = (f: DFirm): Paise => sum(f.assets.map((a) => (a.fate.kind === 'creditors' ? a.fate.amount : 0)));
/** What the firm pays for a liability: the book figure less a discount, and (for the creditors) less the assets they accepted. */
export const paidFor = (f: DFirm, l: DLiability): Paise => (l.fate.kind === 'taken' ? 0 : l.book - l.fate.discount - (l.id === 'creditors' ? acceptedOf(f) : 0));

/** What the firm charges to Realisation A/c for the expenses, credits to a partner, and pays on a partner's behalf. */
export const expenseCharge = (e: DFirm['expenses']): Paise => (e.form === 'firm' || e.form === 'partnerPays' ? e.actual : e.form === 'feePersonal' || e.form === 'feeFirmPays' ? e.fee : 0);

/** Why a firm cannot be dissolved as given, or null. */
export function problemOf(f: DFirm): string | null {
  const n = f.partners.length;
  if (n < 2 || n > 3) return 'Take two or three partners.';
  if (f.partners.some((p) => !Number.isInteger(p.ratio) || p.ratio < 1)) return 'Every term of the profit-sharing ratio must be a whole number of at least 1.';
  if (f.partners.some((p) => p.capital <= 0)) return 'Every partner needs a capital.';
  if (bankOf(f) < 0) return 'The two sides of the balance sheet do not leave any cash at bank: lower an asset or raise a capital.';
  const creditors = f.liabilities.find((l) => l.id === 'creditors');
  if (acceptedOf(f) > 0 && (!creditors || creditors.fate.kind !== 'paid')) return 'Only creditors who are paid by the firm can accept an asset.';
  for (const l of f.liabilities) if (paidFor(f, l) < 0) return `${cap(l.the)} would be paid less than nothing: lower the discount or the asset accepted.`;
  if (f.expenses.form !== 'firm' && (f.expenses.by < 0 || f.expenses.by >= n)) return 'Say which partner deals with the expenses.';
  return null;
}

export function dissolve(f: DFirm): Dissolution {
  const names = f.partners.map((p) => p.name);
  const ratio = f.partners.map((p) => p.ratio);
  const capId = (i: number) => partnerCapital(names[i]);
  const capA = (i: number) => `${names[i]}'s Capital A/c`;
  const bank0 = bankOf(f);
  const steps: DStep[] = [];
  const R = { dr: [] as Row[], cr: [] as Row[] };
  const B = { dr: [] as Row[], cr: [] as Row[] };
  const C = { dr: [] as ColRow[], cr: [] as ColRow[] };
  let bank = bank0;
  const capital = f.partners.map((p) => p.capital);
  let problem: string | null = problemOf(f);

  B.dr.push({ particulars: 'To Balance b/d', amount: bank0, step: -1 });
  C.cr.push({ particulars: 'By Balance b/d', amounts: [...capital], step: -1 });

  const at = () => steps.length;
  const real = (side: Side, particulars: string, amount: Paise) => (side === 'Dr' ? R.dr : R.cr).push({ particulars: `${side === 'Dr' ? 'To' : 'By'} ${particulars}`, amount, step: at() });
  const money = (side: Side, particulars: string, amount: Paise) => {
    (side === 'Dr' ? B.dr : B.cr).push({ particulars: `${side === 'Dr' ? 'To' : 'By'} ${particulars}`, amount, step: at() });
    bank += side === 'Dr' ? amount : -amount;
  };
  const col = (side: Side, particulars: string, i: number, amount: Paise) => {
    const label = `${side === 'Dr' ? 'To' : 'By'} ${particulars}`;
    const rows = side === 'Dr' ? C.dr : C.cr;
    const open = rows.find((r) => r.step === at() && r.particulars === label && r.amounts[i] === 0);
    if (open) open.amounts[i] = amount;
    else rows.push({ particulars: label, amounts: names.map((_, k) => (k === i ? amount : 0)), step: at() });
    capital[i] += side === 'Cr' ? amount : -amount;
  };
  const push = (kind: StepKind, title: string, text: string, entries: Entry[]) => {
    steps.push({ kind, title, text, entries, bank, capitals: [...capital] });
    if (bank < 0 && !problem) problem = `The bank would be overdrawn at "${title}": the firm cannot pay out money it does not have.`;
  };
  const shareText = (amounts: readonly Paise[]) => names.map((nm, i) => `${nm} ${inr(Math.abs(amounts[i]))}`).join(', ');
  const ratioText = ratio.every((r) => r === ratio[0]) ? 'equally' : `in the ratio ${ratio.join(':')}`;

  // 1. The assets go to the debit of Realisation A/c at their book values.
  const assetsTotal = sum(f.assets.map((a) => a.book));
  for (const a of f.assets) real('Dr', ledgerLabel(a.id), a.book);
  push(
    'assets',
    'The assets go to Realisation A/c',
    `Every asset but the cash at bank${f.plDebit ? ' and the debit balance of Profit and Loss A/c (a past loss, which nobody can buy)' : ''} is transferred to the debit of Realisation A/c at its book value: ${list(f.assets.map((a) => `${a.name.toLowerCase()} ${inr(a.book)}`))}, ${inr(assetsTotal)} in all. Each asset account is closed.${f.provision ? ' The debtors go at their gross figure.' : ''}`,
    [{ lines: [{ account: REAL, side: 'Dr', amount: assetsTotal }, ...f.assets.map((a): Line => ({ account: a.id, side: 'Cr', amount: a.book }))], narration: 'Assets transferred to Realisation A/c' }],
  );

  // 2. The outside liabilities, and the provision against the debtors, go to its credit.
  const liabTotal = sum(f.liabilities.map((l) => l.book)) + f.provision;
  for (const l of f.liabilities) real('Cr', ledgerLabel(l.id), l.book);
  if (f.provision) real('Cr', ledgerLabel('provisionForDoubtfulDebts'), f.provision);
  const loans = f.partners.filter((p) => p.loan > 0);
  const relative = f.liabilities.filter((l) => l.id.startsWith('partnerLoan:'));
  push(
    'liabilities',
    'The outside liabilities go to Realisation A/c',
    `What is owed to outsiders${f.provision ? ', and the provision for doubtful debts,' : ''} is transferred to the credit: ${list([...f.liabilities.map((l) => `${bare(l)} ${inr(l.book)}`), ...(f.provision ? [`provision for doubtful debts ${inr(f.provision)}`] : [])])}.${relative.length ? ` ${relative.map((l) => l.name).join(', ')}: a relative of a partner is an outsider, so the loan is an outside liability.` : ''} ${cap(list([...loans.map((p) => `${p.name}'s own loan`), ...(f.reserve ? ['General Reserve'] : []), ...(f.plCredit ? ['the credit balance of Profit and Loss A/c'] : []), 'the capitals']))} stay out of it.`,
    [
      {
        lines: [...f.liabilities.map((l): Line => ({ account: l.id, side: 'Dr', amount: l.book })), ...(f.provision ? [{ account: 'provisionForDoubtfulDebts', side: 'Dr' as const, amount: f.provision }] : []), { account: REAL, side: 'Cr', amount: liabTotal }],
        narration: 'Outside liabilities transferred to Realisation A/c',
      },
    ],
  );

  // 3. Reserves and accumulated profits or losses: straight to the capital accounts.
  if (f.reserve || f.plCredit || f.plDebit) {
    const entries: Entry[] = [];
    const parts: string[] = [];
    const give = (amount: Paise, account: string, credit: boolean, what: string, narration: string) => {
      const sh = splitByRatio(amount, ratio);
      sh.forEach((x, i) => col(credit ? 'Cr' : 'Dr', ledgerLabel(account), i, x));
      entries.push({
        lines: credit
          ? [{ account, side: 'Dr', amount }, ...sh.map((x, i): Line => ({ account: capId(i), side: 'Cr', amount: x }))]
          : [...sh.map((x, i): Line => ({ account: capId(i), side: 'Dr', amount: x })), { account, side: 'Cr', amount }],
        narration,
      });
      parts.push(`${what} ${inr(amount)} ${credit ? 'credited' : 'debited'} ${ratioText}: ${shareText(sh)}`);
    };
    if (f.reserve) give(f.reserve, 'generalReserve', true, 'General Reserve', "General Reserve transferred to the partners' capital accounts");
    if (f.plCredit) give(f.plCredit, 'profitAndLoss', true, 'the undistributed profit (credit balance of Profit and Loss A/c)', "Credit balance of Profit and Loss A/c transferred to the partners' capital accounts");
    if (f.plDebit) give(f.plDebit, 'profitAndLoss', false, 'the past loss (debit balance of Profit and Loss A/c)', "Debit balance of Profit and Loss A/c written off to the partners' capital accounts");
    push('accumulated', 'Reserves and past results to the capital accounts', `They belong to the partners, not to outsiders, so they skip Realisation A/c. ${cap(parts.join('; '))}.`, entries);
  }

  // 4. The assets realised for money (and those about which nothing is said).
  const sold = f.assets.filter((a) => cashOf(a) > 0);
  const nil = f.assets.filter((a) => a.fate.kind === 'silent' && a.intangible);
  if (sold.length || nil.length) {
    for (const a of sold) {
      real('Cr', `Bank A/c (${a.name.toLowerCase()})`, cashOf(a));
      money('Dr', `Realisation A/c (${a.name.toLowerCase()})`, cashOf(a));
    }
    const got = sum(sold.map(cashOf));
    const silentTangible = sold.filter((a) => a.fate.kind === 'silent');
    push(
      'sold',
      'The assets are sold',
      `${sold.length ? `Money comes in: ${list(sold.map((a) => `${a.the} ${inr(cashOf(a))}`))}, ${inr(got)} in all. Bank A/c is debited and Realisation A/c credited.` : ''}${silentTangible.length ? ` Nothing is said about ${list(silentTangible.map((a) => a.the))}: a tangible asset is taken as realised at its book value.` : ''}${nil.length ? ` Nothing is said about ${list(nil.map((a) => a.the))}: an intangible asset is taken to fetch nothing, so its whole book value stays on the debit as a loss.` : ''}`.trim(),
      sold.length ? [{ lines: [{ account: BANK, side: 'Dr', amount: got }, { account: REAL, side: 'Cr', amount: got }], narration: 'Assets realised' }] : [],
    );
  }

  // 5. Assets taken over by a partner, at the agreed value.
  for (const a of f.assets) {
    if (a.fate.kind !== 'taken') continue;
    const { by, amount } = a.fate;
    real('Cr', `${capA(by)} (${a.name.toLowerCase()})`, amount);
    col('Dr', `Realisation A/c (${a.name.toLowerCase()})`, by, amount);
    push(
      'taken',
      `${names[by]} takes over ${a.the}`,
      `${names[by]} takes ${a.the} (book value ${inr(a.book)}) at ${inr(amount)} in place of money: ${names[by]}'s Capital A/c is debited and Realisation A/c credited, as if it were sold. No money moves.`,
      [{ lines: [{ account: capId(by), side: 'Dr', amount }, { account: REAL, side: 'Cr', amount }], narration: `${a.name} taken over by ${names[by]}` }],
    );
  }

  // 6. An asset that was not in the books.
  const ua = f.unrecordedAsset;
  if (ua) {
    if (ua.by === null) {
      real('Cr', `Bank A/c (${ua.what})`, ua.amount);
      money('Dr', `Realisation A/c (${ua.what})`, ua.amount);
    } else {
      real('Cr', `${capA(ua.by)} (${ua.what})`, ua.amount);
      col('Dr', `Realisation A/c (${ua.what})`, ua.by, ua.amount);
    }
    push(
      'unrecordedAsset',
      `${cap(withArticle(ua.what))} that was not in the books`,
      `Nothing was transferred for it, so the whole ${inr(ua.amount)} is a gain on the credit side. ${ua.by === null ? 'It is sold: Bank A/c Dr; To Realisation A/c.' : `${names[ua.by]} takes it over: ${names[ua.by]}'s Capital A/c Dr; To Realisation A/c.`}`,
      [{ lines: [{ account: ua.by === null ? BANK : capId(ua.by), side: 'Dr', amount: ua.amount }, { account: REAL, side: 'Cr', amount: ua.amount }], narration: `Unrecorded ${ua.what} ${ua.by === null ? 'sold' : `taken over by ${names[ua.by]}`}` }],
    );
  }

  // 7. The liabilities paid (the creditors who accepted assets are paid only the balance).
  const accepted = f.assets.filter((a) => a.fate.kind === 'creditors');
  const paid = f.liabilities.filter((l) => l.fate.kind === 'paid' && paidFor(f, l) > 0);
  if (paid.length || accepted.length) {
    for (const l of paid) {
      real('Dr', `Bank A/c (${l.what})`, paidFor(f, l));
      money('Cr', `Realisation A/c (${l.what})`, paidFor(f, l));
    }
    const out = sum(paid.map((l) => paidFor(f, l)));
    const notes: string[] = [];
    const creditors = f.liabilities.find((l) => l.id === 'creditors');
    if (accepted.length && creditors) {
      notes.push(
        `The creditors accept ${list(accepted.map((a) => `${a.the} at ${inr(a.fate.kind === 'creditors' ? a.fate.amount : 0)}`))}: no entry, as the asset and the creditors are both in Realisation A/c already. Only the balance, ${inr(paidFor(f, creditors))}, is paid.`,
      );
    }
    for (const l of f.liabilities) if (l.fate.kind === 'paid' && l.fate.discount > 0) notes.push(`${cap(l.the)}: ${inr(paidFor(f, l))} is paid in full settlement, and the ${inr(l.fate.discount)} given up needs no entry; it stays in Realisation A/c as a gain.`);
    push(
      accepted.length ? 'creditorsAsset' : 'paid',
      'The liabilities are paid',
      `${paid.length ? `Money goes out: ${list(paid.map((l) => `${l.the} ${inr(paidFor(f, l))}`))}. Realisation A/c is debited with what is actually paid and Bank A/c credited. ` : ''}${notes.join(' ')}`.trim(),
      paid.length ? [{ lines: [{ account: REAL, side: 'Dr', amount: out }, { account: BANK, side: 'Cr', amount: out }], narration: 'Liabilities paid' }] : [],
    );
  }

  // 8. Liabilities a partner takes over.
  for (const l of f.liabilities) {
    if (l.fate.kind !== 'taken') continue;
    const by = l.fate.by;
    real('Dr', `${capA(by)} (${l.what})`, l.book);
    col('Cr', `Realisation A/c (${l.what})`, by, l.book);
    push(
      'liabilityTaken',
      `${names[by]} takes over ${l.the}`,
      `${names[by]} agrees to pay ${l.the}, ${inr(l.book)}, personally: the firm now owes ${names[by]} that much, so Realisation A/c is debited and ${names[by]}'s Capital A/c credited. No money of the firm moves.`,
      [{ lines: [{ account: REAL, side: 'Dr', amount: l.book }, { account: capId(by), side: 'Cr', amount: l.book }], narration: `${cap(bare(l))} taken over by ${names[by]}` }],
    );
  }

  // 9. A liability that was not in the books.
  const ul = f.unrecordedLiability;
  if (ul) {
    if (ul.by === null) {
      real('Dr', `Bank A/c (${ul.what})`, ul.amount);
      money('Cr', `Realisation A/c (${ul.what})`, ul.amount);
    } else {
      real('Dr', `${capA(ul.by)} (${ul.what})`, ul.amount);
      col('Cr', `Realisation A/c (${ul.what})`, ul.by, ul.amount);
    }
    push(
      'unrecordedLiability',
      `${cap(withArticle(ul.what))} that was not in the books`,
      `Nothing stood on the credit side for it, so the whole ${inr(ul.amount)} is a loss on the debit side. ${ul.by === null ? 'The firm pays it: Realisation A/c Dr; To Bank A/c.' : `${names[ul.by]} pays it for the firm: Realisation A/c Dr; To ${names[ul.by]}'s Capital A/c.`}`,
      [{ lines: [{ account: REAL, side: 'Dr', amount: ul.amount }, { account: ul.by === null ? BANK : capId(ul.by), side: 'Cr', amount: ul.amount }], narration: `Unrecorded ${ul.what} paid${ul.by === null ? '' : ` by ${names[ul.by]}`}` }],
    );
  }

  // 10. Realisation expenses.
  const e = f.expenses;
  const x = names[e.by] ?? '';
  const expEntries: Entry[] = [];
  let expText = '';
  if (e.form === 'firm') {
    real('Dr', 'Bank A/c (realisation expenses)', e.actual);
    money('Cr', 'Realisation A/c (realisation expenses)', e.actual);
    expEntries.push({ lines: [{ account: REAL, side: 'Dr', amount: e.actual }, { account: BANK, side: 'Cr', amount: e.actual }], narration: 'Realisation expenses paid' });
    expText = `The firm bears and pays the expenses, ${inr(e.actual)}: Realisation A/c Dr; To Bank A/c.`;
  } else if (e.form === 'partnerPays') {
    real('Dr', `${capA(e.by)} (realisation expenses)`, e.actual);
    col('Cr', 'Realisation A/c (realisation expenses)', e.by, e.actual);
    expEntries.push({ lines: [{ account: REAL, side: 'Dr', amount: e.actual }, { account: capId(e.by), side: 'Cr', amount: e.actual }], narration: `Realisation expenses paid by ${x} for the firm` });
    expText = `The firm bears the expenses, ${inr(e.actual)}, but ${x} paid them: the firm owes ${x} the amount. Realisation A/c Dr; To ${x}'s Capital A/c.`;
  } else if (e.form === 'feePersonal' || e.form === 'feeFirmPays') {
    real('Dr', `${capA(e.by)} (remuneration)`, e.fee);
    col('Cr', 'Realisation A/c (remuneration)', e.by, e.fee);
    expEntries.push({ lines: [{ account: REAL, side: 'Dr', amount: e.fee }, { account: capId(e.by), side: 'Cr', amount: e.fee }], narration: `Remuneration to ${x} for carrying out the dissolution` });
    expText = `${x} bears the expenses for a remuneration of ${inr(e.fee)}: Realisation A/c is debited with the remuneration, whatever the expenses come to, and ${x}'s Capital A/c credited.`;
    if (e.form === 'feeFirmPays') {
      col('Dr', 'Bank A/c (realisation expenses)', e.by, e.actual);
      money('Cr', `${capA(e.by)} (realisation expenses)`, e.actual);
      expEntries.push({ lines: [{ account: capId(e.by), side: 'Dr', amount: e.actual }, { account: BANK, side: 'Cr', amount: e.actual }], narration: `Realisation expenses paid by the firm on behalf of ${x}` });
      expText += ` The firm paid the expenses, ${inr(e.actual)}, on ${x}'s behalf: ${x}'s Capital A/c Dr; To Bank A/c.`;
    } else {
      expText += ` ${x} paid the expenses, ${inr(e.actual)}, personally: no entry.`;
    }
  } else if (e.form === 'borneFirmPays') {
    col('Dr', 'Bank A/c (realisation expenses)', e.by, e.actual);
    money('Cr', `${capA(e.by)} (realisation expenses)`, e.actual);
    expEntries.push({ lines: [{ account: capId(e.by), side: 'Dr', amount: e.actual }, { account: BANK, side: 'Cr', amount: e.actual }], narration: `Realisation expenses paid by the firm on behalf of ${x}` });
    expText = `${x} is to bear the expenses, with no remuneration, but the firm paid them, ${inr(e.actual)}: they are charged to ${x}, not to Realisation A/c. ${x}'s Capital A/c Dr; To Bank A/c.`;
  } else {
    expText = `${x} is to bear the expenses, with no remuneration, and paid them, ${inr(e.actual)}, personally: the firm neither bears nor pays them, so there is no entry.`;
  }
  push('expenses', 'Realisation expenses', expText, expEntries);

  // 11. The profit or loss on realisation, shared in the profit-sharing ratio.
  const debit = sum(R.dr.map((r) => r.amount));
  const credit = sum(R.cr.map((r) => r.amount));
  const result = credit - debit;
  const shares = splitByRatio(result, ratio);
  if (result > 0) {
    shares.forEach((s, i) => {
      real('Dr', `${capA(i)} (profit)`, s);
      col('Cr', 'Realisation A/c (profit)', i, s);
    });
  } else if (result < 0) {
    shares.forEach((s, i) => {
      real('Cr', `${capA(i)} (loss)`, -s);
      col('Dr', 'Realisation A/c (loss)', i, -s);
    });
  }
  push(
    'result',
    result > 0 ? 'The profit on realisation is shared' : result < 0 ? 'The loss on realisation is shared' : 'No profit and no loss on realisation',
    `Debit side ${inr(debit)}, credit side ${inr(credit)}: ${result > 0 ? `the credit side is heavier, a profit of ${inr(result)}` : result < 0 ? `the debit side is heavier, a loss of ${inr(-result)}` : 'they agree'}.${result ? ` It is shared ${ratioText}, the profit-sharing ratio (never the capital ratio): ${shareText(shares)}.` : ''}`,
    result
      ? [
          {
            lines:
              result > 0
                ? [{ account: REAL, side: 'Dr', amount: result }, ...shares.map((s, i): Line => ({ account: capId(i), side: 'Cr', amount: s }))]
                : [...shares.map((s, i): Line => ({ account: capId(i), side: 'Dr', amount: -s })), { account: REAL, side: 'Cr', amount: -result }],
            narration: result > 0 ? 'Profit on realisation shared' : 'Loss on realisation shared',
          },
        ]
      : [],
  );

  // 12. A partner's own loan: after the outside liabilities, before the capitals.
  if (loans.length) {
    for (const p of loans) money('Cr', `${ledgerLabel(partnerLoan(p.name))}`, p.loan);
    push(
      'loans',
      loans.length > 1 ? "The partners' loans are repaid" : `${loans[0].name}'s loan is repaid`,
      `A partner's own loan never goes to Realisation A/c. It is repaid after the outside liabilities and before the capitals (section 48): ${list(loans.map((p) => `${p.name}'s Loan A/c Dr ${inr(p.loan)}`))}; To Bank A/c.`,
      loans.map((p) => ({ lines: [{ account: partnerLoan(p.name), side: 'Dr', amount: p.loan }, { account: BANK, side: 'Cr', amount: p.loan }], narration: `${p.name}'s loan repaid` })),
    );
  }

  // 13. A debit balance is brought in; 14. every credit balance is paid, and the bank is empty.
  const finals = [...capital];
  const short = finals.map((v, i) => (v < 0 ? i : -1)).filter((i) => i >= 0);
  if (short.length) {
    for (const i of short) {
      money('Dr', capA(i), -finals[i]);
      col('Cr', 'Bank A/c', i, -finals[i]);
    }
    const lender = short.find((i) => f.partners[i].loan > 0);
    if (lender !== undefined && !problem) problem = `${names[lender]}'s capital account ends in debit while the firm owes ${names[lender]} a loan: the two would be set off, which this lab does not show. Change the figures.`;
    push(
      'broughtIn',
      `${list(short.map((i) => names[i]))} ${short.length > 1 ? 'bring' : 'brings'} in cash`,
      `${list(short.map((i) => `${names[i]}'s capital account shows a debit balance of ${inr(-finals[i])}`))}: the partner owes the firm that much and brings it in. Bank A/c Dr; To ${short.map(capA).join(', ')}.`,
      short.map((i) => ({ lines: [{ account: BANK, side: 'Dr', amount: -finals[i] }, { account: capId(i), side: 'Cr', amount: -finals[i] }], narration: `Deficiency brought in by ${names[i]}` })),
    );
  }
  const owed = finals.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
  for (const i of owed) {
    col('Dr', 'Bank A/c', i, finals[i]);
    money('Cr', capA(i), finals[i]);
  }
  push(
    'final',
    'The partners are paid, and the books close',
    `${owed.length ? `${list(owed.map((i) => `${names[i]} ${inr(finals[i])}`))}: each capital account is debited with its balance and Bank A/c credited.` : 'No partner has anything left to be paid.'} ${bank === 0 ? 'The bank is left with nothing, and every account is closed.' : `The bank is left with ${inr(bank)}.`}`,
    owed.length ? [{ lines: [...owed.map((i): Line => ({ account: capId(i), side: 'Dr', amount: finals[i] })), { account: BANK, side: 'Cr', amount: sum(owed.map((i) => finals[i])) }], narration: 'Final payment to the partners' }] : [],
  );
  if (bank !== 0 && !problem) problem = 'The bank does not end at nil.';

  return { firm: f, bank: bank0, steps, realisation: R, capitals: C, bankAccount: B, realisationDebit: debit, realisationCredit: credit, result, shares, finals, problem };
}

/** The steps a row has appeared by, after `shown` steps. */
export const visible = <T extends { step: number }>(rows: readonly T[], shown: number): T[] => rows.filter((r) => r.step < shown);

/** What happened on dissolution, one event to a line, as a question tells it. */
export function eventsOf(f: DFirm): string[] {
  const names = f.partners.map((p) => p.name);
  const out: string[] = [];
  for (const a of f.assets) {
    if (a.fate.kind === 'sold') out.push(`${cap(a.the)} realised ${inr(a.fate.amount)}.`);
    if (a.fate.kind === 'taken') out.push(`${names[a.fate.by]} took over ${a.the} at ${inr(a.fate.amount)}.`);
    if (a.fate.kind === 'creditors') out.push(`The creditors accepted ${a.the} at ${inr(a.fate.amount)} in part settlement of their claim${f.liabilities.some((l) => l.id === 'creditors' && l.fate.kind === 'paid' && l.fate.discount > 0) ? '' : ' and were paid the balance'}.`);
  }
  if (f.assets.some((a) => a.fate.kind === 'silent')) out.push('Nothing is said about the other assets.');
  if (f.unrecordedAsset) out.push(f.unrecordedAsset.by === null ? `${cap(withArticle(f.unrecordedAsset.what))}, not in the books, was sold for ${inr(f.unrecordedAsset.amount)}.` : `${names[f.unrecordedAsset.by]} took over ${withArticle(f.unrecordedAsset.what)}, not in the books, at ${inr(f.unrecordedAsset.amount)}.`);
  for (const l of f.liabilities) {
    if (l.fate.kind === 'taken') out.push(`${names[l.fate.by]} agreed to pay ${l.the}, ${inr(l.book)}, personally.`);
    else if (l.fate.discount > 0) out.push(`${cap(l.the)} ${were(l)} paid ${inr(paidFor(f, l))} in full settlement${l.id === 'creditors' && acceptedOf(f) > 0 ? ' of the balance' : ''}.`);
    else if (!(l.id === 'creditors' && acceptedOf(f) > 0)) out.push(`${cap(l.the)} ${were(l)} paid in full.`);
  }
  if (f.unrecordedLiability) out.push(f.unrecordedLiability.by === null ? `${cap(withArticle(f.unrecordedLiability.what))} of ${inr(f.unrecordedLiability.amount)}, not in the books, was paid by the firm.` : `${names[f.unrecordedLiability.by]} paid ${withArticle(f.unrecordedLiability.what)} of ${inr(f.unrecordedLiability.amount)}, not in the books, for the firm.`);
  out.push(expensesText(f));
  return out;
}

/** The realisation expenses, as a question says them. */
export function expensesText(f: DFirm): string {
  const e = f.expenses;
  const x = f.partners[e.by]?.name ?? '';
  switch (e.form) {
    case 'firm':
      return `Realisation expenses of ${inr(e.actual)} were borne and paid by the firm.`;
    case 'partnerPays':
      return `Realisation expenses of ${inr(e.actual)} were to be borne by the firm; ${x} paid them personally.`;
    case 'feePersonal':
      return `${x} was to bear the realisation expenses for a remuneration of ${inr(e.fee)}; ${x} paid the expenses, ${inr(e.actual)}, personally.`;
    case 'feeFirmPays':
      return `${x} was to bear the realisation expenses for a remuneration of ${inr(e.fee)}; the firm paid the expenses, ${inr(e.actual)}, on ${x}'s behalf.`;
    case 'borneFirmPays':
      return `${x} agreed to bear the realisation expenses without any remuneration; the firm paid them, ${inr(e.actual)}, on ${x}'s behalf.`;
    case 'bornePersonal':
      return `${x} agreed to bear the realisation expenses without any remuneration and paid them, ${inr(e.actual)}, personally.`;
  }
}

export const EXPENSE_NAME: Record<ExpenseForm, string> = {
  firm: 'Borne and paid by the firm',
  partnerPays: 'Borne by the firm, paid by a partner',
  feePersonal: 'A partner bears them for a remuneration, and pays them',
  feeFirmPays: 'A partner bears them for a remuneration; the firm pays them',
  borneFirmPays: 'A partner bears them (no remuneration); the firm pays them',
  bornePersonal: 'A partner bears and pays them (no remuneration)',
};
