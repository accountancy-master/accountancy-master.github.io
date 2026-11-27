import { parseRef, refText, shiftRef, type Area, areaOf, type Ref } from './address';

// ---------------------------------------------------------------------------------------------------------------
// A formula as a spreadsheet reads it: the text after "=", cut into tokens and parsed into a tree with the
// spreadsheet's order of working (Excel's and LibreOffice's): brackets first; a minus sign before a value; per cent;
// ^; * and /; + and -; & (joining text); and last the comparisons = <> < > <= >=. Operators of the same rank are
// worked left to right (so 2^3^2 is 64, as a spreadsheet gives it). No `eval`: the tree is worked out by
// evaluate.ts. A formula that cannot be read is refused with the reason, as a spreadsheet refuses it.
// ---------------------------------------------------------------------------------------------------------------

export type Op = '+' | '-' | '*' | '/' | '^' | '&' | '=' | '<>' | '<' | '>' | '<=' | '>=';

export type Token =
  | { t: 'num'; v: number; s: number; e: number }
  | { t: 'str'; v: string; s: number; e: number }
  | { t: 'ref'; ref: Ref; s: number; e: number }
  | { t: 'referr'; s: number; e: number }
  | { t: 'fn'; name: string; s: number; e: number }
  | { t: 'name'; name: string; s: number; e: number }
  | { t: 'op'; v: Op | '%'; s: number; e: number }
  | { t: '(' | ')' | ',' | ':'; s: number; e: number };

/** A part of a formula's tree, with where it stands in the formula's text (`s` to `e`). */
export type Node = (
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'ref'; ref: Ref }
  | { k: 'range'; from: Ref; to: Ref; area: Area }
  | { k: 'referr' }
  | { k: 'neg' | 'pos' | 'pct'; x: Node }
  | { k: 'bin'; op: Op; a: Node; b: Node }
  | { k: 'call'; name: string; args: Node[] }
  | { k: 'name'; name: string }
) & { s: number; e: number };

export type Parsed = { ok: true; node: Node; tokens: Token[]; text: string } | { ok: false; message: string; text: string };

/** How many arguments each function of the lab takes: the fewest and the most. */
export const FUNCTION_ARITY: Readonly<Record<string, readonly [number, number]>> = {
  SUM: [1, 30],
  AVERAGE: [1, 30],
  MAX: [1, 30],
  MIN: [1, 30],
  COUNT: [1, 30],
  ROUND: [2, 2],
  IF: [2, 3],
  SLN: [3, 3],
  DB: [4, 5],
  PMT: [3, 5],
  IPMT: [4, 6],
  PPMT: [4, 6],
};

export const FUNCTION_NAMES = Object.keys(FUNCTION_ARITY);

class FormulaProblem extends Error {}

const isDigit = (c: string) => c >= '0' && c <= '9';
const isLetter = (c: string) => /[A-Za-z_]/.test(c);

