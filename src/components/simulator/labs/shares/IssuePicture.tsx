'use client';

import { useRef } from 'react';
import { formatINR } from '@/engine/money';
import type { Issue, IssueStep, Pot, Segment, ShareRow } from '@/simulator/shares/issue';
import { useFlights } from '../kit/flights';

// ---------------------------------------------------------------------------------------------------------------
// A share issue as a picture: the stages along the top; one share of each kind of holder as a bar of its face value
// cut into its instalments (outlined until called, filled when paid, hatched red while in arrears, dotted when paid
// ahead, greyed when forfeited), the premium as a separate tab beside it; and the accounts of the whole issue as
// pots that fill and empty as the money moves (Bank, Share Capital filling up to the issued capital, Securities
// Premium, Calls in Arrears, Calls in Advance, Forfeited Shares, Capital Reserve).
// ---------------------------------------------------------------------------------------------------------------

const HATCH_RED = 'bg-danger-soft bg-[repeating-linear-gradient(135deg,transparent_0_4px,var(--color-danger)_4px_6px)]';
const DOTS = 'bg-[radial-gradient(circle,rgb(255_255_255/0.7)_1.2px,transparent_1.5px)] bg-[length:6px_6px]';

export function stateAt(issue: Issue, shown: number): IssueStep | null {
  return shown > 0 ? issue.steps[Math.min(shown, issue.steps.length) - 1] : null;
}

