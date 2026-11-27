'use client';

import { useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { formatINR, type Paise } from '@/engine/money';
import {
  adjKey,
  adjustmentText,
  adjustmentTitle,
  effectsOf,
  ITEMS,
  partsOf,
  rowsOf,
  sideOfItem,
  SPOT_TAGS,
  trialBalanceTotals,
  YEAR_END,
  type Adjustment,
  type Business,
  type FaState,
  type ItemId,
  type Row,
  type Side,
  type Spot,
  type Statements,
} from '@/simulator/final-accounts/model';

// ---------------------------------------------------------------------------------------------------------------
// The picture of the lab: the trial balance and the adjustments on one side, the three statements on the other,
// each statement drawn in the board's horizontal form (Dr and Cr, "To" and "By", "Less:" lines under a row). A
// balance or an effect that arrives flies from where it came from to its line (transform and opacity only); with
// reduced motion it is simply there, at full strength (a fade would leave its words faint for a moment). Everything
// that moves is also written out, with its amount.
// ---------------------------------------------------------------------------------------------------------------

export const T = 'lab-final-accounts';
const num = (p: Paise) => formatINR(p).slice(1);
const tid = (key: string) => key.replace(/:/g, '-');

/** The look of each place, written out in full so that Tailwind finds the classes. */
const LOOK = {
  trading: { edge: 'border-hue-amber', soft: 'bg-hue-amber-soft', bar: 'bg-hue-amber' },
  pl: { edge: 'border-hue-violet', soft: 'bg-hue-violet-soft', bar: 'bg-hue-violet' },
  bs: { edge: 'border-hue-sky', soft: 'bg-hue-sky-soft', bar: 'bg-hue-sky' },
  closing: { edge: 'border-hue-green', soft: 'bg-hue-green-soft', bar: 'bg-hue-green' },
} as const;

/** An adjustment beside the trial balance, made or not, with its controls in the sandbox. */
export interface AdjustmentCard {
  adjustment: Adjustment;
  made: boolean;
  controls?: ReactNode;
}

export interface BoardProps {
  business: Business;
  state: FaState;
  statements: Statements;
  /** The statements just before: what is new flies in, and what changed is marked. Null: nothing moves. */
  before: Statements | null;
  cards: AdjustmentCard[];
  /** A balance of the trial balance a question is asking about. */
  asking?: ItemId | null;
  reduced: boolean;
  speed: number;
}

/** Flies every line that is new since `before` from the place it came from, after the render that shows it. */
function useArrivals(root: RefObject<HTMLDivElement | null>, statements: Statements, before: Statements | null, reduced: boolean, speed: number) {
  useLayoutEffect(() => {
    const box = root.current;
    if (!before || !box || reduced || typeof Element === 'undefined' || !('animate' in Element.prototype)) return;
    const old = partsOf(before);
    const arrived = [...partsOf(statements).values()].filter((p) => !old.has(p.key));
    const running: Animation[] = [];
    const reach = window.innerHeight * 0.8;
    arrived.slice(0, 12).forEach((p, i) => {
      const el = box.querySelector<HTMLElement>(`[data-fa-key="${p.key}"]`);
      if (!el) return;
      const from = p.source ? box.querySelector<HTMLElement>(`[data-fa-key="${p.source}"]`) : null;
      const delay = Math.min(i, 6) * (90 / speed);
      if (!from) {
        running.push(el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450 / speed, delay, easing: 'ease-out', fill: 'backwards' }));
        return;
      }
      const a = from.getBoundingClientRect();
      const z = el.getBoundingClientRect();
      const dx = a.left + a.width / 2 - (z.left + z.width / 2);
      const dy = Math.max(-reach, Math.min(reach, a.top + a.height / 2 - (z.top + z.height / 2)));
      el.style.position = 'relative';
      el.style.zIndex = '30';
      el.classList.add('shadow-pop');
      const anim = el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(0.92)`, opacity: 0.2 },
          { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 24}px) scale(1.04)`, opacity: 1, offset: 0.55 },
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        ],
        { duration: 900 / speed, delay, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'backwards' },
      );
      running.push(anim);
      void anim.finished
        .catch(() => undefined)
        .finally(() => {
          el.style.zIndex = '';
          el.classList.remove('shadow-pop');
        });
    });
    return () => running.forEach((x) => x.cancel());
  }, [root, statements, before, reduced, speed]);
}

