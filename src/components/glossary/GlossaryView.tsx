'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '@/app-state/StoreProvider';
import { courseName } from '@/components/settings/CoursePicker';
import { Chip } from '@/components/ui/Chip';
import { CourseUnavailable } from '@/components/ui/CourseUnavailable';
import { SearchField } from '@/components/ui/SearchField';
import { choiceKey, choiceOf, type CourseChoice } from '@/content/courseOptions';
import { glossaryFor, loadGlossary, type GlossaryEntry } from '@/content/glossary';
import { filterGlossary, letterOf, lettersOf } from '@/content/glossary/search';
import { courseFor, findConceptTitle, findCourse, findOutline } from '@/content/outline';
import type { Course } from '@/content/types';
import { conceptPracticeHref } from '@/learning/examPack';

const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
/** The terms shown at first, and added by "Show more": a phone never has to scroll past hundreds of terms. */
const PAGE = 30;
/** Every letter at once, in place of one letter. */
const ALL = 'all';
const SELECT = 'min-h-11 w-full min-w-0 rounded-control border border-edge-deep bg-surface px-3 text-base font-semibold sm:w-auto sm:max-w-72';

/** The id of a letter's heading: upper case, so it is never the id of a term (always lower case). */
const letterId = (letter: string) => `letter-${letter === '#' ? 'num' : letter}`;

/**
 * The glossary of a course: every term A to Z, one letter at a time (or every letter, a page at a time), with a letter
 * index, a search ("/" focuses it) over the terms, their other names and their definitions, and filters by unit and
 * topic; a search or a filter shows what it finds under every letter, a page at a time. A term is at `/glossary#<id>`. The course is the
 * learner's, or the one `?course=` names (a term of the other course found by "Go to"). The terms are fetched when
 * the page opens: no other page carries them.
 */
export function GlossaryView() {
  const { profile } = useStore();
  const asked = useSearchParams().get('course');
  if (!profile) return null;
  const courseId = asked && findCourse(asked) ? asked : profile.courseId;
  // The terms of the topics the learner meets (Part B of Class 12 as chosen: content/courseOptions.ts).
  const choice = choiceOf(profile);
  const course = courseFor(courseId, choice);
  return course ? <Glossary key={`${course.id}|${choiceKey(choice)}`} course={course} choice={choice} own={course.id === profile.courseId} /> : <CourseUnavailable />;
}

