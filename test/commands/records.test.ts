import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { assert, describe, it } from '@effect/vitest';

import { runCli } from '../../src/commands/index.js';
import {
  errorCodeFromStdout,
  now,
  parseJsonStdout,
  run,
  seedRecords,
  term,
  withTempRepo,
} from '../fixtures/cli-repo-fixture.js';

const recordsRepoOptions = {
  tmpDirPrefix: 'introspection-records-cli-',
  vocabularyTerms: [term('owner/mp'), term('topic/records')],
} as const;

describe('records list CLI command', () => {
  it('renders bounded human output with omitted counts and active records by default', async () => {
    await withTempRepo(recordsRepoOptions, async (root) => {
      await seedRecords(root);
      const result = await run(root, ['records', 'list']);

      assert.strictEqual(result.exitCode, 0);
      assert.match(result.stdout, /Records for BP\/backpressure/u);
      assert.match(result.stdout, /showing 1 of 2 matching record\(s\); omitted 1; limit 1/u);
      assert.match(result.stdout, /BP-TD-001/u);
      assert.ok(!/BP-TD-003/u.test(result.stdout));
      assert.strictEqual(result.stderr, '');
    });
  });

  it('rejects valueless value-required flags while allowing valueless booleans', async () => {
    const valuelessCases = ['limit', 'type', 'status', 'tag', 'path'];

    await withTempRepo(recordsRepoOptions, async (root) => {
      for (const flag of valuelessCases) {
        const result = await run(root, ['records', 'list', `--${flag}`, '--json']);

        assert.strictEqual(result.exitCode, 1);
        assert.strictEqual(errorCodeFromStdout(result.stdout), 'cli.argument.invalid');
      }

      const booleanResult = await run(root, [
        'records',
        'list',
        '--include-terminal',
        '--all',
        '--json',
      ]);

      assert.strictEqual(booleanResult.exitCode, 0);
      assert.doesNotThrow(() => parseJsonStdout(booleanResult.stdout));
    });
  });

  it('rejects unknown flags with a stable argument error', async () => {
    await withTempRepo(recordsRepoOptions, async (root) => {
      const result = await run(root, ['records', 'list', '--bogus', 'value', '--json']);

      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(errorCodeFromStdout(result.stdout), 'cli.argument.invalid');
    });
  });

  it('rejects boolean flags that are given an explicit value', async () => {
    /*
     * `--all true` is the false-green case: 'true' was the old valueless marker,
     * so without a non-supplyable sentinel it would be indistinguishable from a
     * bare `--all`. All of these must fail.
     */
    const explicitValueCases = [
      ['--all', 'nonsense'],
      ['--all', 'true'],
      ['--all', 'false'],
      ['--include-terminal', 'true'],
    ];

    await withTempRepo(recordsRepoOptions, async (root) => {
      for (const flagCase of explicitValueCases) {
        const result = await run(root, ['records', 'list', ...flagCase, '--json']);

        assert.strictEqual(result.exitCode, 1);
        assert.strictEqual(errorCodeFromStdout(result.stdout), 'cli.argument.invalid');
      }
    });
  });

  it('emits parseable JSON and reports hard-cap clamping', async () => {
    await withTempRepo(recordsRepoOptions, async (root) => {
      await seedRecords(root);
      const result = await run(root, ['records', 'list', '--all', '--limit', '10', '--json']);
      const payload = parseJsonStdout(result.stdout) as {
        list: {
          limit: { clamped: boolean; effectiveLimit: number; requestedLimit: number };
          omittedRecordCount: number;
          records: Array<{ id: string; status: string }>;
          totalMatchingRecordCount: number;
        };
      };

      assert.strictEqual(result.exitCode, 0);
      assert.strictEqual(payload.list.limit.clamped, true);
      assert.strictEqual(payload.list.limit.requestedLimit, 10);
      assert.strictEqual(payload.list.limit.effectiveLimit, 2);
      assert.strictEqual(payload.list.totalMatchingRecordCount, 3);
      assert.strictEqual(payload.list.omittedRecordCount, 1);
      assert.deepStrictEqual(
        payload.list.records.map((record) => record.id),
        ['BP-TD-003', 'BP-TD-001'],
      );
    });
  });

  it('allows explicit terminal status filtering without include-terminal', async () => {
    await withTempRepo(recordsRepoOptions, async (root) => {
      await seedRecords(root);
      const result = await run(root, ['records', 'list', '--status', 'done', '--json']);
      const payload = parseJsonStdout(result.stdout) as {
        list: { records: Array<{ id: string; status: string }> };
      };

      assert.strictEqual(result.exitCode, 0);
      assert.deepStrictEqual(
        payload.list.records.map((record) => ({ id: record.id, status: record.status })),
        [{ id: 'BP-TD-003', status: 'done' }],
      );
    });
  });

  it('discovers the repo through the --root override from an unrelated cwd', async () => {
    await withTempRepo(recordsRepoOptions, async (root) => {
      await seedRecords(root);
      const elsewhere = await mkdtemp(path.join(os.tmpdir(), 'introspection-records-elsewhere-'));

      try {
        const result = await runCli({
          args: ['records', 'list', '--root', root, '--json'],
          cwd: elsewhere,
          now: () => now,
        });
        const payload = parseJsonStdout(result.stdout) as {
          list: { records: Array<{ id: string }> };
        };

        assert.strictEqual(result.exitCode, 0);
        assert.deepStrictEqual(
          payload.list.records.map((record) => record.id),
          ['BP-TD-001'],
        );
      } finally {
        await rm(elsewhere, { force: true, recursive: true });
      }
    });
  });
});
