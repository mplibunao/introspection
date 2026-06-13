import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { assert, describe, it } from '@effect/vitest';

import { RecordStoreError } from '../../src/core/errors.js';
import type { ParsedRecord } from '../../src/core/record-type-types.js';
import { techDebtRecordType } from '../../src/record-types/tech-debt.js';
import type { TechDebtFrontmatter } from '../../src/record-types/tech-debt-types.js';
import { repairDuplicateRecordId } from '../../src/store/duplicate-repair-service.js';
import { renderMarkdownRecord } from '../../src/store/frontmatter.js';
import { createMarkdownRecordStore } from '../../src/store/markdown-record-store.js';

type MarkdownRecordStore = ReturnType<typeof createMarkdownRecordStore>;
type StoredMarkdownRecord = Awaited<ReturnType<MarkdownRecordStore['readRecord']>>;

interface IdAllocatorContext {
  readonly locksRoot: string;
  readonly recordsRoot: string;
  readonly repoKey: string;
}

interface DuplicateRepairFixture {
  readonly duplicate: StoredMarkdownRecord;
  readonly outsideRecordRoot: string;
  readonly store: MarkdownRecordStore;
}

interface DuplicateRepairObservation {
  readonly finalIds: ReadonlyArray<string>;
  readonly outsideContent: string;
  readonly originalDuplicate: StoredMarkdownRecord;
  readonly referrer: StoredMarkdownRecord;
  readonly repaired: StoredMarkdownRecord;
  readonly result: Awaited<ReturnType<typeof repairDuplicateRecordId>>;
}

const timestamp = '2026-06-10T00:00:00Z';
const highExistingNumber = 7;
const expectedNextNumber = 8;
const referrerRecordNumber = 6;
const repairOldId = 'BP-TD-007';
const repairOldPath = 'tech-debt/open/duplicate.md';
const repairReferrerPath = 'tech-debt/open/referrer.md';
const secondaryReferrerPath = 'tech-debt/open/z-referrer.md';

const withTempRoot = async (testBody: (root: string) => Promise<void>): Promise<void> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'introspection-repair-'));

  try {
    await testBody(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};

const contextFor = (root: string): IdAllocatorContext => ({
  locksRoot: path.join(root, '.introspection/.locks'),
  recordsRoot: path.join(root, 'docs/records'),
  repoKey: 'BP',
});

const techDebtRecord = (
  frontmatter: Partial<TechDebtFrontmatter> = {},
  body = [
    'Minimal placeholder summary for duplicate repair.',
    '## Problem',
    'The repair service needs a valid tech-debt-shaped record.',
    '## Why deferred',
    'This fixture supports duplicate repair tests.',
    '## Revisit trigger',
    'Revisit when repair behavior changes.',
  ].join('\n\n'),
): ParsedRecord<TechDebtFrontmatter> => ({
  frontmatter: {
    schema_version: 1,
    id: 'BP-TD-001',
    repo_key: 'BP',
    record_type: 'tech-debt',
    number: 1,
    title: 'Duplicate repair fixture record',
    status: 'open',
    type: 'introspection-record',
    category: 'tech-debt',
    visibility: 'local-only',
    created_at: timestamp,
    updated_at: timestamp,
    tags: ['record/tech-debt', 'repo/backpressure', 'status/open', 'visibility/local-only'],
    ...frontmatter,
  } as TechDebtFrontmatter,
  body,
});

const duplicateRepairRecord = (): ParsedRecord<TechDebtFrontmatter> =>
  techDebtRecord(
    {
      id: repairOldId,
      number: highExistingNumber,
      title: `Duplicate ${repairOldId} to repair`,
      conversion_targets: [
        {
          kind: 'record',
          ref: repairOldPath,
          rationale: `Freeform rationale keeps ${repairOldPath} unchanged.`,
        },
      ],
      source: {
        discovered_at: timestamp,
        refs: [{ kind: 'record', ref: repairOldId }],
      },
    },
    [
      `Body prose mentions ${repairOldId}.`,
      `Body prose also mentions ${repairOldPath}.`,
      'Those prose mentions must be reported, not rewritten.',
    ].join('\n'),
  );

const referrerRecord = (): ParsedRecord<TechDebtFrontmatter> =>
  techDebtRecord(
    {
      id: 'BP-TD-006',
      number: referrerRecordNumber,
      title: 'Record that references the duplicate',
      conversion_targets: [
        {
          kind: 'record',
          ref: repairOldPath,
          rationale: 'Exercises cross-record path repair.',
        },
      ],
      source: {
        discovered_at: timestamp,
        refs: [{ kind: 'record', ref: repairOldId }],
      },
    },
    [`Referrer body keeps ${repairOldId} as prose.`].join('\n'),
  );

const secondaryReferrerRecord = (): ParsedRecord<TechDebtFrontmatter> =>
  techDebtRecord({
    id: 'BP-TD-004',
    number: 4,
    title: 'Second record that references the duplicate',
    conversion_targets: [
      {
        kind: 'record',
        ref: repairOldPath,
        rationale: 'Exercises partial repair failure handling.',
      },
    ],
    source: {
      discovered_at: timestamp,
      refs: [{ kind: 'record', ref: repairOldId }],
    },
  });

const createDuplicateRepairFixture = async (root: string): Promise<DuplicateRepairFixture> => {
  const context = contextFor(root);
  const store = createMarkdownRecordStore({ root: context.recordsRoot });
  const outsideRecordRoot = path.join(root, 'docs/not-records.md');
  await mkdir(path.dirname(outsideRecordRoot), { recursive: true });
  await writeFile(outsideRecordRoot, `Outside prose keeps ${repairOldId}.\n`);
  await store.createRecord(
    'tech-debt/open/bp-td-007.md',
    techDebtRecord({ id: repairOldId, number: highExistingNumber, title: 'Original duplicate' }),
  );
  await store.createRecord(repairReferrerPath, referrerRecord());
  const duplicate = await store.createRecord(repairOldPath, duplicateRepairRecord());

  return { duplicate, outsideRecordRoot, store };
};

const errorCodeFrom = (error: unknown): unknown => {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return error.code;
  }

  return null;
};

