import * as Console from 'effect/Console';
import * as Effect from 'effect/Effect';

/*
 * In-memory Console used to run Effect's CLI parser without leaking its output.
 *
 * Effect's `Command.runWith` renders help/usage text to the Console *before* it
 * fails on a parse error or a ShowHelp request (it is not suppressible). If that
 * Console were the real stdout, a parse failure would print help text ahead of
 * the stable error envelope and corrupt `--json` consumers. So the boundary runs
 * the parser against this buffer, then either replays it (parse succeeded) or
 * discards it (parse failed) and emits only the stable payload. Both the Bun
 * entrypoint and the programmatic/test adapter share this one mechanism, so the
 * production and test paths can no longer diverge.
 */

interface OutputBuffer {
  readonly out: Array<ReadonlyArray<unknown>>;
  readonly err: Array<ReadonlyArray<unknown>>;
}

const createOutputBuffer = (): OutputBuffer => ({ out: [], err: [] });

const ignore = (): void => {
  /* Only log/error are captured; every other Console method is a no-op here. */
};

const makeBufferedConsole = (buffer: OutputBuffer): Console.Console => ({
  assert: ignore,
  clear: ignore,
  count: ignore,
  countReset: ignore,
  debug: ignore,
  dir: ignore,
  dirxml: ignore,
  error: (...args: ReadonlyArray<unknown>): void => {
    buffer.err.push(args);
  },
  group: ignore,
  groupCollapsed: ignore,
  groupEnd: ignore,
  info: ignore,
  log: (...args: ReadonlyArray<unknown>): void => {
    buffer.out.push(args);
  },
  table: ignore,
  time: ignore,
  timeEnd: ignore,
  timeLog: ignore,
  trace: ignore,
  warn: ignore,
});

/*
 * Replay captured output onto the surrounding (real or test) Console with the
 * exact arguments each call received, so replayed success output stays
 * byte-identical to a direct Console.log/error from the handler.
 */
const replayBuffer = (buffer: OutputBuffer): Effect.Effect<void> =>
  Effect.gen(function* replay() {
    for (const args of buffer.out) {
      yield* Console.log(...args);
    }

    for (const args of buffer.err) {
      yield* Console.error(...args);
    }
  });

export { createOutputBuffer, makeBufferedConsole, replayBuffer };
export type { OutputBuffer };
