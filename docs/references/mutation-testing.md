# Mutation testing

Mutation testing measures whether tests catch behavior changes, not only whether tests execute lines. Stryker creates small code changes called mutants, runs the Vitest suite, and reports whether tests killed or missed each mutant.

## Scope

The mutation gate targets the record kernel only:

- store and atomic write mechanics under `src/store/`
- ID allocation and duplicate repair
- lifecycle and validation logic under `src/core/`
- tech-debt record validation, derived tags, prime summaries, and exports
- vocabulary grammar, validation, and cascade services
- deterministic prime selection
- JSON and GNO exporters

CLI parsing, importers, package launchers, presenters, retrieval adapters, and build scripts are outside this pass. Those surfaces have their own functional or packaging checks.

## Command contract

| Gate | Command |
|---|---|
| Baseline and final gate | `rtk corepack pnpm check` |
| Worker iteration gate | `rtk corepack pnpm test` |
| Single-file mutation run | `STRYKER_MUTATE=<repo-relative path> rtk corepack pnpm test:mutation` |
| Default behavioral gate | `rtk corepack pnpm test:mutation` |
| Full evidence sweep | `STRYKER_SWEEP=1 rtk corepack pnpm test:mutation` |

`STRYKER_MUTATE` is the single-file worker loop. `STRYKER_SWEEP=1` includes static or equivalent kernel files for a dated evidence report. The default command excludes documented static or equivalent files and is the practical local quality gate.

Mutation testing is manual and local. Do not add it to CI or `pnpm check`.

## Allowed edit surface

During worker-style triage, prefer strengthening tests. Allowed final diffs are:

- `test/**/*.test.ts`
- `test/fixtures/**/*.ts`
- docs under `docs/reports/mutation/` for run evidence
- this reference file when the command contract or target policy changes
- `stryker.config.mjs` only during setup or policy changes, never during a worker pass

Production source changes are allowed only when a survivor exposes a real kernel bug. In that case, fix the bug as normal product work, add the killing test, and call out the bug in the dated sweep report.

## Survivor classification

Classify every surviving mutant before acting:

| Category | Action | Example |
|---|---|---|
| Killable | Add or improve a behavior-focused test. | A boundary check changes from `>` to `>=` and no test covers the exact boundary. |
| Equivalent | Document the rationale in the sweep report. | A mutation changes internal sorting before a later stable sort produces the same public order. |
| Trivial | Document the rationale in the sweep report. | Killing it would require pinning an error sentence when the stable contract is the error code. |

Avoid score chasing. A stronger assertion should protect a meaningful contract such as a returned finding code, derived tag, file safety invariant, exported path, or bounded prime output.

## Default target policy

`stryker.config.mjs` is the source of truth for exact targets. The default behavioral gate lists only worker-vetted files with a dated survivor rationale under `docs/reports/mutation/`. Add a file to the default gate only after a focused `STRYKER_MUTATE=<file>` run is triaged.

`STRYKER_SWEEP=1` keeps the broader kernel glob for investigation. The sweep may include files that are not part of the default quality gate yet; promote those files only after the report is updated.

Always-excluded files include type-only contracts, command shells, importers, presenters, retrieval adapters, and package/build surfaces. The kernel mutation pass should not drift into unrelated packaging or adoption behavior.

## Reports

Run-specific reports belong under `docs/reports/mutation/` with `YYYY-MM-DD-<scope>.md` names. Each report should include:

- commands run and environment variables used
- initial and final mutation scores
- tests added or changed
- survivor table with killable, equivalent, or trivial classification
- final project checks

Stryker HTML and JSON artifacts write to `reports/mutation/` and stay untracked.
