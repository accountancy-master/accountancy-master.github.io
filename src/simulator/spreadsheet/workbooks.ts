import type { Rng } from '@/engine/rng';
import { addressOf, areaText, cellsOf, parseArea, type Area } from './address';
import { movesOf, shiftFormula } from './formula';
import { cellsFrom, computeSheet, paste, shownOf, typeInto, type CellLook, type Cells, type CellSpec, type Computed, type Format } from './sheet';

// ---------------------------------------------------------------------------------------------------------------
// The ready workbooks of the lab, the ones the syllabus names: a bank reconciliation statement, depreciation
// schedules (straight line with SLN; written down value with DB, and with a rate kept in a cell), a loan repayment
// schedule (PMT, interest, principal, balance), ratios from a balance sheet and a statement of profit and loss, and a
// chart of a range. Each is built step by step, as a student builds it: a formula typed into a cell, then copied
// down or across. The words of each step are written here; every figure in them is read off the sheet, in braces
// ("{B7}"), so that the words always agree with what the sheet shows.
// ---------------------------------------------------------------------------------------------------------------

export type ChartKind = 'bar' | 'pie';

export interface ChartSpec {
  kind: ChartKind;
  /** The cells of the names ("A2:A6") and of the figures ("B2:B6"). */
  labels: string;
  values: string;
  title: string;
}

export type BuildStep =
  | { kind: 'type'; cell: string; input: string; title: string; why: string }
  | { kind: 'copy'; from: string; to: string; title: string; why: string }
  | { kind: 'chart'; chart: ChartSpec; title: string; why: string };

export const WORKBOOK_IDS = ['brs', 'sln', 'db', 'wdv', 'loan', 'ratios', 'chart'] as const;
export type WorkbookId = (typeof WORKBOOK_IDS)[number];

export interface Workbook {
  id: WorkbookId | 'blank';
  /** Its name in the list of workbooks. */
  title: string;
  /** The heading of the sheet, as it would head the statement in an answer book. */
  heading: string;
  /** What it is, in a sentence or two. */
  about: string;
  cols: number;
  rows: number;
  /** The width of each column, in rem, from A. */
  widths: number[];
  /** What is on the sheet before the first step: headings, labels and the figures given. */
  given: Cells;
  steps: BuildStep[];
  /** The chart drawn at the end, if any. */
  chart?: ChartSpec;
}

/** Cells of a workbook, written briefly: a label, a heading, a total row's label, or a figure in a format. */
const label = (input: string): CellSpec => ({ input, look: 'label' });
const head = (input: string): CellSpec => ({ input, look: 'heading' });
const total = (input: string): CellSpec => ({ input, look: 'total' });
const money = (input: string | number, look?: CellLook): CellSpec => ({ input: String(input), format: 'inr', ...(look ? { look } : {}) });
const fmt = (format: Format, input = '', look?: CellLook): CellSpec => ({ input, format, ...(look ? { look } : {}) });

const BRS: Workbook = {
  id: 'brs',
  title: 'Bank reconciliation statement',
  heading: 'Bank Reconciliation Statement of Kavya Stores as on 31 March 2026',
  about: 'The cash book of Kavya Stores shows a debit balance of ₹48,000. Two items make the pass book balance higher (a cheque issued but not yet presented, interest credited by the bank), two make it lower (a cheque deposited but not yet credited, bank charges). The statement in the Plus and Minus columns finds the balance as per pass book.',
  cols: 3,
  rows: 9,
  widths: [17, 8, 8],
  given: cellsFrom({
    A1: head('Particulars'),
    B1: head('Plus (₹)'),
    C1: head('Minus (₹)'),
    A2: label('Balance as per cash book (Dr)'),
    B2: money(48000),
    A3: label('Cheques issued but not yet presented'),
    B3: money(7500),
    A4: label('Interest credited in the pass book only'),
    B4: money(600),
    A5: label('Cheques deposited but not yet credited'),
    C5: money(12000),
    A6: label('Bank charges debited in the pass book only'),
    C6: money(500),
    A7: total('Total'),
    B7: fmt('inr', '', 'total'),
    C7: fmt('inr', '', 'total'),
    A8: total('Balance as per pass book'),
    B8: fmt('inr', '', 'total'),
    A9: label('The pass book shows'),
  }),
  steps: [
    {
      kind: 'type',
      cell: 'B7',
      input: '=SUM(B2:B6)',
      title: 'Total the Plus column',
      why: 'SUM adds every number in the range B2:B6: the cash book balance and the two items that make the pass book balance higher. Empty cells add nothing. B7 shows {B7}.',
    },
    {
      kind: 'copy',
      from: 'B7',
      to: 'C7',
      title: 'Copy the total across to the Minus column',
      why: 'The Minus column needs the same total of its own column, so the formula is copied one column to the right instead of being typed again.',
    },
    {
      kind: 'type',
      cell: 'B8',
      input: '=B7-C7',
      title: 'The balance as per pass book',
      why: 'What the Plus column adds up to, less what the Minus column takes away: {B7} - {C7} = {B8}. Starting from a debit balance of the cash book, the items that the bank has not yet recorded or that only the bank has recorded are added or taken away until the pass book balance is reached.',
    },
    {
      kind: 'type',
      cell: 'B9',
      input: '=IF(B8>=0,"Credit balance","Overdraft")',
      title: 'Which way the balance lies',
      why: 'IF(condition, value if true, value if false): a balance of nil or more in the pass book is a credit balance (money the bank owes the firm); below nil it would be an overdraft. B9 shows "{B9}".',
    },
  ],
};

