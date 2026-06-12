# WI-20 record-kernel mutation sweep

Date: 2026-06-12

## Scope

This sweep covered the record kernel before WI-15: store and ID allocation, lifecycle and validation, tech-debt record behavior, vocabulary, prime selection, duplicate repair, file-system safety, and JSON/GNO export behavior.

## Gate policy

The default Stryker gate is intentionally bounded to the source files in the results table below. Each configured default target has worker evidence and a survivor disposition in this report. `STRYKER_SWEEP=1` remains available for a broader investigation sweep, but broad-sweep findings are not treated as completed WI-20 evidence until a file is promoted into the default target list and triaged here.

## Commands run

Baseline:

```bash
rtk corepack pnpm check
```

Setup smoke and worker commands:

```bash
STRYKER_MUTATE=src/core/tags.ts rtk corepack pnpm test:mutation
STRYKER_MUTATE=src/core/id.ts rtk corepack pnpm test:mutation
STRYKER_MUTATE=src/core/lifecycle.ts rtk corepack pnpm test:mutation
STRYKER_MUTATE=src/core/prime-selector.ts rtk corepack pnpm test:mutation
STRYKER_MUTATE=src/core/record-type.ts rtk corepack pnpm test:mutation
STRYKER_MUTATE=src/record-types/tech-debt.ts rtk corepack pnpm test:mutation
STRYKER_MUTATE=src/core/validation.ts rtk corepack pnpm test:mutation
STRYKER_MUTATE=src/store/id-allocator.ts rtk corepack pnpm test:mutation
STRYKER_MUTATE=src/store/markdown-record-store.ts rtk corepack pnpm test:mutation
STRYKER_MUTATE=src/core/vocabulary.ts rtk corepack pnpm test:mutation
STRYKER_MUTATE=src/core/vocabulary-validation.ts rtk corepack pnpm test:mutation
STRYKER_MUTATE=src/store/duplicate-repair-service.ts rtk corepack pnpm test:mutation
STRYKER_MUTATE=src/store/file-system.ts rtk corepack pnpm test:mutation
STRYKER_MUTATE=src/export/export-document.ts rtk corepack pnpm test:mutation
STRYKER_MUTATE=src/export/export-service.ts rtk corepack pnpm test:mutation
STRYKER_MUTATE=src/export/gno-exporter.ts rtk corepack pnpm test:mutation
STRYKER_MUTATE=src/export/json-exporter.ts rtk corepack pnpm test:mutation
```

`src/core/id.ts`, `src/core/record-type.ts`, and `src/export/export-document.ts` were rerun after adding direct helper, lifecycle-transition, and export-manifest tests. The final rows below record those reruns.

A broad default run was started before the P1 evidence review. It found 21 source files and 2,577 mutants, then was stopped because it was too slow for bounded interactive triage. The default config was narrowed after that review so the local behavioral gate now matches only worker-vetted files.

## Results

