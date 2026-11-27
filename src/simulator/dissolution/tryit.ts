import type { KitAnswer, KitChoice } from '@/components/simulator/labs/kit/answers';
import { formatINR, type Paise } from '@/engine/money';
import { createRng, type Rng } from '@/engine/rng';
import { splitByRatio } from '../partnership/split';
import { randomFirm } from './examples';
import { acceptedOf, dissolve, eventsOf, expensesText, paidFor, withArticle, type DFirm, type Dissolution, type ExpenseForm, type StepKind } from './dissolve';

// ---------------------------------------------------------------------------------------------------------------
// "Try it": quick questions on the picture of a dissolution. The picture stands after `shown` steps while the
// question is open and moves on to `reveal` steps once it is answered. Nothing is recorded.
// ---------------------------------------------------------------------------------------------------------------

export const DIS_ASK_KINDS = ['side', 'result', 'cash', 'expenses'] as const;
export type DisAskKind = (typeof DIS_ASK_KINDS)[number];

export const DIS_ASK_LABEL: Record<DisAskKind, string> = {
  side: 'Which side of Realisation A/c?',
  result: 'Profit or loss on realisation',
  cash: 'What a partner gets',
  expenses: 'The entry for the expenses',
};

export interface DisAsk {
  kind: DisAskKind;
  prompt: string;
  firm: DFirm;
  shown: number;
  reveal: number;
  answer: KitAnswer;
  reason: string;
}

const inr = formatINR;
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const stepAt = (d: Dissolution, kind: StepKind, from = 0): number => d.steps.findIndex((s, i) => i >= from && s.kind === kind);

function mistakesOf(answer: Paise, list: [Paise, string][]): { value: Paise; why: string }[] {
  const seen = new Set([answer]);
  const out: { value: Paise; why: string }[] = [];
  for (const [v, why] of list) {
    if (v > 0 && !seen.has(v)) {
      seen.add(v);
      out.push({ value: v, why });
    }
  }
  return out;
}

/** A made-up firm whose books close. */
const firmFor = (rng: Rng): { f: DFirm; d: Dissolution } => {
  const f = randomFirm(rng);
  return { f, d: dissolve(f) };
};

// ---- Which side ---------------------------------------------------------------------------------------------------

type SideId = 'dr' | 'cr' | 'none';
interface SideItem {
  text: string;
  side: SideId;
  step: number;
  reason: string;
  /** Why each wrong side is wrong. */
  why: Partial<Record<SideId, string>>;
}

