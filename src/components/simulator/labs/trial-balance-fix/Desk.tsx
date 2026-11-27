'use client';

import { Journal } from '../kit/TAccount';
import { Card } from '../kit/LabShell';
import { title, type Case, type CaseError } from '@/simulator/trial-balance-fix/model';
import { beforeWords, classWords, explainError, type DeskState } from '@/simulator/trial-balance-fix/walk';
import { BookTable, BooksJournal, RectifyJournal, Transactions, type Highlight } from './Books';
import { CorrectedTbBoard, LedgerBoard, ProfitBoard, SuspenseBoard, TrialBalanceBoard } from './Boards';
import { P } from './LedgerAccount';

// ---------------------------------------------------------------------------------------------------------------
// The whole desk at a stage of a case: the books on the left and the ledger on the right (one under the other on a
// phone), then the trial balance beside Suspense A/c, the rectifying entries, and the corrected trial balance beside
// the corrected profit. Each board appears when the walk reaches it.
// ---------------------------------------------------------------------------------------------------------------

export function Desk({ c, st, reduced, highlight = null, compact = false }: { c: Case; st: DeskState; reduced: boolean; highlight?: Highlight; compact?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className={`grid min-w-0 gap-3 ${compact ? '' : 'xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]'}`}>
        {compact ? null : (
          <div className="flex min-w-0 flex-col gap-3">
            <Transactions c={c} />
            <BooksJournal c={c} st={st} highlight={highlight} />
            <BookTable c={c} st={st} highlight={highlight} />
          </div>
        )}
        <LedgerBoard c={c} st={st} reduced={reduced} />
      </div>
      {st.tb !== 'none' ? (
        <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <TrialBalanceBoard c={c} st={st} reduced={reduced} />
          <SuspenseBoard c={c} st={st} reduced={reduced} />
        </div>
      ) : null}
      {compact ? null : <RectifyJournal c={c} st={st} />}
      {st.corrected || st.profit ? (
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          <CorrectedTbBoard c={c} st={st} reduced={reduced} />
          <ProfitBoard c={c} st={st} />
        </div>
      ) : null}
    </div>
  );
}

/** An error, found: what it is, its class, and (unless it is the question) how it is put right, before and after. */
export function ErrorCard({ c, e, solved = true }: { c: Case; e: CaseError; /** Show how it is put right. */ solved?: boolean }) {
  return (
    <Card title={`Error ${e.tag}: ${e.name}`} testId={`${P}-error`} aside={<span className="text-xs font-bold text-muted">{e.when === 'before' ? 'found before the trial balance' : e.when === 'tb' ? 'found when the trial balance is checked' : 'found after the trial balance'}</span>}>
      <p className="text-base">{e.text}</p>
      <p className="text-sm font-bold text-muted">{classWords(e)}</p>
      {solved ? (
        <>
          <p className="text-sm">{e.when === 'before' ? `Found before the trial balance: ${beforeWords(e).replace(/^There would be/, 'there is').replace('it would be corrected', 'it is corrected')}` : explainError(c, e)}</p>
          {e.entry && e.when === 'after' ? (
            <Journal testId={`${P}-error-entry`} caption="The rectifying entry" being entries={[{ date: e.tag, lines: e.entry.map((l) => ({ account: title(l.accountId), side: l.side, amount: l.amount })), narration: e.narration }]} />
          ) : null}
          {e.when === 'after' ? (
            <p data-testid={`${P}-error-before`} className="rounded-control border border-dashed border-edge-deep bg-sunken px-3 py-2 text-sm">
              <span className="font-extrabold">Had it been found before the trial balance: </span>
              {beforeWords(e)}
            </p>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