const SLN: Workbook = {
  id: 'sln',
  title: 'Depreciation: straight line (SLN)',
  heading: 'Depreciation schedule of a machine (straight line method)',
  about: 'A machine bought on 1 April 2025 for ₹1,60,000, with a salvage value of ₹10,000 at the end of a life of 4 years; the years end on 31 March. The schedule charges the same depreciation every year.',
  cols: 4,
  rows: 9,
  widths: [9, 9, 10, 11],
  given: cellsFrom({
    A1: label('Cost (₹)'),
    B1: money(160000),
    A2: label('Salvage value (₹)'),
    B2: money(10000),
    A3: label('Life (years)'),
    B3: '4',
    A5: head('Year'),
    B5: head('Depreciation (₹)'),
    C5: head('Accumulated depreciation (₹)'),
    D5: head('Book value at the end of the year (₹)'),
    A6: label('2025-26'),
    A7: label('2026-27'),
    A8: label('2027-28'),
    A9: label('2028-29'),
    ...Object.fromEntries(['B', 'C', 'D'].flatMap((c) => [6, 7, 8, 9].map((r) => [`${c}${r}`, fmt('inr')]))),
  }),
  steps: [
    {
      kind: 'type',
      cell: 'B6',
      input: '=SLN($B$1,$B$2,$B$3)',
      title: "The first year's depreciation",
      why: 'SLN(cost, salvage value, life) works out (cost - salvage value) ÷ life: ({B1} - {B2}) ÷ {B3} = {B6}. The cost, salvage value and life are written $B$1, $B$2 and $B$3, absolute, because every year uses the same three cells.',
    },
    {
      kind: 'copy',
      from: 'B6',
      to: 'B7:B9',
      title: 'Copy it down to every year',
      why: 'Straight line: the same charge every year.',
    },
    {
      kind: 'type',
      cell: 'C6',
      input: '=SUM($B$6:B6)',
      title: 'Accumulated depreciation so far',
      why: 'The depreciation charged up to the end of the year: a SUM from the first year, fixed as $B$6, to this year, B6, left free. C6 shows {C6}.',
    },
    {
      kind: 'copy',
      from: 'C6',
      to: 'C7:C9',
      title: 'Copy it down: the range grows',
      why: 'Each year the range takes in one year more.',
    },
    {
      kind: 'type',
      cell: 'D6',
      input: '=$B$1-C6',
      title: 'The book value at the end of the year',
      why: 'Cost less accumulated depreciation: {B1} - {C6} = {D6}. The cost is fixed with $; the accumulated depreciation is this row\'s.',
    },
    {
      kind: 'copy',
      from: 'D6',
      to: 'D7:D9',
      title: 'Copy it down: the book value falls to the salvage value',
      why: 'At the end of the life the book value is {D9}, the salvage value: the whole of cost less salvage value has been charged.',
    },
  ],
};

