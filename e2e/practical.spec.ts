import { expect, test, type Page } from '@playwright/test';
import PRACTICAL_11 from '../src/content/practical/cbse11';
import PRACTICAL_12 from '../src/content/practical/cbse12';
import { NO_FILTER, filterViva } from '../src/content/practical/viva';
import { CLASS12, createProfile } from './helpers';

// "Project and viva" (/practical), read from the data files as they stand: the tests hold for however many options
// and questions the files have.

const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const showing = (n: number, total: number) => `Showing ${n} of ${total} questions`;

test('the page opens for each class with its own projects, and switching course shows the other', async ({ page }, info) => {
  await createProfile(page, 'Varun');
  await page.goto('/practical');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Project and viva');
  await expect(page.getByTestId('practical-summary')).toContainText(`${PRACTICAL_11.viva.length} viva questions`);
  for (const o of PRACTICAL_11.options) await expect(page.getByTestId(`guide-${o.id}`)).toContainText(o.title);
  await expect(page.getByTestId('practical-marks')).toContainText('12 marks');
  await expect(page.getByTestId('practical-marks')).toContainText('8 marks');

  if (info.project.name === 'laptop') {
    // The course switch of the sidebar: the page shows the other course's project work at once.
    await page.getByTestId(`sidebar-course-${CLASS12}`).click();
    for (const o of PRACTICAL_12.options) await expect(page.getByTestId(`guide-${o.id}`)).toContainText(o.title);
    await expect(page.getByTestId('practical-summary')).toContainText(`${PRACTICAL_12.viva.length} viva questions`);
    await expect(page.getByTestId(`guide-${PRACTICAL_11.options[0].id}`)).toHaveCount(0);
  }
});

test('a Class 12 learner sees the analysis project, and its worked ratios', async ({ page }) => {
  await createProfile(page, 'Meera', { courseId: CLASS12 });
  await page.goto('/practical');
  const fsa = PRACTICAL_12.options[0];
  await page.getByTestId(`guide-open-${fsa.id}`).click();
  const guide = page.getByTestId(`guide-${fsa.id}`);
  await expect(guide.getByTestId('guide-sections').locator('li')).toHaveCount(fsa.fileSections.length);
  await expect(guide.getByTestId('worked-ratio-current')).toContainText('2.25 : 1');
  await expect(guide.getByTestId('worked-comparative')).toContainText('66.67%');
});

test('a guide opens with its file, plan, mistakes and a worked example whose figures agree', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto('/practical');
  const option = PRACTICAL_11.options.find((o) => o.id === 'comprehensive')!;
  const guide = page.getByTestId(`guide-${option.id}`);
  await expect(guide.getByTestId('guide-plan')).toBeHidden();
  await page.getByTestId(`guide-open-${option.id}`).click();
  await expect(guide.getByTestId('guide-sections').locator('li')).toHaveCount(option.fileSections.length);
  await expect(guide.getByTestId('guide-plan').locator('li')).toHaveCount(option.plan.length);
  await expect(guide.getByTestId('guide-mistakes')).toContainText(option.mistakes[0]);
  await expect(guide.getByTestId('worked-trial-balance')).toContainText('7,62,750');
  await expect(guide.getByTestId('worked-key-figures')).toContainText('Net profit ₹63,350');
  await expect(guide.getByTestId('worked-balance-sheet')).toContainText('5,16,100');
  await expect(guide.getByTestId('worked-chart')).toHaveCount(4);
  // The journal folds; opened, it has every entry.
  await guide.getByTestId('worked-journal-fold').locator('summary').click();
  await expect(guide.getByTestId('worked-journal')).toContainText('Being input tax set off');

  // The BRS guide: the statement ends at the pass book balance.
  await page.getByTestId('guide-open-brs').click();
  await expect(page.getByTestId('guide-brs').getByTestId('worked-brs')).toContainText('76,950');

  // Printing a guide: the other guides and the header are left off the print.
  await page.evaluate(() => {
    window.print = () => {
      (window as unknown as { printed: string | null }).printed = document.querySelector('[data-testid="practical"]')?.getAttribute('data-printing') ?? null;
    };
  });
  await page.getByTestId('guide-print-brs').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed?: string | null }).printed)).toBe('brs');
  await expect(page.getByTestId('guide-vouchers')).toHaveClass(/print:hidden/);
  await expect(page.getByTestId('guide-brs')).not.toHaveClass(/print:hidden/);
});

