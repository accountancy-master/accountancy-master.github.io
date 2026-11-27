import { describe, expect, it } from 'vitest';
// The whole question bank is registered first: nothing here loads a topic, as the app does before it plays one.
import '@/content/registry';
import { rightFormatDraft, wrongFormatDraft } from '@/testing/sampleFormats';
import { SAMPLE_CASE, SAMPLE_CHAIN } from '@/testing/sampleCase';
import type { Question } from '@/content/types';
import { checkAnswer } from '@/exercises/checkers';
import { logicFor } from '@/exercises/logic';
import { generateCase } from '@/generators/engine';
import { typedNumeric } from '@/exercises/numeric';
import { buildPaper, caseMarks, paperSteps, theBank, type MockPaper, type PaperBank } from '@/learning/mockPaper';
import { BLUEPRINTS } from '@/learning/paperBlueprints';
import type { MockPaperRecord } from '@/storage/types';
import { asDraft, draftFilled, draftResponse, readDraft, type Draft } from './drafts';
import { emptyRow } from './journalRows';
import {
  chainedRuleText,
  deadline,
  formatClock,
  formatDay,
  formatDuration,
  formatMarks,
  hasLongPart,
  markPaper,
  marksByPart,
  marksByTopic,
  marksByUnit,
  nextPaperNumber,
  paperInProgress,
  partCredit,
  partCreditText,
  percentOf,
  resumeStep,
  sittingEvents,
  startSitting,
  stepStates,
  submitSitting,
  submittedPapers,
  timeLeftMs,
  timeTakenMs,
  timeUp,
  weakestTopics,
  withAnswer,
  withFlag,
  withTimeOn,
} from './mockSitting';

const BANK = theBank();
/** No stage has cases, and then exactly what a paper holds does not depend on the cases written so far. */
const PLAIN: PaperBank = { ...BANK, stages: [] };
const FULL = buildPaper({ kind: 'full', number: 1 });
const TEST = buildPaper({ kind: 'topic', topicId: 'ledger', number: 1 });
const PROFILE = { id: 'p1', courseId: 'cbse-11-accountancy' };
const T0 = new Date(2026, 9, 5, 10, 0, 0).getTime();
const MIN = 60_000;

/** The answer input's state for the right answer to a question. */
function rightDraft(q: Question): Draft {
  switch (q.type) {
    case 'mcq':
      return { type: 'mcq', optionId: q.correct };
    case 'true_false':
      return { type: 'true_false', value: q.correct };
    case 'numeric':
      return { type: 'numeric', text: typedNumeric(q.answer, q.unit) };
    case 'journal_entry':
      return { type: 'journal_entry', rows: q.expected.map((l) => ({ accountId: l.accountId, side: l.side, amount: String(l.amount / 100) })) };
    case 'journal_set':
      return { type: 'journal_set', entries: q.entries.map((e) => e.expected.map((l) => ({ accountId: l.accountId, side: l.side, amount: String(l.amount / 100) }))) };
    case 'account':
    case 'statement':
      return rightFormatDraft(q);
  }
}

/** A wrong but complete answer. */
function wrongDraft(q: Question): Draft {
  switch (q.type) {
    case 'mcq':
      return { type: 'mcq', optionId: q.options.find((o) => o.id !== q.correct)!.id };
    case 'true_false':
      return { type: 'true_false', value: !q.correct };
    case 'numeric':
      // A figure that is off by a hundred; a ratio with its first number one too large.
      return { type: 'numeric', text: q.unit === 'ratio' ? typedNumeric([q.answer[0] + 1, ...q.answer.slice(1)], q.unit) : typedNumeric(q.answer + 100, q.unit) };
    case 'journal_entry':
      return { type: 'journal_entry', rows: q.expected.map((l) => ({ accountId: l.accountId, side: l.side === 'Dr' ? 'Cr' : 'Dr', amount: String(l.amount / 100) })) };
    case 'journal_set':
      return {
        type: 'journal_set',
        entries: q.entries.map((e) => e.expected.map((l) => ({ accountId: l.accountId, side: l.side === 'Dr' ? 'Cr' : 'Dr', amount: String(l.amount / 100) }))),
      };
    case 'account':
    case 'statement':
      return wrongFormatDraft(q);
  }
}

const answersFor = (paper: MockPaper, pick: (q: Question, index: number) => Draft | undefined): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  paperSteps(paper).forEach((s) => {
    const draft = pick(s.question, s.index);
    if (draft) out[s.question.id] = draft;
  });
  return out;
};
const sitting = (paper: MockPaper, patch: Partial<MockPaperRecord> = {}): MockPaperRecord => ({
  ...startSitting({ id: 'm1', sessionId: 's1', profile: PROFILE, paper, now: T0 }),
  ...patch,
});

