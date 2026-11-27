import { describe, expect, it } from 'vitest';
import { colLetters, colNumber, parseArea, parseRef, refText, shiftRef } from './address';
import { db, dbRate, ipmt, pmt, roundHalfAway, type ErrValue } from './evaluate';
import { movesOf, normalise, parseFormula, refsOf, shiftFormula } from './formula';
import { cellsFrom, clearArea, computeSheet, displayOf, fillDown, fillRight, numberIn, paste, readInput, rupeesText, typeInto } from './sheet';

/** The value of one formula on a sheet of these cells, worked out in Z99. */
function value(formula: string, cells: Record<string, string> = {}) {
  const sheet = cellsFrom({ ...cells, Z99: formula });
  return computeSheet(sheet).get('Z99')!;
}
const num = (formula: string, cells: Record<string, string> = {}) => value(formula, cells).value as number;
const err = (formula: string, cells: Record<string, string> = {}) => value(formula, cells).value as ErrValue;

describe('cells and references', () => {
  it('name columns by letters and rows by numbers', () => {
    expect(colLetters(1)).toBe('A');
    expect(colLetters(26)).toBe('Z');
    expect(colLetters(27)).toBe('AA');
    expect(colNumber('AB')).toBe(28);
    expect(parseRef('$B$2')).toEqual({ col: 2, row: 2, absCol: true, absRow: true });
    expect(parseRef('b$7')).toEqual({ col: 2, row: 7, absCol: false, absRow: true });
    expect(parseRef('7D')).toBeNull();
    expect(parseRef('B0')).toBeNull();
    // The range of the topic's card: 3 columns and 5 rows.
    const a = parseArea('B2:D6')!;
    expect((a.bottom - a.top + 1) * (a.right - a.left + 1)).toBe(15);
    expect(parseArea('C3:F8')).toEqual({ top: 3, left: 3, bottom: 8, right: 6 });
  });

  it('move the free parts of a reference and keep the parts fixed by $', () => {
    const r = parseRef('$A3')!;
    expect(refText(shiftRef(r, 3, 4)!)).toBe('$A7');
    expect(refText(shiftRef(parseRef('B$2')!, 3, 4)!)).toBe('E$2');
    expect(refText(shiftRef(parseRef('$C$1')!, 5, 5)!)).toBe('$C$1');
    expect(shiftRef(parseRef('B2')!, 0, -2)).toBeNull();
  });
});

describe('copying a formula', () => {
  it('shifts relative references and keeps absolute ones (the topic\'s examples)', () => {
    expect(shiftFormula('=B2*$C$1', 0, 3)).toBe('=B5*$C$1');
    expect(shiftFormula('=$A3*B$2', 3, 4)).toBe('=$A7*E$2');
    expect(shiftFormula('=B2*C1', 0, 1)).toBe('=B3*C2');
    expect(shiftFormula('=SUM(B3:B7)', 1, 0)).toBe('=SUM(C3:C7)');
    expect(shiftFormula('=SUM($B$7:B7)', 0, 2)).toBe('=SUM($B$7:B9)');
    expect(shiftFormula('=DB($B$2,$B$3,$B$4,A8)', 0, 1)).toBe('=DB($B$2,$B$3,$B$4,A9)');
    // Quotes are not references.
    expect(shiftFormula('=IF(B2>0,"B2 is up","down")', 0, 1)).toBe('=IF(B3>0,"B2 is up","down")');
  });

  it('writes #REF! for a reference moved off the sheet', () => {
    expect(shiftFormula('=B4-B3', 0, -3)).toBe('=B1-#REF!');
    expect(shiftFormula('=SUM(A1:B2)', -1, 0)).toBe('=SUM(#REF!)');
    expect(err('=B1-#REF!').err).toBe('#REF!');
  });

  it('says how each reference fared', () => {
    expect(movesOf('=DB($B$2,$B$3,$B$4,A8)', 0, 1).map((m) => m.how)).toEqual(['stayed', 'stayed', 'stayed', 'moved']);
    expect(movesOf('=$A3*B$2', 3, 4)).toEqual([
      { before: '$A3', after: '$A7', how: 'part' },
      { before: 'B$2', after: 'E$2', how: 'part' },
    ]);
    // Copied down, B$2 keeps its row and its column does not move either: it stays.
    expect(movesOf('=B$2*A3', 0, 1).map((m) => m.how)).toEqual(['stayed', 'moved']);
    expect(movesOf('=SUM($B$7:B7)', 0, 1)[0]).toEqual({ before: '$B$7:B7', after: '$B$7:B8', how: 'part' });
    expect(movesOf('=B4-B3', 0, -3)[1].how).toBe('off');
  });

  it('pastes one cell into a block, a block at the top left, and fills down and right', () => {
    let cells = cellsFrom({ B2: '100', B3: '200', B4: '300', C1: '10%', D2: '=B2*$C$1' });
    cells = paste(cells, parseArea('D2')!, parseArea('D3:D4')!);
    expect(cells.D3.input).toBe('=B3*$C$1');
    expect(cells.D4.input).toBe('=B4*$C$1');
    const sheet = computeSheet(cells);
    expect(numberIn(sheet, 'D4')).toBeCloseTo(30, 10);
    cells = fillRight(cellsFrom({ B8: '=SUM(B3:B7)' }), parseArea('B8:D8')!);
    expect(cells.D8.input).toBe('=SUM(D3:D7)');
    cells = fillDown(cellsFrom({ A1: '1', A2: '=A1+1' }), parseArea('A2:A5')!);
    expect(numberIn(computeSheet(cells), 'A5')).toBe(5);
    expect(clearArea(cells, parseArea('A2:A5')!).A3).toBeUndefined();
  });
});

