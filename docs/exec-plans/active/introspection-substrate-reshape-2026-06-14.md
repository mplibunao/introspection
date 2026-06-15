# introspection substrate reshape: Effect-native governed-knowledge substrate

> **Revision status:** active executable plan.
>
> This revision supersedes the stopped plain-TypeScript substrate reshape spec ([`introspection-v1-reshape-2026-06-13.md`](./introspection-v1-reshape-2026-06-13.md)) and its ledger ([`reshape-progress-ledger.md`](./reshape-progress-ledger.md)). The direction is now a hard cutover to an **Effect-native TypeScript CLI** and a **domain-agnostic manifest engine**. This plan writes no code. Disposition of the superseded files is IX-SR-00, not a silent move.

## Goal

Cut over `introspection` from a mostly plain-TypeScript, tech-debt-centered record CLI into an **Effect-native governed-knowledge substrate**.

A host repo must explicitly opt in to every record/document type it wants the CLI to manage. `tech-debt` becomes a shipped opt-in preset compiled by the same manifest engine as custom types. `taste-distillery` becomes a domain layer on top of the substrate, not a special case in the substrate core.

The target shape is:

- Effect-native CLI runtime, commands, services, typed errors, and tests.
- Explicit per-repo type declarations; no implicit default record type.
- Manifest-compiled type engine with shipped presets and custom manifests.
- Per-type identity and layout strategies.
- Generic checker passes for schema, lifecycle, headings, identity, relationships, links, anchors, coverage, artifacts, and registry mirrors.
- First-party extension hooks only where behavior is not data-expressible.
- Stable-ID resolver floor with pluggable renderers.
- GNO as downstream retrieval/export only.
- Hard cutover with lockstep adopter updates.

## Non-goals

- Do not build a web UI, static site, query server, or GNO-backed validation path in this plan. The human-facing renderers (a TUI and a local vite SPA) are the planned **next initiative** on top of the render-data interface this plan ships; they are out of scope here.
- Do not load arbitrary repo-local JavaScript/TypeScript plugins.
- Do not preserve backward-compatible config defaults after the cutover completes.
- Do not flatten taste-distillery into generic docs.
- Do not make taste-specific semantics generic substrate policy.
- Do not keep the old Go checker and introspection as permanent parallel authorities in taste-distillery.

## Fixed decisions

These are not open to relitigation:

1. **Effect-native rewrite.** The rewrite rebuilds the core rather than wrapping the current async functions.
2. **Domain-agnostic manifest engine.** Substrate mechanics are manifest-driven. Taste meaning stays in taste.
3. **Explicit opt-in type API.** A repo with no declared types has no managed types. `tech-debt` is no longer implicit. (Config v2 ships additively so existing adopters stay green during the migration; the transitional default is removed at the lockstep cutover, IX-SR-15.)
4. **Shipped opt-in presets.** `tech-debt` ships as a preset and is enabled through config and `init --with`.
5. **Per-type layout strategy.** Directory-status layout remains a supported strategy, not a global assumption.
6. **One continuous ordered plan.** Work proceeds through the ordered IX-SR items below in this cycle; nothing is phase-gated to a later initiative except the human-facing UI renderers.
7. **Interim taste coexistence.** Taste records coexist with the current Go checker by excluding the introspection records path from `check-docs` until the substrate cutover.
8. **Resolver floor with pluggable renderers.** Resolve IDs to render data first; the TUI/SPA renderers are the next initiative.
9. **GNO downstream only.** Check, CI, source-of-truth validation, and resolver do not depend on GNO.
10. **npm release folded in.** Published adoption is part of this plan, not a separate thread.
11. **Old-plan disposition.** Superseded reshape/bootstrap plan state is moved out of the active queue.
12. **Per-repo identity and per-worktree resolution.** IDs are resolved against the current repo checkout unless explicitly scoped; worktrees of one repo share `repo_key` and IDs by design and are never aggregated as distinct.
13. **Directory-status layout and hard cutover.** Tech-debt keeps directory-status layout; behavior changes cut over without compatibility shims once the migration completes.

## Resolved architecture

### Service and Layer decomposition

The CLI is rebuilt around Effect services and Layers.

Runtime entrypoint:

- `src/bin.ts` becomes a Bun runtime entrypoint using `@effect/platform-bun` and `BunRuntime.runMain`.
- The CLI root is built with `effect/unstable/cli` using `Command.make` and `Command.withSubcommands`.
- Tests use `Command.runWith`, `TestConsole`, and node-compatible/test Layers, matching the `t3code` reference pattern.

Core services:

| Service | Responsibility |
| --- | --- |
| `RepoConfig` / `ConfigService` | Discover `.introspection/config.toml`, decode config, resolve safe repo paths, expose repo context. |
| `SchemaValidation` | Own Effect Schema validation/decoding for config, manifests, frontmatter, and internal models; derive JSON Schema artifacts (`JSONSchema.make`) for editor autocomplete and future UI forms. |
| `PresetCatalog` | Expose shipped manifests such as `preset:tech-debt`. |
| `RecordTypeManifestLoader` | Load custom and preset manifests with repo-safe path handling. |
| `ManifestCompiler` | Compile declarative manifests into executable type definitions. |
| `RecordTypeRegistry` | Compose declared types only; no implicit defaults. |
| `LayoutResolver` | Match type layout strategies, classify paths, compute canonical paths, and validate path invariants. |
| `RecordStore` | Read/write markdown and directory-backed records through platform filesystem services. |
| `LocalLock` / `IdAllocator` | Allocate IDs under per-type/per-identity locks. |
| `Checker` | Run per-record, corpus, document, and extension validation passes. |
| `Resolver` | Build ID/alias/reference indexes for the current worktree. |
| `RendererRegistry` | Render resolver data as JSON, markdown links, or future renderer outputs. |
| `ImportService` | Import agent-authored manifests into compiled types. |
| `ExportService` | Export JSON and GNO projections from compiled types. |
| `Presenter` / `Output` | Produce stable human and JSON command output. |

