import { assert, describe, it } from '@effect/vitest';

import {
  createRecordTypeRegistry,
  firstNonEmptyBodyLine,
  validateLifecycleEvidence,
  validateTransition,
  validateTransitionEvidence,
} from '../../src/core/record-type.js';
import type {
  Finding,
  ParsedRecord,
  RecordType,
  Resolution,
} from '../../src/core/record-type-types.js';
import { recordTypeRegistry } from '../../src/record-types/registry.js';
import { techDebtRecordType } from '../../src/record-types/tech-debt.js';
import type { TechDebtFrontmatter } from '../../src/record-types/tech-debt-types.js';
import { conversionFixtureRecordType } from '../fixtures/conversion-fixture.js';
import type { ConversionFixtureFrontmatter } from '../fixtures/conversion-fixture-types.js';

const schemaVersion = 1;
const timestamp = '2026-06-10T00:00:00Z';
const singleRegisteredRecordTypeCount = 1;

const conversionTarget = {
  kind: 'repo-instruction' as const,
  ref: 'CLAUDE.md',
  rationale: 'The deferral was converted into durable repo guidance.',
};

const findingCodes = (findings: ReadonlyArray<Finding>): ReadonlyArray<string> =>
  findings.map((finding) => finding.code);

const techDebtRecord = (
  frontmatter: Partial<TechDebtFrontmatter> = {},
): ParsedRecord<TechDebtFrontmatter> => ({
  frontmatter: {
    schema_version: schemaVersion,
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
  body: [
    'Minimal placeholder summary for the tech-debt record.',
    '## Problem',
    'The stack-neutral preset work is tracked for a later phase.',
    '## Why deferred',
    'The current phase only needs the record contract.',
    '## Revisit trigger',
    'Revisit when the owning work item starts.',
  ].join('\n\n'),
});

const conversionRecord = (
  frontmatter: Partial<ConversionFixtureFrontmatter> = {},
): ParsedRecord<ConversionFixtureFrontmatter> => ({
  frontmatter: {
    schema_version: schemaVersion,
    id: 'IX-CF-001',
    repo_key: 'IX',
    record_type: 'conversion-fixture',
    number: 1,
    title: 'Convert verbal deferral into durable target',
    status: 'observed',
    type: 'introspection-record',
    category: 'conversion-fixture',
    visibility: 'local-only',
    created_at: timestamp,
    updated_at: timestamp,
    tags: ['record/conversion-fixture', 'status/observed', 'visibility/local-only'],
    ...frontmatter,
  } as ConversionFixtureFrontmatter,
  body: 'A verbal deferral needs a durable destination.',
});

const resolution = (disposition: ConversionFixtureFrontmatter['status']): Resolution => ({
  disposition,
  resolved_at: timestamp,
  rationale: 'The conversion fixture reached a terminal status.',
});

describe('WI-03 static record type registry', () => {
  it('registers the tech-debt placeholder in the package registry', () => {
    const typedTechDebt: RecordType<TechDebtFrontmatter> = techDebtRecordType;

    assert.strictEqual(typedTechDebt.key, 'tech-debt');
    assert.strictEqual(recordTypeRegistry.require('tech-debt'), techDebtRecordType);
    assert.deepStrictEqual(recordTypeRegistry.entries(), [techDebtRecordType]);
    assert.deepStrictEqual(recordTypeRegistry.keys(), ['tech-debt']);
    assert.ok(!recordTypeRegistry.get('missing'));
    assert.ok(!recordTypeRegistry.get('conversion-fixture'));
  });

  it('creates a registry for a single record type without treating the first entry as duplicate', () => {
    assert.strictEqual(
      createRecordTypeRegistry([techDebtRecordType]).entries().length,
      singleRegisteredRecordTypeCount,
    );
    assert.strictEqual(
      createRecordTypeRegistry([conversionFixtureRecordType]).entries()[0],
      conversionFixtureRecordType,
    );
  });

  it('rejects duplicate static registrations', () => {
    assert.throws(
      () => createRecordTypeRegistry([techDebtRecordType, techDebtRecordType]),
      /Duplicate record type registered: tech-debt/u,
    );
  });

  it('rejects duplicate record type ID prefixes', () => {
    const duplicatePrefixRecordType: RecordType = {
      ...conversionFixtureRecordType,
      key: 'conversion-fixture-copy',
    };

    assert.throws(
      () => createRecordTypeRegistry([conversionFixtureRecordType, duplicatePrefixRecordType]),
      /Duplicate record type idPrefix registered: CF/u,
    );
  });
});

describe('WI-03 tech-debt record type contract', () => {
  it('models lifecycle, derived tags, prime summary, and export projection', () => {
    const record = techDebtRecord();

    assert.deepStrictEqual(techDebtRecordType.validate(record, {}), []);
    assert.deepStrictEqual(techDebtRecordType.derivedTags(record, { repoSlug: 'backpressure' }), [
      'record/tech-debt',
      'repo/backpressure',
      'status/open',
      'visibility/local-only',
    ]);
    assert.deepStrictEqual(techDebtRecordType.summarizeForPrime(record, {}), {
      id: 'BP-TD-007',
      title: 'Future stack-neutral React preset',
      recordType: 'tech-debt',
      status: 'open',
      updatedAt: timestamp,
      summary: 'Minimal placeholder summary for the tech-debt record.',
      tags: ['record/tech-debt', 'repo/backpressure', 'status/open', 'visibility/local-only'],
    });
    assert.deepStrictEqual(techDebtRecordType.projectForExport(record, {}).id, 'BP-TD-007');
  });

  it('leaves terminal lifecycle evidence to core validation', () => {
    const record = techDebtRecord({
      status: 'done',
      resolution: {
        disposition: 'done',
        resolved_at: timestamp,
        rationale: 'The core lifecycle check should require refs.',
      },
    });

    assert.deepStrictEqual(techDebtRecordType.validate(record, {}), []);
  });
});

describe('WI-03 conversion fixture contract', () => {
  it('is registered in a test-only registry', () => {
    const registry = createRecordTypeRegistry([techDebtRecordType, conversionFixtureRecordType]);

    assert.deepStrictEqual(registry.keys(), ['tech-debt', 'conversion-fixture']);
    assert.strictEqual(registry.require('conversion-fixture'), conversionFixtureRecordType);
  });

  it('proves a converted record without conversion_targets fails as a status invariant', () => {
    const record = conversionRecord({
      status: 'converted',
      resolution: resolution('converted'),
    });

    assert.deepStrictEqual(findingCodes(conversionFixtureRecordType.validate(record, {})), [
      'lifecycle.conversion_targets.required',
    ]);
  });

  it('proves a terminal converted transition without conversion_targets also fails', () => {
    const record = conversionRecord({
      status: 'converted',
      resolution: resolution('converted'),
    });

    assert.deepStrictEqual(
      findingCodes(
        validateTransition(conversionFixtureRecordType, 'observed', 'converted', record),
      ),
      ['lifecycle.conversion_targets.required'],
    );
  });

  it('rejects transition validation when the record status does not match the target', () => {
    const record = conversionRecord({
      conversion_targets: [conversionTarget],
    });

    assert.deepStrictEqual(
      findingCodes(
        validateTransition(conversionFixtureRecordType, 'observed', 'converted', record),
      ),
      ['lifecycle.transition.target_status_mismatch'],
    );
  });

  it('accepts converted records only when the durable target shape is present', () => {
    const record = conversionRecord({
      status: 'converted',
      resolution: resolution('converted'),
      conversion_targets: [conversionTarget],
    });

    assert.deepStrictEqual(conversionFixtureRecordType.validate(record, {}), []);
    assert.deepStrictEqual(
      validateTransition(conversionFixtureRecordType, 'observed', 'converted', record),
      [],
    );
  });
});

describe('WI-20 record type lifecycle mutation coverage', () => {
  it('rejects unsupported transition evidence by source and target status', () => {
    const converted = conversionRecord({
      status: 'converted',
      resolution: resolution('converted'),
      conversion_targets: [conversionTarget],
    });

    assert.deepStrictEqual(
      findingCodes(
        validateTransitionEvidence(conversionFixtureRecordType, 'rejected', 'converted', converted),
      ),
      ['lifecycle.transition.unsupported'],
    );
    assert.deepStrictEqual(
      findingCodes(
        validateTransition(conversionFixtureRecordType, 'rejected', 'converted', converted),
      ),
      ['lifecycle.transition.unsupported'],
    );
    assert.deepStrictEqual(
      findingCodes(
        validateTransitionEvidence(
          conversionFixtureRecordType,
          'observed',
          'missing-target',
          conversionRecord(),
        ),
      ),
      ['lifecycle.transition.unsupported'],
    );
  });

  it('honors active statuses that explicitly allow resolution metadata', () => {
    const recordTypeAllowingActiveResolution: RecordType<ConversionFixtureFrontmatter> = {
      ...conversionFixtureRecordType,
      lifecycle: {
        ...conversionFixtureRecordType.lifecycle,
        statuses: {
          ...conversionFixtureRecordType.lifecycle.statuses,
          observed: { kind: 'active', allowsActiveResolution: true },
        },
      },
    };

    assert.deepStrictEqual(
      validateLifecycleEvidence(
        recordTypeAllowingActiveResolution,
        conversionRecord({ resolution: resolution('observed') }),
      ),
      [],
    );
  });

  it('reports resolution disposition mismatches with stable codes', () => {
    assert.deepStrictEqual(
      findingCodes(
        validateLifecycleEvidence(
          conversionFixtureRecordType,
          conversionRecord({ status: 'rejected', resolution: resolution('converted') }),
        ),
      ),
      ['lifecycle.resolution.disposition_mismatch'],
    );
  });

  it('extracts the first non-empty trimmed body line for summaries', () => {
    assert.strictEqual(
      firstNonEmptyBodyLine('\n  \n  Durable summary.  \nLater detail.'),
      'Durable summary.',
    );
  });
});

describe('WI-03 conversion fixture terminal status contract', () => {
  it('requires resolution for every terminal conversion status', () => {
    const record = conversionRecord({ status: 'rejected' });

    assert.deepStrictEqual(findingCodes(conversionFixtureRecordType.validate(record, {})), [
      'lifecycle.resolution.required',
    ]);
  });

  it('does not require conversion_targets for rejected terminal conversion records', () => {
    const record = conversionRecord({
      status: 'rejected',
      resolution: resolution('rejected'),
    });

    assert.deepStrictEqual(conversionFixtureRecordType.validate(record, {}), []);
  });
});
