---
schema_version: 1
id: IX-TD-017
repo_key: IX
record_type: tech-debt
number: 17
title: "Tighten src/ cohesion: split the core/ grab-bag into focused modules"
status: open
type: introspection-record
category: tech-debt
visibility: local-only
created_at: 2026-06-17T00:34:34Z
updated_at: 2026-06-17T00:34:34Z
tags:
  - record/tech-debt
  - repo/introspection
  - status/open
  - visibility/local-only
source:
  discovered_at: 2026-06-17T00:34:34Z
---
## Problem

src/ groups by technical layer in a hexagonal ports-and-adapters shape, which suits this single-bounded-context CLI. The weak spot is cohesion inside `core/`, a 12-file folder that lumps unrelated sub-areas together: `id`, `lifecycle`, `validation`, `tags`, `prime-selector`, the `record-type` contract, and a vocabulary sub-area spread across four files (`vocabulary.ts`, `vocabulary-types.ts`, `vocabulary-file.ts`, `vocabulary-validation.ts`). The `id` concern is also split across layers, with `core/id.ts` sitting next to the `store/id-allocator` files. The folder reads as a catch-all that hides the real sub-domains.

## Why deferred

The shape is functional and bootstrap v1 ships on it without issue. The natural moment to restructure is the Effect-native substrate reshape tracked in `docs/exec-plans/active/introspection-substrate-reshape-2026-06-14.md`, which already rewrites this layer. Folding the cohesion cleanup into that churn avoids a separate disruptive move and a wasted rebase.

## Revisit trigger

Address this during the substrate reshape. Evaluate giving the heavy sub-areas their own modules beside `core/`. A `src/vocabulary/` module would hold the four vocabulary files. The `lifecycle` and `ids` sub-areas would get cohesive homes too, and `core/` would keep only the record-type contract and shared domain primitives. Keep the hexagonal layering and decide where the vocabulary file-IO seam belongs, either its own module or `store/`. Also document the intended `src/` structure convention where agents read it, with a `docs/` architecture note linked from `CLAUDE.md`, so future agents follow it and the grab-bag does not regress. Treat the target shape as a design call for the reshape rather than a fixed prescription.

## Done when

core/ no longer mixes unrelated sub-areas; the heavy sub-areas each gain a cohesive home; the id concern is no longer split across core/ and store/; and the structure convention is documented where agents will read it.
