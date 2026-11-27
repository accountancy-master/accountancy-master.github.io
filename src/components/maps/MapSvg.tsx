import type { CSSProperties, KeyboardEvent } from 'react';
import { masteryWord } from '@/components/ui/MasteryRing';
import { topicTitle } from '@/content/outline';
import { BADGE_RADIUS, RING_ROOM, lineHeight, type MapLayout, type PlacedArc, type PlacedNode } from '@/learning/mapLayout';
import { NODE_KIND_NAME, masteryPercent, type MapNode, type MapNodeKind } from '@/learning/mindMap';

// ---------------------------------------------------------------------------------------------------------------
// Drawing a laid-out mind map in SVG: the edges, the links between topics, and the nodes. Every colour is a token of
// globals.css, written as `var(--color-…)` in a style, so the map follows the theme on screen and a saved image can
// put the theme's actual colours in their place (mapExport.ts). The same drawing serves the map a learner moves
// around (with `interaction`), the copy that is printed and saved, and the small preview on a topic's page.
// ---------------------------------------------------------------------------------------------------------------

/** The colour of a mastery ring: one band for each word of `masteryWord`, grey before anything is done. */
export function masteryColour(percent: number): string {
  const p = masteryPercent(percent);
  if (p <= 0) return 'var(--color-edge-deep)';
  if (p < 40) return 'var(--color-hue-rose)';
  if (p < 70) return 'var(--color-hue-amber)';
  if (p < 90) return 'var(--color-hue-sky)';
  return 'var(--color-hue-green)';
}

/** The bands of the key under a map, in order. */
export const MASTERY_KEY: readonly { word: string; colour: string }[] = [0, 20, 50, 80, 95].map((p) => ({ word: masteryWord(p), colour: masteryColour(p) }));

interface BoxLook {
  fill: string;
  stroke: string;
  text: string;
  dashed?: true;
  /** The colour of the bar at the left of a box that is one item: a card, a pattern, a case. */
  marker?: string;
}

const LOOK: Record<MapNodeKind, BoxLook> = {
  course: { fill: 'var(--color-primary-soft)', stroke: 'var(--color-primary)', text: 'var(--color-primary-ink)' },
  unit: { fill: 'var(--color-sunken)', stroke: 'var(--color-edge-deep)', text: 'var(--color-ink)' },
  topic: { fill: 'var(--color-surface)', stroke: 'var(--color-edge-deep)', text: 'var(--color-ink)' },
  concept: { fill: 'var(--color-surface)', stroke: 'var(--color-edge-deep)', text: 'var(--color-ink)' },
  group: { fill: 'var(--color-sunken)', stroke: 'var(--color-edge-deep)', text: 'var(--color-ink)', dashed: true },
  cases: { fill: 'var(--color-sunken)', stroke: 'var(--color-edge-deep)', text: 'var(--color-ink)', dashed: true },
  card: { fill: 'var(--color-surface)', stroke: 'var(--color-edge)', text: 'var(--color-ink)', marker: 'var(--color-hue-sky)' },
  pattern: { fill: 'var(--color-surface)', stroke: 'var(--color-edge)', text: 'var(--color-ink)', marker: 'var(--color-hue-violet)' },
  stage: { fill: 'var(--color-surface)', stroke: 'var(--color-edge-deep)', text: 'var(--color-ink)' },
  case: { fill: 'var(--color-surface)', stroke: 'var(--color-edge)', text: 'var(--color-ink)', marker: 'var(--color-hue-amber)' },
};

/** The root of a map stands out: the brand's soft green, whatever it is. */
const ROOT_LOOK: BoxLook = { fill: 'var(--color-primary-soft)', stroke: 'var(--color-primary)', text: 'var(--color-primary-ink)' };

export const LINK_COLOUR = { builds: 'var(--color-hue-violet)', case: 'var(--color-hue-amber)' } as const;

