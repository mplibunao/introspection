import path from 'node:path';

import * as Option from 'effect/Option';
import { Command, Flag } from 'effect/unstable/cli';

import type { CommandOutcome } from '../../commands/types.js';
import { writeExports } from '../../export/export-service.js';
import { exportHuman } from '../../presenters/human.js';
import { exportJson } from '../../presenters/json.js';
import { recordTypeRegistry } from '../../record-types/registry.js';
import { loadAppServicesForRoot, validationContextFor } from '../app-services.js';
import type { CliEnvShape } from '../env.js';
import type { FlagSpec } from '../flag-guard.js';
import { dispatch } from '../output.js';

import { rootFlagOption } from './shared.js';

type ExportServiceOptions = Parameters<typeof writeExports>[1];

const exportUsage =
  'Usage: introspection export [--format json|gno|all] [--dest DIRECTORY] [--root PATH] [--json]';

const destinationDirectory = (
  cwd: string | undefined,
  value: string | undefined,
): string | undefined => {
  if (!value) {
    return;
  }

  return path.resolve(cwd ?? process.cwd(), value);
};

/*
 * --dest resolves against the invocation cwd, not the --root repo-discovery
 * override: --root only redirects where .introspection/ is found.
 */
const exportOptions = (
  env: CliEnvShape,
  destValue: string | undefined,
  services: Pick<ExportServiceOptions, 'repo' | 'store'>,
): ExportServiceOptions => {
  const options: ExportServiceOptions = {
    generatedAt: env.now(),
    registry: recordTypeRegistry,
    repo: services.repo,
    store: services.store,
    validationContext: validationContextFor(services.repo),
  };
  const explicitDestination = destinationDirectory(env.cwd, destValue);

  if (explicitDestination) {
    return { ...options, destinationDirectory: explicitDestination };
  }

  return options;
};

type AppServices = Awaited<ReturnType<typeof loadAppServicesForRoot>>;
type ExportFormat = Parameters<typeof writeExports>[0];

interface ExportConfig {
  readonly format: Option.Option<ExportFormat>;
  readonly dest: Option.Option<string>;
  readonly root: Option.Option<string>;
}

const runExport =
  (config: ExportConfig) =>
  async (env: CliEnvShape): Promise<CommandOutcome> => {
    const services: AppServices = await loadAppServicesForRoot(env, config.root);
    const result = await writeExports(
      Option.getOrElse(config.format, () => 'all' as ExportFormat),
      exportOptions(env, Option.getOrUndefined(config.dest), services),
    );

    if (env.json) {
      return { stdout: exportJson(result) };
    }

    return { stdout: exportHuman(result) };
  };

const exportCommand = Command.make('export', {
  format: Flag.choice('format', ['all', 'gno', 'json']).pipe(
    Flag.withDescription('Export format to write.'),
    Flag.optional,
  ),
  dest: Flag.string('dest').pipe(
    Flag.withDescription('Destination directory for generated artifacts.'),
    Flag.optional,
  ),
  root: rootFlagOption,
}).pipe(
  Command.withDescription('Write disposable generated export artifacts.'),
  Command.withHandler((config) => dispatch(runExport(config))),
);

const exportSpec: FlagSpec = {
  strictFlags: true,
  valued: ['format', 'dest'],
  maxPositionals: 0,
  usage: exportUsage,
};

export { exportCommand, exportSpec };
