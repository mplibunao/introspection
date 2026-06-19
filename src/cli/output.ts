import * as Console from 'effect/Console';
import * as Effect from 'effect/Effect';

import type { CommandOutcome } from '../commands/types.js';
import { errorHuman } from '../presenters/human.js';
import { errorJson } from '../presenters/json.js';

import { normalizeError } from './app-services.js';
import { CliEnv } from './env.js';

/*
 * Presenter strings already end in a newline, and `Console.log` appends one.
 * Trimming exactly one trailing newline before logging keeps real stdout
 * byte-identical to the pre-cutover `process.stdout.write(outcome.stdout)` while
 * the TestConsole capture in run.ts reconstructs the payload from the logged
 * argument. JSON consumers and the golden harness parse the payload, so the
 * single trailing newline is not load-bearing either way.
 */
const forConsole = (value: string): string => {
  if (value.endsWith('\n')) {
    return value.slice(0, value.length - 1);
  }

  return value;
};

const isFailure = (
  outcome: CommandOutcome,
): outcome is Extract<CommandOutcome, { readonly error: unknown }> => 'error' in outcome;

/*
 * Bridges a command's existing async core to the Effect shell. `work` runs the
 * transitional async orchestration and returns a CommandOutcome; a thrown
 * IntrospectionError is normalized to the same stable error payload the old
 * dispatcher produced. Output is written through `Console` so tests capture it
 * via TestConsole and production writes it through Bun's console. The handler
 * never fails the Effect: a logical failure prints its payload and records the
 * exit code, mirroring the old renderFailure split (JSON → stdout, human →
 * stderr).
 */
type FailureOutcome = Extract<CommandOutcome, { readonly error: unknown }>;
type SuccessOutcome = Exclude<CommandOutcome, { readonly error: unknown }>;

type CliEnvShape = (typeof CliEnv)['Service'];

interface RenderedErrorOutput {
  readonly stdout: string;
  readonly stderr: string;
}

const renderErrorOutput = (
  payload: FailureOutcome['error'],
  json: boolean,
): RenderedErrorOutput => {
  if (json) {
    return { stdout: errorJson(payload), stderr: '' };
  }

  return { stdout: '', stderr: errorHuman(payload) };
};

const emitRenderedOutput = (rendered: RenderedErrorOutput): Effect.Effect<void> =>
  Effect.gen(function* renderedOutput() {
    if (rendered.stdout.length > 0) {
      yield* Console.log(forConsole(rendered.stdout));
    }

    if (rendered.stderr.length > 0) {
      yield* Console.error(forConsole(rendered.stderr));
    }
  });

const emitFailureOutcome = (env: CliEnvShape, outcome: FailureOutcome): Effect.Effect<void> =>
  Effect.gen(function* failureOutcome() {
    yield* emitRenderedOutput(renderErrorOutput(outcome.error, env.json));
    yield* Effect.sync(() => env.setExitCode(outcome.exitCode ?? 1));
  });

const emitSuccessOutcome = (env: CliEnvShape, outcome: SuccessOutcome): Effect.Effect<void> =>
  Effect.gen(function* successOutcome() {
    if (outcome.stdout.length > 0) {
      yield* Console.log(forConsole(outcome.stdout));
    }

    if (outcome.stderr && outcome.stderr.length > 0) {
      yield* Console.error(forConsole(outcome.stderr));
    }

    const exitCode = outcome.exitCode ?? 0;

    if (exitCode !== 0) {
      yield* Effect.sync(() => env.setExitCode(exitCode));
    }
  });

const dispatch = (
  work: (env: CliEnvShape) => Promise<CommandOutcome>,
): Effect.Effect<void, never, CliEnv> =>
  Effect.gen(function* dispatchProgram() {
    const env = yield* CliEnv;
    const outcome = yield* Effect.promise(async (): Promise<CommandOutcome> => {
      try {
        return await work(env);
      } catch (error) {
        return { error: normalizeError(error), exitCode: 1 };
      }
    });

    if (isFailure(outcome)) {
      yield* emitFailureOutcome(env, outcome);

      return;
    }

    yield* emitSuccessOutcome(env, outcome);
  });

export { dispatch, forConsole, renderErrorOutput, emitRenderedOutput };
