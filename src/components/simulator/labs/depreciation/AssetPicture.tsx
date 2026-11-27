'use client';

import { useMemo } from 'react';
import { formatINR } from '@/engine/money';
import { curveOf, otherMethod, schedule, type CurvePoint, type Schedule } from '@/simulator/depreciation/schedule';
import { assetAccount, balanceSheetLines, standingAfter } from '@/simulator/depreciation/story';
import { Arrive, Leave } from '../kit/Arrive';

// ---------------------------------------------------------------------------------------------------------------
// The picture of an asset's life: the asset account as a bar whose book value is eaten year by year (into a
// Provision for Depreciation laid over it, or off the account itself), each year's slice dropping into Profit and
// Loss; the book value as a line over the years beside the other method's; and, at the end, the book value against
// the price. Everything drawn is also said in text.
// ---------------------------------------------------------------------------------------------------------------

const inr = formatINR;
const pct = (part: number, whole: number) => (whole > 0 ? Math.max(0, Math.min(100, (part / whole) * 100)) : 0);
const methodName = (s: Schedule) => (s.inputs.method === 'slm' ? 'Straight line' : 'Written down value');

export function AssetPicture({ s, shown, reduced }: { s: Schedule; shown: number; reduced: boolean }) {
  const st = standingAfter(s, shown);
  return (
    <div data-testid="lab-depreciation-picture" className="grid gap-3 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        {st.sold ? <SaleBars s={s} reduced={reduced} /> : <AssetBar s={s} shown={shown} reduced={reduced} />}
        <ChargeTray s={s} shown={shown} reduced={reduced} />
      </div>
      <BookValueChart s={s} shown={shown} />
    </div>
  );
}

