/* eslint-disable no-duplicate-imports -- Import-style rules require separate top-level type imports. */
import type { RepoContext } from '../config/repo-context.js';
import { selectPrimeRecords } from '../core/prime-selector.js';
import type {
  PrimeFilters,
  PrimeLimitDefaults,
  PrimeSelection,
  SelectPrimeOptions,
} from '../core/prime-selector.js';
import { primeHuman } from '../presenters/human.js';
import { primeJson } from '../presenters/json.js';
import { recordTypeRegistry } from '../record-types/registry.js';
import {
  assertNoExtraPositionals,
  cliArgumentError,
  failure,
  flagValues,
  loadAppServices,
  optionalFlag,
  parseFlags,
  validationContextFor,
} from './helpers.js';
import type { AppServices } from './helpers.js';
import type { CliCommandContext, CommandHandler } from './types.js';

const primeUsage =
  'Usage: introspection prime [--type TYPE] [--status STATUS] [--tag TAG] [--path PATH] [--limit N] [--include-terminal] [--all] [--json]';
const trueFlagValue = 'true';
const decimalRadix = 10;
const valueRequiredFlags = ['limit', 'type', 'status', 'tag', 'path'] as const;

type ValueRequiredFlag = (typeof valueRequiredFlags)[number];

const booleanFlag = (flags: Map<string, ReadonlyArray<string>>, key: string): boolean =>
  flagValues(flags, key).includes(trueFlagValue);

const flagValueIsMissing = (value: string): boolean =>
  value.length === 0 || value === trueFlagValue;

const assertValueRequiredFlag = (
  flags: Map<string, ReadonlyArray<string>>,
  key: ValueRequiredFlag,
): void => {
  if (flagValues(flags, key).some(flagValueIsMissing)) {
    throw cliArgumentError(`--${key} requires a value.`, { flag: key, usage: primeUsage });
  }
};

const assertValueRequiredFlags = (flags: Map<string, ReadonlyArray<string>>): void => {
  for (const key of valueRequiredFlags) {
    assertValueRequiredFlag(flags, key);
  }
};

const parseLimit = (value: string | undefined): number | undefined => {
  if (!value) {
    return;
  }

  const parsed = Number.parseInt(value, decimalRadix);

  if (String(parsed) !== value) {
    throw cliArgumentError('--limit must be a positive integer.', { value });
  }

  return parsed;
};

const primeLimitDefaults = (repo: RepoContext): PrimeLimitDefaults => {
  const limits: { defaultLimit?: number; hardLimit?: number } = {};

  if (typeof repo.config.prime?.default_limit === 'number') {
    limits.defaultLimit = repo.config.prime.default_limit;
  }

  if (typeof repo.config.prime?.hard_limit === 'number') {
    limits.hardLimit = repo.config.prime.hard_limit;
  }

  return limits;
};

const selectPrimeWithLimit = (
  options: Omit<SelectPrimeOptions, 'requestedLimit'>,
  requestedLimit: number | undefined,
): PrimeSelection => {
  if (typeof requestedLimit === 'number') {
    return selectPrimeRecords({ ...options, requestedLimit });
  }

  return selectPrimeRecords(options);
};

const primeFilters = (flags: Map<string, ReadonlyArray<string>>): PrimeFilters => ({
  types: flagValues(flags, 'type'),
  statuses: flagValues(flags, 'status'),
  tags: flagValues(flags, 'tag'),
  paths: flagValues(flags, 'path'),
  includeTerminal: booleanFlag(flags, 'include-terminal'),
  all: booleanFlag(flags, 'all'),
});

const primeSelectionFor = async (
  services: AppServices,
  flags: Map<string, ReadonlyArray<string>>,
  context: CliCommandContext,
): Promise<PrimeSelection> => {
  const results = await services.store.listRecordResults();
  const readSuccesses = results.filter((result) => result.ok);
  const selectionOptions: Omit<SelectPrimeOptions, 'requestedLimit'> = {
    records: readSuccesses.map((result) => ({
      record: result.record,
      relativePath: result.record.relativePath,
    })),
    registry: recordTypeRegistry,
    context: validationContextFor(services.repo),
    now: context.now(),
    limits: primeLimitDefaults(services.repo),
    filters: primeFilters(flags),
    failedReadCount: results.length - readSuccesses.length,
  };

  return selectPrimeWithLimit(selectionOptions, parseLimit(optionalFlag(flags, 'limit')));
};

const renderPrime = (json: boolean, repo: RepoContext, selection: PrimeSelection): string => {
  if (json) {
    return primeJson(repo, selection);
  }

  return primeHuman(repo, selection);
};

const primeCommand: CommandHandler = async ({ args, context }) => {
  try {
    const { flags, positionals } = parseFlags(args);
    assertNoExtraPositionals(positionals, primeUsage);
    assertValueRequiredFlags(flags);
    const services = await loadAppServices(context);
    const selection = await primeSelectionFor(services, flags, context);

    return { stdout: renderPrime(context.json, services.repo, selection) };
  } catch (error) {
    return failure(error);
  }
};

export { primeCommand };
