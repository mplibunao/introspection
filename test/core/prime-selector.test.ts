/* eslint-disable max-lines-per-function, max-statements, no-duplicate-imports, no-magic-numbers -- Prime selector mutation tests use compact numbered fixtures to make ordering, filtering, and omitted-count expectations obvious. */
import { assert, describe, it } from '@effect/vitest';

import { IntrospectionError } from '../../src/core/errors.js';
import { selectPrimeRecords } from '../../src/core/prime-selector.js';
import type { PrimeCandidateRecord } from '../../src/core/prime-selector.js';
import type {
  BaseRecordFrontmatter,
  ParsedRecord,
  ValidationContext,
} from '../../src/core/record-type-types.js';
import { recordTypeRegistry } from '../../src/record-types/registry.js';
import type { TechDebtFrontmatter } from '../../src/record-types/tech-debt-types.js';

const now = new Date('2026-06-12T00:00:00Z');
const validationContext: ValidationContext = {
  repoKey: 'BP',
  repoSlug: 'backpressure',
  recordsRoot: '/tmp/docs/records',
};

const recordStatus = (
  frontmatter: Omit<Partial<TechDebtFrontmatter>, 'record_type'> & {
    readonly record_type?: string;
  },
): string => {
  if (typeof frontmatter['status'] === 'string') {
    return frontmatter['status'];
  }

  return 'open';
};

const record = (
  number: number,
  title: string,
  updatedAt: string,
  frontmatter: Omit<Partial<TechDebtFrontmatter>, 'record_type'> & {
    readonly record_type?: string;
  } = {},
): ParsedRecord => {
  const status = recordStatus(frontmatter);

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
      created_at: '2026-06-01T00:00:00Z',
      updated_at: updatedAt,
      tags: ['record/tech-debt', 'repo/backpressure', `status/${status}`, 'visibility/local-only'],
      source: {
        discovered_at: '2026-06-01T00:00:00Z',
        refs: [
          {
            kind: 'plan',
            ref: 'docs/exec-plans/active/introspection-v1-bootstrap-2026-06-10.md#wi-10',
          },
        ],
      },
      ...frontmatter,
    } satisfies BaseRecordFrontmatter,
    body: [
      `${title} summary.`,
      '## Problem',
      'Prime needs deterministic selector coverage.',
      '## Why deferred',
      'The selector is being implemented in WI-10.',
      '## Revisit trigger',
      'Revisit when prime ordering or filters change.',
    ].join('\n\n'),
  };
};

const candidate = (
  parsedRecord: ParsedRecord,
  relativePath = `tech-debt/${parsedRecord.frontmatter.status}/${parsedRecord.frontmatter.id.toLowerCase()}.md`,
): PrimeCandidateRecord => ({ record: parsedRecord, relativePath });

