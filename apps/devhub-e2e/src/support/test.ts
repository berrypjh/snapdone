import { expect, type Page, test as base } from '@playwright/test';

/**
 * Waits until React has hydrated the page: `HydrationMarker` sets `<html data-hydrated>`.
 * Server HTML looks the same before hydration, but its buttons and inputs do nothing yet.
 */
const waitForApp = (page: Page) =>
  expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');

/**
 * The suite's `test`: every document load a test starts (`goto` · `reload` · `waitForURL`) also waits
 * for hydration, so no test clicks or types into a page React has not attached to.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page);
    const reload = page.reload.bind(page);
    const waitForURL = page.waitForURL.bind(page);
    page.goto = async (...args) => {
      const response = await goto(...args);
      await waitForApp(page);
      return response;
    };
    page.reload = async (...args) => {
      const response = await reload(...args);
      await waitForApp(page);
      return response;
    };
    page.waitForURL = async (...args) => {
      await waitForURL(...args);
      await waitForApp(page);
    };
    await use(page);
  },
});

export { expect };
