/* eslint-disable no-duplicate-imports -- Import-style rules require separate top-level type imports. */
import path from 'node:path';

import { writeExports } from '../export/export-service.js';
import type {
  ExportFormat,
  ExportServiceOptions,
  ExportServiceResult,
} from '../export/export-service.js';
import { exportHuman } from '../presenters/human.js';
import { exportJson } from '../presenters/json.js';
import { recordTypeRegistry } from '../record-types/registry.js';

import {
  assertKnownFlags,
  assertNoExtraPositionals,
  cliArgumentError,
  contextWithRootOverride,
  failure,
  loadAppServices,
  optionalFlag,
  parseFlags,
  validationContextFor,
} from './helpers.js';
import type { CommandHandler } from './types.js';

const exportUsage =
  'Usage: introspection export [--format json|gno|all] [--dest DIRECTORY] [--root PATH] [--json]';

const parseFormat = (value: string | undefined): ExportFormat => {
  if (!value) {
    return 'all';
  }

  switch (value) {
    case 'all':
    case 'gno':
    case 'json':
      return value;
    default:
      throw cliArgumentError('--format must be one of: json, gno, all.', {
        allowed: ['all', 'gno', 'json'],
        value,
      });
  }
};

const destinationDirectory = (
  cwd: string | undefined,
  value: string | undefined,
): string | undefined => {
  if (!value) {
    return;
  }

  return path.resolve(cwd ?? process.cwd(), value);
};

const renderExport = (json: boolean, result: ExportServiceResult): string => {
  if (json) {
    return exportJson(result);
  }

  return exportHuman(result);
};

const exportOptions = (
  flags: Map<string, ReadonlyArray<string>>,
  context: Parameters<CommandHandler>[0]['context'],
  services: Pick<ExportServiceOptions, 'repo' | 'store'>,
): ExportServiceOptions => {
  const options: ExportServiceOptions = {
    generatedAt: context.now(),
    registry: recordTypeRegistry,
    repo: services.repo,
    store: services.store,
    validationContext: validationContextFor(services.repo),
  };
  const explicitDestination = destinationDirectory(context.cwd, optionalFlag(flags, 'dest'));

  if (explicitDestination) {
    return { ...options, destinationDirectory: explicitDestination };
  }

  return options;
};

const exportCommand: CommandHandler = async ({ args, context }) => {
  try {
    const { flags, positionals } = parseFlags(args);
    assertNoExtraPositionals(positionals, exportUsage);
    assertKnownFlags(flags, { valued: ['format', 'dest'] }, exportUsage);
    const services = await loadAppServices(contextWithRootOverride(context, flags));
    const result = await writeExports(
      parseFormat(optionalFlag(flags, 'format')),
      exportOptions(flags, context, services),
    );

    return { stdout: renderExport(context.json, result) };
  } catch (error) {
    return failure(error);
  }
};

export { exportCommand };
