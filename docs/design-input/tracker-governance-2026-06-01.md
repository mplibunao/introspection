# Tracker governance: plan

> **Status: SUPERSEDED (2026-06-01).** Backpressure will adopt the cross-repo `introspection` system rather than hand-roll its own tracker governance. This plan is preserved as design input. Its write-gate, entry schema, and the TD-001..010 keep/delete audit feed introspection's tech-debt record type. Final disposition (archive or delete) is owned by the introspection deep-plan's reconcile step. See `/Users/mp/Projects/personal/introspection/docs/design-input/introspection-seed-2026-06-01.md`.

## Goal

Improve how the tech-debt tracker is governed in `backpressure` so it stays a small, focused, reviewable backlog of accepted future work rather than a pile that agents write to reflexively. Preserve the history of closed and rejected items without paying for it on every read. Raise entry quality so intent is explicit. Fix the upstream global instruction that over-triggers tracker writes. Define a distillation path to other repos once the backpressure model proves out.

## Background

### The user's problem

Three failure modes plus one root cause:

- **P1, over-eager writes.** Agents add entries for same-session work, non-goals, or speculative ideas. Over time the tracker grows and reading it costs context. The user has had trackers with 60-plus entries in other repos.
- **P2, thin entries.** Agents write entries with too little context. A future reviewer (human or agent) cannot tell what the item means or how to act, so the entry becomes useless and gets deleted.
- **P3, growth plus perceived deletion friction.** Growth consumes agent context on every read. The user believes deleting or reordering entries is painful because "things reference items."
- **P4, root cause partly upstream.** The user's global instruction tells agents to persist deferrals aggressively. It was added because past agents *hid* gaps in long-horizon work, which is the opposite and worse failure. The instruction now over-fires on brainstorming and non-accepted ideas.

Scope: fix `backpressure` first. If the model is good, distill it into other repos. Fix the global instruction where there is a real defect. This is a planning task, so it ends at a reviewable plan with no code.

### Current state in `backpressure`

- Tracker: `docs/exec-plans/tech-debt-tracker.md`. Nine entries `TD-001` to `TD-010` with a gap at `TD-005`. The header at `tech-debt-tracker.md:3` is a single paragraph that carries all governance at once. It defines what belongs (accepted deferrals for future sessions or phases), states that the tracker is not a same-session task list, pins ID stability and gap meaning, and notes that a deferral is not real until written down.
- No ADR or design doc owns the tracker, the deferral policy, or the doc taxonomy. Repo `CLAUDE.md:16` only links the tracker. `CLAUDE.md:28` states the exec-plan `active/` to `completed/` lifecycle. Doc taxonomy and ownership live as prose in a completed exec-plan work item (`backpressure-monorepo-setup-2026-05-29.md:104-116`) plus scattered DRY "owned by" lines (`rule-intake.md:7`, `preset-architecture.md:9-11`, `rule-pack-architecture.md:29-30`).

### Entry-quality audit (settled with the user)

- **Keep:** `TD-007` (stack-neutral React preset), `TD-008` (test-integrity rules and a `tests` preset), `TD-009` (catalog domain split), `TD-010` (`no-effect-as` barrel policy). All are concrete future work with a clear next step.
- **Remove from active:** `TD-001` (rejected app-coupled rules, a non-goal), `TD-002` (duplicate of ADR 003 `monorepo-scope-and-naming`), `TD-004` (stale ESLint RuleTester cross-check that contradicts the oxlint-first decision), `TD-006` (a mix of five unrelated and under-specified ideas), `TD-003` (vague general and boundaries growth, already covered by `rule-intake.md`; just delete, no fold).
- These illustrate the failure modes: rejected ideas tracked as work, duplicates of existing ADRs, stale entries from abandoned directions, and mixed-bag entries. Under the new model these are archived with rationale, not silently dropped (decision 4).

### Deletion coupling: the premise is partly wrong in backpressure

