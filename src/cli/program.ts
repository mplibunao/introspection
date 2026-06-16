import * as Cause from 'effect/Cause';
import * as Console from 'effect/Console';
import * as Effect from 'effect/Effect';
import { Command } from 'effect/unstable/cli';

import type { CliErrorPayload, CommandOutcome } from '../commands/types.js';
import { packageVersion } from '../version.js';

import { cliUsageError, normalizeError } from './app-services.js';
import { cli, helpText, resolveCommand } from './app.js';
import { createOutputBuffer, makeBufferedConsole, replayBuffer } from './buffered-console.js';
import { CliEnv } from './env.js';
import { mapCliError, preScan } from './flag-guard.js';
import { dispatch, emitRenderedOutput, renderErrorOutput } from './output.js';

const jsonFlag = '--json';

type CliEnvShape = (typeof CliEnv)['Service'];

/*
 * `--json` is a global output-mode flag consumed by the boundary, not an Effect
 * flag: it can appear anywhere and is stripped before Effect parses. The
 * remaining argv is what both the strict pre-scan and `Command.runWith` see.
 */
const stripGlobalJsonFlag = (
  args: ReadonlyArray<string>,
): { readonly args: ReadonlyArray<string>; readonly json: boolean } => {
  const nextArgs: Array<string> = [];
  let json = false;

  for (const arg of args) {
    if (arg === jsonFlag) {
      json = true;
    } else {
      nextArgs.push(arg);
    }
  }

  return { args: nextArgs, json };
};

const emitFailure = (payload: CliErrorPayload, json: boolean): Effect.Effect<void> =>
  emitRenderedOutput(renderErrorOutput(payload, json));

const preScanFailure = (argsWithoutJson: ReadonlyArray<string>): CliErrorPayload | undefined => {
  const { spec, rest, unknownChildUsage } = resolveCommand(argsWithoutJson);

  if (unknownChildUsage) {
    return normalizeError(cliUsageError(unknownChildUsage, 'Unknown subcommand.'));
  }

  if (!spec) {
    return;
  }

  try {
    preScan(spec, rest);

    return;
  } catch (error) {
    return normalizeError(error);
  }
};

/*
 * Top-level `--help`/`-h` and `--version` are answered by the boundary with the
 * same custom help/version text the no-argument path emits. This keeps every
 * help path byte-identical and bypasses Effect's built-in renderer, whose format
 * differs and whose output is written to the console before it fails.
 */
const helpFlags = new Set(['--help', '-h']);

const emitHelp = dispatch(async (): Promise<CommandOutcome> => ({ stdout: `${helpText}\n` }));
const emitVersion = dispatch(
  async (): Promise<CommandOutcome> => ({ stdout: `${packageVersion}\n` }),
);

const topLevelShortcut = (
  argsWithoutJson: ReadonlyArray<string>,
): Effect.Effect<void, never, CliEnv> | undefined => {
  if (helpFlags.has(argsWithoutJson[0] ?? '')) {
    return emitHelp;
  }

  if (argsWithoutJson[0] === '--version') {
    return emitVersion;
  }

  return;
};

/*
 * RunWith renders help to the buffered console for ShowHelp/parse errors, so the
 * captured buffer is discarded here and only the mapped, stable payload reaches
 * the real console (JSON to stdout, human to stderr).
 */
const handleCliFailure = (env: CliEnvShape, cause: Cause.Cause<unknown>): Effect.Effect<void> =>
  Effect.gen(function* handleFailure() {
    const squashed = Cause.squash(cause);
    const payload = mapCliError(squashed) ?? normalizeError(squashed);
    yield* emitFailure(payload, env.json);
    yield* Effect.sync(() => env.setExitCode(1));
  });

const emitGuardFailure = (env: CliEnvShape, payload: CliErrorPayload): Effect.Effect<void> =>
  Effect.gen(function* guardFailureProgram() {
    yield* emitFailure(payload, env.json);
    yield* Effect.sync(() => env.setExitCode(1));
  });

/*
 * Parse and dispatch behind the buffered console: replay the buffer when parsing
 * succeeded (the handler's real output), discard it when it failed and emit the
 * stable payload instead. This single path is shared by the Bun entrypoint and
 * the programmatic/test adapter, so production and tests cannot diverge.
 */
const runParsed = (
  env: CliEnvShape,
  argsWithoutJson: ReadonlyArray<string>,
): Effect.Effect<void, never, CliEnv | Command.Environment> =>
  Effect.gen(function* parsedProgram() {
    const buffer = createOutputBuffer();
    const exit = yield* Effect.exit(
      Command.runWith(cli, { version: packageVersion })(argsWithoutJson).pipe(
        Effect.provideService(Console.Console, makeBufferedConsole(buffer)),
      ),
    );

    if (exit._tag === 'Failure') {
      yield* handleCliFailure(env, exit.cause);

      return;
    }

    yield* replayBuffer(buffer);
  });

const runResolved = (
  env: CliEnvShape,
  argsWithoutJson: ReadonlyArray<string>,
): Effect.Effect<void, never, CliEnv | Command.Environment> =>
  Effect.gen(function* resolvedProgram() {
    const guardFailure = preScanFailure(argsWithoutJson);

    if (guardFailure) {
      yield* emitGuardFailure(env, guardFailure);

      return;
    }

    yield* runParsed(env, argsWithoutJson);
  });

/*
 * The shared CLI program. The handler never fails the Effect: a logical, parse,
 * or guard failure prints its stable payload (JSON to stdout, human to stderr)
 * and records the exit code through CliEnv, so the test capture (run.ts) and the
 * Bun runtime (bin.ts) observe identical output and a deterministic exit code.
 */
const buildProgram = (
  argsWithoutJson: ReadonlyArray<string>,
): Effect.Effect<void, never, CliEnv | Command.Environment> =>
  Effect.gen(function* program() {
    const env = yield* CliEnv;
    const shortcut = topLevelShortcut(argsWithoutJson);

    if (shortcut) {
      yield* shortcut;

      return;
    }

    yield* runResolved(env, argsWithoutJson);
  });

export { buildProgram, stripGlobalJsonFlag };
