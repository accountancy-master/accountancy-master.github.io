'use client';

import { useState } from 'react';
import { Arrive } from '../kit/Arrive';
import { amountText } from '../kit/format';
import { Card } from '../kit/LabShell';
import {
  accountView,
  correctedTb,
  errorsWhen,
  f,
  sideWord,
  suspenseLeft,
  TB_DATE,
  totalsOf,
  type Case,
  type CaseError,
  type TbRow,
} from '@/simulator/trial-balance-fix/model';
import { profitLines, type DeskState } from '@/simulator/trial-balance-fix/walk';
import { Badge, LedgerAccount, P } from './LedgerAccount';

// ---------------------------------------------------------------------------------------------------------------
// The boards below the ledger: the trial balance (as drawn up, checked, with Suspense A/c), the Suspense board (what
// is left in Suspense A/c, and which errors are in it), the corrected trial balance and the corrected profit.
// ---------------------------------------------------------------------------------------------------------------

const th = 'py-1 pr-1 text-[11px] font-bold uppercase tracking-wide text-muted';

function TbTable({ rows, suspense, testId, caption, revealed, reduced }: { rows: TbRow[]; suspense: { side: 'Dr' | 'Cr'; amount: number } | null; testId: string; caption: string; revealed: ReadonlySet<string>; reduced: boolean }) {
  const t = totalsOf(rows);
  const debit = t.debit + (suspense?.side === 'Dr' ? suspense.amount : 0);
  const credit = t.credit + (suspense?.side === 'Cr' ? suspense.amount : 0);
  const agree = debit === credit;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <table data-testid={testId} className="w-full table-fixed border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-y-2 border-edge-deep text-left">
            <th scope="col" className={th}>
              Name of account
            </th>
            <th scope="col" className={`${th} w-9 text-center`}>
              L.F.
            </th>
            <th scope="col" className={`${th} w-[5.2rem] text-right`}>
              Debit (₹)
            </th>
            <th scope="col" className={`${th} w-[5.2rem] text-right`}>
              Credit (₹)
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const fixed = r.fixed && r.letter && revealed.has(r.letter);
            return (
              <tr key={r.accountId} className={`border-b border-edge ${fixed ? 'bg-accent-soft' : ''}`}>
                <td className="break-words py-0.5 pr-1">
                  <Arrive from="translateY(-10px)" reduced={reduced} className="inline-block">
                    {fixed ? <Badge tone="fixed" label={r.fixed === 'added' ? 'written in when checked' : 'moved to its right column when checked'}>✎({r.letter})</Badge> : null}
                    {r.title}
                  </Arrive>
                  {fixed ? <span className="block text-[11px] text-accent-ink">{r.fixed === 'added' ? 'left out of the draft' : `was in the ${r.side === 'Dr' ? 'credit' : 'debit'} column`}</span> : null}
                </td>
                <td className="py-0.5 pr-1 text-center text-xs text-muted">{r.folio}</td>
                <td className="py-0.5 pr-1 text-right tabular-nums">{r.side === 'Dr' ? amountText(r.amount) : ''}</td>
                <td className="py-0.5 text-right tabular-nums">{r.side === 'Cr' ? amountText(r.amount) : ''}</td>
              </tr>
            );
          })}
          {suspense ? (
            <tr data-testid={`${testId}-suspense`} className="border-b border-edge bg-accent-soft font-bold">
              <td className="py-0.5 pr-1">
                <Arrive from="translateY(-16px)" reduced={reduced} className="inline-block">
                  Suspense A/c
                </Arrive>
              </td>
              <td />
              <td className="py-0.5 pr-1 text-right tabular-nums">{suspense.side === 'Dr' ? amountText(suspense.amount) : ''}</td>
              <td className="py-0.5 text-right tabular-nums">{suspense.side === 'Cr' ? amountText(suspense.amount) : ''}</td>
            </tr>
          ) : null}
          <tr className={`border-y-4 border-double border-edge-deep font-extrabold ${agree ? '' : 'text-danger-deep'}`}>
            <td className="py-1 pr-1">Total</td>
            <td />
            <td data-testid={`${testId}-total-dr`} className="py-1 pr-1 text-right tabular-nums">
              {amountText(debit)}
            </td>
            <td data-testid={`${testId}-total-cr`} className="py-1 text-right tabular-nums">
              {amountText(credit)}
            </td>
          </tr>
        </tbody>
      </table>
      <p data-testid={`${testId}-verdict`} className={`rounded-control px-2 py-1 text-sm font-bold ${agree ? 'bg-primary-soft text-primary-ink' : 'bg-danger-soft text-danger-deep'}`}>
        {agree ? `✓ Agrees: both columns ${f(debit)}.` : `✗ Does not agree: the ${debit < credit ? 'debit' : 'credit'} column is short by ${f(Math.abs(debit - credit))}.`}
      </p>
    </div>
  );
}

