/* eslint-disable typescript-eslint/no-unsafe-type-assertion -- Boundary tests assert CLI JSON payload fields. */
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
  terms: [term('topic/boundary')],
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
      'default_limit = 10',
      'hard_limit = 10',
      '',
    ].join('\n'),
  );
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
    title: 'Boundary record',
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
      'topic/boundary',
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
    'Boundary record summary.',
    '## Problem',
    'Core commands must not require GNO or retrieval providers.',
    '## Why deferred',
    'GNO-assisted features are out of scope for v1 core paths.',
    '## Revisit trigger',
    'Revisit when a feature consumes retrieval.',
  ].join('\n\n'),
});

const withTempRepo = async (testBody: (root: string) => Promise<void>): Promise<void> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'introspection-boundary-'));

  try {
    await seedRepo(root);
    const store = createMarkdownRecordStore({ root: path.join(root, 'docs/records') });
    await store.createRecord('tech-debt/open/bp-td-001.md', techDebtRecord());
    await testBody(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};

const run = async (root: string, args: ReadonlyArray<string>): Promise<CliRunResult> =>
  runCli({ args, cwd: root, now: () => now });

const parseJsonStdout = (stdout: string): unknown => JSON.parse(stdout);

describe('no-GNO boundary', () => {
  it('runs check and prime without a GNO client or retrieval provider', async () => {
    await withTempRepo(async (root) => {
      const check = await run(root, ['check', '--json']);
      const prime = await run(root, ['prime', '--json']);
      const checkPayload = parseJsonStdout(check.stdout) as { ok: boolean };
      const primePayload = parseJsonStdout(prime.stdout) as {
        prime: { records: Array<{ id: string }> };
      };

      assert.strictEqual(check.exitCode, 0);
      assert.strictEqual(checkPayload.ok, true);
      assert.strictEqual(prime.exitCode, 0);
      assert.deepStrictEqual(
        primePayload.prime.records.map((record) => record.id),
        ['BP-TD-001'],
      );
    });
  });
});
