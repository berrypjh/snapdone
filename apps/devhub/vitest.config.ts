import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Next keeps JSX as-is (`jsx: preserve`); tests that render a component need it compiled.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // Temporary: @berrypjh/devhub-ui 1.2.0 ships `"type": "module"` with extensionless relative imports,
    // which Node ESM cannot load. Remove once a release emits fully specified imports.
    server: { deps: { inline: ['@berrypjh/devhub-ui'] } },
  },
});
