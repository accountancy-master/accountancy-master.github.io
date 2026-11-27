import Link from 'next/link';
import type { HTMLAttributes, ReactNode } from 'react';
import { HUE_EDGE, HUE_ICON, type Hue } from './hues';

export interface TileProps extends HTMLAttributes<HTMLElement> {
  hue: Hue;
  /** When set, the whole tile is a link. */
  href?: string;
  /** Leave off for a link whose page may not be there to fetch ahead (a page another part of the app adds). */
  prefetch?: boolean;
  children: ReactNode;
}

const BASE = 'block rounded-card border border-edge border-t-[3px] bg-surface p-4 shadow-card';
const LINKED = 'transition-[box-shadow,transform] duration-150 hover:shadow-card-hover hover:-translate-y-px';

/**
 * A card with a thin coloured top edge, whose hue says what kind of thing it is: the quick actions of Home, the
 * tiles of the Practice hub. Lay one out with `TileBody`, or put anything inside.
 */
export function Tile({ hue, href, prefetch, className, children, ...rest }: TileProps) {
  const classes = [BASE, HUE_EDGE[hue], href !== undefined ? LINKED : '', className].filter(Boolean).join(' ');
  if (href !== undefined) {
    return (
      <Link href={href} prefetch={prefetch} className={classes} {...(rest as HTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </Link>
    );
  }
  return (
    <div className={classes} {...(rest as HTMLAttributes<HTMLDivElement>)}>
      {children}
    </div>
  );
}

/** The inside of a tile: an icon on the hue's tint, a title, a line of description and a status line. */
export function TileBody({ hue, icon, title, detail, status }: { hue: Hue; icon: ReactNode; title: ReactNode; detail?: ReactNode; status?: ReactNode }) {
  return (
    <span className="flex h-full flex-col gap-2">
      <span aria-hidden="true" className={`flex h-9 w-9 items-center justify-center rounded-control ${HUE_ICON[hue]} [&_svg]:h-5 [&_svg]:w-5`}>
        {icon}
      </span>
      <span className="text-base font-extrabold leading-tight">{title}</span>
      {detail ? <span className="text-sm text-muted">{detail}</span> : null}
      {status ? <span className="mt-auto text-sm font-bold text-primary-ink">{status}</span> : null}
    </span>
  );
}
