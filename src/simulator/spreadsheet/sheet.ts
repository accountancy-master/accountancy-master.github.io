import { formatINR } from '@/engine/money';
import { addressOf, cellsOf, parseAddress, type Area, type CellRef } from './address';
import { evalNode, isErr, plainNumber, type ErrValue, type Value } from './evaluate';
import { normalise, parseFormula, shiftFormula, type Parsed } from './formula';

// ---------------------------------------------------------------------------------------------------------------
// A sheet: what is typed in each cell (a number, text or a formula), how its value is shown, and the values worked
// out. Every formula is worked out again from the cells it names whenever the sheet changes, as a spreadsheet does.
// Copying a cell copies what was typed with its references moved (formula.ts), and its format.
// ---------------------------------------------------------------------------------------------------------------

/** How a number is shown: as typed (General), in rupees (₹1,20,000), with Indian grouping (1,20,000), or as a percentage. */
export type Format = 'general' | 'inr' | 'grouped' | 'percent';

/** How a cell looks, apart from its value: a heading of a column, a label of a row, a total. */
export type CellLook = 'heading' | 'label' | 'total';

export interface CellSpec {
  /** What is typed: "48000", "₹48,000", "10%", "Rent", "=SUM(B3:B7)". */
  input: string;
  format?: Format;
  look?: CellLook;
}

/** Cells by their names ("B2"); a cell not listed is empty. */
export type Cells = Readonly<Record<string, CellSpec>>;

export type Input = { type: 'empty' } | { type: 'formula'; formula: string } | { type: 'number'; value: number; format?: Format } | { type: 'text'; value: string };

