import * as Context from 'effect/Context';

/*
 * Per-invocation CLI environment, provided as an Effect service by the runtime
 * boundary (the test/programmatic adapter in run.ts and the Bun entrypoint in
 * bin.ts). It carries the cross-cutting inputs the old hand-rolled
 * CliCommandContext used to thread by hand:
 *
 * - `json`   — output mode, decided by the boundary (which strips the global
 *              `--json` flag before Effect parses), not an Effect flag.
 * - `cwd`    — the invocation working directory used for repo discovery.
 * - `now`    — the wall clock, injected so golden fixtures stay deterministic.
 *              IX-SR-02 keeps this a thin transitional seam; IX-SR-03 replaces
 *              it with the Effect `Clock` service across the domain.
 * - `setExitCode` — records a non-zero process result without throwing, so a
 *              logical failure (e.g. `check` finding errors) sets the exit code
 *              while its report still prints to stdout.
 *
 * Parse-time output pollution is handled by the buffered console in program.ts
 * (run the parser against a buffer, discard it on failure), not by recording the
 * error on this env, so no out-of-band error hook is needed here.
 */
interface CliEnvShape {
  readonly json: boolean;
  readonly cwd: string | undefined;
  readonly now: () => Date;
  readonly setExitCode: (code: number) => void;
}

class CliEnv extends Context.Service<CliEnv, CliEnvShape>()('introspection/cli/CliEnv') {}

export { CliEnv };
export type { CliEnvShape };
