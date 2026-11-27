const SIZE = 120;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Today's XP against the daily goal: an amber ring that turns emerald once the goal is met. */
export function GoalRing({ xp, goal, met }: { xp: number; goal: number; met: boolean }) {
  const label = `${xp} / ${goal}`;
  const fraction = goal > 0 ? Math.min(1, Math.max(0, xp / goal)) : 0;
  return (
    <div
      role="img"
      aria-label={`${xp} of ${goal} XP earned today`}
      data-testid="goal-ring"
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: SIZE, height: SIZE }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90" aria-hidden="true">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth={STROKE} className="stroke-edge" />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          className={`transition-[stroke-dashoffset] duration-500 ${met ? 'stroke-primary' : 'stroke-accent'}`}
        />
      </svg>
      <span aria-hidden="true" className="absolute flex flex-col items-center leading-tight">
        {/* Long numbers (for example 100 / 100) step down a size so they stay inside the ring. */}
        <span className={`font-extrabold ${label.length > 7 ? 'text-base' : 'text-xl'}`}>{label}</span>{' '}
        <span className="text-sm font-extrabold text-accent-ink">XP</span>
      </span>
    </div>
  );
}
