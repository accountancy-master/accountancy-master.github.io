'use client';

import { useState } from 'react';
import { useStore } from '@/app-state/StoreProvider';
import { MistakeCard } from '@/components/mistakes/MistakesView';
import { SessionRunner } from '@/components/play/SessionRunner';
import { Button } from '@/components/ui/Button';
import { generateCase } from '@/generators/engine';
import type { SessionItem } from '@/learning/sessionBuilder';
import { newId } from '@/lib/ids';
import { SAMPLE_CASE } from '@/testing/sampleCase';

/** The seed of the sample shown: any seed gives a whole case. */
const SEED = 7;

/**
 * Test-only fixture (rendered only in E2E builds, on the Settings page): the sample case study, fourteen lines long,
 * on the real Mistakes card and, once started, in the real player with every question of the case in order. A test
 * can then check how a case is shown and played while no stage has a case of its own. The sample is not registered,
 * so its answers are stored like any others but nothing in the app can serve its questions again.
 */
export function E2eCase() {
  const { profile } = useStore();
  const [playing, setPlaying] = useState(false);
  const [boot] = useState(() => ({
    sessionId: newId(),
    items: generateCase(SAMPLE_CASE, SEED).map((question): SessionItem => ({ kind: 'question', question })),
  }));
  const second = boot.items[1];

  return (
    <>
      <section data-testid="e2e-case" className="mt-6 flex flex-col gap-4 rounded-card border-2 border-dashed border-edge-deep bg-canvas p-4">
        <h2 className="text-lg font-extrabold">Case study sample</h2>
        <div data-testid="e2e-case-mistake">
          {second.kind === 'question' ? <MistakeCard question={second.question} tries={1} miss={{ hintsUsed: 0 }} /> : null}
        </div>
        {playing ? null : (
          <Button variant="secondary" data-testid="e2e-case-play" onClick={() => setPlaying(true)} className="self-start">
            Play the sample case
          </Button>
        )}
      </section>
      {/* As wide as the player's own page (the padding of this one is taken back). Its bar and footer stick to the
          screen edges there; this page has a bar and a menu of its own at those edges, so here they stay in place. */}
      {playing && profile ? (
        <div data-testid="e2e-case-player" className="-mx-4 mt-6 [&_.sticky]:static">
          <SessionRunner
            profile={profile}
            kind="level"
            items={boot.items}
            sessionId={boot.sessionId}
            topicId="e2e"
            title="Case study sample"
            noun="level"
            exitHref="/settings"
            saveResult={async () => {}}
            renderResults={({ summary }) => (
              <p data-testid="e2e-case-done" className="text-base font-bold">
                {summary.correct} of {summary.total} right
              </p>
            )}
          />
        </div>
      ) : null}
    </>
  );
}
