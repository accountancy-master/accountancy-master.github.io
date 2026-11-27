import { createRng, type Rng } from '@/engine/rng';
import { addressOf, parseAddress, parseArea, parseRef, refText, shiftRef } from './address';
import { isErr } from './evaluate';
import { refsOf, shiftFormula } from './formula';
import { cellsFrom, computeSheet, displayOf, paste, shownOf, type Cells, type CellSpec, type Format } from './sheet';
import { movement } from './workbooks';

// ---------------------------------------------------------------------------------------------------------------
// "Try it": quick questions asked on a small sheet. What value a formula gives; what a copied formula becomes; which
// formula gives a figure; which reference in a copied formula is wrong. Every figure is worked out by the lab's own
// evaluator, and every wrong answer offered is a slip a student makes, named. Nothing is recorded.
// ---------------------------------------------------------------------------------------------------------------

export const SHEET_ASK_KINDS = ['value', 'copy', 'which', 'wrong-ref'] as const;
export type SheetAskKind = (typeof SHEET_ASK_KINDS)[number];

export const SHEET_ASK_LABEL: Record<SheetAskKind, string> = {
  value: 'What the formula gives',
  copy: 'What a copied formula becomes',
  which: 'Which formula gives it',
  'wrong-ref': 'Spot the wrong reference',
};

export interface MiniSheet {
  cells: Cells;
  cols: number;
  rows: number;
  widths: number[];
}

export interface Option {
  id: string;
  text: string;
  /** Why it is wrong, and what it would give. */
  why?: string;
}

export type SheetAnswer =
  | { type: 'figure'; value: number; unit: 'rupee' | 'plain'; mistakes: { value: number; why: string }[] }
  | { type: 'choice'; options: Option[]; correct: string }
  /** A reference of a formula, tapped: `tokens` are the parts of the formula, the references among them by id. */
  | { type: 'token'; parts: ({ text: string } | { id: string; text: string })[]; correct: string; whys: Record<string, string> };

export interface SheetAsk {
  kind: SheetAskKind;
  prompt: string;
  /** The sheet the question is asked on. */
  sheet: MiniSheet;
  /** The sheet once the question is answered (the copied formula in place), when it is not the same. */
  after?: MiniSheet;
  /** The cell asked about. */
  focus: string;
  /** Its value is hidden ("?") until the question is answered. */
  hide: boolean;
  /** The sheet shows formulas instead of their values. */
  formulas: boolean;
  answer: SheetAnswer;
  /** The working, shown with the verdict. */
  reason: string;
}

const KIND_SALT: Record<SheetAskKind, number> = { value: 11, copy: 23, which: 37, 'wrong-ref': 53 };

/** The random figures of question `n` of a kind, from the visit's seed: the same seed asks the same questions. */
export const askRng = (seed: number, kind: SheetAskKind, n: number): Rng => createRng(seed * 7919 + KIND_SALT[kind] * 104729 + n * 31337 + 1);

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)];
const step = (rng: Rng, lo: number, hi: number, by: number) => lo + by * rng.int(0, Math.floor((hi - lo) / by));
const inr = (v: number) => displayOf(v, 'inr');

/** A small sheet: a column of labels, a column of figures, and room for the formula. */
function mini(entries: Record<string, string | CellSpec>, widths: number[]): MiniSheet {
  const cells = cellsFrom(entries);
  let cols = widths.length;
  let rows = 1;
  for (const a of Object.keys(cells)) {
    const c = parseAddress(a)!;
    cols = Math.max(cols, c.col);
    rows = Math.max(rows, c.row);
  }
  return { cells, cols, rows, widths: [...widths, ...Array(Math.max(0, cols - widths.length)).fill(8)] };
}

const lab = (input: string): CellSpec => ({ input, look: 'label' });
const head = (input: string): CellSpec => ({ input, look: 'heading' });
const money = (v: number): CellSpec => ({ input: String(v), format: 'inr' });
const fmt = (format: Format): CellSpec => ({ input: '', format });

/** The value of a formula put into a cell of a sheet. */
function valueIn(sheet: MiniSheet, at: string, formula: string): { value: number | null; shown: string } {
  const cells = { ...sheet.cells, [at]: { ...sheet.cells[at], input: formula } };
  const computed = computeSheet(cells);
  const v = computed.get(at)?.value ?? null;
  return { value: typeof v === 'number' ? v : null, shown: shownOf(cells, computed, at) };
}

/** Wrong figures, each named; those equal to the answer or to one another are dropped. */
function mistakes(answer: number, list: [number | null, string][]): { value: number; why: string }[] {
  const seen = [answer];
  const out: { value: number; why: string }[] = [];
  for (const [v, why] of list) {
    if (v === null || !Number.isFinite(v) || seen.some((s) => Math.abs(s - v) < 0.005)) continue;
    seen.push(v);
    out.push({ value: Math.round(v * 100) / 100, why });
  }
  return out;
}

/** Options in a shuffled order, with ids a, b, c, d; the first given is the right one. */
function options(rng: Rng, right: string, wrong: [string, string][], take = 3): { options: Option[]; correct: string } {
  const seen = new Set([right]);
  const kept: [string, string][] = [];
  for (const [t, why] of wrong) {
    if (seen.has(t)) continue;
    seen.add(t);
    kept.push([t, why]);
  }
  const all: { text: string; why?: string }[] = rng.shuffle([{ text: right }, ...kept.slice(0, take).map(([text, why]) => ({ text, why }))]);
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const opts = all.map((o, i) => ({ id: ids[i], ...o }));
  return { options: opts, correct: opts.find((o) => o.text === right)!.id };
}

// ---- What the formula gives ----

