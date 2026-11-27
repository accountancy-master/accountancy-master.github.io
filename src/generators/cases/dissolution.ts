/**
 * Case studies of the dissolution stage (Class 12): a firm is dissolved, its assets are realised, its liabilities
 * paid and the partners settled with. Four cases of short questions come first, then three chained cases, the long
 * question of the examination: Realisation A/c, the partners' capital accounts and Bank A/c from one balance sheet.
 *
 * Everything here keeps to the conventions of the examined topic (`templates/dissolution-of-partnership.ts`), whose
 * wording, figures and checks the cases reuse. Each is stated in the case text where a part relies on it: the
 * capitals are fluctuating; every receipt and payment is by cheque; an asset whose realised value is not given
 * realises its book value if tangible and nothing if intangible; who bears and who pays the realisation expenses;
 * a remuneration is never less than ₹3,000 nor equal to the expenses. Outside the scope (CBSE 2025-26): insolvency of
 * a partner, piecemeal distribution and a sale to a company. A partner's own loan is repaid after the outside
 * liabilities and before the capitals, and never goes to Realisation A/c; a loan from a partner's relative is an
 * outside liability; a loan to a partner is set off against that partner's capital; the provision for doubtful
 * debts goes to the credit of Realisation A/c; cash and bank, fictitious assets, reserves and accumulated profits or
 * losses, and the capitals stay out of it. A partner who lent the firm money is never the one who falls short.
 *
 * The chained cases are made from one whole dissolution (`windUp`), whose entries the engine posts to write every
 * account, so the Realisation Account, the capital accounts and the Bank Account of a case cannot disagree. A later
 * part starts from what the part before ends on (the profit or loss on realisation, the balances of the capital
 * accounts), and the case text never prints it.
 */
import type { JournalQuestion, JournalSetQuestion, McqQuestion, NumericQuestion } from '@/content/types';
import { partnerCapital, partnerLoan } from '@/engine/accounts';
import { post } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import { caseTemplate, formatINR, keepFor, partnerColumns, rupees } from '../authoring';
import {
  FLUCTUATING,
  FORMAT_HINTS,
  H,
  HANDY,
  INVESTMENTS,
  REALISATION_TASK,
  SET_HINTS,
  TANGIBLE,
  TRANSFERRED,
  UNRECORDED_ASSETS,
  UNRECORDED_LIABS,
  capitalAccounts,
  capitalSlips,
  capitalWorking,
  capitalsHoldFor,
  caseData,
  chargeOf,
  chargedFor,
  choice,
  closes,
  creditedFor,
  firm,
  forFee,
  fraction,
  moneyAccount,
  moneyHoldsFor,
  moneySlips,
  moneyWorking,
  namesIn,
  numeric,
  profitOrLoss,
  ratioIn,
  realisationAccount,
  realisationHoldsFor,
  realisationNotes,
  realisationSlips,
  relative,
  resultLine,
  shareOf,
  was,
  windUp,
  type Books,
  type ExpenseForm,
  type Firm,
  type Item,
  type Step,
  type Thing,
} from '../templates/dissolution-of-partnership';
import type { CaseAccountParts, CaseTemplate } from '../types';

const T = 'dissolution-of-partnership';
const C = 'dis-case';
const REAL = 'realisation';

/** Whole rupees as the amount text a learner sees. */
const inr = (n: number): string => formatINR(rupees(n));
const dr = (accountId: string, n: number): JournalLine => ({ accountId, side: 'Dr', amount: rupees(n) });
const cr = (accountId: string, n: number): JournalLine => ({ accountId, side: 'Cr', amount: rupees(n) });
const total = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0);
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const low = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);
const list = (xs: readonly string[]): string => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const ROMAN = ['(i)', '(ii)', '(iii)', '(iv)', '(v)', '(vi)', '(vii)', '(viii)', '(ix)', '(x)'];
const optionText = (q: McqQuestion): string => q.options.find((o) => o.id === q.correct)?.text ?? '';
const hasLine = (lines: readonly JournalLine[], accountId: string, side: 'Dr' | 'Cr', n: number): boolean =>
  lines.some((l) => l.accountId === accountId && l.side === side && l.amount === rupees(n));
/** The "Label: ₹amount" lines of a case text, in order. */
const figures = (text: string): [string, number][] =>
  text.split('\n').flatMap((l): [string, number][] => {
    const m = /^(.+): ₹([\d,]+)$/.exec(l.trim());
    return m ? [[m[1], Number(m[2].replace(/,/g, ''))]] : [];
  });
/** The lines of a case text between a heading and the next heading ("Liabilities:", "Assets:", "On dissolution:"). */
const under = (text: string, heading: string): string[] => {
  const lines = text.split('\n');
  const from = lines.indexOf(heading);
  if (from < 0) return [];
  const rest = lines.slice(from + 1);
  const end = rest.findIndex((l) => /^[A-Z][A-Za-z ]+:$/.test(l));
  return end < 0 ? rest : rest.slice(0, end);
};
/** A partner's share of an amount, from the names and the ratio the case text states. */
const shareInText = (text: string, name: string, amount: number): number => {
  const ratio = ratioIn(text);
  return (amount * ratio[namesIn(text).indexOf(name)]) / total(ratio);
};
/** The balance of Realisation A/c once the entries are posted: positive for a profit (a credit balance). */
const realisationResult = (entries: readonly JournalLine[][]): number => -(post([...entries]).get(REAL) ?? 0) / 100;

// ===============================================================================================================
// 1. What goes to Realisation A/c (medium): a balance sheet in short and five things that happen on dissolution.
//    Which balance goes where, the total of one side of the transfers, the entry for an asset a partner takes
//    over, the result on realisation and one partner's share of it. What varies: which balances stand outside
//    Realisation A/c (a partner's loan, a loan to a partner, a reserve, a past loss, a fictitious asset), whether a
//    loan from a relative or a provision is among those that go, which asset is taken over, who pays the expenses,
//    and whether the firm makes a profit or a loss. Working out the result from about ten items is not an easy
//    question, so the case is medium.
// ===============================================================================================================

type Side = 'L' | 'A';
/** A balance of the balance sheet: where it goes on dissolution, why, and the slip of putting it elsewhere. */
interface Bal {
  label: string;
  amount: number;
  side: Side;
  goes: 'debit' | 'credit' | null;
  /** Why it goes where it goes (or stays out). */
  rule: string;
  /** What a student who sends it the wrong way has done. */
  slip: string;
}

interface Items {
  f: Firm;
  /** The partner who takes the asset over, and the partner whose share is asked. */
  x: number;
  y: number;
  sheet: Bal[];
  events: string[];
  taken: { t: Thing; book: number; at: number };
  provision: number;
  /** What the creditors gave up when they were paid. */
  discount: number;
  expenses: { amount: number; by: number | null };
  /** The balances that stay out of Realisation A/c and would change its result if sent there (with the slip). */
  result: number;
  slips: [number, string][];
  entries: JournalLine[][];
  ask: 'debit' | 'credit' | 'not';
  /** The balance the first question is about. */
  pick: Bal;
  sum: 'debit' | 'credit';
}

