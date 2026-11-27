import { describe, expect, it } from 'vitest';
import { acceptedLabels, columnTotals, compareFormat, givenProblem, offeredLabels, printedByLabel, printedFigures, rowProblem, rowsProblem, type EnteredRow, type FormatRow } from './formats';

const row = (label: string, ...rupees: number[]): FormatRow => ({ label, amounts: rupees.map((r) => r * 100) });
const got = (label: string, ...rupees: number[]): EnteredRow => ({ label, amounts: rupees.map((r) => r * 100) });

// A supplier's account: the debit side, the credit side, and the rows below the totals of each.
const DR = [row('Purchases Return A/c', 2000), row('Cash A/c', 15000), row('Balance c/d', 33000)];
const CR = [row('Balance b/d', 10000), row('Purchases A/c', 40000)];
const EXPECTED = [DR, CR, [], [row('Balance b/d', 33000)]];
const sideOf = (list: number) => list % 2;
const RIGHT = [DR, CR, [], [got('Balance b/d', 33000)]] as EnteredRow[][];

describe('rows of a format', () => {
  it('totals each amount column', () => {
    expect(columnTotals(DR, 1)).toEqual([5000000]);
    expect(columnTotals([row('Cash', 100, 0), row('Capital', 0, 100), row('Rent', 50, 0)], 2)).toEqual([15000, 10000]);
    expect(columnTotals([], 2)).toEqual([0, 0]);
  });

  it('refuses a row that cannot be one', () => {
    expect(rowProblem(row('Cash A/c', 500), 1)).toBeNull();
    expect(rowProblem(row('Cash A/c', 500, 0), 2)).toBeNull();
    expect(rowProblem(row(' ', 500), 1)).toMatch(/no particulars/);
    expect(rowProblem(row('Cash A/c', 500), 2)).toMatch(/1 amounts for 2 amount columns/);
    expect(rowProblem({ label: 'Cash A/c', amounts: [50050] }, 1)).toMatch(/whole number of rupees/);
    expect(rowProblem({ label: 'Cash A/c', amounts: [-100] }, 1)).toMatch(/whole number of rupees/);
    expect(rowProblem({ label: 'Cash A/c', amounts: [1.5] }, 1)).toMatch(/whole number of rupees/);
    expect(rowProblem(row('Cash A/c', 0, 0), 2)).toMatch(/no amount/);
    expect(rowProblem({ ...row('Cash A/c', 5), date: ' ' }, 1)).toMatch(/empty date/);
    expect(rowProblem({ ...row('Cash A/c', 5), details: ['Less: Returns', ''] }, 1)).toMatch(/empty detail/);
  });

  it('refuses a list with a label that is not offered, or with two rows nothing tells apart', () => {
    const labels = ['Balance c/d', 'Cash A/c', 'Purchases Return A/c'];
    expect(rowsProblem(DR, 1, labels)).toBeNull();
    expect(rowsProblem(DR, 1, labels.slice(1))).toMatch(/"Balance c\/d" is used but not among the labels on offer/);
    expect(rowsProblem([...DR, row('Cash A/c', 15000)], 1, labels)).toMatch(/cannot be told apart/);
    // The same particulars with another amount is another row.
    expect(rowsProblem([...DR, row('Cash A/c', 9000)], 1, labels)).toBeNull();
  });

  it('offers the labels of the rows and the distractors, each once, in the order of the alphabet', () => {
    expect(offeredLabels(DR, ['Bank A/c', 'Cash A/c', 'Balance b/d', 'Bank A/c'])).toEqual(['Balance b/d', 'Balance c/d', 'Bank A/c', 'Cash A/c', 'Purchases Return A/c']);
  });
});

