# Technical debt tracker

This tracker holds accepted deferrals for future sessions or future phases. It is not a same-session task list. It records work we have consciously decided to push past v1, each with the reason it is deferred and the trigger that should bring it back. A deferral is not real until it is written here or in the relevant future-phase stub. IDs are stable; gaps mean a prior deferral was completed or removed rather than renumbered.

Two notes on scope and intent:

- Design questions that the deep plan must resolve live in `docs/design-input/introspection-seed-2026-06-01.md` under OPEN, not here. This file is for deferred build/work, not unresolved design.
- These entries are pre-planning deferrals captured during the oracle consultation on 2026-06-01 (`investigations/oracle-preplan-critique-2026-06-01.md`). They are deliberately shaped to migrate into introspection's own tech-debt records once the engine exists, so introspection becomes the first dogfood customer of its own tech-debt record type. The deep plan will extend and refine this set.

## Deferred within v1

### TD-016: Retire WI-01 placeholder duplication before packaging/adoption

WI-01 intentionally ships minimal placeholder code and explicit file lists so the scaffold can prove its toolchain without starting the record engine. Before this becomes a real package surface, remove the placeholder drift risks: make `package.json` the single version source for the CLI output or add a guard test; consolidate or document the duplicated Vitest include pattern between `vite.config.ts` and `vitest.config.ts`; and replace the hardcoded prose file list with tracked-file discovery plus explicit provenance exclusions, or update it whenever WI-02/WI-03 add first-class docs. Trigger: before WI-13 packages the CLI for adoption, and earlier for the prose-gate bullet when WI-02 adds schema/source-of-truth docs.

## Deferred behind v1

### TD-001: Full-corpus frontmatter tag mutation

Do not let v1 mutate tags across arbitrary opted-in markdown. v1 owns tags only on introspection's own record files. Full-corpus mutation needs prerequisite safety rails that do not exist yet: vocabulary operations with referential integrity (rename, merge, delete, alias, provisional terms, usage counts, cascading edits), anti-churn rules, scoped write boundaries with dry-run previews, and batch review. Without them, agents append near-synonyms because adding a tag is cheaper than learning the vocabulary, and the controlled vocab becomes an `accept.txt` graveyard once thousands of docs depend on it. Staged ramp: record-local tags (v1) then read-only corpus audit (TD-002) then scoped migrations (TD, future) then agent-proposed tagging (later). Trigger: vocabulary operations proven stable on record-local tags and the read-only audit shipped.

### TD-002: Read-only full-corpus tag audit

Report missing, invalid, or suspect tags across opted-in markdown without mutating any of it. This surfaces tag debt before we grant write access to the corpus, so we can see the shape of the problem without creating churn. Trigger: v1 record-local vocabulary mechanics shipped.

### TD-003: Record types beyond tech-debt

Mistakes, desires, and learnings ship after tech-debt. v1 builds only the tech-debt plugin publicly, plus a non-user-facing conversion-lifecycle fixture whose only job is to force the `RecordType` contract to model conversion semantics (a record is not done until it changes the environment), so the abstraction is not falsely proven by open/closed tech-debt alone. Trigger: v1 kernel and tech-debt record type dogfooded on backpressure.

### TD-004: Conversion-target validator registry

Mechanical per-kind validation that a record actually became something real: the doc path exists; the check script runs and passes; the skill carries a SKILL.md that passes toolkit-lint; the taste-distillery card ID exists; the global or repo instruction path exists and lints. v1 ships generic evidence links (`conversion_target` with kind, path-or-ref, rationale) plus the fixture only; the CLI enforces that evidence has the right shape, not whether it is sufficient. Trigger: mistakes and learnings record types land, since those need real conversion validation.

### TD-005: GNO-assisted prime

`introspection prime --query "..."` with semantic ranking on top of the deterministic selector. v1 prime is deterministic with zero GNO dependency, so the core stays portable and works on a clean machine with no index. GNO becomes one ranking signal later, never a requirement for the default prime path. Trigger: deterministic prime proven and the GNO retrieval adapter stable.

### TD-006: Schema migration command

`introspection migrate --check` and `--apply`. The `schema_version` field ships in record frontmatter from day one, but the migration tooling itself is deferred until the first breaking schema change. Records live for years, so the field must exist immediately even though the command does not. Trigger: first breaking schema change.

### TD-007: Global-instruction rewrite

Replace the reflexive tracker-first persistence rule in `claude-toolkit/GLOBAL_CLAUDE.md` and `GLOBAL_AGENTS.md` (lines 4-5), preserving the invariant (follow the repo's tracking system when one exists, otherwise raise the accepted unresolved gap to the user) and explicitly excluding brainstorms, rejected ideas, same-session tasks, and content that duplicates an owner doc. Replace, do not delete. This lands only after backpressure dogfood proves the introspection path, so the global rule points at a real abstraction rather than a not-yet-existing one. Trigger: the backpressure dogfood gate passes.

## Roadmap (post-v1, promote-when)

### TD-008: Additional retrieval and export adapters

v1 builds the neutral `RetrievalProvider` and `ExportTarget` ports with contract tests and ships the GNO adapter plus one trivial proving impl (JSON, plus a `none`/deterministic fallback) so the seam is demonstrably swappable. Further concrete adapters (SQLite or BM25-only local index, OpenSearch, Sourcegraph-style code-adjacent context) and matured capability negotiation wait for a real second consumer, because an adapter written before its consumer exists is guessing at the interface. Trigger: a second real retrieval or export consumer exists.

### TD-009: Vocabulary web UI

CRUD and approve flows for the controlled vocabulary, with the CLI opening a deeplink for batch review instead of per-term inline prompts. v1 manages vocabulary through CLI `vocab` commands only. Trigger: batch vocabulary review friction justifies a UI, which is realistically post full-corpus tagging.

### TD-010: Harness hooks beyond the CLI floor

Claude and Codex hooks that call the CLI automatically. v1 ships only the universal floor: a one-line repo instruction telling agents to run `introspection prime` when starting relevant work and to use the CLI for record transitions. Hooks are thin sugar over the CLI and own no policy, state, or retrieval. Trigger: backpressure dogfood proves the manual flow.

### TD-011: Cross-repo aggregation and portfolio dashboard

v1 is repo-local; prime and validation scope to the current repo. Cross-repo rollups and any dashboard wait until enough repos adopt introspection to make aggregation worth the surface area. Trigger: three or more repos adopt introspection.

### TD-012: Factory automation beyond the design seam

v1 guarantees only that lifecycle transitions are machine-readable and routed through one observable CLI path. Queues, daemons, ticket polling, and ticket-to-agent or ticket-to-deep-plan orchestration are deferred, because scheduler/runner architecture becomes its own product (the Symphony warning). Trigger: an explicit promote-when decision after dogfood.

### TD-013: Dynamic third-party plugin loading

v1 uses a static compiled record-type registry. Runtime-loaded external plugins bring versioning, dependency isolation, sandboxing, and API-stability problems that a personal portfolio system does not need yet. Trigger: truly external or third-party record-type consumers materialize.

### TD-014: Multi-user, productization, and richer visibility

v1 is a personal portfolio with a single `visibility: local-only` frontmatter field plus a repo-level default, enough to stop accidental "everything is publishable" assumptions given GNO has publish paths. A full export-policy, redaction, permissions, or multi-user layer is deferred. Trigger: a productization decision or a need to publish records externally.