const DB: Workbook = {
  id: 'db',
  title: 'Depreciation: written down value (DB)',
  heading: 'Depreciation schedule of a machine (written down value method, by DB)',
  about: 'The same machine (cost ₹1,60,000, salvage value ₹10,000, life 4 years), depreciated at a fixed rate on its falling book value. The spreadsheet function DB works out the rate (rounded to three decimal places) that brings the book value down to the salvage value at the end of the life.',
  cols: 4,
  rows: 10,
  widths: [9, 10, 9, 11],
  given: cellsFrom({
    A1: label('Cost (₹)'),
    B1: money(160000),
    A2: label('Salvage value (₹)'),
    B2: money(10000),
    A3: label('Life (years)'),
    B3: '4',
    A4: label('Rate DB works out'),
    B4: fmt('percent'),
    A6: head('Year'),
    B6: head('Book value at the start of the year (₹)'),
    C6: head('Depreciation (₹)'),
    D6: head('Book value at the end of the year (₹)'),
    A7: '1',
    A8: '2',
    A9: '3',
    A10: '4',
    ...Object.fromEntries(['B', 'C', 'D'].flatMap((c) => [7, 8, 9, 10].map((r) => [`${c}${r}`, fmt('inr')]))),
  }),
  steps: [
    {
      kind: 'type',
      cell: 'B4',
      input: '=ROUND(1-(B2/B1)^(1/B3),3)',
      title: 'The rate DB charges',
      why: 'DB charges a fixed rate: 1 - (salvage value ÷ cost)^(1 ÷ life), rounded to three decimal places. ^ raises to a power, and the power 1/4 takes the fourth root: (10,000 ÷ 1,60,000)^(1/4) = 0.5, so the rate is {B4}.',
    },
    {
      kind: 'type',
      cell: 'B7',
      input: '=B1',
      title: 'The first year starts from the cost',
      why: 'B7 takes the cost from B1: {B7}.',
    },
    {
      kind: 'type',
      cell: 'C7',
      input: '=DB($B$1,$B$2,$B$3,A7)',
      title: "The first year's depreciation by DB",
      why: 'DB(cost, salvage value, life, year) gives the depreciation of the year named last, here the year in A7. Year 1: {B7} × {B4} = {C7}.',
    },
    {
      kind: 'type',
      cell: 'D7',
      input: '=B7-C7',
      title: 'The book value at the end of the year',
      why: 'The book value at the start less the depreciation: {B7} - {C7} = {D7}.',
    },
    {
      kind: 'type',
      cell: 'B8',
      input: '=D7',
      title: 'The next year starts where this one ended',
      why: 'The book value at the start of year 2 is the book value at the end of year 1: {B8}.',
    },
    {
      kind: 'copy',
      from: 'C7:D7',
      to: 'C8:D8',
      title: 'Copy the depreciation and the book value down a row',
      why: 'Year 2: DB charges the same rate on the lower book value, {B8} × {B4} = {C8}, leaving {D8}.',
    },
    {
      kind: 'copy',
      from: 'B8:D8',
      to: 'B9:D10',
      title: 'Copy the whole row down to the last year',
      why: 'The depreciation falls each year, {C9} and then {C10}, because the same rate is charged on a falling book value. At the end of the life the book value is {D10}, the salvage value: DB\'s rate was worked out for that.',
    },
  ],
};

const WDV: Workbook = {
  id: 'wdv',
  title: 'Depreciation: a rate in a cell',
  heading: 'Depreciation schedule of a delivery van (written down value method at 25%)',
  about: 'A delivery van bought on 1 April 2025 for ₹4,00,000 and depreciated at 25% a year on its written down value; the years end on 31 March. The rate is kept in one cell, B2, which every year\'s formula must name.',
  cols: 4,
  rows: 7,
  widths: [9, 10, 9, 11],
  given: cellsFrom({
    A1: label('Cost of the van (₹)'),
    B1: money(400000),
    A2: label('Rate of depreciation'),
    B2: '25%',
    A4: head('Year'),
    B4: head('Book value at the start of the year (₹)'),
    C4: head('Depreciation (₹)'),
    D4: head('Book value at the end of the year (₹)'),
    A5: label('2025-26'),
    A6: label('2026-27'),
    A7: label('2027-28'),
    ...Object.fromEntries(['B', 'C', 'D'].flatMap((c) => [5, 6, 7].map((r) => [`${c}${r}`, fmt('inr')]))),
  }),
  steps: [
    {
      kind: 'type',
      cell: 'B5',
      input: '=B1',
      title: 'The first year starts from the cost',
      why: 'B5 takes the cost from B1: {B5}.',
    },
    {
      kind: 'type',
      cell: 'C5',
      input: '=B5*$B$2',
      title: "The first year's depreciation",
      why: 'The book value at the start × the rate: {B5} × {B2} = {C5}. The rate is written $B$2, absolute: every year needs that one cell, so the reference must not move when the formula is copied down.',
    },
    {
      kind: 'type',
      cell: 'D5',
      input: '=B5-C5',
      title: 'The book value at the end of the year',
      why: '{B5} - {C5} = {D5}.',
    },
    {
      kind: 'type',
      cell: 'B6',
      input: '=D5',
      title: 'The next year starts where this one ended',
      why: 'The written down value carried to 2026-27: {B6}.',
    },
    {
      kind: 'copy',
      from: 'C5:D5',
      to: 'C6:D6',
      title: 'Copy the depreciation and the book value down a row',
      why: '2026-27: {B6} × {B2} = {C6}, leaving {D6}.',
    },
    {
      kind: 'copy',
      from: 'B6:D6',
      to: 'B7:D7',
      title: 'Copy the whole row down to the third year',
      why: '2027-28: {B7} × {B2} = {C7}, leaving {D7}. The charge falls every year because the rate is charged on the written down value, not the cost.',
    },
  ],
};

