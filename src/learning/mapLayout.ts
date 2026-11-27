import type { MapLink, MapNode, MapNodeKind } from './mindMap';

// ---------------------------------------------------------------------------------------------------------------
// Where the nodes of a mind map stand: a left-to-right tree. Every node has a column by its depth and a band of rows
// of its own, as tall as the node or as everything under it, whichever is taller; the node stands in the middle of
// its band, and its children's bands are stacked in order inside it. Bands never share a row, so no two nodes can
// overlap whatever their heights. In the 'mindmap' mode the root's children are shared between the two sides of the root
// (the first ones to the right, the rest to the left, split where the two sides are nearest in height), which puts
// the root in the middle as a mind map has it; each side is the same tree, mirrored.
//
// Why a tree read left to right rather than a radial map: the labels are sentences (the question on a rule card),
// and a tree keeps every label horizontal and as wide as its column, at 360 px as at 1440 px. A radial map has to
// turn or shorten its labels, and its outer ring grows with every leaf in both directions, so on a phone it is
// either too small to read or larger than the screen both ways. A tree only grows downwards as nodes unfold, which a
// phone pans through with one finger. On a wide screen the two-sided tree ('mindmap') puts the topic in the middle
// and halves the height. On a phone even one side is wider than the screen once a concept is open (four columns),
// so there the same tree tucks each column under its parent ('indented'): a child starts a step to the right of its
// parent, below it, joined by an elbow. Every label keeps its full size and the map only grows downwards.
//
// Text is not measured in the browser: the width of a line is estimated from its number of characters, generously,
// so that the layout is the same everywhere (in a unit test, on a server, in every browser) and no label overflows.
// ---------------------------------------------------------------------------------------------------------------

export interface PlacedNode {
  id: string;
  kind: MapNodeKind;
  /** The top left corner and the size of the node's box. */
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  /** 1 right of the root, -1 left of it, 0 the root. */
  side: 1 | -1 | 0;
  parentId: string | null;
  /** The label, wrapped to the box. */
  lines: string[];
  /** The second line, when the node has one (cut to the box). */
  detail?: string;
  /** Font sizes, and the room left of the text for the mastery ring. */
  fontSize: number;
  ring: boolean;
}

export interface PlacedEdge {
  from: string;
  to: string;
  /** An SVG path from the parent's outer edge to the child's inner edge. */
  d: string;
}

/** 'tree': one side, left to right. 'mindmap': the root in the middle, its children on both sides. 'indented': children under their parent, a step to the right. */
export type LayoutMode = 'tree' | 'mindmap' | 'indented';

export interface MapLayout {
  mode: LayoutMode;
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  width: number;
  height: number;
}

/** How wide a node of each kind is. */
export const NODE_WIDTH: Record<MapNodeKind, number> = {
  course: 176,
  unit: 184,
  topic: 196,
  concept: 210,
  group: 164,
  card: 236,
  pattern: 220,
  cases: 164,
  stage: 220,
  case: 224,
};

export const MARGIN = 20;
/** Between columns: room for the edge and the fold button on it. */
export const COLUMN_GAP = 44;
const GAP_LEAVES = 8;
const GAP_BRANCHES = 16;
const PAD_X = 12;
const PAD_Y = 9;
/** The room a mastery ring takes at the left of a box. */
export const RING_ROOM = 30;
const DETAIL_SIZE = 12;
const DETAIL_LINE = 16;
const MAX_LINES = 3;
/** An estimate of the width of a character, as a fraction of the font size: wide enough for bold text. */
const CHAR_WIDTH = 0.58;

export const lineHeight = (fontSize: number): number => Math.round(fontSize * 1.3);

/** The text wrapped at spaces to lines of at most `maxChars`, at most `maxLines` of them; what is cut ends with "…". */
export function wrapText(text: string, maxChars: number, maxLines = MAX_LINES): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (let word of words) {
    while (word.length > maxChars) {
      if (line) {
        lines.push(line);
        line = '';
      }
      lines.push(word.slice(0, maxChars - 1) + '-');
      word = word.slice(maxChars - 1);
    }
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines.length > 0 ? lines : [''];
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1];
  kept[maxLines - 1] = (last.length >= maxChars ? last.slice(0, maxChars - 1) : last).replace(/[\s,;:.-]+$/, '') + '…';
  return kept;
}

const cut = (text: string, maxChars: number): string => (text.length <= maxChars ? text : `${text.slice(0, maxChars - 1).trimEnd()}…`);