function AssetBar({ s, shown, reduced }: { s: Schedule; shown: number; reduced: boolean }) {
  const st = standingAfter(s, shown);
  const A = assetAccount(s);
  const prov = s.inputs.provision;
  const move = reduced ? '' : 'transition-transform duration-700 ease-out';
  const bvScale = pct(st.bookValue, s.cost) / 100;
  const lines = balanceSheetLines(s, shown);
  return (
    <section aria-labelledby="dep-asset-title" data-testid="lab-depreciation-asset" className="flex flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 id="dep-asset-title" className="text-base font-extrabold text-hue-blue">
          {A}
        </h3>
        <p className="text-xs text-muted">{shown === 0 ? 'Not bought yet' : `As on ${st.date}`}</p>
      </header>
      {shown === 0 ? (
        <p className="rounded-control border border-dashed border-edge-deep px-3 py-6 text-center text-sm text-muted">Press Play: the asset is bought first.</p>
      ) : (
        <>
          <p className="text-sm">
            {prov ? (
              <>
                The account stays at cost: <strong data-testid="lab-depreciation-account-balance" className="tabular-nums">{inr(st.assetAccount)}</strong>
              </>
            ) : (
              <>
                The account itself is written down: <strong data-testid="lab-depreciation-account-balance" className="tabular-nums">{inr(st.assetAccount)}</strong>
              </>
            )}
          </p>
          {/* The bar: the whole width is the cost. Decorative: the figures under it say it all. */}
          <div aria-hidden="true" className={`relative h-14 overflow-hidden rounded-control border-2 ${prov ? 'border-hue-blue' : 'border-dashed border-edge-deep'} bg-sunken`}>
            <div className={`absolute inset-y-0 left-0 w-full origin-left bg-hue-blue ${move}`} style={{ transform: `scaleX(${bvScale})` }} />
            {prov ? (
              <div className={`sim-deduction absolute inset-y-0 right-0 w-full origin-right ${move}`} style={{ transform: `scaleX(${pct(st.provision, s.cost) / 100})` }} />
            ) : null}
            {st.lastCharge > 0 ? (
              <Leave
                key={`${shown}-cut`}
                reduced={reduced}
                to="translateY(3.5rem)"
                className="absolute inset-y-0 border-x-2 border-white/70 bg-hue-rose/80"
                style={{ left: `${pct(st.bookValue, s.cost)}%`, width: `${pct(st.lastCharge, s.cost)}%` }}
              />
            ) : null}
            <span className="absolute inset-y-0 left-2 flex items-center text-sm font-extrabold text-on-hue">{bvScale > 0.3 ? 'Book value' : ''}</span>
          </div>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-2">
            <div className="flex items-center justify-between gap-2">
              <dt className="flex items-center gap-1.5">
                <span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm bg-hue-blue" />
                Book value
              </dt>
              <dd data-testid="lab-depreciation-book-value" className="font-extrabold tabular-nums">
                {inr(st.bookValue)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="flex items-center gap-1.5">
                <span aria-hidden="true" className={`inline-block h-3 w-3 rounded-sm ${prov ? 'sim-deduction' : 'border border-dashed border-edge-deep'}`} />
                {prov ? 'Provision for Depreciation' : 'Written off the account'}
              </dt>
              <dd data-testid="lab-depreciation-written" className="font-bold tabular-nums">
                {inr(st.written)}
              </dd>
            </div>
          </dl>
          {st.lastCharge > 0 ? (
            <p className="text-xs text-muted">
              <span aria-hidden="true" className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-hue-rose/70 align-middle" />
              This year&apos;s slice, {inr(st.lastCharge)}, is cut from the book value{prov ? ' and added to the provision' : ' and credited to the account'}.
            </p>
          ) : null}
          {lines.length > 0 && st.date.startsWith('31 March') ? (
            <div data-testid="lab-depreciation-balance-sheet" className="rounded-control bg-sunken px-3 py-2 text-sm">
              <p className="text-xs font-extrabold uppercase tracking-wide text-muted">Balance Sheet as at {st.date} (assets side, extract)</p>
              {lines.map((l, i) => (
                <p key={i} className={`flex justify-between gap-2 tabular-nums ${l.total ? 'font-extrabold' : ''}`}>
                  <span>{l.label}</span>
                  <span>{l.less ? `(${inr(l.amount)})` : inr(l.amount)}</span>
                </p>
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

/** The year-by-year charges, each a slice of the cost, gathered in Profit and Loss. */
function ChargeTray({ s, shown, reduced }: { s: Schedule; shown: number; reduced: boolean }) {
  const charged = s.rows.slice(0, Math.max(0, Math.min(shown - 1, s.rows.length))).filter((r) => r.charge > 0);
  const total = charged.reduce((t, r) => t + r.charge, 0);
  return (
    <section aria-labelledby="dep-tray-title" data-testid="lab-depreciation-tray" className="flex flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 id="dep-tray-title" className="text-base font-extrabold text-hue-rose">
          Charged to Profit and Loss A/c
        </h3>
        <p className="text-sm font-extrabold tabular-nums">{inr(total)}</p>
      </header>
      <div aria-hidden="true" className="flex h-8 overflow-hidden rounded-control border border-edge bg-sunken">
        {charged.map((r, i) => (
          <Arrive
            key={r.index}
            reduced={reduced}
            from="translateY(-2.5rem)"
            className={`block h-full border-r border-white/70 ${i % 2 ? 'bg-hue-rose/55' : 'bg-hue-rose/80'}`}
            style={{ width: `${pct(r.charge, s.cost)}%` }}
          />
        ))}
      </div>
      {charged.length === 0 ? (
        <p className="text-xs text-muted">Nothing yet: depreciation is charged at the year end.</p>
      ) : (
        <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
          {charged.map((r) => (
            <li key={r.index} className="tabular-nums">
              {r.label}
              {r.months < 12 ? ` (${r.months} months)` : ''}: <span className="font-bold text-ink">{inr(r.charge)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">An expense of each year, though no cash moves: the cost is spread over the years that use the asset.</p>
    </section>
  );
}

/** At the sale: the book value against the price, and the gap between them. */
function SaleBars({ s, reduced }: { s: Schedule; reduced: boolean }) {
  const sale = s.sale!;
  const top = Math.max(sale.bookValue, sale.price);
  const profit = sale.result > 0;
  return (
    <section aria-labelledby="dep-sale-title" data-testid="lab-depreciation-sale" className="flex flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
      <h3 id="dep-sale-title" className="text-base font-extrabold">
        Sold on {sale.date}
      </h3>
      {[
        { label: 'Book value on the date of sale', value: sale.bookValue, cls: 'bg-hue-blue/80' },
        { label: 'Price received', value: sale.price, cls: 'bg-hue-teal/80' },
      ].map((b) => (
        <div key={b.label} className="flex flex-col gap-0.5">
          <p className="flex justify-between gap-2 text-sm">
            <span>{b.label}</span>
            <span className="font-extrabold tabular-nums">{inr(b.value)}</span>
          </p>
          <div aria-hidden="true" className="h-5 overflow-hidden rounded-control bg-sunken">
            <Arrive reduced={reduced} from="scaleX(0)" className={`block h-full origin-left ${b.cls}`} style={{ width: `${pct(b.value, top)}%` }} />
          </div>
        </div>
      ))}
      <p data-testid="lab-depreciation-sale-result" className={`rounded-control px-3 py-2 text-base font-extrabold ${sale.result === 0 ? 'bg-sunken' : profit ? 'bg-primary-soft text-primary-ink' : 'bg-danger-soft text-danger-deep'}`}>
        {sale.result === 0 ? '= No profit and no loss' : profit ? `▲ Profit on sale ${inr(sale.result)}` : `▼ Loss on sale ${inr(-sale.result)}`}
      </p>
      <p className="text-xs text-muted">
        The price is set against the book value ({inr(s.cost)} - {inr(sale.written)} written off), never against the cost.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// The chart: book value over the years, this method solid, the other dashed.
// ---------------------------------------------------------------------------------------------------------------

const W = 360;
const H = 210;
const PAD = { l: 8, r: 10, t: 14, b: 26 };

const short = (date: string) => {
  const [, m, y] = date.split(' ');
  return `${m.slice(0, 3)} ${y.slice(2)}`;
};

function BookValueChart({ s, shown }: { s: Schedule; shown: number }) {
  const other = useMemo(() => schedule(otherMethod(s.inputs, Math.max(s.rows.length, 1))), [s]);
  const mine = curveOf(s);
  const theirs = curveOf(other);
  const span = Math.max(mine.at(-1)!.months, theirs.at(-1)!.months, 12);
  const x = (m: number) => PAD.l + (m / span) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / s.cost) * (H - PAD.t - PAD.b);
  const path = (pts: CurvePoint[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.months).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const played = mine.slice(0, Math.max(0, Math.min(shown, mine.length)));
  const now = played.at(-1);
  const scrap = s.inputs.method === 'slm' && s.inputs.slmBasis === 'life' ? s.inputs.scrap : null;
  const otherName = other.inputs.method === 'wdv' ? `Written down value at ${other.inputs.rate}%` : `Straight line at ${other.inputs.rate}% on cost`;
  const ticks = theirs.length > mine.length ? theirs : mine;
  const every = ticks.length > 7 ? 2 : 1;
  const desc = played.map((p) => `${p.date}: ${inr(p.value)}`).join('; ');

  return (
    <section aria-labelledby="dep-chart-title" data-testid="lab-depreciation-chart" className="flex flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
      <h3 id="dep-chart-title" className="text-base font-extrabold">
        Book value over the years
      </h3>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Book value of the asset under the ${methodName(s).toLowerCase()} method. ${desc || 'Not bought yet.'}`} className="h-auto w-full">
        {/* The cost and nil, and each year end. */}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(s.cost)} y2={y(s.cost)} className="stroke-edge" strokeDasharray="2 3" />
        <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} className="stroke-edge-deep" />
        {ticks.slice(1).map((p, i) =>
          i % every === 0 ? (
            <g key={p.months}>
              <line x1={x(p.months)} x2={x(p.months)} y1={PAD.t} y2={y(0)} className="stroke-edge" strokeDasharray="1 4" />
              <text x={x(p.months)} y={H - 10} textAnchor={x(p.months) > W - 24 ? 'end' : 'middle'} className="fill-muted text-[9px]">
                {short(p.date)}
              </text>
            </g>
          ) : null,
        )}
        <text x={PAD.l + 2} y={y(s.cost) - 4} className="fill-muted text-[9px]">
          cost {inr(s.cost)}
        </text>
        {scrap !== null && scrap > 0 ? (
          <>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(scrap)} y2={y(scrap)} className="stroke-hue-amber" strokeDasharray="5 4" />
            <text x={W - PAD.r - 2} y={y(scrap) - 4} textAnchor="end" className="fill-hue-amber text-[9px] font-bold">
              scrap {inr(scrap)}
            </text>
          </>
        ) : null}
        {/* The other method, for comparison; then this one: faint ahead, solid where it has played. */}
        <path d={path(theirs)} fill="none" className="stroke-hue-violet" strokeWidth={2} strokeDasharray="6 5" opacity={0.75} />
        <path d={path(mine)} fill="none" className="stroke-hue-blue" strokeWidth={2} opacity={0.25} />
        {played.length > 1 ? <path d={path(played)} fill="none" className="stroke-hue-blue" strokeWidth={3.5} strokeLinejoin="round" /> : null}
        {played.map((p, i) => (
          <circle key={i} cx={x(p.months)} cy={y(p.value)} r={3} className="fill-hue-blue" />
        ))}
        {now ? (
          <g style={{ transform: `translate(${x(now.months)}px, ${y(now.value)}px)`, transition: 'transform 600ms ease-out' }}>
            <circle r={7} className="fill-surface stroke-hue-blue" strokeWidth={3} />
            <text y={-11} textAnchor={x(now.months) > W * 0.7 ? 'end' : 'middle'} className="fill-ink text-[10px] font-bold">
              {inr(now.value)}
            </text>
          </g>
        ) : null}
      </svg>
      <ul className="flex flex-col gap-0.5 text-xs">
        <li className="flex items-center gap-2">
          <svg width="28" height="8" aria-hidden="true">
            <line x1="0" x2="28" y1="4" y2="4" className="stroke-hue-blue" strokeWidth={3.5} />
          </svg>
          {methodName(s)}: this asset{s.sale ? ', up to the sale' : ''}
        </li>
        <li className="flex items-center gap-2">
          <svg width="28" height="8" aria-hidden="true">
            <line x1="0" x2="28" y1="4" y2="4" className="stroke-hue-violet" strokeWidth={2} strokeDasharray="6 5" />
          </svg>
          {otherName}, for comparison (not sold)
        </li>
      </ul>
      <p className="text-xs text-muted">
        {s.inputs.method === 'slm'
          ? `A straight line: the same charge every full year, down to ${s.inputs.slmBasis === 'life' && s.inputs.scrap > 0 ? 'the scrap value' : 'nil'}.`
          : 'A curve: the same rate on a smaller book value each year, so the charge falls and the book value never reaches nil.'}
      </p>
    </section>
  );
}