const LOAN: Workbook = {
  id: 'loan',
  title: 'Loan repayment schedule (PMT)',
  heading: 'Loan repayment schedule of Sagar Traders',
  about: 'Sagar Traders borrowed ₹3,31,000 on 1 April 2025 at 10% a year, to be repaid in 3 equal instalments at the end of each year. PMT gives the instalment; each year\'s interest is charged on the balance at the start of the year, and the rest of the instalment repays the loan.',
  cols: 5,
  rows: 10,
  widths: [11, 9, 8, 9, 9],
  given: cellsFrom({
    A1: label('Loan (₹)'),
    B1: money(331000),
    A2: label('Rate of interest a year'),
    B2: '10%',
    A3: label('Number of yearly instalments'),
    B3: '3',
    A4: label('Instalment (₹)'),
    B4: fmt('inr'),
    A6: head('Instalment'),
    B6: head('Balance at the start (₹)'),
    C6: head('Interest (₹)'),
    D6: head('Principal repaid (₹)'),
    E6: head('Balance at the end (₹)'),
    A7: '1',
    A8: '2',
    A9: '3',
    A10: total('Total'),
    ...Object.fromEntries(['B', 'C', 'D', 'E'].flatMap((c) => [7, 8, 9].map((r) => [`${c}${r}`, fmt('inr')]))),
    C10: fmt('inr', '', 'total'),
    D10: fmt('inr', '', 'total'),
  }),
  steps: [
    {
      kind: 'type',
      cell: 'B4',
      input: '=PMT(B2,B3,-B1)',
      title: 'The equal instalment',
      why: 'PMT(rate, number of instalments, loan) gives the equal instalment paid at the end of each year that repays the loan with its interest: loan × r × (1 + r)^n ÷ ((1 + r)^n - 1) = 3,31,000 × 0.1 × 1.331 ÷ 0.331 = {B4}. The loan is entered with a minus sign, -B1, so that the instalment comes out positive.',
    },
    { kind: 'type', cell: 'B7', input: '=B1', title: 'The first year starts with the whole loan', why: 'B7 takes the loan from B1: {B7}.' },
    {
      kind: 'type',
      cell: 'C7',
      input: '=B7*$B$2',
      title: "The first year's interest",
      why: 'Interest on the balance at the start of the year: {B7} × {B2} = {C7}. The rate is $B$2, absolute, for every year needs it.',
    },
    {
      kind: 'type',
      cell: 'D7',
      input: '=$B$4-C7',
      title: 'What the instalment repays of the loan',
      why: 'The instalment less the interest: {B4} - {C7} = {D7}. The instalment is $B$4, absolute, the same every year.',
    },
    { kind: 'type', cell: 'E7', input: '=B7-D7', title: 'The balance at the end of the year', why: 'Only the principal part reduces the loan: {B7} - {D7} = {E7}.' },
    { kind: 'type', cell: 'B8', input: '=E7', title: 'The next year starts with what is left', why: 'B8 takes the balance at the end of year 1: {B8}.' },
    {
      kind: 'copy',
      from: 'C7:E7',
      to: 'C8:E8',
      title: 'Copy interest, principal and balance down a row',
      why: 'Year 2: interest {C8} on the smaller balance, so more of the instalment, {D8}, repays the loan; {E8} is left.',
    },
    {
      kind: 'copy',
      from: 'B8:E8',
      to: 'B9:E9',
      title: 'Copy the whole row to the last year',
      why: 'Year 3: interest {C9}, principal {D9}, and the balance at the end is {E9}: the loan is repaid exactly. The interest falls and the principal repaid rises from year to year.',
    },
    { kind: 'type', cell: 'C10', input: '=SUM(C7:C9)', title: 'The total interest', why: 'The interest of the three years: {C10}.' },
    {
      kind: 'copy',
      from: 'C10',
      to: 'D10',
      title: 'Copy the total across: the principal repaid',
      why: 'The principal parts add up to {D10}, the loan itself; the three instalments, 3 × {B4}, are the loan and the total interest together.',
    },
  ],
};

