import type { ComponentType, ReactNode } from 'react';
import { AccountInput } from '@/components/play/AccountInput';
import { FormatReview } from '@/components/play/FormatSolution';
import { JournalEntryInput } from '@/components/play/JournalEntryInput';
import { JournalSetInput, SetReview } from '@/components/play/JournalSetInput';
import { McqInput } from '@/components/play/McqView';
import { NumericInput } from '@/components/play/NumericInput';
import { SolutionEntry } from '@/components/play/SolutionEntry';
import { StatementInput } from '@/components/play/StatementInput';
import { TrueFalseInput } from '@/components/play/TrueFalseView';
import { KEEP_LINES } from '@/components/ui/Prompt';
import type { AnswerInputProps } from '@/components/play/inputProps';
import type { JournalQuestion, Question, TypedQuestion } from '@/content/types';
import { explainEntry } from '@/engine/explain';
import { asDraft, draftResponse, responseDraft } from '@/play/drafts';
import { EXERCISE_LOGIC, logicFor, readFormatCode, readSetCode, type ExerciseLogic, type LongResponse, type Response } from './logic';

/** What a question's solution looks like once it has been answered or revealed, beyond the "Right answer" line. */
interface SolutionProps<Q extends Question> {
  question: Q;
  /** The code of the mistake the solution is shown for, when there was one: a set marks its entries from it. */
  mistakeCode?: string;
  /** On the Mistakes screen: the answer the attempt kept (a long question that was not right), when it kept one. */
  answer?: LongResponse;
}

/**
 * Everything one question type needs: the logic (check, wording of the right and wrong answer, what the e2e tests
 * type) and its screens. QuestionStage, FeedbackPanel and MistakesView look types up here instead of branching on
 * `question.type`, so a new type is one entry in `EXERCISE_LOGIC` and one here.
 */
export interface ExerciseType<Q extends Question, R extends Response> extends ExerciseLogic<Q, R> {
  /** The answer controls. */
  Input: ComponentType<AnswerInputProps<Q>>;
  /** Shown in the feedback after the explanation: the worked solution. Absent when the explanation is all there is. */
  Solution?: ComponentType<SolutionProps<Q>>;
  /** True when `Solution` already contains the explanation, so the feedback must not print it twice. */
  solutionHasExplanation?: boolean;
  /**
   * For a type whose input, once checked, shows the worked solution itself (the journal of a set shows every correct
   * entry beside its transaction): the sentence feedback says in place of the explanation. A marked mock paper then
   * shows the input even when nothing was entered.
   */
  inputShowsSolution?: string;
  /** The Mistakes screen's expandable answer: its label, and what it shows. Absent when there is nothing to expand. */
  Review?: { label: string; Body: ComponentType<SolutionProps<Q>> };
}

const WorkingLines = ({ lines }: { lines: string[] }) => (
  <ul data-testid="working" className="flex list-disc flex-col gap-1 pl-5 text-base">
    {lines.map((line, i) => (
      <li key={i} className={KEEP_LINES}>
        {line}
      </li>
    ))}
  </ul>
);

function JournalSolution({ question }: SolutionProps<JournalQuestion>) {
  const steps = explainEntry(question.expected);
  // Some generated explanations already are the line-by-line reasoning; do not say it twice.
  const showSteps = steps.length > 0 && steps.join(' ') !== question.explanation;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-extrabold uppercase tracking-wide">Correct entry</p>
      <SolutionEntry lines={question.expected} narration={question.narration ?? true} transaction={question.prompt} />
      {showSteps ? <WorkingLines lines={steps} /> : null}
    </div>
  );
}

function NumericSolution({ question }: SolutionProps<TypedQuestion>) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-extrabold uppercase tracking-wide">Working</p>
      <WorkingLines lines={question.working} />
    </div>
  );
}

const nothing = () => {};

