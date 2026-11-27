'use client';

import { useEffect, useRef, useState } from 'react';
import { EMPTY_POSITION, EQUATION_POSITIONS, EQUATION_STEPS, apply, amount, inr, signed, total, type Move, type Position, type Side } from './figures';

type Phase = 'in' | 'first' | 'then' | 'done';

/** How long each phase of a transaction is shown, in milliseconds. */
const HOLD: Record<Phase, number> = { in: 900, first: 1600, then: 1300, done: 2300 };
const NEXT: Record<Phase, Phase> = { in: 'first', first: 'then', then: 'done', done: 'in' };

const LAST = EQUATION_STEPS.length - 1;
/** From the hook of a pan to the pivot, in the drawing's units. */
const ARM = 170;

const SIDE_NAME: Record<Side, string> = { assets: 'Assets', liabilities: 'Liabilities', capital: 'Capital' };

function shownAt(step: number, phase: Phase): Position {
  const before = step === 0 ? EMPTY_POSITION : EQUATION_POSITIONS[step - 1];
  if (phase === 'in') return before;
  if (phase === 'first') return apply(before, EQUATION_STEPS[step].first);
  return EQUATION_POSITIONS[step];
}

/** The tilt of the beam, in degrees (clockwise: the right pan down), for what is out of balance. */
function tilt(position: Position): number {
  const d = total(position, 'assets') - total(position, 'liabilities') - total(position, 'capital');
  if (d === 0) return 0;
  return -Math.sign(d) * Math.min(9, 2.4 + (Math.abs(d) / 60_000) * 2);
}

/** The moves of the phase on show: these are the items marked as changed. */
function movesOf(step: number, phase: Phase): readonly Move[] {
  if (phase === 'first') return EQUATION_STEPS[step].first;
  if (phase === 'then') return EQUATION_STEPS[step].then;
  return [];
}

const effect = (moves: readonly Move[]): string =>
  moves.length === 0 ? '' : `${SIDE_NAME[moves[0].side]} ${moves.map((m) => signed(m.by)).join(' ')}`;

/**
 * The opening picture: the accounting equation as a balance. Transactions come one at a time on a voucher; what
 * changes first tips the beam (and the equals sign becomes "≠" for that moment), then the other side changes by the
 * same amount and the beam comes level. It runs while it is on screen and the tab is in view, can be paused, and
 * without motion shows the books as they stand after the last transaction.
 */
