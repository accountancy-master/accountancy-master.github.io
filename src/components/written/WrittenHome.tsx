'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useCourse } from '@/app-state/useCourse';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Pills } from '@/components/ui/Pills';
import { ProgressGate } from '@/components/ui/ProgressGate';
import { topicTitle } from '@/content/outline';
import type { WrittenForm } from '@/content/written';
import { ANY_WRITTEN, FORM_LABEL, WRITTEN_FORMS, WRITTEN_REWRITE, filterWritten, writtenCounts, writtenHref, type WrittenFilter } from '@/content/written/practice';
import { useWrittenBank } from './useWrittenBank';

// Written answers: every topic of the learner's course with its board-style written questions, narrowed by form and
// marks, how many are still to rewrite, and a practice of each topic (or of every question to rewrite).

export function WrittenHome() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-extrabold tracking-tight">Written answers</h1>
      <p className="text-base">
        Board questions that want an answer in words: distinguish, features, reasons, explain. Write your answer, then check it against the model answer and tick the points you
        wrote. The marks follow the points, as an examiner gives them.
      </p>
      <ProgressGate id="written" loading="Loading your answers…">
        {() => <Bank />}
      </ProgressGate>
    </div>
  );
}

function Bank() {
  const { questions, failed, retry, latest } = useWrittenBank();
  const { packs } = useCourse();
  const [filter, setFilter] = useState<WrittenFilter>(ANY_WRITTEN);
  const shown = useMemo(() => (questions ? filterWritten(questions, filter) : []), [questions, filter]);

  if (failed) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-card border-2 border-danger bg-surface p-5">
        <p className="text-base font-bold">The questions could not be loaded.</p>
        <Button variant="secondary" data-testid="written-retry" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }
  if (!questions) {
    return (
      <p role="status" aria-busy="true" data-testid="written-bank-loading" className="text-base text-muted">
        Loading the questions…
      </p>
    );
  }
  if (questions.length === 0) {
    return (
      <p data-testid="written-none" className="rounded-card border border-dashed border-edge-deep bg-sunken px-5 py-6 text-center font-bold text-muted">
        Your course has no written questions yet.
      </p>
    );
  }

  const forms = WRITTEN_FORMS.filter((f) => questions.some((q) => q.form === f));
  const marks = [...new Set(questions.map((q) => q.marks))].sort((a, b) => a - b);
  const counts = writtenCounts(shown, latest);
  const topics = packs
    .map((p) => p.topicId)
    .map((topicId) => {
      const own = shown.filter((q) => q.topicId === topicId);
      return { topicId, total: own.length, counts: writtenCounts(own, latest) };
    })
    .filter((t) => t.total > 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Pills
          label="Show questions of the form"
          testIdPrefix="written-form-filter"
          value={filter.form || 'all'}
          onChange={(v) => setFilter({ ...filter, form: v === 'all' ? '' : (v as WrittenForm) })}
          options={[{ value: 'all', label: 'Every form' }, ...forms.map((f) => ({ value: f, label: FORM_LABEL[f], count: filterWritten(questions, { ...filter, form: f }).length }))]}
        />
        <Pills
          label="Show questions of the marks"
          testIdPrefix="written-marks-filter"
          value={filter.marks ? String(filter.marks) : 'all'}
          onChange={(v) => setFilter({ ...filter, marks: v === 'all' ? 0 : Number(v) })}
          options={[{ value: 'all', label: 'Any marks' }, ...marks.map((m) => ({ value: String(m), label: `${m} ${m === 1 ? 'mark' : 'marks'}`, count: filterWritten(questions, { ...filter, marks: m }).length }))]}
        />
      </div>

      <Card className="flex flex-col gap-3">
        <p role="status" data-testid="written-showing" className="text-sm font-bold text-muted">
          {shown.length} of {questions.length} questions
        </p>
        <ul className="flex flex-wrap gap-2">
          <li>
            <Chip tone="accent" data-testid="written-count-rewrite">
              To rewrite: {counts.rewrite}
            </Chip>
          </li>
          <li>
            <Chip tone="neutral" data-testid="written-count-new">
              Not written yet: {counts.new}
            </Chip>
          </li>
          <li>
            <Chip tone="primary" data-testid="written-count-full">
              Full marks: {counts.full}
            </Chip>
          </li>
        </ul>
        {counts.rewrite > 0 ? (
          <Link href={writtenHref(WRITTEN_REWRITE, filter)} data-testid="written-rewrite-all" className={buttonClasses('primary', 'md', 'self-start')}>
            Start rewriting ({counts.rewrite})
          </Link>
        ) : null}
      </Card>

      {topics.length === 0 ? (
        <p data-testid="written-no-match" className="rounded-card border border-dashed border-edge-deep bg-sunken px-5 py-6 text-center font-bold text-muted">
          No question matches. Choose another form or marks.
        </p>
      ) : (
        <ul data-testid="written-topics" className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {topics.map((t) => (
            <li key={t.topicId} data-testid={`written-topic-${t.topicId}`} className="flex min-w-0 flex-col gap-3 rounded-card border border-edge bg-surface p-4 shadow-card sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <h2 className="text-base font-extrabold">{topicTitle(t.topicId)}</h2>
                <p className="text-sm font-bold text-muted">
                  {t.total} {t.total === 1 ? 'question' : 'questions'}
                  {t.counts.full > 0 ? ` · ${t.counts.full} at full marks` : ''}
                  {t.counts.rewrite > 0 ? ` · ${t.counts.rewrite} to rewrite` : ''}
                </p>
              </div>
              <Link
                href={writtenHref(t.topicId, filter)}
                data-testid={`written-start-${t.topicId}`}
                aria-label={`Practise the written answers of ${topicTitle(t.topicId)}`}
                className={buttonClasses(t.counts.new + t.counts.rewrite > 0 ? 'primary' : 'secondary', 'md', 'w-full sm:w-auto sm:shrink-0')}
              >
                Practise
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
