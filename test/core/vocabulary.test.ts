/* eslint-disable no-duplicate-imports, typescript-eslint/explicit-function-return-type -- fixture-heavy test file */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { assert, describe, it } from '@effect/vitest';

import { loadVocabularyFile } from '../../src/config/repo-context.js';
import type {
  IntrospectionVocabulary,
  VocabularyProvenance,
  VocabularyTerm,
} from '../../src/config/repo-context.js';
import { RecordStoreError } from '../../src/core/errors.js';
import {
  approveVocabularyTerm,
  deleteVocabularyTermIfUnused,
  listVocabularyTerms,
  mergeVocabularyTags,
  proposeVocabularyTerm,
  rejectVocabularyTerm,
  renameVocabularyTag,
  vocabularyUsage,
} from '../../src/core/vocabulary.js';
import { renderVocabularyToml } from '../../src/core/vocabulary-file.js';
import type { ParsedRecord } from '../../src/core/record-type-types.js';
import type { TechDebtFrontmatter } from '../../src/record-types/tech-debt-types.js';
import { createMarkdownRecordStore } from '../../src/store/markdown-record-store.js';

const timestamp = '2026-06-10T00:00:00Z';
const provenance: VocabularyProvenance = {
  kind: 'plan',
  ref: 'docs/design-input/introspection-seed-2026-06-01.md',
  noted_at: timestamp,
};

type MarkdownRecordStore = ReturnType<typeof createMarkdownRecordStore>;
type VocabularyServiceContext = Parameters<typeof proposeVocabularyTerm>[0]['context'] &
  Readonly<{ vocabulary: IntrospectionVocabulary }>;

const withTempRoot = async (testBody: (root: string) => Promise<void>): Promise<void> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'introspection-vocabulary-'));

  try {
    await testBody(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};

const term = (
  tag: string,
  status: VocabularyTerm['status'] = 'approved',
  description = `Controlled tag ${tag}`,
): VocabularyTerm => ({
  tag,
  status,
  description,
  provenance,
});

const vocabulary = (terms: ReadonlyArray<VocabularyTerm>): IntrospectionVocabulary => ({
  $schema: 'https://introspection.local/schemas/vocabulary.schema.json',
  schema_version: 1,
  terms,
});

const contextFor = (
  root: string,
  currentVocabulary = vocabulary([term('owner/mp'), term('topic/existing', 'provisional')]),
): VocabularyServiceContext => ({
  locksRoot: path.join(root, '.introspection/.locks'),
  recordsRoot: path.join(root, 'docs/records'),
  vocabulary: currentVocabulary,
  vocabularyPath: path.join(root, '.introspection/vocabulary.toml'),
});

const storeFor = (context: VocabularyServiceContext): MarkdownRecordStore =>
  createMarkdownRecordStore({ root: context.recordsRoot });

const seedVocabularyFile = async (context: VocabularyServiceContext): Promise<void> => {
  await mkdir(path.dirname(context.vocabularyPath), { recursive: true });
  await writeFile(context.vocabularyPath, renderVocabularyToml(context.vocabulary));
};

const techDebtRecord = (
  frontmatter: Partial<TechDebtFrontmatter> = {},
  body = [
    'Vocabulary service fixture.',
    '## Problem',
    'The vocabulary service needs a valid tech-debt-shaped record.',
    '## Why deferred',
    'This fixture supports vocabulary service tests.',
    '## Revisit trigger',
    'Revisit when vocabulary behavior changes.',
  ].join('\n\n'),
): ParsedRecord<TechDebtFrontmatter> => ({
  frontmatter: {
    schema_version: 1,
    id: 'BP-TD-007',
    repo_key: 'BP',
    record_type: 'tech-debt',
    number: 7,
    title: 'Vocabulary service fixture',
    status: 'open',
    type: 'introspection-record',
    category: 'tech-debt',
    visibility: 'local-only',
    created_at: timestamp,
    updated_at: timestamp,
    tags: [
      'record/tech-debt',
      'repo/backpressure',
      'status/open',
      'visibility/local-only',
      'owner/mp',
    ],
    source: {
      discovered_at: timestamp,
      refs: [{ kind: 'tracker', ref: 'docs/exec-plans/tech-debt-tracker.md#td-007' }],
    },
    ...frontmatter,
  } as TechDebtFrontmatter,
  body,
});

const errorCodeFrom = (error: unknown): unknown => {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return error.code;
  }

  return null;
};

