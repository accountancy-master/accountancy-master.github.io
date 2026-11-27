'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled])';
export const DELETE_FAILED = "Couldn't delete this learner. Try again.";

/**
 * Asks the learner to type their name before their progress is removed from this device.
 * Focus starts in the name box, stays inside while open, and returns to the opener when the dialog closes.
 * `onConfirm` resolves when the learner is gone (the dialog is then unmounted by its owner) and rejects on failure.
 */
export function DeleteLearnerDialog({
  name,
  returnFocusTo,
  onConfirm,
  onClose,
}: {
  name: string;
  /** The element that gets focus back when the dialog closes (the delete button that opened it). */
  returnFocusTo(): HTMLElement | null;
  onConfirm(): Promise<void>;
  onClose(): void;
}) {
  const titleId = useId();
  const descId = useId();
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = typed.trim() === name;

  const returnRef = useRef(returnFocusTo);
  useEffect(() => {
    returnRef.current = returnFocusTo;
  });
  useEffect(() => {
    inputRef.current?.focus();
    return () => returnRef.current()?.focus();
  }, []);

  // After a failed deletion the box is usable again; put the cursor back in it.
  useEffect(() => {
    if (failed) inputRef.current?.focus();
  }, [failed]);

  // The page behind does not scroll while the dialog is open.
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

  // Escape and Tab work for the whole document while the dialog is open, wherever focus happens to be.
  // Nothing closes while the deletion is running.
  const closeRef = useRef(onClose);
  const deletingRef = useRef(deleting);
  useEffect(() => {
    closeRef.current = onClose;
    deletingRef.current = deleting;
  });
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (!deletingRef.current) closeRef.current();
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

  async function confirm() {
    if (!matches || deleting) return;
    setFailed(false);
    setDeleting(true);
    try {
      await onConfirm();
    } catch {
      setFailed(true);
      setDeleting(false);
    }
  }

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !deleting) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        data-testid="delete-dialog"
        className="flex max-h-full w-full max-w-md flex-col gap-4 overflow-y-auto rounded-card border-2 border-b-4 border-edge-deep bg-surface p-5 outline-none"
      >
        <h2 id={titleId} className="text-xl font-extrabold">
          Delete {name}?
        </h2>
        <div id={descId} className="flex flex-col gap-2 text-base">
          <p>
            All of this learner&apos;s progress on this device will be removed. This cannot be undone.
          </p>
          <p>Download a backup first if you may want it back.</p>
        </div>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
          className="flex flex-col gap-4"
        >
          <label className="flex flex-col gap-2 text-base font-bold">
            Type {name} to confirm
            <input
              ref={inputRef}
              type="text"
              data-testid="delete-confirm-input"
              value={typed}
              disabled={deleting}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(e) => {
                setTyped(e.target.value);
                if (failed) setFailed(false);
              }}
              className="min-h-12 w-full rounded-control border-2 border-edge-deep bg-surface px-4 text-base font-normal"
            />
          </label>
          {failed && (
            <p
              role="alert"
              data-testid="delete-error"
              className="rounded-control bg-danger-soft px-3 py-2 text-base font-semibold text-danger-deep"
            >
              {DELETE_FAILED}
            </p>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" data-testid="delete-cancel" disabled={deleting} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" data-testid="delete-confirm" disabled={!matches || deleting}>
              {deleting ? 'Deleting…' : 'Delete learner'}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
