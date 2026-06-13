# introspection v1 reshape: prime split, generic importer, adoption playbook, release close-out

## Goal

Correct the v1 record kernel before release: split `prime` into a compact repo-orientation packet plus a new `records list` command, rebuild the backpressure-specific importer into a generic `introspection import` CLI mechanism, exercise it by migrating taste-distillery, distill a reusable post-publish adoption playbook, and port the one remaining bootstrap work item (WI-19, npm publish + backpressure pin) so the bootstrap plan can move to `completed/`. It also closes a Vale gap surfaced mid-flow: introspection and taste-distillery's own canon shipped without the doc-garden ai-tells profile, so the plan fixes introspection's gate (WI-R10) and taste-distillery's gate plus the canon guidance that misrouted both (WI-R11). This plan is the authoritative, self-contained record of the reshape decisions and the ordered work to execute them.

## Background

Curated from four read-only explore probes (2026-06-13). Refs are `file:line` in the named repo.

### Area 1—prime / records list / CLI seam (introspection)

- **Dispatch + presenters.** `src/commands/index.ts:113` `runCli` strips global `--json` (`:41`), routes via the `commandHandlers` map (`:20-27`, keys `check/prime/export/record/ids/vocab`); help is a hardcoded template (`:30-39`). Outcome model `src/commands/types.ts:42-44`; each command computes a domain result then switches on `context.json` to paired presenters in `src/presenters/human.ts` + `json.ts`. Shared plumbing in `src/commands/helpers.ts` (`parseFlags:101`, `loadAppServices:267`, `validationContextFor:275`).
- **prime today.** Handler `src/commands/prime.ts:138`; `primeSelectionFor:103` gathers `store.listRecordResults()`, applies `primeFilters:88` (`--type/--status/--tag/--path` multi + `--include-terminal/--all`), `parseLimit:54`. Core selector `src/core/prime-selector.ts:312` `selectPrimeRecords` → `candidateMatches:155` (scopes to current repo `matchesCurrentRepo:146`) → `toSelectedRecord:231` (calls `RecordType.summarizeForPrime`, `core/record-type.ts:159`, `PrimeSummary:130-138`) → `resolveLimits:290` (builtins 10/50 `:61-62`). Counts in `PrimeSelection:51`.
- **Config block.** `schemas/config.schema.json:46-62` optional `prime{default_limit 1-100, hard_limit 1-500}`; type `ConfigPrimeDefaults` `src/config/repo-context.ts:23-26`; consumed in `prime.ts:69-82`. Decided rename `[prime]`→`[records.list]` (schema + consumer, both repos).
- **Split seam.** Listing half (`primeSelectionFor`, whole `prime-selector.ts`, `primeFilters`, `parseLimit`, `primeHuman`/`primeJson`) moves near-intact to a **new** plural `records list` map key (not an extension of the singular `record` command, `record.ts:363`). Orientation half is **net-new**, assembled from `RepoContext` (`repo-context.ts:71-84`) with no body reads / no validation: repo identity (already in `primeJson` repo block `json.ts:74-79`), record-type counts (derive from `store.listRecordResults()` grouped—no helper today), `repo.policyDocs` (`:33-36,80`, unused today), vocabulary state (`repo.vocabulary` term statuses—no rollup today), static next-commands.
- **No-compat detail.** Moved flags should stop existing on `prime`; the decided "generic unknown-flag error" is itself net-new—`parseFlags` (`helpers.ts:101`) silently accepts unknown flags today; no unknown-flag rejection exists anywhere.

### Area 2—importer rebuild (introspection)

