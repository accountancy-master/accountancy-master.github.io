'use client';

import { useLayoutEffect, useRef, type DragEvent, type RefObject } from 'react';
import { ASSET_MAJORS, EL_MAJORS, itemById, MAJOR, PPE_IA, PPE_PARTS, SUB_ORDER, SUBS, majorOf, type Major, type Sub } from '@/simulator/company-statements/heads';
import { faceRows, inr, totalOf, type Holding } from '@/simulator/company-statements/sheet';

// ---------------------------------------------------------------------------------------------------------------
// The sorting board: the balances of a company as tiles in a tray, and the Schedule III balance sheet as the board
// they are sorted onto: its two parts, the major heads, and a slot for every sub-head (the four parts of "Property,
// Plant and Equipment and Intangible Assets" each a slot of their own). A tile flies from the tray to its slot
// (transform only; with reduced motion it fades in where it lands), and each slot adds up its tiles into the one
// figure the face of the balance sheet shows. In the sandbox a tile is picked (a tap, the keyboard, or a drag) and
// put on a slot; a wrong slot is refused with the reason.
// ---------------------------------------------------------------------------------------------------------------

export const P = 'lab-company-statements';

const LOOK: Record<Major, { edge: string; soft: string; text: string }> = {
  sf: { edge: 'border-hue-violet', soft: 'bg-hue-violet-soft', text: 'text-hue-violet' },
  sam: { edge: 'border-hue-sky', soft: 'bg-hue-sky-soft', text: 'text-hue-sky' },
  ncl: { edge: 'border-hue-blue', soft: 'bg-hue-blue-soft', text: 'text-hue-blue' },
  cl: { edge: 'border-hue-orange', soft: 'bg-hue-orange-soft', text: 'text-hue-orange' },
  nca: { edge: 'border-hue-green', soft: 'bg-hue-green-soft', text: 'text-hue-green' },
  ca: { edge: 'border-hue-teal', soft: 'bg-hue-teal-soft', text: 'text-hue-teal' },
};

export interface BoardProps {
  holdings: readonly Holding[];
  placed: readonly string[];
  reduced: boolean;
  /** The sub-head just dealt (drawn out). */
  focus?: Sub | null;
  /** Show the amounts (a quick question about a place has none). */
  amounts?: boolean;
  /** The sandbox: the tile picked, and what picking and placing do. */
  picked?: string | null;
  onPick?(id: string): void;
  onPlace?(id: string, sub: Sub): void;
}

/** Flies every tile that changed place from where it was to where it is (FLIP: transform only); with reduced motion it is simply there. */
function useTileFlights(root: RefObject<HTMLDivElement | null>, key: string, reduced: boolean) {
  const last = useRef(new Map<string, { x: number; y: number; where: string }>());
  useLayoutEffect(() => {
    const box = root.current;
    if (!box) return;
    const next = new Map<string, { x: number; y: number; where: string }>();
    const reach = window.innerHeight * 0.8;
    box.querySelectorAll<HTMLElement>('[data-tile]').forEach((el) => {
      const id = el.dataset.tile!;
      const where = el.dataset.where!;
      const r = el.getBoundingClientRect();
      const now = { x: r.left + window.scrollX, y: r.top + window.scrollY, where };
      const was = last.current.get(id);
      next.set(id, now);
      if (!was || was.where === where || typeof el.animate !== 'function') return;
      // With reduced motion a tile is simply in its new place, at full strength (a fade would leave its words faint).
      if (reduced) return;
      const dx = was.x - now.x;
      const dy = Math.max(-reach, Math.min(reach, was.y - now.y));
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(1.05)`, boxShadow: 'var(--shadow-pop)' },
          { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 20}px) scale(1.08)`, offset: 0.5 },
          { transform: 'none' },
        ],
        { duration: 800, easing: 'cubic-bezier(.45,.05,.35,1)' },
      );
    });
    last.current = next;
  }, [root, key, reduced]);
}

