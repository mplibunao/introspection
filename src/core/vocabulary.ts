import path from 'node:path';

import { loadVocabularyFile } from '../config/repo-context.js';
// eslint-disable-next-line no-duplicate-imports -- Import-style rules require top-level type imports next to this runtime import.
import type { IntrospectionVocabulary, VocabularyTerm } from '../config/repo-context.js';
import { withLocalNamedLock } from '../store/local-lock.js';
import type { StoredMarkdownRecord } from '../store/markdown-record-store.js';
import { IntrospectionError } from './errors.js';
import type { ParsedRecord } from './record-type-types.js';
import { tagConformsToGrammar, tagIsMachineOwned } from './tags.js';
import { renderVocabularyToml, sortedTerms, writeVocabularyFile } from './vocabulary-file.js';
import type {
  DeleteVocabularyTermRequest,
  DeleteVocabularyTermResult,
  MergeVocabularyTagRequest,
  ProposeVocabularyTermRequest,
  RenameVocabularyTagRequest,
  VocabularyCascadeResult,
  VocabularyListOptions,
  VocabularyMutationContext,
  VocabularyRecordStore,
  VocabularyReadContext,
  VocabularyTermInput,
  VocabularyTermMutationRequest,
  VocabularyUsageEntry,
} from './vocabulary-types.js';
import {
  findTermByTagOrAlias,
  vocabularyIntegrityFindings,
  vocabularyTagFindings,
} from './vocabulary-validation.js';

class VocabularyServiceError extends IntrospectionError {}
const vocabularyLockName = 'vocabulary.lock';

const assertValidVocabularyTag = (tag: string): void => {
  if (!tagConformsToGrammar(tag)) {
    throw new VocabularyServiceError(
      'vocabulary.tag.invalid',
      'Vocabulary tags must use the GNO-compatible lowercase hierarchical tag grammar.',
      { tag },
    );
  }

  if (tagIsMachineOwned(tag)) {
    throw new VocabularyServiceError(
      'vocabulary.tag.machine_owned',
      'Machine-owned tags are derived by record types and cannot be managed as record-local vocabulary terms.',
      { tag },
    );
  }
};

const findTerm = (vocabulary: IntrospectionVocabulary, tag: string): VocabularyTerm | undefined =>
  vocabulary.terms.find((term) => term.tag === tag);

const assertTermExists = (vocabulary: IntrospectionVocabulary, tag: string): VocabularyTerm => {
  const term = findTerm(vocabulary, tag);

  if (!term) {
    throw new VocabularyServiceError(
      'vocabulary.term.not_found',
      'Vocabulary term was not found.',
      {
        tag,
      },
    );
  }

  return term;
};

const assertVocabularyIntegrity = (vocabulary: IntrospectionVocabulary): void => {
  const findings = vocabularyIntegrityFindings(vocabulary);

  if (findings.length > 0) {
    throw new VocabularyServiceError(
      'vocabulary.integrity.invalid',
      'Vocabulary file has integrity violations that must be fixed before mutation.',
      { findings },
    );
  }
};

const assertTermDoesNotExist = (vocabulary: IntrospectionVocabulary, tag: string): void => {
  if (findTermByTagOrAlias(vocabulary, tag)) {
    throw new VocabularyServiceError(
      'vocabulary.term.exists',
      'Vocabulary term or alias already exists.',
      { tag },
    );
  }
};

const assertStoreRootMatchesContext = (
  context: VocabularyMutationContext,
  store: VocabularyRecordStore,
): void => {
  if (path.resolve(store.root) !== path.resolve(context.recordsRoot)) {
    throw new VocabularyServiceError(
      'vocabulary.store_root_mismatch',
      'Vocabulary record mutations must use a store rooted at the configured records root.',
      { recordsRoot: context.recordsRoot, storeRoot: store.root },
    );
  }
};

const uniqueStrings = (values: ReadonlyArray<string>): ReadonlyArray<string> => [
  ...new Set(values),
];

const duplicateValues = (values: ReadonlyArray<string>): ReadonlyArray<string> =>
  values.filter((value, index) => values.indexOf(value) !== index);

