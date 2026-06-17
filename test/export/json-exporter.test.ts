import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { assert, describe, it } from '@effect/vitest';

import { stableJson, writeJsonExport } from '../../src/export/json-exporter.js';
import type { ExportManifest, ExportRecordDocument } from '../../src/export/export-document.js';

const timestamp = '2026-06-12T00:00:00Z';

const withTempRoot = async (testBody: (root: string) => Promise<void>): Promise<void> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'introspection-json-export-'));

  try {
    await testBody(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};

const sha256 = (content: string): string => createHash('sha256').update(content).digest('hex');

const manifest: ExportManifest = {
  schema_version: 1,
  generated_at: timestamp,
  generator: { name: '@mplibunao/introspection', version: '0.0.0' },
  repo: { key: 'BP', slug: 'backpressure' },
  records_root: 'docs/records',
  exports: [{ kind: 'json', path: 'records.json', record_count: 1 }],
};

const record: ExportRecordDocument = {
  schemaVersion: 1,
  id: 'BP-TD-001',
  recordType: 'tech-debt',
  status: 'open',
  title: 'JSON export fixture',
  visibility: 'local-only',
  tags: ['record/tech-debt'],
  frontmatter: {
    schema_version: 1,
    id: 'BP-TD-001',
    repo_key: 'BP',
    record_type: 'tech-debt',
    number: 1,
    title: 'JSON export fixture',
    status: 'open',
    type: 'introspection-record',
    category: 'tech-debt',
    visibility: 'local-only',
    created_at: timestamp,
    updated_at: timestamp,
    tags: ['record/tech-debt'],
  },
  body: 'JSON export fixture body.',
  path: 'tech-debt/open/bp-td-001.md',
};

describe('JSON exporter', () => {
  it('writes stable UTF-8 JSON and returns the output path plus content hash', async () => {
    await withTempRoot(async (root) => {
      const outputPath = path.join(root, 'nested/records.json');
      const result = await writeJsonExport({ manifest, outputPath, records: [record] });
      const content = await readFile(outputPath, 'utf8');

      assert.strictEqual(content, stableJson({ manifest, records: [record] }));
      assert.deepStrictEqual(result, { path: outputPath, sha256: sha256(content) });
    });
  });
});
