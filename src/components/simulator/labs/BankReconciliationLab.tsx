'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { formatINR } from '@/engine/money';
import { createRng } from '@/engine/rng';
import {
  BOOK_NAME,
  cashBookOf,
  factsOf,
  KINDS,
  passBookOf,
  ruleOf,
  statementOf,
  treatmentOf,
  type Book,
  type KindId,
  type Scenario,
} from '@/simulator/bank-reconciliation/books';
import { EXAMPLES, makeItem, randomScenario } from '@/simulator/bank-reconciliation/examples';
import { stepsOf } from '@/simulator/bank-reconciliation/story';
import { askRng, BRS_ASK_KINDS, BRS_ASK_LABEL, brsAsk, type BrsAskKind } from '@/simulator/bank-reconciliation/tryit';
import { useReducedMotion } from '../useReducedMotion';
import type { CardState } from './bank-reconciliation/MonthCards';
import { lettersOf, Picture } from './bank-reconciliation/Picture';
import type { Layout } from './bank-reconciliation/StatementView';
import { Toggle, type LabMode } from './kit/LabControls';
import { Intro, LabShell } from './kit/LabShell';
import { PlaybackBar, Stage, StepList, StepNow } from './kit/Playback';
import { MoneyField } from './kit/MoneyField';
import { TryItCard } from './kit/TryItCard';
import { usePlayback } from './kit/usePlayback';
import type { LabProps } from './types';

// ---------------------------------------------------------------------------------------------------------------
// The lab "bank-reconciliation" (src/simulator/labs.ts): one bank account, two records of it. The Cash Book and
// the Pass Book are written up side by side from the month's events; the items in only one of them are cards on a
// timeline; carried into the statement one by one (Add or Less), they move the balance along a line from one book's
// figure to the other's. The figures and words all come from src/simulator/bank-reconciliation.
// ---------------------------------------------------------------------------------------------------------------

const P = 'lab-bank-reconciliation';
const inr = formatINR;

const LAYOUTS = [
  { value: 'addless' as const, label: 'Add and Less' },
  { value: 'plusminus' as const, label: 'Plus and Minus columns' },
];

const CONVENTIONS = [
  "Money in the bank is a debit balance in the Cash Book and a credit balance in the Pass Book; an overdraft is the reverse.",
  "Both books agreed on the first of the month; every difference comes from an item of the month.",
  "Ask of every item: does it make the other book's balance more favourable or less? From a favourable balance, more favourable is Add; from an overdraft it is Less.",
  "Only what the bank recorded first and the firm's own errors go into the amended cash book; cheques not yet presented or cleared, and the bank's errors, stay in the statement.",
  "On an account run as an overdraft the bank charges interest on it instead of crediting interest.",
  "Figures in ₹.",
];

export default function BankReconciliationLab({ seed }: LabProps) {
  const [mode, setMode] = useState<LabMode>('watch');
  const [layout, setLayout] = useState<Layout>('addless');
  const reduced = useReducedMotion();
  return (
    <LabShell
      prefix={P}
      mode={mode}
      onMode={setMode}
      conventions={CONVENTIONS}
      settings={<Toggle options={LAYOUTS} value={layout} onChange={setLayout} label="How the statement is set out" prefix={`${P}-layout`} small showLabel />}
    >
      {mode === 'watch' ? <Watch reduced={reduced} layout={layout} /> : null}
      {mode === 'play' ? <Play reduced={reduced} layout={layout} seed={seed} /> : null}
      {mode === 'try' ? <TryIt reduced={reduced} layout={layout} seed={seed} /> : null}
    </LabShell>
  );
}