export function HeroScale() {
  const [at, setAt] = useState<{ step: number; phase: Phase }>({ step: 0, phase: 'done' });
  const [motion, setMotion] = useState(false);
  const [paused, setPaused] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const [tabShown, setTabShown] = useState(true);
  const figure = useRef<HTMLElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const decide = () => {
      setMotion(!reduce.matches);
      // Without motion, the end state: the books after the last transaction.
      if (reduce.matches) setAt({ step: LAST, phase: 'done' });
    };
    decide();
    reduce.addEventListener('change', decide);
    const el = figure.current;
    const seen = el ? new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0.2 }) : null;
    if (el) seen?.observe(el);
    const onVisibility = () => setTabShown(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      reduce.removeEventListener('change', decide);
      seen?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const playing = motion && !paused && onScreen && tabShown;
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      setAt(({ step, phase }) => {
        if (phase === 'done') return { step: step === LAST ? 0 : step + 1, phase: 'in' };
        // A transaction that only changes the form of the assets has nothing to level.
        if (phase === 'first' && EQUATION_STEPS[step].then.length === 0) return { step, phase: 'done' };
        return { step, phase: NEXT[phase] };
      });
    }, HOLD[at.phase]);
    return () => window.clearTimeout(timer);
  }, [playing, at]);

  const { step, phase } = at;
  const tx = EQUATION_STEPS[step];
  const shown = shownAt(step, phase);
  const angle = tilt(shown);
  const rad = (angle * Math.PI) / 180;
  const level = angle === 0;
  const moves = movesOf(step, phase);
  const changed = new Set(moves.map((m) => m.side));
  const a = total(shown, 'assets');
  const l = total(shown, 'liabilities');
  const c = total(shown, 'capital');

  return (
    <figure ref={figure} className="lp-scale lp-carbon" data-testid="hero-scale" aria-labelledby="hero-scale-caption">
      <figcaption id="hero-scale-caption" className="lp-sr">
        The accounting equation as a balance: assets on one pan, liabilities and capital on the other. Every transaction
        changes both sides by the same amount, so the balance always comes back level.
      </figcaption>
      <ol className="lp-sr">
        {EQUATION_STEPS.map((s) => (
          <li key={s.text}>
            {s.text}: {effect(s.first)}
            {s.then.length > 0 ? `, ${effect(s.then)}` : ''}; {s.why}.
          </li>
        ))}
        <li>
          At the end: assets {inr(total(EQUATION_POSITIONS[LAST], 'assets'))} = liabilities {inr(total(EQUATION_POSITIONS[LAST], 'liabilities'))} + capital{' '}
          {inr(total(EQUATION_POSITIONS[LAST], 'capital'))}.
        </li>
      </ol>

      {motion ? (
        <button
          type="button"
          className="lp-scale-pause"
          aria-pressed={paused}
          aria-label="Pause the balance"
          data-testid="hero-pause"
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? (
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path d="M6 4l10 6-10 6z" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="currentColor">
              <rect x="5" y="4" width="3.5" height="12" rx="1" />
              <rect x="11.5" y="4" width="3.5" height="12" rx="1" />
            </svg>
          )}
        </button>
      ) : null}
      <div aria-hidden="true">
        <div className="lp-scale-head">
          <div key={step} className="lp-voucher lp-voucher-in" data-testid="hero-voucher">
            <span className="lp-voucher-no">
              Transaction {step + 1} of {EQUATION_STEPS.length}
            </span>
            <span className="lp-voucher-text">{tx.text}</span>
            <span className="lp-voucher-why" style={{ opacity: phase === 'in' ? 0 : 1 }}>
              {phase === 'first' ? effect(tx.first) : phase === 'in' ? ' ' : `${effect(tx.first)}${tx.then.length ? ` · ${effect(tx.then)}` : ''}: ${tx.why}`}
            </span>
            {phase === 'done' ? (
              <span className="lp-stamp lp-voucher-stamp" data-testid="hero-level">
                <span className="lp-stamp-tick">✓</span> Level
              </span>
            ) : null}
          </div>
        </div>

        <svg className="lp-scale-art" viewBox="0 0 460 322" role="presentation">
          {/* The stand. */}
          <ellipse cx="230" cy="314" rx="104" ry="6" fill="rgb(29 45 82 / 0.12)" />
          <path d="M160 312 L300 312 L282 288 L178 288 Z" fill="var(--lp-navy)" />
          <text x="230" y="305" textAnchor="middle" className="lp-mono" fontSize="12" fontWeight="700" fill="var(--lp-mustard)">
            A = L + C
          </text>
          <rect x="224" y="74" width="12" height="216" rx="3" fill="var(--lp-navy)" />
          {/* The dial behind the needle: level in the middle. */}
          <path d="M193 44 A44 44 0 0 1 267 44" fill="none" stroke="rgb(29 45 82 / 0.35)" strokeWidth="2" />
          {[-24, -12, 0, 12, 24].map((d) => (
            <line
              key={d}
              x1="230"
              y1="24"
              x2="230"
              y2={d === 0 ? 34 : 30}
              stroke={d === 0 ? 'var(--lp-green)' : 'rgb(29 45 82 / 0.45)'}
              strokeWidth={d === 0 ? 3 : 2}
              transform={`rotate(${d} 230 70)`}
            />
          ))}

          {/* The left pan: assets. */}
          <g className="lp-pan" style={{ transform: `translateY(${(-ARM * Math.sin(rad)).toFixed(2)}px)` }}>
            <Pan x={60} side="assets" items={shown.assets} moves={moves} stepKey={`${step}-${phase}`} label={["ASSETS"]} />
          </g>
          {/* The right pan: liabilities and capital. */}
          <g className="lp-pan" style={{ transform: `translateY(${(ARM * Math.sin(rad)).toFixed(2)}px)` }}>
            <Pan
              x={400}
              side="right"
              items={[...shown.capital.map((i) => ({ ...i, side: 'capital' as const })), ...shown.liabilities.map((i) => ({ ...i, side: 'liabilities' as const }))]}
              moves={moves}
              stepKey={`${step}-${phase}`}
              label={['LIABILITIES', '+ CAPITAL']}
            />
          </g>

          {/* The beam, its hooks and the needle turn together about the pivot. */}
          <g className="lp-beam" style={{ transform: `rotate(${angle.toFixed(2)}deg)` }}>
            <line x1="230" y1="70" x2="230" y2="26" stroke="var(--lp-pen)" strokeWidth="3" strokeLinecap="round" />
            <rect x="48" y="64" width="364" height="12" rx="6" fill="var(--lp-navy)" />
            <rect x="52" y="65.5" width="356" height="3" rx="1.5" fill="rgb(255 255 255 / 0.22)" />
            <circle cx="60" cy="70" r="5" fill="var(--lp-sheet)" stroke="var(--lp-navy)" strokeWidth="2" />
            <circle cx="400" cy="70" r="5" fill="var(--lp-sheet)" stroke="var(--lp-navy)" strokeWidth="2" />
          </g>
          <circle cx="230" cy="70" r="11" fill="var(--lp-mustard)" stroke="var(--lp-navy)" strokeWidth="3" />
        </svg>

        <div className="lp-equation" data-testid="hero-equation" data-level={level ? 'true' : 'false'}>
          <Term name="Assets" value={a} changed={changed.has('assets')} testId="hero-assets" />
          <span className="lp-eq-op" data-off={level ? undefined : ''}>
            {level ? '=' : '≠'}
          </span>
          <Term name="Liabilities" value={l} changed={changed.has('liabilities')} testId="hero-liabilities" />
          <span className="lp-eq-op">+</span>
          <Term name="Capital" value={c} changed={changed.has('capital')} testId="hero-capital" />
        </div>
      </div>
    </figure>
  );
}

