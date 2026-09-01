import base from '@berrypjh/eslint-config/base';
import nxBoundaries from '@berrypjh/eslint-config/nx';

export default [
  ...base,
  ...nxBoundaries,
  {
    ignores: ['**/dist', '**/out-tsc', '**/vitest.config.*.timestamp*'],
  },
];
