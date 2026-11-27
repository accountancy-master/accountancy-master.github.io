import { ProgressRing } from './ProgressRing';

export interface MasteryRingProps {
  /** Percentage between 0 and 100. */
  value: number;
  /** Outer width and height in pixels. */
  size?: number;
  label?: string;
  className?: string;
  'data-testid'?: string;
}

/** Words for a mastery percentage (the same rounded number the ring shows). */
export function masteryWord(percent: number): string {
  const p = Math.round(percent);
  if (p <= 0) return 'Not started';
  if (p < 40) return 'Learning';
  if (p < 70) return 'Familiar';
  if (p < 90) return 'Proficient';
  return 'Mastered';
}

/** Mastery as a ring with the percentage in the middle: a `ProgressRing` named for what it measures. */
export function MasteryRing({ value, size = 64, label, className, 'data-testid': testId }: MasteryRingProps) {
  const percent = Math.round(Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0);
  return <ProgressRing value={percent} size={size} label={label ?? `Mastery ${percent} percent`} className={className} data-testid={testId} />;
}
