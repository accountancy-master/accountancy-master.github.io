'use client';

import { GROUPS, linesOf, movement, plugged, RATIOS, ratioDef, ratioOf, shown, termWords, type RatioFigures, type RatioId } from '@/simulator/ratios/model';
import { effectWords, meaning } from '@/simulator/ratios/steps';
import { Dial, GROUP_INK } from './Dial';

/** The change of a ratio from `before` to `now`, in words with ▲ or ▼, or null when it did not move. */
function changeOf(id: RatioId, now: RatioFigures, before: RatioFigures | null): { mark: string; words: string } | null {
  if (!before) return null;
  const def = ratioDef(id);
  const m = movement(def, linesOf(before), linesOf(now));
  const was = shown(ratioOf(def, linesOf(before)));
  if (m === null) return was === shown(ratioOf(def, linesOf(now))) ? null : { mark: '•', words: `was ${was}` };
  if (m === 0) return { mark: '=', words: 'no change' };
  return { mark: m > 0 ? '▲' : '▼', words: `${m > 0 ? 'up' : 'down'} from ${was}` };
}

/** Every ratio on its dial, in its four groups. A dial is a button: pressing it shows how it is worked out. */
export function Dials({
  figures,
  before = null,
  focus,
  onFocus,
  lit,
  masked = null,
  prefix,
}: {
  figures: RatioFigures;
  /** The figures before a transaction: each dial then says which way it moved. */
  before?: RatioFigures | null;
  focus: RatioId | null;
  onFocus?(id: RatioId): void;
  /** The dials met so far (a walk-through); the rest are dimmed. All when not given. */
  lit?: ReadonlySet<RatioId>;
  /** A dial whose figure a question hides. */
  masked?: RatioId | null;
  prefix: string;
}) {
  const l = linesOf(figures);
  return (
    <div className="flex flex-col gap-4" data-testid={`${prefix}-dials`}>
      {GROUPS.map((g) => (
        <section key={g.id} aria-labelledby={`${prefix}-group-${g.id}`} className="flex flex-col gap-2">
          <h3 id={`${prefix}-group-${g.id}`} className="flex flex-wrap items-baseline gap-x-2">
            <span className={`text-base font-extrabold ${GROUP_INK[g.id]}`}>{g.title}</span>
            <span className="text-sm text-muted">{g.asks}</span>
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {RATIOS.filter((r) => r.group === g.id).map((def) => {
              const v = ratioOf(def, l);
              const hide = masked === def.id;
              const change = hide ? null : changeOf(def.id, figures, before);
              const on = focus === def.id;
              const dim = lit ? !lit.has(def.id) : false;
              return (
                <button
                  key={def.id}
                  type="button"
                  aria-pressed={on}
                  disabled={!onFocus}
                  onClick={() => onFocus?.(def.id)}
                  data-testid={`${prefix}-dial-${def.id}`}
                  // A dial out of the light is dashed, in muted words (never faded, so that it can still be read).
                  className={`flex min-w-0 flex-col items-center gap-0.5 rounded-card border-2 p-2 text-center shadow-card disabled:cursor-default ${on ? 'border-primary' : 'border-edge'} ${dim ? 'border-dashed bg-sunken text-muted' : 'bg-surface'}`}
                >
                  <span className="text-xs font-extrabold leading-tight sm:text-sm">{def.name}</span>
                  <Dial def={def} value={hide ? null : v.exact} className="w-full max-w-36" />
                  <span className="text-base font-extrabold tabular-nums" data-testid={`${prefix}-value-${def.id}`}>
                    {hide ? '?' : shown(v)}
                  </span>
                  {change ? (
                    <span className="text-xs font-extrabold" data-testid={`${prefix}-change-${def.id}`}>
                      {change.mark} {change.words}
                    </span>
                  ) : null}
                  <span className="text-[0.7rem] leading-tight text-muted">{hide ? def.formula.split(',')[0] : v.hundredths === null ? v.reason : plugged(v).split(' = ')[0]}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/** The ratio in focus, large: its formula, what makes each term, the figures plugged in, and what it means. */
export function FocusPanel({ id, figures, before = null, prefix }: { id: RatioId; figures: RatioFigures; before?: RatioFigures | null; prefix: string }) {
  const def = ratioDef(id);
  const l = linesOf(figures);
  const v = ratioOf(def, l);
  return (
    <section aria-labelledby={`${prefix}-focus-name`} data-testid={`${prefix}-focus`} className="grid gap-3 rounded-card border-2 border-primary/40 bg-surface p-4 shadow-card sm:grid-cols-[10rem_minmax(0,1fr)]">
      <div className="flex flex-col items-center">
        <Dial def={def} value={v.exact} className="w-40" />
        <p className="text-xl font-extrabold tabular-nums" data-testid={`${prefix}-focus-value`}>
          {shown(v)}
        </p>
        {def.dial.mark ? <p className="text-center text-xs text-muted">Dashed tick: {def.dial.mark.label}</p> : null}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5 text-sm">
        <h3 id={`${prefix}-focus-name`} className={`text-lg font-extrabold ${GROUP_INK[def.group]}`}>
          {def.name}
        </h3>
        <p className="font-bold">{def.formula}</p>
        <p>
          <span className="mr-1 rounded bg-hue-sky-soft px-1.5 text-xs font-extrabold text-hue-sky">TOP</span>
          {v.top.name}: {termWords(v.top, l)}
        </p>
        <p>
          <span className="mr-1 rounded bg-hue-amber-soft px-1.5 text-xs font-extrabold text-hue-amber">BOTTOM</span>
          {v.bottom.name}: {termWords(v.bottom, l)}
        </p>
        <p className="font-extrabold tabular-nums">{plugged(v)}</p>
        <p className="text-muted">{meaning(v)}</p>
        {before ? <p className="rounded-control bg-accent-soft px-3 py-2 text-accent-ink">{effectWords(id, linesOf(before), l)}</p> : null}
      </div>
    </section>
  );
}

