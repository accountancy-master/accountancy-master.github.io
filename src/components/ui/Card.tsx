import Link from 'next/link';
import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  /** When set, the whole card is a link. */
  href?: string;
}

// A white card with a light border and a gentle shadow (the tokens are in globals.css). A linked card lifts on hover.
const BASE = 'block rounded-card border border-edge bg-surface p-5 shadow-card';
const LINKED =
  'transition-[box-shadow,border-color,transform] duration-150 hover:border-edge-deep hover:shadow-card-hover active:translate-y-px';

export function Card({ href, className, children, ...rest }: CardProps) {
  if (href !== undefined) {
    const classes = [BASE, LINKED, className].filter(Boolean).join(' ');
    return (
      <Link href={href} className={classes} {...(rest as HTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </Link>
    );
  }
  const classes = [BASE, className].filter(Boolean).join(' ');
  return (
    <div className={classes} {...(rest as HTMLAttributes<HTMLDivElement>)}>
      {children}
    </div>
  );
}
