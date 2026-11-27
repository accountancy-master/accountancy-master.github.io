'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useStore } from '@/app-state/StoreProvider';
import { courseName } from '@/components/settings/CoursePicker';
import { Button } from '@/components/ui/Button';
import { CourseUnavailable } from '@/components/ui/CourseUnavailable';
import { GroupLabel } from '@/components/ui/GroupLabel';
import { Pills } from '@/components/ui/Pills';
import { findCourse, topicTitle } from '@/content/outline';
import { loadPractical, type PracticalCourse, type ProjectOption } from '@/content/practical';
import { NO_FILTER, optionAnchor, vivaAnchor, type VivaFilter } from '@/content/practical/viva';
import type { Course } from '@/content/types';
import { VivaBank, VivaPractice } from './Viva';
import { Worked } from './Worked';

type View = 'guides' | 'bank' | 'practice';

/**
 * Project and viva: the project options of the course, each with its guide and a worked outline (printable on its
 * own), and the viva bank, browsed with filters and search or practised one question at a time. The course is the
 * learner's, or the one `?course=` names (an option or a question of the other course found by "Go to"). The content
 * is fetched when the page opens.
 */
export function PracticalView() {
  const { profile } = useStore();
  const asked = useSearchParams().get('course');
  if (!profile) return null;
  const courseId = asked && findCourse(asked) ? asked : profile.courseId;
  const course = findCourse(courseId);
  return course ? <Practical key={course.id} course={course} own={course.id === profile.courseId} profileId={profile.id} /> : <CourseUnavailable />;
}

function Practical({ course, own, profileId }: { course: Course; own: boolean; profileId: string }) {
  const [practical, setPractical] = useState<PracticalCourse | null | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>('guides');
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [printing, setPrinting] = useState<string | null>(null);
  const [filter, setFilter] = useState<VivaFilter>(NO_FILTER);
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    loadPractical(course.id).then(
      (p) => current && setPractical(p ?? null),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [course.id, attempt]);

  // An option or a question named by the address (from "Go to"): its view is shown, the guide opened or the question
  // shown whatever the filters, and it is scrolled to.
  useEffect(() => {
    if (!practical) return;
    const show = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      let id: string | null = null;
      if (hash.startsWith('option-') && practical.options.some((o) => optionAnchor(o.id) === hash)) {
        const option = hash.slice('option-'.length);
        setView('guides');
        setOpen((s) => new Set([...s, option]));
        id = hash;
      } else if (hash.startsWith('viva-') && practical.viva.some((q) => vivaAnchor(q.id) === hash)) {
        setView('bank');
        setFilter(NO_FILTER);
        id = hash;
      }
      if (!id) return;
      setTarget(id);
      const at = id;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const el = document.getElementById(at);
          el?.scrollIntoView({ block: 'start' });
          el?.focus({ preventScroll: true });
        }),
      );
    };
    show();
    window.addEventListener('hashchange', show);
    return () => window.removeEventListener('hashchange', show);
  }, [practical]);

  // "Print this guide": the guide alone, opened in full, then back to the page as it was.
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(null);
    window.addEventListener('afterprint', done);
    const frame = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
    };
  }, [printing]);

  const toggle = (id: string, now: boolean) => setOpen((s) => (now === s.has(id) ? s : now ? new Set([...s, id]) : new Set([...s].filter((x) => x !== id))));
  const hideWhenPrinting = printing ? 'print:hidden' : '';

  return (
    <div data-testid="practical" data-printing={printing ?? undefined} className="flex flex-col gap-6">
      <header className={`flex flex-col gap-4 rounded-panel border border-edge bg-surface p-5 shadow-card lg:p-6 ${hideWhenPrinting}`}>
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-extrabold tracking-tight">Project and viva</h1>
          <p data-testid="practical-summary" className="text-base font-semibold text-muted">
            Part C of {courseName(course)}: 20 marks
            {practical ? ` · ${practical.options.length} ${practical.options.length === 1 ? 'project' : 'projects'} to choose from · ${practical.viva.length} viva questions` : ''}
          </p>
        </div>
        {!own ? (
          <p data-testid="practical-other-course" className="rounded-control bg-accent-soft px-3 py-2 text-sm font-bold text-accent-ink">
            This is the project work of {courseName(course)}, which is not your course.{' '}
            <Link href="/practical" className="underline">
              Your course&apos;s project work
            </Link>
          </p>
        ) : null}
        {practical ? (
          <>
            <p className="text-base">{practical.intro}</p>
            <ul data-testid="practical-marks" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {practical.marks.map((m) => (
                <li key={m.part} className="flex min-w-0 flex-col gap-1 rounded-control bg-sunken px-3 py-2">
                  <span className="flex items-baseline justify-between gap-2 font-extrabold">
                    <span>{m.part}</span>
                    <span className="text-primary-ink">{m.marks} marks</span>
                  </span>
                  <span className="text-sm text-muted">{m.what}</span>
                </li>
              ))}
            </ul>
            <Pills<View>
              label="Show"
              value={view}
              onChange={(v) => {
                setView(v);
                setTarget(null);
              }}
              testIdPrefix="practical-view"
              options={[
                { value: 'guides', label: 'Project guides', count: practical.options.length },
                { value: 'bank', label: 'Viva questions', count: practical.viva.length },
                { value: 'practice', label: 'Practise a viva' },
              ]}
            />
          </>
        ) : null}
      </header>

      {failed && !practical ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-card border-2 border-danger bg-surface p-5">
          <p className="text-base font-bold">We couldn&apos;t load the project work.</p>
          <Button
            variant="secondary"
            data-testid="practical-retry"
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        </div>
      ) : practical === undefined ? (
        <p role="status" aria-busy="true" data-testid="practical-loading" className="text-base text-muted">
          Loading the project work…
        </p>
      ) : practical === null ? (
        <p className="text-base text-muted">This course has no project work yet.</p>
      ) : view === 'guides' ? (
        <section aria-label="Project guides" className="flex flex-col gap-4">
          {practical.options.map((o) => (
            <Guide
              key={o.id}
              option={o}
              course={course}
              open={open.has(o.id) || printing === o.id}
              onToggle={(now) => toggle(o.id, now)}
              printing={printing === o.id}
              hidden={printing !== null && printing !== o.id}
              target={target === optionAnchor(o.id)}
              onPrint={() => {
                setOpen((s) => new Set([...s, o.id]));
                setPrinting(o.id);
              }}
            />
          ))}
        </section>
      ) : view === 'bank' ? (
        <VivaBank practical={practical} course={course} filter={filter} onFilter={setFilter} target={target} profileId={profileId} />
      ) : (
        <VivaPractice practical={practical} course={course} filter={filter} onFilter={setFilter} profileId={profileId} />
      )}
    </div>
  );
}

