// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Le moteur est pur : ni horloge, ni hasard, ni DOM, ni stockage. */
const IMPURE_GLOBALS = [
  'window',
  'document',
  'localStorage',
  'sessionStorage',
  'performance',
  'fetch',
].map((name) => ({
  name,
  message: 'Le moteur est pur : aucune dépendance au navigateur ou au temps.',
}));

export default defineConfig([
  globalIgnores(['**/dist/', '**/coverage/', '**/node_modules/', '.wrangler/']),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['packages/engine/src/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...IMPURE_GLOBALS],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Le moteur est déterministe.' },
        { object: 'Date', property: 'now', message: 'Le moteur ne lit pas l’horloge.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'Le moteur ne lit pas l’horloge.',
        },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest'], jsxA11y.flatConfigs.recommended],
    languageOptions: { globals: globals.browser },
  },
  {
    // Dans les tests, une assertion non nulle échoue bruyamment : c'est le comportement voulu.
    files: ['**/test/**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    files: ['tools/**/*.ts', 'scripts/**/*'],
    languageOptions: { globals: globals.node },
  },
]);
