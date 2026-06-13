# introspection v1 reshape—orchestration progress ledger

Running log of the orchestrate-loop execution (plan: `introspection-v1-reshape-2026-06-13.md`). One entry per work item: gates run + iteration counts, commits, issues, action items. This is the auditable record of whether each workflow gate actually ran.

Branches (stacked for review):
- introspection: `reshape/introspection-v1` (on `bootstrap/introspection-v1`)
- taste-distillery: stacked branch created when its items land
- backpressure: stacked on `adopt/introspection-v1` when its items land

## Autonomy boundaries (MP away from 2026-06-13 dinner; "don't wait for me")

- **Hard stop, needs MP:** WI-R05 npm Trusted Publishing is a browser step only MP can do. I prep everything around it (mise `npm:` backend spike, release workflow, gates) and park R05 + its dependents (R07, R09) until MP runs the publish.
- **Will NOT do unilaterally:** `export.ts` → shared `assertKnownFlags` migration (task #13)—it is a behavior change (adds `--root`, rejects unknown flags), not a refactor. Left for MP to decide at/after R02.
- **Ambiguity policy:** where thin source data needs judgment (for example R04 taste-distillery manifest from sparse tracker entries), I fill reasonable values and flag the assumptions in this ledger for MP review, rather than blocking.
- **Order:** R03 → R02 → R08 → R10 (introspection), then R11 (TD canon, independent), R04 → R06 (TD migration), then the publish-gated set.

## WI-R01—Split prime into orientation + records list—DONE

- **Review gate:** 1 analysis + 1 fix iteration. Findings: (P1) `CLAUDE.md` "Start here" pointed at `prime --type tech-debt`, which the split breaks; (P2) the shared boolean-flag gate false-greened on `--all true` (parser used `'true'` as the valueless marker). Both fixed (sentinel marker; this forced `export.ts` to adopt the shared flag-value helpers) and re-verified.
- **Refactor gate:** analysis → `context_builder` plan + export → dispatch engineer against the export path → verify → follow-up review. 1 iteration; follow-up review clean (no P1/P2/P3). Applied 4 dedups: `lifecycleStatusKindFor` → `core/lifecycle.ts`, `isoTimestamp` → `core/time.ts`, `repoJson` presenter envelope, shared `test/fixtures/cli-repo-fixture.ts`. The verify step caught a third inlined `isoTimestamp` copy in `export-document.ts` and removed it.
- **Commits:** `5c80d48` feat (split) · `13dc836` docs (WI-R12 mutation-test item, MP request) · `74a0b2f` refactor (dedup).
- **Checks:** `pnpm check` green—183 tests + build + `introspection check` + prose + durable-refs.
- **Issues:** none open.
- **Action items for MP:** task #13—decide whether `export.ts` adopts the shared flag gate (behavior change) at R02.

## WI-R03—Replace backpressure importer with generic `introspection import`—DONE

- **Implementation:** fresh `pair` agent against the plan's WI-R03 section. Removed `src/importers/backpressure-tech-debt.ts` plus its test and fixture; added `introspection import --manifest <path> [--dry-run] [--print-schema]` driven by a schema-validated, agent-authored manifest, a corpus-aware preflight (validates every candidate through the shared checker before any write), and realpath-safe store helpers. Preflight entry-point decision (the agent's, documented in a code comment): run the public `checkRecordResults` over candidates plus the on-disk corpus rather than a temp-dir `checkRecords`—least private-API surface, and corpus-aware ID-collision detection for free.
- **Review gate:** 1 analysis plus 4 follow-up iterations on chat `import-review-6779B4`; converged clean (round 5 returned no findings). Fixed in order: (1) unreadable existing records were invisible to ID-collision and `allocate` numbering, so a new `corpus-index.ts` infers occupied IDs/numbers from canonical paths; (2) `pathExists` swallowed every `access` error, now classifies ENOENT versus `import.path.probe_failed`; (3) no partial import on a mid-loop write failure, now tracks and best-effort rolls back; (4) added the same-manifest duplicate-ID test; (5) the preflight path probe could escape the records root via a manifest status, now routed through root-safe `store.pathExists`; (6) rollback could delete a foreign file on a no-clobber race, now ownership is split (the store cleans its own readback-failure orphan; import rolls back only the files it created); (7) destructive `deleteRecord`/`pathExists` were only lexically root-safe, now use a realpath/symlink-safe parent assertion matching the write path.
- **Refactor gate:** 2 explore scouts → `context_builder` review analysis (chat `wi-r03-refactor-review-67E905`) → `context_builder` plan plus export → dispatched an `engineer` against the export path → verify → 1 follow-up analysis (clean; surfaced one P2) → applied the P2. Consolidated record construction shared by `import` and `record create`: `createRecordIdentity` (`core/id.ts`), the narrow `buildRecordCandidate` (`core/record-candidate.ts`), `record create` machine tags now via `expectedMachineTags`, transition path now via `canonicalRecordRelativePath`. The plan's stop conditions (the builder must not take CLI-shaped or manifest-shaped inputs) held and never triggered. Out-of-scope items (corpus-index allocation, presenters) were correctly left alone.
- **Commits:** `cce9a2a` feat (generic import) · `389f00a` refactor (share record construction).
- **Checks:** independent `pnpm check` run by the orchestrator—green (exit 0): build plus platform binaries, `introspection check` (14 records), prose (41 files, 0 errors), full vitest suite (205 tests).
- **Issues:** none open.
- **Action items for MP:**
  - `prompt-exports/` is NOT gitignored. Oracle plan/review exports land there untracked and a careless `git add -A` could commit them. Recommend adding `prompt-exports/` to `.gitignore`. (R03 commits staged explicit paths so nothing leaked; the consumed R03 export was deleted.)
  - `src/commands/record.ts` now suppresses oxlint `import/max-dependencies` (16 deps) with a rationale comment, because adopting the shared `core/id.ts` helper added one import. Acceptable tradeoff (shared helper over import-count), but record.ts owns create plus transition plus their helpers and may warrant a future split—your call, not done unilaterally.

