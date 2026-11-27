import { accountLabel } from '@/engine/books';
import { columnTotals, kindOf, printedFigures, sayFigure, type FormatRow } from '@/engine/formats';
import type { JournalLine } from '@/engine/journal';
import { formatINR } from '@/engine/money';
import { setEntryHeading } from '@/exercises/logic';
import { formatNumeric, typedNumeric } from '@/exercises/numeric';
import { CASE_STAGES, TEMPLATES, generateCaseQuestions, generateQuestion, type Template } from '@/generators';
import { ALL_PACKS, COURSES } from './registry';
import type { Difficulty, Question } from './types';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'complex'];
const SAMPLE_SEEDS = [1, 2, 3];

const particulars = accountLabel;

/** A generated question with its answer, laid out for a reviewer who checks the accounting by eye. */
export function formatSample(q: Question): string[] {
  const out = [`Q: ${q.prompt}`];
  const entry = (lines: JournalLine[]) =>
    [...lines]
      .sort((a, b) => (a.side === b.side ? 0 : a.side === 'Dr' ? -1 : 1))
      .map((l) => `   ${l.side === 'Dr' ? 'Dr' : 'Cr'}  ${particulars(l.accountId)}  ${formatINR(l.amount)}`);
  if (q.type === 'journal_entry') {
    out.push(...entry(q.expected));
  } else if (q.type === 'journal_set') {
    // Every transaction, the entry it calls for, and the steps that explain it.
    for (const e of q.entries) {
      out.push(` ${setEntryHeading(e)}: ${e.text}`, ...entry(e.expected), ...e.explanation.map((line) => `     - ${line}`));
    }
  } else if (q.type === 'account' || q.type === 'statement') {
    // The data the student works from, then the format as the solution shows it, and the working.
    // A figure in the unit of its column, where a statement declares the kinds of its columns: a negative one in brackets.
    const kinds = q.type === 'statement' ? q.columnKinds : undefined;
    // A figure the statement prints stands in square brackets: the student types the others. A row of a statement
    // that gives columns and works its figures out all the same says so.
    const given = q.type === 'statement' ? q.givenColumns : undefined;
    const figures = (list: readonly number[], prints = false) =>
      printedFigures(list, given, prints)
        .map((printed, c) => {
          const shown = list[c] === 0 ? '-' : sayFigure(list[c], kindOf(kinds, c));
          return printed === null ? shown : `[${shown}]`;
        })
        .join(' | ');
    const amounts = (r: FormatRow) => `${figures(r.amounts, r.given !== false)}${given && r.given === false ? '   [worked out]' : ''}`;
    const row = (r: FormatRow, prefix = '') =>
      [`     ${r.date ? `${r.date}: ` : ''}${r.ref ? `${r.ref} ` : ''}${prefix}${r.label}${r.note ? ` [note ${r.note}]` : ''}${r.also ? ` (also: ${r.also.join('; ')})` : ''}${r.contra ? ' (C)' : ''}${r.closing ? ' [closing]' : ''}  ${amounts(r)}`, ...(r.details ?? []).map((d) => `         ${d}`)];
    // The data of a format of a case study is the case, which the report prints once, above its questions.
    out.push(...(q.context === undefined ? q.data.split('\n').map((line) => `   | ${line}`) : []), ` ${q.title}  [${q.columns.map((name, c) => (given?.[c] ? `${name} (given)` : name)).join(' | ')}]`);
    if (q.type === 'account') {
      // Period by period (an account usually has one), and under the last totals the rows below them.
      const periods = [[q.sides[0].rows, q.sides[1].rows], ...(q.later ?? [])];
      periods.forEach((rows, p) => {
        if (q.periodTitles) out.push(`  ${q.periodTitles[p]}`);
        q.sides.forEach((side, s) => {
          const prefix = side.prefix ? `${side.prefix} ` : '';
          out.push(`   ${side.title}`, ...rows[s].flatMap((r) => row(r, prefix)), `     Total  ${columnTotals(rows[s], q.columns.length).map(formatINR).join(' | ')}`);
          if (p === periods.length - 1 && side.below.length > 0) out.push('     (below the totals)', ...side.below.flatMap((r) => row(r, prefix)));
        });
      });
      if (q.continued) out.push('   (the place for a balance brought down is offered)');
    } else {
      // A statement in parts: its sub-headings and sub-totals where they stand, and no total of the whole.
      const lines = q.lines ?? [];
      // A sub-total is worked out unless every figure of it is printed.
      const whole = (line: { amounts: number[]; given?: true }) => line.given === true && given?.every(Boolean) === true;
      const linesAt = (at: number) =>
        lines
          .filter((line) => line.at === at)
          .map((line) => ('heading' in line ? `   ${line.heading}` : `     = ${line.subtotal}${line.note ? ` [note ${line.note}]` : ''}  ${figures(line.amounts, line.given === true)}   [sub-total, ${whole(line) ? 'given' : 'worked out'}]`));
      q.rows.forEach((r, i) => out.push(...linesAt(i), ...row(r)));
      out.push(...linesAt(q.rows.length));
      const totals = columnTotals(q.rows, q.columns.length);
      if (!lines.some((line) => 'subtotal' in line)) out.push(`     Total  ${kinds ? totals.map((t, c) => (kindOf(kinds, c).adds ? sayFigure(t, kindOf(kinds, c)) : '-')).join(' | ') : totals.map(formatINR).join(' | ')}`);
      if (q.final) out.push(`     ${q.final.label}  ${sayFigure(q.final.amount, kindOf(kinds, 0))}${q.final.options ? `   (to be chosen from: ${q.final.options.join('; ')})` : ''}`);
    }
    out.push(`   offered: ${q.labels.join('; ')}`, ...q.working.map((line) => `     - ${line}`));
  } else if (q.type === 'mcq') {
    for (const o of q.options) {
      out.push(`   ${o.id}) ${o.text}${o.id === q.correct ? '   <- correct' : `   [${o.why ?? 'no why'}]`}`);
    }
  } else if (q.type === 'numeric') {
    // The two units of Class 12 say what they are and how the answer is typed: a ratio is not one figure, and
    // "times" is held in hundredths.
    const typed = q.unit === 'ratio' ? `   [a ratio, typed ${typedNumeric(q.answer, q.unit)}]` : q.unit === 'times' ? `   [times, typed ${typedNumeric(q.answer, q.unit)}]` : '';
    out.push(`A: ${formatNumeric(q.answer, q.unit)}${typed}`);
    for (const line of q.working) out.push(`   ${line}`);
    for (const e of q.commonErrors) out.push(`   wrong ${formatNumeric(e.value, q.unit)}: ${e.why}`);
  } else {
    out.push(`A: ${q.correct ? 'True' : 'False'}`);
  }
  return out;
}

