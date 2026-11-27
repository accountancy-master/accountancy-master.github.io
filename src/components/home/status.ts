const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Today in a line, under the greeting on Home: the daily goal, the streak and the mistakes waiting. The streak counts a
 * day on which a question was answered or a card rated, so a learner without one is told what starts it.
 */
export function homeStatus({ xp, goal, streak, mistakes }: { xp: number; goal: number; streak: number; mistakes: number }): string {
  let line: string;
  if (xp >= goal) {
    line = streak > 0 ? `Today's goal is met, and your streak is ${plural(streak, 'day', 'days')} long.` : "Today's goal is met. Answer a question or rate a card to start a streak.";
  } else {
    line = `${goal - xp} XP to today's goal. ${streak > 0 ? `Keep your ${streak}-day streak going.` : 'Answer a question to start a streak.'}`;
  }
  return mistakes > 0 ? `${line} ${plural(mistakes, 'mistake', 'mistakes')} waiting to be put right.` : line;
}
