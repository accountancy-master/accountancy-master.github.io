import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOCK_TICK_MS, clockAnnouncement, clockWarns, levelClock, startQuestionClock } from './questionClock';

const T0 = 1_000_000;
const SECOND = 1000;

/** A clock of 90 seconds started now, with everything it reports. */
function started(opts: { allowedMs?: number; hidden?: boolean } = {}) {
  const ticks: number[] = [];
  const onUp = vi.fn();
  const clock = startQuestionClock({ allowedMs: 90 * SECOND, ...opts, onTick: (leftMs) => ticks.push(leftMs), onUp });
  return { clock, ticks, onUp, last: () => ticks[ticks.length - 1] };
}

describe('the clock of a question', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with the whole time and says at once how much is left', () => {
    const { clock, ticks, onUp } = started();
    expect(ticks).toEqual([90 * SECOND]);
    expect(clock.leftMs()).toBe(90 * SECOND);
    vi.advanceTimersByTime(SECOND);
    expect(clock.leftMs()).toBe(89 * SECOND);
    expect(ticks).toHaveLength(1 + SECOND / CLOCK_TICK_MS);
    expect(ticks[ticks.length - 1]).toBe(89 * SECOND);
    expect(onUp).not.toHaveBeenCalled();
  });

  it('works from the time it ends at, so ticks that come late or not at all lose nothing', () => {
    const { clock, last } = started();
    // Half a minute goes by in which no timer runs (a tab the browser has slowed down).
    vi.setSystemTime(T0 + 30 * SECOND);
    expect(clock.leftMs()).toBe(60 * SECOND);
    vi.advanceTimersByTime(CLOCK_TICK_MS);
    expect(last()).toBe(60 * SECOND - CLOCK_TICK_MS);
  });

  it('stops for good when an answer is submitted', () => {
    const { clock, ticks, onUp } = started();
    vi.advanceTimersByTime(30 * SECOND);
    clock.stop();
    const seen = ticks.length;
    vi.advanceTimersByTime(10 * 60 * SECOND);
    expect(clock.leftMs()).toBe(60 * SECOND);
    expect(ticks).toHaveLength(seen);
    expect(onUp).not.toHaveBeenCalled();
    // Coming back to the page does not start it again.
    clock.setHidden(true);
    clock.setHidden(false);
    vi.advanceTimersByTime(10 * 60 * SECOND);
    expect(clock.leftMs()).toBe(60 * SECOND);
    expect(onUp).not.toHaveBeenCalled();
  });

  it('waits while the page is hidden and carries on when it is seen again', () => {
    const { clock, ticks, onUp, last } = started();
    vi.advanceTimersByTime(30 * SECOND);
    clock.setHidden(true);
    const seen = ticks.length;
    // A phone call of ten minutes.
    vi.advanceTimersByTime(10 * 60 * SECOND);
    expect(clock.leftMs()).toBe(60 * SECOND);
    expect(ticks).toHaveLength(seen);
    expect(onUp).not.toHaveBeenCalled();

    clock.setHidden(false);
    expect(last()).toBe(60 * SECOND);
    vi.advanceTimersByTime(59 * SECOND);
    expect(clock.leftMs()).toBe(SECOND);
    expect(onUp).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SECOND);
    expect(onUp).toHaveBeenCalledTimes(1);
  });

  it('is told twice that the page is hidden, or seen, and counts it once', () => {
    const { clock, onUp } = started();
    vi.advanceTimersByTime(30 * SECOND);
    clock.setHidden(true);
    clock.setHidden(true);
    vi.advanceTimersByTime(60 * SECOND);
    clock.setHidden(false);
    clock.setHidden(false);
    vi.advanceTimersByTime(59 * SECOND);
    expect(clock.leftMs()).toBe(SECOND);
    expect(onUp).not.toHaveBeenCalled();
  });

  it('does not start on a page that is hidden, until it is seen', () => {
    const { clock, ticks, onUp } = started({ hidden: true });
    vi.advanceTimersByTime(5 * 60 * SECOND);
    expect(ticks).toEqual([90 * SECOND]);
    expect(onUp).not.toHaveBeenCalled();
    clock.setHidden(false);
    vi.advanceTimersByTime(90 * SECOND);
    expect(onUp).toHaveBeenCalledTimes(1);
  });

  it('says once that the time is up, with nothing left, and then is still', () => {
    const { clock, ticks, onUp, last } = started();
    vi.advanceTimersByTime(90 * SECOND);
    expect(onUp).toHaveBeenCalledTimes(1);
    expect(last()).toBe(0);
    const seen = ticks.length;
    vi.advanceTimersByTime(10 * 60 * SECOND);
    clock.setHidden(true);
    clock.setHidden(false);
    clock.stop();
    vi.advanceTimersByTime(10 * 60 * SECOND);
    expect(onUp).toHaveBeenCalledTimes(1);
    expect(ticks).toHaveLength(seen);
    expect(clock.leftMs()).toBe(0);
  });

  it('never shows less than nothing when the time ran out long before a tick came', () => {
    const { clock, onUp, last } = started();
    vi.setSystemTime(T0 + 5 * 60 * SECOND);
    vi.advanceTimersByTime(CLOCK_TICK_MS);
    expect(last()).toBe(0);
    expect(clock.leftMs()).toBe(0);
    expect(onUp).toHaveBeenCalledTimes(1);
  });

  it('starts again with the whole time for the next question, whatever was left of the last', () => {
    const first = started();
    vi.advanceTimersByTime(80 * SECOND);
    first.clock.stop();

    const second = started();
    expect(second.clock.leftMs()).toBe(90 * SECOND);
    vi.advanceTimersByTime(89 * SECOND);
    expect(second.onUp).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SECOND);
    expect(second.onUp).toHaveBeenCalledTimes(1);
    // The clock of the question before has nothing more to say.
    expect(first.onUp).not.toHaveBeenCalled();
    expect(first.clock.leftMs()).toBe(10 * SECOND);
  });
});

