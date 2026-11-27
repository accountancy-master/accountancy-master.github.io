'use client';

import { useId, type ReactNode } from 'react';

// ---------------------------------------------------------------------------------------------------------------
// The controls every lab shares: the three modes, a row of choices, a choice from a list. Every control is at least
// 44 px tall, says whether it is pressed in words to a screen reader, and shows it by fill as well as colour.
// ---------------------------------------------------------------------------------------------------------------

export type LabMode = 'watch' | 'play' | 'try';

export const LAB_MODES: readonly { id: LabMode; label: string; detail: string }[] = [
  { id: 'watch', label: 'Watch', detail: 'A ready example, played step by step, with what moves and why.' },
  { id: 'play', label: 'Play', detail: 'Change the figures and the choices, and watch the picture follow.' },
  { id: 'try', label: 'Try it', detail: 'Quick questions on the picture, with the answer and the reason at once. Nothing is recorded.' },
];

/** A pill: filled when pressed, outlined when not. The look of the simulator's own mode buttons. */
export const pillClass = (on: boolean, small = false) =>
  `inline-flex min-h-11 items-center rounded-full border px-4 py-1.5 ${small ? 'text-sm' : 'text-base'} font-extrabold transition-colors ${on ? 'border-primary bg-primary text-white' : 'border-edge-deep bg-surface text-ink hover:bg-sunken'}`;

/** Watch, Play and Try it, with a line on what the chosen one does. Test ids `<prefix>-mode-<mode>`. */
export function ModeSwitch({ mode, onChange, prefix }: { mode: LabMode; onChange(m: LabMode): void; prefix: string }) {
  const current = LAB_MODES.find((m) => m.id === mode)!;
  return (
    <nav aria-label="Lab modes" className="flex flex-col gap-2">
      <div role="group" aria-label="Mode" className="flex flex-wrap gap-2">
        {LAB_MODES.map((m) => (
          <button key={m.id} type="button" aria-pressed={m.id === mode} data-testid={`${prefix}-mode-${m.id}`} onClick={() => onChange(m.id)} className={pillClass(m.id === mode)}>
            {m.label}
          </button>
        ))}
      </div>
      <p data-testid={`${prefix}-mode-detail`} className="text-sm text-muted">
        {current.detail}
      </p>
    </nav>
  );
}

/** A row of choices of which one is pressed (an example, a method, a kind of question). Test ids `<prefix>-<value>`. */
export function Toggle<T extends string>({
  options,
  value,
  onChange,
  label,
  prefix,
  small,
  showLabel,
}: {
  options: readonly { value: T; label: ReactNode }[];
  value: NoInfer<T>;
  onChange(v: NoInfer<T>): void;
  /** What the choice is, for a screen reader (and shown above it with `showLabel`). */
  label: string;
  prefix: string;
  small?: boolean;
  showLabel?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {showLabel ? (
        <p id={id} className="text-sm font-bold">
          {label}
        </p>
      ) : null}
      <div role="group" aria-label={showLabel ? undefined : label} aria-labelledby={showLabel ? id : undefined} className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={o.value === value} data-testid={`${prefix}-${o.value}`} onClick={() => onChange(o.value)} className={pillClass(o.value === value, small)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A choice from a list, with its label above it: for more examples than fit in a row of pills. */
export function SelectField<T extends string>({
  id: given,
  label,
  value,
  onChange,
  options,
  groups,
  testId,
  className = '',
}: {
  /** The id of the list (one is made when it is not given). */
  id?: string;
  label: string;
  value: T;
  onChange(v: NoInfer<T>): void;
  options?: readonly { id: NoInfer<T>; label: string }[];
  /** Options in named groups, instead of `options`. */
  groups?: readonly { label: string; options: readonly { id: NoInfer<T>; label: string }[] }[];
  testId?: string;
  className?: string;
}) {
  const made = useId();
  const id = given ?? made;
  const list = (os: readonly { id: T; label: string }[]) =>
    os.map((o) => (
      <option key={o.id} value={o.id}>
        {o.label}
      </option>
    ));
  return (
    <label htmlFor={id} className={`flex min-w-0 flex-col gap-1 text-sm font-bold ${className}`}>
      <span>{label}</span>
      <select
        id={id}
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="min-h-11 w-full min-w-0 rounded-control border-2 border-edge-deep bg-surface px-2 text-base font-semibold text-ink"
      >
        {groups
          ? groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {list(g.options)}
              </optgroup>
            ))
          : list(options ?? [])}
      </select>
    </label>
  );
}

// The playback parts were here before they had a file of their own: still to be had from here.
export { Announce, PlaybackBar, StepList } from './Playback';