const assertRejectsWithCode = async (promise: Promise<unknown>, code: string): Promise<void> => {
  try {
    await promise;
  } catch (error) {
    assert.strictEqual(errorCodeFrom(error), code);
    return;
  }

  assert.fail(`Expected promise to reject with code ${code}.`);
};

const recordTagsWith = (...tags: ReadonlyArray<string>): ReadonlyArray<string> => [
  ...techDebtRecord().frontmatter.tags,
  ...tags,
];

const createRecordWithVocabularyTags = async (
  store: MarkdownRecordStore,
  ...tags: ReadonlyArray<string>
): Promise<void> => {
  await store.createRecord(
    'tech-debt/open/bp-td-007.md',
    techDebtRecord({ tags: recordTagsWith(...tags) }),
  );
};

const runLifecycleFixture = async (root: string) => {
  const initialContext = contextFor(root);
  const store = storeFor(initialContext);
  await seedVocabularyFile(initialContext);
  await createRecordWithVocabularyTags(store, 'topic/new');
  const proposed = await proposeVocabularyTerm({
    context: initialContext,
    term: {
      tag: 'topic/new',
      description: 'A new proposed topic tag.',
      provenance,
    },
  });
  const approved = await approveVocabularyTerm({ context: initialContext, tag: 'topic/new' });
  const rejected = await rejectVocabularyTerm({ context: initialContext, tag: 'topic/new' });
  const [usage] = await vocabularyUsage({ ...initialContext, vocabulary: rejected }, store, [
    'topic/new',
  ]);
  const vocabularyFile = await readFile(initialContext.vocabularyPath, 'utf8');

  return { approved, proposed, rejected, usage, vocabularyFile };
};

const termStatus = (
  currentVocabulary: IntrospectionVocabulary,
  tag: string,
): VocabularyTerm['status'] | undefined =>
  currentVocabulary.terms.find((candidate) => candidate.tag === tag)?.status;

const assertLifecycleObservation = (
  observation: Awaited<ReturnType<typeof runLifecycleFixture>>,
): void => {
  assert.strictEqual(termStatus(observation.proposed, 'topic/new'), 'provisional');
  assert.strictEqual(termStatus(observation.approved, 'topic/new'), 'approved');
  assert.strictEqual(termStatus(observation.rejected, 'topic/new'), 'rejected');
  assert.deepStrictEqual(
    observation.rejected.terms.find((candidate) => candidate.tag === 'topic/new')?.provenance,
    provenance,
  );
  assert.deepStrictEqual(
    listVocabularyTerms(observation.rejected, { status: 'rejected' }).map(
      (candidate) => candidate.tag,
    ),
    ['topic/new'],
  );
  assert.deepStrictEqual(
    observation.usage?.records.map((record) => record.path),
    ['tech-debt/open/bp-td-007.md'],
  );
  assert.match(observation.vocabularyFile, /tag = "topic\/new"/u);
  assert.match(observation.vocabularyFile, /status = "rejected"/u);
};

const cascadeVocabulary = (): IntrospectionVocabulary =>
  vocabulary([term('owner/mp'), term('topic/old'), term('topic/source'), term('topic/target')]);

const prepareCascadeFixture = async (root: string) => {
  const context = contextFor(root, cascadeVocabulary());
  const store = storeFor(context);
  await seedVocabularyFile(context);
  const outsideMarkdown = path.join(root, 'docs/not-records.md');
  await mkdir(path.dirname(outsideMarkdown), { recursive: true });
  await writeFile(outsideMarkdown, 'Outside markdown keeps topic/old and topic/source.\n');
  await createRecordWithVocabularyTags(store, 'topic/old', 'topic/source');

  return { context, outsideMarkdown, store };
};

const runCascadeFixture = async (root: string) => {
  const { context, outsideMarkdown, store } = await prepareCascadeFixture(root);
  const renamed = await renameVocabularyTag({
    context,
    fromTag: 'topic/old',
    toTag: 'topic/new',
    store,
  });
  const merged = await mergeVocabularyTags({
    context,
    fromTag: 'topic/source',
    toTag: 'topic/target',
    store,
  });
  const record = await store.readRecord('tech-debt/open/bp-td-007.md');
  const outsideContent = await readFile(outsideMarkdown, 'utf8');

  return { merged, outsideContent, record, renamed };
};