const RATIOS: Workbook = {
  id: 'ratios',
  title: 'Ratio analysis',
  heading: 'Ratios of Narmada Ltd. for 2025-26',
  about: 'Figures of Narmada Ltd. from its Statement of Profit and Loss for 2025-26 and its Balance Sheet as at 31 March 2026 (with the inventories a year earlier). Each ratio is one formula; a term worked out from more than one cell goes in its own brackets, and ROUND shows the ratio to two decimal places.',
  cols: 2,
  rows: 20,
  widths: [17, 9],
  given: cellsFrom({
    A1: head('Statement of Profit and Loss (extract)'),
    B1: head('₹'),
    A2: label('Revenue from operations'),
    B2: money(600000),
    A3: label('Cost of revenue from operations'),
    B3: money(420000),
    A4: label('Profit after tax'),
    B4: money(60000),
    A5: head('Balance Sheet (extract)'),
    B5: head('₹'),
    A6: label('Current assets'),
    B6: money(360000),
    A7: label('Inventories on 31 March 2026'),
    B7: money(120000),
    A8: label('Inventories on 1 April 2025'),
    B8: money(100000),
    A9: label('Prepaid expenses'),
    B9: money(10000),
    A10: label('Current liabilities'),
    B10: money(160000),
    A11: label('Long-term borrowings'),
    B11: money(200000),
    A12: label('Long-term provisions'),
    B12: money(50000),
    A13: label("Shareholders' funds"),
    B13: money(500000),
    A14: head('Ratio'),
    B14: head('Value'),
    A15: label('Current ratio (: 1)'),
    A16: label('Quick ratio (: 1)'),
    A17: label('Inventory turnover ratio (times)'),
    A18: label('Gross profit ratio (%)'),
    A19: label('Net profit ratio (%)'),
    A20: label('Debt to equity ratio (: 1)'),
  }),
  steps: [
    {
      kind: 'type',
      cell: 'B15',
      input: '=ROUND(B6/B10,2)',
      title: 'Current ratio',
      why: 'Current assets ÷ current liabilities: {B6} ÷ {B10} = {B15} : 1. ROUND(value, 2) shows it to two decimal places.',
    },
    {
      kind: 'type',
      cell: 'B16',
      input: '=ROUND((B6-B7-B9)/B10,2)',
      title: 'Quick ratio',
      why: 'Quick assets are current assets less inventories and prepaid expenses, and they go in brackets: a spreadsheet divides before it subtracts, so =B6-B7-B9/B10 would divide only the prepaid expenses. ({B6} - {B7} - {B9}) ÷ {B10} = {B16} : 1.',
    },
    {
      kind: 'type',
      cell: 'B17',
      input: '=ROUND(B3/((B8+B7)/2),2)',
      title: 'Inventory turnover ratio',
      why: 'Cost of revenue from operations ÷ average inventory. The average, (opening + closing) ÷ 2, needs brackets of its own: =B3/(B8+B7)/2 would divide by the sum and then halve the answer. {B3} ÷ 1,10,000 = {B17} times.',
    },
    {
      kind: 'type',
      cell: 'B18',
      input: '=ROUND((B2-B3)/B2*100,2)',
      title: 'Gross profit ratio',
      why: 'Gross profit ÷ revenue from operations × 100, the gross profit worked out in brackets first: ({B2} - {B3}) ÷ {B2} × 100 = {B18}%.',
    },
    {
      kind: 'type',
      cell: 'B19',
      input: '=ROUND(B4/B2*100,2)',
      title: 'Net profit ratio',
      why: 'Profit after tax ÷ revenue from operations × 100: {B4} ÷ {B2} × 100 = {B19}%.',
    },
    {
      kind: 'type',
      cell: 'B20',
      input: '=ROUND((B11+B12)/B13,2)',
      title: 'Debt to equity ratio',
      why: "Debt ÷ equity, where debt is long-term borrowings + long-term provisions and equity is shareholders' funds. The debt is a sum of two cells, so it goes in brackets: =B11+B12/B13 would divide only the provisions. ({B11} + {B12}) ÷ {B13} = {B20} : 1.",
    },
  ],
};

const EXPENSE_CHART: ChartSpec = { kind: 'pie', labels: 'A2:A6', values: 'B2:B6', title: 'Expenses of Kavya Stores for 2025-26' };