const assertRejectsWithCode = async (promise: Promise<unknown>, code: string): Promise<void> => {
  try {
    await promise;
  } catch (error) {
    assert.strictEqual(errorCodeFrom(error), code);
    return;
  }

  assert.fail(`Expected promise to reject with code ${code}.`);
};

const runDuplicateRepairFixture = async (root: string): Promise<DuplicateRepairObservation> => {
  const context = contextFor(root);
  const { duplicate, outsideRecordRoot, store } = await createDuplicateRepairFixture(root);
  const result = await repairDuplicateRecordId({
    context,
    record: duplicate,
    recordType: techDebtRecordType,
    store,
  });
  const repaired = await store.readRecord(result.newPath);
  const referrer = await store.readRecord(repairReferrerPath);
  const originalDuplicate = await store.readRecord('tech-debt/open/bp-td-007.md');
  const finalIds = (await store.listRecords()).map((record) => record.frontmatter.id).sort();
  const outsideContent = await readFile(outsideRecordRoot, 'utf8');

  return { finalIds, originalDuplicate, outsideContent, referrer, repaired, result };
};

const assertRepairIdentity = ({ repaired, result }: DuplicateRepairObservation): void => {
  assert.strictEqual(result.oldId, repairOldId);
  assert.strictEqual(result.newId, 'BP-TD-008');
  assert.strictEqual(result.newPath, 'tech-debt/open/bp-td-008.md');
  assert.strictEqual(repaired.frontmatter.id, 'BP-TD-008');
  assert.strictEqual(repaired.frontmatter.number, expectedNextNumber);
};

