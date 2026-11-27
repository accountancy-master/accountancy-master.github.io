'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BackToPractice } from '@/components/practice/TopicPicker';
import { Button, buttonClasses } from '@/components/ui/Button';
import { GroupLabel } from '@/components/ui/GroupLabel';
import { ScaleIcon } from '@/components/ui/icons';
import { ProgressGate } from '@/components/ui/ProgressGate';
import { SearchField } from '@/components/ui/SearchField';
import { Shell } from '@/components/ui/Shell';
import { WIDE_QUERY, useMediaQuery } from '@/components/ui/useMediaQuery';
import { choiceOf } from '@/content/courseOptions';
import { findCourse, outlinesOf, topicTitle } from '@/content/outline';
import type { Difficulty } from '@/content/types';
import {
  DIFFICULTIES,
  PATTERN_KINDS,
  coursePatterns,
  filterPatterns,
  filtersFromQuery,
  playFromQuery,
  playgroundHref,
  scaleLine,
  type Pattern,
  type PatternFilters,
  type PatternKind,
} from '@/learning/patterns';
import type { Profile } from '@/storage/types';
import { FilterPanel, type UnitGroup } from './FilterPanel';
import { PatternCard } from './PatternCard';
import { PlaygroundPlayer } from './PlaygroundPlayer';
import { useSamples } from './useSamples';

/** How many cards are shown at first, and added by "Show more": fewer on a phone, where each card is a screen tall. */
const PAGE = 48;
const PHONE_PAGE = 12;

/**
 * The Playground, `/playground`: every pattern of the learner's course, filtered by what the address says, or (with
 * `pattern=` or `mix=` in the address) the pattern or the mix being played.
 */
export function Playground() {
  const key = useSearchParams().toString();
  // Read once for each address, so that what is worked out from them is worked out again only when it changes.
  const { play, filters } = useMemo(() => {
    const query = new URLSearchParams(key);
    return { play: playFromQuery(query), filters: filtersFromQuery(query) };
  }, [key]);
  if (play) {
    return (
      <Shell mode="play">
        <PlaygroundPlayer key={key} play={play} filters={filters} backHref={playgroundHref(filters)} />
      </Shell>
    );
  }
  return (
    <Shell width="wide">
      <ProgressGate id="playground" loading="Loading the question types…">
        {({ profile }) => <Browser profile={profile} filters={filters} />}
      </ProgressGate>
    </Shell>
  );
}

const countBy = <K extends string>(keys: readonly K[], list: readonly Pattern[], keyOf: (p: Pattern) => K): Record<K, number> => {
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  for (const p of list) out[keyOf(p)]++;
  return out;
};

