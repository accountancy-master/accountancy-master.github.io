import { describe, expect, it } from 'vitest';
import { COURSES, PACKS } from '@/content/registry';
import { BADGE_RADIUS, layoutArcs, layoutTree, neighbour, splitPoint, wrapText, type MapLayout } from './mapLayout';
import { courseLinks, courseMapTree, initialFolded, topicMapTree, visibleTree, walk, type MapNode } from './mindMap';

const cardTitle = (id: string) => PACKS.flatMap((p) => p.cards).find((c) => c.id === id)?.prompt ?? id;
const topicTree = (topicId: string) => topicMapTree(topicId, topicId, cardTitle, null);

function expectNoOverlap(layout: MapLayout, label: string) {
  const boxes = [...layout.nodes].sort((a, b) => a.x - b.x);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length && boxes[j].x < boxes[i].x + boxes[i].w; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlap, `${label}: ${a.id} and ${b.id}`).toBe(false);
    }
  }
}

function expectInBounds(layout: MapLayout, label: string) {
  for (const n of layout.nodes) {
    expect(n.x, `${label}: ${n.id}`).toBeGreaterThanOrEqual(0);
    expect(n.y, `${label}: ${n.id}`).toBeGreaterThanOrEqual(0);
    expect(n.x + n.w, `${label}: ${n.id}`).toBeLessThanOrEqual(layout.width);
    expect(n.y + n.h, `${label}: ${n.id}`).toBeLessThanOrEqual(layout.height);
  }
}