describe('drafts', () => {
  const steps = paperSteps(FULL);
  const ofType = (type: Question['type']) => steps.find((s) => s.question.type === type)!.question;

  it('read back as the right answer for every type of question', () => {
    for (const { question } of steps) {
      const read = readDraft(question, rightDraft(question));
      expect('response' in read, question.id).toBe(true);
      expect(draftResponse(question, rightDraft(question))?.type).toBe(question.type);
    }
  });

  it('are nothing while empty, and no answer while not complete', () => {
    const numeric = ofType('numeric');
    expect(readDraft(numeric, undefined)).toEqual({ empty: true });
    expect(readDraft(numeric, { type: 'numeric', text: '   ' })).toEqual({ empty: true });
    expect(readDraft(numeric, { type: 'numeric', text: '12,5oo' })).toHaveProperty('problem');
    expect(draftResponse(numeric, { type: 'numeric', text: 'abc' })).toBeNull();

    const journal = ofType('journal_entry');
    expect(readDraft(journal, { type: 'journal_entry', rows: [emptyRow(), emptyRow()] })).toEqual({ empty: true });
    const begun: Draft = { type: 'journal_entry', rows: [{ accountId: 'cash', side: '', amount: '' }, emptyRow()] };
    expect(draftFilled(begun)).toBe(true);
    expect(readDraft(journal, begun)).toEqual({ problem: 'Line 1: choose Dr or Cr.' });

    const mcq = ofType('mcq');
    // A draft of another type of question, or an option the question does not have, is no answer.
    expect(readDraft(mcq, { type: 'true_false', value: true })).toEqual({ empty: true });
    expect(readDraft(mcq, { type: 'mcq', optionId: 'zz' })).toEqual({ empty: true });
  });

  it('are taken from storage only in a shape the question can use', () => {
    const mcq = ofType('mcq');
    const journal = ofType('journal_entry');
    expect(asDraft(mcq, { type: 'mcq', optionId: 'a' })).toEqual({ type: 'mcq', optionId: 'a' });
    for (const bad of [undefined, null, 'a', 7, [], {}, { type: 'mcq' }, { type: 'mcq', optionId: 3 }, { type: 'numeric', text: '5' }]) {
      expect(asDraft(mcq, bad), JSON.stringify(bad)).toBeUndefined();
    }
    expect(asDraft(journal, { type: 'journal_entry', rows: [{ accountId: 'cash', side: 'Dr', amount: '5' }] })).toBeDefined();
    expect(asDraft(journal, { type: 'journal_entry', rows: [{ accountId: 'cash', side: 'Debit', amount: '5' }] })).toBeUndefined();
    expect(asDraft(journal, { type: 'journal_entry', rows: 'none' })).toBeUndefined();
    // What storage gives back is what was put in.
    for (const { question } of steps) {
      const draft = rightDraft(question);
      expect(asDraft(question, JSON.parse(JSON.stringify(draft)))).toEqual(draft);
    }
  });
});

describe('the clock', () => {
  const record = { startedAt: T0, allowedMs: 40 * MIN };

  it('counts from the start that was stored, whatever happened to the app meanwhile', () => {
    expect(deadline(record)).toBe(T0 + 40 * MIN);
    expect(timeLeftMs(record, T0)).toBe(40 * MIN);
    expect(timeLeftMs(record, T0 + 15 * MIN + 500)).toBe(25 * MIN - 500);
    // Closed for half an hour and opened again: the half hour is gone.
    expect(timeLeftMs(record, T0 + 30 * MIN)).toBe(10 * MIN);
    expect(timeLeftMs(record, T0 + 40 * MIN)).toBe(0);
    expect(timeLeftMs(record, T0 + 3 * 60 * MIN)).toBe(0);
    // A device clock set back never gives more than the paper allows.
    expect(timeLeftMs(record, T0 - 60 * MIN)).toBe(40 * MIN);
  });

  it('is up at the deadline and not before', () => {
    expect(timeUp(record, T0 + 40 * MIN - 1)).toBe(false);
    expect(timeUp(record, T0 + 40 * MIN)).toBe(true);
    expect(timeUp(record, T0 + 41 * MIN)).toBe(true);
  });

  it('shows hours only while there are any, and a started second as a whole one', () => {
    expect(formatClock(180 * MIN)).toBe('3:00:00');
    expect(formatClock(180 * MIN - 1)).toBe('3:00:00');
    expect(formatClock(179 * MIN + 5000)).toBe('2:59:05');
    expect(formatClock(60 * MIN)).toBe('1:00:00');
    expect(formatClock(40 * MIN)).toBe('40:00');
    expect(formatClock(65_000)).toBe('1:05');
    expect(formatClock(999)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-5)).toBe('0:00');
  });

  it('says how long a paper took, never more than it allowed', () => {
    expect(timeTakenMs({ ...record, submittedAt: undefined })).toBeNull();
    expect(timeTakenMs({ ...record, submittedAt: T0 + 32 * MIN })).toBe(32 * MIN);
    expect(timeTakenMs({ ...record, submittedAt: T0 + 90 * MIN })).toBe(40 * MIN);
    expect(timeTakenMs({ ...record, submittedAt: T0 - 5 })).toBe(0);
  });

  it('puts lengths of time and days in words', () => {
    expect(formatDuration(180 * MIN)).toBe('3 hours');
    expect(formatDuration(90 * MIN)).toBe('1 hour 30 minutes');
    expect(formatDuration(40 * MIN)).toBe('40 minutes');
    expect(formatDuration(61 * MIN)).toBe('1 hour 1 minute');
    expect(formatDuration(59_000)).toBe('under a minute');
    expect(formatDay(T0)).toBe('5 Oct 2026');
  });

  it('allows each kind of paper the minutes of its blueprint', () => {
    for (const paper of [FULL, TEST]) expect(sitting(paper).allowedMs).toBe(BLUEPRINTS[paper.ref.kind].minutes * MIN);
    expect(sitting(FULL).allowedMs).toBe(180 * MIN);
    expect(startSitting({ id: 'x', sessionId: 's', profile: PROFILE, paper: TEST, now: T0, allowedMs: 5000 }).allowedMs).toBe(5000);
  });
});