/** The trial balance as it stands: as drawn up, as checked, with Suspense A/c. */
export function TrialBalanceBoard({ c, st, reduced }: { c: Case; st: DeskState; reduced: boolean }) {
  if (st.tb === 'none') return null;
  const rows = st.tb === 'draft' ? c.tbDraft : c.tbChecked;
  return (
    <Card title={`Trial Balance of ${c.data.business} as on ${TB_DATE}`} testId={`${P}-tb-card`} aside={<span className="text-xs font-bold text-muted">{st.tb === 'draft' ? 'as first drawn up' : 'checked against the ledger'}</span>}>
      <TbTable rows={rows} suspense={st.suspense ? c.suspense : null} testId={`${P}-tb`} caption="The trial balance" revealed={st.revealed} reduced={reduced} />
    </Card>
  );
}

export function CorrectedTbBoard({ c, st, reduced }: { c: Case; st: DeskState; reduced: boolean }) {
  if (!st.corrected) return null;
  return (
    <Card title={`Trial Balance as on ${TB_DATE}, after rectification`} testId={`${P}-tb-corrected-card`}>
      <TbTable rows={correctedTb(c)} suspense={null} testId={`${P}-tb-corrected`} caption="The corrected trial balance" revealed={new Set()} reduced={reduced} />
    </Card>
  );
}

function effectWords(e: CaseError): string {
  if (e.kind === 'complete-omission') return 'Left out altogether: the columns stayed equal, so it is not in Suspense A/c.';
  if (e.kind === 'compensating') return 'Two slips of the same amount that cancel: the columns stayed equal, so they are not in Suspense A/c.';
  if (!e.oneSided) return 'Two accounts wrong by the same amount: the columns stayed equal, so it is not in Suspense A/c.';
  return `Made the ${e.gap > 0 ? 'debit' : 'credit'} column ${f(Math.abs(e.gap))} larger: its rectification ${e.gap > 0 ? 'debits' : 'credits'} Suspense A/c ${f(Math.abs(e.gap))}.`;
}