describe('reading a formula', () => {
  it('keeps cell and function names in capitals, text as typed', () => {
    expect(normalise('=sum(b2:b5)')).toBe('=SUM(B2:B5)');
    expect(normalise('=if(b2>0,"profit","loss")')).toBe('=IF(B2>0,"profit","loss")');
    expect(refsOf('=SUM(B3:B7)-$C$1').map((r) => r.text)).toEqual(['B3:B7', '$C$1']);
  });

  it('refuses a formula that cannot be read, with the reason', () => {
    const problem = (f: string) => {
      const p = parseFormula(f);
      return p.ok ? null : p.message;
    };
    expect(problem('=(B2+B3')).toMatch(/not closed/);
    expect(problem('=B2+B3)')).toMatch(/no "\("/);
    expect(problem('=B2 B3')).toMatch(/side by side/);
    expect(problem('=B2+')).toMatch(/missing after "\+"/);
    expect(problem('=2B')).toMatch(/column first/);
    expect(problem('=SUM(B2,)')).toMatch(/missing/);
    expect(problem('=')).toMatch(/Nothing follows/);
    expect(problem('=SLN(B1,B2)')).toMatch(/SLN needs 3 arguments/);
    expect(problem('=ROUND(B1,2,3)')).toMatch(/ROUND takes 2 arguments/);
    expect(problem('=B2×B3')).toMatch(/\*/);
    expect(problem('=SUM(B2:)')).toMatch(/range needs a cell/);
    expect(problem('=SUM(B3:B7)-B6')).toBeNull();
  });
});

