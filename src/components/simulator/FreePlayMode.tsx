'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { formatINR } from '@/engine/money';
import { parseRupees } from '@/lib/money-input';
import { bandValues, fitsBooks, openingBalances, play } from '@/simulator/engine';
import type { Scene, Story } from '@/simulator/scenes';
import type { Balances, Played, SimTransaction } from '@/simulator/types';
import { Explanation, JournalTable } from './Explanation';
import { SimStage, type Speed } from './SimStage';
import { atRest } from './WatchMode';

/** What stops a transaction from being played on these books, in words: the bands it would take below nothing. */
function shortOf(scene: Scene, books: Balances, tx: SimTransaction): string | null {
  const played = play(scene, books, tx);
  if (fitsBooks(scene, played)) return null;
  const now = bandValues(scene, books);
  const lows = new Map<string, number>();
  for (const s of played.steps) {
    const v = bandValues(scene, s.balances);
    for (const b of scene.bands) if (!b.mayBeNegative && v[b.id] < 0) lows.set(b.id, Math.min(lows.get(b.id) ?? 0, v[b.id]));
  }
  const parts = [...lows.keys()].map((id) => `${scene.bands.find((b) => b.id === id)?.label} holds only ${formatINR(now[id] ?? 0)}`);
  return `This cannot happen to these books: ${parts.join('; ')}. Choose a smaller amount, or first record a transaction that adds to it.`;
}

/**
 * Free play: build a transaction from plain-language events, see its entry, and play it on the books; start a new
 * business or use the running shop; or play a ready story, one transaction after another.
 */
