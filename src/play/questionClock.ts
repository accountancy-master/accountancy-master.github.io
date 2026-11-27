import type { Level } from '@/content/types';

// The countdown of one question of a level that is played against the clock (a challenge level). The screen only
// draws what this says: the time is kept here, where it can be tested without a browser.

/** How often a running clock looks at the time. The time left is always worked out from the end, never counted down. */
export const CLOCK_TICK_MS = 250;
/** The last seconds of a question, for which the clock shows a warning. */
export const CLOCK_WARNING_SECONDS = 10;

export interface LevelClock {
  /** The seconds each question allows. Absent when the level is played without a clock. */
  seconds?: number;
  /** True for a timed level whose clock is left out because the learner has switched the challenge timer off. */
  switchedOff: boolean;
}

/**
 * How a level stands with the clock: only a level that gives its questions a time has one, and only for a learner
 * who has the challenge timer on. `shortened` (the test build's) replaces the time where a clock runs, nowhere else.
 */
export function levelClock(level: Pick<Level, 'timerSecondsPerQuestion'>, timerOn: boolean, shortened?: number): LevelClock {
  const seconds = level.timerSecondsPerQuestion;
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return { switchedOff: false };
  if (!timerOn) return { switchedOff: true };
  return { seconds: shortened ?? seconds, switchedOff: false };
}

export interface QuestionClock {
  /** The time left now. */
  leftMs(): number;
  /** Told when the page is hidden (another app, a phone call) and when it is seen again: the clock waits meanwhile. */
  setHidden(hidden: boolean): void;
  /** Stops the clock for good: the question was answered, or it is gone. What was left stays to be read. */
  stop(): void;
}

/**
 * Starts the clock of a question. While it runs it holds the time it ends at, and reads the time left from that, so
 * a tick that comes late (a tab the browser slows down) loses nothing. `onTick` is told the time left at once and on
 * every tick; `onUp` once, when nothing is left. A clock started on a hidden page waits until the page is seen.
 */
export function startQuestionClock(opts: {
  allowedMs: number;
  hidden?: boolean;
  onTick(leftMs: number): void;
  onUp(): void;
}): QuestionClock {
  // What was left when the clock last stood still, and the time it ends at while it runs.
  let left = Math.max(0, opts.allowedMs);
  let endsAt: number | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let hidden = opts.hidden === true;
  let over = false;

  const leftMs = () => (endsAt === null ? left : Math.max(0, endsAt - Date.now()));
  const halt = () => {
    left = leftMs();
    endsAt = null;
    if (timer !== null) clearInterval(timer);
    timer = null;
  };
  const tick = () => {
    const now = leftMs();
    if (now <= 0) {
      over = true;
      halt();
    }
    opts.onTick(now);
    if (now <= 0) opts.onUp();
  };
  const run = () => {
    if (over || hidden || endsAt !== null) return;
    endsAt = Date.now() + left;
    timer = setInterval(tick, CLOCK_TICK_MS);
    tick();
  };

  if (hidden) opts.onTick(left);
  else run();

  return {
    leftMs,
    setHidden(now) {
      hidden = now;
      if (hidden) halt();
      else run();
    },
    stop() {
      over = true;
      halt();
    },
  };
}

/** True for the last seconds of a question. */
export const clockWarns = (secondsLeft: number): boolean => secondsLeft <= CLOCK_WARNING_SECONDS;

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** A time allowed in words: "1 minute 30 seconds", "2 minutes", "45 seconds". */
function inWords(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return [m > 0 ? count(m, 'minute') : '', s > 0 || m === 0 ? count(s, 'second') : ''].filter(Boolean).join(' ');
}

/**
 * What a screen reader is told while the clock runs: the time allowed, and from ten seconds on that ten are left.
 * The words change only then, so they are read out twice in a question and never every second. That the time is up
 * is said with the feedback.
 */
export function clockAnnouncement(secondsLeft: number, secondsAllowed: number): string {
  if (clockWarns(secondsLeft) && secondsAllowed > CLOCK_WARNING_SECONDS) return `${CLOCK_WARNING_SECONDS} seconds left.`;
  return `${inWords(secondsAllowed)} for this question.`;
}
