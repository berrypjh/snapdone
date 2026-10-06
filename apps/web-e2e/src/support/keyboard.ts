import { expect, type Page } from '@playwright/test';

import { linkTabKey } from './fixture';

/**
 * Skip link into <main>, the way a keyboard user starts on a page. Counting Tabs from there keeps
 * a test independent of the shell. WebKit on macOS reaches the link with Alt+Tab.
 */
export async function enterMain(page: Page, browserName: string) {
  await page.keyboard.press(linkTabKey(browserName));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
}
