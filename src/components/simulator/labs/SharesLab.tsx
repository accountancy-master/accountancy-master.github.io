'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { rupees } from '@/engine/money';
import { createRng } from '@/engine/rng';
import { ISSUE_EXAMPLES, newIssue, PATTERNS, SUBSCRIPTION } from '@/simulator/shares/examples';
import { callLabel, issueProblem, issueShares, type Instalment, type Issue, type IssueIn } from '@/simulator/shares/issue';
import { describeIssue, sharesQuestions } from '@/simulator/shares/questions';
import { useReducedMotion } from '../useReducedMotion';
import { SelectField, Toggle, type LabMode } from './kit/LabControls';
import { Card, Intro, LabShell } from './kit/LabShell';
import { NumberField } from './kit/MoneyField';
import { PlaybackBar, Stage, StepList, StepNow } from './kit/Playback';
import { QuestionRound } from './kit/QuestionRound';
import { Journal } from './kit/TAccount';
import { usePlayback } from './kit/usePlayback';
import { OneShare, Pots, ShareNote, stateAt, Timeline } from './shares/IssuePicture';
import type { LabProps } from './types';

// ---------------------------------------------------------------------------------------------------------------
// The lab "shares" (src/simulator/labs.ts): an issue of shares followed from the applications to the reissue of
// forfeited shares, one share and the whole issue at once, with the journal and the note on share capital beside
// it. All the figures come from src/simulator/shares.
// ---------------------------------------------------------------------------------------------------------------

const ID = 'lab-shares';

const CONVENTIONS = [
  'Equity shares of ₹10.',
  'The premium is payable with the allotment money.',
  'Unpaid money is debited to Calls in Arrears A/c and money paid before it is called is credited to Calls in Advance A/c (no interest on either).',
  'Excess application money is set against the allotment and anything beyond it refunded.',
  'Forfeited shares are reissued as fully paid.',
];

export default function SharesLab({ seed }: LabProps) {
  const [mode, setMode] = useState<LabMode>('watch');
  return (
    <LabShell prefix={ID} mode={mode} onMode={setMode} conventions={CONVENTIONS}>
      {mode === 'watch' ? <Watch /> : null}
      {mode === 'play' ? <Play seed={seed} /> : null}
      {mode === 'try' ? <Try seed={seed} /> : null}
    </LabShell>
  );
}

/** A row of choices, as the kit draws them. Test ids `<id>-<option>`. */
function Choice<T extends string>({ id, label, value, options, onChange }: { id: string; label: string; value: T; options: { id: T; label: string }[]; onChange(v: T): void }) {
  return <Toggle prefix={id} label={label} value={value} options={options.map((o) => ({ value: o.id, label: o.label }))} onChange={onChange} small />;
}

function Watch() {
  const [pick, setPick] = useState(ISSUE_EXAMPLES[0].id);
  const issue = useMemo(() => issueShares(ISSUE_EXAMPLES.find((e) => e.id === pick)!.input), [pick]);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Toggle options={ISSUE_EXAMPLES.map((e) => ({ value: e.id, label: e.title }))} value={pick} onChange={setPick} label="Issue to watch" prefix={`${ID}-example`} small />
      <IssueWalk issue={issue} />
    </div>
  );
}

function IssueWalk({ issue, atEnd = false }: { issue: Issue; atEnd?: boolean }) {
  const reduced = useReducedMotion();
  const player = usePlayback(issue.steps.length, { story: issue, stepMs: 2600, start: atEnd ? issue.steps.length : 0 });
  const shown = player.shown;
  const last = shown > 0 ? issue.steps[shown - 1] : null;
  const step = stateAt(issue, shown);
  const entries = issue.steps.slice(0, shown).map((s) => s.entry);
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-3">
        <Intro prefix={ID} testId={`${ID}-facts`} facts={describeIssue(issue.input, 'One shareholder')} />
        <PlaybackBar playback={player} prefix={ID} announce={last ? `Step ${shown} of ${issue.steps.length}, ${last.title}. ${last.text}` : ''} />
        <StepNow prefix={ID} at={shown} count={issue.steps.length} title={last?.title} idle="Press Play, or Step, to follow the money of the issue one call at a time.">
          {last?.text}
        </StepNow>
        <Stage prefix={ID} label="A share issue, one share and the whole issue" playback={player}>
          <div className="flex min-w-0 flex-col gap-4">
            <Timeline issue={issue} shown={shown} />
            <OneShare rows={step ? step.rows : issue.steps[0].rows.map((r) => ({ ...r, segments: r.segments.map((s) => ({ ...s, called: false, paid: 0 })) }))} />
            <Pots issue={issue} shown={shown} advanced={player.advanced} reduced={reduced} />
          </div>
        </Stage>
        <StepList steps={issue.steps} shown={shown} prefix={ID} onPick={(i) => player.seek(i + 1)} />
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <Card title="In the exam: the journal">
          {entries.length === 0 ? <p className="text-sm text-muted">The entries are written as the issue plays.</p> : null}
          <Journal entries={entries} testId={`${ID}-journal`} highlight={entries.length - 1} caption={`Journal of ${issue.input.company}`} being />
        </Card>
        <Card title="In the exam: the balance sheet" testId={`${ID}-balance-sheet`}>
          <p className="text-sm">
            On the face of the balance sheet, under Shareholders&apos; Funds: Share Capital (Note 1)
            {step ? (
              <strong data-testid={`${ID}-share-capital`} className="tabular-nums">
                {' '}
                ₹{new Intl.NumberFormat('en-IN').format((step.note.find((r) => r.style === 'total')?.amount ?? 0) / 100)}
              </strong>
            ) : null}
            . Securities Premium and Capital Reserve go under Reserves and Surplus; Calls in Advance under Other Current Liabilities.
          </p>
          <ShareNote issue={issue} shown={shown} />
        </Card>
      </div>
    </div>
  );
}

