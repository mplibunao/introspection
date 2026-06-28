import * as Option from 'effect/Option';
import { Command, Flag } from 'effect/unstable/cli';

import type { CliCommandContext, CommandOutcome } from '../../../commands/types.js';
import type { CliEnvShape } from '../../env.js';
import type { FlagSpec } from '../../flag-guard.js';
import { dispatch } from '../../output.js';
import { executeInit } from './scaffold.js';

const initUsage = [
  'introspection init [--root PATH] [--repo-key KEY] [--repo-slug SLUG]',
  '[--records-root PATH] [--agents-file PATH] [--yes] [--show] [--json]',
].join('\n       ');

type InitInputs = Parameters<typeof executeInit>[0];

interface InitConfig {
  readonly repoKey: Option.Option<string>;
  readonly repoSlug: Option.Option<string>;
  readonly recordsRoot: Option.Option<string>;
  readonly agentsFile: Option.Option<string>;
  readonly yes: boolean;
  readonly show: boolean;
  readonly root: Option.Option<string>;
}

const initInputs = (config: InitConfig): InitInputs => {
  const repoKey = Option.getOrUndefined(config.repoKey);
  const repoSlug = Option.getOrUndefined(config.repoSlug);
  const recordsRoot = Option.getOrUndefined(config.recordsRoot);
  const agentsFile = Option.getOrUndefined(config.agentsFile);

  return {
    yes: config.yes,
    show: config.show,
    ...(repoKey && { repoKey }),
    ...(repoSlug && { repoSlug }),
    ...(recordsRoot && { recordsRoot }),
    ...(agentsFile && { agentsFile }),
  };
};

/*
 * Build the boundary context, setting cwd only when a root is known:
 * exactOptionalPropertyTypes forbids an explicit cwd: undefined.
 */
const initContext = (env: CliEnvShape, root: string | undefined): CliCommandContext => {
  if (root) {
    return { json: env.json, now: env.now, cwd: root };
  }

  return { json: env.json, now: env.now };
};

const runInitCommand =
  (config: InitConfig) =>
  async (env: CliEnvShape): Promise<CommandOutcome> => {
    const root = Option.getOrUndefined(config.root) ?? env.cwd;

    return { stdout: await executeInit(initInputs(config), initContext(env, root)) };
  };

const initCommand = Command.make('init', {
  repoKey: Flag.string('repo-key').pipe(
    Flag.withDescription('Repo key (uppercase).'),
    Flag.optional,
  ),
  repoSlug: Flag.string('repo-slug').pipe(Flag.withDescription('Repo slug.'), Flag.optional),
  recordsRoot: Flag.string('records-root').pipe(
    Flag.withDescription('Records root directory.'),
    Flag.optional,
  ),
  agentsFile: Flag.string('agents-file').pipe(
    Flag.withDescription('Custom agents router file path.'),
    Flag.optional,
  ),
  yes: Flag.boolean('yes').pipe(
    Flag.withDescription('Use derived defaults without prompting.'),
    Flag.withDefault(false),
  ),
  show: Flag.boolean('show').pipe(
    Flag.withDescription('Report adoption state without writing.'),
    Flag.withDefault(false),
  ),
  root: Flag.string('root').pipe(
    Flag.withDescription('Scaffold into this path instead of the working directory.'),
    Flag.optional,
  ),
}).pipe(
  Command.withDescription('Scaffold introspection adoption in a repo.'),
  Command.withHandler((config) => dispatch(runInitCommand(config))),
);

const initSpec: FlagSpec = {
  strictFlags: true,
  valued: ['repo-key', 'repo-slug', 'records-root', 'agents-file'],
  boolean: ['yes', 'show'],
  maxPositionals: 0,
  usage: initUsage,
};

export { initCommand, initSpec };
