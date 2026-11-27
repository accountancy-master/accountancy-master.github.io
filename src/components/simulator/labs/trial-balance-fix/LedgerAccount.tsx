'use client';

import type { ReactNode } from 'react';
import { Arrive } from '../kit/Arrive';
import { amountText } from '../kit/format';
import type { AccountView, RowView, SideView } from '@/simulator/trial-balance-fix/model';

// ---------------------------------------------------------------------------------------------------------------
// An account of the rough-work ledger as the board writes it: Date, Particulars, J.F. and Amount on each side, the
// totals level at the foot, the balance carried down and brought down. Beyond the kit's TAccount it draws what this
// lab is about: a total that was added up wrongly (written as the clerk wrote it, marked once found), an item in
// error (✗), a posting that is missing (dashed), a correction made in the account itself (the wrong figure struck
// out, ✎) and the items of the rectifying entries (marked with their error's letter). Every mark has its words too.
// ---------------------------------------------------------------------------------------------------------------

export const P = 'lab-trial-balance-fix';

export function Badge({ tone, children, label }: { tone: 'wrong' | 'fixed' | 'rect' | 'missing' | 'ok'; children: ReactNode; label?: string }) {
  const look = {
    wrong: 'bg-danger text-white',
    missing: 'bg-danger-soft text-danger-deep ring-1 ring-danger',
    fixed: 'bg-accent-soft text-accent-ink ring-1 ring-accent-deep',
    rect: 'bg-primary text-white',
    ok: 'bg-primary-soft text-primary-ink ring-1 ring-primary',
  }[tone];
  return (
    <span className={`mr-1 inline-flex items-center gap-0.5 whitespace-nowrap rounded px-1 text-[11px] font-extrabold leading-4 ${look}`} title={label}>
      {children}
      {label ? <span className="sr-only"> {label}</span> : null}
    </span>
  );
}

const MARK_WORDS: Record<NonNullable<RowView['mark']>['tone'], string> = {
  wrong: 'posted wrongly',
  fixed: 'corrected in the account itself',
  rect: 'rectifying entry',
  missing: 'never posted',
};

function Row({ r, reduced }: { r: RowView; reduced: boolean }) {
  const tone = r.mark?.tone;
  const bg = tone === 'wrong' ? 'bg-danger-soft' : tone === 'fixed' ? 'bg-accent-soft' : tone === 'rect' ? 'bg-primary-soft' : '';
  const ghost = tone === 'missing';
  const whole = r.struck === 'row';
  return (
    <tr data-mark={tone} className={`align-top ${ghost ? 'border-2 border-dashed border-danger text-muted' : 'border-b border-edge'} ${bg}`}>
      <td className={`py-1 pr-1 text-xs ${tone === 'rect' ? 'font-extrabold text-primary-ink' : 'text-muted'}`}>
        {r.date}
        {tone === 'rect' ? <span className="sr-only"> rectifying entry</span> : null}
      </td>
      <td className="py-1 pr-1">
        <Arrive from={tone === 'rect' ? 'translateY(-14px)' : 'translateX(-18px)'} reduced={reduced} className="inline-block">
          {r.mark && r.mark.tone !== 'rect' ? (
            <Badge tone={r.mark.tone} label={MARK_WORDS[r.mark.tone]}>
              {r.mark.tone === 'wrong' || r.mark.tone === 'missing' ? '✗' : r.mark.tone === 'fixed' ? '✎' : ''}({r.mark.letter})
            </Badge>
          ) : null}
          {whole ? (
            <s>
              {r.particulars}
              <span className="sr-only"> (struck out)</span>
            </s>
          ) : (
            <span className={ghost ? 'italic' : ''}>{r.particulars}</span>
          )}
          {ghost ? <span className="block text-[11px] font-bold text-danger-deep">not posted</span> : null}
        </Arrive>
      </td>
      <td className="py-1 pr-1 text-center text-xs text-muted">{r.jf}</td>
      <td className="py-1 text-right tabular-nums">
        {typeof r.struck === 'number' ? (
          <>
            <s className="block text-xs text-danger-deep">
              {amountText(r.struck)}
              <span className="sr-only"> (struck out)</span>
            </s>
            {amountText(r.amount)}
          </>
        ) : whole ? (
          <s>{amountText(r.amount)}</s>
        ) : ghost ? (
          <span className="italic">({amountText(r.amount)})</span>
        ) : (
          amountText(r.amount)
        )}
      </td>
    </tr>
  );
}

