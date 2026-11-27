'use client';

import { useState } from 'react';
import { MistakeCard } from '@/components/mistakes/MistakesView';
import { Prompt } from '@/components/ui/Prompt';
import { TopicsGate } from '@/components/ui/TopicsGate';
import { TEMPLATE_OUTLINES } from '@/content/outline';
import type { AccountQuestion, Question, StatementQuestion } from '@/content/types';
import { checkAnswer } from '@/exercises/checkers';
import { answerToKeep, expectedRows, logicFor } from '@/exercises/logic';
import { exerciseFor } from '@/exercises/registry';
import { generateQuestion } from '@/generators/loaded';
import { isFormatKind } from '@/generators/types';
import type { Draft } from '@/play/drafts';
import { draftResponse } from '@/play/drafts';
import type { FormatRowDraft } from '@/play/formatRows';
import { SAMPLE_ACCOUNT, SAMPLE_BOOK, SAMPLE_BRS_CHOICE, SAMPLE_PERIODS, rightFormatDraft } from '@/testing/sampleFormats';

const nothing = () => {};
// Enough seeds to meet a long format of every template, and few enough for the panel to appear promptly on a slow machine.
const SEEDS = 12;

/**
 * A statement whose slips `slippedStatement` can make: one list of rows, no figure printed. A statement in parts (the
 * Class 12 statements) has its own sample and test.
 */
const plain = (q: Question) => q.type !== 'statement' || (!q.lines?.length && !q.givenColumns?.some(Boolean));

/** The format of one kind with the most rows that the first seeds of every template of that kind make. */
function longest<T extends 'account' | 'statement'>(kind: T): Extract<Question, { type: T }> {
  let best: Question | undefined;
  for (const t of TEMPLATE_OUTLINES.filter((x) => x.kind === kind)) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const q = generateQuestion(t.id, seed);
      if ((q.type === 'account' || q.type === 'statement') && plain(q) && (!best || (best.type === q.type && expectedRows(q).length > expectedRows(best).length))) best = q;
    }
  }
  if (!best || best.type !== kind) throw new Error(`no ${kind} to show`);
  return best as Extract<Question, { type: T }>;
}

const typed = (rows: { label: string; amounts: number[] }[]): FormatRowDraft[] => rows.map((r) => ({ label: r.label, amounts: r.amounts.map((a) => (a === 0 ? '' : String(a / 100))) }));

/** An account with three slips: a row moved to the other side, the closing row left out, and a row that belongs nowhere. */
export function slippedAccount(q: AccountQuestion): Draft {
  // Exactly one closing row is left out: a cash book that ends with cash in hand and an overdraft has one on each side.
  // A balance sheet has no closing row: the last row of its first side is left out instead.
  const dropped = q.sides.flatMap((s) => s.rows).find((r) => r.closing) ?? q.sides[0].rows[q.sides[0].rows.length - 1];
  const [left, right] = q.sides.map((s) => typed(s.rows.filter((r) => r !== dropped)));
  const extra = q.labels.find((label) => !expectedRows(q).some((e) => e.row.label === label))!;
  const moved = right.splice(0, 1);
  return { type: 'account', sides: [[...left, ...moved, { label: extra, amounts: q.columns.map((_, c) => (c === 0 ? '500' : '')) }], right], below: [typed(q.sides[0].below), typed(q.sides[1].below)] };
}

/** The account over three years with one slip: the closing row of the second year left out. */
function slippedPeriods(q: AccountQuestion): Draft {
  const draft = rightFormatDraft(q);
  if (draft.type !== 'account' || !draft.later) return draft;
  return { ...draft, later: draft.later.map(([left, right], i): [FormatRowDraft[], FormatRowDraft[]] => [left, i === 0 ? right.slice(0, -1) : right]) };
}

/** The statement that leaves its ending to be named, with the right amount under the wrong name. */
function misnamed(q: StatementQuestion): Draft {
  const draft = rightFormatDraft(q);
  return draft.type === 'statement' ? { ...draft, finalLabel: q.final?.options?.find((label) => label !== q.final?.label) } : draft;
}

