'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { createRng } from '@/engine/rng';
import { addressOf, areaOf, areaText, cellsOf, type Area, type CellRef } from '@/simulator/spreadsheet/address';
import { chartData } from '@/simulator/spreadsheet/chart';
import { isErr } from '@/simulator/spreadsheet/evaluate';
import { parseFormula } from '@/simulator/spreadsheet/formula';
import { clearArea, computeSheet, fillDown, fillRight, paste, readInput, shownOf, typeInto, type Cells } from '@/simulator/spreadsheet/sheet';
import { BLANK, playSheet, WORKBOOKS, workbookOf, type ChartKind } from '@/simulator/spreadsheet/workbooks';
import { Announce, SelectField, Toggle } from '../kit/LabControls';
import { Card, Intro } from '../kit/LabShell';
import { ChartView } from './Chart';
import { CopyCard, FormulaBar, highlightsOf, Reading } from './Formula';
import { Grid } from './Grid';

/** The chart each workbook starts with in Play: the names and the figures it is drawn from. */
const START_CHART: Record<string, { kind: ChartKind; labels: string; values: string }> = {
  brs: { kind: 'bar', labels: 'A2:A4', values: 'B2:B4' },
  sln: { kind: 'bar', labels: 'A6:A9', values: 'D6:D9' },
  db: { kind: 'bar', labels: 'A7:A10', values: 'C7:C10' },
  wdv: { kind: 'bar', labels: 'A5:A7', values: 'C5:C7' },
  loan: { kind: 'bar', labels: 'A7:A9', values: 'C7:C9' },
  // The two ratios in per cent: bars of ratios in different units (: 1, times, %) cannot be compared.
  ratios: { kind: 'bar', labels: 'A18:A19', values: 'B18:B19' },
  chart: { kind: 'pie', labels: 'A2:A6', values: 'B2:B6' },
  blank: { kind: 'bar', labels: 'A1:A5', values: 'B1:B5' },
};

const IDS = ['blank', ...WORKBOOKS.map((w) => w.id)] as const;
type PlayId = (typeof IDS)[number];

/**
 * Play: a working sheet. A ready workbook (or a blank sheet) to change freely: type a number, words or a formula
 * into any cell, copy a cell and paste it into a block (or fill a block down or right) and see how its references
 * moved, undo, and draw a chart of any range. An error shows its code in the cell and its reason under the bar; a
 * formula that cannot be read is refused with the reason, as a spreadsheet refuses it.
 */