function Browser({ profile, filters }: { profile: Profile; filters: PatternFilters }) {
  // The patterns of the topics the learner meets (Part B of Class 12 as chosen).
  const all = coursePatterns(profile.courseId, choiceOf(profile));
  const samples = useSamples();
  const wide = useMediaQuery(WIDE_QUERY);
  const [pages, setPages] = useState(1);
  const shown = pages * (wide ? PAGE : PHONE_PAGE);
  const [chosen, setChosen] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  // The filters live in the address, so that a view can be shared or bookmarked; a change replaces the address.
  const setFilters = (next: PatternFilters) => {
    window.history.replaceState(null, '', playgroundHref(next));
    setPages(1);
  };

  const units = useMemo((): UnitGroup[] => {
    const playable = new Set(outlinesOf(profile.courseId, choiceOf(profile)).map((o) => o.topicId));
    const groups: UnitGroup[] = [];
    for (const t of findCourse(profile.courseId)?.topics ?? []) {
      if (!playable.has(t.id)) continue;
      const count = all.filter((p) => p.topicId === t.id).length;
      const group = groups.find((g) => g.unit === t.unit);
      if (group) group.topics.push({ id: t.id, title: t.title, count });
      else groups.push({ unit: t.unit, topics: [{ id: t.id, title: t.title, count }] });
    }
    return groups;
  }, [profile, all]);

  const found = useMemo(() => filterPatterns(all, filters, samples ?? undefined), [all, filters, samples]);
  // The counts beside each kind and difficulty are of what the other filters let through.
  const kindCounts = useMemo(() => countBy<PatternKind>(PATTERN_KINDS, filterPatterns(all, { ...filters, kinds: [] }, samples ?? undefined), (p) => p.kind), [all, filters, samples]);
  const difficultyCounts = useMemo(
    () => countBy<Difficulty>(DIFFICULTIES, filterPatterns(all, { ...filters, difficulties: [] }, samples ?? undefined), (p) => p.difficulty),
    [all, filters, samples],
  );
  const visible = found.slice(0, shown);
  const groups = useMemo(() => {
    const out: { topicId: string; patterns: Pattern[] }[] = [];
    for (const p of visible) {
      const last = out.at(-1);
      if (last?.topicId === p.topicId) last.patterns.push(p);
      else out.push({ topicId: p.topicId, patterns: [p] });
    }
    return out;
  }, [visible]);
  const countOf = (topicId: string) => found.filter((p) => p.topicId === topicId).length;

  const search = <SearchField value={filters.q} onChange={(q) => setFilters({ ...filters, q })} label="Search question types" testId="playground-search" />;
  const panel = (inSheet: boolean) => (
    <FilterPanel filters={filters} onChange={setFilters} units={units} kindCounts={kindCounts} difficultyCounts={difficultyCounts} search={inSheet ? undefined : search} />
  );
  const mixHref =
    chosen.length > 0 ? playgroundHref(filters, { kind: 'mix', ids: chosen }) : found.length > 0 ? playgroundHref(filters, { kind: 'shown' }) : undefined;
  const activeCount = filters.topics.length + filters.kinds.length + filters.difficulties.length;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <BackToPractice />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-3xl font-extrabold tracking-tight">Playground</h1>
          <Link href="/simulator" data-testid="playground-simulator" className={buttonClasses('secondary', 'md')}>
            <ScaleIcon />
            Simulator
          </Link>
        </div>
        <p data-testid="playground-scale" className="text-lg font-extrabold text-primary-ink">
          {scaleLine(all.length)}
        </p>
        <p className="text-base text-muted">Play any question type at once, as often as you like: each one makes a new question every time. Nothing to unlock, no pass or fail.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        {wide ? (
          <aside aria-label="Filters" className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
            {panel(false)}
          </aside>
        ) : null}

        <div className="flex min-w-0 flex-col gap-4">
          {!wide ? (
            <div className="flex flex-col gap-3">
              {search}
              <Button variant="secondary" data-testid="playground-filters-open" aria-haspopup="dialog" onClick={() => setSheetOpen(true)} className="self-start">
                Filters{activeCount > 0 ? ` (${activeCount})` : ''}
              </Button>
            </div>
          ) : null}

          <div className="sticky top-14 z-[5] -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-card border border-edge bg-surface/95 px-3 py-2 shadow-card backdrop-blur lg:top-16">
            <p data-testid="playground-count" aria-live="polite" className="text-sm font-bold text-muted">
              Showing {found.length.toLocaleString('en-IN')} of {all.length.toLocaleString('en-IN')} question types
              {chosen.length > 0 ? ` · ${chosen.length} chosen` : ''}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {chosen.length > 0 ? (
                <Button variant="ghost" data-testid="playground-clear-chosen" onClick={() => setChosen([])}>
                  Clear choice
                </Button>
              ) : null}
              {mixHref ? (
                <Link href={mixHref} data-testid="playground-play-selected" className={buttonClasses('primary', 'md')}>
                  {chosen.length > 0 ? `Play selected (${chosen.length})` : `Play all shown (${found.length.toLocaleString('en-IN')})`}
                </Link>
              ) : null}
            </div>
          </div>

          {found.length === 0 ? (
            <p data-testid="playground-empty" className="rounded-card border border-dashed border-edge-deep bg-sunken p-5 text-base font-bold text-muted">
              No question type matches. Try fewer words or clear a filter.
            </p>
          ) : (
            groups.map((g) => (
              <section key={g.topicId} aria-labelledby={`pg-topic-${g.topicId}`} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <GroupLabel as="h2" id={`pg-topic-${g.topicId}`}>
                    {topicTitle(g.topicId)} · {countOf(g.topicId)} {countOf(g.topicId) === 1 ? 'question type' : 'question types'}
                  </GroupLabel>
                  <Link
                    href={playgroundHref({ ...filters, topics: [g.topicId] }, { kind: 'shown' })}
                    data-testid={`playground-play-topic-${g.topicId}`}
                    className="text-sm font-extrabold text-primary-ink underline-offset-4 hover:underline"
                  >
                    Play this topic mixed
                  </Link>
                </div>
                <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {g.patterns.map((p) => (
                    <li key={p.id} className="min-w-0">
                      <PatternCard
                        pattern={p}
                        sample={samples ? (samples[p.id] ?? '') : undefined}
                        playHref={playgroundHref(filters, { kind: 'pattern', id: p.id })}
                        selected={chosen.includes(p.id)}
                        onSelect={(on) => setChosen((now) => (on ? [...now.filter((id) => id !== p.id), p.id] : now.filter((id) => id !== p.id)))}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}

          {found.length > shown ? (
            <Button variant="secondary" data-testid="playground-more" onClick={() => setPages((n) => n + 1)} className="self-center">
              Show more ({(found.length - shown).toLocaleString('en-IN')} left)
            </Button>
          ) : null}
        </div>
      </div>

      {!wide && sheetOpen ? <FilterSheet count={found.length} onClose={() => setSheetOpen(false)}>{panel(true)}</FilterSheet> : null}
    </div>
  );
}

/** The filters on a phone: a sheet over the page, closed with its button or Escape. */
function FilterSheet({ count, onClose, children }: { count: number; onClose(): void; children: ReactNode }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    headingRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-ink/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pg-sheet-title"
        data-testid="playground-filters-sheet"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85dvh] flex-col rounded-t-panel border-t border-edge bg-surface shadow-pop"
      >
        <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
          <h2 id="pg-sheet-title" ref={headingRef} tabIndex={-1} className="text-lg font-extrabold outline-none">
            Filters
          </h2>
          <Button variant="ghost" data-testid="playground-filters-close" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">{children}</div>
        <div className="border-t border-edge px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button size="lg" data-testid="playground-filters-done" onClick={onClose} className="w-full">
            Show {count.toLocaleString('en-IN')} {count === 1 ? 'question type' : 'question types'}
          </Button>
        </div>
      </div>
    </div>
  );
}
