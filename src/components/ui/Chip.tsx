import Link from 'next/link';
import type { HTMLAttributes, ReactNode } from 'react';

export type ChipTone = 'neutral' | 'primary' | 'accent' | 'danger' | 'outline';

const TONES: Record<ChipTone, string> = {
  neutral: 'bg-sunken text-ink border border-edge',
  primary: 'bg-primary-soft text-primary-ink',
  accent: 'bg-accent-soft text-accent-ink',
  danger: 'bg-danger-soft text-danger-deep',
  outline: 'border border-edge-deep bg-surface text-ink',
};

/** Class names of a chip, for an element that is not a `Chip` (a button, a summary). */
export const chipClasses = (tone: ChipTone = 'neutral', className?: string): string =>
  ['inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-extrabold whitespace-nowrap', TONES[tone], className]
    .filter(Boolean)
    .join(' ');

export interface ChipProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  tone?: ChipTone;
  icon?: ReactNode;
  /** When set, the chip is a link. */
  href?: string;
}

/** A small rounded label: the XP, the streak and the exam countdown of the top bar, a status on a card. */
export function Chip({ children, tone = 'neutral', icon, href, className, ...rest }: ChipProps) {
  const classes = chipClasses(tone, [href ? 'hover:brightness-95' : '', className].filter(Boolean).join(' '));
  const body = (
    <>
      {icon ? <span aria-hidden="true" className="inline-flex [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span> : null}
      {children}
    </>
  );
  if (href !== undefined) {
    return (
      <Link href={href} className={classes} {...(rest as HTMLAttributes<HTMLAnchorElement>)}>
        {body}
      </Link>
    );
  }
  return (
    <span className={classes} {...(rest as HTMLAttributes<HTMLSpanElement>)}>
      {body}
    </span>
  );
}
