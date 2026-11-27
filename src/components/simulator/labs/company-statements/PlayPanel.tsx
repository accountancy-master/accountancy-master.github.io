'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { createRng } from '@/engine/rng';
import { COMPANIES_READY, GIRNAR, randomCompany } from '@/simulator/company-statements/examples';
import { ANALYSIS_LABEL, itemById, placeWhy, SUB_ORDER, SUBS, type Sub } from '@/simulator/company-statements/heads';
import { balancedByCash, bsFrom, faceRows, pairsOf, plTwo, problemOfFigures, type Company, type Pair, type PlData } from '@/simulator/company-statements/sheet';
import { Toggle } from '../kit/LabControls';
import { MoneyField } from '../kit/MoneyField';
import { Analysis, type Tool } from './Analysis';
import { Board, P } from './Board';
import { SheetFormat } from './SheetFormat';

// The sandbox: sort a company's balances onto the board yourself, or change the figures of two years and watch the
// comparative and common size statements follow.

type Part = 'sort' | 'analysis';

export function PlayPanel({ reduced, seed }: { reduced: boolean; seed?: number }) {
  const [part, setPart] = useState<Part>('sort');
  return (
    <div className="flex flex-col gap-3">
      <Toggle<Part>
        options={[
          { value: 'sort', label: 'Sort the balance sheet' },
          { value: 'analysis', label: 'Compare two years' },
        ]}
        value={part}
        onChange={setPart}
        label="What to play with"
        prefix={`${P}-play-part`}
      />
      {part === 'sort' ? <SortPlay reduced={reduced} seed={seed} /> : <AnalysisPlay reduced={reduced} seed={seed} />}
    </div>
  );
}

/** A ready company or a made-up one from the seed. */
function useCompany(seed?: number) {
  const [company, setCompany] = useState<Company>(GIRNAR);
  const [preset, setPreset] = useState<string>(GIRNAR.name);
  const [draw, setDraw] = useState(seed ?? 1);
  const fresh = () => {
    const n = seed ? draw + 1 : Date.now() % 1_000_000_007;
    setDraw(n);
    setCompany(randomCompany(createRng(n)));
    setPreset('');
  };
  const pick = (name: string) => {
    setCompany(COMPANIES_READY.find((c) => c.name === name)!);
    setPreset(name);
  };
  const chooser = (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <Toggle options={COMPANIES_READY.map((c) => ({ value: c.name, label: c.name }))} value={preset} onChange={pick} label="Ready companies" prefix={`${P}-preset`} small />
      <Button variant="secondary" data-testid={`${P}-new`} onClick={fresh}>
        New figures
      </Button>
    </div>
  );
  return { company, chooser };
}

function SortPlay({ reduced, seed }: { reduced: boolean; seed?: number }) {
  const { company, chooser } = useCompany(seed);
  const [placed, setPlaced] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [said, setSaid] = useState<{ right: boolean; text: string } | null>(null);
  const [score, setScore] = useState({ right: 0, wrong: 0 });
  const [current, setCurrent] = useState(company);
  if (current !== company) {
    setCurrent(company);
    setPlaced([]);
    setPicked(null);
    setSaid(null);
    setScore({ right: 0, wrong: 0 });
  }
  const place = (id: string, sub: Sub) => {
    if (placed.includes(id)) return;
    const it = itemById(id);
    if (it.sub === sub) {
      setPlaced([...placed, id]);
      setPicked(null);
      setSaid({ right: true, text: `✓ ${it.name}: ${it.note}` });
      setScore((s) => ({ ...s, right: s.right + 1 }));
    } else {
      setPicked(id);
      setSaid({ right: false, text: `✗ Not under ${SUBS[sub].label}. ${placeWhy(it, sub)}` });
      setScore((s) => ({ ...s, wrong: s.wrong + 1 }));
    }
  };
  // "Show me": the next balance in the order of the form goes to its place, with the reason.
  const showMe = () => {
    const next = faceRows(company.holdings).flatMap((r) => r.held.map((h) => h.item.id)).find((id) => !placed.includes(id));
    if (!next) return;
    const it = itemById(next);
    setPlaced([...placed, next]);
    setPicked(null);
    setSaid({ right: true, text: `Shown: ${it.name}. ${it.note}` });
  };
  return (
    <div className="flex flex-col gap-3">
      {chooser}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" data-testid={`${P}-show-me`} onClick={showMe} disabled={placed.length === company.holdings.length}>
          Show me one
        </Button>
        <Button
          variant="secondary"
          data-testid={`${P}-restart`}
          onClick={() => {
            setPlaced([]);
            setPicked(null);
            setSaid(null);
            setScore({ right: 0, wrong: 0 });
          }}
        >
          Start again
        </Button>
        <span data-testid={`${P}-score`} className="text-sm font-bold text-muted">
          Placed {placed.length} of {company.holdings.length} · put right {score.right}, refused {score.wrong} (not recorded)
        </span>
      </div>
      <p role="status" aria-live="polite" data-testid={`${P}-said`} className={`min-h-11 rounded-control px-3 py-2 text-sm font-semibold ${said ? (said.right ? 'bg-primary-soft text-primary-ink' : 'bg-danger-soft text-danger-deep') : 'bg-sunken text-muted'}`}>
        {said ? said.text : `${company.name}: pick a balance from the tray and put it under its sub-head. A wrong place is refused with the reason.`}
      </p>
      <Board holdings={company.holdings} placed={placed} reduced={reduced} picked={picked} onPick={(id) => setPicked(picked === id ? null : id)} onPlace={place} />
      <SheetFormat company={company} holdings={company.holdings} placed={placed} />
    </div>
  );
}