Mechanical guardrails should prevent agents from bypassing the service graph:

- No direct filesystem access outside platform/store/config modules.
- No `process.cwd()` outside repo discovery and CLI entrypoint wiring.
- No `new Date()` outside `Clock`.
- No `throw new Error` in domain services; use typed Effect errors.
- No imports from `src/commands/*` into core/services.
- No loading of arbitrary repo-local plugins.

### Validation boundary

**Effect Schema is the single validation engine.** AJV and runtime JSON Schema validation are dropped (bundle weight plus a second error path). One engine validates config, record frontmatter, TOML manifest metadata, import/export manifests, custom type manifests, CLI flags, compiled manifest models, typed command payloads, and render-data contracts.

Host-authored types stay **data, not code**: a type manifest declares its fields as data (name, kind, enum/pattern/array constraints), and `ManifestCompiler` compiles that field-spec into an Effect Schema at load. Hosts never write TypeScript.

Portability is preserved as a **generated output, not a runtime dependency**: introspection derives standard `*.schema.json` artifacts from the Effect Schemas (`JSONSchema.make`), so editors keep autocomplete/validation on config and manifest files (and frontmatter where the editor supports it), and the next-initiative UI can drive forms from the same artifacts.

The checker boundary is:

- Parse/decode raw files.
- Decode raw metadata through the type's compiled Effect Schema (validation and decode in one pass).
- Run generic substrate invariants.
- Run allowlisted first-party extension hooks.
- Emit stable findings with code, severity, location, source type, and remediation.

### Manifest compiler

A type manifest compiles into the internal type contract. The manifest may declare:

- `key`, `title`, `surface`, and category.
- Metadata source: markdown frontmatter, TOML manifest, or directory-backed manifest.
- JSON Schema path or shipped schema reference.
- Lifecycle statuses, status kinds, transitions, and evidence requirements.
- Identity strategy.
- Layout strategy.
- Required/optional body headings.
- Generic tag derivation covering fixed tags and field facets, plus any extra tag arrays.
- Relationship fields and target constraints.
- Artifact file requirements.
- Registry table mirror constraints.
- Summary, list, export, and render-data projection.
- Optional create-template data.
- Allowlisted first-party extension IDs.

The compiler must not require a host repo to write TypeScript.

### Identity strategies

Supported v1 strategies:

1. **Repo-scoped sequence.** Renders IDs like `BP-TD-001` from `repo_key`, a type prefix, and a sequence number. Used by the shipped `tech-debt` preset.
2. **Declared-pattern sequence.** Renders IDs like `TD-CARD-001`, `TD-BASELINE-005`, or `TD-SPECIMEN-003` from a manifest-declared pattern and numeric sequence. Used for taste frozen IDs.
3. **Manual declared-pattern.** The manifest validates IDs against a pattern, but creation/import must supply the ID. Useful for imported legacy or externally governed surfaces.

Uniqueness is per repo/worktree. Cross-repo references are represented as structured refs with an optional repo key; resolver behavior is current-worktree by default.

### Layout mechanics

Directory-status layout remains the tech-debt preset layout:

```text
<records.root>/<type>/<status>/<id-lower>.md
```

The layout engine must also support:

- **Path-template layout** for markdown documents whose path encodes a field, such as `cards/{concern}/{slug}.md`.
- **Directory-backed layout** for specimens, where `manifest.toml`, `specimen.md`, and `excerpts.md` form one governed entity.
- **Document-only roots** for link/coverage validation that do not become records.

Path classification is layout-aware:

- A file matching a declared type slot is a record candidate.
- A malformed file in a real type slot is a checker error.
- A non-record markdown file under a document root is a document, not a failed record.
- A directory-backed type can own multiple artifact files while exposing one logical entity.

### Checker generalization

Generic substrate passes cover:

- JSON Schema validation.
- Required heading validation outside fenced code.
- Lifecycle and terminal evidence.
- Identity shape, duplicate ID, duplicate number, and layout/path invariants.
- Machine-derived tags and vocabulary tags.
- Relationship target existence, type, status, and lifecycle-kind constraints.
- Local markdown links, reference links, directory leaf resolution, and heading anchors.
- Stable `ix://...` ID refs.
- Coverage/reachability BFS from configured entrypoints.
- Required artifact files.
- Registry table exact coverage and field mirrors.

Taste-specific behavior stays outside the generic layer unless expressible as manifest data:

| Taste rule | Disposition |
| --- | --- |
| Card/baseline/specimen schema validation | Generic. |
| Card required body sections | Generic. |
| Generated tags from facets | Generic. |
| `supports_cards` integrity | Generic relationships. |
| Link/anchor validation | Generic document pass. |
| Coverage through index files | Generic document pass. |
| Specimen artifact files | Generic directory-backed type rule. |
| Registry index row exactness and mirrors | Generic registry-table constraints. |
| Card concern folder matches field | Generic path-field invariant if declared. |
| Example evidence contains local link | Generic body-section link rule if declared. |
| Use-case link-only ordering and proposed-card section policy | First-party taste extension. |
| Strength consumption semantics | Taste policy/prose, not generic substrate. |
| Private/work specimen cannot publish | First-party taste extension. |