A full-repo search for `TD-0` returns nine matches, all inside the tracker (the heading definitions). No other doc references a `TD-xxx` ID. Deleting or moving an entry breaks no ID-based links, and the gap-semantics rule already legitimizes removal. The real coupling is topical prose duplication: `references/mutation-testing.md:125` ("...Tracked in tech-debt-tracker.") and `design-docs/preset-architecture.md:96` (describes the future `react` preset, the same topic as `TD-007`). Those mentions will not auto-update if an entry moves. That makes "deletion is painful" a duplication problem, not an ID-reference problem.

### claude-toolkit's own trackers: the detail model to propagate

claude-toolkit already runs the pattern the user wants to emulate, split across more files. Trackers are skill-scoped (`.claude/skills/knowledge-crawl/references/tech-debt-tracker.md`, `meeting-orchestrate/...`, `meeting-record/...`, `transcript-synthesis/...`, `whisper-transcribe/...`) plus a repo-level `docs/exec-plans/tech-debt-tracker.md` and `docs/AGENT_BACKLOG.md`. Two things to lift:

- **Rich entries** the user admires. Entries carry `Problem`, `Why deferred`, `Discovered` (date plus originating context), `Trigger to revisit`, a `Suggested approach`, and explicit "retained because" rationale (`knowledge-crawl/.../tech-debt-tracker.md:420,433,501`). Entries run roughly 40 lines each. This is the bar where a future agent understands intent instead of guessing.
- **Anchor-based cross-references.** Docs link entries by slug (`meeting-orchestrate/.../tech-debt-tracker.md:28-29` points to `knowledge-crawl/.../tech-debt-tracker.md#external-asset-uri-scheme`). In claude-toolkit, deletion and reorder are coupled by design. The cross-linked, split-by-file model is the target end-state, not a warning.
- The root-cause finding still stands: claude-toolkit has many trackers but no governance-policy doc defining the write-gate, schema, or lifecycle. That doctrine is what this plan produces and distills. (`docs/backlogs/bd.md` suggests a prior beads trial, consistent with the user finding it overkill.)

### Root cause: exact edit surface

- The over-eager rule is `claude-toolkit/GLOBAL_CLAUDE.md:4` (persist any deferral "in the SAME response... Tracker first; relevant phase stub second; raise to user if no clear home"). The mirror is `GLOBAL_AGENTS.md:4`, identical text.
- The session-audit rule is `GLOBAL_CLAUDE.md:5` and `GLOBAL_AGENTS.md:5` ("When user mentions 'finishing the session', audit... Anything still verbal-only gets written down").
- `~/.claude/CLAUDE.md` is a symlink to `claude-toolkit/GLOBAL_CLAUDE.md` (`setup.sh:128`; `~/.codex/AGENTS.md` points to `GLOBAL_AGENTS.md` at `setup.sh:132`). Editing the repo file is editing the live global file, with no sync step. `toolkit-lint` checks both (`.claude/skills/toolkit-lint/SKILL.md:18`), so edits must be mirrored.
- Tracker handling elsewhere is a posting precondition in PR-reply skills (`gh-pr/references/watch-and-reply.md:129`: `defer` requires an existing `trackerRef`) and read-only context in `doc-garden/references/audit.md:148-149`, not a central doctrine.
- Invariant to preserve: the global rule exists to stop the worse failure where agents silently hide or forget gaps in long-horizon work. The fix keeps "accepted, concrete, unresolved gap discovered during real work, so persist it" while killing "brainstormed, possible, or rejected idea, so write it reflexively."

### External options landscape

This answers the "is a different tool better?" question.

