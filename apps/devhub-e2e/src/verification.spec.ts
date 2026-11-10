import { expect, test } from './support/test';

const MOBILE_LOGIN = { id: 'mobile-google-login', title: '앱 Google 로그인' };

test.describe('implementation status and verification limits', () => {
  test('show the limits as text beside the status in the scenario list', async ({ page }) => {
    await page.goto('/scenarios');
    const row = page.getByRole('listitem').filter({
      has: page.getByRole('link', { name: MOBILE_LOGIN.title, exact: true }),
    });
    await expect(row).toContainText('구현됨');
    await expect(row).toContainText('미검증: 외부 연동 미검증 · 런타임 미검증 외 1');
  });

  test('explain each limit and how tests run in the scenario detail', async ({ page }) => {
    await page.goto(`/scenarios/${MOBILE_LOGIN.id}`);
    const section = page.getByRole('region', { name: '검증 범위' });
    await expect(section).toBeVisible();
    await expect(section).toContainText('통과했다는 결과가 아니다');
    await expect(section).toContainText('실제 Google 계정으로 인수하지 않음');
    await expect(section.getByRole('link', { name: '실행 방법' }).first()).toHaveAttribute(
      'href',
      /^\/documents\/quality-gates#/,
    );
  });
});