| Target | Final score | Killed | Survived | No coverage | Timeout | Disposition |
|---|---:|---:|---:|---:|---:|---|
| `src/core/tags.ts` | 100.00% | 21 | 0 | 0 | 0 | Passed after adding grammar boundary tests. |
| `src/core/id.ts` | 91.51% | 97 | 9 | 0 | 0 | Passed after adding ID parse/render, scan filtering, and duplicate-finding detail tests; accepted remaining equivalent validation helpers. |
| `src/core/lifecycle.ts` | 100.00% | 15 | 0 | 0 | 0 | Passed after adding terminal-status helper tests. |
| `src/core/prime-selector.ts` | 91.98% | 195 | 16 | 1 | 0 | Accepted remaining path/message/detail survivors. |
| `src/core/record-type.ts` | 71.76% | 155 | 47 | 14 | 0 | Accepted remaining lifecycle finding-detail and helper-shape survivors after direct transition evidence tests. |
| `src/record-types/tech-debt.ts` | 97.33% | 73 | 2 | 0 | 0 | Accepted remaining parser-shape survivors as low-value to pin. |
| `src/core/validation.ts` | 74.66% | 218 | 62 | 12 | 0 | Accepted remaining report-detail survivors; critical invariants strengthened. |
| `src/store/id-allocator.ts` | 67.57% | 25 | 10 | 2 | 0 | Accepted lock-option/timeout detail survivors; identity mismatch strengthened. |
| `src/store/markdown-record-store.ts` | 54.40% | 68 | 42 | 15 | 0 | Accepted error-wrapping/path-message survivors; existing tests cover write safety. |
| `src/core/vocabulary.ts` | 75.92% | 186 | 31 | 28 | 0 | Accepted metadata/message/lock-path survivors; service behavior remains covered. |
| `src/core/vocabulary-validation.ts` | 68.80% | 86 | 35 | 4 | 0 | Accepted finding metadata/detail survivors; validation behavior remains covered. |
| `src/store/duplicate-repair-service.ts` | 71.88% | 115 | 30 | 9 | 6 | Accepted branch/error-detail survivors; timeout mutants were killed by hang detection. |
| `src/store/file-system.ts` | 61.29% | 95 | 38 | 22 | 0 | Accepted native error and wrapper-detail survivors; path-safety behavior remains covered. |
| `src/export/export-document.ts` | 84.21% | 16 | 3 | 0 | 0 | Passed after adding direct ordering and manifest tests; accepted remaining helper-shape survivors. |
| `src/export/export-service.ts` | 75.52% | 108 | 31 | 3 | 1 | Accepted destination-message survivors; timeout mutant was killed by hang detection. |
| `src/export/gno-exporter.ts` | 58.70% | 54 | 30 | 8 | 0 | Accepted path-detail and projection-hash metadata survivors after adding tag/hash coverage. |
| `src/export/json-exporter.ts` | 90.91% | 10 | 1 | 0 | 0 | Accepted one hash-helper survivor as trivial implementation-shape coupling. |

## Tests added or strengthened

- Added `test/core/tags.test.ts` for GNO-compatible tag grammar boundaries, partial-match rejection, and machine-owned tag helpers.
- Strengthened `test/core/lifecycle.test.ts` for terminal status ordering and unknown-status behavior.
- Strengthened `test/core/record-type-contract.test.ts` for lifecycle transition matching, unsupported transition evidence, active-resolution allowances, registry creation, and first body-line summaries.
- Strengthened `test/core/prime-selector.test.ts` for invalid timestamp ordering, limit validation, filter normalization, path normalization, tag conjunction, repo scoping, unknown record types, and final ID/path tie breakers.
- Strengthened `test/record-types/tech-debt.test.ts` for indented fences, closing fences, headings after fences, whitespace-trimmed headings, and heading finding metadata.
- Strengthened `test/core/validation.test.ts` for clean `ok` reports, unsupported record type findings, repo-key mismatch findings, invalid ID shape findings, and ID-number mismatch findings.
- Strengthened `test/store/id-allocator.test.ts` so record factories cannot change the assigned ID or number, ID parse/render rejects invalid numbers, next-number scans ignore other repos/types, and duplicate findings preserve stable location metadata.
- Added `test/export/export-document.test.ts` for stable export ordering and deterministic export manifest provenance.
- Strengthened `test/export/gno-exporter.test.ts` for projected tags and deterministic projection hash metadata.
- Added `test/export/json-exporter.test.ts` for stable JSON content plus returned path and content hash.

## Survivor acceptance rationale

Remaining survivors are accepted for this WI-20 pass under these classifications:

