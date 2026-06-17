import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { assert, describe, it } from '@effect/vitest';

import {
  buildBackpressureTechDebtImport,
  correctedBunMigrationRef,
  parseBackpressureTechDebtTracker,
  renderBackpressureTechDebtImportReport,
  staleBunMigrationRef,
  writeBackpressureTechDebtImport,
} from '../../src/importers/backpressure-tech-debt.js';
import { nextRecordNumber } from '../../src/core/id.js';
import { checkRecords } from '../../src/core/validation.js';
import { recordTypeRegistry } from '../../src/record-types/registry.js';
import { techDebtRecordType } from '../../src/record-types/tech-debt.js';
import { createMarkdownRecordStore } from '../../src/store/markdown-record-store.js';

const fixturePath = path.join('test', 'fixtures', 'backpressure-tech-debt-tracker.md');
const expectedOriginalIds = [
  'TD-001',
  'TD-002',
  'TD-003',
  'TD-004',
  'TD-006',
  'TD-007',
  'TD-008',
  'TD-009',
  'TD-010',
  'TD-011',
];
const legacyNumberFromId = (id: string): number => Number.parseInt(id.slice('TD-'.length), 10);
const expectedLegacyNumbers = expectedOriginalIds.map(legacyNumberFromId);
const expectedNextNumber = legacyNumberFromId('TD-012');
const preservedReactPresetNumber = legacyNumberFromId('TD-007');
const expectedReportRows = [
  ['TD-001', 'BP-TD-001', 'rejected', 'rejected'],
  ['TD-002', 'BP-TD-002', 'superseded', 'superseded'],
  ['TD-003', 'BP-TD-003', 'superseded', 'superseded'],
  ['TD-004', 'BP-TD-004', 'rejected', 'rejected'],
  ['TD-006', 'BP-TD-006', 'superseded', 'superseded'],
  ['TD-007', 'BP-TD-007', 'open', 'kept-open'],
  ['TD-008', 'BP-TD-008', 'open', 'kept-open'],
  ['TD-009', 'BP-TD-009', 'open', 'kept-open'],
  ['TD-010', 'BP-TD-010', 'open', 'kept-open'],
  ['TD-011', 'BP-TD-011', 'open', 'kept-open'],
] as const;
const expectedRelativePaths = [
  'tech-debt/rejected/bp-td-001.md',
  'tech-debt/superseded/bp-td-002.md',
  'tech-debt/superseded/bp-td-003.md',
  'tech-debt/rejected/bp-td-004.md',
  'tech-debt/superseded/bp-td-006.md',
  'tech-debt/open/bp-td-007.md',
  'tech-debt/open/bp-td-008.md',
  'tech-debt/open/bp-td-009.md',
  'tech-debt/open/bp-td-010.md',
  'tech-debt/open/bp-td-011.md',
];
const validationContext = {
  repoKey: 'BP',
  repoSlug: 'backpressure',
  recordsRoot: '/tmp/docs/records',
};

const trackerFixture = async (): Promise<string> => readFile(fixturePath, 'utf8');

