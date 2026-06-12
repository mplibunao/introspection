/* eslint-disable max-statements, no-magic-numbers -- Regression fixtures use fixed record IDs and artifact assertions to prove path and hash behavior. */
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { assert, describe, it } from '@effect/vitest';

import type { ParsedRecord } from '../../src/core/record-type-types.js';
import type { ExportRecordDocument } from '../../src/export/export-document.js';
import { writeGnoProjection } from '../../src/export/gno-exporter.js';
import type { TechDebtFrontmatter } from '../../src/record-types/tech-debt-types.js';

const timestamp = '2026-06-01T00:00:00Z';

const withTempRoot = async (testBody: (root: string) => Promise<void>): Promise<void> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'introspection-gno-export-'));

  try {
    await testBody(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
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
    tags: ['record/tech-debt', 'repo/backpressure', 'status/open', 'visibility/local-only'],
  },
  body: [
    `${title} summary.`,
    '## Problem',
    'GNO projections need safe paths.',
    '## Why deferred',
    'The projection writer is tested directly.',
    '## Revisit trigger',
    'Revisit when GNO projection paths change.',
  ].join('\n\n'),
});

const exportRecord = (
  record: ParsedRecord<TechDebtFrontmatter>,
  sourcePath: string,
): ExportRecordDocument => ({
  schemaVersion: 1,
  id: record.frontmatter.id,
  recordType: record.frontmatter.record_type,
  status: record.frontmatter.status,
  title: record.frontmatter.title,
  visibility: record.frontmatter.visibility,
  tags: record.frontmatter.tags,
  frontmatter: record.frontmatter,
  body: record.body,
  path: sourcePath,
});

const unsafeProjectionRecord = (): ExportRecordDocument => {
  const record = techDebtRecord(999, 'Unsafe projection');

  return {
    ...exportRecord(record, 'tech-debt/open/bp-td-999.md'),
    status: '../../outside',
    frontmatter: { ...record.frontmatter, status: '../../outside' },
  };
};

const sharedBasenameExportRecord = (
  number: number,
  title: string,
  sourcePath: string,
): ExportRecordDocument => exportRecord(techDebtRecord(number, title), sourcePath);

const sha256 = (content: string): string => createHash('sha256').update(content).digest('hex');

const pathExists = async (candidatePath: string): Promise<boolean> => {
  try {
    await access(candidatePath);

    return true;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
};

const assertRejectsWithMessage = async (
  promise: Promise<unknown>,
  messagePattern: RegExp,
): Promise<void> => {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.match(error.message, messagePattern);

    return;
  }

  assert.fail('Expected promise to reject.');
};

describe('WI-11 GNO exporter path safety', () => {
  it('rejects unsafe projection path components without writing outside the projection root', async () => {
    await withTempRoot(async (root) => {
      const outputDirectory = path.join(root, 'generated/gno-markdown');
      const outsidePath = path.join(root, 'generated/outside/bp-td-999.md');

      await mkdir(path.dirname(outputDirectory), { recursive: true });
      await assertRejectsWithMessage(
        writeGnoProjection({ outputDirectory, records: [unsafeProjectionRecord()] }),
        /GNO projection path component is not safe/u,
      );
      assert.strictEqual(await pathExists(outsidePath), false);
    });
  });

  it('uses canonical record IDs as projection filenames so shared source basenames do not collide', async () => {
    await withTempRoot(async (root) => {
      const outputDirectory = path.join(root, 'generated/gno-markdown');
      const first = sharedBasenameExportRecord(101, 'First shared basename', 'one/shared.md');
      const second = sharedBasenameExportRecord(102, 'Second shared basename', 'two/shared.md');

      const result = await writeGnoProjection({ outputDirectory, records: [first, second] });
      const firstPath = path.join(outputDirectory, 'tech-debt/open/bp-td-101.md');
      const secondPath = path.join(outputDirectory, 'tech-debt/open/bp-td-102.md');
      const firstContent = await readFile(firstPath, 'utf8');
      const secondContent = await readFile(secondPath, 'utf8');
      const expectedProjectionHash = sha256(
        [
          `tech-debt/open/bp-td-101.md:${sha256(firstContent)}`,
          `tech-debt/open/bp-td-102.md:${sha256(secondContent)}`,
        ].join('\n'),
      );

      assert.strictEqual(await pathExists(firstPath), true);
      assert.strictEqual(await pathExists(secondPath), true);
      assert.match(firstContent, /tags:\n {2}- record\/tech-debt\n {2}- repo\/backpressure/u);
      assert.strictEqual(result.recordCount, 2);
      assert.strictEqual(result.sha256, expectedProjectionHash);
    });
  });
});