- **Current state.** `src/importers/backpressure-tech-debt.ts` (450 lines), **not wired into any command**—only exercised by `test/importers/backpressure-tech-debt.test.ts`. No `import` command exists in `index.ts`.
- **Pipeline.** `parseBackpressureTechDebtTracker:310` (heading regex `:90` `### TD-NNN: title`) → `LegacyBackpressureTechDebtEntry{originalId,number,title,body}:7` → `importRecordFor:280` → `frontmatterFor:239` → `writeBackpressureTechDebtImport:405` → `store.createRecord:413`.
- **Validation gap (load-bearing).** `MarkdownRecordStore.createRecord` (`store/markdown-record-store.ts:259`) validates **only base frontmatter** (`store/frontmatter.ts:90`, 13 fields); it does **not** run `RecordType.validate` (lifecycle + required body headings). Those run only in `check`. A generic importer that promises valid records must invoke `RecordType.validate` explicitly.
- **RecordType contract.** `core/record-type.ts:154` `{key, idPrefix, schema, lifecycle}` + `derivedTags/validate/summarizeForPrime/projectForExport`. Canonical minimal example: `test/fixtures/conversion-fixture.ts` (the importer ignores it and hardcodes `tech-debt`).
- **12 backpressure-couplings to parameterize:** (1) heading/ID format regex `:90`; (2) the normalized-entry input shape `:7`; (3) target record type (should resolve via `RecordTypeRegistry` `record-type.ts:172`, driving idPrefix/category/tags/lifecycle/body headings); (4) disposition→status mapping (`dispositionSpecs:92`, enum `:14`); (5) per-entry disposition/rationale/evidence as **input data**, not the compiled-in frozen table + exact-match assert (`:338`); (6) ID allocation policy—preserve legacy number (`:204`) vs allocate via `nextRecordNumber` (`core/id.ts:106`); (7) repo context from config not constants (`:80` `repoKey:'BP'` etc.); (8) body/vocabulary templating (`bodyFor:183`, `revisitTriggerFor:172`, embeds "backpressure"); (9) optional body rewrites (`:87`); (10) source/evidence ref shape (`sourceRefFor:161`, `kind:'tracker'`+`#td-nnn`); (11) timestamps from clock (`:85-86`); (12) the validation gap above.

### Area 3—taste-distillery migration target

- **Tracker.** `exec-plans/tech-debt-tracker.md`—single hand-authored markdown, **no frontmatter, no schema**. 14 entries `TD-DEBT-001..014` under one `## Open items`, **all single "open" state** (no rejected/superseded buckets). Entry = id (in `### TD-DEBT-NNN:` heading) + title + free prose; informal "Promote this when…" triggers, no structured status/severity/dates/tags/refs. `schemas/` has no tech-debt schema; `just docs` does not validate it.
- **Inbound references (the real migration cost).** By ID: ~8 refs across 4 non-tracker files (no ADR refs by ID). **By path/name: 22 files link the tracker**—incl. 3 ADRs, 8 cards, 2 baselines, 3 exec-plans, 4 docs, CLAUDE.md, CHANGELOG, investigations/index. The blast radius is the path references, not the 14 records.
- **Zero introspection footprint + no JS runtime (load-bearing wrinkle).** No `.introspection/`; `grep -ri introspection` = 0; not in `just ci` (fmt/docs/prose/test/vet, all Go/Vale). **No `package.json`; no Node/Bun/pnpm.** Toolchain is mise-pinned Go 1.26 + just + vale only. introspection ships as an npm-bin/Bun CLI (root CLAUDE.md: npm bin prefers a compiled platform binary, falls back to bundled JS on host Bun)—so adoption either introduces a JS runtime taste-distillery lacks, or pins the introspection binary via mise.

### Area 4—adoption surface (backpressure = reference adopter)

- **`.introspection/config.toml`** (`backpressure`): `schema_version=1`, `repo_key="BP"`, `repo_slug`, `[records].root="docs/records"`, `[defaults].visibility="local-only"`, `[prime]{default_limit,hard_limit}`, `[[policy_docs]]{name,path,applies_to[]}` ×2. **`vocabulary.toml`**: `schema_version` + `[[terms]]{tag,status,description,applies_to[], [terms.provenance]{kind,noted_at}}`.
- **Router pointer** (`backpressure/CLAUDE.md`): `:16` "run `introspection prime` before planning and `introspection check` before finishing"; `:25` tooling-posture link; `:33` working-rule + "do not add to the legacy tracker"; `AGENTS.md` symlink `:31`.
- **check wiring** (`backpressure/package.json`): `:13` `"introspection:check":"introspection check"`, chained into aggregate `check` `:11` (`&& pnpm introspection:check && pnpm prose`); dep `:41` is `file:../introspection` local link (not a published pin). CI `:39-40` runs `pnpm check`; Bun via mise-action.
- **`docs/adoption.md`** today (26 lines) is pre-publish/local-link only. Gaps for a post-publish adopter: (1) published-pin install + platform optional-package resolution + cooldown mechanics; (2) `.introspection/` scaffolding template; (3) CLAUDE.md router pointer; (4) check/CI wiring; (5) tracker migration via importer (none generic exists yet).