const optionalAliases = (
  aliases: ReadonlyArray<string> | undefined,
): Pick<VocabularyTerm, 'aliases'> | Record<string, never> => {
  if (!aliases || aliases.length === 0) {
    return {};
  }

  return { aliases: [...aliases] };
};

const optionalAppliesTo = (
  appliesTo: ReadonlyArray<string> | undefined,
): Pick<VocabularyTerm, 'applies_to'> | Record<string, never> => {
  if (!appliesTo || appliesTo.length === 0) {
    return {};
  }

  return { applies_to: [...appliesTo] };
};

const assertUniqueValues = (values: ReadonlyArray<string> | undefined, fieldName: string): void => {
  const duplicates = duplicateValues(values ?? []);

  if (duplicates.length > 0) {
    throw new VocabularyServiceError(
      'vocabulary.term.duplicate_values',
      'Vocabulary term arrays must not contain duplicate values.',
      { duplicates: uniqueStrings(duplicates), fieldName },
    );
  }
};

const assertAliasesDoNotIncludeCanonicalTag = (term: VocabularyTermInput): void => {
  if (term.aliases?.includes(term.tag)) {
    throw new VocabularyServiceError(
      'vocabulary.term.self_alias',
      'Vocabulary term aliases must not repeat the canonical tag.',
      { tag: term.tag },
    );
  }
};

const validateTermInput = (term: VocabularyTermInput): VocabularyTerm => {
  assertValidVocabularyTag(term.tag);
  assertUniqueValues(term.aliases, 'aliases');
  assertUniqueValues(term.applies_to, 'applies_to');
  assertAliasesDoNotIncludeCanonicalTag(term);
  for (const alias of term.aliases ?? []) {
    assertValidVocabularyTag(alias);
  }

  return {
    tag: term.tag,
    status: 'provisional',
    description: term.description,
    ...optionalAliases(term.aliases),
    ...optionalAppliesTo(term.applies_to),
    provenance: term.provenance,
  };
};

const updateVocabularyTerms = (
  vocabulary: IntrospectionVocabulary,
  terms: ReadonlyArray<VocabularyTerm>,
): IntrospectionVocabulary => ({ ...vocabulary, terms: [...terms] });

const loadVocabularyForMutation = async (
  context: VocabularyMutationContext,
): Promise<IntrospectionVocabulary> => {
  const vocabulary = await loadVocabularyFile(context.vocabularyPath);
  assertVocabularyIntegrity(vocabulary);

  return vocabulary;
};

const persistVocabulary = async (
  context: VocabularyMutationContext,
  vocabulary: IntrospectionVocabulary,
): Promise<IntrospectionVocabulary> => {
  assertVocabularyIntegrity(vocabulary);
  await writeVocabularyFile(context.vocabularyPath, vocabulary);

  return vocabulary;
};

const withVocabularyMutationLock = async <Result>(
  context: VocabularyMutationContext,
  work: (currentVocabulary: IntrospectionVocabulary) => Promise<Result>,
): Promise<Result> =>
  withLocalNamedLock(context, vocabularyLockName, async () =>
    work(await loadVocabularyForMutation(context)),
  );

const listVocabularyTerms = (
  vocabulary: IntrospectionVocabulary,
  options: VocabularyListOptions = {},
): ReadonlyArray<VocabularyTerm> => {
  if (!options.status) {
    return Object.freeze(sortedTerms(vocabulary.terms));
  }

  return Object.freeze(
    sortedTerms(vocabulary.terms.filter((term) => term.status === options.status)),
  );
};

const proposeVocabularyTerm = async ({
  context,
  term,
}: ProposeVocabularyTermRequest): Promise<IntrospectionVocabulary> =>
  withVocabularyMutationLock(context, async (currentVocabulary) => {
    const nextTerm = validateTermInput(term);
    assertTermDoesNotExist(currentVocabulary, nextTerm.tag);
    for (const alias of nextTerm.aliases ?? []) {
      assertTermDoesNotExist(currentVocabulary, alias);
    }

    return persistVocabulary(
      context,
      updateVocabularyTerms(currentVocabulary, [...currentVocabulary.terms, nextTerm]),
    );
  });

