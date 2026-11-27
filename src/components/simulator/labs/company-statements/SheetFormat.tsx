'use client';

import { faceLines, faceRows, inr, notesOf, type Company, type Holding } from '@/simulator/company-statements/sheet';
import { P } from './Board';

// The balance sheet as the board writes it: the face (Particulars, Note No., the figure of the year) in the vertical
// form of Schedule III, and the notes to accounts that list the items behind each figure. Built from the balances
// placed so far.

const num = (p: number) => inr(p).slice(1);

export function SheetFormat({ company, holdings, placed }: { company: Company; holdings: readonly Holding[]; placed: readonly string[] }) {
  const rows = faceRows(holdings.filter((h) => placed.includes(h.id)));
  const face = faceLines(rows);
  const notes = notesOf(rows);
  return (
    <section aria-labelledby="cs-format-title" data-testid={`${P}-format`} className="grid min-w-0 items-start gap-3 rounded-card border border-edge bg-surface p-3 shadow-card lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-1">
        <h3 id="cs-format-title" className="text-base font-extrabold">
          Balance Sheet of {company.name} as at {company.dates[1]}
        </h3>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">Each balance sorted onto the board appears here as a line of the face.</p>
        ) : (
          <table data-testid={`${P}-face`} className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-edge-deep text-left text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="py-1 pr-2">
                  Particulars
                </th>
                <th scope="col" className="w-12 py-1 pr-2 text-center">
                  Note No.
                </th>
                <th scope="col" className="w-28 py-1 text-right">
                  {company.dates[1]} (₹)
                </th>
              </tr>
            </thead>
            <tbody>
              {face.map((l, k) =>
                l.kind === 'part' ? (
                  <tr key={k}>
                    <th scope="colgroup" colSpan={3} className="pt-2 text-left text-xs font-extrabold tracking-wide">
                      {l.text}
                    </th>
                  </tr>
                ) : l.kind === 'major' ? (
                  <tr key={k}>
                    <th scope="colgroup" colSpan={3} className="pt-1 pl-2 text-left text-xs font-extrabold text-muted">
                      {l.text}
                    </th>
                  </tr>
                ) : l.kind === 'group' ? (
                  <tr key={k}>
                    <td colSpan={3} className="pt-0.5 pl-4 text-left text-sm">
                      {l.text}
                    </td>
                  </tr>
                ) : l.kind === 'row' ? (
                  <tr key={k} data-testid={`${P}-face-${l.sub}`} className="border-b border-edge">
                    <td className={`py-0.5 pr-2 ${l.part ? 'pl-8' : 'pl-4'}`}>{l.label}</td>
                    <td className="py-0.5 pr-2 text-center text-xs text-muted">{l.note}</td>
                    <td className="py-0.5 text-right tabular-nums">{l.amount < 0 ? `(${num(-l.amount)})` : num(l.amount)}</td>
                  </tr>
                ) : (
                  <tr key={k} className="border-y-2 border-edge-deep font-extrabold">
                    <td className="py-1">{l.label}</td>
                    <td />
                    <td className="py-1 text-right tabular-nums">{num(l.amount)}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="text-base font-extrabold">Notes to Accounts</h3>
        {notes.length === 0 ? <p className="text-sm text-muted">Each figure on the face has a note listing its items.</p> : null}
        {notes.map((n) => (
          <table key={n.no} data-testid={`${P}-note-${n.sub}`} className="w-full border-collapse text-sm">
            <caption className="pt-1 text-left text-xs font-extrabold">
              Note {n.no}: {n.title}
            </caption>
            <tbody>
              {n.lines.map((x, k) => (
                <tr key={k} className="border-b border-edge">
                  <td className="py-0.5 pr-2">{x.label}</td>
                  <td className="w-28 py-0.5 text-right tabular-nums">{x.less ? `(${num(x.amount)})` : num(x.amount)}</td>
                </tr>
              ))}
              {n.lines.length > 1 ? (
                <tr className="font-extrabold">
                  <td className="py-0.5">Total</td>
                  <td className="py-0.5 text-right tabular-nums">{n.total < 0 ? `(${num(-n.total)})` : num(n.total)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        ))}
      </div>
    </section>
  );
}
