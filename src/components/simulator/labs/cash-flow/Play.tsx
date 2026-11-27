'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { formatINR } from '@/engine/money';
import { EXAMPLES, randomYear } from '@/simulator/cash-flow/examples';
import { figureOf, FIGURE_GROUPS, signedINR, statementOf, withFigure, type CashFlowYear, type FigureKey } from '@/simulator/cash-flow/model';
import { useVisitSeed } from '../kit/format';
import { Toggle } from '../kit/LabControls';
import { Slider } from '../kit/MoneyField';
import { Reservoir } from './Reservoir';
import { StatementView } from './StatementView';
import { scaleOf, YEAR_END } from './Watch';

const SIGNED = new Set<FigureKey>(['npbt', 'overdraftChange']);
const idOf = (key: FigureKey) => key.replace(/:/g, '-');

/** Play: a ready year or a made-up one, every figure on a slider, the statement and the reservoir following at once. */
export function Play({ seed, reduced, prefix }: { seed?: number; reduced: boolean; prefix: string }) {
  const start = useVisitSeed(seed);
  const [picked, setPicked] = useState<string>(EXAMPLES[0].id);
  const [draws, setDraws] = useState(0);
  const [year, setYear] = useState<CashFlowYear>(EXAMPLES[0].year);
  const statement = useMemo(() => statementOf(year), [year]);

  const pick = (id: string) => {
    setPicked(id);
    setYear(EXAMPLES.find((e) => e.id === id)!.year);
  };
  const fresh = () => {
    setPicked('new');
    setYear(randomYear(start + draws));
    setDraws(draws + 1);
  };
  const point = EXAMPLES.find((e) => e.id === picked)?.point;

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
            {year.company}
          </span>
          , not a financing company, for the year ended {YEAR_END}.{point ? ` ${point}` : ''}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:items-start">
        <div className="flex flex-col gap-4">
          <div className="rounded-panel border border-edge bg-canvas p-3 sm:p-4">
            <Reservoir
              opening={year.openingCash}
              nets={{ operating: statement.operating, investing: statement.investing, financing: statement.financing }}
              states={{ operating: 'flowed', investing: 'flowed', financing: 'flowed' }}
              running={null}
              level={statement.closing}
              scaleMax={Math.max(scaleOf(statement, year.openingCash), 1)}
              reduced={reduced}
              prefix={prefix}
            />
            <p className="mt-3 text-sm" data-testid={`${prefix}-summary`}>
              {formatINR(year.openingCash)} at the start {signedINR(statement.operating).replace(/^([+−])/, '$1 ')} operating{' '}
              {signedINR(statement.investing).replace(/^([+−])/, '$1 ')} investing {signedINR(statement.financing).replace(/^([+−])/, '$1 ')} financing ={' '}
              <span className="font-extrabold">{statement.closing < 0 ? `−${formatINR(-statement.closing)}` : formatINR(statement.closing)}</span> at the end.
            </p>
          </div>
          <Controls year={year} onChange={setYear} prefix={prefix} />
        </div>
        <StatementView statement={statement} title={`Cash Flow Statement of ${year.company} for the year ended ${YEAR_END}`} prefix={prefix} />
      </div>
    </div>
  );
}

function Controls({ year, onChange, prefix }: { year: CashFlowYear; onChange(y: CashFlowYear): void; prefix: string }) {
  return (
    <div className="flex flex-col gap-2" aria-label="Change the figures" role="region">
      <h3 className="text-lg font-extrabold">Change the figures</h3>
      {FIGURE_GROUPS.map((g, i) => (
        <details key={g.id} open={i < 2} className="rounded-card border border-edge bg-surface shadow-card" data-testid={`${prefix}-group-${g.id}`}>
          <summary className="flex min-h-11 cursor-pointer items-center px-4 text-base font-extrabold">{g.title}</summary>
          <div className="grid gap-x-4 gap-y-1 px-4 pb-3 sm:grid-cols-2">
            {g.figures.map((f) => {
              const v = figureOf(year, f.key);
              const text = SIGNED.has(f.key) ? (v < 0 ? `−${formatINR(-v)}` : formatINR(v)) : formatINR(v);
              return (
                <Slider
                  key={f.key}
                  testId={`${prefix}-fig-${idOf(f.key)}`}
                  label={f.label}
                  value={v}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  text={text}
                  onChange={(n) => onChange(withFigure(year, f.key, n))}
                />
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}
