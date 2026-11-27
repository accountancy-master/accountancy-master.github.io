// The stored mistake codes of the long questions, as far as anything outside the exercises needs to read them: kept
// apart from the exercise logic so that what reads them (the XP of the progress, on every page) stays small.

/** The code of a format that was not right starts with this: a letter for each expected row (see `formatCode`). */
export const FORMAT_CODE = 'rows:';
/** The letter of a row that was right, in the code of a format. */
export const ROW_RIGHT_LETTER = 'o';
/** The code of a set that was not right starts with this: a code for each entry, in order. */
export const SET_CODE = 'set:';
/** In the code of a set: an entry that was right, and one that was left empty. Any other is a journal mistake code. */
export const SET_ENTRY_RIGHT = 'ok';
export const SET_ENTRY_EMPTY = 'empty';

/**
 * The rows that earn the marks of a format: every expected row that is right, less one for every extra row (a row
 * that answers to nothing expected), never below none. A row with a wrong amount or on the wrong side is not an
 * extra row: it has already cost the row it was meant for.
 */
export const rowsCounted = (right: number, extra: number): number => Math.max(0, right - extra);

/**
 * How many parts of a long answer were right, read from its stored mistake code alone (no question needed): the rows
 * of a format that count (right rows less one for every extra row, see `rowsCounted`), or the entries of a set that
 * were right. Null for any other code. What partial XP is worked out from.
 */
export function partsOfCode(code: string | undefined): { right: number; total: number } | null {
  if (code?.startsWith(FORMAT_CODE)) {
    const [letters, places = ''] = code.slice(FORMAT_CODE.length).split(';');
    if (letters.length === 0) return null;
    const right = [...letters].filter((l) => l === ROW_RIGHT_LETTER).length;
    const extra = places === '' ? 0 : places.split('.').length;
    return { right: rowsCounted(right, extra), total: letters.length };
  }
  if (code?.startsWith(SET_CODE)) {
    const each = code.slice(SET_CODE.length).split(',');
    return { right: each.filter((c) => c === SET_ENTRY_RIGHT).length, total: each.length };
  }
  return null;
}