/** What a screen reader hears for a node: what it is, its name, its mastery in words and figures, what it holds. */
export function nodeName(node: MapNode): string {
  const parts = [`${NODE_KIND_NAME[node.kind]}: ${node.label}`];
  if (node.mastery !== undefined && node.mastery !== null) parts.push(`mastery ${masteryPercent(node.mastery)}%, ${masteryWord(node.mastery).toLowerCase()}`);
  else if (node.detail && node.mastery === undefined) parts.push(node.detail);
  return parts.join(', ');
}

/** What the map is drawn from. */
export interface MapPaint {
  layout: MapLayout;
  /** Every node of the whole tree, folded or not, by id. */
  nodes: ReadonlyMap<string, MapNode>;
  folded: ReadonlySet<string>;
  arcs?: readonly PlacedArc[];
  /** Makes the ids inside one SVG its own (a page can have two copies of a map). */
  idPrefix: string;
}

/** What a learner can do on the map; left out for a copy that is only looked at. */
export interface MapInteraction {
  /** The node that Tab reaches (one at a time: the arrow keys move between them). */
  tabbable: string;
  onOpen(id: string): void;
  onToggle(id: string): void;
  onKey(e: KeyboardEvent<SVGGElement>, id: string): void;
  onFocus(id: string): void;
}

export function MapContent({ paint, interaction }: { paint: MapPaint; interaction?: MapInteraction }) {
  const { layout, arcs, idPrefix } = paint;
  return (
    <>
      <defs>
        {(['builds', 'case'] as const).map((kind) => (
          <marker key={kind} id={`${idPrefix}-arrow-${kind}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 1L9 5L0 9Z" style={{ fill: LINK_COLOUR[kind] }} />
          </marker>
        ))}
      </defs>
      <g aria-hidden="true">
        {layout.edges.map((e) => (
          <path key={`${e.from}>${e.to}`} d={e.d} style={{ fill: 'none', stroke: 'var(--color-edge-deep)', strokeWidth: 1.5 }} />
        ))}
      </g>
      {arcs && arcs.length > 0 ? (
        <g data-testid={interaction ? 'map-links' : undefined}>
          {arcs.map((a) => (
            <g key={a.number} data-testid={interaction ? `map-link-${a.number}` : undefined} data-kind={a.link.kind}>
              <title>{`${a.number}. ${topicTitle(a.link.from)} → ${topicTitle(a.link.to)}: ${a.link.reason}`}</title>
              <path
                d={a.d}
                markerEnd={`url(#${idPrefix}-arrow-${a.link.kind})`}
                style={{ fill: 'none', stroke: LINK_COLOUR[a.link.kind], strokeWidth: 1.75, strokeDasharray: a.link.kind === 'case' ? '5 4' : undefined }}
              />
              <circle cx={a.bx} cy={a.by} r={BADGE_RADIUS} style={{ fill: 'var(--color-surface)', stroke: LINK_COLOUR[a.link.kind], strokeWidth: 1.75 }} />
              <text x={a.bx} y={a.by + 4} textAnchor="middle" style={{ fill: 'var(--color-ink)', fontSize: 11, fontWeight: 800 }}>
                {a.number}
              </text>
            </g>
          ))}
        </g>
      ) : null}
      {layout.nodes.map((placed) => (
        <MapNodeBox key={placed.id} placed={placed} paint={paint} interaction={interaction} />
      ))}
    </>
  );
}

