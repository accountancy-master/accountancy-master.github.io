// ---------------------------------------------------------------------------------------------------------------
// "Try it": quick questions on a case, answered at once with the reason. Nothing is recorded. Each question names
// the picture it stands on (`shown`) and what the picture moves on to once it is answered (`reveal`).
// ---------------------------------------------------------------------------------------------------------------

import type { KitAsk, KitChoice } from '@/components/simulator/labs/kit/answers';
import { normalSide, resolveAccount, type Side } from '@/engine/accounts';
import type { Paise } from '@/engine/money';
import { createRng, type Rng } from '@/engine/rng';
import { caseFromSeed, READY_CASES } from './cases';
import { slipsOf } from './marking';
import { buildCase, entryText, errorsWhen, f, sideWord, title, type Case, type CaseData } from './model';
import { beforeWords, classWords, explainError, START, type DeskState } from './walk';

export const TF_ASK_KINDS = ['affects', 'suspense', 'entry', 'balance', 'before'] as const;
export type TfAskKind = (typeof TF_ASK_KINDS)[number];
export const TF_ASK_LABEL: Record<TfAskKind, string> = {
  affects: 'Will it upset the trial balance?',
  suspense: 'Suspense: how much, which side?',
  entry: 'The rectifying entry',
  balance: 'The corrected balance',
  before: 'Found before the trial balance',
};

export interface TfAsk extends KitAsk {
  kind: TfAskKind;
  data: CaseData;
  /** Lines given with the question (the errors found), shown above it. */
  items: string[];
  /** The picture while the question is open, and once it is answered. */
  shown: DeskState;
  reveal: DeskState;
}

export const askRng = (seed: number, kind: TfAskKind, n: number): Rng => createRng(seed * 6007 + TF_ASK_KINDS.indexOf(kind) * 99991 + n * 37 + 5);

const set = (...xs: string[]) => new Set(xs);
const ledgerAt = (focus: string[], extra: Partial<DeskState> = {}): DeskState => ({ ...START, posted: true, checked: true, balanced: true, focus, ...extra });

/** A case to ask on: a ready one now and then, else a month from the seed. */
function caseFor(rng: Rng): Case {
  return buildCase(rng.int(0, 3) === 0 ? rng.pick(READY_CASES) : caseFromSeed(rng.int(1, 999_999)));
}

function shuffled(rng: Rng, options: KitChoice[]): KitChoice[] {
  return rng.shuffle(options);
}

function affects(rng: Rng): TfAsk {
  const c = caseFor(rng);
  const e = rng.pick(c.errors);
  const correct = e.gap === 0 ? 'no' : e.gap > 0 ? 'dr' : 'cr';
  const by = f(Math.abs(e.gap));
  const why = {
    no: e.gap === 0 ? '' : `It leaves the totals unequal: the ${e.gap > 0 ? 'debit' : 'credit'} column comes out ${by} larger.`,
    dr: e.gap > 0 ? '' : e.gap === 0 ? 'The two totals stay equal: this error does not upset the agreement.' : `It is the credit column that comes out ${by} larger.`,
    cr: e.gap < 0 ? '' : e.gap === 0 ? 'The two totals stay equal: this error does not upset the agreement.' : `It is the debit column that comes out ${by} larger.`,
  };
  const options: KitChoice[] = [
    { id: 'dr', text: 'Yes: the debit column comes out larger', ...(why.dr ? { why: why.dr } : {}) },
    { id: 'cr', text: 'Yes: the credit column comes out larger', ...(why.cr ? { why: why.cr } : {}) },
    { id: 'no', text: 'No: the two columns still agree', ...(why.no ? { why: why.no } : {}) },
  ];
  const reason =
    e.gap === 0
      ? `${classWords(e)} ${e.kind === 'complete-omission' ? 'Neither side was posted, so debits still equal credits.' : 'The two wrong amounts cancel in the totals.'} A trial balance that agrees does not prove the books are right.`
      : `${classWords(e)} ${e.when === 'tb' ? `${e.kind === 'tb-wrong-column' ? 'A balance in the wrong column moves the difference by twice its amount' : 'A balance left out shortens its column by its amount'}: the ${e.gap > 0 ? 'debit' : 'credit'} column is ${by} larger.` : `Only one account is wrong, so the ${e.gap > 0 ? 'debit' : 'credit'} column comes out ${by} larger.`}`;
  return {
    kind: 'affects',
    data: c.data,
    items: [],
    prompt: `${c.data.business}: ${e.text} Taken alone, what does this error do to the trial balance?`,
    answer: { type: 'choice', options: shuffled(rng, options), correct },
    reason,
    shown: e.when === 'tb' ? ledgerAt([], { tb: 'draft' }) : ledgerAt(e.accounts.slice(0, 2)),
    reveal: e.when === 'tb' ? ledgerAt([], { tb: 'checked', revealed: set(e.letter) }) : ledgerAt(e.accounts.slice(0, 2), { revealed: set(e.letter) }),
  };
}

