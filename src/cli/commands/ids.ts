import type * as Option from 'effect/Option';
import { Argument, Command } from 'effect/unstable/cli';

import type { CommandOutcome } from '../../commands/types.js';
import { repairHuman } from '../../presenters/human.js';
import { repairJson } from '../../presenters/json.js';
import { repairDuplicateRecordId } from '../../store/duplicate-repair-service.js';
import {
  cliUsageError,
  loadAppServicesForRoot,
  recordTypeFor,
  toFailure,
} from '../app-services.js';
import type { CliEnvShape } from '../env.js';
import type { FlagSpec } from '../flag-guard.js';
import { dispatch } from '../output.js';

import { rootFlagOption } from './shared.js';

const idsRepairUsage = 'introspection ids repair <record-path> [--root PATH] [--json]';

const runRepair =
  (recordPath: string, root: Option.Option<string>) =>
  async (env: CliEnvShape): Promise<CommandOutcome> => {
    const { repo, store } = await loadAppServicesForRoot(env, root);
    const record = await store.readRecord(recordPath);
    const result = await repairDuplicateRecordId({
      context: repo,
      record,
      recordType: recordTypeFor(record),
      store,
    });

    if (env.json) {
      return { stdout: repairJson(result) };
    }

    return { stdout: repairHuman(result) };
  };

const repairCommand = Command.make('repair', {
  recordPath: Argument.string('record-path').pipe(
    Argument.withDescription('Path of the record whose duplicate ID should be repaired.'),
  ),
  root: rootFlagOption,
}).pipe(
  Command.withDescription('Repair one duplicate record ID.'),
  Command.withHandler((config) => dispatch(runRepair(config.recordPath, config.root))),
);

const idsCommand = Command.make('ids').pipe(
  Command.withDescription('Inspect and repair record identities.'),
  Command.withHandler(() =>
    dispatch(async () => toFailure(cliUsageError(idsRepairUsage, 'Specify an ids subcommand.'))),
  ),
  Command.withSubcommands([repairCommand]),
);

const idsRepairSpec: FlagSpec = { strictFlags: false, maxPositionals: 1, usage: idsRepairUsage };

export { idsCommand, idsRepairSpec };
