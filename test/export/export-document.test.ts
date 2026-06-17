import { assert, describe, it } from '@effect/vitest';

import type { RepoContext } from '../../src/config/repo-context.js';
import { buildExportDocuments, buildExportManifest } from '../../src/export/export-document.js';
import { recordTypeRegistry } from '../../src/record-types/registry.js';
import type { TechDebtFrontmatter } from '../../src/record-types/tech-debt-types.js';
import type { StoredMarkdownRecord } from '../../src/store/markdown-record-store.js';

const timestamp = '2026-06-12T00:00:00Z';
const rawBytes = Buffer.from('record fixture');
const secondRecordNumber = 2;
const exportedRecordCount = 2;

const frontmatter = (id: string, number: number, title: string): TechDebtFrontmatter => ({
  schema_version: 1,
  id,
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
});

const storedRecord = (
  id: string,
  number: number,
  title: string,
  relativePath: string,
): StoredMarkdownRecord => ({
  absolutePath: `/repo/docs/records/${relativePath}`,
  hash: `${id}-hash`,
  rawBytes,
  relativePath,
  frontmatter: frontmatter(id, number, title),
  body: `${title} body.`,
});

const manifestRepoContext: RepoContext = {
  configPath: '/repo/.introspection/config.toml',
  defaultVisibility: 'local-only',
  introspectionRoot: '/repo/.introspection',
  locksRoot: '/repo/.introspection/.locks',
  recordsRoot: '/repo/docs/records',
  repoKey: 'BP',
  repoRoot: '/repo',
  repoSlug: 'backpressure',
  vocabularyPath: '/repo/.introspection/vocabulary.toml',
  policyDocs: [],
  config: {
    schema_version: 1,
    repo_key: 'BP',
    repo_slug: 'backpressure',
    records: { root: 'docs/records' },
    defaults: { visibility: 'local-only' },
    policy_docs: [],
  },
  vocabulary: { schema_version: 1, terms: [] },
};

describe('export document model', () => {
  it('orders exported records by stable ID then path and preserves source paths', () => {
    const records = [
      storedRecord('BP-TD-002', secondRecordNumber, 'Second record', 'tech-debt/open/bp-td-002.md'),
      storedRecord('BP-TD-001', 1, 'First duplicate path B', 'tech-debt/open/b.md'),
      storedRecord('BP-TD-001', 1, 'First duplicate path A', 'tech-debt/open/a.md'),
    ];

    const documents = buildExportDocuments({
      context: { recordsRoot: '/repo/docs/records', repoKey: 'BP', repoSlug: 'backpressure' },
      records,
      registry: recordTypeRegistry,
    });

    assert.deepStrictEqual(
      documents.map((document) => `${document.id}:${document.path}`),
      [
        'BP-TD-001:tech-debt/open/a.md',
        'BP-TD-001:tech-debt/open/b.md',
        'BP-TD-002:tech-debt/open/bp-td-002.md',
      ],
    );
    assert.deepStrictEqual(
      documents.map((document) => document.visibility),
      ['local-only', 'local-only', 'local-only'],
    );
  });

  it('builds deterministic export manifests with second-level timestamps and records-root provenance', () => {
    const manifest = buildExportManifest({
      entries: [
        {
          kind: 'json',
          path: 'records.json',
          record_count: exportedRecordCount,
          sha256: 'json-hash',
        },
        {
          kind: 'gno-markdown',
          path: 'gno-markdown',
          record_count: exportedRecordCount,
          sha256: 'gno-hash',
        },
      ],
      generatedAt: new Date('2026-06-12T10:15:30.456Z'),
      repo: manifestRepoContext,
      version: '0.0.0-test',
    });

    assert.deepStrictEqual(manifest, {
      schema_version: 1,
      generated_at: '2026-06-12T10:15:30Z',
      generator: { name: '@mplibunao/introspection', version: '0.0.0-test' },
      repo: { key: 'BP', slug: 'backpressure' },
      records_root: '/repo/docs/records',
      exports: [
        {
          kind: 'json',
          path: 'records.json',
          record_count: exportedRecordCount,
          sha256: 'json-hash',
        },
        {
          kind: 'gno-markdown',
          path: 'gno-markdown',
          record_count: exportedRecordCount,
          sha256: 'gno-hash',
        },
      ],
    });
  });
});