export function Play({ prefix, reduced, seed }: { prefix: string; reduced: boolean; seed?: number }) {
  const [id, setId] = useState<PlayId>('brs');
  const wb = id === 'blank' ? BLANK : workbookOf(id);
  const [cells, setCells] = useState<Cells>(() => playSheet(workbookOf('brs')));
  const [history, setHistory] = useState<Cells[]>([]);
  const [active, setActive] = useState<CellRef>({ col: 2, row: 7 });
  const [selEnd, setSelEnd] = useState<CellRef | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [clip, setClip] = useState<Area | null>(null);
  const [lastCopy, setLastCopy] = useState<{ from: Area; to: Area; cells: Cells } | null>(null);
  const [formulas, setFormulas] = useState<'values' | 'formulas'>('values');
  const [fresh, setFresh] = useState<string[]>([]);
  const [focusTick, setFocusTick] = useState(0);
  const [said, setSaid] = useState('');
  const [chart, setChart] = useState(START_CHART.brs);
  const [draw, setDraw] = useState(seed ?? 1);
  const input = useRef<HTMLInputElement>(null);
  const pointed = useRef(false);
  const computed = useMemo(() => computeSheet(cells), [cells]);

  const sel: Area = selEnd ? areaOf(active, selEnd) : areaOf(active);
  const addr = addressOf(active.col, active.row);
  const editing = draft !== null;

  useEffect(() => {
    if (!editing) return;
    const el = input.current;
    if (el && document.activeElement !== el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing]);

  const load = (next: PlayId, sheet: Cells) => {
    setId(next);
    setCells(sheet);
    setHistory([]);
    setActive({ col: 1, row: 1 });
    setSelEnd(null);
    setDraft(null);
    setProblem(null);
    setClip(null);
    setLastCopy(null);
    setFresh([]);
    setChart(START_CHART[next]);
  };

  const tell = (sheet: Cells, at: string): string => {
    const c = computeSheet(sheet).get(at);
    if (!c) return `${at} is now empty.`;
    if (c.problem) return `${at}: ${c.problem}`;
    const shown = shownOf(sheet, computeSheet(sheet), at);
    if (isErr(c.value)) return `${at}${c.formula ? ` holds ${c.formula} and` : ''} shows ${c.value.err}: ${c.value.reason}`;
    return c.formula ? `${at} holds ${c.formula} and shows ${shown}.` : `${at} holds ${shown}.`;
  };

  const change = (next: Cells, changed: string[], say: string) => {
    setHistory((h) => [...h.slice(-49), cells]);
    setCells(next);
    setFresh(changed);
    setSaid(say);
  };

  const moveTo = (c: CellRef) => {
    setActive({ col: Math.min(wb.cols, Math.max(1, c.col)), row: Math.min(wb.rows, Math.max(1, c.row)) });
    setSelEnd(null);
  };

  /** Keeps what is being typed in the active cell; false (and the reason shown) when the formula cannot be read. */
  const commit = (): boolean => {
    if (draft === null) return true;
    const typed = readInput(draft);
    if (typed.type === 'formula') {
      const p = parseFormula(typed.formula);
      if (!p.ok) {
        setProblem(p.message);
        setSaid(`The formula cannot be kept: ${p.message}`);
        return false;
      }
    }
    setDraft(null);
    setProblem(null);
    if ((cells[addr]?.input ?? '') === draft.trim()) return true;
    const next = typeInto(cells, addr, draft);
    change(next, [addr], tell(next, addr));
    return true;
  };

  const cancel = () => {
    setDraft(null);
    setProblem(null);
    setFocusTick((t) => t + 1);
  };

  const startEdit = (text: string) => {
    setDraft(text);
    setProblem(null);
  };

  const copy = () => {
    setClip(sel);
    setSaid(`Copied ${areaText(sel)}. Choose where it goes and press Paste.`);
  };

  const doPaste = () => {
    if (!clip) return;
    const h = clip.bottom - clip.top + 1;
    const w = clip.right - clip.left + 1;
    const to: Area = { top: sel.top, left: sel.left, bottom: sel.top + Math.max(h, Math.floor((sel.bottom - sel.top + 1) / h) * h) - 1, right: sel.left + Math.max(w, Math.floor((sel.right - sel.left + 1) / w) * w) - 1 };
    if (to.bottom > wb.rows || to.right > wb.cols) {
      setSaid(`There is no room for ${areaText(clip)} at ${addressOf(sel.left, sel.top)}: it would run off the sheet.`);
      return;
    }
    const next = paste(cells, clip, sel);
    const changed = cellsOf(to).map((c) => addressOf(c.col, c.row));
    setLastCopy({ from: clip, to, cells });
    change(next, changed, `Pasted ${areaText(clip)} into ${areaText(to)}. ${tell(next, changed[0])}`);
    setSelEnd(to.bottom !== to.top || to.right !== to.left ? { col: to.right, row: to.bottom } : null);
  };

  const fill = (down: boolean) => {
    if (down ? sel.bottom === sel.top : sel.right === sel.left) {
      setSaid(down ? 'Select a block of more than one row to fill down: the top row is copied into the rows under it.' : 'Select a block of more than one column to fill right: the left column is copied into the columns beside it.');
      return;
    }
    const next = down ? fillDown(cells, sel) : fillRight(cells, sel);
    const from: Area = down ? { ...sel, bottom: sel.top } : { ...sel, right: sel.left };
    const to: Area = down ? { ...sel, top: sel.top + 1 } : { ...sel, left: sel.left + 1 };
    const changed = cellsOf(to).map((c) => addressOf(c.col, c.row));
    setLastCopy({ from, to, cells });
    change(next, changed, `Filled ${down ? 'down' : 'right'} from ${areaText(from)} into ${areaText(to)}. ${tell(next, changed[0])}`);
  };

  const clear = () => {
    const next = clearArea(cells, sel);
    change(next, [], `Cleared ${areaText(sel)}.`);
  };

  const undo = () => {
    if (history.length === 0) return;
    setCells(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    setFresh([]);
    setLastCopy(null);
    setSaid('The last change is undone.');
  };

  const onCellKey = (e: KeyboardEvent<HTMLElement>): boolean => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'c') copy();
      else if (k === 'v') doPaste();
      else if (k === 'd') fill(true);
      else if (k === 'r') fill(false);
      else if (k === 'z') undo();
      else return false;
      return true;
    }
    if (e.key === 'Enter' || e.key === 'F2') {
      startEdit(cells[addr]?.input ?? '');
      return true;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      clear();
      return true;
    }
    if (e.key === 'Escape' && clip) {
      setClip(null);
      return true;
    }
    if (e.key.length === 1 && !e.altKey) {
      startEdit(e.key);
      return true;
    }
    return false;
  };

  const onBarKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (!commit()) return;
      moveTo(e.key === 'Tab' ? { col: active.col + (e.shiftKey ? -1 : 1), row: active.row } : { col: active.col, row: active.row + (e.shiftKey ? -1 : 1) });
      setFocusTick((t) => t + 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  const onPick = (c: CellRef, extend: boolean) => {
    if (pointed.current) {
      pointed.current = false;
      return;
    }
    if (editing && !commit()) return;
    if (extend) setSelEnd(c);
    else moveTo(c);
  };

  /** While a formula is typed, a cell pressed is named in it at the caret, as a spreadsheet does. */
  const onPoint = (c: CellRef): boolean => {
    const el = input.current;
    if (draft === null || !draft.startsWith('=') || !el || document.activeElement !== el) return false;
    const at = el.selectionStart ?? draft.length;
    const name = addressOf(c.col, c.row);
    const next = draft.slice(0, at) + name + draft.slice(el.selectionEnd ?? at);
    setDraft(next);
    pointed.current = true;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(at + name.length, at + name.length);
    });
    return true;
  };

  const fresh2 = () => {
    const n = seed ? draw + 1 : Date.now() % 1_000_000_007;
    setDraw(n);
    load(id, playSheet(wb, createRng(n)));
    setSaid('New figures: every formula has worked them out again.');
  };

  const shownFormula = computed.get(addr)?.formula;
  const highlights = highlightsOf(editing ? draft ?? '' : shownFormula);
  const data = chartData(chart, cells, computed);
  const rangeId = useId();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <SelectField
          label="Workbook"
          testId={`${prefix}-workbook`}
          value={id}
          onChange={(v) => load(v, v === 'blank' ? {} : playSheet(workbookOf(v)))}
          options={IDS.map((x) => ({ id: x, label: x === 'blank' ? BLANK.title : workbookOf(x).title }))}
          className="sm:max-w-sm"
        />
        <Button variant="secondary" data-testid={`${prefix}-reset`} onClick={() => load(id, id === 'blank' ? {} : playSheet(wb))}>
          Start again
        </Button>
        {id !== 'blank' ? (
          <Button variant="secondary" data-testid={`${prefix}-new`} onClick={fresh2}>
            New figures
          </Button>
        ) : null}
      </div>
      <Intro prefix={prefix}>
        {wb.about} Click or tap a cell, or move with the arrow keys; type to change it, Enter to keep it.
      </Intro>
      <Card
        title={wb.heading}
        testId={`${prefix}-sheet`}
        aside={
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
        }
      >
        <div role="toolbar" aria-label="Sheet" className="flex flex-wrap gap-2">
          <Button variant="secondary" data-testid={`${prefix}-copy`} aria-keyshortcuts="Control+C" onClick={copy}>
            Copy {areaText(sel)}
          </Button>
          <Button variant="secondary" data-testid={`${prefix}-paste`} aria-keyshortcuts="Control+V" onClick={doPaste} disabled={!clip}>
            Paste{clip ? ` ${areaText(clip)}` : ''}
          </Button>
          <Button variant="secondary" data-testid={`${prefix}-fill-down`} aria-keyshortcuts="Control+D" onClick={() => fill(true)}>
            Fill down
          </Button>
          <Button variant="secondary" data-testid={`${prefix}-fill-right`} aria-keyshortcuts="Control+R" onClick={() => fill(false)}>
            Fill right
          </Button>
          <Button variant="secondary" data-testid={`${prefix}-clear`} aria-keyshortcuts="Delete" onClick={clear}>
            Clear
          </Button>
          <Button variant="secondary" data-testid={`${prefix}-undo`} aria-keyshortcuts="Control+Z" onClick={undo} disabled={history.length === 0}>
            Undo
          </Button>
        </div>
        <FormulaBar
          prefix={prefix}
          name={areaText(sel)}
          value={draft ?? cells[addr]?.input ?? ''}
          editable
          inputRef={input}
          onChange={(v) => {
            setDraft(v);
            setProblem(null);
          }}
          onFocus={() => {
            if (draft === null) setDraft(cells[addr]?.input ?? '');
          }}
          onKey={onBarKey}
        />
        {problem ? (
          <p role="alert" data-testid={`${prefix}-problem`} className="rounded-control border-2 border-danger bg-danger-soft px-3 py-2 text-sm font-semibold text-danger-deep">
            This formula cannot be kept: {problem} Press Escape to leave the cell as it was.
          </p>
        ) : null}
        {editing ? (
          <p className="text-xs text-muted">Typing into {addr}: Enter keeps it, Escape leaves it as it was. While a formula is typed, click a cell to name it in the formula.</p>
        ) : (
          <Reading prefix={prefix} addr={addr} cells={cells} computed={computed} />
        )}
        <Grid
          prefix={prefix}
          label={`${wb.heading}. Arrow keys move between cells, Shift and an arrow selects a block, Enter edits, Delete clears; Control and C, V, D, R, Z copy, paste, fill down, fill right and undo.`}
          cols={wb.cols}
          rows={wb.rows}
          widths={wb.widths}
          cells={cells}
          computed={computed}
          formulas={formulas === 'formulas'}
          active={active}
          selection={selEnd ? sel : null}
          highlights={highlights}
          fresh={fresh}
          reduced={reduced}
          onPick={onPick}
          onCellKey={onCellKey}
          onPoint={onPoint}
          focusTick={focusTick}
        />
        {clip ? (
          <p className="text-xs text-muted" data-testid={`${prefix}-clip`}>
            {areaText(clip)} is copied: select a cell or a block and press Paste. Escape forgets it.
          </p>
        ) : null}
        <Announce text={said} prefix={prefix} />
      </Card>
      {lastCopy ? <CopyCard prefix={prefix} cells={lastCopy.cells} from={lastCopy.from} to={lastCopy.to} /> : null}
      <Card title="A chart from a range" testId={`${prefix}-chart-card`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <Toggle
            options={[
              { value: 'bar', label: 'Bar' },
              { value: 'pie', label: 'Pie' },
            ]}
            value={chart.kind}
            onChange={(kind) => setChart({ ...chart, kind })}
            label="Kind of chart"
            prefix={`${prefix}-chart`}
            small
          />
          <label htmlFor={`${rangeId}-l`} className="flex flex-col gap-1 text-sm font-bold">
            Names from
            <input id={`${rangeId}-l`} data-testid={`${prefix}-chart-labels`} value={chart.labels} onChange={(e) => setChart({ ...chart, labels: e.target.value.toUpperCase() })} className="min-h-11 w-28 rounded-control border-2 border-edge-deep bg-surface px-2 font-mono text-base" />
          </label>
          <label htmlFor={`${rangeId}-v`} className="flex flex-col gap-1 text-sm font-bold">
            Figures from
            <input id={`${rangeId}-v`} data-testid={`${prefix}-chart-values`} value={chart.values} onChange={(e) => setChart({ ...chart, values: e.target.value.toUpperCase() })} className="min-h-11 w-28 rounded-control border-2 border-edge-deep bg-surface px-2 font-mono text-base" />
          </label>
        </div>
        <ChartView prefix={prefix} kind={chart.kind} title={`${wb.id === 'chart' ? 'Expenses' : 'Figures'} in ${chart.values}`} data={data} />
      </Card>
    </div>
  );
}
