'use client';

import { formatINR } from '@/engine/money';
import { simLabel } from '@/simulator/accounts';
import { entryOrder, explainPlayed } from '@/simulator/explain';
import type { Scene } from '@/simulator/scenes';
import type { JournalLine, Played } from '@/simulator/types';

const amount = (p: number) => formatINR(p).slice(1);

/** An entry as a journal prints it: debits first, each credit begun with "To", the narration under it. */
export function JournalTable({ lines, narration, testId = 'sim-entry', caption = 'Journal entry' }: { lines: readonly JournalLine[]; narration?: string | null; testId?: string; caption?: string }) {
  return (
    <div className="overflow-x-auto">
      <table data-testid={testId} className="w-full min-w-[18rem] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b-2 border-edge-deep text-left text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="py-1 pr-2">
              Particulars
            </th>
            <th scope="col" className="w-24 py-1 pr-2 text-right">
              Dr (₹)
            </th>
            <th scope="col" className="w-24 py-1 text-right">
              Cr (₹)
            </th>
          </tr>
        </thead>
        <tbody>
          {entryOrder(lines).map((l, i) => (
            <tr key={i} className="border-b border-edge">
              <td className={`py-1 pr-2 ${l.side === 'Cr' ? 'pl-6' : ''}`}>
                {l.side === 'Cr' ? `To ${simLabel(l.accountId)}` : <>{simLabel(l.accountId)} <span className="font-bold">Dr.</span></>}
              </td>
              <td className="py-1 pr-2 text-right tabular-nums">{l.side === 'Dr' ? amount(l.amount) : ''}</td>
              <td className="py-1 text-right tabular-nums">{l.side === 'Cr' ? amount(l.amount) : ''}</td>
            </tr>
          ))}
          {narration ? (
            <tr>
              <td colSpan={3} className="py-1 italic text-muted">
                (Being {narration})
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/** After a transaction has played: what happened, why each side moved, the entry and the ledger accounts. */
export function Explanation({ scene, played }: { scene: Scene; played: Played }) {
  const e = explainPlayed(scene, played);
  return (
    <section aria-labelledby="sim-why" data-testid="sim-explanation" className="flex flex-col gap-3 rounded-card border border-edge bg-surface p-4 shadow-card">
      <h3 id="sim-why" className="text-lg font-extrabold">
        What happened, and why
      </h3>
      <p className="text-base">{e.happened}</p>
      {e.why ? <p className="text-base text-muted">{e.why}</p> : null}
      <ul data-testid="sim-sides" className="flex flex-col gap-1 text-base">
        {e.sides.map((s) => (
          <li key={s} className="flex gap-2">
            <span aria-hidden="true">•</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
      {e.costNote ? <p className="rounded-control bg-accent-soft px-3 py-2 text-sm text-accent-ink">{e.costNote}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-extrabold uppercase tracking-wide text-primary-ink">The journal entry</h4>
          <JournalTable lines={e.entry} narration={e.narration} />
        </div>
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-extrabold uppercase tracking-wide text-primary-ink">The ledger accounts</h4>
          <ul data-testid="sim-ledger" className="flex flex-col gap-1 text-sm">
            {e.ledger.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-sm font-bold">
        {e.equation}. {e.balance}
      </p>
    </section>
  );
}
