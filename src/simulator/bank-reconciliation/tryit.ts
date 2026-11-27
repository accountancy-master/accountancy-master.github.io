import { formatINR, type Paise } from '@/engine/money';
import { createRng, type Rng } from '@/engine/rng';
import { balanceLabel, BOOK_NAME, cashBookOf, factsOf, otherBook, passBookOf, reconcile, ruleOf, treatmentOf, type Book, type Item, type Scenario } from './books';
import { randomScenario } from './examples';

// ---------------------------------------------------------------------------------------------------------------
// "Try it": quick questions asked on the picture of a month. Nothing is recorded.
// ---------------------------------------------------------------------------------------------------------------

const inr = formatINR;

export interface Choice {
  id: string;
  text: string;
  why?: string;
}

export type Answer =
  | {
      type: 'number';
      value: Paise;
      mistakes: { value: Paise; why: string }[];
      /** A word to choose with the figure: favourable or overdraft. */
      tag?: { label: string; options: Choice[]; correct: string };
    }
  | { type: 'choice'; options: Choice[]; correct: string };

export const BRS_ASK_KINDS = ['add-or-less', 'balance-after', 'which-book', 'needs-entry'] as const;
export type BrsAskKind = (typeof BRS_ASK_KINDS)[number];

export const BRS_ASK_LABEL: Record<BrsAskKind, string> = {
  'add-or-less': 'Add or less?',
  'balance-after': 'The balance after',
  'which-book': 'Which book is wrong?',
  'needs-entry': 'Enter it in the cash book?',
};

export interface BrsAsk {
  kind: BrsAskKind;
  prompt: string;
  scenario: Scenario;
  /** The statement starts from this book. */
  from: Book;
  /** The items the question is about (highlighted on the picture). */
  items: string[];
  answer: Answer;
  reason: string;
}

const startOf = (s: Scenario, from: Book): Paise => (from === 'cb' ? cashBookOf(s).balance : passBookOf(s).balance);
const startWords = (s: Scenario, from: Book): string => {
  const b = startOf(s, from);
  return `${balanceLabel(from, b)}: ${inr(Math.abs(b))}`;
};