const assertCascadeObservation = (
  observation: Awaited<ReturnType<typeof runCascadeFixture>>,
): void => {
  assert.deepStrictEqual(observation.renamed.changedRecordPaths, ['tech-debt/open/bp-td-007.md']);
  assert.deepStrictEqual(observation.merged.changedRecordPaths, ['tech-debt/open/bp-td-007.md']);
  assert.ok(observation.record.frontmatter.tags.includes('topic/new'));
  assert.ok(!observation.record.frontmatter.tags.includes('topic/old'));
  assert.ok(observation.record.frontmatter.tags.includes('topic/target'));
  assert.ok(!observation.record.frontmatter.tags.includes('topic/source'));
  assert.strictEqual(
    observation.outsideContent,
    'Outside markdown keeps topic/old and topic/source.\n',
  );
  assert.deepStrictEqual(
    observation.merged.vocabulary.terms.find((candidate) => candidate.tag === 'topic/new')?.aliases,
    ['topic/old'],
  );
  assert.deepStrictEqual(
    observation.merged.vocabulary.terms.find((candidate) => candidate.tag === 'topic/target')
      ?.aliases,
    ['topic/source'],
  );
};

describe('vocabulary lifecycle service', () => {
  it('proposes, approves, rejects, lists, and reports usage while preserving provenance', async () => {
    await withTempRoot(async (root) => {
      assertLifecycleObservation(await runLifecycleFixture(root));
    });
  });

  it('merges stale caller snapshots under the lock and rejects invalid aliases', async () => {
    await withTempRoot(async (root) => {
      const context = contextFor(root, vocabulary([term('owner/mp')]));
      await seedVocabularyFile(context);
      await writeFile(
        context.vocabularyPath,
        renderVocabularyToml(vocabulary([term('owner/mp'), term('topic/race')])),
      );
      const proposed = await proposeVocabularyTerm({
        context,
        term: { tag: 'topic/new', description: 'Race fixture.', provenance },
      });

      assert.deepStrictEqual(proposed.terms.map((candidate) => candidate.tag).sort(), [
        'owner/mp',
        'topic/new',
        'topic/race',
      ]);
      await assertRejectsWithCode(
        proposeVocabularyTerm({
          context,
          term: {
            tag: 'topic/new',
            aliases: ['topic/new'],
            description: 'Self alias fixture.',
            provenance,
          },
        }),
        'vocabulary.term.self_alias',
      );
      await assertRejectsWithCode(
        proposeVocabularyTerm({
          context,
          term: {
            tag: 'topic/other',
            aliases: ['topic/alt', 'topic/alt'],
            description: 'Duplicate alias fixture.',
            provenance,
          },
        }),
        'vocabulary.term.duplicate_values',
      );
    });
  });
});

const createSecondCascadeRecord = async (store: MarkdownRecordStore): Promise<void> => {
  await store.createRecord(
    'tech-debt/open/bp-td-008.md',
    techDebtRecord({
      id: 'BP-TD-008',
      number: 8,
      title: 'Second cascade fixture',
      tags: recordTagsWith('topic/source'),
    }),
  );
};

const storeFailingAfterFirstUpdate = (store: MarkdownRecordStore): MarkdownRecordStore => {
  let updateCount = 0;

  return {
    ...store,
    updateRecord: async (record, update) => {
      updateCount += 1;

      if (updateCount > 1) {
        throw new RecordStoreError(
          'test.injected_cascade_failure',
          'Injected cascade failure after first update.',
        );
      }

      return store.updateRecord(record, update);
    },
  };
};

