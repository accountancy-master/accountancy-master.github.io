import type { ReactNode } from 'react';
import { HUE_STROKE, type Hue } from './hues';

export interface ProgressRingProps {
  /** Percentage between 0 and 100; anything outside is clamped, and what is not a number is 0. */
  value: number;
  /** Outer width and height in pixels. */
  size?: number;
  /** Width of the ring; by default an eighth of the size. */
  stroke?: number;
  /** What a screen reader hears. Without one the ring says "<n> percent". */
  label?: string;
  /** The colour of the filled part: the brand's green, the amber of XP, or the hue of a tile. */
  tone?: 'primary' | 'accent' | Hue;
  /** What stands in the middle; by default the percentage. Pass `null` for an empty middle. */
  children?: ReactNode;
  className?: string;
  'data-testid'?: string;
}

const clamp = (value: number) => Math.round(Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0);

/**
 * A progress ring: a track and the part done, with the percentage (or what is given) in the middle. One image to a
 * screen reader, named by `label`.
 */
export function ProgressRing({ value, size = 64, stroke, label, tone = 'primary', children, className, 'data-testid': testId }: ProgressRingProps) {
  const percent = clamp(value);
  const width = stroke ?? Math.max(4, Math.round(size / 8));
  const radius = (size - width) / 2;
  const circumference = 2 * Math.PI * radius;
  const centre = size / 2;
  const colour = tone === 'primary' ? 'stroke-primary' : tone === 'accent' ? 'stroke-accent' : HUE_STROKE[tone];
  return (
    <div
      role="img"
      aria-label={label ?? `${percent} percent`}
      data-testid={testId}
      className={['relative inline-flex shrink-0 items-center justify-center', className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={centre} cy={centre} r={radius} fill="none" strokeWidth={width} className="stroke-edge" />
        {percent > 0 ? (
          <circle
            cx={centre}
            cy={centre}
            r={radius}
            fill="none"
            strokeWidth={width}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - percent / 100)}
            className={`${colour} transition-[stroke-dashoffset] duration-500`}
          />
        ) : null}
      </svg>
      {children === null ? null : (
        <span aria-hidden="true" className="absolute flex flex-col items-center font-extrabold leading-none text-ink" style={{ fontSize: Math.max(11, Math.round(size * 0.26)) }}>
          {children ?? `${percent}%`}
        </span>
      )}
    </div>
  );
}
