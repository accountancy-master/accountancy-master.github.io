import type { AccountQuestion, JournalQuestion, McqQuestion } from '@/content/types';
import { loanToPartner, partnerCapital, partnerCurrent, partnerLoan } from '@/engine/accounts';
import { accountOf, balanceOf, columnarAccount, ledgerLabel, post, type DatedEntry } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import {
  assertionReasonFacts,
  factsTemplate,
  accountTemplate, columnarSides, formatINR, journalSetTemplate, journalTemplate, keepFor, ledgerSides, mcqTemplate, numericTemplate, partnerColumns, rupees,
  setHolds,
} from '../authoring';
import type { AccountParts, FormatRowParts, McqParts, NumericParts, SetTransaction, Template } from '../types';

const T = 'dissolution-of-partnership';

// ---------------------------------------------------------------------------------------------------------------
// Conventions used throughout (CBSE Class 12, 2025-26), and stated in the prompts that rely on them:
//  - on dissolution every asset except cash and bank, fictitious assets and a loan to a partner goes to the debit of
//    Realisation A/c at its gross book value; every outside liability, and every provision against an asset, goes to
//    its credit. Reserves and accumulated profits or losses go to the capital accounts in the profit-sharing ratio;
//  - a partner's own loan is never passed through Realisation A/c: it is repaid after the outside liabilities and
//    before the capitals. A loan from a partner's relative is an outside liability;
//  - an asset about which nothing is said realises its book value if tangible and nothing if intangible;
//  - the prompt always says who pays the realisation expenses and who bears them;
//  - no partner is insolvent: a partner whose capital account ends with a debit balance brings the amount in;
//  - capitals are fluctuating; every figure is in whole rupees, and a share that would not be is avoided.
// ---------------------------------------------------------------------------------------------------------------

const C = {
  meaning: 'dis-meaning',
  settlement: 'dis-settlement',
  realisation: 'dis-realisation',
  takenOver: 'dis-taken-over',
  unrecorded: 'dis-unrecorded',
  expenses: 'dis-expenses',
  loans: 'dis-loans',
  closing: 'dis-closing',
} as const;

const REAL = 'realisation';

/** Whole rupees as the amount text a learner sees. */
const inr = (n: number): string => formatINR(rupees(n));
const dr = (accountId: string, n: number): JournalLine => ({ accountId, side: 'Dr', amount: rupees(n) });
const cr = (accountId: string, n: number): JournalLine => ({ accountId, side: 'Cr', amount: rupees(n) });
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
/** A balance sheet label inside a sentence: only its first letter is lowered, so a name in it keeps its capital. */
const low = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);
const list = (xs: readonly string[]): string => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const total = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0);
const ROMAN = ['(i)', '(ii)', '(iii)', '(iv)', '(v)', '(vi)', '(vii)', '(viii)', '(ix)'];

const amountsIn = (s: string): number[] => (s.match(/₹\d[\d,]*/g) ?? []).map((x) => Number(x.slice(1).replace(/,/g, '')));
/** The "Label: ₹amount" lines of a prompt, in order. */
const figuresIn = (prompt: string): [string, number][] =>
  prompt.split('\n').flatMap((l): [string, number][] => {
    const m = /^(.+): ₹([\d,]+)$/.exec(l.trim());
    return m ? [[m[1], Number(m[2].replace(/,/g, ''))]] : [];
  });
const optionText = (q: McqQuestion): string => q.options.find((o) => o.id === q.correct)?.text ?? '';
const hasLine = (q: JournalQuestion, accountId: string, side: 'Dr' | 'Cr', n: number): boolean =>
  q.expected.some((l) => l.accountId === accountId && l.side === side && l.amount === rupees(n));

// ---------------------------------------------------------------------------------------------------------------
// The firm: two or three partners with Indian names and a profit-sharing ratio in lowest terms.
// ---------------------------------------------------------------------------------------------------------------

const NAMES = [
  'Asha', 'Bharat', 'Chitra', 'Dev', 'Esha', 'Farhan', 'Gauri', 'Harish', 'Ishaan', 'Jaya', 'Kabir', 'Leela', 'Manoj', 'Nisha', 'Omkar', 'Pooja',
  'Rohan', 'Sana', 'Tarun', 'Uma', 'Vikram', 'Zoya',
];
/** People who are not partners: relatives who have lent the firm money. */
const RELATIVES: { rel: string; names: string[] }[] = [
  { rel: 'spouse', names: ['Kiran', 'Suman', 'Shashi'] },
  { rel: 'brother', names: ['Suresh', 'Prakash', 'Naveen'] },
  { rel: 'sister', names: ['Meena', 'Anjali', 'Kavita'] },
  { rel: 'father', names: ['Ramesh', 'Mohan Lal', 'Satish'] },
  { rel: 'mother', names: ['Sarla', 'Kamala', 'Shanti'] },
];
const RATIOS2 = [[3, 2], [2, 1], [3, 1], [5, 3], [4, 1], [1, 1], [7, 3], [5, 2]];
const RATIOS3 = [[5, 3, 2], [3, 2, 1], [2, 2, 1], [4, 3, 3], [2, 1, 1], [3, 3, 2], [1, 1, 1], [4, 3, 1], [5, 4, 1], [3, 1, 1]];
const DATES = ['31 March 2026', '31 March 2025', '30 June 2025', '30 September 2025', '31 December 2025'];
const FLUCTUATING = "The partners' capitals were fluctuating.";

interface Firm {
  names: string[];
  ratio: number[];
  /** The sum of the terms of the ratio. */
  sum: number;
  date: string;
  /** Who the partners are, how they share and when the firm was dissolved. */
  intro: string;
}

function firm(rng: Rng, opts: { size?: 2 | 3; unequal?: boolean } = {}): Firm {
  const size = opts.size ?? rng.pick([2, 2, 3]);
  const names = rng.shuffle(NAMES).slice(0, size);
  const ratio = rng.pick((size === 2 ? RATIOS2 : RATIOS3).filter((r) => !opts.unequal || new Set(r).size > 1));
  const sharing = ratio.every((x) => x === ratio[0]) ? 'equally' : `in the ratio of ${ratio.join(':')}`;
  const date = rng.pick(DATES);
  const who = list(names);
  const intro = rng.pick([
    `${who} were partners in a firm sharing profits and losses ${sharing}. The firm was dissolved on ${date}.`,
    `${who} shared the profits and losses of their firm ${sharing}. They dissolved the firm on ${date}.`,
    `The firm of ${who}, who shared profits and losses ${sharing}, was dissolved on ${date}.`,
  ]);
  return { names, ratio, sum: total(ratio), date, intro };
}
const shareOf = (f: Firm, amount: number, i: number): number => (amount * f.ratio[i]) / f.sum;
/** "5/10" for a partner's share, as the working shows it. */
const fraction = (f: Firm, i: number): string => `${f.ratio[i]}/${f.sum}`;
const relative = (rng: Rng, of: string): { name: string; as: string } => {
  const r = rng.pick(RELATIVES);
  const name = rng.pick(r.names);
  return { name, as: `${name}, ${of}'s ${r.rel}` };
};

/** The partners a prompt names, read back for `verify`. */
function namesIn(prompt: string): string[] {
  const m = /((?:[A-Z][a-z]+, )*[A-Z][a-z]+ and [A-Z][a-z]+)(?: were partners| shared the profits|, who shared)/.exec(prompt);
  return m ? m[1].split(/, | and /) : [];
}
/** The profit-sharing ratio a prompt states, read back for `verify`: its terms, or equal terms for "equally". */
function ratioIn(prompt: string): number[] {
  const m = /in the ratio of (\d+(?::\d+)+)/.exec(prompt);
  return m ? m[1].split(':').map(Number) : namesIn(prompt).map(() => 1);
}
/** A partner's share of an amount, from the names and the ratio the prompt states. */
function shareIn(prompt: string, name: string, amount: number): number {
  const ratio = ratioIn(prompt);
  return (amount * ratio[namesIn(prompt).indexOf(name)]) / total(ratio);
}

// ---------------------------------------------------------------------------------------------------------------
// What a firm owns and owes.
// ---------------------------------------------------------------------------------------------------------------

interface Thing {
  id: string;
  /** As a balance sheet names it: "Stock". */
  name: string;
  /** As a sentence names it: "the stock". */
  the: string;
  plural?: true;
}
const TANGIBLE: Thing[] = [
  { id: 'stock', name: 'Stock', the: 'the stock' },
  { id: 'machinery', name: 'Machinery', the: 'the machinery' },
  { id: 'furniture', name: 'Furniture', the: 'the furniture' },
  { id: 'building', name: 'Building', the: 'the building' },
  { id: 'land', name: 'Land', the: 'the land' },
  { id: 'vehicles', name: 'Vehicles', the: 'the vehicles', plural: true },
  { id: 'computers', name: 'Computers', the: 'the computers', plural: true },
];
const INVESTMENTS: Thing = { id: 'investments', name: 'Investments', the: 'the investments', plural: true };
const INTANGIBLE: Thing[] = [
  { id: 'goodwill', name: 'Goodwill', the: 'the goodwill' },
  { id: 'patents', name: 'Patents', the: 'the patents', plural: true },
];
const LIABILITIES: Thing[] = [
  { id: 'creditors', name: 'Creditors', the: 'the creditors', plural: true },
  { id: 'billsPayable', name: 'Bills payable', the: 'the bills payable', plural: true },
  { id: 'bankLoan', name: 'Bank loan', the: 'the bank loan' },
  { id: 'outstandingExpenses', name: 'Outstanding expenses', the: 'the outstanding expenses', plural: true },
];
const was = (t: Thing): string => (t.plural ? 'were' : 'was');

/** A numeric question's answer and errors, in rupees. Null when the answer is not positive or fewer than two distinct errors remain. */
function numeric(answer: number, errs: [number, string][]): Pick<NumericParts, 'answer' | 'commonErrors'> | null {
  if (!Number.isInteger(answer) || answer <= 0) return null;
  const seen = new Set([answer]);
  const commonErrors: { value: number; why: string }[] = [];
  for (const [v, why] of errs) {
    if (Number.isInteger(v) && v > 0 && !seen.has(v) && seen.add(v)) commonErrors.push({ value: rupees(v), why });
  }
  return commonErrors.length >= 2 ? { answer: rupees(answer), commonErrors } : null;
}

/** A multiple-choice question; null when fewer than three distinct wrong options remain. */
function choice(prompt: string, correct: string, wrong: [string, string][], explanation: string, hints?: string[]): McqParts | null {
  const seen = new Set([correct]);
  const distractors: { text: string; why: string }[] = [];
  for (const [text, why] of wrong) if (!seen.has(text) && seen.add(text)) distractors.push({ text, why });
  if (distractors.length < 3) return null;
  return { prompt, correct, distractors, explanation, ...(hints ? { hints } : {}) };
}

const profitOrLoss = (x: number): string => (x > 0 ? `Profit of ${inr(x)}` : x < 0 ? `Loss of ${inr(-x)}` : 'No profit and no loss');

const H = {
  realisation: [
    'Realisation A/c is debited with the assets at book value and with everything paid out; it is credited with the liabilities and with everything the assets fetch.',
    'A heavier credit side is a profit, a heavier debit side a loss; either is shared in the profit-sharing ratio.',
  ],
  entry: [
    'The asset and liability accounts are already closed: they went to Realisation A/c. Ask what comes in or goes out now.',
    'Money or value received for an asset: credit Realisation A/c. Money or value given for a liability or an expense: debit Realisation A/c.',
  ],
  expenses: [
    'Two questions decide it: who has to bear the expenses, and whose money actually paid them?',
    'Realisation A/c is debited only with what the firm bears: the expenses themselves, or the remuneration agreed in place of them.',
  ],
  loans: [
    'Who lent the money: a partner, a relative of a partner, or the firm itself?',
    "Only an outsider's loan goes through Realisation A/c. A partner's own loan is repaid by itself; a loan to a partner is set off against that partner's capital.",
  ],
  closing: [
    "Write the partner's capital account: credit the balance, reserves, a profit on realisation and anything the firm owes the partner; debit losses and anything the partner took over.",
    'A credit balance is paid to the partner; a debit balance is brought in by the partner.',
  ],
  order: [
    'Section 48: outsiders first, then partners as lenders, then partners as owners.',
    "Outside debts, then partners' loans, then capitals, then the surplus in the profit-sharing ratio.",
  ],
};

// ===============================================================================================================
// EASY
// ===============================================================================================================

const kindOfDissolution = mcqTemplate({
  id: 'dis-kind', topicId: T, conceptId: C.meaning, difficulty: 'easy',
  generate: (rng) => {
    const [a, b, c, d] = rng.shuffle(NAMES);
    const trio = `${a}, ${b} and ${c}`;
    const s = rng.pick<{ firm: boolean; text: string }>([
      { firm: false, text: `${trio} are partners. ${c} retires, and ${a} and ${b} carry on the business under a new agreement.` },
      { firm: false, text: `${a} and ${b} are partners. They admit ${d} as a partner for a one-fourth share, and the business goes on as before.` },
      { firm: false, text: `${trio} are partners. ${c} dies and, as their deed provides, ${a} and ${b} continue the business.` },
      { firm: false, text: `${a} and ${b}, who shared profits 3:2, agree to share them equally from now on and carry on the same business.` },
      { firm: false, text: `${trio} formed a partnership for five years. When the five years end, they agree to continue the same business together.` },
      { firm: true, text: `${trio} are partners. All three agree to close the business down, sell its assets and settle with one another.` },
      { firm: true, text: `${a} and ${b} are partners in a trade that a new law has made unlawful, so the business has to stop.` },
      { firm: true, text: `${trio} are partners. On a suit filed by ${a}, the court orders the business to be wound up because it can only be run at a loss.` },
      { firm: true, text: `${a} and ${b} run a partnership at will. ${a} gives ${b} notice in writing that the business is to be closed and the accounts settled.` },
      { firm: true, text: `${trio} became partners only to build one flyover. The flyover is finished, the business is closed and its assets are sold.` },
    ]);
    const ofPartnership = 'Dissolution of the partnership only: the firm goes on under a changed agreement';
    const ofFirm = 'Dissolution of the firm: the business is closed, the assets are realised and the accounts are settled';
    return choice(
      `${s.text} What does this bring about?`,
      s.firm ? ofFirm : ofPartnership,
      [
        s.firm
          ? [ofPartnership, 'Treated the end of the business as a mere change in the agreement; here the business itself stops and the books are closed.']
          : [ofFirm, 'Took a change among the partners for the end of the firm; here the business goes on, so only the old agreement ends.'],
        [
          'Neither: the old agreement and the firm both continue unchanged',
          s.firm ? 'Missed that the business has come to an end, which ends the agreement as well.' : 'Missed that the relation among the partners has changed, which ends the old agreement.',
        ],
        ['Dissolution of the firm, while the partnership among the partners continues', 'Turned the rule round: a firm cannot be dissolved without the partnership ending too.'],
      ],
      s.firm
        ? 'The business itself comes to an end, so the firm is dissolved: assets are realised, liabilities paid and the accounts of the partners settled. The partnership ends with it.'
        : 'The business goes on and only the relation among the partners changes. That is a dissolution of the partnership (a reconstitution of the firm), not of the firm.',
      ['Does the business stop, or does it go on with a changed agreement?', 'Dissolution of the firm always ends the partnership; dissolution of the partnership need not end the firm.'],
    );
  },
  verify: (q) => /carry on|goes on|continue/.test(q.prompt) === optionText(q).startsWith('Dissolution of the partnership only'),
});

const MODES = {
  agreement: 'Dissolution by agreement',
  compulsory: 'Compulsory dissolution',
  event: 'Dissolution on the happening of an event',
  notice: 'Dissolution by notice',
  court: 'Dissolution by the court',
} as const;
type Mode = keyof typeof MODES;
const MODE_WHY: Record<Mode, string> = {
  agreement: 'Took this as dissolution by agreement, which needs all the partners to consent to closing the firm.',
  compulsory: 'Took this as compulsory dissolution, which happens by force of law: when the business of the firm becomes unlawful, or when all the partners, or all but one, become insolvent.',
  event: 'Took this as dissolution on an event, which covers the end of a fixed term, the completion of the venture and the death of a partner.',
  notice: 'Took this as dissolution by notice, which needs a partnership at will and a written notice from a partner.',
  court: 'Took this as dissolution by the court, which needs a suit by a partner and an order of the court.',
};
/** What marks each mode in the wording of a situation, for `verify`. */
const MODE_SIGN: Record<Mode, RegExp> = {
  agreement: /all (?:the|three) partners/i,
  compulsory: /unlawful/,
  event: /fixed term|only to|dies/,
  notice: /partnership at will/,
  court: /court/,
};

const modeOfDissolution = mcqTemplate({
  id: 'dis-mode', topicId: T, conceptId: C.meaning, difficulty: 'easy',
  generate: (rng) => {
    const [a, b, c] = rng.shuffle(NAMES);
    const firmOf = `the firm of ${a}, ${b} and ${c}`;
    const s = rng.pick<{ mode: Mode; text: string; because: string }>([
      { mode: 'agreement', text: `At a meeting, all the partners of ${firmOf} consent to closing the firm down.`, because: 'All the partners consent, so the firm is dissolved by agreement.' },
      { mode: 'agreement', text: `${cap(firmOf)} is doing well, yet all three partners decide together that they would rather wind it up.`, because: 'The partners decide it together: a dissolution by agreement.' },
      { mode: 'compulsory', text: `${cap(firmOf)} deals in a product whose sale a new law has made unlawful.`, because: 'When the business becomes unlawful the firm is dissolved compulsorily, whatever the partners wish.' },
      { mode: 'compulsory', text: `${cap(firmOf)} exports to one country only, and trade with that country has been declared unlawful.`, because: 'A business that has become unlawful cannot be carried on: the dissolution is compulsory.' },
      { mode: 'event', text: `${cap(firmOf)} was formed for a fixed term of seven years, the term has ended and the deed says nothing more.`, because: 'Unless the partners have agreed otherwise, a firm formed for a fixed term is dissolved when the term expires: an event.' },
      { mode: 'event', text: `${a}, ${b} and ${c} became partners only to construct one bridge, and the bridge is now complete.`, because: 'Unless the partners have agreed otherwise, a firm formed for one venture is dissolved when the venture is completed: an event.' },
      { mode: 'event', text: `${c}, a partner in ${firmOf}, dies. The deed has no clause about what happens then.`, because: 'Unless the partners have agreed otherwise, the death of a partner dissolves the firm: an event.' },
      { mode: 'notice', text: `${cap(firmOf)} is a partnership at will. ${a} sends ${b} and ${c} a letter stating the intention to dissolve the firm.`, because: 'In a partnership at will any partner may dissolve the firm by giving the others notice in writing.' },
      { mode: 'court', text: `${c}, a partner in ${firmOf}, has become of unsound mind. ${a} files a suit and the court orders the firm to be dissolved.`, because: 'On the suit of a partner the court may dissolve a firm when a partner has become of unsound mind.' },
      { mode: 'court', text: `${c} keeps breaking the partnership agreement of ${firmOf}. ${b} files a suit and the court orders the firm to be dissolved.`, because: 'Persistent breach of the agreement by a partner is a ground on which the court may dissolve the firm.' },
      { mode: 'court', text: `${cap(firmOf)} can be carried on only at a loss. ${a} goes to court, which orders the firm to be dissolved.`, because: 'A business that can be carried on only at a loss is a ground on which the court may dissolve the firm.' },
      { mode: 'court', text: `${c} has transferred the whole of ${c}'s interest in ${firmOf} to an outsider. On a suit by ${a}, the court orders the firm to be dissolved.`, because: 'Transfer of a partner\'s whole interest to a third party is a ground on which the court may dissolve the firm.' },
    ]);
    const wrong = (Object.keys(MODES) as Mode[]).filter((m) => m !== s.mode).map((m): [string, string] => [MODES[m], MODE_WHY[m]]);
    return choice(`${s.text} Which mode of dissolution of the firm is this?`, MODES[s.mode], rng.shuffle(wrong), s.because, [
      'Who or what brings the firm to an end here: the partners together, the law, an event, one partner, or a court?',
      'By agreement (all consent); compulsory (by force of law, as when the business becomes unlawful); on an event (term over, venture complete, death); by notice (partnership at will); by the court (on a suit).',
    ]);
  },
  verify: (q) => {
    const mode = (Object.keys(MODES) as Mode[]).find((m) => MODES[m] === optionText(q));
    // The court's order decides the mode even when the ground (a loss, a breach) is named too.
    const signs = (Object.keys(MODES) as Mode[]).filter((m) => MODE_SIGN[m].test(q.prompt));
    return mode !== undefined && (signs.includes('court') ? mode === 'court' : signs.length === 1 && signs[0] === mode);
  },
});

const orderOfPayment = mcqTemplate({
  id: 'dis-order', topicId: T, conceptId: C.settlement, difficulty: 'easy',
  generate: (rng) => {
    const f = firm(rng, { size: 2 });
    const [a, b] = f.names;
    const creditors = rng.step(40000, 200000, 10000);
    const loan = rng.step(20000, 100000, 10000);
    const ca = rng.step(100000, 400000, 50000);
    const cb = rng.step(100000, 400000, 50000);
    const surplus = rng.step(10000, 60000, 5000);
    const cash = creditors + loan + ca + cb + surplus;
    const k = rng.int(0, 3);
    // The stem names the place only: saying what has already been paid would give the order of the other claims away.
    const when = ['first of all', 'second', 'third', 'last of all'][k];
    const options: [string, string][] = [
      [`The ${inr(creditors)} owed to the creditors`, 'Placed the outside creditors here; debts due to outsiders are paid first of all, before any partner receives anything.'],
      [`${a}'s loan of ${inr(loan)}`, "Placed the partner's loan here; it is repaid second, after the outside debts and before the capitals."],
      [`The capitals of ${a} and ${b}, ${inr(ca + cb)} in all`, "Placed the capitals here; capital is returned third, only after the outside debts and the partners' loans."],
      [`The surplus of ${inr(surplus)}, shared in the profit-sharing ratio`, 'Placed the surplus here; it is whatever is left at the very end, after the capitals have been returned.'],
    ];
    return choice(
      `${f.intro} After all the assets were realised the firm had ${inr(cash)} in the bank. It owed ${inr(creditors)} to creditors and ${inr(loan)} to ${a} for a loan ${a} had given the firm; the capitals were ${a} ${inr(ca)} and ${b} ${inr(cb)}. Under section 48 of the Indian Partnership Act, 1932, which of the following is paid ${when}?`,
      options[k][0],
      options.filter((_, i) => i !== k),
      `Section 48: (1) debts due to outsiders, ${inr(creditors)}; (2) loans from partners, ${inr(loan)}; (3) capitals, ${inr(ca + cb)}; (4) the surplus, ${inr(cash)} - ${inr(creditors + loan + ca + cb)} = ${inr(surplus)}, in the profit-sharing ratio.`,
      H.order,
    );
  },
  verify: (q) => {
    const [cash, creditors, loan, ca, cb] = amountsIn(q.prompt);
    const k = ['first of all', 'second', 'third', 'last of all'].findIndex((w) => q.prompt.includes(`following is paid ${w}?`));
    const want = [creditors, loan, ca + cb, cash - creditors - loan - ca - cb][k];
    return want > 0 && amountsIn(optionText(q))[0] === want;
  },
});

/** Balances that go to the debit of Realisation A/c, to its credit, and those that never go there, each with why. */
const TO_DEBIT: [string, string][] = [
  ['Stock', 'Stock is an asset to be sold, so it is transferred, to the debit side.'],
  ['Debtors', 'Debtors are an asset to be collected, so they are transferred, to the debit side, at their gross figure.'],
  ['Machinery', 'Machinery is an asset to be sold, so it is transferred, to the debit side.'],
  ['Goodwill shown in the books', 'Goodwill in the books is an asset and is transferred to the debit side, even if it then fetches nothing.'],
  ['Investments', 'Investments are an asset to be sold, so they are transferred, to the debit side.'],
  ['Bills receivable', 'Bills receivable are an asset to be collected, so they are transferred, to the debit side.'],
  ['Prepaid insurance', 'A prepaid expense is an asset, so it is transferred to the debit side with the others.'],
];
const TO_CREDIT: [string, string][] = [
  ['Creditors', 'Creditors are an outside liability, so they are transferred, to the credit side.'],
  ['Bills payable', 'Bills payable are an outside liability, so they are transferred, to the credit side.'],
  ['Bank loan', 'A bank loan is an outside liability, so it is transferred, to the credit side.'],
  ['Outstanding salaries', 'An outstanding expense is owed to outsiders, so it is transferred, to the credit side.'],
  ['Provision for doubtful debts', 'A provision against an asset is transferred to the credit side, while the debtors go to the debit side at their gross figure.'],
  ["Loan from a partner's spouse", "A loan from a partner's relative is owed to an outsider, so it is transferred, to the credit side."],
  ["Employees' Provident Fund", 'The provident fund is owed to the employees, who are outsiders, so it is transferred, to the credit side.'],
];
const NOT_ASSET: [string, string][] = [
  ['Cash in hand', 'Sent cash to Realisation A/c; cash is already money, so it stays in its own account.'],
  ['Balance at bank', 'Sent the bank balance to Realisation A/c; it is already money, so it stays in Bank A/c.'],
  ['Profit and Loss A/c (debit balance)', "Took a past loss for an asset that can be sold; it is written off to the partners' capital accounts in the profit-sharing ratio."],
  ['Advertisement Suspense A/c', "Took a fictitious asset for something that can be sold; it is written off to the partners' capital accounts."],
  ['Loan to a partner', "Took a loan to a partner for an asset to be sold; it is set off against that partner's capital account."],
];
const NOT_LIABILITY: [string, string][] = [
  ['General Reserve', "Took a reserve for a debt; it is profit kept back and is credited to the partners' capital accounts in the profit-sharing ratio."],
  ["A partner's loan to the firm", "Sent a partner's own loan to Realisation A/c; it is kept apart and repaid by itself after the outside liabilities."],
  ["Partners' capitals", 'Sent the capitals to Realisation A/c; capital accounts stay open to the end and are closed through Bank A/c.'],
  ['Profit and Loss A/c (credit balance)', "Took undistributed profit for a debt; it is credited to the partners' capital accounts."],
  ['Workmen Compensation Reserve with no claim against it', "With no claim against it the whole reserve is free profit, credited to the partners' capital accounts."],
];

const goesToRealisation = mcqTemplate({
  id: 'dis-to-realisation', topicId: T, conceptId: C.realisation, difficulty: 'easy',
  generate: (rng) => {
    const f = firm(rng);
    const lead = `${f.intro} Its balance sheet on that date showed the four balances below, among others.`;
    const variant = rng.int(0, 2);
    const pick = (pool: [string, string][], n: number) => rng.shuffle(pool).slice(0, n);
    if (variant === 0) {
      const [right] = pick(TO_DEBIT, 1);
      return choice(
        `${lead} Which of them is transferred to the debit side of Realisation A/c?`,
        right[0],
        pick(NOT_ASSET, 3),
        `${right[0]}: every asset other than cash and bank, fictitious assets and a loan to a partner is transferred to the debit of Realisation A/c at its book value.`,
        H.realisation,
      );
    }
    if (variant === 1) {
      const [right] = pick(TO_CREDIT, 1);
      return choice(
        `${lead} Which of them is transferred to the credit side of Realisation A/c?`,
        right[0],
        pick(NOT_LIABILITY, 3),
        `${right[0]}: outside liabilities, and provisions against assets, are transferred to the credit of Realisation A/c. Reserves, capitals and a partner's own loan are not.`,
        H.realisation,
      );
    }
    const [right] = pick([...NOT_ASSET, ...NOT_LIABILITY], 1);
    const wrong = [...pick(TO_DEBIT, 2), ...pick(TO_CREDIT, 2)].map(([text, why]): [string, string] => [text, `Kept this out of Realisation A/c. ${why}`]);
    return choice(
      `${lead} Which of them is NOT transferred to Realisation A/c?`,
      right[0],
      rng.shuffle(wrong).slice(0, 3),
      `${right[0]} stays out of Realisation A/c. Only assets that can be turned into money (other than cash and bank) and debts due to outsiders are transferred to it.`,
      H.realisation,
    );
  },
  verify: (q) => {
    const answer = optionText(q);
    const among = (pool: [string, string][]) => pool.some(([text]) => text === answer);
    if (q.prompt.includes('NOT transferred')) return among(NOT_ASSET) || among(NOT_LIABILITY);
    return q.prompt.includes('debit side') ? among(TO_DEBIT) : among(TO_CREDIT);
  },
});

const valueNotGiven = mcqTemplate({
  id: 'dis-value-not-given', topicId: T, conceptId: C.realisation, difficulty: 'easy',
  generate: (rng) => {
    const f = firm(rng);
    const intangible = rng.int(0, 2) === 0;
    const t = intangible ? rng.pick([...INTANGIBLE, { id: 'trademarks', name: 'Trademarks', the: 'the trademarks', plural: true as const }]) : rng.pick(TANGIBLE);
    const book = rng.step(20000, 200000, 10000);
    const atBook = `${inr(book)}, the book value`;
    const half = `${inr(book / 2)}, half the book value`;
    const out = 'Nothing can be assumed, so the asset is left out of Realisation A/c';
    const prompt = `${f.intro} ${t.name} stood in the books at ${inr(book)}. The information given about this dissolution states what each of the other assets realised but says nothing at all about ${t.the}. Following the note in the CBSE syllabus, how much ${t.plural ? 'are' : 'is'} ${t.the} taken to have realised?`;
    return intangible
      ? choice(
          prompt,
          'Nil',
          [
            [atBook, 'Applied the rule for a tangible asset; an intangible asset whose realised value is not given is taken to fetch nothing.'],
            [half, 'Guessed a figure; the syllabus fixes it: nothing for an intangible asset whose realised value is not given.'],
            [out, 'Dropped the asset; it is still transferred to the debit of Realisation A/c, and the whole of it becomes a loss.'],
          ],
          `${t.name} ${t.plural ? 'are' : 'is'} an intangible asset. When the realised value of an intangible asset is not given it is taken as nil, so the whole ${inr(book)} is lost on realisation.`,
        )
      : choice(
          prompt,
          atBook,
          [
            ['Nil', 'Applied the rule for an intangible asset; a tangible asset whose realised value is not given is taken to realise its book value.'],
            [half, 'Assumed a loss on a forced sale; no loss is assumed unless the question states one.'],
            [out, 'Dropped the asset; it is transferred to Realisation A/c and taken as realised at its book value.'],
          ],
          `${t.name} ${t.plural ? 'are' : 'is'} a tangible asset. When the realised value of a tangible asset is not given it is taken as realised at book value, ${inr(book)}, so it gives no profit and no loss.`,
        );
  },
  verify: (q) => /Goodwill|Patents|Trademarks/.test(q.prompt) === (optionText(q) === 'Nil'),
});

const resultSimple = numericTemplate({
  id: 'dis-result-simple', topicId: T, conceptId: C.realisation, difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const items = rng.shuffle(TANGIBLE).slice(0, rng.int(2, 3)).map((t) => {
      const book = rng.step(40000, 300000, 10000);
      return { name: t.name, book, got: book + (book / 100) * rng.pick([-20, -15, -10, -5, 5, 10, 15]) };
    });
    const creditors = rng.step(30000, 150000, 5000);
    const expenses = rng.step(2000, 12000, 500);
    const book = total(items.map((i) => i.book));
    const got = total(items.map((i) => i.got));
    const result = got - book - expenses;
    if (result === 0) return null;
    const word = result > 0 ? 'profit' : 'loss';
    const n = numeric(Math.abs(result), [
      [Math.abs(got - book), 'Left out the realisation expenses, which are debited to Realisation A/c like any other payment.'],
      [
        Math.abs(got - book + expenses),
        result > 0
          ? 'Added the realisation expenses to the profit instead of deducting them.'
          : got > book
            ? 'Added the realisation expenses to the gain on the assets instead of setting them off against it.'
            : 'Deducted the realisation expenses from the loss instead of adding them.',
      ],
      [Math.abs(result - creditors), 'Counted the payment to the creditors as a loss; they were paid exactly what the books showed, which leaves the result unchanged.'],
    ]);
    return n && {
      prompt: `${f.intro} Its assets other than cash and bank, and what they fetched, are given below.\n${items.map((i) => `${i.name}: book value ${inr(i.book)}, realised ${inr(i.got)}`).join('\n')}\nCreditors of ${inr(creditors)} were paid in full, and realisation expenses of ${inr(expenses)} were paid by the firm.\nWhat is the ${word} on realisation?`,
      ...n,
      explanation: [
        `Book value of the assets transferred = ${items.map((i) => inr(i.book)).join(' + ')} = ${inr(book)}.`,
        `Amount realised = ${items.map((i) => inr(i.got)).join(' + ')} = ${inr(got)}.`,
        `The creditors went to the credit of Realisation A/c at ${inr(creditors)} and were paid the same amount, so they change nothing.`,
        result > 0
          ? `Profit = ${inr(got)} - ${inr(book)} - expenses ${inr(expenses)} = ${inr(result)}.`
          : `Loss = ${inr(book)} + expenses ${inr(expenses)} - ${inr(got)} = ${inr(-result)}.${got > book ? ` The assets fetched ${inr(got - book)} more than their book value, but the expenses were larger than that gain.` : ''}`,
      ],
      hints: H.realisation,
    };
  },
  verify: (q) => {
    const rows = [...q.prompt.matchAll(/book value ₹([\d,]+), realised ₹([\d,]+)/g)].map((m) => [m[1], m[2]].map((x) => Number(x.replace(/,/g, ''))));
    const expenses = Number(/expenses of ₹([\d,]+)/.exec(q.prompt)?.[1].replace(/,/g, ''));
    const result = total(rows.map(([book, got]) => got - book)) - expenses;
    return q.answer === rupees(Math.abs(result)) && q.prompt.includes(result > 0 ? 'the profit on' : 'the loss on');
  },
});

const shareOfResult = numericTemplate({
  id: 'dis-share-of-result', topicId: T, conceptId: C.realisation, difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng, { unequal: true });
    const i = rng.int(0, f.names.length - 1);
    const other = f.ratio.findIndex((r) => r !== f.ratio[i]);
    const result = f.sum * rng.step(1000, 9000, 500);
    const mine = shareOf(f, result, i);
    const word = rng.pick(['profit', 'loss']);
    if (rng.int(0, 1) === 0) {
      const n = numeric(mine, [
        [result / f.names.length, 'Shared it equally, ignoring the profit-sharing ratio.'],
        [shareOf(f, result, other), `Gave ${f.names[other]}'s share: the terms of the ratio follow the order of the names.`],
        [result, `Gave the whole ${word}, not ${f.names[i]}'s share of it.`],
      ]);
      return n && {
        prompt: `${f.intro} After every asset had been realised and every liability paid, Realisation A/c showed a ${word} of ${inr(result)}. How much of it is ${word === 'profit' ? 'credited' : 'debited'} to ${f.names[i]}'s Capital A/c?`,
        ...n,
        explanation: [
          `The ${word} on realisation is shared in the profit-sharing ratio, ${f.ratio.join(':')}.`,
          `${f.names[i]}'s share = ${fraction(f, i)} x ${inr(result)} = ${inr(mine)}, ${word === 'profit' ? 'credited' : 'debited'} to ${f.names[i]}'s Capital A/c.`,
        ],
        hints: H.realisation,
      };
    }
    const small = rng.step(200000, 600000, 10000);
    const [debit, credit] = word === 'profit' ? [small, small + result] : [small + result, small];
    const n = numeric(mine, [
      [result / f.names.length, 'Shared the difference equally, ignoring the profit-sharing ratio.'],
      [shareOf(f, result, other), `Gave ${f.names[other]}'s share: the terms of the ratio follow the order of the names.`],
      [result, `Gave the whole ${word}, not ${f.names[i]}'s share of it.`],
      [shareOf(f, Math.max(debit, credit), i), 'Shared the total of one side of the account instead of the difference between the two sides.'],
    ]);
    return n && {
      prompt: `${f.intro} When everything had been posted, the debit side of Realisation A/c came to ${inr(debit)} and the credit side to ${inr(credit)}. What is ${f.names[i]}'s share of the profit or loss on realisation? (Give the amount only.)`,
      ...n,
      explanation: [
        word === 'profit'
          ? `The credit side is heavier, so there is a profit: ${inr(credit)} - ${inr(debit)} = ${inr(result)}.`
          : `The debit side is heavier, so there is a loss: ${inr(debit)} - ${inr(credit)} = ${inr(result)}.`,
        `${f.names[i]}'s share = ${fraction(f, i)} x ${inr(result)} = ${inr(mine)}, ${word === 'profit' ? 'credited' : 'debited'} to ${f.names[i]}'s Capital A/c.`,
      ],
      hints: H.realisation,
    };
  },
  verify: (q) => {
    const amounts = amountsIn(q.prompt);
    const result = amounts.length === 1 ? amounts[0] : Math.abs(amounts[0] - amounts[1]);
    const name = /(?:to|is) ([A-Z][a-z]+)'s (?:Capital|share)/.exec(q.prompt)?.[1] ?? '';
    return q.answer === rupees(shareIn(q.prompt, name, result));
  },
});

