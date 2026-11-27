'use client';

import { useMemo, useState } from 'react';
import type { Side } from '@/engine/accounts';
import { formatINR } from '@/engine/money';
import { parseRupees } from '@/lib/money-input';
import { ledgerOf, postingsOfLine, type TAccount } from '@/simulator/posting/ledger';
import { accountTitle, CLOSE_DATE } from '@/simulator/posting/story';
import {
  checkBalance,
  checkColumn,
  checkSide,
  makeQuestion,
  TRY_KINDS,
  type BalanceQuestion,
  type ColumnQuestion,
  type Feedback,
  type PostingQuestion,
  type SideQuestion,
} from '@/simulator/posting/tryit';
import { AnswerField, ChoiceButton, ChoiceGroup, TryCard, useScore, type Score, type ShownVerdict } from '../kit/TryIt';
import { JournalBook, P, TAccountCard, type Picture } from './parts';

const TITLES: Record<PostingQuestion['kind'], string> = {
  side: 'Which side, which account?',
  balance: 'Balance the account',
  column: 'Which column of the trial balance?',
};

const NONE: Picture = { rows: new Set(), pending: new Set(), posted: new Set(), current: null, balanced: new Map(), listed: new Set(), listing: null, totals: false, focus: null };
const allRows = (a: TAccount) => new Set([...a.debit, ...a.credit].map((r) => r.key));
const shown = (fb: Feedback | null): ShownVerdict | null => (fb ? { right: fb.right, reason: fb.message } : null);

interface Asked {
  n: number;
  score: Score;
  onMarked(right: boolean): void;
  onNext(): void;
}

/** Try it: three kinds of question in turn, each answered on the picture, with the reason. Nothing is recorded. */
export function PostingTry({ seed }: { seed?: number }) {
  const [n, setN] = useState(0);
  const [score, count] = useScore();
  const base = seed ?? 1;
  const kind = TRY_KINDS[n % TRY_KINDS.length];
  const q = useMemo(() => makeQuestion(base + Math.floor(n / TRY_KINDS.length) * 7 + n, kind), [base, n, kind]);
  const asked: Asked = { n, score, onMarked: count, onNext: () => setN(n + 1) };
  return q.kind === 'side' ? <SideTry key={n} q={q} {...asked} /> : q.kind === 'balance' ? <BalanceTry key={n} q={q} {...asked} /> : <ColumnTry key={n} q={q} {...asked} />;
}

function SideTry({ q, n, score, onMarked, onNext }: { q: SideQuestion } & Asked) {
  const [pick, setPick] = useState<{ accountId: string; side: Side } | null>(null);
  const [part, setPart] = useState<string | null>(null);
  const [fb, setFb] = useState<Feedback | null>(null);
  const t = q.story.txns[q.txn];
  const l = t.lines[q.line];
  // The entry alone, posted into empty accounts.
  const single = useMemo(() => ({ ...q.story, txns: [t] }), [q.story, t]);
  const ledger = useMemo(() => ledgerOf(single), [single]);
  const row = postingsOfLine(single, 0, q.line)[0];
  const check = () => {
    if (!pick || !part || fb) return;
    const f = checkSide(q, pick.accountId, pick.side, part);
    setFb(f);
    onMarked(f.right);
  };
  return (
    <TryCard
      prefix={P}
      kind={q.kind}
      title={TITLES[q.kind]}
      progress={`Question ${n + 1}`}
      score={score}
      prompt={
        <>
          {q.story.business}, {t.day} April: {t.text} Post the line{' '}
          <strong>
            {l.side === 'Dr' ? `${accountTitle(l.accountId)} Dr.` : `To ${accountTitle(l.accountId)}`} {formatINR(l.amount)}
          </strong>
          : tap the side it lands on, then choose what is written in the particulars.
        </>
      }
      verdict={shown(fb)}
      onCheck={check}
      canCheck={pick !== null && part !== null}
      onNext={onNext}
      skippable
    >
      <div className="rounded-card border border-edge bg-canvas p-3">
        <JournalBook story={q.story} only={q.txn} pic={{ posted: new Set(), current: `${q.txn}.${q.line}` }} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {q.accounts.map((id, ai) => {
          const a = ledger.find((x) => x.accountId === id)!;
          const rows = fb ? new Set([row.key]) : new Set<string>();
          const marks: Partial<Record<Side, 'right' | 'wrong'>> = {};
          if (fb && id === q.answer.accountId) marks[q.answer.side] = 'right';
          if (fb && !fb.right && pick?.accountId === id && !(id === q.answer.accountId && pick.side === q.answer.side)) marks[pick.side] = 'wrong';
          return (
            <TAccountCard
              key={id}
              account={a}
              pic={{ ...NONE, rows: id === q.answer.accountId ? rows : new Set() }}
              pickSide={{
                chosen: pick?.accountId === id ? pick.side : null,
                onPick: (s) => !fb && setPick({ accountId: id, side: s }),
                marks,
                testId: (s) => `${P}-try-side-${ai}-${s}`,
              }}
            />
          );
        })}
      </div>
      <ChoiceGroup label="Particulars">
        {q.particulars.map((p, i) => (
          <ChoiceButton key={p} testId={`${P}-try-part-${i}`} chosen={part === p} mark={fb ? (p === q.answer.particulars ? 'right' : part === p ? 'wrong' : null) : null} disabled={fb !== null} onClick={() => setPart(p)}>
            {p}
          </ChoiceButton>
        ))}
      </ChoiceGroup>
    </TryCard>
  );
}

