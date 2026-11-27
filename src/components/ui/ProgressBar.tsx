import { HUE_FILL, type Hue } from './hues';

export interface ProgressBarProps {
  /** Fraction between 0 and 1. */
  value: number;
  label?: string;
  className?: string;
  /** The colour of the filled part: the brand's green unless a hue is given. */
  tone?: 'primary' | 'accent' | Hue;
  /** A thinner bar, for rows of a list. */
  thin?: boolean;
  'data-testid'?: string;
}

export function ProgressBar({ value, label, className, tone = 'primary', thin = false, 'data-testid': testId }: ProgressBarProps) {
  const fraction = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const percent = Math.round(fraction * 100);
  const fill = tone === 'primary' ? 'bg-primary' : tone === 'accent' ? 'bg-accent' : HUE_FILL[tone];
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      data-testid={testId}
      className={[thin ? 'h-2' : 'h-4', 'w-full overflow-hidden rounded-full bg-edge', className].filter(Boolean).join(' ')}
    >
      <div className={`h-full rounded-full ${fill} transition-[width] duration-300`} style={{ width: `${percent}%` }} />
    </div>
  );
}
