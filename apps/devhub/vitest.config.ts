import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Next keeps JSX as-is (`jsx: preserve`); tests that render a component need it compiled.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
