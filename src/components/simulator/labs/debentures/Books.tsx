'use client';

import { formatINR } from '@/engine/money';
import { sheetOf, type SheetLine, type Story } from '@/simulator/debentures/issue';
import { Journal } from '../kit/TAccount';
import { P } from './Picture';

// The board's formats beside the picture: the journal entries made so far (the last step's drawn out), and, once the
// year is over, the balance sheet extract with the Finance costs line and the notes to accounts.

const num = (p: number) => formatINR(p).slice(1);

/** A statement in the board's columns: Particulars, Note No. (on the face only) and the amount. */
function Lines({ lines, testId, noteColumn }: { lines: SheetLine[]; testId: string; noteColumn: boolean }) {
  return (
    <table data-testid={testId} className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b-2 border-edge-deep text-left text-xs uppercase tracking-wide text-muted">
          <th scope="col" className="py-1 pr-2">
            Particulars
          </th>
          <th scope="col" className="w-12 py-1 pr-2 text-center">
            {noteColumn ? 'Note No.' : <span className="sr-only">Note No.</span>}
          </th>
          <th scope="col" className="w-28 py-1 text-right">
            Amount (₹)
          </th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l, k) =>
          l.kind === 'heading' ? (
            <tr key={k}>
              <th scope="colgroup" colSpan={3} className="pt-2 text-left text-xs font-extrabold uppercase tracking-wide text-muted">
                {l.text}
              </th>
            </tr>
          ) : (
            <tr key={k} className={`border-b border-edge align-top ${l.kind === 'total' ? 'font-extrabold' : ''}`}>
              <td className={`py-1 pr-2 ${l.kind === 'row' && l.indent ? 'pl-4' : ''}`}>{l.label}</td>
              <td className="w-12 py-1 pr-2 text-center text-xs text-muted">{l.kind === 'row' ? (l.note ?? '') : ''}</td>
              <td className="w-28 py-1 text-right tabular-nums">{l.amount === null ? '' : l.kind === 'row' && l.less ? `(${num(l.amount)})` : num(l.amount)}</td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

export function Books({ s, shown }: { s: Story; shown: number }) {
  const played = s.steps.slice(0, shown);
  const entries = played.flatMap((st, k) => st.entries.map((e) => ({ ...e, last: k === shown - 1 })));
  const atSheet = played.some((st) => st.id === 'sheet');
  const { face, notes } = sheetOf(s.input);
  return (
    <div className="grid min-w-0 items-start gap-3 lg:grid-cols-2">
      <section aria-labelledby="deb-journal-title" data-testid={`${P}-journal-panel`} className="flex min-w-0 flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
        <h3 id="deb-journal-title" className="text-base font-extrabold">
          Journal
        </h3>
        {entries.length === 0 ? (
          <p className="text-sm text-muted">No entry yet.{shown > 0 && s.steps[shown - 1].id === 'collateral' ? ' The first method passes none for the debentures.' : ''}</p>
        ) : (
          <>
            {entries.some((e) => e.last) ? (
              <div className="rounded-control border-l-4 border-primary bg-primary-soft/50 px-2 py-1">
                <p className="text-xs font-extrabold uppercase tracking-wide text-muted">This step</p>
                <Journal entries={entries.filter((e) => e.last).map(({ date, lines, narration }) => ({ date, lines, narration }))} testId={`${P}-journal-now`} />
              </div>
            ) : null}
            {entries.some((e) => !e.last) ? (
              <details className="text-sm">
                <summary className="min-h-11 cursor-pointer py-2 font-bold">The entries before ({entries.filter((e) => !e.last).length})</summary>
                <Journal entries={entries.filter((e) => !e.last).map(({ date, lines, narration }) => ({ date, lines, narration }))} testId={`${P}-journal`} />
              </details>
            ) : null}
          </>
        )}
      </section>
      <section aria-labelledby="deb-sheet-title" data-testid={`${P}-sheet`} className="flex min-w-0 flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
        <h3 id="deb-sheet-title" className="text-base font-extrabold">
          In the financial statements
        </h3>
        {atSheet ? (
          <>
            <Lines lines={face} testId={`${P}-sheet-face`} noteColumn />
            <p className="text-xs font-extrabold uppercase tracking-wide text-muted">Notes to Accounts</p>
            <Lines lines={notes} testId={`${P}-sheet-notes`} noteColumn={false} />
            <p className="text-xs text-muted">Only what these debentures leave is shown; a line that comes to nil is left out with its note.</p>
          </>
        ) : (
          <p className="text-sm text-muted">Shown at the year end, once the interest is closed{s.f.loss > 0 ? ' and the loss written off' : ''}.</p>
        )}
      </section>
    </div>
  );
}