const journalAssetSold = journalTemplate({
  id: 'dis-journal-asset-sold', topicId: T, conceptId: C.takenOver, difficulty: 'easy',
  generate: (rng) => {
    const f = firm(rng);
    const t = rng.pick([...TANGIBLE, INVESTMENTS]);
    const book = rng.step(30000, 300000, 10000);
    const got = book + (book / 100) * rng.pick([-25, -20, -10, -5, 5, 10, 20]);
    const how = rng.pick(['bank', 'cash'] as const);
    const prompt = rng.pick([
      `${f.intro} All the assets had been transferred to Realisation A/c. ${cap(t.the)}, which stood in the books at ${inr(book)}, ${was(t)} then sold for ${inr(got)}, received ${how === 'bank' ? 'by cheque' : 'in cash'}. Pass the journal entry for the sale.`,
      `${f.intro} After the assets were transferred to Realisation A/c, ${t.the} (book value ${inr(book)}) fetched ${inr(got)} ${how === 'bank' ? 'by cheque' : 'in cash'}. Pass the entry for the amount realised.`,
    ]);
    return {
      prompt,
      lines: [dr(how, got), cr(REAL, got)],
      explanation: [
        `${t.name} A/c was closed when its book value, ${inr(book)}, went to the debit of Realisation A/c, so it is not touched again.`,
        `The money received, ${inr(got)}, is debited to ${how === 'bank' ? 'Bank' : 'Cash'} A/c.`,
        `Realisation A/c is credited with what the asset fetched. The ${got > book ? 'gain' : 'shortfall'} of ${inr(Math.abs(got - book))} needs no entry: it shows in the balance of Realisation A/c.`,
      ],
      distractorAccounts: [t.id, got > book ? 'profitOnSaleOfAsset' : 'lossOnSaleOfAsset'],
      hints: H.entry,
    };
  },
  verify: (q) => {
    const got = amountsIn(q.prompt)[1];
    return q.expected.length === 2 && hasLine(q, /cheque/.test(q.prompt) ? 'bank' : 'cash', 'Dr', got) && hasLine(q, REAL, 'Cr', got);
  },
});

const journalLiabilityPaid = journalTemplate({
  id: 'dis-journal-liability-paid', topicId: T, conceptId: C.takenOver, difficulty: 'easy',
  generate: (rng) => {
    const f = firm(rng);
    const t = rng.pick(LIABILITIES);
    const owed = t.id === 'outstandingExpenses' ? rng.step(4000, 30000, 1000) : rng.step(20000, 200000, 5000);
    const discount = t.id === 'creditors' && rng.int(0, 1) === 0 ? (owed / 100) * rng.pick([2, 4, 5, 10]) : 0;
    const paid = owed - discount;
    const prompt = discount
      ? `${f.intro} The outside liabilities had been transferred to Realisation A/c. Creditors of ${inr(owed)} then accepted ${inr(paid)} by cheque in full settlement of their claim. Pass the journal entry for the payment.`
      : `${f.intro} The outside liabilities had been transferred to Realisation A/c. ${cap(t.the)} of ${inr(owed)} ${was(t)} then paid in full by cheque. Pass the journal entry for the payment.`;
    return {
      prompt,
      lines: [dr(REAL, paid), cr('bank', paid)],
      explanation: [
        `${t.name} A/c was closed when its balance, ${inr(owed)}, went to the credit of Realisation A/c, so it is not touched again.`,
        `The payment is therefore debited to Realisation A/c, with the amount actually paid, ${inr(paid)}.`,
        'Bank A/c is credited because money goes out.',
        ...(discount ? [`The ${inr(discount)} the creditors gave up needs no entry: it stays in Realisation A/c as a gain.`] : []),
      ],
      distractorAccounts: [t.id, 'discountReceived'],
      hints: H.entry,
    };
  },
  verify: (q) => {
    const amounts = amountsIn(q.prompt);
    const paid = amounts[amounts.length - 1];
    return q.expected.length === 2 && hasLine(q, REAL, 'Dr', paid) && hasLine(q, 'bank', 'Cr', paid);
  },
});

const journalAssetTaken = journalTemplate({
  id: 'dis-journal-asset-taken', topicId: T, conceptId: C.takenOver, difficulty: 'easy',
  generate: (rng) => {
    const f = firm(rng);
    const p = rng.pick(f.names);
    const t = rng.pick([...TANGIBLE, INVESTMENTS]);
    const book = rng.step(30000, 200000, 10000);
    const at = book + (book / 100) * rng.pick([-20, -10, -5, 0, 5, 10]);
    const prompt =
      at === book
        ? `${f.intro} ${FLUCTUATING} The assets had been transferred to Realisation A/c. ${p} took over ${t.the} at ${t.plural ? 'their' : 'its'} book value of ${inr(book)}. Pass the journal entry.`
        : `${f.intro} ${FLUCTUATING} The assets had been transferred to Realisation A/c. ${p} took over ${t.the}, which stood in the books at ${inr(book)}, at an agreed value of ${inr(at)}. Pass the journal entry.`;
    return {
      prompt,
      lines: [dr(partnerCapital(p), at), cr(REAL, at)],
      explanation: [
        `${p} receives the asset in place of money, so ${p}'s Capital A/c is debited with the agreed value, ${inr(at)}: that much less will be paid to ${p} at the end.`,
        'Realisation A/c is credited, exactly as if the asset had been sold for that amount.',
        `${t.name} A/c is not touched: its book value went to Realisation A/c with the other assets.`,
      ],
      distractorAccounts: [t.id],
      hints: H.entry,
    };
  },
  verify: (q) => {
    const amounts = amountsIn(q.prompt);
    const at = amounts[amounts.length - 1];
    const p = /\. ([A-Z][a-z]+) took over/.exec(q.prompt)?.[1] ?? '';
    return q.expected.length === 2 && hasLine(q, partnerCapital(p), 'Dr', at) && hasLine(q, REAL, 'Cr', at);
  },
});

const journalExpensesPaid = journalTemplate({
  id: 'dis-journal-expenses-paid', topicId: T, conceptId: C.expenses, difficulty: 'easy',
  generate: (rng) => {
    const f = firm(rng);
    const p = rng.pick(f.names);
    const e = rng.step(2000, 20000, 500);
    const variant = rng.int(0, 2);
    if (variant < 2) {
      const how = variant === 0 ? 'bank' : 'cash';
      return {
        prompt: `${f.intro} Realisation expenses came to ${inr(e)}. They were to be borne by the firm, and the firm paid them ${how === 'bank' ? 'by cheque' : 'in cash'}. Pass the journal entry.`,
        lines: [dr(REAL, e), cr(how, e)],
        explanation: [
          'The firm bears the expenses of winding up, so they are a cost of realisation: Realisation A/c is debited.',
          `The firm paid them, so ${how === 'bank' ? 'Bank' : 'Cash'} A/c is credited.`,
        ],
        distractorAccounts: [partnerCapital(p), 'tradeExpenses'],
        hints: H.expenses,
      };
    }
    return {
      prompt: `${f.intro} ${FLUCTUATING} Realisation expenses came to ${inr(e)}. They were to be borne by the firm, but ${p} paid them out of ${p}'s own money on the firm's behalf. Pass the journal entry.`,
      lines: [dr(REAL, e), cr(partnerCapital(p), e)],
      explanation: [
        'The firm bears the expenses of winding up, so they are a cost of realisation: Realisation A/c is debited.',
        `No money left the firm. ${p} paid for the firm, so the firm now owes ${p} the amount: ${p}'s Capital A/c is credited.`,
      ],
      distractorAccounts: ['tradeExpenses'],
      hints: H.expenses,
    };
  },
  verify: (q) => {
    const e = amountsIn(q.prompt)[0];
    const p = /but ([A-Z][a-z]+) paid/.exec(q.prompt)?.[1];
    const credited = p ? partnerCapital(p) : /cheque/.test(q.prompt) ? 'bank' : 'cash';
    return q.expected.length === 2 && hasLine(q, REAL, 'Dr', e) && hasLine(q, credited, 'Cr', e);
  },
});

const loanTreatment = mcqTemplate({
  id: 'dis-loan-treatment', topicId: T, conceptId: C.loans, difficulty: 'easy',
  generate: (rng) => {
    const f = firm(rng);
    const a = rng.pick(f.names);
    const x = inr(rng.step(20000, 150000, 5000));
    const kind = rng.pick(['partner', 'relative', 'toPartner'] as const);
    const viaRealisation = 'Transferred to the credit of Realisation A/c and paid through it, like any outside liability';
    const byItself = 'Kept out of Realisation A/c and repaid by itself, after the outside liabilities and before the capitals';
    const againstCapital = `Kept out of Realisation A/c and debited to ${a}'s Capital A/c`;
    const asAsset = 'Transferred to the debit of Realisation A/c with the other assets';
    const shared = "Credited to all the partners' capital accounts in the profit-sharing ratio";
    if (kind === 'partner') {
      return choice(
        `${f.intro} The balance sheet showed a loan of ${x} that ${a}, a partner, had given the firm. How is this loan dealt with on dissolution?`,
        byItself,
        [
          [viaRealisation, "Treated a partner's own loan as an outside liability; it is settled separately, after the outsiders have been paid."],
          [shared, 'Treated the loan like a reserve to be shared; it is owed to one partner alone.'],
          [asAsset, 'Took the loan for an asset; the firm owes this money.'],
          [againstCapital, `Debited ${a}, as if ${a} owed the firm; here the firm owes ${a}.`],
        ],
        `A partner's loan is not passed through Realisation A/c. Under section 48 it is repaid after the debts due to outsiders and before the capitals: ${a}'s Loan A/c Dr; To Bank A/c.`,
        H.loans,
      );
    }
    if (kind === 'relative') {
      const r = relative(rng, a);
      return choice(
        `${f.intro} The balance sheet showed a loan of ${x} taken from ${r.as}. ${r.name} is not a partner. How is this loan dealt with on dissolution?`,
        viaRealisation,
        [
          [byItself, "Gave it the treatment of a partner's own loan; a relative of a partner is an outsider, however close."],
          [shared, 'Shared it among the partners like a reserve; it is a debt the firm owes to an outsider.'],
          [asAsset, 'Took the loan for an asset; the firm owes this money.'],
          [againstCapital, `Charged it to ${a}'s capital; the firm, not ${a}, borrowed the money.`],
        ],
        `${r.name} is an outsider, so the loan is an outside liability: it is transferred to the credit of Realisation A/c and its payment is debited to Realisation A/c.`,
        H.loans,
      );
    }
    return choice(
      `${f.intro} Among the assets, the balance sheet showed a loan of ${x} that the firm had given to ${a}, a partner. How is this loan dealt with on dissolution?`,
      againstCapital,
      [
        [asAsset, 'Treated it as an asset to be sold; it is recovered by setting it off against what the firm owes that partner.'],
        [viaRealisation, `Took it for a liability; here ${a} owes the firm.`],
        [byItself, 'Confused it with a loan from a partner, which the firm repays; this one is owed to the firm.'],
        [shared, 'Shared it among all the partners; it is owed by one partner alone.'],
      ],
      `A loan to a partner is not transferred to Realisation A/c. It is set off against that partner's capital: ${a}'s Capital A/c Dr; To Loan to ${a} A/c.`,
      H.loans,
    );
  },
  verify: (q) => {
    const answer = optionText(q);
    if (q.prompt.includes('is not a partner')) return answer.startsWith('Transferred to the credit');
    return q.prompt.includes('had given to') ? answer.includes("Capital A/c") : answer.includes('repaid by itself');
  },
});

/** Accumulated profits and losses, which go to the capital accounts and never to Realisation A/c. */
const ACCUMULATED: { id: string; credit: boolean; shown: string; name: string }[] = [
  { id: 'generalReserve', credit: true, name: 'General Reserve A/c', shown: 'a General Reserve of' },
  { id: 'profitAndLoss', credit: true, name: 'Profit and Loss A/c', shown: 'a credit balance of Profit and Loss A/c (undistributed profit) of' },
  { id: 'workmenCompensationReserve', credit: true, name: 'Workmen Compensation Reserve A/c', shown: 'a Workmen Compensation Reserve, against which there was no claim, of' },
  { id: 'profitAndLoss', credit: false, name: 'Profit and Loss A/c', shown: 'a debit balance of Profit and Loss A/c (accumulated loss) of' },
  { id: 'advertisementSuspense', credit: false, name: 'Advertisement Suspense A/c', shown: 'Advertisement Suspense A/c, a fictitious asset, at' },
  { id: 'deferredRevenueExpenditure', credit: false, name: 'Deferred Revenue Expenditure A/c', shown: 'Deferred Revenue Expenditure, a fictitious asset, at' },
];

const journalReserves = journalTemplate({
  id: 'dis-journal-reserves', topicId: T, conceptId: C.closing, difficulty: 'easy',
  generate: (rng) => {
    const f = firm(rng);
    const item = rng.pick(ACCUMULATED);
    const amount = f.sum * rng.step(2000, 12000, 1000);
    const shares = f.names.map((_, i) => shareOf(f, amount, i));
    const working = `${f.names.map((n, i) => `${n} ${fraction(f, i)} x ${inr(amount)} = ${inr(shares[i])}`).join('; ')}.`;
    return {
      prompt: `${f.intro} ${FLUCTUATING} The balance sheet on that date showed ${item.shown} ${inr(amount)}. Pass the journal entry to close this account.`,
      lines: item.credit
        ? [dr(item.id, amount), ...f.names.map((n, i) => cr(partnerCapital(n), shares[i]))]
        : [...f.names.map((n, i) => dr(partnerCapital(n), shares[i])), cr(item.id, amount)],
      explanation: item.credit
        ? [
            `${item.name} holds profit that was never shared out. It belongs to the partners, so it is not transferred to Realisation A/c.`,
            `It is closed by a debit of ${inr(amount)} and credited to the capital accounts in the profit-sharing ratio: ${working}`,
          ]
        : [
            `${item.name} is a loss or expense not yet written off. Nothing can be realised from it, so it is not transferred to Realisation A/c.`,
            `It is closed by a credit of ${inr(amount)} and debited to the capital accounts in the profit-sharing ratio: ${working}`,
          ],
      distractorAccounts: [REAL],
      hints: ['Is this something that can be sold, or a debt owed to an outsider? If neither, it does not belong in Realisation A/c.', 'Accumulated profits are credited, and accumulated losses debited, to the capital accounts in the profit-sharing ratio.'],
    };
  },
  verify: (q) => {
    const amount = amountsIn(q.prompt)[0];
    const names = namesIn(q.prompt);
    const side = /General Reserve|credit balance|Workmen/.test(q.prompt) ? 'Cr' : 'Dr';
    return q.expected.length === names.length + 1 && names.every((n) => hasLine(q, partnerCapital(n), side, shareIn(q.prompt, n, amount))) && !q.expected.some((l) => l.accountId === REAL);
  },
});

const journalFinalPayment = journalTemplate({
  id: 'dis-journal-final-payment', topicId: T, conceptId: C.closing, difficulty: 'easy',
  generate: (rng) => {
    const f = firm(rng);
    if (rng.int(0, 2) === 0) {
      const p = rng.pick(f.names);
      const short = rng.step(3000, 40000, 1000);
      return {
        prompt: `${f.intro} ${FLUCTUATING} After ${p}'s share of the loss on realisation was debited, ${p}'s Capital A/c showed a debit balance of ${inr(short)}. ${p} paid this amount into the firm's bank account. Pass the journal entry.`,
        lines: [dr('bank', short), cr(partnerCapital(p), short)],
        explanation: [
          `A debit balance on a capital account means ${p} owes the firm ${inr(short)}.`,
          `${p} brings the money in: Bank A/c is debited and ${p}'s Capital A/c is credited, which closes it.`,
        ],
        distractorAccounts: [REAL, ...f.names.filter((n) => n !== p).map(partnerCapital)],
        hints: H.closing,
      };
    }
    const balances = f.names.map(() => rng.step(40000, 300000, 5000));
    return {
      prompt: `${f.intro} ${FLUCTUATING} When every other account had been closed, the capital accounts showed credit balances of ${list(f.names.map((n, i) => `${n} ${inr(balances[i])}`))}, and Bank A/c showed ${inr(total(balances))}. Pass the journal entry for the final payment to the partners.`,
      lines: [...f.names.map((n, i) => dr(partnerCapital(n), balances[i])), cr('bank', total(balances))],
      explanation: [
        'A credit balance on a capital account is what the firm still owes that partner.',
        `Each capital account is debited with its own balance and Bank A/c is credited with the total, ${inr(total(balances))}.`,
        'The money in the bank equals what is owed to the partners, so every account is now closed.',
      ],
      distractorAccounts: [REAL],
      hints: H.closing,
    };
  },
  verify: (q) => {
    const amounts = amountsIn(q.prompt);
    const names = namesIn(q.prompt);
    if (q.prompt.includes('debit balance')) return q.expected.length === 2 && hasLine(q, 'bank', 'Dr', amounts[0]);
    return hasLine(q, 'bank', 'Cr', total(amounts.slice(0, names.length))) && names.every((n, i) => hasLine(q, partnerCapital(n), 'Dr', amounts[i]));
  },
});

// ===============================================================================================================
// MEDIUM
// ===============================================================================================================

/** Assets a creditor or a partner may reasonably accept in settlement. */
const HANDY: Thing[] = [TANGIBLE[0], TANGIBLE[1], TANGIBLE[2], TANGIBLE[5], TANGIBLE[6], INVESTMENTS];
const TRANSFERRED = 'The assets and the outside liabilities had been transferred to Realisation A/c.';

const journalCreditorAsset = journalTemplate({
  id: 'dis-journal-creditor-asset', topicId: T, conceptId: C.takenOver, difficulty: 'medium', computed: true,
  generate: (rng) => {
    const f = firm(rng);
    const t = rng.pick(HANDY);
    const at = rng.step(20000, 120000, 5000);
    const book = at + rng.pick([-10000, -5000, 5000, 10000]);
    const gap = rng.step(5000, 60000, 5000);
    const worthMore = rng.int(0, 2) === 0;
    const owed = worthMore ? at - gap : at + gap;
    if (owed < 10000 || book < 10000) return null;
    const noEntry = 'No entry is passed for handing the asset over: the asset (on the debit side) and the creditors (on the credit side) are both already in Realisation A/c.';
    if (worthMore) {
      return {
        prompt: `${f.intro} ${TRANSFERRED} A creditor to whom the firm owed ${inr(owed)} took over ${t.the} (book value ${inr(book)}) at an agreed value of ${inr(at)} and paid the difference to the firm by cheque. Pass the one journal entry that is needed.`,
        lines: [dr('bank', gap), cr(REAL, gap)],
        explanation: [
          noEntry,
          `The asset was valued at more than the debt, so the creditor paid the firm ${inr(at)} - ${inr(owed)} = ${inr(gap)}.`,
          'Only this money is recorded: Bank A/c is debited and Realisation A/c is credited.',
        ],
        distractorAccounts: ['creditors', t.id],
        hints: H.entry,
      };
    }
    return {
      prompt: `${f.intro} ${TRANSFERRED} Creditors of ${inr(owed)} accepted ${t.the} (book value ${inr(book)}) at an agreed value of ${inr(at)} in part settlement of their claim and were paid the balance by cheque. Pass the one journal entry that is needed.`,
      lines: [dr(REAL, gap), cr('bank', gap)],
      explanation: [
        noEntry,
        `The creditors are still owed ${inr(owed)} - ${inr(at)} = ${inr(gap)}, which is paid by cheque.`,
        'Only this payment is recorded: Realisation A/c is debited and Bank A/c is credited.',
      ],
      distractorAccounts: ['creditors', t.id],
      hints: H.entry,
    };
  },
  verify: (q) => {
    const [owed, , at] = amountsIn(q.prompt);
    return q.expected.length === 2 && (at > owed ? hasLine(q, 'bank', 'Dr', at - owed) && hasLine(q, REAL, 'Cr', at - owed) : hasLine(q, REAL, 'Dr', owed - at) && hasLine(q, 'bank', 'Cr', owed - at));
  },
});

const settledByAsset = mcqTemplate({
  id: 'dis-settled-by-asset', topicId: T, conceptId: C.takenOver, difficulty: 'medium',
  generate: (rng) => {
    const f = firm(rng);
    const t = rng.pick(HANDY);
    const debt = rng.pick([
      { account: 'Creditors A/c', who: (x: string) => `Creditors of ${x}` },
      { account: 'Bank Loan A/c', who: (x: string) => `The bank, to which the firm owed a loan of ${x},` },
      { account: 'Bills Payable A/c', who: (x: string) => `The holder of bills payable of ${x}` },
    ]);
    const owed = rng.step(30000, 150000, 5000);
    const none = 'No entry is passed';
    if (rng.int(0, 1) === 0) {
      const book = owed + rng.pick([-10000, -5000, 5000, 10000]);
      return choice(
        `${f.intro} ${TRANSFERRED} ${debt.who(inr(owed))} accepted ${t.the}, which stood in the books at ${inr(book)}, in full settlement of the claim. Which journal entry is passed for this settlement?`,
        none,
        [
          [`${debt.account} Dr ${inr(owed)}; To ${t.name} A/c ${inr(owed)}`, 'Passed the everyday entry for settling a debt with an asset; on dissolution both accounts were already closed by transfer to Realisation A/c.'],
          [`Realisation A/c Dr ${inr(owed)}; To Bank A/c ${inr(owed)}`, 'Recorded a payment by cheque, although no money left the firm.'],
          [`Realisation A/c Dr ${inr(book)}; To ${t.name} A/c ${inr(book)}`, 'Transferred the asset to Realisation A/c a second time; it went there with the other assets.'],
          [`${debt.account} Dr ${inr(owed)}; To Realisation A/c ${inr(owed)}`, 'Transferred the liability to Realisation A/c a second time; it went there with the other liabilities.'],
        ],
        `The asset (${inr(book)}, on the debit) and the liability (${inr(owed)}, on the credit) are both already in Realisation A/c, and no money moves, so no entry is passed. The difference between the two is part of the balance of Realisation A/c.`,
        H.entry,
      );
    }
    const gap = rng.step(5000, Math.min(40000, owed - 15000), 5000);
    const at = owed - gap;
    const book = at + rng.pick([-10000, -5000, 5000, 10000]);
    return choice(
      `${f.intro} ${TRANSFERRED} ${debt.who(inr(owed))} accepted ${t.the} (book value ${inr(book)}) at an agreed value of ${inr(at)} in part settlement and received a cheque for the balance. Which journal entry is passed?`,
      `Realisation A/c Dr ${inr(gap)}; To Bank A/c ${inr(gap)}`,
      [
        [none, 'Stopped at the asset, for which no entry is needed, and forgot the cheque paid for the balance.'],
        [`Realisation A/c Dr ${inr(owed)}; To Bank A/c ${inr(owed)}`, 'Paid the whole debt by cheque, ignoring the asset that had been accepted in part settlement.'],
        [`Realisation A/c Dr ${inr(owed - book)}; To Bank A/c ${inr(owed - book)}`, 'Set the book value of the asset against the debt instead of the value agreed with the lender.'],
        [`${debt.account} Dr ${inr(at)}; To ${t.name} A/c ${inr(at)}`, 'Passed an entry for handing over the asset; both accounts are already closed, so only the cheque is recorded.'],
        [`Bank A/c Dr ${inr(gap)}; To Realisation A/c ${inr(gap)}`, 'Reversed the entry: the firm pays the balance, it does not receive it.'],
      ].filter(([text]) => !text.includes('₹0') && !text.includes('-')) as [string, string][],
      `No entry is passed for the asset itself. The balance still owed is ${inr(owed)} - ${inr(at)} = ${inr(gap)}, and its payment is recorded: Realisation A/c Dr; To Bank A/c.`,
      H.entry,
    );
  },
  verify: (q) => {
    const [owed, , at] = amountsIn(q.prompt);
    const answer = optionText(q);
    return q.prompt.includes('in full settlement') ? answer === 'No entry is passed' : answer.startsWith('Realisation A/c Dr') && amountsIn(answer)[0] === owed - at;
  },
});

/** `max` keeps what the thing fetches believable: an old typewriter does not sell for ₹30,000. */
const UNRECORDED_ASSETS: { what: string; it: string; id: string; max: number }[] = [
  { what: 'an old typewriter that had been written off completely', it: 'it', id: 'officeEquipment', max: 6000 },
  { what: 'a computer that had been written off in an earlier year', it: 'it', id: 'computers', max: 15000 },
  { what: 'some investments that were not shown in the books', it: 'them', id: 'investments', max: 30000 },
  { what: 'old furniture that had been written off completely', it: 'it', id: 'furniture', max: 12000 },
  { what: 'a scooter that was not recorded in the books', it: 'it', id: 'vehicles', max: 25000 },
];

const journalUnrecordedAsset = journalTemplate({
  id: 'dis-journal-unrecorded-asset', topicId: T, conceptId: C.unrecorded, difficulty: 'medium',
  generate: (rng) => {
    const f = firm(rng);
    const p = rng.pick(f.names);
    const a = rng.pick(UNRECORDED_ASSETS);
    const v = rng.step(2000, a.max, 500);
    const variant = rng.int(0, 3);
    const noBook = 'An unrecorded asset has no book value, so nothing was transferred to the debit of Realisation A/c for it.';
    if (variant === 3) {
      return {
        prompt: `${f.intro} Debts of ${inr(v)} that had been written off as bad in an earlier year were recovered by cheque during the dissolution. Pass the journal entry.`,
        lines: [dr('bank', v), cr(REAL, v)],
        explanation: [
          'A debt already written off is not in the books, so it is an unrecorded asset: nothing stands for it on the debit of Realisation A/c.',
          'The money recovered is debited to Bank A/c and credited to Realisation A/c, where it is a gain.',
        ],
        distractorAccounts: ['badDebtsRecovered', 'debtors'],
        hints: H.entry,
      };
    }
    if (variant === 2) {
      return {
        prompt: `${f.intro} ${FLUCTUATING} The firm owned ${a.what}. ${p} took ${a.it} over at ${inr(v)}. Pass the journal entry.`,
        lines: [dr(partnerCapital(p), v), cr(REAL, v)],
        explanation: [
          noBook,
          `${p} takes the asset in place of money, so ${p}'s Capital A/c is debited with ${inr(v)}.`,
          'Realisation A/c is credited: the whole amount is a gain.',
        ],
        distractorAccounts: [a.id, 'profitAndLoss'],
        hints: H.entry,
      };
    }
    const how = variant === 0 ? 'bank' : 'cash';
    return {
      prompt: `${f.intro} The firm owned ${a.what}. During the dissolution ${a.it === 'it' ? 'it was' : 'they were'} sold for ${inr(v)}, received ${how === 'bank' ? 'by cheque' : 'in cash'}. Pass the journal entry.`,
      lines: [dr(how, v), cr(REAL, v)],
      explanation: [
        noBook,
        `The money received is debited to ${how === 'bank' ? 'Bank' : 'Cash'} A/c.`,
        'Realisation A/c is credited: the whole amount is a gain.',
      ],
      distractorAccounts: [a.id, 'profitAndLoss'],
      hints: H.entry,
    };
  },
  verify: (q) => {
    const v = amountsIn(q.prompt)[0];
    const p = /\. ([A-Z][a-z]+) took (?:it|them) over/.exec(q.prompt)?.[1];
    const debited = p ? partnerCapital(p) : /in cash/.test(q.prompt) ? 'cash' : 'bank';
    return q.expected.length === 2 && hasLine(q, debited, 'Dr', v) && hasLine(q, REAL, 'Cr', v);
  },
});

const UNRECORDED_LIABS: { text: (x: string) => string; id: string }[] = [
  { text: (x) => `A bill of ${x} for repairs had never been entered in the books.`, id: 'repairs' },
  { text: (x) => `A customer's claim of ${x} for damages was accepted; nothing about it stood in the books.`, id: 'outstandingExpenses' },
  { text: (x) => `An electricity bill of ${x} for the last month had not been recorded in the books.`, id: 'electricity' },
  { text: (x) => `A bill of exchange of ${x}, which the firm had discounted with its bank, was dishonoured on the due date; its acceptor could pay nothing, so the firm had to make it good. The books showed nothing for this.`, id: 'billsReceivable' },
  { text: (x) => `A former employee's claim of ${x} for compensation was admitted; it was not provided for in the books.`, id: 'workmenCompensationClaim' },
];

const journalUnrecordedLiability = journalTemplate({
  id: 'dis-journal-unrecorded-liability', topicId: T, conceptId: C.unrecorded, difficulty: 'medium',
  generate: (rng) => {
    const f = firm(rng);
    const p = rng.pick(f.names);
    const l = rng.pick(UNRECORDED_LIABS);
    const v = rng.step(2000, 25000, 500);
    const noBook = 'An unrecorded liability was never on the credit of Realisation A/c, so the whole of it is a loss when it is met.';
    if (rng.int(0, 2) === 0) {
      return {
        prompt: `${f.intro} ${FLUCTUATING} ${l.text(inr(v))} ${p} agreed to pay this amount personally. Pass the journal entry.`,
        lines: [dr(REAL, v), cr(partnerCapital(p), v)],
        explanation: [noBook, 'Realisation A/c is debited with it.', `${p} meets it for the firm, so the firm owes ${p} that much more: ${p}'s Capital A/c is credited.`],
        distractorAccounts: [l.id, 'profitAndLoss'],
        hints: H.entry,
      };
    }
    return {
      prompt: `${f.intro} ${l.text(inr(v))} The firm paid this amount by cheque. Pass the journal entry.`,
      lines: [dr(REAL, v), cr('bank', v)],
      explanation: [noBook, 'Realisation A/c is debited with it.', 'The firm pays, so Bank A/c is credited.'],
      distractorAccounts: [l.id, 'profitAndLoss'],
      hints: H.entry,
    };
  },
  verify: (q) => {
    const v = amountsIn(q.prompt)[0];
    const p = /([A-Z][a-z]+) agreed to pay this amount personally/.exec(q.prompt)?.[1];
    return q.expected.length === 2 && hasLine(q, REAL, 'Dr', v) && hasLine(q, p ? partnerCapital(p) : 'bank', 'Cr', v);
  },
});

const journalLiabilityTaken = journalTemplate({
  id: 'dis-journal-liability-taken', topicId: T, conceptId: C.takenOver, difficulty: 'medium',
  generate: (rng) => {
    const f = firm(rng);
    const p = rng.pick(f.names);
    const owed = rng.step(20000, 150000, 5000);
    const r = relative(rng, p);
    const l = rng.pick([
      ...LIABILITIES.slice(0, 3).map((t) => ({ id: t.id, text: `${t.the} of ${inr(owed)}` })),
      { id: partnerLoan(r.name), text: `the loan of ${inr(owed)} that the firm had taken from ${r.as}` },
    ]);
    return {
      prompt: `${f.intro} ${FLUCTUATING} The outside liabilities had been transferred to Realisation A/c. ${p} agreed to pay off ${l.text} personally. Pass the journal entry.`,
      lines: [dr(REAL, owed), cr(partnerCapital(p), owed)],
      explanation: [
        'The liability is already on the credit of Realisation A/c, and its own account is closed.',
        'Realisation A/c is debited, exactly as if the firm had paid the liability itself.',
        `No money leaves the firm. ${p} will pay for the firm, so the firm owes ${p} that much more: ${p}'s Capital A/c is credited.`,
      ],
      distractorAccounts: [l.id],
      hints: H.entry,
    };
  },
  verify: (q) => {
    const owed = amountsIn(q.prompt)[0];
    const p = /\. ([A-Z][a-z]+) agreed to pay off/.exec(q.prompt)?.[1] ?? '';
    return q.expected.length === 2 && hasLine(q, REAL, 'Dr', owed) && hasLine(q, partnerCapital(p), 'Cr', owed);
  },
});

const journalRemuneration = journalTemplate({
  id: 'dis-journal-remuneration', topicId: T, conceptId: C.expenses, difficulty: 'medium',
  generate: (rng) => {
    const f = firm(rng);
    const p = rng.pick(f.names);
    const fee = rng.step(6000, 30000, 1000);
    const actual = fee + rng.pick([-4000, -3000, -2000, -1000, 1000, 2000, 4000]);
    const deal = `${p} was to carry out the dissolution for a remuneration of ${inr(fee)} and to bear all the realisation expenses.`;
    const variant = rng.int(0, 2);
    const feeEntry = `The firm owes ${p} the agreed remuneration, ${inr(fee)}, whatever the expenses turn out to be: Realisation A/c is debited and ${p}'s Capital A/c is credited.`;
    if (variant === 0) {
      return {
        prompt: `${f.intro} ${FLUCTUATING} ${deal} The expenses came to ${inr(actual)} and ${p} paid them out of ${p}'s own money. Pass the one journal entry that is needed.`,
        lines: [dr(REAL, fee), cr(partnerCapital(p), fee)],
        explanation: [feeEntry, `The expenses of ${inr(actual)} are ${p}'s own affair: ${p} agreed to bear them and paid them personally, so the firm passes no entry for them.`],
        distractorAccounts: ['tradeExpenses'],
        hints: H.expenses,
      };
    }
    const paidByFirm = `The expenses came to ${inr(actual)} and were paid by the firm by cheque on ${p}'s behalf.`;
    if (variant === 1) {
      return {
        prompt: `${f.intro} ${FLUCTUATING} ${deal} ${paidByFirm} Pass the journal entry for the remuneration.`,
        lines: [dr(REAL, fee), cr(partnerCapital(p), fee)],
        explanation: [feeEntry, `The ${inr(actual)} the firm paid is recovered from ${p} by a second entry: ${p}'s Capital A/c Dr; To Bank A/c.`],
        distractorAccounts: ['tradeExpenses'],
        hints: H.expenses,
      };
    }
    return {
      prompt: `${f.intro} ${FLUCTUATING} ${deal} ${paidByFirm} Pass the journal entry for the firm's payment of the expenses.`,
      lines: [dr(partnerCapital(p), actual), cr('bank', actual)],
      explanation: [
        `${p} had agreed to bear the expenses, so the firm paid them for ${p}: ${p}'s Capital A/c is debited with ${inr(actual)}.`,
        'Money left the firm, so Bank A/c is credited.',
        `Realisation A/c is not touched by this payment. It is debited only with the remuneration of ${inr(fee)}, by a separate entry.`,
      ],
      distractorAccounts: [REAL, 'tradeExpenses'],
      hints: H.expenses,
    };
  },
  verify: (q) => {
    const [fee, actual] = amountsIn(q.prompt);
    const p = namesIn(q.prompt).find((n) => q.prompt.includes(`${n} was to carry out`)) ?? '';
    if (q.prompt.includes("firm's payment of the expenses")) return q.expected.length === 2 && hasLine(q, partnerCapital(p), 'Dr', actual) && hasLine(q, 'bank', 'Cr', actual);
    return q.expected.length === 2 && hasLine(q, REAL, 'Dr', fee) && hasLine(q, partnerCapital(p), 'Cr', fee);
  },
});

