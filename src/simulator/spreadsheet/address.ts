// ---------------------------------------------------------------------------------------------------------------
// Cells and references of a spreadsheet: a cell is named by its column letters and then its row number (B2). A
// reference in a formula may fix its column, its row or both with a $ ($B$2 absolute, $B2 and B$2 mixed, B2
// relative); when a formula is copied, every part not fixed moves by as many columns and rows as the copy moves.
// ---------------------------------------------------------------------------------------------------------------

/** The last column a reference may name (ZZ) and the last row: a sheet as large as the lab ever needs. */
export const LAST_COL = 26 * 27;
export const LAST_ROW = 9999;

export interface CellRef {
  /** 1 for column A. */
  col: number;
  /** 1 for row 1. */
  row: number;
}

export interface Ref extends CellRef {
  /** A $ before the column letters. */
  absCol: boolean;
  /** A $ before the row number. */
  absRow: boolean;
}

/** A block of cells, its corners included. */
export interface Area {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** 1 is "A", 27 is "AA". */
export function colLetters(n: number): string {
  let s = '';
  for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s;
  return s;
}

/** "A" is 1, "AA" is 27. */
export function colNumber(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export const addressOf = (col: number, row: number): string => `${colLetters(col)}${row}`;
export const addressOfRef = (r: CellRef): string => addressOf(r.col, r.row);

const REF = /^(\$?)([A-Za-z]{1,2})(\$?)(\d{1,4})$/;

/** A reference as it is written ("$B$2", "b2"), or null when it is not one, or names a cell off the sheet. */
export function parseRef(text: string): Ref | null {
  const m = REF.exec(text);
  if (!m) return null;
  const col = colNumber(m[2]);
  const row = Number(m[4]);
  if (col < 1 || col > LAST_COL || row < 1 || row > LAST_ROW) return null;
  return { col, row, absCol: m[1] === '$', absRow: m[3] === '$' };
}

/** A cell's own name ("B2"), without any $. */
export function parseAddress(text: string): CellRef | null {
  const r = parseRef(text);
  return r && !r.absCol && !r.absRow ? { col: r.col, row: r.row } : null;
}

/** A reference written out: "$B$2", "$B2", "B$2" or "B2". */
export const refText = (r: Ref): string => `${r.absCol ? '$' : ''}${colLetters(r.col)}${r.absRow ? '$' : ''}${r.row}`;

/**
 * The reference after a copy that moves `dc` columns and `dr` rows: its free parts move, its fixed parts stay. Null
 * when it would move off the sheet (above row 1 or left of column A): the spreadsheet writes #REF! there.
 */
export function shiftRef(r: Ref, dc: number, dr: number): Ref | null {
  const col = r.absCol ? r.col : r.col + dc;
  const row = r.absRow ? r.row : r.row + dr;
  if (col < 1 || row < 1 || col > LAST_COL || row > LAST_ROW) return null;
  return { ...r, col, row };
}

/** The block between two corners, whichever way round they are given. */
export const areaOf = (a: CellRef, b: CellRef = a): Area => ({
  top: Math.min(a.row, b.row),
  left: Math.min(a.col, b.col),
  bottom: Math.max(a.row, b.row),
  right: Math.max(a.col, b.col),
});

/** "B3:B7" or "B3" (a single cell), or null. */
export function parseArea(text: string): Area | null {
  const [a, b, more] = text.trim().split(':');
  if (more !== undefined) return null;
  const from = parseRef(a ?? '');
  const to = b === undefined ? from : parseRef(b);
  return from && to ? areaOf(from, to) : null;
}

/** "B3:B7", or "B3" for a single cell. */
export const areaText = (a: Area): string => {
  const from = addressOf(a.left, a.top);
  return a.top === a.bottom && a.left === a.right ? from : `${from}:${addressOf(a.right, a.bottom)}`;
};

/** Every cell of a block, row by row. */
export function cellsOf(a: Area): CellRef[] {
  const out: CellRef[] = [];
  for (let row = a.top; row <= a.bottom; row++) for (let col = a.left; col <= a.right; col++) out.push({ col, row });
  return out;
}

export const inArea = (a: Area, c: CellRef): boolean => c.row >= a.top && c.row <= a.bottom && c.col >= a.left && c.col <= a.right;

/** How many cells a block holds. */
export const areaSize = (a: Area): number => (a.bottom - a.top + 1) * (a.right - a.left + 1);
