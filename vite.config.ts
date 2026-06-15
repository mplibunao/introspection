import { generalPreset } from '@mplibunao/oxlint-standards';
import { defineConfig } from 'vite-plus';

const toolIgnorePatterns = [
  '**/*.md',
  '.changeset/**',
  '.claude/**',
  '.introspection/.locks/**',
  '.introspection/generated/**',
  '.pnpm-store/**',
  'coverage/**',
  'dist/**',
  'node_modules/**',
  'prompt-exports/**',
  'styles/**',
  /*
   * Generated golden capture artifacts: byte-identical to stableJson() in
   * test/fixtures/golden.ts so the characterization harness can diff them. The
   * formatter must not reformat them, or assert.strictEqual(actual, expected)
   * would break against a hand-formatted copy.
   */
  'test/fixtures/golden/**',
];

export default defineConfig({
  fmt: {
    ignorePatterns: toolIgnorePatterns,
    semi: true,
    singleQuote: true,
    sortPackageJson: true,
  },
  lint: {
    categories: {
      correctness: 'error',
      nursery: 'off',
      pedantic: 'off',
      restriction: 'error',
      style: 'error',
      suspicious: 'error',
    },
    ignorePatterns: toolIgnorePatterns,
    jsPlugins: [...generalPreset.jsPlugins],
    options: {
      reportUnusedDisableDirectives: 'error',
      typeAware: true,
      typeCheck: true,
    },
    plugins: ['typescript', 'import', 'vitest'],
    overrides: [
      {
        // Structural size/complexity ceilings are meaningless for test files.
        // Tests are intentionally large and fixture-heavy to keep assertions co-located.
        // Exception: `max-depth` and `max-params` stay strict — they flag real structural problems in tests too.
        files: ['test/**', '**/*.test.ts'],
        rules: {
          'max-lines': 'off',
          'max-lines-per-function': 'off',
          'max-statements': 'off',
          'import/max-dependencies': 'off',
          'no-magic-numbers': 'off',
          '@typescript-eslint/no-unsafe-type-assertion': 'off',
        },
      },
    ],
    rules: {
      ...generalPreset.rules,
      '@typescript-eslint/array-type': ['error', { default: 'generic' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      complexity: ['error', 20],
      'import/max-dependencies': ['error', { max: 15 }],
      'import/no-default-export': 'off',
      'import/no-named-export': 'off',
      'import/no-nodejs-modules': 'off',

      'import/no-relative-parent-imports': 'off',
      'import/prefer-default-export': 'off',
      'jest/require-hook': 'off',
      'max-depth': ['error', 4],
      'max-lines': ['error', 500],
      'max-lines-per-function': ['error', 75],
      'max-params': ['error', 4],
      'no-console': 'error',
      'no-magic-numbers': ['error', { ignore: [0, 1, 4, 15, 20, 75, 500] }],
      'no-nested-ternary': 'error',
      'no-param-reassign': 'error',
      'no-unneeded-ternary': 'error',
      'sort-imports': 'off',
      'sort-keys': 'off',
      'vitest/no-importing-vitest-globals': 'off',
    },
  },
  staged: {
    '*.{js,ts,tsx,jsx,json}': 'vp check --fix',
    '*.{md,mdx}': 'pnpm prose',
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**'],
    include: ['test/**/*.test.ts'],
  },
});