const expensesEntry = mcqTemplate({
  id: 'dis-expenses-entry', topicId: T, conceptId: C.expenses, difficulty: 'medium',
  generate: (rng) => {
    const f = firm(rng);
    const p = rng.pick(f.names);
    const e = rng.step(3000, 20000, 500);
    const r = e + rng.pick([-2000, -1000, 1000, 2000, 3000, 5000]);
    const E = inr(e);
    const R = inr(r);
    const firmPays = `Realisation A/c Dr ${E}; To Bank A/c ${E}`;
    const partnerCredited = `Realisation A/c Dr ${E}; To ${p}'s Capital A/c ${E}`;
    const partnerCharged = `${p}'s Capital A/c Dr ${E}; To Bank A/c ${E}`;
    const feeCredited = `Realisation A/c Dr ${R}; To ${p}'s Capital A/c ${R}`;
    const none = 'No entry is passed in the books of the firm';
    const ask = 'Which journal entry does the firm pass?';
    const lead = `${f.intro} ${FLUCTUATING}`;
    switch (rng.int(0, 4)) {
      case 0:
        return choice(
          `${lead} Realisation expenses of ${E} were to be borne by the firm, and the firm paid them by cheque. ${ask}`,
          firmPays,
          [
            [partnerCredited, `Credited ${p}, although the firm paid the expenses from its own bank account.`],
            [none, 'Treated the expenses as the private cost of a partner; here the firm bears them and pays them.'],
            [partnerCharged, `Charged the expenses to ${p}; nothing says a partner has to bear them.`],
            [`Bank A/c Dr ${E}; To Realisation A/c ${E}`, 'Reversed the entry: paying expenses takes money out of the bank.'],
          ],
          'The firm bears the expenses and pays them: Realisation A/c is debited and Bank A/c is credited.',
          H.expenses,
        );
      case 1:
        return choice(
          `${lead} Realisation expenses of ${E} were to be borne by the firm. ${p} paid them out of ${p}'s own money on the firm's behalf. ${ask}`,
          partnerCredited,
          [
            [firmPays, `Credited Bank A/c, although the firm's bank paid nothing: ${p} paid.`],
            [none, `Left it out; the firm bears the expenses, so it must give ${p} credit for paying them.`],
            [partnerCharged, `Debited ${p} and credited Bank A/c, as if the firm had paid for ${p}; it was ${p} who paid for the firm.`],
            [`${p}'s Capital A/c Dr ${E}; To Realisation A/c ${E}`, `Reversed the entry: the firm owes ${p} the money, so ${p}'s capital is credited.`],
          ],
          `The firm bears the expenses, so Realisation A/c is debited. ${p} paid for the firm, so ${p}'s Capital A/c is credited.`,
          H.expenses,
        );
      case 2:
        return choice(
          `${lead} ${p} had agreed to bear all the realisation expenses, without any remuneration. They came to ${E} and ${p} paid them out of ${p}'s own money. ${ask}`,
          none,
          [
            [firmPays, `Charged the firm and credited its bank, though ${p} had agreed to bear the expenses and paid them personally.`],
            [partnerCredited, `Gave ${p} credit for the payment, though ${p} had agreed to bear the expenses.`],
            [partnerCharged, `Recorded a payment from the firm's bank; ${p} paid out of ${p}'s own money.`],
          ],
          `${p} bears the expenses and pays them personally. Nothing is owed by or to the firm and none of its money moves, so the firm passes no entry.`,
          H.expenses,
        );
      case 3:
        return choice(
          `${lead} ${p} had agreed to bear all the realisation expenses, without any remuneration. They came to ${E} and were paid by the firm by cheque on ${p}'s behalf. ${ask}`,
          partnerCharged,
          [
            [firmPays, `Charged the expenses to Realisation A/c, though ${p} had agreed to bear them; the firm only paid on ${p}'s behalf.`],
            [none, `Overlooked that the firm's money was used, which ${p} has to make good.`],
            [partnerCredited, `Credited ${p} instead of debiting: here ${p} owes the firm, not the other way round.`],
          ],
          `The expenses are ${p}'s to bear, and the firm's money paid them: ${p}'s Capital A/c is debited and Bank A/c is credited. Realisation A/c is not touched.`,
          H.expenses,
        );
      default:
        return choice(
          `${lead} ${p} was to bear all the realisation expenses in return for a remuneration of ${R}. The expenses came to ${E} and ${p} paid them out of ${p}'s own money. ${ask}`,
          feeCredited,
          [
            [partnerCredited, `Credited ${p} with the actual expenses; the firm owes only the agreed remuneration.`],
            [`Realisation A/c Dr ${inr(r + e)}; To ${p}'s Capital A/c ${inr(r + e)}`, 'Added the expenses to the remuneration; the remuneration already covers them.'],
            [firmPays, `Recorded the expenses as paid by the firm; ${p} paid them and bears them.`],
            [none, `Forgot the remuneration, which the firm owes ${p}.`],
          ],
          `The firm owes ${p} the agreed remuneration of ${R}: Realisation A/c Dr; To ${p}'s Capital A/c. The actual expenses of ${E} are ${p}'s own affair.`,
          H.expenses,
        );
    }
  },
  verify: (q) => {
    const answer = optionText(q);
    const amounts = amountsIn(q.prompt);
    if (q.prompt.includes('in return for a remuneration')) return answer.startsWith('Realisation A/c Dr') && answer.includes("Capital A/c") && amountsIn(answer)[0] === amounts[0];
    if (q.prompt.includes('without any remuneration')) return q.prompt.includes('own money') ? answer.startsWith('No entry') : /^[A-Z][a-z]+'s Capital A\/c Dr/.test(answer) && answer.includes('To Bank');
    return answer.startsWith('Realisation A/c Dr') && amountsIn(answer)[0] === amounts[0] && answer.includes(q.prompt.includes('own money') ? "Capital A/c" : 'To Bank');
  },
});

const expensesCharge = numericTemplate({
  id: 'dis-expenses-charge', topicId: T, conceptId: C.expenses, difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const p = rng.pick(f.names);
    const ask = 'What amount is debited to Realisation A/c on account of realisation expenses?';
    const askDeal = 'What amount is debited to Realisation A/c under this arrangement?';
    const variant = rng.int(0, 3);
    if (variant === 3) {
      const e1 = rng.step(3000, 15000, 500);
      const e2 = rng.step(1000, 9000, 500);
      const n = numeric(e1 + e2, [
        [e1, `Left out the amount ${p} paid for the firm; it too is debited to Realisation A/c, and credited to ${p}'s Capital A/c.`],
        [e2, 'Left out the amount the firm itself paid by cheque.'],
        [Math.abs(e1 - e2), `Set off what ${p} paid against what the firm paid; both are costs of the firm and are added.`],
      ]);
      return n && {
        prompt: `${f.intro} Realisation expenses were to be borne by the firm. The firm paid ${inr(e1)} of them by cheque, and ${p} paid a further ${inr(e2)} out of ${p}'s own money on the firm's behalf. ${ask}`,
        ...n,
        explanation: [
          'The firm bears all the expenses, whoever pays them at first.',
          `Paid by the firm: Realisation A/c Dr ${inr(e1)}; To Bank A/c. Paid by ${p} for the firm: Realisation A/c Dr ${inr(e2)}; To ${p}'s Capital A/c.`,
          `Total debit = ${inr(e1)} + ${inr(e2)} = ${inr(e1 + e2)}.`,
        ],
        hints: H.expenses,
      };
    }
    if (variant === 2) {
      const pct = rng.pick([1, 2, 3, 4, 5]);
      const got = rng.step(200000, 900000, 50000);
      const book = got + rng.pick([-100000, -50000, 50000, 100000]);
      const actual = rng.step(2000, 12000, 500);
      const fee = (got * pct) / 100;
      const n = numeric(fee, [
        [(book * pct) / 100, 'Worked the commission on the book value of the assets instead of on the amount realised.'],
        [fee + actual, 'Debited the expenses as well as the commission; the commission is paid in place of them.'],
        [actual, `Debited the actual expenses; ${p} bears them, and the firm owes only the commission.`],
      ]);
      return n && {
        prompt: `${f.intro} ${p} was to realise the assets for a commission of ${pct}% of the amount realised and to bear all the realisation expenses. Assets with a book value of ${inr(book)} realised ${inr(got)}, and the expenses, ${inr(actual)}, were paid by ${p} out of ${p}'s own money. ${askDeal}`,
        ...n,
        explanation: [
          `${p} bears the expenses, so the firm's only cost is the commission.`,
          `Commission = ${pct}% of ${inr(got)} = ${inr(fee)}: Realisation A/c Dr; To ${p}'s Capital A/c.`,
          `The expenses of ${inr(actual)} are ${p}'s own affair and get no entry.`,
        ],
        hints: H.expenses,
      };
    }
    const fee = rng.step(6000, 30000, 1000);
    const actual = fee + rng.pick([-4000, -3000, -2000, -1000, 1000, 2000, 4000]);
    const byFirm = variant === 1;
    const n = numeric(fee, [
      [actual, `Debited the actual expenses; ${p} bears them, and the firm owes only the agreed remuneration.`],
      [fee + actual, 'Debited the expenses as well as the remuneration; the remuneration is paid in place of them.'],
      [Math.abs(fee - actual), 'Debited only the difference between the remuneration and the expenses; the whole remuneration is a cost of the firm.'],
    ]);
    return n && {
      prompt: `${f.intro} ${p} was to carry out the dissolution for a remuneration of ${inr(fee)}, out of which ${p} was to meet all the realisation expenses. The expenses came to ${inr(actual)} and were paid ${byFirm ? `by the firm by cheque on ${p}'s behalf` : `by ${p} out of ${p}'s own money`}. ${askDeal}`,
      ...n,
      explanation: [
        `${p} bears the expenses, so the firm's only cost is the agreed remuneration: Realisation A/c Dr ${inr(fee)}; To ${p}'s Capital A/c.`,
        byFirm
          ? `The ${inr(actual)} paid by the firm is recovered from ${p}: ${p}'s Capital A/c Dr; To Bank A/c. It does not go to Realisation A/c.`
          : `The ${inr(actual)} ${p} paid is ${p}'s own affair and gets no entry.`,
      ],
      hints: H.expenses,
    };
  },
  verify: (q) => {
    const amounts = amountsIn(q.prompt);
    const pct = Number(/commission of (\d+)%/.exec(q.prompt)?.[1]);
    if (pct) return q.answer === rupees((amounts[1] * pct) / 100);
    return q.answer === rupees(q.prompt.includes('borne by the firm') ? amounts[0] + amounts[1] : amounts[0]);
  },
});

const journalLoans = journalTemplate({
  id: 'dis-journal-loans', topicId: T, conceptId: C.loans, difficulty: 'medium',
  generate: (rng) => {
    const f = firm(rng);
    const a = rng.pick(f.names);
    const loan = rng.step(20000, 150000, 5000);
    switch (rng.int(0, 3)) {
      case 0:
        return {
          prompt: `${f.intro} ${a}, a partner, had given the firm a loan of ${inr(loan)}. After the outside liabilities had been paid, this loan was repaid by cheque. Pass the journal entry.`,
          lines: [dr(partnerLoan(a), loan), cr('bank', loan)],
          explanation: [
            `A partner's own loan is never transferred to Realisation A/c: it stays in ${a}'s Loan A/c.`,
            'It is repaid after the outside liabilities and before the capitals: the loan account is debited and Bank A/c is credited.',
          ],
          distractorAccounts: [REAL, partnerCapital(a)],
          hints: H.loans,
        };
      case 1: {
        const r = relative(rng, a);
        return {
          prompt: `${f.intro} The firm owed ${inr(loan)} on a loan from ${r.as}, who is not a partner. The loan had been transferred to Realisation A/c with the other outside liabilities, and it was now repaid by cheque. Pass the journal entry for the repayment.`,
          lines: [dr(REAL, loan), cr('bank', loan)],
          explanation: [
            `${r.name} is an outsider, so the loan is an outside liability and went to the credit of Realisation A/c.`,
            'Its repayment is therefore debited to Realisation A/c, and Bank A/c is credited.',
          ],
          distractorAccounts: [partnerLoan(r.name), partnerCapital(a)],
          hints: H.loans,
        };
      }
      case 2:
        return {
          prompt: `${f.intro} ${FLUCTUATING} Among the assets in the balance sheet was a loan of ${inr(loan)} that the firm had given to ${a}, a partner. Pass the journal entry that closes this loan account on dissolution.`,
          lines: [dr(partnerCapital(a), loan), cr(loanToPartner(a), loan)],
          explanation: [
            'A loan to a partner is not transferred to Realisation A/c: it is not sold to anyone.',
            `${a} owes the firm ${inr(loan)} and the firm owes ${a} capital, so the two are set off: ${a}'s Capital A/c is debited and Loan to ${a} A/c is credited.`,
          ],
          distractorAccounts: [REAL],
          hints: H.loans,
        };
      default: {
        const t = rng.pick(HANDY);
        const at = loan - rng.step(5000, Math.min(60000, loan - 10000), 5000);
        return {
          prompt: `${f.intro} ${a}, a partner, had given the firm a loan of ${inr(loan)}. All the assets had been transferred to Realisation A/c. In part payment of the loan, ${a} agreed to take over ${t.the} at ${inr(at)}. Pass the journal entry for the asset taken over.`,
          lines: [dr(partnerLoan(a), at), cr(REAL, at)],
          explanation: [
            'The asset is in Realisation A/c, so taking it over is credited there, like a sale.',
            `Its value is set off against what the firm owes ${a} on the loan, so ${a}'s Loan A/c is debited, not ${a}'s Capital A/c.`,
            `The rest of the loan, ${inr(loan)} - ${inr(at)} = ${inr(loan - at)}, is repaid by cheque: ${a}'s Loan A/c Dr; To Bank A/c.`,
          ],
          distractorAccounts: [partnerCapital(a), t.id],
          hints: H.loans,
        };
      }
    }
  },
  verify: (q) => {
    const amounts = amountsIn(q.prompt);
    const a = namesIn(q.prompt).find((n) => q.prompt.includes(`${n}, a partner`)) ?? '';
    if (q.prompt.includes('is not a partner')) return hasLine(q, REAL, 'Dr', amounts[0]) && hasLine(q, 'bank', 'Cr', amounts[0]);
    if (q.prompt.includes('had given to')) return hasLine(q, partnerCapital(a), 'Dr', amounts[0]) && hasLine(q, loanToPartner(a), 'Cr', amounts[0]);
    if (q.prompt.includes('In part payment')) return hasLine(q, partnerLoan(a), 'Dr', amounts[1]) && hasLine(q, REAL, 'Cr', amounts[1]);
    return hasLine(q, partnerLoan(a), 'Dr', amounts[0]) && hasLine(q, 'bank', 'Cr', amounts[0]);
  },
});

const debtorsProvision = numericTemplate({
  id: 'dis-debtors-provision', topicId: T, conceptId: C.realisation, difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const debtors = rng.step(50000, 300000, 10000);
    const provision = (debtors / 100) * rng.pick([2, 3, 5]);
    const variant = rng.int(0, 2);
    const pct = rng.pick([2, 5, 10]);
    const lost = variant === 2 ? (debtors * pct) / 100 : rng.step(1000, 20000, 1000);
    const how = [
      `The debtors realised ${inr(debtors - lost)}.`,
      `Bad debts amounted to ${inr(lost)} and the remaining debtors paid in full.`,
      `The debtors paid subject to a discount of ${pct}%.`,
    ][variant];
    const result = provision - lost;
    if (result === 0) return null;
    const word = result > 0 ? 'profit' : 'loss';
    const n = numeric(Math.abs(result), [
      [lost, 'Ignored the provision; it is transferred to the credit of Realisation A/c and absorbs that much of the shortfall.'],
      [lost + provision, 'Added the provision to the shortfall instead of setting it off against it.'],
      [provision, 'Gave the provision itself; the result is the difference between the provision and what was actually lost.'],
      ...(variant === 2 ? [[((debtors - provision) * pct) / 100, 'Worked the discount on the debtors net of the provision; it is allowed on the full amount the debtors owe.'] as [number, string]] : []),
    ]);
    return n && {
      prompt: `${f.intro} The balance sheet showed debtors of ${inr(debtors)} and, against them, a provision for doubtful debts of ${inr(provision)}. ${how} Taking the debtors and the provision together, what is the ${word} on realisation that they give?`,
      ...n,
      explanation: [
        `Debit of Realisation A/c: debtors at their gross figure, ${inr(debtors)}.`,
        `Credit of Realisation A/c: the provision ${inr(provision)} and the cash collected ${inr(debtors - lost)}, together ${inr(provision + debtors - lost)}.`,
        result > 0
          ? `The credit is larger: profit = ${inr(provision + debtors - lost)} - ${inr(debtors)} = ${inr(result)}. The provision was more than the amount lost.`
          : `The debit is larger: loss = ${inr(debtors)} - ${inr(provision + debtors - lost)} = ${inr(-result)}. The provision covered only part of the amount lost.`,
      ],
      hints: ['The debtors go to the debit of Realisation A/c at the gross figure; the provision goes to its credit.', 'Compare the provision with the amount that was actually not collected.'],
    };
  },
  verify: (q) => {
    const [debtors, provision, x] = amountsIn(q.prompt);
    const pct = Number(/discount of (\d+)%/.exec(q.prompt)?.[1]);
    const lost = pct ? (debtors * pct) / 100 : q.prompt.includes('Bad debts amounted') ? x : debtors - x;
    const result = provision - lost;
    return q.answer === rupees(Math.abs(result)) && q.prompt.includes(result > 0 ? 'the profit on' : 'the loss on');
  },
});

const STAYS_OUT = /^(Cash|Profit and Loss|Loan to|Advertisement Suspense|General Reserve|[A-Z][a-z]+'s (loan|capital)$)/;

const journalTransferAssets = journalTemplate({
  id: 'dis-journal-transfer-assets', topicId: T, conceptId: C.realisation, difficulty: 'medium',
  generate: (rng) => {
    const f = firm(rng);
    const p = rng.pick(f.names);
    const pool: Thing[] = [
      ...TANGIBLE.slice(0, 4), INVESTMENTS, INTANGIBLE[0],
      { id: 'debtors', name: 'Debtors', the: 'the debtors', plural: true },
      { id: 'billsReceivable', name: 'Bills receivable', the: 'the bills receivable', plural: true },
    ];
    const real = rng.shuffle(pool).slice(0, rng.int(3, 4)).map((t) => ({ id: t.id, label: t.name, amount: rng.step(20000, 300000, 10000) }));
    const out = rng
      .shuffle([
        { id: 'profitAndLoss', label: 'Profit and Loss A/c (debit balance)', amount: rng.step(10000, 60000, 5000) },
        { id: loanToPartner(p), label: `Loan to ${p}`, amount: rng.step(10000, 60000, 5000) },
        { id: 'advertisementSuspense', label: 'Advertisement Suspense A/c', amount: rng.step(5000, 30000, 5000) },
      ])
      .slice(0, rng.int(1, 2));
    const rows = [
      { id: 'cash', label: 'Cash in hand', amount: rng.step(3000, 30000, 1000) },
      { id: 'bank', label: 'Cash at bank', amount: rng.step(20000, 150000, 5000) },
      ...real,
      ...out,
    ];
    const debtors = real.find((r) => r.id === 'debtors');
    const provision = debtors && rng.int(0, 1) === 0 ? (debtors.amount / 100) * 5 : 0;
    const sum = total(real.map((r) => r.amount));
    return {
      prompt: `${f.intro} The assets side of its balance sheet on that date is given below${provision ? `; a provision for doubtful debts of ${inr(provision)} stood on the liabilities side` : ''}. Pass the journal entry that transfers the assets to Realisation A/c.\n${rows.map((r) => `${r.label}: ${inr(r.amount)}`).join('\n')}`,
      lines: [dr(REAL, sum), ...real.map((r) => cr(r.id, r.amount))],
      explanation: [
        `Transferred at book value: ${list(real.map((r) => r.label))}, in all ${inr(sum)}. Each asset account is credited and Realisation A/c is debited with the total.`,
        'Cash in hand and cash at bank are not transferred: they are already money.',
        ...out.map((o) =>
          o.id === 'profitAndLoss'
            ? "The debit balance of Profit and Loss A/c is a past loss, not an asset: it is debited to the partners' capital accounts."
            : o.id === 'advertisementSuspense'
              ? "Advertisement Suspense A/c is a fictitious asset that cannot be sold: it is debited to the partners' capital accounts."
              : `The loan to ${p} is not sold to anyone: it is set off against ${p}'s capital account.`,
        ),
        ...(provision ? [`Debtors go at their gross figure, ${inr(debtors!.amount)}. The provision of ${inr(provision)} is closed by a separate credit to Realisation A/c, with the liabilities.`] : []),
      ],
      distractorAccounts: [...out.map((o) => o.id), ...(provision ? ['provisionForDoubtfulDebts'] : [])],
      hints: ['Which of these can be turned into money by selling or collecting it?', 'Everything except cash, bank, fictitious assets (past losses) and a loan to a partner goes to the debit of Realisation A/c, at book value.'],
    };
  },
  verify: (q) => {
    const moved = figuresIn(q.prompt).filter(([label]) => !STAYS_OUT.test(label));
    return q.expected.length === moved.length + 1 && hasLine(q, REAL, 'Dr', total(moved.map(([, a]) => a))) && q.expected.every((l) => l.accountId === REAL || l.side === 'Cr');
  },
});

const journalTransferLiabilities = journalTemplate({
  id: 'dis-journal-transfer-liabilities', topicId: T, conceptId: C.realisation, difficulty: 'medium',
  generate: (rng) => {
    const f = firm(rng);
    const a = rng.pick(f.names);
    const r = relative(rng, a);
    const outside = [
      { id: 'creditors', label: 'Creditors', amount: rng.step(30000, 200000, 5000) },
      ...rng
        .shuffle([
          { id: 'billsPayable', label: 'Bills payable', amount: rng.step(10000, 80000, 5000) },
          { id: 'bankLoan', label: 'Bank loan', amount: rng.step(50000, 200000, 10000) },
          { id: 'outstandingExpenses', label: 'Outstanding expenses', amount: rng.step(3000, 20000, 1000) },
          { id: partnerLoan(r.name), label: `Loan from ${r.as}`, amount: rng.step(20000, 100000, 10000) },
          { id: 'provisionForDoubtfulDebts', label: 'Provision for doubtful debts', amount: rng.step(2000, 12000, 1000) },
          { id: 'providentFund', label: "Employees' Provident Fund", amount: rng.step(10000, 60000, 5000) },
        ])
        .slice(0, rng.int(2, 3)),
    ];
    const out = rng
      .shuffle([
        { id: partnerLoan(a), label: `${a}'s loan`, amount: rng.step(20000, 100000, 10000) },
        { id: 'generalReserve', label: 'General Reserve', amount: rng.step(10000, 80000, 5000) },
        { id: 'profitAndLoss', label: 'Profit and Loss A/c (credit balance)', amount: rng.step(10000, 60000, 5000) },
      ])
      .slice(0, rng.int(1, 2));
    const capitals = f.names.map((n) => ({ id: partnerCapital(n), label: `${n}'s capital`, amount: rng.step(100000, 400000, 50000) }));
    const rows = [...outside, ...out, ...capitals];
    const sum = total(outside.map((o) => o.amount));
    return {
      prompt: `${f.intro} The liabilities side of its balance sheet on that date is given below. Pass the one journal entry that transfers to Realisation A/c every balance on this side that goes there.\n${rows.map((x) => `${x.label}: ${inr(x.amount)}`).join('\n')}`,
      lines: [...outside.map((o) => dr(o.id, o.amount)), cr(REAL, sum)],
      explanation: [
        `Transferred: ${list(outside.map((o) => o.label))}, in all ${inr(sum)}. Each of these accounts is debited and Realisation A/c is credited with the total.`,
        ...outside.flatMap((o) =>
          o.id === 'provisionForDoubtfulDebts'
            ? ['The provision for doubtful debts is not a debt, but it stands against an asset: it is closed by transfer to the credit of Realisation A/c, where the debtors stand at their gross figure.']
            : o.id.startsWith('partnerLoan:')
              ? [`${r.name} is not a partner, so that loan is an outside liability.`]
              : [],
        ),
        ...out.map((o) =>
          o.id === 'generalReserve'
            ? "General Reserve is accumulated profit: it is credited to the partners' capital accounts."
            : o.id === 'profitAndLoss'
              ? "The credit balance of Profit and Loss A/c is undistributed profit: it is credited to the partners' capital accounts."
              : `${a}'s loan is a partner's own loan: it stays in its account and is repaid after the outside liabilities.`,
        ),
        'The capital accounts stay open until the final payment.',
      ],
      distractorAccounts: out.map((o) => o.id),
      hints: ['Which of these are owed to people outside the firm?', "Only outside liabilities (and provisions against assets) go to the credit of Realisation A/c. Reserves, capitals and a partner's own loan do not."],
    };
  },
  verify: (q) => {
    const moved = figuresIn(q.prompt).filter(([label]) => !STAYS_OUT.test(label));
    return q.expected.length === moved.length + 1 && hasLine(q, REAL, 'Cr', total(moved.map(([, x]) => x))) && q.expected.every((l) => l.accountId === REAL || l.side === 'Dr');
  },
});

const journalResult = journalTemplate({
  id: 'dis-journal-result', topicId: T, conceptId: C.realisation, difficulty: 'medium', computed: true,
  generate: (rng) => {
    const f = firm(rng);
    const result = f.sum * rng.step(1000, 9000, 500);
    const small = rng.step(250000, 800000, 10000);
    const profit = rng.int(0, 2) === 0;
    const [debit, credit] = profit ? [small, small + result] : [small + result, small];
    const shares = f.names.map((_, i) => shareOf(f, result, i));
    const working = `${f.names.map((n, i) => `${n} ${fraction(f, i)} x ${inr(result)} = ${inr(shares[i])}`).join('; ')}.`;
    return {
      prompt: `${f.intro} ${FLUCTUATING} When every asset had been realised and every liability settled, the debit side of Realisation A/c came to ${inr(debit)} and the credit side to ${inr(credit)}. Pass the journal entry that closes Realisation A/c.`,
      lines: profit
        ? [dr(REAL, result), ...f.names.map((n, i) => cr(partnerCapital(n), shares[i]))]
        : [...f.names.map((n, i) => dr(partnerCapital(n), shares[i])), cr(REAL, result)],
      explanation: profit
        ? [
            `The credit side is heavier, so there is a profit: ${inr(credit)} - ${inr(debit)} = ${inr(result)}.`,
            `It is shared in the profit-sharing ratio: ${working}`,
            'Realisation A/c is debited to close it and each capital account is credited with its share.',
          ]
        : [
            `The debit side is heavier, so there is a loss: ${inr(debit)} - ${inr(credit)} = ${inr(result)}.`,
            `It is shared in the profit-sharing ratio: ${working}`,
            'Each capital account is debited with its share and Realisation A/c is credited to close it.',
          ],
      distractorAccounts: ['profitAndLoss', 'profitAndLossAppropriation'],
      hints: H.realisation,
    };
  },
  verify: (q) => {
    const [debit, credit] = amountsIn(q.prompt);
    const side = credit > debit ? 'Cr' : 'Dr';
    return hasLine(q, REAL, side === 'Cr' ? 'Dr' : 'Cr', Math.abs(credit - debit)) && namesIn(q.prompt).every((n) => hasLine(q, partnerCapital(n), side, shareIn(q.prompt, n, Math.abs(credit - debit))));
  },
});

const finalPayment = numericTemplate({
  id: 'dis-final-payment', topicId: T, conceptId: C.closing, difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const i = rng.int(0, f.names.length - 1);
    const x = f.names[i];
    const capital = rng.step(100000, 400000, 10000);
    const reserve = f.sum * rng.step(2000, 10000, 1000);
    const result = f.sum * rng.step(1000, 8000, 500) * (rng.int(0, 2) === 0 ? 1 : -1);
    const t = rng.pick(HANDY);
    const taken = rng.step(10000, 60000, 5000);
    const loan = rng.int(0, 1) === 0 ? rng.step(20000, 80000, 10000) : 0;
    const paidFor = rng.int(0, 2) === 0 ? rng.step(2000, 9000, 1000) : 0;
    const myReserve = shareOf(f, reserve, i);
    const myResult = shareOf(f, result, i);
    const final = capital + myReserve + myResult - taken + paidFor;
    if (final < 5000) return null;
    const word = result > 0 ? 'profit' : 'loss';
    const rows = [
      `${x}'s capital: ${inr(capital)}`,
      `General Reserve of the firm: ${inr(reserve)}`,
      `${cap(word)} on realisation, for the firm as a whole: ${inr(Math.abs(result))}`,
      `${t.name} taken over by ${x} at: ${inr(taken)}`,
      ...(paidFor ? [`Realisation expenses paid by ${x} for the firm, already debited to Realisation A/c: ${inr(paidFor)}`] : []),
      ...(loan ? [`${x}'s loan to the firm, repaid by cheque before the capitals: ${inr(loan)}`] : []),
    ];
    const n = numeric(final, [
      [final + taken, 'Left out the asset taken over, which is debited to the capital account.'],
      [final + 2 * taken, 'Added the value of the asset taken over instead of deducting it.'],
      [final - myReserve, 'Left out the share of General Reserve, which is credited to the capital account.'],
      [capital + reserve + result - taken + paidFor, `Took the whole reserve and the whole ${word} of the firm instead of ${x}'s share of each.`],
      [final - 2 * myResult, result > 0 ? 'Deducted the share of the profit on realisation instead of adding it.' : 'Added the share of the loss on realisation instead of deducting it.'],
      ...(loan ? [[final + loan, `Added ${x}'s loan; it was repaid by itself and is no part of the capital account.`] as [number, string]] : []),
      ...(paidFor ? [[final - paidFor, `Left out the expenses ${x} paid for the firm, which the firm owes back to ${x}.`] as [number, string]] : []),
    ]);
    return n && {
      prompt: `${f.intro} ${FLUCTUATING} From the figures below, find the amount finally paid to ${x} to close ${x}'s Capital A/c.\n${rows.join('\n')}`,
      ...n,
      explanation: [
        `Credit side of ${x}'s Capital A/c: balance ${inr(capital)}; share of General Reserve ${fraction(f, i)} x ${inr(reserve)} = ${inr(myReserve)}${result > 0 ? `; share of profit on realisation ${fraction(f, i)} x ${inr(result)} = ${inr(myResult)}` : ''}${paidFor ? `; expenses paid for the firm ${inr(paidFor)}` : ''}.`,
        `Debit side: ${t.name.toLowerCase()} taken over ${inr(taken)}${result < 0 ? `; share of loss on realisation ${fraction(f, i)} x ${inr(-result)} = ${inr(-myResult)}` : ''}.`,
        ...(loan ? [`${x}'s loan of ${inr(loan)} is not part of the capital account: it was repaid separately.`] : []),
        `Balance paid to ${x} = ${inr(capital + myReserve + Math.max(myResult, 0) + paidFor)} - ${inr(taken + Math.max(-myResult, 0))} = ${inr(final)}.`,
      ],
      hints: H.closing,
    };
  },
  verify: (q) => {
    const x = /paid to ([A-Z][a-z]+) to close/.exec(q.prompt)?.[1] ?? '';
    let sum = 0;
    for (const [label, amount] of figuresIn(q.prompt)) {
      if (label.endsWith("'s capital") || label.startsWith('Realisation expenses paid by')) sum += amount;
      else if (label.startsWith('General Reserve') || label.startsWith('Profit on realisation')) sum += shareIn(q.prompt, x, amount);
      else if (label.startsWith('Loss on realisation')) sum -= shareIn(q.prompt, x, amount);
      else if (label.includes('taken over by')) sum -= amount;
    }
    return q.answer === rupees(sum);
  },
});

const settleOrBring = mcqTemplate({
  id: 'dis-settle-or-bring', topicId: T, conceptId: C.closing, difficulty: 'medium',
  generate: (rng) => {
    const f = firm(rng);
    const i = rng.int(0, f.names.length - 1);
    const x = f.names[i];
    const capital = rng.step(20000, 120000, 5000);
    const loss = f.sum * rng.step(3000, 15000, 1000);
    const t = rng.pick(HANDY);
    const taken = rng.step(10000, 60000, 5000);
    const mine = shareOf(f, loss, i);
    const final = capital - mine - taken;
    if (final === 0) return null;
    const say = (n: number): string => (n > 0 ? `The firm pays ${x} ${inr(n)}` : n < 0 ? `${x} brings in ${inr(-n)}` : `Nothing is paid to ${x} or brought in by ${x}`);
    return choice(
      `${f.intro} ${FLUCTUATING} ${x}'s Capital A/c had a credit balance of ${inr(capital)}. The loss on realisation, for the firm as a whole, was ${inr(loss)}, and ${x} took over ${t.the} at ${inr(taken)}. How is ${x}'s Capital A/c closed?`,
      say(final),
      [
        [say(-final), final > 0 ? 'Read a credit balance as an amount the partner owes; a credit balance is paid out to the partner.' : 'Read a debit balance as an amount due to the partner; a debit balance has to be brought in.'],
        [say(final + taken), 'Left out the asset taken over, which is debited to the capital account.'],
        [say(capital - loss - taken), `Charged the whole loss of the firm to ${x} instead of ${x}'s share.`],
        [say(final + 2 * taken), 'Added the value of the asset taken over instead of deducting it.'],
      ],
      `${x}'s share of the loss = ${fraction(f, i)} x ${inr(loss)} = ${inr(mine)}. Balance = ${inr(capital)} - ${inr(mine)} - ${inr(taken)} = ${final > 0 ? `${inr(final)} (credit), which the firm pays to ${x}` : `${inr(-final)} (debit), which ${x} brings in`}.`,
      H.closing,
    );
  },
  verify: (q) => {
    const [capital, loss, taken] = amountsIn(q.prompt);
    const x = /([A-Z][a-z]+)'s Capital A\/c had/.exec(q.prompt)?.[1] ?? '';
    const final = capital - shareIn(q.prompt, x, loss) - taken;
    const answer = optionText(q);
    return amountsIn(answer)[0] === Math.abs(final) && answer.startsWith('The firm pays') === final > 0;
  },
});

const cashForPartners = numericTemplate({
  id: 'dis-cash-for-partners', topicId: T, conceptId: C.closing, difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const [a, b] = f.names;
    const opening = rng.step(10000, 90000, 5000);
    const sold = rng.step(200000, 700000, 10000);
    const extra = rng.int(0, 1) === 0 ? rng.step(2000, 15000, 1000) : 0;
    const t = rng.pick(HANDY);
    const taken = rng.int(0, 1) === 0 ? rng.step(20000, 80000, 5000) : 0;
    const creditors = rng.step(50000, 180000, 5000);
    const expenses = rng.step(2000, 12000, 500);
    const loan = rng.int(0, 1) === 0 ? rng.step(20000, 80000, 10000) : 0;
    const answer = opening + sold + extra - creditors - expenses - loan;
    const rows = [
      `Balance at bank on the date of dissolution: ${inr(opening)}`,
      `Assets sold, proceeds banked: ${inr(sold)}`,
      ...(extra ? [`Unrecorded asset sold, proceeds banked: ${inr(extra)}`] : []),
      ...(taken ? [`${t.name} taken over by ${b} at: ${inr(taken)}`] : []),
      `Creditors paid by cheque: ${inr(creditors)}`,
      `Realisation expenses paid by the firm: ${inr(expenses)}`,
      ...(loan ? [`${a}'s loan repaid by cheque: ${inr(loan)}`] : []),
    ];
    const n = numeric(answer, [
      [answer - opening, 'Left out the opening balance at bank, which is the first item on the debit side of Bank A/c.'],
      ...(taken ? [[answer + taken, 'Counted the asset taken over by a partner as money received; it is debited to the capital account and no cash comes in.'] as [number, string]] : []),
      ...(loan ? [[answer + loan, "Left out the repayment of the partner's loan, which is made before anything is paid on the capitals."] as [number, string]] : []),
      [answer + expenses, 'Left out the realisation expenses paid by the firm.'],
      ...(extra ? [[answer - extra, 'Left out the money received for the unrecorded asset.'] as [number, string]] : []),
    ]);
    return n && {
      prompt: `${f.intro} Bank A/c is to be written up from the figures below. How much is left in the bank to be paid to the partners on their capital accounts?\n${rows.join('\n')}`,
      ...n,
      explanation: [
        `Debit side (money in): ${inr(opening)} + ${inr(sold)}${extra ? ` + ${inr(extra)}` : ''} = ${inr(opening + sold + extra)}.`,
        ...(taken ? [`No money is received for the ${t.name.toLowerCase()} taken over by ${b}, so that item is not in Bank A/c.`] : []),
        `Credit side before the partners are paid: ${inr(creditors)} + ${inr(expenses)}${loan ? ` + ${inr(loan)}` : ''} = ${inr(creditors + expenses + loan)}.`,
        `Left for the partners' capitals = ${inr(opening + sold + extra)} - ${inr(creditors + expenses + loan)} = ${inr(answer)}.`,
      ],
      hints: ['Bank A/c: opening balance and every receipt on the debit; every payment on the credit.', 'An asset taken over by a partner never passes through Bank A/c.'],
    };
  },
  verify: (q) => {
    let sum = 0;
    for (const [label, amount] of figuresIn(q.prompt)) sum += label.includes('taken over') ? 0 : /paid/.test(label) ? -amount : amount;
    return q.answer === rupees(sum);
  },
});

const totalToPartner = numericTemplate({
  id: 'dis-total-to-partner', topicId: T, conceptId: C.settlement, difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng, { unequal: true });
    const n = f.names.length;
    const lender = rng.int(0, n - 1);
    const i = rng.int(0, 1) === 0 ? lender : rng.int(0, n - 1);
    const x = f.names[i];
    const creditors = rng.step(40000, 200000, 10000);
    const loan = rng.step(20000, 100000, 10000);
    const caps = f.names.map(() => rng.step(80000, 300000, 10000));
    const surplus = rng.int(0, 3) === 0 ? -f.sum * rng.step(1000, 5000, 1000) : f.sum * rng.step(2000, 12000, 1000);
    const cash = creditors + loan + total(caps) + surplus;
    // Nobody is to end up owing the firm: every capital covers its share of a shortfall.
    if (f.names.some((_, k) => caps[k] + shareOf(f, surplus, k) <= 0)) return null;
    const mine = shareOf(f, surplus, i);
    const own = i === lender ? loan : 0;
    const answer = own + caps[i] + mine;
    const word = surplus > 0 ? 'surplus' : 'shortfall';
    const num = numeric(answer, [
      ...(own ? [[answer - loan, `Left out ${x}'s loan, which is repaid to ${x} before any capital is returned.`] as [number, string]] : []),
      ...(own ? [] : [[caps[i] + shareOf(f, surplus + loan, i), `Shared the money for ${f.names[lender]}'s loan among all the partners; it goes to the lender alone, before the capitals.`] as [number, string]]),
      [own + shareOf(f, cash - creditors - loan, i), `Shared all the cash left after the debts and the loan in the profit-sharing ratio; the capitals are returned first and only the ${word} is shared.`],
      [own + caps[i], `Stopped at the capital; ${x}'s share of the ${word} of ${inr(Math.abs(surplus))} was not taken into account.`],
      [answer - 2 * mine, surplus > 0 ? 'Deducted the share of the surplus instead of adding it.' : 'Added the share of the shortfall instead of deducting it.'],
      [own + caps[i] + surplus / n, `Shared the ${word} equally instead of in the profit-sharing ratio.`],
    ]);
    return num && {
      prompt: `${f.intro} After all the assets had been realised and the realisation expenses paid, the position was as below; the capitals are as they stood before the profit or loss on realisation was transferred to them. Following the order laid down in section 48 of the Indian Partnership Act, 1932, how much does ${x} receive in all?\nCash at bank: ${inr(cash)}\nCreditors: ${inr(creditors)}\n${f.names[lender]}'s loan to the firm: ${inr(loan)}\n${f.names.map((nm, k) => `${nm}'s capital: ${inr(caps[k])}`).join('\n')}`,
      ...num,
      explanation: [
        `1. Debts due to outsiders: creditors ${inr(creditors)}. Cash left: ${inr(cash - creditors)}.`,
        `2. Loans from partners: ${f.names[lender]} ${inr(loan)}. Cash left: ${inr(cash - creditors - loan)}.`,
        `3. Capitals: ${inr(total(caps))} in all.`,
        surplus > 0
          ? `4. Surplus = ${inr(cash - creditors - loan)} - ${inr(total(caps))} = ${inr(surplus)}, shared ${f.ratio.join(':')}. ${x}'s share = ${fraction(f, i)} x ${inr(surplus)} = ${inr(mine)}.`
          : `4. The cash left is ${inr(-surplus)} short of the capitals. This shortfall is a loss, borne ${f.ratio.join(':')}. ${x}'s share = ${fraction(f, i)} x ${inr(-surplus)} = ${inr(-mine)}, deducted from ${x}'s capital.`,
        `${x} receives ${own ? `loan ${inr(loan)} + ` : ''}capital ${inr(caps[i])} ${mine > 0 ? '+' : '-'} ${inr(Math.abs(mine))} = ${inr(answer)}.`,
      ],
      hints: H.order,
    };
  },
  verify: (q) => {
    const x = /how much does ([A-Z][a-z]+) receive/.exec(q.prompt)?.[1] ?? '';
    const figures = figuresIn(q.prompt);
    const of = (test: (label: string) => boolean) => total(figures.filter(([label]) => test(label)).map(([, a]) => a));
    const surplus = of((l) => l === 'Cash at bank') - of((l) => l !== 'Cash at bank');
    const mine = of((l) => l === `${x}'s capital` || l === `${x}'s loan to the firm`);
    return q.answer === rupees(mine + shareIn(q.prompt, x, surplus));
  },
});

