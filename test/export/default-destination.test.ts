/* eslint-disable typescript-eslint/no-unsafe-type-assertion -- CLI JSON regression asserts error payload fields. */
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
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
const sentinelContent = 'keep me';
const manifestSentinelContent = 'manifest sentinel';
const recordsSentinelContent = 'records sentinel';

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
  terms: [term('topic/export')],
});

const configToml = (recordsRoot: string): string =>
  [
    'schema_version = 1',
    'repo_key = "BP"',
    'repo_slug = "backpressure"',
    '',
    '[records]',
    `root = "${recordsRoot}"`,
    '',
    '[defaults]',
    'visibility = "local-only"',
    '',
  ].join('\n');

const seedRepo = async (root: string, recordsRoot = 'docs/records'): Promise<void> => {
  await mkdir(path.join(root, '.introspection'), { recursive: true });
  await mkdir(path.join(root, recordsRoot), { recursive: true });
  await writeFile(path.join(root, '.introspection/config.toml'), configToml(recordsRoot));
  await writeFile(
    path.join(root, '.introspection/vocabulary.toml'),
    renderVocabularyToml(vocabulary()),
  );
};

const techDebtRecord = (): ParsedRecord<TechDebtFrontmatter> => ({
  frontmatter: {
    schema_version: 1,
    id: 'BP-TD-001',
    repo_key: 'BP',
    record_type: 'tech-debt',
    number: 1,
    title: 'Default export safety',
    status: 'open',
    type: 'introspection-record',
    category: 'tech-debt',
    visibility: 'local-only',
    created_at: timestamp,
    updated_at: timestamp,
    tags: ['record/tech-debt', 'repo/backpressure', 'status/open', 'visibility/local-only'],
  },
  body: [
    'Default export safety summary.',
    '## Problem',
    'Default exports must not follow generated symlinks outside the repo.',
    '## Why deferred',
    'The default-destination safety check is tested at the CLI boundary.',
    '## Revisit trigger',
    'Revisit when default export destination behavior changes.',
  ].join('\n\n'),
});

const seedRecords = async (root: string, recordsRoot = 'docs/records'): Promise<void> => {
  const store = createMarkdownRecordStore({ root: path.join(root, recordsRoot) });
  await store.createRecord('tech-debt/open/bp-td-001.md', techDebtRecord());
};

const withTempRepo = async (testBody: (root: string) => Promise<void>): Promise<void> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'introspection-export-destination-'));

  try {
    await seedRepo(root);
    await seedRecords(root);
    await testBody(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};

const withGeneratedRecordsRepo = async (
  testBody: (root: string, recordPath: string) => Promise<void>,
): Promise<void> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'introspection-export-generated-records-'));
  const recordsRoot = '.introspection/generated/records';
  const recordPath = path.join(root, recordsRoot, 'tech-debt/open/bp-td-001.md');

  try {
    await seedRepo(root, recordsRoot);
    await seedRecords(root, recordsRoot);
    await testBody(root, recordPath);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};

const generatedRecordsRoot = '.introspection/generated/records';

const createRecordsSymlinkIntoGenerated = async (root: string): Promise<void> => {
  await mkdir(path.join(root, '.introspection/generated'), { recursive: true });
  await rm(path.join(root, 'docs/records'), { force: true, recursive: true });
  await symlink(path.join(root, generatedRecordsRoot), path.join(root, 'docs/records'), 'dir');
};

const withSymlinkedGeneratedRecordsRepo = async (
  testBody: (root: string, recordPath: string) => Promise<void>,
): Promise<void> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'introspection-export-symlink-records-'));
  const recordPath = path.join(root, generatedRecordsRoot, 'tech-debt/open/bp-td-001.md');

  try {
    await seedRepo(root);
    await createRecordsSymlinkIntoGenerated(root);
    await seedRecords(root, generatedRecordsRoot);
    await testBody(root, recordPath);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};

const run = async (root: string, args: ReadonlyArray<string>): Promise<CliRunResult> =>
  runCli({ args, cwd: root, now: () => now });

const generatedRoot = (root: string): string => path.join(root, '.introspection/generated');