/** Where each balance of the trial balance stands now, by the line it went to. */
function placesOf(st: Statements): Map<string, { spot: Spot; less: boolean }> {
  const out = new Map<string, { spot: Spot; less: boolean }>();
  for (const { spot, row } of rowsOf(st)) for (const p of row.parts) if (p.source.startsWith('tb:') && !out.has(p.source)) out.set(p.source, { spot, less: p.sign < 0 });
  return out;
}

export function Board({ business, state, statements, before, cards, asking = null, reduced, speed }: BoardProps) {
  const root = useRef<HTMLDivElement>(null);
  useArrivals(root, statements, before, reduced, speed);
  const fresh = useMemo(() => {
    if (!before) return { added: new Set<string>(), changed: new Map<string, number>() };
    const old = partsOf(before);
    const added = new Set<string>();
    for (const k of partsOf(statements).keys()) if (!old.has(k)) added.add(k);
    // A row whose figure moved: by how much.
    const oldRows = new Map(rowsOf(before).map(({ row }) => [row.key, row.amount]));
    const changed = new Map<string, number>();
    for (const { row } of rowsOf(statements)) {
      const was = oldRows.get(row.key);
      if (was !== undefined && was !== row.amount) changed.set(row.key, row.amount - was);
    }
    return { added, changed };
  }, [statements, before]);

  return (
    <div ref={root} className="grid gap-4 min-[1360px]:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
      <div className="grid min-w-0 content-start items-start gap-4 md:grid-cols-2 min-[1360px]:grid-cols-1">
        <TrialBalance business={business} state={state} statements={statements} asking={asking} />
        {cards.length > 0 ? <Adjustments business={business} cards={cards} made={state.adjustments} /> : null}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Summary statements={statements} before={before} />
        <Account
          id="trading"
          title={`Trading Account of ${business.name} for the year ended ${YEAR_END}`}
          left={statements.trading.dr}
          right={statements.trading.cr}
          closed={statements.trading.closed}
          kind="account"
          fresh={fresh}
        />
        <Flow testId={`${T}-flow-gross`} on={statements.gross !== null}>
          {statements.gross === null
            ? 'The gross profit is carried down once the Trading Account is balanced.'
            : statements.gross >= 0
              ? `Gross profit ${formatINR(statements.gross)} carried down to the Profit and Loss Account`
              : `Gross loss ${formatINR(-statements.gross)} carried down to the Profit and Loss Account`}
        </Flow>
        <Account
          id="pl"
          title={`Profit and Loss Account of ${business.name} for the year ended ${YEAR_END}`}
          left={statements.pl.dr}
          right={statements.pl.cr}
          closed={statements.pl.closed}
          kind="account"
          fresh={fresh}
        />
        <Flow testId={`${T}-flow-net`} on={statements.net !== null}>
          {statements.net === null
            ? 'The net profit goes to capital once the Profit and Loss Account is balanced.'
            : statements.net >= 0
              ? `Net profit ${formatINR(statements.net)} added to capital in the Balance Sheet`
              : `Net loss ${formatINR(-statements.net)} deducted from capital in the Balance Sheet`}
        </Flow>
        <Account
          id="bs"
          title={`Balance Sheet of ${business.name} as at ${YEAR_END}`}
          left={statements.bs.liabilities}
          right={statements.bs.assets}
          closed={statements.bs.closed}
          kind="balanceSheet"
          fresh={fresh}
        />
      </div>
    </div>
  );
}

function Flow({ children, on, testId }: { children: ReactNode; on: boolean; testId: string }) {
  return (
    <p data-testid={testId} className={`flex items-center gap-2 self-center rounded-full border px-3 py-1 text-center text-xs font-bold ${on ? 'border-hue-green bg-hue-green-soft text-ink' : 'border-dashed border-edge-deep text-muted'}`}>
      <span aria-hidden="true">↓</span>
      <span>{children}</span>
    </p>
  );
}

