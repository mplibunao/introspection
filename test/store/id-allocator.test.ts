/* eslint-disable max-lines -- WI-05 keeps allocator, lock-reclaim, and process-concurrency coverage together so the race-test helpers stay local. */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { assert, describe, it } from '@effect/vitest';

import { IntrospectionError } from '../../src/core/errors.js';
import {
  duplicateRecordIdFindings,
  duplicateRecordIdGroups,
  maxRecordNumber,
  nextRecordNumber,
  parseRecordId,
  recordFileName,
  renderRecordId,
} from '../../src/core/id.js';
import type { ParsedRecord } from '../../src/core/record-type-types.js';
import { techDebtRecordType } from '../../src/record-types/tech-debt.js';
import type { TechDebtFrontmatter } from '../../src/record-types/tech-debt-types.js';
import { allocateRecord, lockNameFor, withLocalIdLock } from '../../src/store/id-allocator.js';
import { createMarkdownRecordStore } from '../../src/store/markdown-record-store.js';

import { runAllocatorWorker as runWorker } from './id-allocator-worker-support.js';

const timestamp = '2026-06-10T00:00:00Z';
const expectedParsedNumber = 7;
const highExistingNumber = 7;
const expectedNextNumber = 8;
const parsedIdCandidateNumber = 9;
const nextParsedIdCandidateNumber = 10;
const ignoredOtherRepoNumber = 99;
const ignoredOtherRecordTypeNumber = 100;
const noScannableRecordNumber = 0;
const unsafeRecordNumber = Number.MAX_SAFE_INTEGER + 1;
const zeroRecordNumber = 0;
const fractionalRecordNumber = 1.5;
const unsafeParsedRecordId = `BP-TD-${unsafeRecordNumber}`;
const jsonIndentSpaces = 2;
const workerProcessCount = 2;
const staleReclaimWorkerProcessCount = 4;
const concurrencyTestTimeoutMs = 60_000;
const lockOwnershipTestTimeoutMs = 10_000;
const freshLockStaleAfterMs = 60_000;
const staleReclaimDelayMs = 10;
const workerLockDelayMs = 200;
const releaseRaceWorkerDelayMs = 1_000;
const staleReclaimWorkerDelayMs = 500;
const staleLockTimestamp = '2000-01-01T00:00:00.000Z';

interface IdAllocatorContext {
  readonly locksRoot: string;
  readonly recordsRoot: string;
  readonly repoKey: string;
}

interface AllocatedRecordIdentity {
  readonly id: string;
  readonly number: number;
  readonly relativePath: string;
}

const withTempRoot = async (testBody: (root: string) => Promise<void>): Promise<void> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'introspection-id-'));

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
    'Minimal placeholder summary for the tech-debt record.',
    '## Problem',
    'The allocator needs a valid tech-debt-shaped record.',
    '## Why deferred',
    'This fixture supports the ID allocator tests.',
    '## Revisit trigger',
    'Revisit when the allocator behavior changes.',
  ].join('\n\n'),
): ParsedRecord<TechDebtFrontmatter> => ({
  frontmatter: {
    schema_version: 1,
    id: 'BP-TD-001',
    repo_key: 'BP',
    record_type: 'tech-debt',
    number: 1,
    title: 'Allocator fixture record',
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
          ref: 'docs/exec-plans/tech-debt-tracker.md#td-001',
        },
      ],
    },
    ...frontmatter,
  } as TechDebtFrontmatter,
  body,
});

const recordFromIdentity = (
  identity: AllocatedRecordIdentity,
  title = 'Allocated record',
): ParsedRecord<TechDebtFrontmatter> =>
  techDebtRecord({
    id: identity.id,
    number: identity.number,
    title,
  });