const assertRepairStructuredRefs = ({
  finalIds,
  originalDuplicate,
  referrer,
  repaired,
}: DuplicateRepairObservation): void => {
  assert.strictEqual(originalDuplicate.frontmatter.id, repairOldId);
  assert.strictEqual(repaired.frontmatter.source?.refs[0]?.ref, 'BP-TD-008');
  assert.strictEqual(
    repaired.frontmatter.conversion_targets?.[0]?.ref,
    'tech-debt/open/bp-td-008.md',
  );
  assert.strictEqual(referrer.frontmatter.source?.refs[0]?.ref, 'BP-TD-008');
  assert.strictEqual(
    referrer.frontmatter.conversion_targets?.[0]?.ref,
    'tech-debt/open/bp-td-008.md',
  );
  assert.deepStrictEqual(finalIds, ['BP-TD-006', 'BP-TD-007', 'BP-TD-008']);
  assert.strictEqual(new Set(finalIds).size, finalIds.length);
};

const assertRepairFreeformHandling = ({
  outsideContent,
  repaired,
  result,
}: DuplicateRepairObservation): void => {
  assert.match(repaired.frontmatter.title, /BP-TD-007/u);
  assert.match(repaired.frontmatter.conversion_targets?.[0]?.rationale ?? '', /duplicate\.md/u);
  assert.match(repaired.body, /BP-TD-007/u);
  assert.match(repaired.body, /tech-debt\/open\/duplicate\.md/u);
  assert.deepStrictEqual(
    result.bodyOccurrences.map((occurrence) => occurrence.value).sort(),
    [repairOldId, repairOldId, repairOldPath].sort(),
  );
  assert.deepStrictEqual(
    result.bodyOccurrences.map((occurrence) => occurrence.recordPath).sort(),
    [repairOldPath, repairOldPath, repairReferrerPath].sort(),
  );
  assert.strictEqual(outsideContent, `Outside prose keeps ${repairOldId}.\n`);
};

const createRepairTargetCollision = async (store: MarkdownRecordStore): Promise<void> => {
  await store.createRecord(
    'tech-debt/open/bp-td-008.md',
    techDebtRecord({ id: 'BP-TD-005', number: 5, title: 'Existing path collision' }),
  );
};

const recordIds = async (store: MarkdownRecordStore): Promise<ReadonlyArray<string>> =>
  (await store.listRecords()).map((record) => record.frontmatter.id).sort();

const createStoreWithFailingUpdate = (
  store: MarkdownRecordStore,
  failedPath: string,
): MarkdownRecordStore => ({
  ...store,
  updateRecord: async (record, update): Promise<StoredMarkdownRecord> => {
    if (record.relativePath === failedPath) {
      throw new RecordStoreError(
        'test.injected_update_failure',
        'Injected update failure for partial repair safety coverage.',
      );
    }

    return store.updateRecord(record, update);
  },
});

const registerSuccessfulRepairTest = (): void => {
  it('renumbers one duplicate, updates structured refs, and only reports body prose occurrences', async () => {
    await withTempRoot(async (root) => {
      const observation = await runDuplicateRepairFixture(root);

      assertRepairIdentity(observation);
      assertRepairStructuredRefs(observation);
      assertRepairFreeformHandling(observation);
    });
  });
};

const registerConflictSafetyTests = (): void => {
  it('leaves the original duplicate unchanged when the repaired target path already exists', async () => {
    await withTempRoot(async (root) => {
      const context = contextFor(root);
      const { duplicate, store } = await createDuplicateRepairFixture(root);
      await createRepairTargetCollision(store);

      await assertRejectsWithCode(
        repairDuplicateRecordId({
          context,
          record: duplicate,
          recordType: techDebtRecordType,
          store,
        }),
        'record_store.record_exists',
      );

      const unchangedDuplicate = await store.readRecord(repairOldPath);
      const unchangedReferrer = await store.readRecord(repairReferrerPath);
      assert.strictEqual(unchangedDuplicate.frontmatter.id, repairOldId);
      assert.strictEqual(unchangedReferrer.frontmatter.source?.refs[0]?.ref, repairOldId);
    });
  });

  it('rejects stale original records before creating the repaired target', async () => {
    await withTempRoot(async (root) => {
      const context = contextFor(root);
      const { duplicate, store } = await createDuplicateRepairFixture(root);
      await writeFile(
        duplicate.absolutePath,
        renderMarkdownRecord(
          techDebtRecord({
            id: repairOldId,
            number: highExistingNumber,
            title: 'Changed duplicate',
          }),
        ),
      );

      await assertRejectsWithCode(
        repairDuplicateRecordId({
          context,
          record: duplicate,
          recordType: techDebtRecordType,
          store,
        }),
        'record_store.stale_record',
      );

      const ids = await recordIds(store);
      assert.deepStrictEqual(ids, ['BP-TD-006', 'BP-TD-007', 'BP-TD-007']);
      assert.ok(!ids.includes('BP-TD-008'));
    });
  });
};

