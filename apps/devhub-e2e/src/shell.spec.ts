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

  test('does not focus the inspector when entering a view that keeps a canvas', async ({
    page,
  }) => {
    await page.goto('/');
    const skip = page.getByRole('link', { name: '본문으로 건너뛰기' });
    const inspector = page.getByRole('complementary', { name: '상세 정보' });

    await page
      .getByRole('navigation', { name: '보기' })
      .getByRole('link', { name: '아키텍처' })
      .click();
    await expect(page).toHaveURL('/architecture');
    await expect(inspector).not.toBeFocused();
    await page.keyboard.press('Tab');
    await expect(skip).toBeFocused();

    await page
      .getByRole('navigation', { name: '저장소 항목' })
      .getByRole('link', { name: SCENARIO.title })
      .click();
    await expect(page).toHaveURL(`/scenarios/${SCENARIO.id}`);
    await expect(inspector).not.toBeFocused();
    await page.keyboard.press('Tab');
    await expect(skip).toBeFocused();
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

test.describe('top bar on wide screens', () => {
  test('stays on one row from 1024px up, without sideways scrolling', async ({ page }) => {
    for (const width of [1024, 1280, 1530, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/scenarios/${SCENARIO.id}`);
      const views = await page.getByRole('navigation', { name: '보기' }).boundingBox();
      const theme = await page.getByRole('group', { name: '화면 테마' }).boundingBox();
      const bar = await page.getByRole('banner').boundingBox();
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect({ width, oneRow: (bar?.height ?? 0) < 64, overflows }).toEqual({
        width,
        oneRow: true,
        overflows: false,
      });
      expect(Math.abs((theme?.y ?? 0) - (views?.y ?? 0)), `${width}px`).toBeLessThan(8);
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

  test('opens the explorer as a drawer from the left and closes it again', async ({ page }) => {
    await page.goto(`/scenarios/${SCENARIO.id}`);
    const toggle = page.getByRole('button', { name: '탐색기', exact: true });
    const explorer = page.getByRole('complementary', { name: '탐색기' });
    const items = page.getByRole('navigation', { name: '저장소 항목' });

    await tabTo(page, toggle);
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await explorer.boundingBox())?.x).toBe(0);
    await expect(items).toBeInViewport();
    await expect(explorer.getByRole('link', { name: SCENARIO.title })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(items).toBeHidden();
    await expect(toggle).toBeFocused();

    await toggle.click();
    await explorer.getByRole('button', { name: '탐색기 닫기' }).click();
    await expect(items).toBeHidden();

    await toggle.click();
    await explorer.getByRole('link', { name: '아키텍처', exact: true }).click();
    await expect(page).toHaveURL('/architecture');
    await expect(items).toBeHidden();
  });

  test('opens a view that keeps a canvas at the top, not scrolled to the inspector', async ({
    page,
  }) => {
    await page.goto('/');
    const heading = page.getByRole('heading', { level: 1 });
    const scrollY = () => page.evaluate(() => window.scrollY);

    await page.getByRole('button', { name: '탐색기', exact: true }).click();
    await page
      .getByRole('navigation', { name: '저장소 항목' })
      .getByRole('link', { name: '아키텍처', exact: true })
      .click();
    await expect(page).toHaveURL('/architecture');
    await expect(heading).toHaveText('현재 구조');
    await expect(heading).toBeInViewport();
    expect(await scrollY()).toBe(0);

    await page.getByRole('button', { name: '탐색기', exact: true }).click();
    await page
      .getByRole('navigation', { name: '저장소 항목' })
      .getByRole('link', { name: SCENARIO.title })
      .click();
    await expect(page).toHaveURL(`/scenarios/${SCENARIO.id}`);
    await expect(heading).toHaveText(SCENARIO.title);
    await expect(heading).toBeInViewport();
    expect(await scrollY()).toBe(0);
  });

  test('moves to the next step from the details and stays on the details', async ({ page }) => {
    await page.goto(`/scenarios/${SCENARIO.id}/steps/ready`);
    const inspector = page.getByRole('complementary', { name: '상세 정보' });
    const pager = inspector.getByRole('navigation', { name: '단계 이동' });
    await expect(pager.getByRole('link', { name: /^이전 단계: / })).toBeVisible();

    await pager.getByRole('link', { name: '다음 단계: (자동) 앱이 코드를 요청한다' }).click();
    await expect(page).toHaveURL(`/scenarios/${SCENARIO.id}/steps/request-code#devhub-inspector`);
    await expect(inspector).toBeFocused();
    await expect(inspector.getByRole('heading', { level: 2 })).toHaveText(
      '(자동) 앱이 코드를 요청한다',
    );
    await expect(pager).toBeInViewport();
  });

  test('walks the architecture by list order and by relation from the details', async ({
    page,
  }) => {
    await page.goto('/architecture/web');
    const inspector = page.getByRole('complementary', { name: '상세 정보' });
    const heading = inspector.getByRole('heading', { level: 2 });

    await inspector
      .getByRole('navigation', { name: '구성 요소 이동' })
      .getByRole('link', { name: /^다음 구성 요소/ })
      .click();
    await expect(page).toHaveURL('/architecture/mobile#devhub-inspector');
    await expect(inspector).toBeFocused();
    await expect(heading).toHaveText('mobile');
    await expect(heading).toBeInViewport();

    await inspector.getByRole('link', { name: /^mobile → auth-contracts/ }).click();
    await expect(page).toHaveURL('/architecture/auth-contracts#devhub-inspector');
    await expect(heading).toHaveText('auth-contracts');
    await expect(heading).toBeInViewport();
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

  test('does not scroll sideways, down to 320px', async ({ page }) => {
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      for (const path of ['/', `/scenarios/${SCENARIO.id}`, '/architecture']) {
        await page.goto(path);
        const overflows = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        );
        expect(overflows, `${width}px ${path}`).toBe(false);
      }
    }
  });

  test('keeps a one-row top bar in view, with the views in the explorer', async ({ page }) => {
    await page.goto(`/scenarios/${SCENARIO.id}`);
    const bar = page.getByRole('banner');
    await expect(page.getByRole('navigation', { name: '보기' })).toBeHidden();
    await expect(page.getByRole('combobox', { name: '저장소 검색' })).toBeHidden();
    expect((await bar.boundingBox())?.height).toBeLessThan(64);

    await page.mouse.wheel(0, 1500);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect((await bar.boundingBox())?.y).toBe(0);
    await expect(page.getByRole('button', { name: '탐색기', exact: true })).toBeInViewport();
  });

  test('opens the search as a second row from its button or the shortcut', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByRole('button', { name: '검색', exact: true });
    const search = page.getByRole('combobox', { name: '저장소 검색' });

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(search).toBeFocused();
    await toggle.click();
    await expect(search).toBeHidden();

    await page.keyboard.press('ControlOrMeta+k');
    await expect(search).toBeFocused();
    await page.keyboard.type(SCENARIO.title);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`/scenarios/${SCENARIO.id}`);
    await expect(search).toBeHidden();
  });
});
