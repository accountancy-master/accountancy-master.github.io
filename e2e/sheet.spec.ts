import { expect, test } from '@playwright/test';
import { JOURNAL_ENTRIES } from '../src/content/cbse11/journalEntries';
import { FIRST_TOPIC, JE, cardSteps, createProfile, headerXp } from './helpers';

const SHEET = `/sheet/${JE}`;

test('the sheet needs a learner, like every other page', async ({ page }) => {
  await page.goto(SHEET);
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByTestId('profile-name-input')).toBeVisible();
});

test('every card of Journal Entries is on the sheet, grouped by concept in pack order', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto(SHEET);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Journal Entries');

  const cards = page.getByTestId('sheet-card');
  await expect(cards).toHaveCount(JOURNAL_ENTRIES.cards.length);
  for (const card of JOURNAL_ENTRIES.cards) {
    const entry = page.locator(`[data-testid="sheet-card"][data-card-id="${card.id}"]`);
    await expect(entry.getByRole('heading', { level: 3 })).toHaveText(card.prompt);
    await expect(entry).toContainText(card.answer);
    await expect(entry).toContainText(card.example);
    await expect(entry.getByTestId('sheet-watch-out')).toHaveText(`Watch out: ${card.commonMistake}`);
  }

  // Concept headings follow the pack, and each card sits under its own concept.
  const withCards = JOURNAL_ENTRIES.concepts.filter((c) => JOURNAL_ENTRIES.cards.some((card) => card.conceptId === c.id));
  await expect(page.getByTestId('sheet-concept').getByRole('heading', { level: 2 })).toHaveText(withCards.map((c) => c.title));
  for (const concept of withCards) {
    const section = page.locator(`[data-testid="sheet-concept"][data-concept-id="${concept.id}"]`);
    const expected = JOURNAL_ENTRIES.cards.filter((card) => card.conceptId === concept.id).map((card) => card.id);
    const found = await section.getByTestId('sheet-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-card-id')));
    expect(found).toEqual(expected);
  }
});

test('the back link returns to the topic, and the topic links to the sheet', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto(`/topics/${JE}`);
  await expect(page.getByTestId('topic-sheet')).toHaveText('Quick sheet');
  await page.getByTestId('topic-sheet').click();
  await expect(page).toHaveURL(new RegExp(`/sheet/${JE}$`));

  // A page of the app like any other, its navigation marking Quick sheets (Topics on a phone); the navigation is left
  // off the print.
  await expect(page.locator('nav[aria-label="Main"]')).toHaveCount(1);
  await expect(page.getByTestId(page.viewportSize()!.width >= 1024 ? 'nav-sheets' : 'nav-topics')).toHaveAttribute('aria-current', 'page');

  await expect(page.getByTestId('sheet-back')).toHaveAttribute('href', `/topics/${JE}`);
  await page.getByTestId('sheet-back').click();
  await expect(page).toHaveURL(new RegExp(`/topics/${JE}$`));
});

test('an unknown topic is a 404', async ({ page }) => {
  const res = await page.goto('/sheet/nope');
  expect(res?.status()).toBe(404);
});

test('reading the sheet records nothing', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto('/progress');
  await expect(page.getByTestId('xp-total')).not.toContainText('–');
  const before = await headerXp(page);

  await page.goto(SHEET);
  await expect(page.getByTestId('sheet-card')).toHaveCount(JOURNAL_ENTRIES.cards.length);

  await page.goto('/progress');
  await expect(page.getByTestId('xp-total')).not.toContainText('–');
  expect(await headerXp(page)).toBe(before);
  await page.goto('/practice');
  await expect(page.getByTestId('hub-cards-count')).toHaveText(`0 due · ${FIRST_TOPIC.cards.length} new`);
  await page.getByTestId('hub-cards').click();
  await expect(page.getByTestId('card')).toBeVisible();
  await expect(page.getByTestId('player-progress')).toHaveAttribute('aria-label', new RegExp(`0 of ${cardSteps(FIRST_TOPIC.cards.length)} steps done`));
});

test('Print asks the browser to print', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto(SHEET);
  await page.evaluate(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => {
      (window as unknown as { printed: number }).printed++;
    };
  });
  await page.getByTestId('sheet-print').click();
  expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
});

test('on a 360 px phone the sheet does not scroll sideways and its targets are large enough', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(SHEET);
  await expect(page.getByTestId('sheet-card')).toHaveCount(JOURNAL_ENTRIES.cards.length);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  for (const id of ['sheet-back', 'sheet-print']) {
    const box = (await page.getByTestId(id).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
});

test('in print the controls are gone, the page is black on white and cards are kept whole', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto(SHEET);
  await expect(page.getByTestId('sheet-card')).toHaveCount(JOURNAL_ENTRIES.cards.length);
  await page.emulateMedia({ media: 'print' });

  await expect(page.getByTestId('sheet-back')).toBeHidden();
  await expect(page.getByTestId('sheet-print')).toBeHidden();
  const look = await page.evaluate(() => {
    const css = (el: Element) => getComputedStyle(el);
    const card = document.querySelector('[data-testid="sheet-card"]')!;
    const texts = [...document.querySelectorAll('[data-testid="sheet"] h1, [data-testid="sheet"] h2, [data-testid="sheet"] h3, [data-testid="sheet"] p')];
    return {
      page: css(document.body).backgroundColor,
      cardBackground: css(card).backgroundColor,
      cardBreak: css(card).breakInside,
      colours: [...new Set(texts.map((t) => css(t).color))],
    };
  });
  expect(look.page).toBe('rgb(255, 255, 255)');
  expect(['rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)']).toContain(look.cardBackground);
  expect(look.cardBreak).toBe('avoid');
  expect(look.colours).toEqual(['rgb(0, 0, 0)']);
});
