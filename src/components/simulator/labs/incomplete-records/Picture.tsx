'use client';

import { formatINR, type Paise } from '@/engine/money';
import { endOf, resultOf, startOf, type Inputs, type Item } from '@/simulator/incomplete-records/model';
import type { Standing } from '@/simulator/incomplete-records/walk';
import { Arrive } from '../kit/Arrive';

// ---------------------------------------------------------------------------------------------------------------
// The picture of the statement of affairs method. Two statements side by side, each a pair of stacks: what the
// business owns against what it owes, with the capital as the block that makes the two stacks level. Then the
// capital ladder: from the closing capital, the drawings added back and the capital brought in taken off, set
// against the opening capital; the gap is the profit or the loss. Then each adjustment, from the profit found to the
// net result. Everything drawn is said in text as well.
// ---------------------------------------------------------------------------------------------------------------

export const P = 'lab-incomplete-records';
const inr = formatINR;
const pct = (x: number, whole: number) => (whole > 0 ? Math.max(0, Math.min(100, (x / whole) * 100)) : 0);

const ASSET_TONES = ['bg-hue-blue/80', 'bg-hue-sky/80', 'bg-hue-blue/55', 'bg-hue-sky/55', 'bg-hue-blue/40', 'bg-hue-sky/35'];
const LIAB_TONES = ['bg-hue-rose/75', 'bg-hue-orange/70', 'bg-hue-rose/50', 'bg-hue-orange/45'];

export function Picture({ i, st, reduced }: { i: Inputs; st: Standing; reduced: boolean }) {
  const r = resultOf(i);
  const top = Math.max(r.assets[0], r.assets[1], 1);
  return (
    <div data-testid={`${P}-picture`} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Statement i={i} which="open" st={st} reduced={reduced} top={top} />
        <Statement i={i} which="close" st={st} reduced={reduced} top={top} />
      </div>
      {st.has('privates') ? (
        <Arrive reduced={reduced} from="translateY(-1rem)" className="block">
          <div data-testid={`${P}-privates`} className="flex flex-wrap items-center gap-2 rounded-control border-2 border-dashed border-danger bg-danger-soft px-3 py-2 text-sm">
            <span className="font-extrabold text-danger-deep">✕ Left out, not the business&apos;s:</span>
            {i.privates.map((p) => (
              <span key={p.label} className="rounded bg-surface px-2 py-0.5 line-through decoration-danger">
                {p.label} {inr(p.amount)}
              </span>
            ))}
          </div>
        </Arrive>
      ) : null}
      {st.has('ladder-close') ? <Ladder i={i} st={st} reduced={reduced} /> : null}
      {st.adjs > 0 ? <Adjustments i={i} st={st} reduced={reduced} /> : null}
    </div>
  );
}