/** What a typed entry is. A number may carry ₹, Indian or western commas, a minus sign or a % sign. */
export function readInput(raw: string): Input {
  const t = raw.trim();
  if (t === '') return { type: 'empty' };
  if (t.startsWith('=')) return { type: 'formula', formula: t };
  const m = /^([-+]?)\s*(₹?)\s*([-+]?)(\d{1,3}(?:,\d{2,3})*(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)\s*(%?)$/.exec(t);
  if (m && !(m[1] && m[3])) {
    const sign = m[1] === '-' || m[3] === '-' ? -1 : 1;
    const n = sign * Number(m[4].replace(/,/g, ''));
    if (m[5]) return { type: 'number', value: n / 100, format: 'percent' };
    if (m[2]) return { type: 'number', value: n, format: 'inr' };
    if (m[4].includes(',')) return { type: 'number', value: n, format: 'grouped' };
    return { type: 'number', value: n };
  }
  return { type: 'text', value: t };
}

/** A cell worked out. */
export interface Computed {
  value: Value;
  /** The formula, as kept, when the cell holds one. */
  formula?: string;
  /** Why a formula could not be read (it is then shown as typed, and is not worked out). */
  problem?: string;
}

/** The format a cell is shown in: its own, or the one its typed number implies. */
export function formatOf(spec: CellSpec | undefined): Format {
  if (!spec) return 'general';
  if (spec.format) return spec.format;
  const i = readInput(spec.input);
  return i.type === 'number' ? (i.format ?? 'general') : 'general';
}

const circular = (at: string): ErrValue => ({
  err: '#REF!',
  reason: `Circular reference: the formula in ${at} needs the value of ${at} itself, directly or through the cells it names, so it can never be worked out. Excel stops with a circular reference warning; this sheet marks the cell #REF! until the formula is put right.`,
  at,
});

/** Works out every cell of the sheet. */
export function computeSheet(cells: Cells): Map<string, Computed> {
  const out = new Map<string, Computed>();
  const parsed = new Map<string, Parsed>();
  const busy = new Set<string>();

  const valueOf = (addr: string): Value => {
    const done = out.get(addr);
    if (done) return done.value;
    const spec = cells[addr];
    if (!spec) return null;
    const input = readInput(spec.input);
    if (input.type === 'empty') return null;
    if (input.type === 'number' || input.type === 'text') {
      out.set(addr, { value: input.value });
      return input.value;
    }
    let p = parsed.get(addr);
    if (!p) {
      p = parseFormula(input.formula);
      parsed.set(addr, p);
    }
    if (!p.ok) {
      out.set(addr, { value: input.formula, formula: input.formula, problem: p.message });
      return input.formula;
    }
    if (busy.has(addr)) return circular(addr);
    busy.add(addr);
    const node = p.node;
    const text = p.text;
    let v = evalNode(node, { text, self: addr, get: (col, row) => valueOf(addressOf(col, row)) });
    busy.delete(addr);
    // A formula whose value is an empty cell shows 0, as a spreadsheet shows it.
    if (v === null) v = 0;
    if (typeof v === 'number' && !Number.isFinite(v)) v = { err: '#NUM!', reason: 'The figure is too large to be shown.', at: addr };
    out.set(addr, { value: v, formula: input.formula });
    return v;
  };

  for (const addr of Object.keys(cells)) valueOf(addr);
  return out;
}

/** Rupees as the sheet shows them: "₹1,20,000", "₹56,250.50", "-₹500". */
export function rupeesText(v: number): string {
  const p = Math.round(Math.abs(v) * 100);
  return `${v < 0 && p > 0 ? '-' : ''}${formatINR(p)}`;
}

/** A number in a format. */
export function numberText(v: number, format: Format): string {
  switch (format) {
    case 'inr':
      return rupeesText(v);
    case 'grouped':
      return rupeesText(v).replace('₹', '');
    case 'percent':
      return `${plainNumber(Math.round(v * 100 * 100) / 100)}%`;
    default:
      return plainNumber(v);
  }
}

/** What a cell shows: its value in its format, an error's code, or nothing. */
export function displayOf(value: Value, format: Format): string {
  if (value === null) return '';
  if (typeof value === 'number') return numberText(value, format);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (isErr(value)) return value.err;
  return value;
}

/** What a cell shows, from the sheet worked out. */
export function shownOf(cells: Cells, computed: ReadonlyMap<string, Computed>, addr: string): string {
  const c = computed.get(addr);
  return c ? displayOf(c.value, formatOf(cells[addr])) : '';
}

/** A cell typed into: a number, text, a formula (kept in capitals), or nothing (the cell emptied). Its format stays. */
export function typeInto(cells: Cells, addr: string, raw: string): Cells {
  const next: Record<string, CellSpec> = { ...cells };
  const input = readInput(raw);
  const old = cells[addr];
  if (input.type === 'empty') {
    if (old?.format || old?.look) next[addr] = { ...old, input: '' };
    else delete next[addr];
    return next;
  }
  const kept = input.type === 'formula' ? normalise(input.formula) : raw.trim();
  next[addr] = { ...old, input: kept, ...(input.type === 'number' && input.format && !old?.format ? { format: input.format } : {}) };
  return next;
}

/** A cell copied to another: what was typed (a formula with its references moved), with its format and look. */
export function copyCell(cells: Cells, from: CellRef, to: CellRef): CellSpec | undefined {
  const spec = cells[addressOf(from.col, from.row)];
  if (!spec) return undefined;
  return { ...spec, input: shiftFormula(spec.input, to.col - from.col, to.row - from.row) };
}

/**
 * A block pasted: a single cell into every cell of `target`; a block at the top left of `target` (filling `target`
 * with as many whole copies of the block as fit, as a spreadsheet does). What was typed is copied, with its
 * references moved; a cell that has a format of its own keeps it, and an empty cell takes the format copied.
 */
export function paste(cells: Cells, source: Area, target: Area): Cells {
  const next: Record<string, CellSpec> = { ...cells };
  const h = source.bottom - source.top + 1;
  const w = source.right - source.left + 1;
  const rowsTo = Math.max(h, Math.floor((target.bottom - target.top + 1) / h) * h);
  const colsTo = Math.max(w, Math.floor((target.right - target.left + 1) / w) * w);
  for (let dr = 0; dr < rowsTo; dr++) {
    for (let dc = 0; dc < colsTo; dc++) {
      const from = { col: source.left + (dc % w), row: source.top + (dr % h) };
      const to = { col: target.left + dc, row: target.top + dr };
      const addr = addressOf(to.col, to.row);
      const spec = copyCell(cells, from, to);
      const own = cells[addr];
      // A cell with a format of its own keeps it (the figures of a column stay in rupees); an empty one takes the copy's.
      if (own?.format || own?.look) next[addr] = { ...own, input: spec?.input ?? '' };
      else if (spec) next[addr] = spec;
      else delete next[addr];
    }
  }
  return next;
}

/** Fill down: the top row of the block copied into every row under it. */
export const fillDown = (cells: Cells, a: Area): Cells => (a.bottom > a.top ? paste(cells, { ...a, bottom: a.top }, { ...a, top: a.top + 1 }) : cells);
/** Fill right: the left column of the block copied into every column to its right. */
export const fillRight = (cells: Cells, a: Area): Cells => (a.right > a.left ? paste(cells, { ...a, right: a.left }, { ...a, left: a.left + 1 }) : cells);

/** Every cell of a block emptied (formats and looks stay). */
export function clearArea(cells: Cells, a: Area): Cells {
  let next = cells;
  for (const c of cellsOf(a)) next = typeInto(next, addressOf(c.col, c.row), '');
  return next;
}

/** The cells a set of names stands for, for tests and the ready workbooks: { B2: '48000' } → Cells. */
export function cellsFrom(entries: Record<string, string | CellSpec>): Cells {
  const out: Record<string, CellSpec> = {};
  for (const [addr, v] of Object.entries(entries)) {
    if (!parseAddress(addr)) throw new Error(`not a cell: ${addr}`);
    const spec = typeof v === 'string' ? { input: v } : v;
    const input = readInput(spec.input);
    out[addr] = input.type === 'formula' ? { ...spec, input: normalise(input.formula) } : spec;
  }
  return out;
}

/** A number worked out in a cell, for tests: NaN when it is not a number. */
export function numberIn(computed: ReadonlyMap<string, Computed>, addr: string): number {
  const v = computed.get(addr)?.value;
  return typeof v === 'number' ? v : NaN;
}
