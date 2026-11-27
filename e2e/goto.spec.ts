import { expect, test } from '@playwright/test';
import { COURSES } from '../src/content/registry';
import { CARD_TITLES } from '../src/content/cardTitles.generated';
import { TEMPLATES } from '../src/generators';
import { CLASS12_LIVE, JE, createProfile, packOf } from './helpers';

// "Go to": Ctrl K on a laptop, the search button of the header on a phone.
async function open(page: import('@playwright/test').Page, phone: boolean) {
  if (phone) await page.getByTestId('goto-open').click();
  // Ctrl K works once the page has hydrated: press it until Go to opens.
  else await expect(async () => { await page.keyboard.press('Control+k'); await expect(page.getByTestId('goto-input')).toBeVisible({ timeout: 1000 }); }).toPass();
  await expect(page.getByRole('dialog', { name: 'Go to' })).toBeVisible();
  await expect(page.getByTestId('goto-input')).toBeFocused();
}

test('Go to finds a topic and goes there with Enter', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  await createProfile(page, 'Varun');
  await open(page, phone);
  await page.getByTestId('goto-input').fill('journal entries');
  const first = page.getByTestId('goto-result').first();
  await expect(first).toHaveAttribute('data-href', `/topics/${JE}`);
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await expect(first.getByTestId('goto-result-course')).toHaveText('Class 11');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/topics/${JE}$`));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('level-0')).toBeVisible();
});

test('Go to finds a question pattern by its concept and opens it in the playground', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  await createProfile(page, 'Varun');
  const template = TEMPLATES.find((t) => t.topicId === 'depreciation')!;
  const concept = packOf('depreciation').concepts.find((c) => c.id === template.conceptId)!.title;
  await open(page, phone);
  await page.getByTestId('goto-input').fill(`${concept} pattern`);
  const href = `/playground?topic=depreciation&pattern=${template.id}`;
  const result = page.locator(`[data-testid="goto-result"][data-href="${href}"]`);
  await expect(result).toHaveCount(1);
  // Arrow keys move the choice; Enter goes to the one chosen.
  const hrefs = await page.getByTestId('goto-result').evaluateAll((els) => els.map((e) => e.getAttribute('data-href')));
  const at = hrefs.indexOf(href);
  for (let i = 0; i < at; i++) await page.keyboard.press('ArrowDown');
  await expect(result).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL((url) => url.pathname === '/playground' && url.searchParams.get('topic') === 'depreciation' && url.searchParams.get('pattern') === template.id);
});

test('Go to finds a rule card and shows it on its topic page; Escape closes and gives focus back', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop', 'keyboard focus on the laptop');
  await createProfile(page, 'Varun');
  await page.goto('/topics');
  const opener = page.getByTestId('goto-open');
  await opener.click();
  await expect(page.getByTestId('goto-input')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();

  const [cardId, title] = Object.entries(CARD_TITLES).find(([id]) => packOf(JE).cards.some((c) => c.id === id))!;
  await page.keyboard.press('Control+k');
  // Tab stays inside the dialog.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('goto-input')).toBeFocused();
  await page.getByTestId('goto-input').fill(title);
  await page.locator(`[data-testid="goto-result"][data-href="/topics/${JE}#card-${cardId}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/topics/${JE}#card-${cardId}$`));
  await expect(page.getByTestId(`rule-card-${cardId}`)).toBeVisible();
  await expect(page.getByTestId(`rule-card-${cardId}`)).toHaveAttribute('data-target', 'true');
});

test('Go to finds the other course too, shown as such, after the learner’s own', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop', 'once is enough');
  test.skip(!CLASS12_LIVE, 'needs a second course');
  await createProfile(page, 'Varun');
  const topic = COURSES[1].topics.find((t) => t.status === 'available')!;
  await page.keyboard.press('Control+k');
  await page.getByTestId('goto-input').fill(topic.title);
  const result = page.locator(`[data-testid="goto-result"][data-href="/topics/${topic.id}"]`);
  await expect(result.getByTestId('goto-result-course')).toHaveText('Class 12');
  await result.click();
  await expect(page.getByTestId('topic-other-course')).toBeVisible();
  await page.getByTestId('topic-switch-course').click();
  await expect(page.getByTestId('level-0')).toBeVisible();
});