const OUTSIDE_DEBIT = 'Cash at bank';
/** A balance named inside a sentence: a common noun is lowered ("the stock"), the name of an account or a person is not. */
const bare = (label: string): string => (/A\/c|General Reserve|^Loan|'s /.test(label) ? label : low(label));
const named = (label: string): string => (bare(label) === label ? label : `the ${bare(label)}`);
/** The balances of a sheet that do not go to Realisation A/c, read back from their names alone (for `verify`). */
const STAYS_OUT = /^(Cash at bank|Advertisement Suspense A\/c|Profit and Loss A\/c \((credit|debit) balance\)|Loan to [A-Z][a-z]+|General Reserve|[A-Z][a-z]+'s loan)$/;

const keptItems = keepFor<Items>();

const itemsCase = caseTemplate<Items>({
  id: 'case-dis-what-goes',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'What goes to Realisation A/c',
  setup: (rng) => {
    const f = firm(rng);
    const n = f.names.length;
    const who = (i: number): string => f.names[i];
    const x = rng.int(0, n - 1);
    const y = rng.int(0, n - 1);

    // What goes to the debit: the main fixed asset (sold), the stock, the debtors and, when the stock is not the one
    // a partner takes over, a second asset that is.
    const main = rng.pick([TANGIBLE[1], TANGIBLE[3], TANGIBLE[4]]);
    const mainBook = rng.step(120000, 400000, 10000);
    const stockBook = rng.step(40000, 160000, 10000);
    const stockAt = stockBook + (stockBook / 100) * rng.pick([-20, -10, 10]);
    const debtors = rng.step(60000, 200000, 10000);
    const bad = rng.step(1000, 12000, 1000);
    const provision = rng.int(0, 2) > 0 ? rng.step(2000, 10000, 1000) : 0;
    const takeStock = rng.int(0, 2) === 0;
    const second = rng.pick([TANGIBLE[2], TANGIBLE[5], TANGIBLE[6], INVESTMENTS]);
    const secondBook = rng.step(20000, 80000, 5000);
    const taken = takeStock
      ? { t: TANGIBLE[0], book: stockBook, at: stockAt }
      : { t: second, book: secondBook, at: secondBook + rng.pick([-10000, -5000, 5000, 10000]) };
    // A partner takes an asset over near its book value, not at half of it.
    if (taken.at < taken.book * 0.75) return null;

    // What goes to the credit: the creditors (paid in full or at a discount), sometimes a second outside liability.
    const creditors = rng.step(50000, 150000, 5000);
    const discount = rng.int(0, 1) === 0 ? rng.step(1000, 5000, 1000) : 0;
    const otherKind = rng.pick(['none', 'billsPayable', 'bankLoan', 'relative', 'relative'] as const);
    const r = relative(rng, who(rng.int(0, n - 1)));
    const other =
      otherKind === 'billsPayable'
        ? { label: 'Bills payable', the: 'the bills payable', plural: true, amount: rng.step(10000, 50000, 5000) }
        : otherKind === 'bankLoan'
          ? { label: 'Bank loan', the: 'the bank loan', plural: false, amount: rng.step(50000, 150000, 10000) }
          : otherKind === 'relative'
            ? { label: `Loan from ${r.as}`, the: `the loan from ${r.name}`, plural: false, amount: rng.step(20000, 60000, 10000) }
            : null;

    // What stays out: the bank balance always, a reserve or an accumulated profit or loss always, and one or two of a
    // partner's own loan, a loan to a partner and a fictitious asset.
    const accumulated = rng.pick(['reserve', 'profit', 'loss'] as const);
    const kept = f.sum * rng.step(2000, 8000, 1000);
    const extras = rng.shuffle(['loan', 'loanTo', 'suspense'] as const).slice(0, rng.int(1, 2));
    const lender = rng.int(0, n - 1);
    const borrower = rng.int(0, n - 1);
    // A partner who has lent the firm money has not also borrowed from it.
    if (extras.includes('loan') && extras.includes('loanTo') && lender === borrower) return null;
    const bank = rng.step(15000, 60000, 5000);

    const e = rng.step(2000, 10000, 1000);
    const payer = rng.int(0, 2) === 0 ? rng.int(0, n - 1) : null;

    // The price of the main asset is settled last, so that every share of the result is in whole hundreds of rupees.
    const fixed =
      creditors + (other?.amount ?? 0) + provision + (takeStock ? 0 : stockAt) + (debtors - bad) + taken.at -
      (stockBook + debtors + (takeStock ? 0 : secondBook) + (creditors - discount) + (other?.amount ?? 0) + e);
    const unit = f.sum * 100;
    const base = mainBook + (mainBook / 100) * rng.pick([-20, -10, 10, 20]);
    let k = 0;
    while (k < 10 && (((base - mainBook + fixed - k * 1000) % unit) + unit) % unit !== 0) k++;
    if (k === 10) return null;
    const mainAt = base - k * 1000;
    // The main fixed asset (land or a building among them) fetches no less than about four-fifths of its book value.
    if (mainAt < mainBook * 0.78) return null;
    const result = mainAt - mainBook + fixed;
    if (Math.abs(result) < f.sum * 1000) return null;

    const asset = (label: string, amount: number, slip: string): Bal => ({ label, amount, side: 'A', goes: 'debit', rule: `${label} ${/s$/.test(label) ? 'are' : 'is'} an asset to be realised, so ${/s$/.test(label) ? 'they go' : 'it goes'} to the debit side at book value.`, slip });
    const sheet: Bal[] = [
      {
        label: 'Creditors', amount: creditors, side: 'L', goes: 'credit',
        rule: 'Creditors are an outside liability, so they go to the credit side.',
        slip: 'Took the creditors for a balance that stays out; they are owed to outsiders and go to the credit side.',
      },
      ...(other
        ? [{
            label: other.label, amount: other.amount, side: 'L' as const, goes: 'credit' as const,
            rule: otherKind === 'relative' ? `${r.name} is not a partner, so the loan is an outside liability and goes to the credit side.` : `${cap(other.the)} ${other.plural ? 'are' : 'is'} an outside liability, so ${other.plural ? 'they go' : 'it goes'} to the credit side.`,
            slip:
              otherKind === 'relative'
                ? `Kept the loan from ${r.name} out, as if it were a partner's own loan; a relative of a partner is an outsider.`
                : `Kept ${other.the} out of Realisation A/c; ${other.plural ? 'they are' : 'it is'} owed to an outsider.`,
          }]
        : []),
      ...(extras.includes('loan')
        ? [{
            label: `${who(lender)}'s loan`, amount: rng.step(20000, 60000, 10000), side: 'L' as const, goes: null,
            rule: `${who(lender)}'s loan is a partner's own loan: it stays in its account and is repaid after the outside liabilities.`,
            slip: `Sent ${who(lender)}'s own loan to Realisation A/c; a partner's loan is kept apart and repaid by itself after the outside liabilities.`,
          }]
        : []),
      ...(provision
        ? [{
            label: 'Provision for doubtful debts', amount: provision, side: 'L' as const, goes: 'credit' as const,
            rule: 'The provision stands against the debtors, which go to the debit side at their gross figure: it goes to the credit side.',
            slip: 'Put the provision for doubtful debts on the debit side; it is a credit balance and goes to the credit side, against the debtors at their gross figure.',
          }]
        : []),
      ...(accumulated === 'reserve'
        ? [{
            label: 'General Reserve', amount: kept, side: 'L' as const, goes: null,
            rule: "General Reserve is profit kept back: it is credited to the partners' capital accounts.",
            slip: "Took General Reserve for a debt; it is profit kept back and goes straight to the partners' capital accounts.",
          }]
        : accumulated === 'profit'
          ? [{
              label: 'Profit and Loss A/c (credit balance)', amount: kept, side: 'L' as const, goes: null,
              rule: "The credit balance of Profit and Loss A/c is undistributed profit: it is credited to the partners' capital accounts.",
              slip: "Took the undistributed profit for a debt; it goes straight to the partners' capital accounts.",
            }]
          : []),
      {
        label: OUTSIDE_DEBIT, amount: bank, side: 'A', goes: null,
        rule: 'The cash at bank is already money: it stays in Bank A/c.',
        slip: 'Sent the bank balance to Realisation A/c; it is already money, so it stays in Bank A/c.',
      },
      asset(main.name, mainBook, `Kept ${main.the} out of Realisation A/c; every asset but money and fictitious assets goes there at book value.`),
      asset('Stock', stockBook, 'Kept the stock out of Realisation A/c; it is an asset to be realised.'),
      {
        ...asset('Debtors', debtors, 'Kept the debtors out of Realisation A/c; they are an asset to be collected.'),
        rule: `Debtors are an asset to be collected, so they go to the debit side at their gross figure${provision ? ', with the provision on the credit side' : ''}.`,
      },
      ...(takeStock ? [] : [asset(second.name, secondBook, `Kept ${second.the} out of Realisation A/c because ${who(x)} took ${second.plural ? 'them' : 'it'} over; ${second.plural ? 'they are' : 'it is'} transferred at book value all the same.`)]),
      ...(extras.includes('loanTo')
        ? [{
            label: `Loan to ${who(borrower)}`, amount: rng.step(10000, 40000, 5000), side: 'A' as const, goes: null,
            rule: `The loan to ${who(borrower)} is not sold to anyone: it is set off against ${who(borrower)}'s capital.`,
            slip: `Took the loan to ${who(borrower)} for an asset to be sold; it is set off against ${who(borrower)}'s capital account.`,
          }]
        : []),
      ...(extras.includes('suspense')
        ? [{
            label: 'Advertisement Suspense A/c', amount: rng.step(5000, 30000, 5000), side: 'A' as const, goes: null,
            rule: "Advertisement Suspense A/c is a fictitious asset that cannot be sold: it is written off to the partners' capital accounts.",
            slip: "Took a fictitious asset for something that can be sold; it is written off to the partners' capital accounts.",
          }]
        : []),
      ...(accumulated === 'loss'
        ? [{
            label: 'Profit and Loss A/c (debit balance)', amount: kept, side: 'A' as const, goes: null,
            rule: "The debit balance of Profit and Loss A/c is a past loss: it is written off to the partners' capital accounts.",
            slip: "Took a past loss for an asset that can be sold; it is written off to the partners' capital accounts.",
          }]
        : []),
    ];

    // The first question: a balance that goes to the debit, one that goes to the credit, or one that stays out.
    const wrongFor = (ask: Items['ask']): Bal[] =>
      ask === 'debit'
        ? sheet.filter((b) => b.side === 'A' ? b.goes === null : b.goes === 'credit' && b.label.startsWith('Provision'))
        : ask === 'credit'
          ? sheet.filter((b) => b.side === 'L' && b.goes === null)
          : sheet.filter((b) => b.goes !== null);
    // On the credit side the capitals are one more balance that stays out.
    const enough = (ask: Items['ask']): boolean => wrongFor(ask).length + (ask === 'credit' ? 1 : 0) >= 3;
    const ask = rng.pick((['debit', 'credit', 'not'] as const).filter(enough));
    const right = sheet.filter((b) => (ask === 'not' ? b.goes === null : b.goes === ask));
    const pickBal = rng.pick(right);

    // The total asked is of the other side where it can be (a seed whose first question is about the debit asks the
    // credit total), and of the debit side, which always has two slips to offer, otherwise.
    const creditSlips = sheet.filter((b) => b.side === 'L' && b.goes === null).length + (provision ? 1 : 0) + (discount ? 1 : 0) + (otherKind === 'relative' ? 1 : 0);
    const sum = ask === 'debit' && creditSlips >= 2 ? 'credit' : ask === 'credit' ? 'debit' : creditSlips >= 2 && rng.int(0, 1) === 0 ? 'credit' : 'debit';

    const events = [
      `${cap(main.the)} ${was(main)} sold for ${inr(mainAt)}.`,
      takeStock ? `${who(x)} took over the stock at an agreed value of ${inr(stockAt)}.` : `The stock was sold for ${inr(stockAt)}.`,
      ...(takeStock ? [] : [`${who(x)} took over ${second.the} at an agreed value of ${inr(taken.at)}.`]),
      rng.int(0, 1) === 0 ? `Bad debts came to ${inr(bad)}; the remaining debtors paid in full.` : `The debtors realised ${inr(debtors - bad)}.`,
      `${discount ? `The creditors were paid ${inr(creditors - discount)} in full settlement` : 'The creditors were paid in full'}${other ? `, and ${other.the} ${other.plural ? 'were' : 'was'} paid in full` : ''}.`,
      payer === null
        ? `Realisation expenses of ${inr(e)} were borne and paid by the firm.`
        : `Realisation expenses of ${inr(e)} were to be borne by the firm; ${who(payer)} paid them out of ${who(payer)}'s own money.`,
    ];

    const slips: [number, string][] = [
      [e, `Left out the realisation expenses${payer === null ? '' : `, which the firm bears though ${who(payer)} paid them`}.`],
      [-taken.at, `Left out ${taken.t.the} taken over by ${who(x)}, which ${taken.t.plural ? 'are' : 'is'} credited to Realisation A/c like a sale.`],
      [-bank, 'Debited the cash at bank to Realisation A/c; it is already money and stays in Bank A/c.'],
      ...(provision ? [[-provision, 'Left the provision for doubtful debts out of the credit side of Realisation A/c.'] as [number, string]] : []),
      ...(discount ? [[-discount, 'Took the creditors as paid in full, missing the discount they allowed.'] as [number, string]] : []),
      ...sheet.filter((b) => b.goes === null && b.label !== OUTSIDE_DEBIT && !b.label.endsWith("'s loan")).map((b): [number, string] => [b.side === 'L' ? b.amount : -b.amount, `In Realisation A/c: ${low(b.slip)}`]),
    ];

    const transfer = sheet.filter((b) => b.goes !== null);
    const idOf = (b: Bal): string =>
      b.label === 'Creditors' ? 'creditors' : b.label === 'Bills payable' ? 'billsPayable' : b.label === 'Bank loan' ? 'bankLoan' : b.label.startsWith('Loan from') ? partnerLoan(r.name)
        : b.label.startsWith('Provision') ? 'provisionForDoubtfulDebts' : b.label === 'Stock' ? 'stock' : b.label === 'Debtors' ? 'debtors' : b.label === main.name ? main.id : second.id;
    const debitSide = transfer.filter((b) => b.goes === 'debit');
    const creditSide = transfer.filter((b) => b.goes === 'credit');
    const capital = (i: number): string => partnerCapital(who(i));
    const entries: JournalLine[][] = [
      [dr(REAL, total(debitSide.map((b) => b.amount))), ...debitSide.map((b) => cr(idOf(b), b.amount))],
      [...creditSide.map((b) => dr(idOf(b), b.amount)), cr(REAL, total(creditSide.map((b) => b.amount)))],
      [dr('bank', mainAt + (takeStock ? 0 : stockAt) + debtors - bad), cr(REAL, mainAt + (takeStock ? 0 : stockAt) + debtors - bad)],
      [dr(capital(x), taken.at), cr(REAL, taken.at)],
      [dr(REAL, creditors - discount + (other?.amount ?? 0)), cr('bank', creditors - discount + (other?.amount ?? 0))],
      [dr(REAL, e), cr(payer === null ? 'bank' : capital(payer), e)],
    ];
    return { f, x, y, sheet, events, taken, provision, discount, expenses: { amount: e, by: payer }, result, slips, entries, ask, pick: pickBal, sum };
  },
  context: (s) => {
    const text = [
      `${s.f.intro} The partners' capitals were fluctuating, and every receipt and payment of the firm was by cheque. Besides the partners' capitals, its balance sheet on that date showed these balances:`,
      'Liabilities:',
      ...s.sheet.filter((b) => b.side === 'L').map((b) => `${b.label}: ${inr(b.amount)}`),
      'Assets:',
      ...s.sheet.filter((b) => b.side === 'A').map((b) => `${b.label}: ${inr(b.amount)}`),
      'On dissolution:',
      ...s.events.map((t, i) => `${ROMAN[i]} ${t}`),
    ].join('\n');
    keptItems.keep(text, s);
    return text;
  },
  parts: [
    {
      kind: 'mcq',
      make: (s) => {
        const capitals: [string, string] = ["Partners' capitals", 'Sent the capitals to Realisation A/c; capital accounts stay open to the end and are closed through Bank A/c.'];
        const wrong: [string, string][] =
          s.ask === 'debit'
            ? s.sheet.filter((b) => (b.side === 'A' ? b.goes === null : b.label.startsWith('Provision'))).map((b) => [b.label, b.slip])
            : s.ask === 'credit'
              ? [...s.sheet.filter((b) => b.side === 'L' && b.goes === null).map((b): [string, string] => [b.label, b.slip]), capitals]
              : s.sheet.filter((b) => b.goes !== null).map((b) => [b.label, `Kept this out of Realisation A/c. ${b.rule}`]);
        const where = s.ask === 'debit' ? 'is transferred to the debit side of' : s.ask === 'credit' ? 'is transferred to the credit side of' : 'is NOT transferred to';
        const side = s.pick.side === 'A' ? 'assets' : 'liabilities';
        return choice(
          `Which of these balances ${where} Realisation A/c?`,
          s.pick.label,
          wrong,
          `${s.pick.label} (${side} side). ${s.pick.rule} Only the assets that can be turned into money (other than cash and bank), the debts due to outsiders and a provision against an asset go to Realisation A/c.`,
          H.realisation,
        );
      },
      verify: (q) => {
        const answer = optionText(q);
        const text = q.context ?? '';
        const onSide = (heading: string) => figures(under(text, heading).join('\n')).some(([label]) => label === answer);
        if (q.prompt.includes('NOT transferred')) return STAYS_OUT.test(answer) && (onSide('Liabilities:') || onSide('Assets:'));
        const goes = !STAYS_OUT.test(answer);
        return goes && (q.prompt.includes('debit side') ? onSide('Assets:') : onSide('Liabilities:'));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const side = s.sum;
        const going = s.sheet.filter((b) => b.goes === side);
        const answer = total(going.map((b) => b.amount));
        const out = s.sheet.filter((b) => b.goes === null && b.side === (side === 'debit' ? 'A' : 'L'));
        const errs: [number, string][] =
          side === 'debit'
            ? [
                [answer - s.taken.book, `Left out ${s.taken.t.the}, because ${s.f.names[s.x]} took ${s.taken.t.plural ? 'them' : 'it'} over; ${s.taken.t.plural ? 'they are' : 'it is'} transferred at book value like every other asset.`],
                ...out.map((b): [number, string] => [answer + b.amount, `Included ${named(b.label)}. ${b.slip}`]),
                ...(s.provision ? [[answer - s.provision, 'Transferred the debtors net of the provision; they go at their gross figure and the provision goes to the credit side.'] as [number, string]] : []),
              ]
            : [
                ...out.map((b): [number, string] => [answer + b.amount, `Included ${named(b.label)}. ${b.slip}`]),
                ...(s.provision ? [[answer - s.provision, 'Left out the provision for doubtful debts, which is transferred to the credit side.'] as [number, string]] : []),
                ...s.sheet.filter((b) => b.label.startsWith('Loan from')).map((b): [number, string] => [answer - b.amount, b.slip]),
                ...(s.discount
                  ? [[answer - s.discount, 'Transferred the creditors at what they were later paid; they go at their book figure, and the discount shows in the balance of Realisation A/c.'] as [number, string]]
                  : []),
              ];
        const n = numeric(answer, errs);
        return (
          n && {
            prompt: `What is the total of the balances above that are transferred to the ${side} side of Realisation A/c?`,
            ...n,
            explanation: [
              `Transferred to the ${side} side: ${going.map((b) => `${bare(b.label)} ${inr(b.amount)}`).join(', ')}.`,
              ...(side === 'debit' && s.provision ? ['The debtors go at their gross figure; the provision against them goes to the credit side.'] : []),
              `Total = ${going.map((b) => inr(b.amount)).join(' + ')} = ${inr(answer)}.`,
              ...out.map((b) => `${b.label} stays out. ${b.rule}`),
            ],
            hints: H.realisation,
          }
        );
      },
      verify: (q) => {
        const text = q.context ?? '';
        const heading = q.prompt.includes('debit side') ? 'Assets:' : 'Liabilities:';
        const going = figures(under(text, heading).join('\n')).filter(([label]) => !STAYS_OUT.test(label));
        return q.answer === rupees(total(going.map(([, a]) => a)));
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const p = s.f.names[s.x];
        const t = s.taken.t;
        return {
          prompt: `Pass the journal entry for ${t.the} taken over by ${p}.`,
          lines: [dr(partnerCapital(p), s.taken.at), cr(REAL, s.taken.at)],
          explanation: [
            `${p} receives the asset in place of money, so ${p}'s Capital A/c is debited with the agreed value, ${inr(s.taken.at)}, not the book value of ${inr(s.taken.book)}: that much less will be paid to ${p} at the end.`,
            'Realisation A/c is credited, exactly as if the asset had been sold for that amount.',
            `${t.name} A/c is not touched: its book value went to the debit of Realisation A/c with the other assets.`,
          ],
          distractorAccounts: [t.id, 'bank'],
          hints: H.entry,
        };
      },
      verify: (q: JournalQuestion) => {
        const m = /([A-Z][a-z]+) took over (.+?) at an agreed value of ₹([\d,]+)\./.exec(q.context ?? '');
        if (!m) return false;
        const at = Number(m[3].replace(/,/g, ''));
        return q.expected.length === 2 && hasLine(q.expected, partnerCapital(m[1]), 'Dr', at) && hasLine(q.expected, REAL, 'Cr', at) && q.prompt.includes(m[2]);
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const debit = total(s.sheet.filter((b) => b.goes === 'debit').map((b) => b.amount)) + amountPaid(s) + s.expenses.amount;
        const credit = debit + s.result;
        return choice(
          'Once every item above has been entered, what does Realisation A/c show before its balance is transferred to the partners?',
          profitOrLoss(s.result),
          [
            [profitOrLoss(-s.result), s.result > 0 ? 'Read the heavier credit side of Realisation A/c as a loss.' : 'Read the heavier debit side of Realisation A/c as a profit.'],
            ...s.slips.map(([d, why]): [string, string] => [profitOrLoss(s.result + d), why]),
          ],
          `Debit: assets at book value ${inr(total(s.sheet.filter((b) => b.goes === 'debit').map((b) => b.amount)))}, liabilities paid ${inr(amountPaid(s))}, realisation expenses ${inr(s.expenses.amount)}; total ${inr(debit)}. Credit: liabilities${s.provision ? ' and provision' : ''} transferred ${inr(total(s.sheet.filter((b) => b.goes === 'credit').map((b) => b.amount)))}, money received ${inr(credit - total(s.sheet.filter((b) => b.goes === 'credit').map((b) => b.amount)) - s.taken.at)}, ${low(s.taken.t.name)} taken over ${inr(s.taken.at)}; total ${inr(credit)}. ${resultLine(debit, credit)}`,
          H.realisation,
        );
      },
      verify: (q) => {
        const s = keptItems.of(q.context ?? '');
        return s !== undefined && optionText(q) === profitOrLoss(realisationResult(s.entries));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { f } = s;
        const y = f.names[s.y];
        const r = Math.abs(s.result);
        const mine = shareOf(f, r, s.y);
        const other = f.ratio.findIndex((v) => v !== f.ratio[s.y]);
        const n = numeric(mine, [
          [r / f.names.length, 'Shared the result equally, ignoring the profit-sharing ratio.'],
          ...(other >= 0 ? [[shareOf(f, r, other), `Gave ${f.names[other]}'s share: the terms of the ratio follow the order of the names.`] as [number, string]] : []),
          [r, `Gave the whole ${s.result > 0 ? 'profit' : 'loss'}, not ${y}'s share of it.`],
          [shareOf(f, Math.abs(s.result + s.expenses.amount), s.y), 'Shared a result worked without the realisation expenses.'],
        ]);
        return (
          n && {
            prompt: `What is ${y}'s share of the profit or loss on realisation? (Give the amount only.)`,
            ...n,
            explanation: [
              `Realisation A/c shows a ${s.result > 0 ? 'profit' : 'loss'} of ${inr(r)}, shared in the profit-sharing ratio, ${f.ratio.join(':')}.`,
              `${y}'s share = ${fraction(f, s.y)} x ${inr(r)} = ${inr(mine)}, ${s.result > 0 ? 'credited' : 'debited'} to ${y}'s Capital A/c.`,
            ],
            hints: H.realisation,
          }
        );
      },
      verify: (q: NumericQuestion) => {
        const s = keptItems.of(q.context ?? '');
        const name = /What is ([A-Z][a-z]+)'s share/.exec(q.prompt)?.[1] ?? '';
        return s !== undefined && q.answer === rupees(shareInText(q.context ?? '', name, Math.abs(realisationResult(s.entries))));
      },
    },
  ],
});

/** What the firm paid for its outside liabilities in the first case. */
function amountPaid(s: Items): number {
  return total(s.sheet.filter((b) => b.goes === 'credit' && !b.label.startsWith('Provision')).map((b) => b.amount)) - s.discount;
}

// ===============================================================================================================
// 2. Realisation expenses (medium): one of the six forms in which a firm's realisation expenses are met (borne and
//    paid by the firm; borne by the firm and paid by a partner; borne by a partner for a remuneration, paid by that
//    partner or by the firm on the partner's behalf; borne by a partner for nothing, paid by the firm or by the
//    partner). Which entry the firm passes, the final result on realisation, the entry that closes Realisation A/c and
//    the amount finally paid to the partner concerned. What varies: the form, the partner, a profit or a loss.
// ===============================================================================================================

interface Costs {
  f: Firm;
  /** The partner the expenses concern, or (when the firm bears and pays them) the partner whose capital is asked. */
  x: number;
  exp: { form: ExpenseForm; by: number; actual: number; fee: number };
  /** The result on realisation before anything for the expenses, and after (signed: a profit is positive). */
  before: number;
  result: number;
  capital: number;
  final: number;
}

/** How each form is told in the case text, read back by `verify`. */
const FORM_SIGN: Record<ExpenseForm, RegExp> = {
  firm: /were borne and paid by the firm\./,
  partnerPays: /were to be borne by the firm; [A-Z][a-z]+ paid them/,
  feePersonal: /for a remuneration of .* out of [A-Z][a-z]+'s own money\./,
  feeFirmPays: /for a remuneration of .* on [A-Z][a-z]+'s behalf\./,
  borneFirmPays: /without any remuneration\. .* on [A-Z][a-z]+'s behalf\./,
  bornePersonal: /without any remuneration, and paid them/,
};
const formIn = (text: string): ExpenseForm | undefined => (Object.keys(FORM_SIGN) as ExpenseForm[]).find((k) => FORM_SIGN[k].test(text));
const rupeesIn = (m: RegExpExecArray | null): number => (m ? Number(m[1].replace(/,/g, '')) : 0);
/** The figures of the expenses case read back from its text, and the result after the expenses (signed), worked from them. */
function costsIn(text: string): { form: ExpenseForm; actual: number; fee: number; capital: number; after: number } | undefined {
  const form = formIn(text);
  if (!form) return undefined;
  const before = rupeesIn(/showed a (?:profit|loss) of ₹([\d,]+)/.exec(text)) * (/showed a profit/.test(text) ? 1 : -1);
  const fee = rupeesIn(/remuneration of ₹([\d,]+)/.exec(text));
  const actual = rupeesIn(/(?:expenses of|The expenses,|and paid them,) ₹([\d,]+)/.exec(text));
  const capital = rupeesIn(/Capital A\/c had a credit balance of ₹([\d,]+)/.exec(text));
  const charge = form === 'firm' || form === 'partnerPays' ? actual : form === 'feePersonal' || form === 'feeFirmPays' ? fee : 0;
  return { form, actual, fee, capital, after: before - charge };
}

const keptCosts = keepFor<Costs>();

const expensesCase = caseTemplate<Costs>({
  id: 'case-dis-expenses',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'Who bears the realisation expenses',
  setup: (rng) => {
    const f = firm(rng);
    const n = f.names.length;
    const x = rng.int(0, n - 1);
    const form = rng.pick<ExpenseForm>(['firm', 'partnerPays', 'feePersonal', 'feePersonal', 'feeFirmPays', 'feeFirmPays', 'borneFirmPays', 'bornePersonal']);
    const actual = rng.step(2000, 12000, 1000);
    // The remuneration is never the same as the expenses, nor a trifle.
    const fee = actual + rng.pick([-2000, -1000, 1000, 2000, 3000, 4000].filter((d) => actual + d >= 3000));
    const exp = { form, by: x, actual, fee };
    const charge = chargeOf(exp);
    const profit = rng.int(0, 4) < 3;
    const result = (profit ? 1 : -1) * f.sum * rng.step(1000, 9000, 500);
    const before = result + charge;
    // The expenses never turn a profit into a loss: the case states the direction before them.
    if (before === 0 || Math.sign(before) !== Math.sign(result)) return null;
    const capital = rng.step(30000, 200000, 5000);
    const final = capital + shareOf(f, result, x) + creditedFor(exp) - chargedFor(exp);
    if (final < 5000) return null;
    return { f, x, exp, before, result, capital, final };
  },
  context: (s) => {
    const x = s.f.names[s.x];
    const { actual, fee } = s.exp;
    const told: Record<ExpenseForm, string> = {
      firm: `Realisation expenses of ${inr(actual)} were borne and paid by the firm.`,
      partnerPays: `Realisation expenses of ${inr(actual)} were to be borne by the firm; ${x} paid them out of ${x}'s own money.`,
      feePersonal: `${x} was to bear the realisation expenses for a remuneration of ${inr(fee)}. The expenses, ${inr(actual)}, were paid by ${x} out of ${x}'s own money.`,
      feeFirmPays: `${x} was to bear the realisation expenses for a remuneration of ${inr(fee)}. The expenses, ${inr(actual)}, were paid by the firm on ${x}'s behalf.`,
      borneFirmPays: `${x} had agreed to bear the realisation expenses without any remuneration. The expenses, ${inr(actual)}, were paid by the firm on ${x}'s behalf.`,
      bornePersonal: `${x} had agreed to bear the realisation expenses without any remuneration, and paid them, ${inr(actual)}, out of ${x}'s own money.`,
    };
    const word = s.before > 0 ? 'profit' : 'loss';
    const text = [
      `${s.f.intro} ${FLUCTUATING} Every receipt and payment of the firm was by cheque.`,
      `Every item of the dissolution except the realisation expenses had been entered in Realisation A/c, which then showed a ${word} of ${inr(Math.abs(s.before))}.`,
      told[s.exp.form],
      `At that point ${x}'s Capital A/c had a credit balance of ${inr(s.capital)}, before anything for the realisation expenses or the ${word} on realisation was entered in it.`,
    ].join('\n');
    keptCosts.keep(text, s);
    return text;
  },
  parts: [
    {
      kind: 'mcq',
      make: (s) => {
        const x = s.f.names[s.x];
        const E = inr(s.exp.actual);
        const R = inr(s.exp.fee);
        const firmPays = `Realisation A/c Dr ${E}; To Bank A/c ${E}`;
        const credited = `Realisation A/c Dr ${E}; To ${x}'s Capital A/c ${E}`;
        const feeOnly = `Realisation A/c Dr ${R}; To ${x}'s Capital A/c ${R}`;
        const charged = `${x}'s Capital A/c Dr ${E}; To Bank A/c ${E}`;
        const feeAndCharged = `Realisation A/c Dr ${R}; To ${x}'s Capital A/c ${R}, and ${x}'s Capital A/c Dr ${E}; To Bank A/c ${E}`;
        const feeAndPaid = `Realisation A/c Dr ${R}; To ${x}'s Capital A/c ${R}, and Realisation A/c Dr ${E}; To Bank A/c ${E}`;
        const both = `Realisation A/c Dr ${inr(s.exp.fee + s.exp.actual)}; To ${x}'s Capital A/c ${inr(s.exp.fee + s.exp.actual)}`;
        const none = 'No entry is passed in the books of the firm';
        const options: Record<ExpenseForm, [string, [string, string][], string]> = {
          firm: [
            firmPays,
            [
              [credited, `Credited ${x}, although the firm paid the expenses from its own bank account.`],
              [none, 'Treated the expenses as the private cost of a partner; here the firm bears them and pays them.'],
              [charged, `Charged the expenses to ${x}; nothing says a partner has to bear them.`],
              [`Bank A/c Dr ${E}; To Realisation A/c ${E}`, 'Reversed the entry: paying expenses takes money out of the bank.'],
            ],
            'The firm bears the expenses and pays them: Realisation A/c is debited and Bank A/c is credited.',
          ],
          partnerPays: [
            credited,
            [
              [firmPays, `Credited Bank A/c, although the firm's bank paid nothing: ${x} paid.`],
              [none, `Left it out; the firm bears the expenses, so it must give ${x} credit for paying them.`],
              [charged, `Debited ${x} and credited Bank A/c, as if the firm had paid for ${x}; it was ${x} who paid for the firm.`],
              [`${x}'s Capital A/c Dr ${E}; To Realisation A/c ${E}`, `Reversed the entry: the firm owes ${x} the money, so ${x}'s Capital A/c is credited.`],
            ],
            `The firm bears the expenses, so Realisation A/c is debited. ${x} paid for the firm, so ${x}'s Capital A/c is credited.`,
          ],
          feePersonal: [
            feeOnly,
            [
              [credited, `Credited ${x} with the actual expenses; the firm owes only the agreed remuneration.`],
              [both, 'Added the expenses to the remuneration; the remuneration already covers them.'],
              [firmPays, `Recorded the expenses as paid by the firm; ${x} paid them and bears them.`],
              [none, `Forgot the remuneration, which the firm owes ${x}.`],
              [feeAndCharged, `Recorded a payment of the expenses from the firm's bank; ${x} paid them personally.`],
            ],
            `The firm owes ${x} the agreed remuneration of ${R}: Realisation A/c Dr; To ${x}'s Capital A/c. The expenses of ${E} are ${x}'s own affair and get no entry.`,
          ],
          feeFirmPays: [
            feeAndCharged,
            [
              [feeOnly, `Recorded the remuneration but not the firm's payment on ${x}'s behalf, which ${x} has to make good.`],
              [feeAndPaid, `Charged the expenses to Realisation A/c as well as the remuneration; ${x} bears the expenses and the firm only paid them on ${x}'s behalf.`],
              [firmPays, `Charged the expenses to the firm and forgot the remuneration; the firm's cost is the remuneration, and the expenses are ${x}'s.`],
              [charged, `Recorded only the payment on ${x}'s behalf and forgot the remuneration the firm owes ${x}.`],
            ],
            `Two entries. The firm owes ${x} the agreed remuneration of ${R}: Realisation A/c Dr; To ${x}'s Capital A/c. The firm's bank paid ${E} of expenses that ${x} bears: ${x}'s Capital A/c Dr; To Bank A/c.`,
          ],
          borneFirmPays: [
            charged,
            [
              [firmPays, `Charged the expenses to Realisation A/c, though ${x} had agreed to bear them; the firm only paid on ${x}'s behalf.`],
              [none, `Overlooked that the firm's money was used, which ${x} has to make good.`],
              [credited, `Credited ${x} instead of debiting: here ${x} owes the firm, not the other way round.`],
            ],
            `The expenses are ${x}'s to bear, and the firm's money paid them: ${x}'s Capital A/c is debited and Bank A/c is credited. Realisation A/c is not touched.`,
          ],
          bornePersonal: [
            none,
            [
              [firmPays, `Charged the firm and credited its bank, though ${x} had agreed to bear the expenses and paid them personally.`],
              [credited, `Gave ${x} credit for the payment, though ${x} had agreed to bear the expenses.`],
              [charged, `Recorded a payment from the firm's bank; ${x} paid out of ${x}'s own money.`],
            ],
            `${x} bears the expenses and pays them personally. Nothing is owed by or to the firm and none of its money moves, so the firm passes no entry.`,
          ],
        };
        const [correct, wrong, why] = options[s.exp.form];
        return choice('Which journal entry, or entries, does the firm pass for the realisation expenses?', correct, wrong, why, H.expenses);
      },
      verify: (q) => {
        const text = q.context ?? '';
        const form = formIn(text);
        const answer = optionText(q);
        const amounts = [...text.matchAll(/₹([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, '')));
        const [, first, second] = amounts;
        const of = (a: string) => [...a.matchAll(/₹([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, '')));
        switch (form) {
          case 'firm':
            return /^Realisation A\/c Dr .*; To Bank A\/c/.test(answer) && of(answer)[0] === first;
          case 'partnerPays':
            return /^Realisation A\/c Dr .*; To [A-Z][a-z]+'s Capital A\/c ₹[\d,]+$/.test(answer) && of(answer)[0] === first;
          case 'feePersonal':
            return /^Realisation A\/c Dr .*; To [A-Z][a-z]+'s Capital A\/c ₹[\d,]+$/.test(answer) && of(answer)[0] === first;
          case 'feeFirmPays':
            return answer.includes(', and ') && of(answer)[0] === first && of(answer)[2] === second && /Capital A\/c Dr .*; To Bank A\/c/.test(answer);
          case 'borneFirmPays':
            return /^[A-Z][a-z]+'s Capital A\/c Dr .*; To Bank A\/c/.test(answer) && of(answer)[0] === first;
          case 'bornePersonal':
            return answer.startsWith('No entry');
          default:
            return false;
        }
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { actual, fee } = s.exp;
        const word = s.result > 0 ? 'profit' : 'loss';
        const charge = chargeOf(s.exp);
        const at = (c: number): number => Math.abs(s.before - c);
        const errs: [number, string][] = forFee(s.exp)
          ? [
              [at(0), 'Left out the remuneration, which is the firm\'s cost of the realisation.'],
              [at(actual), 'Charged Realisation A/c with the actual expenses instead of the agreed remuneration.'],
              [at(fee + actual), 'Charged Realisation A/c with the actual expenses as well as the remuneration.'],
              [at(-fee), word === 'profit' ? 'Added the remuneration to the profit instead of deducting it.' : 'Deducted the remuneration from the loss instead of adding it.'],
            ]
          : charge
            ? [
                [at(0), `Left out the realisation expenses${s.exp.form === 'partnerPays' ? `, which the firm bears though ${s.f.names[s.x]} paid them` : ''}.`],
                [at(-charge), word === 'profit' ? 'Added the expenses to the profit instead of deducting them.' : 'Deducted the expenses from the loss instead of adding them.'],
              ]
            : [
                [at(actual), `Charged the expenses to Realisation A/c, though ${s.f.names[s.x]} had agreed to bear them.`],
                [at(-actual), word === 'profit' ? 'Added the expenses to the profit; they are no cost of the firm here.' : 'Deducted the expenses from the loss; they are no cost of the firm here.'],
              ];
        const n = numeric(Math.abs(s.result), errs);
        return (
          n && {
            prompt: `What is the ${word} on realisation that is finally transferred to the partners' capital accounts?`,
            ...n,
            explanation: [
              forFee(s.exp)
                ? `The firm's cost is the agreed remuneration, ${inr(fee)}; the actual expenses of ${inr(actual)} are ${s.f.names[s.x]}'s to bear.`
                : charge
                  ? `The firm bears the expenses, ${inr(actual)}, whoever paid them: they are debited to Realisation A/c.`
                  : `${s.f.names[s.x]} bears the expenses, so nothing for them is debited to Realisation A/c.`,
              charge
                ? word === 'profit'
                  ? `Profit = ${inr(s.before)} - ${inr(charge)} = ${inr(s.result)}.`
                  : `Loss = ${inr(-s.before)} + ${inr(charge)} = ${inr(-s.result)}.`
                : `The ${word} stays at ${inr(Math.abs(s.result))}.`,
            ],
            hints: H.expenses,
          }
        );
      },
      verify: (q: NumericQuestion) => {
        const c = costsIn(q.context ?? '');
        return c !== undefined && q.answer === rupees(Math.abs(c.after));
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const { f } = s;
        const r = Math.abs(s.result);
        const shares = f.names.map((_, i) => shareOf(f, r, i));
        const working = `${f.names.map((nm, i) => `${nm} ${fraction(f, i)} x ${inr(r)} = ${inr(shares[i])}`).join('; ')}.`;
        return {
          prompt: 'Pass the journal entry that closes Realisation A/c.',
          lines: s.result > 0 ? [dr(REAL, r), ...f.names.map((nm, i) => cr(partnerCapital(nm), shares[i]))] : [...f.names.map((nm, i) => dr(partnerCapital(nm), shares[i])), cr(REAL, r)],
          explanation: [
            `Once the realisation expenses are entered, Realisation A/c shows a ${s.result > 0 ? 'profit' : 'loss'} of ${inr(r)}.`,
            `It is shared in the profit-sharing ratio: ${working}`,
            s.result > 0 ? 'Realisation A/c is debited to close it and each capital account is credited with its share.' : 'Each capital account is debited with its share and Realisation A/c is credited to close it.',
          ],
          distractorAccounts: ['profitAndLoss', 'profitAndLossAppropriation'],
          hints: H.realisation,
        };
      },
      verify: (q: JournalQuestion) => {
        const s = keptCosts.of(q.context ?? '');
        if (!s) return false;
        const text = q.context ?? '';
        const r = Math.abs(s.result);
        const side = s.result > 0 ? 'Cr' : 'Dr';
        return hasLine(q.expected, REAL, side === 'Cr' ? 'Dr' : 'Cr', r) && namesIn(text).every((nm) => hasLine(q.expected, partnerCapital(nm), side, shareInText(text, nm, r)));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { f, exp } = s;
        const x = f.names[s.x];
        const mine = shareOf(f, s.result, s.x);
        const credited = creditedFor(exp);
        const charged = chargedFor(exp);
        const word = s.result > 0 ? 'profit' : 'loss';
        const errs: [number, string][] = [
          ...(credited ? [[s.final - credited, `Left out the ${forFee(exp) ? 'remuneration' : 'expenses'} credited to ${x}'s Capital A/c.`] as [number, string]] : []),
          ...(charged ? [[s.final + charged, `Left out the expenses the firm paid on ${x}'s behalf, which are debited to ${x}'s Capital A/c.`] as [number, string]] : []),
          ...(forFee(exp) ? [[s.final - exp.fee + exp.actual, `Credited ${x} with the actual expenses instead of the agreed remuneration.`] as [number, string]] : []),
          ...(exp.form === 'bornePersonal' ? [[s.final + exp.actual, `Credited ${x} with the expenses ${x} paid; ${x} had agreed to bear them, and the firm records nothing.`] as [number, string]] : []),
          ...(exp.form === 'firm' ? [] : [[s.capital + shareOf(f, s.before, s.x) + credited - charged, `Took ${x}'s share of the ${s.before > 0 ? 'profit' : 'loss'} before the realisation expenses were dealt with.`] as [number, string]]),
          [s.final - mine + s.result, `Took the whole ${word} on realisation instead of ${x}'s share of it.`],
          [s.final - 2 * mine, s.result > 0 ? 'Deducted the share of the profit on realisation instead of adding it.' : 'Added the share of the loss on realisation instead of deducting it.'],
        ];
        const n = numeric(s.final, errs);
        const plus = [`balance ${inr(s.capital)}`, ...(s.result > 0 ? [`share of profit ${fraction(f, s.x)} x ${inr(s.result)} = ${inr(mine)}`] : []), ...(credited ? [`${forFee(exp) ? 'remuneration' : 'expenses paid for the firm'} ${inr(credited)}`] : [])];
        const minus = [...(s.result < 0 ? [`share of loss ${fraction(f, s.x)} x ${inr(-s.result)} = ${inr(-mine)}`] : []), ...(charged ? [`expenses paid by the firm on ${x}'s behalf ${inr(charged)}`] : [])];
        return (
          n && {
            prompt: `How much is finally paid to ${x} to close ${x}'s Capital A/c?`,
            ...n,
            explanation: [
              `${x}'s Capital A/c, credit side: ${plus.join('; ')}.`,
              ...(minus.length ? [`Debit side: ${minus.join('; ')}.`] : []),
              ...(exp.form === 'bornePersonal' ? [`The expenses ${x} bore and paid personally do not pass through the firm's books.`] : []),
              ...(exp.form === 'feePersonal' ? [`The expenses ${x} paid personally are ${x}'s own affair: only the remuneration is credited.`] : []),
              `Paid to ${x} = ${inr(s.final)}.`,
            ],
            hints: H.closing,
          }
        );
      },
      verify: (q: NumericQuestion) => {
        // The long way: the partner's capital account written up from the case text alone.
        const c = costsIn(q.context ?? '');
        const x = /paid to ([A-Z][a-z]+) to close/.exec(q.prompt)?.[1] ?? '';
        if (!c) return false;
        const id = partnerCapital(x);
        const mine = shareInText(q.context ?? '', x, Math.abs(c.after));
        const byForm: Record<ExpenseForm, JournalLine[][]> = {
          firm: [],
          partnerPays: [[dr(REAL, c.actual), cr(id, c.actual)]],
          feePersonal: [[dr(REAL, c.fee), cr(id, c.fee)]],
          feeFirmPays: [[dr(REAL, c.fee), cr(id, c.fee)], [dr(id, c.actual), cr('bank', c.actual)]],
          borneFirmPays: [[dr(id, c.actual), cr('bank', c.actual)]],
          bornePersonal: [],
        };
        const entries = [[dr('bank', c.capital), cr(id, c.capital)], ...byForm[c.form], c.after > 0 ? [dr(REAL, mine), cr(id, mine)] : [dr(id, mine), cr(REAL, mine)]];
        return q.answer === -(post(entries).get(id) ?? 0);
      },
    },
  ],
});

// ===============================================================================================================
// 3. The order of settlement (medium): the cash left once every asset is realised, the debts still to be paid (to
//    outsiders, one of them perhaps a partner's relative), a partner's loan and the capitals. The order under
//    section 48, the money left for the capitals, the result on realisation that this leaves, what one partner
//    receives in all, and one entry of the settlement. What varies: a relative's loan or bills payable or neither,
//    the lender, the partner asked about, a profit or a loss, and which entry is asked.
// ===============================================================================================================

interface Settle {
  f: Firm;
  cash: number;
  creditors: number;
  /** A second debt to an outsider: bills payable, or a loan from a partner's relative. */
  other: { label: string; short: string; amount: number; relative: boolean } | null;
  lender: number;
  loan: number;
  caps: number[];
  /** What is left after the capitals, the profit (positive) or loss on realisation. */
  surplus: number;
  finals: number[];
  /** The partner asked about. */
  x: number;
  /** The place asked for in the order of payment (0 to 3), or -1 when the place of the relative's loan is asked. */
  place: number;
  entry: 'loan' | 'final';
}

const SETTLE_PLACES = ['first of all', 'second', 'third', 'last of all'];

const keptSettle = keepFor<Settle>();
/** The position of a settlement case read back from its text: cash, debts to outsiders, the partner's loan and the capitals. */
function settleIn(text: string): { cash: number; outside: number; loan: number; lender: string; caps: Map<string, number> } {
  let cash = 0;
  let outside = 0;
  let loan = 0;
  let lender = '';
  const caps = new Map<string, number>();
  for (const [label, amount] of figures(text)) {
    const own = /^([A-Z][a-z]+)'s loan to the firm$/.exec(label);
    const capital = /^([A-Z][a-z]+)'s capital$/.exec(label);
    if (label === 'Cash at bank') cash = amount;
    else if (own) [lender, loan] = [own[1], amount];
    else if (capital) caps.set(capital[1], amount);
    else outside += amount;
  }
  return { cash, outside, loan, lender, caps };
}

const settleCase = caseTemplate<Settle>({
  id: 'case-dis-settlement',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'Who is paid first',
  setup: (rng) => {
    const f = firm(rng);
    const n = f.names.length;
    const lender = rng.int(0, n - 1);
    const creditors = rng.step(40000, 200000, 10000);
    const kind = rng.pick(['none', 'bills', 'relative', 'relative'] as const);
    const r = relative(rng, f.names[rng.int(0, n - 1)]);
    const other =
      kind === 'bills'
        ? { label: 'Bills payable', short: 'the bills payable', amount: rng.step(10000, 50000, 5000), relative: false }
        : kind === 'relative'
          ? { label: `Loan from ${r.as}`, short: `the loan from ${r.name}`, amount: rng.step(20000, 80000, 10000), relative: true }
          : null;
    const loan = rng.step(20000, 100000, 10000);
    const caps = f.names.map(() => rng.step(80000, 300000, 10000));
    const surplus = (rng.int(0, 3) === 0 ? -1 : 1) * f.sum * rng.step(1000, 12000, 1000);
    const cash = creditors + (other?.amount ?? 0) + loan + total(caps) + surplus;
    const finals = caps.map((c, i) => c + shareOf(f, surplus, i));
    // Nobody falls short, and nobody is left with a trifle.
    if (finals.some((v) => v < 5000)) return null;
    const x = rng.int(0, 1) === 0 ? lender : rng.int(0, n - 1);
    const place = other?.relative && rng.int(0, 1) === 0 ? -1 : rng.int(0, 3);
    return { f, cash, creditors, other, lender, loan, caps, surplus, finals, x, place, entry: rng.pick(['loan', 'final'] as const) };
  },
  context: (s) => {
    const text = [
      `${s.f.intro} ${FLUCTUATING}`,
      'Every asset had been realised and the realisation expenses, borne by the firm, had been paid. Nothing more was to be received, and the firm owed nothing but the debts below, which were then paid in full. The capitals below had been credited or debited with everything except the profit or loss on realisation. Every payment was by cheque.',
      `Cash at bank: ${inr(s.cash)}`,
      `Creditors: ${inr(s.creditors)}`,
      ...(s.other ? [`${s.other.label}: ${inr(s.other.amount)}`] : []),
      `${s.f.names[s.lender]}'s loan to the firm: ${inr(s.loan)}`,
      ...s.f.names.map((nm, i) => `${nm}'s capital: ${inr(s.caps[i])}`),
    ].join('\n');
    keptSettle.keep(text, s);
    return text;
  },
  parts: [
    {
      kind: 'mcq',
      make: (s) => {
        const L = s.f.names[s.lender];
        const outside = s.creditors + (s.other?.amount ?? 0);
        if (s.place < 0 && s.other) {
          const rel = s.other.short;
          return choice(
            `Under section 48 of the Indian Partnership Act, 1932, where does ${rel} stand in the order of payment?`,
            'With the creditors, among the debts due to outsiders, which are paid first',
            [
              [`With ${L}'s loan, after the outside debts and before the capitals`, "Gave a loan from a partner's relative the place of a partner's own loan; a relative of a partner is an outsider."],
              ['With the capitals, after the loans from partners', 'Treated the loan as part of a partner\'s capital; the firm borrowed it from an outsider.'],
              ['Last of all, out of whatever is left after the capitals', 'Put a debt due to an outsider behind the claims of the partners; outsiders are paid before any partner receives anything.'],
            ],
            `${cap(rel)} is owed to an outsider, so it is paid with the other outside debts, first of all: ${inr(outside)} in all. ${L}'s loan comes next, then the capitals.`,
            H.order,
          );
        }
        // The options give no figures: the money left for the capitals and the result on realisation are asked later.
        const debts = s.other ? `The creditors and ${s.other.short}` : 'The creditors';
        const options: [string, string][] = [
          [debts, 'Placed the debts due to outsiders here; they are paid first of all, before any partner receives anything.'],
          [`${L}'s loan`, "Placed the partner's loan here; it is repaid second, after the outside debts and before the capitals."],
          ["The partners' capitals", "Placed the capitals here; capital is returned third, only after the outside debts and the partners' loans."],
          ['Whatever is left after the capitals, shared in the profit-sharing ratio', 'Placed the residue here; whatever is left over comes at the very end, after the capitals have been returned.'],
        ];
        return choice(
          `Under section 48 of the Indian Partnership Act, 1932, which of the following is paid ${SETTLE_PLACES[s.place]}?`,
          options[s.place][0],
          options.filter((_, i) => i !== s.place),
          `Section 48: (1) the debts due to outsiders${s.other?.relative ? `, ${s.other.short} among them` : ''}; (2) the loans from partners, here ${L}'s; (3) the capitals, each first reduced by its share of any loss on realisation; (4) whatever is left over, shared in the profit-sharing ratio.`,
          H.order,
        );
      },
      verify: (q) => {
        const p = settleIn(q.context ?? '');
        const answer = optionText(q);
        if (q.prompt.includes('where does')) return answer.startsWith('With the creditors');
        const k = SETTLE_PLACES.findIndex((w) => q.prompt.includes(`is paid ${w}?`));
        // Debts to outsiders, then the lender's own loan, then the capitals, then whatever is left.
        const want = [/^The creditors/, new RegExp(`^${p.lender}'s loan$`), /capitals$/, /^Whatever is left/][k];
        return k >= 0 && want.test(answer);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const L = s.f.names[s.lender];
        const outside = s.creditors + (s.other?.amount ?? 0);
        const left = s.cash - outside - s.loan;
        const n = numeric(left, [
          [left + s.loan, `Left ${L}'s loan to be paid with the capitals; a partner's loan is repaid before any capital is returned.`],
          ...(s.other ? [[left + s.other.amount, s.other.relative ? `Left out ${s.other.short}; a relative of a partner is an outsider, paid with the creditors.` : `Left out ${s.other.short}, a debt due to outsiders.`] as [number, string]] : []),
          [s.cash - s.loan, 'Paid the partner\'s loan but forgot the debts due to outsiders, which come first.'],
          [s.cash, 'Took the whole cash at bank, before any debt was paid.'],
        ]);
        return (
          n && {
            prompt: "How much is left for the partners' capitals once the debts due to outsiders and the partner's loan have been paid?",
            ...n,
            explanation: [
              `First the debts due to outsiders: ${s.other ? `creditors ${inr(s.creditors)} + ${s.other.short} ${inr(s.other.amount)} = ${inr(outside)}` : `creditors ${inr(s.creditors)}`}.`,
              `Then ${L}'s loan, ${inr(s.loan)}.`,
              `Left = ${inr(s.cash)} - ${inr(outside)} - ${inr(s.loan)} = ${inr(left)}.`,
            ],
            hints: H.order,
          }
        );
      },
      verify: (q: NumericQuestion) => {
        const p = settleIn(q.context ?? '');
        return q.answer === rupees(p.cash - p.outside - p.loan);
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const left = s.cash - s.creditors - (s.other?.amount ?? 0) - s.loan;
        return choice(
          'What, then, is the result on realisation?',
          profitOrLoss(s.surplus),
          [
            [profitOrLoss(-s.surplus), s.surplus > 0 ? 'Read the money left over after the capitals as a loss.' : 'Read the money missing for the capitals as a profit.'],
            [profitOrLoss(s.surplus + s.loan), `Counted ${s.f.names[s.lender]}'s loan as part of what is left for the capitals; it is repaid first.`],
            ...(s.other ? [[profitOrLoss(s.surplus + s.other.amount), `Left out ${s.other.short}, which is paid before anything goes to the partners.`] as [string, string]] : []),
            [profitOrLoss(s.surplus + s.creditors), 'Forgot to pay the creditors before the partners.'],
            ['No profit and no loss', 'Took the cash left as simply returning the capitals; whatever is left over, or missing, after the capitals is the result on realisation.'],
          ],
          `Left for the capitals: ${inr(left)}. The capitals come to ${inr(total(s.caps))}. ${s.surplus > 0 ? `The ${inr(s.surplus)} left over is a profit on realisation` : `The ${inr(-s.surplus)} missing is a loss on realisation`}, shared in the profit-sharing ratio.`,
          H.order,
        );
      },
      verify: (q) => {
        const p = settleIn(q.context ?? '');
        return optionText(q) === profitOrLoss(p.cash - p.outside - p.loan - total([...p.caps.values()]));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { f } = s;
        const x = f.names[s.x];
        const own = s.x === s.lender ? s.loan : 0;
        const mine = shareOf(f, s.surplus, s.x);
        const answer = own + s.finals[s.x];
        const word = s.surplus > 0 ? 'profit' : 'loss';
        const n = numeric(answer, [
          ...(own ? [[answer - s.loan, `Left out ${x}'s loan, which is repaid to ${x} before any capital is returned.`] as [number, string]] : []),
          ...(own ? [] : [[s.caps[s.x] + shareOf(f, s.surplus + s.loan, s.x), `Shared the money for ${f.names[s.lender]}'s loan among all the partners; it goes to the lender alone, before the capitals.`] as [number, string]]),
          [own + shareOf(f, s.cash - s.creditors - (s.other?.amount ?? 0) - s.loan, s.x), `Shared all the cash left after the debts and the loan in the profit-sharing ratio; the capitals are returned first and only the ${word} is shared.`],
          [own + s.caps[s.x], `Stopped at the capital; ${x}'s share of the ${word} on realisation was not taken into account.`],
          [answer - 2 * mine, s.surplus > 0 ? 'Deducted the share of the profit instead of adding it.' : 'Added the share of the loss instead of deducting it.'],
          [own + s.caps[s.x] + s.surplus / f.names.length, `Shared the ${word} equally instead of in the profit-sharing ratio.`],
        ]);
        return (
          n && {
            prompt: `How much does ${x} receive from the firm in all?`,
            ...n,
            explanation: [
              `The ${word} on realisation, ${inr(Math.abs(s.surplus))}, is shared ${f.ratio.join(':')}: ${x}'s share = ${fraction(f, s.x)} x ${inr(Math.abs(s.surplus))} = ${inr(Math.abs(mine))}.`,
              `${x}'s capital account closes at ${inr(s.caps[s.x])} ${mine > 0 ? '+' : '-'} ${inr(Math.abs(mine))} = ${inr(s.finals[s.x])}.`,
              ...(own
                ? [`${x} is also repaid the loan of ${inr(s.loan)}, after the outside debts and before the capitals.`, `${x} receives ${inr(s.loan)} + ${inr(s.finals[s.x])} = ${inr(answer)}.`]
                : [`${x} receives that balance, ${inr(answer)}: the loan is ${s.f.names[s.lender]}'s, not ${x}'s.`]),
            ],
            hints: H.closing,
          }
        );
      },
      verify: (q: NumericQuestion) => {
        const text = q.context ?? '';
        const p = settleIn(text);
        const x = /does ([A-Z][a-z]+) receive/.exec(q.prompt)?.[1] ?? '';
        const surplus = p.cash - p.outside - p.loan - total([...p.caps.values()]);
        return q.answer === rupees((x === p.lender ? p.loan : 0) + (p.caps.get(x) ?? 0) + shareInText(text, x, surplus));
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const { f } = s;
        const L = f.names[s.lender];
        if (s.entry === 'loan') {
          return {
            prompt: `Pass the journal entry for the repayment of ${L}'s loan.`,
            lines: [dr(partnerLoan(L), s.loan), cr('bank', s.loan)],
            explanation: [
              `A partner's own loan is never transferred to Realisation A/c: it stays in ${L}'s Loan A/c.`,
              'It is repaid after the debts due to outsiders and before the capitals: the loan account is debited and Bank A/c is credited.',
            ],
            distractorAccounts: [REAL, partnerCapital(L)],
            hints: H.loans,
          };
        }
        return {
          prompt: "Pass the journal entry for the final payment to the partners on their capital accounts, once the result on realisation has been transferred to them.",
          lines: [...f.names.map((nm, i) => dr(partnerCapital(nm), s.finals[i])), cr('bank', total(s.finals))],
          explanation: [
            `Each capital account closes at its balance plus its share of the ${s.surplus > 0 ? 'profit' : 'loss'}: ${f.names.map((nm, i) => `${nm} ${inr(s.caps[i])} ${s.surplus > 0 ? '+' : '-'} ${inr(Math.abs(shareOf(f, s.surplus, i)))} = ${inr(s.finals[i])}`).join('; ')}.`,
            `Each capital account is debited with its balance and Bank A/c is credited with the total, ${inr(total(s.finals))}, which is all the money left.`,
          ],
          distractorAccounts: [REAL, partnerLoan(L)],
          hints: H.closing,
        };
      },
      verify: (q: JournalQuestion) => {
        const text = q.context ?? '';
        const p = settleIn(text);
        if (q.prompt.includes('repayment of')) return q.expected.length === 2 && hasLine(q.expected, partnerLoan(p.lender), 'Dr', p.loan) && hasLine(q.expected, 'bank', 'Cr', p.loan);
        const left = p.cash - p.outside - p.loan;
        const surplus = left - total([...p.caps.values()]);
        return hasLine(q.expected, 'bank', 'Cr', left) && [...p.caps].every(([nm, c]) => hasLine(q.expected, partnerCapital(nm), 'Dr', c + shareInText(text, nm, surplus)));
      },
    },
  ],
});

// ===============================================================================================================
// 4. Creditors, and what the books left out (medium): Realisation A/c in short (the totals of its two sides so far),
//    then a creditor who accepts an asset in part or full settlement (or takes one worth more than the debt and
//    pays the difference), the other creditors, an asset that was never in the books and a liability that was never
//    in them. The entry for the creditor, what the creditors were paid in all, the entries for the two unrecorded
//    items and the result on realisation they lead to. What varies: how the creditor is settled, a discount, who
//    takes or pays the unrecorded items, a profit or a loss.
// ===============================================================================================================

type Settled = 'part' | 'full' | 'pays';
interface Hidden {
  f: Firm;
  t: Thing;
  book: number;
  how: Settled;
  /** What the creditor was owed, the value agreed for the asset (the book value when it settles the claim in full), and the money that changed hands. */
  owed: number;
  agreed: number;
  gap: number;
  rest: number;
  pct: number;
  restPaid: number;
  old: { text: string; id: string; amount: number; by: number | null };
  bill: { text: string; id: string; amount: number; by: number | null };
  debit: number;
  credit: number;
  result: number;
}

const keptHidden = keepFor<Hidden>();

const hiddenCase = caseTemplate<Hidden>({
  id: 'case-dis-creditors-unrecorded',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'Creditors, and what the books left out',
  setup: (rng) => {
    const f = firm(rng);
    const n = f.names.length;
    const t = rng.pick(HANDY);
    const book = rng.step(20000, 100000, 5000);
    const how = rng.pick<Settled>(['part', 'part', 'full', 'pays']);
    const agreed = how === 'full' ? book : book + rng.pick([-10000, -5000, 5000, 10000]);
    if (agreed < 10000) return null;
    // A creditor who takes an asset worth more than the debt is owed most of its value: the difference is small.
    const gap = how === 'full' ? 0 : rng.step(5000, how === 'pays' ? Math.min(15000, agreed / 2) : 40000, 5000);
    const owed = how === 'part' ? agreed + gap : how === 'pays' ? agreed - gap : book + rng.pick([-10000, -5000, 5000, 10000]);
    // A creditor who takes an asset is owed a good part of its value: not ₹5,000 against an asset of ₹10,000.
    if (owed < 20000 || (how === 'pays' && gap * 3 > agreed)) return null;
    const rest = rng.step(30000, 150000, 5000);
    const pct = rng.pick([0, 0, 2, 5, 10]);
    const restPaid = rest - (rest * pct) / 100;

    const asset = rng.pick(UNRECORDED_ASSETS.filter((u) => u.id !== t.id));
    const v = rng.step(2000, asset.max, 500);
    const assetBy = rng.int(0, 2) === 0 ? rng.int(0, n - 1) : null;
    const be = asset.it === 'it' ? 'was' : 'were';
    const old = {
      text: assetBy === null ? `${cap(asset.what)} ${be} sold for ${inr(v)}.` : `${cap(asset.what)} ${be} taken over by ${f.names[assetBy]} at ${inr(v)}.`,
      id: asset.id,
      amount: v,
      by: assetBy,
    };
    const liab = rng.pick(UNRECORDED_LIABS);
    const w = rng.step(2000, 20000, 500);
    const billBy = rng.int(0, 2) === 0 ? rng.int(0, n - 1) : null;
    const bill = { text: `${liab.text(inr(w))} ${billBy === null ? 'The firm paid it.' : `${f.names[billBy]} agreed to pay it personally.`}`, id: liab.id, amount: w, by: billBy };

    // Realisation A/c so far: the transfers (the asset and all the creditors among them) and everything else.
    const debit = rng.step(400000, 900000, 10000);
    // Its credit side is near what the debit side will be once the creditors are paid, so the result is small either way.
    const credit = debit + rng.step(-40000, 40000, 1000) + Math.round(((how === 'part' ? gap : 0) + restPaid - (how === 'pays' ? gap : 0)) / 1000) * 1000;
    if (debit < book + 200000 || credit < owed + rest + 150000) return null;
    const result = credit + (how === 'pays' ? gap : 0) + v - (debit + (how === 'part' ? gap : 0) + restPaid + w);
    if (Math.abs(result) < 5000) return null;
    return { f, t, book, how, owed, agreed, gap, rest, pct, restPaid, old, bill, debit, credit, result };
  },
  context: (s) => {
    const deal: Record<Settled, string> = {
      part: `A creditor for ${inr(s.owed)} accepted ${s.t.the} (book value ${inr(s.book)}) at an agreed value of ${inr(s.agreed)} in part settlement of the claim, and was paid the balance.`,
      full: `A creditor for ${inr(s.owed)} accepted ${s.t.the}, which stood in the books at ${inr(s.book)}, in full settlement of the claim.`,
      pays: `A creditor for ${inr(s.owed)} took over ${s.t.the} (book value ${inr(s.book)}) at an agreed value of ${inr(s.agreed)} and paid the difference to the firm.`,
    };
    const text = [
      `${s.f.intro} ${FLUCTUATING} ${TRANSFERRED} Every receipt and payment of the firm was by cheque.`,
      `Creditors stood in the books at ${inr(s.owed + s.rest)}. With the transfers and every other item but the four below, the debit side of Realisation A/c came to ${inr(s.debit)} and its credit side to ${inr(s.credit)}.`,
      `(i) ${deal[s.how]}`,
      `(ii) The remaining creditors were paid ${s.pct ? `at a discount of ${s.pct}%` : 'in full'}.`,
      `(iii) ${s.old.text}`,
      `(iv) ${s.bill.text}`,
    ].join('\n');
    keptHidden.keep(text, s);
    return text;
  },
  parts: [
    {
      kind: 'mcq',
      make: (s) => {
        const none = 'No entry is passed';
        const pay = (x: number) => `Realisation A/c Dr ${inr(x)}; To Bank A/c ${inr(x)}`;
        const get = (x: number) => `Bank A/c Dr ${inr(x)}; To Realisation A/c ${inr(x)}`;
        const everyday = `Creditors A/c Dr ${inr(s.how === 'full' ? s.owed : s.agreed)}; To ${s.t.name} A/c ${inr(s.how === 'full' ? s.owed : s.agreed)}`;
        const twice = 'Both accounts were closed by the transfers to Realisation A/c, so no entry is passed for handing the asset over';
        const [correct, wrong, why]: [string, [string, string][], string] =
          s.how === 'part'
            ? [
                pay(s.gap),
                [
                  [none, 'Stopped at the asset, for which no entry is needed, and forgot the cheque paid for the balance.'],
                  [pay(s.owed), 'Paid the whole claim by cheque, ignoring the asset accepted in part settlement.'],
                  ...(s.owed > s.book ? [[pay(s.owed - s.book), 'Set the book value of the asset against the claim instead of the value agreed with the creditor.'] as [string, string]] : []),
                  [everyday, `Passed the everyday entry for settling a debt with an asset. ${twice}.`],
                  [get(s.gap), 'Reversed the entry: the firm pays the balance, it does not receive it.'],
                ],
                `${twice}. The creditor is still owed ${inr(s.owed)} - ${inr(s.agreed)} = ${inr(s.gap)}, paid by cheque: Realisation A/c Dr; To Bank A/c.`,
              ]
            : s.how === 'full'
              ? [
                  none,
                  [
                    [everyday, `Passed the everyday entry for settling a debt with an asset. ${twice}.`],
                    [pay(s.owed), 'Recorded a payment by cheque, although no money left the firm.'],
                    [`Realisation A/c Dr ${inr(s.book)}; To ${s.t.name} A/c ${inr(s.book)}`, 'Transferred the asset to Realisation A/c a second time; it went there with the other assets.'],
                    [`Creditors A/c Dr ${inr(s.owed)}; To Realisation A/c ${inr(s.owed)}`, 'Transferred the creditor to Realisation A/c a second time; the creditors went there with the other liabilities.'],
                  ],
                  `The asset (${inr(s.book)}, on the debit side) and the claim (${inr(s.owed)}, among the creditors on the credit side) are both in Realisation A/c already, and no money moves, so no entry is passed. The difference stays in the balance of Realisation A/c.`,
                ]
              : [
                  get(s.gap),
                  [
                    [none, 'Stopped at the asset, for which no entry is needed, and forgot the money the creditor paid in.'],
                    [pay(s.gap), 'Reversed the entry: the creditor pays the firm the difference, the firm pays nothing.'],
                    [get(s.agreed), 'Recorded the whole agreed value as money received; only the difference over the debt came in.'],
                    [everyday, `Passed the everyday entry for settling a debt with an asset. ${twice}.`],
                  ],
                  `${twice}. The asset was valued at more than the debt, so the creditor paid the firm ${inr(s.agreed)} - ${inr(s.owed)} = ${inr(s.gap)}: Bank A/c Dr; To Realisation A/c.`,
                ];
        return choice('Which journal entry is passed for item (i)?', correct, wrong, why, H.entry);
      },
      verify: (q) => {
        const text = q.context ?? '';
        const answer = optionText(q);
        const owed = rupeesIn(/A creditor for ₹([\d,]+)/.exec(text));
        const agreed = rupeesIn(/agreed value of ₹([\d,]+)/.exec(text));
        const amount = rupeesIn(/₹([\d,]+)/.exec(answer));
        if (text.includes('in full settlement')) return answer === 'No entry is passed';
        if (text.includes('paid the difference to the firm')) return answer.startsWith('Bank A/c Dr') && amount === agreed - owed;
        return answer.startsWith('Realisation A/c Dr') && answer.includes('To Bank A/c') && amount === owed - agreed;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const first = s.how === 'part' ? s.gap : 0;
        const answer = first + s.restPaid;
        const n = numeric(answer, [
          ...(s.pct ? [[first + s.rest, 'Paid the remaining creditors in full, missing the discount they allowed.'] as [number, string]] : []),
          ...(s.how === 'part' ? [[s.owed + s.restPaid, `Paid the creditor of ${inr(s.owed)} in full by cheque, ignoring ${s.t.the} accepted in part settlement.`] as [number, string]] : []),
          ...(s.how === 'full' ? [[s.owed + s.restPaid, `Paid the creditor of ${inr(s.owed)} as well; ${s.t.the} settled that claim in full and nothing more is due.`] as [number, string]] : []),
          ...(s.how === 'full' && s.owed > s.book ? [[s.owed - s.book + s.restPaid, `Paid the creditor the difference between the claim and the book value of ${s.t.the}; "in full settlement" means nothing more is paid.`] as [number, string]] : []),
          ...(s.how === 'pays' ? [[s.restPaid - s.gap, `Set the ${inr(s.gap)} the creditor paid in against the payments; it is money received, not a smaller payment.`] as [number, string]] : []),
          ...(s.how === 'pays' ? [[s.restPaid + s.gap, `Took the ${inr(s.gap)} the creditor paid in as a payment to the creditor.`] as [number, string]] : []),
          ...(s.pct && s.how === 'part' ? [[((s.gap + s.rest) * (100 - s.pct)) / 100, 'Took the discount on the balance paid to the first creditor as well; only the remaining creditors allowed it.'] as [number, string]] : []),
          [s.owed + s.rest, 'Took the creditors as paid at their book figure.'],
        ]);
        return (
          n && {
            prompt: 'How much did the firm pay the creditors by cheque in all?',
            ...n,
            explanation: [
              s.how === 'part'
                ? `(i) Paid by cheque: ${inr(s.owed)} - ${inr(s.agreed)} = ${inr(s.gap)}. No entry is passed for the asset handed over.`
                : s.how === 'full'
                  ? `(i) Nothing is paid: ${s.t.the} ${s.t.plural ? 'settle' : 'settles'} the whole claim, whatever ${s.t.plural ? 'their' : 'its'} book value.`
                  : `(i) Nothing is paid: the creditor pays the firm ${inr(s.gap)}, which is money received.`,
              `(ii) Remaining creditors = ${inr(s.owed + s.rest)} - ${inr(s.owed)} = ${inr(s.rest)}${s.pct ? `; less ${s.pct}% discount ${inr((s.rest * s.pct) / 100)}; paid ${inr(s.restPaid)}` : ', paid in full'}.`,
              s.how === 'part'
                ? `Total paid by cheque = ${inr(s.gap)} + ${inr(s.restPaid)} = ${inr(answer)}, all of it debited to Realisation A/c.`
                : `Total paid by cheque = ${inr(answer)}, debited to Realisation A/c.`,
            ],
            hints: H.entry,
          }
        );
      },
      verify: (q: NumericQuestion) => {
        const text = q.context ?? '';
        const all = rupeesIn(/Creditors stood in the books at ₹([\d,]+)/.exec(text));
        const owed = rupeesIn(/A creditor for ₹([\d,]+)/.exec(text));
        const agreed = rupeesIn(/agreed value of ₹([\d,]+)/.exec(text));
        const pct = Number(/discount of (\d+)%/.exec(text)?.[1] ?? 0);
        const first = text.includes('in part settlement') ? owed - agreed : 0;
        return q.answer === rupees(first + ((all - owed) * (100 - pct)) / 100);
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const by = s.old.by === null ? null : s.f.names[s.old.by];
        return {
          prompt: 'Pass the journal entry for item (iii).',
          lines: [dr(by ? partnerCapital(by) : 'bank', s.old.amount), cr(REAL, s.old.amount)],
          explanation: [
            'An asset that is not in the books has no book value, so nothing for it was transferred to the debit of Realisation A/c.',
            by ? `${by} takes it in place of money, so ${by}'s Capital A/c is debited with ${inr(s.old.amount)}.` : `The money received, ${inr(s.old.amount)}, is debited to Bank A/c.`,
            'Realisation A/c is credited: the whole amount is a gain.',
          ],
          distractorAccounts: [s.old.id, 'profitAndLoss'],
          hints: H.entry,
        };
      },
      verify: (q: JournalQuestion) => {
        const line = (q.context ?? '').split('\n').find((l) => l.startsWith('(iii) ')) ?? '';
        const v = rupeesIn(/₹([\d,]+)/.exec(line));
        const by = /taken over by ([A-Z][a-z]+) at/.exec(line)?.[1];
        return q.expected.length === 2 && hasLine(q.expected, by ? partnerCapital(by) : 'bank', 'Dr', v) && hasLine(q.expected, REAL, 'Cr', v);
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const by = s.bill.by === null ? null : s.f.names[s.bill.by];
        return {
          prompt: 'Pass the journal entry for item (iv).',
          lines: [dr(REAL, s.bill.amount), cr(by ? partnerCapital(by) : 'bank', s.bill.amount)],
          explanation: [
            'A liability that is not in the books was never on the credit of Realisation A/c, so the whole of it is a loss when it is met: Realisation A/c is debited.',
            by ? `${by} meets it for the firm, so the firm owes ${by} that much more: ${by}'s Capital A/c is credited.` : 'The firm pays, so Bank A/c is credited.',
          ],
          distractorAccounts: [s.bill.id, 'profitAndLoss'],
          hints: H.entry,
        };
      },
      verify: (q: JournalQuestion) => {
        const line = (q.context ?? '').split('\n').find((l) => l.startsWith('(iv) ')) ?? '';
        const w = rupeesIn(/₹([\d,]+)/.exec(line));
        const by = /([A-Z][a-z]+) agreed to pay it personally/.exec(line)?.[1];
        return q.expected.length === 2 && hasLine(q.expected, REAL, 'Dr', w) && hasLine(q.expected, by ? partnerCapital(by) : 'bank', 'Cr', w);
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const { result } = s;
        const firstPaid = s.how === 'part' ? s.gap : 0;
        const firstGot = s.how === 'pays' ? s.gap : 0;
        const debit = s.debit + firstPaid + s.restPaid + s.bill.amount;
        const credit = s.credit + firstGot + s.old.amount;
        const slips: [number, string][] = [
          [-s.old.amount, `Left out the unrecorded asset ${s.old.by === null ? 'that was sold' : `taken over by ${s.f.names[s.old.by]}`}, the whole of which is a gain.`],
          [s.bill.amount, s.bill.by === null ? 'Left out the unrecorded liability the firm paid, which is a loss in Realisation A/c.' : `Left out the liability ${s.f.names[s.bill.by]} met, as if what a partner pays were no concern of the firm; the firm bears it and owes ${s.f.names[s.bill.by]} for it.`],
          ...(s.how === 'part' ? [[s.agreed, `Credited Realisation A/c with ${s.t.the} given to the creditor as well as paying only the balance; no entry is passed for the asset.`] as [number, string], [-s.agreed, `Paid the creditor of ${inr(s.owed)} in full, ignoring ${s.t.the} accepted in part settlement.`] as [number, string]] : []),
          ...(s.how === 'full' ? [[-s.owed, `Paid the creditor of ${inr(s.owed)} in full by cheque as well; ${s.t.the} settled the whole claim.`] as [number, string]] : []),
          ...(s.how === 'pays' ? [[-s.gap, 'Left out the money the creditor paid in for the difference.'] as [number, string], [-2 * s.gap, 'Took the money the creditor paid in as a payment by the firm.'] as [number, string]] : []),
          ...(s.pct ? [[-(s.rest - s.restPaid), 'Paid the remaining creditors in full, missing the discount they allowed.'] as [number, string]] : []),
        ];
        return choice(
          'Once the four items are entered, what does Realisation A/c show?',
          profitOrLoss(result),
          [[profitOrLoss(-result), result > 0 ? 'Read the heavier credit side of Realisation A/c as a loss.' : 'Read the heavier debit side of Realisation A/c as a profit.'], ...slips.map(([d, why]): [string, string] => [profitOrLoss(result + d), why])],
          `Debit: ${inr(s.debit)}${firstPaid ? ` + balance paid to the creditor ${inr(firstPaid)}` : ''} + remaining creditors ${inr(s.restPaid)} + unrecorded liability ${inr(s.bill.amount)} = ${inr(debit)}. Credit: ${inr(s.credit)}${firstGot ? ` + paid in by the creditor ${inr(firstGot)}` : ''} + unrecorded asset ${inr(s.old.amount)} = ${inr(credit)}. ${resultLine(debit, credit)}`,
          H.realisation,
        );
      },
      verify: (q) => {
        const s = keptHidden.of(q.context ?? '');
        if (!s) return false;
        // The long way: the totals so far as an opening balance of Realisation A/c, and the four items posted to it.
        const by = (i: number | null) => (i === null ? 'bank' : partnerCapital(s.f.names[i]));
        const entries: JournalLine[][] = [
          [dr(REAL, s.debit), cr('capital', s.debit)],
          [dr('capital', s.credit), cr(REAL, s.credit)],
          ...(s.how === 'part' ? [[dr(REAL, s.owed - s.agreed), cr('bank', s.owed - s.agreed)]] : s.how === 'pays' ? [[dr('bank', s.agreed - s.owed), cr(REAL, s.agreed - s.owed)]] : []),
          [dr(REAL, s.rest - (s.rest * s.pct) / 100), cr('bank', s.rest - (s.rest * s.pct) / 100)],
          [dr(by(s.old.by), s.old.amount), cr(REAL, s.old.amount)],
          [dr(REAL, s.bill.amount), cr(by(s.bill.by), s.bill.amount)],
        ];
        return optionText(q) === profitOrLoss(realisationResult(entries));
      },
    },
  ],
});

// ===============================================================================================================
// Chained cases: one whole dissolution (`windUp` of the topic), its balance sheet and what happened, from which the
// student prepares the books in turn. The rows, wrong labels, working and checks of each account are those of the
// examined formats of the topic. The case text never gives the profit or loss on realisation, nor the balances of
// the capital accounts: each is what an earlier part ends on, and the part that starts from it says so.
// ===============================================================================================================

const keptBooks = keepFor<Books>();
/** The first of a few draws from the same random stream that works out: most dissolutions drawn are fine, some are too long or too short. */
function firstOf<X>(times: number, draw: () => X | null): X | null {
  for (let k = 0; k < times; k++) {
    const x = draw();
    if (x !== null) return x;
  }
  return null;
}
const booksOf = (q: { data: string }): Books | undefined => keptBooks.of(q.data);
/**
 * The main fixed asset is sold at a believable price: land or a building for no less than about four-fifths of its
 * book value; machinery, which may be what leaves a partner short, for no less than about three-fifths in a forced sale.
 */
const believable = (b: Books): boolean => b.assets[0].cash >= b.assets[0].book * (b.assets[0].t.id === 'machinery' ? 0.58 : 0.78);

/**
 * The case text of a chained case: the whole dissolution and, for a case that goes on to the capital accounts and
 * Bank A/c, the lines that close the books (`after`). Kept for `verify`.
 */
function bookText(b: Books, after: readonly string[]): string {
  const closing = after.length > 0 && b.loan ? [`After the outside liabilities had been settled, ${b.f.names[b.loan.by]}'s loan was repaid.`] : [];
  const text = caseData(b, [...closing, ...after]);
  keptBooks.keep(text, b);
  return text;
}
const PAID_OFF = "Finally, every partner was paid the balance of that partner's capital account.";
const BROUGHT_IN = 'Any partner whose capital account then showed a debit balance brought that amount in; every partner whose account showed a credit balance was paid that amount.';

const realisationPart = (b: Books): CaseAccountParts | null => {
  const sides = realisationAccount(b);
  return (
    sides && {
      task: `Prepare Realisation A/c of the firm on its dissolution on ${b.f.date}. ${REALISATION_TASK}`,
      title: 'Realisation A/c',
      ...sides,
      distractors: realisationSlips(b),
      explanation: realisationNotes(b),
      hints: FORMAT_HINTS.realisation,
    }
  );
};
const capitalsPart = (b: Books, least: number): CaseAccountParts | null => {
  const sides = capitalAccounts(b, least);
  return (
    sides && {
      task: "Starting from the profit or loss of Realisation A/c, prepare the partners' capital accounts in columns to close the books of the firm. Enter each item as a row of its own.",
      title: "Partners' Capital Accounts",
      columns: partnerColumns(b.f.names),
      ...sides,
      distractors: capitalSlips(b),
      explanation: capitalWorking(b, false),
      hints: FORMAT_HINTS.capitals,
    }
  );
};
const bankPart = (b: Books): CaseAccountParts | null => {
  const sides = moneyAccount(b);
  return (
    sides && {
      task: "Starting from the closing balances of the partners' capital accounts, prepare Bank A/c of the firm and show that it closes with nothing left. Enter every receipt and payment as a row of its own.",
      title: 'Bank A/c',
      ...sides,
      distractors: moneySlips(b),
      explanation: moneyWorking(b),
      hints: FORMAT_HINTS.money,
    }
  );
};

// 5. The board's long question: Realisation A/c, then the partners' capital accounts in columns (from its profit or
//    loss), then Bank A/c (from the balances of the capital accounts), which closes at nil. Every partner ends with
//    something to receive. What varies: two or three partners, how the stock and a second asset go (sold, taken over
//    by a partner, accepted by the creditors, nothing said), a provision, goodwill or patents about which nothing is
//    said, a second outside liability (perhaps paid by a partner), a partner's loan, a reserve or an accumulated
//    profit or loss, a loan to a partner, an unrecorded asset or liability, and the form of the expenses (complex)
const chainWhole = caseTemplate<Books>({
  id: 'case-dis-chain-realisation-capitals-bank',
  topicId: T,
  conceptId: C,
  difficulty: 'complex',
  title: 'Realisation, capital and bank accounts',
  setup: (rng) => firstOf(6, () => {
    const b = windUp(rng, {
      ways: [['taken', 'sold'], ['sold', 'partner'], ['taken', 'creditor'], ['creditor', 'partner'], ['sold', 'silent'], ['taken', 'silent'], ['sold', 'creditor']],
      provision: true,
      intangible: true,
      secondLiability: 2,
      liabilityTaken: true,
      partnerLoan: 2,
      reserves: ['none', 'reserve', 'profit', 'loss', 'reserveAndLoss'],
      loanTo: true,
      unrecorded: ['none', 'none', 'asset', 'liability'],
      expenses: ['firm', 'partnerPays', 'feePersonal', 'feeFirmPays', 'borneFirmPays', 'bornePersonal'],
    });
    // Four marks' worth of capital accounts at least, and a Bank A/c of nine rows or more.
    return b && believable(b) && realisationAccount(b) && capitalAccounts(b, 7) && moneyAccount(b) ? b : null;
  }),
  context: (b) => bookText(b, [PAID_OFF]),
  parts: [
    { kind: 'account', make: realisationPart, verify: (q) => { const b = booksOf(q); return b !== undefined && realisationHoldsFor(b, q); } },
    { kind: 'account', make: (b) => capitalsPart(b, 7), verify: (q) => { const b = booksOf(q); return b !== undefined && capitalsHoldFor(b, q, false); } },
    { kind: 'account', make: bankPart, verify: (q) => { const b = booksOf(q); return b !== undefined && moneyHoldsFor(b, q); } },
  ],
});

// 6. A set of the dissolution entries, then Realisation A/c: the two transfers, then one entry for every receipt,
//    payment and taking over that passes through Realisation A/c (and for what the firm pays on a partner's
//    behalf), each item named without its figures, which are in the case text; then the account those entries write
//    up, with its result shared. What varies: as in the case before it, kept to eight entries (medium)

/** One item of the set for a step of the dissolution: what it is called, and why its entry is what it is. */
function setItemOf(b: Books, s: Step): Item | null {
  const { f } = b;
  const who = (i: number): string => f.names[i];
  const x = who(b.exp.by);
  const step = (text: string, explanation: string[]): Item => ({ text, lines: s.lines, explanation });
  const asset = b.assets.find((a) => low(a.t.name) === s.what);
  switch (s.kind) {
    case 'assets':
      return step('The assets that go to Realisation A/c were transferred to it.', [
        `Every asset except the cash at bank${b.loanTo ? `, the loan to ${who(b.loanTo.to)}` : ''}${b.accumulated.some((a) => !a.credit) ? ' and the debit balance of Profit and Loss A/c' : ''} goes at its book value: ${b.assets.map((a) => `${low(a.t.name)} ${inr(a.book)}`).join(', ')}, in all ${inr(total(b.assets.map((a) => a.book)))}.`,
        `Realisation A/c is debited with the total and each asset account is credited.${b.provision ? ' The debtors go at their gross figure.' : ''}`,
      ]);
    case 'liabilities':
      return step('The balances on the liabilities side that go to Realisation A/c were transferred to it.', [
        `The outside liabilities${b.provision ? ' and the provision for doubtful debts' : ''} go: ${[...b.liabs.map((l) => `${low(l.label)} ${inr(l.book)}`), ...(b.provision ? [`provision ${inr(b.provision)}`] : [])].join(', ')}.`,
        `Each is debited and Realisation A/c is credited with the total. ${cap(list([...(b.loan ? [`${who(b.loan.by)}'s loan`] : []), ...b.accumulated.filter((a) => a.credit).map((a) => a.label), 'the capitals']))} stay out.`,
      ]);
    case 'realised':
      if (!asset) return step(`The ${s.what} was sold.`, ['It was never in the books, so nothing for it is on the debit of Realisation A/c: the money received is a gain.', 'Bank A/c is debited and Realisation A/c is credited.']);
      if (asset.t.id === 'debtors') return step('The debtors were collected.', [`Money collected = ${inr(asset.cash)}${asset.bad ? ` (${inr(asset.book)} less bad debts ${inr(asset.bad)})` : ''}: Bank A/c is debited and Realisation A/c is credited.`]);
      if (asset.silent) return step(`${cap(asset.t.the)}, about which nothing is said, ${was(asset.t)} realised.`, [`A tangible asset whose realised value is not given realises its book value, ${inr(asset.cash)}.`, 'Bank A/c is debited and Realisation A/c is credited.']);
      return step(`${cap(asset.t.the)} ${was(asset.t)} sold.`, [`Money received, ${inr(asset.cash)}: Bank A/c is debited and Realisation A/c is credited.`]);
    case 'taken': {
      const by = asset?.taken?.by ?? b.extraAsset?.taken?.by ?? 0;
      return step(asset ? `${who(by)} took over ${asset.t.the}.` : `${who(by)} took over the ${s.what}.`, [
        `${who(by)} takes it in place of money, so ${who(by)}'s Capital A/c is debited with the agreed value.`,
        asset ? 'Realisation A/c is credited, as on a sale.' : 'It was never in the books, so the whole value is a gain: Realisation A/c is credited.',
      ]);
    }
    case 'paid': {
      const l = b.liabs.find((x) => x.what === s.what);
      const given = b.assets.find((a) => a.given !== undefined);
      if (!l) return step(`The ${s.what} was paid.`, ['It was never in the books, so the whole payment is a loss: Realisation A/c is debited and Bank A/c is credited.']);
      if (l.id === 'creditors' && given) return step(`The creditors who accepted ${given.t.the} were paid the balance of their claim.`, ['No entry is passed for the asset handed over: the asset and the creditors are both in Realisation A/c already.', `Only the balance paid, ${inr(l.book)} - ${inr(given.given!)} = ${inr(l.cash)}, is debited to Realisation A/c and credited to Bank A/c.`]);
      if (l.cash < l.book) return step('The creditors were paid what they accepted in full settlement.', [`The payment of ${inr(l.cash)} is debited to Realisation A/c and credited to Bank A/c. What the creditors gave up needs no entry.`]);
      return step(`${cap(l.the)} ${l.plural ? 'were' : 'was'} paid.`, [`The payment of ${inr(l.cash)} is debited to Realisation A/c, where the liability stands on the credit side, and credited to Bank A/c.`]);
    }
    case 'borne': {
      const l = b.liabs.find((x) => x.what === s.what);
      const by = l?.by ?? b.extraLiab?.by ?? 0;
      return step(l ? `${who(by)} agreed to pay ${l.the} personally.` : `${who(by)} paid the ${s.what} on the firm's behalf.`, [
        `Realisation A/c is debited, as if the firm had paid it${l ? '' : ': it was never in the books, so the whole of it is a loss'}.`,
        `No money leaves the firm. ${who(by)} pays for the firm, so ${who(by)}'s Capital A/c is credited.`,
      ]);
    }
    case 'expenses':
      if (b.exp.form === 'firm') return step('The realisation expenses were paid.', ['The firm bears and pays them: Realisation A/c is debited and Bank A/c is credited.']);
      if (b.exp.form === 'partnerPays') return step(`${x} paid the realisation expenses for the firm.`, ['The firm bears them, so Realisation A/c is debited.', `${x} paid for the firm, so ${x}'s Capital A/c is credited.`]);
      return step(`The remuneration agreed with ${x}.`, [`The firm owes ${x} the remuneration, ${inr(b.exp.fee)}, whatever the expenses come to: Realisation A/c is debited and ${x}'s Capital A/c is credited.`]);
    case 'onBehalf':
      return step(`The firm paid the realisation expenses on ${x}'s behalf.`, [`The expenses are ${x}'s to bear and the firm's money paid them: ${x}'s Capital A/c is debited and Bank A/c is credited. Realisation A/c is not touched.`]);
    default:
      return null;
  }
}
const SET_KINDS: Step['kind'][] = ['assets', 'liabilities', 'realised', 'taken', 'paid', 'borne', 'expenses', 'onBehalf'];
const setItemsOf = (b: Books): Item[] => b.steps.filter((s) => SET_KINDS.includes(s.kind)).flatMap((s) => setItemOf(b, s) ?? []);
/** The items of the set are lettered, (a), (b), ...: the events of the case text above them are numbered (i), (ii), ... */
const lettered = (items: readonly Item[]): (Item & { label: string })[] => items.map((item, k) => ({ label: `(${'abcdefgh'[k]})`, ...item }));

const chainEntries = caseTemplate<Books>({
  id: 'case-dis-chain-entries-realisation',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'Dissolution entries and Realisation A/c',
  setup: (rng) => firstOf(6, () => {
    const b = windUp(rng, {
      ways: [['taken', 'creditor'], ['creditor', 'partner'], ['sold', 'creditor'], ['creditor', 'silent'], ['taken', 'sold'], ['sold', 'partner']],
      provision: true,
      intangible: true,
      secondLiability: 1,
      liabilityTaken: true,
      partnerLoan: 1,
      reserves: ['none', 'reserve', 'profit', 'loss'],
      loanTo: true,
      unrecorded: ['none', 'none', 'asset', 'liability'],
      expenses: ['firm', 'partnerPays', 'feePersonal', 'feeFirmPays', 'borneFirmPays'],
    });
    if (!b || !believable(b) || !realisationAccount(b)) return null;
    const n = setItemsOf(b).length;
    return n >= 5 && n <= 8 ? b : null;
  }),
  context: (b) => bookText(b, []),
  parts: [
    {
      kind: 'journal_set',
      make: (b) => ({
        task: 'Pass the journal entries for the transfers to Realisation A/c and for the items below, one entry for each, in the order given.',
        transactions: lettered(setItemsOf(b)),
        hints: SET_HINTS.items,
        distractorAccounts: ['profitAndLossAppropriation', 'revaluation', 'creditors', ...(b.loan ? [partnerLoan(b.f.names[b.loan.by])] : [])],
      }),
      verify: (q: JournalSetQuestion) => {
        const b = keptBooks.of(q.context ?? '');
        if (!b) return false;
        // The set and the entries it leaves out (the reserves, the result, the loans and the final payment) close the books.
        const rest = b.steps.filter((s) => !SET_KINDS.includes(s.kind)).map((s) => s.lines);
        return closes(b, [...q.entries.map((e) => e.expected), ...rest]) && q.entries.every((e) => e.expected.some((l) => l.accountId === REAL) || /on .+'s behalf/.test(e.text));
      },
    },
    { kind: 'account', make: realisationPart, verify: (q) => { const b = booksOf(q); return b !== undefined && realisationHoldsFor(b, q); } },
  ],
});

// 7. A partner falls short: Realisation A/c, then the partners' capital accounts, in which one partner (never the
//    one who lent the firm money) ends with a debit balance and brings the amount in, then Bank A/c, which takes in
//    that money and closes at nil. Nobody is insolvent. What varies: as in the first chained case, with the partner
//    who falls short having taken over the stock (complex)
const chainShortfall = caseTemplate<Books>({
  id: 'case-dis-chain-partner-brings-cash',
  topicId: T,
  conceptId: C,
  difficulty: 'complex',
  title: 'A partner brings in cash',
  setup: (rng) => firstOf(6, () => {
    const b = windUp(rng, {
      ways: [['taken', 'sold'], ['taken', 'partner'], ['taken', 'silent'], ['taken', 'creditor']],
      provision: true,
      intangible: true,
      secondLiability: 2,
      liabilityTaken: true,
      partnerLoan: 2,
      reserves: ['none', 'loss', 'reserve', 'reserveAndLoss'],
      loanTo: true,
      unrecorded: ['none', 'none', 'asset', 'liability'],
      expenses: ['firm', 'partnerPays', 'feePersonal', 'feeFirmPays', 'borneFirmPays', 'bornePersonal'],
      shortfall: true,
    });
    return b && believable(b) && realisationAccount(b) && capitalAccounts(b, 7) && moneyAccount(b) ? b : null;
  }),
  context: (b) => bookText(b, [BROUGHT_IN]),
  parts: [
    { kind: 'account', make: realisationPart, verify: (q) => { const b = booksOf(q); return b !== undefined && realisationHoldsFor(b, q); } },
    { kind: 'account', make: (b) => capitalsPart(b, 7), verify: (q) => { const b = booksOf(q); return b !== undefined && capitalsHoldFor(b, q, true); } },
    { kind: 'account', make: bankPart, verify: (q) => { const b = booksOf(q); return b !== undefined && moneyHoldsFor(b, q); } },
  ],
});

const cases: CaseTemplate[] = [itemsCase, expensesCase, settleCase, hiddenCase, chainWhole, chainEntries, chainShortfall];

export default cases;
