'use client';

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { Hue } from '@/components/ui/hues';
import { addressOf, colLetters, inArea, type Area, type CellRef } from '@/simulator/spreadsheet/address';
import { isErr } from '@/simulator/spreadsheet/evaluate';
import { shownOf, type Cells, type Computed } from '@/simulator/spreadsheet/sheet';
import { Arrive } from '../kit/Arrive';

// ---------------------------------------------------------------------------------------------------------------
// The sheet as a table: column letters along the top, row numbers down the side, a cell where each meets. It is a
// grid for the keyboard (one cell takes Tab, the arrows move between cells, Shift and an arrow selects a block), and
// each cell says to a screen reader its name, what it shows and its formula. The cells a formula names are outlined
// in the colour of their reference, which the formula bar repeats in words; an error says its code, and its reason
// is read out with it. The grid scrolls sideways inside its card on a narrow screen.
// ---------------------------------------------------------------------------------------------------------------

/** The colours of the references of a formula, in the order they are written. */
export const REF_HUES: readonly Hue[] = ['blue', 'violet', 'rose', 'teal', 'orange', 'sky'];

/** The outline of a highlighted block, by edges: written out in full so that Tailwind finds every class. */
const HUE_VAR: Record<Hue, string> = {
  green: 'var(--color-hue-green)',
  teal: 'var(--color-hue-teal)',
  blue: 'var(--color-hue-blue)',
  violet: 'var(--color-hue-violet)',
  rose: 'var(--color-hue-rose)',
  amber: 'var(--color-hue-amber)',
  orange: 'var(--color-hue-orange)',
  sky: 'var(--color-hue-sky)',
};

export interface Highlight {
  area: Area;
  hue: Hue;
}

function outline(c: CellRef, highlights: readonly Highlight[]): string | undefined {
  const shadows: string[] = [];
  for (const h of highlights) {
    if (!inArea(h.area, c)) continue;
    const col = HUE_VAR[h.hue];
    if (c.row === h.area.top) shadows.push(`inset 0 3px 0 0 ${col}`);
    if (c.row === h.area.bottom) shadows.push(`inset 0 -3px 0 0 ${col}`);
    if (c.col === h.area.left) shadows.push(`inset 3px 0 0 0 ${col}`);
    if (c.col === h.area.right) shadows.push(`inset -3px 0 0 0 ${col}`);
  }
  return shadows.length > 0 ? shadows.join(', ') : undefined;
}

export interface GridProps {
  prefix: string;
  /** What the sheet is, for a screen reader. */
  label: string;
  cols: number;
  rows: number;
  /** Widths of the columns in rem, from A. */
  widths: readonly number[];
  cells: Cells;
  computed: ReadonlyMap<string, Computed>;
  /** Formulas shown in their cells instead of their values. */
  formulas?: boolean;
  active: CellRef | null;
  selection?: Area | null;
  highlights?: readonly Highlight[];
  /** Cells just written: they come in. */
  fresh?: readonly string[];
  /** Cells whose value is hidden ("?") until a question is answered. */
  hidden?: readonly string[];
  reduced: boolean;
  /** A cell chosen (by a tap, a click or the keyboard); with `extend`, the block from the active cell to it. */
  onPick?(c: CellRef, extend: boolean): void;
  /** Any other key on a cell (to start typing, to copy...): true when it was used. */
  onCellKey?(e: KeyboardEvent<HTMLElement>, c: CellRef): boolean;
  /** While a formula is being typed, a cell pressed is named in it: true when it was. */
  onPoint?(c: CellRef): boolean;
  /** Changes when the active cell should take the focus. */
  focusTick?: number;
}

