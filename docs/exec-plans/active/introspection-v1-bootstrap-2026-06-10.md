# introspection v1 bootstrap: Plan

## Goal

Bootstrap the `introspection` repo: a governed, typed, agent-maintained record substrate (markdown + frontmatter source of truth, Effect/TS CLI, record-type plugin contract, conversion lifecycle, controlled tag vocabulary), and adopt it in `backpressure` as the first customer by migrating its tech-debt tracker. The seed's DECIDED items are settled constraints; this plan resolves the OPEN items into an executable build sequence.

## Background

### Inputs (read these first)

- **Seed (source of truth for decisions):** `docs/design-input/introspection-seed-2026-06-01.md`: Vision, the DECIDED items (apply as-is; do not re-litigate), the OPEN questions, and references. Key DECIDED anchors: Effect/TS; markdown+frontmatter SoT with core-owned export (GNO is a parallel consumer, never a dependency); record-type-agnostic engine via static plugin registry (no runtime loading); ID model `(repo, key, number)` with key in committed repo config; mechanics-universal/judgment-per-adopter; `prime` as the universal primitive; conversion lifecycle as the anti-bloat core; real ports with ≥1 real + 1 trivial proving impl per seam; format-by-slot (YAML frontmatter / TOML hand-authored config / JSON generated / JSON Schema validation); v1 order = engine + tech-debt → backpressure dogfood gate → introspection types → corpus tag hygiene.
- **Pre-planning deferrals:** `docs/exec-plans/tech-debt-tracker.md`: TD-001..TD-014 define what v1 deliberately does NOT include (full-corpus tag mutation, GNO-assisted prime, schema migration command, vocab web UI, hooks beyond CLI floor, cross-repo aggregation, factory automation, runtime-loaded plugins, multi-user). These entries are shaped to migrate into introspection's own records (self-dogfood).
- **Oracle consultation + assessment:** `investigations/oracle-preplan-critique-2026-06-01.md`. Absorbed ideas: non-user-facing conversion-lifecycle fixture to shape the `RecordType` contract before freezing it; typed conversion evidence (`conversion_target` with kind/ref/rationale, where the CLI enforces shape, not sufficiency); DB-like file discipline (atomic ID allocation, atomic writes, `schema_version` from day one); deterministic `prime` with zero GNO dependency and omitted-count visibility; ports-not-plugins taxonomy (real extension points / internal seams / fixed invariants); 8 verification gates (migration, lifecycle-evidence, concurrency, prime-bounded, export-recreatable, boundary-no-GNO, contract-fixture, vocabulary); `visibility: local-only` field from day one.
- **Superseded design input:** `docs/design-input/tracker-governance-2026-06-01.md` (+ its critique doc): the abandoned hand-rolled governance approach for backpressure. Mine its write-gate criteria and entry schema as judgment-policy input for the tech-debt record type.

### First customer: backpressure (recon 2026-06-10)

