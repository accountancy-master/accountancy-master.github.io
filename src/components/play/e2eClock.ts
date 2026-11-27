/** localStorage key of the time a timed level gives each question in the end-to-end build, in seconds (see E2eChallengeClock on Settings). */
export const E2E_QUESTION_SECONDS_KEY = 'am.e2e.questionSeconds';

/**
 * The seconds a question of a timed level allows when a test has shortened the clock, else undefined (the level's own
 * time). NEXT_PUBLIC_E2E is a build-time constant, so in a normal build this is always undefined and nothing is read.
 */
export function e2eQuestionSeconds(): number | undefined {
  if (process.env.NEXT_PUBLIC_E2E !== '1') return undefined;
  try {
    const seconds = Number(window.localStorage.getItem(E2E_QUESTION_SECONDS_KEY));
    return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
  } catch {
    return undefined;
  }
}