function sideItems(f: DFirm, d: Dissolution): SideItem[] {
  const names = f.partners.map((p) => p.name);
  const items: SideItem[] = [];
  const aStep = stepAt(d, 'assets');
  const lStep = stepAt(d, 'liabilities');
  for (const a of f.assets) {
    items.push({
      text: `${a.name}, standing in the books at ${inr(a.book)}, when it is transferred`,
      side: 'dr',
      step: aStep,
      reason: `Every asset but cash at bank and fictitious assets is transferred to the debit of Realisation A/c at its book value: Realisation A/c Dr; To ${a.name} A/c.`,
      why: { cr: 'An asset is closed by a credit in its own account, so Realisation A/c is debited.', none: 'Only cash at bank and fictitious assets stay out; every other asset goes in.' },
    });
  }
  for (const l of f.liabilities) {
    const relative = l.id.startsWith('partnerLoan:');
    items.push({
      text: `${l.name}, ${inr(l.book)}, when it is transferred`,
      side: 'cr',
      step: lStep,
      reason: relative ? 'A relative of a partner is an outsider, so the loan is an outside liability: it goes to the credit of Realisation A/c.' : 'Outside liabilities are transferred to the credit of Realisation A/c at their book figures.',
      why: { dr: 'A liability has a credit balance; it is closed by a debit in its own account and a credit in Realisation A/c.', none: relative ? "Only a partner's own loan stays out; a relative is not a partner." : 'Every outside liability goes to Realisation A/c.' },
    });
  }
  if (f.provision) {
    items.push({
      text: `Provision for doubtful debts, ${inr(f.provision)}`,
      side: 'cr',
      step: lStep,
      reason: 'The debtors go to the debit at their gross figure, so the provision against them goes to the credit.',
      why: { dr: 'A provision has a credit balance, like a liability.', none: 'It is not a reserve: it stands against the debtors and is closed through Realisation A/c.' },
    });
  }
  const accStep = stepAt(d, 'accumulated');
  if (f.reserve) {
    items.push({
      text: `General Reserve, ${inr(f.reserve)}`,
      side: 'none',
      step: accStep,
      reason: "A reserve is profit kept back: it belongs to the partners and is credited to their capital accounts in the profit-sharing ratio.",
      why: { cr: 'It is not owed to an outsider; it is undistributed profit.', dr: 'It has a credit balance, and it is not an asset.' },
    });
  }
  if (f.plDebit) {
    items.push({
      text: `Profit and Loss A/c (debit balance), ${inr(f.plDebit)}`,
      side: 'none',
      step: accStep,
      reason: "A past loss cannot be sold: it is debited to the partners' capital accounts in the profit-sharing ratio.",
      why: { dr: 'It is a fictitious asset; nothing can be realised from it.', cr: 'It has a debit balance, and it is not a liability.' },
    });
  }
  const loanStep = stepAt(d, 'loans');
  for (const p of f.partners.filter((x) => x.loan > 0)) {
    items.push({
      text: `${p.name}'s loan to the firm, ${inr(p.loan)}`,
      side: 'none',
      step: loanStep,
      reason: `A partner's own loan never goes to Realisation A/c: it is repaid after the outside liabilities, ${p.name}'s Loan A/c Dr; To Bank A/c.`,
      why: { cr: 'It is not an outside liability: the lender is a partner.', dr: 'The loan is owed by the firm; it is not an asset.' },
    });
  }
  for (const a of f.assets) {
    if (a.fate.kind === 'sold') {
      items.push({
        text: `${a.the} realised ${inr(a.fate.amount)}`.replace(/^t/, 'T'),
        side: 'cr',
        step: stepAt(d, 'sold'),
        reason: 'Money received for an asset: Bank A/c Dr; To Realisation A/c.',
        why: { dr: 'The asset is already on the debit at book value; what it fetches is the other half, on the credit.', none: 'What every asset fetches goes through Realisation A/c, which finds the profit or loss.' },
      });
    }
    if (a.fate.kind === 'taken') {
      const by = a.fate.by;
      items.push({
        text: `${names[by]} took over ${a.the} at ${inr(a.fate.amount)}`,
        side: 'cr',
        step: d.steps.findIndex((s) => s.kind === 'taken' && s.title.includes(a.the)),
        reason: `${names[by]} takes the asset in place of money: ${names[by]}'s Capital A/c Dr; To Realisation A/c, as on a sale.`,
        why: { dr: 'The asset is already on the debit; taking it over is like buying it, a credit.', none: "The asset was transferred to Realisation A/c, so its value is credited there and charged to the partner's capital." },
      });
    }
  }
  for (const l of f.liabilities) {
    const paid = paidFor(f, l);
    if (l.fate.kind === 'paid' && paid > 0) {
      items.push({
        text: `${inr(paid)} paid to settle ${l.the}`,
        side: 'dr',
        step: d.steps.findIndex((s) => s.kind === 'paid' || s.kind === 'creditorsAsset'),
        reason: 'Money paid for a liability: Realisation A/c Dr; To Bank A/c, with the amount actually paid.',
        why: { cr: 'The liability is already on the credit; what is paid for it is the other half, on the debit.', none: 'Liabilities are paid through Realisation A/c, which finds the profit or loss.' },
      });
    }
    if (l.fate.kind === 'taken') {
      items.push({
        text: `${names[l.fate.by]} agreed to pay ${l.the}, ${inr(l.book)}, personally`,
        side: 'dr',
        step: d.steps.findIndex((s) => s.kind === 'liabilityTaken' && s.title.includes(l.the)),
        reason: `The firm now owes ${names[l.fate.by]} the amount: Realisation A/c Dr; To ${names[l.fate.by]}'s Capital A/c.`,
        why: { cr: 'The liability is already on the credit; settling it is the debit half.', none: 'The liability was transferred to Realisation A/c, so its settlement goes there too.' },
      });
    }
  }
  if (f.unrecordedAsset && f.unrecordedAsset.by === null) {
    items.push({
      text: `${cap(withArticle(f.unrecordedAsset.what))}, not in the books, sold for ${inr(f.unrecordedAsset.amount)}`,
      side: 'cr',
      step: stepAt(d, 'unrecordedAsset'),
      reason: 'An unrecorded asset has no book value, so all it fetches is a gain: Bank A/c Dr; To Realisation A/c.',
      why: { dr: 'Nothing was debited for it, and money came in: a credit.', none: 'Every gain of winding up is gathered in Realisation A/c first.' },
    });
  }
  if (f.unrecordedLiability && f.unrecordedLiability.by === null) {
    items.push({
      text: `${cap(withArticle(f.unrecordedLiability.what))} of ${inr(f.unrecordedLiability.amount)}, not in the books, paid by the firm`,
      side: 'dr',
      step: stepAt(d, 'unrecordedLiability'),
      reason: 'Nothing stood on the credit for it, so the whole payment is a loss: Realisation A/c Dr; To Bank A/c.',
      why: { cr: 'Money went out to settle a liability: a debit.', none: 'Every loss of winding up is gathered in Realisation A/c first.' },
    });
  }
  const e = f.expenses;
  const x = names[e.by];
  const eStep = stepAt(d, 'expenses');
  if (e.form === 'firm') {
    items.push({ text: `Realisation expenses of ${inr(e.actual)}, borne and paid by the firm`, side: 'dr', step: eStep, reason: 'The firm bears them: Realisation A/c Dr; To Bank A/c.', why: { cr: 'An expense is a debit.', none: 'Expenses the firm bears are a cost of realisation.' } });
  } else if (e.form === 'bornePersonal') {
    items.push({ text: `Realisation expenses of ${inr(e.actual)}, borne and paid by ${x} personally (no remuneration)`, side: 'none', step: eStep, reason: 'The firm neither bears nor pays them: no entry at all.', why: { dr: `They are ${x}'s own affair; the firm does not bear them.`, cr: 'Nothing is received, and the firm does not bear them.' } });
  } else if (e.form === 'borneFirmPays') {
    items.push({
      text: `Realisation expenses of ${inr(e.actual)}, to be borne by ${x} (no remuneration) but paid by the firm`,
      side: 'none',
      step: eStep,
      reason: `They are charged to ${x}: ${x}'s Capital A/c Dr; To Bank A/c. Realisation A/c bears only what the firm bears.`,
      why: { dr: `The firm does not bear them; ${x} does.`, cr: 'Money went out; nothing was realised.' },
    });
  }
  return items.filter((i) => i.step >= 0);
}