function valueAsk(rng: Rng): SheetAsk {
  const form = rng.int(0, 10);
  let sheet: MiniSheet;
  let formula: string;
  let unit: 'rupee' | 'plain' = 'rupee';
  let wrong: [string | number, string][] = [];
  let working: string;
  const at = 'C2';
  const ask = (s: MiniSheet, f: string) => valueIn(s, at, f);
  switch (form) {
    case 0: {
      const a = step(rng, 10000, 90000, 1000);
      const b = step(rng, 2000, 40000, 2000);
      sheet = mini({ A1: lab('Rent of the year'), B1: money(a), A2: lab('Repairs'), B2: money(b) }, [10, 8, 8]);
      formula = '=B1+B2/2';
      wrong = [['=(B1+B2)/2', 'Added first and then halved: a spreadsheet divides before it adds unless brackets say otherwise.'], ['=B1+B2', 'Left out the division by 2.']];
      working = `Division comes before addition: B2/2 = ${inr(b / 2)}; ${inr(a)} + ${inr(b / 2)} = ${inr(a + b / 2)}.`;
      break;
    }
    case 1: {
      const sales = step(rng, 60000, 900000, 10000);
      const rate = pick(rng, [2, 3, 4, 5, 6, 8, 10]);
      sheet = mini({ A1: lab('Sales of the month'), B1: money(sales), A2: lab('Rate of commission, per cent'), B2: String(rate) }, [12, 8, 8]);
      formula = '=B1*B2/100';
      wrong = [['=B1*B2', 'Left out the division by 100, so the rate was taken as a whole number of times.'], ['=B1+B1*B2/100', 'Added the commission to the sales.']];
      working = `${inr(sales)} × ${rate} ÷ 100 = ${inr((sales * rate) / 100)}.`;
      break;
    }
    case 2: {
      const limit = pick(rng, [25000, 50000, 75000, 100000]);
      const where = rng.int(0, 2);
      const order = where === 0 ? limit : where === 1 ? limit + step(rng, 1000, 40000, 1000) : limit - step(rng, 1000, Math.min(20000, limit / 2), 1000);
      const hi = pick(rng, [8, 10, 12]);
      const lo = pick(rng, [2, 4, 5]);
      sheet = mini({ A1: lab('Order value'), B1: money(order), A2: lab('Discount in C2') }, [10, 8, 8]);
      formula = `=IF(B1>=${limit},B1*${hi}/100,B1*${lo}/100)`;
      const meets = order >= limit;
      wrong = [[meets ? `=B1*${lo}/100` : `=B1*${hi}/100`, meets ? `Took the condition as false. ${order === limit ? 'The order equals the limit, and >= means "more than or equal to".' : 'The order is more than the limit.'}` : 'Took the condition as true: the order is below the limit.']];
      working = `Is ${inr(order)} >= ${inr(limit)}? ${meets ? 'Yes' : 'No'}. So C2 = ${inr(order)} × ${meets ? hi : lo} ÷ 100 = ${inr((order * (meets ? hi : lo)) / 100)}.`;
      break;
    }
    case 3: {
      const months = Array.from({ length: 4 }, () => step(rng, 40000, 300000, 5000));
      const returns = step(rng, 5000, 40000, 1000);
      sheet = mini({ A1: lab('Sales of April'), B1: money(months[0]), A2: lab('Sales of May'), B2: money(months[1]), A3: lab('Sales of June'), B3: money(months[2]), A4: lab('Sales of July'), B4: money(months[3]), A5: lab('Sales returns'), B5: money(returns) }, [10, 8, 8]);
      formula = '=SUM(B1:B4)-B5';
      wrong = [['=SUM(B1:B4)+B5', 'Took B5 into the total as well: the minus sign deducts it.'], ['=SUM(B1:B4)', 'Did not deduct the returns in B5.'], ['=SUM(B1:B3)-B5', 'Took B1:B4 as three cells and left out B4: a range takes both its ends.']];
      working = `SUM(B1:B4) = ${inr(months.reduce((x, y) => x + y, 0))}; less ${inr(returns)} = ${inr(months.reduce((x, y) => x + y, 0) - returns)}.`;
      break;
    }
    case 4: {
      const life = pick(rng, [4, 5, 8, 10]);
      const dep = step(rng, 5000, 90000, 1000);
      const salvage = step(rng, 2000, Math.min(50000, dep * life / 4), 2000);
      const cost = dep * life + salvage;
      sheet = mini({ A1: lab('Cost (₹)'), B1: money(cost), A2: lab('Salvage value (₹)'), B2: money(salvage), A3: lab('Life (years)'), B3: String(life) }, [10, 8, 8]);
      formula = '=SLN(B1,B2,B3)';
      wrong = [['=B1/B3', 'Ignored the salvage value: SLN takes it off the cost before dividing.'], ['=(B1+B2)/B3', 'Added the salvage value to the cost.'], ['=B1-B2', 'Did not divide by the life: that is the depreciation of the whole life.']];
      working = `SLN = (cost - salvage value) ÷ life = (${inr(cost)} - ${inr(salvage)}) ÷ ${life} = ${inr(dep)}.`;
      break;
    }
    case 5: {
      const [rate, life, unitCost] = pick(rng, [[20, 4, 10000], [25, 3, 6400], [30, 3, 10000], [40, 3, 10000], [50, 3, 8000], [50, 4, 16000]] as const);
      const cost = unitCost * rng.int(Math.ceil(100000 / unitCost), Math.floor(1500000 / unitCost));
      const salvage = Math.round(cost * (1 - rate / 100) ** life);
      const k = rng.int(2, life);
      const bv = cost * (1 - rate / 100) ** (k - 1);
      sheet = mini({ A1: lab('Cost (₹)'), B1: money(cost), A2: lab('Salvage value (₹)'), B2: money(salvage), A3: lab('Life (years)'), B3: String(life) }, [10, 8, 8]);
      formula = `=DB(B1,B2,B3,${k})`;
      wrong = [['=SLN(B1,B2,B3)', 'Gave the straight line charge: that is what SLN returns.'], [(cost * rate) / 100, 'Charged the rate on the cost: DB charges it on the book value at the start of the year.'], [bv, `Gave the book value at the start of year ${k}, without charging the rate on it.`]];
      working = `DB's rate = 1 - (${inr(salvage)} ÷ ${inr(cost)})^(1/${life}) = ${rate / 100}, that is ${rate}%. Book value at the start of year ${k} = ${inr(bv)}; × ${rate}% = ${inr((bv * rate) / 100)}.`;
      break;
    }
    case 6:
    case 7: {
      const [a, b, years, lo, hi, by] = pick(rng, [[1, 10, 2, 25, 300, 5], [1, 10, 3, 1, 6, 1], [1, 8, 2, 50, 600, 10], [1, 5, 2, 200, 3000, 20], [1, 5, 3, 5, 100, 5]] as const);
      const m = step(rng, lo, hi, by);
      const r = a / b;
      const loan = ((a + b) ** years - b ** years) * b ** years * m;
      const instalment = a * (a + b) ** years * b ** (years - 1) * m;
      sheet = mini({ A1: lab('Loan (₹)'), B1: money(loan), A2: lab('Rate a year'), B2: `${(100 * a) / b}%`, A3: lab('Yearly instalments'), B3: String(years) }, [10, 8, 8]);
      if (form === 6) {
        formula = '=PMT(B2,B3,-B1)';
        wrong = [[loan / years + loan * r, 'Divided the loan equally and added a full year of interest on the whole loan.'], [loan / years, 'Divided the loan by the number of instalments and left out the interest.'], [-instalment, 'Gave the instalment with a minus sign: the loan is entered as -B1 so that the instalment comes out positive.']];
        working = `Instalment = loan × r × (1 + r)^n ÷ ((1 + r)^n - 1) = ${inr(instalment)}, which repays ${inr(loan)} with interest in ${years} years.`;
      } else {
        const k = 2;
        let bal = loan;
        let interest = 0;
        for (let i = 1; i <= k; i++) {
          interest = bal * r;
          bal -= instalment - interest;
        }
        formula = `=IPMT(B2,${k},B3,-B1)`;
        wrong = [[loan * r, 'Charged interest on the whole loan: after the first instalment only part of it is left.'], [instalment - interest, 'Gave the principal part of the instalment (what PPMT gives), not its interest.'], [instalment, 'Gave the whole instalment.']];
        working = `Instalment ${inr(instalment)}. Year 1: interest ${inr(loan * r)}, principal ${inr(instalment - loan * r)}, balance ${inr(loan - (instalment - loan * r))}. Year 2: interest = ${inr(loan - (instalment - loan * r))} × ${(100 * a) / b}% = ${inr(interest)}.`;
      }
      break;
    }
    case 8: {
      const cash = step(rng, 20000, 90000, 500);
      const notPresented = step(rng, 1000, 15000, 500);
      const notCredited = step(rng, 1000, 20000, 500);
      const charges = step(rng, 100, 1500, 50);
      sheet = mini({ A1: lab('Balance as per cash book (Dr)'), B1: money(cash), A2: lab('Cheques issued but not yet presented'), B2: money(notPresented), A3: lab('Cheques deposited but not yet credited'), B3: money(notCredited), A4: lab('Bank charges in the pass book only'), B4: money(charges) }, [15, 8, 8]);
      formula = '=B1+B2-B3-B4';
      wrong = [['=SUM(B1:B4)', 'Added every item: the items that make the pass book lower are deducted.'], ['=B1-B2+B3+B4', 'Gave each item of difference the opposite sign: from a debit balance of the cash book, cheques not yet presented are added, and cheques not yet credited and bank charges deducted.']];
      working = `${inr(cash)} + ${inr(notPresented)} - ${inr(notCredited)} - ${inr(charges)} = ${inr(cash + notPresented - notCredited - charges)}: the balance as per pass book.`;
      break;
    }
    case 9: {
      const cl = step(rng, 80000, 400000, 10000);
      const ca = Math.round((cl * rng.int(120, 300)) / 100 / 1000) * 1000;
      const inv = Math.round((ca * rng.int(20, 50)) / 100 / 1000) * 1000;
      sheet = mini({ A1: lab('Current assets'), B1: money(ca), A2: lab('Inventories'), B2: money(inv), A3: lab('Current liabilities'), B3: money(cl) }, [11, 8, 8]);
      formula = '=ROUND((B1-B2)/B3,2)';
      unit = 'plain';
      wrong = [['=ROUND(B1-B2/B3,2)', 'Left out the brackets: only the inventories would be divided.'], ['=ROUND(B1/B3,2)', 'Left the inventories in: that is the current ratio.'], ['=ROUND(B3/(B1-B2),2)', 'Turned the ratio upside down.']];
      working = `Quick ratio = quick assets ÷ current liabilities; quick assets are current assets less inventories and prepaid expenses, and this sheet has no prepaid expenses: (${inr(ca)} - ${inr(inv)}) ÷ ${inr(cl)}, to two decimal places.`;
      break;
    }
    default: {
      // From two to five of the six invoices received, so that the count is not always the same.
      const received = rng.int(2, 5);
      const filled = rng.shuffle(Array.from({ length: 6 }, (_, i) => i < received));
      const entries: Record<string, string | CellSpec> = {};
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      filled.forEach((f, i) => {
        entries[`A${i + 1}`] = lab(`Invoice of ${days[i]}`);
        entries[`B${i + 1}`] = f ? money(step(rng, 500, 20000, 500)) : lab('not received');
      });
      sheet = mini(entries, [12, 9, 8]);
      formula = '=COUNT(B1:B6)';
      unit = 'plain';
      wrong = [[6, 'Counted every cell of the range: COUNT counts only the cells that hold numbers.'], ['=SUM(B1:B6)', 'Added the amounts: COUNT gives how many, not how much.']];
      working = `B1:B6 has 6 cells, of which ${filled.filter(Boolean).length} hold numbers; text such as "not received" is not counted.`;
      break;
    }
  }
  sheet = { ...sheet, cells: { ...sheet.cells, [at]: { input: formula, format: unit === 'rupee' ? 'inr' : undefined } }, cols: Math.max(sheet.cols, 3) };
  const right = ask(sheet, formula);
  if (right.value === null) throw new Error(`no figure for ${formula}`);
  const list: [number | null, string][] = wrong.map(([w, why]) => [typeof w === 'number' ? w : ask(sheet, w).value, why]);
  return {
    kind: 'value',
    prompt: `C2 holds ${formula}. What does C2 show?${unit === 'plain' ? '' : ' (In rupees.)'}`,
    sheet,
    focus: at,
    hide: true,
    formulas: false,
    answer: { type: 'figure', value: Math.round(right.value * 100) / 100, unit, mistakes: mistakes(right.value, list) },
    reason: `${working} C2 shows ${right.shown}.`,
  };
}