const parseJsonStdout = (stdout: string): unknown => JSON.parse(stdout);

const errorCodeFromStdout = (stdout: string): string =>
  (parseJsonStdout(stdout) as { error: { code: string } }).error.code;

const seedSymlinkedGeneratedDirectory = async (root: string): Promise<string> => {
  const outsideRoot = await mkdtemp(path.join(os.tmpdir(), 'introspection-outside-generated-'));
  await rm(generatedRoot(root), { force: true, recursive: true });
  await symlink(outsideRoot, generatedRoot(root), 'dir');
  await writeFile(path.join(outsideRoot, 'sentinel.txt'), sentinelContent);

  return outsideRoot;
};

const assertOutsideRootUntouched = async (outsideRoot: string): Promise<void> => {
  assert.strictEqual(
    await readFile(path.join(outsideRoot, 'sentinel.txt'), 'utf8'),
    sentinelContent,
  );
  assert.deepStrictEqual(await readdir(outsideRoot), ['sentinel.txt']);
};

const seedSymlinkedArtifactFiles = async (root: string): Promise<string> => {
  const outsideRoot = await mkdtemp(path.join(os.tmpdir(), 'introspection-outside-artifacts-'));
  await mkdir(generatedRoot(root), { recursive: true });
  await writeFile(path.join(outsideRoot, 'manifest-target.json'), manifestSentinelContent);
  await writeFile(path.join(outsideRoot, 'records-target.json'), recordsSentinelContent);
  await symlink(
    path.join(outsideRoot, 'manifest-target.json'),
    path.join(generatedRoot(root), 'manifest.json'),
  );
  await symlink(
    path.join(outsideRoot, 'records-target.json'),
    path.join(generatedRoot(root), 'records.json'),
  );

  return outsideRoot;
};

const assertArtifactTargetsUntouched = async (outsideRoot: string): Promise<void> => {
  assert.strictEqual(
    await readFile(path.join(outsideRoot, 'manifest-target.json'), 'utf8'),
    manifestSentinelContent,
  );
  assert.strictEqual(
    await readFile(path.join(outsideRoot, 'records-target.json'), 'utf8'),
    recordsSentinelContent,
  );
};

describe('default export destination safety', () => {
  it('rejects generated-root records before default cleanup and preserves source files', async () => {
    await withGeneratedRecordsRepo(async (root, recordPath) => {
      const before = await readFile(recordPath, 'utf8');
      const result = await run(root, ['export', '--json']);

      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(
        errorCodeFromStdout(result.stdout),
        'export.default_destination.records_root_inside_generated',
      );
      assert.strictEqual(await readFile(recordPath, 'utf8'), before);
    });
  });

  it('rejects symlinked records root inside generated root and preserves source files', async () => {
    await withSymlinkedGeneratedRecordsRepo(async (root, recordPath) => {
      const before = await readFile(recordPath, 'utf8');
      const result = await run(root, ['export', '--json']);

      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(
        errorCodeFromStdout(result.stdout),
        'export.default_destination.records_root_inside_generated',
      );
      assert.strictEqual(await readFile(recordPath, 'utf8'), before);
    });
  });

  it('recreates default generated root before writing over symlinked artifact names', async () => {
    await withTempRepo(async (root) => {
      const outsideRoot = await seedSymlinkedArtifactFiles(root);

      try {
        const result = await run(root, ['export', '--json']);

        assert.strictEqual(result.exitCode, 0);
        await assertArtifactTargetsUntouched(outsideRoot);
      } finally {
        await rm(outsideRoot, { force: true, recursive: true });
      }
    });
  });

  it('rejects symlinked default generated destination before touching the outside target', async () => {
    await withTempRepo(async (root) => {
      const outsideRoot = await seedSymlinkedGeneratedDirectory(root);

      try {
        const result = await run(root, ['export', '--json']);

        assert.strictEqual(result.exitCode, 1);
        assert.strictEqual(
          errorCodeFromStdout(result.stdout),
          'export.default_destination.path_outside_repo_root',
        );
        await assertOutsideRootUntouched(outsideRoot);
      } finally {
        await rm(outsideRoot, { force: true, recursive: true });
      }
    });
  });
});