describe('a row that is as right under other wording', () => {
  // A Suspense A/c: what it opens with may be called "Balance b/d"; the balance that is left is brought down below.
  const OPENING: FormatRow = { ...row('Difference in trial balance', 5000), also: ['Balance b/d'] };
  const SUSPENSE = [[OPENING, row('Sales A/c', 2000)], [row('Mohan A/c', 4000), row('Balance c/d', 3000)], [row('Balance b/d', 3000)], []];
  const LABELS = ['Balance b/d', 'Balance c/d', 'Difference in trial balance', 'Mohan A/c', 'Sales A/c'];
  const answer = (opening: EnteredRow, below: EnteredRow[] = [got('Balance b/d', 3000)]) => [[opening, got('Sales A/c', 2000)], [got('Mohan A/c', 4000), got('Balance c/d', 3000)], below, []];

  it('offers the other wordings with the labels, each once', () => {
    expect(acceptedLabels(OPENING)).toEqual(['Difference in trial balance', 'Balance b/d']);
    expect(acceptedLabels(row('Sales A/c', 2000))).toEqual(['Sales A/c']);
    expect(offeredLabels(SUSPENSE[0], ['Suspense A/c'])).toEqual(['Balance b/d', 'Difference in trial balance', 'Sales A/c', 'Suspense A/c']);
    expect(offeredLabels(SUSPENSE[0], ['Balance b/d', 'Suspense A/c'])).toEqual(['Balance b/d', 'Difference in trial balance', 'Sales A/c', 'Suspense A/c']);
  });

  it('refuses another wording that is empty, not on offer, or the name of a row of the same list with the same amounts', () => {
    expect(rowProblem(OPENING, 1)).toBeNull();
    expect(rowProblem({ ...OPENING, also: ['Balance b/d', ' '] }, 1)).toMatch(/empty other wording/);
    for (const list of SUSPENSE) expect(rowsProblem(list, 1, LABELS)).toBeNull();
    expect(rowsProblem(SUSPENSE[0], 1, LABELS.slice(1))).toMatch(/"Balance b\/d" is used but not among the labels on offer/);
    // A row of the list called "Balance b/d" for the same amount could be either row; for another amount it could not.
    expect(rowsProblem([OPENING, row('Balance b/d', 5000)], 1, LABELS)).toMatch(/two rows "Balance b\/d" with the same amounts cannot be told apart/);
    expect(rowsProblem([row('Balance b/d', 5000), OPENING], 1, LABELS)).toMatch(/cannot be told apart/);
    expect(rowsProblem([OPENING, row('Balance b/d', 3000)], 1, LABELS)).toBeNull();
    // Two rows of the list with the same other wording and the same amounts could not be told apart either.
    expect(rowsProblem([OPENING, { ...row('Sales A/c', 5000), also: ['Balance b/d'] }], 1, LABELS)).toMatch(/cannot be told apart/);
    expect(rowsProblem([OPENING, { ...row('Sales A/c', 2000), also: ['Balance b/d'] }], 1, LABELS)).toBeNull();
    // A wording that repeats the label of its own row is the same row, not a twin.
    expect(rowsProblem([{ ...OPENING, also: ['Difference in trial balance', 'Balance b/d'] }], 1, LABELS)).toBeNull();
  });

  it('is right under its label and under each other wording, with the right amount in its own list', () => {
    expect(compareFormat(SUSPENSE, answer(got('Difference in trial balance', 5000)), sideOf)).toMatchObject({ correct: true, right: 5, extra: 0 });
    const other = compareFormat(SUSPENSE, answer(got('Balance b/d', 5000)), sideOf);
    expect(other).toMatchObject({ correct: true, right: 5, total: 5, extra: 0 });
    expect(other.entered[0]).toEqual(['correct', 'correct']);
    // A label that no row is right under is still wrong.
    expect(compareFormat(SUSPENSE, answer(got('Balance c/d', 5000)), sideOf)).toMatchObject({ correct: false, right: 4, extra: 1 });
  });

  it('says what is wrong with a row entered under other wording as it does for the label itself', () => {
    const amount = compareFormat(SUSPENSE, answer(got('Balance b/d', 500)), sideOf);
    expect(amount.expected[0]).toEqual(['amount', 'ok']);
    expect(amount.entered[0]).toEqual(['wrongAmount', 'correct']);
    const side = compareFormat(SUSPENSE, [[got('Sales A/c', 2000)], [got('Balance b/d', 5000), got('Mohan A/c', 4000), got('Balance c/d', 3000)], [got('Balance b/d', 3000)], []], sideOf);
    expect(side.expected[0]).toEqual(['side', 'ok']);
    expect(side.entered[1]).toEqual(['wrongSide', 'correct', 'correct']);
  });

  it('keeps the same name apart in another list: the balance brought down below the totals is a row of its own', () => {
    // Both rows called "Balance b/d", each in its own list: both right.
    expect(compareFormat(SUSPENSE, answer(got('Balance b/d', 5000), [got('Balance b/d', 3000)]), sideOf).correct).toBe(true);
    // The balance brought down written above the totals is on the wrong side of them, not the opening row.
    const above = compareFormat(SUSPENSE, [[got('Difference in trial balance', 5000), got('Sales A/c', 2000), got('Balance b/d', 3000)], [got('Mohan A/c', 4000), got('Balance c/d', 3000)], [], []], sideOf);
    expect(above.expected).toEqual([['ok', 'ok'], ['ok', 'ok'], ['place'], []]);
    expect(above.entered[0][2]).toBe('wrongPlace');
    // An account that closes: a balance brought down all the same answers to nothing, the opening row being there.
    const closed = [[{ ...row('Difference in trial balance', 2000), also: ['Balance b/d'] }, row('Sales A/c', 2000)], [row('Mohan A/c', 4000)], [], []];
    const brought = compareFormat(closed, [[got('Balance b/d', 2000), got('Sales A/c', 2000)], [got('Mohan A/c', 4000)], [got('Balance b/d', 700)], []], sideOf);
    expect(brought).toMatchObject({ correct: false, right: 3, extra: 1 });
    expect(brought.entered[2]).toEqual(['extraRow']);
  });
});

