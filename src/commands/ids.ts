/* eslint-disable no-duplicate-imports -- Import-style rules require separate top-level type imports. */
import { repairHuman } from '../presenters/human.js';
import { repairJson } from '../presenters/json.js';
import { repairDuplicateRecordId } from '../store/duplicate-repair-service.js';
import type { DuplicateRepairResult } from '../store/duplicate-repair-service.js';

import {
  cliUsageError,
  failure,
  loadAppServices,
  recordTypeFor,
  requirePositional,
} from './helpers.js';
import type { CommandHandler } from './types.js';

const idsRepairUsage = 'introspection ids repair <record-path> [--json]';

const renderRepair = (json: boolean, result: DuplicateRepairResult): string => {
  if (json) {
    return repairJson(result);
  }

  return repairHuman(result);
};

const repairCommand: CommandHandler = async ({ args, context }) => {
  const recordPath = requirePositional(args, 0, 'record-path', idsRepairUsage);

  if (args.length > 1) {
    return failure(
      cliUsageError(idsRepairUsage, 'Command received unexpected arguments.', {
        arguments: args.slice(1),
      }),
    );
  }

  const { repo, store } = await loadAppServices(context);
  const record = await store.readRecord(recordPath);
  const result = await repairDuplicateRecordId({
    context: repo,
    record,
    recordType: recordTypeFor(record),
    store,
  });

  return { stdout: renderRepair(context.json, result) };
};

const idsCommand: CommandHandler = async ({ args, context }) => {
  try {
    const [subcommand, ...rest] = args;

    if (subcommand === 'repair') {
      return repairCommand({ args: rest, context });
    }

    return failure(cliUsageError(idsRepairUsage, 'Unsupported ids command.'));
  } catch (error) {
    return failure(error);
  }
};

export { idsCommand };