export function FreePlayMode({ scene, speed, onSpeed }: { scene: Scene; speed: Speed; onSpeed(s: Speed): void }) {
  const [played, setPlayed] = useState<Played>(() => atRest(openingBalances(scene.opening.lines)));
  const [booksName, setBooksName] = useState(scene.opening.title);
  const [done, setDone] = useState(false);
  const [eventId, setEventId] = useState(scene.events[0].id);
  const event = scene.events.find((e) => e.id === eventId)!;
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [story, setStory] = useState<{ story: Story; at: number; auto: boolean } | null>(null);

  const chosen = useMemo(() => Object.fromEntries(event.choices.map((c) => [c.id, choice[c.id] ?? c.options[0].id])), [event, choice]);
  const typed = useMemo(() => Object.fromEntries(event.amounts.map((a) => [a.id, parseRupees(amounts[a.id] ?? String(a.defaultRupees)) ?? 0])), [event, amounts]);
  const made = useMemo(() => event.make(chosen, typed), [event, chosen, typed]);
  const tx = 'problem' in made ? null : made;
  const books = played.after;
  const problem = 'problem' in made ? made.problem : tx ? shortOf(scene, books, tx) : null;

  const start = (b: Balances, name: string) => {
    setStory(null);
    setPlayed(atRest(b));
    setBooksName(name);
    setDone(false);
  };
  const run = (t: SimTransaction, on: Balances = books) => {
    setPlayed(play(scene, on, t));
    setDone(false);
  };

  // A story goes on by itself: a short pause after each transaction, then the next.
  useEffect(() => {
    if (!story || !done || !story.auto || story.at >= story.story.transactions.length - 1) return;
    const timer = window.setTimeout(() => {
      const at = story.at + 1;
      setStory({ ...story, at });
      run(story.story.transactions[at], played.after);
    }, 1600 / speed);
    return () => window.clearTimeout(timer);
    // `run` and `played` are read as they are when the pause ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story, done, speed]);

  const playing = played.steps.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="free-build" className="flex flex-col gap-3 rounded-card border border-edge bg-surface p-4 shadow-card">
          <h3 id="free-build" className="text-lg font-extrabold">
            Make something happen
          </h3>
          <label className="flex min-w-0 flex-col gap-1 text-sm font-bold">
            What happens
            <select
              data-testid="free-event"
              value={eventId}
              onChange={(e) => {
                setEventId(e.target.value);
                setChoice({});
                setAmounts({});
              }}
              className="min-h-11 w-full min-w-0 rounded-control border-2 border-edge-deep bg-surface px-2 text-base"
            >
              {scene.events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </label>
          {event.choices.map((c) => (
            <label key={c.id} className="flex flex-col gap-1 text-sm font-bold">
              {c.label}
              <select
                data-testid={`free-choice-${c.id}`}
                value={chosen[c.id]}
                onChange={(e) => setChoice({ ...choice, [c.id]: e.target.value })}
                className="min-h-11 w-full min-w-0 rounded-control border-2 border-edge-deep bg-surface px-2 text-base"
              >
                {c.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <div className="grid grid-cols-2 gap-2">
            {event.amounts.map((a) => (
              <label key={a.id} className="flex flex-col gap-1 text-sm font-bold">
                {a.label} (₹)
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  data-testid={`free-amount-${a.id}`}
                  value={amounts[a.id] ?? String(a.defaultRupees)}
                  onChange={(e) => setAmounts({ ...amounts, [a.id]: e.target.value })}
                  className="min-h-11 w-full min-w-0 rounded-control border-2 border-edge-deep bg-surface px-3 text-base tabular-nums"
                />
              </label>
            ))}
          </div>
          {tx ? (
            <div className="flex flex-col gap-1">
              <p data-testid="free-text" className="text-base font-bold">
                {tx.text}
              </p>
              <JournalTable lines={tx.lines} narration={tx.narration} testId="free-entry" caption="The entry it makes" />
            </div>
          ) : null}
          {problem ? (
            <p role="alert" data-testid="free-problem" className="rounded-control bg-danger-soft px-3 py-2 text-sm font-bold text-danger-deep">
              {problem}
            </p>
          ) : null}
          <Button data-testid="free-play" disabled={!tx || problem !== null} onClick={() => tx && run(tx)} className="self-start">
            Play it
          </Button>
        </section>

        <section aria-labelledby="free-books" className="flex flex-col gap-3 rounded-card border border-edge bg-surface p-4 shadow-card">
          <h3 id="free-books" className="text-lg font-extrabold">
            The books
          </h3>
          <p className="text-sm text-muted">
            Now: <span data-testid="free-books-name" className="font-bold text-ink">{booksName}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" data-testid="free-new" onClick={() => start({}, 'A new business, with nothing in it yet')}>
              Start a new business
            </Button>
            <Button variant="secondary" data-testid="free-shop" onClick={() => start(openingBalances(scene.opening.lines), scene.opening.title)}>
              Use the running shop
            </Button>
          </div>
          <h4 className="pt-2 text-sm font-extrabold uppercase tracking-wide text-primary-ink">Stories</h4>
          <ul className="flex flex-col gap-2">
            {scene.stories.map((s) => (
              <li key={s.id} className="flex flex-col gap-1 rounded-control border border-edge p-3">
                <span className="font-extrabold">{s.title}</span>
                <span className="text-sm text-muted">{s.blurb}</span>
                <Button
                  variant="secondary"
                  data-testid={`free-story-${s.id}`}
                  className="self-start"
                  onClick={() => {
                    const opening = openingBalances(s.opening);
                    setBooksName(s.title);
                    setStory({ story: s, at: 0, auto: true });
                    run(s.transactions[0], opening);
                  }}
                >
                  Play this story
                </Button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {story ? (
        <div data-testid="free-story-bar" className="flex flex-wrap items-center gap-2 rounded-card bg-primary-soft p-3 text-primary-ink">
          <span className="font-extrabold">
            {story.story.title}: transaction {story.at + 1} of {story.story.transactions.length}
          </span>
          <Button variant="ghost" data-testid="free-story-auto" onClick={() => setStory({ ...story, auto: !story.auto })}>
            {story.auto ? 'Stop after this one' : 'Go on by itself'}
          </Button>
          {!story.auto && done && story.at < story.story.transactions.length - 1 ? (
            <Button
              data-testid="free-story-next"
              onClick={() => {
                const at = story.at + 1;
                setStory({ ...story, at });
                run(story.story.transactions[at], played.after);
              }}
            >
              Next in the story
            </Button>
          ) : null}
          {done && story.at === story.story.transactions.length - 1 ? <span className="font-bold">The story is over: these are its books.</span> : null}
        </div>
      ) : null}

      <SimStage
        scene={scene}
        played={played}
        speed={speed}
        onSpeed={onSpeed}
        onDone={() => setDone(true)}
        caption={playing ? <p data-testid="free-playing" className="text-lg font-extrabold">{played.transaction.text}</p> : undefined}
      />

      {done && playing ? <Explanation scene={scene} played={played} /> : null}
    </div>
  );
}
