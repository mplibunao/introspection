import { assert, describe, it } from '@effect/vitest';

import techDebtSchema from '../../schemas/tech-debt-record.schema.json';
import { validateRecordLifecycle } from '../../src/core/lifecycle.js';
import { expectedMachineTags } from '../../src/core/validation.js';
import type { Finding, ParsedRecord, Resolution } from '../../src/core/record-type-types.js';
import { techDebtRecordType } from '../../src/record-types/tech-debt.js';
import type { TechDebtFrontmatter } from '../../src/record-types/tech-debt-types.js';

const timestamp = '2026-06-10T00:00:00Z';
const validationContext = {
  repoKey: 'BP',
  repoSlug: 'backpressure',
  recordsRoot: '/tmp/docs/records',
};

const findingCodes = (findings: ReadonlyArray<Finding>): ReadonlyArray<string> =>
  findings.map((finding) => finding.code);

const headingFromFindingMessage = (message: string): string | undefined =>
  /"(## .+)"/u.exec(message)?.[1];

const validBody = [
  'One-line summary for prime output.',
  '## Problem',
  'The current implementation carries a known limitation.',
  '## Why deferred',
  'The owning phase has a narrower scope.',
  '## Revisit trigger',
  'Revisit when the owning work item starts.',
].join('\n\n');

const record = (
  frontmatter: Partial<TechDebtFrontmatter> = {},
  body = validBody,
): ParsedRecord<TechDebtFrontmatter> => ({
  frontmatter: {
    schema_version: 1,
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
      refs: [{ kind: 'tracker', ref: 'docs/exec-plans/tech-debt-tracker.md#td-007' }],
    },
    ...frontmatter,
  } as TechDebtFrontmatter,
  body,
});

const resolution = (disposition: TechDebtFrontmatter['status']): Resolution => ({
  disposition,
  resolved_at: timestamp,
  rationale: `The ${disposition} terminal state has a dated rationale.`,
});

describe('WI-07 tech-debt body shape', () => {
  it('keeps required body-heading validation aligned with schema metadata', () => {
    const requiredHeadings = techDebtSchema['x-required_headings'];

    assert.deepStrictEqual(requiredHeadings, [
      '## Problem',
      '## Why deferred',
      '## Revisit trigger',
    ]);
  });

  it('requires the Problem, Why deferred, and Revisit trigger headings', () => {
    const body = [
      'One-line summary.',
      '## Done when',
      'The optional completion shape is present but required sections are absent.',
    ].join('\n\n');

    const findings = techDebtRecordType.validate(record({}, body), validationContext);

    assert.deepStrictEqual(findingCodes(findings), [
      'tech_debt.body.heading.required',
      'tech_debt.body.heading.required',
      'tech_debt.body.heading.required',
    ]);
    assert.deepStrictEqual(
      findings.map((finding) => headingFromFindingMessage(finding.message)),
      techDebtSchema['x-required_headings'],
    );
  });

  it('ignores required headings inside backtick and tilde fenced code blocks', () => {
    const body = [
      'One-line summary.',
      '```markdown',
      '## Problem',
      '## Why deferred',
      '```',
      '~~~',
      '## Revisit trigger',
      '~~~',
    ].join('\n');

    const findings = techDebtRecordType.validate(record({}, body), validationContext);

    assert.deepStrictEqual(findingCodes(findings), [
      'tech_debt.body.heading.required',
      'tech_debt.body.heading.required',
      'tech_debt.body.heading.required',
    ]);
  });

  it('accepts the optional Done when heading when required headings are present', () => {
    const body = [
      validBody,
      '## Done when',
      'The deferred work has concrete acceptance criteria.',
    ].join('\n\n');

    assert.deepStrictEqual(techDebtRecordType.validate(record({}, body), validationContext), []);
  });
});

describe('WI-07 tech-debt lifecycle ownership', () => {
  it('leaves terminal evidence failures to the WI-06 core lifecycle validator', () => {
    const doneWithoutEvidence = record({
      status: 'done',
      tags: ['record/tech-debt', 'repo/backpressure', 'status/done', 'visibility/local-only'],
      resolution: resolution('done'),
    });

    assert.deepStrictEqual(techDebtRecordType.validate(doneWithoutEvidence, validationContext), []);
    assert.deepStrictEqual(
      findingCodes(validateRecordLifecycle(techDebtRecordType, doneWithoutEvidence)),
      ['lifecycle.resolution.evidence_refs.required'],
    );
  });

  it('accepts terminal lifecycle evidence through the WI-06 core lifecycle validator', () => {
    const doneWithEvidence = record({
      status: 'done',
      tags: ['record/tech-debt', 'repo/backpressure', 'status/done', 'visibility/local-only'],
      resolution: {
        ...resolution('done'),
        evidence_refs: [{ kind: 'doc', ref: 'docs/decisions/accepted-remediation.md' }],
      },
    });

    assert.deepStrictEqual(validateRecordLifecycle(techDebtRecordType, doneWithEvidence), []);
  });
});

describe('WI-07 tech-debt machine tags and projections', () => {
  it('derives deterministic tags that match the WI-06 machine-tag invariant', () => {
    const fixture = record();
    const expected = [
      'record/tech-debt',
      'repo/backpressure',
      'status/open',
      'visibility/local-only',
    ];

    assert.deepStrictEqual(techDebtRecordType.derivedTags(fixture, validationContext), expected);
    assert.deepStrictEqual(
      expectedMachineTags(techDebtRecordType, fixture, validationContext),
      expected,
    );
  });

  it('returns stable JSON-friendly prime and export projections', () => {
    const fixture = record();

    assert.deepStrictEqual(techDebtRecordType.summarizeForPrime(fixture, validationContext), {
      id: 'BP-TD-007',
      title: 'Future stack-neutral React preset',
      recordType: 'tech-debt',
      status: 'open',
      updatedAt: timestamp,
      summary: 'One-line summary for prime output.',
      tags: ['record/tech-debt', 'repo/backpressure', 'status/open', 'visibility/local-only'],
    });
    assert.deepStrictEqual(techDebtRecordType.projectForExport(fixture, validationContext), {
      schemaVersion: 1,
      id: 'BP-TD-007',
      recordType: 'tech-debt',
      status: 'open',
      title: 'Future stack-neutral React preset',
      visibility: 'local-only',
      tags: ['record/tech-debt', 'repo/backpressure', 'status/open', 'visibility/local-only'],
      frontmatter: fixture.frontmatter,
      body: validBody,
    });
  });
});
