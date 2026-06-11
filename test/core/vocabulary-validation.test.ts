import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { assert, describe, it } from '@effect/vitest';

import type {
  IntrospectionVocabulary,
  VocabularyProvenance,
  VocabularyTerm,
} from '../../src/config/repo-context.js';
import { checkRecords } from '../../src/core/validation.js';
import { proposeVocabularyTerm, renderVocabularyToml } from '../../src/core/vocabulary.js';
import type { ParsedRecord, ValidationContext } from '../../src/core/record-type-types.js';
import { recordTypeRegistry } from '../../src/record-types/registry.js';
import type { TechDebtFrontmatter } from '../../src/record-types/tech-debt-types.js';
import { createMarkdownRecordStore } from '../../src/store/markdown-record-store.js';

const timestamp = '2026-06-10T00:00:00Z';
const provenance: VocabularyProvenance = {
  kind: 'plan',
  ref: 'docs/exec-plans/active/introspection-v1-bootstrap-2026-06-10.md#wi-08',
  noted_at: timestamp,
};

type MarkdownRecordStore = ReturnType<typeof createMarkdownRecordStore>;
type VocabularyServiceContext = Parameters<typeof proposeVocabularyTerm>[0]['context'] &
  Readonly<{ vocabulary: IntrospectionVocabulary }>;
type CheckReport = Awaited<ReturnType<typeof checkRecords>>;

