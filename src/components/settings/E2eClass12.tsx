'use client';

import { useState } from 'react';
import { useStore } from '@/app-state/StoreProvider';
import { SessionRunner } from '@/components/play/SessionRunner';
import { Button } from '@/components/ui/Button';
import type { AccountQuestion, Question, StatementQuestion } from '@/content/types';
import { generateFrom } from '@/generators/engine';
import { registerTemplates } from '@/generators/loaded';
import type { SessionItem } from '@/learning/sessionBuilder';
import { newId } from '@/lib/ids';
import type { Draft } from '@/play/drafts';
import { class12Templates } from '@/testing/class12Topic';
import { sampleSwitchedOn, switchSample } from '@/testing/e2eCourse';
import { rightFormatDraft } from '@/testing/sampleFormats';
import { Sample, slippedAccount } from './E2eFormats';

/**
 * The templates of the sample, under ids of their own: they are shown here whether or not the sample topic is switched
 * on. They are registered, so that the player can make a similar question after a miss, as it does for any generated
 * question; they belong to no topic, so nothing else in the app can serve them.
 */
const TEMPLATES = class12Templates('e2e', 'e2e12');
registerTemplates(TEMPLATES);
const SEEDS = 60;

const make = <T extends Question['type']>(id: string, type: T, fits: (q: Extract<Question, { type: T }>) => boolean = () => true): Extract<Question, { type: T }> => {
  const template = TEMPLATES.find((t) => t.id === `e2e12-${id}`)!;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const q = generateFrom(template, seed);
    if (q.type === type && fits(q as Extract<Question, { type: T }>)) return q as Extract<Question, { type: T }>;
  }
  throw new Error(`no ${id} to show`);
};

/** A statement in parts with two slips: the sign of its first negative figure left out, and its last sub-total left empty. */
function slippedParts(q: StatementQuestion): Draft {
  const draft = rightFormatDraft(q);
  if (draft.type !== 'statement') return draft;
  let flipped = false;
  const flip = (rows: typeof draft.rows) =>
    rows.map((r) => ({
      ...r,
      amounts: r.amounts.map((a) => {
        if (flipped || !a.startsWith('-')) return a;
        flipped = true;
        return a.slice(1);
      }),
    }));
  const rows = flip(draft.rows);
  const more = (draft.more ?? []).map(flip);
  const subtotals = (draft.subtotals ?? []).map((s, i, all) => (i === all.length - 1 ? s.map(() => '') : s));
  return { ...draft, rows, ...(draft.more ? { more } : {}), ...(draft.subtotals ? { subtotals } : {}) };
}

/**
 * Test-only fixture (rendered only in E2E builds, on the Settings page) for what Class 12 adds. A switch puts the
 * sample topic of Class 12 into the app (it takes effect when the page is loaded again), so that a test can choose
 * and change course while the real Class 12 topics hold whatever they hold. Below it, the new formats as they are
 * filled in, marked and shown among the mistakes (partners' capital accounts in four columns, a comparative
 * statement, the same statement with the figures of its two years printed, a cash flow statement, a balance sheet
 * with notes), and two short runs in the real player: a ratio answer, a "times" answer, the capital accounts and the
 * comparative statement; and two comparative statements that print the figures of their two years.
 */
export function E2eClass12() {
  const { profile } = useStore();
  const [on] = useState(() => sampleSwitchedOn());
  const [playing, setPlaying] = useState(false);
  const [playingGiven, setPlayingGiven] = useState(false);
  const [sample] = useState(() => {
    const capitals: AccountQuestion = make('capital-accounts', 'account', (q) => q.columns.length === 4);
    const comparative = make('comparative', 'statement');
    // Two comparative statements that print the figures of their two years: one to answer right, one to slip in.
    const given = make('comparative-given', 'statement');
    const givenAgain = make('comparative-given', 'statement', (q) => q.id !== given.id);
    return {
      capitals,
      comparative,
      given,
      givenAgain,
      cashFlow: make('cash-flow', 'statement'),
      balanceSheet: make('balance-sheet', 'statement'),
      ratio: make('new-ratio', 'numeric'),
      times: make('current-ratio', 'numeric'),
    };
  });
  const items = (questions: Question[]) => questions.map((question): SessionItem => ({ kind: 'question', question }));
  const [boot] = useState(() => ({ sessionId: newId(), items: items([sample.ratio, sample.times, sample.capitals, sample.comparative]) }));
  const [bootGiven] = useState(() => ({ sessionId: newId(), items: items([sample.given, sample.givenAgain]) }));

  return (
    <>
      <section data-testid="e2e-class12" className="mt-6 flex flex-col gap-6 rounded-card border-2 border-dashed border-edge-deep bg-canvas p-4">
        <h2 className="text-lg font-extrabold">Class 12 sample</h2>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-base font-bold">
            Sample Class 12 topic: <span data-testid="e2e-class12-state">{on ? 'On' : 'Off'}</span>
          </p>
          <Button
            variant="secondary"
            data-testid="e2e-class12-toggle"
            onClick={() => {
              switchSample(!on);
              window.location.reload();
            }}
          >
            {on ? 'Switch it off' : 'Switch it on'}
          </Button>
        </div>
        <Sample name="capitals" question={sample.capitals} draft={slippedAccount(sample.capitals)} />
        <Sample name="comparative" question={sample.comparative} draft={slippedParts(sample.comparative)} />
        <Sample name="comparative-given" question={sample.given} draft={slippedParts(sample.given)} />
        <Sample name="cash-flow" question={sample.cashFlow} draft={slippedParts(sample.cashFlow)} />
        <Sample name="balance-sheet" question={sample.balanceSheet} draft={rightFormatDraft(sample.balanceSheet)} />
        {playing ? null : (
          <Button variant="secondary" data-testid="e2e-class12-play" onClick={() => setPlaying(true)} className="self-start">
            Play the Class 12 samples
          </Button>
        )}
        {playingGiven ? null : (
          <Button variant="secondary" data-testid="e2e-class12-given-play" onClick={() => setPlayingGiven(true)} className="self-start">
            Play the statements with printed figures
          </Button>
        )}
      </section>
      {/* As wide as the player's own page: see E2eCase. */}
      {playing && profile ? (
        <div data-testid="e2e-class12-player" className="-mx-4 mt-6 [&_.sticky]:static">
          <SessionRunner
            profile={profile}
            kind="level"
            items={boot.items}
            sessionId={boot.sessionId}
            topicId="e2e"
            title="Class 12 sample"
            noun="level"
            exitHref="/settings"
            saveResult={async () => {}}
            renderResults={({ summary }) => (
              <p data-testid="e2e-class12-done" className="text-base font-bold">
                {summary.correct} of {summary.total} right
              </p>
            )}
          />
        </div>
      ) : null}
      {playingGiven && profile ? (
        <div data-testid="e2e-class12-given-player" className="-mx-4 mt-6 [&_.sticky]:static">
          <SessionRunner
            profile={profile}
            kind="level"
            items={bootGiven.items}
            sessionId={bootGiven.sessionId}
            topicId="e2e"
            title="Statements with printed figures"
            noun="level"
            exitHref="/settings"
            saveResult={async () => {}}
            renderResults={({ summary }) => (
              <p data-testid="e2e-class12-given-done" className="text-base font-bold">
                {summary.correct} of {summary.total} right
              </p>
            )}
          />
        </div>
      ) : null}
    </>
  );
}
