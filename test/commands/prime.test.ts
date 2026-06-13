import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { assert, describe, it } from '@effect/vitest';
import { vi } from 'vitest';

import { techDebtRecordType } from '../../src/record-types/tech-debt.js';
import {
  errorCodeFromStdout,
  parseJsonStdout,
  run,
  seedRecords,
  term,
  withTempRepo,
} from '../fixtures/cli-repo-fixture.js';

const primeRepoOptions = {
  tmpDirPrefix: 'introspection-prime-cli-',
  vocabularyTerms: [
    term('owner/mp'),
    term('topic/prime'),
    term('topic/provisional', 'provisional'),
    term('topic/rejected', 'rejected'),
  ],
  policyDocs: true,
} as const;

interface OrientationPayload {
  readonly orientation: {
    readonly repo: { key: string; slug: string; root: string; recordsRoot: string };
    readonly totalRecordCount: number;
    readonly unreadableRecordCount: number;
    readonly recordTypes: ReadonlyArray<{
      recordType: string;
      total: number;
      statuses: ReadonlyArray<{ status: string; kind: string; count: number }>;
    }>;
    readonly lifecycle: ReadonlyArray<{ kind: string; count: number }>;
    readonly vocabulary: ReadonlyArray<{ status: string; count: number }>;
    readonly policyDocs: ReadonlyArray<{
      name: string;
      relativePath: string;
      appliesTo: Array<string>;
    }>;
    readonly nextCommands: ReadonlyArray<string>;
  };
}

describe('prime orientation CLI command', () => {
  it('renders a deterministic human orientation packet', async () => {
    await withTempRepo(primeRepoOptions, async (root) => {
      await seedRecords(root);
      const result = await run(root, ['prime']);

      assert.strictEqual(result.exitCode, 0);
      assert.match(result.stdout, /Orientation for BP\/backpressure\./u);
      assert.match(result.stdout, /By type:/u);
      assert.match(result.stdout, /- tech-debt: 3 \(done\[terminal\] 1; open\[active\] 2\)/u);
      assert.match(result.stdout, /By lifecycle: active 2; terminal 1\./u);
      assert.match(result.stdout, /Vocabulary: approved 2; provisional 1; rejected 1\./u);
      assert.match(result.stdout, /Policy docs:/u);
      assert.match(
        result.stdout,
        /- Contributing \(docs\/policy\/contributing\.md; applies to: tech-debt\)/u,
      );
      assert.match(result.stdout, /Next:/u);
      assert.match(result.stdout, /introspection records list/u);
      assert.strictEqual(result.stderr, '');
    });
  });

  it('emits a machine-readable orientation payload derived from frontmatter', async () => {
    await withTempRepo(primeRepoOptions, async (root) => {
      await seedRecords(root);
      const result = await run(root, ['prime', '--json']);
      const payload = parseJsonStdout(result.stdout) as OrientationPayload;

      assert.strictEqual(result.exitCode, 0);
      assert.strictEqual(payload.orientation.repo.key, 'BP');
      assert.strictEqual(payload.orientation.repo.slug, 'backpressure');
      assert.strictEqual(payload.orientation.totalRecordCount, 3);
      assert.strictEqual(payload.orientation.unreadableRecordCount, 0);
      assert.deepStrictEqual(payload.orientation.recordTypes, [
        {
          recordType: 'tech-debt',
          total: 3,
          statuses: [
            { status: 'done', kind: 'terminal', count: 1 },
            { status: 'open', kind: 'active', count: 2 },
          ],
        },
      ]);
      assert.deepStrictEqual(payload.orientation.lifecycle, [
        { kind: 'active', count: 2 },
        { kind: 'terminal', count: 1 },
      ]);
      assert.deepStrictEqual(payload.orientation.vocabulary, [
        { status: 'approved', count: 2 },
        { status: 'provisional', count: 1 },
        { status: 'rejected', count: 1 },
      ]);
      assert.deepStrictEqual(
        payload.orientation.policyDocs.map((doc) => doc.name),
        ['Contributing', 'Lifecycle'],
      );
      assert.strictEqual(payload.orientation.nextCommands.length, 3);
    });
  });

  it('counts unreadable records without failing and without validating', async () => {
    await withTempRepo(primeRepoOptions, async (root) => {
      await seedRecords(root);
      await writeFile(
        path.join(root, 'docs/records/tech-debt/open/broken.md'),
        'not valid frontmatter',
      );
      const result = await run(root, ['prime', '--json']);
      const payload = parseJsonStdout(result.stdout) as OrientationPayload;

      assert.strictEqual(result.exitCode, 0);
      assert.strictEqual(payload.orientation.unreadableRecordCount, 1);
      assert.strictEqual(payload.orientation.totalRecordCount, 3);
    });
  });

  it('rejects flags that moved to records list with a stable argument error', async () => {
    const movedFlagCases = [
      ['--type', 'tech-debt'],
      ['--status', 'open'],
      ['--limit', '5'],
      ['--include-terminal'],
      ['--all'],
    ];

    await withTempRepo(primeRepoOptions, async (root) => {
      await seedRecords(root);

      for (const movedFlag of movedFlagCases) {
        const result = await run(root, ['prime', ...movedFlag, '--json']);

        assert.strictEqual(result.exitCode, 1);
        assert.strictEqual(errorCodeFromStdout(result.stdout), 'cli.argument.invalid');
      }
    });
  });

  it('never calls validation or body-summary paths during orientation', async () => {
    await withTempRepo(primeRepoOptions, async (root) => {
      await seedRecords(root);
      const summarizeSpy = vi.spyOn(techDebtRecordType, 'summarizeForList');
      const validateSpy = vi.spyOn(techDebtRecordType, 'validate');

      try {
        /*
         * Positive controls prove the spies are wired: check exercises validate,
         * and records list exercises summarizeForList. If these were no-ops, a
         * green invariant assertion below would be meaningless.
         */
        const checkResult = await run(root, ['check', '--json']);
        assert.strictEqual(checkResult.exitCode, 0);
        assert.ok(validateSpy.mock.calls.length > 0);

        const listResult = await run(root, ['records', 'list', '--json']);
        assert.strictEqual(listResult.exitCode, 0);
        assert.ok(summarizeSpy.mock.calls.length > 0);

        summarizeSpy.mockClear();
        validateSpy.mockClear();

        const primeResult = await run(root, ['prime', '--json']);

        assert.strictEqual(primeResult.exitCode, 0);
        assert.strictEqual(summarizeSpy.mock.calls.length, 0);
        assert.strictEqual(validateSpy.mock.calls.length, 0);
      } finally {
        summarizeSpy.mockRestore();
        validateSpy.mockRestore();
      }
    });
  });
});