/** "journal 16 (easy 7, medium 8, complex 1)" for each kind of template there is. */
export function countByKind(templates: Template[]): string[] {
  const kinds = [...new Set(templates.map((t) => t.kind))];
  return kinds.map((kind) => {
    const of = templates.filter((t) => t.kind === kind);
    const parts = DIFFICULTIES.map((d) => [d, of.filter((t) => t.difficulty === d).length] as const).filter(([, n]) => n > 0);
    return `${kind} ${of.length} (${parts.map(([d, n]) => `${d} ${n}`).join(', ')})`;
  });
}

/** What a human reviewer reads: per topic, what there is and sample questions with answers for every template. */
export function buildReport(): string[] {
  const out: string[] = [];
  for (const topic of COURSES.flatMap((c) => c.topics)) {
    const pack = ALL_PACKS.find((p) => p.topicId === topic.id);
    const templates = TEMPLATES.filter((t) => t.topicId === topic.id);
    if (!pack || (templates.length === 0 && pack.levels.length === 0 && pack.cards.length === 0 && pack.questions.length === 0)) continue;

    out.push(`=== ${topic.title} (${topic.id}) [${topic.status}] ===`);
    out.push(`Templates: ${templates.length === 0 ? 'none' : countByKind(templates).join('; ')}`);
    out.push(`Authored questions: ${pack.questions.length}   Cards: ${pack.cards.length}   Levels: ${pack.levels.length}`);
    for (const l of pack.levels) out.push(`  level ${l.order} ${l.type}: ${l.title}`);
    for (const t of templates) {
      out.push('', `--- ${t.id} v${t.version} (${t.kind}, ${t.difficulty}, concept ${t.conceptId}) ---`);
      for (const seed of SAMPLE_SEEDS) {
        const q = generateQuestion(t.id, seed);
        out.push(`[${q.id}]`, ...formatSample(q));
      }
    }
    out.push('');
  }
  out.push(...buildCaseReport());
  return out;
}

const CASE_SAMPLE_SEEDS = [1, 2];

/** The case studies, stage by stage: for each case, two whole samples (the case text, then every question). */
export function buildCaseReport(): string[] {
  const out: string[] = [];
  for (const stage of CASE_STAGES) {
    if (stage.cases.length === 0) continue;
    out.push(`=== Case studies: ${stage.title} (${stage.id}, after ${stage.topicId}) ===`, `Cases: ${stage.cases.length}`);
    for (const c of stage.cases) {
      out.push('', `--- ${c.id} v${c.version} (${c.difficulty}, ${c.parts.length} questions): ${c.title} ---`);
      for (const seed of CASE_SAMPLE_SEEDS) {
        const questions = generateCaseQuestions(c.id, seed);
        out.push(`[seed ${seed}] CASE:`, ...(questions[0].context ?? '').split(/\r?\n/).map((line) => `   | ${line}`));
        questions.forEach((q, i) => out.push(`(${i + 1}) [${q.id}]`, ...formatSample(q)));
      }
    }
    out.push('');
  }
  return out;
}