describe('a paper in progress', () => {
  it('starts with nothing answered, on the first question', () => {
    const record = sitting(TEST);
    expect(record).toEqual({
      id: 'm1',
      profileId: 'p1',
      courseId: 'cbse-11-accountancy',
      paper: 'topic.ledger.1',
      sessionId: 's1',
      startedAt: T0,
      allowedMs: 40 * MIN,
      answers: {},
      flagged: [],
      timeMs: {},
      current: 0,
    });
    const states = stepStates(TEST, record);
    expect(states).toHaveLength(paperSteps(TEST).length);
    expect(states.every((s) => !s.answered && !s.flagged && s.problem === undefined)).toBe(true);
  });

  it('keeps answers, marks for review and time as they are given, and lets an answer be changed or cleared', () => {
    const [a, b, c] = paperSteps(TEST).map((s) => s.question);
    let record = sitting(TEST);
    record = withAnswer(record, a.id, wrongDraft(a));
    record = withAnswer(record, a.id, rightDraft(a));
    record = withAnswer(record, b.id, rightDraft(b));
    record = withAnswer(record, b.id, undefined);
    record = withFlag(record, c.id, true);
    record = withFlag(record, c.id, true);
    record = withFlag(record, a.id, true);
    record = withFlag(record, a.id, false);
    record = withTimeOn(record, a.id, 4000);
    record = withTimeOn(record, a.id, 2500.4);
    record = withTimeOn(record, b.id, 0);
    record = withTimeOn(record, b.id, -30);
    expect(record.answers).toEqual({ [a.id]: rightDraft(a) });
    expect(record.flagged).toEqual([c.id]);
    expect(record.timeMs).toEqual({ [a.id]: 6500 });
    const states = stepStates(TEST, record);
    expect(states.map((s) => s.answered)).toEqual(states.map((_, i) => i === 0));
    expect(states.map((s) => s.flagged)).toEqual(states.map((_, i) => i === 2));
  });

  it('counts an answer only once it can be marked, and says what is missing until then', () => {
    const numeric = paperSteps(TEST).find((s) => s.question.type === 'numeric')!;
    const record = withAnswer(sitting(TEST), numeric.question.id, { type: 'numeric', text: 'twelve' });
    const state = stepStates(TEST, record)[numeric.index];
    expect(state.answered).toBe(false);
    expect(state.problem).toMatch(/^Enter /);
  });

  it('is resumed from what the device stored: the answers, the marks for review, the place and the clock', () => {
    const steps = paperSteps(FULL);
    let record = sitting(FULL);
    steps.slice(0, 12).forEach((s) => (record = withAnswer(record, s.question.id, rightDraft(s.question))));
    record = withFlag(record, steps[3].question.id, true);
    record = withTimeOn({ ...record, current: 12 }, steps[11].question.id, 9000);
    // Storage keeps plain data; closing the app loses everything else.
    const stored: MockPaperRecord = JSON.parse(JSON.stringify(record));
    expect(stored).toEqual(record);
    const states = stepStates(FULL, stored);
    expect(states.filter((s) => s.answered).map((s) => s.step.index)).toEqual(steps.slice(0, 12).map((s) => s.index));
    expect(states.filter((s) => s.flagged).map((s) => s.step.index)).toEqual([3]);
    expect(resumeStep(stored, steps.length)).toBe(12);
    // An hour later the clock has an hour less, without having been told.
    expect(timeLeftMs(stored, T0 + 60 * MIN)).toBe(120 * MIN);
    expect(paperInProgress([stored])).toBe(stored);
  });

  it('opens on a question the paper has, whatever was stored', () => {
    expect(resumeStep({ current: 0 }, 10)).toBe(0);
    expect(resumeStep({ current: 9 }, 10)).toBe(9);
    expect(resumeStep({ current: 40 }, 10)).toBe(9);
    expect(resumeStep({ current: -1 }, 10)).toBe(0);
    expect(resumeStep({ current: 2.5 }, 10)).toBe(0);
    expect(resumeStep({ current: 3 }, 0)).toBe(0);
  });
});

