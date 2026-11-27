'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useCourse } from '@/app-state/useCourse';
import { Button } from '@/components/ui/Button';
import { GROUP_LABEL } from '@/components/ui/GroupLabel';
import { Pills } from '@/components/ui/Pills';
import { partBOf, type CourseChoice } from '@/content/courseOptions';
import { findCourse } from '@/content/outline';
import { bankOf, paperAvailable } from '@/learning/mockPaper';
import {
  CODE_EXAMPLE,
  SHEET_COUNTS,
  SHEET_DIFFICULTIES,
  SHEET_KINDS,
  SHEET_KIND_LABEL,
  SHEET_KIND_NOTE,
  SHEET_PAPERS,
  drawSeed,
  hasWorksheets,
  kindCounts,
  parseWorksheetCode,
  sheetHref,
  worksheetCode,
  type SheetCount,
  type SheetDifficulty,
  type SheetKind,
  type SheetPaper,
  type SheetSpec,
} from '@/learning/worksheet';

type Mode = SheetSpec['mode'];

const DIFFICULTY_NAME: Record<SheetDifficulty, string> = { mixed: 'Mixed', easy: 'Easy', medium: 'Medium', complex: 'Complex' };

interface Choices {
  mode: Mode;
  topicIds: string[];
  kinds: SheetKind[];
  difficulty: SheetDifficulty;
  count: SheetCount;
  paper: SheetPaper;
}

/**
 * Worksheets: choose topics, kinds of question, a difficulty and how many, or a paper in the board's pattern, and make
 * a printable sheet with its answer key. A code in the address (`?code=`) starts from the choices of that sheet, a
 * topic (`?topic=`) from that topic alone. A code typed in opens its sheet.
 */
export function WorksheetBuilder() {
  const { courseId, packs, choice } = useCourse();
  const course = findCourse(courseId);
  if (!course || !hasWorksheets(courseId)) {
    return <p className="text-base text-muted">Worksheets are not ready for this course yet.</p>;
  }
  return <Builder key={courseId} courseId={courseId} choice={choice} playable={packs.map((p) => p.topicId)} />;
}