/** How many characters fit across a width at a font size. */
export const charsIn = (width: number, fontSize: number): number => Math.max(4, Math.floor(width / (fontSize * CHAR_WIDTH)));

interface Measured {
  node: MapNode;
  w: number;
  h: number;
  lines: string[];
  detail?: string;
  fontSize: number;
  ring: boolean;
  children: Measured[];
  /** The height of the node's band: the node, or everything under it. */
  band: number;
}

/** In an indented tree: how far a child stands to the right of its parent, and the widest a box is. */
export const INDENT = 20;
export const INDENTED_WIDTH = 236;
const INDENTED_MARGIN = 12;
const INDENTED_GAP = 6;

function measure(node: MapNode, depth: number, indented = false): Measured {
  const w = indented ? Math.min(NODE_WIDTH[node.kind], INDENTED_WIDTH) : NODE_WIDTH[node.kind];
  const fontSize = depth === 0 ? 16 : 14;
  const ring = node.mastery !== undefined;
  const textWidth = w - 2 * PAD_X - (ring ? RING_ROOM : 0);
  const lines = wrapText(node.label, charsIn(textWidth, fontSize));
  const detail = node.detail ? cut(node.detail, charsIn(textWidth, DETAIL_SIZE)) : undefined;
  const h = Math.max(ring ? 44 : 34, 2 * PAD_Y + lines.length * lineHeight(fontSize) + (detail ? DETAIL_LINE : 0));
  const children = node.children.map((c) => measure(c, depth + 1, indented));
  const band = Math.max(h, stackHeight(children));
  return { node, w, h, lines, detail, fontSize, ring, children, band };
}

const gapOf = (list: readonly Measured[]) => (list.every((c) => c.children.length === 0) ? GAP_LEAVES : GAP_BRANCHES);

function stackHeight(list: readonly Measured[]): number {
  if (list.length === 0) return 0;
  return list.reduce((s, c) => s + c.band, 0) + gapOf(list) * (list.length - 1);
}

/**
 * Where the root's children go when they are shared between two sides: the first `k` to the right, where the two
 * stacks differ least in height (the right one taking the extra child when they are equal).
 */
export function splitPoint(bands: readonly number[]): number {
  if (bands.length <= 1) return bands.length;
  const total = bands.reduce((s, b) => s + b, 0);
  let best = 1;
  let bestDiff = Infinity;
  let sum = 0;
  for (let k = 1; k < bands.length; k++) {
    sum += bands[k - 1];
    const diff = Math.abs(total - 2 * sum);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = k;
    }
  }
  return best;
}

/** The left-to-right path of an edge, from (x1, y1) to (x2, y2): a curve that leaves and arrives level. */
export function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = (x2 - x1) / 2;
  const r = (n: number) => Math.round(n * 10) / 10;
  return `M${r(x1)} ${r(y1)}C${r(x1 + dx)} ${r(y1)} ${r(x2 - dx)} ${r(y2)} ${r(x2)} ${r(y2)}`;
}

/** An elbow from the foot of a parent's box down to the level of a child, then across to the child. */
const elbowPath = (x: number, y1: number, x2: number, y2: number): string => `M${x} ${y1}V${y2 - 6}Q${x} ${y2} ${x + 6} ${y2}H${x2}`;

/** The indented tree: every node on a row of its own, in order, a step to the right of its parent. */
function layoutIndented(root: MapNode): MapLayout {
  const nodes: PlacedNode[] = [];
  let y = INDENTED_MARGIN;
  const visit = (m: Measured, depth: number, parentId: string | null) => {
    nodes.push({ id: m.node.id, kind: m.node.kind, x: INDENTED_MARGIN + depth * INDENT, y, w: m.w, h: m.h, depth, side: depth === 0 ? 0 : 1, parentId, lines: m.lines, detail: m.detail, fontSize: m.fontSize, ring: m.ring });
    y += m.h + (depth === 0 ? 2 * INDENTED_GAP : INDENTED_GAP);
    m.children.forEach((c) => visit(c, depth + 1, m.node.id));
  };
  visit(measure(root, 0, true), 0, null);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return {
    mode: 'indented',
    nodes,
    width: Math.max(...nodes.map((n) => n.x + n.w)) + INDENTED_MARGIN,
    height: y - INDENTED_GAP + INDENTED_MARGIN,
    edges: nodes
      .filter((n) => n.parentId !== null)
      .map((c) => {
        const p = byId.get(c.parentId!)!;
        return { from: p.id, to: c.id, d: elbowPath(p.x + INDENT / 2, p.y + p.h, c.x, c.y + c.h / 2) };
      }),
  };
}

