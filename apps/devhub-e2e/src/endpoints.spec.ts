import { enterMain, tabTo } from './support/keyboard';
import { expect, test } from './support/test';

const ENDPOINT = { route: 'GET /v1/auth/session', handler: 'apps/api/internal/httpserver/auth.go' };

test.describe('API endpoints on the api application', () => {
  test('lists the routes and reaches a handler from the keyboard', async ({ page }) => {
    await page.goto('/applications/api');
    const list = page.getByRole('region', { name: /^API endpoint \d+개$/ });
    await expect(list).toBeVisible();
    await expect(list.getByRole('heading', { level: 3, name: ENDPOINT.route })).toBeVisible();

    await enterMain(page);
    const handler = list
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { level: 3, name: ENDPOINT.route }) })
      .getByRole('link', { name: 'handlers.session' });
    await tabTo(page, handler, 120);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`/source?path=${encodeURIComponent(ENDPOINT.handler)}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(ENDPOINT.handler);
  });
});