### Area 5—WI-19 release close-out (the only open bootstrap item)

From `docs/exec-plans/active/introspection-v1-bootstrap-2026-06-10.md:331` (WI-01..18, 20, 21 all Complete; repo-side release prep done at `ea4f97b`). Remaining: (1) MP configures npm Trusted Publishing bindings for main + each platform package (manual browser step)—or one-time first-publish bootstrap if npm requires package records first; (2) publish via Changesets OIDC/provenance behind the fail-closed `pnpm pack:dry-run && pnpm pack:smoke` gate; (3) switch backpressure's `file:` link to a strict-catalog published pin; (4) handle the 7-day `minimumReleaseAge` (scoped `minimumReleaseAgeExclude` if pnpm supports it, else wait out the window; platform packages age in parallel); (5) re-verify the TD-CARD-037 branch-protection ruleset active (`repo.protection.verify`). Then move the bootstrap plan to `completed/`.

## Approach

This is a targeted reshape, not a rewrite. It reuses the existing record store, registry, validation engine, ID/path primitives, presenters, and CLI shell, and changes only the two seams that are wrong for v1.

1. **Split command meaning.** `introspection prime` becomes a compact deterministic orientation packet; `introspection records list` inherits the current bounded listing behaviour and flags.
2. **Hard cutover.** Old `[prime]` config and moved `prime` flags fail (generic unknown-flag error). No compatibility shim.
3. **Make import generic at the CLI boundary.** Replace the backpressure importer with `introspection import --manifest <file>`, where the manifest carries normalized entries plus dispositions (authored by the adopter's agent). Per-repo tracker extraction stays outside introspection.
4. **taste-distillery adoption (decided):** pin the released compiled binary via `mise.toml` `[tools]`—no `package.json`/Node/Bun added to the Go repo. Implementation spikes mise's `npm:` backend; if it can't resolve the platform binary, WI-R05 publishes a GitHub-release binary and adoption pins via mise's `ubi:` backend.
5. **taste-distillery tracker retirement (decided):** rewrite all ~22 tracker path references to the migrated records and delete the old tracker—no pointer stub. Larger blast radius, single source of truth.
6. **Migration input (decided):** an **agent-authored** normalized manifest. introspection never parses the source tracker—the adopter's agent reads the tracker, analyzes the code, resolves ambiguity with the user, and writes the manifest against the published schema. Records stay strict; the agent fills the gaps thin source entries lack, so the importer makes zero judgment calls.
7. **Adoption automation (decided, in-plan):** `introspection init` scaffolds adoption. It writes a thin **generated `INTROSPECTION.md`** at the repo root (the stable router file) and idempotently adds a single `@INTROSPECTION.md` import line to `CLAUDE.md`/`AGENTS.md`. The evolving "how to use introspection" content lives in the CLI (`prime`, `--help`), so adopting repos hold only a thin stable pointer that never drifts—no managed-marker machinery (the one-liner is stable; `INTROSPECTION.md` is fully generated and overwritten on upgrade).

## Work Items

Reshape work items use the `WI-R##` prefix to stay distinct from the bootstrap plan's `WI-##`.

### WI-R01—Split `prime` into orientation and `records list`

**Goal:** Make `prime` a deterministic repo-orientation packet and move bounded record listing to `introspection records list`.
**Done when:**
- `introspection prime` outputs only: repo identity + root, records root, counts grouped by record type and lifecycle kind/status, unreadable-record count, policy-doc pointers, vocabulary rollup by status, static next-command hints.
- The orientation invariant is **no validation and no `summarizeForPrime`** (counts derive from frontmatter `record_type`/`status`). Reusing `listRecordResults` and ignoring bodies satisfies this; a dedicated frontmatter-only scan is an optional perf optimization, not a correctness requirement. The custom test below pins the real invariant.
- `introspection records list` supports the current filters: `--type`, `--status`, `--tag`, `--path`, `--limit`, `--include-terminal`, `--all`.
- Listing internals are renamed off prime terminology (selector types/functions, selection/result types, `RecordType.summarizeForPrime`, the human/json presenters).
- `commandHandlers` gains a plural `records` key; the singular `record` command is not extended.
- `--root <path>` is an optional repo-discovery override; default stays cwd repo.
- Generic unknown-flag handling exists; `prime --type tech-debt` fails with a stable argument error.
- CLI golden tests cover `prime` human/json orientation, `records list` human/json parity with old prime output, `prime` rejecting moved flags, and `records list` preserving terminal-filter + omitted-count behaviour. A custom test proves `prime` orientation never calls validation or body-summary paths.
**Key files:** `src/commands/index.ts:20-39,113`; `src/commands/helpers.ts:101`; `src/commands/prime.ts:54,69-82,88,103,138`; new `src/commands/records.ts`; `src/core/prime-selector.ts:61-62,155,231,290,312`; `src/core/record-type.ts:130-138,159`; `src/presenters/{human,json}.ts`; `test/commands/prime.test.ts`; `test/core/prime-selector.test.ts`.
**Dependencies:** none.
**Size:** L

### WI-R02—Rename config `[prime]` → `[records.list]`

**Goal:** Move list-limit config to the decided namespace and update existing adopters atomically.
**Done when:**
- `schemas/config.schema.json` accepts `[records.list] default_limit/hard_limit`; old `[prime]` fails schema validation.
- `src/config/repo-context.ts` exposes the defaults under `config.records.list`; runtime still enforces `hard_limit >= default_limit`.
- Introspection's own `.introspection/config.toml` and backpressure's both use `[records.list]`.
- Tests cover valid config, `[prime]` rejection, invalid limit ordering, and list-command consumption.
**Key files:** `schemas/config.schema.json:46-62`; `src/config/repo-context.ts:23-26`; `src/commands/records.ts`; `backpressure/.introspection/config.toml`; introspection `.introspection/config.toml`; `test/config/repo-context.test.ts`; `test/commands/prime.test.ts`.
**Dependencies:** WI-R01.
**Size:** M

### WI-R03—Replace the backpressure importer with generic `introspection import`

**Goal:** Remove the overfit importer and ship a generic CLI import mechanic that writes valid records from a normalized, **agent-authored** manifest. introspection never parses a source tracker format—extraction + judgment (dispositions, prose→required sections) are the adopter agent's job; the importer is pure mechanics and makes zero judgment calls.
**Done when:**
- Production code no longer contains a backpressure-specific importer module.
- New command `introspection import --manifest <path> [--dry-run] [--json]` exists.
- `introspection import --print-schema` (or `--template`) emits the manifest schema/skeleton so an agent can author against a known target; dry-run reports per-entry errors so the agent iterates (draft → dry-run → fix → import).
- The manifest is schema-validated before record construction and includes: `schema_version`, `record_type`, source tracker metadata, ID policy (preserve legacy number vs allocate next), normalized entries, per-entry status/disposition/rationale/evidence, and the target type's required body sections.
- Import preflights all entries before any write: target record type exists; candidate frontmatter/body built **with machine-derived tags already populated** (`record/*`, `status/*`, `repo/*`—validation's `tagInvariantFindings` require them, else every record fails); all failures reported with entry IDs.
- Preflight is **corpus-aware**: it runs the public `checkRecordResults` over candidate records *plus the existing on-disk corpus* (or writes to a temp dir and runs `checkRecords`), so `duplicateRecordIdFindings` catches **ID collisions with existing records**, whereas `createFileNoClobber` only catches *path* collisions, not ID. Entry-point choice (`checkRecordResults` on candidates vs temp-dir `checkRecords`) is the implementer's; the corpus-load + tag-derivation requirements hold either way.
- `--dry-run` renders the same report without writes; writes use the existing no-clobber store + canonical path helpers.
- Tests prove: a valid manifest writes records that pass `checkRecords`; invalid lifecycle evidence fails before any write; unknown record type fails; path collision fails before partial writes; an ID collision with an existing on-disk record fails; dry-run performs no writes; and the old backpressure fixture is representable through the generic manifest without production backpressure constants.
**Key files:** remove `src/importers/backpressure-tech-debt.ts`; `src/commands/index.ts:20-27`; new `src/commands/import.ts`; `src/core/record-type.ts:154,172`; `src/core/validation.ts`; `src/core/id.ts:106`; `src/store/markdown-record-store.ts:259`; `src/store/frontmatter.ts:90`; `test/importers/backpressure-tech-debt.test.ts`; new import command tests + manifest fixtures.
**Dependencies:** none hard—shares the unknown-flag / `--root` flag helper with WI-R01; extract that helper so WI-R03 can proceed in parallel.
**Size:** L (could grow if the preflight must export the private `validateParsedRecord` or load the full corpus—settle the entry-point approach early).

### WI-R04—Prepare taste-distillery migration input and reference audit

**Goal:** Create the reviewable taste-distillery migration input before mutating any tracker state.
**Done when:**
- A committed normalized import manifest covers all 14 `TD-DEBT-NNN` entries, **agent-authored** (the agent reads the tracker + analyzes the code, resolving ambiguity with MP). The required body sections come from `introspection import --print-schema` (the registered tech-debt type owns them—don't restate the section list here); each legacy ID is preserved in `source.refs` and the numeric ordering retained.
- `repo_key` / ID prefix are the adopter's `.introspection/config.toml` choice (MP or the agent owns it); the manifest uses whatever the config sets, not a hardcoded literal.
- A reference audit enumerates legacy ID references, tracker path/name references, files needing rewrites, and any references intentionally left as historical; it recommends rewrite-and-delete over a pointer stub.
- `introspection import --dry-run --manifest ... --json` succeeds against an empty temp records root.
**Key files:** `taste-distillery/exec-plans/tech-debt-tracker.md`; `taste-distillery/exec-plans/index.md`; `taste-distillery/docs/{source-of-truth-boundaries,lifecycle-and-status}.md`; `taste-distillery/decisions/index.md`; new taste-distillery import manifest (review location TBD); `src/commands/import.ts`.
**Dependencies:** WI-R03.
**Size:** M

### WI-R05—Close WI-19 release path and switch backpressure to the published pin

**Goal:** Finish the remaining bootstrap release work and make the published package the reference-adopter dependency.
**Done when:**
- **Early spike (gates distribution + WI-R09):** determine whether mise's `npm:` backend resolves the platform optional-package binary. If yes, taste-distillery pins `npm:@mplibunao/introspection`; if no, this item also publishes a GitHub-release binary asset consumed via mise's `ubi:` backend (widening this item's scope).
- MP configures npm Trusted Publishing bindings for `@mplibunao/introspection` and each platform package
- Branch protection (TD-CARD-037 ruleset) is re-verified before trusting publish automation.
- Changesets publishes with OIDC/provenance via `.github/workflows/release.yml`; `pnpm release:prepare` passes (`pnpm pack:dry-run` + `pnpm pack:smoke`).
- Backpressure replaces `file:../introspection` with a strict-catalog pin and handles the 7-day `minimumReleaseAge` (scoped exclusion if supported, else waits out the window); backpressure `pnpm check` passes on the pin.
- The bootstrap plan `docs/exec-plans/active/introspection-v1-bootstrap-2026-06-10.md` moves to `docs/exec-plans/completed/`.
**Key files:** `docs/exec-plans/active/introspection-v1-bootstrap-2026-06-10.md`; `docs/references/release-readiness.md`; `.github/workflows/release.yml`; `package.json`; `pnpm-workspace.yaml`; `backpressure/{package.json,pnpm-workspace.yaml,.github/workflows/ci.yml}`.
**Dependencies:** WI-R01, WI-R02 should land first so the published interface is the reshaped one; WI-R03 preferred before publish so `import` ships in the release taste-distillery consumes.
**Size:** M (with external/manual blockers).

### WI-R06—Migrate taste-distillery's tracker (one-time, local binary)

**Goal:** Make taste-distillery the first heterogeneous migration target while preserving its Go/just/Vale posture. This is the one-time content migration; it runs on the locally built binary and is **not** gated on the publish (steady-state CI wiring is WI-R09).
**Done when:**
- The migration runs against the **locally built** `introspection` binary in this workspace—no `package.json`/pnpm/Node/Bun added, and no dependency on the publish blocker.
- `introspection init` scaffolds `.introspection/{config.toml,vocabulary.toml}`, the generated `INTROSPECTION.md`, and the `@INTROSPECTION.md` import line in `CLAUDE.md` (symlinked `AGENTS.md` follows); `docs/records/tech-debt/**` is created by the import; any needed `.gitignore` entries added.
- Future deferred work routes to records, not the old tracker (CLAUDE.md / INTROSPECTION.md updated via `init`). Steady-state `justfile` check wiring is WI-R09.
- The generic importer writes all 14 records from the manifest; the old tracker is deleted (not stubbed); all legacy tracker path references are rewritten to migrated record paths or the records index; legacy ID references are rewritten to canonical IDs or preserved only where explicitly historical.
- Verification (local binary): `introspection check` + `introspection prime --json` pass; a link audit shows no links to the deleted tracker path; an audit shows no active `### TD-DEBT-` tracker headings remain; taste-distillery's existing `just docs` / `just prose` pass (catch broken refs from the rewrite).
**Key files:** `taste-distillery/{CLAUDE.md,mise.toml,justfile}`; `taste-distillery/exec-plans/tech-debt-tracker.md`; `taste-distillery/exec-plans/index.md`; `taste-distillery/docs/{source-of-truth-boundaries,lifecycle-and-status}.md`; `taste-distillery/decisions/index.md`; new `taste-distillery/.introspection/**`; new `taste-distillery/docs/records/tech-debt/**`.
**Dependencies:** WI-R03, WI-R04, WI-R08 (uses `introspection init`)—runs on the locally built binary, **not** gated on WI-R05.
**Size:** L

### WI-R07—Reframe adoption docs into the canonical post-publish playbook

**Goal:** Turn the local-link guide into the repeatable adoption guide for future repos.
**Done when:**
- `docs/adoption.md` is no longer backpressure/local-link-first. It **leads with `introspection init`** (which scaffolds `.introspection/`, `INTROSPECTION.md`, and the `@`-import line), then covers: installing/pinning the published package or mise-pinned binary, release-age cooldown behaviour, platform optional-package expectations, the `[records.list]` config, check/CI wiring, tracker migration through agent-authored `introspection import`, and deleting retired trackers / rewriting references. Manual steps are documented only as the fallback where `init` can't run.
- The guide states plainly that `prime` is runtime orientation for already-adopted repos, not a bootstrap command.
- taste-distillery is cited as the first heterogeneous migration pattern; backpressure as the reference pnpm adopter + published-pin example.
- Prose checks pass.
**Key files:** `docs/adoption.md`; `docs/references/release-readiness.md`; this plan; taste-distillery + backpressure adopter surfaces from prior WIs.
**Dependencies:** WI-R03 (importer contract), WI-R05 (published behaviour), WI-R06 (non-JS adopter example), WI-R08 (init is the playbook's first step).
**Size:** M

### WI-R08—`introspection init` adoption scaffolder

**Goal:** One repo-scoped command that makes a repo an introspection adopter—scaffold config + the router file, idempotently.
**Done when:**
- `introspection init` (repo-scoped; not global like rtk) creates `.introspection/config.toml` (repo_key/repo_slug/records root from flags or prompts) and `.introspection/vocabulary.toml` if absent; existing config is never clobbered.
- It writes a thin **generated** `INTROSPECTION.md` at the repo root: what introspection is + "run `introspection prime` at repo-work start, `introspection check` before finishing" + a pointer to `--help`. Fully generated; re-run/upgrade overwrites it (no markers).
- It idempotently adds a single `@INTROSPECTION.md` import line to `CLAUDE.md` and `AGENTS.md`: detects the symlink case (patch once), patches both when separate, skips if already present. The line is stable across versions—only `INTROSPECTION.md` content changes.
- Insertion contract is explicit: the `@INTROSPECTION.md` line goes at end-of-file (or under a designated heading), dedupe is an exact-string match, and an absent `CLAUDE.md`/`AGENTS.md` is created (or skipped with a message—pick one). (A plain-text-pointer-vs-`@`-import flag is **deferred**: the repo convention is `AGENTS.md`→`CLAUDE.md` symlink, so the same inode can't carry different content; no current target needs it.)
- Flags: `--show` (verify what's installed), `--yes` (non-interactive defaults), `--agents-file <path>` / symlink handling. Every choice `init` makes is a flag or a safe invariant—it never silently decides record content.
- Tests: fresh-repo init creates all artifacts; re-run is idempotent (no duplicate import lines, config preserved, `INTROSPECTION.md` regenerated); symlinked vs separate `AGENTS.md` both handled; `--show` reports state.
**Key files:** new `src/commands/init.ts`; `src/commands/index.ts:20-39`; config/vocabulary templates; `docs/adoption.md`; new init tests.
**Dependencies:** WI-R02 (writes `[records.list]` config). Independent of the importer.
**Size:** M

### WI-R09—taste-distillery steady-state check wiring (published pin)

**Goal:** Wire the published, mise-pinned introspection binary into taste-distillery's checks so records are validated in CI.
**Done when:**
- `mise.toml` `[tools]` pins the published introspection binary (`npm:@mplibunao/introspection` or `ubi:` per the WI-R05 spike), lockfile updated.
- `justfile` runs `introspection check` inside `just check`/`just ci`; CI (`just ci` via mise) validates records on PRs.
- A fresh `mise install` + `just check` passes on a clean checkout.
**Key files:** `taste-distillery/mise.toml`; `taste-distillery/justfile`; `taste-distillery/.github/workflows/ci.yml`.
**Dependencies:** WI-R05 (published + mise-consumable binary), WI-R06 (records exist).
**Size:** S

### WI-R10—Adopt the doc-garden ai-tells prose + commit gate

**Goal:** Bring introspection's Vale gate up to the canonical doc-garden **Personal dev-tooling** profile, which it skipped at bootstrap (it ships Google/write-good/alex but no ai-tells family, so its prose gate misses LLM tells and its commit-msg gate is absent: the reason this session's introspection commits kept the `Co-Authored-By` trailer that backpressure rejects).
**Done when:**
- `.vale.ini` matches the doc-garden Personal dev-tooling profile (run `/doc-garden setup`, or mirror `backpressure/.vale.ini`): the `vale-ai-tells` packages (`ai-tells` + `ai-tells-commits`) added alongside Google/write-good/alex; `[*.md] BasedOnStyles` includes `ai-tells`; a `[COMMIT_EDITMSG]` section (`ai-tells, ai-tells-commits`) plus the format map gates commit messages.
- `scripts/setup-vale.sh` syncs the `ai-tells*` style dirs (mirror backpressure's `vale-ensure-styles.sh` package list); the commit-msg hook runs Vale over the message (rejects the attribution trailer + LLM tells).
- `pnpm prose` passes after a cleanup pass over existing introspection docs/records that `ai-tells` newly flags (this plan included).
- WI-R07's adoption playbook points adopters at `/doc-garden setup` for the prose gate (doc-garden owns Vale setup; introspection's `init` owns records adoption: no duplication).
**Key files:** `.vale.ini`; `scripts/setup-vale.sh`; `package.json` (prose/commit scripts); commit-msg hook config; existing docs/records flagged by `ai-tells`.
**Dependencies:** none hard; pairs with WI-R07/WI-R08 so the playbook scaffolds the same profile for future adopters.
**Size:** M

### WI-R11—Fix taste-distillery's Vale gate and strengthen the canon guidance

**Goal:** Close the canon hole that let introspection (and taste-distillery itself) bootstrap without the ai-tells profile. Fix taste-distillery's own gate, and make the canon route future repos to `/doc-garden setup` instead of a copyable weak config.
**Done when:**
- taste-distillery's `.vale.ini` matches the doc-garden Personal dev-tooling profile (run `/doc-garden setup`): ai-tells + ai-tells-commits + the `[COMMIT_EDITMSG]` gate, with a cleanup pass over new ai-tells findings so `just prose` / `just check` pass.
- TD-CARD-013 (Vale and Doc Garden modes) mandates `/doc-garden setup` as the authoritative way to materialize a repo-local `.vale.ini`, with stronger wording: do not hand-author or copy a partial config, since it silently omits the ai-tells family. It names the `/doc-garden setup` skill mode explicitly.
- TD-BASELINE-007 (Prose and changelog) no longer ships a copyable `.vale.ini` snippet that omits ai-tells. Replace the snippet with a `/doc-garden setup` instruction, or update it to the full Personal dev-tooling shape, so no weak copy-paste path remains in the canon.
- Edits follow taste-distillery card/baseline governance (schema-valid, `last_reviewed` bumped) and pass `just docs` / `just check`.
**Key files:** `taste-distillery/.vale.ini`; `taste-distillery/styles/**`; `taste-distillery/cards/docs-and-knowledge/vale-and-doc-garden-modes.md`; `taste-distillery/baselines/docs-and-knowledge/prose-and-changelog.md`.
**Dependencies:** none (independent of the introspection build); the executing agent reads taste-distillery's CLAUDE.md + card/baseline schemas before editing canon.
**Size:** M

## Risks and migration notes

- **Hard cutover:** `[prime]` configs and old prime flags break intentionally—land WI-R01 + WI-R02 atomically with the introspection/backpressure config updates.
- **taste-distillery blast radius:** rewriting tracker path references touches ADRs/cards/baselines/docs. The larger edit is intentional; pointer stubs create duplicate ownership.
- **Manual release blocker:** WI-R05 cannot fully complete without MP's npm Trusted Publishing setup (or a one-time bootstrap publish).
- **Distribution coupling:** taste-distillery's no-JS adoption depends on the released binary being mise-consumable. If the npm platform packages are not mise-consumable via `npm:`, WI-R05 must add a GitHub-release binary asset (consumed via `ubi:`) before WI-R06 steady-state wiring. This may widen WI-R05's scope—spike the `npm:` backend early.
- **`@`-import portability:** `@INTROSPECTION.md` is a Claude Code convention; an `AGENTS.md` read by other agents may not honor it. Deferred—the repo convention is `AGENTS.md`→`CLAUDE.md` symlink (same inode, can't differ), so no current target needs a separate plain-text pointer. Revisit when a non-symlink, non-Claude adopter appears.
- **`init` is additive scope:** unlike the importer (a fix to existing bad architecture), `introspection init` is genuinely new. Accepted in-plan (WI-R08) to shrink the adoption surface and dogfood it on taste-distillery.

## Decisions from mid-flow review (2026-06-13)

All three checkpoint questions are resolved (folded into Approach):
1. **taste-distillery runtime** → pin via `mise.toml`, no JS runtime. Spike the `npm:` backend; fall back to a GitHub-release binary + `ubi:` if needed (widens WI-R05).
2. **taste-distillery path references** → rewrite all ~22 to the migrated records and delete the tracker; no stub.
3. **Importer input** → agent-authored strict manifest; introspection never parses source formats; records stay strict because the agent fills the gaps.

Plus: `introspection init` is **in-plan** (WI-R08), using a thin generated `INTROSPECTION.md` + a stable `@INTROSPECTION.md` import line (no managed markers).

No open questions remain that block implementation.

## References

- Bootstrap plan (WI-19 source; move to `completed/` when closed): `docs/exec-plans/active/introspection-v1-bootstrap-2026-06-10.md`
- Reference adopter: `backpressure/.introspection/`, `backpressure/CLAUDE.md`, `backpressure/package.json`
- Adoption doc to reframe: `docs/adoption.md`; release detail: `docs/references/release-readiness.md`
