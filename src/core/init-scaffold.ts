import path from 'node:path';

import type { IntrospectionVocabulary, VocabularyTerm } from '../config/repo-context.js';

import { IntrospectionError } from './errors.js';
import type { InitImportReport } from './init-import-line.js';
import { isoTimestamp } from './time.js';

// Repo-key grammar from config.schema.json: an uppercase letter then 1-15 uppercase letters or digits.
const repoKeyPattern = /^[A-Z][A-Z0-9]{1,15}$/u;
// Repo-slug reuses the base-record tagSegment grammar: one lowercase tag segment.
const repoSlugPattern = /^[a-z0-9][a-z0-9.-]*$/u;
const repoKeyMaxLength = 16;

const defaultRecordsRoot = 'docs/records';
// Mirror the runtime built-ins (record-list-selector) so a fresh repo lists the same way the host CLI defaults to.
const defaultListLimit = 10;
const defaultHardLimit = 50;
const vocabularySchemaVersion = 1;

type ConfigArtifactStatus = 'absent' | 'created' | 'preserved' | 'present';
type RouterArtifactStatus = 'absent' | 'generated' | 'present';

interface ResolvedConfigValues {
  readonly repoKey: string;
  readonly repoSlug: string;
  readonly recordsRoot: string;
}

interface InitArtifactReport<Status> {
  readonly path: string;
  readonly status: Status;
}

interface InitReport {
  readonly mode: 'show' | 'write';
  readonly repoRoot: string;
  readonly repoKey?: string;
  readonly repoSlug?: string;
  readonly recordsRoot?: string;
  readonly config: InitArtifactReport<ConfigArtifactStatus>;
  readonly vocabulary: InitArtifactReport<ConfigArtifactStatus>;
  readonly router: InitArtifactReport<RouterArtifactStatus>;
  readonly imports: ReadonlyArray<InitImportReport>;
}

const validateRepoKey = (value: string): string => {
  if (!repoKeyPattern.test(value)) {
    throw new IntrospectionError(
      'init.repo_key.invalid',
      'repo_key must be an uppercase letter followed by 1-15 uppercase letters or digits.',
      { pattern: repoKeyPattern.source, repoKey: value },
    );
  }

  return value;
};

const validateRepoSlug = (value: string): string => {
  if (!repoSlugPattern.test(value)) {
    throw new IntrospectionError(
      'init.repo_slug.invalid',
      'repo_slug must be a single lowercase tag segment of letters, digits, dots, or hyphens.',
      { pattern: repoSlugPattern.source, repoSlug: value },
    );
  }

  return value;
};

/*
 * Derive a slug candidate from the repo directory name: lowercase, fold any
 * out-of-grammar run to a single hyphen, then trim leading/trailing separators
 * so the result starts and ends on an alphanumeric. Yields no value when no
 * valid segment survives (e.g. a name of only punctuation) so the caller can
 * require an explicit --repo-slug instead of writing an invalid config.
 */
const deriveRepoSlug = (repoRoot: string): string | undefined => {
  const slug = path
    .basename(repoRoot)
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/gu, '-')
    .replace(/-{2,}/gu, '-')
    .replace(/^[-.]+/u, '')
    .replace(/[-.]+$/u, '');

  if (repoSlugPattern.test(slug)) {
    return slug;
  }

  return;
};

/*
 * Derive a repo-key candidate from a slug by dropping separators and
 * upper-casing. Yields no value when the compacted value cannot satisfy the key
 * grammar (e.g. it starts with a digit or is a single character) so the caller
 * requires an explicit --repo-key rather than emitting invalid config.
 */
const deriveRepoKey = (slug: string): string | undefined => {
  const compact = slug
    .replace(/[^a-z0-9]/gu, '')
    .toUpperCase()
    .slice(0, repoKeyMaxLength);

  if (repoKeyPattern.test(compact)) {
    return compact;
  }

  return;
};

const quotedTomlString = (value: string): string => JSON.stringify(value);

/*
 * The records.list subtable is declared after defaults even though it belongs
 * to records; TOML permits subtables in any order, and this mirrors the
 * ordering already used across the repo's own config and the test fixtures.
 */
const renderConfigToml = (values: ResolvedConfigValues): string =>
  `${[
    `schema_version = ${vocabularySchemaVersion}`,
    `repo_key = ${quotedTomlString(values.repoKey)}`,
    `repo_slug = ${quotedTomlString(values.repoSlug)}`,
    '',
    '[records]',
    `root = ${quotedTomlString(values.recordsRoot)}`,
    '',
    '[defaults]',
    'visibility = "local-only"',
    '',
    '[records.list]',
    `default_limit = ${defaultListLimit}`,
    `hard_limit = ${defaultHardLimit}`,
  ].join('\n')}\n`;

/*
 * The vocabulary schema requires at least one term (minItems plus the
 * delete-last-term guard), so a functional repo cannot start empty. Init seeds
 * one clearly-provisional placeholder the adopter is told to replace; this is a
 * structural requirement, not a silent record-content decision.
 */
const starterVocabulary = (now: Date): IntrospectionVocabulary => {
  const term: VocabularyTerm = {
    tag: 'topic/example',
    status: 'provisional',
    description:
      'Starter vocabulary term written by introspection init. Replace it with your own terms using introspection vocab.',
    provenance: { kind: 'seed', noted_at: isoTimestamp(now) },
  };

  return { schema_version: vocabularySchemaVersion, terms: [term] };
};

/*
 * INTROSPECTION.md is fully generated and overwritten on every run, so it
 * carries no managed markers: the whole file is owned by init.
 */
const renderRouterMarkdown = (): string =>
  `${[
    '# introspection',
    '',
    'This repository uses introspection, a CLI that keeps governed markdown records (such as tech-debt) under version control with validated frontmatter.',
    '',
    '## For agents working in this repo',
    '',
    '- Run `introspection prime` at the start of repo work to load record context: counts, policy docs, and vocabulary.',
    '- Run `introspection check` before finishing to validate records.',
    '',
    'Run `introspection --help` for the full command list.',
    '',
    'introspection init generates this file; re-running init overwrites it.',
  ].join('\n')}\n`;

export {
  defaultRecordsRoot,
  deriveRepoKey,
  deriveRepoSlug,
  renderConfigToml,
  renderRouterMarkdown,
  starterVocabulary,
  validateRepoKey,
  validateRepoSlug,
};
export type {
  ConfigArtifactStatus,
  InitArtifactReport,
  InitReport,
  ResolvedConfigValues,
  RouterArtifactStatus,
};
