'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { formatINR } from '@/engine/money';
import { applyDeal, cannotPlay, dealById, DEALS, type DealId } from '@/simulator/ratios/deals';
import { CONTROL_GROUPS, EXAMPLES, randomFigures, setFigure } from '@/simulator/ratios/examples';
import { LINE_LABEL, type RatioFigures, type RatioId } from '@/simulator/ratios/model';
import { useVisitSeed } from '../kit/format';
import { SelectField, Toggle } from '../kit/LabControls';
import { Slider } from '../kit/MoneyField';
import { Dials, FocusPanel } from './Dials';
import { Statements } from './Statements';

/** Play: a ready company or a made-up one; change any figure, or play a transaction and see which needles move. */
export function Play({ seed, prefix }: { seed?: number; prefix: string }) {
  const start = useVisitSeed(seed);
  const [picked, setPicked] = useState<string>(EXAMPLES[0].id);
  const [draws, setDraws] = useState(0);
  const [figures, setFigures] = useState<RatioFigures>(EXAMPLES[0].figures);
  const [before, setBefore] = useState<RatioFigures | null>(null);
  const [focus, setFocus] = useState<RatioId>('current');
  const [deal, setDeal] = useState<DealId>('payCreditors');
  const [amount, setAmount] = useState(5000000);
  const [played, setPlayed] = useState<string | null>(null);

  const load = (f: RatioFigures) => {
    setFigures(f);
    setBefore(null);
    setPlayed(null);
  };
  const pick = (id: string) => {
    setPicked(id);
    load(EXAMPLES.find((e) => e.id === id)!.figures);
  };
  const fresh = () => {
    setPicked('new');
    load(randomFigures(start + draws));
    setDraws(draws + 1);
  };
  const d = dealById(deal);
  const problem = cannotPlay(figures, d, amount);
  const playDeal = () => {
    const next = applyDeal(figures, d, amount);
    if (!next) return;
    setBefore(figures);
    setFigures(next);
    setPlayed(`The company ${d.text(amount)}. ${d.note(amount)}`);
  };
  const undo = () => {
    if (!before) return;
    setFigures(before);
    setBefore(null);
    setPlayed(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-card border border-edge bg-surface p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <Toggle options={EXAMPLES.map((e) => ({ value: e.id, label: e.title }))} value={picked} onChange={pick} label="Ready examples" prefix={`${prefix}-example`} small />
          <Button variant="secondary" data-testid={`${prefix}-new`} onClick={fresh}>
            New figures
          </Button>
        </div>
        <p className="text-sm text-muted">
          <span className="font-extrabold text-ink" data-testid={`${prefix}-company`}>
            {figures.company}
          </span>
          . {EXAMPLES.find((e) => e.id === picked)?.point ?? 'Made-up figures; the balance sheet balances.'} Press a dial to see how it is worked out.
        </p>
      </div>

      <section aria-labelledby={`${prefix}-deal-title`} className="flex flex-col gap-3 rounded-card border border-edge bg-surface p-4 shadow-card">
        <h3 id={`${prefix}-deal-title`} className="text-lg font-extrabold">
          Play a transaction
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="What the company does" value={deal} onChange={setDeal} options={DEALS.map((x) => ({ id: x.id, label: x.label }))} testId={`${prefix}-deal`} />
          <Slider
            testId={`${prefix}-amount`}
            label={deal === 'sellGoodsCredit' ? 'Cost of the goods sold (price: cost + 25%)' : 'Amount'}
            value={amount}
            min={1000000}
            max={30000000}
            step={1000000}
            text={formatINR(amount)}
            onChange={setAmount}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button data-testid={`${prefix}-deal-play`} onClick={playDeal} disabled={problem !== null}>
            Play it
          </Button>
          <Button variant="secondary" data-testid={`${prefix}-undo`} onClick={undo} disabled={!before}>
            Undo
          </Button>
          {problem ? <p className="text-sm font-bold text-danger-deep">{problem}</p> : null}
        </div>
        <p className="text-xs text-muted">A profit or loss of a transaction goes to reserves and surplus in full; tax on it is ignored, as the board&apos;s questions on the effect of a transaction take it.</p>
        <div role="status" aria-live="polite" data-testid={`${prefix}-deal-result`} className="text-sm">
          {played}
        </div>
      </section>

      <FocusPanel id={focus} figures={figures} before={before} prefix={prefix} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:items-start">
        <div className="flex flex-col gap-4">
          <Controls figures={figures} onChange={(f) => load(f)} prefix={prefix} />
          <Statements figures={figures} before={before} focus={focus} prefix={prefix} />
        </div>
        <Dials figures={figures} before={before} focus={focus} onFocus={setFocus} prefix={prefix} />
      </div>
    </div>
  );
}

function Controls({ figures, onChange, prefix }: { figures: RatioFigures; onChange(f: RatioFigures): void; prefix: string }) {
  return (
    <section aria-labelledby={`${prefix}-controls-title`} className="flex flex-col gap-2">
      <h3 id={`${prefix}-controls-title`} className="text-lg font-extrabold">
        Change the figures
      </h3>
      <p className="text-sm text-muted">
        Cash and cash equivalents ({formatINR(figures.cash)}) takes up every change of the balance sheet, so that it still balances: more of an asset is paid out of
        cash, more of a liability or of capital brings cash in. The statement of profit and loss does not re-cast the balance sheet.
      </p>
      {CONTROL_GROUPS.map((g, i) => (
        <details key={g.id} open={i === 0} className="rounded-card border border-edge bg-surface shadow-card" data-testid={`${prefix}-group-${g.id}`}>
          <summary className="flex min-h-11 cursor-pointer items-center px-4 text-base font-extrabold">{g.title}</summary>
          <div className="grid gap-x-4 gap-y-1 px-4 pb-3 sm:grid-cols-2">
            {g.figures.map((s) => {
              const v = s.line === 'taxRate' ? figures.taxRate : figures[s.line];
              return (
                <Slider
                  key={s.line}
                  testId={`${prefix}-fig-${s.line}`}
                  label={s.line === 'taxRate' ? 'Tax rate (% of profit before tax)' : LINE_LABEL[s.line]}
                  value={v}
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  text={s.line === 'taxRate' ? `${v}%` : v < 0 ? `−${formatINR(-v)}` : formatINR(v)}
                  onChange={(n) => onChange(setFigure(figures, s.line, n))}
                />
              );
            })}
          </div>
        </details>
      ))}
    </section>
  );
}
