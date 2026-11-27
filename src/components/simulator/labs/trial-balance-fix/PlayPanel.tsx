'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { parseRupees } from '../kit/answers';
import { useVisitSeed } from '../kit/format';
import { pillClass, Toggle } from '../kit/LabControls';
import { Intro } from '../kit/LabShell';
import { Stage } from '../kit/Playback';
import { AnswerField, ChoiceButton, ChoiceGroup, FeedbackBox, type ShownVerdict } from '../kit/TryIt';
import { caseFromSeed, READY_CASES } from '@/simulator/trial-balance-fix/cases';
import { accountChoices, checksOf, judgeEntry, narrationChoices, rightOf, type Check, type EntryTry } from '@/simulator/trial-balance-fix/marking';
import { buildCase, correctedTb, errorsWhen, f, sideWord, title, totalsOf, type Case, type CaseData, type CaseError } from '@/simulator/trial-balance-fix/model';
import { aboutCase, explainError, START, type DeskState } from '@/simulator/trial-balance-fix/walk';
import { Desk, ErrorCard } from './Desk';
import { Badge, P } from './LedgerAccount';
import { Arrive } from '../kit/Arrive';

/** A stage pill of a stage still to come. */
const AHEAD = 'inline-flex min-h-11 items-center rounded-full border border-dashed border-edge-deep bg-surface px-4 py-1.5 text-sm font-extrabold text-muted';

// ---------------------------------------------------------------------------------------------------------------
// Play: the student takes a case through its stages. The books are posted to the ledger; the trial balance is drawn
// up and checked, and the student puts the difference to Suspense A/c; the errors are told (as the board gives them)
// or found by ticking every posting against the books (the detective); the student passes each rectifying entry;
// then the entries are posted, Suspense A/c closes and the corrected trial balance agrees. "Show me" does a step.
// ---------------------------------------------------------------------------------------------------------------

const STAGES = [
  { id: 'books', label: '1. The books' },
  { id: 'ledger', label: '2. The ledger' },
  { id: 'tb', label: '3. Trial balance' },
  { id: 'find', label: '4. Find the errors' },
  { id: 'rectify', label: '5. Rectify' },
  { id: 'corrected', label: '6. Corrected' },
] as const;
type StageId = (typeof STAGES)[number]['id'];

export function PlayPanel({ reduced, seed }: { reduced: boolean; seed?: number }) {
  const base = useVisitSeed(seed);
  const [data, setData] = useState<CaseData>(READY_CASES[0]);
  const [made, setMade] = useState(0);
  const c = useMemo(() => buildCase(data), [data]);
  const fresh = () => {
    setData(caseFromSeed(base + made));
    setMade(made + 1);
  };
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Toggle
          options={READY_CASES.map((d) => ({ value: d.id, label: d.title }))}
          value={data.id}
          onChange={(id) => setData(READY_CASES.find((d) => d.id === id)!)}
          label="Ready cases, of rising difficulty"
          prefix={`${P}-case`}
          small
        />
        <Button variant="secondary" data-testid={`${P}-new`} onClick={fresh}>
          New case
        </Button>
      </div>
      <Intro prefix={P}>
        <span className="font-extrabold">{data.level}. </span>
        {aboutCase(c)}
      </Intro>
      <Run key={`${data.id}`} c={c} reduced={reduced} />
    </div>
  );
}