const SIDE_TEXT: Record<SideId, string> = { dr: 'Debit side', cr: 'Credit side', none: 'Not in Realisation A/c' };

function sideAsk(rng: Rng): DisAsk {
  const { f, d } = firmFor(rng);
  const item = rng.pick(sideItems(f, d));
  const options: KitChoice[] = (['dr', 'cr', 'none'] as const).map((id) => ({ id, text: SIDE_TEXT[id], why: id === item.side ? undefined : item.why[id] }));
  return {
    kind: 'side',
    prompt: `${f.firm} are dissolving their firm. ${item.text}: where does it go?`,
    firm: f,
    shown: item.step,
    reveal: item.step + 1,
    answer: { type: 'choice', options, correct: item.side },
    reason: item.reason,
  };
}

// ---- The profit or loss on realisation ----------------------------------------------------------------------------

const word = (v: Paise) => (v >= 0 ? 'Profit' : 'Loss');

function resultAsk(rng: Rng): DisAsk {
  const { f, d } = firmFor(rng);
  const res = d.result;
  const variants: [DFirm, string][] = [];
  if (f.provision) variants.push([{ ...f, provision: 0 }, 'Left out the provision for doubtful debts, which is credited to Realisation A/c when the debtors go to its debit at their gross figure.']);
  if (f.liabilities.some((l) => l.fate.kind === 'paid' && l.fate.discount > 0)) {
    variants.push([{ ...f, liabilities: f.liabilities.map((l) => (l.fate.kind === 'paid' ? { ...l, fate: { kind: 'paid', discount: 0 } } : l)) }, 'Missed the discount the creditors allowed: paying less than the book figure is a gain.']);
  }
  if (f.expenses.form === 'firm' || f.expenses.form === 'partnerPays') variants.push([{ ...f, expenses: { ...f.expenses, form: 'bornePersonal' } }, 'Left out the realisation expenses that the firm bears.']);
  if (f.expenses.form === 'feePersonal' || f.expenses.form === 'feeFirmPays') variants.push([{ ...f, expenses: { ...f.expenses, form: 'firm' } }, 'Charged the actual expenses instead of the remuneration agreed: Realisation A/c bears the remuneration.']);
  if (f.assets.some((a) => a.fate.kind === 'silent' && a.intangible)) variants.push([{ ...f, assets: f.assets.map((a) => (a.fate.kind === 'silent' && a.intangible ? { ...a, intangible: false } : a)) }, 'Took the intangible asset as realised at book value: when nothing is said, it fetches nothing.']);
  if (acceptedOf(f) > 0) variants.push([{ ...f, assets: f.assets.map((a) => (a.fate.kind === 'creditors' ? { ...a, fate: { kind: 'sold', amount: a.fate.amount } } : a)) }, 'Credited the asset the creditors accepted as if money came in; it needs no entry, and only the balance paid to them is debited.']);
  const mistakes = mistakesOf(
    Math.abs(res),
    variants.map(([g, why]): [Paise, string] => [Math.abs(dissolve(g).result), why]).filter(([v]) => v !== Math.abs(res)),
  );
  const sheet = [
    `the assets other than cash at bank: ${f.assets.map((a) => `${a.name} ${inr(a.book)}`).join(', ')}`,
    `the outside liabilities: ${f.liabilities.map((l) => `${l.name} ${inr(l.book)}`).join(', ')}${f.provision ? `; provision for doubtful debts ${inr(f.provision)}` : ''}`,
  ];
  const firstAfter = d.steps.findIndex((s) => !['assets', 'liabilities', 'accumulated'].includes(s.kind));
  return {
    kind: 'result',
    prompt: `${f.firm} dissolved their firm on ${f.date}. The books showed ${sheet.join('; ')}. ${eventsOf(f).join(' ')} What is the profit or loss on realisation?`,
    firm: f,
    shown: firstAfter,
    reveal: stepAt(d, 'result') + 1,
    answer: {
      type: 'number',
      value: Math.abs(res),
      mistakes,
      tag: { label: 'Profit or loss?', options: [{ id: 'profit', text: 'Profit', why: 'The debit side is the heavier: it is a loss.' }, { id: 'loss', text: 'Loss', why: 'The credit side is the heavier: it is a profit.' }], correct: res >= 0 ? 'profit' : 'loss' },
    },
    reason: `Debit side: ${inr(d.realisationDebit)}. Credit side: ${inr(d.realisationCredit)}. ${word(res)} on realisation ${inr(Math.abs(res))}.`,
  };
}

