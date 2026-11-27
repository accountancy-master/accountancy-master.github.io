'use client';

import type { ReactNode } from 'react';
import {
  amendedCashBookOf,
  cashBookOf,
  factsOf,
  passBookOf,
  statementSoFar,
  type Book,
  type CashBook,
  type Scenario,
} from '@/simulator/bank-reconciliation/books';
import { BalanceLine } from './BalanceLine';
import { CashBookCard, PassBookCard, type Marks } from './Books';
import { MonthCards, type CardState } from './MonthCards';
import { StatementView, type Layout } from './StatementView';

// The whole picture of a month: the two balances on one line, the two books side by side, the month's items as
// cards, the amended cash book when it is made, and the statement as it is built.

export const lettersOf = (s: Scenario): Map<string, string> =>
  new Map([...s.items].sort((a, b) => a.day - b.day).map((i, k) => [i.id, 'ABCDEFGHIJ'[k]]));

/** The amended cash book with only the entries made so far; the balance is carried down once all are made. */
function amendedSoFar(s: Scenario, entered: readonly string[]): { book: CashBook; complete: boolean } {
  const full = amendedCashBookOf(s);
  const need = s.items.filter((i) => factsOf(i, s).enter).map((i) => i.id);
  const complete = need.every((id) => entered.includes(id));
  const keep = (r: { item?: string; particulars: string }) => (r.item ? entered.includes(r.item) : complete || !r.particulars.includes('c/d'));
  return { book: { ...full, dr: full.dr.filter(keep), cr: full.cr.filter(keep) }, complete };
}

export interface PictureProps {
  s: Scenario;
  from: Book;
  amended: boolean;
  /** Items carried into the statement, and entered in the amended cash book. */
  carried: readonly string[];
  entered: readonly string[];
  lit: ReadonlySet<string>;
  layout: Layout;
  reduced: boolean;
  states?: Record<string, CardState>;
  onCarry?: (id: string, how: 'add' | 'less') => void;
  showWhy: 'all' | 'lit' | 'done' | 'none';
  causes?: boolean;
  /** Whether the statement is drawn (it is, unless a question is not about it). */
  statement?: boolean;
  /** What stands above the statement (the controls of Play). */
  aboveStatement?: ReactNode;
}

export function Picture({ s, from, amended, carried, entered, lit, layout, reduced, states, onCarry, showWhy, causes = true, statement = true, aboveStatement }: PictureProps) {
  const cb = cashBookOf(s);
  const pb = passBookOf(s);
  const letter = lettersOf(s);
  const am = amended ? amendedSoFar(s, entered) : null;
  const amendedBalance = amended ? amendedCashBookOf(s).balance : null;
  const st = statementSoFar(s, from, amended, carried);
  const goal = from === 'cb' ? pb.balance : (amendedBalance ?? cb.balance);
  const ready = !amended || am!.complete;
  const marks: Marks = { letter, lit, done: new Set([...carried, ...entered]) };
  const cardStates: Record<string, CardState> = { ...states };
  for (const id of entered) cardStates[id] = { ...cardStates[id], status: 'Entered in the amended cash book' };
  for (const l of [...st.adds, ...st.lesses]) cardStates[l.item.id] = { ...cardStates[l.item.id], status: `In the statement: ${l.treatment === 'add' ? 'Add' : 'Less'}` };
  return (
    <div data-testid="lab-bank-reconciliation-picture" className="flex flex-col gap-3">
      <BalanceLine cb={cb.balance} pb={pb.balance} amended={amendedBalance} running={statement && ready ? st.end : null} goal={goal} reduced={reduced} />
      <div className="grid items-start gap-3 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <CashBookCard s={s} book={cb} marks={marks} />
          <PassBookCard s={s} book={pb} marks={marks} />
          {am ? (
            <CashBookCard
              s={s}
              book={am.book}
              marks={marks}
              title="Amended Cash Book (bank column)"
              testId="lab-bank-reconciliation-amended-book"
              note="The entries the firm passes once it reads the pass book: what the bank recorded first, and its own errors."
            />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <MonthCards s={s} items={s.items} marks={marks} states={cardStates} onCarry={onCarry} showWhy={showWhy} causes={causes} reduced={reduced} />
          {aboveStatement}
          {statement && ready ? <StatementView s={s} st={st} layout={layout} letter={letter} lit={lit} /> : null}
          {statement && !ready ? <p className="rounded-control border border-dashed border-edge-deep px-3 py-4 text-center text-sm text-muted">The statement is drawn up once the cash book is amended.</p> : null}
        </div>
      </div>
    </div>
  );
}
