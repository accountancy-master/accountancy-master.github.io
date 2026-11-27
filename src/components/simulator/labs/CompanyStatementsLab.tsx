'use client';

import { useMemo, useState } from 'react';
import { GIRNAR } from '@/simulator/company-statements/examples';
import { figured, pcText, periodsOf, titleOf } from '@/simulator/company-statements/sheet';
import { askRng, CS_ASK_KINDS, CS_ASK_LABEL, csAsk, judgeCs, type CsAnswer, type CsAskKind } from '@/simulator/company-statements/tryit';
import { commonSteps, comparativeSteps, linesOf, sortSteps } from '@/simulator/company-statements/walk';
import { useReducedMotion } from '../useReducedMotion';
import { Analysis, type Tool } from './company-statements/Analysis';
import { Board, P } from './company-statements/Board';
import { PlayPanel } from './company-statements/PlayPanel';
import { SheetFormat } from './company-statements/SheetFormat';
import { Toggle, type LabMode } from './kit/LabControls';
import { Intro, LabShell } from './kit/LabShell';
import { PlaybackBar, Stage, StepList, StepNow } from './kit/Playback';
import { TryItCard } from './kit/TryItCard';
import { usePlayback, type Playback } from './kit/usePlayback';
import type { LabProps } from './types';

// ---------------------------------------------------------------------------------------------------------------
// The lab "company-statements" (src/simulator/labs.ts): a company's statements, read. The picture is a sorting
// board in the shape of the Schedule III balance sheet: every balance is a tile that goes to its major head and
// sub-head, the slots add up to the one figure the face shows (with the notes behind it), and the two halves come
// to agree. Then the two tools of analysis on two years: a comparative statement (bars growing or shrinking, the
// change in rupees and as a percentage of the earlier year) and a common size statement (each line as a share of a
// bar of 100). The figures and words all come from src/simulator/company-statements.
// ---------------------------------------------------------------------------------------------------------------

/** The right answer of a question of this lab, as the statements write a percentage. */
const csAnswerText = (a: CsAnswer): string =>
  a.type === 'choice' ? a.options.find((o) => o.id === a.correct)!.text : `${pcText(a.value)}%${a.tag ? ` (${a.tag.options.find((o) => o.id === a.tag!.correct)!.text.toLowerCase()})` : ''}`;

const CONVENTIONS = [
  "The balance sheet is in the form of Schedule III to the Companies Act, 2013 (Division I), as amended from 1 April 2021: \"Property, Plant and Equipment and Intangible Assets\" in four parts, each a line of its own; current maturities of long-term borrowings under Short-term Borrowings; long-term security deposits under Other Non-current Assets. (The NCERT textbook still prints the older form.)",
  "The face shows one figure for each sub-head with the number of its note; the notes list the items. Calls in arrears are deducted in the note on Share Capital; a debit balance of the Statement of Profit and Loss is a negative figure under Reserves and Surplus.",
  "Comparative statement: absolute change = later figure - earlier figure; percentage change = absolute change ÷ the earlier figure × 100. A decrease is shown in brackets; where the earlier figure is nil there is no percentage (a dash).",
  "Common size statement: the Statement of Profit and Loss on revenue from operations = 100 (other income takes total income above 100); the balance sheet on its total = 100, each date on its own base.",
  "Percentages to two decimal places, each rounded on its own (half away from nil), so a column may differ from its total by 0.01. Figures in ₹. Tax is the stated rate of the profit before tax.",
];

export default function CompanyStatementsLab({ seed }: LabProps) {
  const [mode, setMode] = useState<LabMode>('watch');
  const reduced = useReducedMotion();
  return (
    <LabShell prefix={P} mode={mode} onMode={setMode} conventions={CONVENTIONS}>
      {mode === 'watch' ? <Watch reduced={reduced} /> : null}
      {mode === 'play' ? <PlayPanel reduced={reduced} seed={seed} /> : null}
      {mode === 'try' ? <TryIt reduced={reduced} seed={seed} /> : null}
    </LabShell>
  );
}

type WatchPart = 'sort' | Tool;

function Watch({ reduced }: { reduced: boolean }) {
  const [part, setPart] = useState<WatchPart>('sort');
  const [statement, setStatement] = useState<'bs' | 'pl'>('pl');
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Toggle<WatchPart>
          options={[
            { value: 'sort', label: 'Sort the balance sheet' },
            { value: 'comparative', label: 'Comparative statement' },
            { value: 'common', label: 'Common size statement' },
          ]}
          value={part}
          onChange={setPart}
          label="Walk-through"
          prefix={`${P}-example`}
          small
        />
        {part !== 'sort' ? (
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
        ) : null}
      </div>
      <Intro prefix={P}>
        {part === 'sort'
          ? `${GIRNAR.name}, a manufacturer: ${GIRNAR.holdings.length} balances on ${GIRNAR.dates[1]}, sorted onto the Schedule III balance sheet one sub-head at a time.`
          : `${GIRNAR.name}: its ${statement === 'bs' ? `balance sheets as at ${GIRNAR.dates[0]} and ${GIRNAR.dates[1]}` : `Statements of Profit and Loss for ${GIRNAR.pl.years[0]} and ${GIRNAR.pl.years[1]}`}, ${part === 'comparative' ? 'compared line by line' : 'each line as a share of the base'}.`}
      </Intro>
      {part === 'sort' ? <SortWatch reduced={reduced} /> : <AnalysisWatch key={`${part}-${statement}`} tool={part} statement={statement} reduced={reduced} />}
    </div>
  );
}

