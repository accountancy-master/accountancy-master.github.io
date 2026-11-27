import { resolveAccount } from '@/engine/accounts';
import { columnTotals, figureProblem, givenProblem, kindOf, rowsProblem } from '@/engine/formats';
import { isBalanced } from '@/engine/journal';
import { isRatio, numericKey } from '@/exercises/numeric';
import { formatLists, subtotalsOf } from '@/exercises/logic';
import { TEMPLATES, findCase } from '@/generators';
import { findScene } from '@/simulator/scenes';
import type { TopicPack } from './types';

export function validatePack(pack: TopicPack): string[] {
  const errors: string[] = [];
  const unique = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`duplicate ${kind} id ${id}`);
      seen.add(id);
    }
    return seen;
  };

  const concepts = unique('concept', pack.concepts.map((c) => c.id));
  const cards = unique('card', pack.cards.map((c) => c.id));
  const questions = unique('question', pack.questions.map((q) => q.id));
  unique('level', pack.levels.map((l) => l.id));
  unique('level order', pack.levels.map((l) => String(l.order)));
  const templates = new Set(TEMPLATES.map((t) => t.id));
  // What teaches beyond the syllabus stands on no level (see `TemplateBase.beyondSyllabus`).
  const beyondTemplates = new Set(TEMPLATES.filter((t) => t.beyondSyllabus !== undefined).map((t) => t.id));
  const beyondQuestions = new Set(pack.questions.filter((q) => q.beyondSyllabus !== undefined).map((q) => q.id));
  const beyondCards = new Set(pack.cards.filter((c) => c.beyondSyllabus !== undefined).map((c) => c.id));
  const oneLine = (reason: string) => reason.trim() !== '' && !reason.includes('\n');
  for (const t of TEMPLATES) {
    if (t.topicId === pack.topicId && t.beyondSyllabus !== undefined && !oneLine(t.beyondSyllabus)) errors.push(`template ${t.id}: the reason it is beyond the syllabus must be one line`);
  }

  for (const c of pack.cards) {
    if (!concepts.has(c.conceptId)) errors.push(`card ${c.id}: unknown concept ${c.conceptId}`);
    if (c.beyondSyllabus !== undefined && !oneLine(c.beyondSyllabus)) errors.push(`card ${c.id}: the reason it is beyond the syllabus must be one line`);
  }

  for (const q of pack.questions) {
    if (!concepts.has(q.conceptId)) errors.push(`question ${q.id}: unknown concept ${q.conceptId}`);
    if (q.beyondSyllabus !== undefined && !oneLine(q.beyondSyllabus)) errors.push(`question ${q.id}: the reason it is beyond the syllabus must be one line`);
    if (q.type === 'mcq') {
      if (q.options.length < 2) errors.push(`question ${q.id}: needs at least two options`);
      if (!q.options.some((o) => o.id === q.correct)) errors.push(`question ${q.id}: correct answer ${q.correct} is not an option`);
      if (new Set(q.options.map((o) => o.id)).size !== q.options.length) errors.push(`question ${q.id}: option ids are not unique`);
      if (new Set(q.options.map((o) => o.text)).size !== q.options.length) errors.push(`question ${q.id}: option texts are not unique`);
      for (const o of q.options) {
        if (o.why !== undefined && o.why.trim() === '') errors.push(`question ${q.id}: option ${o.id} has an empty why`);
        if (o.why !== undefined && o.id === q.correct) errors.push(`question ${q.id}: the correct option has a why`);
      }
    }
    if (q.type === 'numeric') {
      if (q.unit === 'ratio') {
        // A ratio is its terms in lowest terms, and every wrong ratio has as many terms as the right one.
        if (!isRatio(q.answer)) errors.push(`question ${q.id}: answer must be a ratio of two to four whole numbers in lowest terms`);
        if (q.commonErrors.some((e) => !isRatio(e.value) || e.value.length !== q.answer.length)) {
          errors.push(`question ${q.id}: a common error is not a ratio in lowest terms with as many terms as the answer`);
        }
      } else if (!Number.isSafeInteger(q.answer) || q.answer <= 0) errors.push(`question ${q.id}: answer must be a positive integer`);
      if (q.working.length === 0 || q.working.some((l) => l.trim() === '')) errors.push(`question ${q.id}: needs working, one non-empty line per step`);
      const wrong = q.commonErrors.map((e) => numericKey(e.value));
      if (wrong.includes(numericKey(q.answer))) errors.push(`question ${q.id}: a common error equals the answer`);
      if (new Set(wrong).size !== wrong.length) errors.push(`question ${q.id}: common errors repeat a value`);
      if (q.commonErrors.some((e) => e.why.trim() === '')) errors.push(`question ${q.id}: a common error has an empty why`);
    }
    // A single entry, and every entry of a set, must balance and use accounts that exist and are on offer.
    const expected = q.type === 'journal_entry' ? [q.expected] : q.type === 'journal_set' ? q.entries.map((e) => e.expected) : [];
    const choices = q.type === 'journal_entry' || q.type === 'journal_set' ? q.accountChoices : [];
    for (const lines of expected) {
      if (!isBalanced(lines)) errors.push(`question ${q.id}: expected entry does not balance`);
      for (const line of lines) {
        try {
          resolveAccount(line.accountId);
        } catch {
          errors.push(`question ${q.id}: unknown account ${line.accountId}`);
        }
        if (!choices.includes(line.accountId)) errors.push(`question ${q.id}: ${line.accountId} missing from account choices`);
      }
    }
    if (q.type === 'journal_set' && q.entries.length < 2) errors.push(`question ${q.id}: a set needs at least two transactions`);
    // A format: rows that can be rows, labels that are on offer, and totals that agree where they must.
    if (q.type === 'account' || q.type === 'statement') {
      const n = q.columns.length;
      // A statement may declare the kinds of its columns: a figure is then in the unit of its column.
      const kinds = q.type === 'statement' ? q.columnKinds : undefined;
      if (kinds && kinds.length !== n) errors.push(`question ${q.id}: needs a kind for every amount column`);
      for (const rows of formatLists(q)) {
        const bad = rowsProblem(rows, n, q.labels, kinds);
        if (bad) errors.push(`question ${q.id}: ${bad}`);
      }
      // The two sides of every period of an account, and the two columns of a statement that says they agree.
      const pairs =
        q.type === 'account'
          ? [[q.sides[0].rows, q.sides[1].rows], ...(q.later ?? [])].map((rows) => rows.map((list) => columnTotals(list, n)))
          : q.totalsAgree
            ? [columnTotals(q.rows, n).map((t) => [t])]
            : [];
      if (pairs.some(([a, b]) => a.some((t, c) => t !== b[c]))) errors.push(`question ${q.id}: the totals do not agree`);
      // The sub-headings and sub-totals of a statement in parts stand in order, each with what it needs.
      if (q.type === 'statement') {
        let before = 0;
        for (const line of q.lines ?? []) {
          if (!Number.isInteger(line.at) || line.at < before || line.at > q.rows.length) errors.push(`question ${q.id}: a sub-heading or sub-total is out of place`);
          before = line.at;
          if ('subtotal' in line && (line.amounts.length !== n || line.amounts.some((a, c) => figureProblem(a, kindOf(kinds, c)) !== null) || line.amounts.every((a) => a === 0))) {
            errors.push(`question ${q.id}: the sub-total "${line.subtotal}" needs a figure its columns can hold`);
          }
        }
      }
      if (q.type === 'statement' && q.final?.options && !q.final.options.includes(q.final.label)) errors.push(`question ${q.id}: the label of the final figure is not among its options`);
      // The figures a statement prints: only where it gives a column, the same under one name, and not all there is.
      if (q.type === 'statement') {
        const ungiven = givenProblem(q.givenColumns, n, q.rows, subtotalsOf(q));
        if (ungiven) errors.push(`question ${q.id}: ${ungiven}`);
      } else if (formatLists(q).some((rows) => rows.some((r) => r.given !== undefined))) errors.push(`question ${q.id}: a row of an account speaks of given figures`);
    }
  }

  // Practice picks generated questions by concept, so a template whose concept the pack lacks would never be served.
  for (const t of TEMPLATES) {
    if (t.topicId === pack.topicId && !concepts.has(t.conceptId)) errors.push(`template ${t.id}: unknown concept ${t.conceptId}`);
  }

  for (const l of pack.levels) {
    if (l.passMark !== undefined && (l.passMark <= 0 || l.passMark > 1)) errors.push(`level ${l.id}: pass mark must be between 0 and 1`);
    if (l.type === 'concept' && !l.lesson?.length) errors.push(`level ${l.id}: concept level needs lesson blocks`);
    for (const id of l.cardIds ?? []) if (!cards.has(id)) errors.push(`level ${l.id}: unknown card ${id}`);
    for (const id of l.cardIds ?? []) if (beyondCards.has(id)) errors.push(`level ${l.id}: card ${id} is beyond the syllabus and stands on no level`);
    for (const id of l.questionIds ?? []) if (!questions.has(id)) errors.push(`level ${l.id}: unknown question ${id}`);
    for (const b of l.lesson ?? []) {
      if (b.type === 'check' && !questions.has(b.questionId)) errors.push(`level ${l.id}: unknown question ${b.questionId}`);
      if (b.type === 'working') {
        if (b.title.trim() === '') errors.push(`level ${l.id}: a worked example has no title`);
        if (b.lines.length === 0 || b.lines.some((line) => line.trim() === '')) errors.push(`level ${l.id}: worked example "${b.title}" needs working, one non-empty line per step`);
        if (b.note !== undefined && b.note.trim() === '') errors.push(`level ${l.id}: worked example "${b.title}" has an empty note`);
      }
      if (b.type === 'table') {
        if (b.title.trim() === '') errors.push(`level ${l.id}: a table has no title`);
        if (!b.rows.some((row) => row.amount !== undefined) || b.rows.some((row) => row.label.trim() === '' || row.amount?.trim() === '')) {
          errors.push(`level ${l.id}: table "${b.title}" needs rows, each with a label, and a figure in at least one`);
        }
        if (b.note !== undefined && b.note.trim() === '') errors.push(`level ${l.id}: table "${b.title}" has an empty note`);
      }
      if (b.type === 'example') {
        if (!isBalanced(b.lines)) errors.push(`level ${l.id}: example "${b.title}" does not balance`);
        for (const line of b.lines) {
          try {
            resolveAccount(line.accountId);
          } catch {
            errors.push(`level ${l.id}: example "${b.title}" uses unknown account ${line.accountId}`);
          }
        }
      }
    }
    if (l.generate && (l.generate.count < 1 || l.generate.templateIds.length === 0)) {
      errors.push(`level ${l.id}: generate needs at least one template and a positive count`);
    }
    for (const id of l.generate?.templateIds ?? []) if (!templates.has(id)) errors.push(`level ${l.id}: unknown template ${id}`);

    // A look-back level asks questions of earlier topics as well as its own; without an earlier topic it is not one.
    if ((l.type === 'look_back') !== (l.lookBack !== undefined)) errors.push(`level ${l.id}: a look-back level, and only one, lists look-back templates`);
    if (l.lookBack) {
      const { earlier } = l.lookBack;
      if (earlier.length === 0 || earlier.some((t) => t.templateIds.length === 0)) {
        errors.push(`level ${l.id}: look-back needs at least one earlier topic, each with a template`);
      }
      if (earlier.some((t) => t.topicId === pack.topicId)) errors.push(`level ${l.id}: look-back lists its own topic as an earlier one`);
      for (const id of [...l.lookBack.templateIds, ...earlier.flatMap((t) => t.templateIds)]) {
        if (!templates.has(id)) errors.push(`level ${l.id}: unknown template ${id}`);
      }
    }

    // A case-study level serves whole cases, whose questions belong to this topic under a concept of this pack.
    if ((l.type === 'case_study') !== (l.cases !== undefined)) errors.push(`level ${l.id}: a case-study level, and only one, lists cases`);
    if (l.cases) {
      if (l.cases.caseIds.length === 0) errors.push(`level ${l.id}: a case-study level needs at least one case`);
      for (const id of l.cases.caseIds) {
        const c = findCase(id);
        if (!c) errors.push(`level ${l.id}: unknown case ${id}`);
        else if (c.topicId !== pack.topicId) errors.push(`level ${l.id}: case ${id} belongs to topic ${c.topicId}`);
        else if (!concepts.has(c.conceptId)) errors.push(`level ${l.id}: case ${id} has unknown concept ${c.conceptId}`);
      }
    }

    // A simulation level plays a scene of the simulator that belongs to this topic.
    if ((l.type === 'simulation') !== (l.simulation !== undefined)) errors.push(`level ${l.id}: a simulation level, and only one, names a scene`);
    if (l.simulation) {
      const scene = findScene(l.simulation.sceneId);
      if (!scene) errors.push(`level ${l.id}: unknown scene ${l.simulation.sceneId}`);
      else if (scene.topicId !== pack.topicId) errors.push(`level ${l.id}: scene ${scene.id} belongs to topic ${scene.topicId}`);
      if (!Number.isInteger(l.simulation.count) || l.simulation.count < 1) errors.push(`level ${l.id}: a simulation level needs a count of at least 1`);
      if (l.simulation.mode === 'mistakes' && scene && scene.mistakes.length === 0) errors.push(`level ${l.id}: scene ${scene.id} has no mistakes to find`);
    }

    const listedQuestions = [...(l.questionIds ?? []), ...(l.lesson ?? []).flatMap((b) => (b.type === 'check' ? [b.questionId] : []))];
    const listedTemplates = [...(l.generate?.templateIds ?? []), ...(l.lookBack ? [...l.lookBack.templateIds, ...l.lookBack.earlier.flatMap((t) => t.templateIds)] : [])];
    for (const id of listedQuestions) if (beyondQuestions.has(id)) errors.push(`level ${l.id}: question ${id} is beyond the syllabus and stands on no level`);
    for (const id of listedTemplates) if (beyondTemplates.has(id)) errors.push(`level ${l.id}: template ${id} is beyond the syllabus and stands on no level`);

    const hasContent = l.lesson?.length || l.cardIds?.length || l.questionIds?.length || l.generate || l.lookBack || l.cases || l.simulation;
    if (!hasContent) errors.push(`level ${l.id}: has no content`);
  }

  return errors;
}