// ---- What a copied formula becomes ----

/** A reference moved as a student who makes the slip moves it. */
function slipFormula(formula: string, dc: number, dr: number, how: 'all' | 'swapped' | 'rows' | 'cols' | 'first' | 'end'): string {
  const text = formula.slice(1);
  let out = '';
  let at = 0;
  refsOf(formula).forEach((r, i) => {
    out += text.slice(at, r.s);
    const one = (x: typeof r.from, end: boolean): string => {
      // first: only the first reference moves; end: of a range, only its last end moves.
      const plain = how === 'first' ? i === 0 : how === 'end' ? end || r.from === r.to : true;
      const moveCol = how === 'all' ? true : how === 'swapped' ? x.absCol : how === 'rows' ? false : plain && !x.absCol;
      const moveRow = how === 'all' ? true : how === 'swapped' ? x.absRow : how === 'cols' ? false : plain && !x.absRow;
      const col = moveCol ? x.col + dc : x.col;
      const row = moveRow ? x.row + dr : x.row;
      return col < 1 || row < 1 ? '#REF!' : refText({ ...x, col, row });
    };
    out += r.from === r.to ? one(r.from, false) : `${one(r.from, false)}:${one(r.to, true)}`;
    at = r.e;
  });
  return `=${out}${text.slice(at)}`;
}