const CHART: Workbook = {
  id: 'chart',
  title: 'A chart of the expenses',
  heading: 'Expenses of Kavya Stores for 2025-26',
  about: 'The expenses of a year under five heads, ₹3,60,000 in all. The sheet works out each head\'s share of the total and the angle of its slice in a pie chart, then draws the chart from the range of heads and amounts.',
  cols: 4,
  rows: 7,
  widths: [10, 9, 7, 7],
  given: cellsFrom({
    A1: head('Head of expense'),
    B1: head('Amount (₹)'),
    C1: head('Share (%)'),
    D1: head('Angle (°)'),
    A2: label('Salaries'),
    B2: money(144000),
    A3: label('Rent'),
    B3: money(54000),
    A4: label('Electricity'),
    B4: money(36000),
    A5: label('Advertisement'),
    B5: money(72000),
    A6: label('Repairs'),
    B6: money(54000),
    A7: total('Total'),
    B7: fmt('inr', '', 'total'),
    C7: fmt('general', '', 'total'),
    D7: fmt('general', '', 'total'),
  }),
  steps: [
    { kind: 'type', cell: 'B7', input: '=SUM(B2:B6)', title: 'The total of the expenses', why: 'SUM(B2:B6) adds the five heads: {B7}.' },
    {
      kind: 'type',
      cell: 'C2',
      input: '=ROUND(B2/$B$7*100,2)',
      title: 'The share of the first head',
      why: 'Salaries ÷ total × 100: {B2} ÷ {B7} × 100 = {C2}%. The total is $B$7, absolute, because every head is divided by that same total.',
    },
    { kind: 'copy', from: 'C2', to: 'C3:C6', title: 'Copy the share down', why: 'Rent {C3}%, electricity {C4}%, advertisement {C5}%, repairs {C6}%.' },
    {
      kind: 'type',
      cell: 'D2',
      input: '=ROUND(B2/$B$7*360,2)',
      title: "The angle of the first head's slice",
      why: 'A pie chart stands for the total with the whole circle, 360°: {B2} ÷ {B7} × 360 = {D2}°.',
    },
    { kind: 'copy', from: 'D2', to: 'D3:D6', title: 'Copy the angle down', why: 'Rent {D3}°, electricity {D4}°, advertisement {D5}°, repairs {D6}°.' },
    {
      kind: 'copy',
      from: 'B7',
      to: 'C7:D7',
      title: 'Copy the total across: the check',
      why: 'The shares add up to {C7} and the angles to {D7}: the whole.',
    },
    {
      kind: 'chart',
      chart: EXPENSE_CHART,
      title: 'Draw a pie chart from the range',
      why: 'The chart is drawn from two ranges: the heads in A2:A6 and the amounts in B2:B6. A pie chart shows the parts of one whole: each slice is its share of 360°.',
    },
    {
      kind: 'chart',
      chart: { ...EXPENSE_CHART, kind: 'bar' },
      title: 'The same range as a bar chart',
      why: 'Bars set separate items side by side, so the heads can be compared at a glance; a pie shows how one whole is shared. Change a figure in Play and both follow it at once.',
    },
  ],
  chart: EXPENSE_CHART,
};

export const BLANK: Workbook = {
  id: 'blank',
  title: 'A blank sheet',
  heading: 'A blank sheet',
  about: 'An empty sheet of 6 columns and 12 rows. Type numbers, words or formulas: a formula starts with "=".',
  cols: 6,
  rows: 12,
  widths: [8, 8, 8, 8, 8, 8],
  given: {},
  steps: [],
};

export const WORKBOOKS: readonly Workbook[] = [BRS, SLN, DB, WDV, LOAN, RATIOS, CHART];

export const workbookOf = (id: string): Workbook => (id === 'blank' ? BLANK : (WORKBOOKS.find((w) => w.id === id) ?? BRS));

/** A step done on a sheet. */
export function applyStep(cells: Cells, step: BuildStep): Cells {
  if (step.kind === 'type') return typeInto(cells, step.cell, step.input);
  if (step.kind === 'copy') return paste(cells, parseArea(step.from)!, parseArea(step.to)!);
  return cells;
}

/** The sheet once every step is done (with other figures given, for Play). */
export function finished(wb: Workbook, given: Cells = wb.given): Cells {
  return wb.steps.reduce(applyStep, given);
}

/** The words of a step with every {B7} replaced by what the sheet shows in B7. */
export function fill(text: string, cells: Cells, computed: ReadonlyMap<string, Computed>): string {
  return text.replace(/\{([A-Z]{1,2}\d{1,4})\}/g, (_, a: string) => shownOf(cells, computed, a));
}

const ROWS = (n: number) => (n === 1 ? 'one row' : `${n} rows`);
const COLS = (n: number) => (n === 1 ? 'one column' : `${n} columns`);