function Run({ c, reduced }: { c: Case; reduced: boolean }) {
  const [stage, setStage] = useState<StageId>('books');
  const [tbChecked, setTbChecked] = useState(false);
  const [suspenseOpen, setSuspenseOpen] = useState(false);
  const [detective, setDetective] = useState(c.data.detective === true);
  const [answers, setAnswers] = useState<Record<string, 'ok' | 'wrong'>>({});
  const [passed, setPassed] = useState<string[]>([]);
  const [showing, setShowing] = useState<string | null>(null);
  const after = errorsWhen(c, 'after');
  const tbErrs = errorsWhen(c, 'tb');
  const checks = useMemo(() => checksOf(c), [c]);
  const at = STAGES.findIndex((s) => s.id === stage);
  const reached = (s: StageId) => at >= STAGES.findIndex((x) => x.id === s);

  // The errors found so far: those told, and in a detective's case those uncovered by a check answered.
  const told = detective ? after.filter((e) => !checks.some((k) => k.letter === e.letter)) : after;
  const ticked = new Set(checks.filter((k) => answers[k.id] && k.letter).map((k) => k.letter!));
  const found = reached('find') ? [...told.map((e) => e.letter), ...ticked] : [];
  const nextCheck = checks.find((k) => !answers[k.id]);
  const allFound = after.every((e) => found.includes(e.letter)) && (!detective || !nextCheck);
  const current = (showing ? after.find((e) => e.letter === showing) : after.find((e) => !passed.includes(e.letter))) ?? null;
  const allPassed = after.every((e) => passed.includes(e.letter));

  const st: DeskState = {
    ...START,
    posted: reached('ledger'),
    checked: reached('ledger'),
    balanced: reached('ledger'),
    tb: reached('tb') ? (tbChecked || tbErrs.length === 0 ? 'checked' : 'draft') : 'none',
    suspense: suspenseOpen,
    revealed: new Set([...(tbChecked ? tbErrs.map((e) => e.letter) : []), ...found]),
    entries: new Set(passed),
    rectified: stage === 'corrected' ? new Set(after.map((e) => e.letter)) : new Set(),
    corrected: stage === 'corrected',
    profit: stage === 'corrected',
    current: stage === 'rectify' ? (current?.letter ?? null) : null,
    focus:
      stage === 'find' && detective && nextCheck
        ? [nextCheck.accountId]
        : stage === 'rectify' && current
          ? current.accounts.slice(0, 1).concat(current.oneSided ? ['suspense'] : current.accounts.slice(1, 2))
          : stage === 'corrected'
            ? ['suspense']
            : stage === 'ledger'
              ? [c.accounts[0]]
              : [],
  };
  const highlight = stage === 'find' && detective && nextCheck ? (nextCheck.kind === 'book' ? 'book' : nextCheck.kind === 'posting' ? txnLineOf(nextCheck) : null) : null;

  const canGo: Record<StageId, boolean> = {
    books: true,
    ledger: true,
    tb: suspenseOpen,
    find: allFound,
    rectify: allPassed,
    corrected: false,
  };
  const NEXT: Record<StageId, string> = {
    books: 'Post the ledger',
    ledger: 'Draw up the trial balance',
    tb: 'Find the errors',
    find: 'Rectify them',
    rectify: 'Post the rectifying entries',
    corrected: '',
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ol aria-label="Stages" className="flex flex-wrap gap-1.5">
        {STAGES.map((s, i) => (
          // A stage still to come is dashed, in muted words (never faded, so that it can still be read).
          <li key={s.id} data-testid={`${P}-pstage-${s.id}`} aria-current={s.id === stage ? 'step' : undefined} className={i > at ? AHEAD : pillClass(s.id === stage, true)}>
            {i < at ? '✓ ' : ''}
            {s.label}
          </li>
        ))}
      </ol>

      <div data-testid={`${P}-task`} data-stage={stage} className="flex min-w-0 flex-col gap-3 rounded-card border-2 border-primary bg-surface p-3 sm:p-4">
        {stage === 'books' ? <p className="text-base">Read the month and the books as the clerk wrote them. Then post the ledger: it is rough work, from which the errors will be found.</p> : null}
        {stage === 'ledger' ? (
          <p className="text-base">
            Every line is posted, and every account balanced on 30 April. Open any account from the row of accounts.
            {errorsWhen(c, 'before').length ? ` Before balancing, the clerk noticed a slip in the posting: ${errorsWhen(c, 'before').map((e) => `${e.tag} ${e.text.charAt(0).toLowerCase()}${e.text.slice(1)}`).join(' ')} Only one account is wrong and there is no trial balance yet, so it is corrected in the account itself (✎), with no journal entry.` : ''}
          </p>
        ) : null}
        {stage === 'tb' ? <TbTask c={c} checked={tbChecked || tbErrs.length === 0} onCheckTb={() => setTbChecked(true)} open={suspenseOpen} onOpen={() => setSuspenseOpen(true)} /> : null}
        {stage === 'find' ? (
          <FindTask
            c={c}
            detective={detective}
            onDetective={setDetective}
            told={told}
            checks={checks}
            answers={answers}
            onAnswer={(id, a) => setAnswers((x) => ({ ...x, [id]: a }))}
            reduced={reduced}
            onTickRest={() => setAnswers((x) => Object.fromEntries(checks.map((k) => [k.id, x[k.id] ?? (k.letter ? 'wrong' : 'ok')])))}
          />
        ) : null}
        {stage === 'rectify' ? current ? <EntryBuilder key={current.letter} c={c} e={current} last={after[after.length - 1] === current} onPassed={() => {
                setPassed((p) => [...p, current.letter]);
                setShowing(current.letter);
              }} onNext={() => setShowing(null)} /> : <p className="text-base font-bold text-primary-ink">✓ Every error found after the trial balance has its rectifying entry. Post them.</p> : null}
        {stage === 'corrected' ? (
          <p data-testid={`${P}-done`} className="text-base">
            The rectifying entries are posted: Suspense A/c closes with nothing left, and the corrected trial balance agrees at {f(totalsOf(correctedTb(c)).debit)}. The profit is corrected for the errors that touched an income or an expense.
          </p>
        ) : null}
        {stage !== 'corrected' ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button data-testid={`${P}-next`} disabled={!canGo[stage]} onClick={() => setStage(STAGES[at + 1].id)}>
              {NEXT[stage]} <span aria-hidden="true">▶</span>
            </Button>
            {!canGo[stage] ? <span className="text-sm text-muted">{stage === 'tb' ? 'Put the difference to Suspense A/c first.' : stage === 'find' ? 'Find every error first.' : 'Pass every rectifying entry first.'}</span> : null}
          </div>
        ) : null}
      </div>

      {stage === 'rectify' && current ? <ErrorCard c={c} e={current} solved={false} /> : null}
      <Stage prefix={P} label="The books, the ledger and the trial balance" shown={at}>
        <Desk c={c} st={st} reduced={reduced} highlight={highlight} />
      </Stage>
    </div>
  );
}

