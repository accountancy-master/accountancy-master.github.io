'use client';

import { formatINR, type Paise } from '@/engine/money';
import { balanceWords } from '@/simulator/bank-reconciliation/books';

// ---------------------------------------------------------------------------------------------------------------
// The two balances on one line: overdraft to the left of nil, favourable to the right. The Cash Book's balance is
// pinned above the line and the Pass Book's below it; the statement is a puck that starts at one of them and moves,
// item by item, until it sits on the other. Everything it shows is also said in words under it.
// ---------------------------------------------------------------------------------------------------------------

const inr = formatINR;

/**
 * Where a figure sits on the line, as a share of its width. The line takes in nil when a balance is near it or below
 * it; when every balance is well above nil it shows only their stretch (zoomed), so that the gap can be seen.
 */
function scaleOf(values: Paise[]): { at: (v: Paise) => number; zoomed: boolean } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const zoomed = min > 0 && min > (max - min) * 1.5;
  const lo = zoomed ? min : Math.min(0, min);
  const hi = Math.max(zoomed ? max : 0, max);
  const span = Math.max(hi - lo, 100000);
  const pad = span * (zoomed ? 0.25 : 0.08);
  return { at: (v) => ((v - (lo - pad)) / (span + 2 * pad)) * 100, zoomed };
}

/** A label that stays inside the line near its ends. */
const anchor = (p: number) => (p < 18 ? 'translateX(-8%)' : p > 82 ? 'translateX(-92%)' : 'translateX(-50%)');

function Pin({ at, label, value, place, testId, tone, dy = 0 }: { at: number; label: string; value: Paise; place: 'top' | 'bottom'; testId: string; tone: string; dy?: number }) {
  return (
    <div className="absolute inset-x-0" style={{ [place]: dy, transform: `translateX(${at}%)`, transition: 'transform 500ms ease-out' }}>
      <div className={`absolute left-0 flex w-max flex-col ${place === 'top' ? 'items-start' : 'items-start'}`} style={{ [place]: 0, transform: anchor(at) }}>
        {place === 'bottom' ? <span aria-hidden="true" className={`mx-auto block h-3 w-0.5 ${tone}`} /> : null}
        <span data-testid={testId} className={`rounded-full px-2 py-0.5 text-xs font-extrabold text-on-hue tabular-nums ${tone}`}>
          {label} {inr(Math.abs(value))}
          {value < 0 ? ' OD' : ''}
        </span>
        {place === 'top' ? <span aria-hidden="true" className={`mx-auto block h-3 w-0.5 ${tone}`} /> : null}
      </div>
    </div>
  );
}

export function BalanceLine({ cb, pb, amended, running, goal, reduced }: { cb: Paise; pb: Paise; amended: Paise | null; running: Paise | null; goal: Paise; reduced: boolean }) {
  const { at, zoomed } = scaleOf([cb, pb, ...(running === null ? [] : [running]), ...(amended === null ? [] : [amended])]);
  const zero = zoomed ? 0 : at(0);
  const gap = Math.abs(pb - cb);
  const reached = running !== null && running === goal;
  return (
    <section aria-labelledby="brs-line-title" data-testid="lab-bank-reconciliation-line" className="flex flex-col gap-1 rounded-card border border-edge bg-surface p-3 shadow-card">
      <h3 id="brs-line-title" className="text-base font-extrabold">
        The two balances on one line
      </h3>
      <div aria-hidden="true" className="relative mx-1 h-32 overflow-hidden">
        <Pin at={at(cb)} label="Cash Book" value={cb} place="top" testId="lab-bank-reconciliation-pin-cb" tone="bg-hue-blue" />
        {amended !== null && amended !== cb ? <Pin at={at(amended)} label="Amended" value={amended} place="top" testId="lab-bank-reconciliation-pin-amended" tone="bg-hue-teal" dy={22} /> : null}
        {/* The line: overdraft on the left of nil, favourable on the right. */}
        <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 overflow-hidden rounded-full border border-edge-deep">
          <div className="absolute inset-y-0 left-0 bg-danger-soft" style={{ width: `${zero}%` }} />
          <div className="absolute inset-y-0 right-0 bg-primary-soft" style={{ width: `${100 - zero}%` }} />
        </div>
        {zoomed ? null : <div className="absolute top-1/2 h-6 w-0.5 -translate-y-1/2 bg-edge-deep" style={{ left: `${zero}%` }} />}
        {running !== null ? (
          <div className="absolute inset-x-0 top-1/2" style={{ transform: `translateX(${at(running)}%)`, transition: reduced ? 'none' : 'transform 700ms cubic-bezier(.3,.7,.3,1)' }}>
            <span className={`absolute left-0 block h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-surface shadow-card ${reached ? 'bg-primary' : 'bg-accent'}`} />
          </div>
        ) : null}
        <Pin at={at(pb)} label="Pass Book" value={pb} place="bottom" testId="lab-bank-reconciliation-pin-pb" tone="bg-hue-violet" />
      </div>
      <div aria-hidden="true" className="relative flex justify-between text-xs font-bold text-muted">
        <span>{zoomed ? '◀ less' : zero > 22 ? '◀ overdraft' : ''}</span>
        {zoomed ? <span className="hidden sm:inline">(the line starts well above nil)</span> : <span className="absolute top-0 -translate-x-1/2" style={{ left: `${Math.max(4, Math.min(96, zero))}%` }}>nil</span>}
        <span>{zoomed ? 'more ▶' : zero < 78 ? 'favourable ▶' : ''}</span>
      </div>
      <ul className="flex flex-col gap-0.5 text-sm">
        <li>
          Cash Book (bank column): <strong data-testid="lab-bank-reconciliation-cb-balance" className="tabular-nums">{balanceWords(cb)}</strong>
        </li>
        {amended !== null ? (
          <li>
            Cash Book, amended: <strong data-testid="lab-bank-reconciliation-amended-balance" className="tabular-nums">{balanceWords(amended)}</strong>
          </li>
        ) : null}
        <li>
          Pass Book: <strong data-testid="lab-bank-reconciliation-pb-balance" className="tabular-nums">{balanceWords(pb)}</strong>
          <span className="text-muted"> · {gap === 0 ? 'they agree' : `${inr(gap)} apart`}</span>
        </li>
        {running !== null ? (
          <li>
            <span aria-hidden="true" className={`mr-1.5 inline-block h-3 w-3 rounded-full align-middle ${reached ? 'bg-primary' : 'bg-accent'}`} />
            The statement so far: <strong data-testid="lab-bank-reconciliation-running" className="tabular-nums">{balanceWords(running)}</strong>
            {reached ? <span className="font-extrabold text-primary-ink"> ✓ reached</span> : null}
          </li>
        ) : null}
      </ul>
    </section>
  );
}
