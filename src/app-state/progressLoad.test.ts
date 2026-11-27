import { describe, expect, it } from 'vitest';
import { CONFIG } from '@/learning/config';
import type { AttemptEvent, CardReviewEvent, SessionResult } from '@/storage/types';
import { createLoadCoordinator, createLoadTickets, dayChanged, deriveShared, progressStatus } from './progressLoad';

describe('progressStatus', () => {
  it('is idle without a profile', () => {
    expect(progressStatus({ profileId: null, hasData: false, failed: false })).toBe('idle');
  });
  it('is loading until the first load for the profile finishes', () => {
    expect(progressStatus({ profileId: 'a', hasData: false, failed: false })).toBe('loading');
  });
  it('is ready once data for the profile is present, and stays ready', () => {
    expect(progressStatus({ profileId: 'a', hasData: true, failed: false })).toBe('ready');
    expect(progressStatus({ profileId: 'a', hasData: true, failed: true })).toBe('ready');
  });
  it('is error when the load failed and there is no data', () => {
    expect(progressStatus({ profileId: 'a', hasData: false, failed: true })).toBe('error');
  });
});

describe('createLoadTickets', () => {
  it('lets only the newest load of a profile win', () => {
    const t = createLoadTickets();
    const first = t.begin('a');
    const second = t.begin('a');
    expect(t.isCurrent('a', first)).toBe(false);
    expect(t.isCurrent('a', second)).toBe(true);
  });
  it('does not let a load for one profile cancel another profile', () => {
    const t = createLoadTickets();
    const b = t.begin('b');
    t.begin('a'); // a reload captured for profile A starts while B is loading
    expect(t.isCurrent('b', b)).toBe(true);
  });
});

const T0 = new Date(2026, 9, 5, 10, 0, 0).getTime();
const HOUR = 60 * 60 * 1000;
const DAY = new Date(T0).getFullYear() + '-10-05';

const attempt: AttemptEvent = {
  id: 'a1', profileId: 'p', courseId: 'c', topicId: 't', conceptId: 'k', questionId: 'q1', difficulty: 'easy',
  correct: true, hintsUsed: 0, timeMs: 1000, at: T0, sessionId: 's',
};
const review: CardReviewEvent = {
  id: 'r1', profileId: 'p', courseId: 'c', topicId: 't', cardId: 'card1', conceptId: 'k', known: true, at: T0, sessionId: 's',
};
const mission: SessionResult = {
  id: 'm1', profileId: 'p', courseId: 'c', kind: 'daily_mission', sessionId: 's', day: DAY, correct: 8, total: 8, at: T0,
};
const none = { attempts: [], levelResults: [], cardReviews: [], sessionResults: [] };

describe('deriveShared', () => {
  it('is empty with no events', () => {
    const { progress, cardStates } = deriveShared(none, T0);
    expect(progress.xp).toBe(0);
    expect(cardStates).toEqual({});
  });
  it('derives progress and card states from the four lists', () => {
    const { progress, cardStates } = deriveShared({ ...none, attempts: [attempt], cardReviews: [review] }, T0, 'c');
    expect(progress.answered).toBe(1);
    expect(progress.xp).toBeGreaterThan(0);
    expect(cardStates.card1.seen).toBe(1);
  });
  it('includes session results, so a finished mission adds its bonus', () => {
    const base = deriveShared({ ...none, attempts: [attempt] }, T0, 'c').progress;
    const withMission = deriveShared({ ...none, attempts: [attempt], sessionResults: [mission] }, T0, 'c').progress;
    expect(withMission.xp).toBe(base.xp + CONFIG.xp.dailyMissionBonus);
    expect(withMission.missionDoneDays).toEqual([DAY]);
  });
});

describe('dayChanged', () => {
  it('is false within the same local day', () => {
    expect(dayChanged(T0, T0 + HOUR)).toBe(false);
  });
  it('is true once the local day has changed', () => {
    expect(dayChanged(T0, T0 + 24 * HOUR)).toBe(true);
  });
});

describe('createLoadCoordinator', () => {
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  const track = (p: Promise<void>) => {
    const state = { done: false, rejected: false };
    p.then(
      () => void (state.done = true),
      () => void (state.rejected = true),
    );
    return state;
  };

  it('resolves at once when nothing is loading', async () => {
    const c = createLoadCoordinator();
    await c.whenSettled('a');
    const t = c.begin('a');
    c.settle('a', t);
    await c.whenSettled('a');
  });

  it('releases every waiter only when the newest of three overlapping loads settles', async () => {
    const c = createLoadCoordinator();
    const first = c.begin('a');
    const waiter1 = track(c.whenSettled('a'));
    const second = c.begin('a');
    const waiter2 = track(c.whenSettled('a'));
    const third = c.begin('a');
    const waiter3 = track(c.whenSettled('a'));

    c.settle('a', first);
    await flush();
    expect([waiter1.done, waiter2.done, waiter3.done]).toEqual([false, false, false]);

    c.settle('a', third); // the newest lands before the second, which is still reading
    await flush();
    expect([waiter1.done, waiter2.done, waiter3.done]).toEqual([true, true, true]);

    c.settle('a', second); // a superseded load settling late changes nothing
    await flush();
    expect([waiter1.rejected, waiter2.rejected, waiter3.rejected]).toEqual([false, false, false]);
  });

  it('keeps a waiter waiting for a load that starts after it began waiting', async () => {
    const c = createLoadCoordinator();
    const first = c.begin('a');
    const waiter = track(c.whenSettled('a'));
    const second = c.begin('a');
    c.settle('a', first);
    await flush();
    expect(waiter.done).toBe(false);
    c.settle('a', second);
    await flush();
    expect(waiter.done).toBe(true);
  });

  it('tracks learners separately', async () => {
    const c = createLoadCoordinator();
    const a = c.begin('a');
    const b = c.begin('b');
    const waiterA = track(c.whenSettled('a'));
    c.settle('b', b);
    await flush();
    expect(waiterA.done).toBe(false);
    c.settle('a', a);
    await flush();
    expect(waiterA.done).toBe(true);
  });

  it('releases the waiters of one learner on release, and a later load waits afresh', async () => {
    const c = createLoadCoordinator();
    const first = c.begin('a');
    const other = c.begin('b');
    const waiter = track(c.whenSettled('a'));
    const otherWaiter = track(c.whenSettled('b'));
    c.release('a');
    await flush();
    expect(waiter.done).toBe(true);
    expect(otherWaiter.done).toBe(false);
    c.settle('a', first); // nothing left to settle
    const again = c.begin('a');
    const waiterAgain = track(c.whenSettled('a'));
    await flush();
    expect(waiterAgain.done).toBe(false);
    c.settle('a', again);
    c.settle('b', other);
    await flush();
    expect([waiterAgain.done, otherWaiter.done]).toEqual([true, true]);
  });

  it('releases every waiter on releaseAll', async () => {
    const c = createLoadCoordinator();
    c.begin('a');
    c.begin('b');
    const waiters = [track(c.whenSettled('a')), track(c.whenSettled('b'))];
    c.releaseAll();
    await flush();
    expect(waiters.map((w) => w.done)).toEqual([true, true]);
  });

  it('still lets only the newest load of a learner be current', () => {
    const c = createLoadCoordinator();
    const first = c.begin('a');
    const second = c.begin('a');
    expect(c.isCurrent('a', first)).toBe(false);
    expect(c.isCurrent('a', second)).toBe(true);
  });
});
