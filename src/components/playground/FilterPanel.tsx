'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { GROUP_LABEL } from '@/components/ui/GroupLabel';
import type { Difficulty } from '@/content/types';
import { DIFFICULTIES, DIFFICULTY_LABEL, PATTERN_KINDS, PATTERN_KIND_LABEL, type PatternFilters, type PatternKind } from '@/learning/patterns';

/** The playable topics of the course under their units, each with how many patterns it has. */
export interface UnitGroup {
  unit: string;
  topics: { id: string; title: string; count: number }[];
}

const toggled = <T,>(list: readonly T[], item: T, on: boolean): T[] => (on ? [...list.filter((x) => x !== item), item] : list.filter((x) => x !== item));

/** A tick box that can also show "some of them" (a unit with some of its topics ticked). */
function Box({ checked, mixed = false, onChange, testId, children, count }: { checked: boolean; mixed?: boolean; onChange(on: boolean): void; testId: string; children: ReactNode; count?: number }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-control px-2 py-1 hover:bg-sunken">
      <input
        ref={ref}
        type="checkbox"
        data-testid={testId}
        checked={checked}
        aria-checked={mixed ? 'mixed' : checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 shrink-0 accent-primary"
      />
      <span className="min-w-0 flex-1 text-sm font-semibold leading-snug break-words">{children}</span>
      {count !== undefined ? <span className="shrink-0 text-xs font-bold tabular-nums text-muted">{count}</span> : null}
    </label>
  );
}

/**
 * The filters of the Playground: units and topics, kinds of question and difficulty, each a list of tick boxes. A
 * filter with nothing ticked lets everything through. `search` is the search field, where the panel holds it.
 */
export function FilterPanel({
  filters,
  onChange,
  units,
  kindCounts,
  difficultyCounts,
  search,
}: {
  filters: PatternFilters;
  onChange(next: PatternFilters): void;
  units: UnitGroup[];
  kindCounts: Record<PatternKind, number>;
  difficultyCounts: Record<Difficulty, number>;
  search?: ReactNode;
}) {
  const anySet = filters.topics.length + filters.kinds.length + filters.difficulties.length > 0 || filters.q.trim() !== '';
  return (
    <div data-testid="playground-filters" className="flex flex-col gap-5">
      {search}
      <fieldset className="flex min-w-0 flex-col gap-1">
        <legend className={`${GROUP_LABEL} mb-1`}>Units and topics</legend>
        {units.map((u, i) => {
          const on = u.topics.filter((t) => filters.topics.includes(t.id)).length;
          return (
            <div key={u.unit} className="flex flex-col">
              <Box
                testId={`filter-unit-${i}`}
                checked={on === u.topics.length}
                mixed={on > 0 && on < u.topics.length}
                count={u.topics.reduce((n, t) => n + t.count, 0)}
                onChange={(checked) => {
                  const ids = u.topics.map((t) => t.id);
                  const rest = filters.topics.filter((id) => !ids.includes(id));
                  onChange({ ...filters, topics: checked ? [...rest, ...ids] : rest });
                }}
              >
                <span className="font-extrabold">{u.unit}</span>
              </Box>
              <div className="ml-5 flex flex-col border-l border-edge pl-1">
                {u.topics.map((t) => (
                  <Box
                    key={t.id}
                    testId={`filter-topic-${t.id}`}
                    checked={filters.topics.includes(t.id)}
                    count={t.count}
                    onChange={(checked) => onChange({ ...filters, topics: toggled(filters.topics, t.id, checked) })}
                  >
                    {t.title}
                  </Box>
                ))}
              </div>
            </div>
          );
        })}
      </fieldset>
      <fieldset className="flex min-w-0 flex-col gap-1">
        <legend className={`${GROUP_LABEL} mb-1`}>Kind</legend>
        {PATTERN_KINDS.map((k) => (
          <Box
            key={k}
            testId={`filter-kind-${k}`}
            checked={filters.kinds.includes(k)}
            count={kindCounts[k]}
            onChange={(checked) => onChange({ ...filters, kinds: toggled(filters.kinds, k, checked) })}
          >
            {PATTERN_KIND_LABEL[k]}
          </Box>
        ))}
      </fieldset>
      <fieldset className="flex min-w-0 flex-col gap-1">
        <legend className={`${GROUP_LABEL} mb-1`}>Difficulty</legend>
        {DIFFICULTIES.map((d) => (
          <Box
            key={d}
            testId={`filter-difficulty-${d}`}
            checked={filters.difficulties.includes(d)}
            count={difficultyCounts[d]}
            onChange={(checked) => onChange({ ...filters, difficulties: toggled(filters.difficulties, d, checked) })}
          >
            {DIFFICULTY_LABEL[d]}
          </Box>
        ))}
      </fieldset>
      {anySet ? (
        <button
          type="button"
          data-testid="filter-clear"
          onClick={() => onChange({ q: '', topics: [], kinds: [], difficulties: [] })}
          className="min-h-11 self-start rounded-control px-2 text-sm font-extrabold text-primary-ink underline-offset-4 hover:underline"
        >
          Clear all filters
        </button>
      ) : null}
    </div>
  );
}
