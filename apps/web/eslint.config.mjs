import nextEslintPluginNext from '@next/eslint-plugin-next';
import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

export default [
  // The generator registered the plugin without enabling any rule, so none of
  // Next's checks were running. `core-web-vitals` registers the plugin and
  // turns its 22 rules on.
  nextEslintPluginNext.configs['core-web-vitals'],
  ...nx.configs['flat/react-typescript'],
  ...baseConfig,
  {
    ignores: ['.next/**/*', '**/out-tsc'],
  },
];
