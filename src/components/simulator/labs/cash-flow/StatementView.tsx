'use client';

import { statementAmount, type CfRow, type Statement } from '@/simulator/cash-flow/model';

// The Cash Flow Statement in the board's format, drawn as it is written: beside each figure a bar that steps from
// where the running figure of its part stood to where the figure takes it (an item added steps right, an item
// deducted steps left and is hatched), and each sub-total as a bar from nil. So the statement is also the picture of
// the operating "filters": profit in at the top, cash out at the bottom.

export function StatementView({
  statement,
  title,
  visible = null,
  current = null,
  masked,
  highlight = null,
  prefix,
}: {
  statement: Statement;
  title: string;
  /** The rows written so far (a walk-through); null for all of them. */
  visible?: ReadonlySet<string> | null;
  /** The row written just now. */
  current?: string | null;
  /** Rows whose figure a question hides. */
  masked?: ReadonlySet<string>;
  /** A row to point at. */
  highlight?: string | null;
  prefix: string;
}) {
  const values = statement.rows.flatMap((r) => [r.from, r.to]);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = Math.max(1, hi - lo);
  const at = (v: number) => ((v - lo) / span) * 100;

  return (
    <div className="overflow-x-auto rounded-card border border-edge bg-surface p-3 shadow-card sm:p-4">
      <table data-testid={`${prefix}-statement`} className="w-full border-collapse text-sm sm:table-fixed">
        <caption className="pb-2 text-left text-base font-extrabold">{title}</caption>
        <thead>
          <tr className="border-b-2 border-edge-deep text-left text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="py-1 pr-2">
              Particulars
            </th>
            <th scope="col" className="hidden w-[40%] py-1 pr-3 sm:table-cell">
              <span aria-hidden="true">The step it makes</span>
              <span className="sr-only">Picture</span>
            </th>
            <th scope="col" className="w-20 py-1 text-right sm:w-24">
              ₹
            </th>
          </tr>
        </thead>
        <tbody>
          {statement.rows.map((r) => {
            const shown = visible === null || visible.has(r.id);
            const hidden = masked?.has(r.id) ?? false;
            return <Row key={r.id} row={r} shown={shown} hidden={hidden} current={r.id === current || r.id === highlight} at={at} zero={at(0)} prefix={prefix} />;
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">
        An outflow, or an item deducted, is in brackets and steps left (hatched); an inflow, or an item added, steps right. Each sub-total is a bar from nil.
      </p>
    </div>
  );
}

function Row({ row, shown, hidden, current, at, zero, prefix }: { row: CfRow; shown: boolean; hidden: boolean; current: boolean; at(v: number): number; zero: number; prefix: string }) {
  const look = `${shown ? 'opacity-100' : 'opacity-0'} transition-opacity duration-500`;
  const mark = current && shown ? 'bg-primary-soft' : '';
  const common = { 'data-testid': `${prefix}-row-${row.id}`, 'data-shown': String(shown), 'aria-hidden': shown ? undefined : true } as const;
  if (row.kind === 'heading')
    return (
      <tr {...common} className={look}>
        <th colSpan={3} scope="rowgroup" className="pt-3 pb-1 text-left text-base font-extrabold">
          {row.label}
        </th>
      </tr>
    );
  if (row.kind === 'subhead')
    return (
      <tr {...common} className={look}>
        <td colSpan={3} className="pt-1 text-xs font-bold italic text-muted">
          {row.label}
        </td>
      </tr>
    );
  const total = row.kind === 'subtotal' || row.kind === 'final';
  const bar = <Bar row={row} grow={shown && !hidden} at={at} zero={zero} />;
  return (
    <tr {...common} className={`${look} ${mark} ${total ? 'font-extrabold' : ''} ${total && shown ? 'border-t border-edge-deep' : ''} ${row.kind === 'final' && shown ? 'border-b-4 border-double' : ''}`}>
      <td className="py-1 pr-2 align-top">
        <span className="block">
          {row.sign ? <span className={`mr-1.5 text-xs font-extrabold uppercase ${row.sign === 'Add' ? 'text-primary-ink' : 'text-danger-deep'}`}>{row.sign}:</span> : null}
          <span className={total || row.sign ? '' : 'font-bold'}>{row.label}</span>
        </span>
        <span className="mt-1 block sm:hidden">{bar}</span>
      </td>
      <td className="hidden py-1 pr-3 align-middle sm:table-cell">{bar}</td>
      <td className="py-1 text-right align-top tabular-nums" data-testid={`${prefix}-amount-${row.id}`}>
        {hidden ? <span className="rounded bg-accent-soft px-1.5 font-extrabold text-accent-ink">?</span> : statementAmount(row.amount)}
      </td>
    </tr>
  );
}

/** The step a row makes, from where its part stood to where it now stands. Decorative: the figure says it all. */
function Bar({ row, grow, at, zero }: { row: CfRow; grow: boolean; at(v: number): number; zero: number }) {
  const left = at(Math.min(row.from, row.to));
  const width = Math.max(0.6, at(Math.max(row.from, row.to)) - left);
  const total = row.kind === 'subtotal' || row.kind === 'final';
  const fill = total ? (row.amount < 0 ? 'bg-hue-rose' : 'bg-hue-sky') : row.amount < 0 ? 'sim-deduction' : 'bg-hue-green';
  // An item deducted grows leftwards from where its part stood; the others grow rightwards.
  const origin = !total && row.amount < 0 ? 'right' : 'left';
  return (
    <span aria-hidden="true" className="relative block h-3.5 w-full">
      <span className="absolute inset-y-0 w-px bg-edge-deep" style={{ left: `${zero}%` }} />
      <span
        className={`absolute inset-y-0.5 rounded-sm ${fill} transition-transform duration-700 ease-out`}
        style={{ left: `${left}%`, width: `${width}%`, transform: `scaleX(${grow ? 1 : 0})`, transformOrigin: origin }}
      />
    </span>
  );
}
