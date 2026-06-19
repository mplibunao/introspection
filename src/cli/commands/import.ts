import path from 'node:path';

import * as Option from 'effect/Option';
import { Command, Flag } from 'effect/unstable/cli';

import type { CommandOutcome } from '../../commands/types.js';
import { isoTimestamp } from '../../core/time.js';
import { runImport } from '../../import/import-service.js';
import { loadManifest, manifestSchema } from '../../import/manifest.js';
import { importHuman } from '../../presenters/human.js';
import { importJson, importSchemaJson } from '../../presenters/json.js';
import {
  exitCodeForOk,
  loadAppServicesForRoot,
  requireFlagValue,
  validationContextFor,
} from '../app-services.js';
import type { CliEnvShape } from '../env.js';
import type { FlagSpec } from '../flag-guard.js';
import { dispatch } from '../output.js';

import { rootFlagOption } from './shared.js';

const importUsage =
  'Usage: introspection import --manifest PATH [--dry-run] [--print-schema] [--root PATH] [--json]';

/*
 * The manifest path is resolved against the invocation cwd, not the --root
 * repo-discovery override: --root only redirects where .introspection/ is found.
 */
const resolveManifestPath = (cwd: string | undefined, manifestPath: string): string => {
  if (path.isAbsolute(manifestPath)) {
    return manifestPath;
  }

  return path.resolve(cwd ?? process.cwd(), manifestPath);
};

interface ImportConfig {
  readonly manifest: Option.Option<string>;
  readonly dryRun: boolean;
  readonly printSchema: boolean;
  readonly root: Option.Option<string>;
}

const importStdout = (
  json: boolean,
  repo: Parameters<typeof importJson>[0],
  report: Parameters<typeof importJson>[1],
): string => {
  if (json) {
    return importJson(repo, report);
  }

  return importHuman(repo, report);
};

const runImportCommand =
  (config: ImportConfig) =>
  async (env: CliEnvShape): Promise<CommandOutcome> => {
    // The --print-schema path emits the authoring target and needs no repo or manifest.
    if (config.printSchema) {
      return { stdout: importSchemaJson(manifestSchema) };
    }

    const manifestArg = requireFlagValue(Option.getOrUndefined(config.manifest), 'manifest');
    const manifestPath = resolveManifestPath(env.cwd, manifestArg);
    const services = await loadAppServicesForRoot(env, config.root);
    const manifest = await loadManifest(manifestPath);
    const report = await runImport({
      dryRun: config.dryRun,
      importedAt: isoTimestamp(env.now()),
      manifest,
      repo: services.repo,
      store: services.store,
      validationContext: validationContextFor(services.repo),
    });
    const exitCode = exitCodeForOk(report.ok);

    return { exitCode, stdout: importStdout(env.json, services.repo, report) };
  };

const importCommand = Command.make('import', {
  manifest: Flag.string('manifest').pipe(
    Flag.withDescription('Path to an agent-authored import manifest.'),
    Flag.optional,
  ),
  dryRun: Flag.boolean('dry-run').pipe(
    Flag.withDescription('Validate the manifest without writing records.'),
    Flag.withDefault(false),
  ),
  printSchema: Flag.boolean('print-schema').pipe(
    Flag.withDescription('Print the manifest JSON schema and exit.'),
    Flag.withDefault(false),
  ),
  root: rootFlagOption,
}).pipe(
  Command.withDescription('Import records from an agent-authored manifest.'),
  Command.withHandler((config) => dispatch(runImportCommand(config))),
);

const importSpec: FlagSpec = {
  strictFlags: true,
  valued: ['manifest'],
  boolean: ['dry-run', 'print-schema'],
  maxPositionals: 0,
  usage: importUsage,
};

export { importCommand, importSpec };
