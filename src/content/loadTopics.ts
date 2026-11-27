// What every template and case is written with is part of this file's own script: otherwise the bundler hands it
// out again with each topic, in more than one copy.
import '@/generators/authoring';
import { registerCases, registerTemplates } from '@/generators/loaded';
import type { CaseTemplate, Template } from '@/generators/types';
import { SIM_QUESTION_TOPICS } from '@/simulator/ids';
import { setEquationMoves } from '@/simulator/moves';
import { lookBackTemplates, withCaseStudyLevels, withLookBack, withQuizLevels } from './ladder';
import { topicsMeet } from './courseOptions';
import { isTopicLoaded, registerPack } from './loaded';
import { STAGES, courseOfTopic, outlinesOf } from './outline';
import type { LookBackTopic, TopicPack } from './types';

// ---------------------------------------------------------------------------------------------------------------
// Loading a topic: its templates, its pack and the cases of every stage it closes are fetched when something needs
// them, and registered (generators/loaded.ts, loaded.ts); from then on everything that looks a topic up finds it, for
// as long as the app stays open. Each `import()` below is a part of the build that no page loads by itself.
//
// A new topic adds a line to each list here, next to its lines in registry.ts and generators/index.ts (a unit test
// fails while one is missing). An author who adds a template, a card or a question to a topic changes nothing here:
// the topics of both courses are listed already, also those that have no content yet.
// ---------------------------------------------------------------------------------------------------------------

const TEMPLATES: Record<string, () => Promise<Template[]>> = {
  'introduction-to-accounting': () => import('@/generators/templates/introduction-to-accounting').then((m) => m.default),
  'theory-base': () => import('@/generators/templates/theory-base').then((m) => m.default),
  // The simulator also plays the transactions behind this topic's effect questions (simulator/moves.ts).
  'accounting-equation': () =>
    import('@/generators/templates/accounting-equation').then((m) => {
      setEquationMoves(m.EQUATION_MOVES);
      return m.default;
    }),
  'journal-entries': () => import('@/generators/templates/journal-entries').then((m) => m.default),
  ledger: () => import('@/generators/templates/ledger').then((m) => m.default),
  'cash-book': () => import('@/generators/templates/cash-book').then((m) => m.default),
  'subsidiary-books': () => import('@/generators/templates/subsidiary-books').then((m) => m.default),
  'bank-reconciliation': () => import('@/generators/templates/bank-reconciliation').then((m) => m.default),
  'trial-balance': () => import('@/generators/templates/trial-balance').then((m) => m.default),
  'rectification-of-errors': () => import('@/generators/templates/rectification-of-errors').then((m) => m.default),
  depreciation: () => import('@/generators/templates/depreciation').then((m) => m.default),
  'provisions-and-reserves': () => import('@/generators/templates/provisions-and-reserves').then((m) => m.default),
  'final-accounts': () => import('@/generators/templates/final-accounts').then((m) => m.default),
  'final-accounts-adjustments': () => import('@/generators/templates/final-accounts-adjustments').then((m) => m.default),
  'incomplete-records': () => import('@/generators/templates/incomplete-records').then((m) => m.default),
  // Class 12.
  'partnership-fundamentals': () => import('@/generators/templates/partnership-fundamentals').then((m) => m.default),
  goodwill: () => import('@/generators/templates/goodwill').then((m) => m.default),
  'change-in-profit-sharing-ratio': () => import('@/generators/templates/change-in-profit-sharing-ratio').then((m) => m.default),
  'admission-of-a-partner': () => import('@/generators/templates/admission-of-a-partner').then((m) => m.default),
  'retirement-and-death-of-a-partner': () => import('@/generators/templates/retirement-and-death-of-a-partner').then((m) => m.default),
  'dissolution-of-partnership': () => import('@/generators/templates/dissolution-of-partnership').then((m) => m.default),
  'share-capital': () => import('@/generators/templates/share-capital').then((m) => m.default),
  debentures: () => import('@/generators/templates/debentures').then((m) => m.default),
  'company-financial-statements': () => import('@/generators/templates/company-financial-statements').then((m) => m.default),
  'financial-statement-analysis': () => import('@/generators/templates/financial-statement-analysis').then((m) => m.default),
  'accounting-ratios': () => import('@/generators/templates/accounting-ratios').then((m) => m.default),
  'cash-flow-statement': () => import('@/generators/templates/cash-flow-statement').then((m) => m.default),
  'computerised-accounting': () => import('@/generators/templates/computerised-accounting').then((m) => m.default),
};