interface CopyCase {
  from: string;
  formula: string;
  /** Where it may be copied to: the moves allowed. */
  moves: (rng: Rng) => [dc: number, dr: number];
}

const COPY_CASES: CopyCase[] = [
  { from: 'D2', formula: '=B2*$C$1', moves: (rng) => [0, rng.int(1, 5)] },
  { from: 'B3', formula: '=$A3*B$2', moves: (rng) => [rng.int(1, 3), rng.int(1, 4)] },
  { from: 'C2', formula: '=SUM($B$2:B2)', moves: (rng) => [0, rng.int(1, 4)] },
  { from: 'D2', formula: '=B2*C1', moves: (rng) => [0, rng.int(1, 4)] },
  { from: 'B6', formula: '=SLN($B$1,$B$2,$B$3)', moves: (rng) => [0, rng.int(1, 3)] },
  { from: 'B8', formula: '=SUM(B3:B7)', moves: (rng) => [rng.int(1, 3), 0] },
  { from: 'D5', formula: '=B5-B4', moves: () => [0, -4] },
  { from: 'C3', formula: '=B3/$B$8*100', moves: (rng) => [0, rng.int(1, 4)] },
  { from: 'C7', formula: '=B7*$F$1', moves: (rng) => [rng.int(1, 2), rng.int(1, 3)] },
];

function copyAsk(rng: Rng): SheetAsk {
  const c = pick(rng, COPY_CASES);
  const [dc, dr] = c.moves(rng);
  const src = parseAddress(c.from)!;
  const to = addressOf(src.col + dc, src.row + dr);
  const right = shiftFormula(c.formula, dc, dr);
  const wrong: [string, string][] = [
    [c.formula, 'Copied the formula exactly as typed: a reference without a $ moves with the copy.'],
    [slipFormula(c.formula, dc, dr, 'all'), 'Moved the parts fixed by $ as well: a $ keeps the column letter or the row number right after it.'],
    [slipFormula(c.formula, dc, dr, 'swapped'), 'Read each $ the wrong way round, moving exactly the parts it fixes.'],
  ];
  if (dc !== 0 && dr !== 0) {
    wrong.push([slipFormula(c.formula, dc, dr, 'rows'), `Moved the rows but not the columns: the copy also moves ${movement(dc, 0)}.`]);
    wrong.push([slipFormula(c.formula, dc, dr, 'cols'), `Moved the columns but not the rows: the copy also moves ${movement(0, dr)}.`]);
  }
  wrong.push([shiftFormula(c.formula.replace(/\$/g, ''), dc, dr), 'Ignored the $ signs altogether: they keep the parts after them where they are.']);
  if (refsOf(c.formula).length > 1) wrong.push([slipFormula(c.formula, dc, dr, 'first'), 'Moved only the first reference: every reference without a $ moves with the copy.']);
  if (refsOf(c.formula).some((r) => r.from !== r.to)) wrong.push([slipFormula(c.formula, dc, dr, 'end'), 'Moved only the last end of the range: an end without a $ moves too.']);
  if (dc !== dr) wrong.push([shiftFormula(c.formula, dr, dc), `Moved the references ${movement(dr, dc)}: the copy goes ${movement(dc, dr)}.`]);
  if (right.includes('#REF!')) wrong.unshift([right.replace('#REF!', 'B0'), 'There is no row 0: a reference moved above row 1 is written #REF!, and the cell shows the #REF! error.']);
  const { options: opts, correct } = options(rng, right, wrong);
  const moves = refsOf(c.formula).map((r) => {
    const a = shiftRef(r.from, dc, dr);
    const b = r.from === r.to ? a : shiftRef(r.to, dc, dr);
    const after = !a || !b ? '#REF!' : r.from === r.to ? refText(a) : `${refText(a)}:${refText(b)}`;
    return after === r.text ? `${r.text} stays` : `${r.text} becomes ${after}`;
  });
  const cols = Math.max(src.col, src.col + dc, 3) + 1;
  const rows = Math.max(src.row, src.row + dr, 2) + 1;
  const sheet: MiniSheet = { cells: cellsFrom({ [c.from]: c.formula }), cols, rows, widths: Array(cols).fill(8) };
  return {
    kind: 'copy',
    prompt: `${c.from} holds ${c.formula}. It is copied to ${to}. What does ${to} hold?`,
    sheet,
    after: { ...sheet, cells: { ...sheet.cells, [to]: { input: right } } },
    focus: to,
    hide: true,
    formulas: true,
    answer: { type: 'choice', options: opts, correct },
    reason: `From ${c.from} to ${to} the copy moves ${movement(dc, dr)}. ${moves.join('; ')}. A $ fixes the column letter or the row number right after it; the rest moves.`,
  };
}

