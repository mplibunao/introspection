# Provider ecosystem direction

**Status:** Design input, captured 2026-06-19. Not a committed plan and not v1 work — it informs a
future provider exec-plan, to be picked up after the substrate reshape. The decisions below are
settled; the mechanics are for that future plan to detail.

## Ambition

introspection grows from a personal repo-local record substrate into a **shareable company-brain**: a
tool others install and extend, where governed records and context documents about many sources
(errors, tickets, docs, conversations, meetings) accumulate and stay queryable. introspection is
already a public repo and npm package, so "shareable" is a real target.

## Architecture: a consumer-pluggable provider ecosystem

A **provider** integrates one source (sentry, jira, confluence, slack, github, meetings).

- Providers ship as **separate npm packages**, published independently — by the maintainer or authored
  by consumers for their own sources.
- Consumers **install only the providers they need**; the core stays lean as sources grow without
  bound.
- Each provider is **paired with its own skill** (deterministic scripts + agent-run markdown), because
  most sources need judgment (what is signal, dedupe, synthesize), not a mechanical pull.

This is the plugin-ecosystem shape proven by eslint, vite, backstage, and terraform providers.

## Decision: out-of-process records handoff is the default boundary

A provider runs **outside** the record kernel. It fetches, authenticates, redacts, dedupes, and
synthesizes on its own, then hands introspection a **replayable batch** (an import manifest + context
documents + provenance + artifacts) that `import` consumes. introspection never runs provider code for
acquisition.

In-process code loading is a **later, narrow capability** — for *pure* trusted enhancement hooks only
(a prime summary, a renderer, local diagnostics), never for acquisition.

Why out-of-process is the default, in terms of what scales as providers multiply:

- **Failure isolation** — a provider can fail without touching the core, and this only grows more
  valuable as the provider set grows.
- **A stable, narrow contract** — the seam is a file/data protocol (provider descriptor + batch +
  repo-materialized type manifests), not a code API that ossifies the core's internals once consumers
  depend on it.
- **Language freedom** — a provider can be written in any language that can produce the batch.
- **Security** — third-party acquisition code never runs in-process with the core's access to secrets
  and the filesystem.

Precedent: Terraform providers and LSP are out-of-process for exactly these reasons; eslint is
in-process only because lint rules are pure computation. The dividing line: pure computation may go
in-process; I/O and acquisition must stay out.

## The kernel stays pure

The kernel never fetches, holds secrets, or does network I/O during `check`, `prime`, or `export`. On
enabling a provider, its record and document **type manifests are materialized into the host repo**, so
records stay checkable even without the provider package installed. Acquisition, secrets, and actions
live in the provider layer outside the kernel — preserving the "facilitate, never fetch or act" thesis.

## Atomic records vs context documents

- **Atomic, lifecycle-bearing entities are records** (a sentry-issue, a fix-plan, a learning): they
  transition, relate, and resolve.
- **Cohesive narratives are context documents** (triage write-ups, meeting and knowledge syntheses):
  indexed and linked, not force-split into per-entry records. They become records only when they have
  their own lifecycle. This resolves the queryable-unit question raised in IX-TD-015.

## First proof and sequencing

- **First provider: Sentry** — mechanical (deterministic fetch and normalize, minimal judgment), so it
  stress-tests package install, network and secrets, redaction, deterministic identity, idempotent
  rerun, and the record/document split without hiding contract gaps behind agent judgment.
- **Prerequisite:** the substrate reshape through IX-SR-11 (config v2, the record-type manifest schema
  and compiler, identity strategies, generic import). Before that, only a throwaway prototype against
  the current import boundary is possible.

## Relationship to existing records

This direction reframes several deferred records; reconcile them when it is picked up.

- **IX-TD-013** (dynamic third-party plugin loading) becomes this provider-ecosystem track; the
  records-first milestone replaces the original "runtime record-type plugins" framing.
- **IX-TD-008** (more retrieval/export adapters await a real consumer) — the ecosystem is the framework
  consumers plug into; keep retrieval/export adapters a separate concern, since acquisition providers
  are not retrieval providers.
- **IX-TD-011** (cross-repo aggregation) and **IX-TD-014** (multi-user, productization) — constraints
  move toward active (global provider keys, stable refs, trust and redaction posture); the products
  stay deferred.
- **IX-TD-012** (orchestration as its own product) — provider runs are explicit edge operations, not
  schedulers inside the kernel.
- **IX-TD-015** (atomic vs narrative) — resolved as above.

When this is picked up, an ADR should lock the records-first / code-later split and the kernel
boundary.

## Not in scope today

No implementation. This is groundwork capture to revisit after the reshape stabilizes the record
kernel.
