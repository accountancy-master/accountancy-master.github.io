import type { ReactNode } from 'react';
import { HUE_EDGE, HUE_ICON, type Hue } from './hues';

export interface StatTileProps {
  /** What the number is: "Day streak", "Accuracy". */
  label: string;
  /** The number as it is shown: "12", "84%", "–" while it is not known. */
  value: ReactNode;
  /** A word after the number, smaller: "days", "XP". */
  unit?: string;
  /** One more line under it, smaller still. */
  hint?: ReactNode;
  icon?: ReactNode;
  /** Gives the tile a coloured top edge and its icon a tint. */
  hue?: Hue;
  /** The element the tile is: a list item inside a list of tiles, otherwise a plain box. */
  as?: 'li' | 'div';
  /** Set on the number, so that a test reads the number alone. */
  testId?: string;
  className?: string;
}

/**
 * One number with its label: the tiles of Home, Progress and the topic page. Laid out in a grid by the screen; a
 * tile fills its cell.
 */
export function StatTile({ label, value, unit, hint, icon, hue, as = 'div', testId, className }: StatTileProps) {
  const Tag = as;
  return (
    <Tag
      className={[
        'flex min-w-0 flex-col gap-1 rounded-card border border-edge bg-surface p-4 shadow-card',
        hue ? `border-t-[3px] ${HUE_EDGE[hue]}` : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="flex items-center gap-2">
        {icon ? (
          <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${hue ? HUE_ICON[hue] : 'bg-primary-soft text-primary-ink'} [&_svg]:h-4 [&_svg]:w-4`}>
            {icon}
          </span>
        ) : null}
        <span className="min-w-0 text-xs font-extrabold uppercase tracking-wide text-muted">{label}</span>
      </span>
      <span className="text-2xl font-extrabold tabular-nums leading-tight">
        <span data-testid={testId}>{value}</span>
        {unit ? <span className="ml-1 text-sm font-bold text-muted">{unit}</span> : null}
      </span>
      {hint ? <span className="text-sm font-semibold text-muted">{hint}</span> : null}
    </Tag>
  );
}