describe('working a formula out', () => {
  it('in the spreadsheet\'s order: brackets, -, %, ^, * and /, + and -, &, comparisons', () => {
    expect(num('=B2+C2/2', { B2: '30000', C2: '10000' })).toBe(35000);
    expect(num('=(B2+C2)/2', { B2: '30000', C2: '10000' })).toBe(20000);
    expect(num('=2^3^2')).toBe(64);
    expect(num('=-2^2')).toBe(4);
    expect(num('=10%*B2', { B2: '48000' })).toBeCloseTo(4800, 9);
    expect(num('=B2*C2/100', { B2: '48000', C2: '5' })).toBe(2400);
    expect(value('=1+2>2').value).toBe(true);
    expect(value('="Year "&B2', { B2: '3' }).value).toBe('Year 3');
    expect(num('=B2-B3', { B2: '100' })).toBe(100);
  });

  it('agrees with what Excel gives for the order of working', () => {
    // A minus sign before a value comes before ^; a minus between two values comes after it.
    expect(num('=0-2^2')).toBe(-4);
    expect(num('=2*-3^2')).toBe(18);
    expect(num('=-B2^2', { B2: '3' })).toBe(9);
    expect(num('=2^-1')).toBe(0.5);
    expect(num('=10-2-3')).toBe(5);
    expect(num('=8/2/2')).toBe(2);
    expect(num('=-50%')).toBe(-0.5);
    expect(num('=2^3*2')).toBe(16);
    expect(num('=1+2*3^2')).toBe(19);
    expect(value('=1+1=2').value).toBe(true);
    expect(value('=5&5+1').value).toBe('56');
    // Text that is a number is read as one in arithmetic; text compares without regard to case, after numbers.
    expect(num('=1+"2"')).toBe(3);
    expect(value('="a"="A"').value).toBe(true);
    expect(value('="10"=10').value).toBe(false);
    expect(value('="Rent">1000000').value).toBe(true);
    expect((err('=0^0')).err).toBe('#NUM!');
    expect((err('=0^-1')).err).toBe('#DIV/0!');
    expect((err('=(-8)^(1/3)')).err).toBe('#NUM!');
  });

  it('gives #DIV/0!, #NAME?, #VALUE!, #REF! and #NUM! with the reason', () => {
    const div = err('=B2/C2', { B2: '100' });
    expect(div.err).toBe('#DIV/0!');
    expect(div.reason).toMatch(/C2 is nil/);
    expect(err('=SUMM(B2:B3)').err).toBe('#NAME?');
    expect(err('=SUMM(B2:B3)').reason).toMatch(/did you mean SUM/);
    expect(err('=B2*rate', { B2: '5' }).reason).toMatch(/"rate" is not a cell/);
    expect(err('=B2:B5').err).toBe('#VALUE!');
    expect(err('=B2+B3', { B2: '5', B3: 'Rent' }).reason).toMatch(/text "Rent"/);
    expect(err('=DB(100,10,4,5)').err).toBe('#NUM!');
    expect(err('=PMT(0.1,0,-1000)').err).toBe('#NUM!');
    expect(err('=AVERAGE(B2:B5)').err).toBe('#DIV/0!');
    expect(err('=IF("yes",1,2)').err).toBe('#VALUE!');
  });

  it('passes an error on from the cell where it arose', () => {
    const sheet = computeSheet(cellsFrom({ B2: '=1/0', B3: '=B2+1' }));
    expect((sheet.get('B3')!.value as ErrValue).at).toBe('B2');
  });

  it('finds a cell that depends on itself', () => {
    const sheet = computeSheet(cellsFrom({ A1: '=B1+1', B1: '=A1*2', C1: '=A1', D1: '=D1+1' }));
    for (const a of ['A1', 'B1', 'C1', 'D1']) expect((sheet.get(a)!.value as ErrValue).err, a).toBe('#REF!');
    // The reason gives the error its proper name, as Excel's warning does.
    expect((sheet.get('D1')!.value as ErrValue).reason).toMatch(/^Circular reference: the formula in D1 needs the value of D1 itself/);
    // A total that takes itself into its range is the commonest case.
    const total = computeSheet(cellsFrom({ B2: '10', B3: '20', B4: '=SUM(B2:B4)' })).get('B4')!.value as ErrValue;
    expect(total.err).toBe('#REF!');
    expect(total.reason).toMatch(/Circular reference/);
    // IF works out only its branch: a branch not taken that names the cell is no circle.
    expect(num('=IF(TRUE,5,Z99)')).toBe(5);
  });

  it('treats an empty cell as nil in a sum and "" in a comparison, and shows a formula of an empty cell as 0', () => {
    expect(value('=IF(B2="","empty","full")').value).toBe('empty');
    expect(value('=B2').value).toBe(0);
    expect(num('=SUM(B2:B4)', { B2: '5', B3: 'Rent', B4: '7' })).toBe(12);
    expect(num('=COUNT(B2:B6)', { B2: '5', B3: 'Rent', B4: '7', B6: '=1/0' })).toBe(2);
  });
});