// ---- Which formula gives it ----

interface WhichCase {
  build(rng: Rng): { sheet: MiniSheet; at: string; what: string; right: string; wrong: [string, string][]; copyTo?: string; why: string };
}

const WHICH_CASES: WhichCase[] = [
  {
    build: (rng) => {
      const cl = step(rng, 80000, 400000, 10000);
      const ca = Math.round((cl * rng.int(120, 300)) / 100 / 1000) * 1000;
      const inv = Math.round((ca * rng.int(20, 45)) / 100 / 1000) * 1000;
      const pre = step(rng, 1000, 15000, 1000);
      return {
        sheet: mini({ A1: lab('Current assets'), B1: money(ca), A2: lab('Inventories'), B2: money(inv), A3: lab('Prepaid expenses'), B3: money(pre), A4: lab('Current liabilities'), B4: money(cl), A5: lab('Quick ratio') }, [12, 8]),
        at: 'B5',
        what: 'the quick ratio',
        right: '=(B1-B2-B3)/B4',
        wrong: [['=B1-B2-B3/B4', 'Left out the brackets: only the prepaid expenses would be divided.'], ['=(B1-B2)/B4', 'Left the prepaid expenses in the quick assets.'], ['=B1/B4', 'Left the inventories and prepaid expenses in: that is the current ratio.'], ['=B4/(B1-B2-B3)', 'Turned the ratio upside down.']],
        why: 'Quick ratio = (current assets - inventories - prepaid expenses) ÷ current liabilities, the quick assets in brackets.',
      };
    },
  },
  {
    build: (rng) => {
      const open = step(rng, 40000, 200000, 5000);
      const close = step(rng, 40000, 200000, 5000);
      const cost = Math.round(((open + close) / 2) * rng.int(3, 8));
      return {
        sheet: mini({ A1: lab('Cost of revenue from operations'), B1: money(cost), A2: lab('Opening inventory'), B2: money(open), A3: lab('Closing inventory'), B3: money(close), A4: lab('Inventory turnover') }, [14, 8]),
        at: 'B4',
        what: 'the inventory turnover ratio',
        right: '=B1/((B2+B3)/2)',
        wrong: [['=B1/(B2+B3)/2', 'Divided by the sum of the inventories and then halved the result: a quarter of the ratio.'], ['=B1/B2+B3/2', 'Left out the brackets: the divisions are done before the addition.'], ['=B1/B3', 'Used the closing inventory alone instead of the average inventory.']],
        why: 'Inventory turnover ratio = cost of revenue from operations ÷ average inventory, and the average needs its own brackets.',
      };
    },
  },
  {
    build: (rng) => {
      const rev = step(rng, 200000, 1500000, 10000);
      const cost = Math.round((rev * rng.int(55, 85)) / 100 / 1000) * 1000;
      return {
        sheet: mini({ A1: lab('Revenue from operations'), B1: money(rev), A2: lab('Cost of revenue from operations'), B2: money(cost), A3: lab('Gross profit ratio (%)') }, [14, 8]),
        at: 'B3',
        what: 'the gross profit ratio in per cent',
        right: '=(B1-B2)/B1*100',
        wrong: [['=(B1-B2)/B2*100', 'Worked the gross profit on cost; the ratio is on revenue from operations.'], ['=B1-B2/B1*100', 'Left out the brackets: only the cost would be divided.'], ['=B2/B1*100', 'Gave the cost of revenue as a percentage of revenue, not the gross profit.']],
        why: 'Gross profit ratio = (revenue from operations - cost of revenue from operations) ÷ revenue from operations × 100.',
      };
    },
  },
  {
    build: (rng) => {
      const cash = step(rng, 20000, 90000, 500);
      return {
        sheet: mini({ A1: lab('Balance as per cash book (Dr)'), B1: money(cash), A2: lab('Cheques issued but not yet presented'), B2: money(step(rng, 1000, 15000, 500)), A3: lab('Cheques deposited but not yet credited'), B3: money(step(rng, 1000, 20000, 500)), A4: lab('Bank charges in the pass book only'), B4: money(step(rng, 100, 1500, 50)), A5: lab('Balance as per pass book'), B5: fmt('inr') }, [15, 8]),
        at: 'B5',
        what: 'the balance as per pass book',
        right: '=B1+B2-B3-B4',
        wrong: [['=B1-B2+B3+B4', 'Gave each item of difference the opposite sign: cheques not yet presented are added, the other two deducted.'], ['=SUM(B1:B4)', 'Added every item: those that make the pass book balance lower are deducted.'], ['=B1+B2-B3', 'Left out the bank charges, which only the pass book has.']],
        why: 'From a debit balance of the cash book: cheques issued but not yet presented are added; cheques deposited but not yet credited and bank charges are deducted.',
      };
    },
  },
  {
    build: (rng) => {
      const m = step(rng, 1, 6, 1);
      return {
        sheet: mini({ A1: lab('Loan (₹)'), B1: money(331000 * m), A2: lab('Rate a year'), B2: '10%', A3: lab('Yearly instalments'), B3: '3', A4: lab('Instalment'), B4: fmt('inr') }, [11, 8]),
        at: 'B4',
        what: 'the equal yearly instalment, as a positive figure',
        right: '=PMT(B2,B3,-B1)',
        wrong: [['=PMT(B2,B3,B1)', 'Entered the loan without the minus sign: the instalment comes out negative, as money paid.'], ['=PMT(B3,B2,-B1)', 'Put the arguments in the wrong order: PMT(rate, number of instalments, loan).'], ['=B1/B3', 'Divided the loan by the number of instalments and left out the interest.']],
        why: 'PMT(rate, number of instalments, -loan): the loan with a minus sign so that the instalment comes out positive.',
      };
    },
  },
  {
    build: (rng) => {
      const life = pick(rng, [4, 5, 8]);
      const dep = step(rng, 5000, 60000, 1000);
      const salvage = step(rng, 2000, 30000, 2000);
      return {
        sheet: mini({ A1: lab('Cost (₹)'), B1: money(dep * life + salvage), A2: lab('Salvage value (₹)'), B2: money(salvage), A3: lab('Life (years)'), B3: String(life), A4: lab('Depreciation a year'), B4: fmt('inr') }, [11, 8]),
        at: 'B4',
        what: "a year's depreciation by the straight line method",
        right: '=SLN(B1,B2,B3)',
        wrong: [['=SLN(B1,B3,B2)', 'Put the arguments in the wrong order: SLN(cost, salvage value, life).'], ['=B1/B3', 'Ignored the salvage value.'], ['=(B1-B2)*B3', 'Multiplied by the life instead of dividing by it.']],
        why: 'SLN(cost, salvage value, life) = (cost - salvage value) ÷ life.',
      };
    },
  },
  {
    build: (rng) => {
      const amounts = Array.from({ length: 5 }, () => step(rng, 10000, 150000, 1000));
      const heads = ['Salaries', 'Rent', 'Electricity', 'Advertisement', 'Repairs'];
      const entries: Record<string, string | CellSpec> = { A1: head('Head'), B1: head('Amount (₹)'), C1: head('Angle (°)') };
      heads.forEach((h, i) => {
        entries[`A${i + 2}`] = lab(h);
        entries[`B${i + 2}`] = money(amounts[i]);
      });
      entries.A7 = lab('Total');
      entries.B7 = { input: '=SUM(B2:B6)', format: 'inr' };
      return {
        sheet: mini(entries, [10, 8, 8]),
        at: 'C2',
        copyTo: 'C3:C6',
        what: 'the angle of each slice of a pie chart, typed once in C2 and copied down to C6',
        right: '=B2/$B$7*360',
        wrong: [['=B2/B7*360', 'Left the total relative: copied down it becomes B8, B9..., empty cells, and the copies show #DIV/0!.'], ['=$B$2/$B$7*360', 'Fixed the amount too: every slice would be the first head\'s.'], ['=B2/$B$7*100', 'Worked the share in per cent, not the angle in degrees: the whole circle is 360°.']],
        why: 'Each angle is the head\'s amount ÷ the total × 360°. The amount moves down with each head; the total, B7, must be fixed: $B$7.',
      };
    },
  },
  {
    build: (rng) => {
      const [rate, unit] = pick(rng, [[10, 1000], [20, 1000], [25, 6400], [40, 1000]] as const);
      const cost = unit * rng.int(Math.ceil(100000 / unit), Math.floor(1500000 / unit));
      return {
        sheet: mini({ A1: lab('Cost (₹)'), B1: money(cost), A2: lab('Rate of depreciation'), B2: `${rate}%`, A4: head('Book value at the start (₹)'), B4: head('Depreciation (₹)'), C4: head('Book value at the end (₹)'), A5: { input: '=B1', format: 'inr' }, C5: { input: '=A5-B5', format: 'inr' }, A6: { input: '=C5', format: 'inr' }, C6: { input: '=A6-B6', format: 'inr' }, A7: { input: '=C6', format: 'inr' }, C7: { input: '=A7-B7', format: 'inr' }, B5: fmt('inr') }, [10, 9, 10]),
        at: 'B5',
        copyTo: 'B6:B7',
        what: 'the depreciation of the year by the written down value method, typed in B5 and copied down to B7',
        right: '=A5*$B$2',
        wrong: [['=A5*B2', 'Left the rate relative: copied down it becomes B3, B4, cells that do not hold the rate.'], ['=$A$5*$B$2', 'Fixed the book value too: every year would be charged on the cost, a straight line charge.'], ['=A5*$B$2/100', `Divided by 100 again: B2 already holds a percentage, ${rate}% being ${rate / 100}.`]],
        why: 'Written down value: each year the rate is charged on the book value at the start of that year (A5, then A6, A7: relative), the rate being one cell for every year ($B$2: absolute).',
      };
    },
  },
];

