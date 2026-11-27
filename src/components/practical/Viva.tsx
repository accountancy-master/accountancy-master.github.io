'use client';

import { useMemo, useState } from 'react';
import { useVivaMarks } from '@/app-state/vivaMarks';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { SearchField } from '@/components/ui/SearchField';
import { topicTitle } from '@/content/outline';
import type { PracticalCourse, VivaQuestion } from '@/content/practical';
import { PROJECT_TOPIC } from '@/content/practical/types';
import { NO_FILTER, filterViva, vivaAnchor, vivaCounts, vivaQueue, type VivaFilter, type VivaMark } from '@/content/practical/viva';
import type { Course, Difficulty } from '@/content/types';

// The viva bank of the "Project and viva" page: every question with its model answer, narrowed by topic, project
// option, difficulty and search; and the practice, one question at a time, marked "I knew it" or "Not yet" (kept on the
// device, per learner; "Not yet" comes back first). Nothing here is scored.

const SELECT = 'min-h-11 w-full min-w-0 rounded-control border border-edge-deep bg-surface px-3 text-base font-semibold sm:w-auto sm:max-w-72';
const DIFFICULTY: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', complex: 'Hard' };

const topicName = (id: string) => (id === PROJECT_TOPIC ? 'The project itself' : topicTitle(id));

