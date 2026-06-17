/* eslint-disable no-duplicate-imports -- Import-style rules require separate top-level type imports. */
import { loadRepoContext } from '../config/repo-context.js';
import type { RepoContext, VocabularyProvenance } from '../config/repo-context.js';
import { IntrospectionError } from '../core/errors.js';
import type { ErrorDetails } from '../core/errors.js';
import type {
  EvidenceRef,
  EvidenceRefKind,
  ParsedRecord,
  RecordType,
  ValidationContext,
} from '../core/record-type-types.js';
import { recordTypeRegistry } from '../record-types/registry.js';
import { createMarkdownRecordStore } from '../store/markdown-record-store.js';
import type { MarkdownRecordStore } from '../store/markdown-record-store.js';

import type { CliCommandContext, CliErrorPayload, CommandFailure } from './types.js';

interface FlagParseResult {
  readonly flags: Map<string, ReadonlyArray<string>>;
  readonly positionals: ReadonlyArray<string>;
}

interface AppServices {
  readonly repo: RepoContext;
  readonly store: MarkdownRecordStore;
}

const flagPrefix = '--';
const flagPrefixLength = 2;
const truthyFlagValue = 'true';
const lastItemIndex = -1;
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

const isoTimestamp = (date: Date): string => date.toISOString().replace(/\.\d{3}Z$/u, 'Z');

const isFlag = (arg: string | undefined): boolean => arg?.startsWith(flagPrefix) === true;

const appendFlagValue = (flags: Map<string, Array<string>>, key: string, value: string): void => {
  const values = flags.get(key) ?? [];
  values.push(value);
  flags.set(key, values);
};

const flagValueAt = (
  args: ReadonlyArray<string>,
  index: number,
): { readonly consumedNext: boolean; readonly value: string } => {
  const next = args[index + 1];

  if (typeof next === 'string' && !isFlag(next)) {
    return { consumedNext: true, value: next };
  }

  return { consumedNext: false, value: truthyFlagValue };
};

const nextFlagIndex = (index: number, consumedNext: boolean): number => {
  if (consumedNext) {
    return index + flagPrefixLength;
  }

  return index + 1;
};

const consumeArg = (
  args: ReadonlyArray<string>,
  flags: Map<string, Array<string>>,
  positionals: Array<string>,
  index: number,
): number => {
  const arg = args[index];

  if (isFlag(arg)) {
    const key = String(arg).slice(flagPrefixLength);
    const parsed = flagValueAt(args, index);
    appendFlagValue(flags, key, parsed.value);
    return nextFlagIndex(index, parsed.consumedNext);
  }

  if (typeof arg === 'string') {
    positionals.push(arg);
  }

  return index + 1;
};

const parseFlags = (args: ReadonlyArray<string>): FlagParseResult => {
  const flags = new Map<string, Array<string>>();
  const positionals: Array<string> = [];
  let index = 0;

  while (index < args.length) {
    index = consumeArg(args, flags, positionals, index);
  }

  return { flags, positionals };
};

const flagValues = (
  flags: Map<string, ReadonlyArray<string>>,
  key: string,
): ReadonlyArray<string> => flags.get(key) ?? [];

const flagValue = (flags: Map<string, ReadonlyArray<string>>, key: string): string | undefined =>
  flagValues(flags, key).at(lastItemIndex);

const requiredFlag = (flags: Map<string, ReadonlyArray<string>>, key: string): string => {
  const value = flagValue(flags, key);

  if (!value || value === truthyFlagValue) {
    throw new IntrospectionError('cli.flag.required', `Missing required --${key} value.`, {
      flag: key,
    });
  }

  return value;
};

const optionalFlag = (
  flags: Map<string, ReadonlyArray<string>>,
  key: string,
): string | undefined => {
  const value = flagValue(flags, key);

  if (!value || value === truthyFlagValue) {
    return;
  }

  return value;
};

const cliUsageError = (
  usage: string,
  message = 'Command usage is invalid.',
  details: ErrorDetails = {},
): IntrospectionError => new IntrospectionError('cli.usage', message, { ...details, usage });

const cliArgumentError = (message: string, details: ErrorDetails = {}): IntrospectionError =>
  new IntrospectionError('cli.argument.invalid', message, details);

const assertNoExtraPositionals = (positionals: ReadonlyArray<string>, usage: string): void => {
  if (positionals.length > 0) {
    throw cliUsageError(usage, 'Command received unexpected arguments.', {
      arguments: positionals,
    });
  }
};

const requirePositional = (
  positionals: ReadonlyArray<string>,
  index: number,
  label: string,
  usage: string,
): string => {
  const value = positionals[index];

  if (!value) {
    throw new IntrospectionError('cli.argument.required', `Missing required ${label} argument.`, {
      label,
      usage,
    });
  }

  return value;
};

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

const evidenceRefFromFlags = (
  flags: Map<string, ReadonlyArray<string>>,
  kindFlag = 'evidence-kind',
  refFlag = 'evidence-ref',
): ReadonlyArray<EvidenceRef> => {
  const refs = flagValues(flags, refFlag);
  const kinds = flagValues(flags, kindFlag);

  return refs.map((ref, index) => ({
    kind: parseEvidenceRefKind(kinds[index] ?? kinds[0] ?? 'doc'),
    ref,
  }));
};

const provenanceFromFlags = (flags: Map<string, ReadonlyArray<string>>): VocabularyProvenance => {
  const kind = parseProvenanceKind(optionalFlag(flags, 'provenance-kind') ?? 'human');
  const ref = optionalFlag(flags, 'provenance-ref');
  const notedAt = optionalFlag(flags, 'provenance-noted-at');

  // Build provenance with only the fields that were explicitly supplied;
  // --provenance-ref is optional when the term has no traceable source to cite.
  return {
    kind,
    ...(ref && { ref }),
    ...(notedAt && { noted_at: notedAt }),
  };
};

const loadOptions = (context: CliCommandContext): Parameters<typeof loadRepoContext>[0] => {
  if (context.cwd) {
    return { cwd: context.cwd };
  }

  return {};
};

const loadAppServices = async (context: CliCommandContext): Promise<AppServices> => {
  const repo = await loadRepoContext(loadOptions(context));
  const store = createMarkdownRecordStore({ root: repo.recordsRoot });

  return { repo, store };
};

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

const failure = (error: unknown, exitCode = 1): CommandFailure => ({
  error: normalizeError(error),
  exitCode,
});

export {
  assertNoExtraPositionals,
  cliArgumentError,
  cliUsageError,
  evidenceRefFromFlags,
  failure,
  flagValue,
  flagValues,
  isoTimestamp,
  loadAppServices,
  normalizeError,
  optionalFlag,
  parseEvidenceRefKind,
  parseFlags,
  provenanceFromFlags,
  recordTypeFor,
  requirePositional,
  requiredFlag,
  validationContextFor,
};
export type { AppServices, FlagParseResult };
