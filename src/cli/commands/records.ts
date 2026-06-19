import * as Option from 'effect/Option';
import { Command, Flag } from 'effect/unstable/cli';

import type { CommandOutcome } from '../../commands/types.js';
import type { RepoContext } from '../../config/repo-context.js';
import { selectRecordList } from '../../core/record-list-selector.js';
import { recordListHuman } from '../../presenters/human.js';
import { recordListJson } from '../../presenters/json.js';
import { recordTypeRegistry } from '../../record-types/registry.js';
import {
  cliUsageError,
  loadAppServicesForRoot,
  toFailure,
  validationContextFor,
} from '../app-services.js';
import type { CliEnvShape } from '../env.js';
import type { FlagSpec } from '../flag-guard.js';
import { dispatch } from '../output.js';

import { rootFlagOption } from './shared.js';

type AppServices = Awaited<ReturnType<typeof loadAppServicesForRoot>>;
type RecordListLimitDefaults = NonNullable<Parameters<typeof selectRecordList>[0]['limits']>;
type RecordListResult = ReturnType<typeof selectRecordList>;
type SelectRecordListOptions = Parameters<typeof selectRecordList>[0];

const listUsage =
  'Usage: introspection records list [--type TYPE] [--status STATUS] [--tag TAG] [--path PATH] [--limit N] [--include-terminal] [--all] [--root PATH] [--json]';

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

interface ListConfig {
  readonly limit: Option.Option<number>;
  readonly type: ReadonlyArray<string>;
  readonly status: ReadonlyArray<string>;
  readonly tag: ReadonlyArray<string>;
  readonly path: ReadonlyArray<string>;
  readonly includeTerminal: boolean;
  readonly all: boolean;
  readonly root: Option.Option<string>;
}

const recordListSelectionFor = async (
  services: AppServices,
  config: ListConfig,
  now: Date,
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
    now,
    limits: recordListLimitDefaults(services.repo),
    filters: {
      types: config.type,
      statuses: config.status,
      tags: config.tag,
      paths: config.path,
      includeTerminal: config.includeTerminal,
      all: config.all,
    },
    failedReadCount: results.length - readSuccesses.length,
  };

  return selectWithLimit(selectionOptions, Option.getOrUndefined(config.limit));
};

const runList =
  (config: ListConfig) =>
  async (env: CliEnvShape): Promise<CommandOutcome> => {
    const services = await loadAppServicesForRoot(env, config.root);
    const selection = await recordListSelectionFor(services, config, env.now());

    if (env.json) {
      return { stdout: recordListJson(services.repo, selection) };
    }

    return { stdout: recordListHuman(services.repo, selection) };
  };

const stringList = (name: string, description: string): Flag.Flag<ReadonlyArray<string>> =>
  Flag.string(name).pipe(Flag.withDescription(description), Flag.atLeast(0));

const listCommand = Command.make('list', {
  limit: Flag.integer('limit').pipe(
    Flag.withDescription('Maximum number of records to show.'),
    Flag.optional,
  ),
  type: stringList('type', 'Filter by record type.'),
  status: stringList('status', 'Filter by status.'),
  tag: stringList('tag', 'Filter by tag.'),
  path: stringList('path', 'Filter by record path prefix.'),
  includeTerminal: Flag.boolean('include-terminal').pipe(
    Flag.withDescription('Include terminal records alongside active ones.'),
    Flag.withDefault(false),
  ),
  all: Flag.boolean('all').pipe(
    Flag.withDescription('Include every record regardless of status.'),
    Flag.withDefault(false),
  ),
  root: rootFlagOption,
}).pipe(
  Command.withDescription('List bounded active records with filters.'),
  Command.withHandler((config) => dispatch(runList(config))),
);

const recordsCommand = Command.make('records').pipe(
  Command.withDescription('List and inspect records.'),
  Command.withHandler(() =>
    dispatch(async () => toFailure(cliUsageError(listUsage, 'Specify a records subcommand.'))),
  ),
  Command.withSubcommands([listCommand]),
);

const recordsListSpec: FlagSpec = {
  strictFlags: true,
  valued: ['limit', 'type', 'status', 'tag', 'path'],
  boolean: ['include-terminal', 'all'],
  maxPositionals: 0,
  usage: listUsage,
};

export { recordsCommand, recordsListSpec };
