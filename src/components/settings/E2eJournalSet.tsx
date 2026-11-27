'use client';

import { useState } from 'react';
import { MistakeCard } from '@/components/mistakes/MistakesView';
import { JournalSetInput } from '@/components/play/JournalSetInput';
import { Prompt } from '@/components/ui/Prompt';
import { TopicsGate } from '@/components/ui/TopicsGate';
import { findTemplateOutline } from '@/content/outline';
import type { JournalSetQuestion } from '@/content/types';
import { checkAnswer } from '@/exercises/checkers';
import { MAX_SET_ENTRIES } from '@/generators/engine';
import { generateQuestion } from '@/generators/loaded';
import type { JournalRow } from '@/play/journalRows';

const nothing = () => {};
const TEMPLATE = 'je-set-opening-month';

/** The longest set there is: eight transactions, the first of them an opening entry of seven lines. */
function longestSet(): JournalSetQuestion {
  for (let seed = 1; seed <= 500; seed++) {
    const q = generateQuestion(TEMPLATE, seed);
    if (q.type === 'journal_set' && q.entries.length === MAX_SET_ENTRIES) return q;
  }
  throw new Error('no set of eight transactions');
}

/**
 * Test-only fixture (rendered only in E2E builds, on the Settings page): the real journal of a set with the longest
 * set there is, as it is filled in, as it is marked (the second entry with its sides the wrong way round, the third
 * left empty) and on the real Mistakes card, once as an attempt made before answers were kept gives it (the stored
 * code alone) and once with the answer the attempt kept, so a test can check that all of them fit a phone 360 px wide.
 */
export function E2eJournalSet() {
  const topicId = findTemplateOutline(TEMPLATE)?.topicId;
  return <TopicsGate topicIds={topicId ? [topicId] : []}>{() => <SetSample />}</TopicsGate>;
}

function SetSample() {
  const [sample] = useState(() => {
    const question = longestSet();
    const rows = question.entries.map((e, i): JournalRow[] =>
      i === 2 ? [] : e.expected.map((l) => ({ accountId: l.accountId, side: i === 1 ? (l.side === 'Dr' ? 'Cr' : 'Dr') : l.side, amount: String(l.amount / 100) })),
    );
    const entries = question.entries.map((e, i) => (i === 2 ? [] : e.expected.map((l) => (i === 1 ? { ...l, side: l.side === 'Dr' ? ('Cr' as const) : ('Dr' as const) } : l))));
    return { question, rows, entries, result: checkAnswer(question, { type: 'journal_set', entries }) };
  });
  const { question, rows, entries, result } = sample;

  return (
    <section
      data-testid="e2e-set"
      data-entries={question.entries.length}
      data-expected={JSON.stringify({ entries: question.entries.map((e) => e.expected) })}
      className="mt-6 flex flex-col gap-4 rounded-card border-2 border-dashed border-edge-deep bg-canvas p-4"
    >
      <h2 className="text-lg font-extrabold">Set of entries sample</h2>
      <div data-testid="e2e-set-open" className="flex flex-col gap-4">
        <Prompt text={question.prompt} />
        <JournalSetInput question={question} checked={false} result={null} onFilledChange={nothing} registerSubmit={nothing} onAnswer={nothing} />
      </div>
      <div data-testid="e2e-set-marked">
        <JournalSetInput
          question={question}
          checked
          result={result}
          draft={{ type: 'journal_set', entries: rows }}
          onFilledChange={nothing}
          registerSubmit={nothing}
          onAnswer={nothing}
        />
      </div>
      <div data-testid="e2e-set-mistake">
        <MistakeCard question={question} tries={1} miss={{ mistakeCode: result.mistakeCode, hintsUsed: 0 }} />
      </div>
      <div data-testid="e2e-set-kept">
        <MistakeCard question={question} tries={1} miss={{ mistakeCode: result.mistakeCode, hintsUsed: 0, answer: { type: 'journal_set', entries } }} />
      </div>
    </section>
  );
}
