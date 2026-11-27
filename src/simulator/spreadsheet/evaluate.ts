import { cellsOf, type Area } from './address';
import { FUNCTION_NAMES, type Node, type Op } from './formula';

// ---------------------------------------------------------------------------------------------------------------
// Working out a formula's tree, as Excel and LibreOffice do: an empty cell is nil in a sum and "" in a comparison; a
// function given a range takes the numbers in it and passes over text and empty cells; IF works out only the branch
// it chooses. A formula that cannot be worked out gives an error value with its reason: #DIV/0! (division by nil),
// #REF! (a reference off the sheet, or a circular reference: a cell that depends on itself), #NAME? (a name that is not a function, a cell or
// text in quotes), #VALUE! (text where a number is wanted, a range where one value is wanted) and #NUM! (an argument
// a function cannot take). Each function is checked against known values in the tests.
// ---------------------------------------------------------------------------------------------------------------

export type ErrCode = '#REF!' | '#DIV/0!' | '#NAME?' | '#VALUE!' | '#NUM!';

export interface ErrValue {
  err: ErrCode;
  /** Why, in a sentence. */
  reason: string;
  /** The cell where the error arose (another cell's error is passed on with its own reason). */
  at?: string;
}

/** What a cell holds once worked out; null is an empty cell. */
export type Value = number | string | boolean | ErrValue | null;

export const isErr = (v: unknown): v is ErrValue => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The value of a cell, worked out, given its column and row. */
export type CellGetter = (col: number, row: number) => Value;

export interface EvalContext {
  /** The text after "=", for naming the part of a formula that went wrong. */
  text: string;
  /** The cell the formula is in. */
  self: string;
  get: CellGetter;
}

const fail = (err: ErrCode, reason: string, ctx: EvalContext): ErrValue => ({ err, reason, at: ctx.self });
const src = (n: Node, ctx: EvalContext): string => ctx.text.slice(n.s, n.e).trim();

/** A number as text in a formula's words: up to ten significant figures, no grouping. */
export const plainNumber = (v: number): string => String(Number(v.toPrecision(10)));

/** A value turned to a number for arithmetic: empty is 0, TRUE is 1; text that is a number is read as one. */
function toNumber(v: Value, what: string, ctx: EvalContext): number | ErrValue {
  if (v === null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isErr(v)) return v;
  const t = v.trim().replace(/,/g, '');
  if (t !== '' && Number.isFinite(Number(t))) return Number(t);
  return fail('#VALUE!', `${what} is the text "${v}", and text cannot be worked out as a number.`, ctx);
}

const toText = (v: Exclude<Value, ErrValue>): string => (v === null ? '' : typeof v === 'number' ? plainNumber(v) : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : v);

function toBool(v: Value, what: string, ctx: EvalContext): boolean | ErrValue {
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (isErr(v)) return v;
  return fail('#VALUE!', `${what} is the text "${v}": IF needs a condition that is TRUE or FALSE, such as B2>=50000.`, ctx);
}

/** Excel's order for comparing: numbers, then text (any case), then TRUE and FALSE. Empty takes the type of the other side. */
function compareValues(a: Exclude<Value, ErrValue>, b: Exclude<Value, ErrValue>): number {
  const rank = (v: Exclude<Value, ErrValue>) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2);
  if (a === null && b === null) return 0;
  if (a === null) a = typeof b === 'number' ? 0 : typeof b === 'string' ? '' : false;
  if (b === null) b = typeof a === 'number' ? 0 : typeof a === 'string' ? '' : false;
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (typeof a === 'string') {
    const x = a.toLowerCase();
    const y = (b as string).toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }
  const x = Number(a);
  const y = Number(b);
  return x < y ? -1 : x > y ? 1 : 0;
}


function arithmetic(op: Op, a: number, b: number, n: Extract<Node, { k: 'bin' }>, ctx: EvalContext): Value {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      return b === 0 ? fail('#DIV/0!', `${src(n.b, ctx)} is nil (an empty cell counts as nil), and nothing can be divided by nil.`, ctx) : a / b;
    case '^': {
      if (a === 0 && b < 0) return fail('#DIV/0!', `0 raised to a negative power divides by nil.`, ctx);
      if (a === 0 && b === 0) return fail('#NUM!', '0 raised to the power 0 has no value in a spreadsheet.', ctx);
      const v = a ** b;
      return Number.isFinite(v) ? v : fail('#NUM!', `${src(n, ctx)} has no answer in numbers (a negative number raised to a fraction).`, ctx);
    }
    default:
      return null;
  }
}