test('the viva bank filters by topic, project and difficulty, and finds questions by search', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto('/practical');
  await page.getByTestId('practical-view-bank').click();
  const all = PRACTICAL_11.viva.length;
  await expect(page.getByTestId('viva-showing')).toHaveText(showing(all, all));

  const topic = 'bank-reconciliation';
  await page.getByTestId('viva-topic').selectOption(topic);
  const byTopic = filterViva(PRACTICAL_11.viva, { ...NO_FILTER, topicId: topic });
  await expect(page.getByTestId('viva-showing')).toHaveText(showing(byTopic.length, all));
  await page.getByTestId('viva-option').selectOption('brs');
  await page.getByTestId('viva-difficulty').selectOption('easy');
  const narrowed = filterViva(PRACTICAL_11.viva, { query: '', topicId: topic, optionId: 'brs', difficulty: 'easy' });
  await expect(page.getByTestId('viva-showing')).toHaveText(showing(narrowed.length, all));
  await page.getByTestId('viva-clear').click();
  await expect(page.getByTestId('viva-showing')).toHaveText(showing(all, all));

  // Search: a question found by its own words, its model answer shown on request.
  const target = PRACTICAL_11.viva.find((q) => q.question.length > 40)!;
  await page.getByTestId('viva-search').fill(target.question);
  await expect(page.getByTestId(`viva-${target.id}`)).toBeVisible();
  const card = page.getByTestId(`viva-${target.id}`);
  await expect(card.getByTestId('viva-answer')).toHaveCount(0);
  await card.getByTestId('viva-answer-toggle').click();
  await expect(card.getByTestId('viva-answer')).toHaveText(target.answer);
  await page.getByTestId('viva-search').fill('zzzz no such question');
  await expect(page.getByTestId('viva-none')).toBeVisible();
});

test('practising a viva reveals the answer, marks it, and brings "Not yet" back first after a reload', async ({ page }) => {
  await createProfile(page, 'Varun');
  await page.goto('/practical');
  await page.getByTestId('practical-view-practice').click();
  // Practise the questions of one topic.
  const topic = 'trial-balance';
  const pool = filterViva(PRACTICAL_11.viva, { ...NO_FILTER, topicId: topic });
  await page.getByTestId('viva-topic').selectOption(topic);
  await expect(page.getByTestId('viva-count-unseen')).toHaveText(`Not tried: ${pool.length}`);
  await page.getByTestId('viva-start').click();

  const practice = page.getByTestId('viva-practice');
  await expect(practice).toHaveAttribute('data-question', pool[0].id);
  await expect(page.getByTestId('viva-question')).toHaveText(pool[0].question);
  await expect(page.getByTestId('viva-model')).toHaveCount(0);
  await page.getByTestId('viva-reveal').click();
  await expect(page.getByTestId('viva-model')).toHaveText(pool[0].answer);
  await page.getByTestId('viva-knew').click();

  await expect(practice).toHaveAttribute('data-question', pool[1].id);
  await page.getByTestId('viva-reveal').click();
  await page.getByTestId('viva-notyet').click();
  await expect(page.getByTestId('viva-progress')).toHaveText(`Question 3 of ${pool.length}`);
  await page.getByTestId('viva-stop').click();
  await expect(page.getByTestId('viva-count-knew')).toHaveText('I knew it: 1');
  await expect(page.getByTestId('viva-count-notyet')).toHaveText('Not yet: 1');

  // Kept on the device: after a reload the marks are there, and the "Not yet" question comes first, the known one last.
  await page.reload();
  await page.getByTestId('practical-view-practice').click();
  await page.getByTestId('viva-topic').selectOption(topic);
  await expect(page.getByTestId('viva-count-notyet')).toHaveText('Not yet: 1');
  await expect(page.getByTestId('viva-count-unseen')).toHaveText(`Not tried: ${pool.length - 2}`);
  await page.getByTestId('viva-start').click();
  await expect(practice).toHaveAttribute('data-question', pool[1].id);
  await expect(practice).toContainText('Last time: Not yet');

  // The bank shows the marks too.
  await page.getByTestId('viva-stop').click();
  await page.getByTestId('practical-view-bank').click();
  await expect(page.getByTestId(`viva-${pool[0].id}`).getByTestId('viva-mark')).toHaveText('I knew it');
});

