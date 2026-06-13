import path from 'node:path';

import { runImport } from '../import/import-service.js';
import { loadManifest, manifestSchema } from '../import/manifest.js';
import { importHuman } from '../presenters/human.js';
import { importJson, importSchemaJson } from '../presenters/json.js';

import {
  assertKnownFlags,
  assertNoExtraPositionals,
  booleanFlag,
  contextWithRootOverride,
  failure,
  isoTimestamp,
  loadAppServices,
  parseFlags,
  requiredFlag,
  validationContextFor,
} from './helpers.js';
import type { CliCommandContext, CommandHandler, CommandOutcome } from './types.js';

const importUsage =
  'Usage: introspection import --manifest PATH [--dry-run] [--print-schema] [--root PATH] [--json]';
const valuedFlags = ['manifest'] as const;
const booleanFlags = ['dry-run', 'print-schema'] as const;

const importExitCode = (ok: boolean): number => {
  if (ok) {
    return 0;
  }

  return 1;
};

/*
 * The manifest path is a filesystem argument resolved against the invocation cwd, not the
 * --root repo-discovery override: --root only redirects where .introspection/ is found.
 */
const resolveManifestPath = (context: CliCommandContext, manifestPath: string): string => {
  if (path.isAbsolute(manifestPath)) {
    return manifestPath;
  }

  return path.resolve(context.cwd ?? process.cwd(), manifestPath);
};

const renderImport = (
  context: CliCommandContext,
  services: Awaited<ReturnType<typeof loadAppServices>>,
  report: Awaited<ReturnType<typeof runImport>>,
): string => {
  if (context.json) {
    return importJson(services.repo, report);
  }

  return importHuman(services.repo, report);
};

const runImportCommand = async (
  flags: Map<string, ReadonlyArray<string>>,
  context: CliCommandContext,
): Promise<CommandOutcome> => {
  const manifestPath = resolveManifestPath(context, requiredFlag(flags, 'manifest'));
  const services = await loadAppServices(contextWithRootOverride(context, flags));
  const manifest = await loadManifest(manifestPath);
  const report = await runImport({
    dryRun: booleanFlag(flags, 'dry-run'),
    importedAt: isoTimestamp(context.now()),
    manifest,
    repo: services.repo,
    store: services.store,
    validationContext: validationContextFor(services.repo),
  });

  return { exitCode: importExitCode(report.ok), stdout: renderImport(context, services, report) };
};

const importCommand: CommandHandler = async ({ args, context }) => {
  try {
    const { flags, positionals } = parseFlags(args);
    assertNoExtraPositionals(positionals, importUsage);
    assertKnownFlags(flags, { boolean: [...booleanFlags], valued: [...valuedFlags] }, importUsage);

    // The --print-schema path emits the authoring target and needs no repo or manifest.
    if (booleanFlag(flags, 'print-schema')) {
      return { stdout: importSchemaJson(manifestSchema) };
    }

    return await runImportCommand(flags, context);
  } catch (error) {
    return failure(error);
  }
};

export { importCommand };
