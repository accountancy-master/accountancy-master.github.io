'use client';

import { useState } from 'react';
import { useReducedMotion } from '../useReducedMotion';
import type { LabMode } from './kit/LabControls';
import { LabShell } from './kit/LabShell';
import { Play } from './spreadsheet/Play';
import { TryIt } from './spreadsheet/TryIt';
import { Watch } from './spreadsheet/Watch';
import type { LabProps } from './types';

// ---------------------------------------------------------------------------------------------------------------
// The lab "spreadsheet" (src/simulator/labs.ts): Class 12, Computerised Accounting. A small spreadsheet that works:
// cells holding numbers, text or formulas, worked out by the lab's own evaluator (src/simulator/spreadsheet), with
// the ready workbooks the syllabus names built step by step (Watch), a sheet to change freely (Play), and quick
// questions on small sheets (Try it).
// ---------------------------------------------------------------------------------------------------------------

const P = 'lab-spreadsheet';

const CONVENTIONS = [
  'A cell is named by its column and then its row (B7); a range by its two corners (B2:B6). A formula starts with "=" and is worked out again whenever a cell it names changes.',
  'The order of working is the spreadsheet\'s (Excel and LibreOffice): brackets first, then a minus sign before a value, %, ^, * and /, + and -, & and last the comparisons; signs of the same rank from left to right. An empty cell counts as nil in arithmetic.',
  'Copying a formula moves each reference by as many columns and rows as the copy moves; a $ fixes the column letter or the row number right after it ($B$2 absolute, $B2 and B$2 mixed). A reference moved above row 1 or left of column A becomes #REF!. Paste copies what is typed; a cell with a format of its own (₹, %) keeps it.',
  'The functions of the topic: SUM, AVERAGE, MAX, MIN, COUNT, ROUND (half away from nil), IF; SLN(cost, salvage value, life) = (cost - salvage value) ÷ life; DB(cost, salvage value, life, year) charges a fixed rate, 1 - (salvage value ÷ cost)^(1 ÷ life) rounded to three decimal places, on the book value at the start of each year, as Excel and LibreOffice work it out; PMT(rate, number of instalments, -loan) is the equal instalment paid at the end of each year, the loan entered with a minus sign so that it comes out positive; IPMT and PPMT its interest (the balance at the start of the year × the rate) and principal parts.',
  'Errors: #DIV/0! (a division by nil or an empty cell), #NAME? (a name that is not a function or a cell, or words not in quotes), #REF! (a reference off the sheet; or a circular reference, a cell whose formula needs its own value, which Excel warns of and this sheet marks #REF!), #VALUE! (text where a number is wanted, a range where one value is wanted), #NUM! (an argument a function cannot take). Each says its reason. A formula that cannot be read is not kept.',
  'Figures are worked out in full and shown in the cell\'s format: amounts in ₹ with the Indian grouping (to the paisa when not whole), rates as percentages, ratios as worked (ROUND to two places where the sheet asks for it).',
  'In the workbooks: years end on 31 March; the bank reconciliation statement starts from the debit balance of the cash book, in Plus and Minus columns; the ratios follow the Accounting Ratios topic (quick assets = current assets - inventories - prepaid expenses; inventory turnover on the average inventory; net profit ratio on the profit after tax; debt to equity = (long-term borrowings + long-term provisions) ÷ shareholders\' funds); a slice of a pie chart is its figure ÷ the total × 360°.',
];

export default function SpreadsheetLab({ seed }: LabProps) {
  const [mode, setMode] = useState<LabMode>('watch');
  const reduced = useReducedMotion();
  return (
    <LabShell prefix={P} mode={mode} onMode={setMode} conventions={CONVENTIONS}>
      {mode === 'watch' ? <Watch prefix={P} reduced={reduced} /> : null}
      {mode === 'play' ? <Play prefix={P} reduced={reduced} seed={seed} /> : null}
      {mode === 'try' ? <TryIt prefix={P} reduced={reduced} seed={seed} /> : null}
    </LabShell>
  );
}