### Resolver and render-data interface

Resolver builds a current-worktree index from declared types and layouts.

Stable authoring refs:

```text
ix://record/<ID>
ix://record/<REPO_KEY>/<ID>
```

The local markdown link pass ignores URI schemes. The ID-ref pass validates `ix://` refs when enabled.

Resolver output is render data, not a website: `repoKey`, `worktreeRoot`, `id`, `typeKey`, `status`, `title`, `visibility`, `sourcePath`, `canonicalPath`, `metadata`, `aliases`, `relationships`, `renderTargets`.

CLI primitives:

```bash
introspection resolve <ID>
introspection resolve <ID> --json
introspection resolve <ID> --format markdown-link
```

Renderer plugins are not arbitrary host code. v1 ships built-in renderers only (JSON and markdown-link); the TUI and local vite SPA are the next initiative built on this same render-data contract.

### GNO boundary

GNO remains downstream:

- `introspection export --format gno` is allowed.
- `introspection check`, `prime`, `records list`, `resolve`, import, and CI do not call GNO.
- Taste may continue GNO-first discovery as a workflow rule, but Markdown and introspection validation are the source of truth.
- Generated GNO artifacts are disposable.

## Open design questions (resolve before the dependent work item)

The architecture is settled in shape; the Phase 6 design critique flagged these mechanics to pin before the XL item that carries each one.

1. **`AppLayer` composition and the service dependency DAG** (before IX-SR-03). Decide one shared `AppLayer` versus per-command layers (the bootstrap plan left this open). The edges are non-trivial: `Checker` needs `RecordTypeRegistry` needs `ManifestCompiler` needs `SchemaValidation` plus `PresetCatalog` plus `RecordTypeManifestLoader`; `Resolver` needs `RecordStore` plus `LayoutResolver` plus `RecordTypeRegistry`.
2. **Where command type-resolution-from-config lands** (gates IX-SR-15). This plan routes IX-SR-15 through IX-SR-10 (commands resolve types from the config-derived registry) so the transitional default is removed only after commands no longer rely on it. Confirm at execution; the alternative is wiring command resolution at IX-SR-04.
3. **First-party extension-hook contract** (before IX-SR-19). Fix the hook signature (record or corpus in, findings out), how a manifest's allowlisted extension IDs dispatch to `src/extensions/taste/*`, and how "first-party only, no repo-local code" is enforced.
4. **Field-spec to Effect Schema compiler** (before IX-SR-06). The field-kind vocabulary; how nested blocks (`source`, `resolution`, `conversion_targets`) are expressed in a field-spec; the GNO flat-versus-nested split; whether one compiler serves config, frontmatter, and manifests or three; and whether the field-spec subsumes or references the taste two-owner split (schema owns shape, taxonomy owns vocabulary).
5. **Per-type layout reverse-mechanics** (before IX-SR-08). The rule distinguishing a document under a document root from a malformed record in a type slot (and overlap handling); whether `record transition` rewrites frontmatter only for non-directory-status layouts; and the `canonicalPath` rule per layout kind (and whether path-template IDs are path-derived or frontmatter-declared).
6. **Declared-pattern and manual identity allocation** (within IX-SR-07). Allocation mechanics for declared-pattern sequences (scan plus max+1?) and how manual declared-pattern import detects collisions and decides who supplies the ID.

## Work items

Estimate scale: **S** is a focused change. **M** is several files plus tests. **L** is a multi-surface change. **XL** is a cross-repo or domain cutover.

> **Ordering note.** The list is the default dependency order, but several couplings and parallel tracks override raw sequence number:
>
> - **Lockstep cutover:** IX-SR-04 ships config v2 additively (the transitional implicit `tech-debt` default keeps backpressure green); IX-SR-15 removes that default and migrates backpressure, and depends on IX-SR-10 (commands routing through the config-derived registry), not just IX-SR-07. Backpressure is never broken across the IX-SR-04 to IX-SR-15 window.
> - **Taste decoupled from publish:** IX-SR-18 (taste tech-debt migration) runs on the locally built / mise-pinned binary and does not wait on the npm publish (IX-SR-17).
> - **Parallel tracks:** IX-SR-01 overlaps IX-SR-00; the IX-SR-14 sub-checks share only the checker and resolver prerequisites with IX-SR-13, so they run in parallel with it; after IX-SR-15 the work forks into a release track (IX-SR-16 to IX-SR-17) and a taste track (IX-SR-18 to IX-SR-19 to IX-SR-20) that rejoin at IX-SR-20 (which needs IX-SR-17 for steady-state CI); IX-SR-19 manifest authoring can overlap IX-SR-18.

### IX-SR-00: Land this revised plan and dispose superseded active plans

**Goal.** Make this document the single active reshape source of truth.

**Done when.**

- This file contains the revised Effect-native plan.
- The stopped reshape plan and progress ledger are moved to `docs/exec-plans/completed/` with superseded banners pointing here.
- The bootstrap plan's remaining npm-release thread is folded into IX-SR-17, then the bootstrap plan is moved to completed or marked superseded/absorbed.
- Active/completed plan indexes reflect the new state.
- No active plan still describes an implicit built-in `tech-debt` default.

**Key files.** `docs/exec-plans/active/introspection-substrate-reshape-2026-06-14.md`; `docs/exec-plans/active/index.md`; `docs/exec-plans/completed/index.md`; superseded active plan files.

**Dependencies.** None.

**Size.** S.