function suspense(rng: Rng): TfAsk {
  const c = caseFor(rng);
  const after = errorsWhen(c, 'after');
  const s = c.suspense;
  const tag = {
    label: 'In which column?',
    options: [
      { id: 'Dr', text: 'Debit column', why: 'The debit column was the larger one; Suspense A/c goes in the column that is short, the credit column.' },
      { id: 'Cr', text: 'Credit column', why: 'The credit column was the larger one; Suspense A/c goes in the column that is short, the debit column.' },
    ],
    correct: s.side,
  };
  const absSum = after.reduce((t, e) => t + Math.abs(e.gap), 0);
  const halfSide = Math.abs(after.reduce((t, e) => t + (e.kind === 'wrong-side' ? e.gap / 2 : e.gap), 0));
  const withTwo = absSum + after.filter((e) => !e.oneSided).reduce((t, e) => t + Math.abs(e.delta[0]?.[1] ?? 0), 0);
  const mistakes: { value: Paise; why: string }[] = [];
  const addM = (value: number, why: string) => {
    if (value > 0 && value !== s.amount && !mistakes.some((m) => m.value === value)) mistakes.push({ value, why });
  };
  addM(absSum, 'Added every difference as if all made the same column larger: an error that makes the other column larger takes away from the difference.');
  addM(halfSide, 'Counted a posting on the wrong side once: it moves the difference by twice its amount.');
  addM(withTwo, 'Counted the errors that left the two columns equal: they are not in Suspense A/c.');
  const working = after.map((e) => (e.gap === 0 ? `${e.tag} nil` : `${e.tag} ${e.gap > 0 ? 'debit' : 'credit'} column +${f(Math.abs(e.gap))}`)).join('; ');
  return {
    kind: 'suspense',
    data: c.data,
    items: after.map((e) => `${e.tag} ${e.text}`),
    prompt: `The trial balance of ${c.data.business} did not agree, and the difference was put to Suspense A/c. Later these errors were found, and they explain the whole difference. How much was put to Suspense A/c, and in which column?`,
    answer: { type: 'number', value: s.amount, mistakes, tag },
    reason: `Each error's effect on the columns: ${working}. Net: the ${s.side === 'Dr' ? 'credit' : 'debit'} column was ${f(s.amount)} larger, so Suspense A/c ${f(s.amount)} went in the ${sideWord(s.side)} column.`,
    shown: { ...START, posted: true, checked: true, balanced: true, tb: 'checked', focus: [] },
    reveal: { ...START, posted: true, checked: true, balanced: true, tb: 'checked', suspense: true, focus: ['suspense'] },
  };
}

