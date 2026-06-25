import type * as Option from 'effect/Option';
import { Command } from 'effect/unstable/cli';

import type { CommandOutcome } from '../../commands/types.js';
import { checkRecords } from '../../core/validation.js';
import { checkHuman } from '../../presenters/human.js';
import { checkJson } from '../../presenters/json.js';
import { recordTypeRegistry } from '../../record-types/registry.js';
import { loadAppServicesForRoot, validationContextFor } from '../app-services.js';
import type { CliEnvShape } from '../env.js';
import type { FlagSpec } from '../flag-guard.js';
import { dispatch } from '../output.js';

import { rootFlagOption } from './shared.js';

const checkUsage = 'introspection check [--root PATH] [--json]';

const checkExitCode = (ok: boolean): number => {
  if (ok) {
    return 0;
  }

  return 1;
};

const renderCheck = (json: boolean, report: Awaited<ReturnType<typeof checkRecords>>): string => {
  if (json) {
    return checkJson(report);
  }

  return checkHuman(report);
};

const runCheck =
  (root: Option.Option<string>) =>
  async (env: CliEnvShape): Promise<CommandOutcome> => {
    const { repo, store } = await loadAppServicesForRoot(env, root);
    const report = await checkRecords({
      context: validationContextFor(repo),
      registry: recordTypeRegistry,
      store,
    });

    return {
      exitCode: checkExitCode(report.ok),
      stdout: renderCheck(env.json, report),
    };
  };

const checkCommand = Command.make('check', { root: rootFlagOption }).pipe(
  Command.withDescription('Validate records.'),
  Command.withHandler((config) => dispatch(runCheck(config.root))),
);

const checkSpec: FlagSpec = { strictFlags: true, maxPositionals: 0, usage: checkUsage };

export { checkCommand, checkSpec };