// ===============================================================================================================
// COMPLEX: one dissolution, from the balance sheet to the last payment
// ===============================================================================================================

interface Scenario {
  f: Firm;
  capitals: number[];
  bank: number;
  /**
   * `cash` is the money an asset fetched and `taken` the value at which a partner took it over. An asset the
   * creditors accepted has neither. The first asset is the main one, whose price is settled last.
   */
  assets: { id: string; label: string; book: number; cash: number; taken?: { by: number; at: number } }[];
  provision: number;
  /** `cash` is what was paid to settle the liability. */
  liabs: { id: string; label: string; book: number; cash: number }[];
  reserve: number;
  /** A partner's own loan to the firm. */
  loan: { by: number; amount: number } | null;
  /** An asset that was not in the books: sold for cash, or taken over by a partner. */
  extraAsset: { cash: number; taken?: { by: number; at: number } } | null;
  /** A liability that was not in the books, paid by cheque; 0 when there is none. */
  extraLiab: number;
  /** What Realisation A/c bears for expenses, what the firm's bank paid, and what a partner is credited or debited with. */
  exp: { label: string; charge: number; firmPays: number; credit?: { to: number; amount: number }; debit?: { to: number; amount: number } };
  /** What happened on dissolution, one item to a line; `mainAt` is the line that tells the sale of the main asset. */
  info: string[];
  main: Thing;
  mainAt: number;
  /** Points of treatment for the working. */
  notes: string[];
  /** For the wrong answers: what each classic slip adds to the result on realisation, and the slip. */
  slips: [number, string][];
  /** Slips about money: what each adds to the receipts of Bank A/c. */
  bankSlips: [number, string][];
}

/** The profit (positive) or loss (negative) on realisation, straight from the items. */
const resultOf = (s: Scenario): number =>
  total(s.liabs.map((l) => l.book - l.cash)) +
  s.provision +
  total(s.assets.map((a) => a.cash + (a.taken?.at ?? 0) - a.book)) +
  (s.extraAsset ? s.extraAsset.cash + (s.extraAsset.taken?.at ?? 0) : 0) -
  s.extraLiab -
  s.exp.charge;

/** What partner `i` took over, in all. */
const takenBy = (s: Scenario, i: number): number =>
  total(s.assets.filter((a) => a.taken?.by === i).map((a) => a.taken!.at)) + (s.extraAsset?.taken?.by === i ? s.extraAsset.taken.at : 0);

/** The balance of each capital account when everything but the final payment is done. */
const finalsOf = (s: Scenario): number[] =>
  s.f.names.map(
    (_, i) =>
      s.capitals[i] + shareOf(s.f, s.reserve, i) + shareOf(s.f, resultOf(s), i) - takenBy(s, i) +
      (s.exp.credit?.to === i ? s.exp.credit.amount : 0) - (s.exp.debit?.to === i ? s.exp.debit.amount : 0),
  );

/** Everything that comes into the bank, the opening balance included. */
const receiptsOf = (s: Scenario): number => s.bank + total(s.assets.map((a) => a.cash)) + (s.extraAsset?.cash ?? 0);

/**
 * The same dissolution worked the long way, for `verify`: the balance sheet is opened in a ledger, every entry of
 * the dissolution is posted, and the result, the capital balances and the receipts of the bank are read off the
 * accounts. `closed` says that the final payment leaves no balance anywhere, which is the test that the books agree.
 */
function ledgerOf(s: Scenario): { result: number; finals: number[]; bankIn: number; closed: boolean } {
  const capital = (i: number) => partnerCapital(s.f.names[i]);
  const entries: JournalLine[][] = [
    [
      dr('bank', s.bank),
      ...s.assets.map((a) => dr(a.id, a.book)),
      ...s.liabs.map((l) => cr(l.id, l.book)),
      ...(s.provision ? [cr('provisionForDoubtfulDebts', s.provision)] : []),
      ...(s.reserve ? [cr('generalReserve', s.reserve)] : []),
      ...(s.loan ? [cr(partnerLoan(s.f.names[s.loan.by]), s.loan.amount)] : []),
      ...s.capitals.map((k, i) => cr(capital(i), k)),
    ],
  ];
  const sidesAgree = total(entries[0].map((l) => (l.side === 'Dr' ? l.amount : -l.amount))) === 0;
  for (const a of s.assets) {
    entries.push([dr(REAL, a.book), cr(a.id, a.book)]);
    if (a.cash) entries.push([dr('bank', a.cash), cr(REAL, a.cash)]);
    if (a.taken) entries.push([dr(capital(a.taken.by), a.taken.at), cr(REAL, a.taken.at)]);
  }
  for (const l of s.liabs) {
    entries.push([dr(l.id, l.book), cr(REAL, l.book)]);
    if (l.cash) entries.push([dr(REAL, l.cash), cr('bank', l.cash)]);
  }
  if (s.provision) entries.push([dr('provisionForDoubtfulDebts', s.provision), cr(REAL, s.provision)]);
  if (s.extraAsset?.cash) entries.push([dr('bank', s.extraAsset.cash), cr(REAL, s.extraAsset.cash)]);
  if (s.extraAsset?.taken) entries.push([dr(capital(s.extraAsset.taken.by), s.extraAsset.taken.at), cr(REAL, s.extraAsset.taken.at)]);
  if (s.extraLiab) entries.push([dr(REAL, s.extraLiab), cr('bank', s.extraLiab)]);
  entries.push(s.exp.credit ? [dr(REAL, s.exp.credit.amount), cr(capital(s.exp.credit.to), s.exp.credit.amount)] : [dr(REAL, s.exp.charge), cr('bank', s.exp.charge)]);
  if (s.exp.debit) entries.push([dr(capital(s.exp.debit.to), s.exp.debit.amount), cr('bank', s.exp.debit.amount)]);
  if (s.reserve) entries.push([dr('generalReserve', s.reserve), ...s.f.names.map((_, i) => cr(capital(i), shareOf(s.f, s.reserve, i)))]);
  if (s.loan) entries.push([dr(partnerLoan(s.f.names[s.loan.by]), s.loan.amount), cr('bank', s.loan.amount)]);

  const signed = (ledger: Map<string, number>, id: string): number => {
    const b = balanceOf(ledger, id);
    return b ? (b.side === 'Cr' ? b.amount : -b.amount) / 100 : 0;
  };
  let ledger = post(entries);
  const result = signed(ledger, REAL);
  const shares = s.f.names.map((_, i) => shareOf(s.f, Math.abs(result), i));
  if (result > 0) ledger = post([[dr(REAL, result), ...shares.map((x, i) => cr(capital(i), x))]], ledger);
  if (result < 0) ledger = post([[...shares.map((x, i) => dr(capital(i), x)), cr(REAL, -result)]], ledger);
  const finals = s.f.names.map((_, i) => signed(ledger, capital(i)));
  ledger = post([[...finals.map((x, i) => dr(capital(i), x)), cr('bank', total(finals))]], ledger);
  const bankIn = total(entries.flat().filter((l) => l.accountId === 'bank' && l.side === 'Dr').map((l) => l.amount)) / 100;
  return { result, finals, bankIn, closed: sidesAgree && finals.every((x) => x > 0) && [...ledger.values()].every((v) => v === 0) };
}

/** One whole dissolution: a balance sheet and five to eight things that happen to it. Null for a combination that does not work out. */
function dissolve(rng: Rng): Scenario | null {
  const f = firm(rng);
  const n = f.names.length;
  const who = (i: number): string => f.names[i];
  const assets: Scenario['assets'] = [];
  const liabs: Scenario['liabs'] = [];
  const info: string[] = [];
  const notes: string[] = [];
  const slips: [number, string][] = [];
  const bankSlips: [number, string][] = [];

  // The main fixed asset is sold. Its price is settled at the end, so that every partner's share is in whole rupees.
  const main = rng.pick([TANGIBLE[1], TANGIBLE[3], TANGIBLE[4]]);
  const mainBook = rng.step(100000, 400000, 10000);
  assets.push({ id: main.id, label: main.name, book: mainBook, cash: 0 });
  const mainAt = info.length;
  info.push('');

  const stock = rng.step(40000, 160000, 10000);
  const stockAt = stock + (stock / 100) * rng.pick([-20, -10, 10]);
  if (rng.int(0, 1) === 0) {
    const by = rng.int(0, n - 1);
    assets.push({ id: 'stock', label: 'Stock', book: stock, cash: 0, taken: { by, at: stockAt } });
    info.push(`${who(by)} took over the stock at ${inr(stockAt)}.`);
    slips.push([-stockAt, `Left out the stock taken over by ${who(by)}, which is credited to Realisation A/c like a sale.`]);
    bankSlips.push([stockAt, `Entered the stock taken over by ${who(by)} in Bank A/c, though no money was received for it.`]);
  } else {
    assets.push({ id: 'stock', label: 'Stock', book: stock, cash: stockAt });
    info.push(`The stock was sold for ${inr(stockAt)}.`);
  }

  const debtors = rng.step(60000, 200000, 10000);
  const provision = rng.int(0, 2) > 0 ? rng.step(2000, 10000, 1000) : 0;
  const bad = rng.step(1000, 12000, 1000);
  assets.push({ id: 'debtors', label: 'Debtors', book: debtors, cash: debtors - bad });
  info.push(rng.pick([`The debtors realised ${inr(debtors - bad)}.`, `Bad debts came to ${inr(bad)}; the remaining debtors paid in full.`]));
  if (provision) {
    slips.push([-provision, 'Left the provision for doubtful debts out of the credit side of Realisation A/c.']);
    notes.push(`Debtors are debited at their gross figure, ${inr(debtors)}, and the provision of ${inr(provision)} is credited.`);
  }

  // A second fixed asset: nothing is said about it, or the creditors accept it, or a partner takes it over.
  const second = rng.pick([TANGIBLE[2], TANGIBLE[5], TANGIBLE[6]]);
  const secondBook = rng.step(20000, 80000, 5000);
  const secondHow = rng.pick(['silent', 'creditor', 'partner'] as const);
  let creditors = rng.step(50000, 150000, 5000);
  let creditorsPaid = creditors;
  if (secondHow === 'creditor') {
    const at = secondBook + rng.pick([-5000, 5000]);
    creditors = at + rng.step(10000, 60000, 5000);
    creditorsPaid = creditors - at;
    assets.push({ id: second.id, label: second.name, book: secondBook, cash: 0 });
    info.push(`The creditors accepted ${second.the} at ${inr(at)} and were paid the balance of their claim by cheque.`);
    notes.push(`No entry is passed for ${second.the} given to the creditors: only the balance paid to them, ${inr(creditors)} - ${inr(at)} = ${inr(creditorsPaid)}, is debited.`);
    slips.push([at, `Credited Realisation A/c with ${second.the} given to the creditors as well as paying them only the balance; no entry is passed for the asset.`]);
    slips.push([-at, `Paid the creditors in full by cheque, ignoring ${second.the} they had accepted.`]);
    bankSlips.push([at, `Entered ${second.the} given to the creditors as a receipt in Bank A/c; no money came in for ${second.plural ? 'them' : 'it'}.`]);
  } else {
    if (secondHow === 'partner') {
      const by = rng.int(0, n - 1);
      const at = secondBook + rng.pick([-5000, 0, 5000]);
      assets.push({ id: second.id, label: second.name, book: secondBook, cash: 0, taken: { by, at } });
      info.push(`${who(by)} took over ${second.the} at ${inr(at)}.`);
      slips.push([-at, `Left out ${second.the} taken over by ${who(by)}, which ${second.plural ? 'are' : 'is'} credited to Realisation A/c like a sale.`]);
      bankSlips.push([at, `Entered ${second.the} taken over by ${who(by)} in Bank A/c, though no money was received.`]);
    } else {
      assets.push({ id: second.id, label: second.name, book: secondBook, cash: secondBook });
      notes.push(`Nothing is said about ${second.the}, a tangible asset, so ${second.plural ? 'they are' : 'it is'} taken as realised at book value, ${inr(secondBook)}.`);
      slips.push([-secondBook, `Took ${second.the} as fetching nothing; a tangible asset whose realised value is not given is taken at book value.`]);
      bankSlips.push([-secondBook, `Left out ${second.the}, which ${second.plural ? 'are' : 'is'} taken as sold at book value.`]);
    }
    if (rng.int(0, 1) === 0) {
      const off = rng.step(1000, 5000, 1000);
      creditorsPaid = creditors - off;
      info.push(`The creditors were paid ${inr(creditorsPaid)} in full settlement.`);
      slips.push([-off, 'Paid the creditors their full book figure, missing the discount they allowed.']);
    }
  }
  liabs.push({ id: 'creditors', label: 'Creditors', book: creditors, cash: creditorsPaid });

  if (rng.int(0, 2) === 0) {
    const t = rng.pick(INTANGIBLE);
    const book = rng.step(10000, 40000, 5000);
    assets.push({ id: t.id, label: t.name, book, cash: 0 });
    notes.push(`Nothing is said about ${t.the}, an intangible asset, so ${t.plural ? 'they are' : 'it is'} taken to realise nothing.`);
    slips.push([book, `Took ${t.the} as realised at book value; an intangible asset whose realised value is not given fetches nothing.`]);
    bankSlips.push([book, `Entered ${t.the} as sold at book value; an intangible asset whose realised value is not given fetches nothing.`]);
  }
  if (rng.int(0, 2) === 0) {
    const owed = rng.step(10000, 50000, 5000);
    liabs.push({ id: 'billsPayable', label: 'Bills payable', book: owed, cash: owed });
  }
  if (rng.int(0, 3) === 0) {
    const r = relative(rng, who(rng.int(0, n - 1)));
    const owed = rng.step(20000, 60000, 10000);
    liabs.push({ id: partnerLoan(r.name), label: `Loan from ${r.as}`, book: owed, cash: owed });
    notes.push(`${r.name} is not a partner, so that loan is an outside liability: it is credited to Realisation A/c and its repayment debited.`);
  }
  const loan = rng.int(0, 2) === 0 ? { by: rng.int(0, n - 1), amount: rng.step(20000, 60000, 10000) } : null;
  if (loan) notes.push(`${who(loan.by)}'s loan stays out of Realisation A/c: it is repaid by itself, after the outside liabilities.`);
  const reserve = rng.int(0, 1) === 0 ? f.sum * rng.step(2000, 8000, 1000) : 0;
  if (reserve) {
    notes.push('General Reserve stays out of Realisation A/c: it is credited to the capital accounts in the profit-sharing ratio.');
    slips.push([reserve, "Credited General Reserve to Realisation A/c; it goes straight to the partners' capital accounts."]);
  }

  let extraAsset: Scenario['extraAsset'] = null;
  if (rng.int(0, 2) === 0) {
    const v = rng.step(2000, 15000, 1000);
    if (rng.int(0, 1) === 0) {
      extraAsset = { cash: v };
      info.push(rng.pick([`An old generator, written off in an earlier year, was sold for ${inr(v)}.`, `Investments that were not shown in the books realised ${inr(v)}.`]));
      bankSlips.push([-v, 'Left out the money received for the unrecorded asset.']);
    } else {
      const by = rng.int(0, n - 1);
      extraAsset = { cash: 0, taken: { by, at: v } };
      info.push(`${who(by)} took over an old generator, written off in an earlier year, at ${inr(v)}.`);
    }
    slips.push([-v, 'Left out the unrecorded asset, the whole of which is a gain credited to Realisation A/c.']);
  }
  let extraLiab = 0;
  if (rng.int(0, 2) === 0) {
    extraLiab = rng.step(2000, 10000, 1000);
    info.push(rng.pick([`A claim for damages of ${inr(extraLiab)}, not recorded in the books, was paid.`, `A repairs bill of ${inr(extraLiab)}, not recorded in the books, was paid.`]));
    slips.push([extraLiab, 'Left out the unrecorded liability that was paid, which is debited to Realisation A/c.']);
  }

  const actual = rng.step(2000, 10000, 1000);
  const fee = actual + rng.pick([-1000, 1000, 2000, 3000, 5000]);
  const j = rng.int(0, n - 1);
  const form = rng.int(0, 3);
  let exp: Scenario['exp'];
  if (form === 0) {
    exp = { label: 'realisation expenses', charge: actual, firmPays: actual };
    info.push(`Realisation expenses of ${inr(actual)} were paid by the firm.`);
    slips.push([actual, 'Left out the realisation expenses paid by the firm.']);
  } else if (form === 1) {
    exp = { label: `realisation expenses, paid by ${who(j)} for the firm,`, charge: actual, firmPays: 0, credit: { to: j, amount: actual } };
    info.push(`Realisation expenses of ${inr(actual)}, which the firm was to bear, were paid by ${who(j)} out of ${who(j)}'s own money.`);
    slips.push([actual, `Left out the expenses ${who(j)} paid for the firm; they are a cost of the firm all the same.`]);
  } else {
    const firmPaid = form === 3;
    exp = {
      label: `remuneration to ${who(j)} (the actual expenses are ${who(j)}'s own)`, charge: fee, firmPays: firmPaid ? actual : 0,
      credit: { to: j, amount: fee }, ...(firmPaid ? { debit: { to: j, amount: actual } } : {}),
    };
    info.push(`${who(j)} was to bear the realisation expenses for a remuneration of ${inr(fee)}. The expenses, ${inr(actual)}, were paid ${firmPaid ? `by the firm on ${who(j)}'s behalf` : `by ${who(j)} personally`}.`);
    slips.push([fee - actual, 'Charged Realisation A/c with the actual expenses instead of the agreed remuneration.']);
    slips.push([-actual, 'Charged Realisation A/c with the actual expenses as well as the remuneration.']);
  }

  // A board question of this size gives at least five things to deal with.
  if (info.length < 5) return null;

  // The bank balance makes the capitals come to a round total.
  const before = total(assets.map((a) => a.book)) - total(liabs.map((l) => l.book)) - provision - reserve - (loan?.amount ?? 0);
  const bankBase = rng.step(15000, 60000, 5000);
  const bank = bankBase + ((10000 - ((before + bankBase) % 10000)) % 10000);
  const capTotal = before + bank;
  if (capTotal < n * 60000) return null;
  const capitals: number[] = [];
  for (let i = 0; i < n - 1; i++) capitals.push(Math.round((capTotal * rng.pick(n === 2 ? [0.4, 0.5, 0.6] : [0.3, 0.35, 0.4])) / 10000) * 10000);
  capitals.push(capTotal - total(capitals));

  const s: Scenario = { f, capitals, bank, assets, provision, liabs, reserve, loan, extraAsset, extraLiab, exp, info, main, mainAt, notes, slips, bankSlips };
  const base = mainBook + (mainBook / 100) * rng.pick([-20, -10, 10, 20]);
  assets[0].cash = base;
  const draft = resultOf(s);
  let k = 0;
  while (k < f.sum && (((draft - k * 1000) % f.sum) + f.sum) % f.sum !== 0) k++;
  if (k === f.sum) return null;
  assets[0].cash = base - k * 1000;
  info[mainAt] = `${cap(main.the)} ${was(main)} sold for ${inr(assets[0].cash)}.`;
  if (resultOf(s) === 0 || finalsOf(s).some((x) => x < 5000)) return null;
  return s;
}

/** The balance sheet of a scenario, a heading and then one balance to a line. */
const sheetOf = (s: Scenario): string =>
  [
    'Liabilities:',
    ...s.liabs.map((l) => `${l.label}: ${inr(l.book)}`),
    ...(s.loan ? [`${s.f.names[s.loan.by]}'s loan: ${inr(s.loan.amount)}`] : []),
    ...(s.provision ? [`Provision for doubtful debts: ${inr(s.provision)}`] : []),
    ...(s.reserve ? [`General Reserve: ${inr(s.reserve)}`] : []),
    ...s.f.names.map((nm, i) => `${nm}'s capital: ${inr(s.capitals[i])}`),
    'Assets:',
    `Cash at bank: ${inr(s.bank)}`,
    ...s.assets.map((a) => `${a.label}: ${inr(a.book)}`),
  ].join('\n');
const SILENT = 'An asset about which nothing is said realised its book value if it is tangible and nothing if it is intangible. A liability about which nothing is said was paid in full.';
const eventsOf = (info: readonly string[]): string => ['On dissolution:', ...info.map((t, i) => `${ROMAN[i]} ${t}`), SILENT].join('\n');

/** The two sides of Realisation A/c written out, with the points of treatment, as the working of a complex question. */
function realisationWorking(s: Scenario, withoutMain = false): { lines: string[]; debit: number; credit: number } {
  const paid = s.liabs.filter((l) => l.cash > 0);
  const sold = s.assets.filter((a, k) => a.cash > 0 && !(withoutMain && k === 0));
  const took = s.assets.filter((a) => a.taken);
  const debit = total(s.assets.map((a) => a.book)) + total(s.liabs.map((l) => l.cash)) + s.extraLiab + s.exp.charge;
  const credit = total(s.liabs.map((l) => l.book)) + s.provision + total(s.assets.map((a) => a.cash + (a.taken?.at ?? 0))) + (s.extraAsset ? s.extraAsset.cash + (s.extraAsset.taken?.at ?? 0) : 0);
  const lines = [
    `Debit, assets transferred at book value: ${s.assets.map((a) => `${low(a.label)} ${inr(a.book)}`).join(', ')} = ${inr(total(s.assets.map((a) => a.book)))}.`,
    `Debit, liabilities paid: ${[...paid.map((l) => `${low(l.label)} ${inr(l.cash)}`), ...(s.extraLiab ? [`unrecorded liability ${inr(s.extraLiab)}`] : [])].join(', ')}; and ${s.exp.label} ${inr(s.exp.charge)}.`,
    `Total debit = ${inr(debit)}.`,
    `Credit, liabilities transferred: ${[...s.liabs.map((l) => `${low(l.label)} ${inr(l.book)}`), ...(s.provision ? [`provision for doubtful debts ${inr(s.provision)}`] : [])].join(', ')}.`,
    `Credit, money received${withoutMain ? ` apart from ${s.main.the}` : ''}: ${[...sold.map((a) => `${low(a.label)} ${inr(a.cash)}`), ...(s.extraAsset?.cash ? [`unrecorded asset ${inr(s.extraAsset.cash)}`] : [])].join(', ')}.`,
    ...(took.length || s.extraAsset?.taken
      ? [`Credit, taken over by partners: ${[...took.map((a) => `${low(a.label)} ${inr(a.taken!.at)} (${s.f.names[a.taken!.by]})`), ...(s.extraAsset?.taken ? [`unrecorded asset ${inr(s.extraAsset.taken.at)} (${s.f.names[s.extraAsset.taken.by]})`] : [])].join(', ')}.`]
      : []),
    ...(withoutMain ? [] : [`Total credit = ${inr(credit)}.`]),
    ...s.notes,
  ];
  return { lines, debit, credit };
}
const resultLine = (debit: number, credit: number): string =>
  credit > debit ? `The credit side is heavier: profit on realisation = ${inr(credit)} - ${inr(debit)} = ${inr(credit - debit)}.` : `The debit side is heavier: loss on realisation = ${inr(debit)} - ${inr(credit)} = ${inr(debit - credit)}.`;

const keptCase = keepFor<Scenario>();

const realisationFull = numericTemplate({
  id: 'dis-realisation-full', topicId: T, conceptId: C.realisation, difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const s = dissolve(rng);
    if (!s) return null;
    const result = resultOf(s);
    const n = numeric(Math.abs(result), s.slips.map(([d, why]): [number, string] => [Math.abs(result + d), why]));
    if (!n) return null;
    const prompt = `${s.f.intro} Its balance sheet on that date, and what happened on dissolution, are given below. Find the ${result > 0 ? 'profit' : 'loss'} on realisation.\n${sheetOf(s)}\n${eventsOf(s.info)}`;
    keptCase.keep(prompt, s);
    const w = realisationWorking(s);
    return { prompt, ...n, explanation: [...w.lines, resultLine(w.debit, w.credit)], hints: H.realisation };
  },
  verify: (q) => {
    const s = keptCase.of(q.prompt);
    if (!s) return false;
    const l = ledgerOf(s);
    return l.closed && q.answer === rupees(Math.abs(l.result)) && q.prompt.includes(l.result > 0 ? 'Find the profit on' : 'Find the loss on');
  },
});

const fullFinalPayment = numericTemplate({
  id: 'dis-full-final-payment', topicId: T, conceptId: C.closing, difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const s = dissolve(rng);
    if (!s) return null;
    const { f } = s;
    // The partner asked about is one whose account has more in it than a balance and a share, where there is one.
    const busy = f.names.map((_, k) => k).filter((k) => takenBy(s, k) > 0 || s.exp.credit?.to === k || s.loan?.by === k);
    const i = busy.length > 0 ? rng.pick(busy) : rng.int(0, f.names.length - 1);
    const x = f.names[i];
    const result = resultOf(s);
    const word = result > 0 ? 'profit' : 'loss';
    const final = finalsOf(s)[i];
    const myReserve = shareOf(f, s.reserve, i);
    const myResult = shareOf(f, result, i);
    const taken = takenBy(s, i);
    const credited = s.exp.credit?.to === i ? s.exp.credit.amount : 0;
    const debited = s.exp.debit?.to === i ? s.exp.debit.amount : 0;
    const n = numeric(final, [
      ...(taken ? [[final + taken, `Left out what ${x} took over, which is debited to ${x}'s Capital A/c.`] as [number, string]] : []),
      ...(myReserve ? [[final - myReserve, 'Left out the share of General Reserve, which is credited to the capital account.'] as [number, string]] : []),
      [final - myResult, `Left out ${x}'s share of the ${word} on realisation.`],
      [final - 2 * myResult, result > 0 ? 'Deducted the share of the profit on realisation instead of adding it.' : 'Added the share of the loss on realisation instead of deducting it.'],
      ...(s.loan?.by === i ? [[final + s.loan.amount, `Added ${x}'s loan; it is repaid by itself, before the capitals, and is no part of the capital account.`] as [number, string]] : []),
      ...(credited ? [[final - credited, `Left out the amount credited to ${x} for the realisation expenses.`] as [number, string]] : []),
      ...(debited ? [[final + debited, `Left out the expenses the firm paid on ${x}'s behalf, which are debited to ${x}'s Capital A/c.`] as [number, string]] : []),
      ...s.slips.map(([d, why]): [number, string] => [final + shareOf(f, d, i), `In Realisation A/c: ${why.charAt(0).toLowerCase()}${why.slice(1)}`]),
    ]);
    if (!n) return null;
    const prompt = `${f.intro} ${FLUCTUATING} Its balance sheet on that date, and what happened on dissolution, are given below. Find the amount finally paid to ${x} on ${x}'s Capital A/c.\n${sheetOf(s)}\n${eventsOf(s.info)}`;
    keptCase.keep(prompt, s);
    const w = realisationWorking(s);
    const plus = [
      `balance ${inr(s.capitals[i])}`,
      ...(myReserve ? [`General Reserve ${fraction(f, i)} x ${inr(s.reserve)} = ${inr(myReserve)}`] : []),
      ...(result > 0 ? [`profit on realisation ${fraction(f, i)} x ${inr(result)} = ${inr(myResult)}`] : []),
      ...(credited ? [`${s.exp.label.startsWith('remuneration') ? 'remuneration' : 'expenses paid for the firm'} ${inr(credited)}`] : []),
    ];
    const minus = [
      ...(result < 0 ? [`loss on realisation ${fraction(f, i)} x ${inr(-result)} = ${inr(-myResult)}`] : []),
      ...(taken ? [`taken over ${inr(taken)}`] : []),
      ...(debited ? [`expenses paid by the firm on ${x}'s behalf ${inr(debited)}`] : []),
    ];
    return {
      prompt,
      ...n,
      explanation: [
        ...w.lines,
        resultLine(w.debit, w.credit),
        `${x}'s Capital A/c, credit side: ${plus.join('; ')}.`,
        ...(minus.length ? [`${x}'s Capital A/c, debit side: ${minus.join('; ')}.`] : []),
        `Balance paid to ${x} = ${inr(final)}.`,
      ],
      hints: H.closing,
    };
  },
  verify: (q) => {
    const s = keptCase.of(q.prompt);
    if (!s) return false;
    const l = ledgerOf(s);
    const i = s.f.names.indexOf(/finally paid to ([A-Z][a-z]+) on/.exec(q.prompt)?.[1] ?? '');
    return l.closed && i >= 0 && q.answer === rupees(l.finals[i]);
  },
});

const bankTotal = numericTemplate({
  id: 'dis-bank-total', topicId: T, conceptId: C.closing, difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const s = dissolve(rng);
    if (!s) return null;
    const { f } = s;
    const receipts = receiptsOf(s);
    const finals = finalsOf(s);
    const n = numeric(receipts, [
      [receipts - s.bank, 'Left out the opening balance at bank, the first item on the debit side.'],
      [receipts - total(finals), 'Added up the payments before the final payments to the partners; the account is closed only when the partners have been paid.'],
      ...s.bankSlips.map(([d, why]): [number, string] => [receipts + d, why]),
    ]);
    if (!n) return null;
    const prompt = `${f.intro} ${FLUCTUATING} Its balance sheet on that date, and what happened on dissolution, are given below. Bank A/c opens with the balance at bank on its debit side. What does each side of Bank A/c total when the account is finally closed?\n${sheetOf(s)}\n${eventsOf(s.info)}`;
    keptCase.keep(prompt, s);
    const sold = s.assets.filter((a) => a.cash > 0);
    const out = [
      ...s.liabs.filter((l) => l.cash > 0).map((l) => `${low(l.label)} ${inr(l.cash)}`),
      ...(s.extraLiab ? [`unrecorded liability ${inr(s.extraLiab)}`] : []),
      ...(s.exp.firmPays ? [`realisation expenses${s.exp.debit ? ` paid on ${f.names[s.exp.debit.to]}'s behalf` : ''} ${inr(s.exp.firmPays)}`] : []),
      ...(s.loan ? [`${f.names[s.loan.by]}'s loan ${inr(s.loan.amount)}`] : []),
    ];
    return {
      prompt,
      ...n,
      explanation: [
        `Debit side: balance ${inr(s.bank)}; ${[...sold.map((a) => `${low(a.label)} ${inr(a.cash)}`), ...(s.extraAsset?.cash ? [`unrecorded asset ${inr(s.extraAsset.cash)}`] : [])].join('; ')}. Total = ${inr(receipts)}.`,
        ...s.notes.filter((t) => t.startsWith('Nothing is said') || t.startsWith('No entry')),
        ...(f.names.some((_, k) => takenBy(s, k) > 0) ? ['What the partners took over brings in no money, so it is not in Bank A/c.'] : []),
        `Credit side, before the partners are paid: ${out.join('; ')}. Sub-total = ${inr(receipts - total(finals))}.`,
        `Final payments to the partners: ${f.names.map((nm, i) => `${nm} ${inr(finals[i])}`).join('; ')} = ${inr(total(finals))}.`,
        `Credit side total = ${inr(receipts - total(finals))} + ${inr(total(finals))} = ${inr(receipts)}: the two sides agree, so the books are closed.`,
      ],
      hints: ['Debit Bank A/c with the opening balance and every amount actually received; credit it with every amount actually paid.', 'The last payments are the balances of the capital accounts. With them the two sides must agree.'],
    };
  },
  verify: (q) => {
    const s = keptCase.of(q.prompt);
    if (!s) return false;
    const l = ledgerOf(s);
    return l.closed && q.answer === rupees(l.bankIn);
  },
});

const missingRealisedValue = numericTemplate({
  id: 'dis-missing-realised-value', topicId: T, conceptId: C.realisation, difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const s = dissolve(rng);
    if (!s) return null;
    const result = resultOf(s);
    const word = result > 0 ? 'profit' : 'loss';
    const price = s.assets[0].cash;
    const book = s.assets[0].book;
    const n = numeric(price, [
      [book + result, `Put the whole ${word} on realisation down to ${s.main.the} alone: book value ${result > 0 ? 'plus' : 'less'} the ${word}.`],
      [price - 2 * result, result > 0 ? 'Worked as if Realisation A/c had shown a loss of that amount, not a profit.' : 'Worked as if Realisation A/c had shown a profit of that amount, not a loss.'],
      ...s.slips.map(([d, why]): [number, string] => [price - d, why]),
    ]);
    if (!n) return null;
    const info = s.info.map((t, k) => (k === s.mainAt ? `${cap(s.main.the)} ${was(s.main)} sold by cheque; the amount is to be found.` : t));
    const prompt = `${s.f.intro} Its balance sheet on that date, and what happened on dissolution, are given below. Realisation A/c showed a ${word} of ${inr(Math.abs(result))}. For how much ${was(s.main)} ${s.main.the} sold?\n${sheetOf(s)}\n${eventsOf(info)}`;
    keptCase.keep(prompt, s);
    const w = realisationWorking(s, true);
    const known = w.credit - price;
    return {
      prompt,
      ...n,
      explanation: [
        ...w.lines,
        `Credit side without ${s.main.the}: ${inr(known)}.`,
        result > 0
          ? `A profit of ${inr(result)} means the credit side is ${inr(w.debit)} + ${inr(result)} = ${inr(w.credit)}.`
          : `A loss of ${inr(-result)} means the credit side is ${inr(w.debit)} - ${inr(-result)} = ${inr(w.credit)}.`,
        `${cap(s.main.the)} fetched ${inr(w.credit)} - ${inr(known)} = ${inr(price)}.`,
      ],
      hints: ['Write out both sides of Realisation A/c, leaving a gap for the missing amount on the credit side.', 'Total debit plus a profit (or minus a loss) is the total credit; the gap is the difference.'],
    };
  },
  verify: (q) => {
    const s = keptCase.of(q.prompt);
    if (!s) return false;
    const l = ledgerOf(s);
    const stated = Number(/showed a (?:profit|loss) of ₹([\d,]+)/.exec(q.prompt)?.[1].replace(/,/g, ''));
    return l.closed && Math.abs(l.result) === stated && q.prompt.includes(l.result > 0 ? 'a profit of' : 'a loss of') && q.answer === rupees(s.assets[0].cash) && !q.prompt.includes(`${cap(s.main.the)} ${was(s.main)} sold for`);
  },
});