function whichAsk(rng: Rng): SheetAsk {
  const c = pick(rng, WHICH_CASES).build(rng);
  const target = c.copyTo ? parseArea(c.copyTo)! : null;
  // What a formula gives: in its own cell, or for a formula to be copied, in the last cell it is copied to.
  const gives = (f: string): string => {
    const cells: Cells = { ...c.sheet.cells, [c.at]: { ...c.sheet.cells[c.at], input: f } };
    if (!target) return valueIn(c.sheet, c.at, f).shown;
    const pasted = paste(cells, parseArea(c.at)!, target);
    const last = addressOf(target.right, target.bottom);
    const computed = computeSheet(pasted);
    return `${shownOf(pasted, computed, last)} in ${last} (copied there as ${pasted[last].input})`;
  };
  const { options: opts, correct } = options(
    rng,
    c.right,
    c.wrong.map(([f, why]) => [f, `${why} It would give ${gives(f)}.`]),
  );
  const rightCells: Cells = { ...c.sheet.cells, [c.at]: { ...c.sheet.cells[c.at], input: c.right } };
  const afterCells = target ? paste(rightCells, parseArea(c.at)!, target) : rightCells;
  return {
    kind: 'which',
    prompt: `Which formula in ${c.at} gives ${c.what}?`,
    sheet: c.sheet,
    after: { ...c.sheet, cells: afterCells },
    focus: c.at,
    hide: true,
    formulas: false,
    answer: { type: 'choice', options: opts, correct },
    reason: `${c.why} ${c.right} gives ${gives(c.right)}.`,
  };
}

