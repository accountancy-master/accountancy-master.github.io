'use client';

import { formatINR } from '@/engine/money';
import { cmp, ZERO } from '@/simulator/partnership/fraction';
import { GW_METHODS, METHOD_NAME, show, toPaise, totalAssetsOf, type GwMethod, type Valuation } from '@/simulator/goodwill/valuation';
import { Arrive } from '../kit/Arrive';

// ---------------------------------------------------------------------------------------------------------------
// The capital employed (the assets at work in the business, less what is owed to outsiders) and the goodwill: a
// profit repeated for the years' purchase, or a capitalised value set against the capital employed, and the four
// methods side by side.
// ---------------------------------------------------------------------------------------------------------------

const P = 'lab-goodwill';
const inr = formatINR;
const pct = (part: number, whole: number) => (whole > 0 ? Math.max(0, Math.min(100, (part / whole) * 100)) : 0);

export function CapitalBar({ v, reduced }: { v: Valuation; reduced: boolean }) {
  const b = v.inputs.books;
  const total = totalAssetsOf(b);
  const out = [
    { label: 'Goodwill in the books', amount: b.goodwill },
    { label: 'Non-trade investments', amount: b.nonTrade },
    { label: 'Deferred advertisement expenditure (fictitious)', amount: b.fictitious },
  ].filter((x) => x.amount > 0);
  return (
    <section aria-labelledby="gw-capital-title" data-testid={`${P}-capital`} className="flex min-w-0 flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
      <h3 id="gw-capital-title" className="text-base font-extrabold text-hue-teal">
        Capital employed
      </h3>
      <div aria-hidden="true" className="flex h-9 overflow-hidden rounded-control border border-edge bg-sunken">
        <Arrive reduced={reduced} from="scaleX(0)" className="relative block h-full origin-left" style={{ width: `${pct(b.trade, total)}%` }}>
          <span className="absolute inset-y-0 left-0 bg-hue-teal/80" style={{ width: `${pct(v.capitalEmployed, b.trade)}%` }} />
          <span className="absolute inset-y-0 right-0 bg-hue-rose/60" style={{ width: `${pct(b.outside, b.trade)}%` }} />
        </Arrive>
        {out.map((x) => (
          <span key={x.label} className="sim-deduction block h-full border-l border-white/70" style={{ width: `${pct(x.amount, total)}%` }} />
        ))}
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-sm">
        <dt>Assets used in the business</dt>
        <dd className="text-right tabular-nums">{inr(b.trade)}</dd>
        {out.map((x) => (
          <div key={x.label} className="contents text-muted">
            <dt className="flex items-center gap-1.5">
              <span aria-hidden="true" className="sim-deduction inline-block h-3 w-3 shrink-0 rounded-sm" />
              {x.label}: left out
            </dt>
            <dd className="text-right tabular-nums">({inr(x.amount)})</dd>
          </div>
        ))}
        <dt className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3 w-3 shrink-0 rounded-sm bg-hue-rose/60" />
          Less: outside liabilities
        </dt>
        <dd className="text-right tabular-nums">({inr(b.outside)})</dd>
        <dt className="flex items-center gap-1.5 font-extrabold">
          <span aria-hidden="true" className="inline-block h-3 w-3 shrink-0 rounded-sm bg-hue-teal/80" />
          Capital employed
        </dt>
        <dd data-testid={`${P}-capital-employed`} className="text-right font-extrabold tabular-nums">
          {inr(v.capitalEmployed)}
        </dd>
      </dl>
    </section>
  );
}

/** The years' purchase as blocks: the profit repeated for each year, the last one cut in half for a half year. */
function YearsBlocks({ v, m, reduced }: { v: Valuation; m: 'average' | 'super'; reduced: boolean }) {
  const each = m === 'average' ? v.averageAfter : v.superProfit;
  const n = v.inputs.purchase;
  const whole = Math.floor(n);
  const half = n - whole > 0;
  const blocks = [...Array.from({ length: whole }, () => 1), ...(half ? [0.5] : [])];
  return (
    <div className="flex flex-col gap-1">
      <div aria-hidden="true" className="flex h-12 gap-1">
        {blocks.map((w, i) => (
          <Arrive
            key={`${m}-${i}`}
            reduced={reduced}
            from="translateY(-2rem)"
            ms={500 + i * 250}
            className={`flex h-full items-center justify-center rounded-control text-xs font-extrabold text-on-hue ${m === 'average' ? 'bg-hue-amber' : 'bg-hue-green'}`}
            style={{ flex: `${w} 1 0` }}
          >
            {w === 1 ? `Year ${i + 1}` : '½'}
          </Arrive>
        ))}
      </div>
      <p className="text-sm">
        {m === 'average' ? 'Average profit' : 'Super profit'} {show(each)} x {n} years&apos; purchase
      </p>
    </div>
  );
}