const updateTermStatus = async (
  { context, tag }: VocabularyTermMutationRequest,
  status: VocabularyTerm['status'],
): Promise<IntrospectionVocabulary> =>
  withVocabularyMutationLock(context, async (currentVocabulary) => {
    assertTermExists(currentVocabulary, tag);
    const terms = currentVocabulary.terms.map((term) => {
      if (term.tag !== tag) {
        return term;
      }

      return { ...term, status };
    });

    return persistVocabulary(context, updateVocabularyTerms(currentVocabulary, terms));
  });

const approveVocabularyTerm = async (
  request: VocabularyTermMutationRequest,
): Promise<IntrospectionVocabulary> => updateTermStatus(request, 'approved');

const rejectVocabularyTerm = async (
  request: VocabularyTermMutationRequest,
): Promise<IntrospectionVocabulary> => updateTermStatus(request, 'rejected');

const vocabularyUsage = async (
  context: VocabularyReadContext,
  store: VocabularyRecordStore,
  tags: ReadonlyArray<string> = context.vocabulary.terms.map((term) => term.tag),
): Promise<ReadonlyArray<VocabularyUsageEntry>> => {
  assertStoreRootMatchesContext(context, store);
  const uniqueTags = [...new Set(tags)];
  const records = await store.listRecords();

  return uniqueTags.map((tag) => ({
    tag,
    records: records
      .filter((record) => record.frontmatter.tags.includes(tag))
      .map((record) => ({
        id: record.frontmatter.id,
        path: record.relativePath,
        title: record.frontmatter.title,
      })),
  }));
};

const rewriteTagValue = (tag: string, fromTag: string, toTag: string): string => {
  if (tag !== fromTag) {
    return tag;
  }

  return toTag;
};

const replaceTag = (
  tags: ReadonlyArray<string>,
  fromTag: string,
  toTag: string,
): ReadonlyArray<string> => {
  const nextTags = tags.map((tag) => rewriteTagValue(tag, fromTag, toTag));

  return [...new Set(nextTags)];
};

const recordWithTagRewritten = (
  record: StoredMarkdownRecord,
  fromTag: string,
  toTag: string,
): ParsedRecord => ({
  ...record,
  frontmatter: {
    ...record.frontmatter,
    tags: replaceTag(record.frontmatter.tags, fromTag, toTag),
  },
  body: record.body,
});

const cascadeTagRewrite = async (
  store: VocabularyRecordStore,
  fromTag: string,
  toTag: string,
): Promise<ReadonlyArray<string>> => {
  const changedRecordPaths: Array<string> = [];
  const records = await store.listRecords();

  for (const record of records) {
    if (record.frontmatter.tags.includes(fromTag)) {
      await store.updateRecord(record, recordWithTagRewritten(record, fromTag, toTag));
      changedRecordPaths.push(record.relativePath);
    }
  }

  return changedRecordPaths;
};

const renameTerm = (
  vocabulary: IntrospectionVocabulary,
  fromTag: string,
  toTag: string,
): IntrospectionVocabulary =>
  updateVocabularyTerms(
    vocabulary,
    vocabulary.terms.map((term) => {
      if (term.tag !== fromTag) {
        return term;
      }

      return {
        ...term,
        tag: toTag,
        aliases: uniqueStrings([...(term.aliases ?? []), fromTag]),
      };
    }),
  );

const renameVocabularyTag = async ({
  context,
  fromTag,
  store,
  toTag,
}: RenameVocabularyTagRequest): Promise<VocabularyCascadeResult> =>
  withVocabularyMutationLock(context, async (currentVocabulary) => {
    assertValidVocabularyTag(fromTag);
    assertValidVocabularyTag(toTag);
    assertTermExists(currentVocabulary, fromTag);
    assertTermDoesNotExist(currentVocabulary, toTag);
    assertStoreRootMatchesContext(context, store);

    const changedRecordPaths = await cascadeTagRewrite(store, fromTag, toTag);
    const vocabulary = await persistVocabulary(
      context,
      renameTerm(currentVocabulary, fromTag, toTag),
    );

    return { changedRecordPaths, fromTag, toTag, vocabulary };
  });

