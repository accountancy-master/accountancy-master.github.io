'use client';

import { useState } from 'react';
import { ledgerLabel } from '@/engine/books';
import { formatINR } from '@/engine/money';
import { visible, type ColRow, type Dissolution, type Row } from '@/simulator/dissolution/dissolve';
import { Toggle } from '../kit/LabControls';
import { Journal, TAccount, type TRow } from '../kit/TAccount';

// The accounts as the board writes them, beside the picture: Realisation A/c, the partners' capital accounts in
// columns and Bank A/c, each written up to the step the picture stands at (the rows of that step drawn out), and the
// journal entries of that step.

const P = 'lab-dissolution';
const figure = (p: number) => formatINR(p).slice(1);
/** "31 Mar" from "31 March 2026". */
const shortDate = (date: string) => date.split(' ').slice(0, 2).map((w, i) => (i === 1 ? w.slice(0, 3) : w)).join(' ');

function rowsOf(rows: Row[], shown: number, date: string): TRow[] {
  return visible(rows, shown).map((r) => ({ date: shortDate(date), particulars: r.particulars, amount: r.amount, mark: r.step === shown - 1 ? 'now' : undefined }));
}

function CapitalAccounts({ d, shown }: { d: Dissolution; shown: number }) {
  const names = d.firm.partners.map((p) => p.name);
  const done = shown >= d.steps.length;
  const side = (rows: ColRow[], label: 'Dr' | 'Cr') => {
    const on = visible(rows, shown);
    const totals = names.map((_, i) => on.reduce((s, r) => s + r.amounts[i], 0));
    return (
      <table data-testid={`${P}-capital-${label.toLowerCase()}`} className="w-full table-fixed border-collapse text-xs sm:text-sm">
        <caption className="pb-1 text-left text-xs font-extrabold uppercase tracking-wide text-muted">{label === 'Dr' ? 'Dr. side' : 'Cr. side'}</caption>
        <thead>
          <tr className="border-b-2 border-edge-deep text-left text-muted">
            <th scope="col" className="w-[44%] py-1 pr-1">
              Particulars
            </th>
            {names.map((n) => (
              <th key={n} scope="col" className="py-1 text-right">
                {n} (₹)
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {on.map((r, k) => (
            <tr key={k} data-mark={r.step === shown - 1 ? 'now' : undefined} className={`border-b border-edge align-top ${r.step === shown - 1 ? 'bg-primary-soft' : ''}`}>
              <td className="break-words py-1 pr-1">{r.particulars}</td>
              {r.amounts.map((a, i) => (
                <td key={i} className="py-1 text-right tabular-nums">
                  {a ? figure(a) : ''}
                </td>
              ))}
            </tr>
          ))}
          {done ? (
            <tr className="border-y-2 border-edge-deep font-extrabold">
              <td className="py-1 text-xs uppercase tracking-wide text-muted">Total</td>
              {totals.map((t, i) => (
                <td key={i} className="py-1 text-right tabular-nums">
                  {figure(t)}
                </td>
              ))}
            </tr>
          ) : null}
        </tbody>
      </table>
    );
  };
  return (
    <section aria-label="Partners' Capital Accounts" data-testid={`${P}-capital-accounts`} className="flex flex-col gap-2">
      <h4 className="text-center text-base font-extrabold">
        <span className="text-sm text-muted">Dr.</span> Partners&apos; Capital Accounts <span className="text-sm text-muted">Cr.</span>
      </h4>
      <div className="grid gap-3">
        {side(d.capitals.dr, 'Dr')}
        {side(d.capitals.cr, 'Cr')}
      </div>
    </section>
  );
}

type Which = 'realisation' | 'capitals' | 'bank';

export function Accounts({ d, shown }: { d: Dissolution; shown: number }) {
  const [which, setWhich] = useState<Which>('realisation');
  const resultAt = d.steps.findIndex((s) => s.kind === 'result');
  const date = d.firm.date;
  const now = shown > 0 ? d.steps[shown - 1] : null;
  return (
    <section aria-labelledby="dis-accounts-title" data-testid={`${P}-accounts`} className="flex min-w-0 flex-col gap-3 rounded-card border border-edge bg-surface p-3 shadow-card">
      <h3 id="dis-accounts-title" className="text-base font-extrabold">
        In the answer book
      </h3>
      {now && now.entries.length ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-extrabold uppercase tracking-wide text-muted">Journal: {now.title}</p>
          <Journal
            testId={`${P}-journal`}
            entries={now.entries.map((e) => ({ date: date, lines: e.lines.map((l) => ({ account: ledgerLabel(l.account), side: l.side, amount: l.amount })), narration: e.narration }))}
          />
        </div>
      ) : now ? (
        <p data-testid={`${P}-journal`} className="text-sm text-muted">
          No journal entry for this step.
        </p>
      ) : null}
      <Toggle
        options={[
          { value: 'realisation', label: 'Realisation A/c' },
          { value: 'capitals', label: 'Capital A/cs' },
          { value: 'bank', label: 'Bank A/c' },
        ]}
        value={which}
        onChange={setWhich}
        label="Account shown"
        prefix={`${P}-account`}
        small
      />
      {which === 'realisation' ? (
        <TAccount title="Realisation A/c" testId={`${P}-ledger-realisation`} periods={shown === 0 ? [] : [{ dr: rowsOf(d.realisation.dr, shown, date), cr: rowsOf(d.realisation.cr, shown, date), totals: shown > resultAt }]} />
      ) : null}
      {which === 'capitals' ? <CapitalAccounts d={d} shown={shown} /> : null}
      {which === 'bank' ? <TAccount title="Bank A/c" testId={`${P}-ledger-bank`} periods={[{ dr: rowsOf(d.bankAccount.dr, shown, date), cr: rowsOf(d.bankAccount.cr, shown, date), totals: shown >= d.steps.length }]} /> : null}
    </section>
  );
}
