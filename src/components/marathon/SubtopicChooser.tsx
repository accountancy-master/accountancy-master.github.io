'use client';

import Link from 'next/link';
import { Button, buttonClasses } from '@/components/ui/Button';
import type { MarathonSubtopic } from '@/learning/marathonSubtopics';
import { describeSubtopic, subtopicChoiceLabel } from './subtopicText';

const SMALL_BUTTON = 'min-h-11 rounded-control border-2 border-edge-deep bg-surface px-4 text-sm font-extrabold hover:bg-canvas disabled:cursor-not-allowed disabled:bg-edge disabled:text-muted';

/**
 * The subtopics of one topic on the Marathon screen: a button that says how many are ticked and opens the list, and
 * the list itself, a tick box for each with what a marathon can serve of it. A subtopic with nothing to serve is
 * shown but cannot be ticked. `startHref` starts the run over what is ticked; there is none while nothing is.
 */
export function SubtopicChooser({
  topicId,
  topicTitle,
  subtopics,
  ticked,
  open,
  startHref,
  onToggle,
  onChange,
}: {
  topicId: string;
  topicTitle: string;
  subtopics: readonly MarathonSubtopic[];
  /** The ids that are ticked. */
  ticked: readonly string[];
  open: boolean;
  startHref: string | undefined;
  onToggle(): void;
  /** Told the ids that are ticked after a change. */
  onChange(ticked: string[]): void;
}) {
  const id = `marathon-${topicId}`;
  const ready = subtopics.filter((s) => s.ready);
  const on = new Set(ticked);
  const set = (subtopicId: string, checked: boolean) => onChange(ready.filter((s) => (s.id === subtopicId ? checked : on.has(s.id))).map((s) => s.id));

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        data-testid={`${id}-subtopics`}
        aria-expanded={open}
        aria-controls={`${id}-subtopic-list`}
        onClick={onToggle}
        className="flex min-h-11 items-center justify-between gap-3 rounded-control border-2 border-edge-deep bg-surface px-4 text-left text-sm font-extrabold hover:bg-canvas"
      >
        <span>
          <span className="sr-only">{topicTitle}: </span>
          <span data-testid={`${id}-subtopics-count`}>{subtopicChoiceLabel(ticked.length, subtopics.length)}</span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-primary-ink">
          {open ? 'Close' : 'Choose'}
        </span>
      </button>

      {open ? (
        <fieldset id={`${id}-subtopic-list`} data-testid={`${id}-subtopic-list`} className="flex min-w-0 flex-col gap-3 rounded-card border-2 border-edge bg-surface p-3">
          <legend className="sr-only">Subtopics of {topicTitle}</legend>
          <div className="flex gap-2">
            <button type="button" data-testid={`${id}-subtopics-all`} disabled={ready.length === 0} onClick={() => onChange(ready.map((s) => s.id))} className={SMALL_BUTTON}>
              Select all
            </button>
            <button type="button" data-testid={`${id}-subtopics-clear`} disabled={ready.length === 0} onClick={() => onChange([])} className={SMALL_BUTTON}>
              Clear
            </button>
          </div>
          <ul className="flex flex-col">
            {subtopics.map((s) => (
              <li key={s.id}>
                <label className={`flex min-h-11 items-start gap-3 rounded-control px-1 py-2 ${s.ready ? 'cursor-pointer hover:bg-canvas' : 'text-muted'}`}>
                  <input
                    type="checkbox"
                    data-testid={`${id}-subtopic-${s.id}`}
                    checked={s.ready && on.has(s.id)}
                    disabled={!s.ready}
                    onChange={(e) => set(s.id, e.target.checked)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-base font-bold leading-snug [overflow-wrap:anywhere]">{s.title}</span>
                    <span data-testid={`${id}-subtopic-${s.id}-detail`} className="text-sm font-bold text-muted">
                      {describeSubtopic(s)}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {startHref !== undefined ? (
            <Link href={startHref} data-testid={`${id}-start`} className={buttonClasses('primary', 'md', 'w-full')}>
              Start
            </Link>
          ) : (
            <>
              <p role="status" data-testid={`${id}-subtopics-none`} className="text-sm font-bold text-accent-ink">
                {ready.length === 0 ? 'This topic has no questions yet.' : 'Tick at least one subtopic to start.'}
              </p>
              <Button disabled data-testid={`${id}-start`} className="w-full">
                Start
              </Button>
            </>
          )}
        </fieldset>
      ) : null}
    </div>
  );
}