// ---- Play ----

interface Form {
  company: string;
  offered: number;
  authorisedTimes: number;
  premium: number;
  pattern: string;
  sub: string;
  rejected: number;
  defShares: number;
  paid: Instalment;
  early: boolean;
  advShares: number;
  reShares: number;
  rePrice: number;
}

const patternKey = (p: number[]) => p.join('-');
const ALL_PATTERNS = [...PATTERNS, ...ISSUE_EXAMPLES.map((e) => [e.input.application, e.input.allotment, ...e.input.calls].map((v) => v / 100))].filter((p, i, all) => all.findIndex((q) => patternKey(q) === patternKey(p)) === i);

function formFrom(x: IssueIn): Form {
  const pool = x.applied - x.rejected;
  const g = gcdOf(pool, x.offered);
  const sub = `${pool / g}:${x.offered / g}`;
  return {
    company: x.company,
    offered: x.offered,
    authorisedTimes: Math.max(1, Math.round(x.authorised / x.offered)),
    premium: x.premium / 100,
    pattern: patternKey([x.application, x.allotment, ...x.calls].map((v) => v / 100)),
    sub: SUBSCRIPTION.some(([a, b]) => `${a}:${b}` === sub) ? sub : '1:1',
    rejected: x.rejected,
    defShares: x.defaulter?.shares ?? 0,
    paid: x.defaulter?.paid ?? 'application',
    early: x.forfeitEarly,
    advShares: x.advance?.shares ?? 0,
    reShares: x.reissue?.shares ?? 0,
    rePrice: x.reissue ? x.reissue.price / 100 : 8,
  };
}

