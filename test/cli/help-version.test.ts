import { assert, describe, it } from '@effect/vitest';

import { helpText } from '../../src/cli/app.js';
import { runCli } from '../../src/commands/index.js';
import { packageVersion } from '../../src/version.js';

/*
 * Regression guard for top-level help/version consistency (P1.3). No-arg already
 * emitted the custom helpText; --help/-h previously fell through to Effect's
 * built-in renderer (different format, plus the parse-failure pollution path).
 * The boundary now answers all three identically, and --version stays stable.
 */

const now = (): Date => new Date('2026-06-12T00:00:00Z');
const cwd = process.cwd();

describe('top-level help and version', () => {
  it('emits the same custom help text for no-arg, --help, and -h', async () => {
    const noArg = await runCli({ args: [], cwd, now });
    const longHelp = await runCli({ args: ['--help'], cwd, now });
    const shortHelp = await runCli({ args: ['-h'], cwd, now });

    for (const result of [noArg, longHelp, shortHelp]) {
      assert.strictEqual(result.exitCode, 0);
      assert.strictEqual(result.stderr, '');
      assert.strictEqual(result.stdout, helpText);
    }
  });

  it('answers --help even when the global --json flag is present', async () => {
    const result = await runCli({ args: ['--json', '--help'], cwd, now });

    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.stderr, '');
    assert.strictEqual(result.stdout, helpText);
  });

  it('prints a stable version string for --version', async () => {
    const result = await runCli({ args: ['--version'], cwd, now });

    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.stderr, '');
    assert.strictEqual(result.stdout, packageVersion);
  });
});
