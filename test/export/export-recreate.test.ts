/* eslint-disable no-magic-numbers, typescript-eslint/no-unsafe-type-assertion -- Export tests assert generated artifact shapes and deterministic file contents. */
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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
  terms: [term('owner/mp'), term('topic/export')],
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

const techDebtRecord = (number: number, title: string): ParsedRecord<TechDebtFrontmatter> => ({
  frontmatter: {
    schema_version: 1,
    id: `BP-TD-${String(number).padStart(3, '0')}`,
    repo_key: 'BP',
    record_type: 'tech-debt',
    number,
    title,
    status: 'open',
    type: 'introspection-record',
    category: 'tech-debt',
    visibility: 'local-only',
    created_at: timestamp,
    updated_at: timestamp,
    tags: [
      'record/tech-debt',
      'repo/backpressure',
      'status/open',
      'visibility/local-only',
      'topic/export',
    ],
    source: {
      discovered_at: timestamp,
      refs: [
        {
          kind: 'plan',
          ref: 'docs/design-input/introspection-seed-2026-06-01.md',
        },
      ],
    },
  },
  body: [
    `${title} summary.`,
    '## Problem',
    'Exports need deterministic generated artifacts.',
    '## Why deferred',
    'The export command needs recreate coverage.',
    '## Revisit trigger',
    'Revisit when generated export shape changes.',
  ].join('\n\n'),
});

const seedRecords = async (root: string): Promise<void> => {
  const store = createMarkdownRecordStore({ root: path.join(root, 'docs/records') });
  await store.createRecord('tech-debt/open/bp-td-002.md', techDebtRecord(2, 'Second export'));
  await store.createRecord('tech-debt/open/bp-td-001.md', techDebtRecord(1, 'First export'));
};

const withTempRepo = async (testBody: (root: string) => Promise<void>): Promise<void> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'introspection-export-'));

  try {
    await seedRepo(root);
    await seedRecords(root);
    await testBody(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};

const run = async (root: string, args: ReadonlyArray<string>): Promise<CliRunResult> =>
  runCli({ args, cwd: root, now: () => now });

const generatedRoot = (root: string): string => path.join(root, '.introspection/generated');

const snapshotGenerated = async (root: string): Promise<Record<string, string>> => {
  const output: Record<string, string> = {};
  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile()) {
        output[path.relative(generatedRoot(root), absolutePath)] = await readFile(
          absolutePath,
          'utf8',
        );
      }
    }
  };

  await walk(generatedRoot(root));

  return output;
};

const parseJsonStdout = (stdout: string): unknown => JSON.parse(stdout);

const assertDefaultExportSnapshot = (snapshot: Record<string, string>): void => {
  assert.ok('records.json' in snapshot);
  assert.ok('manifest.json' in snapshot);
  assert.ok('gno-markdown/tech-debt/open/bp-td-001.md' in snapshot);
  assert.match(snapshot['records.json'] ?? '', /"visibility": "local-only"/u);
  assert.match(
    snapshot['gno-markdown/tech-debt/open/bp-td-001.md'] ?? '',
    /visibility: local-only/u,
  );
};

const assertJsonExportEntry = (entry: {
  readonly kind: string;
  readonly path: string;
  readonly record_count: number;
}): void => {
  assert.strictEqual(entry.kind, 'json');
  assert.strictEqual(entry.path, 'records.json');
  assert.strictEqual(entry.record_count, 2);
};

describe('export artifacts', () => {
  it('deletes and recreates logically identical default generated exports', async () => {
    await withTempRepo(async (root) => {
      const first = await run(root, ['export', '--json']);
      const firstSnapshot = await snapshotGenerated(root);

      await rm(generatedRoot(root), { force: true, recursive: true });
      const second = await run(root, ['export', '--json']);
      const secondSnapshot = await snapshotGenerated(root);

      assert.strictEqual(first.exitCode, 0);
      assert.strictEqual(second.exitCode, 0);
      assert.deepStrictEqual(secondSnapshot, firstSnapshot);
      assertDefaultExportSnapshot(secondSnapshot);
    });
  });

  it('emits parseable JSON command output and honors explicit destination directories', async () => {
    await withTempRepo(async (root) => {
      const destination = path.join(root, 'tmp/export-output');
      const result = await run(root, [
        'export',
        '--format',
        'json',
        '--dest',
        destination,
        '--json',
      ]);
      const payload = parseJsonStdout(result.stdout) as {
        export: {
          destinationDirectory: string;
          manifest: { exports: Array<{ kind: string; path: string; record_count: number }> };
          recordsExported: number;
        };
      };
      const jsonPayload = JSON.parse(
        await readFile(path.join(destination, 'records.json'), 'utf8'),
      ) as {
        records: Array<{ id: string; visibility: string }>;
      };

      assert.strictEqual(result.exitCode, 0);
      assert.strictEqual(payload.export.destinationDirectory, destination);
      assert.strictEqual(payload.export.recordsExported, 2);
      assert.strictEqual(payload.export.manifest.exports.length, 1);
      assertJsonExportEntry(
        payload.export.manifest.exports[0] as {
          kind: string;
          path: string;
          record_count: number;
        },
      );
      assert.deepStrictEqual(
        jsonPayload.records.map((record) => [record.id, record.visibility]),
        [
          ['BP-TD-001', 'local-only'],
          ['BP-TD-002', 'local-only'],
        ],
      );
    });
  });
});
