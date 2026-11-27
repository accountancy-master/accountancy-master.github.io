'use client';

import { useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { useReducedMotion } from '@/components/simulator/useReducedMotion';
import { formatINR } from '@/engine/money';
import { parseRupees } from '@/lib/money-input';
import { ledgerOf, postingsOfLine, postingSteps, viewAt } from '@/simulator/posting/ledger';
import { EVENTS, findEvent, MAX_ENTRIES, nextDay, partiesOf, READY, storyFromSeed, storyProblem, type PostingStory } from '@/simulator/posting/story';
import { flyChip } from '../kit/flights';
import { P, type Picture } from './parts';
import { BoardFormat, PostingStage } from './Stage';

/** Play: build the month's journal, and the ledger and the trial balance follow at once. */
export function PostingPlay({ seed }: { seed?: number }) {
  const [story, setStory] = useState<PostingStory>(READY[0]);
  const [nextSeed, setNextSeed] = useState(seed ?? 1);
  const [kind, setKind] = useState('cash-sale');
  const [amountText, setAmountText] = useState('5,000');
  const [problem, setProblem] = useState<string | null>(null);
  const [balance, setBalance] = useState(true);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const ledger = useMemo(() => ledgerOf(story), [story]);
  const steps = useMemo(() => postingSteps(story), [story]);
  const parties = partiesOf(story);
  const full = viewAt(steps, steps.length);
  const last = story.txns.length - 1;
  const upcoming = nextDay(story.txns);
  const pic: Picture = {
    rows: new Set([...full.rows].filter((k) => !pending.has(k))),
    pending,
    posted: new Set([...full.posted].filter((k) => !pending.has(`p${k}.0`))),
    current: null,
    balanced: balance ? new Map(ledger.map((a) => [a.accountId, 'full' as const])) : new Map(),
    listed: balance ? full.listed : new Set(),
    listing: null,
    totals: balance,
    focus: null,
  };

  const start = (s: PostingStory) => {
    setStory(s);
    setProblem(null);
  };

  const add = async () => {
    const amount = parseRupees(amountText);
    const ev = findEvent(kind)!;
    if (amount === null || amount % 100 !== 0) {
      setProblem('Type the amount in whole rupees, such as 5,000.');
      return;
    }
    // The journal is kept in the order of dates: the new entry comes after the last one.
    const day = nextDay(story.txns);
    if (day === null) {
      setProblem(`This month's journal is full (${MAX_ENTRIES} entries at most, the last dated by 29 April). Remove one, or start again.`);
      return;
    }
    const next: PostingStory = { ...story, id: `${story.id}+`, txns: [...story.txns, { day, ...ev.make(amount, parties) }] };
    const wrong = storyProblem(next.txns);
    if (wrong) {
      setProblem(wrong);
      return;
    }
    setProblem(null);
    const t = next.txns.length - 1;
    const keys = next.txns[t].lines.flatMap((_, li) => postingsOfLine(next, t, li).map((r) => r.key));
    if (reduced) {
      setStory(next);
      return;
    }
    // The new entry is drawn with its postings in place but unseen, and each line flies to its account.
    flushSync(() => {
      setStory(next);
      setPending(new Set(keys));
    });
    const box = root.current;
    for (let li = 0; li < next.txns[t].lines.length; li++) {
      for (const r of postingsOfLine(next, t, li)) {
        await flyChip(box, box?.querySelector(`[data-line="${t}.${li}"]`) ?? null, box?.querySelector(`[data-row="${r.key}"]`) ?? null, `${r.particulars}  ${formatINR(r.amount)}`, 700);
      }
    }
    setPending(new Set());
  };

  const removeLast = () => {
    setStory({ ...story, id: `${story.id}-`, txns: story.txns.slice(0, -1) });
    setProblem(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
        <p className="text-sm font-extrabold">Start from</p>
        <div className="flex flex-wrap gap-2">
          {READY.map((r) => (
            <Button key={r.id} variant="secondary" data-testid={`${P}-play-ready-${r.id}`} onClick={() => start(r)}>
              {r.title}
            </Button>
          ))}
          <Button
            variant="secondary"
            data-testid={`${P}-play-new`}
            onClick={() => {
              start(storyFromSeed(nextSeed));
              setNextSeed(nextSeed + 1);
            }}
          >
            New figures
          </Button>
          <Button variant="ghost" data-testid={`${P}-play-empty`} onClick={() => start({ ...story, id: 'empty', title: 'An empty journal', txns: [] })}>
            An empty journal
          </Button>
        </div>
        <p className="text-sm text-muted">{story.about}</p>
      </div>

      <form
        className="flex flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <p className="text-sm font-extrabold">
          Add a transaction, dated {upcoming !== null ? `${upcoming} April` : '(the month is full)'}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-bold">
            What happened
            <select value={kind} onChange={(e) => setKind(e.target.value)} data-testid={`${P}-play-kind`} className="min-h-11 w-full rounded-control border-2 border-edge-deep bg-surface px-2 text-base">
              {EVENTS.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.label(parties)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-bold sm:w-40">
            Amount (₹)
            <input
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              inputMode="numeric"
              data-testid={`${P}-play-amount`}
              className="min-h-11 rounded-control border-2 border-edge-deep bg-surface px-2 text-base tabular-nums"
            />
          </label>
          <Button type="submit" data-testid={`${P}-play-add`}>
            Add to the journal
          </Button>
        </div>
        {problem ? (
          <p role="alert" data-testid={`${P}-play-problem`} className="rounded-control bg-danger-soft px-3 py-2 text-sm font-bold text-danger-deep">
            {problem}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" data-testid={`${P}-play-remove`} onClick={removeLast} disabled={story.txns.length === 0}>
            Remove the last entry
          </Button>
          <label className="flex min-h-11 items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={balance} onChange={(e) => setBalance(e.target.checked)} data-testid={`${P}-play-balance`} className="h-5 w-5 accent-[var(--color-primary)]" />
            Balance the accounts and prepare the trial balance
          </label>
        </div>
        {last >= 0 ? (
          <p data-testid={`${P}-play-last`} className="text-sm text-muted">
            Last entry: {story.txns[last].text}
          </p>
        ) : null}
      </form>

      <div className="rounded-panel border border-edge bg-canvas p-2 sm:p-4">
        {story.txns.length === 0 ? <p className="p-3 text-base text-muted">The journal is empty. Add a transaction above: start with the capital the owner brings in.</p> : null}
        <PostingStage ref={root} story={story} ledger={ledger} pic={pic} showTrialBalance={balance && ledger.length > 0} />
      </div>
      {ledger.length > 0 ? <BoardFormat key={story.id} ledger={ledger} /> : null}
    </div>
  );
}
