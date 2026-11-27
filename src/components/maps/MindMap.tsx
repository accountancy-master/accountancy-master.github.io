'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { masteryWord } from '@/components/ui/MasteryRing';
import { topicTitle } from '@/content/outline';
import { layoutArcs, layoutTree, neighbour, type LayoutMode, type MapLayout } from '@/learning/mapLayout';
import { initialFolded, masteryPercent, visibleTree, walk, type MapLink, type MapNode } from '@/learning/mindMap';
import { fileNameOf, pngOf, saveFile, svgDocument } from './mapExport';
import { LINK_COLOUR, MASTERY_KEY, MapContent, nodeName, type MapPaint } from './MapSvg';

// ---------------------------------------------------------------------------------------------------------------
// A mind map a learner moves around: drag (or one finger) pans, the wheel or two fingers zoom, and the buttons zoom,
// fit the map to its box and fold or unfold everything. Tapping a node opens what it is; its round button folds and
// unfolds it. From the keyboard, Tab reaches one node, the arrow keys move between nodes, Enter opens and Space
// folds. The same map is also an outline (nested lists), for a screen reader or anyone who prefers it, and it can be
// saved as an SVG or a PNG image and printed on one page.
// ---------------------------------------------------------------------------------------------------------------

interface View {
  x: number;
  y: number;
  k: number;
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;
/** Below this width a map is an indented tree (see mapLayout.ts); a topic's map has both sides from `MINDMAP_WIDTH`. */
const INDENTED_BELOW = 640;
const MINDMAP_WIDTH = 900;

const clamp = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));

/** The whole map in its box, centred, never larger than life. */
function fitView(width: number, height: number, box: { w: number; h: number }): View {
  const k = clamp(Math.min((box.w - 16) / width, (box.h - 16) / height, 1));
  return { k, x: (box.w - width * k) / 2, y: (box.h - height * k) / 2 };
}

/**
 * How a map first appears: the whole of it when it can be read that way. Otherwise an indented tree as wide as the
 * box allows, from its top; and a tree at a size that can still be read, from its top when the root is then in
 * sight, else level with the root.
 */
function firstView(layout: MapLayout, width: number, box: { w: number; h: number }): View {
  const fit = fitView(width, layout.height, box);
  if (fit.k >= 0.75) return fit;
  if (layout.mode === 'indented') {
    // The layout has a margin of its own, so an indented tree as wide as the box is shown at full size.
    const k = clamp(Math.max(0.7, Math.min(1, box.w / width)));
    return { k, x: width * k <= box.w ? (box.w - width * k) / 2 : 8, y: 8 };
  }
  const k = 0.8;
  const x = width * k <= box.w ? (box.w - width * k) / 2 : 8;
  const root = layout.nodes.find((n) => n.parentId === null)!;
  const rootMiddle = (root.y + root.h / 2) * k;
  return { k, x, y: rootMiddle + 8 <= box.h - 48 ? 8 : box.h / 2 - rootMiddle };
}

export interface MindMapProps {
  root: MapNode;
  /** What the map is of, for its label and the name of a saved image: "Goodwill", "Class 11 Accountancy". */
  title: string;
  /** The layout on a wide screen: a topic's map on both sides of the topic, a course's on one side (its links need the other). */
  wide: 'mindmap' | 'tree';
  /** The links between topics, on a course's map. */
  links?: readonly MapLink[];
}

