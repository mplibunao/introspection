import { assert, describe, it } from '@effect/vitest';

import { buildRecordCandidate } from '../../src/core/record-candidate.js';
import { techDebtRecordType } from '../../src/record-types/tech-debt.js';

const validationContext = {
  repoKey: 'BP',
  repoSlug: 'backpressure',
  defaultVisibility: 'local-only' as const,
};

const baseOptions = {
  recordType: techDebtRecordType,
  repoKey: 'BP',
  number: 3,
  status: 'open',
  title: 'Test record',
  visibility: 'local-only' as const,
  createdAt: '2026-06-12T00:00:00Z',
  body: '## Problem\n\nSome problem.\n\n## Why deferred\n\nDeferred.\n\n## Revisit trigger\n\nTrigger.\n',
  source: { discovered_at: '2026-06-12T00:00:00Z' },
  userTags: ['owner/mp'],
  validationContext,
};

describe('buildRecordCandidate', () => {
  it('produces stable identity, correct path, and correct frontmatter field order for an open record', () => {
    const { identity, record } = buildRecordCandidate(baseOptions);

    // Identity
    assert.strictEqual(identity.id, 'BP-TD-003');
    assert.strictEqual(identity.number, 3);
    assert.strictEqual(identity.relativePath, 'tech-debt/open/bp-td-003.md');

    // Frontmatter field order is load-bearing for YAML serialization
    const keys = Object.keys(record.frontmatter);
    assert.deepStrictEqual(keys, [
      'schema_version',
      'id',
      'repo_key',
      'record_type',
      'number',
      'title',
      'status',
      'type',
      'category',
      'visibility',
      'created_at',
      'updated_at',
      'tags',
      'source',
    ]);

    // Machine tags first (from expectedMachineTags via derivedTags), user tags after
    assert.deepStrictEqual(
      [...record.frontmatter.tags],
      ['record/tech-debt', 'repo/backpressure', 'status/open', 'visibility/local-only', 'owner/mp'],
    );

    // Source included, no resolution for active record
    assert.deepStrictEqual(record.frontmatter.source, { discovered_at: '2026-06-12T00:00:00Z' });
    assert.ok(!('resolution' in record.frontmatter), 'Open record must not have resolution');
  });

  it('includes resolution after source for a terminal record; source appears before resolution', () => {
    const { identity, record } = buildRecordCandidate({
      ...baseOptions,
      status: 'rejected',
      resolution: {
        disposition: 'rejected',
        resolved_at: '2026-06-12T00:00:00Z',
        rationale: 'No longer applicable.',
      },
    });

    assert.strictEqual(identity.relativePath, 'tech-debt/rejected/bp-td-003.md');

    const keys = Object.keys(record.frontmatter);
    // Source must appear immediately before resolution in key order
    const sourceIdx = keys.indexOf('source');
    const resolutionIdx = keys.indexOf('resolution');
    assert.ok(sourceIdx !== -1, 'source must be present');
    assert.ok(resolutionIdx !== -1, 'resolution must be present');
    assert.ok(sourceIdx < resolutionIdx, 'source must precede resolution in key order');

    // Status machine tag must reflect the terminal status
    assert.ok(record.frontmatter.tags.includes('status/rejected'));
    assert.ok(!record.frontmatter.tags.includes('status/open'));
  });

  it('updatedAt defaults to createdAt when not provided', () => {
    const { record } = buildRecordCandidate({ ...baseOptions });
    assert.strictEqual(record.frontmatter.created_at, '2026-06-12T00:00:00Z');
    assert.strictEqual(record.frontmatter.updated_at, '2026-06-12T00:00:00Z');
  });

  it('uses explicit updatedAt when provided', () => {
    const { record } = buildRecordCandidate({
      ...baseOptions,
      updatedAt: '2026-06-13T00:00:00Z',
    });
    assert.strictEqual(record.frontmatter.created_at, '2026-06-12T00:00:00Z');
    assert.strictEqual(record.frontmatter.updated_at, '2026-06-13T00:00:00Z');
  });

  it('dedupes a user tag that duplicates a machine tag', () => {
    const { record } = buildRecordCandidate({
      ...baseOptions,
      userTags: ['status/open', 'owner/mp'],
    });

    const statusOpenCount = record.frontmatter.tags.filter((tag) => tag === 'status/open').length;
    assert.strictEqual(statusOpenCount, 1, 'duplicate machine tag from userTags must be deduped');
  });
});