/** The packs as their authors wrote them. A pack builds its ladder as it is imported, from templates registered by then. */
const PACKS: Record<string, () => Promise<TopicPack>> = {
  'introduction-to-accounting': () => import('./cbse11/introduction-to-accounting').then((m) => m.default),
  'theory-base': () => import('./cbse11/theory-base').then((m) => m.default),
  'accounting-equation': () => import('./cbse11/accounting-equation').then((m) => m.default),
  'journal-entries': () => import('./cbse11/journalEntries').then((m) => m.JOURNAL_ENTRIES),
  ledger: () => import('./cbse11/ledger').then((m) => m.default),
  'cash-book': () => import('./cbse11/cash-book').then((m) => m.default),
  'subsidiary-books': () => import('./cbse11/subsidiary-books').then((m) => m.default),
  'bank-reconciliation': () => import('./cbse11/bank-reconciliation').then((m) => m.default),
  'trial-balance': () => import('./cbse11/trial-balance').then((m) => m.default),
  'rectification-of-errors': () => import('./cbse11/rectification-of-errors').then((m) => m.default),
  depreciation: () => import('./cbse11/depreciation').then((m) => m.default),
  'provisions-and-reserves': () => import('./cbse11/provisions-and-reserves').then((m) => m.default),
  'final-accounts': () => import('./cbse11/final-accounts').then((m) => m.default),
  'final-accounts-adjustments': () => import('./cbse11/final-accounts-adjustments').then((m) => m.default),
  'incomplete-records': () => import('./cbse11/incomplete-records').then((m) => m.default),
  // Class 12.
  'partnership-fundamentals': () => import('./cbse12/partnership-fundamentals').then((m) => m.default),
  goodwill: () => import('./cbse12/goodwill').then((m) => m.default),
  'change-in-profit-sharing-ratio': () => import('./cbse12/change-in-profit-sharing-ratio').then((m) => m.default),
  'admission-of-a-partner': () => import('./cbse12/admission-of-a-partner').then((m) => m.default),
  'retirement-and-death-of-a-partner': () => import('./cbse12/retirement-and-death-of-a-partner').then((m) => m.default),
  'dissolution-of-partnership': () => import('./cbse12/dissolution-of-partnership').then((m) => m.default),
  'share-capital': () => import('./cbse12/share-capital').then((m) => m.default),
  debentures: () => import('./cbse12/debentures').then((m) => m.default),
  'company-financial-statements': () => import('./cbse12/company-financial-statements').then((m) => m.default),
  'financial-statement-analysis': () => import('./cbse12/financial-statement-analysis').then((m) => m.default),
  'accounting-ratios': () => import('./cbse12/accounting-ratios').then((m) => m.default),
  'cash-flow-statement': () => import('./cbse12/cash-flow-statement').then((m) => m.default),
  'computerised-accounting': () => import('./cbse12/computerised-accounting').then((m) => m.default),
};

/**
 * The cases of each stage, by stage id. They are loaded with the stage's topic; a topic that closes several stages
 * loads them all. A new stage adds its line here (a unit test fails while one is missing).
 */
const CASES: Record<string, () => Promise<CaseTemplate[]>> = {
  'accounting-basics': () => import('@/generators/cases/accounting-basics').then((m) => m.default),
  'concepts-in-practice': () => import('@/generators/cases/concepts-in-practice').then((m) => m.default),
  'accounting-cycle': () => import('@/generators/cases/accounting-cycle').then((m) => m.default),
  'cash-and-bank': () => import('@/generators/cases/cash-and-bank').then((m) => m.default),
  'errors-and-suspense': () => import('@/generators/cases/errors-and-suspense').then((m) => m.default),
  'books-and-errors': () => import('@/generators/cases/books-and-errors').then((m) => m.default),
  'asset-life': () => import('@/generators/cases/asset-life').then((m) => m.default),
  'provisions-reserves-cases': () => import('@/generators/cases/provisions-reserves-cases').then((m) => m.default),
  'final-accounts': () => import('@/generators/cases/final-accounts').then((m) => m.default),
  'whole-year': () => import('@/generators/cases/whole-year').then((m) => m.default),
  'incomplete-records-cases': () => import('@/generators/cases/incomplete-records-cases').then((m) => m.default),
  // Class 12.
  'partnership-accounts': () => import('@/generators/cases/partnership-accounts').then((m) => m.default),
  reconstitution: () => import('@/generators/cases/reconstitution').then((m) => m.default),
  dissolution: () => import('@/generators/cases/dissolution').then((m) => m.default),
  'firm-life': () => import('@/generators/cases/firm-life').then((m) => m.default),
  'company-accounts': () => import('@/generators/cases/company-accounts').then((m) => m.default),
  analysis: () => import('@/generators/cases/analysis').then((m) => m.default),
  'company-year': () => import('@/generators/cases/company-year').then((m) => m.default),
  'computerised-accounting-cases': () => import('@/generators/cases/computerised-accounting-cases').then((m) => m.default),
};

