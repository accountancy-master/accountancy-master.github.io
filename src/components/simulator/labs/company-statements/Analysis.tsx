'use client';

import { basesOf, changeOf, figured, inr, pcText, shareOf, type ALine, type Figured } from '@/simulator/company-statements/sheet';
import { Arrive } from '../kit/Arrive';
import { P } from './Board';

// ---------------------------------------------------------------------------------------------------------------
// The two tools of analysis drawn. Comparative: each line as two bars on one scale, the earlier period outlined and
// the later one filled, the later bar growing or shrinking from the earlier length when the line is worked, with the
// change in rupees and as a percentage of the earlier figure. Common size: each period as a bar of 100 (the total
// of the balance sheet, each half; or revenue from operations, with what it went on and what was left), cut into
// the share of each line. Beside each, the statement in the board's format. Every figure drawn is also in text.
// ---------------------------------------------------------------------------------------------------------------

export type Tool = 'comparative' | 'common';
export interface Hidden {
  key: string;
  year: 0 | 1;
}

const num = (p: number) => (p < 0 ? `(${inr(-p).slice(1)})` : inr(p).slice(1));
const pcCell = (h: number | null) => (h === null ? '—' : h < 0 ? `(${pcText(-h)})` : pcText(h));
const nameOf = (l: Figured) => (l.key === 'totalEl' ? 'Total of equity and liabilities' : l.key === 'totalAssets' ? 'Total of assets' : l.label);

const SEGMENTS = ['bg-hue-violet', 'bg-hue-blue', 'bg-hue-sky', 'bg-hue-teal', 'bg-hue-green', 'bg-hue-amber', 'bg-hue-orange', 'bg-hue-rose'];

export interface AnalysisProps {
  lines: ALine[];
  /** The two periods, earlier first. */
  periods: [string, string];
  /** The title of the statement in the board's format. */
  title: string;
  statement: 'bs' | 'pl';
  tool: Tool;
  /** How many lines (rows and totals) have been worked: the others wait. */
  worked: number;
  focus?: string | null;
  hidden?: Hidden | null;
  reduced: boolean;
}

export function Analysis(props: AnalysisProps) {
  return (
    <div data-testid={`${P}-analysis`} data-tool={props.tool} className="flex min-w-0 flex-col gap-3">
      {props.tool === 'comparative' ? <ComparativeBars {...props} /> : <CommonBars {...props} />}
      <Format {...props} />
    </div>
  );
}