const withTempRoot = async (testBody: (root: string) => Promise<void>): Promise<void> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'introspection-backpressure-import-'));

  try {
    await testBody(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};

describe('legacy backpressure tech-debt parsing', () => {
  it('parses every original TD entry while preserving the TD-005 legacy gap', async () => {
    const entries = parseBackpressureTechDebtTracker(await trackerFixture());

    assert.deepStrictEqual(
      entries.map((entry) => entry.originalId),
      expectedOriginalIds,
    );
    assert.deepStrictEqual(
      entries.map((entry) => entry.number),
      expectedLegacyNumbers,
    );
    assert.strictEqual(
      entries.some((entry) => entry.originalId === 'TD-005'),
      false,
    );
  });
});

describe('backpressure tech-debt import mapping', () => {
  it('accounts for every legacy entry with the expected status, disposition, report row, and path', async () => {
    const result = buildBackpressureTechDebtImport({ markdown: await trackerFixture() });

    assert.deepStrictEqual(result.report.legacyGapIds, ['TD-005']);
    assert.strictEqual(result.records.length, expectedOriginalIds.length);
    assert.strictEqual(result.report.nextNumber, expectedNextNumber);
    assert.deepStrictEqual(
      result.report.rows.map((row) => [row.originalId, row.recordId, row.status, row.disposition]),
      expectedReportRows.map((row) => [...row]),
    );
    assert.deepStrictEqual(
      result.report.rows.map((row) => row.relativePath),
      expectedRelativePaths,
    );
  });

  it('preserves legacy numbers so allocator scanning resumes at max plus one', async () => {
    const result = buildBackpressureTechDebtImport({ markdown: await trackerFixture() });
    const records = result.records.map((importedRecord) => importedRecord.record);

    assert.strictEqual(
      records.find((record) => record.frontmatter.id === 'BP-TD-007')?.frontmatter.number,
      preservedReactPresetNumber,
    );
    assert.strictEqual(
      nextRecordNumber(records, { repoKey: 'BP', recordType: techDebtRecordType }),
      expectedNextNumber,
    );
  });
});

describe('backpressure tech-debt import record details', () => {
  it('keeps terminal dispositions explicit while leaving active records unresolved', async () => {
    const result = buildBackpressureTechDebtImport({ markdown: await trackerFixture() });
    const recordsByLegacyId = new Map(
      result.records.map((importedRecord) => [
        importedRecord.legacyEntry.originalId,
        importedRecord.record,
      ]),
    );

    assert.strictEqual(
      recordsByLegacyId.get('TD-001')?.frontmatter.resolution?.disposition,
      'rejected',
    );
    assert.strictEqual(
      recordsByLegacyId.get('TD-002')?.frontmatter.resolution?.disposition,
      'superseded',
    );
    assert.deepStrictEqual(recordsByLegacyId.get('TD-006')?.frontmatter.resolution?.evidence_refs, [
      { kind: 'doc', ref: 'docs/design-docs/rule-intake.md' },
    ]);
    assert.strictEqual('resolution' in (recordsByLegacyId.get('TD-007')?.frontmatter ?? {}), false);
  });

  it('corrects TD-011 stale bun migration refs in the generated record body', async () => {
    const result = buildBackpressureTechDebtImport({ markdown: await trackerFixture() });
    const td011 = result.records.find(
      (importedRecord) => importedRecord.legacyEntry.originalId === 'TD-011',
    );

    assert.ok(td011);
    assert.match(td011.record.body, new RegExp(correctedBunMigrationRef, 'u'));
    assert.strictEqual(td011.record.body.includes(staleBunMigrationRef), false);
  });

  it('renders a human-readable report listing every original ID and disposition', async () => {
    const result = buildBackpressureTechDebtImport({ markdown: await trackerFixture() });
    const report = renderBackpressureTechDebtImportReport(result.report);

    for (const [originalId, recordId, status, disposition] of expectedReportRows) {
      assert.match(
        report,
        new RegExp(`\\| ${originalId} \\| ${recordId} \\| ${status} \\| ${disposition} \\|`, 'u'),
      );
    }
    assert.match(report, new RegExp(`Next number: ${expectedNextNumber}`, 'u'));
  });
});

describe('backpressure tech-debt import validation', () => {
  it('writes imported records that pass the existing tech-debt validation engine', async () => {
    await withTempRoot(async (root) => {
      const store = createMarkdownRecordStore({ root });
      const result = await writeBackpressureTechDebtImport({
        markdown: await trackerFixture(),
        store,
      });
      const report = await checkRecords({
        context: { ...validationContext, recordsRoot: root },
        registry: recordTypeRegistry,
        store,
      });

      assert.strictEqual(result.storedRecords.length, expectedOriginalIds.length);
      assert.strictEqual(report.ok, true);
      assert.strictEqual(report.checkedRecordCount, expectedOriginalIds.length);
      assert.deepStrictEqual(report.findings, []);
    });
  });
});