export function Timeline({ issue, shown }: { issue: Issue; shown: number }) {
  const s = stateAt(issue, shown);
  const at = s ? issue.stages.findIndex((x) => x.stage === s.stage) : -1;
  return (
    <ol aria-label="Stages of the issue" data-testid="lab-shares-timeline" className="flex flex-wrap items-center gap-1 text-xs font-extrabold">
      {issue.stages.map((st, i) => (
        <li key={st.stage} className="flex items-center gap-1">
          <span
            aria-current={i === at ? 'step' : undefined}
            className={`rounded-full border px-2 py-1 transition-colors ${i === at ? 'border-primary bg-primary text-white' : i < at ? 'border-primary bg-primary-soft text-primary-ink' : 'border-dashed border-edge-deep text-muted'}`}
          >
            {i < at ? '✓ ' : ''}
            {st.label}
          </span>
          {i < issue.stages.length - 1 ? (
            <span aria-hidden="true" className="text-muted">
              →
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function segState(s: Segment): string {
  if (s.forfeited) return s.paid > 0 ? 'forfeited: what was paid is kept' : 'forfeited: cancelled';
  if (!s.called) return s.paid > 0 ? `not called, ${formatINR(s.paid)} paid ahead` : 'not called yet';
  if (s.paid >= s.amount) return 'paid';
  const owed = s.arrears ? 'in arrears' : 'called, due';
  if (s.paid > 0) return `${formatINR(s.paid)} paid, ${formatINR(s.amount - s.paid)} ${owed}`;
  return owed;
}

function Bar({ seg }: { seg: Segment }) {
  const part = seg.amount > 0 ? Math.min(1, seg.paid / seg.amount) : 0;
  const premium = seg.key === 'premium';
  const unpaidCalled = seg.arrears && !seg.forfeited && seg.paid < seg.amount;
  const due = seg.called && !seg.arrears && !seg.forfeited && seg.paid < seg.amount;
  return (
    <div
      className={`relative h-9 min-w-0 overflow-hidden rounded-md border-2 ${seg.called || seg.paid > 0 ? 'border-solid' : 'border-dashed'} ${seg.forfeited ? 'border-edge-deep bg-sunken' : premium ? 'border-hue-violet' : 'border-hue-green'} ${unpaidCalled ? HATCH_RED : due ? 'bg-hue-amber-soft' : 'bg-surface'}`}
      style={{ flexGrow: seg.amount, flexBasis: 0 }}
    >
      <div
        className={`absolute inset-0 origin-left transition-transform duration-700 ease-out ${seg.forfeited ? 'bg-edge-deep' : premium ? 'bg-hue-violet' : 'bg-hue-green'} ${!seg.called && seg.paid > 0 ? `bg-hue-amber ${DOTS}` : ''}`}
        style={{ transform: `scaleX(${part})` }}
      />
      <span className={`relative z-10 flex h-full items-center justify-center truncate px-0.5 text-[0.7rem] font-extrabold tabular-nums ${part > 0.5 && !seg.forfeited ? 'text-on-hue' : 'text-ink'} ${seg.forfeited ? 'line-through' : ''}`}>
        {formatINR(seg.amount)}
      </span>
    </div>
  );
}

export function OneShare({ rows }: { rows: ShareRow[] }) {
  return (
    <div className="flex flex-col gap-2" data-testid="lab-shares-one-share">
      {rows.map((r) => {
        const capital = r.segments.filter((s) => s.key !== 'premium');
        const premium = r.segments.filter((s) => s.key === 'premium');
        const capTotal = capital.reduce((t, s) => t + s.amount, 0);
        const premTotal = premium.reduce((t, s) => t + s.amount, 0);
        return (
          <div key={r.key} className="flex min-w-0 flex-col gap-1" data-testid={`lab-shares-row-${r.key}`}>
            <p className="text-xs font-bold">
              {r.label} <span className="font-normal text-muted">({new Intl.NumberFormat('en-IN').format(r.shares)} shares)</span>
            </p>
            <div className="flex min-w-0 items-stretch gap-2">
              <div className="flex min-w-0 gap-0.5" style={{ flexGrow: capTotal, flexBasis: 0 }}>
                {capital.map((s, i) => (
                  <Bar key={`${s.key}${i}`} seg={s} />
                ))}
              </div>
              {premTotal > 0 ? (
                <div className="flex min-w-0 gap-0.5" style={{ flexGrow: premTotal, flexBasis: 0 }}>
                  {premium.map((s, i) => (
                    <Bar key={`p${i}`} seg={s} />
                  ))}
                </div>
              ) : null}
            </div>
            <p className="text-[0.7rem] leading-snug text-muted">
              {r.segments.map((s) => `${s.label} ${formatINR(s.amount)}: ${segState(s)}`).join(' · ')}
            </p>
          </div>
        );
      })}
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem] font-bold text-muted" aria-hidden="true">
        <li className="flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm border-2 border-dashed border-hue-green" /> not called
        </li>
        <li className="flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm border-2 border-hue-green bg-hue-amber-soft" /> called, due
        </li>
        <li className="flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm bg-hue-green" /> paid
        </li>
        <li className="flex items-center gap-1">
          <span className={`inline-block size-3 rounded-sm ${HATCH_RED}`} /> in arrears
        </li>
        <li className="flex items-center gap-1">
          <span className={`inline-block size-3 rounded-sm bg-hue-amber ${DOTS}`} /> paid ahead
        </li>
        <li className="flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm bg-edge-deep" /> forfeited
        </li>
        <li className="flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm bg-hue-violet" /> premium (not capital)
        </li>
      </ul>
    </div>
  );
}

type ShownPot = Exclude<Pot, 'holders'>;

const POT_INFO: Record<ShownPot, { name: string; side: 'Dr' | 'Cr'; fill: string }> = {
  bank: { name: 'Bank A/c', side: 'Dr', fill: 'bg-hue-blue' },
  application: { name: 'Share Application A/c', side: 'Cr', fill: 'bg-hue-sky' },
  due: { name: 'Allotment / call due', side: 'Dr', fill: 'bg-hue-amber' },
  capital: { name: 'Share Capital A/c', side: 'Cr', fill: 'bg-hue-green' },
  premium: { name: 'Securities Premium A/c', side: 'Cr', fill: 'bg-hue-violet' },
  arrears: { name: 'Calls in Arrears A/c', side: 'Dr', fill: 'bg-danger' },
  advance: { name: 'Calls in Advance A/c', side: 'Cr', fill: 'bg-hue-orange' },
  forfeited: { name: 'Forfeited Shares A/c', side: 'Cr', fill: 'bg-edge-deep' },
  reserve: { name: 'Capital Reserve A/c', side: 'Cr', fill: 'bg-hue-teal' },
};

export function Pots({ issue, shown, advanced, reduced }: { issue: Issue; shown: number; advanced: number | null; reduced: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const s = stateAt(issue, shown);
  const x = issue.input;
  const which: ShownPot[] = [
    'bank',
    'application',
    'due',
    'capital',
    ...(x.premium > 0 || (x.reissue && x.reissue.price > x.face) ? (['premium'] as const) : []),
    ...(x.defaulter ? (['arrears'] as const) : []),
    ...(x.advance ? (['advance'] as const) : []),
    ...(x.defaulter ? (['forfeited'] as const) : []),
    ...(x.reissue ? (['reserve'] as const) : []),
  ];
  const max = {} as Record<ShownPot, number>;
  for (const p of which) max[p] = Math.max(1, ...issue.steps.map((st) => Math.abs(st.pots[p])));
  max.capital = Math.max(max.capital, x.offered * x.face);
  useFlights(root, advanced, shown, (i) => issue.steps[i].flows.map((f) => ({ from: f.from, to: f.to, text: formatINR(f.amount) })), reduced);

  return (
    <div ref={root} className="relative flex min-w-0 flex-col gap-2">
      <p data-spot="holders" className="mx-auto w-fit rounded-full border border-dashed border-edge-deep px-3 py-1 text-xs font-bold text-muted">
        Applicants and shareholders
      </p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="The accounts of the issue">
        {which.map((p) => {
          const v = s ? s.pots[p] : 0;
          const info = POT_INFO[p];
          const name = p === 'due' ? (s ? s.dueAccount : 'Share Allotment A/c') : info.name;
          const words =
            p === 'due'
              ? v > 0
                ? `${formatINR(v)} Dr, due`
                : v < 0
                  ? `${formatINR(-v)} Cr, paid ahead`
                  : 'nil'
              : v === 0
                ? 'nil'
                : `${formatINR(Math.abs(v))} ${info.side}`;
          return (
            <li
              key={p}
              data-spot={p}
              data-testid={`lab-shares-pot-${p}`}
              // An empty pot is drawn dashed, in muted words (never faded, so that it can still be read).
              className={`flex min-w-0 flex-col gap-1 rounded-control border px-2 py-1.5 ${p === 'capital' ? 'col-span-2 border-hue-green sm:col-span-3' : 'border-edge'} ${v === 0 ? 'border-dashed bg-sunken text-muted' : 'bg-surface'}`}
            >
              <span className="truncate text-xs font-extrabold">{name}</span>
              <span data-testid={`lab-shares-pot-${p}-amount`} className="text-sm font-extrabold tabular-nums">
                {words}
              </span>
              {p === 'capital' ? (
                <span className="text-xs text-muted">
                  called up so far, of {formatINR(x.offered * x.face)} issued
                </span>
              ) : null}
              <span className="h-2 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
                <span className={`block h-full w-full origin-left rounded-full transition-transform duration-700 ease-out ${info.fill} ${p === 'due' && v < 0 ? DOTS : ''}`} style={{ transform: `scaleX(${Math.min(1, Math.abs(v) / max[p])})` }} />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ShareNote({ issue, shown }: { issue: Issue; shown: number }) {
  const s = stateAt(issue, shown);
  const rows = s ? s.note : [];
  const fmt = (n: number) => formatINR(n).slice(1);
  return (
    <table data-testid="lab-shares-note" className="w-full table-fixed border-collapse text-sm">
      <caption className="pb-1 text-left text-xs text-muted">Notes to Accounts, 1. Share Capital (amounts in ₹)</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Particulars</th>
          <th scope="col">₹</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={2} className="text-muted">
              Nothing to show before the first step.
            </td>
          </tr>
        ) : null}
        {rows.map((r, i) => (
          <tr key={i} className={`align-top ${r.style === 'total' ? 'border-t-2 border-ink/60 font-extrabold' : 'border-t border-edge'}`}>
            <td className={`py-0.5 pr-2 ${r.style === 'heading' ? 'font-extrabold' : ''} ${r.style === 'less' || r.style === 'add' ? 'pl-4' : ''}`}>{r.text}</td>
            <td className="w-24 py-0.5 text-right tabular-nums">{r.amount === null ? '' : r.style === 'less' ? `(${fmt(r.amount)})` : fmt(r.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
