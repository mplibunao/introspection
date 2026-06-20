import { Command } from 'effect/unstable/cli';

import { cliUsageError, toFailure } from '../../app-services.js';
import type { FlagSpec } from '../../flag-guard.js';
import { dispatch } from '../../output.js';

import { recordCreateUsage, recordTransitionUsage } from './common.js';
import { createCommand } from './create.js';
import { transitionCommand } from './transition.js';

const recordUsage = `${recordCreateUsage}\n       ${recordTransitionUsage}`;

const recordCommand = Command.make('record').pipe(
  Command.withDescription('Create and transition records.'),
  Command.withHandler(() =>
    dispatch(async () => toFailure(cliUsageError(recordUsage, 'Specify a record subcommand.'))),
  ),
  Command.withSubcommands([createCommand, transitionCommand]),
);

const recordCreateSpec: FlagSpec = {
  strictFlags: false,
  maxPositionals: 1,
  usage: recordCreateUsage,
};

const recordTransitionSpec: FlagSpec = {
  strictFlags: false,
  maxPositionals: 2,
  usage: recordTransitionUsage,
};

export { recordCommand, recordCreateSpec, recordTransitionSpec };