/** "one row down", "2 columns to the right", "one row up and one column to the left". */
export function movement(dc: number, dr: number): string {
  const parts: string[] = [];
  if (dr !== 0) parts.push(`${ROWS(Math.abs(dr))} ${dr > 0 ? 'down' : 'up'}`);
  if (dc !== 0) parts.push(`${COLS(Math.abs(dc))} to the ${dc > 0 ? 'right' : 'left'}`);
  return parts.join(' and ') || 'nowhere';
}

const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/**
 * What a copy does to the formulas, in words: the formula (or the row of formulas) it makes in the first cell it is
 * copied to, and how each reference fared (moved, stayed or, for a mixed one, part of it moved).
 */
export function copyWords(cells: Cells, from: Area, to: Area): string {
  const dc = to.left - from.left;
  const dr = to.top - from.top;
  const sources = cellsOf(from).map((c) => ({ c, input: cells[addressOf(c.col, c.row)]?.input ?? '' })).filter((s) => s.input.startsWith('='));
  if (sources.length === 0) return `The cells are copied ${movement(dc, dr)}.`;
  const made = sources.map((s) => ({ at: addressOf(s.c.col + dc, s.c.row + dr), formula: shiftFormula(s.input, dc, dr) }));
  const moves = sources.flatMap((s) => movesOf(s.input, dc, dr));
  const uniq = (xs: string[]) => [...new Set(xs)];
  // A reference with a $ is not relative even when this copy moves all of it (a mixed one copied along its free part).
  const movedAll = moves.filter((m) => m.how === 'moved' && !m.before.includes('$')).filter((m, i, xs) => xs.findIndex((x) => x.before === m.before) === i);
  const moved = movedAll.map((m) => m.before);
  const stayed = uniq(moves.filter((m) => m.how === 'stayed').map((m) => m.before));
  const part = uniq(moves.filter((m) => m.how === 'part' || (m.how === 'moved' && m.before.includes('$'))).map((m) => `${m.before} becomes ${m.after}`));
  const off = uniq(moves.filter((m) => m.how === 'off').map((m) => m.before));
  const clauses: string[] = [];
  if (moved.length > 0) {
    clauses.push(moved.length <= 3 ? `${list(moved)} ${moved.length === 1 ? 'is relative and moves' : 'are relative and move'} ${movement(dc, dr)} (to ${list(movedAll.map((m) => m.after))})` : `the relative references move ${movement(dc, dr)}`);
  }
  if (part.length > 0) clauses.push(`${list(part)}: a $ keeps the part after it, and the free part moves`);
  if (stayed.length > 0) clauses.push(`${list(stayed)} ${stayed.length === 1 ? 'stays' : 'stay'}${stayed.some((s) => s.includes('$')) ? ', fixed by $' : ''}`);
  if (off.length > 0) clauses.push(`${list(off)} would move off the sheet, so the spreadsheet writes #REF!`);
  const into = areaText(to);
  const becomes = made.length === 1 ? `the formula becomes ${made[0].formula} in ${made[0].at}` : `the formulas become ${list(made.map((m) => `${m.formula} in ${m.at}`))}`;
  return `Copied ${movement(dc, dr)} into ${into}, ${becomes}: ${list(clauses)}.`;
}

/** One step of a walk-through, as the screen shows it. */
export interface Frame {
  title: string;
  /** What happened and why, with the figures the sheet shows. */
  text: string;
  /** The sheet after the step. */
  cells: Cells;
  /** The cell to show in the formula bar: the one typed into, or the first copied to. */
  active: string;
  /** The cells the step wrote. */
  changed: string[];
  /** For a copy: where from and where to. */
  copy?: { from: Area; to: Area };
  /** The chart on the sheet after the step. */
  chart?: ChartSpec;
}

/** The steps of a workbook, each with the sheet after it and its words. */
export function walkOf(wb: Workbook, given: Cells = wb.given): Frame[] {
  const frames: Frame[] = [];
  let cells = given;
  let chart: ChartSpec | undefined;
  for (const step of wb.steps) {
    cells = applyStep(cells, step);
    const computed = computeSheet(cells);
    if (step.kind === 'type') {
      frames.push({ title: step.title, text: `${step.cell}: ${step.input}. ${fill(step.why, cells, computed)}`, cells, active: step.cell, changed: [step.cell], chart });
    } else if (step.kind === 'copy') {
      const from = parseArea(step.from)!;
      const to = parseArea(step.to)!;
      const changed = cellsOf(to).map((c) => addressOf(c.col, c.row));
      frames.push({ title: step.title, text: `${fill(step.why, cells, computed)} ${copyWords(cells, from, to)}`, cells, active: changed[0], changed, copy: { from, to }, chart });
    } else {
      chart = step.chart;
      frames.push({ title: step.title, text: fill(step.why, cells, computed), cells, active: step.chart.values.split(':')[0], changed: [], chart });
    }
  }
  return frames;
}