/**
 * The layout of a tree (already pruned of what is folded): every node's box, every edge, and the size of the whole,
 * with a margin all round and nothing above or left of (0, 0). The same tree always gives the same layout.
 */
export function layoutTree(root: MapNode, { mode = 'tree' }: { mode?: LayoutMode } = {}): MapLayout {
  if (mode === 'indented') return layoutIndented(root);
  const sides = mode === 'mindmap' ? 2 : 1;
  const m = measure(root, 0);
  const nodes: PlacedNode[] = [];
  const edges: { from: string; to: string; side: 1 | -1 }[] = [];

  // The width of each column on each side: the widest node at that depth there.
  const right = sides === 2 ? m.children.slice(0, splitPoint(m.children.map((c) => c.band))) : m.children;
  const left = sides === 2 ? m.children.slice(right.length) : [];
  const columns = (list: readonly Measured[]) => {
    const widths: number[] = [];
    const visit = (n: Measured, d: number) => {
      widths[d] = Math.max(widths[d] ?? 0, n.w);
      n.children.forEach((c) => visit(c, d + 1));
    };
    list.forEach((n) => visit(n, 0));
    return widths;
  };
  const rightCols = columns(right);
  const leftCols = columns(left);
  // The x where each column starts (to the right) or ends (to the left), counted from the root's box.
  const rightStart = (d: number) => m.w + COLUMN_GAP + rightCols.slice(0, d).reduce((s, w) => s + w + COLUMN_GAP, 0);
  const leftEnd = (d: number) => -COLUMN_GAP - leftCols.slice(0, d).reduce((s, w) => s + w + COLUMN_GAP, 0);

  const place = (n: Measured, top: number, depth: number, side: 1 | -1, parentId: string) => {
    const x = side === 1 ? rightStart(depth - 1) : leftEnd(depth - 1) - n.w;
    const y = top + (n.band - n.h) / 2;
    nodes.push({ id: n.node.id, kind: n.node.kind, x, y, w: n.w, h: n.h, depth, side, parentId, lines: n.lines, detail: n.detail, fontSize: n.fontSize, ring: n.ring });
    edges.push({ from: parentId, to: n.node.id, side });
    stack(n.children, top + (n.band - stackHeight(n.children)) / 2, depth + 1, side, n.node.id);
  };
  const stack = (list: readonly Measured[], top: number, depth: number, side: 1 | -1, parentId: string) => {
    const gap = gapOf(list);
    let at = top;
    for (const c of list) {
      place(c, at, depth, side, parentId);
      at += c.band + gap;
    }
  };

  const band = Math.max(m.h, stackHeight(right), stackHeight(left));
  nodes.push({ id: m.node.id, kind: m.node.kind, x: 0, y: (band - m.h) / 2, w: m.w, h: m.h, depth: 0, side: 0, parentId: null, lines: m.lines, detail: m.detail, fontSize: m.fontSize, ring: m.ring });
  stack(right, (band - stackHeight(right)) / 2, 1, 1, m.node.id);
  stack(left, (band - stackHeight(left)) / 2, 1, -1, m.node.id);

  // Moved so that the top left of everything is at the margin.
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  for (const n of nodes) {
    n.x = Math.round(n.x - minX + MARGIN);
    n.y = Math.round(n.y - minY + MARGIN);
  }
  const width = Math.max(...nodes.map((n) => n.x + n.w)) + MARGIN;
  const height = Math.max(...nodes.map((n) => n.y + n.h)) + MARGIN;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return {
    mode,
    nodes,
    width,
    height,
    edges: edges.map(({ from, to, side }) => {
      const p = byId.get(from)!;
      const c = byId.get(to)!;
      const d = side === 1 ? edgePath(p.x + p.w, p.y + p.h / 2, c.x, c.y + c.h / 2) : edgePath(p.x, p.y + p.h / 2, c.x + c.w, c.y + c.h / 2);
      return { from, to, d };
    }),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The links between topics on a course's map: arcs to the right of the column of topics, each with a numbered badge
// at its furthest point. Two arcs whose topics overlap in height go at different distances, so that no two arcs at
// the same distance share a row and no two badges meet.
// ---------------------------------------------------------------------------------------------------------------

export interface PlacedArc {
  link: MapLink;
  /** Its number on the map and in the list beside it, from 1. */
  number: number;
  d: string;
  /** Where its badge is. */
  bx: number;
  by: number;
}

export const BADGE_RADIUS = 11;
const ARC_FIRST = 34;
const ARC_STEP = 30;

/**
 * The arcs of the links whose two topics are both on the map (`layout` is of a course's map, laid out on one side),
 * and how much wider the map is with them. Links are numbered in the order given.
 */
export function layoutArcs(layout: MapLayout, links: readonly MapLink[]): { arcs: PlacedArc[]; width: number } {
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const shown = links
    .map((link, i) => ({ link, number: i + 1, a: byId.get(`topic:${link.from}`), b: byId.get(`topic:${link.to}`) }))
    .filter((x): x is { link: MapLink; number: number; a: PlacedNode; b: PlacedNode } => x.a !== undefined && x.b !== undefined);
  // The shortest first take the nearest places; an arc goes at the first distance where it shares no row with another.
  const span = (x: (typeof shown)[number]) => {
    const y1 = x.a.y + x.a.h / 2;
    const y2 = x.b.y + x.b.h / 2;
    return [Math.min(y1, y2), Math.max(y1, y2)] as const;
  };
  const order = [...shown].sort((p, q) => span(p)[1] - span(p)[0] - (span(q)[1] - span(q)[0]) || p.number - q.number);
  const levels: (readonly [number, number])[][] = [];
  const levelOf = new Map<number, number>();
  for (const x of order) {
    const [top, bottom] = span(x);
    let level = 0;
    while (levels[level]?.some(([t, b]) => top < b - 1 && bottom > t + 1)) level++;
    (levels[level] ??= []).push([top, bottom]);
    levelOf.set(x.number, level);
  }
  let right = layout.width;
  const arcs = shown.map((x) => {
    const [top, bottom] = span(x);
    const start = Math.max(x.a.x + x.a.w, x.b.x + x.b.w);
    const bulge = ARC_FIRST + ARC_STEP * levelOf.get(x.number)!;
    const r = (n: number) => Math.round(n * 10) / 10;
    const y1 = x.a.y + x.a.h / 2;
    const y2 = x.b.y + x.b.h / 2;
    // From the earlier topic to the later one, leaving and arriving a little apart from the edges of the tree.
    const d = `M${r(start + 4)} ${r(y1)}C${r(start + bulge)} ${r(y1)} ${r(start + bulge)} ${r(y2)} ${r(start + 6)} ${r(y2)}`;
    const bx = r(start + 4 + 0.75 * (bulge - 4));
    right = Math.max(right, bx + BADGE_RADIUS + MARGIN);
    return { link: x.link, number: x.number, d, bx, by: r((top + bottom) / 2) };
  });
  return { arcs, width: Math.ceil(right) };
}

// ---------------------------------------------------------------------------------------------------------------
// Moving between nodes with the arrow keys.
// ---------------------------------------------------------------------------------------------------------------

/**
 * The node an arrow key moves to from a node, or null when there is none that way. Right and Left go to the first
 * child and to the parent, mirrored on the left side of the root (so Right always moves right); at the root they go
 * to the first child on that side. Up and Down go to the next node above or below in the same column, whatever its
 * parent; in an indented tree, to the row above or below. Home goes to the root, End to the last node.
 */
export function neighbour(layout: Pick<MapLayout, 'nodes' | 'mode'>, id: string, key: string): string | null {
  const node = layout.nodes.find((n) => n.id === id);
  if (!node) return null;
  const root = layout.nodes.find((n) => n.parentId === null)!;
  if (key === 'Home') return root.id;
  if (key === 'End') return [...layout.nodes].sort((a, b) => a.y - b.y || a.x - b.x)[layout.nodes.length - 1]?.id ?? null;
  if (layout.mode === 'indented' && (key === 'ArrowUp' || key === 'ArrowDown')) {
    const at = layout.nodes.indexOf(node);
    return layout.nodes[at + (key === 'ArrowUp' ? -1 : 1)]?.id ?? null;
  }
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const column = layout.nodes
      .filter((n) => n.depth === node.depth && n.side === node.side && n.id !== node.id)
      .filter((n) => (key === 'ArrowUp' ? n.y < node.y : n.y > node.y))
      .sort((a, b) => (key === 'ArrowUp' ? b.y - a.y : a.y - b.y));
    return column[0]?.id ?? null;
  }
  if (key !== 'ArrowRight' && key !== 'ArrowLeft') return null;
  const dir = key === 'ArrowRight' ? 1 : -1;
  const firstChild = (side: 1 | -1) =>
    layout.nodes
      .filter((n) => n.parentId === node.id && n.side === side)
      .sort((a, b) => a.y - b.y)[0]?.id ?? null;
  if (node.side === 0) return firstChild(dir);
  return node.side === dir ? firstChild(node.side) : node.parentId;
}