function Glossary({ course, choice, own }: { course: Course; choice: CourseChoice; own: boolean }) {
  const [entries, setEntries] = useState<GlossaryEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [unit, setUnit] = useState('');
  const [topicId, setTopicId] = useState('');
  const [target, setTarget] = useState<string | null>(null);
  const [letter, setLetter] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    let current = true;
    loadGlossary(course.id).then(
      (list) => current && setEntries(glossaryFor(list, choice)),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [course.id, choice, attempt]);

  const topicOf = useMemo(() => new Map(course.topics.map((t) => [t.id, t])), [course.topics]);
  const unitOf = useCallback((id: string) => topicOf.get(id)?.unit, [topicOf]);
  const all = useMemo(() => entries ?? [], [entries]);
  const found = useMemo(() => filterGlossary(all, { query, unit, topicId }, unitOf), [all, query, unit, topicId, unitOf]);
  // With nothing searched or filtered, one letter at a time: the first that has terms until another is chosen.
  const browsing = query.trim() === '' && unit === '' && topicId === '';
  const allLetters = useMemo(() => lettersOf(all), [all]);
  const current = letter ?? allLetters[0] ?? ALL;
  const matching = useMemo(() => (browsing && current !== ALL ? found.filter((e) => letterOf(e.term) === current) : found), [browsing, current, found]);
  const shown = useMemo(() => matching.slice(0, limit), [matching, limit]);
  const byId = useMemo(() => new Map(all.map((e) => [e.id, e])), [all]);
  // The units and topics that have terms, in the order of the course.
  const units = useMemo(() => [...new Set(course.topics.filter((t) => all.some((e) => e.topicId === t.id)).map((t) => t.unit))], [course.topics, all]);
  const topics = useMemo(() => course.topics.filter((t) => all.some((e) => e.topicId === t.id) && (unit === '' || t.unit === unit)), [course.topics, all, unit]);
  const letters = useMemo(() => new Set(browsing ? allLetters : lettersOf(found)), [browsing, allLetters, found]);

  // A term named by the address (`#goodwill`, from "Go to" or a "see also" link) is shown, marked, even when the
  // search or a filter had hidden it.
  useEffect(() => {
    if (!entries) return;
    const show = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (!entries.some((e) => e.id === hash)) return;
      setQuery('');
      setUnit('');
      setTopicId('');
      setTarget(hash);
      // Its letter, and enough of the letter's terms to reach it.
      const term = entries.find((e) => e.id === hash)!;
      const own = letterOf(term.term);
      setLetter(own);
      setLimit(Math.max(PAGE, entries.filter((e) => letterOf(e.term) === own).findIndex((e) => e.id === hash) + 1));
      requestAnimationFrame(() => {
        const el = document.getElementById(hash);
        el?.scrollIntoView({ block: 'center' });
        el?.focus({ preventScroll: true });
      });
    };
    show();
    window.addEventListener('hashchange', show);
    return () => window.removeEventListener('hashchange', show);
  }, [entries]);

  const groups = useMemo(() => {
    const out: { letter: string; entries: GlossaryEntry[] }[] = [];
    for (const e of shown) {
      const letter = letterOf(e.term);
      const last = out[out.length - 1];
      if (last?.letter === letter) last.entries.push(e);
      else out.push({ letter, entries: [e] });
    }
    return out;
  }, [shown]);

  return (
    <div className="flex flex-col gap-6">
      <header data-testid="glossary-header" className="flex flex-col gap-4 rounded-panel border border-edge bg-surface p-5 shadow-card lg:p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-extrabold tracking-tight">Glossary</h1>
          <p data-testid="glossary-summary" className="text-base font-semibold text-muted">
            {entries ? `${all.length} ${all.length === 1 ? 'term' : 'terms'} of ${courseName(course)}, A to Z` : `The terms of ${courseName(course)}, A to Z`}
          </p>
        </div>
        {!own ? (
          <p data-testid="glossary-other-course" className="rounded-control bg-accent-soft px-3 py-2 text-sm font-bold text-accent-ink">
            This is the glossary of {courseName(course)}, which is not your course.{' '}
            <Link href="/glossary" className="underline">
              Your course&apos;s glossary
            </Link>
          </p>
        ) : null}
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <SearchField
            value={query}
            onChange={(q) => {
              setQuery(q);
              setLimit(PAGE);
            }}
            label="Search the glossary"
            testId="glossary-search"
            className="lg:w-80"
          />
          <label className="flex min-w-0 flex-col gap-1 text-sm font-bold sm:flex-row sm:items-center sm:gap-2">
            Unit
            <select
              value={unit}
              data-testid="glossary-unit"
              onChange={(e) => {
                setUnit(e.target.value);
                setTopicId('');
                setLimit(PAGE);
              }}
              className={SELECT}
            >
              <option value="">All units</option>
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm font-bold sm:flex-row sm:items-center sm:gap-2">
            Topic
            <select
              value={topicId}
              data-testid="glossary-topic"
              onChange={(e) => {
                setTopicId(e.target.value);
                setLimit(PAGE);
              }}
              className={SELECT}
            >
              <option value="">All topics</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <nav aria-label="Letters" data-testid="glossary-letters" className="flex flex-wrap gap-1">
          {LETTERS.filter((l) => l !== '#' || letters.has('#')).map((l) =>
            letters.has(l) ? (
              <button
                key={l}
                type="button"
                data-testid={`glossary-letter-${l}`}
                aria-pressed={browsing ? current === l : undefined}
                aria-label={browsing ? `Terms under ${l}` : `Go to ${l}`}
                onClick={() => {
                  // Browsing: that letter's terms. Searching: to that letter among what was found.
                  if (browsing) {
                    setLetter(l);
                    setLimit(PAGE);
                  }
                  requestAnimationFrame(() => document.getElementById(letterId(l))?.scrollIntoView({ block: 'start' }));
                }}
                className={[
                  'inline-flex h-11 min-w-11 items-center justify-center rounded-control border px-2 text-base font-extrabold',
                  browsing && current === l ? 'border-primary bg-primary text-white' : 'border-edge-deep bg-surface text-primary-ink hover:bg-primary-soft',
                ].join(' ')}
              >
                {l}
              </button>
            ) : (
              <span key={l} aria-hidden="true" className="inline-flex h-11 min-w-11 items-center justify-center rounded-control px-2 text-base font-bold text-muted/50">
                {l}
              </span>
            ),
          )}
          {browsing ? (
            <button
              type="button"
              data-testid="glossary-letter-all"
              aria-pressed={current === ALL}
              onClick={() => {
                setLetter(ALL);
                setLimit(PAGE);
              }}
              className={[
                'inline-flex h-11 items-center justify-center rounded-control border px-3 text-base font-extrabold',
                current === ALL ? 'border-primary bg-primary text-white' : 'border-edge-deep bg-surface text-primary-ink hover:bg-primary-soft',
              ].join(' ')}
            >
              A to Z
            </button>
          ) : null}
        </nav>
      </header>

      {failed && !entries ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-card border-2 border-danger bg-surface p-5">
          <p className="text-base font-bold">We couldn&apos;t load the glossary.</p>
          <button
            type="button"
            data-testid="glossary-retry"
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
            className="min-h-11 rounded-control border-2 border-edge-deep px-4 font-bold"
          >
            Try again
          </button>
        </div>
      ) : !entries ? (
        <p role="status" aria-busy="true" data-testid="glossary-loading" className="text-base text-muted">
          Loading the glossary…
        </p>
      ) : (
        <>
          <p role="status" data-testid="glossary-showing" className="-mb-2 text-sm font-bold text-muted">
            Showing {matching.length} of {all.length} terms
            {browsing && current !== ALL ? ` · the letter ${current}` : ''}
          </p>
          {groups.map((g) => (
            <section key={g.letter} aria-labelledby={letterId(g.letter)} className="flex flex-col gap-3">
              <h2 id={letterId(g.letter)} data-testid={`glossary-heading-${g.letter}`} className="scroll-mt-24 border-b-2 border-edge pb-1 text-2xl font-extrabold text-primary-ink">
                {g.letter}
              </h2>
              <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {g.entries.map((e) => (
                  <li key={e.id} className="min-w-0">
                    <Term entry={e} course={course} own={own} byId={byId} target={target === e.id} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {matching.length > shown.length ? (
            <button
              type="button"
              data-testid="glossary-more"
              onClick={() => setLimit((n) => n + PAGE)}
              className="min-h-11 self-center rounded-control border-2 border-b-4 border-edge-deep bg-surface px-5 font-extrabold hover:bg-canvas"
            >
              Show more ({matching.length - shown.length} left)
            </button>
          ) : null}
          {matching.length === 0 ? (
            <p data-testid="glossary-none" className="rounded-card border border-dashed border-edge-deep bg-sunken px-5 py-6 text-center font-bold text-muted">
              No term matches. Try another word, or show all units and topics.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function Term({ entry, course, own, byId, target }: { entry: GlossaryEntry; course: Course; own: boolean; byId: ReadonlyMap<string, GlossaryEntry>; target: boolean }) {
  const topic = course.topics.find((t) => t.id === entry.topicId);
  const playable = findOutline(entry.topicId) !== undefined;
  const concept = entry.conceptId ? findConceptTitle(entry.conceptId) : undefined;
  const seeAlso = (entry.seeAlso ?? []).flatMap((id) => {
    const other = byId.get(id);
    return other ? [other] : [];
  });
  return (
    <article
      id={entry.id}
      tabIndex={-1}
      data-testid={`term-${entry.id}`}
      data-target={target ? 'true' : undefined}
      aria-labelledby={`${entry.id}-term`}
      className={[
        'flex h-full scroll-mt-24 flex-col gap-2 rounded-card border bg-surface p-4 shadow-card outline-none',
        target ? 'border-accent ring-2 ring-accent' : 'border-edge',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-x-3">
        <h3 id={`${entry.id}-term`} className="text-lg font-extrabold">
          {entry.term}
        </h3>
        <a href={`#${entry.id}`} aria-label={`Link to ${entry.term}`} className="-my-2 -mr-2 inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-control text-base font-bold text-muted hover:bg-sunken hover:text-primary-ink">
          #
        </a>
      </div>
      {entry.also && entry.also.length > 0 ? (
        <p data-testid="term-also" className="text-sm text-muted">
          Also called: <span className="font-bold text-ink">{entry.also.join(', ')}</span>
        </p>
      ) : null}
      <p data-testid="term-definition" className="text-base">
        {entry.definition}
      </p>
      {entry.example ? (
        <p data-testid="term-example" className="rounded-control bg-sunken px-3 py-2 text-sm">
          <span className="font-extrabold">Example: </span>
          {entry.example}
        </p>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {topic && own && playable ? (
          <Chip href={`/topics/${topic.id}`} tone="primary" data-testid="term-topic">
            {topic.title}
          </Chip>
        ) : topic ? (
          <Chip tone="neutral" data-testid="term-topic">
            {topic.title}
          </Chip>
        ) : null}
        {concept && own && playable ? (
          <Link href={conceptPracticeHref(entry.topicId, entry.conceptId!)} prefetch={false} data-testid="term-practise" className="inline-flex min-h-11 items-center text-sm font-bold text-primary-ink underline">
            Practise: {concept}
          </Link>
        ) : null}
      </div>
      {seeAlso.length > 0 ? (
        <p data-testid="term-see-also" className="text-sm">
          <span className="font-bold text-muted">See also: </span>
          {seeAlso.map((o, i) => (
            <span key={o.id}>
              {i > 0 ? ', ' : ''}
              <a href={`#${o.id}`} className="font-bold text-primary-ink underline">
                {o.term}
              </a>
            </span>
          ))}
        </p>
      ) : null}
    </article>
  );
}