const createExistingRecord = async (
  root: string,
  number: number,
  relativePath?: string,
): Promise<void> => {
  const store = createMarkdownRecordStore({ root });
  const id = renderRecordId({ repoKey: 'BP', typePrefix: 'TD', number });

  await store.createRecord(
    relativePath ?? `tech-debt/open/${recordFileName(id)}`,
    techDebtRecord({ id, number, title: `Existing record ${number}` }),
  );
};

const lockPathFor = (context: IdAllocatorContext): string =>
  path.join(context.locksRoot, lockNameFor(techDebtRecordType));

const adminLockPathFor = (context: IdAllocatorContext): string => `${lockPathFor(context)}.admin`;

const sleep = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const lockExists = async (context: IdAllocatorContext): Promise<boolean> => {
  try {
    await readFile(path.join(lockPathFor(context), 'metadata.json'));
    return true;
  } catch {
    return false;
  }
};

const writeLockMetadataAtPath = async (
  lockPath: string,
  metadata: { readonly pid: number; readonly timestamp: string },
): Promise<void> => {
  await mkdir(lockPath, { recursive: true });
  await writeFile(
    path.join(lockPath, 'metadata.json'),
    `${JSON.stringify(metadata, null, jsonIndentSpaces)}\n`,
  );
};

const writeLockMetadata = async (
  context: IdAllocatorContext,
  metadata: { readonly pid: number; readonly timestamp: string },
): Promise<void> => {
  await writeLockMetadataAtPath(lockPathFor(context), metadata);
};

const writeStaleLockWithoutMetadata = async (context: IdAllocatorContext): Promise<void> => {
  const lockPath = lockPathFor(context);
  const oldTimestamp = new Date(staleLockTimestamp);
  await mkdir(lockPath, { recursive: true });
  await utimes(lockPath, oldTimestamp, oldTimestamp);
};

const deadProcessId = async (): Promise<number> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
    const { pid } = child;

    if (typeof pid !== 'number') {
      reject(new Error('Could not read child process PID.'));
      return;
    }

    child.on('error', reject);
    child.on('close', () => {
      resolve(pid);
    });
  });

describe('WI-05 ID formatting and duplicate validation helpers', () => {
  it('renders and parses zero-padded IDs while leaving wider numbers untruncated', () => {
    assert.strictEqual(renderRecordId({ repoKey: 'BP', typePrefix: 'TD', number: 7 }), 'BP-TD-007');
    assert.strictEqual(
      renderRecordId({ repoKey: 'BP', typePrefix: 'TD', number: 1000 }),
      'BP-TD-1000',
    );
    assert.deepStrictEqual(parseRecordId('BP-TD-007', 'BP', 'TD')?.number, expectedParsedNumber);
    assert.strictEqual(parseRecordId('BP-TD-1', 'BP', 'TD'), null);
    assert.strictEqual(parseRecordId('BP-TD-000', 'BP', 'TD'), null);
    assert.strictEqual(parseRecordId(unsafeParsedRecordId, 'BP', 'TD'), null);
    assert.throws(
      () => renderRecordId({ repoKey: 'BP', typePrefix: 'TD', number: zeroRecordNumber }),
      /positive integers/u,
    );
    assert.throws(
      () => renderRecordId({ repoKey: 'BP', typePrefix: 'TD', number: fractionalRecordNumber }),
      /positive integers/u,
    );
  });

  it('returns service-level validation findings for duplicate record IDs', () => {
    const duplicateWithNumericRelativePath = {
      ...techDebtRecord({ id: 'BP-TD-007', number: 7, title: 'Duplicate ID fallback' }),
      path: '/repo/docs/records/tech-debt/open/fallback.md',
      relativePath: zeroRecordNumber,
    };
    const records = [
      {
        ...techDebtRecord({ id: 'BP-TD-007', number: 7 }),
        relativePath: 'tech-debt/open/bp-td-007.md',
      },
      {
        ...techDebtRecord({ id: 'BP-TD-007', number: 7, title: 'Duplicate ID' }),
        path: '/repo/docs/records/tech-debt/open/duplicate.md',
      },
      duplicateWithNumericRelativePath,
      techDebtRecord({ id: 'BP-TD-008', number: 8 }),
    ];

    const groups = duplicateRecordIdGroups(records);
    const findings = duplicateRecordIdFindings(records);

    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0]?.id, 'BP-TD-007');
    assert.strictEqual(findings.length, 1);
    assert.deepStrictEqual(findings[0], {
      code: 'id.duplicate',
      severity: 'error',
      message: 'Record ID "BP-TD-007" appears in 3 records.',
      path: ['id', 'BP-TD-007'],
      remediation:
        'Repair one duplicate before validation can pass. Duplicate locations: tech-debt/open/bp-td-007.md, /repo/docs/records/tech-debt/open/duplicate.md, /repo/docs/records/tech-debt/open/fallback.md.',
    });
  });
});