function txnLineOf(k: Check): { txn: number; line: number } | null {
  const m = /^post:(\d+)\.(\d+)$/.exec(k.id);
  return m ? { txn: Number(m[1]), line: Number(m[2]) } : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Stage 3: check the trial balance against the ledger, and put the difference to Suspense A/c.
// ---------------------------------------------------------------------------------------------------------------

function TbTask({ c, checked, onCheckTb, open, onOpen }: { c: Case; checked: boolean; onCheckTb(): void; open: boolean; onOpen(): void }) {
  const [typed, setTyped] = useState('');
  const [side, setSide] = useState<'Dr' | 'Cr' | null>(null);
  const [verdict, setVerdict] = useState<ShownVerdict | null>(null);
  const tbErrs = errorsWhen(c, 'tb');
  const t = totalsOf(c.tbChecked);
  const s = c.suspense;
  const check = () => {
    const v = parseRupees(typed);
    const right = v === s.amount && side === s.side;
    let slip: string | null = null;
    if (v !== s.amount) slip = v === t.debit + t.credit ? 'That is the two totals added: Suspense A/c takes their difference.' : v === Math.max(t.debit, t.credit) || v === Math.min(t.debit, t.credit) ? 'That is a column total: Suspense A/c takes the difference of the two.' : `${v === null ? 'That is not an amount' : `${f(v)} is not the difference`}: ${f(Math.max(t.debit, t.credit))} − ${f(Math.min(t.debit, t.credit))}.`;
    else if (side !== s.side) slip = 'The amount is right, but Suspense A/c goes in the column that is short, so that the two columns agree.';
    setVerdict({ right, slip, reason: `The debit column adds up to ${f(t.debit)} and the credit column to ${f(t.credit)}: the ${sideWord(s.side)} column is short by ${f(s.amount)}, so Suspense A/c ${f(s.amount)} goes in the ${sideWord(s.side)} column ("${s.side === 'Dr' ? 'To' : 'By'} Difference in Trial Balance" in Suspense A/c).` });
    if (right) onOpen();
  };
  const show = () => {
    setTyped(String(s.amount / 100));
    setSide(s.side);
    setVerdict({ right: true, answer: null, reason: `Shown: the ${sideWord(s.side)} column is short by ${f(s.amount)}, so Suspense A/c ${f(s.amount)} goes in the ${sideWord(s.side)} column.` });
    onOpen();
  };
  if (!checked) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-base">The trial balance does not agree. Before opening a Suspense A/c, check it against the ledger: is every balance copied rightly, and in its right column?</p>
        <Button data-testid={`${P}-check-tb`} onClick={onCheckTb} className="self-start">
          Check it against the ledger
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {tbErrs.length ? (
        <p data-testid={`${P}-tb-found`} className="rounded-control bg-accent-soft px-3 py-2 text-sm">
          {tbErrs.map((e) => `${e.tag} ${e.text} ${e.inTrialBalance}`).join(' ')}
        </p>
      ) : null}
      <p className="text-base">
        The columns add up to <strong>{f(t.debit)}</strong> (debit) and <strong>{f(t.credit)}</strong> (credit). Put the difference to Suspense A/c: how much, and in which column?
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <AnswerField unit="rupee" label="Suspense A/c" value={typed} onChange={setTyped} testId={`${P}-suspense-amount`} disabled={open} onEnter={check} />
        <ChoiceGroup label="In which column?">
          {(['Dr', 'Cr'] as const).map((x) => (
            <ChoiceButton key={x} testId={`${P}-suspense-side-${x}`} chosen={side === x} disabled={open} onClick={() => setSide(x)}>
              {x === 'Dr' ? 'Debit column' : 'Credit column'}
            </ChoiceButton>
          ))}
        </ChoiceGroup>
      </div>
      {!open ? (
        <div className="flex flex-wrap gap-2">
          <Button data-testid={`${P}-suspense-check`} disabled={parseRupees(typed) === null || side === null} onClick={check}>
            Check
          </Button>
          <Button variant="ghost" data-testid={`${P}-suspense-show`} onClick={show}>
            Show me
          </Button>
        </div>
      ) : null}
      <FeedbackBox prefix={`${P}-suspense`} verdict={verdict} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Stage 4: the errors, told as the board gives them, or found by ticking.
// ---------------------------------------------------------------------------------------------------------------

function FindTask({
  c,
  detective,
  onDetective,
  told,
  checks,
  answers,
  onAnswer,
  onTickRest,
  reduced,
}: {
  reduced: boolean;
  c: Case;
  detective: boolean;
  onDetective(d: boolean): void;
  told: CaseError[];
  checks: Check[];
  answers: Record<string, 'ok' | 'wrong'>;
  onAnswer(id: string, a: 'ok' | 'wrong'): void;
  onTickRest(): void;
}) {
  const wrongs = checks.filter((k) => k.letter).length;
  const caught = checks.filter((k) => k.letter && answers[k.id]).length;
  const next = checks.find((k) => !answers[k.id]);
  const list = useRef<HTMLOListElement>(null);
  // The check to answer next stays in sight within its list.
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>('[data-next="true"]');
    if (el && list.current) list.current.scrollTop = Math.max(0, el.offsetTop - list.current.offsetTop - 8);
  }, [next]);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Toggle
        options={[
          { value: 'told', label: 'Told, as the board gives them' },
          { value: 'detective', label: 'Find them yourself' },
        ]}
        value={detective ? 'detective' : 'told'}
        onChange={(v) => onDetective(v === 'detective')}
        label="How the errors are found"
        prefix={`${P}-find`}
        small
      />
      {told.length ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-bold">{detective ? 'Found later from the vouchers (ticking the ledger against the books cannot find these):' : 'These errors were found after the trial balance was drawn up:'}</p>
          <ul data-testid={`${P}-told`} className="flex flex-col gap-1 text-sm">
            {told.map((e) => (
              <li key={e.letter} className="rounded-control bg-sunken px-2 py-1">
                <span className="font-extrabold">{e.tag}</span> {e.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {detective ? (
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-sm">
            Tick each posting against the books: does the ledger agree with the journal{c.book ? ` and the ${c.book.name}` : ''}? Then add up every account again. <span data-testid={`${P}-found-count`} className="font-extrabold">Errors found by ticking: {caught} of {wrongs}.</span>
          </p>
          <ol ref={list} data-testid={`${P}-checks`} className="flex relative max-h-[28rem] min-w-0 flex-col gap-1.5 overflow-y-auto pr-1">
            {checks.map((k, i) => {
              const a = answers[k.id];
              const isNext = k === next;
              const right = a ? (a === 'wrong') === (k.letter !== null) : null;
              return (
                <li key={k.id} data-testid={`${P}-check-${i}`} data-answer={a ?? ''} data-next={isNext ? 'true' : undefined} className={`flex min-w-0 flex-col gap-1 rounded-control border px-2 py-1.5 text-sm ${isNext ? 'border-2 border-primary bg-primary-soft' : a ? 'border-edge bg-surface' : 'border-dashed border-edge text-muted'}`}>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    {a ? (
                      <Arrive from="scale(0.2) rotate(-30deg)" reduced={reduced} className="inline-block">
                        <Badge tone={a === 'wrong' ? 'wrong' : 'ok'} label={a === 'wrong' ? 'marked wrong' : 'ticked as agreeing'}>
                          {a === 'wrong' ? '✗' : '✓'}
                        </Badge>
                      </Arrive>
                    ) : null}
                    <span className="font-bold">{k.says}</span>
                  </div>
                  {isNext || a ? <span>{k.shows}</span> : null}
                  {a ? <span className={right ? 'text-primary-ink' : 'font-bold text-danger-deep'}>{right ? k.why : `Not so. ${k.why}`}</span> : null}
                  {isNext ? (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" data-testid={`${P}-check-${i}-ok`} onClick={() => onAnswer(k.id, 'ok')}>
                        ✓ Agrees
                      </Button>
                      <Button variant="secondary" data-testid={`${P}-check-${i}-wrong`} onClick={() => onAnswer(k.id, 'wrong')}>
                        ✗ Wrong
                      </Button>
                      <Button variant="ghost" data-testid={`${P}-check-show`} onClick={() => onAnswer(k.id, k.letter ? 'wrong' : 'ok')}>
                        Show me
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {next ? (
            <Button variant="ghost" data-testid={`${P}-tick-rest`} onClick={onTickRest} className="self-start">
              Tick the rest for me
            </Button>
          ) : null}
          <p className="text-xs text-muted">A check answered wrongly is still marked with what the ledger really shows; the error it hides counts as found once the check is answered.</p>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Stage 5: the rectifying entry of one error.
// ---------------------------------------------------------------------------------------------------------------

function EntryBuilder({ c, e, onPassed, onNext, last }: { c: Case; e: CaseError; onPassed(): void; onNext(): void; last: boolean }) {
  const [t, setT] = useState<EntryTry>({ dr: null, cr: null, amount: null, narration: null });
  const [typed, setTyped] = useState('');
  const [verdict, setVerdict] = useState<ShownVerdict | null>(null);
  const accounts = useMemo(() => accountChoices(c), [c]);
  const narrations = useMemo(() => narrationChoices(c, e), [c, e]);
  const given: EntryTry = { ...t, amount: parseRupees(typed) };
  const ready = given.dr && given.cr && given.amount !== null && given.narration;
  const check = () => {
    const m = judgeEntry(c, e, given);
    setVerdict({ right: m.right, slip: m.why, reason: m.right ? explainError(c, e) : undefined });
    if (m.right) onPassed();
  };
  const show = () => {
    const r = rightOf(e);
    setT({ dr: r.dr, cr: r.cr, amount: r.amount, narration: e.narration });
    setTyped(String(r.amount / 100));
    setVerdict({ right: true, answer: null, reason: `Shown. ${explainError(c, e)}` });
    onPassed();
  };
  const select = (label: string, value: string | null, onChange: (v: string) => void, testId: string) => (
    <label className="flex min-w-0 flex-col gap-1 text-sm font-bold">
      {label}
      <select value={value ?? ''} data-testid={testId} onChange={(ev) => onChange(ev.target.value)} disabled={verdict?.right} className="min-h-11 w-full min-w-0 rounded-control border-2 border-edge-deep bg-surface px-2 text-base">
        <option value="">Choose an account</option>
        {accounts.map((a) => (
          <option key={a} value={a}>
            {title(a)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-base">
        Pass the rectifying entry for error <strong>{e.tag}</strong> (shown below the task). The trial balance did not agree, and the difference stands in Suspense A/c.
      </p>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        {select('Debit (… A/c Dr)', t.dr, (v) => setT({ ...t, dr: v || null }), `${P}-entry-dr`)}
        {select('Credit (To … A/c)', t.cr, (v) => setT({ ...t, cr: v || null }), `${P}-entry-cr`)}
      </div>
      <AnswerField unit="rupee" label="Amount" value={typed} onChange={setTyped} testId={`${P}-entry-amount`} disabled={verdict?.right} onEnter={() => ready && check()} />
      <ChoiceGroup label="Narration" className="flex flex-col gap-1.5">
        <p className="text-sm font-bold">Narration</p>
        {narrations.map((n, i) => (
          <ChoiceButton key={i} testId={`${P}-entry-narration-${i}`} chosen={t.narration === n} disabled={verdict?.right} onClick={() => setT({ ...t, narration: n })} className="text-sm font-semibold">
            (Being {n})
          </ChoiceButton>
        ))}
      </ChoiceGroup>
      {!verdict?.right ? (
        <div className="flex flex-wrap gap-2">
          <Button data-testid={`${P}-entry-check`} disabled={!ready} onClick={check}>
            Check the entry
          </Button>
          <Button variant="ghost" data-testid={`${P}-entry-show`} onClick={show}>
            Show me
          </Button>
        </div>
      ) : null}
      <FeedbackBox prefix={`${P}-entry`} verdict={verdict} />
      {verdict?.right && !last ? (
        <Button data-testid={`${P}-entry-next`} onClick={onNext} className="self-start">
          Next error
        </Button>
      ) : null}
    </div>
  );
}
