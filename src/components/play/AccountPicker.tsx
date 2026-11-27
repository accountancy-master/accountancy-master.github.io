'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface AccountOption {
  id: string;
  label: string;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled])';

/**
 * Chooses one account. A bottom sheet on phones and a centred dialog on wide screens.
 * Focus starts in the search box, stays inside while open, and returns to whatever opened it on close.
 */
export function AccountPicker({
  options,
  selectedId,
  title,
  returnFocusTo,
  onChoose,
  onClose,
  what = 'account',
}: {
  options: AccountOption[];
  selectedId: string;
  title: string;
  /** What one of the options is called, for the search box and the note when nothing matches: a format offers "particulars". */
  what?: string;
  /** The element that gets focus back when the picker closes (the account button that opened it). */
  returnFocusTo(): HTMLElement | null;
  onChoose(id: string): void;
  onClose(): void;
}) {
  const titleId = useId();
  const [query, setQuery] = useState('');
  const [viewport, setViewport] = useState<{ top: number; height: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus into the search box now; give focus back to the opener when the picker goes away.
  const returnRef = useRef(returnFocusTo);
  useEffect(() => {
    returnRef.current = returnFocusTo;
  });
  useEffect(() => {
    searchRef.current?.focus();
    return () => returnRef.current()?.focus();
  }, []);

  // The page behind does not scroll while the picker is open.
  useEffect(() => {
    const { overflow, paddingRight } = document.body.style;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
    };
  }, []);

  // Follow the visible area, so the on-screen keyboard does not cover the sheet.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setViewport({ top: vv.offsetTop, height: vv.height });
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  const needle = query.trim().toLowerCase();
  const shown = needle === '' ? options : options.filter((o) => o.label.toLowerCase().includes(needle));

  // Escape and Tab are handled for the whole document while the picker is open, so they work
  // wherever focus happens to be (for example after a click on the title or empty list area).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !dialog.contains(active) || active === dialog) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  return createPortal(
    <div
      data-testid="picker-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={viewport ? { top: viewport.top, height: viewport.height } : undefined}
      className="fixed inset-x-0 top-0 z-50 flex h-dvh items-end justify-center bg-ink/50 md:items-center md:p-6"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="picker"
        onClick={(e) => {
          // A click on text or padding must not leave focus on the page behind the dialog.
          if (!(e.target as HTMLElement).closest('button, input')) dialogRef.current?.focus();
        }}
        className="flex max-h-[85%] w-full flex-col outline-none rounded-t-card border-2 border-b-0 border-edge-deep bg-surface md:max-h-[34rem] md:max-w-md md:rounded-card md:border-b-2"
      >
        <div className="flex items-center gap-2 px-4 pt-3">
          <h2 id={titleId} className="flex-1 text-lg font-extrabold">
            {title}
          </h2>
          <button
            type="button"
            data-testid="picker-close"
            aria-label="Close"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted hover:bg-canvas"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="px-4 pb-3 pt-1">
          <input
            ref={searchRef}
            type="text"
            data-testid="picker-search"
            aria-label={what === 'account' ? 'Search accounts' : `Search ${what}`}
            placeholder={what === 'account' ? 'Search accounts' : `Search ${what}`}
            autoComplete="off"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && shown.length === 1) {
                e.preventDefault();
                onChoose(shown[0].id);
              }
            }}
            className="min-h-11 w-full rounded-control border-2 border-edge-deep bg-surface px-3 text-base"
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain border-t-2 border-edge px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {shown.length === 0 ? (
            <p data-testid="picker-empty" className="py-3 text-base font-bold text-muted">
              {what === 'account' ? 'No account matches your search.' : 'Nothing matches your search.'}
            </p>
          ) : (
            shown.map((o) => {
              const selected = o.id === selectedId;
              return (
                <button
                  key={o.id}
                  type="button"
                  data-testid={`picker-option-${o.id}`}
                  aria-pressed={selected}
                  onClick={() => onChoose(o.id)}
                  className={`flex min-h-12 w-full shrink-0 items-center justify-between gap-3 rounded-control border-2 px-4 py-2 text-left text-base font-bold ${
                    selected ? 'border-primary bg-primary-soft text-primary-ink' : 'border-edge bg-surface hover:bg-canvas'
                  }`}
                >
                  <span className="min-w-0">{o.label}</span>
                  {selected ? <span className="shrink-0 text-sm font-extrabold">Chosen</span> : null}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
