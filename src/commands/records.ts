/* eslint-disable no-duplicate-imports -- Import-style rules require separate top-level type imports. */
import type { RepoContext } from '../config/repo-context.js';
import { selectRecordList } from '../core/record-list-selector.js';
import type {
  RecordListFilters,
  RecordListLimitDefaults,
  RecordListResult,
  SelectRecordListOptions,
} from '../core/record-list-selector.js';
import { recordListHuman } from '../presenters/human.js';
import { recordListJson } from '../presenters/json.js';
import { recordTypeRegistry } from '../record-types/registry.js';

import {
  assertKnownFlags,
  assertNoExtraPositionals,
  booleanFlag,
  cliArgumentError,
  cliUsageError,
  contextWithRootOverride,
  failure,
  flagValues,
  loadAppServices,
  optionalFlag,
  parseFlags,
  validationContextFor,
} from './helpers.js';
import type { AppServices } from './helpers.js';
import type { CliCommandContext, CommandHandler, CommandOutcome } from './types.js';

const listUsage =
  'Usage: introspection records list [--type TYPE] [--status STATUS] [--tag TAG] [--path PATH] [--limit N] [--include-terminal] [--all] [--root PATH] [--json]';
const decimalRadix = 10;

const valuedFlags = ['limit', 'type', 'status', 'tag', 'path'] as const;
const booleanFlags = ['include-terminal', 'all'] as const;

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

const recordListLimitDefaults = (repo: RepoContext): RecordListLimitDefaults => {
  const limits: { defaultLimit?: number; hardLimit?: number } = {};

  if (typeof repo.config.records.list?.default_limit === 'number') {
    limits.defaultLimit = repo.config.records.list.default_limit;
  }

  if (typeof repo.config.records.list?.hard_limit === 'number') {
    limits.hardLimit = repo.config.records.list.hard_limit;
  }

  return limits;
};

const selectWithLimit = (
  options: Omit<SelectRecordListOptions, 'requestedLimit'>,
  requestedLimit: number | undefined,
): RecordListResult => {
  if (typeof requestedLimit === 'number') {
    return selectRecordList({ ...options, requestedLimit });
  }

  return selectRecordList(options);
};

const recordListFilters = (flags: Map<string, ReadonlyArray<string>>): RecordListFilters => ({
  types: flagValues(flags, 'type'),
  statuses: flagValues(flags, 'status'),
  tags: flagValues(flags, 'tag'),
  paths: flagValues(flags, 'path'),
  includeTerminal: booleanFlag(flags, 'include-terminal'),
  all: booleanFlag(flags, 'all'),
});

const recordListSelectionFor = async (
  services: AppServices,
  flags: Map<string, ReadonlyArray<string>>,
  context: CliCommandContext,
): Promise<RecordListResult> => {
  const results = await services.store.listRecordResults();
  const readSuccesses = results.filter((result) => result.ok);
  const selectionOptions: Omit<SelectRecordListOptions, 'requestedLimit'> = {
    records: readSuccesses.map((result) => ({
      record: result.record,
      relativePath: result.record.relativePath,
    })),
    registry: recordTypeRegistry,
    context: validationContextFor(services.repo),
    now: context.now(),
    limits: recordListLimitDefaults(services.repo),
    filters: recordListFilters(flags),
    failedReadCount: results.length - readSuccesses.length,
  };

  return selectWithLimit(selectionOptions, parseLimit(optionalFlag(flags, 'limit')));
};

const renderRecordList = (
  json: boolean,
  repo: RepoContext,
  selection: RecordListResult,
): string => {
  if (json) {
    return recordListJson(repo, selection);
  }

  return recordListHuman(repo, selection);
};

const listRecords = async (
  args: ReadonlyArray<string>,
  context: CliCommandContext,
): Promise<CommandOutcome> => {
  const { flags, positionals } = parseFlags(args);
  assertNoExtraPositionals(positionals, listUsage);
  assertKnownFlags(flags, { valued: [...valuedFlags], boolean: [...booleanFlags] }, listUsage);
  const services = await loadAppServices(contextWithRootOverride(context, flags));
  const selection = await recordListSelectionFor(services, flags, context);

  return { stdout: renderRecordList(context.json, services.repo, selection) };
};

const recordsCommand: CommandHandler = async ({ args, context }) => {
  try {
    const [subcommand, ...rest] = args;

    if (subcommand === 'list') {
      return await listRecords(rest, context);
    }

    return failure(
      cliUsageError(listUsage, 'Unsupported records command.', { subcommand: subcommand ?? null }),
    );
  } catch (error) {
    return failure(error);
  }
};

export { recordsCommand };
