import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assert } from '@effect/vitest';

import type { CliRunResult } from '../../src/commands/types.js';

/*
 * Golden-master harness for the pre-cutover CLI. IX-SR-01 pins the current
 * plain-TypeScript command output so every later Effect cutover item (IX-SR-02
 * onward) is measured against captured bytes, not re-derived expectations. The
 * golden files are the source of truth; this helper only normalizes the one
 * volatile dimension (the per-run temp repo root) and diffs against them.
 *
 * Regenerate after an intended output change with `UPDATE_GOLDEN=1 pnpm test`,
 * then review the diff before committing.
 */

const goldenDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'golden');
const updateGolden = process.env['UPDATE_GOLDEN'] === '1';
const repoRootPlaceholder = '<REPO_ROOT>';

/*
 * The temp repo root (and its realpath form on platforms where $TMPDIR is a
 * symlink, e.g. macOS /var -> /private/var) is the only machine-dependent
 * substring in CLI JSON output; timestamps are pinned by the injected `now`.
 * Returning both forms, longest first, keeps replacement total and prefix-safe.
 */
const rootsForReplacement = async (root: string): Promise<ReadonlyArray<string>> => {
  const resolvedRoot = path.resolve(root);
  const realRoot = await realpath(resolvedRoot);
  const unique = [...new Set([resolvedRoot, realRoot])].filter((value) => value.length > 0);

  return unique.sort((left, right) => right.length - left.length);
};

const replaceRoots = (value: string, roots: ReadonlyArray<string>): string =>
  roots.reduce((current, root) => current.split(root).join(repoRootPlaceholder), value);

const normalizeValue = (value: unknown, roots: ReadonlyArray<string>): unknown => {
  if (typeof value === 'string') {
    return replaceRoots(value, roots);
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item, roots));
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeValue(item, roots)]),
    );
  }

  return value;
};

const stableJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

interface AssertGoldenOptions {
  /** Name of the golden file under test/fixtures/golden/ (without extension). */
  readonly name: string;
  /** Full CLI run result. The harness pins stdout AND stderr. */
  readonly result: CliRunResult;
  /** Temp repo root to normalize out of the captured output. */
  readonly root: string;
}

/*
 * Pin the full command output, then compare stdout against the committed golden.
 *
 * stderr is asserted empty here so the check cannot be forgotten per call site:
 * every --json command path in this suite writes its payload (success or error)
 * to stdout, so a later CLI that leaks warnings, logs, or diagnostics to stderr
 * must fail even when stdout stays byte-identical.
 *
 * stdout is parsed before diffing so a malformed JSON payload fails loudly here
 * instead of silently diffing as text.
 */
const assertGoldenJson = async ({ name, result, root }: AssertGoldenOptions): Promise<void> => {
  assert.strictEqual(
    result.stderr,
    '',
    `${name}: command wrote to stderr, but goldens pin stdout only. A --json command must keep stderr empty.`,
  );
  const parsed: unknown = JSON.parse(result.stdout);
  const roots = await rootsForReplacement(root);
  const actual = stableJson(normalizeValue(parsed, roots));
  const goldenPath = path.join(goldenDirectory, `${name}.json`);

  if (updateGolden) {
    await mkdir(goldenDirectory, { recursive: true });
    await writeFile(goldenPath, actual, 'utf8');

    return;
  }

  const expected = await readFile(goldenPath, 'utf8').catch(() => null);

  if (expected === null) {
    assert.fail(
      `Missing golden file ${name}.json. Run \`UPDATE_GOLDEN=1 pnpm test\` to create it, then review the diff.`,
    );

    return;
  }

  assert.strictEqual(
    actual,
    expected,
    `Golden mismatch for ${name}. If this output change is intended, run \`UPDATE_GOLDEN=1 pnpm test\` and review the diff.`,
  );
};

export { assertGoldenJson, normalizeValue, repoRootPlaceholder };
