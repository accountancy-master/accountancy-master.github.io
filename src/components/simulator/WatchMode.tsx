'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Pills } from '@/components/ui/Pills';
import { booksFor, openingBalances, play } from '@/simulator/engine';
import type { Scene } from '@/simulator/scenes';
import type { Balances, Played, SimTransaction } from '@/simulator/types';
import { Explanation } from './Explanation';
import { SimStage, type Speed } from './SimStage';
import { SOURCE_LABEL, useSource, type SourceId } from './useSource';

/** Books with nothing played on them yet: the stage at rest. */
export const atRest = (books: Balances): Played => ({
  transaction: { id: 'rest', text: '', lines: [] },
  before: books,
  after: books,
  steps: [],
  effect: { assets: 0, liabilities: 0, capital: 0 },
  containerChanges: {},
});

/** Plays a transaction on the books it fits (the books as they stand, or fresh ones when it does not fit them). */
export function playOn(scene: Scene, books: Balances, tx: SimTransaction): { played: Played; fresh: boolean } {
  const start = booksFor(scene, books, tx);
  return { played: play(scene, start.books, tx), fresh: start.fresh };
}

export const FRESH_NOTE = 'A fresh set of books: this transaction needed more in an account than the books held, so it starts from the opening books with enough in each.';

/**
 * Watch: pick a transaction or take the next one, and see it move through the books, step by step, then why. The
 * books carry on from one transaction to the next until they are started again.
 */
export function WatchMode({ scene, speed, onSpeed, seed }: { scene: Scene; speed: Speed; onSpeed(s: Speed): void; seed?: number }) {
  const opening = () => openingBalances(scene.opening.lines);
  const [played, setPlayed] = useState<Played>(() => atRest(opening()));
  const [fresh, setFresh] = useState(false);
  const [done, setDone] = useState(false);
  const [source, setSource] = useState<SourceId>('starter');
  const { next, loading } = useSource(scene, seed);

  const run = (tx: SimTransaction) => {
    const out = playOn(scene, played.after, tx);
    setPlayed(out.played);
    setFresh(out.fresh);
    setDone(false);
  };
  const playing = played.steps.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-card border border-edge bg-surface p-4 shadow-card">
        <Pills options={SOURCE_LABEL(scene)} value={source} onChange={setSource} label="Where transactions come from" testIdPrefix="watch-source" />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          {source === 'starter' ? (
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-bold">
              Choose a transaction
              <select
                data-testid="watch-pick"
                value=""
                onChange={(e) => {
                  const tx = scene.transactions.find((t) => t.id === e.target.value);
                  if (tx) run(tx);
                }}
                className="min-h-11 w-full min-w-0 rounded-control border-2 border-edge-deep bg-surface px-2 text-base"
              >
                <option value="">Pick one…</option>
                {scene.transactions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.kind}: {t.text}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Button data-testid="watch-next" disabled={loading} onClick={() => void next(source).then(run)}>
            {loading ? 'Getting it ready…' : playing ? 'Next transaction' : 'Play a transaction'}
          </Button>
          <Button
            variant="ghost"
            data-testid="watch-reset"
            onClick={() => {
              setPlayed(atRest(opening()));
              setFresh(false);
              setDone(false);
            }}
          >
            Start the books again
          </Button>
        </div>
      </div>

      <SimStage
        scene={scene}
        played={played}
        speed={speed}
        onSpeed={onSpeed}
        onDone={() => setDone(playing)}
        caption={
          <div className="flex flex-col gap-1">
            <p data-testid="watch-transaction" className="text-lg font-extrabold">
              {playing ? played.transaction.text : `${scene.opening.title}. Choose a transaction to see it move.`}
            </p>
            {fresh ? <p className="text-sm text-muted">{FRESH_NOTE}</p> : null}
          </div>
        }
      />

      {done && playing ? <Explanation scene={scene} played={played} /> : null}
    </div>
  );
}