function BalanceTry({ q, n, score, onMarked, onNext }: { q: BalanceQuestion } & Asked) {
  const [written, setWritten] = useState<Side | 'none' | null>(null);
  const [amount, setAmount] = useState('');
  const [fb, setFb] = useState<Feedback | null>(null);
  const a = q.account;
  const pic: Picture = { ...NONE, rows: allRows(a), balanced: fb ? new Map([[a.accountId, 'full']]) : new Map(), focus: a.accountId };
  const options: { id: Side | 'none'; text: string }[] = [
    { id: 'Dr', text: 'On the debit side: "To Balance c/d"' },
    { id: 'Cr', text: 'On the credit side: "By Balance c/d"' },
    { id: 'none', text: 'No balance: the two sides are equal' },
  ];
  const right = a.balance ? (a.balance.side === 'Dr' ? 'Cr' : 'Dr') : 'none';
  const ready = written !== null && (written === 'none' || amount.trim() !== '');
  const check = () => {
    if (!ready || fb || written === null) return;
    const f = checkBalance(q, written, written === 'none' ? null : parseRupees(amount));
    setFb(f);
    onMarked(f.right);
  };
  return (
    <TryCard
      prefix={P}
      kind={q.kind}
      title={TITLES[q.kind]}
      progress={`Question ${n + 1}`}
      score={score}
      prompt={`${a.title} of ${q.story.business} is balanced on ${CLOSE_DATE}. What is the balance carried down, and on which side is it written?`}
      verdict={shown(fb)}
      onCheck={check}
      canCheck={ready}
      onNext={onNext}
      skippable
    >
      <div className="max-w-md">
        <TAccountCard account={a} pic={pic} />
      </div>
      <ChoiceGroup label="Where the balance is written" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {options.map((o) => (
          <ChoiceButton key={o.id} testId={`${P}-try-written-${o.id}`} chosen={written === o.id} mark={fb ? (o.id === right ? 'right' : written === o.id ? 'wrong' : null) : null} disabled={fb !== null} onClick={() => setWritten(o.id)}>
            {o.text}
          </ChoiceButton>
        ))}
      </ChoiceGroup>
      <AnswerField unit="rupee" label="Balance c/d" value={amount} onChange={setAmount} disabled={fb !== null || written === 'none'} testId={`${P}-try-amount`} onEnter={check} />
    </TryCard>
  );
}

function ColumnTry({ q, n, score, onMarked, onNext }: { q: ColumnQuestion } & Asked) {
  const [col, setCol] = useState<Side | 'none' | null>(null);
  const [fb, setFb] = useState<Feedback | null>(null);
  const a = q.account;
  const pic: Picture = { ...NONE, rows: allRows(a), balanced: new Map([[a.accountId, 'full']]), focus: a.accountId };
  const right = a.balance ? a.balance.side : 'none';
  const choose = (c: Side | 'none') => {
    if (fb) return;
    const f = checkColumn(q, c);
    setCol(c);
    setFb(f);
    onMarked(f.right);
  };
  const mark = (c: Side | 'none') => (fb ? (c === right ? 'right' : col === c ? 'wrong' : null) : null);
  return (
    <TryCard
      prefix={P}
      kind={q.kind}
      title={TITLES[q.kind]}
      progress={`Question ${n + 1}`}
      score={score}
      prompt={`${a.title} of ${q.story.business} has been balanced. Where does it go in the trial balance on ${CLOSE_DATE}? Tap the column.`}
      verdict={shown(fb)}
      onNext={onNext}
      skippable
    >
      <div className="max-w-md">
        <TAccountCard account={a} pic={pic} />
      </div>
      <div className="max-w-md rounded-card border border-edge bg-canvas p-3">
        <p className="text-center text-sm font-extrabold">Trial Balance of {q.story.business}</p>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_auto] items-stretch gap-2 text-sm">
          <span className="self-center font-bold">{a.title}</span>
          <ChoiceButton testId={`${P}-try-col-Dr`} chosen={col === 'Dr'} mark={mark('Dr')} disabled={fb !== null} onClick={() => choose('Dr')} className="text-center text-sm">
            Debit (₹)
          </ChoiceButton>
          <ChoiceButton testId={`${P}-try-col-Cr`} chosen={col === 'Cr'} mark={mark('Cr')} disabled={fb !== null} onClick={() => choose('Cr')} className="text-center text-sm">
            Credit (₹)
          </ChoiceButton>
        </div>
        <ChoiceButton testId={`${P}-try-col-none`} chosen={col === 'none'} mark={mark('none')} disabled={fb !== null} onClick={() => choose('none')} className="mt-2 w-full text-center text-sm">
          Left out of the trial balance
        </ChoiceButton>
      </div>
    </TryCard>
  );
}