- Tracker `docs/exec-plans/tech-debt-tracker.md`: free-form `### TD-NNN:` entries; header policy says future-session deferrals only, stable IDs, gaps never renumbered. **10 open entries exist (TD-001..TD-011, no TD-005).** The earlier keep-decision (keep TD-007/008/009/010, archive TD-001/002/003/004/006) was never executed, and TD-011 (added 2026-06-07) carries a stale path (`docs/exec-plans/active/bun-runtime-migration-2026-06-07.md` → actually in `completed/`). Migration must include a disposition pass.
- Conventions a tool must respect: `CLAUDE.md` is a router with a "Start here" table (tracker linked at `CLAUDE.md:17`); pnpm 11 + Corepack with Bun script runtime; `vp` (vite-plus) front door; Vale prose gate always `--no-global`, wired as the last step of `pnpm check` (`package.json:11` → `scripts/prose-files.sh`); scripts live in `scripts/{checks,lib,packages}` as Bun-run TS (ADR-005); changesets own release flow (ADR-006); docs layout `docs/{decisions,design-docs,exec-plans,investigations,references}`; active plans convention `docs/exec-plans/active/` → `completed/` (no `active/` dir exists at the moment); `AGENTS.md` is a symlink to `CLAUDE.md`.
- Consumption model: external npm package under `@mplibunao/*` via strict central catalog (`pnpm-workspace.yaml`: `catalogMode: strict`). **`minimumReleaseAge: 10080` (7-day cooldown) + `minimumReleaseAgeStrict: true` means a freshly published introspection package cannot be installed for 7 days**. The Approach resolves this through dogfood via local link (Decision #9), with cooldown handled at publish time (WI-19).
- No dangling references point to the moved tracker-governance files, so that lineage is clean.

### taste-distillery patterns to reuse (recon 2026-06-10)

- **Two-owner split (most reusable pattern):** JSON Schema owns field *shape* (`schemas/card.schema.json`, required fields, enums, ID pattern `^TD-CARD-[0-9]{3}$`); a separate taxonomy data file owns *vocabularies* (`schemas/taxonomy.json`, tag facets, allowed extra tags). Tags are machine-derived `<prefix>/<value>` from facet fields + `extra_tags` appended (`scripts/check-docs/metadata.go:611-620`); drift is a blocking violation; `--fix` regenerates only machine-owned tags.
- **Checker charter** (`docs/checker-requirements.md:5-12`): validate via repo-local config/schemas, not hardcoded lists; remediation-first messages; narrow `--fix`. Unknown-key rejection in frontmatter; schemas themselves meta-validated.
- **Format-by-slot ADR:** `decisions/002-config-and-data-formats.md:11-21` (YAML frontmatter / JSON Schema validation / TOML hand-authored manifests). Caveat: quote TOML dates as strings (TOML native dates fail JSON-Schema `string`); keep Taplo-consumed schemas Draft-4-expressible.
- **GNO boundary discipline** (`docs/gno-retrieval.md:7-10,62-79`): GNO deliberately OUT of CI and repo config (OS-level dirs keyed by absolute path); repo must validate on a clean machine without models. Sharp edge to avoid reproducing: TOML manifest `publish = false` vs frontmatter `publish: false` mismatch. Only frontmatter is honored by `gno publish export`.
- Repo bootstrap conventions: `CLAUDE.md` router + `AGENTS.md` symlink; source-of-truth ownership map (`docs/source-of-truth-boundaries.md`); `schemas/` as config-as-data with `$schema` backrefs; frozen IDs, supersede-not-delete; every content dir has an `index.md` with enforced reachability.
- Note: taste-distillery's checker is Go; introspection is decided Effect/TS. Reuse the *patterns*, not the code.

- **Stack canon (canon pass 2026-06-10; entry point `use-cases/new-typescript-workspace.md`):** pnpm 11 workspace baseline with Corepack-pinned `packageManager` and `engines.node >=24` (TD-CARD-005, TD-BASELINE-002); mise pins repo-local tools, Corepack owns pnpm (TD-CARD-002); `vite-plus check` is the TS front door (TD-CARD-007); oxlint hard ceilings as errors (TD-CARD-008); Vitest default runner (TD-CARD-010); Bun for authored repo scripts (TD-CARD-035); release authority = changesets + npm Trusted Publishing OIDC + provenance + fail-closed pre-publish gate (TD-CARD-034; concrete shape in specimen TD-SPECIMEN-004, the backpressure release boundary); artifact validation = pack, install the tarball, import it (TD-CARD-018); repo-local Vale with `--no-global` as the deterministic prose gate (TD-CARD-013: `.vale.ini` + hash-gated `setup-vale.sh` sync; exclude the `AGENTS.md` symlink and `prompt-exports/**`); changelog discipline (TD-CARD-015); docs IA by concern (TD-CARD-014). The canon moved during this session (parallel taste-distillery work): oxfmt is now an accepted default formatter card (TD-CARD-036); TD-CARD-006/TD-CARD-008 now prescribe consuming the published `@mplibunao/tsconfig`/`@mplibunao/oxlint-standards` presets; and TD-CARD-037 (branch-protection baseline, accepted/default) prescribes a tool-owned GitHub ruleset applied via the claude-toolkit `github-ops` skill, with backpressure's applied ruleset frozen as TD-SPECIMEN-007. The pnpm supply chain hardening block still lives in `investigations/personal-project-stack-defaults-v2-2026-05-29.md:64-77` and is not yet promoted into TD-BASELINE-002.

### GNO integration contract (recon 2026-06-10)

- Collection = `{name, path, pattern, include, exclude}` (`src/config/types.ts:67-115`); FTS5 BM25 + sqlite-vec vector + hybrid fusion; tag filtering is a **post-filter** (`--tags-all`/`--tags-any`) against a `doc_tags` table.
- **Frontmatter is parsed flat only** (`src/ingestion/frontmatter.ts:125,168-176`): `key: value` pairs become string metadata; **nested YAML is not deep-parsed**. Tags read from `tags:` (inline/comma/block forms), Logseq `tags::`, and body `#hashtags`.
- **Tag grammar** (`src/core/tags.ts:19-68`): lowercase, NFC, hierarchical `a/b/c`, segments `[letters/digits/hyphens/dots]` starting alphanumeric. **Invalid tags are silently dropped at ingest**, so introspection's emitted tags must conform.
- Temporal/category filters key off date-ish keys (`created`, `updated`, `date`, `*_at`) and `category`/`categories`/`type` (`src/ingestion/sync.ts:74-106,213,246`).
- GNO has **no controlled-vocabulary concept**. Tags are open-vocabulary with only syntactic validation. Introspection's vocab layer adds governance instead of replacing GNO behavior.
- Read/write boundary: indexing, search, and `gno publish export` (JSON artifact written outside the corpus, such as `~/Downloads`) are read-only. **But `gno tag add`/`gno tag rm` rewrite source-file frontmatter in place** (`src/cli/commands/tags.ts:446-477`). Treat these commands as off-limits on an introspection-owned corpus; introspection owns all tag writes.

### Effect CLI reference shape (t3code recon + ecosystem research, 2026-06-10)

- **Framework decision point:** t3code uses Effect 4.0 beta's built-in `effect/unstable/cli` (`apps/server/src/bin.ts:5`, pinned `4.0.0-beta.73` with a local patch), not the standalone `@effect/cli` (latest 0.75.2 on stable Effect 3.x; mature, 0.x churn, known ordering rigidity: options before positionals/subcommands).
- Reusable t3code patterns: one root `Command.make` + `withSubcommands` nesting (`bin.ts:16-27`); named flag consts spread across subcommands (`cli/config.ts:159-187`); `Flag.withSchema` pushes validation into parsing; thin global runtime layer + per-command Layers built in handlers; `--json` + quiet-logs convention for machine output with redaction tests; testing via `Command.runWith` + `TestConsole` (no subprocess) (`bin.test.ts:9-48`); tsdown build with shebang banner; vitest + `@effect/vitest`; oxlint/oxfmt.
- Cautions: beta pin + patch churn; bleeding-edge toolchain (tsgo, oxfmt). Adopt deliberately; consider one shared `AppLayer` instead of per-handler re-wiring for a small CLI.

### Prior art / alternatives (external research, 2026-06-10; shape input, build decision already made)

- **Backlog.md** (TS/Bun): closest template. It uses per-task `.md` + YAML frontmatter in git, offers a CLI + MCP server + web UI, and generates `CLAUDE.md`/`AGENTS.md` instructions. Sequential IDs (concurrency-naive). [github.com/MrLesk/Backlog.md](https://github.com/MrLesk/Backlog.md)
- **beads** (Yegge): moved its source of truth **from JSONL to Dolt** because flat-file merge at scale (multi-agent, multi-branch) hurt. This is the strongest counterpoint to naive file merges; design the ID/merge story up front. Borrow: hierarchical hash IDs (`bd-a3f8.1`), atomic `--claim`, `bd ready` (dependency topo-sort), `bd prime`/`bd remember` surface, typed dependency edges (`relates_to`, `supersedes`, …). Counter-lesson: 130k LOC of Go, which reinforces scope discipline. [github.com/steveyegge/beads](https://github.com/steveyegge/beads)
- **git-bug**: CRDT operation-log in git objects. It is the gold standard for conflict-free distributed edits, and its refs-namespace pattern keeps metadata out of the working tree. **git-issue**: file-per-issue + tag-based status, proof minimal machinery works. **git-appraise**: dormant; refs-namespace reference only.
- **Taskmaster / Spec Kit / OpenSpec**: the market converged on forward task decomposition (spec → plan → tasks). **Nobody models mistakes/learnings as first-class typed lifecycle records. That is introspection's differentiation; don't let it collapse into another task tracker.** Spec Kit's "constitution" concept is adjacent to promoted learnings.
- **ID tension to resolve inside the decided model:** the seed fixes `(repo, key, number)` (JIRA-style, human-friendly); research consensus is sequential numbers collide under concurrent allocation. The plan must specify allocation mechanics (atomic allocator, branch/merge behavior, collision repair). The oracle's concurrency gate covers this.

### Harness/global surfaces (claude-toolkit recon 2026-06-10)

- The deferral-persistence rule to eventually replace (TD-007 here): `GLOBAL_CLAUDE.md:4-5` ≡ `GLOBAL_AGENTS.md:4-5` requires same-response persistence, tracker-first handling, relevant phase stubs, escalation when no clear home exists, and the session-finish audit rule.
- Judgment-vs-mechanics litmus (apply at plan/critique time): `docs/workflows/creating-skills.md:123` says helper decisions about what is worth escalating or shown to the user are workflow judgment. Expose that judgment through caller-supplied policy, such as a flag, profile, or policy file, unless it is an explicit product/safety invariant.
- Entry detail model: `claude-toolkit/docs/exec-plans/tech-debt-tracker.md:5-13` field schema (ID/Category/Severity/Status/Source/Description + concrete revisit trigger).
- Distribution precedents for `prime` + plugin: `setup.sh` symlink fan-out (`:123-130`), `cdt` local-bin CLI pattern (`:167-168`), `codex-sync-skills` plugin source-spec, and **ccctl already stubs `SessionStart`/`PreCompact` as log-only no-op extension points** (`packages/ccctl/src/commands/hook.ts:94-135`, `docs/ccctl/hooks.md:39-51`). These are the natural future wiring points for TD-010 hooks after v1.

## Approach

V1 builds the durable substrate only. That substrate includes a static `RecordType` registry, a markdown record store with atomic writes, ID allocation safe under same-worktree concurrency, lifecycle validation with terminal-evidence enforcement, record-local controlled vocabulary, deterministic `prime`, and JSON/GNO export projections. V1 then adopts that substrate in backpressure behind an explicit dogfood checkpoint. Everything in TD-001..TD-014 stays deferred until its written trigger fires; the only trigger that fires inside this plan is TD-007's (the dogfood gate), which WI-18 executes. Additional record types (mistakes/desires/learnings) are post-v1 work behind TD-003, even though the seed's original ordering lists them after the gate.

### Resolved decisions (mapping the 12 open questions)

| # | Decision |
|---:|---|
| 1 | `RecordType` is a static compiled contract declaring schema, lifecycle, transition evidence, validation, prime summary, and export projection. Base frontmatter carries `schema_version`, canonical ID fields, status, dates, visibility, and tags. Conversion evidence is typed `conversion_targets` plus a terminal `resolution` block. |
| 2 | Tech-debt lifecycle: `open → done/rejected/superseded/moved`; all terminal states require dated rationale; `done`/`superseded`/`moved` also require evidence/refs. The non-user-facing conversion fixture lifecycle: `observed → converted/rejected/superseded`, `converted` requiring `conversion_targets`. |
| 3 | IDs render as `BP-TD-007` from committed `repo_key` + type key + number, with the number zero-padded to three digits (wider numbers render unpadded, matching the schema's `[0-9]{3,}` shape). Allocation happens under a crash-recoverable local lock in `.introspection/.locks/` (lock metadata carries PID + timestamp; locks with a dead PID or past a TTL are reclaimable). Inside that lock, the allocator scans existing records, computes `max+1`, and exclusive-creates the new record so two processes in one worktree cannot double-allocate. Updates: hash the raw file bytes at read time, re-verify immediately before the atomic temp-file + rename, abort with a remediation finding on mismatch. The exact lock primitive (O_EXCL lockfile vs lock dir) is implementer's choice; the semantics above are the contract, with one addition: the final-target create must be a true no-clobber primitive (open with `wx` or equivalent on the destination). Check-absence-then-rename is not acceptable, because `rename` silently replaces a file another process created in the gap; the concurrency test must use two separate processes, not two promises. Cross-branch duplicates are out of scope for the lock. They fail `check`, and an explicit `ids repair` operation renumbers the record and updates structured refs within the records root: the record's own `id`/`number`/filename plus frontmatter refs whose value is the old ID or path. Body-prose occurrences of the old ID are reported, not rewritten, and nothing outside the records root is ever touched. |
| 4 | V1 exposes data via CLI commands + generated exports only. No server/TUI/web UI. Generated artifacts are disposable and recreatable. |
| 5 | `prime` is deterministic, zero-GNO. Repo root = nearest ancestor of cwd containing `.introspection/config.toml` (independent of git). Fixed invariants: active records only by default, bounded output (config-defaulted limit with a hard cap), explicit omitted counts, deterministic stable total order. The exact default limit and tie-break sequence are tool-tuning details (documented defaults, overridable by flag/config), not contract. Flags: type/status/tag/path/limit/include-terminal/all/json. |
| 6 | GNO-relevant fields stay flat/top-level (`id`, `title`, `record_type`, `type`, `category`, `status`, `visibility`, `created_at`, `updated_at`, `tags`, conforming to GNO's tag grammar); introspection-only data (`resolution`, `source`, `scope`, `conversion_targets`) may nest. Because records live in a visible directory (see layout), GNO indexes the source files directly for local retrieval; the GNO export projection (WI-11) is a disposable artifact for portable use, not the indexing path. No core path (`check`, transitions, default `prime`) consumes any retrieval adapter in v1; the retrieval port ships with contract tests and a proving impl per the seed's ports rule, and GNO-assisted features stay behind TD-005/TD-008. |
| 7 | Judgment lives in adopter prose. `.introspection/config.toml` holds mechanics (`repo_key`, `repo_slug`, the source of the `repo/<slug>` derived tag; records root, default `docs/records/`; default visibility) + policy-doc pointers. `.introspection/vocabulary.toml` owns record-local vocabulary terms (approved/provisional, descriptions, provenance). |
| 8 | V1 vocabulary ops are record-local only: propose, approve, reject, list, usage, rename, merge, delete-if-unused. Rename/merge cascades only across the configured records root (`docs/records/**` by default). Unknown raw tags fail validation with remediation; CLI-created unknown tags enter as provisional via an explicit propose flow. |
| 9 | Backpressure **dogfoods via a local link** (`file:`/`pnpm link` to the locally built package). npm publish is NOT on the dogfood critical path. After the gate passes, publish and switch backpressure to the published catalog pin (WI-19), handling the 7-day cooldown there: scoped `minimumReleaseAgeExclude` if backpressure's pnpm supports it, else let the release age past the window. No global installs inside `pnpm check`. Old tracker becomes a pointer stub; `introspection check` wires into `pnpm check` before prose. |
| 10 | **(User calls at the mid-flow checkpoint, plus the canon pass)** Effect 4 beta's built-in `effect/unstable/cli`, matching t3code: bet on the future API now rather than migrating off `@effect/cli` after Effect 4 GAs. Pin the exact beta (t3code pins `4.0.0-beta.73` with a local patch; adopt the same pin-and-patch discipline) and accept churn until GA. The shipped bin is bun-first (user call, 2026-06-11): the tsdown banner is `#!/usr/bin/env bun` and engines pin bun alongside node. Effect platform wiring: the bin entrypoint uses `@effect/platform-bun` (BunServices/BunRuntime); domain code depends only on abstract platform services and node-compat APIs that bun implements natively; vitest tests provide node-flavored layers of the same abstract services. The published package is CLI-only in v1: tsdown bundles all runtime deps into the bin, and no public library exports are supported. The rest of the stack follows the taste-distillery canon plus the user calls marked inline; see the Bootstrap stack section below. Borrow t3code's patterns directly: in-process `Command.runWith` testing, `--json` + quiet-logs, named flag consts, per-command layers (consider one shared `AppLayer`). |
| 11 | Superseded design-input docs stay archived with a final "mined into introspection v1 plan" disposition note, not deleted. |
| 12 | After the dogfood gate passes, introspection's own TD-001..TD-014 migrate into its own records; the old tracker file becomes a pointer stub (self-dogfood). |

### Canonical record layout (in each adopting repo)

**(User call, mid-flow checkpoint: visible records, hidden config.)** Records are content, meaning judgment, rationale, and provenance. Records are not tool state, so they live in a visible directory that GNO's walker indexes directly and humans/agents browse naturally. Tool state (config, vocabulary, locks, generated artifacts) stays hidden.

```text
.introspection/
  config.toml         # mechanics + policy pointers (committed)
  vocabulary.toml     # record-local controlled vocabulary (committed)
  .locks/             # local, non-committed
  generated/          # disposable export artifacts (gitignored)
docs/
  records/            # records root (committed; configurable via config.toml)
    tech-debt/
      open/bp-td-007.md
      archive/bp-td-001.md
```

Base frontmatter (flat fields are the GNO-visible surface; tags conform to GNO's grammar):

```yaml
---
schema_version: 1
id: BP-TD-007
repo_key: BP
record_type: tech-debt
number: 7
title: Future stack-neutral React preset
status: open
type: introspection-record
category: tech-debt
visibility: local-only
created_at: "2026-06-10T00:00:00Z"
updated_at: "2026-06-10T00:00:00Z"
tags: [record/tech-debt, repo/backpressure, status/open, visibility/local-only]
---
```

Nested, introspection-only blocks: `source` (discovered_at, refs), `scope` (paths), `resolution` (disposition, resolved_at, rationale), `conversion_targets` (kind, ref, rationale). V1 validates evidence *shape* only; per-kind sufficiency validators stay deferred (TD-004).

### Tech-debt record shape (mined from the governance entry schema + real backpressure entries)

Prose carrying judgment lives in required **body headings**, not frontmatter (taste-distillery's `x-required_headings` precedent); machine-filterable facts stay in frontmatter. A tech-debt record requires:

- Body headings (schema-enforced): `## Problem`, `## Why deferred`, `## Revisit trigger`; optional `## Done when`.
- Frontmatter: the base fields above plus nested `source` (`discovered_at`, `refs`, such as the original tracker anchor) and, when applicable, `conversion_targets`/`resolution` per the lifecycle rules.

WI-02 (schemas), WI-07 (record type), and WI-12 (importer) all consume this one shape; the importer maps each legacy entry's prose into the headings and its provenance into `source.refs`.

### `RecordType` contract (static registry, no runtime loading)

```ts
interface RecordType<Frontmatter> {
  key: Frontmatter['record_type']
  idPrefix: string
  schema: JsonSchemaDocument
  lifecycle: LifecycleDefinition
  derivedTags(record, context): ReadonlyArray<string>
  validate(record, context): ReadonlyArray<Finding>
  summarizeForPrime(record, context): PrimeSummary
  projectForExport(record, context): ExportDocument
}
```

This mirrors the committed interface (`src/core/record-type.ts:138-147`): all four methods take a `ValidationContext` carrying `repoKey`/`repoSlug`/`recordsRoot` as optional fields. The invariant that closes the gap between optional fields and mandatory derived tags: when a context field a derived tag needs is missing (such as `repoSlug` for `repo/<slug>`), validation emits a finding; the tag is never silently omitted.

Registered in `src/record-types/registry.ts`; the conversion fixture registers only in tests and exists solely to force the contract to model conversion semantics before the interface is treated as stable.

### Ports, seams, and invariants (from the seed's ports-not-paper-seams decision)

- **Real ports** (interfaces with contract tests; ≥1 real + 1 trivial proving impl each): `RecordType` registry (tech-debt real + conversion fixture proving); retrieval/export adapters (GNO exporter real + `none`/JSON proving); `prime` selector (deterministic selector real + trivial fixed-order selector proving, test-only); output presenters (human + JSON, two real impls prove the port).
- **Internal seams** (modules for testability, not public ports): markdown record store, ID allocator, config loader, and **clock**, an injectable time source so `prime` ranking (`updated_at`) and lifecycle stamps (`resolved_at`) are deterministic under test.
- **Fixed invariants** (never pluggable): markdown source of truth; schema and lifecycle validation; vocabulary integrity; judgment-stays-in-adopter-prose.

### Bootstrap stack (canon pass + user calls, 2026-06-10)

Card IDs reference the taste-distillery canon (see Background: Stack canon).

- **Runtime + package manager:** pnpm 11 with Corepack-pinned `packageManager`, `engines.node >=24` (TD-CARD-005, TD-BASELINE-002); `mise.toml` pins repo-local tools (TD-CARD-002).
- **Supply chain hardening (user call: on par with backpressure and claude-toolkit):** introspection adopts the MP hardening posture; its own `pnpm-workspace.yaml` plus `docs/references/supply-chain.md` are the live authority, and the baseline set is: `catalogMode: strict`, `cleanupUnusedCatalogs: true`, `blockExoticSubdeps: true`, `minimumReleaseAge: 10080`, `minimumReleaseAgeStrict: true`, `minimumReleaseAgeIgnoreMissingTime: false`, `strictDepBuilds: true`, `dangerouslyAllowAllBuilds: false` with explicit `onlyBuiltDependencies`, `trustPolicy: no-downgrade`, `verifyDepsBeforeRun: warn`, `packageManagerStrictVersion: true`. Consequence to accept: the pinned Effect 4 beta must be at least 7 days old at install time, so pick pins that have already aged past the window (that is the protection working as intended). The scaffold's `trustPolicyExclude` exact-version pins for the Effect beta packages are the sanctioned escape hatch on introspection's own side; they are distinct from the `minimumReleaseAgeExclude` decision backpressure faces at WI-19.
- **TypeScript:** strict via consuming `@mplibunao/tsconfig` (TD-CARD-006; the canon prescribes the published presets), extended locally where the CLI needs it.
- **Lint/format:** oxlint via `@mplibunao/oxlint-standards` (TD-CARD-008; the canon prescribes the published rule set) with the hard-ceiling thresholds as errors; oxfmt as the formatter, shipped inside vite-plus (TD-CARD-036, t3code precedent).
- **Check front door:** `check: vite-plus check` in package.json (TD-CARD-007), mirroring backpressure's `pnpm check` chain shape.
- **Tests + build:** Vitest + `@effect/vitest` (TD-CARD-010); authored repo scripts run on Bun (TD-CARD-035); build via tsdown with a shebang banner (t3code precedent). tsdown is its own dependency, not part of vite-plus 0.1.x, and is chosen because a published CLI ships one bundled bin with inlined deps; backpressure's config packages need only `tsc -b`, so it has no bundler. Runtime (user call, 2026-06-11, superseding the earlier Node-floor framing): the shipped bin is bun-first. The tsdown banner becomes `#!/usr/bin/env bun`, engines pin bun next to node (backpressure posture), CI provides bun through the mise pin, and adoption docs name bun as a requirement; every current adopter already carries it (backpressure pins bun in engines, GNO requires bun). Vitest + `@effect/vitest` stays the runner on purpose: it is Effect's only first-class test integration, and WI-20's Stryker pairing has no bun-test runner. Platform wiring (settled 2026-06-11): the bin entrypoint uses `@effect/platform-bun`. Domain code depends only on abstract platform services and node-compat APIs, which bun implements natively, so vitest tests provide node-flavored layers of the same services. The platform package is an entrypoint concern, not a code dialect, and the ports architecture keeps it swappable.
- **Prose gate:** repo-local Vale per TD-CARD-013: `.vale.ini` with `StylesPath = styles` and an `introspection` style dir, hash-gated `scripts/setup-vale.sh` sync, gate runs `vale --no-global --minAlertLevel=error` over tracked markdown, excluding the `AGENTS.md` symlink and `prompt-exports/**`.
- **Code discipline + structural rules:** the Effect discipline cards govern the CLI's own source (TD-CARD-001 effect-first boundaries, TD-CARD-023 service boundaries and observability, TD-CARD-024 code discipline); test seams stay few and strong (TD-CARD-003); the injectable clock seam is that card in practice; ast-grep structural rules (TD-CARD-009, TD-BASELINE-005) land alongside the invariants they guard, not as empty scaffolding.
- **CI:** one reproducible gate (TD-CARD-017, TD-BASELINE-001): CI installs mise frozen, caches Vale styles, and runs the same check the repo runs locally; every docs dir carries an `index.md` (TD-CARD-014 convention).
- **Repo + branch protection:** the GitHub repo is public. On creation, apply the tool-owned `claude-toolkit branch-protection baseline` ruleset via the `github-ops` skill (`repo.protection.apply`, then `repo.protection.verify`): PR-before-merge with zero required approvals, the repo's named CI check contexts required, force-pushes and deletion blocked, repo-admin always-bypass (TD-CARD-037; recipe in `claude-toolkit/.claude/skills/github-ops/references/branch-protection-baseline.md`). This is the safety boundary the WI-19 auto-publish flow leans on (TD-CARD-034 moved release safety onto branch protection plus CI).
- **Mutation testing (user call: as in backpressure v1):** Stryker with the Vitest runner runs over the record kernel near the end of the build (WI-20) so the tests get stronger before the dogfood gate; reports land under `docs/reports/mutation/` (backpressure precedent; canon baseline `typescript-testing-and-mutation`, TD-BASELINE-006).
- **Release plumbing from day one:** `.changeset/` scaffold + `CHANGELOG.md` (TD-CARD-015). Publishing itself waits for WI-19 and follows TD-CARD-034 (Trusted Publishing OIDC + provenance, no token secrets, fail-closed pre-publish gate) with artifact validation per TD-CARD-018 (pack, install the tarball, import smoke). Distribution shape (user call, 2026-06-11): per-platform compiled binaries through npm, the same pattern oxlint/Biome/esbuild use. `bun build --compile` consumes the tsdown bundle per target (initial set: darwin-arm64, linux-x64, linux-arm64); each platform package sets `os`/`cpu` and rides as an `optionalDependency` of the main package, whose thin launcher resolves the matching binary and falls back to running the JS bundle on host bun when none matches. No postinstall downloads: those collide with the `strictDepBuilds` posture adopting repos run. A compiled binary also pins the bun runtime inside the artifact, so adopter-side runtime drift disappears.

### Verification gate map

| Gate | Work items | Concrete evidence |
|---|---|---|
| Backpressure migration | WI-12, WI-14, WI-15 | Import report covers TD-001..TD-011 with explicit dispositions; old tracker is pointer-only; backpressure `pnpm check` passes. |
| Lifecycle evidence | WI-03, WI-06, WI-07, WI-09, WI-15 | Tests reject terminal states lacking rationale/evidence (via the `record transition` command path); migrated archive records validate. |
| Concurrency | WI-05, WI-15 | Two separate OS processes cannot allocate the same ID (two promises in one process do not count); duplicate fixture fails `check`; repair test passes. |
| Prime bounded | WI-10, WI-15 | Default limit + omitted counts proven; terminal records excluded by default. |
| Export recreatable | WI-11, WI-15 | Delete generated export → rerun → identical logical content. |
| Boundary no-GNO | WI-11, WI-15 | Check, transitions, and deterministic prime pass with GNO absent. |
| Contract fixture | WI-03 | Conversion fixture proves `conversion_targets` semantics before contract freeze. |
| Vocabulary | WI-08, WI-15 | Rename/merge/delete cascade only record tags; no code path mutates arbitrary repo markdown. |

## Work Items

### WI-01: Bootstrap the introspection repo scaffold
**Status:** Complete on 2026-06-11. Local scaffold committed as `0642e3b` (`feat: scaffold introspection workspace`), public GitHub repo created at `https://github.com/mplibunao/introspection`, `main` and `bootstrap/introspection-v1` pushed, and `repo.protection.verify` returned `status: clean` for the `claude-toolkit branch-protection baseline` ruleset on `main` with required check `Check`.
**Goal:** Create the project shell for the new CLI repo, per the Bootstrap stack section.
**Done when:** `CLAUDE.md` (router) exists with `AGENTS.md` symlink; pnpm 11 + Corepack `packageManager` pin, `engines.node >=24`, and `mise.toml` exist; `pnpm-workspace.yaml` carries the full supply chain hardening block from the Bootstrap stack section; `@mplibunao/tsconfig` and `@mplibunao/oxlint-standards` are consumed; `check` runs through `vite-plus check`; test/build/prose commands exist (Vitest + `@effect/vitest`, tsdown, repo-local Vale with `setup-vale.sh`); `.changeset/` + `CHANGELOG.md` scaffolded; a CI workflow installs mise frozen, caches Vale, and runs the same gate as local (TD-CARD-017); `src/`, `test/`, `schemas/`, docs directories exist with `index.md` coverage; the public GitHub repo is created and `main` pushed (as of 2026-06-11 only local `git init` exists, no remote), then the TD-CARD-037 branch-protection ruleset applied and verified via the claude-toolkit `github-ops` skill, after the CI workflow lands so the ruleset's named check contexts exist.
**Key files:** `CLAUDE.md`, `AGENTS.md`, `package.json`, `pnpm-workspace.yaml`, `mise.toml`, `tsconfig.json`, `.vale.ini`, `scripts/setup-vale.sh`, `.changeset/config.json`, `CHANGELOG.md`, `.github/workflows/ci.yml`, `.gitignore`.
**Cooldown constraint:** the hardening's `minimumReleaseAge` governs introspection's own installs from day one: every pinned dep, including the Effect 4 beta, must already be 7+ days old or `pnpm install` fails here at WI-01. Verify pin ages first; a documented scoped `minimumReleaseAgeExclude` entry is the explicit escape hatch if a needed pin is younger.
**Dependencies:** none. **Size:** M

### WI-02: Define schemas, config, and canonical record layout
**Status:** Complete on 2026-06-11. Committed as `270fdee` (`feat: define record schema contracts`). Verification passed: `corepack pnpm install --frozen-lockfile`, targeted schema contract tests, `corepack pnpm prose`, and `corepack pnpm check`. Review and refactor gates reported no remaining blockers or should-fix issues.
**Phase-entry note:** When adding first-class schema/source-of-truth docs, update the WI-01 prose gate per TD-016 so new authored docs are covered while imported provenance remains explicitly excluded.
**Goal:** Lock the file formats and validation contracts.
**Done when:** JSON Schemas exist for base record frontmatter, tech-debt frontmatter (incl. required body headings), config TOML, vocabulary TOML, and export manifest; the `.introspection/` + records-root layout documented; flat-vs-nested frontmatter split documented.
**Key files:** `schemas/base-record.schema.json`, `schemas/tech-debt-record.schema.json`, `schemas/config.schema.json`, `schemas/vocabulary.schema.json`, `docs/source-of-truth-boundaries.md`.
**Dependencies:** WI-01. **Size:** M

### WI-03: Implement the `RecordType` contract and conversion fixture
**Status:** Complete on 2026-06-11. Committed as `fadfd82` (`feat: add record type contract`). Verification passed: targeted record-type contract tests and `corepack pnpm check`. Review and refactor gates reported no remaining blockers or should-fix issues.
**Phase-entry note:** TD-015 was resolved on 2026-06-11 by upgrading `tsdown` to 0.22.1 while keeping `typescript` at 6.0.2; `pnpm peers check` now passes with no peer-policy exception.
**Goal:** Prove the engine contract supports conversion lifecycles, not only tech-debt open/closed.
**Done when:** static registry exists; tech-debt placeholder registered; test-only conversion fixture registered in tests; contract tests prove a terminal conversion without `conversion_targets` fails.
**Contract note:** consult the real backpressure entries (Background) and the mined tech-debt record shape when freezing the contract. A post-WI-12 contract revision is acceptable and cheap because the fixture + contract tests make it so; don't over-freeze against imagined data.
**Key files:** `src/core/record-type.ts`, `src/record-types/registry.ts`, `src/record-types/tech-debt.ts`, `test/fixtures/conversion-fixture.ts`, `test/core/record-type-contract.test.ts`.
**Dependencies:** WI-02. **Size:** M. *Contract gate*

### WI-04: Build markdown record store, parser, and atomic writer
**Status:** Complete on 2026-06-11. Committed as `d6a451e` (`feat: add markdown record store`). Verification passed: targeted store tests and `corepack pnpm check`. Review and refactor gates reported no remaining blockers or should-fix issues.
**Goal:** Safe filesystem mechanics for markdown source records.
**Done when:** store lists/reads/creates/updates/moves/archives records; create-only writes use the Decision #3 no-clobber primitive on the final target (check-absence-then-rename is insufficient across processes); updates use temp-file + rename and abort on stale hash per the Decision #3 semantics (raw bytes hashed at read, re-verified immediately before rename); a non-throwing read path exists for `check` (malformed frontmatter or unreadable files become per-file findings instead of aborting the corpus scan); a single-process create-collision test proves the no-clobber semantics here, with the two-process simulation living at WI-05; the store consumes a resolved records-root path rather than performing repo discovery (that is WI-21's job), so WI-04 stays independent of WI-21; tests cover malformed frontmatter and missing required fields.
**Key files:** `src/store/markdown-record-store.ts`, `src/store/frontmatter.ts`, `src/core/errors.ts`, `test/store/markdown-record-store.test.ts`.
**Dependencies:** WI-03. **Size:** M

### WI-05: Build ID allocator and duplicate repair workflow
**Status:** Complete on 2026-06-12. Committed as `43f2518` (`feat: add ID allocation and repair`). Verification passed: targeted WI-05 allocator/repair/worker tests and `corepack pnpm check`. Review and refactor gates reported no remaining blockers or should-fix issues after targeted lock-protocol fixes for stale reclaim, crash-recoverable admin locking, and owner-safe release.
**Goal:** Make `(repo, key, number)` safe under same-worktree concurrency and repairable after branch merges.
**Done when:** allocator follows the Decision #3 lock contract (crash-recoverable lock; scan+allocate+create inside it, with the no-clobber final-target create); duplicate IDs fail validation; the repair service renumbers one duplicate and updates structured refs per Decision #3 (CLI wiring lands at WI-09); concurrent-allocation simulation with two separate processes proves no duplicates in one worktree; stale-lock reclaim is tested.
**Key files:** `src/core/id.ts`, `src/store/id-allocator.ts`, `test/store/id-allocator.test.ts`, repair-service tests.
**Dependencies:** WI-04, WI-21. **Size:** M. *Concurrency gate*

### WI-06: Build lifecycle and validation engine
**Status:** Complete on 2026-06-12. Committed as `4b1d99b` (`feat: add lifecycle validation engine`). Verification passed: targeted lifecycle/validation tests and `corepack pnpm check`. Review and refactor gates reported no remaining blockers, should-fix issues, or optional nits after report-surface cleanup and `correctedMachineTags()` incomplete-context hardening.
**Goal:** Enforce schema, lifecycle, terminal evidence, links, visibility, and tag invariants.
**Done when:** the check service validates all records (CLI wiring lands at WI-09); it consumes the WI-04 non-throwing read path, so one malformed file becomes a finding rather than aborting the scan; terminal transitions without rationale/evidence fail; unsupported `schema_version` fails with a migration-needed finding; machine-derived tags are enforced as invariants (derived tags are a mandatory subset of `tags`; the namespaces `record/*`, `repo/*`, `status/*`, `visibility/*` are machine-owned; a stale machine-owned tag such as `status/open` on a `done` record fails; automated fix operations such as `check --fix` may rewrite only machine-owned tags, while WI-08 vocabulary rename/merge legitimately rewrites approved vocabulary tags through its own cascade path); a missing `ValidationContext` field needed by a derived tag is itself a finding, never a silent omission; output is remediation-first and supports `--json`.
**Key files:** `src/core/validation.ts`, `src/core/lifecycle.ts`, `test/core/lifecycle.test.ts`, check-service tests.
**Dependencies:** WI-03, WI-04, WI-05, WI-21. **Size:** L. *Lifecycle gate*

### WI-07: Implement tech-debt record type
**Status:** Complete on 2026-06-12. Committed as `a3bf467` (`feat: implement tech debt record type`). Verification passed: targeted tech-debt/lifecycle/validation/contract/schema tests and `corepack pnpm check`. Review and refactor gates reported no remaining blockers, should-fix issues, or substantive optional nits after the active-resolution lifecycle invariant, heading metadata alignment coverage, fenced-code heading hardening, and source-of-truth boundary wording update.
**Goal:** Ship the first public record type.
**Done when:** tech-debt schema enforces the tech-debt record shape (required body headings `## Problem`, `## Why deferred`, `## Revisit trigger`, optional `## Done when`; frontmatter `source` refs; owner/conversion links per the lifecycle rules); lifecycle transitions enforced; derived tags include `record/tech-debt`, `repo/<slug>`, `status/<state>`, `visibility/<value>`; prime summary + export projection exist.
**Key files:** `src/record-types/tech-debt.ts`, `schemas/tech-debt-record.schema.json`, `test/record-types/tech-debt.test.ts`.
**Dependencies:** WI-06. **Size:** M

### WI-08: Implement record-local vocabulary service
**Status:** Complete on 2026-06-12. Committed as `1143190` (`feat: add vocabulary service`). Verification passed: targeted vocabulary/validation/ID-lock tests and `corepack pnpm check`. Review and refactor gates reported no remaining blockers or should-fix issues after rejected-alias remediation, generic local-lock extraction, domain-owned vocabulary errors, and read-vs-mutation context cleanup. Non-cooperating manual edits to `.introspection/vocabulary.toml` during an active service mutation are outside WI-08's lock model; validation is the safety net afterward.
**Goal:** Prove controlled-vocabulary mechanics safely on introspection-owned records only.
**Done when:** propose/approve/reject/list/usage/rename/merge/delete exist as services (CLI wiring lands at WI-09); rename/merge cascade only under the configured records root (`docs/records/**` by default); unknown raw tags fail with remediation; no operation mutates markdown outside the records root.
**Key files:** `src/core/tags.ts`, `src/core/vocabulary.ts`, `schemas/vocabulary.schema.json`, `test/core/vocabulary.test.ts`.
**Dependencies:** WI-06, WI-07. **Size:** L. *Vocabulary gate*

### WI-09: Implement CLI command shell and presenters
**Status:** Complete on 2026-06-12. Committed as `efeb24b` (`feat: add CLI command shell`). Verification passed: targeted in-process CLI/vocabulary tests and `corepack pnpm check` with 111 tests. Review and refactor gates reported no remaining blockers or should-fix issues after full candidate validation before record writes, transition collision preflight, vocabulary schema validation before persistence, stable CLI error codes, and JSON parse coverage. Optional future CLI-hardening remains: reject unknown flags per command, define JSON behavior for help output, replace the parser's string sentinel for valueless flags if needed, and consider a store-level update-and-move primitive if transition atomicity under races becomes a requirement.
**Goal:** The agent-facing machine interface.
**Done when:** all `src/commands/*` modules land here, wiring the WI-05/WI-06/WI-08 services: CLI has `check`, `record create`, **`record transition`** (the named deliverable the Lifecycle gate runs through), `ids`, and `vocab` groups (`prime` and `export` commands land with WI-10/WI-11 respectively); earlier WIs ship services only; human and JSON presenters are separate from domain logic (module layout is the implementer's); CLI tests run in-process (no subprocess); `--json` emits parseable JSON with no prose.
**Key files:** `src/bin.ts`, `src/commands/*.ts`, `src/presenters/`, `test/cli/bin.test.ts`.
**Dependencies:** WI-06, WI-08. **Size:** M

### WI-10: Implement deterministic `prime`
**Status:** Complete on 2026-06-12. Committed as `fba5130` (`feat: add deterministic prime`). Verification passed: targeted selector/command tests and `corepack pnpm check` with 120 tests. Review and refactor gates reported no remaining blockers or should-fix issues after value-required prime flags rejected valueless usage. Optional future CLI/prime hardening remains: tighten `prime --path` matching if dogfood shows substring matching is too broad; centralize value-required flag validation instead of command-local checks that know the parser sentinel; add CLI regression coverage for invalid `[prime] default_limit/hard_limit` config; clarify that `prime --all` means all lifecycle statuses within the current repo.
**Goal:** The universal context primitive, zero-GNO.
**Done when:** default `prime` scopes to current repo + active records; output bounded with omitted counts; flags per the Approach table; tests prove terminal records excluded by default; ranking tests use the injectable clock seam for determinism.
**Key files:** `src/core/prime-selector.ts`, `src/commands/prime.ts`, `test/core/prime-selector.test.ts`, `test/commands/prime.test.ts`.
**Dependencies:** WI-09, WI-21 (cwd-based repo discovery comes from the config loader). **Size:** M. *Prime gate*

### WI-11: Implement export model and adapters
**Status:** Complete on 2026-06-12. Committed as `16d4844` (`feat: add export adapters`). Verification passed: targeted export/retrieval/no-GNO tests and `corepack pnpm check` with 133 tests. Review and refactor gates reported no remaining blockers or should-fix issues after GNO projection path/collision hardening, default generated-root symlink safety, artifact symlink cleanup, and records-root data-loss guards including symlink variants. Optional future export hardening remains: add CLI edge tests for `--format gno`, invalid/valueless export flags, and explicit external `--dest`; extract default-destination safety helpers if export grows; decide whether JSON export hashes belong in the manifest or should be removed from the writer result.
**Goal:** Keep generated views disposable and GNO-specific concerns out of the core.
**Done when:** neutral `ExportDocument` model exists; JSON export writes records + manifest; GNO export writes a GNO-compatible markdown projection; delete-and-recreate yields identical logical content; core validation/lifecycle/prime pass with GNO absent; exports are local artifacts that carry each record's `visibility` field, write only under `.introspection/generated/` unless an explicit destination is passed, and no v1 command claims a public or publish-safe export (that policy stays behind TD-014); the `RetrievalProvider` port also lands here with contract tests, a deterministic proving impl, and the GNO retrieval adapter exercised in tests only, since no core path consumes retrieval in v1 (Decision #6).
**Key files:** `src/export/export-document.ts`, `src/export/json-exporter.ts`, `src/export/gno-exporter.ts`, `src/commands/export.ts`, `test/export/export-recreate.test.ts`, `test/export/boundary-no-gno.test.ts`.
**Dependencies:** WI-09 (export needs neither `prime` nor its selector; runs parallel to WI-10). **Size:** M. *Export gate + Boundary gate*

### WI-12: Build backpressure tracker importer
**Status:** Complete on 2026-06-12. Committed as `56c18e8` (`feat: add backpressure tracker importer`). Verification passed: targeted importer tests and `corepack pnpm check` with 140 tests. Review and refactor gates reported no remaining blockers or should-fix issues; optional reusable-importer hardening remains deferred to WI-14/future reuse: duplicate legacy-ID detection, all-target preflight before writes, rendered legacy-gap report line, and fixture drift protection by running against the real tracker during adoption.
**Goal:** Convert the existing backpressure tracker into typed records with explicit dispositions.
**Done when:** importer parses TD-001..TD-011; creates active records for TD-007/008/009/010/011 and terminal records for TD-001/002/003/004/006 per the disposition table below; preserves legacy numbers (BP-TD-007 keeps number 7) so the allocator resumes at `max+1`; corrects TD-011's stale ref to `docs/exec-plans/completed/bun-runtime-migration-2026-06-07.md`; import report lists every original TD ID and disposition.

| Legacy entry | Status | Rationale | Evidence ref |
|---|---|---|---|
| TD-001 executor-coupled rules | `rejected` | Tied to executor's application boundaries, not general package material (MP cleanup ruling, 2026-06-01). | original tracker anchor in `source.refs` |
| TD-002 package split triggers | `superseded` | Split-trigger policy is owned by the package/preset design docs. | `docs/design-docs/preset-architecture.md` |
| TD-003 general/boundaries preset growth | `superseded` | Growth criteria are owned by rule intake. | `docs/design-docs/rule-intake.md` |
| TD-004 ESLint RuleTester cross-check | `rejected` | Oxlint-only direction is settled; the portability cross-check was not pursued. | original tracker anchor in `source.refs` |
| TD-006 optional hygiene gates | `superseded` | Earn-the-gate candidates are rule intake's job. During WI-14, add the two named rule candidates (`no-js-extension-imports`, `no-opaque-instance-fields`; reference impls in effect-smol `@effect/oxc`) to `rule-intake.md` if absent. | `docs/design-docs/rule-intake.md` |
**Key files:** `src/importers/backpressure-tech-debt.ts`, `test/importers/backpressure-tech-debt.test.ts`, `test/fixtures/backpressure-tech-debt-tracker.md`.
**Dependencies:** WI-05, WI-06, WI-07 (needs store/IDs/validation/record-type only; runs parallel to WI-10/WI-11). **Size:** M

### WI-13: Package the CLI for adoption
**Status:** Complete on 2026-06-12. Committed as `77780d0` (`feat: package bun CLI`). Verification passed: launcher tests, real packed-tarball smoke for native platform and Bun JS fallback installs, recursive pack dry-run for main plus platform packages, and `corepack pnpm check` with 143 tests. Review and refactor gates reported no remaining blockers or should-fix issues after adding the real packed install smoke, packing `docs/adoption.md`, and static launcher/platform consistency coverage. Optional future packaging hardening remains: centralize repeated platform metadata if more platforms are added, and refine WI-14 local adoption docs if backpressure dependency resolution surfaces friction.
**Phase-entry note:** Resolve TD-016 before packaging: remove placeholder version drift, document or consolidate test include duplication, and make the prose gate durable enough for post-scaffold docs. During the CLI-only package-surface cutover, also remove or internalize WI-08's temporary library exports and simplify vocabulary read-context shape if it still carries mutation-only fields.
**Goal:** Make `introspection` consumable by backpressure checks locally, without publishing.
**Done when:** the WI-01 scaffold's runtime drift is resolved first (engines gain the bun pin, `tsdown.config.ts` banner becomes `#!/usr/bin/env bun`, `CLAUDE.md` tooling posture names bun as the shipped-bin and script runtime with node retained for the TS toolchain); the package is CLI-only per Decision #10 (all runtime deps bundled; the current library-style exports are removed or marked internal); package exports a bin named `introspection`; `bun build --compile` emits the per-platform binaries from the tsdown bundle (darwin-arm64, linux-x64, linux-arm64) as platform packages (`@mplibunao/introspection-<platform>`) with `os`/`cpu` fields, wired as `optionalDependencies` of the main package whose bin becomes a thin launcher (resolution order: matching platform binary, then JS bundle on host bun, then an actionable error); `pnpm pack` dry-run proves package contents for every package; the packed tarball installs into a throwaway project and a real command runs there under bun, exercising YAML parsing and schema validation, plus once with no platform package present to prove the JS fallback (TD-CARD-018 artifact smoke); adoption docs cover the local-link dogfood path, the bun requirement, and the strict-cooldown publishing guidance for later.
**Key files:** `package.json`, `tsdown.config.ts`, platform package manifests, `docs/adoption.md`.
**Dependencies:** WI-10, WI-11. **Size:** M

### WI-14: Adopt introspection in backpressure
**Status:** Complete on 2026-06-12. Backpressure branch `adopt/introspection-v1` committed as `c2c7ceb` (`feat: adopt introspection records`) and pushed. Verification passed: importer ran against the real tracker into an empty records root, `pnpm introspection:check` checked 10 records, `introspection prime --json` showed 5 open records with terminal records excluded, the old tracker pointer audit found no `### TD-NNN` headings, and backpressure `pnpm check` passed end-to-end. Review and refactor gates reported no blockers or should-fix issues.
**Phase-entry note:** Run the WI-12 importer against the real backpressure tracker and an empty records root. If the importer is promoted beyond this one-time migration, first harden it with duplicate legacy-ID detection, all-target preflight before writes, and a human report line for preserved legacy gaps such as TD-005.
**Goal:** Wire backpressure to the new tool without keeping the old tracker active.
**Done when:** `.introspection/config.toml` + `vocabulary.toml` exist in backpressure; records generated under `docs/records/tech-debt/`; backpressure's `.gitignore` excludes `.introspection/.locks/` and `.introspection/generated/`; `docs/exec-plans/tech-debt-tracker.md` becomes a pointer stub; `CLAUDE.md` routes agents to `introspection prime`/`check`; `pnpm check` runs `introspection check` before prose; the CLI is consumed via a local link/`file:` dependency. npm publish is not required for the dogfood gate.
**Key files:** backpressure `.introspection/**`, `docs/records/**`, `docs/exec-plans/tech-debt-tracker.md`, `CLAUDE.md`, `package.json`, `pnpm-workspace.yaml`.
**Dependencies:** WI-12, WI-13. **Size:** M

### WI-15: CHECKPOINT, backpressure dogfood gate
**Status:** Complete on 2026-06-12. Verification passed on backpressure branch `adopt/introspection-v1` after WI-14 and WI-20: `introspection:check` checked 10 records; default `prime --json` returned exactly `BP-TD-007..011`, all open, with `shownRecordCount = 5`, `omittedRecordCount = 0`, `includeTerminal = false`, and effective limit 5; the legacy tracker pointer audit found no `### TD-` headings; generated exports were deleted and recreated with matching logical content after normalizing volatile `generated_at` (`a55ca088ea445831af8a56f0fe1b5defaec0acb71d29e7cea1fb34815bfd47f9`); backpressure `pnpm check` passed end-to-end; and no GNO command was required in core paths. Both repos were clean at review time. The pnpm local-link warning was observed and accepted as non-blocking because WI-14 intentionally dogfoods `file:../introspection`, every verification command exited successfully, and WI-19 owns the switch to a published catalog pin. Review and refactor/cleanup gates reported no blockers or should-fix issues.
**Goal:** Prove backpressure can use introspection as the first real customer.
**Done when:** every backpressure TD entry has an explicit disposition; no duplicate active tracker; `introspection check` passes in backpressure; `prime` bounded and terminal-excluding; export delete-and-recreate works; backpressure `pnpm check` passes end-to-end; no GNO command required anywhere in the core paths.
**Key files:** backpressure files from WI-14; verification tests from WI-03..WI-11.
**Dependencies:** WI-14, WI-20 (mutation pass complete). **Size:** S. *all 8 gates confirmed on the first customer*

### WI-16: Finalize superseded design-input disposition
**Status:** Complete on 2026-06-12. The tracker-governance design input and companion critique now carry final "MINED INTO INTROSPECTION V1" dispositions, explicitly state that the old work items/review queue are not active, and route readers to this bootstrap plan plus the WI-15 dogfood result. Verification passed: `git grep` found no `CLAUDE.md` route or active-plan treatment that makes tracker-governance active; repo prose passed; direct Vale on the two edited design-input docs passed; review and refactor/cleanup gates reported no blockers, should-fix items, or durable follow-ups.
**Goal:** Prevent the old backpressure governance plan from looking active.
**Done when:** design-input docs carry a "mined into introspection v1" disposition; no router/plan treats tracker-governance as active; links point at this plan and/or the dogfood result.
**Key files:** `docs/design-input/tracker-governance-2026-06-01.md` + companion critique doc.
**Dependencies:** WI-15. **Size:** S

### WI-17: Self-dogfood introspection's own tech-debt tracker
**Status:** Complete on 2026-06-12. Introspection now dogfoods itself with committed `.introspection/config.toml` and `.introspection/vocabulary.toml`, 14 open tech-debt records `IX-TD-001` through `IX-TD-014` under `docs/records/tech-debt/open/`, and a retired pointer stub at `docs/exec-plans/tech-debt-tracker.md`. The deferred-vs-roadmap grouping is preserved with approved `timeframe/deferred-behind-v1` and `timeframe/roadmap-post-v1` tags; `CLAUDE.md` routes agents to `introspection prime --type tech-debt` and `introspection check`; `pnpm check` now runs `introspection:check` after build; and `docs/records/index.md` was removed because every Markdown file under the records root is a record candidate. Verification passed: custom migration/provenance audit, `introspection:check` with 14 records, `prime --type tech-debt --limit 14 --json` with all 14 open records and omitted 0, repo prose, and full `pnpm check` with 169 tests. Review and refactor/cleanup gates reported no blockers, should-fix items, or accepted follow-up work.
**Goal:** Move introspection's pre-planning TD-001..TD-014 into its own record substrate.
**Done when:** introspection repo has its own `.introspection/**` config + vocabulary and `docs/records/**` records; TD-001..TD-014 migrated with deferred/roadmap status preserved; `.gitignore` excludes `.introspection/.locks/` and `.introspection/generated/`; old tracker file becomes a pointer stub; `check` + `prime` pass in this repo.
**Key files:** `/Users/mp/Projects/personal/introspection/.introspection/**`, `docs/records/**`, `docs/exec-plans/tech-debt-tracker.md`, `CLAUDE.md`.
**Dependencies:** WI-15. **Size:** S

### WI-18: Replace the global deferral instruction after dogfood
**Goal:** Fix the upstream over-persistence rule once a real tracking abstraction exists.
**Scope note:** this deliberately fires this repo's TD-007 at exactly its written trigger ("the backpressure dogfood gate passes"). It is the one tracker entry the plan consumes, not a violation of "TD-001..TD-014 stay deferred."
**Done when:** `GLOBAL_CLAUDE.md` + `GLOBAL_AGENTS.md` replace tracker-first wording with repo-tracking-system wording; new rule excludes brainstorms, rejected ideas, same-session tasks, vague maybes, duplicate owner-doc content; session-finish audit persists only accepted unresolved deferrals; toolkit-lint passes.
**Key files:** `claude-toolkit/GLOBAL_CLAUDE.md`, `claude-toolkit/GLOBAL_AGENTS.md`, toolkit lint config as needed.
**Dependencies:** WI-15. **Size:** S

### WI-19: Publish to npm and switch backpressure to the published pin
**Phase-entry note:** Make the fail-closed publish/prepublish gate run `pnpm pack:dry-run` and `pnpm pack:smoke`; consider a local-registry or post-publish canary install that proves the main package pulls the matching optional platform package automatically.
**Goal:** Move backpressure off the local link onto a published, catalog-pinned dependency.
**Done when:** `@mplibunao/introspection` and its per-platform binary packages published via the changesets flow per TD-CARD-034 (npm Trusted Publishing OIDC + provenance, no token secrets, fail-closed pre-publish gate, mirroring backpressure's release boundary); npm Trusted Publishing bindings configured for the main package and each platform package, which is MP's manual browser step; backpressure's local link replaced by a strict-catalog pin; the 7-day `minimumReleaseAge` handled with scoped `minimumReleaseAgeExclude` if backpressure's pnpm supports it, else the pin lands after the release ages past the window (platform packages age in parallel); the TD-CARD-037 ruleset re-verified active (`repo.protection.verify`) before the auto-publish path goes live, since branch protection plus CI is that flow's safety boundary; `pnpm check` still passes.
**Key files:** introspection `package.json`/`.changeset/`, backpressure `pnpm-workspace.yaml`, `package.json`.
**Dependencies:** WI-15. **Size:** S

### WI-20: Mutation-testing pass over the record kernel
**Status:** Complete on 2026-06-12. Committed as `8c0fda1` (`test: add mutation testing gate`). Verification passed: targeted mutation-driven tests, `corepack pnpm check` with 169 tests, and repo prose. Review and refactor gates reported no remaining blockers or should-fix issues after narrowing the default Stryker gate to worker-vetted targets, adding `src/core/record-type.ts` and `src/core/id.ts` evidence, documenting survivor rationales, ignoring generated Stryker artifacts, and persisting future auditability notes in the dated mutation report.
**Goal:** Strengthen the test suite with mutation testing before the dogfood gate is declared passed (numbering is not sequence; this runs before WI-15).
**Done when:** Stryker with the Vitest runner (`@stryker-mutator/core` + `@stryker-mutator/vitest-runner`, the backpressure pairing) runs over the kernel modules (store, ID allocator, lifecycle/validation, record types including tech-debt `validate`/`derivedTags`, vocabulary, prime selector, exporters); every surviving mutant is triaged, meaning it gets a killing test or a written acceptance rationale; a dated sweep report lands under `docs/reports/mutation/`; the strengthened suite still passes `check`.
**Setup (mirror backpressure):** lift `backpressure/stryker.config.mjs`'s shape: three targeting modes (`STRYKER_MUTATE` single-file worker loop, `STRYKER_SWEEP=1` full sweep, default behavioral gate with documented equivalent-survivor exclusions) and `break: null` thresholds. Mutation is an agent-run quality gate, not CI and not part of `check`. Reuse backpressure's `mutation-orchestrator`/`mutation-worker` skills for the triage loop. Mutation passes change test surface only (per the worker skill); if a survivor exposes a real kernel bug, fix it as normal work. Either way, rebuild and refresh the WI-13 pack / WI-14 link afterward so WI-15 gates against current bits.
**Key files:** `stryker.config.mjs`, `docs/reports/mutation/`, `docs/references/mutation-testing.md`, `test/**`.
**Dependencies:** WI-10, WI-11. **Size:** M

### WI-21: Config and vocabulary loaders + repo context
**Status:** Complete on 2026-06-11. Committed as `d00d34b` (`feat: add repo context loaders`). Verification passed: targeted config loader tests and `corepack pnpm check`. Review and refactor gates reported no remaining blockers or should-fix issues.
**Sequence:** numbering is not order; this runs before WI-05, which needs `repo_key`, `repo_slug`, the records root, and the lock root.
**Goal:** Own repo discovery and the committed config surface that nearly every other subsystem consumes.
**Done when:** a config loader discovers the nearest ancestor holding `.introspection/config.toml`, parses TOML with a cataloged runtime parser, validates against `schemas/config.schema.json`, and resolves the records root safely under the repo root; a vocabulary loader does the same against `schemas/vocabulary.schema.json`; a normalized repo context (repo root, config/vocab paths, `repo_key`, `repo_slug`, records root, default visibility, policy-doc pointers) is the single object downstream services consume; tests cover missing config, invalid TOML, schema violations, a records root escaping the repo root, and cwd-based discovery.
**Key files:** `src/config/`, `schemas/config.schema.json`, `schemas/vocabulary.schema.json`, `test/config/`.
**Dependencies:** WI-02. **Size:** M

## Risks

- **Effect 4 beta churn:** `effect/unstable/cli` is a beta API on a pinned build (t3code carries a local patch). Accepted deliberately at the mid-flow checkpoint to avoid a post-GA migration; mitigate with exact pins, the patch-file discipline t3code demonstrates, and in-process CLI tests that catch API drift at upgrade time.
- **Package release-age, two halves:** backpressure's side is off the dogfood critical path, since WI-14 adopts via local link and its 7-day cooldown only matters at WI-19 (publish + pin), where a scoped exemption (`minimumReleaseAgeExclude`) applies if available, else the pin waits out the window. Introspection's own side bites at WI-01: the same hardening governs its own installs, so dependency pins (including the Effect 4 beta) must already be 7+ days old or carry a documented scoped exclusion. No global installs inside `pnpm check`.
- **Branch ID collisions:** numeric IDs can collide across branches. V1 accepts this within the fixed ID model: validation makes collisions visible, and `ids repair` makes them recoverable.
- **Over-abstraction:** runtime-loaded plugins, UI, hooks, GNO-assisted prime, full-corpus tag mutation, and schema-migration tooling stay deferred (TD-001..TD-014) so v1 stays a record kernel, not a platform.
- **Hard cutover:** the old backpressure tracker becomes a pointer stub; never maintain tracker + records as two active sources.

## Open Questions

1. **`minimumReleaseAgeExclude` availability** in backpressure's pnpm: verify at WI-19 time; determines scoped exemption vs wait-out-the-window. Not a dogfood blocker (WI-14 uses a local link).

(Resolved at the mid-flow checkpoint: Effect 4 beta `unstable/cli` over stable Effect 3 + `@effect/cli`; visible records root `docs/records/` with hidden `.introspection/` config; pnpm + Corepack.)

## References

- Repo roots (all relative paths below resolve against these): introspection `/Users/mp/Projects/personal/introspection`; backpressure `/Users/mp/Projects/personal/backpressure`; taste-distillery `/Users/mp/Projects/personal/taste-distillery`; claude-toolkit `/Users/mp/Projects/personal/ai/claude-toolkit`; GNO `/Users/mp/references/ai/gno`; t3code `/Users/mp/references/effect-ts/t3code`.
- Seed: `/Users/mp/Projects/personal/introspection/docs/design-input/introspection-seed-2026-06-01.md`
- Deferrals: `/Users/mp/Projects/personal/introspection/docs/exec-plans/tech-debt-tracker.md`
- Oracle critique: `/Users/mp/Projects/personal/introspection/investigations/oracle-preplan-critique-2026-06-01.md`
- Superseded design input: `/Users/mp/Projects/personal/introspection/docs/design-input/`
- taste-distillery: `docs/plans/taste-distillery-bootstrap-2026-05-30.md`, `decisions/002-config-and-data-formats.md`, `schemas/card.schema.json`, `schemas/taxonomy.json`, `docs/gno-retrieval.md`, `docs/checker-requirements.md`
- backpressure: `CLAUDE.md`, `docs/exec-plans/tech-debt-tracker.md`, `pnpm-workspace.yaml`, `scripts/`
- GNO: `src/config/types.ts`, `src/ingestion/frontmatter.ts`, `src/ingestion/sync.ts`, `src/core/tags.ts`, `src/cli/commands/tags.ts`, `src/publish/export-service.ts`
- t3code: `apps/server/src/bin.ts`, `apps/server/src/cli/config.ts`, `apps/server/src/bin.test.ts`
- claude-toolkit: `GLOBAL_CLAUDE.md:4-5`, `docs/workflows/creating-skills.md:119-129`, `setup.sh:123-168`, `packages/ccctl/src/commands/hook.ts:94-135`
- External: [Backlog.md](https://github.com/MrLesk/Backlog.md) · [beads](https://github.com/steveyegge/beads) · [git-bug](https://github.com/git-bug/git-bug) · [git-issue](https://github.com/dspinellis/git-issue) · [Spec Kit](https://github.com/github/spec-kit) · [@effect/cli](https://www.npmjs.com/package/@effect/cli)