const resultSign = mcqTemplate({
  id: 'dis-result-sign', topicId: T, conceptId: C.takenOver, difficulty: 'complex',
  generate: (rng) => {
    const f = firm(rng);
    const p = rng.pick(f.names);
    const [t1, t2] = rng.shuffle(HANDY);
    const b1 = rng.step(40000, 150000, 10000);
    const v1 = b1 + (b1 / 100) * rng.pick([-20, -10, 10, 20]);
    const b2 = rng.step(30000, 90000, 5000);
    const v2 = b2 + rng.pick([-10000, -5000, 5000, 10000]);
    const creditors = v2 + rng.step(10000, 50000, 5000);
    const debtors = rng.step(60000, 200000, 10000);
    const bad = rng.step(2000, 15000, 1000);
    const expenses = rng.step(2000, 9000, 1000);
    const result = v1 - b1 + (v2 - b2) - bad - expenses;
    if (result === 0) return null;
    const debit = b1 + b2 + debtors + (creditors - v2) + expenses;
    const credit = creditors + v1 + (debtors - bad);
    return choice(
      `${f.intro} Realisation A/c is to be prepared from the four items below; nothing else affects it. What is the result on realisation?\n(i) ${t1.name} of book value ${inr(b1)}, taken over by ${p} at ${inr(v1)}.\n(ii) ${t2.name} of book value ${inr(b2)}, accepted by the creditors of ${inr(creditors)} at ${inr(v2)}; the balance of their claim was paid by cheque.\n(iii) Debtors of ${inr(debtors)}, of which ${inr(bad)} proved bad; the rest was collected.\n(iv) Realisation expenses of ${inr(expenses)}, paid by the firm.`,
      profitOrLoss(result),
      [
        [profitOrLoss(-result), result > 0 ? 'Read the heavier credit side of Realisation A/c as a loss.' : 'Read the heavier debit side of Realisation A/c as a profit.'],
        [profitOrLoss(result + expenses), 'Left out the realisation expenses paid by the firm.'],
        [profitOrLoss(result + v2), `Credited Realisation A/c with ${t2.the} given to the creditors as well as paying them only the balance; no entry is passed for the asset.`],
        [profitOrLoss(result - v1), `Left out ${t1.the} taken over by ${p}, which ${t1.plural ? 'are' : 'is'} credited to Realisation A/c like a sale.`],
        [profitOrLoss(result - v2), `Paid the creditors in full by cheque, ignoring ${t2.the} they had accepted.`],
      ],
      `Debit: assets ${inr(b1)} + ${inr(b2)} + ${inr(debtors)}; creditors paid ${inr(creditors)} - ${inr(v2)} = ${inr(creditors - v2)}; expenses ${inr(expenses)}; total ${inr(debit)}. Credit: creditors ${inr(creditors)}; taken over by ${p} ${inr(v1)}; debtors collected ${inr(debtors - bad)}; total ${inr(credit)}. ${resultLine(debit, credit)}`,
      H.realisation,
    );
  },
  verify: (q) => {
    const [b1, v1, b2, creditors, v2, debtors, bad, expenses] = amountsIn(q.prompt);
    const debit = b1 + b2 + debtors + (creditors - v2) + expenses;
    const credit = creditors + v1 + (debtors - bad);
    return optionText(q) === profitOrLoss(credit - debit);
  },
});

const creditorsCash = numericTemplate({
  id: 'dis-creditors-cash', topicId: T, conceptId: C.takenOver, difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const [t1, t2] = rng.shuffle(HANDY);
    const c1 = rng.step(30000, 90000, 5000);
    const v1 = c1 - rng.step(5000, 20000, 5000);
    const c2 = rng.step(20000, 60000, 5000);
    const b2 = c2 + rng.pick([-5000, 5000, 10000]);
    const rest = rng.step(40000, 200000, 10000);
    const pct = rng.pick([2, 5, 10]);
    const all = c1 + c2 + rest;
    const restPaid = rest - (rest * pct) / 100;
    const answer = c1 - v1 + restPaid;
    const n = numeric(answer, [
      [c1 - v1 + rest, 'Paid the remaining creditors in full, missing the discount they allowed.'],
      [c1 + restPaid, `Paid the first creditor in full by cheque, ignoring ${t1.the} accepted in part settlement.`],
      [c1 - v1 + ((c2 + rest) * (100 - pct)) / 100, `Paid the creditor of ${inr(c2)} as well; that claim was settled in full with ${t2.the} and nothing more is due.`],
      ...(c2 > b2 ? [[c1 - v1 + (c2 - b2) + restPaid, `Paid the second creditor the difference between the claim and the book value of ${t2.the}; "in full settlement" means nothing more is paid.`] as [number, string]] : []),
      [((c1 - v1 + rest) * (100 - pct)) / 100, 'Took the discount on the balance paid to the first creditor as well; only the remaining creditors allowed it.'],
    ]);
    return n && {
      prompt: `${f.intro} Creditors stood in the books at ${inr(all)} and were settled as below. How much did the firm pay the creditors by cheque in all?\n(i) A creditor for ${inr(c1)} accepted ${t1.the} at ${inr(v1)} and a cheque for the balance.\n(ii) A creditor for ${inr(c2)} accepted ${t2.the}, of book value ${inr(b2)}, in full settlement.\n(iii) The remaining creditors were paid at a discount of ${pct}%.`,
      ...n,
      explanation: [
        `(i) Paid by cheque: ${inr(c1)} - ${inr(v1)} = ${inr(c1 - v1)}. No entry is passed for the asset handed over.`,
        `(ii) Nothing is paid: the asset settles the whole claim, whatever its book value.`,
        `(iii) Remaining creditors = ${inr(all)} - ${inr(c1)} - ${inr(c2)} = ${inr(rest)}; less ${pct}% discount ${inr((rest * pct) / 100)}; paid ${inr(restPaid)}.`,
        `Total paid by cheque = ${inr(c1 - v1)} + ${inr(restPaid)} = ${inr(answer)}. This is the amount debited to Realisation A/c for creditors: Realisation A/c Dr; To Bank A/c.`,
      ],
      hints: H.entry,
    };
  },
  verify: (q) => {
    const [all, c1, v1, c2] = amountsIn(q.prompt);
    const pct = Number(/discount of (\d+)%/.exec(q.prompt)?.[1]);
    return q.answer === rupees(c1 - v1 + ((all - c1 - c2) * (100 - pct)) / 100);
  },
});

const journalCloseRealisation = journalTemplate({
  id: 'dis-journal-close-realisation', topicId: T, conceptId: C.realisation, difficulty: 'complex', computed: true,
  generate: (rng) => {
    const f = firm(rng);
    const [x, y] = rng.shuffle(f.names);
    const assets = rng.step(400000, 900000, 10000);
    const liabs = rng.step(80000, 250000, 5000);
    const taken = rng.step(30000, 90000, 5000);
    const paid = liabs - rng.pick([0, 2000, 3000, 5000]);
    const expenses = rng.step(2000, 9000, 1000);
    const result = f.sum * rng.step(1000, 8000, 500) * (rng.int(0, 2) === 0 ? 1 : -1);
    const sold = result + assets + paid + expenses - liabs - taken;
    if (sold <= 0) return null;
    const debit = assets + paid + expenses;
    const credit = liabs + sold + taken;
    const shares = f.names.map((_, i) => shareOf(f, Math.abs(result), i));
    const rows = [
      `Assets transferred to Realisation A/c: ${inr(assets)}`,
      `Outside liabilities transferred to Realisation A/c: ${inr(liabs)}`,
      `Assets sold for cash: ${inr(sold)}`,
      `Stock taken over by ${x} at: ${inr(taken)}`,
      `Paid to settle the outside liabilities: ${inr(paid)}`,
      `Realisation expenses paid by ${y} for the firm, which bears them: ${inr(expenses)}`,
    ];
    return {
      prompt: `${f.intro} ${FLUCTUATING} Realisation A/c has the postings below and no others. Pass the journal entry that closes it.\n${rows.join('\n')}`,
      lines: result > 0 ? [dr(REAL, result), ...f.names.map((nm, i) => cr(partnerCapital(nm), shares[i]))] : [...f.names.map((nm, i) => dr(partnerCapital(nm), shares[i])), cr(REAL, -result)],
      explanation: [
        `Debit side: assets ${inr(assets)} + liabilities paid ${inr(paid)} + expenses ${inr(expenses)} = ${inr(debit)}.`,
        `Credit side: liabilities ${inr(liabs)} + assets sold ${inr(sold)} + stock taken over ${inr(taken)} = ${inr(credit)}.`,
        resultLine(debit, credit),
        `Shared ${f.ratio.join(':')}: ${f.names.map((nm, i) => `${nm} ${inr(shares[i])}`).join('; ')}.`,
        result > 0 ? 'Realisation A/c is debited to close it and the capital accounts are credited.' : 'The capital accounts are debited and Realisation A/c is credited to close it.',
      ],
      distractorAccounts: ['profitAndLoss', 'stock'],
      hints: H.realisation,
    };
  },
  verify: (q) => {
    let result = 0;
    for (const [label, amount] of figuresIn(q.prompt)) result += /^(Assets transferred|Paid to settle|Realisation expenses)/.test(label) ? -amount : amount;
    const side = result > 0 ? 'Cr' : 'Dr';
    return result !== 0 && hasLine(q, REAL, result > 0 ? 'Dr' : 'Cr', Math.abs(result)) && namesIn(q.prompt).every((nm) => hasLine(q, partnerCapital(nm), side, shareIn(q.prompt, nm, Math.abs(result))));
  },
});

const unrecordedEffect = numericTemplate({
  id: 'dis-unrecorded-effect', topicId: T, conceptId: C.unrecorded, difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng, { unequal: true });
    const n = f.names.length;
    const i = rng.int(0, n - 1);
    const x = f.names[i];
    const y = f.names[(i + 1) % n];
    // Every item is a multiple of the sum of the ratio, so that each slip also gives a share in whole rupees.
    const taken = f.sum * 500 * rng.int(1, 4);
    const claim = f.sum * 500 * rng.int(1, 3);
    const bill = f.sum * 1000 * rng.int(1, 3);
    const expenses = f.sum * 500 * rng.int(1, 2);
    const dishonoured = rng.int(0, 1) === 0;
    const final = f.sum * rng.step(2000, 9000, 500);
    const before = final - taken + claim + (dishonoured ? bill : 0) + expenses;
    const share = (amount: number): number => shareOf(f, amount, i);
    const num = numeric(share(final), [
      [share(final - taken), 'Left out the unrecorded asset taken over; its whole value is a gain credited to Realisation A/c.'],
      [share(final - 2 * taken), 'Debited Realisation A/c with the unrecorded asset; an asset taken over is credited to it.'],
      [share(final + claim), 'Left out the unrecorded claim that was paid, which is debited to Realisation A/c.'],
      dishonoured
        ? [share(final + bill), 'Left out the dishonoured bill, which the firm had to pay to the bank.']
        : [share(final - bill), 'Debited Realisation A/c with the bill, although its acceptor met it and the firm paid nothing.'],
      [share(final + expenses), `Left out the expenses ${y} paid for the firm, which the firm bears.`],
      [share(before), 'Shared the profit as it stood before the four items were dealt with.'],
      [final, `Gave the whole final profit, not ${x}'s share of it.`],
    ]);
    return num && {
      prompt: `${f.intro} Before the four items below were dealt with, Realisation A/c showed a profit of ${inr(before)}. What is ${x}'s share of the final profit on realisation?\n(i) ${y} took over a computer, written off in an earlier year, at ${inr(taken)}.\n(ii) A claim for damages of ${inr(claim)}, not recorded in the books, was paid by the firm.\n(iii) A bill of exchange of ${inr(bill)}, discounted with the bank before the dissolution, ${dishonoured ? 'was dishonoured; its acceptor could pay nothing, so the firm paid the bank' : 'was met by its acceptor on the due date'}.\n(iv) Realisation expenses of ${inr(expenses)}, to be borne by the firm, were paid by ${y}.`,
      ...num,
      explanation: [
        `(i) An unrecorded asset taken over is a gain: credit Realisation A/c ${inr(taken)}.`,
        `(ii) An unrecorded liability paid is a loss: debit Realisation A/c ${inr(claim)}.`,
        dishonoured
          ? `(iii) The discounted bill was a contingent liability that became a real one: debit Realisation A/c ${inr(bill)}.`
          : '(iii) The discounted bill was only a contingent liability and its acceptor paid it: no entry.',
        `(iv) The firm bears the expenses whoever pays them: debit Realisation A/c ${inr(expenses)} (credit ${y}'s Capital A/c).`,
        `Final profit = ${inr(before)} + ${inr(taken)} - ${inr(claim)}${dishonoured ? ` - ${inr(bill)}` : ''} - ${inr(expenses)} = ${inr(final)}.`,
        `${x}'s share = ${fraction(f, i)} x ${inr(final)} = ${inr(share(final))}.`,
      ],
      hints: ['Take the items one at a time: is it a gain (credit Realisation A/c), a loss (debit it) or no entry at all?', 'A contingent liability needs an entry only if the firm actually has to pay.'],
    };
  },
  verify: (q) => {
    const [before, taken, claim, bill, expenses] = amountsIn(q.prompt);
    const x = /What is ([A-Z][a-z]+)'s share/.exec(q.prompt)?.[1] ?? '';
    const final = before + taken - claim - (q.prompt.includes('was dishonoured') ? bill : 0) - expenses;
    return q.answer === rupees(shareIn(q.prompt, x, final));
  },
});

// ===============================================================================================================
// SETS OF ENTRIES AND FORMATS
// ---------------------------------------------------------------------------------------------------------------
// What this part adds to the conventions above, each stated in the question that relies on it:
//  - a set says in its opening that the balances which go to Realisation A/c have already been transferred (or asks
//    for the transfers as its first entries), that the capitals are fluctuating, and how the firm receives and pays;
//  - an item of a set always has an entry: a settlement that needs none (a creditor who takes an asset in full
//    settlement) is asked in the single questions, never in a set;
//  - in a Realisation, Bank or capital account every receipt, payment and transfer is a row of its own, and what the
//    row is for stands in brackets after the account: "Bank A/c (creditors)", "Realisation A/c (loss)";
//  - the accounts of a format are written up by the engine from the entries of one dissolution, so the Realisation
//    Account, the capital accounts and the Bank (or Cash) Account cannot disagree, and the last closes with nothing left;
//  - a wrong label is offered only if a row cannot be mistaken for it: never a bare "Bank A/c" or "Realisation A/c"
//    beside rows that carry the same account with a bracket, and never "realisation expenses" beside "remuneration"
//    for the one amount a partner is credited with, which an examiner accepts under either name;
//  - a Realisation A/c has up to 14 rows a side. Capital accounts on dissolution are short by nature (three to six
//    rows a side, each with a figure for every partner), and so is a Bank A/c: for four marks neither is asked with
//    fewer than seven and nine rows in all, and capital accounts for six marks have three partners and nine rows.
// ===============================================================================================================

const SETS = 'dis-sets';
const FORMATS = 'dis-formats';
const ALREADY = 'The assets other than cash and bank, and the outside liabilities, had already been transferred to Realisation A/c.';
const BY_CHEQUE = 'Every receipt and payment of the firm was by cheque.';
const NUMERALS = [...ROMAN, '(x)', '(xi)', '(xii)'];

/** One item of a set, before it is numbered. */
type Item = { text: string; lines: JournalLine[]; explanation: string[] };
const numbered = (items: readonly Item[]): SetTransaction[] => items.map((item, k) => ({ label: NUMERALS[k], ...item }));
/** True for an entry of exactly two lines: `debited` Dr and `credited` Cr with `n` rupees. */
const two = (lines: readonly JournalLine[], debited: string, credited: string, n: number): boolean =>
  lines.length === 2 &&
  lines.some((l) => l.accountId === debited && l.side === 'Dr' && l.amount === rupees(n)) &&
  lines.some((l) => l.accountId === credited && l.side === 'Cr' && l.amount === rupees(n));
const firstName = (text: string): string => /^([A-Z][a-z]+) /.exec(text)?.[1] ?? '';

const SET_HINTS = {
  items: [
    'The asset and liability accounts are closed: they went to Realisation A/c. For each item ask only what comes in or goes out now, and through whom.',
    "Value received for an asset: credit Realisation A/c. Value given for a liability or an expense of the firm: debit Realisation A/c. The other half is Bank A/c, or the capital account of the partner who took or paid.",
  ],
  expenses: [
    'For the expenses ask two things: who bears them, and whose money paid them?',
    "Realisation A/c is debited only with what the firm bears: the expenses themselves, or the remuneration agreed in place of them. What the firm pays for a partner is debited to that partner's Capital A/c.",
  ],
  loans: [
    'Who is the lender: an outsider (a bank, a relative of a partner), a partner, or the firm itself?',
    "An outsider's loan is paid through Realisation A/c. A partner's own loan is paid out of its own account, after the outside liabilities. A loan to a partner is set off against that partner's capital.",
  ],
  whole: [
    'Work in the order given and keep three running totals in rough: Realisation A/c, each capital account and Bank A/c.',
    'The balance of Realisation A/c is shared in the profit-sharing ratio. The last payment to the partners must empty Bank A/c.',
  ],
};

// 1. dis-set-items: the board's "pass the entries for the following on dissolution": three or four items that stand
//    apart, the transfers to Realisation A/c having been made (easy)
const setItems = journalSetTemplate({
  id: 'dis-set-items', topicId: T, conceptId: SETS, difficulty: 'easy',
  generate: (rng) => {
    const f = firm(rng);
    const [t1, t2] = rng.shuffle(HANDY);
    const p = rng.pick(f.names);
    const q = rng.pick(f.names);

    const book = rng.step(40000, 200000, 10000);
    const pct = rng.pick([5, 10, 20]);
    const byRate = rng.int(0, 1) === 0;
    const at = byRate ? book - (book * pct) / 100 : book + rng.pick([-10000, -5000, 5000]);
    const taken: Item = {
      text: byRate
        ? `${p} took over ${t1.the}, which stood in the books at ${inr(book)}, at ${pct}% less than ${t1.plural ? 'their' : 'its'} book value.`
        : `${p} took over ${t1.the}, which stood in the books at ${inr(book)}, at an agreed value of ${inr(at)}.`,
      lines: [dr(partnerCapital(p), at), cr(REAL, at)],
      explanation: [
        byRate ? `Agreed value = ${inr(book)} - ${pct}% of ${inr(book)} = ${inr(at)}.` : `The value agreed, ${inr(at)}, is what counts, not the book value.`,
        `${p} takes the asset in place of money, so ${p}'s Capital A/c is debited.`,
        `Realisation A/c is credited, as on a sale. ${t1.name} A/c was closed when the assets were transferred.`,
      ],
    };

    const value = rng.step(20000, 90000, 5000);
    // One seed in four the asset is worth more than the debt, and the creditor pays the firm the difference.
    const pays = rng.int(0, 3) === 0;
    // A creditor who takes an asset worth more than the debt is owed most of its value: the difference is small.
    const gap = rng.step(5000, pays ? Math.min(15000, value / 2) : 40000, 5000);
    const owed = pays ? value - gap : value + gap;
    const noEntry = 'No entry is passed for the asset handed over: the asset and the creditor are both already in Realisation A/c.';
    const creditor: Item = pays
      ? {
          text: `A creditor to whom the firm owed ${inr(owed)} took over ${t2.the} at an agreed value of ${inr(value)} in settlement of the claim and paid the difference to the firm by cheque.`,
          lines: [dr('bank', gap), cr(REAL, gap)],
          explanation: [noEntry, `The asset is worth more than the debt, so the creditor pays the firm ${inr(value)} - ${inr(owed)} = ${inr(gap)}.`, 'Only this money is recorded: Bank A/c is debited and Realisation A/c is credited.'],
        }
      : {
          text: `A creditor to whom the firm owed ${inr(owed)} accepted ${t2.the} at an agreed value of ${inr(value)} in part settlement of the claim and was paid the balance by cheque.`,
          lines: [dr(REAL, gap), cr('bank', gap)],
          explanation: [noEntry, `The creditor is still owed ${inr(owed)} - ${inr(value)} = ${inr(gap)}, which is paid by cheque.`, 'Only this payment is recorded: Realisation A/c is debited and Bank A/c is credited.'],
        };

    // Something that was never in the books: an asset sold or taken over, or (one seed in four) a liability paid.
    const old = rng.pick(UNRECORDED_ASSETS.filter((u) => u.id !== t1.id && u.id !== t2.id));
    const v = rng.step(2000, old.max, 500);
    const bill = rng.pick(UNRECORDED_LIABS);
    const billed = rng.step(2000, 20000, 500);
    const hiddenKind = rng.pick(['sold', 'sold', 'taken', 'liability'] as const);
    const hidden: Item =
      hiddenKind === 'liability'
        ? {
            text: `${bill.text(inr(billed))} The firm paid it by cheque.`,
            lines: [dr(REAL, billed), cr('bank', billed)],
            explanation: ['An unrecorded liability was never on the credit of Realisation A/c, so the whole payment is a loss: Realisation A/c is debited.', 'The firm pays, so Bank A/c is credited.'],
          }
        : hiddenKind === 'taken'
          ? {
              text: `${cap(old.what)} ${old.it === 'it' ? 'was' : 'were'} taken over by ${q} at ${inr(v)}.`,
              lines: [dr(partnerCapital(q), v), cr(REAL, v)],
              explanation: ['An unrecorded asset has no book value, so nothing stands for it on the debit of Realisation A/c.', `${q} takes it in place of money: ${q}'s Capital A/c is debited.`, 'Realisation A/c is credited: the whole amount is a gain.'],
            }
          : {
              text: `${cap(old.what)} ${old.it === 'it' ? 'was' : 'were'} sold for ${inr(v)}.`,
              lines: [dr('bank', v), cr(REAL, v)],
              explanation: ['An unrecorded asset has no book value, so nothing stands for it on the debit of Realisation A/c.', 'The money received is debited to Bank A/c and credited to Realisation A/c: the whole amount is a gain.'],
            };

    const e = rng.step(2000, 15000, 500);
    const expenses: Item = {
      text: `Realisation expenses of ${inr(e)} were borne and paid by the firm.`,
      lines: [dr(REAL, e), cr('bank', e)],
      explanation: ['The firm bears the expenses of winding up, so they are a cost of realisation: Realisation A/c is debited.', 'The firm paid them, so Bank A/c is credited.'],
    };

    const all = rng.shuffle([taken, creditor, hidden, expenses]);
    return {
      task: 'Pass the necessary journal entries for the following items on the dissolution of the firm.',
      opening: `${f.intro} ${FLUCTUATING} ${ALREADY} ${BY_CHEQUE}`,
      transactions: numbered(all.slice(0, rng.pick([3, 4, 4]))),
      hints: SET_HINTS.items,
      distractorAccounts: [t1.id, t2.id, 'creditors', old.id],
    };
  },
  verify: (q) =>
    setHolds()(q) &&
    q.entries.every(({ text, expected }) => {
      const a = amountsIn(text);
      const who = /^([A-Z][a-z]+) took over/.exec(text)?.[1];
      const rate = Number(/at (\d+)% less/.exec(text)?.[1] ?? 0);
      if (who) return two(expected, partnerCapital(who), REAL, rate ? a[0] - (a[0] * rate) / 100 : a[1]);
      const taker = /taken over by ([A-Z][a-z]+) at/.exec(text)?.[1];
      if (taker) return two(expected, partnerCapital(taker), REAL, a[0]);
      if (text.startsWith('A creditor to whom')) return a[1] > a[0] ? two(expected, 'bank', REAL, a[1] - a[0]) : two(expected, REAL, 'bank', a[0] - a[1]);
      if (text.includes('sold for')) return two(expected, 'bank', REAL, a[0]);
      // Expenses the firm bears and pays, or a liability that was not in the books: the firm's money goes out.
      return two(expected, REAL, 'bank', a[0]);
    }),
});

// 2. dis-set-expenses: the realisation of one firm's assets, and its realisation expenses in one of seven forms: paid
//    by the firm, paid by a partner for the firm, borne by a partner for a remuneration or a commission (paid by that
//    partner, or by the firm on the partner's behalf, which takes two entries), borne by a partner for nothing (medium)
const setExpenses = journalSetTemplate({
  id: 'dis-set-expenses', topicId: T, conceptId: SETS, difficulty: 'medium',
  generate: (rng) => {
    const f = firm(rng);
    const [x, y] = rng.shuffle(f.names);
    const main = rng.pick([TANGIBLE[1], TANGIBLE[3], TANGIBLE[4]]);
    const mainBook = rng.step(150000, 400000, 10000);
    const mainGot = mainBook + (mainBook / 100) * rng.pick([-20, -10, 10, 20]);
    const debtors = rng.step(60000, 200000, 10000);
    const debtorsGot = debtors - rng.step(2000, 12000, 1000);
    const cash = mainGot + debtorsGot;
    const stock = rng.step(40000, 160000, 10000);
    const stockPct = rng.pick([10, 20]);
    const stockAt = stock - (stock * stockPct) / 100;
    const creditors = rng.step(50000, 150000, 10000);
    const discount = rng.pick([2, 5, 10]);
    const creditorsPaid = creditors - (creditors * discount) / 100;
    const actual = rng.step(3000, 12000, 1000);
    // The remuneration is never the same as the expenses (the entry would not show which was meant), nor a trifle.
    const fee = actual + rng.pick([-2000, -1000, 1000, 2000, 4000].filter((d) => actual + d >= 3000));
    const rate = rng.pick([1, 2, 3]);
    const commission = (cash * rate) / 100;

    const sold: Item = {
      text: `${cap(main.the)}, which stood in the books at ${inr(mainBook)}, ${was(main)} sold for ${inr(mainGot)}, and the debtors of ${inr(debtors)} paid ${inr(debtorsGot)} in full settlement.`,
      lines: [dr('bank', cash), cr(REAL, cash)],
      explanation: [
        `Money received = ${inr(mainGot)} + ${inr(debtorsGot)} = ${inr(cash)}: Bank A/c is debited.`,
        'Realisation A/c is credited with what the assets fetched. Their own accounts were closed when they were transferred, and the gain or shortfall stays in Realisation A/c.',
      ],
    };
    const taken: Item = {
      text: `${y} took over the stock, which stood in the books at ${inr(stock)}, at ${stockPct}% less than its book value.`,
      lines: [dr(partnerCapital(y), stockAt), cr(REAL, stockAt)],
      explanation: [`Agreed value = ${inr(stock)} - ${stockPct}% of ${inr(stock)} = ${inr(stockAt)}.`, `${y} takes the stock in place of money, so ${y}'s Capital A/c is debited.`, 'Realisation A/c is credited, as on a sale.'],
    };
    const paid: Item = {
      text: `The creditors, who were owed ${inr(creditors)}, were paid at a discount of ${discount}%.`,
      lines: [dr(REAL, creditorsPaid), cr('bank', creditorsPaid)],
      explanation: [
        `Paid = ${inr(creditors)} - ${discount}% of ${inr(creditors)} = ${inr(creditorsPaid)}.`,
        'The payment is debited to Realisation A/c, where the creditors stand on the credit side, and credited to Bank A/c. The discount needs no entry.',
      ],
    };

    const owes = (what: string, n: number): string => `The firm owes ${x} the agreed ${what}, ${inr(n)}, whatever the expenses turn out to be: Realisation A/c is debited and ${x}'s Capital A/c is credited.`;
    const own = `The expenses of ${inr(actual)} are ${x}'s own affair: ${x} agreed to bear them and paid them personally, so no entry is passed for them.`;
    const feeDeal = `${x} was to carry out the dissolution for a remuneration of ${inr(fee)} and to bear all the realisation expenses`;
    const commissionDeal = `${x} was to realise the assets for a commission of ${rate}% of the money received for ${main.the} and from the debtors, and was to bear all the realisation expenses`;
    const commissionWork = `Commission = ${rate}% of ${inr(cash)} = ${inr(commission)}.`;
    const onBehalf: Item = {
      text: `The realisation expenses that ${x} had agreed to bear came to ${inr(actual)} and were paid by the firm on ${x}'s behalf.`,
      lines: [dr(partnerCapital(x), actual), cr('bank', actual)],
      explanation: [
        `The expenses are ${x}'s to bear and the firm's money paid them, so ${x} owes the firm ${inr(actual)}: ${x}'s Capital A/c is debited.`,
        'Money left the firm, so Bank A/c is credited. Realisation A/c is not touched: it was charged with what was agreed, by the entry above.',
      ],
    };
    const forms: Item[][] = [
      [{
        text: `Realisation expenses of ${inr(actual)} were borne and paid by the firm.`,
        lines: [dr(REAL, actual), cr('bank', actual)],
        explanation: ['The firm bears the expenses, so they are a cost of realisation: Realisation A/c is debited.', 'The firm paid them, so Bank A/c is credited.'],
      }],
      [{
        text: `Realisation expenses of ${inr(actual)} were to be borne by the firm; ${x} paid them out of ${x}'s own money.`,
        lines: [dr(REAL, actual), cr(partnerCapital(x), actual)],
        explanation: ['The firm bears the expenses, so Realisation A/c is debited.', `No money left the firm. ${x} paid for the firm, so the firm owes ${x} the amount: ${x}'s Capital A/c is credited.`],
      }],
      [{
        text: `${feeDeal}, which came to ${inr(actual)} and were paid by ${x} out of ${x}'s own money.`,
        lines: [dr(REAL, fee), cr(partnerCapital(x), fee)],
        explanation: [owes('remuneration', fee), own],
      }],
      [{ text: `${feeDeal}.`, lines: [dr(REAL, fee), cr(partnerCapital(x), fee)], explanation: [owes('remuneration', fee)] }, onBehalf],
      [{
        text: `${commissionDeal}, which came to ${inr(actual)} and were paid by ${x} out of ${x}'s own money.`,
        lines: [dr(REAL, commission), cr(partnerCapital(x), commission)],
        explanation: [commissionWork, owes('commission', commission), own],
      }],
      [{ text: `${commissionDeal}.`, lines: [dr(REAL, commission), cr(partnerCapital(x), commission)], explanation: [commissionWork, owes('commission', commission)] }, onBehalf],
      [{
        text: `${x} had agreed to bear all the realisation expenses without any remuneration. They came to ${inr(actual)} and were paid by the firm on ${x}'s behalf.`,
        lines: [dr(partnerCapital(x), actual), cr('bank', actual)],
        explanation: [
          `The expenses are ${x}'s to bear and the firm's money paid them, so ${x} owes the firm ${inr(actual)}: ${x}'s Capital A/c is debited.`,
          'Money left the firm, so Bank A/c is credited. Realisation A/c is not touched: the firm bears nothing.',
        ],
      }],
    ];
    const form = rng.pick(forms);

    // A set with one entry for the expenses may have a fifth item: something that was not in the books.
    const old = rng.pick(UNRECORDED_ASSETS.filter((u) => u.id !== main.id));
    const v = rng.step(2000, old.max, 500);
    const bill = rng.pick(UNRECORDED_LIABS);
    const billed = rng.step(2000, 20000, 500);
    const hidden: Item =
      rng.int(0, 1) === 0
        ? {
            text: `${cap(old.what)} ${old.it === 'it' ? 'was' : 'were'} sold for ${inr(v)}.`,
            lines: [dr('bank', v), cr(REAL, v)],
            explanation: ['An unrecorded asset has no book value, so nothing stands for it on the debit of Realisation A/c.', 'The money received is debited to Bank A/c and credited to Realisation A/c: the whole amount is a gain.'],
          }
        : {
            text: `${bill.text(inr(billed))} The firm paid it.`,
            lines: [dr(REAL, billed), cr('bank', billed)],
            explanation: ['An unrecorded liability was never on the credit of Realisation A/c, so the whole payment is a loss: Realisation A/c is debited.', 'The firm pays, so Bank A/c is credited.'],
          };
    const fifth = form.length === 1 && rng.int(0, 1) === 0;

    return {
      task: 'Pass the necessary journal entries for the following on the dissolution of the firm.',
      opening: `${f.intro} ${FLUCTUATING} ${ALREADY} ${BY_CHEQUE}`,
      transactions: numbered([...rng.shuffle([sold, taken]), paid, ...(fifth ? [hidden] : []), ...form]),
      hints: SET_HINTS.expenses,
      distractorAccounts: [main.id, 'stock', 'debtors', 'creditors', 'discountReceived', 'commissionPaid', 'tradeExpenses'],
    };
  },
  verify: (q) => {
    const sale = q.entries.find((e) => e.text.includes('and the debtors of'));
    if (!sale || !setHolds()(q)) return false;
    const s = amountsIn(sale.text);
    const cash = s[1] + s[3];
    return q.entries.every(({ text, expected }) => {
      const a = amountsIn(text);
      const rate = Number(/(\d+)%/.exec(text)?.[1] ?? 0);
      const behalf = /paid by the firm on ([A-Z][a-z]+)'s behalf/.exec(text)?.[1];
      if (text === sale.text) return two(expected, 'bank', REAL, cash);
      if (text.includes('took over the stock')) return two(expected, partnerCapital(firstName(text)), REAL, a[0] - (a[0] * rate) / 100);
      if (text.startsWith('The creditors')) return two(expected, REAL, 'bank', a[0] - (a[0] * rate) / 100);
      if (text.includes('for a remuneration of')) return two(expected, REAL, partnerCapital(firstName(text)), a[0]);
      if (text.includes('for a commission of')) return two(expected, REAL, partnerCapital(firstName(text)), (cash * rate) / 100);
      if (behalf) return two(expected, partnerCapital(behalf), 'bank', a[a.length - 1]);
      if (text.includes('borne and paid by the firm')) return two(expected, REAL, 'bank', a[0]);
      if (text.includes('to be borne by the firm')) return two(expected, REAL, partnerCapital(/; ([A-Z][a-z]+) paid them/.exec(text)?.[1] ?? ''), a[0]);
      return text.includes('sold for') ? two(expected, 'bank', REAL, a[0]) : two(expected, REAL, 'bank', a[0]);
    });
  },
});

// 3. dis-set-loans: the loans of one firm on dissolution: a loan from a partner's relative (an outside liability),
//    a liability a partner agrees to pay, an unrecorded liability, a loan the firm gave a partner, and last the
//    partner's own loan, repaid at once or partly settled with an asset first (medium)
const setLoans = journalSetTemplate({
  id: 'dis-set-loans', topicId: T, conceptId: SETS, difficulty: 'medium',
  generate: (rng) => {
    const f = firm(rng);
    // `a` lent the firm money and `c` borrowed from it; `b` and `b2` take a debt of the firm on themselves.
    const [a, c] = rng.shuffle(f.names);
    const b = rng.pick(f.names.filter((nm) => nm !== a));
    const b2 = rng.pick(f.names);
    const r = relative(rng, rng.pick(f.names));
    const [t1, t2] = rng.shuffle(HANDY);
    const loan = rng.step(40000, 150000, 10000);
    const owed = rng.step(30000, 100000, 10000);
    const lent = rng.step(10000, 50000, 5000);
    const bankLoan = rng.step(50000, 200000, 10000);
    const outsider = `${r.name} is not a partner, so this loan is an outside liability: it went to the credit of Realisation A/c with the others.`;

    const interest = rng.step(1000, 6000, 500);
    const part = owed - rng.step(5000, 20000, 5000);
    const relativeWays: Item[] = [
      {
        text: `The loan of ${inr(owed)} from ${r.name} was repaid in full.`,
        lines: [dr(REAL, owed), cr('bank', owed)],
        explanation: [outsider, 'Its repayment is debited to Realisation A/c and credited to Bank A/c.'],
      },
      {
        text: `The loan of ${inr(owed)} from ${r.name} was repaid together with interest of ${inr(interest)} that was due on it and had not been recorded in the books.`,
        lines: [dr(REAL, owed + interest), cr('bank', owed + interest)],
        explanation: [
          outsider,
          'The interest was never in the books, so it is an unrecorded liability: the whole of it is a loss in Realisation A/c.',
          `Paid in all = ${inr(owed)} + ${inr(interest)} = ${inr(owed + interest)}, debited to Realisation A/c and credited to Bank A/c.`,
        ],
      },
      {
        text: `${r.name}, who was owed ${inr(owed)}, accepted ${t1.the} at an agreed value of ${inr(part)} in part payment and was paid the balance.`,
        lines: [dr(REAL, owed - part), cr('bank', owed - part)],
        explanation: [
          outsider,
          'No entry is passed for the asset handed over: the asset and the loan are both already in Realisation A/c.',
          `Balance paid = ${inr(owed)} - ${inr(part)} = ${inr(owed - part)}, debited to Realisation A/c and credited to Bank A/c.`,
        ],
      },
    ];
    const fromRelative = relativeWays[rng.pick([0, 1, 1, 2, 2])];
    const takenOver: Item = {
      text: `${b} agreed to pay off the bank loan of ${inr(bankLoan)} personally.`,
      lines: [dr(REAL, bankLoan), cr(partnerCapital(b), bankLoan)],
      explanation: [
        'The bank loan is on the credit of Realisation A/c, and its own account is closed. Realisation A/c is debited, exactly as if the firm had paid it.',
        `No money leaves the firm. ${b} will pay for the firm, so the firm owes ${b} that much more: ${b}'s Capital A/c is credited.`,
      ],
    };
    const bill = rng.pick(UNRECORDED_LIABS);
    const w = rng.step(2000, 20000, 500);
    const byPartner = rng.int(0, 2) === 0;
    const hidden: Item = {
      text: `${bill.text(inr(w))} ${byPartner ? `${b2} agreed to pay it personally.` : 'The firm paid it.'}`,
      lines: [dr(REAL, w), cr(byPartner ? partnerCapital(b2) : 'bank', w)],
      explanation: [
        'An unrecorded liability was never on the credit of Realisation A/c, so the whole of it is a loss when it is met: Realisation A/c is debited.',
        byPartner ? `${b2} meets it for the firm, so the firm owes ${b2} that much more: ${b2}'s Capital A/c is credited.` : 'The firm pays, so Bank A/c is credited.',
      ],
    };
    const toPartner: Item = {
      text: `The account of the loan of ${inr(lent)} that the firm had given to ${c} was closed; ${c} paid no money in for it.`,
      lines: [dr(partnerCapital(c), lent), cr(loanToPartner(c), lent)],
      explanation: [
        'A loan to a partner is not transferred to Realisation A/c: nobody buys it.',
        `${c} owes the firm ${inr(lent)} and the firm owes ${c} capital, so the two are set off: ${c}'s Capital A/c is debited and Loan to ${c} A/c is credited.`,
        'No money moves, so Bank A/c has no part in the entry.',
      ],
    };
    const order = "A partner's loan is repaid after the outside liabilities and before the capitals: the loan account is debited and Bank A/c is credited.";
    const asset = rng.step(10000, Math.min(60000, loan - 10000), 5000);
    const split = rng.int(0, 2) > 0;
    const own: Item[] = split
      ? [
          {
            text: `${a} agreed to take over ${t2.the} at ${inr(asset)} in part payment of ${a}'s loan of ${inr(loan)}.`,
            lines: [dr(partnerLoan(a), asset), cr(REAL, asset)],
            explanation: [
              "A partner's own loan is never transferred to Realisation A/c, but the asset is there: taking it over is credited to Realisation A/c, like a sale.",
              `Its value is set off against what the firm owes ${a} on the loan, so ${a}'s Loan A/c is debited, not ${a}'s Capital A/c.`,
            ],
          },
          {
            text: `After the outside liabilities had been settled, the balance of ${a}'s loan was repaid.`,
            lines: [dr(partnerLoan(a), loan - asset), cr('bank', loan - asset)],
            explanation: [`Balance of the loan = ${inr(loan)} - ${inr(asset)} = ${inr(loan - asset)}.`, order],
          },
        ]
      : [
          {
            text: `After the outside liabilities had been settled, ${a}'s loan of ${inr(loan)} was repaid.`,
            lines: [dr(partnerLoan(a), loan), cr('bank', loan)],
            explanation: [`A partner's own loan is never transferred to Realisation A/c: it stays in ${a}'s Loan A/c.`, order],
          },
        ];

    // The partner's loan and the relative's loan are in every set; the others fill it up to four or five entries.
    const kinds = rng.shuffle(['bankLoan', 'hidden', 'lent'] as const).slice(0, split ? rng.int(1, 2) : rng.int(2, 3));
    const outside = rng.shuffle([fromRelative, ...(kinds.includes('bankLoan') ? [takenOver] : []), ...(kinds.includes('hidden') ? [hidden] : [])]);
    if (kinds.includes('lent')) outside.splice(rng.int(0, outside.length), 0, toPartner);
    const shown = [
      `Loan given to the firm by ${a}, a partner: ${inr(loan)}`,
      `Loan taken from ${r.as}, who is not a partner: ${inr(owed)}`,
      ...(kinds.includes('bankLoan') ? [`Bank loan: ${inr(bankLoan)}`] : []),
      ...(kinds.includes('lent') ? [`Loan given by the firm to ${c}, a partner: ${inr(lent)}`] : []),
    ];
    return {
      task: 'Pass the necessary journal entries for the following on the dissolution of the firm.',
      opening: `${f.intro} ${FLUCTUATING} Every balance that goes to Realisation A/c had already been transferred to it, and every receipt and payment of the firm was by cheque. Among other balances, the balance sheet on that date showed:\n${shown.join('\n')}`,
      transactions: numbered([...outside, ...own]),
      hints: SET_HINTS.loans,
      distractorAccounts: [partnerLoan(r.name), 'bankLoan', partnerCapital(a), ...(kinds.includes('lent') ? [] : [loanToPartner(c)])],
    };
  },
  verify: (q) => {
    if (!setHolds()(q)) return false;
    const part = q.entries.find((e) => e.text.includes('agreed to take over'));
    return q.entries.every(({ text, expected }) => {
      const a = amountsIn(text);
      const lender = /([A-Z][a-z]+)'s loan/.exec(text)?.[1] ?? '';
      if (text.includes('was repaid in full')) return two(expected, REAL, 'bank', a[0]);
      if (text.includes('together with interest')) return two(expected, REAL, 'bank', a[0] + a[1]);
      if (text.includes('in part payment and was paid the balance')) return two(expected, REAL, 'bank', a[0] - a[1]);
      if (text.includes('agreed to pay off the bank loan')) return two(expected, REAL, partnerCapital(firstName(text)), a[0]);
      if (text.includes('was closed;')) {
        const borrower = /had given to ([A-Z][a-z]+) was closed/.exec(text)?.[1] ?? '';
        return two(expected, partnerCapital(borrower), loanToPartner(borrower), a[0]);
      }
      if (text.includes('agreed to take over')) return two(expected, partnerLoan(lender), REAL, a[0]);
      if (text.includes('the balance of')) {
        const [taken, loan] = part ? amountsIn(part.text) : [0, 0];
        return part !== undefined && two(expected, partnerLoan(lender), 'bank', loan - taken);
      }
      if (text.startsWith('After the outside liabilities')) return two(expected, partnerLoan(lender), 'bank', a[0]);
      const personally = /([A-Z][a-z]+) agreed to pay it personally/.exec(text)?.[1];
      return two(expected, REAL, personally ? partnerCapital(personally) : 'bank', a[0]);
    });
  },
});

