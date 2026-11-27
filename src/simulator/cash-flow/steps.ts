// The walk-through of a statement: one step for each figure of the statement, in the board's order, told in words.

import { formatINR } from '@/engine/money';
import type { CfRow, Section, Statement } from './model';

export interface CfStep {
  /** The row the step writes into the statement. */
  rowId: string;
  section: Section;
  /** One line: what is written, and its figure. */
  headline: string;
  /** Why it goes there, and which way. */
  why: string;
  /** The pipe that empties into (or drains) the reservoir at this step: the net of a part. */
  flows?: 'operating' | 'investing' | 'financing';
}

const FLOWS: Record<string, CfStep['flows']> = { 'net-operating': 'operating', 'net-investing': 'investing', 'net-financing': 'financing' };

function headline(r: CfRow): string {
  if (r.kind === 'item' && r.sign) return `${r.sign}: ${r.label}, ${r.sign === 'Less' ? formatINR(-r.amount) : formatINR(r.amount)}`;
  return `${r.label}: ${r.amount < 0 ? `(${formatINR(-r.amount)})` : formatINR(r.amount)}`;
}

export function stepsOf(s: Statement): CfStep[] {
  return s.rows
    .filter((r) => r.kind === 'item' || r.kind === 'subtotal' || r.kind === 'final')
    .map((r) => ({ rowId: r.id, section: r.section, headline: headline(r), why: r.why, ...(FLOWS[r.id] ? { flows: FLOWS[r.id] } : {}) }));
}

/** The rows written once `shown` steps have played: a heading or sub-heading appears with the first figure under it. */
export function rowsShown(s: Statement, steps: readonly CfStep[], shown: number): Set<string> {
  const ids = new Set(steps.slice(0, shown).map((st) => st.rowId));
  const out = new Set<string>();
  let pending: string[] = [];
  for (const r of s.rows) {
    if (r.kind === 'heading' || r.kind === 'subhead') {
      pending.push(r.id);
      continue;
    }
    if (ids.has(r.id)) {
      for (const p of pending) out.add(p);
      out.add(r.id);
    }
    pending = [];
  }
  return out;
}

/** The parts whose net has been written, so whose pipe has emptied into the reservoir. */
export function partsDone(steps: readonly CfStep[], shown: number): { operating: boolean; investing: boolean; financing: boolean } {
  const flowed = new Set(steps.slice(0, shown).map((st) => st.flows));
  return { operating: flowed.has('operating'), investing: flowed.has('investing'), financing: flowed.has('financing') };
}

/** For a screen reader: the step and the figure in the statement's own form. */
export const stepWords = (st: CfStep): string => `${st.headline}. ${st.why}`;

