import base from '@berrypjh/eslint-config/base';
import nxBoundaries from '@berrypjh/eslint-config/nx';

const PLATFORM_PACKAGES = [
  'react',
  'react-dom',
  'react-native',
  'react-native-*',
  'next',
  'next/*',
  'expo',
  'expo-*',
  '@expo/*',
  '@react-navigation/*',
  '@berrypjh/react-ui',
  '@berrypjh/react-native-ui',
];

export default [
  ...base,
  ...nxBoundaries,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            { sourceTag: 'type:app', onlyDependOnLibsWithTags: ['type:lib'] },
            { sourceTag: 'type:e2e', onlyDependOnLibsWithTags: ['type:lib'] },
            {
              sourceTag: 'type:lib',
              onlyDependOnLibsWithTags: ['type:lib'],
              bannedExternalImports: PLATFORM_PACKAGES,
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ['**/dist', '**/out-tsc', '**/vitest.config.*.timestamp*'],
  },
];
