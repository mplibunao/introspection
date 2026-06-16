import { Command } from 'effect/unstable/cli';

import { packageVersion } from '../version.js';
import type { CommandOutcome } from '../commands/types.js';

import { checkCommand, checkSpec } from './commands/check.js';
import { exportCommand, exportSpec } from './commands/export.js';
import { idsCommand, idsRepairSpec } from './commands/ids.js';
import { importCommand, importSpec } from './commands/import.js';
import { initCommand, initSpec } from './commands/init/index.js';
import { primeCommand, primeSpec } from './commands/prime.js';
import { recordCommand, recordCreateSpec, recordTransitionSpec } from './commands/record/index.js';
import { recordsCommand, recordsListSpec } from './commands/records.js';
import { vocabCommand, vocabSpecs } from './commands/vocab.js';
import type { FlagSpec } from './flag-guard.js';
import { dispatch } from './output.js';

const helpText = `introspection ${packageVersion}

Commands:
  init                          Scaffold introspection adoption in a repo.
  check                         Validate records.
  prime                         Show repo orientation: record counts, policy docs, vocabulary.
  records list                  List bounded active records with filters.
  export                        Write disposable generated export artifacts.
  import                        Import records from an agent-authored manifest.
  record create tech-debt       Create a tech-debt record.
  record transition             Move a record through its lifecycle.
  ids repair                    Repair one duplicate record ID.
  vocab                         Manage record-local vocabulary.

Use --json with any command for machine-readable output.`;

/*
 * Minimal command registration descriptor for the Effect CLI shell. The command
 * value registers the Effect subcommand, the path keys strict pre-scan specs,
 * and parentUsage marks known subcommand parents. Keeping these in one table is
 * the guard against drift between app registration and flag/usage metadata.
 */
const commandRegistrations = [
  { path: ['init'], command: initCommand, spec: initSpec },
  { path: ['check'], command: checkCommand, spec: checkSpec },
  { path: ['prime'], command: primeCommand, spec: primeSpec },
  { path: ['export'], command: exportCommand, spec: exportSpec },
  { path: ['import'], command: importCommand, spec: importSpec },
  { path: ['records'], command: recordsCommand, parentUsage: recordsListSpec.usage },
  { path: ['records', 'list'], spec: recordsListSpec },
  {
    path: ['record'],
    command: recordCommand,
    parentUsage: `${recordCreateSpec.usage}\n       ${recordTransitionSpec.usage}`,
  },
  { path: ['record', 'create'], spec: recordCreateSpec },
  { path: ['record', 'transition'], spec: recordTransitionSpec },
  { path: ['ids'], command: idsCommand, parentUsage: idsRepairSpec.usage },
  { path: ['ids', 'repair'], spec: idsRepairSpec },
  { path: ['vocab'], command: vocabCommand, parentUsage: vocabSpecs.list.usage },
  { path: ['vocab', 'list'], spec: vocabSpecs.list },
  { path: ['vocab', 'usage'], spec: vocabSpecs.usage },
  { path: ['vocab', 'propose'], spec: vocabSpecs.propose },
  { path: ['vocab', 'approve'], spec: vocabSpecs.approve },
  { path: ['vocab', 'reject'], spec: vocabSpecs.reject },
  { path: ['vocab', 'rename'], spec: vocabSpecs.rename },
  { path: ['vocab', 'merge'], spec: vocabSpecs.merge },
  { path: ['vocab', 'delete'], spec: vocabSpecs.delete },
] as const;

const commandPathKey = (path: ReadonlyArray<string>): string => path.join(' ');

const registeredSubcommands = commandRegistrations.flatMap((registration) => {
  if (registration.path.length === 1 && 'command' in registration) {
    return [registration.command];
  }

  return [];
});

const specTable: Record<string, FlagSpec> = Object.fromEntries(
  commandRegistrations.flatMap((registration) => {
    if ('spec' in registration) {
      return [[commandPathKey(registration.path), registration.spec]];
    }

    return [];
  }),
);

const parentUsage: Record<string, string> = Object.fromEntries(
  commandRegistrations.flatMap((registration) => {
    if (registration.path.length === 1 && 'parentUsage' in registration) {
      return [[commandPathKey(registration.path), registration.parentUsage]];
    }

    return [];
  }),
);

/*
 * The root command prints the command overview when invoked with no
 * subcommand, preserving the pre-cutover no-argument behavior (exit 0, help to
 * stdout). `--help` and `--version` are handled by Effect's built-in action
 * flags before this handler runs.
 */
const cli = Command.make('introspection').pipe(
  Command.withDescription('Governed markdown record substrate CLI.'),
  Command.withHandler(() =>
    dispatch(async (): Promise<CommandOutcome> => ({ stdout: `${helpText}\n` })),
  ),
  Command.withSubcommands(registeredSubcommands),
);

const subcommandParents = new Set(Object.keys(parentUsage));
const subcommandPathLength = 2;

interface ResolvedCommand {
  readonly spec: FlagSpec | undefined;
  readonly rest: ReadonlyArray<string>;
  /** Parent usage to surface when a known parent received an unrecognized child. */
  readonly unknownChildUsage?: string | undefined;
}

/*
 * Resolve the command path from argv (already stripped of the global --json
 * flag) and return the matching strict spec plus the command's own argument
 * slice. Any token after a known parent must be a registered child; otherwise
 * the parent gets the same stable cli.usage envelope whether that token looks
 * like a bare child (`bogus`) or a flag-shaped child (`--bogus`).
 */
const resolveCommand = (args: ReadonlyArray<string>): ResolvedCommand => {
  const [first, second] = args;

  if (typeof first === 'string' && subcommandParents.has(first) && typeof second === 'string') {
    const spec = specTable[`${first} ${second}`];

    if (!spec) {
      return {
        rest: args.slice(subcommandPathLength),
        spec,
        unknownChildUsage: parentUsage[first],
      };
    }

    return { rest: args.slice(subcommandPathLength), spec };
  }

  /*
   * A missing spec for the bare root and for unknown commands alike (first ?? '')
   * skips the pre-scan and lets Effect parse/dispatch directly.
   */
  return { rest: args.slice(1), spec: specTable[first ?? ''] };
};

export { cli, helpText, resolveCommand };
