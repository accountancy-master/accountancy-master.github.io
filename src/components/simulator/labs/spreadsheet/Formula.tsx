'use client';

import { useId, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import type { Hue } from '@/components/ui/hues';
import { addressOf, parseAddress, parseRef, type Area } from '@/simulator/spreadsheet/address';
import { isErr } from '@/simulator/spreadsheet/evaluate';
import { movesOf, refsOf, shiftFormula } from '@/simulator/spreadsheet/formula';
import { shownOf, type Cells, type Computed } from '@/simulator/spreadsheet/sheet';
import { REF_HUES, type Highlight } from './Grid';

// ---------------------------------------------------------------------------------------------------------------
// The formula bar (the cell's name, and what is typed in it, which can be edited there), the line under it that
// reads the cell (its formula with each reference in its colour, and what it gives, or the error and its reason),
// and the card that shows what a copy did to a formula: each reference that moved, and each that stayed.
// ---------------------------------------------------------------------------------------------------------------

const CHIP: Record<Hue, string> = {
  green: 'border-hue-green text-hue-green',
  teal: 'border-hue-teal text-hue-teal',
  blue: 'border-hue-blue text-hue-blue',
  violet: 'border-hue-violet text-hue-violet',
  rose: 'border-hue-rose text-hue-rose',
  amber: 'border-hue-amber text-hue-amber',
  orange: 'border-hue-orange text-hue-orange',
  sky: 'border-hue-sky text-hue-sky',
};

/** The cells a formula names, each in the colour of its place in the formula. */
export function highlightsOf(formula: string | undefined): Highlight[] {
  if (!formula?.startsWith('=')) return [];
  return refsOf(formula).map((r, i) => ({ area: r.area, hue: REF_HUES[i % REF_HUES.length] }));
}

/** A formula with each reference underlined in its colour (the colour the grid outlines its cells in). */
export function FormulaText({ formula, className = '' }: { formula: string; className?: string }) {
  if (!formula.startsWith('=')) return <span className={className}>{formula}</span>;
  const text = formula.slice(1);
  const refs = refsOf(formula);
  const parts: ReactNode[] = ['='];
  let at = 0;
  refs.forEach((r, i) => {
    if (r.s > at) parts.push(text.slice(at, r.s));
    parts.push(
      <span key={i} className={`rounded border-b-[3px] px-0.5 font-extrabold ${CHIP[REF_HUES[i % REF_HUES.length]]}`}>
        {r.text}
      </span>,
    );
    at = r.e;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <code className={`font-mono font-bold text-ink ${className}`}>{parts}</code>;
}

/** What the active cell holds and gives, in words: its formula and value, or its error and why. */
export function Reading({ prefix, addr, cells, computed }: { prefix: string; addr: string; cells: Cells; computed: ReadonlyMap<string, Computed> }) {
  const c = computed.get(addr);
  const spec = cells[addr];
  const shown = shownOf(cells, computed, addr);
  let body: ReactNode;
  if (c?.problem) {
    body = (
      <span className="text-danger-deep">
        <strong>This formula cannot be read.</strong> {c.problem}
      </span>
    );
  } else if (c && isErr(c.value)) {
    const from = c.value.at && c.value.at !== addr ? c.value.at : null;
    body = (
      <span>
        {c.formula ? (
          <>
            <FormulaText formula={c.formula} /> gives{' '}
          </>
        ) : null}
        <strong className="text-danger-deep">{c.value.err}</strong>
        {from ? <> because {from} shows it</> : null}: {c.value.reason}
      </span>
    );
  } else if (c?.formula) {
    const refs = refsOf(c.formula);
    body = (
      <span>
        <FormulaText formula={c.formula} /> gives <strong className="tabular-nums">{shown}</strong>
        {refs.length > 0 ? (
          <span className="text-muted">
            {' '}
            (from{' '}
            {refs.map((r, i) => {
              const single = parseAddress(r.text.replace(/\$/g, ''));
              return (
                <span key={i}>
                  {i > 0 ? (i === refs.length - 1 ? ' and ' : ', ') : ''}
                  {r.text}
                  {single ? ` = ${shownOf(cells, computed, r.text.replace(/\$/g, '')) || 'empty'}` : ''}
                </span>
              );
            })}
            )
          </span>
        ) : null}
      </span>
    );
  } else if (spec && spec.input.trim() !== '') {
    body = (
      <span>
        {typeof c?.value === 'number' ? 'A number' : 'Text'}: <strong>{shown}</strong>
        {typeof c?.value === 'number' ? <span className="text-muted"> (typed, not worked out)</span> : null}
      </span>
    );
  } else body = <span className="text-muted">Empty.</span>;
  return (
    <p data-testid={`${prefix}-reading`} className="min-h-6 text-sm">
      <span className="font-extrabold">{addr}: </span>
      {body}
    </p>
  );
}

/**
 * The name box and the formula bar. The bar shows what is typed in the active cell; where the sheet may be changed
 * it is where the cell is typed into (Enter keeps it, Escape leaves it as it was).
 */
export function FormulaBar({
  prefix,
  name,
  value,
  editable,
  inputRef,
  onChange,
  onFocus,
  onKey,
}: {
  prefix: string;
  /** The active cell, or the block selected ("B7", "C8:C10"). */
  name: string;
  value: string;
  editable: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  onChange?(v: string): void;
  onFocus?(): void;
  onKey?(e: KeyboardEvent<HTMLInputElement>): void;
}) {
  const id = useId();
  const cell = name.split(':')[0];
  return (
    <div className="flex min-w-0 items-stretch gap-2">
      <output data-testid={`${prefix}-name`} aria-label="Cell selected" className="flex min-h-11 w-20 shrink-0 items-center justify-center rounded-control border-2 border-edge-deep bg-sunken px-1 font-mono text-sm font-extrabold">
        {name}
      </output>
      <label htmlFor={id} className="flex min-w-0 flex-1 items-center rounded-control border-2 border-edge-deep bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-focus">
        <span aria-hidden="true" className="pl-2 pr-1 font-serif text-sm font-bold italic text-muted">
          fx
        </span>
        <span className="sr-only">{editable ? `Contents of ${cell}: type a number, words, or a formula starting with =` : `Contents of ${cell}`}</span>
        <input
          ref={inputRef}
          id={id}
          data-testid={`${prefix}-formula`}
          value={value}
          readOnly={!editable}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => onChange?.(e.target.value)}
          onFocus={onFocus}
          onKeyDown={onKey}
          className="min-h-11 w-full min-w-0 bg-transparent px-1 font-mono text-base text-ink outline-none read-only:text-ink"
        />
      </label>
    </div>
  );
}

/** The kind of a reference that moved, in words: relative, mixed, or a range with one end fixed. */
function movedKind(m: { before: string; how: string }): string {
  const ends = m.before.split(':').map((x) => parseRef(x));
  if (ends.length === 2 && ends[0] && ends[1] && (ends[0].absCol !== ends[1].absCol || ends[0].absRow !== ends[1].absRow)) return 'one end fixed by $, the other moves';
  if (!m.before.includes('$')) return 'relative';
  return m.how === 'part' ? 'mixed: the part after $ stays' : 'mixed: this copy moves only its free part';
}

/** What a copy did: the formula of the cell copied, and what it became in each cell it went to. */
export function CopyCard({ prefix, cells, from, to }: { prefix: string; cells: Cells; from: Area; to: Area }) {
  const lines: { source: string; target: string; formula: string; result: string; moves: ReturnType<typeof movesOf> }[] = [];
  for (let r = to.top; r <= to.bottom && lines.length < 6; r++) {
    for (let c = to.left; c <= to.right && lines.length < 6; c++) {
      const sc = from.left + ((c - to.left) % (from.right - from.left + 1));
      const sr = from.top + ((r - to.top) % (from.bottom - from.top + 1));
      const source = addressOf(sc, sr);
      const formula = cells[source]?.input ?? '';
      if (!formula.startsWith('=')) continue;
      const target = addressOf(c, r);
      lines.push({ source, target, formula, result: shiftFormula(formula, c - sc, r - sr), moves: movesOf(formula, c - sc, r - sr) });
    }
  }
  if (lines.length === 0) return null;
  return (
    <section data-testid={`${prefix}-copycard`} aria-label="What the copy did to the formulas" className="flex min-w-0 flex-col gap-2 rounded-card border border-edge bg-surface p-3 text-sm shadow-card">
      <h3 className="text-base font-extrabold">What the copy did</h3>
      <ul className="flex flex-col gap-2">
        {lines.map((l) => (
          <li key={l.target} className="flex min-w-0 flex-col gap-1 rounded-control bg-sunken px-3 py-2">
            <span className="break-words">
              <span className="font-extrabold">{l.source}</span> <FormulaText formula={l.formula} /> <span aria-label="copied to">→</span> <span className="font-extrabold">{l.target}</span>{' '}
              <FormulaText formula={l.result} />
            </span>
            <span className="flex flex-wrap gap-1">
              {l.moves.map((m, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold ${m.how === 'stayed' ? 'border-edge-deep bg-surface text-ink' : m.how === 'off' ? 'border-danger bg-danger-soft text-danger-deep' : 'border-primary bg-primary-soft text-primary-ink'}`}
                >
                  {m.how === 'stayed' ? (
                    <>
                      <span aria-hidden="true">📌</span> {m.before} stays
                    </>
                  ) : m.how === 'off' ? (
                    <>
                      <span aria-hidden="true">⚠</span> {m.before} goes off the sheet: #REF!
                    </>
                  ) : (
                    <>
                      <span aria-hidden="true">↘</span> {m.before} → {m.after} ({movedKind(m)})
                    </>
                  )}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
