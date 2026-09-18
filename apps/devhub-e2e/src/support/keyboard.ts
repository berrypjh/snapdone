import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Presses Tab until `target` has focus, failing after `limit` presses. Proves the target is
 * reachable by keyboard in document order, which `locator.focus()` would not.
 */
export async function tabTo(page: Page, target: Locator, limit = 40) {
  for (let press = 0; press < limit; press += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  await expect(target, `not reached within ${limit} Tab presses`).toBeFocused();
}

/** The scenario used across the suite: several runtimes, APIs, and tests per step. */
export const SCENARIO = {
  id: 'webview-auth-handoff',
  title: 'WebView 로그인 핸드오프',
  steps: 6,
};
