'use client';

import { useMemo, useState } from 'react';
import { parseAddress } from '@/simulator/spreadsheet/address';
import { computeSheet } from '@/simulator/spreadsheet/sheet';
import { answerText, askRng, judgeFigure, parseFigure, sheetAsk, SHEET_ASK_KINDS, SHEET_ASK_LABEL, type SheetAskKind, type SheetVerdict } from '@/simulator/spreadsheet/tryit';
import { Toggle } from '../kit/LabControls';
import { Stage } from '../kit/Playback';
import { AnswerField, ChoiceButton, ChoiceGroup, TryCard, useScore } from '../kit/TryIt';
import { useVisitSeed } from '../kit/format';
import { FormulaBar, FormulaText, highlightsOf, Reading } from './Formula';
import { Grid } from './Grid';

/**
 * Try it: a question on a small sheet, answered at once with the reason. The sheet stands as the question has it
 * (the cell asked about showing "?"), and once answered shows the answer: the value, the copied formula in place, or
 * the formula mended and its column put right.
 */
export function TryIt({ prefix, reduced, seed }: { prefix: string; reduced: boolean; seed?: number }) {
  const start = useVisitSeed(seed);
  const [kind, setKind] = useState<SheetAskKind>('value');
  const [n, setN] = useState(0);
  const ask = useMemo(() => sheetAsk(kind, askRng(start, kind, n)), [kind, n, start]);
  const [typed, setTyped] = useState('');
  const [choice, setChoice] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<SheetVerdict | null>(null);
  const [score, count] = useScore();
  const [current, setCurrent] = useState(ask);
  if (current !== ask) {
    setCurrent(ask);
    setTyped('');
    setChoice(null);
    setVerdict(null);
  }
  const a = ask.answer;
  const answered = verdict !== null;
  const ready = a.type === 'figure' ? parseFigure(typed) !== null : choice !== null;
  const check = () => {
    if (!ready || answered) return;
    let v: SheetVerdict;
    if (a.type === 'figure') v = judgeFigure(a, typed);
    else if (a.type === 'choice') v = { right: choice === a.correct, why: choice === a.correct ? null : (a.options.find((o) => o.id === choice)?.why ?? null) };
    else v = { right: choice === a.correct, why: choice === a.correct ? null : (a.whys[choice!] ?? null) };
    setVerdict(v);
    count(v.right);
  };
  const markOf = (right: boolean, on: boolean) => (!answered ? null : right ? 'right' : on ? 'wrong' : null);

  const sheet = answered && ask.after ? ask.after : ask.sheet;
  const computed = useMemo(() => computeSheet(sheet.cells), [sheet]);
  const focus = parseAddress(ask.focus)!;
  const hidden = ask.hide && !answered ? [ask.focus] : [];
  const formula = sheet.cells[ask.focus]?.input;

  let answer;
  if (a.type === 'figure') {
    answer = (
      <AnswerField
        unit={a.unit === 'rupee' ? 'rupee' : 'plain'}
        label={a.unit === 'rupee' ? 'What C2 shows, in rupees' : 'What C2 shows'}
        placeholder={a.unit === 'rupee' ? 'such as 12,500' : 'such as 1.25'}
        value={typed}
        onChange={setTyped}
        testId={`${prefix}-try-answer`}
        disabled={answered}
        onEnter={check}
        problem={!answered && typed.trim() !== '' && parseFigure(typed) === null ? 'Type a figure, such as 12,500 or 1.25.' : null}
      />
    );
  } else if (a.type === 'choice') {
    answer = (
      <ChoiceGroup label="Pick one" className="flex flex-col gap-2">
        {a.options.map((o) => (
          <ChoiceButton key={o.id} testId={`${prefix}-try-option-${o.id}`} chosen={choice === o.id} mark={markOf(o.id === a.correct, choice === o.id)} disabled={answered} onClick={() => setChoice(o.id)}>
            <FormulaText formula={o.text} />
          </ChoiceButton>
        ))}
      </ChoiceGroup>
    );
  } else {
    answer = (
      <ChoiceGroup label="The formula: tap the reference that is wrong" className="flex flex-wrap items-center gap-1 font-mono text-lg font-bold">
        {a.parts.map((p, i) =>
          'id' in p ? (
            <ChoiceButton key={i} testId={`${prefix}-try-ref-${p.id}`} chosen={choice === p.id} mark={markOf(p.id === a.correct, choice === p.id)} disabled={answered} onClick={() => setChoice(p.id)} className="px-2 font-mono">
              {p.text}
            </ChoiceButton>
          ) : (
            <span key={i} aria-hidden="true" className="px-0.5">
              {p.text}
            </span>
          ),
        )}
      </ChoiceGroup>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Toggle
        options={SHEET_ASK_KINDS.map((k) => ({ value: k, label: SHEET_ASK_LABEL[k] }))}
        value={kind}
        onChange={(k) => {
          setKind(k);
          setN(0);
        }}
        label="Kind of question"
        prefix={`${prefix}-kind`}
        small
      />
      <TryCard
        prefix={prefix}
        kind={kind}
        title={SHEET_ASK_LABEL[kind]}
        score={score}
        prompt={ask.prompt}
        verdict={verdict ? { right: verdict.right, answer: verdict.right ? null : `The answer is ${answerText(a)}.`, slip: verdict.why, reason: ask.reason, note: 'The sheet now shows the answer.' } : null}
        onCheck={check}
        canCheck={ready}
        onNext={() => setN((x) => (seed ? x + 1 : x + 1 + (Date.now() % 997)))}
      >
        {answer}
      </TryCard>
      <p className="text-sm text-muted">{answered ? 'The sheet now shows the answer.' : ask.hide ? 'Work it out from the sheet: the cell asked about shows "?".' : 'The sheet shows what the formula did when it was copied down.'}</p>
      <Stage prefix={prefix} label="The sheet of the question" data-answered={answered ? 'true' : 'false'}>
        <div className="flex min-w-0 flex-col gap-2">
          <FormulaBar prefix={`${prefix}-try`} name={ask.focus} value={formula ?? ''} editable={false} />
          {answered || !ask.hide ? <Reading prefix={`${prefix}-try`} addr={ask.focus} cells={sheet.cells} computed={computed} /> : null}
          <Grid
            prefix={`${prefix}-try`}
            label="The sheet of the question. Use the arrow keys to move between cells."
            cols={sheet.cols}
            rows={sheet.rows}
            widths={sheet.widths}
            cells={sheet.cells}
            computed={computed}
            formulas={ask.formulas}
            active={focus}
            highlights={hidden.length > 0 && ask.kind === 'copy' ? [] : highlightsOf(formula)}
            hidden={hidden}
            fresh={answered ? [ask.focus] : []}
            reduced={reduced}
          />
        </div>
      </Stage>
    </div>
  );
}
