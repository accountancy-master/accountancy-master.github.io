'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { KEEP_LINES } from './Prompt';

/** Where a sticky panel folds itself once the learner starts typing: a phone, where it would cover half the screen. */
export const FOLD_ON_TYPING_QUERY = '(max-width: 767px)';

/**
 * The case of a case-study question (the business, then its transactions or balances), shown above the prompt in a
 * marked panel that can be folded away and brought back. The text keeps its line breaks, lines its figures up and
 * wraps instead of scrolling sideways, like a list in a prompt; it is a size smaller on a phone, where a case of
 * fourteen lines would otherwise push the question off the screen.
 *
 * `sticky` is for a long answer (a format, a set of entries) that is worked from the panel: it then stays at the top
 * of the screen, under the bar of the player, while the page scrolls, so the text is within reach from any row, and a
 * long text scrolls inside it instead of covering the page. On a phone it folds itself to its one line the first time the
 * learner types an answer (anywhere outside it), so that the rows being typed have the screen; "Show" brings it back,
 * and it then stays open. Where its text scrolls inside it, a line under the text says there is more below.
 */
export function CasePanel({
  text,
  open,
  onToggle,
  note,
  label = 'Case',
  name = 'case',
  sticky = false,
}: {
  text: string;
  open: boolean;
  onToggle(): void;
  /** Shown beside the heading ("Question 2 of 6 in this case"). */
  note?: string;
  /** What the panel is headed. The data a format is prepared from is shown in the same panel, headed "Data". */
  label?: string;
  /** What the test ids of the panel start with. */
  name?: string;
  /** True while the panel is to stay on screen as the page scrolls (see above). */
  sticky?: boolean;
}) {
  const textId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const latest = useRef({ open, onToggle });
  useEffect(() => {
    latest.current = { open, onToggle };
  });
  // Fold once, on the first typing of the answer, on a phone. It is done after the input event has been handled: a
  // render in the middle of it would put the figure being typed back to what it was before the key.
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    if (!sticky || folded) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onInput = (e: Event) => {
      const target = e.target as Node | null;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
      if (sectionRef.current?.contains(target)) return;
      if (target instanceof HTMLInputElement && target.type === 'search') return;
      if (target.closest('[role="dialog"]') || timer !== undefined) return;
      timer = setTimeout(() => {
        setFolded(true);
        if (latest.current.open && window.matchMedia(FOLD_ON_TYPING_QUERY).matches) latest.current.onToggle();
      }, 0);
    };
    document.addEventListener('input', onInput, true);
    return () => {
      document.removeEventListener('input', onInput, true);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [sticky, folded]);
  // Whether the text scrolls inside the panel with more of it below what shows.
  const [moreBelow, setMoreBelow] = useState(false);
  useEffect(() => {
    const el = textRef.current;
    if (!sticky || !open || !el) {
      setMoreBelow(false);
      return;
    }
    const measure = () => setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 2);
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [sticky, open, text]);
  const panel = (
    <section
      ref={sectionRef}
      data-testid={name}
      data-open={open ? 'true' : 'false'}
      data-sticky={sticky ? 'true' : undefined}
      aria-label={label}
      className="min-w-0 rounded-card border-2 border-primary bg-primary-soft"
    >
      <button
        type="button"
        data-testid={`${name}-toggle`}
        aria-expanded={open}
        aria-controls={textId}
        onClick={onToggle}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-card px-3 py-2 text-left text-primary-ink"
      >
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-extrabold uppercase tracking-wide">{label}</span>
          {note ? (
            <span data-testid={`${name}-note`} className="text-sm font-bold">
              {note}
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-sm font-bold">
          {open ? 'Hide' : 'Show'}
          {label === 'Data' ? ' data' : ''}
          <span aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
            ▾
          </span>
        </span>
      </button>
      <p
        ref={textRef}
        id={textId}
        data-testid={`${name}-text`}
        hidden={!open}
        // A sticky panel scrolls its text inside it: it is then a named region that takes the focus, so the text can
        // be scrolled from the keyboard too.
        {...(sticky ? { tabIndex: 0, role: 'region', 'aria-label': `${label} text` } : {})}
        className={`${KEEP_LINES} border-t-2 border-primary/30 px-3 py-2 text-sm leading-relaxed text-ink sm:text-base ${sticky ? 'max-h-[26dvh] overflow-y-auto overscroll-contain' : ''}`}
      >
        {text}
      </p>
      {moreBelow ? (
        <button
          type="button"
          data-testid={`${name}-more`}
          onClick={() => textRef.current?.scrollBy({ top: textRef.current.clientHeight * 0.8 })}
          className="flex min-h-9 w-full items-center justify-center gap-1 border-t-2 border-primary/30 text-sm font-bold text-primary-ink"
        >
          More below <span aria-hidden="true">↓</span>
        </button>
      ) : null}
    </section>
  );
  // 3.875rem is the height of the bar of the player and of a mock paper, which is sticky above it.
  return sticky ? <div className="sticky top-[3.875rem] z-[5] bg-canvas py-1">{panel}</div> : panel;
}

/** The case panel where questions are listed (the Mistakes screen): folded until the reader opens it. */
export function FoldedCase({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return <CasePanel text={text} open={open} onToggle={() => setOpen((was) => !was)} />;
}

/**
 * The data a format is prepared from (the transactions or the balances), in the panel of a case, headed "Data". While
 * the format is being filled in (`sticky`) the panel stays at the top of the screen, under the bar of the player, so
 * the data is within reach from any row; it starts open and can be folded away. Where a format is only shown (after
 * checking, on the Mistakes screen, in a marked paper) it starts folded and scrolls with the page. A format that is
 * one question of a case study has no such panel: its data is the case, which the case panel shows (see `ownData`).
 */
export function DataPanel({ text, sticky = false }: { text: string; sticky?: boolean }) {
  const [open, setOpen] = useState(sticky);
  return <CasePanel text={text} open={open} onToggle={() => setOpen((was) => !was)} label="Data" name="data" sticky={sticky} />;
}