const assertPartialRepairFailureState = async (store: MarkdownRecordStore): Promise<void> => {
  const repaired = await store.readRecord('tech-debt/open/bp-td-008.md');
  const firstReferrer = await store.readRecord(repairReferrerPath);
  const secondReferrer = await store.readRecord(secondaryReferrerPath);
  const original = await store.readRecord(repairOldPath);

  assert.strictEqual(repaired.frontmatter.id, 'BP-TD-008');
  assert.strictEqual(firstReferrer.frontmatter.source?.refs[0]?.ref, 'BP-TD-008');
  assert.strictEqual(secondReferrer.frontmatter.source?.refs[0]?.ref, repairOldId);
  assert.strictEqual(original.frontmatter.id, repairOldId);
};

const registerPartialRepairSafetyTests = (): void => {
  it('keeps the repaired target when a later structured ref update fails', async () => {
    await withTempRoot(async (root) => {
      const context = contextFor(root);
      const { duplicate, store } = await createDuplicateRepairFixture(root);
      await store.createRecord(secondaryReferrerPath, secondaryReferrerRecord());
      const failingStore = createStoreWithFailingUpdate(store, secondaryReferrerPath);

      await assertRejectsWithCode(
        repairDuplicateRecordId({
          context,
          record: duplicate,
          recordType: techDebtRecordType,
          store: failingStore,
        }),
        'test.injected_update_failure',
      );
      await assertPartialRepairFailureState(store);
    });
  });
};

const registerScopeSafetyTests = (): void => {
  it('rejects a fabricated record whose absolute path is outside the scoped store', async () => {
    await withTempRoot(async (root) => {
      const context = contextFor(root);
      const { duplicate, store } = await createDuplicateRepairFixture(root);
      const outsidePath = path.join(root, 'outside-record.md');
      await writeFile(outsidePath, 'outside file must survive repair rejection\n');

      await assertRejectsWithCode(
        repairDuplicateRecordId({
          context,
          record: { ...duplicate, absolutePath: outsidePath },
          recordType: techDebtRecordType,
          store,
        }),
        'duplicate_repair.record_scope_mismatch',
      );

      assert.strictEqual(
        await readFile(outsidePath, 'utf8'),
        'outside file must survive repair rejection\n',
      );
    });
  });

  it('rejects a caller-supplied store outside the configured records root', async () => {
    await withTempRoot(async (root) => {
      const context = contextFor(root);
      const { duplicate } = await createDuplicateRepairFixture(root);
      const outsideStore = createMarkdownRecordStore({ root: path.join(root, 'outside-records') });

      await assertRejectsWithCode(
        repairDuplicateRecordId({
          context,
          record: duplicate,
          recordType: techDebtRecordType,
          store: outsideStore,
        }),
        'duplicate_repair.store_root_mismatch',
      );
    });
  });
};

const registerDuplicateMembershipTests = (): void => {
  it('rejects repair when the selected record is not part of a duplicate group', async () => {
    await withTempRoot(async (root) => {
      const context = contextFor(root);
      const store = createMarkdownRecordStore({ root: context.recordsRoot });
      const unique = await store.createRecord(
        'tech-debt/open/bp-td-001.md',
        techDebtRecord({ id: 'BP-TD-001', number: 1, title: 'Unique record' }),
      );

      await assertRejectsWithCode(
        repairDuplicateRecordId({ context, record: unique, recordType: techDebtRecordType, store }),
        'duplicate_repair.not_duplicate',
      );
    });
  });
};

describe('duplicate repair service', () => {
  registerSuccessfulRepairTest();
  registerConflictSafetyTests();
  registerPartialRepairSafetyTests();
  registerScopeSafetyTests();
  registerDuplicateMembershipTests();
});
