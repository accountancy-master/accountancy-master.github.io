import { describe, expect, it } from 'vitest';
import { homeStatus } from './status';

describe('the status line of Home', () => {
  it('says what is left of the goal and how to keep or start the streak', () => {
    expect(homeStatus({ xp: 20, goal: 50, streak: 0, mistakes: 0 })).toBe("30 XP to today's goal. Answer a question to start a streak.");
    expect(homeStatus({ xp: 20, goal: 50, streak: 4, mistakes: 0 })).toBe("30 XP to today's goal. Keep your 4-day streak going.");
    expect(homeStatus({ xp: 60, goal: 50, streak: 1, mistakes: 0 })).toBe("Today's goal is met, and your streak is 1 day long.");
    expect(homeStatus({ xp: 60, goal: 50, streak: 5, mistakes: 0 })).toBe("Today's goal is met, and your streak is 5 days long.");
  });

  it('with the goal met and no streak, says what starts one', () => {
    expect(homeStatus({ xp: 120, goal: 50, streak: 0, mistakes: 0 })).toBe("Today's goal is met. Answer a question or rate a card to start a streak.");
  });

  it('adds the mistakes waiting', () => {
    expect(homeStatus({ xp: 0, goal: 50, streak: 2, mistakes: 3 })).toBe("50 XP to today's goal. Keep your 2-day streak going. 3 mistakes waiting to be put right.");
  });
});
