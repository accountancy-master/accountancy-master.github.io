/** Every tunable number in the learning system. Run `npm test` after changing any. */
export const CONFIG = {
  xp: {
    perCorrect: { easy: 10, medium: 20, complex: 30 },
    levelPassBonus: 20,
    /** Later correct answers to a question already answered correctly (authored or generated) earn this share of the usual XP. */
    repeatFactor: 0.2,
    /**
     * A long answer (a set of entries, an account, a statement) that is not wholly right earns XP in proportion to the
     * parts of it that are right, once at least `minShare` of them are: 9 rows of 10 right earn 90% of the XP of the
     * question. It earns this only on the first answer to the question, and the question still counts as wrong for
     * the score and the pass of a level (a question is right only when every part of it is).
     */
    partial: { minShare: 0.5 },
    dailyMissionBonus: 50,
    dailyChallengeBonus: 30,
    /** A mock paper earns this for every mark the paper carries (80, 40 or 20), once it is handed in with enough marks. */
    mockBonusPerMark: 1,
    /**
     * A mission or challenge bonus needs at least this share of the session's scored questions answered correctly,
     * and a mock paper's bonus this share of its marks.
     */
    bonusMinScore: 0.5,
  },
  dailyGoal: { options: [20, 50, 100], default: 50 },
  practice: {
    smart: { weak: 4, due: 3, fresh: 3 },
    freshCount: 10,
    mistakesMax: 10,
    mission: { cards: 5, questions: 8, challenge: 2 },
    dailyChallengeCount: 5,
    cardsPerSession: 10,
    /** Open mistakes, and due rule cards, at which the next-step suggestion puts them first. */
    recommend: { mistakes: 3, dueCards: 5 },
  },
  /** Multiplier by hints used: none, nudge, rule. Three hints reveals the answer and earns nothing. */
  hintFactors: [1, 0.75, 0.5],
  mastery: {
    gain: { easy: 8, medium: 12, complex: 16 },
    wrongPenalty: 10,
    decayGraceDays: 14,
    decayPerDay: 1,
    decayFloorRatio: 0.6,
  },
  review: { gapsDays: [1, 3, 7, 16, 35] },
  level: { defaultPassMark: 0.7 },
  /** A look-back level: questions from the topic itself, and from the topics before it (one topic each while there are enough). */
  lookBack: { own: 6, earlier: 4 },
  /**
   * `unlockAllByDefault`: what a device that has never chosen gets. False: the ladder is in order, each level opened by
   * passing the one before (the Playground and the Marathon play anything regardless). The "Unlock all levels" switch
   * in Settings opens every level, and a device that has chosen keeps its choice.
   */
  ladder: { unlockAllByDefault: false },
  /**
   * A marathon run. `batch`: how many questions are made at a time, as the learner reaches the end of those made.
   * `authoredEvery`: every so many questions an authored one is mixed in, while the topic has any not yet asked.
   * `stepUpAfter`: correct answers in a row that take a mixed run one difficulty up (a miss takes it one down).
   * `weight`: how a concept's share of the questions moves with the run (see `conceptWeight`).
   * `caseEvery`: in a run with case studies and other questions, a whole case comes after every so many questions.
   */
  marathon: { batch: 5, authoredEvery: 5, stepUpAfter: 2, caseEvery: 4, weight: { missBoost: 25, correctRelief: 10, floor: 5 } },
  streak: { forgivenMissedDays: 1 },
  ranks: [
    { name: 'Beginner', xp: 0 },
    { name: 'Bookkeeper', xp: 250 },
    { name: 'Ledger Keeper', xp: 750 },
    { name: 'Accountant', xp: 1500 },
    { name: 'Senior Accountant', xp: 3000 },
    { name: 'Auditor', xp: 6000 },
  ],
} as const;