function entry(rng: Rng): TfAsk {
  const c = caseFor(rng);
  const e = rng.pick(errorsWhen(c, 'after'));
  const slips = slipsOf(c, e);
  const options: KitChoice[] = shuffled(rng, [{ id: 'right', text: entryText(e.entry!) }, ...slips.map((s, i) => ({ id: `slip${i}`, text: entryText(s.lines), why: s.why }))]);
  const focus = e.oneSided ? [e.accounts[0], 'suspense'] : e.accounts.slice(0, 2);
  return {
    kind: 'entry',
    data: c.data,
    items: [],
    prompt: `${c.data.business}: the trial balance did not agree, and the difference was put to Suspense A/c. Then this error is found: ${e.text} Which entry rectifies it?`,
    answer: { type: 'choice', options, correct: 'right' },
    reason: explainError(c, e),
    shown: ledgerAt(focus, { tb: 'checked', suspense: true }),
    reveal: ledgerAt(focus, { tb: 'checked', suspense: true, revealed: set(e.letter), rectified: set(e.letter), entries: set(e.letter) }),
  };
}

function balance(rng: Rng): TfAsk {
  // An account that no other error of its case touches, so that its balance in the trial balance is the true one
  // with this error alone in it.
  for (let go = 0; go < 30; go++) {
    const c = caseFor(rng);
    const cands = errorsWhen(c, 'after').flatMap((e) =>
      e.delta
        .filter(([id]) => c.errors.filter((x) => x.accounts.includes(id)).length === 1 && id !== 'stock')
        .map(([id, v]) => ({ e, id, v })),
    );
    if (!cands.length) continue;
    const { e, id, v } = rng.pick(cands);
    const truth = c.trueNet.get(id) ?? 0;
    const shown = truth + v;
    const normal = normalSide(resolveAccount(id));
    const sideOf = (n: number): Side => (n > 0 ? 'Dr' : 'Cr');
    if (truth === 0 || shown === 0 || sideOf(truth) !== normal || sideOf(shown) !== normal) continue;
    const mistakes: { value: Paise; why: string }[] = [];
    const addM = (value: number, why: string) => {
      const a = Math.abs(value);
      if (a > 0 && a !== Math.abs(truth) && !mistakes.some((m) => m.value === a)) mistakes.push({ value: a, why });
    };
    addM(shown + v, 'Moved the balance the wrong way: the rectification undoes what the error did.');
    if (e.kind === 'wrong-side') addM(shown - v / 2, 'Put right half: a posting on the wrong side moves the balance by twice its amount.');
    addM(shown, 'Left the balance as it was: the rectifying entry is posted to this account.');
    // Why the balance stands on its side, said only of the wrong choice.
    const a = resolveAccount(id);
    const nature = a.contra && a.type === 'capital' ? 'drawings, which reduce capital, do' : a.type === 'asset' ? 'an asset does' : a.type === 'expense' ? 'an expense does' : a.type === 'income' ? 'an income does' : a.type === 'liability' ? 'a liability does' : 'capital does';
    const tag = {
      label: 'A debit or a credit balance?',
      options: [
        { id: 'Dr', text: 'Debit balance', why: `${title(id)} has a credit balance, as ${nature}.` },
        { id: 'Cr', text: 'Credit balance', why: `${title(id)} has a debit balance, as ${nature}.` },
      ],
      correct: normal,
    };
    const fix = e.entry!.find((l) => l.accountId === id)!;
    return {
      kind: 'balance',
      data: c.data,
      items: [],
      prompt: `${c.data.business}: ${title(id)} stands in the trial balance at ${f(Math.abs(shown))} (${sideWord(normal)}). Then this error is found: ${e.text} What is the corrected balance of ${title(id)}?`,
      answer: { type: 'number', value: Math.abs(truth), mistakes, tag },
      reason: `The rectifying entry is ${entryText(e.entry!)}: ${title(id)} is ${fix.side === 'Dr' ? 'debited' : 'credited'} ${f(fix.amount)}. ${f(Math.abs(shown))} ${fix.side === normal ? '+' : '−'} ${f(fix.amount)} = ${f(Math.abs(truth))}, a ${sideWord(normal)} balance.`,
      shown: ledgerAt([id], { tb: 'checked', suspense: true }),
      reveal: ledgerAt([id, ...(e.oneSided ? ['suspense'] : [])], { tb: 'checked', suspense: true, revealed: set(e.letter), rectified: set(e.letter), entries: set(e.letter) }),
    };
  }
  return entry(rng);
}