/** An account whose task asks for the balance to be brought down and which has none left: the place for it is offered all the same. */
const NOTHING_LEFT: AccountQuestion = {
  ...SAMPLE_ACCOUNT,
  id: 'sample-nothing-left',
  continued: true,
  sides: [
    { ...SAMPLE_ACCOUNT.sides[0], rows: SAMPLE_ACCOUNT.sides[0].rows.map((r) => (r.closing ? { label: 'Bank A/c', amounts: r.amounts, date: '30 Apr' } : r)) },
    { ...SAMPLE_ACCOUNT.sides[1], below: [] },
  ],
};

/** A statement with two slips: the first amount in the wrong column, and the last row left out. */
function slippedStatement(q: StatementQuestion): Draft {
  const rows = typed(q.rows.slice(0, -1));
  rows[0] = { ...rows[0], amounts: [...rows[0].amounts].reverse() };
  return { type: 'statement', rows, final: q.final ? String(q.final.amount / 100) : '' };
}

/**
 * One format four ways: as it is filled in, as it is marked after the slips of `draft`, and on the Mistakes card, from
 * the stored code alone (an attempt made before answers were kept) and with the answer the attempt kept.
 */
export function Sample({ name, question, draft }: { name: string; question: AccountQuestion | StatementQuestion; draft: Draft }) {
  const { Input } = exerciseFor(question);
  const response = draftResponse(question, draft)!;
  const result = checkAnswer(question, response);
  return (
    <div data-testid={`e2e-${name}`} data-rows={expectedRows(question).length} data-expected={JSON.stringify(logicFor(question).e2eExpected(question))} className="flex flex-col gap-4">
      <div data-testid={`e2e-${name}-open`} className="flex flex-col gap-4">
        <Prompt text={question.prompt} />
        <Input question={question} checked={false} result={null} onFilledChange={nothing} registerSubmit={nothing} onAnswer={nothing} />
      </div>
      <div data-testid={`e2e-${name}-marked`} data-code={result.mistakeCode}>
        <Input question={question} checked result={result} draft={draft} onFilledChange={nothing} registerSubmit={nothing} onAnswer={nothing} />
      </div>
      <div data-testid={`e2e-${name}-mistake`}>
        <MistakeCard question={question} tries={1} miss={{ mistakeCode: result.mistakeCode, hintsUsed: 0 }} />
      </div>
      <div data-testid={`e2e-${name}-kept`}>
        <MistakeCard question={question} tries={1} miss={{ mistakeCode: result.mistakeCode, hintsUsed: 0, answer: answerToKeep(response, result) }} />
      </div>
    </div>
  );
}

/**
 * Test-only fixture (rendered only in E2E builds, on the Settings page): the real screens of an account and of a
 * statement with the longest of each that the generators make, as they are filled in, as they are marked and on the
 * real Mistakes card (with and without the answer of the attempt), so a test can check that all of them fit a phone
 * 360 px wide and how they stand on a laptop.
 */
export function E2eFormats() {
  // Every topic that makes an account or a statement: the longest of each is looked for among all of them.
  const topicIds = [...new Set(TEMPLATE_OUTLINES.filter((t) => isFormatKind(t.kind)).map((t) => t.topicId))];
  return <TopicsGate topicIds={topicIds}>{() => <FormatSamples />}</TopicsGate>;
}

function FormatSamples() {
  const [sample] = useState(() => {
    const account = longest('account');
    const statement = longest('statement');
    return { account, statement, accountDraft: slippedAccount(account), statementDraft: slippedStatement(statement) };
  });
  return (
    <section data-testid="e2e-formats" className="mt-6 flex flex-col gap-6 rounded-card border-2 border-dashed border-edge-deep bg-canvas p-4">
      <h2 className="text-lg font-extrabold">Formats sample</h2>
      <Sample name="account" question={sample.account} draft={sample.accountDraft} />
      <Sample name="statement" question={sample.statement} draft={sample.statementDraft} />
      {/* What the generators of these two topics do not make: several periods, no balance left, an ending to be named, four columns. */}
      <Sample name="periods" question={SAMPLE_PERIODS} draft={slippedPeriods(SAMPLE_PERIODS)} />
      <Sample name="nothing-left" question={NOTHING_LEFT} draft={rightFormatDraft(NOTHING_LEFT)} />
      <Sample name="choice" question={SAMPLE_BRS_CHOICE} draft={misnamed(SAMPLE_BRS_CHOICE)} />
      <Sample name="book" question={SAMPLE_BOOK} draft={slippedStatement(SAMPLE_BOOK)} />
    </section>
  );
}
