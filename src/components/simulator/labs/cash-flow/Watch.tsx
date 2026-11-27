'use client';

import { useMemo } from 'react';
import { formatINR } from '@/engine/money';
import { WATCH_EXAMPLE } from '@/simulator/cash-flow/examples';
import { reservoirLevel, statementOf, type Statement } from '@/simulator/cash-flow/model';
import { partsDone, rowsShown, stepsOf, stepWords } from '@/simulator/cash-flow/steps';
import { Intro } from '../kit/LabShell';
import { PlaybackBar, Stage, StepNow } from '../kit/Playback';
import { usePlayback } from '../kit/usePlayback';
import { Reservoir, type PipeState } from './Reservoir';
import { StatementView } from './StatementView';

const PARTS = ['operating', 'investing', 'financing'] as const;
export const YEAR_END = '31 March 2026';

/** The highest the reservoir stands at any point of the year, with room above: the figure a full reservoir means. */
export function scaleOf(s: Statement, opening: number): number {
  const levels = [opening, opening + s.operating, opening + s.operating + s.investing, s.closing];
  return Math.max(1, ...levels) * 1.2;
}

/** Watch: the year of a ready company written into the statement step by step, the reservoir filling as each part ends. */
export function Watch({ reduced, prefix }: { reduced: boolean; prefix: string }) {
  const year = WATCH_EXAMPLE.year;
  const statement = useMemo(() => statementOf(year), [year]);
  const steps = useMemo(() => stepsOf(statement), [statement]);
  const play = usePlayback(steps.length, { story: steps, stepMs: 3200 });
  const shown = play.shown;
  const visible = rowsShown(statement, steps, shown);
  const done = partsDone(steps, shown);
  const now = shown > 0 ? steps[shown - 1] : null;
  const nowRow = now ? statement.rows.find((r) => r.id === now.rowId)! : null;
  const states = Object.fromEntries(
    PARTS.map((p) => [p, done[p] ? 'flowed' : now && now.section === p ? 'working' : 'waiting']),
  ) as Record<(typeof PARTS)[number], PipeState>;
  const working = now && now.section !== 'cash' && !done[now.section] ? nowRow!.to : null;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:items-start">
      <div className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-4">
        <Intro prefix={prefix}>
          <span className="font-extrabold">{year.company}</span>, a company that is not a financing company, for the year ended {YEAR_END}. {WATCH_EXAMPLE.point}
        </Intro>
        <PlaybackBar playback={play} prefix={prefix} announce={now ? stepWords(now) : ''} />
        <StepNow
          prefix={prefix}
          at={shown}
          count={steps.length}
          idle={`The reservoir holds the cash and cash equivalents at the start of the year, ${formatINR(year.openingCash)}. Press Play to write the year into the Cash Flow Statement: first the operating activities, starting from the profit, then investing, then financing.`}
        >
          {now ? (
            <>
              <p className="font-extrabold" data-testid={`${prefix}-step-headline`}>
                {now.headline}
              </p>
              <p>{now.why}</p>
            </>
          ) : null}
        </StepNow>
        <Stage prefix={prefix} label="The reservoir of cash" playback={play}>
          <Reservoir
            opening={year.openingCash}
            nets={{ operating: statement.operating, investing: statement.investing, financing: statement.financing }}
            states={states}
            running={working}
            level={reservoirLevel(statement, year.openingCash, done)}
            scaleMax={scaleOf(statement, year.openingCash)}
            reduced={reduced}
            prefix={prefix}
          />
        </Stage>
      </div>
      <StatementView
        statement={statement}
        title={`Cash Flow Statement of ${year.company} for the year ended ${YEAR_END}`}
        visible={visible}
        current={now?.rowId ?? null}
        prefix={prefix}
      />
    </div>
  );
}