export function Board({ holdings, placed, reduced, focus = null, amounts = true, picked = null, onPick, onPlace }: BoardProps) {
  const root = useRef<HTMLDivElement>(null);
  const interactive = !!onPlace;
  useTileFlights(root, placed.join(','), reduced);
  const placedHoldings = holdings.filter((h) => placed.includes(h.id));
  const rows = faceRows(placedHoldings);
  const tray = holdings.filter((h) => !placed.includes(h.id));
  const allIn = tray.length === 0;
  const el = totalOf(rows, false);
  const as = totalOf(rows, true);

  const tile = (h: Holding, where: string) => {
    const it = itemById(h.id);
    const isPicked = picked === h.id;
    const words = `${it.name}${amounts ? `, ${inr(h.amount)}` : ''}${it.deducted ? ' (deducted)' : ''}`;
    const cls = `flex min-h-11 min-w-0 max-w-full flex-col items-start rounded-control border-2 px-2 py-1 text-left text-xs font-bold shadow-card ${isPicked ? 'border-primary bg-primary text-white' : it.deducted ? 'border-danger bg-danger-soft text-ink' : 'border-edge-deep bg-surface text-ink'}`;
    const body = (
      <>
        <span className="leading-tight">{it.short}</span>
        {amounts ? <span className="tabular-nums font-extrabold">{it.deducted ? `Less ${inr(h.amount)}` : inr(h.amount)}</span> : null}
      </>
    );
    if (where === 'tray' && interactive) {
      return (
        <button
          key={h.id}
          type="button"
          data-tile={h.id}
          data-where={where}
          data-testid={`${P}-tile-${h.id}`}
          aria-pressed={isPicked}
          aria-label={`${words}. ${isPicked ? 'Picked: now choose its sub-head.' : 'Pick it up.'}`}
          title={it.name}
          draggable
          onDragStart={(e: DragEvent<HTMLButtonElement>) => {
            e.dataTransfer.setData('text/plain', h.id);
            e.dataTransfer.effectAllowed = 'move';
            if (!isPicked) onPick?.(h.id);
          }}
          onClick={() => onPick?.(h.id)}
          className={`${cls} cursor-grab hover:border-primary`}
        >
          {body}
        </button>
      );
    }
    return (
      <span key={h.id} data-tile={h.id} data-where={where} data-testid={`${P}-tile-${h.id}`} title={it.name} className={cls}>
        <span className="sr-only">{words}</span>
        <span aria-hidden="true" className="contents">
          {body}
        </span>
      </span>
    );
  };

  const slot = (s: Sub) => {
    const mine = rows.find((r) => r.sub === s);
    const m = majorOf(s);
    const look = LOOK[m];
    const label = s === 'sam' ? 'A head with no sub-heads: one figure' : SUBS[s].label;
    const inHere = placedHoldings.filter((h) => itemById(h.id).sub === s);
    const canPlace = interactive && picked !== null;
    return (
      <li
        key={s}
        data-testid={`${P}-slot-${s}`}
        data-count={inHere.length}
        onDragOver={interactive ? (e) => e.preventDefault() : undefined}
        onDrop={
          interactive
            ? (e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain');
                if (id) onPlace!(id, s);
              }
            : undefined
        }
        className={`flex min-w-0 flex-col gap-1 rounded-control border-2 px-2 py-1.5 transition-colors ${focus === s ? `${look.edge} ${look.soft}` : inHere.length > 0 ? `${look.edge} bg-surface` : 'border-dashed border-edge-deep bg-surface/60'}`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <span className={`text-xs font-extrabold ${inHere.length > 0 ? '' : 'text-muted'}`}>{label}</span>
          {amounts && mine ? (
            <span data-testid={`${P}-slot-${s}-amount`} className="text-sm font-extrabold tabular-nums">
              {inr(mine.amount)}
            </span>
          ) : null}
        </div>
        {inHere.length > 0 ? <div className="flex flex-wrap gap-1">{inHere.map((h) => tile(h, s))}</div> : null}
        {canPlace ? (
          <button
            type="button"
            data-testid={`${P}-place-${s}`}
            onClick={() => onPlace!(picked!, s)}
            className="min-h-11 rounded-control border-2 border-dashed border-primary px-2 text-xs font-bold text-primary-ink hover:bg-primary-soft"
          >
            Put it here<span className="sr-only">: {label}</span>
          </button>
        ) : null}
      </li>
    );
  };

  const majorBox = (m: Major) => {
    const look = LOOK[m];
    const subs = SUB_ORDER.filter((s) => majorOf(s) === m);
    const total = rows.filter((r) => majorOf(r.sub) === m).reduce((t, r) => t + r.amount, 0);
    const ppe = subs.filter((s) => PPE_PARTS.includes(s));
    const rest = subs.filter((s) => !PPE_PARTS.includes(s));
    return (
      <section key={m} aria-label={MAJOR[m]} data-testid={`${P}-major-${m}`} className={`flex min-w-0 flex-col gap-1.5 rounded-card border-l-4 ${look.edge} bg-sunken p-2`}>
        <header className="flex flex-wrap items-baseline justify-between gap-x-2">
          <h4 className={`text-sm font-extrabold ${look.text}`}>{MAJOR[m]}</h4>
          {amounts && total !== 0 ? <span className="text-sm font-extrabold tabular-nums">{inr(total)}</span> : null}
        </header>
        {m === 'sam' ? (
          <ul className="grid gap-1.5">{slot('sam')}</ul>
        ) : (
          <>
            {ppe.length > 0 ? (
              <div className="flex flex-col gap-1">
                <p className="text-[0.7rem] font-bold text-muted">{PPE_IA}: four parts, each a line of its own</p>
                <ul className="grid gap-1.5 sm:grid-cols-2">{ppe.map(slot)}</ul>
              </div>
            ) : null}
            <ul className="grid gap-1.5 sm:grid-cols-2">{rest.map(slot)}</ul>
          </>
        )}
      </section>
    );
  };

  return (
    <div ref={root} data-testid={`${P}-board`} className="flex min-w-0 flex-col gap-3">
      <section aria-label="Tray of balances" data-testid={`${P}-tray`} className="flex min-w-0 flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
        <h3 className="text-base font-extrabold">{allIn ? 'Every balance is in its place' : `Balances to sort (${tray.length})`}</h3>
        {tray.length > 0 ? <div className="flex flex-wrap gap-1.5">{tray.map((h) => tile(h, 'tray'))}</div> : null}
        {interactive && tray.length > 0 ? <p className="text-xs text-muted">{picked ? 'Now choose its sub-head on the board (or drop it there).' : 'Pick a balance (or drag it) and put it under its sub-head.'}</p> : null}
      </section>
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        {([['I. EQUITY AND LIABILITIES', EL_MAJORS, el], ['II. ASSETS', ASSET_MAJORS, as]] as const).map(([part, majors, total]) => (
          <section key={part} aria-label={part} className="flex min-w-0 flex-col gap-2 rounded-card border border-edge bg-surface p-3 shadow-card">
            <h3 className="text-sm font-extrabold uppercase tracking-wide">{part}</h3>
            {majors.map(majorBox)}
            {amounts ? (
              <p data-testid={`${P}-total-${part.startsWith('I.') ? 'el' : 'assets'}`} className="flex items-baseline justify-between border-t-2 border-edge-deep pt-1 text-base font-extrabold tabular-nums">
                <span>Total</span>
                <span>{inr(total)}</span>
              </p>
            ) : null}
          </section>
        ))}
      </div>
      {amounts ? (
        <p data-testid={`${P}-agree`} className={`rounded-control px-3 py-2 text-sm font-bold ${allIn && el === as ? 'bg-primary-soft text-primary-ink' : 'bg-sunken text-muted'}`}>
          {allIn ? (el === as ? `✓ The two totals agree: ${inr(el)}.` : `✗ The two totals differ by ${inr(Math.abs(el - as))}.`) : `So far: equity and liabilities ${inr(el)}, assets ${inr(as)}. The totals agree only when every balance is in.`}
        </p>
      ) : null}
    </div>
  );
}
