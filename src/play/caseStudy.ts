import type { AccountQuestion, Question, StatementQuestion } from '@/content/types';
import { caseOfQuestion } from '@/content/outline';
import { parseCasePartId, parseGenId } from '@/generators/ids';

/** Where a question stands in its case study (question 2 of 6), or null for a question that is not part of a case. */
export function casePosition(question: Pick<Question, 'id'>): { number: number; of: number } | null {
  const part = parseCasePartId(parseGenId(question.id)?.templateId ?? '');
  const found = caseOfQuestion(question.id);
  return part && found ? { number: part.index + 1, of: found.parts.length } : null;
}

/** The case the learner last opened or closed the case panel on, and how they left it. */
export interface CaseView {
  context: string;
  open: boolean;
}

/**
 * Whether the case panel is open for a question with this case text: as the learner left it while the case stays the
 * same, and open again when a new case begins (so always on the first question of a case).
 */
export const isCaseOpen = (view: CaseView | null, context: string): boolean => (view?.context === context ? view.open : true);

/** The view after the learner presses the panel's button on a question with this case text. */
export const toggleCase = (view: CaseView | null, context: string): CaseView => ({ context, open: !isCaseOpen(view, context) });

const LONG_TYPES: readonly Question['type'][] = ['journal_set', 'account', 'statement'];

/**
 * True for a question that is long to answer and is marked piece by piece: a set of entries, an account, a statement.
 * A case study that asks one is a chained case.
 */
export const isLongQuestion = (question: Pick<Question, 'type'>): boolean => LONG_TYPES.includes(question.type);

/**
 * Whether the case of a question stays at the top of the screen while it is answered. It does for a long question of
 * a case (a format or a set of entries of a chained case): its rows are worked from the case text over many minutes,
 * so the text has to be within reach from any of them, as the data of a format that stands alone is. A short
 * question has its case above its prompt, where it scrolls away with the page. Once the answer has been checked the
 * panel scrolls with the page for every question: what follows is the review.
 */
export const caseStaysInReach = (question: Pick<Question, 'type' | 'context'>, answered: boolean): boolean =>
  !answered && question.context !== undefined && isLongQuestion(question);

/**
 * The data a format shows in a panel of its own, headed "Data": its data, unless it is one question of a case study.
 * The data of such a format is the case text, and whatever shows the question shows its case (the player and a mock
 * paper above the prompt, the Mistakes screen above the question, a marked paper once for the whole case), so a
 * second panel would say the same thing twice.
 */
export const ownData = (question: Pick<AccountQuestion | StatementQuestion, 'data' | 'context'>): string | null =>
  question.context === undefined ? question.data : null;

