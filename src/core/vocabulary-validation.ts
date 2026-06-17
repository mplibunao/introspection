import type { VocabularyTerm } from '../config/repo-context.js';
import type { Finding, ParsedRecord, ValidationContext } from './record-type-types.js';
import { rawVocabularyTags, tagConformsToGrammar, tagIsMachineOwned } from './tags.js';

interface VocabularyLookup {
  readonly terms: ReadonlyArray<Pick<VocabularyTerm, 'aliases' | 'applies_to' | 'status' | 'tag'>>;
}

const termTagSet = (term: Pick<VocabularyTerm, 'aliases' | 'tag'>): ReadonlySet<string> =>
  new Set([term.tag, ...(term.aliases ?? [])]);

const vocabularyIntegrityFinding = (
  code: string,
  message: string,
  path: ReadonlyArray<number | string>,
  remediation: string,
): Finding => ({ code, severity: 'error', message, path, remediation });

const duplicateTagFinding = (tag: string, path: ReadonlyArray<number | string>): Finding =>
  vocabularyIntegrityFinding(
    'vocabulary.integrity.duplicate_tag',
    `Vocabulary tag or alias "${tag}" is declared more than once.`,
    path,
    'Keep each canonical tag and alias unique across .introspection/vocabulary.toml.',
  );

const machineOwnedVocabularyFinding = (
  tag: string,
  path: ReadonlyArray<number | string>,
): Finding =>
  vocabularyIntegrityFinding(
    'vocabulary.integrity.machine_owned',
    `Machine-owned tag "${tag}" cannot be declared in the record-local vocabulary.`,
    path,
    'Remove machine-owned tags; record types derive record/repo/status/visibility tags automatically.',
  );

const invalidVocabularyTagFinding = (tag: string, path: ReadonlyArray<number | string>): Finding =>
  vocabularyIntegrityFinding(
    'vocabulary.integrity.invalid_tag',
    `Vocabulary tag "${tag}" does not match the tag grammar.`,
    path,
    'Use lowercase GNO-compatible tags such as owner/mp or topic/research.',
  );

const selfAliasFinding = (tag: string, termIndex: number, aliasIndex: number): Finding =>
  vocabularyIntegrityFinding(
    'vocabulary.integrity.self_alias',
    `Vocabulary alias "${tag}" repeats the canonical tag.`,
    ['terms', termIndex, 'aliases', aliasIndex],
    'Remove the alias or choose a distinct historical tag.',
  );

const repeatedTermValueFindings = (
  tag: string,
  path: ReadonlyArray<number | string>,
  seenPaths: Map<string, ReadonlyArray<number | string>>,
): ReadonlyArray<Finding> => {
  const previousPath = seenPaths.get(tag);

  if (!previousPath) {
    seenPaths.set(tag, path);
    return [];
  }

  return [duplicateTagFinding(tag, path), duplicateTagFinding(tag, previousPath)];
};

const termValueIntegrityFindings = (
  tag: string,
  path: ReadonlyArray<number | string>,
  seenPaths: Map<string, ReadonlyArray<number | string>>,
): ReadonlyArray<Finding> => {
  const findings = [...repeatedTermValueFindings(tag, path, seenPaths)];

  if (!tagConformsToGrammar(tag)) {
    findings.push(invalidVocabularyTagFinding(tag, path));
  }

  if (tagIsMachineOwned(tag)) {
    findings.push(machineOwnedVocabularyFinding(tag, path));
  }

  return findings;
};

interface AliasIntegrityContext {
  readonly aliasIndex: number;
  readonly seenPaths: Map<string, ReadonlyArray<number | string>>;
  readonly term: Pick<VocabularyTerm, 'tag'>;
  readonly termIndex: number;
}

const aliasIntegrityFindings = (
  alias: string,
  context: AliasIntegrityContext,
): ReadonlyArray<Finding> => {
  const { aliasIndex, seenPaths, term, termIndex } = context;
  const findings = [
    ...termValueIntegrityFindings(alias, ['terms', termIndex, 'aliases', aliasIndex], seenPaths),
  ];

  if (alias === term.tag) {
    findings.push(selfAliasFinding(alias, termIndex, aliasIndex));
  }

  return findings;
};

const vocabularyIntegrityFindings = (vocabulary: VocabularyLookup): ReadonlyArray<Finding> => {
  const seenPaths = new Map<string, ReadonlyArray<number | string>>();

  return vocabulary.terms.flatMap((term, termIndex) => [
    ...termValueIntegrityFindings(term.tag, ['terms', termIndex, 'tag'], seenPaths),
    ...(term.aliases ?? []).flatMap((alias, aliasIndex) =>
      aliasIntegrityFindings(alias, { aliasIndex, seenPaths, term, termIndex }),
    ),
  ]);
};

const findTermByTagOrAlias = (
  vocabulary: VocabularyLookup,
  tag: string,
): Pick<VocabularyTerm, 'aliases' | 'applies_to' | 'status' | 'tag'> | undefined =>
  vocabulary.terms.find((term) => termTagSet(term).has(tag));

const unknownVocabularyTagFinding = (tag: string): Finding => ({
  code: 'tag.vocabulary.unknown',
  severity: 'error',
  message: `Unknown record-local tag "${tag}" is not in .introspection/vocabulary.toml.`,
  path: ['tags'],
  remediation: `Run the explicit vocab propose flow for "${tag}" with provenance, or remove the tag from this record.`,
});

const rejectedVocabularyTagFinding = (tag: string): Finding => ({
  code: 'tag.vocabulary.rejected',
  severity: 'error',
  message: `Rejected record-local tag "${tag}" cannot be used on records.`,
  path: ['tags'],
  remediation: `Remove "${tag}" from this record or approve the term only after the owning policy changes.`,
});

const aliasVocabularyTagFinding = (tag: string, canonicalTag: string): Finding => ({
  code: 'tag.vocabulary.alias',
  severity: 'error',
  message: `Record-local tag "${tag}" is an alias for "${canonicalTag}", not the canonical vocabulary tag.`,
  path: ['tags'],
  remediation: `Replace "${tag}" with "${canonicalTag}" in this record's tags.`,
});

const missingVocabularyContextFinding = (): Finding => ({
  code: 'validation.context.vocabulary.required',
  severity: 'error',
  message:
    'Validation context is missing the controlled vocabulary, so raw record-local tags cannot be checked.',
  path: ['vocabulary'],
  remediation:
    'Load repo context before validation so .introspection/vocabulary.toml governs raw tags.',
});

const vocabularyFindingForTag = (
  vocabulary: VocabularyLookup,
  tag: string,
): ReadonlyArray<Finding> => {
  const term = findTermByTagOrAlias(vocabulary, tag);

  if (!term) {
    return [unknownVocabularyTagFinding(tag)];
  }

  if (term.status === 'rejected') {
    return [rejectedVocabularyTagFinding(tag)];
  }

  if (term.tag !== tag) {
    return [aliasVocabularyTagFinding(tag, term.tag)];
  }

  return [];
};

const vocabularyTagFindings = (
  record: ParsedRecord,
  context: ValidationContext,
): ReadonlyArray<Finding> => {
  const rawTags = rawVocabularyTags(record.frontmatter.tags);

  if (rawTags.length === 0) {
    return [];
  }

  if (!context.vocabulary) {
    return [missingVocabularyContextFinding()];
  }

  const { vocabulary } = context;

  return rawTags.flatMap((tag) => vocabularyFindingForTag(vocabulary, tag));
};

export { findTermByTagOrAlias, vocabularyIntegrityFindings, vocabularyTagFindings };
export type { VocabularyLookup };
