import { addressOf, cellsOf, parseArea, areaSize } from './address';
import { isErr } from './evaluate';
import { displayOf, formatOf, shownOf, type Cells, type Computed } from './sheet';
import type { ChartSpec } from './workbooks';

// ---------------------------------------------------------------------------------------------------------------
// A chart drawn from two ranges of a sheet: the names of the items and their figures. A pie shows the parts of one
// whole (each slice is its figure ÷ the total × 360°); bars set the items side by side. A range that cannot be drawn
// is refused with the reason, as a student would need to put it right.
// ---------------------------------------------------------------------------------------------------------------

export interface ChartItem {
  label: string;
  value: number;
  /** What the sheet shows for the figure ("₹54,000"). */
  shown: string;
  /** Share of the total, per cent; and the angle of its slice, in degrees. */
  share: number;
  angle: number;
}

export type ChartData = { ok: true; items: ChartItem[]; total: number; totalShown: string } | { ok: false; problem: string };

export function chartData(spec: Pick<ChartSpec, 'kind' | 'labels' | 'values'>, cells: Cells, computed: ReadonlyMap<string, Computed>): ChartData {
  const labels = parseArea(spec.labels);
  const values = parseArea(spec.values);
  if (!values) return { ok: false, problem: `"${spec.values}" is not a range of cells, such as B2:B6.` };
  if (!labels) return { ok: false, problem: `"${spec.labels}" is not a range of cells, such as A2:A6.` };
  const vs = cellsOf(values);
  const ls = cellsOf(labels);
  if (vs.length !== ls.length) return { ok: false, problem: `The names (${areaSize(labels)} cells) and the figures (${areaSize(values)} cells) must be ranges of the same size.` };
  if (vs.length > 12) return { ok: false, problem: 'A chart of more than 12 items is too crowded to read: take a smaller range.' };
  const items: Omit<ChartItem, 'share' | 'angle'>[] = [];
  for (let i = 0; i < vs.length; i++) {
    const at = addressOf(vs[i].col, vs[i].row);
    const v = computed.get(at)?.value ?? null;
    if (isErr(v)) return { ok: false, problem: `${at} shows ${v.err}: put that right before drawing the chart.` };
    if (typeof v !== 'number') continue;
    const name = shownOf(cells, computed, addressOf(ls[i].col, ls[i].row)) || addressOf(ls[i].col, ls[i].row);
    items.push({ label: name, value: v, shown: shownOf(cells, computed, at) });
  }
  if (items.length === 0) return { ok: false, problem: `There are no figures in ${spec.values} to draw.` };
  const total = items.reduce((a, b) => a + b.value, 0);
  if (spec.kind === 'pie') {
    if (items.some((x) => x.value < 0)) return { ok: false, problem: 'A pie chart cannot show a figure below nil: a slice cannot be less than nothing. Draw bars instead.' };
    if (total === 0) return { ok: false, problem: 'The figures add up to nil, so there is no whole to share out in a pie.' };
  }
  return {
    ok: true,
    total,
    totalShown: displayOf(total, formatOf(cells[addressOf(vs[0].col, vs[0].row)])),
    items: items.map((x) => ({ ...x, share: total === 0 ? 0 : (x.value / total) * 100, angle: total === 0 ? 0 : (x.value / total) * 360 })),
  };
}

/** The path of a slice of a pie centred at (cx, cy), from `start` to `end` degrees clockwise from the top. */
export function slicePath(cx: number, cy: number, r: number, start: number, end: number): string {
  if (end - start >= 359.999) return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
  const at = (deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  };
  return `M ${cx} ${cy} L ${at(start)} A ${r} ${r} 0 ${end - start > 180 ? 1 : 0} 1 ${at(end)} Z`;
}
