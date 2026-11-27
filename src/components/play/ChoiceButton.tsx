import type { ReactNode } from 'react';

export type ChoiceMark = 'right' | 'wrong' | null;

/** One selectable answer. Selection and the outcome are shown by border, fill and a word, never by colour alone. */
export function ChoiceButton({
  badge,
  selected,
  mark,
  disabled,
  onClick,
  children,
  'data-testid': testId,
}: {
  badge: string;
  selected: boolean;
  mark: ChoiceMark;
  disabled: boolean;
  onClick(): void;
  children: ReactNode;
  'data-testid': string;
}) {
  const tone =
    mark === 'right'
      ? 'border-primary bg-primary-soft'
      : mark === 'wrong'
        ? 'border-danger bg-danger-soft'
        : selected
          ? 'border-primary bg-primary-soft'
          : 'border-edge bg-surface hover:border-edge-deep hover:bg-canvas';
  const badgeTone =
    mark === 'wrong'
      ? 'bg-danger text-white'
      : mark === 'right' || selected
        ? 'bg-primary text-white'
        : 'bg-edge text-muted';

  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-14 w-full items-center gap-3 rounded-control border-2 border-b-4 px-4 py-3 text-left text-lg font-bold disabled:cursor-default ${tone}`}
    >
      <span
        aria-hidden="true"
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base font-extrabold ${badgeTone}`}
      >
        {badge}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      {mark === 'right' ? <span className="shrink-0 text-sm font-extrabold text-primary-ink">Correct answer</span> : null}
      {mark === 'wrong' ? <span className="shrink-0 text-sm font-extrabold text-danger-deep">Your answer</span> : null}
    </button>
  );
}
