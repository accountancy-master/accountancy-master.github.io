import type { ReactNode } from 'react';
import type { Question } from '@/content/types';
import { setEntryHeading } from '@/exercises/logic';
import { partLabel, type SheetItem } from '@/learning/worksheet';
import { answerBlank, choiceAnswer, figureAnswer, journalRows, keyJournalLines, setRows, trueFalseAnswer, workingOf } from '@/learning/worksheetLayout';
import { ownData } from '@/play/caseStudy';
import { JournalTable, LedgerTable, StatementTable, WritingLines } from './tables';

// One question of a worksheet as it is printed for writing on (`SheetQuestionItem`), and its answer as the key gives it
// (`KeyItem`). A case study is printed once with its case text, then its parts (a), (b), ...

const TEXT = 'whitespace-pre-line [overflow-wrap:anywhere]';

const marksText = (marks: number) => `[${marks} ${marks === 1 ? 'mark' : 'marks'}]`;

/** The number and marks of a question, over what it asks. */
function ItemHead({ number, marks, children }: { number: number; marks: number; children?: ReactNode }) {
  return (
    <div className="ws-keep flex items-baseline gap-2">
      <span className="shrink-0 font-bold">{number}.</span>
      <span className="min-w-0 flex-1 font-bold">{children}</span>
      <span data-testid="ws-marks" className="shrink-0 text-[13px] font-bold">
        {marksText(marks)}
      </span>
    </div>
  );
}

/** What a format works from (its data), framed; a format of a case works from the case, printed once above. */
function DataBox({ text }: { text: string }) {
  return <div className={`${TEXT} border border-black px-2 py-1.5 text-[13px] tabular-nums`}>{text}</div>;
}

/** The answer line of a figure: "Answer: ₹ ______", "______ %", "____ : ____". */
function AnswerLine({ q }: { q: Extract<Question, { type: 'numeric' }> }) {
  const blank = answerBlank(q);
  const space = <span className="inline-block w-28 border-b border-black sm:w-36">&nbsp;</span>;
  return (
    <p data-testid="ws-answer-line" className="flex flex-wrap items-baseline gap-1.5 font-bold">
      <span>Answer:</span>
      {blank.before ? <span>{blank.before}</span> : null}
      {blank.terms > 1
        ? Array.from({ length: blank.terms }, (_, i) => (
            <span key={i} className="inline-flex items-baseline gap-1.5">
              {i > 0 ? <span>:</span> : null}
              <span className="inline-block w-12 border-b border-black">&nbsp;</span>
            </span>
          ))
        : space}
      {blank.after ? <span>{blank.after}</span> : null}
    </p>
  );
}

/** The body of a question to answer on paper: its prompt and the space to answer in. */
function QuestionBody({ q }: { q: Question }) {
  const prompt = <p className={TEXT}>{q.prompt}</p>;
  switch (q.type) {
    case 'mcq':
      return (
        <div className="flex flex-col gap-1.5">
          {prompt}
          <ol data-testid="ws-options" className="grid gap-x-6 gap-y-1 pl-4 sm:grid-cols-2">
            {q.options.map((o) => (
              <li key={o.id} className={TEXT}>
                ({o.id}) {o.text}
              </li>
            ))}
          </ol>
        </div>
      );
    case 'true_false':
      return (
        <div className="flex flex-col gap-1.5">
          {prompt}
          <p className="flex items-center gap-2 text-[13px] font-bold">
            True or false?
            <span data-testid="ws-tf-box" className="inline-block h-7 w-24 border border-black" />
          </p>
        </div>
      );
    case 'numeric':
      return (
        <div className="flex flex-col gap-1.5">
          {prompt}
          <p className="text-[12px] font-bold">Working:</p>
          <WritingLines count={q.difficulty === 'easy' ? 3 : 5} />
          <AnswerLine q={q} />
        </div>
      );
    case 'journal_entry':
      return (
        <div className="flex flex-col gap-1.5">
          {prompt}
          <JournalTable rows={journalRows(q.expected.length)} testId="ws-journal" />
        </div>
      );
    case 'journal_set':
      return (
        <div className="flex flex-col gap-1.5">
          {prompt}
          {/* The dates (or labels) in a column as wide as the widest of them, the transactions beside them. */}
          <ol data-testid="ws-set-items" className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 pl-1">
            {q.entries.map((e, i) => (
              <li key={i} className="col-span-2 grid grid-cols-subgrid">
                <span className="font-bold whitespace-nowrap">{setEntryHeading(e)}</span>
                <span className={TEXT}>{e.text}</span>
              </li>
            ))}
          </ol>
          <JournalTable rows={setRows(q)} testId="ws-set-journal" />
        </div>
      );
    case 'account':
    case 'statement': {
      const data = ownData(q);
      return (
        <div className="flex flex-col gap-1.5">
          {prompt}
          {data === null ? null : <DataBox text={data} />}
          {q.type === 'account' ? <LedgerTable q={q} /> : <StatementTable q={q} />}
        </div>
      );
    }
  }
}