function gcdOf(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

function inputOf(f: Form): IssueIn {
  const p = f.pattern.split('-').map(Number);
  const [num, den] = f.sub.split(':').map(Number);
  const pool = (f.offered * num) / den;
  const rejected = num === den ? 0 : Math.max(0, Math.round(f.rejected));
  const calls = p.slice(2).map(rupees);
  const paid: Instalment = calls.length === 1 && f.paid === 'call1' ? 'allotment' : f.paid;
  const d = Math.max(0, Math.round(f.defShares));
  return {
    company: f.company,
    authorised: f.offered * f.authorisedTimes,
    offered: f.offered,
    face: rupees(10),
    premium: rupees(f.premium),
    application: rupees(p[0]),
    allotment: rupees(p[1]),
    calls,
    applied: pool + rejected,
    rejected,
    defaulter: d > 0 ? { shares: d, paid } : null,
    forfeitEarly: d > 0 && f.early && calls.length === 2 && paid !== 'call1',
    advance: f.advShares > 0 ? { shares: Math.round(f.advShares) } : null,
    reissue: d > 0 && f.reShares > 0 ? { shares: Math.round(f.reShares), price: rupees(f.rePrice) } : null,
  };
}

function Play({ seed }: { seed?: number }) {
  const [form, setForm] = useState<Form>(() => formFrom(ISSUE_EXAMPLES[0].input));
  const [round, setRound] = useState(0);
  const input = useMemo(() => inputOf(form), [form]);
  const worked = useMemo((): Issue | string => {
    const problem = issueProblem(input);
    if (problem) return problem;
    try {
      return issueShares(input);
    } catch (e) {
      return e instanceof Error ? e.message : 'These figures cannot be worked.';
    }
  }, [input]);
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const twoCalls = form.pattern.split('-').length === 4;
  const nCalls = twoCalls ? 2 : 1;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-muted">Ready examples:</span>
        {ISSUE_EXAMPLES.map((e) => (
          <Button key={e.id} variant="ghost" data-testid={`${ID}-example-${e.id}`} onClick={() => setForm(formFrom(e.input))}>
            {e.title}
          </Button>
        ))}
        <Button
          variant="secondary"
          data-testid={`${ID}-new-figures`}
          onClick={() => {
            setForm(formFrom(newIssue(createRng((seed ?? 1) * 2003 + round))));
            setRound(round + 1);
          }}
        >
          New figures
        </Button>
      </div>
      <Card title={`The issue of ${form.company}`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField
            id={`${ID}-offered`}
            testId={`${ID}-offered`}
            label="Shares offered"
            value={String(form.offered)}
            options={[10000, 20000, 25000, 40000, 50000, 100000].map((n) => ({ id: String(n), label: new Intl.NumberFormat('en-IN').format(n) }))}
            onChange={(v) => set({ offered: Number(v) })}
          />
          <SelectField id={`${ID}-premium`} testId={`${ID}-premium`} label="Premium a share" value={String(form.premium)} options={[0, 1, 2, 3, 5].map((n) => ({ id: String(n), label: n === 0 ? 'At par' : `₹${n}` }))} onChange={(v) => set({ premium: Number(v) })} />
          <SelectField
            id={`${ID}-pattern`}
            testId={`${ID}-pattern`}
            label="₹10 payable as"
            value={form.pattern}
            options={ALL_PATTERNS.map((p) => ({ id: patternKey(p), label: `${p[0]} on application, ${p[1]} on allotment, ${p.slice(2).join(' + ')} on ${p.length === 3 ? 'one call' : 'two calls'}` }))}
            onChange={(v) => set({ pattern: v })}
          />
          <SelectField
            id={`${ID}-sub`}
            testId={`${ID}-sub`}
            label="Applications kept : shares offered"
            value={form.sub}
            options={SUBSCRIPTION.map(([a, b]) => ({ id: `${a}:${b}`, label: a === b ? 'Exactly subscribed' : `${a} : ${b}, allotted pro rata` }))}
            onChange={(v) => set({ sub: v })}
          />
          {form.sub !== '1:1' ? <NumberField id={`${ID}-rejected`} testId={`${ID}-rejected`} label="Shares applied for and rejected" value={form.rejected} min={0} step={1000} onChange={(v) => set({ rejected: v })} /> : null}
          <NumberField id={`${ID}-def-shares`} testId={`${ID}-def-shares`} label="Shares of a holder who stops paying (0 for none)" value={form.defShares} min={0} step={100} onChange={(v) => set({ defShares: v })} />
          {form.defShares > 0 ? (
            <>
              <SelectField
                id={`${ID}-paid`}
                testId={`${ID}-paid`}
                label="That holder pays up to"
                value={nCalls === 1 && form.paid === 'call1' ? 'allotment' : form.paid}
                options={[
                  { id: 'application', label: 'Application only' },
                  { id: 'allotment', label: 'Allotment' },
                  ...(nCalls === 2 ? [{ id: 'call1' as const, label: callLabel(2, 0) }] : []),
                ]}
                onChange={(v) => set({ paid: v })}
              />
              {nCalls === 2 && form.paid !== 'call1' ? (
                <Choice<'after' | 'before'>
                  id={`${ID}-early`}
                  label="Forfeited"
                  value={form.early ? 'before' : 'after'}
                  options={[
                    { id: 'after', label: 'After the final call' },
                    { id: 'before', label: 'Before the final call' },
                  ]}
                  onChange={(v) => set({ early: v === 'before' })}
                />
              ) : null}
              <NumberField id={`${ID}-re-shares`} testId={`${ID}-re-shares`} label="Of them reissued (0 for none)" value={form.reShares} min={0} step={50} onChange={(v) => set({ reShares: v })} />
              {form.reShares > 0 ? <NumberField id={`${ID}-re-price`} testId={`${ID}-re-price`} label="Reissue price a share ₹ (fully paid)" value={form.rePrice} min={1} step={0.5} onChange={(v) => set({ rePrice: v })} /> : null}
            </>
          ) : null}
          <NumberField id={`${ID}-adv-shares`} testId={`${ID}-adv-shares`} label="Shares of a holder who pays the final call early (0 for none)" value={form.advShares} min={0} step={500} onChange={(v) => set({ advShares: v })} />
        </div>
      </Card>
      {typeof worked === 'string' ? (
        <p role="alert" data-testid={`${ID}-problem`} className="rounded-control bg-danger-soft px-3 py-2 text-base font-bold text-danger-deep">
          {worked}
        </p>
      ) : (
        <IssueWalk issue={worked} atEnd />
      )}
    </div>
  );
}

function Try({ seed }: { seed?: number }) {
  const [base] = useState(() => seed ?? 1 + Math.floor(Math.random() * 100000));
  const [round, setRound] = useState(0);
  const questions = useMemo(() => sharesQuestions(base + round * 11), [base, round]);
  return <QuestionRound prefix={ID} questions={questions} onMore={() => setRound((r) => r + 1)} />;
}