// ---- Spot the wrong reference ----

interface WrongCase {
  build(rng: Rng): { sheet: MiniSheet; source: string; copyTo: string; formula: string; wrong: string; fix: string; symptom: (show: (a: string) => string) => string; fine: string; whys: Record<string, string> };
}

const WRONG_CASES: WrongCase[] = [
  {
    build: (rng) => {
      const [rate, unit] = pick(rng, [[10, 1000], [20, 1000], [25, 6400], [40, 1000]] as const);
      const cost = unit * rng.int(Math.ceil(100000 / unit), Math.floor(1500000 / unit));
      return {
        sheet: mini({ A1: lab('Cost of the van (₹)'), B1: money(cost), A2: lab('Rate of depreciation'), B2: `${rate}%`, A4: head('Year'), B4: head('Book value at the start (₹)'), C4: head('Depreciation (₹)'), D4: head('Book value at the end (₹)'), A5: lab('2025-26'), A6: lab('2026-27'), A7: lab('2027-28'), B5: { input: '=B1', format: 'inr' }, C5: { input: '=B5*B2', format: 'inr' }, D5: { input: '=B5-C5', format: 'inr' }, B6: { input: '=D5', format: 'inr' }, B7: { input: '=D6', format: 'inr' } }, [9, 10, 9, 10]),
        source: 'C5',
        copyTo: 'C6:D7',
        formula: '=B5*B2',
        wrong: 'B2',
        fix: '=B5*$B$2',
        symptom: (show) => `The depreciation of 2026-27 and 2027-28 shows ${show('C6')} and ${show('C7')}.`,
        fine: 'B5',
        whys: { B5: 'B5 is the book value at the start of this year; it must move down with each year, to B6 and B7. It is right as it is.' },
      };
    },
  },
  {
    build: (rng) => {
      const heads = ['Salaries', 'Rent', 'Electricity', 'Advertisement', 'Repairs'];
      const entries: Record<string, string | CellSpec> = { A1: head('Head'), B1: head('Amount (₹)'), C1: head('Share (%)') };
      heads.forEach((h, i) => {
        entries[`A${i + 2}`] = lab(h);
        entries[`B${i + 2}`] = money(step(rng, 10000, 150000, 1000));
      });
      entries.A7 = lab('Total');
      entries.B7 = { input: '=SUM(B2:B6)', format: 'inr' };
      entries.C2 = '=ROUND(B2/B7*100,2)';
      return {
        sheet: mini(entries, [10, 8, 8]),
        source: 'C2',
        copyTo: 'C3:C6',
        formula: '=ROUND(B2/B7*100,2)',
        wrong: 'B7',
        fix: '=ROUND(B2/$B$7*100,2)',
        symptom: (show) => `The shares below the first show ${show('C3')}.`,
        fine: 'B2',
        whys: { B2: 'B2 is the first head\'s amount; each row must take its own head, so it moves down. It is right as it is.' },
      };
    },
  },
  {
    build: (rng) => {
      const m = step(rng, 1, 6, 1);
      return {
        sheet: mini({ A1: lab('Loan (₹)'), B1: money(331000 * m), A2: lab('Rate a year'), B2: '10%', A3: lab('Instalments'), B3: '3', A4: lab('Instalment (₹)'), B4: { input: '=PMT(B2,B3,-B1)', format: 'inr' }, A6: head('Year'), B6: head('Balance at the start (₹)'), C6: head('Interest (₹)'), D6: head('Principal (₹)'), E6: head('Balance at the end (₹)'), A7: '1', A8: '2', A9: '3', B7: { input: '=B1', format: 'inr' }, C7: { input: '=B7*$B$2', format: 'inr' }, D7: { input: '=B4-C7', format: 'inr' }, E7: { input: '=B7-D7', format: 'inr' }, B8: { input: '=E7', format: 'inr' }, B9: { input: '=E8', format: 'inr' } }, [10, 9, 8, 8, 9]),
        source: 'D7',
        copyTo: 'C8:E9',
        formula: '=B4-C7',
        wrong: 'B4',
        fix: '=$B$4-C7',
        symptom: (show) => `The principal repaid of years 2 and 3 shows ${show('D8')} and ${show('D9')}, and the loan is not repaid.`,
        fine: 'C7',
        whys: { C7: 'C7 is this year\'s interest; each year must take its own, so it moves down. It is right as it is.' },
      };
    },
  },
  {
    build: (rng) => {
      const [rate, unit] = pick(rng, [[20, 10000], [25, 25600], [30, 10000], [40, 10000], [50, 16000]] as const);
      const cost = unit * rng.int(Math.ceil(100000 / unit), Math.floor(1500000 / unit));
      return {
        sheet: mini({ A1: lab('Cost (₹)'), B1: money(cost), A2: lab('Salvage value (₹)'), B2: money(Math.round(cost * (1 - rate / 100) ** 4)), A3: lab('Life (years)'), B3: '4', A5: head('Year'), B5: head('Depreciation (₹)'), A6: '1', A7: '2', A8: '3', A9: '4' }, [9, 9]),
        source: 'B6',
        copyTo: 'B7:B9',
        formula: '=DB($B$1,$B$2,$B$3,$A$6)',
        wrong: '$A$6',
        fix: '=DB($B$1,$B$2,$B$3,A6)',
        symptom: (show) => `Every year shows the same depreciation, ${show('B9')}, though DB charges less each year.`,
        fine: '$B$1',
        whys: {
          $B$1: 'The cost is the same for every year: it is right to fix it with $.',
          $B$2: 'The salvage value is the same for every year: it is right to fix it with $.',
          $B$3: 'The life is the same for every year: it is right to fix it with $.',
        },
      };
    },
  },
  {
    build: (rng) => {
      const life = 4;
      const dep = step(rng, 10000, 60000, 500);
      const salvage = step(rng, 0, 40000, 1000);
      return {
        sheet: mini({ A1: lab('Cost (₹)'), B1: money(dep * life + salvage), A2: lab('Salvage value (₹)'), B2: money(salvage), A3: lab('Life (years)'), B3: '4', A5: head('Year'), B5: head('Depreciation (₹)'), A6: lab('2025-26'), A7: lab('2026-27'), A8: lab('2027-28'), A9: lab('2028-29') }, [9, 9]),
        source: 'B6',
        copyTo: 'B7:B9',
        formula: '=SLN($B$1,$B$2,B3)',
        wrong: 'B3',
        fix: '=SLN($B$1,$B$2,$B$3)',
        symptom: (show) => `The years after the first show ${show('B7')}, ${show('B8')} and ${show('B9')}.`,
        fine: '$B$1',
        whys: { $B$1: 'The cost is the same for every year: it is right to fix it with $.', $B$2: 'The salvage value is the same for every year: it is right to fix it with $.' },
      };
    },
  },
];