function Statement({ i, which, st, reduced, top }: { i: Inputs; which: 'open' | 'close'; st: Standing; reduced: boolean; top: number }) {
  const r = resultOf(i);
  const k = which === 'open' ? 0 : 1;
  const showAssets = st.has(which === 'open' ? 'open-assets' : 'close-assets');
  const showLiabs = st.has(which === 'open' ? 'open-liabilities' : 'close-liabilities');
  const showCapital = st.has(which === 'open' ? 'open-capital' : 'close-capital');
  const assets = i.items.filter((x) => x.side === 'asset' && x[which] > 0);
  const liabs = i.items.filter((x) => x.side === 'liability' && x[which] > 0);
  const date = which === 'open' ? startOf(i) : endOf(i);
  const H = 'h-56 sm:h-64';
  const block = (x: Item, tone: string, n: number) => (
    <Arrive key={`${x.id}-${which}`} reduced={reduced} from="translateY(-2.5rem)" ms={600 + 80 * n} className={`flex w-full items-center justify-center overflow-hidden border-t border-white/70 px-1 text-center text-[10px] font-bold leading-tight text-ink sm:text-xs ${tone}`} style={{ height: `${pct(x[which], top)}%` }}>
      {/* The words sit on a chip of the card's colour, so that they read on every tone of the blocks, in both themes. */}
      {pct(x[which], top) >= 9 ? (
        <span className="rounded bg-surface/85 px-1">
          {x.label} {inr(x[which])}
        </span>
      ) : null}
    </Arrive>
  );
  return (
    <section aria-labelledby={`${P}-sa-${which}`} data-testid={`${P}-statement-${which}`} className="flex flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
      <h3 id={`${P}-sa-${which}`} className="text-base font-extrabold">
        Statement of affairs on {date}
      </h3>
      <div className="grid grid-cols-2 gap-2" aria-hidden="true">
        <p className="text-center text-xs font-extrabold uppercase tracking-wide text-muted">Owes + capital</p>
        <p className="text-center text-xs font-extrabold uppercase tracking-wide text-muted">Owns</p>
        <div className={`relative flex flex-col-reverse rounded-control border border-edge bg-sunken ${H}`}>
          {showLiabs ? liabs.map((x, n) => block(x, LIAB_TONES[n % LIAB_TONES.length], n)) : null}
          {showCapital ? (
            <Arrive reduced={reduced} from="scaleY(0)" ms={900} className="flex w-full origin-bottom items-center justify-center border-2 border-hue-green bg-hue-green-soft px-1 text-center text-xs font-extrabold text-hue-green" style={{ height: `${pct(r.capital[k], top)}%` }}>
              Capital {inr(r.capital[k])}
            </Arrive>
          ) : showLiabs && showAssets ? (
            <div className="flex w-full items-center justify-center border-2 border-dashed border-hue-green text-sm font-extrabold text-hue-green" style={{ height: `${pct(r.capital[k], top)}%` }}>
              ? the gap
            </div>
          ) : null}
        </div>
        <div className={`relative flex flex-col-reverse rounded-control border border-edge bg-sunken ${H}`}>{showAssets ? assets.map((x, n) => block(x, ASSET_TONES[n % ASSET_TONES.length], n)) : null}</div>
      </div>
      <div className="grid grid-cols-1 gap-x-3 text-xs sm:grid-cols-2">
        <div>
          {showLiabs ? (
            liabs.map((x) => (
              <div key={x.id} className="flex justify-between gap-2">
                <span>{x.label}</span>
                <span className="tabular-nums">{inr(x[which])}</span>
              </div>
            ))
          ) : (
            <span className="text-muted">Liabilities not yet listed.</span>
          )}
          {showCapital ? (
            <div className="flex justify-between gap-2 font-extrabold text-hue-green">
              <span>Capital (balancing figure)</span>
              <span data-testid={`${P}-capital-${which}`} className="tabular-nums">
                {inr(r.capital[k])}
              </span>
            </div>
          ) : null}
        </div>
        <div>
          {showAssets ? (
            assets.map((x) => (
              <div key={x.id} className="flex justify-between gap-2">
                <span>{x.label}</span>
                <span className="tabular-nums">{inr(x[which])}</span>
              </div>
            ))
          ) : (
            <span className="text-muted">Assets not yet listed.</span>
          )}
          {showAssets ? (
            <div className="flex justify-between gap-2 font-bold">
              <span>Total assets</span>
              <span className="tabular-nums">{inr(r.assets[k])}</span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** A row of a horizontal ladder: a label, and a bar from `from` to `to` on a scale of `top`. */
function Rung({ label, from, to, top, low = 0, tone, testId, reduced, note, hatch }: { label: string; from: Paise; to: Paise; top: number; low?: number; tone: string; testId?: string; reduced: boolean; note?: string; hatch?: boolean }) {
  const span = top - low;
  const left = pct(Math.min(from, to) - low, span);
  const width = pct(Math.abs(to - from), span);
  return (
    <li data-testid={testId} className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] sm:gap-3">
      <span className="flex justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="whitespace-nowrap font-extrabold tabular-nums">{note}</span>
      </span>
      <span aria-hidden="true" className="relative block h-6 rounded-control bg-sunken">
        {low < 0 ? <span className="absolute inset-y-0 w-px bg-edge-deep" style={{ left: `${pct(-low, span)}%` }} /> : null}
        <Arrive reduced={reduced} from="scaleX(0)" ms={700} className={`absolute inset-y-0 origin-left rounded-sm ${hatch ? 'sim-deduction' : tone}`} style={{ left: `${left}%`, width: `${Math.max(width, 0.6)}%` }} />
      </span>
    </li>
  );
}

function Ladder({ i, st, reduced }: { i: Inputs; st: Standing; reduced: boolean }) {
  const r = resultOf(i);
  const C1 = r.capital[1];
  const top = Math.max(C1 + r.drawings, r.capital[0], r.adjusted, 1);
  const done = st.has('ladder-open');
  const profit = r.before >= 0;
  return (
    <section aria-labelledby={`${P}-ladder-title`} data-testid={`${P}-ladder`} className="flex flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
      <h3 id={`${P}-ladder-title`} className="text-base font-extrabold">
        The capital ladder
      </h3>
      <ol className="flex flex-col gap-2">
        <Rung label="Capital at the end" from={0} to={C1} top={top} tone="bg-hue-green/80" reduced={reduced} note={inr(C1)} />
        {st.has('ladder-drawings') ? <Rung label="+ Drawings, added back" from={C1} to={C1 + r.drawings} top={top} tone="bg-hue-amber/80" reduced={reduced} note={`+ ${inr(r.drawings)}`} /> : null}
        {st.has('ladder-additional') ? <Rung label="− Additional capital, taken off" from={C1 + r.drawings} to={r.adjusted} top={top} tone="" hatch reduced={reduced} note={`− ${inr(r.additional)}`} /> : null}
        {st.has('ladder-drawings') && (st.has('ladder-additional') || !r.additional) ? (
          <Rung label="= Adjusted capital at the end" from={0} to={r.adjusted} top={top} tone="bg-hue-green" reduced={reduced} note={inr(r.adjusted)} testId={`${P}-adjusted`} />
        ) : null}
        {done ? <Rung label="Capital at the beginning" from={0} to={r.capital[0]} top={top} tone="bg-hue-violet/60" reduced={reduced} note={inr(r.capital[0])} /> : null}
        {done ? (
          <Rung label={profit ? 'The gap: profit' : 'The gap: loss'} from={r.capital[0]} to={r.adjusted} top={top} tone={profit ? 'bg-primary' : 'bg-danger'} reduced={reduced} note={`${profit ? '▲' : '▼'} ${inr(Math.abs(r.before))}`} testId={`${P}-gap`} />
        ) : null}
      </ol>
      {done ? (
        <p data-testid={`${P}-before`} className={`rounded-control px-3 py-2 text-base font-extrabold ${r.before >= 0 ? 'bg-primary-soft text-primary-ink' : 'bg-danger-soft text-danger-deep'}`}>
          {r.before > 0 ? `▲ Profit ${inr(r.before)}` : r.before < 0 ? `▼ Loss ${inr(-r.before)}` : '= Neither profit nor loss'}
          {r.adjs.length ? ' before the adjustments' : ' for the year'}
        </p>
      ) : (
        <p className="text-xs text-muted">Profit = closing capital + drawings − additional capital − opening capital.</p>
      )}
    </section>
  );
}

function Adjustments({ i, st, reduced }: { i: Inputs; st: Standing; reduced: boolean }) {
  const r = resultOf(i);
  const made = r.adjs.slice(0, st.adjs);
  const runs = [r.before];
  for (const a of r.adjs) runs.push(runs.at(-1)! + a.effect);
  const low = Math.min(0, ...runs);
  const top = Math.max(0, ...runs, 1);
  const end = runs[made.length];
  const all = made.length === r.adjs.length;
  return (
    <section aria-labelledby={`${P}-adj-title`} data-testid={`${P}-adjustments`} className="flex flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
      <h3 id={`${P}-adj-title`} className="text-base font-extrabold">
        From the profit found to the net result
      </h3>
      <p className="text-xs text-muted">The statement of affairs on {endOf(i)} was drawn up before these adjustments, so each is made to the result found. (Made in the closing statement instead, each would change the closing capital, and the result, by the same amount.)</p>
      <ol className="flex flex-col gap-2">
        <Rung label={r.before >= 0 ? 'Profit before adjustments' : 'Loss before adjustments'} from={0} to={r.before} top={top} low={low} tone={r.before >= 0 ? 'bg-primary/70' : 'bg-danger/70'} reduced={reduced} note={inr(Math.abs(r.before))} />
        {made.map((a, k) => (
          <Rung key={a.key} label={a.label} from={runs[k]} to={runs[k + 1]} top={top} low={low} tone="bg-hue-amber/80" hatch={a.effect < 0} reduced={reduced} note={`${a.effect < 0 ? '−' : '+'} ${inr(Math.abs(a.effect))}`} />
        ))}
        {all ? <Rung label={end >= 0 ? '= Net profit' : '= Net loss'} from={0} to={end} top={top} low={low} tone={end >= 0 ? 'bg-primary' : 'bg-danger'} reduced={reduced} note={inr(Math.abs(end))} testId={`${P}-net-bar`} /> : null}
      </ol>
      {all ? (
        <p data-testid={`${P}-net`} className={`rounded-control px-3 py-2 text-base font-extrabold ${end >= 0 ? 'bg-primary-soft text-primary-ink' : 'bg-danger-soft text-danger-deep'}`}>
          {end > 0 ? `▲ Net profit ${inr(end)}` : end < 0 ? `▼ Net loss ${inr(-end)}` : '= Neither profit nor loss'}
        </p>
      ) : null}
    </section>
  );
}
