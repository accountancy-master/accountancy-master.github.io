import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { labHref } from '@/simulator/labs';
import { FollowScroll } from './FollowScroll';
import {
  BALANCE_SHEET,
  BS_ASSETS,
  BS_LIABILITIES,
  CAPITAL,
  CASH_AT_END,
  CGST,
  CLOSING_STOCK,
  GROSS_PROFIT,
  INVOICE_TOTAL,
  JOURNAL,
  LIST_PRICE,
  NARRATION,
  NET_PROFIT,
  OPENING,
  SALARY,
  SALE,
  SGST,
  TAXABLE,
  TRADE_DISCOUNT,
  TRADING_TOTAL,
  TRIAL_BALANCE,
  TRIAL_CR,
  TRIAL_DR,
  amount,
  inWords,
  inr,
} from './figures';

/** Custom properties for a part of the board: its moment (--a, --d) and, for a travelling amount, its path. */
const v = (vars: Record<string, number | string>, more: CSSProperties = {}): CSSProperties => ({ ...more, ...(vars as CSSProperties) });

/** A part of a scene that fades up at its moment. */
function Fade({ a, d = 0.12, className = '', style, children }: { a: number; d?: number; className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div className={`ft-x ft-fade ${className}`} style={v({ '--a': a, '--d': d }, style)}>
      {children}
    </div>
  );
}

/** Words written in ink at their moment, with the nib at the end of the ink while it writes. */
function Ink({ a, d = 0.1, className = '', children }: { a: number; d?: number; className?: string; children: ReactNode }) {
  return (
    <span className={`ft-x ft-inkw ${className}`} style={v({ '--a': a, '--d': d })}>
      <span className="ft-ink">{children}</span>
      <svg className="ft-nib" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M3 21l3.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L3 21z" fill="var(--lp-mustard)" />
        <path d="M13.5 7.5l3 3" />
      </svg>
    </span>
  );
}

/** An amount travelling from (x0, y0) to (x1, y1) on the board, in its units. */
function Chip({ from, to, a, d = 0.2, children }: { from: [number, number]; to: [number, number]; a: number; d?: number; children: ReactNode }) {
  return (
    <span className="ft-x ft-chip" style={v({ '--a': a, '--d': d, '--x0': from[0], '--y0': from[1], '--x1': to[0], '--y1': to[1] })}>
      {children}
    </span>
  );
}

/** Something that appears when the amount travelling to it arrives. */
function Arrive({ a, d = 0.2, className = '', style, children }: { a: number; d?: number; className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <span className={`ft-x ft-show ${className}`} style={v({ '--a': a, '--d': d }, style)}>
      {children}
    </span>
  );
}

const sceneStyle = (i: number): CSSProperties => v({ '--i': i });

// --- Scene 1: the bill -------------------------------------------------------------------------------------------

function BillScene() {
  const rows: [string, string, string?][] = [
    [`${SALE.quantity} ${SALE.item} @ ${inr(SALE.rate)}`, amount(LIST_PRICE)],
    [`Less: Trade discount @ ${SALE.tradeDiscountPercent}%`, `− ${amount(TRADE_DISCOUNT)}`],
    ['Taxable value', amount(TAXABLE), 'ft-row-rule'],
    ['Add: CGST @ 9%', amount(CGST)],
    ['Add: SGST @ 9%', amount(SGST)],
  ];
  return (
    <div className="ft-scene" style={sceneStyle(0)}>
      <div className="ft-paper ft-bill lp-carbon">
        <div className="ft-bill-head">
          <span className="ft-title">Tax invoice</span>
          <span className="ft-amt ft-small">No. {SALE.invoiceNo}</span>
        </div>
        <div className="ft-bill-seller">{SALE.seller}</div>
        <div className="ft-small ft-muted">
          {SALE.city}, Rajasthan
        </div>
        <dl className="ft-bill-meta">
          <dt>Bill to</dt>
          <dd>
            {SALE.buyer}, {SALE.city}
          </dd>
          <dt>Date</dt>
          <dd>{SALE.date} · on credit</dd>
        </dl>
        {rows.map(([label, value, extra], i) => (
          <Fade key={label} a={0.04 + i * 0.09} d={0.1} className={`ft-row ${extra ?? ''}`}>
            <span>{label}</span>
            <span className="ft-amt">{value}</span>
          </Fade>
        ))}
        <Fade a={0.5} d={0.1} className="ft-row ft-row-total">
          <span>Invoice total</span>
          <span className="ft-amt ft-x ft-hl" style={v({ '--a': 0.58, '--d': 0.12 })}>
            {inr(INVOICE_TOTAL)}
          </span>
        </Fade>
        <Fade a={0.6} d={0.1} className="ft-words">
          {inWords(INVOICE_TOTAL)}
        </Fade>
      </div>
      <Fade a={0.66} d={0.1} className="ft-note" style={{ left: '1.5em', top: '26.9em' }}>
        ✎ The trade discount is never entered in the books
      </Fade>
      <Fade a={0.72} d={0.1} className="ft-note" style={{ left: '5.2em', top: '29.6em' }}>
        ✎ GST is worked on {inr(TAXABLE)}, the price after discount
      </Fade>
    </div>
  );
}

