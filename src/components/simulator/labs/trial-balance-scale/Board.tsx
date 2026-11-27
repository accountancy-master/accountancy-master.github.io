'use client';

import type { Side } from '@/engine/accounts';
import type { JournalLine } from '@/engine/journal';
import { formatINR } from '@/engine/money';
import { beforeCorrection, entryIntro, rectifyingEntry, suspenseOf, TB_DATE, title, type ErrorCase, type Frame, type ScaleBooks } from '@/simulator/trial-balance-scale/scale';
import { S } from './Scale';

// ---------------------------------------------------------------------------------------------------------------
// What the student writes in the examination, beside the scale: the trial balance as it stands, the rectifying
// entry (found before and found after the trial balance), and the Suspense account.
// ---------------------------------------------------------------------------------------------------------------

const money = (p: number) => formatINR(p).slice(1);
const th = 'py-1 text-[11px] font-bold uppercase tracking-wide text-muted';

export function TrialBalanceAt({ books, frame }: { books: ScaleBooks; frame: Frame }) {
  return (
    <section className="flex flex-col gap-1 rounded-card border border-edge bg-surface p-3 shadow-card">
      <h4 className="text-center text-sm font-extrabold">
        Trial Balance of {books.business} as on {TB_DATE}
      </h4>
      <p className="text-center text-xs text-muted">{frame.label}</p>
      <div className="overflow-x-auto">
        <table data-testid={`${S}-tb`} className="w-full min-w-[17rem] border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="border-y-2 border-edge-deep text-left">
              <th scope="col" className={`${th} pr-1`}>
                Name of account
              </th>
              <th scope="col" className={`${th} w-[5.4rem] pr-1 text-right`}>
                Debit (₹)
              </th>
              <th scope="col" className={`${th} w-[5.4rem] text-right`}>
                Credit (₹)
              </th>
            </tr>
          </thead>
          <tbody>
            {frame.weights.map((w) => (
              <tr key={w.accountId} className={`border-b border-edge ${w.delta !== 0 ? 'bg-accent-soft' : ''}`}>
                <td className="py-0.5 pr-1">{w.title}</td>
                <td className="py-0.5 pr-1 text-right tabular-nums">{w.side === 'Dr' ? money(w.amount) : ''}</td>
                <td className="py-0.5 text-right tabular-nums">{w.side === 'Cr' ? money(w.amount) : ''}</td>
              </tr>
            ))}
            {frame.suspense ? (
              <tr data-testid={`${S}-tb-suspense`} className="border-b border-edge font-bold text-accent-ink">
                <td className="py-0.5 pr-1">Suspense A/c</td>
                <td className="py-0.5 pr-1 text-right tabular-nums">{frame.suspense.side === 'Dr' ? money(frame.suspense.amount) : ''}</td>
                <td className="py-0.5 text-right tabular-nums">{frame.suspense.side === 'Cr' ? money(frame.suspense.amount) : ''}</td>
              </tr>
            ) : null}
            <tr className="border-y-2 border-double border-edge-deep font-extrabold">
              <td className="py-1 pr-1">Total</td>
              <td className={`py-1 pr-1 text-right tabular-nums ${frame.tilt !== 'level' ? 'text-danger-deep' : ''}`}>{money(frame.debit)}</td>
              <td className={`py-1 text-right tabular-nums ${frame.tilt !== 'level' ? 'text-danger-deep' : ''}`}>{money(frame.credit)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** A journal entry as the board writes it: debits first with "Dr.", each credit begun with "To", the narration. */
export function EntryTable({ lines, narration, testId }: { lines: readonly JournalLine[]; narration: string; testId: string }) {
  return (
    <div className="overflow-x-auto">
      <table data-testid={testId} className="w-full min-w-[17rem] border-collapse text-xs sm:text-sm">
        <thead>
          <tr className="border-b-2 border-edge-deep text-left">
            <th scope="col" className={`${th} pr-1`}>
              Particulars
            </th>
            <th scope="col" className={`${th} w-8 pr-1 text-center`}>
              L.F.
            </th>
            <th scope="col" className={`${th} w-[4.8rem] pr-1 text-right`}>
              Dr (₹)
            </th>
            <th scope="col" className={`${th} w-[4.8rem] text-right`}>
              Cr (₹)
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td className={`py-0.5 pr-1 ${l.side === 'Cr' ? 'pl-5' : ''}`}>
                {l.side === 'Cr' ? `To ${title(l.accountId)}` : <>{title(l.accountId)} <span className="font-bold">Dr.</span></>}
              </td>
              <td />
              <td className="py-0.5 pr-1 text-right tabular-nums">{l.side === 'Dr' ? money(l.amount) : ''}</td>
              <td className="py-0.5 text-right tabular-nums">{l.side === 'Cr' ? money(l.amount) : ''}</td>
            </tr>
          ))}
          <tr className="border-b border-edge">
            <td colSpan={4} className="pb-1 text-[11px] italic text-muted">
              (Being {narration})
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** How the error is put right, found before and found after the trial balance is prepared. */
export function Rectification({ error, highlight }: { error: ErrorCase; highlight?: 'before' | 'after' }) {
  const entry = rectifyingEntry(error);
  const before = beforeCorrection(error);
  const box = (on: boolean) => `flex min-w-0 flex-col gap-1 rounded-card border-2 bg-surface p-3 shadow-card ${on ? 'border-primary' : 'border-edge'}`;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <section data-testid={`${S}-before`} className={box(highlight === 'before')}>
        <h4 className="text-sm font-extrabold">Found before the trial balance is prepared</h4>
        {before ? (
          <>
            <p className="text-sm">
              <strong>No journal entry.</strong> {before.intro}
            </p>
            <p className="rounded-control bg-sunken px-3 py-2 text-sm font-bold">{before.words}</p>
          </>
        ) : (
          <>
            <p className="text-sm">{entryIntro(error, 'before')}</p>
            <EntryTable lines={entry} narration={error.narration} testId={`${S}-entry-before`} />
          </>
        )}
      </section>
      <section data-testid={`${S}-after`} className={box(highlight === 'after')}>
        <h4 className="text-sm font-extrabold">Found after the trial balance is prepared</h4>
        <p className="text-sm">
          {suspenseOf(error) ? 'The difference stands in Suspense A/c, so the rectifying entry corrects the account and clears Suspense:' : entryIntro(error, 'after')}
        </p>
        <EntryTable lines={entry} narration={error.narration} testId={`${S}-entry-after`} />
      </section>
    </div>
  );
}

/** Suspense A/c, opened with the difference in the trial balance and closed by the rectifying entry. */
export function SuspenseAccount({ error, closed }: { error: ErrorCase; /** The rectifying entry has been passed. */ closed: boolean }) {
  const s = suspenseOf(error);
  if (!s) return null;
  const clearing = rectifyingEntry(error).find((l) => l.accountId !== 'suspense')!;
  const rows: Record<Side, { text: string; amount: number }> = {
    Dr: s.side === 'Dr' ? { text: 'To Difference in Trial Balance', amount: s.amount } : { text: `To ${title(clearing.accountId)}`, amount: s.amount },
    Cr: s.side === 'Cr' ? { text: 'By Difference in Trial Balance', amount: s.amount } : { text: `By ${title(clearing.accountId)}`, amount: s.amount },
  };
  return (
    <section data-testid={`${S}-suspense-account`} className="flex flex-col gap-1 rounded-card border border-edge bg-surface p-3 text-xs shadow-card sm:text-sm">
      <h4 className="flex justify-between text-sm font-extrabold">
        <span className="text-xs font-bold text-muted">Dr.</span>
        Suspense A/c
        <span className="text-xs font-bold text-muted">Cr.</span>
      </h4>
      <div className="grid grid-cols-2 border-t-2 border-edge-deep">
        {(['Dr', 'Cr'] as const).map((side) => {
          const opening = side === s.side;
          return (
            <div key={side} className={`flex min-h-16 flex-col gap-1 p-1.5 ${side === 'Cr' ? 'border-l-2 border-edge-deep' : ''}`}>
              {opening || closed ? (
                <p className="flex justify-between gap-1">
                  <span className="min-w-0">{rows[side].text}</span>
                  <span className="tabular-nums">{money(rows[side].amount)}</span>
                </p>
              ) : null}
              {closed ? <p className="mt-auto border-y-2 border-double border-edge-deep text-right font-extrabold tabular-nums">{money(s.amount)}</p> : null}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted">
        {closed
          ? `Opened with the difference in the trial balance on the ${s.side === 'Dr' ? 'debit' : 'credit'} side, and closed by the rectifying entry: both sides total ${formatINR(s.amount)} and nothing is left in it.`
          : `Opened with the difference in the trial balance, on the ${s.side === 'Dr' ? 'debit' : 'credit'} side. It stays open until the error is found.`}
      </p>
    </section>
  );
}
