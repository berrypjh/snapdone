import { expect, test } from '@playwright/test';

import { SCENARIO, tabTo } from './support/keyboard';

test.describe('shell', () => {
  test('exposes one banner and main, and names every navigation and side pane', async ({
    page,
  }) => {
    await page.goto(`/scenarios/${SCENARIO.id}`);

    await expect(page.getByRole('banner')).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: '보기' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: '저장소 항목' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: '탐색기' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: '상세 정보' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(SCENARIO.title);
  });

  test('moves focus into the main content with the first skip link', async ({ page }) => {
    await page.goto(`/scenarios/${SCENARIO.id}`);

    const skip = page.getByRole('link', { name: '본문으로 건너뛰기' });
    await page.keyboard.press('Tab');
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();

    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
  });

  test('keeps the skip links hidden after a mouse click on a view', async ({ page }) => {
    await page.goto('/');
    const skip = page.getByRole('link', { name: '본문으로 건너뛰기' });

    for (const view of ['시나리오', '아키텍처', '문서', '엔지니어링', '개요']) {
      const link = page
        .getByRole('navigation', { name: '보기' })
        .getByRole('link', { name: view, exact: true });
      await link.click();
      await expect(link).toHaveAttribute('aria-current', 'page');
      await expect(skip).not.toBeFocused();
      expect((await skip.boundingBox())?.width ?? 0, view).toBeLessThanOrEqual(1);
    }
  });

  test('starts the keyboard at the skip link again after a navigation', async ({ page }) => {
    await page.goto('/');
    const scenarios = page.getByRole('navigation', { name: '보기' }).getByRole('link', {
      name: '시나리오',
    });
    await tabTo(page, scenarios);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/scenarios');

    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: '본문으로 건너뛰기' })).toBeFocused();
  });

  test('moves focus into the inspector with the second skip link', async ({ page }) => {
    await page.goto(`/scenarios/${SCENARIO.id}`);

    await tabTo(page, page.getByRole('link', { name: '상세 정보로 건너뛰기' }), 2);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('complementary', { name: '상세 정보' })).toBeFocused();
  });
});

test.describe('desktop panes', () => {
  test('scroll on their own; the page itself never scrolls', async ({ page }) => {
    for (const path of [
      `/scenarios/${SCENARIO.id}`,
      `/scenarios/${SCENARIO.id}/steps/exchange`,
      '/architecture',
    ]) {
      await page.goto(path);
      const inspector = page.getByRole('complementary', { name: '상세 정보' });
      await inspector.evaluate((pane) => pane.scrollTo(0, pane.scrollHeight));
      await inspector.hover();
      await page.mouse.wheel(0, 2000);

      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        scrollY: window.scrollY,
      }));
      expect(layout, path).toEqual({ overflow: 0, scrollY: 0 });
    }
  });
});

test.describe('narrow viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('puts the workspace on the first screen and folds the explorer', async ({ page }) => {
    await page.goto(`/scenarios/${SCENARIO.id}`);

    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
    const toggle = page.getByRole('button', { name: '탐색기', exact: true });
    const items = page.getByRole('navigation', { name: '저장소 항목' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(items).toBeHidden();

    await tabTo(page, toggle);
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(items).toBeVisible();
  });

  test('reaches the inspector from the top of the workspace', async ({ page }) => {
    await page.goto(`/scenarios/${SCENARIO.id}`);

    const toInspector = page.getByRole('link', { name: '상세 정보로 이동', exact: true });
    await expect(toInspector).toBeVisible();
    await tabTo(page, toInspector);
    await page.keyboard.press('Enter');

    const inspector = page.getByRole('complementary', { name: '상세 정보' });
    await expect(inspector).toBeFocused();
    await expect(inspector.getByRole('heading', { level: 2 })).toBeInViewport();
  });

  test('does not scroll sideways', async ({ page }) => {
    for (const path of ['/', `/scenarios/${SCENARIO.id}`, '/architecture']) {
      await page.goto(path);
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflows, path).toBe(false);
    }
  });
});