function Watch({ reduced, layout }: { reduced: boolean; layout: Layout }) {
  const [id, setId] = useState(EXAMPLES[0].id);
  const ex = EXAMPLES.find((e) => e.id === id)!;
  const steps = useMemo(() => stepsOf(ex.scenario, ex.from, ex.amended), [ex]);
  const playback = usePlayback(steps.length, { story: ex, stepMs: reduced ? 1500 : 3600 });
  const { shown } = playback;
  const now = shown > 0 ? steps[shown - 1] : null;
  const s = ex.scenario;
  const letters = lettersOf(s);
  const stepTitle = (x: (typeof steps)[number]) => (x.kind === 'intro' ? 'Two books' : x.kind === 'done' ? 'Reconciled' : `${x.kind === 'amend' ? 'Enter' : 'Carry'} ${letters.get(x.item!)}`);
  return (
    <div className="flex flex-col gap-3">
      <Toggle options={EXAMPLES.map((e) => ({ value: e.id, label: e.title }))} value={id} onChange={setId} label="Example" prefix={`${P}-example`} small />
      <Intro prefix={P}>
        {s.firm}, {s.month} {s.year}. The statement starts from the {BOOK_NAME[ex.from]}
        {ex.amended ? ', once the cash book is amended' : ''}.
      </Intro>
      <PlaybackBar playback={playback} prefix={P} announce={now?.text ?? ''} />
      <StepNow prefix={P} at={shown} count={playback.count} title={now ? stepTitle(now) : undefined} idle="Press Play, or Step, to compare the two books and carry each difference into the statement.">
        {now?.text}
      </StepNow>
      <Stage prefix={P} label="The two books" playback={playback}>
        <Picture
          s={s}
          from={ex.from}
          amended={ex.amended}
          carried={now?.carried ?? []}
          entered={now?.entered ?? []}
          lit={new Set(now?.item ? [now.item] : [])}
          layout={layout}
          reduced={reduced}
          showWhy="lit"
          statement={shown > 0}
        />
      </Stage>
      <StepList steps={steps.map((x) => ({ title: stepTitle(x), text: x.text }))} shown={shown} prefix={P} onPick={(i) => playback.seek(i + 1)} />
    </div>
  );
}

/** Kinds the sandbox can add, with their names. */
const KIND_NAME: Record<KindId, string> = {
  issued: 'Cheque issued, not yet presented',
  deposited: 'Cheque deposited, not yet credited',
  charges: 'Bank charges',
  interest: 'Interest (credited, or charged on an overdraft)',
  direct: 'Direct deposit by a customer',
  dishonoured: 'Cheque dishonoured',
  standing: 'Payment on standing instruction',
  cbError: 'Cheque entered wrongly in the cash book',
  bankError: 'Wrong debit by the bank',
};

