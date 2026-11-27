import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOGUE_TOPICS, COURSE_IDS, DEFAULT_COURSE_ID } from './catalogue.generated';
import { CARD_TITLES_FILE, CATALOGUE_FILE, renderCardTitles, renderCatalogue } from './catalogueSource';
import { COURSES, PACKS } from './registry';

describe('the generated catalogue (ids only, for the root layout)', () => {
  it('is up to date with the packs: run `npm run catalogue` when this fails', () => {
    const committed = fs.readFileSync(path.join(process.cwd(), CATALOGUE_FILE), 'utf8').replace(/\r\n/g, '\n');
    expect(committed).toBe(renderCatalogue());
  });

  it('lists the playable topics in course order with their levels in level order', () => {
    expect(CATALOGUE_TOPICS.map((t) => t.id)).toEqual(PACKS.map((p) => p.topicId));
    for (const pack of PACKS) {
      const topic = CATALOGUE_TOPICS.find((t) => t.id === pack.topicId)!;
      expect(topic.levelIds).toEqual([...pack.levels].sort((a, b) => a.order - b.order).map((l) => l.id));
    }
  });

  it('knows the courses, and a new learner joins the first', () => {
    expect(COURSE_IDS).toEqual(COURSES.map((c) => c.id));
    expect(DEFAULT_COURSE_ID).toBe(COURSES[0].id);
  });
});

describe('the generated card titles (for "Go to")', () => {
  it('are up to date with the packs: run `npm run catalogue` when this fails', () => {
    const committed = fs.readFileSync(path.join(process.cwd(), CARD_TITLES_FILE), 'utf8').replace(/\r\n/g, '\n');
    expect(committed).toBe(renderCardTitles());
  });

  it('have the front of every card of every playable topic', async () => {
    const { CARD_TITLES } = await import('./cardTitles.generated');
    const cards = PACKS.flatMap((p) => p.cards);
    expect(Object.keys(CARD_TITLES)).toHaveLength(cards.length);
    for (const card of cards) expect(CARD_TITLES[card.id]).toBe(card.prompt);
  });
});