// --- Scene 2: the journal ----------------------------------------------------------------------------------------

function JournalScene() {
  const [dr, ...crs] = JOURNAL;
  const at = (k: number) => 0.03 + k * 0.13;
  return (
    <div className="ft-scene" style={sceneStyle(1)}>
      <div className="ft-paper ft-journal lp-carbon">
        <div className="ft-jtitle">
          <span className="ft-title">Journal</span> <span className="ft-small ft-muted">of {SALE.seller}</span>
        </div>
        <div className="ft-cols ft-jhead">
          <span>Date</span>
          <span>Particulars</span>
          <span>L.F.</span>
          <span className="ft-r">Dr ₹</span>
          <span className="ft-r">Cr ₹</span>
        </div>
        <div className="ft-jbody">
          <div className="ft-cols">
            <div>
              <div className="ft-jline">
                <Ink a={0.01} d={0.04}>2026</Ink>
              </div>
              <div className="ft-jline">
                <Ink a={0.05} d={0.04}>Apr 12</Ink>
              </div>
            </div>
            <div>
              <div className="ft-jline">
                <Ink a={at(0)} d={0.09} className="ft-name">
                  {dr.account}
                </Ink>
                <Ink a={at(0) + 0.09} d={0.025} className="ft-dr">
                  Dr
                </Ink>
              </div>
              {crs.map((l, k) => (
                <div key={l.account} className="ft-jline ft-jline-to">
                  <Ink a={at(k + 1)} d={0.09} className="ft-name">
                    To {l.account}
                  </Ink>
                </div>
              ))}
              <Fade a={0.6} d={0.14} className="ft-narr">
                {NARRATION}
              </Fade>
            </div>
            <div />
            <div className="ft-r">
              <div className="ft-jline">
                <Ink a={at(0) + 0.1} d={0.03} className="ft-amt">
                  {amount(dr.amount)}
                </Ink>
              </div>
            </div>
            <div className="ft-r">
              <div className="ft-jline" />
              {crs.map((l, k) => (
                <div key={l.account} className="ft-jline">
                  <Ink a={at(k + 1) + 0.09} d={0.03} className="ft-amt">
                    {amount(l.amount)}
                  </Ink>
                </div>
              ))}
            </div>
          </div>
        </div>
        <Fade a={0.8} d={0.08} className="ft-cols ft-jtotal">
          <span />
          <span>
            <span className="ft-agree">✓ Debits equal credits</span>
          </span>
          <span />
          <span className="ft-amt">{amount(INVOICE_TOTAL)}</span>
          <span className="ft-amt">{amount(INVOICE_TOTAL)}</span>
        </Fade>
      </div>
    </div>
  );
}

// --- Scene 3: the ledger -----------------------------------------------------------------------------------------

/** The ledger folio of each account, filled in the journal's L.F. column as the line is posted. */
const FOLIO: Record<string, number> = { [JOURNAL[0].account]: 18, [JOURNAL[1].account]: 31, [JOURNAL[2].account]: 42, [JOURNAL[3].account]: 43 };

/** Where things are on the ledger board (in board units: anything positioned with a font size of its own divides by it), in its units (see landing.css: the board is 32 × 28). */
const STRIP_TOP = 0.8;
const STRIP_LINE = (k: number) => STRIP_TOP + 0.45 + k * 1.3;
const CHIP_FROM_X = 26.9;
const DR_AMOUNT_X = 10.5;
const CR_AMOUNT_X = 26.4;
const T_ROW = (k: number) => 1.75 + k * 1.3;
const LEDGER = [
  { top: 8.0, height: 7.0 },
  { top: 15.6, height: 3.2 },
  { top: 19.4, height: 3.2 },
  { top: 23.2, height: 3.2 },
];

