import { createRng, type Rng } from '@/engine/rng';
import { COMPANIES_READY, randomCompany } from './examples';
import { headOf, ITEMS, majorOf, MAJOR, type Sub } from './heads';
import { basesOf, changeOf, figured, inr, isHalfway, pcText, pctH, periodsOf, type Company, type Figured } from './sheet';
import { linesOf } from './walk';

// ---------------------------------------------------------------------------------------------------------------
// "Try it": the head and sub-head of an item, the percentage change of a line, and a line's common size percentage.
// Answered on the picture, which shows the answer once it is given. Nothing is recorded.
// ---------------------------------------------------------------------------------------------------------------

export interface Choice {
  id: string;
  text: string;
  why?: string;
}
/** A percentage in hundredths (12.5% is 1250), never below nil; a fall is said by the word with it. */
export type CsAnswer =
  | { type: 'choice'; options: Choice[]; correct: string }
  | { type: 'percent'; value: number; mistakes: { value: number; why: string }[]; tag?: { label: string; options: Choice[]; correct: string } };

export interface CsAsk {
  kind: CsAskKind;
  prompt: string;
  answer: CsAnswer;
  reason: string;
  /** What the picture shows: the item on the board, or the line (and year) of a statement whose answer is hidden. */
  view: { part: 'sort'; itemId: string } | { part: 'comparative' | 'common'; company: Company; statement: 'bs' | 'pl'; key: string; year: 0 | 1 };
}

export const CS_ASK_KINDS = ['place', 'change', 'common'] as const;
export type CsAskKind = (typeof CS_ASK_KINDS)[number];
export const CS_ASK_LABEL: Record<CsAskKind, string> = {
  place: 'Head and sub-head',
  change: 'Percentage change',
  common: 'Common size percentage',
};

export function csAsk(kind: CsAskKind, rng: Rng): CsAsk {
  if (kind === 'place') return placeAsk(rng);
  return kind === 'change' ? changeAsk(rng) : commonAsk(rng);
}

function placeAsk(rng: Rng): CsAsk {
  const item = rng.pick(ITEMS);
  const wrong = rng.shuffle(item.wrong).slice(0, 3);
  const options: Choice[] = rng.shuffle([{ id: item.sub, text: headOf(item.sub) }, ...wrong.map(([s, why]) => ({ id: s, text: headOf(s), why }))]);
  return {
    kind: 'place',
    prompt: `Where is "${item.name}" shown in a company's balance sheet (Schedule III)?`,
    answer: { type: 'choice', options, correct: item.sub },
    reason: `${item.note}${item.deducted ? ' It is shown as a deduction in the note.' : ''}`,
    view: { part: 'sort', itemId: item.id },
  };
}

const companyOf = (rng: Rng): Company => (rng.int(0, 2) < 2 ? rng.pick(COMPANIES_READY) : randomCompany(rng));

/** A line of a statement fit to ask about: a figure in both periods, a change, and no half-way rounding. */
function pickLine(rng: Rng, test: (l: Figured, c: Company, statement: 'bs' | 'pl') => boolean): { c: Company; statement: 'bs' | 'pl'; line: Figured } {
  for (let k = 0; k < 60; k++) {
    const c = companyOf(rng);
    const statement = rng.pick(['bs', 'pl'] as const);
    const lines = figured(linesOf(c, statement)).filter((l) => test(l, c, statement));
    if (lines.length > 0) return { c, statement, line: rng.pick(lines) };
  }
  throw new Error('no line to ask about');
}

const near = (a: number, b: number) => Math.abs(a - b) <= 2;
function mistakesOf(answer: number, list: [number | null, string][]): { value: number; why: string }[] {
  const out: { value: number; why: string }[] = [];
  for (const [v, why] of list) if (v !== null && v > 0 && !near(v, answer) && !out.some((m) => near(m.value, v))) out.push({ value: v, why });
  return out;
}

const UP_DOWN = (correct: 'up' | 'down') => ({
  label: 'Increase or decrease?',
  options: [
    { id: 'up', text: 'Increase', why: 'The later figure is smaller: a decrease.' },
    { id: 'down', text: 'Decrease', why: 'The later figure is larger: an increase.' },
  ],
  correct,
});

function changeAsk(rng: Rng): CsAsk {
  const { c, statement, line } = pickLine(rng, (l) => l.v[0] > 0 && l.v[1] > 0 && l.v[0] !== l.v[1] && !isHalfway(l.v[1] - l.v[0], l.v[0]) && l.key !== 'totalEl');
  const [p0, p1] = periodsOf(c, statement);
  const { change, pct } = changeOf(line.v);
  const value = Math.abs(pct!);
  const dir = change > 0 ? 'up' : 'down';
  const mistakes = mistakesOf(value, [
    [pctH(Math.abs(change), line.v[1]), `Divided the change by the figure of ${p1}. The base is the earlier figure, ${inr(line.v[0])}.`],
    [pctH(line.v[1], line.v[0]), `Gave the figure of ${p1} as a percentage of the figure of ${p0}, in place of the change.`],
    [pctH(line.v[0], line.v[1]), `Divided the figure of ${p0} by the figure of ${p1}, without taking the change.`],
  ]);
  const name = line.key === 'totalAssets' ? 'the total of the balance sheet' : line.label.charAt(0).toLowerCase() + line.label.slice(1);
  return {
    kind: 'change',
    prompt: `In ${statement === 'bs' ? 'the balance sheet' : 'the Statement of Profit and Loss'} of ${c.name}, ${name} ${statement === 'bs' ? 'stood at' : 'was'} ${inr(line.v[0])} ${statement === 'bs' ? 'on' : 'in'} ${p0} and ${inr(line.v[1])} ${statement === 'bs' ? 'on' : 'in'} ${p1}. By what percentage did it change? Give it to two decimal places if it is not whole.`,
    answer: { type: 'percent', value, mistakes, tag: UP_DOWN(dir) },
    reason: `Change = ${inr(line.v[1])} - ${inr(line.v[0])} = ${change < 0 ? '-' : ''}${inr(Math.abs(change))}. Percentage change = ${inr(Math.abs(change))} ÷ ${inr(line.v[0])} (the earlier figure) × 100 = ${pcText(value)}%, ${dir === 'up' ? 'an increase' : 'a decrease'}.`,
    view: { part: 'comparative', company: c, statement, key: line.key, year: 1 },
  };
}