### IX-SR-01: Add characterization fixtures and Effect guardrail targets before cutover

**Goal.** Preserve current useful behavior while making the coming hard cutover measurable.

**Done when.**

- Golden fixtures cover current `check`, `prime`, `records list`, `record create`, `record transition`, `import`, `export`, and `ids repair` behavior.
- A backpressure-shaped fixture proves current records-only adoption before the config-v2 cutover.
- A custom-type fixture is added as a failing/expected future fixture that documents the desired manifest behavior.
- Test helpers can run CLI commands in process and inspect JSON output.
- Guardrail targets for the Effect rewrite are documented:
    - domain code does not touch the filesystem directly
    - `new Date()` only inside `Clock`
    - command modules do not import core
    - domain code raises typed errors, never untyped throws

**Key files.** `test/commands/*`; `test/core/*`; `test/fixtures/*`; `test/store/*`; new `docs/references/effect-substrate-guardrails.md`.

**Dependencies.** IX-SR-00.

**Size.** M.

### IX-SR-02: Cut the CLI runtime to Effect 4 command architecture

**Goal.** Replace the hand-rolled command dispatcher with an Effect-native CLI shell.

**Done when.**

- `src/bin.ts` runs the root Effect command through Bun runtime services.
- CLI commands are defined with `Command.make` and `Command.withSubcommands`.
- Flags use `Flag.withSchema` or equivalent Effect Schema validation at parse time.
- `--json`, help, version, parse failures, and command failures have stable machine-readable output.
- Tests use `Command.runWith` and `TestConsole`; no subprocess is needed for normal CLI tests.
- Platform wiring follows Bun runtime in production and node/test layers in tests.

**Key files.** `package.json`; `pnpm-workspace.yaml`; `src/bin.ts`; new `src/cli/*`; `src/commands/*`; `test/cli/*`.

**Dependencies.** IX-SR-01.

**Size.** L.

### IX-SR-03: Introduce the Effect service graph and typed domain errors

**Goal.** Convert core mechanics into Effect services and Layers before adding new substrate behavior.

**Done when.**

- Services exist for config, schema validation, store, locks, ID allocation, registry, checker, resolver, import, export, presenters, and clock.
- Domain services return `Effect` with typed errors instead of raw `Promise` plus throws.
- Platform filesystem/path/clock access is injected.
- Existing behavior from IX-SR-01 golden fixtures is green through the new service graph.
- Guardrails mechanically reject direct platform access from core/domain modules.

**Key files.** new `src/services/*`; `src/core/errors.ts`; `src/config/repo-context.ts`; `src/store/*`; `src/core/time.ts`; `test/services/*`; guardrail config files.

**Dependencies.** IX-SR-02.

**Decomposition.** Stage this XL: bring the base services (config, store, clock, schema-validation) green against the IX-SR-01 fixtures first, then the higher services (registry, checker, resolver, import, export). Resolve the `AppLayer` composition and the service DAG (see Open design questions) before starting.

**Size.** XL (stage as above).

### IX-SR-04: Define config v2 with explicit type declarations (additive)

**Goal.** Add the config surface where every managed type is explicitly declared, shipped additively so existing adopters stay green until the lockstep cutover.

**Done when.**

- Config is decoded and validated by an Effect Schema supporting `schema_version = 2`; `schemas/config.schema.json` is generated from it (`JSONSchema.make`) for editor autocomplete.
- Config accepts explicit type declarations such as `[[records.types]] use = "preset:tech-debt"` and `[[records.types]] manifest = ".introspection/types/custom.record-type.toml"`.
- A repo with no `records.types` (and on config v2) has no registered types.
- **Additive transition:** existing schema-version-1 configs continue to resolve via a transitional implicit `tech-debt` default so current adopters (backpressure) keep validating; this transitional default is removed in IX-SR-15. No long-lived dual support: the implicit default exists only across the migration window and is deleted at the lockstep cutover.
- `introspection init --with tech-debt` scaffolds explicit type declarations.
- Config path resolution uses the shared repo-safe path policy.

**Key files.** `schemas/config.schema.json`; `src/config/repo-context.ts`; `src/services/RepoConfig*`; `src/commands/init.ts`; `test/config/*`; `test/commands/init.test.ts`.

**Dependencies.** IX-SR-03.

**Size.** L.

### IX-SR-05: Define record-type manifest schema and shipped preset catalog

**Goal.** Create the declarative type contract and move `tech-debt` into a shipped opt-in preset.

**Done when.**

- An Effect Schema for type manifests exists and validates them; `schemas/record-type.schema.json` is generated from it for editor autocomplete.
- A shipped `preset:tech-debt` manifest exists in the package.
- Preset manifests are loaded through `PresetCatalog`, not hardcoded registry imports.
- Preset schemas are packaged and available in packed tarball smoke tests.
- Invalid preset/custom manifests fail with typed, remediation-first errors.

**Key files.** new `schemas/record-type.schema.json`; `schemas/index.md`; new `src/presets/record-types/tech-debt.*`; new `src/services/PresetCatalog*`; new `src/services/RecordTypeManifestLoader*`; `test/schemas/*`; `test/services/preset-catalog.test.ts`.

**Dependencies.** IX-SR-04.

**Size.** L.

### IX-SR-06: Build the manifest compiler

**Goal.** Compile type manifests into executable generic type behavior.

**Done when.**

