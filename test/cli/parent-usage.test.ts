import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { assert, describe, it } from '@effect/vitest';

import { runCli } from '../../src/commands/index.js';

/*
 * Regression guards for parent invocations. P2.2: `records`/`record`/`ids`/
 * `vocab` with no subcommand return the stable cli.usage envelope. The follow-up
 * P2 taxonomy fix: a known parent with an unrecognized child (`records bogus`)
 * also maps to cli.usage, not Effect's UnknownSubcommand (cli.argument.invalid).
 * Both paths run before any repo load, so an empty cwd is sufficient.
 */

const now = (): Date => new Date('2026-06-12T00:00:00Z');

const errorCode = (stdout: string): string =>
  (JSON.parse(stdout) as { error: { code: string } }).error.code;

const parents = ['records', 'record', 'ids', 'vocab'];

describe('parent commands without a subcommand', () => {
  it('returns a stable cli.usage failure for each parent', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'introspection-parent-usage-'));

    try {
      for (const parent of parents) {
        const result = await runCli({ args: [parent, '--json'], cwd, now });

        assert.strictEqual(result.exitCode, 1, `${parent} should exit 1`);
        assert.strictEqual(errorCode(result.stdout), 'cli.usage', `${parent} should be cli.usage`);
      }
    } finally {
      await rm(cwd, { force: true, recursive: true });
    }
  });

  it('returns a stable cli.usage failure for a known parent with an unknown child', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'introspection-parent-bogus-'));

    try {
      for (const parent of parents) {
        const cases = [
          { args: [parent, 'bogus', '--json'], label: `${parent} bogus` },
          { args: [parent, '--bogus', '--json'], label: `${parent} --bogus` },
        ];

        for (const testCase of cases) {
          const result = await runCli({ args: testCase.args, cwd, now });

          assert.strictEqual(result.exitCode, 1, `${testCase.label} should exit 1`);
          assert.strictEqual(
            errorCode(result.stdout),
            'cli.usage',
            `${testCase.label} should be cli.usage`,
          );
        }
      }
    } finally {
      await rm(cwd, { force: true, recursive: true });
    }
  });
});
