/**
 * Developer-only connectivity check against the Go API.
 *
 * This is not a product feature and it is never rendered in the app. It exists
 * so a developer can answer "can this machine reach the API at the configured
 * address?" without opening a browser.
 *
 * It deliberately calls the web app's own `fetchHealth`, so the URL resolution,
 * the status check and the response shape guard that ship in the app are the
 * ones being exercised here. Node strips the TypeScript types on import, which
 * is why the npm script disables MODULE_TYPELESS_PACKAGE_JSON: apps/web cannot
 * declare "type": "module" while next.config.js is CommonJS.
 *
 *   pnpm health
 *   pnpm health http://192.168.0.10:8080     # address a phone would use
 *   API_BASE_URL=http://localhost:9000 pnpm health
 */

const DEV_DEFAULT = 'http://localhost:8080';

const override = process.argv[2];

if (override) {
  process.env.API_BASE_URL = override;
}

const source = override
  ? 'argument'
  : process.env.API_BASE_URL
    ? 'API_BASE_URL'
    : 'development default';

process.env.API_BASE_URL ??= DEV_DEFAULT;

const { fetchHealth, getApiBaseUrl } =
  await import('../../apps/web/src/lib/api.ts');

console.log(`checking ${getApiBaseUrl()}/health (${source})`);

try {
  const health = await fetchHealth();

  if (health.status !== 'ok') {
    console.error(
      `실패: status가 "ok"가 아닙니다. 응답: ${JSON.stringify(health)}`,
    );
    process.exit(1);
  }

  console.log(`ok: ${JSON.stringify(health)}`);
} catch (error) {
  console.error(
    `실패: ${error instanceof Error ? error.message : String(error)}`,
  );
  console.error('API 서버가 떠 있는지 확인하세요: pnpm dev:api');
  process.exit(1);
}