function Side({ side, view, pad, testId, reduced }: { side: 'Dr' | 'Cr'; view: SideView; pad: number; testId: string; reduced: boolean }) {
  return (
    <table data-testid={testId} className="w-full table-fixed border-collapse text-sm">
      <caption className="sr-only">{side === 'Dr' ? 'Debit side' : 'Credit side'}</caption>
      <thead>
        <tr className="border-b-2 border-edge-deep text-left text-[11px] uppercase tracking-wide text-muted">
          <th scope="col" className="w-12 py-1 pr-1 font-bold">
            {side === 'Dr' ? 'Dr. Date' : 'Date'}
          </th>
          <th scope="col" className="py-1 pr-1 font-bold">
            Particulars
          </th>
          <th scope="col" className="w-8 py-1 pr-1 text-center font-bold">
            J.F.
          </th>
          <th scope="col" className="w-[5rem] py-1 text-right font-bold">
            ₹{side === 'Cr' ? ' Cr.' : ''}
          </th>
        </tr>
      </thead>
      <tbody>
        {view.rows.map((r) => (
          <Row key={r.key} r={r} reduced={reduced} />
        ))}
        {Array.from({ length: pad }, (_, i) => (
          <tr key={`pad${i}`} aria-hidden="true" className="hidden border-b border-edge sm:table-row">
            <td className="py-1">&nbsp;</td>
            <td />
            <td />
            <td />
          </tr>
        ))}
        {view.total !== null ? (
          <tr data-testid={`${testId}-total`} className={`border-y-2 border-edge-deep font-extrabold ${view.totalMark ? 'bg-danger-soft' : ''}`}>
            <td />
            <td className="py-1 text-[11px] uppercase tracking-wide text-muted">
              {view.totalMark ? (
                <Badge tone="wrong" label="added up wrongly">
                  ✗({view.totalMark})
                </Badge>
              ) : null}
              Total
            </td>
            <td />
            <td className="py-1 text-right tabular-nums">{amountText(view.total)}</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

/** One account of the ledger, as it stands. */
export function LedgerAccount({ view, testId, reduced, caption }: { view: AccountView; testId: string; reduced: boolean; caption?: ReactNode }) {
  return (
    <section aria-label={view.title} data-testid={testId} className="@container flex min-w-0 flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
      <h4 className="flex items-baseline justify-between gap-2 text-base font-extrabold">
        <span className="text-sm text-muted">Dr.</span>
        <span className="min-w-0 text-center">
          {view.title} <span className="text-xs font-bold text-muted">(L.F. {view.folio})</span>
        </span>
        <span className="text-sm text-muted">Cr.</span>
      </h4>
      {caption}
      {view.periods.map((p, i) => {
        const most = Math.max(p.dr.rows.length, p.cr.rows.length);
        return (
          <div key={i} data-testid={`${testId}-period`} className="flex min-w-0 flex-col gap-1">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted">{p.title}</p>
            {/* The two sides stand side by side only where the account itself is wide enough for both. */}
            <div className="grid min-w-0 gap-x-3 gap-y-2 @[36rem]:grid-cols-2">
              <Side side="Dr" view={p.dr} pad={most - p.dr.rows.length} testId={`${testId}-dr`} reduced={reduced} />
              <Side side="Cr" view={p.cr} pad={most - p.cr.rows.length} testId={`${testId}-cr`} reduced={reduced} />
            </div>
          </div>
        );
      })}
    </section>
  );
}