- `ManifestCompiler` compiles the manifest field-spec into an Effect Schema, plus lifecycle, headings, tags, relationships, layouts, identity, summary, export, and render projections; it emits each type's `*.schema.json` artifact via `JSONSchema.make`.
- Generic validation behavior replaces hand-written `techDebtRecordType` logic.
- First-party extension IDs are resolved through an extension registry.
- No repo-local code is loaded.
- AJV and `ajv-formats` are removed from dependencies; Effect Schema is the only runtime validator.
- A fixture custom type works through check/list/export/import without source edits.

**Key files.** new `src/services/ManifestCompiler*`; `src/core/record-type.ts`; `src/core/record-type-types.ts`; `src/record-types/registry.ts`; `src/record-types/tech-debt.ts`; `test/services/manifest-compiler.test.ts`; `test/core/record-type-contract.test.ts`.

**Dependencies.** IX-SR-05.

**Size.** XL.

### IX-SR-07: Add identity strategies and allocator cutover

**Goal.** Replace hardcoded repo-key/type-prefix assumptions with manifest-declared identity strategies.

**Done when.**

- Repo-scoped sequence IDs preserve `BP-TD-001` / `TASTE-TD-001` shape when declared.
- Declared-pattern IDs support `TD-CARD-001`, `TD-BASELINE-001`, and `TD-SPECIMEN-001`.
- Manual declared-pattern IDs can be imported and validated.
- Duplicate IDs and duplicate allocated numbers are corpus findings.
- Locks are scoped by repo, type, and identity strategy.
- Existing `ids repair` works for repo-scoped sequence IDs and fails with a clear error for manual frozen IDs.

**Key files.** `src/core/id.ts`; `src/store/id-allocator.ts`; `src/store/local-lock.ts`; `src/import/corpus-index.ts`; new `src/services/Identity*`; `test/core/id.test.ts`; `test/store/id-allocator.test.ts`.

**Dependencies.** IX-SR-06.

**Size.** L.

### IX-SR-08: Implement per-type layout strategies and corpus classification

**Goal.** Stop treating every markdown file under one root as a record and make record candidacy layout-aware.

**Done when.**

- Directory-status layout supports tech-debt.
- Path-template layout supports markdown surfaces such as taste cards/baselines.
- Directory-backed layout supports specimen-like entities with required artifacts.
- Non-record markdown under document roots is classified as a document.
- Malformed files in declared type slots fail `check`.
- `records list` skips non-record docs and reports unreadable candidates without crashing.
- Layout invariants can compare path segments to metadata fields.

**Key files.** new `src/services/LayoutResolver*`; `src/store/markdown-record-store.ts`; `src/store/frontmatter.ts`; `src/core/validation.ts`; `test/store/*`; `test/services/layout-resolver.test.ts`.

**Dependencies.** IX-SR-07.

**Size.** XL.

### IX-SR-09: Rebuild the checker pipeline around compiled types

**Goal.** Generalize validation while preserving remediation-first findings.

**Done when.**

- Checker stages are explicit: discovery, read/parse, per-entity validation, corpus validation, document validation, extension validation.
- Generic schema, lifecycle, headings, identity, layout, tags, vocabulary, and relationship checks run from compiled manifests.
- Findings include stable code, severity, source path, entity ID when known, rule source, and remediation.
- JSON output is stable and fixture-tested.
- Link/coverage passes remain opt-in until configured.

**Key files.** new `src/services/Checker*`; `src/core/validation.ts`; `src/presenters/human.ts`; `src/presenters/json.ts`; `test/core/validation.test.ts`; `test/services/checker.test.ts`.

**Dependencies.** IX-SR-08.

**Size.** XL.

### IX-SR-10: Convert command surfaces to compiled registry services

**Goal.** Make all user-facing commands operate through repo-declared types and Effect services.

**Done when.**

- `check`, `prime`, `records list`, `record create`, `record transition`, `ids`, `vocab`, `import`, and `export` use `RecordTypeRegistry` from repo config.
- `record create <type>` works only when the compiled type declares a creation template.
- `record create tech-debt` remains available after the repo opts into `preset:tech-debt`.
- Unknown types fail with remediation that points at `[[records.types]]`.
- CLI JSON output remains agent-facing and parseable.

**Key files.** `src/cli/*`; `src/commands/*`; `src/services/*`; `test/commands/*`; `test/cli/*`.

**Dependencies.** IX-SR-09.

**Size.** L.

### IX-SR-11: Rework import/export for manifest-backed types

**Goal.** Keep import/export generic and GNO-free except for the explicit GNO projection.

**Done when.**

- Import can target any compiled type whose manifest supports the input shape.
- Import preflight checks candidate records against existing corpus and layout occupancy before writes.
- JSON export includes manifest-backed custom types.
- GNO export consumes generic export projections only.
- `check`, `prime`, `records list`, and resolver pass without GNO installed.
- Export artifacts remain disposable and recreateable.

**Key files.** `src/import/*`; `src/export/*`; `src/retrieval/*`; `src/commands/import.ts`; `src/commands/export.ts`; `test/import/*`; `test/export/*`.

**Dependencies.** IX-SR-10.

**Size.** L.

### IX-SR-12: Add the stable-ID resolver and built-in renderers

**Goal.** Provide the renderer floor: stable IDs resolve to current worktree paths and render data. (The TUI and local vite SPA renderers are the next initiative, built on this render-data contract; this item ships only the JSON and markdown-link built-ins.)

**Done when.**

- `Resolver` indexes declared types, IDs, aliases, statuses, titles, paths, and relationships.
- `introspection resolve <ID>` returns human and JSON output.
- `--format markdown-link` emits a current relative markdown link.
- `ix://record/<ID>` refs are validated by the ID-ref checker and ignored by local link validation.
- A lifecycle move or path-template move changes the resolved path without changing the ID.
- The renderer interface is data-first and supports only built-in renderers in v1, but the render-data contract is documented well enough for the next-initiative TUI/SPA to consume without a substrate change.

