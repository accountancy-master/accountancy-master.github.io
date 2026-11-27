import Link from 'next/link';
import type { ReactNode } from 'react';
import { BeyondSyllabus } from '@/components/ui/BeyondSyllabus';
import { buttonClasses } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { findConceptTitle, topicTitle } from '@/content/outline';
import { DIFFICULTY_LABEL, TEMPLATE_KIND_LABEL, type Pattern } from '@/learning/patterns';

/** The kinds of the questions of a case, each once, in the order they first come: "Journal entry · Numeric · MCQ". */
export const partsLine = (pattern: Pick<Pattern, 'parts'>): string => [...new Set(pattern.parts.map((k) => TEMPLATE_KIND_LABEL[k]))].join(' · ');

/** The one line under a pattern's title: its topic and its concept (for a case study, how many questions it has). */
export const patternLine = (pattern: Pattern): string =>
  pattern.kind === 'case'
    ? `${topicTitle(pattern.topicId)} · ${pattern.parts.length} linked questions`
    : `${topicTitle(pattern.topicId)} · ${findConceptTitle(pattern.conceptId) ?? pattern.conceptId}`;

/**
 * One pattern on the Playground or the Case studies screen: its title, its kind and difficulty, a line about it, a
 * sample of what it asks (the first line of a question it makes; `sample` is undefined while the samples load) and a
 * Play link. `onSelect` adds a box that chooses it for a mix; `footer` adds a line (a best score) above the button.
 */
export function PatternCard({
  pattern,
  sample,
  playHref,
  playLabel = 'Play',
  selected,
  onSelect,
  footer,
  testId = `pattern-${pattern.id}`,
}: {
  pattern: Pattern;
  sample: string | undefined;
  /** Undefined for a pattern that cannot be played yet (a case study of a stage that is still closed). */
  playHref: string | undefined;
  playLabel?: string;
  selected?: boolean;
  onSelect?(selected: boolean): void;
  footer?: ReactNode;
  testId?: string;
}) {
  const titleId = `${testId}-title`;
  return (
    <article
      data-testid={testId}
      aria-labelledby={titleId}
      className={`flex h-full min-w-0 flex-col gap-2.5 rounded-card border bg-surface p-4 shadow-card ${selected ? 'border-primary ring-2 ring-primary/30' : 'border-edge'}`}
    >
      <div className="flex items-start gap-3">
        {onSelect ? (
          // The box sits in a 44 px target, so that a finger choosing it does not open the card's Play instead.
          <label data-testid={`${testId}-select-target`} className="-my-2.5 -ml-2.5 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-control hover:bg-sunken">
            <input
              type="checkbox"
              data-testid={`${testId}-select`}
              checked={selected ?? false}
              onChange={(e) => onSelect(e.target.checked)}
              aria-label={`Choose for a mix: ${pattern.title}`}
              className="h-5 w-5 accent-primary"
            />
          </label>
        ) : null}
        <h3 id={titleId} className="min-w-0 flex-1 text-base font-extrabold leading-snug break-words">
          {pattern.title}
        </h3>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip tone={pattern.kind === 'case' ? 'accent' : 'primary'} className="min-h-7! px-2.5! text-xs!">
          {pattern.kind === 'case' ? 'Case study' : TEMPLATE_KIND_LABEL[pattern.parts[0]]}
        </Chip>
        <Chip tone="neutral" className="min-h-7! px-2.5! text-xs!">
          {DIFFICULTY_LABEL[pattern.difficulty]}
        </Chip>
        {pattern.kind === 'case' ? (
          <Chip tone="outline" className="min-h-7! max-w-full px-2.5! text-xs!">
            <span className="truncate">{partsLine(pattern)}</span>
          </Chip>
        ) : null}
      </div>
      <p className="text-sm font-semibold text-muted">{patternLine(pattern)}</p>
      {pattern.beyondSyllabus !== undefined ? <BeyondSyllabus reason={pattern.beyondSyllabus} testId={`${testId}-beyond`} /> : null}
      <p
        data-testid={`${testId}-sample`}
        aria-busy={sample === undefined}
        className="line-clamp-3 min-h-[3.75rem] rounded-control bg-sunken px-3 py-2 text-sm break-words text-ink"
      >
        {sample === undefined ? <span className="text-muted">Loading a sample…</span> : <>“{sample}”</>}
      </p>
      {footer}
      <div className="mt-auto flex items-center justify-end pt-1">
        {playHref !== undefined ? (
          <Link href={playHref} data-testid={`${testId}-play`} className={buttonClasses('primary', 'md', 'min-w-24')}>
            {playLabel}
            <span className="sr-only">: {pattern.title}</span>
          </Link>
        ) : (
          <span data-testid={`${testId}-locked`} className="text-sm font-bold text-muted">
            Locked
          </span>
        )}
      </div>
    </article>
  );
}