export function MindMap({ root, title, wide, links }: MindMapProps) {
  const router = useRouter();
  const id = useId().replace(/:/g, '');
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => initialFolded(root));
  const [outline, setOutline] = useState(false);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  // Where the learner has moved the map to, for the layout it was moved in: a new layout (the window turned from
  // narrow to wide) starts from its own first view.
  const [view, setView] = useState<(View & { mode: LayoutMode }) | null>(null);
  const [smooth, setSmooth] = useState(false);
  const [active, setActive] = useState(root.id);
  const [showLinks, setShowLinks] = useState<boolean | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const printSvg = useRef<SVGSVGElement>(null);
  const mapSvg = useRef<SVGSVGElement>(null);

  const mode: LayoutMode = !box || box.w < INDENTED_BELOW ? 'indented' : wide === 'mindmap' && box.w >= MINDMAP_WIDTH ? 'mindmap' : 'tree';
  // Links are drawn from the start on a wide screen; on a phone, where they make the map smaller, when asked for.
  const linksOn = links !== undefined && links.length > 0 && (showLinks ?? mode !== 'indented');
  const nodes = useMemo(() => new Map(walk(root).map((n) => [n.id, n])), [root]);
  const layoutFor = useCallback((f: ReadonlySet<string>) => layoutTree(visibleTree(root, f), { mode }), [root, mode]);
  const layout = useMemo(() => layoutFor(folded), [layoutFor, folded]);
  const arcs = useMemo(() => (linksOn && links ? layoutArcs(layout, links) : null), [linksOn, links, layout]);
  const width = arcs?.width ?? layout.width;
  const height = layout.height;
  const current: View | null = view && view.mode === mode ? view : box ? firstView(layout, width, box) : null;
  const tabbable = layout.nodes.some((n) => n.id === active) ? active : root.id;
  const paint: MapPaint = { layout, nodes, folded, arcs: arcs?.arcs, idPrefix: `${id}-map` };

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setBox({ w: Math.round(entry.contentRect.width), h: Math.round(entry.contentRect.height) }));
    observer.observe(el);
    return () => observer.disconnect();
  }, [outline]);

  const move = useCallback(
    (next: View, animate = false) => {
      setSmooth(animate);
      setView({ x: next.x, y: next.y, k: clamp(next.k), mode });
    },
    [mode],
  );

  /** Zooms by a factor, keeping the point (x, y) of the box where it is. */
  const zoomAt = useCallback(
    (x: number, y: number, factor: number, animate = false) => {
      if (!current) return;
      const k = clamp(current.k * factor);
      move({ k, x: x - ((x - current.x) / current.k) * k, y: y - ((y - current.y) / current.k) * k }, animate);
    },
    [current, move],
  );

  // The wheel zooms where the pointer is. It is a listener of its own so that the page does not scroll as well.
  const zoomRef = useRef(zoomAt);
  useEffect(() => {
    zoomRef.current = zoomAt;
  });
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      zoomRef.current(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-delta * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [outline]);

  // Pointers: one drags the map, two pinch it. A drag is not a tap: the node under it is not opened.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ kind: 'pan'; x: number; y: number; view: View; moved: boolean } | { kind: 'pinch'; d: number; mx: number; my: number; view: View } | null>(null);
  const dragged = useRef(false);
  const pressing = useRef(false);

  const startGesture = () => {
    const points = [...pointers.current.values()];
    if (!current || points.length === 0) {
      gesture.current = null;
      return;
    }
    if (points.length === 1) {
      gesture.current = { kind: 'pan', x: points[0].x, y: points[0].y, view: current, moved: false };
    } else {
      const [a, b] = points;
      const rect = viewport.current!.getBoundingClientRect();
      gesture.current = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2 - rect.left, my: (a.y + b.y) / 2 - rect.top, view: current };
    }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pressing.current = true;
    dragged.current = false;
    startGesture();
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pan') {
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (!g.moved && Math.hypot(dx, dy) < 6) return;
      if (!g.moved) {
        g.moved = true;
        dragged.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      move({ ...g.view, x: g.view.x + dx, y: g.view.y + dy });
    } else {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const mx = (a.x + b.x) / 2 - rect.left;
      const my = (a.y + b.y) / 2 - rect.top;
      const k = clamp(g.view.k * (Math.hypot(a.x - b.x, a.y - b.y) / g.d));
      dragged.current = true;
      move({ k, x: mx - ((g.mx - g.view.x) / g.view.k) * k, y: my - ((g.my - g.view.y) / g.view.k) * k });
    }
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    pressing.current = false;
    if (!pointers.current.delete(e.pointerId)) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    // Lifting one finger of two goes on as a drag with the other.
    startGesture();
  };

  /** Folds or unfolds a node, keeping it where it is on the screen. */
  const toggle = (nodeId: string, to?: boolean) => {
    const node = nodes.get(nodeId);
    if (!node || node.children.length === 0) return;
    const fold = to ?? !folded.has(nodeId);
    if (fold === folded.has(nodeId)) return;
    const next = new Set(folded);
    if (fold) next.add(nodeId);
    else next.delete(nodeId);
    const before = layout.nodes.find((n) => n.id === nodeId);
    const after = layoutFor(next).nodes.find((n) => n.id === nodeId);
    setFolded(next);
    if (current && before && after) move({ ...current, x: current.x + (before.x - after.x) * current.k, y: current.y + (before.y - after.y) * current.k });
  };

  const open = (nodeId: string) => {
    if (dragged.current) return;
    const node = nodes.get(nodeId);
    if (!node) return;
    setActive(nodeId);
    if (node.href) router.push(node.href);
    else toggle(nodeId);
  };

  /** Brings a node (and its fold button) into the box when any of it is outside, by centring it. */
  const reveal = (nodeId: string, animate: boolean, within: MapLayout = layout) => {
    const n = within.nodes.find((x) => x.id === nodeId);
    if (!n || !current || !box) return;
    const sx = current.x + n.x * current.k;
    const sy = current.y + n.y * current.k;
    const room = 24;
    const inside = sx >= room && sy >= 8 && sx + n.w * current.k <= box.w - room && sy + n.h * current.k <= box.h - 8;
    if (!inside) move({ ...current, x: box.w / 2 - (n.x + n.w / 2) * current.k, y: box.h / 2 - (n.y + n.h / 2) * current.k }, animate);
  };

  /** Moves the keyboard to a node, bringing it into view, and focuses it. */
  const focusNode = (nodeId: string) => {
    setActive(nodeId);
    reveal(nodeId, true);
    requestAnimationFrame(() => mapSvg.current?.querySelector<SVGGElement>(`[data-node-id="${CSS.escape(nodeId)}"]`)?.focus({ preventScroll: true }));
  };

  // A node focused other than by a pointer (Tab, a screen reader) is brought into view; one pressed by a pointer is
  // left where it is, so that the press lands on it.
  const onNodeFocus = (nodeId: string) => {
    setActive(nodeId);
    if (!pressing.current) reveal(nodeId, false);
  };

  const onKey = (e: KeyboardEvent<SVGGElement>, nodeId: string) => {
    const node = nodes.get(nodeId);
    const placed = layout.nodes.find((n) => n.id === nodeId);
    if (!node || !placed) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      dragged.current = false;
      open(nodeId);
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      toggle(nodeId);
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    // Towards a folded node's children unfolds it first, as in any tree.
    const outward = placed.side === 0 ? null : placed.side === 1 || layout.mode === 'indented' ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === outward && node.children.length > 0 && folded.has(nodeId)) {
      toggle(nodeId, false);
      return;
    }
    const target = neighbour(layout, nodeId, e.key);
    if (target) focusNode(target);
  };

  const setAll = (fold: boolean) => {
    const next = fold ? initialFolded(root) : new Set<string>();
    setFolded(next);
    const l = layoutFor(next);
    if (box) move(firstView(l, linksOn && links ? layoutArcs(l, links).width : l.width, box), true);
  };

  async function save(kind: 'svg' | 'png') {
    const svg = printSvg.current;
    if (!svg) return;
    setSaving(kind);
    try {
      const text = svgDocument(svg, width, height);
      const name = `${fileNameOf(title)}.${kind}`;
      saveFile(kind === 'svg' ? new Blob([text], { type: 'image/svg+xml' }) : await pngOf(text, width, height), name);
    } finally {
      setSaving(null);
    }
  }

  const instructions = `${id}-instructions`;
  return (
    <div className="flex flex-col gap-3" data-testid="mind-map" data-mode={mode}>
      <div role="toolbar" aria-label="Mind map" className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="inline-flex rounded-control border border-edge-deep bg-surface p-0.5" role="group" aria-label="Show as">
          <Segment pressed={!outline} onClick={() => setOutline(false)} testId="map-show-map">
            Map
          </Segment>
          <Segment pressed={outline} onClick={() => setOutline(true)} testId="map-show-outline">
            Outline
          </Segment>
        </div>
        {!outline ? (
          <div className="inline-flex gap-1" role="group" aria-label="Zoom">
            <Tool onClick={() => box && zoomAt(box.w / 2, box.h / 2, 1 / 1.25, true)} label="Zoom out" testId="map-zoom-out">
              −
            </Tool>
            <Tool onClick={() => box && zoomAt(box.w / 2, box.h / 2, 1.25, true)} label="Zoom in" testId="map-zoom-in">
              +
            </Tool>
            <Tool onClick={() => box && move(fitView(width, height, box), true)} testId="map-fit">
              Fit
            </Tool>
          </div>
        ) : null}
        <div className="inline-flex gap-1">
          <Tool onClick={() => setAll(false)} testId="map-unfold-all">
            Unfold all
          </Tool>
          <Tool onClick={() => setAll(true)} testId="map-fold-all">
            Fold all
          </Tool>
        </div>
        {links && links.length > 0 && !outline ? (
          <Tool pressed={linksOn} onClick={() => setShowLinks(!linksOn)} testId="map-show-links">
            Links between topics
          </Tool>
        ) : null}
      </div>

      <p id={instructions} className="sr-only">
        Arrow keys move between the nodes, Enter opens a node, Space folds or unfolds it. The outline shows the same map as lists.
      </p>

      {outline ? (
        <div data-testid="map-outline" className="rounded-card border border-edge bg-surface p-4 shadow-card print:hidden">
          <ul className="flex flex-col gap-1">
            <OutlineItem node={root} folded={folded} onToggle={toggle} />
          </ul>
        </div>
      ) : (
        <div
          ref={viewport}
          data-testid="map-viewport"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          className="relative h-[64dvh] min-h-[22rem] w-full touch-none select-none overflow-hidden rounded-card border border-edge bg-sunken shadow-card lg:h-[calc(100dvh-17rem)] lg:min-h-[30rem] print:hidden"
        >
          {current ? (
            <svg ref={mapSvg} width="100%" height="100%" role="tree" aria-label={`Mind map of ${title}`} aria-describedby={instructions} className="block cursor-grab active:cursor-grabbing">
              <g
                data-testid="map-pan"
                style={{ transform: `translate(${current.x}px, ${current.y}px) scale(${current.k})`, transformOrigin: '0 0', transition: smooth ? 'transform 180ms ease-out' : 'none' }}
              >
                <MapContent
                  paint={paint}
                  interaction={{
                    tabbable,
                    onOpen: open,
                    onToggle: (nodeId) => {
                      if (!dragged.current) toggle(nodeId);
                    },
                    onKey,
                    onFocus: onNodeFocus,
                  }}
                />
              </g>
            </svg>
          ) : null}
        </div>
      )}

      {/* The whole map, as it is folded now, sized to a page: what is printed, and what is saved as an image. */}
      <svg ref={printSvg} viewBox={`0 0 ${width} ${height}`} width="100%" aria-hidden="true" data-map-print="" className="map-print hidden print:block" preserveAspectRatio="xMidYMin meet">
        <rect width={width} height={height} style={{ fill: 'var(--color-surface)' }} />
        <MapContent paint={{ ...paint, idPrefix: `${id}-print` }} />
      </svg>
      <style>{`@media print { @page { size: ${width > height ? 'landscape' : 'portrait'}; } }`}</style>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between print:hidden">
        <MasteryKey />
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Save or print">
          <span className="text-sm font-bold text-muted">Save as image:</span>
          <Tool onClick={() => void save('svg')} testId="map-save-svg" busy={saving === 'svg'}>
            SVG
          </Tool>
          <Tool onClick={() => void save('png')} testId="map-save-png" busy={saving === 'png'}>
            PNG
          </Tool>
          <Tool onClick={() => window.print()} testId="map-print">
            Print
          </Tool>
        </div>
      </div>

      {links && links.length > 0 ? <LinkList links={links} shown={linksOn} /> : null}
    </div>
  );
}

