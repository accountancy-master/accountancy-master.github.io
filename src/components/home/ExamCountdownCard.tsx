'use client';

import Link from 'next/link';
import { courseName } from '@/components/settings/CoursePicker';
import { buttonClasses } from '@/components/ui/Button';
import { GroupLabel } from '@/components/ui/GroupLabel';
import { CalendarIcon } from '@/components/ui/icons';
import type { Course } from '@/content/types';
import { countdownText, daysToExam, examStage, formatDay, stageAdvice, suggestedExamDate } from '@/learning/examCountdown';

/**
 * The countdown to the learner's exam in their course: the days left, the date, and what to do with the time, which
 * changes as the date comes closer (more than 90 days, 30 to 90, 7 to 30, under 7). Close to the exam it lists the
 * weakest topics too. Without a date, a link to set one (and the date usually set, where there is one).
 */
export function ExamCountdownCard({
  course,
  examDay,
  today,
  weakTopics,
}: {
  course: Course;
  examDay: string | null;
  today: string;
  /** The learner's weakest topics, weakest first: shown in the last weeks. */
  weakTopics: readonly { id: string; title: string }[];
}) {
  const name = courseName(course);
  if (!examDay) {
    const suggestion = suggestedExamDate(course.id, today);
    return (
      <section id="exam-countdown" aria-labelledby="exam-heading" data-testid="exam-countdown" data-state="unset" className="flex flex-col gap-3 rounded-card border border-dashed border-edge-deep bg-surface p-5 sm:flex-row sm:items-center sm:gap-5">
        <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control bg-hue-blue-soft text-hue-blue">
          <CalendarIcon />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id="exam-heading" className="text-lg font-extrabold">
            When is your {name} exam?
          </h2>
          <p className="text-sm text-muted">
            Set the date and Home counts down to it, and suggests what to do as it comes closer.
            {suggestion ? ` It is usually around ${formatDay(suggestion.date)}.` : ''}{' '}
            <Link href="/exam" data-testid="exam-pack-link" className="font-bold text-primary-ink underline">
              Before the exam
            </Link>{' '}
            has the paper, tips and your weak spots.
          </p>
        </div>
        <Link href="/settings#exam-dates" data-testid="exam-set" className={buttonClasses('secondary', 'md', 'shrink-0')}>
          Set your exam date
        </Link>
      </section>
    );
  }

  const days = daysToExam(today, examDay);
  const stage = examStage(days);
  const advice = stageAdvice(stage);
  const close = stage === 'weeks' || stage === 'final';
  return (
    <section id="exam-countdown" aria-labelledby="exam-heading" data-testid="exam-countdown" data-state={stage} className="grid gap-4 rounded-card border border-edge border-t-[3px] border-t-hue-blue bg-surface p-5 shadow-card md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:gap-6">
      <div className="flex items-baseline gap-2 md:flex-col md:items-center md:gap-0">
        <span data-testid="exam-days" className="text-5xl font-extrabold tabular-nums leading-none text-hue-blue">
          {Math.max(0, days)}
        </span>
        <span className="text-sm font-extrabold uppercase tracking-wide text-muted">{days === 1 ? 'day' : 'days'}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <GroupLabel>Exam countdown</GroupLabel>
        <h2 id="exam-heading" data-testid="exam-text" className="text-xl font-extrabold">
          {countdownText(days, name)}
        </h2>
        <p data-testid="exam-date" className="text-sm font-bold text-muted">
          {formatDay(examDay)} ·{' '}
          <Link href="/settings#exam-dates" className="text-primary-ink underline">
            Change
          </Link>
        </p>
        <p data-testid="exam-suggestion" className="text-base">
          {advice.suggestion}
        </p>
        {close && weakTopics.length > 0 ? (
          <p data-testid="exam-weak" className="text-sm">
            <span className="font-bold">Your weakest topics: </span>
            {weakTopics.slice(0, 3).map((t, i) => (
              <span key={t.id}>
                {i > 0 ? ', ' : ''}
                <Link href={`/topics/${t.id}`} className="font-bold text-primary-ink underline">
                  {t.title}
                </Link>
              </span>
            ))}
            .
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row md:flex-col md:self-center">
        <Link href={advice.action.href} data-testid="exam-action" className={buttonClasses('primary', 'md')}>
          {advice.action.label}
        </Link>
        <Link href="/exam" data-testid="exam-pack-link" className={buttonClasses('secondary', 'md')}>
          Before the exam
        </Link>
      </div>
    </section>
  );
}