const mergeTerms = (
  vocabulary: IntrospectionVocabulary,
  fromTerm: VocabularyTerm,
  toTerm: VocabularyTerm,
): IntrospectionVocabulary =>
  updateVocabularyTerms(
    vocabulary,
    vocabulary.terms
      .filter((term) => term.tag !== fromTerm.tag)
      .map((term) => {
        if (term.tag !== toTerm.tag) {
          return term;
        }

        return {
          ...term,
          aliases: uniqueStrings([
            ...(term.aliases ?? []),
            fromTerm.tag,
            ...(fromTerm.aliases ?? []),
          ]),
        };
      }),
  );

const mergeVocabularyTags = async ({
  context,
  fromTag,
  store,
  toTag,
}: MergeVocabularyTagRequest): Promise<VocabularyCascadeResult> =>
  withVocabularyMutationLock(context, async (currentVocabulary) => {
    assertValidVocabularyTag(fromTag);
    assertValidVocabularyTag(toTag);
    const fromTerm = assertTermExists(currentVocabulary, fromTag);
    const toTerm = assertTermExists(currentVocabulary, toTag);
    assertStoreRootMatchesContext(context, store);

    if (fromTag === toTag) {
      throw new VocabularyServiceError(
        'vocabulary.merge.same_tag',
        'Vocabulary merge requires two different tags.',
        { tag: fromTag },
      );
    }

    const changedRecordPaths = await cascadeTagRewrite(store, fromTag, toTag);
    const vocabulary = await persistVocabulary(
      context,
      mergeTerms(currentVocabulary, fromTerm, toTerm),
    );

    return { changedRecordPaths, fromTag, toTag, vocabulary };
  });

const usageTagsForTerm = (term: VocabularyTerm): ReadonlyArray<string> =>
  uniqueStrings([term.tag, ...(term.aliases ?? [])]);

const usageEntriesWithRecords = (
  usageEntries: ReadonlyArray<VocabularyUsageEntry>,
): ReadonlyArray<VocabularyUsageEntry> => usageEntries.filter((usage) => usage.records.length > 0);

const assertVocabularyCanDeleteTerm = (
  vocabulary: IntrospectionVocabulary,
  term: VocabularyTerm,
  usageEntries: ReadonlyArray<VocabularyUsageEntry>,
): void => {
  if (vocabulary.terms.length <= 1) {
    throw new VocabularyServiceError(
      'vocabulary.delete.last_term',
      'Vocabulary term cannot be deleted because the vocabulary schema requires at least one term.',
      { tag: term.tag },
    );
  }

  const usedEntries = usageEntriesWithRecords(usageEntries);

  if (usedEntries.length > 0) {
    throw new VocabularyServiceError(
      'vocabulary.delete.term_in_use',
      'Vocabulary term cannot be deleted while records still use it or one of its aliases.',
      { tag: term.tag, usage: usedEntries },
    );
  }
};

const deleteVocabularyTermIfUnused = async ({
  context,
  store,
  tag,
}: DeleteVocabularyTermRequest): Promise<DeleteVocabularyTermResult> =>
  withVocabularyMutationLock(context, async (currentVocabulary) => {
    assertValidVocabularyTag(tag);
    const deletedTerm = assertTermExists(currentVocabulary, tag);
    const usageEntries = await vocabularyUsage(
      { ...context, vocabulary: currentVocabulary },
      store,
      usageTagsForTerm(deletedTerm),
    );
    assertVocabularyCanDeleteTerm(currentVocabulary, deletedTerm, usageEntries);

    const vocabulary = await persistVocabulary(
      context,
      updateVocabularyTerms(
        currentVocabulary,
        currentVocabulary.terms.filter((candidate) => candidate.tag !== tag),
      ),
    );

    return { deletedTag: tag, vocabulary };
  });

export {
  VocabularyServiceError,
  approveVocabularyTerm,
  deleteVocabularyTermIfUnused,
  listVocabularyTerms,
  mergeVocabularyTags,
  proposeVocabularyTerm,
  rejectVocabularyTerm,
  renameVocabularyTag,
  renderVocabularyToml,
  vocabularyTagFindings,
  vocabularyUsage,
};
export type * from './vocabulary-types.js';
