import { ASSERTION_REASON_OPTIONS as BOARD_OPTIONS, factsTemplate } from './authoring';
import type { McqParts, McqTemplate } from './types';

// Assertion and Reason, the 1-mark format of the board's papers. Each item is two statements and which of the four
// answers is right. The explanation and the mistake named by each wrong option are put together here from what the
// item says about A and R, so that every item says why A is true or false, why R is true or false, and whether R
// explains A.

/** The four answers, in the board's order. */
const ANSWERS = ['explains', 'not-the-reason', 'a-only', 'r-only'] as const;
export type AssertionReasonAnswer = (typeof ANSWERS)[number];

/** The four options, word for word as the board's papers and the authored questions put them. */
export const ASSERTION_REASON_OPTIONS: Record<AssertionReasonAnswer, string> = {
  explains: BOARD_OPTIONS.both,
  'not-the-reason': BOARD_OPTIONS.bothNot,
  'a-only': BOARD_OPTIONS.aOnly,
  'r-only': BOARD_OPTIONS.rOnly,
};

/** The fewest items a bank may have. */
export const FEWEST_ITEMS = 10;

interface Statements {
  /** The Assertion. */
  a: string;
  /** The Reason. */
  r: string;
  /** Why A is true, or false: one or two sentences that stand alone. */
  aWhy: string;
  /** Why R is true, or false. */
  rWhy: string;
}

export type AssertionReasonItem = Statements &
  (
    | {
        answer: 'explains' | 'not-the-reason';
        /** Both are true: how R makes A so, or what the reason for A really is. */
        link: string;
      }
    | { answer: 'a-only' | 'r-only'; link?: undefined }
  );

const truthOf = (answer: AssertionReasonAnswer) => ({ a: answer !== 'r-only', r: answer !== 'a-only' });

/** The mistake of a learner who chooses `chosen` when `item.answer` is right. */
function mistake(item: AssertionReasonItem, chosen: AssertionReasonAnswer): string {
  const right = truthOf(item.answer), said = truthOf(chosen);
  const wrongOnA = right.a !== said.a, wrongOnR = right.r !== said.r;
  const tookA = `A as ${said.a ? 'true' : 'false'}`, tookR = `R as ${said.r ? 'true' : 'false'}`;
  if (wrongOnA && wrongOnR) return `Took ${tookA} and ${tookR}. ${item.aWhy} ${item.rWhy}`;
  if (wrongOnA) return `Took ${tookA}. ${item.aWhy}`;
  if (wrongOnR) return `Took ${tookR}. ${item.rWhy}`;
  return `${chosen === 'explains' ? 'Took R as the reason for A because both are true.' : 'Took R as a true statement that does not explain A.'} ${item.link}`;
}

function factOf(item: AssertionReasonItem): McqParts {
  const { a, r } = truthOf(item.answer);
  const link = item.link ?? (item.answer === 'a-only' ? 'R is false, so it cannot explain A.' : 'A is false, so R cannot be its explanation.');
  return {
    prompt: `Assertion (A): ${item.a}\nReason (R): ${item.r}\nChoose the correct option.`,
    correct: ASSERTION_REASON_OPTIONS[item.answer],
    distractors: ANSWERS.filter((answer) => answer !== item.answer).map((answer) => ({ text: ASSERTION_REASON_OPTIONS[answer], why: mistake(item, answer) })),
    optionOrder: ANSWERS.map((answer) => ASSERTION_REASON_OPTIONS[answer]),
    explanation: `A is ${a ? 'true' : 'false'}. ${item.aWhy} R is ${r ? 'true' : 'false'}. ${item.rWhy} ${link}`,
    hints: ['Decide whether A is true, and then whether R is true.', 'If both are true, ask whether A holds because of R.'],
  };
}

/** The items with each answer spaced evenly through the bank, so that a run of seeds meets all four answers. */
function spaced(items: readonly AssertionReasonItem[]): AssertionReasonItem[] {
  return ANSWERS.flatMap((answer) => items.filter((item) => item.answer === answer).map((item, i, group) => ({ item, at: (i + 0.5) / group.length })))
    .sort((x, y) => x.at - y.at)
    .map((x) => x.item);
}

/**
 * The template of a topic's Assertion and Reason items: a bank of facts of medium difficulty, whose id ends in
 * `-assertion-reason` (which keeps it out of the mock papers and the worksheets: `isAssertionReason`). A level asks
 * one template several times, and consecutive seeds serve different items, so no item comes twice in a session the
 * size of the bank. Throws for a bank of fewer than `FEWEST_ITEMS`, or one that leaves out one of the four answers.
 */
export function assertionReasonTemplate(def: { prefix: string; topicId: string; conceptId: string; items: readonly AssertionReasonItem[] }): McqTemplate {
  const { prefix, topicId, conceptId, items } = def;
  const id = `${prefix}-assertion-reason`;
  if (items.length < FEWEST_ITEMS) throw new Error(`${id}: ${items.length} items, not ${FEWEST_ITEMS} or more`);
  for (const answer of ANSWERS) if (!items.some((item) => item.answer === answer)) throw new Error(`${id}: no item has the answer "${answer}"`);
  const facts = spaced(items).map(factOf);
  return factsTemplate({ id, topicId, conceptId, difficulty: 'medium', facts });
}