function Guide({
  option,
  course,
  open,
  onToggle,
  printing,
  hidden,
  target,
  onPrint,
}: {
  option: ProjectOption;
  course: Course;
  open: boolean;
  onToggle(open: boolean): void;
  printing: boolean;
  hidden: boolean;
  target: boolean;
  onPrint(): void;
}) {
  const id = optionAnchor(option.id);
  return (
    <article
      id={id}
      tabIndex={-1}
      data-testid={`guide-${option.id}`}
      data-target={target ? 'true' : undefined}
      aria-labelledby={`${id}-title`}
      className={[
        'flex min-w-0 scroll-mt-24 flex-col gap-3 rounded-card border bg-surface p-4 shadow-card outline-none sm:p-5',
        target ? 'border-accent ring-2 ring-accent' : 'border-edge',
        hidden ? 'print:hidden' : '',
        printing ? 'print-plain' : '',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <GroupLabel>Option {option.number}</GroupLabel>
          <h2 id={`${id}-title`} className="text-xl font-extrabold">
            {option.title}
          </h2>
        </div>
        <Button variant="secondary" data-testid={`guide-print-${option.id}`} onClick={onPrint} className="shrink-0 print:hidden">
          Print this guide
        </Button>
      </div>
      <p className="text-base">{option.summary}</p>
      <p className="text-sm text-muted">{option.when}</p>
      <details
        data-testid={`guide-details-${option.id}`}
        open={open}
        onToggle={(e) => {
          const now = (e.currentTarget as HTMLDetailsElement).open;
          if (now !== open) onToggle(now);
        }}
        className="rounded-control border border-edge"
      >
        <summary data-testid={`guide-open-${option.id}`} className="flex min-h-11 cursor-pointer items-center px-3 font-extrabold text-primary-ink print:hidden">
          {open ? 'Hide the guide' : 'Read the guide and the worked example'}
        </summary>
        <div className="flex min-w-0 flex-col gap-5 border-t border-edge p-3 sm:p-4">
          {option.ideas ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-lg font-extrabold">Businesses to choose from</h3>
              <ul className="flex flex-wrap gap-2">
                {option.ideas.map((i) => (
                  <li key={i} className="min-w-0 max-w-full rounded-2xl border border-edge bg-sunken px-3 py-1 text-sm font-extrabold">
                    {i}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {option.aspects ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-lg font-extrabold">Choose any two of these</h3>
              <ul className="flex flex-col gap-2">
                {option.aspects.map((a) => (
                  <li key={a.title} className="rounded-control bg-sunken px-3 py-2 text-sm">
                    <span className="font-extrabold">{a.title}: </span>
                    {a.what}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section className="flex flex-col gap-2">
            <h3 className="text-lg font-extrabold">What the project file holds, in order</h3>
            <ol data-testid="guide-sections" className="flex list-decimal flex-col gap-1 pl-6 text-sm">
              {option.fileSections.map((s) => (
                <li key={s.title}>
                  <span className="font-bold">{s.title}.</span> {s.what}
                </li>
              ))}
            </ol>
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-lg font-extrabold">A plan, step by step</h3>
            <ol data-testid="guide-plan" className="flex flex-col">
              {option.plan.map((p, i) => (
                <li key={i} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 border-t border-edge py-2 text-sm first:border-t-0">
                  <span className="font-extrabold text-primary-ink">{p.when}</span>
                  <span>{p.task}</span>
                </li>
              ))}
            </ol>
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-lg font-extrabold">Mistakes that lose marks</h3>
            <ul data-testid="guide-mistakes" className="flex list-disc flex-col gap-1 pl-6 text-sm">
              {option.mistakes.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-lg font-extrabold">Topics it draws on</h3>
            <p className="text-sm">{option.topicIds.map((t) => topicTitle(t)).join(' · ')}</p>
          </section>
          <section data-testid={`guide-worked-${option.id}`} className="flex min-w-0 flex-col gap-3">
            <h3 className="text-lg font-extrabold">Worked example</h3>
            <p className="text-sm text-muted">Made-up figures, realistic and checked: every total agrees. Use it to see the shape of the work; your own business and figures must be your own.</p>
            {open ? <Worked worked={option.worked} printing={printing} /> : null}
          </section>
        </div>
      </details>
      <p className="hidden text-xs print:block">
        {courseName(course)} · Project and viva · Option {option.number}: {option.title}
      </p>
    </article>
  );
}

