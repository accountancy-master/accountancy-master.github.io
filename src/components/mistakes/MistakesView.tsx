'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useProgress } from '@/app-state/useProgress';
import { buttonClasses } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FoldedCase } from '@/components/ui/CasePanel';
import { ProgressGate } from '@/components/ui/ProgressGate';
import { Prompt } from '@/components/ui/Prompt';
import { TopicsGate } from '@/components/ui/TopicsGate';
import { WrittenToRewrite } from '@/components/written/WrittenToRewrite';
import { findConceptTitle, topicsOfQuestions } from '@/content/outline';
import type { Question } from '@/content/types';
import { exerciseFor } from '@/exercises/registry';
import { CONFIG } from '@/learning/config';
import { correctedCount, openMistakeIds, openMistakes } from '@/learning/practice';
import type { Progress } from '@/learning/progress';
import { describeMistake } from '@/play/mistakeText';
import type { AttemptEvent } from '@/storage/types';

/** What the concept of a mistake is called; nothing for a concept that is no longer there. */
const conceptTitle = (conceptId: string) => findConceptTitle(conceptId) ?? '';

/** The latest wrong (or revealed) attempt of every question: the one the mistake in words comes from. */
function latestMisses(attempts: readonly AttemptEvent[]): Map<string, AttemptEvent> {
  const out = new Map<string, AttemptEvent>();
  for (const a of attempts) {
    if (a.correct) continue;
    const prev = out.get(a.questionId);
    if (!prev || a.at > prev.at || (a.at === prev.at && a.id > prev.id)) out.set(a.questionId, a);
  }
  return out;
}

const LOADING = 'Loading your mistakes…';

/** Mistakes: what is still waiting to be put right, in words, and how many already have been. */
export function MistakesView() {
  return (
    <ProgressGate id="mistakes" loading={LOADING}>
      {({ progress }) => (
        // A mistake is shown with its question, which is made from the content of its topic.
        <TopicsGate topicIds={topicsOfQuestions(openMistakeIds(progress))} loading={LOADING}>
          {() => <Mistakes progress={progress} />}
        </TopicsGate>
      )}
    </ProgressGate>
  );
}

function Mistakes({ progress }: { progress: Progress }) {
  const { attempts } = useProgress();
  // Newest first; the question must still resolve to be listed.
  const open = useMemo(() => openMistakes(progress).reverse(), [progress]);
  const misses = useMemo(() => latestMisses(attempts), [attempts]);
  const corrected = correctedCount(progress);
  const max = CONFIG.practice.mistakesMax;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-extrabold tracking-tight">Mistakes</h1>

      <Card className="flex flex-col gap-3">
        <p data-testid="mistakes-note" className="text-base">
          A mistake is cleared by answering it correctly in a later session.
        </p>
        <p data-testid="mistakes-corrected" className="text-base font-extrabold text-primary-ink">
          Corrected so far: {corrected}
        </p>
        {open.length > 0 ? (
          <>
            <Link href="/practice/mistakes" data-testid="mistakes-review" className={buttonClasses('primary', 'lg', 'w-full')}>
              Review all
            </Link>
            {open.length > max ? <p className="text-sm font-bold text-muted">Each review takes up to {max} at a time.</p> : null}
          </>
        ) : null}
      </Card>

      {open.length === 0 ? (
        <p
          data-testid="mistakes-empty"
          className="rounded-card border-2 border-dashed border-edge-deep bg-canvas p-5 text-base font-bold text-muted"
        >
          No mistakes waiting. Nicely done.
        </p>
      ) : (
        <ul data-testid="mistakes-list" className="flex flex-col gap-3">
          {open.map(({ questionId, question }) => (
            <li key={questionId} data-testid="mistake-item" data-question-id={questionId}>
              <MistakeCard
                question={question}
                tries={progress.questions[questionId]?.attempts ?? 0}
                miss={misses.get(questionId) ?? { mistakeCode: progress.questions[questionId]?.mistakeCode, hintsUsed: 0 }}
              />
            </li>
          ))}
        </ul>
      )}

      <WrittenToRewrite />
    </div>
  );
}

/**
 * One open mistake: the question (a list in its prompt keeps its lines; a question of a case study has its case above
 * it, folded), what went wrong, and the right answer on demand. A set of entries, an account or a statement shows the
 * student's own answer there too, marked, when the attempt kept it.
 */
export function MistakeCard({
  question,
  tries,
  miss,
}: {
  question: Question;
  tries: number;
  miss: Pick<AttemptEvent, 'mistakeCode' | 'hintsUsed' | 'answer'>;
}) {
  const { Review } = exerciseFor(question);
  return (
    <Card className="flex flex-col gap-2">
      <p data-testid="mistake-concept" className="text-sm font-bold text-muted">
        {conceptTitle(question.conceptId)}
      </p>
      {question.context ? <FoldedCase text={question.context} /> : null}
      <div data-testid="mistake-prompt">
        <Prompt text={question.prompt} size="md" />
      </div>
      <p data-testid="mistake-what" className="text-base font-bold text-danger-deep">
        {describeMistake(miss, question)}
      </p>
      <p data-testid="mistake-attempts" className="text-sm font-bold text-muted">
        Attempted {tries} {tries === 1 ? 'time' : 'times'}
      </p>
      {Review ? (
        <details className="group rounded-control border-2 border-edge">
          <summary
            data-testid="mistake-show-entry"
            className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 font-bold text-primary-ink [&::-webkit-details-marker]:hidden"
          >
            <span>{Review.label}</span>
            <span aria-hidden="true" className="transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="border-t-2 border-edge p-3">
            <Review.Body question={question} mistakeCode={miss.mistakeCode} answer={miss.answer} />
          </div>
        </details>
      ) : null}
    </Card>
  );
}