function TAccount({ name, folio, top, height, children }: { name: string; folio: number; top: number; height: number; children: ReactNode }) {
  return (
    <div className="ft-paper ft-t" style={{ top: `${top}em`, height: `${height}em` }}>
      <div className="ft-t-name">
        <small>Dr</small>
        <small>Cr</small>
        {name} <span className="ft-folio">L.F. {folio}</span>
      </div>
      {children}
    </div>
  );
}

function LedgerScene() {
  const [dr, ...crs] = JOURNAL;
  const pair = (k: number) => 0.06 + k * 0.17;
  return (
    <div className="ft-scene" style={sceneStyle(2)}>
      <div className="ft-paper ft-strip" style={{ top: `${STRIP_TOP}em`, height: '6.1em' }}>
        {JOURNAL.map((l, k) => (
          <div key={l.account} className="ft-strip-line" style={{ top: `${STRIP_LINE(k) - STRIP_TOP}em` }}>
            <span className={k === 0 ? 'ft-name' : 'ft-name ft-to'}>
              {k === 0 ? `${l.account} Dr` : `To ${l.account}`}
            </span>
            <Arrive a={k === 0 ? pair(2) : pair(k - 1)} className="ft-lf">
              {FOLIO[l.account]}
            </Arrive>
            <span className="ft-amt">{l.side === 'Dr' ? amount(l.amount) : ''}</span>
            <span className="ft-amt">{l.side === 'Cr' ? amount(l.amount) : ''}</span>
          </div>
        ))}
      </div>

      <TAccount name={dr.account} folio={FOLIO[dr.account]} top={LEDGER[0].top} height={LEDGER[0].height}>
        {crs.map((l, k) => (
          <Arrive key={l.account} a={pair(k)} className="ft-t-row dr" style={{ top: `${T_ROW(k)}em` }}>
            <span>To {l.account.replace(' A/c', '')}</span>
            <span className="ft-amt">{amount(l.amount)}</span>
          </Arrive>
        ))}
        <Fade a={0.62} d={0.08} className="ft-t-row dr ft-t-sum" style={{ top: `${T_ROW(3) - 0.05}em` }}>
          <span />
          <span className="ft-amt">{amount(dr.amount)}</span>
        </Fade>
      </TAccount>
      {crs.map((l, k) => (
        <TAccount key={l.account} name={l.account} folio={FOLIO[l.account]} top={LEDGER[k + 1].top} height={LEDGER[k + 1].height}>
          <Arrive a={pair(k)} className="ft-t-row cr" style={{ top: `${T_ROW(0)}em` }}>
            <span>By {dr.account.replace(' A/c', '')}</span>
            <span className="ft-amt">{amount(l.amount)}</span>
          </Arrive>
        </TAccount>
      ))}

      {crs.map((l, k) => (
        <span key={l.account}>
          <Chip from={[CHIP_FROM_X, STRIP_LINE(k + 1)]} to={[DR_AMOUNT_X, LEDGER[0].top + T_ROW(k)]} a={pair(k)}>
            {amount(l.amount)}
          </Chip>
          <Chip from={[CHIP_FROM_X, STRIP_LINE(k + 1)]} to={[CR_AMOUNT_X, LEDGER[k + 1].top + T_ROW(0)]} a={pair(k)}>
            {amount(l.amount)}
          </Chip>
        </span>
      ))}
    </div>
  );
}

// --- Scene 4: the trial balance ----------------------------------------------------------------------------------

function TrialScene() {
  return (
    <div className="ft-scene" style={sceneStyle(3)}>
      <div className="ft-paper ft-tb lp-carbon">
        <div className="ft-tb-head">
          <strong>Trial Balance</strong>
          of {SALE.seller} as at 30 April 2026
        </div>
        <div className="ft-tb-grid">
          <span className="ft-tb-th">Account</span>
          <span className="ft-tb-th">Dr ₹</span>
          <span className="ft-tb-th">Cr ₹</span>
          {TRIAL_BALANCE.map((r, i) => (
            <Fade key={r.account} a={0.02 + i * 0.04} d={0.08} className={`ft-tb-row${r.sale ? ' ft-tb-sale' : ''}`}>
              <span className="ft-tb-cell">{r.account}</span>
              <span className="ft-tb-cell ft-amt">{r.dr ? amount(r.dr) : ''}</span>
              <span className="ft-tb-cell ft-amt">{r.cr ? amount(r.cr) : ''}</span>
            </Fade>
          ))}
          <span className="ft-tb-sum ft-tb-sum-label">Total</span>
          <span className="ft-tb-sum ft-amt" data-count={TRIAL_DR} data-scene="3" data-a="0.42" data-d="0.28">
            {amount(TRIAL_DR)}
          </span>
          <span className="ft-tb-sum ft-amt" data-count={TRIAL_CR} data-scene="3" data-a="0.42" data-d="0.28">
            {amount(TRIAL_CR)}
          </span>
        </div>
      </div>
      <span className="lp-stamp ft-stamp" data-stamp="0.74" data-scene="3" style={{ right: '1.9em', top: '15.2em' }}>
        Balanced <span className="lp-stamp-tick">✓</span>
      </span>
    </div>
  );
}

