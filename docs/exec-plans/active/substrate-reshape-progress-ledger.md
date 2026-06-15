# introspection substrate reshape: exec-plan progress ledger

Progress ledger for the orchestrate-loop execution of plan [`introspection-substrate-reshape-2026-06-14.md`](./introspection-substrate-reshape-2026-06-14.md) (work items IX-SR-00 through IX-SR-21). Each tracked unit gets one entry recording whether each workflow gate (verify, review loop, refactor loop, commit) actually ran. The status table below indexes every work item; per-item detail sections are appended as items land.

This ledger supersedes the stopped plain-TypeScript ledger ([`reshape-progress-ledger.md`](./reshape-progress-ledger.md)), which IX-SR-00 moves to `completed/`.

## Branches (stacked for review)

- introspection: `reshape/introspection-substrate-effect` (branched off `reshape/introspection-v1`, which holds the committed plan and the plain-TypeScript code IX-SR-01 characterizes before the cutover).
- backpressure: stacked branch created when IX-SR-15 / IX-SR-17 land.
- taste-distillery: stacked branch created when IX-SR-18 through IX-SR-20 land.

## How this run is verified

The orchestrator owns the gates and does not trust agent self-reports:

- **Per-item review loop:** `context_builder` review pass over the item diff, fix iterations delegated back to the implementer, re-review on the same chat until only nits remain.
- **Per-item refactor loop:** explore scouts scope the surface; a `context_builder` chat then builds the refactor plan for an engineer to execute, with follow-up re-analysis until no opportunity remains.
- **Independent checks before each commit:** the orchestrator runs `pnpm check` (typecheck, vitest, build, `introspection check`, prose) rather than relying on the agent's targeted runs.
- **Behavioral safety net:** IX-SR-01 lands golden characterization fixtures first, so every later cutover item is measured against captured current behavior.

## Open design spikes (resolve before the dependent item)

These are the plan's six open design questions. Each is resolved by a design pass and recorded here before its dependent work item is dispatched.

| Spike | Resolve before | Status | Resolution ref |
| --- | --- | --- | --- |
| 1. `AppLayer` composition and service dependency DAG | IX-SR-03 | PENDING | |
| 2. Where command type-resolution-from-config lands | IX-SR-15 (confirm IX-SR-10 routing) | PENDING | |
| 3. First-party extension-hook contract | IX-SR-19 | PENDING | |
| 4. Field-spec to Effect Schema compiler | IX-SR-06 | PENDING | |
| 5. Per-type layout reverse-mechanics | IX-SR-08 | PENDING | |
| 6. Declared-pattern and manual identity allocation | IX-SR-07 (within) | PENDING | |

## Status

Commit SHAs are in the introspection repo unless a prefix marks another repo (`bp` is backpressure, `td` is taste-distillery). Sizes are from the plan.

| ID | Item | Size | Status | Commits |
| --- | --- | --- | --- | --- |
| IX-SR-00 | Land revised plan and dispose superseded active plans | S | DONE | `bb1aa9e` |
| IX-SR-01 | Characterization fixtures and Effect guardrail targets | M | PENDING | |
| IX-SR-02 | Cut the CLI runtime to Effect 4 command architecture | L | PENDING | |
| IX-SR-03 | Introduce the Effect service graph and typed domain errors | XL | PENDING | |
| IX-SR-04 | Config v2 with explicit type declarations (additive) | L | PENDING | |
| IX-SR-05 | Record-type manifest schema and shipped preset catalog | L | PENDING | |
| IX-SR-06 | Build the manifest compiler | XL | PENDING | |
| IX-SR-07 | Identity strategies and allocator cutover | L | PENDING | |
| IX-SR-08 | Per-type layout strategies and corpus classification | XL | PENDING | |
| IX-SR-09 | Rebuild the checker pipeline around compiled types | XL | PENDING | |
| IX-SR-10 | Convert command surfaces to compiled registry services | L | PENDING | |
| IX-SR-11 | Rework import/export for manifest-backed types | L | PENDING | |
| IX-SR-12 | Stable-ID resolver and built-in renderers | L | PENDING | |
| IX-SR-13 | Generic local link, anchor, and ID-ref validation | L | PENDING | |
| IX-SR-14 | Coverage, artifacts, relationships, registry-table constraints | XL (split 4) | PENDING | |
| IX-SR-15 | Lockstep backpressure cutover to explicit tech-debt preset | M | PENDING | |
| IX-SR-16 | Release-quality lane for the Effect substrate | M | PENDING | |
| IX-SR-17 | Publish npm packages and switch backpressure to published pin | M | PENDING (manual blocker) | |
| IX-SR-18 | Migrate taste tech-debt records in coexistence mode | L | PENDING | |
| IX-SR-19 | Model taste card, baseline, specimen as manifests plus extensions | XL (split 3) | PENDING | |
| IX-SR-20 | Cut taste steady-state validation to introspection | XL | PENDING | |
| IX-SR-21 | Final adoption docs and substrate operating manual | M | PENDING | |

## Per-item detail

Entries are appended here as each item passes its gates and commits.

### IX-SR-00: Land revised plan and dispose superseded active plans (DONE)

- **Work:** `engineer` agent (sonnet:high). It moved the stopped plain-TypeScript reshape spec and its progress ledger into `completed/` with `git mv`, preserving history. The absorbed bootstrap plan moved there too. Each moved file received a superseded or absorbed banner that points to the active plan with corrected relative paths. The bootstrap WI-19 npm thread was folded into IX-SR-17 as two done-when items. First, a TD-CARD-037 branch-protection re-verification gates the trusted publish path. Second, a mise `npm:` backend spike confirms the published binary is mise-consumable, with a `ubi:` GitHub-release fallback. Both plan indexes were refreshed.
- **Review gate:** a code-oriented review does not apply, because this item changed only documentation. The review ran instead as the prose gate plus orchestrator verification. I read each banner and confirmed its relative paths resolve. The IX-SR-17 fold is accurate and well-formed. The acceptance criterion holds: only the active plan remains in `active/`, and no remaining plan presents a permanent implicit `tech-debt` default. The active plan's transitional default is framed correctly.
- **Refactor gate:** not applicable, because no code changed.
- **Checks:** `introspection check` green over 16 records. `pnpm prose` reported 0 errors and 0 warnings over 48 files.
- **Out-of-scope edits (orchestrator-reviewed, accepted):** the agent swapped the `scripts/prose-files.sh` exclusion path from `active/` to `completed/` so the bootstrap plan's existing prose exclusion follows the move. It also restructured one VerbTricolon in this ledger with meaning preserved. Both are verified correct.
- **Commits:** `bb1aa9e` for the disposition, plus this ledger-record commit.
- **Issues:** none open.
- **Action items for MP:** none.
