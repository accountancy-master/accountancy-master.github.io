import { endOf, inr, resultOf, resultWords, startOf, yearOf, type Inputs } from './model';

// ---------------------------------------------------------------------------------------------------------------
// The walk: the statement of affairs on each date built block by block, the private items left out, then the
// capital ladder from the closing capital to the profit, then each adjustment to the net profit.
// ---------------------------------------------------------------------------------------------------------------

export type StepId =
  | 'open-assets'
  | 'open-liabilities'
  | 'open-capital'
  | 'privates'
  | 'close-assets'
  | 'close-liabilities'
  | 'close-capital'
  | 'ladder-close'
  | 'ladder-drawings'
  | 'ladder-additional'
  | 'ladder-open'
  | `adj-${string}`;

export interface WalkStep {
  id: StepId;
  title: string;
  text: string;
}

const upperFirst = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const list = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

export function walkOf(i: Inputs): WalkStep[] {
  const r = resultOf(i);
  const start = startOf(i);
  const end = endOf(i);
  const assets = (k: 'open' | 'close') => i.items.filter((x) => x.side === 'asset' && x[k] > 0);
  const liabs = (k: 'open' | 'close') => i.items.filter((x) => x.side === 'liability' && x[k] > 0);
  const named = (xs: typeof i.items, k: 'open' | 'close') => list(xs.map((x) => `${x.label.toLowerCase()} ${inr(x[k])}`));
  const steps: WalkStep[] = [
    { id: 'open-assets', title: `${start}: what the business owns`, text: `The assets on ${start} are stacked up: ${named(assets('open'), 'open')}. Together ${inr(r.assets[0])}. No ledger gives them: they are counted, listed from the records that are kept, and valued.` },
    {
      id: 'open-liabilities',
      title: `${start}: what it owes`,
      text: `Against them, what the business owes: ${named(liabs('open'), 'open')}, together ${inr(r.liabilities[0])}.${liabs('open').some((x) => x.id === 'overdraft') ? ' An overdraft is money owed to the bank: a liability.' : ''}`,
    },
    { id: 'open-capital', title: `${start}: capital, the balancing figure`, text: `The gap between the two stacks is what the business owes its proprietor: capital = ${inr(r.assets[0])} - ${inr(r.liabilities[0])} = ${inr(r.capital[0])}. It is written on the liabilities side, so that the two totals agree.` },
    { id: 'close-assets', title: `${end}: what it owns`, text: `The same count a year later: ${named(assets('close'), 'close')}. Together ${inr(r.assets[1])}. (These figures are before the adjustments that come later.)` },
    { id: 'close-liabilities', title: `${end}: what it owes`, text: `And what it owes: ${named(liabs('close'), 'close')}, together ${inr(r.liabilities[1])}.${liabs('close').some((x) => x.id === 'overdraft') ? ' The overdraft is a liability.' : ''}` },
    ...(i.privates.length
      ? [
          {
            id: 'privates' as const,
            title: 'Left out: what is the proprietor’s own',
            text: `${upperFirst(list(i.privates.map((p) => `${p.label.toLowerCase()} (${inr(p.amount)})`)))} ${i.privates.length > 1 ? 'belong' : 'belongs'} to the proprietor privately, not to the business. The business is separate from its owner, so a private ${i.privates.every((p) => p.owned) ? 'asset' : 'debt'} never goes into its statement of affairs.`,
          },
        ]
      : []),
    { id: 'close-capital', title: `${end}: capital, the balancing figure`, text: `Capital on ${end} = ${inr(r.assets[1])} - ${inr(r.liabilities[1])} = ${inr(r.capital[1])}. It ${r.capital[1] > r.capital[0] ? 'grew' : r.capital[1] < r.capital[0] ? 'fell' : 'stayed the same'} by ${inr(Math.abs(r.capital[1] - r.capital[0]))} in the year, but that is not yet the profit: the proprietor also took money out and may have put some in.` },
    { id: 'ladder-close', title: 'The capital ladder: start from the closing capital', text: `Start from the capital at the end, ${inr(r.capital[1])}, and undo what the proprietor did to it, so that only what the business earned is left.` },
    {
      id: 'ladder-drawings',
      title: 'Add back the drawings',
      text: `The drawings lowered the closing capital, but they are not a loss of the business, so they are added back: ${list(r.drawingsParts.map((p) => `${p.label.toLowerCase()} ${p.how}`))}${r.drawingsParts.length > 1 ? `, ${inr(r.drawings)} in all` : ''}.${i.drawings.goodsCost ? ' Goods are taken at cost: the business made no sale.' : ''}${i.drawings.salary ? ' A salary the proprietor takes is drawings.' : ''}`,
    },
    ...(r.additional
      ? [{ id: 'ladder-additional' as const, title: 'Take off the additional capital', text: `${i.additional!.label}: ${inr(r.additional)}. It raised the closing capital without being earned, so it is deducted. Adjusted closing capital = ${inr(r.capital[1])} + ${inr(r.drawings)} - ${inr(r.additional)} = ${inr(r.adjusted)}.` }]
      : []),
    {
      id: 'ladder-open',
      title: 'Compare with the opening capital',
      text: `${r.additional ? '' : `Adjusted closing capital = ${inr(r.capital[1])} + ${inr(r.drawings)} = ${inr(r.adjusted)}. `}Set against the capital at the beginning, ${inr(r.capital[0])}: ${inr(r.adjusted)} - ${inr(r.capital[0])} = ${r.before < 0 ? `-${inr(-r.before)}` : inr(r.before)}, ${resultWords(r.before)} for the ${yearOf(i)}${r.adjs.length ? ', before the adjustments' : ''}.${r.before > 0 && r.capital[1] < r.capital[0] ? ' The capital fell, yet the business made a profit: the proprietor drew out more than the profit.' : ''}`,
    },
    ...r.adjs.map((a, k): WalkStep => {
      const after = r.before + r.adjs.slice(0, k + 1).reduce((t, x) => t + x.effect, 0);
      return {
        id: `adj-${a.key}`,
        title: a.label,
        text: `${a.label.replace(/^(Less|Add): /, '')}: ${a.how}, ${a.effect < 0 ? 'deducted' : 'added'}. ${a.why}${k === r.adjs.length - 1 ? ` Net result: ${resultWords(after)}.` : ''}`,
      };
    }),
  ];
  return steps;
}

/** What the picture shows after `shown` steps. */
export interface Standing {
  has(id: StepId): boolean;
  last: StepId | null;
  /** The adjustments made so far. */
  adjs: number;
}
export function standingAfter(walk: readonly WalkStep[], shown: number): Standing {
  const done = walk.slice(0, shown);
  const ids = new Set(done.map((s) => s.id));
  return { has: (id) => ids.has(id), last: done.at(-1)?.id ?? null, adjs: done.filter((s) => s.id.startsWith('adj-')).length };
}

/** The index of a step (the count of steps up to and including it), or the end when it is not in the walk. */
export const upTo = (walk: readonly WalkStep[], id: StepId): number => {
  const k = walk.findIndex((s) => s.id === id);
  return k < 0 ? walk.length : k + 1;
};