describe('WI-20 ID scan mutation coverage', () => {
  it('scans next numbers only from matching repo/type records and valid ID candidates', () => {
    const otherRecordTypeRecord: ParsedRecord = {
      ...techDebtRecord({ id: 'BP-CF-100', number: ignoredOtherRecordTypeNumber }),
      frontmatter: {
        ...techDebtRecord({ id: 'BP-CF-100', number: ignoredOtherRecordTypeNumber }).frontmatter,
        record_type: 'conversion-fixture',
      },
    };
    const records = [
      techDebtRecord({ id: 'not-a-record-id', number: expectedParsedNumber }),
      techDebtRecord({
        id: renderRecordId({ repoKey: 'BP', typePrefix: 'TD', number: parsedIdCandidateNumber }),
        number: expectedParsedNumber,
      }),
      techDebtRecord({ id: 'OTHER-TD-099', number: ignoredOtherRepoNumber, repo_key: 'OTHER' }),
      otherRecordTypeRecord,
    ];

    assert.strictEqual(
      nextRecordNumber(records, { repoKey: 'BP', recordType: techDebtRecordType }),
      nextParsedIdCandidateNumber,
    );
  });

  it('ignores unsafe numeric frontmatter when scanning record numbers', () => {
    assert.strictEqual(
      maxRecordNumber([techDebtRecord({ id: 'not-a-record-id', number: unsafeRecordNumber })], {
        repoKey: 'BP',
        recordType: techDebtRecordType,
      }),
      noScannableRecordNumber,
    );
  });
});

describe('WI-05 lock-backed ID allocation', () => {
  it('rejects record factories that change the assigned ID or number', async () => {
    await withTempRoot(async (root) => {
      const context = contextFor(root);

      try {
        await allocateRecord({
          context,
          makeRecord: (identity) =>
            recordFromIdentity({
              ...identity,
              id: 'BP-TD-999',
            }),
          recordType: techDebtRecordType,
        });
        assert.fail('Expected allocator identity preservation to fail.');
      } catch (error) {
        assert.ok(error instanceof IntrospectionError);
        assert.strictEqual(error.code, 'id_allocator.identity_mismatch');
        assert.deepStrictEqual(error.details?.['actual'], { id: 'BP-TD-999', number: 1 });
        assert.deepStrictEqual(error.details?.['expected'], {
          id: 'BP-TD-001',
          number: 1,
          relativePath: 'tech-debt/open/bp-td-001.md',
        });
      }
    });
  });

  it('scans existing records, preserves gaps, and allocates max plus one under the lock', async () => {
    await withTempRoot(async (root) => {
      const context = contextFor(root);
      await createExistingRecord(context.recordsRoot, 1);
      await createExistingRecord(context.recordsRoot, highExistingNumber);

      const result = await allocateRecord({
        context,
        makeRecord: (identity) => recordFromIdentity(identity, 'Allocated after gap'),
        recordType: techDebtRecordType,
      });

      assert.strictEqual(result.identity.number, expectedNextNumber);
      assert.strictEqual(result.identity.id, 'BP-TD-008');
      assert.strictEqual(result.identity.relativePath, 'tech-debt/open/bp-td-008.md');
      assert.strictEqual(result.record.frontmatter.id, 'BP-TD-008');
    });
  });
});