function ComparativeBars({ periods, statement, lines, worked, focus = null, hidden = null, reduced }: AnalysisProps) {
  const [p0, p1] = periods;
  const f = figured(lines);
  const max = Math.max(1, ...f.map((l) => Math.max(Math.abs(l.v[0]), Math.abs(l.v[1]))));
  const w = (v: number) => `${Math.max(0, Math.min(100, (Math.abs(v) / max) * 100))}%`;
  const scale = (v: number) => Math.max(0, Math.min(1, Math.abs(v) / max));
  return (
    <section aria-labelledby="cs-cmp-title" data-testid={`${P}-bars`} className="flex min-w-0 flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
      <h3 id="cs-cmp-title" className="text-base font-extrabold">
        Two {statement === 'bs' ? 'dates' : 'years'} side by side
      </h3>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden="true">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-6 rounded-sm border-2 border-dashed border-edge-deep" /> {p0}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-6 rounded-sm bg-hue-blue" /> {p1}
        </li>
        <li>▲ increase · ▼ decrease, % of the earlier figure</li>
      </ul>
      <ul className="flex flex-col gap-1.5">
        {lines.map((l, k) => {
          if (l.kind === 'heading') return (
            <li key={`h${k}`} className="pt-1 text-xs font-extrabold uppercase tracking-wide text-muted">
              {l.text}
            </li>
          );
          const at = f.indexOf(l);
          const done = at < worked;
          const hide = hidden?.key === l.key;
          const { change, pct } = changeOf(l.v);
          const said = !done || hide ? '…' : change === 0 ? 'no change' : `${change > 0 ? '▲' : '▼'} ${inr(Math.abs(change))} · ${pct === null ? 'no % (nil before)' : `${pcText(Math.abs(pct))}%`}`;
          return (
            <li
              key={l.key}
              data-testid={`${P}-bar-${l.key}`}
              data-worked={done ? 'true' : 'false'}
              className={`flex min-w-0 flex-col gap-0.5 rounded-control px-1.5 py-1 ${focus === l.key || hide ? 'bg-primary-soft' : ''} ${l.kind === 'subtotal' ? 'border-t border-edge-deep' : ''}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                <span className={l.kind === 'subtotal' ? 'font-extrabold' : 'font-bold'}>{nameOf(l)}</span>
                <span data-testid={`${P}-bar-${l.key}-change`} className={`text-xs font-extrabold tabular-nums ${done && !hide ? (change > 0 ? 'text-primary-ink' : change < 0 ? 'text-danger-deep' : 'text-muted') : 'text-muted'}`}>
                  {said}
                </span>
              </div>
              <div aria-hidden="true" className="relative h-2.5 rounded-sm bg-sunken">
                <div className="absolute inset-y-0 left-0 rounded-sm border-2 border-dashed border-edge-deep" style={{ width: w(l.v[0]) }} />
              </div>
              <div aria-hidden="true" className="relative h-2.5 overflow-hidden rounded-sm bg-sunken">
                <div
                  className={`absolute inset-y-0 left-0 w-full origin-left rounded-sm ${l.kind === 'subtotal' ? 'bg-hue-violet' : 'bg-hue-blue'} ${reduced ? '' : 'transition-transform duration-1000 ease-out'}`}
                  style={{ transform: `scaleX(${done ? scale(l.v[1]) : scale(l.v[0])})`, opacity: done ? 1 : 0.35 }}
                />
              </div>
              <p className="text-[0.7rem] text-muted tabular-nums">
                {p0}: {inr(l.v[0])} · {p1}: {inr(l.v[1])}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CommonBars({ periods, statement, lines, worked, hidden = null, reduced }: AnalysisProps) {
  const f = figured(lines);
  const base = basesOf(lines, statement);
  const shown = (l: Figured) => f.indexOf(l) < worked;
  const rows = f.filter((l) => l.kind === 'row');
  // The bars of a period: the two halves of a balance sheet, or revenue (100) and what it went on.
  const bars: { label: string; parts: Figured[]; k: 0 | 1 }[] = [];
  for (const k of [0, 1] as const) {
    if (statement === 'bs') {
      const elEnd = f.findIndex((l) => l.key === 'totalEl');
      bars.push({ label: `Equity and liabilities, ${periods[k]}`, parts: rows.filter((l) => f.indexOf(l) < elEnd), k });
      bars.push({ label: `Assets, ${periods[k]}`, parts: rows.filter((l) => f.indexOf(l) > elEnd), k });
    } else {
      bars.push({ label: `${periods[k]}: what came in (revenue from operations = 100, and other income)`, parts: rows.filter((l) => l.key === 'rev' || l.key === 'oi'), k });
      const out = [...rows.filter((l) => l.key.startsWith('exp') || l.key === 'tax'), f.find((l) => l.key === 'pat')!];
      bars.push({ label: `${periods[k]}: where it went`, parts: out, k });
    }
  }
  const top = statement === 'bs' ? 10000 : Math.max(10000, ...([0, 1] as const).map((k) => shareOf(f.find((l) => l.key === 'income')!.v, base)[k] ?? 0));
  const colour = (l: Figured) => (l.key === 'pat' ? 'bg-hue-green' : l.key === 'rev' ? 'bg-hue-sky' : l.key === 'oi' ? 'bg-hue-teal' : SEGMENTS[rows.indexOf(l) % SEGMENTS.length]);
  return (
    <section aria-labelledby="cs-common-title" data-testid={`${P}-bars`} className="flex min-w-0 flex-col gap-3 rounded-card border border-edge bg-surface p-3 shadow-card">
      <h3 id="cs-common-title" className="text-base font-extrabold">
        Each line as a share of {statement === 'bs' ? 'the total (100)' : 'revenue from operations (100)'}
      </h3>
      {bars.map((b) => {
        const parts = b.parts.map((l) => ({ l, pct: shareOf(l.v, base)[b.k] ?? 0, on: shown(l), hide: hidden?.key === l.key && hidden.year === b.k }));
        return (
          <div key={b.label} className="flex min-w-0 flex-col gap-1" data-testid={`${P}-stack`}>
            <p className="text-xs font-bold">{b.label}</p>
            <div aria-hidden="true" className="relative flex h-8 w-full overflow-hidden rounded-md bg-sunken">
              {parts.map(({ l, pct, on, hide }) =>
                on && pct > 0 ? (
                  <Arrive key={`${l.key}`} reduced={reduced} from="scaleX(0)" className={`flex h-full origin-left items-center justify-center overflow-hidden border-r border-white/70 text-[0.65rem] font-extrabold ${hide ? 'bg-edge-deep text-ink' : `${colour(l)} text-on-hue`}`} style={{ width: `${(pct / top) * 100}%` }}>
                    <span className="truncate px-0.5">{hide ? '?' : pct / top > 0.07 ? `${pcText(pct)}` : ''}</span>
                  </Arrive>
                ) : null,
              )}
              {statement === 'pl' ? <span className="absolute inset-y-0 border-l-2 border-ink" style={{ left: `${(10000 / top) * 100}%` }} /> : null}
            </div>
            <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-[0.7rem]">
              {parts.map(({ l, pct, on, hide }) => (
                <li key={l.key} className={on ? '' : 'text-muted'}>
                  <span aria-hidden="true" className={`mr-1 inline-block h-2 w-2 rounded-sm ${hide ? 'bg-edge-deep' : colour(l)}`} />
                  {l.label}: <span className="font-bold tabular-nums">{on && !hide ? `${pcText(pct)}%` : '…'}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {statement === 'pl' ? <p className="text-xs text-muted">The dark line is 100, revenue from operations. Other income takes the bar past it: total income is more than 100.</p> : <p className="text-xs text-muted">Each half adds up to 100 (a rounded line may leave it 0.01 off).</p>}
    </section>
  );
}

function Format({ periods, title, statement, tool, lines, worked, focus = null, hidden = null }: AnalysisProps) {
  const [p0, p1] = periods;
  const f = figured(lines);
  const base = basesOf(lines, statement);
  const cols = tool === 'comparative' ? [`${p0} (₹)`, `${p1} (₹)`, 'Absolute change (₹)', 'Percentage change (%)'] : [`${p0} (₹)`, `${p1} (₹)`, `${p0} (%)`, `${p1} (%)`];
  return (
    <section aria-labelledby="cs-format2-title" data-testid={`${P}-statement`} className="flex min-w-0 flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
      <h3 id="cs-format2-title" className="text-base font-extrabold">
        {title}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-edge-deep text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="py-1 pr-2 text-left">
                Particulars
              </th>
              {cols.map((c) => (
                <th key={c} scope="col" className="w-24 py-1 pl-2 text-right">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, k) => {
              if (l.kind === 'heading') return (
                <tr key={`h${k}`}>
                  <th scope="colgroup" colSpan={5} className="pt-2 text-left text-xs font-extrabold">
                    {l.text}
                  </th>
                </tr>
              );
              const done = f.indexOf(l) < worked;
              const { change, pct } = changeOf(l.v);
              const [s0, s1] = shareOf(l.v, base);
              const hide = (year: 0 | 1) => hidden?.key === l.key && (tool === 'comparative' || hidden.year === year);
              const cells = tool === 'comparative' ? [num(l.v[0]), num(l.v[1]), done && !hide(1) ? num(change) : '…', done && !hide(1) ? pcCell(pct) : '…'] : [num(l.v[0]), num(l.v[1]), done && !hide(0) ? pcCell(s0) : '…', done && !hide(1) ? pcCell(s1) : '…'];
              return (
                <tr key={l.key} data-testid={`${P}-row-${l.key}`} className={`border-b border-edge ${l.kind === 'subtotal' ? 'font-extrabold' : ''} ${focus === l.key ? 'bg-primary-soft' : ''}`}>
                  <td className={`py-0.5 pr-2 ${l.kind === 'row' && statement === 'bs' ? 'pl-3' : ''}`}>{l.label}</td>
                  {cells.map((c, i) => (
                    <td key={i} className="py-0.5 pl-2 text-right tabular-nums">
                      {c}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        {tool === 'comparative'
          ? 'Absolute change = later figure - earlier figure; percentage change = absolute change ÷ earlier figure × 100, to two decimal places. A decrease is in brackets; a dash where the earlier figure is nil.'
          : `Each figure ÷ ${statement === 'bs' ? 'the total of the balance sheet' : 'revenue from operations'} of its own ${statement === 'bs' ? 'date' : 'year'} × 100, to two decimal places.`}
      </p>
    </section>
  );
}
