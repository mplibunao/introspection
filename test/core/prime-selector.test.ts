/* eslint-disable max-lines-per-function, no-duplicate-imports, no-magic-numbers -- Prime selector tests use compact numbered fixtures to make ordering and omitted-count expectations obvious. */
import { assert, describe, it } from '@effect/vitest';

import { selectPrimeRecords } from '../../src/core/prime-selector.js';
import type { PrimeCandidateRecord } from '../../src/core/prime-selector.js';
import type { ParsedRecord, ValidationContext } from '../../src/core/record-type-types.js';
import { recordTypeRegistry } from '../../src/record-types/registry.js';
import type { TechDebtFrontmatter } from '../../src/record-types/tech-debt-types.js';

const now = new Date('2026-06-12T00:00:00Z');
const validationContext: ValidationContext = {
  repoKey: 'BP',
  repoSlug: 'backpressure',
  recordsRoot: '/tmp/docs/records',
};

const record = (
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
    } as TechDebtFrontmatter,
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
  parsedRecord: ParsedRecord<TechDebtFrontmatter>,
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
      ],
      registry: recordTypeRegistry,
      context: validationContext,
      now,
    });

    assert.deepStrictEqual(
      selection.records.map((selected) => selected.id),
      ['BP-TD-004', 'BP-TD-005'],
    );
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
});