/** Gross profit, net profit and whether the Balance Sheet agrees, with the change since the step before. */
function Summary({ statements: st, before }: { statements: Statements; before: Statements | null }) {
  const delta = (now: Paise | null, was: Paise | null | undefined) => {
    if (now === null || was === null || was === undefined || now === was) return null;
    const d = now - was;
    return (
      <span className="ml-1 text-xs font-extrabold text-muted">
        {d > 0 ? '▲' : '▼'} {formatINR(Math.abs(d))}
      </span>
    );
  };
  const result = (x: Paise | null, level: string) => (x === null ? 'not found yet' : `${level} ${x >= 0 ? 'profit' : 'loss'} ${formatINR(Math.abs(x))}`);
  const agrees = st.bs.closed && st.bs.liabilities.total === st.bs.assets.total;
  return (
    <dl data-testid={`${T}-summary`} className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
      <div className="rounded-control border border-edge bg-surface px-3 py-2">
        <dt className="text-xs font-bold uppercase tracking-wide text-muted">Trading Account</dt>
        <dd data-testid={`${T}-sum-gross`} className="font-extrabold tabular-nums">
          {result(st.gross, 'Gross')}
          {delta(st.gross, before?.gross)}
        </dd>
      </div>
      <div className="rounded-control border border-edge bg-surface px-3 py-2">
        <dt className="text-xs font-bold uppercase tracking-wide text-muted">Profit and Loss Account</dt>
        <dd data-testid={`${T}-sum-net`} className="font-extrabold tabular-nums">
          {result(st.net, 'Net')}
          {delta(st.net, before?.net)}
        </dd>
      </div>
      <div className="rounded-control border border-edge bg-surface px-3 py-2">
        <dt className="text-xs font-bold uppercase tracking-wide text-muted">Balance Sheet</dt>
        <dd data-testid={`${T}-sum-bs`} data-agrees={agrees ? 'true' : 'false'} className={`font-extrabold tabular-nums ${agrees ? 'text-primary-ink' : 'text-muted'}`}>
          {st.bs.closed ? `${agrees ? '✓ Agrees' : '✗ Does not agree'}: ${formatINR(st.bs.liabilities.total)} = ${formatINR(st.bs.assets.total)}` : 'Not complete yet'}
        </dd>
      </div>
    </dl>
  );
}