function Filters({ practical, course, filter, onFilter }: { practical: PracticalCourse; course: Course; filter: VivaFilter; onFilter(f: VivaFilter): void }) {
  // The topics that have questions, the project first and then in the order of the course.
  const topics = useMemo(() => {
    const present = new Set(practical.viva.map((q) => q.topicId));
    return [...(present.has(PROJECT_TOPIC) ? [PROJECT_TOPIC] : []), ...course.topics.map((t) => t.id).filter((t) => present.has(t))];
  }, [practical.viva, course.topics]);
  const set = (over: Partial<VivaFilter>) => onFilter({ ...filter, ...over });
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
      <SearchField value={filter.query} onChange={(query) => set({ query })} label="Search the viva questions" testId="viva-search" className="lg:w-80" />
      <label className="flex min-w-0 flex-col gap-1 text-sm font-bold sm:flex-row sm:items-center sm:gap-2">
        Topic
        <select value={filter.topicId} data-testid="viva-topic" onChange={(e) => set({ topicId: e.target.value })} className={SELECT}>
          <option value="">All topics</option>
          {topics.map((t) => (
            <option key={t} value={t}>
              {topicName(t)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-sm font-bold sm:flex-row sm:items-center sm:gap-2">
        Project
        <select value={filter.optionId} data-testid="viva-option" onChange={(e) => set({ optionId: e.target.value })} className={SELECT}>
          <option value="">Any project</option>
          {practical.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.short}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-sm font-bold sm:flex-row sm:items-center sm:gap-2">
        Difficulty
        <select value={filter.difficulty} data-testid="viva-difficulty" onChange={(e) => set({ difficulty: e.target.value as VivaFilter['difficulty'] })} className={SELECT}>
          <option value="">Any difficulty</option>
          {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
            <option key={d} value={d}>
              {DIFFICULTY[d]}
            </option>
          ))}
        </select>
      </label>
      {filter !== NO_FILTER && (filter.query || filter.topicId || filter.optionId || filter.difficulty) ? (
        <button type="button" data-testid="viva-clear" onClick={() => onFilter(NO_FILTER)} className="min-h-11 self-start text-sm font-bold text-primary-ink underline lg:self-center">
          Clear the filters
        </button>
      ) : null}
    </div>
  );
}

/** The topic of a question: a tag that wraps on a narrow screen (a long topic name would not fit in a chip). */
function TopicTag({ topicId }: { topicId: string }) {
  return <span className="min-w-0 max-w-full rounded-2xl bg-primary-soft px-3 py-1 text-sm font-extrabold text-primary-ink">{topicName(topicId)}</span>;
}

const MARK_TEXT: Record<VivaMark['mark'], string> = { knew: 'I knew it', notyet: 'Not yet' };

export function VivaBank({ practical, course, filter, onFilter, target, profileId }: { practical: PracticalCourse; course: Course; filter: VivaFilter; onFilter(f: VivaFilter): void; target: string | null; profileId: string }) {
  const shown = useMemo(() => filterViva(practical.viva, filter), [practical.viva, filter]);
  const { marks } = useVivaMarks(profileId, course.id);
  const optionShort = useMemo(() => new Map(practical.options.map((o) => [o.id, o.short])), [practical.options]);
  return (
    <section aria-labelledby="viva-heading" className="flex flex-col gap-4">
      <h2 id="viva-heading" className="sr-only">
        Viva questions
      </h2>
      <Filters practical={practical} course={course} filter={filter} onFilter={onFilter} />
      <p role="status" data-testid="viva-showing" className="text-sm font-bold text-muted">
        Showing {shown.length} of {practical.viva.length} questions
      </p>
      <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {shown.map((q) => (
          <li key={q.id} className="min-w-0">
            <Question q={q} target={target === vivaAnchor(q.id)} mark={Object.hasOwn(marks, q.id) ? marks[q.id] : undefined} optionShort={optionShort} />
          </li>
        ))}
      </ul>
      {shown.length === 0 ? (
        <p data-testid="viva-none" className="rounded-card border border-dashed border-edge-deep bg-sunken px-5 py-6 text-center font-bold text-muted">
          No question matches. Try another word, or clear the filters.
        </p>
      ) : null}
    </section>
  );
}

function Question({ q, target, mark, optionShort }: { q: VivaQuestion; target: boolean; mark: VivaMark | undefined; optionShort: ReadonlyMap<string, string> }) {
  const [open, setOpen] = useState(target);
  const shown = open || target;
  return (
    <article
      id={vivaAnchor(q.id)}
      tabIndex={-1}
      data-testid={`viva-${q.id}`}
      data-target={target ? 'true' : undefined}
      className={['flex h-full scroll-mt-24 flex-col gap-2 rounded-card border bg-surface p-4 shadow-card outline-none', target ? 'border-accent ring-2 ring-accent' : 'border-edge'].join(' ')}
    >
      <h3 className="text-base font-extrabold">{q.question}</h3>
      <div className="flex flex-wrap items-center gap-2">
        <TopicTag topicId={q.topicId} />
        <Chip tone="neutral">{DIFFICULTY[q.difficulty]}</Chip>
        <span className="text-xs font-bold text-muted">{q.options.map((o) => optionShort.get(o) ?? o).join(', ')}</span>
        {mark ? (
          <Chip tone={mark.mark === 'knew' ? 'primary' : 'accent'} data-testid="viva-mark">
            {MARK_TEXT[mark.mark]}
          </Chip>
        ) : null}
      </div>
      <button type="button" aria-expanded={shown} data-testid="viva-answer-toggle" onClick={() => setOpen(!shown)} className="min-h-11 self-start text-sm font-bold text-primary-ink underline">
        {shown ? 'Hide the model answer' : 'Show the model answer'}
      </button>
      {shown ? (
        <p data-testid="viva-answer" className="rounded-control bg-sunken px-3 py-2 text-base">
          {q.answer}
        </p>
      ) : null}
    </article>
  );
}

export function VivaPractice({ practical, course, filter, onFilter, profileId }: { practical: PracticalCourse; course: Course; filter: VivaFilter; onFilter(f: VivaFilter): void; profileId: string }) {
  const { marks, mark } = useVivaMarks(profileId, course.id);
  const pool = useMemo(() => filterViva(practical.viva, filter), [practical.viva, filter]);
  const counts = vivaCounts(pool, marks);
  // The questions of a practice, fixed when it starts (marking one must not reorder the rest), and where it is.
  const [run, setRun] = useState<{ ids: string[]; at: number; revealed: boolean; knew: number; notyet: number } | null>(null);
  const byId = useMemo(() => new Map(practical.viva.map((q) => [q.id, q])), [practical.viva]);

  const start = () => setRun({ ids: vivaQueue(pool, marks).map((q) => q.id), at: 0, revealed: false, knew: 0, notyet: 0 });

  if (!run) {
    return (
      <section aria-labelledby="practice-heading" className="flex flex-col gap-4">
        <h2 id="practice-heading" className="text-lg font-extrabold">
          Practise a viva
        </h2>
        <p className="text-base">
          One question at a time, as the examiner would ask it. Say your answer aloud or in your head, then see the model answer and mark yourself honestly. The ones marked &ldquo;Not yet&rdquo; come
          back first next time. Nothing is scored: your marks stay on this device.
        </p>
        <Filters practical={practical} course={course} filter={filter} onFilter={onFilter} />
        <Card className="flex flex-col gap-3">
          <ul className="flex flex-wrap gap-2">
            <li>
              <Chip tone="accent" data-testid="viva-count-notyet">
                Not yet: {counts.notyet}
              </Chip>
            </li>
            <li>
              <Chip tone="neutral" data-testid="viva-count-unseen">
                Not tried: {counts.unseen}
              </Chip>
            </li>
            <li>
              <Chip tone="primary" data-testid="viva-count-knew">
                I knew it: {counts.knew}
              </Chip>
            </li>
          </ul>
          <Button data-testid="viva-start" onClick={start} disabled={pool.length === 0} className="self-start">
            {pool.length === 0 ? 'No questions match' : `Start: ${pool.length} ${pool.length === 1 ? 'question' : 'questions'}`}
          </Button>
        </Card>
      </section>
    );
  }

  const q = byId.get(run.ids[run.at]);
  if (!q) {
    return (
      <Card data-testid="viva-done" className="flex flex-col gap-3">
        <h2 className="text-lg font-extrabold">Practice done</h2>
        <p className="text-base">
          You knew {run.knew} and marked {run.notyet} &ldquo;Not yet&rdquo;. {run.notyet > 0 ? 'Those come first when you practise again.' : 'Well done.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button data-testid="viva-again" onClick={start}>
            Practise again
          </Button>
          <Button variant="secondary" onClick={() => setRun(null)}>
            Back
          </Button>
        </div>
      </Card>
    );
  }

  const markAndNext = (m: VivaMark['mark']) => {
    mark(q.id, m);
    setRun({ ...run, at: run.at + 1, revealed: false, knew: run.knew + (m === 'knew' ? 1 : 0), notyet: run.notyet + (m === 'notyet' ? 1 : 0) });
  };
  const before = Object.hasOwn(marks, q.id) ? marks[q.id] : undefined;

  return (
    <Card data-testid="viva-practice" data-question={q.id} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p data-testid="viva-progress" className="text-sm font-bold text-muted">
          Question {run.at + 1} of {run.ids.length}
        </p>
        <Button variant="ghost" data-testid="viva-stop" onClick={() => setRun(null)} className="px-3 text-sm">
          Stop
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <TopicTag topicId={q.topicId} />
        <Chip tone="neutral">{DIFFICULTY[q.difficulty]}</Chip>
        {before ? <Chip tone={before.mark === 'knew' ? 'primary' : 'accent'}>Last time: {MARK_TEXT[before.mark]}</Chip> : null}
      </div>
      <p data-testid="viva-question" className="text-xl font-extrabold">
        {q.question}
      </p>
      {!run.revealed ? (
        <>
          <p className="text-sm text-muted">Think of your answer first: one to three clear sentences.</p>
          <Button data-testid="viva-reveal" onClick={() => setRun({ ...run, revealed: true })} className="self-start">
            Show the model answer
          </Button>
        </>
      ) : (
        <>
          <p data-testid="viva-model" className="rounded-control bg-sunken px-3 py-2 text-base">
            {q.answer}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button data-testid="viva-knew" onClick={() => markAndNext('knew')}>
              I knew it
            </Button>
            <Button variant="secondary" data-testid="viva-notyet" onClick={() => markAndNext('notyet')}>
              Not yet
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
