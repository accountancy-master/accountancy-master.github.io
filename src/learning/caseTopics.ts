// ---------------------------------------------------------------------------------------------------------------
// Which topics a case study is about, for showing and finding cases only. A stage of case studies opens at the end
// of one topic (`CaseStage.topicId`: the last topic its cases need) and counts its cases towards it; that stays as it
// is. But a stage can hold cases about earlier topics too: "A firm that changes its partners" opens after Retirement
// and Death of a Partner, yet most of its cases are about admitting a partner or changing the ratio. A learner looking
// for Admission must find them under Admission.
//
// So the Case studies screen labels each stage by the topics its cases are about, tags each case with its topics, and
// can show the cases of one topic; a topic's page links there. Nothing here changes a case's id, its content, its
// stage, or where its marks count. A case not named here is about its stage's topic.
// ---------------------------------------------------------------------------------------------------------------

const FUNDAMENTALS = 'partnership-fundamentals';
const GOODWILL = 'goodwill';
const CHANGE = 'change-in-profit-sharing-ratio';
const ADMISSION = 'admission-of-a-partner';
const RETIREMENT = 'retirement-and-death-of-a-partner';
const DISSOLUTION = 'dissolution-of-partnership';

/**
 * The topics of the cases whose stage's topic does not say it all, in course order, by case id without its "case-"
 * (so that the screens which list cases, and load this, never hold the ids by which a topic's own content is known:
 * e2e/contentChunks.ts).
 */
export const CASE_TOPICS: Readonly<Record<string, readonly string[]>> = {
  // A firm that changes its partners (the stage opens after Retirement and Death of a Partner).
  'recon-goodwill-premium': [GOODWILL, ADMISSION],
  'recon-change-ratio': [CHANGE],
  'recon-hidden-goodwill': [GOODWILL, ADMISSION],
  'recon-retirement-due': [RETIREMENT],
  'recon-death-executor': [RETIREMENT],
  'recon-earmarked-reserve': [ADMISSION, RETIREMENT],
  'recon-chain-admission': [ADMISSION],
  'recon-chain-retirement': [RETIREMENT],
  'recon-chain-death': [RETIREMENT],
  'recon-chain-change-ratio': [CHANGE],
  // The life of a firm (the stage opens after Dissolution): a year, a change of partners, an end.
  'life-year-then-admission': [FUNDAMENTALS, ADMISSION],
  'life-change-then-admission': [CHANGE, ADMISSION],
  'life-year-then-retirement': [FUNDAMENTALS, RETIREMENT],
  'life-death-in-year': [RETIREMENT],
  'life-super-profit-twice': [GOODWILL, ADMISSION, RETIREMENT],
  'life-admission-then-dissolution': [ADMISSION, DISSOLUTION],
  'life-guarantee-on-admission': [ADMISSION],
  'life-change-then-retirement': [CHANGE, RETIREMENT],
  'life-fixed-capitals-admission': [FUNDAMENTALS, ADMISSION],
  'life-retirement-new-ratio': [RETIREMENT],
  'life-year-then-dissolution': [FUNDAMENTALS, DISSOLUTION],
  'life-retirement-then-admission': [ADMISSION, RETIREMENT],
  'life-loan-interest-omitted': [FUNDAMENTALS, ADMISSION],
  'life-change-then-dissolution': [CHANGE, DISSOLUTION],
  'life-admission-reserves-revaluation': [ADMISSION],
  'life-single-entry-then-admission': [FUNDAMENTALS, ADMISSION],
  'life-chain-year-admission': [FUNDAMENTALS, ADMISSION],
  'life-chain-fixed-year-admission': [FUNDAMENTALS, ADMISSION],
  'life-chain-admission-dissolution': [ADMISSION, DISSOLUTION],
  'life-chain-retirement-dissolution': [RETIREMENT, DISSOLUTION],
  'life-chain-year-dissolution': [FUNDAMENTALS, DISSOLUTION],
  'life-chain-death-executor': [RETIREMENT],
  'life-chain-change-year': [FUNDAMENTALS, CHANGE],
  'life-chain-year-retirement-loan': [FUNDAMENTALS, RETIREMENT],
  'life-chain-admission-guarantee': [FUNDAMENTALS, ADMISSION],
  'life-chain-change-dissolution': [CHANGE, DISSOLUTION],
};

/** The topics a case is about: those named above, or else its stage's topic. */
export const caseTopicIds = (caseId: string, stageTopicId: string): readonly string[] => {
  const key = caseId.replace(/^case-/, '');
  return Object.hasOwn(CASE_TOPICS, key) ? CASE_TOPICS[key] : [stageTopicId];
};

/**
 * The topics the cases of a stage are about, in the order of `courseOrder` (the topic ids of the course); a topic not
 * in it comes last.
 */
export function stageTopicIds(stage: { topicId: string; cases: readonly { id: string }[] }, courseOrder: readonly string[]): string[] {
  const found = new Set(stage.cases.flatMap((c) => caseTopicIds(c.id, stage.topicId)));
  const at = (id: string) => {
    const i = courseOrder.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...found].sort((a, b) => at(a) - at(b));
}

/** "Goodwill", "Goodwill and Admission of a Partner", "Fundamentals of Partnership to Dissolution of a Partnership Firm". */
export function topicsLabel(titles: readonly string[]): string {
  if (titles.length <= 1) return titles[0] ?? '';
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}`;
  return `${titles[0]} to ${titles[titles.length - 1]}`;
}