// ---------------------------------------------------------------------------------------------------------------
// The books of one dissolution: a balance sheet, what happened to it, and every entry that closes the books. The
// whole-dissolution set and the five formats are all made from it.
// ---------------------------------------------------------------------------------------------------------------

type Money = 'bank' | 'cash';
const MONEY: Record<Money, { account: string; sheet: string; the: string; paid: string }> = {
  bank: { account: 'Bank A/c', sheet: 'Cash at bank', the: 'the cash at bank', paid: 'by cheque' },
  cash: { account: 'Cash A/c', sheet: 'Cash in hand', the: 'the cash in hand', paid: 'in cash' },
};
/** How the stock goes, and how the second fixed asset goes. */
type StockWay = 'sold' | 'taken' | 'creditor';
type SecondWay = 'sold' | 'silent' | 'partner' | 'creditor';
/**
 * Realisation expenses: borne and paid by the firm; borne by the firm and paid by a partner; borne by a partner for a
 * remuneration and paid by that partner, or by the firm on the partner's behalf; borne by a partner for nothing and
 * paid by the firm on the partner's behalf, or by the partner.
 */
type ExpenseForm = 'firm' | 'partnerPays' | 'feePersonal' | 'feeFirmPays' | 'borneFirmPays' | 'bornePersonal';
type Reserves = 'none' | 'reserve' | 'profit' | 'loss' | 'reserveAndLoss';
type Hidden = 'none' | 'asset' | 'liability' | 'both';

interface WindUp {
  size?: 2 | 3;
  money?: Money;
  /** The pairs to draw from: how the stock goes and how the second fixed asset goes. At most one of the two is accepted by the creditors. */
  ways: readonly (readonly [StockWay, SecondWay])[];
  /** May the debtors have a provision against them (two seeds in three then do). */
  provision?: boolean;
  /** May there be goodwill or patents about which nothing is said (one seed in three). */
  intangible?: boolean;
  /** In how many seeds of four there is a second outside liability, and may a partner agree to pay it (one in three of those). */
  secondLiability?: number;
  liabilityTaken?: boolean;
  /** In how many seeds of four a partner has lent the firm money. */
  partnerLoan?: number;
  reserves: readonly Reserves[];
  /** May the firm have lent a partner money (one seed in three). */
  loanTo?: boolean;
  unrecorded: readonly Hidden[];
  expenses: readonly ExpenseForm[];
  /** One partner's capital account ends with a debit balance, and that partner brings the amount in. */
  shortfall?: boolean;
}

interface Owned {
  t: Thing;
  book: number;
  /** The money the asset fetched. */
  cash: number;
  taken?: { by: number; at: number };
  /** The value at which the creditors accepted it. */
  given?: number;
  /** Nothing is said about it: book value if tangible, nothing if intangible. */
  silent?: true;
  /** Of the debtors, when the data gives the bad debts and not the amount collected. */
  bad?: number;
}
interface Owed {
  id: string;
  label: string;
  the: string;
  plural: boolean;
  /** What a row about it says in brackets: "creditors". */
  what: string;
  book: number;
  /** What the firm paid to settle it. */
  cash: number;
  /** The partner who agreed to pay it personally. */
  by?: number;
}
interface Step {
  kind: 'assets' | 'liabilities' | 'realised' | 'taken' | 'paid' | 'borne' | 'expenses' | 'onBehalf' | 'accumulated' | 'loanTo' | 'result' | 'loan' | 'broughtIn' | 'final';
  lines: JournalLine[];
  /** What the entry is about, written in brackets after the account wherever the entry gives a row: "stock", "loss". */
  what?: string;
}
interface Books {
  f: Firm;
  money: Money;
  bank: number;
  capitals: number[];
  assets: Owned[];
  provision: number;
  liabs: Owed[];
  /** Reserves and accumulated profits (credit) and losses (debit), which go to the capital accounts. */
  accumulated: { id: string; label: string; name: string; amount: number; credit: boolean }[];
  /** A partner's own loan to the firm, and a loan the firm gave a partner. */
  loan: { by: number; amount: number } | null;
  loanTo: { to: number; amount: number } | null;
  extraAsset: { what: string; short: string; cash: number; taken?: { by: number; at: number } } | null;
  extraLiab: { what: string; short: string; amount: number; by?: number } | null;
  exp: { form: ExpenseForm; by: number; actual: number; fee: number };
  /** The profit (positive) or loss on realisation, and what each capital account comes to before the last entry. */
  result: number;
  finals: number[];
  /** What happened, one event to a line; `capital` marks those a capital account has to do with. */
  events: { text: string; capital: boolean }[];
  /** Every entry of the dissolution, in order. */
  steps: Step[];
}

const STOCK = TANGIBLE[0];
const DEBTORS: Thing = { id: 'debtors', name: 'Debtors', the: 'the debtors', plural: true };
const MAIN_ASSETS: Thing[] = [TANGIBLE[1], TANGIBLE[3], TANGIBLE[4]];
const SECOND_ASSETS: Thing[] = [TANGIBLE[2], TANGIBLE[5], TANGIBLE[6]];
/** Things that were never in the books, or were written off: `max` keeps what each fetches believable. */
const OLD_THINGS: { what: string; short: string; id: string; max: number }[] = [
  { what: 'an old typewriter that had been written off completely', short: 'old typewriter', id: 'officeEquipment', max: 6000 },
  { what: 'an old computer that had been written off in an earlier year', short: 'old computer', id: 'computers', max: 12000 },
  { what: 'an old scooter that was not recorded in the books', short: 'old scooter', id: 'vehicles', max: 20000 },
  { what: 'an old generator that had been written off in an earlier year', short: 'old generator', id: 'machinery', max: 15000 },
];
const UNPAID: { what: (x: string) => string; short: string }[] = [
  { what: (x) => `a bill of ${x} for repairs, which had not been recorded in the books,`, short: 'repairs bill' },
  { what: (x) => `a claim of ${x} for damages, for which the books showed nothing,`, short: 'claim for damages' },
  { what: (x) => `an electricity bill of ${x}, which had not been recorded in the books,`, short: 'electricity bill' },
];
const SILENT_ASSETS = 'An asset about which nothing is said realised its book value if it is tangible and nothing if it is intangible.';

type Core = Pick<Books, 'f' | 'assets' | 'provision' | 'liabs' | 'accumulated' | 'loanTo' | 'extraAsset' | 'extraLiab' | 'exp'>;
const forFee = (e: Books['exp']): boolean => e.form === 'feePersonal' || e.form === 'feeFirmPays';
/** What Realisation A/c bears for the expenses, what the partner concerned is credited with, and what the firm paid on that partner's behalf. */
const chargeOf = (e: Books['exp']): number => (e.form === 'firm' || e.form === 'partnerPays' ? e.actual : forFee(e) ? e.fee : 0);
const creditedFor = (e: Books['exp']): number => (e.form === 'partnerPays' ? e.actual : forFee(e) ? e.fee : 0);
const chargedFor = (e: Books['exp']): number => (e.form === 'feeFirmPays' || e.form === 'borneFirmPays' ? e.actual : 0);
/** The two sides of Realisation A/c before its balance is transferred, straight from the items. */
const realTotals = (b: Core): { debit: number; credit: number } => ({
  debit: total(b.assets.map((a) => a.book)) + total(b.liabs.map((l) => (l.by === undefined ? l.cash : l.book))) + (b.extraLiab?.amount ?? 0) + chargeOf(b.exp),
  credit:
    total(b.liabs.map((l) => l.book)) + b.provision + total(b.assets.map((a) => a.cash + (a.taken?.at ?? 0))) +
    (b.extraAsset ? b.extraAsset.cash + (b.extraAsset.taken?.at ?? 0) : 0),
});
/** The profit (positive) or loss on realisation, straight from the items. */
const gainOf = (b: Core): number => realTotals(b).credit - realTotals(b).debit;
/** What partner `i` is credited with less what the partner is debited with, the capital and the share of the result apart. */
const netOf = (b: Core, i: number): number =>
  total(b.accumulated.map((x) => (x.credit ? 1 : -1) * shareOf(b.f, x.amount, i))) -
  total(b.assets.filter((a) => a.taken?.by === i).map((a) => a.taken!.at)) -
  (b.extraAsset?.taken?.by === i ? b.extraAsset.taken.at : 0) +
  total(b.liabs.filter((l) => l.by === i).map((l) => l.book)) +
  (b.extraLiab?.by === i ? b.extraLiab.amount : 0) +
  (b.exp.by === i ? creditedFor(b.exp) - chargedFor(b.exp) : 0) -
  (b.loanTo?.to === i ? b.loanTo.amount : 0);

/** One dissolution, made to the given pattern. Null for a combination that does not work out. */
function windUp(rng: Rng, o: WindUp): Books | null {
  const f = firm(rng, o.size ? { size: o.size } : {});
  const n = f.names.length;
  const who = (i: number): string => f.names[i];
  const anyone = (): number => rng.int(0, n - 1);
  const money = o.money ?? 'bank';
  // In a question about a partner who has to bring cash in, `short` is that partner.
  const short = o.shortfall ? anyone() : -1;
  const another = (): number => {
    const i = anyone();
    return i === short ? (i + 1) % n : i;
  };
  const [stockWay, secondWay] = rng.pick(o.ways);

  // What the firm owns. The main fixed asset is sold, and its price is settled last so that every share is in whole rupees.
  const main = rng.pick(MAIN_ASSETS);
  const second = rng.pick(SECOND_ASSETS);
  const assets: Owned[] = [{ t: main, book: rng.step(120000, 400000, 10000), cash: 0 }];
  let accepted: { t: Thing; at: number } | null = null;
  const stock = rng.step(40000, 160000, 10000);
  const stockAt = stock + (stock / 100) * rng.pick([-20, -10, 10]);
  if (stockWay === 'sold') assets.push({ t: STOCK, book: stock, cash: stockAt });
  else if (stockWay === 'taken') assets.push({ t: STOCK, book: stock, cash: 0, taken: { by: short >= 0 ? short : anyone(), at: stockAt } });
  else {
    assets.push({ t: STOCK, book: stock, cash: 0, given: stockAt });
    accepted = { t: STOCK, at: stockAt };
  }
  const debtors = rng.step(60000, 200000, 10000);
  const provision = o.provision && rng.int(0, 2) > 0 ? rng.step(2000, 10000, 1000) : 0;
  const bad = rng.step(1000, 12000, 1000);
  assets.push({ t: DEBTORS, book: debtors, cash: debtors - bad, ...(rng.int(0, 1) === 0 ? { bad } : {}) });
  const secondBook = rng.step(20000, 80000, 5000);
  const secondAt = secondBook + rng.pick([-5000, 5000]);
  if (secondWay === 'sold') assets.push({ t: second, book: secondBook, cash: secondAt });
  else if (secondWay === 'silent') assets.push({ t: second, book: secondBook, cash: secondBook, silent: true });
  else if (secondWay === 'partner') assets.push({ t: second, book: secondBook, cash: 0, taken: { by: another(), at: secondAt } });
  else {
    assets.push({ t: second, book: secondBook, cash: 0, given: secondAt });
    accepted = { t: second, at: secondAt };
  }
  if (o.intangible && rng.int(0, 2) === 0) assets.push({ t: rng.pick(INTANGIBLE), book: rng.step(10000, 40000, 5000), cash: 0, silent: true });

  // What it owes to outsiders.
  const liabs: Owed[] = [];
  const creditors = { id: 'creditors', label: 'Creditors', the: 'the creditors', plural: true, what: 'creditors' };
  if (accepted) {
    const rest = rng.step(10000, 60000, 5000);
    liabs.push({ ...creditors, book: accepted.at + rest, cash: rest });
  } else {
    const owed = rng.step(50000, 150000, 5000);
    liabs.push({ ...creditors, book: owed, cash: owed - (rng.int(0, 1) === 0 ? rng.step(1000, 5000, 1000) : 0) });
  }
  if (rng.int(1, 4) <= (o.secondLiability ?? 0)) {
    const r = relative(rng, who(anyone()));
    const l = rng.pick<Omit<Owed, 'cash'>>([
      { id: 'billsPayable', label: 'Bills payable', the: 'the bills payable', plural: true, what: 'bills payable', book: rng.step(10000, 50000, 5000) },
      { id: 'bankLoan', label: 'Bank loan', the: 'the bank loan', plural: false, what: 'bank loan', book: rng.step(50000, 150000, 10000) },
      { id: 'outstandingExpenses', label: 'Outstanding expenses', the: 'the outstanding expenses', plural: true, what: 'outstanding expenses', book: rng.step(3000, 15000, 1000) },
      { id: partnerLoan(r.name), label: `Loan from ${r.as}`, the: `the loan from ${r.name}`, plural: false, what: `${r.name}'s loan`, book: rng.step(20000, 60000, 10000) },
    ]);
    if (o.liabilityTaken && l.id !== 'outstandingExpenses' && rng.int(0, 2) === 0) liabs.push({ ...l, cash: 0, by: another() });
    else liabs.push({ ...l, cash: l.book });
  }

  // What belongs to the partners, and what stands between a partner and the firm.
  // The lender is never the partner who falls short: a loan would be set off against that partner's debit balance,
  // not repaid by cheque while the partner still owes the firm.
  const loan = rng.int(1, 4) <= (o.partnerLoan ?? 0) ? { by: another(), amount: rng.step(20000, 60000, 10000) } : null;
  const kept = rng.pick(o.reserves);
  const accumulated: Books['accumulated'] = [];
  if (kept === 'reserve' || kept === 'reserveAndLoss') {
    accumulated.push({ id: 'generalReserve', label: 'General Reserve', name: 'General Reserve A/c', amount: f.sum * rng.step(2000, 8000, 1000), credit: true });
  }
  if (kept === 'profit') {
    accumulated.push({ id: 'profitAndLoss', label: 'Profit and Loss A/c (credit balance)', name: 'Profit and Loss A/c', amount: f.sum * rng.step(2000, 6000, 1000), credit: true });
  }
  if (kept === 'loss' || kept === 'reserveAndLoss') {
    // Never the same figure as the reserve beside it: the two would look like one balance written twice.
    const lost = f.sum * rng.step(1000, 5000, 1000);
    accumulated.push({ id: 'profitAndLoss', label: 'Profit and Loss A/c (debit balance)', name: 'Profit and Loss A/c', amount: lost === accumulated[0]?.amount ? lost + f.sum * 1000 : lost, credit: false });
  }
  const borrower = short >= 0 ? short : anyone();
  const loanTo = o.loanTo && rng.int(0, 2) === 0 && loan?.by !== borrower ? { to: borrower, amount: rng.step(10000, 40000, 5000) } : null;

  // What was never in the books.
  const hidden = rng.pick(o.unrecorded);
  let extraAsset: Books['extraAsset'] = null;
  if (hidden === 'asset' || hidden === 'both') {
    const thing = rng.pick(OLD_THINGS.filter((x) => x.id !== main.id && x.id !== second.id));
    const value = rng.step(2000, thing.max, 1000);
    extraAsset = rng.int(0, 1) === 0 ? { what: thing.what, short: thing.short, cash: value } : { what: thing.what, short: thing.short, cash: 0, taken: { by: anyone(), at: value } };
  }
  let extraLiab: Books['extraLiab'] = null;
  if (hidden === 'liability' || hidden === 'both') {
    const bill = rng.pick(UNPAID);
    const amount = rng.step(2000, 10000, 1000);
    extraLiab = { what: bill.what(inr(amount)), short: bill.short, amount, ...(rng.int(0, 2) === 0 ? { by: another() } : {}) };
  }
  const actual = rng.step(2000, 10000, 1000);
  // The remuneration is never the same as the expenses (a row would not show which was meant), nor a trifle.
  const exp: Books['exp'] = { form: rng.pick(o.expenses), by: anyone(), actual, fee: actual + rng.pick([-1000, 1000, 2000, 3000].filter((d) => actual + d >= 3000)) };

  // The price of the main asset: near its book value (well below it when a partner is to fall short), and such that
  // every share of the profit or loss on realisation is a whole number of hundreds of rupees.
  const core: Core = { f, assets, provision, liabs, accumulated, loanTo, extraAsset, extraLiab, exp };
  const base = assets[0].book + (assets[0].book / 100) * rng.pick(o.shortfall ? [-40, -30, -20] : [-20, -10, 10, 20]);
  assets[0].cash = base;
  const draft = gainOf(core);
  const unit = f.sum * 100;
  let k = 0;
  while (k < 10 && (((draft - k * 1000) % unit) + unit) % unit !== 0) k++;
  if (k === 10) return null;
  assets[0].cash = base - k * 1000;
  const result = gainOf(core);
  // A result too small to be worth sharing is not asked.
  if (Math.abs(result) < f.sum * 1000) return null;

  // The balance at bank makes the capitals come to round figures; the two sides of the balance sheet agree by it.
  const before =
    total(assets.map((a) => a.book)) + (loanTo?.amount ?? 0) + total(accumulated.map((x) => (x.credit ? -x.amount : x.amount))) -
    total(liabs.map((l) => l.book)) - provision - (loan?.amount ?? 0);
  if (before <= 0) return null;
  const upTo = (x: number): number => (10000 - (x % 10000)) % 10000;
  const nets = f.names.map((_, i) => netOf(core, i) + shareOf(f, result, i));
  const bankBase = rng.step(15000, 60000, 5000);
  const capitals = f.names.map(() => 0);
  let bank: number;
  if (short < 0) {
    bank = bankBase + upTo(before + bankBase);
    const all = before + bank;
    if (all < n * 60000) return null;
    for (let i = 0; i < n - 1; i++) capitals[i] = Math.round((all * rng.pick(n === 2 ? [0.4, 0.5, 0.6] : [0.3, 0.35, 0.4])) / 10000) * 10000;
    capitals[n - 1] = all - total(capitals);
  } else {
    // The partner who falls short has a small capital: what is debited to it exceeds it by a few thousand rupees.
    const mine = Math.floor((-nets[short] - rng.step(3000, 20000, 1000)) / 5000) * 5000;
    if (mine < 20000) return null;
    bank = bankBase + upTo(before + bankBase - mine);
    const rest = before + bank - mine;
    const others = f.names.map((_, i) => i).filter((i) => i !== short);
    if (rest < others.length * 80000) return null;
    capitals[short] = mine;
    capitals[others[0]] = others.length === 1 ? rest : Math.round((rest * rng.pick([0.4, 0.5, 0.6])) / 10000) * 10000;
    if (others.length === 2) capitals[others[1]] = rest - capitals[others[0]];
  }
  const finals = capitals.map((c, i) => c + nets[i]);
  // Nobody is left with a trifle, and nobody but the partner the question is about owes the firm.
  if (finals.some((x, i) => (i === short ? x >= 0 : x < 5000))) return null;

  // What happened, as the question tells it.
  const events: Books['events'] = [];
  const tell = (text: string, capital = false) => events.push({ text, capital });
  for (const a of assets) {
    if (a.silent || a.given !== undefined) continue;
    if (a.taken) tell(`${who(a.taken.by)} took over ${a.t.the} at ${inr(a.taken.at)}.`, true);
    else if (a.bad) tell(`Bad debts came to ${inr(a.bad)}; the remaining debtors paid in full.`);
    else if (a.t.id === 'debtors') tell(`The debtors realised ${inr(a.cash)}.`);
    else tell(`${cap(a.t.the)} ${was(a.t)} sold for ${inr(a.cash)}.`);
  }
  if (extraAsset?.taken) tell(`${cap(extraAsset.what)} was taken over by ${who(extraAsset.taken.by)} at ${inr(extraAsset.taken.at)}.`, true);
  else if (extraAsset) tell(`${cap(extraAsset.what)} was sold for ${inr(extraAsset.cash)}.`);
  const inFull: Owed[] = [];
  for (const l of liabs) {
    if (l.by !== undefined) tell(`${who(l.by)} agreed to pay off ${l.the}, ${inr(l.book)}, personally.`, true);
    else if (accepted && l.id === 'creditors') tell(`The creditors accepted ${accepted.t.the} at ${inr(accepted.at)} in part settlement of their claim and were paid the balance.`);
    else if (l.cash < l.book) tell(`The creditors were paid ${inr(l.cash)} in full settlement.`);
    else inFull.push(l);
  }
  if (inFull.length) tell(`${cap(list(inFull.map((l) => l.the)))} ${inFull.length > 1 || inFull[0].plural ? 'were' : 'was'} paid in full.`);
  if (extraLiab) {
    tell(
      extraLiab.by === undefined ? `${cap(extraLiab.what)} was paid by the firm.` : `${cap(extraLiab.what)} was paid by ${who(extraLiab.by)} personally, on the firm's behalf.`,
      extraLiab.by !== undefined,
    );
  }
  const x = who(exp.by);
  const expenseText: Record<ExpenseForm, string> = {
    firm: `Realisation expenses of ${inr(actual)} were borne and paid by the firm.`,
    partnerPays: `Realisation expenses of ${inr(actual)} were to be borne by the firm; ${x} paid them out of ${x}'s own money.`,
    feePersonal: `${x} was to bear the realisation expenses for a remuneration of ${inr(exp.fee)}. The expenses, ${inr(actual)}, were paid by ${x} out of ${x}'s own money.`,
    feeFirmPays: `${x} was to bear the realisation expenses for a remuneration of ${inr(exp.fee)}. The expenses, ${inr(actual)}, were paid by the firm on ${x}'s behalf.`,
    borneFirmPays: `${x} had agreed to bear the realisation expenses without any remuneration. The expenses, ${inr(actual)}, were paid by the firm on ${x}'s behalf.`,
    bornePersonal: `${x} had agreed to bear the realisation expenses without any remuneration, and paid them, ${inr(actual)}, out of ${x}'s own money.`,
  };
  tell(expenseText[exp.form], exp.form !== 'firm');

  // Every entry of the dissolution, in the order of the work. The balances that belong to the partners (reserves,
  // undistributed profit, a past loss, a loan to a partner) are closed straight after the two transfers, so that in
  // the capital accounts they stand next to the opening balances, where a board answer writes them.
  const capital = (i: number): string => partnerCapital(who(i));
  const shared = (amount: number, side: 'Dr' | 'Cr'): JournalLine[] => f.names.map((_, i) => (side === 'Dr' ? dr : cr)(capital(i), shareOf(f, amount, i)));
  const steps: Step[] = [
    { kind: 'assets', lines: [dr(REAL, total(assets.map((a) => a.book))), ...assets.map((a) => cr(a.t.id, a.book))] },
    {
      kind: 'liabilities',
      lines: [...liabs.map((l) => dr(l.id, l.book)), ...(provision ? [dr('provisionForDoubtfulDebts', provision)] : []), cr(REAL, total(liabs.map((l) => l.book)) + provision)],
    },
  ];
  for (const a of accumulated) steps.push({ kind: 'accumulated', lines: a.credit ? [dr(a.id, a.amount), ...shared(a.amount, 'Cr')] : [...shared(a.amount, 'Dr'), cr(a.id, a.amount)] });
  if (loanTo) steps.push({ kind: 'loanTo', lines: [dr(capital(loanTo.to), loanTo.amount), cr(loanToPartner(who(loanTo.to)), loanTo.amount)] });
  for (const a of assets) {
    if (a.cash) steps.push({ kind: 'realised', what: low(a.t.name), lines: [dr(money, a.cash), cr(REAL, a.cash)] });
    if (a.taken) steps.push({ kind: 'taken', what: low(a.t.name), lines: [dr(capital(a.taken.by), a.taken.at), cr(REAL, a.taken.at)] });
  }
  if (extraAsset?.cash) steps.push({ kind: 'realised', what: extraAsset.short, lines: [dr(money, extraAsset.cash), cr(REAL, extraAsset.cash)] });
  if (extraAsset?.taken) steps.push({ kind: 'taken', what: extraAsset.short, lines: [dr(capital(extraAsset.taken.by), extraAsset.taken.at), cr(REAL, extraAsset.taken.at)] });
  for (const l of liabs) {
    if (l.by !== undefined) steps.push({ kind: 'borne', what: l.what, lines: [dr(REAL, l.book), cr(capital(l.by), l.book)] });
    else steps.push({ kind: 'paid', what: l.what, lines: [dr(REAL, l.cash), cr(money, l.cash)] });
  }
  if (extraLiab) {
    steps.push(
      extraLiab.by === undefined
        ? { kind: 'paid', what: extraLiab.short, lines: [dr(REAL, extraLiab.amount), cr(money, extraLiab.amount)] }
        : { kind: 'borne', what: extraLiab.short, lines: [dr(REAL, extraLiab.amount), cr(capital(extraLiab.by), extraLiab.amount)] },
    );
  }
  if (chargeOf(exp)) {
    steps.push({
      kind: 'expenses',
      what: forFee(exp) ? 'remuneration' : 'realisation expenses',
      lines: [dr(REAL, chargeOf(exp)), cr(exp.form === 'firm' ? money : capital(exp.by), chargeOf(exp))],
    });
  }
  if (chargedFor(exp)) steps.push({ kind: 'onBehalf', what: 'realisation expenses', lines: [dr(capital(exp.by), actual), cr(money, actual)] });
  steps.push(
    result > 0
      ? { kind: 'result', what: 'profit', lines: [dr(REAL, result), ...shared(result, 'Cr')] }
      : { kind: 'result', what: 'loss', lines: [...shared(-result, 'Dr'), cr(REAL, -result)] },
  );
  if (loan) steps.push({ kind: 'loan', lines: [dr(partnerLoan(who(loan.by)), loan.amount), cr(money, loan.amount)] });
  if (short >= 0) steps.push({ kind: 'broughtIn', lines: [dr(money, -finals[short]), cr(capital(short), -finals[short])] });
  steps.push({ kind: 'final', lines: [...f.names.flatMap((_, i) => (finals[i] > 0 ? [dr(capital(i), finals[i])] : [])), cr(money, total(finals.filter((v) => v > 0)))] });

  // The firm never pays out money it does not have, and the last payment empties the bank.
  let held = rupees(bank);
  for (const s of steps) {
    for (const l of s.lines) if (l.accountId === money) held += l.side === 'Dr' ? l.amount : -l.amount;
    if (held < 0) return null;
  }
  if (held !== 0) return null;
  return { f, money, bank, capitals, assets, provision, liabs, accumulated, loan, loanTo, extraAsset, extraLiab, exp, result, finals, events, steps };
}

/** The balance sheet of a dissolution, a heading and then one balance to a line. Its two sides agree: see `opened`. */
const sheetLines = (b: Books): string[] => [
  'Liabilities:',
  ...b.liabs.map((l) => `${l.label}: ${inr(l.book)}`),
  ...(b.loan ? [`${b.f.names[b.loan.by]}'s loan: ${inr(b.loan.amount)}`] : []),
  ...(b.provision ? [`Provision for doubtful debts: ${inr(b.provision)}`] : []),
  ...b.accumulated.filter((x) => x.credit).map((x) => `${x.label}: ${inr(x.amount)}`),
  ...b.f.names.map((nm, i) => `${nm}'s capital: ${inr(b.capitals[i])}`),
  'Assets:',
  `${MONEY[b.money].sheet}: ${inr(b.bank)}`,
  ...b.assets.map((a) => `${a.t.name}: ${inr(a.book)}`),
  ...(b.loanTo ? [`Loan to ${b.f.names[b.loanTo.to]}: ${inr(b.loanTo.amount)}`] : []),
  ...b.accumulated.filter((x) => !x.credit).map((x) => `${x.label}: ${inr(x.amount)}`),
];

/** The balance sheet as one opening entry, for `verify`. */
const opened = (b: Books): JournalLine[] => [
  dr(b.money, b.bank),
  ...b.assets.map((a) => dr(a.t.id, a.book)),
  ...(b.loanTo ? [dr(loanToPartner(b.f.names[b.loanTo.to]), b.loanTo.amount)] : []),
  ...b.accumulated.map((x) => (x.credit ? cr : dr)(x.id, x.amount)),
  ...b.liabs.map((l) => cr(l.id, l.book)),
  ...(b.provision ? [cr('provisionForDoubtfulDebts', b.provision)] : []),
  ...(b.loan ? [cr(partnerLoan(b.f.names[b.loan.by]), b.loan.amount)] : []),
  ...b.capitals.map((k, i) => cr(partnerCapital(b.f.names[i]), k)),
];
/**
 * True when the given entries, posted on top of the balance sheet, close every account of the books: the balance sheet
 * agrees, and no asset, liability, reserve, loan, capital or bank balance is left. This is the long way round, by the
 * ledger, where `gainOf` and `netOf` go the short way, by the figures.
 */
function closes(b: Books, entries: readonly JournalLine[][] = b.steps.map((s) => s.lines)): boolean {
  const sheet = opened(b);
  return total(sheet.map((l) => (l.side === 'Dr' ? l.amount : -l.amount))) === 0 && [...post([sheet, ...entries]).values()].every((v) => v === 0);
}
/** What each partner is due (or, if negative, owes) at the end, the short way: from the figures and not from the entries. */
const duesOf = (b: Books): number[] => b.f.names.map((_, i) => b.capitals[i] + netOf(b, i) + shareOf(b.f, gainOf(b), i));

const keptBooks = keepFor<Books>();