function wrongRefAsk(rng: Rng): SheetAsk {
  const c = pick(rng, WRONG_CASES).build(rng);
  const at = parseAddress(c.source)!;
  let cells: Cells = { ...c.sheet.cells, [c.source]: { ...(c.sheet.cells[c.source] ?? { format: 'inr' }), input: c.formula } };
  const target = parseArea(c.copyTo)!;
  // The row of the source (the source and the cells beside it that the copy covers) copied into the rows below.
  const block = { top: at.row, left: target.left, bottom: at.row, right: target.right };
  cells = paste(cells, block, target);
  const computed = computeSheet(cells);
  const show = (a: string) => shownOf(cells, computed, a);
  const refs = refsOf(c.formula);
  const parts: ({ text: string } | { id: string; text: string })[] = [];
  let pos = 0;
  const text = c.formula.slice(1);
  parts.push({ text: '=' });
  for (const r of refs) {
    if (r.s > pos) parts.push({ text: text.slice(pos, r.s) });
    parts.push({ id: r.text, text: r.text });
    pos = r.e;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos) });
  const fixedCells = paste({ ...cells, [c.source]: { ...cells[c.source], input: c.fix } }, block, target);
  const whys: Record<string, string> = {};
  for (const r of refs) if (r.text !== c.wrong) whys[r.text] = c.whys[r.text] ?? `${r.text} is right as it is.`;
  const sheet: MiniSheet = { ...c.sheet, cells, cols: Math.max(c.sheet.cols, target.right), rows: Math.max(c.sheet.rows, target.bottom) };
  const fixedShown = shownOf(fixedCells, computeSheet(fixedCells), addressOf(at.col, target.bottom));
  const wrongRef = parseRef(c.wrong)!;
  const wasMoved = !wrongRef.absCol && !wrongRef.absRow;
  return {
    kind: 'wrong-ref',
    prompt: `${c.source} holds ${c.formula}, copied down to row ${target.bottom}. ${c.symptom(show)} Which reference of the formula is wrong? Tap it.`,
    sheet,
    after: { ...sheet, cells: fixedCells },
    focus: c.source,
    hide: false,
    formulas: false,
    answer: { type: 'token', parts, correct: c.wrong, whys },
    reason: wasMoved
      ? `${c.wrong} is relative, so it moved with the copy (to ${refText(shiftRef(wrongRef, 0, 1)!)}, ${refText(shiftRef(wrongRef, 0, 2)!)}...), away from the one cell every row needs. Fixed as ${refText({ ...wrongRef, absCol: true, absRow: true })}, the formula is ${c.fix}, and ${addressOf(at.col, target.bottom)} shows ${fixedShown}.`
      : `${c.wrong} is fixed with $, so every copy names the same cell, ${c.wrong.replace(/\$/g, '')}, though each row needs its own. Left relative, the formula is ${c.fix}, and ${addressOf(at.col, target.bottom)} shows ${fixedShown}.`,
  };
}

/** A question of a kind, from its random figures. */
export function sheetAsk(kind: SheetAskKind, rng: Rng): SheetAsk {
  switch (kind) {
    case 'value':
      return valueAsk(rng);
    case 'copy':
      return copyAsk(rng);
    case 'which':
      return whichAsk(rng);
    case 'wrong-ref':
      return wrongRefAsk(rng);
  }
}

/** A figure as a student types it: "4,000", "₹ 4000", "-500", "2.25". Null when it is not one. */
export function parseFigure(text: string): number | null {
  const t = text.replace(/[₹,\s]/g, '');
  if (!/^-?(\d+(\.\d+)?|\.\d+)$/.test(t)) return null;
  return Number(t);
}

export interface SheetVerdict {
  right: boolean;
  why: string | null;
}

/** Marks a figure: right to the paisa (or to 0.01), and a known slip named. */
export function judgeFigure(answer: Extract<SheetAnswer, { type: 'figure' }>, typed: string): SheetVerdict {
  const v = parseFigure(typed);
  if (v === null) return { right: false, why: 'That is not a figure.' };
  if (Math.abs(v - answer.value) < 0.005) return { right: true, why: null };
  const known = answer.mistakes.find((m) => Math.abs(m.value - v) < 0.005);
  return { right: false, why: known ? known.why : `${answer.unit === 'rupee' ? displayOf(v, 'inr') : String(v)} is not it.` };
}

/** The right answer, in words. */
export function answerText(answer: SheetAnswer): string {
  if (answer.type === 'figure') return answer.unit === 'rupee' ? displayOf(answer.value, 'inr') : String(answer.value);
  if (answer.type === 'choice') return answer.options.find((o) => o.id === answer.correct)!.text;
  return answer.correct;
}

/** True when nothing on the sheet of a question shows an error, except where the question means it to. */
export function sheetErrors(s: MiniSheet): string[] {
  const computed = computeSheet(s.cells);
  return [...computed].filter(([, c]) => isErr(c.value)).map(([a]) => a);
}