const pidFromLockMetadata = (source: string): number | null => {
  const value: unknown = JSON.parse(source);

  if (
    typeof value === 'object' &&
    value !== null &&
    'pid' in value &&
    typeof value.pid === 'number'
  ) {
    return value.pid;
  }

  return null;
};

const lockOwnerPid = async (context: IdAllocatorContext): Promise<number | null> => {
  try {
    return pidFromLockMetadata(
      await readFile(path.join(lockPathFor(context), 'metadata.json'), 'utf8'),
    );
  } catch {
    return null;
  }
};

const waitForSubprocessLockOwner = async (context: IdAllocatorContext): Promise<void> => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < concurrencyTestTimeoutMs) {
    const ownerPid = await lockOwnerPid(context);

    if (ownerPid !== null && ownerPid !== process.pid) {
      return;
    }

    await sleep(staleReclaimDelayMs);
  }

  assert.fail('Timed out waiting for subprocess to acquire allocator lock.');
};

const controlledFirstOwner = (
  context: IdAllocatorContext,
): { readonly done: Promise<unknown>; readonly release: () => void } => {
  let release = (): void => {
    throw new Error('Release callback was used before initialization.');
  };
  const canRelease = new Promise<void>((resolve) => {
    release = resolve;
  });
  const done = withLocalIdLock(context, techDebtRecordType, async () => canRelease, {
    staleAfterMs: 1,
  });

  return { done, release };
};

const startReleaseRaceWorker = async (context: IdAllocatorContext): Promise<unknown> =>
  runWorker({
    delayMs: releaseRaceWorkerDelayMs,
    locksRoot: context.locksRoot,
    recordsRoot: context.recordsRoot,
    staleAfterMs: 1,
    workerId: 'release-race',
  });

const runOwnerSafeReclaimScenario = async (context: IdAllocatorContext): Promise<void> => {
  const firstOwner = controlledFirstOwner(context);
  await sleep(staleReclaimDelayMs);
  const secondOwner = startReleaseRaceWorker(context);

  await waitForSubprocessLockOwner(context);
  firstOwner.release();
  await firstOwner.done;
  assert.strictEqual(await lockExists(context), true);
  await secondOwner;
  assert.strictEqual(await lockExists(context), false);
};

describe('WI-05 ID allocation lock reclaim', () => {
  it('reclaims stale locks whose PID is still alive', async () => {
    await withTempRoot(async (root) => {
      const context = contextFor(root);
      await writeLockMetadata(context, {
        pid: process.pid,
        timestamp: staleLockTimestamp,
      });

      const result = await allocateRecord({
        context,
        lock: { staleAfterMs: 1 },
        makeRecord: (identity) => recordFromIdentity(identity, 'Stale lock reclaimed'),
        recordType: techDebtRecordType,
      });

      assert.strictEqual(result.identity.id, 'BP-TD-001');
    });
  });

  it('reclaims stale lock directories when a crash left no metadata', async () => {
    await withTempRoot(async (root) => {
      const context = contextFor(root);
      await writeStaleLockWithoutMetadata(context);

      const result = await allocateRecord({
        context,
        lock: { staleAfterMs: 1 },
        makeRecord: (identity) => recordFromIdentity(identity, 'Metadata-free lock reclaimed'),
        recordType: techDebtRecordType,
      });

      assert.strictEqual(result.identity.id, 'BP-TD-001');
    });
  });

  it('reclaims stale admin mutexes before canonical lock acquisition', async () => {
    await withTempRoot(async (root) => {
      const context = contextFor(root);
      await writeLockMetadataAtPath(adminLockPathFor(context), {
        pid: process.pid,
        timestamp: staleLockTimestamp,
      });

      const result = await allocateRecord({
        context,
        lock: { staleAfterMs: 1 },
        makeRecord: (identity) => recordFromIdentity(identity, 'Stale admin lock reclaimed'),
        recordType: techDebtRecordType,
      });

      assert.strictEqual(result.identity.id, 'BP-TD-001');
    });
  });

  it('reclaims dead-process locks before the stale timeout', async () => {
    await withTempRoot(async (root) => {
      const context = contextFor(root);
      await writeLockMetadata(context, {
        pid: await deadProcessId(),
        timestamp: new Date().toISOString(),
      });

      const result = await allocateRecord({
        context,
        lock: { staleAfterMs: freshLockStaleAfterMs },
        makeRecord: (identity) => recordFromIdentity(identity, 'Dead lock reclaimed'),
        recordType: techDebtRecordType,
      });

      assert.strictEqual(result.identity.id, 'BP-TD-001');
    });
  });
});

