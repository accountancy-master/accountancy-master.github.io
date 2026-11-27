import { STAGES, caseOfQuestion, type StageOutline } from '@/content/outline';
import { parseCasePartId, parseGenId } from '@/generators/ids';
import { generateCaseQuestions } from '@/generators/loaded';
import { practiceSeed } from './practice';
import type { SessionItem } from './sessionBuilder';

// ---------------------------------------------------------------------------------------------------------------
// The Case studies screen: every stage that has cases, played one whole case at a time, outside the topic ladders.
// ---------------------------------------------------------------------------------------------------------------

/** The route segment (`/cases/play/mixed`) that asks for a case from any open stage. No stage has this id. */
export const MIXED_CASES = 'mixed';

/**
 * The stages that have at least one case, in the order a student meets them: every stage there is (in outline, which
 * is all the screens that list cases need), or those of the stages given.
 */
export const stagesWithCases = <S extends StageOutline = StageOutline>(stages: readonly S[] = STAGES as readonly S[]): S[] =>
  stages.filter((s) => s.cases.length > 0);

// Every stage of the learner's course can be played from the Case studies screen (and mixed into a marathon) from the
// first day: a case study is play, and nothing the learner has or has not passed closes it. The topic's own Case
// study level keeps its place at the end of the ladder, with the ladder's rules.

/**
 * Seed of a case played from the Case studies screen: one per play, from the practice range (see `practiceSeed`),
 * which no level reaches. So a case here is never the one a topic's own Case study level gave the learner.
 */
export const caseSeed = (playCount: number): number => practiceSeed('case', playCount);

/** The whole case for a seed, its questions in order, as a session. Throws for an unknown case. */
export const buildCaseSession = (caseId: string, seed: number): SessionItem[] =>
  generateCaseQuestions(caseId, seed).map((question) => ({ kind: 'question', question }));

/** What an attempt says for these purposes. */
interface CaseAttempt {
  questionId: string;
  sessionId: string;
  sessionKind?: string;
  correct: boolean;
}

/** One play of one case, as the attempts show it. */
export interface CasePlay {
  caseId: string;
  sessionId: string;
  /** True for a play from the Case studies screen, false for one of a topic's Case study level. */
  fromSection: boolean;
  /** Questions of the case answered right, out of the questions the case has. */
  correct: number;
  total: number;
  /** Every question of the case was answered. */
  complete: boolean;
}

/**
 * The plays of case studies among the attempts, oldest first: the sessions of the Case studies screen and those of
 * the topics' Case study levels (mistake review, which asks single questions again, is not a play of a case). A case
 * that has been withdrawn is left out.
 */
export function casePlays(attempts: readonly CaseAttempt[]): CasePlay[] {
  const plays = new Map<string, CasePlay & { parts: Map<number, boolean> }>();
  for (const a of attempts) {
    if (a.sessionKind !== 'case' && a.sessionKind !== 'level') continue;
    const part = parseCasePartId(parseGenId(a.questionId)?.templateId ?? '');
    const found = caseOfQuestion(a.questionId);
    if (!part || !found) continue;
    const key = `${a.sessionId}\n${part.caseId}`;
    let play = plays.get(key);
    if (!play) {
      play = {
        caseId: part.caseId,
        sessionId: a.sessionId,
        fromSection: a.sessionKind === 'case',
        correct: 0,
        total: found.parts.length,
        complete: false,
        parts: new Map(),
      };
      plays.set(key, play);
    }
    play.parts.set(part.index, a.correct);
  }
  return [...plays.values()].map(({ parts, ...play }) => ({
    ...play,
    correct: [...parts.values()].filter(Boolean).length,
    complete: parts.size >= play.total,
  }));
}

/** What the learner has done in one stage: the cases played to the end, and the best share of a case answered right. */
export interface StageRecord {
  playedCaseIds: string[];
  /** Best score of a finished case, as a fraction; null while none is finished. */
  best: number | null;
  /** The same for each case that has been finished. */
  bestByCase: Record<string, number>;
}

export function stageRecord(stage: StageOutline, plays: readonly CasePlay[]): StageRecord {
  const bestByCase: Record<string, number> = {};
  for (const play of plays) {
    if (!play.complete || play.total === 0 || !stage.cases.some((c) => c.id === play.caseId)) continue;
    bestByCase[play.caseId] = Math.max(bestByCase[play.caseId] ?? 0, play.correct / play.total);
  }
  const scores = Object.values(bestByCase);
  return {
    playedCaseIds: stage.cases.filter((c) => Object.hasOwn(bestByCase, c.id)).map((c) => c.id),
    best: scores.length > 0 ? Math.max(...scores) : null,
    bestByCase,
  };
}

/** How many times a case of this stage has been started from the Case studies screen (finished or not). */
const startedInSection = (stage: StageOutline, plays: readonly CasePlay[]): number =>
  plays.filter((p) => p.fromSection && stage.cases.some((c) => c.id === p.caseId)).length;

/** "New case" of a stage: its cases take turns, one step for every case of the stage started from this screen. */
export function nextCase<S extends StageOutline>(stage: S, plays: readonly CasePlay[]): S['cases'][number] | undefined {
  if (stage.cases.length === 0) return undefined;
  return stage.cases[startedInSection(stage, plays) % stage.cases.length];
}

/**
 * "Mixed cases": the open stage played least from this screen (the earlier stage when two are level), and its next
 * case. So the stages take turns too. Undefined when no open stage has a case.
 */
export function nextMixedCase<S extends StageOutline>(openStages: readonly S[], plays: readonly CasePlay[]): { stage: S; template: S['cases'][number] } | undefined {
  let pick: { stage: S; started: number } | undefined;
  for (const stage of stagesWithCases(openStages)) {
    const started = startedInSection(stage, plays);
    if (!pick || started < pick.started) pick = { stage, started };
  }
  const template = pick ? nextCase(pick.stage, plays) : undefined;
  return pick && template ? { stage: pick.stage, template } : undefined;
}
