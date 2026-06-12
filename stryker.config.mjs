/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */

/*
 * Default behavioral targets: exact source files with WI-20 worker evidence and
 * survivor triage in docs/reports/mutation/2026-06-12-wi-20-record-kernel.md.
 * Keep this list aligned with that report; use STRYKER_SWEEP=1 for broader
 * investigation before promoting a new file into the default quality gate.
 */
const DEFAULT_BEHAVIORAL_TARGETS = [
  'src/core/id.ts',
  'src/core/lifecycle.ts',
  'src/core/prime-selector.ts',
  'src/core/record-type.ts',
  'src/core/tags.ts',
  'src/core/validation.ts',
  'src/core/vocabulary.ts',
  'src/core/vocabulary-validation.ts',
  'src/export/export-document.ts',
  'src/export/export-service.ts',
  'src/export/gno-exporter.ts',
  'src/export/json-exporter.ts',
  'src/record-types/tech-debt.ts',
  'src/store/duplicate-repair-service.ts',
  'src/store/file-system.ts',
  'src/store/id-allocator.ts',
  'src/store/markdown-record-store.ts',
];

/*
 * Always excluded: type-only contracts, test files, command shells, importers,
 * presenters, retrieval adapters, package metadata, and build-time utilities.
 * WI-20 targets the record kernel, so CLI/package/adoption surfaces stay out of
 * both the default gate and the full mutation sweep.
 */
const UNIVERSAL_MUTATION_EXCLUSIONS = [
  '!src/bin.ts',
  '!src/commands/**/*.ts',
  '!src/config/**/*.ts',
  '!src/importers/**/*.ts',
  '!src/presenters/**/*.ts',
  '!src/retrieval/**/*.ts',
  '!src/version.ts',
  '!src/**/*.test.ts',
  '!src/**/index.ts',
  '!src/core/record-type-types.ts',
  '!src/core/vocabulary-types.ts',
  '!src/store/id-allocator-types.ts',
  '!src/record-types/tech-debt-types.ts',
];

/*
 * Mutate target resolution (precedence order):
 *   STRYKER_MUTATE=<path>  → single-file worker loop
 *   STRYKER_SWEEP=1        → full kernel sweep including untriaged files
 *   (default)              → behavioral gate over worker-vetted kernel files
 *
 * The default is the local quality gate. STRYKER_SWEEP is for investigation and
 * report evidence only. Mutation testing is intentionally not wired into check.
 */
const KERNEL_MUTATION_GLOBS = [
  'src/core/**/*.ts',
  'src/store/**/*.ts',
  'src/record-types/**/*.ts',
  'src/export/**/*.ts',
];

const resolveMutate = () => {
  if ('STRYKER_MUTATE' in process.env && process.env.STRYKER_MUTATE !== '') {
    return [process.env.STRYKER_MUTATE];
  }
  if (process.env.STRYKER_SWEEP === '1') {
    return [...KERNEL_MUTATION_GLOBS, ...UNIVERSAL_MUTATION_EXCLUSIONS];
  }
  return DEFAULT_BEHAVIORAL_TARGETS;
};

const mutate = resolveMutate();

const config = {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  mutate,

  coverageAnalysis: 'perTest',
  checkers: [],
  concurrency: 2,

  thresholds: {
    high: 80,
    low: 70,
    /*
     * Null means Stryker never fails on score. The agent-run workflow decides
     * whether survivors are killable, equivalent, or acceptable as trivial.
     */
    break: null,
  },

  reporters: ['clear-text', 'html', 'json'],
  htmlReporter: {
    fileName: 'reports/mutation/index.html',
  },
  jsonReporter: {
    fileName: 'reports/mutation/report.json',
  },
};

export default config;
