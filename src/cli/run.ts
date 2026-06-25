import * as NodeServices from '@effect/platform-node/NodeServices';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as TestConsole from 'effect/testing/TestConsole';

import type { CliErrorPayload, CliRunOptions, CliRunResult } from '../commands/types.js';

import { normalizeError } from './app-services.js';
import { CliEnv } from './env.js';
import { renderErrorOutput } from './output.js';
import { buildProgram, stripGlobalJsonFlag } from './program.js';

/*
 * Programmatic / test entry point for the Effect CLI. It mirrors the legacy
 * runCli contract (args in, { exitCode, stdout, stderr } out) so existing call
 * sites and the golden harness keep working unchanged, while underneath the
 * command tree is parsed and dispatched by Effect's `Command.runWith` (inside
 * buildProgram) with output captured through `TestConsole` — no subprocess.
 *
 * Node platform services satisfy the CLI Environment in tests; TestConsole is
 * merged last so its Console implementation wins and captures the output.
 */

const stringify = (line: unknown): string => {
  if (typeof line === 'string') {
    return line;
  }

  return String(line);
};

const failureResult = (payload: CliErrorPayload, json: boolean): CliRunResult => ({
  exitCode: 1,
  ...renderErrorOutput(payload, json),
});

type CliEnvShape = (typeof CliEnv)['Service'];

interface CapturedOutput {
  readonly logLines: ReadonlyArray<unknown>;
  readonly errorLines: ReadonlyArray<unknown>;
}

const captureProgram = async (
  argsWithoutJson: ReadonlyArray<string>,
  env: CliEnvShape,
): Promise<CapturedOutput> =>
  Effect.runPromise(
    Effect.gen(function* capture() {
      yield* buildProgram(argsWithoutJson);

      return {
        logLines: yield* TestConsole.logLines,
        errorLines: yield* TestConsole.errorLines,
      };
    }).pipe(
      Effect.provide(
        Layer.mergeAll(NodeServices.layer, Layer.succeed(CliEnv, env), TestConsole.layer),
      ),
    ),
  );

/*
 * Parse-time output pollution is handled inside buildProgram by the buffered
 * console (which the Bun entrypoint shares), so this adapter just provides the
 * outer TestConsole and reconstructs stdout/stderr from what buildProgram
 * replayed (success) or emitted as the stable payload (failure).
 */
const runCli = async ({
  args,
  cwd,
  now = () => new Date(),
}: CliRunOptions): Promise<CliRunResult> => {
  const { args: argsWithoutJson, json } = stripGlobalJsonFlag(args);

  let exitCode = 0;
  const env: CliEnvShape = {
    json,
    cwd,
    now,
    setExitCode: (code) => {
      exitCode = code;
    },
  };

  try {
    const captured = await captureProgram(argsWithoutJson, env);

    return {
      exitCode,
      stdout: captured.logLines.map(stringify).join(''),
      stderr: captured.errorLines.map(stringify).join(''),
    };
  } catch (error) {
    // An unexpected defect that escaped the command surfaces as a stable payload.
    return failureResult(normalizeError(error), json);
  }
};

export { runCli };
