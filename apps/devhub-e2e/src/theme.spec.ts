import { expect, type Page, test } from '@playwright/test';

import { tabTo } from './support/keyboard';

const theme = (page: Page) => page.locator('html');
const option = (page: Page, name: '라이트' | '다크') =>
  page.getByRole('group', { name: '화면 테마' }).getByRole('button', { name, exact: true });

test.describe('theme', () => {
  test.describe('with a dark OS preference', () => {
    test.use({ colorScheme: 'dark' });

    test('starts dark and marks the dark option', async ({ page }) => {
      await page.goto('/');
      await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
      await expect(option(page, '다크')).toHaveAttribute('aria-pressed', 'true');
    });
  });

  test('switches with the keyboard and keeps the choice after reload', async ({ page }) => {
    await page.goto('/');
    await expect(theme(page)).toHaveAttribute('data-theme', 'light');

    await tabTo(page, option(page, '다크'));
    await page.keyboard.press('Enter');
    await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
    await expect(option(page, '다크')).toHaveAttribute('aria-pressed', 'true');
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    await page.reload();
    await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
      background,
    );
  });
});
