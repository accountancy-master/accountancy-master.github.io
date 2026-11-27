import { checkAnswer, type CheckResult, type Response } from '@/exercises/checkers';
import { answerToKeep } from '@/exercises/logic';
import { dayKey } from '@/learning/gamification';
import { caseMarks, creditMarks, paperSteps, parsePaperKey, type Credit, type MockPaper, type PaperBank, type PaperEntry, type PaperStep } from '@/learning/mockPaper';
import type { PaperKind } from '@/learning/paperBlueprints';
import type { AttemptEvent, MockPaperRecord, SessionResult } from '@/storage/types';
import { isLongQuestion } from './caseStudy';
import { asDraft, readDraft, type Draft } from './drafts';

// ---------------------------------------------------------------------------------------------------------------
// The clock. Only the start is stored, never the time left: the clock runs on while the app is closed, so a paper
// cannot be paused.
// ---------------------------------------------------------------------------------------------------------------

type Clock = Pick<MockPaperRecord, 'startedAt' | 'allowedMs'>;

/** The moment the paper is handed in by the clock. */
export const deadline = (record: Clock): number => record.startedAt + record.allowedMs;

/** Time left at `now`, never below zero. A clock set back before the start gives no more than the time allowed. */
export const timeLeftMs = (record: Clock, now: number): number => Math.min(record.allowedMs, Math.max(0, deadline(record) - now));

export const timeUp = (record: Clock, now: number): boolean => timeLeftMs(record, now) <= 0;

/** How long a submitted paper took: from its start to when it was handed in, never more than the time allowed. */
export function timeTakenMs(record: Clock & Pick<MockPaperRecord, 'submittedAt'>): number | null {
  if (record.submittedAt === undefined) return null;
  return Math.min(record.allowedMs, Math.max(0, record.submittedAt - record.startedAt));
}

const two = (n: number) => String(n).padStart(2, '0');

/** A countdown as it is shown: "2:59:05", and "39:05" in the last hour. A started second counts as a whole one. */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

/** A length of time in words: "3 hours", "1 hour 30 minutes", "40 minutes", "under a minute". */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes === 0) return 'under a minute';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h === 0 ? '' : `${h} ${h === 1 ? 'hour' : 'hours'}`;
  const mins = m === 0 ? '' : `${m} ${m === 1 ? 'minute' : 'minutes'}`;
  return [hours, mins].filter(Boolean).join(' ');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A local day as the history shows it: "5 Oct 2026". */