/** Works out a part of a formula to one value. A reference to an empty cell gives null (nil in a sum). */
export function evalNode(n: Node, ctx: EvalContext): Value {
  switch (n.k) {
    case 'num':
      return n.v;
    case 'str':
      return n.v;
    case 'bool':
      return n.v;
    case 'ref':
      return ctx.get(n.ref.col, n.ref.row);
    case 'range':
      return fail('#VALUE!', `${src(n, ctx)} is a range of cells; a range can only be given to a function, as in SUM(${src(n, ctx)}).`, ctx);
    case 'referr':
      return fail('#REF!', 'The formula names a cell that is not on the sheet: a copy moved a reference above row 1 or left of column A.', ctx);
    case 'name':
      return fail('#NAME?', /^[A-Za-z]+$/.test(n.name) && FUNCTION_NAMES.includes(n.name.toUpperCase())
        ? `${n.name.toUpperCase()} is a function: give it its arguments in brackets, as in ${n.name.toUpperCase()}(B2:B5).`
        : `"${n.name}" is not a cell, a number or a function. Words that are to be shown as text go in quotes: "${n.name}".`, ctx);
    case 'neg':
    case 'pos':
    case 'pct': {
      const v = evalNode(n.x, ctx);
      const x = toNumber(v, src(n.x, ctx), ctx);
      if (isErr(x)) return x;
      return n.k === 'neg' ? -x : n.k === 'pct' ? x / 100 : x;
    }
    case 'bin': {
      const av = evalNode(n.a, ctx);
      if (isErr(av)) return av;
      const bv = evalNode(n.b, ctx);
      if (isErr(bv)) return bv;
      if (n.op === '&') return toText(av) + toText(bv);
      if (['=', '<>', '<', '>', '<=', '>='].includes(n.op)) {
        const c = compareValues(av, bv);
        switch (n.op) {
          case '=':
            return c === 0;
          case '<>':
            return c !== 0;
          case '<':
            return c < 0;
          case '>':
            return c > 0;
          case '<=':
            return c <= 0;
          default:
            return c >= 0;
        }
      }
      const a = toNumber(av, src(n.a, ctx), ctx);
      if (isErr(a)) return a;
      const b = toNumber(bv, src(n.b, ctx), ctx);
      if (isErr(b)) return b;
      return arithmetic(n.op, a, b, n, ctx);
    }
    case 'call':
      return callFunction(n, ctx);
  }
}

/** The numbers an argument gives: those in a reference or a range (text and empty cells passed over), or its value. */
function numbersOf(arg: Node, ctx: EvalContext, countOnly = false): number[] | ErrValue {
  if (arg.k === 'ref' || arg.k === 'range') {
    const area: Area = arg.k === 'ref' ? { top: arg.ref.row, left: arg.ref.col, bottom: arg.ref.row, right: arg.ref.col } : arg.area;
    const out: number[] = [];
    for (const c of cellsOf(area)) {
      const v = ctx.get(c.col, c.row);
      if (isErr(v)) {
        if (countOnly) continue;
        return v;
      }
      if (typeof v === 'number') out.push(v);
    }
    return out;
  }
  const v = evalNode(arg, ctx);
  if (countOnly) return typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) ? [Number(v)] : [];
  const x = toNumber(v, src(arg, ctx), ctx);
  return isErr(x) ? x : [x];
}

function allNumbers(args: Node[], ctx: EvalContext): number[] | ErrValue {
  const out: number[] = [];
  for (const a of args) {
    const xs = numbersOf(a, ctx);
    if (isErr(xs)) return xs;
    out.push(...xs);
  }
  return out;
}

/** One argument as a number. */
function numArg(args: Node[], i: number, ctx: EvalContext, fallback?: number): number | ErrValue {
  if (i >= args.length) return fallback ?? 0;
  const v = evalNode(args[i], ctx);
  return toNumber(v, src(args[i], ctx), ctx);
}

