import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';

/**
 * DevHub runs on its own port so it never collides with `web-e2e` (3000). The DevHub has no API
 * or auth, so the suite needs nothing but its dev server.
 */
const baseURL = 'http://localhost:3100';

/**
 * See https://playwright.dev/docs/test-configuration.
 *
 * This is a .mts file so Node forces ESM regardless of the workspace `type`.
 * Chromium only: the DevHub is an internal desktop tool, and these tests check keyboard paths
 * whose Tab rules differ in WebKit on macOS (links are skipped without Option).
 */
export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './src' }),
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm exec next dev --port 3100',
    url: baseURL,
    cwd: `${workspaceRoot}/apps/devhub`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
});