interface Figures {
  name: string;
  dates: [string, string];
  pairs: Partial<Record<Sub, Pair>>;
  pl: PlData;
}
const figuresOf = (c: Company): Figures => ({ name: c.name, dates: c.dates, pairs: pairsOf(c), pl: c.pl });

function AnalysisPlay({ reduced, seed }: { reduced: boolean; seed?: number }) {
  const { company, chooser } = useCompany(seed);
  const [statement, setStatement] = useState<'bs' | 'pl'>('pl');
  const [tool, setTool] = useState<Tool>('comparative');
  const [typed, setTyped] = useState<Figures>(() => figuresOf(company));
  const [good, setGood] = useState<Figures>(() => figuresOf(company));
  const [current, setCurrent] = useState(company);
  if (current !== company) {
    setCurrent(company);
    setTyped(figuresOf(company));
    setGood(figuresOf(company));
  }
  const problem = problemOfFigures(typed.pairs, typed.pl);
  const change = (next: Figures) => {
    const balanced = { ...next, pairs: balancedByCash(next.pairs) };
    setTyped(balanced);
    if (!problemOfFigures(balanced.pairs, balanced.pl)) setGood(balanced);
  };
  const lines = useMemo(() => (statement === 'bs' ? bsFrom(good.pairs) : plTwo(good.pl)), [good, statement]);
  const periods = statement === 'bs' ? good.dates : good.pl.years;
  const title = `${tool === 'comparative' ? 'Comparative' : 'Common Size'} ${statement === 'bs' ? `Balance Sheet of ${good.name} as at ${periods[0]} and ${periods[1]}` : `Statement of Profit and Loss of ${good.name} for the years ${periods[0]} and ${periods[1]}`}`;
  const setPair = (v: Pair, k: 0 | 1, p: number): Pair => (k === 0 ? [p, v[1]] : [v[0], p]);
  const field = (label: string, v: Pair, on: (p: Pair) => void, testId: string) => (
    <div key={testId} className="grid min-w-0 grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <span className="text-sm font-bold">{label}</span>
      {([0, 1] as const).map((k) => (
        <MoneyField key={k} label={periods[k]} value={v[k]} onChange={(p) => on(setPair(v, k, p))} max={100000000} testId={`${testId}-${k}`} />
      ))}
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      {chooser}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Toggle<'bs' | 'pl'>
          options={[
            { value: 'pl', label: 'Statement of Profit and Loss' },
            { value: 'bs', label: 'Balance sheet' },
          ]}
          value={statement}
          onChange={setStatement}
          label="Statement"
          prefix={`${P}-statement`}
          small
        />
        <Toggle<Tool>
          options={[
            { value: 'comparative', label: 'Comparative' },
            { value: 'common', label: 'Common size' },
          ]}
          value={tool}
          onChange={setTool}
          label="Tool"
          prefix={`${P}-tool`}
          small
        />
      </div>
      <details className="rounded-card border border-edge bg-surface p-3 shadow-card" open>
        <summary className="min-h-11 cursor-pointer py-2 text-base font-extrabold">Change the figures</summary>
        <fieldset data-testid={`${P}-inputs`} className="flex min-w-0 flex-col gap-3">
          <legend className="sr-only">The figures of the two periods</legend>
          {statement === 'pl' ? (
            <>
              {field('Revenue from operations', typed.pl.rev, (v) => change({ ...typed, pl: { ...typed.pl, rev: v } }), `${P}-in-rev`)}
              {field('Other income', typed.pl.oi, (v) => change({ ...typed, pl: { ...typed.pl, oi: v } }), `${P}-in-oi`)}
              {typed.pl.exp.map((e, i) => field(e.name, e.v, (v) => change({ ...typed, pl: { ...typed.pl, exp: typed.pl.exp.map((x, j) => (j === i ? { ...x, v } : x)) } }), `${P}-in-exp${i}`))}
              <p className="text-xs text-muted">Tax is {typed.pl.rate}% of the profit before tax of each year.</p>
            </>
          ) : (
            <>
              {SUB_ORDER.filter((s) => typed.pairs[s] && s !== 'cash').map((s) => field(ANALYSIS_LABEL[s], typed.pairs[s]!, (v) => change({ ...typed, pairs: { ...typed.pairs, [s]: v } }), `${P}-in-${s}`))}
              <p className="text-xs text-muted">Cash and cash equivalents is the balancing figure of each date, so that the balance sheet still balances.</p>
            </>
          )}
          {problem ? (
            <p role="alert" data-testid={`${P}-problem`} className="rounded-control bg-danger-soft px-3 py-2 text-sm font-semibold text-danger-deep">
              {problem} The statements still show the last figures that worked.
            </p>
          ) : null}
        </fieldset>
      </details>
      <Analysis lines={lines} periods={periods} title={title} statement={statement} tool={tool} worked={Number.MAX_SAFE_INTEGER} reduced={reduced} />
    </div>
  );
}