function Play({ reduced, layout, seed }: { reduced: boolean; layout: Layout; seed?: number }) {
  const [s, setS] = useState<Scenario>(EXAMPLES[0].scenario);
  const [from, setFrom] = useState<Book>('cb');
  const [amended, setAmended] = useState(false);
  const [preset, setPreset] = useState(EXAMPLES[0].id);
  const [draw, setDraw] = useState(seed ?? 1);
  const [carried, setCarried] = useState<string[]>([]);
  const [wrong, setWrong] = useState<Record<string, CardState>>({});
  const [adding, setAdding] = useState<KindId>('charges');

  const reset = () => {
    setCarried([]);
    setWrong({});
  };
  const edit = (next: Scenario) => {
    setS(next);
    setPreset('');
    reset();
  };
  const load = (id: string) => {
    const ex = EXAMPLES.find((e) => e.id === id)!;
    setS(ex.scenario);
    setFrom(ex.from);
    setAmended(ex.amended);
    setPreset(id);
    reset();
  };
  const fresh = () => {
    const n = seed ? draw + 1 : Date.now() % 1_000_000_007;
    setDraw(n);
    setS(randomScenario(createRng(n)));
    setPreset('');
    reset();
  };

  const st = statementOf(s, from, amended);
  const entered = amended ? s.items.filter((i) => factsOf(i, s).enter).map((i) => i.id) : [];
  const toCarry = [...st.adds, ...st.lesses].map((l) => l.item.id);
  const carry = (id: string, how: 'add' | 'less') => {
    const item = s.items.find((i) => i.id === id)!;
    const right = treatmentOf(from, st.start, item, s);
    if (how === right) {
      setCarried((c) => [...c, id]);
      setWrong((w) => ({ ...w, [id]: {} }));
    } else {
      setWrong((w) => ({ ...w, [id]: { wrong: `Not ${how === 'add' ? 'Add' : 'Less'}. ${ruleOf(from, st.start, item, s)}` } }));
    }
  };
  const left = toCarry.filter((id) => !carried.includes(id));
  const opening = s.opening;
  const missing = KINDS.filter((k) => !s.items.some((i) => i.kind === k));

  const controls = (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" data-testid={`${P}-carry-rest`} disabled={left.length === 0} onClick={() => setCarried(toCarry)}>
        Carry the rest for me
      </Button>
      <Button variant="ghost" data-testid={`${P}-restart`} disabled={carried.length === 0} onClick={reset}>
        Start the statement again
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Toggle options={EXAMPLES.map((e) => ({ value: e.id, label: e.title }))} value={preset} onChange={load} label="Ready examples" prefix={`${P}-preset`} small />
        <Button variant="secondary" data-testid={`${P}-new`} onClick={fresh}>
          New figures
        </Button>
      </div>
      <fieldset data-testid={`${P}-inputs`} className="flex min-w-0 flex-col gap-3 rounded-card border border-edge bg-surface p-3 shadow-card sm:p-4">
        <legend className="sr-only">The month and the statement</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-bold">Start the statement from</p>
            <Toggle options={[{ value: 'cb' as const, label: 'Cash Book' }, { value: 'pb' as const, label: 'Pass Book' }]} value={from} onChange={(v) => { setFrom(v); reset(); }} label="Start from" prefix={`${P}-from`} small />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-bold">Amend the cash book first?</p>
            <Toggle options={[{ value: 'no' as const, label: 'No' }, { value: 'yes' as const, label: 'Yes, amend it first' }]} value={amended ? 'yes' : 'no'} onChange={(v) => { setAmended(v === 'yes'); reset(); }} label="Amend the cash book first" prefix={`${P}-amend`} small />
          </div>
          <MoneyField label={`Balance on 1 ${s.month}, in both books`} value={Math.abs(opening)} onChange={(p) => edit({ ...s, opening: opening < 0 ? -p : p })} max={10000000} testId={`${P}-in-opening`} />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-bold">That opening balance is</p>
            <Toggle options={[{ value: 'fav' as const, label: 'Favourable' }, { value: 'od' as const, label: 'An overdraft' }]} value={opening < 0 ? 'od' : 'fav'} onChange={(v) => edit({ ...s, opening: v === 'od' ? -Math.abs(opening) : Math.abs(opening) })} label="Nature of the opening balance" prefix={`${P}-in-nature`} small />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold">The items of the month</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {[...s.items].sort((a, b) => a.day - b.day).map((i) => (
              <li key={i.id} className="flex items-end gap-2">
                <MoneyField label={`${i.day} ${s.month.slice(0, 3)}: ${factsOf(i, s).title}`} value={i.amount} min={1} max={1000000} onChange={(p) => edit({ ...s, items: s.items.map((x) => (x.id === i.id ? { ...x, amount: p } : x)) })} testId={`${P}-in-item-${i.id}`} />
                <Button variant="ghost" aria-label={`Take out ${factsOf(i, s).title}`} data-testid={`${P}-in-remove-${i.id}`} disabled={s.items.length <= 1} onClick={() => edit({ ...s, items: s.items.filter((x) => x.id !== i.id) })}>
                  ✕
                </Button>
              </li>
            ))}
          </ul>
          {missing.length > 0 ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="flex min-w-0 flex-col gap-1 text-sm font-bold">
                Add an item
                <select data-testid={`${P}-in-kind`} value={missing.includes(adding) ? adding : missing[0]} onChange={(e) => setAdding(e.target.value as KindId)} className="min-h-11 w-full min-w-0 rounded-control border-2 border-edge-deep bg-surface px-2 text-base">
                  {missing.map((k) => (
                    <option key={k} value={k}>
                      {KIND_NAME[k]}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="secondary"
                data-testid={`${P}-in-add`}
                onClick={() => {
                  const kind = missing.includes(adding) ? adding : missing[0];
                  const id = `n${s.items.length}${kind}`;
                  edit({ ...s, items: [...s.items, makeItem(createRng(s.items.length * 31 + KINDS.indexOf(kind)), kind, id, s.lastDay, 'Bose Brothers')] });
                }}
              >
                Add it
              </Button>
            </div>
          ) : null}
        </div>
      </fieldset>
      <p data-testid={`${P}-goal`} className="text-base">
        Carry every card into the statement with <strong>Add</strong> or <strong>Less</strong>, from the {amended && from === 'cb' ? 'amended ' : ''}
        {BOOK_NAME[from]} balance of {inr(Math.abs(st.start))} {st.start < 0 ? '(overdraft)' : '(favourable)'}, until it reaches the {amended && from === 'pb' ? 'amended ' : ''}
        {BOOK_NAME[from === 'cb' ? 'pb' : 'cb']} balance. {left.length === 0 ? '✓ Reconciled.' : `${left.length} to go.`}
      </p>
      <Picture
        s={s}
        from={from}
        amended={amended}
        carried={carried}
        entered={entered}
        lit={new Set<string>()}
        layout={layout}
        reduced={reduced}
        states={wrong}
        onCarry={carry}
        showWhy="done"
        aboveStatement={controls}
      />
    </div>
  );
}

