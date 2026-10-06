import { expect, type Page, test } from '@playwright/test';

import { enterMain, SCENARIO, tabTo } from './support/keyboard';

const READY = { id: 'ready', intent: '(자동) web이 앱에 challenge 알림' };
const LAST = { id: 'open-page', order: 6, intent: '요청했던 화면을 로그인된 상태로 보기' };

const flow = (page: Page) => page.getByRole('group', { name: `${SCENARIO.title} 흐름 그림` });
const inspector = (page: Page) => page.getByRole('complementary', { name: '상세 정보' });

test.describe('scenario flow', () => {
  test('selects a step, reads it in the inspector, and reaches its source link', async ({
    page,
  }) => {
    await page.goto(`/scenarios/${SCENARIO.id}`);
    await enterMain(page);

    const step = flow(page).getByRole('link', { name: READY.intent });
    await tabTo(page, step);
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(`/scenarios/${SCENARIO.id}/steps/${READY.id}`);
    await expect(step).toHaveAttribute('aria-current', 'page');
    await expect(step).toBeFocused();
    await expect(page.getByText(`선택: 2. ${READY.intent}`)).toBeVisible();
    await expect(inspector(page).getByRole('heading', { level: 2 })).toHaveText(READY.intent);

    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: '이 단계의 상세 정보로 이동' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(inspector(page)).toBeFocused();

    const source = inspector(page)
      .getByRole('region', { name: /^소스/ })
      .getByRole('link', { name: /에서 보기/ })
      .first();
    await tabTo(page, source);
    await expect(source).toHaveAttribute('href', /^https:\/\//);
    await expect(source).toHaveAttribute('target', '_blank');
  });

  test('opens a step from its URL with the node selected and in view', async ({ page }) => {
    await page.goto(`/scenarios/${SCENARIO.id}/steps/${LAST.id}`);

    const selected = flow(page).locator('a[aria-current="page"]');
    await expect(selected).toHaveCount(1);
    await expect(selected).toContainText(LAST.intent);
    await expect(selected).toBeInViewport();
    await expect(page.getByText(`선택: ${LAST.order}. ${LAST.intent}`)).toBeVisible();
    await expect(page).toHaveTitle(new RegExp(LAST.intent.replace(/[()]/g, '\\$&')));
    await expect(inspector(page).getByRole('heading', { level: 2 })).toHaveText(LAST.intent);
  });

  test('names the zoom controls and reports the zoom level', async ({ page }) => {
    await page.goto(`/scenarios/${SCENARIO.id}`);
    await enterMain(page);

    const controls = page.getByRole('group', { name: '보기 조절' });
    for (const name of ['축소', '확대', '화면에 맞추기']) {
      await expect(controls.getByRole('button', { name, exact: true })).toBeVisible();
    }
    const level = controls.getByRole('status');
    const fitted = await level.textContent();

    await tabTo(page, controls.getByRole('button', { name: '확대', exact: true }));
    await page.keyboard.press('Enter');
    await expect(level).not.toHaveText(fitted ?? '');

    await tabTo(page, controls.getByRole('button', { name: '화면에 맞추기' }));
    await page.keyboard.press('Enter');
    await expect(level).toHaveText(fitted ?? '');
  });
});

test.describe('structured list', () => {
  test('shows the scenario as step summaries, with the evidence in the inspector', async ({
    page,
  }) => {
    await page.goto(`/scenarios/${SCENARIO.id}`);
    await enterMain(page);

    const asList = page.getByRole('button', { name: '목록', exact: true });
    await tabTo(page, asList);
    await expect(asList).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Enter');
    await expect(asList).toHaveAttribute('aria-pressed', 'true');
    await expect(flow(page)).toHaveCount(0);

    const steps = page.getByRole('list', { name: `${SCENARIO.title} 단계` }).getByRole('article');
    await expect(steps).toHaveCount(SCENARIO.steps);
    const exchange = steps.nth(4);
    await expect(exchange).toContainText(/담당 [^ ]+ · API \d+ · .*테스트 \d+/);
    await expect(exchange.getByRole('term')).toHaveCount(0);
    await expect(exchange.getByRole('link')).toHaveCount(1);

    const title = exchange.getByRole('heading', { level: 3 }).getByRole('link');
    await tabTo(page, title);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/steps\/exchange$/);
    await expect(asList).toHaveAttribute('aria-pressed', 'true');
    await expect(inspector(page).getByRole('heading', { level: 2 })).toHaveText(/세션으로 교환/);
    await expect(title).toHaveAttribute('aria-current', 'page');
    await expect(exchange).toContainText('· 선택됨');
    await expect(inspector(page).getByRole('region', { name: /^소스/ })).toBeVisible();
  });

  test('shows the architecture as a list with the kind filter applied', async ({ page }) => {
    await page.goto('/architecture?kind=library');
    await enterMain(page);

    await tabTo(page, page.getByRole('button', { name: '목록', exact: true }));
    await page.keyboard.press('Enter');

    const nodes = page.getByRole('list', { name: '구성 요소' }).getByRole('article');
    // The four libraries: auth-contracts, onboarding, processing, webview-bridge.
    await expect(nodes).toHaveCount(4);
    const link = nodes.first().getByRole('heading').getByRole('link');
    await expect(link).toHaveAttribute('href', /\?kind=library$/);

    await tabTo(page, link);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/architecture\/[^/?]+\?kind=library$/);
    await expect(link).toHaveAttribute('aria-current', 'page');
  });
});

test.describe('architecture map', () => {
  test('selects a node with the keyboard and shows it in the inspector', async ({ page }) => {
    await page.goto('/architecture');
    await enterMain(page);

    const map = page.getByRole('group', { name: '현재 아키텍처 그림' });
    const api = map.locator('a[href="/architecture/api"]');
    await tabTo(page, api);
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL('/architecture/api');
    await expect(api).toHaveAttribute('aria-current', 'page');
    await expect(api).toBeInViewport();
    await expect(inspector(page).getByRole('heading', { level: 2 })).toHaveText('api');
  });
});
