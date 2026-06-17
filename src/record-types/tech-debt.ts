import techDebtSchema from '../../schemas/tech-debt-record.schema.json';
import { firstNonEmptyBodyLine, projectBaseRecordForExport } from '../core/record-type.js';
import type {
  BaseRecordFrontmatter,
  JsonSchemaDocument,
  LifecycleDefinition,
  Finding,
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

const requiredBodyHeadings = ['## Problem', '## Why deferred', '## Revisit trigger'] as const;

const repoTag = (context: ValidationContext): string | null => {
  if (!context.repoSlug) {
    return null;
  }

  return `repo/${context.repoSlug}`;
};

const fenceMarker = (line: string): '```' | '~~~' | null => {
  const trimmed = line.trimStart();

  if (trimmed.startsWith('```')) {
    return '```';
  }

  if (trimmed.startsWith('~~~')) {
    return '~~~';
  }

  return null;
};

const nextActiveFence = (
  activeFence: '```' | '~~~' | null,
  marker: '```' | '~~~',
): '```' | '~~~' | null => {
  if (activeFence === marker) {
    return null;
  }

  if (!activeFence) {
    return marker;
  }

  return activeFence;
};

const addBodyHeading = (
  headings: Set<string>,
  line: string,
  activeFence: '```' | '~~~' | null,
): void => {
  const trimmed = line.trim();

  if (!activeFence && trimmed.startsWith('## ')) {
    headings.add(trimmed);
  }
};

const bodyHeadingSet = (body: string): ReadonlySet<string> => {
  const headings = new Set<string>();
  let activeFence: '```' | '~~~' | null = null;

  for (const line of body.split('\n')) {
    const marker = fenceMarker(line);

    if (marker) {
      activeFence = nextActiveFence(activeFence, marker);
    } else {
      addBodyHeading(headings, line, activeFence);
    }
  }

  return headings;
};

const missingBodyHeadingFinding = (heading: string): Finding => ({
  code: 'tech_debt.body.heading.required',
  severity: 'error',
  message: `Tech-debt records require a "${heading}" body heading.`,
  path: ['body'],
  remediation: `Add a ${heading} section so the deferred judgment is explicit and reviewable.`,
});

const validateRequiredBodyHeadings = (
  record: ParsedRecord<TechDebtFrontmatter>,
): ReadonlyArray<Finding> => {
  const headings = bodyHeadingSet(record.body);

  return requiredBodyHeadings
    .filter((heading) => !headings.has(heading))
    .map(missingBodyHeadingFinding);
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
  validate: (record) => validateRequiredBodyHeadings(record),
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