## WI-R02—Rename config `[prime]` → `[records.list]` (hard cutover)—DONE

- **Implementation:** `engineer` against the plan's WI-R02 section. introspection (10 files): the schema drops top-level `prime` and adds `records.list` under `records` (top-level `additionalProperties:false` makes a stray `[prime]` fail—that is the hard cutover); `ConfigPrimeDefaults` → `ConfigRecordListDefaults` (plus the `src/config/index.ts` re-export); the `records.ts` consumer repointed to `config.records.list`; `record-list-selector.ts` `prime.limit.*` error codes renamed to `records.list.limit.*` in lockstep; introspection's own `.introspection/config.toml` flipped (10/50). backpressure (1 file): `.introspection/config.toml` flipped (5/20).
- **Review gate:** 1 analysis (chat `wi-r02-review-C7A508`); clean, no findings. Confirmed the hard cutover is complete (no `[prime]` acceptance path), the runtime `hard_limit >= default_limit` enforcement is preserved, the error-code and type renames are fully consistent (no `prime.limit.*` / `ConfigPrimeDefaults` / `config.prime` stragglers), and tests cover valid `[records.list]`, `[prime]` rejection, invalid limit ordering, and command consumption.
- **Refactor gate:** explore scouts skipped (pure 1:1 rename, no new logic). 1 analysis (chat `wi-r02-review-9A4E15`); no findings. The snake_case-to-camelCase limit mapper boundary is correct to keep.
- **Cross-repo verify:** introspection `pnpm check` green (207 tests, rebuilds dist), then backpressure `pnpm check` green (713 tests) against the rebuilt schema via the `file:../introspection` link.
- **Commits:** introspection `69746a7` (on `reshape/introspection-v1`) · backpressure `de2f523` (on its own `reshape/introspection-v1`, stacked on `adopt/introspection-v1`).
- **Issues:** none open.
- **Action items for MP:**
  - Task #13 (`export.ts` adopting the shared `assertKnownFlags` gate) was parked to decide at R02. R02 is done and I did NOT action it: it would add `--root` and unknown-flag rejection to `export`, a behavior change rather than a rename. Still your call—say the word and I fold it in.

## WI-R12—Mutation-test reshaped surfaces (added 2026-06-13, MP request)—pending, runs late