function MapNodeBox({ placed, paint, interaction }: { placed: PlacedNode; paint: MapPaint; interaction?: MapInteraction }) {
  const node = paint.nodes.get(placed.id)!;
  const { w, h, lines, detail, fontSize, ring } = placed;
  const root = placed.depth === 0;
  const look = root ? ROOT_LOOK : LOOK[placed.kind];
  const folds = node.children.length > 0;
  const folded = folds && paint.folded.has(node.id);
  const lh = lineHeight(fontSize);
  const textX = 12 + (look.marker ? 4 : 0) + (ring ? RING_ROOM : 0);
  const block = lines.length * lh + (detail ? 16 : 0);
  const top = (h - block) / 2;
  // The fold button sits on the edge that faces the node's children.
  const toggleX = paint.layout.mode !== 'indented' && placed.side === -1 ? 0 : w;
  const percent = node.mastery === null || node.mastery === undefined ? null : masteryPercent(node.mastery);
  const r = 11;
  const circumference = 2 * Math.PI * r;
  const ringX = 12 + (look.marker ? 4 : 0) + r;

  const attrs = interaction
    ? {
        role: 'treeitem',
        'aria-level': placed.depth + 1,
        'aria-expanded': folds ? !folded : undefined,
        'aria-label': nodeName(node),
        'data-testid': `map-node-${node.id}`,
        'data-node-id': node.id,
        'data-kind': node.kind,
        'data-folded': folds ? String(folded) : undefined,
        tabIndex: interaction.tabbable === node.id ? 0 : -1,
        className: 'group cursor-pointer outline-none',
        onClick: () => interaction.onOpen(node.id),
        onKeyDown: (e: KeyboardEvent<SVGGElement>) => interaction.onKey(e, node.id),
        onFocus: () => interaction.onFocus(node.id),
      }
    : {};
  const boxStyle: CSSProperties = { fill: look.fill, stroke: look.stroke, strokeWidth: root ? 2 : 1.25, strokeDasharray: look.dashed ? '4 3' : undefined };

  return (
    <g transform={`translate(${placed.x} ${placed.y})`} {...attrs}>
      {interaction ? (
        <rect x={-4} y={-4} width={w + 8} height={h + 8} rx={13} className="opacity-0 group-focus-visible:opacity-100" style={{ fill: 'none', stroke: 'var(--color-focus)', strokeWidth: 3 }} />
      ) : null}
      <rect width={w} height={h} rx={10} style={boxStyle} className={interaction && node.href ? 'transition-[filter] group-hover:brightness-95' : undefined} />
      {look.marker ? <rect x={4} y={7} width={4} height={h - 14} rx={2} style={{ fill: look.marker }} /> : null}
      {ring ? (
        <g aria-hidden="true">
          <circle cx={ringX} cy={h / 2} r={r} style={{ fill: 'none', stroke: 'var(--color-edge)', strokeWidth: 4 }} />
          {percent !== null && percent > 0 ? (
            <circle
              cx={ringX}
              cy={h / 2}
              r={r}
              transform={`rotate(-90 ${ringX} ${h / 2})`}
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={circumference * (1 - percent / 100)}
              style={{ fill: 'none', stroke: masteryColour(percent), strokeWidth: 4, strokeLinecap: 'round' }}
            />
          ) : null}
        </g>
      ) : null}
      <text x={textX} y={top + lh * 0.76} style={{ fill: look.text, fontSize, fontWeight: root ? 800 : 700 }}>
        {lines.map((line, i) => (
          <tspan key={i} x={textX} dy={i === 0 ? 0 : lh}>
            {line}
          </tspan>
        ))}
      </text>
      {detail ? (
        <text x={textX} y={top + lines.length * lh + 12} style={{ fill: 'var(--color-muted)', fontSize: 12, fontWeight: 600 }}>
          {detail}
        </text>
      ) : null}
      {folds ? (
        <g
          data-testid={interaction ? `map-toggle-${node.id}` : undefined}
          aria-hidden="true"
          onClick={
            interaction
              ? (e) => {
                  e.stopPropagation();
                  interaction.onToggle(node.id);
                }
              : undefined
          }
        >
          {/* A larger target than it looks, for a finger. */}
          {interaction ? <circle cx={toggleX} cy={h / 2} r={16} style={{ fill: 'transparent' }} /> : null}
          <circle cx={toggleX} cy={h / 2} r={9} style={{ fill: folded ? 'var(--color-primary)' : 'var(--color-surface)', stroke: 'var(--color-primary)', strokeWidth: 1.5 }} />
          <path
            d={folded ? `M${toggleX - 4.5} ${h / 2}H${toggleX + 4.5}M${toggleX} ${h / 2 - 4.5}V${h / 2 + 4.5}` : `M${toggleX - 4.5} ${h / 2}H${toggleX + 4.5}`}
            style={{ stroke: folded ? 'var(--color-surface)' : 'var(--color-primary)', strokeWidth: 2, strokeLinecap: 'round' }}
          />
        </g>
      ) : null}
    </g>
  );
}
