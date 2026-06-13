/* eslint-disable no-magic-numbers, typescript-eslint/no-unsafe-type-assertion -- CLI fixture builds test records with numeric padding and casts partial frontmatter to the full type. */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runCli } from '../../src/commands/index.js';
import type { CliRunResult } from '../../src/commands/types.js';
import type { IntrospectionVocabulary, VocabularyTerm } from '../../src/config/repo-context.js';
import type { ParsedRecord } from '../../src/core/record-type-types.js';
import { renderVocabularyToml } from '../../src/core/vocabulary-file.js';
import type { TechDebtFrontmatter } from '../../src/record-types/tech-debt-types.js';
import { createMarkdownRecordStore } from '../../src/store/markdown-record-store.js';

const now = new Date('2026-06-12T00:00:00Z');
const timestamp = '2026-06-01T00:00:00Z';

/*
 * Options for spinning up a temporary repo in CLI integration tests. Policy
 * docs are off by default since most command tests do not exercise that path.
 */
interface WithTempRepoOptions {
  readonly tmpDirPrefix: string;
  readonly vocabularyTerms: ReadonlyArray<VocabularyTerm>;
  readonly policyDocs?: boolean;
}

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

const buildConfigToml = (policyDocs: boolean): string => {
  const base = [
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
  ].join('\n');

  if (!policyDocs) {
    return base;
  }

  return (
    base +
    [
      '[[policy_docs]]',
      'name = "Contributing"',
      'path = "docs/policy/contributing.md"',
      'applies_to = ["tech-debt"]',
      '',
      '[[policy_docs]]',
      'name = "Lifecycle"',
      'path = "docs/policy/lifecycle.md"',
      '',
    ].join('\n')
  );
};

const seedRepo = async (root: string, options: WithTempRepoOptions): Promise<void> => {
  const vocabulary: IntrospectionVocabulary = {
    schema_version: 1,
    terms: [...options.vocabularyTerms],
  };

  await mkdir(path.join(root, '.introspection'), { recursive: true });
  await mkdir(path.join(root, 'docs/records'), { recursive: true });
  await writeFile(
    path.join(root, '.introspection/config.toml'),
    buildConfigToml(options.policyDocs ?? false),
  );
  await writeFile(
    path.join(root, '.introspection/vocabulary.toml'),
    renderVocabularyToml(vocabulary),
  );
};

const withTempRepo = async (
  options: WithTempRepoOptions,
  testBody: (root: string) => Promise<void>,
): Promise<void> => {
  const root = await mkdtemp(path.join(os.tmpdir(), options.tmpDirPrefix));

  try {
    await seedRepo(root, options);
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
      'CLI integration coverage is missing for this scenario.',
      '## Why deferred',
      'The command needs CLI integration test coverage.',
      '## Revisit trigger',
      'Revisit when the command behavior changes.',
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
        rationale: 'Terminal record exists to prove CLI filtering behavior.',
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

export {
  errorCodeFromStdout,
  now,
  parseJsonStdout,
  run,
  seedRecords,
  techDebtRecord,
  term,
  withTempRepo,
};
export type { WithTempRepoOptions };
