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
  /* Run the dev server unless an external server was given */
  webServer: externalBaseURL
    ? undefined
    : {
        command: 'pnpm exec nx dev web',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        cwd: workspaceRoot,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
