import { expect, type Page, test } from '@playwright/test';

import { SCENARIO } from './support/keyboard';

const searchBox = (page: Page) => page.getByRole('combobox', { name: '저장소 검색' });
const resultStatus = (page: Page) => page.getByRole('status').filter({ hasText: /^결과 \d+개/ });

test.describe('global search', () => {
  test('opens with Cmd/Ctrl+K from anywhere on the page', async ({ page }) => {
    await page.goto('/architecture');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: '본문으로 건너뛰기' })).toBeFocused();

    await page.keyboard.press('ControlOrMeta+k');
    await expect(searchBox(page)).toBeFocused();
  });

  test('announces the count and shows the result kind as text', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('ControlOrMeta+k');
    await page.keyboard.type(SCENARIO.title);

    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(resultStatus(page)).toHaveCount(1);
    const first = page.getByRole('option').first();
    await expect(first).toContainText(SCENARIO.title);
    await expect(first).toContainText('시나리오 ·');
  });

  test('moves through results with the arrows and opens one with Enter', async ({ page }) => {
    await page.goto('/');
    const search = searchBox(page);
    await page.keyboard.press('ControlOrMeta+k');
    await page.keyboard.type(SCENARIO.title);

    await page.keyboard.press('ArrowDown');
    const first = page.getByRole('option').first();
    await expect(first).toHaveAttribute('aria-selected', 'true');
    await expect(search).toHaveAttribute('aria-activedescendant', /.+/);
    await expect(search).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`/scenarios/${SCENARIO.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(SCENARIO.title);
    // Like a page load: the next Tab starts at the top of the new page.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: '본문으로 건너뛰기' })).toBeFocused();
  });

  test('closes the list with Escape and keeps focus and text in the box', async ({ page }) => {
    await page.goto('/');
    const search = searchBox(page);
    await page.keyboard.press('ControlOrMeta+k');
    await page.keyboard.type('session');
    await expect(page.getByRole('listbox')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('session');
    await expect(search).toHaveAttribute('aria-expanded', 'false');
  });

  test('says so when nothing matches', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('ControlOrMeta+k');
    await page.keyboard.type('zzzz-no-such-thing');

    await expect(page.getByRole('status').filter({ hasText: '일치하는 항목 없음' })).toHaveCount(1);
  });
});