// 4. dis-set-whole: a whole dissolution in eight entries, in order: the two transfers, the money received, the
//    liabilities paid, the expenses, the result to the capital accounts and the final payment, with one more of a
//    reserve, undistributed profit, a past loss, an asset taken over by a partner or a partner's loan (complex)
const setWhole = journalSetTemplate({
  id: 'dis-set-whole', topicId: T, conceptId: SETS, difficulty: 'complex',
  generate: (rng) => {
    const more = rng.pick(['reserve', 'reserve', 'profit', 'loss', 'taken', 'loan'] as const);
    const b = windUp(rng, {
      ways: [[more === 'taken' ? 'taken' : 'sold', 'sold']],
      provision: true,
      intangible: true,
      secondLiability: 2,
      partnerLoan: more === 'loan' ? 4 : 0,
      reserves: [more === 'reserve' || more === 'profit' || more === 'loss' ? more : 'none'],
      unrecorded: ['none'],
      expenses: ['firm', 'partnerPays', 'feePersonal'],
    });
    if (!b) return null;
    const { f } = b;
    const who = (i: number): string => f.names[i];
    const of = (kind: Step['kind']): Step[] => b.steps.filter((s) => s.kind === kind);
    const sold = b.assets.filter((a) => a.cash > 0);
    const nil = b.assets.find((a) => a.cash === 0 && !a.taken);
    const received = total(sold.map((a) => a.cash));
    const paid = total(b.liabs.map((l) => l.cash));
    const split = (amount: number): string => f.names.map((nm, i) => `${nm} ${fraction(f, i)} x ${inr(amount)} = ${inr(shareOf(f, amount, i))}`).join('; ');
    const totals = realTotals(b);
    const keptOut = [
      ...(b.loan ? [`${who(b.loan.by)}'s loan (a partner's own loan)`] : []),
      ...b.accumulated.filter((a) => a.credit).map((a) => (a.id === 'generalReserve' ? 'General Reserve (profit kept back)' : 'the credit balance of Profit and Loss A/c (undistributed profit)')),
      'the capitals',
    ];
    const x = who(b.exp.by);

    const items: Item[] = [
      {
        text: 'The assets that go to Realisation A/c were transferred to it.',
        lines: of('assets')[0].lines,
        explanation: [
          `Every asset except the cash at bank${b.accumulated.some((a) => !a.credit) ? ' and the debit balance of Profit and Loss A/c, which is a past loss,' : ''} is transferred at its book value: ${b.assets.map((a) => `${low(a.t.name)} ${inr(a.book)}`).join(', ')}, in all ${inr(total(b.assets.map((a) => a.book)))}.`,
          `Realisation A/c is debited with the total and each asset account is credited, which closes it.${b.provision ? ' The debtors go at their gross figure: the provision against them is dealt with in the next entry.' : ''}`,
        ],
      },
      {
        text: 'The balances on the liabilities side that go to Realisation A/c were transferred to it.',
        lines: of('liabilities')[0].lines,
        explanation: [
          `What is owed to outsiders${b.provision ? ', and the provision against the debtors,' : ''} is transferred: ${[...b.liabs.map((l) => `${low(l.label)} ${inr(l.book)}`), ...(b.provision ? [`provision for doubtful debts ${inr(b.provision)}`] : [])].join(', ')}, in all ${inr(total(b.liabs.map((l) => l.book)) + b.provision)}.`,
          `Each of these accounts is debited and Realisation A/c is credited with the total. ${cap(list(keptOut))} stay in their own accounts.`,
          ...b.liabs.filter((l) => l.id.startsWith('partnerLoan:')).map((l) => `${cap(l.the)} is owed to an outsider: a relative of a partner is not a partner.`),
        ],
      },
      {
        text: `The assets fetched these amounts: ${sold.map((a) => `${a.t.the} ${inr(a.cash)}`).join(', ')}.${nil ? ` Nothing could be realised for ${nil.t.the}.` : ''}`,
        lines: [dr('bank', received), cr(REAL, received)],
        explanation: [
          `Money received = ${sold.map((a) => inr(a.cash)).join(' + ')} = ${inr(received)}: Bank A/c is debited.`,
          `Realisation A/c is credited with what the assets fetched.${nil ? ` ${cap(nil.t.the)} fetched nothing, so there is nothing to record for ${nil.t.plural ? 'them' : 'it'}: the whole book value stays in Realisation A/c as a loss.` : ''}`,
        ],
      },
      ...b.assets.filter((a) => a.taken).map((a): Item => ({
        text: `${who(a.taken!.by)} took over ${a.t.the} at ${inr(a.taken!.at)}.`,
        lines: of('taken')[0].lines,
        explanation: [`${who(a.taken!.by)} takes ${a.t.the} in place of money, so ${who(a.taken!.by)}'s Capital A/c is debited with the agreed value.`, 'Realisation A/c is credited, as on a sale.'],
      })),
      {
        text: b.liabs.every((l) => l.cash === l.book)
          ? `${cap(list(b.liabs.map((l) => l.the)))} ${b.liabs.length > 1 || b.liabs[0].plural ? 'were' : 'was'} paid in full.`
          : `${b.liabs.map((l, i) => `${i === 0 ? cap(l.the) : l.the} ${l.plural ? 'were' : 'was'} paid ${l.cash < l.book ? `${inr(l.cash)} in full settlement` : 'in full'}`).join(', and ')}.`,
        lines: [dr(REAL, paid), cr('bank', paid)],
        explanation: [
          ...(b.liabs.length > 1 ? [`Paid = ${b.liabs.map((l) => inr(l.cash)).join(' + ')} = ${inr(paid)}.`] : []),
          `The liabilities stand on the credit of Realisation A/c, so the ${inr(paid)} paid for them is debited to it; Bank A/c is credited.`,
          ...b.liabs.filter((l) => l.cash < l.book).map((l) => `${cap(l.the)} gave up ${inr(l.book - l.cash)}, which needs no entry: it stays in Realisation A/c as a gain.`),
        ],
      },
      {
        text: b.events[b.events.length - 1].text,
        lines: of('expenses')[0].lines,
        explanation:
          b.exp.form === 'firm'
            ? ['The firm bears the expenses, so they are a cost of realisation: Realisation A/c is debited.', 'The firm paid them, so Bank A/c is credited.']
            : b.exp.form === 'partnerPays'
              ? ['The firm bears the expenses, so Realisation A/c is debited.', `No money left the firm. ${x} paid for the firm, so the firm owes ${x} the amount: ${x}'s Capital A/c is credited.`]
              : [
                  `The firm owes ${x} the agreed remuneration, ${inr(b.exp.fee)}: Realisation A/c is debited and ${x}'s Capital A/c is credited.`,
                  `The expenses of ${inr(b.exp.actual)} are ${x}'s own affair: ${x} agreed to bear them and paid them personally, so no entry is passed for them.`,
                ],
      },
      ...(b.loan
        ? [{
            text: `${who(b.loan.by)}'s loan was repaid.`,
            lines: of('loan')[0].lines,
            explanation: [`A partner's own loan never goes to Realisation A/c: it stays in ${who(b.loan.by)}'s Loan A/c.`, 'It is repaid after the outside liabilities and before the capitals: the loan account is debited and Bank A/c is credited.'],
          }]
        : []),
      {
        text: 'Realisation A/c was closed by transferring its balance to the capital accounts.',
        lines: of('result')[0].lines,
        explanation: [
          `Debit side of Realisation A/c: assets ${inr(total(b.assets.map((a) => a.book)))} + liabilities paid ${inr(paid)} + ${forFee(b.exp) ? 'remuneration' : 'expenses'} ${inr(chargeOf(b.exp))} = ${inr(totals.debit)}.`,
          `Credit side: liabilities${b.provision ? ' and provision' : ''} ${inr(total(b.liabs.map((l) => l.book)) + b.provision)} + money received ${inr(received)}${b.assets.some((a) => a.taken) ? ` + stock taken over ${inr(total(b.assets.map((a) => a.taken?.at ?? 0)))}` : ''} = ${inr(totals.credit)}.`,
          resultLine(totals.debit, totals.credit),
          `Shared in the profit-sharing ratio: ${split(Math.abs(b.result))}.`,
          b.result > 0 ? 'Realisation A/c is debited to close it and each capital account is credited with its share.' : 'Each capital account is debited with its share and Realisation A/c is credited to close it.',
        ],
      },
      ...b.accumulated.map((a): Item => ({
        text: a.id === 'generalReserve' ? 'The General Reserve was distributed among the partners.' : a.credit ? 'The credit balance of Profit and Loss A/c was distributed among the partners.' : 'The debit balance of Profit and Loss A/c was written off.',
        lines: of('accumulated')[0].lines,
        explanation: a.credit
          ? [`${a.name} holds profit that was never shared out. It is closed by a debit of ${inr(a.amount)} and credited to the capital accounts in the profit-sharing ratio: ${split(a.amount)}.`]
          : [`The debit balance of Profit and Loss A/c is a past loss. It is closed by a credit of ${inr(a.amount)} and debited to the capital accounts in the profit-sharing ratio: ${split(a.amount)}.`],
      })),
      {
        text: 'The partners were paid the amounts due to them, which closed the books.',
        lines: of('final')[0].lines,
        explanation: [
          ...f.names.map((nm, i) => {
            const plus = [
              `capital ${inr(b.capitals[i])}`,
              ...b.accumulated.filter((a) => a.credit).map((a) => `share of ${a.id === 'generalReserve' ? 'General Reserve' : 'undistributed profit'} ${inr(shareOf(f, a.amount, i))}`),
              ...(b.result > 0 ? [`share of profit ${inr(shareOf(f, b.result, i))}`] : []),
              ...(b.exp.by === i && creditedFor(b.exp) ? [`${forFee(b.exp) ? 'remuneration' : 'expenses paid for the firm'} ${inr(creditedFor(b.exp))}`] : []),
            ];
            const minus = [
              ...b.accumulated.filter((a) => !a.credit).map((a) => `share of the past loss ${inr(shareOf(f, a.amount, i))}`),
              ...(b.result < 0 ? [`share of loss ${inr(shareOf(f, -b.result, i))}`] : []),
              ...b.assets.filter((a) => a.taken?.by === i).map((a) => `${low(a.t.name)} taken over ${inr(a.taken!.at)}`),
            ];
            return `${nm}: ${plus.join(' + ')}${minus.length ? `, less ${minus.join(' and ')}` : ''} = ${inr(b.finals[i])}.`;
          }),
          `Each capital account is debited with its balance and Bank A/c is credited with the total, ${inr(total(b.finals))}, which is exactly what is left in the bank.`,
        ],
      },
    ];
    const opening = `${f.intro} ${FLUCTUATING} ${BY_CHEQUE} Its balance sheet on that date was as follows.\n${sheetLines(b).join('\n')}`;
    keptBooks.keep(opening, b);
    return {
      task: 'Pass the journal entries that close the books of the firm, one for each step below, in the order given.',
      opening,
      transactions: numbered(items),
      hints: SET_HINTS.whole,
      distractorAccounts: ['profitAndLossAppropriation', 'revaluation', ...(b.accumulated.length ? [] : ['generalReserve'])],
    };
  },
  verify: (q) => {
    const b = keptBooks.of(q.prompt.slice(q.prompt.indexOf('\n') + 1));
    if (!b || !setHolds()(q) || q.entries.length !== 8) return false;
    const entries = q.entries.map((e) => e.expected);
    // The bank is never overdrawn on the way, and the eight entries leave nothing in any account.
    let held = rupees(b.bank);
    for (const lines of entries) {
      for (const l of lines) if (l.accountId === 'bank') held += l.side === 'Dr' ? l.amount : -l.amount;
      if (held < 0) return false;
    }
    const result = gainOf(b);
    const closing = q.entries.find((e) => e.text.startsWith('Realisation A/c was closed'))?.expected ?? [];
    const last = entries[entries.length - 1];
    return (
      closes(b, entries) &&
      closing.some((l) => l.accountId === REAL && l.side === (result > 0 ? 'Dr' : 'Cr') && l.amount === rupees(Math.abs(result))) &&
      duesOf(b).every((due, i) => due >= 5000 && last.some((l) => l.accountId === partnerCapital(b.f.names[i]) && l.side === 'Dr' && l.amount === rupees(due)))
    );
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Formats. Each account is written up by the engine from the entries of the dissolution.
// ---------------------------------------------------------------------------------------------------------------

/** The date an opening balance is given in the books below: it is no entry of the dissolution. */
const OPENED = 'opening';
/** The entries of a dissolution as the engine posts them. Each carries its place among the steps as its date, so that a row an account shows can be traced back to its entry. */
const entriesOf = (b: Books): DatedEntry[] => b.steps.map((s, k) => ({ date: String(k), lines: s.lines }));
/** The sides of an account from the books: every row dated the day of dissolution, with what its entry was about in brackets ("Bank A/c (creditors)"). */
function written(b: Books, sides: Pick<AccountParts, 'left' | 'right'>): Pick<AccountParts, 'left' | 'right'> {
  const row = (r: FormatRowParts): FormatRowParts => {
    const what = b.steps[Number(r.date)]?.what;
    return { ...r, date: b.f.date, label: what ? `${r.label} (${what})` : r.label };
  };
  return { left: { ...sides.left, rows: sides.left.rows.map(row) }, right: { ...sides.right, rows: sides.right.rows.map(row) } };
}
/** Realisation A/c, which closes with the profit or loss; null if it did not close, or would be too long for a phone. */
function realisationAccount(b: Books): Pick<AccountParts, 'left' | 'right'> | null {
  const view = accountOf(entriesOf(b), REAL);
  const sides = written(b, ledgerSides(view, { closeOn: b.f.date }));
  return view.balance || sides.left.rows.length > 14 || sides.right.rows.length > 14 ? null : sides;
}
/** The partners' capital accounts in columns, which close with the final payment; null if any did not close, or if there are fewer than `least` rows in all. */
function capitalAccounts(b: Books, least: number): Pick<AccountParts, 'left' | 'right'> | null {
  const opening = { date: OPENED, balances: b.capitals.map((k) => ({ side: 'Cr' as const, amount: rupees(k) })) };
  const view = columnarAccount(entriesOf(b), b.f.names.map(partnerCapital), opening);
  const sides = written(b, columnarSides(view, { closeOn: b.f.date }));
  return view.balances.some((x) => x !== null) || sides.left.rows.length + sides.right.rows.length < least ? null : sides;
}
/** Bank A/c (or Cash A/c), which closes with nothing left; null if it did not. */
function moneyAccount(b: Books): Pick<AccountParts, 'left' | 'right'> | null {
  const view = accountOf(entriesOf(b), b.money, { date: OPENED, side: 'Dr', amount: rupees(b.bank) });
  const sides = written(b, ledgerSides(view, { closeOn: b.f.date }));
  // Fewer than nine rows in all would be too slight a question.
  return view.balance || sides.left.rows.length + sides.right.rows.length < 9 ? null : sides;
}

/** The first line of the data of a format, the balance sheet, and the events numbered. */
const lead = (b: Books): string => `${b.f.intro} ${FLUCTUATING} Every receipt and payment of the firm was ${MONEY[b.money].paid}.`;
const numberedLines = (lines: readonly string[]): string[] => lines.map((t, k) => `${NUMERALS[k]} ${t}`);
/** The whole case: the balance sheet and everything that happened, with any lines that follow the events. */
const caseData = (b: Books, after: readonly string[] = []): string =>
  [
    `${lead(b)} Its balance sheet on that date, and what happened on dissolution, are given below.`,
    ...sheetLines(b),
    'On dissolution:',
    ...numberedLines([...b.events.map((e) => e.text), ...after]),
    ...(b.assets.some((a) => a.silent) ? [SILENT_ASSETS] : []),
  ].join('\n');
/**
 * What the capital accounts are prepared from: the balances that concern the partners, the events a capital account
 * has to do with, and Realisation A/c in short: its profit or loss, or (harder) the totals of its two sides.
 */
function capitalData(b: Books, fromTotals: boolean): string {
  const { debit, credit } = realTotals(b);
  return [
    `${lead(b)} These balances, among others, stood in its books on that date:`,
    ...b.f.names.map((nm, i) => `${nm}'s capital: ${inr(b.capitals[i])}`),
    ...b.accumulated.map((x) => `${x.label}: ${inr(x.amount)}`),
    ...(b.loanTo ? [`Loan given by the firm to ${b.f.names[b.loanTo.to]}: ${inr(b.loanTo.amount)}`] : []),
    'On dissolution:',
    ...numberedLines([
      ...b.events.filter((e) => e.capital).map((e) => e.text),
      fromTotals
        ? `When every asset had been realised and every liability settled, the debit side of Realisation A/c came to ${inr(debit)} and its credit side to ${inr(credit)}. Whatever goes to Realisation A/c from the items above is included in these totals.`
        : `Realisation A/c, in which whatever goes to it from the items above had been entered, showed a ${b.result > 0 ? 'profit' : 'loss'} of ${inr(Math.abs(b.result))}.`,
      'Any partner whose capital account then showed a debit balance brought that amount in; every partner whose account showed a credit balance was paid that amount.',
    ]),
  ].join('\n');
}

const perPartner = (b: Books, amount: number): string => b.f.names.map((nm, i) => `${nm} ${fraction(b.f, i)} x ${inr(amount)} = ${inr(shareOf(b.f, amount, i))}`).join('; ');
const pronoun = (t: Thing): string => (t.plural ? 'they are' : 'it is');

/** Why each row of Realisation A/c is where it is, and how its balance is found and shared. */
function realisationNotes(b: Books): string[] {
  const { f, exp } = b;
  const M = MONEY[b.money].account;
  const who = (i: number): string => f.names[i];
  const x = who(exp.by);
  const out: string[] = [];
  const notAssets = [
    MONEY[b.money].the,
    ...b.accumulated.filter((a) => !a.credit).map(() => 'the debit balance of Profit and Loss A/c (a past loss)'),
    ...(b.loanTo ? [`the loan to ${who(b.loanTo.to)} (set off against ${who(b.loanTo.to)}'s capital)`] : []),
  ];
  out.push(
    `Debit side: every asset except ${list(notAssets)} is transferred at its book value, each as a row of its own ("To ${ledgerLabel(b.assets[0].t.id)}" and so on): ${inr(total(b.assets.map((a) => a.book)))} in all.${b.provision ? ' The debtors go at their gross figure.' : ''}`,
  );
  const notLiabilities = [
    ...(b.loan ? [`${who(b.loan.by)}'s loan (a partner's own loan, repaid by itself)`] : []),
    ...b.accumulated.filter((a) => a.credit).map((a) => (a.id === 'generalReserve' ? 'General Reserve (profit kept back)' : 'the credit balance of Profit and Loss A/c (undistributed profit)')),
    'the capitals',
  ];
  out.push(
    `Credit side: the outside liabilities${b.provision ? ' and the provision for doubtful debts' : ''} are transferred, each as a row of its own: ${inr(total(b.liabs.map((l) => l.book)) + b.provision)} in all. ${cap(list(notLiabilities))} stay out of Realisation A/c.`,
  );
  const sold = [...b.assets.filter((a) => a.cash > 0).map((a) => `${low(a.t.name)} ${inr(a.cash)}`), ...(b.extraAsset?.cash ? [`${b.extraAsset.short} ${inr(b.extraAsset.cash)}`] : [])];
  out.push(`Money received is credited, "By ${M}", with what it was received for in brackets: ${sold.join(', ')}.`);
  for (const a of b.assets) {
    if (a.bad) out.push(`Debtors collected = ${inr(a.book)} - bad debts ${inr(a.bad)} = ${inr(a.cash)}.`);
    if (a.silent && a.cash) out.push(`Nothing is said about ${a.t.the}, a tangible asset, so ${pronoun(a.t)} taken as realised at book value, ${inr(a.book)}.`);
    if (a.silent && !a.cash) out.push(`Nothing is said about ${a.t.the}, an intangible asset, so ${pronoun(a.t)} taken to fetch nothing: no row on the credit side.`);
    if (a.taken) out.push(`${who(a.taken.by)} took over ${a.t.the} at ${inr(a.taken.at)}: "By ${who(a.taken.by)}'s Capital A/c (${low(a.t.name)})". No money comes in.`);
    if (a.given !== undefined) {
      out.push(
        `No row is written for ${a.t.the} that the creditors accepted: the asset and the creditors are both in the account already. Only the balance paid to them, ${inr(b.liabs[0].book)} - ${inr(a.given)} = ${inr(b.liabs[0].cash)}, is debited.`,
      );
    }
  }
  if (b.extraAsset) {
    out.push(
      b.extraAsset.taken
        ? `The ${b.extraAsset.short} was not in the books, so nothing stands for it on the debit side and the whole value is a gain: "By ${who(b.extraAsset.taken.by)}'s Capital A/c (${b.extraAsset.short})" ${inr(b.extraAsset.taken.at)}.`
        : `The ${b.extraAsset.short} was not in the books, so nothing stands for it on the debit side: the whole ${inr(b.extraAsset.cash)} is a gain.`,
    );
  }
  const paid = [
    ...b.liabs.filter((l) => l.by === undefined).map((l) => `${l.what} ${inr(l.cash)}`),
    ...(b.extraLiab && b.extraLiab.by === undefined ? [`${b.extraLiab.short} ${inr(b.extraLiab.amount)}`] : []),
    ...(exp.form === 'firm' ? [`realisation expenses ${inr(exp.actual)}`] : []),
  ];
  if (paid.length) out.push(`Money paid is debited, "To ${M}", with what it was paid for in brackets: ${paid.join(', ')}.`);
  for (const l of b.liabs) {
    if (l.by !== undefined) out.push(`${who(l.by)} agreed to pay ${l.the}: "To ${who(l.by)}'s Capital A/c (${l.what})" ${inr(l.book)}. No money goes out.`);
    else if (l.cash < l.book && !b.assets.some((a) => a.given !== undefined)) out.push(`${cap(l.the)} gave up ${inr(l.book - l.cash)}; no row is needed for it.`);
  }
  if (b.extraLiab) {
    out.push(
      `The ${b.extraLiab.short} was not in the books, so nothing stands for it on the credit side: the whole ${inr(b.extraLiab.amount)} is a loss.${b.extraLiab.by === undefined ? '' : ` ${who(b.extraLiab.by)} paid it for the firm: "To ${who(b.extraLiab.by)}'s Capital A/c (${b.extraLiab.short})".`}`,
    );
  }
  const remuneration = `${x} is owed the agreed remuneration whatever the expenses come to: "To ${x}'s Capital A/c (remuneration)" ${inr(exp.fee)}.`;
  const expenseNote: Record<ExpenseForm, string[]> = {
    firm: [],
    partnerPays: [`The firm bears the realisation expenses and ${x} paid them for it: "To ${x}'s Capital A/c (realisation expenses)" ${inr(exp.actual)}.`],
    feePersonal: [`${remuneration} The expenses of ${inr(exp.actual)} are ${x}'s own affair and have no row.`],
    feeFirmPays: [`${remuneration} The ${inr(exp.actual)} that the firm paid on ${x}'s behalf is debited to ${x}'s Capital A/c, not here.`],
    borneFirmPays: [`${x} bears the realisation expenses, so they have no row here. The ${inr(exp.actual)} that the firm paid on ${x}'s behalf is debited to ${x}'s Capital A/c.`],
    bornePersonal: [`${x} bears the realisation expenses and paid them personally: they have no row in the firm's books.`],
  };
  out.push(...expenseNote[exp.form]);
  const { debit, credit } = realTotals(b);
  out.push(`Before its balance is transferred, the debit side comes to ${inr(debit)} and the credit side to ${inr(credit)}. ${resultLine(debit, credit)}`);
  out.push(
    `It is shared in the profit-sharing ratio: ${perPartner(b, Math.abs(b.result))}. ${b.result > 0 ? 'Each share is a row on the debit side, "To ... Capital A/c (profit)"' : 'Each share is a row on the credit side, "By ... Capital A/c (loss)"'}, and the two sides then agree.`,
  );
  return out;
}

/**
 * Labels a student wrongly reaches for in Realisation A/c: balances that stay out of it, and rows for things that
 * moved no money. The balance at bank is offered as "Bank A/c (opening balance)", never as a bare "Bank A/c", which
 * nobody could tell from the rows for money received and paid. A remuneration is not offered under the name
 * "realisation expenses" as well: an examiner accepts either wording for that row.
 */
function realisationSlips(b: Books): string[] {
  const { f, exp } = b;
  const M = MONEY[b.money].account;
  const x = f.names[exp.by];
  return [
    `${M} (opening balance)`,
    'Realisation A/c',
    'Balance c/d',
    ...f.names.map((nm) => `${nm}'s Capital A/c (${b.result > 0 ? 'loss' : 'profit'})`),
    ...b.accumulated.map((a) => a.name),
    ...(b.loan ? [ledgerLabel(partnerLoan(f.names[b.loan.by]))] : []),
    ...(b.loanTo ? [ledgerLabel(loanToPartner(f.names[b.loanTo.to]))] : []),
    ...b.assets.filter((a) => a.cash === 0).map((a) => `${M} (${low(a.t.name)})`),
    ...b.liabs.filter((l) => l.by !== undefined).map((l) => `${M} (${l.what})`),
    ...(exp.form === 'firm' ? [] : [`${M} (realisation expenses)`]),
    ...(exp.form === 'borneFirmPays' || exp.form === 'bornePersonal' ? [`${x}'s Capital A/c (realisation expenses)`] : []),
  ];
}

/** `verify` of a Realisation A/c: its rows against the figures, worked the short way, and the books closed the long way. */
function realisationHolds(q: AccountQuestion): boolean {
  const b = keptBooks.of(q.data);
  return b !== undefined && realisationHoldsFor(b, q);
}
/** `realisationHolds` for books already in hand (a case study keeps its own). */
function realisationHoldsFor(b: Books, q: AccountQuestion): boolean {
  if (!closes(b)) return false;
  const [debit, credit] = q.sides.map((s) => s.rows);
  const isShare = (label: string): boolean => /\((profit|loss)\)$/.test(label);
  const sum = (rows: typeof debit): number => total(rows.filter((r) => !isShare(r.label)).map((r) => r.amounts[0]));
  const result = gainOf(b);
  const word = result > 0 ? 'profit' : 'loss';
  const shares = (result > 0 ? debit : credit).filter((r) => isShare(r.label));
  const M = MONEY[b.money].account;
  return (
    result === b.result &&
    sum(credit) - sum(debit) === rupees(result) &&
    (result > 0 ? credit : debit).every((r) => !isShare(r.label)) &&
    shares.length === b.f.names.length &&
    b.f.names.every((nm, i) => shares.some((r) => r.label === `${nm}'s Capital A/c (${word})` && r.amounts[0] === rupees(shareOf(b.f, Math.abs(result), i)))) &&
    // Every asset of the balance sheet but the money stands on the debit at book value, every outside liability on the credit.
    b.assets.every((a) => debit.some((r) => r.label === ledgerLabel(a.t.id) && r.amounts[0] === rupees(a.book))) &&
    b.liabs.every((l) => credit.some((r) => r.label === ledgerLabel(l.id) && r.amounts[0] === rupees(l.book))) &&
    // Money, reserves, a partner's loan and the capitals themselves never do.
    [...debit, ...credit].every((r) => r.label !== M && !b.accumulated.some((a) => a.name === r.label) && !/'s Capital A\/c$/.test(r.label) && !(b.loan && r.label === ledgerLabel(partnerLoan(b.f.names[b.loan.by]))))
  );
}

const REALISATION_TASK = 'Enter every transfer, receipt and payment as a row of its own, and each partner\'s share of the profit or loss as a row of its own.';
const FORMAT_HINTS = {
  realisation: [
    'First the two transfers: which assets go to the debit at book value, and which balances of the liabilities side go to the credit? Then one row for every amount received, paid, taken over or met by a partner.',
    'An asset that a creditor accepts, and expenses a partner has agreed to bear, give no row. Total both sides: the difference is the profit or loss, shared in the profit-sharing ratio.',
  ],
  capitals: [
    'Credit each column with the capital, the share of reserves and of a profit on realisation, and whatever the firm owes the partner; debit it with the share of losses, what the partner took over and what the firm paid for the partner.',
    'Balance each column on its own. A credit balance is paid to the partner ("To Bank A/c"); a debit balance is brought in by the partner ("By Bank A/c").',
  ],
  money: [
    'Debit the account with the opening balance and every amount actually received; credit it with every amount actually paid.',
    'An asset a partner took over or a creditor accepted, and anything a partner paid personally, moved none of the firm\'s money. The last payments are the balances of the capital accounts, and they must empty the account.',
  ],
};

// 1. dis-fmt-realisation: Realisation A/c from a balance sheet when every asset is sold and every liability paid, and
//    the firm bears and pays the expenses. What must be kept out (bank, a reserve, the capitals) is on the sheet. It
//    has no twist, but thirteen to sixteen rows and a result to share are not an easy question (medium, four marks)
const fmtRealisation = accountTemplate({
  id: 'dis-fmt-realisation', topicId: T, conceptId: FORMATS, difficulty: 'medium',
  generate: (rng) => {
    const b = windUp(rng, { ways: [['sold', 'sold']], secondLiability: 2, reserves: ['none', 'reserve', 'profit'], unrecorded: ['none'], expenses: ['firm'] });
    const account = b && realisationAccount(b);
    if (!b || !account) return null;
    const data = caseData(b);
    keptBooks.keep(data, b);
    return {
      task: `Prepare Realisation A/c of the firm on its dissolution on ${b.f.date}. ${REALISATION_TASK}`,
      data,
      title: 'Realisation A/c',
      ...account,
      distractors: realisationSlips(b),
      explanation: realisationNotes(b),
      hints: FORMAT_HINTS.realisation,
    };
  },
  verify: realisationHolds,
});

// 2. dis-fmt-realisation-full: Realisation A/c with everything a board question puts into it: an asset a partner
//    takes over, an asset the creditors accept in part settlement, an asset about which nothing is said, something
//    that was never in the books, and expenses that a partner bears, with or without a remuneration (complex)
const fmtRealisationFull = accountTemplate({
  id: 'dis-fmt-realisation-full', topicId: T, conceptId: FORMATS, difficulty: 'complex',
  generate: (rng) => {
    const b = windUp(rng, {
      ways: [['taken', 'creditor'], ['creditor', 'partner']],
      provision: true,
      intangible: true,
      secondLiability: 2,
      liabilityTaken: true,
      partnerLoan: 1,
      reserves: ['none', 'reserve', 'loss'],
      unrecorded: ['asset', 'liability', 'both'],
      expenses: ['feePersonal', 'feePersonal', 'feeFirmPays', 'feeFirmPays', 'borneFirmPays', 'bornePersonal'],
    });
    const account = b && realisationAccount(b);
    if (!b || !account) return null;
    const data = caseData(b);
    keptBooks.keep(data, b);
    return {
      task: `Prepare Realisation A/c of the firm on its dissolution on ${b.f.date}. ${REALISATION_TASK}`,
      data,
      title: 'Realisation A/c',
      ...account,
      distractors: realisationSlips(b),
      explanation: realisationNotes(b),
      hints: FORMAT_HINTS.realisation,
    };
  },
  verify: realisationHolds,
});

/** Why each row of the capital accounts is where it is, and what each column comes to. */
function capitalWorking(b: Books, fromTotals: boolean): string[] {
  const { f, exp } = b;
  const M = MONEY[b.money].account;
  const who = (i: number): string => f.names[i];
  const x = who(exp.by);
  const word = b.result > 0 ? 'profit' : 'loss';
  const out = ['Each partner has a column. A capital is a credit balance, so the capitals open the credit side: "By Balance b/d".'];
  for (const a of b.accumulated) {
    out.push(
      a.credit
        ? `${a.name} holds profit that was never shared out. It is credited in the profit-sharing ratio: ${perPartner(b, a.amount)}.`
        : `The debit balance of Profit and Loss A/c is a past loss. It is debited in the profit-sharing ratio, "To Profit and Loss A/c": ${perPartner(b, a.amount)}.`,
    );
  }
  for (const a of b.assets) if (a.taken) out.push(`${who(a.taken.by)} took over ${a.t.the} in place of money: "To Realisation A/c (${low(a.t.name)})" ${inr(a.taken.at)} in ${who(a.taken.by)}'s column.`);
  if (b.extraAsset?.taken) out.push(`${who(b.extraAsset.taken.by)} took over the ${b.extraAsset.short}: "To Realisation A/c (${b.extraAsset.short})" ${inr(b.extraAsset.taken.at)} in ${who(b.extraAsset.taken.by)}'s column.`);
  for (const l of b.liabs) if (l.by !== undefined) out.push(`${who(l.by)} will pay ${l.the} for the firm, so the firm owes ${who(l.by)} that much more: "By Realisation A/c (${l.what})" ${inr(l.book)}.`);
  if (b.extraLiab?.by !== undefined) out.push(`${who(b.extraLiab.by)} paid the ${b.extraLiab.short} for the firm: "By Realisation A/c (${b.extraLiab.short})" ${inr(b.extraLiab.amount)}.`);
  const expenseNote: Record<ExpenseForm, string[]> = {
    firm: [],
    partnerPays: [`${x} paid the firm's realisation expenses, so the firm owes ${x} the amount: "By Realisation A/c (realisation expenses)" ${inr(exp.actual)}.`],
    feePersonal: [`${x} is owed the agreed remuneration: "By Realisation A/c (remuneration)" ${inr(exp.fee)}. The expenses ${x} paid personally are ${x}'s own affair and have no row.`],
    feeFirmPays: [`${x} is owed the agreed remuneration: "By Realisation A/c (remuneration)" ${inr(exp.fee)}. The expenses were ${x}'s to bear and the firm paid them: "To ${M} (realisation expenses)" ${inr(exp.actual)}.`],
    borneFirmPays: [`The realisation expenses were ${x}'s to bear and the firm paid them: "To ${M} (realisation expenses)" ${inr(exp.actual)} in ${x}'s column.`],
    bornePersonal: [`${x} bore the realisation expenses and paid them personally: nothing passes through the firm's books.`],
  };
  out.push(...expenseNote[exp.form]);
  if (b.loanTo) out.push(`The loan to ${who(b.loanTo.to)} is not sold to anyone: it is set off against ${who(b.loanTo.to)}'s capital, "To Loan to ${who(b.loanTo.to)} A/c" ${inr(b.loanTo.amount)}.`);
  if (fromTotals) out.push(resultLine(realTotals(b).debit, realTotals(b).credit).replace(/^The/, 'In Realisation A/c the'));
  out.push(`The ${word} on realisation is shared in the profit-sharing ratio, "${b.result > 0 ? 'By' : 'To'} Realisation A/c (${word})": ${perPartner(b, Math.abs(b.result))}.`);
  f.names.forEach((nm, i) => {
    const due = b.finals[i];
    // What is on each side of the column before the money moves.
    const credits = b.capitals[i] + total(b.accumulated.filter((a) => a.credit).map((a) => shareOf(f, a.amount, i))) + Math.max(shareOf(f, b.result, i), 0) +
      total(b.liabs.filter((l) => l.by === i).map((l) => l.book)) + (b.extraLiab?.by === i ? b.extraLiab.amount : 0) + (exp.by === i ? creditedFor(exp) : 0);
    out.push(
      due > 0
        ? `${nm}: credits ${inr(credits)}${credits === due ? ', with nothing debited,' : ` less debits ${inr(credits - due)}`} leave ${inr(due)} due to ${nm}, which is paid: "To ${M}".`
        : `${nm}: debits ${inr(credits - due)} exceed credits ${inr(credits)} by ${inr(-due)}. ${nm} owes the firm this amount and brings it in: "By ${M}".`,
    );
  });
  out.push('Every column now agrees, so the capital accounts are closed.');
  return out;
}

/**
 * Labels a student wrongly reaches for in the capital accounts. A bare "Realisation A/c" is not among them (nobody
 * could tell it from the rows that say what came from Realisation A/c), nor is the other of "remuneration" and
 * "realisation expenses" for the one amount a partner is credited with, nor Cash A/c for Bank A/c.
 */
function capitalSlips(b: Books): string[] {
  const M = MONEY[b.money].account;
  return [
    'Balance c/d',
    `Realisation A/c (${b.result > 0 ? 'loss' : 'profit'})`,
    'Revaluation A/c',
    'Profit and Loss Appropriation A/c',
    'Drawings A/c',
    ...(b.accumulated.some((a) => a.id === 'generalReserve') ? [] : ['General Reserve A/c']),
    ...(b.exp.form === 'bornePersonal' || b.exp.form === 'borneFirmPays' ? ['Realisation A/c (realisation expenses)'] : []),
    ...(b.exp.form === 'bornePersonal' || b.exp.form === 'feePersonal' || b.exp.form === 'partnerPays' ? [`${M} (realisation expenses)`] : []),
  ];
}

/** `verify` of capital accounts: each column's last row against what the partner is due, worked from the figures. */
const capitalsHold = (short: boolean) => (q: AccountQuestion): boolean => {
  const b = keptBooks.of(q.data);
  return b !== undefined && capitalsHoldFor(b, q, short);
};
/** `capitalsHold` for books already in hand (a case study keeps its own). */
const capitalsHoldFor = (b: Books, q: AccountQuestion, short: boolean): boolean => {
  if (!closes(b)) return false;
  const [debit, credit] = q.sides.map((s) => s.rows);
  const M = MONEY[b.money].account;
  const dues = duesOf(b);
  const at = (rows: typeof debit, label: string, i: number): number => rows.find((r) => r.label === label)?.amounts[i] ?? 0;
  return (
    dues.filter((due) => due < 0).length === (short ? 1 : 0) &&
    dues.every(
      (due, i) =>
        (due >= 5000 || due < 0) &&
        at(credit, 'Balance b/d', i) === rupees(b.capitals[i]) &&
        at(debit, M, i) === rupees(Math.max(due, 0)) &&
        at(credit, M, i) === rupees(Math.max(-due, 0)),
    )
  );
};

const CAPITALS_TASK = (b: Books): string => `Prepare the partners' capital accounts in columns to close the books of the firm, dissolved on ${b.f.date}. Enter each item as a row of its own.`;

// 3. dis-fmt-capitals: the partners' capital accounts in columns on dissolution: a reserve (and in some seeds a debit
//    balance of Profit and Loss A/c), an asset taken over, what a partner paid or is to pay for the firm, the stated
//    profit or loss on realisation, and the final payment that closes every column (medium)
const fmtCapitals = accountTemplate({
  id: 'dis-fmt-capitals', topicId: T, conceptId: FORMATS, difficulty: 'medium',
  generate: (rng) => {
    const b = windUp(rng, {
      ways: [['taken', 'sold'], ['sold', 'partner'], ['taken', 'partner'], ['taken', 'silent']],
      provision: true,
      secondLiability: 2,
      liabilityTaken: true,
      reserves: ['reserve', 'reserveAndLoss', 'reserveAndLoss', 'profit'],
      loanTo: true,
      unrecorded: ['none', 'none', 'asset'],
      expenses: ['partnerPays', 'feePersonal', 'feeFirmPays', 'borneFirmPays'],
    });
    // Fewer than seven rows in all would be too slight a question for four marks.
    const account = b && capitalAccounts(b, 7);
    if (!b || !account) return null;
    const data = capitalData(b, false);
    keptBooks.keep(data, b);
    return {
      task: CAPITALS_TASK(b),
      data,
      title: "Partners' Capital Accounts",
      columns: partnerColumns(b.f.names),
      ...account,
      distractors: capitalSlips(b),
      explanation: capitalWorking(b, false),
      hints: FORMAT_HINTS.capitals,
    };
  },
  verify: capitalsHold(false),
});

/** Why each row of Bank A/c (or Cash A/c) is where it is, and why other things have no row in it. */
function moneyWorking(b: Books): string[] {
  const { f, exp } = b;
  const who = (i: number): string => f.names[i];
  const x = who(exp.by);
  const out = [`The account opens with ${MONEY[b.money].the} on the date of dissolution: "To Balance b/d" ${inr(b.bank)}.`];
  const got = [...b.assets.filter((a) => a.cash > 0).map((a) => `${low(a.t.name)} ${inr(a.cash)}`), ...(b.extraAsset?.cash ? [`${b.extraAsset.short} ${inr(b.extraAsset.cash)}`] : [])];
  out.push(`Money received for the assets is debited, "To Realisation A/c", with the asset in brackets: ${got.join(', ')}.`);
  for (const a of b.assets) {
    if (a.bad) out.push(`Debtors collected = ${inr(a.book)} - bad debts ${inr(a.bad)} = ${inr(a.cash)}.`);
    if (a.silent && a.cash) out.push(`Nothing is said about ${a.t.the}, a tangible asset, so ${pronoun(a.t)} taken as realised at book value, ${inr(a.book)}.`);
    if (a.silent && !a.cash) out.push(`Nothing is said about ${a.t.the}, an intangible asset, so ${pronoun(a.t)} taken to fetch nothing: no row.`);
    if (a.taken) out.push(`${cap(a.t.the)} that ${who(a.taken.by)} took over brought in no money: no row. The value is debited to ${who(a.taken.by)}'s Capital A/c.`);
    if (a.given !== undefined) out.push(`${cap(a.t.the)} that the creditors accepted brought in no money: no row. The creditors were paid only the balance, ${inr(b.liabs[0].book)} - ${inr(a.given)} = ${inr(b.liabs[0].cash)}.`);
  }
  if (b.extraAsset?.taken) out.push(`The ${b.extraAsset.short} that ${who(b.extraAsset.taken.by)} took over brought in no money: no row.`);
  const paid = [
    ...b.liabs.filter((l) => l.by === undefined).map((l) => `${l.what} ${inr(l.cash)}`),
    ...(b.extraLiab && b.extraLiab.by === undefined ? [`${b.extraLiab.short} ${inr(b.extraLiab.amount)}`] : []),
    ...(exp.form === 'firm' ? [`realisation expenses ${inr(exp.actual)}`] : []),
  ];
  if (paid.length) out.push(`Money paid for liabilities${exp.form === 'firm' ? ' and expenses of the firm' : ''} is credited, "By Realisation A/c", with what it was paid for in brackets: ${paid.join(', ')}.`);
  for (const l of b.liabs) if (l.by !== undefined) out.push(`${who(l.by)} pays ${l.the} personally: none of the firm's money goes out, so it has no row.`);
  if (b.extraLiab?.by !== undefined) out.push(`${who(b.extraLiab.by)} paid the ${b.extraLiab.short} personally: no row.`);
  const expenseNote: Record<ExpenseForm, string[]> = {
    firm: [],
    partnerPays: [`${x} paid the realisation expenses out of ${x}'s own money: no row. ${x}'s Capital A/c is credited instead.`],
    feePersonal: [`The remuneration is only a credit to ${x}'s Capital A/c, and ${x} paid the expenses personally: neither has a row.`],
    feeFirmPays: [`The remuneration is only a credit to ${x}'s Capital A/c: no row. The expenses the firm paid on ${x}'s behalf did leave the firm: "By ${x}'s Capital A/c (realisation expenses)" ${inr(exp.actual)}.`],
    borneFirmPays: [`The expenses were ${x}'s to bear, and the firm paid them on ${x}'s behalf: "By ${x}'s Capital A/c (realisation expenses)" ${inr(exp.actual)}.`],
    bornePersonal: [`${x} bore the realisation expenses and paid them personally: no row.`],
  };
  out.push(...expenseNote[exp.form]);
  if (b.loan) out.push(`${who(b.loan.by)}'s loan is repaid after the outside liabilities and before the capitals: "By ${who(b.loan.by)}'s Loan A/c" ${inr(b.loan.amount)}.`);
  b.finals.forEach((due, i) => {
    if (due < 0) out.push(`${who(i)}'s capital account has a debit balance, which ${who(i)} brings in: "To ${who(i)}'s Capital A/c" ${inr(-due)}.`);
  });
  const receipts = b.bank + total(b.assets.map((a) => a.cash)) + (b.extraAsset?.cash ?? 0) + total(b.finals.map((due) => Math.max(-due, 0)));
  out.push(
    `The credit balances of the capital accounts are paid last, each "By ... Capital A/c": ${f.names.flatMap((nm, i) => (b.finals[i] > 0 ? [`${nm} ${inr(b.finals[i])}`] : [])).join(', ')}. Both sides then come to ${inr(receipts)}: nothing is left, so the books are closed.`,
  );
  return out;
}

// 4. dis-fmt-bank: Bank A/c (in some seeds Cash A/c) of a dissolution, which must close with nothing left. What
//    moved no money is in the data too: an asset a partner or the creditors took, a liability or expenses a partner
//    paid personally, a remuneration. The balances of the capital accounts are given. One seed in five a partner's
//    account shows a debit balance, and that partner brings the amount in (medium)
const fmtBank = accountTemplate({
  id: 'dis-fmt-bank', topicId: T, conceptId: FORMATS, difficulty: 'medium',
  generate: (rng) => {
    const money = rng.pick<Money>(['bank', 'bank', 'cash']);
    const short = rng.int(0, 4) === 0;
    const b = windUp(rng, {
      money,
      ways: short ? [['taken', 'sold'], ['taken', 'silent']] : [['sold', 'sold'], ['taken', 'sold'], ['sold', 'silent'], ['taken', 'creditor'], ['sold', 'creditor'], ['sold', 'partner']],
      provision: true,
      intangible: true,
      secondLiability: 3,
      liabilityTaken: true,
      partnerLoan: 3,
      reserves: ['none', 'reserve'],
      unrecorded: ['none', 'asset', 'liability'],
      expenses: ['firm', 'partnerPays', 'feePersonal', 'feeFirmPays', 'borneFirmPays', 'bornePersonal'],
      shortfall: short,
    });
    const account = b && moneyAccount(b);
    if (!b || !account) return null;
    const M = MONEY[money].account;
    const data = caseData(b, [
      ...(b.loan ? [`After the outside liabilities had been settled, ${b.f.names[b.loan.by]}'s loan was repaid.`] : []),
      `When the profit or loss on realisation and everything else that concerns the partners had been entered, the capital accounts showed these balances: ${b.f.names.map((nm, i) => `${nm} ${inr(Math.abs(b.finals[i]))} (${b.finals[i] > 0 ? 'Cr' : 'Dr'})`).join(', ')}.`,
      'Any partner whose capital account showed a debit balance brought that amount in; every partner whose account showed a credit balance was paid that amount.',
    ]);
    keptBooks.keep(data, b);
    return {
      task: `Prepare ${M} of the firm on its dissolution on ${b.f.date}, and show that it closes with nothing left. Enter every receipt and payment as a row of its own.`,
      data,
      title: M,
      ...account,
      distractors: moneySlips(b),
      explanation: moneyWorking(b),
      hints: FORMAT_HINTS.money,
    };
  },
  verify: (q) => {
    const b = keptBooks.of(q.data);
    return b !== undefined && moneyHoldsFor(b, q);
  },
});

/** Labels a student wrongly reaches for in Bank A/c (or Cash A/c). No bare "Realisation A/c": nobody could tell it from the rows for the money received and paid. */
function moneySlips(b: Books): string[] {
  return [
    'Balance c/d',
    MONEY[b.money].account,
    `Realisation A/c (${b.result > 0 ? 'profit' : 'loss'})`,
    ...b.accumulated.map((a) => a.name),
    ...b.assets.filter((a) => a.cash === 0).map((a) => `Realisation A/c (${low(a.t.name)})`),
    ...b.liabs.filter((l) => l.by !== undefined).map((l) => `Realisation A/c (${l.what})`),
    ...(forFee(b.exp) ? ['Realisation A/c (remuneration)'] : []),
    ...(b.exp.form === 'firm' ? [] : ['Realisation A/c (realisation expenses)']),
  ];
}

/** `verify` of Bank A/c (or Cash A/c): money in and money out, the short way, and the books closed the long way. */
function moneyHoldsFor(b: Books, q: AccountQuestion): boolean {
  if (!closes(b)) return false;
  const [debit, credit] = q.sides.map((s) => s.rows.map((r) => r.amounts[0]));
  const dues = duesOf(b);
  // Money in and money out, the short way: only what actually passed through the bank.
  const received = b.bank + total(b.assets.map((a) => a.cash)) + (b.extraAsset?.cash ?? 0) + total(dues.map((due) => Math.max(-due, 0)));
  const paidOut =
    total(b.liabs.map((l) => (l.by === undefined ? l.cash : 0))) + (b.extraLiab && b.extraLiab.by === undefined ? b.extraLiab.amount : 0) +
    (b.exp.form === 'firm' ? b.exp.actual : chargedFor(b.exp)) + (b.loan?.amount ?? 0) + total(dues.map((due) => Math.max(due, 0)));
  return received === paidOut && total(debit) === rupees(received) && total(credit) === rupees(paidOut) && q.sides[0].rows[0].label === 'Balance b/d' && debit[0] === rupees(b.bank);
}

// 5. dis-fmt-capitals-deficit: the partners' capital accounts in columns when one partner ends with a debit balance
//    and brings the amount in (nobody is insolvent). The profit or loss on realisation has to be found from the
//    totals of Realisation A/c, and the columns carry more: a past loss, a loan to the partner, expenses paid on a
//    partner's behalf. Six marks are for three partners and at least nine rows, never for a short account (complex)
const fmtCapitalsDeficit = accountTemplate({
  id: 'dis-fmt-capitals-deficit', topicId: T, conceptId: FORMATS, difficulty: 'complex',
  generate: (rng) => {
    const b = windUp(rng, {
      size: 3,
      ways: [['taken', 'sold'], ['taken', 'partner'], ['taken', 'partner'], ['taken', 'silent']],
      provision: true,
      secondLiability: 2,
      liabilityTaken: true,
      reserves: ['loss', 'reserveAndLoss', 'reserveAndLoss', 'reserve'],
      loanTo: true,
      unrecorded: ['none', 'asset'],
      expenses: ['firm', 'partnerPays', 'partnerPays', 'feePersonal', 'feeFirmPays', 'feeFirmPays', 'borneFirmPays', 'borneFirmPays', 'bornePersonal'],
      shortfall: true,
    });
    const account = b && capitalAccounts(b, 9);
    if (!b || !account) return null;
    const data = capitalData(b, true);
    keptBooks.keep(data, b);
    return {
      task: CAPITALS_TASK(b),
      data,
      title: "Partners' Capital Accounts",
      columns: partnerColumns(b.f.names),
      ...account,
      distractors: capitalSlips(b),
      explanation: capitalWorking(b, true),
      hints: FORMAT_HINTS.capitals,
    };
  },
  verify: capitalsHold(true),
});

// One-mark Assertion-Reason questions of the board. They stand on their own level and go into no mock paper and no
// Look back (`isAssertionReason`), so nothing that was served before moves.
const disAssertionReason = factsTemplate({
  id: 'dis-assertion-reason', topicId: 'dissolution-of-partnership', conceptId: 'dis-realisation', difficulty: 'medium',
  // 2: the Reason of the item on the provision for doubtful debts says why the provision is moved, so that it plainly explains A.
  version: 2,
  facts: assertionReasonFacts([
    {
      answer: 'both',
      assertion: 'Cash and bank balances are not transferred to Realisation A/c.',
      reason: 'Realisation A/c records the turning of assets into money, and these balances are money already.',
      a: 'They stay in their own accounts.',
      r: 'Assets are transferred to it to find the profit or loss on selling them.',
      link: 'R explains A: there is nothing to realise in cash or at the bank.',
    },
    {
      answer: 'both',
      assertion: "A partner's loan to the firm is not transferred to Realisation A/c.",
      reason: "Realisation A/c takes the outside liabilities, and a partner's loan is not one.",
      a: 'It is kept out and repaid by itself, after the outside liabilities.',
      r: 'A partner is not an outsider to the firm.',
      link: 'R explains A: only outside liabilities go to the credit of Realisation A/c.',
    },
    {
      answer: 'both',
      assertion: 'A provision for doubtful debts is transferred to the credit of Realisation A/c on dissolution.',
      reason: 'Debtors go to the debit of Realisation A/c at their gross figure, so the provision against them has to be closed by transfer there.',
      a: 'The provision goes to the credit side.',
      r: 'An asset goes across at its gross book value, and the provision against it is not left standing in books that are being closed.',
      link: 'R explains A: with the gross figure on the debit side, the provision is moved to the credit side so that the net book value comes through.',
    },
    {
      answer: 'both',
      assertion: 'No entry is passed when a creditor of ₹50,000 accepts stock in full settlement of the claim on dissolution.',
      reason: 'The stock and the creditor are already in Realisation A/c, and no money changes hands.',
      a: 'In full settlement there is no entry at all.',
      r: 'Both were transferred there at the start.',
      link: 'R explains A: there is nothing new to record.',
    },
    {
      answer: 'both',
      assertion: 'Ira has agreed to bear the realisation expenses, and pays ₹8,000 for them personally. No entry is passed in the books of the firm.',
      reason: 'The firm neither pays nor bears such an expense.',
      a: 'Borne and paid by a partner: no entry.',
      r: "The money is Ira's own and the cost is Ira's own.",
      link: 'R explains A: the firm is not touched at any point.',
    },
    {
      answer: 'bothNot',
      assertion: "On dissolution, reserves are credited to the partners' capital accounts.",
      reason: "On dissolution, a loan to a partner is debited to that partner's capital account.",
      a: 'Reserves are credited in the profit-sharing ratio.',
      r: 'A loan to a partner is settled through the capital account.',
      link: 'R does not explain A: one is about reserves and the other about a loan, and neither says why the other holds.',
    },
    {
      answer: 'bothNot',
      assertion: "On dissolution, the firm's property is applied first to the firm's debts.",
      reason: "A partner's private property is applied first to that partner's private debts.",
      a: 'Only a share of any surplus can go to private creditors.',
      r: 'Only a surplus can be used for the debts of the firm.',
      link: 'R does not explain A: it is a matching rule for private property, not the reason for this one.',
    },
    {
      answer: 'bothNot',
      assertion: 'The profit on realisation is ₹60,000 and Joy and Kiran share profits 2:1. Joy gets ₹40,000 of it.',
      reason: 'Realisation expenses borne by the firm are debited to Realisation A/c.',
      a: '₹60,000 × 2/3 = ₹40,000.',
      r: 'Realisation A/c Dr; To Bank A/c.',
      link: 'R does not explain A: the expenses are one of the items that fix the profit; the ₹40,000 comes from sharing it in the ratio.',
    },
    {
      answer: 'aOnly',
      assertion: 'The realised value of machinery of book value ₹70,000 is not given. It is taken as realised at ₹70,000.',
      reason: 'Every asset whose realised value is not given is taken as realising nothing.',
      a: 'A tangible asset is taken as realised at book value.',
      r: 'Only an intangible asset is taken at nil. A tangible asset is taken at book value.',
    },
    {
      answer: 'aOnly',
      assertion: "After the outside liabilities are paid, a partner's loan is repaid before the capitals.",
      reason: "Section 48 of the Indian Partnership Act, 1932 pays the partners' capitals before the partners' loans.",
      a: "The order is outsiders, partners' loans, capitals, and then any surplus.",
      r: 'Loans given by partners come before capitals, not after them.',
    },
    {
      answer: 'rOnly',
      assertion: 'On dissolution, Goodwill A/c appearing in the books is not transferred to Realisation A/c.',
      reason: 'An intangible asset whose realised value is not given is taken as realising nothing.',
      a: 'Goodwill is an asset, and it goes to the debit of Realisation A/c at book value.',
      r: 'That is the assumption for an intangible asset; it says what it realises, not whether it is transferred.',
    },
    {
      answer: 'rOnly',
      assertion: 'Hari and Mala have capitals of ₹2,00,000 and ₹1,00,000 and share profits equally. A loss on realisation of ₹45,000 falls on them as ₹30,000 and ₹15,000.',
      reason: 'A loss on realisation is shared among the partners in their profit-sharing ratio.',
      a: 'They bear ₹22,500 each; the ratio of the capitals has no say.',
      r: 'Capital A/cs Dr; To Realisation A/c, in the profit-sharing ratio.',
    },
  ]),
});

// ===============================================================================================================
// ADDED LATER: EARMARKED RESERVES AND FIXED CAPITALS ON DISSOLUTION. These stand on levels of their own and are kept off
// the mock papers, the worksheets and the Look back levels (src/generators/outsidePapers.ts), so no question there moved.
// ===============================================================================================================

/** What the firms of the templates added later did, and where: a firm is a business somewhere, not just "a firm". */
const SETTINGS = [
  'a cloth shop in Surat', 'a tea agency in Guwahati', 'a bakery in Pune', 'a courier service in Indore', 'a pharmacy in Patna',
  'a tyre dealership in Coimbatore', 'a stationery shop in Chennai', 'a pathology laboratory in Kanpur', 'a furniture workshop in Jodhpur',
  'a seed and fertiliser shop in Hubballi', 'a tuition centre in Bhubaneswar', 'a printing press in Sivakasi',
];
/** The opening of a template added later: the partners, their business and town, the ratio and the date of dissolution. `namesIn` and `ratioIn` read it back. */
function settingFirm(rng: Rng, size?: 2 | 3): Firm {
  const f = firm(rng, size ? { size } : {});
  const sharing = f.ratio.every((x) => x === f.ratio[0]) ? 'equally' : `in the ratio of ${f.ratio.join(':')}`;
  return { ...f, intro: `${list(f.names)} were partners in ${rng.pick(SETTINGS)}, sharing profits and losses ${sharing}. The firm was dissolved on ${f.date}.` };
}
const CLAIM_THROUGH = 'An admitted claim is paid through Realisation A/c.';

// 1. dis-wcr-claim: a Workmen Compensation Reserve on dissolution, with no claim, a claim smaller than the reserve,
//    equal to it or larger (medium)
const wcrOnDissolution = journalTemplate({
  id: 'dis-wcr-claim', topicId: T, conceptId: C.realisation, difficulty: 'medium',
  generate: (rng) => {
    const f = settingFirm(rng);
    const kind = rng.pick(['surplus', 'surplus', 'short', 'equal', 'none'] as const);
    const S = kind === 'surplus' || kind === 'none' ? f.sum * rng.step(2000, 15000, 1000) : 0;
    const claim = kind === 'none' ? 0 : rng.step(15000, 90000, 5000);
    const W = kind === 'surplus' ? claim + S : kind === 'none' ? S : kind === 'equal' ? claim : claim - rng.step(5000, Math.min(40000, claim - 10000), 5000);
    const toRealisation = Math.min(W, claim);
    const shares = f.names.map((_, i) => shareOf(f, S, i));
    const claimText = kind === 'none' ? 'there was no claim against it' : `a claim of ${inr(claim)} for workmen's compensation had been admitted and was still to be paid`;
    return {
      prompt: `${f.intro} ${FLUCTUATING} The balance sheet on that date showed a Workmen Compensation Reserve of ${inr(W)}, and ${claimText}. ${CLAIM_THROUGH} Pass the journal entry to close Workmen Compensation Reserve A/c.`,
      lines: [dr('workmenCompensationReserve', W), ...(toRealisation > 0 ? [cr(REAL, toRealisation)] : []), ...(S > 0 ? f.names.map((n, i) => cr(partnerCapital(n), shares[i])) : [])],
      explanation: [
        `Workmen Compensation Reserve A/c is closed by a debit of the whole ${inr(W)}.`,
        ...(kind === 'none' ? [] : [
          kind === 'short'
            ? `The claim, ${inr(claim)}, is more than the reserve: the whole reserve, ${inr(W)}, goes to the credit of Realisation A/c. The claim is paid through Realisation A/c (Realisation A/c Dr ${inr(claim)}; To Bank A/c), so the ${inr(claim - W)} the reserve does not cover falls on the partners as part of the result of realisation.`
            : `${inr(claim)} of it is needed for the claim, a debt to outsiders: that much goes to the credit of Realisation A/c, which is debited when the claim is paid.`,
        ]),
        ...(S > 0
          ? [`${kind === 'none' ? 'With no claim, the whole reserve' : `The rest, ${inr(W)} - ${inr(claim)} = ${inr(S)},`} is undistributed profit: it is credited to the capital accounts in the profit-sharing ratio: ${f.names.map((n, i) => `${n} ${fraction(f, i)} x ${inr(S)} = ${inr(shares[i])}`).join('; ')}.`]
          : ['Nothing is left for the partners.']),
      ],
      distractorAccounts: ['workmenCompensationClaim', 'generalReserve', 'revaluation'],
      hints: [
        'How much of the reserve is owed to the workers, and how much is free profit of the partners?',
        "The part needed for the claim goes to the credit of Realisation A/c, through which the claim is paid; whatever is left is credited to the capital accounts in the profit-sharing ratio.",
      ],
    };
  },
  verify: (q) => {
    const [W, claim = 0] = amountsIn(q.prompt);
    const names = namesIn(q.prompt);
    const left = Math.max(W - claim, 0);
    const real = q.expected.filter((l) => l.accountId === REAL && l.side === 'Cr').reduce((s, l) => s + l.amount, 0) / 100;
    return hasLine(q, 'workmenCompensationReserve', 'Dr', W) && real === Math.min(W, claim) && names.every((n) => (left === 0 ? !q.expected.some((l) => l.accountId === partnerCapital(n)) : hasLine(q, partnerCapital(n), 'Cr', shareIn(q.prompt, n, left))));
  },
});

// 2. dis-ifr: an Investment Fluctuation Reserve on dissolution: the investments go to Realisation A/c at book value
//    and are sold or taken over below it, and the whole reserve is the partners' (medium)
const ifrOnDissolution = numericTemplate({
  id: 'dis-ifr', topicId: T, conceptId: C.realisation, difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = settingFirm(rng);
    const i = rng.int(0, f.names.length - 1);
    const name = f.names[i];
    const R = f.sum * rng.step(2000, 12000, 1000);
    const fall = rng.step(5000, Math.max(5000, R - 5000), 5000);
    const book = rng.step(100000, 600000, 10000);
    const sold = rng.int(0, 1) === 0;
    const ans = shareOf(f, R, i);
    const n = numeric(ans, [
      [shareOf(f, R - fall, i), 'Met the fall in value out of the reserve first, as on a retirement. On dissolution the investments go to Realisation A/c at book value, and the fall is part of the loss there.'],
      [R, `Gave the whole reserve, not ${name}'s share of it.`],
      [R / f.names.length, 'Divided the reserve equally instead of in the profit-sharing ratio.'],
      [shareOf(f, fall, i), 'Shared the fall in value instead of the reserve.'],
    ]);
    return n && {
      prompt: `${f.intro} ${FLUCTUATING} The balance sheet on that date showed Investments at ${inr(book)} and an Investment Fluctuation Reserve of ${inr(R)}. The investments were transferred to Realisation A/c at their book value (the reserve itself is not) and ${sold ? `sold for ${inr(book - fall)}` : `taken over by ${f.names[(i + 1) % f.names.length]} at ${inr(book - fall)}`}. How much of the Investment Fluctuation Reserve is credited to ${name}'s Capital A/c?`,
      ...n,
      explanation: [
        `The investments went to the debit of Realisation A/c at ${inr(book)} and fetched ${inr(book - fall)}: the fall of ${inr(fall)} is part of the profit or loss on realisation.`,
        'So nothing is kept back from the reserve: the whole of it is undistributed profit, credited to the capital accounts in the profit-sharing ratio.',
        `${name}'s share = ${inr(R)} x ${fraction(f, i)} = ${inr(ans)}.`,
      ],
      hints: [
        'Where has the fall in the value of the investments already been recorded?',
        'On dissolution the investments go to Realisation A/c at book value, so the fall is counted there; the whole reserve goes to the partners in the profit-sharing ratio.',
      ],
    };
  },
  verify: (q) => {
    const name = /credited to ([A-Z][a-z]+)'s Capital/.exec(q.prompt)?.[1] ?? '';
    const R = amountsIn(q.prompt)[1];
    return q.answer === rupees(shareIn(q.prompt, name, R));
  },
});

// 3. dis-current-close: capitals were fixed; on dissolution a partner's current account, with a credit balance or a
//    debit balance, is closed to the capital account first (easy)
const currentClose = journalTemplate({
  id: 'dis-current-close', topicId: T, conceptId: C.closing, difficulty: 'easy',
  generate: (rng) => {
    const f = settingFirm(rng);
    const name = rng.pick(f.names);
    const debit = rng.int(0, 2) === 0;
    const B = rng.step(3000, 60000, 1000);
    const K = rng.step(100000, 500000, 10000);
    return {
      prompt: `${f.intro} The partners' capitals were fixed. On that date ${name}'s Capital A/c showed ${inr(K)} and ${name}'s Current A/c a ${debit ? 'debit' : 'credit'} balance of ${inr(B)}. Pass the journal entry that closes ${name}'s Current A/c before the accounts of the partners are settled.`,
      lines: debit ? [dr(partnerCapital(name), B), cr(partnerCurrent(name), B)] : [dr(partnerCurrent(name), B), cr(partnerCapital(name), B)],
      explanation: [
        'On dissolution each partner is settled through one account, the capital account, so the current account is closed into it first.',
        debit
          ? `A debit balance is owed by ${name} to the firm: ${name}'s Capital A/c is debited with ${inr(B)}, which reduces what ${name} will get, and ${name}'s Current A/c is credited, which closes it.`
          : `A credit balance is owed to ${name}: ${name}'s Current A/c is debited with ${inr(B)}, which closes it, and ${name}'s Capital A/c is credited.`,
      ],
      distractorAccounts: [REAL, 'bank', partnerLoan(name)],
      hints: [
        'Is the current account a credit balance (owed to the partner) or a debit balance (owed by the partner)?',
        'Close the current account into the capital account: a credit balance by Current A/c Dr, To Capital A/c; a debit balance by Capital A/c Dr, To Current A/c.',
      ],
    };
  },
  verify: (q) => {
    const name = /On that date ([A-Z][a-z]+)'s Capital/.exec(q.prompt)?.[1] ?? '';
    const B = amountsIn(q.prompt)[1];
    return /debit balance/.test(q.prompt)
      ? hasLine(q, partnerCapital(name), 'Dr', B) && hasLine(q, partnerCurrent(name), 'Cr', B)
      : hasLine(q, partnerCurrent(name), 'Dr', B) && hasLine(q, partnerCapital(name), 'Cr', B);
  },
});

interface FixedDissolution {
  f: Firm;
  K: number[];
  /** Current accounts: a credit balance positive, a debit balance negative. */
  cur: number[];
  R: number;
  W: number;
  claim: number;
  /** The profit on realisation, or the loss as a negative figure. */
  V: number;
  /** An asset taken over (with a profit) or a liability taken over (with a loss), by partner `by`. */
  over: { by: number; amount: number; asset: boolean; what: string };
}
const fixedKept = keepFor<FixedDissolution>();

/** Each partner's final payment (positive) or the amount the partner brings in (negative). */
const fixedFinals = (s: FixedDissolution): number[] =>
  s.f.names.map((_, i) => s.K[i] + s.cur[i] + shareOf(s.f, s.R + s.W - s.claim + s.V, i) + (i === s.over.by ? (s.over.asset ? -s.over.amount : s.over.amount) : 0));

// 4. dis-fmt-capitals-fixed: the partners' capital accounts in columns on dissolution when capitals were fixed: the
//    current accounts closed into them first (one a debit balance in most seeds), a reserve, the free part of a Workmen
//    Compensation Reserve after a claim, the profit or loss on realisation, an asset or a liability taken over by a
//    partner, and the final settlement by cheque (complex)
const fmtCapitalsFixed = accountTemplate({
  id: 'dis-fmt-capitals-fixed', topicId: T, conceptId: FORMATS, difficulty: 'complex',
  generate: (rng) => {
    for (let tries = 0; tries < 10; tries++) {
      const f = settingFirm(rng);
      const n = f.names.length;
      const K = f.names.map(() => rng.step(100000, 400000, 10000));
      const debitAt = rng.int(0, 3) === 0 ? -1 : rng.int(0, n - 1);
      const cur = f.names.map((_, i) => rng.step(4000, 50000, 1000) * (i === debitAt ? -1 : 1));
      const R = f.sum * rng.step(2000, 12000, 1000);
      const claim = rng.step(10000, 60000, 5000);
      const W = claim + f.sum * rng.step(1000, 8000, 1000);
      const profit = rng.int(0, 1) === 0;
      const V = f.sum * rng.step(2000, 15000, 1000) * (profit ? 1 : -1);
      const by = rng.int(0, n - 1);
      const over = profit
        ? { by, amount: rng.step(20000, 90000, 5000), asset: true, what: rng.pick(['the motor van', 'the computers', 'the furniture', 'the investments']) }
        : { by, amount: rng.step(10000, 50000, 5000), asset: false, what: rng.pick(['the bank loan', 'the bills payable', "a creditor's dues"]) };
      const s: FixedDissolution = { f, K, cur, R, W, claim, V, over };
      const finals = fixedFinals(s);
      if (finals.some((v) => v === 0)) continue;
      const D = f.date;
      const entries: DatedEntry[] = [
        ...f.names.map((name, i) => ({ date: D, lines: cur[i] > 0 ? [dr(partnerCurrent(name), cur[i]), cr(partnerCapital(name), cur[i])] : [dr(partnerCapital(name), -cur[i]), cr(partnerCurrent(name), -cur[i])] })),
        { date: D, lines: [dr('generalReserve', R), ...f.names.map((nm, i) => cr(partnerCapital(nm), shareOf(f, R, i)))] },
        { date: D, lines: [dr('workmenCompensationReserve', W), cr(REAL, claim), ...f.names.map((nm, i) => cr(partnerCapital(nm), shareOf(f, W - claim, i)))] },
        over.asset ? { date: D, lines: [dr(partnerCapital(f.names[by]), over.amount), cr(REAL, over.amount)] } : { date: D, lines: [dr(REAL, over.amount), cr(partnerCapital(f.names[by]), over.amount)] },
        V > 0
          ? { date: D, lines: [dr(REAL, V), ...f.names.map((nm, i) => cr(partnerCapital(nm), shareOf(f, V, i)))] }
          : { date: D, lines: [...f.names.map((nm, i) => dr(partnerCapital(nm), shareOf(f, -V, i))), cr(REAL, -V)] },
        ...f.names.map((name, i) => ({ date: D, lines: finals[i] > 0 ? [dr(partnerCapital(name), finals[i]), cr('bank', finals[i])] : [dr('bank', -finals[i]), cr(partnerCapital(name), -finals[i])] })),
      ];
      const view = columnarAccount(entries, f.names.map(partnerCapital), { date: D, balances: K.map((k) => ({ side: 'Cr' as const, amount: rupees(k) })) }, (id) =>
        id === REAL ? 'Realisation A/c' : ledgerLabel(id).replace(/^[A-Z][a-z]+'s Current A\/c$/, 'Current A/c'),
      );
      if (view.balances.some((b) => b !== null)) continue;
      const sides = columnarSides(view, { closeOn: D });
      // The result of realisation and the item taken over stand on opposite sides, so each side has one Realisation row.
      const realRow = (rows: FormatRowParts[], side: 'Dr' | 'Cr'): FormatRowParts[] =>
        rows.map((r) => (r.label === 'Realisation A/c' ? { ...r, label: (side === 'Dr') === over.asset ? `Realisation A/c (${over.asset ? 'asset taken over' : 'liability taken over'})` : `Realisation A/c (${V > 0 ? 'profit' : 'loss'})`, also: ['Realisation A/c'] } : r));
      const data = [
        `${f.intro} The partners' capitals were fixed.`,
        `Capital accounts: ${f.names.map((nm, i) => `${nm} ${inr(K[i])}`).join(', ')}`,
        `Current accounts: ${f.names.map((nm, i) => `${nm} ${inr(Math.abs(cur[i]))} (${cur[i] > 0 ? 'Cr' : 'Dr'})`).join(', ')}`,
        `General Reserve: ${inr(R)}`,
        `Workmen Compensation Reserve: ${inr(W)}; a claim of ${inr(claim)} was admitted. ${CLAIM_THROUGH}`,
        over.asset ? `${f.names[by]} took over ${over.what} at ${inr(over.amount)}.` : `${f.names[by]} agreed to pay ${over.what}, ${inr(over.amount)}, personally.`,
        `Realisation A/c showed a ${V > 0 ? 'profit' : 'loss'} of ${inr(Math.abs(V))}.`,
        'The current accounts are closed into the capital accounts first. The partners were then settled by cheque.',
      ].join('\n');
      fixedKept.keep(data, s);
      return {
        task: "Prepare the partners' capital accounts in columns to close the books of the firm.",
        data,
        title: "Partners' Capital Accounts",
        columns: partnerColumns(f.names),
        ...sides,
        left: { ...sides.left, rows: realRow(sides.left.rows, 'Dr') },
        right: { ...sides.right, rows: realRow(sides.right.rows, 'Cr') },
        distractors: ['Workmen Compensation Claim A/c', 'Revaluation A/c', 'Balance c/d', 'Profit and Loss Appropriation A/c'],
        explanation: [
          'Each partner has a column. The fixed capitals open the credit side ("By Balance b/d").',
          `The current accounts are closed into the capital accounts first: a credit balance is credited ("By Current A/c"), a debit balance debited ("To Current A/c"): ${f.names.map((nm, i) => `${nm} ${inr(Math.abs(cur[i]))} ${cur[i] > 0 ? 'Cr' : 'Dr'}`).join(', ')}.`,
          `General Reserve ${inr(R)} in the profit-sharing ratio ${f.ratio.join(':')} ("By General Reserve A/c"): ${f.names.map((nm, i) => `${nm} ${inr(shareOf(f, R, i))}`).join(', ')}.`,
          `Workmen Compensation Reserve: ${inr(claim)} is needed for the claim and goes to Realisation A/c; the rest, ${inr(W - claim)}, is credited ("By Workmen Compensation Reserve A/c"): ${f.names.map((nm, i) => `${nm} ${inr(shareOf(f, W - claim, i))}`).join(', ')}.`,
          over.asset
            ? `${f.names[by]} took over ${over.what}: debited ("To Realisation A/c") ${inr(over.amount)}.`
            : `${f.names[by]} pays ${over.what} personally, which the firm then need not pay: credited ("By Realisation A/c") ${inr(over.amount)}.`,
          `The ${V > 0 ? 'profit' : 'loss'} on realisation, ${inr(Math.abs(V))}, is ${V > 0 ? 'credited' : 'debited'} in the profit-sharing ratio: ${f.names.map((nm, i) => `${nm} ${inr(shareOf(f, Math.abs(V), i))}`).join(', ')}.`,
          ...f.names.map((nm, i) => (finals[i] > 0 ? `${nm}'s column has a credit balance of ${inr(finals[i])}, paid by cheque ("To Bank A/c").` : `${nm}'s column has a debit balance of ${inr(-finals[i])}, which ${nm} brings in ("By Bank A/c").`)),
        ],
        hints: [
          'Start by closing each current account into its capital account. Which balances are debit balances?',
          'Credit: capital, a credit current balance, reserves, a profit on realisation, a liability taken over. Debit: a debit current balance, a loss on realisation, an asset taken over. The balance is paid, or brought in.',
        ],
      };
    }
    return null;
  },
  verify: (q) => {
    const s = fixedKept.of(q.data);
    if (!s) return false;
    // Each column worked again from the figures, and settled through Bank A/c on the side its balance calls for.
    const finals = s.f.names.map((_, i) => s.K[i] + s.cur[i] + ((s.R + s.W - s.claim + s.V) * s.f.ratio[i]) / s.f.sum + (i === s.over.by ? (s.over.asset ? -1 : 1) * s.over.amount : 0));
    const [debit, credit] = q.sides;
    const bank = (rows: readonly { label: string; amounts: number[] }[], i: number): number => (rows.find((r) => r.label === 'Bank A/c')?.amounts[i] ?? 0) / 100;
    const colTotal = (rows: readonly { amounts: number[] }[], i: number): number => rows.reduce((t, r) => t + r.amounts[i], 0);
    return s.f.names.every((_, i) => bank(debit.rows, i) - bank(credit.rows, i) === finals[i] && colTotal(debit.rows, i) === colTotal(credit.rows, i));
  },
});

const templates: Template[] = [
  kindOfDissolution, modeOfDissolution, orderOfPayment, goesToRealisation, valueNotGiven, resultSimple, shareOfResult,
  journalAssetSold, journalLiabilityPaid, journalAssetTaken, journalExpensesPaid, loanTreatment, journalReserves, journalFinalPayment,
  journalCreditorAsset, settledByAsset, journalUnrecordedAsset, journalUnrecordedLiability, journalLiabilityTaken, journalRemuneration, expensesEntry,
  expensesCharge, journalLoans, debtorsProvision, journalTransferAssets, journalTransferLiabilities, journalResult, finalPayment, settleOrBring,
  cashForPartners, totalToPartner,
  realisationFull, fullFinalPayment, bankTotal, missingRealisedValue, resultSign, creditorsCash, journalCloseRealisation, unrecordedEffect,
  setItems, setExpenses, setLoans, setWhole,
  fmtRealisation, fmtRealisationFull, fmtCapitals, fmtBank, fmtCapitalsDeficit,
  disAssertionReason,
  // Added later, outside the papers (outsidePapers.ts).
  wcrOnDissolution, ifrOnDissolution, currentClose,
  fmtCapitalsFixed,
];

export default templates;

// What the case studies of the dissolution stage (`src/generators/cases/dissolution.ts`) reuse: the firm, the things
// it owns and owes, the examined wording of the single questions, and one whole dissolution (`windUp`) with the
// accounts, wrong labels, working and checks of its formats.
export {
  FLUCTUATING, FORMAT_HINTS, H, HANDY, INVESTMENTS, REALISATION_TASK, SET_HINTS, TANGIBLE, TRANSFERRED, UNRECORDED_ASSETS, UNRECORDED_LIABS,
  capitalAccounts, capitalSlips, capitalWorking, capitalsHoldFor, caseData, chargeOf, chargedFor, choice, closes, creditedFor, firm, forFee, fraction,
  moneyAccount, moneyHoldsFor, moneySlips, moneyWorking, namesIn, numeric, profitOrLoss, ratioIn, realisationAccount, realisationHoldsFor,
  realisationNotes, realisationSlips, relative, resultLine, shareOf, was, windUp,
};
export type { Books, ExpenseForm, Firm, Item, Step, Thing };
