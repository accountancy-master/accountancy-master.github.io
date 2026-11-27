import type { ReactNode } from 'react';

/** The look of a group label: small, uppercase, spaced, muted. For an element that is not a `GroupLabel`. */
export const GROUP_LABEL = 'text-xs font-extrabold uppercase tracking-[0.08em] text-muted';

/**
 * A small uppercase label over a group: "LEARN", "PRACTISE" in the sidebar, "TODAY" over a card. A heading when it
 * heads a section (`as="h2"`), plain text otherwise.
 */
export function GroupLabel({ children, as = 'p', id, className }: { children: ReactNode; as?: 'p' | 'h2' | 'h3' | 'span'; id?: string; className?: string }) {
  const Tag = as;
  return (
    <Tag id={id} className={[GROUP_LABEL, className].filter(Boolean).join(' ')}>
      {children}
    </Tag>
  );
}

/** The heading of a section of a page, with an optional link or control at its right. */
export function SectionHeader({ id, title, action, testId }: { id: string; title: ReactNode; action?: ReactNode; testId?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <h2 id={id} data-testid={testId} className="text-lg font-extrabold tracking-tight">
        {title}
      </h2>
      {action}
    </div>
  );
}
