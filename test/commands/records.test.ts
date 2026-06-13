/* eslint-disable no-magic-numbers, max-lines-per-function, typescript-eslint/no-unsafe-type-assertion -- Records list CLI integration tests assert JSON payload fields from in-process command output. */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { assert, describe, it } from '@effect/vitest';

import { runCli } from '../../src/commands/index.js';
import type { CliRunResult } from '../../src/commands/types.js';
import type { IntrospectionVocabulary, VocabularyTerm } from '../../src/config/repo-context.js';
import type { ParsedRecord } from '../../src/core/record-type-types.js';
import { renderVocabularyToml } from '../../src/core/vocabulary-file.js';
import type { TechDebtFrontmatter } from '../../src/record-types/tech-debt-types.js';
import { createMarkdownRecordStore } from '../../src/store/markdown-record-store.js';

const now = new Date('2026-06-12T00:00:00Z');
const timestamp = '2026-06-01T00:00:00Z';

const term = (tag: string): VocabularyTerm => ({
  tag,
  status: 'approved',
  description: `Vocabulary term ${tag}.`,
  provenance: {
    kind: 'plan',
    ref: 'docs/design-input/introspection-seed-2026-06-01.md',
    noted_at: timestamp,
  },
});

const vocabulary = (): IntrospectionVocabulary => ({
  schema_version: 1,
  terms: [term('owner/mp'), term('topic/records')],
});

const seedRepo = async (root: string): Promise<void> => {
  await mkdir(path.join(root, '.introspection'), { recursive: true });
  await mkdir(path.join(root, 'docs/records'), { recursive: true });
  await writeFile(
    path.join(root, '.introspection/config.toml'),
    [
      'schema_version = 1',
      'repo_key = "BP"',
      'repo_slug = "backpressure"',
      '',
      '[records]',
      'root = "docs/records"',
      '',
      '[defaults]',
      'visibility = "local-only"',
      '',
      '[prime]',
      'default_limit = 1',
      'hard_limit = 2',
      '',
    ].join('\n'),
  );
  await writeFile(
    path.join(root, '.introspection/vocabulary.toml'),
    renderVocabularyToml(vocabulary()),
  );
};

const withTempRepo = async (testBody: (root: string) => Promise<void>): Promise<void> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'introspection-records-cli-'));

  try {
    await seedRepo(root);
    await testBody(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};

const techDebtRecord = (
  number: number,
  title: string,
  updatedAt: string,
  frontmatter: Partial<TechDebtFrontmatter> = {},
): ParsedRecord<TechDebtFrontmatter> => {
  const status = frontmatter.status ?? 'open';

  return {
    frontmatter: {
      schema_version: 1,
      id: `BP-TD-${String(number).padStart(3, '0')}`,
      repo_key: 'BP',
      record_type: 'tech-debt',
      number,
      title,
      status,
      type: 'introspection-record',
      category: 'tech-debt',
      visibility: 'local-only',
      created_at: timestamp,
      updated_at: updatedAt,
      tags: ['record/tech-debt', 'repo/backpressure', `status/${status}`, 'visibility/local-only'],
      source: {
        discovered_at: timestamp,
        refs: [
          {
            kind: 'plan',
            ref: 'docs/design-input/introspection-seed-2026-06-01.md',
          },
        ],
      },
      ...frontmatter,
    } as TechDebtFrontmatter,
    body: [
      `${title} summary.`,
      '## Problem',
      'Records list needs CLI coverage.',
      '## Why deferred',
      'The bounded listing command needs CLI coverage.',
      '## Revisit trigger',
      'Revisit when the records list command behavior changes.',
    ].join('\n\n'),
  };
};

const seedRecords = async (root: string): Promise<void> => {
  const store = createMarkdownRecordStore({ root: path.join(root, 'docs/records') });
  await store.createRecord(
    'tech-debt/open/bp-td-001.md',
    techDebtRecord(1, 'Old active record', '2026-06-01T00:00:00Z'),
  );
  await store.createRecord(
    'tech-debt/open/bp-td-002.md',
    techDebtRecord(2, 'New active record', '2026-06-10T00:00:00Z'),
  );
  await store.createRecord(
    'tech-debt/done/bp-td-003.md',
    techDebtRecord(3, 'Terminal record', '2026-05-01T00:00:00Z', {
      status: 'done',
      resolution: {
        disposition: 'done',
        resolved_at: '2026-05-02T00:00:00Z',
        rationale: 'Terminal record exists to prove default list filtering.',
        evidence_refs: [{ kind: 'doc', ref: 'docs/evidence.md' }],
      },
    }),
  );
};

const run = async (root: string, args: ReadonlyArray<string>): Promise<CliRunResult> =>
  runCli({ args, cwd: root, now: () => now });

const parseJsonStdout = (stdout: string): unknown => JSON.parse(stdout);

const errorCodeFromStdout = (stdout: string): string =>
  (parseJsonStdout(stdout) as { error: { code: string } }).error.code;

describe('records list CLI command', () => {
  it('renders bounded human output with omitted counts and active records by default', async () => {
    await withTempRepo(async (root) => {
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

    await withTempRepo(async (root) => {
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
    await withTempRepo(async (root) => {
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

    await withTempRepo(async (root) => {
      for (const flagCase of explicitValueCases) {
        const result = await run(root, ['records', 'list', ...flagCase, '--json']);

        assert.strictEqual(result.exitCode, 1);
        assert.strictEqual(errorCodeFromStdout(result.stdout), 'cli.argument.invalid');
      }
    });
  });

  it('emits parseable JSON and reports hard-cap clamping', async () => {
    await withTempRepo(async (root) => {
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
    await withTempRepo(async (root) => {
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
    await withTempRepo(async (root) => {
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