/** The capitalised value against the capital employed: the gap is goodwill. */
function CapitalisedBars({ v, m, reduced }: { v: Valuation; m: 'capAverage' | 'capSuper'; reduced: boolean }) {
  const cv = toPaise(v.capitalisedValue);
  const ce = v.capitalEmployed;
  const most = Math.max(cv, ce, 1);
  const gw = toPaise(v.goodwill[m]);
  const rows =
    m === 'capAverage'
      ? [
          { label: `Capitalised value: ${show(v.averageAfter)} x 100 / ${v.inputs.rate}`, amount: cv, cls: 'bg-hue-amber' },
          { label: 'Capital employed', amount: ce, cls: 'bg-hue-teal/80' },
        ]
      : [{ label: `Super profit capitalised: ${show(v.superProfit)} x 100 / ${v.inputs.rate}`, amount: gw, cls: 'bg-hue-green' }];
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-col gap-0.5">
          <p className="flex flex-wrap justify-between gap-x-2 text-sm">
            <span>{r.label}</span>
            <span className="font-extrabold tabular-nums">{inr(r.amount)}</span>
          </p>
          <div aria-hidden="true" className="h-5 overflow-hidden rounded-control bg-sunken">
            <Arrive reduced={reduced} from="scaleX(0)" className={`block h-full origin-left ${r.cls}`} style={{ width: `${pct(r.amount, most)}%` }} />
          </div>
        </div>
      ))}
      {m === 'capAverage' && gw > 0 ? <p className="text-xs text-muted">The firm earns its average profit with {inr(ce)} where a normal firm would need {inr(cv)}: the difference is goodwill.</p> : null}
    </div>
  );
}

export function GoodwillPanel({ v, reduced, method = v.inputs.method }: { v: Valuation; reduced: boolean; method?: GwMethod }) {
  const m = method;
  const gw = v.goodwill[m];
  const none = cmp(v.raw[m], ZERO) <= 0;
  return (
    <section aria-labelledby="gw-goodwill-title" data-testid={`${P}-goodwill`} className="flex min-w-0 flex-col gap-3 rounded-card border border-edge bg-surface p-3 shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 id="gw-goodwill-title" className="text-base font-extrabold">
          Goodwill: {METHOD_NAME[m].toLowerCase()}
        </h3>
        <p data-testid={`${P}-goodwill-value`} className={`text-lg font-extrabold tabular-nums ${none ? 'text-muted' : 'text-primary-ink'}`}>
          {none ? 'Nil' : show(gw)}
        </p>
      </header>
      {none ? (
        <p className="rounded-control bg-sunken px-3 py-2 text-sm">
          {m === 'average' ? 'The average is nil or a loss: there is nothing to value.' : 'The firm earns no more than a normal firm would on the same capital, so there is no goodwill by this method.'}
        </p>
      ) : m === 'average' || m === 'super' ? (
        <YearsBlocks v={v} m={m} reduced={reduced} />
      ) : (
        <CapitalisedBars v={v} m={m} reduced={reduced} />
      )}
      <table data-testid={`${P}-methods`} className="w-full border-collapse text-sm">
        <caption className="pb-1 text-left text-xs font-extrabold uppercase tracking-wide text-muted">The same firm by every method</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Method</th>
            <th scope="col">Goodwill</th>
          </tr>
        </thead>
        <tbody>
          {GW_METHODS.map((x) => (
            <tr key={x} aria-current={x === m ? 'true' : undefined} className={`border-t border-edge ${x === m ? 'bg-primary-soft font-extrabold' : ''}`}>
              <td className="py-1 pr-2">
                {x === m ? '▸ ' : ''}
                {METHOD_NAME[x]}
                {x === 'average' || x === 'super' ? ` (${v.inputs.purchase} years)` : ''}
              </td>
              <td className="py-1 text-right tabular-nums">{cmp(v.raw[x], ZERO) <= 0 ? 'Nil' : show(v.goodwill[x])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted">Capitalisation of the average profit and of the super profit always agree: the capital employed is the normal profit capitalised.</p>
    </section>
  );
}