describe('WI-05 ID allocation lock ownership', () => {
  it(
    'does not let a stale-reclaimed live holder remove the new owner lock',
    async () => {
      await withTempRoot(async (root) => {
        await runOwnerSafeReclaimScenario(contextFor(root));
      });
    },
    lockOwnershipTestTimeoutMs,
  );
});

const assertTwoProcessAllocation = async (context: IdAllocatorContext): Promise<void> => {
  const results = await Promise.all([
    runWorker({
      delayMs: workerLockDelayMs,
      locksRoot: context.locksRoot,
      recordsRoot: context.recordsRoot,
      workerId: 'one',
    }),
    runWorker({
      delayMs: workerLockDelayMs,
      locksRoot: context.locksRoot,
      recordsRoot: context.recordsRoot,
      workerId: 'two',
    }),
  ]);
  const store = createMarkdownRecordStore({ root: context.recordsRoot });
  const ids = (await store.listRecords()).map((record) => record.frontmatter.id).sort();

  assert.strictEqual(results.length, workerProcessCount);
  assert.deepStrictEqual(ids, ['BP-TD-001', 'BP-TD-002']);
};

const staleReclaimWorkerIds = (): ReadonlyArray<string> =>
  Array.from({ length: staleReclaimWorkerProcessCount }, (unused, index) => `stale-${index + 1}`);

const expectedStaleReclaimIds = (): ReadonlyArray<string> =>
  Array.from({ length: staleReclaimWorkerProcessCount }, (unused, index) =>
    renderRecordId({ repoKey: 'BP', typePrefix: 'TD', number: index + 1 }),
  );

const assertMultiProcessStaleReclaimAllocation = async (
  context: IdAllocatorContext,
): Promise<void> => {
  await writeLockMetadata(context, {
    pid: process.pid,
    timestamp: staleLockTimestamp,
  });

  const workers = staleReclaimWorkerIds().map(async (workerId) =>
    runWorker({
      delayMs: staleReclaimWorkerDelayMs,
      locksRoot: context.locksRoot,
      recordsRoot: context.recordsRoot,
      workerId,
    }),
  );
  const results = await Promise.all(workers);
  const store = createMarkdownRecordStore({ root: context.recordsRoot });
  const ids = (await store.listRecords()).map((record) => record.frontmatter.id).sort();

  assert.strictEqual(results.length, staleReclaimWorkerProcessCount);
  assert.deepStrictEqual(ids, expectedStaleReclaimIds());
  assert.strictEqual(await lockExists(context), false);
};

describe('WI-05 ID allocation process concurrency', () => {
  it(
    'prevents duplicate IDs across two separate OS processes in one worktree',
    async () => {
      await withTempRoot(async (root) => {
        await assertTwoProcessAllocation(contextFor(root));
      });
    },
    concurrencyTestTimeoutMs,
  );

  it(
    'lets OS processes contend for one stale lock without duplicate allocation',
    async () => {
      await withTempRoot(async (root) => {
        await assertMultiProcessStaleReclaimAllocation(contextFor(root));
      });
    },
    concurrencyTestTimeoutMs,
  );
});
