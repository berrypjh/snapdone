import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';

/**
 * `BASE_URL` selects external-server mode: the suite tests a server that is already
 * running (for example `nx start web`) and does not launch `nx dev web` itself.
 * Only loopback hosts are accepted so the suite never runs against a public site.
 */
const externalBaseURL = process.env['BASE_URL'];
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

if (externalBaseURL && !LOOPBACK_HOSTS.has(new URL(externalBaseURL).hostname)) {
  throw new Error(`BASE_URL must point to a local server, got ${externalBaseURL}`);
}

const baseURL = externalBaseURL ?? 'http://localhost:3000';
const webOrigin = new URL(baseURL).origin;
const FAKE_API_PORT = 4010;

/** Test-only Go auth API stand-in (src/support/fake-api.mts). */
const fakeApi = {
  command: 'node src/support/fake-api.mts',
  url: `http://127.0.0.1:${FAKE_API_PORT}/__fixture/health`,
  cwd: import.meta.dirname,
  reuseExistingServer: false,
  env: { FAKE_API_PORT: String(FAKE_API_PORT), WEB_ORIGIN: webOrigin },
};

const webDev = {
  command: 'pnpm exec next dev --port 3000',
  url: baseURL,
  cwd: `${workspaceRoot}/apps/web`,
  reuseExistingServer: false,
  timeout: 120_000,
  env: { API_BASE_URL: `http://127.0.0.1:${FAKE_API_PORT}`, WEB_ORIGIN: webOrigin },
};

/** auth-faults.spec.ts flips global fake API switches, so it runs alone after the other projects. */
const FAULTS = /auth-faults\.spec\.ts/;
const BROWSERS = [
  ['chromium', devices['Desktop Chrome']],
  ['firefox', devices['Desktop Firefox']],
  ['webkit', devices['Desktop Safari']],
] as const;

/**
 * See https://playwright.dev/docs/test-configuration.
 *
 * This is a .mts file so Node forces ESM regardless of the workspace `type`.
 * Playwright routes .mts through its ESM loader and Nx's native TS strip loads
 * it directly.
 */
export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './src' }),
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  /*
   * The fake auth API always runs. Without BASE_URL, `next dev` is started wired to it; it is not
   * reused, because a dev server already on :3000 would talk to the real Go API instead.
   * With BASE_URL, start that server with API_BASE_URL=http://127.0.0.1:4010 yourself.
   * Both ports are fixed, so the per-file `e2e-ci--*` targets cannot run side by side.
   */
  webServer: externalBaseURL ? [fakeApi] : [fakeApi, webDev],
  projects: [
    ...BROWSERS.map(([name, use]) => ({ name, use, testIgnore: FAULTS })),
    ...BROWSERS.map(([name, use], index) => ({
      name: `faults-${name}`,
      use,
      testMatch: FAULTS,
      dependencies:
        index === 0 ? BROWSERS.map(([browser]) => browser) : [`faults-${BROWSERS[index - 1][0]}`],
    })),
  ],
});