/** Rounds half away from nil to `digits` places (negative digits round to tens, hundreds...), as ROUND does. */
export function roundHalfAway(x: number, digits: number): number {
  const f = 10 ** digits;
  // The figure is first taken to 15 significant digits, so that 2.675 (stored as 2.67499999...) rounds to 2.68.
  const scaled = Number((Math.abs(x) * f).toPrecision(15));
  return (Math.sign(x) * Math.round(scaled)) / f;
}

/** The future value of a loan (FV), Excel's formula; `type` 1 for payments at the start of each period. */
function futureValue(rate: number, n: number, pmt: number, pv: number, type: number): number {
  if (rate === 0) return -(pv + pmt * n);
  const g = (1 + rate) ** n;
  return -(pv * g + (pmt * (1 + rate * type) * (g - 1)) / rate);
}

/** The equal payment of each period (PMT), Excel's formula. */
export function pmt(rate: number, n: number, pv: number, fv = 0, type = 0): number {
  if (rate === 0) return -(pv + fv) / n;
  const g = (1 + rate) ** n;
  return -(rate * (fv + pv * g)) / ((1 + rate * type) * (g - 1));
}

/** The interest part of payment `per` (IPMT), Excel's method: the rate on the balance at the start of the period. */
export function ipmt(rate: number, per: number, n: number, pv: number, fv = 0, type = 0): number {
  const p = pmt(rate, n, pv, fv, type);
  if (type === 1) {
    if (per === 1) return 0;
    return (futureValue(rate, per - 2, p, pv, 1) - p) * rate;
  }
  return futureValue(rate, per - 1, p, pv, 0) * rate;
}

/**
 * The fixed-declining-balance depreciation of a period (DB), as Excel and LibreOffice work it out: the rate is
 * 1 - (salvage ÷ cost)^(1 ÷ life) rounded to three decimal places; the first period is charged for `month` months
 * of 12, each later one on what is left of the cost, and a part year left over after the life (when `month` < 12)
 * takes the rest of a year's charge.
 */
export function db(cost: number, salvage: number, life: number, period: number, month = 12): number {
  const rate = dbRate(cost, salvage, life);
  let total = 0;
  let dep = 0;
  for (let p = 1; p <= period; p++) {
    if (p === 1) dep = (cost * rate * month) / 12;
    else if (p === life + 1) dep = ((cost - total) * rate * (12 - month)) / 12;
    else dep = (cost - total) * rate;
    total += dep;
  }
  return dep;
}

/** The rate DB charges: 1 - (salvage ÷ cost)^(1 ÷ life), rounded to three decimal places. */
export const dbRate = (cost: number, salvage: number, life: number): number => roundHalfAway(1 - (salvage / cost) ** (1 / life), 3);

