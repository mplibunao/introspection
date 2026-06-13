import { access, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { assert, describe, it } from '@effect/vitest';

import { runCli } from '../../src/commands/index.js';
import {
  errorCodeFromStdout,
  now,
  seedRecords,
  term,
  withTempRepo,
} from '../fixtures/cli-repo-fixture.js';

const exportFixtureOptions = {
  tmpDirPrefix: 'introspection-export-flags-',
  vocabularyTerms: [term('topic/export')],
};

const run = async (
  cwd: string,
  args: ReadonlyArray<string>,
): Promise<Awaited<ReturnType<typeof runCli>>> => runCli({ args, cwd, now: () => now });

const pathExists = async (candidatePath: string): Promise<boolean> => {
  try {
    await access(candidatePath);

    return true;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
};

const assertExportArtifactsExist = async (destination: string): Promise<void> => {
  assert.strictEqual(await pathExists(path.join(destination, 'manifest.json')), true);
  assert.strictEqual(await pathExists(path.join(destination, 'records.json')), true);
};

describe('export flag gate', () => {
  it('rejects unknown flags instead of silently using defaults', async () => {
    await withTempRepo(exportFixtureOptions, async (root) => {
      await seedRecords(root);

      const result = await run(root, ['export', '--frmat', 'json', '--json']);

      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(errorCodeFromStdout(result.stdout), 'cli.argument.invalid');
      assert.match(result.stdout, /--frmat/u);
    });
  });

  it('uses --root to discover the repo from a non-repo invocation cwd', async () => {
    await withTempRepo(exportFixtureOptions, async (root) => {
      const cwd = await mkdtemp(path.join(os.tmpdir(), 'introspection-export-nonrepo-cwd-'));

      try {
        await seedRecords(root);

        const result = await run(cwd, ['export', '--root', root, '--json']);

        assert.strictEqual(result.exitCode, 0);
      } finally {
        await rm(cwd, { force: true, recursive: true });
      }
    });
  });

  it('resolves relative --dest against the invocation cwd without --root', async () => {
    await withTempRepo(exportFixtureOptions, async (root) => {
      await seedRecords(root);

      const result = await run(root, ['export', '--format', 'json', '--dest', 'sub/out', '--json']);

      assert.strictEqual(result.exitCode, 0);
      await assertExportArtifactsExist(path.join(root, 'sub/out'));
    });
  });

  it('keeps relative --dest anchored to invocation cwd when --root points elsewhere', async () => {
    await withTempRepo(exportFixtureOptions, async (invocationRoot) => {
      await seedRecords(invocationRoot);
      await withTempRepo(exportFixtureOptions, async (discoveryRoot) => {
        await seedRecords(discoveryRoot);

        const result = await run(invocationRoot, [
          'export',
          '--root',
          discoveryRoot,
          '--format',
          'json',
          '--dest',
          'sub/out',
          '--json',
        ]);

        assert.strictEqual(result.exitCode, 0);
        await assertExportArtifactsExist(path.join(invocationRoot, 'sub/out'));
        assert.strictEqual(await pathExists(path.join(discoveryRoot, 'sub/out')), false);
      });
    });
  });
});

describe('export valued flag validation', () => {
  it('still rejects valued flags without values', async () => {
    await withTempRepo(exportFixtureOptions, async (root) => {
      await seedRecords(root);

      const result = await run(root, ['export', '--format', '--json']);

      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(errorCodeFromStdout(result.stdout), 'cli.argument.invalid');
      assert.match(result.stdout, /--format requires a value/u);
    });
  });

  it('still rejects --dest without a value', async () => {
    await withTempRepo(exportFixtureOptions, async (root) => {
      await seedRecords(root);

      const result = await run(root, ['export', '--dest', '--json']);

      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(errorCodeFromStdout(result.stdout), 'cli.argument.invalid');
      assert.match(result.stdout, /--dest requires a value/u);
    });
  });
});
