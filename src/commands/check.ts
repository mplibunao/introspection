import { checkRecords } from '../core/validation.js';
import { checkHuman } from '../presenters/human.js';
import { checkJson } from '../presenters/json.js';
import { recordTypeRegistry } from '../record-types/registry.js';

import {
  assertNoExtraPositionals,
  failure,
  loadAppServices,
  validationContextFor,
} from './helpers.js';
import type { CommandHandler } from './types.js';

const checkUsage = 'introspection check [--json]';

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

const checkCommand: CommandHandler = async ({ args, context }) => {
  try {
    assertNoExtraPositionals(args, checkUsage);
    const { repo, store } = await loadAppServices(context);
    const report = await checkRecords({
      context: validationContextFor(repo),
      registry: recordTypeRegistry,
      store,
    });

    return {
      exitCode: checkExitCode(report.ok),
      stdout: renderCheck(context.json, report),
    };
  } catch (error) {
    return failure(error);
  }
};

export { checkCommand };
