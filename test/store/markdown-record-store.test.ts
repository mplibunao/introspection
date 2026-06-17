import { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { assert, describe, it } from '@effect/vitest';

import {
  FrontmatterParseError,
  FrontmatterValidationError,
  RecordStoreError,
  StaleRecordError,
} from '../../src/core/errors.js';
import type { ParsedRecord } from '../../src/core/record-type-types.js';
import type { TechDebtFrontmatter } from '../../src/record-types/tech-debt-types.js';
import { renderMarkdownRecord } from '../../src/store/frontmatter.js';
import { createMarkdownRecordStore, hashRawBytes } from '../../src/store/markdown-record-store.js';

const timestamp = '2026-06-10T00:00:00Z';
const duplicateCreateAttemptCount = Number('2');
const createCollisionPath = 'tech-debt/open/bp-td-007.md';

const withTempRoot = async (testBody: (root: string) => Promise<void>): Promise<void> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'introspection-store-'));

  try {
    await testBody(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};

const techDebtRecord = (
  frontmatter: Partial<TechDebtFrontmatter> = {},
  body = [
    'Minimal placeholder summary for the tech-debt record.',
    '## Problem',
    'The stack-neutral preset work is tracked for a later phase.',
    '## Why deferred',
    'The current phase only needs the record store.',
    '## Revisit trigger',
    'Revisit when the owning feature area changes.',
  ].join('\n\n'),
): ParsedRecord<TechDebtFrontmatter> => ({
  frontmatter: {
    schema_version: 1,
    id: 'BP-TD-007',
    repo_key: 'BP',
    record_type: 'tech-debt',
    number: 7,
    title: 'Future stack-neutral React preset',
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
          kind: 'tracker',
          ref: 'docs/exec-plans/tech-debt-tracker.md#td-007',
        },
      ],
    },
    ...frontmatter,
  } as TechDebtFrontmatter,
  body,
});

const writeRawRecord = async (
  root: string,
  relativePath: string,
  content: string,
): Promise<void> => {
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
};

const assertRejectsWith = async <ErrorType extends Error>(
  promise: Promise<unknown>,
  errorConstructor: new (...args: Array<never>) => ErrorType,
): Promise<ErrorType> => {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof errorConstructor);

    return error;
  }

  assert.fail(`Expected promise to reject with ${errorConstructor.name}.`);
};