function commonAsk(rng: Rng): CsAsk {
  const year = rng.int(0, 1) as 0 | 1;
  const { c, statement, line } = pickLine(rng, (l, co, st) => {
    const base = basesOf(linesOf(co, st), st)[year];
    const isBase = st === 'bs' ? l.kind === 'subtotal' : l.key === 'rev';
    return !isBase && l.v[year] > 0 && !isHalfway(l.v[year], base);
  });
  const all = linesOf(c, statement);
  const base = basesOf(all, statement);
  const [p0, p1] = periodsOf(c, statement);
  const when = year === 0 ? p0 : p1;
  const value = pctH(line.v[year], base[year])!;
  const lines = figured(all);
  const list: [number | null, string][] = [[pctH(line.v[year], base[1 - year]), `Took the base of ${year === 0 ? p1 : p0}. Each year is a percentage of its own base.`]];
  if (statement === 'pl') {
    const income = lines.find((l) => l.key === 'income')!.v[year];
    const expenses = lines.find((l) => l.key === 'expenses')!.v[year];
    list.push([pctH(line.v[year], income), 'Took total income as the base. A common size Statement of Profit and Loss is on revenue from operations, 100.']);
    if (line.key.startsWith('exp')) list.push([pctH(line.v[year], expenses), 'Took total expenses as the base. Every line is a percentage of revenue from operations.']);
  } else {
    const m = majorOf(line.key as Sub);
    const headTotal = lines.filter((l) => l.kind === 'row' && majorOf(l.key as Sub) === m).reduce((t, l) => t + l.v[year], 0);
    list.push([pctH(line.v[year], headTotal), `Took ${MAJOR[m].toLowerCase()} alone as the base. A common size balance sheet is on the total of the balance sheet.`]);
    list.push([pctH(line.v[year], 2 * base[year]), 'Added the two halves together. The total of the balance sheet is the total of one half: the two are equal.']);
  }
  const mistakes = mistakesOf(value, list);
  const name = line.label.charAt(0).toLowerCase() + line.label.slice(1);
  const baseName = statement === 'bs' ? `the total of the balance sheet, ${inr(base[year])}` : `revenue from operations, ${inr(base[year])}`;
  return {
    kind: 'common',
    prompt: `In the common size ${statement === 'bs' ? 'balance sheet' : 'Statement of Profit and Loss'} of ${c.name} (${statement === 'bs' ? 'total of the balance sheet = 100' : 'revenue from operations = 100'}), what percentage is ${name} ${statement === 'bs' ? 'on' : 'for'} ${when}? It stands at ${inr(line.v[year])}. Give it to two decimal places if it is not whole.`,
    answer: { type: 'percent', value, mistakes },
    reason: `${inr(line.v[year])} ÷ ${baseName} × 100 = ${pcText(value)}%.`,
    view: { part: 'common', company: c, statement, key: line.key, year },
  };
}

/** A percentage as a learner types it ("16.67", "25 %", "12.5%") in hundredths, or null. */
export function parsePercent(text: string): number | null {
  const t = text.replace(/[%\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

export interface Verdict {
  right: boolean;
  why: string | null;
}

/** Marks an answer: an option, or a percentage with the word with it. */
export function judgeCs(answer: CsAnswer, given: { choice?: string | null; typed?: string; tag?: string | null }): Verdict {
  if (answer.type === 'choice') {
    const right = given.choice === answer.correct;
    return { right, why: right ? null : (answer.options.find((o) => o.id === given.choice)?.why ?? null) };
  }
  const h = parsePercent(given.typed ?? '');
  if (h === null) return { right: false, why: 'Type a percentage, such as 12.5 or 16.67.' };
  const tagRight = !answer.tag || given.tag === answer.tag.correct;
  if (h === answer.value) return tagRight ? { right: true, why: null } : { right: false, why: `The percentage is right, but not the word with it. ${answer.tag!.options.find((o) => o.id === given.tag)?.why ?? ''}`.trim() };
  const known = answer.mistakes.find((m) => near(m.value, h));
  if (known) return { right: false, why: known.why };
  // One hundredth out is the slip of cutting the third decimal place off (or rounding it the wrong way).
  if (Math.abs(h - answer.value) === 1) return { right: false, why: `Close: to two decimal places it is ${pcText(answer.value)}. Round on the third decimal place (5 or more rounds up), do not cut it off.` };
  if (Math.abs(h - answer.value) <= 10) return { right: false, why: `Close, but not exact: to two decimal places it is ${pcText(answer.value)}. Work the division again.` };
  return { right: false, why: `${pcText(h)}% is not it.` };
}

/** The made-up figures of the `n`th question of a kind, from a seed: the screen and the tests draw the same. */
export const askRng = (seed: number, kind: CsAskKind, n: number): Rng => createRng(seed * 1031 + CS_ASK_KINDS.indexOf(kind) * 149 + n);
