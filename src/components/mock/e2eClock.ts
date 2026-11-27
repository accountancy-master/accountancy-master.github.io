/** localStorage key of the time a mock paper allows in the end-to-end build, in seconds (see E2eMockClock on Settings). */
export const E2E_MOCK_SECONDS_KEY = 'am.e2e.mockSeconds';

/**
 * The time a new mock paper allows when a test has shortened the clock, else undefined (the paper's own time).
 * NEXT_PUBLIC_E2E is a build-time constant, so in a normal build this is always undefined and nothing is read.
 */
export function e2eAllowedMs(): number | undefined {
  if (process.env.NEXT_PUBLIC_E2E !== '1') return undefined;
  try {
    const seconds = Number(window.localStorage.getItem(E2E_MOCK_SECONDS_KEY));
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
  } catch {
    return undefined;
  }
}