**Key files.** new `src/services/Resolver*`; new `src/services/RendererRegistry*`; new `src/commands/resolve.ts`; `src/commands/index.ts`; `src/presenters/*`; `test/services/resolver.test.ts`; `test/commands/resolve.test.ts`.

**Dependencies.** IX-SR-11.

**Size.** L.

### IX-SR-13: Add generic local link, anchor, and ID-ref validation

**Goal.** Move outbound link validation into introspection as an opt-in document pass.

**Done when.**

- Config can enable link validation for document roots.
- The validator strips fenced code blocks.
- Inline and reference local links resolve.
- Directory links resolve through configured leaf docs.
- Markdown anchors validate against generated heading slugs.
- External URI schemes are ignored by the local link pass.
- `ix://` refs are validated by resolver/ID-ref logic when enabled.
- Tests port important taste `links.go` behaviors.

**Key files.** `schemas/config.schema.json`; new `src/services/MarkdownLinkChecker*`; `src/services/Checker*`; `test/services/link-checker.test.ts`; `test/fixtures/checker-links/*`.

**Dependencies.** IX-SR-12.

**Size.** L.

### IX-SR-14: Add coverage, artifacts, relationships, and registry-table constraints

**Goal.** Generalize the remaining data-expressible taste checker behaviors.

**Done when.**

- Config can declare document roots, entrypoints, traversal filenames, excludes, and leaf-doc policy.
- Coverage BFS reproduces taste's `docs/index.md` to `index.md` traversal shape in fixtures.
- Type manifests can declare required artifact files.
- Relationship fields validate target ID, type, status, and lifecycle kind.
- Registry-table constraints validate exact coverage and scalar/relation mirrors.
- Taste-specific use-case ordering and private-publish behavior remain extension hooks, not generic assumptions.

**Key files.** `schemas/config.schema.json`; `schemas/record-type.schema.json`; new `src/services/CoverageChecker*`; new `src/services/RelationshipChecker*`; new `src/services/RegistryTableChecker*`; `test/services/*`.

**Dependencies.** IX-SR-12 (resolver and `ix://` refs) and the rebuilt checker (IX-SR-09). Independent of IX-SR-13's link/anchor pass; runs in parallel with it.

**Decomposition.** Split into four independently shippable, parallelizable checks: coverage BFS; required-artifact rules; relationship-target validation; registry-table mirrors. The XL estimate is their sum, not one monolith.

**Size.** XL (split as above).

### IX-SR-15: Lockstep backpressure cutover to explicit tech-debt preset

**Goal.** Complete the hard cutover: remove the transitional implicit default and prove a real records-only adopter survives the no-implicit-default rule.

**Done when.**

- Backpressure `.introspection/config.toml` is upgraded to config v2 and declares `[[records.types]] use = "preset:tech-debt"`.
- The transitional implicit `tech-debt` default from IX-SR-04 is removed from introspection; the no-implicit-default rule is fully in force.
- Backpressure records still validate; `introspection prime`, `records list`, `check`, and `export` behave as expected.
- Backpressure `pnpm check` and CI pass on the local `file:` link as the additivity proof.
- The old implicit-default behavior is removed from introspection tests.
- Backpressure's `max-statements` follow-up (formerly tracker item #17) is captured as a backpressure-local tech-debt record in the same change (the enablement itself stays backpressure's own future work).

**Key files.** `backpressure/.introspection/config.toml`; `backpressure/package.json`; `backpressure/.github/workflows/ci.yml`; new backpressure tech-debt record for `max-statements`; introspection fixtures/tests for the backpressure-shaped repo.

**Dependencies.** IX-SR-10 (commands must resolve types from the config-derived `RecordTypeRegistry` before the transitional default can be removed) plus IX-SR-07 (preset + compiler + identity). The transitional implicit default from IX-SR-04 keeps backpressure green across the entire IX-SR-04 to IX-SR-15 window, so backpressure is never broken; the default is removed here, once commands resolve types from config. Removing it before IX-SR-10 would leave commands bound to the default they just deleted.

**Size.** M.

### IX-SR-16: Release-quality lane for the Effect substrate

**Goal.** Prove the hard cutover is packageable and difficult to weaken accidentally.

**Done when.**

- Mutation testing targets manifest compiler, identity strategies, layouts, checker passes, resolver, and import/export.
- Effect service tests cover failure paths with typed errors.
- Packed tarball smoke covers Bun binary path and JS fallback path.
- Packed smoke includes a repo with explicit `preset:tech-debt` and a repo with a custom manifest type.
- Stryker survivors are killed or documented under `docs/reports/mutation/`.
- `pnpm check`, `pnpm test:mutation`, `pnpm pack:dry-run`, and `pnpm pack:smoke` pass.

**Key files.** `stryker.config.mjs`; `scripts/packed-tarball-smoke.ts`; `docs/reports/mutation/*`; `test/**`; `package.json`.

**Dependencies.** IX-SR-14 (substrate floor complete) and IX-SR-15 (cutover done).

**Size.** M.

### IX-SR-17: Publish npm packages and switch backpressure to published pin

**Goal.** Fold the npm release and published adopter proof into the reshape.

**Done when.**

