# taste-distillery tech-debt tracker: migration reference audit (WI-R04)

> **Status: reviewable migration input. Mutates nothing in taste-distillery.**
> This audit is reshape planning guidance for **WI-R06**, so it lives in the
> introspection repo (`investigations/`), the home for this reshape's planning and
> investigation docs, not in taste-distillery's governed canon. The only artifact
> written into taste-distillery is the import manifest
> (`exec-plans/drafts/introspection-migration/tech-debt-import-manifest.json`); a
> `.json` file is invisible to taste-distillery's `check-docs`. The import,
> reference rewrites, and tracker deletion are WI-R06 and run later.
>
> Repo paths below are inline code, not markdown links, so this audit never emits a
> link a checker would try to resolve and stays prose-clean.

## Purpose

Hand WI-R06 a single, drift-proof source of truth for every reference to the legacy
tech-debt tracker (`exec-plans/tech-debt-tracker.md`) and its `TD-DEBT-NNN` IDs
across taste-distillery. The **WI-R06 action matrix** below is canonical: every
other section is a derived view that points back at matrix rows, so updating one
row can never leave a duplicate stale. The audit recommends **rewrite-and-delete
over a pointer stub** (the plan's stated preference).

## What the migration produces

The 14 open tracker entries (`TD-DEBT-001..014`) become 14 introspection
`tech-debt` records under `docs/records/tech-debt/open/`. IDs take introspection's
canonical `<REPO_KEY>-TD-NNN` form. The `<REPO_KEY>` prefix is a WI-R06 config
decision (see "WI-R06 decisions required" below); the manifest is
`repo_key`-agnostic and does not encode it.

The 14 entries map one-to-one, preserving number and order:

| Legacy ID (tracker) | Canonical record ID | Record path (status=open) |
| - | - | - |
| `TD-DEBT-001` | `<REPO_KEY>-TD-001` | `docs/records/tech-debt/open/<repo_key>-td-001.md` |
| `TD-DEBT-002` | `<REPO_KEY>-TD-002` | `...-td-002.md` |
| `TD-DEBT-003` | `<REPO_KEY>-TD-003` | `...-td-003.md` |
| `TD-DEBT-004` | `<REPO_KEY>-TD-004` | `...-td-004.md` |
| `TD-DEBT-005` | `<REPO_KEY>-TD-005` | `...-td-005.md` |
| `TD-DEBT-006` | `<REPO_KEY>-TD-006` | `...-td-006.md` |
| `TD-DEBT-007` | `<REPO_KEY>-TD-007` | `...-td-007.md` |
| `TD-DEBT-008` | `<REPO_KEY>-TD-008` | `...-td-008.md` |
| `TD-DEBT-009` | `<REPO_KEY>-TD-009` | `...-td-009.md` |
| `TD-DEBT-010` | `<REPO_KEY>-TD-010` | `...-td-010.md` |
| `TD-DEBT-011` | `<REPO_KEY>-TD-011` | `...-td-011.md` |
| `TD-DEBT-012` | `<REPO_KEY>-TD-012` | `...-td-012.md` |
| `TD-DEBT-013` | `<REPO_KEY>-TD-013` | `...-td-013.md` |
| `TD-DEBT-014` | `<REPO_KEY>-TD-014` | `...-td-014.md` |

Each legacy ID is preserved inside its record as a typed `tracker` source ref
(`exec-plans/tech-debt-tracker.md#td-debt-NNN`), derived by the importer from the
manifest `source.tracker_path` plus each entry's `legacy_id`.

## WI-R06 action matrix (canonical)

This is the **single source of truth** for every reference's WI-R06 disposition
(rewrite, de-link, or leave-as-historical) plus the Go-checker coupling. Deletion
sequencing (the tracker file and the consumed manifest directory) is not a
reference disposition; the WI-R06 runbook (steps 6-7) owns it. "Scanned" = the file lives under a `check-docs` `content_dir` (`cards`,
`baselines`, `specimens`, `docs`, `decisions`, `exec-plans`, `investigations`,
`use-cases`), so a markdown link there is link-validated; root files (`CLAUDE.md`,
`CHANGELOG.md`) and Go source are not scanned, so breaks there are silent and need
a separate link audit. `<KEY>` is the chosen `repo_key`.

| # | Location | Reference kind | Scanned | Live/historical | WI-R06 disposition |
| - | - | - | - | - | - |
| R1 | `cards/agents/agent-facing-cli-output-contracts.md:35` | tracker link | yes | live | Rewrite to records surface |
| R2 | `cards/agents/dangerous-command-guardrails.md:35` | tracker link | yes | live | Rewrite to records surface |
| R3 | `cards/docs-and-knowledge/repo-local-skills-for-recurring-workflows.md:35` | tracker link | yes | live | Rewrite to records surface |
| R4 | `cards/docs-and-knowledge/repo-local-skills-for-recurring-workflows.md:43` | tracker link | yes | live | Rewrite to records surface |
| R5 | `cards/infrastructure/conditional-terraform-and-iac-safety-stack.md:35` | tracker link | yes | live | Rewrite to `<KEY>-TD-014` record (this card is TD-CARD-029) |
| R6 | `cards/testing/mutation-testing-quality-lane.md:37` | tracker link, `#td-debt-006` anchor | yes | live | Rewrite to `<KEY>-TD-006` record |
| R7 | `cards/tooling/config-and-data-file-formats.md:43` | tracker link | yes | live | Rewrite to records surface |
| R8 | `cards/tooling/go-stdlib-glue-for-local-tools.md:37` | tracker link | yes | live | Rewrite to records surface |
| R9 | `cards/tooling/go-stdlib-glue-for-local-tools.md:45` | tracker link | yes | live | Rewrite to records surface |
| R10 | `cards/typescript/promise-facades-over-effect-internals.md:37` | tracker link | yes | live | Rewrite to records surface |
| R11 | `baselines/linting-and-guardrails/ast-grep-structural-rules.md:78` | `TD-DEBT-005` link, `#td-debt-005` anchor | yes | live | Rewrite to `<KEY>-TD-005` record |
| R12 | `baselines/testing/typescript-testing-and-mutation.md:80` | `TD-DEBT-006` link, `#td-debt-006` anchor | yes | live | Rewrite to `<KEY>-TD-006` record |
| R13 | `docs/gno-retrieval.md:154` | tracker link, `#td-debt-001` anchor | yes | live | Rewrite to `<KEY>-TD-001` record |
| R14 | `docs/authoring-guide.md:7` | tracker link | yes | live | Rewrite to records surface |
| R15 | `docs/design-docs/documentation-ia-and-routing.md:17` | tracker link | yes | live | Rewrite to records surface |
| R16 | `docs/design-docs/documentation-ia-and-routing.md:34` | tracker link | yes | live | Rewrite to records surface |
| R17 | `decisions/004-remove-roadmap-surface.md:13` | tracker path link | yes | live | Rewrite to records surface (active routing ADR) |
| R18 | `exec-plans/index.md:10` | tracker link (lifecycle bullet) | yes | live | Replace the lifecycle bullet with a records pointer (structural) |
| R19 | `investigations/index.md:12` | tracker link | yes | live | Rewrite to records surface |
| R20 | `docs/authoring-guide.md:9` | prose name | yes | live | Reword to records surface |
| R21 | `docs/design-docs/documentation-ia-and-routing.md:38` | prose name | yes | live | Reword to records surface |
| R22 | `docs/source-of-truth-boundaries.md:17` | boundary table row name | yes | live | Reword the boundary row to name the records surface as deferred-work owner |
| R23 | `docs/tag-taxonomy.md:19` | prose name (TD-DEBT-004 idea) | yes | live | Reword to point at `<KEY>-TD-004` |
| R24 | `CLAUDE.md:32` | router table markdown link | no (root) | live | Rewrite the router row to records (`AGENTS.md` is a symlink, so one edit covers both) |
| R25 | `CLAUDE.md:52` | prose name | no (root) | live | Update wording (the deep-dives/tradeoffs/generated trigger now lives in `<KEY>-TD-011`) |
| R26 | `decisions/001-card-first-frozen-specimen-ia.md:32` | tracker link (ADR-004 narrative) | yes | historical | De-link to plain text; do not repoint (repointing would falsely imply ADR-004 moved triggers into introspection records) |
| R27 | `exec-plans/completed/2026-06-01-bootstrap-final-review.md:15` | tracker link | yes | historical | De-link to plain text; preserve narrative |
| R28 | `decisions/003-dogfood-documentation-ia.md:19` | backtick path | yes | historical | Leave (ADR history; not a link, does not break `just docs`) |
| R29 | `decisions/003-dogfood-documentation-ia.md:26` | prose name | yes | historical | Leave (ADR history) |
| R30 | `decisions/004-remove-roadmap-surface.md:9` | backtick path | yes | historical | Leave (ADR history; not a link) |
| R31 | `exec-plans/completed/2026-06-02-backpressure-taste-layering.md:57,58,59,78` | bold `TD-DEBT-005/006/011/005` | yes | historical | Leave (bold text, no links to break) |
| R32 | `CHANGELOG.md:25` | plain-text `TD-DEBT-014` | no (root) | historical | Leave; **STALE ID** (then-current `TD-DEBT-014` differs from today's; do not remap) |
| R33 | `CHANGELOG.md:19,26,28,40` | backtick path + plain-text names/IDs | no (root) | historical | Leave (append-only history; no markdown links) |
| R34 | `scripts/check-docs/taxonomy.go:114` | advisory message string | n/a (Go) | live | Update the hint text to the records surface (advisory only; deleting the tracker does not break the checker's parsing) |
| R35 | `exec-plans/completed/2026-05-30-taste-distillery-bootstrap.md` (23 historical mentions) | backtick paths + prose names | yes | historical | Leave (completed plan; no markdown links to break) |

## Legacy `TD-DEBT-NNN` ID references (derived view)

Subset of matrix rows whose reference carries a literal `TD-DEBT-NNN` ID. The
anchored links must point at the specific migrated record; the historical ones are
left in place.

| Matrix row | Location | Legacy IDs | Maps to |
| - | - | - | - |
| R11 | `baselines/linting-and-guardrails/ast-grep-structural-rules.md:78` | TD-DEBT-005 | `<KEY>-TD-005` |
| R12 | `baselines/testing/typescript-testing-and-mutation.md:80` | TD-DEBT-006 | `<KEY>-TD-006` |
| R6 | `cards/testing/mutation-testing-quality-lane.md:37` | TD-DEBT-006 | `<KEY>-TD-006` |
| R13 | `docs/gno-retrieval.md:154` | TD-DEBT-001 | `<KEY>-TD-001` |
| R33 | `CHANGELOG.md:28` | TD-DEBT-006 | historical, leave |
| R32 | `CHANGELOG.md:25` | TD-DEBT-014 | historical, leave (stale ID) |
| R31 | `exec-plans/completed/2026-06-02-backpressure-taste-layering.md:57,58,59,78` | TD-DEBT-005/006/011 | historical, leave |

## Files to touch (derived checklist)

Distinct files WI-R06 edits, derived from matrix rows whose disposition is not
`Leave`. Per-line dispositions live in the matrix; this is the file-set view.

- **Cards (8, rows R1-R10):** `cards/agents/agent-facing-cli-output-contracts.md`,
  `cards/agents/dangerous-command-guardrails.md`,
  `cards/docs-and-knowledge/repo-local-skills-for-recurring-workflows.md`,
  `cards/infrastructure/conditional-terraform-and-iac-safety-stack.md`,
  `cards/testing/mutation-testing-quality-lane.md`,
  `cards/tooling/config-and-data-file-formats.md`,
  `cards/tooling/go-stdlib-glue-for-local-tools.md`,
  `cards/typescript/promise-facades-over-effect-internals.md`.
- **Baselines (2, rows R11-R12):** `baselines/linting-and-guardrails/ast-grep-structural-rules.md`,
  `baselines/testing/typescript-testing-and-mutation.md`.
- **Docs (5, rows R13-R16, R20-R23):** `docs/gno-retrieval.md`,
  `docs/authoring-guide.md`, `docs/design-docs/documentation-ia-and-routing.md`,
  `docs/source-of-truth-boundaries.md`, `docs/tag-taxonomy.md`.
- **Decisions (2, rows R17 rewrite, R26 de-link):**
  `decisions/004-remove-roadmap-surface.md`,
  `decisions/001-card-first-frozen-specimen-ia.md`.
  (`decisions/003-dogfood-documentation-ia.md` is historical-only, rows R28-R29; no edit.)
- **Indexes / router (3, rows R18, R19, R24-R25):** `exec-plans/index.md`,
  `investigations/index.md`, `CLAUDE.md` (`AGENTS.md` follows via symlink).
- **Completed plan (1, de-link, row R27):**
  `exec-plans/completed/2026-06-01-bootstrap-final-review.md`.
- **Go checker (1, row R34):** `scripts/check-docs/taxonomy.go`.
- **Tracker:** delete `exec-plans/tech-debt-tracker.md`.

Files left untouched (historical, rows R28-R33, R35): `CHANGELOG.md`,
`decisions/003-dogfood-documentation-ia.md`,
`exec-plans/completed/2026-05-30-taste-distillery-bootstrap.md`,
`exec-plans/completed/2026-06-02-backpressure-taste-layering.md`.

## Why the historical rows stay

Rows marked historical (R26-R33, R35) are either de-linked in place or left untouched;
they are never repointed at the records surface, because that rewrites history.

- `CHANGELOG.md` (R32, R33): append-only human history, accurate when written, and
  carries no markdown links, so nothing breaks on deletion.
- `exec-plans/completed/2026-05-30-...` (R35) and `...2026-06-02-...` (R31): completed
  plans describing past state; tracker and `TD-DEBT-NNN` mentions are prose,
  backticks, or bold only, with no markdown links.
- ADR history (R26, R28-R30): the narrative of how surfaces moved over time stays;
  the one markdown link (R26) is de-linked rather than repointed.

## Recommendation: rewrite-and-delete (no pointer stub)

Adopt the plan's stated preference: rewrite the live rows, de-link the historical
links, and delete the tracker file with no pointer stub. Rationale:

- A stub keeps a second future-work surface alive, which taste-distillery's canon
  forbids (one durable owner per concern; `decisions/004-remove-roadmap-surface.md`
  removed the roadmap for this reason). Records become the single source of truth.
- The blast radius is path references, not the 14 records, and the matrix bounds it.
- A stub would still need every inbound link rewritten to be useful, so it adds
  maintenance without removing work.

## WI-R06 runbook

High-level order so verification stays clean. File-level detail is in the matrix.

1. Decide `<REPO_KEY>` and create `.introspection/{config.toml,vocabulary.toml}`
   (see "WI-R06 decisions required").
2. Import the 14 records from the taste-distillery manifest (`introspection import`).
3. Rewrite every matrix row marked **live** (R1-R25) to the records surface or its
   specific record.
4. De-link every matrix row marked **historical** with a link (R26-R27) to plain
   text; never repoint.
5. Update the `scripts/check-docs/taxonomy.go` hint text (R34).
6. Delete the tracker (`exec-plans/tech-debt-tracker.md`).
7. Delete the consumed manifest and its
   `exec-plans/drafts/introspection-migration/` directory in taste-distillery.
8. Verify: `just docs`, `just prose`, a repo-wide link audit covering root files
   (R24-R25 are not caught by `just docs`), then `introspection check` and
   `introspection prime`.

## Decisions and notes

### WI-R06 decisions required before execution

1. **`repo_key` (stutter).** introspection's tech-debt type prefix is the literal
   `TD`, and taste-distillery's native canon prefix is also `TD` (`TD-CARD`,
   `TD-DEBT`, `TD-SPECIMEN`, `TD-BASELINE`). If WI-R06 sets `repo_key = "TD"`,
   canonical IDs become `TD-TD-001` (the dry-run below shows this). Decide: accept
   `TD-TD-NNN`, or pick a non-stuttering key such as `TASTE`, `TDST`, or `DSTL`
   (pattern `^[A-Z][A-Z0-9]{1,15}$`), giving IDs such as `TASTE-TD-001`. This blocks
   the final canonical IDs.
2. **Records-pointer target for generic links.** Most generic "tech-debt tracker"
   links (R1-R4, R7-R10, R14-R16, R19, R24) are "track follow-up here" pointers,
   best served by a records index or `introspection records list` guidance; the
   anchored links (R6, R11-R13) map to specific records. Confirm the pointer target.
3. **ADR-by-ADR treatment.** Repoint the active routing ADR (R17); de-link the
   historical ADR link (R26); leave `decisions/003` history (R28-R29). Confirm.

### Settled WI-R04 decisions

1. **Artifact placement (decided).** Manifest stays in taste-distillery at
   `exec-plans/drafts/introspection-migration/tech-debt-import-manifest.json` (a
   `.json` is invisible to `check-docs`, so it does not affect `just docs` /
   `just prose`); this audit lives in `introspection/investigations/`. An earlier
   draft placed the audit inside taste-distillery, which broke `just docs`:
   `check-docs` requires every hand-authored `.md` under a `content_dir` to be
   reachable from `docs/index.md`, and it parses inline `[label](path)` examples as
   real local links (it strips only fenced code blocks, not inline backticks).
   Indexing a transient migration doc into TD canon only to un-index it in WI-R06
   pollutes the canon, and the only checker-excluded dirs (`generated`,
   `prompt-exports`) are gitignored, which the "committed manifest" requirement
   rules out. Non-blocking: if MP prefers the manifest also live in introspection,
   WI-R06 can read it from there.
2. **All 14 entries imported as `status: open`** (single `## Open items` section, no
   terminal buckets, so no resolution evidence required).
3. **IDs preserved** (number and order); each legacy ID kept as a `tracker` source
   ref.
4. **No per-entry vocabulary `tags`** (machine-derived tags only; taste-distillery
   has no `.introspection/vocabulary.toml` yet, so WI-R06 can add approved topical
   tags after authoring the vocabulary).
5. **`source.tracker_path = "exec-plans/tech-debt-tracker.md"`**, which derives the
   per-entry `tracker` source ref (`...#td-debt-NNN`) as provenance, not a live link.
6. **Typed source-ref kinds and labels.** Most refs use `kind: "doc"` for
   taste-distillery markdown artifacts (the evidence-ref enum has no
   card/specimen/baseline kind); `TD-DEBT-002`, `TD-DEBT-003`, and `TD-DEBT-010`
   carry a `kind: "plan"` ref to `exec-plans/completed/2026-05-30-taste-distillery-bootstrap.md`,
   the completed plan whose deferred-surfaces note (line 192, with the bench
   baseline / on-demand discussion at lines 256-257) grounds their specifics:
   `003` cites the `/gno-bench` skill plus `automations/codex/gno-bench/automation.toml`
   RRULE; `010` cites the `index.yml` `http://#model` slot pointed at Ollama,
   llama-server, LM Studio, or TEI; `002` cites the snapshot-diff harness rationale
   (`gno bench` has no built-in baseline/delta and stays on-demand and out of CI).
   Manifest labels are concise stable identifiers; this audit holds the detailed
   "why this ref supports this entry" rationale so labels do not duplicate it.
7. **Timestamps `2026-06-14T00:00:00Z`** (seconds precision, `Z`); import time fills
   `created_at` / `updated_at` from the run clock.

### Non-blocking review notes

1. **Inferred rationale for sparse entries.** The tracker gives no explicit
   deferral rationale or promote-when trigger for entries `001`, `002`, `009`,
   `010`; reasonable values were filled and marked inline in the manifest as
   `(Assumption: ...)`. Entries `002` and `010` are grounded in the bootstrap plan
   (cited in their source refs); `003` has a partly explicit "GNO out of CI unless a
   future ADR" trigger; `010` has an explicit "no metered hosted default" constraint.
2. **Count reconciliation.** The reshape plan estimated "4 docs"; this audit finds
   **5 docs** (it counts `docs/gno-retrieval.md`, row R13). Treat this audit as
   authoritative.
3. **Stale CHANGELOG ID (R32).** `CHANGELOG.md:25` "closes TD-DEBT-014" names a
   then-current, since-renumbered item, not today's TD-DEBT-014. Leave it; do not
   remap it into a wrong canonical link.
4. **Body wording.** Record bodies were authored from tracker prose plus the cited
   artifacts (read during this audit), not pure paraphrase; MP should sanity-check
   the wording.

## Open questions for MP

The questions for MP are the items under WI-R06 decisions required before execution
above: the `repo_key` choice, the records-pointer target, and the ADR-by-ADR
treatment. That bucket is the single owner; this section is only a pointer.

## Validation evidence

The dry-run command (run from the introspection repo root, where the locally built
`./dist/launcher.sh` lives):

```bash
./dist/launcher.sh import \
    --dry-run \
    --manifest /Users/mp/Projects/personal/taste-distillery/exec-plans/drafts/introspection-migration/tech-debt-import-manifest.json \
    --root <throwaway temp repo> \
    --json
```

returns `ok: true`, `written: false`, all 14 entries, and zero findings against an
empty temp records root. The throwaway temp config used `repo_key = "TD"`, so the
dry-run IDs render as `TD-TD-NNN`, illustrating the stutter in WI-R06 decision 1.