test('Go to finds a project and a viva question and opens them at their place; Home and Before the exam link here', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  await createProfile(page, 'Varun');
  await expect(page.getByTestId('quick-practical')).toHaveAttribute('href', '/practical');
  await page.goto('/exam');
  await expect(page.getByTestId('exam-practical-link')).toHaveAttribute('href', '/practical');

  const open = async () => {
    if (phone) await page.getByTestId('goto-open').click();
    else await expect(async () => { await page.keyboard.press('Control+k'); await expect(page.getByTestId('goto-input')).toBeVisible({ timeout: 1000 }); }).toPass();
  };
  await open();
  await page.getByTestId('goto-input').fill('Bank reconciliation statement (project)');
  await page.getByTestId('goto-result').filter({ hasText: 'Bank reconciliation statement (project)' }).first().click();
  await expect(page).toHaveURL(/\/practical#option-brs$/);
  await expect(page.getByTestId('guide-brs')).toHaveAttribute('data-target', 'true');
  await expect(page.getByTestId('guide-brs').getByTestId('guide-plan')).toBeVisible();

  const q = PRACTICAL_11.viva.find((v) => v.question.length > 40 && v.topicId === 'depreciation')!;
  await open();
  await page.getByTestId('goto-input').fill(q.question);
  await page.getByTestId('goto-result').filter({ hasText: q.question }).first().click();
  await expect(page).toHaveURL(new RegExp(`/practical#viva-${q.id}$`));
  const card = page.getByTestId(`viva-${q.id}`);
  await expect(card).toHaveAttribute('data-target', 'true');
  await expect(card.getByTestId('viva-answer')).toHaveText(q.answer);
});

test('at 1280 px the page has the sidebar with its own item marked', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop', 'the laptop layout');
  await createProfile(page, 'Varun');
  await page.goto('/practical');
  const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
  await expect(sidebar.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(sidebar.getByTestId('nav-practical')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('topbar-title')).toHaveText('Project and viva');
});

test('at 360 px nothing scrolls sideways: the guides with their worked tables, the bank and the practice', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await createProfile(page, 'Varun');
  await page.goto('/practical');
  for (const o of PRACTICAL_11.options) await page.getByTestId(`guide-open-${o.id}`).click();
  await expect(page.getByTestId('guide-comprehensive').getByTestId('worked-balance-sheet')).toBeVisible();
  await page.getByTestId('guide-comprehensive').getByTestId('worked-journal-fold').locator('summary').click();
  await page.getByTestId('guide-vouchers').getByTestId('worked-vouchers-fold').locator('summary').click();
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.getByTestId('practical-view-bank').click();
  await expect(page.getByTestId('viva-showing')).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.getByTestId('practical-view-practice').click();
  await page.getByTestId('viva-start').click();
  await page.getByTestId('viva-reveal').click();
  expect(await noSidewaysScroll(page)).toBe(true);
});

test('at 360 px the Class 12 guides, whose analysis has the widest tables, do not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await createProfile(page, 'Meera', { courseId: CLASS12 });
  await page.goto('/practical');
  for (const o of PRACTICAL_12.options) await page.getByTestId(`guide-open-${o.id}`).click();
  await expect(page.getByTestId('worked-common-size')).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
});