describe('markdown record store operations', () => {
  it('creates, reads, lists, and updates markdown records with raw-byte hashes', async () => {
    await withTempRoot(async (root) => {
      const store = createMarkdownRecordStore({ root });
      const created = await store.createRecord('tech-debt/open/bp-td-007.md', techDebtRecord());

      assert.strictEqual(created.relativePath, 'tech-debt/open/bp-td-007.md');
      assert.strictEqual(created.frontmatter.id, 'BP-TD-007');
      assert.strictEqual(created.hash, hashRawBytes(created.rawBytes));

      const listed = await store.listRecords();
      assert.deepStrictEqual(
        listed.map((record) => record.relativePath),
        ['tech-debt/open/bp-td-007.md'],
      );

      const updated = await store.updateRecord(created, (record) => ({
        ...record,
        frontmatter: {
          ...record.frontmatter,
          title: 'Updated React preset debt',
          updated_at: '2026-06-11T00:00:00Z',
        },
        body: `${record.body}\n\n## Done when\nThe store update path is covered by tests.`,
      }));

      assert.strictEqual(updated.frontmatter.title, 'Updated React preset debt');
      assert.match(updated.body, /## Done when/u);
    });
  });

  it('creates and moves records directly under the records root', async () => {
    await withTempRoot(async (root) => {
      const store = createMarkdownRecordStore({ root });
      const created = await store.createRecord('bp-td-007.md', techDebtRecord());
      const moved = await store.moveRecord(created, 'bp-td-008.md');

      assert.strictEqual(created.relativePath, 'bp-td-007.md');
      assert.strictEqual(moved.relativePath, 'bp-td-008.md');
      assert.deepStrictEqual(
        (await store.listRecords()).map((record) => record.relativePath),
        ['bp-td-008.md'],
      );
    });
  });

  it('creates the first record when the records root does not exist yet', async () => {
    await withTempRoot(async (parentRoot) => {
      const missingRoot = path.join(parentRoot, 'records');
      const store = createMarkdownRecordStore({ root: missingRoot });
      const created = await store.createRecord('bp-td-007.md', techDebtRecord());
      const content = await readFile(path.join(missingRoot, 'bp-td-007.md'), 'utf8');

      assert.strictEqual(created.relativePath, 'bp-td-007.md');
      assert.match(content, /BP-TD-007/u);
    });
  });

  it('moves records and archives them under the record-type archive directory', async () => {
    await withTempRoot(async (root) => {
      const store = createMarkdownRecordStore({ root });
      const created = await store.createRecord('tech-debt/open/bp-td-007.md', techDebtRecord());
      const moved = await store.moveRecord(created, 'tech-debt/open/bp-td-008.md');
      const archived = await store.archiveRecord(moved);

      assert.strictEqual(moved.relativePath, 'tech-debt/open/bp-td-008.md');
      assert.strictEqual(archived.relativePath, 'tech-debt/archive/bp-td-008.md');
      assert.deepStrictEqual(
        (await store.listRecords()).map((record) => record.relativePath),
        ['tech-debt/archive/bp-td-008.md'],
      );
    });
  });
});

const fulfilledResults = <Result>(
  results: ReadonlyArray<PromiseSettledResult<Result>>,
): Array<PromiseFulfilledResult<Result>> =>
  results.filter(
    (result): result is PromiseFulfilledResult<Result> => result.status === 'fulfilled',
  );

const rejectedResults = <Result>(
  results: ReadonlyArray<PromiseSettledResult<Result>>,
): Array<PromiseRejectedResult> =>
  results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');

const rejectedReasonCode = (result: PromiseRejectedResult | undefined): unknown => {
  if (typeof result?.reason === 'object' && result.reason !== null && 'code' in result.reason) {
    return result.reason.code;
  }

  return null;
};

const assertCreateCollisionOutcome = async (
  root: string,
  results: ReadonlyArray<PromiseSettledResult<unknown>>,
): Promise<void> => {
  const fulfilled = fulfilledResults(results);
  const rejected = rejectedResults(results);
  const finalContent = await readFile(path.join(root, createCollisionPath), 'utf8');

  assert.strictEqual(results.length, duplicateCreateAttemptCount);
  assert.strictEqual(fulfilled.length, 1);
  assert.strictEqual(rejected.length, 1);
  assert.strictEqual(rejectedReasonCode(rejected[0]), 'record_store.record_exists');
  assert.match(finalContent, /Future stack-neutral React preset|Colliding writer/u);
  assert.ok(!/Future stack-neutral React preset[\s\S]*Colliding writer/u.test(finalContent));
};

describe('markdown record store create and update safety', () => {
  it('uses no-clobber final-target semantics for create collisions in one process', async () => {
    await withTempRoot(async (root) => {
      const store = createMarkdownRecordStore({ root });
      const results = await Promise.allSettled([
        store.createRecord(createCollisionPath, techDebtRecord()),
        store.createRecord(createCollisionPath, techDebtRecord({ title: 'Colliding writer' })),
      ]);

      await assertCreateCollisionOutcome(root, results);
    });
  });

  it('aborts updates when another writer changed the raw bytes after read', async () => {
    await withTempRoot(async (root) => {
      const store = createMarkdownRecordStore({ root });
      const created = await store.createRecord('tech-debt/open/bp-td-007.md', techDebtRecord());
      const otherWriterRecord = techDebtRecord(
        { title: 'Other writer changed this record' },
        'A concurrent writer changed the raw bytes.',
      );

      await writeFile(created.absolutePath, renderMarkdownRecord(otherWriterRecord));

      await assertRejectsWith(
        store.updateRecord(created, (record) => ({
          ...record,
          body: 'This stale update must not overwrite the other writer.',
        })),
        StaleRecordError,
      );

      const currentContent = await readFile(created.absolutePath, 'utf8');
      assert.match(currentContent, /Other writer changed this record/u);
      assert.ok(!/stale update/u.test(currentContent));
    });
  });
});

describe('markdown record store path and write observations', () => {
  it('rejects writes through symlinked directories inside the records root', async () => {
    await withTempRoot(async (root) => {
      const outsideRoot = await mkdtemp(path.join(os.tmpdir(), 'introspection-outside-'));

      try {
        const store = createMarkdownRecordStore({ root });
        await mkdir(path.join(root, 'tech-debt'), { recursive: true });
        await symlink(outsideRoot, path.join(root, 'tech-debt/open'), 'dir');

        const error = await assertRejectsWith(
          store.createRecord('tech-debt/open/escape.md', techDebtRecord()),
          RecordStoreError,
        );
        const outsideEntries = await readdir(outsideRoot);

        assert.strictEqual(error.code, 'record_store.path_outside_root');
        assert.deepStrictEqual(outsideEntries, []);
      } finally {
        await rm(outsideRoot, { force: true, recursive: true });
      }
    });
  });

  it('does not create nested directories through a symlinked records-root segment', async () => {
    await withTempRoot(async (root) => {
      const outsideRoot = await mkdtemp(path.join(os.tmpdir(), 'introspection-outside-'));

      try {
        const store = createMarkdownRecordStore({ root });
        await mkdir(path.join(root, 'tech-debt'), { recursive: true });
        await symlink(outsideRoot, path.join(root, 'tech-debt/open'), 'dir');

        const error = await assertRejectsWith(
          store.createRecord('tech-debt/open/nested/escape.md', techDebtRecord()),
          RecordStoreError,
        );
        const outsideEntries = await readdir(outsideRoot);

        assert.strictEqual(error.code, 'record_store.path_outside_root');
        assert.ok(!outsideEntries.includes('nested'));
      } finally {
        await rm(outsideRoot, { force: true, recursive: true });
      }
    });
  });

  it('cleans up temp files and leaves complete final content after successful atomic writes', async () => {
    await withTempRoot(async (root) => {
      const store = createMarkdownRecordStore({ root });
      const created = await store.createRecord('tech-debt/open/bp-td-007.md', techDebtRecord());
      const directoryEntries = await readdir(path.dirname(created.absolutePath));
      const finalContent = await readFile(created.absolutePath, 'utf8');

      assert.ok(!directoryEntries.some((entry) => entry.endsWith('.tmp')));
      assert.match(finalContent, /^---\n/u);
      assert.match(finalContent, /## Revisit trigger/u);
      assert.match(finalContent, /Revisit when the owning feature area changes\./u);
    });
  });
});

describe('markdown frontmatter parser read failures', () => {
  it('accepts records with a leading UTF-8 BOM before frontmatter', async () => {
    await withTempRoot(async (root) => {
      const store = createMarkdownRecordStore({ root });
      await writeRawRecord(
        root,
        'tech-debt/open/bom.md',
        `\uFEFF${renderMarkdownRecord(techDebtRecord())}`,
      );

      const record = await store.readRecord('tech-debt/open/bom.md');

      assert.strictEqual(record.frontmatter.id, 'BP-TD-007');
    });
  });

  it('rejects malformed frontmatter YAML', async () => {
    await withTempRoot(async (root) => {
      const store = createMarkdownRecordStore({ root });
      await writeRawRecord(
        root,
        'tech-debt/open/bad.md',
        ['---', 'title: [unterminated', '---', 'Body'].join('\n'),
      );

      await assertRejectsWith(store.readRecord('tech-debt/open/bad.md'), FrontmatterParseError);

      const result = await store.readRecordResult('tech-debt/open/bad.md');
      assert.strictEqual(result.ok, false);

      if (!result.ok) {
        assert.strictEqual(result.code, 'frontmatter.parse_error');
      }
    });
  });

  it('rejects records missing required frontmatter fields', async () => {
    await withTempRoot(async (root) => {
      const store = createMarkdownRecordStore({ root });
      await writeRawRecord(
        root,
        'tech-debt/open/missing.md',
        [
          '---',
          'schema_version: 1',
          'id: BP-TD-007',
          'repo_key: BP',
          'record_type: tech-debt',
          'number: 7',
          'title: Missing status field',
          'type: introspection-record',
          'category: tech-debt',
          'visibility: local-only',
          `created_at: "${timestamp}"`,
          `updated_at: "${timestamp}"`,
          'tags: [record/tech-debt]',
          '---',
          'Body',
        ].join('\n'),
      );

      await assertRejectsWith(
        store.readRecord('tech-debt/open/missing.md'),
        FrontmatterValidationError,
      );

      const result = await store.readRecordResult('tech-debt/open/missing.md');
      assert.strictEqual(result.ok, false);

      if (!result.ok) {
        assert.strictEqual(result.code, 'frontmatter.validation_error');
      }
    });
  });
});

describe('markdown frontmatter parser corpus results', () => {
  it('returns per-file read results instead of aborting a mixed corpus scan', async () => {
    await withTempRoot(async (root) => {
      const store = createMarkdownRecordStore({ root });
      await store.createRecord('tech-debt/open/bp-td-007.md', techDebtRecord());
      await writeRawRecord(
        root,
        'tech-debt/open/bad.md',
        ['---', 'title: [unterminated', '---', 'Body'].join('\n'),
      );

      const results = await store.listRecordResults();
      const successes = results.filter((result) => result.ok);
      const failures = results.filter((result) => !result.ok);

      assert.strictEqual(successes.length, 1);
      assert.strictEqual(failures.length, 1);
    });
  });
});
