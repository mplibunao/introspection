import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Layer from 'effect/Layer';
import * as Runtime from 'effect/Runtime';

import { CliEnv } from './cli/env.js';
import { buildProgram, stripGlobalJsonFlag } from './cli/program.js';

/*
 * Bun runtime entrypoint. The Effect command tree (buildProgram) is provided
 * with Bun platform services and launched via BunRuntime.runMain.
 *
 * buildProgram never fails the Effect — domain and parse failures print their
 * payload and record the exit code through CliEnv.setExitCode (process.exitCode
 * here). The default teardown maps every success to 0, so a custom teardown
 * honors the recorded process.exitCode for logical failures while keeping the
 * standard rules (interrupt 130, defect 1) for unexpected outcomes.
 */
const userArgOffset = 2;

const recordedExitCode = (): number => {
  if (typeof process.exitCode === 'number') {
    return process.exitCode;
  }

  return 0;
};

const teardown: Runtime.Teardown = (exit, onExit) => {
  if (Exit.isSuccess(exit)) {
    onExit(recordedExitCode());

    return;
  }

  Runtime.defaultTeardown(exit, onExit);
};

const { args, json } = stripGlobalJsonFlag(process.argv.slice(userArgOffset));

type CliEnvShape = (typeof CliEnv)['Service'];

const env: CliEnvShape = {
  json,
  cwd: process.cwd(),
  now: () => new Date(),
  setExitCode: (code) => {
    process.exitCode = code;
  },
};

const program = buildProgram(args).pipe(
  Effect.scoped,
  Effect.provide(Layer.mergeAll(BunServices.layer, Layer.succeed(CliEnv, env))),
);

BunRuntime.runMain(program, { teardown });
