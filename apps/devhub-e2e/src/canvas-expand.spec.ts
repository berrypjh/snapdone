import { expect, test } from '@playwright/test';

import { enterMain, SCENARIO, tabTo } from './support/keyboard';

const flowName = `${SCENARIO.title} 흐름 그림`;

test.describe('크게 보기', () => {
  test('opens the canvas at the window size and closes back to the button', async ({ page }) => {
    await page.goto(`/scenarios/${SCENARIO.id}`);
    const inPage = await page.getByRole('group', { name: flowName }).boundingBox();
    const expand = page.getByRole('button', { name: '크게 보기' });

    await enterMain(page);
    await tabTo(page, expand);
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: `${flowName} — 크게 보기` });
    await expect(dialog).toBeVisible();
    const enlarged = await dialog.getByRole('group', { name: flowName }).boundingBox();
    expect(enlarged?.height ?? 0).toBeGreaterThan(inPage?.height ?? Infinity);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(expand).toBeFocused();

    await page.keyboard.press('Enter');
    await dialog.getByRole('button', { name: '닫기' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('selects a step inside the enlarged canvas and stays open', async ({ page }) => {
    await page.goto(`/scenarios/${SCENARIO.id}`);
    await page.getByRole('button', { name: '크게 보기' }).click();
    const dialog = page.getByRole('dialog', { name: `${flowName} — 크게 보기` });

    await dialog.getByRole('group', { name: flowName }).getByRole('link').nth(1).click();
    await expect(page).toHaveURL(new RegExp(`/scenarios/${SCENARIO.id}/steps/`));
    await expect(dialog).toBeVisible();
  });
});

test.describe('site width', () => {
  test.use({ viewport: { width: 2560, height: 1440 } });

  test('stops at 115rem and sits in the middle of a very wide screen', async ({ page }) => {
    await page.goto('/');
    const { left, width, right } = await page.evaluate(() => {
      const shell = (document.querySelector('header') as HTMLElement).parentElement as HTMLElement;
      const box = shell.getBoundingClientRect();
      return { left: box.left, width: box.width, right: window.innerWidth - box.right };
    });
    expect(width).toBe(1840);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
  });
});