- Main package and platform packages publish through Trusted Publishing with provenance.
- Release workflow verifies pack dry-run and packed install smoke before publish.
- Backpressure moves from `file:../introspection` to a strict catalog pin.
- Backpressure handles pnpm release-age policy through a scoped exclusion or by waiting out the configured age window.
- Backpressure `pnpm check` passes on the published package.
- Release readiness docs reflect config v2, explicit presets, and the Effect runtime.

**Key files.** `.github/workflows/release.yml`; `.changeset/*`; `docs/references/release-readiness.md`; `package.json`; `packages/introspection-*/*`; `backpressure/package.json`; `backpressure/pnpm-workspace.yaml`.

**Dependencies.** IX-SR-16. Manual blocker: MP's one-time npm Trusted Publishing browser setup.

**Size.** M.

### IX-SR-18: Migrate taste tech-debt records in coexistence mode

**Goal.** Adopt introspection records in taste-distillery without breaking the current Go checker. Runs on the locally built / mise-pinned binary; not gated on the npm publish.

**Done when.**

- Taste has config v2 with `repo_key = "TASTE"` and explicit `preset:tech-debt`, consumed via the locally built / mise-pinned binary.
- Taste records use directory-status layout under `docs/records/tech-debt/...`, and `docs/records` is added to the Go checker's `isExcludedDir` for the interim so `check-docs` ignores the introspection-owned records until the substrate cutover (IX-SR-20). The exclusion is removed at cutover.
- The 14 legacy entries import as `TASTE-TD-001` through `TASTE-TD-014`.
- Live tracker references from the audit are rewritten to `ix://record/...` refs or stable resolver guidance.
- Historical links are de-linked or left per the audit matrix.
- The legacy tracker and consumed manifest directory are deleted with no pointer stub.
- Taste `just docs`, `just prose`, root link audit, `introspection check`, and `introspection prime` pass.

**Key files.** `investigations/td-migration-reference-audit-2026-06-14.md`; `taste-distillery/.introspection/config.toml`; `taste-distillery/docs/records/tech-debt/open/*.md`; `taste-distillery/scripts/check-docs/links.go` (interim `isExcludedDir` entry); taste files from the audit matrix; `taste-distillery/CLAUDE.md`; `taste-distillery/mise.toml`.

**Dependencies.** IX-SR-15 (preset + cutover proven on backpressure first) and IX-SR-08/12 (layout + resolver). Not dependent on IX-SR-17 (publish): runs on the locally built / mise-pinned binary.

**Size.** L.

### IX-SR-19: Model taste card, baseline, and specimen types as manifests plus extensions

**Goal.** Express taste canon surfaces on the substrate without making taste semantics generic.

**Done when.**

- Draft manifests exist for card, baseline, and specimen types.
- Card/baseline/specimen frozen IDs use declared-pattern identity.
- Card and baseline markdown use path-template layout (cards stay in `cards/<concern>/`); specimen uses directory-backed layout.
- Generic rules cover schemas, headings, tags, relationships, artifacts, links, coverage, and registry mirrors.
- First-party taste extension hooks are implemented only for remaining behavior: use-case ordered card bundles; proposed-card review-context rule; specimen private/work publish visibility if not expressible as schema. MP is the arbiter for any additional non-generic domain policy, and the parity report is the acceptance gate for what becomes a hook versus a generic rule.
- A parity report maps every Go checker behavior to generic, extension, obsolete, or deliberately deleted.

**Key files.** taste `.introspection/types/*.record-type.toml`; `taste-distillery/schemas/*.json`; `taste-distillery/scripts/check-docs/*.go`; new `src/extensions/taste/*`; `test/extensions/taste/*`; parity report under `docs/investigations/` or `docs/reports/`.

**Dependencies.** IX-SR-18.

**Decomposition.** Split this XL so manifest modeling (card/baseline/specimen) lands separately from the taste extension-hook work; keep the parity report as its own closing item.

**Size.** XL (split as above).

### IX-SR-20: Cut taste steady-state validation to introspection

**Goal.** Replace taste's Go checker as the primary canon validation harness.

**Done when.**

- Side-by-side parity is green, or each difference is recorded in the IX-SR-19 parity report with an explicit MP-accepted disposition (the parity report is the acceptance gate).
- Taste `just docs` / `just ci` call introspection for canon validation.
- The Go checker is removed, archived, or demoted to historical reference; the interim `docs/records` exclusion from IX-SR-18 is removed alongside it.
- Taste router and docs name introspection as the checker substrate.
- GNO remains out of CI.
- Taste card/baseline/specimen validation runs from explicit manifests and extension IDs.

**Key files.** `taste-distillery/justfile`; `taste-distillery/.github/workflows/ci.yml`; `taste-distillery/CLAUDE.md`; `taste-distillery/docs/checker-requirements.md`; `taste-distillery/docs/source-of-truth-boundaries.md`; `taste-distillery/scripts/check-docs/*`.

**Dependencies.** IX-SR-19. Steady-state CI wiring also needs the published/mise-consumable binary (IX-SR-17).

**Size.** XL.

### IX-SR-21: Final adoption docs and substrate operating manual

**Goal.** Make the reshaped substrate usable by future repos and agents.

**Done when.**

- `docs/adoption.md` covers config v2, explicit presets, custom manifests, layouts, identity, checker opt-ins, resolver refs, import/export, and the GNO boundary.
- `INTROSPECTION.md` generated by `init` explains explicit type declarations.
- Agent guidance documents validation commands and success criteria.
- Examples include records-only adoption, custom type adoption, and taste-style document validation.
- Docs state that hard cutover means no implicit default type, and note the planned next initiative (TUI/SPA renderers on the render-data interface).

