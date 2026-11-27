'use client';

import { useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';

/** True when a key press was typed into something that takes text: "/" there is a character, not a shortcut. */
export function typingInto(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (target as HTMLInputElement).type;
  return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color', 'file'].includes(type);
}

/**
 * Focuses the element when "/" is pressed anywhere on the page, unless the learner is typing in a field or a dialog
 * is open. For the search field of a page (Topics, the Playground).
 */
export function useSlashFocus(ref: { current: HTMLElement | null }): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      if (typingInto(e.target) || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const el = ref.current;
      if (!el) return;
      e.preventDefault();
      el.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ref]);
}

/**
 * The search field of a page, with a magnifier and the "/" key that focuses it from anywhere on the page. `label`
 * names it for a screen reader and is its placeholder.
 */
export function SearchField({
  value,
  onChange,
  label,
  testId,
  className,
}: {
  value: string;
  onChange(value: string): void;
  label: string;
  testId?: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useSlashFocus(ref);
  return (
    <div className={['relative flex min-w-0 items-center', className].filter(Boolean).join(' ')}>
      <span aria-hidden="true" className="pointer-events-none absolute left-3 text-muted">
        <MagnifierIcon />
      </span>
      <input
        ref={ref}
        type="search"
        value={value}
        aria-label={label}
        placeholder={label}
        aria-keyshortcuts="/"
        data-testid={testId}
        autoComplete="off"
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value !== '') {
            e.preventDefault();
            onChange('');
          }
        }}
        className="min-h-11 w-full min-w-0 rounded-control border border-edge-deep bg-surface pl-10 pr-10 text-base placeholder:text-muted focus:border-primary"
      />
      <kbd aria-hidden="true" className="pointer-events-none absolute right-3 rounded-md border border-edge-deep bg-sunken px-1.5 text-xs font-bold text-muted">
        /
      </kbd>
    </div>
  );
}

export function MagnifierIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