function TryIt({ reduced, layout, seed }: { reduced: boolean; layout: Layout; seed?: number }) {
  const [kind, setKind] = useState<BrsAskKind>(BRS_ASK_KINDS[0]);
  const [n, setN] = useState(0);
  const [answered, setAnswered] = useState(false);
  const ask = useMemo(() => brsAsk(kind, askRng(seed ?? 1, kind, n)), [kind, n, seed]);
  const [current, setCurrent] = useState(ask);
  if (current !== ask) {
    setCurrent(ask);
    setAnswered(false);
  }
  const statementKind = kind === 'add-or-less' || kind === 'balance-after';
  const books = { cb: cashBookOf(ask.scenario).balance, pb: passBookOf(ask.scenario).balance };
  return (
    <div className="flex flex-col gap-3">
      <Toggle options={BRS_ASK_KINDS.map((k) => ({ value: k, label: BRS_ASK_LABEL[k] }))} value={kind} onChange={(k) => { setKind(k); setN(0); }} label="Kind of question" prefix={`${P}-kind`} small />
      <TryItCard ask={ask} prefix={P} title={BRS_ASK_LABEL[kind]} onAnswered={() => setAnswered(true)} onNext={() => setN((x) => (seed ? x + 1 : x + 1 + (Date.now() % 997)))} />
      <p className="text-sm text-muted">
        {answered ? 'The picture shows the answer: the card is carried and its reason given.' : `The card the question is about is lit. The Cash Book shows ${inr(Math.abs(books.cb))}, the Pass Book ${inr(Math.abs(books.pb))}.`}
      </p>
      <Picture
        s={ask.scenario}
        from={ask.from}
        amended={false}
        carried={answered && statementKind ? ask.items : []}
        entered={[]}
        lit={new Set(ask.items)}
        layout={layout}
        reduced={reduced}
        showWhy={answered ? 'lit' : 'none'}
        causes={answered}
        statement={statementKind}
      />
    </div>
  );
}
