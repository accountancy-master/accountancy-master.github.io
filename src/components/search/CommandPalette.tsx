'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useStore } from '@/app-state/StoreProvider';
import { shortCourseName } from '@/components/shell/CourseSwitch';
import { NAV_ITEMS } from '@/components/shell/navigation';
import { SearchIcon } from '@/components/ui/icons';
import { CARD_TITLES } from '@/content/cardTitles.generated';
import { choiceKey, choiceOf, topicShown, type CourseChoice } from '@/content/courseOptions';
import { COURSES, OUTLINES, STAGES, TEMPLATE_OUTLINES, courseFor } from '@/content/outline';
import { GLOSSARY_COURSES, glossaryFor, loadGlossary, type GlossaryEntry } from '@/content/glossary';
import { PRACTICAL_COURSES, loadPractical } from '@/content/practical';
import { shelfOf } from '@/simulator/labs';
import { buildSearchIndex, entryHref, glossarySearchEntries, practicalSearchEntries, searchIndex, type SearchEntry, type SearchKind } from './searchIndex';

const KIND_LABEL: Record<SearchKind, string> = { page: 'Page', topic: 'Topic', map: 'Mind map', lab: 'Simulator', level: 'Level', card: 'Card', pattern: 'Question type', case: 'Case study', term: 'Glossary', project: 'Project', viva: 'Viva' };

// Built once for each choice of Part B of Class 12 (content/courseOptions.ts), the first time "Go to" opens: from the
// outline every page already has, and the card titles that come with this script. A learner finds the topics of
// either course, but not those of the choice of Part B they have not made.
const built = new Map<string, SearchEntry[]>();
function theIndex(choice: CourseChoice): SearchEntry[] {
  const key = choiceKey(choice);
  let index = built.get(key);
  if (!index) {
    const shown = <T extends { topicId: string }>(list: readonly T[]) => list.filter((x) => topicShown(x.topicId, choice));
    index = buildSearchIndex({
      courses: COURSES.map((c) => courseFor(c.id, choice) ?? c),
      outlines: shown(OUTLINES),
      templates: shown(TEMPLATE_OUTLINES),
      stages: shown(STAGES),
      cardTitles: CARD_TITLES,
      pages: NAV_ITEMS,
      labs: shelfOf(() => true),
    });
    built.set(key, index);
  }
  return index;
}

// The glossaries, fetched the first time "Go to" opens and kept for as long as the app stays open.
let terms: Promise<{ courseId: string; entries: GlossaryEntry[] }[]> | null = null;
const theTerms = () =>
  (terms ??= Promise.all(GLOSSARY_COURSES.map(async (courseId) => ({ courseId, entries: await loadGlossary(courseId) }))).catch(() => {
      // Not fetched (offline before they were stored): asked for again the next time "Go to" opens.
      terms = null;
      return [];
    }));

// The project options and viva questions of each course (content/practical), fetched the same way.
let practical: Promise<SearchEntry[]> | null = null;
const thePractical = () =>
  (practical ??= Promise.all(PRACTICAL_COURSES.map((courseId) => loadPractical(courseId)))
    .then((list) => practicalSearchEntries(list.filter((p) => p !== undefined), COURSES))
    .catch(() => {
      practical = null;
      return [];
    }));

/**
 * "Go to": a search over everything there is, in a dialog over the page. Up and down move, Enter goes, Escape closes;
 * Tab stays inside the dialog, and focus goes back to where it was when it closes (the Shell sees to that).
 */