- **beads** ([steveyegge/beads](https://github.com/steveyegge/beads)): a git-backed agent tracker. It stores issues in SQLite with a git-tracked JSONL export, runs a background daemon, exposes a CLI-first `--json` interface, uses hash IDs, and models a dependency graph. The user tried it and found it overkill.
- **Backlog.md** ([MrLesk/Backlog.md](https://github.com/MrLesk/Backlog.md)): markdown tasks plus a terminal Kanban board and web UI.
- **git-issues** ([steviee/git-issues](https://github.com/steviee/git-issues)): markdown plus YAML frontmatter under `.issues/`.
- **Claude Code auto-memory** ([docs](https://code.claude.com/docs/en/memory)): already in use here (`MEMORY.md` plus topic files). It loads every session, has a roughly 200-line cap, and holds facts and preferences. It is not a reviewable backlog of work to act on, and it is weak for triage and dependencies.
- **Insight:** every alternative is a storage or format change. The pain (P1 through P4) is governance and judgment, namely when to write, what content to include, and when to archive. Heavier tooling, especially beads, adds ceremony and, by lowering write friction, could make over-eager writes worse. The format is not the lever.

## Approach

The lever is making agent judgment explicit at the point of use, plus a file layout where detail and cheap reads stop competing. No tooling migration is involved. The model, in order:

1. **Write-gate first.** A sharp test for what earns an entry.
2. **Detail-oriented schema.** Entries explain intent and rationale so a future agent acts instead of guessing, modeled on claude-toolkit's proven fields. Detail is welcomed but not mandatory.
3. **Lifecycle by file, not deletion.** Open accepted work lives in the active tracker. Closed and rejected items move to a separate archive file with disposition and rationale. History is preserved and the active read stays cheap. This resolves the quality-versus-growth tension because per-read cost comes from the count of open entries, not their depth or the all-time total.
4. **Authoritative policy in a dedicated design doc.** It owns the write-gate, schema, and lifecycle. `CLAUDE.md` routes to it. The tracker header carries only a short pointer plus the write-gate summary.
5. **Global hardening this session, after the local model lands.** Fix the upstream root cause once backpressure gives a concrete, repo-agnostic model to distill.
6. **Distill by pattern, not by copy.** Other repos adopt the same shape, including the detail standard, with repo-local policy and no shared tooling.

### Resolved decisions (per the Mid-flow checkpoint)

**1. Write-gate.** An item earns a tracker entry only when it is all of: accepted as real future work; concrete enough to state problem, trigger, and done-condition; unresolved and intentionally not handled now; future-session or future-phase work, not the current active plan; and not already owned by an ADR, design doc, active plan, or intake procedure. Negative cases that must not be tracked as open work: rejected ideas and non-goals; same-session tasks; "maybe later" brainstorms with no accepted decision; vague themes without a trigger or done-when; restatements of existing ADR or design-doc policy; and work already owned by an active plan item.

**2. Entry schema (detail-oriented, modeled on claude-toolkit).** The fields are `Problem` (the gap), `Why deferred` (why not now), `Discovered` (origin plus date when known), `Trigger to revisit` (what makes it timely), `Suggested approach` or `Done when` (direction or completion signal), and `Owner/links` (owner doc, ADR, plan, reference). The first four plus owner-links mirror claude-toolkit's entries; `Done when` is this plan's own addition, so do not attribute it to claude-toolkit. The bar is that intent and rationale are explicit so a future agent acts instead of guessing. Critically, these fields mark the ceiling of what is useful, not a mandatory template. A thin-but-clear entry is allowed. The goal is to prevent useless entries without recreating the heavyweight issue-template friction the gate is meant to remove. This stays affordable because the file layout (decision 4) keeps the active backlog short, so per-read cost is driven by the number of open entries, not their depth.

**3. Policy home is a dedicated governance design doc.** Author `docs/design-docs/tracker-governance.md` as the authoritative owner of the write-gate, entry schema, lifecycle and archival rules, and file structure (including the domain-split trigger). `CLAUDE.md` "Start here" links it. The tracker header carries only a short write-gate summary plus a pointer, per DRY, so the doc owns the policy and the header does not restate it. This fits the repo's stance that design docs hold current-state governance and `CLAUDE.md` routes to them. The DRY split is explicit: the header carries a one-sentence gate plus the inline negative-case list (the negatives are what stop bad writes and are cheap to carry at the point of use); the doc owns the full positive conditions, schema, lifecycle, rationale, and worked examples; `CLAUDE.md` only links the doc.

**4. Completion and lifecycle: archive to a separate file, do not delete.** Open accepted work stays in `tech-debt-tracker.md`. When an entry is completed, rejected, superseded, or moved, it is relocated to a separate archive file (default `docs/exec-plans/tech-debt-closed.md`) with a disposition (done, rejected, superseded, or moved), a one-line rationale, and a date, rather than hard-deleted. This preserves history. The rejected record also stops future agents from re-proposing settled non-goals. It keeps the active tracker small, so the per-read cost an agent pays is just the open backlog. IDs stay globally stable and are never reused. A gap in the active file resolves to an entry in the archive. Each archived record is a stub rather than the full schema. It keeps the original ID and the original `Problem` statement, recognizable enough that a later agent will not re-propose a settled non-goal. The disposition and a dated rationale sit alongside, and new rows append in ID order. Domain-splitting the active file by area (claude-toolkit's by-skill model) is deferred until the open count actually grows, because it is premature structure with a handful of entries; the design doc names the trigger. Before relocating, fix topical prose backlinks (`mutation-testing.md` and the `preset-architecture.md` future-work section), because that, not ID references, is the real coupling. A prune pass runs at plan-closeout or release-readiness. For each open entry, ask whether it remains accepted future work, whether it stayed concrete, whether anything else now owns it, and whether it is still worth its context cost.

**5. Global-instruction fix: this session, after the local model lands.** Edit `GLOBAL_CLAUDE.md` and `GLOBAL_AGENTS.md` (lines 4 and 5) once the backpressure model exists, so the wording distills a proven model and stays repo-agnostic. Preserve the invariant that a real, unresolved long-horizon gap an agent accepts during actual work must still be persisted. Drop the reflexive persistence of brainstorms, rejected ideas, same-session work, duplicate owner-doc content, and vague future cleanup. The "finishing the session" audit (line 5) should persist only accepted unresolved deferrals, not every verbal possibility.

**6. Distillation.** Other repos reuse the pattern and write their own copy of the policy. Each repo gets a local write-gate, the detail-oriented schema, the archive-don't-delete lifecycle, an owner-doc dedup check, and a router link. Apply the same detail standard to other repos' trackers, including claude-toolkit's, which already partly models it. Do not add a generic tracker tool, skill, or package unless multiple repos prove the manual policy insufficient.

## Work Items

### Item 1, author the tracker-governance design doc
**Goal:** Create the single authoritative home for tracker policy.
**Done when:** `docs/design-docs/tracker-governance.md` defines (a) the write-gate and its negative cases, (b) the detail-oriented entry schema and a clear statement that the fields are a ceiling, not a mandatory template, (c) the lifecycle (open in the active tracker; archive closed, rejected, superseded, or moved entries to the archive file as stubs with disposition, rationale, and date; IDs stable and never reused), (d) the file structure and the trigger for domain-splitting the active file later, (e) a small worked-example table of write-gate outcomes (accepted, rejected, same-session, vague-maybe, duplicate-ADR, active-plan-owned) as the doc's permanent examples, authored here and not deferred to verification, and (f) the exact tracker-header payload (a one-sentence gate plus the inline negative-case list plus a pointer to the doc). It follows the repo's DRY "this document owns X" convention and stays concise enough to read before acting.
**Key files:** new `docs/design-docs/tracker-governance.md`
**Dependencies:** none
**Size:** M

### Item 2, restructure the tracker into active plus archive files
**Goal:** Establish the two-file layout that keeps active reads cheap while preserving history.
**Done when:** `tech-debt-tracker.md` holds only the open accepted backlog and a short header (the write-gate summary plus a pointer to the governance doc, replacing the current all-in-one paragraph). A new archive file (default `docs/exec-plans/tech-debt-closed.md`) exists with the documented stub format from decision 4 (ID, original `Problem`, disposition, dated rationale, appended in ID order). The active header may state that gaps resolve to the archive even though the gaps themselves are created later in Item 4; Item 2 creates the empty archive and the format.
**Key files:** `docs/exec-plans/tech-debt-tracker.md`, new `docs/exec-plans/tech-debt-closed.md`
**Dependencies:** Item 1
**Size:** M

### Item 3, route to the governance doc from CLAUDE.md
**Goal:** Make tracker discipline discoverable without `CLAUDE.md` owning the policy.
**Done when:** `CLAUDE.md` "Start here" links `docs/design-docs/tracker-governance.md`; the existing tracker link and the `active/` to `completed/` lifecycle line remain; no write-gate or schema text is duplicated into `CLAUDE.md`.
**Key files:** `CLAUDE.md`
**Dependencies:** Items 1, 2
**Size:** S

### Item 4, migrate and clean current entries
**Goal:** Apply the settled hygiene decisions under the new layout.
**Done when:** `TD-008`, `TD-009`, and `TD-010` already largely conform and stay with a light touch only. `TD-007` is the real upgrade, and its owner is decided here first (tracker-owns-backlog versus `preset-architecture.md`-owns-summary) so it is written once, not reshaped twice; backfill its `Discovered` as "pre-v0 baseline, origin not recorded" rather than a fabricated date. `TD-001` (rejected non-goal), `TD-002` (duplicate of ADR 003), `TD-004` (superseded by oxlint-first), `TD-006` (mixed bag; see the open question on salvage), and `TD-003` (superseded, covered by `rule-intake.md`) are relocated to the archive as stubs with disposition, rationale, and date. IDs are not renumbered or reused, and the active file's gaps correspond to archived IDs.
**Key files:** `docs/exec-plans/tech-debt-tracker.md`, `docs/exec-plans/tech-debt-closed.md`
**Dependencies:** Items 1, 2
**Size:** M

### Item 5, repoint topical duplication exposed by the migration
**Goal:** Fix the real coupling, which is owner and reference prose pointing at moved tracker topics.
**Done when:** `mutation-testing.md:125` no longer uses the vague "tracked in tech-debt-tracker" wording unless it points to a surviving concrete entry. `preset-architecture.md` is aligned to the `TD-007` ownership decided in Item 4 without re-litigating it: if the tracker owns the backlog item, the doc stays brief and links it; if the doc owns the summary, `TD-007` becomes a short pointer. No doc implies a moved or active entry sits somewhere it does not. Prefer links over duplicated prose.
**Key files:** `docs/references/mutation-testing.md`, `docs/design-docs/preset-architecture.md`, `docs/exec-plans/tech-debt-tracker.md`
**Dependencies:** Item 4
**Size:** S

### Item 6, harden the global deferral instructions
**Goal:** Fix the upstream root cause without losing the safety invariant.
**Done when:** `GLOBAL_CLAUDE.md` and `GLOBAL_AGENTS.md` are updated consistently (lines 4 and 5); the new rule distinguishes accepted future work from brainstorms, rejected ideas, vague maybes, same-session tasks, and duplicate owner-doc content; the session-audit rule persists only accepted unresolved deferrals; the wording stays repo-agnostic with no backpressure-specific files; and `toolkit-lint` consistency holds.
**Key files:** `claude-toolkit/GLOBAL_CLAUDE.md`, `claude-toolkit/GLOBAL_AGENTS.md` (reference only: `setup.sh`, `.claude/skills/toolkit-lint/SKILL.md`)
**Dependencies:** Items 1, 2 only. The global rewrite distills the policy model (write-gate, schema, lifecycle from Items 1 and 2), not the entry migration or prose repointing, so it can land mid-plan. This satisfies "after the local model lands" and de-risks the this-session commitment by not pushing it to the end.
**Size:** M

### Item 7, define distillation guidance for other repos
**Goal:** Capture how to reuse the model elsewhere without copying stale policy text.
**Done when:** a short distillation note (in this plan or its closeout) says other repos adopt a local write-gate, the detail schema, the archive-don't-delete lifecycle, an owner-doc dedup check, and a router-only link; cites claude-toolkit's existing trackers as the detail model and flags raising the detail standard there; states explicitly not to adopt beads, Backlog.md, git-issues, or new tooling unless the manual policy fails; and creates no cross-repo policy file prematurely.
**Key files:** `docs/exec-plans/active/tracker-governance-2026-06-01.md` (later, its completed closeout)
**Dependencies:** Items 1, 2, 6
**Size:** S

### Item 8, verify docs and governance behavior
**Goal:** Prove the change tightened behavior without breaking prose or toolkit expectations.
**Done when:** backpressure prose checks pass on changed docs (`pnpm prose`, or the narrower changed-file check); `pnpm check` runs if any package script or validation surface is touched; `toolkit-lint` passes after the global edit; targeted searches confirm the migration (`TD-0` now appears only in the active tracker and the archive; `tech-debt-tracker` backlinks reviewed for staleness; archived IDs not reused); the write-gate worked-example table authored in Item 1 is exercised so each scenario yields the documented outcome; and a quick check confirms that an agent reading the active backlog does not need to load the archive and that a gap-to-archive lookup works.
**Key files:** `package.json`, `docs/references/prose-gate.md`, changed docs from Items 1 through 7
**Dependencies:** Items 1 through 7
**Size:** S

## Risks and mitigations

- **DRY drift (primary risk).** The new structure spreads related policy across a governance doc, a one-line tracker header, an archive file, and the `CLAUDE.md` link, and those copies can fall out of sync over time. That is the real cost of the structure, not runtime overhead. Two mitigations hold it down:
  - the header is a near-pure pointer plus the negative-case list (decision 3);
  - the governance doc stays tight and also hosts the worked-example table (Item 1).
- **The governance doc may be over-structure for a small backlog.** The context_builder second opinion recommended against a separate design doc for v1 and warned that verbose policy gets skipped. The user overrode this knowingly. Recording it here keeps the counter-argument on the record. Mitigate the same way: a concise doc and a near-pure pointer header, so the policy is read rather than skipped.
- **The detail schema could recreate template friction.** If agents treat six fields as mandatory, the gate's friction-reducing goal is undone. Mitigate by documenting the fields as a ceiling and explicitly allowing thin-but-clear entries (decision 2).
- **The global edit is the highest-stakes change.** It touches live cross-project behavior through a symlink. Mitigate this by landing it only after Items 1 and 2 (the model). Both files must be mirrored, and `toolkit-lint` must pass (Item 6).

## Open Questions

The checkpoint decisions are settled (design-doc policy home; archive-don't-delete; detail schema; globals this session; TD-003 delete). These remain for the implementer or a quick user confirmation:

- **Archive layout and naming.** Default: one `docs/exec-plans/tech-debt-closed.md`, with domain-splitting deferred until the open count grows. Confirm whether a single archive file is right or whether to split closed versus rejected from the start, and confirm the file names (`tech-debt-closed.md` and `docs/design-docs/tracker-governance.md`).
- **TD-006 salvage.** Two of its five sub-ideas (`no-js-extension-imports` and `no-opaque-instance-fields`) are real rule candidates. Default: re-home those two into `rule-intake.md` as candidates and archive the rest of `TD-006` as rejected, so real future rules are not lost. Alternative: archive the whole entry to keep Item 4 simpler.

## References

- Tracker: `docs/exec-plans/tech-debt-tracker.md`
- Doc taxonomy origin: `docs/exec-plans/completed/backpressure-monorepo-setup-2026-05-29.md:104-116`
- Ownership DRY lines: `docs/design-docs/rule-intake.md:7`, `docs/design-docs/preset-architecture.md:9-11`, `docs/design-docs/rule-pack-architecture.md:29-30`
- Global rules: `claude-toolkit/GLOBAL_CLAUDE.md:4-5` (plus `GLOBAL_AGENTS.md:4-5` mirror), symlink via `setup.sh:128,132`, lint at `.claude/skills/toolkit-lint/SKILL.md:18`
- Topical coupling: `docs/references/mutation-testing.md:125`, `docs/design-docs/preset-architecture.md:96`
- claude-toolkit trackers (detail model): `.claude/skills/knowledge-crawl/references/tech-debt-tracker.md` (lines 420, 433, 501), `.claude/skills/meeting-orchestrate/references/tech-debt-tracker.md:28-29`
- Plan critique: `docs/reviews/tracker-governance-plan-critique-2026-06-01.md`
- External: [beads](https://github.com/steveyegge/beads), [Backlog.md](https://github.com/MrLesk/Backlog.md), [git-issues](https://github.com/steviee/git-issues), [Claude Code memory](https://code.claude.com/docs/en/memory)
