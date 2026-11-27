'use client';

import type { ReactNode } from 'react';
import { formatINR, type Paise } from '@/engine/money';

// An account as the board writes it: "Dr." on the left with "To ...", "Cr." on the right with "By ...", each side
// with its date, particulars and amount, and the totals level at the foot. On a phone the two sides stand one under
// the other.

export interface TRow {
  date: string;
  particulars: string;
  amount: Paise;
  /** A line under the particulars. */
  note?: string;
  /** Drawn out: the row the picture is about just now. */
  mark?: 'now' | 'item';
  /** A small tag before the particulars: the letter of an item. */
  tag?: string;
}

export interface TPeriod {
  title?: string;
  dr: TRow[];
  cr: TRow[];
  /** Show the totals (the period is complete). */
  totals: boolean;
}

const figure = (p: Paise) => formatINR(p).slice(1);

function Side({ side, rows, total, pad, testId }: { side: 'Dr' | 'Cr'; rows: TRow[]; total: Paise | null; pad: number; testId: string }) {
  return (
    <table data-testid={testId} className="w-full border-collapse text-sm">
      <caption className="sr-only">{side === 'Dr' ? 'Debit side' : 'Credit side'}</caption>
      <thead>
        <tr className="border-b-2 border-edge-deep text-left text-xs uppercase tracking-wide text-muted">
          <th scope="col" className="w-24 py-1 pr-1 font-bold">
            {side === 'Dr' ? 'Dr. Date' : 'Date'}
          </th>
          <th scope="col" className="py-1 pr-1 font-bold">
            Particulars
          </th>
          <th scope="col" className="w-20 py-1 text-right font-bold">
            ₹{side === 'Cr' ? ' Cr.' : ''}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} data-mark={r.mark ?? undefined} className={`border-b border-edge align-top ${r.mark === 'now' ? 'bg-primary-soft' : r.mark === 'item' ? 'bg-accent-soft' : ''}`}>
            <td className="py-1 pr-1 text-xs text-muted">{r.date}</td>
            <td className="py-1 pr-1">
              {r.tag ? <span className="mr-1 inline-block rounded bg-surface px-1 text-xs font-extrabold ring-1 ring-edge-deep">{r.tag}</span> : null}
              {r.particulars}
              {r.note ? <span className="block text-xs text-muted">{r.note}</span> : null}
            </td>
            <td className="py-1 text-right tabular-nums">{figure(r.amount)}</td>
          </tr>
        ))}
        {Array.from({ length: pad }, (_, i) => (
          <tr key={`pad${i}`} aria-hidden="true" className="hidden border-b border-edge sm:table-row">
            <td className="py-1">&nbsp;</td>
            <td />
            <td />
          </tr>
        ))}
        {total !== null ? (
          <tr className="border-y-2 border-edge-deep font-extrabold">
            <td />
            <td className="py-1 text-xs uppercase tracking-wide text-muted">Total</td>
            <td className="py-1 text-right tabular-nums">{figure(total)}</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

export function TAccount({ title, periods, testId, caption }: { title: string; periods: TPeriod[]; testId: string; caption?: ReactNode }) {
  return (
    <section aria-label={title} data-testid={testId} className="@container flex min-w-0 flex-col gap-2">
      <h4 className="text-center text-base font-extrabold">
        <span className="text-sm text-muted">Dr.</span> {title} <span className="text-sm text-muted">Cr.</span>
      </h4>
      {caption}
      {periods.length === 0 ? <p className="text-center text-sm text-muted">Nothing written in it yet.</p> : null}
      {periods.map((p, i) => {
        const sum = (rows: TRow[]) => rows.reduce((t, r) => t + r.amount, 0);
        const most = Math.max(p.dr.length, p.cr.length);
        return (
          <div key={i} data-testid={`${testId}-period`} className="flex flex-col gap-1">
            {p.title ? <p className="text-xs font-extrabold uppercase tracking-wide text-muted">{p.title}</p> : null}
            {/* The two sides stand side by side only where the account itself is wide enough for both. */}
            <div className="grid min-w-0 gap-x-3 gap-y-2 @[34rem]:grid-cols-2">
              <Side side="Dr" rows={p.dr} total={p.totals ? sum(p.dr) : null} pad={most - p.dr.length} testId={`${testId}-dr`} />
              <Side side="Cr" rows={p.cr} total={p.totals ? sum(p.cr) : null} pad={most - p.cr.length} testId={`${testId}-cr`} />
            </div>
          </div>
        );
      })}
    </section>
  );
}

export interface JournalEntryView {
  /** The date line above the entry, if the journal is dated. */
  date?: string;
  lines: { account: string; side: 'Dr' | 'Cr'; amount: Paise }[];
  narration: string;
}

/**
 * Journal entries as the board writes them: the debits first, each credit begun with "To", the narration under it
 * ("(Being ...)" with `being`). Each entry is a `<testId>-entry`; `highlight` marks the one just written.
 */
export function Journal({ entries, testId, highlight, caption = 'Journal entries', being = false }: { entries: readonly JournalEntryView[]; testId: string; highlight?: number; caption?: string; being?: boolean }) {
  if (entries.length === 0) return null;
  return (
    <table data-testid={testId} className="w-full table-fixed border-collapse text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b-2 border-edge-deep text-left text-xs uppercase tracking-wide text-muted">
          <th scope="col" className="py-1 pr-2">
            Particulars
          </th>
          <th scope="col" className="w-[5.5rem] py-1 pr-1 text-right">
            Dr (₹)
          </th>
          <th scope="col" className="w-[5.5rem] py-1 text-right">
            Cr (₹)
          </th>
        </tr>
      </thead>
      {entries.map((e, n) => (
        <tbody key={n} data-testid={`${testId}-entry`} className={`border-b-2 border-edge ${n === highlight ? 'bg-primary-soft' : ''}`}>
          {e.date ? (
            <tr>
              <td colSpan={3} className="pt-1 text-xs font-bold text-muted">
                {e.date}
              </td>
            </tr>
          ) : null}
          {[...e.lines.filter((l) => l.side === 'Dr'), ...e.lines.filter((l) => l.side === 'Cr')].map((l, i) => (
            <tr key={i}>
              <td className={`break-words py-0.5 pr-2 ${l.side === 'Cr' ? 'pl-5' : ''}`}>
                {l.side === 'Cr' ? `To ${l.account}` : (
                  <>
                    {l.account} <span className="font-bold">Dr.</span>
                  </>
                )}
              </td>
              <td className="py-0.5 pr-1 text-right align-top tabular-nums">{l.side === 'Dr' ? figure(l.amount) : ''}</td>
              <td className="py-0.5 text-right align-top tabular-nums">{l.side === 'Cr' ? figure(l.amount) : ''}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={3} className="pb-1.5 text-xs italic text-muted">
              ({being ? `Being ${e.narration}` : e.narration})
            </td>
          </tr>
        </tbody>
      ))}
    </table>
  );
}