export default function CommandPalette({ onClose, onGo }: { onClose(): void; /** Goes to an address (the Shell asks a play screen first); by default, straight there. */ onGo?(href: string): void }) {
  const { profile } = useStore();
  const router = useRouter();
  const courseId = profile?.courseId ?? '';
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const choice = choiceOf(profile);
  const [glossaries, setGlossaries] = useState<{ courseId: string; entries: GlossaryEntry[] }[]>([]);
  useEffect(() => {
    let current = true;
    void theTerms().then((list) => {
      if (current) setGlossaries(list);
    });
    return () => {
      current = false;
    };
  }, []);
  const [practicalEntries, setPracticalEntries] = useState<SearchEntry[]>([]);
  useEffect(() => {
    let current = true;
    void thePractical().then((list) => {
      if (current) setPracticalEntries(list);
    });
    return () => {
      current = false;
    };
  }, []);
  // The terms of the topics the learner meets.
  const glossary = useMemo(() => glossarySearchEntries(glossaries.map((g) => ({ ...g, entries: glossaryFor(g.entries, choice) })), COURSES), [glossaries, choice]);
  const results = useMemo(() => searchIndex([...theIndex(choice), ...glossary, ...practicalEntries], query, courseId), [query, courseId, glossary, practicalEntries, choice]);
  const courseNames = useMemo(() => new Map(COURSES.map((c) => [c.id, shortCourseName(c.title)])), []);
  const current = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => {
    input.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  function go(entry: SearchEntry | undefined) {
    if (!entry) return;
    onClose();
    const href = entryHref(entry, courseId);
    // A place on the page that is open (a term of the glossary, a card of the topic): the address changes and the
    // page shows it, with no navigation.
    const url = new URL(href, window.location.href);
    const path = (p: string) => p.replace(/\/+$/, '');
    if (url.hash && path(url.pathname) === path(window.location.pathname) && url.search === window.location.search) {
      window.location.assign(url.hash);
      return;
    }
    if (onGo) onGo(href);
    else router.push(href);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(results.length === 0 ? 0 : (current + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(results.length === 0 ? 0 : (current - 1 + results.length) % results.length);
    } else if (e.key === 'Home' && e.ctrlKey) {
      setActive(0);
    } else if (e.key === 'Enter' && e.target === input.current) {
      e.preventDefault();
      go(results[current]);
    } else if (e.key === 'Tab') {
      // Focus stays in the dialog: it has the field and the close button.
      const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('input, button') ?? [])];
      if (focusable.length === 0) return;
      const at = focusable.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (at <= 0 ? focusable.length - 1 : at - 1) : at === focusable.length - 1 ? 0 : at + 1;
      e.preventDefault();
      focusable[next].focus();
    }
  }

  const optionId = (i: number) => `${id}-option-${i}`;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 px-3 pt-[10vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        data-testid="goto-dialog"
        onKeyDown={onKeyDown}
        className="flex max-h-[75vh] w-full max-w-xl flex-col overflow-hidden rounded-panel border border-edge bg-surface shadow-pop"
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-3">
          <h2 id={`${id}-title`} className="text-base font-extrabold">
            Go to
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-xl font-bold text-muted hover:bg-sunken">
            ×
          </button>
        </div>
        <div className="relative mx-4 my-2 flex items-center">
          <span aria-hidden="true" className="pointer-events-none absolute left-3 text-muted [&_svg]:h-[18px] [&_svg]:w-[18px]">
            <SearchIcon />
          </span>
          <input
            ref={input}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            aria-activedescendant={results.length > 0 ? optionId(current) : undefined}
            aria-label="Find a page, topic, level, card or question type"
            placeholder="Find a page, topic, level, card or question type"
            data-testid="goto-input"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            className="min-h-12 w-full rounded-control border-2 border-primary bg-surface pl-10 pr-3 text-base placeholder:text-muted"
          />
        </div>
        <ul ref={list} id={`${id}-list`} role="listbox" aria-label="Results" data-testid="goto-results" className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {results.map((r, i) => {
            const on = i === current;
            const other = r.courseId !== null && r.courseId !== courseId;
            return (
              <li
                key={`${r.kind}:${r.href}:${i}`}
                id={optionId(i)}
                role="option"
                aria-selected={on}
                data-index={i}
                data-testid="goto-result"
                data-href={entryHref(r, courseId)}
                onMouseMove={() => !on && setActive(i)}
                onClick={() => go(r)}
                className={['flex cursor-pointer items-center gap-3 rounded-control px-3 py-2', on ? 'bg-primary-soft' : 'hover:bg-sunken'].join(' ')}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={`truncate font-bold ${on ? 'text-primary-ink' : ''}`}>{r.title}</span>
                  <span className="truncate text-sm text-muted">{r.detail}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs font-bold">
                  <span className="text-muted">{KIND_LABEL[r.kind]}</span>
                  {r.courseId !== null ? (
                    <span data-testid="goto-result-course" className={other ? 'rounded-full bg-accent-soft px-2 text-accent-ink' : 'text-primary-ink'}>
                      {courseNames.get(r.courseId)}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
          {results.length === 0 ? (
            <li role="presentation" className="px-3 py-6 text-center font-bold text-muted">
              Nothing found for “{query.trim()}”.
            </li>
          ) : null}
        </ul>
        <p className="border-t border-edge bg-sunken px-4 py-2 text-xs font-semibold text-muted">
          <kbd className="font-bold">↑</kbd> <kbd className="font-bold">↓</kbd> to move, <kbd className="font-bold">Enter</kbd> to go, <kbd className="font-bold">Esc</kbd> to close.
        </p>
      </div>
    </div>
  );
}