describe('the layout of a mind map', () => {
  for (const pack of PACKS) {
    it(`${pack.topicId}: no two nodes overlap, every node is within the map, on one side and on two, folded and unfolded`, () => {
      const root = topicTree(pack.topicId);
      for (const tree of [root, visibleTree(root, initialFolded(root))]) {
        for (const mode of ['tree', 'mindmap', 'indented'] as const) {
          const layout = layoutTree(tree, { mode });
          const label = `${pack.topicId} ${mode}`;
          expect(layout.nodes).toHaveLength(walk(tree).length);
          expect(layout.edges).toHaveLength(walk(tree).length - 1);
          expectNoOverlap(layout, label);
          expectInBounds(layout, label);
        }
      }
    });
  }

  for (const course of COURSES) {
    it(`${course.id}: the course map and its arcs fit, and no two badges meet`, () => {
      const layout = layoutTree(courseMapTree(course.id, course.title, null));
      expectNoOverlap(layout, course.id);
      expectInBounds(layout, course.id);
      const { arcs, width } = layoutArcs(layout, courseLinks(course.id));
      expect(arcs.length).toBe(courseLinks(course.id).length);
      for (const a of arcs) {
        expect(a.bx + BADGE_RADIUS).toBeLessThanOrEqual(width);
        expect(a.bx - BADGE_RADIUS).toBeGreaterThan(Math.max(...layout.nodes.map((n) => n.x + n.w)));
      }
      for (let i = 0; i < arcs.length; i++) {
        for (let j = i + 1; j < arcs.length; j++) {
          const apart = Math.hypot(arcs[i].bx - arcs[j].bx, arcs[i].by - arcs[j].by);
          expect(apart, `badges ${arcs[i].number} and ${arcs[j].number}`).toBeGreaterThanOrEqual(2 * BADGE_RADIUS);
        }
      }
    });
  }

  it('on a phone (indented), a topic map is no wider than the screen whatever is open, and rows go down in order', () => {
    for (const pack of PACKS) {
      const layout = layoutTree(topicTree(pack.topicId), { mode: 'indented' });
      // The content of a 360 px screen is 328 px wide.
      expect(layout.width, pack.topicId).toBeLessThanOrEqual(328);
      for (let i = 1; i < layout.nodes.length; i++) expect(layout.nodes[i].y).toBeGreaterThan(layout.nodes[i - 1].y);
      for (const n of layout.nodes) if (n.parentId) expect(n.x).toBeGreaterThan(layout.nodes.find((p) => p.id === n.parentId)!.x);
    }
    const root = topicTree('ledger');
    const layout = layoutTree(root, { mode: 'indented' });
    const first = layout.nodes[1].id;
    expect(neighbour(layout, root.id, 'ArrowDown')).toBe(first);
    expect(neighbour(layout, first, 'ArrowUp')).toBe(root.id);
    expect(neighbour(layout, first, 'ArrowLeft')).toBe(root.id);
    expect(neighbour(layout, root.id, 'ArrowRight')).toBe(first);
  });

  for (const course of COURSES) {
    it(`${course.id}: on a phone the course map is no wider than the screen, and its links add at most half again`, () => {
      const layout = layoutTree(courseMapTree(course.id, course.title, null), { mode: 'indented' });
      expectNoOverlap(layout, course.id);
      const { width } = layoutArcs(layout, courseLinks(course.id));
      expect(layout.width).toBeLessThanOrEqual(328);
      expect(width).toBeLessThanOrEqual(1.6 * 328);
    });
  }

  it('is the same every time for the same tree', () => {
    const tree = topicTree('journal-entries');
    expect(JSON.stringify(layoutTree(tree, { mode: 'mindmap' }))).toBe(JSON.stringify(layoutTree(topicTree('journal-entries'), { mode: 'mindmap' })));
    expect(JSON.stringify(layoutTree(tree))).toBe(JSON.stringify(layoutTree(tree)));
  });

  it('puts a parent level with the middle of its children, and children in a column to its right', () => {
    const tree: MapNode = {
      id: 'r',
      kind: 'topic',
      label: 'Root',
      children: [
        { id: 'a', kind: 'concept', label: 'A', children: [] },
        { id: 'b', kind: 'concept', label: 'B', children: [] },
        { id: 'c', kind: 'concept', label: 'C', children: [] },
      ],
    };
    const layout = layoutTree(tree);
    const at = (id: string) => layout.nodes.find((n) => n.id === id)!;
    const mid = (id: string) => at(id).y + at(id).h / 2;
    // Positions are whole pixels, so within one.
    expect(Math.abs(mid('r') - mid('b'))).toBeLessThanOrEqual(1);
    expect(at('a').x).toBe(at('b').x);
    expect(at('a').x).toBeGreaterThan(at('r').x + at('r').w);
    expect(at('a').y).toBeLessThan(at('b').y);
    // On two sides the root is between them.
    const two = layoutTree(tree, { mode: 'mindmap' });
    const r = two.nodes.find((n) => n.id === 'r')!;
    expect(two.nodes.filter((n) => n.side === 1).every((n) => n.x > r.x + r.w)).toBe(true);
    expect(two.nodes.filter((n) => n.side === -1).every((n) => n.x + n.w < r.x)).toBe(true);
    expect(two.nodes.filter((n) => n.side === -1).length).toBeGreaterThan(0);
  });

  it('shares the root’s children between two sides where their heights are closest', () => {
    expect(splitPoint([10, 10, 10, 10])).toBe(2);
    expect(splitPoint([40, 10, 10, 10, 10])).toBe(1);
    expect(splitPoint([10, 10, 10])).toBe(1);
    expect(splitPoint([5])).toBe(1);
  });

  it('wraps a label at spaces, and cuts it after three lines', () => {
    expect(wrapText('How is capital found from assets and liabilities?', 20)).toEqual(['How is capital found', 'from assets and', 'liabilities?']);
    const long = wrapText('one two three four five six seven eight nine ten eleven twelve thirteen', 12);
    expect(long).toHaveLength(3);
    expect(long[2].endsWith('…')).toBe(true);
    for (const line of wrapText('Supercalifragilisticexpialidocious', 10)) expect(line.length).toBeLessThanOrEqual(10);
  });

  it('moves with the arrow keys: right to a child, left to the parent, up and down in a column; mirrored on the left', () => {
    const root = topicTree('ledger');
    const layout = layoutTree(visibleTree(root, new Set()), { mode: 'mindmap' });
    const rootId = root.id;
    const right = neighbour(layout, rootId, 'ArrowRight')!;
    const left = neighbour(layout, rootId, 'ArrowLeft')!;
    expect(layout.nodes.find((n) => n.id === right)!.side).toBe(1);
    expect(layout.nodes.find((n) => n.id === left)!.side).toBe(-1);
    expect(neighbour(layout, right, 'ArrowLeft')).toBe(rootId);
    expect(neighbour(layout, left, 'ArrowRight')).toBe(rootId);
    const child = neighbour(layout, right, 'ArrowRight')!;
    expect(layout.nodes.find((n) => n.id === child)!.parentId).toBe(right);
    const leftChild = neighbour(layout, left, 'ArrowLeft')!;
    expect(layout.nodes.find((n) => n.id === leftChild)!.parentId).toBe(left);
    const below = neighbour(layout, right, 'ArrowDown')!;
    expect(layout.nodes.find((n) => n.id === below)!.y).toBeGreaterThan(layout.nodes.find((n) => n.id === right)!.y);
    expect(neighbour(layout, below, 'ArrowUp')).toBe(right);
    expect(neighbour(layout, child, 'Home')).toBe(rootId);
    expect(neighbour(layout, rootId, 'ArrowUp')).toBeNull();
  });
});