export function Grid({ prefix, label, cols, rows, widths, cells, computed, formulas = false, active, selection, highlights = [], fresh = [], hidden = [], reduced, onPick, onCellKey, onPoint, focusTick }: GridProps) {
  const table = useRef<HTMLTableElement>(null);
  const activeAddr = active ? addressOf(active.col, active.row) : null;

  useEffect(() => {
    if (focusTick === undefined || focusTick === 0 || !activeAddr) return;
    table.current?.querySelector<HTMLElement>(`[data-cell="${activeAddr}"]`)?.focus();
  }, [focusTick, activeAddr]);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>, c: CellRef) => {
    const moves: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const m = moves[e.key];
    if (m && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      // From the far corner of a block when the block grows; otherwise from the active cell.
      const from = e.shiftKey && selection && active ? farCorner(selection, active) : c;
      const next = { col: Math.min(cols, Math.max(1, from.col + m[0])), row: Math.min(rows, Math.max(1, from.row + m[1])) };
      onPick?.(next, e.shiftKey);
      if (!e.shiftKey) table.current?.querySelector<HTMLElement>(`[data-cell="${addressOf(next.col, next.row)}"]`)?.focus();
      return;
    }
    if (e.key === 'Home' && !e.ctrlKey) {
      e.preventDefault();
      onPick?.({ col: 1, row: c.row }, e.shiftKey);
      table.current?.querySelector<HTMLElement>(`[data-cell="${addressOf(1, c.row)}"]`)?.focus();
      return;
    }
    if (onCellKey?.(e, c)) e.preventDefault();
  };

  const colHead = (n: number) => {
    const on = active?.col === n || (selection ? n >= selection.left && n <= selection.right : false);
    return (
      <th key={n} scope="col" style={{ minWidth: `${widths[n - 1] ?? 7}rem` }} className={`border border-edge px-1 py-0.5 text-center text-xs font-extrabold ${on ? 'bg-primary-soft text-primary-ink' : 'bg-sunken text-muted'}`}>
        {colLetters(n)}
      </th>
    );
  };

  const body: ReactNode[] = [];
  for (let r = 1; r <= rows; r++) {
    const rowOn = active?.row === r || (selection ? r >= selection.top && r <= selection.bottom : false);
    const tds: ReactNode[] = [];
    for (let c = 1; c <= cols; c++) {
      const at = { col: c, row: r };
      const addr = addressOf(c, r);
      const spec = cells[addr];
      const comp = computed.get(addr);
      const value = comp?.value ?? null;
      const isHidden = hidden.includes(addr);
      const shown = isHidden ? '?' : shownOf(cells, computed, addr);
      const formula = comp?.formula ?? (spec?.input.startsWith('=') ? spec.input : undefined);
      const showFormula = formulas && formula !== undefined && !isHidden;
      const err = !isHidden && isErr(value) ? value : null;
      const problem = comp?.problem;
      const isNumber = typeof value === 'number' && !showFormula && !isHidden;
      const look = spec?.look;
      const isActive = activeAddr === addr;
      const selected = selection ? inArea(selection, at) : isActive;
      const text = showFormula ? formula : shown;
      const spoken = `${addr}: ${isHidden ? 'hidden until you answer' : shown || 'empty'}${formula && !isHidden ? `, formula ${formula}` : ''}${err ? `. ${err.err}: ${err.reason}` : ''}${problem ? `. This formula cannot be read: ${problem}` : ''}`;
      const tone = isHidden
        ? 'text-accent-ink font-extrabold text-center'
        : err || problem
          ? 'text-danger-deep font-extrabold'
          : look === 'heading'
            ? 'font-extrabold text-ink text-xs sm:text-sm'
            : look === 'total'
              ? 'font-extrabold'
              : '';
      const fill = isHidden ? 'bg-accent-soft' : selected ? 'bg-primary-soft' : look === 'heading' ? 'bg-sunken' : 'bg-surface';
      const content = (
        <span className={`block ${isNumber || err ? 'whitespace-nowrap text-right tabular-nums' : showFormula ? 'whitespace-nowrap font-mono text-xs sm:text-sm' : 'whitespace-normal break-words'}`}>
          {err ? (
            <span aria-hidden="true" className="mr-0.5">
              ⚠
            </span>
          ) : null}
          {text}
        </span>
      );
      tds.push(
        <td
          key={c}
          role="gridcell"
          tabIndex={isActive ? 0 : -1}
          aria-selected={selected}
          aria-label={spoken}
          data-cell={addr}
          data-spot={`cell-${addr}`}
          data-testid={`${prefix}-cell-${addr}`}
          data-shown={isHidden ? '?' : shown}
          data-formula={formula ?? ''}
          onMouseDown={(e) => {
            if (onPoint?.(at)) e.preventDefault();
          }}
          onClick={(e) => onPick?.(at, e.shiftKey)}
          onKeyDown={(e) => onKeyDown(e, at)}
          style={{ boxShadow: outline(at, highlights) }}
          className={`relative h-11 select-none border border-edge px-2 py-1 align-middle text-sm outline-none ${look === 'total' ? 'border-t-2 border-t-edge-deep' : ''} ${fill} ${tone} ${isActive ? 'z-10 ring-2 ring-inset ring-primary focus-visible:ring-4 focus-visible:ring-focus' : 'focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-focus'} ${onPick ? 'cursor-cell' : ''}`}
        >
          {fresh.includes(addr) ? (
            <Arrive from="translateY(-8px) scale(0.92)" reduced={reduced} ms={600} className="block">
              {content}
            </Arrive>
          ) : (
            content
          )}
        </td>,
      );
    }
    body.push(
      <tr key={r}>
        <th scope="row" className={`w-9 border border-edge px-1 text-center text-xs font-extrabold ${rowOn ? 'bg-primary-soft text-primary-ink' : 'bg-sunken text-muted'}`}>
          {r}
        </th>
        {tds}
      </tr>,
    );
  }

  return (
    <div className="max-w-full overflow-x-auto rounded-control border border-edge-deep">
      <table ref={table} role="grid" aria-label={label} aria-rowcount={rows + 1} aria-colcount={cols + 1} data-testid={`${prefix}-grid`} className="border-collapse bg-surface">
        <thead>
          <tr>
            <th scope="col" className="w-9 border border-edge bg-sunken px-1 text-xs text-muted">
              <span className="sr-only">Row</span>
            </th>
            {Array.from({ length: cols }, (_, i) => colHead(i + 1))}
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </table>
    </div>
  );
}

/** The corner of a block away from the active cell: where Shift and an arrow grow it from. */
function farCorner(a: Area, active: CellRef): CellRef {
  return { col: active.col === a.left ? a.right : a.left, row: active.row === a.top ? a.bottom : a.top };
}
