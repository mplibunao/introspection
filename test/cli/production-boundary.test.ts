import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices';
import { assert, describe, it } from '@effect/vitest';
import { Console } from 'effect/Console';
import { provide, provideService, runPromise, scoped } from 'effect/Effect';
import { mergeAll, succeed } from 'effect/Layer';

import { createOutputBuffer, makeBufferedConsole } from '../../src/cli/buffered-console.js';
import { CliEnv } from '../../src/cli/env.js';
import { buildProgram, stripGlobalJsonFlag } from '../../src/cli/program.js';

/*
 * Regression guard for the production output path (P1.1). The goldens run through
 * run.ts; this test wires buildProgram exactly like the Bun entrypoint (bin.ts)
 * — Node platform services plus a CliEnv — and captures the real outer console.
 * A parse failure renders Effect's help text before failing; if that leaked to
 * the outer console it would appear ahead of the stable error envelope. The
 * boundary must emit ONLY the stable payload, so the captured stdout stays
 * parseable JSON (json mode) or empty (human mode).
 *
 * Named effect imports (rather than the namespace idiom used in src/cli) keep
 * this test within the default lint preset without widening the no-namespace
 * override to the test surface.
 */

const fixedNow = (): Date => new Date('2026-06-12T00:00:00Z');

interface BoundaryResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

const reconstruct = (lines: ReadonlyArray<ReadonlyArray<unknown>>): string =>
  lines.map((args) => args.map((arg) => String(arg)).join('')).join('\n');

const runBoundary = async (
  rawArgs: ReadonlyArray<string>,
  cwd: string,
): Promise<BoundaryResult> => {
  const { args, json } = stripGlobalJsonFlag(rawArgs);
  let exitCode = 0;
  const env = {
    json,
    cwd,
    now: fixedNow,
    setExitCode: (code: number): void => {
      exitCode = code;
    },
  };
  const captured = createOutputBuffer();

  await runPromise(
    buildProgram(args).pipe(
      scoped,
      provideService(Console, makeBufferedConsole(captured)),
      provide(mergeAll(nodeServicesLayer, succeed(CliEnv, env))),
    ),
  );

  return { exitCode, stdout: reconstruct(captured.out), stderr: reconstruct(captured.err) };
};

describe('production-style CLI boundary', () => {
  it('emits only the stable JSON error envelope on a parse failure', async () => {
    const result = await runBoundary(
      ['vocab', 'list', '--status', 'bogus', '--json'],
      process.cwd(),
    );

    assert.strictEqual(result.exitCode, 1);
    assert.strictEqual(result.stderr, '');
    // Leaked help text before the envelope would make this JSON.parse throw.
    const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string } };
    assert.strictEqual(payload.ok, false);
    assert.strictEqual(payload.error.code, 'cli.argument.invalid');
  });

  it('keeps stdout empty and writes only the stable human error to stderr', async () => {
    const result = await runBoundary(['vocab', 'list', '--status', 'bogus'], process.cwd());

    assert.strictEqual(result.exitCode, 1);
    assert.strictEqual(result.stdout, '');
    assert.match(result.stderr, /Error cli\.argument\.invalid/u);
  });
});