/** The tokens of the text after "=". Throws a FormulaProblem with the reason when the text cannot be read. */
function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === ' ') {
      i++;
      continue;
    }
    const s = i;
    if (isDigit(c) || (c === '.' && isDigit(text[i + 1] ?? ''))) {
      while (i < text.length && (isDigit(text[i]) || text[i] === '.')) i++;
      const raw = text.slice(s, i);
      if (!/^(\d+\.?\d*|\.\d+)$/.test(raw)) throw new FormulaProblem(`"${raw}" is not a number: a number has one decimal point at most.`);
      if (i < text.length && isLetter(text[i])) {
        let j = i;
        while (j < text.length && /[A-Za-z0-9]/.test(text[j])) j++;
        throw new FormulaProblem(`"${text.slice(s, j)}" is not a number or a cell: a cell is named column first, then row (B2, not 2B).`);
      }
      out.push({ t: 'num', v: Number(raw), s, e: i });
      continue;
    }
    if (c === '"') {
      let v = '';
      i++;
      for (;;) {
        if (i >= text.length) throw new FormulaProblem('A text in quotes is not closed: put a " at its end.');
        if (text[i] === '"') {
          if (text[i + 1] === '"') {
            v += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        v += text[i++];
      }
      out.push({ t: 'str', v, s, e: i });
      continue;
    }
    if (c === '#') {
      if (text.slice(i, i + 5).toUpperCase() === '#REF!') {
        i += 5;
        out.push({ t: 'referr', s, e: i });
        continue;
      }
      throw new FormulaProblem('A "#" can only stand in #REF!, the mark of a reference that has moved off the sheet.');
    }
    if (isLetter(c) || c === '$') {
      while (i < text.length && /[A-Za-z0-9_.$]/.test(text[i])) i++;
      const word = text.slice(s, i);
      let j = i;
      while (text[j] === ' ') j++;
      const ref = parseRef(word);
      if (ref) out.push({ t: 'ref', ref, s, e: i });
      else if (text[j] === '(' && /^[A-Za-z_][A-Za-z0-9_.]*$/.test(word)) out.push({ t: 'fn', name: word.toUpperCase(), s, e: i });
      else if (word.includes('$')) throw new FormulaProblem(`"${word}" is not a cell: a $ stands only before the column letters or the row number ($B$2).`);
      else out.push({ t: 'name', name: word, s, e: i });
      continue;
    }
    const two = text.slice(i, i + 2);
    if (two === '<>' || two === '<=' || two === '>=') {
      out.push({ t: 'op', v: two, s, e: i + 2 });
      i += 2;
      continue;
    }
    if ('+-*/^&=<>%'.includes(c)) {
      out.push({ t: 'op', v: c as Op | '%', s, e: i + 1 });
      i++;
      continue;
    }
    if (c === '×') throw new FormulaProblem('A spreadsheet multiplies with *, not ×.');
    if (c === '÷') throw new FormulaProblem('A spreadsheet divides with /, not ÷.');
    if ('(),:'.includes(c)) {
      out.push({ t: c as '(' | ')' | ',' | ':', s, e: i + 1 });
      i++;
      continue;
    }
    throw new FormulaProblem(`"${c}" has no meaning in a formula.`);
  }
  return out;
}

const COMPARE: readonly string[] = ['=', '<>', '<', '>', '<=', '>='];
const tokText = (text: string, t: Token) => text.slice(t.s, t.e);