describe('vocabulary cascade safety', () => {
  it('renames and merges tags only through the configured records-root store', async () => {
    await withTempRoot(async (root) => {
      assertCascadeObservation(await runCascadeFixture(root));
    });
  });

  it('keeps partial cascade failures retry-safe until rerun converges', async () => {
    await withTempRoot(async (root) => {
      const { context, store } = await prepareCascadeFixture(root);
      await createSecondCascadeRecord(store);

      await assertRejectsWithCode(
        mergeVocabularyTags({
          context,
          fromTag: 'topic/source',
          toTag: 'topic/target',
          store: storeFailingAfterFirstUpdate(store),
        }),
        'test.injected_cascade_failure',
      );

      const afterFailure = await loadVocabularyFile(context.vocabularyPath);
      assert.ok(afterFailure.terms.some((candidate) => candidate.tag === 'topic/source'));

      const result = await mergeVocabularyTags({
        context,
        fromTag: 'topic/source',
        toTag: 'topic/target',
        store,
      });
      const records = await store.listRecords();

      assert.deepStrictEqual(result.changedRecordPaths, ['tech-debt/open/bp-td-008.md']);
      assert.ok(records.every((record) => !record.frontmatter.tags.includes('topic/source')));
      assert.ok(records.every((record) => record.frontmatter.tags.includes('topic/target')));
    });
  });
});

describe('vocabulary mutation safety', () => {
  it('serializes concurrent proposals without losing either write', async () => {
    await withTempRoot(async (root) => {
      const context = contextFor(root, vocabulary([term('owner/mp')]));
      await seedVocabularyFile(context);

      await Promise.all([
        proposeVocabularyTerm({
          context,
          term: { tag: 'topic/one', description: 'First concurrent term.', provenance },
        }),
        proposeVocabularyTerm({
          context,
          term: { tag: 'topic/two', description: 'Second concurrent term.', provenance },
        }),
      ]);
      const finalVocabulary = await loadVocabularyFile(context.vocabularyPath);

      assert.deepStrictEqual(finalVocabulary.terms.map((candidate) => candidate.tag).sort(), [
        'owner/mp',
        'topic/one',
        'topic/two',
      ]);
    });
  });

  it('rejects caller-supplied stores outside the configured records root', async () => {
    await withTempRoot(async (root) => {
      const context = contextFor(root, vocabulary([term('owner/mp'), term('topic/old')]));
      const outsideStore = createMarkdownRecordStore({ root: path.join(root, 'outside-records') });
      await seedVocabularyFile(context);

      await assertRejectsWithCode(
        renameVocabularyTag({
          context,
          fromTag: 'topic/old',
          toTag: 'topic/new',
          store: outsideStore,
        }),
        'vocabulary.store_root_mismatch',
      );
    });
  });
});

describe('vocabulary delete safety', () => {
  it('fails when records still use a term and deletes only after usage reaches zero', async () => {
    await withTempRoot(async (root) => {
      const context = contextFor(root, vocabulary([term('owner/mp'), term('topic/unused')]));
      const store = storeFor(context);
      await seedVocabularyFile(context);
      await store.createRecord('tech-debt/open/bp-td-007.md', techDebtRecord());

      await assertRejectsWithCode(
        deleteVocabularyTermIfUnused({ context, tag: 'owner/mp', store }),
        'vocabulary.delete.term_in_use',
      );

      const deleted = await deleteVocabularyTermIfUnused({ context, tag: 'topic/unused', store });

      assert.strictEqual(deleted.deletedTag, 'topic/unused');
      assert.deepStrictEqual(
        deleted.vocabulary.terms.map((candidate) => candidate.tag),
        ['owner/mp'],
      );
    });
  });

  it('counts aliases as usage and rejects deleting the final vocabulary term', async () => {
    await withTempRoot(async (root) => {
      const context = contextFor(
        root,
        vocabulary([{ ...term('owner/mp'), aliases: ['owner/mark'] }]),
      );
      const store = storeFor(context);
      await seedVocabularyFile(context);
      await store.createRecord(
        'tech-debt/open/bp-td-007.md',
        techDebtRecord({ tags: recordTagsWith('owner/mark') }),
      );

      await assertRejectsWithCode(
        deleteVocabularyTermIfUnused({ context, tag: 'owner/mp', store }),
        'vocabulary.delete.last_term',
      );

      const twoTermContext = contextFor(
        root,
        vocabulary([{ ...term('owner/mp'), aliases: ['owner/mark'] }, term('topic/unused')]),
      );
      await seedVocabularyFile(twoTermContext);
      await assertRejectsWithCode(
        deleteVocabularyTermIfUnused({ context: twoTermContext, tag: 'owner/mp', store }),
        'vocabulary.delete.term_in_use',
      );
    });
  });
});
