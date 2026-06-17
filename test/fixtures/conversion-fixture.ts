import {
  firstNonEmptyBodyLine,
  projectBaseRecordForExport,
  validateLifecycleEvidence,
} from '../../src/core/record-type.js';
import type {
  BaseRecordFrontmatter,
  JsonSchemaDocument,
  LifecycleDefinition,
  PrimeSummary,
  RecordType,
} from '../../src/core/record-type-types.js';

interface ConversionFixtureFrontmatter extends BaseRecordFrontmatter {
  readonly record_type: 'conversion-fixture';
  readonly category: 'conversion-fixture';
  readonly status: 'observed' | 'converted' | 'rejected' | 'superseded';
}

const conversionFixtureLifecycle = {
  initialStatus: 'observed',
  statuses: {
    observed: {
      kind: 'active',
    },
    converted: {
      kind: 'terminal',
      evidence: {
        requiresResolution: true,
        requiresConversionTargets: true,
      },
    },
    rejected: {
      kind: 'terminal',
      evidence: {
        requiresResolution: true,
      },
    },
    superseded: {
      kind: 'terminal',
      evidence: {
        requiresResolution: true,
      },
    },
  },
  transitions: [
    { from: 'observed', to: 'converted' },
    { from: 'observed', to: 'rejected' },
    { from: 'observed', to: 'superseded' },
  ],
} as const satisfies LifecycleDefinition;

const conversionFixtureSchema = {
  $id: 'https://introspection.local/test-schemas/conversion-fixture.schema.json',
  title: 'test-only conversion fixture frontmatter',
  type: 'object',
} as const satisfies JsonSchemaDocument;

const conversionFixtureRecordType: RecordType<ConversionFixtureFrontmatter> = {
  key: 'conversion-fixture',
  idPrefix: 'CF',
  schema: conversionFixtureSchema,
  lifecycle: conversionFixtureLifecycle,
  derivedTags: (record) => [
    'record/conversion-fixture',
    `status/${record.frontmatter.status}`,
    `visibility/${record.frontmatter.visibility}`,
  ],
  validate: (record) => validateLifecycleEvidence(conversionFixtureRecordType, record),
  summarizeForPrime: (record): PrimeSummary => ({
    id: record.frontmatter.id,
    title: record.frontmatter.title,
    recordType: record.frontmatter.record_type,
    status: record.frontmatter.status,
    updatedAt: record.frontmatter.updated_at,
    summary: firstNonEmptyBodyLine(record.body),
    tags: [...record.frontmatter.tags],
  }),
  projectForExport: (record) => projectBaseRecordForExport(record),
};

export { conversionFixtureLifecycle, conversionFixtureRecordType };
export type { ConversionFixtureFrontmatter };