function Builder({ courseId, choice, playable }: { courseId: string; choice: CourseChoice; playable: string[] }) {
  const router = useRouter();
  const query = useSearchParams();
  const course = findCourse(courseId)!;
  const topics = course.topics.filter((t) => playable.includes(t.id));
  // The papers of the learner's choice of Part B (Class 12), which the code of a paper then carries.
  const bank = bankOf(courseId, choice);
  const papers = SHEET_PAPERS.filter((p) => paperAvailable(p, bank));

  const [choices, setChoices] = useState<Choices>(() => {
    const start: Choices = { mode: 'topics', topicIds: topics.map((t) => t.id), kinds: [...SHEET_KINDS], difficulty: 'mixed', count: 20, paper: papers[0] ?? 'full' };
    const parsed = parseWorksheetCode(query.get('code') ?? '');
    if (parsed.ok && parsed.spec.courseId === courseId) {
      const spec = parsed.spec;
      return spec.mode === 'paper' ? { ...start, mode: 'paper', paper: spec.paper } : { ...start, topicIds: spec.topicIds, kinds: spec.kinds, difficulty: spec.difficulty, count: spec.count };
    }
    const topic = query.get('topic');
    if (topic && playable.includes(topic)) return { ...start, topicIds: [topic] };
    return start;
  });
  const update = (next: Partial<Choices>) => setChoices((now) => ({ ...now, ...next }));
  const counts = useMemo(() => kindCounts(courseId, choices.topicIds, choices.difficulty), [courseId, choices.topicIds, choices.difficulty]);

  const chosen = new Set(choices.topicIds);
  const setTopics = (ids: Iterable<string>) => {
    const keep = new Set(ids);
    update({ topicIds: topics.map((t) => t.id).filter((id) => keep.has(id)) });
  };
  const toggleKind = (kind: SheetKind) =>
    update({ kinds: choices.kinds.includes(kind) ? choices.kinds.filter((k) => k !== kind) : SHEET_KINDS.filter((k) => k === kind || choices.kinds.includes(k)) });
  const askable = choices.kinds.filter((k) => counts[k] > 0);
  const why =
    choices.mode === 'paper'
      ? papers.length === 0
        ? 'This course has no paper that can be set yet.'
        : null
      : choices.topicIds.length === 0
        ? 'Tick at least one topic.'
        : choices.kinds.length === 0
          ? 'Turn on at least one kind of question.'
          : askable.length === 0
            ? 'These topics have no questions of that kind at this difficulty. Turn on another kind, tick more topics, or choose another difficulty.'
            : null;

  const make = () => {
    if (why) return;
    const spec: SheetSpec =
      choices.mode === 'paper'
        ? { courseId, mode: 'paper', paper: choices.paper, seed: drawSeed({ mode: 'paper' }), ...(partBOf(choice) === 'computerised' ? { partB: 'computerised' as const } : {}) }
        : { courseId, mode: 'topics', topicIds: choices.topicIds, kinds: askable, difficulty: choices.difficulty, count: choices.count, seed: drawSeed({ mode: 'topics' }) };
    router.push(sheetHref(worksheetCode(spec)));
  };

  const units = [...new Set(topics.map((t) => t.unit))];

  const settings = (
    <div className="flex flex-col gap-5 rounded-card border border-edge bg-surface p-4 shadow-card">
      {choices.mode === 'topics' ? (
        <>
          <div role="group" aria-labelledby="ws-kinds-label" className="flex flex-col gap-2">
            <p id="ws-kinds-label" className={GROUP_LABEL}>
              Kinds of question
            </p>
            {SHEET_KINDS.map((k) => {
              const on = choices.kinds.includes(k);
              const none = counts[k] === 0;
              return (
                <button
                  key={k}
                  type="button"
                  data-testid={`ws-kind-${k}`}
                  aria-pressed={on}
                  onClick={() => toggleKind(k)}
                  className={`flex min-h-12 items-center gap-3 rounded-control border px-3 py-2 text-left ${on ? 'border-primary bg-primary-soft' : 'border-edge-deep bg-surface hover:bg-sunken'}`}
                >
                  <span aria-hidden="true" className={`relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-edge-deep'}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-[left] ${on ? 'left-[1.125rem]' : 'left-0.5'}`} />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-base font-extrabold leading-tight">{SHEET_KIND_LABEL[k]}</span>
                    <span className="text-sm text-muted">{none ? 'None in these topics at this difficulty' : SHEET_KIND_NOTE[k]}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div role="group" aria-labelledby="ws-difficulty-label" className="flex flex-col gap-2">
            <p id="ws-difficulty-label" className={GROUP_LABEL}>
              Difficulty
            </p>
            <Pills
              options={SHEET_DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_NAME[d] }))}
              value={choices.difficulty}
              onChange={(difficulty) => update({ difficulty })}
              label="Difficulty"
              testIdPrefix="ws-difficulty"
            />
          </div>

          <div role="group" aria-labelledby="ws-count-label" className="flex flex-col gap-2">
            <p id="ws-count-label" className={GROUP_LABEL}>
              How many questions
            </p>
            <Pills
              options={SHEET_COUNTS.map((c) => ({ value: String(c), label: String(c) }))}
              value={String(choices.count)}
              onChange={(count) => update({ count: Number(count) as SheetCount })}
              label="How many questions"
              testIdPrefix="ws-count"
            />
            <p className="text-sm text-muted">A case study counts as one question, with its parts.</p>
          </div>
        </>
      ) : (
        <div role="radiogroup" aria-labelledby="ws-paper-label" className="flex flex-col gap-2">
          <p id="ws-paper-label" className={GROUP_LABEL}>
            Which paper
          </p>
          {SHEET_PAPERS.map((p) => {
            const blueprint = bank.blueprints[p];
            const on = choices.paper === p;
            const open = papers.includes(p);
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={!open}
                data-testid={`ws-paper-${p}`}
                onClick={() => update({ paper: p })}
                className={`flex min-h-12 flex-col rounded-control border px-3 py-2 text-left disabled:opacity-50 ${on ? 'border-primary bg-primary-soft' : 'border-edge-deep bg-surface hover:bg-sunken'}`}
              >
                <span className="text-base font-extrabold">{blueprint.title}</span>
                <span className="text-sm text-muted">
                  {blueprint.marks} marks · {blueprint.minutes >= 60 ? `${blueprint.minutes / 60} hours` : `${blueprint.minutes} minutes`} · {blueprint.sections.reduce((n, s) => n + s.questions[1] + s.questions[3] + s.questions[4] + s.questions[6], 0)} questions
                </span>
              </button>
            );
          })}
          <p className="text-sm text-muted">The questions and marks of a mock paper in the board&apos;s pattern: the sheet names its number, so students can also sit it in the app.</p>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-edge pt-4">
        <Button size="lg" data-testid="ws-make" disabled={why !== null} onClick={make} className="w-full">
          Make worksheet
        </Button>
        {why ? (
          <p role="status" data-testid="ws-make-why" className="text-sm font-bold text-accent-ink">
            {why}
          </p>
        ) : (
          <p className="text-sm text-muted">Each sheet comes with an answer key and a code to make it again.</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight">Worksheets</h1>
        <p className="text-base text-muted">
          A printable sheet of questions on the topics you choose, with an answer key. Every sheet has a code: give it to a class, or type it in later, and the same sheet comes back.
        </p>
      </header>

      <Pills
        options={[
          { value: 'topics', label: 'Topics and kinds' },
          { value: 'paper', label: "A paper in the board's pattern" },
        ]}
        value={choices.mode}
        onChange={(mode) => update({ mode })}
        label="What to set"
        testIdPrefix="ws-mode"
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 lg:order-2">
          <div className="lg:sticky lg:top-20">{settings}</div>
        </div>

        <div className="flex min-w-0 flex-col gap-5 lg:order-1">
          {choices.mode === 'topics' ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className={GROUP_LABEL}>
                  Topics · {choices.topicIds.length} of {topics.length} chosen
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" data-testid="ws-topics-all" onClick={() => setTopics(topics.map((t) => t.id))}>
                    All
                  </Button>
                  <Button variant="secondary" data-testid="ws-topics-none" onClick={() => setTopics([])}>
                    None
                  </Button>
                </div>
              </div>
              {units.map((unit, i) => {
                const ids = topics.filter((t) => t.unit === unit).map((t) => t.id);
                const on = ids.filter((id) => chosen.has(id)).length;
                return (
                  <fieldset key={unit} className="flex flex-col gap-2">
                    <legend className="mb-2 flex w-full flex-wrap items-center justify-between gap-2">
                      <span id={`ws-unit-${i}`} className="text-lg font-extrabold text-primary-ink">
                        {unit}
                      </span>
                      <button
                        type="button"
                        data-testid={`ws-unit-${i}`}
                        onClick={() => setTopics(on === ids.length ? choices.topicIds.filter((id) => !ids.includes(id)) : [...choices.topicIds, ...ids])}
                        className="text-sm font-bold text-primary-ink underline"
                      >
                        {on === ids.length ? 'Clear the unit' : 'The whole unit'}
                      </button>
                    </legend>
                    <ul className="grid gap-2 md:grid-cols-2">
                      {topics
                        .filter((t) => t.unit === unit)
                        .map((t) => (
                          <li key={t.id} className="min-w-0">
                            <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-control border px-3 py-2 ${chosen.has(t.id) ? 'border-primary bg-primary-soft' : 'border-edge-deep bg-surface hover:bg-sunken'}`}>
                              <input
                                type="checkbox"
                                data-testid={`ws-topic-${t.id}`}
                                checked={chosen.has(t.id)}
                                onChange={(e) => setTopics(e.target.checked ? [...choices.topicIds, t.id] : choices.topicIds.filter((x) => x !== t.id))}
                                className="h-5 w-5 shrink-0 accent-[var(--color-primary)]"
                              />
                              <span className="min-w-0 font-bold [overflow-wrap:anywhere]">{t.title}</span>
                            </label>
                          </li>
                        ))}
                    </ul>
                  </fieldset>
                );
              })}
            </>
          ) : (
            <div className="rounded-card border border-edge bg-surface p-4 text-base shadow-card">
              <p className="font-bold">A paper of the board&apos;s pattern, printed for writing on.</p>
              <p className="text-muted">
                Its parts, its questions of 1, 3, 4 and 6 marks and its case studies, as the mock papers set them, with the marks of each question, the time allowed and an answer key.
              </p>
            </div>
          )}

          <OpenCode />
        </div>
      </div>
    </div>
  );
}

/** A code typed in: the sheet it names, or why it names none. */
function OpenCode() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const open = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseWorksheetCode(text);
    if (!parsed.ok) {
      setProblem(parsed.reason);
      return;
    }
    router.push(sheetHref(parsed.code));
  };
  return (
    <form onSubmit={open} className="flex flex-col gap-2 border-t border-edge pt-4" aria-labelledby="ws-open-label">
      <label id="ws-open-label" htmlFor="ws-open-code" className={GROUP_LABEL}>
        Make a sheet again from its code
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="ws-open-code"
          data-testid="ws-open-code"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setProblem(null);
          }}
          placeholder={CODE_EXAMPLE}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={problem !== null}
          aria-describedby={problem ? 'ws-open-problem' : undefined}
          className="min-h-11 min-w-0 flex-1 rounded-control border-2 border-edge-deep bg-surface px-3 font-mono text-base uppercase"
        />
        <Button type="submit" variant="secondary" data-testid="ws-open">
          Open
        </Button>
      </div>
      {problem ? (
        <p id="ws-open-problem" role="alert" data-testid="ws-open-problem" className="text-sm font-bold text-danger-deep">
          {problem}
        </p>
      ) : null}
    </form>
  );
}
