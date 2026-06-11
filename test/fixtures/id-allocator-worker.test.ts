import { assert, describe, it } from '@effect/vitest';

import type { ParsedRecord } from '../../src/core/record-type-types.js';
import { techDebtRecordType } from '../../src/record-types/tech-debt.js';
import type { TechDebtFrontmatter } from '../../src/record-types/tech-debt-types.js';
import { allocateRecord } from '../../src/store/id-allocator.js';

const timestamp = '2026-06-10T00:00:00Z';
const int32ByteLength = 4;

interface AllocatedRecordIdentity {
  readonly id: string;
  readonly number: number;
  readonly relativePath: string;
}

interface IdAllocatorContext {
  readonly locksRoot: string;
  readonly recordsRoot: string;
  readonly repoKey: string;
}

// This file is primarily a subprocess fixture; without worker env it no-ops under full-suite runs.
const recordsRoot = process.env['INTROSPECTION_ALLOCATOR_WORKER_RECORDS_ROOT'];
const locksRoot = process.env['INTROSPECTION_ALLOCATOR_WORKER_LOCKS_ROOT'];
const workerId = process.env['INTROSPECTION_ALLOCATOR_WORKER_ID'] ?? 'standalone';
const workerDelayMs = Number(process.env['INTROSPECTION_ALLOCATOR_WORKER_DELAY_MS'] ?? '0');
const workerStaleAfterMs = Number(
  process.env['INTROSPECTION_ALLOCATOR_WORKER_STALE_AFTER_MS'] ?? '0',
);

const waitSynchronously = (milliseconds: number): void => {
  if (milliseconds > 0) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(int32ByteLength)), 0, 0, milliseconds);
  }
};

const techDebtRecord = (identity: AllocatedRecordIdentity): ParsedRecord<TechDebtFrontmatter> => {
  waitSynchronously(workerDelayMs);

  return {
    frontmatter: {
      schema_version: 1,
      id: identity.id,
      repo_key: 'BP',
      record_type: 'tech-debt',
      number: identity.number,
      title: `Allocated by worker ${workerId}`,
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
            kind: 'other',
            ref: `worker:${workerId}`,
          },
        ],
      },
    },
    body: [
      `Worker ${workerId} created this record.`,
      '## Problem',
      'The parent test needs a real OS process allocation.',
      '## Why deferred',
      'This fixture exists only for the concurrency gate.',
      '## Revisit trigger',
      'Revisit when the allocator lock contract changes.',
    ].join('\n\n'),
  };
};

const workerContext = (): IdAllocatorContext | null => {
  if (!recordsRoot || !locksRoot) {
    return null;
  }

  return {
    locksRoot,
    recordsRoot,
    repoKey: 'BP',
  };
};

const workerLockRequest = (): { readonly lock?: { readonly staleAfterMs: number } } => {
  if (workerStaleAfterMs > 0) {
    return { lock: { staleAfterMs: workerStaleAfterMs } };
  }

  return {};
};

describe('WI-05 allocator worker fixture', () => {
  it('allocates one record when launched with worker environment', async () => {
    const context = workerContext();

    if (!context) {
      assert.ok(true);
      return;
    }

    const result = await allocateRecord({
      context,
      makeRecord: techDebtRecord,
      recordType: techDebtRecordType,
      ...workerLockRequest(),
    });

    assert.match(result.identity.id, /^BP-TD-\d{3,}$/u);
  });
});