/** Suspense A/c in full, what is left in it, and the errors found after the trial balance with their share in it. */
export function SuspenseBoard({ c, st, reduced }: { c: Case; st: DeskState; reduced: boolean }) {
  if (!st.suspense) return null;
  const view = accountView(c, 'suspense', st)!;
  const after = errorsWhen(c, 'after');
  const left = suspenseLeft(c, st.rectified);
  // The meter: what is left, against the most Suspense A/c ever held on the way to nil.
  let run = c.suspense.side === 'Dr' ? c.suspense.amount : -c.suspense.amount;
  let most = Math.abs(run);
  for (const r of c.rectifications) {
    const l = r.lines.find((x) => x.accountId === 'suspense');
    if (!l) continue;
    run += l.side === 'Dr' ? l.amount : -l.amount;
    most = Math.max(most, Math.abs(run));
  }
  const width = most ? Math.round((Math.abs(left) / most) * 100) : 0;
  return (
    <Card title="Suspense A/c and the errors behind it" testId={`${P}-suspense-card`}>
      <LedgerAccount view={view} testId={`${P}-suspense`} reduced={reduced} />
      <div className="flex flex-col gap-1">
        <p data-testid={`${P}-suspense-left`} className={`text-sm font-extrabold ${left === 0 ? 'text-primary-ink' : 'text-accent-ink'}`}>
          {left === 0 ? '✓ Nothing is left: Suspense A/c is closed.' : `Left in Suspense A/c: ${f(Math.abs(left))} (${sideWord(left > 0 ? 'Dr' : 'Cr')} balance).`}
        </p>
        <div aria-hidden="true" className="h-4 overflow-hidden rounded-full bg-sunken ring-1 ring-edge">
          <div className="h-full origin-left rounded-full bg-accent transition-transform duration-700 motion-reduce:transition-none" style={{ transform: `scaleX(${width / 100})` }} />
        </div>
      </div>
      <ul data-testid={`${P}-suspense-errors`} className="flex flex-col gap-1.5 text-sm">
        {after.map((e) => {
          const found = st.revealed.has(e.letter);
          const done = st.rectified.has(e.letter);
          return (
            <li key={e.letter} data-found={found ? 'true' : 'false'} className={`rounded-control border px-2 py-1.5 ${found ? (e.oneSided ? 'border-accent-deep bg-surface' : 'border-edge bg-surface') : 'border-dashed border-edge text-muted'}`}>
              <span className="font-extrabold">
                {e.tag} {found ? e.name : 'not found yet'}
              </span>
              {done ? (
                <Badge tone="ok" label="rectified">
                  ✓
                </Badge>
              ) : null}
              {found ? <span className="block">{effectWords(e)}</span> : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function ProfitBoard({ c, st }: { c: Case; st: DeskState }) {
  if (!st.profit) return null;
  const lines = profitLines(c);
  return (
    <Card title="The profit, corrected" testId={`${P}-profit`}>
      <table className="w-full table-fixed border-collapse text-sm">
        <caption className="sr-only">Profit as per the books, corrected for the errors</caption>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className={`border-b border-edge ${i === 0 || i === lines.length - 1 ? 'font-extrabold' : ''}`}>
              <td className="break-words py-1 pr-2">
                {l.sign === '+' ? 'Add: ' : l.sign === '-' ? 'Less: ' : ''}
                {l.label}
              </td>
              <td className="w-24 py-1 text-right tabular-nums">{amountText(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted">From the balances as recorded and as corrected, with closing stock of {f(c.data.closingStock)}. Only an error that left an income or an expense wrong changes the profit.</p>
    </Card>
  );
}

/** The accounts as chips, each with its balance and its marks; a tap opens or closes it. */
export function LedgerBoard({ c, st, reduced }: { c: Case; st: DeskState; reduced: boolean }) {
  const focusKey = st.focus.join('|');
  const [picked, setPicked] = useState<{ key: string; ids: string[] } | null>(null);
  // Suspense A/c has its own board beside the trial balance.
  const views = c.accounts.filter((id) => id !== 'suspense').map((id) => ({ id, v: accountView(c, id, st) })).filter((x) => x.v !== null);
  // A step about Suspense A/c alone opens the accounts its rectifications touch.
  const focus = st.focus.filter((id) => id !== 'suspense');
  const fallback = st.focus.includes('suspense') && !focus.length ? views.filter((x) => x.v!.rectified.length || x.v!.letters.length).slice(0, 2).map((x) => x.id) : focus;
  const open = picked && picked.key === focusKey ? picked.ids : fallback;
  if (!st.posted) return null;
  const toggle = (id: string) => {
    const now = open.includes(id) ? open.filter((x) => x !== id) : [...open, id].slice(-2);
    setPicked({ key: focusKey, ids: now });
  };
  const shown = open.map((id) => views.find((x) => x.id === id)).filter((x) => x !== undefined);
  return (
    <Card title="The ledger (rough work)" testId={`${P}-ledger`} aside={<span className="text-xs text-muted">Tap an account to open it</span>}>
      <div role="group" aria-label="Accounts" className="flex flex-wrap gap-1.5">
        {views.map(({ id, v }) => {
          const on = open.includes(id);
          const wrong = v!.letters.filter((l) => !v!.rectified.includes(l));
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              data-testid={`${P}-chip-${v!.folio}`}
              onClick={() => toggle(id)}
              className={`flex min-h-11 flex-col items-start justify-center rounded-control border-2 px-2 py-1 text-left text-xs leading-tight ${on ? 'border-primary bg-primary-soft ring-2 ring-primary' : 'border-edge-deep bg-surface hover:bg-sunken'}`}
            >
              <span className="font-extrabold">
                {wrong.length ? <Badge tone="wrong" label="has an error found">✗{wrong.join('')}</Badge> : v!.rectified.length ? <Badge tone="ok" label="rectified">✓</Badge> : null}
                {v!.title}
              </span>
              <span className="tabular-nums text-muted">{v!.balance ? `${f(v!.balance.amount)} ${v!.balance.side}` : 'nil'}</span>
            </button>
          );
        })}
      </div>
      {shown.length ? (
        <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,38rem),1fr))] gap-3">
          {shown.map((x) => (
            <LedgerAccount key={x!.id} view={x!.v!} testId={`${P}-account-${x!.v!.folio}`} reduced={reduced} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">No account is open.</p>
      )}
    </Card>
  );
}