describe('which levels are played against the clock', () => {
  it('a level that gives its questions a time, for a learner who has the timer on', () => {
    expect(levelClock({ timerSecondsPerQuestion: 90 }, true)).toEqual({ seconds: 90, switchedOff: false });
    expect(levelClock({ timerSecondsPerQuestion: 150 }, true)).toEqual({ seconds: 150, switchedOff: false });
  });

  it('no clock with the timer off, and the level knows it was left out', () => {
    expect(levelClock({ timerSecondsPerQuestion: 90 }, false)).toEqual({ switchedOff: true });
  });

  it('no clock, and nothing left out, on a level that gives no time', () => {
    for (const on of [true, false]) {
      expect(levelClock({}, on)).toEqual({ switchedOff: false });
      expect(levelClock({ timerSecondsPerQuestion: 0 }, on)).toEqual({ switchedOff: false });
      expect(levelClock({ timerSecondsPerQuestion: Number.NaN }, on)).toEqual({ switchedOff: false });
    }
  });

  it('a shorter time (the test build gives one) only where a clock runs', () => {
    expect(levelClock({ timerSecondsPerQuestion: 90 }, true, 3)).toEqual({ seconds: 3, switchedOff: false });
    expect(levelClock({ timerSecondsPerQuestion: 90 }, false, 3)).toEqual({ switchedOff: true });
    expect(levelClock({}, true, 3)).toEqual({ switchedOff: false });
  });
});

describe('what the clock says', () => {
  it('warns for the last ten seconds, while there is time to warn about', () => {
    expect(clockWarns(11)).toBe(false);
    expect(clockWarns(10)).toBe(true);
    expect(clockWarns(0)).toBe(true);
  });

  it('tells a screen reader the time allowed, then that ten seconds are left, and nothing in between', () => {
    expect(clockAnnouncement(90, 90)).toBe('1 minute 30 seconds for this question.');
    expect(clockAnnouncement(11, 90)).toBe(clockAnnouncement(90, 90));
    expect(clockAnnouncement(10, 90)).toBe('10 seconds left.');
    expect(clockAnnouncement(1, 90)).toBe(clockAnnouncement(10, 90));
    expect(clockAnnouncement(120, 120)).toBe('2 minutes for this question.');
    expect(clockAnnouncement(60, 60)).toBe('1 minute for this question.');
    expect(clockAnnouncement(45, 45)).toBe('45 seconds for this question.');
    expect(clockAnnouncement(61, 61)).toBe('1 minute 1 second for this question.');
  });

  it('says only the time allowed when that is ten seconds or less', () => {
    expect(clockAnnouncement(3, 3)).toBe('3 seconds for this question.');
    expect(clockAnnouncement(1, 3)).toBe('3 seconds for this question.');
  });
});
