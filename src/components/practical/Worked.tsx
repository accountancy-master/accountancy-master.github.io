'use client';

import type { ReactNode } from 'react';
import { accountTitle, balancesOf, closingBalance, dayMonth, ledgerOf, runningBalances, rupees, sideTotal, voucherForm, type LedgerAccount } from '@/content/practical/figures';
import type {
  BankBalance,
  BankReconciliationWorked,
  BrsItem,
  Business,
  Chart,
  CompanyAnalysisWorked,
  JournalEntry,
  RatioWorked,
  SoleProprietorWorked,
  SpreadsheetWorked,
  StatementLine,
  TwoSided,
  VouchersWorked,
  WorkedOutline,
} from '@/content/practical/types';

// The worked outline of a project guide, drawn in the formats a project file uses: journal, ledger, trial balance,
// final accounts, the two bank books and the reconciliation, vouchers, a company's statements and their analysis,
// spreadsheets. Wide tables scroll sideways inside their own box, so the page never does. `printing` opens what is
// folded, so a printed guide has everything.

const plain = (n: number) => rupees(n, false);
const cell = 'border-b border-edge px-2 py-1.5 align-top';
const num = `${cell} text-right tabular-nums whitespace-nowrap`;

/** A table that scrolls sideways in its own box on a narrow screen. */
function Table({ caption, head, children, testId, minWidth = 'min-w-[32rem]' }: { caption: ReactNode; head: ReactNode[]; children: ReactNode; testId?: string; minWidth?: string }) {
  return (
    <div className="avoid-break flex min-w-0 flex-col gap-1">
      <div className="max-w-full overflow-x-auto rounded-control border border-edge" tabIndex={0} role="region" aria-label={typeof caption === 'string' ? caption : undefined}>
        <table data-testid={testId} className={`w-full ${minWidth} border-collapse text-sm`}>
          <caption className="bg-sunken px-2 py-1.5 text-left text-sm font-extrabold">{caption}</caption>
          <thead>
            <tr className="bg-sunken text-xs uppercase tracking-wide text-muted">
              {head.map((h, i) => (
                <th key={i} scope="col" className={`${cell} text-left font-extrabold`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

function H({ children }: { children: ReactNode }) {
  return <h4 className="mt-2 text-base font-extrabold text-primary-ink">{children}</h4>;
}

/** A part of the outline that folds on screen (always open when printing). */
function Fold({ title, printing, children, testId }: { title: string; printing: boolean; children: ReactNode; testId?: string }) {
  return (
    <details data-testid={testId} open={printing || undefined} className="group rounded-control border border-edge bg-surface">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-extrabold text-primary-ink">{title}</summary>
      <div className="flex flex-col gap-3 border-t border-edge p-3">{children}</div>
    </details>
  );
}

function BusinessCard({ business, conventions }: { business: Business; conventions: string[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-control bg-sunken p-3">
      <p className="text-base font-extrabold">
        {business.name} · <span className="font-bold text-muted">{business.place}</span>
      </p>
      <p className="text-sm">
        <span className="font-bold">Owner:</span> {business.owner} · <span className="font-bold">Trade:</span> {business.trade} · <span className="font-bold">Period:</span> {business.period}
      </p>
      <p className="text-sm">{business.about}</p>
      <p className="text-sm font-extrabold">Assumptions stated in the file</p>
      <ul className="list-disc pl-5 text-sm">
        {conventions.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </div>
  );
}

export function Worked({ worked, printing }: { worked: WorkedOutline; printing: boolean }) {
  switch (worked.kind) {
    case 'sole-proprietor':
      return <SoleProprietor w={worked} printing={printing} />;
    case 'bank-reconciliation':
      return <Reconciliation w={worked} printing={printing} />;
    case 'vouchers':
      return <Vouchers w={worked} printing={printing} />;
    case 'company-analysis':
      return <Analysis w={worked} printing={printing} />;
    case 'spreadsheet':
      return <Spreadsheet w={worked} />;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Journal, ledger and statements.
// ---------------------------------------------------------------------------------------------------------------

function Journal({ entries, caption, refs }: { entries: readonly JournalEntry[]; caption: string; refs?: readonly string[] }) {
  const dr = entries.reduce((n, e) => n + e.lines.reduce((m, l) => m + (l.dr ?? 0), 0), 0);
  return (
    <Table caption={caption} head={['Date', 'Particulars', refs ? 'Voucher' : 'L.F.', 'Dr (₹)', 'Cr (₹)']} testId="worked-journal" minWidth="min-w-[36rem]">
      {entries.map((e, i) => (
        <JournalRows key={i} entry={e} refNo={refs?.[i]} />
      ))}
      <tr className="font-extrabold">
        <td className={cell} />
        <td className={cell}>Total</td>
        <td className={cell} />
        <td className={num}>{plain(dr)}</td>
        <td className={num}>{plain(dr)}</td>
      </tr>
    </Table>
  );
}

function JournalRows({ entry, refNo }: { entry: JournalEntry; refNo?: string }) {
  const drs = entry.lines.filter((l) => l.dr);
  const crs = entry.lines.filter((l) => l.cr);
  const rows = [...drs, ...crs];
  return (
    <>
      {rows.map((l, i) => (
        <tr key={i}>
          <td className={`${cell} whitespace-nowrap`}>{i === 0 ? dayMonth(entry.date) : ''}</td>
          <td className={cell}>{l.dr ? `${accountTitle(l.account)} ... Dr` : <span className="pl-6">To {accountTitle(l.account)}</span>}</td>
          <td className={cell}>{i === 0 ? (refNo ?? '') : ''}</td>
          <td className={num}>{l.dr ? plain(l.dr) : ''}</td>
          <td className={num}>{l.cr ? plain(l.cr) : ''}</td>
        </tr>
      ))}
      <tr>
        <td className={cell} />
        <td className={`${cell} italic text-muted`} colSpan={4}>
          ({entry.narration})
        </td>
      </tr>
    </>
  );
}

function LedgerAccountTable({ account, lastDate }: { account: LedgerAccount; lastDate: string }) {
  const debit = [...account.debit];
  const credit = [...account.credit];
  if (account.side === 'Dr') credit.push({ date: lastDate, particulars: 'By Balance c/d', amount: account.balance });
  if (account.side === 'Cr') debit.push({ date: lastDate, particulars: 'To Balance c/d', amount: account.balance });
  const n = Math.max(debit.length, credit.length);
  return (
    <Table caption={accountTitle(account.name)} head={['Date', 'Particulars', '₹', 'Date', 'Particulars', '₹']} minWidth="min-w-[36rem]">
      {Array.from({ length: n }, (_, i) => (
        <tr key={i}>
          <td className={`${cell} whitespace-nowrap`}>{debit[i] ? dayMonth(debit[i].date) : ''}</td>
          <td className={cell}>{debit[i]?.particulars ?? ''}</td>
          <td className={num}>{debit[i] ? plain(debit[i].amount) : ''}</td>
          <td className={`${cell} whitespace-nowrap border-l border-edge`}>{credit[i] ? dayMonth(credit[i].date) : ''}</td>
          <td className={cell}>{credit[i]?.particulars ?? ''}</td>
          <td className={num}>{credit[i] ? plain(credit[i].amount) : ''}</td>
        </tr>
      ))}
      <tr className="font-extrabold">
        <td className={cell} />
        <td className={cell} />
        <td className={num}>{plain(account.total)}</td>
        <td className={`${cell} border-l border-edge`} />
        <td className={cell} />
        <td className={num}>{plain(account.total)}</td>
      </tr>
    </Table>
  );
}

/** How the parts of a line are worked: "Sales 3,00,000 less Sales Returns 5,000". */
function partsText(line: StatementLine): string {
  return (line.parts ?? [])
    .map((p, i) => {
      const label = p.label.replace(/^(Less|Add): /, '');
      return `${i === 0 ? '' : p.less ? 'less ' : 'add '}${label} ${plain(p.amount)}`;
    })
    .join(', ');
}

function LineLabel({ line }: { line: StatementLine }) {
  return (
    <>
      {line.label}
      {line.parts ? <span className="block text-xs text-muted">{partsText(line)}</span> : null}
    </>
  );
}

/** An account in two sides (Trading, Profit and Loss) or a balance sheet: the sides side by side, with their totals. */
function TwoSidedTable({ caption, left, right, sides, testId }: { caption: string; left: readonly StatementLine[]; right: readonly StatementLine[]; sides: [string, string]; testId?: string }) {
  const n = Math.max(left.length, right.length);
  return (
    <Table caption={caption} head={[sides[0], '₹', sides[1], '₹']} testId={testId} minWidth="min-w-[34rem]">
      {Array.from({ length: n }, (_, i) => (
        <tr key={i}>
          <td className={cell}>{left[i] ? <LineLabel line={left[i]} /> : null}</td>
          <td className={num}>{left[i] ? plain(left[i].amount) : ''}</td>
          <td className={`${cell} border-l border-edge`}>{right[i] ? <LineLabel line={right[i]} /> : null}</td>
          <td className={num}>{right[i] ? plain(right[i].amount) : ''}</td>
        </tr>
      ))}
      <tr className="font-extrabold">
        <td className={cell}>Total</td>
        <td className={num}>{plain(sideTotal(left))}</td>
        <td className={`${cell} border-l border-edge`}>Total</td>
        <td className={num}>{plain(sideTotal(right))}</td>
      </tr>
    </Table>
  );
}

function account(caption: string, s: TwoSided, testId?: string) {
  return <TwoSidedTable caption={caption} left={s.debit} right={s.credit} sides={['Dr: Particulars', 'Cr: Particulars']} testId={testId} />;
}

// ---------------------------------------------------------------------------------------------------------------
// Charts: a pie (drawn as a ring) or bars, always with the figures and shares written out.
// ---------------------------------------------------------------------------------------------------------------

// The fixed order of hues (checked for colour-blind separation of neighbours on the light surface).
const HUES = ['var(--color-hue-blue)', 'var(--color-hue-amber)', 'var(--color-hue-violet)', 'var(--color-hue-green)', 'var(--color-hue-orange)', 'var(--color-hue-sky)', 'var(--color-hue-rose)'];
const pct = (part: number, whole: number) => Math.round((part / whole) * 1000) / 10;

function ChartView({ chart }: { chart: Chart }) {
  const total = chart.parts.reduce((n, p) => n + p.amount, 0);
  // Where each slice starts, as a share of the whole.
  const starts = chart.parts.map((_, i) => chart.parts.slice(0, i).reduce((n, p) => n + p.amount, 0) / total);
  return (
    <figure data-testid="worked-chart" className="avoid-break flex min-w-0 flex-col gap-3 rounded-control border border-edge p-3">
      <figcaption className="text-sm font-extrabold">
        {chart.title} <span className="font-bold text-muted">({chart.kind === 'pie' ? 'pie chart' : 'bar diagram'}, total ₹{plain(total)})</span>
      </figcaption>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {chart.kind === 'pie' ? (
          <svg viewBox="-1.1 -1.1 2.2 2.2" className="h-36 w-36 shrink-0 self-center" role="img" aria-label={`${chart.title}: pie chart`}>
            {chart.parts.map((p, i) => {
              const share = p.amount / total;
              const a0 = starts[i] * 2 * Math.PI - Math.PI / 2;
              const a1 = (starts[i] + share) * 2 * Math.PI - Math.PI / 2;
              const large = share > 0.5 ? 1 : 0;
              const [x0, y0, x1, y1] = [Math.cos(a0), Math.sin(a0), Math.cos(a1), Math.sin(a1)];
              const d = share >= 0.9999 ? 'M 0 -1 A 1 1 0 1 1 -0.0001 -1 Z' : `M 0 0 L ${x0} ${y0} A 1 1 0 ${large} 1 ${x1} ${y1} Z`;
              return <path key={p.label} d={d} fill={HUES[i % HUES.length]} stroke="var(--color-surface)" strokeWidth={0.02} />;
            })}
            <circle r={0.5} fill="var(--color-surface)" />
          </svg>
        ) : null}
        <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
          {chart.parts.map((p, i) => (
            <li key={p.label} className="flex min-w-0 flex-col gap-0.5">
              <span className="flex min-w-0 items-baseline justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden="true" className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: HUES[i % HUES.length] }} />
                  <span className="min-w-0 truncate font-bold">{p.label}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted">
                  ₹{plain(p.amount)} · {pct(p.amount, total)}%{chart.kind === 'pie' ? ` · ${Math.round((p.amount / total) * 360)}°` : ''}
                </span>
              </span>
              {chart.kind === 'bar' ? (
                <span aria-hidden="true" className="block h-3 rounded-sm" style={{ width: `${Math.max(1, (p.amount / chart.parts[0].amount) * 100)}%`, background: HUES[i % HUES.length] }} />
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-sm">
        <span className="font-bold">What it shows: </span>
        {chart.reading}
      </p>
    </figure>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// The kinds of worked outline.
// ---------------------------------------------------------------------------------------------------------------

function SoleProprietor({ w, printing }: { w: SoleProprietorWorked; printing: boolean }) {
  const ledger = ledgerOf(w.journal);
  const lastDate = w.journal.at(-1)!.date;
  const tbTotal = w.trialBalance.reduce((n, r) => n + (r.debit ?? 0), 0);
  return (
    <div className="flex flex-col gap-3">
      <BusinessCard business={w.business} conventions={w.conventions} />
      <H>1. Journal</H>
      <Fold title={`The journal: ${w.journal.length} entries`} printing={printing} testId="worked-journal-fold">
        <Journal entries={w.journal} caption={`Journal of ${w.business.name} for ${w.business.period}`} />
      </Fold>
      <H>2. Ledger</H>
      <Fold title={`The ledger: ${ledger.length} accounts, each balanced`} printing={printing}>
        {ledger.map((a) => (
          <LedgerAccountTable key={a.name} account={a} lastDate={lastDate} />
        ))}
      </Fold>
      <H>3. Trial balance</H>
      <Table caption={`Trial balance of ${w.business.name} as at 30 April 2025`} head={['Account', 'Dr (₹)', 'Cr (₹)']} testId="worked-trial-balance" minWidth="min-w-[22rem]">
        {w.trialBalance.map((r) => (
          <tr key={r.account}>
            <td className={cell}>{accountTitle(r.account)}</td>
            <td className={num}>{r.debit ? plain(r.debit) : ''}</td>
            <td className={num}>{r.credit ? plain(r.credit) : ''}</td>
          </tr>
        ))}
        <tr className="font-extrabold">
          <td className={cell}>Total</td>
          <td className={num}>{plain(tbTotal)}</td>
          <td className={num}>{plain(w.trialBalance.reduce((n, r) => n + (r.credit ?? 0), 0))}</td>
        </tr>
      </Table>
      <H>4. Adjustments</H>
      <ul className="list-disc pl-5 text-sm">
        {w.adjustments.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      <H>5. Final accounts</H>
      {account(`Trading Account of ${w.business.name} for the month ended 30 April 2025`, w.trading, 'worked-trading')}
      {account(`Profit and Loss Account for the month ended 30 April 2025`, w.profitAndLoss, 'worked-pl')}
      <TwoSidedTable caption={`Balance Sheet of ${w.business.name} as at 30 April 2025`} left={w.balanceSheet.liabilities} right={w.balanceSheet.assets} sides={['Liabilities', 'Assets']} testId="worked-balance-sheet" />
      <p data-testid="worked-key-figures" className="rounded-control bg-primary-soft px-3 py-2 text-sm font-bold text-primary-ink">
        Gross profit ₹{plain(w.keyFigures.grossProfit)} · Net profit ₹{plain(w.keyFigures.netProfit)} · Balance Sheet total ₹{plain(w.keyFigures.balanceSheetTotal)}
      </p>
      <H>6. Charts</H>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {w.charts.map((c) => (
          <ChartView key={c.title} chart={c} />
        ))}
      </div>
    </div>
  );
}

function balanceText(b: BankBalance) {
  return `${b.label}: ₹${plain(b.amount)}`;
}

function BrsTable({ caption, start, add, less, result, testId }: { caption: string; start: BankBalance; add: readonly BrsItem[]; less: readonly BrsItem[]; result: BankBalance; testId?: string }) {
  const addTotal = add.reduce((n, i) => n + i.amount, 0);
  const lessTotal = less.reduce((n, i) => n + i.amount, 0);
  return (
    <Table caption={caption} head={['Particulars', '+ (₹)', '− (₹)']} testId={testId} minWidth="min-w-[26rem]">
      <tr className="font-bold">
        <td className={cell}>{start.label}</td>
        <td className={num}>{plain(start.amount)}</td>
        <td className={num} />
      </tr>
      {add.length ? (
        <tr>
          <td className={`${cell} font-extrabold`} colSpan={3}>
            Add:
          </td>
        </tr>
      ) : null}
      {add.map((i) => (
        <tr key={i.label}>
          <td className={`${cell} pl-5`}>{i.label}</td>
          <td className={num}>{plain(i.amount)}</td>
          <td className={num} />
        </tr>
      ))}
      {less.length ? (
        <tr>
          <td className={`${cell} font-extrabold`} colSpan={3}>
            Less:
          </td>
        </tr>
      ) : null}
      {less.map((i) => (
        <tr key={i.label}>
          <td className={`${cell} pl-5`}>{i.label}</td>
          <td className={num} />
          <td className={num}>{plain(i.amount)}</td>
        </tr>
      ))}
      <tr className="font-bold">
        <td className={cell}>Totals</td>
        <td className={num}>{plain(start.amount + addTotal)}</td>
        <td className={num}>{plain(lessTotal)}</td>
      </tr>
      <tr className="font-extrabold">
        <td className={cell}>{result.label}</td>
        <td className={num}>{plain(result.amount)}</td>
        <td className={num} />
      </tr>
    </Table>
  );
}

function Reconciliation({ w, printing }: { w: BankReconciliationWorked; printing: boolean }) {
  const passBalances = runningBalances(w.passBook);
  const cbIn = w.cashBook.reduce((n, r) => n + (r.deposit ?? 0), 0);
  const cbOut = w.cashBook.reduce((n, r) => n + (r.withdrawal ?? 0), 0);
  return (
    <div className="flex flex-col gap-3">
      <BusinessCard business={w.business} conventions={w.conventions} />
      <H>1. The two books</H>
      <Fold title={`Cash book (bank column): ${w.cashBook.length - 1} entries`} printing={printing} testId="worked-cash-book-fold">
        <Table caption={`Cash book (bank column) of ${w.business.name}, ${w.business.period}`} head={['Date', 'Particulars', 'Chq No.', 'Receipts (Dr) ₹', 'Payments (Cr) ₹']} testId="worked-cash-book" minWidth="min-w-[36rem]">
          {w.cashBook.map((r, i) => (
            <tr key={i}>
              <td className={`${cell} whitespace-nowrap`}>{dayMonth(r.date)}</td>
              <td className={cell}>{r.particulars}</td>
              <td className={cell}>{r.chequeNo ?? ''}</td>
              <td className={num}>{r.deposit ? plain(r.deposit) : ''}</td>
              <td className={num}>{r.withdrawal ? plain(r.withdrawal) : ''}</td>
            </tr>
          ))}
          <tr>
            <td className={`${cell} whitespace-nowrap`}>{dayMonth(w.cashBook.at(-1)!.date)}</td>
            <td className={cell}>By Balance c/d</td>
            <td className={cell} />
            <td className={num} />
            <td className={num}>{plain(closingBalance(w.cashBook))}</td>
          </tr>
          <tr className="font-extrabold">
            <td className={cell} />
            <td className={cell}>Total</td>
            <td className={cell} />
            <td className={num}>{plain(cbIn)}</td>
            <td className={num}>{plain(cbOut + closingBalance(w.cashBook))}</td>
          </tr>
        </Table>
      </Fold>
      <Fold title={`Pass book: ${w.passBook.length - 1} entries`} printing={printing} testId="worked-pass-book-fold">
        <Table caption={`Pass book (bank statement) of ${w.business.name}, ${w.business.period}`} head={['Date', 'Particulars', 'Withdrawals ₹', 'Deposits ₹', 'Balance ₹']} testId="worked-pass-book" minWidth="min-w-[36rem]">
          {w.passBook.map((r, i) => (
            <tr key={i}>
              <td className={`${cell} whitespace-nowrap`}>{dayMonth(r.date)}</td>
              <td className={cell}>{r.particulars}</td>
              <td className={num}>{r.withdrawal ? plain(r.withdrawal) : ''}</td>
              <td className={num}>{r.deposit && r.ref !== 'opening' ? plain(r.deposit) : ''}</td>
              <td className={num}>{plain(passBalances[i])} Cr</td>
            </tr>
          ))}
        </Table>
      </Fold>
      <p className="text-sm">
        Balances on {w.statement.asAt}: cash book <span className="font-bold">₹{plain(closingBalance(w.cashBook))} Dr</span>, pass book{' '}
        <span className="font-bold">₹{plain(closingBalance(w.passBook))} Cr</span>. Ticking the items both books record leaves the ones in the statement.
      </p>
      <H>2. Bank reconciliation statement</H>
      <BrsTable caption={`Bank Reconciliation Statement of ${w.business.name} as at ${w.statement.asAt}`} start={w.statement.start} add={w.statement.add} less={w.statement.less} result={w.statement.result} testId="worked-brs" />
      <H>3. Second method: amended cash book, then the statement</H>
      <BrsTable caption="Amended cash book (bank column)" start={w.statement.start} add={w.amended.add} less={w.amended.less} result={w.amended.balance} />
      <BrsTable caption={`Bank Reconciliation Statement as at ${w.statement.asAt} (from the amended balance)`} start={w.amended.balance} add={w.amended.add2} less={w.amended.less2} result={w.amended.result} />
      <p className="text-sm font-bold">{balanceText(w.statement.result)}, by both methods.</p>
    </div>
  );
}

const VOUCHER_TYPE: Record<VouchersWorked['vouchers'][number]['type'], string> = {
  debit: 'Debit voucher (cash paid)',
  credit: 'Credit voucher (cash received)',
  transfer: 'Transfer voucher (no cash)',
  journal: 'Journal voucher',
};

function Vouchers({ w, printing }: { w: VouchersWorked; printing: boolean }) {
  const journal = w.vouchers.map((v) => ({ date: v.date, lines: v.lines, narration: v.narration }));
  const balances = [...balancesOf(journal).entries()];
  const dr = balances.filter(([, b]) => b > 0).reduce((n, [, b]) => n + b, 0);
  return (
    <div className="flex flex-col gap-3">
      <BusinessCard business={w.business} conventions={w.conventions} />
      <H>1. Source documents</H>
      <Table caption="The source documents collected" head={['Document', 'Issued by', 'What it proves']} minWidth="min-w-[30rem]">
        {w.documents.map((d) => (
          <tr key={d.name}>
            <td className={`${cell} font-bold`}>{d.name}</td>
            <td className={cell}>{d.issuedBy}</td>
            <td className={cell}>{d.what}</td>
          </tr>
        ))}
      </Table>
      <H>2. Vouchers</H>
      <Fold title={`The vouchers: ${w.vouchers.length}, one for each transaction`} printing={printing} testId="worked-vouchers-fold">
        <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {w.vouchers.map((v) => (
            <li key={v.no} data-testid="worked-voucher" className="avoid-break flex min-w-0 flex-col gap-2 rounded-control border-2 border-edge-deep p-3">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="font-extrabold">
                  {w.business.name} · {VOUCHER_TYPE[v.type]}
                </span>
                <span className="font-bold text-muted">
                  No. {v.no} · {dayMonth(v.date)} 2025 · {voucherForm(v)}
                </span>
              </p>
              <p className="text-sm">{v.transaction}</p>
              <div className="max-w-full overflow-x-auto">
                <table className="w-full min-w-[18rem] border-collapse text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-muted">
                      <th scope="col" className={`${cell} text-left`}>Account</th>
                      <th scope="col" className={`${cell} text-right`}>Dr ₹</th>
                      <th scope="col" className={`${cell} text-right`}>Cr ₹</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.lines.map((l) => (
                      <tr key={l.account}>
                        <td className={cell}>{accountTitle(l.account)}</td>
                        <td className={num}>{l.dr ? plain(l.dr) : ''}</td>
                        <td className={num}>{l.cr ? plain(l.cr) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm italic text-muted">Narration: {v.narration}.</p>
              <p className="text-xs">
                <span className="font-bold">Supported by:</span> {v.source}
              </p>
              <p className="text-xs text-muted">Prepared by: ________ · Authorised by: ________{v.type === 'debit' ? ' · Received by: ________' : ''}</p>
            </li>
          ))}
        </ul>
      </Fold>
      <H>3. Journal from the vouchers</H>
      <Fold title="The journal, with the voucher number of each entry" printing={printing}>
        <Journal entries={journal} caption={`Journal of ${w.business.name}, ${w.business.period}`} refs={w.vouchers.map((v) => v.no)} />
      </Fold>
      <H>4. Trial balance</H>
      <Table caption={`Trial balance of ${w.business.name} as at 30 June 2025`} head={['Account', 'Dr (₹)', 'Cr (₹)']} testId="worked-trial-balance" minWidth="min-w-[22rem]">
        {balances.map(([name, b]) => (
          <tr key={name}>
            <td className={cell}>{accountTitle(name)}</td>
            <td className={num}>{b > 0 ? plain(b) : ''}</td>
            <td className={num}>{b < 0 ? plain(-b) : ''}</td>
          </tr>
        ))}
        <tr className="font-extrabold">
          <td className={cell}>Total</td>
          <td className={num}>{plain(dr)}</td>
          <td className={num}>{plain(dr)}</td>
        </tr>
      </Table>
    </div>
  );
}

function ratioText(r: RatioWorked, v: number) {
  return r.unit === 'ratio' ? `${v} : 1` : r.unit === 'times' ? `${v} times` : `${v}%`;
}

function Analysis({ w, printing }: { w: CompanyAnalysisWorked; printing: boolean }) {
  const [cy, py] = w.company.years;
  const groups = [...w.balanceSheet.equityAndLiabilities.map((g) => ({ ...g, side: 'Equity and liabilities' })), ...w.balanceSheet.assets.map((g) => ({ ...g, side: 'Assets' }))];
  const pl = w.profitAndLoss;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-control bg-sunken p-3">
        <p className="text-base font-extrabold">{w.company.name}</p>
        <p className="text-sm">{w.company.about}</p>
        <p className="text-sm font-extrabold">Assumptions stated in the file</p>
        <ul className="list-disc pl-5 text-sm">
          {w.conventions.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
      <H>1. The statements ({w.company.unit})</H>
      <Fold title="Balance Sheet and Statement of Profit and Loss of the two years" printing={printing} testId="worked-statements-fold">
        <Table caption={`Balance Sheet as at 31 March (${w.company.unit})`} head={['Particulars', cy, py]} minWidth="min-w-[24rem]">
          {groups.map((g) => (
            <GroupRows key={g.head} head={g.head} lines={g.lines} />
          ))}
        </Table>
        <Table caption={`Statement of Profit and Loss (${w.company.unit})`} head={['Particulars', cy, py]} minWidth="min-w-[24rem]">
          {[...pl.income, ...pl.expenses, pl.tax].map((l) => (
            <tr key={l.id}>
              <td className={cell}>{l.label}</td>
              <td className={num}>{plain(l.cy)}</td>
              <td className={num}>{plain(l.py)}</td>
            </tr>
          ))}
        </Table>
        <Table caption={`From the notes (${w.company.unit})`} head={['Particulars', cy, py]} minWidth="min-w-[24rem]">
          {w.notes.map((l) => (
            <tr key={l.id}>
              <td className={cell}>{l.label}</td>
              <td className={num}>{plain(l.cy)}</td>
              <td className={num}>{plain(l.py)}</td>
            </tr>
          ))}
        </Table>
      </Fold>
      <H>2. First aspect: comparative and common size statements</H>
      <Table caption={`${w.comparative.title} (${w.company.unit})`} head={['Particulars', cy, py, 'Change', 'Change %']} testId="worked-comparative" minWidth="min-w-[34rem]">
        {w.comparative.lines.map((l) => (
          <tr key={l.label} className={l.strong ? 'font-extrabold' : ''}>
            <td className={cell}>{l.label}</td>
            <td className={num}>{plain(l.cy)}</td>
            <td className={num}>{plain(l.py)}</td>
            <td className={num}>{plain(l.change)}</td>
            <td className={num}>{l.percent}%</td>
          </tr>
        ))}
      </Table>
      <Readings items={w.comparative.reading} />
      <Table caption={`${w.commonSize.title} (${w.company.unit}). Base: ${w.commonSize.base}`} head={['Particulars', cy, py, `${cy} %`, `${py} %`]} testId="worked-common-size" minWidth="min-w-[34rem]">
        {w.commonSize.lines.map((l) => (
          <tr key={l.label} className={l.strong ? 'font-extrabold' : ''}>
            <td className={cell}>{l.label}</td>
            <td className={num}>{plain(l.cy)}</td>
            <td className={num}>{plain(l.py)}</td>
            <td className={num}>{l.cyPercent}</td>
            <td className={num}>{l.pyPercent}</td>
          </tr>
        ))}
      </Table>
      <Readings items={w.commonSize.reading} />
      <H>3. Second aspect: accounting ratios</H>
      <ul data-testid="worked-ratios" className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {w.ratios.map((r) => (
          <li key={r.id} data-testid={`worked-ratio-${r.id}`} className="avoid-break flex min-w-0 flex-col gap-1 rounded-control border border-edge p-3">
            <p className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-extrabold">{r.name}</span>
              <span className="text-xs font-bold uppercase tracking-wide text-muted">{r.group}</span>
            </p>
            <p className="text-sm text-muted">{r.formula}</p>
            <p className="text-sm">
              <span className="font-bold">{cy}:</span> {r.working.cy} = <span className="font-extrabold">{ratioText(r, r.cy)}</span>
            </p>
            <p className="text-sm">
              <span className="font-bold">{py}:</span> {r.working.py} = <span className="font-extrabold">{ratioText(r, r.py)}</span>
            </p>
            <p className="text-sm">{r.reading}</p>
          </li>
        ))}
      </ul>
      <H>4. Conclusion</H>
      <Readings items={w.conclusion} />
    </div>
  );
}

function GroupRows({ head, lines }: { head: string; lines: CompanyAnalysisWorked['notes'] }) {
  return (
    <>
      <tr>
        <td className={`${cell} font-extrabold`} colSpan={3}>
          {head}
        </td>
      </tr>
      {lines.map((l) => (
        <tr key={l.id}>
          <td className={`${cell} pl-5`}>{l.label}</td>
          <td className={num}>{plain(l.cy)}</td>
          <td className={num}>{plain(l.py)}</td>
        </tr>
      ))}
    </>
  );
}

function Readings({ items }: { items: readonly string[] }) {
  return (
    <ul className="list-disc pl-5 text-sm">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

function Spreadsheet({ w }: { w: SpreadsheetWorked }) {
  const total = (k: 'basic' | 'da' | 'hra' | 'gross' | 'pf' | 'net') => w.payroll.reduce((n, p) => n + p[k], 0);
  return (
    <div className="flex flex-col gap-3">
      <BusinessCard business={w.business} conventions={w.conventions} />
      <H>1. Payroll sheet</H>
      <Table caption={`Payroll of ${w.business.name}, June 2025 (₹)`} head={['A: Name', 'B: Basic', 'C: DA', 'D: HRA', 'E: Gross', 'F: PF', 'G: Net']} testId="worked-payroll" minWidth="min-w-[36rem]">
        {w.payroll.map((p) => (
          <tr key={p.name}>
            <td className={cell}>{p.name}</td>
            {(['basic', 'da', 'hra', 'gross', 'pf', 'net'] as const).map((k) => (
              <td key={k} className={num}>
                {plain(p[k])}
              </td>
            ))}
          </tr>
        ))}
        <tr className="font-extrabold">
          <td className={cell}>Total</td>
          {(['basic', 'da', 'hra', 'gross', 'pf', 'net'] as const).map((k) => (
            <td key={k} className={num}>
              {plain(total(k))}
            </td>
          ))}
        </tr>
      </Table>
      <Formulas sheet={w.sheets[0]} />
      <H>2. Depreciation schedule</H>
      <Table caption={`Delivery van: cost ₹${plain(w.depreciation.cost)}, scrap value ₹${plain(w.depreciation.scrap)}, life ${w.depreciation.life} years (₹)`} head={['Year', 'Opening value', 'Depreciation', 'Closing value']} minWidth="min-w-[26rem]">
        {w.depreciation.rows.map((r) => (
          <tr key={r.year}>
            <td className={cell}>{r.year}</td>
            <td className={num}>{plain(r.opening)}</td>
            <td className={num}>{plain(r.charge)}</td>
            <td className={num}>{plain(r.closing)}</td>
          </tr>
        ))}
      </Table>
      <Formulas sheet={w.sheets[1]} />
      <H>3. In the accounting package</H>
      <ol className="list-decimal pl-5 text-sm">
        {w.packageSteps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </div>
  );
}

function Formulas({ sheet }: { sheet: SpreadsheetWorked['sheets'][number] }) {
  return (
    <Table caption={`${sheet.title}: the formulas. ${sheet.purpose}`} head={['Cell', 'Formula', 'What it does']} minWidth="min-w-[30rem]">
      {sheet.formulas.map((f) => (
        <tr key={f.cell}>
          <td className={`${cell} font-bold`}>{f.cell}</td>
          <td className={`${cell} whitespace-nowrap font-mono`}>{f.formula}</td>
          <td className={cell}>{f.meaning}</td>
        </tr>
      ))}
    </Table>
  );
}