**Key files.** `docs/adoption.md`; `docs/references/effect-substrate-guardrails.md`; `src/core/init-scaffold.ts`; `README.md`; `CLAUDE.md`.

**Dependencies.** IX-SR-20.

**Size.** M.

## Verification strategy

### Global gate

Run in `introspection` after every work item from IX-SR-02 onward:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm introspection:check
pnpm prose
```

For packaging or release work:

```bash
pnpm pack:dry-run
pnpm pack:smoke
```

For mutation/release-quality work:

```bash
pnpm test:mutation
```

### Effect-native verification

- CLI tests use `Command.runWith` and `TestConsole`.
- Service tests provide test Layers, not global mocks.
- Domain services return typed errors.
- Guardrails fail direct filesystem, clock, process, or command imports in the wrong layer.
- Bun runtime smoke and node/test-layer unit tests both pass.

### Config and explicit type verification

- A repo with no `records.types` (config v2) registers no managed types.
- A repo with records but no matching declared type fails with a remediation pointing at `[[records.types]]`.
- During the migration window, a schema-v1 config still resolves via the transitional default; after IX-SR-15 the transitional default is gone and v1 configs fail with a migration message.
- Backpressure config v2 with `preset:tech-debt` passes.
- A custom manifest fixture passes without source-code edits.

### Manifest/compiler verification

- Invalid manifests fail before registry composition.
- Duplicate type keys, identity prefixes, patterns, and extension IDs fail deterministically.
- `preset:tech-debt` and a custom fixture type compile through the same path.
- Generated `*.schema.json` artifacts are emitted and match the compiled Effect Schemas.
- No AJV or runtime JSON Schema validation remains; Effect Schema is the only validator.
- Shipped presets are present in the packed tarball.

### Layout and identity verification

- Directory-status fixture validates and moves across statuses.
- Path-template fixture validates field/path invariants.
- Directory-backed fixture validates required artifacts.
- Repo-scoped and declared-pattern IDs allocate and validate independently.
- Duplicate ID and duplicate number findings include locations and remediation.

### Checker verification

- Malformed files in type slots fail.
- Non-record markdown in document roots does not parse as a record.
- Link checker strips fenced code and validates anchors.
- `ix://` refs are ignored by local link validation and checked by ID-ref validation.
- Coverage BFS reproduces taste index traversal in fixtures.
- Registry-table constraints catch missing, duplicate, and mismatched rows.
- Extension hook findings are namespaced and opt-in.

### Resolver/render verification

- Resolve an ID before and after a lifecycle/path move.
- `--format markdown-link` produces a current checkout-relative link.
- Missing `ix://` refs fail with resolver findings.
- JSON render data is stable and documented (so the next-initiative TUI/SPA can consume it unchanged).
- No generated index file is the source of truth for resolution.

### GNO boundary verification

- `check`, `prime`, `records list`, `resolve`, and import pass with no GNO installed.
- Only `export --format gno` touches GNO projection code.
- Taste CI does not install or call GNO.

### Backpressure proof

After IX-SR-15 (local link) and IX-SR-17 (published pin):

```bash
cd /Users/mp/Projects/personal/backpressure
pnpm introspection:check
introspection prime --json
introspection records list --json
pnpm check
```

Expected outcome: backpressure runs on an explicit `preset:tech-debt` config with no implicit-default dependency. Records stay healthy and CI stays green.

### Taste coexistence and cutover proof

During IX-SR-18:

```bash
cd /Users/mp/Projects/personal/taste-distillery
just docs
just prose
introspection check
introspection prime
```

During IX-SR-19/20: the parity report maps every Go checker rule; introspection findings equal or intentionally supersede Go checker findings; `just ci` stays green; GNO stays out of CI.

## Success criteria

The reshape is complete when:

- The CLI is Effect-native from entrypoint through domain services.
- Every managed type is explicitly declared in repo config.
- `tech-debt` is a shipped opt-in preset compiled by the generic manifest engine.
- A host repo can declare a custom type without editing introspection source.
- Per-type identity and layout strategies work in fixtures.
- Generic checker passes cover schema, lifecycle, headings, identity, relationships, links, anchors, coverage, artifacts, and registry mirrors.
- Stable IDs resolve to current worktree paths and render data.
- JSON and GNO exports include manifest-backed custom types.
- Backpressure runs green on the published package with explicit `preset:tech-debt`.
- Taste tech-debt records migrate in coexistence mode.
- Taste card/baseline/specimen validation has a proven path from Go checker to introspection manifests plus explicit taste extension hooks.

## References

- Pivot/seed (authoritative for decisions): `docs/design-input/introspection-substrate-reshape-seed-2026-06-14.md`
- taste-distillery migration audit (manifest + action matrix, `repo_key = TASTE`): `investigations/td-migration-reference-audit-2026-06-14.md`
- Effect-CLI reference shape + supply chain pins: `docs/exec-plans/active/introspection-v1-bootstrap-2026-06-10.md`
- Pre-pivot oracle critique (MANAGE/RETRIEVE split, GNO retrieval-only): `investigations/oracle-preplan-critique-2026-06-01.md`
- Stopped v1 reshape spec + ledger (superseded by this plan): `docs/exec-plans/active/introspection-v1-reshape-2026-06-13.md`, `docs/exec-plans/active/reshape-progress-ledger.md`
- taste-distillery ownership map and canon model: `taste-distillery/docs/source-of-truth-boundaries.md`
- Effect 4 CLI reference: `t3code` (`bin.ts`, `cli/config.ts`, `bin.test.ts`)