/** The names of the lab's functions closest to a misspelt one ("SUMM" → SUM). */
export function nearestFunction(name: string): string | null {
  const up = name.toUpperCase();
  let best: string | null = null;
  let bestD = 3;
  for (const f of FUNCTION_NAMES) {
    const d = distance(up, f);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return bestD <= (up.length <= 3 ? 1 : 2) ? best : null;
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

function callFunction(n: Extract<Node, { k: 'call' }>, ctx: EvalContext): Value {
  const { name, args } = n;
  const nums = (...xs: (number | ErrValue)[]): number[] | ErrValue => {
    for (const x of xs) if (isErr(x)) return x;
    return xs as number[];
  };
  switch (name) {
    case 'SUM': {
      const xs = allNumbers(args, ctx);
      return isErr(xs) ? xs : xs.reduce((a, b) => a + b, 0);
    }
    case 'AVERAGE': {
      const xs = allNumbers(args, ctx);
      if (isErr(xs)) return xs;
      if (xs.length === 0) return fail('#DIV/0!', `AVERAGE found no numbers in ${args.map((a) => src(a, ctx)).join(', ')}, so it would divide by nil.`, ctx);
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    }
    case 'MAX':
    case 'MIN': {
      const xs = allNumbers(args, ctx);
      if (isErr(xs)) return xs;
      if (xs.length === 0) return 0;
      return name === 'MAX' ? Math.max(...xs) : Math.min(...xs);
    }
    case 'COUNT':
      return args.reduce((c, a) => {
        const xs = numbersOf(a, ctx, true);
        return c + (isErr(xs) ? 0 : xs.length);
      }, 0);
    case 'ROUND': {
      const v = nums(numArg(args, 0, ctx), numArg(args, 1, ctx));
      if (isErr(v)) return v;
      return roundHalfAway(v[0], Math.trunc(v[1]));
    }
    case 'IF': {
      const c = toBool(evalNode(args[0], ctx), src(args[0], ctx), ctx);
      if (isErr(c)) return c;
      if (c) return evalNode(args[1], ctx);
      return args.length > 2 ? evalNode(args[2], ctx) : false;
    }
    case 'SLN': {
      const v = nums(numArg(args, 0, ctx), numArg(args, 1, ctx), numArg(args, 2, ctx));
      if (isErr(v)) return v;
      const [cost, salvage, life] = v;
      if (life === 0) return fail('#DIV/0!', `The life, ${src(args[2], ctx)}, is nil: SLN divides by it.`, ctx);
      return (cost - salvage) / life;
    }
    case 'DB': {
      const v = nums(numArg(args, 0, ctx), numArg(args, 1, ctx), numArg(args, 2, ctx), numArg(args, 3, ctx), numArg(args, 4, ctx, 12));
      if (isErr(v)) return v;
      const [cost, salvage, life, rawPeriod, month] = v;
      const period = Math.trunc(rawPeriod);
      if (cost === 0) return fail('#DIV/0!', `The cost, ${src(args[0], ctx)}, is nil: DB divides the salvage value by it.`, ctx);
      if (cost < 0 || salvage < 0) return fail('#NUM!', 'DB needs a cost and a salvage value that are not below nil.', ctx);
      if (life <= 0) return fail('#NUM!', `The life, ${src(args[2], ctx)}, must be more than nil.`, ctx);
      if (month < 1 || month > 12) return fail('#NUM!', 'The months of the first year must be from 1 to 12.', ctx);
      if (period < 1 || period > life + (month < 12 ? 1 : 0)) return fail('#NUM!', `The period, ${src(args[3], ctx)}, must be a year of the life: from 1 to ${plainNumber(life + (month < 12 ? 1 : 0))}.`, ctx);
      return db(cost, salvage, life, period, month);
    }
    case 'PMT': {
      const v = nums(numArg(args, 0, ctx), numArg(args, 1, ctx), numArg(args, 2, ctx), numArg(args, 3, ctx), numArg(args, 4, ctx));
      if (isErr(v)) return v;
      const [rate, n, pv, fv, type] = v;
      if (n === 0) return fail('#NUM!', `The number of instalments, ${src(args[1], ctx)}, is nil.`, ctx);
      const r = pmt(rate, n, pv, fv, type === 0 ? 0 : 1);
      return Number.isFinite(r) ? r : fail('#NUM!', 'These terms give no instalment.', ctx);
    }
    case 'IPMT':
    case 'PPMT': {
      const v = nums(numArg(args, 0, ctx), numArg(args, 1, ctx), numArg(args, 2, ctx), numArg(args, 3, ctx), numArg(args, 4, ctx), numArg(args, 5, ctx));
      if (isErr(v)) return v;
      const [rate, per, n, pv, fv, type] = v;
      if (n <= 0 || per < 1 || per > n) return fail('#NUM!', `The instalment asked for, ${src(args[1], ctx)}, must be from 1 to the number of instalments, ${plainNumber(n)}.`, ctx);
      const t = type === 0 ? 0 : 1;
      const interest = ipmt(rate, per, n, pv, fv, t);
      const r = name === 'IPMT' ? interest : pmt(rate, n, pv, fv, t) - interest;
      return Number.isFinite(r) ? r : fail('#NUM!', 'These terms give no instalment.', ctx);
    }
    default: {
      const guess = nearestFunction(name);
      return fail('#NAME?', `There is no function called ${name}${guess ? `: did you mean ${guess}?` : `. The functions of this sheet are ${FUNCTION_NAMES.join(', ')}.`}`, ctx);
    }
  }
}