function before(rng: Rng): TfAsk {
  const c = caseFor(rng);
  const e = rng.pick(c.errors.filter((x) => x.when !== 'tb'));
  const lines = e.entry!;
  const main = e.oneSided ? lines.find((l) => l.accountId !== 'suspense')! : lines[0];
  const other = 'line' in e.spec ? c.data.txns[e.spec.txn].lines[1 - e.spec.line].accountId : null;
  const inAccount = `Correct ${title(main.accountId)} itself (${main.side === 'Dr' ? 'debit' : 'credit'} it with ${f(main.amount)}), with no journal entry`;
  const throughSuspense = e.oneSided ? entryText(lines) : entryText([{ ...main }, { accountId: 'suspense', side: main.side === 'Dr' ? 'Cr' : 'Dr', amount: main.amount }]);
  const spec = e.spec;
  const options: KitChoice[] = spec.kind === 'compensating'
    ? [
        { id: 'right', text: `Add up the ${sideWord(spec.a.side)} side of ${title(spec.a.accountId)} and the ${sideWord(spec.b.side)} side of ${title(spec.b.accountId)} again, and correct each account itself, with no journal entry` },
        { id: 'one', text: inAccount, why: 'Both accounts were added up wrongly: correcting one of them alone would leave the other wrong and upset the trial balance.' },
        { id: 'suspense', text: `Pass ${throughSuspense}`, why: 'There is no Suspense A/c before the trial balance, and the two slips together made no difference to put in one.' },
        { id: 'leave', text: 'Nothing: the trial balance will agree anyway', why: 'Agreement does not make the books right: both accounts would stay wrong.' },
      ]
    : e.oneSided
    ? [
        { id: 'right', text: inAccount },
        { id: 'suspense', text: `Pass ${throughSuspense}`, why: 'Before the trial balance there is no Suspense A/c: nothing has been put to it yet.' },
        ...(other && other !== main.accountId
          ? [{ id: 'other', text: `Pass ${entryText([{ ...main }, { accountId: other, side: main.side === 'Dr' ? ('Cr' as const) : ('Dr' as const), amount: main.amount }])}`, why: `${title(other)} was right already: only one account is wrong.` }]
          : []),
        { id: 'leave', text: 'Leave it for Suspense A/c to take', why: 'Suspense A/c is only for a difference whose cause cannot be found at once; this error is found, so it is put right.' },
      ]
    : [
        { id: 'right', text: `Pass ${entryText(lines)}` },
        { id: 'one', text: `${inAccount}`, why: 'Two accounts are wrong: correcting one of them alone would leave the other wrong and upset the trial balance.' },
        { id: 'suspense', text: `Pass ${throughSuspense}`, why: 'There is no Suspense A/c before the trial balance, and this error made no difference to put in one.' },
        { id: 'leave', text: 'Nothing: the trial balance will agree anyway', why: 'Agreement does not make the books right: the accounts would stay wrong.' },
      ];
  return {
    kind: 'before',
    data: c.data,
    items: [],
    prompt: `${c.data.business}: ${e.text} The error is found before the trial balance is drawn up. How is it put right?`,
    answer: { type: 'choice', options: shuffled(rng, options), correct: 'right' },
    reason: beforeWords(e),
    shown: { ...START, posted: true, checked: true, focus: e.accounts.slice(0, 2) },
    reveal: { ...START, posted: true, checked: true, revealed: set(e.letter), focus: e.accounts.slice(0, 2) },
  };
}

const MAKERS: Record<TfAskKind, (rng: Rng) => TfAsk> = { affects, suspense, entry, balance, before };

export function tfAsk(kind: TfAskKind, rng: Rng): TfAsk {
  return MAKERS[kind](rng);
}

