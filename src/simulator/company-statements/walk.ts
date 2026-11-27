import { MAJOR, SUBS, majorOf, type Sub } from './heads';
import { basesOf, bsTwo, changeOf, faceRows, figured, inr, majorTotal, pcText, periodsOf, plTwo, shareOf, totalOf, type ALine, type Company, type Figured } from './sheet';

// ---------------------------------------------------------------------------------------------------------------
// The walk-throughs of Watch, each a list of steps with what moves and why in a sentence or two:
//  - sort: the balances of a company dealt to their sub-heads one sub-head at a time, and the two totals agreeing;
//  - comparative: a statement of two periods, line by line, the change in rupees and as a percentage of the earlier
//    figure, then what it says;
//  - common size: the same statement, each line as a percentage of its period's base, then what it says.
// ---------------------------------------------------------------------------------------------------------------

export interface SortStep {
  title: string;
  text: string;
  /** The sub-head dealt in this step (none for the closing step). */
  sub: Sub | null;
  /** The items placed once the step has played. */
  placed: string[];
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function sortSteps(c: Company): SortStep[] {
  const rows = faceRows(c.holdings);
  const steps: SortStep[] = [];
  const placed: string[] = [];
  rows.forEach((r, k) => {
    for (const x of r.held) placed.push(c.holdings.find((h) => h.id === x.item.id)!.id);
    const names = r.held.map((x, i) => `${i === 0 ? x.item.name : lowerFirst(x.item.name)} ${inr(x.amount)}${x.item.deducted ? ' (deducted)' : ''}`);
    const said = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
    const why = [...new Set(r.held.map((x) => x.item.note))].join(' ');
    const one = r.held.length > 1 ? ` On the face one figure, ${inr(r.amount)}, with Note ${k + 1} listing the items${r.held.some((x) => x.item.deducted) ? ' and taking off what is deducted' : ''}.` : ` On the face: ${inr(r.amount)}, Note ${k + 1}.`;
    steps.push({ title: SUBS[r.sub].label, text: `${said}. ${why}${one}`, sub: r.sub, placed: [...placed] });
  });
  const el = totalOf(rows, false);
  const as = totalOf(rows, true);
  steps.push({
    title: 'The two totals',
    text: `Equity and liabilities: ${(['sf', 'ncl', 'cl'] as const).filter((m) => rows.some((r) => majorOf(r.sub) === m)).map((m) => `${MAJOR[m]} ${inr(majorTotal(rows, m))}`).join(' + ')} = ${inr(el)}. Assets: ${(['nca', 'ca'] as const).map((m) => `${MAJOR[m]} ${inr(majorTotal(rows, m))}`).join(' + ')} = ${inr(as)}. ${el === as ? 'The two totals agree.' : 'The totals do not agree: a balance is in the wrong half.'}`,
    sub: null,
    placed: [...placed],
  });
  return steps;
}

export interface AStep {
  title: string;
  text: string;
  /** The key of the line this step works, or null for the closing reading. */
  key: string | null;
}

const upDown = (x: number) => (x > 0 ? 'up' : 'down');

export const linesOf = (c: Company, statement: 'bs' | 'pl'): ALine[] => (statement === 'bs' ? bsTwo(c) : plTwo(c.pl));

export function comparativeSteps(c: Company, statement: 'bs' | 'pl'): AStep[] {
  const lines = figured(linesOf(c, statement));
  const [p0, p1] = periodsOf(c, statement);
  const steps: AStep[] = lines.map((l) => {
    const { change, pct } = changeOf(l.v);
    const name = l.key === 'totalEl' ? 'Total of equity and liabilities' : l.key === 'totalAssets' ? 'Total of assets' : l.label;
    const head = `${inr(l.v[0])} ${statement === 'bs' ? 'on' : 'in'} ${p0}, ${inr(l.v[1])} ${statement === 'bs' ? 'on' : 'in'} ${p1}`;
    let text: string;
    if (change === 0) text = `${head}: no change.`;
    else if (pct === null) text = `${head}: ${upDown(change)} ${inr(Math.abs(change))}. It was nil on the earlier date, so there is no base and no percentage: the column carries a dash.`;
    else text = `${head}: ${upDown(change)} ${inr(Math.abs(change))}, which is ${pcText(Math.abs(pct))}% of ${inr(l.v[0])}, the earlier figure.`;
    if (l.kind === 'subtotal') text += ' A total has its own change, worked from its own two figures, never by adding the percentages above it.';
    return { title: name, text, key: l.key };
  });
  steps.push({ title: 'What it says', text: comparativeReading(c, statement, lines), key: null });
  return steps;
}

function comparativeReading(c: Company, statement: 'bs' | 'pl', lines: Figured[]): string {
  const at = (key: string) => lines.find((l) => l.key === key)!;
  const p = (key: string) => changeOf(at(key).v).pct ?? 0;
  if (statement === 'pl') {
    const rev = p('rev');
    const exp = p('expenses');
    const pat = p('pat');
    return `Revenue from operations ${rev >= 0 ? 'rose' : 'fell'} ${pcText(Math.abs(rev))}% and total expenses ${exp >= 0 ? 'rose' : 'fell'} ${pcText(Math.abs(exp))}%, so profit after tax ${pat >= 0 ? 'rose' : 'fell'} ${pcText(Math.abs(pat))}%. ${exp < rev ? 'Expenses grew more slowly than revenue: more of each rupee of revenue was left as profit.' : exp > rev ? 'Expenses grew faster than revenue: less of each rupee of revenue was left as profit.' : 'Expenses kept pace with revenue.'} Compare the percentages, not the rupees: a big line moves by a big amount even at a low rate.`;
  }
  const rows = lines.filter((l) => l.kind === 'row' && l.v[0] > 0);
  const fastest = [...rows].sort((a, b) => (changeOf(b.v).pct ?? 0) - (changeOf(a.v).pct ?? 0))[0];
  const total = p('totalAssets');
  const best = changeOf(fastest.v).pct ?? 0;
  const whole = total === 0 ? 'The total of the balance sheet did not change.' : `The total of the balance sheet ${total > 0 ? 'grew' : 'fell'} ${pcText(Math.abs(total))}%.`;
  const line = best > 0 ? `The line that grew fastest is ${lowerFirst(fastest.label)}, up ${pcText(best)}%.` : `No line grew; the one that fell least is ${lowerFirst(fastest.label)}${best === 0 ? ', unchanged' : `, down ${pcText(-best)}%`}.`;
  return `${whole} ${line} A line that grows faster than the total (or falls less) takes a larger share of it, which the common size statement shows.`;
}

export function commonSteps(c: Company, statement: 'bs' | 'pl'): AStep[] {
  const all = linesOf(c, statement);
  const lines = figured(all);
  const base = basesOf(all, statement);
  const [p0, p1] = periodsOf(c, statement);
  const baseName = statement === 'bs' ? 'the total of the balance sheet' : 'revenue from operations';
  // A balance sheet is as at a date ("on 31 March 2026"); a Statement of Profit and Loss is for a year ("in 2025-26").
  const at = statement === 'bs' ? 'on' : 'in';
  const steps: AStep[] = lines.map((l) => {
    const [a, b] = shareOf(l.v, base);
    const name = l.key === 'totalEl' ? 'Total of equity and liabilities' : l.key === 'totalAssets' ? 'Total of assets' : l.label;
    const isBase = statement === 'bs' ? l.kind === 'subtotal' : l.key === 'rev';
    const text = isBase
      ? `${inr(l.v[1])} ${at} ${p1} and ${inr(l.v[0])} ${at} ${p0}: this is the base, 100, of each ${statement === 'bs' ? 'date' : 'year'}. Every other line is a percentage of it.`
      : `${inr(l.v[1])} ÷ ${inr(base[1])} × 100 = ${pcText(b ?? 0)}% ${at} ${p1}; ${pcText(a ?? 0)}% ${at} ${p0} (${inr(l.v[0])} ÷ ${inr(base[0])} × 100). Each ${statement === 'bs' ? 'date' : 'year'} on ${baseName} of the same ${statement === 'bs' ? 'date' : 'year'}.${l.key === 'income' ? ' Other income is not part of the base, so total income is more than 100.' : ''}`;
    return { title: name, text, key: l.key };
  });
  steps.push({ title: 'What it says', text: commonReading(c, statement, lines, base), key: null });
  return steps;
}

function commonReading(c: Company, statement: 'bs' | 'pl', lines: Figured[], base: [number, number]): string {
  const share = (key: string) => shareOf(lines.find((l) => l.key === key)!.v, base);
  const [p0, p1] = periodsOf(c, statement);
  if (statement === 'pl') {
    const [a, b] = share('pat');
    const [ea, eb] = share('expenses');
    return `Of every ₹100 of revenue from operations, ₹${pcText(b ?? 0)} was left as profit after tax in ${p1}, against ₹${pcText(a ?? 0)} in ${p0}; expenses took ₹${pcText(eb ?? 0)} against ₹${pcText(ea ?? 0)}. A change in a share is in percentage points: it is not the percentage change of the amount.`;
  }
  const own = lines.filter((l) => l.kind === 'row' && ['shareCapital', 'reserves', 'warrants'].includes(l.key));
  const ownShare = (k: 0 | 1) => own.reduce((t, l) => t + l.v[k], 0);
  const [a, b] = shareOf([ownShare(0), ownShare(1)], base);
  return `Shareholders' funds made up ${pcText(b ?? 0)}% of the total on ${p1} against ${pcText(a ?? 0)}% on ${p0}: that much of the business is financed by its owners, the rest by what it owes. Each half of a common size balance sheet adds up to 100.`;
}