describe('the functions, against known values', () => {
  it('SUM, AVERAGE, MAX, MIN, COUNT, ROUND and IF', () => {
    const months = { B2: '50000', B3: '62000', B4: '48000', B5: '71000', B6: '9000' };
    expect(num('=SUM(B2:B5)-B6', months)).toBe(222000);
    expect(num('=AVERAGE(B2:B5)', months)).toBe(57750);
    expect(num('=MAX(B2:B6)-MIN(B2:B6)', months)).toBe(62000);
    expect(num('=COUNT(B2:B6,"x",3)', months)).toBe(6);
    expect(num('=ROUND(2.675,2)')).toBe(2.68);
    expect(num('=ROUND(-2.5,0)')).toBe(-3);
    expect(num('=ROUND(1234.5,-2)')).toBe(1200);
    // Excel: ROUND(-1.005,2) is -1.01, ROUND(1250,-2) is 1,300, ROUND(21.5,-1) is 20.
    expect(num('=ROUND(-1.005,2)')).toBe(-1.01);
    expect(num('=ROUND(1250,-2)')).toBe(1300);
    expect(num('=ROUND(21.5,-1)')).toBe(20);
    expect(num('=AVERAGE(B2:B4)', { B2: '10', B3: 'Rent', B4: '20' })).toBe(15);
    expect(value('=IF(B2,"full","empty")').value).toBe('empty');
    expect(roundHalfAway(1.005, 2)).toBe(1.01);
    // The topic's IF: an order of exactly ₹50,000 meets ">=".
    expect(num('=IF(B2>=50000,B2*10/100,B2*5/100)', { B2: '50000' })).toBe(5000);
    expect(num('=IF(B2>75000,B2*5/100,B2*2/100)', { B2: '80000' })).toBe(4000);
    expect(value('=IF(B2>0,"Profit")', { B2: '-1' }).value).toBe(false);
    // IF works out only the branch it takes.
    expect(num('=IF(TRUE,1,1/0)')).toBe(1);
  });

  it('SLN: (cost - salvage) ÷ life', () => {
    expect(num('=SLN(250000,10000,8)')).toBe(30000);
    // Excel's example: SLN(30000, 7500, 10) is 2,250.
    expect(num('=SLN(30000,7500,10)')).toBe(2250);
    expect(num('=SLN(B1,B2,B3)', { B1: '160000', B2: '10000', B3: '4' })).toBe(37500);
    expect(err('=SLN(1000,0,0)').err).toBe('#DIV/0!');
  });

  it('DB as Excel works it out, the rate rounded to three places', () => {
    // The topic's card: cost 1,60,000, salvage 10,000, life 4: rate 50%.
    expect(dbRate(160000, 10000, 4)).toBe(0.5);
    expect([1, 2, 3, 4].map((p) => db(160000, 10000, 4, p))).toEqual([80000, 40000, 20000, 10000]);
    // Excel's own example: cost 10,00,000, salvage 1,00,000, life 6, first year of 7 months. Rate 0.319.
    expect(dbRate(1000000, 100000, 6)).toBe(0.319);
    const excel = [186083.33, 259639.42, 176814.44, 120410.64, 81999.64, 55841.76, 15845.1];
    excel.forEach((v, i) => expect(db(1000000, 100000, 6, i + 1, 7)).toBeCloseTo(v, 2));
    expect(num('=DB(1000000,100000,6,7,7)')).toBeCloseTo(15845.1, 2);
    // A rate that does not come out exact: 1 - (5000 ÷ 50000)^(1/3) = 0.5358... is 0.536.
    expect(dbRate(50000, 5000, 3)).toBe(0.536);
    expect(num('=DB(50000,5000,3,2)')).toBeCloseTo(50000 * 0.464 * 0.536, 6);
  });

  it('PMT, IPMT and PPMT as Excel works them out', () => {
    expect(num('=PMT(10%,2,-210000)')).toBeCloseTo(121000, 6);
    expect(num('=PMT(0.1,3,-331000)')).toBeCloseTo(133100, 6);
    expect(num('=PMT(8%,5,-100000)')).toBeCloseTo(25045.65, 2);
    // Without the minus sign the instalment comes out negative: money paid.
    expect(num('=PMT(10%,2,210000)')).toBeCloseTo(-121000, 6);
    expect(pmt(0, 4, -1000)).toBe(250);
    expect(num('=IPMT(10%,2,2,-210000)')).toBeCloseTo(11000, 6);
    expect(num('=PPMT(10%,2,2,-210000)')).toBeCloseTo(110000, 6);
    expect(num('=IPMT(10%,1,3,-331000)')).toBeCloseTo(33100, 6);
    expect(ipmt(0.1, 1, 3, -331000, 0, 1)).toBe(0);
    // Excel: IPMT(10%/12, 1, 3*12, 8000) is -66.67 (its example for the first month's interest).
    expect(num('=IPMT(10%/12,1,36,8000)')).toBeCloseTo(-66.67, 2);
    expect(err('=IPMT(10%,4,3,-1000)').err).toBe('#NUM!');
    // Excel's own examples: PMT(8%/12, 10, 10000) is -1,037.03; PMT(6%/12, 18*12, 0, 50000) is -129.08;
    // IPMT(10%, 3, 3, 8000) is -292.45; PPMT(10%/12, 1, 2*12, 2000) is -75.62.
    expect(num('=PMT(8%/12,10,10000)')).toBeCloseTo(-1037.03, 2);
    expect(num('=PMT(6%/12,18*12,0,50000)')).toBeCloseTo(-129.08, 2);
    expect(num('=IPMT(10%,3,3,8000)')).toBeCloseTo(-292.45, 2);
    expect(num('=PPMT(10%/12,1,2*12,2000)')).toBeCloseTo(-75.62, 2);
    // The schedule of the ready workbook, by IPMT and PPMT: 33,100 + 1,00,000; 23,100 + 1,10,000; 12,100 + 1,21,000.
    expect([1, 2, 3].map((k) => Math.round(num(`=IPMT(10%,${k},3,-331000)`) * 100) / 100)).toEqual([33100, 23100, 12100]);
    expect([1, 2, 3].map((k) => Math.round(num(`=PPMT(10%,${k},3,-331000)`) * 100) / 100)).toEqual([100000, 110000, 121000]);
  });
});

