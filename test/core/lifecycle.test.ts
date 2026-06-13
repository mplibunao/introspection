import { assert, describe, it } from '@effect/vitest';

import {
  statusIsTerminal,
  terminalStatuses,
  validateRecordLifecycle,
} from '../../src/core/lifecycle.js';
import type { Finding, ParsedRecord, Resolution } from '../../src/core/record-type-types.js';
import { techDebtRecordType } from '../../src/record-types/tech-debt.js';
import type { TechDebtFrontmatter } from '../../src/record-types/tech-debt-types.js';

const timestamp = '2026-06-10T00:00:00Z';

const findingCodes = (findings: ReadonlyArray<Finding>): ReadonlyArray<string> =>
  findings.map((finding) => finding.code);

const techDebtRecord = (
  frontmatter: Partial<TechDebtFrontmatter> = {},
): ParsedRecord<TechDebtFrontmatter> => ({
  frontmatter: {
    schema_version: 1,
    id: 'BP-TD-007',
    repo_key: 'BP',
    record_type: 'tech-debt',
    number: 7,
    title: 'Lifecycle matrix fixture',
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
  body: 'Lifecycle evidence fixture.',
});

const resolution = (disposition: TechDebtFrontmatter['status']): Resolution => ({
  disposition,
  resolved_at: timestamp,
  rationale: `The ${disposition} terminal state has a rationale.`,
});

describe('lifecycle status helpers', () => {
  it('lists only terminal statuses and classifies unknown statuses as active', () => {
    assert.deepStrictEqual(terminalStatuses(techDebtRecordType), [
      'done',
      'rejected',
      'superseded',
      'moved',
    ]);
    assert.strictEqual(statusIsTerminal(techDebtRecordType, 'done'), true);
    assert.strictEqual(statusIsTerminal(techDebtRecordType, 'open'), false);
    assert.strictEqual(statusIsTerminal(techDebtRecordType, 'unknown'), false);
  });
});

describe('lifecycle evidence validation', () => {
  it('rejects every terminal tech-debt state when rationale/evidence shape is missing', () => {
    const terminalCases = [
      {
        status: 'done',
        frontmatter: { status: 'done' },
        expectedCodes: [
          'lifecycle.resolution.required',
          'lifecycle.resolution.evidence_refs.required',
        ],
      },
      {
        status: 'rejected',
        frontmatter: { status: 'rejected' },
        expectedCodes: ['lifecycle.resolution.required'],
      },
      {
        status: 'superseded',
        frontmatter: { status: 'superseded', resolution: resolution('superseded') },
        expectedCodes: ['lifecycle.resolution.evidence_refs.required'],
      },
      {
        status: 'moved',
        frontmatter: { status: 'moved', resolution: resolution('moved') },
        expectedCodes: ['lifecycle.resolution.evidence_refs.required'],
      },
    ] as const;

    for (const testCase of terminalCases) {
      const record = techDebtRecord(testCase.frontmatter as Partial<TechDebtFrontmatter>);
      assert.deepStrictEqual(
        findingCodes(validateRecordLifecycle(techDebtRecordType, record)),
        testCase.expectedCodes,
        `expected ${testCase.status} to fail with the planned lifecycle finding`,
      );
    }
  });

  it('rejects active records that already carry terminal resolution metadata', () => {
    const record = techDebtRecord({
      resolution: {
        ...resolution('done'),
        evidence_refs: [{ kind: 'doc', ref: 'docs/decisions/accepted-remediation.md' }],
      },
    });

    assert.deepStrictEqual(findingCodes(validateRecordLifecycle(techDebtRecordType, record)), [
      'lifecycle.resolution.active_forbidden',
    ]);
  });

  it('accepts terminal tech-debt states only when the required rationale and evidence are present', () => {
    const record = techDebtRecord({
      status: 'done',
      resolution: {
        ...resolution('done'),
        evidence_refs: [{ kind: 'doc', ref: 'docs/decisions/accepted-remediation.md' }],
      },
    });

    assert.deepStrictEqual(validateRecordLifecycle(techDebtRecordType, record), []);
  });
});