| Group | Affected targets | Classification | Rationale |
|---|---|---|---|
| Error text, remediation wording, and finding path metadata | `record-type.ts`, `validation.ts`, `vocabulary-validation.ts`, `markdown-record-store.ts`, `vocabulary.ts`, `export-service.ts`, `gno-exporter.ts` | Trivial | Tests already assert stable finding codes and key remediation fragments. Pinning every sentence or internal path array would make tests brittle without improving kernel correctness. |
| Cache and lock option plumbing | `validation.ts`, `id-allocator.ts`, `vocabulary.ts` | Equivalent/trivial | Mutants mostly remove cache reuse or timeout option objects. Observable behavior still passes because the tests exercise successful lock acquisition and stale-lock safety. The stable contract is safe allocation, not exact option object shape. |
| ID helper implementation shape | `id.ts` | Equivalent/trivial | Direct tests now pin ID padding, parse rejection for short/zero/unsafe numbers, cross-repo/type scan filtering, invalid frontmatter-number filtering, and duplicate finding metadata. Remaining survivors are regex flag or private-filter forms that do not change the exported ID allocation and duplicate-detection contract. |
| Lifecycle transition finding details | `record-type.ts` | Trivial after hardening | Direct tests now pin registry creation, transition source/target matching, unsupported transition evidence, active-resolution allowances, disposition mismatches, and first-line summaries. Remaining survivors are finding message/path/remediation details or equivalent first-registration branches. |
| Broad filesystem error wrapping | `markdown-record-store.ts`, `file-system.ts`, `export-service.ts`, `gno-exporter.ts` | Trivial | Store/export tests cover no-clobber writes, stale updates, path containment, symlink safety, and recreate behavior. Surviving mutants primarily alter error message construction or rare native error branches. |
| Duplicate repair branch and error-detail mutants | `duplicate-repair-service.ts` | Trivial/accepted | The repair workflow is covered for duplicate detection, conflict routing, and safe rewrite behavior. Remaining survivors are mostly alternative branch details, message text, and timeout-style mutants where Stryker hang detection already proves the mutant is not acceptable runtime behavior. |
| Vocabulary validation detail mutants | `vocabulary-validation.ts` | Trivial | The validation contract is the emitted finding code, target record, and pass/fail outcome. Remaining survivors mostly alter finding metadata or collision detail formatting, which would make tests brittle without strengthening the governed-record contract. |
| Export document ordering and manifest helpers | `export-document.ts` | Trivial after hardening | Direct tests now pin deterministic ordering, source path preservation, second-level manifest timestamps, and records-root provenance. The three remaining survivors are helper-shape details that do not change the public exported document or manifest contract. |
| Path matching over-permissiveness retained by v1 | `prime-selector.ts` | Accepted design survivor | `prime --path` intentionally supports exact, directory-prefix, and substring matching in v1. Several mutants collapse one branch while another branch still matches the existing examples. Tightening semantics is explicitly left as optional future hardening in WI-10. |
| GNO projection path details | `gno-exporter.ts` | Trivial after hardening | Added assertions now cover tag preservation and deterministic projection hash. Remaining survivors mainly alter internal error details, write options, or redundant path containment checks already covered through unsafe-component tests. |
| Stable JSON hash helper shape | `json-exporter.ts` | Trivial | The direct JSON exporter test now asserts returned path and SHA-256 hash. The remaining helper-shape survivor would require testing the private helper rather than the public write result. |

## Final verification

- `rtk corepack pnpm check` passed after all mutation-test changes.
- The Vitest full suite in that check reported 25 test files and 169 tests.
- The source-pollution check in `pnpm check` found no `@ts-nocheck` directives under `src/`.

## Future auditability improvements

For the next mutation sweep, include representative Stryker mutant IDs or examples for each accepted survivor group when the Stryker output includes them. Also consider adding a lightweight audit that compares `DEFAULT_BEHAVIORAL_TARGETS` in `stryker.config.mjs` with target rows in the active dated mutation report, so config/report drift is caught before review.

## Notes for WI-15

Mutation testing remains a manual/local quality gate. It is intentionally not part of `pnpm check` or CI. The Stryker artifacts are ignored under `reports/mutation/`; curated reports live under `docs/reports/mutation/`.