/** The playback, the told step, its announcement and (below the picture) the list of steps. */
function useTold<S extends { title: string; text: string }>(steps: S[], story: unknown, reduced: boolean) {
  const playback = usePlayback(steps.length, { story, stepMs: reduced ? 1200 : 3000 });
  const now = playback.shown > 0 ? steps[playback.shown - 1] : null;
  return { playback, now };
}

function Told({ playback, now, idle }: { playback: Playback; now: { title: string; text: string } | null; idle: string }) {
  return (
    <StepNow prefix={P} at={playback.shown} count={playback.count} title={now?.title} idle={idle}>
      {now?.text}
    </StepNow>
  );
}

function SortWatch({ reduced }: { reduced: boolean }) {
  const steps = useMemo(() => sortSteps(GIRNAR), []);
  const { playback, now } = useTold(steps, steps, reduced);
  const shown = playback.shown;
  const step = shown > 0 ? steps[shown - 1] : null;
  return (
    <div className="flex flex-col gap-3">
      <PlaybackBar playback={playback} prefix={P} announce={now ? `${now.title}. ${now.text}` : ''} />
      <Told playback={playback} now={now} idle="Press Play, or Step, to sort the balances onto the balance sheet." />
      <Stage prefix={P} label="The sorting board" playback={playback}>
        <Board holdings={GIRNAR.holdings} placed={step?.placed ?? []} focus={step?.sub ?? null} reduced={reduced} />
      </Stage>
      <SheetFormat company={GIRNAR} holdings={GIRNAR.holdings} placed={step?.placed ?? []} />
      <StepList steps={steps} shown={shown} prefix={P} onPick={(i) => playback.seek(i + 1)} />
    </div>
  );
}

function AnalysisWatch({ tool, statement, reduced }: { tool: Tool; statement: 'bs' | 'pl'; reduced: boolean }) {
  const steps = useMemo(() => (tool === 'comparative' ? comparativeSteps(GIRNAR, statement) : commonSteps(GIRNAR, statement)), [tool, statement]);
  const lines = useMemo(() => linesOf(GIRNAR, statement), [statement]);
  const { playback, now } = useTold(steps, steps, reduced);
  const shown = playback.shown;
  const worked = Math.min(shown, figured(lines).length);
  return (
    <div className="flex flex-col gap-3">
      <PlaybackBar playback={playback} prefix={P} announce={now ? `${now.title}. ${now.text}` : ''} />
      <Told playback={playback} now={now} idle={`Press Play, or Step, to work the ${tool === 'comparative' ? 'comparative' : 'common size'} statement line by line.`} />
      <Stage prefix={P} label="The statement" playback={playback}>
        <Analysis lines={lines} periods={periodsOf(GIRNAR, statement)} title={titleOf(GIRNAR, statement, tool)} statement={statement} tool={tool} worked={worked} focus={now?.key ?? null} reduced={reduced} />
      </Stage>
      <StepList steps={steps} shown={shown} prefix={P} onPick={(i) => playback.seek(i + 1)} />
    </div>
  );
}

function TryIt({ reduced, seed }: { reduced: boolean; seed?: number }) {
  const [kind, setKind] = useState<CsAskKind>(CS_ASK_KINDS[0]);
  const [n, setN] = useState(0);
  const [answered, setAnswered] = useState(false);
  const ask = useMemo(() => csAsk(kind, askRng(seed ?? 1, kind, n)), [kind, n, seed]);
  const [current, setCurrent] = useState(ask);
  if (current !== ask) {
    setCurrent(ask);
    setAnswered(false);
  }
  const v = ask.view;
  return (
    <div className="flex flex-col gap-3">
      <Toggle
        options={CS_ASK_KINDS.map((k) => ({ value: k, label: CS_ASK_LABEL[k] }))}
        value={kind}
        onChange={(k) => {
          setKind(k);
          setN(0);
        }}
        label="Kind of question"
        prefix={`${P}-kind`}
        small
      />
      <TryItCard ask={ask} prefix={P} title={CS_ASK_LABEL[kind]} judge={(a, g) => judgeCs(a as CsAnswer, g)} answerText={(a) => csAnswerText(a as CsAnswer)} onAnswered={() => setAnswered(true)} onNext={() => setN((x) => (seed ? x + 1 : x + 1 + (Date.now() % 997)))} />
      <p className="text-sm text-muted">{answered ? 'The picture now shows the answer.' : 'The picture holds the answer back until you check.'}</p>
      <Stage prefix={P} label="The question on the picture" data-answered={answered ? 'true' : 'false'}>
        {v.part === 'sort' ? (
          <Board holdings={[{ id: v.itemId, amount: 0 }]} placed={answered ? [v.itemId] : []} amounts={false} reduced={reduced} />
        ) : (
          <Analysis
            lines={linesOf(v.company, v.statement)}
            periods={periodsOf(v.company, v.statement)}
            title={titleOf(v.company, v.statement, v.part)}
            statement={v.statement}
            tool={v.part}
            worked={Number.MAX_SAFE_INTEGER}
            focus={v.key}
            hidden={answered ? null : { key: v.key, year: v.year }}
            reduced={reduced}
          />
        )}
      </Stage>
    </div>
  );
}
