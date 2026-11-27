'use client';

import { useState } from 'react';
import type { Schedule } from '@/simulator/depreciation/schedule';
import { accountAsAt, eventsOf, ledgerOf, periodComplete, type AccountId } from '@/simulator/depreciation/story';
import { Toggle } from '../kit/LabControls';
import { Journal, TAccount } from '../kit/TAccount';

/** The accounts as the board writes them, as they stand after `shown` events, and the entries of the last event. */
export function AccountsPanel({ s, shown }: { s: Schedule; shown: number }) {
  const accounts = ledgerOf(s);
  const [picked, setPicked] = useState<AccountId>('asset');
  const account = accounts.find((a) => a.id === picked) ?? accounts[0];
  const events = eventsOf(s);
  const last = shown > 0 ? events[shown - 1] : null;
  const periods = accountAsAt(account, shown).map((p) => {
    const full = account.periods.find((f) => f.title === p.title)!;
    const mark = (r: { at: number }) => (r.at === shown - 1 ? ('now' as const) : undefined);
    return { title: p.title, dr: p.dr.map((r) => ({ ...r, mark: mark(r) })), cr: p.cr.map((r) => ({ ...r, mark: mark(r) })), totals: periodComplete(full, shown) };
  });
  return (
    <section aria-labelledby="dep-accounts-title" data-testid="lab-depreciation-accounts" className="flex flex-col gap-3 rounded-card border border-edge bg-surface p-3 shadow-card sm:p-4">
      <h3 id="dep-accounts-title" className="text-lg font-extrabold">
        In the books
      </h3>
      <Toggle<AccountId>
        options={accounts.map((a) => ({ value: a.id, label: a.title }))}
        value={account.id}
        onChange={setPicked}
        label="Which account"
        prefix="lab-depreciation-account"
        small
      />
      <TAccount title={account.title} periods={periods} testId={`lab-depreciation-ledger-${account.id}`} />
      {last && last.entries.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-extrabold">The entries of this step ({last.title.toLowerCase()})</h4>
          <Journal entries={last.entries} testId="lab-depreciation-journal" />
        </div>
      ) : null}
    </section>
  );
}
