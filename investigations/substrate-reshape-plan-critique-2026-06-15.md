# Plan critique: introspection substrate reshape (2026-06-15)

**Reviewer scope.** Plan-only review of [`introspection-substrate-reshape-2026-06-14.md`](../exec-plans/active/introspection-substrate-reshape-2026-06-14.md). It does not build or change the plan. Grounded against the Effect-CLI reference shape in [`introspection-v1-bootstrap-2026-06-10.md`](../exec-plans/active/introspection-v1-bootstrap-2026-06-10.md), the t3code CLI seam (`apps/server/src/bin.ts`, `cli/config.ts`), and a spot-check of current repo state (AJV is a live dep; `effect/unstable/cli`/`@effect/platform-bun` are not yet wired in `src/`; `src/services/` does not exist; the named legacy files exist).

**Verdict.** The plan honors all six fixed decisions, with no contradictions. The transitional implicit `tech-debt` default (IX-SR-04 to IX-SR-15) is correctly framed as transitional rather than a breach of "no implicit default." The reshape is a real greenfield Effect rewrite rather than a wrapper, so the spec is appropriately heavy on contract and light on tactics. The architecture section is strong on intent; the gaps below are in the mechanics an implementer would have to guess at.

## 1. Top under-specified seams

1. **Effect service/Layer graph and `AppLayer` composition (highest risk).** "Resolved architecture" gives a 13-row responsibility table but no dependency DAG, no layer ordering, and no resolution of the one open question the bootstrap plan flagged: "one shared `AppLayer` vs per-handler re-wiring" (bootstrap section "Effect CLI reference shape"). t3code's `bin.ts` is a thin `Layer.mergeAll` plus per-command layers; for roughly 13 services with real edges (`Checker` needs `RecordTypeRegistry` needs `ManifestCompiler` needs `SchemaValidation` plus `PresetCatalog` plus `RecordTypeManifestLoader`; `Resolver` needs `RecordStore` plus `LayoutResolver` plus `RecordTypeRegistry`) the composition is non-trivial. IX-SR-03 ("introduce the service graph") is XL and assumes this shape is already decided. Resolve the `AppLayer` choice and the service dependency DAG before IX-SR-03, or that XL becomes a guess.

2. **First-party extension-hook mechanism (second highest risk; this is the seam that keeps taste policy out of the substrate).** The plan names which taste rules become extensions (use-case ordering, proposed-card review-context, private/work publish) but never the contract. Three things stay unspecified. What is the hook signature (record or corpus in, findings out)? How does a manifest's "allowlisted first-party extension IDs" dispatch to `src/extensions/taste/*`? How is "first-party only, no repo-local code" enforced? Until the hook interface is fixed, IX-SR-19 (XL) cannot start cleanly and domain policy risks leaking into the generic checker.

