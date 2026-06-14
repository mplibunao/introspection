# introspection substrate reshape: planning seed (2026-06-14)

## Why this doc exists

This carries forward the decisions from the session that stopped the records-first v1 reshape, so the next plan keeps them after a context compaction. It is planning input for a fresh `/rp-deep-plan`, not the plan itself.

## The pivot

The v1 reshape treated introspection as a records system and taste-distillery as its first heterogeneous adopter. Migrating taste-distillery's tech-debt tracker into records surfaced a deeper question that the records framing cannot answer, so MP decided to stop the current plan and draft a new one around a larger frame.

The trigger: a coverage index file cannot live inside `docs/records/` (introspection parses every file there as a record), yet taste-distillery's `check-docs` requires hand-authored docs to be index-reachable. That collision is a symptom, not the disease.

## The frame

The friction came from two tangled layers.

The substrate is generic, and every governed-docs repo wants it:

- typed markdown with frontmatter and schema validation
- a record lifecycle
- coverage and link checking
- query and retrieval
- a renderer

The domain model is taste-distillery specific:

- what a card means as a distilled rule
- how a card relates to the baselines and specimens that support it
- the strength-based consumption rules that steer agent behavior

taste-distillery's own `check-docs` and introspection both build the substrate layer. That duplication is the root of the coexistence friction.

**Decision:** introspection becomes the generic substrate. taste-distillery's card model and its baselines and specimens become record types expressed on that substrate, while taste-distillery keeps the domain meaning. introspection never learns what a card means. It learns how to validate an arbitrary typed doc, and a card becomes type config that taste-distillery supplies.

**Scope note:** this is additive. backpressure keeps using introspection as a records consumer, unchanged. The new scope of a type system, a generic checker that subsumes `check-docs`, a renderer, and query is driven by the taste-distillery ambition, not by a rework of the records core.

## Conclusions carried from the first oracle consultation

A consultation on the narrow records-versus-host-checker question produced these durable takeaways, now inputs to the bigger design:

- Keep introspection's directory-status layout. The problem was host docs linking to moving paths, not the layout.
- References to records should use a stable ID, not a file path.
- Outbound link validation for record bodies belongs in introspection, so adopters do not patch their own checkers.
- A renderer that resolves an ID to the current location is the real answer to clickable links, not a generated index file.
- Do not flatten taste-distillery to design docs. It is cards plus specimens plus baselines plus ADRs.

The raw consultation response lives in this session's history. Archive it as fenced evidence if the new plan wants it verbatim.

## Remaining items from the stopped plan

Entangled with the taste-distillery question, to rethink under the new frame:

- the taste-distillery tracker migration itself
- taste-distillery steady-state CI wiring for `introspection check`
- the adoption playbook in `docs/adoption.md`

Independent, fold forward into the new plan as-is:

- the npm release plus the backpressure published-pin switch, still blocked on MP's manual npm Trusted Publishing browser step
- mutation-testing the reshaped introspection code
- enabling the `max-statements` lint in backpressure through a tech-debt record plus decomposition

## Already banked from the stopped plan

The new plan builds on what already shipped:

- the `prime` and `records list` split
- the config rename to `[records.list]`
- the generic `import` mechanic
- the `init` scaffolder
- introspection's ai-tells prose and commit gate
- the fix to taste-distillery's Vale gate

The committed taste-distillery migration manifest and its reference audit stay as input for the eventual migration.

## Open questions for the new plan

- How does introspection's type system let cards and specimens be registered types, with their required headings and relationships validated like any other type?
- How does introspection's generic checker take over what `check-docs` validates today, such as card surfaces and index rows and use-case links?
- What is the renderer architecture, and how does it resolve a reference across moving files?
- What is introspection's relationship to GNO retrieval?
- What is the staged migration path, and does taste-distillery migrate fully now or wait until the type system can host its model?
- Is backpressure the cleaner v1 adoption proof while the substrate grows?

## Introspection improvements to capture as tech-debt

- Classify files in a path-aware way: ignore a non-record such as an index file, but keep a malformed file in a real type-and-status slot as an error.
- Graceful degradation in `records list` only, never in `check`.
- Outbound link validation for record bodies.
- A generated host-facing index or renderer for adopters that run a doc checker.
