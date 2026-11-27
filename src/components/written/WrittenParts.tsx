'use client';

import { Chip } from '@/components/ui/Chip';
import { topicTitle } from '@/content/outline';
import type { WrittenQuestion } from '@/content/written';
import { FORM_LABEL, marksOutOf, marksSpoken, pointsAsked } from '@/content/written/practice';

// Pieces shared by the written answers screens: what a question asks for, its model answer, and marks as written.

/** The topic of a question: a tag that wraps on a narrow screen. */
export function TopicTag({ topicId }: { topicId: string }) {
  return <span className="min-w-0 max-w-full rounded-2xl bg-primary-soft px-3 py-1 text-sm font-extrabold text-primary-ink">{topicTitle(topicId)}</span>;
}

/** The form, the marks and how many points the board asks for: "Distinguish · 3 marks · Any three points". */
export function QuestionFacts({ q, topic = false }: { q: WrittenQuestion; topic?: boolean }) {
  return (
    <div data-testid="written-facts" className="flex flex-wrap items-center gap-2">
      {topic ? <TopicTag topicId={q.topicId} /> : null}
      <Chip tone="neutral" data-testid="written-form">
        {FORM_LABEL[q.form]}
      </Chip>
      <Chip tone="accent" data-testid="written-marks">
        {q.marks} {q.marks === 1 ? 'mark' : 'marks'}
      </Chip>
      <Chip tone="outline" data-testid="written-any">
        {pointsAsked(q)}
      </Chip>
    </div>
  );
}

/** Marks as written, "2½ / 3", read out in words. */
export function Marks({ marks, maxMarks, className, testId }: { marks: number; maxMarks: number; className?: string; testId?: string }) {
  return (
    <span data-testid={testId} className={className}>
      <span aria-hidden="true">{marksOutOf(marks, maxMarks)}</span>
      <span className="sr-only">{marksSpoken(marks, maxMarks)}</span>
    </span>
  );
}

/**
 * The model answer as the marking scheme lays it out: a table for a "distinguish" question (a basis and both sides on
 * each row, narrow enough for a phone), the numbered answer for any other.
 */
export function ModelAnswer({ q }: { q: WrittenQuestion }) {
  if (q.table) {
    const [basis, first, second] = q.table.headers;
    return (
      // Columns sized by their words (the basis is short); a long word breaks with a hyphen rather than widening the page.
      <div className="max-w-full overflow-x-auto">
        <table data-testid="written-table" lang="en" className="w-full border-collapse text-sm break-words hyphens-auto">
          <caption className="sr-only">Model answer: {first} and {second} compared</caption>
          <thead>
            <tr>
              {[basis, first, second].map((h) => (
                <th key={h} scope="col" className="border border-edge-deep bg-sunken px-2 py-2 text-left align-bottom font-extrabold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {q.table.rows.map((row, i) => (
              <tr key={i}>
                <th scope="row" className="border border-edge-deep px-2 py-2 text-left align-top font-bold">
                  {row[0]}
                </th>
                <td className="border border-edge-deep px-2 py-2 align-top">{row[1]}</td>
                <td className="border border-edge-deep px-2 py-2 align-top">{row[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <p data-testid="written-answer" className="whitespace-pre-line text-base">
      {q.answer}
    </p>
  );
}