/**
 * The Mistakes screen's answer of a long question. Where the attempt kept what the student wrote, that answer is put
 * back into its own input and marked again, as a marked mock paper shows an answer: the review the student saw after
 * answering, their own entries or rows ticked and crossed and then the correct ones. Where it kept none (an attempt
 * made before answers were kept, an answer that was shown), `children` say what the stored code tells.
 */
function KeptReview({ question, answer, children }: { question: Question; answer?: LongResponse; children: ReactNode }) {
  const draft = answer?.type === question.type ? asDraft(question, responseDraft(answer, question)) : undefined;
  // What is marked is what the input shows: the answer as it reads back from its rows.
  const response = draft ? draftResponse(question, draft) : null;
  const result = response ? logicFor(question).check(question, response) : null;
  if (!draft || !result || result.correct) return children;
  const { Input } = exerciseFor(question);
  return <Input question={question} checked result={result} draft={draft} onFilledChange={nothing} registerSubmit={nothing} onAnswer={nothing} />;
}

type OfType<T extends Question['type']> = Extract<Question, { type: T }>;
type ResponseOf<T extends Question['type']> = Extract<Response, { type: T }>;

export const EXERCISES: { [T in Question['type']]: ExerciseType<OfType<T>, ResponseOf<T>> } = {
  mcq: { ...EXERCISE_LOGIC.mcq, Input: McqInput },
  true_false: { ...EXERCISE_LOGIC.true_false, Input: TrueFalseInput },
  journal_entry: {
    ...EXERCISE_LOGIC.journal_entry,
    Input: JournalEntryInput,
    Solution: JournalSolution,
    Review: { label: 'Show correct entry', Body: ({ question }) => <SolutionEntry lines={question.expected} narration={question.narration ?? true} transaction={question.prompt} /> },
  },
  numeric: {
    ...EXERCISE_LOGIC.numeric,
    Input: NumericInput,
    Solution: NumericSolution,
    solutionHasExplanation: true,
    Review: {
      label: 'Show correct answer',
      Body: ({ question }) => (
        <div className="flex flex-col gap-3">
          <p className={`text-base ${KEEP_LINES}`}>
            <span className="font-extrabold">Right answer: </span>
            {EXERCISE_LOGIC.numeric.correctAnswer(question)}
          </p>
          <NumericSolution question={question} />
        </div>
      ),
    },
  },
  journal_set: {
    ...EXERCISE_LOGIC.journal_set,
    Input: JournalSetInput,
    inputShowsSolution: 'Each transaction above shows its correct entry and the reasons for it.',
    Review: {
      label: 'Show correct entries',
      Body: ({ question, mistakeCode, answer }) => (
        <KeptReview question={question} answer={answer}>
          <SetReview question={question} verdicts={readSetCode(mistakeCode, question.entries.length)} />
        </KeptReview>
      ),
    },
  },
  account: {
    ...EXERCISE_LOGIC.account,
    Input: AccountInput,
    inputShowsSolution: 'The correct account is set out above as an examiner expects it, with the working under it.',
    Review: {
      label: 'Show correct account',
      Body: ({ question, mistakeCode, answer }) => (
        <KeptReview question={question} answer={answer}>
          <FormatReview question={question} verdicts={readFormatCode(question, mistakeCode)} />
        </KeptReview>
      ),
    },
  },
  statement: {
    ...EXERCISE_LOGIC.statement,
    Input: StatementInput,
    inputShowsSolution: 'The correct statement is set out above as an examiner expects it, with the working under it.',
    Review: {
      label: 'Show correct statement',
      Body: ({ question, mistakeCode, answer }) => (
        <KeptReview question={question} answer={answer}>
          <FormatReview question={question} verdicts={readFormatCode(question, mistakeCode)} />
        </KeptReview>
      ),
    },
  },
};

/** The entry for a question's type, with the question typed loosely (a question is always given its own type's entry). */
export const exerciseFor = (q: Question): ExerciseType<Question, Response> =>
  EXERCISES[q.type] as unknown as ExerciseType<Question, Response>;
