import techDebtSchema from '../../schemas/tech-debt-record.schema.json';
import {
  firstNonEmptyBodyLine,
  projectBaseRecordForExport,
  validateLifecycleEvidence,
} from '../core/record-type.js';
import type {
  BaseRecordFrontmatter,
  JsonSchemaDocument,
  LifecycleDefinition,
  ParsedRecord,
  PrimeSummary,
  RecordType,
  ValidationContext,
} from '../core/record-type-types.js';

interface TechDebtFrontmatter extends BaseRecordFrontmatter {
  readonly record_type: 'tech-debt';
  readonly category: 'tech-debt';
  readonly status: 'open' | 'done' | 'rejected' | 'superseded' | 'moved';
}

const techDebtLifecycle = {
  initialStatus: 'open',
  statuses: {
    open: {
      kind: 'active',
    },
    done: {
      kind: 'terminal',
      evidence: {
        requiresResolution: true,
        requiresResolutionEvidenceRefs: true,
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
        requiresResolutionEvidenceRefs: true,
      },
    },
    moved: {
      kind: 'terminal',
      evidence: {
        requiresResolution: true,
        requiresResolutionEvidenceRefs: true,
      },
    },
  },
  transitions: [
    { from: 'open', to: 'done' },
    { from: 'open', to: 'rejected' },
    { from: 'open', to: 'superseded' },
    { from: 'open', to: 'moved' },
  ],
} as const satisfies LifecycleDefinition;

const repoTag = (context: ValidationContext): string | null => {
  if (!context.repoSlug) {
    return null;
  }

  return `repo/${context.repoSlug}`;
};

const techDebtRecordType: RecordType<TechDebtFrontmatter> = {
  key: 'tech-debt',
  idPrefix: 'TD',
  schema: techDebtSchema as JsonSchemaDocument,
  lifecycle: techDebtLifecycle,
  derivedTags: (record, context) => {
    const tags = [
      'record/tech-debt',
      repoTag(context),
      `status/${record.frontmatter.status}`,
      `visibility/${record.frontmatter.visibility}`,
    ];

    return tags.filter((tag): tag is string => tag !== null);
  },
  validate: (record) => validateLifecycleEvidence(techDebtRecordType, record),
  summarizeForPrime: (record: ParsedRecord<TechDebtFrontmatter>): PrimeSummary => ({
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

export { techDebtLifecycle, techDebtRecordType };
export type { TechDebtFrontmatter };
