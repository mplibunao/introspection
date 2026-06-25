import * as Option from 'effect/Option';

import { loadRepoContext } from '../config/repo-context.js';
import { IntrospectionError } from '../core/errors.js';
import type {
  EvidenceRefKind,
  ParsedRecord,
  RecordType,
  ValidationContext,
} from '../core/record-type-types.js';
import { recordTypeRegistry } from '../record-types/registry.js';
import { createMarkdownRecordStore } from '../store/markdown-record-store.js';

import type { CliErrorPayload, CommandFailure } from '../commands/types.js';
import type { CliEnvShape } from './env.js';

type RepoContext = Awaited<ReturnType<typeof loadRepoContext>>;
const errorDetailsConstructorParameterIndex = 2;

type ErrorDetails = NonNullable<
  ConstructorParameters<typeof IntrospectionError>[typeof errorDetailsConstructorParameterIndex]
>;
type MarkdownRecordStore = ReturnType<typeof createMarkdownRecordStore>;
type VocabularyProvenance = RepoContext['vocabulary']['terms'][number]['provenance'];

/*
 * Repo-scoped services every command-boundary handler loads before touching
 * records. This module owns the non-parsing command helpers that survived the
 * Effect CLI cutover (IX-SR-02): the manual flag parser moved to flag-guard.ts,
 * and dispatch/output moved to the Effect shell, but loading the repo context
 * plus store and normalizing errors stay shared, transitional glue between the
 * Effect command handlers and the existing async core.
 */
interface AppServices {
  readonly repo: RepoContext;
  readonly store: MarkdownRecordStore;
}

const evidenceKinds: ReadonlyArray<EvidenceRefKind> = [
  'commit',
  'doc',
  'other',
  'plan',
  'record',
  'tracker',
  'url',
];

const provenanceKinds: ReadonlyArray<VocabularyProvenance['kind']> = [
  'human',
  'import',
  'other',
  'plan',
  'record',
  'seed',
];

const cliUsageError = (
  usage: string,
  message = 'Command usage is invalid.',
  details: ErrorDetails = {},
): IntrospectionError => new IntrospectionError('cli.usage', message, { ...details, usage });

const cliArgumentError = (message: string, details: ErrorDetails = {}): IntrospectionError =>
  new IntrospectionError('cli.argument.invalid', message, details);

const parseEvidenceRefKind = (value: string): EvidenceRefKind => {
  switch (value) {
    case 'commit':
    case 'doc':
    case 'other':
    case 'plan':
    case 'record':
    case 'tracker':
    case 'url':
      return value;
    default:
      throw cliArgumentError('Evidence kind is not supported.', {
        allowed: [...evidenceKinds].sort(),
        value,
      });
  }
};

const parseProvenanceKind = (value: string): VocabularyProvenance['kind'] => {
  switch (value) {
    case 'human':
    case 'import':
    case 'other':
    case 'plan':
    case 'record':
    case 'seed':
      return value;
    default:
      throw cliArgumentError('Vocabulary provenance kind is not supported.', {
        allowed: [...provenanceKinds].sort(),
        value,
      });
  }
};

const requireFlagValue = (value: string | undefined, key: string): string => {
  if (!value) {
    throw new IntrospectionError('cli.flag.required', `Missing required --${key} value.`, {
      flag: key,
    });
  }

  return value;
};

const requirePositional = (value: string | undefined, label: string, usage: string): string => {
  if (!value) {
    throw new IntrospectionError('cli.argument.required', `Missing required ${label} argument.`, {
      label,
      usage,
    });
  }

  return value;
};

const exitCodeForOk = (ok: boolean): number => {
  if (ok) {
    return 0;
  }

  return 1;
};

const loadRepoOptions = (cwd: string | undefined): { readonly cwd?: string } => {
  if (cwd) {
    return { cwd };
  }

  return {};
};

const loadAppServices = async (options: {
  readonly cwd?: string | undefined;
}): Promise<AppServices> => {
  const repo = await loadRepoContext(loadRepoOptions(options.cwd));
  const store = createMarkdownRecordStore({ root: repo.recordsRoot });

  return { repo, store };
};

const loadAppServicesForRoot = async (
  env: Pick<CliEnvShape, 'cwd'>,
  root: Option.Option<string>,
): Promise<AppServices> => loadAppServices({ cwd: Option.getOrUndefined(root) ?? env.cwd });

const validationContextFor = (repo: RepoContext): ValidationContext => ({
  recordsRoot: repo.recordsRoot,
  repoKey: repo.repoKey,
  repoSlug: repo.repoSlug,
  vocabulary: repo.vocabulary,
});

const recordTypeFor = (record: ParsedRecord): RecordType =>
  recordTypeRegistry.require(record.frontmatter.record_type);

const normalizeIntrospectionError = (error: IntrospectionError): CliErrorPayload => {
  if (Object.keys(error.details).length > 0) {
    return { code: error.code, details: error.details, message: error.message };
  }

  return { code: error.code, message: error.message };
};

const normalizeError = (error: unknown): CliErrorPayload => {
  if (error instanceof IntrospectionError) {
    return normalizeIntrospectionError(error);
  }

  if (error instanceof Error) {
    return { code: 'cli.unexpected_error', message: error.message };
  }

  return { code: 'cli.unexpected_error', message: 'Unknown CLI error.' };
};

const toFailure = (error: unknown, exitCode = 1): CommandFailure => ({
  error: normalizeError(error),
  exitCode,
});

export {
  cliArgumentError,
  cliUsageError,
  evidenceKinds,
  loadAppServices,
  loadAppServicesForRoot,
  normalizeError,
  parseEvidenceRefKind,
  exitCodeForOk,
  parseProvenanceKind,
  provenanceKinds,
  recordTypeFor,
  requireFlagValue,
  requirePositional,
  toFailure,
  validationContextFor,
};
export type { AppServices };
