/* eslint-disable max-lines-per-function, max-statements, typescript-eslint/no-unsafe-type-assertion -- CLI integration tests intentionally assert selected JSON payload fields across many command paths. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { assert, describe, it } from '@effect/vitest';

import { runCli } from '../../src/commands/index.js';
import type { ParsedRecord } from '../../src/core/record-type-types.js';
import type { TechDebtFrontmatter } from '../../src/record-types/tech-debt-types.js';
import { createMarkdownRecordStore } from '../../src/store/markdown-record-store.js';
import { renderVocabularyToml } from '../../src/core/vocabulary-file.js';
import type { IntrospectionVocabulary, VocabularyTerm } from '../../src/config/repo-context.js';

const timestamp = '2026-06-12T00:00:00Z';
const expectedVocabularyUsageEntriesAfterProposal = 8;
const nextDate = (): Date => new Date(timestamp);

const term = (
  tag: string,
  status: VocabularyTerm['status'] = 'approved',
  aliases: ReadonlyArray<string> = [],
): VocabularyTerm => {
  const baseTerm: VocabularyTerm = {
    tag,
    status,
    description: `Vocabulary term ${tag}.`,
    provenance: {
      kind: 'plan',
      ref: 'docs/design-input/introspection-seed-2026-06-01.md',
      noted_at: timestamp,
    },
  };

  if (aliases.length > 0) {
    return { ...baseTerm, aliases };
  }

  return baseTerm;
};

const vocabulary = (): IntrospectionVocabulary => ({
  schema_version: 1,
  terms: [
    term('owner/mp'),
    term('topic/old'),
    term('topic/source'),
    term('topic/target'),
    term('topic/unused'),
    term('topic/rejected', 'rejected'),
    term('topic/canonical', 'approved', ['topic/alias']),
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
    ].join('\n'),
  );
  await writeFile(
    path.join(root, '.introspection/vocabulary.toml'),
    renderVocabularyToml(vocabulary()),
  );
};

const run = async (root: string, args: ReadonlyArray<string>): ReturnType<typeof runCli> =>
  runCli({ args, cwd: root, now: nextDate });

const withTempRepo = async (testBody: (root: string) => Promise<void>): Promise<void> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'introspection-cli-'));

  try {
    await seedRepo(root);
    await testBody(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};

const parseJsonStdout = (stdout: string): unknown => JSON.parse(stdout);

const errorCodeFromStdout = (stdout: string): string =>
  (parseJsonStdout(stdout) as { error: { code: string } }).error.code;

const findingCodesFromStdout = (stdout: string): ReadonlyArray<string> =>
  (
    parseJsonStdout(stdout) as {
      error: { details: { findings: ReadonlyArray<{ code: string }> } };
    }
  ).error.details.findings.map((finding) => finding.code);

const createRecordArgs = (
  title: string,
  ...extra: ReadonlyArray<string>
): ReadonlyArray<string> => [
  'record',
  'create',
  'tech-debt',
  '--title',
  title,
  '--problem',
  'The CLI needs a valid tech-debt problem.',
  '--why-deferred',
  'The CLI shell is being tested in process.',
  '--revisit-trigger',
  'Revisit when CLI command behavior changes.',
  '--source-ref',
  'docs/design-input/introspection-seed-2026-06-01.md',
  '--source-kind',
  'plan',
  ...extra,
];

const techDebtRecord = (
  frontmatter: Partial<TechDebtFrontmatter>,
): ParsedRecord<TechDebtFrontmatter> => ({
  frontmatter: {
    schema_version: 1,
    id: 'BP-TD-100',
    repo_key: 'BP',
    record_type: 'tech-debt',
    number: 100,
    title: 'Duplicate fixture',
    status: 'open',
    type: 'introspection-record',
    category: 'tech-debt',
    visibility: 'local-only',
    created_at: timestamp,
    updated_at: timestamp,
    tags: ['record/tech-debt', 'repo/backpressure', 'status/open', 'visibility/local-only'],
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
    'Duplicate fixture.',
    '## Problem',
    'Duplicate IDs need a CLI repair path.',
    '## Why deferred',
    'This fixture exercises ID repair CLI wiring.',
    '## Revisit trigger',
    'Revisit when ID repair command behavior changes.',
  ].join('\n\n'),
});

describe('CLI command shell', () => {
  it('returns stable JSON error codes for expected CLI argument failures', async () => {
    await withTempRepo(async (root) => {
      const usageFailure = await run(root, [
        'vocab',
        'approve',
        'topic/old',
        'unexpected-extra-arg',
        '--json',
      ]);
      const invalidChoice = await run(root, [
        'vocab',
        'list',
        '--status',
        'unsupported-status',
        '--json',
      ]);

      assert.strictEqual(usageFailure.exitCode, 1);
      assert.strictEqual(errorCodeFromStdout(usageFailure.stdout), 'cli.usage');
      assert.strictEqual(invalidChoice.exitCode, 1);
      assert.strictEqual(errorCodeFromStdout(invalidChoice.stdout), 'cli.argument.invalid');
    });
  });

  it('runs check and record commands in process with human and JSON presenters', async () => {
    await withTempRepo(async (root) => {
      const emptyCheck = await run(root, ['check', '--json']);
      const created = await run(root, [...createRecordArgs('CLI-created record'), '--json']);
      const humanCheck = await run(root, ['check']);
      const invalidTransition = await run(root, [
        'record',
        'transition',
        'tech-debt/open/bp-td-001.md',
        'done',
        '--rationale',
        'Done without evidence should fail before mutation.',
        '--json',
      ]);
      const transitioned = await run(root, [
        'record',
        'transition',
        'tech-debt/open/bp-td-001.md',
        'done',
        '--rationale',
        'The CLI transition has concrete evidence.',
        '--evidence-kind',
        'doc',
        '--evidence-ref',
        'docs/design-input/introspection-seed-2026-06-01.md',
        '--json',
      ]);

      assert.strictEqual(emptyCheck.exitCode, 0);
      assert.strictEqual((parseJsonStdout(emptyCheck.stdout) as { ok: boolean }).ok, true);
      assert.strictEqual(created.exitCode, 0);
      assert.strictEqual(
        (parseJsonStdout(created.stdout) as { record: { id: string } }).record.id,
        'BP-TD-001',
      );
      assert.match(humanCheck.stdout, /Check passed/u);
      assert.strictEqual(invalidTransition.exitCode, 1);
      assert.strictEqual(
        errorCodeFromStdout(invalidTransition.stdout),
        'record.transition.invalid',
      );
      assert.strictEqual(transitioned.exitCode, 0);
      assert.strictEqual(
        (parseJsonStdout(transitioned.stdout) as { transition: { status: string } }).transition
          .status,
        'done',
      );
    });
  });

  it('repairs duplicate IDs through the ids command with parseable JSON', async () => {
    await withTempRepo(async (root) => {
      const store = createMarkdownRecordStore({ root: path.join(root, 'docs/records') });
      await store.createRecord('tech-debt/open/bp-td-100.md', techDebtRecord({}));
      await store.createRecord(
        'tech-debt/open/duplicate.md',
        techDebtRecord({ title: 'Duplicate target' }),
      );

      const repaired = await run(root, ['ids', 'repair', 'tech-debt/open/duplicate.md', '--json']);
      const payload = parseJsonStdout(repaired.stdout) as {
        repair: { newId: string; oldId: string };
      };

      assert.strictEqual(repaired.exitCode, 0);
      assert.strictEqual(payload.repair.oldId, 'BP-TD-100');
      assert.strictEqual(payload.repair.newId, 'BP-TD-101');
    });
  });

  it('creates a record without --source-ref, leaving source with no refs key', async () => {
    await withTempRepo(async (root) => {
      const result = await run(root, [
        'record',
        'create',
        'tech-debt',
        '--title',
        'Organically discovered debt',
        '--problem',
        'Discovered without a traceable source.',
        '--why-deferred',
        'No prior tracker exists to cite.',
        '--revisit-trigger',
        'Revisit when the owning area changes.',
        '--json',
      ]);

      assert.strictEqual(result.exitCode, 0);

      // RecordJson returns a summary only; read the written file to verify source shape
      const recordPath = path.join(root, 'docs/records/tech-debt/open/bp-td-001.md');
      const content = await readFile(recordPath, 'utf8');

      assert.match(content, /discovered_at:/u);
      assert.notMatch(content, /refs:/u);
    });
  });

  it('rejects invalid raw tags during record creation before writing a file', async () => {
    const cases = [
      { tag: 'topic/missing', finding: 'tag.vocabulary.unknown' },
      { tag: 'topic/rejected', finding: 'tag.vocabulary.rejected' },
      { tag: 'topic/alias', finding: 'tag.vocabulary.alias' },
      { tag: 'status/done', finding: 'tag.machine_derived.stale' },
      { tag: 'Bad/Tag', finding: 'schema.violation' },
    ];

    for (const testCase of cases) {
      await withTempRepo(async (root) => {
        const result = await run(root, [
          ...createRecordArgs('Invalid tag record', '--tag', testCase.tag),
          '--json',
        ]);
        const store = createMarkdownRecordStore({ root: path.join(root, 'docs/records') });

        assert.strictEqual(result.exitCode, 1);
        assert.strictEqual(errorCodeFromStdout(result.stdout), 'record.create.invalid');
        assert.ok(findingCodesFromStdout(result.stdout).includes(testCase.finding));
        assert.deepStrictEqual(await store.listRecords(), []);
      });
    }
  });

  it('rejects invalid transition frontmatter and leaves the source file unchanged', async () => {
    await withTempRepo(async (root) => {
      await run(root, [...createRecordArgs('Invalid transition record'), '--json']);
      const sourcePath = path.join(root, 'docs/records/tech-debt/open/bp-td-001.md');
      const before = await readFile(sourcePath, 'utf8');
      const result = await run(root, [
        'record',
        'transition',
        'tech-debt/open/bp-td-001.md',
        'done',
        '--rationale',
        'Invalid resolved_at must fail full candidate validation.',
        '--resolved-at',
        'not-a-date',
        '--evidence-kind',
        'doc',
        '--evidence-ref',
        'docs/design-input/introspection-seed-2026-06-01.md',
        '--json',
      ]);

      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(errorCodeFromStdout(result.stdout), 'record.transition.invalid');
      assert.ok(findingCodesFromStdout(result.stdout).includes('schema.violation'));
      assert.strictEqual(await readFile(sourcePath, 'utf8'), before);
    });
  });

  it('preflights transition target collisions and leaves the source file unchanged', async () => {
    await withTempRepo(async (root) => {
      await run(root, [...createRecordArgs('Collision transition record'), '--json']);
      const store = createMarkdownRecordStore({ root: path.join(root, 'docs/records') });
      await store.createRecord(
        'tech-debt/done/bp-td-001.md',
        techDebtRecord({ id: 'BP-TD-999', number: 999, status: 'done' }),
      );
      const sourcePath = path.join(root, 'docs/records/tech-debt/open/bp-td-001.md');
      const before = await readFile(sourcePath, 'utf8');
      const result = await run(root, [
        'record',
        'transition',
        'tech-debt/open/bp-td-001.md',
        'done',
        '--rationale',
        'Target collision must fail before updating the source record.',
        '--evidence-kind',
        'doc',
        '--evidence-ref',
        'docs/design-input/introspection-seed-2026-06-01.md',
        '--json',
      ]);

      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(errorCodeFromStdout(result.stdout), 'record.transition.target_exists');
      assert.strictEqual(await readFile(sourcePath, 'utf8'), before);
    });
  });

  it('proposes a vocabulary term without --provenance-ref and succeeds', async () => {
    await withTempRepo(async (root) => {
      const result = await run(root, [
        'vocab',
        'propose',
        'topic/no-ref',
        '--description',
        'Organically discovered tag with no traceable source.',
        '--json',
      ]);

      assert.strictEqual(result.exitCode, 0);
      const payload = parseJsonStdout(result.stdout) as {
        vocabulary: { terms: ReadonlyArray<{ tag: string; provenance: Record<string, unknown> }> };
      };
      const proposed = payload.vocabulary.terms.find(
        (candidate) => candidate.tag === 'topic/no-ref',
      );

      assert.ok(proposed);
      assert.ok(!('ref' in (proposed?.provenance ?? {})));
    });
  });

  it('rejects schema-invalid vocab propose metadata without changing vocabulary.toml', async () => {
    const cases = [
      ['--provenance-noted-at', 'not-a-date'],
      ['--applies-to', ''],
    ] as const;

    for (const extraArgs of cases) {
      await withTempRepo(async (root) => {
        const vocabularyPath = path.join(root, '.introspection/vocabulary.toml');
        const before = await readFile(vocabularyPath, 'utf8');
        const result = await run(root, [
          'vocab',
          'propose',
          'topic/schema-invalid',
          '--description',
          'Schema-invalid metadata must not persist.',
          '--provenance-ref',
          'docs/design-input/introspection-seed-2026-06-01.md',
          ...extraArgs,
          '--json',
        ]);

        assert.strictEqual(result.exitCode, 1);
        assert.strictEqual(errorCodeFromStdout(result.stdout), 'vocabulary.schema_violation');
        assert.strictEqual(await readFile(vocabularyPath, 'utf8'), before);
      });
    }
  });

  it('runs every vocabulary JSON command path in process', async () => {
    await withTempRepo(async (root) => {
      const list = await run(root, ['vocab', 'list', '--json']);
      const proposed = await run(root, [
        'vocab',
        'propose',
        'topic/new',
        '--description',
        'New topic proposed by the CLI.',
        '--provenance-ref',
        'docs/design-input/introspection-seed-2026-06-01.md',
        '--json',
      ]);
      const approved = await run(root, ['vocab', 'approve', 'topic/new', '--json']);
      const rejected = await run(root, ['vocab', 'reject', 'topic/new', '--json']);
      await run(root, [
        ...createRecordArgs(
          'Vocabulary cascade record',
          '--tag',
          'topic/old',
          '--tag',
          'topic/source',
        ),
      ]);
      const allUsage = await run(root, ['vocab', 'usage', '--json']);
      const usage = await run(root, ['vocab', 'usage', 'topic/old', '--json']);
      const renamed = await run(root, ['vocab', 'rename', 'topic/old', 'topic/renamed', '--json']);
      const merged = await run(root, ['vocab', 'merge', 'topic/source', 'topic/target', '--json']);
      const deleted = await run(root, ['vocab', 'delete', 'topic/unused', '--json']);

      for (const result of [
        list,
        proposed,
        approved,
        rejected,
        allUsage,
        usage,
        renamed,
        merged,
        deleted,
      ]) {
        assert.strictEqual(result.exitCode, 0);
        assert.doesNotThrow(() => parseJsonStdout(result.stdout));
      }
      assert.strictEqual(
        (parseJsonStdout(allUsage.stdout) as { usage: Array<unknown> }).usage.length,
        expectedVocabularyUsageEntriesAfterProposal,
      );
      assert.strictEqual(
        (parseJsonStdout(usage.stdout) as { usage: Array<{ records: Array<unknown> }> }).usage[0]
          ?.records.length,
        1,
      );
      assert.deepStrictEqual(
        (parseJsonStdout(renamed.stdout) as { cascade: { changedRecordPaths: Array<string> } })
          .cascade.changedRecordPaths,
        ['tech-debt/open/bp-td-001.md'],
      );
      assert.deepStrictEqual(
        (parseJsonStdout(merged.stdout) as { cascade: { changedRecordPaths: Array<string> } })
          .cascade.changedRecordPaths,
        ['tech-debt/open/bp-td-001.md'],
      );
      assert.strictEqual(
        (parseJsonStdout(deleted.stdout) as { deletedTag: string }).deletedTag,
        'topic/unused',
      );
    });
  });
});
