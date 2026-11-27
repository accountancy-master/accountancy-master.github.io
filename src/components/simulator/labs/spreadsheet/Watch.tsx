'use client';

import { useMemo, useRef, useState } from 'react';
import { addressOf, cellsOf, parseAddress, type CellRef } from '@/simulator/spreadsheet/address';
import { chartData } from '@/simulator/spreadsheet/chart';
import { computeSheet } from '@/simulator/spreadsheet/sheet';
import { walkOf, WORKBOOKS, workbookOf, type WorkbookId } from '@/simulator/spreadsheet/workbooks';
import { useFlights, type Flight } from '../kit/flights';
import { SelectField, Toggle } from '../kit/LabControls';
import { Card, Intro } from '../kit/LabShell';
import { PlaybackBar, Stage, StepList, StepNow } from '../kit/Playback';
import { usePlayback } from '../kit/usePlayback';
import { ChartView } from './Chart';
import { CopyCard, FormulaBar, highlightsOf, Reading } from './Formula';
import { Grid } from './Grid';

/**
 * Watch: a ready workbook built step by step. Each step types a formula into a cell, or copies one down or across
 * (the copies fly from the cell copied to each cell they land in, with the formula each becomes), and says what it
 * gives and why. The grid can be walked with the arrows at any step, and the formula bar reads the cell.
 */
export function Watch({ prefix, reduced }: { prefix: string; reduced: boolean }) {
  const [id, setId] = useState<WorkbookId>('brs');
  const wb = workbookOf(id);
  const frames = useMemo(() => walkOf(wb), [wb]);
  const playback = usePlayback(frames.length, { story: wb, stepMs: reduced ? 1800 : 3600 });
  const { shown, advanced } = playback;
  const frame = shown > 0 ? frames[shown - 1] : null;
  const cells = frame?.cells ?? wb.given;
  const computed = useMemo(() => computeSheet(cells), [cells]);
  const [formulas, setFormulas] = useState<'values' | 'formulas'>('values');

  // The cell in the formula bar: the step's own, until the learner walks the grid with the arrows.
  const [picked, setPicked] = useState<{ at: CellRef; step: number; wb: string } | null>(null);
  const stepCell = parseAddress(frame?.active ?? 'A1')!;
  const active = picked && picked.step === shown && picked.wb === wb.id ? picked.at : stepCell;
  const addr = addressOf(active.col, active.row);
  const formula = computed.get(addr)?.formula;

  const root = useRef<HTMLDivElement>(null);
  const flightsOf = (i: number): Flight[] => {
    const f = frames[i];
    if (!f.copy) return [];
    const { from, to } = f.copy;
    return cellsOf(to)
      .slice(0, 6)
      .map((c) => {
        const source = addressOf(from.left + ((c.col - to.left) % (from.right - from.left + 1)), from.top + ((c.row - to.top) % (from.bottom - from.top + 1)));
        const target = addressOf(c.col, c.row);
        return { from: `cell-${source}`, to: `cell-${target}`, text: f.cells[target]?.input ?? '' };
      });
  };
  useFlights(root, advanced, shown, flightsOf, reduced);
  const fresh = frame && advanced === shown - 1 ? frame.changed : [];
  const chart = frame?.chart;

  return (
    <div className="flex flex-col gap-3">
      <SelectField label="Workbook" testId={`${prefix}-workbook`} value={id} onChange={(v) => setId(v)} options={WORKBOOKS.map((w) => ({ id: w.id as WorkbookId, label: w.title }))} className="sm:max-w-sm" />
      <Intro prefix={prefix}>{wb.about}</Intro>
      <PlaybackBar playback={playback} prefix={prefix} announce={frame ? `${frame.title}. ${frame.text}` : ''} />
      <StepNow prefix={prefix} at={shown} count={frames.length} title={frame?.title} idle="Press Play, or Step, to build the sheet one formula at a time.">
        {frame?.text}
      </StepNow>
      <Stage prefix={prefix} label={`The sheet: ${wb.heading}`} playback={playback}>
        <div ref={root} className="relative flex min-w-0 flex-col gap-2 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-extrabold">{wb.heading}</p>
            <Toggle
              options={[
                { value: 'values', label: 'Values' },
                { value: 'formulas', label: 'Formulas' },
              ]}
              value={formulas}
              onChange={setFormulas}
              label="Show in the cells"
              prefix={`${prefix}-show`}
              small
            />
          </div>
          <FormulaBar prefix={prefix} name={addr} value={cells[addr]?.input ?? ''} editable={false} />
          <Reading prefix={prefix} addr={addr} cells={cells} computed={computed} />
          <Grid
            prefix={prefix}
            label={`${wb.heading}. Use the arrow keys to move between cells.`}
            cols={wb.cols}
            rows={wb.rows}
            widths={wb.widths}
            cells={cells}
            computed={computed}
            formulas={formulas === 'formulas'}
            active={active}
            selection={frame?.copy ? frame.copy.to : null}
            highlights={highlightsOf(formula)}
            fresh={fresh}
            reduced={reduced}
            onPick={(at) => setPicked({ at, step: shown, wb: wb.id })}
          />
        </div>
      </Stage>
      {frame?.copy ? <CopyCard prefix={prefix} cells={frame.cells} from={frame.copy.from} to={frame.copy.to} /> : null}
      {chart ? (
        <Card title="The chart" testId={`${prefix}-chart-card`}>
          <ChartView prefix={prefix} kind={chart.kind} title={chart.title} data={chartData(chart, cells, computed)} />
          <p className="text-xs text-muted">
            Drawn from the names in {chart.labels} and the figures in {chart.values}.
          </p>
        </Card>
      ) : null}
      <StepList steps={frames} shown={shown} prefix={prefix} onPick={(i) => playback.seek(i + 1)} />
    </div>
  );
}