/** Parses the text after "=" (`text`). */
function parseTokens(text: string, tokens: Token[]): Node {
  let p = 0;
  const peek = (): Token | undefined => tokens[p];
  const isOp = (t: Token | undefined, ...ops: string[]): boolean => t?.t === 'op' && ops.includes(t.v);
  const missingAfter = (t: Token) => new FormulaProblem(`Something is missing after "${tokText(text, t)}".`);

  const binary = (next: () => Node, ops: string[]) => (): Node => {
    let a = next();
    while (isOp(peek(), ...ops)) {
      const t = tokens[p++] as Extract<Token, { t: 'op' }>;
      if (!peek()) throw missingAfter(t);
      const b = next();
      a = { k: 'bin', op: t.v as Op, a, b, s: a.s, e: b.e };
    }
    return a;
  };

  const primary = (): Node => {
    const t = peek();
    if (!t) throw new FormulaProblem('The formula stops too soon: a value is missing at its end.');
    p++;
    switch (t.t) {
      case 'num':
        return { k: 'num', v: t.v, s: t.s, e: t.e };
      case 'str':
        return { k: 'str', v: t.v, s: t.s, e: t.e };
      case 'referr':
        return { k: 'referr', s: t.s, e: t.e };
      case 'ref': {
        if (peek()?.t === ':') {
          p++;
          const end = peek();
          if (end?.t === 'referr') {
            p++;
            return { k: 'referr', s: t.s, e: end.e };
          }
          if (end?.t !== 'ref') throw new FormulaProblem(`A range needs a cell after the ":", as in ${tokText(text, t)}:B7.`);
          p++;
          return { k: 'range', from: t.ref, to: end.ref, area: areaOf(t.ref, end.ref), s: t.s, e: end.e };
        }
        return { k: 'ref', ref: t.ref, s: t.s, e: t.e };
      }
      case 'name': {
        const up = t.name.toUpperCase();
        if (up === 'TRUE' || up === 'FALSE') return { k: 'bool', v: up === 'TRUE', s: t.s, e: t.e };
        return { k: 'name', name: t.name, s: t.s, e: t.e };
      }
      case 'fn': {
        p++; // the "("
        const args: Node[] = [];
        if (peek()?.t === ')') {
          const close = tokens[p++];
          return checked({ k: 'call', name: t.name, args, s: t.s, e: close.e });
        }
        for (;;) {
          if (peek()?.t === ',' || peek()?.t === ')') throw new FormulaProblem(`An argument of ${t.name} is missing: two commas, or a comma and a bracket, stand together.`);
          args.push(compare());
          const sep = peek();
          if (!sep) throw new FormulaProblem(`The bracket of ${t.name}( is not closed: put a ")" after its last argument.`);
          p++;
          if (sep.t === ')') return checked({ k: 'call', name: t.name, args, s: t.s, e: sep.e });
          if (sep.t !== ',') throw new FormulaProblem(`The arguments of ${t.name} are separated by commas: "${tokText(text, sep)}" stands where a comma or ")" should.`);
        }
      }
      case '(': {
        if (peek()?.t === ')') throw new FormulaProblem('A pair of brackets holds nothing.');
        const inner = compare();
        const close = peek();
        if (close?.t !== ')') throw new FormulaProblem(close ? `"${tokText(text, close)}" stands where a ")" should close the bracket.` : 'A bracket is opened and not closed: put a ")" where it ends.');
        p++;
        return { ...inner, s: t.s, e: close.e };
      }
      case ')':
        throw new FormulaProblem('There is a ")" with no "(" before it.');
      case ',':
        throw new FormulaProblem('A comma separates the arguments of a function, inside its brackets: SUM(B2,B3).');
      case ':':
        throw new FormulaProblem('A ":" joins the two ends of a range: B3:B7.');
      case 'op':
        throw new FormulaProblem(`"${t.v}" stands where a value should.`);
    }
  };

  const percent = (): Node => {
    let x = primary();
    while (isOp(peek(), '%')) {
      const t = tokens[p++];
      x = { k: 'pct', x, s: x.s, e: t.e };
    }
    return x;
  };
  const unary = (): Node => {
    const t = peek();
    if (isOp(t, '-', '+')) {
      p++;
      if (!peek()) throw missingAfter(t!);
      const x = unary();
      return { k: (t as Extract<Token, { t: 'op' }>).v === '-' ? 'neg' : 'pos', x, s: t!.s, e: x.e };
    }
    return percent();
  };
  const power = binary(unary, ['^']);
  const product = binary(power, ['*', '/']);
  const sum = binary(product, ['+', '-']);
  const join = binary(sum, ['&']);
  const compare = binary(join, COMPARE as string[]);

  if (tokens.length === 0) throw new FormulaProblem('Nothing follows the "=": type what is to be worked out, such as =B2+B3.');
  const node = compare();
  const rest = peek();
  if (rest) {
    if (rest.t === ')') throw new FormulaProblem('There is a ")" with no "(" before it.');
    const before = tokens[p - 1];
    throw new FormulaProblem(`"${tokText(text, before)}" and "${tokText(text, rest)}" stand side by side: put a sign (+ - * /) or a comma between them.`);
  }
  return node;
}

/** A call of a function the lab knows is checked for its number of arguments, as a spreadsheet checks it. */
function checked(node: Extract<Node, { k: 'call' }>): Node {
  const arity = FUNCTION_ARITY[node.name];
  if (arity) {
    const [least, most] = arity;
    if (node.args.length < least) throw new FormulaProblem(`${node.name} needs ${least === most ? least : `at least ${least}`} argument${least === 1 ? '' : 's'}; it was given ${node.args.length}.`);
    if (node.args.length > most) throw new FormulaProblem(`${node.name} takes ${least === most ? '' : 'at most '}${most} argument${most === 1 ? '' : 's'}; it was given ${node.args.length}.`);
  }
  return node;
}

/** Parses a formula, with or without its "=". */
export function parseFormula(formula: string): Parsed {
  const text = formula.startsWith('=') ? formula.slice(1) : formula;
  try {
    const tokens = tokenize(text);
    return { ok: true, node: parseTokens(text, tokens), tokens, text };
  } catch (e) {
    if (e instanceof FormulaProblem) return { ok: false, message: e.message, text };
    throw e;
  }
}