const withTempRoot = async (testBody: (root: string) => Promise<void>): Promise<void> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'introspection-vocabulary-validation-'));

  try {
    await testBody(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};

const term = (tag: string, status: VocabularyTerm['status'] = 'approved'): VocabularyTerm => ({
  tag,
  status,
  description: `Controlled tag ${tag}`,
  provenance,
});

const vocabulary = (terms: ReadonlyArray<VocabularyTerm>): IntrospectionVocabulary => ({
  $schema: 'https://introspection.local/schemas/vocabulary.schema.json',
  schema_version: 1,
  terms,
});

const contextFor = (
  root: string,
  currentVocabulary: IntrospectionVocabulary,
): VocabularyServiceContext => ({
  locksRoot: path.join(root, '.introspection/.locks'),
  recordsRoot: path.join(root, 'docs/records'),
  vocabulary: currentVocabulary,
  vocabularyPath: path.join(root, '.introspection/vocabulary.toml'),
});

const validationContextFor = (
  root: string,
  currentVocabulary: IntrospectionVocabulary,
): ValidationContext => ({
  repoKey: 'BP',
  repoSlug: 'backpressure',
  recordsRoot: path.join(root, 'docs/records'),
  vocabulary: currentVocabulary,
});

const storeFor = (context: VocabularyServiceContext): MarkdownRecordStore =>
  createMarkdownRecordStore({ root: context.recordsRoot });

const seedVocabularyFile = async (context: VocabularyServiceContext): Promise<void> => {
  await mkdir(path.dirname(context.vocabularyPath), { recursive: true });
  await writeFile(context.vocabularyPath, renderVocabularyToml(context.vocabulary));
};

const techDebtRecord = (tags: ReadonlyArray<string>): ParsedRecord<TechDebtFrontmatter> => ({
  frontmatter: {
    schema_version: 1,
    id: 'BP-TD-007',
    repo_key: 'BP',
    record_type: 'tech-debt',
    number: 7,
    title: 'Vocabulary validation fixture',
    status: 'open',
    type: 'introspection-record',
    category: 'tech-debt',
    visibility: 'local-only',
    created_at: timestamp,
    updated_at: timestamp,
    tags,
    source: {
      discovered_at: timestamp,
      refs: [{ kind: 'tracker', ref: 'docs/exec-plans/tech-debt-tracker.md#td-007' }],
    },
  } as TechDebtFrontmatter,
  body: [
    'Vocabulary validation fixture.',
    '## Problem',
    'The vocabulary validator needs a valid tech-debt-shaped record.',
    '## Why deferred',
    'This fixture supports WI-08 validation tests.',
    '## Revisit trigger',
    'Revisit when vocabulary validation changes.',
  ].join('\n\n'),
});

const recordTagsWith = (...tags: ReadonlyArray<string>): ReadonlyArray<string> => [
  'record/tech-debt',
  'repo/backpressure',
  'status/open',
  'visibility/local-only',
  'owner/mp',
  ...tags,
];

const createRecord = async (
  store: MarkdownRecordStore,
  tags: ReadonlyArray<string>,
): Promise<void> => {
  await store.createRecord('tech-debt/open/bp-td-007.md', techDebtRecord(tags));
};

const findingCodes = (report: CheckReport): ReadonlyArray<string> =>
  report.findings.map((finding) => finding.code);

const checkStore = async (
  root: string,
  currentVocabulary: IntrospectionVocabulary,
  store: MarkdownRecordStore,
): Promise<CheckReport> =>
  checkRecords({
    context: validationContextFor(root, currentVocabulary),
    registry: recordTypeRegistry,
    store,
  });

const checkVocabularyOnly = async (
  root: string,
  currentVocabulary: IntrospectionVocabulary,
): Promise<CheckReport> => {
  const context = contextFor(root, currentVocabulary);
  await mkdir(context.recordsRoot, { recursive: true });

  return checkStore(root, currentVocabulary, storeFor(context));
};

interface UnknownTagObservation {
  readonly proposedReport: CheckReport;
  readonly unknownReport: CheckReport;
}

const runUnknownTagFixture = async (root: string): Promise<UnknownTagObservation> => {
  const initialContext = contextFor(root, vocabulary([term('owner/mp')]));
  const store = storeFor(initialContext);
  await seedVocabularyFile(initialContext);
  await createRecord(store, recordTagsWith('topic/new'));
  const unknownReport = await checkStore(root, initialContext.vocabulary, store);
  const proposed = await proposeVocabularyTerm({
    context: initialContext,
    term: {
      tag: 'topic/new',
      description: 'Explicitly proposed topic tag.',
      provenance,
    },
  });
  const proposedReport = await checkStore(root, proposed, store);

  return { proposedReport, unknownReport };
};

const assertUnknownTagObservation = (observation: UnknownTagObservation): void => {
  assert.strictEqual(observation.unknownReport.ok, false);
  assert.ok(findingCodes(observation.unknownReport).includes('tag.vocabulary.unknown'));
  assert.match(
    observation.unknownReport.findings.find((finding) => finding.code === 'tag.vocabulary.unknown')
      ?.remediation ?? '',
    /vocab propose/u,
  );
  assert.strictEqual(observation.proposedReport.ok, true);
};

describe('WI-08 unknown-tag validation', () => {
  it('turns unknown raw tags into remediation findings and accepts explicit provisional proposals', async () => {
    await withTempRoot(async (root) => {
      assertUnknownTagObservation(await runUnknownTagFixture(root));
    });
  });
});

describe('WI-08 rejected and alias validation', () => {
  it('rejects aliases and rejected terms with direct remediation', async () => {
    await withTempRoot(async (root) => {
      const currentVocabulary = vocabulary([
        { ...term('owner/mp'), aliases: ['owner/mark'] },
        term('topic/rejected', 'rejected'),
      ]);
      const context = contextFor(root, currentVocabulary);
      const store = storeFor(context);
      await createRecord(
        store,
        recordTagsWith('owner/mark', 'topic/rejected').filter((tag) => tag !== 'owner/mp'),
      );
      const report = await checkStore(root, currentVocabulary, store);

      assert.deepStrictEqual([...findingCodes(report)].sort(), [
        'tag.vocabulary.alias',
        'tag.vocabulary.rejected',
      ]);
      assert.match(
        report.findings.find((finding) => finding.code === 'tag.vocabulary.alias')?.remediation ??
          '',
        /owner\/mp/u,
      );
    });
  });

  it('treats aliases of rejected terms as rejected instead of canonical replacements', async () => {
    await withTempRoot(async (root) => {
      const currentVocabulary = vocabulary([
        term('owner/mp'),
        { ...term('topic/rejected', 'rejected'), aliases: ['topic/old'] },
      ]);
      const context = contextFor(root, currentVocabulary);
      const store = storeFor(context);
      await createRecord(store, recordTagsWith('topic/old'));
      const report = await checkStore(root, currentVocabulary, store);
      const [finding] = report.findings;

      assert.strictEqual(report.ok, false);
      assert.strictEqual(finding?.code, 'tag.vocabulary.rejected');
      assert.match(finding?.remediation ?? '', /Remove "topic\/old"/u);
      assert.notMatch(finding?.remediation ?? '', /Replace/u);
    });
  });
});

describe('WI-08 vocabulary integrity validation', () => {
  it('rejects duplicate canonical tags from hand-edited vocabulary files', async () => {
    await withTempRoot(async (root) => {
      const report = await checkVocabularyOnly(
        root,
        vocabulary([term('owner/mp'), term('owner/mp')]),
      );

      assert.strictEqual(report.ok, false);
      assert.ok(findingCodes(report).includes('vocabulary.integrity.duplicate_tag'));
    });
  });

  it('rejects alias and canonical tag collisions', async () => {
    await withTempRoot(async (root) => {
      const report = await checkVocabularyOnly(
        root,
        vocabulary([{ ...term('owner/mp'), aliases: ['topic/shared'] }, term('topic/shared')]),
      );

      assert.strictEqual(report.ok, false);
      assert.ok(findingCodes(report).includes('vocabulary.integrity.duplicate_tag'));
    });
  });

  it('rejects aliases reused across multiple terms', async () => {
    await withTempRoot(async (root) => {
      const report = await checkVocabularyOnly(
        root,
        vocabulary([
          { ...term('owner/mp'), aliases: ['owner/mark'] },
          { ...term('topic/research'), aliases: ['owner/mark'] },
        ]),
      );

      assert.strictEqual(report.ok, false);
      assert.ok(findingCodes(report).includes('vocabulary.integrity.duplicate_tag'));
    });
  });

  it('rejects self aliases and machine-owned canonical or alias tags', async () => {
    await withTempRoot(async (root) => {
      const report = await checkVocabularyOnly(
        root,
        vocabulary([
          { ...term('record/tech-debt'), aliases: ['record/tech-debt'] },
          { ...term('owner/mp'), aliases: ['status/open'] },
        ]),
      );
      const codes = findingCodes(report);

      assert.strictEqual(report.ok, false);
      assert.ok(codes.includes('vocabulary.integrity.self_alias'));
      assert.ok(codes.includes('vocabulary.integrity.machine_owned'));
    });
  });
});
