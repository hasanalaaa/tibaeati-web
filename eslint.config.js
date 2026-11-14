import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Layer rules from ARCHITECTURE.md. Each layer lists what it must NOT import.
// Patterns match both the `@/layer` alias and relative paths that cross into a layer.
const layer = (name) => [`@/${name}`, `@/${name}/**`, `**/${name}/**`];
const ban = (message, ...patterns) => ({
  'no-restricted-imports': ['error', { patterns: patterns.map((group) => ({ group, message })) }],
});

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'dev-dist'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  jsxA11y.flatConfigs.strict,
  reactHooks.configs.flat['recommended-latest'],
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['eslint.config.js', 'vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['src/lib/**'],
    rules: ban(
      'lib imports nothing from the app.',
      layer('app'),
      layer('features'),
      layer('ui'),
      layer('services'),
      layer('domain'),
    ),
  },
  {
    files: ['src/domain/**'],
    rules: ban(
      'domain imports only lib and must run without DOM or I/O.',
      layer('app'),
      layer('features'),
      layer('ui'),
      layer('services'),
      ['react', 'react-dom', 'react/**', 'react-dom/**', 'wouter', 'wouter/**'],
    ),
  },
  {
    files: ['src/services/**'],
    rules: ban(
      'services import only domain and lib.',
      layer('app'),
      layer('features'),
      layer('ui'),
    ),
  },
  {
    files: ['src/ui/**'],
    rules: ban(
      'ui imports only lib.',
      layer('app'),
      layer('features'),
      layer('services'),
      layer('domain'),
    ),
  },
  {
    files: ['src/features/**'],
    rules: ban(
      'features import only ui, services, domain, lib (and @/app/i18n); never other features. Use relative paths inside a feature.',
      ['@/app/*', '!@/app/i18n', '../**/app/**'],
      layer('features'),
    ),
  },
);