// ---- New figures for Play ----

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)];
const step = (rng: Rng, lo: number, hi: number, by: number) => lo + by * rng.int(0, Math.floor((hi - lo) / by));

/**
 * New figures for a ready workbook, in the cells it is given (its formulas then work them out). Depreciation and
 * loan figures are chosen as the topic's own questions choose them, so that every figure comes out in whole rupees.
 */
export function freshFigures(id: WorkbookId, rng: Rng): Record<string, number | string> {
  switch (id) {
    case 'brs':
      return { B2: step(rng, 20000, 90000, 500), B3: step(rng, 1000, 15000, 500), B4: step(rng, 100, 2000, 50), C5: step(rng, 1000, 20000, 500), C6: step(rng, 100, 1500, 50) };
    case 'sln': {
      const dep = step(rng, 10000, 60000, 500);
      const salvage = step(rng, 0, 40000, 1000);
      return { B1: dep * 4 + salvage, B2: salvage };
    }
    case 'db': {
      // The rate comes out exact (20%, 25%, 30%, 40% or 50% for 4 years) and every year's charge in whole rupees.
      const [rate, unit] = pick(rng, [[20, 10000], [25, 25600], [30, 10000], [40, 10000], [50, 16000]] as const);
      const cost = unit * rng.int(Math.ceil(100000 / unit), Math.floor(2000000 / unit));
      return { B1: cost, B2: Math.round(cost * (1 - rate / 100) ** 4) };
    }
    case 'wdv': {
      const [rate, unit] = pick(rng, [[10, 1000], [20, 1000], [25, 6400], [40, 1000]] as const);
      const cost = unit * rng.int(Math.ceil(100000 / unit), Math.floor(2000000 / unit));
      return { B1: cost, B2: `${rate}%` };
    }
    case 'loan': {
      // A loan whose instalment and every interest and principal part are whole rupees (the topic's own loans).
      const [a, b, lo, hi, by] = pick(rng, [[1, 10, 1, 6, 1], [1, 8, 1, 16, 1], [1, 5, 5, 170, 5]] as const);
      const m = step(rng, lo, hi, by);
      const loan = ((a + b) ** 3 - b ** 3) * b ** 3 * m;
      return { B1: loan, B2: `${(100 * a) / b}%` };
    }
    case 'ratios': {
      const revenue = step(rng, 400000, 2000000, 10000);
      const cost = Math.round((revenue * rng.int(55, 80)) / 100 / 1000) * 1000;
      const profit = Math.round((revenue * rng.int(3, 15)) / 100 / 1000) * 1000;
      const cl = step(rng, 80000, 600000, 5000);
      const ca = Math.round((cl * rng.int(80, 300)) / 100 / 1000) * 1000;
      const inv = Math.round((ca * rng.int(20, 50)) / 100 / 1000) * 1000;
      const opening = Math.max(1000, inv + step(rng, -40000, 40000, 1000));
      const prepaid = Math.round((ca * rng.int(0, 5)) / 100 / 100) * 100;
      return { B2: revenue, B3: cost, B4: profit, B6: ca, B7: inv, B8: opening, B9: prepaid, B10: cl, B11: step(rng, 0, 800000, 10000), B12: step(rng, 0, 150000, 5000), B13: step(rng, 200000, 1500000, 10000) };
    }
    case 'chart':
      return Object.fromEntries(['B2', 'B3', 'B4', 'B5', 'B6'].map((c) => [c, step(rng, 10000, 200000, 1000)]));
  }
}

/** A workbook's given cells with new figures in place (each keeps its format). */
export function withFigures(wb: Workbook, figures: Record<string, number | string>): Cells {
  const next: Record<string, CellSpec> = { ...wb.given };
  for (const [addr, v] of Object.entries(figures)) next[addr] = { ...wb.given[addr], input: String(v) };
  return next;
}

/** The workbook's sheet with every step done, ready for Play: with new figures when `rng` is given. */
export function playSheet(wb: Workbook, rng?: Rng): Cells {
  if (!rng || wb.id === 'blank') return finished(wb);
  return finished(wb, withFigures(wb, freshFigures(wb.id, rng)));
}