export function formatDay(at: number): string {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Starting, and what is stored as the learner goes.
// ---------------------------------------------------------------------------------------------------------------

/** The paper still being sat, if there is one. A learner sits one paper at a time. */
export const paperInProgress = (records: readonly MockPaperRecord[]): MockPaperRecord | undefined =>
  records.find((r) => r.submittedAt === undefined);

/** The submitted papers, the latest first. */
export const submittedPapers = (records: readonly MockPaperRecord[]): MockPaperRecord[] =>
  records.filter((r) => r.submittedAt !== undefined).sort((a, b) => b.submittedAt! - a.submittedAt! || (a.id < b.id ? 1 : -1));

/**
 * The number "New paper" gives for a kind: one more than the highest number of that kind the learner has started
 * (finished or not, whatever its topic), so a new paper is never one they have seen.
 */
export function nextPaperNumber(kind: PaperKind, records: readonly Pick<MockPaperRecord, 'paper'>[]): number {
  let top = 0;
  for (const r of records) {
    const ref = parsePaperKey(r.paper);
    if (ref?.kind === kind) top = Math.max(top, ref.number);
  }
  return top + 1;
}

/** A paper as it is when the learner presses Start: no answers yet, the clock running from `now`. */
export function startSitting(input: {
  id: string;
  sessionId: string;
  profile: { id: string; courseId: string };
  paper: MockPaper;
  now: number;
  /** The time allowed when it is not the paper's own (the end-to-end tests shorten it). */
  allowedMs?: number;
}): MockPaperRecord {
  return {
    id: input.id,
    profileId: input.profile.id,
    courseId: input.profile.courseId,
    paper: input.paper.key,
    sessionId: input.sessionId,
    startedAt: input.now,
    allowedMs: input.allowedMs ?? input.paper.minutes * 60_000,
    answers: {},
    flagged: [],
    timeMs: {},
    current: 0,
  };
}

/** The record with one answer set, or with it taken out when the draft is left out. */
export function withAnswer(record: MockPaperRecord, questionId: string, draft: Draft | undefined): MockPaperRecord {
  const answers = { ...record.answers };
  if (draft === undefined) delete answers[questionId];
  else answers[questionId] = draft;
  return { ...record, answers };
}

/** The record with a question marked for review, or no longer marked. */
export function withFlag(record: MockPaperRecord, questionId: string, on: boolean): MockPaperRecord {
  const flagged = record.flagged.filter((id) => id !== questionId);
  return { ...record, flagged: on ? [...flagged, questionId] : flagged };
}

/** The record after `spentMs` more on a question. */
export function withTimeOn(record: MockPaperRecord, questionId: string, spentMs: number): MockPaperRecord {
  if (!(spentMs > 0)) return record;
  return { ...record, timeMs: { ...record.timeMs, [questionId]: (record.timeMs[questionId] ?? 0) + Math.round(spentMs) } };
}

/** The step a resumed paper opens on: where the learner was, kept inside the paper. */
export const resumeStep = (record: Pick<MockPaperRecord, 'current'>, steps: number): number =>
  Number.isInteger(record.current) ? Math.min(Math.max(0, record.current), Math.max(0, steps - 1)) : 0;

// ---------------------------------------------------------------------------------------------------------------
// The palette: every question, answered or not, marked for review or not.
// ---------------------------------------------------------------------------------------------------------------

export interface StepState {
  step: PaperStep;
  /** The answer can be marked. Something begun but not complete (see `problem`) does not count. */
  answered: boolean;
  flagged: boolean;
  /**
   * Why what was entered cannot be marked yet, in the words of the answer inputs. A set of entries can be answered
   * and still have one: the entry it names is not marked, the others are.
   */
  problem?: string;
}

export function stepStates(paper: MockPaper, record: Pick<MockPaperRecord, 'answers' | 'flagged'>): StepState[] {
  const flagged = new Set(record.flagged);
  return paperSteps(paper).map((step) => {
    const read = readDraft(step.question, asDraft(step.question, record.answers[step.question.id]));
    return {
      step,
      answered: 'response' in read,
      flagged: flagged.has(step.question.id),
      ...('problem' in read ? { problem: read.problem } : {}),
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Marking.
// ---------------------------------------------------------------------------------------------------------------

export interface MarkedStep {
  step: PaperStep;
  /** The learner's answer as it was left, to show it again; undefined when there was none. */
  draft?: Draft;
  /** The answer that was marked; null for a question not answered (nothing entered, or nothing complete). */
  response: Response | null;
  result: CheckResult | null;
  correct: boolean;
}

export interface MarkedEntry {
  entry: PaperEntry;
  steps: MarkedStep[];
  /** Marks earned: all or none for a single question, a share to the nearest half mark for a case or a set of entries. */
  marks: number;
}

/**
 * What one part of a case earns of its share of the case's marks. A part marked piece by piece earns by its pieces:
 * a format, the rows that count (its right rows less its extra rows, never below none) of the rows expected, as a
 * format that stands alone is marked; a set of entries, the entries that are right of its entries. Any other part
 * is right or wrong: 1 of 1, or 0 of 1. A part with no answer earns nothing.
 */
export function partCredit(result: CheckResult | null): Credit {
  if (result?.parts && result.parts.total > 0) return { right: result.parts.right, total: result.parts.total };
  return { right: result?.correct ? 1 : 0, total: 1 };
}

/** True for a case that has a part marked piece by piece (a chained case): its marks then follow the credits of its parts. */
export const hasLongPart = (entry: PaperEntry): boolean => entry.caseId !== undefined && entry.questions.some(isLongQuestion);

export interface Marking {
  entries: MarkedEntry[];
  marks: number;
  maxMarks: number;
  /** Everything the learner could answer (a part of a case counts as one), and how much of it they did. */
  asked: number;
  answered: number;
  right: number;
}

/**
 * The paper marked against the answers. A single question earns its marks when it is right; a case earns its marks
 * times the share of its questions that are right, to the nearest half mark, and a question marked part by part (a
 * set of entries) its marks times the share of its parts that are right, in the same way. In a chained case a part
 * that is itself a format or a set counts for as much of its share as it has right (see `partCredit`): the case
 * earns its marks times the average credit of its parts. A question with no answer earns nothing and is not an attempt.
 */
export function markPaper(paper: MockPaper, answers: Record<string, unknown>): Marking {
  const steps = paperSteps(paper);
  const entries = paper.entries.map((entry): MarkedEntry => {
    const marked = steps
      .filter((s) => s.entry === entry)
      .map((step): MarkedStep => {
        const draft = asDraft(step.question, answers[step.question.id]);
        const read = readDraft(step.question, draft);
        const response = 'response' in read ? read.response : null;
        const result = response ? checkAnswer(step.question, response) : null;
        return { step, ...(draft ? { draft } : {}), response, result, correct: result?.correct === true };
      });
    const right = marked.filter((m) => m.correct).length;
    const parts = marked.length === 1 ? marked[0].result?.parts : undefined;
    const marks =
      entry.caseId !== undefined
        ? creditMarks(entry.marks, marked.map((m) => partCredit(m.result)))
        : parts
          ? caseMarks(entry.marks, parts.right, parts.total)
          : right === marked.length
            ? entry.marks
            : 0;
    return { entry, steps: marked, marks };
  });
  const all = entries.flatMap((e) => e.steps);
  return {
    entries,
    marks: entries.reduce((sum, e) => sum + e.marks, 0),
    maxMarks: entries.reduce((sum, e) => sum + e.entry.marks, 0),
    asked: all.length,
    answered: all.filter((s) => s.response !== null).length,
    right: all.filter((s) => s.correct).length,
  };
}

/** Marks as they are written: "14", "14.5". */
export const formatMarks = (marks: number): string => (Number.isInteger(marks) ? String(marks) : marks.toFixed(1));

/** "2 marks", "1.5 marks", "1 mark". */
const marksText = (marks: number): string => `${formatMarks(marks)} ${marks === 1 ? 'mark' : 'marks'}`;

/** How a chained case is marked, as its marked script says it under the heading of the case. */
export const chainedRuleText = (marks: number, parts: number): string =>
  `The ${marks} marks are shared equally by the ${parts} parts, ${marksText(marks / parts)} each. An account, a statement or a set of entries earns its share for the rows or entries that are right. The total is rounded to the nearest half mark.`;

/**
 * What a long part of a chained case earned, as its marked script says it: how many rows (or entries) were right,
 * what the extra rows took away, and the share of the part's marks that leaves. Nothing for a short part, which is
 * right or wrong, and nothing for a part that was not answered.
 */
export function partCreditText(result: CheckResult | null, share: number): string | null {
  if (!result?.parts || result.parts.total <= 0) return null;
  const { right, total } = result.parts;
  const earned = right >= total ? 'all' : right <= 0 ? 'none' : `${right}/${total}`;
  const extra = result.format?.extra ?? 0;
  const counted = result.format
    ? `${result.format.right} of ${total} rows right${extra > 0 ? `, and ${extra === 1 ? '1 row that should not be there takes' : `${extra} rows that should not be there take`} ${extra === 1 ? 'one right row' : 'as many right rows'} away` : ''}`
    : `${right} of ${total} entries right`;
  return `${counted}: ${earned} of this part's ${marksText(share)}.`;
}

/** Marks earned as a whole percentage of the marks there were. */
export const percentOf = (marks: number, max: number): number => (max > 0 ? Math.round((marks / max) * 100) : 0);

/** The marks earned and the marks there were, for one part, unit or topic of a paper. */
export interface Share {
  key: string;
  label: string;
  marks: number;
  max: number;
}

function shares(marking: Marking, keyOf: (entry: PaperEntry) => { key: string; label: string } | null): Share[] {
  const out: Share[] = [];
  for (const { entry, marks } of marking.entries) {
    const k = keyOf(entry);
    if (!k) continue;
    let share = out.find((s) => s.key === k.key);
    if (!share) out.push((share = { ...k, marks: 0, max: 0 }));
    share.marks += marks;
    share.max += entry.marks;
  }
  return out;
}

/** Marks by part, in the order of the paper. Empty for a paper without parts. */
export const marksByPart = (marking: Marking): Share[] =>
  shares(marking, (e) => (e.part === undefined ? null : { key: e.part, label: `Part ${e.part}` }));

const inOrder = (list: Share[], indexOf: (key: string) => number): Share[] => [...list].sort((a, b) => indexOf(a.key) - indexOf(b.key));

/** Marks by unit of the course, in course order. */
export function marksByUnit(marking: Marking, bank: PaperBank): Share[] {
  const unitOf = (topicId: string) => bank.topics.find((t) => t.id === topicId)?.unit ?? 'Other';
  const units = [...new Set(bank.topics.map((t) => t.unit))];
  return inOrder(shares(marking, (e) => ({ key: unitOf(e.topicId), label: unitOf(e.topicId) })), (key) => units.indexOf(key));
}

/** Marks by topic, in course order. */
export function marksByTopic(marking: Marking, bank: PaperBank): Share[] {
  const titleOf = (topicId: string) => bank.topics.find((t) => t.id === topicId)?.title ?? topicId;
  return inOrder(shares(marking, (e) => ({ key: e.topicId, label: titleOf(e.topicId) })), (key) => bank.topics.findIndex((t) => t.id === key));
}

/**
 * The topics to work on after a paper: those that lost marks, the smallest share earned first, and of two with the
 * same share the one that lost more marks. At most `limit` of them.
 */
export function weakestTopics(byTopic: readonly Share[], limit = 3): Share[] {
  return byTopic
    .map((share, i) => ({ share, i }))
    .filter(({ share }) => share.marks < share.max)
    .sort((a, b) => a.share.marks / a.share.max - b.share.marks / b.share.max || b.share.max - b.share.marks - (a.share.max - a.share.marks) || a.i - b.i)
    .slice(0, limit)
    .map(({ share }) => share);
}

// ---------------------------------------------------------------------------------------------------------------
// Handing in.
// ---------------------------------------------------------------------------------------------------------------

/**
 * The record of a paper handed in at `now`: the answers are final from here. A paper the clock ran out on (also
 * while the app was closed) is taken as handed in when the time ended.
 */
export function submitSitting(record: MockPaperRecord, marking: Marking, now: number): MockPaperRecord {
  if (record.submittedAt !== undefined) return record;
  return { ...record, submittedAt: Math.max(record.startedAt, Math.min(now, deadline(record))), marks: marking.marks, maxMarks: marking.maxMarks };
}

/**
 * What a submitted paper adds to the event log, recorded at `at`: one attempt for every question that was answered,
 * in the order of the paper, exactly as for a question answered anywhere else (no hints were on offer; a long
 * question that was not right keeps its answer, for the Mistakes screen), and the session result of the sitting. A question that was not answered leaves no attempt: it is not a mistake. The ids
 * follow from the paper's record, so recording the same paper twice adds nothing.
 */
export function sittingEvents(record: MockPaperRecord, marking: Marking, at: number): { attempts: AttemptEvent[]; result: SessionResult } {
  const attempts: AttemptEvent[] = [];
  for (const { step, response, result } of marking.entries.flatMap((e) => e.steps)) {
    if (!response || !result) continue;
    const q = step.question;
    const kept = answerToKeep(response, result);
    attempts.push({
      id: `${record.id}:${step.index}`,
      profileId: record.profileId,
      courseId: record.courseId,
      topicId: q.topicId,
      conceptId: q.conceptId,
      questionId: q.id,
      difficulty: q.difficulty,
      correct: result.correct,
      hintsUsed: 0,
      ...(result.mistakeCode === undefined ? {} : { mistakeCode: result.mistakeCode }),
      ...(kept ? { answer: kept } : {}),
      timeMs: record.timeMs[q.id] ?? 0,
      // A millisecond apart, so that the log keeps them in the order of the paper.
      at: at + attempts.length,
      sessionId: record.sessionId,
      sessionKind: 'mock',
    });
  }
  const result: SessionResult = {
    id: `${record.id}:result`,
    profileId: record.profileId,
    courseId: record.courseId,
    kind: 'mock',
    sessionId: record.sessionId,
    day: dayKey(at),
    correct: Math.floor(marking.marks),
    total: marking.maxMarks,
    at: at + attempts.length,
  };
  return { attempts, result };
}