/** A question of the sheet, numbered with its marks; a case with its case text once and its parts. */
export function SheetQuestionItem({ item }: { item: SheetItem }) {
  const ids = item.questions.map((q) => q.id).join(' ');
  if (item.kind === 'case') {
    return (
      <section data-testid={`ws-q-${item.number}`} data-kind={item.kind} data-ids={ids} className="ws-item flex flex-col gap-2">
        <ItemHead number={item.number} marks={item.marks}>
          Case study{item.caseTitle ? `: ${item.caseTitle}` : ''}
        </ItemHead>
        <p className="ws-keep text-[13px]">Read the case, then answer every part.</p>
        <div data-testid="ws-case-text" className={`ws-keep ${TEXT} border border-black px-2 py-1.5 text-[13px] tabular-nums`}>
          {item.questions[0].context}
        </div>
        {item.questions.map((q, i) => (
          <div key={q.id} data-testid={`ws-part-${partLabel(item, i)}`} data-type={q.type} className="ws-part flex gap-2 pl-1">
            <span className="shrink-0 font-bold">({String.fromCharCode(97 + i)})</span>
            <div className="min-w-0 flex-1">
              <QuestionBody q={q} />
            </div>
          </div>
        ))}
      </section>
    );
  }
  const q = item.questions[0];
  return (
    <section data-testid={`ws-q-${item.number}`} data-kind={item.kind} data-type={q.type} data-ids={ids} className="ws-item flex flex-col gap-1.5">
      <ItemHead number={item.number} marks={item.marks} />
      <QuestionBody q={q} />
    </section>
  );
}

/** The working of a question, a step to a line. */
function Working({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <ul data-testid="ws-key-working" className="list-disc pl-5 text-[12px] sm:text-[13px]">
      {lines.map((line, i) => (
        <li key={i} className={TEXT}>
          {line}
        </li>
      ))}
    </ul>
  );
}

/** The answer of one question, as the board expects it, then its working. */
function KeyBody({ q }: { q: Question }) {
  switch (q.type) {
    case 'mcq':
    case 'true_false':
    case 'numeric': {
      const answer = q.type === 'mcq' ? choiceAnswer(q) : q.type === 'true_false' ? trueFalseAnswer(q) : figureAnswer(q);
      return (
        <div className="flex flex-col gap-1">
          <p data-testid="ws-key-answer" className="font-bold">
            {answer}
          </p>
          <Working lines={workingOf(q)} />
        </div>
      );
    }
    case 'journal_entry':
      return (
        <div className="flex flex-col gap-1">
          <JournalTable entries={[keyJournalLines(q.expected)]} testId="ws-key-journal" />
          <Working lines={workingOf(q)} />
        </div>
      );
    case 'journal_set':
      return (
        <div className="flex flex-col gap-1">
          <JournalTable entries={q.entries.map((e) => keyJournalLines(e.expected, setEntryHeading(e)))} testId="ws-key-journal" />
          <ul data-testid="ws-key-working" className="list-disc pl-5 text-[12px] sm:text-[13px]">
            {q.entries.map((e, i) => (
              <li key={i} className={TEXT}>
                <span className="font-bold">{setEntryHeading(e)}:</span> {e.explanation.join(' ')}
              </li>
            ))}
          </ul>
        </div>
      );
    case 'account':
      return (
        <div className="flex flex-col gap-1">
          <LedgerTable q={q} filled />
          <Working lines={workingOf(q)} />
        </div>
      );
    case 'statement':
      return (
        <div className="flex flex-col gap-1">
          <StatementTable q={q} filled />
          <Working lines={workingOf(q)} />
        </div>
      );
  }
}

/** The answer of a question of the sheet; of a case, the answer of every part. */
export function KeyItem({ item }: { item: SheetItem }) {
  return (
    <section data-testid={`ws-key-${item.number}`} data-ids={item.questions.map((q) => q.id).join(' ')} className="ws-item flex flex-col gap-1.5">
      <ItemHead number={item.number} marks={item.marks}>
        {item.kind === 'case' ? `Case study${item.caseTitle ? `: ${item.caseTitle}` : ''}` : null}
      </ItemHead>
      {item.kind === 'case' ? (
        item.questions.map((q, i) => (
          <div key={q.id} data-testid={`ws-key-part-${partLabel(item, i)}`} className="ws-part flex gap-2 pl-1">
            <span className="shrink-0 font-bold">({String.fromCharCode(97 + i)})</span>
            <div className="min-w-0 flex-1">
              <KeyBody q={q} />
            </div>
          </div>
        ))
      ) : (
        <KeyBody q={item.questions[0]} />
      )}
    </section>
  );
}
