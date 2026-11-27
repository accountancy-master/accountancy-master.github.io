'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useProgress } from '@/app-state/useProgress';
import { buttonClasses } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ANY_WRITTEN, WRITTEN_REWRITE, isFullMarks, latestOutcomes, writtenHref } from '@/content/written/practice';
import { Marks, TopicTag } from './WrittenParts';
import { useWrittenBank } from './useWrittenBank';

/**
 * The Mistakes screen's list of written answers to rewrite: each question written below full marks the last time,
 * newest first, with a way back to rewrite it, or all of them. Nothing at all when there are none (and then the
 * questions are not even fetched).
 */
export function WrittenToRewrite() {
  const { writtenResults } = useProgress();
  const open = useMemo(
    () => [...latestOutcomes(writtenResults).values()].filter((r) => !isFullMarks(r)).sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1)),
    [writtenResults],
  );
  const { questions } = useWrittenBank(open.length > 0);
  const byId = useMemo(() => new Map((questions ?? []).map((q) => [q.id, q])), [questions]);
  if (open.length === 0) return null;
  // A question no longer in the bank is not listed.
  const listed = questions ? open.filter((r) => byId.has(r.questionId)) : [];

  return (
    <section aria-labelledby="written-rewrite-heading" data-testid="mistakes-written" className="flex flex-col gap-3">
      <h2 id="written-rewrite-heading" className="text-xl font-extrabold">
        Written answers to rewrite
      </h2>
      <Card className="flex flex-col gap-3">
        <p className="text-base">Written below full marks the last time. Write one again at full marks to clear it.</p>
        <Link href={writtenHref(WRITTEN_REWRITE)} data-testid="mistakes-written-all" className={buttonClasses('primary', 'md', 'self-start')}>
          Start rewriting ({open.length})
        </Link>
      </Card>
      {questions === null ? (
        <p role="status" aria-busy="true" className="text-base text-muted">
          Loading the questions…
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {listed.map((r) => {
            const q = byId.get(r.questionId)!;
            return (
              <li key={r.questionId} data-testid="mistakes-written-item" data-question-id={r.questionId}>
                <Card className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <TopicTag topicId={q.topicId} />
                  </div>
                  <p className="text-base font-bold">{q.prompt}</p>
                  <p className="text-sm font-bold text-muted">
                    Last time: <Marks marks={r.marks} maxMarks={r.maxMarks} />
                  </p>
                  <Link
                    href={writtenHref(q.topicId, ANY_WRITTEN, { q: q.id })}
                    data-testid="mistakes-written-rewrite"
                    aria-label={`Rewrite it: ${q.prompt}`}
                    className="inline-flex min-h-11 items-center self-start font-bold text-primary-ink underline"
                  >
                    Rewrite it
                  </Link>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