function Term({ name, value, changed, testId }: { name: string; value: number; changed: boolean; testId: string }) {
  return (
    <span className="lp-eq-term" data-changed={changed ? '' : undefined}>
      <span className="lp-eq-name">{name}</span>
      <span className="lp-eq-value" data-testid={testId}>
        {inr(value)}
      </span>
    </span>
  );
}

const TAG_W = 120;
const TAG_H = 23;

function Pan({
  x,
  side,
  items,
  moves,
  stepKey,
  label,
}: {
  x: number;
  side: 'assets' | 'right';
  items: { item: string; amount: number; side?: Side }[];
  moves: readonly Move[];
  stepKey: string;
  label: string[];
}) {
  const mine = moves.filter((m) => (side === 'assets' ? m.side === 'assets' : m.side !== 'assets'));
  const top = 194 - (items.length || 1) * (TAG_H + 3);
  return (
    <>
      <line x1={x} y1={72} x2={x - 54} y2={194} stroke="rgb(29 45 82 / 0.55)" strokeWidth="1.5" />
      <line x1={x} y1={72} x2={x + 54} y2={194} stroke="rgb(29 45 82 / 0.55)" strokeWidth="1.5" />
      {items.map((it, k) => {
        const y = 194 - (k + 1) * (TAG_H + 3);
        const kind = side === 'assets' ? 'a' : it.side === 'capital' ? 'c' : 'l';
        const moved = mine.some((m) => m.item === it.item);
        return (
          <g key={it.item} className={`lp-tag-${kind} lp-tag-new`}>
            <rect className="lp-tag-rect" x={x - TAG_W / 2} y={y} width={TAG_W} height={TAG_H} rx="4" />
            {moved ? <rect x={x + 4} y={y + 3} width={TAG_W / 2 - 8} height={TAG_H - 6} rx="3" fill="var(--lp-highlight)" /> : null}
            <text className="lp-tag-name" x={x - TAG_W / 2 + 7} y={y + 15.5}>
              {it.item}
            </text>
            <text className="lp-tag-amt" x={x + TAG_W / 2 - 7} y={y + 15.5} textAnchor="end">
              {amount(it.amount)}
            </text>
          </g>
        );
      })}
      {mine.map((m, i) => (
        <text
          key={`${stepKey}-${m.item}`}
          className="lp-delta lp-delta-float"
          x={mine.length > 1 ? x + (i === 0 ? -30 : 30) : x}
          y={top - 8}
          textAnchor="middle"
          fill={m.by < 0 ? 'var(--lp-pen)' : 'var(--lp-green)'}
        >
          {signed(m.by)}
        </text>
      ))}
      <path d={`M${x - 62} 194 Q${x} 222 ${x + 62} 194 Z`} fill="var(--lp-paper-deep)" stroke="var(--lp-navy)" strokeWidth="2" />
      <text className="lp-pan-label" x={x} y={240} textAnchor="middle">
        {label.map((line, i) => (
          <tspan key={line} x={x} dy={i === 0 ? 0 : 13}>
            {line}
          </tspan>
        ))}
      </text>
    </>
  );
}