function Segment({ pressed, onClick, testId, children }: { pressed: boolean; onClick(): void; testId: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      data-testid={testId}
      className={['min-h-9 rounded-[0.6rem] px-3 text-sm font-bold', pressed ? 'bg-primary text-white' : 'text-muted hover:text-ink'].join(' ')}
    >
      {children}
    </button>
  );
}

function Tool({ onClick, label, testId, pressed, busy, children }: { onClick(): void; label?: string; testId: string; pressed?: boolean; busy?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      aria-busy={busy || undefined}
      data-testid={testId}
      className={[
        'inline-flex min-h-10 min-w-10 items-center justify-center rounded-control border px-3 text-sm font-bold',
        pressed ? 'border-primary bg-primary-soft text-primary-ink' : 'border-edge-deep bg-surface text-ink hover:bg-sunken',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function MasteryKey() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-testid="map-key">
      <span className="font-bold text-muted">Mastery:</span>
      {MASTERY_KEY.map((band) => (
        <span key={band.word} className="inline-flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="5" style={{ fill: 'none', stroke: band.colour, strokeWidth: 3 }} />
          </svg>
          {band.word}
        </span>
      ))}
    </div>
  );
}

/** The links between topics in words, numbered as their badges on the map. */
function LinkList({ links, shown }: { links: readonly MapLink[]; shown: boolean }) {
  return (
    <section aria-labelledby="map-links-heading" className="flex flex-col gap-2">
      <h2 id="map-links-heading" className="text-lg font-extrabold tracking-tight">
        Links between topics
      </h2>
      <p className="text-sm text-muted">
        {shown ? 'Numbered as on the map. ' : ''}A solid line: a topic builds on an earlier one. A dashed line: a case study combines them.
      </p>
      <ol data-testid="map-links-list" className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {links.map((l, i) => (
          <li key={`${l.kind}-${l.from}-${l.to}`} className="flex gap-3 rounded-control border border-edge bg-surface p-3">
            <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-extrabold" style={{ borderColor: LINK_COLOUR[l.kind] }}>
              {i + 1}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="font-bold">
                <span className="sr-only">{i + 1}. </span>
                <Link href={`/maps/${l.from}`} className="text-primary-ink hover:underline">
                  {topicTitle(l.from)}
                </Link>
                {' → '}
                <Link href={`/maps/${l.to}`} className="text-primary-ink hover:underline">
                  {topicTitle(l.to)}
                </Link>
              </span>
              <span className="text-sm">
                <span className="font-bold">{l.kind === 'builds' ? 'Builds on: ' : 'Case study: '}</span>
                {l.reason}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** One node of the outline and, unless it is folded, what is under it. */
function OutlineItem({ node, folded, onToggle }: { node: MapNode; folded: ReadonlySet<string>; onToggle(id: string): void }) {
  const folds = node.children.length > 0;
  const isFolded = folds && folded.has(node.id);
  const percent = node.mastery === null || node.mastery === undefined ? null : masteryPercent(node.mastery);
  return (
    <li data-testid={`outline-node-${node.id}`} className="flex flex-col gap-1">
      <div className="flex min-h-9 items-center gap-2">
        {folds ? (
          <button
            type="button"
            aria-expanded={!isFolded}
            aria-label={`${isFolded ? 'Unfold' : 'Fold'} ${node.label}`}
            onClick={() => onToggle(node.id)}
            data-testid={`outline-toggle-${node.id}`}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-edge-deep font-extrabold text-primary-ink hover:bg-sunken"
          >
            <span aria-hidden="true">{isFolded ? '+' : '−'}</span>
          </button>
        ) : (
          <span aria-hidden="true" className="w-8 shrink-0" />
        )}
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          {node.href ? (
            <Link href={node.href} prefetch={node.prefetch} aria-label={nodeName(node)} className="font-bold text-primary-ink underline-offset-2 hover:underline">
              {node.label}
            </Link>
          ) : (
            <span className="font-bold">{node.label}</span>
          )}
          {percent !== null ? (
            <span className="text-sm font-bold text-muted">
              {masteryWord(percent)} · {percent}%
            </span>
          ) : node.detail ? (
            <span className="text-sm text-muted">{node.detail}</span>
          ) : null}
        </span>
      </div>
      {folds && !isFolded ? (
        <ul className="ml-4 flex flex-col gap-1 border-l border-edge pl-3">
          {node.children.map((c) => (
            <OutlineItem key={c.id} node={c} folded={folded} onToggle={onToggle} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
