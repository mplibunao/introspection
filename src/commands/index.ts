import { version } from '../index.js';
import { errorHuman } from '../presenters/human.js';
import { errorJson } from '../presenters/json.js';

import { checkCommand } from './check.js';
import { exportCommand } from './export.js';
import { cliArgumentError, failure, normalizeError } from './helpers.js';
import { idsCommand } from './ids.js';
import { primeCommand } from './prime.js';
import { recordCommand } from './record.js';
import type {
  CliCommandContext,
  CliRunOptions,
  CliRunResult,
  CommandHandler,
  CommandOutcome,
} from './types.js';
import { vocabCommand } from './vocab.js';

const commandHandlers = new Map<string, CommandHandler>([
  ['check', checkCommand],
  ['prime', primeCommand],
  ['export', exportCommand],
  ['record', recordCommand],
  ['ids', idsCommand],
  ['vocab', vocabCommand],
]);

const helpText = `introspection ${version}

Commands:
  check                         Validate records.
  prime                         Show bounded active record context.
  export                        Write disposable generated export artifacts.
  record create tech-debt       Create a tech-debt record.
  record transition             Move a record through its lifecycle.
  ids repair                    Repair one duplicate record ID.
  vocab                         Manage record-local vocabulary.

Use --json with any command for machine-readable output.`;

const stripGlobalJsonFlag = (
  args: ReadonlyArray<string>,
): { readonly args: ReadonlyArray<string>; readonly json: boolean } => {
  const nextArgs: Array<string> = [];
  let json = false;

  for (const arg of args) {
    if (arg === '--json') {
      json = true;
    } else {
      nextArgs.push(arg);
    }
  }

  return { args: nextArgs, json };
};

const commandNotFound = (command: string): CommandOutcome =>
  failure(cliArgumentError('Unknown command.', { command }), 1);

const renderFailure = (
  outcome: Extract<CommandOutcome, { readonly error: unknown }>,
  json: boolean,
): CliRunResult => {
  const { error } = outcome;

  if (json) {
    return { exitCode: outcome.exitCode ?? 1, stdout: errorJson(error), stderr: '' };
  }

  return { exitCode: outcome.exitCode ?? 1, stdout: '', stderr: errorHuman(error) };
};

const isFailure = (
  outcome: CommandOutcome,
): outcome is Extract<CommandOutcome, { readonly error: unknown }> => 'error' in outcome;

const commandContextFor = (
  cwd: string | undefined,
  json: boolean,
  now: () => Date,
): CliCommandContext => {
  if (cwd) {
    return { cwd, json, now };
  }

  return { json, now };
};

const commandOutcome = async (
  command: string,
  rest: ReadonlyArray<string>,
  context: CliCommandContext,
): Promise<CommandOutcome> => {
  const handler = commandHandlers.get(command);

  if (handler) {
    return handler({ args: rest, context });
  }

  return commandNotFound(command);
};

const successResult = (
  outcome: Exclude<CommandOutcome, { readonly error: unknown }>,
): CliRunResult => ({
  exitCode: outcome.exitCode ?? 0,
  stdout: outcome.stdout,
  stderr: outcome.stderr ?? '',
});

const executeCommand = async (
  command: string,
  rest: ReadonlyArray<string>,
  context: CliCommandContext,
): Promise<CommandOutcome> => commandOutcome(command, rest, context);

const runCli = async ({
  args,
  cwd,
  now = () => new Date(),
}: CliRunOptions): Promise<CliRunResult> => {
  const { args: commandArgs, json } = stripGlobalJsonFlag(args);
  const [command, ...rest] = commandArgs;

  if (!command || command === '--help' || command === '-h') {
    return { exitCode: 0, stdout: `${helpText}\n`, stderr: '' };
  }

  try {
    const outcome = await executeCommand(command, rest, commandContextFor(cwd, json, now));

    if (isFailure(outcome)) {
      return renderFailure(outcome, json);
    }

    return successResult(outcome);
  } catch (error) {
    return renderFailure({ error: normalizeError(error) }, json);
  }
};

export { helpText, runCli };
