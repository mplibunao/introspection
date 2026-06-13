/* eslint-disable no-magic-numbers, max-statements, max-lines-per-function, typescript-eslint/no-unsafe-type-assertion -- Prime orientation CLI tests assert JSON payload fields and spy on record-type methods to pin the no-validation invariant. */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { assert, describe, it } from '@effect/vitest';
import { vi } from 'vitest';

import { runCli } from '../../src/commands/index.js';
import type { CliRunResult } from '../../src/commands/types.js';
import type { IntrospectionVocabulary, VocabularyTerm } from '../../src/config/repo-context.js';
import type { ParsedRecord } from '../../src/core/record-type-types.js';
import { renderVocabularyToml } from '../../src/core/vocabulary-file.js';
import { techDebtRecordType } from '../../src/record-types/tech-debt.js';
import type { TechDebtFrontmatter } from '../../src/record-types/tech-debt-types.js';
import { createMarkdownRecordStore } from '../../src/store/markdown-record-store.js';

const now = new Date('2026-06-12T00:00:00Z');
const timestamp = '2026-06-01T00:00:00Z';

const term = (tag: string, status: VocabularyTerm['status'] = 'approved'): VocabularyTerm => ({
  tag,
  status,
  description: `Vocabulary term ${tag}.`,
  provenance: {
    kind: 'plan',
    ref: 'docs/design-input/introspection-seed-2026-06-01.md',
    noted_at: timestamp,
  },
});

const vocabulary = (): IntrospectionVocabulary => ({
  schema_version: 1,
  terms: [
    term('owner/mp'),
    term('topic/prime'),
    term('topic/provisional', 'provisional'),
    term('topic/rejected', 'rejected'),
  ],
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
      '[[policy_docs]]',
      'name = "Contributing"',
      'path = "docs/policy/contributing.md"',
      'applies_to = ["tech-debt"]',
      '',
      '[[policy_docs]]',
      'name = "Lifecycle"',
      'path = "docs/policy/lifecycle.md"',
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
            ref: 'docs/design-input/introspection-seed-2026-06-01.md',
          },
        ],
      },
      ...frontmatter,
    } as TechDebtFrontmatter,
    body: [
      `${title} summary.`,
      '## Problem',
      'Prime orientation needs CLI coverage.',
      '## Why deferred',
      'The deterministic orientation command needs CLI coverage.',
      '## Revisit trigger',
      'Revisit when prime orientation behavior changes.',
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
        rationale: 'Terminal record exists to prove orientation lifecycle counts.',
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
    await withTempRepo(async (root) => {
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
    await withTempRepo(async (root) => {
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
    await withTempRepo(async (root) => {
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

    await withTempRepo(async (root) => {
      await seedRecords(root);

      for (const movedFlag of movedFlagCases) {
        const result = await run(root, ['prime', ...movedFlag, '--json']);

        assert.strictEqual(result.exitCode, 1);
        assert.strictEqual(errorCodeFromStdout(result.stdout), 'cli.argument.invalid');
      }
    });
  });

  it('never calls validation or body-summary paths during orientation', async () => {
    await withTempRepo(async (root) => {
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
