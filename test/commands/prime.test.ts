/* eslint-disable no-magic-numbers, typescript-eslint/no-unsafe-type-assertion -- Prime CLI integration tests assert JSON payload fields from in-process command output. */
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
    ref: 'docs/exec-plans/active/introspection-v1-bootstrap-2026-06-10.md#wi-10',
    noted_at: timestamp,
  },
});

const vocabulary = (): IntrospectionVocabulary => ({
  schema_version: 1,
  terms: [term('owner/mp'), term('topic/prime')],
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
  const root = await mkdtemp(path.join(os.tmpdir(), 'introspection-prime-cli-'));

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
            ref: 'docs/exec-plans/active/introspection-v1-bootstrap-2026-06-10.md#wi-10',
          },
        ],
      },
      ...frontmatter,
    } as TechDebtFrontmatter,
    body: [
      `${title} summary.`,
      '## Problem',
      'Prime needs CLI coverage.',
      '## Why deferred',
      'The deterministic prime command is being implemented in WI-10.',
      '## Revisit trigger',
      'Revisit when prime command behavior changes.',
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
        rationale: 'Terminal record exists to prove default prime filtering.',
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

describe('WI-10 prime CLI command', () => {
  it('renders bounded human output with omitted counts and active records by default', async () => {
    await withTempRepo(async (root) => {
      await seedRecords(root);
      const result = await run(root, ['prime']);

      assert.strictEqual(result.exitCode, 0);
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
        const result = await run(root, ['prime', `--${flag}`, '--json']);

        assert.strictEqual(result.exitCode, 1);
        assert.strictEqual(errorCodeFromStdout(result.stdout), 'cli.argument.invalid');
      }

      const booleanResult = await run(root, ['prime', '--include-terminal', '--all', '--json']);

      assert.strictEqual(booleanResult.exitCode, 0);
      assert.doesNotThrow(() => parseJsonStdout(booleanResult.stdout));
    });
  });

  it('emits parseable JSON and reports hard-cap clamping', async () => {
    await withTempRepo(async (root) => {
      await seedRecords(root);
      const result = await run(root, ['prime', '--all', '--limit', '10', '--json']);
      const payload = parseJsonStdout(result.stdout) as {
        prime: {
          limit: { clamped: boolean; effectiveLimit: number; requestedLimit: number };
          omittedRecordCount: number;
          records: Array<{ id: string; status: string }>;
          totalMatchingRecordCount: number;
        };
      };

      assert.strictEqual(result.exitCode, 0);
      assert.strictEqual(payload.prime.limit.clamped, true);
      assert.strictEqual(payload.prime.limit.requestedLimit, 10);
      assert.strictEqual(payload.prime.limit.effectiveLimit, 2);
      assert.strictEqual(payload.prime.totalMatchingRecordCount, 3);
      assert.strictEqual(payload.prime.omittedRecordCount, 1);
      assert.deepStrictEqual(
        payload.prime.records.map((record) => record.id),
        ['BP-TD-003', 'BP-TD-001'],
      );
    });
  });

  it('allows explicit terminal status filtering without include-terminal', async () => {
    await withTempRepo(async (root) => {
      await seedRecords(root);
      const result = await run(root, ['prime', '--status', 'done', '--json']);
      const payload = parseJsonStdout(result.stdout) as {
        prime: { records: Array<{ id: string; status: string }> };
      };

      assert.strictEqual(result.exitCode, 0);
      assert.deepStrictEqual(
        payload.prime.records.map((record) => ({ id: record.id, status: record.status })),
        [{ id: 'BP-TD-003', status: 'done' }],
      );
    });
  });
});
