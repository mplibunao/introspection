import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { assert, describe, it } from '@effect/vitest';

import { checkRecords, correctedMachineTags } from '../../src/core/validation.js';
import type {
  BaseRecordFrontmatter,
  ParsedRecord,
  ValidationContext,
} from '../../src/core/record-type-types.js';
import { recordTypeRegistry } from '../../src/record-types/registry.js';
import { techDebtRecordType } from '../../src/record-types/tech-debt.js';
import type { TechDebtFrontmatter } from '../../src/record-types/tech-debt-types.js';
import { createMarkdownRecordStore } from '../../src/store/markdown-record-store.js';

type CheckReport = Awaited<ReturnType<typeof checkRecords>>;

const timestamp = '2026-06-10T00:00:00Z';
const validationContext: ValidationContext = {
  repoKey: 'BP',
  repoSlug: 'backpressure',
  recordsRoot: '/tmp/docs/records',
};

const withTempRoot = async (testBody: (root: string) => Promise<void>): Promise<void> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'introspection-validation-'));

  try {
    await testBody(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};

const techDebtRecord = (
  frontmatter: Omit<Partial<TechDebtFrontmatter>, 'record_type'> & {
    readonly record_type?: string;
  } = {},
  body = [
    'Validation service fixture.',
    '## Problem',
    'The validation engine needs a realistic tech-debt-shaped record.',
    '## Why deferred',
    'This fixture supports validation service tests.',
    '## Revisit trigger',
    'Revisit when validation behavior changes.',
  ].join('\n\n'),
): ParsedRecord => ({
  frontmatter: {
    schema_version: 1,
    id: 'BP-TD-007',
    repo_key: 'BP',
    record_type: 'tech-debt',
    number: 7,
    title: 'Validation service fixture',
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
  } satisfies BaseRecordFrontmatter,
  body,
});

const writeRawRecord = async (
  root: string,
  relativePath: string,
  content: string,
): Promise<void> => {
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
};

const findingCodes = (report: CheckReport): ReadonlyArray<string> =>
  report.findings.map((finding) => finding.code);

const findingsByCode = (
  report: CheckReport,
  code: string,
): ReadonlyArray<CheckReport['findings'][number]> =>
  report.findings.filter((finding) => finding.code === code);

const checkSingleRecord = async (
  root: string,
  record: ParsedRecord,
  context: ValidationContext = validationContext,
): Promise<CheckReport> => {
  const store = createMarkdownRecordStore({ root });
  await store.createRecord('tech-debt/open/bp-td-007.md', record);

  return checkRecords({ context, registry: recordTypeRegistry, store });
};

describe('check service corpus behavior', () => {
  it('marks a clean corpus ok with no findings', async () => {
    await withTempRoot(async (root) => {
      const report = await checkSingleRecord(root, techDebtRecord());

      assert.strictEqual(report.ok, true);
      assert.strictEqual(report.checkedRecordCount, 1);
      assert.strictEqual(report.failedReadCount, 0);
      assert.deepStrictEqual(report.findings, []);
    });
  });

  it('turns one malformed record into a finding and still validates the rest of the corpus', async () => {
    await withTempRoot(async (root) => {
      const store = createMarkdownRecordStore({ root });
      await store.createRecord('tech-debt/open/bp-td-007.md', techDebtRecord());
      await writeRawRecord(
        root,
        'tech-debt/open/bad.md',
        ['---', 'title: [unterminated', '---', 'Body'].join('\n'),
      );

      const report = await checkRecords({
        context: validationContext,
        registry: recordTypeRegistry,
        store,
      });

      assert.strictEqual(report.ok, false);
      assert.strictEqual(report.checkedRecordCount, 1);
      assert.strictEqual(report.failedReadCount, 1);
      assert.deepStrictEqual(findingCodes(report), ['frontmatter.parse_error']);
      assert.match(report.findings[0]?.remediation ?? '', /Fix this record/u);
    });
  });

  it('reports duplicate IDs through the check service with corpus-level remediation', async () => {
    await withTempRoot(async (root) => {
      const store = createMarkdownRecordStore({ root });
      await store.createRecord('tech-debt/open/bp-td-007.md', techDebtRecord());
      await store.createRecord(
        'tech-debt/open/duplicate.md',
        techDebtRecord({ title: 'Duplicate ID fixture' }),
      );

      const report = await checkRecords({
        context: validationContext,
        registry: recordTypeRegistry,
        store,
      });

      assert.ok(findingCodes(report).includes('id.duplicate'));
      const [duplicateFinding] = findingsByCode(report, 'id.duplicate');
      assert.match(duplicateFinding?.remediation ?? '', /tech-debt\/open\/bp-td-007\.md/u);
      assert.match(duplicateFinding?.remediation ?? '', /tech-debt\/open\/duplicate\.md/u);
      assert.ok(!(duplicateFinding?.remediation ?? '').includes(root));
    });
  });
});

describe('schema, link, and version findings', () => {
  it('emits an unsupported record-type finding before record-type schema validation', async () => {
    await withTempRoot(async (root) => {
      const report = await checkSingleRecord(root, techDebtRecord({ record_type: 'unknown-type' }));
      const [finding] = findingsByCode(report, 'record_type.unsupported');

      assert.strictEqual(report.ok, false);
      assert.deepStrictEqual(finding?.path, ['record_type']);
      assert.strictEqual(finding?.severity, 'error');
      assert.match(finding?.message ?? '', /unknown-type/u);
      assert.match(finding?.remediation ?? '', /tech-debt/u);
    });
  });

  it('emits an unsupported schema-version finding with migration-first remediation', async () => {
    await withTempRoot(async (root) => {
      const report = await checkSingleRecord(
        root,
        techDebtRecord({
          schema_version: 2,
          tags: ['record/tech-debt'],
        }),
      );

      assert.deepStrictEqual(findingCodes(report), ['schema_version.unsupported']);
      assert.match(
        findingsByCode(report, 'schema_version.unsupported')[0]?.remediation ?? '',
        /Migrate this record to schema_version 1/u,
      );
    });
  });

  it('does not duplicate lifecycle findings when record-type validation overlaps core validation', async () => {
    await withTempRoot(async (root) => {
      const report = await checkSingleRecord(
        root,
        techDebtRecord({
          status: 'done',
          tags: ['record/tech-debt', 'repo/backpressure', 'status/done', 'visibility/local-only'],
          resolution: {
            disposition: 'done',
            resolved_at: timestamp,
            rationale: 'The done state still needs concrete evidence refs.',
          },
        }),
      );

      assert.deepStrictEqual(
        findingCodes(report).filter(
          (code) => code === 'lifecycle.resolution.evidence_refs.required',
        ),
        ['lifecycle.resolution.evidence_refs.required'],
      );
    });
  });
});

describe('schema link findings', () => {
  it('uses JSON Schema to reject malformed evidence link shape', async () => {
    await withTempRoot(async (root) => {
      const store = createMarkdownRecordStore({ root });
      await writeRawRecord(
        root,
        'tech-debt/open/bp-td-007.md',
        [
          '---',
          'schema_version: 1',
          'id: BP-TD-007',
          'repo_key: BP',
          'record_type: tech-debt',
          'number: 7',
          'title: Bad evidence link fixture',
          'status: open',
          'type: introspection-record',
          'category: tech-debt',
          'visibility: local-only',
          `created_at: "${timestamp}"`,
          `updated_at: "${timestamp}"`,
          'tags: [record/tech-debt, repo/backpressure, status/open, visibility/local-only]',
          'source:',
          `  discovered_at: "${timestamp}"`,
          '  refs:',
          '    - kind: doc',
          '---',
          'A malformed evidence ref is parseable YAML but invalid frontmatter schema.',
        ].join('\n'),
      );

      const report = await checkRecords({
        context: validationContext,
        registry: recordTypeRegistry,
        store,
      });

      assert.ok(findingCodes(report).includes('schema.violation'));
      const schemaViolation = report.findings.find(
        (finding) => finding.code === 'schema.violation',
      );
      assert.deepStrictEqual(schemaViolation?.path, ['source', 'refs', 0, 'ref']);
      assert.match(schemaViolation?.remediation ?? '', /match the record-type JSON Schema/u);
    });
  });
});

describe('ID and repo invariants', () => {
  it('reports repo-key, ID-shape, and number mismatches with stable finding paths', async () => {
    await withTempRoot(async (root) => {
      const store = createMarkdownRecordStore({ root });
      await store.createRecord(
        'tech-debt/open/repo-mismatch.md',
        techDebtRecord({ id: 'OTHER-TD-007', repo_key: 'OTHER' }),
      );
      await store.createRecord('tech-debt/open/invalid-id.md', techDebtRecord({ id: 'NOT-A-TD' }));
      await store.createRecord(
        'tech-debt/open/number-mismatch.md',
        techDebtRecord({ id: 'BP-TD-008', number: 7 }),
      );

      const report = await checkRecords({
        context: validationContext,
        registry: recordTypeRegistry,
        store,
      });

      assert.deepStrictEqual(
        findingCodes(report)
          .filter((code) =>
            ['repo_key.mismatch', 'id.invalid_for_record_type', 'id.number_mismatch'].includes(
              code,
            ),
          )
          .sort(),
        [
          'id.invalid_for_record_type',
          'id.invalid_for_record_type',
          'id.number_mismatch',
          'repo_key.mismatch',
        ],
      );
      assert.deepStrictEqual(findingsByCode(report, 'repo_key.mismatch')[0]?.path, ['repo_key']);
      assert.deepStrictEqual(findingsByCode(report, 'id.invalid_for_record_type')[0]?.path, ['id']);
      assert.deepStrictEqual(findingsByCode(report, 'id.number_mismatch')[0]?.path, ['number']);
    });
  });
});

describe('machine-derived tag invariants', () => {
  it('fails when machine-derived tags are missing', async () => {
    await withTempRoot(async (root) => {
      const report = await checkSingleRecord(
        root,
        techDebtRecord({
          tags: ['repo/backpressure', 'status/open', 'visibility/local-only'],
        }),
      );

      assert.ok(findingCodes(report).includes('tag.machine_derived.missing'));
      const [missingTagFinding] = findingsByCode(report, 'tag.machine_derived.missing');
      assert.strictEqual(missingTagFinding?.recordPath, 'tech-debt/open/bp-td-007.md');
      assert.match(missingTagFinding?.remediation ?? '', /check --fix/u);
    });
  });

  it('fails when machine-owned status tags are stale', async () => {
    await withTempRoot(async (root) => {
      const report = await checkSingleRecord(
        root,
        techDebtRecord({
          tags: [
            'record/tech-debt',
            'repo/backpressure',
            'status/open',
            'status/done',
            'visibility/local-only',
            'owner/mp',
          ],
        }),
      );

      assert.deepStrictEqual(
        findingCodes(report).filter((code) => code === 'tag.machine_derived.stale'),
        ['tag.machine_derived.stale'],
      );
      assert.deepStrictEqual(
        correctedMachineTags(techDebtRecordType, techDebtRecord(), validationContext),
        ['record/tech-debt', 'repo/backpressure', 'status/open', 'visibility/local-only'],
      );
    });
  });

  it('preserves context-dependent repo tags while correcting derivable machine tags', () => {
    const record = techDebtRecord({
      tags: [
        'record/tech-debt',
        'repo/old-slug',
        'status/done',
        'visibility/local-only',
        'owner/mp',
      ],
    });

    assert.deepStrictEqual(correctedMachineTags(techDebtRecordType, record, { repoKey: 'BP' }), [
      'record/tech-debt',
      'status/open',
      'visibility/local-only',
      'repo/old-slug',
      'owner/mp',
    ]);
  });
});

describe('machine-derived repo and context invariants', () => {
  it('fails when repo and visibility machine tags are stale or missing', async () => {
    await withTempRoot(async (root) => {
      const report = await checkSingleRecord(
        root,
        techDebtRecord({
          tags: ['record/tech-debt', 'repo/old-slug', 'status/open'],
        }),
      );

      assert.ok(findingCodes(report).includes('tag.machine_derived.missing'));
      assert.ok(findingCodes(report).includes('tag.machine_derived.stale'));
      assert.match(
        findingsByCode(report, 'tag.machine_derived.stale')[0]?.remediation ?? '',
        /repo\/backpressure/u,
      );
    });
  });

  it('does not mark repo tags stale when repo slug context is missing', async () => {
    await withTempRoot(async (root) => {
      const report = await checkSingleRecord(
        root,
        techDebtRecord({
          tags: [
            'record/tech-debt',
            'repo/old-slug',
            'status/open',
            'status/done',
            'visibility/local-only',
          ],
        }),
        { repoKey: 'BP', recordsRoot: root },
      );

      const [missingContextFinding] = findingsByCode(
        report,
        'validation.context.repoSlug.required',
      );
      const staleFindings = findingsByCode(report, 'tag.machine_derived.stale');

      assert.match(missingContextFinding?.message ?? '', /repo\/<slug>/u);
      assert.deepStrictEqual(
        staleFindings.map((finding) => finding.message),
        ['Machine-owned tag "status/done" is not valid for this record state.'],
      );
    });
  });
});
