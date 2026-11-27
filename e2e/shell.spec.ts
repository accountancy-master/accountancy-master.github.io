import { expect, test, type Page } from '@playwright/test';
import { NAV_GROUPS, NAV_ITEMS } from '../src/components/shell/navigation';
import { CLASS11, CLASS12, CLASS12_LIVE, JE, createProfile, seedPassedLevels } from './helpers';

const scrollsSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

test('at 1280 px a sidebar with every group of the navigation, and a top bar with the title, the chips and the learner', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop', 'the laptop layout');
  await createProfile(page, 'Varun');
  const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
  await expect(sidebar).toBeVisible();
  const nav = sidebar.getByRole('navigation', { name: 'Main' });
  for (const item of NAV_ITEMS) await expect(nav.getByTestId(item.testId), item.href).toHaveAttribute('href', item.href);
  for (const label of NAV_GROUPS.flatMap((g) => (g.label ? [g.label] : []))) await expect(nav.getByText(label, { exact: true })).toBeVisible();
  await expect(page.getByTestId('nav-home')).toHaveAttribute('aria-current', 'page');
  // One navigation only: the phone's bottom bar is not on the page.
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(1);
  await expect(page.getByTestId('goto-open')).toContainText('Ctrl K');
  await expect(page.getByTestId('sidebar-learner')).toContainText('Varun');

  // The top bar: the page's title under a line that says where it is, the chips, the theme, the learner's menu.
  await expect(page.getByTestId('topbar-title')).toHaveText('Home');
  await expect(page.getByTestId('topbar-exam')).toHaveText('Set exam date');
  await expect(page.getByTestId('xp-total')).toContainText('0');
  await expect(page.getByTestId('streak')).toBeVisible();
  await page.getByTestId('nav-marathon').click();
  await expect(page).toHaveURL(/\/practice\/marathon$/);
  await expect(page.getByTestId('topbar-title')).toHaveText('Marathon');
  await expect(page.getByTestId('nav-marathon')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('nav-practice')).not.toHaveAttribute('aria-current', 'page');

  // The theme toggle switches to dark and back, and is kept on reload.
  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  // The learner's menu: settings, and switching learner.
  await page.getByTestId('learner-menu').click();
  await expect(page.getByTestId('menu-settings')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('menu-settings')).toHaveCount(0);
  await expect(page.getByTestId('learner-menu')).toBeFocused();
  await page.getByTestId('learner-menu').click();
  await page.getByTestId('menu-switch-learner').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('profile-pick-Varun')).toBeVisible();
});

test('the course switch in the sidebar changes course, as Settings does', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop', 'the laptop layout');
  test.skip(!CLASS12_LIVE, 'needs a second course');
  await createProfile(page, 'Varun');
  await expect(page.getByTestId(`sidebar-course-${CLASS11}`)).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId(`sidebar-course-${CLASS12}`).click();
  await expect(page.getByTestId(`sidebar-course-${CLASS12}`)).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('nav-settings').click();
  await expect(page.getByTestId(`course-${CLASS12}`)).toHaveAttribute('aria-pressed', 'true');
});

test('at 360 px the phone layout: a header with a search button and the five items of the bottom bar', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the phone layout');
  await page.setViewportSize({ width: 360, height: 740 });
  await createProfile(page, 'Varun');
  await expect(page.getByRole('complementary', { name: 'Sidebar' })).toHaveCount(0);
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link')).toHaveText(['Home', 'Topics', 'Practice', 'Progress', 'Settings']);
  await expect(page.getByTestId('goto-open')).toBeVisible();
  await expect(page.getByTestId('profile-name')).toHaveText('Varun');
  // A page under Practice (the marathon's set-up) marks Practice.
  await page.goto('/practice/marathon');
  await expect(page.getByTestId('nav-practice')).toHaveAttribute('aria-current', 'page');
});

for (const path of ['/home', '/topics', `/topics/${JE}`, '/inside', '/progress', '/settings', '/sheets']) {
  test(`${path} does not scroll sideways at 360 px`, async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'the phone layout');
    await page.setViewportSize({ width: 360, height: 740 });
    await createProfile(page, 'Varun');
    // Something played, so that every card has its longest text: levels, a next step, recent activity.
    await seedPassedLevels(page, 3, JE);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await scrollsSideways(page)).toBe(false);
  });
}
