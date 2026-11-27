import { barPercent, type WeekDay } from './week';

/** Chart height; the bars and their baseline sit inside it. */
const PLOT_HEIGHT = 'h-24';

/**
 * XP per day for the current week, Monday to Sunday. One series, so no legend: the heading names it.
 * Each day is labelled in text and carries its own accessible label ("Mon: 40 XP"); today is marked by a filled
 * label and an emerald bar, never by colour alone. Days still to come are dashed placeholders. Each day is an item of
 * the list holding one picture (role img), so the list is still a list to a screen reader.
 */
export function WeekChart({ days }: { days: WeekDay[] }) {
  const max = Math.max(0, ...days.map((d) => d.xp));
  return (
    <ol data-testid="week-chart" className="grid grid-cols-7 gap-1">
      {days.map((d) => {
        const today = d.state === 'today';
        const future = d.state === 'future';
        const percent = barPercent(d.xp, max);
        const name = future ? `${d.label}: not yet` : `${d.label}: ${d.xp} XP${today ? ' (today)' : ''}`;
        return (
          <li key={d.day} className="min-w-0">
            <div role="img" aria-label={name} data-testid="week-bar" data-day={d.day} data-today={today ? 'true' : undefined} className="flex min-w-0 flex-col items-center gap-1">
              <span aria-hidden="true" className="h-4 text-xs font-extrabold leading-4 text-ink">
                {!future && d.xp > 0 ? d.xp : ''}
              </span>
              <span aria-hidden="true" className={`flex w-full max-w-9 items-end justify-center ${PLOT_HEIGHT}`}>
                {future ? (
                  <span className="h-0 w-full border-t-4 border-dotted border-edge-deep" />
                ) : d.xp > 0 ? (
                  <span
                    className={`w-full rounded-t-lg rounded-b-sm ${today ? 'bg-primary' : 'bg-accent'}`}
                    style={{ height: `${percent}%` }}
                  />
                ) : (
                  <span className={`h-1.5 w-full rounded-full ${today ? 'bg-primary' : 'bg-edge-deep'}`} />
                )}
              </span>
              <span
                aria-hidden="true"
                className={
                  today
                    ? 'inline-flex min-h-6 items-center rounded-full bg-primary px-1 text-sm font-extrabold text-white'
                    : 'inline-flex min-h-6 items-center px-1 text-sm font-bold text-muted'
                }
              >
                {d.label}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