// --- Scene 5: the final accounts ---------------------------------------------------------------------------------

const FA_ROW = (k: number) => 1.6 + k * 1.2;
const TRADING_TOP = 0.4;
const PL_TOP = 6.3;
const BS_TOP = 12.4;
const BS_ROW = (k: number) => BS_TOP + 3.25 + k * 1.3;

function FinalScene() {
  const [capital, addProfit, , cgst, sgst] = BALANCE_SHEET.liabilities;
  return (
    <div className="ft-scene ft-final" style={sceneStyle(4)}>
      <div className="ft-fold" style={{ transformOrigin: '50% 100%' }}>
        <div className="ft-paper ft-fa" style={{ top: `${TRADING_TOP}em`, height: '5.6em' }}>
          <div className="ft-t-name">
            <small>Dr</small>
            <small>Cr</small>
            Trading A/c <span className="ft-folio">for April 2026</span>
          </div>
          <Fade a={0.02} className="ft-t-row dr" style={{ top: `${FA_ROW(0)}em` }}>
            <span>To Opening stock</span>
            <span className="ft-amt">{amount(OPENING.stock)}</span>
          </Fade>
          <Fade a={0.08} className="ft-t-row dr" style={{ top: `${FA_ROW(1)}em` }}>
            <span>To Gross profit c/d</span>
            <span className="ft-amt">{amount(GROSS_PROFIT)}</span>
          </Fade>
          <Fade a={0.02} className="ft-t-row cr" style={{ top: `${FA_ROW(0)}em` }}>
            <span>By Sales</span>
            <span className="ft-amt">{amount(TAXABLE)}</span>
          </Fade>
          <Fade a={0.05} className="ft-t-row cr" style={{ top: `${FA_ROW(1)}em` }}>
            <span>By Closing stock</span>
            <span className="ft-amt">{amount(CLOSING_STOCK)}</span>
          </Fade>
          <Fade a={0.1} className="ft-t-row dr ft-t-sum" style={{ top: `${FA_ROW(2) + 0.1}em` }}>
            <span />
            <span className="ft-amt">{amount(TRADING_TOTAL)}</span>
          </Fade>
          <Fade a={0.1} className="ft-t-row cr ft-t-sum" style={{ top: `${FA_ROW(2) + 0.1}em` }}>
            <span />
            <span className="ft-amt">{amount(TRADING_TOTAL)}</span>
          </Fade>
        </div>
        <div className="ft-paper ft-fa" style={{ top: `${PL_TOP}em`, height: '5.6em' }}>
          <div className="ft-t-name">
            <small>Dr</small>
            <small>Cr</small>
            Profit and Loss A/c <span className="ft-folio">for April 2026</span>
          </div>
          <Fade a={0.2} className="ft-t-row dr" style={{ top: `${FA_ROW(0)}em` }}>
            <span>To Salary</span>
            <span className="ft-amt">{amount(SALARY)}</span>
          </Fade>
          <Fade a={0.26} className="ft-t-row dr" style={{ top: `${FA_ROW(1)}em` }}>
            <span>To Net profit</span>
            <span className="ft-amt">{amount(NET_PROFIT)}</span>
          </Fade>
          <Arrive a={0.12} d={0.16} className="ft-t-row cr" style={{ top: `${FA_ROW(0)}em` }}>
            <span>By Gross profit b/d</span>
            <span className="ft-amt">{amount(GROSS_PROFIT)}</span>
          </Arrive>
          <Fade a={0.28} className="ft-t-row dr ft-t-sum" style={{ top: `${FA_ROW(2) + 0.1}em` }}>
            <span />
            <span className="ft-amt">{amount(GROSS_PROFIT)}</span>
          </Fade>
          <Fade a={0.28} className="ft-t-row cr ft-t-sum" style={{ top: `${FA_ROW(2) + 0.1}em` }}>
            <span />
            <span className="ft-amt">{amount(GROSS_PROFIT)}</span>
          </Fade>
        </div>
      </div>

      <div className="ft-paper ft-bs lp-carbon" style={{ top: `${BS_TOP}em` }}>
        <div className="ft-t-name">Balance Sheet <span className="ft-folio">as at 30 April 2026</span></div>
        <div className="ft-bs-cols">
          <div className="ft-bs-side">
            <div className="ft-bs-row ft-bs-th">
              <span>Liabilities</span>
              <span>₹</span>
              <span>₹</span>
            </div>
            <Fade a={0.02} className="ft-bs-row">
              <span>{capital.label}</span>
              <span className="ft-amt">{amount(capital.amount)}</span>
              <span />
            </Fade>
            <div className="ft-bs-row">
              <Arrive a={0.3} d={0.16}>
                {addProfit.label}
              </Arrive>
              <Arrive a={0.3} d={0.16} className="ft-amt ft-u">
                {amount(addProfit.amount)}
              </Arrive>
              <Arrive a={0.3} d={0.16} className="ft-amt">
                {amount(CAPITAL + NET_PROFIT)}
              </Arrive>
            </div>
            {[cgst, sgst].map((r) => (
              <Fade key={r.label} a={0.04} className="ft-bs-row">
                <span>{r.label}</span>
                <span />
                <span className="ft-amt">{amount(r.amount)}</span>
              </Fade>
            ))}
            <div className="ft-bs-row ft-bs-sum">
              <span />
              <span />
              <span className="ft-amt" data-count={BS_LIABILITIES} data-scene="4" data-a="0.6" data-d="0.2">
                {amount(BS_LIABILITIES)}
              </span>
            </div>
          </div>
          <div className="ft-bs-side">
            <div className="ft-bs-row ft-bs-th">
              <span>Assets</span>
              <span />
              <span>₹</span>
            </div>
            {BALANCE_SHEET.assets.map((r) =>
              r.label === 'Closing stock' ? (
                <div key={r.label} className="ft-bs-row">
                  <Arrive a={0.36} d={0.16}>
                    {r.label}
                  </Arrive>
                  <span />
                  <Arrive a={0.36} d={0.16} className="ft-amt">
                    {amount(r.amount)}
                  </Arrive>
                </div>
              ) : (
                <Fade key={r.label} a={0.04} className="ft-bs-row">
                  <span>{r.label}</span>
                  <span />
                  <span className="ft-amt">{amount(r.amount)}</span>
                </Fade>
              ),
            )}
            <div className="ft-bs-row ft-bs-sum">
              <span />
              <span />
              <span className="ft-amt" data-count={BS_ASSETS} data-scene="4" data-a="0.6" data-d="0.2">
                {amount(BS_ASSETS)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <Chip from={[DR_AMOUNT_X, TRADING_TOP + FA_ROW(1)]} to={[CR_AMOUNT_X, PL_TOP + FA_ROW(0)]} a={0.12} d={0.16}>
        {amount(GROSS_PROFIT)}
      </Chip>
      <Chip from={[DR_AMOUNT_X, PL_TOP + FA_ROW(1)]} to={[6.65, BS_ROW(1)]} a={0.3} d={0.16}>
        {amount(NET_PROFIT)}
      </Chip>
      <Chip from={[CR_AMOUNT_X, TRADING_TOP + FA_ROW(1)]} to={[26.5, BS_ROW(1)]} a={0.36} d={0.16}>
        {amount(CLOSING_STOCK)}
      </Chip>
      <span className="lp-stamp ft-stamp ft-stamp-bs" data-stamp="0.8" data-scene="4" style={{ left: '7.4em', top: '15.2em' }}>
        Balanced <span className="lp-stamp-tick">✓</span>
      </span>
    </div>
  );
}

// --- The steps in words ------------------------------------------------------------------------------------------

const TABS = ['Bill', 'Journal', 'Ledger', 'Trial balance', 'Final accounts'];

function Step({ n, title, lab, labText, children }: { n: number; title: string; lab: string; labText: string; children: ReactNode }) {
  return (
    <li className="ft-step" data-testid={`follow-step-${n}`}>
      <article className="ft-card lp-carbon" aria-labelledby={`follow-step-${n}-title`}>
        <h3 id={`follow-step-${n}-title`}>
          <span>{String(n).padStart(2, '0')}</span>
          {title}
        </h3>
        {children}
        <Link href={labHref(lab)} prefetch={false} className="ft-lab" data-testid={`follow-lab-${n}`}>
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7.5 2.5h5M8.5 2.5v5L3.8 15a1.7 1.7 0 0 0 1.5 2.5h9.4a1.7 1.7 0 0 0 1.5-2.5L11.5 7.5v-5" />
            <path d="M5.8 12h8.4" />
          </svg>
          {labText}
        </Link>
      </article>
    </li>
  );
}

/** "Follow one transaction": one credit sale, from the bill to the balance sheet, as the page scrolls. */
export function FollowTransaction() {
  return (
    <FollowScroll>
      <div className="ft-stage-col" aria-hidden="true">
        <div className="ft-stage" data-step="0">
          <ol className="ft-tabs">
            {TABS.map((t, i) => (
              <li key={t} className="ft-tab">
                <b>{i + 1}</b>
                {t}
              </li>
            ))}
          </ol>
          <div className="ft-progress">
            <span />
          </div>
          <div className="ft-board-box">
            <div className="ft-board" data-testid="follow-board">
              <BillScene />
              <JournalScene />
              <LedgerScene />
              <TrialScene />
              <FinalScene />
            </div>
          </div>
        </div>
      </div>

      <ol className="ft-steps">
        <Step n={1} title="The bill" lab="books-of-entry" labText="Lab: which book does it go in?">
          <p>
            {SALE.seller} of {SALE.city} sells {SALE.quantity} {SALE.item} to {SALE.buyer} on credit. The list price is {inr(LIST_PRICE)}; a trade
            discount of {SALE.tradeDiscountPercent}% brings it to {inr(TAXABLE)}, and GST at {SALE.gstPercent}% is charged on that price: CGST {inr(CGST)}{' '}
            and SGST {inr(SGST)}, as both businesses are in the same state.
          </p>
          <p className="ft-aside">
            {SALE.buyer} owes {inr(INVOICE_TOTAL)}. The trade discount is never entered in the books: they start from {inr(TAXABLE)}.
          </p>
        </Step>
        <Step n={2} title="The journal" lab="equation" labText="Lab: watch the equation move">
          <p>
            The entry is written in the journal. {JOURNAL[0].account} is debited with all {inr(INVOICE_TOTAL)} it owes; Sales A/c is credited with{' '}
            {inr(TAXABLE)}, and the tax collected, which is owed to the government, is credited to Output CGST A/c and Output SGST A/c, {inr(CGST)} each.
          </p>
          <p className="ft-aside">Debits {inr(INVOICE_TOTAL)} = credits {inr(INVOICE_TOTAL)}, with a narration that says what happened.</p>
        </Step>
        <Step n={3} title="The ledger" lab="posting" labText="Lab: journal to ledger to trial balance">
          <p>
            Every line is posted to its own account. {JOURNAL[0].account} is debited with the three amounts it owes ({inr(TAXABLE)}, {inr(CGST)} and{' '}
            {inr(SGST)}), and each of the other three accounts is credited “By {SALE.buyer}”.
          </p>
          <p className="ft-aside">The L.F. column of the journal fills in with each account’s page as the posting is made.</p>
        </Step>
        <Step n={4} title="The trial balance" lab="trial-balance-scale" labText="Lab: the trial balance scale">
          <p>
            At the end of April every account is balanced and listed. With the month’s other balances (cash {inr(CASH_AT_END)} after a salary of{' '}
            {inr(SALARY)}, stock of {inr(OPENING.stock)} at the start, furniture {inr(OPENING.furniture)} and capital {inr(CAPITAL)}), both columns come
            to {inr(TRIAL_DR)}.
          </p>
          <p className="ft-aside">The totals agree, so the arithmetic of the books is right.</p>
        </Step>
        <Step n={5} title="The final accounts" lab="final-accounts" labText="Lab: from trial balance to final accounts">
          <p>
            The Trading Account sets sales of {inr(TAXABLE)} and closing stock of {inr(CLOSING_STOCK)} against the opening stock of {inr(OPENING.stock)}:
            a gross profit of {inr(GROSS_PROFIT)}. The Profit and Loss Account takes off the salary, leaving a net profit of {inr(NET_PROFIT)}, which is
            added to capital.
          </p>
          <p className="ft-aside">
            The Balance Sheet balances: {inr(BS_LIABILITIES)} = {inr(BS_ASSETS)}.
          </p>
        </Step>
      </ol>
    </FollowScroll>
  );
}