describe('compareFormat', () => {
  it('finds every row right whatever the order within a side', () => {
    const shuffled = [[DR[2], DR[0], DR[1]], [CR[1], CR[0]], [], RIGHT[3]];
    const c = compareFormat(EXPECTED, shuffled, sideOf);
    expect(c).toMatchObject({ correct: true, right: 6, total: 6, extra: 0 });
    expect(c.expected.flat().every((v) => v === 'ok')).toBe(true);
    expect(c.entered).toEqual([['correct', 'correct', 'correct'], ['correct', 'correct'], [], ['correct']]);
  });

  it('says which row is missing', () => {
    const c = compareFormat(EXPECTED, [DR.slice(0, 2), CR, [], RIGHT[3]], sideOf);
    expect(c).toMatchObject({ correct: false, right: 5, total: 6, extra: 0 });
    expect(c.expected[0]).toEqual(['ok', 'ok', 'missing']);
  });

  it('tells a wrong amount, a row on the wrong side and a row on the wrong side of the totals', () => {
    const entered = [
      // The cash with a wrong amount; the purchase entered on the debit side.
      [DR[0], got('Cash A/c', 1500), DR[2], got('Purchases A/c', 40000)],
      // The balance brought down written above the totals.
      [CR[0], got('Balance b/d', 33000)],
      [],
      [],
    ];
    const c = compareFormat(EXPECTED, entered, sideOf);
    expect(c.entered).toEqual([['correct', 'wrongAmount', 'correct', 'wrongSide'], ['correct', 'wrongPlace'], [], []]);
    expect(c.expected).toEqual([['ok', 'amount', 'ok'], ['ok', 'side'], [], ['place']]);
    expect(c).toMatchObject({ correct: false, right: 3, total: 6, extra: 0 });
  });

  it('counts a row that answers to nothing expected as an extra row, and the answer is then not right', () => {
    const c = compareFormat(EXPECTED, [[...DR, got('Rent A/c', 500)], CR, [], RIGHT[3]], sideOf);
    expect(c).toMatchObject({ correct: false, right: 6, total: 6, extra: 1 });
    expect(c.entered[0][3]).toBe('extraRow');
    // A second row for particulars that are expected once is extra too.
    const twice = compareFormat(EXPECTED, [[...DR, got('Cash A/c', 15000)], CR, [], RIGHT[3]], sideOf);
    expect(twice).toMatchObject({ right: 6, extra: 1 });
  });

  it('sets a row with the right label on the wrong side and a wrong amount against the row it was meant for, not as an extra', () => {
    const c = compareFormat(EXPECTED, [DR, [CR[0]], [], RIGHT[3]].map((l, i) => (i === 0 ? [...l, got('Purchases A/c', 4000)] : l)), sideOf);
    expect(c.entered[0][3]).toBe('wrongSide');
    expect(c.expected[1]).toEqual(['ok', 'side']);
    expect(c.extra).toBe(0);
  });

  it('keeps two rows with the same particulars apart by their amounts', () => {
    const expected = [[row('Sales A/c', 500), row('Sales A/c', 900)]];
    expect(compareFormat(expected, [[got('Sales A/c', 900), got('Sales A/c', 500)]]).correct).toBe(true);
    const c = compareFormat(expected, [[got('Sales A/c', 900), got('Sales A/c', 700)]]);
    expect(c.entered).toEqual([['correct', 'wrongAmount']]);
    expect(c.expected).toEqual([['amount', 'ok']]);
  });

  it('tells an amount typed in the wrong column of a statement from a wrong amount', () => {
    const expected = [[row('Cash in hand', 300, 0), row('Capital', 0, 900), row('Drawings', 50, 0)]];
    const c = compareFormat(expected, [[got('Cash in hand', 300, 0), got('Capital', 900, 0), got('Drawings', 0, 60)]]);
    expect(c.entered).toEqual([['correct', 'wrongColumn', 'wrongAmount']]);
    expect(c.expected).toEqual([['ok', 'column', 'amount']]);
    expect(c).toMatchObject({ correct: false, right: 1, total: 3, extra: 0 });
  });

  it('marks nothing entered as every row missing, and ignores a list that is not expected', () => {
    expect(compareFormat(EXPECTED, [], sideOf)).toMatchObject({ correct: false, right: 0, total: 6, extra: 0 });
    expect(compareFormat([DR], [DR, [got('Rent A/c', 5)]]).correct).toBe(true);
  });
});

