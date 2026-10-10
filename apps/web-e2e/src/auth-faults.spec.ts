import { expect, test } from '@playwright/test';

import { answerGoogle, GOOGLE, linkTabKey, setFaults, startCalls } from './support/fixture';

/**
 * Faults are global in the fake API, so this file runs in its own serial `faults-*` projects
 * after every other project (playwright.config.mts).
 */
test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 390, height: 844 } });

test.afterEach(async ({ request }) => {
  await setFaults(request, {});
});

test('shows a failed start, keeps keyboard focus, and lets the user try again', async ({
  page,
  request,
  browserName,
}) => {
  await setFaults(request, { startStatus: 503 });
  await page.goto('/login');
  const button = page.getByRole('button', GOOGLE);

  await page.keyboard.press(linkTabKey(browserName));
  await expect(button).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    '지금은 로그인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  );
  await expect(button).toBeEnabled();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
});

test('starts one login for a double click and announces nothing while waiting', async ({
  page,
  request,
}) => {
  await setFaults(request, { startDelayMs: 1_500 });
  await answerGoogle(page, 'returning');
  await page.goto('/login');
  const button = page.getByRole('button', GOOGLE);

  await button.dblclick();

  await expect(button).toBeDisabled();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  expect(await startCalls(request)).toBe(1);
});