// ---- What a partner gets at the end -------------------------------------------------------------------------------

function cashAsk(rng: Rng): DisAsk {
  const { f, d } = firmFor(rng);
  const n = f.partners.length;
  // A partner with the most going on in the capital account.
  const busy = (i: number) => f.assets.filter((a) => a.fate.kind === 'taken' && a.fate.by === i).length + f.liabilities.filter((l) => l.fate.kind === 'taken' && l.fate.by === i).length + (f.expenses.by === i && f.expenses.form !== 'firm' ? 1 : 0);
  const i = [...Array(n).keys()].sort((a, b) => busy(b) - busy(a) || a - b)[rng.int(0, 2) === 0 ? n - 1 : 0];
  const p = f.partners[i];
  const name = p.name;
  const ratioText = f.partners.map((q) => q.ratio).join(':');
  const facts: string[] = [`${name}'s capital: ${inr(p.capital)}.`];
  const share = (amount: Paise) => splitByRatio(amount, f.partners.map((q) => q.ratio))[i];
  if (f.reserve) facts.push(`General Reserve: ${inr(f.reserve)}.`);
  if (f.plCredit) facts.push(`Profit and Loss A/c (credit balance): ${inr(f.plCredit)}.`);
  if (f.plDebit) facts.push(`Profit and Loss A/c (debit balance): ${inr(f.plDebit)}.`);
  for (const a of f.assets) if (a.fate.kind === 'taken' && a.fate.by === i) facts.push(`${name} took over ${a.the} at ${inr(a.fate.amount)}.`);
  for (const l of f.liabilities) if (l.fate.kind === 'taken' && l.fate.by === i) facts.push(`${name} agreed to pay ${l.the}, ${inr(l.book)}, personally.`);
  if (f.unrecordedAsset?.by === i) facts.push(`${name} took over ${withArticle(f.unrecordedAsset.what)}, not in the books, at ${inr(f.unrecordedAsset.amount)}.`);
  if (f.unrecordedLiability?.by === i) facts.push(`${name} paid ${withArticle(f.unrecordedLiability.what)} of ${inr(f.unrecordedLiability.amount)} for the firm.`);
  if (f.expenses.by === i && f.expenses.form !== 'firm') facts.push(expensesText(f));
  facts.push(`Realisation A/c showed a ${d.result >= 0 ? 'profit' : 'loss'} of ${inr(Math.abs(d.result))}.`);
  const final = d.finals[i];
  const credits: [string, Paise][] = [];
  const debits: [string, Paise][] = [];
  for (const r of d.capitals.cr) if (r.amounts[i] && !r.particulars.endsWith('Bank A/c')) credits.push([r.particulars.replace(/^By /, ''), r.amounts[i]]);
  for (const r of d.capitals.dr) if (r.amounts[i] && r.particulars !== 'To Bank A/c') debits.push([r.particulars.replace(/^To /, ''), r.amounts[i]]);
  const shareRes = share(d.result);
  const wrong: [Paise, string][] = [
    [Math.abs(final + 2 * Math.abs(shareRes) * (d.result < 0 ? 1 : -1)), d.result < 0 ? 'Added the share of the loss instead of deducting it.' : 'Deducted the share of the profit instead of adding it.'],
    [Math.abs(final + sum(f.assets.map((a) => (a.fate.kind === 'taken' && a.fate.by === i ? a.fate.amount : 0)))), 'Left out the asset taken over, which is debited to the capital account.'],
    [Math.abs(final - shareRes), `Left out the share of the ${d.result >= 0 ? 'profit' : 'loss'} on realisation.`],
    [Math.abs(final + p.loan), 'Added the loan: it is repaid by itself, out of the bank, before the capitals.'],
  ];
  const tag = { label: 'Paid or brought in?', options: [{ id: 'paid', text: `Paid to ${name}`, why: `The capital account ends in debit: ${name} owes the firm.` }, { id: 'in', text: `Brought in by ${name}`, why: `The capital account ends in credit: the firm owes ${name}.` }], correct: final >= 0 ? 'paid' : 'in' };
  return {
    kind: 'cash',
    prompt: `${f.firm}, sharing profits ${ratioText}, dissolved their firm (capitals fluctuating). ${facts.join(' ')}${p.loan ? ` (${name}'s loan of ${inr(p.loan)} is repaid separately.)` : ''} How much is finally paid to ${name}, or brought in by ${name}, to close the capital account?`,
    firm: f,
    shown: Math.max(stepAt(d, 'liabilities') + 1, stepAt(d, 'accumulated') + 1),
    reveal: d.steps.length,
    answer: { type: 'number', value: Math.abs(final), mistakes: mistakesOf(Math.abs(final), wrong), tag },
    reason: `${name}'s Capital A/c. Credit: ${credits.map(([l, a]) => `${l} ${inr(a)}`).join(', ')}. Debit: ${debits.length ? debits.map(([l, a]) => `${l} ${inr(a)}`).join(', ') : 'nothing'}. Balance: ${inr(Math.abs(final))} ${final >= 0 ? `paid to ${name}` : `brought in by ${name}`}.`,
  };
}

// ---- The entry for the expenses -----------------------------------------------------------------------------------

function expensesAsk(rng: Rng): DisAsk {
  const { f: base } = firmFor(rng);
  const actual = base.expenses.actual;
  const withForm = (form: ExpenseForm): DFirm => ({ ...base, expenses: { form, by: base.expenses.by, actual, fee: form === 'feePersonal' || form === 'feeFirmPays' ? actual + 100000 : 0 } });
  const picked = withForm(rng.pick<ExpenseForm>(['firm', 'partnerPays', 'feePersonal', 'feeFirmPays', 'borneFirmPays', 'bornePersonal']));
  // A form that would leave the books unable to close (the bank overdrawn) keeps the firm's own form.
  const f = dissolve(picked).problem ? base : picked;
  const form = f.expenses.form;
  const fee = f.expenses.fee;
  const d = dissolve(f);
  const x = f.partners[f.expenses.by].name;
  const A = inr(actual);
  const F = inr(fee);
  const all: Record<string, string> = {
    firm: `Realisation A/c Dr ${A}; To Bank A/c ${A}`,
    partnerPays: `Realisation A/c Dr ${A}; To ${x}'s Capital A/c ${A}`,
    feePersonal: `Realisation A/c Dr ${F}; To ${x}'s Capital A/c ${F}`,
    feeFirmPays: `Realisation A/c Dr ${F}; To ${x}'s Capital A/c ${F}; and ${x}'s Capital A/c Dr ${A}; To Bank A/c ${A}`,
    borneFirmPays: `${x}'s Capital A/c Dr ${A}; To Bank A/c ${A}`,
    bornePersonal: 'No entry',
  };
  const why: Record<string, string> = {
    firm: 'This charges the firm and pays from its bank: right only when the firm bears and pays the expenses.',
    partnerPays: `This charges the firm and credits ${x}: right only when the firm bears the expenses and ${x} paid them.`,
    feePersonal: `This gives ${x} the remuneration; it is the whole answer only when ${x} also paid the expenses personally.`,
    feeFirmPays: `This also charges ${x} for expenses the firm paid on ${x}'s behalf.`,
    borneFirmPays:
      form === 'feeFirmPays'
        ? `Only half the answer: ${x} is also owed the remuneration, Realisation A/c Dr; To ${x}'s Capital A/c.`
        : `This charges ${x} for expenses the firm paid; right only when ${x} bears them (with no remuneration) and the firm paid.`,
    bornePersonal: 'Something is owed or paid here, so an entry is needed.',
  };
  // The entries with a remuneration are offered only when the question names one: an entry for "₹0", or for a figure
  // the question never gives, is no choice at all.
  const withFee = form === 'feePersonal' || form === 'feeFirmPays';
  const wrongIds = rng.shuffle(Object.keys(all).filter((k) => k !== form && (withFee || (k !== 'feePersonal' && k !== 'feeFirmPays')))).slice(0, 3);
  const options: KitChoice[] = rng.shuffle([form, ...wrongIds]).map((id) => ({ id, text: all[id], why: id === form ? undefined : why[id] }));
  const at = stepAt(d, 'expenses');
  return {
    kind: 'expenses',
    prompt: `${f.firm} are dissolving their firm. ${expensesText(f)} Which entry does the firm pass?`,
    firm: f,
    shown: at,
    reveal: at + 1,
    answer: { type: 'choice', options, correct: form },
    reason: d.steps[at].text,
  };
}

export function disAsk(kind: DisAskKind, rng: Rng): DisAsk {
  if (kind === 'side') return sideAsk(rng);
  if (kind === 'result') return resultAsk(rng);
  if (kind === 'cash') return cashAsk(rng);
  return expensesAsk(rng);
}

/** The made-up figures of the `n`th question of a kind, from a seed: the screen and the tests draw the same. */
export const askRng = (seed: number, kind: DisAskKind, n: number): Rng => createRng(seed * 1019 + DIS_ASK_KINDS.indexOf(kind) * 139 + n);