/** What the loader has a file for: the topics, and the stages of case studies. */
export const LOADABLE = { topicIds: Object.keys(PACKS).filter((id) => Object.hasOwn(TEMPLATES, id)), stageIds: Object.keys(CASES) };

/** The topics before this one in its course that give a look-back something to ask, each with its templates. */
function topicsBefore(topicId: string): LookBackTopic[] {
  const course = outlinesOf(courseOfTopic(topicId) ?? '');
  const at = course.findIndex((o) => o.topicId === topicId);
  // As the registry has it (withLookBackLevels): only the topics a learner of this one also meets.
  return course.slice(0, Math.max(0, at)).filter((o) => topicsMeet(o.topicId, topicId)).flatMap((o) => {
    const templateIds = lookBackTemplates(o.levels);
    return templateIds.length > 0 ? [{ topicId: o.topicId, templateIds }] : [];
  });
}

async function load(topicId: string): Promise<void> {
  if (!Object.hasOwn(PACKS, topicId) || !Object.hasOwn(TEMPLATES, topicId)) throw new Error(`Unknown topic: ${topicId}`);
  // Every stage the topic closes, in the order of CASE_STAGES. A stage that has no case yet gives the topic nothing
  // (no level, no concept), so it is not fetched at all.
  const stages = STAGES.filter((s) => s.topicId === topicId && s.cases.length > 0);
  for (const stage of stages) if (!Object.hasOwn(CASES, stage.id)) throw new Error(`Unknown stage of case studies: ${stage.id}`);
  const [templates, ...cases] = await Promise.all([TEMPLATES[topicId](), ...stages.map((s) => CASES[s.id]())]);
  registerTemplates(templates);
  for (const list of cases) registerCases(list);
  // Only now the pack: its ladder is built from the templates as the file is imported.
  const authored = await PACKS[topicId]();
  // The levels no author writes are added as registry.ts adds them: quiz levels, the Look back, the Case study.
  const withStages = stages.map((stage, i) => ({ ...stage, cases: cases[i] }));
  const [pack] = withCaseStudyLevels([withLookBack(withQuizLevels(authored), topicsBefore(topicId))], withStages);
  // What the simulator recorded of this topic (a prediction, a found mistake) is made again by its own source.
  if (SIM_QUESTION_TOPICS.includes(topicId)) await import('@/simulator/questionSource').then((m) => m.installSimQuestions());
  registerPack(pack);
}

const loading = new Map<string, Promise<void>>();

/** Loads one topic. Asked again while it is loading, or once it is there, it does not fetch anything twice. */
function loadTopic(topicId: string): Promise<void> {
  if (isTopicLoaded(topicId)) return Promise.resolve();
  let pending = loading.get(topicId);
  if (!pending) {
    // A load that failed (no network) is forgotten, so that it can be tried again.
    pending = load(topicId).finally(() => loading.delete(topicId));
    loading.set(topicId, pending);
  }
  return pending;
}

/**
 * Loads the content of these topics and registers it; resolves once every one of them can be looked up. Rejects when
 * one could not be fetched, or is no topic that can be played.
 */
export async function loadTopics(topicIds: Iterable<string>): Promise<void> {
  await Promise.all([...new Set(topicIds)].map(loadTopic));
}

/** True when every one of these topics has been loaded. */
export const topicsLoaded = (topicIds: Iterable<string>): boolean => [...topicIds].every(isTopicLoaded);
