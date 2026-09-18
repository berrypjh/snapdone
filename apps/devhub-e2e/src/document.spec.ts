import { expect, test } from '@playwright/test';

import { tabTo } from './support/keyboard';

const DOCUMENT = '/documents/quality-gates';

test.describe('"이 페이지에서" on a wide workspace', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('sits beside the text and follows the scroll', async ({ page }) => {
    await page.goto(DOCUMENT);
    const toc = page.getByRole('navigation', { name: '이 페이지에서' });
    await expect(toc).toBeVisible();
    await expect(page.getByRole('group').filter({ hasText: '이 페이지에서' })).toHaveCount(0);

    await page.getByRole('main').evaluate((main) => main.scrollTo(0, main.scrollHeight / 2));
    await expect(toc).toBeInViewport();
  });

  test('sits in the middle of the workspace', async ({ page }) => {
    await page.goto(DOCUMENT);
    // Space on each side of the document column, inside the workspace.
    const { left, right } = await page.getByRole('main').evaluate((main) => {
      const pane = main.getBoundingClientRect();
      const column = (main.querySelector('header') as HTMLElement).getBoundingClientRect();
      return { left: column.left - pane.left, right: pane.right - column.right };
    });
    expect(left).toBeGreaterThan(48);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(20);
  });
});

test.describe('"이 페이지에서" on a narrow screen', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('folds above the text and takes the reader to a section', async ({ page }) => {
    await page.goto(DOCUMENT);
    const summary = page.locator('summary').filter({ hasText: '이 페이지에서' });
    await expect(summary).toBeInViewport();
    const toc = page.getByRole('navigation', { name: '이 페이지에서' });
    await expect(toc).toBeHidden();

    await tabTo(page, summary);
    await page.keyboard.press('Enter');
    await expect(toc).toBeVisible();

    const first = toc.getByRole('link').first();
    const id = ((await first.getAttribute('href')) ?? '').slice(1);
    await tabTo(page, first);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`#${encodeURIComponent(id)}$`));
    await expect(page.locator(`[id="${id}"]`)).toBeInViewport();
  });
});