function TrialBalance({ business, state, statements, asking }: { business: Business; state: FaState; statements: Statements; asking: ItemId | null }) {
  const { dr, cr } = trialBalanceTotals(business);
  const places = placesOf(statements);
  return (
    <section aria-labelledby={`${T}-tb-title`} data-testid={`${T}-tb`} className="rounded-card border border-edge border-t-4 border-t-hue-teal bg-surface p-3 shadow-card">
      <h3 id={`${T}-tb-title`} className="text-base font-extrabold">
        Trial Balance of {business.name} as on {YEAR_END}
      </h3>
      <p className="mb-2 text-xs text-muted">{business.trade}. Each balance shows where it went.</p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-edge-deep text-left text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="py-1 pr-1">
              Name of account
            </th>
            <th scope="col" className="w-[4.75rem] py-1 pr-1 text-right">
              Dr (₹)
            </th>
            <th scope="col" className="w-[4.75rem] py-1 text-right">
              Cr (₹)
            </th>
          </tr>
        </thead>
        <tbody>
          {business.tb.map((l) => {
            const placed = state.placed.has(l.id);
            const where = places.get(`tb:${l.id}`);
            const asked = asking === l.id;
            return (
              <tr
                key={l.id}
                data-fa-key={`tb:${l.id}`}
                data-testid={`${T}-tb-${l.id}`}
                data-placed={placed ? 'true' : 'false'}
                className={`border-b border-edge align-top ${asked ? 'bg-accent-soft' : placed ? 'text-muted' : ''}`}
              >
                <td className="py-1 pr-1">
                  <span className={asked ? 'font-extrabold text-accent-ink' : placed ? '' : 'font-semibold'}>
                    {asked ? '? ' : ''}
                    {ITEMS[l.id].label}
                  </span>
                  {placed && where ? (
                    <span className="block text-xs font-bold text-muted">
                      <span aria-hidden="true">→ </span>
                      {SPOT_TAGS[where.spot]}
                      {where.less ? ' (deducted)' : ''}
                    </span>
                  ) : null}
                </td>
                <td className="py-1 pr-1 text-right tabular-nums">{sideOfItem(l.id) === 'Dr' ? num(l.amount) : ''}</td>
                <td className="py-1 text-right tabular-nums">{sideOfItem(l.id) === 'Cr' ? num(l.amount) : ''}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-edge-deep font-extrabold">
            <td className="py-1 pr-1">Total</td>
            <td className="py-1 pr-1 text-right tabular-nums">{num(dr)}</td>
            <td className="py-1 text-right tabular-nums">{num(cr)}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

const MARKS = ['①', '②', '③', '④'];

function Adjustments({ business, cards, made: all }: { business: Business; cards: AdjustmentCard[]; made: readonly Adjustment[] }) {
  return (
    <section aria-labelledby={`${T}-adj-title`} data-testid={`${T}-adjustments`} className="rounded-card border border-edge border-t-4 border-t-hue-rose bg-surface p-3 shadow-card">
      <h3 id={`${T}-adj-title`} className="text-base font-extrabold">
        Outside the trial balance: adjustments
      </h3>
      <p className="mb-2 text-xs text-muted">Known on {YEAR_END} but not in the trial balance. Each one goes to two places (goods lost by fire with an insurance claim, three).</p>
      <ul className="flex flex-col gap-2">
        {cards.map(({ adjustment: a, made, controls }) => {
          const key = adjKey(a);
          const effects = made ? effectsOf(business, a, all) : [];
          return (
            <li
              key={key}
              data-fa-key={`adj:${key}`}
              data-testid={`${T}-adj-${tid(key)}`}
              data-made={made ? 'true' : 'false'}
              className={`rounded-control border px-3 py-2 text-sm ${made ? 'border-hue-rose bg-hue-rose-soft' : 'border-dashed border-edge-deep'}`}
            >
              <p className="font-extrabold">{adjustmentTitle(a)}</p>
              <p className="text-xs text-muted">{adjustmentText(business, a)}</p>
              {controls}
              {made ? (
                <ol className="mt-1 flex flex-col gap-0.5 text-xs">
                  {effects.map((e, i) => (
                    <li key={i}>
                      <span className="font-extrabold">
                        {MARKS[i]} {SPOT_TAGS[e.spot]}:
                      </span>{' '}
                      {e.text}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-1 text-xs font-bold text-muted">Not made yet.</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface Fresh {
  added: ReadonlySet<string>;
  changed: ReadonlyMap<string, number>;
}

/** A statement in the horizontal form: two sides, each with its particulars and amounts, and the totals once balanced. */
function Account({ id, title, left, right, closed, kind, fresh }: { id: 'trading' | 'pl' | 'bs'; title: string; left: Side; right: Side; closed: boolean; kind: 'account' | 'balanceSheet'; fresh: Fresh }) {
  const look = LOOK[id];
  const account = kind === 'account';
  return (
    <section aria-labelledby={`${T}-${id}-title`} data-testid={`${T}-${id}`} data-closed={closed ? 'true' : 'false'} className={`rounded-card border border-edge border-t-4 ${look.edge} bg-surface p-2 shadow-card sm:p-3`}>
      <header className="mb-2 flex items-start justify-between gap-2">
        {account ? <span className="text-sm font-extrabold">Dr.</span> : null}
        <h3 id={`${T}-${id}-title`} className="flex-1 text-center text-sm font-extrabold sm:text-base">
          {title}
        </h3>
        {account ? <span className="text-sm font-extrabold">Cr.</span> : null}
      </header>
      <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2">
        <SideView testId={`${T}-${id}-${account ? 'dr' : 'liabilities'}`} heading={account ? 'Particulars (debit side)' : 'Liabilities'} prefix={account ? 'To' : ''} side={left} closed={closed} look={look} fresh={fresh} />
        <SideView testId={`${T}-${id}-${account ? 'cr' : 'assets'}`} heading={account ? 'Particulars (credit side)' : 'Assets'} prefix={account ? 'By' : ''} side={right} closed={closed} look={look} fresh={fresh} />
      </div>
    </section>
  );
}

const LINE = 'grid grid-cols-[minmax(0,1fr)_4.25rem_4.75rem] items-baseline gap-x-1';

function SideView({ testId, heading, prefix, side, closed, look, fresh }: { testId: string; heading: string; prefix: string; side: Side; closed: boolean; look: (typeof LOOK)[keyof typeof LOOK]; fresh: Fresh }) {
  return (
    <div data-testid={testId} className="flex min-w-0 flex-col text-sm">
      <div className={`${LINE} border-b-2 border-edge-deep pb-1 text-xs font-bold uppercase tracking-wide text-muted`}>
        <span>{heading}</span>
        <span aria-hidden="true" />
        <span className="text-right">₹</span>
      </div>
      <div className="flex min-h-10 flex-col gap-1 py-1">
        {side.rows.length === 0 ? <p className="px-1 text-xs text-muted">Nothing here yet.</p> : null}
        {side.rows.map((r) => (
          <RowView key={r.key} row={r} prefix={prefix} look={r.closing ? LOOK.closing : look} fresh={fresh} />
        ))}
      </div>
      {closed ? (
        <div data-testid={`${testId}-total`} className={`${LINE} mt-auto border-y-2 border-double border-edge-deep py-1 font-extrabold tabular-nums`}>
          <span>Total</span>
          <span aria-hidden="true" />
          <span className="text-right">{num(side.total)}</span>
        </div>
      ) : null}
    </div>
  );
}

function RowView({ row, prefix, look, fresh }: { row: Row; prefix: string; look: (typeof LOOK)[keyof typeof LOOK]; fresh: Fresh }) {
  const label = `${prefix ? `${prefix} ` : ''}${row.label}`;
  const moved = fresh.changed.get(row.key);
  const isNew = fresh.added.has(row.key);
  const mark = (key: string) => (fresh.added.has(key) ? <span className="ml-1 rounded-full bg-ink px-1.5 text-[0.65rem] font-extrabold uppercase text-surface">new</span> : null);
  const change =
    moved !== undefined && !isNew ? (
      <span className="block text-[0.7rem] font-extrabold text-muted">
        {moved > 0 ? '▲' : '▼'} {num(Math.abs(moved))}
      </span>
    ) : null;
  const merged = row.parts.length > 1 && row.parts[0].text === row.label;
  return (
    <div data-testid={`${T}-row-${tid(row.key)}`} className={`rounded-control border-l-4 ${look.edge} ${look.soft} px-1.5 py-1 ${row.closing ? 'font-extrabold' : ''}`}>
      {row.parts.length === 1 ? (
        <div data-fa-key={row.parts[0].key} className={LINE}>
          <span className="min-w-0">
            {label}
            {mark(row.parts[0].key)}
          </span>
          <span aria-hidden="true" />
          <span className="text-right tabular-nums">
            {num(row.amount)}
            {change}
          </span>
        </div>
      ) : (
        <>
          {merged ? null : <div className={LINE}>{label}</div>}
          {row.parts.map((p, i) => {
            const last = i === row.parts.length - 1;
            return (
              <div key={p.key} data-fa-key={p.key} className={LINE}>
                <span className={`min-w-0 ${i === 0 && merged ? '' : 'pl-3 text-[0.8rem]'}`}>
                  {i === 0 && merged ? label : p.text}
                  {mark(p.key)}
                </span>
                <span className="text-right text-[0.8rem] tabular-nums">{num(p.amount)}</span>
                <span className="text-right tabular-nums">
                  {last ? num(row.amount) : ''}
                  {last ? change : null}
                </span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
