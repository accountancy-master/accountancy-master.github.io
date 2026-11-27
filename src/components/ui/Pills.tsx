'use client';

/**
 * A row of pills of which one is chosen: the filters of a list ("All", "In progress"), a choice of course. Each pill
 * is a toggle button that says whether it is pressed. `count` adds a number after a label.
 */
export function Pills<T extends string>({
  options,
  value,
  onChange,
  label,
  testIdPrefix,
  className,
}: {
  options: readonly { value: T; label: string; count?: number }[];
  value: T;
  onChange(value: T): void;
  /** What the group is, for a screen reader: "Show topics". */
  label: string;
  /** Each pill gets `<prefix>-<value>` as its test id. */
  testIdPrefix?: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={['flex flex-wrap gap-2', className].filter(Boolean).join(' ')}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            data-testid={testIdPrefix ? `${testIdPrefix}-${o.value}` : undefined}
            onClick={() => onChange(o.value)}
            className={[
              'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-extrabold transition-colors',
              on ? 'border-primary bg-primary text-white' : 'border-edge-deep bg-surface text-ink hover:bg-sunken',
            ].join(' ')}
          >
            {o.label}
            {o.count !== undefined ? <span className={on ? 'font-bold text-white' : 'font-bold text-muted'}>{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
