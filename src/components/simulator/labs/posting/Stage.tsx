'use client';

import { forwardRef, useState } from 'react';
import { formatINR } from '@/engine/money';
import { viewAt, type PostingStep, type TAccount } from '@/simulator/posting/ledger';
import type { PostingStory } from '@/simulator/posting/story';
import { bringIntoView, flyChip } from '../kit/flights';
import { BoardAccount, JournalBook, P, TAccountCard, TrialBalanceTable, type Picture } from './parts';

// ---------------------------------------------------------------------------------------------------------------
// The stage of the lab "posting": the journal beside the ledger (above it on a phone), the trial balance under
// them, and the account of your choice as the examination writes it.
// ---------------------------------------------------------------------------------------------------------------

/** What the picture shows once `shown` steps have played and step `moving` is being animated. */
export function pictureOf(steps: readonly PostingStep[], shown: number, moving: number | null): Picture {
  const v = viewAt(steps, shown);
  const balanced = new Map<string, 'cd' | 'full'>([...v.balanced].map((id) => [id, 'full' as const]));
  const pending = new Set<string>();
  let listing: string | null = null;
  const m = moving === null ? null : steps[moving];
  if (m?.kind === 'post') for (const r of m.rows) pending.add(r.key);
  if (m?.kind === 'balance') balanced.set(m.accountId, 'cd');
  if (m?.kind === 'tb') listing = m.accountId;
  // What the step is about stays marked after it has played, until the next one begins.
  const about = m ?? (shown > 0 ? steps[shown - 1] : null);
  return {
    rows: v.rows,
    pending,
    posted: v.posted,
    current: about?.kind === 'post' ? `${about.txn}.${about.line}` : null,
    balanced,
    listed: v.listed,
    listing,
    totals: v.totals,
    focus: about && about.kind !== 'agree' ? about.accountId : null,
  };
}

/** The animation of one step: a chip flies from where the figure comes from to where it is written. */
export async function runPostingStep(root: HTMLElement | null, steps: readonly PostingStep[], ledger: readonly TAccount[], i: number, ms: number): Promise<void> {
  const s = steps[i];
  if (!root) return;
  const q = (sel: string) => root.querySelector(sel);
  const wait = () => new Promise<void>((done) => window.setTimeout(done, ms / 2));
  if (s.kind === 'post') {
    const first = q(`[data-row="${s.rows[0].key}"]`);
    bringIntoView(first?.closest('[data-account]') ?? null);
    await Promise.all(s.rows.map((r) => flyChip(root, q(`[data-line="${s.txn}.${s.line}"]`), q(`[data-row="${r.key}"]`), `${r.particulars}  ${formatINR(r.amount)}`, ms)));
  } else if (s.kind === 'balance') {
    const a = ledger.find((x) => x.accountId === s.accountId)!;
    const card = q(`[data-account="${s.accountId}"]`);
    bringIntoView(card);
    if (!a.broughtDown || ms <= 0) return ms > 0 ? wait() : undefined;
    await flyChip(root, q(`[data-row="${a.carriedDown!.key}"]`), q(`[data-row="${a.broughtDown.key}"]`), `${a.broughtDown.particulars}  ${formatINR(a.balance!.amount)}`, ms);
  } else if (s.kind === 'tb') {
    const a = ledger.find((x) => x.accountId === s.accountId)!;
    if (!a.balance || ms <= 0) return ms > 0 ? wait() : undefined;
    const to = q(`[data-tb="${a.accountId}:${a.balance.side}"]`);
    bringIntoView(to);
    await flyChip(root, q(`[data-row="${a.broughtDown!.key}"]`), to, `${a.title}  ${formatINR(a.balance.amount)}`, ms);
  } else if (ms > 0) {
    bringIntoView(q(`[data-testid="${P}-tb"]`));
    await wait();
  }
}

export const PostingStage = forwardRef<HTMLDivElement, { story: PostingStory; ledger: readonly TAccount[]; pic: Picture; showTrialBalance?: boolean }>(function PostingStage(
  { story, ledger, pic, showTrialBalance = true },
  ref,
) {
  return (
    <div ref={ref} className="relative flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section aria-labelledby={`${P}-journal-title`} className="flex min-w-0 flex-col gap-1 self-start rounded-card border border-edge bg-surface p-3 shadow-card lg:sticky lg:top-20">
          <h4 id={`${P}-journal-title`} className="text-center text-sm font-extrabold">
            Journal of {story.business} <span className="text-xs font-bold text-muted">(page J1)</span>
          </h4>
          <JournalBook story={story} pic={pic} />
        </section>
        <section aria-labelledby={`${P}-ledger-title`} className="flex min-w-0 flex-col gap-2">
          <h4 id={`${P}-ledger-title`} className="text-sm font-extrabold">
            Ledger
          </h4>
          <div data-testid={`${P}-ledger`} className="grid gap-3 md:grid-cols-2 lg:grid-cols-1">
            {ledger.map((a) => (
              <TAccountCard key={a.accountId} account={a} pic={pic} />
            ))}
          </div>
        </section>
      </div>
      {showTrialBalance ? <TrialBalanceTable business={story.business} ledger={ledger} pic={pic} /> : null}
    </div>
  );
});

/** An account of the story written in full, as the examination expects it: pick which. */
export function BoardFormat({ ledger }: { ledger: readonly TAccount[] }) {
  const [chosen, setChosen] = useState<string>(ledger[0]?.accountId ?? '');
  const account = ledger.find((a) => a.accountId === chosen) ?? ledger[0];
  if (!account) return null;
  return (
    <details className="rounded-card border border-edge bg-surface p-3 shadow-card">
      <summary className="min-h-11 cursor-pointer content-center text-base font-extrabold">Written as in the examination</summary>
      <div className="mt-2 flex flex-col gap-2">
        <label className="flex flex-wrap items-center gap-2 text-sm font-bold">
          Account
          <select value={account.accountId} onChange={(e) => setChosen(e.target.value)} data-testid={`${P}-board-pick`} className="min-h-11 rounded-control border-2 border-edge-deep bg-surface px-2 text-base">
            {ledger.map((a) => (
              <option key={a.accountId} value={a.accountId}>
                {a.title}
              </option>
            ))}
          </select>
        </label>
        <BoardAccount account={account} />
        <p className="text-xs text-muted">
          Each side has a J.F. column (the page of the journal the entry is on), and the L.F. column of the journal gets the page of the account once the line is posted. The accounts of incomes and
          expenses are balanced here only to carry their balances to the trial balance; at the year end they are closed to the Trading and Profit and Loss Account instead.
        </p>
      </div>
    </details>
  );
}