describe('typing into a cell', () => {
  it('reads numbers with ₹, commas and %, text, and formulas', () => {
    expect(readInput('₹1,20,000')).toEqual({ type: 'number', value: 120000, format: 'inr' });
    expect(readInput('12,500')).toEqual({ type: 'number', value: 12500, format: 'grouped' });
    expect(readInput('10%')).toEqual({ type: 'number', value: 0.1, format: 'percent' });
    expect(readInput('-500')).toEqual({ type: 'number', value: -500 });
    expect(readInput('Rent')).toEqual({ type: 'text', value: 'Rent' });
    expect(readInput('1,2,3')).toEqual({ type: 'text', value: '1,2,3' });
    expect(readInput(' =b2+1')).toEqual({ type: 'formula', formula: '=b2+1' });
    const cells = typeInto(cellsFrom({ B2: { input: '5', format: 'inr' } }), 'B2', '=sum(b3:b4)');
    expect(cells.B2).toEqual({ input: '=SUM(B3:B4)', format: 'inr' });
    expect(typeInto(cells, 'B2', '').B2).toEqual({ input: '', format: 'inr' });
  });

  it('shows a value in its format', () => {
    expect(rupeesText(56250)).toBe('₹56,250');
    expect(rupeesText(-500)).toBe('-₹500');
    expect(rupeesText(133100.00000000001)).toBe('₹1,33,100');
    expect(displayOf(0.125, 'percent')).toBe('12.5%');
    expect(displayOf(1234567, 'grouped')).toBe('12,34,567');
    expect(displayOf(2.25, 'general')).toBe('2.25');
    expect(displayOf(0.1 + 0.2, 'general')).toBe('0.3');
    expect(displayOf(true, 'general')).toBe('TRUE');
    expect(displayOf({ err: '#DIV/0!', reason: '' }, 'inr')).toBe('#DIV/0!');
  });
});