describe('the number of a new paper', () => {
  it('is the next one of its kind, whatever the topic, counting papers that were started and not finished', () => {
    const papers = (...keys: string[]) => keys.map((paper) => ({ paper }));
    expect(nextPaperNumber('full', [])).toBe(1);
    expect(nextPaperNumber('full', papers('full.1', 'full.2', 'half.7'))).toBe(3);
    expect(nextPaperNumber('half', papers('full.1', 'full.2', 'half.7'))).toBe(8);
    expect(nextPaperNumber('topic', papers('topic.ledger.1', 'topic.cash-book.2', 'full.9'))).toBe(3);
    // A gap is not filled: a new paper is never one the learner has seen.
    expect(nextPaperNumber('full', papers('full.5', 'full.2'))).toBe(6);
    expect(nextPaperNumber('full', papers('nonsense', 'full.x'))).toBe(1);
  });

  it('tells the paper in progress from the papers submitted, the latest first', () => {
    const a = sitting(TEST, { id: 'a', submittedAt: T0 + 10 });
    const b = sitting(TEST, { id: 'b', submittedAt: T0 + 30 });
    const c = sitting(TEST, { id: 'c' });
    expect(paperInProgress([a, b, c])).toBe(c);
    expect(paperInProgress([a, b])).toBeUndefined();
    expect(submittedPapers([a, c, b]).map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('marking', () => {
  it('gives every mark for a paper answered right, and none for a paper left empty', () => {
    for (const paper of [FULL, TEST, buildPaper({ kind: 'half', number: 2 }), buildPaper({ kind: 'full', number: 1 }, PLAIN)]) {
      const steps = paperSteps(paper).length;
      const all = markPaper(paper, answersFor(paper, rightDraft));
      expect({ marks: all.marks, max: all.maxMarks, asked: all.asked, answered: all.answered, right: all.right }, paper.key).toEqual({
        marks: paper.marks,
        max: paper.marks,
        asked: steps,
        answered: steps,
        right: steps,
      });
      const none = markPaper(paper, {});
      expect({ marks: none.marks, max: none.maxMarks, answered: none.answered, right: none.right }, paper.key).toEqual({ marks: 0, max: paper.marks, answered: 0, right: 0 });
      expect(none.entries.flatMap((e) => e.steps).every((s) => s.response === null && s.result === null && !s.correct)).toBe(true);
    }
  });

  it('gives a single question all its marks or none', () => {
    const paper = buildPaper({ kind: 'full', number: 1 }, PLAIN);
    // Every third question right, the next wrong, the next left out.
    const marking = markPaper(paper, answersFor(paper, (q, i) => (i % 3 === 0 ? rightDraft(q) : i % 3 === 1 ? wrongDraft(q) : undefined)));
    // A single question is one answer. A set of entries or a format shares its marks among its parts, whatever
    // the bank holds of them and wherever one lands on the paper: a wrong answer to one may still earn some.
    const single = (e: (typeof marking.entries)[number]) => logicFor(e.entry.questions[0]).parts === undefined;
    marking.entries.forEach((e, i) => {
      if (i % 3 === 1 && !single(e)) expect(e.marks, `Q${e.entry.number}`).toBeLessThan(e.entry.marks);
      else expect(e.marks, `Q${e.entry.number}`).toBe(i % 3 === 0 ? e.entry.marks : 0);
      expect(e.steps[0].response === null, `Q${e.entry.number}`).toBe(i % 3 === 2);
      expect(e.steps[0].correct, `Q${e.entry.number}`).toBe(i % 3 === 0);
    });
    const singles = marking.entries.map((e, i) => ({ e, i })).filter(({ e }) => single(e));
    expect(singles.length).toBeGreaterThan(20);
    expect(singles.reduce((sum, { e }) => sum + e.marks, 0)).toBe(singles.filter(({ i }) => i % 3 === 0).reduce((sum, { e }) => sum + e.entry.marks, 0));
    expect(marking.marks).toBe(marking.entries.reduce((sum, e) => sum + e.marks, 0));
    expect(marking.answered).toBe(paper.entries.filter((_, i) => i % 3 !== 2).length);
    // A wrong answer carries what the check found, as the player's feedback does.
    const wrong = singles.find(({ i }) => i % 3 === 1)!.e.steps[0];
    expect(wrong.result).toMatchObject({ correct: false });
    expect(wrong.draft).toEqual(wrongDraft(wrong.step.question));
  });

  it('shares the marks of a case among its questions, to the nearest half mark', () => {
    const entry = FULL.entries.find((e) => e.caseId !== undefined);
    // Holds while no stage has a case: then there is no case to mark.
    if (!entry) return;
    const parts = entry.questions.length;
    for (let right = 0; right <= parts; right++) {
      const answers = Object.fromEntries(entry.questions.map((q, i) => [q.id, i < right ? rightDraft(q) : wrongDraft(q)]));
      const marked = markPaper(FULL, answers).entries.find((e) => e.entry === entry)!;
      expect(marked.marks, `${right} of ${parts}`).toBe(Math.round(((6 * right) / parts) * 2) / 2);
      expect(marked.steps.filter((s) => s.correct)).toHaveLength(right);
    }
    // A part left out earns nothing but takes nothing from the others.
    const [first] = entry.questions;
    expect(markPaper(FULL, { [first.id]: rightDraft(first) }).entries.find((e) => e.entry === entry)!.marks).toBe(Math.round((6 / parts) * 2) / 2);
  });

  describe('a chained case study', () => {
    // The first week of a shop: a set of five entries, Cash A/c of five rows and a trial balance of six.
    const [set, account, statement] = generateCase(SAMPLE_CHAIN, 7);
    const caseOf = (template: typeof SAMPLE_CHAIN, questions: Question[]): MockPaper => ({
      ref: { kind: 'topic', topicId: template.topicId, number: 1 },
      key: `topic.${template.topicId}.1`,
      title: 'Topic test 1',
      marks: 6,
      minutes: 40,
      blueprint: BLUEPRINTS.topic,
      entries: [{ number: 1, marks: 6, section: 0, topicId: template.topicId, caseId: template.id, caseTitle: template.title, questions }],
    });
    const paper = caseOf(SAMPLE_CHAIN, [set, account, statement]);
    const mark = (answers: Record<string, unknown>) => markPaper(paper, answers);
    const right = { [set.id]: rightDraft(set), [account.id]: rightDraft(account), [statement.id]: rightDraft(statement) };
    /** The set with its first entry the wrong way round: four of five entries right. */
    const setDraft = rightDraft(set);
    if (setDraft.type !== 'journal_set' || account.type !== 'account' || statement.type !== 'statement') throw new Error('unexpected kinds');
    const fourOfFive = { ...setDraft, entries: [setDraft.entries[0].map((l) => ({ ...l, side: l.side === 'Dr' ? 'Cr' : 'Dr' })), ...setDraft.entries.slice(1)] };

    it('is told from a case of short questions by its long parts', () => {
      expect(hasLongPart(paper.entries[0])).toBe(true);
      expect(hasLongPart(caseOf(SAMPLE_CASE, generateCase(SAMPLE_CASE, 7)).entries[0])).toBe(false);
      // A set or a format that is a question of its own is not a case at all.
      expect(hasLongPart({ ...paper.entries[0], caseId: undefined, questions: [account] })).toBe(false);
    });

    it('earns all six marks when every part is wholly right, and none when nothing is entered', () => {
      expect(mark(right)).toMatchObject({ marks: 6, maxMarks: 6, asked: 3, answered: 3, right: 3 });
      expect(mark({})).toMatchObject({ marks: 0, asked: 3, answered: 0, right: 0 });
    });

    it('gives every part a credit from 0 to 1: a format by its rows, a set by its entries, as each is marked alone', () => {
      expect([set, account, statement].map((q) => logicFor(q).parts?.(q).count)).toEqual([5, 5, 6]);
      const credits = (answers: Record<string, unknown>) => mark(answers).entries[0].steps.map((s) => partCredit(s.result));
      expect(credits(right)).toEqual([{ right: 5, total: 5 }, { right: 5, total: 5 }, { right: 6, total: 6 }]);
      // Nothing entered is no credit, whatever the part.
      expect(credits({})).toEqual([{ right: 0, total: 1 }, { right: 0, total: 1 }, { right: 0, total: 1 }]);
      // One entry wrong, one row of the account missing, one row of the statement missing.
      const partly = { [set.id]: fourOfFive, [account.id]: wrongDraft(account), [statement.id]: wrongDraft(statement) };
      expect(credits(partly)).toEqual([{ right: 4, total: 5 }, { right: 4, total: 5 }, { right: 5, total: 6 }]);
      // The credit of a part is what the check of the player says of it.
      for (const step of mark(partly).entries[0].steps) expect(step.result).toEqual(checkAnswer(step.step.question, step.response!));
    });

    it('earns six marks times the average credit of its parts, to the nearest half mark', () => {
      // 6 x (4/5 + 1 + 1) / 3 = 5.6, so 5.5; with all-or-nothing parts it would have been 4.
      const oneEntryWrong = mark({ ...right, [set.id]: fourOfFive });
      expect(oneEntryWrong).toMatchObject({ marks: 5.5, right: 2 });
      expect(oneEntryWrong.entries[0].steps.map((s) => s.correct)).toEqual([false, true, true]);
      // 6 x (4/5 + 4/5 + 5/6) / 3 = 4.87, so 5, though no part is wholly right.
      const partly = mark({ [set.id]: fourOfFive, [account.id]: wrongDraft(account), [statement.id]: wrongDraft(statement) });
      expect(partly).toMatchObject({ marks: 5, right: 0, answered: 3 });
      // A part left out earns nothing and takes nothing from the others: 6 x (1 + 0 + 1) / 3 = 4.
      expect(mark({ [set.id]: rightDraft(set), [statement.id]: rightDraft(statement) })).toMatchObject({ marks: 4, answered: 2 });
      // 6 x (0 + 4/5 + 0) / 3 = 1.6, so 1.5.
      expect(mark({ [account.id]: wrongDraft(account) }).marks).toBe(1.5);
    });

    it('takes one right row away for every row that should not be there, never below none', () => {
      const draft = rightDraft(account);
      if (draft.type !== 'account') throw new Error('not an account');
      const extra = (n: number) => Array.from({ length: n }, (_, i) => ({ label: 'Cash A/c', amounts: [String(100 + i)] }));
      const withExtras = (n: number) => mark({ ...right, [account.id]: { ...draft, sides: [[...draft.sides[0], ...extra(n)], draft.sides[1]] } });
      // Every row right and one extra: 4 of 5 count. 6 x (1 + 4/5 + 1) / 3 = 5.6, so 5.5.
      expect(partCredit(withExtras(1).entries[0].steps[1].result)).toEqual({ right: 4, total: 5 });
      expect(withExtras(1)).toMatchObject({ marks: 5.5, right: 2 });
      // Seven extra rows cannot take more than the five right ones: the part earns nothing, the others keep theirs.
      expect(partCredit(withExtras(7).entries[0].steps[1].result)).toEqual({ right: 0, total: 5 });
      expect(withExtras(7).marks).toBe(4);
    });

    it('marks a case of short questions exactly as before: its marks times the share of its questions that are right', () => {
      const questions = generateCase(SAMPLE_CASE, 7);
      const short = caseOf(SAMPLE_CASE, questions);
      for (let rightCount = 0; rightCount <= questions.length; rightCount++) {
        const answers = Object.fromEntries(questions.map((q, i) => [q.id, i < rightCount ? rightDraft(q) : wrongDraft(q)]));
        const marked = markPaper(short, answers).entries[0];
        expect(marked.marks, `${rightCount} of ${questions.length}`).toBe(caseMarks(6, rightCount, questions.length));
        expect(marked.steps.map((s) => partCredit(s.result))).toEqual(questions.map((_, i) => ({ right: i < rightCount ? 1 : 0, total: 1 })));
      }
    });

    it('says the rule under the case, and what each long part earned of its share', () => {
      expect(chainedRuleText(6, 3)).toBe(
        'The 6 marks are shared equally by the 3 parts, 2 marks each. An account, a statement or a set of entries earns its share for the rows or entries that are right. The total is rounded to the nearest half mark.',
      );
      expect(chainedRuleText(6, 4)).toContain('by the 4 parts, 1.5 marks each.');
      expect(chainedRuleText(6, 2)).toContain('by the 2 parts, 3 marks each.');
      const draft = rightDraft(account);
      if (draft.type !== 'account') throw new Error('not an account');
      const marked = mark({
        [set.id]: fourOfFive,
        [account.id]: { ...draft, sides: [[...draft.sides[0].slice(1), { label: 'Cash A/c', amounts: ['100'] }, { label: 'Cash A/c', amounts: ['200'] }], draft.sides[1]] },
        [statement.id]: rightDraft(statement),
      }).entries[0];
      expect(marked.steps.map((s) => partCreditText(s.result, 2))).toEqual([
        "4 of 5 entries right: 4/5 of this part's 2 marks.",
        "4 of 5 rows right, and 2 rows that should not be there take as many right rows away: 2/5 of this part's 2 marks.",
        "6 of 6 rows right: all of this part's 2 marks.",
      ]);
      const oneExtra = mark({ ...right, [account.id]: { ...draft, sides: [[...draft.sides[0], { label: 'Cash A/c', amounts: ['100'] }], draft.sides[1]] } }).entries[0];
      expect(partCreditText(oneExtra.steps[1].result, 1.5)).toBe("5 of 5 rows right, and 1 row that should not be there takes one right row away: 4/5 of this part's 1.5 marks.");
      // A short part is right or wrong, and a part not answered says so itself: neither has a line of its own.
      expect(partCreditText({ correct: true }, 2)).toBeNull();
      expect(partCreditText(null, 2)).toBeNull();
      expect(partCreditText({ correct: false, parts: { right: 0, total: 5 } }, 3)).toBe("0 of 5 entries right: none of this part's 3 marks.");
    });

    it('records each part as one attempt, right only when the whole part is, and the marks of the case in the result', () => {
      const answers = { ...right, [set.id]: fourOfFive };
      const marking = mark(answers);
      const { attempts, result } = sittingEvents(sitting(paper, { answers }), marking, T0 + 30 * MIN);
      expect(attempts.map((a) => [a.questionId, a.correct])).toEqual([[set.id, false], [account.id, true], [statement.id, true]]);
      expect(attempts[0].mistakeCode).toMatch(/^set:/);
      expect(result).toMatchObject({ correct: 5, total: 6 });
    });
  });

  describe('a set of journal entries', () => {
    const JE = 'journal-entries';
    // The first topic tests on Journal Entries that ask a set for 3 marks and for 4.
    const withSet = (marks: number) => {
      for (let number = 1; number <= 200; number++) {
        const paper = buildPaper({ kind: 'topic', topicId: JE, number });
        const entry = paper.entries.find((e) => e.marks === marks && e.questions[0].type === 'journal_set');
        if (entry) return { paper, entry };
      }
      throw new Error(`no topic test asks a set for ${marks} marks`);
    };
    const rows = (lines: { accountId: string; side: 'Dr' | 'Cr'; amount: number }[], wrong = false) =>
      lines.map((l) => ({ accountId: l.accountId, side: wrong ? (l.side === 'Dr' ? 'Cr' : 'Dr') : l.side, amount: String(l.amount / 100) }));

    it.each([3, 4])('shares its %i marks among its entries, to the nearest half mark', (marks) => {
      const { paper, entry } = withSet(marks);
      const [q] = entry.questions;
      if (q.type !== 'journal_set') throw new Error('not a set');
      const count = q.entries.length;
      for (let right = 0; right <= count; right++) {
        // The first `right` entries right, the others with their sides the wrong way round.
        const draft = { type: 'journal_set', entries: q.entries.map((e, i) => rows(e.expected, i >= right)) };
        const marking = markPaper(paper, { [q.id]: draft });
        const marked = marking.entries.find((e) => e.entry === entry)!;
        expect(marked.marks, `${right} of ${count}`).toBe(caseMarks(marks, right, count));
        expect(marked.marks, `${right} of ${count}`).toBe(Math.round(((marks * right) / count) * 2) / 2);
        expect(marked.steps[0].result?.parts).toEqual({ right, total: count });
        // The question itself is right only when every entry is.
        expect(marked.steps[0].correct).toBe(right === count);
        expect(marking.right).toBe(right === count ? 1 : 0);
        expect(marking.marks).toBe(marked.marks);
      }
    });

    it('marks the entries that were written and counts the others as not right, without calling the set unanswered', () => {
      const { paper, entry } = withSet(4);
      const [q] = entry.questions;
      if (q.type !== 'journal_set') throw new Error('not a set');
      const count = q.entries.length;
      const first = { type: 'journal_set', entries: q.entries.map((e, i) => (i === 0 ? rows(e.expected) : [])) };
      const marked = markPaper(paper, { [q.id]: first }).entries.find((e) => e.entry === entry)!;
      expect(marked.marks).toBe(caseMarks(4, 1, count));
      expect(marked.steps[0]).toMatchObject({ correct: false, response: { type: 'journal_set' } });
      const state = stepStates(paper, { answers: { [q.id]: first }, flagged: [] }).find((s) => s.step.entry === entry)!;
      expect(state).toMatchObject({ answered: true });
      expect(state.problem).toBeUndefined();
      // An entry that is begun and cannot be read is not marked, the others are, and the paper says which it is.
      const begun = { type: 'journal_set', entries: q.entries.map((e, i) => (i === 1 ? [{ accountId: 'cash', side: '', amount: '5' }] : rows(e.expected))) };
      expect(markPaper(paper, { [q.id]: begun }).entries.find((e) => e.entry === entry)!.marks).toBe(caseMarks(4, count - 1, count));
      expect(stepStates(paper, { answers: { [q.id]: begun }, flagged: [] }).find((s) => s.step.entry === entry)).toMatchObject({
        answered: true,
        problem: 'Entry 2, line 1: choose Dr or Cr.',
      });
      // Nothing written at all: not answered, no marks, no attempt.
      const none = markPaper(paper, {});
      expect(none.entries.find((e) => e.entry === entry)).toMatchObject({ marks: 0, steps: [{ response: null, result: null }] });
    });

    it('is recorded as one attempt, with which entries were right in its mistake code', () => {
      const { paper, entry } = withSet(3);
      const [q] = entry.questions;
      if (q.type !== 'journal_set') throw new Error('not a set');
      const answers = { [q.id]: { type: 'journal_set', entries: q.entries.map((e, i) => rows(e.expected, i === 1)) } };
      const record = sitting(paper, { answers });
      const marking = markPaper(paper, answers);
      const { attempts, result } = sittingEvents(submitSitting(record, marking, T0 + MIN), marking, T0 + MIN);
      expect(attempts).toHaveLength(1);
      expect(attempts[0]).toMatchObject({
        questionId: q.id,
        conceptId: 'je-sets',
        correct: false,
        mistakeCode: `set:${q.entries.map((_, i) => (i === 1 ? 'sidesReversed' : 'ok')).join(',')}`,
      });
      // The set was not right, so the attempt keeps the entries as they were marked: the Mistakes screen shows them.
      // (The paper has the answer as it was typed; nothing else of it is stored twice.)
      expect(attempts[0].answer).toEqual(marking.entries.find((e) => e.entry === entry)!.steps[0].response);
      expect(attempts[0].answer).toMatchObject({ type: 'journal_set', entries: q.entries.map((e, i) => (i === 1 ? e.expected.map((l) => ({ ...l, side: l.side === 'Dr' ? 'Cr' : 'Dr' })) : e.expected)) });
      // Every entry right: an attempt with nothing kept.
      const allRight = { [q.id]: { type: 'journal_set', entries: q.entries.map((e) => rows(e.expected)) } };
      const marked = markPaper(paper, allRight);
      const [rightAttempt] = sittingEvents(submitSitting(sitting(paper, { answers: allRight }), marked, T0 + MIN), marked, T0 + MIN).attempts;
      expect(rightAttempt).toMatchObject({ questionId: q.id, correct: true });
      expect(rightAttempt).not.toHaveProperty('answer');
      // Whole marks in the session result: a half mark is dropped.
      expect(result.correct).toBe(Math.floor(caseMarks(3, q.entries.length - 1, q.entries.length)));
    });
  });

  it('does not mark an answer that is not complete', () => {
    const numeric = paperSteps(TEST).find((s) => s.question.type === 'numeric')!;
    const marking = markPaper(TEST, { [numeric.question.id]: { type: 'numeric', text: 'about 500' } });
    const step = marking.entries.flatMap((e) => e.steps).find((s) => s.step.index === numeric.index)!;
    expect(step).toMatchObject({ response: null, result: null, correct: false, draft: { type: 'numeric', text: 'about 500' } });
    expect(marking.answered).toBe(0);
  });

  it('writes marks and percentages plainly', () => {
    expect([14, 14.5, 0, 80].map(formatMarks)).toEqual(['14', '14.5', '0', '80']);
    expect(percentOf(14.5, 20)).toBe(73);
    expect(percentOf(40, 80)).toBe(50);
    expect(percentOf(0, 0)).toBe(0);
  });
});

describe('where the marks were earned', () => {
  const paper = buildPaper({ kind: 'full', number: 2 });
  const marking = markPaper(paper, answersFor(paper, (q, i) => (i % 2 === 0 ? rightDraft(q) : wrongDraft(q))));
  const sum = (shares: { marks: number; max: number }[]) => ({ marks: shares.reduce((a, s) => a + s.marks, 0), max: shares.reduce((a, s) => a + s.max, 0) });

  it('is told by part, by unit and by topic, each adding up to the paper', () => {
    const total = { marks: marking.marks, max: 80 };
    expect(sum(marksByPart(marking))).toEqual(total);
    expect(sum(marksByUnit(marking, BANK))).toEqual(total);
    expect(sum(marksByTopic(marking, BANK))).toEqual(total);
    expect(marksByPart(marking).map((s) => [s.label, s.max])).toEqual([['Part A', 56], ['Part B', 24]]);
    expect(marksByUnit(marking, BANK).map((s) => [s.label, s.max])).toEqual([
      ['Theoretical Framework', 12],
      ['Accounting Process', 44],
      ['Financial Statements', 24],
    ]);
    // Topics in course order, each with the marks its questions carry.
    const topics = marksByTopic(marking, BANK);
    const order = BANK.topics.map((t) => t.id);
    expect(topics.map((s) => order.indexOf(s.key))).toEqual([...topics.map((s) => order.indexOf(s.key))].sort((a, b) => a - b));
    for (const share of topics) {
      expect(share.max, share.key).toBe(paper.entries.filter((e) => e.topicId === share.key).reduce((a, e) => a + e.marks, 0));
      expect(share.label).toBe(BANK.topics.find((t) => t.id === share.key)!.title);
    }
  });

  it('has no parts to tell on a paper without parts', () => {
    expect(marksByPart(markPaper(TEST, {}))).toEqual([]);
    expect(marksByTopic(markPaper(TEST, {}), BANK)).toEqual([{ key: 'ledger', label: BANK.topics.find((t) => t.id === 'ledger')!.title, marks: 0, max: 20 }]);
  });

  it('points out the weakest topics: the smallest share earned first, then the most marks lost, and none that lost nothing', () => {
    const share = (key: string, marks: number, max: number) => ({ key, label: key, marks, max });
    const shares = [share('a', 4, 4), share('b', 1, 4), share('c', 0, 1), share('d', 0, 6), share('e', 3, 6), share('f', 5.5, 6)];
    expect(weakestTopics(shares).map((s) => s.key)).toEqual(['d', 'c', 'b']);
    expect(weakestTopics(shares, 5).map((s) => s.key)).toEqual(['d', 'c', 'b', 'e', 'f']);
    expect(weakestTopics([share('a', 4, 4)])).toEqual([]);
    expect(weakestTopics(marksByTopic(markPaper(paper, answersFor(paper, rightDraft)), BANK))).toEqual([]);
    expect(weakestTopics(marksByTopic(marking, BANK)).length).toBeLessThanOrEqual(3);
  });
});

describe('handing in', () => {
  const steps = paperSteps(TEST);
  // Right, wrong, left out, right, not complete, and the rest left out.
  const answers = {
    [steps[0].question.id]: rightDraft(steps[0].question),
    [steps[1].question.id]: wrongDraft(steps[1].question),
    [steps[3].question.id]: rightDraft(steps[3].question),
    [steps[6].question.id]: { type: 'numeric', text: 'no idea' },
  };
  const record = sitting(TEST, { answers, timeMs: { [steps[0].question.id]: 7000 } });
  const marking = markPaper(TEST, answers);

  it('fixes the marks and the moment: now, or the end of the time when the clock ran out', () => {
    const early = submitSitting(record, marking, T0 + 12 * MIN);
    expect(early).toEqual({ ...record, submittedAt: T0 + 12 * MIN, marks: 2, maxMarks: 20 });
    // Found the next morning: the paper was over when its forty minutes were.
    expect(submitSitting(record, marking, T0 + 20 * 60 * MIN).submittedAt).toBe(T0 + 40 * MIN);
    expect(timeTakenMs(submitSitting(record, marking, T0 + 20 * 60 * MIN))).toBe(40 * MIN);
    // A paper already handed in stays as it was.
    expect(submitSitting(early, markPaper(TEST, {}), T0 + 30 * MIN)).toBe(early);
  });

  it('records an attempt for every answered question as for any other, and none for a question left out', () => {
    const submitted = submitSitting(record, marking, T0 + 12 * MIN);
    const at = T0 + 12 * MIN + 50;
    const { attempts, result } = sittingEvents(submitted, marking, at);
    expect(attempts.map((a) => a.questionId)).toEqual([steps[0].question.id, steps[1].question.id, steps[3].question.id]);
    expect(attempts.map((a) => a.correct)).toEqual([true, false, true]);
    const [first, second] = attempts;
    expect(first).toEqual({
      id: 'm1:0',
      profileId: 'p1',
      courseId: 'cbse-11-accountancy',
      topicId: steps[0].question.topicId,
      conceptId: steps[0].question.conceptId,
      questionId: steps[0].question.id,
      difficulty: steps[0].question.difficulty,
      correct: true,
      hintsUsed: 0,
      timeMs: 7000,
      at,
      sessionId: 's1',
      sessionKind: 'mock',
    });
    expect(second).toMatchObject({ id: 'm1:1', correct: false, hintsUsed: 0, timeMs: 0, at: at + 1 });
    // Only a long question that was missed keeps its answer.
    for (const a of attempts) expect('answer' in a, a.questionId).toBe(!a.correct && ['journal_set', 'account', 'statement'].includes(steps.find((s) => s.question.id === a.questionId)!.question.type));
    // In the order of the paper, each with an id of its own that follows from the paper.
    expect(attempts.map((a) => a.at)).toEqual([at, at + 1, at + 2]);
    expect(new Set(attempts.map((a) => a.id)).size).toBe(3);
    expect(sittingEvents(submitted, marking, at)).toEqual({ attempts, result });
    expect(result).toEqual({
      id: 'm1:result',
      profileId: 'p1',
      courseId: 'cbse-11-accountancy',
      kind: 'mock',
      sessionId: 's1',
      day: '2026-10-05',
      correct: 2,
      total: 20,
      at: at + 3,
    });
  });

  it('writes whole marks in the session result, a half mark dropped', () => {
    const entry = FULL.entries.find((e) => e.caseId !== undefined);
    if (!entry) return;
    // One part of a case right: a share of 6 marks that may end in a half.
    const full = sitting(FULL, { answers: { [entry.questions[0].id]: rightDraft(entry.questions[0]) } });
    const marked = markPaper(FULL, full.answers);
    const { attempts, result } = sittingEvents(submitSitting(full, marked, T0 + MIN), marked, T0 + MIN);
    expect(attempts).toHaveLength(1);
    expect(result.correct).toBe(Math.floor(marked.marks));
    expect(result.total).toBe(80);
  });
});