3. **Field-spec to Effect Schema compilation, plus `*.schema.json` generation.** "Validation boundary" says a manifest declares fields "(name, kind, enum/pattern/array constraints)" and the compiler emits `*.schema.json` via `JSONSchema.make`. Gaps: the field-spec kind vocabulary; how **nested blocks** (bootstrap's `source`/`resolution`/`conversion_targets`) are expressed in a flat field-spec; how the **GNO-flat-vs-nested** split (bootstrap decision #6) is preserved; and three carried-over JSON-Schema caveats from the taste recon (unknown-key rejection, TOML-date-as-string, Draft-4 expressibility for Taplo). Also unresolved: does the field-spec subsume the taste **two-owner split** (schema owns shape, `taxonomy.json` owns vocab) or reference it? IX-SR-06 (XL) and IX-SR-14's vocab tags both depend on the answer.

4. **Per-type layout mechanics across the four kinds.** Forward path templating is clear; the reverse and the lifecycle operations are not. (a) Discovery and classification: the rule that distinguishes a "document under a document root" from a "malformed record in a type slot" is asserted, not given. What happens when a document root and a type slot overlap a path? (b) Transition: directory-status moves files between status dirs, while path-template and directory-backed carry status in frontmatter, so does `record transition` rewrite frontmatter only for those? (c) Resolver: `canonicalPath` must be produced for all four kinds, but the canonicalization rule per layout is absent, and for path-template, whether the ID is path-derived or frontmatter-declared is absent too. IX-SR-08 (XL) carries all of this.

5. **Identity strategies (least under-specified, mostly inherited).** Three strategies are well named with examples, and the lock plus no-clobber allocation contract is inherited from bootstrap decision #3. Real gap: the allocation mechanics for declared-pattern (scan plus max+1, like the repo-scoped one?) and how **manual declared-pattern** import detects collisions and decides who supplies the ID. Small, but it sits in IX-SR-07, and IX-SR-15 hangs off it (see section 3).

## 2. Specificity balance

- **Appropriately fixed (keep):** config-surface TOML (`[[records.types]] use = "preset:tech-debt"`), the guardrail list, the service responsibility table, and `*.schema.json` as generated-not-runtime. These are public contracts, so fixing them is the right call.
- **Too thin to call "done":** IX-SR-19's "any non-generic domain policy MP accepts" and IX-SR-20's "differences are explicitly accepted" have no decision owner and no acceptance gate, so they will stall at execution. Name the arbiter and the gating artifact (the parity report).
- **Mild over-specification:** IX-SR-16 enumerating exact mutation targets is borderline; acceptable, since it doubles as coverage intent.

## 3. Contradictions and dependency correctness (the three you flagged)

- **(a) Lockstep cutover: coherent in intent, but one dependency edge is likely missing.** IX-SR-15 removes the transitional default and requires backpressure's `check`/`prime`/`records list`/`export` to work via explicit config, yet it is scheduled right after **IX-SR-07**, before IX-SR-09 (checker rebuild) and **IX-SR-10 (commands route through `RecordTypeRegistry` from config)**. The scheme is only correct if command-surface type-resolution-from-config lands at **IX-SR-04**, not IX-SR-10. The plan never says where that wiring lands, and that is the single biggest coherence risk. Either state that IX-SR-04 wires commands to the config-derived registry (so IX-SR-15-after-07 is safe), or add IX-SR-10 to IX-SR-15's dependencies. As written, an implementer could land IX-SR-15 on commands still bound to the old default that IX-SR-15 just deleted.
- **(b) IX-SR-18 decoupled from IX-SR-17: sound.** Taste tech-debt migration consumes the locally built / mise-pinned binary and depends on IX-SR-15 (plus IX-SR-08/12), not the npm publish. Correct, and a good de-risking move. Nothing to fix.
- **(c) The "22-item chain" over-serializes.** Real parallel tracks the plan should name: **{IX-SR-13, IX-SR-14}** both gate on the checker (09) plus resolver-for-`ix://` (12), but 14's coverage, relationship, and registry passes do not depend on 13's link/anchor pass, so the 14-after-13 edge is artificial. **IX-SR-19 manifest authoring** can overlap **IX-SR-18** (different record types in the same repo; the only shared prerequisite is taste config v2). After IX-SR-15 the work splits into a **release track (16 to 17)** and a **taste track (18 to 19 to 20)** that rejoin only at IX-SR-20 (which needs 17 for steady-state CI). IX-SR-01 can overlap IX-SR-00.

## 4. Over-planning and XL-splitting

Seven XL items is a lot of big-bang risk. Two should be split:

- **IX-SR-14 (XL)** bundles four independent, individually testable checker capabilities, so it should split into S/M items (which also parallelize, per section 3c):
    - coverage BFS
    - required-artifact rules
    - relationship-target validation
    - registry-table mirrors
- **IX-SR-03 (XL, the whole service graph at once)** is the riskiest single item, given the codebase has no `src/services/` yet. Stage it: the base services (config/store/clock/schema) green against IX-SR-01 fixtures first, then the higher services (checker/resolver/import/export).
- **IX-SR-19 (XL)** can separate manifest modeling, extension-hook work, and the parity report into distinct items.

No item is a clear candidate for deletion; the plan is well scoped.

## 5. Questions whose answers change execution order

1. **Does command type-resolution-from-config land at IX-SR-04 or IX-SR-10?** Determines whether IX-SR-15 can legally run after IX-SR-07 (section 3a). Highest priority.
2. **Is the field-spec to Schema compiler the same one used for config and frontmatter, or three separate compilers?** If shared, IX-SR-04's config-schema work front-loads IX-SR-06 and they should be sequenced to reuse it.
3. **Is IX-SR-19 blocked on IX-SR-18, or only on substrate capabilities plus taste config?** Determines the taste-track parallelism.
4. **One `AppLayer` or per-command layers?** Shapes IX-SR-02/03 structure and the guardrail that forbids cross-layer access.

---
*Sources: reshape plan sections Fixed decisions, Resolved architecture, IX-SR-00 to IX-SR-21, Verification strategy; bootstrap plan sections "Effect CLI reference shape" and decisions #3/#6/#9/#10; t3code `bin.ts`/`cli/config.ts`; repo spot-check 2026-06-15.*