/**
 * The formula as the spreadsheet keeps it once it is entered: cell names and function names in capitals ("=sum(b2:b5)"
 * is kept as "=SUM(B2:B5)"), everything else as typed. A formula that cannot be read is given back as it is.
 */
export function normalise(formula: string): string {
  const text = formula.startsWith('=') ? formula.slice(1) : formula;
  let tokens: Token[];
  try {
    tokens = tokenize(text);
  } catch {
    return formula;
  }
  let out = '';
  let at = 0;
  for (const t of tokens) {
    out += text.slice(at, t.s);
    const raw = text.slice(t.s, t.e);
    out += t.t === 'ref' || t.t === 'fn' || t.t === 'referr' || (t.t === 'name' && /^(true|false)$/i.test(raw)) ? raw.toUpperCase() : raw;
    at = t.e;
  }
  return `=${out}${text.slice(at)}`;
}

/** One reference of a formula: where it is in the text after "=", and what it names. */
export interface FormulaRef {
  s: number;
  e: number;
  /** As written: "$B$2", "B3:B7". */
  text: string;
  from: Ref;
  to: Ref;
  area: Area;
}

/** The references of a formula in the order they are written (a range is one), for colouring and for copying. */
export function refsOf(formula: string): FormulaRef[] {
  const text = formula.startsWith('=') ? formula.slice(1) : formula;
  let tokens: Token[];
  try {
    tokens = tokenize(text);
  } catch {
    return [];
  }
  const out: FormulaRef[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.t !== 'ref') continue;
    const colon = tokens[i + 1];
    const end = tokens[i + 2];
    if (colon?.t === ':' && end?.t === 'ref') {
      out.push({ s: t.s, e: end.e, text: text.slice(t.s, end.e), from: t.ref, to: end.ref, area: areaOf(t.ref, end.ref) });
      i += 2;
    } else out.push({ s: t.s, e: t.e, text: text.slice(t.s, t.e), from: t.ref, to: t.ref, area: areaOf(t.ref) });
  }
  return out;
}

/**
 * The formula copied `dc` columns across and `dr` rows down: every free part of every reference moves, the parts
 * fixed by $ stay. A reference (or a range) that would move off the sheet becomes #REF!, as a spreadsheet writes it.
 * Text that is not a formula is copied as it is.
 */
export function shiftFormula(formula: string, dc: number, dr: number): string {
  if (!formula.startsWith('=')) return formula;
  const text = formula.slice(1);
  let out = '';
  let at = 0;
  for (const r of refsOf(formula)) {
    out += text.slice(at, r.s);
    const a = shiftRef(r.from, dc, dr);
    const b = r.from === r.to ? a : shiftRef(r.to, dc, dr);
    out += a && b ? (r.from === r.to ? refText(a) : `${refText(a)}:${refText(b)}`) : '#REF!';
    at = r.e;
  }
  return `=${out}${text.slice(at)}`;
}

/** How one reference fared in a copy, for the words of a step. */
export interface RefMove {
  before: string;
  after: string;
  /** moved: relative, both parts moved; stayed: absolute (or not moved by this copy); part: a mixed reference; off: off the sheet. */
  how: 'moved' | 'stayed' | 'part' | 'off';
}

/** What a copy does to each reference of a formula. */
export function movesOf(formula: string, dc: number, dr: number): RefMove[] {
  return refsOf(formula).map((r) => {
    const a = shiftRef(r.from, dc, dr);
    const b = r.from === r.to ? a : shiftRef(r.to, dc, dr);
    if (!a || !b) return { before: r.text, after: '#REF!', how: 'off' };
    const after = r.from === r.to ? refText(a) : `${refText(a)}:${refText(b)}`;
    const ends = r.from === r.to ? [r.from] : [r.from, r.to];
    const fixedAll = ends.every((x) => (x.absCol || dc === 0) && (x.absRow || dr === 0));
    const freeAll = ends.every((x) => (!x.absCol || dc === 0) && (!x.absRow || dr === 0));
    return { before: r.text, after, how: after === r.text || fixedAll ? 'stayed' : freeAll ? 'moved' : 'part' };
  });
}