describe('WI-10 prime selector', () => {
  it('excludes terminal records by default and includes them when explicitly requested', () => {
    const active = candidate(record(1, 'Active record', '2026-06-10T00:00:00Z'));
    const terminal = candidate(
      record(2, 'Done record', '2026-06-01T00:00:00Z', {
        status: 'done',
        resolution: {
          disposition: 'done',
          resolved_at: '2026-06-02T00:00:00Z',
          rationale: 'Done records should not appear in default prime output.',
          evidence_refs: [{ kind: 'doc', ref: 'docs/evidence.md' }],
        },
      }),
    );

    const defaultSelection = selectPrimeRecords({
      records: [terminal, active],
      registry: recordTypeRegistry,
      context: validationContext,
      now,
    });
    const terminalSelection = selectPrimeRecords({
      records: [terminal, active],
      registry: recordTypeRegistry,
      context: validationContext,
      now,
      filters: { includeTerminal: true },
    });

    assert.deepStrictEqual(
      defaultSelection.records.map((selected) => selected.id),
      ['BP-TD-001'],
    );
    assert.deepStrictEqual(
      terminalSelection.records.map((selected) => selected.id),
      ['BP-TD-002', 'BP-TD-001'],
    );
  });

  it('uses deterministic oldest-updated ordering with stable tie breakers and controlled age', () => {
    const selection = selectPrimeRecords({
      records: [
        candidate(record(10, 'Newest', '2026-06-11T00:00:00Z')),
        candidate(record(2, 'Tie lower number', '2026-06-10T00:00:00Z')),
        candidate(record(3, 'Tie higher number', '2026-06-10T00:00:00Z')),
        candidate(record(1, 'Oldest', '2026-06-01T00:00:00Z')),
      ],
      registry: recordTypeRegistry,
      context: validationContext,
      now,
    });

    assert.deepStrictEqual(
      selection.records.map((selected) => selected.id),
      ['BP-TD-001', 'BP-TD-002', 'BP-TD-003', 'BP-TD-010'],
    );
    assert.strictEqual(selection.records[0]?.ageDays, 11);
  });

  it('falls through to stable tie breakers when timestamps are invalid', () => {
    const selection = selectPrimeRecords({
      records: [
        candidate(record(5, 'Invalid higher number', 'not-a-date')),
        candidate(record(4, 'Invalid lower number', 'also-not-a-date')),
        candidate(record(6, 'Valid timestamp', '2026-06-01T00:00:00Z')),
      ],
      registry: recordTypeRegistry,
      context: validationContext,
      now,
    });

    assert.deepStrictEqual(
      selection.records.map((selected) => selected.id),
      ['BP-TD-006', 'BP-TD-004', 'BP-TD-005'],
    );
    assert.strictEqual(selection.records[1]?.ageDays, 0);
  });

  it('bounds output with omitted counts and clamps requested limits at the hard cap', () => {
    const records = [1, 2, 3, 4, 5].map((number) =>
      candidate(record(number, `Record ${number}`, `2026-06-0${number}T00:00:00Z`)),
    );

    const defaultSelection = selectPrimeRecords({
      records,
      registry: recordTypeRegistry,
      context: validationContext,
      now,
      limits: { defaultLimit: 2, hardLimit: 4 },
    });
    const clampedSelection = selectPrimeRecords({
      records,
      registry: recordTypeRegistry,
      context: validationContext,
      now,
      requestedLimit: 10,
      limits: { defaultLimit: 2, hardLimit: 4 },
    });

    assert.strictEqual(defaultSelection.shownRecordCount, 2);
    assert.strictEqual(defaultSelection.omittedRecordCount, 3);
    assert.strictEqual(clampedSelection.limit.effectiveLimit, 4);
    assert.strictEqual(clampedSelection.limit.clamped, true);
    assert.strictEqual(clampedSelection.shownRecordCount, 4);
    assert.strictEqual(clampedSelection.omittedRecordCount, 1);
  });

  it('does not mark a requested limit equal to the hard limit as clamped', () => {
    const records = [1, 2, 3, 4, 5].map((number) =>
      candidate(record(number, `Record ${number}`, `2026-06-0${number}T00:00:00Z`)),
    );

    const exactHardLimitSelection = selectPrimeRecords({
      records,
      registry: recordTypeRegistry,
      context: validationContext,
      now,
      requestedLimit: 4,
      limits: { defaultLimit: 2, hardLimit: 4 },
    });

    assert.strictEqual(exactHardLimitSelection.limit.clamped, false);
  });

  it('rejects invalid configured and requested limits with stable error codes', () => {
    const records = [candidate(record(1, 'Record 1', '2026-06-01T00:00:00Z'))];
    const invalidCases = [
      {
        options: { limits: { defaultLimit: 0, hardLimit: 4 } },
        expectedCode: 'prime.limit.invalid',
        expectedLabel: 'prime.default_limit',
      },
      {
        options: { limits: { defaultLimit: 2.5, hardLimit: 4 } },
        expectedCode: 'prime.limit.invalid',
        expectedLabel: 'prime.default_limit',
      },
      {
        options: { limits: { defaultLimit: 3, hardLimit: 2 } },
        expectedCode: 'prime.limit.config_invalid',
        expectedLabel: null,
      },
      {
        options: { requestedLimit: 0, limits: { defaultLimit: 2, hardLimit: 4 } },
        expectedCode: 'prime.limit.invalid',
        expectedLabel: '--limit',
      },
    ] as const;

    for (const invalidCase of invalidCases) {
      try {
        selectPrimeRecords({
          records,
          registry: recordTypeRegistry,
          context: validationContext,
          now,
          ...invalidCase.options,
        });
        assert.fail(`expected ${invalidCase.expectedCode} for invalid prime limit`);
      } catch (error) {
        assert.ok(error instanceof IntrospectionError);
        assert.strictEqual(error.code, invalidCase.expectedCode);
        if (invalidCase.expectedLabel !== null) {
          assert.strictEqual(error.details?.['label'], invalidCase.expectedLabel);
        }
      }
    }
  });

  it('normalizes filters deterministically and records read failures in the result metadata', () => {
    const selection = selectPrimeRecords({
      records: [candidate(record(1, 'Record 1', '2026-06-01T00:00:00Z'))],
      registry: recordTypeRegistry,
      context: validationContext,
      now: new Date('2026-06-12T00:00:00.123Z'),
      failedReadCount: 2,
      filters: {
        types: ['tech-debt', 'tech-debt'],
        statuses: ['open'],
        tags: ['topic/b', 'topic/a', 'topic/a'],
        paths: ['zeta', 'alpha'],
      },
    });

    assert.strictEqual(selection.generatedAt, '2026-06-12T00:00:00Z');
    assert.strictEqual(selection.failedReadCount, 2);
    assert.deepStrictEqual(selection.filters, {
      all: false,
      includeTerminal: false,
      paths: ['alpha', 'zeta'],
      statuses: ['open'],
      tags: ['topic/a', 'topic/b'],
      types: ['tech-debt'],
    });
  });

  it('filters by current repo, type, status, tags, and path', () => {
    const matching = candidate(
      record(1, 'Matching', '2026-06-01T00:00:00Z', {
        tags: [
          'record/tech-debt',
          'repo/backpressure',
          'status/open',
          'visibility/local-only',
          'owner/mp',
        ],
      }),
      'tech-debt/open/matching.md',
    );
    const wrongRepo = candidate(
      record(2, 'Wrong repo', '2026-06-02T00:00:00Z', { repo_key: 'OTHER' }),
      'tech-debt/open/wrong-repo.md',
    );
    const wrongPath = candidate(
      record(3, 'Wrong path', '2026-06-03T00:00:00Z'),
      'tech-debt/open/other.md',
    );

    const selection = selectPrimeRecords({
      records: [wrongRepo, wrongPath, matching],
      registry: recordTypeRegistry,
      context: validationContext,
      now,
      filters: {
        types: ['tech-debt'],
        statuses: ['open'],
        tags: ['owner/mp'],
        paths: ['matching.md'],
      },
    });

    assert.deepStrictEqual(
      selection.records.map((selected) => selected.id),
      ['BP-TD-001'],
    );
  });

  it('requires all tag filters and matches any normalized path filter', () => {
    const fullMatch = candidate(
      record(1, 'Full match', '2026-06-01T00:00:00Z', {
        tags: [
          'record/tech-debt',
          'repo/backpressure',
          'status/open',
          'visibility/local-only',
          'owner/mp',
          'topic/mutation-testing',
        ],
      }),
      'tech-debt/open/matching.md',
    );
    const partialTagMatch = candidate(
      record(2, 'Partial tag match', '2026-06-02T00:00:00Z', {
        tags: [
          'record/tech-debt',
          'repo/backpressure',
          'status/open',
          'visibility/local-only',
          'owner/mp',
        ],
      }),
      'tech-debt/open/partial.md',
    );
    const windowsPathMatch = candidate(
      record(3, 'Windows path match', '2026-06-03T00:00:00Z', {
        tags: [
          'record/tech-debt',
          'repo/backpressure',
          'status/open',
          'visibility/local-only',
          'owner/mp',
          'topic/mutation-testing',
        ],
      }),
      'tech-debt/open/windows.md',
    );

    const selection = selectPrimeRecords({
      records: [partialTagMatch, windowsPathMatch, fullMatch],
      registry: recordTypeRegistry,
      context: validationContext,
      now,
      filters: {
        tags: ['owner/mp', 'topic/mutation-testing'],
        paths: ['./tech-debt/open/matching.md', 'tech-debt\\open\\windows.md'],
      },
    });

    assert.deepStrictEqual(
      selection.records.map((selected) => selected.id),
      ['BP-TD-001', 'BP-TD-003'],
    );
  });

  it('keeps type, status, tag, and path filters conjunctive with deterministic final tie breakers', () => {
    const baseTags = [
      'record/tech-debt',
      'repo/backpressure',
      'status/open',
      'visibility/local-only',
      'owner/mp',
      'topic/mutation-testing',
    ];
    const matchingA = candidate(
      record(7, 'Matching A', '2026-06-01T00:00:00Z', { id: 'BP-TD-007A', tags: baseTags }),
      'tech-debt/open/a.md',
    );
    const matchingB = candidate(
      record(7, 'Matching B', '2026-06-01T00:00:00Z', { id: 'BP-TD-007B', tags: baseTags }),
      'tech-debt/open/b.md',
    );
    const pathTieBreaker = candidate(
      record(7, 'Path tie breaker', '2026-06-01T00:00:00Z', {
        id: 'BP-TD-007B',
        tags: baseTags,
      }),
      'tech-debt/open/c.md',
    );
    const wrongType = candidate(
      record(8, 'Wrong type', '2026-06-01T00:00:00Z', {
        record_type: 'note',
        tags: baseTags,
      }),
      'tech-debt/open/wrong-type.md',
    );
    const wrongStatus = candidate(
      record(9, 'Wrong status', '2026-06-01T00:00:00Z', {
        status: 'done',
        tags: [
          'record/tech-debt',
          'repo/backpressure',
          'status/done',
          'visibility/local-only',
          'owner/mp',
          'topic/mutation-testing',
        ],
      }),
      'tech-debt/open/wrong-status.md',
    );
    const wrongTags = candidate(
      record(10, 'Wrong tags', '2026-06-01T00:00:00Z', {
        tags: [
          'record/tech-debt',
          'repo/backpressure',
          'status/open',
          'visibility/local-only',
          'owner/mp',
        ],
      }),
      'tech-debt/open/wrong-tags.md',
    );
    const wrongPath = candidate(
      record(11, 'Wrong path', '2026-06-01T00:00:00Z', { tags: baseTags }),
      'tech-debt/archive/wrong-path.md',
    );

    const selection = selectPrimeRecords({
      records: [wrongType, wrongStatus, wrongTags, wrongPath, pathTieBreaker, matchingB, matchingA],
      registry: recordTypeRegistry,
      context: validationContext,
      now,
      filters: {
        paths: ['tech-debt/open/'],
        statuses: ['open'],
        tags: ['owner/mp', 'topic/mutation-testing'],
        types: ['tech-debt'],
      },
    });

    assert.deepStrictEqual(
      selection.records.map((selected) => `${selected.id}:${selected.path}`),
      [
        'BP-TD-007A:tech-debt/open/a.md',
        'BP-TD-007B:tech-debt/open/b.md',
        'BP-TD-007B:tech-debt/open/c.md',
      ],
    );
  });

  it('uses repo context and lifecycle metadata to exclude other repos and unknown terminal kinds', () => {
    const currentRepo = candidate(record(1, 'Current repo', '2026-06-01T00:00:00Z'));
    const otherRepo = candidate(
      record(2, 'Other repo', '2026-06-02T00:00:00Z', { repo_key: 'OTHER' }),
    );
    const unknownType = candidate(
      record(3, 'Unknown type', '2026-06-03T00:00:00Z', {
        record_type: 'unknown-type',
      }),
    );

    const scopedSelection = selectPrimeRecords({
      records: [otherRepo, unknownType, currentRepo],
      registry: recordTypeRegistry,
      context: validationContext,
      now,
    });
    const unscopedSelection = selectPrimeRecords({
      records: [otherRepo, currentRepo],
      registry: recordTypeRegistry,
      context: { recordsRoot: '/tmp/docs/records' },
      now,
    });

    assert.deepStrictEqual(
      scopedSelection.records.map((selected) => selected.id),
      ['BP-TD-001'],
    );
    assert.deepStrictEqual(
      unscopedSelection.records.map((selected) => selected.id),
      ['BP-TD-001', 'BP-TD-002'],
    );
  });
});