describe('the figures a statement prints', () => {
  // A comparative statement: the two years are given, the change and its percentage are worked out.
  const GIVEN = [true, true, false, false];
  const revenue: FormatRow = { label: 'Revenue from operations', amounts: [800000, 1000000, 200000, 2500] };
  const tax: FormatRow = { label: 'Tax', amounts: [240000, 300000, 60000, 2500], given: false };
  const total = { subtotal: 'Total revenue', amounts: [800000, 1000000, 200000, 2500] };

  it('are those of the given columns, for a line that takes them up; every other figure is typed', () => {
    expect(printedFigures(revenue.amounts, GIVEN, true)).toEqual([800000, 1000000, null, null]);
    expect(printedFigures(revenue.amounts, GIVEN, false)).toEqual([null, null, null, null]);
    expect(printedFigures(revenue.amounts, undefined, true)).toEqual([null, null, null, null]);
    // A figure of nil is printed as any other: the row leaves the column blank, and says so.
    expect(printedFigures([0, 500000, 500000, 0], GIVEN, true)).toEqual([0, 500000, null, null]);
  });

  it('follow the particulars of a row: under its label and under every other wording, and not where it works them out', () => {
    const other: FormatRow = { label: 'Other income', amounts: [100000, 50000, -50000, -5000], also: ['Other incomes'] };
    const printed = printedByLabel([revenue, other, tax], GIVEN);
    expect(printed.get('Revenue from operations')).toEqual([800000, 1000000, null, null]);
    expect(printed.get('Other incomes')).toEqual(printed.get('Other income'));
    expect(printed.has('Tax')).toBe(false);
    expect(printed.has('Finance costs')).toBe(false);
    expect(printedByLabel([revenue, other], undefined).size).toBe(0);
  });

  it('are refused where the statement cannot give them', () => {
    expect(givenProblem(undefined, 4, [revenue], [])).toBeNull();
    expect(givenProblem(GIVEN, 4, [revenue, tax], [total])).toBeNull();
    expect(givenProblem([true, true], 4, [revenue], [])).toBe('2 columns are said to be given or not, for 4 amount columns');
    expect(givenProblem([false, false, false, false], 4, [revenue], [])).toBe('no column is given');
    // A line that speaks of given figures in a statement that gives none.
    expect(givenProblem(undefined, 4, [tax], [])).toBe('"Tax" says its figures are not given, and the statement gives no column');
    expect(givenProblem(undefined, 4, [revenue], [{ ...total, given: true }])).toBe('the sub-total "Total revenue" is said to be given, and the statement gives no column');
    // The figures a row prints follow its particulars wherever it is entered: two rows of one name must print the same.
    const twice: FormatRow = { label: 'Revenue from operations', amounts: [300000, 400000, 100000, 3333] };
    expect(givenProblem(GIVEN, 4, [revenue, twice], [])).toBe('two rows "Revenue from operations" print different figures: a printed figure follows the particulars of its row');
    expect(givenProblem(GIVEN, 4, [revenue, { ...twice, also: ['Sales'] }, { label: 'Sales', amounts: [1, 2, 3, 4] }], [])).toMatch(/two rows "Revenue from operations" print different figures/);
    expect(givenProblem(GIVEN, 4, [revenue, { ...revenue, given: false }], [])).toMatch(/print different figures/);
    expect(givenProblem(GIVEN, 4, [revenue, { ...revenue, amounts: [800000, 1000000, 1, 1] }], [])).toBeNull();
  });

  it('are refused where they leave nothing to work out', () => {
    const all = [true, true, true, true];
    expect(givenProblem(all, 4, [revenue], [])).toBe('every figure of every row and sub-total is given: nothing is left to work out');
    expect(givenProblem(all, 4, [revenue], [{ ...total, given: true }])).toMatch(/nothing is left to work out/);
    // A sub-total is typed unless it says it is given, and a row may say that it is not.
    expect(givenProblem(all, 4, [revenue], [total])).toBeNull();
    expect(givenProblem(all, 4, [revenue, tax], [{ ...total, given: true }])).toBeNull();
  });
});
