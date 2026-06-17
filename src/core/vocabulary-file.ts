import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { IntrospectionVocabulary, VocabularyTerm } from '../config/repo-context.js';

const tomlArrayIndent = '  ';
const randomStringRadix = 16;
const randomStringPrefixLength = 2;

const quotedTomlString = (value: string): string => JSON.stringify(value);

const tomlStringArray = (values: ReadonlyArray<string>): string =>
  `[${values.map(quotedTomlString).join(', ')}]`;

const optionalSchemaHeader = (vocabulary: IntrospectionVocabulary): ReadonlyArray<string> => {
  if (!vocabulary.$schema) {
    return [];
  }

  return [`"$schema" = ${quotedTomlString(vocabulary.$schema)}`];
};

const optionalArrayLine = (
  key: string,
  values: ReadonlyArray<string> | undefined,
): string | null => {
  if (!values || values.length === 0) {
    return null;
  }

  return `${key} = ${tomlStringArray(values)}`;
};

const provenanceLines = (term: VocabularyTerm): ReadonlyArray<string> => {
  const lines = [
    '[terms.provenance]',
    `${tomlArrayIndent}kind = ${quotedTomlString(term.provenance.kind)}`,
  ];

  // Omit ref entirely when absent; writing `ref = undefined` is invalid TOML
  if (term.provenance.ref) {
    lines.push(`${tomlArrayIndent}ref = ${quotedTomlString(term.provenance.ref)}`);
  }

  if (term.provenance.noted_at) {
    lines.push(`${tomlArrayIndent}noted_at = ${quotedTomlString(term.provenance.noted_at)}`);
  }

  return lines;
};

const renderVocabularyTerm = (term: VocabularyTerm): string => {
  const optionalLines = [
    optionalArrayLine('aliases', term.aliases),
    optionalArrayLine('applies_to', term.applies_to),
  ].filter((line): line is string => line !== null);
  const termLines = [
    '[[terms]]',
    `tag = ${quotedTomlString(term.tag)}`,
    `status = ${quotedTomlString(term.status)}`,
    `description = ${quotedTomlString(term.description)}`,
    ...optionalLines,
    ...provenanceLines(term),
  ];

  return termLines.join('\n');
};

const sortedTerms = (terms: ReadonlyArray<VocabularyTerm>): ReadonlyArray<VocabularyTerm> =>
  [...terms].sort((left, right) => left.tag.localeCompare(right.tag));

const renderVocabularyToml = (vocabulary: IntrospectionVocabulary): string => {
  const header = [
    ...optionalSchemaHeader(vocabulary),
    `schema_version = ${vocabulary.schema_version}`,
  ];
  const terms = sortedTerms(vocabulary.terms).map(renderVocabularyTerm);

  return `${[...header, ...terms].join('\n\n')}\n`;
};

const temporaryVocabularyPath = (vocabularyPath: string): string =>
  path.join(
    path.dirname(vocabularyPath),
    `.vocabulary.${Date.now()}.${Math.random().toString(randomStringRadix).slice(randomStringPrefixLength)}.toml.tmp`,
  );

const cleanupTemporaryFile = async (temporaryPath: string): Promise<void> => {
  try {
    await unlink(temporaryPath);
  } catch {
    // Best effort cleanup keeps the original vocabulary file authoritative if a write fails.
  }
};

const writeVocabularyFile = async (
  vocabularyPath: string,
  vocabulary: IntrospectionVocabulary,
): Promise<void> => {
  await mkdir(path.dirname(vocabularyPath), { recursive: true });
  const temporaryPath = temporaryVocabularyPath(vocabularyPath);

  try {
    await writeFile(temporaryPath, renderVocabularyToml(vocabulary), { flag: 'wx' });
    await rename(temporaryPath, vocabularyPath);
  } catch (error) {
    await cleanupTemporaryFile(temporaryPath);
    throw error;
  }
};

export { renderVocabularyToml, sortedTerms, writeVocabularyFile };