export function brsAsk(kind: BrsAskKind, rng: Rng): BrsAsk {
  const scenario = randomScenario(rng);
  const from: Book = rng.pick(['cb', 'pb'] as const);
  const item = rng.pick(scenario.items);
  const f = factsOf(item, scenario);
  if (kind === 'add-or-less') {
    const start = startOf(scenario, from);
    const t = treatmentOf(from, start, item, scenario);
    const wrong = `It makes the ${BOOK_NAME[otherBook(from)]} balance ${(from === 'cb' ? f.sign : -f.sign) > 0 ? 'more' : 'less'} favourable, so from ${start >= 0 ? 'a favourable balance' : 'an overdraft'} it is ${t === 'add' ? 'added' : 'deducted'}.`;
    return {
      kind,
      prompt: `The statement starts from the ${startWords(scenario, from)}. "${f.line}", ${inr(item.amount)}: is it added or deducted?`,
      scenario,
      from,
      items: [item.id],
      answer: {
        type: 'choice',
        options: [
          { id: 'add', text: 'Add', ...(t === 'add' ? {} : { why: wrong }) },
          { id: 'less', text: 'Less', ...(t === 'less' ? {} : { why: wrong }) },
        ],
        correct: t,
      },
      reason: `${f.why} ${ruleOf(from, start, item, scenario)}`,
    };
  }
  if (kind === 'which-book') {
    const right = f.cause === 'cbError' ? 'cb' : f.cause === 'bankError' ? 'pb' : 'neither';
    const neitherWhy = f.cause === 'timing' ? 'Both books are right: the bank simply has not reached the cheque yet.' : 'Both books are right: the bank recorded it first, and the firm has not yet heard of it.';
    return {
      kind,
      prompt: `${f.title}, ${inr(item.amount)}. Which book is wrong because of it?`,
      scenario,
      from,
      items: [item.id],
      answer: {
        type: 'choice',
        options: [
          { id: 'cb', text: 'The Cash Book', ...(right === 'cb' ? {} : { why: right === 'pb' ? 'The firm recorded it right; the bank made the mistake.' : neitherWhy }) },
          { id: 'pb', text: 'The Pass Book', ...(right === 'pb' ? {} : { why: right === 'cb' ? 'The bank paid the real figure; the firm wrote it down wrongly.' : neitherWhy }) },
          { id: 'neither', text: 'Neither book', ...(right === 'neither' ? {} : { why: `One of them has it wrong: ${right === 'cb' ? 'the cash book' : 'the pass book'}.` }) },
        ],
        correct: right,
      },
      reason: `${f.why} ${f.cause === 'timing' ? 'It is a timing difference and needs no entry.' : f.cause === 'bankFirst' ? 'The cash book is not wrong, only behind: the firm now enters it.' : f.cause === 'cbError' ? 'The firm corrects its cash book.' : 'The firm makes no entry; the bank corrects its own record.'}`,
    };
  }
  if (kind === 'needs-entry') {
    const yesWhy = f.cause === 'timing' ? 'It is already in the cash book; the bank will catch up by itself.' : 'It is the bank\'s own mistake: the bank corrects it, not the firm.';
    return {
      kind,
      prompt: `When the cash book is amended, does "${f.line}", ${inr(item.amount)}, need an entry in it?`,
      scenario,
      from: 'cb',
      items: [item.id],
      answer: {
        type: 'choice',
        options: [
          { id: 'yes', text: 'Yes, enter it', ...(f.enter ? {} : { why: yesWhy }) },
          { id: 'no', text: 'No entry', ...(f.enter ? { why: f.cause === 'cbError' ? 'The cash book has it wrong, and the firm corrects its own book.' : item.kind === 'dishonoured' ? 'The cash book still counts the cheque as received: the firm takes it out again (the bank column is credited, the customer debited).' : 'The cash book does not have it yet, and it is a real receipt or payment of the firm.' } : {}) },
        ],
        correct: f.enter ? 'yes' : 'no',
      },
      reason: `${f.why} ${f.enter ? 'The firm enters it, so it leaves the reconciliation once the cash book is amended.' : 'It stays in the reconciliation statement until the bank catches up.'}`,
    };
  }
  // balance-after: a short statement of two or three items.
  const items = rng.shuffle(scenario.items).slice(0, rng.int(2, 3)).sort((a, b) => a.day - b.day);
  const sub: Scenario = { ...scenario, items };
  const start = startOf(sub, from);
  const end = reconcile(from, start, items, sub);
  const to = otherBook(from);
  const reversed = start - (end - start);
  const allAdded = start >= 0 ? start + items.reduce((t, i) => t + i.amount, 0) : start - items.reduce((t, i) => t + i.amount, 0);
  const steps = items.map((i: Item) => `${treatmentOf(from, start, i, sub) === 'add' ? 'Add' : 'Less'} ${inr(i.amount)} (${factsOf(i, sub).line})`);
  return {
    kind,
    prompt: `${startWords(sub, from)}. The only differences are: ${items.map((i) => `${factsOf(i, sub).line}, ${inr(i.amount)}`).join('; ')}. What is the balance as per the ${BOOK_NAME[to]}?`,
    scenario: sub,
    from,
    items: items.map((i) => i.id),
    answer: {
      type: 'number',
      value: Math.abs(end),
      mistakes: [
        { value: Math.abs(reversed), why: 'Every item went the wrong way round: ask whether each one makes the other book\'s balance more or less favourable.' },
        { value: Math.abs(allAdded), why: 'Added every item, whatever its direction.' },
      ].filter((m, n, all) => m.value !== Math.abs(end) && m.value > 0 && all.findIndex((x) => x.value === m.value) === n),
      tag: {
        label: 'Favourable or overdraft?',
        options: [
          { id: 'fav', text: 'Favourable', ...(end >= 0 ? {} : { why: start >= 0 ? 'The items take the balance below nothing: it ends as an overdraft.' : 'The items do not clear the overdraft: it is still an overdraft.' }) },
          { id: 'od', text: 'Overdraft', ...(end < 0 ? {} : { why: start < 0 ? 'The items more than clear the overdraft: the balance ends favourable.' : 'The balance stays above nothing: it is favourable.' }) },
        ],
        correct: end >= 0 ? 'fav' : 'od',
      },
    },
    reason: `${balanceLabel(from, start)} ${inr(Math.abs(start))}. ${start < 0 ? 'An overdraft turns the rule round. ' : ''}${steps.join('; ')}. ${balanceLabel(to, end)}: ${inr(Math.abs(end))}.`,
  };
}

/** The made-up month of the `n`th question of a kind, from a seed: the screen and the tests draw the same. */
export const askRng = (seed: number, kind: BrsAskKind, n: number): Rng => createRng(seed * 1013 + BRS_ASK_KINDS.indexOf(kind) * 137 + n);
